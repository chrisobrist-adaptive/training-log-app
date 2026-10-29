// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `eK` (byte
// offset 837079), together with its chart-definition list `XG` and
// tooltip/axis style objects `ZG`/`QG`/`$G` (byte offset ~836435,
// immediately before it). Renders one small bar/area chart per metric,
// across the athlete's WHOLE week sequence (every block, in program
// order) for whichever lift is selected — this is the chart beneath
// AthleteDetail's `WeekSummaryTable`, confirmed to chart only 6 of the
// 8 metrics that table shows (no "sets" or "monotony" chart — not an
// oversight to "complete", that's what the real `XG` list contains).
//
//   XG=[{key:"volume",label:"Volume (kg)",type:"bar",color:"#f5821f",digits:0},
//       {key:"e1rm",label:"Estimated 1RM (kg)",type:"line",color:"#3ecf7e",digits:1,hideForTotal:true},
//       {key:"acwr",label:"ACWR",type:"line",color:"#e0b83a",digits:2},
//       {key:"ari",label:"aRI (% of 1RM)",type:"line",color:"#c98a1f",digits:2},
//       {key:"peak_intensity",label:"Peak intensity (% of 1RM)",type:"line",color:"#ff6b5e",digits:1,hideForTotal:true},
//       {key:"exertion_load",label:"Exertion load",type:"line",color:"#c9739e",digits:2,hideForTotal:true}]
//   function eK({weeks:e,metrics:t,lift:n}){
//     let r = e.map(week => {
//       let row = t.find(m => m.week_id===week.id && m.lift===n);
//       let point = { label: `${week.block.name} W${week.week_number}` };
//       for (let def of XG) point[def.key] = def.key==="e1rm" && typeof row?.[def.key]==="number" ? roundToNearest(row[def.key],2.5) : (row?.[def.key] ?? null);
//       return point;
//     });
//     let visible = XG.filter(def => !(def.hideForTotal && n==="total"));
//     return r.some(point => visible.some(def => point[def.key]!=null))
//       ? <div className="chart-grid">{visible.map(def => <ChartCard .../>)}</div>
//       : <p className="muted">Not enough history yet to chart trends.</p>;
//   }
//
// `type:"line"` in XG actually renders as a gradient-filled AREA chart
// (recharts `AreaChart`/`Area`, not `LineChart`/`Line`) — kept the
// source's own field name ("line") rather than renaming it to "area",
// since BlockBuilder/AthleteDetail-adjacent code elsewhere in the
// bundle may rely on the same literal (not confirmed either way, so
// left as-is rather than guessed at).

import { useState } from "react";
import { ResponsiveContainer, BarChart, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Area } from "recharts";
import type { WeekWithBlock } from "../lib/queries";
import type { WeeklyMetrics } from "../lib/types";

type MetricKey = "volume" | "e1rm" | "acwr" | "ari" | "peak_intensity" | "exertion_load" | "peripheral" | "central";

type ChartDef = {
  key: MetricKey;
  label: string;
  type: "bar" | "line";
  color: string;
  digits: number;
  hideForTotal?: boolean;
  // Alternative metrics this chart can switch to via a dropdown (the
  // exertion-load chart: total / peripheral / central).
  variants?: { key: MetricKey; label: string; digits: number }[];
};

const CHART_DEFS: ChartDef[] = [
  { key: "volume", label: "Volume (kg)", type: "bar", color: "#f5821f", digits: 0 },
  { key: "e1rm", label: "Estimated 1RM (kg)", type: "line", color: "#3ecf7e", digits: 1, hideForTotal: true },
  { key: "acwr", label: "ACWR", type: "line", color: "#e0b83a", digits: 2 },
  { key: "ari", label: "aRI (% of 1RM)", type: "line", color: "#c98a1f", digits: 2 },
  { key: "peak_intensity", label: "Peak intensity (% of 1RM)", type: "line", color: "#ff6b5e", digits: 1, hideForTotal: true },
  {
    key: "exertion_load",
    label: "Exertion load",
    type: "line",
    color: "#c9739e",
    digits: 2,
    hideForTotal: true,
    variants: [
      { key: "exertion_load", label: "Exertion load", digits: 2 },
      { key: "peripheral", label: "Peripheral exertion load", digits: 2 },
      { key: "central", label: "Central exertion load", digits: 2 },
    ],
  },
];

