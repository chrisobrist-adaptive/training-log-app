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
    sessionStorage.setItem("atl:skip-splash", "1");
    window.location.reload();
    return true; // reloading — skip the render below entirely
  } catch {
    return false;
  }
}

// The logo splash in index.html shows for ~2s from launch (measured from
// page start, so a slow bundle load doesn't stretch it further), then fades.
const SPLASH_MS = 2000;
function hideSplashAfterLaunch() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  window.setTimeout(() => {
    splash.classList.add("splash-hide");
    window.setTimeout(() => splash.remove(), 400);
  }, Math.max(0, SPLASH_MS - performance.now()));
}

// Service worker: checks for a new deploy on launch and every time the app
// comes back to the foreground, and reloads once onto it as soon as the new
// version takes over (the SW is skipWaiting + clientsClaim, so that happens
// right after it installs). Without this, an installed home-screen app kept
// running the previous version until it had been fully closed twice. That
// one reload skips the launch splash via the atl:skip-splash flag.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // First-ever install also fires this — nothing stale to replace then.
    if (!hadController || reloading) return;
    reloading = true;
    try {
      sessionStorage.setItem("atl:skip-splash", "1");
    } catch {
      // ignore
    }
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}

if (!warmStandaloneLaunchIfNeeded()) {
  registerServiceWorker();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  hideSplashAfterLaunch();
}
