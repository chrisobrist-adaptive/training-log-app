import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getAuthLinkError, isSessionMissingError, verifyLinkToken } from "../lib/authLinkError";

// Landed on after clicking the email invite link. The email template links
// straight here with a `token_hash`, which verifyLinkToken exchanges for a
// session itself — see its comment: this keeps a mail provider's automated
// link-scanner from burning the one-time token before the athlete clicks it
// themselves, which used to make the link look "already used" on the very
// first real click. Falls back to Supabase's own detectSessionInUrl handling
// for any already-in-flight old-style invite links.
//
// Invite links expire (an hour by default), and clicking a used one — or one
// a scanner already burned — leaves no session to work with, so this checks
// for that up front instead of showing a form that can only ever fail, and
// gives the athlete something actionable rather than a raw Supabase error.
export default function AcceptInvite() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const tokenError = await verifyLinkToken("invite");
      setLinkError(tokenError ?? getAuthLinkError());
    })();
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      if (isSessionMissingError(error.message)) {
        setLinkError("This link has expired or was already used.");
        return;
      }
      setError(error.message);
      return;
    }
    navigate("/", { replace: true });
  };

  if (linkError) {
    return (
      <div className="centered-page">
        <img src="/logo.png" alt="Adaptive Performance" className="logo" />
        <div className="card">
          <h1>This invite link isn't valid</h1>
          <p className="muted">{linkError} Ask your coach to send you a new invite.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="centered-page">
      <img src="/logo.png" alt="Adaptive Performance" className="logo" />
      <form className="card" onSubmit={handleSubmit}>
        <h1>Welcome</h1>
        <p className="muted">Set a password to finish setting up your account.</p>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Confirm password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Set password & continue"}
        </button>
      </form>
    </div>
  );
}
