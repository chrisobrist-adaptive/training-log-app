import { supabase } from "./supabaseClient";
import type { Block, Week, WeeklyMetrics, WeekEffective1Rm } from "./types";
import type { RpeChartLog } from "./rpeChart";

export interface WeekWithBlock extends Week {
  block: Pick<Block, "id" | "name" | "type" | "order_index" | "status">;
}

// All of an athlete's weeks, in program order (block order_index, then week_number) —
// this is the same ordering the database trigger uses for ACWR / % change / sequencing.
export async function fetchAthleteWeekSequence(athleteId: string): Promise<WeekWithBlock[]> {
  const { data: blocks, error: blocksError } = await supabase
    .from("blocks")
    .select("id, name, type, order_index, status")
    .eq("athlete_id", athleteId)
    .order("order_index");
  if (blocksError || !blocks) return [];

  const { data: weeks, error: weeksError } = await supabase
    .from("weeks")
    .select("*")
    .in(
      "block_id",
      blocks.map((b) => b.id),
    )
    .order("week_number");
  if (weeksError || !weeks) return [];

  const blockById = new Map(blocks.map((b) => [b.id, b]));
  return (weeks as Week[])
    .map((w) => ({ ...w, block: blockById.get(w.block_id)! }))
    .filter((w) => w.block)
    .sort((a, b) => a.block.order_index - b.block.order_index || a.week_number - b.week_number);
}

// The training max actually in effect for each of the given weeks, resolved
// via the week_effective_1rm view (per-week override, else the most recent
// earlier week's override, else the athlete's profile value). This is what
// every prescription preview/pre-fill should resolve against — see
// resolvedLoad/resolvedBackdownLoad in prescription.ts.
export async function fetchWeekOneRms(weekIds: string[]): Promise<WeekEffective1Rm[]> {
  if (weekIds.length === 0) return [];
  const { data, error } = await supabase.from("week_effective_1rm").select("week_id, squat_1rm, bench_1rm, deadlift_1rm").in("week_id", weekIds);
  if (error || !data) return [];
  return data as WeekEffective1Rm[];
}

// Alias: TrainingLog.tsx (the athlete view) imports this name specifically.
// Same function, same query — kept as a separate export rather than
// renaming the original, since fetchWeekOneRms is also called elsewhere.
export const loadOneRmsForWeeks = fetchWeekOneRms;

export async function fetchWeeklyMetrics(weekIds: string[]): Promise<WeeklyMetrics[]> {
  if (weekIds.length === 0) return [];
  const { data, error } = await supabase.from("weekly_metrics").select("*").in("week_id", weekIds);
  if (error || !data) return [];
  return data as WeeklyMetrics[];
}

// Same shape as fetchWeeklyMetrics, but always computed from the prescribed
// program — never from logged sets — via the get_planned_week_metrics DB
// function (a read-only sibling of the recalc_week_metrics trigger). Use
// this wherever the point is to show the plan itself (the program builder),
// as opposed to fetchWeeklyMetrics's "what actually happened, falling back
// to the plan" view (the athlete/coach dashboards). The RPC returns rows for
// the athlete's whole week sequence at once (it needs the full history for
// week-over-week % change and ACWR), so this fetches everything and filters
// to the ids the caller asked for; the row shape it returns has no id/
// updated_at (there's no underlying table row), so those are synthesized.
export async function fetchPlannedWeeklyMetrics(athleteId: string, weekIds?: string[]): Promise<WeeklyMetrics[]> {
  const { data, error } = await supabase.rpc("get_planned_week_metrics", { p_athlete_id: athleteId });
  if (error || !data) return [];
  const wanted = weekIds ? new Set(weekIds) : null;
  return (data as Omit<WeeklyMetrics, "id" | "updated_at">[])
    .filter((m) => !wanted || wanted.has(m.week_id))
    .map((m) => ({ ...m, id: `${m.week_id}:${m.lift}`, updated_at: "" }));
}

// Every logged set with velocity recorded, for one athlete, across their whole
// history — joined up to the exercise name and the training day's completion
// date (filtered to the athlete through exercise → day → week → block).
export interface VelocityRow {
  velocity_fast: number | null;
  velocity_slow: number | null;
  created_at: string;
  exercise_inventory_id: string | null;
  exercise_name: string | null;
  day_completed_at: string | null;
}

export async function fetchVelocityHistory(athleteId: string): Promise<VelocityRow[]> {
  // The generated types don't include table relationships, so the nested
  // select/filter below is untyped; the response shape is mapped by hand.
  const { data, error } = await supabase
    .from("logged_sets")
    .select(
      "velocity_fast, velocity_slow, created_at, exercises!inner(exercise_inventory_id, exercise_inventory(exercise_name), training_days!inner(completed_at, weeks!inner(blocks!inner(athlete_id))))",
    )
    .eq("exercises.training_days.weeks.blocks.athlete_id" as "id", athleteId)
    .or("velocity_fast.not.is.null,velocity_slow.not.is.null");
  if (error || !data) return [];
  type Raw = {
    velocity_fast: number | null;
    velocity_slow: number | null;
    created_at: string;
    exercises: {
      exercise_inventory_id: string | null;
      exercise_inventory: { exercise_name: string } | null;
      training_days: { completed_at: string | null };
    };
  };
  return (data as unknown as Raw[]).map((r) => ({
    velocity_fast: r.velocity_fast,
    velocity_slow: r.velocity_slow,
    created_at: r.created_at,
    exercise_inventory_id: r.exercises.exercise_inventory_id,
    exercise_name: r.exercises.exercise_inventory?.exercise_name ?? null,
    day_completed_at: r.exercises.training_days.completed_at,
  }));
}

// The athlete's personalised RPE-chart cells (last-5 averages); cells they
// haven't logged come from the default chart in lib/rpeChart.ts.
export async function fetchRpeChartLogs(athleteId: string): Promise<RpeChartLog[]> {
  const { data, error } = await supabase.rpc("get_rpe_chart_logs", { p_athlete_id: athleteId });
  if (error || !data) return [];
  // numeric columns can arrive as strings — normalise.
  return (data as RpeChartLog[]).map((r) => ({ ...r, rpe: Number(r.rpe), pct: Number(r.pct) }));
}
