import 'dotenv/config'

const apiFootballKey = process.env.API_FOOTBALL_KEY

async function check(dateStr) {
  const url = `https://v3.football.api-sports.io/fixtures?date=${dateStr}`
  const res = await fetch(url, { headers: { 'x-apisports-key': apiFootballKey } })
  const data = await res.json()
  console.log(`Date: ${dateStr}`)
  console.log('Errors:', data.errors)
  console.log('Total responses:', data.response?.length)
  if (data.response?.length > 0) {
    const leagues = new Set(data.response.map(r => `${r.league?.name} (${r.league?.id})`))
    console.log('Sample leagues:', Array.from(leagues).slice(0, 10))
  }
}

async function main() {
  await check('2026-10-18')
  await check('2026-10-19')
  await check('2026-10-21')
}

main().catch(console.error)
