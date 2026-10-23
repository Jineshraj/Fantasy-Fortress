import 'dotenv/config'
import { fetchTop5MatchesByDate } from '../src/services/fixtureService.js'

async function main() {
  const matches = await fetchTop5MatchesByDate('2026-10-21')
  console.log('2026-10-21 SofaScore matches:')
  console.log(matches)
}

main().catch(console.error)
