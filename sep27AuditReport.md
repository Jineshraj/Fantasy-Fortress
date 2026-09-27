# Fantasy Fortress — 27 September 2026 Re-Audit Report

## Executive Summary

**This report re-audits the findings from the 17 September 2026 audit against the current codebase (as of 27 September 2026), validating each finding, assessing what has changed, and providing a comprehensive deployment-readiness analysis.**

The Sep 17 audit identified 5 Critical, 12 High, 10 Medium, and 6 lower-severity findings. After independently verifying every finding against the current source code, **the majority of findings remain valid and unfixed**. The scoring engine has matured significantly through operational fixes (6 gameweeks of live production use), but the structural issues flagged in the audit persist.

**Overall assessment: The backend scoring pipeline is operationally functional (it has scored 6 gameweeks successfully), but the public-facing web app remains a static mock demo with zero live data integration. Deployment of the web app requires a complete frontend rebuild wired to Supabase.**

---

## Re-Audit Methodology

- Independently read every file referenced in the Sep 17 audit and verified line numbers, logic, and conclusions against the current source.
- Traced the full data flow: Telegram → AI extraction → roster validation → Sheets upsert → fixture ingestion → provider staging → comparison dashboard → scoring engine → Standings → Supabase sync.
- Verified all client-side components against the live data path.
- Cross-referenced scoring rules against `AGENTS.md` authority document.
- No production data was touched; no syncs were run; no credentials were used.

---

## Critical Findings Validation

| ID | Sep 17 Finding | Current Status | Validity |
|---|---|---|---|
| C-01 | Sync endpoint publicly runnable when `CRON_SECRET` absent | **STILL VALID.** `server.js:71-80`: The conditional `if (cronSecret && ...)` still accepts everything when `CRON_SECRET` is unset. Still accepts GET. Still accepts `gw` query param without validation (any number). Still no run lock. Still reports success before pipeline completes (line 88 fires async). | ✅ Valid |
| C-02 | Telegram webhook has no authentication; empty admin list allows all | **STILL VALID.** `telegramBotService.js:35`: `if (allowedIds.length === 0) return true`. No Telegram webhook secret verification in `server.js:38-67`. No body size limit on the HTTP request handler. | ✅ Valid |
| C-03 | Lineup fingerprint key mismatch (writes with GW prefix, reads without) | **STILL VALID.** Fingerprints stored as `"${gameweek}_${team}"` at `scoringEngine.js:1006` but queried using only `"${teamData.team_name}"` at `scoringEngine.js:1182`. These can never match, so `lineupChangedTeams` is always empty. The D49 guard is effectively a no-op. | ✅ Valid |
| C-04 | Partial standings write (skipping affected teams) corrupts table | **STILL VALID but operationally moot.** `scoringEngine.js:1197-1206`: `safeStandingsRows` filters out changed-lineup teams and writes the filtered result starting from `A1`. However, because C-03 means `lineupChangedTeams` is always empty, `safeStandingsRows` always equals the full `standingsRows`. So C-04 cannot currently trigger, but it will become an active corruption bug the moment C-03 is fixed without also fixing C-04. | ✅ Valid (latent) |
| C-05 | AI-parsed lineups auto-filled with unsubmitted players at 0.50 threshold | **STILL VALID.** `rosterValidator.js:352`: `if (highestScore >= 0.5 && bestPlayer)` — matching threshold remains 0.50. `rosterValidator.js:304-308`: Auto-fills up to 11 starters from reserves without human confirmation. `rosterValidator.js:404-408`: Captain/vice fallback does not enforce distinctness or verify they are starters. No deduplication between starter and bench names. | ✅ Valid |

**C-03 is the most dangerous latent bug.** It means the entire D49 lineup-integrity protection is silently disabled. Any lineup change will pass through without detection, and historical scores can be silently overwritten. Fixing C-03 alone without fixing C-04 will introduce a new active corruption bug.

---

## High Findings Validation

