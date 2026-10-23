# Mobile-first UI/UX audit — Fantasy Fortress

**Audit focus:** spacing and white space, borders, control sizes, typography, image/logo scale, information density, and mobile scanning.

**Primary target:** 360 px wide mobile screens, with 320 px treated as the smallest supported width and 390–430 px as the comfortable range.

**Audit type:** static visual audit of the current React/CSS implementation. The findings below are grounded in the current selectors and components in `client/src`; they should be followed by device testing at 320 × 568, 360 × 800, 390 × 844, and 430 × 932.

**Related documents:** `ux-audit.md` covers largely functional/routing issues and `ux-plan.md` records previous UX implementation work. This document deliberately concentrates on the visual system and mobile information density.

---

## 1. Executive summary

Fantasy Fortress has a distinctive, memorable visual language: a purple background, neon green/cyan accents, strong crests, large condensed headings, and tactile offset shadows. The structure is now much better than a six-tab mobile layout: four primary bottom-nav items are present, competition routes are moved into the header, and gameweek scope is shared.

The current visual problem is not a lack of styling. It is **too much styling and too much information competing at the same level**, especially after the final `SCALE-UP PASS` in `client/src/index.css`.

On mobile, the interface currently tends to be:

- **Tall before the user reaches the data:** an 84 px header, sticky gameweek bar, 28 px section padding, 20 px section gaps, large headings, mover pills, search, and then the list.
- **Dense inside each data unit:** leaderboard rows put rank, logo, team, manager/GW description, movement, GW points, and total points into one narrow five-track row.
- **Visually noisy:** almost every card has a 2–3 px border, a hard offset shadow, a rounded container, and sometimes another bordered container inside it.
- **Inconsistent in emphasis:** the app makes primary values large, but also makes secondary labels uppercase, letter-spaced, boxed, and brightly colored. Everything starts to look like a callout.
- **Too dependent on vertical layouts:** the pitch, H2H list, Super Cup rounds, grouped fixtures, and squad sections all stack. The user must scroll through many individually decorated blocks.
- **At risk of poor readability:** the smallest player metadata is 8–11 px, while the neon primary color is used as text on white cards even though it has only approximately **1.32:1 contrast against white**.

### Overall assessment

| Area | Current assessment | Direction |
|---|---:|---|
| Brand distinctiveness | Strong | Preserve the palette and crest language |
| Mobile scanability | Needs work | Establish one primary value per row/card |
| Spacing consistency | Mixed | Introduce a small spacing scale and reduce vertical chrome |
| Touch ergonomics | Mostly good, with exceptions | Make every icon/chip hit area at least 44 × 44 px |
| Information density | Too much at once in key screens | Progressive disclosure and compact row patterns |
| Typography | Strong headings, weak small metadata | Reduce heading dominance and eliminate sub-12 px UI text |
| Borders/shadows | Over-applied | Use them as hierarchy, not as decoration on every layer |
| Accessibility/readability | Needs correction | Fix neon text contrast and short-viewport/safe-area behavior |

**Recommended product direction:** keep the expressive visual identity, but make the default mobile experience calmer: smaller structural chrome, fewer nested boxes, one clear primary number per row, and secondary information available by context rather than displayed everywhere.

---

## 2. Current mobile baseline

The values below are important because they explain why the app feels simultaneously large and crowded.

