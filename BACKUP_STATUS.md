# Backup status (as of 2026-10-11 — FULL reconstruction complete, see bottom section)

This folder is a working backup of the Adaptive Performance source, kept here
after the editing workspace was lost and had to be reconstructed from the
live production bundle plus this backup tree. As of today it IS a complete,
build-ready checkout: `npm install && npm run build` succeeds end to end
(tsc + vite build + the PWA service-worker generation step), and
`npx tsc --noEmit` reports zero errors across the whole `src/` tree. See the
dated section at the bottom for what that last push covered. Older sections
above it are kept for history — read them if you want the story of how any
one file got here, not to find out what's "still missing" (nothing is).

## Confirmed exact / current (safe to trust and build on)

- `src/pages/coach/Dashboard.tsx` — includes the "weeks left includes the
  current week" fix, matching what's live.
- `src/lib/authLinkError.ts`
- `src/pages/ResetPassword.tsx`
- `src/pages/AcceptInvite.tsx`
- `src/pages/Login.tsx`
- `src/components/WeekdayStrip.tsx`
- `src/lib/supabaseClient.ts`, `.env` (real project URL/anon key)
- `src/lib/queries.ts`
- `src/pages/coach/Periodization.tsx`
- `vite.config.ts`
- `public/_redirects`
- `src/index.css` (byte-exact, pulled from the live deployed CSS)
- `supabase/functions/invite-athlete/index.ts` — fetched fresh from Supabase
- `supabase/functions/delete-athlete/index.ts` — fetched fresh from Supabase
- `supabase/migrations/0010_block_deployed_at.sql`
- Live DB schema is always authoritative — re-pull via Supabase MCP tools
  (project id `qgrrcjkemlchcvybkpwz`) rather than trusting any local copy of
  `types.ts` or migration files below 0010.

## Reconstructed 2026-10-05 — new rolling-calendar feature (dist-v4.zip, not yet confirmed deployed)

- `src/components/CalendarStrip.tsx` — NEW. Replaces WeekdayStrip just on
  the athlete training log screen. Full scrollable, multi-week, date-driven
  calendar strip (not just the current week), matching the mockup Chris
  approved. No special "missed" styling — past days look like any other
  day and stay tappable.
- `src/pages/athlete/TrainingLog.tsx` — FULL rewrite. This is a readable
  reconstruction of the logic that was actually hand-patched directly into
  the live minified bundle (the same safe-patch process used for every fix
  this project has shipped) — it was translated carefully and the core new
  logic (date math, slot resolution) was verified two ways before shipping:
  (1) a standalone Node simulation against several synthetic scenarios plus
  a real athlete's actual block data pulled from the live DB, and (2) the
  calendar component was extracted verbatim from the patched bundle and
  server-rendered with React to confirm it runs without errors. This TSX
  file itself has NOT been run through an actual `npm run build` — the
  import paths for `BlockSwitcher`, `WeekSwitcher`, and `SessionPlayer`
  are my best guess at their real filenames/casing, not confirmed, since
  none of those three files have been recovered. Treat this file as the
  clearest record of the current intended behavior, not as something
  known to compile as-is.
- The key behavior change: which training day opens by default is now
  resolved from the ACTUAL CALENDAR DATE (today), not from completion
  status ("first day you haven't ticked off"). Week 1 is anchored to the
  block's exact deploy date, rotated so the deploy date's own weekday is
  day 0 of week 1 — NOT snapped to the Monday on/before deployment. That
  distinction was caught and fixed before shipping: the Monday-snap
  version would have shown a real athlete (deployed on a Sunday) the
  wrong week on their very first day using the app.
- Still NOT recovered: `BlockSwitcher.tsx` (the `aK` component — never
  inspected beyond its prop signature), `WeekSwitcher.tsx` (the `PK`
  component — prop signature only).

## Reconstructed 2026-10-05 — exercise-history feature + SessionPlayer.tsx (dist-v5.zip, not yet confirmed deployed)

- `src/components/SessionPlayer.tsx` — NEWLY RECOVERED. This is the `sq`
  component (exercise cards, rest timer, set tables, session
  preview/station-view toggle) — previously only its prop signature was
  known. The full minified source was extracted and translated 1:1. It
  depends on a few sibling files that are my BEST-GUESS reconstructions,
  not independently verified/recovered yet:
  - `src/lib/liftColors.ts` (the `zK` lift-color map)
  - `src/lib/sessionPlayerHelpers.ts` (`tq`/`nq`/`rq`/`iq`/`aq`/`BK` — the
    prescribed/backdown summary text builders, the "all sets logged"
    check, set-summary text, logged-RPE summary, and the mm:ss timer
    formatter)
  - `src/components/SetRow.tsx` (the `cq` component — the individual
    weight/reps/RPE input row inside each set table)
  These three do NOT exist in this backup tree yet and were NOT created
  this session — `SessionPlayer.tsx` imports from them but will not
  actually compile until they're reconstructed from the bundle too.
  Treat `SessionPlayer.tsx` as a correct record of control flow and
  markup, not as build-ready.
- `src/components/ExerciseHistoryModal.tsx` — NEW. Athletes asked for a
  way to see an accessory exercise's logged history (e.g. "12 reps @
  50kg" one week, "13 reps @ 52.5kg" the next) when they can't remember
  what they last did. Tapping an exercise's name in SessionPlayer (either
  the pre-session preview list or the active station-view card) opens
  this modal. It queries every session where sets were logged against
  that exercise's `exercise_inventory_id`, across ALL of the athlete's
  deployed+completed blocks (true all-time history, not just the current
  block) — confirmed safe via `pg_policies` (RLS already transitively
  scopes exercises/training_days/logged_sets/weeks to the signed-in
  athlete, so no explicit athlete_id filter is needed) and verified
  against a real athlete's data (9 real logged sessions of the same
  accessory exercise spanning two separate blocks) before shipping.
  Reuses `.modal-backdrop`/`.card`/`.log-preview-row` — the same classes
  InviteModal already uses — no new CSS was needed.
