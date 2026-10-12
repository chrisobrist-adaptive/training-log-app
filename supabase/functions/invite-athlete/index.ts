// Supabase Edge Function: invite-athlete
//
// Invites a new athlete by email (Supabase sends the invite email; the athlete
// clicks the link, sets a password, and lands in their Training Log view) and
// creates their `profiles` row linked to the calling coach.
//
// The invite link's redirect target is taken from the browser's Origin header
// on the request that triggered the invite — i.e. whatever URL the coach is
// actually using the app from right now. That way it's always correct even if
// the deployed site's URL changes later, with no secret to keep in sync. A
// SITE_URL secret (`supabase secrets set SITE_URL=https://...`) is still
// supported as a fallback for non-browser callers, but isn't required.
//
// IMPORTANT: for the emailed link to actually work, the exact deployed URL
// must also be added to Supabase Dashboard → Authentication → URL
// Configuration → Redirect URLs (see the deploy notes sent alongside this).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { name, email } = await req.json();
    if (!name || !email) {
      return new Response(JSON.stringify({ error: "name and email are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Prefer the calling browser's own origin (always correct for whatever URL the
    // coach is actually using) and fall back to the SITE_URL secret if it's ever
    // invoked without one.
    const siteUrl = req.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "";

    // Client scoped to the calling user — used only to verify who they are and that
    // they're a coach. Never trust a role claimed by the request body.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const coachId = userData.user.id;

    // Admin client — service role key, only ever used server-side, never shipped to the browser.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: coachProfile, error: coachError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", coachId)
      .single();
    if (coachError || coachProfile?.role !== "coach") {
      return new Response(JSON.stringify({ error: "only a coach can invite athletes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      { redirectTo: siteUrl ? `${siteUrl}/accept-invite` : undefined },
    );
    if (inviteError || !invited?.user) {
      return new Response(JSON.stringify({ error: inviteError?.message ?? "invite failed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Upsert, not insert: re-sending an invite to someone who hasn't confirmed yet
    // (Supabase resends the email and returns the same user) would otherwise hit a
    // duplicate-key error here on the second attempt.
    const { error: profileError } = await adminClient.from("profiles").upsert(
      { id: invited.user.id, role: "athlete", coach_id: coachId, name, email },
      { onConflict: "id" },
    );
    if (profileError) {
      return new Response(JSON.stringify({ error: profileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ athleteId: invited.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
