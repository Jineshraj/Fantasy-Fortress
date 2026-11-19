# Fantasy Fortress — Player Card: Points Box, IN/OUT, Captain ×2 / Stadium Bonus, Photo Ring

**Date:** 19 Nov 2026
**Repo:** https://github.com/Jineshraj/Fantasy-Fortress
**HEAD checked:** `8dd80cb` — "fix(nav): comprehensive navigation, modal Back, and mobile scroll restoration"
(local clone fast-forwarded from `527d01e` to `origin/main` for this audit)
**Scope:** the player card only — `PlayerCard.jsx`, `TeamView.jsx`
(list view), `PlayerModal.jsx`, `Imagery.jsx` / `Media.jsx`, and the
player-card CSS in `client/src/index.css`.
**Method:** code audit only, at `8dd80cb`. No live browser test, no
screenshot was supplied with this request — where the code and the
user's description could point at two different elements, both are
named below and the report says which one to check on screen.

## First: the navigation fixes did land

`8dd80cb` (19 Nov, 15 files) is the navigation work from the
builder prompt: ScrollRestoration rewritten (key by location key,
search-only changes ignored, sessionStorage mirror, async retry),
`client/src/lib/modalChrome.js` added for modal Back + scroll lock
+ sticky close, TeamView "Back to table" replaced with a
history-aware go-back, `?lock` / `?reset` cleaned on unlock,
dropdowns closing on route change / scroll, H2H week / Pitch-List /
Stats state preserved in the URL, `--topbar-h` centralised with a
sticky mobile ScopeBar, brand linking to `/table`, and "Fix" renamed
to "Fixtures". `PlayerCard.jsx` was **not** touched in that commit,
so the three issues below are all still present at `8dd80cb`.

## Verdict — the user is right on all three

1. **Dashed line:** it is real, and it is the bench. There is no
   dashed rule on the points cell itself — the dashed border is the
   bench card's whole plaque, and the points box sits flush inside
   it, so its outer edge reads as a dashed points box.
2. **IN / OUT:** the user is right, and it is worse than "just a
   red shadow". On the pitch there is **no text at all** — only a
   red/green border and shadow, a striped name strip, and a faded
   photo. The list view *does* render OUT / IN text, but the badge
   classes it uses have no CSS, so they render as bare unstyled
   text. The modal and Squad view do not mention it at all.
3. **Captain ×2 and +bonus tag:** excess, as the user says. The
   captain already has three signals and the stadium bonus already
   has two (three in the modal). Removing the tags from the card
   and keeping only the doubled total + the lightning bolt is the
   right call — with one catch for negative stadium bonus (§3).
4. **Photo ring:** the position-coloured ring is also redundant,
   and the measurement backs the user up: the photo inside the
   disk is only ~69% of the disk's area. Position is already
   shown by where the player stands on the pitch, so the ring can
   go — but the ring is currently doing double duty as the
   sub-out signal, so §2 and §4 have to land together.

All four are frontend-only, in `client/src`. No backend, scoring,
sync, or data change. `final_points` stays the authority everywhere.

---

## 1. The dashed line around the points box

### Where it is

There is exactly one dashed rule on a player card, in
`client/src/index.css:1845-1851`:

```css
/* --- Bench Ticket-Stub Variations --- */
.bench-col .player-plaque {
  border-style: dashed;
  box-shadow: 3px 3px 0 #6a1fd0;
}
.bench-col .player-avatar-disk {
  border-style: dashed;
}
```

