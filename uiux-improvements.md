# Fantasy Fortress — UI/UX Visual Upgrade Review

**Status:** Reviewed and re-scoped as the visual styling authority  
**Scope:** Every route, shared shell, state, and overlay in the current Fantasy Fortress client  
**Review date:** Current repository review  
**Primary target:** A punchy, commanding Neo-Brutalist interface that is easier to scan without changing the component architecture, data contracts, or scoring logic.

> This document is a visual upgrade specification, not a data or product-logic rewrite. Keep the existing React components, live-data boundary, routes, focus traps, loading/error behavior, and real values. The work described here is CSS-first, with only minimal markup adjustments where a visual state cannot be expressed by existing classes.

---

## 1. Non-negotiable art direction

Fantasy Fortress already has a memorable identity. The upgrade must make that identity sharper, not replace it.

### Keep

- Royal purple page canvas: **`#6c18d1`**.
- Crisp white cards and modal surfaces.
- Very dark purple ink and borders: **`#25003d`**.
- Neon green **`#39ff91`** for active, positive, live, and selected states.
- Cyan **`#00d9ff`** for secondary actions, navigation rules, and interactive emphasis.
- Gold only for captaincy, first place, and exceptional tournament emphasis.
- Bold condensed display headings, uppercase short labels, and tabular numerals.
- Hard offset shadows with zero blur.
- Real team crests, player imagery, and fallback marks already supplied by the app.
- The current four-item bottom navigation and header competition menu.

### Prohibited

- No gradients of any kind: no linear, radial, conic, or image gradients.
- No glassmorphism, translucent frosted panels, or `backdrop-filter`.
- No soft blurred shadows, glow clouds, or diffuse elevation.
- No washed-out gray body copy on white cards.
- No pastel minimalism or low-contrast “quiet luxury” surfaces.
- No generic dashboard tiles that make every value look equally important.
- No new component library, dark-theme migration, alternate palette, or second design system.
- No fabricated scores, averages, player totals, statuses, or breakdowns.
- No changes to scoring, position resolution, fixture data, routes, or provider logic as part of this styling pass.

### Visual objective

The page should read as **purple field → white information block → dark ink hierarchy → one loud accent**. Every screen needs one obvious focal point. Secondary information should be quieter through size and placement, never through illegible color.

---

## 2. Review coverage and current UI inventory

The review covered the current route tree in `client/src/components/fantasy/FantasyApp.jsx`, all route components, shared UI components, and the full cascade in `client/src/index.css`.

| Surface | Current component(s) | Visual job after the upgrade |
|---|---|---|
| Access gate | `Access.jsx` | Make the code entry feel like the entrance to a league, not a generic login form. |
| Boot/loading | `Splash.jsx`, `LoadingBlock` | Show real progress with a clear, bold status rhythm. |
| Global shell | `FantasyApp.jsx`, `Header.jsx`, `ScopeBar.jsx` | Keep the brand and gameweek context visible without stealing the first viewport. |
| League table | `Leaderboard.jsx` | Make rank, team, and total points scan in one pass. |
| Squad | `Squad.jsx` | Make the selected team and effective XI total the dominant pair. |
| Fixtures | `Fixtures.jsx` | Make scorelines and match status instantly legible; keep ownership one tap away. |
| Stats | `StatsLeaders.jsx` | Make the current leaderboard metric unmistakable and filters compact. |
| H2H | `H2H.jsx` | Separate matchup results from group standings without flattening the tournament identity. |
| Super Cup | `SuperCup.jsx` | Make round, progress, winner, and final readable on a long bracket. |
| Team detail | `TeamView.jsx`, `PlayerCard.jsx` | Preserve the tactical pitch while giving list mode the fastest scan path. |
| Player detail | `PlayerModal.jsx` | Turn the ledger into a high-contrast, readable evidence panel. |
| Ownership detail | `FixtureOwnershipModal.jsx` | Make both clubs and their owned players easy to compare. |
| Empty/error/loading | `states.jsx`, `ErrorBoundary.jsx` | Give every non-data state a deliberate, on-brand panel and clear next action. |
| Navigation | bottom nav in `FantasyApp.jsx` | Make current location obvious by shape and weight, not neon color alone. |

