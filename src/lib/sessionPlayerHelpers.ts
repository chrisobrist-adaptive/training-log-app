// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js). Eight small text/boolean
// helpers that both SessionPlayer.tsx (athlete logging view) and
// AthleteDetail.tsx (coach's read-only session log) need, gathered
// into one file because that's how the live bundle has them — all
// eight sit within a few hundred bytes of each other, byte offsets
// 845822–846224 (`cK`/`lK`) and 909129–911034 (`tq`/`nq`/`rq`/`iq`/
// `aq`, plus `formatRestTime`/`BK` nearby at 895416).
//
// Two near-duplicate pairs are worth calling out so they don't get
// collapsed into one function by mistake — confirmed as genuinely
// separate functions in the bundle, not two callers of one:
// - `plannedSetSummary` (`cK`, AthleteDetail's planned-vs-logged text)
//   and `setSummaryText` (`iq`, SessionPlayer's preview-list text) do
//   almost the same weight/reps resolution but `setSummaryText` also
//   appends "RPE N" and joins with " · " instead of concatenating
//   straight through.
// - `prescribedSummary`/`backdownSummary` (`tq`/`nq`, SessionPlayer's
//   OWN top-of-card summary) never resolve a weight at all — no
//   training max involved, just the raw sets/reps/%/fixed/RPE fields
//   as typed in. Don't "fix" this to match `setSummaryText` — it's
//   deliberately the bare prescription, not the computed one.

import type { Exercise, LoggedSet } from "./types";
import { prescribedWeight, backdownWeight, type OneRms } from "./exerciseDefaults";

