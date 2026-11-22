# Fantasy Fortress — Player Modal: Points Breakdown Redesign

**Date:** 20 Nov 2026
**Repo:** https://github.com/Jineshraj/Fantasy-Fortress
**HEAD checked:** `1301a2c` — "style(card): straighten cards, remove 3D shadows, and tune mobile typography"
(local clone fast-forwarded to `origin/main` for this audit)
**Scope:** the player modal only — `PlayerModal.jsx`, plus one
small data addition in `live.js` (kickoff, §5). No scoring,
sync, or backend change. `final_points` stays the authority.
**Method:** code audit only, at `1301a2c`. No live browser
test, no screenshot supplied — the "weird" is verified from
the code, and §1 names the exact rows so the builder can
reproduce it in one tap.

## Builder instruction — apply this, nothing else in this file

Apply §3–§6 as written: filtered stat lines only, Base
points subtotal, stadium bonus only when non-zero, captain
as a formula line only when ×2, fixture line(s) under the
hero for every state, per-match filtered lines in the DGW
tabs, season total in the hero. One `live.js` change only:
add `kickoff: f.kickoff` to the match shell (§6, step 2).
Do not change any scoring rule, rate, or total — `final_points`
stays the authority and every total must be identical before
and after. Do not invent a stadium-bonus reason, a per-match
split, or stat lines when the breakdown is pending.
Verify with `npm --prefix client run build`, then check the
acceptance checklist at the end on the live Vercel URL.

Note: the pitch-row spacing fix the user mentioned is **not
on the remote yet** — `origin/main` is still `1301a2c` at the
time of this audit. If it lands before this work starts, pull
latest first; the modal files it touches are different
(`PlayerModal.jsx` / `live.js`), so the two changes should
not collide.

## Verdict — you are right, and the weirdness is specific

The modal today shows a **12-row ledger** for every played
player, and **8 of the 9 stat rows are usually zeroes**.
It then adds a stadium bonus row even when the bonus is 0,
a "Multiplier" row even for a non-captain (1x), and a total
that does not add up from the rows above it when the player
is a captain. There are two different things both called
"Bonus". And for a single-fixture week the modal shows **no
fixture at all** — no opponent, no home/away, no score, no
kickoff — even though that data is already fetched.

Your order is the right structure. The rest of this report
is: what is weird now (§1), what the data already supports
(§2), the exact new structure with worked examples (§3),
and the extra things worth showing that you asked about
(§4–§5).

## 1. What is weird now

`PlayerModal.jsx:30-80` (`buildLedger`) + `LABELS` (`:12-26`),
rendered at `:238-264`. The server sends 9 itemized lines
(`scoringRules.js: buildPointsBreakdownItems`), and the
modal renders **all 9, every time, in server order, including
the zeroes**:

| Row today | What it shows for a typical player | Why it is weird |
|---|---|---|
| Minutes | `90'` → +2 | Correct figure, wrong name — this *is* the appearance points, but it is labelled "Minutes". A user looking for "appearance" does not find it. |
| Goals | `0` → +0 | Shown even when he scored nothing. |
| Assists | `0` → +0 | Same. |
| Clean sheet | `0` → +0 | Same — and for a MID/FWD this row is *always* +0 by rule (see §2), so it can never mean anything for them. Value is `1`/`0`, not a word. |
| Bonus | `—` → +0 | This is the **hat-trick bonus**, but it is labelled just "Bonus" — see the next row. |
| Cards | `0Y 0R` → +0 | Shown even with no cards. |
| Own goals | `0` → +0 | Same. |
| Penalty save | `0` → +0 | Same. |
| Penalty miss | `0` → +0 | Same. |
| Stadium bonus | (blank) → +0 | **Always** appended, even when the bonus is 0. |
| Multiplier | (blank) → `2x` / `1x` | **Always** appended, even for a non-captain. And it is not a points figure — the points column shows `2x`, so the column stops meaning "points". |
| Total | `final_points` | Correct, but see the arithmetic below. |

A player who did nothing but play 90 minutes — the most
common case in the app — gets a 12-row ledger to say "+2".
That is the wall of zeroes you are seeing.

