import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { getAuthLinkError, isSessionMissingError, verifyLinkToken } from "../lib/authLinkError";

// Landed on after clicking the "reset your password" email link. The email
// template links straight here with a `token_hash`, which verifyLinkToken
// exchanges for a session itself (see its comment for why — in short, it
// keeps a mail scanner from burning the link before the person clicks it).
// Falls back to Supabase's own detectSessionInUrl handling for any
// already-in-flight old-style links. Same mechanism (and same expired/
// already-used-link handling) as AcceptInvite, different wording.
export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const tokenError = await verifyLinkToken("recovery");
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
          <h1>This link isn't valid</h1>
          <p className="muted">{linkError} Request a new password reset and try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="centered-page">
      <img src="/logo.png" alt="Adaptive Performance" className="logo" />
      <form className="card" onSubmit={handleSubmit}>
        <h1>Reset your password</h1>
        <p className="muted">Choose a new password for your account.</p>
        <label>
          New password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label>
          Confirm new password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
