Fantasy Fortress — Player Card: Fixture OR Points (with DGW split)
Plan only. No code changed. For the builder agent to implement in the
frontend only. Do this after the loading fix lands, in a separate change,
so the two do not collide.
0. The idea, as agreed
One bottom block per player card. It shows either the fixture or
the points — never both squeezed side by side.
Match hasn't happened: the full block shows the fixture.
Points exist (after the nightly sync): the full block shows the points.
No time in the block. Fixture is just opponent code + H/A.
  Example: ARS H, not ARS (H) • Sat 18:30.
This is the FPL lesson: a card is photo + name + one thing in the bottom
block. The current split bar [ FIXTURE | POINTS ] in
client/src/components/fantasy/PlayerCard.jsx is the noise to remove.
1. What the code can already do (verified)
client/src/data/live.js — opponentLookup (fixtures for the GW):
  returns opponent code, venue (home / away), fixture status,
  kickoff, fixtureCount, allScheduled, hasLive, allFinished.
toCard in the same file sets yetToPlay: Boolean(opponent?.allScheduled)
  — true only if every fixture for that player's club is still SCHEDULED.
  PlayerCard already uses it to show YTP instead of a number, and the
  list view in TeamView.jsx does the same.
Double gameweeks are already detected from the fixture list, never from
  the total: fetchPlayerDetail uses clubFixtures.length === 2
  (live.js), and the player modal already has Match 1 / Match 2 tabs
  driven by match_breakdown.
toCard in the local clone (pre-loading-fix) already stores
  matchBreakdown: row.match_breakdown ?? null, but **do not rely on
  that after the loading fix** — see §2. After the loading fix,
  fetchAllPlayerStats no longer selects match_breakdown at boot,
  so toCard must get it from the on-demand query in §2 instead.
Fixture statuses in the DB (server/supabase_schema.sql, fixtures
  table): `SCHEDULED, LIVE, FINISHED, POSTPONED, CANCELLED, ABANDONED,
  AWARDED, VOID, SUSPENDED. match_date` is on the same table.
2. ⚠️ Critical dependency — the loading fix removed match_breakdown from boot
Do not undo the loading fix to build this plan.
In the loading fix (Phase 4 of
Fantasy-Fortress-loading-fix-plan.md), fetchAllPlayerStats was
changed to drop points_breakdown and match_breakdown from the boot
select, and to fetch them on demand only when a player detail /
breakdown view is opened. That is what makes cold boot fast: the boot
query no longer carries those two JSON columns for every row of every
gameweek.
The DGW split in §4 of this plan needs match_breakdown — but only
for one team, one gameweek, on the team page. So:
**Do NOT put match_breakdown back into the global boot query
(fetchAllPlayerStats).**
Instead, fetchTeamSquad(teamName, gw) fetches it on demand, only
for that team's 15 players for that gameweek:
// Lightweight on-demand query: 15 rows only
supabase.from('player_gameweek_stats')
  .select('player_name, match_breakdown')
  .eq('team_name', teamName)
  .eq('gameweek', gw)
Then merge those 15 rows by player_name into the cards toCard
builds, so PlayerCard gets the exact breakdown data it needs for
the DGW split without touching boot speed. If that query fails or a
player has no match_breakdown row, that player falls back to the
"breakdown pending" behaviour in §3 — fixture or —, never an
invented split.
This also applies to the player modal: fetchPlayerDetail already
fetches breakdowns on demand for one player; keep that path, do not
route it through the boot cache.
Acceptance for this section, in addition to §7: the boot
player_gameweek_stats request still has no
points_breakdown / match_breakdown columns and is still filtered
to one gameweek; cold-load time to table does not regress vs the
loading-fix numbers; opening a team page issues one extra small
query (15 rows) and no more.
3. The card state machine (single-fixture week)
Derive one state per card from the fixture status + the stats row.
Do not use final_points === 0 on its own — 0 can mean played badly,
didn't play, or hasn't played yet.
State
Condition
Full block shows
Yet to play
All fixtures SCHEDULED
Fixture, full width: ARS H
Played
All fixtures FINISHED, minutes > 0
Points, full width, big: 7
Live
Any fixture LIVE
LIVE (points only if a synced total exists; do not show 0 as if final)
Didn't play
All fixtures FINISHED, minutes === 0
— greyed out, not 0
Postponed / no fixture
Any fixture POSTPONED / CANCELLED, or no fixture for the club that GW
PPD / — greyed out, not 0
Breakdown pending
Fixture FINISHED but no match_breakdown / no stats row yet
Keep the fixture, or —. Never invent a split or a score from the aggregate total.
Notes:
Points only appear after the nightly sync (4:30 AM IST). On match day
  the card correctly shows the fixture all day, then flips to points the
  next morning. This is not live scoring — do not build a live feed
  into this change.