### Current strengths to preserve

- The purple/cyan/green combination is distinctive and recognizable.
- Real crests and player images make the data feel like a competition, not a generic admin panel.
- The app already uses actual loading, retry, empty, and stale-sync states.
- The gameweek is URL-addressable and shared across the weekly screens.
- The team rows, fixture buttons, player cards, and modal interactions are meaningful interactive surfaces.
- Modal focus trapping, Escape handling, backdrop close, and focus restoration are already implemented.

### Current visual friction to remove

1. `client/src/index.css` contains several historical passes (`SCALE-UP PASS`, `MOBILE-FIRST REDESIGN`, and the later UI program) that override one another. The final result is difficult to tune and leaves stale selectors beside active ones.
2. `--font-heading` and `--font-body` are referenced throughout the UI but are not defined in the live token block. Typography therefore falls back inconsistently.
3. `.ff-scorecard` is applied in JSX but has no authoritative live style. The scorecard should be a deliberate white-card hero, not an accidental combination of legacy rules.
4. Repeated data units are often simultaneously bordered, rounded, and shadowed at parent and child levels. This makes every block shout.
5. Important player metadata still falls below a readable size in some final cascade paths.
6. The leaderboard row carries rank, crest, team, manager/context, movement, GW points, and total in a narrow grid. The total should win that competition.
7. Access, splash, and the hub use large structural chrome together. The brand can stay large while the usable data arrives sooner.
8. Old selectors such as `.scope-stepper`, `.scope-chips`, `.scope-latest`, `.squad-summary`, and `.team-select-control` should not be treated as active design targets unless their markup returns.
9. `Header.jsx` currently reads competition `id` while `FantasyApp.jsx` supplies `to`; this is an adjacent route/menu data-shape issue, not a reason to alter the visual architecture. Track it separately from the style pass.

---

## 3. Authoritative Neo-Brutalist visual system

Add one clean token block in `client/src/index.css`. Legacy variables may alias these values, but the old dark-surface/gradient proposal must be removed from this document and must not become a second live theme.

### 3.1 Color tokens

```css
:root {
  --ff-bg: #6c18d1;
  --ff-card: #ffffff;
  --ff-card-ink: #25003d;
  --ff-ink: #25003d;
  --ff-ink-deep: #160022;

  --ff-green: #39ff91;
  --ff-green-text: #087b43;
  --ff-cyan: #00d9ff;
  --ff-cyan-ink: #004d5d;
  --ff-gold: #ffd700;
  --ff-danger: #a51543;

  --ff-on-purple: #ffffff;
  --ff-on-purple-muted: #ead8ff;
  --ff-on-card-muted: #5b3b69;
  --ff-divider: #dcc8e8;
  --ff-focus: #ffffff;

  --background: var(--ff-bg);
  --foreground: var(--ff-on-purple);
  --card: var(--ff-card);
  --card-foreground: var(--ff-card-ink);
  --border: var(--ff-ink);
  --primary: var(--ff-green);
  --primary-foreground: var(--ff-card-ink);
  --secondary: var(--ff-cyan);
  --secondary-foreground: var(--ff-cyan-ink);
  --muted: var(--ff-ink);
  --muted-foreground: var(--ff-on-purple-muted);
}
```

Rules:

- `--ff-green` is a fill, rule, indicator, or large display accent. Do not use it as normal text on a white card.
- Use `--ff-green-text` for positive numbers and labels on white.
- Use `--ff-card-ink` for all primary card text.
- Use `--ff-on-card-muted` for secondary card text. It is purple, not washed-out gray.
- Use `--ff-on-purple-muted` only on the purple canvas and only for supporting text.
- Use gold sparingly: captain, vice-captain handover, rank one, and the Super Cup champion state.
- Error text and error borders must use `--ff-danger`; never use a low-contrast pink wash.

### 3.2 Typography and numeric hierarchy

