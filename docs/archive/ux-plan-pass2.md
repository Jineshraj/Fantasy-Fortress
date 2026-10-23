# Improve-UX Plan (Pass 2 - Functional & Lifecycle Polish)

A second pass, after `ux-audit.md` closed all 17 findings and `routing-plan.md` landed. This looks
for problems the earlier passes *created or left behind* rather than re-checking the same list.

Every finding below was verified against source before being written down — the "Before" column is
measured, not assumed.

---

## 1. H2H opens on a gameweek that has never been played — P1

**Before** (`H2H.jsx:35`): `useState(() => H2H_WEEKS[H2H_WEEKS.length - 1].gw)` → **GW 20**.

H2H gameweeks are `[3,4,6,7,9,10,12,13,14,16,17,18,19,20]`; only **GW 1–6** are scored. So the
screen's first impression is 8 matchups all reading "Upcoming" with `–` dashes, plus a notice
saying GW 20 hasn't been scored. The most interesting data — GW 6, fully played — is one tap away
and invisible.

**Fix:** default to the most recent H2H week that actually has scores, falling back to the first
week if none do. Needs a new `latestScoredGw()` helper in `live.js` (max gameweek present in
`gameweek_team_scores`).

---

## 2. No way to refresh without a full page reload — P1

This is also open item **GAP-A** from `ux-plan.md`.

The app fetches once at boot. If the nightly sync lands while a tab is open, the user has no way
to see it — the header stamp goes stale and red after 48h, and the only remedy is reloading.

**Fix:**
- a **refresh button** in the header, which re-runs the prefetch while keeping existing data
  visible (stale-while-revalidate, so the UI never blanks on refresh)
- a **refetch on tab focus** via `visibilitychange`, debounced, skipped if the data is younger
  than a couple of minutes so it doesn't fire on every alt-tab

---

## 3. The access code is required on every single visit — P1

**Before:** `Access.jsx` has no persistence — verified, zero `localStorage`/`sessionStorage`
references. Every page load shows the code screen.

The code is already public in the bundle (`SLS14`), so this is friction without security. Leaving
real auth for later is fine; making people re-type a public string every visit is not.

**Fix:** remember the unlock in `localStorage` and skip the gate on later visits. This does not
add security — nothing does, until real auth lands — it just removes a pointless repeated step.
Real auth still replaces the whole mechanism.

---

## 4. Squad forgets which team you were looking at — P2

**Before** (`Squad.jsx:24`): `useState(null)` — no persistence. `activeTeam` falls back to
`teamOptions[0]`, i.e. **whichever team is top of the standings**. So every visit opens an arbitrary
team, and picking a different one is lost on navigation.

**Fix:** remember the pick in `localStorage`, keyed by nothing in particular (one team is picked at
a time). Falls back to the standings leader on first visit, as now.

---

## 5. The player modal does not manage focus — P2 (accessibility)

**Before:** verified — `PlayerModal.jsx` contains no `focus` handling at all.

Consequences: opening the modal from a pitch card leaves focus wherever it was, so a keyboard or
screen-reader user is still "on" the pitch behind the dialog; Tab walks out into the page behind;
and closing returns focus to the document body rather than the card that opened it.

**Fix:**
- move focus into the dialog on open
- trap Tab / Shift+Tab inside it
- restore focus to the triggering element on close
- `role="dialog"` + `aria-modal` already present

---

## 6. Two sticky bars eat 136px of a phone screen — P2

**Before:** `.topbar` is `sticky` at **84px** and `.scope-bar` is `sticky` at `top: 84px` and about
52px tall — **~136px of permanently-fixed chrome**, plus an 84px bottom nav. On a 667px iPhone SE
that is ~33% of the viewport gone before any content.

**Fix:** make the `ScopeBar` scroll away on small screens (`position: static` under 700px) and stay
sticky from 700px up where there is room. The week remains visible in every screen's own heading
("Squad · Gameweek 6", "through GW 6"), so nothing is lost by letting the control scroll off.

---

## Explicitly out of scope

