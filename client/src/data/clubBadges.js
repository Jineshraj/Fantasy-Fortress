/**
 * Static CDN club badge resolver.
 * Maps top European club names to their official API-Sports / API-Football team IDs.
 * Free public CDN: https://media.api-sports.io/football/teams/{id}.png
 */

export const CLUB_API_IDS = {
  // --- Premier League ---
  'arsenal': 42,
  'arsenal fc': 42,
  'aston villa': 66,
  'bournemouth': 35,
  'afc bournemouth': 35,
  'brentford': 55,
  'brentford fc': 55,
  'brighton': 51,
  'brighton & hove albion': 51,
  'brighton hove albion': 51,
  'chelsea': 49,
  'chelsea fc': 49,
  'crystal palace': 52,
  'everton': 45,
  'everton fc': 45,
  'fulham': 36,
  'fulham fc': 36,
  'hull city': 64,
  'ipswich town': 57,
  'ipswich': 57,
  'leeds united': 63,
  'leeds': 63,
  'leicester city': 46,
  'leicester': 46,
  'liverpool': 40,
  'liverpool fc': 40,
  'manchester city': 50,
  'man city': 50,
  'manchester united': 33,
  'man united': 33,
  'newcastle united': 34,
  'newcastle': 34,
  'nottingham forest': 65,
  'southampton': 41,
  'tottenham hotspur': 47,
  'tottenham': 47,
  'spurs': 47,
  'west ham united': 48,
  'west ham': 48,
  'wolverhampton wanderers': 39,
  'wolves': 39,
  'coventry city': 1358,
  'coventry': 1358,
  'sunderland afc': 746,
  'sunderland': 746,

  // --- La Liga ---
  'real madrid': 541,
  'barcelona': 529,
  'fc barcelona': 529,
  'atletico madrid': 530,
  'atletico de madrid': 530,
  'athletic bilbao': 531,
  'athletic club': 531,
  'real sociedad': 548,
  'real betis': 543,
  'real betis balompie': 543,
  'betis': 543,
  'villarreal': 533,
  'villarreal cf': 533,
  'sevilla': 536,
  'sevilla fc': 536,
  'girona': 547,
  'girona fc': 547,
  'valencia': 532,
  'valencia cf': 532,
  'osasuna': 727,
  'ca osasuna': 727,
  'celta vigo': 538,
  'celta de vigo': 538,
  'rayo vallecano': 728,
  'mallorca': 798,
  'rcd mallorca': 798,
  'espanyol': 540,
  'rcd espanyol': 540,
  'rcd espanyol barcelona': 540,
  'deportivo alaves': 542,
  'alaves': 542,
  'getafe': 546,
  'getafe cf': 546,
  'las palmas': 534,
  'ud las palmas': 534,
  'leganes': 545,
  'cd leganes': 545,
  'real valladolid': 720,
  'real valladolid cf': 720,
  'valladolid': 720,
  'elche': 797,
  'elche cf': 797,
  'racing santander': 730,
  'real racing club': 730,
  'malaga': 539,
  'malaga cf': 539,
  'levante': 537,
  'levante ud': 537,
  'deportivo de la coruna': 544,
  'deportivo la coruna': 544,
  'deportivo a coruna': 544,

  // --- Serie A ---
  'inter': 505,
  'inter milan': 505,
  'milan': 489,
  'ac milan': 489,
  'juventus': 496,
  'juventus fc': 496,
  'napoli': 492,
  'ssc napoli': 492,
  'roma': 497,
  'as roma': 497,
  'lazio': 487,
  'ss lazio': 487,
  'atalanta': 499,
  'atalanta bc': 499,
  'fiorentina': 502,
  'acf fiorentina': 502,
  'bologna': 500,
  'bologna fc 1909': 500,
  'bologna fc': 500,
  'torino': 503,
  'torino fc': 503,
  'udinese': 494,
  'udinese calcio': 494,
  'genoa': 495,
  'genoa cfc': 495,
  'cagliari': 490,
  'cagliari calcio': 490,
  'verona': 504,
  'hellas verona': 504,
  'lecce': 867,
  'us lecce': 867,
  'parma': 523,
  'parma calcio 1913': 523,
  'parma calcio': 523,
  'como': 893,
  'como 1907': 893,
  'venezia': 517,
  'venezia fc': 517,
  'empoli': 511,
  'empoli fc': 511,
  'monza': 1579,
  'ac monza': 1579,
  'sassuolo': 488,
  'us sassuolo': 488,
  'frosinone': 512,
  'frosinone calcio': 512,

  // --- Bundesliga ---
  'bayern munchen': 157,
  'fc bayern munchen': 157,
  'bayern munich': 157,
  'bayern': 157,
  'borussia dortmund': 165,
  'dortmund': 165,
  'rb leipzig': 173,
  'leipzig': 173,
  'bayer 04 leverkusen': 168,
  'bayer leverkusen': 168,
  'leverkusen': 168,
  'vfb stuttgart': 172,
  'stuttgart': 172,
  'eintracht frankfurt': 169,
  'frankfurt': 169,
  'vfl wolfsburg': 161,
  'wolfsburg': 161,
  'sc freiburg': 160,
  'freiburg': 160,
  '1 fc union berlin': 182,
  'union berlin': 182,
  'tsg 1899 hoffenheim': 167,
  'tsg hoffenheim': 167,
  'hoffenheim': 167,
  '1 fsv mainz 05': 164,
  'mainz 05': 164,
  'mainz': 164,
  'werder bremen': 162,
  'bremen': 162,
  'fc augsburg': 170,
  'augsburg': 170,
  'borussia monchengladbach': 163,
  'monchengladbach': 163,
  'gladbach': 163,
  '1 fc koln': 192,
  'koln': 192,
  'fc koln': 192,
  'cologne': 192,
  'fc st pauli': 186,
  'st pauli': 186,
  '1 fc heidenheim': 180,
  'heidenheim': 180,
  'hamburger sv': 176,
  'hamburg': 176,
  'holstein kiel': 191,
  'sc paderborn 07': 185,
  'paderborn': 185,
  'sv 07 elversberg': 4125,
  'elversberg': 4125,
  'fc schalke 04': 174,
  'schalke': 174,

  // --- Ligue 1 ---
  'paris saint germain': 85,
  'psg': 85,
  'as monaco': 91,
  'monaco': 91,
  'olympique de marseille': 81,
  'marseille': 81,
  'olympique lyon': 80,
  'olympique lyonnais': 80,
  'lyon': 80,
  'losc lille': 79,
  'lille': 79,
  'ogc nice': 84,
  'nice': 84,
  'rc lens': 116,
  'lens': 116,
  'stade rennais fc': 94,
  'stade rennais': 94,
  'rennes': 94,
  'stade brestois 29': 1063,
  'stade brestois': 1063,
  'brest': 1063,
  'stade de reims': 93,
  'reims': 93,
  'rc strasbourg alsace': 95,
  'rc strasbourg': 95,
  'strasbourg': 95,
  'fc toulouse': 96,
  'toulouse': 96,
  'montpellier hsc': 82,
  'montpellier': 82,
  'aj auxerre': 108,
  'auxerre': 108,
  'angers sco': 77,
  'angers': 77,
  'fc nantes': 83,
  'nantes': 83,
  'havre ac': 111,
  'le havre': 111,
  'as saint etienne': 1063,
  'saint etienne': 1063,
  'fc lorient': 97,
  'lorient': 97,
  'fc metz': 112,
  'metz': 112,
  'clermont foot 63': 1062,
  'clermont': 1062,
  'paris fc': 115,
  'estac troyes': 110,
  'troyes': 110,
  'le mans': 1067,
  'le mans fc': 1067,
}

