// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `yK`
// (byte offset 860411), together with its small module-level
// dependencies `pK`, `mK`, `dK`-adjacent helpers `hK`/`gK`/`_K`/`vK`
// (all inlined/renamed below) found nearby in the bundle. This is BY
// FAR the largest and most complex page in the app — the coach's
// program editor for one training block — and this translation is
// deliberately 1:1 from the minified source, including a couple of
// behaviors that look like they could be "cleaned up" but are kept
// exactly as shipped (called out inline below) since changing them
// isn't this reconstruction's job.
//
// Three things worth understanding before touching this file:
//
// 1. DEBOUNCED AUTOSAVE WITH RETRY. Every per-exercise field edit
//    (`updateExerciseField`, minified `Ee`) updates local state
//    immediately (so typing feels instant), merges the changed
//    columns into `pendingPatchesRef` (minified `P`), and resets a
//    600ms debounce timer (`debounceTimersRef`, minified `F`) for that
//    exercise id. When the timer fires, the patch is handed to a
//    sequential flush queue (`flushQueueRef` + `flushChainRef`,
//    minified `I`/`L`) so saves for different exercises never race
//    each other. `flushOne` (minified `ne`) retries a failed save up
//    to 3 times (500ms × attempt backoff) before alerting the coach
//    and forcing a full reload as a recovery path. An unmount effect
//    flushes every still-pending patch immediately so a quick edit
//    right before navigating away isn't lost.
//
// 2. WEEK REORDERING VIA A TEMPORARY NEGATIVE NUMBER. `weeks` has a
//    `unique(block_id, week_number)` constraint (inferred from this
//    code, not confirmed in the schema directly), so swapping two
//    weeks' `week_number` can't be done by writing the new values
//    straight across — the second write would collide with the first
//    week's still-unchanged number. `reorderWeek` (minified `de`)
//    works around it with three sequential writes: the moving week's
//    number goes negative (guaranteed not to collide with anything),
//    then the other week takes the moving week's original number,
//    then the moving week takes the other week's original number.
//
// 3. TWO DIFFERENT "COMES OUT TO" PREVIEW TEXT GENERATORS, LOCAL TO
//    THIS FILE. `prescribedSetPreview`/`backdownSetPreview` (minified
//    `_K`/`vK`) are NOT the same functions as AthleteDetail's
//    `plannedSetSummary` (`sessionPlayerHelpers.ts`) — confirmed two
//    separate functions in the bundle, not two callers of one. They
//    share the underlying weight-resolution logic in
//    `exerciseDefaults.ts` (`prescribedWeight`/`backdownWeight`) but
//    format their own text and warning condition here.
//
// One confirmed-exact asymmetry kept as-is, not "fixed": `loadAll`
// (minified `R`) resolves the athlete id for `fetchPlannedWeeklyMetrics`
// from the BLOCK's own `athlete_id` first, falling back to the route
// param — but `refreshPlannedMetrics` (minified `te`, called after a
// quick per-exercise save) uses the route param directly, with no
// fallback logic at all. In practice these are almost always the same
// value, so this has never been reported as a bug.
//
// Another confirmed-exact oddity: `updateDay` (minified `Se`) does NOT
// await its error-path reload (`R()` is called but not awaited) while
// every other mutating handler in this file does. Preserved as-is.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { fetchPlannedWeeklyMetrics, fetchWeekOneRms } from "../../lib/queries";
import { prescribedWeight, backdownWeight } from "../../lib/exerciseDefaults";
import type {
  Block,
  Week,
  TrainingDay,
  Exercise,
  ExerciseInventory,
  WeeklyMetrics,
  WeekEffective1Rm,
  AscendingSetEntry,
} from "../../lib/types";
import ExerciseInventoryPicker from "../../components/ExerciseInventoryPicker";
import PlannedMetricsTable from "../../components/PlannedMetricsTable";

// The three lifts that carry a per-week training max (override on
// `weeks.{lift}_1rm`, inherited/effective value from the
// `week_effective_1rm` view) — "accessory" deliberately has no row
// here, matching the minified `mK` array.
const TM_LIFTS: { lift: "squat" | "bench" | "deadlift"; label: string }[] = [
  { lift: "squat", label: "Squat" },
  { lift: "bench", label: "Bench" },
  { lift: "deadlift", label: "Deadlift" },
];

// Which `weeks` column a training-max override lives in, by lift key.
const LIFT_TM_COLUMN: Record<string, "squat_1rm" | "bench_1rm" | "deadlift_1rm"> = {
  squat: "squat_1rm",
  bench: "bench_1rm",
  deadlift: "deadlift_1rm",
};

// Human labels for the create-new-exercise-inventory error message
// (minified `pK`) — includes "accessory", unlike TM_LIFTS.
const LIFT_LABELS: Record<string, string> = {
  squat: "Squat",
  bench: "Bench",
  deadlift: "Deadlift",
  accessory: "Accessory",
};

function nextOrderIndex(items: { order_index: number }[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.order_index)) + 1;
}

function overrideTm(week: Week | null, lift: string): number | null {
  if (!week) return null;
  return lift === "squat" ? week.squat_1rm : lift === "bench" ? week.bench_1rm : week.deadlift_1rm;
}

function inheritedTm(effective: WeekEffective1Rm | null, lift: string): number | null {
  if (!effective) return null;
  return lift === "squat" ? effective.squat_1rm : lift === "bench" ? effective.bench_1rm : effective.deadlift_1rm;
}