| Surface | Current implementation | UX consequence |
|---|---|---|
| Header | `.topbar` is ultimately 84 px high; compact logo is rendered at 34 px by the inline `BrandLogo` size; title is 19 px and season is 13 px | Consumes significant first-screen space; the brand/right-side controls can become tight at 320 px |
| Gameweek bar | Sticky below the 84 px header; 10 px vertical padding; 38 px stepper; 36 px chips; optional `Latest` button | Useful control, but too many controls compete in one horizontal line on narrow screens |
| Page shell | `.page-section` uses 28 px vertical and 16 px horizontal padding, with a 20 px gap between children | Comfortable in isolation, but expensive when a page has 5–8 stacked sections |
| Bottom nav | Ultimately 84 px high, with 24 px icons and 12.5 px labels | Good visibility, but leaves a large fixed obstruction; current bottom clearance is not explicitly tied to the bottom safe-area inset |
| Mobile H1 | Ultimately 42 px; desktop override becomes 54 px | Strong brand presence, but `The standings`, `H2H matchups`, and long team names can wrap or dominate the data |
| Search | 54 px high with 16 px text | Good touch and input size; retain this general pattern |
| Segmented buttons | 44 px high | Good baseline; keep the hit target, but reduce surrounding chrome rather than reducing the button itself |
| Filter chips | 10 × 16 px padding with 13.5 px text; wrapping is allowed | Accessible enough as visible controls, but wrapping adds unpredictable vertical height |
| Leaderboard row | 86 px minimum, 12 px/14 px padding, five CSS tracks, 12 px gap | Too many data points for a narrow row; likely to truncate or misalign at 320 px |
| Squad row | 66 px minimum; 15.5 px player name; small club/secondary values | Reasonable, but nested accordion/table borders make the screen feel heavier than necessary |
| Fixture card | 18 px padding, 16 px gap, 38 px club marks, 92 px score block | Readable, but `FT`/`Full time` and `VS`/status repeat information; can be shortened |
| Team pitch | 760 px minimum height; player cards 88 × 124 px; compact bench cards 70 × 100 px | A mobile visualisation becomes a long scroll; four cards in a forward line have very little room at 320–360 px |
| Player card metadata | `.player-bottom small` remains 8 px; position tag remains 9 px | Too small for a primary data view, particularly on outdoor/mobile use |
| Summary cards | Points card has 22 px padding and a 40 px number | Visually attractive but vertically expensive; should become a compact horizontal summary on mobile |
| Cards | Commonly 2 px borders plus 4–8 px hard offset shadows | Strongly branded, but repeated at every nesting level creates clutter and reduces usable space |

The last `SCALE-UP PASS` at the end of `client/src/index.css` wins over earlier mobile values. It improves minimum readability in some components, but it also increases the header, rows, pitch, bottom navigation, summary card, and fixture controls together. It should be tuned as a system rather than adjusted component by component.

---

## 3. Priority findings

### P0 — Fix readability and layout safety before polishing

#### 3.1 Neon green is used as text on white cards

`--primary` is `#39ff91`. It is used as text in selectors such as `.score-badge strong`, `.leader-value`, `.fixture-score strong`, and `.h2h-score strong`. Against the white card background, that color is approximately **1.32:1**, which is not readable as normal or large text under WCAG contrast guidance.

**Recommendation**

- Use dark purple (`--card-foreground`) for text and reserve neon green for fills, borders, indicators, and large decorative marks.
- Create a separate text-safe accent token, for example `--primary-text: #087a45` or a darker green that is checked against both white and purple backgrounds.
- Do not use opacity to solve this; opacity makes contrast worse.
- Keep neon green text on the dark purple background only where contrast is verified.

#### 3.2 The leaderboard row has too many tracks for 320–360 px

`Leaderboard.jsx` displays rank, crest, team/manager copy, optional movement, GW points, and total points. `.team-row` ultimately uses five tracks: rank, team, movement, GW, total. At narrow widths, the team name and manager line are competing with two numerical columns and a movement value.

There is also a visual alignment risk when the optional `.rank-move` element is not rendered: the header remains five tracks, but the row has one fewer grid child, so GW/Total can auto-place one track earlier than their headings.

**Recommendation**

- Give GW and Total explicit grid positions, or always render a reserved movement cell.
- Use a four-track mobile model: `rank/movement | team | GW | total`.
- Make Total the only large number. Make GW a smaller contextual value.
- Put the movement arrow beside the rank badge or under the team name instead of giving it a full column.
- At 320 px, hide the manager name by default or move it into a second line revealed by the team detail page.
- Keep the row around 72–76 px rather than 86 px once the content model is simplified.

#### 3.3 The pitch should not be the default mobile information view

`TeamView.jsx` defaults to `view = 'pitch'`. The mobile pitch is ultimately at least 760 px tall, while each player card is 88 × 124 px. At 320–360 px, a four-player line cannot comfortably fit four cards at that width with borders, gaps, and readable labels. The visual formation is attractive, but it is slow for the most common task: checking names and points.