const normalizeClub = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

/**
 * Canonical three-letter broadcast codes for every club in CLUB_API_IDS.
 * Keys are `normalizeClub()` output, so accents, FC/CF/CD prefixes and case
 * never change the result. There is deliberately no "first three letters"
 * fallback — an unknown club renders an em dash instead of a made-up code.
 */
export const CLUB_BROADCAST_CODES = {
  // --- Premier League ---
  arsenal: 'ARS', 'arsenal fc': 'ARS',
  'aston villa': 'AVL',
  bournemouth: 'BOU', 'afc bournemouth': 'BOU',
  brentford: 'BRE', 'brentford fc': 'BRE',
  brighton: 'BHA', 'brighton hove albion': 'BHA',
  chelsea: 'CHE', 'chelsea fc': 'CHE',
  'crystal palace': 'CRY',
  everton: 'EVE', 'everton fc': 'EVE',
  fulham: 'FUL', 'fulham fc': 'FUL',
  'hull city': 'HUL',
  'ipswich town': 'IPS', ipswich: 'IPS',
  'leeds united': 'LEE', leeds: 'LEE',
  'leicester city': 'LEI', leicester: 'LEI',
  liverpool: 'LIV', 'liverpool fc': 'LIV',
  'manchester city': 'MCI', 'man city': 'MCI',
  'manchester united': 'MUN', 'man united': 'MUN',
  'newcastle united': 'NEW', newcastle: 'NEW',
  'nottingham forest': 'NFO',
  southampton: 'SOU',
  'tottenham hotspur': 'TOT', tottenham: 'TOT', spurs: 'TOT',
  'west ham united': 'WHU', 'west ham': 'WHU',
  'wolverhampton wanderers': 'WOL', wolves: 'WOL',
  'coventry city': 'COV', coventry: 'COV',
  'sunderland afc': 'SUN', sunderland: 'SUN',

  // --- La Liga ---
  'real madrid': 'RMA',
  barcelona: 'FCB', 'fc barcelona': 'FCB',
  'atletico madrid': 'ATM', 'atletico de madrid': 'ATM',
  'athletic bilbao': 'ATH', 'athletic club': 'ATH',
  'real sociedad': 'RSO',
  'real betis': 'BET', 'real betis balompie': 'BET', betis: 'BET',
  villarreal: 'VIL', 'villarreal cf': 'VIL',
  sevilla: 'SEV', 'sevilla fc': 'SEV',
  girona: 'GIR', 'girona fc': 'GIR',
  valencia: 'VAL', 'valencia cf': 'VAL',
  osasuna: 'OSA', 'ca osasuna': 'OSA',
  'celta vigo': 'CEL', 'celta de vigo': 'CEL',
  'rayo vallecano': 'RAY',
  mallorca: 'MLL', 'rcd mallorca': 'MLL',
  espanyol: 'ESP', 'rcd espanyol': 'ESP', 'rcd espanyol barcelona': 'ESP',
  'deportivo alaves': 'ALA', alaves: 'ALA',
  getafe: 'GET', 'getafe cf': 'GET',
  'las palmas': 'LPA', 'ud las palmas': 'LPA',
  leganes: 'LEG', 'cd leganes': 'LEG',
  'real valladolid': 'VLL', 'real valladolid cf': 'VLL', valladolid: 'VLL',
  elche: 'ELC', 'elche cf': 'ELC',
  'racing santander': 'RAC', 'real racing club': 'RAC',
  malaga: 'MAL', 'malaga cf': 'MAL',
  levante: 'LEB', 'levante ud': 'LEB',
  'deportivo de la coruna': 'DEP', 'deportivo la coruna': 'DEP', 'deportivo a coruna': 'DEP',

  // --- Serie A ---
  inter: 'INT', 'inter milan': 'INT',
  milan: 'MIL', 'ac milan': 'MIL',
  juventus: 'JUV', 'juventus fc': 'JUV',
  napoli: 'NAP', 'ssc napoli': 'NAP',
  roma: 'ROM', 'as roma': 'ROM',
  lazio: 'LAZ', 'ss lazio': 'LAZ',
  atalanta: 'ATA', 'atalanta bc': 'ATA',
  fiorentina: 'FIO', 'acf fiorentina': 'FIO',
  bologna: 'BOL', 'bologna fc 1909': 'BOL', 'bologna fc': 'BOL',
  torino: 'TOR', 'torino fc': 'TOR',
  udinese: 'UDI', 'udinese calcio': 'UDI',
  genoa: 'GEN', 'genoa cfc': 'GEN',
  cagliari: 'CAG', 'cagliari calcio': 'CAG',
  verona: 'VER', 'hellas verona': 'VER',
  lecce: 'LEC', 'us lecce': 'LEC',
  parma: 'PAR', 'parma calcio 1913': 'PAR', 'parma calcio': 'PAR',
  como: 'COM', 'como 1907': 'COM',
  venezia: 'VEN', 'venezia fc': 'VEN',
  empoli: 'EMP', 'empoli fc': 'EMP',
  monza: 'MON', 'ac monza': 'MON',
  sassuolo: 'SAS', 'us sassuolo': 'SAS',
  frosinone: 'FRO', 'frosinone calcio': 'FRO',

  // --- Bundesliga ---
  'bayern munchen': 'BAY', 'fc bayern munchen': 'BAY', 'bayern munich': 'BAY', bayern: 'BAY',
  'borussia dortmund': 'DOR', dortmund: 'DOR',
  'rb leipzig': 'RBL', leipzig: 'RBL',
  'bayer 04 leverkusen': 'LEV', 'bayer leverkusen': 'LEV', leverkusen: 'LEV',
  'vfb stuttgart': 'STU', stuttgart: 'STU',
  'eintracht frankfurt': 'FRA', frankfurt: 'FRA',
  'vfl wolfsburg': 'WOB', wolfsburg: 'WOB',
  'sc freiburg': 'SCF', freiburg: 'SCF',
  '1 fc union berlin': 'UNI', 'union berlin': 'UNI',
  'tsg 1899 hoffenheim': 'HOF', 'tsg hoffenheim': 'HOF', hoffenheim: 'HOF',
  '1 fsv mainz 05': 'M05', 'mainz 05': 'M05', mainz: 'M05',
  'werder bremen': 'SVW', bremen: 'SVW',
  'fc augsburg': 'AUG', augsburg: 'AUG',
  'borussia monchengladbach': 'BMG', monchengladbach: 'BMG', gladbach: 'BMG',
  '1 fc koln': 'KOE', koln: 'KOE', 'fc koln': 'KOE', cologne: 'KOE',
  'fc st pauli': 'STP', 'st pauli': 'STP',
  '1 fc heidenheim': 'FCH', heidenheim: 'FCH',
  'hamburger sv': 'HSV', hamburg: 'HSV',
  'holstein kiel': 'KIE',
  'sc paderborn 07': 'PAD', paderborn: 'PAD',
  'sv 07 elversberg': 'ELV', elversberg: 'ELV',
  'fc schalke 04': 'S04', schalke: 'S04',

  // --- Ligue 1 ---
  'paris saint germain': 'PSG', psg: 'PSG',
  'as monaco': 'ASM', monaco: 'ASM',
  'olympique de marseille': 'OM', marseille: 'OM',
  'olympique lyon': 'OL', 'olympique lyonnais': 'OL', lyon: 'OL',
  'losc lille': 'LIL', lille: 'LIL',
  'ogc nice': 'NIC', nice: 'NIC',
  'rc lens': 'RCL', lens: 'RCL',
  'stade rennais fc': 'REN', 'stade rennais': 'REN', rennes: 'REN',
  'stade brestois 29': 'BRS', 'stade brestois': 'BRS', brest: 'BRS',
  'stade de reims': 'REI', reims: 'REI',
  'rc strasbourg alsace': 'STR', 'rc strasbourg': 'STR', strasbourg: 'STR',
  'fc toulouse': 'TOU', toulouse: 'TOU',
  'montpellier hsc': 'MTP', montpellier: 'MTP',
  'aj auxerre': 'AUX', auxerre: 'AUX',
  'angers sco': 'ANG', angers: 'ANG',
  'fc nantes': 'NAN', nantes: 'NAN',
  'havre ac': 'HAC', 'le havre': 'HAC',
  'as saint etienne': 'ASSE', 'saint etienne': 'ASSE',
  'fc lorient': 'LOR', lorient: 'LOR',
  'fc metz': 'MET', metz: 'MET',
  'clermont foot 63': 'CLM', clermont: 'CLM',
  'paris fc': 'PFC',
  'estac troyes': 'TRO', troyes: 'TRO',
  'le mans': 'MNS', 'le mans fc': 'MNS',
}

