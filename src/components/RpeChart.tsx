import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchRpeChartLogs } from "../lib/queries";
import { CHART_REPS, CHART_RPES, chartCell, roundToPlate, type ChartLift, type ChartMode, type RpeChartLog } from "../lib/rpeChart";

// An athlete's individualised RPE -> %1RM chart: reps 1-15 across, RPE 10
// down to 0. Cells they've logged (on competition / equipped squat, bench or
// deadlift) show the average of their last 5 logs and are shaded; the rest
// come from the default chart. Toggles: lift, competition vs equipped, and %
// vs kg (kg uses the athlete's current 1RM from their profile, rounded to
// 2.5 kg). Read-only — used on the coach's athlete page and the athlete's
// Graphs tab.

const LIFTS: { key: ChartLift; label: string }[] = [
  { key: "squat", label: "Squat" },
  { key: "bench", label: "Bench" },
  { key: "deadlift", label: "Deadlift" },
];

type OneRmRow = { squat_1rm: number | null; bench_1rm: number | null; deadlift_1rm: number | null };

export default function RpeChart({ athleteId }: { athleteId: string }) {
  const [logs, setLogs] = useState<RpeChartLog[] | null>(null);
  const [oneRms, setOneRms] = useState<OneRmRow | null>(null);
  const [lift, setLift] = useState<ChartLift>("squat");
  const [mode, setMode] = useState<ChartMode>("competition");
  const [unit, setUnit] = useState<"pct" | "kg">("pct");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchRpeChartLogs(athleteId),
      supabase.from("profiles").select("squat_1rm, bench_1rm, deadlift_1rm").eq("id", athleteId).single(),
    ]).then(([chartLogs, { data }]) => {
      if (cancelled) return;
      setLogs(chartLogs);
      setOneRms((data as OneRmRow | null) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  if (logs === null) return <p className="muted">Loading…</p>;

  const oneRm = oneRms ? oneRms[`${lift}_1rm`] : null;
  const personalCount = logs.filter((l) => l.lift === lift && l.mode === mode).length;

  return (
    <div className="rpe-chart">
      <div className="rpe-chart-controls">
        <div className="lift-tabs" style={{ marginBottom: 0 }}>
          {LIFTS.map((l) => (
            <button key={l.key} type="button" className={l.key === lift ? "active" : ""} onClick={() => setLift(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="lift-tabs" style={{ marginBottom: 0 }}>
          <button type="button" className={mode === "competition" ? "active" : ""} onClick={() => setMode("competition")}>
            Competition
          </button>
          <button type="button" className={mode === "equipped" ? "active" : ""} onClick={() => setMode("equipped")}>
            Equipped
          </button>
        </div>
        <div className="lift-tabs" style={{ marginBottom: 0 }}>
          <button type="button" className={unit === "pct" ? "active" : ""} onClick={() => setUnit("pct")}>
            %
          </button>
          <button type="button" className={unit === "kg" ? "active" : ""} onClick={() => setUnit("kg")}>
            kg
          </button>
        </div>
      </div>
      <p className="muted rpe-chart-note">
        {personalCount > 0
          ? `Shaded cells are from logged sets (average of up to the last 5); the rest are the default chart.`
          : `No logged sets for this lift yet — showing the default chart.`}
        {unit === "kg" && (oneRm ? ` Loads use the current 1RM of ${oneRm} kg.` : " No 1RM set for this lift, so loads can't be shown.")}
      </p>
      <div className="pt-scroll">
        <table className="rpe-chart-table">
          <thead>
            <tr>
              <th className="rpe-chart-rowhead">RPE</th>
              {CHART_REPS.map((r) => (
                <th key={r}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHART_RPES.map((rpe) => (
              <tr key={rpe}>
                <th className="rpe-chart-rowhead">{rpe}</th>
                {CHART_REPS.map((reps) => {
                  const cell = chartCell(logs, lift, mode, reps, rpe);
                  if (!cell) return <td key={reps} />;
                  const value =
                    unit === "pct" ? cell.pct.toFixed(1) : oneRm ? String(roundToPlate((cell.pct / 100) * oneRm)) : "—";
                  return (
                    <td
                      key={reps}
                      className={cell.n > 0 ? "rpe-cell-personal" : undefined}
                      title={`${reps} rep${reps === 1 ? "" : "s"} @ RPE ${rpe}: ${cell.pct.toFixed(1)}%${
                        cell.n > 0 ? ` (average of ${cell.n} logged set${cell.n === 1 ? "" : "s"})` : " (default chart)"
                      }`}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
