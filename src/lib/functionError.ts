// Reconstructed 2026-10-11 from the live production bundle
// (dist-fix4/assets/index-1dbc1082.js), minified identifier `el` (byte
// offset 452543, declared `async function el(e,t)`). Unwraps the most
// specific error message available from a `supabase.functions.invoke()`
// call: an edge function can fail with an SDK-level error (`FunctionsHttpError`,
// whose `.context` is the raw Response) or can return 200 with an
// `{ error: "..." }` body instead of throwing — this checks the
// response body first, then the SDK error's response body, then its
// plain `.message`, in that order.
//
//   async function el(e,t){
//     if(t&&typeof t==`object`&&`error`in t&&t.error)return String(t.error);
//     if(!e)return null;
//     let n=e.context;
//     if(n instanceof Response)try{
//       let e=await n.clone().text();
//       if(e){try{let t=JSON.parse(e);if(t?.error)return String(t.error)}catch{}return e}
//     }catch{}
//     return e.message??`Something went wrong`
//   }
//
// Two existing files had already guessed at this function's name before
// it existed: AthleteDetail.tsx imports `getFunctionInvokeError`,
// Dashboard.tsx imported `describeFunctionError` — both for the exact
// same call shape (`fn(error, data)` from the same `functions.invoke()`
// pattern). There's only one real function in the bundle, so one of
// those guesses was wrong; standardized on `getFunctionInvokeError`
// (matching AthleteDetail.tsx) and fixed Dashboard.tsx's import/calls to
// match, the same way `loadOneRmsForWeeks`/`fetchWeekOneRms` was fixed
// earlier in this project.

export async function getFunctionInvokeError(error: unknown, data: unknown): Promise<string | null> {
  if (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error) {
    return String((data as { error?: unknown }).error);
  }
  if (!error) return null;
  const err = error as { context?: unknown; message?: string };
  const context = err.context;
  if (context instanceof Response) {
    try {
      const text = await context.clone().text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) return String(parsed.error);
        } catch {
          // not JSON — fall through to returning the raw text below
        }
        return text;
      }
    } catch {
      // reading the response body failed — fall through to err.message
    }
  }
  return err.message ?? "Something went wrong";
}
