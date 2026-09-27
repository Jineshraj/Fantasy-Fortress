export const teams = [
  { rank: 1, name: 'No Haaland No Cry', manager: 'Samira Khan', gw: 76, total: 862 },
  { rank: 2, name: 'Ctrl Alt De Ligt', manager: 'Marcus Bell', gw: 69, total: 849 },
  { rank: 3, name: 'Expected Toulouse', manager: 'Noah Williams', gw: 64, total: 831 },
  { rank: 4, name: 'Net Six & Chill', manager: 'Ava Morgan', gw: 72, total: 819 },
  { rank: 5, name: 'Game of Throw-ins', manager: 'Leo Costa', gw: 58, total: 798 },
  { rank: 6, name: 'Onana What’s My Name', manager: 'Maya Singh', gw: 61, total: 775 },
  { rank: 7, name: 'Bayer Neverlusen', manager: 'Theo James', gw: 55, total: 749 },
]

const make = (name, short, pos, club, clubCode, points, season, price, extras = {}) => ({
  name,
  short,
  pos,
  club,
  clubCode,
  points,
  season,
  price,
  ...extras,
})

export const squad = [
  make('David Raya', 'Raya', 'GKP', 'Arsenal', 'ARS', 7, 72, 5.5),
  make('William Saliba', 'Saliba', 'DEF', 'Arsenal', 'ARS', 6, 70, 6.1),
  make('Virgil van Dijk', 'Van Dijk', 'DEF', 'Liverpool', 'LIV', 8, 78, 6.4),
  make('Pedro Porro', 'Porro', 'DEF', 'Spurs', 'TOT', 3, 61, 5.6),
  make('Antonee Robinson', 'Robinson', 'DEF', 'Fulham', 'FUL', 5, 58, 4.9),
  make('Cole Palmer', 'Palmer', 'MID', 'Chelsea', 'CHE', 18, 109, 10.9),
  make('Bukayo Saka', 'Saka', 'MID', 'Arsenal', 'ARS', 9, 101, 10.2),
  make('Mohamed Salah', 'Salah', 'MID', 'Liverpool', 'LIV', 12, 122, 12.9),
  make('Morgan Rogers', 'Rogers', 'MID', 'Aston Villa', 'AVL', 4, 64, 5.4),
  make('Erling Haaland', 'Haaland', 'FWD', 'Man City', 'MCI', 11, 113, 15.1),
  make('Alexander Isak', 'Isak', 'FWD', 'Newcastle', 'NEW', 7, 87, 8.7),
  make('Dean Henderson', 'Henderson', 'GKP', 'Crystal Palace', 'CRY', 2, 48, 4.5),
  make('Rico Lewis', 'Lewis', 'DEF', 'Man City', 'MCI', 1, 42, 4.7),
  make('Emile Smith Rowe', 'Smith Rowe', 'MID', 'Fulham', 'FUL', 6, 55, 5.6),
  make('João Pedro', 'J. Pedro', 'FWD', 'Brighton', 'BHA', 2, 62, 5.8),
]

export const starters = squad.slice(0, 11)
export const bench = squad.slice(11)

export const fixtures = [
  { id: 'f1', gw: 14, kickoff: 'Sat 12:30', home: 'ARS', away: 'TOT', homeName: 'Arsenal', awayName: 'Spurs', score: [2, 1] },
  { id: 'f2', gw: 14, kickoff: 'Sat 15:00', home: 'LIV', away: 'MCI', homeName: 'Liverpool', awayName: 'Man City', score: [0, 0] },
  { id: 'f3', gw: 14, kickoff: 'Sat 17:30', home: 'CHE', away: 'AVL', homeName: 'Chelsea', awayName: 'Aston Villa', score: null },
  { id: 'f4', gw: 14, kickoff: 'Sun 14:00', home: 'NEW', away: 'BHA', homeName: 'Newcastle', awayName: 'Brighton', score: null },
  { id: 'f5', gw: 13, kickoff: 'FT', home: 'MUN', away: 'EVE', homeName: 'Man United', awayName: 'Everton', score: [3, 1] },
  { id: 'f6', gw: 13, kickoff: 'FT', home: 'WHU', away: 'WOL', homeName: 'West Ham', awayName: 'Wolves', score: [2, 2] },
  { id: 'f7', gw: 13, kickoff: 'FT', home: 'BRE', away: 'LEE', homeName: 'Brentford', awayName: 'Leeds', score: [1, 0] },
]

export const h2hWeeks = [
  {
    gw: 14,
    matches: [
      { id: 'h1', home: 'No Haaland No Cry', away: 'Bayer Neverlusen', homeGw: 76, awayGw: 55, winner: null },
      { id: 'h2', home: 'Ctrl Alt De Ligt', away: 'Onana What’s My Name', homeGw: 69, awayGw: 61, winner: null },
      { id: 'h3', home: 'Expected Toulouse', away: 'Game of Throw-ins', homeGw: 64, awayGw: 58, winner: null },
      { id: 'h4', home: 'Net Six & Chill', away: 'Bayer Neverlusen', homeGw: 72, awayGw: 55, winner: null },
    ],
  },
  {
    gw: 13,
    matches: [
      { id: 'h5', home: 'No Haaland No Cry', away: 'Net Six & Chill', homeGw: 68, awayGw: 60, winner: 'home' },
      { id: 'h6', home: 'Ctrl Alt De Ligt', away: 'Game of Throw-ins', homeGw: 74, awayGw: 51, winner: 'home' },
      { id: 'h7', home: 'Expected Toulouse', away: 'Onana What’s My Name', homeGw: 49, awayGw: 62, winner: 'away' },
      { id: 'h8', home: 'Net Six & Chill', away: 'Bayer Neverlusen', homeGw: 70, awayGw: 47, winner: 'home' },
    ],
  },
]

export const superCup = {
  title: 'Super Cup',
  rounds: [
    {
      name: 'Quarter-finals',
      matches: [
        { id: 'q1', a: 'No Haaland No Cry', b: 'Bayer Neverlusen', aScore: 142, bScore: 118, winner: 'a' },
        { id: 'q2', a: 'Ctrl Alt De Ligt', b: 'Onana What’s My Name', aScore: 138, bScore: 121, winner: 'a' },
        { id: 'q3', a: 'Expected Toulouse', b: 'Game of Throw-ins', aScore: 125, bScore: 119, winner: 'a' },
        { id: 'q4', a: 'Net Six & Chill', b: 'Theo’s Terrors', aScore: 131, bScore: 109, winner: 'a' },
      ],
    },
    {
      name: 'Semi-finals',
      matches: [
        { id: 's1', a: 'No Haaland No Cry', b: 'Ctrl Alt De Ligt', aScore: 142, bScore: 138, winner: 'a' },
        { id: 's2', a: 'Expected Toulouse', b: 'Net Six & Chill', aScore: 125, bScore: 131, winner: 'b' },
      ],
    },
    {
      name: 'Final',
      matches: [
        { id: 'f1', a: 'No Haaland No Cry', b: 'Net Six & Chill', aScore: null, bScore: null, winner: null },
      ],
    },
  ],
}
