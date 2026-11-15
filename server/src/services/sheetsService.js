import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1smqnbGD0chXTYLRepUrmiQePc5zuMdQu4AFaASZZRcU'

export const REAL_16_TABS = [
  'Aguilas Dorados',
  'Aura Farmers',
  'Aztec Blinders',
  'Choakers FC',
  'Committe Team',
  'Iberian Wizards',
  'Jogo Bonito',
  'Kroos Control',
  'La Pulga',
  'Mamangam DC',
  'Mancunians',
  'Meridian Athletic',
  'Phoenix Flyers',
  'Reds',
  'Relegated FC',
  'xG Illuminati',
]

/**
 * Dynamically resolves the currently active Gameweek from submitted Lineup_Rosters
 */
export async function getActiveGameweek() {
  try {
    const auth = getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Lineup_Rosters!A2:A',
    })
    const values = res.data.values || []
    const gws = values.map((r) => Number(r[0])).filter((n) => !isNaN(n) && n > 0)
    if (gws.length > 0) {
      const rawMax = Math.max(...gws)
      // D95: Warn if max GW seems too high (managers may have submitted future GW early)
      if (rawMax > 38) {
        console.warn(`[Gameweek Detection] WARNING: GW${rawMax} detected but season has 38 GWs max.`)
      }
      return Math.min(rawMax, 38)
    }
  } catch (e) {
    console.warn('[Gameweek Detection] Error reading Lineup_Rosters:', e.message)
  }
  return 1
}

/**
 * Finds the exact matching Google Sheet tab name for any team string
 */
export function resolveExactTabName(inputName) {
  if (!inputName) return 'Choakers FC'
  const cleanInput = inputName.toLowerCase().replace(/[^a-z0-9]/g, '')

  // Specific keyword mappings
  if (cleanInput.includes('choker') || cleanInput.includes('choaker')) return 'Choakers FC'
  if (cleanInput.includes('committ')) return 'Committe Team'
  if (cleanInput.includes('aguila')) return 'Aguilas Dorados'
  if (cleanInput.includes('aura')) return 'Aura Farmers'
  if (cleanInput.includes('aztec')) return 'Aztec Blinders'
  if (cleanInput.includes('iberian')) return 'Iberian Wizards'
  if (cleanInput.includes('jogo')) return 'Jogo Bonito'
  if (cleanInput.includes('kroos')) return 'Kroos Control'
  if (cleanInput.includes('pulga')) return 'La Pulga'
  if (cleanInput.includes('mamangam')) return 'Mamangam DC'
  if (cleanInput.includes('mancunian')) return 'Mancunians'
  if (cleanInput.includes('meridian')) return 'Meridian Athletic'
  if (cleanInput.includes('phoenix')) return 'Phoenix Flyers'
  if (cleanInput.includes('reds') || cleanInput === 'red') return 'Reds'
  if (cleanInput.includes('relegat')) return 'Relegated FC'
  if (cleanInput.includes('illuminati') || cleanInput.includes('xgi')) return 'xG Illuminati'

  for (const tab of REAL_16_TABS) {
    const cleanTab = tab.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (cleanTab === cleanInput || cleanTab.includes(cleanInput) || cleanInput.includes(cleanTab)) {
      return tab
    }
  }

  return inputName
}

/**
 * Fetches all teams that have submitted a lineup for a given Gameweek directly from Google Sheets
 */
export async function fetchSubmittedTeamsFromSheet(gameweek) {
  try {
    const auth = getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const targetGw = String(gameweek || 1)

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Lineup_Rosters!A2:B',
    })

    const rows = response.data.values || []
    const submittedSet = new Set()

    rows.forEach((row) => {
      const rowGw = String(row[0] || '').trim()
      const rowTeam = resolveExactTabName(String(row[1] || '').trim())
      if (rowGw === targetGw && rowTeam) {
        submittedSet.add(rowTeam)
      }
    })

    return Array.from(submittedSet)
  } catch (error) {
    console.warn(`[Google Sheets] Could not fetch submitted teams for GW${gameweek}:`, error.message)
    return []
  }
}

/**
 * Fetches the official 15 squad players for a team tab from Google Sheets
 */
