# Fantasy Fortress — Pitch Row Spacing: Why a 2-Card Row Feels Congested

**Date:** 20 Nov 2026
**Repo:** https://github.com/Jineshraj/Fantasy-Fortress
**HEAD checked:** `1301a2c` — "style(card): straighten cards, remove 3D shadows, and tune mobile typography"
(local clone fast-forwarded from `8dd80cb` to `origin/main` for this audit)
**Scope:** the space *between* player cards on a pitch row only.
No card size, photo, font, pitch height, or points change is
proposed — per the user's instruction.
**Method:** code audit only, at `1301a2c`, with the row widths
computed from the CSS values in the file. No live browser test,
no screenshot supplied.

## Builder instruction — apply this, nothing else in this file

Apply **only** the "Recommended fix (hybrid)" in §3: the
`:has()` selectors with the per-breakpoint values given there,
placed inside the existing `@540px` / `@768px` media queries
in the winning `.pitch-line` block (`index.css:4442, 4901,
4948`). Do **not** also add the `data-count` version — it is
a fallback in the report for reference only, not a second
change. Do **not** use Gemini's original values as written
(they cap the 5-row at 6px and the 3-row at 28px). Do not
change any card size, photo, font, pitch height, or points.
Do not touch `.bench-row`. Do not clean up the duplicated
stylesheet in this change (§4 is a separate job).
Verify with `npm --prefix client run build`, then check the
acceptance checklist at the end on the live Vercel URL.

## First: the previous card fixes did land

- `69a59b0` "fix(card): clean up points box, add sub text chips,
  and expand photo area" — dashed bench border removed, OUT/IN
  text chips added, ×2 / +bonus tags removed, negative-bonus red
  bolt added, position ring removed and photo enlarged. That is
  the previous report, done.
- `1301a2c` "style(card): straighten cards, remove 3D shadows,
  and tune mobile typography" — cards un-tilted, 3D shadows
  removed, mobile type tuned. **Side effect that matters for this
  report:** `client/src/index.css` went from 2,744 lines to
  6,108 lines in that one commit (+4,276 / −911). The old rules
  are still in the file above the new ones, so most pitch rules
  are now defined twice. See §4 — the builder must edit the
  *later* copy or the change will appear to do nothing.

## Verdict — you are right, and it is exactly what you said

The gap between cards on a row is fixed per breakpoint. It does
not know how many cards are in the row. A 5-card row and a
2-card row get the same gap, so the 2-card row's cards sit
almost touching in the middle of the pitch while ~100px of
empty green sits on each side of them. That is the congested
feeling: the cards are clustered together, and the space is
*outside* the row instead of *between* the cards.

## 1. The rule today

The winning rule is the later copy, `index.css:4442`:

```css
.pitch-line {
  position: relative;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: clamp(3px, 1.1vw, 7px);
  width: 100%;
  min-width: 0;
}
@media (min-width: 540px) { .pitch-line { gap: 9px; } }   /* :4901 */
@media (min-width: 768px) { .pitch-line { gap: 14px; } }  /* :4948 */
```

Card width, same winning copy (`:4459`, `:4905`, `:4952`):

| Breakpoint | Card width | Gap |
|---|---|---|
| Phone, < 540px | `clamp(60px, 15vw, 68px)` | `clamp(3px, 1.1vw, 7px)` |
| Tablet, ≥ 540px | 72px | 9px |
| Desktop, ≥ 768px | 88px | 14px |

`justify-content: center` + a fixed `gap` + a fixed card width
means the row's total width is `n × card + (n − 1) × gap`, and
everything left over is split as empty margin on the two sides.
The gap never changes with `n`; the margins do all the changing.

The row is built in `TeamView.jsx:80-95, 244-258`:
`pitchLines` groups the XI by position (GKP / DEF / MID / FWD)
and renders one `<div className="pitch-line">` per line. The
line knows how many players it has (`line.players.length`) —
but nothing in the JSX or the CSS uses that number. The bench
(`.bench-row`, always 4 cards) has the same fixed-gap pattern,
but its count never varies, so it is not the problem.

