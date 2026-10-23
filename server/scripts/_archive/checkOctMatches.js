import 'dotenv/config'
import { fetchTop5FixturesByDate } from '../src/services/apiFootballSyncService.js'
import { fetchTop5MatchesByDate } from '../src/services/fixtureService.js'

async function main() {
  for (const d of ['2026-10-18', '2026-10-19', '2026-10-21']) {
    console.log(`\n--- Date: ${d} ---`)
    const af = await fetchTop5FixturesByDate(d)
    const ss = await fetchTop5MatchesByDate(d)
    console.log(`AF matches (${af.length}):`, af.map(m => `${m.teams?.home?.name} vs ${m.teams?.away?.name} [${m.fixture?.status?.short}] ${m.goals?.home}-${m.goals?.away}`))
    console.log(`SS matches (${ss.length}):`, ss.map(m => `${m.home_club} vs ${m.away_club} [${m.status}] ${m.home_score}-${m.away_score}`))
  }
}

main().catch(console.error)
