import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getFunctionInvokeError } from "../../lib/functionError";
import type { Profile } from "../../lib/types";
import { calendarPosition, type CalendarPosition } from "../../lib/blockCalendar";

// Where each athlete is up to BY THE CALENDAR (same rule as their own
// Training tab — see lib/blockCalendar.ts), not by what they've logged: an
// athlete who forgot to log a session, or was told to skip a missed one and
// stay on schedule, still shows where the calendar has them. null = nothing
// deployed yet.
type PositionInfo = CalendarPosition | null;

export default function CoachDashboard() {
  const [athletes, setAthletes] = useState<Profile[]>([]);
  const [positionByAthlete, setPositionByAthlete] = useState<Record<string, PositionInfo>>({});
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "athlete")
      .order("name");
    const athleteList = !error && data ? (data as Profile[]) : [];
    setAthletes(athleteList);

    if (athleteList.length > 0) {
      await loadPositions(athleteList);
    } else {
      setPositionByAthlete({});
    }
    setLoading(false);
  };

  // One pass across every athlete's deployed/completed blocks, rather than a
  // query per athlete.
  const loadPositions = async (athleteList: Profile[]) => {
    const { data: blockRows } = await supabase
      .from("blocks")
      .select("id, name, athlete_id, order_index, deployed_at")
      .in(
        "athlete_id",
        athleteList.map((a) => a.id)
      )
      .in("status", ["deployed", "completed"])
      .order("order_index");
    const blocks = blockRows ?? [];
    const { data: weekRows } = blocks.length
      ? await supabase.from("weeks").select("id, block_id").in("block_id", blocks.map((b) => b.id))
      : { data: [] };
    const weekCountByBlock = new Map<string, number>();
    for (const w of weekRows ?? []) weekCountByBlock.set(w.block_id, (weekCountByBlock.get(w.block_id) ?? 0) + 1);

    const result: Record<string, PositionInfo> = {};
    for (const athlete of athleteList) {
      result[athlete.id] = calendarPosition(
        blocks.filter((b) => b.athlete_id === athlete.id),
        weekCountByBlock,
      );
    }
    setPositionByAthlete(result);
  };

  useEffect(() => {
    load();
  }, []);

  const deleteAthlete = async (athlete: Profile) => {
    const ok = window.confirm(
      `Delete ${athlete.name} (${athlete.email})? This permanently removes their login and every block, week, exercise and logged set they have. This can't be undone.\n\nTo re-add them afterward, just invite the same email again.`,
    );
    if (!ok) return;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const { data, error: fnError } = await supabase.functions.invoke("delete-athlete", {
      body: { athleteId: athlete.id },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const message = await getFunctionInvokeError(fnError, data);
    if (message) {
      window.alert(`Couldn't delete this athlete: ${message}`);
      return;
    }
    setAthletes((prev) => prev.filter((a) => a.id !== athlete.id));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Athletes</h1>
        <button className="primary-button" onClick={() => setShowInvite(true)}>
          + Invite athlete
        </button>
      </div>

      <div className="section">
        {loading ? (
          <p className="muted">Loading…</p>
        ) : athletes.length === 0 ? (
          <p className="muted">No athletes yet. Invite your first one to get started.</p>
        ) : (
          athletes.map((a) => {
            const pos = positionByAthlete[a.id];
            return (
            <div key={a.id} className="athlete-list-item">
              <Link
                to={`/athletes/${a.id}`}
                style={{ color: "inherit", textDecoration: "none", flex: 1, display: "flex", alignItems: "center", gap: "0.6rem" }}
              >
                <span>{a.name}</span> <span className="muted">{a.email}</span>
                {pos === undefined ? null : pos === null ? (
                  <span className="badge badge-draft" title="No block deployed to them yet">
                    No active block
                  </span>
                ) : pos.state === "current" ? (
                  <span
                    className={pos.weekNumber >= pos.totalWeeks ? "badge badge-danger" : "badge badge-completed"}
                    title="Where they're up to by their calendar (not by what's been logged)"
                  >
                    {pos.block.name} · Week {pos.weekNumber} of {pos.totalWeeks}
                  </span>
                ) : pos.state === "upcoming" ? (
                  <span className="badge badge-draft" title="Their next block hasn't started on the calendar yet">
                    {pos.block.name} starts {pos.startsOn.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                  </span>
                ) : (
                  <span className="badge badge-danger" title="Their last block has finished on the calendar and nothing new is deployed">
                    {pos.block.name} finished
                  </span>
                )}
              </Link>
              <button
                className="danger-button"
                onClick={(e) => {
                  e.preventDefault();
                  deleteAthlete(a);
                }}
              >
                Delete
              </button>
            </div>
            );
          })
        )}
      </div>

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvited={() => {
            setShowInvite(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function InviteModal({ onClose, onInvited }: { onClose: () => void; onInvited: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    const { data, error: fnError } = await supabase.functions.invoke("invite-athlete", {
      body: { name, email },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    setBusy(false);
    const message = await getFunctionInvokeError(fnError, data);
    if (message) {
      setError(message);
      return;
    }
    onInvited();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h1>Invite athlete</h1>
        <p className="muted">They'll get an email invite to set a password and log in.</p>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="toolbar">
          <button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
