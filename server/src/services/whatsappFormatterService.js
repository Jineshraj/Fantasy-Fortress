import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { getGwColumnRange, TEAM_STADIUM_MAP } from './scoringEngine.js'
import { resolveExactTabName, REAL_16_TABS } from './sheetsService.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1smqnbGD0chXTYLRepUrmiQePc5zuMdQu4AFaASZZRcU'

/**
 * Formats a single team's weekly points into a WhatsApp-ready text with custom emojis.
 * Reads 100% directly from Google Sheets (Team tab + Lineup_Rosters for submitted roles).
 */
export async function formatTeamWhatsAppPoints(teamName, targetGw = 1) {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const resolvedTab = resolveExactTabName(teamName)
  if (!resolvedTab) {
    throw new Error(`Team tab '${teamName}' not found in official 16 franchises.`)
  }

  // 1. Fetch scored snapshot from the Team tab
  const range = `${resolvedTab}!${getGwColumnRange(targetGw)}`
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range })
  const rows = res.data.values || []

  if (rows.length < 2) {
    throw new Error(`No scored points found on sheet tab '${resolvedTab}' for GW${targetGw}.`)
  }

  // 2. Fetch submitted roster from Lineup_Rosters for role/sub correlation
  let submittedRoster = []
  try {
    const rosterRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Lineup_Rosters!A2:H',
    })
    submittedRoster = (rosterRes.data.values || []).filter(
      r => String(r[0]).trim() === String(targetGw) && String(r[1]).trim().toLowerCase() === resolvedTab.toLowerCase()
    )
  } catch (e) {}

  // Parse player rows from the Team tab (any row before Stadium / Total)
  const tabPlayersMap = new Map()
  let stadiumBonusFromTab = 0
  let penaltyFromTab = 0

  for (const r of rows.slice(1)) {
    if (!r || !r[0]) continue
    const col0 = String(r[0]).trim()
    const col1 = String(r[1] || '').trim()

    if (col0.toLowerCase().includes('total') || col1.toLowerCase().includes('total')) {
      continue
    }

    if (col1.toUpperCase() === 'PENALTY' || col0.toLowerCase().includes('penalty')) {
      const pVal = r[5] !== undefined && r[5] !== '' ? r[5] : 0
      penaltyFromTab = Number(pVal) || 0
      continue
    }

    if (col1.toUpperCase() === 'STADIUM' || col0.toLowerCase().includes('stadium')) {
      const bonusVal = r[5] !== undefined && r[5] !== '' ? r[5] : (r[3] !== undefined && r[3] !== '' ? r[3] : 0)
      stadiumBonusFromTab = Number(bonusVal) || 0
      continue
    }

    // Player row
    tabPlayersMap.set(col0.toLowerCase(), {
      name: col0,
      position: String(r[1] || 'MID').trim().toUpperCase(),
      role: String(r[2] || 'STARTER').trim().toUpperCase(),
      basePts: Number(r[3] || 0),
      bonus: Number(r[4] || 0),
      finalPts: Number(r[5] || 0),
    })
  }

  const stadiumInfo = TEAM_STADIUM_MAP[resolvedTab] || { stadium: 'Standard Ground', homeClub: 'Home Club' }

  // Build the 15-man display
  let starters = []
  let bench = []

  if (submittedRoster.length > 0) {
    const submittedStarters = submittedRoster.filter(r => String(r[4]).toUpperCase() === 'STARTER')
    const submittedBench = submittedRoster.filter(r => String(r[4]).toUpperCase().startsWith('BENCH'))

    starters = submittedStarters.map(r => {
      const pName = String(r[2]).trim()
      const pos = String(r[3] || 'MID').trim().toUpperCase()
      const isCaptain = String(r[5]).toUpperCase() === 'TRUE'
      const isVice = String(r[6]).toUpperCase() === 'TRUE'
      const tabData = tabPlayersMap.get(pName.toLowerCase())

      const isSubbedOut = !tabData || tabData.role === 'AUTO_SUB_OUT'

      return {
        name: pName,
        position: pos,
        isCaptain,
        isVice,
        isSubbedOut,
        finalPts: tabData ? tabData.finalPts : 0,
        basePts: tabData ? tabData.basePts : 0,
      }
    })

    bench = submittedBench.map(r => {
      const pName = String(r[2]).trim()
      const pos = String(r[3] || 'MID').trim().toUpperCase()
      const tabData = tabPlayersMap.get(pName.toLowerCase())

      const isSubbedIn = tabData && tabData.role === 'AUTO_SUB_IN'

      return {
        name: pName,
        position: pos,
        isSubbedIn,
        finalPts: tabData ? tabData.finalPts : 0,
        basePts: tabData ? tabData.basePts : 0,
      }
    })
  } else {
    for (const p of tabPlayersMap.values()) {
      if (p.role.startsWith('BENCH') || p.role === 'AUTO_SUB_IN') {
        bench.push({
          ...p,
          isSubbedIn: p.role === 'AUTO_SUB_IN',
        })
      } else {
        starters.push({
          ...p,
          isCaptain: p.role === 'CAPTAIN',
          isVice: p.role === 'VICE_CAPTAIN',
          isSubbedOut: p.role === 'AUTO_SUB_OUT',
        })
      }
    }
  }

  // Compute Total Team Points (Sum of active starters + Auto-Sub IN + Stadium Bonus + Penalty)
  let computedTotal = 0
  starters.forEach(p => { if (!p.isSubbedOut) computedTotal += p.finalPts })
  bench.forEach(p => { if (p.isSubbedIn) computedTotal += p.finalPts })
  computedTotal += stadiumBonusFromTab + penaltyFromTab

  const totalPts = String(computedTotal)

  // Calculate formation from submitted starters
  const defCount = starters.filter(p => ['DEF', 'D'].includes(p.position)).length
  const midCount = starters.filter(p => ['MID', 'M'].includes(p.position)).length
  const fwdCount = starters.filter(p => ['FWD', 'F', 'FOR'].includes(p.position)).length
  const formation = `${defCount}-${midCount}-${fwdCount}`

  const formatPlayerLine = (p, isBench = false) => {
    let tag = ''
    if (p.isCaptain) tag += ' (C)'
    else if (p.isVice) tag += ' (VC)'

    if (!isBench) {
      if (p.isSubbedOut) {
        return `▪️${p.name}${tag} 🔴`
      }
      return `▪️${p.name}${tag} ${p.finalPts}`
    } else {
      if (p.isSubbedIn) {
        return `▪️${p.name} 🟢 ${p.finalPts}`
      }
      if (p.basePts > 0) {
        return `▪️${p.name} 🪑 ${p.basePts}`
      }
      return `▪️${p.name} 🪑`
    }
  }

  const gks = starters.filter(p => ['GK', 'GKP'].includes(p.position))
  const defs = starters.filter(p => ['DEF', 'D'].includes(p.position))
  const mids = starters.filter(p => ['MID', 'M'].includes(p.position))
  const fwds = starters.filter(p => ['FWD', 'F', 'FOR'].includes(p.position))

  let message = `🏅 *FANTASY FORTRESS - S2*\n\n`
  message += `📋 *Team Name :* ${resolvedTab}\n`
  message += `🏟️ *Stadium :* ${stadiumInfo.stadium} ${stadiumBonusFromTab}\n`
  if (penaltyFromTab !== 0) {
    message += `⚠️ *Penalty :* ${penaltyFromTab}\n`
  }
  message += `📢 *GW :* ${targetGw}\n`
  message += `📜 *Formation :* ${formation}\n\n`

  message += `🧤 *Goalkeepers*\n\n`
  message += (gks.length > 0 ? gks.map(p => formatPlayerLine(p)).join('\n') : `▪️None`) + '\n\n'

  message += `🛡️ *Defenders*\n\n`
  message += (defs.length > 0 ? defs.map(p => formatPlayerLine(p)).join('\n') : `▪️None`) + '\n\n'

  message += `🎯 *Midfielders*\n\n`
  message += (mids.length > 0 ? mids.map(p => formatPlayerLine(p)).join('\n') : `▪️None`) + '\n\n'

  message += `⚽ *Forwards*\n\n`
  message += (fwds.length > 0 ? fwds.map(p => formatPlayerLine(p)).join('\n') : `▪️None`) + '\n\n'

  message += `⭕ *SUB*\n\n`
  message += (bench.length > 0 ? bench.map(p => formatPlayerLine(p, true)).join('\n') : `▪️None`) + '\n\n'

  message += `*Total :* ${totalPts}\n\n`
  message += `#fantasyfortress\n#s2\n#lineup`

  return message
}

