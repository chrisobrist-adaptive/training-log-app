-- The coach dashboard's "days/weeks left" badge used to be based on logged-
-- session completion (how many weeks still had an incomplete training day).
-- That penalized athletes who forgot to log a session they actually did, and
-- didn't move on when a coach told an athlete to skip a missed session and
-- stay on the real calendar instead of dragging the block out. Switching it
-- to the actual calendar needs to know when a block actually started, so
-- this records that at the moment it's deployed to the athlete.
alter table public.blocks
  add column deployed_at timestamptz;

-- Backfill: every block that's already deployed needs *some* start date to
-- compute a calendar-based countdown from. created_at is the closest proxy
-- we have for existing data (we don't know the real day training began), so
-- it's used as a one-time backfill only — every future deploy sets the real
-- timestamp going forward via the Deploy button.
update public.blocks
set deployed_at = created_at
where status = 'deployed' and deployed_at is null;
