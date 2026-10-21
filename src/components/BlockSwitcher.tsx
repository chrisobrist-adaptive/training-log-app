// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `aK` (byte
// offset 843269). A dropdown trigger showing the active block's name
// with a chevron; the panel lists every block, checkmarking completed
// ones, closing on outside-click or Escape (same pattern as
// ExerciseInventoryPicker's own click-outside effect).
//
//   function aK({blocks:e,activeBlockId:t,completedBlockIds:n,onSelect:r}){
//     ...e.length===0?null:
//       <div ref ...>
//         <button onClick={toggle} aria-expanded={open} title="Switch block">
//           {activeBlock?.name ?? "Select block"} <chevron-svg/>
//         </button>
//         {open && <div className="card switcher-panel">
//           {blocks.map(b => <button className={active?...} onClick={()=>{onSelect(b.id); close()}}>
//             {b.name} {completedBlockIds.has(b.id) && <span>✓</span>}
//           </button>)}
//         </div>}
//       </div>

import { useEffect, useRef, useState } from "react";
import type { Block } from "../lib/types";

export default function BlockSwitcher({
  blocks,
  activeBlockId,
  completedBlockIds,
  onSelect,
  variant = "pill",
}: {
  blocks: Block[];
  activeBlockId: string | null;
  completedBlockIds: Set<string>;
  onSelect: (blockId: string) => void;
  // "icon": a round icon-only button (athlete Training header), with the
  // panel opening right-aligned beneath it. "pill": the original named
  // dropdown trigger.
  variant?: "pill" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activeBlock = blocks.find((b) => b.id === activeBlockId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (blocks.length === 0) return null;

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {variant === "icon" ? (
        <button
          type="button"
          className="switcher-icon-btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="Switch block"
          title="Switch block"
        >
          {/* stacked layers */}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l9 5-9 5-9-5 9-5z" />
            <path d="M3 13l9 5 9-5" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          className="switcher-trigger"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          title="Switch block"
        >
          {activeBlock?.name ?? "Select block"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      {open && (
        <div className={`card switcher-panel${variant === "icon" ? " switcher-panel-right" : ""}`} style={{ minWidth: 240 }}>
          {variant === "icon" && <div className="switcher-panel-caption">Blocks</div>}
          {blocks.map((b) => (
            <button
              key={b.id}
              type="button"
              className={`switcher-item${b.id === activeBlockId ? " active" : ""}`}
              onClick={() => {
                onSelect(b.id);
                setOpen(false);
              }}
            >
              <span>{b.name}</span>
              {completedBlockIds.has(b.id) && (
                <span style={{ color: "var(--good)" }} title="Block completed">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