`.player-points-cell` itself has **no** `border-style: dashed`
anywhere. The plaque is the white rectangle that holds the name
*and* the bottom points/fixture block (`.player-split-bar`,
21px high, flush to the plaque's bottom edge). So on a bench card
the dashed plaque border *is* the border around the points box —
that is what the user is seeing, and why it looks weird: a dashed
rule reads as "draft / placeholder / not real", which is exactly
the wrong message for a points total that counts.

### Why it is there

It is a deliberate "ticket stub" bench treatment (the comment
says so). The intent was to mark bench cards as different from
starters. But it is applied to **every** card inside
`.bench-col` (`TeamView.jsx:267-288`), including:

- an `AUTO_SUB_IN` player — who *is* an effective starter, whose
  points *do* count in the GW total — shown with the same dashed
  "unused" treatment as a player who never played;
- a `BENCH_UNUSED` player — who is already greyed out
  (`is-bench-unused`: opacity .65) and already labelled UNUSED in
  the list view.

So the dashed border does not distinguish anything the other
signals do not already distinguish, and it actively mislabels the
auto-sub-in case.

### Fix

- Delete the dashed treatment entirely: remove
  `border-style: dashed` from `.bench-col .player-plaque` and
  `.bench-col .player-avatar-disk`. Bench cards get the same
  solid 3px ink border as starters.
- Keep the bench signals that already work and do not need a
  border: the "BENCH" heading above the row, the order tag
  (`1 GKP`, `2 DEF`, …), and `is-bench-unused` opacity .65 for
  players who did not play. In the list view, keep the UNUSED
  badge (see §2 — it needs real CSS first).
- Do **not** replace the dashed border with another border
  treatment (dotted, coloured, thicker). The bench distinction
  is already carried by position on the page; the card itself
  should look like a card.

**Check on screen first:** if the user saw the dashed line on a
*starter* (pitch) card rather than a bench card, the code says
that cannot be this rule — starters are solid. In that case it
is the `is-sub-out` red plaque border (see §2) or a screenshot
is needed. The fix above covers the bench case, which is the
only dashed rule in the code.

**Acceptance:** bench cards have a solid border like starters;
an AUTO_SUB_IN bench card no longer looks "unused"; the points
box on every card has a solid edge.

## 2. IN / OUT is not mentioned — only a red shadow

### What the code actually does

The state machine is correct in `live.js`. `displayStateOf`
(`live.js:378-384`) maps the scoring-engine role to four states:
`STARTER`, `AUTO_SUB_OUT`, `AUTO_SUB_IN`, `BENCH_UNUSED`.
`fetchTeamSquad` (`live.js:587-589`) keeps `AUTO_SUB_OUT` rows
on the pitch (the original submitted XI) and puts `AUTO_SUB_IN`
rows in the bench section. `PlayerCard.jsx:104-105, 268-270`
turns those into `is-sub-out` / `is-sub-in` classes. So the data
is there. The rendering is where it breaks down.

**Pitch view — no text, colour only**
(`PlayerCard.jsx`, `index.css:1814-1843`):

| State | What a sighted user sees | Text? |
|---|---|---|
| `AUTO_SUB_OUT` | Red ring (`--pos-ring: #ff5c6c`, overriding the position colour), name strip in pink/white diagonal stripes, plaque border + shadow red (`#c4152b`), avatar-disk border red, photo at opacity .35 + grayscale .85 | **None** |
| `AUTO_SUB_IN` | Plaque border + shadow green (`#3dffa0`), avatar-disk border green | **None** |
| `BENCH_UNUSED` | Opacity .65, slight grayscale | **None** (on the pitch card) |

The only place the words appear is the card's `aria-label`
(`PlayerCard.jsx`: "…, Substituted out / Substituted in, …") —
so a screen reader announces it and a sighted user does not.
Red/green border + shadow alone also fails for the obvious
reasons: it is invisible to a colour-blind user, it is
indistinguishable from the position ring at a glance (the ring
is *supposed* to be red for a sub-out, blue for a defender —
the same channel is carrying two meanings), and it does not say
*which* direction the sub went. A red shadow could mean out,
injured, benched, or "bad week".

**List view — text, but unstyled**
(`TeamView.jsx:337-347` starters, `:408-421` bench):

```jsx
<span className={cn('player-state-badge',
  p.displayState === 'AUTO_SUB_OUT' && 'badge-auto-out',
  p.displayState === 'AUTO_SUB_IN' && 'badge-auto-in')}>
  {p.displayState === 'AUTO_SUB_OUT' ? 'OUT' : 'IN'}
</span>
```

The text OUT / IN / UNUSED is rendered — but the classes
`player-state-badge`, `badge-auto-out`, `badge-auto-in`,
`badge-neutral` (and `badge-captain`, `badge-captain-handover`,
`badge-vice`, used in the same rows and in `PlayerModal.jsx`)
have **no CSS definition anywhere in `client/src`**. A grep for
them in `index.css` returns nothing. So in the list view they
render as bare inline text next to the name, with no chip, no
background, no weight — easy to miss, and inconsistent with the
pitch view, where the same state has no text at all.

**Modal and Squad — nothing at all.** `PlayerModal.jsx` shows
club, position, captaincy, total, ledger, form, and DGW tabs,
but never the player's `displayState`. `Squad.jsx` groups by
position and shows points, with no sub state on any row.

**Dead CSS that proves the intent was there:**
`.player-points-cell.is-out` and `.player-points-cell.is-in`
(`index.css:1736-1754`) are defined — red for OUT, green for IN,
at 8.5–9px — but nothing in `PlayerCard.jsx` ever assigns them.
`renderCell` / `PointsBlock` never pass `is-out` / `is-in`.
The same is true of `.player-points-cell.is-yet-to-play`
(`:1755-1761`). The design was planned, then never wired up.

### Fix

Add one explicit, text-based signal, in the same place on
every surface — do not rely on border/shadow colour:

1. **Pitch card:** add a small OUT / IN chip on the card. The
   cleanest place is the name strip, which already changes
   colour per state: replace the diagonal-stripe name strip for
   `is-sub-out` with a solid strip carrying a real chip, e.g.
   `OUT` in white on `#c4152b`, and `IN` in ink on `#3dffa0`,
   at 8px in the heading font, next to the name (or as a
   suffix to it). Keep the red/green border as a *secondary*
   signal, not the only one. Do not put the chip inside the
   21px points/fixture block — that block is reserved for
   fixture-or-points, and an OUT chip there would compete with
   the number.
   - Alternative, if the name strip is too small: put the chip
     on the avatar disk where the captain dot sits (top-right),
     as a second micro-badge. Do not do both — one chip, one place.
2. **Define the badge classes that already exist in the JSX:**
   give `.player-state-badge`, `.badge-auto-out`,
   `.badge-auto-in`, `.badge-neutral` (and, while there,
   `.badge-captain`, `.badge-captain-handover`, `.badge-vice`)
   real chip styling in `index.css` — same 8–9px heading font,
   padding, radius, and the same red/green as the pitch card —
   so the list view's OUT / IN / UNUSED actually reads as a
   badge instead of stray text.
3. **Modal:** add the player's sub state to the modal hero
   (next to club · position), using the same chip. A user who
   taps a faded red card should be told *in the modal* why it
   is faded.
4. **Squad view:** add the same chip to the squad row for
   `AUTO_SUB_OUT` / `AUTO_SUB_IN` rows, or leave Squad as-is
   and accept that the sub state is only visible on the team
   page — but make that a deliberate choice, not an oversight.
   (Squad groups by position, not by XI/bench, so the state is
   genuinely harder to show there; the team page is the
   primary surface.)
5. Either wire up the dead `.is-out` / `.is-in` points-cell
   classes or delete them. Dead variants that look like a
   finished feature are how this bug happened in the first
   place — the next reader will assume OUT is handled.

**What counts as "mentioned":** the words OUT / IN, visible
without tapping, on the pitch card, in the same chip style as
the list view, with the border/shadow as backup only. Colour
alone is not a mention.

**Acceptance:** on the pitch, an auto-sub-out starter is
identifiable as OUT in under a second with the page in
greyscale (colour off); an auto-sub-in bench player is
identifiable as IN the same way; the list view shows the same
words in a real chip; the modal states it; a colour-blind
simulation (or greyscale screenshot) passes.

## 3. Captain ×2 and stadium +bonus — remove the tags, keep the total and the bolt

### How many signals each one has today

**Captain** (`PlayerCard.jsx:48-72`, `PointsBlock`, `index.css`):

1. The C dot on the avatar (`.player-cap-dot`, 22px yellow
   circle, `top: -6px; right: -3px`) — plus a white VC dot for
   the vice-captain.
2. The yellow name strip (`.is-captain .player-name-wrap {
   background: #ffd23f }`; fixture cell `#fef08a`).
3. The `×2` tag inside the points cell (`PointsBlock`,
   `full && multiplier === 2` → `<span class="player-mult-tag">×2</span>`,
   8px, opacity .85).
4. The `aria` text "Captain; two times multiplier" (screen
   readers only — keep this).

The user is right: (3) is excess. The number in the cell is
already the doubled total — `final_points` is
`(base + stadium bonus) × multiplier` by construction
(`scoringEngine.js`, and `live.js:447, 465`:
`displayPoints = (base + allocated) × mult`). The `×2` does not
add information, it *explains* a number that does not need
explaining once the C dot and the yellow strip are there, and it
costs space in a 21px-high, 62–70px-wide bar at 8px type next
to a 15px number.

**Stadium bonus** — three signals on the card, plus the modal:

1. The `+bonus` / `−bonus` tag in the points cell
   (`PointsBlock`, `full && bonus !== 0` → yellow chip,
   `+1` / `−1`).
2. The lightning bolt on the avatar disk
   (`.player-event-bolt`, 18px yellow circle at `top: 30px;
   right: -1px`, 9px bolt SVG, `PlayerCard.jsx:256-265`).
3. The modal ledger's "Stadium bonus" line (`PlayerModal.jsx`
   `buildLedger`) — keep this; it is the audit trail.

