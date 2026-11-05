// Probability of placing: a Monte Carlo of the meet, run many times.
//
// Athlete — lift by lift, three attempts planned as a percentage of their
// estimated max (their own habits from OpenPowerlifting if we can match
// them, otherwise the federation's typical opener / 2nd / 3rd). Each attempt
// is made with their make rate for that lift and attempt number, blended with
// the federation's typical rate so a handful of meets doesn't swing it. A
// made attempt moves on to the next planned weight; a miss is repeated at the
// same weight. No successful attempt on a lift = bomb-out.
//
// Competitors — each lifter in the field (once, at their best total in the
// period) totals their best × a factor drawn from real "next meet total vs
// best of the previous 12 months" pairs for that federation.

import type { FieldData, FieldResult, Federation } from "./competition";

export type LiftKey = "squat" | "bench" | "deadlift";
const LIFTS: LiftKey[] = ["squat", "bench", "deadlift"];
type Triple = [number, number, number];

export interface AttemptModel {
  // Planned opener / 2nd / 3rd as a fraction of the estimated max.
  pct: Triple;
  // Chance each attempt is made, per lift.
  rates: Record<LiftKey, Triple>;
  // Where it came from: the athlete's own meets, or federation typicals.
  source: "athlete" | "typical";
  meets: number;
}

const roundToPlate = (v: number) => Math.round(v / 2.5) * 2.5;
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)];
};

// Make rates and attempt percentages pooled over a set of results.
function attemptStats(rows: FieldResult[]) {
  const made: Record<LiftKey, Triple> = { squat: [0, 0, 0], bench: [0, 0, 0], deadlift: [0, 0, 0] };
  const taken: Record<LiftKey, Triple> = { squat: [0, 0, 0], bench: [0, 0, 0], deadlift: [0, 0, 0] };
  const pcts: [number[], number[], number[]] = [[], [], []];
  for (const r of rows) {
    for (const lift of LIFTS) {
      const best = r[lift];
      r.attempts[lift].forEach((a, k) => {
        if (a == null || a === 0) return;
        taken[lift][k] += 1;
        if (a > 0) made[lift][k] += 1;
        if (best != null && best > 0) pcts[k].push(Math.abs(a) / best);
      });
    }
  }
  return { made, taken, pcts, n: rows.length };
}

const MIN_TYPICAL_RESULTS = 200;
const BLEND_WEIGHT = 6; // how many "typical" attempts a lifter's own record is blended with

// The federation's typical attempt habits for this equipment; small samples
// (e.g. equipped APA/APL) fall back to IPF for the same equipment.
export function typicalModel(data: FieldData, federation: Federation, equipment: string): AttemptModel {
  const pick = (fed: string | null) => data.results.filter((r) => (fed == null || r.federation === fed) && r.equipment === equipment);
  let rows = pick(federation);
  if (rows.length < MIN_TYPICAL_RESULTS) rows = pick("IPF");
  if (rows.length < MIN_TYPICAL_RESULTS) rows = pick(null);
  const st = attemptStats(rows);
  const rate = (lift: LiftKey, k: number) => (st.taken[lift][k] ? st.made[lift][k] / st.taken[lift][k] : [0.92, 0.85, 0.6][k]);
  const pct = st.pcts.map((xs, k) => (xs.length ? median(xs) : [0.91, 0.97, 1][k])) as Triple;
  return {
    pct,
    rates: Object.fromEntries(LIFTS.map((l) => [l, [rate(l, 0), rate(l, 1), rate(l, 2)]])) as Record<LiftKey, Triple>,
    source: "typical",
    meets: 0,
  };
}

// The athlete's own habits, if their OpenPowerlifting name matches results
// in the data; otherwise the typical model.
export function athleteModel(data: FieldData, oplName: string | null | undefined, typical: AttemptModel): AttemptModel {
  const name = oplName?.trim().toLowerCase();
  if (!name) return typical;
  const rows = data.results.filter((r) => r.name.toLowerCase() === name);
  if (!rows.length) return typical;
  const st = attemptStats(rows);
  const rates = Object.fromEntries(
    LIFTS.map((l) => [
      l,
      [0, 1, 2].map((k) => (st.made[l][k] + BLEND_WEIGHT * typical.rates[l][k]) / (st.taken[l][k] + BLEND_WEIGHT)),
    ]),
  ) as Record<LiftKey, Triple>;
  // Their own attempt percentages once there's a bit of history.
  const pct = st.pcts.map((xs, k) => (rows.length >= 2 && xs.length ? median(xs) : typical.pct[k])) as Triple;
  return { pct, rates, source: "athlete", meets: rows.length };
}

