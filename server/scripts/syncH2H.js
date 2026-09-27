/**
 * Trigger H2H League scoring for a single GW or all played GWs.
 *
 * Usage:
 *   node server/scripts/syncH2H.js 3        # score GW3
 *   node server/scripts/syncH2H.js --all    # score all played GWs (3 to current)
 *   node server/scripts/syncH2H.js 3 --dry-run  # preview, no writes
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

const { syncH2HForGw, recalculateH2HStandings, generateH2HKnockoutBracket } = await import('../src/services/h2hScoringService.js')
const { getActiveGameweek } = await import('../src/services/sheetsService.js')

const args = process.argv.slice(2)
const allMode = args.includes('--all')
const dryRun = args.includes('--dry-run')
const gwArg = args.find((a) => !a.startsWith('--'))
const targetGw = gwArg ? Number(gwArg) : null

if (!allMode && !targetGw) {
  console.log('Usage:')
  console.log('  node server/scripts/syncH2H.js 3            # score GW3')
  console.log('  node server/scripts/syncH2H.js --all        # score all played GWs (3 to current)')
  console.log('  node server/scripts/syncH2H.js 3 --dry-run  # preview, no writes')
  process.exit(1)
}

const currentGw = targetGw || await getActiveGameweek()
const startGw = allMode ? 3 : currentGw

console.log('===========================================================')
console.log(`🏆 H2H LEAGUE SCORING${dryRun ? ' (DRY RUN)' : ''}`)
console.log(`   Range: GW${startGw}${allMode ? ` to GW${currentGw}` : ''}`)
console.log('===========================================================')

try {
  const gws = allMode ? [] : [currentGw]
  if (allMode) {
    for (let gw = startGw; gw <= currentGw; gw++) gws.push(gw)
  }
  for (const gw of gws) {
    const result = await syncH2HForGw(gw, { dryRun })
    if (!result.matches || result.matches.length === 0) {
      console.log(`[H2H] GW${gw}: no matches`)
    }
  }
  // Recompute standings
  await recalculateH2HStandings({ dryRun })
  console.log('\n✅ H2H sync complete')
  if (allMode && currentGw >= 22) {
    console.log('[H2H] (Optionally) Generating knockout bracket at GW22...')
    await generateH2HKnockoutBracket({ dryRun })
  }
} catch (err) {
  console.error('❌ H2H sync failed:', err.message)
  process.exit(1)
}
