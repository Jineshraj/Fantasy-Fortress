/**
 * Super Cup scoring service.
 *
 * Rules:
 *  - 16-team single-elimination bracket
 *  - 4 rounds: R16 (8 matches, GW5), QF (4 matches, GW8), SF (2 matches, GW11), Final (1 match, GW15)
 *  - Each match uses Lineup_Rosters for that GW
 *  - Sum of 11 effective players' final_pts (no stadium bonus)
 *  - Higher score advances; tie = admin manually types winner
 *  - Winner cell is auto-filled when scores differ; left empty for admin on ties
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName } from './rosterValidator.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

// ────────────────────────────────────────────────────────────────────
// 1. Reuse from h2hScoringService
// ────────────────────────────────────────────────────────────────────

import { readLineupsForGw, readDashboardForGw, computeTeamScore, getTeamH2HScores } from './h2hScoringService.js'

// ────────────────────────────────────────────────────────────────────
// 2. Bracket Progression Mapping & Reading
// ────────────────────────────────────────────────────────────────────

export const BRACKET_FEEDERS = {
  QF1: { home: 'M1', away: 'M2' },
  QF2: { home: 'M3', away: 'M4' },
  QF3: { home: 'M5', away: 'M6' },
  QF4: { home: 'M7', away: 'M8' },
  SF1: { home: 'QF1', away: 'QF2' },
  SF2: { home: 'QF3', away: 'QF4' },
  FINAL: { home: 'SF1', away: 'SF2' },
}

export const BRACKET_CARD_COORDINATES = {
  M1: { colStart: 8, colEnd: 10, homeRow: 4, awayRow: 5 },
  M2: { colStart: 8, colEnd: 10, homeRow: 6, awayRow: 7 },
  M3: { colStart: 8, colEnd: 10, homeRow: 8, awayRow: 9 },
  M4: { colStart: 8, colEnd: 10, homeRow: 10, awayRow: 11 },
  M5: { colStart: 8, colEnd: 10, homeRow: 12, awayRow: 13 },
  M6: { colStart: 8, colEnd: 10, homeRow: 14, awayRow: 15 },
  M7: { colStart: 8, colEnd: 10, homeRow: 16, awayRow: 17 },
  M8: { colStart: 8, colEnd: 10, homeRow: 18, awayRow: 19 },
  QF1: { colStart: 11, colEnd: 13, homeRow: 5, awayRow: 6 },
  QF2: { colStart: 11, colEnd: 13, homeRow: 9, awayRow: 10 },
  QF3: { colStart: 11, colEnd: 13, homeRow: 13, awayRow: 14 },
  QF4: { colStart: 11, colEnd: 13, homeRow: 17, awayRow: 18 },
  SF1: { colStart: 14, colEnd: 16, homeRow: 7, awayRow: 8 },
  SF2: { colStart: 14, colEnd: 16, homeRow: 15, awayRow: 16 },
  FINAL: { colStart: 17, colEnd: 19, homeRow: 11, awayRow: 12 },
}

/**
 * Read Super_Cup bracket. Returns:
 *  - stages: [{ stage, matchId, gw, homeTeam, awayTeam, winner, sheetRow }]
 *  - matchId -> sheetRow index for quick lookup
 */
async function readSuperCupBracket() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: 'Super_Cup!A5:G30',
  })
  const rows = res.data.values || []
  const stages = []
  const matchIdToRow = new Map()
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length < 3) continue
    const stage = String(r[0] || '').trim()
    const matchId = String(r[1] || '').trim()
    const homeTeam = String(r[2] || '').trim()
    const awayTeam = String(r[3] || '').trim()
    const winner = String(r[6] || '').trim()
    if (!stage) continue
    // Parse GW from stage name
    const gwMatch = stage.match(/GW(\d+)/)
    const gw = gwMatch ? Number(gwMatch[1]) : null
    const sheetRow = i + 5
    const stageRecord = { stage, matchId, gw, homeTeam, awayTeam, winner, sheetRow }
    stages.push(stageRecord)
    if (matchId) matchIdToRow.set(matchId, stageRecord)
  }
  return { stages, matchIdToRow }
}

// ────────────────────────────────────────────────────────────────────
// 3. Propagate winners into downstream matches
// ────────────────────────────────────────────────────────────────────

/**
 * Walk through the bracket and advance decided winners into downstream rounds:
 *  - Matches M1..M8 feed QF1..QF4
 *  - QF1..QF4 feed SF1..SF2
 *  - SF1..SF2 feed FINAL
 */
