import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AcceptInvite from "./pages/AcceptInvite";
import ResetPassword from "./pages/ResetPassword";
import Account from "./pages/Account";
import Dashboard from "./pages/coach/Dashboard";
import AthleteDetail from "./pages/coach/AthleteDetail";
import BlockBuilder from "./pages/coach/BlockBuilder";
import Periodization from "./pages/coach/Periodization";
import TrainingLog from "./pages/athlete/TrainingLog";
import History from "./pages/athlete/History";
import DayDetail from "./pages/DayDetail";

// RECONSTRUCTED 2026-10-11 from the live production bundle — the entire
// route table was recovered in one piece (minified `fq`), found via the
// three real `path:` route strings (`/login`, `/reset-password`, `/`) and
// read outward from there. `zt`/`Vt`/`Rt`/`En` are react-router's
// Route/Routes/Navigate/BrowserRouter; `Uc`/`Wc` are AuthProvider/useAuth
// (see AuthContext.tsx's header for how those were identified).
//
// Two things this recovery found that were NOT in BACKUP_STATUS's "not
// recovered" list before today — neither was known to exist:
//   1. `/day/:dayId` — a route with no in-app link discovered elsewhere in
//      this session's investigation so far. Likely a shareable/deep-link
//      single-day view (component not yet reconstructed — see
//      `DayDetail.tsx`'s own header). Flagged for Chris: worth confirming
//      what this is actually for before assuming it's dead code.
//   2. The old snapshot's `main.tsx` was missing a standalone-PWA
//      "warm-reload" step this live bundle actually runs — see main.tsx's
//      header comment, it's a different, earlier-firing mechanism than the
//      registerSW.js (dist-v8) and followingToday (dist-v11) PWA fixes
//      already documented, not a duplicate of either.
//
// Role-based home routing (coach -> Dashboard, athlete -> TrainingLog) is
// its own tiny component (`dq` in the bundle) rather than being inlined
// into the route table — kept that way here as `Home` below.
function Home() {
  const { profile } = useAuth();
  if (profile?.role === "coach") return <Dashboard />;
  if (profile?.role === "athlete") return <TrainingLog />;
  return null;
}

// Athlete's read-only view of the annual training plan their coach builds.
function AthletePlan() {
  const { profile } = useAuth();
  if (profile?.role !== "athlete") return <Navigate to="/" replace />;
  return <Periodization athleteId={profile.id} readOnly />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/account"
            element={
              <Layout>
                <Account />
              </Layout>
            }
          />
          <Route
            path="/"
            element={
              <Layout>
                <Home />
              </Layout>
            }
          />
          <Route
            path="/athletes/:athleteId"
            element={
              <Layout>
                <AthleteDetail />
              </Layout>
            }
          />
          <Route
            path="/athletes/:athleteId/blocks/:blockId"
            element={
              <Layout>
                <BlockBuilder />
              </Layout>
            }
          />
          <Route
            path="/athletes/:athleteId/periodization"
            element={
              <Layout>
                <Periodization />
              </Layout>
            }
          />
          <Route
            path="/plan"
            element={
              <Layout>
                <AthletePlan />
              </Layout>
            }
          />
          <Route
            path="/history"
            element={
              <Layout>
                <History />
              </Layout>
            }
          />
          <Route
            path="/day/:dayId"
            element={
              <Layout>
                <DayDetail />
              </Layout>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