// "Next meet total ÷ best total of the previous 12 months" for every lifter
// who competed more than once in this federation (same equipment).
export function progressionRatios(data: FieldData, federation: Federation, equipment: string): number[] {
  const byLifter = new Map<string, { date: string; total: number }[]>();
  for (const r of data.results) {
    if (r.federation !== federation || r.equipment !== equipment) continue;
    const list = byLifter.get(r.name) ?? [];
    list.push({ date: r.date, total: r.total });
    byLifter.set(r.name, list);
  }
  const ratios: number[] = [];
  const YEAR = 365 * 86400000;
  for (const list of byLifter.values()) {
    list.sort((a, b) => (a.date < b.date ? -1 : 1));
    list.forEach((cur, i) => {
      const t = Date.parse(cur.date);
      const prior = list.slice(0, i).filter((p) => p.date < cur.date && t - Date.parse(p.date) <= YEAR);
      if (prior.length) ratios.push(cur.total / Math.max(...prior.map((p) => p.total)));
    });
  }
  // Too little data: a modest spread around a small improvement.
  return ratios.length >= 50 ? ratios : [0.96, 0.98, 1, 1.01, 1.02, 1.02, 1.03, 1.04, 1.06, 1.08];
}

// Small seeded RNG so the numbers don't jump around every time the page
// re-renders (same inputs → same answer).
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationResult {
  sims: number;
  // placeCounts[i] = simulations finishing in place i + 1 (bomb-outs excluded).
  placeCounts: number[];
  bombs: number;
  totals: { p10: number; p50: number; p90: number } | null;
  plan: Record<LiftKey, Triple>;
  fieldSize: number;
}

export function simulatePlacing(opts: {
  maxes: Record<LiftKey, number>;
  model: AttemptModel;
  competitorBests: number[];
  ratios: number[];
  sims?: number;
  seed?: number;
}): SimulationResult {
  const { maxes, model, competitorBests, ratios } = opts;
  const sims = opts.sims ?? 5000;
  const rnd = mulberry32(opts.seed ?? 1);

  // The planned attempts for each lift (each at least 2.5 kg above the last).
  const plan = Object.fromEntries(
    LIFTS.map((lift) => {
      const w1 = roundToPlate(maxes[lift] * model.pct[0]);
      const w2 = Math.max(w1 + 2.5, roundToPlate(maxes[lift] * model.pct[1]));
      const w3 = Math.max(w2 + 2.5, roundToPlate(maxes[lift] * model.pct[2]));
      return [lift, [w1, w2, w3]];
    }),
  ) as Record<LiftKey, Triple>;

  const placeCounts = new Array(competitorBests.length + 1).fill(0);
  const totals: number[] = [];
  let bombs = 0;
  for (let s = 0; s < sims; s++) {
    let total = 0;
    let bombed = false;
    for (const lift of LIFTS) {
      let weight = plan[lift][0];
      let best = 0;
      for (let k = 0; k < 3; k++) {
        if (rnd() < model.rates[lift][k]) {
          best = weight;
          weight = k < 2 ? Math.max(plan[lift][k + 1], weight + 2.5) : weight;
        }
        // a miss: repeat the same weight
      }
      if (best === 0) bombed = true;
      total += best;
    }
    if (bombed) {
      bombs++;
      continue;
    }
    totals.push(total);
    let above = 0;
    for (const b of competitorBests) {
      if (b * ratios[Math.floor(rnd() * ratios.length)] > total) above++;
    }
    placeCounts[above]++;
  }
  totals.sort((a, b) => a - b);
  const q = (p: number) => totals[Math.floor(p * (totals.length - 1))];
  return {
    sims,
    placeCounts,
    bombs,
    totals: totals.length ? { p10: q(0.1), p50: q(0.5), p90: q(0.9) } : null,
    plan,
    fieldSize: competitorBests.length + 1,
  };
}
