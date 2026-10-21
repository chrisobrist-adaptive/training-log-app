import { useEffect, useState } from "react";
import type { Week, TrainingDay, Exercise, LoggedSet } from "../lib/types";
import ExerciseHistoryModal from "./ExerciseHistoryModal";
import { clearRestTimerStorage } from "./RestTimer";

// RECONSTRUCTED 2026-10-05 from the live production bundle (minified
// identifier `sq`), together with the new "view exercise history" feature
// described below. This is the FIRST time this file has been recovered —
// previously only its prop signature was known (see BACKUP_STATUS.md). The
// translation is 1:1 from the minified source; the lift-color map, summary
// text builders (tq/nq/rq/iq/aq), the individual set-row component (cq),
// and a handful of small helpers (BK, WK/GK/KK, LK/RK, qK, VK) are NOT
// reproduced here yet — they're imported from sibling files below using my
// best-guess names/locations, none of which are independently confirmed.
// Treat this file as the clearest record of SessionPlayer's current
// behavior, not as something known to compile as-is.
import { liftColors } from "../lib/liftColors";
import type { OneRms } from "../lib/exerciseDefaults";
import {
  prescribedSummary,
  backdownSummary,
  allSetsLogged,
  setSummaryText,
  loggedRpeSummary,
} from "../lib/sessionPlayerHelpers";
import SetRow from "./SetRow";
import VelocitySection from "./VelocitySection";

function stationKey(dayId: string) {
  return `log-station:${dayId}`;
}
function extraSetsKey(dayId: string) {
  return `log-extra-sets:${dayId}`;
}
function clearSessionLocalStorage(dayId: string) {
  clearRestTimerStorage(dayId);
  try {
    localStorage.removeItem(stationKey(dayId));
    localStorage.removeItem(extraSetsKey(dayId));
  } catch {
    // ignore
  }
}

interface SessionPlayerProps {
  // Still passed (the page header shows week/day now) — kept so callers
  // don't change shape.
  week: Week;
  day: TrainingDay;
  exercises: Exercise[];
  loggedSets: LoggedSet[];
  oneRms: OneRms;
  onSaveSet: (exerciseId: string, setNumber: number, patch: Partial<LoggedSet>) => void;
  onRemoveSet: (exerciseId: string, setNumber: number) => void;
  onSaveNotes: (exerciseId: string, patch: Partial<Exercise>) => void;
  onEnd: () => void;
  onExit?: () => void;
  weekdayStrip?: React.ReactNode;
  // Called when a set is marked completed — the Training page starts the
  // default rest on its header RestTimer.
  onSetCompleted?: () => void;
}