## 2. The numbers — 360px phone, the case you are seeing

Assumptions, all from the file: viewport 360px, `.page-section`
padding 10px each side (≤480px), `.pitch` padding 6px each side
(≤699px) and a 3px border each side. Usable width inside the
pitch: 360 − 20 − 12 − 6 = **322px**. Card: `15vw` of 360 is
54px, so the clamp floors it to **60px**. Gap: `1.1vw` is
3.96px, so **~4px**.

| Row (3-5-2) | Cards | Row width | Gap | Empty margin each side |
|---|---|---|---|---|
| GKP | 1 | 60px | — | 131px |
| DEF | 3 | 3×60 + 2×4 = 188px | 4px | 67px |
| MID | 5 | 5×60 + 4×4 = 316px | 4px | 3px |
| FWD | 2 | 2×60 + 1×4 = 124px | **4px** | **99px** |

That last row is the one you are feeling. The two forwards
are 4px apart — closer together than the cards in the packed
5-man midfield — while 99px of empty pitch sits on each side
of them. The gap is 1.2% of the pitch width; the side margins
are 31% each. The eye reads that as "these two are squashed
together", even though there is space everywhere around them.

Same shape at other sizes (same rule, same problem):

- **390px iPhone:** card 60px, gap ~4px, usable 352px.
  5-row: 316px (margins 18px). 2-row: 124px (**margins 114px**).
- **768px tablet/desktop:** card 88px, gap 14px, usable 642px
  (page padding 28px, pitch padding 32px). 5-row: 496px
  (margins 73px). 2-row: 190px (**margins 226px**).

So on every screen the 2-row is the worst row, and it is
usually the forwards — the top row of the pitch, the first
thing you look at. A 4-4-2 has the same issue twice over
(2 forwards, and the 4-man rows are fine); a 4-3-3 or 3-4-3
hides it better, which is why it feels intermittent rather
than constant.

Note what this is *not*: the cards are not too big, the pitch
is not too narrow, and the 5-row is not too tight — at 316px
in a 322px pitch it is exactly full, and it should stay that
way. The problem is only that the gap does not grow when the
row gets shorter.

## 3. The fix — gap by row count, capped, no size changes

### Update, 20 Nov 2026: Gemini's `:has()` version vs this report's `data-count` version

Gemini proposed the same idea with a different mechanism —
pure CSS `:has()` selectors, no JSX change:

```css
.pitch-line:has(> :nth-child(5)) { gap: clamp(3px, 1.1vw, 6px); }
.pitch-line:has(> :nth-child(4):last-child) { gap: clamp(8px, 2.8vw, 14px); }
.pitch-line:has(> :nth-child(3):last-child) { gap: clamp(16px, 5.5vw, 28px); }
.pitch-line:has(> :nth-child(2):last-child) { gap: clamp(28px, 9vw, 52px); }
```

**Verdict: Gemini's mechanism is better, its values are not
quite — take the mechanism, keep this report's values, and put
them inside the existing media queries.**

| | Gemini `:has()` | This report `data-count` |
|---|---|---|
| JSX change | None — pure CSS | One attribute in `TeamView.jsx:245` |
| How the count is known | Counts DOM children (`:nth-child`) | `line.players.length`, set explicitly |
| Robustness | Breaks silently if a non-card child (skeleton, spacer, label) is ever added inside `.pitch-line` — `nth-child` counts it | Immune — the count comes from the data, not the DOM |
| Debuggability | Implicit — you have to count children to know which rule applies | Explicit — `data-count="2"` is visible in DevTools |
| Browser support | `:has()` needs Chrome 105+ / Safari 15.4+ / Firefox 121+ (all modern phones are fine). Older browsers ignore the rule and fall back to the old 4px gap — safe, not broken | Works everywhere |
| Values at 360px | 2-row 32px, 3-row 20px, 4-row 10px | 2-row 48px, 3-row 32px, 4-row 14px |
| Values at 768px | 2-row 52px, 3-row **28px**, 4-row 14px, 5-row **6px** | 2-row 64px, 3-row 48px, 4-row 28px, 5-row 14px |

