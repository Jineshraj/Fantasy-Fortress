# Fantasy Fortress — Loading Fix Plan

**Date:** 15 Nov 2026
**Repo:** https://github.com/Jineshraj/Fantasy-Fortress (cloned to `~/workspace/projects/Fantasy-Fortress`)
**Status:** Implemented locally (15 Nov 2026) — see §10 Execution log. Build + existing test suites pass; browser/DevTools measurement and the live matrix are still outstanding, so this is not deployed or marked Done.
**Goal:** First load shows the league table without ever hitting the false "League data unavailable / Try again" screen, even on a cold first visit.

---

## 1. Problem, verified against the code

### Symptom (reported by the user)
App feels slow to load. The splash screen changes before the data has actually loaded, and the user has to press **Try again** almost every time. Retry then works.

### Root cause 1 — the splash is cut off at 7 seconds, whether the data is ready or not
`client/src/components/fantasy/FantasyApp.jsx:46-47,135-142`

```js
const MIN_SPLASH_MS = 900
const MAX_SPLASH_MS = 7000
// …
useEffect(() => {
  if (stage !== 'splash') return
  const t = setTimeout(() => setStage('hub'), MAX_SPLASH_MS)
  return () => clearTimeout(t)
}, [stage])
```

When the timer fires, `stage` becomes `'hub'`. If `boot.data` is still `null`, `FantasyApp.jsx:232-244` renders `ErrorState` ("League data unavailable" + **Try again**) instead of the app. The comment in the code says this is intentional ("rather than a dead splash"), but in practice it turns a slow load into a fake failure.

### Root cause 2 — boot fetches everything, up front, before anything can render
`client/src/data/live.js:1038-1076` — `prefetchAll()` runs four tracks in parallel, and the hub is gated on all of them (via `standings`, which is the only hard requirement, but it is awaited together with the rest in `Promise.all`):

| Step | What it loads | Size / cost |
|---|---|---|
| `standings` | `standings` (16 rows) + `teams` (crests) | Small — fast |
| `squads` | `fetchAllPlayerStats()` then `fetchPlayersMap()` | **Large** — `player_gameweek_stats` for *all* gameweeks, including `points_breakdown` and `match_breakdown` JSON columns, then `players` |
| `scores` | `fetchH2HScores()` + `fetchCaptaincyMap()` | **Duplicated** — both load `gameweek_team_scores` (different columns, separate caches: `cache.gwScores` vs `cache.teamScores`), plus all of `lineups` |
| `fixtures` | `fixtures` (all Top-5-league fixtures, all gameweeks) | Medium, grows every gameweek |

`loadAll()` (`live.js:41-64`) paginates 1000 rows at a time **sequentially** (`for … await query.range(...)`). Once `player_gameweek_stats` passes 1,000 rows — 16 teams × 15 players = 240 rows per gameweek, so from GW5 onward — boot needs 2+ sequential round-trips for that table alone. The total regularly exceeds 7 s on a cold first load (cold Supabase / slow network), which triggers Root cause 1.

### Root cause 3 — loading does not start until after login
`FantasyApp.jsx:102-116` — the boot effect returns early while `stage === 'access'`:

```js
if (stage === 'access' || started.current) return
```

So while the user is on the access screen typing the code (or choosing "Explore as Guest"), no fetching happens at all. That idle time is wasted. Returning visitors skip this (`ff:unlocked` in localStorage sends them straight to `splash`), so this mainly hurts first-time / locked visits — which is exactly when the first impression matters.

### Root cause 4 — retry throws away work already done
`live.js:1079-1083` — `retryPrefetch()` calls `clearLiveCache()` and sets `prefetchPromise = null`, then re-runs the whole boot from scratch. If the first attempt was 80% done when the 7 s timer fired, retry discards that progress. Retry succeeds in practice only because the second run is warmed up (Supabase awake, query plans cached).

### What is NOT the cause (checked, do not "fix" these)
- **Missing Supabase indexes:** `server/supabase_schema.sql:133-139` already has indexes on `lineups(gameweek)`, `player_gameweek_stats(gameweek, team_name)`, `gameweek_team_scores(gameweek)`, `fixtures(gameweek)`, `standings(season_rank)`. Verify they were actually applied in the Supabase dashboard; do not re-add them blindly.
- **Redis:** ruled out. The frontend reads Supabase directly, data changes once a day (nightly sync), and the app already caches via Sheets staging, the local `af_cache` files, and the in-memory `cache` in `live.js`. Redis would not fix a 7 s forced cut-off or an all-up-front fetch. Do not add it in this plan.
- **Backend / Render:** the backend is not in the frontend load path at all. No backend change is needed for this fix.
- **Bundle / images:** `client/public/fantasy-logos` is ~8 MB on disk, but logos are loaded per-screen, not in the boot prefetch. Do not chase this first; measure it in Phase 0 and only act if the build output shows a large first chunk.