**The arithmetic does not add up.** The stat lines sum to
`base_points`. Then the ledger adds the stadium bonus as if
it were another stat line, then shows the multiplier as if
it were another points figure, then the total. For a captain
with base 7 and bonus +1: rows read 7, +1, `2x`, total 16.
Adding the rows gives 10, not 16 — because the real formula
is `(base + bonus) × multiplier`, and the ledger never shows
it. A user who checks the maths concludes the modal is
wrong. It is not wrong; it is laid out wrong.

**Two things called "Bonus".** The hat-trick line is
labelled `Bonus` and the stadium line is labelled `Stadium
bonus`. A captain with a hat-trick and a stadium bonus has
two bonus rows and no way to tell which is which without
reading the values.

**No fixture — single gameweek.** The hero shows club,
position, name, and `GW {week} total`. The fixture (opponent,
home/away, score, kickoff) is shown **only** inside the DGW
tabs (`:286-381`), and there only as "Home vs X" + the score.
For a normal single-fixture week there is no fixture line
anywhere in the modal, even though `detail.gameweek.matches[0]`
already carries opponent, venue, result, and status
(`live.js:646-689, 843-856`). The one thing missing from
that object is the kickoff — see §5.

**DGW tabs show a truncated breakdown.** Each tab shows
only Minutes, Goals, Assists, and Match points
(`PlayerModal.jsx:347-360`). The per-match itemized ledger
(`match.breakdown`, merged in `live.js:646-689`) is already
fetched and never rendered. So the DGW view is *less*
detailed than the single-GW view, for the weeks where the
detail matters most.

**Yet-to-play gets a junk ledger.** For a player whose
fixtures are all SCHEDULED, `base_points` is null and the
breakdown is unavailable, so the modal falls back to
`Base points (server) —`, `Stadium bonus +0`, `Multiplier
1x`, `Total —`, plus a small "Yet to play" note in the hero.
The fixture — the only thing that matters for that player
this week — is not shown, and the ledger is four rows of
nothing.

**Subbed-out players get a ledger that contradicts its own
total.** An `AUTO_SUB_OUT` player keeps his real base
points in the ledger (the engine stores them, `scoringEngine.js:
1090-1116`), but his `final_points` is 0 — his points were
replaced by the sub-in. The modal shows base lines summing
to, say, 6 and a total of 0, with no line explaining why.
The OUT chip is in the hero, but nothing in the ledger says
"these points did not count".

## 2. The data already supports your design — no new backend needed

The scoring table, `server/src/services/scoringRules.js:
48-101` (`buildPointsBreakdownItems`), one rule table for
both the total and the ledger, so they cannot drift:

| Stat | Points |
|---|---|
| Appearance | ≥60' → +2, 1–59' → +1, 0' → 0 |
| Goals | GK 10, DEF 6, MID 5, FWD 4 (per goal) |
| Assists | GK 5, others 3 (per assist) |
| Clean sheet | GK 5, DEF 4, MID/FWD 0 — only if ≥60' and the team kept a clean sheet while he was on the pitch (AGENTS.md §2) |
| Penalty save | +5 each |
| Penalty miss | −3 each |
| Own goal | −2 each |
| Yellow card | −1 each |
| Red card | −3 — **and it replaces the yellow deduction, it does not add to it** (`cardsPts = red ≥ 1 ? −red × 3 : −yellow`) |
| Hat-trick bonus | +3 if ≥3 goals **or** ≥3 assists |

The ledger is published only when its items sum exactly to
`base_points` (`buildPointsBreakdown`, `scoringRules.js:
112-122`). When they do not reconcile, `available` is false
and the client must keep its current fallback: `Base points
(server)` + "Breakdown pending" — **do not invent lines
to fill the gap**. That fallback is good behaviour; keep it.

Formula, `scoringEngine.js:1051-1056`:
`final_points = (base_points + stadium_bonus) × multiplier`.
The stadium bonus is a **team-level** award (one number for
the whole fantasy team that week, from the Stadium Auction
sheet); the multiplier is 2 for the effective captain, 1 for
everyone else. Both are already on the player row
(`stadium_bonus`, `multiplier`), and on `detail`
(`live.js:888-890`).

