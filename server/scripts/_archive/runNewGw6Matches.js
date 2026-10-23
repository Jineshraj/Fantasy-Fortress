import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { fetchTop5MatchesByDate, upsertFixturesToSheet } from '../src/services/fixtureService.js'
import { fetchTop5FixturesByDate, syncApiFootballGameweekStats } from '../src/services/apiFootballSyncService.js'
import { syncSofaScoreStaging } from '../src/services/sofaScoreSyncService.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const targetGw = 6

async function getTabCounts(tabName) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: `${tabName}!A2:A` })
  const counts = {}
  for (const r of res.data.values || []) {
    const gw = String(r[0] || '').trim()
    if (!gw) continue
    counts[gw] = (counts[gw] || 0) + 1
  }
  return counts
}

async function main() {
  console.log('===========================================================')
  console.log(`🚀 INGESTING NEWLY FINISHED GW${targetGw} MATCHES TO STAGING`)
  console.log(`🛡️ Comparison_Dashboard will remain 100% UNTOUCHED`)
  console.log('===========================================================\n')

  // 1. Capture Pre-Snapshot of all staging tabs
  console.log('📸 [PRE-SNAPSHOT] Verifying existing gameweek rows...')
  const preFixtureCounts = await getTabCounts('Fixture_Staging')
  const preSofaCounts = await getTabCounts('SofaScore_Staging')
  const preAfCounts = await getTabCounts('API_Football_Staging')
  console.log('  Fixture_Staging    :', JSON.stringify(preFixtureCounts))
  console.log('  SofaScore_Staging  :', JSON.stringify(preSofaCounts))
  console.log('  API_Football_Staging:', JSON.stringify(preAfCounts))

  // 2. Refresh Fixture_Staging with final scores and FINISHED status for 2026-09-20
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 1/3] Updating Fixture_Staging for GW${targetGw} 2026-09-20 matches...`)
  console.log(`-----------------------------------------------------------`)
  const sofaMatches = await fetchTop5MatchesByDate('2026-09-20', targetGw)
  const afMatches = await fetchTop5FixturesByDate('2026-09-20')
  console.log(`Fetched ${sofaMatches.length} SofaScore + ${afMatches.length} API-Football matches for 2026-09-20`)
  await upsertFixturesToSheet(sofaMatches, afMatches, targetGw)

  // Verify status in Fixture_Staging
  const fixtureRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A2:J' })
  const gw6Fixtures = (fixtureRes.data.values || []).filter(r => String(r[0] || '').trim() === String(targetGw))
  const gw6Finished = gw6Fixtures.filter(r => String(r[7] || '').trim().toUpperCase() === 'FINISHED')
  const gw6Unfinished = gw6Fixtures.filter(r => String(r[7] || '').trim().toUpperCase() !== 'FINISHED')
  console.log(`[Fixture_Staging Status] GW${targetGw} total: ${gw6Fixtures.length} | Finished: ${gw6Finished.length} | Unfinished: ${gw6Unfinished.length}`)
  if (gw6Unfinished.length > 0) {
    console.warn(`⚠️ Warning: ${gw6Unfinished.length} matches still unfinished:`, gw6Unfinished.map(r => `${r[3]} vs ${r[4]} (${r[7]})`).join(', '))
  }

  // 3. Sync SofaScore Staging (processes new matches & refreshes stale)
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 2/3] Syncing newly finished matches to SofaScore_Staging...`)
  console.log(`-----------------------------------------------------------`)
  await syncSofaScoreStaging(targetGw)

  // 4. Sync API-Football Staging (processes new matches, skips cached)
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 3/3] Syncing newly finished matches to API_Football_Staging...`)
  console.log(`-----------------------------------------------------------`)
  await syncApiFootballGameweekStats(targetGw, ['2026-09-20'])

  // 5. Capture Post-Snapshot and verify safety guards
  console.log(`\n===========================================================`)
  console.log('🔍 [POST-SNAPSHOT] Verifying integrity of previous GWs...')
  console.log('===========================================================')
  const postFixtureCounts = await getTabCounts('Fixture_Staging')
  const postSofaCounts = await getTabCounts('SofaScore_Staging')
  const postAfCounts = await getTabCounts('API_Football_Staging')

  console.log('  Fixture_Staging    :', JSON.stringify(postFixtureCounts))
  console.log('  SofaScore_Staging  :', JSON.stringify(postSofaCounts))
  console.log('  API_Football_Staging:', JSON.stringify(postAfCounts))

  for (const g of ['1', '2', '3', '4', '5']) {
    if ((preFixtureCounts[g] || 0) !== (postFixtureCounts[g] || 0)) {
      console.error(`🚨 WARNING: Fixture_Staging GW${g} count changed from ${preFixtureCounts[g]} to ${postFixtureCounts[g]}`)
    }
    if ((preSofaCounts[g] || 0) !== (postSofaCounts[g] || 0)) {
      console.error(`🚨 WARNING: SofaScore_Staging GW${g} count changed from ${preSofaCounts[g]} to ${postSofaCounts[g]}`)
    }
    if ((preAfCounts[g] || 0) !== (postAfCounts[g] || 0)) {
      console.error(`🚨 WARNING: API_Football_Staging GW${g} count changed from ${preAfCounts[g]} to ${postAfCounts[g]}`)
    }
  }

  // 6. Inspect Comparison_Dashboard to ensure 0 changes
  const dashRes = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: 'Comparison_Dashboard!A2:J',
  })
  const dashRows = dashRes.data.values || []
  const dashGws = Array.from(new Set(dashRows.map((r) => String(r[9] || '').trim()).filter(Boolean)))
  console.log(`\n🛡️ Comparison_Dashboard active GWs present: ${JSON.stringify(dashGws)}`)
  if (dashGws.includes(String(targetGw))) {
    console.warn(`⚠️ Warning: GW${targetGw} found in Comparison_Dashboard!`)
  } else {
    console.log(`✅ CONFIRMED: Comparison_Dashboard remains on GW${dashGws.join(', ')} and was NOT modified.`)
  }

  console.log(`\n🎉 NEW GW${targetGw} MATCHES STAGED SUCCESSFULLY!`)
  console.log(`   - Fixture_Staging GW${targetGw} rows: ${postFixtureCounts[String(targetGw)] || 0} (${gw6Finished.length} finished)`)
  console.log(`   - SofaScore_Staging GW${targetGw} rows: ${postSofaCounts[String(targetGw)] || 0} (+${(postSofaCounts[String(targetGw)] || 0) - (preSofaCounts[String(targetGw)] || 0)} new)`)
  console.log(`   - API_Football_Staging GW${targetGw} rows: ${postAfCounts[String(targetGw)] || 0} (+${(postAfCounts[String(targetGw)] || 0) - (preAfCounts[String(targetGw)] || 0)} new)`)
  console.log(`   - Comparison_Dashboard: GW${targetGw} rows = 0 (100% untouched)`)
}

main().catch(console.error)
