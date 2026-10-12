// RECONSTRUCTED 2026-10-06 from the live production bundle (minified
// identifiers `ll`, `ul`, `dl`, `fl`, `pl`, `ml`). These compute the
// pre-filled defaults SetRow shows before the athlete has logged anything
// for a given set: working weight from %1RM or a fixed load, and a target
// rep count from the exercise's prescribed/backdown reps text.
//
// Fixed 2026-10-06 (dist-v10): the original `fl` only accepted a bare
// integer string ("8"), via /^\d+$/. Real prescribed_reps data is almost
// always a RANGE ("8-10", "12-15") or free text ("AMRAP", "Hold till RPE")
// for accessory work - main lifts are the only exercises that use a bare
// integer. The strict check meant reps never auto-filled for virtually any
// accessory exercise, which is what Chris reported. Now it pulls out the
// first number found in the string - "8-10" -> 8, "AMRAP" -> still null
// (nothing sensible to fill), "5" -> 5 (main lifts unaffected).

export type OneRms = {
  squat_1rm?: number | null;
  bench_1rm?: number | null;
  deadlift_1rm?: number | null;
} | null | undefined;

type LoadFields = {
  load_fixed: number | null | undefined;
  load_pct: number | null | undefined;
};

// Resolves a prescribed/backdown load: a fixed kg value wins outright;
// otherwise a %1RM figure is resolved against the matching lift's 1RM and
// rounded to the nearest 2.5kg plate jump. Returns null when there's
// nothing to compute from (e.g. no 1RM on file yet).
function resolveLoad(fields: LoadFields, lift: string | null | undefined, oneRms: OneRms): number | null {
  if (fields.load_fixed != null) return fields.load_fixed;
  if (fields.load_pct != null && oneRms) {
    const oneRm =
      lift === "squat" ? oneRms.squat_1rm :
      lift === "bench" ? oneRms.bench_1rm :
      lift === "deadlift" ? oneRms.deadlift_1rm :
      null;
    if (oneRm != null) return Math.round((fields.load_pct / 100) * oneRm / 2.5) * 2.5;
  }
  return null;
}

export function prescribedWeight(exercise: any, oneRms: OneRms): number | null {
  return resolveLoad(
    { load_fixed: exercise.prescribed_load_fixed, load_pct: exercise.prescribed_load_pct },
    exercise.exercise_inventory?.lift,
    oneRms,
  );
}

export function backdownWeight(exercise: any, oneRms: OneRms): number | null {
  return resolveLoad(
    { load_fixed: exercise.backdown_load_fixed, load_pct: exercise.backdown_load_pct },
    exercise.exercise_inventory?.lift,
    oneRms,
  );
}

// Pulls the first integer out of a prescribed_reps/backdown_reps string.
// Handles a bare count ("5"), a rep range ("8-10" -> the low end, 8), and
// returns null for text with no digits at all ("AMRAP", "Hold till RPE",
// "To RPE") since there's no single number worth pre-filling there.
function firstNumber(text: string | null | undefined): number | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/\d+/);
  return match ? Number(match[0]) : null;
}

export function prescribedReps(exercise: any): number | null {
  return firstNumber(exercise.prescribed_reps);
}

export function backdownReps(exercise: any): number | null {
  return firstNumber(exercise.backdown_reps);
}
