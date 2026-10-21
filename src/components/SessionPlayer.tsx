import { useEffect, useRef, useState } from "react";
import type { Week, TrainingDay, Exercise, LoggedSet } from "../lib/types";
import ExerciseHistoryModal from "./ExerciseHistoryModal";

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
  formatRestTime,
} from "../lib/sessionPlayerHelpers";
import SetRow from "./SetRow";

const REST_PRESETS = [60, 90, 120, 180, 300];

function stationKey(dayId: string) {
  return `log-station:${dayId}`;
}
function restEndKey(dayId: string) {
  return `log-rest-end:${dayId}`;
}
function extraSetsKey(dayId: string) {
  return `log-extra-sets:${dayId}`;
}
function clearSessionLocalStorage(dayId: string) {
  try {
    localStorage.removeItem(stationKey(dayId));
    localStorage.removeItem(restEndKey(dayId));
    localStorage.removeItem(extraSetsKey(dayId));
  } catch {
    // ignore
  }
}
function notifyRestStarted() {
  // best-effort browser notification when a rest timer begins — the exact
  // original implementation (permission handling etc.) wasn't recovered.
}
function notifyRestEnded() {
  // best-effort browser notification when a rest timer hits zero.
}

interface SessionPlayerProps {
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
}

export default function SessionPlayer({
  week,
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
}: SessionPlayerProps) {
  const [stationIndex, setStationIndex] = useState(() => {
    try {
      const n = Number(localStorage.getItem(stationKey(day.id)));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  });
  const [restEndAt, setRestEndAt] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem(restEndKey(day.id)));
      return Number.isFinite(n) && n > Date.now() ? n : null;
    } catch {
      return null;
    }
  });
  const [restSecondsLeft, setRestSecondsLeft] = useState(() =>
    restEndAt ? Math.ceil((restEndAt - Date.now()) / 1000) : 0,
  );
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

  const [restMenuOpen, setRestMenuOpen] = useState(false);

  function setRestTimer(seconds: number) {
    const endAt = seconds > 0 ? Date.now() + seconds * 1000 : null;
    setRestEndAt(endAt);
    setRestSecondsLeft(seconds > 0 ? seconds : 0);
    if (endAt) notifyRestStarted();
    try {
      if (endAt) localStorage.setItem(restEndKey(day.id), String(endAt));
      else localStorage.removeItem(restEndKey(day.id));
    } catch {
      // ignore
    }
  }
  const startDefaultRest = () => setRestTimer(180);

  const lastNotifiedEndAt = useRef<number | null>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      const secondsLeft = restEndAt ? Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000)) : 0;
      setRestSecondsLeft(secondsLeft);
      if (restEndAt && secondsLeft === 0 && lastNotifiedEndAt.current !== restEndAt) {
        lastNotifiedEndAt.current = restEndAt;
        notifyRestEnded();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [restEndAt]);

  const endSession = () => {
    clearSessionLocalStorage(day.id);
    onEnd();
  };

  const clampedIndex = Math.min(stationIndex, Math.max(exercises.length - 1, 0));
  const exercise = exercises[clampedIndex];

  const header = (
    <div className="log-header">
      {onExit && (
        <button type="button" className="log-back-btn" onClick={onExit} title="Back to sessions" aria-label="Back to sessions">
          ←
        </button>
      )}
      <h1>
        Week {week.week_number} · {day.day_label}
      </h1>
    </div>
  );

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
  const hiddenCount = exercises.length - clampedIndex - 1;
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
      <div className="log-header">
        {onExit && (
          <button type="button" className="log-back-btn" onClick={onExit} title="Back to sessions" aria-label="Back to sessions">
            ←
          </button>
        )}
        <h1>
          Week {week.week_number} · {day.day_label}
        </h1>
        <button
          type="button"
          className={`log-clock-btn${restSecondsLeft > 0 ? " running" : ""}`}
          onClick={() => setRestMenuOpen((v) => !v)}
          title="Rest timer"
          aria-label="Rest timer"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 1.5" />
            <path d="M9 2h6" />
          </svg>
          {restSecondsLeft > 0 && <span className="log-clock-badge">{formatRestTime(restSecondsLeft)}</span>}
        </button>
        {restMenuOpen && (
          <div className="log-timer-dropdown">
            <div className="rest-caption">Rest</div>
            <div className="big-time">{formatRestTime(restSecondsLeft)}</div>
            <div className="log-preset-grid">
              {REST_PRESETS.map((seconds) => (
                <button key={seconds} type="button" className="log-preset-chip" onClick={() => setRestTimer(seconds)}>
                  {formatRestTime(seconds)}
                </button>
              ))}
            </div>
            <div className="log-adjust-row">
              <button type="button" onClick={() => setRestTimer(Math.max(0, restSecondsLeft - 15))}>
                −15s
              </button>
              <button type="button" onClick={() => setRestTimer(restSecondsLeft + 15)}>
                +15s
              </button>
            </div>
            <button type="button" className="log-reset-btn" onClick={() => setRestTimer(0)}>
              reset
            </button>
          </div>
        )}
      </div>
      {weekdayStrip}
      <p className="log-station-label">
        Exercise {clampedIndex + 1} of {exercises.length} ·{" "}
        <button type="button" className="link-button" onClick={() => setShowPreview(true)}>
          Session preview
        </button>
      </p>
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
                  onSetCompleted={startDefaultRest}
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
                    onSetCompleted={startDefaultRest}
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
        <textarea
          key={exercise.id}
          className="log-notes"
          placeholder="Your comment on this exercise…"
          defaultValue={exercise.notes ?? ""}
          onBlur={(e) => onSaveNotes(exercise.id, { notes: e.target.value || null })}
        />
      </div>
      {(clampedIndex > 0 || !isLastExercise) && (
        <div className="toolbar" style={{ marginTop: "1rem" }}>
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
      )}
      {hiddenCount > 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: "0.5rem" }}>
          Next exercises hidden ({hiddenCount}) — they appear one at a time.
        </p>
      )}
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
