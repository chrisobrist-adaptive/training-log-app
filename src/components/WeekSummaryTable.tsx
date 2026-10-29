// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `yl` (byte
// offset 459345 — confirmed the real app-code function; occurrence 0 of
// "function yl(" at byte 127314 is an unrelated React-internal
// reconciliation function reusing the same short name). This is
// AthleteDetail's INTERACTIVE week-summary table: lift tabs
// (total/squat/bench/deadlift — confirmed "total" listed FIRST here,
// unlike PlannedMetricsTable's row order which lists it last) plus a
// metrics-grid of tiles for whichever lift is selected, built from
// actual LOGGED data (`fetchWeeklyMetrics`) — not the read-only,
// all-rows-at-once, planned-data table BlockBuilder uses
// (`PlannedMetricsTable.tsx`, minified `fK`) — confirmed two genuinely
// separate components in the bundle, not two callers of one.
//
//   gl=[{key:`total`,...},{key:`squat`,...},{key:`bench`,...},{key:`deadlift`,...}]
//   function yl({metricsByLift:e,activeLift:t,onLiftChange:n}){
//     let r=e[t];
//     return <div>
//       <div className="lift-tabs">{gl.map(tab => <button className={t===tab.key?"active":""} onClick={()=>n(tab.key)}>{tab.label}</button>)}</div>
//       {r ? <div className="metrics-grid">
//         <MetricTile label="Volume" value={_l(r.volume,0)} sub={r.volume_pct_change} />
//         <MetricTile label="Sets" value={_l(r.sets,0)} />
//         <MetricTile label="ACWR" value={_l(r.acwr,2)} />
//         {t!=="total" && <MetricTile label="E1RM" value={_l(r.e1rm==null?null:hl(r.e1rm,2.5),1)} sub={r.e1rm_pct_change} />}
//         <MetricTile label="aRI (%1RM)" value={_l(r.ari,1)} />
//         {t!=="total" && <MetricTile label="Peak intensity (%1RM)" value={_l(r.peak_intensity,1)} />}
//         {t!=="total" && <MetricTile label="Monotony" value={_l(r.monotony,2)} />}
//         {t!=="total" && <MetricTile label="Exertion load" value={_l(r.exertion_load,0)} />}
//       </div> : <p className="muted">No data logged for this week yet.</p>}
//     </div>
//   }
//   function bl({label:e,value:t,sub:n}){ ... } // the metric-tile component, renamed MetricTile here
//   function hl(e,t){return Math.round(e/t)*t} // renamed roundToNearest here

import type { WeeklyMetrics } from "../lib/types";
import { formatMetric, pctChangeClass } from "../lib/metricsFormat";

type LiftKey = "total" | "squat" | "bench" | "deadlift";

const LIFT_TABS: { key: LiftKey; label: string }[] = [
  { key: "total", label: "Weekly total" },
  { key: "squat", label: "Squat" },
  { key: "bench", label: "Bench" },
  { key: "deadlift", label: "Deadlift" },
];

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: number | null }) {
  return (
    <div className="metric-tile">
      <div className="value">
        {value}
        {sub != null && (
          <span className={pctChangeClass(sub)} style={{ fontSize: "0.8rem", marginLeft: 6 }}>
            {sub > 0 ? "+" : ""}
            {sub.toFixed(1)}%
          </span>
        )}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}

export default function WeekSummaryTable({
  metricsByLift,
  activeLift,
  onLiftChange,
}: {
  metricsByLift: Partial<Record<string, WeeklyMetrics>>;
  activeLift: LiftKey;
  onLiftChange: (lift: LiftKey) => void;
}) {
  const row = metricsByLift[activeLift];
  return (
    <div>
      <div className="lift-tabs">
        {LIFT_TABS.map((tab) => (
          <button key={tab.key} className={activeLift === tab.key ? "active" : ""} onClick={() => onLiftChange(tab.key)} type="button">
            {tab.label}
          </button>
        ))}
      </div>
      {row ? (
        <div className="metrics-grid">
          <MetricTile label="Volume" value={formatMetric(row.volume, 0)} sub={row.volume_pct_change} />
          <MetricTile label="Sets" value={formatMetric(row.sets, 0)} />
          <MetricTile label="ACWR" value={formatMetric(row.acwr, 2)} />
          {activeLift !== "total" && (
            <MetricTile label="E1RM" value={formatMetric(row.e1rm == null ? null : roundToNearest(row.e1rm, 2.5), 1)} sub={row.e1rm_pct_change} />
          )}
          <MetricTile label="aRI (%1RM)" value={formatMetric(row.ari, 1)} />
          {activeLift !== "total" && <MetricTile label="Peak intensity (%1RM)" value={formatMetric(row.peak_intensity, 1)} />}
          {activeLift !== "total" && <MetricTile label="Monotony" value={formatMetric(row.monotony, 2)} />}
          {activeLift !== "total" && <MetricTile label="Exertion load" value={formatMetric(row.exertion_load, 2)} />}
          {activeLift !== "total" && <MetricTile label="Peripheral EL" value={formatMetric(row.peripheral, 2)} />}
          {activeLift !== "total" && <MetricTile label="Central EL" value={formatMetric(row.central, 2)} />}
        </div>
      ) : (
        <p className="muted">No data logged for this week yet.</p>
      )}
    </div>
  );
}