// "COMES OUT TO" preview for the prescribed (top) sets row. Null means
// render nothing: no exercise picked yet, ascending sets are in use
// instead (they override this entirely), or neither a fixed load nor
// a %1RM has been entered. A non-null return starting with "No
// training max" is a warning, not a preview, and is styled
// differently by the caller.
function prescribedSetPreview(exercise: Exercise, oneRm: WeekEffective1Rm | null): string | null {
  if (!exercise.exercise_inventory) return null;
  if (exercise.ascending_sets != null && exercise.ascending_sets.length > 0) return null;
  if (exercise.prescribed_load_fixed == null && exercise.prescribed_load_pct == null) return null;
  const lift = exercise.exercise_inventory.lift;
  const resolvedOneRm =
    lift === "squat" ? oneRm?.squat_1rm : lift === "bench" ? oneRm?.bench_1rm : lift === "deadlift" ? oneRm?.deadlift_1rm : null;
  if (exercise.prescribed_load_fixed == null && exercise.prescribed_load_pct != null && lift !== "accessory" && resolvedOneRm == null) {
    return "No training max on file for this lift yet — set one for this week.";
  }
  const weight = prescribedWeight(exercise, oneRm);
  const reps = exercise.prescribed_reps?.trim() || "—";
  const sets = exercise.prescribed_sets ?? "—";
  const weightText = weight == null ? "—" : `${weight} kg`;
  const pctSuffix =
    exercise.prescribed_load_fixed == null && exercise.prescribed_load_pct != null ? ` (${exercise.prescribed_load_pct}% CM)` : "";
  return `${exercise.exercise_inventory.exercise_name}  ${weightText} × ${reps} × ${sets}${pctSuffix}`;
}

// Same idea for the backdown sets sub-row.
function backdownSetPreview(exercise: Exercise, oneRm: WeekEffective1Rm | null): string | null {
  if (!exercise.exercise_inventory) return null;
  if (exercise.backdown_sets == null || exercise.backdown_sets <= 0) return null;
  if (exercise.backdown_load_fixed == null && exercise.backdown_load_pct == null) return null;
  const lift = exercise.exercise_inventory.lift;
  const resolvedOneRm =
    lift === "squat" ? oneRm?.squat_1rm : lift === "bench" ? oneRm?.bench_1rm : lift === "deadlift" ? oneRm?.deadlift_1rm : null;
  if (exercise.backdown_load_fixed == null && exercise.backdown_load_pct != null && lift !== "accessory" && resolvedOneRm == null) {
    return "No training max on file for this lift yet — set one for this week.";
  }
  const weight = backdownWeight(exercise, oneRm);
  const reps = exercise.backdown_reps?.trim() || "—";
  const sets = exercise.backdown_sets ?? "—";
  const pctSuffix =
    exercise.backdown_load_fixed == null && exercise.backdown_load_pct != null ? ` (${exercise.backdown_load_pct}% CM)` : "";
  return `Backdown  ${weight == null ? "—" : `${weight} kg`} × ${reps} × ${sets}${pctSuffix}`;
}

// The full set of fields copied when a week or a day is duplicated —
// every prescribable/backdown/ascending column on `exercises`, never
// the id or the logged/actual columns.
function copyableExerciseFields(ex: Exercise) {
  return {
    order_index: ex.order_index,
    exercise_inventory_id: ex.exercise_inventory_id,
    prescribed_sets: ex.prescribed_sets,
    prescribed_reps: ex.prescribed_reps,
    prescribed_load_pct: ex.prescribed_load_pct,
    prescribed_load_fixed: ex.prescribed_load_fixed,
    prescribed_rpe: ex.prescribed_rpe,
    prescribed_rir: ex.prescribed_rir,
    backdown_sets: ex.backdown_sets,
    backdown_reps: ex.backdown_reps,
    backdown_load_pct: ex.backdown_load_pct,
    backdown_load_fixed: ex.backdown_load_fixed,
    backdown_rpe: ex.backdown_rpe,
    backdown_rir: ex.backdown_rir,
    ascending_sets: ex.ascending_sets,
    coach_cue: ex.coach_cue,
  };
}

