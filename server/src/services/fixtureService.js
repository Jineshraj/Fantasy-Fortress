import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { fetchTop5FixturesByDate } from './apiFootballSyncService.js'
import { normalizeName, getSimilarityScore, cleanClubName } from './rosterValidator.js'
import { SIMILARITY_THRESHOLDS } from '../lib/constants.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID
const apiKey = process.env.RAPIDAPI_KEY
const fallbackApiKey = process.env.RAPIDAPI_KEY_FALLBACK
const apiHost = process.env.RAPIDAPI_SOFASCORE_HOST || 'sofascore6.p.rapidapi.com'

const STATUS_RETRY = new Set([429, 500, 502, 503, 504])

async function sofaFetch(url, label) {
  const attempts = [
    { name: 'primary', key: apiKey },
    { name: 'primary-retry', key: apiKey },
    { name: 'fallback', key: fallbackApiKey },
  ].filter((a) => Boolean(a.key))

  let lastError
  let lastStatus
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1500))
    }
    try {
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-key': attempt.key,
          'x-rapidapi-host': apiHost,
        },
      })
      if (res.ok) {
        if (attempt.name === 'fallback') {
          console.warn(`[SofaScore] ${label}: primary key failed, served by fallback key`)
        } else if (attempt.name === 'primary-retry') {
          console.log(`[SofaScore] ${label}: succeeded on primary retry`)
        }
        return res
      }
      lastStatus = res.status
      const retryable = STATUS_RETRY.has(res.status)
      console.warn(`[SofaScore] ${label}: ${attempt.name} key returned ${res.status}${retryable && i < attempts.length - 1 ? ' — retrying' : ''}`)
      if (!retryable || i === attempts.length - 1) {
        return res
      }
    } catch (err) {
      lastError = err
      console.warn(`[SofaScore] ${label}: ${attempt.name} key threw ${err.message}${i < attempts.length - 1 ? ' — retrying' : ''}`)
    }
  }
  if (lastError) throw lastError
  const err = new Error(`SofaScore ${label} failed across all keys (last status ${lastStatus})`)
  err.status = lastStatus
  throw err
}

const TOP_5_LEAGUE_SPECS = [
  { name: 'Premier League', country: 'England' },
  { name: 'LaLiga', country: 'Spain' },
  { name: 'Serie A', country: 'Italy' },
  { name: 'Bundesliga', country: 'Germany' },
  { name: 'Ligue 1', country: 'France' },
]

/**
 * Strict Top 5 League Filter for SofaScore (1st Division Only)
 */
function isStrictTop5League(ev) {
  const tName = (ev.tournament?.name || ev.tournament?.uniqueTournament?.name || '').trim()
  const cName = (ev.tournament?.category?.name || ev.tournament?.uniqueTournament?.category?.name || ev.category?.name || '').trim()
  const lower = tName.toLowerCase()
  const cLower = cName.toLowerCase()

  // 1. Strictly block lower tiers, women's leagues, and youth cups
  if (
    lower.includes('2') ||
    lower.includes('segunda') ||
    lower.includes('hypermotion') ||
    lower.includes('b ') ||
    lower.endsWith(' b') ||
    lower.includes('frauen') ||
    lower.includes('women') ||
    lower.includes('fem') ||
    lower.includes('u20') ||
    lower.includes('u19') ||
    lower.includes('u21') ||
    lower.includes('u23') ||
    lower.includes('u18') ||
    lower.includes('u17') ||
    lower.includes('u16') ||
    lower.includes('u15') ||
    lower.includes('u14') ||
    lower.includes('u13') ||
    lower.includes('serie b') ||
    lower.includes('amateur') ||
    lower.includes('reserve') ||
    lower.includes('cup') ||
    lower.includes('copa') ||
    lower.includes('trophy') ||
    lower.includes('shield')
  ) {
    return false
  }

  // 2. Strict 1st Division match only
  const isEpl = (lower === 'premier league' || lower === 'premier league 24/25' || lower === 'premier league 25/26' || lower === 'premier league 26/27') && (cLower === 'england' || !cName)
  const isLaLiga = (lower === 'laliga' || lower === 'la liga' || lower === 'laliga ea sports' || lower === 'primera división') && (cLower === 'spain' || !cName)
  const isSerieA = (lower === 'serie a' || lower === 'serie a tim' || lower === 'serie a enilive') && (cLower === 'italy' || !cName)
  const isBundesliga = (lower === 'bundesliga' || lower === 'bundesliga 24/25' || lower === 'bundesliga 25/26' || lower === 'bundesliga 26/27') && (cLower === 'germany' || !cName)
  const isLigue1 = (lower === 'ligue 1' || lower === 'ligue 1 mcdonald\'s' || lower === 'ligue 1 uber eats') && (cLower === 'france' || !cName)

  return isEpl || isLaLiga || isSerieA || isBundesliga || isLigue1
}