// Reverse index: API-Football team id → broadcast code, derived from the two
// name maps so an ID can never disagree with its club name.
const CODE_BY_API_ID = (() => {
  const map = new Map()
  for (const [name, id] of Object.entries(CLUB_API_IDS)) {
    const code = CLUB_BROADCAST_CODES[name]
    if (code && id && !map.has(id)) map.set(id, code)
  }
  return map
})()

/**
 * Resolves any raw club name or API-Football team id to its canonical
 * three-letter broadcast code. Falls back to '—' — never a three-letter
 * truncation of an unknown name.
 */
export function getClubBroadcastCode(nameOrId) {
  if (nameOrId === null || nameOrId === undefined || nameOrId === '') return '—'
  if (typeof nameOrId === 'number' || /^\d+$/.test(String(nameOrId).trim())) {
    return CODE_BY_API_ID.get(Number(nameOrId)) || '—'
  }

  const n = normalizeClub(nameOrId)
  if (CLUB_BROADCAST_CODES[n]) return CLUB_BROADCAST_CODES[n]

  const stripped = n
    .replace(/\b(fc|cf|afc|cd|ca|ud|sc|us|rc|rcd|ssc|ac|as|aj)\b/g, '')
    .replace(/\b(calcio|balompie|alsace|1909|1913|1899|05|29|63|04)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ')
  if (CLUB_BROADCAST_CODES[stripped]) return CLUB_BROADCAST_CODES[stripped]

  const id = getClubApiId(nameOrId)
  if (id && CODE_BY_API_ID.has(id)) return CODE_BY_API_ID.get(id)

  return '—'
}

/**
 * Resolves any raw or canonical club name to its official API-Football integer ID.
 */
export function getClubApiId(name) {
  if (!name) return null
  if (typeof name === 'number') return name

  const n = normalizeClub(name)
  if (CLUB_API_IDS[n]) return CLUB_API_IDS[n]

  // Strip common structural prefixes and suffixes
  const stripped = n
    .replace(/\b(fc|cf|afc|cd|ca|ud|sc|us|rc|rcd|ssc|ac|as|aj)\b/g, '')
    .replace(/\b(calcio|balompie|alsace|1909|1913|1899|05|29|63|04)\b/g, '')
    .trim()
    .replace(/\s+/g, ' ')

  if (CLUB_API_IDS[stripped]) return CLUB_API_IDS[stripped]

  // Substring match against known club tokens
  for (const [key, id] of Object.entries(CLUB_API_IDS)) {
    if (key.length > 3 && (n.includes(key) || key.includes(n))) {
      return id
    }
  }

  return null
}

/**
 * Returns the public, free API-Sports CDN badge URL for a club name or team ID.
 */
export function getClubBadgeUrl(nameOrId) {
  const id = typeof nameOrId === 'number' ? nameOrId : getClubApiId(nameOrId)
  return id ? `https://media.api-sports.io/football/teams/${id}.png` : null
}
