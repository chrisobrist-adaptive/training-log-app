// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `eq` (byte
// offset 906391). A standalone single-session page reachable at
// `/day/:dayId` — loads everything needed to run `SessionPlayer`
// (week, day, exercises + their inventory, logged sets, that week's
// effective 1RMs) from nothing but the training_day id, with no
// athlete/week/block context assumed up front. Nothing reconstructed
// so far links TO this route (not TrainingLog.tsx, not AthleteDetail,
// not Dashboard) — still worth asking Chris what it's for (a
// bookmarkable/shareable single-session link? a notification
// deep-link?) — but the route and this page are both real and
// confirmed in the bundle regardless of what links to them.
//
// Deliberately simpler error recovery than TrainingLog.tsx's own
// SessionPlayer wiring: a failed save here just alerts and leaves the
// optimistic local state as-is — no `loadActiveWeekData()`-style full
// reload on error, because this page has no such reload function (it's
// not part of a larger week view). Confirmed exact, not an oversight.
//
// The two load errors are distinguished deliberately: a row genuinely
// not existing (`!day`/`!week`) shows "that session couldn't be
// found" with a way back to "/"; a QUERY failing (network/server
// issue) shows a different message with a "Try again" button that
// just increments a counter to re-run the load effect — the same
// retry-via-counter pattern, not a coincidence.

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { fetchWeekOneRms } from "../lib/queries";
import type { Week, TrainingDay, Exercise, LoggedSet, WeekEffective1Rm } from "../lib/types";
import SessionPlayer from "../components/SessionPlayer";

export default function DayDetail() {
  const { dayId } = useParams<{ dayId: string }>();
  const navigate = useNavigate();

  const [week, setWeek] = useState<Week | null>(null);
  const [oneRm, setOneRm] = useState<WeekEffective1Rm | null>(null);
  const [day, setDay] = useState<TrainingDay | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    (async () => {
      if (!dayId) return;
      setLoading(true);
      const [{ data: dayData, error: dayError }, { data: exerciseRows, error: exercisesError }] = await Promise.all([
        supabase.from("training_days").select("*").eq("id", dayId).single(),
        supabase.from("exercises").select("*, exercise_inventory(*)").eq("training_day_id", dayId).order("order_index"),
      ]);
      if (dayError || exercisesError) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setLoadError(false);
      if (!dayData) {
        setDay(null);
        setLoading(false);
        return;
      }
      setDay(dayData);
      const exList = (exerciseRows ?? []) as Exercise[];
      setExercises(exList);
      const [{ data: weekData, error: weekError }, setsResult, oneRmsResult] = await Promise.all([
        supabase.from("weeks").select("*").eq("id", dayData.week_id).single(),
        exList.length > 0
          ? supabase.from("logged_sets").select("*").in("exercise_id", exList.map((ex) => ex.id))
          : Promise.resolve({ data: [], error: null }),
        fetchWeekOneRms([dayData.week_id]),
      ]);
      if (weekError || setsResult.error) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      setWeek(weekData ?? null);
      setOneRm(oneRmsResult[0] ?? null);
      setLoggedSets(setsResult.data ?? []);
      setLoading(false);
    })();
  }, [dayId, retryCount]);

  if (loading) return <p className="muted">Loading…</p>;

  if (loadError) {
    return (
      <div className="narrow-page">
        <p className="muted">Couldn't load this session — this looks like a temporary connection or server issue, not a missing session.</p>
        <button className="secondary-button" onClick={() => setRetryCount((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }

  if (!day || !week) {
    return (
      <div className="narrow-page">
        <p className="muted">That session couldn't be found.</p>
        <button className="secondary-button" onClick={() => navigate("/")}>
          ← Back to sessions
        </button>
      </div>
    );
  }

  return (
    <div className="narrow-page">
      <SessionPlayer
        week={week}
        day={day}
        exercises={exercises.slice().sort((a, b) => a.order_index - b.order_index)}
        loggedSets={loggedSets}
        oneRms={oneRm}
        onSaveSet={async (exerciseId, setNumber, patch) => {
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
          if (error) window.alert(`Couldn't save that set: ${error.message}`);
        }}
        onRemoveSet={async (exerciseId, setNumber) => {
          setLoggedSets((prev) => prev.filter((s) => s.exercise_id !== exerciseId || s.set_number !== setNumber));
          const { error } = await supabase.from("logged_sets").delete().eq("exercise_id", exerciseId).eq("set_number", setNumber);
          if (error) window.alert(`Couldn't remove that set: ${error.message}`);
        }}
        onSaveNotes={async (exerciseId, patch) => {
          setExercises((prev) => prev.map((ex) => (ex.id === exerciseId ? { ...ex, ...patch } : ex)));
          const { error } = await supabase.from("exercises").update(patch).eq("id", exerciseId);
          if (error) window.alert(`Couldn't save your note: ${error.message}`);
        }}
        onEnd={async () => {
          if (!day) return;
          const { error } = await supabase.from("training_days").update({ completed_at: new Date().toISOString() }).eq("id", day.id);
          if (error) {
            window.alert(`Couldn't mark this session finished: ${error.message}`);
            return;
          }
          navigate("/history");
        }}
        onExit={() => navigate("/")}
      />
    </div>
  );
}
