import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { syncFixturesDateRange } from '../src/services/fixtureService.js'
import { syncApiFootballGameweekStats } from '../src/services/apiFootballSyncService.js'
import { syncSofaScoreStaging } from '../src/services/sofaScoreSyncService.js'
import { syncComparisonDashboard } from '../src/services/dashboardService.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const targetGw = 8
const startDate = '2026-10-16'
const endDate = '2026-10-19'
const activeDates = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']

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
  console.log(`🚀 INGESTING NEWLY FINISHED GW${targetGw} MATCHES`)
  console.log(`📅 Date Window: ${startDate} to ${endDate}`)
  console.log('===========================================================\n')

  // 1. Capture Pre-Snapshot of all staging tabs
  console.log('📸 [PRE-SNAPSHOT] Verifying existing gameweek rows...')
  const preFixtureCounts = await getTabCounts('Fixture_Staging')
  const preSofaCounts = await getTabCounts('SofaScore_Staging')
  const preAfCounts = await getTabCounts('API_Football_Staging')
  console.log('  Fixture_Staging    :', JSON.stringify(preFixtureCounts))
  console.log('  SofaScore_Staging  :', JSON.stringify(preSofaCounts))
  console.log('  API_Football_Staging:', JSON.stringify(preAfCounts))

  // 2. Stage 1: Update Fixtures for GW8
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 1/4] Ingesting & Updating Fixture_Staging for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncFixturesDateRange(startDate, endDate, targetGw)

  // Verify status in Fixture_Staging
  const fixtureRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A2:J' })
  const gw8Fixtures = (fixtureRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
  const gw8Finished = gw8Fixtures.filter((r) => String(r[7] || '').trim().toUpperCase() === 'FINISHED')
  const gw8Live = gw8Fixtures.filter((r) => String(r[7] || '').trim().toUpperCase() === 'LIVE')
  const gw8Scheduled = gw8Fixtures.filter((r) => !['FINISHED', 'LIVE'].includes(String(r[7] || '').trim().toUpperCase()))
  console.log(`\n[Fixture_Staging Status] GW${targetGw} total: ${gw8Fixtures.length} | Finished: ${gw8Finished.length} | Live: ${gw8Live.length} | Scheduled: ${gw8Scheduled.length}`)

  // 3. Stage 2: Sync API-Football Staging (API-Football first for alias/id stability)
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 2/4] Syncing finished matches to API_Football_Staging for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncApiFootballGameweekStats(targetGw, activeDates)

  // 4. Stage 3: Sync SofaScore Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 3/4] Syncing finished matches to SofaScore_Staging for GW${targetGw}...`)
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

  for (const g of ['1', '2', '3', '4', '5', '6', '7']) {
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

  // 6. Stage 4: Rebuild Comparison_Dashboard for GW8
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 4/4] Updating Comparison_Dashboard for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncComparisonDashboard(targetGw)

  // 7. Audit Comparison_Dashboard
  const dashRes = await sheets.spreadsheets.values.get({
    spreadsheetId: ssId,
    range: 'Comparison_Dashboard!A1:J',
  })
  const dashData = (dashRes.data.values || []).slice(1)
  const statusCounts = {}
  const discrepancies = []
  dashData.forEach(r => {
    const st = r[6] || 'UNKNOWN'
    statusCounts[st] = (statusCounts[st] || 0) + 1
    if (st === 'DISCREPANCY') discrepancies.push(r)
  })

  console.log(`\n===========================================================`)
  console.log(`📊 COMPARISON DASHBOARD SUMMARY FOR GW${targetGw}`)
  console.log(`===========================================================`)
  console.log(`Total Players on Dashboard : ${dashData.length}`)
  console.log(`Status Breakdown          :`, statusCounts)
  console.log(`Discrepancies             : ${discrepancies.length}`)
  if (discrepancies.length > 0) {
    console.log(`\n⚠️ DISCREPANCY DETAILS:`)
    discrepancies.forEach(d => {
      console.log(`  • [${d[0]}] ${d[1]} (${d[2]} ${d[3]}): SofaScore=${d[4] || '-'}, API-Football=${d[5] || '-'} | Approved: ${d[7] || 'BLANK'}`)
    })
  }

  console.log(`\n🎉 GW${targetGw} NEW MATCHES SYNC COMPLETED SUCCESSFULLY!`)
  console.log(`   - Fixture_Staging GW${targetGw}: ${postFixtureCounts[String(targetGw)] || 0} (${gw8Finished.length} finished, ${gw8Live.length} live, ${gw8Scheduled.length} scheduled)`)
  console.log(`   - SofaScore_Staging GW${targetGw}: ${postSofaCounts[String(targetGw)] || 0} player rows`)
  console.log(`   - API_Football_Staging GW${targetGw}: ${postAfCounts[String(targetGw)] || 0} player rows`)
  console.log(`   - Comparison_Dashboard GW${targetGw}: ${dashData.length} players (${statusCounts['VERIFIED'] || 0} verified)`)
}

main().catch(console.error)