A player with no player_gameweek_stats row for that GW does not
  appear in the squad at all today, because the squad is built from
  stats rows, not from lineups. If a yet-to-play player is missing
  entirely, that is a data gap, not a card-state bug — record it in
  testing, do not fake a card for a player with no row.
Captain / vice-captain badges stay where they are (on the photo).
  The bottom block must be self-contained: a reader looking only at
  the block must be able to trust the number without looking up at
  the photo to decode it. That is why the multiplier is shown in the
  block itself for captains (see §5).
4. Double gameweek — the split block
A DGW keeps the split form, but the split is between the two matches,
not between fixture and points.
4.1 The three states
State
Left half
Right half
Both yet to play
Fixture 1: ARS H
Fixture 2: CHE A
Match 1 done, Match 2 to go
Points for Match 1
Fixture 2: CHE A
Both done
— collapses to one full block —
Total: final_points, full width
Order the two matches by kickoff (match_date), not by fixture-list
order. Halves are in chronological order, left = first match.
4.2 Will it fit? Yes — checked against the CSS
Card width: clamp(62px, 15.6vw, 70px) in client/src/index.css.
Bottom bar height: 21px. Current grid is 1.25fr / 1fr.
For a DGW, change the bar to 1fr / 1fr — each half ~31–35px.
Fixture half at the current 8.5px font: ARS + the 11px H chip
  is ~30px. Fits.
Points half at 12.5px: 7 or 12 is ~16px. Fits easily.
What does not fit: vs, a full club name, a time, or a scoreline.
Keep each half to code + H/A only, or a number only. That is exactly
why the time was dropped from the block.
For a single-fixture week the full block has room to spare — the
points font can be bumped up slightly there, since there is no split
to squeeze into.
4.3 What each half shows — the agreed rule (frontend display only)
The halves show display points, not the raw per-match base points
stored in match_breakdown. This is a frontend-only transformation.
Nothing is saved back: no DB change, no scoring-engine change, no
final_points change, no Comparison Dashboard change.
final_points remains the authority, and the halves must sum to it.
Why this is the right source of truth to display:
The stored per-match figure in match_breakdown is base points
  only: totalPoints is the per-match pts, with multiplier: 1
  and stadiumBonus: 0 hardcoded
  (server/src/services/scoringRules.js, buildMatchBreakdown).
  The comment there is explicit: the captain multiplier and the
  stadium bonus apply to the gameweek total, not to a single fixture.
The final total is computed once, at GW level, in
  server/src/services/scoringEngine.js:
  finalPts = (pData.pts + playerStadiumBonus) * multiplier
  where pData.pts is the sum of the per-match base points.
A normal single-week card already shows the doubled total
  (final_points), not the base — e.g. a captain shows 4, not 2.
  Showing DGW halves as base points would be inconsistent with what
  the card already does every other week.
Formula, per match, computed in the frontend (live.js, when building
the card — not in PlayerCard rendering):
displayPoints(match) = (basePoints(match) + stadiumBonusAllocatedTo(match)) * multiplier
basePoints(match) = that match's totalPoints from match_breakdown.
multiplier = the row's multiplier (2 for the effective captain,
  1 otherwise). Use the stored row value, not the badge, so a
  handed-over captain (VC inherited) is handled the same way.
