-- A coach-written cue or comment for a programmed exercise, shown to the
-- athlete in a "Cues" card above the exercise in their training log.
-- (Separate from exercises.notes, which is the athlete's own comment.)
-- Existing exercises RLS policies already cover this column.

alter table public.exercises add column coach_cue text;