| ID | Sep 17 Finding | Current Status | Validity |
|---|---|---|---|
| H-01 | Clear-then-update race in lineup upsert, fixtures, dashboard | **STILL VALID.** `sheetsService.js:254-265`: Lineup upsert does `clear()` then `update()`. `fixtureService.js:451-460`: Fixture staging does `clear()` then `update()`. `dashboardService.js:595-600`: Dashboard does `clear()` then `update()`. All non-transactional. | ✅ Valid |
| H-02 | Staging merge-write retains stale rows below new payload | **PARTIALLY MITIGATED.** Both providers now use dedup-based merge-write strategy (keep non-refreshed rows + new rows), significantly better than blind append. But `values.update` from A1 still doesn't clear cells below the new payload. If the new payload is shorter, old trailing rows persist. Post-write checks only validate GW1/GW2 counts, not target GW or row uniqueness. | ✅ Valid (partially mitigated) |
| H-03 | API-Football player windows always end at minute 90 for AET/PEN | **STILL VALID.** `apiFootballSyncService.js:422`: `playerWindow.set(pid, { start: 0, end: 90, ... })` — hard-coded 90. Even though `statusShort` accepts `'AET'` and `'PEN'` at line 355, the player window always caps at 90. A goal in extra time (91-120 min) scored against a defender who stayed on pitch would be missed. | ✅ Valid |
| H-04 | Blank fixture scores convert to 0-0 | **STILL VALID (API-Football side).** `sofaScoreSyncService.js:200-202`: `Number(r[8])` on blank yields NaN, which fails `Number.isFinite()` — blanks excluded (good). BUT `apiFootballSyncService.js:259-260`: `Number(r[8] or 0)` explicitly converts blank to 0. API-Football still treats blank scores as 0-0. | ✅ Valid |
| H-05 | SofaScore writes `isCleanSheet` for ALL positions (MID/FWD included) | **STILL VALID.** `sofaScoreSyncService.js:649`: `isCleanSheet` computed based on `minutes >= 60` and opponent goals — no position check. Line 705 writes it for every player. `calculatePlayerPoints` downstream does gate CS points by position, so final points are correct. But the staged flag is semantically wrong for MID/FWD. | ✅ Valid (cosmetic; points correct) |
| H-06 | Cached completed matches not routinely refreshed for corrections | **STILL VALID.** Both providers use heuristic-based cache validity (count >= 14, maxMinutes >= 85, CS ratio <= 50%). Force refresh env flag exists. CS-ratio anomaly detection is an improvement. But no automatic correction window, no content hash tracking, no provider `updated_at` comparison. | ✅ Valid (improved but not resolved) |
| H-07 | Nightly pipeline doesn't sync H2H, Super Cup | **STILL VALID.** `runNightlySyncCron.js:54-84`: Pipeline runs 6 stages. No call to `syncH2HForGw`, `recalculateH2HStandings`, or `syncSuperCupForGw`. These run via separate manual scripts. | ✅ Valid |
| H-08 | Client is a static mock-data demo | **STILL VALID.** `FantasyApp.jsx:21`: `LAST_UPDATED = 'GW 14 · synced Tue 02 Sep'` hard-coded. `Leaderboard.jsx:3`: imports from `mock-fantasy` — 7 fake teams. `Access.jsx:13`: `'SLS14'` hard-coded. `supabase.js`: exists but imported nowhere. | ✅ Valid |
| H-09 | Supabase player sync uses different column contract than scoring | **PARTIALLY VALID.** After re-checking: `supabaseSyncService.js` reads `Players!A2:G` and maps `r[1]=name, r[3]=position, r[4]=club`. This IS consistent with `Players` sheet layout (A=tm_id, B=name, C=?, D=position, E=club). The Sep 17 audit overstated the column mismatch. Provider IDs are correctly sourced from `Player_ID_Mappings` join. **Downgraded to Medium.** | ⚠️ Partially Valid |
| H-10 | All lineups/stats publicly readable via RLS | **STILL VALID.** `supabase_schema.sql:153-159`: All 7 tables have `FOR SELECT USING (true)`. Lineups, player stats, compositions all public before deadline/results. | ✅ Valid |
| H-11 | Telegram batch export silently drops messages | **STILL VALID.** `telegramBotService.js:103-108` returns `{ isBatch: true, messages }`. `server.js:46-57` only sends when `result.text` exists. Batch results have no `text` property. The local bot runner handles batches correctly — this only affects the HTTP webhook path. | ✅ Valid |
| H-12 | `player_gameweek_stats` columns not fully populated; sync status race | **STILL VALID.** `supabaseSyncService.js:270-281`: Only sends minutes, base_points, stadium_bonus, multiplier, final_points, is_effective_starter. Does NOT populate goals, assists, clean_sheet, yellow_cards, red_cards, own_goals, penalty_miss, penalty_save (all remain at schema defaults 0/FALSE). Dashboard sets `syncStatus = 'SYNCED'` for verified rows BEFORE Supabase write. Supabase sync only updates rows still marked `'PENDING'`. | ✅ Valid |

