import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName, getSimilarityScore, isSameClub, cleanClubName } from './rosterValidator.js'
import { getCanonicalClubName } from './fixtureService.js'
import { SIMILARITY_THRESHOLDS } from '../lib/constants.js'
import { resolveExactTabName, getActiveGameweek } from './sheetsService.js'
import { syncStadiumPoints, matchHomeClub, TEAM_STADIUM_MAP } from './stadiumService.js'
import { buildPointsBreakdown, buildMatchBreakdown } from './scoringRules.js'

// Re-export TEAM_STADIUM_MAP for backwards-compatibility
export { TEAM_STADIUM_MAP }

const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1smqnbGD0chXTYLRepUrmiQePc5zuMdQu4AFaASZZRcU'

// D49: Simple deterministic hash for lineup fingerprinting
function simpleHash(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

function getColumnLetters(colIndex) {
  let letters = ''
  while (colIndex >= 0) {
    letters = String.fromCharCode((colIndex % 26) + 65) + letters
    colIndex = Math.floor(colIndex / 26) - 1
  }
  return letters
}

export function getGwColumnRange(targetGw) {
  const startColIdx = 9 + (Number(targetGw) - 1) * 6 // 0-indexed: J is 9
  const endColIdx = startColIdx + 5
  const startCol = getColumnLetters(startColIdx)
  const endCol = getColumnLetters(endColIdx)
  return `${startCol}1:${endCol}19`
}

/**
 * Automatically ensures sheets have sufficient columns before writing
 */
export async function ensureGridColumns(sheets, spreadsheetId, targetGw, targetTabs) {
  const endColIdx = 9 + (Number(targetGw) - 1) * 6 + 5
  const requiredCols = endColIdx + 1 // 1-indexed count required for this GW
  // Expand comfortably to 250 columns (covers full 38 GWs = 237 cols), or requiredCols + 20
  const targetCols = Math.max(requiredCols + 20, 250)

  try {
    const meta = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: 'sheets(properties(sheetId,title,gridProperties))',
    })

    const requests = []
    const tabSet = new Set((targetTabs || []).map((t) => t.toLowerCase()))

    for (const s of meta.data.sheets || []) {
      const title = s.properties.title
      if (tabSet.has(title.toLowerCase())) {
        const currentCols = s.properties.gridProperties?.columnCount || 26
        const needed = title.toLowerCase() === 'standings' ? Math.max(requiredCols, 41) : requiredCols
        if (currentCols < needed) {
          requests.push({
            updateSheetProperties: {
              properties: {
                sheetId: s.properties.sheetId,
                gridProperties: {
                  columnCount: targetCols,
                },
              },
              fields: 'gridProperties.columnCount',
            },
          })
        }
      }
    }

    if (requests.length > 0) {
      console.log(`[Grid Auto-Expand] Expanding grid columns to ${targetCols} for ${requests.length} sheet(s)...`)
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests },
      })
      console.log(`[Grid Auto-Expand] ✅ Grid expanded successfully!`)
    }
  } catch (err) {
    console.warn(`[Grid Auto-Expand Warning] Could not auto-expand sheet columns:`, err.message)
  }
}

/**
 * Main Fantasy Scoring Engine for all 16 Teams
 */