**Recommendation**

- Default to **List** below 600–700 px and keep Pitch as an explicit visual toggle.
- If Pitch remains the default, use responsive cards: approximately 68–76 px wide at 360 px and 60–68 px at 320 px, with the club code moved out of the card or shown only in the modal.
- Reduce pitch height to an intrinsic formation height instead of a fixed 760 px minimum.
- Keep player names at least 12–13 px and never rely on the current 8 px club metadata for important information.
- Make the list view the fast scan: position, player, club, points, and a clear total.

---

### P1 — Reduce mobile chrome and clarify hierarchy

#### 3.4 Too much vertical chrome appears before the first useful list item

A typical page can include the 84 px header, sticky gameweek bar, 28 px top padding, 42 px heading, 20 px gap, segmented control, mover pills, and search before the first row. The components are individually reasonable, but together they push the actual standings or player list below the fold.

**Recommendation**

- Keep page horizontal padding at 16 px.
- Reduce mobile page top/bottom padding to 20–24 px and the default section gap to 16 px.
- Use 12 px between related controls and 20 px between unrelated sections.
- Make the H1 30–34 px on mobile, with 1.05–1.1 line-height. Preserve the large 42–54 px treatment for desktop or hero screens.
- Combine related controls into one compact control group instead of treating each as a full-height section.
- Do not remove whitespace from inside primary cards; remove repeated whitespace between decorative wrappers.

#### 3.5 Header is crowded at the smallest supported width

`Header.jsx` puts the crest/brand, sync stamp, and `Comps` trigger in one row. The brand title/season are adjacent inline elements with no explicit layout gap or stacking rule. At 320 px, the brand and two right-side controls can collide or force awkward shrinking.

**Recommendation**

- Use a compact header at 320–380 px: crest 36–40 px, brand title 16–17 px, season as a small second line or badge, and a shorter sync label such as `Updated 2h`.
- Give `.brand-name` an explicit `display: flex` layout with a 2–4 px gap; do not rely on inline adjacency.
- On narrow widths, show competitions as a single icon button with an accessible label, or let the sync stamp collapse to an icon plus accessible text.
- Keep the header at 64–72 px unless the current sync state genuinely needs a second row.

#### 3.6 Borders and offset shadows are applied to almost every layer

The app uses a 2 px border, rounded corners, and an offset hard shadow on leaderboard rows, fixture cards, H2H cards, the cup hero, bracket, search, team selector, stat cards, accordion groups, and player cards. Nested components add additional borders: accordion → table → row, fixture group → fixture card → score block, bracket → match → team side.

This is consistent with the brand, but visual hierarchy collapses because passive and interactive surfaces have the same treatment.

**Recommendation: establish three surface levels**

1. **Page surface:** no border/shadow; separated by spacing.
2. **Interactive surface:** 1–2 px border, one modest shadow, clear hover/pressed state.
3. **Primary callout:** the existing hard accent shadow can remain for the points summary, champion, or selected state.

Suggested mobile defaults:

- Passive card: 1 px border, no offset shadow.
- Interactive card: 1–2 px border and `2px 2px 0` shadow.
- Primary callout: 2 px border and `4px 4px 0` shadow.
- Avoid a bordered box inside another bordered box unless the inner box is a real interactive item.
- Use a 1 px divider for table rows instead of a full card treatment per row.

#### 3.7 Mover pills consume too much space for secondary information

`Leaderboard.jsx` can show up to three `.mover` pills above the search and table. Because they wrap, a narrow screen can lose one or more rows of vertical space to badges that are not needed to answer “where is my team?”

**Recommendation**

- Replace the three pills with one compact line: `Top mover · Team ↑2 · 47 pts`.
- Make it expandable to reveal the biggest climber, faller, and haul.
- Alternatively, show only one insight by default and place the rest behind a “More insights” disclosure.
- Keep the data in the DOM/accessibility tree, but do not make all of it visually dominant at once.

#### 3.8 The gameweek bar is useful but overfilled on mobile

