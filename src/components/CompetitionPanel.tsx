import { Fragment, useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import { projectLift, weeklySlope } from "../lib/maxProjection";
import { athleteModel, progressionRatios, simulatePlacing, typicalModel, type LiftKey } from "../lib/placingSimulation";
import { supabase } from "../lib/supabaseClient";
import { fetchMacroSets, type MacroSet } from "../lib/queries";
import type { Profile } from "../lib/types";
import {
  AGE_GROUPS,
  FEDERATIONS,
  buildField,
  loadField,
  matchingResults,
  placingFor,
  weightClassFor,
  type AgeGroup,
  type FieldData,
  type FieldQuery,
  type FieldResult,
  type Federation,
} from "../lib/competition";

// Coach-only: where this athlete's totals would place against real
// competition results (OpenPowerlifting — see lib/competition.ts).
//   Training total  = current training maxes (block 1RMs, else profile).
//   Estimated maxes = best competition-lift e1RMs from the last 12 weeks of
//                     logged sets (same formula as Macro review), to 2.5 kg.
//   Projected total = heaviest training lifts carried forward to the next
//                     meet in the annual plan along their trend, +2% taper.

const ESTIMATE_WEEKS = 12;
const toPlate = (v: number) => Math.round(v / 2.5) * 2.5;
const e1rm = (s: MacroSet) => s.weight * (1 + (s.reps + (s.rpe != null ? 10 - s.rpe : 0)) / 30);

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function CompetitionPanel({
  profile,
  onProfileChange,
  trainingMaxes: tm,
}: {
  profile: Profile;
  onProfileChange: (p: Profile) => void;
  // Current training maxes (calendar week's block 1RMs, else profile).
  trainingMaxes: Record<"squat" | "bench" | "deadlift", number | null>;
}) {
  const [field, setField] = useState<FieldData | null>(null);
  const [fieldError, setFieldError] = useState(false);
  const [sets, setSets] = useState<MacroSet[] | null>(null);

  const [level, setLevel] = useState<"national" | "international">("national");
  const [nationalFed, setNationalFed] = useState<Federation>("APLA");
  const [months, setMonths] = useState(12);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("open");
  const [testedOnly, setTestedOnly] = useState(true);
  // Field table: one row per lifter (best total) or every meet result.
  const [showAll, setShowAll] = useState(false);

  // Competition details form (saved to the athlete's profile).
  const [sex, setSex] = useState(profile.comp_sex ?? "");
  const [bodyweight, setBodyweight] = useState(profile.comp_bodyweight != null ? String(profile.comp_bodyweight) : "");
  const [equipment, setEquipment] = useState(profile.comp_equipment ?? "Raw");
  const [birthYear, setBirthYear] = useState(profile.birth_year != null ? String(profile.birth_year) : "");
  const [oplName, setOplName] = useState(profile.opl_name ?? "");
  // Which maxes the placing simulation starts from.
  const [simBase, setSimBase] = useState<"estimate" | "projected" | "training">("estimate");
  // Next meet in the annual plan (undefined = loading).
  const [nextMeet, setNextMeet] = useState<{ name: string; meet_date: string } | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(profile.comp_sex == null || profile.comp_bodyweight == null);

  useEffect(() => {
    loadField().then(setField, () => setFieldError(true));
    fetchMacroSets(profile.id).then(setSets);
    const today = new Date().toLocaleDateString("en-CA");
    supabase
      .from("periodization_macrocycles")
      .select("name, meet_date")
      .eq("athlete_id", profile.id)
      .gte("meet_date", today)
      .order("meet_date")
      .limit(1)
      .then(({ data }) => setNextMeet(data?.[0] ?? null));
  }, [profile.id]);

  const saveDetails = async () => {
    const patch = {
      comp_sex: sex === "M" || sex === "F" ? sex : null,
      comp_bodyweight: bodyweight === "" ? null : Number(bodyweight),
      comp_equipment: equipment === "Single-ply" ? "Single-ply" : "Raw",
      birth_year: birthYear === "" ? null : Number(birthYear),
      opl_name: oplName.trim() === "" ? null : oplName.trim(),
    };
    setSaving(true);
    const { error } = await supabase.from("profiles").update(patch).eq("id", profile.id);
    setSaving(false);
    if (error) {
      window.alert(`Couldn't save: ${error.message}`);
      return;
    }
    onProfileChange({ ...profile, ...patch });
    setEditing(false);
  };

  const federation: Federation = level === "international" ? "IPF" : nationalFed;
  const compSex = profile.comp_sex === "M" || profile.comp_sex === "F" ? profile.comp_sex : null;
  const compBw = profile.comp_bodyweight != null ? Number(profile.comp_bodyweight) : null;
  const compEquipment = profile.comp_equipment === "Single-ply" ? "Single-ply" : "Raw";
  const weightClass = compSex && compBw ? weightClassFor(federation, compSex, compBw) : null;

  const trainingTotal =
    tm.squat != null && tm.bench != null && tm.deadlift != null
      ? tm.squat + tm.bench + tm.deadlift
      : null;
  const estimate = useMemo(() => {
    if (!sets) return null;
    const since = new Date(Date.now() - ESTIMATE_WEEKS * 7 * 86400000).toISOString();
    const best = (lift: string) => {
      const vals = sets
        .filter((s) => s.lift === lift && s.mode === "competition" && s.weight > 0 && s.reps > 0 && s.status !== "skipped" && s.created_at >= since)
        .map(e1rm);
      return vals.length ? toPlate(Math.max(...vals)) : null;
    };
    const lifts = { squat: best("squat"), bench: best("bench"), deadlift: best("deadlift") };
    const total = lifts.squat != null && lifts.bench != null && lifts.deadlift != null ? lifts.squat + lifts.bench + lifts.deadlift : null;
    return { ...lifts, total };
  }, [sets]);

  // Heaviest training lifts carried forward to the next meet (see lib/maxProjection.ts).
  const projection = useMemo(() => {
    if (!sets || !nextMeet) return null;
    const meet = new Date(nextMeet.meet_date + "T00:00:00");
    const weeksOut = Math.max(0, (meet.getTime() - Date.now()) / (7 * 86400000));
    const since = new Date(Date.now() - ESTIMATE_WEEKS * 7 * 86400000).toISOString();
    const lift = (l: LiftKey) => {
      const points = sets
        .filter((s) => s.lift === l && s.mode === "competition" && s.weight > 0 && s.reps > 0 && s.status !== "skipped" && s.status !== "pending")
        .map((s) => ({ date: s.created_at, weight: s.weight }));
      // Heaviest weight lifted in the last 12 weeks (else the training max).
      const recent = points.filter((p) => p.date >= since).map((p) => p.weight);
      const current = recent.length ? Math.max(...recent) : tm[l];
      if (current == null) return null;
      return projectLift(current, weeklySlope(points), weeksOut);
    };
    const lifts = { squat: lift("squat"), bench: lift("bench"), deadlift: lift("deadlift") };
    const total =
      lifts.squat && lifts.bench && lifts.deadlift ? lifts.squat.projected + lifts.bench.projected + lifts.deadlift.projected : null;
    return { lifts, total, weeksOut: Math.round(weeksOut), meet: nextMeet };
  }, [sets, nextMeet, tm.squat, tm.bench, tm.deadlift]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(
    (): FieldQuery | null =>
      compSex && weightClass
        ? {
            federation,
            sex: compSex,
            equipment: compEquipment as "Raw" | "Single-ply",
            weightClass,
            months,
            ageGroup,
            testedOnly: federation === "AusPL" ? testedOnly : false,
          }
        : null,
    [federation, compSex, compEquipment, weightClass, months, ageGroup, testedOnly],
  );
  // `results` (each lifter once) drives the placings; `allResults` is only
  // for the field table's "Show every result" view.
  const results = useMemo(() => (field && query ? buildField(field, query) : null), [field, query]);
  const allResults = useMemo(() => (field && query && showAll ? matchingResults(field, query) : null), [field, query, showAll]);

  const fedLabel = FEDERATIONS.find((f) => f.key === federation)!.label;
  const totals: { key: string; label: string; total: number | null }[] = [
    { key: "training", label: "Training total", total: trainingTotal },
    { key: "projected", label: "Projected total", total: projection?.total ?? null },
  ];

  // The field list with the athlete's totals slotted in where they'd land.
  const tableRows = useMemo(() => {
    const list = showAll ? allResults : results;
    if (!list) return [];
    type Row = { kind: "field"; r: FieldResult; place: number } | { kind: "athlete"; label: string; total: number; place: number };
    const markers = totals.filter((t) => t.total != null).map((t) => ({ label: t.label, total: t.total! }));
    const out: Row[] = [];
    let place = 1;
    const pending = [...markers].sort((a, b) => b.total - a.total);
    // The "#" column is the position in whichever list is showing.
    for (const r of list) {
      while (pending.length && pending[0].total >= r.total) {
        const m = pending.shift()!;
        out.push({ kind: "athlete", label: m.label, total: m.total, place: placingFor(list, m.total).place });
      }
      out.push({ kind: "field", r, place: place++ });
    }
    for (const m of pending) out.push({ kind: "athlete", label: m.label, total: m.total, place: placingFor(list, m.total).place });
    return out;
  }, [results, allResults, showAll, trainingTotal, projection?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  // Probability of placing (see lib/placingSimulation.ts).
  const simulation = useMemo(() => {
    if (!field || !results || !query) return null;
    const training: Record<LiftKey, number | null> = tm;
    const pick = (l: LiftKey) =>
      simBase === "estimate" ? (estimate?.[l] ?? training[l]) : simBase === "projected" ? (projection?.lifts[l]?.projected ?? null) : training[l];
    const maxes = { squat: pick("squat"), bench: pick("bench"), deadlift: pick("deadlift") };
    if (maxes.squat == null || maxes.bench == null || maxes.deadlift == null) return null;
    const typical = typicalModel(field, query.federation, query.equipment);
    const model = athleteModel(field, profile.opl_name, typical);
    // Stable seed per athlete + settings, so results don't flicker.
    const key = [profile.id, query.federation, query.weightClass, query.months, query.ageGroup, query.testedOnly, simBase].join("|");
    let seed = 0;
    for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) | 0;
    const result = simulatePlacing({
      maxes: maxes as Record<LiftKey, number>,
      model,
      // The athlete's own past results aren't competitors.
      competitorBests: results.filter((r) => r.name.toLowerCase() !== (profile.opl_name ?? "").trim().toLowerCase()).map((r) => r.total),
      ratios: progressionRatios(field, query.federation, query.equipment),
      seed,
    });
    return { result, model, maxes: maxes as Record<LiftKey, number> };
  }, [field, results, query, simBase, estimate, projection, profile, tm.squat, tm.bench, tm.deadlift]); // eslint-disable-line react-hooks/exhaustive-deps

  const detailsSummary =
    compSex && compBw
      ? `${compSex === "M" ? "Male" : "Female"} · ${compBw} kg · ${compEquipment === "Raw" ? "Raw" : "Equipped"}${profile.birth_year ? ` · born ${profile.birth_year}` : ""}${profile.opl_name ? ` · OPL: ${profile.opl_name}` : ""}`
      : null;

  // Switch between estimated and training maxes for the simulation.
  const simToggle = (
    <div className="lift-tabs" style={{ marginBottom: 0 }}>
      <button type="button" className={simBase === "estimate" ? "active" : ""} onClick={() => setSimBase("estimate")}>
        Estimated maxes
      </button>
      <button type="button" className={simBase === "projected" ? "active" : ""} onClick={() => setSimBase("projected")}>
        Projected maxes
      </button>
      <button type="button" className={simBase === "training" ? "active" : ""} onClick={() => setSimBase("training")}>
        Training maxes
      </button>
    </div>
  );

  return (
    <div className="competition">
      <div className="section">
        <div className="competition-details-head">
          <h2 style={{ margin: 0 }}>Competition details</h2>
          {!editing && (
            <button type="button" className="secondary-button" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        {editing ? (
          <div className="competition-details-form">
            <label>
              Sex
              <select value={sex} onChange={(e) => setSex(e.target.value)}>
                <option value="">—</option>
                <option value="M">Male</option>
                <option value="F">Female</option>
              </select>
            </label>
            <label>
              Bodyweight (kg)
              <input type="number" step="0.1" inputMode="decimal" value={bodyweight} onChange={(e) => setBodyweight(e.target.value)} />
            </label>
            <label>
              Equipment
              <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                <option value="Raw">Raw</option>
                <option value="Single-ply">Equipped</option>
              </select>
            </label>
            <label>
              Birth year
              <input type="number" inputMode="numeric" value={birthYear} onChange={(e) => setBirthYear(e.target.value)} />
            </label>
            <label>
              OpenPowerlifting name
              <input className="competition-opl-input" value={oplName} onChange={(e) => setOplName(e.target.value)} placeholder="As shown on OpenPowerlifting" />
            </label>
            <button type="button" className="primary-button" onClick={saveDetails} disabled={saving || !sex || !bodyweight}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        ) : (
          <p className="competition-details-summary">{detailsSummary}</p>
        )}
      </div>

      {compSex && compBw && (
        <>
          <div className="competition-controls">
            <div className="lift-tabs" style={{ marginBottom: 0 }}>
              <button type="button" className={level === "national" ? "active" : ""} onClick={() => setLevel("national")}>
                National
              </button>
              <button type="button" className={level === "international" ? "active" : ""} onClick={() => setLevel("international")}>
                International
              </button>
            </div>
            {level === "national" && (
              <div className="lift-tabs" style={{ marginBottom: 0 }}>
                {FEDERATIONS.filter((f) => f.level === "national").map((f) => (
                  <button key={f.key} type="button" className={nationalFed === f.key ? "active" : ""} onClick={() => setNationalFed(f.key)}>
                    {f.label}
                  </button>
                ))}
              </div>
            )}
            <div className="competition-filters">
              <label>
                Period
                <select value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                  <option value={12}>Last 12 months</option>
                  <option value={24}>Last 24 months</option>
                  <option value={36}>Last 36 months</option>
                </select>
              </label>
              <label>
                Age group
                <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value as AgeGroup)}>
                  {AGE_GROUPS.map((g) => (
                    <option key={g.key} value={g.key}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </label>
              {federation === "AusPL" && (
                <label className="competition-check">
                  <input type="checkbox" checked={testedOnly} onChange={(e) => setTestedOnly(e.target.checked)} />
                  Drug-tested only
                </label>
              )}
            </div>
          </div>

          {fieldError ? (
            <p className="muted">Couldn't load competition results right now.</p>
          ) : !results ? (
            <p className="muted">Loading…</p>
          ) : (
            <>
              <div className="macro-cards">
                {totals.map((t) => {
                  const p = t.total != null ? placingFor(results, t.total) : null;
                  return (
                    <div key={t.key} className="section macro-card">
                      <h2>{t.label}</h2>
                      <div className="macro-big">
                        {p ? ordinal(p.place) : "—"} <span className="macro-big-unit">{p ? `of ${p.of}` : ""}</span>
                      </div>
                      <div className="macro-card-line">
                        {t.total != null
                          ? `${t.total} kg`
                          : t.key === "training"
                            ? "No 1RMs set"
                            : t.key === "projected" && nextMeet === null
                              ? "No meet in annual plan"
                              : "Not enough recent logs"}
                        {p ? <span className="muted"> · beats {p.percentile.toFixed(0)}% of the field</span> : null}
                      </div>
                      {t.key === "projected" && projection && (
                        <div className="macro-card-line muted">
                          {projection.meet.name} · {projection.weeksOut} weeks out
                        </div>
                      )}
                      <div className="macro-card-line muted">
                        {fedLabel} · {compSex === "M" ? "Men" : "Women"} {weightClass} kg · {compEquipment === "Raw" ? "Raw" : "Equipped"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!simulation && field && results.length > 0 && (
                <div className="section">
                  <div className="competition-field-head">
                    <h2 style={{ margin: 0 }}>Chance of placing</h2>
                    {simToggle}
                  </div>
                  <p className="muted" style={{ margin: 0 }}>
                    {simBase === "training"
                      ? `Add ${profile.name.split(" ")[0]}'s squat, bench and deadlift 1RMs to use training maxes.`
                      : simBase === "projected" && nextMeet === null
                        ? `Add a meet to ${profile.name.split(" ")[0]}'s annual plan to project maxes.`
                        : "Not enough logged squat, bench and deadlift sets to estimate maxes yet."}
                  </p>
                </div>
              )}
              {simulation && results.length > 0 && (() => {
                const { result, model, maxes } = simulation;
                const pct = (n: number) => (result.sims ? (n / result.sims) * 100 : 0);
                const within = (k: number) => result.placeCounts.slice(0, k).reduce((a, b) => a + b, 0);
                const SHOWN = 15;
                const chart = [
                  ...result.placeCounts.slice(0, SHOWN).map((c, i) => ({ label: ordinal(i + 1), p: pct(c) })),
                  ...(result.placeCounts.length > SHOWN
                    ? [{ label: `${SHOWN + 1}+`, p: pct(result.placeCounts.slice(SHOWN).reduce((a, b) => a + b, 0)) }]
                    : []),
                  { label: "Bomb", p: pct(result.bombs) },
                ];
                const fmtPct = (v: number) => (v > 0 && v < 1 ? "<1%" : `${Math.round(v)}%`);
                return (
                  <div className="section">
                    <div className="competition-field-head">
                      <h2 style={{ margin: 0 }}>Chance of placing</h2>
                      {simToggle}
                    </div>
                    <div className="competition-thresholds">
                      {[
                        { label: "Win", v: pct(within(1)) },
                        { label: "Podium (top 3)", v: pct(within(3)) },
                        { label: "Top 10", v: pct(within(10)) },
                        { label: "Bomb-out risk", v: pct(result.bombs) },
                      ].map((t) => (
                        <div key={t.label} className="metric-tile">
                          <div className="value">{fmtPct(t.v)}</div>
                          <div className="label">{t.label}</div>
                        </div>
                      ))}
                    </div>
                    {result.totals && (
                      <div className="macro-card-line">
                        Likely meet-day total <strong>{result.totals.p50} kg</strong>
                        <span className="muted">
                          {" "}
                          (most meets {result.totals.p10}–{result.totals.p90} kg)
                        </span>
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={chart} margin={{ top: 16, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#38383b" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9a9a9e" }} interval={0} />
                        <YAxis tick={{ fontSize: 10, fill: "#9a9a9e" }} width={38} tickFormatter={(v: number) => `${v}%`} />
                        <Tooltip
                          cursor={false}
                          contentStyle={{ background: "#1c1c1e", border: "1px solid #38383b", borderRadius: 6, fontSize: 12 }}
                          labelStyle={{ color: "#f5f5f5" }}
                          itemStyle={{ color: "#f5f5f5" }}
                          formatter={(v) => [typeof v === "number" ? `${v.toFixed(1)}%` : "—", "Chance"]}
                        />
                        <Bar dataKey="p" fill="#f5821f" fillOpacity={0.55} activeBar={{ fillOpacity: 0.95 }} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="competition-plan">
                      <table className="metrics-summary-table">
                        <thead>
                          <tr>
                            <th>Lift</th>
                            <th>Max used</th>
                            {simBase === "projected" && <th>Trend</th>}
                            <th>Opener</th>
                            <th>2nd</th>
                            <th>3rd</th>
                            <th>Make rate (1st / 2nd / 3rd)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(["squat", "bench", "deadlift"] as const).map((l) => (
                            <tr key={l}>
                              <td style={{ textTransform: "capitalize" }}>
                                <strong>{l}</strong>
                              </td>
                              <td>{maxes[l]}</td>
                              {simBase === "projected" && (
                                <td>
                                  {projection?.lifts[l]?.slope != null
                                    ? `${projection.lifts[l]!.slope! >= 0 ? "+" : ""}${projection.lifts[l]!.slope!.toFixed(1)} kg/wk`
                                    : "—"}
                                </td>
                              )}
                              <td>{result.plan[l][0]}</td>
                              <td>{result.plan[l][1]}</td>
                              <td>{result.plan[l][2]}</td>
                              <td>{model.rates[l].map((r) => `${Math.round(r * 100)}%`).join(" / ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="competition-source">
                        {model.source === "athlete"
                          ? `Attempt habits from ${model.meets} of ${profile.name.split(" ")[0]}'s meets`
                          : `Typical ${fedLabel} attempt habits`}{" "}
                        · {result.sims.toLocaleString()} simulated meets
                      </div>
                    </div>
                  </div>
                );
              })()}

              {results.length > 0 && (
                <div className="section">
                  <div className="competition-thresholds">
                    {[
                      { label: "1st", i: 0 },
                      { label: "3rd", i: 2 },
                      { label: "Top 10", i: 9 },
                      { label: "Median", i: Math.floor((results.length - 1) / 2) },
                    ]
                      .filter((t) => results[t.i])
                      .map((t) => (
                        <div key={t.label} className="metric-tile">
                          <div className="value">{results[t.i].total} kg</div>
                          <div className="label">{t.label}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div className="section">
                <div className="competition-field-head">
                  <h2 style={{ margin: 0 }}>
                    Field · {fedLabel} {weightClass} kg
                  </h2>
                  <label className="competition-check">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                    Show every result
                  </label>
                </div>
                {results.length === 0 ? (
                  <p className="muted">No results for this class and period.</p>
                ) : (
                  <div className="competition-table-wrap">
                    <table className="metrics-summary-table competition-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Lifter</th>
                          <th>Squat</th>
                          <th>Bench</th>
                          <th>Deadlift</th>
                          <th>Total</th>
                          <th>Meet</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRows.map((row, i) =>
                          row.kind === "athlete" ? (
                            <tr key={`a-${row.label}`} className="competition-athlete-row">
                              <td>{row.place}</td>
                              <td>
                                <strong>
                                  {profile.name} · {row.label}
                                </strong>
                              </td>
                              <td>{row.label === "Training total" ? tm.squat : row.label === "Projected total" ? projection?.lifts.squat?.projected : estimate?.squat}</td>
                              <td>{row.label === "Training total" ? tm.bench : row.label === "Projected total" ? projection?.lifts.bench?.projected : estimate?.bench}</td>
                              <td>{row.label === "Training total" ? tm.deadlift : row.label === "Projected total" ? projection?.lifts.deadlift?.projected : estimate?.deadlift}</td>
                              <td>
                                <strong>{row.total}</strong>
                              </td>
                              <td />
                            </tr>
                          ) : (
                            <Fragment key={`f-${i}`}>
                              <tr>
                                <td>{row.place}</td>
                                <td>{row.r.name}</td>
                                <td>{row.r.squat ?? "—"}</td>
                                <td>{row.r.bench ?? "—"}</td>
                                <td>{row.r.deadlift ?? "—"}</td>
                                <td>
                                  <strong>{row.r.total}</strong>
                                </td>
                                <td className="competition-meet">
                                  {row.r.meet} · {row.r.date.slice(0, 7)}
                                </td>
                              </tr>
                            </Fragment>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
                {field && <div className="competition-source">OpenPowerlifting · {field.updated}</div>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
