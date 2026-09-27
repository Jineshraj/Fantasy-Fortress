# H2H_League Tab — New Layout Plan

## Goals
1. Clear visual separation between Fixtures, Results, Standings, and Knockout Bracket
2. Group A on the left, Group B on the right
3. Per-GW rows with match + score clearly visible
4. Standings updateable without re-running the whole sync
5. Admin can override individual scores and winners without breaking things

## Layout

```
Row 1:   [TITLE: H2H LEAGUE — Group Stage + Knockout]
Row 2:   [blank]
Row 3:   [GROUP A] [blank] [blank] [blank] [blank] [blank] [blank] [blank] [blank] [blank] [blank] [GROUP B]
Row 4:   FIXTURES — Group A | (cols A-E)          | (blank) | FIXTURES — Group B | (cols G-K)
Row 5:   GW  Round  Home  Score(A)  Away  Score(B)   | GW  Round  Home  Score(A)  Away  Score(B)
Row 6:   GW3 Round 1  Aguilas Dorados  53  Reds  45  | GW3 Round 1  Aura Farmers  71  xG Illuminati  28
Row 7:   GW3 Round 1  Aztec Blinders  40  Meridian  27  | GW3 Round 1  Committe Team  45  Relegated FC  32
Row 8:   GW3 Round 1  Choakers FC  62  Mamangam  42  | GW3 Round 1  Jogo Bonito  26  Phoenix Flyers  54
Row 9:   GW3 Round 1  Iberian Wizards  31  La Pulga  49  | GW3 Round 1  Kroos Control  27  Mancunians  53
...
Row 20:  GW20 Round 14  ...
Row 21:  [blank]
Row 22:  [blank]
Row 23:  GROUP A STANDINGS    [blank x10]    GROUP B STANDINGS
Row 24:  Pos  Team  P  W  D  L  GF  GA  GD  Pts   [blank]   Pos  Team  P  W  D  L  GF  GA  GD  Pts
Row 25:  1  Choakers FC  1  1  0  0  62  42  20  3       1  Jogo Bonito  1  1  0  0  62  42  20  3
Row 26:  2  La Pulga  ...
...
Row 33:  8  Mamangam DC  ...
Row 34:  [blank]
Row 35:  H2H KNOCKOUT BRACKET (Top 2 of each group advance)
Row 36:  STAGE  Match  Home  Score  Away  Score  Winner
Row 37:  SEMI FINAL 1 (GW22)  SF1  A1  -  B2  -  TBD
Row 38:  SEMI FINAL 2 (GW22)  SF2  B1  -  A2  -  TBD
Row 39:  [blank]
Row 40:  FINAL (GW24)  F1  Winner SF1  -  Winner SF2  -  TBD
```

## Column layout

### Fixtures + Results (rows 4-20)
| Col | Group A | Group B |
|-----|---------|---------|
| A | GW (e.g., "GW3") | (Group A only) |
| B | Round (e.g., "Round 1") | (Group A only) |
| C | Home Team | GW |
| D | Home Score | Round |
| E | Away Team | Home Team |
| F | Away Score | Home Score |
| G | (blank separator) | Away Team |
| H | (blank) | Away Score |
| I | (blank) | (blank) |
| J | (blank) | (blank) |
| K | (blank) | (blank) |

Hmm — with 8 columns per group (2 for GW+Round, 4 for Home+Score+Away+Score), plus a separator, we need 8 + 1 + 8 = 17 columns. That's too wide for one tab.

## Simpler approach: stacked layout

Two groups stacked vertically, each with their own 6-column block. Use the same columns for both.

