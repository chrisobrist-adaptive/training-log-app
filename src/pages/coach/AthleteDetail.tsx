import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { fetchAthleteWeekSequence, fetchWeekOneRms, fetchWeeklyMetrics, type WeekWithBlock } from "../../lib/queries";
import { getFunctionInvokeError } from "../../lib/functionError";
import BlockSwitcher from "../../components/BlockSwitcher";
import WeekdayStrip from "../../components/WeekdayStrip";
import LiftCategoryBadge from "../../components/LiftCategoryBadge";
import WeekSummaryTable from "../../components/WeekSummaryTable";
import VelocityChart from "../../components/VelocityChart";
import RpeChart from "../../components/RpeChart";
import { calendarPosition, todayWeekday, type CalendarPosition } from "../../lib/blockCalendar";
import TrendChart from "../../components/TrendChart";
import { plannedSetSummary, loggedSetsForExercise } from "../../lib/sessionPlayerHelpers";
import type { Block, Week, TrainingDay, Exercise, LoggedSet, Profile, WeeklyMetrics, WeekEffective1Rm } from "../../lib/types";

// RECONSTRUCTED 2026-10-11 from the live production bundle (minified `uK`)
// — the coach's per-athlete page: block list (create/duplicate/delete),
// weekly-metrics summary + trend chart, and a read-only "session log" of
// what was actually logged vs. planned for whichever week/day is selected.
// 1:1 translation, including the exact default-selection logic (first
// non-completed block/week, falling back to the last one) that mirrors
// TrainingLog.tsx's own athlete-facing version of the same pattern.
//
// Depends on a handful of small pieces that are REAL, located precisely in
// the bundle, but not yet pulled apart into their own files (tracked as
// its own step, same as SessionPlayer.tsx's dependencies were earlier in
// this project): `BlockSwitcher.tsx` (minified `aK`), `LiftCategoryBadge`
// (`rK` + its `nK`/`tK` category-color map), `WeekSummaryTable` (`yl`),
// `TrendChart` (`eK`), and two small helpers that belong in
// `sessionPlayerHelpers.ts` alongside the ones SessionPlayer.tsx already
// needs: `plannedSetSummary` (`cK` — builds the "Planned: 3×8 @ 120kg +
// 2×10 @ 90kg backdown" text) and `loggedSetsForExercise` (`lK` — the
// real logged sets for one exercise, sorted by set number). This file
// will not compile until those exist. `getFunctionInvokeError` (`el`) is
// genuinely new too — same error-unwrapping helper the invite-athlete
// flow in Login.tsx/AcceptInvite.tsx presumably also uses, not previously
// isolated into `functionError.ts`.

interface AthleteDetailExercise extends Exercise {}

