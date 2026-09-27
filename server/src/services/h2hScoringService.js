/**
 * H2H League Scoring Service.
 *
 * Scoring Rule:
 *   Team H2H Match Score = Total Team Points MINUS Team Stadium Bonus.
 *   (Includes all starting players, auto-subs, home match player bonus, and captain 2x multiplier;
 *   excludes real-life club stadium win/draw bonus).
 *
 * Sheet Structure (H2H_League Two-Pane Dashboard):
 * - Left Pane (Cols A-J):
 *     Rows 1-2:   Title & Subtitle
 *     Rows 3-12:  GROUP A STANDINGS (Pos, Team, P, W, D, L, GF, GA, GD, Pts) -> Data in A5:J12
 *     Rows 14-23: GROUP B STANDINGS (Pos, Team, P, W, D, L, GF, GA, GD, Pts) -> Data in A16:J23
 *     Rows 25-30: CHAMPIONSHIP PLAYOFFS (SF1 in A27:G27, SF2 in A28:G28, Final in A30:G30)
 * - Spacer Col K (Divider)
 * - Right Pane (Cols L-S):
 *     Rows 1-2:   Schedule & Results Header
 *     Row 3:      Headers: GW | Grp | Home Team | Score | vs | Score | Away Team | Winner
 *     Rows 4-115: 112 Match rows (14 GWs × 8 matches: 4 Group A, 4 Group B)
 *
 * Reads from:  16 Team Sheet Tabs, Lineup_Rosters, Comparison_Dashboard, H2H_League
 * Writes to:   H2H_League
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName } from './rosterValidator.js'
import { resolveExactTabName } from './sheetsService.js'
import { getGwColumnRange } from './scoringEngine.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

export const H2H_GWS = [3, 4, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20]

export const groupATeams = [
  'Aguilas Dorados', 'Reds', 'Aztec Blinders', 'Meridian Athletic',
  'Choakers FC', 'Mamangam DC', 'Iberian Wizards', 'La Pulga'
]
export const groupBTeams = [
  'Aura Farmers', 'xG Illuminati', 'Committe Team', 'Relegated FC',
  'Jogo Bonito', 'Phoenix Flyers', 'Kroos Control', 'Mancunians'
]

// ────────────────────────────────────────────────────────────────────
// 1. Read Team H2H Scores (Total Points Minus Stadium Bonus)
// ────────────────────────────────────────────────────────────────────

/**
 * Reads each team's weekly score directly from their individual sheet tab for targetGw.
 * Team H2H Score = Team Total - Stadium Bonus (includes home match player bonus & captain 2x).
 */
export async function getTeamH2HScores(targetGw) {
  const allTeams = [...groupATeams, ...groupBTeams]
  const ranges = allTeams.map((team) => `'${resolveExactTabName(team)}'!${getGwColumnRange(targetGw)}`)

  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: ssId,
    ranges,
  })

  const valueRanges = res.data.valueRanges || []
  const teamScores = new Map()

  for (let i = 0; i < allTeams.length; i++) {
    const team = allTeams[i]
    const rows = valueRanges[i]?.values || []
    let fullTeamTotal = 0
    let stadiumBonus = 0
    let foundTotal = false

    for (const r of rows) {
      const col0 = String(r[0] || '').trim()
      const col1 = String(r[1] || '').trim()

      if (col0.toLowerCase().includes('team total')) {
        fullTeamTotal = Number(r[5] || 0)
        foundTotal = true
      }
      if (col1.toUpperCase() === 'STADIUM' || col0.toLowerCase().includes('stadium')) {
        stadiumBonus = Number(r[5] || 0)
      }
    }

    if (!foundTotal) {
      // Fallback if tab snapshot not yet populated
      teamScores.set(team, { total: 0, stadiumBonus: 0, h2hScore: 0, hasData: false })
    } else {
      const h2hScore = fullTeamTotal - stadiumBonus
      teamScores.set(team, { total: fullTeamTotal, stadiumBonus, h2hScore, hasData: true })
    }
  }

  return teamScores
}