---

## 2. Goal and success criteria

### Goal
Load from the moment the app mounts (including on the login screen), load in priority order, and show the hub as soon as the minimum data to render it is ready — never show a whole-app failure for a load that is merely slow.

### Acceptance criteria (all must pass)
1. **Cold first load, cleared localStorage, throttled to Fast 3G in DevTools:** the league table renders without pressing Try again. No "League data unavailable" screen appears.
2. **Time to first table** (splash shown → table visible) is under ~3 s on a normal connection, and under ~7 s on Fast 3G. Record the before/after numbers from Phase 0.
3. **Try again is only for real failures:** it appears only if `standings` itself fails after retries (e.g. Supabase down / no network), not because a timer expired.
4. **Second visit is fast:** returning visitor (unlocked in localStorage) sees the table in ~1 s, using the in-memory cache where valid.
5. **No data regression:** table totals, squad points, H2H and Super Cup scores, fixtures, and player detail pages show exactly the same numbers as before the change. No mock/fallback data is introduced (the codebase rule in `live.js:1-7` still holds).
6. **`npm --prefix client run build` passes**, and no new console errors appear on `/table`, `/squad`, `/fixtures`, `/stats`, `/h2h`, `/cup`, or `/team/<slug>`.

---

## 3. Principles

1. **Both ideas, not either/or:** start fetching at the login screen *and* load in priority order. Early start buys a few seconds of head start; priority order is what makes the first paint fast.
2. **Safe to prefetch at login:** the data is public anon Supabase reads (`client/src/lib/supabase.js` — `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`). The access code  (demo code / guest, `client/src/components/fantasy/Access.jsx`) is a client-side gate only; prefetching does not leak anything that is not already public. If a user never unlocks, the cost is a few cheap reads — acceptable.
3. **Never fake a failure:** a slow load is not an error. Only a real fetch failure (after retry) may show the error screen.
4. **Do not break the cache contract:** `prefetchPromise` is shared so concurrent callers do not re-fetch. Keep that. Retry must reuse completed steps, not clear everything.
5. **Small, reversible phases:** each phase must be shippable and verifiable on its own. If a phase regresses, revert that phase only.

---

## 4. Target flow

```
App mounts
  ├─ Immediately (even on Access screen): start Tier 1 fetch (standings)
  │   └─ In parallel, start Tier 2 fetches in background (do not block render)
  ├─ User unlocks (code / guest) → splash shows real progress
  ├─ Standings ready → hub renders, table visible
  │   └─ Tier 2/3 continue in background; each screen shows its own
  │      loading state until its data lands (no whole-app error)
  └─ If standings fails after retries → error screen + Try again
      (Try again retries only the failed tier, reusing completed tiers)
```

### Priority tiers

| Tier | Data | Needed for | Blocks first paint? |
|---|---|---|---|
| **1 — critical** | `standings` (16 rows) + `teams` (crests, best-effort) | `/table` (default route) | **Yes — only this tier** |
| **2 — near** | `fixtures` (current + next GW first, rest in background), `players` map | `/fixtures`, squad/team pages (club names) | No — load in background, show per-screen loading |
| **3 — deferred** | `player_gameweek_stats` for the **latest GW only** at boot, `gameweek_team_scores` (loaded **once**, shared), `lineups` for the latest GW only | `/squad`, `/stats`, `/h2h`, `/cup`, `/team/<slug>` | No — load in background; older gameweeks on demand when the user changes `?gw=` |
| **On demand (not at boot)** | `points_breakdown` / `match_breakdown` JSON, older-GW stats, player detail data | Player detail modal / breakdown view | No — fetch when the user opens that player/screen |

---

## 5. Phased plan

### Phase 0 — Measure the baseline (do not skip)
**Files:** none changed. Use the deployed Vercel app + local dev.
1. Clear localStorage (`ff:unlocked`), hard-reload, record with DevTools Network tab (Fast 3G + normal):
   - Time to splash, time to table, time to full boot; which Supabase request is slowest; total rows/bytes per request (especially `player_gameweek_stats`).
   - Confirm the failure mode: does the 7 s timer fire before `standings` resolves on a cold load?
