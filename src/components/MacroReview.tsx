import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { fetchMacroSets, type MacroSet, type WeekWithBlock } from "../lib/queries";

// Macro review: compare an athlete's blocks with one another, over a chosen
// range of blocks (a prep / macro). Per block, for the selected lift:
//   - e1RM, heaviest set and average working weight — competition lift only
//     (so variations don't skew them); e1RM uses the app's RPE-based formula,
//     weight × (1 + (reps + RIR) / 30).
//   - hard sets (RPE 8+), tonnage per week, average RPE and the RPE mix —
//     every exercise of that lift.
// Skipped sets are left out.

type Lift = "squat" | "bench" | "deadlift";
const LIFTS: { key: Lift; label: string }[] = [
  { key: "squat", label: "Squat" },
  { key: "bench", label: "Bench" },
  { key: "deadlift", label: "Deadlift" },
];

const AXIS_TICK = { fontSize: 10, fill: "#9a9a9e" };
const TOOLTIP_CONTENT = { background: "#1c1c1e", border: "1px solid #38383b", borderRadius: 6, fontSize: 12 };
const TOOLTIP_LABEL = { color: "#f5f5f5" };
const ACCENT = "#f5821f";

// RPE buckets for "how hard was each block", lightest to hardest — solid
// shades of the accent orange (blended over the card colour) so the legend
// matches the bars.
const BUCKETS = [
  { key: "easy", label: "RPE 6 or less", color: "#4c321e", test: (r: number) => r <= 6 },
  { key: "moderate", label: "RPE 6.5–7.5", color: "#7e4a1e", test: (r: number) => r > 6 && r < 8 },
  { key: "hard", label: "RPE 8–8.5", color: "#b8651f", test: (r: number) => r >= 8 && r < 9 },
  { key: "max", label: "RPE 9+", color: "#f5821f", test: (r: number) => r >= 9 },
] as const;

function e1rm(s: MacroSet): number {
  const rir = s.rpe != null ? 10 - s.rpe : 0;
  return s.weight * (1 + (s.reps + rir) / 30);
}

const kg = (v: number | null | undefined, digits = 1) => (v == null ? "—" : v.toFixed(digits));

interface BlockStats {
  id: string;
  name: string;
  weeks: number;
  hardSets: number;
  tonnagePerWeek: number | null;
  avgRpe: number | null;
  bestE1rm: number | null;
  heaviest: MacroSet | null;
  workAvg: number | null;
  e1rmChange: number | null;
  buckets: Record<string, number>; // share of RPE-rated sets, 0–100
}

