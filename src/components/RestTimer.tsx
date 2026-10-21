import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { formatRestTime } from "../lib/sessionPlayerHelpers";

// The rest timer: a round clock button (shows the remaining time as a badge
// while a rest runs) that opens a bottom sheet with −15s / ring dial / +15s
// and Start or Skip. Lives in the Training page header rather than inside
// SessionPlayer, so the header can hold it beside the block switcher;
// SessionPlayer starts the default rest through the ref when a set is
// completed. State persists per training day in localStorage, so a running
// rest survives the app being closed.

export const DEFAULT_REST_SECONDS = 180;
const DIAL_R = 96;
const DIAL_C = 2 * Math.PI * DIAL_R;

function restEndKey(dayId: string) {
  return `log-rest-end:${dayId}`;
}
function restTotalKey(dayId: string) {
  return `log-rest-total:${dayId}`;
}
export function clearRestTimerStorage(dayId: string) {
  try {
    localStorage.removeItem(restEndKey(dayId));
    localStorage.removeItem(restTotalKey(dayId));
  } catch {
    // ignore
  }
}
function notifyRestStarted() {
  // best-effort browser notification when a rest timer begins — the exact
  // original implementation (permission handling etc.) wasn't recovered.
}
function notifyRestEnded() {
  // best-effort browser notification when a rest timer hits zero.
}

export interface RestTimerHandle {
  startDefault: () => void;
  clear: () => void;
}

const RestTimer = forwardRef<RestTimerHandle, { dayId: string }>(function RestTimer({ dayId }, ref) {
  const [restEndAt, setRestEndAt] = useState<number | null>(() => {
    try {
      const n = Number(localStorage.getItem(restEndKey(dayId)));
      return Number.isFinite(n) && n > Date.now() ? n : null;
    } catch {
      return null;
    }
  });
  const [restSecondsLeft, setRestSecondsLeft] = useState(() => (restEndAt ? Math.ceil((restEndAt - Date.now()) / 1000) : 0));
  // Full length of the current rest, for the ring's proportion.
  const [restTotal, setRestTotal] = useState(() => {
    try {
      const n = Number(localStorage.getItem(restTotalKey(dayId)));
      return Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  });
  const [open, setOpen] = useState(false);
  // Length the clock starts from when no rest is running (±15s adjusts it).
  const [restPreset, setRestPreset] = useState(DEFAULT_REST_SECONDS);
  const isResting = restSecondsLeft > 0;
  // Full ring when idle; drains as the running rest counts down.
  const dialFraction = isResting ? (restTotal > 0 ? Math.min(1, restSecondsLeft / restTotal) : 0) : 1;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function setRestTimer(seconds: number, total = seconds) {
    const endAt = seconds > 0 ? Date.now() + seconds * 1000 : null;
    setRestEndAt(endAt);
    setRestSecondsLeft(seconds > 0 ? seconds : 0);
    setRestTotal(endAt ? total : 0);
    if (endAt && total === seconds) notifyRestStarted();
    try {
      if (endAt) {
        localStorage.setItem(restEndKey(dayId), String(endAt));
        localStorage.setItem(restTotalKey(dayId), String(total));
      } else {
        clearRestTimerStorage(dayId);
      }
    } catch {
      // ignore
    }
  }
  // ±15s nudges the running countdown without restarting the ring: adding
  // time grows the total too (so the ring stays proportional), removing it
  // just shortens what's left.
  function adjustRest(delta: number) {
    const next = Math.max(0, restSecondsLeft + delta);
    setRestTimer(next, delta > 0 ? restTotal + delta : restTotal);
  }

  useImperativeHandle(ref, () => ({
    startDefault: () => setRestTimer(DEFAULT_REST_SECONDS),
    clear: () => setRestTimer(0),
  }));

  const lastNotifiedEndAt = useRef<number | null>(null);
  useEffect(() => {
    const interval = setInterval(() => {
      const secondsLeft = restEndAt ? Math.max(0, Math.ceil((restEndAt - Date.now()) / 1000)) : 0;
      setRestSecondsLeft(secondsLeft);
      if (restEndAt && secondsLeft === 0 && lastNotifiedEndAt.current !== restEndAt) {
        lastNotifiedEndAt.current = restEndAt;
        notifyRestEnded();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [restEndAt]);

  return (
    <>
      <button
        type="button"
        className={`header-icon-btn log-clock-btn${isResting ? " running" : ""}`}
        onClick={() => setOpen(true)}
        title="Rest timer"
        aria-label="Rest timer"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 1.5" />
          <path d="M9 2h6" />
        </svg>
        {isResting && <span className="log-clock-badge">{formatRestTime(restSecondsLeft)}</span>}
      </button>
      {open && (
        <>
          {/* Bottom-sheet clock. Tapping the dimmed backdrop (or ✕ / Esc)
              closes it — the clock button only opens it. */}
          <div className="rest-sheet-backdrop" onClick={() => setOpen(false)} />
          <div className="rest-sheet" role="dialog" aria-label="Rest timer">
            <div className="rest-sheet-handle" />
            <div className="rest-sheet-header">
              <h2>Rest timer</h2>
              <button type="button" className="rest-sheet-close" onClick={() => setOpen(false)} aria-label="Close">
                ✕
              </button>
            </div>
            <div className="rest-dial-row">
              <button type="button" className="rest-adjust" onClick={() => (isResting ? adjustRest(-15) : setRestPreset((p) => Math.max(15, p - 15)))}>
                −15s
              </button>
              <div className="rest-dial">
                <svg viewBox="0 0 220 220" aria-hidden="true">
                  <circle className="rest-dial-track" cx="110" cy="110" r={DIAL_R} />
                  <circle
                    className="rest-dial-progress"
                    cx="110"
                    cy="110"
                    r={DIAL_R}
                    strokeDasharray={DIAL_C}
                    strokeDashoffset={DIAL_C * (1 - dialFraction)}
                  />
                </svg>
                <span className="rest-time">{formatRestTime(isResting ? restSecondsLeft : restPreset)}</span>
              </div>
              <button type="button" className="rest-adjust" onClick={() => (isResting ? adjustRest(15) : setRestPreset((p) => p + 15))}>
                +15s
              </button>
            </div>
            {isResting ? (
              <button type="button" className="rest-main-btn" onClick={() => setRestTimer(0)}>
                Skip
              </button>
            ) : (
              <button type="button" className="rest-main-btn" onClick={() => setRestTimer(restPreset)}>
                Start
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
});

export default RestTimer;