2. Confirm in the Supabase dashboard that the indexes in `server/supabase_schema.sql:133-139` exist (if the schema was applied with `CREATE TABLE IF NOT EXISTS` on an existing DB, new indexes may not have been applied — run them manually if missing).
3. Record the numbers in the PR / commit message. These are the before-numbers for Acceptance criterion 2.

**Acceptance:** a short note with before-numbers (time to table, slowest request, row counts) exists before any code changes.

### Phase 1 — Start fetching on the login screen
**Files:** `client/src/components/fantasy/FantasyApp.jsx`, `client/src/data/live.js`
1. In `FantasyApp`, start the Tier 1 fetch on mount regardless of `stage` — remove the `if (stage === 'access') return` gate for the fetch itself (keep the *render* gate: the hub still only renders after unlock). The simplest correct form: call the new `prefetchStandings()` (see Phase 2) in a mount-only effect, and let the existing splash effect reuse the shared promise instead of starting a second fetch.
2. Keep `prefetchPromise` sharing: if the login screen already started a fetch, the splash effect must attach to the same promise, not start a duplicate. Verify with the Network tab — `standings` must be requested exactly once per page load.
3. Do not prefetch Tier 3 (heavy stats) on the login screen — only Tier 1, and optionally Tier 2. Heavy data is wasted if the user never unlocks.

**Acceptance:** on a fresh load, the `standings` request starts while the access screen is still visible; after unlocking, the table appears faster than in Phase 0 (measure it); no duplicate `standings` request.

### Phase 2 — Split the boot into priority tiers
**Files:** `client/src/data/live.js`, `client/src/components/fantasy/FantasyApp.jsx`
1. In `live.js`, split `prefetchAll()` into:
   - `prefetchStandings(onProgress)` — resolves with `{ standings }` only.
   - `prefetchRest(onProgress)` — the remaining steps (squads, scores, fixtures), run in the background after Tier 1. It must be safe to call while Tier 1 is still in flight (share promises, do not duplicate work).
   - Keep `prefetchAll()` as a thin wrapper (`prefetchStandings` then `prefetchRest`) so existing callers (`revalidate`, background refresh) keep working.
2. In `FantasyApp`, change the boot to: await Tier 1 → set `boot.data` with standings → render the hub. Kick off `prefetchRest()` immediately after (do not await it for render). Track its progress separately (e.g. `boot.restReady` / per-step progress) so screens can show their own loading state.
3. Update `Splash` (`client/src/components/fantasy/Splash.jsx`) so its progress bar reflects Tier 1 + background tiers honestly — do not show 100% until the tier the user is about to see is ready.

**Acceptance:** the table renders as soon as standings land, even if squads/fixtures are still loading; navigating to `/fixtures` or `/squad` before Tier 3 finishes shows a per-screen loading state, not the whole-app error.

### Phase 3 — Remove the false failure (the 7-second cut-off)
**Files:** `client/src/components/fantasy/FantasyApp.jsx`
1. Delete (or repurpose) the `MAX_SPLASH_MS` effect that forces `setStage('hub')` after 7 s. Replace it with:
   - Keep `MIN_SPLASH_MS = 900` (splash must show at least briefly so the crest animation does not flash).
   - No maximum that discards a pending load. The splash stays until Tier 1 resolves or *actually* fails.
   - Add a generous *failure* timeout only for Tier 1 (e.g. 30 s, with one automatic retry inside `loadAll` — see Phase 5). Only after that timeout + retry fails may the error screen appear.
2. Keep the existing `.catch` path: `boot.status === 'error'` → `ErrorState` + Try again. That path must now be reachable only on a real failure, not on a timer.

**Acceptance:** on a throttled cold load, the splash stays up past 7 s if needed and the table eventually renders with no Try again press; the error screen appears only when the network/Supabase is actually down (test by blocking the Supabase domain in DevTools).