export default function AthleteDetail() {
  const { athleteId } = useParams<{ athleteId: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  // WeekWithBlock, not plain Week: TrendChart needs each week's `block.name`
  // for its x-axis labels ("Block name W3") — found via the typecheck run
  // that added TrendChart.tsx, not the original translation pass. Everything
  // else in this file only reads the plain Week fields, so widening this
  // from `Week[]` introduces no other change.
  const [weeks, setWeeks] = useState<WeekWithBlock[]>([]);
  const [weeklyMetrics, setWeeklyMetrics] = useState<WeeklyMetrics[]>([]);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [completedWeekIds, setCompletedWeekIds] = useState<Set<string>>(new Set());
  const [completedBlockIds, setCompletedBlockIds] = useState<Set<string>>(new Set());
  const [activeLift, setActiveLift] = useState<"squat" | "bench" | "deadlift" | "total">("total");
  const [oneRmsByWeek, setOneRmsByWeek] = useState<Record<string, WeekEffective1Rm>>({});
  const [deletingAthlete, setDeletingAthlete] = useState(false);
  const [duplicatingBlockId, setDuplicatingBlockId] = useState<string | null>(null);

  // "Session log" section state — the selected week's training days,
  // exercises (joined to exercise_inventory) and logged sets.
  const [sessionDays, setSessionDays] = useState<TrainingDay[]>([]);
  const [sessionExercises, setSessionExercises] = useState<AthleteDetailExercise[]>([]);
  const [sessionLoggedSets, setSessionLoggedSets] = useState<LoggedSet[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  // Days / weeks where the athlete wrote a note on at least one exercise,
  // flagged on the week tabs and the Session log's day buttons.
  const [notedDayIds, setNotedDayIds] = useState<Set<string>>(new Set());
  const [notedWeekIds, setNotedWeekIds] = useState<Set<string>>(new Set());
  // Where the athlete is up to by the calendar (same rule as their Training
  // tab) — drives the default block/week/day shown here and the header line.
  const [calendarPos, setCalendarPos] = useState<CalendarPosition | null>(null);

  const loadAthleteAndBlocks = async () => {
    if (!athleteId) return;
    const [{ data: profileData }, { data: blocksData }, weekSequence] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", athleteId).single(),
      supabase.from("blocks").select("*").eq("athlete_id", athleteId).order("order_index"),
      fetchAthleteWeekSequence(athleteId),
    ]);
    if (profileData) setProfile(profileData);
    const loadedBlocks = blocksData ?? [];
    setBlocks(loadedBlocks);
    setWeeks(weekSequence);

    if (weekSequence.length > 0) {
      const weekIds = weekSequence.map((w) => w.id);
      const [metricsRows, { data: dayCountRows }, oneRmRows] = await Promise.all([
        fetchWeeklyMetrics(weekIds),
        supabase.from("training_days").select("id, week_id, completed_at").in("week_id", weekIds),
        fetchWeekOneRms(weekIds),
      ]);
      setWeeklyMetrics(metricsRows);
      setOneRmsByWeek(Object.fromEntries(oneRmRows.map((r) => [r.week_id, r])));

      const perWeekCounts = new Map<string, { total: number; completed: number }>();
      for (const d of dayCountRows ?? []) {
        const counts = perWeekCounts.get(d.week_id) ?? { total: 0, completed: 0 };
        counts.total += 1;
        if (d.completed_at) counts.completed += 1;
        perWeekCounts.set(d.week_id, counts);
      }
      const fullyCompletedWeeks = new Set<string>();
      for (const [weekId, counts] of perWeekCounts) {
        if (counts.total > 0 && counts.total === counts.completed) fullyCompletedWeeks.add(weekId);
      }
      setCompletedWeekIds(fullyCompletedWeeks);

      const allDays = dayCountRows ?? [];
      const weekIdByDay = new Map(allDays.map((d) => [d.id, d.week_id]));
      const dayIds = allDays.map((d) => d.id);
      const notedDays = new Set<string>();
      // Chunked so a long training history can't overflow the request URL.
      for (let i = 0; i < dayIds.length; i += 150) {
        const { data: notedRows } = await supabase
          .from("exercises")
          .select("training_day_id")
          .in("training_day_id", dayIds.slice(i, i + 150))
          .not("notes", "is", null)
          .neq("notes", "");
        for (const r of notedRows ?? []) notedDays.add(r.training_day_id);
      }
      setNotedDayIds(notedDays);
      setNotedWeekIds(new Set([...notedDays].map((id) => weekIdByDay.get(id)).filter((id): id is string => !!id)));

      const weeksByBlock = new Map<string, Week[]>();
      for (const w of weekSequence) {
        const arr = weeksByBlock.get(w.block_id) ?? [];
        arr.push(w);
        weeksByBlock.set(w.block_id, arr);
      }
      const fullyCompletedBlocks = new Set<string>();
      for (const b of loadedBlocks) {
        const blockWeeks = weeksByBlock.get(b.id) ?? [];
        if (blockWeeks.length > 0 && blockWeeks.every((w) => fullyCompletedWeeks.has(w.id))) fullyCompletedBlocks.add(b.id);
      }
      setCompletedBlockIds(fullyCompletedBlocks);

      // Open on where the calendar has them (not the first week they haven't
      // fully logged); only fall back to logging progress when nothing has
      // been deployed yet.
      const weekCountByBlock = new Map<string, number>();
      for (const w of weekSequence) weekCountByBlock.set(w.block_id, (weekCountByBlock.get(w.block_id) ?? 0) + 1);
      const pos = calendarPosition(
        loadedBlocks.filter((b) => b.status === "deployed" || b.status === "completed"),
        weekCountByBlock,
      );
      setCalendarPos(pos);

      const defaultBlock = pos
        ? loadedBlocks.find((b) => b.id === pos.block.id)
        : (loadedBlocks.find((b) => !fullyCompletedBlocks.has(b.id)) ?? loadedBlocks[loadedBlocks.length - 1]);
      setActiveBlockId((current) => (current && loadedBlocks.some((b) => b.id === current) ? current : (defaultBlock?.id ?? null)));

      const defaultBlockWeeks = weekSequence.filter((w) => w.block_id === defaultBlock?.id);
      const calendarWeekNumber = pos ? (pos.state === "current" ? pos.weekNumber : pos.state === "upcoming" ? 1 : pos.totalWeeks) : null;
      const defaultWeek =
        (calendarWeekNumber != null ? defaultBlockWeeks.find((w) => w.week_number === calendarWeekNumber) : undefined) ??
        defaultBlockWeeks.find((w) => !fullyCompletedWeeks.has(w.id)) ??
        defaultBlockWeeks[defaultBlockWeeks.length - 1];
      setActiveWeekId((current) =>
        current && weekSequence.some((w) => w.id === current) ? current : (defaultWeek?.id ?? weekSequence[weekSequence.length - 1]?.id ?? null),
      );
    }
  };

  useEffect(() => {
    loadAthleteAndBlocks();
  }, [athleteId]);

  useEffect(() => {
    (async () => {
      if (!activeWeekId) {
        setSessionDays([]);
        setSessionExercises([]);
        setSessionLoggedSets([]);
        return;
      }
      setSessionLoading(true);
      const { data: dayRows } = await supabase.from("training_days").select("*").eq("week_id", activeWeekId).order("order_index");
      const days = dayRows ?? [];
      setSessionDays(days);
      const sortedDays = days.slice().sort((a, b) => a.order_index - b.order_index);
      // In the athlete's current calendar week, open today's session if
      // there is one; otherwise the first not-yet-completed day.
      const todaysDay = activeWeekId === calendarWeekId ? sortedDays.find((d) => d.weekday === todayWeekday()) : undefined;
      setSelectedDayId((current) =>
        current && sortedDays.some((d) => d.id === current)
          ? current
          : (todaysDay ?? sortedDays.find((d) => !d.completed_at) ?? sortedDays[sortedDays.length - 1])?.id ?? null,
      );
      if (days.length > 0) {
        const { data: exerciseRows } = await supabase
          .from("exercises")
          .select("*, exercise_inventory(*)")
          .in("training_day_id", days.map((d) => d.id))
          .order("order_index");
        const exercises = (exerciseRows ?? []) as AthleteDetailExercise[];
        setSessionExercises(exercises);
        if (exercises.length > 0) {
          const { data: setRows } = await supabase
            .from("logged_sets")
            .select("*")
            .in("exercise_id", exercises.map((ex) => ex.id));
          setSessionLoggedSets(setRows ?? []);
        } else {
          setSessionLoggedSets([]);
        }
      } else {
        setSessionExercises([]);
        setSessionLoggedSets([]);
      }
      setSessionLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWeekId]);

  // The week id the calendar has them in right now (null between/after blocks).
  const calendarWeekId =
    calendarPos?.state === "current"
      ? (weeks.find((w) => w.block_id === calendarPos.block.id && w.week_number === calendarPos.weekNumber)?.id ?? null)
      : null;

  const selectBlock = (blockId: string) => {
    setActiveBlockId(blockId);
    const blockWeeks = weeks.filter((w) => w.block_id === blockId);
    const calendarWeek = blockWeeks.find((w) => w.id === calendarWeekId);
    const defaultWeek = calendarWeek ?? blockWeeks.find((w) => !completedWeekIds.has(w.id)) ?? blockWeeks[blockWeeks.length - 1];
    setActiveWeekId(defaultWeek?.id ?? null);
  };

  const weeksInActiveBlock = useMemo(() => weeks.filter((w) => w.block_id === activeBlockId), [weeks, activeBlockId]);

  const metricsByLift = useMemo(() => {
    const byLift: Partial<Record<WeeklyMetrics["lift"], WeeklyMetrics>> = {};
    for (const metric of weeklyMetrics.filter((m) => m.week_id === activeWeekId)) byLift[metric.lift as WeeklyMetrics["lift"]] = metric;
    return byLift;
  }, [weeklyMetrics, activeWeekId]);

  const deleteBlock = async (block: Block) => {
    if (!window.confirm(`Delete "${block.name}"? This also deletes every week, day, exercise and logged data in it. This can't be undone.`)) return;
    const { error } = await supabase.from("blocks").delete().eq("id", block.id);
    if (error) {
      window.alert(`Couldn't delete this block: ${error.message}`);
      return;
    }
    setBlocks((prev) => prev.filter((b) => b.id !== block.id));
    loadAthleteAndBlocks();
  };

  const deleteAthlete = async () => {
    if (
      !athleteId ||
      !profile ||
      !window.confirm(
        `Delete ${profile.name} (${profile.email})? This permanently removes their login and every block, week, exercise and logged set they have. This can't be undone.\n\nTo re-add them afterward, just invite the same email again.`,
      )
    )
      return;
    setDeletingAthlete(true);
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const { data, error } = await supabase.functions.invoke("delete-athlete", {
      body: { athleteId },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });
    setDeletingAthlete(false);
    const errMsg = await getFunctionInvokeError(error, data);
    if (errMsg) {
      window.alert(`Couldn't delete this athlete: ${errMsg}`);
      return;
    }
    navigate("/", { replace: true });
  };

  const createBlock = async () => {
    if (!athleteId) return;
    const { data, error } = await supabase
      .from("blocks")
      .insert({ athlete_id: athleteId, name: `Block ${blocks.length + 1}`, type: "block", order_index: blocks.length, status: "draft" })
      .select("*")
      .single();
    if (!error && data) navigate(`/athletes/${athleteId}/blocks/${data.id}`);
  };

  const duplicateBlock = async (block: Block) => {
    if (!athleteId || duplicatingBlockId) return;
    if (!window.confirm(`Duplicate "${block.name}"? This copies every week, day and exercise into a new block.`)) return;
    setDuplicatingBlockId(block.id);
    try {
      const { data: newBlock, error } = await supabase
        .from("blocks")
        .insert({ athlete_id: athleteId, name: `${block.name} (copy)`, type: block.type, order_index: blocks.length, status: "draft" })
        .select("*")
        .single();
      if (error || !newBlock) {
        window.alert(`Couldn't duplicate this block: ${error?.message ?? "unknown error"}`);
        return;
      }
      const sourceWeeks = weeks.filter((w) => w.block_id === block.id).sort((a, b) => a.week_number - b.week_number);
      await Promise.all(
        sourceWeeks.map(async (week) => {
          const { data: newWeek } = await supabase.from("weeks").insert({ block_id: newBlock.id, week_number: week.week_number, status: "not_started" }).select("*").single();
          if (!newWeek) return;
          const { data: sourceDays } = await supabase.from("training_days").select("*").eq("week_id", week.id).order("order_index");
          await Promise.all(
            (sourceDays ?? []).map(async (day) => {
              const { data: newDay } = await supabase
                .from("training_days")
                .insert({ week_id: newWeek.id, day_label: day.day_label, order_index: day.order_index, weekday: day.weekday })
                .select("*")
                .single();
              if (!newDay) return;
              const { data: sourceExercises } = await supabase.from("exercises").select("*").eq("training_day_id", day.id).order("order_index");
              const exercises = sourceExercises ?? [];
              if (exercises.length !== 0) {
                await supabase.from("exercises").insert(
                  exercises.map((ex) => ({
                    training_day_id: newDay.id,
                    order_index: ex.order_index,
                    exercise_inventory_id: ex.exercise_inventory_id,
                    prescribed_sets: ex.prescribed_sets,
                    prescribed_reps: ex.prescribed_reps,
                    prescribed_load_pct: ex.prescribed_load_pct,
                    prescribed_load_fixed: ex.prescribed_load_fixed,
                    prescribed_rpe: ex.prescribed_rpe,
                    prescribed_rir: ex.prescribed_rir,
                    backdown_sets: ex.backdown_sets,
                    backdown_reps: ex.backdown_reps,
                    backdown_load_pct: ex.backdown_load_pct,
                    backdown_load_fixed: ex.backdown_load_fixed,
                    backdown_rpe: ex.backdown_rpe,
                    backdown_rir: ex.backdown_rir,
                    ascending_sets: ex.ascending_sets,
                    coach_cue: ex.coach_cue,
                  })),
                );
              }
            }),
          );
        }),
      );
      navigate(`/athletes/${athleteId}/blocks/${newBlock.id}`);
    } finally {
      setDuplicatingBlockId(null);
    }
  };

  if (!profile) return <p className="muted">Loading…</p>;

  const weekDaysWithWeekday = sessionDays.slice().sort((a, b) => a.order_index - b.order_index).filter((d) => d.weekday != null);
  const weekDaysWithoutWeekday = sessionDays.slice().sort((a, b) => a.order_index - b.order_index).filter((d) => d.weekday == null);
  const selectedDay = sessionDays.find((d) => d.id === selectedDayId) ?? null;
  const selectedDayExercises = selectedDay
    ? sessionExercises.filter((ex) => ex.training_day_id === selectedDay.id).sort((a, b) => a.order_index - b.order_index)
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{profile.name}</h1>
          {calendarPos && (
            <p className="page-subtitle" title="Where they're up to by their calendar (not by what's been logged)">
              {calendarPos.state === "current"
                ? `${calendarPos.block.name} · Week ${calendarPos.weekNumber} of ${calendarPos.totalWeeks}`
                : calendarPos.state === "upcoming"
                  ? `${calendarPos.block.name} starts ${calendarPos.startsOn.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`
                  : `${calendarPos.block.name} finished`}
            </p>
          )}
        </div>
        <div className="toolbar">
          <Link to="/" className="secondary-button">
            ← All athletes
          </Link>
          <Link to={`/athletes/${athleteId}/periodization`} className="secondary-button">
            Annual training plan
          </Link>
          <button className="danger-button" onClick={deleteAthlete} disabled={deletingAthlete}>
            {deletingAthlete ? "Deleting…" : "Delete athlete"}
          </button>
        </div>
      </div>

      <div className="section">
        <div className="page-header" style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ margin: 0 }}>Blocks</h2>
          <button className="primary-button" onClick={createBlock}>
            + New block
          </button>
        </div>
        {blocks.length === 0 ? (
          <p className="muted">No blocks yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.id}>
                  <td>{b.name}</td>
                  <td>{b.type}</td>
                  <td>
                    <span className={`badge badge-${b.status}`}>{b.status}</span>
                  </td>
                  <td>
                    <div className="toolbar">
                      <Link to={`/athletes/${athleteId}/blocks/${b.id}`}>Edit</Link>
                      <button className="secondary-button" onClick={() => duplicateBlock(b)} disabled={duplicatingBlockId != null}>
                        {duplicatingBlockId === b.id ? "Duplicating…" : "Duplicate"}
                      </button>
                      <button className="danger-button" onClick={() => deleteBlock(b)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {weeks.length > 0 && (
        <div className="section">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <span className="muted">Viewing:</span>
            <BlockSwitcher blocks={blocks} activeBlockId={activeBlockId} completedBlockIds={completedBlockIds} onSelect={selectBlock} />
          </div>
          <h2>Weekly metrics</h2>
          <div className="week-tabs">
            {weeksInActiveBlock.map((w) => (
              <button key={w.id} className={activeWeekId === w.id ? "active" : ""} onClick={() => setActiveWeekId(w.id)} type="button">
                W{w.week_number}
                {notedWeekIds.has(w.id) && <NoteFlag />}
                {completedWeekIds.has(w.id) && (
                  <span style={{ color: "var(--good)", marginLeft: "0.35rem" }} title="Week completed">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          <WeekSummaryTable metricsByLift={metricsByLift} activeLift={activeLift} onLiftChange={setActiveLift} />
          <h2 style={{ marginTop: "1.5rem" }}>Trend across blocks</h2>
          <TrendChart weeks={weeks} metrics={weeklyMetrics} lift={activeLift} />
        </div>
      )}

      {athleteId && (
        <div className="section">
          <h2>Velocity</h2>
          <VelocityChart athleteId={athleteId} />
        </div>
      )}

      {athleteId && (
        <div className="section">
          <h2>RPE chart</h2>
          <RpeChart athleteId={athleteId} />
        </div>
      )}

      {weeks.length > 0 && (
        <div className="section">
          <h2>Session log</h2>
          <p className="muted" style={{ marginTop: "-0.5rem", marginBottom: "1rem" }}>
            Every set {profile.name.split(" ")[0]} actually logged, with its own weight, reps and RPE (shown in green) — or what was planned, for
            anything not logged yet.
          </p>
          <div className="week-tabs">
            {weeksInActiveBlock.map((w) => (
              <button key={w.id} className={activeWeekId === w.id ? "active" : ""} onClick={() => setActiveWeekId(w.id)} type="button">
                W{w.week_number}
                {notedWeekIds.has(w.id) && <NoteFlag />}
                {completedWeekIds.has(w.id) && (
                  <span style={{ color: "var(--good)", marginLeft: "0.35rem" }} title="Week completed">
                    ✓
                  </span>
                )}
              </button>
            ))}
          </div>
          {sessionLoading && <p className="muted">Loading…</p>}
          {!sessionLoading && sessionDays.length === 0 && <p className="muted">Nothing programmed for this week.</p>}
          {!sessionLoading && sessionDays.length > 0 && (
            <>
              {weekDaysWithWeekday.length > 0 && <WeekdayStrip days={weekDaysWithWeekday} selectedDayId={selectedDayId} onSelect={setSelectedDayId} notedDayIds={notedDayIds} />}
              {weekDaysWithoutWeekday.length > 0 && (
                <div className="toolbar" style={{ marginBottom: "1rem" }}>
                  {weekDaysWithoutWeekday.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="secondary-button"
                      style={{ borderColor: d.id === selectedDayId ? "var(--accent)" : undefined, color: d.id === selectedDayId ? "var(--accent)" : undefined }}
                      onClick={() => setSelectedDayId(d.id)}
                    >
                      {d.day_label}
                      {notedDayIds.has(d.id) && <NoteFlag />}
                      {d.completed_at && " ✓"}
                    </button>
                  ))}
                </div>
              )}
              {selectedDay && (
                <div className="day-block">
                  <div className="day-block-header">
                    <strong>{selectedDay.day_label}</strong>
                    {selectedDay.completed_at && <span className="badge badge-completed">Completed ✓</span>}
                  </div>
                  {selectedDayExercises.length === 0 ? (
                    <p className="muted">No exercises programmed.</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Exercise</th>
                          <th>Set</th>
                          <th>Weight</th>
                          <th>Reps</th>
                          <th>RPE</th>
                          <th title="Fastest / slowest rep, m/s">Velocity (m/s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedDayExercises.map((ex) => {
                          const loggedForExercise = loggedSetsForExercise(ex, sessionLoggedSets);
                          const nameCell = (
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {ex.exercise_inventory && ex.exercise_inventory.lift !== "accessory" && <LiftCategoryBadge category={ex.exercise_inventory.lift} />}
                              <strong>{ex.exercise_inventory?.exercise_name ?? "—"}</strong>
                            </div>
                          );
                          // The athlete's own comment on this exercise (the "Your
                          // comment on this exercise…" box in their log), shown as
                          // an extra row under the exercise's sets, beside its name.
                          const athleteNote = ex.notes?.trim();
                          const noteRow = athleteNote ? (
                            <tr key={`${ex.id}-note`} className="session-note-row">
                              <td colSpan={5}>
                                <div className="session-note">
                                  <span className="session-note-label">{profile.name.split(" ")[0]}'s note</span>
                                  <span className="session-note-text">{athleteNote}</span>
                                </div>
                              </td>
                            </tr>
                          ) : null;
                          if (loggedForExercise.length === 0) {
                            return [
                              <tr key={ex.id} className={noteRow ? "has-note" : undefined}>
                                <td rowSpan={noteRow ? 2 : 1}>{nameCell}</td>
                                <td colSpan={5} className="muted">
                                  Planned: {plannedSetSummary(ex, activeWeekId ? (oneRmsByWeek[activeWeekId] ?? null) : null)} — not logged yet
                                </td>
                              </tr>,
                              noteRow,
                            ];
                          }
                          const mainSetCount = ex.ascending_sets && ex.ascending_sets.length > 0 ? ex.ascending_sets.length : (ex.prescribed_sets ?? 1);
                          return [
                            ...loggedForExercise.map((s, idx) => (
                            <tr key={s.id} className={noteRow && idx === loggedForExercise.length - 1 ? "has-note" : undefined}>
                              {idx === 0 && <td rowSpan={loggedForExercise.length + (noteRow ? 1 : 0)}>{nameCell}</td>}
                              <td className="muted">
                                {s.set_number}
                                {ex.backdown_sets != null && s.set_number > mainSetCount ? " (backdown)" : ""}
                              </td>
                              <td style={{ color: "var(--good)" }}>{s.weight ?? "—"}</td>
                              <td style={{ color: "var(--good)" }}>{s.reps ?? "—"}</td>
                              <td>{s.rpe ?? "—"}</td>
                              <td>
                                {s.velocity_fast != null || s.velocity_slow != null ? (
                                  <span title="Fastest / slowest rep">
                                    {s.velocity_fast ?? "—"} / {s.velocity_slow ?? "—"}
                                  </span>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                            )),
                            noteRow,
                          ];
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Small speech-bubble marker for "the athlete left a note here".
function NoteFlag() {
  return (
    <svg className="note-flag" width="12" height="12" viewBox="0 0 24 24" fill="none" role="img" aria-label="Has athlete notes">
      <title>Has athlete notes</title>
      <path
        d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"
        fill="currentColor"
      />
    </svg>
  );
}
