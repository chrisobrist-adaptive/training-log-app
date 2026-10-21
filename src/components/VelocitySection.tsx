import type { LoggedSet } from "../lib/types";

// Optional bar-speed entry for one exercise in the athlete's log: the
// fastest and slowest rep of each set, in m/s (stored on logged_sets as
// velocity_fast / velocity_slow). Always shown open, with a plain heading,
// so it's obvious where velocity goes.

function parseVelocity(raw: string): number | null | undefined {
  const text = raw.trim().replace(",", ".");
  if (text === "") return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value >= 10) return undefined; // invalid — ignore
  return Math.round(value * 100) / 100;
}

export default function VelocitySection({
  exerciseId,
  setNumbers,
  loggedSets,
  onSaveSet,
}: {
  exerciseId: string;
  setNumbers: number[];
  loggedSets: LoggedSet[];
  onSaveSet: (exerciseId: string, setNumber: number, patch: Partial<LoggedSet>) => void;
}) {
  const rows = loggedSets.filter((s) => s.exercise_id === exerciseId);

  const save = (setNumber: number, field: "velocity_fast" | "velocity_slow", raw: string, input: HTMLInputElement) => {
    const existing = rows.find((s) => s.set_number === setNumber);
    const value = parseVelocity(raw);
    if (value === undefined) {
      input.value = existing?.[field] != null ? String(existing[field]) : "";
      return;
    }
    if ((existing?.[field] ?? null) === value) return;
    if (!existing && value === null) return; // nothing to clear — don't create an empty row
    onSaveSet(exerciseId, setNumber, { [field]: value });
    input.value = value != null ? String(value) : "";
  };

  return (
    <div className="velocity-section">
      <div className="velocity-heading">Velocity (m/s)</div>
      <table className="log-set-table velocity-table">
        <thead>
          <tr>
            <th>Set</th>
            <th>Fastest</th>
            <th>Slowest</th>
          </tr>
        </thead>
        <tbody>
          {setNumbers.map((n) => {
            const row = rows.find((s) => s.set_number === n);
            return (
              <tr key={n}>
                <td>{n}</td>
                {(["velocity_fast", "velocity_slow"] as const).map((field) => (
                  <td key={field}>
                    <input
                      key={`${exerciseId}-${n}-${field}-${row?.[field] ?? ""}`}
                      className="log-cell-input"
                      type="text"
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`Set ${n} ${field === "velocity_fast" ? "fastest" : "slowest"} rep, m/s`}
                      defaultValue={row?.[field] != null ? String(row[field]) : ""}
                      onBlur={(e) => save(n, field, e.target.value, e.target)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