export default function MacroReview({
  athleteId,
  weeks,
  oneRms,
}: {
  athleteId: string;
  weeks: WeekWithBlock[];
  oneRms: { squat_1rm: number | null; bench_1rm: number | null; deadlift_1rm: number | null };
}) {
  const [sets, setSets] = useState<MacroSet[] | null>(null);
  const [lift, setLift] = useState<Lift>("squat");
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMacroSets(athleteId).then((s) => {
      if (!cancelled) setSets(s);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // Blocks in program order, with their week counts.
  const blocks = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; order: number; weeks: number }>();
    for (const w of weeks) {
      const b = byId.get(w.block_id) ?? { id: w.block_id, name: w.block.name, order: w.block.order_index, weeks: 0 };
      b.weeks += 1;
      byId.set(w.block_id, b);
    }
    return [...byId.values()].sort((a, b) => a.order - b.order);
  }, [weeks]);

  // Only blocks that have something logged are worth reviewing.
  const loggedBlockIds = useMemo(() => new Set((sets ?? []).map((s) => s.block_id)), [sets]);
  const reviewable = blocks.filter((b) => loggedBlockIds.has(b.id));
  const fromIdx = Math.max(0, reviewable.findIndex((b) => b.id === fromId));
  const toIdxRaw = reviewable.findIndex((b) => b.id === toId);
  const toIdx = toIdxRaw === -1 ? reviewable.length - 1 : Math.max(toIdxRaw, fromIdx);
  const inRange = reviewable.slice(fromIdx, toIdx + 1);

  // Stats for every reviewable block (the e1RM change needs the block before,
  // even when it's outside the chosen range).
  const statsFor = (l: Lift): BlockStats[] => {
    let prevBest: number | null = null;
    return reviewable.map((b) => {
      const all = (sets ?? []).filter((s) => s.block_id === b.id && s.lift === l && s.weight > 0 && s.reps > 0 && s.status !== "skipped");
      const comp = all.filter((s) => s.mode === "competition");
      const rated = all.filter((s) => s.rpe != null);
      const best = comp.length ? Math.max(...comp.map(e1rm)) : null;
      const heaviest = comp.reduce<MacroSet | null>(
        (h, s) => (!h || s.weight > h.weight || (s.weight === h.weight && s.reps > h.reps) ? s : h),
        null,
      );
      const buckets: Record<string, number> = {};
      for (const bk of BUCKETS) buckets[bk.key] = rated.length ? (rated.filter((s) => bk.test(s.rpe!)).length / rated.length) * 100 : 0;
      const stats: BlockStats = {
        id: b.id,
        name: b.name,
        weeks: b.weeks,
        hardSets: all.filter((s) => (s.rpe ?? 0) >= 8).length,
        tonnagePerWeek: all.length ? all.reduce((sum, s) => sum + s.weight * s.reps, 0) / Math.max(1, b.weeks) : null,
        avgRpe: rated.length ? rated.reduce((sum, s) => sum + s.rpe!, 0) / rated.length : null,
        bestE1rm: best,
        heaviest,
        workAvg: comp.length ? comp.reduce((sum, s) => sum + s.weight, 0) / comp.length : null,
        e1rmChange: best != null && prevBest != null ? best - prevBest : null,
        buckets,
      };
      if (best != null) prevBest = best;
      return stats;
    });
  };

  const allStats = useMemo(() => ({ squat: statsFor("squat"), bench: statsFor("bench"), deadlift: statsFor("deadlift") }), [sets, weeks]); // eslint-disable-line react-hooks/exhaustive-deps
  const rangeIds = new Set(inRange.map((b) => b.id));
  const stats = allStats[lift].filter((s) => rangeIds.has(s.id));

  if (sets === null) return <p className="muted">Loading…</p>;
  if (reviewable.length === 0) return <p className="muted">Nothing logged yet.</p>;

  // Headline numbers across the chosen range.
  const bestIn = (l: Lift) => {
    const vals = allStats[l].filter((s) => rangeIds.has(s.id) && s.bestE1rm != null).map((s) => s.bestE1rm!);
    return vals.length ? Math.max(...vals) : null;
  };
  const best = bestIn(lift);
  const current1rm = oneRms[`${lift}_1rm`];
  const heaviestInRange = stats.reduce<{ set: MacroSet; block: string } | null>(
    (h, s) => (s.heaviest && (!h || s.heaviest.weight > h.set.weight) ? { set: s.heaviest, block: s.name } : h),
    null,
  );
  const bests = LIFTS.map((l) => bestIn(l.key));
  const total = bests.every((v) => v != null) ? bests.reduce((a, v) => a! + v!, 0)! : null;
  const currentTotal =
    oneRms.squat_1rm != null && oneRms.bench_1rm != null && oneRms.deadlift_1rm != null
      ? Number(oneRms.squat_1rm) + Number(oneRms.bench_1rm) + Number(oneRms.deadlift_1rm)
      : null;
  const liftLabel = LIFTS.find((l) => l.key === lift)!.label;

  const delta = (v: number | null) =>
    v == null ? null : (
      <span className={v >= 0 ? "macro-up" : "macro-down"}>
        {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(1)} kg
      </span>
    );

  return (
    <div className="macro-review">
      <div className="macro-controls">
        <div className="lift-tabs" style={{ marginBottom: 0 }}>
          {LIFTS.map((l) => (
            <button key={l.key} type="button" className={l.key === lift ? "active" : ""} onClick={() => setLift(l.key)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="macro-range">
          <label>
            From
            <select value={inRange[0]?.id} onChange={(e) => setFromId(e.target.value)}>
              {reviewable.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={inRange[inRange.length - 1]?.id} onChange={(e) => setToId(e.target.value)}>
              {reviewable.slice(fromIdx).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="macro-cards">
        <div className="section macro-card">
          <h2>{liftLabel}</h2>
          <div className="macro-big">
            {kg(best)} <span className="macro-big-unit">kg e1RM</span>
          </div>
          <div className="macro-card-line">
            {best != null && current1rm != null && delta(best - Number(current1rm))}{" "}
            <span className="muted">vs current 1RM {current1rm ?? "—"} kg</span>
          </div>
          {heaviestInRange && (
            <div className="macro-card-line muted">
              Heaviest set {heaviestInRange.set.weight} × {heaviestInRange.set.reps}
              {heaviestInRange.set.rpe != null ? ` @ ${heaviestInRange.set.rpe}` : ""} ({heaviestInRange.block})
            </div>
          )}
        </div>
        <div className="section macro-card">
          <h2>Estimated total</h2>
          <div className="macro-big">
            {kg(total)} <span className="macro-big-unit">kg</span>
          </div>
          <div className="macro-card-line">
            {total != null && currentTotal != null && delta(total - currentTotal)} <span className="muted">vs current total {currentTotal ?? "—"} kg</span>
          </div>
          <div className="macro-card-line muted">
            Squat {kg(bests[0])} · Bench {kg(bests[1])} · Deadlift {kg(bests[2])}
          </div>
        </div>
      </div>

      <div className="section">
        <h2>How hard was each block</h2>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={stats.map((s) => ({ name: s.name, ...s.buckets }))} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#38383b" vertical={false} />
            <XAxis dataKey="name" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} width={42} domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} />
            <Tooltip contentStyle={TOOLTIP_CONTENT} labelStyle={TOOLTIP_LABEL} formatter={(v) => (typeof v === "number" ? `${v.toFixed(0)}%` : "—")} />
            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(label) => <span style={{ color: "#9a9a9e" }}>{label}</span>} />
            {BUCKETS.map((bk) => (
              <Bar key={bk.key} dataKey={bk.key} name={bk.label} stackId="rpe" fill={bk.color} maxBarSize={64} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="macro-split">
        <div className="section">
          <h2>{liftLabel} by block</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="metrics-summary-table">
              <thead>
                <tr>
                  <th>Block</th>
                  <th>Hard sets (RPE 8+)</th>
                  <th>Tonnage / week</th>
                  <th>Avg RPE</th>
                  <th>e1RM vs block before</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                    </td>
                    <td>{s.hardSets}</td>
                    <td>{s.tonnagePerWeek == null ? "—" : Math.round(s.tonnagePerWeek).toLocaleString()}</td>
                    <td>{kg(s.avgRpe)}</td>
                    <td>{delta(s.e1rmChange) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="section">
          <h2>Blocks at a glance · {liftLabel}</h2>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={stats.map((s) => ({
                name: s.name,
                heaviest: s.heaviest?.weight ?? null,
                work: s.workAvg == null ? null : Math.round(s.workAvg * 10) / 10,
                e1rm: s.bestE1rm == null ? null : Math.round(s.bestE1rm * 10) / 10,
              }))}
              margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#38383b" vertical={false} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} width={42} domain={["auto", "auto"]} />
              <Tooltip contentStyle={TOOLTIP_CONTENT} labelStyle={TOOLTIP_LABEL} formatter={(v) => (typeof v === "number" ? `${v} kg` : "—")} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="e1rm" name="Best e1RM" stroke={ACCENT} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="heaviest" name="Heaviest set" stroke="#e0b83a" strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="monotone" dataKey="work" name="Work sets (avg)" stroke="#9a9a9e" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
