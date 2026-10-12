import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// RECONSTRUCTED 2026-10-11 — the previous version of this file in the
// backup tree was plain Vite template boilerplate, never actually checked
// against the live bundle (flagged as such in BACKUP_STATUS.md). It was
// missing this real piece of app behavior (minified `pq`), found while
// tracing the route table for App.tsx:
//
// The very first time the app is launched in standalone/home-screen mode
// (iOS "Add to Home Screen" or Android's equivalent), it reloads itself
// ONCE, immediately, before rendering anything — then sets a localStorage
// flag so this never happens again on that device. This is a different
// mechanism from, and runs earlier than, both PWA fixes already documented
// elsewhere in this project: registerSW.js's proactive update-check
// (dist-v8, catches a stale bundle in an already-running session) and
// TrainingLog's followingToday re-check (dist-v11, catches a stale "today"
// after sitting backgrounded for days). This one only ever fires on a
// device's very first standalone launch, before React has rendered a
// single frame — almost certainly working around a platform quirk where
// the first paint in standalone mode comes up broken/stale until one
// reload. Worth confirming with Chris what originally prompted adding
// this, since nothing in this project's history (as tracked in
// BACKUP_STATUS.md) mentions it.
function warmStandaloneLaunchIfNeeded(): boolean {
  try {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const alreadyWarmed = localStorage.getItem("atl:standalone-warmed");
    if (!isStandalone || alreadyWarmed) return false;
    localStorage.setItem("atl:standalone-warmed", "1");
    window.location.reload();
    return true; // reloading — skip the render below entirely
  } catch {
    return false;
  }
}

if (!warmStandaloneLaunchIfNeeded()) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
