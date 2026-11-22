-- Ascending sets can now set their own % of the training max (used when no
-- fixed weight is entered) and their own RPE. Otherwise identical to 0018.

create or replace function public.get_planned_week_metrics(p_athlete_id uuid)
 returns table(week_id uuid, lift text, volume numeric, sets integer, central numeric, exertion_load numeric, peripheral numeric, e1rm numeric, ari numeric, peak_intensity numeric, monotony numeric, volume_pct_change numeric, e1rm_pct_change numeric, acwr numeric)
 language sql
 stable
as $function$
  with week_seq as (
    select w.id as week_id, w.week_number, b.order_index,
           row_number() over (order by b.order_index, w.week_number) as seq_no
    from weeks w
    join blocks b on b.id = w.block_id
    where b.athlete_id = p_athlete_id
  ),
  lifts as (select unnest(array['squat','bench','deadlift']) as lift),
  onerm as (
    select ws.week_id, l.lift,
      case l.lift
        when 'squat' then wer.squat_1rm
        when 'bench' then wer.bench_1rm
        when 'deadlift' then wer.deadlift_1rm
      end as onerm
    from week_seq ws
    cross join lifts l
    join week_effective_1rm wer on wer.week_id = ws.week_id
  ),
  ex as (
    select e.*,
      case when jsonb_typeof(e.ascending_sets) = 'array' and jsonb_array_length(e.ascending_sets) > 0
           then jsonb_array_length(e.ascending_sets) end as asc_count
    from exercises e
  ),
  slots as (
    select
      ws.week_id, ws.seq_no, l.lift, o.onerm,
      e.id as exercise_id, gs.set_number,
      (gs.set_number <= coalesce(e.asc_count, e.prescribed_sets, 0)) as is_main,
      (e.asc_count is not null and gs.set_number <= e.asc_count) as is_asc,
      coalesce(
        nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'weight', '')::numeric,
        case when o.onerm is not null then round((nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'pct', '')::numeric / 100.0 * o.onerm) / 2.5) * 2.5 end
      ) as asc_load,
      nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'rpe', '')::numeric as asc_rpe,
      nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'reps', '')::numeric::int as asc_reps,
      e.prescribed_reps, e.prescribed_load_pct, e.prescribed_load_fixed, e.prescribed_rpe, e.prescribed_rir,
      e.backdown_reps, e.backdown_load_pct, e.backdown_load_fixed, e.backdown_rpe, e.backdown_rir,
      ei.rpe_based_e1rm as use_rpe_e1rm,
      td.id as day_id
    from week_seq ws
    join lifts l on true
    join onerm o on o.week_id = ws.week_id and o.lift = l.lift
    join training_days td on td.week_id = ws.week_id
    join ex e on e.training_day_id = td.id
    join exercise_inventory ei on ei.id = e.exercise_inventory_id and ei.lift = l.lift
    cross join lateral generate_series(1, coalesce(e.asc_count, e.prescribed_sets, 0) + coalesce(e.backdown_sets, 0)) as gs(set_number)
  ),
  rows_ as (
    select
      week_id, seq_no, lift, day_id,
      case when is_asc then asc_load else
      coalesce(
        case when is_main then prescribed_load_fixed else backdown_load_fixed end,
        case when is_main then
          case when prescribed_load_pct is not null and onerm is not null then round((prescribed_load_pct / 100.0 * onerm) / 2.5) * 2.5 end
        else
          case when backdown_load_pct is not null and onerm is not null then round((backdown_load_pct / 100.0 * onerm) / 2.5) * 2.5 end
        end
      ) end as load,
      case when is_asc then asc_reps
           when is_main then nullif(regexp_replace(coalesce(prescribed_reps, ''), '[^0-9].*$', ''), '')::int
           else nullif(regexp_replace(coalesce(backdown_reps, ''), '[^0-9].*$', ''), '')::int
      end as reps,
      10 - (case when is_asc then coalesce(asc_rpe, prescribed_rpe, 10 - coalesce(prescribed_rir, 2))
                 when is_main then coalesce(prescribed_rpe, 10 - coalesce(prescribed_rir, 2))
                 else coalesce(backdown_rpe, 10 - coalesce(backdown_rir, 2)) end) as rir,
      1 as sets,
      use_rpe_e1rm,
      onerm
    from slots
  ),
  day_agg as (
    select week_id, lift, day_id,
      coalesce(sum(case when reps > 0 and sets > 0 and load is not null
                    then (exertion_xl(reps, rir) * load / reps) * sets else 0 end), 0) as day_central
    from rows_
    group by week_id, lift, day_id
  ),
  monotony_agg as (
    select week_id, lift,
      case when count(*) > 1 and stddev_samp(day_central) > 0 then avg(day_central) / stddev_samp(day_central) end as monotony
    from day_agg
    group by week_id, lift
  ),
  lift_agg as (
    select
      r.week_id, ws.seq_no, r.lift,
      coalesce(sum(r.load * r.reps * r.sets), 0) as volume,
      coalesce(sum(r.sets), 0)::int as sets,
      coalesce(sum(case when r.reps > 0 and r.sets > 0 and r.load is not null
                    then (exertion_xl(r.reps, r.rir) * r.load / r.reps) * r.sets else 0 end), 0) / nullif(max(r.onerm), 0) as central,
      coalesce(sum(case when r.sets > 0 and r.load is not null
                    then exertion_xl(r.reps, r.rir) * r.load * r.sets else 0 end), 0) / nullif(max(r.onerm), 0) as peripheral,
      max(case when r.use_rpe_e1rm then r.load * (1 + (r.reps + r.rir) / 30.0) else r.load * (1 + r.reps / 30.0) end) as e1rm,
      case when sum(r.sets) > 0 and max(r.onerm) is not null then sum(r.load * r.sets) / sum(r.sets) / max(r.onerm) * 100 end as ari,
      case when max(r.onerm) is not null then max(r.load) / max(r.onerm) * 100 end as peak_intensity
    from rows_ r
    join week_seq ws on ws.week_id = r.week_id
    group by r.week_id, ws.seq_no, r.lift
  ),
  per_lift as (
    select la.week_id, la.seq_no, la.lift, la.volume, la.sets, la.central, la.central + la.peripheral as exertion_load, la.peripheral,
           la.e1rm, la.ari, la.peak_intensity, ma.monotony
    from lift_agg la
    left join monotony_agg ma on ma.week_id = la.week_id and ma.lift = la.lift
  ),
  total_agg as (
    select week_id, seq_no, 'total'::text as lift,
      sum(volume) as volume, sum(sets)::int as sets, sum(central) as central,
      sum(exertion_load) as exertion_load, sum(peripheral) as peripheral,
      null::numeric as e1rm, avg(ari) as ari, null::numeric as peak_intensity, null::numeric as monotony
    from per_lift
    group by week_id, seq_no
  ),
  metrics_all as (
    select * from per_lift
    union all
    select * from total_agg
  )
  select
    week_id, lift, volume, sets, central, exertion_load, peripheral, e1rm, ari, peak_intensity, monotony,
    case when lift <> 'total' and lag(volume) over w is not null and lag(volume) over w != 0
      then (volume - lag(volume) over w) / lag(volume) over w * 100 end as volume_pct_change,
    case when lift <> 'total' and lag(e1rm) over w is not null and lag(e1rm) over w != 0
      then (e1rm - lag(e1rm) over w) / lag(e1rm) over w * 100 end as e1rm_pct_change,
    case when avg(volume) over p4 is not null and avg(volume) over p4 != 0
      then volume / avg(volume) over p4 end as acwr
  from metrics_all
  window w as (partition by lift order by seq_no),
         p4 as (partition by lift order by seq_no rows between 4 preceding and 1 preceding)
  order by seq_no, lift;
$function$;
