-- Exertion load now matches the coach's Google Sheet:
--   xl(Reps, RIR)   = sum over i = RIR .. RIR+Reps-1 of exp(-0.215 * i)
--                     (RIR used as-is, e.g. RPE 7.5 -> 2.5 -> i = 2.5, 3.5, ...)
--   Central EL      = xl * Weight / Reps * Sets / 1RM
--   Peripheral EL   = xl * Weight * Sets / 1RM
--   Exertion load   = Central + Peripheral
-- Weight = the logged weight when there is one, else the prescribed weight.
-- 1RM = the week's effective 1RM for the exercise's lift.
--
-- Previously: RIR was rounded to a whole number; central and peripheral were
-- not divided by 1RM; peripheral had no weight term; exertion load was
-- xl * weight (planned) or, by a column-order slip in recalc_week_metrics,
-- plain xl (logged).

-- Fractional-RIR version (the int/int version is left in place, unused).
create or replace function public.exertion_xl(p_reps integer, p_rir numeric)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select coalesce(sum(exp(-0.215 * (p_rir + k))), 0)
  from generate_series(0, greatest(p_reps, 0) - 1) as k;
$$;

-- Patch the two metric functions in place (exact-text replacements; fails
-- loudly if any expected fragment isn't found).
do $patch$
declare
  d text;
  old_text text;
begin
  -- Planned metrics (program builder).
  d := pg_get_functiondef('public.get_planned_week_metrics(uuid)'::regprocedure);
  if position('then (exertion_xl(reps, round(rir)::int) * load / reps) * sets else 0 end), 0) as day_central' in d) = 0 then raise exception 'planned: day_central not found'; end if;
  d := replace(d, 'then (exertion_xl(reps, round(rir)::int) * load / reps) * sets else 0 end), 0) as day_central',
                  'then (exertion_xl(reps, rir) * load / reps) * sets else 0 end), 0) as day_central');
  old_text := E'      coalesce(sum(case when r.reps > 0 and r.sets > 0 and r.load is not null\n                    then (exertion_xl(r.reps, round(r.rir)::int) * r.load / r.reps) * r.sets else 0 end), 0) as central,\n      coalesce(sum(case when r.sets > 0 and r.load is not null\n                    then exertion_xl(r.reps, round(r.rir)::int) * r.load * r.sets else 0 end), 0) as exertion_load,\n      coalesce(sum(case when r.reps > 0 and r.sets > 0\n                    then exertion_xl(r.reps, round(r.rir)::int) * r.sets else 0 end), 0) as peripheral,\n';
  if position(old_text in d) = 0 then raise exception 'planned: lift_agg EL block not found'; end if;
  d := replace(d, old_text,
    E'      coalesce(sum(case when r.reps > 0 and r.sets > 0 and r.load is not null\n                    then (exertion_xl(r.reps, r.rir) * r.load / r.reps) * r.sets else 0 end), 0) / nullif(max(r.onerm), 0) as central,\n      coalesce(sum(case when r.sets > 0 and r.load is not null\n                    then exertion_xl(r.reps, r.rir) * r.load * r.sets else 0 end), 0) / nullif(max(r.onerm), 0) as peripheral,\n');
  if position('la.central, la.exertion_load, la.peripheral,' in d) = 0 then raise exception 'planned: per_lift select not found'; end if;
  d := replace(d, 'la.central, la.exertion_load, la.peripheral,', 'la.central, la.central + la.peripheral as exertion_load, la.peripheral,');
  execute d;

  -- Logged metrics (athlete pages, graphs).
  d := pg_get_functiondef('public.recalc_week_metrics(uuid)'::regprocedure);
  old_text := E'      coalesce(sum(case when reps > 0 and sets > 0 and load is not null\n                    then (exertion_xl(reps, round(rir)::int) * load / reps) * sets else 0 end), 0),\n      coalesce(sum(case when sets > 0 and load is not null\n                    then exertion_xl(reps, round(rir)::int) * load * sets else 0 end), 0),\n      coalesce(sum(case when reps > 0 and sets > 0\n                    then exertion_xl(reps, round(rir)::int) * sets else 0 end), 0),\n';
  if position(old_text in d) = 0 then raise exception 'logged: EL select block not found'; end if;
  d := replace(d, old_text,
    E'      coalesce(sum(case when reps > 0 and sets > 0 and load is not null\n                    then (exertion_xl(reps, rir) * load / reps) * sets else 0 end), 0) / nullif(v_1rm, 0),\n      coalesce(sum(case when sets > 0 and load is not null\n                    then exertion_xl(reps, rir) * load * sets else 0 end), 0) / nullif(v_1rm, 0),\n      null::numeric,\n');
  if position(E'    if v_e1rm is null then\n      v_e1rm := v_1rm;\n    end if;\n' in d) = 0 then raise exception 'logged: e1rm fallback not found'; end if;
  d := replace(d, E'    if v_e1rm is null then\n      v_e1rm := v_1rm;\n    end if;\n',
                  E'    if v_e1rm is null then\n      v_e1rm := v_1rm;\n    end if;\n\n    v_exertion := v_central + v_peripheral;\n');
  if position('(exertion_xl(r.reps, round(r.rir)::int) * r.load / r.reps)' in d) = 0 then raise exception 'logged: monotony expr not found'; end if;
  d := replace(d, '(exertion_xl(r.reps, round(r.rir)::int) * r.load / r.reps)', '(exertion_xl(r.reps, r.rir) * r.load / r.reps)');
  execute d;
end
$patch$;
