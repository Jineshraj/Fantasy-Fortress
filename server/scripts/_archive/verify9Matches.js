import 'dotenv/config'
import { fetchFixtureDetailsById } from '../src/services/apiFootballSyncService.js'
import { fetchMatchBoxscore } from '../src/services/sofaScoreSyncService.js'

const matches = [
  { name: 'Málaga CF vs Real Sociedad', sofaId: '16421073', afId: '1570418' },
  { name: 'Real Madrid vs Sevilla FC', sofaId: '16421075', afId: '1570420' },
  { name: 'Olympique Lyon vs OGC Nice', sofaId: '16310980', afId: '1552788' },
  { name: 'Juventus FC vs SS Lazio', sofaId: '16285044', afId: '1550152' },
  { name: 'Getafe CF vs Rayo Vallecano', sofaId: '16421072', afId: '1570417' },
  { name: 'Tottenham Hotspur vs Coventry City', sofaId: '16363890', afId: '1557436' },
  { name: 'AC Monza vs Cagliari Calcio', sofaId: '16285045', afId: '1550153' },
  { name: 'Parma Calcio 1913 vs Torino FC', sofaId: '16285042', afId: '1550154' },
  { name: 'Levante UD vs Athletic Bilbao', sofaId: '17122851', afId: '1570389' },
]

async function main() {
  for (const m of matches) {
    const af = await fetchFixtureDetailsById(m.afId)
    console.log(`${m.name}: AF score=${af?.goals?.home}-${af?.goals?.away}, status=${af?.fixture?.status?.short}`)
  }
}

main().catch(console.error)
