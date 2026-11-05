-- Competition details on an athlete's profile, used by the coach-only
-- Competition tab to compare them with OpenPowerlifting results:
--   comp_sex         'M' / 'F' (as in OpenPowerlifting)
--   comp_bodyweight  competition bodyweight in kg — mapped to the right weight
--                    class per federation (APA/IPF and APL classes differ)
--   comp_equipment   'Raw' or 'Single-ply' (equipped)
--   birth_year       for age-group comparisons (IPF-style age by calendar year)
--   opl_name         their name as it appears on OpenPowerlifting (for matching
--                    their own meet history later)
-- Existing profile RLS (own row or coach) covers these columns.

alter table public.profiles
  add column comp_sex text check (comp_sex in ('M', 'F')),
  add column comp_bodyweight numeric(5, 1) check (comp_bodyweight > 0 and comp_bodyweight < 400),
  add column comp_equipment text check (comp_equipment in ('Raw', 'Single-ply')),
  add column birth_year integer check (birth_year between 1900 and 2100),
  add column opl_name text;
