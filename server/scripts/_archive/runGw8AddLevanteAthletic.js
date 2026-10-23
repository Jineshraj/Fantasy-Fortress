import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { syncApiFootballGameweekStats } from '../src/services/apiFootballSyncService.js'
import { syncSofaScoreStaging } from '../src/services/sofaScoreSyncService.js'
import { syncComparisonDashboard } from '../src/services/dashboardService.js'

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
  console.log(`🚀 INGESTING GW${targetGw} FINISHED MATCHES (INCLUDING LEVANTE vs ATHLETIC DGW)`)
  console.log(`📅 Active Dates: ${activeDates.join(', ')}`)
  console.log('===========================================================\n')

  // 1. Capture Pre-Snapshot of all staging tabs
  console.log('📸 [PRE-SNAPSHOT] Verifying existing gameweek rows...')
  const preFixtureCounts = await getTabCounts('Fixture_Staging')
  const preSofaCounts = await getTabCounts('SofaScore_Staging')
  const preAfCounts = await getTabCounts('API_Football_Staging')
  console.log('  Fixture_Staging    :', JSON.stringify(preFixtureCounts))
  console.log('  SofaScore_Staging  :', JSON.stringify(preSofaCounts))
  console.log('  API_Football_Staging:', JSON.stringify(preAfCounts))

  // 2. Stage 1: Update Fixture_Staging for GW8
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 1/4] Ingesting & Updating Fixture_Staging for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)

  const fixRes = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A1:J' })
  const allRows = fixRes.data.values || []
  const header = allRows[0] || ['gameweek', 'match_date', 'league', 'home_club', 'away_club', 'sofascore_id', 'api_football_id', 'status', 'home_score', 'away_score']
  const dataRows = allRows.slice(1)

  // Scores map for remaining scheduled matches
  const matchScores = {
    '1570418': { homeScore: '2', awayScore: '5' }, // Málaga CF vs Real Sociedad
    '1570420': { homeScore: '4', awayScore: '1' }, // Real Madrid vs Sevilla FC
    '1552788': { homeScore: '2', awayScore: '1' }, // Olympique Lyon vs OGC Nice
    '1550152': { homeScore: '0', awayScore: '3' }, // Juventus FC vs SS Lazio
    '1570417': { homeScore: '1', awayScore: '1' }, // Getafe CF vs Rayo Vallecano
    '1557436': { homeScore: '3', awayScore: '1' }, // Tottenham Hotspur vs Coventry City
    '1550153': { homeScore: '4', awayScore: '0' }, // AC Monza vs Cagliari Calcio
    '1550154': { homeScore: '0', awayScore: '3' }, // Parma Calcio 1913 vs Torino FC
  }

  // Update existing rows
  let updatedScheduled = 0
  for (const r of dataRows) {
    if (String(r[0] || '').trim() === String(targetGw)) {
      const afId = String(r[6] || '').trim()
      if (matchScores[afId]) {
        r[7] = 'FINISHED'
        r[8] = matchScores[afId].homeScore
        r[9] = matchScores[afId].awayScore
        updatedScheduled++
      }
    }
  }
  console.log(`[Fixture_Staging] Updated ${updatedScheduled} previously scheduled matches to FINISHED with scores!`)

  // Check if Levante vs Athletic Club already exists in dataRows
  const levanteAthleticAfId = '1570389'
  const existsLevante = dataRows.some(r => String(r[6] || '').trim() === levanteAthleticAfId)
  if (!existsLevante) {
    console.log(`[Fixture_Staging] Adding 49th fixture: Levante UD vs Athletic Bilbao (DGW Match 2)...`)
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
  } else {
    console.log(`[Fixture_Staging] Levante UD vs Athletic Bilbao fixture already present.`)
  }

  // Sort chronologically within sheet: GW ASC -> Date ASC -> Home ASC
  dataRows.sort((a, b) => {
    const gwDiff = Number(a[0] || 0) - Number(b[0] || 0)
    if (gwDiff !== 0) return gwDiff
    return (a[1] || '').localeCompare(b[1] || '') || (a[3] || '').localeCompare(b[3] || '')
  })

  // Write cleanly back to Fixture_Staging
  await sheets.spreadsheets.values.clear({ spreadsheetId: ssId, range: 'Fixture_Staging!A:J' })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ssId,
    range: 'Fixture_Staging!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [header, ...dataRows] },
  })

  const gw8Fixtures = dataRows.filter((r) => String(r[0] || '').trim() === String(targetGw))
  const gw8Finished = gw8Fixtures.filter((r) => String(r[7] || '').trim().toUpperCase() === 'FINISHED')
  const gw8Scheduled = gw8Fixtures.filter((r) => String(r[7] || '').trim().toUpperCase() !== 'FINISHED')
  console.log(`[Fixture_Staging Status] GW${targetGw} total: ${gw8Fixtures.length} | Finished: ${gw8Finished.length} | Scheduled: ${gw8Scheduled.length}`)

  // 3. Stage 2: Sync API-Football Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 2/4] Syncing finished matches to API_Football_Staging for GW${targetGw}...`)
  console.log(`-----------------------------------------------------------`)
  await syncApiFootballGameweekStats(targetGw, activeDates)

  // 4. Stage 3: Sync SofaScore Staging
  console.log(`\n-----------------------------------------------------------`)
  console.log(`[Stage 3/4] Syncing finished matches to SofaScore_Staging for GW${targetGw}...`)
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

  // Check DGW players specifically
  const nico = dashData.find(r => r[1]?.toLowerCase().includes('nico williams'))
  const unai = dashData.find(r => r[1]?.toLowerCase().includes('unai simón') || r[1]?.toLowerCase().includes('unai simon'))
  console.log(`\n🌟 DGW PLAYERS IN COMPARISON DASHBOARD:`)
  if (nico) console.log(`  • Nico Williams (${nico[0]}): SofaScore=${nico[4]}, AF=${nico[5]}, Status=${nico[6]}, Approved=${nico[7]}`)
  if (unai) console.log(`  • Unai Simón (${unai[0]}): SofaScore=${unai[4]}, AF=${unai[5]}, Status=${unai[6]}, Approved=${unai[7]}`)

  console.log(`\n🎉 GW${targetGw} INGESTION & RECONCILIATION COMPLETED SUCCESSFULLY!`)
}

main().catch(console.error)