```css
:root {
  --font-heading: "Arial Narrow", "Roboto Condensed", Impact, sans-serif;
  --font-body: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;

  --ff-text-label: 12px;
  --ff-text-body: 15px;
  --ff-text-control: 14px;
  --ff-text-title: clamp(30px, 7vw, 48px);
  --ff-text-section: clamp(22px, 5vw, 30px);
  --ff-text-number: clamp(24px, 8vw, 40px);
  --ff-text-hero-number: clamp(42px, 13vw, 68px);
}

body { font-family: var(--font-body); }
h1, h2, h3, button, .eyebrow, .numeric { font-family: var(--font-heading); }
.numeric { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
```

Type rules:

- Page titles: 30–34px on phones, 42–48px on wide screens. The title is bold, but it must not push the useful list below the fold.
- Section titles: 22–30px.
- Team/player names: 15–18px, bold, one line where the row is constrained.
- Body copy: 14–16px with 1.4–1.55 line-height.
- Supporting metadata: never below 12px; use 12–13px and a strong purple rather than gray.
- Short labels may be uppercase and letter-spaced. Explanatory sentences stay in sentence case.
- All score, rank, minute, and table values use tabular numerals.
- The largest number on a surface gets the strongest weight. Do not bold every label around it.

### 3.3 Spacing, shape, border, and shadow tokens

```css
:root {
  --ff-space-1: 4px;
  --ff-space-2: 8px;
  --ff-space-3: 12px;
  --ff-space-4: 16px;
  --ff-space-5: 20px;
  --ff-space-6: 24px;
  --ff-space-7: 32px;

  --ff-radius-control: 6px;
  --ff-radius-card: 10px;
  --ff-radius-pill: 999px;
  --ff-touch: 44px;

  --ff-border-1: 1px solid var(--ff-ink);
  --ff-border-2: 2px solid var(--ff-ink);
  --ff-shadow-row: 3px 3px 0 var(--ff-ink);
  --ff-shadow-callout: 5px 5px 0 var(--ff-ink);
  --ff-shadow-cyan: 5px 5px 0 var(--ff-cyan);
}
```

Surface rules:

- Page canvas: purple, no card treatment.
- Passive white card: 1px dark border, no shadow when it is only grouping content.
- Interactive card/control: 2px dark border plus a small hard shadow; lift by 1–2px on hover/focus.
- Primary callout: 2px dark border plus a 5px hard ink or cyan shadow.
- Do not stack two hard shadows on nested surfaces.
- Use 8–12px radius for cards. Pills are reserved for compact controls and state badges.
- Pressed state moves toward its shadow: `transform: translate(2px, 2px)` and reduces the offset. No springy or blurry animation.
- Focus is a 3px solid white or green outline with a 2px offset. Focus must remain visible on both purple and white.

### 3.4 Responsive rhythm

| Viewport | Page horizontal padding | Major gap | Intended behavior |
|---|---:|---:|---|
| 320–359px | 10–12px | 14–16px | Compact controls, no wrapping headers, list-first data. |
| 360–699px | 14–16px | 16–20px | Default mobile layout, one focal block before data. |
| 700–1023px | 24px | 20–24px | Two-column opportunities where they improve scanning. |
| 1024px+ | 28–32px | 24px | Centered content with a maximum width around 1080px. |

Every page must remain usable at 320px. No visual recommendation may create document-level horizontal overflow.

---

 ## 4. Shared shell and navigation upgrade

### 4.1 Header — `Header.jsx`

**Current job:** brand, refresh, sync stamp, and competition menu.

**Upgrade:** keep the header one row, but make the brand block and right controls explicit.

- Header height: 64–72px on phones, 76–84px on wide screens.
- Purple/ink header surface with a crisp cyan bottom rule. It is a shell surface, not a white card.
- Brand crest: 36–40px on phones, 44px on wide screens.
- Brand title: 16–18px. Season is a clearly separated second line or compact cyan label.
- Refresh and competition controls: 44px hit targets; the icon can remain 18–20px.
- At 320–380px, collapse the sync stamp to a compact status mark/short label while preserving its accessible title.
- Do not allow the brand name and right controls to collide or wrap.
- Active competition must be identifiable by a cyan/green rule and heavier ink, not color alone.

**Do not:** add a second header row, a blurred backdrop, a gradient strip, or a full-width card around the brand.

### 4.2 Gameweek scope — `ScopeBar.jsx`