// ────────────────────────────────────────────────────────────────────
// 2. Compatibility Functions for Super Cup & Lineup Inspection
// ────────────────────────────────────────────────────────────────────

export async function readLineupsForGw(targetGw) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: 'Lineup_Rosters!A1:H',
  })
  const rows = res.data.values || []
  if (rows.length === 0) return new Map()
  const header = rows[0]
  const idx = {
    gw: header.indexOf('gw'),
    team: header.indexOf('team_name'),
    player: header.indexOf('player_name'),
    pos: header.indexOf('position'),
    role: header.indexOf('role'),
    isCap: header.indexOf('is_captain'),
    isV: header.indexOf('is_vice'),
  }
  const map = new Map()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (String(r[idx.gw] || '').trim() !== String(targetGw)) continue
    const team = String(r[idx.team] || '').trim()
    if (!team) continue
    if (!map.has(team)) map.set(team, [])
    map.get(team).push({
      player: String(r[idx.player] || '').trim(),
      pos: String(r[idx.pos] || 'MID').trim().toUpperCase(),
      role: String(r[idx.role] || '').trim().toUpperCase(),
      isCap: String(r[idx.isCap] || '').trim().toUpperCase() === 'TRUE',
      isV: String(r[idx.isV] || '').trim().toUpperCase() === 'TRUE',
    })
  }
  return map
}

export async function readDashboardForGw(targetGw) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: 'Comparison_Dashboard!A1:J',
  })
  const rows = res.data.values || []
  if (rows.length === 0) return new Map()
  const header = rows[0]
  const idx = {
    team: header.indexOf('team_name'),
    player: header.indexOf('player_name'),
    status: header.indexOf('status'),
    finalPts: header.indexOf('final_approved_pts'),
    gw: header.indexOf('last_updated_gw'),
  }
  const map = new Map()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (String(r[idx.gw] || '').trim() !== String(targetGw)) continue
    const player = String(r[idx.player] || '').trim()
    const finalPts = Number(r[idx.finalPts] || 0)
    const status = String(r[idx.status] || '').trim().toUpperCase()
    const key = normalizeName(player)
    map.set(key, { finalPts, status })
  }
  return map
}

export function computeEffectiveXI(roster, dashboardPts) {
  if (!roster || roster.length === 0) return { effectiveStarters: [] }
  const withPts = roster.map((p) => {
    const d = dashboardPts.get(normalizeName(p.player))
    return { ...p, finalPts: d ? d.finalPts : 0, hasData: d !== undefined }
  })
  const starters = withPts.filter((p) => p.role === 'STARTER' || p.role === 'CAPTAIN' || p.role === 'VICE_CAPTAIN')
  const bench = withPts.filter((p) => p.role && p.role.startsWith('BENCH'))
  const effectiveStarters = [...starters]
  let hasSubIn = false
  for (const starter of [...starters]) {
    if (starter.hasData && starter.finalPts > 0) continue
    const subIdx = bench.findIndex((b) => {
      if (b.used) return false
      if (b.pos !== starter.pos) return false
      return b.hasData && b.finalPts > 0
    })
    if (subIdx >= 0) {
      const sub = bench[subIdx]
      sub.used = true
      sub.role = 'AUTO_SUB_IN'
      effectiveStarters.push(sub)
      hasSubIn = true
    }
  }
  const captain = effectiveStarters.find((p) => p.role === 'CAPTAIN')
  const vice = effectiveStarters.find((p) => p.role === 'VICE_CAPTAIN')
  let captainMultiplier = 1
  if (captain && captain.hasData && captain.finalPts > 0) {
    captainMultiplier = 2
  } else if (vice && vice.hasData && vice.finalPts > 0) {
    captainMultiplier = 2
    vice.role = 'CAPTAIN_SUBSTITUTE'
  }
  for (const p of effectiveStarters) {
    if (p.role === 'CAPTAIN' || p.role === 'VICE_CAPTAIN' || p.role === 'CAPTAIN_SUBSTITUTE') {
      p.appliedPts = p.finalPts * captainMultiplier
    } else {
      p.appliedPts = p.finalPts
    }
  }
  return { effectiveStarters, captainMultiplier, hasSubIn }
}