stadiumBonusAllocatedTo(match) = the row's stadium_bonus, added
  to the home match only, and 0 for the other match. The bonus was
  earned at home (it is computed from home-match goals / assists /
  clean sheet / saves in the scoring engine), so attributing it to the
  home fixture is the honest allocation, and it is what makes the
  halves sum to final_points.
Worked example — captain, base 7 + 5, stadium bonus +1:
Home half: (7 + 1) × 2 = 16
Away half: 5 × 2 = 10
Halves: [ 16 | 10 ], sum 26
Collapsed full block: 26 with ×2 shown (see §5)
Without a stadium bonus the same captain is [ 14 | 10 ] = 24.
A non-captain is [ 7 | 5 ] = 12, unchanged.
If the stadium bonus is negative (e.g. a red card at home), the same
formula applies: add the negative bonus to the home half before
multiplying. Do not drop a negative bonus from the halves and leave
it only in the total.
Edge cases:
If both matches were at home (rare), do not guess a split for the
  bonus — put the whole bonus on the first home match and note it in
  the code comment, or fall back to showing the bonus only in the
  final block. Do not split it arbitrarily.
If a match's breakdown is missing after its fixture is FINISHED,
  that half stays as the fixture or shows —. Never derive a
  per-match figure by splitting the aggregate total.
If a player has 0 minutes in a finished match, that half shows —,
  not 0 (same DNP rule as §3). A 0 in a half means he played and
  scored nothing.
If the captain did not play Match 1 but plays Match 2, the
  multiplier still applies at GW level as stored on the row — do not
  re-decide captaincy per match in the frontend.
4.4 The collapse
Collapse to one full block only when all fixtures are FINISHED
and the aggregate final_points is available. The collapsed block
shows final_points, not the sum of the halves — they should agree
by the formula in §4.3, but final_points is the authority if they
ever disagree. If they disagree in testing, that is a bug to report,
not a rounding difference to hide.
5. Captain ×2 in the final block
The C badge on the photo is not, on its own, enough for a DGW —
because the split halves invite the reader to add them up, and
7 + 5 is not 24. The reader would have to notice the C, remember
×2, and do the multiplication in their head, and the badge is a long
way from the number they are checking.
So in the collapsed full block, for a captain, show the multiplier
next to the total: 24 ×2. That fits — about 30px at the current
sizes. The C badge stays as the backup signal, not the only signal.
For a stadium bonus, the same principle applies: if stadium_bonus
is non-zero, the final block should carry a small marker (the bolt
already used on the card, or +1 / −1) so the total is explainable
from the block itself. Do not rely on the bolt on the photo alone.
6. What to change (frontend only)
client/src/data/live.js — opponentLookup: return the full
   fixture list for the club in this GW (in kickoff order), each with
   code, venue, status, fixtureId, match_date — not just the first
   fixture. Keep the existing single-opponent shape working for
   callers that only need the first fixture.