- Preserve the single URL-backed gameweek state.
- Keep `.gw-pill` as the visual anchor: white, dark 2px border, hard 2px shadow.
- Current week gets the green fill with dark ink when selected; previous/next controls remain white/ink.
- The label should be short and strong: `GAMEWEEK` on wide screens, `GW` where width is constrained.
- On phones, use one compact row with the current week and previous/next controls. The week menu may scroll internally; it must not create page overflow.
- Never show a stale legacy chip rail and the current pill at the same time.
- The menu is a white card with a dark border and hard shadow. The selected item gets a green fill; hover/focus gets cyan.
- Hide the scope bar only where the current app already defines it as irrelevant (overall table mode and competitions). Do not invent a second week control inside a route.

### 4.3 Bottom navigation — `FantasyApp.jsx`

- Keep four primary destinations: Table, Squad, Fix, Stats.
- Use a dark purple/ink bar with a strong cyan top rule and a safe-area-aware bottom inset.
- Active item gets a cyan or green top tab, heavier label, and a filled icon tile; inactive items remain white, not gray.
- Every item keeps a minimum 44px hit area.
- Do not make active state depend solely on neon color.
- Maintain enough `.app-shell` bottom padding for the last data row to clear the fixed nav and home indicator.
- Team detail remains visually associated with Table, as the current route behavior intends.

### 4.4 Content shell

- `.app-content` remains the centered layout boundary.
- `.page-section` uses a clear title block, then the page’s primary data surface. Avoid six independent full-width cards before the first result.
- Major sections are separated by 20–24px; related controls are grouped with 8–12px gaps.
- Purple canvas should remain visible around white cards. Do not turn the whole page into one white sheet.

---

## 5. Route-by-route visual upgrade

### 5.1 `/table` — `Leaderboard.jsx`

**Primary question:** Where do I rank, and what is my total?

**Current sequence:** title → Overall/Gameweek toggle → mover strip → search → column labels → team rows.

**Upgrade specification:**

- Title block: `THE STANDINGS` remains the dominant heading; `League table · N managers` is a light-purple eyebrow.
- Segmented control: white outer control with dark border; active option is neon green with dark ink. Keep 44px touch height.
- Mover strip: one compact white/cyan callout line, not three equal pills on mobile. Desktop may reveal the additional up/down insights.
- Search: white, 2px dark border, hard cyan shadow on focus. Search icon and placeholder use readable purple ink.
- Column labels: short, all-caps, aligned exactly with row tracks. Use `GW` and `TOTAL`, not long phrases.
- Row: white card with dark border and one 3px hard shadow. Hover/focus moves the card up/left by 2px and changes the shadow to cyan.
- Rank badge: dark ink or cyan for ordinary ranks; gold fill for rank one; silver/cyan treatment for ranks two and three without pastel washes.
- Team name is the first text priority. Manager and GW context are a single secondary line.
- Total points is the largest row value. GW points is smaller. Movement should be an inline arrow/number adjacent to rank or a reserved narrow column, never allowed to shift the score columns.
- At 320–380px, keep the crest at 28–32px and preserve room for the total. Hide nonessential manager copy before shrinking score values.
- Keep real links, middle-click behavior, route state, and team detail access unchanged.

**Acceptance:** a user can find rank, team name, and total in under one scan; the header and rows line up at 320px; movement never steals the total column.

### 5.2 `/squad` — `Squad.jsx`

**Primary question:** Which squad is selected, and how did its effective XI score?

**Identity header:**

- Keep the current two-row `.squad-head` pattern: context/actions on top, crest/team identity beneath.
- White crest mark should sit on a small, dark-edged neutral block only if the asset needs contrast; do not add a decorative panel around the entire identity.
- Team name: 24–32px, one line with ellipsis. Manager/rank metadata: 12–13px purple, one line.
- The team selector remains a compact gear/select affordance. Do not render a second full-width team title beside it.

**Scorecard (`.points-summary.ff-scorecard`):**