### Phase 4 — Trim the payload and de-duplicate (the actual speed win)
**Files:** `client/src/data/live.js`
1. **De-duplicate `gameweek_team_scores`:** load it once and share the result between `fetchH2HScores()` and `fetchCaptaincyMap()`. Today they each call `loadAll('gameweek_team_scores', …)` with different column lists and separate caches (`cache.gwScores` vs `cache.teamScores`). Change to a single `fetchTeamScores()` that loads the union of columns once (`team_name,gameweek,total_points,stadium_bonus,captain_name,effective_captain_name`) and derives both maps from it.
2. **Drop heavy JSON from the boot query:** `fetchAllPlayerStats()` currently selects `points_breakdown,match_breakdown` for every row of every gameweek. Remove those two columns from the boot select; fetch them on demand only when a player detail / breakdown view is opened (add a `fetchPlayerBreakdown(playerName, gw)` that selects them for one row). Keep the existing fallback for schemas missing those columns.
3. **Boot loads the latest GW only for stats:** add an optional equality filter to `loadAll()` (e.g. `loadAll(table, select, order, { column, value })` using Supabase `.eq()`), and use it in the boot path for `player_gameweek_stats`, `gameweek_team_scores`, and `lineups` (`gameweek = latestGw`, where `latestGw` comes from Tier 1 standings). Older gameweeks load on demand when the user changes `?gw=` — cache per-GW so going back to a loaded week is instant. Note: `fetchStandings()` already derives `latestGw` from `gw_scores`; reuse that, do not recompute it in a second query.
4. **Fixtures:** at boot, prioritise the current/next gameweek; load the full fixture history in the background (or on demand for past weeks). Do not block Tier 2 on the full history.

**Acceptance:** Network tab shows (a) `gameweek_team_scores` requested once, not twice; (b) the boot `player_gameweek_stats` request has no `points_breakdown`/`match_breakdown` columns and is filtered to one gameweek; (c) time to table improves measurably vs Phase 0 numbers. All screens still show identical numbers (Acceptance criterion 5).

### Phase 5 — Make retry reuse work, and add a real retry inside the fetch
**Files:** `client/src/data/live.js`, `client/src/components/fantasy/FantasyApp.jsx`
1. Change `retryPrefetch()` so it does **not** call `clearLiveCache()` unconditionally. It should retry only the failed tier(s) and reuse any tier that already succeeded (keep the shared `prefetchPromise` for completed steps). Only a deliberate "refresh" (`revalidate`, header refresh button) clears the cache.
2. Add one automatic retry with backoff inside `loadAll()` for transient failures (network blip, Supabase cold start): retry once after ~1 s, then surface the error. Do not retry on a 4xx / "table does not exist" / schema error — those will not fix themselves.
3. In `FantasyApp.onRetry`, do not set `stage` to `'splash'` and then unconditionally to `'hub'` in `.finally()` — that recreates the old race. Retry should stay on the splash/error screen until the retry promise settles, then go to the hub only if `boot.data` is present.

**Acceptance:** kill the network mid-boot (DevTools offline toggle, then back online) and press Try again — the retry completes without re-fetching the tiers that already succeeded (verify in the Network tab); a single transient failure no longer needs a manual retry at all.

### Phase 6 — Verify, then ship
1. `npm --prefix client run build` passes with no new warnings.
2. Manual test matrix (record pass/fail for each):
   - Fresh load, cleared localStorage, normal connection → table without Try again.
   - Fresh load, Fast 3G → table without Try again (splash may stay up longer; that is correct behaviour now).
   - Returning visitor (unlocked) → table in ~1 s.
   - Deep links: `/squad?gw=3`, `/team/<slug>?gw=3`, `/fixtures`, `/h2h`, `/cup` — each renders correctly, with per-screen loading where its tier is still in flight.
   - Offline / Supabase domain blocked → error screen + Try again appears, and Try again recovers when the network returns.
   - Change `?gw=` to an older week → older stats load on demand and are cached (going back is instant).
3. Deploy to Vercel (frontend only — no backend/Render change in this plan) and repeat the cold-load test against the live URL on a phone + desktop.
4. Update this file's Status to "Done" with the after-numbers and the deployed date.

**Acceptance:** all of §2's acceptance criteria pass on the live Vercel URL, not just locally.

---

## 6. Risks and how to handle them

| Risk | Mitigation |
|---|---|
| Splash stays up "too long" on a very slow network and the user thinks the app is stuck | Keep the progress list in `Splash` honest (real per-step progress, not a fake bar); add a "still loading…" note after ~10 s. Do not reintroduce a forced cut-off that fakes a failure. |
| Per-screen loading states are missing, so a screen shows empty content while its tier loads | Phase 2 must add a loading state to each screen that depends on Tier 2/3 (`Squad`, `StatsLeaders`, `Fixtures`, `H2H`, `SuperCup`, `TeamView`). An empty screen is a bug; a skeleton/spinner is the fix. |
| Latest-GW-only boot breaks a screen that needs older weeks (e.g. overall table history) | `standings.gw_scores` already carries the per-week totals for the table. Player stats for older weeks load on demand in Phase 4 — verify `/squad?gw=1` and `/team/<slug>?gw=1` in Phase 6. |
| Sharing one `gameweek_team_scores` load breaks H2H or captaincy | The union column list in Phase 4 covers both consumers. Verify H2H scores and captain/vice display against the pre-change build before shipping. |
| Prefetching at login wastes reads if the user abandons the page | Accepted (see §3.2). Tier 1 is 16 rows; Tier 3 is deliberately not prefetched on the login screen. |