/**
 * Fetches SofaScore Top 5 matches for a single date
 */
export async function fetchTop5MatchesByDate(dateStr, gameweek = 2) {
  const url = `https://${apiHost}/api/sofascore/v1/match/list?sport_slug=football&date=${dateStr}`
  console.log(`[SofaScore API] Fetching matches for ${dateStr}...`)

  const res = await sofaFetch(url, `match/list ${dateStr}`)
  if (!res.ok) {
    throw new Error(`SofaScore API Error (${res.status}): ${await res.text()}`)
  }

  const data = await res.json()
  const events = Array.isArray(data) ? data : (data.events || [])
  const top5Matches = events.filter(isStrictTop5League)

  console.log(`[SofaScore API] ${dateStr}: Found ${top5Matches.length} STRICT Top 5 matches.`)

  return top5Matches.map((ev) => {
    const league = ev.tournament?.name || 'Top 5'
    const statusType = ev.status?.type || 'notstarted'
    let status = 'SCHEDULED'
    if (statusType === 'finished') status = 'FINISHED'
    else if (statusType === 'inprogress') status = 'LIVE'

    const homeScore = ev.homeScore?.current !== undefined ? ev.homeScore.current : ev.homeScore?.display !== undefined ? ev.homeScore.display : ''
    const awayScore = ev.awayScore?.current !== undefined ? ev.awayScore.current : ev.awayScore?.display !== undefined ? ev.awayScore.display : ''

    return {
      gameweek: String(gameweek),
      match_date: dateStr,
      league,
      home_club: ev.homeTeam?.name || 'Home',
      away_club: ev.awayTeam?.name || 'Away',
      sofascore_event_id: String(ev.id),
      api_football_fixture_id: '',
      status,
      home_score: String(homeScore),
      away_score: String(awayScore),
    }
  })
}

function isClubMatch(nameA, nameB) {
  const normA = normalizeName(nameA)
  const normB = normalizeName(nameB)
  if (!normA || !normB) return false
  if (normA === normB) return true
  if (normA.includes(normB) || normB.includes(normA)) return true
  return getSimilarityScore(normA, normB) >= SIMILARITY_THRESHOLDS.ROSTER_MATCH
}

export const MASTER_TOP5_CLUBS = [
  // Premier League
  'Arsenal FC', 'Aston Villa', 'AFC Bournemouth', 'Brentford FC', 'Brighton & Hove Albion',
  'Chelsea FC', 'Crystal Palace', 'Everton FC', 'Fulham FC', 'Hull City', 'Ipswich Town',
  'Leeds United', 'Liverpool FC', 'Manchester City', 'Manchester United', 'Newcastle United',
  'Nottingham Forest', 'Sunderland AFC', 'Tottenham Hotspur', 'West Ham United', 'Wolverhampton Wanderers',
  'Coventry City',
  // La Liga
  'Athletic Bilbao', 'Atlético de Madrid', 'CA Osasuna', 'CD Leganés', 'Celta de Vigo',
  'Deportivo Alavés', 'Deportivo de La Coruña', 'Elche CF', 'FC Barcelona', 'Getafe CF',
  'Girona FC', 'Levante UD', 'Málaga CF', 'RCD Espanyol Barcelona', 'RCD Mallorca',
  'Rayo Vallecano', 'Real Betis Balompié', 'Real Madrid', 'Real Sociedad', 'Real Valladolid CF',
  'Sevilla FC', 'UD Las Palmas', 'Valencia CF', 'Villarreal CF', 'Real Racing Club', 'Racing Santander',
  // Serie A
  'AC Milan', 'AC Monza', 'AS Roma', 'Atalanta BC', 'Bologna FC 1909', 'Cagliari Calcio',
  'Como 1907', 'Empoli FC', 'ACF Fiorentina', 'Frosinone Calcio', 'Genoa CFC', 'Hellas Verona',
  'Inter Milan', 'Juventus FC', 'SS Lazio', 'US Lecce', 'SSC Napoli', 'Parma Calcio 1913',
  'Torino FC', 'Udinese Calcio', 'Venezia FC', 'US Sassuolo',
  // Ligue 1
  'AJ Auxerre', 'Angers SCO', 'AS Monaco', 'AS Saint-Étienne', 'Clermont Foot 63', 'FC Lorient',
  'FC Metz', 'FC Nantes', 'FC Toulouse', 'Havre AC', 'LOSC Lille', 'Montpellier HSC',
  'OGC Nice', 'Olympique de Marseille', 'Olympique Lyon', 'Paris FC', 'Paris Saint-Germain',
  'RC Lens', 'RC Strasbourg Alsace', 'Stade Brestois 29', 'Stade de Reims', 'Stade Rennais FC',
  // Bundesliga (ADDED)
  'FC Bayern München', 'Borussia Dortmund', 'RB Leipzig', 'Bayer 04 Leverkusen', 'VfB Stuttgart',
  'Eintracht Frankfurt', 'VfL Wolfsburg', '1. FC Union Berlin', 'SC Freiburg', 'TSG 1899 Hoffenheim',
  '1. FSV Mainz 05', 'Werder Bremen', 'FC Augsburg', 'Borussia Mönchengladbach', '1. FC Köln',
  'FC St. Pauli', 'Hamburger SV', '1. FC Heidenheim',
]