- Make this the page’s one large callout: white card, 2px ink border, 5px cyan or ink shadow.
- The GW score is the biggest number on the page; `pts` is smaller but aligned.
- Use a strong purple label such as `EFFECTIVE XI TOTAL`, not a faint gray caption.
- Season rank and season total are compact metric blocks separated by a dark divider.
- The played count/status is a bold green or cyan badge. If status is unavailable, omit the secondary badge exactly as the data contract requires.
- No gradients, translucent overlays, or neon-green text on white.

**Squad tables:**

- Search is full width and appears immediately before player groups.
- Accordion headers: white, 2px ink border, 3px hard shadow only when interactive; group label is 18–20px, player count is 12–13px.
- Open table uses one dark top divider and 1px row dividers. Do not box every player row.
- Player name is 14–16px; club is 12–13px purple. Season and GW values are tabular and right-aligned.
- Preserve the GKP/DEF/MID/FWD groups, real player values, and empty/loading/error states.

### 5.3 `/fixtures` — `Fixtures.jsx`

**Primary question:** What happened in this fixture, and who owns the players?

- Keep gameweek accordions and the current week expansion behavior.
- Current GW group gets a green left rule or compact green `VIEWING` tag; do not recolor an entire section.
- Group header: `GW 6` is the strong value; `4/10 played` is the secondary value. Chevron remains a 44px target.
- Fixture card is a white interactive row/card with 2px ink border and a 3px hard shadow. On hover/focus, use cyan border/shadow.
- Use one status treatment only: `FULL TIME` or `UPCOMING` plus a dot. Do not repeat the same state as both a label and a decorative icon.
- Scoreline is centered, dark ink, and larger than team metadata. The score block can use green for completed score emphasis, but text must remain contrast-safe.
- Club marks: 28–32px on phones; 36px on wider screens. Use canonical broadcast codes in the visual row, while accessible labels and the modal retain full names.
- `VIEW OWNERS` is a clear cyan/dark action label at the bottom edge, never a tiny gray pseudo-label.
- On narrow screens, shorten internal gaps before shrinking the scoreline. The card must not force long club names into a second line.
- Preserve the ownership modal trigger, fixture IDs, score values, and loading/error/empty states.

### 5.4 `/stats` — `StatsLeaders.jsx`

**Primary question:** Which players lead the selected metric?

- Title and eyebrow remain compact; the first leader should arrive quickly.
- Period segmented control uses the same control treatment as `/table`.
- Position filters become a single horizontal rail or a compact filter row. They must not wrap into a pastel chip cloud.
- Active position uses neon green fill/dark ink; inactive chips are white with ink border; focus uses cyan outline.
- Search remains a 48–54px white control and uses the same shared `SearchBox` styling as `/table` and `/squad`.
- Leader cards: white, one border, one hard shadow. Rank badge and player photo sit in a strong left rail; player name/club/position are central; the selected metric is the large right-aligned number.
- Top three may use gold/cyan/green rank accents, but do not give all three unrelated bright backgrounds.
- Goals, assists, and clean-sheet events are compact dark-ink badges on a single line. No 8px event text.
- The metric label must make the active board obvious: `GW 6 POINTS` or `SEASON POINTS`.
- Preserve the 10-result limit, position logic, search logic, and live values.

### 5.5 `/h2h` — `H2H.jsx`

**Primary question:** Who won this week, and how does that affect the group?

- Keep the H2H-specific gameweek controls separate from the global scope bar as the current routing model intends.
- Historical week buttons should be a scrollable, single-line rail on phones; the active week is green with dark ink and a hard underline/shadow.
- Notice strip is a white card with a 2px cyan/ink border and a strong icon. It should explain unscored ties without looking like an error.
- Matchup card: white for upcoming, white with a strong green `FINAL` rail for played. Avoid recoloring an entire final card neon green; that competes with the score.
- Team marks and names face the central score. Winner gets bold ink and a cyan/green indicator; loser is reduced by weight/opacity only where still readable.
- Score is the focal value. The group/status line is 12–13px and stays readable.
- H2H standings is a separate dark/cyan callout after the matchup list. The two groups use a simple divider and strong group labels, not a stack of nested rounded cards.
- Add a clear visual separation between `MATCHUPS` and `H2H STANDINGS` even if the component architecture remains unchanged.
- Preserve unscored dashes, group rows, win/draw/loss values, and the existing loading/error behavior.

