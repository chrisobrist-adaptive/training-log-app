// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `iK`,
// found at byte offset 839640 (extracted via extract.mjs, confirmed
// exact — re-extracted fresh this session, byte-for-byte identical to
// the copy pulled earlier in this effort). This is a 1:1 translation,
// not a rewrite.
//
// Depends on LiftCategoryBadge.tsx for both the `<LiftCategoryBadge>`
// component itself and the shared `LIFT_CATEGORIES` array (minified
// `tK`) that drives the "retag as…" / "add new as…" button lists.
//
// Used by BlockBuilder.tsx (minified `yK`) per exercise row, confirmed
// via its call site:
//   jsx(iK,{inventory:d, selectedId:t.exercise_inventory_id,
//     onSelect:e=>{...}, onCreateNew:(e,n)=>(k(null),De(t.id,e,n)),
//     onRetagExisting:(e,t)=>(k(null),Oe(e,t)), autoOpen:t.id===O})
// — `onCreateNew`/`onRetagExisting` are awaited inside this component
// (`await r(g,e)` / `await i(y,e)`), so both must return a Promise in
// the real callers (BlockBuilder's `De`/`Oe` handlers do).
// `onRetagExisting` is optional — the minified source only shows the
// "retag" section when the `i` prop is truthy (`g&&y&&i&&...`).

import { useEffect, useRef, useState } from "react";
import type { ExerciseInventory } from "../lib/types";
import LiftCategoryBadge, { LIFT_CATEGORIES } from "./LiftCategoryBadge";

export default function ExerciseInventoryPicker({
  inventory,
  selectedId,
  onSelect,
  onCreateNew,
  onRetagExisting,
  autoOpen,
}: {
  inventory: ExerciseInventory[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreateNew: (name: string, categoryKey: string) => Promise<void>;
  onRetagExisting?: (item: ExerciseInventory, categoryKey: string) => Promise<void>;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(!!autoOpen);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [retaggingKey, setRetaggingKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selected = inventory.find((e) => e.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const trimmedQuery = query.trim();
  const filtered = trimmedQuery
    ? inventory.filter((e) => e.exercise_name.toLowerCase().includes(trimmedQuery.toLowerCase()))
    : inventory;
  const exactMatch = trimmedQuery
    ? inventory.find((e) => e.exercise_name.toLowerCase() === trimmedQuery.toLowerCase()) ?? null
    : null;

  const handleCreateNew = async (categoryKey: string) => {
    if (!trimmedQuery) return;
    setCreating(true);
    await onCreateNew(trimmedQuery, categoryKey);
    setCreating(false);
    setQuery("");
    setOpen(false);
  };

  const handleRetag = async (categoryKey: string) => {
    if (!exactMatch || !onRetagExisting) return;
    setRetaggingKey(categoryKey);
    await onRetagExisting(exactMatch, categoryKey);
    setRetaggingKey(null);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="secondary-button"
        style={{
          width: "100%",
          textAlign: "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center",
          gap: 6,
          ...(selected ? null : { borderColor: "var(--warn)" }),
        }}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <>
            <LiftCategoryBadge category={selected.lift} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {selected.exercise_name}
            </span>
          </>
        ) : (
          <span style={{ color: "var(--warn)" }}>⚠ Pick or add an exercise…</span>
        )}
      </button>

      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 20,
            marginTop: 4,
            width: 320,
            maxWidth: "90vw",
            maxHeight: 380,
            overflowY: "auto",
            padding: "0.6rem",
          }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search exercise or add new…"
            style={{ width: "100%", marginBottom: "0.5rem" }}
          />

          {filtered.length > 0 && (
            <div style={{ marginBottom: trimmedQuery ? "0.5rem" : 0 }}>
              {filtered.slice(0, 40).map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    onSelect(e.id);
                    setQuery("");
                    setOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: "0.35rem 0.3rem",
                    color: "var(--text)",
                    borderRadius: 6,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(ev) => (ev.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(ev) => (ev.currentTarget.style.background = "none")}
                >
                  <LiftCategoryBadge category={e.lift} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {e.exercise_name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 && !trimmedQuery && (
            <p className="muted" style={{ fontSize: "0.8rem", margin: "0.25rem 0" }}>
              No exercises yet — type a name to add one.
            </p>
          )}

          {trimmedQuery && exactMatch && onRetagExisting && (
            <div
              style={{
                borderTop: filtered.length > 0 ? "1px solid var(--border)" : "none",
                paddingTop: filtered.length > 0 ? "0.5rem" : 0,
              }}
            >
              <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 0.4rem" }}>
                "{trimmedQuery}" is already saved as {LIFT_CATEGORIES.find((c) => c.key === exactMatch.lift)?.label} — wrong tag? Retag it as
              </p>
              <div className="toolbar" style={{ flexWrap: "wrap" }}>
                {LIFT_CATEGORIES.filter((c) => c.key !== exactMatch.lift).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="secondary-button"
                    disabled={retaggingKey !== null}
                    onClick={() => handleRetag(c.key)}
                  >
                    {retaggingKey === c.key ? "Retagging…" : `→ ${c.label}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {trimmedQuery && !exactMatch && (
            <div
              style={{
                borderTop: filtered.length > 0 ? "1px solid var(--border)" : "none",
                paddingTop: filtered.length > 0 ? "0.5rem" : 0,
              }}
            >
              <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 0.4rem" }}>
                or blank: add "{trimmedQuery}" as
              </p>
              <div className="toolbar" style={{ flexWrap: "wrap" }}>
                {LIFT_CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="secondary-button"
                    disabled={creating}
                    onClick={() => handleCreateNew(c.key)}
                  >
                    + {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
