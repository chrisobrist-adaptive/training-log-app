import { supabase } from "./supabaseClient";

// Supabase redirects an athlete/coach back to us with `error` / `error_code` /
// `error_description` params (in the URL hash, same place a good link puts
// its access_token) whenever an invite or password-reset link is invalid or
// has expired — instead of a session. Both AcceptInvite and ResetPassword
// land on exactly this kind of link whenever someone waits too long to click
// (or a mail provider's link-scanner opens it first and burns the one-time
// token before the person ever sees it), so both need to recognize this case
// up front and say so plainly, rather than rendering a normal-looking
// password form that can only ever fail with a cryptic "Auth session
// missing!" the moment it's submitted.
export function getAuthLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);

  for (const params of [hash, query]) {
    const code = params.get("error_code");
    const description = params.get("error_description");
    if (code || description) {
      if (code === "otp_expired") {
        return "This link has expired.";
      }
      return description ? description.replace(/\+/g, " ") : "This link is no longer valid.";
    }
  }
  return null;
}

// A link that's already been used once (e.g. a mail provider's automatic
// link-scanner visiting it before the person clicks it themselves) redirects
// back with no error param at all, just no session either — the page looks
// fine until the actual save fails. Same friendly message either way, since
// there's nothing more specific to tell them.
export function isSessionMissingError(message: string | undefined | null): boolean {
  return !!message && message.toLowerCase().includes("session");
}

// Verifies a recovery/invite link ourselves, from a `token_hash` the email
// template hands straight to this page (see the Supabase dashboard email
// template notes), instead of relying on Supabase's own `/verify` endpoint —
// a plain GET link — to consume the one-time token before we ever see it.
// The difference matters because a mail provider's automated link-scanner
// (Outlook Safe Links, some corporate gateways, etc.) fetches every link in
// an email to check it's safe, and a GET is all it takes to burn a one-time
// token — the person then clicks the same link themselves and finds it
// already "used". Verifying via this function only happens when the page's
// own JavaScript runs, which a scanner fetching the raw HTML doesn't do, so
// the token survives until the person actually opens the link in a real
// browser.
//
// Returns a friendly error message if verification was attempted and failed,
// or null if it succeeded (session established) or there was no token_hash
// to check at all — the caller should fall back to getAuthLinkError() in the
// latter case, to keep handling any already-in-flight old-style email links.
export async function verifyLinkToken(expectedType: "recovery" | "invite"): Promise<string | null> {
  const query = new URLSearchParams(window.location.search);
  const tokenHash = query.get("token_hash");
  if (!tokenHash) return null;

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: expectedType });
  // Strip the token from the URL either way — a refresh or back-navigation
  // must never resubmit it, since a second verifyOtp call with the same
  // token_hash always fails and would show a false "expired" error right
  // after a real success.
  window.history.replaceState(null, "", window.location.pathname);
  return error ? "This link has expired or was already used." : null;
}