`ScopeBar.jsx` combines a label, previous/next stepper, current number, a chip for every gameweek, and a `Latest` action. At a small width, the chips and the latest control compete for horizontal space while the bar is sticky and consumes screen height.

**Recommendation**

Use a two-level mobile pattern:

- Row 1: `GW 6`, previous/next buttons, and `Latest` only when needed.
- Row 2: a horizontally scrollable week rail, or replace the full chip rail with a single `Choose gameweek` button that opens a bottom sheet after the season has more weeks.

The week rail should be visually secondary to the current week. Do not force the user to see every historical week on every scroll. If the rail remains, automatically scroll the selected week into view; a hidden scrollbar should not make the active state undiscoverable.

#### 3.9 Squad repeats the selected team and spends too much vertical space on the summary

`Squad.jsx` puts the selected team in the page H1, then renders a `Team` select with the same selected team, then renders a large points summary card. This is clear but repetitive on mobile.

**Recommendation**

- Replace the page H1 + separate selector with a single heading row containing crest, team name, and a compact dropdown affordance.
- Convert the points card to a horizontal summary: `GW 6 total 42 pts` with season total and player count as small secondary text.
- Keep the selector as a large 48 px control when it is opened, but do not make the closed state visually duplicate the heading.
- Use a 56–60 px accordion header and 56 px player rows; preserve whitespace between position groups rather than inside every nested box.
- Consider single-open behavior on mobile. If multiple groups remain open, make that an intentional “expanded all” state rather than an accidental source of a very long page.

#### 3.10 Fixtures repeat status information and can be a compact score list

Each fixture card includes kickoff/`FT`, an icon plus `Full time`/`Upcoming`, two team areas, club marks, and a score block. `FT` plus `Full time` is redundant. The card is readable but vertically expensive when several fixtures are open.

**Recommendation**

- Use one status treatment: `FT` or a small status dot plus `Full time`, not both.
- Reduce club marks to 28–32 px in the list and the score block to approximately 72–80 px on mobile.
- Use 12 px card padding and 8–12 px internal gaps.
- Consider a compact match row: `Home crest Home  2–1  Away Away crest`, with kickoff/status in a single metadata line.
- Keep the current expandable GW grouping; it is a good pattern for reducing scroll.
- The `1fr auto 1fr` matchup grid is fragile at 320 px once 38 px club marks, a roughly 92 px score block, gaps, padding, and long uppercase club names are combined. Use 28–32 px marks and a 72–80 px score block, or switch to a centered two-line matchup when the available width is narrow.

#### 3.11 Stats filters and ranked cards need a compact mobile mode

`StatsLeaders.jsx` puts the period toggle, five position chips, search, and then up to ten ranked cards in one vertical flow. The filter chips are allowed to wrap, so a 320 px screen can spend two or more rows on `ALL / GKP / DEF / MID / FWD` before the first player appears.

**Recommendation**

- Keep the period toggle at 44 px.
- Make the position filters a one-line horizontal rail, a native/select-like “Position” control, or a compact two-state filter button rather than a wrapping chip cloud.
- Keep search at 48–54 px and place it after the filters only when a search is active; otherwise let the top performers appear earlier.
- Use a top-three visual podium or small proportional bars, followed by a compact list for positions 4–10. This communicates relative performance with fewer repeated cards.
- Keep event badges inline with the player row and do not create a new vertical line for them.

#### 3.12 H2H and Super Cup need mobile-specific information architecture

H2H renders matchups and then both group standings in one long page. Super Cup renders every round vertically, with nested match and team-side boxes. Both are sensible desktop presentations but are not the fastest mobile scan.

**Recommendation**

- H2H: provide a local `Matchups / Standings` segmented control, defaulting to the selected week’s matchups. Keep a compact “Group standings” disclosure below or beside it.
- H2H: render each matchup as a single score row with small team marks; use winner color and bold score instead of extra nested padding.
- H2H currently renders all of its historical week filters as chips. After the season grows, replace the wrapping chip list with the same stepper/rail pattern proposed for the global gameweek bar.
- Super Cup: show a round selector (`R16`, `QF`, `SF`, `Final`) and one round at a time on mobile. Keep the full bracket layout at wider widths.
- Keep the `played/total` progress line visible on mobile; the current `.update-note` is hidden below the 700 px breakpoint, so phones lose useful tournament context.
- Put champion/progress at the top as the one primary callout; do not make every bracket side look like a separate card.