Two real problems with Gemini's version as written:

1. **It flattens the breakpoint gaps.** Its selectors are
   more specific than the plain `.pitch-line` rules, so they
   win over the existing `@540px` (9px) and `@768px` (14px)
   overrides no matter where they are placed. Its 5-row rule
   caps at 6px, so the 5-row — the one row that looks right
   today — gets *tighter* on tablet and desktop (14px → 6px).
   Its 3-row cap of 28px is also noticeably tight on desktop
   (row 320px, margins 161px each side, vs 360px / 141px with
   a 48px gap).
2. **On a phone the difference is small; on desktop it is
   not.** At 360px Gemini's 2-row gap is 32px (row 152px)
   vs this report's 48px (row 168px) — both fix the
   congestion, Gemini's is just a touch more conservative.
   The gap that matters is the 3-row on a wide screen.

### Recommended fix (hybrid)

Use Gemini's `:has()` selectors, with this report's
per-breakpoint values, inside the existing media queries —
so the 5-row keeps its 9px / 14px scaling and the shorter
rows get the wider gaps:

```css
/* Base, phone < 540px — card 60px */
.pitch-line:has(> :nth-child(5)) { gap: clamp(3px, 1.1vw, 7px); } /* unchanged */
.pitch-line:has(> :nth-child(4):last-child) { gap: 14px; }
.pitch-line:has(> :nth-child(3):last-child) { gap: 32px; }
.pitch-line:has(> :nth-child(2):last-child) { gap: 48px; }

@media (min-width: 540px) { /* card 72px */
  .pitch-line:has(> :nth-child(5)) { gap: 9px; } /* unchanged */
  .pitch-line:has(> :nth-child(4):last-child) { gap: 18px; }
  .pitch-line:has(> :nth-child(3):last-child) { gap: 36px; }
  .pitch-line:has(> :nth-child(2):last-child) { gap: 56px; }
}

@media (min-width: 768px) { /* card 88px */
  .pitch-line:has(> :nth-child(5)) { gap: 14px; } /* unchanged */
  .pitch-line:has(> :nth-child(4):last-child) { gap: 28px; }
  .pitch-line:has(> :nth-child(3):last-child) { gap: 48px; }
  .pitch-line:has(> :nth-child(2):last-child) { gap: 64px; }
}
```

If the builder prefers the explicit route, the `data-count`
version below is the equivalent fallback (same values, one
JSX attribute). Either mechanism is fine — do not do both.

### `data-count` version (fallback, same values)

1. **Tell the CSS how many cards are in the row.**
   In `TeamView.jsx:244-245`, the count is already known:

   ```jsx
   <div className="pitch-line" key={line.pos} data-count={line.players.length}>
   ```

   No other JSX change is needed. Do not change the card
   width, the photo, the font, or the pitch padding.

2. **Set the gap per count, per breakpoint, in the *winning*
   (later) `.pitch-line` block** — see §4 for which copy that
   is. Values below are the recommendation; the principle is
   "gap grows as the row gets shorter, and it is capped, so a
   2-row never gets a silly 150px gap".

   **Phone, < 540px** (card 60px):

   | `data-count` | Gap | Row width (360px) | Margin each side |
   |---|---|---|---|
   | 5 | 4px (unchanged) | 316px | 3px |
   | 4 | 14px | 282px | 20px |
   | 3 | 32px | 244px | 39px |
   | 2 | 48px | 168px | 77px |
   | 1 | — (single card, centred) | 60px | 131px |

   **Tablet, ≥ 540px** (card 72px): 5 → 9px (unchanged),
   4 → 18px, 3 → 36px, 2 → 56px.

   **Desktop, ≥ 768px** (card 88px): 5 → 14px (unchanged),
   4 → 28px, 3 → 48px, 2 → 64px.

   The 5-row is untouched at every breakpoint — that is the
   constraint row, and it already fills the pitch. The 2-row
   goes from a 4px gap to 48px on a phone: the two forwards
   are clearly separated, the row is 168px wide instead of
   124px, and the side margins fall from 99px to 77px. It is
   a visible fix without touching any size.

