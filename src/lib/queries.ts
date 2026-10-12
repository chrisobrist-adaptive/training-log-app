import { supabase } from "./supabaseClient";
import type { Block, Week, WeeklyMetrics, WeekEffective1Rm } from "./types";

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