export function getCanonicalClubName(raw) {
  if (!raw) return ''
  const str = cleanClubName(raw) || String(raw).trim()

  const norm = normalizeName(str)
  let best = str
  let maxSim = 0

  for (const master of MASTER_TOP5_CLUBS) {
    const normM = normalizeName(master)
    if (norm === normM) return master
    if (norm.includes(normM) || normM.includes(norm)) {
      const score = getSimilarityScore(norm, normM) + 0.35
      if (score > maxSim) {
        maxSim = score
        best = master
      }
    }
    const score = getSimilarityScore(norm, normM)
    if (score > maxSim && score >= SIMILARITY_THRESHOLDS.ROSTER_MATCH) {
      maxSim = score
      best = master
    }
  }
  return maxSim >= SIMILARITY_THRESHOLDS.ROSTER_MATCH ? best : str
}

function getClubRootToken(clubName) {
  const norm = normalizeName(clubName)
  const stopWords = new Set(['fc', 'cf', 'afc', 'bc', 'calcio', 'sco', 'rc', 'club', 'de', 'stade', 'real', 'rcd', 'ssc', 'ac', 'as', 'us', 'ud', 'cd', 'ca', 'aj', 'la', 'coruna', 'saint', 'germain', 'rb', 'vfb', 'vfl', 'tsg', 'fsv', 'sv', 'sc'])
  const tokens = norm.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t))
  return tokens[0] || norm
}

/**
 * Saves and pairs fixtures to 'Fixture_Staging' tab with 100% Duplicate-Proof Multi-Key Merging
 */
