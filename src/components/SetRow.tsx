import { useState } from "react";
import type { Exercise, LoggedSet } from "../lib/types";
import { prescribedWeight, backdownWeight, prescribedReps, backdownReps, type OneRms } from "../lib/exerciseDefaults";
import { suggestFromChart, type RpeChartLog } from "../lib/rpeChart";

// RECONSTRUCTED 2026-10-06 from the live production bundle (minified
// identifier `cq`), the first time this file has been recovered — it was
// previously imported by SessionPlayer.tsx but didn't exist in this tree
// (see that file's header comment). 1:1 translation of the minified
// source, including the companion `exerciseDefaults.ts` helpers and the
// 2026-10-06 fix (dist-v10) that makes reps actually pre-fill for
// accessory exercises — see exerciseDefaults.ts for why.
//
// Like SessionPlayer.tsx, this imports `Exercise`/`LoggedSet` from
// "../lib/types", which doesn't exist in this backup tree yet — that gap
// predates this change and isn't something this fix addresses.

const RPE_OPTIONS = ["10", "9.5", "9", "8.5", "8", "7.5", "7", "6.5", "6", "5.5", "5", "4.5", "4", "3.5", "3"];

type SetStatus = "completed" | "skipped" | "pending" | null;

function statusDisplay(status: SetStatus, rpe: number | null): "skipped" | "completed" | "blank" {
  if (status === "skipped") return "skipped";
  if (status === "completed") return "completed";
  if (status === "pending" || rpe == null) return "blank";
  return "completed";
}

interface SetRowProps {
  setNumber: number;
  exercise: Exercise;
  oneRms: OneRms;
  isBackdown: boolean;
  ascendingEntry: { weight: number | null; reps: number | null } | null;
  existing: LoggedSet | null;
  onSave: (patch: Partial<LoggedSet>) => void;
  onSetCompleted?: (() => void) | null;
  // The athlete's RPE chart, for a suggested weight when the set is
  // prescribed as reps @ RPE with no load (shown as a placeholder only — the
  // athlete types whatever they actually lift).
  rpeChartLogs?: RpeChartLog[] | null;
}

export default function SetRow({
  setNumber,
  exercise,
  oneRms,
  isBackdown,
  ascendingEntry,
  existing,
  onSave,
  onSetCompleted,
  rpeChartLogs,
}: SetRowProps) {
  const defaultWeight = existing?.weight ?? (isBackdown ? backdownWeight(exercise, oneRms) : ascendingEntry ? ascendingEntry.weight : prescribedWeight(exercise, oneRms));
  const defaultReps = existing?.reps ?? (isBackdown ? backdownReps(exercise) : ascendingEntry ? ascendingEntry.reps : prescribedReps(exercise));

  const [weight, setWeight] = useState<number | null>(defaultWeight);
  const [reps, setReps] = useState<number | null>(defaultReps);
  const [rpe, setRpe] = useState<number | null>(existing?.rpe ?? null);
  const [status, setStatus] = useState<SetStatus>((existing?.status as SetStatus) ?? null);

  const display = statusDisplay(status, rpe);

  const lift = exercise.exercise_inventory?.lift;
  const suggestion =
    weight == null && !ascendingEntry
      ? suggestFromChart(
          rpeChartLogs,
          lift,
          exercise.exercise_inventory?.rpe_chart_mode,
          reps,
          isBackdown ? exercise.backdown_rpe : exercise.prescribed_rpe,
          lift === "squat" ? oneRms?.squat_1rm : lift === "bench" ? oneRms?.bench_1rm : lift === "deadlift" ? oneRms?.deadlift_1rm : null,
        )
      : null;

  const save = (patch: Partial<LoggedSet>) => {
    const next = { weight, reps, rpe, status, ...patch };
    if (onSetCompleted && display !== "completed" && statusDisplay(next.status as SetStatus, next.rpe ?? null) === "completed") {
      onSetCompleted();
    }
    onSave(next);
  };

  const cycleStatus = () => {
    const next: SetStatus = display === "blank" ? "completed" : display === "completed" ? "skipped" : "pending";
    setStatus(next);
    save({ status: next });
  };

  const statusTitle =
    display === "completed" ? "Completed — tap to mark skipped" :
    display === "skipped" ? "Skipped — tap to clear" :
    "Tap to mark completed";
  const statusGlyph = display === "completed" ? "✓" : display === "skipped" ? "–" : "";

  return (
    <tr>
      <td>{setNumber}</td>
      <td>
        <input
          type="number"
          step={0.5}
          inputMode="decimal"
          aria-label={`Set ${setNumber} weight`}
          className="log-cell-input"
          value={weight ?? ""}
          placeholder={suggestion ? `≈${suggestion.weight}` : undefined}
          title={suggestion ? `Suggested from ${suggestion.personal ? "your" : "the default"} RPE chart: ${suggestion.pct.toFixed(1)}%` : undefined}
          onChange={(e) => setWeight(e.target.value === "" ? null : Number(e.target.value))}
          onBlur={() => save({ weight })}
        />
      </td>
      <td>
        <input
          type="number"
          inputMode="numeric"
          aria-label={`Set ${setNumber} reps`}
          className="log-cell-input"
          value={reps ?? ""}
          onChange={(e) => setReps(e.target.value === "" ? null : Number(e.target.value))}
          onBlur={() => save({ reps })}
        />
      </td>
      <td>
        <select
          aria-label={`Set ${setNumber} RPE`}
          className="log-cell-select"
          value={rpe ?? ""}
          onChange={(e) => {
            const next = e.target.value === "" ? null : Number(e.target.value);
            setRpe(next);
            save({ rpe: next });
          }}
        >
          <option value="">—</option>
          {RPE_OPTIONS.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td>
        <button
          type="button"
          className={`log-status-check${display === "blank" ? "" : ` ${display}`}`}
          onClick={cycleStatus}
          title={statusTitle}
          aria-label={statusTitle}
        >
          {statusGlyph}
        </button>
      </td>
    </tr>
  );
}