### 5.6 `/cup` — `SuperCup.jsx`

**Primary question:** Who is advancing, what round is this, and who is champion?

- The `cup-hero` is the single tournament callout: white card, dark border, cyan or gold hard shadow. Champion state may use gold; in-progress state uses cyan.
- Keep the `settled/total played` progress visible below 700px; it is useful context, not a desktop-only note.
- Round headings use a bold `R16 · GW 5`, `QF · GW 8`, etc. Keep round name and gameweek on the same visual line where possible.
- On mobile, round groups can remain stacked, but each round must have a strong heading and predictable 16px separation. If a round selector is introduced later, it is a presentation change only and must still render the same real matches.
- Bracket match: white surface, 1px/2px dark border, no shadow on every nested team side. Final gets the primary hard shadow.
- Team side: crest, truncated team name, right-aligned score. Winner uses a green rule or badge; loser uses reduced emphasis, never illegible opacity.
- `Winner` placeholders remain visibly distinct from real teams but use the same layout.
- Preserve round order, match settlement, champion calculation, and all score values.

### 5.7 `/team/:slug` — `TeamView.jsx`

**Primary question:** How did this team line up, and which players produced the total?

**Identity and summary:**

- Reuse the exact identity header and `.points-summary.ff-scorecard` treatment from `/squad`.
- Keep `Back to table` as a visible, high-contrast link above the scorecard. It is navigation, not a decorative eyebrow.
- The team name truncates rather than wraps; crest never shrinks below 44–48px.

**Pitch/list toggle:**

- Keep the existing Pitch/List control and make the selected mode unmistakable through green fill, dark ink, heavier label, and an icon.
- At narrow widths, List should be the fastest readable mode. If the default remains Pitch for product reasons, the CSS still needs to make List a clear one-tap alternative and keep the pitch intrinsic rather than excessively tall.
- Pitch background remains a saturated green or cyan field with dark linework; do not add a gradient or decorative blur.
- Player cards remain white with dark borders and hard shadows. State changes are explicit:
  - `AUTO_SUB_OUT`: dark red ink/border and readable `OUT` badge.
  - `AUTO_SUB_IN`: green border/shadow and readable `IN` badge.
  - `BENCH_UNUSED`: quieter ink, but still at least 12px for useful metadata.
  - Captain: gold `C`; vice-captain: silver/white with dark ink; handover remains gold.
- Player name, opponent, position, and points must remain readable at 320px. No 8–9px information-bearing labels.
- Bench uses smaller cards only because it is secondary; its headings and points remain legible.
- Preserve the stored display state, captaincy, opponent, effective points, modal trigger, and original XI/bench distinction.

### 5.8 Access, splash, and boot failure

**Access — `Access.jsx`:**

- Purple canvas with a white access card, 3px dark border, and a strong cyan hard shadow.
- Brand logo is the largest object; title is bold and short; supporting copy is dark purple, not gray.
- Code field is white with 2px dark border. Focus changes the border to cyan and the hard shadow to green/cyan; no glow.
- CTA is neon green with dark ink, uppercase display type, and a hard ink shadow. Pressed state moves into the shadow.
- Error state is a dark red border/label with a direct message. Do not rely on red alone; keep the `role="alert"` text.
- Demo code is visually secondary but readable and clearly labeled.

**Splash — `Splash.jsx`:**

- Keep the purple canvas and real prefetch progress.
- Use the crest, a high-contrast title, and a compact white progress panel or rule. No fake ambient glow.
- Completed steps use green; failed/skipped uses dark red; pending uses white/ink. Every state includes text.
- On short screens, reduce logo size and vertical gaps; allow vertical scrolling rather than clipping content.
- The progress bar is a solid dark track with a green or cyan fill and square/low-radius ends.

**Boot failure — `ErrorState` / `ErrorBoundary`:**

- Use a white error panel with a 2px dark/red border and hard red or cyan shadow.
- Title is the first strong element, message is 14–16px dark purple, retry is a green/cyan CTA with a clear disabled state.
- Preserve retry behavior and error semantics.

### 5.9 Shared empty, loading, and inline error states