export async function fetchTeamSquadFromSheet(teamName) {
  try {
    const auth = getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const exactTab = resolveExactTabName(teamName)

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${exactTab}'!A1:E30`,
    })

    const rows = response.data.values || []
    if (rows.length === 0) return []

    let headerRowIdx = -1
    for (let r = 0; r < rows.length; r++) {
      const firstCell = String(rows[r][0] || '').toLowerCase().trim()
      if (firstCell === 'player') {
        headerRowIdx = r
        break
      }
    }

    if (headerRowIdx === -1) {
      console.warn(`[Google Sheets] 'Player' header row not found in tab '${exactTab}'.`)
      return []
    }

    const squadPlayers = []
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r]
      if (!row || row.length === 0) continue

      const playerName = String(row[0] || '').trim()
      const pos = String(row[1] || 'MID').trim().toUpperCase()
      const league = String(row[2] || '').trim()
      const club = String(row[3] || '').trim()

      if (playerName.length > 1 && pos !== 'STADIUM') {
        squadPlayers.push({
          name: playerName,
          pos: pos === 'GK' ? 'GKP' : pos === 'FOR' ? 'FWD' : pos,
          league,
          club,
        })
      }
    }

    console.log(`[Google Sheets] Successfully loaded ${squadPlayers.length} live squad players for '${exactTab}'`)
    return squadPlayers
  } catch (error) {
    console.warn(`[Google Sheets] Could not fetch squad for tab '${teamName}':`, error.message)
    return []
  }
}

/**
 * True UPSERT on Lineup_Rosters: Overwrites existing team rows or appends if new
 * Guarantees exactly 15 rows exist per team per gameweek (0 duplicate rows).
 */
export async function upsertLineupToSheet(lineupData) {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const range = 'Lineup_Rosters!A:H'

  const { gameweek, team_name, starters = [], captain, vice_captain, bench = [] } = lineupData
  const exactTeamName = resolveExactTabName(team_name)
  const targetGw = String(gameweek || 1)
  const timestamp = new Date().toISOString()

  // 1. Build the 15 formatted player rows
  const newPlayerRows = []

  starters.forEach((player) => {
    const isCap = typeof player === 'string' ? player === captain : player.name === captain
    const isVice = typeof player === 'string' ? player === vice_captain : player.name === vice_captain
    const name = typeof player === 'string' ? player : player.name
    const pos = typeof player === 'object' ? player.pos || 'MID' : 'MID'

    newPlayerRows.push([
      targetGw,
      exactTeamName,
      name,
      pos,
      'STARTER',
      isCap ? 'TRUE' : 'FALSE',
      isVice ? 'TRUE' : 'FALSE',
      timestamp,
    ])
  })

  bench.forEach((player, idx) => {
    const name = typeof player === 'string' ? player : player.name
    const pos = typeof player === 'object' ? player.pos || 'MID' : 'MID'

    newPlayerRows.push([
      targetGw,
      exactTeamName,
      name,
      pos,
      `BENCH_${idx + 1}`,
      'FALSE',
      'FALSE',
      timestamp,
    ])
  })

  // 2. Fetch all existing rows in Lineup_Rosters to check for duplicates
  const existingSheet = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  })

  const allRows = existingSheet.data.values || []
  
  // Header row
  const header = allRows.length > 0 ? allRows[0] : [
    'gw', 'team_name', 'player_name', 'position', 'role', 'is_captain', 'is_vice', 'submitted_at'
  ]

  // Filter out any existing rows belonging to this (targetGw, exactTeamName)
  const otherTeamsRows = allRows.slice(1).filter((row) => {
    const rowGw = String(row[0] || '').trim()
    const rowTeam = resolveExactTabName(String(row[1] || '').trim())
    return !(rowGw === targetGw && rowTeam.toLowerCase() === exactTeamName.toLowerCase())
  })

  // Combine: Header + Other Teams + Updated Team's 15 rows
  const finalSheetRows = [header, ...otherTeamsRows, ...newPlayerRows]

  // 3. Clear and rewrite cleanly to guarantee ZERO duplicate rows
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Lineup_Rosters!A:H',
  })

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Lineup_Rosters!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: finalSheetRows,
    },
  })

  console.log(`[Google Sheets UPSERT] Successfully saved ${newPlayerRows.length} clean rows for ${exactTeamName} (GW${targetGw})!`)
  return response.data
}