// SessionPlayer's station-card summary line ("3 sets x 5 @ 80% RPE 8") —
// the raw prescription as typed in, with no weight resolved.
export function prescribedSummary(exercise: Exercise): string {
  const ascending = exercise.ascending_sets && exercise.ascending_sets.length > 0 ? exercise.ascending_sets : null;
  if (ascending) {
    return ascending.map((s) => `${s.weight ?? "—"}${s.reps ? ` x ${s.reps}` : ""}`).join(", ");
  }
  return [
    exercise.prescribed_sets ? `${exercise.prescribed_sets} set${exercise.prescribed_sets === 1 ? "" : "s"}` : null,
    exercise.prescribed_reps ? `x ${exercise.prescribed_reps}` : null,
    exercise.prescribed_load_pct ? `@ ${exercise.prescribed_load_pct}%` : null,
    exercise.prescribed_load_fixed ? `@ ${exercise.prescribed_load_fixed}` : null,
    exercise.prescribed_rpe ? `RPE ${exercise.prescribed_rpe}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// Same idea for the backdown note shown above SessionPlayer's backdown
// table. Empty string (not null) when there are no backdown sets.
export function backdownSummary(exercise: Exercise): string {
  const sets = exercise.backdown_sets ?? 0;
  if (sets === 0) return "";
  return [
    `${sets} set${sets === 1 ? "" : "s"}`,
    exercise.backdown_reps ? `x ${exercise.backdown_reps}` : null,
    exercise.backdown_load_pct ? `@ ${exercise.backdown_load_pct}%` : null,
    exercise.backdown_load_fixed ? `@ ${exercise.backdown_load_fixed}` : null,
    exercise.backdown_rpe ? `RPE ${exercise.backdown_rpe}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

// Whether every prescribed set (main + backdown) has a logged row that
// isn't skipped/pending and is either marked completed or has an RPE —
// confirmed-exact: a skipped set makes this false, same as a missing one.
export function allSetsLogged(exercise: Exercise, loggedSets: LoggedSet[]): boolean {
  const ascending = exercise.ascending_sets && exercise.ascending_sets.length > 0 ? exercise.ascending_sets : null;
  const totalSets = (ascending ? ascending.length : exercise.prescribed_sets ?? 1) + (exercise.backdown_sets ?? 0);
  const existingForExercise = loggedSets.filter((s) => s.exercise_id === exercise.id);
  return (
    totalSets > 0 &&
    Array.from({ length: totalSets }, (_, i) => i + 1).every((setNumber) => {
      const row = existingForExercise.find((s) => s.set_number === setNumber);
      if (!row || row.status === "skipped" || row.status === "pending") return false;
      return row.status === "completed" || row.rpe != null;
    })
  );
}

// SessionPlayer's session-preview-list line — like plannedSetSummary
// below but with "RPE N" appended to each half and " · " joins instead
// of bare concatenation.
export function setSummaryText(exercise: Exercise, oneRm: OneRms): string {
  if (exercise.ascending_sets && exercise.ascending_sets.length > 0) {
    return exercise.ascending_sets.map((s) => `${s.weight ?? "—"}${s.reps ? `×${s.reps}` : ""}`).join(", ");
  }
  const weight = prescribedWeight(exercise, oneRm);
  const reps = exercise.prescribed_reps || null;
  const topText = [
    `${exercise.prescribed_sets ?? "—"}×${reps ?? "—"}${weight == null ? "" : ` @ ${weight}`}`,
    exercise.prescribed_rpe ? `RPE ${exercise.prescribed_rpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  if (!exercise.backdown_sets) return topText;
  const backdownWeightValue = backdownWeight(exercise, oneRm);
  const backdownReps = exercise.backdown_reps || null;
  const backdownText = [
    `${exercise.backdown_sets}×${backdownReps ?? "—"}${backdownWeightValue == null ? "" : ` @ ${backdownWeightValue}`}`,
    exercise.backdown_rpe ? `RPE ${exercise.backdown_rpe}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${topText} + ${backdownText} backdown`;
}

// Every RPE logged for this exercise so far, in set order, joined for
// display ("7, 7.5, 8") — null when nothing's been logged with an RPE.
export function loggedRpeSummary(exercise: Exercise, loggedSets: LoggedSet[]): string | null {
  const rpes = loggedSets
    .filter((s) => s.exercise_id === exercise.id && s.rpe != null)
    .sort((a, b) => a.set_number - b.set_number)
    .map((s) => s.rpe);
  return rpes.length > 0 ? rpes.join(", ") : null;
}

// Rest-timer countdown display, e.g. 95 -> "1:35".
export function formatRestTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// AthleteDetail's coach-facing "Planned: …" text — the weight-resolved
// version of plannedSummary-style text but WITHOUT the RPE suffix and
// without " · " joins (straight concatenation) — confirmed a separate,
// simpler function from setSummaryText above, not a shared caller.
export function plannedSetSummary(exercise: Exercise, oneRm: OneRms): string {
  if (exercise.ascending_sets && exercise.ascending_sets.length > 0) {
    return exercise.ascending_sets.map((s) => `${s.weight ?? "—"}${s.reps ? `×${s.reps}` : ""}`).join(", ");
  }
  const weight = prescribedWeight(exercise, oneRm);
  const reps = exercise.prescribed_reps || null;
  const topText = `${exercise.prescribed_sets ?? "—"}×${reps ?? "—"}${weight == null ? "" : ` @ ${weight}`}`;
  if (!exercise.backdown_sets) return topText;
  const backdownWeightValue = backdownWeight(exercise, oneRm);
  const backdownReps = exercise.backdown_reps || null;
  return `${topText} + ${exercise.backdown_sets}×${backdownReps ?? "—"}${backdownWeightValue == null ? "" : ` @ ${backdownWeightValue}`} backdown`;
}

// The real logged sets for one exercise — anything with at least one of
// weight/reps/rpe filled in — in set order. A "blank" row (e.g. created
// by the UI but never touched) is deliberately excluded.
export function loggedSetsForExercise(exercise: Exercise, loggedSets: LoggedSet[]): LoggedSet[] {
  return loggedSets
    .filter(
      (s) =>
        s.exercise_id === exercise.id &&
        (s.weight != null || s.reps != null || s.rpe != null || s.velocity_fast != null || s.velocity_slow != null),
    )
    .sort((a, b) => a.set_number - b.set_number);
}
