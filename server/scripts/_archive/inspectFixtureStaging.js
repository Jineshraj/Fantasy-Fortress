import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

const sheets = google.sheets({ version: 'v4', auth: getGoogleAuth() })
const ssId = process.env.GOOGLE_SHEET_ID

async function main() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A1:J' })
  const rows = res.data.values || []
  const gwCounts = {}
  rows.slice(1).forEach(r => {
    const gw = r[0] || 'Unknown'
    gwCounts[gw] = (gwCounts[gw] || 0) + 1
  })
  console.log('Fixture counts by GW:', gwCounts)

  const gw8 = rows.filter(r => r[0] === '8')
  console.log('\nGW8 Total Fixtures:', gw8.length)
  const finished = gw8.filter(r => r[7] === 'FINISHED')
  const scheduled = gw8.filter(r => r[7] !== 'FINISHED')
  console.log(`GW8 Finished: ${finished.length} | Scheduled: ${scheduled.length}`)
  console.log('Scheduled:', scheduled.map(r => ({ date: r[1], home: r[3], away: r[4], status: r[7] })))
}

main().catch(console.error)