- `EmptyState`: white panel, dashed dark border, green/cyan icon, strong dark-purple title, readable explanatory copy. Empty is not an error and should not be colored red.
- `InlineError`: white panel with a dark-red rule and a clear retry button. Keep the actual server message when present.
- `LoadingBlock`: skeletons should be solid white/dark-purple blocks with a crisp motion cue or static contrast. Do not use gray shimmer gradients.
- Loading rows must match the approximate final row height so the layout does not jump.
- Every state panel uses the same internal padding and title/body rhythm; state styling should not introduce a new surface system.

---

## 6. Overlay and modal upgrade

### 6.1 Shared modal shell

Applies to `PlayerModal.jsx` and `FixtureOwnershipModal.jsx`.

- Keep the existing focus trap, Escape close, backdrop close, and focus restoration.
- Backdrop: solid dark-purple transparency only if needed for context; no blur and no frosted effect.
- Modal: crisp white surface, 3px dark border, 6–8px hard ink shadow, readable max height, safe-area padding.
- Close button: 44px hit target, dark ink on white with a cyan hover/focus state.
- On phones, use a bottom sheet with a square-ish 12–16px top radius; on wider screens, use a centered white dialog.
- Sections are separated by spacing and 1px dark-purple dividers, not a nested box around every paragraph.

### 6.2 Player detail — `PlayerModal.jsx`

- Hero: player image, club/position, captaincy badge, and total. The total is a bold green-text number on white; never neon green.
- `Points ledger`: a clean three-column list: event, value, points. Total row gets a 2px top rule and the largest weight.
- Positive points use green text; negative points use dark red; neutral values use dark purple.
- `Breakdown pending` is a readable dark-purple note. It must not imply missing points are zero.
- `Last 5`: white chips with dark borders, green/dark-red numeric result states, and readable GW labels. DGW labels are secondary but not microscopic.
- DGW tabs: active tab uses neon green/dark ink; inactive tabs are white/dark border. The match card uses a white surface and one cyan hard shadow when active.
- Stats grid, if present in existing markup, should use bold numbers and short labels without a gray wash.
- Preserve server-authoritative `final_points`, pending breakdown behavior, multiplier display, and real match data.

### 6.3 Fixture ownership — `FixtureOwnershipModal.jsx`

- Hero shows both club marks, `GW · status`, the matchup title, and score/kickoff. The score is centered and high contrast.
- Home/away ownership sections use strong club headings and a single readable player list per club.
- Rows: player photo, player name, club/owner metadata, and points. Use 1px dividers or one thin bordered row treatment; do not nest multiple offset shadows.
- Home and away may use cyan vs green section rules, but keep both on white and maintain the same type hierarchy.
- Empty ownership is a neutral data state with a shield icon, not an error red panel.
- Preserve group side, owner labels, points, retry, loading, and empty behavior.

---

## 7. CSS cleanup and implementation order

This is a styling refactor, not a component rewrite. The cascade should become easier to reason about while preserving active class names.

### Phase 1 — Establish the visual authority

1. Add the purple/white/ink token block and define the missing font variables.
2. Remove or rewrite conflicting dark-theme/gradient recommendations and unused token declarations.
3. Normalize base type, body overflow, focus outlines, button/input hit areas, and tabular numerals.
4. Create one hard-shadow hierarchy: passive divider, interactive row, primary callout.
5. Remove blur, `backdrop-filter`, gradient, and low-contrast gray styles from the visual system.

### Phase 2 — Tune the shared shell

1. Tune `.topbar`, `.brand`, `.sync-stamp`, `.comp-trigger`, and `.icon-button` together at 320px, 360px, and 700px.
2. Tune `.scope-bar`, `.gw-pill`, and `.gw-menu` without reintroducing legacy scope selectors.
3. Make bottom-nav active state legible through shape, weight, and indicator; tie clearance to the safe area.
4. Normalize `.page-section`, `.section-heading`, `.eyebrow`, and `.update-note` so every route starts with the same rhythm.

### Phase 3 — Tune information surfaces

1. Leaderboard row and column alignment.
2. Squad identity, scorecard, accordions, and rows.
3. Fixture groups/cards and the ownership affordance.
4. Stats filters and leader cards.
5. H2H matchups/standings and Super Cup bracket.
6. Team pitch/list/player state styling.