export default function SessionPlayer({
  day,
  exercises,
  loggedSets,
  oneRms,
  onSaveSet,
  onRemoveSet,
  onSaveNotes,
  onEnd,
  onExit,
  weekdayStrip,
  onSetCompleted,
}: SessionPlayerProps) {
  const [stationIndex, setStationIndex] = useState(() => {
    try {
      const n = Number(localStorage.getItem(stationKey(day.id)));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  });
  const [extraSetsByExercise, setExtraSetsByExercise] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem(extraSetsKey(day.id));
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  // true = showing the pre-session "session preview" list; false = the
  // single-exercise "station view". Starts on the preview list only if
  // nothing has been logged for this day yet.
  const [showPreview, setShowPreview] = useState(() => {
    const idsInDay = new Set(exercises.map((e) => e.id));
    return !loggedSets.some(
      (s) => idsInDay.has(s.exercise_id) && (s.weight != null || s.reps != null || s.rpe != null),
    );
  });

  // Which exercise's history modal is currently open, if any.
  const [historyFor, setHistoryFor] = useState<{ id: string; name?: string } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(stationKey(day.id), String(stationIndex));
    } catch {
      // ignore
    }
  }, [stationIndex, day.id]);
  useEffect(() => {
    try {
      localStorage.setItem(extraSetsKey(day.id), JSON.stringify(extraSetsByExercise));
    } catch {
      // ignore
    }
  }, [extraSetsByExercise, day.id]);


  const endSession = () => {
    clearSessionLocalStorage(day.id);
    onEnd();
  };

  const clampedIndex = Math.min(stationIndex, Math.max(exercises.length - 1, 0));
  const exercise = exercises[clampedIndex];

  // Week/day and the rest timer live in the Training page header now; this
  // only keeps the optional back button.
  const header = onExit ? (
    <div className="log-header">
      <button type="button" className="log-back-btn" onClick={onExit} title="Back to sessions" aria-label="Back to sessions">
        ←
      </button>
    </div>
  ) : null;

  if (!exercise) {
    return (
      <div>
        {header}
        {weekdayStrip}
        <p className="muted" style={{ marginTop: "1rem" }}>
          Nothing programmed for this session.
        </p>
      </div>
    );
  }

  // --- Session preview: the pre-session list of every exercise in the day ---
  if (showPreview) {
    const hasAnyLogged = exercises.some((e) =>
      loggedSets.some((s) => s.exercise_id === e.id && (s.weight != null || s.reps != null || s.rpe != null)),
    );
    return (
      <div>
        {header}
        {weekdayStrip}
        <div className="log-preview-list">
          {exercises.map((e, idx) => {
            const color = e.exercise_inventory ? liftColors[e.exercise_inventory.lift] : "#9a9a9e";
            const loggedRpe = loggedRpeSummary(e, loggedSets);
            // Tapping anywhere on the row jumps straight to that exercise in
            // the station view (an alternative to "Start session"); tapping
            // the exercise name itself still opens its history instead.
            const openExercise = () => {
              setStationIndex(idx);
              setShowPreview(false);
            };
            return (
              <div
                key={e.id}
                className="log-preview-row log-preview-row-clickable"
                style={{ borderLeft: `3px solid ${color}` }}
                role="button"
                tabIndex={0}
                onClick={openExercise}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    openExercise();
                  }
                }}
              >
                <div className="log-preview-row-text">
                  <strong
                    style={e.exercise_inventory_id ? { cursor: "pointer", alignSelf: "flex-start" } : { alignSelf: "flex-start" }}
                    onClick={
                      e.exercise_inventory_id
                        ? (ev) => {
                            ev.stopPropagation();
                            setHistoryFor({ id: e.exercise_inventory_id!, name: e.exercise_inventory?.exercise_name });
                          }
                        : undefined
                    }
                  >
                    {e.exercise_inventory?.exercise_name ?? "Not set yet"}
                  </strong>
                  <span className="muted">{setSummaryText(e, oneRms)}</span>
                  {loggedRpe && <span style={{ color: "var(--good)", fontSize: "0.8rem" }}>Logged RPE: {loggedRpe}</span>}
                </div>
                {allSetsLogged(e, loggedSets) && (
                  <span className="log-head-check done" title="All sets logged">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className="log-end-btn" onClick={() => setShowPreview(false)}>
          {hasAnyLogged ? "Resume session →" : "Start session →"}
        </button>
        {historyFor && (
          <ExerciseHistoryModal
            exerciseInventoryId={historyFor.id}
            exerciseName={historyFor.name}
            onClose={() => setHistoryFor(null)}
          />
        )}
      </div>
    );
  }

  // --- Station view: one exercise card at a time ---
  const existingForExercise = loggedSets.filter((s) => s.exercise_id === exercise.id);
  const highestLoggedSetNumber = existingForExercise.reduce((max, s) => Math.max(max, s.set_number), 0);
  const extraSets = extraSetsByExercise[exercise.id] ?? 0;
  const ascendingSets = exercise.ascending_sets && exercise.ascending_sets.length > 0 ? exercise.ascending_sets : null;
  const mainSetCount = ascendingSets ? ascendingSets.length : exercise.prescribed_sets ?? 1;
  const backdownSetCount = exercise.backdown_sets ?? 0;
  const topSetSummary = prescribedSummary(exercise);
  const isLastExercise = clampedIndex === exercises.length - 1;
  const color = exercise.exercise_inventory ? liftColors[exercise.exercise_inventory.lift] : "#9a9a9e";
  const totalSetCount = mainSetCount + backdownSetCount;
  const allSetNumbers = Array.from(
    { length: Math.max(totalSetCount, highestLoggedSetNumber, 1) + extraSets },
    (_, i) => i + 1,
  );
  const mainRange = allSetNumbers.filter((n) => n <= mainSetCount);
  const backdownRange = allSetNumbers.filter((n) => n > mainSetCount && n <= totalSetCount);
  const overflowRange = allSetNumbers.filter((n) => n > totalSetCount);
  // When there are backdown sets, main/backdown render as two separate
  // tables with overflow attached to backdown; otherwise everything
  // (including overflow "extra" sets) renders in one table.
  const topTableRange = backdownSetCount > 0 ? mainRange : [...mainRange, ...overflowRange];
  const backdownTableRange = backdownSetCount > 0 ? [...backdownRange, ...overflowRange] : [];
  const backdownNote = backdownSummary(exercise);
  const isComplete = allSetsLogged(exercise, loggedSets);

  return (
    <div>
      {header}
      {weekdayStrip}
      <div className="log-exercise-card" style={{ borderLeft: `3px solid ${color}` }}>
        <div className="log-exercise-head">
          {exercise.exercise_inventory ? (
            <div className="log-avatar" style={{ background: `${color}29`, color, border: `1px solid ${color}66` }}>
              {exercise.exercise_inventory.lift.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div className="log-avatar" style={{ background: "rgba(224, 184, 58, 0.16)", color: "var(--warn)", border: "1px solid var(--warn)" }}>
              ⚠
            </div>
          )}
          <div
            className="log-exercise-name"
            style={exercise.exercise_inventory_id ? { cursor: "pointer" } : undefined}
            onClick={
              exercise.exercise_inventory_id
                ? () => setHistoryFor({ id: exercise.exercise_inventory_id!, name: exercise.exercise_inventory?.exercise_name })
                : undefined
            }
          >
            {exercise.exercise_inventory?.exercise_name ?? "Not set yet — check with your coach"}
          </div>
          <div className={`log-head-check${isComplete ? " done" : ""}`} title={isComplete ? "All sets logged" : "Sets remaining"}>
            {isComplete ? "✓" : ""}
          </div>
        </div>
        {topSetSummary && (
          <p className="muted" style={{ margin: "0 0 0.5rem", textAlign: "left" }}>
            {topSetSummary}
          </p>
        )}
        {topTableRange.length > 0 && (
          <table className="log-set-table">
            <thead>
              <tr>
                <th>Sets</th>
                <th>Weight</th>
                <th>Reps</th>
                <th>RPE</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {topTableRange.map((setNumber) => (
                <SetRow
                  key={`${exercise.id}-${setNumber}`}
                  setNumber={setNumber}
                  exercise={exercise}
                  oneRms={oneRms}
                  isBackdown={false}
                  ascendingEntry={ascendingSets && setNumber <= ascendingSets.length ? ascendingSets[setNumber - 1] : null}
                  existing={existingForExercise.find((s) => s.set_number === setNumber) ?? null}
                  onSave={(patch) => onSaveSet(exercise.id, setNumber, patch)}
                  onSetCompleted={onSetCompleted}
                />
              ))}
            </tbody>
          </table>
        )}
        {backdownTableRange.length > 0 && (
          <>
            <div className="log-set-group-label">
              <span className="log-set-group-dot backdown" />
              Backdown{backdownNote ? ` · ${backdownNote}` : ""}
            </div>
            <table className="log-set-table">
              <thead>
                <tr>
                  <th>Sets</th>
                  <th>Weight</th>
                  <th>Reps</th>
                  <th>RPE</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {backdownTableRange.map((setNumber) => (
                  <SetRow
                    key={`${exercise.id}-${setNumber}`}
                    setNumber={setNumber}
                    exercise={exercise}
                    oneRms={oneRms}
                    isBackdown={setNumber > mainSetCount && setNumber <= totalSetCount}
                    ascendingEntry={null}
                    existing={existingForExercise.find((s) => s.set_number === setNumber) ?? null}
                    onSave={(patch) => onSaveSet(exercise.id, setNumber, patch)}
                    onSetCompleted={onSetCompleted}
                  />
                ))}
              </tbody>
            </table>
          </>
        )}
        <div className="log-add-set-row">
          {extraSets > 0 && (
            <button
              type="button"
              style={{ marginRight: "0.75rem" }}
              onClick={() => {
                const setNumberToRemove = Math.max(totalSetCount, highestLoggedSetNumber, 1) + extraSets;
                setExtraSetsByExercise((prev) => ({ ...prev, [exercise.id]: extraSets - 1 }));
                onRemoveSet(exercise.id, setNumberToRemove);
              }}
            >
              − Remove set
            </button>
          )}
          <button type="button" onClick={() => setExtraSetsByExercise((prev) => ({ ...prev, [exercise.id]: extraSets + 1 }))}>
            + Add set
          </button>
        </div>
        <VelocitySection key={`velocity-${exercise.id}`} exerciseId={exercise.id} setNumbers={allSetNumbers} loggedSets={loggedSets} onSaveSet={onSaveSet} />
        <textarea
          key={exercise.id}
          className="log-notes"
          placeholder="Your comment on this exercise…"
          defaultValue={exercise.notes ?? ""}
          onBlur={(e) => onSaveNotes(exercise.id, { notes: e.target.value || null })}
        />
      </div>
      {/* Session preview (list icon) sits with Previous / Next so all the
          exercise navigation is in one place. */}
      <div className="toolbar" style={{ marginTop: "1rem", flexWrap: "nowrap" }}>
        <button type="button" className="log-nav-icon-btn" onClick={() => setShowPreview(true)} title="Session preview" aria-label="Session preview">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6h11M9 12h11M9 18h11" />
            <circle cx="4.5" cy="6" r="1" fill="currentColor" />
            <circle cx="4.5" cy="12" r="1" fill="currentColor" />
            <circle cx="4.5" cy="18" r="1" fill="currentColor" />
          </svg>
        </button>
        {clampedIndex > 0 && (
          <button type="button" className="log-nav-btn" onClick={() => setStationIndex(clampedIndex - 1)}>
            ← Previous
          </button>
        )}
        {!isLastExercise && (
          <button type="button" className="log-nav-btn primary" onClick={() => setStationIndex(clampedIndex + 1)}>
            Next →
          </button>
        )}
      </div>
      {isLastExercise && (
        <button type="button" className="log-end-btn" onClick={endSession}>
          End session
        </button>
      )}
      {historyFor && (
        <ExerciseHistoryModal
          exerciseInventoryId={historyFor.id}
          exerciseName={historyFor.name}
          onClose={() => setHistoryFor(null)}
        />
      )}
    </div>
  );
}
