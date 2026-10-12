// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js) by decoding the minified
// identifiers below. This is a 1:1 translation, not a rewrite.
//
// Minified source (verified exact, byte offset ~839087):
//
//   tK=[{key:`squat`,label:`Squat`,color:`#a78bfa`},
//       {key:`bench`,label:`Bench`,color:`#5b8def`},
//       {key:`deadlift`,label:`Deadlift`,color:`#3ecf7e`},
//       {key:`accessory`,label:`Accessory`,badgeLabel:`Acc`,color:`#9a9a9e`}]
//   nK=Object.fromEntries(tK.map(e=>[e.key,e]))
//   function rK({category:e}){
//     let t=nK[e];
//     return jsx(`span`,{style:{display:`inline-block`,fontSize:`0.62rem`,
//       fontWeight:700,padding:`0.05rem 0.35rem`,borderRadius:4,
//       color:t.color,border:`1px solid ${t.color}`,flexShrink:0,
//       letterSpacing:`0.02em`},
//       children:(t.badgeLabel??t.label).toUpperCase()})
//   }
//
// `tK` (the category/lift definitions array) is also a direct dependency
// of `ExerciseInventoryPicker.tsx` (minified `iK`) — its "retag" and
// "add new" UI lists the same four categories. Exported here as
// `LIFT_CATEGORIES` / `LIFT_CATEGORY_MAP` so that file can share it
// instead of duplicating the literal array.
//
// `category` is typed as `string` rather than a narrowed union because
// `exercise_inventory.lift` is a plain `text` column in the live schema
// (see database.types.ts) — the real app does not constrain it at the
// database level, so neither does this component. Looking up an unknown
// key crashes exactly as the minified original would (`nK[e]` would be
// `undefined` and `.color` would throw) — not patched here, since the
// error disclosed a real database write going through the app without a
// known category would be a bug worth being loud about, not one to hide.

export type LiftCategory = {
  key: string;
  label: string;
  badgeLabel?: string;
  color: string;
};

export const LIFT_CATEGORIES: LiftCategory[] = [
  { key: "squat", label: "Squat", color: "#a78bfa" },
  { key: "bench", label: "Bench", color: "#5b8def" },
  { key: "deadlift", label: "Deadlift", color: "#3ecf7e" },
  { key: "accessory", label: "Accessory", badgeLabel: "Acc", color: "#9a9a9e" },
];

export const LIFT_CATEGORY_MAP: Record<string, LiftCategory> = Object.fromEntries(
  LIFT_CATEGORIES.map((c) => [c.key, c]),
);

export default function LiftCategoryBadge({ category }: { category: string }) {
  const c = LIFT_CATEGORY_MAP[category];
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.62rem",
        fontWeight: 700,
        padding: "0.05rem 0.35rem",
        borderRadius: 4,
        color: c.color,
        border: `1px solid ${c.color}`,
        flexShrink: 0,
        letterSpacing: "0.02em",
      }}
    >
      {(c.badgeLabel ?? c.label).toUpperCase()}
    </span>
  );
}
