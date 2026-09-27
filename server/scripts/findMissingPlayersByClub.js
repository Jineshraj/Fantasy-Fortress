/**
 * For each "missing from Players tab" player, find the best match in Players
 * tab by:
 *   1. Same club (after normalization)
 *   2. Token overlap (any token from the staging name appears in the Players name, or vice versa)
 *
 * Read-only — just reports. No edits.
 */
import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { normalizeName } from '../src/services/rosterValidator.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const targetGw = Number(process.argv[2]) || 3

// Load Players tab
const playersRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Players!A2:E' })
const playerRows = playersRes.data.values || []
// Build: name (normalized) → {rowIdx, name, pos, club}
const playersByNorm = new Map()
const playersByClub = new Map()
for (let i = 0; i < playerRows.length; i++) {
  const r = playerRows[i]
  const name = String(r[1] || '').trim()
  const pos = String(r[3] || 'MID').trim().toUpperCase()
  const club = String(r[4] || '').trim()
  if (!name) continue
  const norm = normalizeName(name)
  playersByNorm.set(norm, { rowIdx: i + 2, name, pos, club, norm })
  const c = normalizeName(club)
  if (!playersByClub.has(c)) playersByClub.set(c, [])
  playersByClub.get(c).push({ rowIdx: i + 2, name, pos, club, norm })
}

// Load SofaScore_Staging GW3
const sofaRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'SofaScore_Staging!A2:N' })
const sofaRows = (sofaRes.data.values || []).filter(r => String(r[0]).trim() === String(targetGw))

// Find unique (player, club) combos from staging that are missing from Players
const missing = new Map() // key = staging-norm-name + '|' + staging-norm-club → {player, club}
for (const r of sofaRows) {
  const player = String(r[2] || '').trim()
  const club = String(r[3] || '').trim()
  if (!player) continue
  const normP = normalizeName(player)
  if (playersByNorm.has(normP)) continue
  const key = normP + '|' + normalizeName(club)
  if (!missing.has(key)) missing.set(key, { player, club, norm: normP })
}

console.log('===========================================================')
console.log(`🔍 CLUB-AWARE LOOKUP for ${missing.size} missing players (GW${targetGw})`)
console.log('===========================================================\n')

let exactClubMatch = 0
let fuzzyClubMatch = 0
let noClubMatch = 0

function findBestInClub(stagingName, stagingClub) {
  const normClub = normalizeName(stagingClub)
  // Try exact normalized club
  if (playersByClub.has(normClub)) {
    return playersByClub.get(normClub)
  }
  // Fuzzy: any Players tab club whose normalized name contains the staging club or vice versa
  const candidates = []
  for (const [c, players] of playersByClub.entries()) {
    if (c.includes(normClub) || normClub.includes(c)) {
      candidates.push(...players)
    }
  }
  return candidates.length > 0 ? candidates : null
}

function tokenOverlap(stagingName, playersTabName) {
  const ns = normalizeName(stagingName).split(/\s+/).filter(t => t.length >= 3)
  const np = normalizeName(playersTabName).split(/\s+/).filter(t => t.length >= 3)
  if (ns.length === 0 || np.length === 0) return 0
  let matches = 0
  for (const t of ns) {
    if (np.includes(t)) matches++
    else if (np.some(p => p.startsWith(t) || t.startsWith(p))) matches += 0.8
  }
  return matches / Math.max(ns.length, 1)
}

// Sort by club for easier reading
const sorted = Array.from(missing.values()).sort((a, b) => a.club.localeCompare(b.club))

for (const m of sorted) {
  const candidates = findBestInClub(m.player, m.club)
  if (!candidates) {
    noClubMatch++
    console.log(`❌ ${m.player.padEnd(35)} (${m.club}) — no Players tab club match`)
    continue
  }
  // Score by token overlap
  const scored = candidates.map(c => ({ ...c, score: tokenOverlap(m.player, c.name) }))
    .filter(c => c.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
  if (scored.length === 0) {
    noClubMatch++
    console.log(`⚠️  ${m.player.padEnd(35)} (${m.club}) — club match but no name-token match`)
    continue
  }
  if (scored[0].score >= 0.9) exactClubMatch++
  else fuzzyClubMatch++
  const marks = scored[0].score >= 0.9 ? '✓' : '~'
  console.log(`${marks}  ${m.player.padEnd(35)} (${m.club})`)
  for (const s of scored) {
    console.log(`     → ${s.name} (${s.pos}, score=${s.score.toFixed(2)})`)
  }
}

console.log('\n===========================================================')
console.log('SUMMARY')
console.log('===========================================================')
console.log(`Total missing from Players tab: ${missing.size}`)
console.log(`  Strong matches (score ≥ 0.9): ${exactClubMatch}`)
console.log(`  Fuzzy matches (score 0.5–0.9): ${fuzzyClubMatch}`)
console.log(`  No usable match:                ${noClubMatch}`)