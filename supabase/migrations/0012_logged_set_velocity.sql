-- Optional bar-speed tracking per logged set: the fastest and slowest rep
-- of the set, in metres per second. Entered from the athlete log's
-- "Velocity" section; charted on the Graphs tab and the coach athlete page.
-- Existing logged_sets RLS policies already cover these columns.

alter table public.logged_sets
  add column velocity_fast numeric(4, 2) check (velocity_fast >= 0 and velocity_fast < 10),
  add column velocity_slow numeric(4, 2) check (velocity_slow >= 0 and velocity_slow < 10);