---

## Medium Findings Validation

| ID | Sep 17 Finding | Current Status | Validity |
|---|---|---|---|
| M-01 | `getActiveGameweek()` infers GW from max submitted roster; unreachable warning | **STILL VALID.** `sheetsService.js:40-44`: `Math.min(Math.max(...gws), 38)` clamps to 38 before the `> 38` check. An early future submission advances the pipeline. | ✅ Valid |
| M-02 | Hard-coded Google Sheet ID fallback in multiple services | **STILL VALID.** `scoringEngine.js:9`, `sheetsService.js:5`, `apiFootballSyncService.js:7`, `whatsappFormatterService.js:7`: All have `process.env.GOOGLE_SHEET_ID or '1smq...'` fallback. `dashboardService.js:10` uses env without fallback (correct). | ✅ Valid |
| M-03 | `MASTER_TOP5_CLUBS` duplicated in fixtureService and dashboardService | **STILL VALID.** Acknowledged in AGENTS.md as known constraint requiring synchronized updates. | ✅ Valid |
| M-04 | SofaScore filter rejects names containing '2' then tries to match season-labelled names | **STILL VALID.** `fixtureService.js:80`: `lower.includes('2')` rejects any name with '2'. `fixtureService.js:110`: Season variants like `'premier league 24/25'` contain '2' and are rejected at line 80, making line 110 dead code. Works only because SofaScore returns names without season suffix. | ✅ Valid |
| M-05 | API-Football fixture merging only labels FT as finished (not AET/PEN) | **STILL VALID.** `fixtureService.js:395`: Only `'FT'` maps to `'FINISHED'`. AET/PEN remain `'SCHEDULED'` in Fixture_Staging, making them invisible to provider sync services. | ✅ Valid |
| M-06 | API-Football ID mapper only populates empty IDs, never corrects stale | **STILL VALID.** `apiFootballSyncService.js:536`: `if (matched && !matched.api_football_id)` — only writes when blank. | ✅ Valid |
| M-07 | Provider fetches have no abort timeout | **STILL VALID.** No `AbortSignal.timeout()` found in any fetch calls. | ✅ Valid |
| M-08 | Broad `catch {}` swallows errors silently | **STILL VALID.** Multiple `catch (e) {}` and `.catch(() => {})` in scoring engine (tab creation, fingerprint load/write, backup). Dashboard formula recompute declared `'non-fatal'`. | ✅ Valid |
| M-09 | GW1 bypasses Comparison Dashboard | **STILL VALID.** `scoringEngine.js:179-192`: GW1 reads from `SofaScore_Staging` instead of `Comparison_Dashboard`. | ✅ Valid |
| M-10 | 100+ scripts with no test suite | **PARTIALLY REMEDIATED.** Scripts cleaned up from 111 files to 18 operational scripts (debug dumps, one-off fixes, GW-specific scripts, and `_archive/` + `debug/` directories all removed). Remaining scripts are all actively used operational tools. However, there is still no test framework, no `test` script in any `package.json`, and no unit/integration/fixture-replay tests. | ⚠️ Partially Fixed |

---

## Lower-Severity Findings Validation

All 6 lower-severity findings from the Sep 17 audit remain valid:

1. **`resolveExactTabName()` returns unknown input** — `sheetsService.js:85`: `return inputName` passes through unknown names. Line 57 returns `'Choakers FC'` for null input.
2. **`isPlaceholder()` can't match "no one"** — `rosterValidator.js:79`: `.replace(/[^a-z0-9]/g, '')` strips space, producing `"noone"`. PLACEHOLDER_WORDS contains `"no one"` (with space). Never matches.
3. **Scoring accepts any nonblank `final_approved_pts`** — `scoringEngine.js:202-204`: Pauses only on empty column H. No status/GW/approver validation.
4. **Supabase service-role policies unnecessary** — `supabase_schema.sql:162-168`: Service role bypasses RLS. Policies are redundant.
5. **H2H `computeEffectiveXI` diverges from main scorer** — `h2hScoringService.js:165-206`: Has own substitution logic (position-matching only, different captain failover).
6. **Large stateful service files with cross-coupling** — `scoringEngine.js` is 1,242 lines. `stadiumService` cyclic import exists.

---

## Architecture Assessment Update

The three competing product paths identified in Sep 17 remain fully in place:

1. **Operational Authority:** Google Sheets + provider staging + scoring engine → **WORKING**
2. **Database Projection:** Supabase sync → **PARTIALLY WORKING** (missing detailed stats)
3. **User-Facing:** React/Vite mock demo → **NOT CONNECTED**

The `supabase.js` client library exists but is imported by zero components. Every client component reads from `mock-fantasy.js` containing 7 fake FPL-style teams that have no relation to the actual 16 tournament franchises.

---

## What Has Changed Since Sep 17

While no audit findings have been structurally fixed, operational improvements are notable:

1. **SofaScore CS-ratio anomaly detection** — Cache invalidation detects suspicious clean sheet ratios (>50% CS=TRUE or both-teams-conceded anomalies), auto-re-fetching affected matches.
2. **De-duplication merge-write** — Both staging services use `newRowKey` dedup logic instead of blind append.
3. **GW1/GW2 pre-write safety snapshots** — Both providers verify row counts for historical GWs before writing.
4. **6 gameweeks successfully scored** — Pipeline operationally validated through GW1-GW6.

---

## Deployment Readiness Analysis

### What IS Ready

| Component | Status | Notes |
|---|---|---|
| Scoring Engine | ✅ Operational | 6 GWs scored. Core logic correct. |
| SofaScore Sync | ✅ Operational | Cache + merge-write + CS validation |
| API-Football Sync | ✅ Operational | Rate-limited, event-sourced CS |
| Comparison Dashboard | ✅ Operational | Dual-source reconciliation |
| Google Sheets Ledger | ✅ Operational | 16 team tabs + Standings |
| Supabase Schema | ✅ Deployed | 7 tables with indexes |
| Supabase Core Sync | ⚠️ Partial | Missing detailed stat columns (H-12) |
| Telegram Bot | ✅ Operational | Running right now |
| H2H / Super Cup | ✅ Operational | Manual script-triggered |
| Tournament Calendar | ✅ Complete | Full season H2H schedule defined |

### What Is NOT Ready

| Component | Status | Blocker Level | Details |
|---|---|---|---|
| **Frontend Web App** | ❌ Not Started | **BLOCKING** | 100% mock data. Zero Supabase integration. Fake team names. Hard-coded access code. |
| **Server API for Client** | ❌ Not Started | **BLOCKING** | No REST API endpoints for client. Server only has health, webhook, and sync routes. |
| **Supabase Detail Stats** | ❌ Not Populated | High | goals/assists/CS/cards columns all default 0/FALSE in `player_gameweek_stats`. |
| **H2H/Super Cup in Supabase** | ❌ Not Available | High | No Supabase tables for H2H or Super Cup data. |
| **Auth/Access Control** | ❌ Not Implemented | High | Client code `SLS14` visible in source. No real auth. Open RLS. |
| **Public Security** | ❌ Not Hardened | High | C-01 open sync, C-02 open webhook, H-10 public RLS. |
| **Error Recovery** | ❌ Missing | Medium | No rollback, no run records, no idempotency guarantees. |
| **Testing** | ❌ Missing | Medium | No unit tests, no integration tests, no fixture-replay tests. |