3. **Do not use un-capped `space-between` / `space-evenly`
   instead.** They look like the obvious one-line fix, and
   they are the wrong one here:
   - `space-evenly` on a 360px phone gives the 2-row a ~67px
     gap, which is fine — but on a 768px pitch it gives the
     same row a ~160px gap, with the two forwards marooned at
     the touchlines and a hole in the middle.
   - `space-between` with any side padding overflows the
     5-row on a phone: 5 × 60px already fills 316 of 322px,
     so there is no room for the padding it needs.
   The per-count gap is the controlled version of the same
   idea: the gap grows with the free space, but it stops at
   the cap.

### What this fix honestly does not do

A per-count gap fixes the *between-cards* congestion, which
is what you asked for. It does not make a 2-row fill a wide
desktop pitch — at 768px the 2-row's side margins are still
~200px even with a 64px gap, because the cards are 88px wide
and there are only two of them. Filling that space would need
bigger cards, or edge-to-edge positioning, both of which you
ruled out. On a phone, where you actually use the app, the
fix is clearly visible; on a wide desktop it is a smaller,
still real, improvement. Say that to the builder so nobody
"fixes" the desktop margins by quietly enlarging the cards.

### Bench

Leave `.bench-row` alone. It is always 4 cards, so its gap
never has the count problem — 4 × 60px + 3 × ~5px is a
consistent row at every breakpoint. If the per-count rule is
ever generalised to the bench, it should be a separate,
deliberate change, not a side effect of this one.

## 4. Trap for the builder: the stylesheet is duplicated

`1301a2c` took `index.css` from 2,744 lines to **6,108 lines**
(+4,276 / −911). The old rules were not removed; the new
stylesheet was effectively appended, so the pitch rules exist
twice:

- `.pitch-line`: first at `:974` (`gap: 4px`), winning copy at
  **`:4442`** (`gap: clamp(3px, 1.1vw, 7px)`), with the
  breakpoint overrides at `:4901` (9px) and `:4948` (14px).
- `.bench-row`: first at `:1033`, winning copy at `:5958`.
- `.player-card-unit`, `.pitch`, and most other pitch rules
  are duplicated the same way.

The per-count gap **must** go in the winning copy (`:4442`,
`:4901`, `:4948`). A builder who edits the first copy they
find (`:974`) will change nothing on screen and will conclude
the fix does not work. The right follow-up, after this fix,
is to delete the dead earlier copy of the pitch/card rules —
but that is a separate cleanup, not part of this spacing
change, and it should not be mixed into the same commit.

## Acceptance checklist (on the live Vercel URL, on a phone)

- [ ] `npm --prefix client run build` passes.
- [ ] 3-5-2, 360px: forwards (2) have a visibly larger gap than the midfield (5); the two forwards no longer look stuck together.
- [ ] 3-5-2, 360px: midfield (5) is unchanged — same 4px gap, same 316px row, no overflow, no wrap.
- [ ] 4-4-2 and 4-3-3: every row's gap grows as its count falls (5 < 4 < 3 < 2, in that order).
- [ ] 1-card GK row: still a single centred card, no gap applied.
- [ ] 768px: 2-row gap is larger than the 5-row gap, and capped (no ~150px gap, no cards at the touchlines).
- [ ] Bench row (4 cards): unchanged.
- [ ] Card sizes, photo sizes, fonts, pitch height, and all
  totals (`final_points`, GW, season) identical before and
  after. This is a spacing-only change.
