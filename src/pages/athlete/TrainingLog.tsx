import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { loadOneRmsForWeeks } from "../../lib/queries";
import BlockSwitcher from "../../components/BlockSwitcher";
import CalendarStrip, { type CalendarSlot } from "../../components/CalendarStrip";
import SessionPlayer from "../../components/SessionPlayer";
import type { Block, Week, TrainingDay, Exercise, LoggedSet } from "../../lib/types";

// RECONSTRUCTED 2026-10-05 from the live production bundle, together with
// the rolling-calendar feature described below. The unchanged parts (data
// loading, set/note saving, the unassigned-day list, the block/week
// switchers) are translated 1:1 from the minified source and were not
// independently re-verified beyond that translation — treat them as a
// faithful reconstruction, not a from-scratch rewrite. Some referenced
// files (SessionPlayer, BlockSwitcher, WeekSwitcher, the full
// lib/types.ts, AuthContext) are themselves only partially recovered —
// see BACKUP_STATUS.md before relying on their exact shape.
//
// --- The rolling-calendar change (the reason this file was touched) ---
// Previously, which training day opened by default was driven entirely by
// completion status: "the first day in the current week you haven't
// ticked off, else the last day" — and which WEEK was active worked the
// same way, one level up. That meant a session an athlete forgot to mark
// complete kept reopening on that stale day indefinitely, even once they
// were actually several sessions ahead.
//
// Now, every training day in the deployed block is mapped to a real
// calendar date (see buildCalendarSlots below), and the day/week that
// opens by default is whichever one's date is today — completion status
// plays no part in the default any more. Past days (including ones with
// nothing logged) stay reachable by tapping them in the calendar; a day
// with no training_day assigned to it just renders as a "rest day" slot.
export default function TrainingLog() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [oneRmsByWeek, setOneRmsByWeek] = useState<Record<string, unknown>>({});
  const [weekTrainingDays, setWeekTrainingDays] = useState<TrainingDay[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedWeekIds, setCompletedWeekIds] = useState<Set<string>>(new Set());
  const [completedBlockIds, setCompletedBlockIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);

  // Light, block-wide projection of every training day in the active
  // block (every week, not just the one currently open) — just enough
  // (weekday + completed_at) to build the calendar strip and resolve
  // "today" without re-fetching exercises/sets for weeks the athlete
  // isn't actually looking at.
  const [blockTrainingDaysLight, setBlockTrainingDaysLight] = useState<
    Pick<TrainingDay, "id" | "week_id" | "completed_at" | "weekday" | "day_label" | "order_index">[]
  >([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const activeBlock = blocks.find((b) => b.id === activeBlockId) ?? null;
  const weeksInActiveBlock = useMemo(
    () => weeks.filter((w) => w.block_id === activeBlockId).sort((a, b) => a.week_number - b.week_number),
    [weeks, activeBlockId],
  );

  const lightDaysByWeek = useMemo(() => {
    const map = new Map<string, typeof blockTrainingDaysLight>();
    for (const d of blockTrainingDaysLight) {
      if (d.weekday == null) continue;
      const arr = map.get(d.week_id);
      arr ? arr.push(d) : map.set(d.week_id, [d]);
    }
    return map;
  }, [blockTrainingDaysLight]);

  // Every (week, weekday) slot in the block, each tagged with its real
  // calendar date.
  //
  // History of this anchor (kept for context, both earlier designs were
  // shipped and then replaced):
  //   1. Originally anchored week 1 to the deploy date's OWN weekday, to
  //      avoid "week 1" padding with dates before the block existed.
  //   2. 2026-10-08 (dist-v12): that deploy-weekday anchor made each
  //      week's 7 slots non-chronological whenever the deploy day wasn't
  //      a Monday (confirmed against Kennan's real block, deployed Wed —
  //      "week 4" came out Mon Oct5, Tue Oct6, Wed Sep30, Thu Oct1, ...).
  //      Patched by sorting each week's 7 slots by date before pushing.
  //   3. 2026-10-08 (dist-v13, current): Chris's actual workflow is to
  //      always deploy a block AHEAD of when an athlete needs to start it
  //      — never the week of — and expects the FOLLOWING Monday to be
  //      week 1 day 1 regardless of which weekday he happens to hit
  //      "deploy" on. Neither of the earlier designs modeled that: #1 and
  //      #2 both made week 1 start ON the deploy date itself, which is
  //      why Dalton's block (deployed Thursday) showed a permanently
  //      Thursday-first grid ("THU FRI SAT SUN MON TUE WED") instead of a
  //      normal calendar week — confirmed against his real block.
  //
  // Current fix: anchor week 1 to the Monday ON OR AFTER the deploy date
  // (a no-op for an actual Monday deploy; any other day rolls FORWARD to
  // the next Monday — never backward, so there's still no padding with
  // dates before the block existed). Every week is now a clean, always-
  // chronological Mon-Sun span, so the v12 per-week sort is no longer
  // needed and was removed. If an athlete happens to open the app in the
  // gap between deploy and that following Monday (not part of Chris's
  // normal workflow, but handled anyway), the "today" resolution below
  // already clamps to calendarSlots[0] — i.e. the upcoming Monday — via
  // its existing before-block-start fallback, so no separate handling
  // was needed here.
  const calendarSlots: CalendarSlot[] = useMemo(() => {
    if (!activeBlock || !activeBlock.deployed_at || weeksInActiveBlock.length === 0) return [];
    const deploy = new Date(activeBlock.deployed_at);
    deploy.setHours(0, 0, 0, 0);
    const deployWeekday = (deploy.getDay() + 6) % 7; // 0=Mon..6=Sun
    const base = new Date(deploy);
    base.setDate(base.getDate() + (deployWeekday === 0 ? 0 : 7 - deployWeekday)); // next Monday on/after deploy
    const out: CalendarSlot[] = [];
    for (const wk of weeksInActiveBlock) {
      const days = lightDaysByWeek.get(wk.id) ?? [];
      const byWeekday = new Map(days.map((d) => [d.weekday, d]));
      for (let wd = 0; wd < 7; wd++) {
        const date = new Date(base);
        date.setDate(date.getDate() + (wk.week_number - 1) * 7 + wd);
        const day = byWeekday.get(wd);
        out.push({ weekId: wk.id, date, day: day ? { id: day.id, completed_at: day.completed_at } : null, wd });
      }
    }
    return out;
  }, [activeBlock, weeksInActiveBlock, lightDaysByWeek]);

  // Resolve the best slot in a specific week — used when the athlete
  // manually switches weeks (via the dropdown, or the week-completion
  // auto-advance below), so the day/date selection stays in sync with
  // whatever week they just moved to instead of going stale. Prefers the
  // same weekday as whatever's currently selected, for continuity.
  function resolveSlotForWeek(weekId: string, preferWeekday: number | null): CalendarSlot | null {
    const inWeek = calendarSlots.filter((s) => s.weekId === weekId);
    if (inWeek.length === 0) return null;
    const preferred = preferWeekday != null ? inWeek.find((s) => s.wd === preferWeekday) : null;
    return preferred ?? inWeek.find((s) => s.day) ?? inWeek[0];
  }

  const loadBlocksAndWeeks = async () => {
    if (!profile) return;
    setLoading(true);
    const { data: blockRows, error: blockErr } = await supabase
      .from("blocks")
      .select("*")
      .eq("athlete_id", profile.id)
      .in("status", ["deployed", "completed"])
      .order("order_index");
    if (blockErr) {
      setError(true);
      setLoading(false);
      return;
    }
    setError(false);
    const loadedBlocks = (blockRows ?? []) as Block[];
    setBlocks(loadedBlocks);
    if (loadedBlocks.length === 0) {
      setWeeks([]);
      setCompletedWeekIds(new Set());
      setCompletedBlockIds(new Set());
      setActiveBlockId(null);
      setBlockTrainingDaysLight([]);
      setLoading(false);
      return;
    }

    const { data: weekRows, error: weekErr } = await supabase
      .from("weeks")
      .select("*")
      .in("block_id", loadedBlocks.map((b) => b.id))
      .order("week_number");
    if (weekErr) {
      setError(true);
      setLoading(false);
      return;
    }
    const loadedWeeks = (weekRows ?? []) as Week[];
    setWeeks(loadedWeeks);
    loadOneRmsForWeeks(loadedWeeks.map((w) => w.id)).then((rows) => {
      setOneRmsByWeek(Object.fromEntries(rows.map((r) => [r.week_id, r])));
    });

    const { data: dayRows, error: dayErr } = await supabase
      .from("training_days")
      .select("id, week_id, completed_at, weekday, day_label, order_index")
      .in("week_id", loadedWeeks.map((w) => w.id));
    if (dayErr) {
      setError(true);
      setLoading(false);
      return;
    }
    setBlockTrainingDaysLight(dayRows ?? []);

    const perWeekCounts = new Map<string, { total: number; completed: number }>();
    for (const d of dayRows ?? []) {
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

    const weeksByBlock = new Map<string, Week[]>();
    for (const w of loadedWeeks) {
      const arr = weeksByBlock.get(w.block_id) ?? [];
      arr.push(w);
      weeksByBlock.set(w.block_id, arr);
    }
    const fullyCompletedBlocks = new Set<string>();
    for (const b of loadedBlocks) {
      const blockWeeks = weeksByBlock.get(b.id) ?? [];
      if (blockWeeks.length > 0 && blockWeeks.every((w) => fullyCompletedWeeks.has(w.id))) {
        fullyCompletedBlocks.add(b.id);
      }
    }
    setCompletedBlockIds(fullyCompletedBlocks);

    setActiveBlockId((current) => {
      if (current && loadedBlocks.some((b) => b.id === current)) return current;
      const persisted = profile ? readPersisted(activeBlockKey(profile.id)) : null;
      if (persisted && loadedBlocks.some((b) => b.id === persisted)) return persisted;
      return (loadedBlocks.find((b) => !fullyCompletedBlocks.has(b.id)) ?? loadedBlocks[loadedBlocks.length - 1])?.id ?? null;
    });
    setLoading(false);
  };

  useEffect(() => {
    loadBlocksAndWeeks();
  }, [profile?.id]);

  // The "what's today's session" resolution. Runs whenever the active
  // block (re)loads or its weeks/training days change — NOT on every
  // render — so it sets the default once per fresh load and doesn't fight
  // with manual navigation during the same visit.
  useEffect(() => {
    if (!activeBlockId || weeksInActiveBlock.length === 0) {
      setActiveWeekId(null);
      setSelectedDayId(null);
      setSelectedDate(null);
      return;
    }
    if (calendarSlots.length === 0) {
      setActiveWeekId(weeksInActiveBlock[weeksInActiveBlock.length - 1].id);
      return;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let slot = calendarSlots.find((s) => s.date.getTime() === today.getTime());
    if (!slot) {
      // Block hasn't started yet, or has already run past its last week —
      // clamp to the nearest edge rather than showing nothing.
      slot = today < calendarSlots[0].date ? calendarSlots[0] : calendarSlots[calendarSlots.length - 1];
    }
    setActiveWeekId(slot.weekId);
    setSelectedDayId(slot.day ? slot.day.id : null);
    setSelectedDate(slot.date);
    followingToday.current = true;
  }, [activeBlockId, calendarSlots]);

  // Fixed 2026-10-06 (dist-v11): the effect above only computes "today"
  // once per fresh load (on mount, or when switching blocks) - it never
  // reruns just because real-world time has passed. A standalone/
  // home-screen PWA can sit resident in memory for days without a true
  // reload, so an athlete who opened the app once and just kept resuming
  // it from the background could be looking at a "today" computed days
  // ago. Confirmed against Kennan's real test data: his app was still
  // showing "today" as Oct 1st on Oct 8th - a week stale, while the
  // underlying calendar-anchor math itself was verified correct for his
  // block.
  //
  // Fix: re-run the same "find today's slot" resolution whenever the page
  // is foregrounded again, but ONLY while `followingToday` is still true -
  // i.e. the athlete hasn't deliberately navigated to a different day
  // since the last time "today" was computed (see the calendar's onSelect
  // below, which sets it false). That keeps a backgrounded-and-resumed app
  // snapped to the real current day without ever overriding someone who's
  // deliberately reviewing a past or future week.
  const followingToday = useRef(true);
  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      if (!followingToday.current) return;
      if (!activeBlockId || weeksInActiveBlock.length === 0 || calendarSlots.length === 0) return;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (selectedDate && selectedDate.getTime() === today.getTime()) return; // already correct
      let slot = calendarSlots.find((s) => s.date.getTime() === today.getTime());
      if (!slot) {
        slot = today < calendarSlots[0].date ? calendarSlots[0] : calendarSlots[calendarSlots.length - 1];
      }
      setActiveWeekId(slot.weekId);
      setSelectedDayId(slot.day ? slot.day.id : null);
      setSelectedDate(slot.date);
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [activeBlockId, weeksInActiveBlock, calendarSlots, selectedDate]);

  useEffect(() => {
    if (profile) writePersisted(activeBlockKey(profile.id), activeBlockId);
  }, [profile, activeBlockId]);
  useEffect(() => {
    if (profile) writePersisted(activeWeekKey(profile.id), activeWeekId);
  }, [profile, activeWeekId]);

  // If the currently active week just became fully completed, move on to
  // the next week automatically (an in-session convenience, independent
  // of the date-based default above) — and resolve a sensible day/date
  // for that next week at the same time, so the calendar doesn't go stale.
  const previouslyCompletedWeeks = useRef<Set<string>>(new Set());
  useEffect(() => {
    const prev = previouslyCompletedWeeks.current;
    if (activeWeekId && !prev.has(activeWeekId) && completedWeekIds.has(activeWeekId)) {
      const idx = weeksInActiveBlock.findIndex((w) => w.id === activeWeekId);
      const next = idx >= 0 ? weeksInActiveBlock[idx + 1] : undefined;
      if (next) {
        const preferWeekday = selectedDate ? (selectedDate.getDay() + 6) % 7 : null;
        const slot = resolveSlotForWeek(next.id, preferWeekday);
        setActiveWeekId(next.id);
        if (slot) {
          setSelectedDayId(slot.day ? slot.day.id : null);
          setSelectedDate(slot.date);
        }
      }
    }
    previouslyCompletedWeeks.current = completedWeekIds;
  }, [completedWeekIds, activeWeekId, weeksInActiveBlock]);

  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);

  const loadActiveWeekData = async () => {
    if (!activeWeekId) return;
    const { data: dayRows, error: dayErr } = await supabase
      .from("training_days")
      .select("*")
      .eq("week_id", activeWeekId)
      .order("order_index");
    if (dayErr) {
      setError(true);
      return;
    }
    setError(false);
    const days = (dayRows ?? []) as TrainingDay[];
    setWeekTrainingDays(days);
    if (days.length === 0) {
      setExercises([]);
      setLoggedSets([]);
      return;
    }
    const { data: exerciseRows, error: exErr } = await supabase
      .from("exercises")
      .select("*, exercise_inventory(*)")
      .in("training_day_id", days.map((d) => d.id))
      .order("order_index");
    if (exErr) {
      setError(true);
      return;
    }
    const loadedExercises = (exerciseRows ?? []) as Exercise[];
    setExercises(loadedExercises);
    if (loadedExercises.length === 0) {
      setLoggedSets([]);
      return;
    }
    const { data: setRows, error: setErr } = await supabase
      .from("logged_sets")
      .select("*")
      .in("exercise_id", loadedExercises.map((e) => e.id));
    if (setErr) {
      setError(true);
      return;
    }
    setLoggedSets((setRows ?? []) as LoggedSet[]);
  };

  useEffect(() => {
    loadActiveWeekData();
  }, [activeWeekId]);

  const sortedWeekDays = useMemo(
    () => weekTrainingDays.slice().sort((a, b) => a.order_index - b.order_index),
    [weekTrainingDays],
  );
  const assignedDays = useMemo(() => sortedWeekDays.filter((d) => d.weekday != null), [sortedWeekDays]);
  const unassignedDays = useMemo(() => sortedWeekDays.filter((d) => d.weekday == null), [sortedWeekDays]);

  useEffect(() => {
    if (profile) writePersisted(selectedDayKey(profile.id), selectedDayId);
  }, [profile, selectedDayId]);

  const activeWeek = weeksInActiveBlock.find((w) => w.id === activeWeekId) ?? null;
  const selectedDay = sortedWeekDays.find((d) => d.id === selectedDayId) ?? null;

  const saveNotes = async (exerciseId: string, patch: Partial<Exercise>) => {
    setExercises((prev) => prev.map((e) => (e.id === exerciseId ? { ...e, ...patch } : e)));
    const { error } = await supabase.from("exercises").update(patch).eq("id", exerciseId);
    if (error) {
      window.alert(`Couldn't save your note: ${error.message}`);
      loadActiveWeekData();
    }
  };

  const saveSet = async (exerciseId: string, setNumber: number, patch: Partial<LoggedSet>) => {
    setLoggedSets((prev) => {
      const idx = prev.findIndex((s) => s.exercise_id === exerciseId && s.set_number === setNumber);
      if (idx === -1) {
        return [...prev, { id: `local-${exerciseId}-${setNumber}`, exercise_id: exerciseId, set_number: setNumber, ...patch } as LoggedSet];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    const { error } = await supabase
      .from("logged_sets")
      .upsert({ exercise_id: exerciseId, set_number: setNumber, ...patch }, { onConflict: "exercise_id,set_number" });
    if (error) {
      window.alert(`Couldn't save that set: ${error.message}`);
      loadActiveWeekData();
    }
  };

  const removeSet = async (exerciseId: string, setNumber: number) => {
    setLoggedSets((prev) => prev.filter((s) => s.exercise_id !== exerciseId || s.set_number !== setNumber));
    const { error } = await supabase.from("logged_sets").delete().eq("exercise_id", exerciseId).eq("set_number", setNumber);
    if (error) {
      window.alert(`Couldn't remove that set: ${error.message}`);
      loadActiveWeekData();
    }
  };

  const endSession = async (day: TrainingDay) => {
    const { error } = await supabase.from("training_days").update({ completed_at: new Date().toISOString() }).eq("id", day.id);
    if (error) {
      window.alert(`Couldn't mark this session finished: ${error.message}`);
      return;
    }
    navigate("/history");
  };

  const calendarEl =
    calendarSlots.length > 0 ? (
      <CalendarStrip
        slots={calendarSlots}
        selectedDate={selectedDate}
        onSelect={(slot) => {
          // A deliberate tap on a day, or a ‹ › arrow click (both route
          // through here) - stop the visibilitychange effect above from
          // later snapping back to today and undoing this choice.
          followingToday.current = false;
          setActiveWeekId(slot.weekId);
          setSelectedDayId(slot.day ? slot.day.id : null);
          setSelectedDate(slot.date);
        }}
      />
    ) : null;

  if (loading) return <p className="muted">Loading…</p>;
  if (error && !activeBlock) {
    return (
      <div className="narrow-page">
        <p className="muted">Couldn't load your training log — this looks like a temporary connection or server issue, not missing data.</p>
        <button type="button" className="log-nav-btn primary" onClick={() => loadBlocksAndWeeks()}>
          Try again
        </button>
      </div>
    );
  }
  if (!activeBlock) {
    return <p className="muted">No training block has been deployed to you yet — check with your coach.</p>;
  }

  return (
    <div className="narrow-page">
      {error && (
        <p className="muted" style={{ marginBottom: "0.75rem" }}>
          Couldn't refresh just now — showing what was last loaded.{" "}
          <button
            type="button"
            onClick={() => {
              loadBlocksAndWeeks();
              loadActiveWeekData();
            }}
            style={{ background: "none", border: "none", padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit", textDecoration: "underline" }}
          >
            Retry
          </button>
        </p>
      )}
      {/* 2026-10-05: the Week dropdown (WeekSwitcher) was removed here per
          Chris - the calendar strip below now covers all week navigation,
          via its ‹ › arrows (see CalendarStrip's goToWeek) as well as
          tapping any day directly. Only the block switcher remains. */}
      <div className="log-top-nav">
        <BlockSwitcher blocks={blocks} activeBlockId={activeBlockId} completedBlockIds={completedBlockIds} onSelect={setActiveBlockId} />
      </div>

      {sortedWeekDays.length === 0 && calendarSlots.length === 0 && <p className="muted">Nothing programmed for this week yet.</p>}

      {unassignedDays.length > 0 && (
        <div className="section">
          {unassignedDays.map((day) => {
            const dayExercises = exercises.filter((e) => e.training_day_id === day.id);
            const isSelected = day.id === selectedDayId;
            return (
              <button
                key={day.id}
                type="button"
                className="secondary-button"
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                  padding: "0.75rem 1rem",
                  borderColor: isSelected ? "var(--accent)" : undefined,
                  color: isSelected ? "var(--accent)" : undefined,
                }}
                onClick={() => setSelectedDayId(day.id)}
              >
                <strong>{day.day_label}</strong>
                {day.completed_at ? (
                  <span className="badge badge-completed">Completed ✓</span>
                ) : (
                  <span className="muted">
                    {dayExercises.length} exercise{dayExercises.length === 1 ? "" : "s"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedDay && activeWeek && (
        <div style={{ marginBottom: "1.25rem" }} key={selectedDay.id}>
          <SessionPlayer
            week={activeWeek}
            day={selectedDay}
            exercises={exercises.filter((e) => e.training_day_id === selectedDay.id).sort((a, b) => a.order_index - b.order_index)}
            loggedSets={loggedSets}
            oneRms={oneRmsByWeek[activeWeek.id] ?? null}
            onSaveSet={saveSet}
            onRemoveSet={removeSet}
            onSaveNotes={saveNotes}
            onEnd={() => endSession(selectedDay)}
            weekdayStrip={calendarEl}
          />
        </div>
      )}

      {!selectedDay && activeWeek && calendarEl && (
        <div style={{ marginBottom: "1.25rem" }} key={selectedDate ? selectedDate.getTime() : 0}>
          {calendarEl}
          <p className="muted" style={{ textAlign: "center", padding: "1.4rem 1rem", border: "1px dashed var(--border)", borderRadius: "14px" }}>
            Rest day — nothing programmed.
          </p>
        </div>
      )}
    </div>
  );
}

// --- localStorage helpers (unchanged from before this feature) ---
// Keys are scoped per-profile; values are read/written defensively since
// localStorage can throw (private browsing, storage disabled, etc).
function activeBlockKey(profileId: string) {
  return `log-active-block:${profileId}`;
}
function activeWeekKey(profileId: string) {
  return `log-active-week:${profileId}`;
}
function selectedDayKey(profileId: string) {
  return `log-selected-day:${profileId}`;
}
function readPersisted(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePersisted(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}
