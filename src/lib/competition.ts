// Coach-only competition comparison: where an athlete's totals would place
// against real OpenPowerlifting results.
//
// The field file is built weekly by .github/workflows/opl-data.yml
// (scripts/opl/build_field.py) and published on the repo's `opl-data` branch:
// full-power results from APA (OpenPowerlifting code APLA), APL (AusPL) and
// IPF international meets, last 3 years.

export const OPL_FIELD_URL: string =
  import.meta.env.VITE_OPL_FIELD_URL ??
  "https://raw.githubusercontent.com/chrisobrist-adaptive/training-log-app/opl-data/opl-field.json";

export type Federation = "APLA" | "AusPL" | "IPF";
export const FEDERATIONS: { key: Federation; label: string; level: "national" | "international" }[] = [
  { key: "APLA", label: "APA", level: "national" },
  { key: "AusPL", label: "APL", level: "national" },
  { key: "IPF", label: "IPF", level: "international" },
];

export interface FieldResult {
  name: string;
  sex: string;
  equipment: string;
  age: number | null;
  weightClass: string | null;
  bodyweight: number | null;
  squat: number | null;
  bench: number | null;
  deadlift: number | null;
  total: number;
  place: string | null;
  tested: boolean;
  federation: string;
  date: string;
  meet: string;
  meetCountry: string | null;
}

export interface FieldData {
  updated: string;
  results: FieldResult[];
}

let fieldPromise: Promise<FieldData> | null = null;

// Loaded once per page session and shared.
export function loadField(): Promise<FieldData> {
  if (!fieldPromise) {
    fieldPromise = fetch(OPL_FIELD_URL)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json: { updated: string; columns: string[]; rows: unknown[][] }) => {
        const ix = Object.fromEntries(json.columns.map((c, i) => [c, i]));
        const get = (row: unknown[], c: string) => row[ix[c]] as never;
        return {
          updated: json.updated,
          results: json.rows.map((row) => ({
            name: get(row, "Name"),
            sex: get(row, "Sex"),
            equipment: get(row, "Equipment"),
            age: get(row, "Age"),
            weightClass: get(row, "WeightClassKg"),
            bodyweight: get(row, "BodyweightKg"),
            squat: get(row, "Best3SquatKg"),
            bench: get(row, "Best3BenchKg"),
            deadlift: get(row, "Best3DeadliftKg"),
            total: get(row, "TotalKg"),
            place: get(row, "Place"),
            tested: get(row, "Tested") === "Yes",
            federation: get(row, "Federation"),
            date: get(row, "Date"),
            meet: get(row, "MeetName"),
            meetCountry: get(row, "MeetCountry"),
          })),
        };
      })
      .catch((err) => {
        fieldPromise = null; // allow a retry next time
        throw err;
      });
  }
  return fieldPromise;
}

// Weight classes by federation and sex (upper limits, last one is "+").
// APA and IPF use the IPF classes; APL uses its own.
const IPF_CLASSES = { M: ["59", "66", "74", "83", "93", "105", "120", "120+"], F: ["47", "52", "57", "63", "69", "76", "84", "84+"] };
const APL_CLASSES = {
  M: ["52", "56", "60", "67.5", "75", "82.5", "90", "100", "110", "125", "140", "140+"],
  F: ["44", "48", "52", "56", "60", "67.5", "75", "82.5", "90", "100", "110", "110+"],
};

export function weightClassFor(federation: Federation, sex: "M" | "F", bodyweight: number): string {
  const classes = (federation === "AusPL" ? APL_CLASSES : IPF_CLASSES)[sex];
  for (const c of classes) {
    if (c.endsWith("+")) return c;
    if (bodyweight <= Number(c)) return c;
  }
  return classes[classes.length - 1];
}

// IPF-style age groups (age = competition year − birth year).
export type AgeGroup = "open" | "subjunior" | "junior" | "m1" | "m2" | "m3" | "m4";
export const AGE_GROUPS: { key: AgeGroup; label: string; min: number; max: number }[] = [
  { key: "open", label: "Open (all ages)", min: 0, max: 200 },
  { key: "subjunior", label: "Sub-junior (≤18)", min: 0, max: 18 },
  { key: "junior", label: "Junior (19–23)", min: 19, max: 23 },
  { key: "m1", label: "Masters 1 (40–49)", min: 40, max: 49 },
  { key: "m2", label: "Masters 2 (50–59)", min: 50, max: 59 },
  { key: "m3", label: "Masters 3 (60–69)", min: 60, max: 69 },
  { key: "m4", label: "Masters 4 (70+)", min: 70, max: 200 },
];

export interface FieldQuery {
  federation: Federation;
  sex: "M" | "F";
  equipment: "Raw" | "Single-ply";
  weightClass: string;
  months: number;
  ageGroup: AgeGroup;
  testedOnly: boolean;
}

// Every result matching a query (a lifter can appear once per meet), best
// total first.
export function matchingResults(data: FieldData, q: FieldQuery): FieldResult[] {
  const since = new Date();
  since.setMonth(since.getMonth() - q.months);
  const sinceIso = since.toISOString().slice(0, 10);
  const group = AGE_GROUPS.find((g) => g.key === q.ageGroup)!;
  const out: FieldResult[] = [];
  for (const r of data.results) {
    if (r.federation !== q.federation || r.sex !== q.sex || r.equipment !== q.equipment) continue;
    // Some meets record no weight class (World Games, Sheffield and other
    // points-based invitationals) — place those lifters by their bodyweight.
    const weightClass = r.weightClass ?? (r.bodyweight != null ? weightClassFor(q.federation, q.sex, r.bodyweight) : null);
    if (weightClass !== q.weightClass || r.date < sinceIso || !(r.total > 0)) continue;
    if (q.testedOnly && !r.tested) continue;
    if (q.ageGroup !== "open" && (r.age == null || Math.floor(r.age) < group.min || Math.floor(r.age) > group.max)) continue;
    out.push(r);
  }
  return out.sort((a, b) => b.total - a.total);
}

// The field for a query: every matching lifter once, at their best total in
// the period (so someone who competed three times counts once), best first.
export function buildField(data: FieldData, q: FieldQuery): FieldResult[] {
  const best = new Map<string, FieldResult>();
  for (const r of matchingResults(data, q)) {
    const prev = best.get(r.name);
    if (!prev || r.total > prev.total) best.set(r.name, r);
  }
  return [...best.values()].sort((a, b) => b.total - a.total);
}

// Where a total would land in a field (1-based; ties go to the athlete).
export function placingFor(field: FieldResult[], total: number): { place: number; of: number; percentile: number } {
  const above = field.filter((r) => r.total > total).length;
  const of = field.length + 1;
  return { place: above + 1, of, percentile: of > 1 ? ((of - (above + 1)) / (of - 1)) * 100 : 100 };
}
