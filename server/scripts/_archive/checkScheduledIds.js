import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

const sheets = google.sheets({ version: 'v4', auth: getGoogleAuth() })
const ssId = process.env.GOOGLE_SHEET_ID

async function main() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A1:J' })
  const rows = res.data.values || []
  const gw8 = rows.filter(r => r[0] === '8')
  const scheduled = gw8.filter(r => r[7] !== 'FINISHED')
  console.log('Scheduled fixtures in GW8:')
  scheduled.forEach(r => {
    console.log(`  ${r[1]} | ${r[3]} vs ${r[4]} | SofaId: ${r[5]} | AFId: ${r[6]} | Status: ${r[7]}`)
  })
}

main().catch(console.error)
