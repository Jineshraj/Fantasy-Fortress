import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { generateH2HKnockoutBracket } from '../src/services/h2hScoringService.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

async function main() {
  console.log('===========================================================')
  console.log('🏆 UPDATING H2H_LEAGUE PLAYOFF LAYOUT (TOP 4 QUARTER-FINALS)')
  console.log('===========================================================')

  // 1. Update Subtitle in Row 2
  await sheets.spreadsheets.values.update({
    spreadsheetId: ssId,
    range: 'H2H_League!A2',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['16 Teams • 2 Groups • 14 Gameweeks • Top 4 Advance to Championship Playoffs (Quarter-Finals)']]
    }
  })
  console.log('✅ Updated Row 2 subtitle')

  // 2. Update Header in Row 25
  await sheets.spreadsheets.values.update({
    spreadsheetId: ssId,
    range: 'H2H_League!A25',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [['🏆 CHAMPIONSHIP PLAYOFFS (GW22 – GW30)']]
    }
  })
  console.log('✅ Updated Row 25 header')

  // 3. Generate & Seed the 8-team Quarter-Finals, Semi-Finals, and Final bracket
  await generateH2HKnockoutBracket()
  console.log('✅ Generated 8-team Playoff Bracket in H2H_League!A27:G35')
}

main().catch(console.error)