### Combined layout (recommended)
```
Row 1:   [TITLE: H2H LEAGUE]
Row 2:   [blank]
Row 3:   === GROUP A FIXTURES & RESULTS ===
Row 4:   Headers: GW | Round | Home | Home Score | Away | Away Score
Row 5:   GW3 | Round 1 | Aguilas Dorados | 53 | Reds | 45
Row 6:   GW3 | Round 1 | Aztec Blinders | 40 | Meridian Athletic | 27
...
Row 20:  GW20 | Round 14 | Mamangam DC | - | La Pulga | -
Row 21:  [blank]
Row 22:  === GROUP B FIXTURES & RESULTS ===
Row 23:  Headers: GW | Round | Home | Home Score | Away | Away Score
Row 24:  GW3 | Round 1 | Aura Farmers | 71 | xG Illuminati | 28
...
Row 39:  GW20 | Round 14 | Phoenix Flyers | - | Mancunians | -
Row 40:  [blank]
Row 41:  === STANDINGS ===
Row 42:  Headers (2x side by side): Pos | Team | P | W | D | L | GF | GA | GD | Pts
Row 43:  Group A row 1 (1st place)
Row 44:  Group A row 2
...
Row 50:  Group A row 8 (8th place)
Row 51:  [blank]
Row 52:  Group B row 1
...
Row 59:  Group B row 8
```

This uses only 6 columns (A-F), leaving room for expansion. Clear section breaks (=== headers).

### Knockout bracket (added at end)
```
Row 60:  === KNOCKOUT BRACKET (Top 2 of each group) ===
Row 61:  STAGE | Match | Home | Home Score | Away | Away Score | Winner
Row 62:  SEMI FINAL 1 (GW22) | SF1 | A1 | - | B2 | - | TBD
Row 63:  SEMI FINAL 2 (GW22) | SF2 | B1 | - | A2 | - | TBD
Row 64:  [blank]
Row 65:  FINAL (GW24) | F1 | Winner SF1 | - | Winner SF2 | - | TBD
```

## New column mapping

| Col | Group A (rows 4-20) | Col | Group B (rows 23-39) |
|-----|---------|-----|---------|
| A | GW | A | GW |
| B | Round | B | Round |
| C | Home Team | C | Home Team |
| D | Home Score | D | Home Score |
| E | Away Team | E | Away Team |
| F | Away Score | F | Away Score |

(Same columns for both groups, just different row ranges)

## Standings column mapping (rows 41-59)

For 2 groups side by side, we need 10 cols per group = 20 cols. That's too wide.

**Better: stack Group A above Group B**

```
Row 42:  [Group A STANDINGS]
Row 43:  Pos | Team | P | W | D | L | GF | GA | GD | Pts
Row 44-51: 8 team rows
Row 53:  [Group B STANDINGS]
Row 54:  Pos | Team | P | W | D | L | GF | GA | GD | Pts
Row 55-62: 8 team rows
```

10 columns wide, all fits. Clear separation.

## Write operations

### Fixtures sync
- Each GW: 2 matches per row (one for each group), so 4 rows per GW × 14 GWs = 56 rows
- For each row, write GW (col A), Round (col B), Home (col C), Home Score (col D), Away (col E), Away Score (col F)
- Group A: write to row 5 + (GW_index * 2) (since 2 matches per GW)
- Group B: write to row 24 + (GW_index * 2)
- Wait, actually there are 4 matches per GW per group (8 total per GW), and they need to be on separate rows (or the same row with multiple match columns)

Hmm, having 4 matches per row with team1, score1, team2, score2 needs 6 columns (or 4 columns if we use team+score for each side). 

If I use 6 cols per match (home, home score, away, away score, repeat), and 4 matches per row, that's 24 cols. Too wide.

**Alternative: one row per match**. So 4 Group A rows per GW × 14 GWs = 56 rows for Group A, 56 for Group B. Total 112 rows for fixtures.

That's a lot but each row is meaningful and easy to read.

### Row mapping (per group, per GW)
- Group A, GW3 (Rounds 1): 4 matches = 4 rows
- Group A, GW4 (Round 2): 4 matches = 4 rows
- etc.

