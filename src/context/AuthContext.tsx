import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";
import type { Profile } from "../lib/types";

// RECONSTRUCTED 2026-10-11 from the live production bundle (minified
// identifiers `Uc` the provider, `Wc` the `useAuth` hook, `Rc` the context
// itself, `zc`/`Bc`/`Vc`/`Hc` the localStorage profile-cache helpers). 1:1
// translation — found via the three real `.onAuthStateChange(` call sites
// in the bundle and matching against the one that also loads/creates a
// `profiles` row (the other two are inside the vendor supabase-js library
// itself and inside Login.tsx's own flow).

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

// Caching the profile row in localStorage lets a returning user's layout
// render immediately (role-based nav, name, etc.) instead of flashing a
// loading state on every load while profiles.select() round-trips — the
// fresh fetch still happens every time and overwrites this, it's a
// first-paint optimization only, never the source of truth.
function cacheKey(userId: string) {
  return `atl:cached-profile:${userId}`;
}

function readCachedProfile(userId: string): Profile | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(userId: string, profile: Profile) {
  try {
    localStorage.setItem(cacheKey(userId), JSON.stringify(profile));
  } catch {
    // Storage can be unavailable (private browsing, quota) — the cache is
    // purely an optimization, so a failed write is silently ignored.
  }
}

function clearCachedProfile(userId: string) {
  try {
    localStorage.removeItem(cacheKey(userId));
  } catch {
    // see writeCachedProfile
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Loads (or, on a brand-new auth user, bootstraps) the profile row for
  // userId. First-ever sign-in anywhere in the system becomes a coach
  // (role:"coach", coach_id:null, name defaulted from the email's local
  // part) — gated on whether ANY coach profile already exists, so only the
  // very first user ever gets auto-promoted; every subsequent new sign-in
  // with no profile row is left with profile:null (an athlete is expected
  // to be created by their coach via invite, not by signing up directly).
  const loadProfile = async (userId: string, email: string) => {
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) {
      console.error("Failed to load profile", error);
      setProfile((p) => p ?? null);
      return;
    }
    if (data) {
      setProfile(data);
      writeCachedProfile(userId, data);
      return;
    }
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "coach");
    if (!count) {
      const { data: inserted, error: insertErr } = await supabase
        .from("profiles")
        .insert({ id: userId, role: "coach", coach_id: null, name: email.split("@")[0], email })
        .select("*")
        .single();
      if (!insertErr) {
        setProfile(inserted);
        writeCachedProfile(userId, inserted);
        return;
      }
      // Insert raced with something else creating the row first — re-fetch
      // rather than surfacing the insert error.
      const { data: refetched } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (refetched) {
        setProfile(refetched);
        writeCachedProfile(userId, refetched);
        return;
      }
    }
    setProfile(null);
    clearCachedProfile(userId);
  };

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const cached = readCachedProfile(newSession.user.id);
        if (cached) {
          setProfile(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }
        loadProfile(newSession.user.id, newSession.user.email ?? "").finally(() => setLoading(false));
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        refreshProfile: async () => {
          if (session?.user) await loadProfile(session.user.id, session.user.email ?? "");
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
