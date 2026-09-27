import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { getCanonicalClubName, MASTER_TOP5_CLUBS } from '../src/services/fixtureService.js'
import { cleanClubName, normalizeName, getSimilarityScore } from '../src/services/rosterValidator.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const masterNormSet = new Set(MASTER_TOP5_CLUBS.map(c => normalizeName(c)))
const masterExactSet = new Set(MASTER_TOP5_CLUBS)

function isClubKnown(clubName) {
  if (!clubName) return false
  const cleaned = cleanClubName(clubName) || String(clubName).trim()
  const norm = normalizeName(cleaned)
  if (masterNormSet.has(norm)) return true

  const canonical = getCanonicalClubName(clubName)
  if (masterExactSet.has(canonical)) return true

  // Check if any master club has similarity >= 0.70
  for (const m of MASTER_TOP5_CLUBS) {
    const normM = normalizeName(m)
    if (norm.includes(normM) || normM.includes(norm)) return true
    if (getSimilarityScore(norm, normM) >= 0.70) return true
  }
  return false
}

async function run() {
  console.log('===========================================================')
  console.log('🔍 AUDITING FIXTURE_STAGING FOR UNKNOWN / MISCLUSTERED CLUBS')
  console.log('===========================================================\n')

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A2:J',
  })

  const rows = res.data.values || []
  console.log(`Scanned ${rows.length} rows from Fixture_Staging.\n`)

  const flaggedRows = []
  const unknownClubsSet = new Set()

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx]
    const rowNum = idx + 2
    const gw = String(r[0] || '').trim()
    const matchDate = String(r[1] || '').trim()
    const rawHome = String(r[3] || '').trim()
    const rawAway = String(r[4] || '').trim()
    const sofaId = String(r[5] || '').trim()
    const afId = String(r[6] || '').trim()
    const matchId = sofaId || afId || 'N/A'

    if (!rawHome && !rawAway) continue

    const cleanHome = cleanClubName(rawHome) || rawHome
    const cleanAway = cleanClubName(rawAway) || rawAway
    const canonicalHome = getCanonicalClubName(rawHome)
    const canonicalAway = getCanonicalClubName(rawAway)

    const homeKnown = isClubKnown(rawHome)
    const awayKnown = isClubKnown(rawAway)

    // Flag if either club is not known in Top 5, or if canonicalHome/Away is not in MASTER_TOP5_CLUBS
    const isHomeInvalid = !homeKnown || !masterExactSet.has(canonicalHome)
    const isAwayInvalid = !awayKnown || !masterExactSet.has(canonicalAway)
    const hasLeMans = cleanHome.toLowerCase().includes('le mans') || cleanAway.toLowerCase().includes('le mans') ||
                      rawHome.toLowerCase().includes('le mans') || rawAway.toLowerCase().includes('le mans')

    if (isHomeInvalid || isAwayInvalid || hasLeMans) {
      if (isHomeInvalid) unknownClubsSet.add(rawHome)
      if (isAwayInvalid) unknownClubsSet.add(rawAway)

      flaggedRows.push({
        rowNum,
        gw,
        matchId,
        rawHome,
        rawAway,
        canonicalHome,
        canonicalAway,
        issue: [
          isHomeInvalid ? `Unknown Home: "${rawHome}"` : null,
          isAwayInvalid ? `Unknown Away: "${rawAway}"` : null,
          hasLeMans ? 'Contains "Le Mans"' : null,
        ].filter(Boolean).join('; '),
      })
    }
  }

  if (flaggedRows.length > 0) {
    console.log(`⚠️ FOUND ${flaggedRows.length} FLAGGED ROWS IN FIXTURE_STAGING:\n`)
    console.table(flaggedRows.map(f => ({
      row: f.rowNum,
      gw: f.gw,
      matchId: f.matchId,
      rawHome: f.rawHome,
      rawAway: f.rawAway,
      canonicalHome: f.canonicalHome,
      canonicalAway: f.canonicalAway,
      issue: f.issue,
    })))
  } else {
    console.log('✅ All clubs in Fixture_Staging cleanly match MASTER_TOP5_CLUBS!')
  }

  console.log('\n===========================================================')
  console.log('📊 SUMMARY')
  console.log('===========================================================')
  console.log(`Total rows scanned: ${rows.length}`)
  console.log(`Rows with unknown/misclustered clubs: ${flaggedRows.length}`)
  console.log(`Unique unknown club names: ${unknownClubsSet.size > 0 ? Array.from(unknownClubsSet).join(', ') : 'None'}`)
}

run().catch(err => {
  console.error('Error running checkUnknownClubs:', err)
  process.exit(1)
})