---

### P2 — Polish, consistency, and pleasantness

#### 3.13 Small metadata should stop at 12 px

The current player card uses 8 px club metadata and a 9 px position tag. Those sizes may be acceptable for a decorative football formation on desktop, but not as the only readable source of club/position information on mobile.

**Recommendation**

- Minimum UI text: 12 px.
- Secondary metadata: 12–13 px with at least 1.25 line-height.
- Body copy: 14–16 px.
- Player/team names: 15–17 px.
- Numeric totals: 20–28 px depending on importance.
- Use uppercase/letter spacing only for short labels; use sentence case for explanatory text and long names.

#### 3.14 Logos and images need a role-based size system

Current image sizing is close to useful, but the system is implicit: inline `style` sizes in `BrandLogo`, `TeamMark`, and `PlayerPhoto` interact with CSS overrides. This makes it harder to tune the mobile layout predictably.

Suggested role-based sizes:

| Role | 320–430 px target |
|---|---:|
| Header crest | 36–40 px |
| Access/splash logo | 104–128 px on short screens; 144–152 px on tall screens |
| Leaderboard/team list crest | 32–36 px |
| Fixture club mark | 28–32 px |
| Player list photo/fallback | 36–40 px |
| Player modal image | 56–64 px |
| Pitch player image | 32–40 px inside a 68–76 px card |

Use explicit component size variants (`sm`, `md`, `lg`) rather than relying on a CSS rule and an inline style to fight for control.

#### 3.15 Access and splash screens need a short-viewport mode

The access card ultimately uses a 152 px logo, 42 px vertical padding, a 72 px access input, a 52 px CTA, and several text blocks. `.access-screen` and `.splash` also use `overflow: hidden`. This can clip the lower content on short phones or landscape orientation.

**Recommendation**

- Allow vertical scrolling on short viewports, or use `min-height` plus `overflow-y: auto` instead of hiding overflow.
- Under a height query such as `max-height: 700px`, reduce the logo to 104–120 px, card padding to 24 px, and vertical gaps to 12–16 px.
- Keep the code input and CTA at their current touch-friendly sizes.

#### 3.16 Bottom navigation needs explicit safe-area clearance

The app has `viewport-fit=cover` and the modal accounts for `env(safe-area-inset-bottom)`, but the bottom nav height/padding and `.app-shell` bottom padding are not expressed as one safe-area-aware clearance token. On an iPhone with a home indicator, content can feel too close to or be visually covered by the fixed nav.

**Recommendation**

- Define one bottom-nav height and one clearance value, for example `calc(72px + env(safe-area-inset-bottom))`.
- Use the same value for the nav and `padding-bottom` on `.app-shell`.
- Keep each nav item’s effective hit area at least 44 px high.
- Test a long list with the last row visible above the home indicator, not merely the nav itself.

#### 3.17 The active state needs to be legible without relying only on neon color

The active bottom-nav and segmented-control states primarily use neon green. This is visually on-brand, but active state should also be conveyed through a shape, weight, indicator, or background change.

**Recommendation**

- Keep the top active indicator, but add a filled/contrasting pill or stronger label weight in the segmented controls.
- Use dark text on neon fills.
- Make focus, active, and selected states distinct: focus should be an outline, active a fill/indicator, pressed a small motion or tonal change.

---

## 4. Recommended mobile visual system

This is the proposed “sweet spot”: compact enough to reduce scrolling, but not so compressed that the app feels like a spreadsheet.

### 4.1 Spacing scale

Use a 4 px base with a limited set of values:

| Token | Value | Use |
|---|---:|---|
| `space-1` | 4 px | icon/label or metadata gap |
| `space-2` | 8 px | chip gaps, compact list gaps |
| `space-3` | 12 px | card internal groups, row padding |
| `space-4` | 16 px | page horizontal padding, card padding |
| `space-5` | 20 px | between related blocks |
| `space-6` | 24 px | between major sections |
| `space-8` | 32 px | hero/access emphasis only |

