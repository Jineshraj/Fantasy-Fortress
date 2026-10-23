import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

async function searchUdol() {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID

  const tabs = ['Players', 'Player_ID_Mappings', 'Comparison_Dashboard', 'Lineup_Rosters', 'SofaScore_Staging', 'API_Football_Staging']
  for (const tab of tabs) {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A:N` })
      const rows = res.data.values || []
      const matches = []
      for (let i = 0; i < rows.length; i++) {
        const rowStr = rows[i].join(' ').toLowerCase()
        if (rowStr.includes('udol')) {
          matches.push({ rowIdx: i + 1, data: rows[i] })
        }
      }
      console.log(`=== ${tab} (${matches.length} matches) ===`)
      for (const m of matches) {
        console.log(`  Row ${m.rowIdx}:`, m.data)
      }
    } catch (e) {
      console.log(`=== ${tab}: Error ${e.message} ===`)
    }
  }
}

searchUdol().catch(console.error)