### Phase 4 — Tune states and overlays

1. Access and splash short-viewport layouts.
2. Loading, empty, inline error, and boot error surfaces.
3. Player modal ledger/form/DGW sections.
4. Ownership modal club groups and rows.
5. Reduced-motion behavior and focus-visible verification.

### Phase 5 — Consolidate the stylesheet

- Keep one authoritative rule per active selector wherever possible.
- Group rules by tokens, shell, shared controls, route surfaces, overlays, and responsive overrides.
- Delete stale selectors only after confirming they are not rendered by JSX.
- Do not rename active classes merely to make the stylesheet look cleaner; that would widen the scope into a component migration.
- Keep comments about data/state semantics near the selector that expresses them.

---

## 8. Validation checklist

### Brand fidelity

- [ ] Page canvas is `#6c18d1`.
- [ ] Information cards are crisp white with dark purple ink and borders.
- [ ] Hard offset shadows use zero blur and remain visibly tactile.
- [ ] Green, cyan, and gold have clear meanings.
- [ ] No gradients, glassmorphism, blur, glow clouds, or pastel-minimal surfaces exist in the final styles.

### Typography and clarity

- [ ] `--font-heading` and `--font-body` are defined and applied consistently.
- [ ] No important label or value is below 12px.
- [ ] Page titles are bold but do not push the first useful data block below the first viewport unnecessarily.
- [ ] Every score/rank/points value uses tabular numerals.
- [ ] Primary values are larger than their labels and secondary metadata.
- [ ] White-card text is dark purple or a checked text-safe green/cyan, never neon green.

### Layout and responsive behavior

- [ ] `/table`, `/squad`, `/fixtures`, `/stats`, `/h2h`, `/cup`, and `/team/:slug` render without horizontal overflow at 320px.
- [ ] Header controls do not wrap or collide at 320px.
- [ ] Gameweek controls do not create a second competing state or overflow the page.
- [ ] Leaderboard headings align with every row at mobile and desktop widths.
- [ ] Team and player names truncate intentionally rather than breaking score columns.
- [ ] Team pitch remains usable, and list mode is a fast readable alternative.
- [ ] Bottom-nav clearance leaves the final content row visible above the safe area.
- [ ] Access and splash content are not clipped in short or landscape viewports.

### Data and interaction safety

- [ ] No data-fetching or scoring logic was moved into CSS or presentation helpers.
- [ ] Real loading, empty, error, retry, stale-sync, and unscored states remain distinct.
- [ ] Existing URL gameweek state remains the single source of truth.
- [ ] Real score/points/ownership values remain unchanged.
- [ ] Links, team drill-downs, fixture ownership, player detail, and competition routes still work.
- [ ] Modal focus trap, Escape close, backdrop close, and focus restoration still work.
- [ ] Captaincy and auto-substitution states remain explicit and readable.

### Accessibility and interaction

- [ ] Icon buttons, chips, accordion headers, and nav items have at least 44px effective hit areas.
- [ ] Focus-visible outlines are high contrast on both purple and white.
- [ ] Status is communicated through text plus color/shape, never color alone.
- [ ] Reduced-motion users do not receive distracting movement.
- [ ] Error and empty states retain their semantic roles and readable messages.

---

## 9. Definition of done

The upgrade is complete when the interface feels like one competition product rather than a sequence of independently decorated screens:

1. A bold purple canvas frames crisp white data surfaces on every route.
2. Each page has one obvious focal value and one obvious next action.
3. Hard borders and offset shadows communicate interaction and importance instead of covering every nested element.
4. Typography is larger where information matters and quieter where it does not, with no unreadably small metadata.
5. Scores, rankings, fixture states, captaincy, substitutions, and errors remain immediately distinguishable.
6. Mobile users reach the first useful data without excessive chrome and can scan it without horizontal overflow.
7. The visual identity remains unapologetically Neo-Brutalist: high contrast, squared rhythm, loud accents, solid surfaces, and zero visual softness.
8. The React component boundaries and real data/scoring behavior remain intact.