The user's proposal is exactly right: **just the total, plus
the bolt**. The bolt says "this player got a stadium bonus";
the modal says how much.

### Fix

- In `PointsBlock` (`PlayerCard.jsx:48-72`), delete the
  `×2` tag and the `+bonus` / `−bonus` tag. The full block
  shows only the number — the already-doubled `finalPoints`.
  `multiplier` and `stadiumBonus` props can then be dropped
  from `PointsBlock` (keep them in `live.js` / `toCard` — the
  *data* stays, only the card tags go).
- Keep the captain dot and the yellow name strip. Keep the
  `aria` text. Keep the VC dot as-is (it never had a ×2).
- Keep the bolt, and fix its one gap: today it only renders
  when the bonus is **positive**
  (`hasStadiumBonus = stadiumBonus > 0`, `PlayerCard.jsx:246`).
  The `+bonus` tag was the only signal for a **negative**
  stadium bonus (`−1`). If the tag goes and the bolt stays
  positive-only, a −1 player loses every signal. So render the
  bolt for any non-zero bonus (`stadiumBonus !== 0`), and
  distinguish the sign without text: positive = yellow bolt
  as today; negative = the same bolt in the danger red
  (`#c4152b` / `var(--ff-danger)`) or with a muted/grey
  treatment. The amount itself lives in the modal ledger and
  in the bolt's `title` / `aria-label` (include the amount
  there, e.g. `title="Stadium bonus: +1 pt"` — that is
  already the pattern in the code, keep it).
