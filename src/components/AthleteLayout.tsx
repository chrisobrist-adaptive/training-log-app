import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// Coach-side frame for everything about one athlete: a left sidebar of tabs
// (Overview / Graphs / RPE chart / Annual plan) beside the page content, so
// each area has its own spot instead of one long page. On narrow screens
// the sidebar becomes a row of tabs above the content.

export type AthleteTab = "overview" | "graphs" | "rpe" | "plan";

const TABS: { key: AthleteTab; label: string; path: string; icon: ReactNode }[] = [
  {
    key: "overview",
    label: "Overview",
    path: "",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
        <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
        <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    key: "graphs",
    label: "Graphs",
    path: "/graphs",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20V13M12 20V7M19 20V15" />
      </svg>
    ),
  },
  {
    key: "rpe",
    label: "RPE chart",
    path: "/rpe-chart",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
        <path d="M3.5 9.5h17M3.5 15h17M9.5 3.5v17M15 3.5v17" />
      </svg>
    ),
  },
  {
    key: "plan",
    label: "Annual plan",
    path: "/periodization",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
        <path d="M4 10H20M8.5 3.5V7M15.5 3.5V7" />
      </svg>
    ),
  },
];

export default function AthleteLayout({ athleteId, active, children }: { athleteId: string; active: AthleteTab; children: ReactNode }) {
  return (
    <div className="athlete-layout">
      <nav className="athlete-sidebar" aria-label="Athlete sections">
        <Link to="/" className="athlete-sidebar-back">
          ← All athletes
        </Link>
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={`/athletes/${athleteId}${t.path}`}
            className={`athlete-sidebar-item${t.key === active ? " active" : ""}`}
            aria-current={t.key === active ? "page" : undefined}
          >
            {t.icon}
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>
      <div className="athlete-content">{children}</div>
    </div>
  );
}
