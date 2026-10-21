import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import type { PeriodizationBlock, PeriodizationMacrocycle, Profile } from "../../lib/types";

// Fixed set — a real <select> instead of the old free-text-with-suggestions
// input, so every block's phase is always one of exactly these four.
const PHASE_OPTIONS = ["Transition", "Preparatory", "Development", "Competition"] as const;

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function mondayOf(d: Date): Date {
  const copy = new Date(d);
  const offset = (copy.getDay() + 6) % 7; // Mon=0 ... Sun=6
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseLocalDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Standard ISO-8601 week number (matches what the Sheets version showed).
function isoWeekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

interface WeekCell {
  monday: Date;
  macrocycle: PeriodizationMacrocycle;
  block: PeriodizationBlock;
  microLabel: string;
  isMeetWeek: boolean;
}

// Lays out one meet's blocks backward from its meet date, same as before —
// this part of the math hasn't changed, it's just now merged with every
// other meet's onto one shared timeline instead of getting its own table.
function buildWeekCells(macrocycle: PeriodizationMacrocycle, blocks: PeriodizationBlock[]): WeekCell[] {
  const sorted = [...blocks].sort((a, b) => a.order_index - b.order_index);
  const totalWeeks = sorted.reduce((sum, b) => sum + Math.max(1, b.num_weeks), 0);
  if (totalWeeks === 0) return [];
  const meetMonday = mondayOf(parseLocalDate(macrocycle.meet_date));
  const cells: WeekCell[] = [];
  let idx = 0;
  for (const block of sorted) {
    const n = Math.max(1, block.num_weeks);
    for (let i = 0; i < n; i++) {
      const weeksFromEnd = totalWeeks - 1 - idx;
      const monday = addDays(meetMonday, -7 * weeksFromEnd);
      const isDeload = block.deload_last_week && i === n - 1;
      const microLabel = isDeload ? "0" : String(i + 1);
      cells.push({ monday, macrocycle, block, microLabel, isMeetWeek: idx === totalWeeks - 1 });
      idx++;
    }
  }
  return cells;
}

function weeksOutNumber(meetDateIso: string): number {
  const meet = parseLocalDate(meetDateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((meet.getTime() - today.getTime()) / 86400000);
  return Math.max(0, Math.ceil(diffDays / 7));
}

function weeksOutText(meetDateIso: string): string {
  const meet = parseLocalDate(meetDateIso);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((meet.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "Meet passed";
  if (diffDays === 0) return "Meet day";
  const weeks = Math.ceil(diffDays / 7);
  return `${weeks} week${weeks === 1 ? "" : "s"} out`;
}

// How far ahead the calendar reaches by default when there's nothing (or
// not much) planned yet — a full year of blank weeks to sketch onto, same
// "annual planner" scope as the Google Sheets version this replaces.
const DEFAULT_WEEKS_AHEAD = 52;

// Every meet's backward-computed weeks, merged onto one shared row of
// Mondays — with no gaps in the actual calendar even if a stretch between
// two meets has no blocks planned yet, so it reads as one continuous
// calendar instead of one table per meet. The calendar itself is never
// empty: it always spans at least today through a year out, so there's
// somewhere to plan onto before any meet exists, and it silently stretches
// further in either direction if a meet's own computed weeks fall outside
// that default window (a meet already mid-prep, or one more than a year
// out) — nothing a meet needs is ever cut off.
function buildTimeline(macrocycles: PeriodizationMacrocycle[], blocksByMacrocycle: Record<string, PeriodizationBlock[]>) {
  const byKey = new Map<string, WeekCell>();
  const sorted = [...macrocycles].sort((a, b) => (a.meet_date < b.meet_date ? -1 : 1));
  for (const mc of sorted) {
    const cells = buildWeekCells(mc, blocksByMacrocycle[mc.id] ?? []);
    for (const cell of cells) byKey.set(dateKey(cell.monday), cell);
  }

  const todayMonday = mondayOf(new Date());
  let min = todayMonday;
  let max = addDays(todayMonday, 7 * DEFAULT_WEEKS_AHEAD);

  if (byKey.size > 0) {
    const allMondays = [...byKey.values()].map((c) => c.monday.getTime());
    const cellsMin = new Date(Math.min(...allMondays));
    const cellsMax = new Date(Math.max(...allMondays));
    if (cellsMin.getTime() < min.getTime()) min = cellsMin;
    if (cellsMax.getTime() > max.getTime()) max = cellsMax;
  }

  const mondays: Date[] = [];
  for (let d = min; d.getTime() <= max.getTime(); d = addDays(d, 7)) mondays.push(d);
  return { mondays, byKey };
}

// Groups a row of per-Monday values into contiguous spans wherever the
// group key repeats, so e.g. one meet name or one block can merge across
// however many week-columns it actually covers.
function spansBy<T>(mondays: Date[], byKey: Map<string, WeekCell>, keyOf: (cell: WeekCell | undefined) => T) {
  const groups: { key: T; cell: WeekCell | undefined; span: number; startIdx: number }[] = [];
  mondays.forEach((monday, i) => {
    const cell = byKey.get(dateKey(monday));
    const key = keyOf(cell);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.span++;
    else groups.push({ key, cell, span: 1, startIdx: i });
  });
  return groups;
}

function monthGroups(mondays: Date[]): { label: string; span: number }[] {
  const groups: { label: string; span: number }[] = [];
  for (const monday of mondays) {
    const label = monday.toLocaleDateString(undefined, { month: "short" });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.span++;
    else groups.push({ label, span: 1 });
  }
  return groups;
}

// Also used read-only by athletes on their "Plan" tab (see App.tsx's
// `/plan` route) — same calendar, but no editing controls.
export default function Periodization({ athleteId: athleteIdProp, readOnly = false }: { athleteId?: string; readOnly?: boolean } = {}) {
  const params = useParams<{ athleteId: string }>();
  const athleteId = athleteIdProp ?? params.athleteId;
  const [athlete, setAthlete] = useState<Profile | null>(null);
  const [macrocycles, setMacrocycles] = useState<PeriodizationMacrocycle[]>([]);
  const [blocksByMacrocycle, setBlocksByMacrocycle] = useState<Record<string, PeriodizationBlock[]>>({});
  const [loading, setLoading] = useState(true);
  const [newMeetName, setNewMeetName] = useState("");
  const [newMeetDate, setNewMeetDate] = useState("");
  const [addingMeet, setAddingMeet] = useState(false);

  const load = async () => {
    if (!athleteId) return;
    const [{ data: a }, { data: mcs }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", athleteId).single(),
      supabase.from("periodization_macrocycles").select("*").eq("athlete_id", athleteId).order("meet_date"),
    ]);
    if (a) setAthlete(a as Profile);
    const mcList = (mcs ?? []) as PeriodizationMacrocycle[];
    setMacrocycles(mcList);
    if (mcList.length > 0) {
      const { data: blocks } = await supabase
        .from("periodization_blocks")
        .select("*")
        .in(
          "macrocycle_id",
          mcList.map((m) => m.id)
        )
        .order("order_index");
      const grouped: Record<string, PeriodizationBlock[]> = {};
      for (const b of (blocks ?? []) as PeriodizationBlock[]) {
        (grouped[b.macrocycle_id] ??= []).push(b);
      }
      setBlocksByMacrocycle(grouped);
    } else {
      setBlocksByMacrocycle({});
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const totalBlocksSoFar = useMemo(
    () => Object.values(blocksByMacrocycle).reduce((sum, arr) => sum + arr.length, 0),
    [blocksByMacrocycle]
  );

  const nextMeet = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return macrocycles
      .filter((m) => parseLocalDate(m.meet_date).getTime() >= today.getTime())
      .sort((a, b) => (a.meet_date < b.meet_date ? -1 : 1))[0];
  }, [macrocycles]);

  const addMeet = async () => {
    if (!athleteId || !newMeetName.trim() || !newMeetDate) return;
    setAddingMeet(true);
    const { data, error } = await supabase
      .from("periodization_macrocycles")
      .insert({ athlete_id: athleteId, name: newMeetName.trim(), meet_date: newMeetDate, order_index: macrocycles.length })
      .select("*")
      .single();
    setAddingMeet(false);
    if (!error && data) {
      setMacrocycles((prev) => [...prev, data as PeriodizationMacrocycle].sort((a, b) => (a.meet_date < b.meet_date ? -1 : 1)));
      setNewMeetName("");
      setNewMeetDate("");
    }
  };

  const updateMacrocycle = async (id: string, patch: Partial<PeriodizationMacrocycle>) => {
    setMacrocycles((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await supabase.from("periodization_macrocycles").update(patch).eq("id", id);
  };

  const deleteMacrocycle = async (mc: PeriodizationMacrocycle) => {
    if (!window.confirm(`Delete "${mc.name}" and its whole timeline? This can't be undone.`)) return;
    setMacrocycles((prev) => prev.filter((m) => m.id !== mc.id));
    setBlocksByMacrocycle((prev) => {
      const copy = { ...prev };
      delete copy[mc.id];
      return copy;
    });
    await supabase.from("periodization_macrocycles").delete().eq("id", mc.id);
  };

  const addBlock = async (mc: PeriodizationMacrocycle) => {
    const existing = blocksByMacrocycle[mc.id] ?? [];
    const { data, error } = await supabase
      .from("periodization_blocks")
      .insert({ macrocycle_id: mc.id, name: `Block ${totalBlocksSoFar + 1}`, order_index: existing.length, num_weeks: 4, deload_last_week: true })
      .select("*")
      .single();
    if (!error && data) {
      setBlocksByMacrocycle((prev) => ({ ...prev, [mc.id]: [...existing, data as PeriodizationBlock] }));
    }
  };

  const updateBlock = async (mcId: string, blockId: string, patch: Partial<PeriodizationBlock>) => {
    setBlocksByMacrocycle((prev) => ({
      ...prev,
      [mcId]: (prev[mcId] ?? []).map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
    }));
    await supabase.from("periodization_blocks").update(patch).eq("id", blockId);
  };

  const deleteBlock = async (mcId: string, blockId: string) => {
    setBlocksByMacrocycle((prev) => ({ ...prev, [mcId]: (prev[mcId] ?? []).filter((b) => b.id !== blockId) }));
    await supabase.from("periodization_blocks").delete().eq("id", blockId);
  };

  const moveBlock = async (mcId: string, blockId: string, direction: -1 | 1) => {
    const list = [...(blocksByMacrocycle[mcId] ?? [])].sort((a, b) => a.order_index - b.order_index);
    const idx = list.findIndex((b) => b.id === blockId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= list.length) return;
    const a = list[idx];
    const b = list[swapIdx];
    const aOrder = a.order_index;
    const bOrder = b.order_index;
    setBlocksByMacrocycle((prev) => ({
      ...prev,
      [mcId]: (prev[mcId] ?? []).map((x) => (x.id === a.id ? { ...x, order_index: bOrder } : x.id === b.id ? { ...x, order_index: aOrder } : x)),
    }));
    await Promise.all([
      supabase.from("periodization_blocks").update({ order_index: bOrder }).eq("id", a.id),
      supabase.from("periodization_blocks").update({ order_index: aOrder }).eq("id", b.id),
    ]);
  };

  if (loading || !athlete) return <p className="muted">Loading…</p>;

  const { mondays, byKey } = buildTimeline(macrocycles, blocksByMacrocycle);
  const yearLabel = (() => {
    if (mondays.length === 0) return "";
    const startYear = mondays[0].getFullYear();
    const endYear = mondays[mondays.length - 1].getFullYear();
    return startYear === endYear ? String(startYear) : `${startYear}/${endYear}`;
  })();
  const monthHeaderGroups = monthGroups(mondays);
  const macrocycleSpans = spansBy(mondays, byKey, (cell) => cell?.macrocycle.id ?? null);
  const blockSpans = spansBy(mondays, byKey, (cell) => cell?.block.id ?? null);

  return (
    <div>
      <div className="page-header">
        <h1>{readOnly ? "Annual training plan" : `${athlete.name} — Annual training plan`}</h1>
        {!readOnly && (
          <div className="toolbar">
            <Link to={`/athletes/${athleteId}`} className="secondary-button">
              ← Back to {athlete.name.split(" ")[0]}
            </Link>
          </div>
        )}
      </div>

      {nextMeet && (
        <div className="weeks-out-hero">
          <span>Weeks out:</span>
          <strong>{weeksOutNumber(nextMeet.meet_date)}</strong>
        </div>
      )}

      {/* Always rendered, regardless of whether a meet has any blocks yet —
          a brand-new meet has nothing in the calendar below to hang a
          "delete" or "add block" control on, so renaming, rescheduling,
          adding its first block, and deleting a meet all live here instead. */}
      {macrocycles.length > 0 && (
        <div className="section">
          <h2>Meets</h2>
          {macrocycles
            .slice()
            .sort((a, b) => (a.meet_date < b.meet_date ? -1 : 1))
            .map((mc) => (
              readOnly ? (
                <div key={mc.id} className="toolbar" style={{ alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>{mc.name}</strong>
                  <span className="muted">{parseLocalDate(mc.meet_date).toLocaleDateString()}</span>
                  <span className="badge badge-deployed">{weeksOutText(mc.meet_date)}</span>
                </div>
              ) : (
              <div key={mc.id} className="toolbar" style={{ alignItems: "center", marginBottom: "0.5rem" }}>
                <input value={mc.name} onChange={(e) => updateMacrocycle(mc.id, { name: e.target.value })} style={{ minWidth: "200px" }} />
                <input type="date" value={mc.meet_date} onChange={(e) => updateMacrocycle(mc.id, { meet_date: e.target.value })} />
                <span className="badge badge-deployed">{weeksOutText(mc.meet_date)}</span>
                <span className="muted">{(blocksByMacrocycle[mc.id] ?? []).length} block(s)</span>
                <button className="secondary-button" onClick={() => addBlock(mc)}>
                  + Add block
                </button>
                <button className="danger-button" onClick={() => deleteMacrocycle(mc)}>
                  Delete meet
                </button>
              </div>
              )
            ))}
        </div>
      )}

      {/* The scrolling happens on an unpadded inner wrapper so the sticky
          row-label column pins flush to the visible edge — scrolling the
          padded .section itself let cells slide through the padding gap
          to the left of the labels. */}
      <div className="section">
        <div className="pt-scroll">
          <table className="periodization-table">
            <thead>
              <tr>
                <th className="pt-row-label">{yearLabel}</th>
                {monthHeaderGroups.map((g, i) => (
                  <th key={i} colSpan={g.span} style={{ textAlign: "center" }}>
                    {g.label}
                  </th>
                ))}
              </tr>
              {WEEKDAY_LABELS.map((label, dayOffset) => (
                <tr key={label}>
                  <th className="pt-row-label">{label}</th>
                  {mondays.map((monday, i) => {
                    const cell = byKey.get(dateKey(monday));
                    const day = addDays(monday, dayOffset);
                    return (
                      <th key={i} className={cell?.isMeetWeek ? "pt-meet-col" : undefined} style={{ textAlign: "center" }}>
                        {day.getDate()}
                        {cell?.isMeetWeek && dayOffset === 6 ? " ★" : ""}
                      </th>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <th className="pt-row-label">Week</th>
                {mondays.map((monday, i) => (
                  <th key={i} style={{ textAlign: "center" }}>
                    {isoWeekNumber(monday)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="muted pt-row-label">Macrocycle</td>
                {macrocycleSpans.map((group, i) => {
                  const mc = group.cell?.macrocycle;
                  if (!mc) {
                    return (
                      <td key={i} colSpan={group.span} className="muted pt-blank" style={{ textAlign: "center" }}>
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={i} colSpan={group.span} style={{ textAlign: "center", fontWeight: 700 }}>
                      {mc.name}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="muted pt-row-label">Mesocycle</td>
                {blockSpans.map((group, i) => {
                  const block = group.cell?.block;
                  const mcId = group.cell?.macrocycle.id;
                  if (!block || !mcId) {
                    return <td key={i} colSpan={group.span} className="pt-blank" />;
                  }
                  if (readOnly) {
                    return (
                      <td key={i} colSpan={group.span} style={{ textAlign: "center", fontWeight: 600 }}>
                        {block.name}
                      </td>
                    );
                  }
                  return (
                    <td key={i} colSpan={group.span}>
                      <div className="toolbar" style={{ flexWrap: "nowrap", gap: "0.35rem" }}>
                        <input
                          value={block.name}
                          onChange={(e) => updateBlock(mcId, block.id, { name: e.target.value })}
                          style={{ width: "90px" }}
                        />
                        <input
                          type="number"
                          min={1}
                          value={block.num_weeks}
                          onChange={(e) => updateBlock(mcId, block.id, { num_weeks: Math.max(1, Number(e.target.value) || 1) })}
                          title="Weeks in this block"
                          style={{ width: "48px" }}
                        />
                        <button className="link-button" onClick={() => moveBlock(mcId, block.id, -1)} title="Move earlier">
                          ↑
                        </button>
                        <button className="link-button" onClick={() => moveBlock(mcId, block.id, 1)} title="Move later">
                          ↓
                        </button>
                        <button className="link-button" onClick={() => deleteBlock(mcId, block.id)} title="Delete block">
                          ✕
                        </button>
                      </div>
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="muted pt-row-label">Microcycle</td>
                {mondays.map((monday, i) => {
                  const cell = byKey.get(dateKey(monday));
                  return (
                    <td key={i} className={cell ? undefined : "pt-blank"} style={{ textAlign: "center" }}>
                      {cell?.microLabel ?? ""}
                    </td>
                  );
                })}
              </tr>
              <tr>
                <td className="muted pt-row-label" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  Lift phases
                </td>
                <td colSpan={mondays.length} style={{ borderBottom: "none" }} />
              </tr>
              {(["squat", "bench", "deadlift"] as const).map((lift) => (
                <tr key={`phase-${lift}`}>
                  <td className="muted pt-row-label" style={{ textTransform: "capitalize" }}>
                    {lift}
                  </td>
                  {blockSpans.map((group, i) => {
                    const block = group.cell?.block;
                    const mcId = group.cell?.macrocycle.id;
                    if (!block || !mcId) return <td key={i} colSpan={group.span} className="pt-blank" />;
                    const value = (block[`${lift}_phase` as keyof PeriodizationBlock] as string) ?? "";
                    if (readOnly) {
                      return (
                        <td key={i} colSpan={group.span} style={{ textAlign: "center" }}>
                          {value || "—"}
                        </td>
                      );
                    }
                    return (
                      <td key={i} colSpan={group.span}>
                        <select
                          value={value}
                          onChange={(e) => updateBlock(mcId, block.id, { [`${lift}_phase`]: e.target.value } as Partial<PeriodizationBlock>)}
                          style={{ width: "100%" }}
                        >
                          <option value="" disabled>
                            —
                          </option>
                          {PHASE_OPTIONS.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr>
                <td className="muted pt-row-label" style={{ borderBottom: "none", paddingBottom: 0 }}>
                  Lift intensities
                </td>
                <td colSpan={mondays.length} style={{ borderBottom: "none" }} />
              </tr>
              {(["squat", "bench", "deadlift"] as const).map((lift) => (
                <tr key={`intensity-${lift}`}>
                  <td className="muted pt-row-label" style={{ textTransform: "capitalize" }}>
                    {lift}
                  </td>
                  {blockSpans.map((group, i) => {
                    const block = group.cell?.block;
                    const mcId = group.cell?.macrocycle.id;
                    if (!block || !mcId) return <td key={i} colSpan={group.span} className="pt-blank" />;
                    const value = (block[`${lift}_intensity` as keyof PeriodizationBlock] as string) ?? "";
                    if (readOnly) {
                      return (
                        <td key={i} colSpan={group.span} style={{ textAlign: "center" }}>
                          {value || "—"}
                        </td>
                      );
                    }
                    return (
                      <td key={i} colSpan={group.span}>
                        <input
                          value={value}
                          onChange={(e) => updateBlock(mcId, block.id, { [`${lift}_intensity`]: e.target.value } as Partial<PeriodizationBlock>)}
                          placeholder="e.g. 77-83%"
                          style={{ width: "100%" }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {!readOnly && (
      <div className="section">
        <h2>Add a meet</h2>
        <div className="toolbar" style={{ alignItems: "flex-end" }}>
          <label style={{ marginBottom: 0 }}>
            Meet name
            <input value={newMeetName} onChange={(e) => setNewMeetName(e.target.value)} />
          </label>
          <label style={{ marginBottom: 0 }}>
            Meet date
            <input type="date" value={newMeetDate} onChange={(e) => setNewMeetDate(e.target.value)} />
          </label>
          <button className="primary-button" onClick={addMeet} disabled={addingMeet || !newMeetName.trim() || !newMeetDate}>
            {addingMeet ? "Adding…" : "+ Add meet"}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
