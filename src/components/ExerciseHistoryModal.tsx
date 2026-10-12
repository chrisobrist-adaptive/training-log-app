import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// NEW 2026-10-05, per athlete request: "they did 1 set of 12 reps at 50kg
// one week, and the next they do 1 set of 13 reps of 52.5kg the next, but
// in week three they don't remember what they did — so they can click the
// exercise to view a history of what's been done."
//
// Tapping an exercise's name (in SessionPlayer's preview list OR its
// station-view card) opens this modal. It queries ALL logged history for
// that exercise_inventory_id, across every one of the athlete's deployed +
// completed blocks — not just the current one. That's safe and free: RLS
// on exercises/training_days/logged_sets/weeks already transitively scopes
// every row to `blocks.athlete_id = auth.uid() AND blocks.status IN
// ('deployed','completed')`, so filtering only by exercise_inventory_id
// (shared/coach-owned, but RLS-joined through to the athlete's own rows)
// can never leak another athlete's data — confirmed against pg_policies
// and against real production data (an athlete with 9 logged sessions of
// the same accessory exercise spanning two separate blocks) before this
// shipped.
//
// Styling deliberately reuses .modal-backdrop / .card / .log-preview-row —
// the same classes InviteModal already uses — rather than adding new CSS.
//
// Fixed 2026-10-06 (dist-v10): a session only got `date` (and so only
// showed up at all, per the filter below) when training_days.completed_at
// was set — which only happens once the athlete taps "End session". Real
// logged sets can exist without that ever happening (confirmed against
// Chris's own test account: 3 fully-logged sets for "Close grip lat
// pulldown" in week 1, completed_at still null), so the whole session was
// silently dropped from history even though it had real data. Now the
// query also pulls each set's created_at, and falls back to the most
// recent one as the display date whenever completed_at is absent — the
// inclusion test is "are there real logged sets", not "was the session
// formally ended".

interface HistorySession {
  date: string;
  weekNumber?: number;
  blockName?: string;
  sets: { set_number: number; weight: number | null; reps: number | null; rpe: number | null }[];
}

interface ExerciseHistoryModalProps {
  exerciseInventoryId: string;
  exerciseName?: string;
  onClose: () => void;
}

export default function ExerciseHistoryModal({ exerciseInventoryId, exerciseName, onClose }: ExerciseHistoryModalProps) {
  const [rows, setRows] = useState<HistorySession[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select(
          "id, training_days(day_label, completed_at, weeks(week_number, blocks(name))), logged_sets(set_number, weight, reps, rpe, status, created_at)",
        )
        .eq("exercise_inventory_id", exerciseInventoryId);
      if (cancelled) return;
      if (error) {
        setErr(true);
        return;
      }
      const sessions: HistorySession[] = (data ?? [])
        .map((ex: any) => {
          const sets = (ex.logged_sets ?? [])
            .filter((s: any) => s.weight != null || s.reps != null || s.rpe != null)
            .sort((a: any, b: any) => a.set_number - b.set_number);
          const fallbackDate: string | null =
            sets.length > 0
              ? sets.reduce((latest: string | null, s: any) => (!latest || new Date(s.created_at) > new Date(latest) ? s.created_at : latest), null)
              : null;
          return {
            date: ex.training_days?.completed_at ?? fallbackDate,
            weekNumber: ex.training_days?.weeks?.week_number,
            blockName: ex.training_days?.weeks?.blocks?.name,
            sets,
          };
        })
        .filter((s: HistorySession) => s.sets.length > 0 && s.date)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRows(sessions);
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseInventoryId]);

  function formatSet(s: { weight: number | null; reps: number | null; rpe: number | null }) {
    const bits: string[] = [];
    if (s.reps != null) bits.push(`${s.reps} rep${s.reps === 1 ? "" : "s"}`);
    if (s.weight != null) bits.push(`@ ${s.weight}kg`);
    if (s.rpe != null) bits.push(`RPE ${s.rpe}`);
    return bits.length > 0 ? bits.join(" ") : "logged";
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "420px", maxHeight: "80vh", overflowY: "auto" }}>
        <h1>{exerciseName ?? "History"}</h1>
        {rows === null && !err && <p className="muted">Loading…</p>}
        {err && <p className="muted">Couldn't load history right now.</p>}
        {rows && rows.length === 0 && <p className="muted">No history logged for this exercise yet.</p>}
        {rows && rows.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {rows.map((s, idx) => (
              <div key={idx} className="log-preview-row">
                <div className="log-preview-row-text">
                  <strong>
                    {new Date(s.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {s.blockName ? ` · ${s.blockName}` : ""}
                    {s.weekNumber ? ` · Week ${s.weekNumber}` : ""}
                  </strong>
                  <span className="muted">{s.sets.map(formatSet).join(", ")}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="toolbar" style={{ marginTop: "1rem" }}>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
