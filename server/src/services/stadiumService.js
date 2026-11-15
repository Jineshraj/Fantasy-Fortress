import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName, getSimilarityScore } from './rosterValidator.js'
import { SIMILARITY_THRESHOLDS } from '../lib/constants.js'
import { getActiveGameweek } from './sheetsService.js'

// Official 16 Team Stadium Ownership & Real-World Home Club Mapping
export const TEAM_STADIUM_MAP = {
  'Aguilas Dorados': { stadium: 'Anfield', homeClub: 'Liverpool FC' },
  'Aura Farmers': { stadium: 'Etihad Stadium', homeClub: 'Manchester City' },
  'Aztec Blinders': { stadium: 'Stamford Bridge', homeClub: 'Chelsea FC' },
  'Choakers FC': { stadium: 'Spotify Camp Nou', homeClub: 'FC Barcelona' },
  'Committe Team': { stadium: 'Roazhon Park', homeClub: 'Stade Rennais FC' },
  'Iberian Wizards': { stadium: 'Parc des Princes', homeClub: 'Paris Saint-Germain' },
  'Jogo Bonito': { stadium: 'Santiago Bernabéu', homeClub: 'Real Madrid' },
  'Kroos Control': { stadium: 'Allianz Arena', homeClub: 'Bayern Munich' },
  'La Pulga': { stadium: 'Stadio Olimpico', homeClub: 'AS Roma' },
  'Mamangam DC': { stadium: 'Stadio Giuseppe Meazza(IM)', homeClub: 'Inter Milan' },
  'Mancunians': { stadium: 'Estadio de la Cerámica', homeClub: 'Villarreal CF' },
  'Meridian Athletic': { stadium: 'MHPArena', homeClub: 'VfB Stuttgart' },
  'Phoenix Flyers': { stadium: 'Riyadh Air Metropolitano', homeClub: 'Atlético de Madrid' },
  'Reds': { stadium: 'Emirates Stadium', homeClub: 'Arsenal FC' },
  'Relegated FC': { stadium: 'Old Trafford', homeClub: 'Manchester United' },
  'xG Illuminati': { stadium: 'Signal Iduna Park', homeClub: 'Borussia Dortmund' },
}

const spreadsheetId = process.env.GOOGLE_SHEET_ID

export const HOME_CLUB_ALIASES = {
  'Liverpool FC': ['Liverpool', 'LFC'],
  'Manchester City': ['Man City', 'Man. City', 'MCFC'],
  'Real Madrid': ['Real Madrid CF', 'Real Madrid C.F.'],
  'Bayern Munich': ['FC Bayern München', 'Bayern München', 'FCB'],
  'Paris Saint-Germain': ['PSG', 'Paris SG', 'Paris Saint-Germain FC'],
  'Inter Milan': ['Inter', 'FC Internazionale', 'Internazionale'],
  'Manchester United': ['Man United', 'Man. United', 'MUFC'],
  'Arsenal FC': ['Arsenal', 'AFC'],
  'Chelsea FC': ['Chelsea', 'CFC'],
  'FC Barcelona': ['Barcelona', 'Barça', 'Barca'],
  'Atlético de Madrid': ['Atletico Madrid', 'Atletico de Madrid', 'ATM'],
  'Borussia Dortmund': ['BVB', 'Dortmund'],
  'VfB Stuttgart': ['Stuttgart', 'VFB'],
  'Stade Rennais FC': ['Rennais', 'Rennes', 'SRFC'],
  'AS Roma': ['Roma'],
}