- Both of these were verified before shipping the same way the rolling
  calendar was: syntax-checked, and literally server-rendered (React +
  `ReactDOMServer.renderToStaticMarkup`) from the exact patched bundle
  source — both the preview-list and station-view code paths — against
  synthetic data, confirming no runtime errors.

## Reconstructed 2026-10-05 (later same day) — calendar polish + week-nav (dist-v6.zip, not yet confirmed deployed)

Chris tried the exercise-history feature right after deploying dist-v5 and
said it "didn't work." Investigated thoroughly before touching anything:
confirmed via a cache-busted fetch that the live server WAS genuinely
serving the exact v5 bundle (byte-identical to what shipped, verified by
checking for `APHistoryModal`/`hv`/`shv` in the fetched source); confirmed
the Supabase query returns correct data even under real RLS (simulated the
exact nested-select as the authenticated athlete via `set local
"request.jwt.claims"`, not just via the privileged SQL connection used for
the pre-ship check); confirmed every exercise in every athlete's deployed
block has a non-null `exercise_inventory_id` (so the click handler is
always wired up). Nothing server-side was wrong. The most likely
explanation is the same PWA/service-worker caching this project has hit
before — Chris's own device may still have been running an older cached
bundle at the moment he tested, despite believing the deploy + refresh had
gone through. Flagged this to him directly rather than guessing further.

While investigating, also made the three calendar/week-nav changes Chris
asked for in the same message:

