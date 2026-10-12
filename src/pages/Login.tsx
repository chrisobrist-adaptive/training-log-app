import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Toggles the form between "sign in" and "send me a reset link" — same card,
  // so forgetting a password doesn't need a separate page.
  const [mode, setMode] = useState<"sign-in" | "forgot">("sign-in");
  const [resetSent, setResetSent] = useState(false);
  const { session } = useAuth();
  const navigate = useNavigate();

  // A successful sign-in updates the session in AuthContext, but nothing else
  // on this page reacts to that — without this, the coach stayed stuck on the
  // login form until they manually reloaded. Also covers landing on /login
  // while already signed in (e.g. the back button).
  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setResetSent(true);
  };

  if (mode === "forgot") {
    return (
      <div className="centered-page">
        <img src="/logo.png" alt="Adaptive Performance" className="logo" />
        <form className="card" onSubmit={handleReset}>
          <h1>Reset password</h1>
          {resetSent ? (
            <p className="muted">
              If an account exists for {email}, a reset link is on its way — check your email.
            </p>
          ) : (
            <>
              <p className="muted">Enter your email and we'll send you a reset link.</p>
              <label>
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              {error && <p className="error">{error}</p>}
              <button type="submit" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </>
          )}
          <button
            type="button"
            className="link-button"
            style={{ marginTop: "0.75rem" }}
            onClick={() => {
              setMode("sign-in");
              setResetSent(false);
              setError(null);
            }}
          >
            ← Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="centered-page">
      <img src="/logo.png" alt="Adaptive Performance" className="logo" />
      <form className="card" onSubmit={handleSubmit}>
        <h1>Training Log</h1>
        <p className="muted">Sign in to your account.</p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <button type="button" className="link-button" style={{ marginTop: "0.75rem" }} onClick={() => setMode("forgot")}>
          Forgot password?
        </button>
      </form>
    </div>
  );
}
