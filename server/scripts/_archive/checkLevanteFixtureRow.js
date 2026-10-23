import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

const sheets = google.sheets({ version: 'v4', auth: getGoogleAuth() })
const ssId = process.env.GOOGLE_SHEET_ID

async function main() {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'Fixture_Staging!A1:J' })
  const rows = res.data.values || []
  const matches = rows.filter(r => (r[3] || '').includes('Levante') && (r[4] || '').includes('Athletic') || r[6] === '1570389')
  console.log('Matches for 1570389 / Levante vs Athletic in Fixture_Staging:')
  matches.forEach(m => console.log(m))
}

main().catch(console.error)