So the row index for Group A match at GW (index 0..13) and match slot (0..3):
- Group A: row = 4 + (GW_index * 4) + match_slot
- Group B: row = 23 + (GW_index * 4) + match_slot

With 14 GWs and 4 matches per GW, that's 56 rows per group. Row range:
- Group A: rows 4 to 4+56-1 = 59
- Group B: rows 23 to 78

## Implementation plan

1. Rewrite `syncH2HForGw` to write to the new column layout (cols A-F) and new row layout (Group A: row 4+offset, Group B: row 23+offset)
2. Rewrite `recalculateH2HStandings` to:
   - Read from the new column layout
   - Write standings to new rows (rows 42+ for Group A, 53+ for Group B)
3. Add a `generateH2HKnockoutBracket` to write the bracket at row 60+
4. The original (messy) layout's data can be left alone (it's still readable, just not optimal)

## Backward compatibility
- Old code wrote to cols L-S in original rows. New code writes to cols A-F in new rows. Both are valid (the original data is in cols L-S still).
- Re-running `syncH2H.js 3` for GW3 will OVERWRITE the original GW3 fixture row's score columns (cols L-S) AND write to the new row 5-8 (cols A-F). The original row 14 data stays intact (just superseded by the new format in different rows).

Actually that's a problem. The original row 14 has "Aguilas Dorados vs Reds 53 45 27 42 49 PENDING" in one wide row. The new layout has 4 separate rows for GW3 Group A and 4 rows for Group B. So both formats coexist.

For the cleanest result, I should:
- Keep the original fixture data (cols A-F in the existing rows 14-27 with the text "X vs Y" in cols C-F and H-K)
- The new sync writes to the SAME cols A-F but to a NEW row range (4-19 for Group A, 23-38 for Group B)
- The user can decide which format they prefer

OR I can just use a different row range so the new format doesn't conflict. Let me go with: new format uses rows 4-78 (group A in 4-19, group B in 23-38), keeping the original format in rows 14+ (for the existing data) but the new sync will write to a different row.

Actually let me just check what makes sense:
- Original layout had standings in rows 3-10, fixtures in rows 14-27
- New layout: standings in rows 42-62, fixtures in rows 4-19 (Group A) and 23-38 (Group B), knockout in rows 60+

The new fixture rows (4-19) don't conflict with the old standings (3-10) or fixtures (14-27). Hmm, but they DO conflict with rows 11-13 (the "H2H GROUP STAGE FIXTURES" header and column header).

OK my plan:
- Use rows 3-19 for new Group A fixtures
- Use rows 21-37 for new Group B fixtures
- Use rows 39-55 for new Group A standings (8 rows) and Group B standings (rows 57-73)
- Use rows 75+ for knockout bracket

Wait, this is getting complex. Let me just use a simple structure and document it.

## Final layout (simpler)

```
Row 1:   [TITLE: H2H LEAGUE]
Row 2:   [blank]
Row 3:   === GROUP A FIXTURES & RESULTS === | === GROUP B FIXTURES & RESULTS ===
Row 4:   GW | Round | Home | Score | Away | Score   GW | Round | Home | Score | Away | Score
Row 5:   GW3  Round 1  Aguilas  53  Reds  45       GW3  Round 1  Aura Farmers  71  xG Illuminati  28
... 14 GWs × 4 matches per GW = 56 rows per group, but I'll use 4 rows per GW (one per match)...

Hmm wait, 4 matches per GW × 14 GWs = 56 matches per group. That's 56 rows. With 2 groups stacked, 112 rows. Plus 2 rows for section headers + 1 title row + 1 blank = 116 rows minimum for fixtures.

Plus 16 rows for standings, plus ~5 rows for knockout, plus blanks between sections. So we need ~150 rows. That's fine for Google Sheets.

But that's a LOT of rows. Let me consider one row per GW with all 4 matches in different columns (16 cols). The view would be compact but very wide. Too wide.

Let me just use one row per match. Cleanest.