| Item | Why |
|---|---|
| Real auth (16 team IDs + 1 admin) | Deferred by you. Item 3 only removes the repeated-typing friction; it does not pretend to add security. |
| `SLS14` → `FFS2` rename | Offered earlier, still unanswered. |
| Maroon/gold crest on a neon theme | Offered earlier, still unanswered. This is the biggest *visual* issue outstanding. |
| Backend items (C-01, C-02, H-10) | Server-side; `server.js` untouched. |
| GW7–38 data, manager names, prices, club badges | Need a backend sync or schema change. |

---

## Execution order

1. `live.js` — `latestScoredGw()` + a revalidate path that keeps data on screen
2. `H2H.jsx` — default to the latest *scored* week
3. `Header.jsx` / `FantasyApp.jsx` — refresh button + `visibilitychange` refetch
4. `Access.jsx` — remember the unlock
5. `Squad.jsx` — remember the picked team
6. `PlayerModal.jsx` — focus trap + restore
7. `index.css` — scope-bar static on mobile
8. Tests, build, update `open-items.mjs` (GAP-A should close)

## Verification
`test:render` gains assertions for: H2H default, access persistence flag, team persistence,
modal focus attributes, and the scope-bar breakpoint. `open-items.mjs` should drop to 5 of 6.

---

# Done

All six implemented. Bundle 158kB → 159kB gzip.

## 1. H2H opens on the newest week with real scores
`live.js` gained `scoredGameweeks()` (a `Set` of gameweeks present in `gameweek_team_scores`) and
`latestScoredGw()`. `H2H.jsx` still *initialises* on the last scheduled round (GW 20, correct as a
starting guess when nothing is known yet) but runs a one-shot correction effect that snaps to the
newest week that actually has scores — **GW 6** with the current data.

The correction is guarded by a `corrected` flag so it fires once and can't fight the user after
they pick a week themselves.

## 2. Refresh without a reload
- `live.js` gained `revalidate()` — clears the memo cache and re-warms, **without** the caller
  losing its current data. It deliberately does not throw-and-replace the way `retryPrefetch` does.
- **Header refresh button** (spinning icon while in flight, disabled meanwhile).
- **`visibilitychange` refetch**, throttled to once per 120s so alt-tabbing doesn't hammer the
  database, and skipped while the document is hidden.

`runRefresh` swallows failures on purpose: a failed background revalidate must leave you with
slightly stale data and a working retry button, never an empty screen.

This also closes open item **GAP-A** (`ux-plan.md` #10), which had been listed but never built.

## 3. Access code remembered
`lib/storage.js` wraps `localStorage` in try/catch so private mode and embedded webviews degrade to
"no memory" rather than throwing on every render. `Access.jsx` writes `ff:unlocked` on success and
`FantasyApp` reads it to initialise straight to `splash`.

**This adds no security** — the code is already in the bundle. It removes a repeated step, nothing
more, and real auth replaces the whole mechanism rather than building on this.

## 4. Squad remembers your team
Same storage helper, key `ff:last-team`. Guarded by `teamOptions.includes(picked)` so a renamed
franchise can't leave the screen pointing at a team that no longer exists — it falls back to the
standings leader as before.

## 5. Player modal manages focus
Verified absent before this pass. Now:
- focus moves into the dialog on open
- `Tab` / `Shift+Tab` wrap inside it instead of walking out into the page behind
- focus returns to the card that opened it on close
- `Escape` still closes (unchanged)

Uses a `FOCUSABLE` selector and filters to visible nodes so hidden elements aren't tab stops.

## 6. 136px of fixed chrome reduced
`.scope-bar` becomes `position: static` under 700px and stays sticky from 700px up, where there's
room. Nothing is lost — every screen already names the week in its own heading ("Squad · Gameweek
6", "through GW 6"). This returns roughly 52px of a small phone to the content.

## Tests
`test:render` grew from 63 to **78 assertions**, adding 15 that lock in the six fixes — including
that H2H keeps both the last-scheduled-round initial value *and* the scored-week correction, since
either alone would pass while the behaviour regresses.

```
npm run build        OK
npm run test:render  78/78 PASS
npm run test:audit   22/22 OK
npm run test:logos   16/16 OK
npm run test:open    5 of 5 open items confirmed still open   (was 6 — GAP-A closed)
```

One test assertion was wrong on the first run: it expected `H2H_WEEKS[].length`, but the source is
`H2H_WEEKS[H2H_WEEKS.length - 1]`. The implementation was right; the check was not.