// Sizes a textarea to its content (the athlete-cue box grows as you type).
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight + 2}px`;
}

export default function BlockBuilder() {
  const { athleteId, blockId } = useParams<{ athleteId: string; blockId: string }>();
  const navigate = useNavigate();

  const [block, setBlock] = useState<Block | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [trainingDays, setTrainingDays] = useState<TrainingDay[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [inventory, setInventory] = useState<ExerciseInventory[]>([]);
  const [plannedMetrics, setPlannedMetrics] = useState<WeeklyMetrics[]>([]);
  const [weekOneRms, setWeekOneRms] = useState<Record<string, WeekEffective1Rm>>({});
  const [savingTmWeekId, setSavingTmWeekId] = useState<string | null>(null);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  const [deletingBlock, setDeletingBlock] = useState(false);
  const [weekActionBusy, setWeekActionBusy] = useState(false);
  const [autoOpenExerciseId, setAutoOpenExerciseId] = useState<string | null>(null);
  const [backdownExerciseIds, setBackdownExerciseIds] = useState<Set<string>>(new Set());
  const [ascendingExerciseIds, setAscendingExerciseIds] = useState<Set<string>>(new Set());

  const pendingPatchesRef = useRef<Record<string, Partial<Exercise>>>({});
  const debounceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flushQueueRef = useRef<string[]>([]);
  const flushChainRef = useRef<Promise<void>>(Promise.resolve());

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const refreshPlannedMetrics = async () => {
    if (weeks.length === 0 || !athleteId) return;
    const data = await fetchPlannedWeeklyMetrics(athleteId, weeks.map((w) => w.id));
    setPlannedMetrics(data);
  };

  const flushOne = async (exerciseId: string) => {
    const patch = pendingPatchesRef.current[exerciseId];
    if (!patch) return;
    delete pendingPatchesRef.current[exerciseId];
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await supabase.from("exercises").update(patch).eq("id", exerciseId);
      if (!error) {
        refreshPlannedMetrics();
        return;
      }
      if (attempt < 3) {
        await sleep(500 * attempt);
        continue;
      }
      window.alert(`Couldn't save a change to this exercise after a few tries: ${error.message}`);
      loadAll();
    }
  };

  const enqueueFlush = (exerciseId: string): Promise<void> => {
    if (!flushQueueRef.current.includes(exerciseId)) flushQueueRef.current.push(exerciseId);
    flushChainRef.current = flushChainRef.current.then(async () => {
      while (flushQueueRef.current.length > 0) {
        const nextId = flushQueueRef.current.shift();
        if (nextId) await flushOne(nextId);
      }
    });
    return flushChainRef.current;
  };

  useEffect(
    () => () => {
      Object.values(debounceTimersRef.current).forEach(clearTimeout);
      Object.keys(pendingPatchesRef.current).forEach((id) => enqueueFlush(id));
    },
    [],
  );

  const loadAll = async () => {
    if (!blockId) return;
    const [{ data: blockData }, { data: weeksData }, { data: inventoryData }] = await Promise.all([
      supabase.from("blocks").select("*").eq("id", blockId).single(),
      supabase.from("weeks").select("*").eq("block_id", blockId).order("week_number"),
      supabase.from("exercise_inventory").select("*").order("exercise_name"),
    ]);
    if (blockData) setBlock(blockData);
    setInventory(inventoryData ?? []);
    const weeksList: Week[] = weeksData ?? [];
    setWeeks(weeksList);
    setActiveWeekId((prev) => prev ?? weeksList[0]?.id ?? null);
    if (weeksList.length === 0) {
      setPlannedMetrics([]);
      setWeekOneRms({});
      setTrainingDays([]);
      setExercises([]);
      return;
    }
    const weekIds = weeksList.map((w) => w.id);
    const effectiveAthleteId = blockData?.athlete_id ?? athleteId;
    const [plannedMetricsData, { data: trainingDaysData }, oneRmsData] = await Promise.all([
      effectiveAthleteId ? fetchPlannedWeeklyMetrics(effectiveAthleteId, weekIds) : Promise.resolve([]),
      supabase.from("training_days").select("*").in("week_id", weekIds).order("order_index"),
      fetchWeekOneRms(weekIds),
    ]);
    setPlannedMetrics(plannedMetricsData);
    setWeekOneRms(Object.fromEntries(oneRmsData.map((row) => [row.week_id, row])));
    const daysList: TrainingDay[] = trainingDaysData ?? [];
    setTrainingDays(daysList);
    if (daysList.length > 0) {
      const { data: exerciseRows } = await supabase
        .from("exercises")
        .select("*, exercise_inventory(*)")
        .in(
          "training_day_id",
          daysList.map((d) => d.id),
        )
        .order("order_index");
      const exList = (exerciseRows ?? []) as Exercise[];
      setExercises(exList);
      setBackdownExerciseIds(new Set(exList.filter((ex) => ex.backdown_sets != null).map((ex) => ex.id)));
      setAscendingExerciseIds(new Set(exList.filter((ex) => ex.ascending_sets != null && ex.ascending_sets.length > 0).map((ex) => ex.id)));
    } else {
      setExercises([]);
      setBackdownExerciseIds(new Set());
      setAscendingExerciseIds(new Set());
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockId]);

  const metricsByLift: Record<string, WeeklyMetrics> = {};
  for (const m of plannedMetrics.filter((row) => row.week_id === activeWeekId)) metricsByLift[m.lift] = m;

  const activeWeek = weeks.find((w) => w.id === activeWeekId) ?? null;
  const activeWeekOneRm = activeWeekId ? weekOneRms[activeWeekId] ?? null : null;
  const activeWeekDays = trainingDays.filter((d) => d.week_id === activeWeekId).sort((a, b) => a.order_index - b.order_index);
  const exercisesForDay = (dayId: string) => exercises.filter((ex) => ex.training_day_id === dayId).sort((a, b) => a.order_index - b.order_index);

  const addWeek = async () => {
    if (!blockId || weekActionBusy) return;
    setWeekActionBusy(true);
    const nextNumber = (weeks[weeks.length - 1]?.week_number ?? 0) + 1;
    const { data: created, error } = await supabase
      .from("weeks")
      .insert({ block_id: blockId, week_number: nextNumber, status: "not_started" })
      .select("*")
      .single();
    if (!error && created) {
      setActiveWeekId(created.id);
      await loadAll();
    }
    setWeekActionBusy(false);
  };

  const duplicateWeek = async (weekId: string) => {
    if (!blockId || weekActionBusy) return;
    setWeekActionBusy(true);
    const nextNumber = (weeks[weeks.length - 1]?.week_number ?? 0) + 1;
    const { data: created, error } = await supabase
      .from("weeks")
      .insert({ block_id: blockId, week_number: nextNumber, status: "not_started" })
      .select("*")
      .single();
    if (error || !created) {
      setWeekActionBusy(false);
      return;
    }
    const sourceDays = trainingDays.filter((d) => d.week_id === weekId).sort((a, b) => a.order_index - b.order_index);
    for (const day of sourceDays) {
      const { data: newDay } = await supabase
        .from("training_days")
        .insert({ week_id: created.id, day_label: day.day_label, order_index: day.order_index, weekday: day.weekday })
        .select("*")
        .single();
      if (!newDay) continue;
      const sourceExercises = exercisesForDay(day.id);
      if (sourceExercises.length > 0) {
        await supabase
          .from("exercises")
          .insert(sourceExercises.map((ex) => ({ training_day_id: newDay.id, ...copyableExerciseFields(ex) })));
      }
    }
    setActiveWeekId(created.id);
    await loadAll();
    setWeekActionBusy(false);
  };

  const reorderWeek = async (weekId: string, direction: "earlier" | "later") => {
    if (weekActionBusy) return;
    const currentIndex = weeks.findIndex((w) => w.id === weekId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "earlier" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= weeks.length) return;
    setWeekActionBusy(true);
    const current = weeks[currentIndex];
    const target = weeks[targetIndex];
    setWeeks((prev) =>
      prev
        .map((w) => (w.id === current.id ? { ...w, week_number: target.week_number } : w.id === target.id ? { ...w, week_number: current.week_number } : w))
        .sort((a, b) => a.week_number - b.week_number),
    );
    // Temporary negative number avoids colliding with `target`'s still-
    // unchanged week_number under the unique(block_id, week_number)
    // constraint — see the file header.
    const { error: e1 } = await supabase.from("weeks").update({ week_number: -current.week_number }).eq("id", current.id);
    if (e1) {
      window.alert(`Couldn't reorder: ${e1.message}`);
      await loadAll();
      setWeekActionBusy(false);
      return;
    }
    const { error: e2 } = await supabase.from("weeks").update({ week_number: current.week_number }).eq("id", target.id);
    if (e2) {
      window.alert(`Couldn't reorder: ${e2.message}`);
      await loadAll();
      setWeekActionBusy(false);
      return;
    }
    const { error: e3 } = await supabase.from("weeks").update({ week_number: target.week_number }).eq("id", current.id);
    if (e3) window.alert(`Couldn't reorder: ${e3.message}`);
    await loadAll();
    setWeekActionBusy(false);
  };

  const deleteWeek = async (week: Week) => {
    if (weekActionBusy) return;
    if (!window.confirm(`Delete Week ${week.week_number}? This also deletes all its days, exercises and logged data. This can't be undone.`)) return;
    setWeekActionBusy(true);
    await supabase.from("weeks").delete().eq("id", week.id);
    if (activeWeekId === week.id) setActiveWeekId(null);
    await loadAll();
    setWeekActionBusy(false);
  };

  const setTrainingMax = async (weekId: string, lift: string, value: number | null) => {
    setSavingTmWeekId(weekId);
    const { error } = await supabase.from("weeks").update({ [LIFT_TM_COLUMN[lift]]: value }).eq("id", weekId);
    if (error) window.alert(`Couldn't save that training max: ${error.message}`);
    else await loadAll();
    setSavingTmWeekId(null);
  };

  const renameBlock = async (name: string) => {
    if (!blockId || !block || name === block.name) return;
    setBlock({ ...block, name });
    const { error } = await supabase.from("blocks").update({ name }).eq("id", blockId);
    if (error) window.alert(`Couldn't rename this block: ${error.message}`);
  };

  const deleteBlock = async () => {
    if (!blockId || !athleteId || !block) return;
    if (!window.confirm(`Delete "${block.name}"? This also deletes every week, day, exercise and logged data in it. This can't be undone.`)) return;
    setDeletingBlock(true);
    const { error } = await supabase.from("blocks").delete().eq("id", blockId);
    setDeletingBlock(false);
    if (error) {
      window.alert(`Couldn't delete this block: ${error.message}`);
      return;
    }
    navigate(`/athletes/${athleteId}`, { replace: true });
  };

  const addDay = async (weekId: string) => {
    const daysInWeek = trainingDays.filter((d) => d.week_id === weekId);
    await supabase.from("training_days").insert({ week_id: weekId, day_label: `Day ${daysInWeek.length + 1}`, order_index: nextOrderIndex(daysInWeek) });
    await loadAll();
  };

  const duplicateDay = async (day: TrainingDay) => {
    const daysInWeek = trainingDays.filter((d) => d.week_id === day.week_id);
    const { data: newDay } = await supabase
      .from("training_days")
      .insert({ week_id: day.week_id, day_label: `${day.day_label} copy`, order_index: nextOrderIndex(daysInWeek), weekday: day.weekday })
      .select("*")
      .single();
    if (!newDay) return;
    const sourceExercises = exercisesForDay(day.id);
    if (sourceExercises.length > 0) {
      await supabase.from("exercises").insert(sourceExercises.map((ex) => ({ training_day_id: newDay.id, ...copyableExerciseFields(ex) })));
    }
    await loadAll();
  };

  const reindexOrder = async (table: "training_days" | "exercises", items: { id: string; order_index: number }[]) => {
    const sorted = items.slice().sort((a, b) => a.order_index - b.order_index);
    const changes = sorted.map((item, index) => ({ id: item.id, order_index: index })).filter((change, index) => sorted[index].order_index !== change.order_index);
    if (changes.length === 0) return;
    await Promise.all(changes.map((change) => supabase.from(table).update({ order_index: change.order_index }).eq("id", change.id)));
  };

  const deleteDay = async (dayId: string) => {
    const day = trainingDays.find((d) => d.id === dayId);
    await supabase.from("training_days").delete().eq("id", dayId);
    if (day) await reindexOrder("training_days", trainingDays.filter((d) => d.week_id === day.week_id && d.id !== dayId));
    await loadAll();
  };

  const updateDay = async (dayId: string, patch: Partial<TrainingDay>) => {
    setTrainingDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)));
    const { error } = await supabase.from("training_days").update(patch).eq("id", dayId);
    if (error) {
      window.alert(`Couldn't save that change: ${error.message}`);
      // Confirmed-exact: not awaited in the source — see file header.
      loadAll();
    }
  };

  const addExercise = async (dayId: string) => {
    const { data: created, error } = await supabase
      .from("exercises")
      .insert({ training_day_id: dayId, order_index: nextOrderIndex(exercisesForDay(dayId)), exercise_inventory_id: null, prescribed_sets: 3, prescribed_reps: "5" })
      .select("*, exercise_inventory(*)")
      .single();
    if (error || !created) {
      window.alert(`Couldn't add exercise: ${error?.message ?? "unknown error"}`);
      return;
    }
    setExercises((prev) => [...prev, created as Exercise]);
    setAutoOpenExerciseId((created as Exercise).id);
  };

  const reorderExercise = async (dayId: string, exerciseId: string, direction: "up" | "down") => {
    const dayExercises = exercisesForDay(dayId);
    const currentIndex = dayExercises.findIndex((ex) => ex.id === exerciseId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= dayExercises.length) return;
    const current = dayExercises[currentIndex];
    const target = dayExercises[targetIndex];
    setExercises((prev) =>
      prev.map((ex) => (ex.id === current.id ? { ...ex, order_index: target.order_index } : ex.id === target.id ? { ...ex, order_index: current.order_index } : ex)),
    );
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from("exercises").update({ order_index: target.order_index }).eq("id", current.id),
      supabase.from("exercises").update({ order_index: current.order_index }).eq("id", target.id),
    ]);
    if (e1 || e2) {
      window.alert(`Couldn't reorder: ${(e1 ?? e2)?.message}`);
      await loadAll();
    }
  };

  const removeExercise = async (exerciseId: string) => {
    if (debounceTimersRef.current[exerciseId]) clearTimeout(debounceTimersRef.current[exerciseId]);
    delete debounceTimersRef.current[exerciseId];
    delete pendingPatchesRef.current[exerciseId];
    const dayId = exercises.find((ex) => ex.id === exerciseId)?.training_day_id;
    const { error } = await supabase.from("exercises").delete().eq("id", exerciseId);
    if (error) {
      window.alert(`Couldn't remove exercise: ${error.message}`);
      return;
    }
    if (dayId) await reindexOrder("exercises", exercises.filter((ex) => ex.training_day_id === dayId && ex.id !== exerciseId));
    setExercises((prev) => prev.filter((ex) => ex.id !== exerciseId));
    setBackdownExerciseIds((prev) => {
      if (!prev.has(exerciseId)) return prev;
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    setAscendingExerciseIds((prev) => {
      if (!prev.has(exerciseId)) return prev;
      const next = new Set(prev);
      next.delete(exerciseId);
      return next;
    });
    refreshPlannedMetrics();
  };

  // The debounced-autosave entry point every field input calls. Updates
  // local state immediately; `exercise_inventory` is stripped from the
  // patch before persisting since it's a joined/computed field, not a
  // real column on `exercises` — see file header, point 1.
  const updateExerciseField = (exerciseId: string, patch: Partial<Exercise>) => {
    setExercises((prev) => prev.map((ex) => (ex.id === exerciseId ? { ...ex, ...patch } : ex)));
    const { exercise_inventory, ...columnPatch } = patch;
    if (Object.keys(columnPatch).length !== 0) {
      pendingPatchesRef.current[exerciseId] = { ...pendingPatchesRef.current[exerciseId], ...columnPatch };
      if (debounceTimersRef.current[exerciseId]) clearTimeout(debounceTimersRef.current[exerciseId]);
      debounceTimersRef.current[exerciseId] = setTimeout(() => {
        delete debounceTimersRef.current[exerciseId];
        enqueueFlush(exerciseId);
      }, 600);
    }
  };

  const createExerciseInventoryItem = async (exerciseId: string, name: string, categoryKey: string) => {
    const { data: userData } = await supabase.auth.getUser();
    const { data: created, error } = await supabase
      .from("exercise_inventory")
      .insert({ coach_id: userData.user?.id, exercise_name: name, lift: categoryKey })
      .select("*")
      .single();
    if (error || !created) {
      const { data: existing } = await supabase.from("exercise_inventory").select("*").eq("exercise_name", name).maybeSingle();
      if (existing && existing.lift === categoryKey) {
        setInventory((prev) => (prev.some((e) => e.id === existing.id) ? prev : [...prev, existing]));
        updateExerciseField(exerciseId, { exercise_inventory_id: existing.id, exercise_inventory: existing });
      } else if (existing) {
        const existingLabel = LIFT_LABELS[existing.lift] ?? existing.lift;
        const requestedLabel = LIFT_LABELS[categoryKey] ?? categoryKey;
        window.alert(
          `You already have "${name}" saved as ${existingLabel}, so it can't also be added as ${requestedLabel} — exercise names have to be unique. If ${existingLabel} was a mistake, pick it from the search results above and use the "Retag as…" option to change it in place, or use a different name for a separate ${requestedLabel} version.`,
        );
      } else {
        window.alert(`Couldn't add "${name}": ${error?.message ?? "unknown error"}`);
      }
      return;
    }
    setInventory((prev) => [...prev, created]);
    updateExerciseField(exerciseId, { exercise_inventory_id: created.id, exercise_inventory: created });
  };

  const retagExerciseInventoryItem = async (item: ExerciseInventory, categoryKey: string) => {
    const previousLift = item.lift;
    const updated: ExerciseInventory = { ...item, lift: categoryKey };
    setInventory((prev) => prev.map((e) => (e.id === item.id ? updated : e)));
    setExercises((prev) => prev.map((ex) => (ex.exercise_inventory_id === item.id ? { ...ex, exercise_inventory: updated } : ex)));
    const { error } = await supabase.from("exercise_inventory").update({ lift: categoryKey }).eq("id", item.id);
    if (error) {
      window.alert(`Couldn't retag "${item.exercise_name}": ${error.message}`);
      setInventory((prev) => prev.map((e) => (e.id === item.id ? { ...e, lift: previousLift } : e)));
      setExercises((prev) =>
        prev.map((ex) => (ex.exercise_inventory_id === item.id ? { ...ex, exercise_inventory: { ...item, lift: previousLift } } : ex)),
      );
    }
  };

  if (!block) return <p className="muted">Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <input
            key={block.id}
            defaultValue={block.name}
            className="day-title-input"
            aria-label="Block name"
            style={{ fontSize: "1.5rem", maxWidth: "320px" }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) renameBlock(v);
              else e.target.value = block.name;
            }}
          />
          <span className={`badge badge-${block.status}`}>{block.status}</span>
        </div>
        <div className="toolbar">
          <Link to={`/athletes/${athleteId}`} className="secondary-button">
            ← Back to athlete
          </Link>
          {block.status !== "deployed" && (
            <button
              className="primary-button"
              onClick={async () => {
                if (!blockId) return;
                setDeploying(true);
                const pendingIds = Object.keys(debounceTimersRef.current);
                pendingIds.forEach((id) => {
                  clearTimeout(debounceTimersRef.current[id]);
                  delete debounceTimersRef.current[id];
                });
                await Promise.all(pendingIds.map((id) => enqueueFlush(id)));
                await supabase.from("blocks").update({ status: "deployed", deployed_at: new Date().toISOString() }).eq("id", blockId);
                setDeploying(false);
                loadAll();
              }}
              disabled={deploying}
            >
              {deploying ? "Deploying…" : "Deploy block to athlete"}
            </button>
          )}
          <button className="danger-button" onClick={deleteBlock} disabled={deletingBlock}>
            {deletingBlock ? "Deleting…" : "Delete block"}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="page-header" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Weeks</h2>
          <button className="secondary-button" onClick={addWeek} disabled={weekActionBusy}>
            + Add week
          </button>
        </div>
        <div className="week-tabs">
          {weeks.map((w) => (
            <button key={w.id} className={activeWeekId === w.id ? "active" : ""} onClick={() => setActiveWeekId(w.id)} type="button">
              Week {w.week_number}
            </button>
          ))}
        </div>

        {activeWeekId && (
          <>
            <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.85rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Training max — this week
            </h3>
            <div className="toolbar" style={{ marginBottom: "1.25rem", alignItems: "flex-end" }}>
              {TM_LIFTS.map(({ lift, label }) => {
                const override = overrideTm(activeWeek, lift);
                const inherited = inheritedTm(activeWeekOneRm, lift);
                const saving = savingTmWeekId === activeWeekId;
                return (
                  <label key={lift} style={{ marginBottom: 0 }}>
                    {label}
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <input
                        key={`${activeWeekId}-${lift}-${override ?? "inherit"}`}
                        type="number"
                        defaultValue={override ?? ""}
                        placeholder={inherited == null ? "—" : `${inherited} (inherited)`}
                        disabled={saving}
                        style={{ width: "9rem" }}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const parsed = raw === "" ? null : Number(raw);
                          if (parsed === override || (Number.isNaN(parsed) && override == null)) return;
                          setTrainingMax(activeWeekId, lift, Number.isNaN(parsed as number) ? null : parsed);
                        }}
                      />
                      {override != null && (
                        <button
                          type="button"
                          className="secondary-button"
                          title="Clear override — inherit instead"
                          disabled={saving}
                          onClick={() => setTrainingMax(activeWeekId, lift, null)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>

            <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.85rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.02em" }}>
              Week summary — all lifts
            </h3>
            <div style={{ marginBottom: "1.25rem" }}>
              <PlannedMetricsTable metricsByLift={metricsByLift} />
            </div>

            <div className="toolbar" style={{ marginBottom: "1rem" }}>
              <button className="secondary-button" onClick={() => addDay(activeWeekId)}>
                + Add day
              </button>
              <button className="secondary-button" onClick={() => duplicateWeek(activeWeekId)} disabled={weekActionBusy}>
                Duplicate this week
              </button>
              <button
                className="secondary-button"
                title="Move this week earlier"
                onClick={() => reorderWeek(activeWeekId, "earlier")}
                disabled={weekActionBusy || weeks.findIndex((w) => w.id === activeWeekId) === 0}
              >
                ← Move earlier
              </button>
              <button
                className="secondary-button"
                title="Move this week later"
                onClick={() => reorderWeek(activeWeekId, "later")}
                disabled={weekActionBusy || weeks.findIndex((w) => w.id === activeWeekId) === weeks.length - 1}
              >
                Move later →
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  const w = weeks.find((w) => w.id === activeWeekId);
                  if (w) deleteWeek(w);
                }}
                disabled={weekActionBusy}
              >
                Delete this week
              </button>
            </div>

            {activeWeekDays.length === 0 && <p className="muted">No days yet — add one to start programming.</p>}

            {activeWeekDays.map((day) => (
              <div key={day.id} className="day-block">
                <div className="day-block-header">
                  <input
                    key={day.id}
                    defaultValue={day.day_label}
                    className="day-title-input"
                    aria-label="Session title"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== day.day_label) updateDay(day.id, { day_label: v });
                      else e.target.value = day.day_label;
                    }}
                  />
                  <select
                    value={day.weekday ?? ""}
                    onChange={(e) => updateDay(day.id, { weekday: e.target.value === "" ? null : Number(e.target.value) })}
                    style={{ width: "auto", fontSize: "0.82rem" }}
                    title="Pin this session to a weekday so it shows up on the athlete's calendar strip"
                  >
                    <option value="">No weekday</option>
                    <option value="0">Monday</option>
                    <option value="1">Tuesday</option>
                    <option value="2">Wednesday</option>
                    <option value="3">Thursday</option>
                    <option value="4">Friday</option>
                    <option value="5">Saturday</option>
                    <option value="6">Sunday</option>
                  </select>
                  <div className="toolbar">
                    <button className="secondary-button" onClick={() => duplicateDay(day)}>
                      Duplicate day
                    </button>
                    <button className="danger-button" onClick={() => deleteDay(day.id)}>
                      Remove day
                    </button>
                  </div>
                </div>

                <div className="exercise-row" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  <span>Exercise</span>
                  <span>Sets</span>
                  <span>Reps</span>
                  <span>Load % 1RM</span>
                  <span>Load (fixed)</span>
                  <span>RPE</span>
                  <span>RIR</span>
                  <span></span>
                </div>

                {exercisesForDay(day.id).map((ex, idx, dayExercises) => {
                  const preview = prescribedSetPreview(ex, activeWeekOneRm);
                  const isWarning = preview?.startsWith("No training max") ?? false;
                  return (
                    <div key={ex.id}>
                      {preview && (
                        <div style={{ fontSize: "0.8rem", color: isWarning ? "var(--warn)" : "var(--good)", padding: "0 0.1rem", margin: "0 0 0.3rem" }}>
                          {!isWarning && <span style={{ color: "var(--muted)" }}>COMES OUT TO: </span>}
                          {preview}
                        </div>
                      )}
                      <div className="exercise-row">
                        <ExerciseInventoryPicker
                          key={ex.id}
                          inventory={inventory}
                          selectedId={ex.exercise_inventory_id}
                          onSelect={(id) => {
                            const item = inventory.find((e) => e.id === id);
                            updateExerciseField(ex.id, { exercise_inventory_id: id, exercise_inventory: item ?? null });
                            setAutoOpenExerciseId(null);
                          }}
                          onCreateNew={(name, categoryKey) => {
                            setAutoOpenExerciseId(null);
                            return createExerciseInventoryItem(ex.id, name, categoryKey);
                          }}
                          onRetagExisting={(item, categoryKey) => {
                            setAutoOpenExerciseId(null);
                            return retagExerciseInventoryItem(item, categoryKey);
                          }}
                          autoOpen={ex.id === autoOpenExerciseId}
                        />
                        <input
                          type="number"
                          value={ex.prescribed_sets ?? ""}
                          disabled={ascendingExerciseIds.has(ex.id)}
                          title={ascendingExerciseIds.has(ex.id) ? "Superseded by the ascending sets below" : undefined}
                          onChange={(e) => updateExerciseField(ex.id, { prescribed_sets: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <input
                          value={ex.prescribed_reps ?? ""}
                          placeholder="e.g. 5, 8-10, AMRAP"
                          disabled={ascendingExerciseIds.has(ex.id)}
                          title={ascendingExerciseIds.has(ex.id) ? "Superseded by the ascending sets below" : undefined}
                          onChange={(e) => updateExerciseField(ex.id, { prescribed_reps: e.target.value })}
                        />
                        <input
                          type="number"
                          value={ex.prescribed_load_pct ?? ""}
                          disabled={ascendingExerciseIds.has(ex.id)}
                          title={ascendingExerciseIds.has(ex.id) ? "Superseded by the ascending sets below" : undefined}
                          onChange={(e) => updateExerciseField(ex.id, { prescribed_load_pct: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          value={ex.prescribed_load_fixed ?? ""}
                          disabled={ascendingExerciseIds.has(ex.id)}
                          title={ascendingExerciseIds.has(ex.id) ? "Superseded by the ascending sets below" : undefined}
                          onChange={(e) => updateExerciseField(ex.id, { prescribed_load_fixed: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          value={ex.prescribed_rpe ?? ""}
                          onChange={(e) => updateExerciseField(ex.id, { prescribed_rpe: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          value={ex.prescribed_rir ?? ""}
                          onChange={(e) => updateExerciseField(ex.id, { prescribed_rir: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                        <div className="toolbar" style={{ flexWrap: "nowrap", gap: "0.25rem" }}>
                          <button type="button" className="secondary-button" title="Move up" onClick={() => reorderExercise(day.id, ex.id, "up")} disabled={idx === 0}>
                            ↑
                          </button>
                          <button
                            type="button"
                            className="secondary-button"
                            title="Move down"
                            onClick={() => reorderExercise(day.id, ex.id, "down")}
                            disabled={idx === dayExercises.length - 1}
                          >
                            ↓
                          </button>
                          <button className="danger-button" onClick={() => removeExercise(ex.id)}>
                            ✕
                          </button>
                        </div>
                      </div>

                      {ascendingExerciseIds.has(ex.id) ? (
                        <div style={{ margin: "0 0 0.6rem", padding: "0.5rem 0.6rem", background: "var(--surface-alt, rgba(255,255,255,0.03))", borderRadius: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                            <span className="muted" style={{ fontSize: "0.8rem" }}>
                              ↳ Ascending sets — exact weight &amp; reps per set
                            </span>
                            <button
                              type="button"
                              className="link-button"
                              onClick={() => {
                                updateExerciseField(ex.id, { ascending_sets: null });
                                setAscendingExerciseIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(ex.id);
                                  return next;
                                });
                              }}
                            >
                              Remove ascending sets
                            </button>
                          </div>
                          {(ex.ascending_sets ?? []).map((set: AscendingSetEntry, setIdx: number) => (
                            <div key={setIdx} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
                              <span className="muted" style={{ fontSize: "0.8rem", width: "3.2rem" }}>
                                Set {setIdx + 1}
                              </span>
                              <input
                                type="number"
                                placeholder="Weight"
                                style={{ width: "6rem" }}
                                value={set.weight ?? ""}
                                onChange={(e) => {
                                  const rows = ex.ascending_sets ?? [];
                                  const v = e.target.value === "" ? null : Number(e.target.value);
                                  updateExerciseField(ex.id, { ascending_sets: rows.map((r, i) => (i === setIdx ? { ...r, weight: v } : r)) });
                                }}
                              />
                              <input
                                type="number"
                                placeholder="Reps"
                                style={{ width: "5rem" }}
                                value={set.reps ?? ""}
                                onChange={(e) => {
                                  const rows = ex.ascending_sets ?? [];
                                  const v = e.target.value === "" ? null : Number(e.target.value);
                                  updateExerciseField(ex.id, { ascending_sets: rows.map((r, i) => (i === setIdx ? { ...r, reps: v } : r)) });
                                }}
                              />
                              <button
                                type="button"
                                className="danger-button"
                                title="Remove this set"
                                onClick={() => {
                                  const rows = ex.ascending_sets ?? [];
                                  if (rows.length <= 1) {
                                    updateExerciseField(ex.id, { ascending_sets: null });
                                    setAscendingExerciseIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(ex.id);
                                      return next;
                                    });
                                    return;
                                  }
                                  updateExerciseField(ex.id, { ascending_sets: rows.filter((_r, i) => i !== setIdx) });
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => updateExerciseField(ex.id, { ascending_sets: [...(ex.ascending_sets ?? []), { weight: null, reps: null }] })}
                          >
                            + Add set
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="link-button"
                          style={{ fontSize: "0.8rem", margin: "0 0 0.4rem" }}
                          onClick={() => {
                            updateExerciseField(ex.id, { ascending_sets: [{ weight: null, reps: null }] });
                            setAscendingExerciseIds((prev) => new Set(prev).add(ex.id));
                          }}
                        >
                          + Add ascending sets
                        </button>
                      )}

                      {backdownExerciseIds.has(ex.id) ? (
                        <>
                          {(() => {
                            const preview2 = backdownSetPreview(ex, activeWeekOneRm);
                            if (!preview2) return null;
                            const isWarning2 = preview2.startsWith("No training max");
                            return (
                              <div style={{ fontSize: "0.8rem", color: isWarning2 ? "var(--warn)" : "var(--good)", padding: "0 0.1rem", margin: "0 0 0.3rem" }}>
                                {!isWarning2 && <span style={{ color: "var(--muted)" }}>COMES OUT TO: </span>}
                                {preview2}
                              </div>
                            );
                          })()}
                          <div className="exercise-row">
                            <span className="muted" style={{ fontSize: "0.8rem" }}>
                              ↳ Backdown sets
                            </span>
                            <input
                              type="number"
                              value={ex.backdown_sets ?? ""}
                              onChange={(e) => updateExerciseField(ex.id, { backdown_sets: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                            <input
                              value={ex.backdown_reps ?? ""}
                              placeholder="e.g. 5, 8-10, AMRAP"
                              onChange={(e) => updateExerciseField(ex.id, { backdown_reps: e.target.value })}
                            />
                            <input
                              type="number"
                              value={ex.backdown_load_pct ?? ""}
                              onChange={(e) => updateExerciseField(ex.id, { backdown_load_pct: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                            <input
                              type="number"
                              value={ex.backdown_load_fixed ?? ""}
                              onChange={(e) => updateExerciseField(ex.id, { backdown_load_fixed: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                            <input
                              type="number"
                              value={ex.backdown_rpe ?? ""}
                              onChange={(e) => updateExerciseField(ex.id, { backdown_rpe: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                            <input
                              type="number"
                              value={ex.backdown_rir ?? ""}
                              onChange={(e) => updateExerciseField(ex.id, { backdown_rir: e.target.value === "" ? null : Number(e.target.value) })}
                            />
                            <button
                              className="danger-button"
                              title="Remove backdown sets"
                              style={{ justifySelf: "start" }}
                              onClick={() => {
                                updateExerciseField(ex.id, {
                                  backdown_sets: null,
                                  backdown_reps: null,
                                  backdown_load_pct: null,
                                  backdown_load_fixed: null,
                                  backdown_rpe: null,
                                  backdown_rir: null,
                                });
                                setBackdownExerciseIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(ex.id);
                                  return next;
                                });
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="link-button"
                          style={{ fontSize: "0.8rem", margin: "0 0 0.4rem" }}
                          onClick={() => {
                            updateExerciseField(ex.id, { backdown_sets: 1 });
                            setBackdownExerciseIds((prev) => new Set(prev).add(ex.id));
                          }}
                        >
                          + Add backdown sets
                        </button>
                      )}
                      {/* Shown to the athlete in a "Cues" card above this exercise in their log. */}
                      <textarea
                        className="exercise-cue-input"
                        rows={1}
                        ref={autoGrow}
                        value={ex.coach_cue ?? ""}
                        onChange={(e) => {
                          autoGrow(e.target);
                          updateExerciseField(ex.id, { coach_cue: e.target.value || null });
                        }}
                        placeholder="Cue for athlete (optional), e.g. brace before the descent"
                        aria-label="Cue for athlete"
                      />
                    </div>
                  );
                })}

                <button className="secondary-button" style={{ marginTop: "0.5rem" }} onClick={() => addExercise(day.id)}>
                  + Add exercise
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
