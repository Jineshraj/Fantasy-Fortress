# Fantasy team logos

These files are served as-is from the web root. They are **not** resolved by
filename convention — the mapping from database team name to file lives in
`client/src/data/teamLogos.js`.

## Why an explicit map

The delivered file names are inconsistent: some are `-removebg-preview.png`
(transparent), some are `.jpeg`, some use underscores, some use spaces, and
three do not match their team name at all:

| Database name      | File                    |
|--------------------|-------------------------|
| `Committe Team`    | `Committee_Team-…png`   |
| `Mamangam DC`      | `Mamangam-…png`         |
| `xG Illuminati`    | `xg_illuminati-…png`    |

Guessing a filename from the team name therefore 404s. `TEAM_LOGOS` lists the
candidates per team in priority order (transparent PNG first, JPEG fallback),
and `TeamMark.jsx` walks the list, advancing on error.

## To add a team

1. Drop the crest into this folder.
2. Add an entry to `TEAM_LOGOS` in `client/src/data/teamLogos.js`:
   ```js
   'New Team FC': ['New_Team_FC-removebg-preview.png', 'New Team FC.jpeg'],
   ```
   The key must match `standings.team_name` / `teams.name` exactly.
3. Run `npm run test:logos` to confirm every candidate exists on disk and every
   database team is mapped.

## Verification

```
npm run test:logos    # files exist + all 16 teams mapped
npm run test:render   # every screen renders; asserts 16 logo <img> tags
```