Rules:

- Page padding: 16 px horizontal, 20–24 px vertical.
- Major section gap: 20 px.
- Related control gap: 8–12 px.
- Card internal padding: 12–16 px.
- Avoid 28–42 px padding except on access/hero surfaces.

### 4.2 Type scale

| Role | Mobile target |
|---|---:|
| Page title | 30–34 px / 1.05 |
| Section title | 22–26 px |
| Card/team name | 15–17 px |
| Body | 14–16 px / 1.35–1.5 |
| Secondary metadata | 12–13 px |
| Uppercase label | 11–12 px, short only |
| Primary total | 24–30 px |

No information-bearing UI should be 8–10 px. If a number or label matters, it should be readable without zooming or careful squinting.

### 4.3 Control and touch targets

- Icon buttons: 44 × 44 px hit area, even if the icon itself is 18–22 px.
- Inputs/selects: 48–52 px high.
- Segmented controls: 44 px high.
- Filter chips: 36 px visual height, with 44 px vertical hit area where practical.
- Accordion headers: 56 px high.
- Bottom-nav items: at least 44 px effective height within a 72 px bar.
- Modal close: current 40 px is close; increase to 44 px if there is room.

### 4.4 Border and shadow hierarchy

Do not remove the brand’s tactile character. Assign it meaning:

- 1 px neutral border for grouping.
- 2 px dark border for interactive controls and selected cards.
- Hard offset shadow only on primary callouts and interactive cards.
- Use a divider for repeated rows.
- Use accent border/color for the current gameweek, winner, top three, or selected view; do not accent every card.

### 4.5 Information priority rule

Every mobile card/row should answer, in order:

1. **What is this?** — team/player/match name.
2. **What is the primary result?** — total, GW points, score, or status.
3. **What is the useful context?** — manager, club, rank movement, kickoff.
4. **What is optional?** — events, season comparison, explanatory copy.

Only the first two should always be visually prominent. Context may be a second line; optional information belongs behind a modal, accordion, or detail route.

---

## 5. Better visualisations and alternate presentations

### Standings: compact score table with a detail route

**Default mobile:**

```text
[rank] [crest] Team name                         [total]
       Manager · GW 6: 42 pts  ↑2                  GW
```

- Make the total the right-side anchor.
- Put movement beside rank or on the context line.
- Keep the current GW as a small badge or sublabel.
- Tapping opens the existing team detail page for the complete squad/pitch.

**Optional enhancement:** a thin horizontal progress bar under the top three or behind the current team’s row. Use it only if it adds comparison value; do not introduce a chart for every team.

### Stats: top-three visual podium plus compact list

The current top-ten cards are easy to understand but vertically repetitive. On mobile:

- Show a compact top-three podium row with player image, name, and value.
- Follow with a dense ranked list for positions 4–10.
- Use small event badges only when present; do not reserve vertical space for them.
- A thin proportional bar behind the value can communicate relative performance faster than another bordered card.

### Fixtures: scoreline rows, not repeated cards

Keep the current gameweek accordion, but use a row within it:

```text
FT · GW 6                                  2–1
[home crest] Home                         Away [away crest]
```

For upcoming matches:

```text
Sat 15:00                                  VS
[home crest] Home                         Away [away crest]
```

This preserves scanability and reduces repeated internal padding. The full fixture card treatment can remain on desktop or when a match receives interaction/details.

### Squad: position sections with a compact summary

Use:

```text
Choakers FC                         [GW 6 ▼]
42 pts this week · 15 players · 188 season

GKP  1 player                              ˅
DEF  4 players                             ˅
MID  5 players                             ˅
FWD  5 players                             ˅
```

Open one position at a time by default. Keep the current table columns, but make Season the muted comparison and GW the emphasized value. On mobile, the team selector should feel like part of the heading rather than a second page header.

### Team detail: mobile list first, visual pitch second

Preserve the Pitch view for users who want formation context. Make List the default on mobile because it exposes all 11 names and points in substantially less scroll. The player modal is a good place for event detail and can remain the deeper interaction.