export async function calculateAndSyncTeamScores(targetGw) {
  if (!targetGw) {
    targetGw = await getActiveGameweek()
  }

  console.log('===========================================================')
  console.log(`🏆 RUNNING 16-TEAM FANTASY SCORING ENGINE FOR GW${targetGw}`)
  console.log('===========================================================')

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // 1. Load Submitted Lineups for target GW
  console.log('\n[1/5] Loading submitted team lineups from "Lineup_Rosters"...')
  const rosterRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Lineup_Rosters!A2:H',
  })
  const allRosterRows = (rosterRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))

  // Group by team_name
  const teamRosters = new Map()
  for (const r of allRosterRows) {
    const team = String(r[1] || '').trim()
    if (!teamRosters.has(team)) teamRosters.set(team, [])
    teamRosters.get(team).push({
      gw: String(r[0] || '').trim(),
      team_name: team,
      player_name: String(r[2] || '').trim(),
      position: String(r[3] || 'MID').trim().toUpperCase(),
      role: String(r[4] || 'STARTER').trim().toUpperCase(),
      is_captain: String(r[5] || '').toUpperCase() === 'TRUE',
      is_vice: String(r[6] || '').toUpperCase() === 'TRUE',
    })
  }

  console.log(`Loaded lineups for ${teamRosters.size} teams for GW${targetGw}.`)

  // 1b. Load Player_ID_Mappings as the canonical name registry.
  //     This is the authoritative mapping from short fantasy names ("Gabriel")
  //     to full names used in staging ("Gabriel Magalhães"), plus club + API/SS IDs.
  //     Every downstream lookup uses this mapping's canonical_name to find rows
  //     across Comparison_Dashboard, SofaScore_Staging and API_Football_Staging.
  console.log('\n[1b/5] Loading canonical player names from "Player_ID_Mappings"...')
  const idMapRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Player_ID_Mappings!A2:F',
  })
  const canonicalNameByNorm = new Map() // normalized lineup name → {canonical, club, sofaId, apiId}
  for (const r of idMapRes.data.values || []) {
    const name = String(r[1] || '').trim()
    const club = String(r[2] || '').trim()
    const apiId = String(r[3] || '').trim()
    const sofaId = String(r[4] || '').trim()
    if (!name) continue
    const key = normalizeName(name)
    if (!canonicalNameByNorm.has(key)) {
      canonicalNameByNorm.set(key, { canonical: name, club, apiId, sofaId })
    }
  }
  console.log(`Loaded ${canonicalNameByNorm.size} canonical player names from Player_ID_Mappings.`)

  // 2. Load Final Approved Player Points (GW1 from SofaScore_Staging, GW2+ from Comparison_Dashboard)
  const playerPointsMap = new Map()

  if (Number(targetGw) === 1) {
    console.log('\n[2/5] Loading GW1 player points from "SofaScore_Staging"...')
    const sofaRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SofaScore_Staging!A2:N',
    })
    const sofaRows = (sofaRes.data.values || []).filter((r) => String(r[0] || '').trim() === '1')
    sofaRows.forEach((r) => {
      const pName = normalizeName(String(r[2] || '').trim())
      const pts = Number(r[13] || 0)
      const club = String(r[3] || '').trim()
      playerPointsMap.set(pName, { pts, club })
    })
    console.log(`Loaded ${playerPointsMap.size} player points for GW1.`)
  } else {
    console.log('\n[2/5] Checking "Comparison_Dashboard" Verification Gate for GW' + targetGw + '...')
    const dashRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Comparison_Dashboard!A2:I',
    })
    const dashRows = dashRes.data.values || []

    // Check for any unapproved players (missing final_approved_pts in Column H)
    const pendingRows = dashRows.filter((r) => {
      const approved = String(r[7] || '').trim()
      return approved === ''
    })

    if (pendingRows.length > 0) {
      console.warn(`\n⚠️ SCORING ENGINE PAUSED: Found ${pendingRows.length} player(s) awaiting verification in Comparison_Dashboard!`)
      pendingRows.forEach((u) => console.warn(`  • [${u[0]}] ${u[1]}: SofaScore=${u[4] || '-'}, API-Football=${u[5] || '-'} (Status: ${u[6]})`))
      console.warn('\n👉 PIPELINE PAUSED: Please enter final_approved_pts in Comparison_Dashboard to update team sheets & Standings.\n')
      return { paused: true, pendingCount: pendingRows.length }
    }

    // Load verified player points
    dashRows.forEach((r) => {
      const teamName = String(r[0] || '').trim()
      const playerName = String(r[1] || '').trim()
      const club = String(r[2] || '').trim()
      const approvedPts = Number(r[7] || 0)

      const key = `${teamName}_${playerName}`.toLowerCase()
      playerPointsMap.set(key, { pts: approvedPts, club })
      playerPointsMap.set(normalizeName(playerName), { pts: approvedPts, club })
    })
  }

  // Load detailed player match events (goals, assists, CS) from both staging tabs
  const playerStatsDetailMap = new Map()

  // ────────────────────────────────────────────────────────────────────
  // FIXTURE LOADING (must happen BEFORE staging aggregation so the per-match
  // home stat counters can be populated — fixes Raphinha Camp Nou bonus, etc.)
  // ────────────────────────────────────────────────────────────────────
  const fixtureRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A2:J',
  })
  const fixtureRowsEarly = (fixtureRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))

  // Map: match_id -> { homeClub (normalized), awayClub (normalized), status }
  // Also carries the canonical `fixtures.match_id` used by the browser (see
  // supabaseSyncService: `sofaId || afId || gw_home_away`) so per-fixture
  // player rows can be joined to the client's fixture list by id.
  const matchInfoById = new Map()
  const homeClubsAtHome = new Set()

  const TERMINAL_FIXTURE_STATUSES = new Set([
    'FINISHED', 'POSTPONED', 'CANCELLED', 'CANCELED',
    'ABANDONED', 'AWARDED', 'VOID', 'SUSPENDED',
  ])

  const canonClubKey = (raw) => {
    const name = String(raw || '').trim()
    if (!name) return ''
    const cleaned = cleanClubName(name) || name
    return normalizeName(getCanonicalClubName(cleaned) || cleaned)
  }

  const clubGwFixtures = new Map() // canonKey -> { total, finished, pending }

  const addClubFixture = (rawClub, rawStatus) => {
    const key = canonClubKey(rawClub)
    if (!key) return
    const status = String(rawStatus || '').trim().toUpperCase()
    const entry = clubGwFixtures.get(key) || { total: 0, finished: 0, pending: 0 }
    entry.total += 1
    if (status === 'FINISHED') entry.finished += 1
    if (!TERMINAL_FIXTURE_STATUSES.has(status)) entry.pending += 1
    clubGwFixtures.set(key, entry)
  }

  fixtureRowsEarly.forEach((f) => {
    const fHomeRaw = String(f[3] || '').trim()
    const fAwayRaw = String(f[4] || '').trim()
    const fSofaId = String(f[5] || '').trim()
    const fAfId = String(f[6] || '').trim()
    const fStatus = String(f[7] || '').trim().toUpperCase()
    const fHomeNorm = normalizeName(fHomeRaw)
    const fAwayNorm = normalizeName(fAwayRaw)
    const fixture = {
      home: fHomeNorm,
      away: fAwayNorm,
      homeRaw: fHomeRaw,
      awayRaw: fAwayRaw,
      status: fStatus,
      fixtureId: fSofaId || fAfId || `${targetGw}_${fHomeRaw}_${fAwayRaw}`,
      homeScore: f[8] !== undefined && f[8] !== '' ? Number(f[8]) : null,
      awayScore: f[9] !== undefined && f[9] !== '' ? Number(f[9]) : null,
    }
    if (fSofaId) matchInfoById.set(`sofa:${fSofaId}`, fixture)
    if (fAfId) matchInfoById.set(`af:${fAfId}`, fixture)

    if (fHomeNorm) homeClubsAtHome.add(fHomeNorm)
    addClubFixture(fHomeRaw, fStatus)
    addClubFixture(fAwayRaw, fStatus)
  })

  // Guarded club key resolver (exact canonical first, unambiguous fuzzy fallback)
  const resolveClubKey = (rawClub) => {
    const key = canonClubKey(rawClub)
    if (!key) return { key: '', ambiguous: false }
    if (clubGwFixtures.has(key)) return { key, ambiguous: false }

    const matches = [...clubGwFixtures.keys()].filter((k) => isSameClub(k, key))
    if (matches.length === 1) return { key: matches[0], ambiguous: false }
    if (matches.length > 1) return { key: '', ambiguous: true }
    return { key: '', ambiguous: false }
  }

  // DGW / BGW / Postponed-aware predicate: check if club has any pending matches
  const clubHasPendingFixture = (rawClub, playerName) => {
    if (!String(rawClub || '').trim()) {
      console.warn(`[Sub] Unresolved club for ${playerName}; treating as unfinished.`)
      return true
    }

    const { key, ambiguous } = resolveClubKey(rawClub)
    if (ambiguous) {
      console.warn(`[Sub] Ambiguous club "${rawClub}" for ${playerName}; treating as unfinished.`)
      return true
    }
    if (!key) {
      // Known club with no fixture this GW => Blank Gameweek => nothing pending.
      console.warn(`[Sub] No GW fixture for ${playerName} (${rawClub}); treating as blank GW.`)
      return false
    }
    return (clubGwFixtures.get(key)?.pending || 0) > 0
  }

  // ────────────────────────────────────────────────────────────────────
  // CANONICAL NAME RESOLVER (uses Player_ID_Mappings as the source of truth)
  // ────────────────────────────────────────────────────────────────────
  // Architecture:
  //   - Lineup has a short fantasy name ("Gabriel", "Kylian Mbappé", etc.)
  //   - Player_ID_Mappings is the canonical registry: short name → {canonical,
  //     club, sofaId, apiId}. It's the SAME name across all 16 teams, so no
  //     cross-team collision.
  //   - Comparison_Dashboard, SofaScore_Staging and API_Football_Staging may
  //     use the FULL name ("Gabriel Magalhães") or a slightly different
  //     spelling. The mapping's canonical_name is the bridge.
  //
  // resolveCanonical(lineupName) returns:
  //   { canonical: 'Gabriel Magalhães', club: 'Arsenal FC', sofaId, apiId,
  //     rawName: 'Gabriel' }
  // The 'canonical' field is the name to use when looking up staging rows.
  function resolveCanonical(lineupName) {
    const norm = normalizeName(lineupName)
    if (!norm) return { canonical: lineupName, club: '', rawName: lineupName }
    const m = canonicalNameByNorm.get(norm)
    if (m) return { ...m, rawName: lineupName }
    return { canonical: lineupName, club: '', rawName: lineupName }
  }

  // Helper: lookup player in a Map keyed by either "team_player" (composite)
  // or normalized name. The lookup is keyed on the canonical name from the
  // mapping (so "Gabriel" can find a dashboard row keyed on "Gabriel
  // Magalhães"). Composite keys are team-scoped to avoid cross-team collisions.
  // Plain normalized-name keys can be ambiguous across teams (e.g. "pedro porro"
  // vs "joao pedro") so we only fuzzy-match TEAM-SCOPED keys (those with "_").
  function lookupPlayerInMap(map, rawName, teamName) {
    if (!map || !rawName) return undefined
    const canon = resolveCanonical(rawName)
    const candidates = [normalizeName(rawName), normalizeName(canon.canonical)]
    // 1) Team-scoped composite key for each candidate
    if (teamName) {
      const t = teamName.toLowerCase()
      for (const c of candidates) {
        const k = `${t}_${c}`
        if (map.has(k)) return map.get(k)
      }
    }
    // 2) Plain normalized-name key — only use if NO team name was supplied
    //    (otherwise plain keys are ambiguous and may collide across teams)
    if (!teamName) {
      for (const c of candidates) {
        if (map.has(c)) return map.get(c)
      }
    }
    // 3) Fuzzy match across TEAM-SCOPED keys only, restricted to this team.
    //    (fixes cases like "Javi Rueda" → "Javier Rueda", "Gabriel" → "Gabriel Magalhães").
    //    NEVER fuzzy-match against plain (non-team-scoped) keys because they
    //    can collide: e.g., Pedro Porro (Aguilas) wrongly matched to João Pedro
    //    (Aztec Blinders) with 0.88 similarity.
    const normTeam = teamName ? teamName.toLowerCase() : null
    let best = undefined
    let bestScore = 0
    for (const [key, val] of map.entries()) {
      let keyPlayer, candidateTeam = null
      if (key.includes('_')) {
        const parts = key.split('_')
        candidateTeam = parts[0]
        keyPlayer = parts.slice(1).join('_')
      } else {
        continue // Skip plain keys — they're team-ambiguous
      }
      if (normTeam && candidateTeam && candidateTeam !== normTeam) continue
      if (keyPlayer === candidates[0] || keyPlayer === candidates[1]) return val
      // Fuzzy match against ALL candidates (raw name AND canonical name)
      let sim = 0
      for (const c of candidates) {
        const s = getSimilarityScore(c, keyPlayer)
        if (s > sim) sim = s
      }
      if (sim > bestScore && sim >= SIMILARITY_THRESHOLDS.DASHBOARD_FUZZY) { best = val; bestScore = sim }
    }
    return best
  }

  // ── Per-fixture records for `match_breakdown` (uiux-improvements.md §3.1) ──
  // Staging is already one row per (player, match); the aggregate maps below
  // flatten them for scoring. These helpers keep a side-channel copy so a
  // Double Gameweek can be shown fixture-by-fixture instead of guessing a
  // split from a single aggregate row.
  function buildMatchRec(source, matchId, club, ev) {
    const fixture = matchInfoById.get(`sofa:${matchId}`) || matchInfoById.get(`af:${matchId}`)
    if (!fixture || !fixture.fixtureId) return null
    const venue = matchHomeClub(club, fixture.homeRaw)
      ? 'home'
      : matchHomeClub(club, fixture.awayRaw)
        ? 'away'
        : null
    return {
      source,
      fixtureId: fixture.fixtureId,
      venue,
      opponentName: venue === 'home' ? fixture.awayRaw : venue === 'away' ? fixture.homeRaw : null,
      homeScore: fixture.homeScore ?? null,
      awayScore: fixture.awayScore ?? null,
      status: fixture.status || 'UNKNOWN',
      minutes: ev.minutes,
      goals: ev.goals,
      assists: ev.assists,
      isCS: ev.isCS,
      penMiss: ev.penMiss,
      penSave: ev.penSave,
      yellow: ev.yellow,
      red: ev.red,
      ownGoals: ev.ownGoals,
      pts: ev.pts,
    }
  }

  function pushMatchRec(map, pName, rec) {
    const entry = map.get(pName)
    if (!rec || !entry) return
    if (!Array.isArray(entry.matches)) entry.matches = []
    if (entry.matches.some((m) => m.fixtureId === rec.fixtureId && m.source === rec.source)) return
    entry.matches.push(rec)
  }

  // 1. SofaScore Staging Events
  const sofaStatsMap = new Map()
  try {
    const sofaRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SofaScore_Staging!A2:N',
    })
    ;(sofaRes.data.values || []).forEach((r) => {
      if (String(r[0] || '').trim() === String(targetGw)) {
        const pName = normalizeName(String(r[2] || '').trim())
        const matchId = String(r[1] || '').trim()
        const minutes = Number(r[4] || 0)
        const goals = Number(r[5] || 0)
        const assists = Number(r[6] || 0)
        const isCS = ['TRUE', 'YES', '1', 'Y'].includes(String(r[7] || '').toUpperCase().trim())
        const penMiss = Number(r[8] || 0)
        const penSave = Number(r[9] || 0)
        const yellow = Number(r[10] || 0)
        const red = Number(r[11] || 0)
        const ownGoals = Number(r[12] || 0)
        const club = String(r[3] || '').trim()
        const pts = Number(r[13] || 0)
        // Determine if this player's club was at home in this match.
        // Use matchHomeClub (which handles aliases like "Arsenal" vs "Arsenal FC",
        // "Barcelona" vs "FC Barcelona", "Man United" vs "Manchester United")
        // instead of strict normalized equality, so the home bonus tracks
        // correctly when staging club names differ from Fixture_Staging.
        const fixture = matchInfoById.get(`sofa:${matchId}`)
        const isHomeMatch = fixture && matchHomeClub(club, fixture.homeRaw)
        const homeGoals = isHomeMatch ? goals : 0
        const homeAssists = isHomeMatch ? assists : 0
        const homeCS = isHomeMatch && isCS
        const homePenSave = isHomeMatch ? penSave : 0
        const homeYellow = isHomeMatch ? yellow : 0
        const homeRed = isHomeMatch ? red : 0
        const homeOwnGoals = isHomeMatch ? ownGoals : 0
        const homePenMiss = isHomeMatch ? penMiss : 0

        const sofaMatchRec = buildMatchRec('sofa', matchId, club, {
          minutes, goals, assists, isCS, penMiss, penSave, yellow, red, ownGoals, pts,
        })

        if (sofaStatsMap.has(pName)) {
          const existing = sofaStatsMap.get(pName)
          existing.minutes += minutes
          existing.goals += goals
          existing.assists += assists
          existing.isCS = existing.isCS && isCS
          existing.penMiss += penMiss
          existing.penSave += penSave
          existing.yellow += yellow
          existing.red += red
          existing.ownGoals += ownGoals
          existing.pts += pts
          existing.homeGoals += homeGoals
          existing.homeAssists += homeAssists
          // accumulate, not collapse — any single home-CS in any match counts toward the home bonus
          existing.homeCS = existing.homeCS || homeCS
          existing.homePenSave += homePenSave
          existing.homeYellow += homeYellow
          existing.homeRed += homeRed
          existing.homeOwnGoals += homeOwnGoals
          existing.homePenMiss += homePenMiss
        } else {
          sofaStatsMap.set(pName, {
            minutes, goals, assists, isCS, penMiss, penSave, yellow, red, ownGoals, club, pts,
            homeGoals, homeAssists, homeCS, homePenSave, homeYellow, homeRed, homeOwnGoals, homePenMiss
          })
        }
        pushMatchRec(sofaStatsMap, pName, sofaMatchRec)
      }
    })
  } catch (e) {
    console.log('SofaScore_Staging ERROR: ' + e.message)
  }

  // 2. API-Football Staging Events
  const afStatsMap = new Map()
  try {
    const afRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'API_Football_Staging!A2:N',
    })
    ;(afRes.data.values || []).forEach((r) => {
      if (String(r[0] || '').trim() === String(targetGw)) {
        const pName = normalizeName(String(r[2] || '').trim())
        const matchId = String(r[1] || '').trim()
        const minutes = Number(r[4] || 0)
        const goals = Number(r[5] || 0)
        const assists = Number(r[6] || 0)
        const isCS = ['TRUE', 'YES', '1', 'Y'].includes(String(r[7] || '').toUpperCase().trim())
        const penMiss = Number(r[8] || 0)
        const penSave = Number(r[9] || 0)
        const yellow = Number(r[10] || 0)
        const red = Number(r[11] || 0)
        const ownGoals = Number(r[12] || 0)
        const club = String(r[3] || '').trim()
        const pts = Number(r[13] || 0)
        const fixture = matchInfoById.get(`af:${matchId}`)
        const isHomeMatch = fixture && matchHomeClub(club, fixture.homeRaw)
        const homeGoals = isHomeMatch ? goals : 0
        const homeAssists = isHomeMatch ? assists : 0
        const homeCS = isHomeMatch && isCS
        const homePenSave = isHomeMatch ? penSave : 0
        const homeYellow = isHomeMatch ? yellow : 0
        const homeRed = isHomeMatch ? red : 0
        const homeOwnGoals = isHomeMatch ? ownGoals : 0
        const homePenMiss = isHomeMatch ? penMiss : 0

        const afMatchRec = buildMatchRec('af', matchId, club, {
          minutes, goals, assists, isCS, penMiss, penSave, yellow, red, ownGoals, pts,
        })

        if (afStatsMap.has(pName)) {
          const existing = afStatsMap.get(pName)
          existing.minutes += minutes
          existing.goals += goals
          existing.assists += assists
          existing.isCS = existing.isCS && isCS
          existing.penMiss += penMiss
          existing.penSave += penSave
          existing.yellow += yellow
          existing.red += red
          existing.ownGoals += ownGoals
          existing.pts += pts
          existing.homeGoals += homeGoals
          existing.homeAssists += homeAssists
          // accumulate, not collapse — any single home-CS in any match counts toward the home bonus
          existing.homeCS = existing.homeCS || homeCS
          existing.homePenSave += homePenSave
          existing.homeYellow += homeYellow
          existing.homeRed += homeRed
          existing.homeOwnGoals += homeOwnGoals
          existing.homePenMiss += homePenMiss
        } else {
          afStatsMap.set(pName, {
            minutes, goals, assists, isCS, penMiss, penSave, yellow, red, ownGoals, club, pts,
            homeGoals, homeAssists, homeCS, homePenSave, homeYellow, homeRed, homeOwnGoals, homePenMiss
          })
        }
        pushMatchRec(afStatsMap, pName, afMatchRec)
      }
    })
  } catch (e) {
    console.log('No API_Football_Staging data found.')
  }

  // 3. Resolve event stats based on user-approved points in Comparison_Dashboard
  for (const [key, pData] of playerPointsMap.entries()) {
    const rawName = key.includes('_') ? key.split('_')[1] : key
    const norm = normalizeName(rawName)
    // Staging tabs are keyed by the FULL API player name (e.g. "gabriel magalhaes")
    // while lineups use the short roster name (e.g. "gabriel"). Try
    // several lookups:
    //   1) exact normalized match
    //   2) canonical name from Player_ID_Mappings
    //   3) fuzzy match across the staging map, restricted to same club
    let sofaDetail = sofaStatsMap.get(norm)
    let afDetail = afStatsMap.get(norm)
    if (!sofaDetail && !afDetail) {
      const canon = resolveCanonical(rawName)
      const canonNorm = normalizeName(canon.canonical)
      if (canonNorm !== norm) {
        sofaDetail = sofaStatsMap.get(canonNorm)
        afDetail = afStatsMap.get(canonNorm)
      }
    }
    if (!sofaDetail && !afDetail) {
      // Fuzzy fallback: look for a staging row whose name token-matches the
      // lineup name AND whose club matches the player's club (using
      // matchHomeClub which handles 'Arsenal' vs 'Arsenal FC', 'Barcelona' vs
      // 'FC Barcelona', etc.). E.g. lineup "Gabriel" (Arsenal FC) matches
      // staging "Gabriel Magalhães" (arsenal).
      const targetClub = pData.club || ''
      for (const [sName, sData] of sofaStatsMap.entries()) {
        if (targetClub && sData.club && !matchHomeClub(targetClub, sData.club)) continue
        if (sName.includes(norm) || norm.includes(sName)) {
          sofaDetail = sData
          break
        }
        if (getSimilarityScore(norm, sName) >= SIMILARITY_THRESHOLDS.DASHBOARD_FUZZY) {
          sofaDetail = sData
          break
        }
      }
      for (const [sName, sData] of afStatsMap.entries()) {
        if (targetClub && sData.club && !matchHomeClub(targetClub, sData.club)) continue
        if (sName.includes(norm) || norm.includes(sName)) {
          afDetail = sData
          break
        }
        if (getSimilarityScore(norm, sName) >= SIMILARITY_THRESHOLDS.DASHBOARD_FUZZY) {
          afDetail = sData
          break
        }
      }
    }

    // Choose event details from the source that matches the approved points AND has
    // the most accurate home stat tracking. When club names differ slightly
    // between sources (e.g., AF's "barcelona" vs Sofa's "fc barcelona"), the
    // home bonus gets lost on one side. Prefer the source with the higher
    // homeGoals+homeAssists total so the captain's home bonus counts.
    let chosenDetail = null
    if (sofaDetail && afDetail) {
      const sofaGap = Math.abs((sofaDetail.pts || 0) - pData.pts)
      const afGap = Math.abs((afDetail.pts || 0) - pData.pts)
      const sofaHome = (sofaDetail.homeGoals || 0) + (sofaDetail.homeAssists || 0) + (sofaDetail.homeCS ? 1 : 0)
      const afHome = (afDetail.homeGoals || 0) + (afDetail.homeAssists || 0) + (afDetail.homeCS ? 1 : 0)

      // Priority 1: exact pts match — admin agrees with source → trust its home tracking
      if (sofaGap === 0 && afGap === 0) {
        chosenDetail = sofaHome >= afHome ? sofaDetail : afDetail
      } else if (sofaGap === 0) {
        chosenDetail = sofaDetail
      } else if (afGap === 0) {
        chosenDetail = afDetail
      }
      // Priority 2: closest match within 1 pt — admin likely was looking at this source
      else if (Math.min(sofaGap, afGap) <= 1) {
        chosenDetail = sofaGap <= afGap ? sofaDetail : afDetail
      }
      // Priority 3: full manual override — pick source with better home tracking
      else {
        chosenDetail = sofaHome >= afHome ? sofaDetail : afDetail
      }
    } else if (afDetail && (pData.pts === afDetail.pts || !sofaDetail)) {
      chosenDetail = afDetail
    } else if (sofaDetail && (pData.pts === sofaDetail.pts || !afDetail)) {
      chosenDetail = sofaDetail
    } else {
      chosenDetail = sofaDetail || afDetail || {
        minutes: 0, goals: 0, assists: 0, isCS: false, penMiss: 0, penSave: 0,
        yellow: 0, red: 0, ownGoals: 0, club: pData.club, pts: 0, matches: [],
        homeGoals: 0, homeAssists: 0, homeCS: false, homePenSave: 0,
        homeYellow: 0, homeRed: 0, homeOwnGoals: 0, homePenMiss: 0
      }
    }

    playerStatsDetailMap.set(key, chosenDetail)
    playerStatsDetailMap.set(norm, chosenDetail)
  }

  // Load Fixture_Staging FIRST — we need the match_id → home_club map
  // BEFORE aggregating staging rows, so we can track per-match home stats
  // (goals, assists, CS) for the home bonus.
  // NOTE: fixtureRes / matchInfoById / homeClubsAtHome / clubGwFixtures are
  // already loaded above (before the staging row aggregation) — see FIXTURE
  // LOADING block. Only the stadium sync happens here.
  const { stadiumPointsMap, teamHomeClubMap } = await syncStadiumPoints(targetGw)

  // Load existing penalties for this targetGw from each team's sheet tab (Row 18 / PENALTY row)
  const existingPenaltiesMap = new Map()
  try {
    const allTabNames = Array.from(teamRosters.keys()).map((t) => resolveExactTabName(t)).filter(Boolean)
    const penaltyRanges = allTabNames.map((tab) => `'${tab}'!${getGwColumnRange(targetGw)}`)
    const penaltyRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges: penaltyRanges,
    })
    for (let i = 0; i < allTabNames.length; i++) {
      const tab = allTabNames[i]
      const rows = penaltyRes.data.valueRanges[i]?.values || []
      let penalty = 0
      for (const r of rows) {
        const col0 = String(r[0] || '').trim().toLowerCase()
        const col1 = String(r[1] || '').trim().toUpperCase()
        if (col1 === 'PENALTY' || col0.includes('penalty') || col0.includes('deduction')) {
          const val = Number(r[5] || 0)
          if (!isNaN(val)) penalty = val
        }
      }
      existingPenaltiesMap.set(tab.toLowerCase(), penalty)
    }
  } catch (err) {
    console.warn('[Penalty Detection] Could not load prior penalty rows:', err.message)
  }

  // 3. Process Each Team's Scores (Captain 2x, Vice, Auto-Subs, Stadium Bonus)
  console.log('\n[3/5] Calculating team totals with Captain 2x, Auto-Subs & Stadium Bonuses...')
  const teamResults = new Map()

  for (const [teamName, players] of teamRosters.entries()) {
    const stadiumInfo = TEAM_STADIUM_MAP[teamName] || { stadium: '', homeClub: '' }
    const stadiumPts = stadiumPointsMap.get((stadiumInfo.stadium || '').toLowerCase()) || 0
    const ownedHomeClub = teamHomeClubMap.get(teamName) || stadiumInfo.homeClub || ''
    const teamStadiumBonus = stadiumPts
    const stadiumResultLabel = stadiumPts === 5 ? 'Home Win (+5)' : stadiumPts === 2 ? 'Home Draw (+2)' : 'No Home Win (0)'

    let starters = players.filter((p) => p.role === 'STARTER')
    let bench = players.filter((p) => p.role.startsWith('BENCH')).sort((a, b) => a.role.localeCompare(b.role))

    // Find Captain and Vice
    let captain = players.find((p) => p.is_captain) || starters[0]
    let vice = players.find((p) => p.is_vice) || starters[1]

    // Canonical name resolution via Player_ID_Mappings.
    // captainDetail.club is critical for the matchFinished check; we need it
    // even if the player has zero staging rows. Use the mapping's club as a
    // fallback when neither dashboard nor staging rows are present.
    const captainCanon = resolveCanonical(captain.player_name)
    const captainPData = lookupPlayerInMap(playerPointsMap, captain.player_name, teamName) || { pts: 0, club: captainCanon.club }
    const captainDetail = lookupPlayerInMap(playerStatsDetailMap, captain.player_name, teamName) || { minutes: 0, club: captainPData.club }
    // "Played" check: trust the dashboard's final_approved_pts (it's the
    // manually verified score), with staging minutes/stats as fallback.
    const captainPlayed = (captainPData.pts || 0) > 0
      || captainDetail.minutes > 0
      || (captainDetail.goals || 0) > 0
      || (captainDetail.assists || 0) > 0
      || (captainDetail.isCS || false)
      || (captainDetail.yellow || 0) > 0
      || (captainDetail.red || 0) > 0
      || (captainDetail.ownGoals || 0) > 0
      || (captainDetail.penMiss || 0) > 0
      || (captainDetail.penSave || 0) > 0
    const capClub = captainDetail.club || captainPData.club || captainCanon.club || ''
    const captainMatchFinished = !clubHasPendingFixture(capClub, captain.player_name)

    // Smart Captain 2x Resolution (D93): Promote vice-captain ONLY if vice actually played
    let effectiveCaptainName = captain.player_name
    const viceCanon = resolveCanonical(vice.player_name)
    const vicePData = lookupPlayerInMap(playerPointsMap, vice.player_name, teamName) || { pts: 0, club: viceCanon.club }
    const viceDetail = lookupPlayerInMap(playerStatsDetailMap, vice.player_name, teamName) || { minutes: 0, club: vicePData.club }
    const vicePlayed = (vicePData.pts || 0) > 0
      || viceDetail.minutes > 0
      || (viceDetail.goals || 0) > 0
      || (viceDetail.assists || 0) > 0
      || (viceDetail.isCS || false)
      || (viceDetail.yellow || 0) > 0
      || (viceDetail.red || 0) > 0
      || (viceDetail.ownGoals || 0) > 0
      || (viceDetail.penMiss || 0) > 0
      || (viceDetail.penSave || 0) > 0
    if (!captainPlayed && captainMatchFinished && vicePlayed) {
      // Captain was benched in a finished match, vice played -> Promote Vice-Captain!
      effectiveCaptainName = vice.player_name
    }

    // Auto-Substitution Engine (Fixes HIGH-02):
    // Identify unplayed starters in finished matches
    const activeStarters = []
    const subbedOutStarters = []

    for (const starter of starters) {
      const canon = resolveCanonical(starter.player_name)
      const pData = lookupPlayerInMap(playerPointsMap, starter.player_name, teamName) || { pts: 0, club: canon.club }
      const detail = lookupPlayerInMap(playerStatsDetailMap, starter.player_name, teamName) || { minutes: 0, club: pData.club }
      // "Played" check:
      //   - If the player has dashboard final_approved_pts > 0, trust it
      //     (the user manually approved the score, so the player played).
      //   - Otherwise, fall back to staging minutes/stats.
      // This avoids false-negative sub-outs for players whose staging rows
      // are missing but the dashboard has them verified.
      const played = (pData.pts || 0) > 0
        || detail.minutes > 0
        || (detail.goals || 0) > 0
        || (detail.assists || 0) > 0
        || (detail.isCS || false)
        || (detail.yellow || 0) > 0
        || (detail.red || 0) > 0
        || (detail.ownGoals || 0) > 0
        || (detail.penMiss || 0) > 0
        || (detail.penSave || 0) > 0
      const pClub = detail.club || pData.club || canon.club || ''
      const matchFinished = !clubHasPendingFixture(pClub, starter.player_name)

      if (!played && matchFinished) {
        subbedOutStarters.push(starter)
      } else {
        activeStarters.push(starter)
      }
    }

    // Auto-Substitution Engine: ONLY 1 sub allowed per GW
    // Substitution rules (per user spec):
    //   - Position minimums: at least 1 GK, 3 DEF, 2 MID, 1 FWD must play.
    //   - If a minimum is BROKEN (e.g., only 2 DEFs played, minimum is 3):
    //     - The sub fires for the BROKEN position, with priority GK > DEF > MID > FWD.
    //     - The first short position is addressed first.
    //     - Within the short position, the bench is iterated in BENCH_1, BENCH_2 order.
    //     - The bench player who played is subbed in for the first unplayed starter in the
    //       same position.
    //     - Only the FIRST sub fires (1 sub per GW).
    //   - If NO minimum is broken (e.g., 3 DEFs, 2 MIDs, 1 FWD, 1 GK all played, but
    //     the user submitted 4-4-2 and 1 of the 4 DEFs didn't play):
    //     - The sub fires in BENCH ORDER (BENCH_1 first, then BENCH_2, etc.).
    //     - The bench player must match the unplayed starter's position.
    //   - If no eligible bench player exists, 0 pts for that slot, no sub.
    //   - Example 1: 4-4-2, 0 GK played, 3 DEFs played. GK is short. BENCH_1=GK fires sub.
    //   - Example 2: 4-4-2, 1 GK played, 3 DEFs played, 1 DEF out. DEF is NOT short
    //     (3 = 3 minimum). The sub fires in BENCH_1 order. BENCH_1=DEF sub fires.
    //   - Example 3: 4-4-2, 1 GK played, 2 DEFs played. DEF is short. BENCH_1=DEF sub fires
    //     (if played). If BENCH_1 is a MID, BENCH_2=DEF is checked. Etc.
    const activeBench = []
    const subbedInBench = []
    const replacedStarters = []

    const getPosCategory = (pos) => {
      const p = String(pos || '').toUpperCase()
      if (p === 'GK' || p === 'GKP') return 'GK'
      if (p === 'DEF' || p === 'D') return 'DEF'
      if (p === 'MID' || p === 'M') return 'MID'
      if (p === 'FWD' || p === 'F' || p === 'FOR') return 'FWD'
      return 'MID'
    }

    // Determine which position minimums are broken.
    // Count played players per position across activeStarters (already played) and bench who played.
    const POSITION_MINIMUMS = { GK: 1, DEF: 3, MID: 2, FWD: 1 }
    const POSITION_PRIORITY_ORDER = ['GK', 'DEF', 'MID', 'FWD']

    // Pre-compute which bench players actually played (got on the pitch or
    // had a real stat event, OR have a verified dashboard pts).
    const benchPlayedSet = new Set()
    for (const bPlayer of bench) {
      const bCanon = resolveCanonical(bPlayer.player_name)
      const bPData = lookupPlayerInMap(playerPointsMap, bPlayer.player_name, teamName) || { pts: 0, club: bCanon.club }
      const bDetail = lookupPlayerInMap(playerStatsDetailMap, bPlayer.player_name, teamName) || { minutes: 0, club: bPData.club }
      const bPlayed = (bPData.pts || 0) > 0
        || bDetail.minutes > 0
        || (bDetail.goals || 0) > 0
        || (bDetail.assists || 0) > 0
        || (bDetail.isCS || false)
        || (bDetail.yellow || 0) > 0
        || (bDetail.red || 0) > 0
        || (bDetail.ownGoals || 0) > 0
        || (bDetail.penMiss || 0) > 0
        || (bDetail.penSave || 0) > 0
      if (bPlayed) benchPlayedSet.add(bPlayer.player_name)
    }

    // Count players who played, per position
    const playedByPos = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const p of activeStarters) {
      const pos = getPosCategory(p.position)
      playedByPos[pos] = (playedByPos[pos] || 0) + 1
    }

    // Determine the first SHORT position (in priority order)
    // Short = activeStarters count + eligible bench who played < minimum
    let targetShortPos = null
    for (const pos of POSITION_PRIORITY_ORDER) {
      const min = POSITION_MINIMUMS[pos]
      // Check if any bench player in this position who played could fill the gap
      const hasBenchCandidate = bench.some(b =>
        benchPlayedSet.has(b.player_name) && getPosCategory(b.position) === pos
      )
      const active = playedByPos[pos] || 0
      if (active < min && hasBenchCandidate) {
        targetShortPos = pos
        break
      }
    }

    // Build the bench iteration order:
    //   - If a position is short, process that position's bench first (in BENCH_1 order).
    //     Then continue with remaining positions in priority order, in BENCH_1 order.
    //   - If no position is short, process bench in original BENCH_1, BENCH_2 order.
    let benchIter
    if (targetShortPos) {
      // Position-priority order: short position first, then other positions in priority order.
      // Within each position, BENCH_1, BENCH_2, etc.
      const order = [targetShortPos, ...POSITION_PRIORITY_ORDER.filter(p => p !== targetShortPos)]
      benchIter = []
      for (const pos of order) {
        const playersInPos = bench.filter(b => getPosCategory(b.position) === pos)
        benchIter.push(...playersInPos)
      }
    } else {
      // No position is short — use original bench order (BENCH_1 first)
      benchIter = [...bench]
    }

    for (const bPlayer of benchIter) {
      // Only the first qualifying bench player may sub in
      if (subbedInBench.length >= 1) {
        activeBench.push(bPlayer)
        continue
      }

      const bCanon = resolveCanonical(bPlayer.player_name)
      const bPData = lookupPlayerInMap(playerPointsMap, bPlayer.player_name, teamName) || { pts: 0, club: bCanon.club }
      const bDetail = lookupPlayerInMap(playerStatsDetailMap, bPlayer.player_name, teamName) || { minutes: 0, club: bPData.club }
      // Same "actually played" check (trusts dashboard pts, with staging fallback)
      const bPlayed = (bPData.pts || 0) > 0
        || bDetail.minutes > 0
        || (bDetail.goals || 0) > 0
        || (bDetail.assists || 0) > 0
        || (bDetail.isCS || false)
        || (bDetail.yellow || 0) > 0
        || (bDetail.red || 0) > 0
        || (bDetail.ownGoals || 0) > 0
        || (bDetail.penMiss || 0) > 0
        || (bDetail.penSave || 0) > 0

      if (!bPlayed || subbedOutStarters.length === 0) {
        activeBench.push(bPlayer)
        continue
      }

      const bPosCat = getPosCategory(bPlayer.position)
      // Auto-substitution rule (matches applySubsForGameweek.js):
      //   - For each bench slot in BENCH_1 → 4 order, IF the bench player played:
      //       1. GKP bench can ONLY sub for an unplayed GKP starter (GKP is its
      //          own group, never crosses over to DEF/MID/FWD).
      //       2. DEF/MID/FWD bench can sub for any unplayed starter, but the
      //          resulting effective XI must still meet all position minimums
      //          (GK≥1, DEF≥3, MID≥2, FWD≥1).
      //   - If the bench player can't sub in (wrong group, or would break a min),
      //     skip and try the next bench slot.
      //   - First qualifying bench slot fires, then stop (1 sub per GW).
      //   - If a position is short, use the legacy same-position-match rule.
      const isOutfield = (p) => ['DEF', 'MID', 'FWD'].includes(getPosCategory(p))
      const submittedPosCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 }
      for (const s of starters) submittedPosCount[getPosCategory(s.position)]++

      const canBenchReplace = (bench, starter) => {
        // bench and starter are PLAYER OBJECTS - extract their position strings
        const cb = getPosCategory(bench.position), cs = getPosCategory(starter.position)
        // GKP is its own group
        if (cb === 'GK' || cs === 'GK') return cb === cs
        // Outfield: must keep all position minimums in the resulting XI
        const after = { ...submittedPosCount, [cs]: submittedPosCount[cs] - 1, [cb]: submittedPosCount[cb] + 1 }
        for (const pos of Object.keys(POSITION_MINIMUMS)) {
          if ((after[pos] || 0) < POSITION_MINIMUMS[pos]) return false
        }
        return isOutfield(bench.position) && isOutfield(starter.position)
      }

      let matched = false

      // Find the first unplayed starter to replace
      for (let i = 0; i < subbedOutStarters.length; i++) {
        const outStarter = subbedOutStarters[i]
        const outPosCat = getPosCategory(outStarter.position)

        if (targetShortPos) {
          // Position is short: must match exactly
          if (outPosCat !== bPosCat) continue
        } else {
          // No position short: use the canBenchReplace rule
          if (!canBenchReplace(bPlayer, outStarter)) continue
        }

        const [splicedStarter] = subbedOutStarters.splice(i, 1)
        replacedStarters.push(splicedStarter)
        subbedInBench.push(bPlayer)
        matched = true
        console.log(`[Sub] ${teamName}: ${bPlayer.player_name} (${bPosCat}) IN for ${splicedStarter.player_name} (${outPosCat})${targetShortPos ? '' : ' [no-short-pos]'}`)
        break
      }

      if (!matched) {
        activeBench.push(bPlayer)
      }
    }

    const resolvedTabEarly = resolveExactTabName(teamName) || teamName
    const rawPenaltyVal = existingPenaltiesMap.get((resolvedTabEarly || '').toLowerCase()) || existingPenaltiesMap.get(teamName.toLowerCase()) || 0
    const teamPenalty = rawPenaltyVal !== 0 ? Math.abs(rawPenaltyVal) : 0
    let totalTeamPoints = teamStadiumBonus - teamPenalty
    const scoredPlayers = []

    // Calculate Starters Points (Effective Starters + Auto-Subbed In Bench)
    const effectiveStartingXI = [...activeStarters, ...subbedInBench]

    for (const p of effectiveStartingXI) {
      const canon = resolveCanonical(p.player_name)
      const pData = lookupPlayerInMap(playerPointsMap, p.player_name, teamName) || { pts: 0, club: canon.club }
      const detail = lookupPlayerInMap(playerStatsDetailMap, p.player_name, teamName) || { minutes: 0, goals: 0, assists: 0, isCS: false, penMiss: 0, penSave: 0, yellow: 0, red: 0, ownGoals: 0, club: pData.club }
      const isEffectiveCap = p.player_name === effectiveCaptainName
      const multiplier = isEffectiveCap ? 2 : 1

      // Venue-Aware Home Player Bonus (Fixes HIGH-05 & F-09):
      // Only awarded for stats generated AT HOME in matches where the player's
      // club was the home side at the owned stadium venue. For double-gameweek
      // players, we track per-match home stats (homeGoals, homeAssists, etc.)
      // so away-match stats don't accidentally count toward the home bonus.
      let playerStadiumBonus = 0
      // F-09 home-bonus eligibility (fixed for club-name variants):
      //   The player's club must be playing AT HOME in some fixture for this GW.
      //   Previously required exact normalized-name membership in homeClubsAtHome,
      //   which failed when staging club names differ from Fixture_Staging
      //   (e.g. 'barcelona' vs 'FC Barcelona'). Use matchHomeClub against all
      //   fixture home teams as the check.
      let isClubMatchAtHome = false
      if (detail.club && ownedHomeClub) {
        for (const fix of matchInfoById.values()) {
          if (matchHomeClub(ownedHomeClub, fix.homeRaw) && matchHomeClub(fix.homeRaw, detail.club)) {
            isClubMatchAtHome = true
            break
          }
        }
      }
      if (ownedHomeClub && isClubMatchAtHome) {
        // Use the per-match home counters (default to 0 if the chosen
        // detail doesn't carry them, e.g. for the fallback empty object)
        const hg = detail.homeGoals || 0
        const ha = detail.homeAssists || 0
        const hCS = detail.homeCS || false
        const hPS = detail.homePenSave || 0
        const hR = detail.homeRed || 0
        const hOG = detail.homeOwnGoals || 0
        const hPM = detail.homePenMiss || 0
        const posStr = String(p.position || canon.pos || '').toUpperCase().trim()
        const isDefOrGk = ['GK', 'GKP', 'DEF', 'D'].includes(posStr)
        if (hg > 0) playerStadiumBonus += hg * 1
        if (ha > 0) playerStadiumBonus += ha * 1
        if (hCS && isDefOrGk) playerStadiumBonus += 1
        if (hPS > 0) playerStadiumBonus += hPS * 1
        if (hR > 0) playerStadiumBonus -= 1
        if (hOG > 0) playerStadiumBonus -= hOG * 1
        if (hPM > 0) playerStadiumBonus -= hPM * 1
      }

      // Captain 2x: the WHOLE final (base + home stadium bonus) is doubled.
      // Previously: (base * mult) + bonus, which left the home bonus at 1x for captains.
      const finalPts = (pData.pts + playerStadiumBonus) * multiplier
      totalTeamPoints += finalPts

      scoredPlayers.push({
        ...p,
        role: p.role.startsWith('BENCH') ? 'AUTO_SUB_IN' : p.role,
        base_pts: pData.pts,
        stadium_bonus: playerStadiumBonus,
        multiplier,
        final_pts: finalPts,
        minutes: detail.minutes || (pData.pts > 0 ? 90 : 0),
        // Raw event breakdown (H-12): carried through to Supabase so the
        // frontend can show per-player goals/assists/CS/cards detail.
        goals: Number(detail.goals || 0),
        assists: Number(detail.assists || 0),
        isCS: Boolean(detail.isCS),
        yellow: Number(detail.yellow || 0),
        red: Number(detail.red || 0),
        ownGoals: Number(detail.ownGoals || 0),
        penMiss: Number(detail.penMiss || 0),
        penSave: Number(detail.penSave || 0),
        played: detail.minutes > 0 || pData.pts > 0,
        isEffectiveStarter: true,
        // Itemized ledger for the player modal (uiux-improvements.md §3.1).
        // `available:false` when the items do not reconcile exactly with the
        // approved base total — the client then shows "Breakdown pending"
        // instead of a fabricated explanation. `final_pts` stays authoritative.
        points_breakdown: buildPointsBreakdown(detail, p.position, pData.pts),
        // Per-fixture split (null unless staging actually had one row per
        // fixture) — see uiux-improvements.md §3.1 DGW interaction.
        match_breakdown: buildMatchBreakdown(detail, { position: p.position, gameweek: targetGw }),
      })
    }

    // Remaining Unplayed Starters (subbed out) & Inactive Bench
    for (const p of [...replacedStarters, ...subbedOutStarters, ...activeBench]) {
      const canon = resolveCanonical(p.player_name)
      const pData = lookupPlayerInMap(playerPointsMap, p.player_name, teamName) || { pts: 0, club: canon.club }
      const detail = lookupPlayerInMap(playerStatsDetailMap, p.player_name, teamName) || { minutes: 0, goals: 0, assists: 0, isCS: false, penMiss: 0, penSave: 0, yellow: 0, red: 0, ownGoals: 0, club: pData.club }
      
      const isSubbedOut = replacedStarters.includes(p) || subbedOutStarters.includes(p)
      scoredPlayers.push({
        ...p,
        role: isSubbedOut ? 'AUTO_SUB_OUT' : p.role,
        base_pts: pData.pts,
        stadium_bonus: 0,
        multiplier: 0,
        final_pts: 0,
        minutes: detail.minutes || 0,
        // Raw event breakdown (H-12) — same fields as effective starters so
        // bench/subbed rows carry the detail too.
        goals: Number(detail.goals || 0),
        assists: Number(detail.assists || 0),
        isCS: Boolean(detail.isCS),
        yellow: Number(detail.yellow || 0),
        red: Number(detail.red || 0),
        ownGoals: Number(detail.ownGoals || 0),
        penMiss: Number(detail.penMiss || 0),
        penSave: Number(detail.penSave || 0),
        played: detail.minutes > 0 || pData.pts > 0,
        isEffectiveStarter: false,
        // Bench/subbed rows keep their real base points and events so the
        // modal can still explain them, even though final_pts is 0.
        points_breakdown: buildPointsBreakdown(detail, p.position, pData.pts),
        match_breakdown: buildMatchBreakdown(detail, { position: p.position, gameweek: targetGw }),
      })
    }

    teamResults.set(teamName, {
      team_name: teamName,
      total_points: totalTeamPoints,
      captain: captain.player_name,
      effective_captain: effectiveCaptainName,
      stadium_name: stadiumInfo.stadium,
      stadium_bonus: teamStadiumBonus,
      stadium_label: stadiumResultLabel,
      penalty: teamPenalty,
      players: scoredPlayers,
    })

    console.log(`- ${teamName}: GW${targetGw} Total = ${totalTeamPoints} pts (Captain: ${effectiveCaptainName}, Stadium: ${stadiumInfo.stadium} [${teamStadiumBonus} pts]${teamPenalty > 0 ? `, Penalty: -${teamPenalty} pts` : ''})`)
  }

  // 4. Update Each Team's Tab & Generate Standings using Single Atomic Batch Write
  console.log('\n[4/5] Preparing atomic batch update for all 16 team sheets & Standings tab...')

  // Fetch all sheet tabs in the spreadsheet
  const metaRes = await sheets.spreadsheets.get({ spreadsheetId })
  const existingSheetTitles = (metaRes.data.sheets || []).map((s) => s.properties.title)

  // Ensure 'Standings', 'Standings_Backup', and 'Lineup_Fingerprints' tabs exist
  const tabsToEnsure = ['Standings', 'Standings_Backup', 'Lineup_Fingerprints']
  const missingTabs = tabsToEnsure.filter(t => !existingSheetTitles.includes(t))
  if (missingTabs.length > 0) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missingTabs.map(title => ({ addSheet: { properties: { title } } })),
        },
      })
    } catch (e) {}
  }

  // D49: Load Lineup_Fingerprints to detect lineup changes since last publish
  const lineupFingerprints = new Map()
  try {
    const fpRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Lineup_Fingerprints!A2:D20',
    })
    for (const r of (fpRes.data.values || [])) {
      const key = `${String(r[0] || '').trim()}_${String(r[1] || '').trim()}`
      lineupFingerprints.set(key, { fingerprint: String(r[2] || '').trim(), publishedAt: String(r[3] || '').trim() })
    }
  } catch (e) {}

  // D49: Compute fingerprint for each team's current lineup
  const currentFingerprints = new Map()
  for (const [tName, players] of teamRosters.entries()) {
    const sortedPlayers = [...players].sort((a, b) => a.player_name.localeCompare(b.player_name))
    const fpInput = sortedPlayers.map(p => `${p.player_name}|${p.role}|${p.position}`).join(',')
    const fingerprint = simpleHash(fpInput)
    currentFingerprints.set(tName, fingerprint)
  }

  // Load existing Standings to accumulate multi-gameweek season totals (Fixes CRIT-05, CRIT-06)
  let existingStandingsRows = []
  try {
    const stRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Standings!A2:AO18',
    })
    existingStandingsRows = stRes.data.values || []
  } catch (e) {}

  const seasonTeamTotalsMap = new Map()
  for (const [tName, tData] of teamResults.entries()) {
    // Initialize 38 gameweek scores array
    const gwScores = new Array(38).fill(0)
    
    // Read previous gameweek scores from existing standings
    const existingRow = existingStandingsRows.find((r) => String(r[1] || '').trim().toLowerCase() === tName.toLowerCase())
    if (existingRow) {
      for (let w = 1; w <= 38; w++) {
        const colIdx = 2 + w // Col C is index 2 (Total), Col D is index 3 (GW1)
        if (existingRow[colIdx] !== undefined && existingRow[colIdx] !== '') {
          gwScores[w - 1] = Number(existingRow[colIdx]) || 0
        }
      }
    }

    // Set current gameweek total points
    gwScores[Number(targetGw) - 1] = tData.total_points

    // Compute cumulative season total
    const cumulativeSeasonTotal = gwScores.reduce((sum, val) => sum + val, 0)
    seasonTeamTotalsMap.set(tName, {
      ...tData,
      gwScores,
      seasonTotal: cumulativeSeasonTotal,
    })
  }

  // Rank teams by Cumulative Season Total (D92: uses competition ranking for ties)
  const rankedTeams = Array.from(seasonTeamTotalsMap.values()).sort((a, b) => b.seasonTotal - a.seasonTotal)
  // D92: Competition ranking - ties share the same rank, next rank skips accordingly
  let currentRank = 1
  for (let i = 0; i < rankedTeams.length; i++) {
    if (i > 0 && rankedTeams[i].seasonTotal === rankedTeams[i - 1].seasonTotal) {
      rankedTeams[i].seasonRank = rankedTeams[i - 1].seasonRank
    } else {
      rankedTeams[i].seasonRank = currentRank
    }
    currentRank = i + 2 // next position (not next rank if tie)
  }

  const batchData = []

  for (const teamData of rankedTeams) {
    const teamName = teamData.team_name
    const resolvedTab = resolveExactTabName(teamName)
    if (!resolvedTab) continue

    // Prepare 6-Column GW Snapshot Block starting at Column J1 (J1:O18)
    const gwBlockRows = [
      [`GW${targetGw}-Lineup`, `GW${targetGw}-Pos`, `GW${targetGw}-Role`, `GW${targetGw}-BasePts`, `GW${targetGw}-Bonus`, `GW${targetGw}-Total`]
    ]

    const sortedSquad = [...teamData.players].sort((a, b) => {
      const getPriority = (p) => {
        if (p.is_captain) return 1
        if (p.is_vice) return 2
        if (p.role === 'STARTER' || p.role === 'AUTO_SUB_IN') return 3
        if (p.role === 'BENCH_1') return 4
        if (p.role === 'BENCH_2') return 5
        if (p.role === 'BENCH_3') return 6
        if (p.role === 'BENCH_4') return 7
        if (p.role === 'AUTO_SUB_OUT') return 8
        return 9
      }
      return getPriority(a) - getPriority(b)
    })

    let totalPlayerBasePts = 0
    let totalPlayerStadiumBonus = 0
    let totalPlayerFinalPts = 0

    for (const p of sortedSquad) {
      let roleDisplay = p.role
      if (p.is_captain) roleDisplay = 'CAPTAIN'
      else if (p.is_vice) roleDisplay = 'VICE_CAPTAIN'

      const baseMatchPts = Number(p.base_pts || 0)
      const stadiumBonus = Number(p.stadium_bonus || 0)
      const isEffective = p.isEffectiveStarter
      const playerFinalPts = isEffective ? p.final_pts : 0

      if (isEffective) {
        totalPlayerBasePts += baseMatchPts
        totalPlayerStadiumBonus += stadiumBonus
        totalPlayerFinalPts += playerFinalPts
      }

      gwBlockRows.push([
        p.player_name,
        p.position,
        roleDisplay,
        baseMatchPts,
        stadiumBonus,
        playerFinalPts
      ])
    }

    const teamStadiumBonus = Number(teamData.stadium_bonus || 0)
    const teamPenalty = Number(teamData.penalty || 0)
    const finalTeamTotal = totalPlayerFinalPts + teamStadiumBonus - teamPenalty
    const stadiumName = teamData.stadium_name || 'STADIUM'

    gwBlockRows.push([stadiumName, 'STADIUM', '', 0, 0, teamStadiumBonus])
    gwBlockRows.push(['Penalty / Deduction', 'PENALTY', '', 0, 0, teamPenalty > 0 ? -teamPenalty : 0])
    gwBlockRows.push([`GW${targetGw} Team Total`, '', '', totalPlayerBasePts, totalPlayerStadiumBonus, finalTeamTotal])

    // Push GW Snapshot range dynamically (GW1 -> J1:O18, GW2 -> P1:U18, GW3 -> V1:AA18, etc.)
    const gwRange = getGwColumnRange(targetGw)
    batchData.push({
      range: `'${resolvedTab}'!${gwRange}`,
      values: gwBlockRows,
    })

    // Push Cumulative Season Total & Season Rank header (Fixes CRIT-06)
    batchData.push({
      range: `'${resolvedTab}'!G1:H2`,
      values: [
        ['SEASON TOTAL', teamData.seasonTotal],
        ['CURRENT RANK', teamData.seasonRank],
      ],
    })
  }

  // D75: Write backup BEFORE rewriting Standings (atomic rollback protection)
  const standingsHeaders = ['Rank', 'Team Name', 'Total Points']
  for (let w = 1; w <= 38; w++) {
    standingsHeaders.push(`GW${w}`)
  }

  const standingsRows = rankedTeams.map((t) => {
    return [t.seasonRank, t.team_name, t.seasonTotal, ...t.gwScores]
  })

  const existingStandingsRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Standings!A1:AO20',
  }).catch(() => ({ data: { values: [] } }))
  const backupRows = existingStandingsRes.data.values || []

  // D75: Write Standings_Backup BEFORE atomic rewrite (separate call to guarantee ordering)
  if (backupRows.length > 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "'Standings_Backup'!A1",
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: backupRows },
    }).catch(() => {})
    console.log(`[Standings] Backup saved (${backupRows.length} rows) to Standings_Backup.`)
  }

  // D49: Check for lineup changes since last publish
  const lineupChangedTeams = []
  for (const teamData of rankedTeams) {
    const key = `${teamData.team_name}`
    const stored = lineupFingerprints.get(key)
    const current = currentFingerprints.get(teamData.team_name)
    if (stored && stored.fingerprint && stored.fingerprint !== current) {
      lineupChangedTeams.push(teamData.team_name)
    }
  }

  if (lineupChangedTeams.length > 0) {
    console.warn(`\n⚠️ [D49] LINEUP CHANGED SINCE LAST PUBLISH: ${lineupChangedTeams.join(', ')}`)
    console.warn('[D49] Standing updates SKIPPED for affected teams to prevent silent score replacement.')
    console.warn('[D49] Restore original lineup or manually review scores in Comparison_Dashboard.')
  }

  // D49: Only write Standings for teams whose lineup hasn't changed
  const safeStandingsRows = standingsRows.filter((r) => {
    const teamName = r[1]
    return !lineupChangedTeams.includes(teamName)
  })

  if (safeStandingsRows.length > 0) {
    batchData.push({
      range: 'Standings!A1:AO17',
      values: [standingsHeaders, ...safeStandingsRows],
    })
  }

  // D49: Update Lineup_Fingerprints with current fingerprints after successful write
  const fpUpdateData = []
  for (const [tName, fp] of currentFingerprints.entries()) {
    fpUpdateData.push([targetGw, tName, fp, new Date().toISOString()])
  }
  fpUpdateData.sort((a, b) => a[1].localeCompare(b[1]))
  const fpAllValues = [['gameweek', 'team_name', 'fingerprint', 'published_at'], ...fpUpdateData]
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'Lineup_Fingerprints'!A1",
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: fpAllValues },
  }).catch(() => {})

  // Ensure all target sheets (16 teams + Standings) have sufficient grid columns before writing
  const targetTabNames = rankedTeams.map((t) => resolveExactTabName(t.team_name)).filter(Boolean)
  targetTabNames.push('Standings')
  await ensureGridColumns(sheets, spreadsheetId, targetGw, targetTabNames)

  // Execute ALL sheet updates in 1 single atomic batch call!
  console.log(`Writing all ${batchData.length} ranges in 1 atomic batch update...`)
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: batchData,
    },
  })

  console.log('✅ Successfully updated all 16 team sheets & Standings tab in 1 atomic batch!')
  console.log('\n🎉 ALL 16 TEAMS & STANDINGS SYNCHRONIZED SUCCESSFULLY!')
  return { success: true, teamResults }
}
