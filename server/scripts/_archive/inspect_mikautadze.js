import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

async function check() {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID

  // 1. Check Committe Team in Lineup_Rosters
  const lineupRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Lineup_Rosters!A1:H',
  })
  const allLineups = lineupRes.data.values || []
  const committeLineup = allLineups
    .map((r, idx) => ({ rowIndex: idx + 1, row: r }))
    .filter(item => String(item.row[0]).trim() === '7' && String(item.row[1]).trim() === 'Committe Team')
  
  console.log('=== Committe Team GW7 in Lineup_Rosters ===')
  for (const c of committeLineup) {
    console.log(`Row ${c.rowIndex}: [${c.row[3]}] ${c.row[2]} (${c.row[4]}) Cap:${c.row[5]} Vice:${c.row[6]}`)
  }

  // 2. Search for Mikautadze in Player_ID_Mappings & Players
  const mapRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Player_ID_Mappings!A2:E',
  })
  const mapRows = mapRes.data.values || []
  const mikaMatches = mapRows.filter(r => String(r[1]).toLowerCase().includes('mikautadze'))
  console.log('\n=== Mikautadze in Player_ID_Mappings ===')
  for (const m of mikaMatches) {
    console.log(m)
  }

  // 3. Search for Mikautadze in Comparison_Dashboard for GW7
  const dashRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Comparison_Dashboard!A2:H',
  })
  const dashRows = dashRes.data.values || []
  const dashMatches = dashRows.filter(r => String(r[0]).trim() === '7' && String(r[1]).toLowerCase().includes('mikautadze'))
  console.log('\n=== Mikautadze in Comparison_Dashboard (GW7) ===')
  for (const d of dashMatches) {
    console.log(d)
  }
}

check().catch(console.error)
