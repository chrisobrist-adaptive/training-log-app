// Individualised RPE -> %1RM charts (competition / equipped squat, bench,
// deadlift). Every cell starts from the coach's default chart; cells the
// athlete has logged are replaced by the average of their last 5 logs
// (get_rpe_chart_logs in the database — see migration 0016).

export type ChartLift = "squat" | "bench" | "deadlift";
export type ChartMode = "competition" | "equipped";

export const CHART_REPS = Array.from({ length: 15 }, (_, i) => i + 1);
// RPE 10 down to 0 in half steps (rows of the chart).
export const CHART_RPES = Array.from({ length: 21 }, (_, i) => 10 - i * 0.5);

// The coach's default chart is a single sequence: each extra rep, or each
// half point of RPE lower, moves one step along it. So cell (reps, RPE) is
// BASE[2*(reps-1) + 2*(10-RPE)] — e.g. 1 rep @ 10 = 100%, 4 reps @ 7 = 81.1%,
// 15 reps @ 0 = 32.9%.
const BASE = [
  1, 0.9775, 0.955, 0.9385, 0.922, 0.907, 0.892, 0.8775, 0.863, 0.85, 0.837, 0.824, 0.811, 0.7985, 0.786, 0.774, 0.762,
  0.7505, 0.739, 0.723, 0.707, 0.6935, 0.68, 0.6665, 0.653, 0.6395, 0.626, 0.6125, 0.599, 0.5855, 0.572, 0.5585, 0.545,
  0.5315, 0.518, 0.5045, 0.491, 0.4775, 0.464, 0.4505, 0.437, 0.4235, 0.41, 0.3965, 0.383, 0.3695, 0.356, 0.3425, 0.329,
];

// Default %1RM for a cell (e.g. 81.1), or null outside the chart.
export function defaultPct(reps: number, rpe: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 15) return null;
  const halfSteps = (10 - rpe) * 2;
  if (!Number.isInteger(halfSteps) || halfSteps < 0 || halfSteps > 20) return null;
  return BASE[2 * (reps - 1) + halfSteps] * 100;
}

export interface RpeChartLog {
  lift: string;
  mode: string;
  reps: number;
  rpe: number;
  pct: number;
  n: number;
}

export interface ChartCell {
  pct: number;
  // How many of the athlete's logs the value averages; 0 = default chart.
  n: number;
}

// One cell of an athlete's chart: their own average if they've logged it,
// otherwise the default.
export function chartCell(logs: RpeChartLog[], lift: ChartLift, mode: ChartMode, reps: number, rpe: number): ChartCell | null {
  const own = logs.find((l) => l.lift === lift && l.mode === mode && l.reps === reps && Number(l.rpe) === rpe);
  if (own) return { pct: Number(own.pct), n: own.n };
  const fallback = defaultPct(reps, rpe);
  return fallback == null ? null : { pct: fallback, n: 0 };
}

export function roundToPlate(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

// A suggested working weight for "reps @ RPE" from the athlete's chart, or
// null when the set can't be looked up (not a charted lift, no 1RM, reps or
// RPE outside the chart).
export function suggestFromChart(
  logs: RpeChartLog[] | null | undefined,
  lift: string | null | undefined,
  mode: string | null | undefined,
  reps: number | null | undefined,
  rpe: number | null | undefined,
  oneRm: number | null | undefined,
): { pct: number; weight: number; personal: boolean } | null {
  if (!logs || !lift || !mode || reps == null || rpe == null || !oneRm) return null;
  if (lift !== "squat" && lift !== "bench" && lift !== "deadlift") return null;
  if (mode !== "competition" && mode !== "equipped") return null;
  const cell = chartCell(logs, lift, mode, reps, Number(rpe));
  if (!cell) return null;
  return { pct: cell.pct, weight: roundToPlate((cell.pct / 100) * oneRm), personal: cell.n > 0 };
}
