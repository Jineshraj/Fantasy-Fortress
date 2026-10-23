import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

const sheets = google.sheets({ version: 'v4', auth: getGoogleAuth() })
const ssId = process.env.GOOGLE_SHEET_ID

async function main() {
  const [sofa, af] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'SofaScore_Staging!A:N' }),
    sheets.spreadsheets.values.get({ spreadsheetId: ssId, range: 'API_Football_Staging!A:N' }),
  ])

  const findRows = (sheet, name) => (sheet.data.values || []).filter(r => r[0] === '8' && (r[2] || '').toLowerCase().includes(name))

  console.log('--- Dean Huijsen ---')
  console.log('Sofa:', findRows(sofa, 'huijsen'))
  console.log('AF:', findRows(af, 'huijsen'))

  console.log('--- Marc Cucurella ---')
  console.log('Sofa:', findRows(sofa, 'cucurella'))
  console.log('AF:', findRows(af, 'cucurella'))
}

main().catch(console.error)
