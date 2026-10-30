// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `fK`
// (byte offset ~857354), plus its row-list dependency `dK`
// (byte offset 857354, the literal immediately before it) and the
// shared `_l`/`vl` formatters (now `metricsFormat.ts`).
//
// This is BlockBuilder's READ-ONLY week-summary table — it shows all
// four rows (squat/bench/deadlift/weekly total) at once, with no lift
// tabs and no click interaction, because BlockBuilder is looking at
// PLANNED (prescribed) numbers for a week that may not have any logged
// data yet. This is deliberately a separate component from
// AthleteDetail's `WeekSummaryTable` (minified `yl`), which is
// interactive (lift tabs, `activeLift`/`onLiftChange`) and shows
// actual logged-data metrics — confirmed as genuinely different
// components in the bundle, not two callers of one shared one.
//
// Minified source:
//   dK=[{key:`squat`,label:`Squat`},{key:`bench`,label:`Bench`},
//       {key:`deadlift`,label:`Deadlift`},{key:`total`,label:`Weekly total`}]
//   function fK({metricsByLift:e}){
//     return jsx(`div`,{style:{overflowX:`auto`},children:
//       jsxs(`table`,{children:[
//         thead with columns: Lift, Volume, Sets, ACWR, aRI (%1RM),
//           Peak intensity (%1RM), Monotony, Exertion load
//         tbody: dK.map(({key:t,label:n})=>{
//           let r=e[t], i = t===`total`;
//           <tr>
//             <td><strong>{n}</strong></td>
//             <td>{_l(r?.volume,0)}{r?.volume_pct_change!=null &&
//               <span className={vl(r.volume_pct_change)}>
//                 {r.volume_pct_change>0?`+`:``}{r.volume_pct_change.toFixed(1)}%
//               </span>}</td>
//             <td>{_l(r?.sets,0)}</td>
//             <td>{_l(r?.acwr,2)}</td>
//             <td>{_l(r?.ari,1)}</td>
//             <td>{i?`—`:_l(r?.peak_intensity,1)}</td>
//             <td>{i?`—`:_l(r?.monotony,2)}</td>
//             <td>{i?`—`:_l(r?.exertion_load,0)}</td>
//           </tr>
//         })
//       ]})})
//   }
// (the `total` row's peak intensity / monotony / exertion load cells
// are always "—" — those three metrics aren't meaningful summed across
// lifts, confirmed by the `i?` ternary on each of the three cells.)

import type { WeeklyMetrics } from "../lib/types";
import { formatMetric, pctChangeClass } from "../lib/metricsFormat";

const ROWS: { key: string; label: string }[] = [
  { key: "squat", label: "Squat" },
  { key: "bench", label: "Bench" },
  { key: "deadlift", label: "Deadlift" },
  { key: "total", label: "Weekly total" },
];

export default function PlannedMetricsTable({
  metricsByLift,
}: {
  metricsByLift: Record<string, WeeklyMetrics>;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="metrics-summary-table">
        <thead>
          <tr>
            <th>Lift</th>
            <th>Volume</th>
            <th>Sets</th>
            <th>ACWR</th>
            <th>aRI</th>
            <th>Peak intensity</th>
            <th>Monotony</th>
            <th>Exertion load</th>
            <th>PXL</th>
            <th>CXL</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map(({ key, label }) => {
            const r = metricsByLift[key];
            const isTotal = key === "total";
            return (
              <tr key={key}>
                <td>
                  <strong>{label}</strong>
                </td>
                <td>
                  {formatMetric(r?.volume, 0)}
                  {r?.volume_pct_change != null && (
                    <span
                      className={pctChangeClass(r.volume_pct_change)}
                      style={{ fontSize: "0.78rem", marginLeft: 6 }}
                    >
                      {r.volume_pct_change > 0 ? "+" : ""}
                      {r.volume_pct_change.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td>{formatMetric(r?.sets, 0)}</td>
                <td>{formatMetric(r?.acwr, 2)}</td>
                <td>{formatMetric(r?.ari, 1)}</td>
                <td>{isTotal ? "—" : formatMetric(r?.peak_intensity, 1)}</td>
                <td>{isTotal ? "—" : formatMetric(r?.monotony, 2)}</td>
                <td>{isTotal ? "—" : formatMetric(r?.exertion_load, 2)}</td>
                <td>{isTotal ? "—" : formatMetric(r?.peripheral, 2)}</td>
                <td>{isTotal ? "—" : formatMetric(r?.central, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