export function computeTeamScore(roster, dashboardPts) {
  const { effectiveStarters } = computeEffectiveXI(roster, dashboardPts)
  if (effectiveStarters.length === 0) return { score: 0, effective: [] }
  const sorted = [...effectiveStarters].sort((a, b) => (b.appliedPts || 0) - (a.appliedPts || 0))
  const top11 = sorted.slice(0, 11)
  const score = top11.reduce((sum, p) => sum + (p.appliedPts || 0), 0)
  return { score, effective: top11 }
}

// ────────────────────────────────────────────────────────────────────
// 3. Read H2H Fixtures from Dashboard
// ────────────────────────────────────────────────────────────────────

/**
 * Read fixtures from H2H_League tab (Right Pane: L4:S115).
 * Columns:
 *   L (0): GW
 *   M (1): Grp
 *   N (2): Home Team
 *   O (3): Home Score
 *   P (4): vs
 *   Q (5): Away Score
 *   R (6): Away Team
 *   S (7): Winner
 */
export async function readH2HFixtures() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: 'H2H_League!L4:S115',
  })
  const rows = res.data.values || []
  const fixtures = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length < 3) continue
    const gw = String(r[0] || '').trim()
    const group = String(r[1] || '').trim()
    const homeTeam = String(r[2] || '').trim()
    const homeScore = String(r[3] || '').trim()
    const awayScore = String(r[5] || '').trim()
    const awayTeam = String(r[6] || '').trim()
    const winner = String(r[7] || '').trim()

    if (!gw.startsWith('GW') || !homeTeam || !awayTeam) continue

    const sheetRow = i + 4 // 1-indexed row in sheet
    fixtures.push({
      gw,
      group,
      homeTeam,
      homeScore,
      awayScore,
      awayTeam,
      winner,
      sheetRow,
    })
  }
  return fixtures
}

// ────────────────────────────────────────────────────────────────────
// 4. Sync H2H for a Single GW (Total Points Minus Stadium Bonus)
// ────────────────────────────────────────────────────────────────────

export async function syncH2HForGw(targetGw, { dryRun = false } = {}) {
  console.log(`\n[H2H] Syncing GW${targetGw} (Team Total minus Stadium Bonus)...`)
  const teamScores = await getTeamH2HScores(targetGw)
  const fixtures = await readH2HFixtures()
  const gwFixtures = fixtures.filter((f) => f.gw === `GW${targetGw}`)

  if (gwFixtures.length === 0) {
    console.log(`[H2H] No fixtures found for GW${targetGw}`)
    return { matches: [] }
  }

  const updates = []
  const allMatchResults = []

  for (const m of gwFixtures) {
    const dataA = teamScores.get(m.homeTeam)
    const dataB = teamScores.get(m.awayTeam)

    const scoreA = dataA?.h2hScore ?? 0
    const scoreB = dataB?.h2hScore ?? 0

    const winner = scoreA > scoreB ? m.homeTeam : scoreA < scoreB ? m.awayTeam : 'DRAW'
    allMatchResults.push({
      ...m,
      scoreA,
      scoreB,
      winner,
    })

    console.log(
      `  [Grp ${m.group}] ${m.homeTeam} ${scoreA} (${dataA?.total || 0}-${dataA?.stadiumBonus || 0}) vs ` +
      `${m.awayTeam} ${scoreB} (${dataB?.total || 0}-${dataB?.stadiumBonus || 0}) → ${winner}`
    )

    // Update Home Score (Col O), Away Score (Col Q), and Winner (Col S)
    updates.push({
      range: `H2H_League!O${m.sheetRow}`,
      values: [[String(scoreA)]],
    })
    updates.push({
      range: `H2H_League!Q${m.sheetRow}`,
      values: [[String(scoreB)]],
    })
    updates.push({
      range: `H2H_League!S${m.sheetRow}`,
      values: [[winner]],
    })
  }

  if (dryRun) {
    console.log(`[H2H] DRY RUN — would write ${updates.length} cells`)
    return { matches: allMatchResults, dryRun: true }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: ssId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })
    console.log(`[H2H] ✅ GW${targetGw}: wrote ${updates.length} match score/winner cells`)
  }

  return { matches: allMatchResults }
}