const RIVAL_PAIR_GUARDS = [
  { clubA: 'Atlético de Madrid', clubB: 'Athletic Bilbao', keyA: 'atletico', keyB: 'athletic' },
  { clubA: 'AS Roma', clubB: 'SS Lazio', keyA: 'roma', keyB: 'lazio' },
  { clubA: 'Real Sociedad', clubB: 'Real Betis', keyA: 'realsociedad', keyB: 'realbetis' },
  { clubA: 'Inter Milan', clubB: 'AC Milan', keyA: 'inter', keyB: 'milan' },
  { clubA: 'Inter Milan', clubB: 'Inter Miami', keyA: 'inter', keyB: 'miami' },
  { clubA: 'Bayern Munich', clubB: 'Bayer Leverkusen', keyA: 'bayern', keyB: 'leverkusen' },
  { clubA: 'Real Madrid', clubB: 'Real Sociedad', keyA: 'realmadrid', keyB: 'realsociedad' },
  { clubA: 'Real Madrid', clubB: 'Real Betis', keyA: 'realmadrid', keyB: 'realbetis' },
]

function getColumnLetters(colIndex) {
  let letters = ''
  while (colIndex >= 0) {
    letters = String.fromCharCode((colIndex % 26) + 65) + letters
    colIndex = Math.floor(colIndex / 26) - 1
  }
  return letters
}

function findColumnByHeader(headers, pattern) {
  const regex = new RegExp(pattern)
  for (let i = 0; i < headers.length; i++) {
    if (regex.test(String(headers[i] || '').trim())) return i
  }
  return -1
}

export function matchHomeClub(ownedClub, fixtureHomeTeam) {
  const normOwned = normalizeName(ownedClub)
  const normFixture = normalizeName(fixtureHomeTeam)
  if (normOwned === normFixture) return true

  for (const [canonical, aliases] of Object.entries(HOME_CLUB_ALIASES)) {
    const normCanonical = normalizeName(canonical)
    const allNames = [normCanonical, ...aliases.map((a) => normalizeName(a))]
    if (allNames.includes(normOwned) && allNames.includes(normFixture)) {
      return true
    }
  }

  // F-09: Token-subset match for cases like "stade rennais" vs "Stade Rennais FC"
  // (same prefix, suffix FC/CF/SC stripped) or "manchester united" vs
  // "Manchester United FC". Also handles the reverse direction.
  const stripSuffixes = (s) => s.replace(/\s+(fc|cf|sc|afc|cfc|mcfc)$/g, '').trim()
  const strippedOwned = stripSuffixes(normOwned)
  const strippedFixture = stripSuffixes(normFixture)
  if (strippedOwned && strippedFixture && strippedOwned === strippedFixture) return true
  // Also handle the case where one is a prefix of the other after stripping
  // (e.g., "rennais" should match "stade rennais" because both reduce to same root)
  if (strippedOwned && strippedFixture &&
      (strippedOwned.endsWith(strippedFixture) || strippedFixture.endsWith(strippedOwned))) {
    return true
  }

  for (const guard of RIVAL_PAIR_GUARDS) {
    const aMatchesOwned = normOwned === guard.keyA || normOwned === normalizeName(TEAM_STADIUM_MAP[Object.keys(TEAM_STADIUM_MAP).find(k => normalizeName(TEAM_STADIUM_MAP[k].homeClub) === guard.keyA)]?.homeClub || '')
    const bMatchesOwned = normOwned === guard.keyB || normOwned === normalizeName(TEAM_STADIUM_MAP[Object.keys(TEAM_STADIUM_MAP).find(k => normalizeName(TEAM_STADIUM_MAP[k].homeClub) === guard.keyB)]?.homeClub || '')
    const aMatchesFix = normFixture === guard.keyA
    const bMatchesFix = normFixture === guard.keyB
    if ((aMatchesOwned && aMatchesFix) || (bMatchesOwned && bMatchesFix)) return true
    if ((aMatchesOwned && bMatchesFix) || (bMatchesOwned && aMatchesFix)) return false
  }

  if (normOwned.includes('manchester') && normFixture.includes('manchester')) {
    const isCityOwned = normOwned.includes('city')
    const isCityFix = normFixture.includes('city')
    const isUtdOwned = normOwned.includes('united') || normOwned.includes('utd')
    const isUtdFix = normFixture.includes('united') || normFixture.includes('utd')
    if (isCityOwned && isCityFix) return true
    if (isUtdOwned && isUtdFix) return true
    return false
  }

  return getSimilarityScore(normOwned, normFixture) >= SIMILARITY_THRESHOLDS.STADIUM_CLUB
}