async function propagateWinners(stages, matchIdToRow) {
  // Build a map: matchId -> winner
  const winners = new Map()
  for (const s of stages) {
    if (s.winner && s.winner !== 'TIE' && s.winner !== '🏆 TBD' && s.winner !== '-') {
      winners.set(s.matchId, s.winner)
    }
  }

  const updates = []
  for (const s of stages) {
    let changed = false
    let newHome = s.homeTeam
    let newAway = s.awayTeam

    // Check deterministic feeder mapping first
    const feeder = BRACKET_FEEDERS[s.matchId]
    if (feeder) {
      if (winners.has(feeder.home)) {
        const hWinner = winners.get(feeder.home)
        if (newHome !== hWinner) {
          newHome = hWinner
          changed = true
        }
      }
      if (winners.has(feeder.away)) {
        const aWinner = winners.get(feeder.away)
        if (newAway !== aWinner) {
          newAway = aWinner
          changed = true
        }
      }
    }

    // Also support regex placeholder fallback ("Winner M1", etc.)
    const homeMatch = newHome.match(/^Winner (M|QF|SF)(\d+)$/i)
    if (homeMatch) {
      const id = `${homeMatch[1].toUpperCase()}${homeMatch[2]}`
      if (winners.has(id)) {
        newHome = winners.get(id)
        changed = true
      }
    }
    const awayMatch = newAway.match(/^Winner (M|QF|SF)(\d+)$/i)
    if (awayMatch) {
      const id = `${awayMatch[1].toUpperCase()}${awayMatch[2]}`
      if (winners.has(id)) {
        newAway = winners.get(id)
        changed = true
      }
    }

    if (changed) {
      s.homeTeam = newHome
      s.awayTeam = newAway
      updates.push({ sheetRow: s.sheetRow, home: newHome, away: newAway })
    }
  }

  if (updates.length > 0) {
    const data = updates.map((u) => ({
      range: `Super_Cup!C${u.sheetRow}:D${u.sheetRow}`,
      values: [[u.home, u.away]],
    }))
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: ssId,
      requestBody: { valueInputOption: 'USER_ENTERED', data },
    })
    console.log(`[SuperCup] ✅ Propagated ${updates.length} qualified matchups into next bracket round(s)!`)
  }
  return updates.length
}

// ────────────────────────────────────────────────────────────────────
// 4. Apply Visual Formatting for Winners & Advancing Bracket Tree
// ────────────────────────────────────────────────────────────────────

export async function applySuperCupWinnerFormatting(stages) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
    const scSheet = meta.data.sheets.find((s) => s.properties.title === 'Super_Cup')
    if (!scSheet) return
    const sheetId = scSheet.properties.sheetId

    const formatRequests = []

    for (const s of stages) {
      const winner = s.winner
      if (!winner || winner === 'TIE' || winner === '-' || winner === '🏆 TBD') continue

      const rowIndex = s.sheetRow - 1 // 0-indexed row

      // 1. Highlight Winner Badge in Column G (index 6..7)
      formatRequests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 6, endColumnIndex: 7 },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.85, green: 0.95, blue: 0.88 }, // Soft emerald #E8F5E9
              textFormat: {
                foregroundColor: { red: 0.06, green: 0.38, blue: 0.13 }, // Dark green #1B5E20
                bold: true,
              },
              horizontalAlignment: 'CENTER',
              verticalAlignment: 'MIDDLE',
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
        },
      })

      // 2. Bold the winning team and score in the master table
      const isHomeWinner = winner === s.homeTeam
      const isAwayWinner = winner === s.awayTeam

      if (isHomeWinner) {
        formatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 2, endColumnIndex: 3 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        })
        formatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 4, endColumnIndex: 5 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        })
      } else if (isAwayWinner) {
        formatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 3, endColumnIndex: 4 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        })
        formatRequests.push({
          repeatCell: {
            range: { sheetId, startRowIndex: rowIndex, endRowIndex: rowIndex + 1, startColumnIndex: 5, endColumnIndex: 6 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        })
      }

      // 3. Highlight Winner in the Visual Bracket Tree Card (Columns I-S)
      const coords = BRACKET_CARD_COORDINATES[s.matchId]
      if (coords) {
        const winRow = isHomeWinner ? coords.homeRow : coords.awayRow
        const loseRow = isHomeWinner ? coords.awayRow : coords.homeRow

        // Winning team card in bracket: soft victory green with dark green bold text
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: winRow,
              endRowIndex: winRow + 1,
              startColumnIndex: coords.colStart,
              endColumnIndex: coords.colEnd,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.86, green: 0.99, blue: 0.90 }, // Soft Mint Green #DCFCE7
                textFormat: {
                  foregroundColor: { red: 0.08, green: 0.40, blue: 0.20 }, // #166534
                  bold: true,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        })

        // Defeated team card in bracket: subtle muted gray
        formatRequests.push({
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: loseRow,
              endRowIndex: loseRow + 1,
              startColumnIndex: coords.colStart,
              endColumnIndex: coords.colEnd,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.96, blue: 0.98 }, // Subtle #F1F5F9
                textFormat: {
                  foregroundColor: { red: 0.45, green: 0.50, blue: 0.58 }, // Muted #64748B
                  bold: false,
                },
              },
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat)',
          },
        })
      }
    }

    if (formatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: ssId,
        requestBody: { requests: formatRequests },
      })
      console.log(`[SuperCup] 🎨 Applied winner badge & bracket tree highlighting for ${stages.filter((s) => s.winner).length} match(es)!`)
    }
  } catch (err) {
    console.warn('[SuperCup] Warning applying formatting:', err.message)
  }
}

