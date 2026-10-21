import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line, Legend } from "recharts";
import { fetchVelocityHistory, type VelocityRow } from "../lib/queries";

// Bar-speed trend for one exercise at a time: per session, the fastest rep
// (best velocity_fast across that session's sets) and the slowest rep
// (lowest velocity_slow). Only exercises that have velocity logged are
// offered. Used on the athlete's Graphs tab and the coach's athlete page.

const AXIS_TICK_STYLE = { fontSize: 10, fill: "#9a9a9e" };
const TOOLTIP_CONTENT_STYLE = { background: "#1c1c1e", border: "1px solid #38383b", borderRadius: 6, fontSize: 12 };
const TOOLTIP_LABEL_STYLE = { color: "#f5f5f5" };
const FASTEST_COLOR = "#f5821f";
const SLOWEST_COLOR = "#e0b83a";

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shortLabel(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function VelocityChart({ athleteId }: { athleteId: string }) {
  const [rows, setRows] = useState<VelocityRow[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVelocityHistory(athleteId).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  // Exercises with velocity data, most recently logged first.
  const exercises = useMemo(() => {
    const latest = new Map<string, { name: string; at: string }>();
    for (const r of rows ?? []) {
      if (!r.exercise_inventory_id) continue;
      const prev = latest.get(r.exercise_inventory_id);
      if (!prev || r.created_at > prev.at) latest.set(r.exercise_inventory_id, { name: r.exercise_name ?? "Exercise", at: r.created_at });
    }
    return [...latest.entries()].sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).map(([id, v]) => ({ id, name: v.name }));
  }, [rows]);

  const activeId = selected && exercises.some((e) => e.id === selected) ? selected : (exercises[0]?.id ?? null);

  const points = useMemo(() => {
    const byDate = new Map<string, { fastest: number | null; slowest: number | null }>();
    for (const r of rows ?? []) {
      if (r.exercise_inventory_id !== activeId) continue;
      const key = localDateKey(r.day_completed_at ?? r.created_at);
      const p = byDate.get(key) ?? { fastest: null, slowest: null };
      if (r.velocity_fast != null) p.fastest = p.fastest == null ? r.velocity_fast : Math.max(p.fastest, r.velocity_fast);
      if (r.velocity_slow != null) p.slowest = p.slowest == null ? r.velocity_slow : Math.min(p.slowest, r.velocity_slow);
      byDate.set(key, p);
    }
    return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, p]) => ({ label: shortLabel(key), ...p }));
  }, [rows, activeId]);

  if (rows === null) return <p className="muted">Loading…</p>;
  if (exercises.length === 0) return <p className="muted">No velocity logged yet. Add it from the Velocity section on any exercise in the training log.</p>;

  return (
    <div>
      <div className="lift-tabs" style={{ flexWrap: "wrap" }}>
        {exercises.map((e) => (
          <button key={e.id} type="button" className={e.id === activeId ? "active" : ""} onClick={() => setSelected(e.id)}>
            {e.name}
          </button>
        ))}
      </div>
      <div className="chart-card" style={{ maxWidth: "none" }}>
        <h3>Velocity (m/s)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#38383b" vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK_STYLE} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK_STYLE} width={42} domain={["auto", "auto"]} tickFormatter={(v: number) => v.toFixed(2)} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              formatter={(value) => (typeof value === "number" ? `${value.toFixed(2)} m/s` : "—")}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="fastest" name="Fastest rep" stroke={FASTEST_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="slowest" name="Slowest rep" stroke={SLOWEST_COLOR} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
