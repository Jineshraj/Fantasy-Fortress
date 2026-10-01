// Tournament fixture pairings — real schedule, mirrored from the backend
// layout scripts so the client renders the actual competition instead of
// demo data. Source of truth:
//   - server/scripts/initH2HLayout.js        (H2H_FIXTURES, groupATeams, groupBTeams)
//   - server/scripts/initSuperCupLayout.js  (R16 pairings, sheet rows 5-12)
//   - server/src/services/superCupService.js (BRACKET_FEEDERS, stage gameweeks)
// No live values here — only pairings. Scores come from Supabase at runtime.

// ─────────────────────────── H2H LEAGUE ───────────────────────────

export const H2H_GWS = [3, 4, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20]

export const groupATeams = [
  'Aguilas Dorados',
  'Reds',
  'Aztec Blinders',
  'Meridian Athletic',
  'Choakers FC',
  'Mamangam DC',
  'Iberian Wizards',
  'La Pulga',
]

export const groupBTeams = [
  'Aura Farmers',
  'xG Illuminati',
  'Committe Team',
  'Relegated FC',
  'Jogo Bonito',
  'Phoenix Flyers',
  'Kroos Control',
  'Mancunians',
]

export const H2H_FIXTURES = {
  'GW3-GroupA': [['Aguilas Dorados', 'Reds'], ['Aztec Blinders', 'Meridian Athletic'], ['Choakers FC', 'Mamangam DC'], ['Iberian Wizards', 'La Pulga']],
  'GW3-GroupB': [['Aura Farmers', 'xG Illuminati'], ['Committe Team', 'Relegated FC'], ['Jogo Bonito', 'Phoenix Flyers'], ['Kroos Control', 'Mancunians']],
  'GW4-GroupA': [['Aguilas Dorados', 'Meridian Athletic'], ['Reds', 'Mamangam DC'], ['Aztec Blinders', 'La Pulga'], ['Choakers FC', 'Iberian Wizards']],
  'GW4-GroupB': [['Aura Farmers', 'Relegated FC'], ['xG Illuminati', 'Phoenix Flyers'], ['Committe Team', 'Mancunians'], ['Jogo Bonito', 'Kroos Control']],
  'GW6-GroupA': [['Aguilas Dorados', 'Mamangam DC'], ['Meridian Athletic', 'La Pulga'], ['Reds', 'Iberian Wizards'], ['Aztec Blinders', 'Choakers FC']],
  'GW6-GroupB': [['Aura Farmers', 'Phoenix Flyers'], ['Relegated FC', 'Mancunians'], ['xG Illuminati', 'Kroos Control'], ['Committe Team', 'Jogo Bonito']],
  'GW7-GroupA': [['Aguilas Dorados', 'La Pulga'], ['Mamangam DC', 'Iberian Wizards'], ['Meridian Athletic', 'Choakers FC'], ['Reds', 'Aztec Blinders']],
  'GW7-GroupB': [['Aura Farmers', 'Mancunians'], ['Phoenix Flyers', 'Kroos Control'], ['Relegated FC', 'Jogo Bonito'], ['xG Illuminati', 'Committe Team']],
  'GW9-GroupA': [['Aguilas Dorados', 'Iberian Wizards'], ['La Pulga', 'Choakers FC'], ['Mamangam DC', 'Aztec Blinders'], ['Meridian Athletic', 'Reds']],
  'GW9-GroupB': [['Aura Farmers', 'Kroos Control'], ['Mancunians', 'Jogo Bonito'], ['Phoenix Flyers', 'Committe Team'], ['Relegated FC', 'xG Illuminati']],
  'GW10-GroupA': [['Aguilas Dorados', 'Choakers FC'], ['Iberian Wizards', 'Aztec Blinders'], ['La Pulga', 'Reds'], ['Mamangam DC', 'Meridian Athletic']],
  'GW10-GroupB': [['Aura Farmers', 'Jogo Bonito'], ['Kroos Control', 'Committe Team'], ['Mancunians', 'xG Illuminati'], ['Phoenix Flyers', 'Relegated FC']],
  'GW12-GroupA': [['Aguilas Dorados', 'Aztec Blinders'], ['Choakers FC', 'Reds'], ['Iberian Wizards', 'Meridian Athletic'], ['La Pulga', 'Mamangam DC']],
  'GW12-GroupB': [['Aura Farmers', 'Committe Team'], ['Jogo Bonito', 'xG Illuminati'], ['Kroos Control', 'Relegated FC'], ['Mancunians', 'Phoenix Flyers']],
  'GW13-GroupA': [['Reds', 'Aguilas Dorados'], ['Meridian Athletic', 'Aztec Blinders'], ['Mamangam DC', 'Choakers FC'], ['La Pulga', 'Iberian Wizards']],
  'GW13-GroupB': [['xG Illuminati', 'Aura Farmers'], ['Relegated FC', 'Committe Team'], ['Phoenix Flyers', 'Jogo Bonito'], ['Mancunians', 'Kroos Control']],
  'GW14-GroupA': [['Meridian Athletic', 'Aguilas Dorados'], ['Mamangam DC', 'Reds'], ['La Pulga', 'Aztec Blinders'], ['Iberian Wizards', 'Choakers FC']],
  'GW14-GroupB': [['Relegated FC', 'Aura Farmers'], ['Phoenix Flyers', 'xG Illuminati'], ['Mancunians', 'Committe Team'], ['Kroos Control', 'Jogo Bonito']],
  'GW16-GroupA': [['Mamangam DC', 'Aguilas Dorados'], ['La Pulga', 'Meridian Athletic'], ['Iberian Wizards', 'Reds'], ['Choakers FC', 'Aztec Blinders']],
  'GW16-GroupB': [['Phoenix Flyers', 'Aura Farmers'], ['Mancunians', 'Relegated FC'], ['Kroos Control', 'xG Illuminati'], ['Jogo Bonito', 'Committe Team']],
  'GW17-GroupA': [['La Pulga', 'Aguilas Dorados'], ['Iberian Wizards', 'Mamangam DC'], ['Choakers FC', 'Meridian Athletic'], ['Aztec Blinders', 'Reds']],
  'GW17-GroupB': [['Mancunians', 'Aura Farmers'], ['Kroos Control', 'Phoenix Flyers'], ['Jogo Bonito', 'Relegated FC'], ['Committe Team', 'xG Illuminati']],
  'GW18-GroupA': [['Iberian Wizards', 'Aguilas Dorados'], ['Choakers FC', 'La Pulga'], ['Aztec Blinders', 'Mamangam DC'], ['Reds', 'Meridian Athletic']],
  'GW18-GroupB': [['Kroos Control', 'Aura Farmers'], ['Jogo Bonito', 'Mancunians'], ['Committe Team', 'Phoenix Flyers'], ['xG Illuminati', 'Relegated FC']],
  'GW19-GroupA': [['Choakers FC', 'Aguilas Dorados'], ['Aztec Blinders', 'Iberian Wizards'], ['Reds', 'La Pulga'], ['Meridian Athletic', 'Mamangam DC']],
  'GW19-GroupB': [['Jogo Bonito', 'Aura Farmers'], ['Committe Team', 'Kroos Control'], ['xG Illuminati', 'Mancunians'], ['Relegated FC', 'Phoenix Flyers']],
  'GW20-GroupA': [['Aztec Blinders', 'Aguilas Dorados'], ['Reds', 'Choakers FC'], ['Meridian Athletic', 'Iberian Wizards'], ['Mamangam DC', 'La Pulga']],
  'GW20-GroupB': [['Committe Team', 'Aura Farmers'], ['xG Illuminati', 'Jogo Bonito'], ['Relegated FC', 'Kroos Control'], ['Phoenix Flyers', 'Mancunians']],
}

