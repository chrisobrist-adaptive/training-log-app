-- Let athletes view (read-only) their own annual training plan from the
-- "Plan" tab. Coaches keep full access via the existing *_coach_all policies.

create policy periodization_macrocycles_athlete_select
  on public.periodization_macrocycles
  for select
  using (athlete_id = (select auth.uid()));

create policy periodization_blocks_athlete_select
  on public.periodization_blocks
  for select
  using (
    macrocycle_id in (
      select m.id from public.periodization_macrocycles m
      where m.athlete_id = (select auth.uid())
    )
  );
