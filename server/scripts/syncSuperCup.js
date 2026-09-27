/**
 * Trigger Super Cup scoring for a single GW or all played GWs.
 *
 * Usage:
 *   node server/scripts/syncSuperCup.js 5        # score GW5 (R16)
 *   node server/scripts/syncSuperCup.js --all    # score all played GWs
 *   node server/scripts/syncSuperCup.js 5 --dry-run  # preview, no writes
 */
import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
}
const credentialsDir = findUp('credentials')
if (credentialsDir) process.chdir(path.dirname(credentialsDir))

const { syncSuperCupForGw, getBracketSummary } = await import('../src/services/superCupService.js')
const { getActiveGameweek } = await import('../src/services/sheetsService.js')

const args = process.argv.slice(2)
const allMode = args.includes('--all')
const dryRun = args.includes('--dry-run')
const gwArg = args.find((a) => !a.startsWith('--'))
const targetGw = gwArg ? Number(gwArg) : null

if (!allMode && !targetGw) {
  console.log('Usage:')
  console.log('  node server/scripts/syncSuperCup.js 5            # score GW5 (R16)')
  console.log('  node server/scripts/syncSuperCup.js --all        # score all played GWs (5/8/11/15)')
  console.log('  node server/scripts/syncSuperCup.js 5 --dry-run  # preview, no writes')
  process.exit(1)
}

const currentGw = targetGw || await getActiveGameweek()
const startGw = allMode ? 5 : currentGw

console.log('===========================================================')
console.log(`🏆 SUPER CUP SCORING${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`   Range: GW${startGw}${allMode ? ` to GW${currentGw}` : ''}`)
console.log('===========================================================')

// Show bracket summary
const summary = await getBracketSummary()
console.log(`\nBracket: ${summary.total} matches total`)
for (const [stage, count] of Object.entries(summary.byStage)) {
  console.log(`  ${stage}: ${count} matches`)
}
console.log('')

try {
  const gws = allMode ? [5, 8, 11, 15].filter((gw) => gw <= currentGw) : [currentGw]
  for (const gw of gws) {
    const result = await syncSuperCupForGw(gw, { dryRun })
    if (result.matches.length === 0) {
      console.log(`[SuperCup] GW${gw}: no matches to score`)
    }
  }
  console.log('\n✅ Super Cup sync complete')
} catch (err) {
  console.error('❌ Super Cup sync failed:', err.message)
  process.exit(1)
}
