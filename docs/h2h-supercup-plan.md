# H2H League + Super Cup — Implementation Plan

> Last updated: 02 Sept 2026
> Status: **PLAN ONLY** — no code/data edits yet
> Owned sheets: `H2H_League`, `Super_Cup` (both already exist with raw fixture data only)

---

## 1. Goals

1. **H2H League**: auto-score each round-robin H2H match (per gameweek) and update group standings.
2. **Super Cup**: auto-score each knockout match, advance the winner to the next round, update the bracket through to the final.
3. **Belt-and-braces**: re-use the same `final_pts` values that the regular `scoringEngine.js` already computed (and that the admin verified in `Comparison_Dashboard`) — DO NOT re-derive player stats. We only change the **team aggregation rule** (no stadium bonus).

---

## 2. Scoring rules (re-stated, NO EDITS YET)

### 2.1 What counts (same as regular league)
- Captain 2x multiplier
- Vice-captain replaces captain if captain didn't play
- Sub-in logic (BENCH → STARTER substitution) — same `effectiveStartingXI` as regular scoring
- Per-player `final_pts` (which itself includes home bonus where applicable)
- Same fantasy positions (GK/DEF/MID/FWD) and same goal/assist/clean-sheet/yellow/red/OG/penalty rules

### 2.2 What does NOT count (the key difference)
- **Stadium Auction +5 bonus is NOT applied** to the team total for H2H or Super Cup matches
- This means: take the sum of `final_pts` for the 11 effective players → that's the team score. No +5 from the owned stadium.

### 2.3 H2H outcome rules
- Higher team score wins → 3 pts in group standings
- Tie → 1 pt each (draw)
- Lower team score → 0 pts (loss)
- **Goal/Assist tiebreaker** only used to determine the Winner column visually (does NOT affect standings points)

### 2.4 Super Cup outcome rules
- Higher team score advances
- Tie → use **total goals + assists** across the 11 effective players as tiebreaker
- Still tied → **coin flip** (random, logged to a separate column)
- Winner advances to next round; loser is eliminated

