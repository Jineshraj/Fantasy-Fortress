import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

async function main() {
  console.log('===========================================================')
  console.log('🎨 UPDATING H2H_LEAGUE POINT TABLE QUALIFICATION COLORS (TOP 4)')
  console.log('===========================================================')

  // Get sheetId for H2H_League
  const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
  const h2hSheet = meta.data.sheets.find((s) => s.properties.title === 'H2H_League')
  if (!h2hSheet) {
    throw new Error('H2H_League sheet not found')
  }
  const sheetId = h2hSheet.properties.sheetId

  const QUALIFYING_BG = { red: 0.99215686, green: 0.9529412, blue: 0.7764706 } // Gold/light yellow
  const BORDER_COLOR = { red: 0.8, green: 0.65, blue: 0.2 } // Distinct qualification divider

  const requests = [
    // 1. Group A: Top 4 (Rows 5-8, index 4 to 8, Cols A-J index 0 to 10)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 4,
          endRowIndex: 8,
          startColumnIndex: 0,
          endColumnIndex: 10,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: QUALIFYING_BG,
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    },
    // Divider border below Group A row 8 (between Pos 4 and Pos 5)
    {
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 7,
          endRowIndex: 8,
          startColumnIndex: 0,
          endColumnIndex: 10,
        },
        bottom: {
          style: 'SOLID_MEDIUM',
          color: BORDER_COLOR,
        },
      },
    },

    // 2. Group B: Top 4 (Rows 16-19, index 15 to 19, Cols A-J index 0 to 10)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 15,
          endRowIndex: 19,
          startColumnIndex: 0,
          endColumnIndex: 10,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: QUALIFYING_BG,
          },
        },
        fields: 'userEnteredFormat.backgroundColor',
      },
    },
    // Divider border below Group B row 19 (between Pos 4 and Pos 5)
    {
      updateBorders: {
        range: {
          sheetId,
          startRowIndex: 18,
          endRowIndex: 19,
          startColumnIndex: 0,
          endColumnIndex: 10,
        },
        bottom: {
          style: 'SOLID_MEDIUM',
          color: BORDER_COLOR,
        },
      },
    },
  ]

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { requests },
  })

  console.log('✅ Successfully updated qualification highlighting for Top 4 in Group A (Rows 5-8) and Group B (Rows 16-19)!')
}

main().catch(console.error)