/**
 * Formats the single Gameweek standings table for WhatsApp.
 */
export async function formatGwStandingsWhatsApp(targetGw = 1) {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Standings!A2:AO18',
  })
  const rows = res.data.values || []
  const gwColIdx = 2 + Number(targetGw)

  const teams = rows.map(r => ({
    team: String(r[1] || '').trim(),
    gwPts: Number(r[gwColIdx] || 0),
  })).filter(t => t.team.length > 0)

  teams.sort((a, b) => b.gwPts - a.gwPts)

  let msg = `📊 *FANTASY FORTRESS - S2*\n`
  msg += `📢 *GW${targetGw} GAMEWEEK STANDINGS*\n\n`

  teams.forEach((t, i) => {
    let medal = ''
    if (i === 0) medal = '🥇 '
    else if (i === 1) medal = '🥈 '
    else if (i === 2) medal = '🥉 '
    else medal = `${i + 1}. `

    msg += `${medal}*${t.team}* — *${t.gwPts} pts*\n`
  })

  msg += `\n#fantasyfortress\n#s2\n#gw${targetGw}standings`
  return msg
}

/**
 * Formats the cumulative overall season standings table for WhatsApp.
 */
export async function formatSeasonStandingsWhatsApp(targetGw = 1) {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Standings!A2:AO18',
  })
  const rows = res.data.values || []
  const gwColIdx = 2 + Number(targetGw)

  const teams = rows.map(r => ({
    team: String(r[1] || '').trim(),
    totalPts: Number(r[2] || 0),
    gwPts: Number(r[gwColIdx] || 0),
  })).filter(t => t.team.length > 0)

  teams.sort((a, b) => b.totalPts - a.totalPts)

  let msg = `🏆 *FANTASY FORTRESS - S2*\n`
  msg += `📈 *OVERALL SEASON STANDINGS (After GW${targetGw})*\n\n`

  teams.forEach((t, i) => {
    let medal = ''
    if (i === 0) medal = '👑 '
    else if (i === 1) medal = '🥈 '
    else if (i === 2) medal = '🥉 '
    else medal = `${i + 1}. `

    msg += `${medal}*${t.team}* — *${t.totalPts} pts* _(GW${targetGw}: ${t.gwPts})_\n`
  })

  msg += `\n#fantasyfortress\n#s2\n#standings`
  return msg
}

