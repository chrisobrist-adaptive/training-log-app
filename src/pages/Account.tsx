// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `$c` (byte
// offset 451275). The simplest page in the app — shows who's signed in
// and a change-password form. Confirmed exact: a mismatch alert comes
// before the length check, and both are checked before calling
// `supabase.auth.updateUser`, not inside a single combined condition.

import { useState, type FormEvent } from "react";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../lib/supabaseClient";

export default function Account() {
  const { profile } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  };

  return (
    <div className="narrow-page">
      <div className="page-header">
        <h1>Account</h1>
      </div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Signed in as {profile?.name} ({profile?.email})
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            New password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>
            Confirm new password
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          {success && <p style={{ color: "var(--good)" }}>Password updated.</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