### 2.5 Lineup source
- Use the EXISTING `Lineup_Rosters` row for the relevant GW (no separate H2H/Super Cup lineup submission)
- Same auto-sub logic (`scoringEngine.js`'s `effectiveStartingXI`) re-applied for these matches

---

## 3. Sheet structure

### 3.1 `H2H_League` tab

The current structure has:
- Rows 1-10: Group A + Group B standings (manual, 0s)
- Rows 13-28: Fixtures (GW3-GW20) with Group A matches and Group B matches side by side

**Recommended restructure** (NO EDITS YET — just the plan):

#### Section A: Standings (rows 1-22)
| Row | Content |
|-----|---------|
| 1 | Title: `H2H GROUP LEAGUE — STANDINGS` |
| 2 | blank |
| 3 | `GROUP A` (merged) | `GROUP B` (merged) |
| 4 | Headers: `Pos, Team, P, W, D, L, GF, GA, GD, Pts` (×2) |
| 5-12 | 8 teams per group, auto-sorted by Pts, GD, GF | 8 teams per group, auto-sorted |
| 13 | blank |
| 14 | `QUALIFICATION STATUS` (auto): `Top 2 of each group → Quarter Finals. Bottom 2 of each group → eliminated.` |
| 15 | (empty) | (empty) |
| 16 | `Top 2 of each group advance to the H2H Knockout Bracket` (note) |

#### Section B: Fixtures (rows 18-32)
| Row | Content |
|-----|---------|
| 18 | Title: `FIXTURES — GW3 to GW20` |
| 19 | Header: `GW, Round, GA1, A1_Score, B1_Team, B1_Score, GB1, …` |

Actually the fixtures are easier to read if each round is ONE row with both groups side by side. Suggested columns:

| GW | Round | Group A Match | Score (A) | Group B Match | Score (B) | Status |

Where "Score (A)" = sum of team A's effective players' `final_pts`, and similarly for B.

Actually the cleanest format given there are 4 matches per group per round = 4 matches × 2 groups × 14 rounds = 112 matches total:

| GW | Round | GA1 | A1_Score | A2 | A2_Score | A3 | A3_Score | A4 | A4_Score | GB1 | B1_Score | GB2 | B2_Score | GB3 | B3_Score | GB4 | B4_Score |

8 matches × 2 columns (team + score) + 2 metadata columns = 18 columns. That fits within A:R.

But this is for a future redesign. **The current sheet is fine** — I just need to add score columns. The minimal-disruption plan is:

- Add columns right after the match name columns:
  - After "Group A Match 1" column: "Score (Team 1)" column
  - After "Group A Match 2": "Score (Team 2)" column
  - ... (8 score columns total)
- That's 8 new columns added to the right of the existing data

Wait, the existing sheet already has the structure:
`[GW, Round, A1, A2, A3, A4, blank, B1, B2, B3, B4]`

That's 10 columns. Adding 8 more score columns would make 18 columns (A through R). Acceptable.

**Simpler alternative**: instead of adding columns, just **append a SCORES section to the right** with a fresh grid:

| GW | Round | Team A1 | Score A1 | Team A2 | Score A2 | Team A3 | Score A3 | Team A4 | Score A4 | Team B1 | Score B1 | Team B2 | Score B2 | Team B3 | Score B3 | Team B4 | Score B4 |

Where each cell is auto-filled. The original fixture text remains intact.

I'll use this approach — append a "SCORES" grid below the fixture grid (rows 30-50 or so).

### 3.2 `Super_Cup` tab

Current structure:
- Row 1: Title
- Row 2: Rule note about no stadium bonus
- Row 3: blank
- Row 4: Headers: `STAGE, Match ID, Home Team, Away Team, Home Score, Away Score, Winner`
- Rows 5-12: 8 R16 matches (M1-M8) in GW5
- Rows 14-17: 4 QF (in GW8)
- Rows 19-20: 2 SF (in GW11)
- Row 22: Final (GW15)

**Recommended additions**:
- Add a `Home Score` column (already there) and a `Away Score` column (already there) — keep
- Add a `Home Team Score` (just the team score) — or rename `Home Score` to be the fantasy team score
- Add a `Tiebreaker` column (shows goals+assists or "Coin Flip" if tied)
- Add a `Status` column (PENDING / COMPLETED)

Actually the existing `Home Score` / `Away Score` are placeholder ("-") — they can be repurposed to be the **fantasy team scores** (sum of effective players' final_pts, NO stadium bonus).

The `Winner` column should be auto-filled with the winning team name (or "TIE — [winner name] (coin flip)" if tied).

---

## 4. Code structure (NEW files only — no edits to existing code)

### 4.1 `server/src/services/h2hScoringService.js` (NEW)

```js
// Exports:
export async function syncH2HLeague(targetGw)
export async function calculateH2HMatchScore(teamName, targetGw)
```

Internal logic:
1. Read `H2H_League` fixtures (rows 14+): get the GW, Group A matches, Group B matches
2. For each match, get the two fantasy team names (e.g., "Aguilas Dorados" vs "Reds")
3. For each team, look up the lineup in `Lineup_Rosters` for that GW
4. Compute `effectiveStartingXI` using the same logic as `scoringEngine.js` (we'll factor this out or duplicate carefully)
5. For each effective player, look up their `final_pts` from `Comparison_Dashboard` (already verified)
6. Sum `final_pts` for all 11 effective players → that's the team score
7. NO stadium bonus added
8. Write the team score to the H2H_League sheet
9. Update group standings (W/D/L/Pts, GF/GA/GD)

**Important**: reuse `calculateApiFootballFantasyPoints` and `calculatePlayerPoints` for individual player score validation, but actually we don't need to recompute — we just read `final_pts` from the already-computed dashboard. The dashboard has `status: VERIFIED` for all 193 rows (admin already verified).

### 4.2 `server/src/services/superCupService.js` (NEW)

```js
// Exports:
export async function syncSuperCup(targetGw)
export async function calculateSuperCupMatchScore(homeTeam, awayTeam, targetGw)
export async function determineMatchWinner(homeScore, awayScore, homeTeam, awayTeam, targetGw)
```

Internal logic:
1. Read the current bracket from `Super_Cup` tab
2. For the current GW, find which matches are scheduled
3. For each match, get the two team names (could be "Winner M1" or actual team name)
4. If a team is "Winner Mx", look up the winner from the prior round (from the Super_Cup tab's `Winner` column)
5. Compute each team's score (same as H2H — no stadium bonus)
6. Determine winner: higher score, or tiebreak by total goals+assists, or coin flip
7. Write the winner back to the Super_Cup tab

### 4.3 `server/scripts/syncH2HSuperCup.js` (NEW)

Single entry point script that calls both `syncH2HLeague(targetGw)` and `syncSuperCup(targetGw)`.

```bash
node server/scripts/syncH2HSuperCup.js 3
```

This is the equivalent of `runScoringSheetsOnly.js 3` but for H2H and Super Cup. It does NOT touch team sheets, Comparison_Dashboard, or staging tabs.

### 4.4 Helper extraction (FUTURE — not in this PR)

The `effectiveStartingXI` logic in `scoringEngine.js` is currently tightly coupled to per-team GW score. For H2H/Super Cup we need the same logic. Options:
- Option A: Extract `getEffectiveStartingXI(lineupRows, fixtureRows)` into a shared utility (`server/src/services/lineupUtils.js`) — minimal refactor
- Option B: Duplicate the logic in `h2hScoringService.js` and `superCupService.js` — simpler, less risk

**Recommend Option A** but ship with Option B for the first PR (less risk of breaking the regular scoring engine). Refactor in a follow-up.

---

## 5. Data sources (already exist, no edits)

| Tab | Purpose | Read by |
|-----|---------|---------|
| `Lineup_Rosters` | Team lineups per GW | H2H, Super Cup |
| `Comparison_Dashboard` | Verified `final_pts` per player per GW | H2H, Super Cup |
| `H2H_League` | Group fixtures + standings | Write target |
| `Super_Cup` | Knockout bracket | Write target |
| `SofaScore_Staging`, `API_Football_Staging` | NOT needed (we read verified pts from dashboard) | — |

---

## 6. Implementation plan (in order)

### Phase 1: H2H scoring (smallest scope first)
1. Read the current `H2H_League` tab to understand the exact layout
2. Build `server/src/services/h2hScoringService.js` with `syncH2HLeague(targetGw)`
3. Build `server/scripts/syncH2HSuperCup.js` (or split into two scripts: `syncH2H.js` and `syncSuperCup.js`)
4. Test with a single GW (e.g., GW3) — verify match scores and standings updates
5. Backfill by running for all played GWs (GW3-current)

### Phase 2: Super Cup scoring
1. Build `server/src/services/superCupService.js` with `syncSuperCup(targetGw)`
2. Handle the "Winner Mx" propagation logic
3. Test with GW5 (R16) — verify winners advance
4. Run through subsequent rounds (GW8 QF, GW11 SF, GW15 Final)

### Phase 3: Tiebreaker and edge cases
- Goals+assists tiebreaker computation
- Coin flip logging (random, deterministic based on GW number so it's reproducible)
- Empty lineup handling (if a team didn't submit)

### Phase 4: Trigger integration
- Decide: manual run via script, or hook into `runScoringSheetsOnly.js` to auto-run after regular scoring?
- I recommend **manual run** for now (admin trigger) — keeps the new code independent of any bugs in the existing scoring flow

---

## 7. What's NOT in this plan

- **Stadium bonus application** — explicitly EXCLUDED for H2H/Super Cup (per your rule)
- **Modifying existing team sheets** — none of the 16 team sheets are touched by H2H/Super Cup scoring
- **Touching `Comparison_Dashboard`** — we READ from it, not write to it
- **Touching any staging tab** — we don't need raw stats; we use verified `final_pts`
- **Backfilling past GWs** — will be done after Phase 1 works correctly, by running for each GW in sequence
- **Public-facing UI** — this is admin-only operations

---

## 8. Open questions for you (to confirm before I start coding) — ✅ CONFIRMED

1. **H2H tie**: scores equal → **1 pt each** (draw) ✅
2. **H2H league ends at**: group stage + **knockout after** (top X of each group → knockout bracket) ✅
3. **Super Cup tiebreaker**: **manually determined by admin** (a cell for typing the winning team name), no code/automation needed ✅
4. **Coin flip**: **NOT USED** — admin manually picks the winner via the cell ✅
5. **Lineup source**: H2H/Super Cup use the **SAME lineup from `Lineup_Rosters`** for the match's GW ✅
6. **All 16 teams in Super Cup R16**: **YES, 8 matches × 2 teams = 16 teams** ✅
7. **Tiebreaker in H2H**: N/A (ties give 1 pt each, no tiebreaker needed) ✅
8. **Match score calculation**: captain 2x, vice-captain sub, BENCH auto-sub — all apply the same as regular scoring ✅

---

## 9. Files to be created (when you give go-ahead)

| Path | Purpose |
|------|---------|
| `server/src/services/h2hScoringService.js` | H2H match scoring + standings + knockout bracket |
| `server/src/services/superCupService.js` | Super Cup match scoring + bracket advancement |
| `server/scripts/syncH2H.js` | Manual H2H scoring trigger (one GW or all) |
| `server/scripts/syncSuperCup.js` | Manual Super Cup scoring trigger (one GW or all) |
| `docs/h2h-supercup-plan.md` | This document |

### Usage

```bash
# Score H2H for a single GW
node server/scripts/syncH2H.js 3

# Score H2H for all played GWs (backfill)
node server/scripts/syncH2H.js --all

# Score Super Cup for a single GW
node server/scripts/syncSuperCup.js 5

# Score Super Cup for all played GWs
node server/scripts/syncSuperCup.js --all
```

## 10. Files NOT to be modified

- `server/src/services/scoringEngine.js` (regular scoring — unchanged)
- `server/src/services/dashboardService.js` (dashboard build — unchanged)
- `server/src/services/stadiumService.js` (stadium auction — unchanged)
- `server/src/services/sofaScoreSyncService.js` (SofaScore sync — unchanged)
- `server/src/services/apiFootballSyncService.js` (AF sync — unchanged)
- Any of the 16 team sheets
- `Comparison_Dashboard` tab (we READ from it)
- Any staging tab
- `Lineup_Rosters` tab (we READ from it, never write)

---

## 11. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| `effectiveStartingXI` logic duplication introduces bugs | Ship with Option B (duplicate); refactor in a follow-up PR |
| Old Super Cup matches with no scores get overwritten by mistake | Add a `STATUS` column; only auto-fill `PENDING` matches. Manual winner cells (`M1_AW` or `Winner` cell) are never overwritten. |
| Admin wants to manually override a winner | Admin can type directly into the `Winner` column for any match. If the script sees a non-empty `Winner`, it skips that match (unless `--force` flag). |
| Schedule mismatch (H2H match scheduled for a GW that hasn't been played yet) | Skip matches where either team has no verified `final_pts` for that GW. Log "PENDING DATA" status. |
| Multiple H2H matches per GW across two groups | The script processes all 4 Group A + 4 Group B matches per GW in a single pass. Writes per-fixture scores to dedicated columns to the right of the existing fixture text (so we don't overwrite anything). |
| Knockout bracket propagation (Winner M1 → QF1) | After each GW's Super Cup matches are scored, find any cells containing "Winner Mx" in the next round's Home Team / Away Team columns and replace with the actual winner name. This MUST be idempotent (running it twice doesn't break anything). |
| H2H group stage doesn't end → top 2 of each group advance → knockout | We need a separate `H2H_Knockout` structure. The simplest approach: when group stage GWs (3-20) are done, compute top 2 of each group and write the knockout bracket as a NEW section in the same `H2H_League` tab. This is a one-time operation per season. |
| Admin wants to lock a match result (e.g., admin already typed `Winner: Reds` for an H2H match in a previous season) | Add a `STATUS` column. If status is `LOCKED`, skip. |

---

## 12. Knockout bracket structure (H2H League, after group stage)

Top 2 of each group (4 teams) → Semi Finals → Final. Structure:

```
SEMI FINALS (GW22)
  SF1: A1 vs B2
  SF2: B1 vs A2

FINAL (GW24)
  F1: Winner SF1 vs Winner SF2
```

(Quarter finals would be needed for 8 teams, but with 4 advancing, we can go straight to SFs.)

Write this as a new section in the H2H_League tab, BELOW the existing group stage data:

| Section | Row | Content |
|---------|-----|---------|
| Title | 35 | `H2H KNOCKOUT BRACKET` |
| Headers | 36 | `STAGE, Match, Home, Score (H), Away, Score (A), Winner, Status` |
| SF1 | 37 | `SEMI FINAL (GW22), SF1, A1, -, B2, -, -, PENDING` |
| SF2 | 38 | `SEMI FINAL (GW22), SF2, B1, -, A2, -, -, PENDING` |
| Final | 39 | `FINAL (GW24), F1, Winner SF1, -, Winner SF2, -, -, PENDING` |

When the knockout matches complete, populate `Score (H)`, `Score (A)`, `Winner` (admin can also type manually).

---

## 13. Super Cup tiebreaker column

Add a `TIEBREAKER_NOTE` column to the Super_Cup tab (next to `Winner`). Format:

- Empty if no tiebreaker needed
- `Admin chose: <team_name>` if admin manually picked the winner (no coin flip)

The script will:
- Compute scores
- If `Winner` column is already filled (admin override), skip the match
- If scores are equal AND `Winner` is empty, log "TIE — admin to decide" and DON'T auto-fill the winner
- Admin types the winner manually

This makes the tiebreaker fully manual, no code, no coin flip.

---

## 14. Data flow (visual)

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Lineup_Rosters   │    │ Comparison_      │    │ H2H_League tab    │
│ (per team, GW)   │───▶│ Dashboard         │───▶│ (scores +         │
│                  │    │ (verified pts)    │    │  standings)       │
└──────────────────┘    └──────────────────┘    └──────────────────┘
                                                       ▲
                                                       │ write
                                                       │
                                              ┌──────────────────┐
                                              │ h2hScoring        │
                                              │ Service.js        │
                                              └──────────────────┘

(Same for Super_Cup with superCupService.js)
```

**Key**: We NEVER recompute `final_pts`. We only:
1. Look up which 11 players are "effective" (same logic as regular scoring)
2. Sum their already-verified `final_pts` from `Comparison_Dashboard`
3. No stadium bonus added

This guarantees the H2H/Super Cup scores always match the regular league scores (just without the +5 stadium).