// Group-stage matchups grouped by gameweek, for the H2H tab.
export const H2H_WEEKS = H2H_GWS.map((gw) => ({
  gw,
  matches: [
    ...H2H_FIXTURES[`GW${gw}-GroupA`].map(([home, away], i) => ({
      id: `gw${gw}-a${i + 1}`,
      group: 'Group A',
      home,
      away,
    })),
    ...H2H_FIXTURES[`GW${gw}-GroupB`].map(([home, away], i) => ({
      id: `gw${gw}-b${i + 1}`,
      group: 'Group B',
      home,
      away,
    })),
  ],
}))

// ──────────────────────── SUPER CUP KNOCKOUT ────────────────────────

// Round of 16 — Super_Cup!A5:G12 (initSuperCupLayout.js)
export const SUPER_CUP_R16 = [
  { id: 'M1', gw: 5, home: 'La Pulga', away: 'Committe Team' },
  { id: 'M2', gw: 5, home: 'Aztec Blinders', away: 'Relegated FC' },
  { id: 'M3', gw: 5, home: 'Phoenix Flyers', away: 'Aura Farmers' },
  { id: 'M4', gw: 5, home: 'Jogo Bonito', away: 'Reds' },
  { id: 'M5', gw: 5, home: 'Aguilas Dorados', away: 'Choakers FC' },
  { id: 'M6', gw: 5, home: 'Iberian Wizards', away: 'Mancunians' },
  { id: 'M7', gw: 5, home: 'Kroos Control', away: 'Meridian Athletic' },
  { id: 'M8', gw: 5, home: 'Mamangam DC', away: 'xG Illuminati' },
]

// BRACKET_FEEDERS (superCupService.js) — downstream rounds pair up winners.
export const SUPER_CUP_FEEDERS = {
  QF1: { home: 'M1', away: 'M2' },
  QF2: { home: 'M3', away: 'M4' },
  QF3: { home: 'M5', away: 'M6' },
  QF4: { home: 'M7', away: 'M8' },
  SF1: { home: 'QF1', away: 'QF2' },
  SF2: { home: 'QF3', away: 'QF4' },
  FINAL: { home: 'SF1', away: 'SF2' },
}

export const SUPER_CUP_STAGE_GW = {
  M: 5,
  QF: 8,
  SF: 11,
  FINAL: 15,
}

export const SUPER_CUP_STAGE_LABEL = {
  M: 'Round of 16',
  QF: 'Quarter-finals',
  SF: 'Semi-finals',
  FINAL: 'Final',
}

// Round ids in bracket order, grouped for display.
export const SUPER_CUP_ROUND_IDS = {
  M: SUPER_CUP_R16.map((m) => m.id),
  QF: ['QF1', 'QF2', 'QF3', 'QF4'],
  SF: ['SF1', 'SF2'],
  FINAL: ['FINAL'],
}