---

## 7. Out of scope (do not do in this plan)

- **Redis / any new service.** Ruled out — see §1, "What is NOT the cause".
- **Backend / Render changes.** The backend is not in the load path. The Render deploy (web service + external cron) is a separate piece of work.
- **Supabase schema changes**, except applying the already-written indexes in `server/supabase_schema.sql:133-139` if they are missing in the live project.
- **Rewriting the access gate / real auth.** The demo-code / guest gate stays as-is; this plan only moves *when* fetching starts.
- **Image / bundle optimisation** beyond measuring in Phase 0. Revisit only if the build output shows it is actually on the critical path.

---

## 8. Files touched (summary)

| File | Change |
|---|---|
| `client/src/components/fantasy/FantasyApp.jsx` | Start fetch on mount (incl. Access stage); await Tier 1 only to render hub; remove 7 s forced cut-off; fix retry to reuse completed tiers |
| `client/src/data/live.js` | Split `prefetchAll` into `prefetchStandings` + `prefetchRest`; add `loadAll` filter param; de-duplicate `gameweek_team_scores`; drop breakdown JSON from boot; latest-GW-only boot for stats/scores/lineups; retry-inside-`loadAll`; retry reuses completed tiers |
| `client/src/components/fantasy/Splash.jsx` | Progress reflects real tier progress; "still loading" note after ~10 s |
| `client/src/components/fantasy/Squad.jsx`, `StatsLeaders.jsx`, `Fixtures.jsx`, `H2H.jsx`, `SuperCup.jsx`, `TeamView.jsx` | Per-screen loading state while its tier is in flight (only if not already present) |
| `client/src/components/ui/states.jsx` | No change expected; reuse `ErrorState` for real failures only |

---

## 9. Rollback

Each phase is independently revertible with `git revert` on its commit. If the deployed fix regresses (table numbers wrong, or a screen that worked now errors), revert the Phase 4 commit first (payload/dedupe changes are the highest-risk), then Phase 2, and re-measure. The pre-change behaviour (7 s cut-off + Try again) is the fallback, not the goal — do not "fix" a regression by restoring it permanently; fix the regression.

---

## 10. Execution log (15 Nov 2026)

### Phase 0 — measurement: NOT DONE
No browser/DevTools session was available in this environment, so there are no before/after waterfall or throttled-load numbers. The code changes below are justified by the static causes in §1, not by a recorded baseline. **Still required before marking Done:** a cold Fast-3G load before/after comparison (or a Lighthouse/Performance-panel trace) against the deployed URL.

### What shipped (all local, uncommitted)

**`client/src/data/live.js`**
- `loadAll(table, select, order, filter)` now accepts an optional `{ column, value }` equality filter (Supabase `.eq()`), and internally delegates to `loadPage` which rebuilds the query for each attempt.
- `loadPage` does one automatic retry after 1 s for transient errors only (`isRetriableError`: network/5xx/408/429; never 4xx, `42P01`, `42703`, `42883`, `PGRST204`, `PGRST205`, "does not exist", column errors).
- Preserved the existing `id` tie-breaker sort (`query.order('id', …)` when ordering by another column) — this had landed in the tree mid-session and is load-bearing for stable pagination.
- `fetchAllPlayerStats` now selects scalar columns only (`PLAYER_STATS_SELECT`); the JSON payloads moved to `BREAKDOWN_SELECT` + `fetchPlayerBreakdownRows(playerName)` (on-demand; returns `[]` if the columns are absent instead of failing the screen).
- `fetchPlayerDetail` calls the breakdown fetch, merges `points_breakdown`/`match_breakdown` into the row, and builds a per-GW map so the form's double-gameweek check still works.
- `gameweek_team_scores` is loaded once via `fetchTeamScores()` (union of `total_points, stadium_bonus, captain_name, effective_captain_name`, shared in-flight promise); `fetchH2HScores()` and `fetchCaptaincyMap()` derive from it. `teamScoresPromise` always clears itself in `.finally`.
- Prefetch split: `prefetchStandings(onProgress)` (Tier 1, shared promise, resets on rejection) and `prefetchRest(onProgress)` (fixtures/scores/players, settles each step, returns `{done, failed, errors}`). `prefetchAll` = standings → rest. `PREFETCH_STEPS` = `standings (critical), fixtures, scores, players` — the old `squads` step is gone.
- Progress state (`progressState {done, failed}` + `resetProgress()`): `track()` moves keys between done/failed and reports real progress; `clearLiveCache()` (full clear) resets it.
- `retryPrefetch()` no longer clears the cache. It resets `restPromise`/`prefetchPromise` **and `standingsPromise`** (so a Tier-1 request that never settled after the timeout is not re-awaited), then reuses every completed tier. `revalidate()` remains the only path that clears the cache.

