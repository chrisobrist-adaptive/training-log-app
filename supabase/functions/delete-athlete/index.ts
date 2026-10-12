// Supabase Edge Function: delete-athlete
//
// Permanently deletes an athlete: their login, profile, and every block/week/
// day/exercise/logged set and calculated metric under it. This has to be an
// Edge Function (not a client-side delete) because `profiles` intentionally
// has no RLS delete policy, and deleting the underlying auth user — which is
// what actually frees up the email address for a completely fresh invite —
// requires the service role key, which never ships to the browser.
//
// Deleting `auth.users` cascades (via `profiles.id references auth.users(id)
// on delete cascade`, then `blocks.athlete_id references profiles(id) on
// delete cascade`, and so on down) to remove everything that belonged to
// that athlete. There is no undo.

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
    const { athleteId } = await req.json();
    if (!athleteId) {
      return new Response(JSON.stringify({ error: "athleteId is required" }), {
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

    // Client scoped to the calling user — used only to verify who they are.
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

    // Admin client — service role key, only ever used server-side.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: coachProfile, error: coachError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", coachId)
      .single();
    if (coachError || coachProfile?.role !== "coach") {
      return new Response(JSON.stringify({ error: "only a coach can delete athletes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only ever let a coach delete their own athlete — never someone else's,
    // and never another coach.
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("id, role, coach_id")
      .eq("id", athleteId)
      .single();
    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: "athlete not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (targetProfile.role !== "athlete" || targetProfile.coach_id !== coachId) {
      return new Response(JSON.stringify({ error: "you can only delete your own athletes" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(athleteId);
    if (deleteError) {
      return new Response(JSON.stringify({ error: deleteError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
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
