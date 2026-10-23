import 'dotenv/config'
import { fetchTop5FixturesByDate } from '../src/services/apiFootballSyncService.js'
import { fetchTop5MatchesByDate } from '../src/services/fixtureService.js'

async function checkDate(dateStr) {
  console.log(`\n================ Checking ${dateStr} ================`)
  try {
    const af = await fetchTop5FixturesByDate(dateStr)
    console.log(`[API-Football] Found ${af.length} matches:`)
    af.forEach(m => {
      console.log(`  AF ID: ${m.fixture?.id} | ${m.teams?.home?.name} vs ${m.teams?.away?.name} | Status: ${m.fixture?.status?.short} | Score: ${m.goals?.home}-${m.goals?.away} | Date: ${m.fixture?.date}`)
    })
  } catch (e) {
    console.error('AF Error:', e.message)
  }

  try {
    const ss = await fetchTop5MatchesByDate(dateStr)
    console.log(`[SofaScore] Found ${ss.length} matches:`)
    ss.forEach(m => {
      console.log(`  SS ID: ${m.sofascore_id || m.id} | ${m.home_club} vs ${m.away_club} | Status: ${m.status} | Score: ${m.home_score}-${m.away_score} | Start: ${m.start_time}`)
    })
  } catch (e) {
    console.error('SS Error:', e.message)
  }
}

async function main() {
  await checkDate('2026-10-20')
  await checkDate('2026-10-21')
  await checkDate('2026-10-22')
}

main().catch(console.error)
