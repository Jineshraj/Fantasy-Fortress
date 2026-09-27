// Official Team Code to Team Name Mapping
export const TEAM_CODE_MAP = {
  AD: 'Aguilas Dorados',
  RS: 'Reds',
  AB: 'Aztec Blinders',
  MA: 'Meridian Athletic',
  CF: 'Choakers FC',
  MD: 'Mamangam DC',
  IW: 'Iberian Wizards',
  LP: 'La Pulga',
  AF: 'Aura Farmers',
  xGI: 'xG Illuminati',
  CT: 'Committe Team',
  RF: 'Relegated FC',
  JB: 'Jogo Bonito',
  PF: 'Phoenix Flyers',
  KC: 'Kroos Control',
  MS: 'Mancunians',
}

// Group A and Group B Teams
export const GROUPS = {
  A: ['Aguilas Dorados', 'Reds', 'Aztec Blinders', 'Meridian Athletic', 'Choakers FC', 'Mamangam DC', 'Iberian Wizards', 'La Pulga'],
  B: ['Aura Farmers', 'xG Illuminati', 'Committe Team', 'Relegated FC', 'Jogo Bonito', 'Phoenix Flyers', 'Kroos Control', 'Mancunians'],
}

// Full Season Tournament Calendar
export const TOURNAMENT_CALENDAR = {
  // Group Round 1
  3: {
    type: 'H2H_GROUP',
    round: 1,
    matches: {
      A: [
        { home: 'AD', away: 'RS' },
        { home: 'AB', away: 'MA' },
        { home: 'CF', away: 'MD' },
        { home: 'IW', away: 'LP' },
      ],
      B: [
        { home: 'AF', away: 'xGI' },
        { home: 'CT', away: 'RF' },
        { home: 'JB', away: 'PF' },
        { home: 'KC', away: 'MS' },
      ],
    },
  },
  // Group Round 2
  4: {
    type: 'H2H_GROUP',
    round: 2,
    matches: {
      A: [
        { home: 'AD', away: 'MA' },
        { home: 'RS', away: 'MD' },
        { home: 'AB', away: 'LP' },
        { home: 'CF', away: 'IW' },
      ],
      B: [
        { home: 'AF', away: 'RF' },
        { home: 'xGI', away: 'PF' },
        { home: 'CT', away: 'MS' },
        { home: 'JB', away: 'KC' },
      ],
    },
  },
  // Super Cup Round of 16
  5: {
    type: 'SUPER_CUP',
    stage: 'ROUND_OF_16',
    matches: [
      { id: 'M1', home: 'LP', away: 'CT' },
      { id: 'M2', home: 'AB', away: 'RF' },
      { id: 'M3', home: 'PF', away: 'AF' },
      { id: 'M4', home: 'JB', away: 'RS' },
      { id: 'M5', home: 'AD', away: 'CF' },
      { id: 'M6', home: 'IW', away: 'MS' },
      { id: 'M7', home: 'KC', away: 'MA' },
      { id: 'M8', home: 'MD', away: 'xGI' },
    ],
  },
  // Group Round 3
  6: {
    type: 'H2H_GROUP',
    round: 3,
    matches: {
      A: [
        { home: 'AD', away: 'MD' },
        { home: 'MA', away: 'LP' },
        { home: 'RS', away: 'IW' },
        { home: 'AB', away: 'CF' },
      ],
      B: [
        { home: 'AF', away: 'PF' },
        { home: 'RF', away: 'MS' },
        { home: 'xGI', away: 'KC' },
        { home: 'CT', away: 'JB' },
      ],
    },
  },
  // Group Round 4
  7: {
    type: 'H2H_GROUP',
    round: 4,
    matches: {
      A: [
        { home: 'AD', away: 'LP' },
        { home: 'MD', away: 'IW' },
        { home: 'MA', away: 'CF' },
        { home: 'RS', away: 'AB' },
      ],
      B: [
        { home: 'AF', away: 'MS' },
        { home: 'PF', away: 'KC' },
        { home: 'RF', away: 'JB' },
        { home: 'xGI', away: 'CT' },
      ],
    },
  },
  // Super Cup Quarter Finals
  8: {
    type: 'SUPER_CUP',
    stage: 'QUARTER_FINALS',
    matches: [
      { id: 'QF1', homeRef: 'M1_WINNER', awayRef: 'M2_WINNER' },
      { id: 'QF2', homeRef: 'M3_WINNER', awayRef: 'M4_WINNER' },
      { id: 'QF3', homeRef: 'M5_WINNER', awayRef: 'M6_WINNER' },
      { id: 'QF4', homeRef: 'M7_WINNER', awayRef: 'M8_WINNER' },
    ],
  },
  // Group Round 5
  9: {
    type: 'H2H_GROUP',
    round: 5,
    matches: {
      A: [
        { home: 'AD', away: 'IW' },
        { home: 'LP', away: 'CF' },
        { home: 'MD', away: 'AB' },
        { home: 'MA', away: 'RS' },
      ],
      B: [
        { home: 'AF', away: 'KC' },
        { home: 'MS', away: 'JB' },
        { home: 'PF', away: 'CT' },
        { home: 'RF', away: 'xGI' },
      ],
    },
  },
  // Group Round 6
  10: {
    type: 'H2H_GROUP',
    round: 6,
    matches: {
      A: [
        { home: 'AD', away: 'CF' },
        { home: 'IW', away: 'AB' },
        { home: 'LP', away: 'RS' },
        { home: 'MD', away: 'MA' },
      ],
      B: [
        { home: 'AF', away: 'JB' },
        { home: 'KC', away: 'CT' },
        { home: 'MS', away: 'xGI' },
        { home: 'PF', away: 'RF' },
      ],
    },
  },
  // Super Cup Semi Finals
  11: {
    type: 'SUPER_CUP',
    stage: 'SEMI_FINALS',
    matches: [
      { id: 'SF1', homeRef: 'QF1_WINNER', awayRef: 'QF2_WINNER' },
      { id: 'SF2', homeRef: 'QF3_WINNER', awayRef: 'QF4_WINNER' },
    ],
  },
  // Group Round 7
  12: {
    type: 'H2H_GROUP',
    round: 7,
    matches: {
      A: [
        { home: 'AD', away: 'AB' },
        { home: 'CF', away: 'RS' },
        { home: 'IW', away: 'MA' },
        { home: 'LP', away: 'MD' },
      ],
      B: [
        { home: 'AF', away: 'CT' },
        { home: 'JB', away: 'xGI' },
        { home: 'KC', away: 'RF' },
        { home: 'MS', away: 'PF' },
      ],
    },
  },
  // Group Round 8
  13: {
    type: 'H2H_GROUP',
    round: 8,
    matches: {
      A: [
        { home: 'RS', away: 'AD' },
        { home: 'MA', away: 'AB' },
        { home: 'MD', away: 'CF' },
        { home: 'LP', away: 'IW' },
      ],
      B: [
        { home: 'xGI', away: 'AF' },
        { home: 'RF', away: 'CT' },
        { home: 'PF', away: 'JB' },
        { home: 'MS', away: 'KC' },
      ],
    },
  },
  // Group Round 9
  14: {
    type: 'H2H_GROUP',
    round: 9,
    matches: {
      A: [
        { home: 'MA', away: 'AD' },
        { home: 'MD', away: 'RS' },
        { home: 'LP', away: 'AB' },
        { home: 'IW', away: 'CF' },
      ],
      B: [
        { home: 'RF', away: 'AF' },
        { home: 'PF', away: 'xGI' },
        { home: 'MS', away: 'CT' },
        { home: 'KC', away: 'JB' },
      ],
    },
  },
  // Super Cup Final
  15: {
    type: 'SUPER_CUP',
    stage: 'FINAL',
    matches: [{ id: 'FINAL', homeRef: 'SF1_WINNER', awayRef: 'SF2_WINNER' }],
  },
  // Group Round 10
  16: {
    type: 'H2H_GROUP',
    round: 10,
    matches: {
      A: [
        { home: 'MD', away: 'AD' },
        { home: 'LP', away: 'MA' },
        { home: 'IW', away: 'RS' },
        { home: 'CF', away: 'AB' },
      ],
      B: [
        { home: 'PF', away: 'AF' },
        { home: 'MS', away: 'RF' },
        { home: 'KC', away: 'xGI' },
        { home: 'JB', away: 'CT' },
      ],
    },
  },
  // Group Round 11
  17: {
    type: 'H2H_GROUP',
    round: 11,
    matches: {
      A: [
        { home: 'LP', away: 'AD' },
        { home: 'IW', away: 'MD' },
        { home: 'CF', away: 'MA' },
        { home: 'AB', away: 'RS' },
      ],
      B: [
        { home: 'MS', away: 'AF' },
        { home: 'KC', away: 'PF' },
        { home: 'JB', away: 'RF' },
        { home: 'CT', away: 'xGI' },
      ],
    },
  },
  // Group Round 12
  18: {
    type: 'H2H_GROUP',
    round: 12,
    matches: {
      A: [
        { home: 'IW', away: 'AD' },
        { home: 'CF', away: 'LP' },
        { home: 'AB', away: 'MD' },
        { home: 'RS', away: 'MA' },
      ],
      B: [
        { home: 'KC', away: 'AF' },
        { home: 'JB', away: 'MS' },
        { home: 'CT', away: 'PF' },
        { home: 'xGI', away: 'RF' },
      ],
    },
  },
  // Group Round 13
  19: {
    type: 'H2H_GROUP',
    round: 13,
    matches: {
      A: [
        { home: 'CF', away: 'AD' },
        { home: 'AB', away: 'IW' },
        { home: 'RS', away: 'LP' },
        { home: 'MA', away: 'MD' },
      ],
      B: [
        { home: 'JB', away: 'AF' },
        { home: 'CT', away: 'KC' },
        { home: 'xGI', away: 'MS' },
        { home: 'RF', away: 'PF' },
      ],
    },
  },
  // Group Round 14
  20: {
    type: 'H2H_GROUP',
    round: 14,
    matches: {
      A: [
        { home: 'AB', away: 'AD' },
        { home: 'RS', away: 'CF' },
        { home: 'MA', away: 'IW' },
        { home: 'MD', away: 'LP' },
      ],
      B: [
        { home: 'CT', away: 'AF' },
        { home: 'xGI', away: 'JB' },
        { home: 'RF', away: 'KC' },
        { home: 'PF', away: 'MS' },
      ],
    },
  },
  // H2H Cup Knockout Phase
  22: { type: 'H2H_CUP', stage: 'QUARTER_FINAL_LEG_1' },
  24: { type: 'H2H_CUP', stage: 'QUARTER_FINAL_LEG_2' },
  26: { type: 'H2H_CUP', stage: 'SEMI_FINAL_LEG_1' },
  28: { type: 'H2H_CUP', stage: 'SEMI_FINAL_LEG_2' },
  30: { type: 'H2H_CUP', stage: 'FINAL' },
}
