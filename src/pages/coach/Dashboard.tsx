import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getFunctionInvokeError } from "../../lib/functionError";
import type { Profile } from "../../lib/types";

// null = no deployed block at all (needs a program entirely, not just a
// refresh soon). Otherwise how many weeks remain in their current block, by
// the actual calendar — not by what's been logged. This used to count
// incomplete weeks instead, but that penalized an athlete who forgot to log
// a session they did do, and didn't move on when the coach told them to
// skip a missed one and stay on schedule rather than drag the block out.
// The current week counts as still remaining (a freshly-deployed 4-week
// block shows "4 weeks left", not 3).
type WeeksLeftInfo = { weeks: number } | null;

// Full 7-day periods elapsed since the exact moment the block was deployed.
// Deliberately NOT snapped to Monday-starting calendar weeks: an earlier
// version compared "which Monday-based week is today in" against "which
// Monday-based week was the block deployed in", which meant a block deployed
// on, say, a Sunday looked like a full week had already elapsed the instant
// the calendar ticked over to Monday — one day later. Counting plain elapsed
// time from the real deploy timestamp avoids that, regardless of which day
// of the week a block happens to be deployed on.
function weeksElapsedSinceDeploy(deployedAt: string): number {
  const elapsedMs = Date.now() - new Date(deployedAt).getTime();
  return Math.max(0, Math.floor(elapsedMs / (7 * 86400000)));
}

export default function CoachDashboard() {
  const [athletes, setAthletes] = useState<Profile[]>([]);
  const [weeksLeftByAthlete, setWeeksLeftByAthlete] = useState<Record<string, WeeksLeftInfo>>({});
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
      await loadWeeksLeft(athleteList);
    } else {
      setWeeksLeftByAthlete({});
    }
    setLoading(false);
  };

  // One pass across every athlete's currently-deployed block (if any),
  // rather than a query per athlete.
  const loadWeeksLeft = async (athleteList: Profile[]) => {
    const { data: blockRows } = await supabase
      .from("blocks")
      .select("id, athlete_id, order_index, deployed_at")
      .in(
        "athlete_id",
        athleteList.map((a) => a.id)
      )
      .eq("status", "deployed")
      .order("order_index");
    const blocks = blockRows ?? [];
    if (blocks.length === 0) {
      setWeeksLeftByAthlete(Object.fromEntries(athleteList.map((a) => [a.id, null])));
      return;
    }

    // An athlete should only ever have one deployed block, but if more than
    // one somehow exists, the most recently ordered one is the one they're
    // actually working from.
    const currentBlockByAthlete = new Map<string, { id: string; order_index: number; deployed_at: string | null }>();
    for (const b of blocks) {
      const existing = currentBlockByAthlete.get(b.athlete_id);
      if (!existing || b.order_index > existing.order_index) currentBlockByAthlete.set(b.athlete_id, b);
    }
    const blockIds = [...currentBlockByAthlete.values()].map((b) => b.id);

    const { data: weekRows } = await supabase.from("weeks").select("id, block_id").in("block_id", blockIds);
    const weeksByBlock = new Map<string, number>();
    for (const w of weekRows ?? []) {
      weeksByBlock.set(w.block_id, (weeksByBlock.get(w.block_id) ?? 0) + 1);
    }

    const result: Record<string, WeeksLeftInfo> = {};
    for (const athlete of athleteList) {
      const block = currentBlockByAthlete.get(athlete.id);
      const totalWeeks = block ? weeksByBlock.get(block.id) ?? 0 : 0;
      if (!block || !block.deployed_at || totalWeeks === 0) {
        result[athlete.id] = null;
        continue;
      }
      const remaining = totalWeeks - weeksElapsedSinceDeploy(block.deployed_at);
      result[athlete.id] = { weeks: Math.max(0, remaining) };
    }
    setWeeksLeftByAthlete(result);
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
            const info = weeksLeftByAthlete[a.id];
            return (
            <div key={a.id} className="athlete-list-item">
              <Link
                to={`/athletes/${a.id}`}
                style={{ color: "inherit", textDecoration: "none", flex: 1, display: "flex", alignItems: "center", gap: "0.6rem" }}
              >
                <span>{a.name}</span> <span className="muted">{a.email}</span>
                {info === undefined ? null : info === null ? (
                  <span className="badge badge-draft" title="No block currently deployed to them">
                    No active block
                  </span>
                ) : (
                  <span
                    className={info.weeks <= 1 ? "badge badge-danger" : "badge badge-completed"}
                    title="Weeks left in their current block, by the calendar — from when it was deployed, not what's been logged"
                  >
                    {info.weeks} week{info.weeks === 1 ? "" : "s"} left
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
