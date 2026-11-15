# Player Position & Scoring Authority Architecture

## Overview
This document specifies the authoritative data sources, alias resolution hierarchy, and fantasy scoring rules for the Fantasy Fortress platform across all match data providers (`SofaScore` and `API-Football`).

---

## 1. Player Position Source of Truth
In fantasy football scoring, fantasy points (especially Clean Sheets and Goals) depend strictly on the player's **fantasy registration position**, not where the manager deployed them on the pitch for a single match (e.g. a nominal forward playing as a temporary wingback must NOT be awarded defender clean sheet points).

### Hierarchy of Position Resolution
When syncing match data from external providers:
1. **Master Registry (`Players!D`)**: The primary source of truth for all registered players in the tournament.
2. **Reverse API ID Lookup (`Player_ID_Mappings`)**: Links provider IDs (`api_football_id`, `sofascore_id`) back to the canonical player in the master registry.
3. **Abbreviated Alias Resolution**: Many provider APIs truncate first names (e.g., `M. Sels`, `D. Udogie`, `M. van de Ven`). These are resolved using first initial + surname matching disambiguated by club.
4. **Same-Club Substring / Mononym Match**: Single-token names (e.g., `Jair` on Nottingham Forest) match against multi-token canonical names (`Jair Cunha`).
5. **Same-Club Fuzzy Match ($\ge 0.80$)**: Matches diacritic or minor spelling discrepancies within the same club.
6. **Global Fuzzy Match ($\ge 0.88$)**: Resolves spelling variations when club metadata is missing or mismatched.
7. **Live Provider Position Fallback**: Used only if all lookups fail (`G` $\to$ `GK`, `D` $\to$ `DEF`, `M` $\to$ `MID`, `F` $\to$ `FWD`). A diagnostic log is emitted whenever a player with $\ge 60$ minutes falls back to live position.

### Transfermarkt ID Status
Transfermarkt ID (`tm_id`) in Column A of the `Players` and `Player_ID_Mappings` sheets was historically used during database seeding but is **NOT used on the live scoring or sync hot path**. Position resolution is handled strictly by the hierarchy above.

### Implementation Reference
The 7-tier resolution above is implemented in `resolvePlayerDetails` at `server/src/services/rosterValidator.js:491` (with a `resolvePlayerPosition` wrapper at L654). Tier 1 alias overrides are stored in the `Player_Aliases` Google Sheet (columns: `alias_name`, `alias_source`, `canonical_name`, `club`), which is auto-created with header if missing by `apiFootballSyncService.js:195-225`. To extend the alias list, add rows to the `Player_Aliases` sheet; the next sync will pick them up.

---

## 2. Clean Sheet Rules
A player receives clean sheet fantasy points (`isCleanSheet = true`) if and only if:
1. The player's fantasy position is `GK`, `GKP`, or `DEF`.
2. The player played **at least 60 minutes** on the pitch (`minutes >= 60`).
3. Opponents scored **0 goals while this player was physically on the pitch** (`oppGoalsOnPitch === 0`).
4. **Authoritative Score Safety Net**: If the player played the full match (or was not substituted off) and their team conceded $\ge 1$ goal according to the authoritative full-match score, `isCleanSheet` is strictly `false`.
5. **Subbed-Off Starter Guard**: If a starter was substituted off early ($< 85$ mins) but the provider events feed omitted the substitution event, their on-pitch window is derived as `playerEnd = Math.min(90, start + minutes)` to prevent attributing late conceded goals to them.

---

## 3. Comparison Dashboard & Verification
The `Comparison_Dashboard` reconciliation engine aggregates match points per player:
- **Auto-VERIFIED**: Both providers agree 100% on total points (`sofascore_pts === api_football_pts`).
- **DISCREPANCY**: Providers differ, leaving `final_approved_pts` **STRICTLY BLANK** for admin review.
- **Double Gameweek (DGW) Dynamic Invalidation**: When Match 2 of a DGW is ingested, if provider points change from Match 1, any previously auto-verified score is automatically invalidated to reflect the latest cumulative total.
- **Goalkeeper Protection**: In `findMatchInList`, outfield players (`DEF`, `MID`, `FWD`) can never be matched against Goalkeepers (`GK`).

---

## 4. Club Canonicalization
To ensure consistent matching across match fixtures, player statistics, and tournament lineups across providers:
- **Source of Truth for Club Names**: `MASTER_TOP5_CLUBS` exported from `fixtureService.js` and imported into `dashboardService.js` covering all 5 top European leagues (Premier League, La Liga, Serie A, Ligue 1, and Bundesliga).
- **Canonicalization Bridge**: `getCanonicalClubName(rawClub)` in `fixtureService.js` canonicalizes raw or truncated provider club names to their authoritative master name.
- **Low-Level Normalizer**: `cleanClubName()` in `rosterValidator.js` strips sponsorship prefixes, suffixes, and extraneous tokens.
- **Single Source of Truth**: `MASTER_TOP5_CLUBS` is centrally defined in `fixtureService.js` and imported directly by consumers.
- **Auditing Tool**: `node server/scripts/checkUnknownClubs.js` scans `Fixture_Staging` to detect unknown, misclustered, or unverified clubs against `MASTER_TOP5_CLUBS`.