// ────────────────────────────────────────────────────────────────────
// 5. Recalculate H2H Standings
// ────────────────────────────────────────────────────────────────────

export async function recalculateH2HStandings({ dryRun = false } = {}) {
  console.log('\n[H2H Standings] Recalculating standings from recorded match results...')
  const fixtures = await readH2HFixtures()

  const standings = new Map()
  for (const t of [...groupATeams, ...groupBTeams]) {
    standings.set(t, { P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, GD: 0, Pts: 0 })
  }

  for (const m of fixtures) {
    if (!m.homeTeam || !m.awayTeam) continue
    if (m.homeScore === '' || m.homeScore === '-' || isNaN(Number(m.homeScore))) continue
    if (m.awayScore === '' || m.awayScore === '-' || isNaN(Number(m.awayScore))) continue

    const sA = Number(m.homeScore)
    const sB = Number(m.awayScore)

    const tA = standings.get(m.homeTeam)
    const tB = standings.get(m.awayTeam)
    if (!tA || !tB) continue

    tA.P++
    tB.P++
    tA.GF += sA
    tA.GA += sB
    tB.GF += sB
    tB.GA += sA

    if (sA > sB) {
      tA.W++
      tA.Pts += 3
      tB.L++
    } else if (sA < sB) {
      tB.W++
      tB.Pts += 3
      tA.L++
    } else {
      tA.D++
      tB.D++
      tA.Pts += 1
      tB.Pts += 1
    }
  }

  function sortGroup(teamList) {
    return [...teamList]
      .map((t) => {
        const stats = standings.get(t)
        const gd = stats.GF - stats.GA
        return { team: t, ...stats, GD: gd }
      })
      .sort((a, b) => {
        if (b.Pts !== a.Pts) return b.Pts - a.Pts
        if (b.GD !== a.GD) return b.GD - a.GD
        return b.GF - a.GF
      })
  }

  const sortedA = sortGroup(groupATeams)
  const sortedB = sortGroup(groupBTeams)

  console.log('\nGroup A Standings:')
  sortedA.forEach((t, i) => {
    console.log(`  #${i + 1} ${t.team.padEnd(18)} | P:${t.P} W:${t.W} D:${t.D} L:${t.L} | GF:${t.GF} GA:${t.GA} GD:${t.GD >= 0 ? '+' : ''}${t.GD} | Pts:${t.Pts}`)
  })

  console.log('\nGroup B Standings:')
  sortedB.forEach((t, i) => {
    console.log(`  #${i + 1} ${t.team.padEnd(18)} | P:${t.P} W:${t.W} D:${t.D} L:${t.L} | GF:${t.GF} GA:${t.GA} GD:${t.GD >= 0 ? '+' : ''}${t.GD} | Pts:${t.Pts}`)
  })

  if (dryRun) return { groupA: sortedA, groupB: sortedB }

  // Prepare batch update for Group A (Rows 5-12, A5:J12) and Group B (Rows 16-23, A16:J23)
  const updateData = []

  // Group A rows: 5 to 12
  const groupARows = sortedA.map((t, idx) => [
    idx + 1,
    t.team,
    t.P,
    t.W,
    t.D,
    t.L,
    t.GF,
    t.GA,
    t.GD,
    t.Pts,
  ])
  updateData.push({
    range: 'H2H_League!A5:J12',
    values: groupARows,
  })

  // Group B rows: 16 to 23
  const groupBRows = sortedB.map((t, idx) => [
    idx + 1,
    t.team,
    t.P,
    t.W,
    t.D,
    t.L,
    t.GF,
    t.GA,
    t.GD,
    t.Pts,
  ])
  updateData.push({
    range: 'H2H_League!A16:J23',
    values: groupBRows,
  })

  if (updateData.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: ssId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updateData },
    })
  }

  console.log('[H2H Standings] ✅ Successfully updated Group A and Group B standings tables')
  return { groupA: sortedA, groupB: sortedB }
}