Already fetched but not displayed in the modal:

- `detail.gameweek.matches[]` — opponent name/code, venue,
  result, status, minutes, goals, assists, clean sheet,
  cards, penalties, per-match `breakdown` array, and
  `displayPoints` (the per-match figure with bonus folded
  into the home match and the multiplier applied,
  `live.js:447-465`).
- `detail.season` — the player's season total for this
  fantasy team (`live.js:873-875`). Computed, never rendered.
- `detail.displayState` / `ccy.handedOver` — OUT/IN/UNUSED
  (already a chip in the hero, `PlayerModal.jsx:172-183`)
  and whether the vice-captain became captain.

## 3. The new structure — your order, exactly

### Order

1. **Fixture** (§4) — above the ledger, not inside it.
2. **Stat lines — only the ones that happened.** A line is
   shown if it contributed: its points are non-zero, or its
   count is non-zero. The one exception is Appearance, which
   always shows when the player played (it is the first
   line and the anchor for the rest). Rename "Minutes" to
   **"Appearance"** and keep the minutes as its value
   (`90'`), so the line reads `Appearance  90'  +2`.
3. **Base points** — a subtotal row: the sum of the stat
   lines. Label it exactly "Base points". This is the row
   that makes the maths checkable.
4. **Stadium bonus — only if non-zero** (`+1` / `−1`). Omit
   the row entirely when it is 0. Do not show a `+0`.
