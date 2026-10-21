// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `lq` (byte
// offset 924267). The athlete-facing "History & trends" page —
// `/history` — reusing the exact same `WeekSummaryTable`/`TrendChart`
// components AthleteDetail.tsx uses for the coach's view, just scoped
// to the signed-in athlete's own whole week sequence instead of one
// they're coaching. Confirmed exact: the default selected week is
// simply the LAST week in the sequence (most recent), with none of
// AthleteDetail's "first non-completed, else last" logic — a
// deliberately simpler default for an athlete looking at their own
// history rather than a coach jumping into where work is needed.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { fetchAthleteWeekSequence, fetchWeeklyMetrics, type WeekWithBlock } from "../../lib/queries";
import type { WeeklyMetrics } from "../../lib/types";
import WeekSummaryTable from "../../components/WeekSummaryTable";
import TrendChart from "../../components/TrendChart";
import VelocityChart from "../../components/VelocityChart";

type LiftKey = "total" | "squat" | "bench" | "deadlift";

export default function History() {
  const { profile } = useAuth();
  const [weeks, setWeeks] = useState<WeekWithBlock[]>([]);
  const [metrics, setMetrics] = useState<WeeklyMetrics[]>([]);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [activeLift, setActiveLift] = useState<LiftKey>("total");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      setLoading(true);
      const weekSequence = await fetchAthleteWeekSequence(profile.id);
      setWeeks(weekSequence);
      const metricsRows = await fetchWeeklyMetrics(weekSequence.map((w) => w.id));
      setMetrics(metricsRows);
      if (weekSequence.length > 0) setActiveWeekId(weekSequence[weekSequence.length - 1].id);
      setLoading(false);
    })();
  }, [profile]);

  const metricsByLift = useMemo(() => {
    const byLift: Record<string, WeeklyMetrics> = {};
    for (const m of metrics.filter((row) => row.week_id === activeWeekId)) byLift[m.lift] = m;
    return byLift;
  }, [metrics, activeWeekId]);

  if (loading) return <p className="muted">Loading…</p>;
  if (weeks.length === 0) return <p className="muted">No training history yet.</p>;

  return (
    <div>
      <div className="page-header">
        <h1>History &amp; trends</h1>
      </div>
      <div className="section">
        <div className="week-tabs">
          {weeks.map((w) => (
            <button key={w.id} className={activeWeekId === w.id ? "active" : ""} onClick={() => setActiveWeekId(w.id)} type="button">
              {w.block.name} · W{w.week_number}
            </button>
          ))}
        </div>
        <WeekSummaryTable metricsByLift={metricsByLift} activeLift={activeLift} onLiftChange={setActiveLift} />
        <h2 style={{ marginTop: "1.5rem" }}>Trend across blocks</h2>
        <TrendChart weeks={weeks} metrics={metrics} lift={activeLift} />
      </div>
      {profile && (
        <div className="section">
          <h2>Velocity</h2>
          <VelocityChart athleteId={profile.id} />
        </div>
      )}
    </div>
  );
}