- **Monday's circle looking "ever so slightly black."** NOT a box-sizing
  issue (the app already sets `*{box-sizing:border-box}` globally, so the
  `.today` state's 2px border vs. everyone else's 1px was never changing
  the rendered circle size — that was a dead end, briefly tried and
  reverted). The real cause: `.log-cal-strip-wrap:before`/`:after` are
  16px-wide decorative fade gradients (opaque background → transparent)
  pinned to the strip's left/right edges, meant to hint "more days this
  way." With `.log-cal-strip` having zero horizontal padding, Monday's
  (and Sunday's) circle sat directly under that fade, so the dark gradient
  visibly washed over part of it. Fix: `src/index.css`'s `.log-cal-strip`
  padding changed from `0 0 .5rem` to `0 1.1rem .5rem` — enough to clear
  the full 16px fade zone on both edges with a hair of margin.
- **Next-week arrow not landing on a full Monday-Sunday week.** The ‹ ›
  arrows in `CalendarStrip.tsx` used to just `scrollBy({left: ±180})` — an
  arbitrary pixel amount that doesn't correspond to a week's width (one
  day slot + gap ≈ 3.1rem ≈ 50px, so a full week ≈ 347px, not 180). Now
  `goToWeek(delta)` finds the current week from `selectedDate`'s index in
  `slots` (`Math.floor(idx/7)`, since slots are always exactly 7 per week
  starting at Monday), computes the target week's Monday slot (clamped to
  the block's start/end), scrolls that button into view with
  `inline:"start"`, and — since the Week dropdown is gone (next point) —
  also calls `onSelect` on it so the session view actually advances, not
  just the scroll position.
- **Removed the Week dropdown.** Chris: "you can just navigate through
  the weeks with the calendar feature now." Removed the `<WeekSwitcher
  .../>` element and its import from `TrainingLog.tsx` — only
  `BlockSwitcher` remains in `.log-top-nav`. `WeekSwitcher.tsx` itself
  (the `PK` component) is left alone/still not recovered, just unused now;
  not deleted in case some other screen still renders it.

Verified the same way as prior changes: exact-occurrence-checked patches
against the live bundle, `node --check` syntax validation, and a render
test of the patched `APCalStrip` confirming `goToWeek`'s index math lands
on Monday going both directions and clamps correctly at the first/last
week of a block.

## Reconstructed 2026-10-06 — goToWeek was fighting itself + underline removed (dist-v7.zip, not yet confirmed deployed)

Chris deployed dist-v6 and reported the arrow still wasn't landing on a
full week — it looked like it landed "midweek," and Sunday was only
partially visible, shifted right. Re-read `APCalStrip`'s actual source
(confirmed first, via a cache-busted fetch, that the live site really was
serving the exact v6 bundle — no drift) and found the real bug: there's a
SEPARATE `useEffect` in `CalendarStrip.tsx`/`APCalStrip` that re-centers
(`scrollIntoView({inline:"center"})`) on every `selectedDate` change —
originally written for the "today" auto-resolve on load and for ordinary
day taps. `goToWeek` scrolls Monday to the start edge, then calls
`onSelect`, which changes `selectedDate` in the parent — which re-renders
`CalendarStrip`, which re-triggers that OTHER effect, which immediately
re-centers and undoes `goToWeek`'s own scroll. The two effects were
fighting on every single click, every time.

Fixed with a `skipAutoScroll` ref: `goToWeek` sets it to `true`
immediately before calling `onSelect`; the auto-center effect checks it
first, clears it, and skips its own scroll when set — so it still centers
normally for a direct tap on a day (flag not set), but gets out of the
way for a week-jump. Also hardened `goToWeek` itself: the day buttons are
`scroll-snap-align:center` snap points (for that same tap-to-center
behavior), and native CSS proximity-snapping could independently pull a
smooth `scrollIntoView({inline:"start"})`'s rest position back toward
centering some nearby day once the animation settles — so `goToWeek` now
temporarily sets `scroll-snap-type:none` on the strip for the duration of
its own scroll, restoring it ~500ms later (long enough for the smooth
scroll to finish), without touching snap behavior for ordinary swiping or
tapping.

Verified end-to-end this time, not just the index math: hand-built a fake
DOM element (stubbed `scrollIntoView`/`style`) and replayed the exact
`goToWeek` → `onSelect` → auto-center-effect sequence, confirming (1) the
jump lands on index `(curWeek+1)*7`, i.e. Monday, (2) `scrollIntoView` is
actually called with `inline:"start"` on that exact element, (3) the skip
flag is `true` by the time the auto-center effect would otherwise fire,
(4) that effect genuinely no-ops when the flag is set, and (5) an
ordinary tap (flag not set) still centers exactly as before. This is a
stronger check than last time's pure-math-only test, because the bug
itself was never in the math — it was in two effects both touching the
scroll position.

Also: removed the dotted-underline styling on clickable exercise names
(both `SessionPlayer.tsx`'s preview-list `<strong>` and its station-view
`.log-exercise-name`) per Chris — `cursor: "pointer"` stays (keeps SOME
visual hint it's tappable) but the text-decoration is gone; the `onClick`
→ history-modal wiring is untouched.

## Reconstructed from an old snapshot — likely still correct but NOT verified against the live app

- `index.html`, `src/main.tsx`, `package.json`, `tsconfig*.json` — rebuilt
  from an early project zip Chris still had in Downloads, cross-checked
  where possible against the live build's `dist/index.html`. Probably fine
  (this kind of boilerplate rarely changes) but not individually confirmed.

## NOT recovered — missing entirely, do not assume these exist or are correct

These pages/components are referenced by the live app (confirmed via its
compiled JS bundle and CSS classes) but their source was never read in a
recoverable way:

- `src/App.tsx` (routing — current version has more routes than the old
  snapshot: at least `/reset-password` and a periodization route)
- `src/context/AuthContext.tsx`
- `src/components/Layout.tsx` (current version has a top bar, account menu,
  and a mobile bottom tab bar — old snapshot is a much simpler version)
- `src/pages/coach/AthleteDetail.tsx`
- `src/pages/coach/BlockBuilder.tsx` (only two small windows + the `deploy()`
  function are confirmed; most of the file — exercise rows, inventory
  picker, week duplication — is unconfirmed)
- `src/pages/athlete/History.tsx`
- Account/settings page, `WeekSummaryTable`, `TrendChart`, `WeekSwitcher`,
  `notify.ts`, `functionError.ts`, `prescription.ts`, exercise inventory
  picker component(s)
- `src/lib/types.ts` (only the `Block` interface's `deployed_at` field is
  confirmed; the rest needs rebuilding from the live DB schema)

**Before editing any of the files in the "NOT recovered" list**, rebuild them
carefully first (cross-checking logic against the live production JS bundle
the same way the Dashboard.tsx fix on 2026-10-03 was verified), rather than
assuming a freshly-written guess matches current behavior. Don't deploy a
change to one of these files without that step — this is a live app with
real athlete data.

## 2026-10-06 — root cause of "deploys don't seem to take" found: registerSW.js (dist-v8.zip)

Chris deployed v7 (the goToWeek fix) and reported the calendar "still
appears to be the same as before." Re-fetched the live `APCalStrip` source
directly (cache-busted) and confirmed it was byte-for-byte the intended v7
fix — no packaging/deploy error. Asked Chris how he actually tests the app;
he uses the **home-screen icon** (an installed, standalone PWA), not a
regular browser tab. That's the missing piece: a standalone PWA runs its
own service worker instance, and nothing about "refresh the page" or "use
a private window" (the advice given for the exercise-history bug a few
messages earlier, which likely never actually applied to his real workflow)
touches it at all.

The deeper issue: `vite.config.ts` already sets `registerType: "autoUpdate"`
(skipWaiting + clientsClaim — confirmed present in the generated sw.js), so
a new service worker always activates and claims clients immediately once
the browser fetches it. But `injectRegister: "auto"` generates only a bare
`navigator.serviceWorker.register(...)` with no logic to actually TRIGGER
that fetch-check proactively, and no reload when a new SW takes control. A
plain browser tab gets a free update-check on every navigation; a
standalone PWA that's simply switched back to from the background may
never navigate again, so the browser may just never re-check — meaning the
already-open page keeps running whatever JS was in memory at launch,
indefinitely, regardless of how many times a new version is deployed.

Fixed by hand-patching `registerSW.js` (build output, no tracked source —
vite-plugin-pwa generates this file from the `VitePWA(...)` config, it was
edited directly the same way every other dist file in this project is) to:

1. Call `reg.update()` right after registering, and again every time the
   page becomes visible (`visibilitychange` → `visibilityState === "visible"`)
   — so simply switching back to the app now actively checks for a new
   version instead of waiting for the OS to decide to.
2. Listen for `controllerchange` and reload once, automatically, once a new
   service worker actually takes control — so the new version is actually
   shown, rather than silently sitting there "activated" while the
   already-open page keeps running the old in-memory code until a manual
   force-quit.

Also updated `sw.js`'s precache revision for `registerSW.js` to match (its
content changed; it's referenced by a fixed path, not a content hash, so it
didn't need renaming — same as `sw.js` itself never needing one). Updated
`vite.config.ts`'s PWA comment to document this gap and the fix, so a real
future rebuild from source doesn't quietly regress it (`injectRegister:
"auto"`'s default script would reintroduce exactly this problem).

**Important for Chris**: this one update still needs a genuine force-quit
(not just backgrounding) and reopen of the home-screen app ONE more time,
since the OLD registerSW.js has no proactive check of its own to discover
v8. After that, the app should start finding and applying future updates on
its own just from being reopened normally — this dance shouldn't be needed
again.

## 2026-10-06 (same day, later) — calendar redesigned as a fixed week (dist-v9.zip)

Even after the service-worker fix, Chris reported the calendar "still
appears to be the same." Rather than chase a fourth scroll-related
micro-fix, Chris suggested the right structural change himself: he pointed
out that MyStrengthBook doesn't let you scroll through days at all — the 7
days shown are fixed, and the ‹ › arrows swap in the next/previous set of
7. Implemented exactly that, which eliminates the whole bug category this
session had been fighting (the edge-fade overlay, the dueling re-center
effect, CSS scroll-snap) rather than patching around it again:

- `CalendarStrip.tsx` / `APCalStrip` no longer holds a `slots` array it
  scrolls through. It slices out exactly the 7 slots for `selectedDate`'s
  week (`Math.floor(idx/7)*7 .. +7`, since slots are always 7-per-week,
  Monday first) and renders ONLY those as a fixed grid
  (`display:grid;grid-template-columns:repeat(7,1fr)`) — no
  `overflow-x`, no `scroll-snap-*`, no ref, no `useEffect`, no
  `scrollIntoView` anywhere in the component any more.
- `goToWeek(delta)` is now pure state: clamp `curWeek+delta` to
  `[0, maxWeek]`, look up that week's Monday slot, call `onSelect` on it.
  No DOM interaction at all — the parent's `selectedDate` change is what
  makes the component re-slice and show the new week.
- The ‹ › arrows are `disabled` at the first/last week (free styling from
  the existing global `button:disabled{opacity:.5;cursor:not-allowed}`
  rule) rather than silently clamping with no visual feedback.
- `src/index.css`: removed `.log-cal-strip-wrap`'s `:before`/`:after`
  edge-fade gradients entirely (nothing to fade without horizontal
  scroll), changed `.log-cal-strip` from a scrolling flex row to the
  fixed 7-column grid, and `.log-cal-day` now fills its grid column
  (`width:100%`) instead of a fixed flex-row width — the `.num` circle
  itself (`.log-cal-day .num`) is untouched, still a fixed 2.3rem circle
  centered within whatever width its day button gets.

Verified with a render test asserting: exactly 7 day buttons for the
current week; `goToWeek(1)` from week 1 targets week 2's Monday; the
rendered week after that jump shows day numbers 21 through 27 with Monday
first and Sunday last and fully present (not cut off); and the ‹ arrow is
`disabled` on the first week while the › arrow is `disabled` on the last.

## 2026-10-06 (same day, later still) — reps auto-fill fixed + exercise history bug found and fixed (dist-v10.zip)

Chris asked two things in one message: (1) make reps auto-populate in the
accessory section so the athlete only has to log weight and RPE, and (2) a
bug report — he logged 3 real sets for "Close grip lat pulldown" in week 1
of his test account, and in week 2 the exercise history modal showed
nothing for it.

**Reps auto-fill (`SetRow.tsx` / minified `cq`, first time extracted this
session) was ALREADY WIRED UP** — `SetRow` has always computed a default
reps value from `exercise.prescribed_reps` (or `backdown_reps` /
`ascendingEntry.reps`) before falling back to an existing logged set. The
bug was one level down, in the parsing helper (minified `fl`, now
`exerciseDefaults.ts`'s `firstNumber`): it required the ENTIRE trimmed
string to be a bare integer (`/^\d+$/`). Pulled real data from Chris's own
exercise_inventory: main lifts (squat/bench/deadlift) really do use bare
integers ("5", "8"), but virtually every accessory exercise's
prescribed_reps is a RANGE ("8-10", "12-15") or free text ("AMRAP", "Hold
till RPE", "To RPE") — so the strict check returned null for nearly all of
them, leaving the reps input blank exactly as Chris described. Fixed by
pulling the first integer out of the string instead: "8-10" → 8, "AMRAP" →
still null (nothing sensible to fill), "5" → 5 (main lifts unaffected).
Weight and RPE are untouched — still blank by default (weight only
pre-fills from a fixed load or %1RM calc, which accessory exercises
generally don't have) — matching exactly what Chris asked for: athlete
only has to log weight and RPE, reps already there.

This also means `SetRow.tsx` and `src/lib/exerciseDefaults.ts` exist in
this backup tree for the first time — `SetRow` was imported by
`SessionPlayer.tsx` since the 2026-10-05 reconstruction but had never
actually been extracted/written. Both are now 1:1 translations of the
live minified source (`cq`, `ll`, `ul`, `dl`, `pl`, `ml`), with the fix
applied. `SetRow.tsx` still imports `Exercise`/`LoggedSet` from
`../lib/types`, which doesn't exist in this tree yet — that gap predates
this change (see `SessionPlayer.tsx`'s own header comment) and isn't
something this fix addresses.

**Exercise history bug (`ExerciseHistoryModal.tsx` / minified
`APHistoryModal`) — confirmed real, root cause found via direct DB
inspection**, not a caching/deployment issue like the earlier calendar
fixes: a session's `date` field (and therefore whether it showed up in
history at all — the final filter requires `sets.length>0 && s.date`) came
solely from `training_days.completed_at`, which is ONLY set once the
athlete taps "End session". Queried Chris's real test data directly:
exercise_id for "Close grip lat pulldown" in week 1 had exactly 3 logged
sets (weight 20, reps 10, rpe 8 ×3) — real, fully-logged data — but its
`training_days.completed_at` was null, because that session was never
formally ended. So the entire session was silently dropped from history,
exactly matching what Chris saw.

Fixed by decoupling "has real data" from "was formally ended": the query
now also pulls each `logged_sets.created_at`, and the session's display
date falls back to the most recent one whenever `completed_at` is absent.
Inclusion is now based purely on whether qualifying sets exist, not on
session-end status. A properly-ended session still prefers its
`completed_at` over the sets' timestamps (verified both orderings sort
correctly together). Also added a render/logic test (not against the live
bundle's DOM output this time, but against the extracted mapping logic
directly, since this fix is pure data transformation) covering: the real
bug scenario, a normally-ended session, a row with no real sets logged
(correctly still excluded), and mixed sorting.

Both fixes verified against the live bundle's actual `fl`/`cq`/
`APHistoryModal` source (re-extracted fresh from the deployed JS, not from
memory of earlier sessions) before patching, per the usual safe
live-bundle-patch process, then re-verified post-patch with a React
render test (SetRow: 5 cases including a real accessory exercise with
"8-10", AMRAP, a main lift, an existing logged set override, and a
backdown range) and a plain logic test (history: 4 cases). Shipped as
`dist-v10.zip`.

## 2026-10-08 — stale "today" after the app sits backgrounded for days (dist-v11.zip)

New bug report, this time from Kennan (another athlete, via Chris relaying
a WhatsApp screenshot): "today's program" showing as Oct 1st when the real
date was Oct 8th — a week stale — and navigating forward from there "jumps
to next week" unexpectedly.

First ruled out a calendar-math bug: pulled Kennan's real block
(`deployed_at` = Sep 9, a Wednesday) and ran the exact live
`calendarSlots`-equivalent formula against it in Node. It correctly
resolves Oct 8 to week 5's Thursday slot — the anchor math itself is
sound (confirmed against this app's "week 1 starts on the deploy weekday,
not the Monday on/before it" design, documented above). Also surfaced a
secondary, separate quirk while verifying: because Kennan's block wasn't
deployed on a Monday, each week's Monday/Tuesday slots actually carry
LATER calendar dates than its Wed-Sun slots (e.g. week 4's Monday is
Oct 5 while week 4's Wednesday is Sep 30) — the array push order
(Mon..Sun) isn't chronological for a non-Monday deploy. Not the cause of
this bug (CalendarStrip's exact-date `.find()` doesn't care about array
order) and not touched by this fix, but worth knowing if calendar display
order is ever revisited.

**Root cause**: `TrainingLog.tsx`'s "what's today's session" effect
(`calendarSlots`-dependent) computes `new Date()` exactly once — on
mount, or whenever the active block changes — and never again. A
standalone/home-screen PWA can sit resident in memory for days without a
true reload (same underlying platform behavior as the 2026-10-06
service-worker fix above, but hitting different code this time): if
Kennan opened the app once around Oct 1st and has just been resuming it
from the background since, the component never remounted, so that
one-time `today` computation is still sitting there, over a week stale.
Oct 1st happens to be the SAME weekday (Thursday) as Oct 8th, one
week_number earlier — exactly matching "off by 1 week" and "jumps to next
week" (clicking the arrow from that stale week correctly moves forward,
which looks like "jumping ahead" from an already-wrong starting point).

**Fix**: added a `followingToday` ref, true by default. The existing
once-per-load effect now also sets it true (re-affirming "we're following
today" on every fresh load/block switch). A new `visibilitychange`
listener re-runs the exact same "find today's slot" resolution whenever
the page is foregrounded again — but only while `followingToday.current`
is true, and only if the currently selected date isn't already correct.
The calendar's `onSelect` handler (which both a day tap AND the ‹ ›
arrows route through) sets it false, so a deliberate manual navigation —
reviewing a past week, say — is never silently overridden by this check
on the next resume.

Verified with a standalone logic simulation (not a full React render —
this page pulls in routing, auth context and Supabase, not worth stubbing
for this) covering 4 scenarios: Kennan's exact bug (mount on Oct 1,
resume on Oct 8 without remounting → corrects to Oct 8); a deliberate
manual week-2 navigation surviving a background/resume untouched; a
same-day background/resume causing no spurious change; and switching
blocks correctly re-arming follow-mode. All passed. Patched directly into
the live bundle (`TrainingLog`'s minified identifier `$K`) per the usual
safe live-bundle-patch process — confirmed exactly 3 unique anchor points
before replacing — then mirrored 1:1 into this backup tree's
`TrainingLog.tsx`. Shipped as `dist-v11.zip`.

## 2026-10-08 (same day, later) — non-Monday-deploy date scrambling fixed (dist-v12.zip)

Chris followed up with a screenshot from Kennan's app: "this week"'s
Thursday showed "1 Oct" and Friday "2 Oct" — both a week behind — while
"next week" (really an adjacent week in the same block) showed the same
pattern. Confirmed via `AskUserQuestion` this was still Kennan's account.

This is NOT the dist-v11 stale-state bug recurring — ruled that out
immediately (today's own week, shown separately in the same screenshot,
was correctly Thu 8/Fri 9). It's a bug I'd actually already *found*
while investigating dist-v11, flagged in that section above as "a
secondary, separate quirk... not the cause of this bug and not touched by
this fix" — and now it had surfaced on its own as a real, independently
reported issue.

**Root cause**: `calendarSlots`'s week-1 anchor is deliberately the
DEPLOY WEEKDAY, not the Monday on/before it (see the 2026-10-05 comment
above — snapping to Monday would let week 1 include dates from before the
block existed). But each week's 7 slots were pushed in fixed Mon..Sun
(wd 0..6) order — and for any deploy day other than Monday, the weekdays
that come BEFORE the deploy day in Mon-Sun order actually belong to the
FOLLOWING calendar week. For Kennan (deployed Wednesday), "week 4"
computed as Mon Oct5, Tue Oct6, Wed Sep30, Thu Oct1, Fri Oct2, Sat Oct3,
Sun Oct4 — Wed through Sun are a full week EARLIER than the Monday/Tuesday
shown right before them in that same row. Reproduced this exactly against
his real `deployed_at` before touching any code.

**Fix**: sort each week's 7 slots by actual date before pushing, instead
of always pushing in wd=0..6 order. For a Monday deploy this is a no-op
(off already increases 0..6 in step with wd, so it's already sorted) — so
every block deployed on a Monday is completely unaffected. For any other
deploy day, the row now renders left-to-right in true chronological
order. No changes needed in `CalendarStrip.tsx` — it already renders each
slot's own `wd`/date rather than assuming column N is a fixed weekday, so
sorting the underlying data was the entire fix. Bonus: `CS[0]`/`CS[last]`
(the before-block/after-block fallback bounds the "today" effect and
`goToWeek` use) are now actually the true earliest/latest dates in the
block too — before this fix they weren't (`CS[0]` was Monday of week 1,
not the true earliest date, whenever the deploy day wasn't Monday).

Verified three ways before shipping: (1) a standalone simulation showing
the old output for Kennan's real week 4 reproduces his screenshot exactly
(Thu→Oct1, Fri→Oct2) and the new output is chronological; (2) confirmed
the "find today's exact-date slot" effect and the CS[0]/CS[last] fallback
bounds still work correctly post-fix; (3) extracted and ran the ACTUAL
patched function body straight out of the shipped bundle (not a
reimplementation) against Kennan's real `deployed_at`, confirming the
live code itself produces the chronological order and still resolves
today correctly. Patched directly into the live bundle per the usual
process, then mirrored 1:1 into this backup tree's `TrainingLog.tsx`
(`CalendarStrip.tsx` only got an explanatory comment — no logic changes
needed there). Shipped as `dist-v12.zip`.

## 2026-10-08 (same day, later still) — week 1 always starts the following Monday (dist-v13.zip)

Chris then got a screenshot from a THIRD athlete, Dalton: his calendar
permanently showed "THU FRI SAT SUN MON TUE WED" as the column order,
with his own complaint being "Monday being after thurs etc" / "if I go
back to my current week shits all over the place too."

**This was not a new bug** — Dalton's block (deployed Thu Sep 24 2026)
was already running the dist-v12 chronological-sort fix, and the dates
were correct. v12 just surfaced a real design gap: the deploy-weekday
anchor (kept as-is by v12, only the ordering was fixed) means week 1 —
and therefore every week, forever, for that block — starts on whatever
weekday the block happened to be deployed on, not Monday. Mathematically
fine, but it looks "scrambled" to an athlete who expects a normal
Monday-first calendar grid.

Asked Chris directly rather than patching a third time blind. His answer:
he never deploys a block the week an athlete needs to start it — always
ahead of time — and regardless of which weekday he actually hits
"deploy" on, he expects the next block's week 1 to start the FOLLOWING
Monday.

**Fix**: anchor week 1 to the Monday ON OR AFTER the deploy date, instead
of the deploy date's own weekday. A no-op for an actual Monday deploy;
any other day rolls forward (never backward) to the next Monday, so
there's still no padding with dates from before the block existed — the
original concern that justified the old deploy-weekday anchor in the
first place. Every week is now a clean, always-chronological Mon-Sun
span by construction, so the v12 per-week sort is no longer needed and
was removed entirely — this fix is actually simpler than v12's.

Verified against both real blocks that triggered these reports: Kennan's
(deployed Wed Sep 9) now starts week 1 on Mon Sep 14, every week reads
MON..SUN; Dalton's (deployed Thu Sep 24) now starts week 1 on Mon Sep 28,
same clean MON..SUN order. Also checked a Monday deploy (no-op, confirmed
unchanged), a Sunday deploy (correctly rolls to the *next* Monday, not
back to the same-week Monday that would predate the block), and the
"today" resolution for the few days between a non-Monday deploy and the
following Monday (not part of Chris's actual workflow, but handled
gracefully anyway: the existing before-block-start fallback in the "find
today" effect already clamps to `calendarSlots[0]` — i.e. the upcoming
Monday — with no changes needed there). All of this was run by extracting
and executing the ACTUAL patched function straight out of the shipped
bundle (not a reimplementation), per the project's usual verification
standard. Patched directly into the live bundle, then mirrored 1:1 into
this backup tree's `TrainingLog.tsx`. Shipped as `dist-v13.zip`.

## 2026-10-11 — real-source reconstruction started (not a bug fix)

Chris asked what it would take to move this project onto Claude Code
(a real local checkout + git, instead of hand-patching the live bundle
every time), and whether this backup tree could be the basis for that
rather than needing some "lost" original to turn up. Answer: yes — this
IS that path, it just isn't finished. Started actually finishing it
rather than only patching whatever a bug report happened to touch.

Re-confirmed ground truth first (same discipline as every fix above):
fetched `/index.html` and the JS bundle fresh, cache-busted, from the
live site — byte-identical to this tree's local copy of `dist-v13`
(927,794 bytes both ways), so everything below was extracted from the
real, currently-deployed source with no drift.

**New, previously-missing files written this session** (all 1:1
translations of real extracted bundle logic, not guesses — see each
file's own header comment for exactly which minified identifiers and
call sites they came from):

- `src/lib/database.types.ts` — the raw Supabase schema, regenerated
  directly from the live project (not hand-written).
- `src/lib/types.ts` — did not exist AT ALL before today, despite six
  different files importing from it (`Block`, `Week`, `TrainingDay`,
  `Exercise`, `LoggedSet`, `Profile`, `PeriodizationBlock`,
  `PeriodizationMacrocycle`) — this was the single biggest reason
  nothing in this tree could actually compile. Built from the real
  schema plus the real `exercise_inventory` join shape every
  exercise-display component actually relies on.
- `src/context/AuthContext.tsx` — recovered in full: session/profile
  state, the first-ever-user-becomes-a-coach bootstrap logic, and a
  localStorage profile cache for instant first paint on return visits.
- `src/App.tsx` — the full route table, recovered in one piece.
- `src/main.tsx` — replaced the old, never-verified Vite-template
  boilerplate with what's actually live.

**Two genuinely new findings while tracing the route table** — neither
was in this file's "not recovered" list before today because neither
was known to exist at all:

1. **`/day/:dayId` route**, pointing at a component not yet
   reconstructed (`DayDetail.tsx` is a placeholder for now). No in-app
   link to it has turned up yet in anything reconstructed so far — worth
   asking Chris what this is for (a shareable single-day link?) before
   assuming it's unused.
2. **A standalone-PWA "warm reload"** in the real entry point: on a
   device's very first home-screen launch, the app reloads itself once,
   immediately, before rendering anything, then never again (a
   localStorage flag). This is a THIRD, earlier-firing PWA mechanism,
   separate from both the registerSW.js proactive-update fix (dist-v8)
   and TrainingLog's followingToday re-check (dist-v11) already
   documented above — nothing in this project's history mentions why it
   was added. Worth asking Chris about directly.

**Update, same day**: `Layout.tsx` and `AthleteDetail.tsx` are now both
fully reconstructed too (`Layout.tsx` turned out to be two components —
`uq`, a route guard for loading/no-session/no-profile states, wrapping
`Kc`, the actual nav chrome — both recovered and kept as that same split
here). `AthleteDetail.tsx` (`uK`) — coach's per-athlete page: block
list, weekly metrics, trend chart, read-only session log — is a full 1:1
translation, though it still imports several small pieces that are
precisely located in the bundle but not yet split into their own files:
`BlockSwitcher.tsx` (`aK`), `LiftCategoryBadge` + its category-color map
(`rK`/`nK`/`tK`), `WeekSummaryTable` (`yl`), `TrendChart` (`eK`), and two
helpers for `sessionPlayerHelpers.ts` (`plannedSetSummary`/`cK`,
`loggedSetsForExercise`/`lK`). `functionError.ts` (`el`) turned out to
be needed by both `AthleteDetail.tsx` and `Dashboard.tsx`, not just one.

**First real typecheck run, same day**: rather than have Chris review
raw TSX by eye (not meaningful for him), ran `npm install` +
`npx tsc --noEmit` against the tree as it stood — the actual proof
mechanism, not another "trust me." Found and fixed three real bugs this
way, independent of the expected "module not found" noise for files
that genuinely don't exist yet:
- `types.ts`'s `Exercise.ascending_sets` was left as the raw `Json`
  column type instead of its real shape (an ordered array of
  `{weight, reps}` or null) — every real usage site treats it as an
  array, so TypeScript's own `.length`/index-access errors caught this
  immediately. Narrowed to `AscendingSetEntry[] | null`.
- `TrainingLog.tsx` imported a `loadOneRmsForWeeks` function that
  `queries.ts` doesn't actually export (it's `fetchWeekOneRms`) — a
  naming slip from an earlier reconstruction pass that would have been
  a hard compile failure. Fixed the call site; `queries.ts` itself
  (already "confirmed exact") was untouched. Also tightened
  `oneRmsByWeek`'s state type from `Record<string, unknown>` to the
  real `Record<string, WeekEffective1Rm>`, and dropped an unused
  `assignedDays` variable left over from an earlier day-selector design
  TrainingLog.tsx no longer uses.
- `SessionPlayer.tsx`'s own `oneRms` prop was typed `unknown` instead of
  the real `OneRms` type already exported from `exerciseDefaults.ts` —
  fixed the import and the prop type.

After those three fixes, running the typecheck again leaves ONLY
"cannot find module" errors for files that are genuinely not written
yet — nothing else. That's a meaningful signal: everything built so far
is internally consistent with the real schema and with itself, not just
individually plausible-looking.

**2026-10-11, later the same day — BlockBuilder.tsx done.** Fully
reconstructed `src/pages/coach/BlockBuilder.tsx` (`yK`, ~22KB of
minified source — by far the largest and most complex page in the
app), plus every dependency it needed that didn't exist yet:
- `src/components/LiftCategoryBadge.tsx` (`rK` + its `nK`/`tK`
  category-color map — squat/bench/deadlift/accessory, with colors).
  Exports `LIFT_CATEGORIES`/`LIFT_CATEGORY_MAP` so other files (this
  one, and eventually `WeekSummaryTable.tsx`) share one definition
  instead of duplicating the literal array.
- `src/components/ExerciseInventoryPicker.tsx` (`iK`) — the searchable
  dropdown for assigning an exercise to a row, including its
  "retag as…" (fix a miscategorized exercise in place) and "add new
  as…" (create one, tagged into a category) sub-flows.
- `src/lib/metricsFormat.ts` (`_l`/`vl`) — shared number/percent-change
  formatters, confirmed at byte offset 459228 as the real app-code
  pair rather than the React-internal functions reusing the same
  minified names elsewhere.
- `src/components/PlannedMetricsTable.tsx` (`fK` + its `dK` row list) —
  BlockBuilder's READ-ONLY week-summary table (all four lift rows at
  once, no tabs) — confirmed as a genuinely different component from
  AthleteDetail's interactive `WeekSummaryTable` (`yl`), not two
  callers of one shared table.

BlockBuilder.tsx itself covers: per-week training-max overrides
(inherited vs explicit, with the inherited value shown as placeholder
text), add/duplicate/reorder/delete week (the reorder trick writes a
temporary NEGATIVE week_number to dodge a `unique(block_id,
week_number)` constraint — three sequential writes, not two), add/
duplicate/remove day (weekday pinning for the calendar strip), and
per-exercise editing: debounced autosave with 3-attempt retry (any
field edit updates local state instantly, then saves itself 600ms
later through a sequential per-exercise-id flush queue so two edits
never race), ascending sets (exact weight/reps per set, overrides the
plain sets/reps/load fields), backdown sets, and "COMES OUT TO" preview
text for both the main prescription and the backdown (two separate
generators, `prescribedSetPreview`/`backdownSetPreview`, local to this
file — confirmed NOT the same functions AthleteDetail uses for its own
preview text).

Two confirmed-exact oddities kept as-is rather than "fixed", since this
project's job is reconstruction, not redesign:
- `loadAll` resolves the athlete id for the planned-metrics fetch from
  the block's own `athlete_id` first, falling back to the route param
  — but the lighter per-exercise-save refresh uses the route param
  directly, no fallback. Almost always the same athlete either way.
- `updateDay`'s error-path reload isn't awaited, unlike every other
  mutating handler in the file.

**Verification**: `npx tsc --noEmit` against the whole tree — every
new file (BlockBuilder.tsx, ExerciseInventoryPicker.tsx,
LiftCategoryBadge.tsx, PlannedMetricsTable.tsx, metricsFormat.ts)
compiles with zero errors of its own. Every error left in the full
typecheck output is one of the already-known "cannot find module"
ones for files that still genuinely don't exist (see below) — nothing
new, nothing from this batch of work.

**2026-10-11, finishing the same day — everything else.** Reconstructed
every remaining file and ran it all the way through a real build:

- `src/lib/liftColors.ts` (`zK`) — squat/bench/deadlift/accessory
  colors. A second, independent literal in the bundle from
  `LiftCategoryBadge`'s category map, not the same constant reused —
  confirmed identical values, kept as two separate exports rather than
  merged, since that's what the bundle actually has.
- `src/lib/sessionPlayerHelpers.ts` — all 8 functions SessionPlayer.tsx
  and AthleteDetail.tsx between them need: `prescribedSummary`/
  `backdownSummary` (`tq`/`nq`, SessionPlayer's own raw-prescription
  text, no weight resolved), `allSetsLogged` (`rq`), `setSummaryText`
  (`iq`, SessionPlayer's weight-resolved preview line with RPE and
  " · " joins), `loggedRpeSummary` (`aq`), `formatRestTime` (`BK`),
  `plannedSetSummary` (`cK`, AthleteDetail's coach-facing planned text —
  confirmed a separate, simpler function from `setSummaryText`, not a
  shared caller), `loggedSetsForExercise` (`lK`).
- `src/lib/functionError.ts` (`el`) — found and fixed a real naming
  mismatch while wiring this up: AthleteDetail.tsx imported
  `getFunctionInvokeError`, Dashboard.tsx imported
  `describeFunctionError`, for what is the exact same function in the
  bundle. Standardized on `getFunctionInvokeError` and fixed
  Dashboard.tsx's import + both call sites — same kind of fix as the
  `loadOneRmsForWeeks`/`fetchWeekOneRms` slip caught earlier.
- `src/components/BlockSwitcher.tsx` (`aK`) — the block-picker dropdown
  above AthleteDetail's weekly metrics.
- `src/components/WeekSummaryTable.tsx` (`yl` — confirmed occurrence 1
  of that minified name is the real one; occurrence 0 is an unrelated
  React-internal function) — the INTERACTIVE lift-tabbed metrics grid,
  built from actually-logged data, sharing `metricsFormat.ts` with
  BlockBuilder's read-only `PlannedMetricsTable`.
- `src/components/TrendChart.tsx` (`eK`) — per-metric bar/area charts
  (recharts) across an athlete's whole week sequence. Charts only 6 of
  the 8 metrics the summary table shows (no sets/monotony charts) —
  confirmed that's what the real chart-definition list contains, not
  an oversight.
- `src/pages/Account.tsx` (`$c`) — change-password form, the simplest
  page in the app.
- `src/pages/athlete/History.tsx` (`lq`) — the athlete's own
  "History & trends" page at `/history`, reusing WeekSummaryTable and
  TrendChart exactly as AthleteDetail.tsx does, just scoped to the
  signed-in athlete. Defaults to the MOST RECENT week, not
  AthleteDetail's "first incomplete, else last" logic.
- `src/pages/DayDetail.tsx` (`eq`) — the standalone `/day/:dayId`
  session page. Loads everything SessionPlayer needs from just a
  training_day id. Still nothing found anywhere in the app that links
  to this route — worth asking Chris what it's for — but the page
  itself is a confirmed-exact, complete translation regardless.

**Also fixed while wiring TrendChart in**: AthleteDetail.tsx's own
`weeks` state was typed `Week[]` but actually always holds
`WeekWithBlock[]` (from `fetchAthleteWeekSequence`) — harmless until
something needed `.block.name`, which TrendChart does. Widened the
state type; nothing else in that file reads anything narrower.

**Final verification**: `npx tsc --noEmit` — zero errors anywhere in
`src/`. `npm run build` — succeeds end to end (tsc project build, vite
production build, PWA service-worker generation). This is now a real,
complete, buildable checkout of the app, not a reconstruction project
with gaps. The only thing short of "done forever" is the open question
about `/day/:dayId` above, and the standing commitment to keep this
tree in sync with whatever changes next.
