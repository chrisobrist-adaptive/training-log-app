import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

// RECONSTRUCTED 2026-10-11 from the live production bundle — this file was
// completely missing from the backup tree before today (every route in
// App.tsx wraps its page in `<Layout>`, so nothing could render without
// it). Turned out to be two components in the real source, both recovered
// from the bundle and kept separate here the same way: the minified `uq`
// (renamed `Layout` — route guard: loading / no-session / no-profile
// states) which renders the minified `Kc` (renamed `AppShell` — the actual
// nav chrome) once there's a real signed-in, profiled user.

// The "wide" main-content treatment is only used for the coach's
// athlete-detail and block-builder pages (both need more horizontal room
// for tables) — same regex as the live bundle's `Gc`.
const WIDE_PAGE_PATTERN = /^\/athletes\/[^/]+(\/blocks\/[^/]+)?$/;

function AppShell({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isWidePage = WIDE_PAGE_PATTERN.test(location.pathname);
  // The bottom "Training" tab also highlights for `/day/:dayId` — i.e. a
  // single-day view is considered part of the same section as the main
  // training log, not a separate area. (Still don't know what links TO
  // `/day/:dayId` — see App.tsx's header comment.)
  const isTrainingTabActive = location.pathname === "/" || location.pathname.startsWith("/day/");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const accountMenuPanel = menuOpen && (
    <div className={`card account-menu-panel${profile?.role === "athlete" ? " account-menu-panel-up" : ""}`}>
      {profile && (
        <div className="muted" style={{ padding: "0.3rem 0.5rem", fontSize: "0.85rem", textAlign: "center" }}>
          {profile.name}
        </div>
      )}
      <Link
        to="/account"
        className="secondary-button"
        style={{ display: "block", textAlign: "center", marginBottom: "0.4rem" }}
        onClick={() => setMenuOpen(false)}
      >
        Account
      </Link>
      <button
        type="button"
        className="secondary-button"
        style={{ width: "100%", textAlign: "center" }}
        onClick={() => {
          setMenuOpen(false);
          signOut();
        }}
      >
        Sign out
      </button>
    </div>
  );

  if (profile?.role === "athlete") {
    return (
      <div className="app-shell">
        <main className="app-main app-main-with-tabbar">{children}</main>
        <nav className="bottom-tabbar">
          <Link to="/" className={isTrainingTabActive ? "active" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 9v6M7.5 6v12M11.5 11h1M16.5 6v12M20 9v6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Training</span>
          </Link>
          <Link to="/history" className={location.pathname === "/history" ? "active" : undefined}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 20V13M12 20V7M19 20V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Graphs</span>
          </Link>
          <div ref={menuRef} style={{ position: "relative", flex: 1, display: "flex" }}>
            <button
              type="button"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              className={location.pathname === "/account" ? "active" : undefined}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M4.5 6.5H19.5M4.5 12H19.5M4.5 17.5H19.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <span>Account</span>
            </button>
            {accountMenuPanel}
          </div>
        </nav>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/logo.png" alt="Adaptive Performance" />
        </Link>
        <nav>
          <Link to="/">Athletes</Link>
        </nav>
        <div className="topbar-right">
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              className="link-button"
              aria-label="Account menu"
              aria-expanded={menuOpen}
              title="Account menu"
              onClick={() => setMenuOpen((o) => !o)}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "0.3rem", textDecoration: "none", color: "var(--text)" }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5.5H17M3 10H17M3 14.5H17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            {accountMenuPanel}
          </div>
        </div>
      </header>
      <main className={isWidePage ? "app-main app-main-wide" : "app-main"}>{children}</main>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="centered-page">Loading…</div>
    );
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (!profile) {
    return (
      <div className="centered-page">
        <div className="card">
          <h1>Account not set up</h1>
          <p className="muted">
            Your login worked, but there's no profile linked to it yet. If you're an athlete, ask your coach to re-send your invite. If you're the
            coach, check that a coach profile wasn't already created for a different account.
          </p>
        </div>
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}