5. **Captain — only if the multiplier is 2.** Not a points
   row. Show it as the formula, e.g. value `(12 + 1) × 2`,
   so the step from base+bonus to total is visible. Label
   it "Captain ×2" (or "Captain (vice-captain handed over)
   ×2" when `ccy.handedOver` is true). Omit it entirely for
   a non-captain — no `1x` row.
6. **Total** — `final_points`, bold, as today. It must equal
   `(base + stadium bonus) × multiplier`, and the builder
   should assert that in the acceptance check (§6), not
   just eyeball it.

### Worked examples (using the §2 table)

**A — Midfielder, 90', 1 goal, 1 assist, 1 yellow, no bonus, not captain:**

| Appearance | 90' | +2 |
| Goals | 1 × 5 | +5 |
| Assists | 1 × 3 | +3 |
| Cards | 1 yellow | −1 |
| **Base points** | | **9** |
| **Total** | | **9** |

Four stat lines instead of nine. The 0-goals / 0-assists /
clean-sheet / own-goal / penalty rows are gone because
nothing happened there.

**B — Defender, captain, 90', 1 goal, clean sheet, stadium bonus +1:**

| Appearance | 90' | +2 |
| Goals | 1 × 6 | +6 |
| Clean sheet | Yes | +4 |
| **Base points** | | **12** |
| Stadium bonus | | +1 |
| Captain ×2 | (12 + 1) × 2 | |
| **Total** | | **26** |

**C — Yet to play:** no ledger at all. Fixture line only
(§4) + the "Yet to play" note already in the hero. Do not
render `Base points —`, `Stadium bonus +0`, `Multiplier 1x`.

**D — Did not play (0'):** one stat line, `Appearance  0'  +0`,
then Total 0. Do not render eight zero rows to say that.

**E — Substituted out, base 6, total 0:** the stat lines
and Base points 6 as normal, then a note row — not a points
row — "Substituted out — points replaced by the sub-in" and
Total 0. The ledger must never show base 6 and total 0
with no explanation between them.

### Line-by-line rules

- **Appearance:** always show when minutes > 0 (value
  `90'`, points +2 / +1 by the §2 threshold). Show as the
  only stat line when minutes are 0.
- **Goals / Assists:** show only when count > 0. Put the
  rate in the value so the maths is verifiable without
  knowing the table by heart: `1 × 6` for a defender's
  goal, `1 × 3` for an assist (GK: `1 × 10` / `1 × 5`).
- **Clean sheet:** show only when it scored — GK/DEF,
  ≥60', clean sheet true, points > 0. Value "Yes". Never
  show it for a MID/FWD (always +0) and never show a
  `Clean sheet 0 +0` row.
- **Penalty save / Penalty miss / Own goals:** show only
  when count > 0. Value is the count.
- **Cards — one row, not two.** Value shows the counts
  (`1 yellow`, `1 red`, `1 yellow, 1 red`), points are the
  single scored figure. This is deliberate, and it is the
  one place your "yellow card, red card" list needs a
  caveat: the engine does **not** deduct the yellow when
  there is a red, so two separate points rows would
  double-count. If the user wants two *lines*, the second
  must show +0 with a note ("yellow not deducted — red
  card applies instead"), which is worse than one honest
  row. Keep one row.
- **Hat-trick bonus:** show only when +3. Label it
  **"Hat-trick bonus"**, never "Bonus". Value is what
  triggered it (`3 goals` / `3 assists`).
- **Stadium bonus:** show only when non-zero. Label
  "Stadium bonus". Do not show the stadium name or the
  reason — that lives server-side (`teamResults.stadium_label`)
  and is **not** on the player row, so the modal cannot
  show it without a new fetch. Showing just the number is
  honest; inventing a reason is not. (Follow-up if wanted:
  carry `stadium_name`/`stadium_label` through to the
  player detail — backend-adjacent, not part of this fix.)
- **Multiplier:** never a points row, never shown for a
  non-captain. Captain only, as the formula in §3.
- **Breakdown pending:** if `pointsBreakdown.available`
  is false, keep today's fallback — `Base points (server)`
  with the base figure, stadium bonus if non-zero, captain
  formula if ×2, total, and the "Breakdown pending" note.
  Do not render stat lines from the aggregate row.

### DGW

- The main ledger is the **gameweek aggregate** (goals,
  assists, etc. summed across both matches) — same
  filtered rules as §3, same base → bonus → captain →
  total.
- Each DGW tab gets the **same filtered stat lines for
  that match** (from `match.breakdown`, which is already
  fetched), plus that match's subtotal — which is
  `displayPoints` (base + home-match bonus, × multiplier).
  Today the tabs show only Minutes / Goals / Assists /
  Match points; the per-match ledger is the missing piece.
- The two match subtotals must sum to the gameweek total.
  (They do by construction in `live.js:447-465` — the
  builder checks it, per §6.)
- Fix the note under the tabs while there: "Match points
  apply the same ×2 multiplier and home stadium bonus as
  the gameweek total" is ambiguous. Say what is true:
  "Match points already include the captain multiplier
  and the home stadium bonus — the two match totals add up
  to the gameweek total."

## 4. The fixture — show it for every week, not just DGW

Add a fixture line (or two lines for a DGW) directly under
the hero, above the ledger, for **every** player state:

- **Finished:** `Home vs Arsenal · FT 2–1` (or `Away at
  Arsenal · FT 1–1`). Use the club the player's real team
  played, H/A from the player's club's perspective, and the
  full-time score — all already in `matches[0].result` /
  `.venue` / `.opponent`.
- **Yet to play / scheduled:** `Away at Arsenal · Sat 14 Feb,
  20:30` — opponent, venue, and kickoff. This is the
  whole modal for a yet-to-play player, so it needs the
  date and time, not just the opponent code.
- **Live:** `Home vs Arsenal · LIVE 1–0 (67')` if a live
  minute is available; otherwise `LIVE 1–0`. Do not show a
  live score as final.
- **DGW:** one fixture line per match, in kickoff order,
  matching the tabs below them (`Match 1` / `Match 2`).
  The tabs already exist — the fixture lines above the
  ledger are the summary, the tabs are the detail.

## 5. What else is important in there

In order of value, all already available except where noted:

1. **Fixture (§4).** The single biggest gap. A breakdown
   without "who did he play, home or away, what was the
   score" is numbers without context.
2. **Season total.** `detail.season` is computed in
   `live.js:873-875` and never displayed. Add it to the
   hero as a small line under the GW total: `Season 74 pts`.
   It is the one number that tells you whether this GW was
   a good week *for this player*.
3. **Sub state, explained (§3, example E).** The OUT/IN
   chip is already in the hero. The ledger must explain
   the consequence (points did / did not count), not just
   repeat the chip.
4. **The per-unit rates in the values (§3).** `1 × 6` for a
   defender's goal, `1 × 5` for a goalkeeper's assist.
   Without them the user has to memorise the §2 table to
   check the modal.
5. **Captain handover.** If `ccy.handedOver`, the hero
   already shows a C — say why in the captain line:
   "Captain (vice-captain handed over) ×2".
6. **A one-line scoring footnote.** The appearance
   threshold is the only rule a user cannot infer from the
   numbers: "Appearance: 1 pt under 60', 2 pts at 60'+".
   One small muted line under the ledger; do not put the
   whole §2 table in the modal.
7. **Keep Last 5.** It is already there and it is useful.
   Do not change it in this fix (it currently includes the
   current GW as its last chip, duplicating the hero total
   — leave that alone unless the builder is already in the
   file and it is a one-line change).

### What not to show

- **Price / ownership / xG / next fixture.** This is a
  tournament app, not FPL — there is no price or ownership
  on the player row, and the modal is about *this* GW.
  Next fixture belongs on the team page, not in a
  breakdown of points already scored.
- **Live minute-by-minute events.** The data is a nightly
  sync, not live — the modal must not pretend otherwise.
- **The stadium name / why the bonus was awarded** (§3) —
  not on the player row; do not invent it.

## 6. Fix order for the builder

1. **`buildLedger` (`PlayerModal.jsx:30-80`) + `LABELS`
   (`:12-26`):** filter to happened-only lines, rename
   Minutes → Appearance, rename Bonus → Hat-trick bonus,
   add the Base points subtotal row, show stadium bonus
   only when non-zero, replace the Multiplier points row
   with the captain formula line (captain only), keep the
   Total as `final_points`.
2. **Fixture line(s) under the hero (§4):** render from
   `detail.gameweek.matches` for every state, not just DGW.
   In `live.js`, add the kickoff to the match shell
   (`shellFromFixture`, `live.js:763-792` — add
   `kickoff: f.kickoff`) so the scheduled line can show a
   date/time. That is the only `live.js` change; do not
   touch the scoring or the breakdown derivation.
3. **DGW tabs:** render the per-match filtered stat lines
   from `match.breakdown` + the match subtotal, and rewrite
   the multiplier note (§3).
4. **Sub-out / yet-to-play / DNP states (§3, C–E):** the
   ledger must not contradict the total in any of them.
5. **Hero:** add the season total (`detail.season`) and the
   handover wording in the captain line. Keep Last 5 as-is.

## Acceptance checklist (on the live Vercel URL, on a phone)

- [ ] `npm --prefix client run build` passes.
- [ ] A 90-minute, 1-goal, 1-assist, 1-yellow midfielder
  shows 4 stat lines + Base points 9 + Total 9 — no
  zero rows, no `1x` row, no `+0` stadium bonus.
- [ ] A captain with base 12 and bonus +1 shows Base 12,
  Stadium bonus +1, Captain ×2 `(12 + 1) × 2`, Total 26 —
  and the arithmetic is visible on screen.
- [ ] A player with no goals/assists/cards shows only
  Appearance + Base + Total. No `Clean sheet 0 +0`, no
  `Cards 0Y 0R`, no `Bonus — +0`.
- [ ] A hat-trick shows a line labelled "Hat-trick bonus",
  and there is only one line in the modal containing the
  word "Bonus" besides the stadium line.
- [ ] A red-card player shows one Cards row with the
  correct −3 (yellows not also deducted).
- [ ] Fixture is shown for a single-GW player: opponent,
  H/A, score if finished, kickoff date/time if scheduled.
- [ ] Yet-to-play player: fixture + "Yet to play", no ledger.
- [ ] Subbed-out player: ledger base and Total 0 are
  explained by the sub-out note.
- [ ] DGW: each tab shows that match's filtered stat lines
  and subtotal; the two subtotals sum to the GW total.
- [ ] Season total is shown in the hero.
- [ ] Breakdown-pending player: `Base points (server)` +
  "Breakdown pending", no invented stat lines.
- [ ] Totals unchanged everywhere — `final_points`, GW,
  season, and the pitch card number for the same player
  are identical before and after. This is a display-only
  change.