export async function upsertFixturesToSheet(newFixtures = [], apiFootballMatches = [], targetGameweek = 2) {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // 1. Read existing fixtures
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A1:J',
  })

  const existingRows = res.data.values || []
  const header = existingRows[0] || [
    'gw',
    'match_date',
    'league',
    'home_club',
    'away_club',
    'sofascore_event_id',
    'api_football_fixture_id',
    'status',
    'home_score',
    'away_score',
  ]

  const fixtureMap = new Map()

  const validTop5Leagues = new Set([
    'Premier League',
    'LaLiga',
    'La Liga',
    'Serie A',
    'Bundesliga',
    'Ligue 1',
  ])

  function findExistingMatch(sofaId, afId, gw, date, home, away) {
    const homeRoot = getClubRootToken(home)
    const awayRoot = getClubRootToken(away)

    for (const [k, f] of fixtureMap.entries()) {
      if (sofaId && f.sofaId && f.sofaId === sofaId) return k
      if (afId && f.afId && f.afId === afId) return k
      if (f.gw === String(gw) && f.date === String(date)) {
        const fHomeRoot = getClubRootToken(f.home)
        const fAwayRoot = getClubRootToken(f.away)
        if (fHomeRoot === homeRoot && fAwayRoot === awayRoot) return k
      }
    }
    return null
  }

  // Retain existing valid rows (Strict Top 5 Only)
  for (let i = 1; i < existingRows.length; i++) {
    const r = existingRows[i]
    const league = String(r[2] || '').trim()
    const isTop5 = validTop5Leagues.has(league) || league.toLowerCase().includes('premier league') || league.toLowerCase().includes('laliga') || league.toLowerCase().includes('serie a') || league.toLowerCase().includes('bundesliga') || league.toLowerCase().includes('ligue 1')
    
    if (!isTop5 || league.includes('Frauen') || league.includes('Serie B') || league.includes('Division') || league.includes('Hampshire') || league.includes('Dorset') || league.includes('Northern')) {
      continue
    }

    let homeClub = getCanonicalClubName(r[3])
    let awayClub = getCanonicalClubName(r[4])
    const sofaId = String(r[5] || '').trim()
    const afId = String(r[6] || '').trim()

    // If homeClub or awayClub could not be canonicalized (e.g., the raw string contained
    // a position suffix like "Left Winger" that no canonical-mapping rule covered), log a
    // warning and keep the row with the (possibly empty) values rather than silently
    // dropping it. Downstream consumers (stadiumService, scoringEngine) can use the
    // fixture_id for matching and the admin can manually fix the sheet.
    if (!homeClub || !awayClub) {
      console.warn(
        `[Fixture Staging] Could not canonicalize clubs for GW${r[0]} match ${sofaId || afId || `${r[0]}_${r[1]}`}: home="${homeClub}" away="${awayClub}". ` +
        `Row kept with empty clubs; admin should manually verify.`
      )
    }

    const matchedKey = findExistingMatch(sofaId, afId, r[0], r[1], homeClub, awayClub)
    const key = matchedKey || `${r[0]}_${r[1]}_${getClubRootToken(homeClub)}_${getClubRootToken(awayClub)}`

    if (fixtureMap.has(key)) {
      const existing = fixtureMap.get(key)
      existing.sofaId = existing.sofaId || sofaId
      existing.afId = existing.afId || afId
      if (String(r[7]).toUpperCase() === 'FINISHED') existing.status = 'FINISHED'
      if (r[8] && r[8] !== 'undefined') existing.homeScore = String(r[8])
      if (r[9] && r[9] !== 'undefined') existing.awayScore = String(r[9])
    } else {
      fixtureMap.set(key, {
        gw: String(r[0] || '2'),
        date: String(r[1] || ''),
        league,
        home: homeClub,
        away: awayClub,
        sofaId,
        afId,
        status: String(r[7] || 'SCHEDULED'),
        homeScore: r[8] === 'undefined' ? '' : String(r[8] || ''),
        awayScore: r[9] === 'undefined' ? '' : String(r[9] || ''),
      })
    }
  }

  // Merge SofaScore fixtures
  for (const f of newFixtures) {
    const homeClub = getCanonicalClubName(f.home_club)
    const awayClub = getCanonicalClubName(f.away_club)
    const sofaId = String(f.sofascore_event_id || '')

    let matchedApiId = ''
    if (apiFootballMatches.length > 0) {
      const match = apiFootballMatches.find((af) => {
        const afHome = af.teams?.home?.name || af.home_team || ''
        const afAway = af.teams?.away?.name || af.away_team || ''
        return isClubMatch(homeClub, afHome) && isClubMatch(awayClub, afAway)
      })
      if (match) {
        matchedApiId = String(match.fixture?.id || match.fixture_id || '')
      }
    }

    const matchedKey = findExistingMatch(sofaId, matchedApiId, f.gameweek, f.match_date, homeClub, awayClub)
    const key = matchedKey || `${f.gameweek}_${f.match_date}_${getClubRootToken(homeClub)}_${getClubRootToken(awayClub)}`

    if (fixtureMap.has(key)) {
      const existing = fixtureMap.get(key)
      existing.sofaId = sofaId || existing.sofaId
      existing.afId = matchedApiId || existing.afId
      if (f.status === 'FINISHED') existing.status = 'FINISHED'
      if (f.home_score !== '' && f.home_score !== 'undefined') existing.homeScore = String(f.home_score)
      if (f.away_score !== '' && f.away_score !== 'undefined') existing.awayScore = String(f.away_score)
    } else {
      fixtureMap.set(key, {
        gw: String(f.gameweek),
        date: f.match_date,
        league: f.league,
        home: homeClub,
        away: awayClub,
        sofaId,
        afId: matchedApiId,
        status: f.status || 'SCHEDULED',
        homeScore: f.home_score === 'undefined' ? '' : String(f.home_score || ''),
        awayScore: f.away_score === 'undefined' ? '' : String(f.away_score || ''),
      })
    }
  }

  // Merge API-Football fixtures
  for (const af of apiFootballMatches) {
    const afId = String(af.fixture?.id || af.fixture_id || '')
    const afHomeRaw = String(af.teams?.home?.name || af.home_team || '')
    const afAwayRaw = String(af.teams?.away?.name || af.away_team || '')
    const homeClub = getCanonicalClubName(afHomeRaw)
    const awayClub = getCanonicalClubName(afAwayRaw)
    const afLeague = String(af.league?.name || 'Top 5')
    const afDate = String(af.fixture?.date || '').split('T')[0]
    const afStatus = af.fixture?.status?.short === 'FT' ? 'FINISHED' : 'SCHEDULED'
    const homeScore = af.goals?.home !== undefined && af.goals?.home !== null ? String(af.goals.home) : ''
    const awayScore = af.goals?.away !== undefined && af.goals?.away !== null ? String(af.goals.away) : ''
    const gwStr = String(af.gameweek || targetGameweek || '2')

    const matchedKey = findExistingMatch('', afId, gwStr, afDate, homeClub, awayClub)
    const key = matchedKey || `${gwStr}_${afDate}_${getClubRootToken(homeClub)}_${getClubRootToken(awayClub)}`

    if (fixtureMap.has(key)) {
      const existing = fixtureMap.get(key)
      existing.afId = afId || existing.afId
      if (afStatus === 'FINISHED') existing.status = 'FINISHED'
      if (homeScore !== '') existing.homeScore = homeScore
      if (awayScore !== '') existing.awayScore = awayScore
    } else if (afId) {
      fixtureMap.set(key, {
        gw: gwStr,
        date: afDate,
        league: afLeague,
        home: homeClub,
        away: awayClub,
        sofaId: '',
        afId,
        status: afStatus,
        homeScore,
        awayScore,
      })
    }
  }

  // Sort chronologically: Date ASC -> League ASC -> Home ASC
  const sortedFixtures = Array.from(fixtureMap.values()).sort((a, b) => {
    return (
      (a.date || '').localeCompare(b.date || '') ||
      (a.league || '').localeCompare(b.league || '') ||
      (a.home || '').localeCompare(b.home || '')
    )
  })

  const finalRows = [
    header,
    ...sortedFixtures.map((f) => [
      f.gw,
      f.date,
      f.league,
      f.home,
      f.away,
      f.sofaId,
      f.afId,
      f.status,
      f.homeScore,
      f.awayScore,
    ]),
  ]

  // Clear and update sheet cleanly
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Fixture_Staging!A:J',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Fixture_Staging!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: finalRows,
    },
  })

  console.log(`[Fixture Staging] Successfully synced ${finalRows.length - 1} unique, paired, sorted fixtures!`)
}