const ALL_METRIC_KEYS: MetricKey[] = [...new Set(CHART_DEFS.flatMap((d) => [d.key, ...(d.variants ?? []).map((v) => v.key)]))];

const AXIS_TICK_STYLE = { fontSize: 10, fill: "#9a9a9e" };
const TOOLTIP_CONTENT_STYLE = { background: "#1c1c1e", border: "1px solid #38383b", borderRadius: 6, fontSize: 12 };
const TOOLTIP_LABEL_STYLE = { color: "#f5f5f5" };

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export default function TrendChart({ weeks, metrics, lift }: { weeks: WeekWithBlock[]; metrics: WeeklyMetrics[]; lift: string }) {
  // Which variant each switchable chart is showing, by its base key.
  const [variantByChart, setVariantByChart] = useState<Partial<Record<MetricKey, MetricKey>>>({});
  const points: Record<string, string | number | null>[] = weeks.map((week) => {
    const row = metrics.find((m) => m.week_id === week.id && m.lift === lift);
    const point: Record<string, string | number | null> = { label: `${week.block.name} W${week.week_number}` };
    for (const key of ALL_METRIC_KEYS) {
      const raw = row ? (row as unknown as Record<string, number | null>)[key] ?? null : null;
      point[key] = key === "e1rm" && typeof raw === "number" ? roundToNearest(raw, 2.5) : raw;
    }
    return point;
  });
  const visibleDefs = CHART_DEFS.filter((def) => !(def.hideForTotal && lift === "total")).map((def) => {
    const variant = def.variants?.find((v) => v.key === variantByChart[def.key]);
    return { ...def, baseKey: def.key, ...(variant ? { key: variant.key, label: variant.label, digits: variant.digits } : {}) };
  });
  const hasAnyData = points.some((point) => visibleDefs.some((def) => point[def.key] != null));

  if (!hasAnyData) return <p className="muted">Not enough history yet to chart trends.</p>;

  return (
    <div className="chart-grid">
      {visibleDefs.map((def) => (
        <div className="chart-card" key={def.baseKey}>
          {def.variants ? (
            <select
              className="chart-variant-select"
              value={def.key}
              onChange={(e) => setVariantByChart((prev) => ({ ...prev, [def.baseKey]: e.target.value as MetricKey }))}
              aria-label="Choose metric"
            >
              {def.variants.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                </option>
              ))}
            </select>
          ) : (
            <h3>{def.label}</h3>
          )}
          <ResponsiveContainer width="100%" height={240}>
            {def.type === "bar" ? (
              <BarChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#38383b" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK_STYLE} interval="preserveStartEnd" angle={-35} textAnchor="end" height={55} />
                <YAxis tick={AXIS_TICK_STYLE} width={42} />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value) => (typeof value === "number" ? value.toFixed(def.digits) : String(value ?? "—"))}
                />
                <Bar dataKey={def.key} name={def.label} fill={def.color} fillOpacity={0.4} stroke={def.color} strokeWidth={1} radius={[3, 3, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id={`grad-${def.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={def.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={def.color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#38383b" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK_STYLE} interval="preserveStartEnd" angle={-35} textAnchor="end" height={55} />
                <YAxis tick={AXIS_TICK_STYLE} width={42} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={TOOLTIP_CONTENT_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  formatter={(value) => (typeof value === "number" ? value.toFixed(def.digits) : String(value ?? "—"))}
                />
                <Area
                  type="monotone"
                  dataKey={def.key}
                  name={def.label}
                  stroke={def.color}
                  strokeWidth={2}
                  fill={`url(#grad-${def.key})`}
                  dot={{ r: 2.5, fillOpacity: 0.8 }}
                  connectNulls
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