// ────────────────────────────────────────────────────────────────────
// 6. Generate H2H Knockout Bracket
// ────────────────────────────────────────────────────────────────────

export async function generateH2HKnockoutBracket({ dryRun = false } = {}) {
  console.log('\n[H2H Knockout] Generating Championship Playoff bracket...')
  const { groupA, groupB } = await recalculateH2HStandings({ dryRun: true })

  if (!groupA || groupA.length < 4 || !groupB || groupB.length < 4) {
    console.log('[H2H Knockout] Not enough teams to seed playoffs (need at least 4 per group)')
    return null
  }

  const a1 = groupA[0].team
  const a2 = groupA[1].team
  const a3 = groupA[2].team
  const a4 = groupA[3].team

  const b1 = groupB[0].team
  const b2 = groupB[1].team
  const b3 = groupB[2].team
  const b4 = groupB[3].team

  console.log(`  QF1: ${a1} (A1) vs ${b4} (B4)`)
  console.log(`  QF2: ${b2} (B2) vs ${a3} (A3)`)
  console.log(`  QF3: ${b1} (B1) vs ${a4} (A4)`)
  console.log(`  QF4: ${a2} (A2) vs ${b3} (B3)`)

  const playoffRows = [
    ['QUARTER FINAL 1 (GW22)', 'QF1', `${a1} (A1)`, '-', `${b4} (B4)`, '-', 'TBD'],
    ['QUARTER FINAL 2 (GW22)', 'QF2', `${b2} (B2)`, '-', `${a3} (A3)`, '-', 'TBD'],
    ['QUARTER FINAL 3 (GW22)', 'QF3', `${b1} (B1)`, '-', `${a4} (A4)`, '-', 'TBD'],
    ['QUARTER FINAL 4 (GW22)', 'QF4', `${a2} (A2)`, '-', `${b3} (B3)`, '-', 'TBD'],
    ['', '', '', '', '', '', ''],
    ['SEMI FINAL 1 (GW26)', 'SF1', 'Winner QF1', '-', 'Winner QF2', '-', 'TBD'],
    ['SEMI FINAL 2 (GW26)', 'SF2', 'Winner QF3', '-', 'Winner QF4', '-', 'TBD'],
    ['', '', '', '', '', '', ''],
    ['GRAND FINAL (GW30)', 'FINAL', 'Winner SF1', '-', 'Winner SF2', '-', '🏆 CHAMPION'],
  ]

  if (dryRun) {
    console.log('[H2H Knockout] DRY RUN — bracket not written')
    return {
      qf1: [a1, b4],
      qf2: [b2, a3],
      qf3: [b1, a4],
      qf4: [a2, b3],
    }
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: ssId,
    range: 'H2H_League!A27:G35',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: playoffRows },
  })

  console.log('[H2H Knockout] ✅ Seeded Quarter-Finals, Semi-Finals, and Final into Playoff bracket (Rows 27-35)')
  return {
    qf1: [a1, b4],
    qf2: [b2, a3],
    qf3: [b1, a4],
    qf4: [a2, b3],
  }
}