/**
 * Syncs match fixtures for a date range with paired SofaScore and API-Football IDs
 */
export async function syncFixturesDateRange(startDate, endDate, gameweek = 2) {
  console.log(`===========================================================`)
  console.log(`🗓️ SYNCING STRICT TOP 5 FIXTURES FOR GW${gameweek}: ${startDate} to ${endDate}`)
  console.log(`===========================================================`)

  const start = new Date(startDate)
  const end = new Date(endDate)
  let allFixtures = []
  let allApiFootballMatches = []

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    try {
      // 1. Fetch SofaScore Strict Top 5 matches
      const dayMatches = await fetchTop5MatchesByDate(dateStr, gameweek)
      allFixtures.push(...dayMatches)

      // 2. Fetch API-Football Top 5 matches for the same date
      const afMatches = await fetchTop5FixturesByDate(dateStr)
      allApiFootballMatches.push(...afMatches)

      await new Promise((r) => setTimeout(r, 500))
    } catch (err) {
      console.error(`[Fixture Sync Error on ${dateStr}]:`, err.message)
    }
  }

  console.log(`\nWriting ${allFixtures.length} GW${gameweek} matches to 'Fixture_Staging' tab...`)
  await upsertFixturesToSheet(allFixtures, allApiFootballMatches, gameweek)
  console.log(`🎉 GW${gameweek} Fixtures Sync Completed!`)
}
