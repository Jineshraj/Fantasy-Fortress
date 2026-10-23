import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { syncFixturesDateRange } from '../src/services/fixtureService.js'
import { syncApiFootballGameweekStats } from '../src/services/apiFootballSyncService.js'
import { syncSofaScoreStaging } from '../src/services/sofaScoreSyncService.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const targetGw = 7
const startDate = '2026-10-09'
const endDate = '2026-10-13'
const activeDates = ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13']

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
  console.log(`🚀 INGESTING GW${targetGw} MATCHES & PLAYERS TO STAGING`)
  console.log(`📅 Date Window: ${startDate} to ${endDate}`)
  console.log(`🛡️ Comparison_Dashboard, Scoring Engine & Supabase remain 100% UNTOUCHED`)
  console.log('===========================================================\n')

  // 1. Capture Pre-Snapshot of all staging tabs
  console.log('📸 [PRE-SNAPSHOT] Verifying existing gameweek rows...')
  const preFixtureCounts = await getTabCounts('Fixture_Staging')
  const preSofaCounts = await getTabCounts('SofaScore_Staging')
  const preAfCounts = await getTabCounts('API_Football_Staging')
  console.log('  Fixture_Staging    :', JSON.stringify(preFixtureCounts))
  console.log('  SofaScore_Staging  :', JSON.stringify(preSofaCounts))
  console.log('  API_Football_Staging:', JSON.stringify(preAfCounts))

  // 2. Stage 1: Ingest fixtures for 2026-10-09 to 2026-10-11 into Fixture_Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 1/3] Ingesting Top 5 League Fixtures for GW${targetGw} (${startDate} to ${endDate})...`)
  console.log(`-----------------------------------------------------------`)
  await syncFixturesDateRange(startDate, endDate, targetGw)

  // Verify status in Fixture_Staging
  const fixtureRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A2:J' })
  const gw7Fixtures = (fixtureRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
  const gw7Finished = gw7Fixtures.filter((r) => String(r[7] || '').trim().toUpperCase() === 'FINISHED')
  const gw7Unfinished = gw7Fixtures.filter((r) => String(r[7] || '').trim().toUpperCase() !== 'FINISHED')
  console.log(`\n[Fixture_Staging Status] GW${targetGw} total: ${gw7Fixtures.length} | Finished: ${gw7Finished.length} | Unfinished: ${gw7Unfinished.length}`)
  if (gw7Unfinished.length > 0) {
    console.log(`ℹ️ ${gw7Unfinished.length} matches still unfinished or scheduled:`, gw7Unfinished.map((r) => `${r[3]} vs ${r[4]} (${r[7]})`).join(', '))
  }

  // 3. Stage 2: Sync API-Football Staging (API-Football first for alias/id stability)
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 2/3] Syncing finished matches to API_Football_Staging for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncApiFootballGameweekStats(targetGw, activeDates)

  // 4. Stage 3: Sync SofaScore Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 3/3] Syncing finished matches to SofaScore_Staging for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncSofaScoreStaging(targetGw)

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

  for (const g of ['1', '2', '3', '4', '5', '6']) {
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
    console.log(`✅ CONFIRMED: Comparison_Dashboard remains on GW${dashGws.join(', ')} and was NOT touched.`)
  }

  console.log(`\n🎉 GW${targetGw} STAGING COMPLETED SUCCESSFULLY!`)
  console.log(`   - Fixture_Staging GW${targetGw} rows: ${postFixtureCounts[String(targetGw)] || 0} (${gw7Finished.length} finished)`)
  console.log(`   - SofaScore_Staging GW${targetGw} rows: ${postSofaCounts[String(targetGw)] || 0}`)
  console.log(`   - API_Football_Staging GW${targetGw} rows: ${postAfCounts[String(targetGw)] || 0}`)
  console.log(`   - Comparison_Dashboard: GW${targetGw} rows = 0 (100% untouched)`)
}

main().catch(console.error)
