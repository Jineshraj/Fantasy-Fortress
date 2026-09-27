import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Find .env and credentials dir by walking up from the script's directory
function findUp(filename) {
  let dir = path.resolve(__dirname, '..')
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, filename)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const envPath = findUp('.env')
if (envPath) {
  const dotenv = await import('dotenv')
  dotenv.config({ path: envPath, override: true })
  console.log(`[env] loaded .env from ${envPath}`)
}

const credentialsDir = findUp('credentials')
if (credentialsDir) {
  process.chdir(path.dirname(credentialsDir))
  console.log(`[env] credentials dir found at: ${path.dirname(credentialsDir)}`)
  console.log(`[env] cwd: ${process.cwd()}`)
  console.log(`[env] GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID ? 'set' : 'MISSING'}`)
}

const { syncComparisonDashboard } = await import('../src/services/dashboardService.js')
const { getActiveGameweek } = await import('../src/services/sheetsService.js')

const cliGw = process.argv[2] ? Number(process.argv[2]) : null
const targetGw = cliGw || (await getActiveGameweek())

console.log('===========================================================')
console.log(`📊 REBUILDING COMPARISON DASHBOARD FOR GW${targetGw}`)
console.log('===========================================================')

try {
  await syncComparisonDashboard(targetGw)
  console.log(`\n✅ Comparison_Dashboard rebuilt for GW${targetGw}!`)
  console.log(`👉 Run "node scripts/runScoringSheetsOnly.js ${targetGw}" to score and update team sheets.`)
} catch (err) {
  console.error(`\n❌ Failed to rebuild dashboard:`, err.message)
  process.exit(1)
}
