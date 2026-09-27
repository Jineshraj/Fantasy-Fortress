import 'dotenv/config'
import { getActiveGameweek } from '../src/services/sheetsService.js'
import { calculateAndSyncTeamScores } from '../src/services/scoringEngine.js'

async function main() {
  const cliGw = process.argv[2] ? Number(process.argv[2]) : null
  const activeGw = cliGw || (await getActiveGameweek())

  console.log('===========================================================')
  console.log(`📊 STEP 1: CALCULATING & UPDATING GOOGLE SHEETS FOR GW${activeGw}`)
  console.log('===========================================================')

  const scoreResult = await calculateAndSyncTeamScores(activeGw)

  if (scoreResult && scoreResult.paused) {
    console.warn(`\n⚠️ Scoring paused: Some rows in Comparison_Dashboard still need final_approved_pts in Column H.`)
    return
  }

  console.log(`\n✅ Google Sheets updated successfully for GW${activeGw}!`)
  console.log(`👉 You can now open Google Sheets, check the 16 Team Sheets and Standings.`)
  console.log(`👉 When verified, run "npm run sync:db -- ${activeGw}" to push to Supabase database.`)
}

main().catch(console.error)