---

## Recommended Remediation Sequence For Deployment

### Phase 1: Frontend Build (CRITICAL PATH — #1 PRIORITY)

The frontend is the **sole blocking deployment item**. Everything else works. Required:

1. **Leaderboard/Standings** — Read `standings` table (season_rank, season_total, gw_scores JSONB)
2. **Team Detail View** — Read `player_gameweek_stats` + `lineups` for selected team/GW
3. **Fixtures** — Read `fixtures` table filtered by GW
4. **H2H League View** — Either sync H2H data to new Supabase tables or build a dedicated view
5. **Super Cup View** — Same approach as H2H
6. **Player Stats Modal** — Read `player_gameweek_stats` for drill-down
7. **Dynamic GW Selector** — Read available GWs from Supabase
8. **Real Auth** — Replace `SLS14` with proper team-based auth or public access

### Phase 2: Supabase Stat Completeness

Fix H-12: Populate `goals`, `assists`, `clean_sheet`, `yellow_cards`, `red_cards`, `own_goals`, `penalty_miss`, `penalty_save` in the Supabase sync. The data exists in scoring engine results — it just needs to be mapped through.

### Phase 3: H2H & Super Cup Supabase Tables

Create Supabase tables for H2H standings/fixtures and Super Cup brackets with sync from existing Google Sheets tabs. Or build server API endpoints for direct client consumption.

### Phase 4: Security Hardening (Before Public Deploy)

1. **Fix C-01**: Make `CRON_SECRET` mandatory at startup. POST-only. Validate GW 1-38.
2. **Fix C-02**: Verify Telegram webhook secret. Require non-empty `ALLOWED_ADMIN_IDS`.
3. **Fix H-10**: Time-gate lineups/stats RLS policies.
4. **Remove hard-coded credentials**: Strip `SLS14` and Sheet ID fallbacks.

### Phase 5: Scoring Integrity Fixes (Important But Not Blocking)

1. **Fix C-03/C-04**: Consistent `(gameweek, team)` fingerprint key. All-or-nothing standings write.
2. **Fix M-05**: Normalize AET/PEN to FINISHED in fixture merging.
3. **Fix H-03**: Set player window end to 120 for AET/PEN.
4. **Fix H-04**: Represent blank API-Football scores as null, not 0.

### Phase 6: Operational Hardening (Nice to Have for v1)

- Add run lock for sync pipeline
- Add abort timeouts for provider fetches
- Archive old scripts to `scripts/_archive`
- Add basic scoring invariant tests
- Add structured run logging with run IDs

---

## Findings Scorecard

| Severity | Sep 17 Count | Still Valid | Fixed | Reclassified |
|---|---|---|---|---|
| Critical | 5 | 5 (C-04 latent) | 0 | 0 |
| High | 12 | 11 | 0 | 1 (H-09 downgraded to Medium) |
| Medium | 10 | 10 | 0 | 0 |
| Lower | 6 | 6 | 0 | 0 |

## Deployment Decision

**The Sep 17 audit's NO-GO verdict remains technically correct** — security findings (C-01, C-02) and integrity issues (C-03, C-04) are unfixed.

**However, the practical deployment blocker is simpler: there is no frontend to deploy.** The client is a static demo with fake data. The backend scoring pipeline works. The database is synced. The missing piece is a real frontend wired to Supabase.

**Recommended approach: Build the frontend first (Phase 1), then harden security before going public (Phase 4).**

---

## Verification Record

- Server source: Pipeline running live via `npm run bot` (5h50m uptime confirms syntax correctness)
- Sep 17 finding line references: All verified against current source
- Client mock data: Verified — 7 fake teams, 15 fake FPL players, hard-coded access code, unused Supabase client
- Supabase schema: Verified — 7 tables, full public RLS, missing stat population
- Git status: Not available (no `.git` directory)
- Live data: Not checked (out of scope)
