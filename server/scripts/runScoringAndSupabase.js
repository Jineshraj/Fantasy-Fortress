import 'dotenv/config'
import { getActiveGameweek } from '../src/services/sheetsService.js'
import { calculateAndSyncTeamScores } from '../src/services/scoringEngine.js'
import { syncAllToSupabase } from '../src/services/supabaseSyncService.js'

async function main() {
  const cliGw = process.argv[2] ? Number(process.argv[2]) : null
  const activeGw = cliGw || (await getActiveGameweek())

  console.log('===========================================================')
  console.log(`🏆 STEP 1: CALCULATING & UPDATING GOOGLE SHEETS FOR GW${activeGw}`)
  console.log('===========================================================')

  const scoreResult = await calculateAndSyncTeamScores(activeGw)

  if (scoreResult && scoreResult.paused) {
    console.warn(`\n⚠️ Scoring paused: Some rows in Comparison_Dashboard still need final_approved_pts in Column H.`)
    return
  }

  console.log(`\n✅ Google Sheets updated successfully for GW${activeGw}!`)
  console.log('===========================================================')
  console.log(`🗄️ STEP 2: MIRRORING VERIFIED SHEETS DATA TO SUPABASE (GW${activeGw})`)
  console.log('===========================================================')

  await syncAllToSupabase(activeGw, scoreResult?.teamResults)
  console.log(`\n🎉 Supabase PostgreSQL successfully updated from Google Sheets for GW${activeGw}!`)
}

main().catch(console.error)