### H2H: two modes instead of one long page

Use `Matchups` and `Standings` as a local segmented control. This avoids making a user scroll through all matchups just to find the group table. If both must remain on one page, make standings collapsed by default after the first visit.

### Super Cup: round selector on mobile

A full bracket is a good desktop visualization but a poor narrow-screen layout. On mobile, show:

- champion/progress summary,
- a round selector,
- one round’s matches,
- next/previous round controls.

At 700 px and above, restore the multi-round bracket presentation.

---

## 6. Suggested implementation order

### Phase 1 — safety and mobile layout

1. Fix primary text contrast on white surfaces.
2. Fix leaderboard explicit grid placement/reserved movement cell.
3. Add short-viewport behavior for Access/Splash.
4. Make bottom-nav clearance safe-area aware.
5. Add 320/360 responsive rules for header, gameweek bar, and pitch/list default.

### Phase 2 — density and hierarchy

6. Tune the mobile spacing/type tokens to the recommended ranges.
7. Reduce repeated borders/shadows and nested card treatment.
8. Simplify mover strip and scope bar.
9. Make Squad summary/selector a single compact heading pattern.
10. Remove redundant fixture status labels.

### Phase 3 — alternate visualisations

11. Make Team List the mobile default.
12. Add H2H Matchups/Standings modes.
13. Add Super Cup round selector on mobile.
14. Consider top-three podium/proportional bars for Stats.

### Phase 4 — validation

Test all of the following with real data and long names:

- 320 × 568: narrow and short Android-sized viewport.
- 360 × 800: primary mobile target.
- 390 × 844: common modern phone.
- 430 × 932: large phone.
- 568 × 320: landscape/short viewport for Access and Splash.
- Long team names, long manager names, two-digit scores, missing logos, no movement value, no stats, and a stale sync stamp.
- Last item in every list above the fixed bottom navigation and iOS home indicator.
- Text zoom at 200% and reduced-motion mode.

---

## 7. Acceptance checklist for the redesign

### Spacing and scroll

- [ ] The first useful data row is visible earlier on a 360 px screen.
- [ ] No important content is hidden behind the bottom nav or iOS home indicator.
- [ ] Related controls are within 8–12 px; major sections are separated by 20–24 px.
- [ ] A normal standings scan does not require opening multiple decorative cards.

### Typography and imagery

- [ ] No information-bearing text is below 12 px.
- [ ] Primary totals are visually dominant without making the page title overpowering.
- [ ] Team/player names remain readable at 320 px without unexpected horizontal overflow.
- [ ] Logos retain a consistent role-based size and never appear as opaque fallback boxes behind transparent images.

### Controls

- [ ] Every icon action has a 44 × 44 px hit area.
- [ ] Gameweek selection works without a crowded single-row control at 320 px.
- [ ] Segmented controls, chips, and accordions have distinct selected/focus/pressed states.
- [ ] Search, select, and modal controls remain usable with one thumb.

### Information hierarchy

- [ ] Each row/card has one obvious primary value.
- [ ] Secondary details are present but not boxed and emphasized equally.
- [ ] H2H and Cup do not require a long vertical scan to switch between the main views.
- [ ] Team List is the fastest mobile route to names and points; Pitch remains available as a visual mode.

### Accessibility

- [ ] Accent text passes contrast checks on every background.
- [ ] Zoom, landscape, reduced motion, and long strings are tested.
- [ ] Focus rings remain visible against the purple/neon palette.
- [ ] Status meaning is not conveyed by color alone.

---

## Final recommendation

Do not redesign Fantasy Fortress into a generic white dashboard. The brand is one of its strengths. Instead, treat the current implementation as a **high-energy visual skin over a calmer mobile information model**:

- reduce structural chrome,
- reserve borders and shadows for hierarchy,
- make one result dominant per row,
- use list-first presentations on mobile,
- keep logos visible but role-appropriate in size,
- and move optional competition/detail information behind compact selectors or disclosures.

That approach should reduce scroll without creating a cramped interface, while preserving the playful, competitive feel that distinguishes Fantasy Fortress.