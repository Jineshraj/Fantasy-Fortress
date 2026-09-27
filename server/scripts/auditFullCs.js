/**
 * Full audit of SofaScore_Staging GW3 clean sheets.
 * Checks BOTH directions:
 *   A. CS=TRUE but team actually conceded (FAKE CS — over-counts pts by +4/+5)
 *   B. CS=FALSE but team actually kept a CS (MISSED CS — under-counts pts by -4/-5)
 *
 * Cross-references with Fixture_Staging for actual scores.
 * Read-only — no edits.
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { normalizeName } from '../src/services/rosterValidator.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const targetGw = Number(process.argv[2]) || 3

// Build fixture map: match_id → { home, away, homeScore, awayScore, status }
const fixRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A1:J' })
const fixRows = (fixRes.data.values || []).slice(1).filter(r => String(r[0]).trim() === String(targetGw))
const fixtureById = new Map()
for (const f of fixRows) {
  const sofaId = String(f[5] || '').trim()
  const afId = String(f[6] || '').trim()
  const fix = {
    home: String(f[3] || '').trim(),
    away: String(f[4] || '').trim(),
    homeScore: Number(f[8]),
    awayScore: Number(f[9]),
    status: String(f[7] || '').trim().toUpperCase(),
  }
  if (sofaId) fixtureById.set(sofaId, fix)
  if (afId) fixtureById.set(afId, fix)
}

// Load Players tab for positions
const playersRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Players!A2:E' })
const playerPos = new Map()
for (const r of (playersRes.data.values || [])) {
  const name = String(r[1] || '').trim()
  const pos = String(r[3] || 'MID').trim().toUpperCase()
  if (name) playerPos.set(normalizeName(name), pos)
}

function normalizeClubPair(stagingClub, fixtureClub) {
  if (!stagingClub || !fixtureClub) return false
  const s = normalizeName(stagingClub).replace(/\s+(fc|cf|sc|afc)$/g, '').trim()
  const f = normalizeName(fixtureClub).replace(/\s+(fc|cf|sc|afc)$/g, '').trim()
  return s === f || s.includes(f) || f.includes(s)
}

const sofaRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'SofaScore_Staging!A1:N' })
const rows = (sofaRes.data.values || []).slice(1).filter(r => String(r[0]).trim() === String(targetGw))

console.log(`Total GW${targetGw} rows: ${rows.length}`)
console.log(`Total GW${targetGw} fixtures: ${fixtureById.size}\n`)

// === A. CS=TRUE but team actually conceded (FAKE CS — over-counts) ===
const fakeCS = [] // rows where cs=TRUE but team conceded >0
for (const r of rows) {
  const cs = String(r[7] || '').trim().toUpperCase() === 'TRUE'
  if (!cs) continue
  const matchId = String(r[1]).trim()
  const club = String(r[3] || '').trim()
  const fix = fixtureById.get(matchId)
  if (!fix) continue
  if (fix.homeScore === null || fix.awayScore === null) continue
  // Determine which team this player is on
  const isHome = normalizeClubPair(club, fix.home)
  const isAway = normalizeClubPair(club, fix.away)
  if (!isHome && !isAway) continue
  const teamConceded = isHome ? fix.awayScore : fix.homeScore
  if (teamConceded > 0) {
    fakeCS.push({ matchId, player: r[2], club, teamConceded, score: `${fix.homeScore}-${fix.awayScore}`, isHome, pts: r[13] })
  }
}

console.log(`🚨 A. FAKE CS (CS=TRUE but team conceded): ${fakeCS.length}`)
for (const f of fakeCS.slice(0, 30)) {
  console.log(`   ${f.matchId} ${f.player} (${f.club}, ${f.isHome ? 'HOME' : 'AWAY'}) team conceded ${f.teamConceded} (${f.score}) pts=${f.pts}`)
}
if (fakeCS.length > 30) console.log(`   ... and ${fakeCS.length - 30} more`)

// === B. CS=FALSE but team kept a CS (MISSED CS — under-counts) ===
const missedCS = [] // rows where cs=FALSE but team conceded 0 AND player is GK/DEF
for (const r of rows) {
  const cs = String(r[7] || '').trim().toUpperCase() === 'TRUE'
  if (cs) continue
  const matchId = String(r[1]).trim()
  const club = String(r[3] || '').trim()
  const minutes = Number(r[4] || 0)
  const player = String(r[2] || '').trim()
  const pos = playerPos.get(normalizeName(player))
  if (pos !== 'GK' && pos !== 'DEF') continue
  if (minutes < 60) continue

  const fix = fixtureById.get(matchId)
  if (!fix) continue
  if (fix.homeScore === null || fix.awayScore === null) continue
  if (fix.status !== 'FINISHED') continue
  const isHome = normalizeClubPair(club, fix.home)
  const isAway = normalizeClubPair(club, fix.away)
  if (!isHome && !isAway) continue
  const teamConceded = isHome ? fix.awayScore : fix.homeScore
  if (teamConceded === 0) {
    missedCS.push({ matchId, player, club, pos, isHome, score: `${fix.homeScore}-${fix.awayScore}`, pts: r[13] })
  }
}

console.log(`\n🚨 B. MISSED CS (CS=FALSE but team kept CS): ${missedCS.length}`)
for (const m of missedCS.slice(0, 30)) {
  console.log(`   ${m.matchId} ${m.player} (${m.club}, ${m.pos}, ${m.isHome ? 'HOME' : 'AWAY'}) team=${m.score} pts=${m.pts}`)
}
if (missedCS.length > 30) console.log(`   ... and ${missedCS.length - 30} more`)

console.log(`\n📊 SUMMARY: ${fakeCS.length} fake-CS + ${missedCS.length} missed-CS`)