// ────────────────────────────────────────────────────────────────────
// 5. Compute scores for a single GW
// ────────────────────────────────────────────────────────────────────

/**
 * Sync Super Cup for a single GW. For each match scheduled in that GW:
 *  1. Compute each team's score (using lineups + dashboard)
 *  2. If scores differ, fill in the Winner column automatically
 *  3. If scores are tied, leave Winner empty (admin decides)
 *  4. Propagate winners into downstream bracket stages (e.g. R16 -> QF)
 *  5. Apply winner badge & bracket card visual formatting
 */
export async function syncSuperCupForGw(targetGw, { dryRun = false } = {}) {
  console.log(`\n[SuperCup] Syncing GW${targetGw}...`)
  const { stages, matchIdToRow } = await readSuperCupBracket()

  // Filter to matches for this GW
  const gwMatches = stages.filter((s) => s.gw === targetGw)
  if (gwMatches.length === 0) {
    console.log(`[SuperCup] No matches found for GW${targetGw}`)
    return { matches: [], propagated: 0 }
  }

  // Read team scores (Total Points minus Stadium Bonus), lineups, and dashboard
  const teamScores = await getTeamH2HScores(targetGw)
  const lineups = await readLineupsForGw(targetGw)
  const dashboardPts = await readDashboardForGw(targetGw)

  // First, propagate any prior winners
  let propagated = 0
  if (!dryRun) {
    propagated += await propagateWinners(stages, matchIdToRow)
  }

  // Then, score each match for target GW
  const results = []
  const updates = []
  for (const m of gwMatches) {
    if (!m.homeTeam || !m.awayTeam || m.homeTeam.startsWith('Winner') || m.awayTeam.startsWith('Winner') || m.homeTeam === '-' || m.awayTeam === '-') {
      console.log(`  [${m.matchId}] SKIP: not yet resolved (unassigned match)`)
      continue
    }
    const dataA = teamScores.get(m.homeTeam)
    const dataB = teamScores.get(m.awayTeam)
    const rA = lineups.get(m.homeTeam) || []
    const rB = lineups.get(m.awayTeam) || []

    const scoreA = dataA?.hasData ? dataA.h2hScore : computeTeamScore(rA, dashboardPts).score
    const scoreB = dataB?.hasData ? dataB.h2hScore : computeTeamScore(rB, dashboardPts).score

    let winner = ''
    let status = 'PENDING'
    if (scoreA > 0 || scoreB > 0) {
      // We have valid scores — determine winner
      if (scoreA > scoreB) winner = m.homeTeam
      else if (scoreA < scoreB) winner = m.awayTeam
      else winner = 'TIE' // admin to decide
      status = winner === 'TIE' ? 'TIE — admin decides' : 'COMPLETED'
    }
    console.log(`  [${m.matchId}] ${m.homeTeam} ${scoreA} vs ${m.awayTeam} ${scoreB} → ${winner || 'pending data'}`)
    results.push({ matchId: m.matchId, homeTeam: m.homeTeam, awayTeam: m.awayTeam, scoreA, scoreB, winner, status })
    if (!dryRun) {
      // Write scores in cols E (home score) and F (away score); winner in col G
      updates.push({ range: `Super_Cup!E${m.sheetRow}:G${m.sheetRow}`, values: [[String(scoreA), String(scoreB), winner]] })
      // Also update the match's cached winner for downstream propagation
      m.winner = winner
    }
  }

  if (!dryRun && updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: ssId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
    })
    console.log(`[SuperCup] ✅ GW${targetGw}: wrote ${updates.length} match updates`)

    // Propagate newly decided winners into downstream rounds (e.g. QF)
    propagated += await propagateWinners(stages, matchIdToRow)

    // Apply visual formatting for winning team badges and bracket tree cards
    await applySuperCupWinnerFormatting(stages)
  } else if (dryRun) {
    console.log(`[SuperCup] DRY RUN — would write ${updates.length} match updates`)
  }
  return { matches: results, propagated }
}

// ────────────────────────────────────────────────────────────────────
// 6. Bracket overview (helper for status reporting)
// ────────────────────────────────────────────────────────────────────

export async function getBracketSummary() {
  const { stages } = await readSuperCupBracket()
  const summary = { total: stages.length, byStage: {} }
  for (const s of stages) {
    if (!summary.byStage[s.stage]) summary.byStage[s.stage] = 0
    summary.byStage[s.stage]++
  }
  return summary
}

