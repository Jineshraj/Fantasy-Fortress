import 'dotenv/config'
import { syncFixturesDateRange } from '../src/services/fixtureService.js'
import { syncSofaScoreStaging } from '../src/services/sofaScoreSyncService.js'
import { syncApiFootballGameweekStats } from '../src/services/apiFootballSyncService.js'
import { syncComparisonDashboard } from '../src/services/dashboardService.js'
import { calculateAndSyncTeamScores } from '../src/services/scoringEngine.js'
import { getActiveGameweek } from '../src/services/sheetsService.js'
import { syncAllToSupabase } from '../src/services/supabaseSyncService.js'

import { getGoogleAuth } from '../src/lib/auth.js'
import { google } from 'googleapis'

/**
 * Returns the relevant date window for nightly sync (all dates for target GW from Fixture_Staging)
 */
async function getDatesForGameweek(targetGw) {
  try {
    const auth = getGoogleAuth()
    const sheets = google.sheets({ version: 'v4', auth })
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'Fixture_Staging!A2:B',
    })
    const rows = (res.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
    const dates = Array.from(new Set(rows.map((r) => String(r[1] || '').trim()).filter(Boolean))).sort()
    if (dates.length > 0) return dates
  } catch (e) {
    console.warn('[Sync Cron] Could not load dates from Fixture_Staging:', e.message)
  }

  // Fallback to past 3 days if Fixture_Staging is empty
  const dates = []
  const now = new Date()
  for (let i = 2; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

export async function executeDailySyncPipeline(targetGw) {
  const activeGw = targetGw || (await getActiveGameweek())
  const activeDates = await getDatesForGameweek(activeGw)
  const startDate = activeDates[0]
  const endDate = activeDates[activeDates.length - 1]
  const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  console.log(`\n===========================================================`)
  console.log(`🚀 [${timestamp}] EXECUTING AUTOMATED DAILY SYNC FOR GW${activeGw}`)
  console.log(`📅 Active Gameweek Dates (${activeDates.length} days): ${startDate} to ${endDate}`)
  console.log(`===========================================================`)

  try {
    // 1. Ingest finished Top 5 League fixtures for this GW
    console.log(`\n[Stage 1/5] Ingesting finished Top 5 League fixtures for GW${activeGw}...`)
    await syncFixturesDateRange(startDate, endDate, activeGw)

    // 2. Sync API-Football FIRST so canonical names are locked before SofaScore
    // schema drift can corrupt Player_ID_Mappings.sofascore_id (D100 ordering fix).
    console.log(`\n[Stage 2/6] Syncing API-Football player stats for GW${activeGw}...`)
    await syncApiFootballGameweekStats(activeGw, activeDates)

    // 3. Sync SofaScore player statistics & incident clean sheets (with match caching)
    console.log(`\n[Stage 3/6] Syncing SofaScore player stats for GW${activeGw}...`)
    await syncSofaScoreStaging(activeGw)

    // 4. Populate Comparison Dashboard & verify scores across both sources
    console.log(`\n[Stage 4/5] Cross-checking stats in Comparison Dashboard for GW${activeGw}...`)
    await syncComparisonDashboard(activeGw)

    // 5. Run Fantasy Scoring Engine across all 16 teams and update Standings
    console.log(`\n[Stage 5/6] Calculating fantasy points & updating Google Sheets...`)
    const scoreResult = await calculateAndSyncTeamScores(activeGw)

    if (scoreResult && scoreResult.paused) {
      console.warn(`\n⚠️ Stage 5 Paused awaiting admin verification in Comparison_Dashboard. Stage 6 (Supabase Sync) deferred.`)
      return
    }

    // 6. Mirror Verified Data to Supabase PostgreSQL (for <50ms Web App)
    console.log(`\n[Stage 6/6] Mirroring verified data to Supabase PostgreSQL...`)
    await syncAllToSupabase(activeGw, scoreResult?.teamResults)

    console.log(`\n🎉 [${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] DAILY SYNC COMPLETED SUCCESSFULLY FOR GW${activeGw}!`)
  } catch (err) {
    console.error(`❌ [${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}] Daily Sync Pipeline Error:`, err.message)
  }
}

/**
 * High-Precision 4:30 AM IST Daily Scheduler
 */
function startNightlyScheduler() {
  async function scheduleNext() {
    const currentGw = await getActiveGameweek()
    const now = new Date()
    // Convert to IST
    const istOffset = 5.5 * 60 * 60 * 1000
    const nowIST = new Date(now.getTime() + istOffset)

    const nextTargetIST = new Date(nowIST)
    nextTargetIST.setUTCHours(4, 30, 0, 0)

    if (nowIST.getUTCHours() > 4 || (nowIST.getUTCHours() === 4 && nowIST.getUTCMinutes() >= 30)) {
      nextTargetIST.setUTCDate(nextTargetIST.getUTCDate() + 1)
    }

    const nextTargetUTC = new Date(nextTargetIST.getTime() - istOffset)
    const delayMs = nextTargetUTC.getTime() - now.getTime()
    const minutesLeft = (delayMs / 1000 / 60).toFixed(1)

    console.log(`\n⏰ Next automated sync scheduled in ${minutesLeft} minutes (at 4:30 AM IST) for GW${currentGw}`)

    setTimeout(async () => {
      await executeDailySyncPipeline()
      scheduleNext()
    }, delayMs)
  }

  console.log('===========================================================')
  console.log('⏰ NIGHTLY AUTOMATED SYNC CRON DAEMON IS RUNNING')
  console.log('⏰ Scheduled Time: 4:30 AM IST (Daily)')
  console.log('===========================================================')

  scheduleNext()
}

// Only start scheduler if run directly
if (process.argv[1]?.endsWith('runNightlySyncCron.js')) {
  startNightlyScheduler()
}
