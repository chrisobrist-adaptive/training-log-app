// App-level types, derived from the live Supabase schema in
// `./database.types.ts` (regenerated 2026-10-11 directly from the project —
// see that file's header). These are the names every component in this
// tree actually imports (confirmed via a grep across the whole src/ folder
// before writing this file: Block, Week, TrainingDay, Exercise, LoggedSet,
// Profile, PeriodizationBlock, PeriodizationMacrocycle, WeeklyMetrics,
// WeekEffective1Rm), plus one join shape (`Exercise.exercise_inventory`)
// that isn't in the raw schema but is required by every exercise-display
// component (SessionPlayer.tsx, SetRow.tsx, exerciseDefaults.ts all read
// `exercise.exercise_inventory?.lift` / `.exercise_name` — confirmed by
// grepping their actual usage, not guessed) because the real app always
// fetches exercises joined against exercise_inventory, never bare.
//
// This file did not exist anywhere in this backup tree before — it was the
// single biggest reason nothing here could actually compile (SetRow.tsx,
// SessionPlayer.tsx, WeekdayStrip.tsx, TrainingLog.tsx, Dashboard.tsx and
// Periodization.tsx all import from it). Filling this gap in was step one
// of turning this tree into something `npm run build` can actually run.

import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type Views = Database["public"]["Views"];

export type Profile = Tables["profiles"]["Row"];
export type Block = Tables["blocks"]["Row"];
export type Week = Tables["weeks"]["Row"];
export type TrainingDay = Tables["training_days"]["Row"];
export type ExerciseInventory = Tables["exercise_inventory"]["Row"];
export type LoggedSet = Tables["logged_sets"]["Row"];
export type WeeklyMetrics = Tables["weekly_metrics"]["Row"];
export type PeriodizationMacrocycle = Tables["periodization_macrocycles"]["Row"];
export type PeriodizationBlock = Tables["periodization_blocks"]["Row"];
export type WeekEffective1Rm = Views["week_effective_1rm"]["Row"];

// The exercises table row, joined against its exercise_inventory row —
// every real query in this app selects exercises this way (e.g.
// `.select("*, exercise_inventory(*)")`), never the bare table row, because
// nothing can render a set table without the lift/exercise name. Nullable
// because exercise_inventory_id itself is nullable (an exercise can be
// "not set yet" — see SessionPlayer.tsx's fallback text for that state).
// One row of a manually-entered "ascending sets" prescription (each set's
// own weight/reps, overriding the normal sets x reps x %1RM scheme) —
// stored as jsonb on the exercise row. Shape confirmed against every real
// usage (BlockBuilder.tsx's ascending-sets editor, SessionPlayer.tsx,
// sessionPlayerHelpers.ts): always { weight, reps }, both nullable while
// a row is still being filled in.
export type AscendingSetEntry = { weight: number | null; reps: number | null };

export type Exercise = Omit<Tables["exercises"]["Row"], "ascending_sets"> & {
  exercise_inventory: ExerciseInventory | null;
  ascending_sets: AscendingSetEntry[] | null;
};