client/src/data/live.js — fetchTeamSquad / toCard: fetch
   match_breakdown on demand for this team + GW only, as in §2
   (15 rows, player_name, match_breakdown, `.eq('team_name',
   teamName).eq('gameweek', gw)), merge it by player_name` into the
   cards, and build a per-match display list for the card (fixture +
   per-match display points, §4.3), matched by fixtureId between the
   fixture list and match_breakdown (the same matching the modal
   already does in normalizeMatches — match by fixtureId, never by
   index, because the engine and the fixture list can order a DGW
   differently). Keep yetToPlay / allScheduled / allFinished /
   hasLive available on the card. Do NOT add match_breakdown back
   to fetchAllPlayerStats.
client/src/components/fantasy/TeamView.jsx: pass the per-match
   list (and matchBreakdown) through to PlayerCard. No change to
   the squad totals — GW total, previous GW, season total and
   playedCount are unchanged.
client/src/components/fantasy/PlayerCard.jsx: replace the
   [ FIXTURE | POINTS ] split bar with the state machine in §3
   (full block) and §4 (DGW split, 1fr / 1fr, collapsing to a full
   block when both matches are done). Remove the small i icon
   while touching this card — it was already flagged as noise and it
   competes with the C/VC badge.
client/src/components/fantasy/PlayerModal.jsx: apply the same
   display-points formula to the Match 1 / Match 2 tabs, so tapping a
   card never contradicts the pitch. The modal's points ledger keeps
   its existing shape (base lines + multiplier line at the total) —
   do not change the ledger, only the per-match tab figures, and make
   clear in the tab which figure is shown if the ledger and the tab
   use different conventions.
client/src/index.css: DGW split grid 1fr / 1fr; full-block
   styles for fixture vs points; ×2 / stadium marker in the final
   block; keep the existing card width (62–70px) — do not widen
   cards to make the split fit, or the pitch will overflow a phone
   screen again.
Out of scope for this change:
No backend, Render, Supabase, scoring-engine, or schema change.
No live scoring — points still flip after the nightly sync.
No change to the list view's per-row points (it keeps showing the
  aggregate total, not a split). If the list view is touched later,
  it follows the same state machine.
No change to the GW header / playedCount logic, except that a
  partially-played DGW player counts as played (minutes > 0 or
  points > 0, as today) — the header does not need a "1 of 2 played"
  state for this change.
7. Acceptance criteria
Single week, yet to play: full block shows ARS H, no points, no 0.
Single week, played: full block shows the points big, no fixture.
Single week, didn't play: full block shows —, not 0.
DGW, both yet to play: split shows both fixtures, ARS H | CHE A.
DGW, one done: split shows Match 1 display points + Match 2 fixture.
DGW, both done: one full block with final_points and ×2 for a
  captain. Halves sum to the final total in every tested case,
  including a captain with a stadium bonus.
Pitch card and player modal agree on every per-match figure for the
  same player and GW.
No match_breakdown → no invented split; the half stays as fixture
  or —, and the modal says "Match breakdown pending" as today.
The XI + bench still fit on one phone screen; no horizontal overflow;
  no card wraps or truncates a fixture code or a two-digit points total.
All scores unchanged: GW total, previous GW, season total, and every
  player's final_points are identical before and after this change.
  This change is display-only — verify by comparing the totals on the
  live Vercel URL before and after, on a GW with a DGW player if one
  is available, otherwise on a normal GW plus a fixture-only check.
8. Test cases for the builder
Use a real DGW if one exists in the data; otherwise construct the
cases from the state table in §3–§4 with a test GW and verify each
transition after a sync:
Normal player, single fixture, yet to play → fixture full block.
Same player after the sync → points full block, same total as before.
Player who did not play (0 minutes, fixture finished) → —.
Postponed fixture → PPD, not 0.
DGW non-captain, base 7 + 5, no bonus → [ 7 | 5 ] → 12.
DGW captain, base 7 + 5, no bonus → [ 14 | 10 ] → 24 ×2.
DGW captain, base 7 + 5, stadium bonus +1 (home match first) →
   [ 16 | 10 ] → 26 ×2.
DGW captain, stadium bonus on the away match in the data (should
   not happen — bonus is home-only) → report it; do not silently
   allocate it to the away half.
DGW, Match 1 breakdown missing after Match 1 finished → left half
   stays fixture / —, right half fixture. No invented number.
Bench DGW player and auto-subbed player — same rules as starters.
Cold load on the live URL: first try, no "Try again" (loading-fix
    behaviour must not regress).
9. Open point already decided
No time in the block (agreed 17 Nov 2026).
Halves show display points (doubled for a captain, stadium bonus
  folded into the home match), not raw base points (agreed 17 Nov
  2026, after the frontend-only discussion). The backend's stored
  per-match figures stay base-only; the frontend derives the display
  figures and the modal uses the same derivation.