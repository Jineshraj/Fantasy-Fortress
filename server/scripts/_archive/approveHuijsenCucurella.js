import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { calculateAndSyncTeamScores } from '../src/services/scoringEngine.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

async function main() {
  console.log('--- Approving Huijsen and Cucurella (1 pt each due to verified yellow cards) ---')
  const dashRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Comparison_Dashboard!A1:J',
  })
  const allRows = dashRes.data.values || []
  const header = allRows[0]
  const dataRows = allRows.slice(1)

  const updates = []
  dataRows.forEach((r, idx) => {
    const rowNumber = idx + 2
    const pName = String(r[1] || '').toLowerCase()
    if (pName.includes('huijsen')) {
      console.log(`Setting Huijsen row ${rowNumber}: approved=1`)
      r[6] = 'MANUAL_OVERRIDE'
      r[7] = '1'
      r[8] = 'APPROVED'
      updates.push({
        range: `Comparison_Dashboard!G${rowNumber}:I${rowNumber}`,
        values: [['MANUAL_OVERRIDE', '1', 'APPROVED']],
      })
    } else if (pName.includes('cucurella')) {
      console.log(`Setting Cucurella row ${rowNumber}: approved=1`)
      r[6] = 'MANUAL_OVERRIDE'
      r[7] = '1'
      r[8] = 'APPROVED'
      updates.push({
        range: `Comparison_Dashboard!G${rowNumber}:I${rowNumber}`,
        values: [['MANUAL_OVERRIDE', '1', 'APPROVED']],
      })
    }
  })

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    })
    console.log(`✅ Updated ${updates.length} rows in Comparison_Dashboard!`)
  }

  // Also propagate the approved score to API_Football_Staging where yellow card was missing
  console.log('\n--- Syncing Team Scores & Standings for GW8 ---')
  const scoreResult = await calculateAndSyncTeamScores(8)
  console.log('Score Result:', scoreResult)

  // Fetch updated Standings
  const standRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Standings!A1:H18',
  })
  console.log('\n🏆 UPDATED STANDINGS TABLE:')
  for (const row of standRes.data.values || []) {
    console.log(row.join('\t| '))
  }
}

main().catch(console.error)
