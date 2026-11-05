// Projected meet-day lifts: the heaviest weight actually lifted in training,
// carried forward along its recent trend to the meet date, plus a small
// taper bump (meet attempts usually land just above the best training lift).
//
// - Weekly heaviest load per lift over the last 16 weeks, as a running best
//   so deload and light weeks don't read as lost strength.
// - Slope = median of the pairwise slopes (robust to one odd week).
// - Gains slow the further out the meet is (12-week half-life style curve),
//   and are capped at 7.5% of the current heaviest lift.
// - Then +2% for the taper, rounded to 2.5 kg.
// - Fewer than 4 weeks of data for a lift: no trend, just the taper bump.

const WEEK_MS = 7 * 86400000;
const TREND_WEEKS = 16;
const MIN_WEEKS = 4;
const HORIZON_WEEKS = 12;
const MAX_GAIN = 0.075;
const TAPER = 0.02;

export interface LiftPoint {
  date: string; // ISO timestamp
  weight: number;
}

export interface LiftProjection {
  slope: number | null; // kg per week, null = not enough data
  projected: number;
}

const toPlate = (v: number) => Math.round(v / 2.5) * 2.5;

export function weeklySlope(points: LiftPoint[], now = Date.now()): number | null {
  const since = now - TREND_WEEKS * WEEK_MS;
  const byWeek = new Map<number, number>();
  for (const p of points) {
    const t = Date.parse(p.date);
    if (t < since || t > now) continue;
    const wk = Math.floor((t - since) / WEEK_MS);
    byWeek.set(wk, Math.max(byWeek.get(wk) ?? 0, p.weight));
  }
  const weeks = [...byWeek.entries()].sort((a, b) => a[0] - b[0]);
  if (weeks.length < MIN_WEEKS) return null;
  let best = 0;
  const pts = weeks.map(([x, y]) => {
    best = Math.max(best, y);
    return [x, best] as const;
  });
  const slopes: number[] = [];
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) slopes.push((pts[j][1] - pts[i][1]) / (pts[j][0] - pts[i][0]));
  slopes.sort((a, b) => a - b);
  const mid = slopes.length / 2;
  return slopes.length % 2 ? slopes[Math.floor(mid)] : (slopes[mid - 1] + slopes[mid]) / 2;
}

export function projectLift(current: number, slope: number | null, weeksOut: number): LiftProjection {
  const effectiveWeeks = weeksOut > 0 ? HORIZON_WEEKS * (1 - Math.exp(-weeksOut / HORIZON_WEEKS)) : 0;
  const gain = slope == null ? 0 : Math.min(Math.max(slope, 0) * effectiveWeeks, current * MAX_GAIN);
  return { slope, projected: toPlate((current + gain) * (1 + TAPER)) };
}