/**
 * Returns formatted WhatsApp points for all 16 teams + both Standings for a given GW.
 */
export async function formatAllTeamsWhatsAppPoints(targetGw = 1) {
  const teamCards = []

  // 1. All 16 team cards
  for (const team of REAL_16_TABS) {
    try {
      const msg = await formatTeamWhatsAppPoints(team, targetGw)
      const match = msg.match(/\*Total\s*:\*\s*(-?\d+)/i)
      const pts = match ? Number(match[1]) : 0
      teamCards.push({ type: 'team', team, message: msg, pts, success: true })
    } catch (e) {
      teamCards.push({ type: 'team', team, error: e.message, pts: -999, success: false })
    }
  }

  // Sort team cards in ascending order: least points in the GW to most points
  teamCards.sort((a, b) => {
    if (a.pts !== b.pts) return a.pts - b.pts
    return a.team.localeCompare(b.team)
  })

  const results = [...teamCards]

  // 2. GW Standings Card
  try {
    const gwMsg = await formatGwStandingsWhatsApp(targetGw)
    results.push({ type: 'gw_standings', message: gwMsg, success: true })
  } catch (e) {
    results.push({ type: 'gw_standings', error: e.message, success: false })
  }

  // 3. Overall Season Standings Card
  try {
    const sMsg = await formatSeasonStandingsWhatsApp(targetGw)
    results.push({ type: 'season_standings', message: sMsg, success: true })
  } catch (e) {
    results.push({ type: 'season_standings', error: e.message, success: false })
  }

  return results
}