**`client/src/components/fantasy/FantasyApp.jsx`**
- Removed `MAX_SPLASH_MS` (the 7 s fake-failure cut-off). Added `TIER1_TIMEOUT_MS = 30000` for a genuine "still pending" failure.
- Tier 1 starts on mount (`prefetchStandings`), including while the Access gate is showing, so unlocking is not a cold start.
- Boot is keyed by an `attempt` counter, not a `started` ref. The splash effect runs on `[stage, attempt]`, awaits **standings only**, then sets `boot.data = { standings }`, fires `prefetchRest` in the background (not awaited) and reveals the hub after `MIN_SPLASH_MS`. A real rejection (or the 30 s timeout) shows the error path.
- Async boot handlers check a mount-lifetime `mountedRef` instead of a per-effect `cancelled` flag. This is a deliberate StrictMode fix: with the old `started` ref, React's dev double-invoke cancelled the only listener and left the splash stuck. A retry bumps `attempt` and re-runs the effect; `onRetry` no longer sets `hub` in `.finally()`, so the splash/error stay until the retry actually settles.
- Late Tier-1 success after the 30 s timeout still lands (it sets `ready` and reveals); that is a recovery, not a second failure.

**`client/src/components/fantasy/Splash.jsx`**
- Progress percentage counts **critical** steps only, so Tier 2/3 in-flight work does not hold the bar at 0.
- After 10 s a `role="status"` note appears: "Still warming up — a slow connection can take a few more seconds."

**`client/src/index.css`**
- Added `.boot-note` (splash block) for that note.

### Deliberate deviation from Phase 4 item 3
The plan said "boot loads the latest GW only for stats". Player stats are now **not loaded at boot at all**, because every consumer needs the full season, not one GW:
- `fetchTeamSquad()` uses season totals from all gameweeks.
- `fetchStatLeaders()` aggregates the whole season.
- `fetchPlayerDetail()` builds recent form from multiple gameweeks.

Loading only the latest GW would have warmed no screen and added a filter that later needs undoing. `Squad`, `StatsLeaders` and `PlayerModal` already have per-screen loading/error states and fetch `player_gameweek_stats` on demand. The `loadAll` filter capability is still in place for the tables where it is useful, and no boot query now selects the breakdown JSON.

### Verification run
- `npm --prefix client run build` — passes (1917 modules; `index` 360.5 kB / 112.1 kB gzip, `supabase` 208.1 kB / 53.8 kB gzip, CSS 93.7 kB / 17.3 kB gzip). No new warnings; Rolldown splits `icons`, `supabase` and the app chunk automatically.
- `node --check client/src/data/live.js` — passes.
- `npm --prefix client run test:render` — ALL SCREENS RENDER OK (all route/render/logo/deep-link/branding/scale/UX checks pass).
- `npm --prefix client run test:audit` — 22 OK / 0 FAIL.
- `npm --prefix client run test:redesign` — 36/36 passing (runs a fresh build first).

### Still outstanding (do not mark Done until these pass)
1. Phase 0 before/after: cold load on Fast 3G + normal, plus Network-tab checks that `gameweek_team_scores` is requested once and the boot payload no longer carries the breakdown JSON.
2. Phase 6 manual matrix: fresh (cleared storage) / returning visitor / deep links (`/squad?gw=3`, `/team/<slug>?gw=3`, `/fixtures`, `/h2h`, `/cup`) / Supabase-domain blocked → error + recovery / older `?gw=` loads on demand.
3. Confirm a development (`npm run dev`) boot now completes under StrictMode's double-invoke (the `attempt` + `mountedRef` refactor is the fix, but it has not been observed in a browser).
4. Deploy frontend to Vercel and repeat on the live URL, then record after-numbers and the deploy date here.

