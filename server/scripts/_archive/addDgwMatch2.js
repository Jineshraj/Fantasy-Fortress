import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { syncApiFootballGameweekStats } from '../src/services/apiFootballSyncService.js'
import { syncSofaScoreStaging } from '../src/services/sofaScoreSyncService.js'
import { syncComparisonDashboard } from '../src/services/dashboardService.js'
import { calculateAndSyncTeamScores } from '../src/services/scoringEngine.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

const targetGw = 8
const activeDates = ['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21']

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
  console.log(`🚀 ADDING DGW MATCH 2: LEVANTE UD vs ATHLETIC BILBAO TO GW${targetGw}`)
  console.log('===========================================================\n')

  // 1. Capture Pre-Snapshot of all staging tabs
  console.log('📸 [PRE-SNAPSHOT] Verifying existing gameweek rows...')
  const preFixtureCounts = await getTabCounts('Fixture_Staging')
  const preSofaCounts = await getTabCounts('SofaScore_Staging')
  const preAfCounts = await getTabCounts('API_Football_Staging')
  console.log('  Fixture_Staging    :', JSON.stringify(preFixtureCounts))
  console.log('  SofaScore_Staging  :', JSON.stringify(preSofaCounts))
  console.log('  API_Football_Staging:', JSON.stringify(preAfCounts))

  // 2. Add 49th fixture to Fixture_Staging for GW8
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 1/5] Adding Levante UD vs Athletic Bilbao to Fixture_Staging...`)
  console.log(`-----------------------------------------------------------`)

  const fixRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A1:J' })
  const allRows = fixRes.data.values || []
  const header = allRows[0] || ['gameweek', 'match_date', 'league', 'home_club', 'away_club', 'sofascore_id', 'api_football_id', 'status', 'home_score', 'away_score']
  const dataRows = allRows.slice(1)

  const levanteAthleticAfId = '1570389'
  const alreadyInGw8 = dataRows.some(r => String(r[0]).trim() === String(targetGw) && String(r[6] || '').trim() === levanteAthleticAfId)

  if (!alreadyInGw8) {
    console.log(`Adding 49th fixture to GW${targetGw}: Levante UD vs Athletic Bilbao (AF: 1570389, Sofa: 17122851)...`)
    dataRows.push([
      String(targetGw),
      '2026-10-21',
      'LaLiga',
      'Levante UD',
      'Athletic Bilbao',
      '17122851',
      levanteAthleticAfId,
      'FINISHED',
      '3',
      '1'
    ])

    // Sort chronologically: GW ASC -> Date ASC -> Home ASC
    dataRows.sort((a, b) => {
      const gwDiff = Number(a[0] || 0) - Number(b[0] || 0)
      if (gwDiff !== 0) return gwDiff
      return (a[1] || '').localeCompare(b[1] || '') || (a[3] || '').localeCompare(b[3] || '')
    })

    await sheets.spreadsheets.values.clear({ spreadsheetId: ssId, range: 'Fixture_Staging!A:J' })
    await sheets.spreadsheets.values.update({
      spreadsheetId: ssId,
      range: 'Fixture_Staging!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [header, ...dataRows] },
    })
    console.log('✅ Fixture_Staging updated with 49 fixtures for GW8!')
  } else {
    console.log(`Levante UD vs Athletic Bilbao already present in GW${targetGw}.`)
  }

  // 3. Stage 2: Sync API-Football Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 2/5] Syncing Levante vs Athletic to API_Football_Staging...`)
  console.log(`-----------------------------------------------------------`)
  await syncApiFootballGameweekStats(targetGw, activeDates)

  // 4. Stage 3: Sync SofaScore Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 3/5] Syncing Levante vs Athletic to SofaScore_Staging...`)
  console.log(`-----------------------------------------------------------`)
  await syncSofaScoreStaging(targetGw)

  // 5. Post-Snapshot Safety Guard
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
  console.log(`[Stage 4/5] Updating Comparison_Dashboard for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncComparisonDashboard(targetGw)

  // Audit Comparison_Dashboard
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

  // Check DGW players specifically
  const nico = dashData.find(r => r[1]?.toLowerCase().includes('nico williams'))
  const unai = dashData.find(r => r[1]?.toLowerCase().includes('unai simón') || r[1]?.toLowerCase().includes('unai simon'))
  console.log(`\n🌟 DGW PLAYERS IN COMPARISON DASHBOARD:`)
  if (nico) console.log(`  • Nico Williams (${nico[0]}): SofaScore=${nico[4]}, AF=${nico[5]}, Status=${nico[6]}, Approved=${nico[7]}`)
  if (unai) console.log(`  • Unai Simón (${unai[0]}): SofaScore=${unai[4]}, AF=${unai[5]}, Status=${unai[6]}, Approved=${unai[7]}`)

  // 7. Stage 5: Recalculate Team Scores and Standings
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 5/5] Recalculating 16-Team Scores & Standings for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  const scoreResult = await calculateAndSyncTeamScores(targetGw)
  if (scoreResult?.paused) {
    console.warn(`⚠️ Scoring paused: Some rows in Comparison_Dashboard still need final_approved_pts.`)
  } else {
    console.log(`✅ Successfully updated all 16 team sheets & Standings for GW${targetGw}!`)
  }

  console.log(`\n🎉 FULL DGW PIPELINE COMPLETED SUCCESSFULLY!`)
}

main().catch(console.error)
