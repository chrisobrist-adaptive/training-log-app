-- Individualised RPE -> %1RM charts.
--
-- exercise_inventory.rpe_chart_mode marks which exercises feed an athlete's
-- chart: 'competition' (competition squat / bench press / deadlift) or
-- 'equipped' (equipped squat / bench press / deadlift). Variations stay null.
--
-- get_rpe_chart_logs(athlete) returns the athlete's personalised cells: for
-- every (lift, mode, reps 1-15, RPE) they've logged on a marked exercise, the
-- average of the last 5 logs of weight / that week's effective 1RM * 100.
-- Cells with no logs aren't returned; the app fills those from the default
-- chart. Runs with the caller's permissions, so existing RLS applies (an
-- athlete sees their own, the coach sees their athletes').

alter table public.exercise_inventory
  add column rpe_chart_mode text check (rpe_chart_mode in ('competition', 'equipped'));

update public.exercise_inventory set rpe_chart_mode = 'competition'
  where lower(exercise_name) in ('competition squat', 'competition bench press', 'competition deadlift');
update public.exercise_inventory set rpe_chart_mode = 'equipped'
  where lower(exercise_name) in ('equipped squat', 'equipped bench press', 'equipped deadlift');

create or replace function public.get_rpe_chart_logs(p_athlete_id uuid)
returns table (lift text, mode text, reps integer, rpe numeric, pct numeric, n integer)
language sql
stable
security invoker
set search_path to 'public'
as $$
  with logs as (
    select
      ei.lift,
      ei.rpe_chart_mode as mode,
      ls.reps,
      ls.rpe,
      ls.weight / nullif(case ei.lift
        when 'squat' then wer.squat_1rm
        when 'bench' then wer.bench_1rm
        when 'deadlift' then wer.deadlift_1rm
      end, 0) * 100 as pct,
      row_number() over (
        partition by ei.lift, ei.rpe_chart_mode, ls.reps, ls.rpe
        order by ls.updated_at desc
      ) as rn
    from logged_sets ls
    join exercises e on e.id = ls.exercise_id
    join exercise_inventory ei on ei.id = e.exercise_inventory_id
    join training_days td on td.id = e.training_day_id
    join weeks w on w.id = td.week_id
    join blocks b on b.id = w.block_id
    join week_effective_1rm wer on wer.week_id = w.id
    where b.athlete_id = p_athlete_id
      and ei.rpe_chart_mode is not null
      and ls.weight > 0
      and ls.reps between 1 and 15
      and ls.rpe between 0 and 10
      and coalesce(ls.status, 'completed') <> 'skipped'
  )
  select lift, mode, reps, rpe, round(avg(pct), 2) as pct, count(*)::int as n
  from logs
  where rn <= 5 and pct is not null
  group by lift, mode, reps, rpe;
$$;