- **DGW halves:** nothing to change. `renderCell` already calls
  `PointsBlock` without the tags, and `displayPoints` already
  folds the doubled total and the home-match bonus into each
  half (`live.js:451-465`), so the halves sum to the collapsed
  total. Removing the full-block tags makes the collapsed block
  consistent with the halves instead of contradicting them.
- **List view and Squad view:** they already show only the
  number (`TeamView.jsx` compact rows use `effectivePoints`,
  `Squad.jsx` uses `p.points`) — no ×2, no +bonus. Removing the
  tags from the pitch card makes all three surfaces agree.
  Do not add tags to the list/squad views to "match" the pitch
  card; remove them from the pitch card to match the others.
- **Modal:** keep the ledger lines — Multiplier `2x` and
  Stadium bonus `+1` — and keep the DGW tab note that match
  points apply the same multiplier and home bonus. The modal is
  where the maths is shown; the card is where the total is shown.

**Acceptance:** a captain's full block shows only the doubled
number (e.g. `24`), with the C dot and yellow strip and no
`×2`; a +1 stadium-bonus player shows only the number plus the
yellow bolt; a −1 player shows only the number plus a red bolt;
tapping any of them shows the breakdown in the modal; the
collapsed DGW total equals the sum of its halves; pitch, list,
and squad all show the same number for the same player.

