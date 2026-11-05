import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchMacroSets, type MacroSet } from "../lib/queries";
import type { Profile } from "../lib/types";
import {
  AGE_GROUPS,
  FEDERATIONS,
  buildField,
  loadField,
  placingFor,
  weightClassFor,
  type AgeGroup,
  type FieldData,
  type FieldResult,
  type Federation,
} from "../lib/competition";

// Coach-only: where this athlete's totals would place against real
// competition results (OpenPowerlifting — see lib/competition.ts).
//   Training total  = the 1RMs saved on their profile.
//   Estimated total = best competition-lift e1RMs from the last 12 weeks of
//                     logged sets (same formula as Macro review), to 2.5 kg.

const ESTIMATE_WEEKS = 12;
const toPlate = (v: number) => Math.round(v / 2.5) * 2.5;
const e1rm = (s: MacroSet) => s.weight * (1 + (s.reps + (s.rpe != null ? 10 - s.rpe : 0)) / 30);

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function CompetitionPanel({ profile, onProfileChange }: { profile: Profile; onProfileChange: (p: Profile) => void }) {
  const [field, setField] = useState<FieldData | null>(null);
  const [fieldError, setFieldError] = useState(false);
  const [sets, setSets] = useState<MacroSet[] | null>(null);

  const [level, setLevel] = useState<"national" | "international">("national");
  const [nationalFed, setNationalFed] = useState<Federation>("APLA");
  const [months, setMonths] = useState(12);
  const [ageGroup, setAgeGroup] = useState<AgeGroup>("open");
  const [testedOnly, setTestedOnly] = useState(true);

  // Competition details form (saved to the athlete's profile).
  const [sex, setSex] = useState(profile.comp_sex ?? "");
  const [bodyweight, setBodyweight] = useState(profile.comp_bodyweight != null ? String(profile.comp_bodyweight) : "");
  const [equipment, setEquipment] = useState(profile.comp_equipment ?? "Raw");
  const [birthYear, setBirthYear] = useState(profile.birth_year != null ? String(profile.birth_year) : "");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(profile.comp_sex == null || profile.comp_bodyweight == null);

  useEffect(() => {
    loadField().then(setField, () => setFieldError(true));
    fetchMacroSets(profile.id).then(setSets);
  }, [profile.id]);

  const saveDetails = async () => {
    const patch = {
      comp_sex: sex === "M" || sex === "F" ? sex : null,
      comp_bodyweight: bodyweight === "" ? null : Number(bodyweight),
      comp_equipment: equipment === "Single-ply" ? "Single-ply" : "Raw",
      birth_year: birthYear === "" ? null : Number(birthYear),
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
    profile.squat_1rm != null && profile.bench_1rm != null && profile.deadlift_1rm != null
      ? Number(profile.squat_1rm) + Number(profile.bench_1rm) + Number(profile.deadlift_1rm)
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

  const results = useMemo(() => {
    if (!field || !compSex || !weightClass) return null;
    return buildField(field, {
      federation,
      sex: compSex,
      equipment: compEquipment,
      weightClass,
      months,
      ageGroup,
      testedOnly: federation === "AusPL" ? testedOnly : false,
    });
  }, [field, federation, compSex, compEquipment, weightClass, months, ageGroup, testedOnly]);

  const fedLabel = FEDERATIONS.find((f) => f.key === federation)!.label;
  const totals: { key: string; label: string; total: number | null }[] = [
    { key: "training", label: "Training total", total: trainingTotal },
    { key: "estimate", label: "Estimated total", total: estimate?.total ?? null },
  ];

  // The field list with the athlete's totals slotted in where they'd land.
  const tableRows = useMemo(() => {
    if (!results) return [];
    type Row = { kind: "field"; r: FieldResult; place: number } | { kind: "athlete"; label: string; total: number; place: number };
    const markers = totals.filter((t) => t.total != null).map((t) => ({ label: t.label, total: t.total! }));
    const out: Row[] = [];
    let place = 1;
    const pending = [...markers].sort((a, b) => b.total - a.total);
    for (const r of results) {
      while (pending.length && pending[0].total >= r.total) {
        const m = pending.shift()!;
        out.push({ kind: "athlete", label: m.label, total: m.total, place: placingFor(results, m.total).place });
      }
      out.push({ kind: "field", r, place: place++ });
    }
    for (const m of pending) out.push({ kind: "athlete", label: m.label, total: m.total, place: placingFor(results, m.total).place });
    return out;
  }, [results, trainingTotal, estimate?.total]); // eslint-disable-line react-hooks/exhaustive-deps

  const detailsSummary =
    compSex && compBw
      ? `${compSex === "M" ? "Male" : "Female"} · ${compBw} kg · ${compEquipment === "Raw" ? "Raw" : "Equipped"}${profile.birth_year ? ` · born ${profile.birth_year}` : ""}`
      : null;

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
                        {t.total != null ? `${t.total} kg` : t.key === "training" ? "No 1RMs set" : "Not enough recent logs"}
                        {p ? <span className="muted"> · beats {p.percentile.toFixed(0)}% of the field</span> : null}
                      </div>
                      <div className="macro-card-line muted">
                        {fedLabel} · {compSex === "M" ? "Men" : "Women"} {weightClass} kg · {compEquipment === "Raw" ? "Raw" : "Equipped"}
                      </div>
                    </div>
                  );
                })}
              </div>

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
                <h2>
                  Field · {fedLabel} {weightClass} kg
                </h2>
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
                              <td>{row.label === "Training total" ? profile.squat_1rm : estimate?.squat}</td>
                              <td>{row.label === "Training total" ? profile.bench_1rm : estimate?.bench}</td>
                              <td>{row.label === "Training total" ? profile.deadlift_1rm : estimate?.deadlift}</td>
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
