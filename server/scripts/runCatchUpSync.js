import 'dotenv/config'
import { executeDailySyncPipeline } from './runNightlySyncCron.js'

async function main() {
  const cliGw = process.argv[2] ? Number(process.argv[2]) : null
  console.log(`🚀 RUNNING MANUAL CATCH-UP SYNC PIPELINE ${cliGw ? `FOR GW${cliGw}` : ''}...`)
  await executeDailySyncPipeline(cliGw)
  console.log('\n✅ Catch-up sync complete! Google Sheets updated.')
}

main().catch(console.error)