## 4. The coloured border around the player image — it eats the photo

### The measurement

The pitch-card photo is built as a disk inside a disk
(`index.css:1499-1550`):

```css
.player-avatar-disk {          /* outer disk */
  width: 48px; height: 48px;
  border: 3px solid var(--ff-ink);
  box-shadow: inset 0 0 0 4.5px var(--pos-ring, #ffffff),
              3px 3px 0 var(--ff-ink);
  background: #ffffff;
}
.player-photo-circle {          /* the photo itself */
  position: absolute; inset: 4px;
  width: calc(100% - 8px); height: calc(100% - 8px);
  border-radius: 50%; overflow: hidden;
}
.player-card-unit.pos-gkp { --pos-ring: #ffd23f; }  /* yellow */
.player-card-unit.pos-def { --pos-ring: #4cb8ff; }  /* blue   */
.player-card-unit.pos-mid { --pos-ring: #3dffa0; }  /* green  */
.player-card-unit.pos-fwd { --pos-ring: #ff7aa8; }  /* pink   */
.player-card-unit.is-sub-out { --pos-ring: #ff5c6c; } /* red, overrides pos */
```

So on a phone the visible photo is **40px** inside a **48px**
disk: 3px outer ink border + 4.5px position-coloured ring
(an inset box-shadow) + 4px inset. By area the photo is
(40/48)² ≈ **69% of the disk** — nearly a third of the circle
is border and ring, not face. At ≥540px the disk is 50px and the
photo 42px; at ≥768px the disk is 58px and the photo 50px.
The shirt fallback is smaller still (`.player-photo-circle
.shirt`: 32px inside the 40px circle). The captain dot (22px)
and the bolt (18px) then overlap the disk's corners on top of
that.

### Why the ring is redundant

The ring's job is to say the player's position — but position
is already shown by **where the player stands on the pitch**.
The pitch is laid out in lines (`TeamView.jsx: pitchLines` —
GKP, DEF, MID, FWD rows), so a player in the DEF row is a
defender whether or not his photo has a blue ring. The same
information is also in the list view's group dividers
("GKP / DEF / MID / FWD"), the Squad accordion groups, and the
modal's position tag. The ring is the *fourth* place position is
encoded, and it is the one that costs photo size to do it.

The one thing the ring does that nothing else does is turn red
for a sub-out (`is-sub-out` overrides `--pos-ring` to `#ff5c6c`).
That is exactly why §2 and §4 have to land together: if the
ring goes, the red ring goes with it, and the OUT chip from §2
becomes the *only* sub signal — which is the point. Do not
remove the ring and keep the sub state colour-only.

### Fix

- Delete the position ring: remove the inset
  `box-shadow: inset 0 0 0 4.5px var(--pos-ring, …)` from
  `.player-avatar-disk`, and delete the four `--pos-ring`
  rules (`pos-gkp / pos-def / pos-mid / pos-fwd`) and the
  `is-sub-out` override. Keep the `pos-*` classes on the card
  if anything else uses them (nothing else does today — check
  before deleting the classes from the JSX).