function safeGetScore(value) {
  if (value === undefined || value === null || value === '') return null
  const num = Number(value)
  return isNaN(num) ? null : num
}

function getStadiumPointsForMatch(homeScore, awayScore) {
  if (homeScore === null || awayScore === null) return { pts: 0, label: 'Score Unavailable' }
  if (homeScore > awayScore) return { pts: 5, label: 'Home Win +5' }
  if (homeScore === awayScore) return { pts: 2, label: 'Home Draw +2' }
  return { pts: 0, label: 'Home Loss 0' }
}

export async function syncStadiumPoints(targetGw) {
  if (!targetGw) {
    targetGw = await getActiveGameweek()
  }

  console.log('===========================================================')
  console.log(`🏟️ SYNCING STADIUM POINTS FOR GW${targetGw}`)
  console.log('===========================================================')

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const stadiumRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'Stadium Auction'!A1:Z20",
  })
  const stadiumRows = stadiumRes.data.values || []
  const headers = stadiumRows[0] || []

  const fixtureRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A2:J',
  })
  const fixtureRows = (fixtureRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))

  const ptsColIdx = findColumnByHeader(headers, `^GW${targetGw}(-Pts)?$`)
  const homeClubColIdx = findColumnByHeader(headers, '^(home_club|club)$')
  const teamColIdxRaw = findColumnByHeader(headers, '^team$')
  const teamColIdx = teamColIdxRaw >= 0 ? teamColIdxRaw : 4

  // Base metadata columns (indices 0 to 5):
  // 0: Auction Order, 1: Stadium Name, 2: Base Price, 3: Winning Bid, 4: Team, 5: home_club
  // Gameweek points columns start at index 6: GW1=6 (Col G), GW2=7 (Col H), GW3=8 (Col I), GW4=9 (Col J)...
  let targetPtsCol = ptsColIdx
  if (targetPtsCol < 0) {
    const expectedCol = 5 + Number(targetGw)
    if (expectedCol < headers.length && headers[expectedCol] && !headers[expectedCol].startsWith(`GW${targetGw}`)) {
      targetPtsCol = Math.max(headers.length, 6)
    } else {
      targetPtsCol = Math.max(expectedCol, 6)
    }
  }
  const targetHomeClubCol = homeClubColIdx >= 0 ? homeClubColIdx : 5

  const ptsColLetter = getColumnLetters(targetPtsCol)
  const homeClubColLetter = getColumnLetters(targetHomeClubCol)

  const existingPtsMap = new Map()
  if (ptsColIdx >= 0) {
    for (let i = 1; i < stadiumRows.length; i++) {
      const existing = Number(stadiumRows[i][ptsColIdx])
      existingPtsMap.set(String(stadiumRows[i][1] || '').trim().toLowerCase(), existing)
    }
  }

  const updatePtsValues = []
  const updateHomeClubValues = []
  const teamHomeClubMap = new Map()

  for (let i = 1; i < stadiumRows.length; i++) {
    const row = stadiumRows[i]
    const stadiumName = String(row[1] || '').trim()
    const teamName = String(row[teamColIdx] || '').trim()

    const mapping = TEAM_STADIUM_MAP[teamName]
    const homeClub = mapping ? mapping.homeClub : ''
    const normHomeClub = normalizeName(homeClub)

    let totalStadiumPts = 0

    for (const f of fixtureRows) {
      const fHome = String(f[3] || '').trim()
      const fAway = String(f[4] || '').trim()
      const fStatus = String(f[7] || '').trim().toUpperCase()

      if (matchHomeClub(normHomeClub, fHome)) {
        const homeScore = safeGetScore(f[8])
        const awayScore = safeGetScore(f[9])

        if (homeScore === null || awayScore === null) {
          console.warn(`[Stadium] Match ${fHome} vs ${fAway}: score data incomplete (home=${f[8]}, away=${f[9]}). Treating as 0 pts.`)
        }

        if (fStatus === 'FINISHED' || fStatus === 'AET' || fStatus === 'PEN') {
          const { pts } = getStadiumPointsForMatch(homeScore ?? 0, awayScore ?? 0)
          totalStadiumPts += pts
        } else if (fStatus === 'POSTPONED' || fStatus === 'SUSPENDED') {
        } else if (fStatus === 'AWARDED') {
          console.warn(`[Stadium] AWARDED match detected for ${fHome}: manual stadium points override needed in sheet`)
        }
      }
    }

    updatePtsValues.push([totalStadiumPts])

    const existingHomeClub = homeClubColIdx >= 0 ? String(row[homeClubColIdx] || '').trim() : ''
    if (homeClubColIdx < 0 || existingHomeClub === '') {
      updateHomeClubValues.push([homeClub])
    } else {
      updateHomeClubValues.push([existingHomeClub])
    }

    if (teamName) {
      teamHomeClubMap.set(teamName, existingHomeClub || homeClub)
    }
  }

  const ptsUpdates = []
  const homeUpdates = []
  for (let i = 1; i < stadiumRows.length; i++) {
    const stadiumName = String(stadiumRows[i][1] || '').trim().toLowerCase()
    const existingPts = existingPtsMap.get(stadiumName) ?? 0
    const newPts = updatePtsValues[i - 1]?.[0] ?? 0
    if (newPts !== existingPts) {
      ptsUpdates.push({ rowIdx: i + 1, value: newPts })
    }
    if (updateHomeClubValues[i - 1]?.[0] !== stadiumRows[i][homeClubColIdx]) {
      homeUpdates.push({ rowIdx: i + 1, value: updateHomeClubValues[i - 1]?.[0] })
    }
  }

  if (ptsUpdates.length === 0 && homeUpdates.length === 0) {
    console.log('[Stadium] No changes detected — skipping Stadium Auction write.')
  } else {
    const allUpdates = []
    if (ptsUpdates.length > 0) {
      if (ptsColIdx < 0) {
        allUpdates.push({
          range: `'Stadium Auction'!${ptsColLetter}1:${ptsColLetter}${updatePtsValues.length + 1}`,
          values: [[`GW${targetGw}-Pts`], ...updatePtsValues],
        })
      } else {
        allUpdates.push({
          range: `'Stadium Auction'!${ptsColLetter}2:${ptsColLetter}${updatePtsValues.length + 1}`,
          values: updatePtsValues,
        })
      }
    }
    if (homeUpdates.length > 0) {
      if (homeClubColIdx < 0) {
        allUpdates.push({
          range: `'Stadium Auction'!${homeClubColLetter}1:${homeClubColLetter}${updateHomeClubValues.length + 1}`,
          values: [['home_club'], ...updateHomeClubValues],
        })
      } else {
        allUpdates.push({
          range: `'Stadium Auction'!${homeClubColLetter}2:${homeClubColLetter}${updateHomeClubValues.length + 1}`,
          values: updateHomeClubValues,
        })
      }
    }
    if (allUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data: allUpdates },
      })
      console.log(`[Stadium] Wrote ${ptsUpdates.length} pts changes + ${homeUpdates.length} home_club changes.`)
    }
  }



  const stadiumPointsMap = new Map()
  for (let i = 1; i < stadiumRows.length; i++) {
    const stadiumName = String(stadiumRows[i][1] || '').trim()
    const pts = updatePtsValues[i - 1]?.[0] || 0
    stadiumPointsMap.set(stadiumName.toLowerCase(), pts)
  }

  console.log(`✅ Successfully updated GW${targetGw} stadium points in 'Stadium Auction' tab!`)
  return { stadiumPointsMap, teamHomeClubMap }
}
