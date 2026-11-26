-- Stored weekly metrics (graphs, dashboards) now count ascending sets, the
-- same way get_planned_week_metrics does: an exercise with ascending sets has
-- one main set per row, each with its own weight (or % of the week's training
-- max), reps and RPE. Unlogged sets fall back to those; logged sets win as
-- before. Otherwise identical to the previous definition.

create or replace function public.recalc_week_metrics(p_week_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_athlete_id uuid;
  v_seq_no int;
  v_lift text;
  v_lifts text[] := array['squat', 'bench', 'deadlift'];
  v_1rm numeric;
  v_volume numeric;
  v_sets int;
  v_central numeric;
  v_peripheral numeric;
  v_exertion numeric;
  v_e1rm numeric;
  v_ari numeric;
  v_peak numeric;
  v_acwr numeric;
  v_vol_pct numeric;
  v_e1rm_pct numeric;
  v_monotony numeric;
  v_prev_volume numeric;
  v_prev_e1rm numeric;
  v_avg_prior4 numeric;
  v_total_volume numeric := 0;
  v_total_sets int := 0;
  v_total_central numeric := 0;
  v_total_peripheral numeric := 0;
  v_total_exertion numeric := 0;
  v_ari_sum numeric := 0;
  v_ari_n int := 0;
  v_total_acwr numeric;
  v_total_prior4 numeric;
begin
  set local statement_timeout = '2s';

  select b.athlete_id into v_athlete_id
  from weeks w join blocks b on b.id = w.block_id
  where w.id = p_week_id;

  if v_athlete_id is null then
    return;
  end if;

  begin
    set local lock_timeout = '1s';
    perform pg_advisory_xact_lock(hashtext('recalc_week_metrics:' || p_week_id::text));
  exception when lock_not_available then
    return;
  end;
  set local lock_timeout to default;

  select seq_no into v_seq_no from (
    select w.id as week_id,
           row_number() over (order by b.order_index, w.week_number) as seq_no
    from weeks w join blocks b on b.id = w.block_id
    where b.athlete_id = v_athlete_id
  ) s where s.week_id = p_week_id;

  foreach v_lift in array v_lifts loop
    v_1rm := case v_lift
      when 'squat' then (select squat_1rm from week_effective_1rm where week_id = p_week_id)
      when 'bench' then (select bench_1rm from week_effective_1rm where week_id = p_week_id)
      when 'deadlift' then (select deadlift_1rm from week_effective_1rm where week_id = p_week_id)
    end;

    with ex as (
      select e.*,
        case when jsonb_typeof(e.ascending_sets) = 'array' and jsonb_array_length(e.ascending_sets) > 0
             then jsonb_array_length(e.ascending_sets) end as asc_count,
        ei.rpe_based_e1rm as use_rpe_e1rm,
        td.id as day_id
      from exercises e
      join training_days td on td.id = e.training_day_id
      join exercise_inventory ei on ei.id = e.exercise_inventory_id
      where td.week_id = p_week_id and ei.lift = v_lift
    ),
    slots as (
      select
        e.id as exercise_id, e.day_id,
        gs.set_number,
        (gs.set_number <= coalesce(e.asc_count, e.prescribed_sets, 0)) as is_main,
        (e.asc_count is not null and gs.set_number <= e.asc_count) as is_asc,
        coalesce(
          nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'weight', '')::numeric,
          case when v_1rm is not null then round((nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'pct', '')::numeric / 100.0 * v_1rm) / 2.5) * 2.5 end
        ) as asc_load,
        nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'rpe', '')::numeric as asc_rpe,
        nullif(e.ascending_sets -> (gs.set_number - 1) ->> 'reps', '')::numeric::int as asc_reps,
        e.prescribed_reps, e.prescribed_load_pct, e.prescribed_load_fixed, e.prescribed_rpe, e.prescribed_rir,
        e.backdown_reps, e.backdown_load_pct, e.backdown_load_fixed, e.backdown_rpe, e.backdown_rir,
        e.use_rpe_e1rm
      from ex e
      cross join lateral generate_series(1, coalesce(e.asc_count, e.prescribed_sets, 0) + coalesce(e.backdown_sets, 0)) as gs(set_number)
    ),
    rows as (
      select
        s.day_id,
        coalesce(
          ls.weight,
          case when s.is_asc then s.asc_load
               when s.is_main then
            coalesce(s.prescribed_load_fixed,
              case when s.prescribed_load_pct is not null and v_1rm is not null
                   then round((s.prescribed_load_pct / 100.0 * v_1rm) / 2.5) * 2.5 end)
          else
            coalesce(s.backdown_load_fixed,
              case when s.backdown_load_pct is not null and v_1rm is not null
                   then round((s.backdown_load_pct / 100.0 * v_1rm) / 2.5) * 2.5 end)
          end
        ) as load,
        coalesce(
          ls.reps,
          case when s.is_asc then s.asc_reps
               when s.is_main then nullif(regexp_replace(coalesce(s.prescribed_reps, ''), '[^0-9].*$', ''), '')::int
               else nullif(regexp_replace(coalesce(s.backdown_reps, ''), '[^0-9].*$', ''), '')::int
          end
        ) as reps,
        10 - coalesce(
          ls.rpe,
          case when s.is_asc then coalesce(s.asc_rpe, s.prescribed_rpe, 10 - coalesce(s.prescribed_rir, 2))
               when s.is_main then coalesce(s.prescribed_rpe, 10 - coalesce(s.prescribed_rir, 2))
               else coalesce(s.backdown_rpe, 10 - coalesce(s.backdown_rir, 2))
          end
        ) as rir,
        1 as sets,
        (ls.id is not null) as is_logged,
        s.use_rpe_e1rm
      from slots s
      left join logged_sets ls
        on ls.exercise_id = s.exercise_id and ls.set_number = s.set_number
        and ls.weight is not null and ls.reps is not null

      union all

      select
        e.day_id,
        ls.weight as load,
        ls.reps as reps,
        10 - coalesce(ls.rpe, e.prescribed_rpe, 10 - coalesce(e.prescribed_rir, 2)) as rir,
        1 as sets,
        true as is_logged,
        e.use_rpe_e1rm
      from logged_sets ls
      join ex e on e.id = ls.exercise_id
      where ls.weight is not null and ls.reps is not null
        and ls.set_number > coalesce(e.asc_count, e.prescribed_sets, 0) + coalesce(e.backdown_sets, 0)
    ),
    totals as (
      select
        coalesce(sum(load * reps * sets), 0) as volume,
        coalesce(sum(sets), 0)::int as sets,
        coalesce(sum(case when reps > 0 and sets > 0 and load is not null
                      then (exertion_xl(reps, rir) * load / reps) * sets else 0 end), 0) / nullif(v_1rm, 0) as central,
        coalesce(sum(case when sets > 0 and load is not null
                      then exertion_xl(reps, rir) * load * sets else 0 end), 0) / nullif(v_1rm, 0) as peripheral,
        max(
          case when use_rpe_e1rm then load * (1 + (reps + rir) / 30.0)
               else load * (1 + reps / 30.0) end
        ) filter (where is_logged and load is not null and reps is not null and use_rpe_e1rm) as e1rm,
        case when sum(sets) > 0 and v_1rm is not null then sum(load * sets) / sum(sets) / v_1rm * 100 end as ari,
        case when v_1rm is not null then max(load) / v_1rm * 100 end as peak
      from rows
    ),
    days as (
      select day_id, coalesce(sum(
        case when reps > 0 and sets > 0 and load is not null
             then (exertion_xl(reps, rir) * load / reps) * sets else 0 end
      ), 0) as day_central
      from rows
      group by day_id
    )
    select t.volume, t.sets, t.central, t.peripheral, t.e1rm, t.ari, t.peak,
      (select case when count(*) > 1 and stddev_samp(day_central) > 0
                   then avg(day_central) / stddev_samp(day_central) end from days)
    into v_volume, v_sets, v_central, v_peripheral, v_e1rm, v_ari, v_peak, v_monotony
    from totals t;

    if v_e1rm is null then
      v_e1rm := v_1rm;
    end if;

    v_exertion := v_central + v_peripheral;

    select wm.volume, wm.e1rm into v_prev_volume, v_prev_e1rm
    from weekly_metrics wm
    join weeks w on w.id = wm.week_id
    join blocks b on b.id = w.block_id
    where b.athlete_id = v_athlete_id and wm.lift = v_lift
    and (b.order_index, w.week_number) < (
      select b2.order_index, w2.week_number from weeks w2 join blocks b2 on b2.id = w2.block_id where w2.id = p_week_id
    )
    order by b.order_index desc, w.week_number desc
    limit 1;

    v_vol_pct := case when v_prev_volume is not null and v_prev_volume != 0
                  then (v_volume - v_prev_volume) / v_prev_volume * 100 end;
    v_e1rm_pct := case when v_prev_e1rm is not null and v_prev_e1rm != 0
                   then (v_e1rm - v_prev_e1rm) / v_prev_e1rm * 100 end;

    select avg(recent.volume) into v_avg_prior4
    from (
      select wm.volume
      from weekly_metrics wm
      join weeks w on w.id = wm.week_id
      join blocks b on b.id = w.block_id
      where b.athlete_id = v_athlete_id and wm.lift = v_lift
      and (b.order_index, w.week_number) < (
        select b2.order_index, w2.week_number from weeks w2 join blocks b2 on b2.id = w2.block_id where w2.id = p_week_id
      )
      order by b.order_index desc, w.week_number desc
      limit 4
    ) recent;

    v_acwr := case when v_avg_prior4 is not null and v_avg_prior4 != 0 then v_volume / v_avg_prior4 end;

    insert into weekly_metrics (week_id, lift, exertion_load, central, peripheral, volume, sets,
      acwr, e1rm, ari, peak_intensity, volume_pct_change, e1rm_pct_change, monotony, updated_at)
    values (p_week_id, v_lift, v_exertion, v_central, v_peripheral,
      v_volume, v_sets, v_acwr, v_e1rm, v_ari, v_peak, v_vol_pct, v_e1rm_pct, v_monotony, now())
    on conflict (week_id, lift) do update set
      exertion_load = excluded.exertion_load, central = excluded.central, peripheral = excluded.peripheral,
      volume = excluded.volume, sets = excluded.sets, acwr = excluded.acwr, e1rm = excluded.e1rm,
      ari = excluded.ari, peak_intensity = excluded.peak_intensity, volume_pct_change = excluded.volume_pct_change,
      e1rm_pct_change = excluded.e1rm_pct_change, monotony = excluded.monotony, updated_at = now();

    v_total_volume := v_total_volume + coalesce(v_volume, 0);
    v_total_sets := v_total_sets + coalesce(v_sets, 0);
    v_total_central := v_total_central + coalesce(v_central, 0);
    v_total_peripheral := v_total_peripheral + coalesce(v_peripheral, 0);
    v_total_exertion := v_total_exertion + coalesce(v_exertion, 0);
    if v_ari is not null then v_ari_sum := v_ari_sum + v_ari; v_ari_n := v_ari_n + 1; end if;
  end loop;

  select wm.volume into v_prev_volume
  from weekly_metrics wm join weeks w on w.id = wm.week_id join blocks b on b.id = w.block_id
  where b.athlete_id = v_athlete_id and wm.lift = 'total'
  and (b.order_index, w.week_number) < (
    select b2.order_index, w2.week_number from weeks w2 join blocks b2 on b2.id = w2.block_id where w2.id = p_week_id
  )
  order by b.order_index desc, w.week_number desc limit 1;

  select avg(recent.volume) into v_total_prior4
  from (
    select wm.volume
    from weekly_metrics wm join weeks w on w.id = wm.week_id join blocks b on b.id = w.block_id
    where b.athlete_id = v_athlete_id and wm.lift = 'total'
    and (b.order_index, w.week_number) < (
      select b2.order_index, w2.week_number from weeks w2 join blocks b2 on b2.id = w2.block_id where w2.id = p_week_id
    )
    order by b.order_index desc, w.week_number desc limit 4
  ) recent;

  v_total_acwr := case when v_total_prior4 is not null and v_total_prior4 != 0 then v_total_volume / v_total_prior4 end;

  insert into weekly_metrics (week_id, lift, exertion_load, central, peripheral, volume, sets, acwr, ari, updated_at)
  values (p_week_id, 'total', v_total_exertion, v_total_central, v_total_peripheral,
    v_total_volume, v_total_sets, v_total_acwr,
    case when v_ari_n > 0 then v_ari_sum / v_ari_n end, now())
  on conflict (week_id, lift) do update set
    exertion_load = excluded.exertion_load, central = excluded.central, peripheral = excluded.peripheral,
    volume = excluded.volume, sets = excluded.sets, acwr = excluded.acwr, ari = excluded.ari, updated_at = now();
exception when query_canceled then
  -- Ran past its own 2s budget — bail out quietly; a fresh write re-queues
  -- the week and the next cron tick retries from scratch.
  return;
end;
$function$;

-- Recompute every week that has an exercise with ascending sets.
do $$
declare v_week uuid;
begin
  for v_week in
    select distinct td.week_id
    from exercises e join training_days td on td.id = e.training_day_id
    where jsonb_typeof(e.ascending_sets) = 'array' and jsonb_array_length(e.ascending_sets) > 0
  loop
    perform recalc_week_metrics_cascade(v_week);
  end loop;
end $$;