- Let the photo fill the disk: change
  `.player-photo-circle` from `inset: 4px` to `inset: 2px`
  (a 2px white gap so the photo does not touch the ink border)
  or `inset: 0`. Keep the 3px outer ink border and the 3px
  hard shadow — those are the card's identity, and they do not
  eat the photo the way the ring does.
- Size gain, phone (48px disk): photo 40px → 44px at
  `inset: 2px` (+21% area), or 48px at `inset: 0` (+44% area).
  At desktop (58px disk): 50px → 54px / 58px. Recommend
  `inset: 2px` — the full-bleed `inset: 0` photo touching the
  ink border looks cramped against the hard shadow.
- Enlarge the shirt fallback to match (32px → ~40px at phone
  size), so a missing photo does not suddenly look smaller
  than a real photo.
- If the team wants *any* position cue left on the card, use a
  thin one that does not eat the photo: a 2px ring *outside*
  the disk (an `outline` / outer box-shadow, not an inset
  one), or a small position letter on the name strip. Do not
  put the ring back inside the disk. The pitch line already
  does this job; a second cue should be cheap or absent.
- Check the other photo surfaces while there: `PlayerPhoto`
  elsewhere (list rows, Squad rows, modal, ownership rows) has
  no ring — only the pitch/bench disk does — so this change is
  contained to the pitch and bench cards.

**Acceptance:** on the pitch, the photo visibly fills the disk
with only a 2px gap to the ink border; no coloured ring is
visible; position is still obvious from the pitch line the
player stands in; a sub-out player is still identifiable — by
the OUT chip from §2, not by a red ring.

## What not to change

- `final_points` is the authority. Removing the ×2 / +bonus
  tags is display-only: the number shown is the same doubled
  total, computed the same way. Do not "un-double" anything to
  compensate for removing the tag.
- The DGW display formula stays: halves show
  `(base + home-match bonus) × multiplier`, the collapsed block
  shows the full total, the modal tabs use the same figures.
- The modal keeps its breakdown: ledger lines for Multiplier
  and Stadium bonus, DGW Match 1 / Match 2 tabs, Last 5.
- The `displayStateOf` state machine in `live.js` stays as-is
  — only its rendering changes (§2).
- The captain dot, yellow name strip, and the bolt stay.
  The bench heading, order tags, and `is-bench-unused`
  opacity stay.
- Totals: GW, previous GW, season, and every player's
  `final_points` identical before and after.

## Fix order for the builder

1. **§2 IN/OUT chip + badge CSS first** — it replaces the
   sub-out red ring, so it must land before or with §4.
2. **§1 Remove the dashed bench border.**
3. **§3 Remove the ×2 / +bonus tags; fix the bolt for
   negative bonus.**
4. **§4 Remove the position ring; enlarge the photo.**
5. Delete the dead CSS (`.player-points-cell.is-out`,
   `.is-in`, `.is-yet-to-play` if still unused after §2), or
   wire them up — do not leave them looking finished.

## Acceptance checklist (on the live Vercel URL, on a phone)

- [ ] Bench cards have a solid border; the points box has a solid edge.
- [ ] An AUTO_SUB_IN bench card does not look "unused".
- [ ] Pitch, greyscale: OUT and IN are readable as words, not just colour.
- [ ] List view shows OUT / IN / UNUSED as real chips.
- [ ] Modal states the sub state for that player.
- [ ] Captain's full block: only the doubled number, C dot, yellow strip, no `×2`.
- [ ] Stadium bonus: only the number + bolt (yellow for +, red for −); amount in the modal.
- [ ] Photo fills the disk (2px gap to the border); no position ring.
- [ ] Position is still obvious from the pitch line.
- [ ] DGW halves sum to the collapsed total; totals unchanged everywhere.
