/**
 * Initialize and beautify the Super_Cup Google Sheets tab.
 *
 * Creates:
 *  1. Header Championship Banners (Rows 1-2)
 *  2. Master Match Schedule & Results Table (Cols A-G, Rows 4-22)
 *  3. Dynamic Visual Tournament Bracket Tree (Cols I-S, Rows 4-20)
 *  4. 🏆 Champion Podium Box (Cols R-S, Rows 15-17)
 *  5. Complete professional styling: midnight navy theme, gold accents,
 *     distinct stage badges, custom borders, alignments, and column sizing.
 *
 * Preserves 100% backward compatibility with server/src/services/superCupService.js.
 */
import 'dotenv/config'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function findUp(filename) {
  let dir = path.resolve(__dirname, '..')
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, filename)
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const envPath = findUp('.env')
if (envPath) {
  const dotenv = await import('dotenv')
  dotenv.config({ path: envPath, override: true })
}
const credentialsDir = findUp('credentials')
if (credentialsDir) process.chdir(path.dirname(credentialsDir))

const { google } = await import('googleapis')
const { getGoogleAuth } = await import('../src/lib/auth.js')

const ssId = process.env.GOOGLE_SHEET_ID
const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })

// Color Palette Definition (Hex & Normalized RGB)
const COLORS = {
  BANNER_BG: { red: 0.06, green: 0.09, blue: 0.16 },       // #0f172a Deep Midnight Navy
  BANNER_SUB_BG: { red: 0.12, green: 0.16, blue: 0.23 },   // #1e293b Slate Navy
  GOLD_ACCENT: { red: 0.96, green: 0.62, blue: 0.04 },     // #f59e0b Championship Gold
  WHITE: { red: 1.0, green: 1.0, blue: 1.0 },
  HEADER_BG: { red: 0.15, green: 0.23, blue: 0.36 },       // #27395c Dark Steel Blue
  HEADER_TEXT: { red: 0.94, green: 0.96, blue: 0.98 },
  
  // Stage Badges & Headers
  R16_HEADER: { red: 0.12, green: 0.28, blue: 0.54 },      // #1e478a Royal Blue
  QF_HEADER: { red: 0.38, green: 0.18, blue: 0.58 },       // #622e94 Imperial Purple
  SF_HEADER: { red: 0.72, green: 0.28, blue: 0.10 },       // #b8471a Warm Bronze / Amber
  FINAL_HEADER: { red: 0.78, green: 0.52, blue: 0.06 },    // #c7850f Radiant Gold
  
  // Row Zebra Striping
  ROW_WHITE: { red: 1.0, green: 1.0, blue: 1.0 },
  ROW_ALT: { red: 0.96, green: 0.97, blue: 0.99 },         // #f5f8fc Soft Ice Tint
  
  // Bracket Cards
  CARD_R16_BG: { red: 0.97, green: 0.98, blue: 1.0 },     // Very light blue
  CARD_QF_BG: { red: 0.98, green: 0.96, blue: 1.0 },      // Very light purple
  CARD_SF_BG: { red: 1.0, green: 0.97, blue: 0.94 },      // Very light orange
  CARD_FINAL_BG: { red: 1.0, green: 0.99, blue: 0.92 },   // Light gold
  CHAMPION_BG: { red: 0.99, green: 0.95, blue: 0.78 },     // Bright gold fill
  
  // Borders
  BORDER_DARK: { red: 0.20, green: 0.25, blue: 0.33 },
  BORDER_LIGHT: { red: 0.82, green: 0.85, blue: 0.90 },
  BORDER_GOLD: { red: 0.85, green: 0.65, blue: 0.13 },
}

async function main() {
  console.log('===========================================================')
  console.log('🏆 INITIALIZING MODERN SUPER CUP TOURNAMENT DASHBOARD')
  console.log('===========================================================')

  const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
  let superCupSheet = meta.data.sheets.find(s => s.properties.title === 'Super_Cup')
  
  if (!superCupSheet) {
    console.log('[SuperCup] Creating Super_Cup sheet...')
    const addRes = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: ssId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'Super_Cup' } } }]
      }
    })
    superCupSheet = addRes.data.replies[0].addSheet
  }
  const sheetId = superCupSheet.properties.sheetId

  // 1. Build Grid Values (Rows 1 to 24, Cols A to S = 19 cols)
  const rows = []

  // Helper to pad row to 19 columns
  const padRow = (arr) => {
    const res = [...arr]
    while (res.length < 19) res.push('')
    return res
  }

  // Row 1: Main Title
  rows.push(padRow(['🏆 FANTASY FORTRESS — SUPER CUP KNOCKOUT TOURNAMENT']))
  // Row 2: Subtitle / Rules
  rows.push(padRow(['16 Teams • 4 Single-Elimination Rounds (GW5, GW8, GW11, GW15) • Real-Life Stadium Bonus Excluded']))
  // Row 3: Blank Spacer
  rows.push(padRow([]))

  // Row 4: Column Headers
  rows.push([
    // Cols A-G: Master Schedule
    'STAGE', 'MATCH', 'HOME TEAM', 'AWAY TEAM', 'SCORE', 'SCORE', 'WINNER / QUALIFIED',
    '', // Col H (Separator)
    // Cols I-S: Bracket Round Headers
    'ROUND OF 16 (GW5)', '', '',
    'QUARTER FINALS (GW8)', '', '',
    'SEMI FINALS (GW11)', '', '',
    '🏆 FINAL (GW15)', ''
  ])

  // Rows 5-12: Round of 16 (GW5) Matches M1 to M8
  // Note: Bracket formulas point directly to Cols C, D, E, F
  rows.push([
    'Round of 16 (GW5)', 'M1', 'La Pulga', 'Committe Team', '-', '-', '-', '',
    '=IF(C5="","",C5)', '=IF(E5="","",E5)', '',
    '', '', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M2', 'Aztec Blinders', 'Relegated FC', '-', '-', '-', '',
    '=IF(D5="","",D5)', '=IF(F5="","",F5)', '',
    '=IF(C14="","",C14)', '=IF(E14="","",E14)', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M3', 'Phoenix Flyers', 'Aura Farmers', '-', '-', '-', '',
    '=IF(C6="","",C6)', '=IF(E6="","",E6)', '',
    '=IF(D14="","",D14)', '=IF(F14="","",F14)', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M4', 'Jogo Bonito', 'Reds', '-', '-', '-', '',
    '=IF(D6="","",D6)', '=IF(F6="","",F6)', '',
    '', '', '',
    '=IF(C19="","",C19)', '=IF(E19="","",E19)', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M5', 'Aguilas Dorados', 'Choakers FC', '-', '-', '-', '',
    '=IF(C7="","",C7)', '=IF(E7="","",E7)', '',
    '', '', '',
    '=IF(D19="","",D19)', '=IF(F19="","",F19)', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M6', 'Iberian Wizards', 'Mancunians', '-', '-', '-', '',
    '=IF(D7="","",D7)', '=IF(F7="","",F7)', '',
    '=IF(C15="","",C15)', '=IF(E15="","",E15)', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M7', 'Kroos Control', 'Meridian Athletic', '-', '-', '-', '',
    '=IF(C8="","",C8)', '=IF(E8="","",E8)', '',
    '=IF(D15="","",D15)', '=IF(F15="","",F15)', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Round of 16 (GW5)', 'M8', 'Mamangam DC', 'xG Illuminati', '-', '-', '-', '',
    '=IF(D8="","",D8)', '=IF(F8="","",F8)', '',
    '', '', '',
    '', '', '',
    '=IF(C22="","",C22)', '=IF(E22="","",E22)'
  ])

  // Row 13: Divider / QF Feeder in Bracket
  rows.push([
    '', '', '', '', '', '', '', '',
    '=IF(C9="","",C9)', '=IF(E9="","",E9)', '',
    '', '', '',
    '', '', '',
    '=IF(D22="","",D22)', '=IF(F22="","",F22)'
  ])

  // Rows 14-17: Quarter Finals (GW8)
  rows.push([
    'Quarter Finals (GW8)', 'QF1', 'Winner M1', 'Winner M2', '-', '-', '-', '',
    '=IF(D9="","",D9)', '=IF(F9="","",F9)', '',
    '=IF(C16="","",C16)', '=IF(E16="","",E16)', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Quarter Finals (GW8)', 'QF2', 'Winner M3', 'Winner M4', '-', '-', '-', '',
    '=IF(C10="","",C10)', '=IF(E10="","",E10)', '',
    '=IF(D16="","",D16)', '=IF(F16="","",F16)', '',
    '', '', '',
    '🏆 CHAMPION', ''
  ])
  rows.push([
    'Quarter Finals (GW8)', 'QF3', 'Winner M5', 'Winner M6', '-', '-', '-', '',
    '=IF(D10="","",D10)', '=IF(F10="","",F10)', '',
    '', '', '',
    '=IF(C20="","",C20)', '=IF(E20="","",E20)', '',
    '=IF(OR(G22="",G22="-",G22="🏆 TBD"),"TBD",G22)', ''
  ])
  rows.push([
    'Quarter Finals (GW8)', 'QF4', 'Winner M7', 'Winner M8', '-', '-', '-', '',
    '=IF(C11="","",C11)', '=IF(E11="","",E11)', '',
    '', '', '',
    '=IF(D20="","",D20)', '=IF(F20="","",F20)', '',
    '', ''
  ])

  // Row 18: Divider / SF Feeder in Bracket
  rows.push([
    '', '', '', '', '', '', '', '',
    '=IF(D11="","",D11)', '=IF(F11="","",F11)', '',
    '=IF(C17="","",C17)', '=IF(E17="","",E17)', '',
    '', '', '',
    '', ''
  ])

  // Rows 19-20: Semi Finals (GW11)
  rows.push([
    'Semi Finals (GW11)', 'SF1', 'Winner QF1', 'Winner QF2', '-', '-', '-', '',
    '=IF(C12="","",C12)', '=IF(E12="","",E12)', '',
    '=IF(D17="","",D17)', '=IF(F17="","",F17)', '',
    '', '', '',
    '', ''
  ])
  rows.push([
    'Semi Finals (GW11)', 'SF2', 'Winner QF3', 'Winner QF4', '-', '-', '-', '',
    '=IF(D12="","",D12)', '=IF(F12="","",F12)', '',
    '', '', '',
    '', '', '',
    '', ''
  ])

  // Row 21: Divider
  rows.push(padRow(['', '', '', '', '', '', '']))

  // Row 22: Grand Final (GW15)
  rows.push(padRow([
    'Final (GW15)', 'FINAL', 'Winner SF1', 'Winner SF2', '-', '-', '🏆 TBD'
  ]))

  // Row 23-24: Footer notes
  rows.push(padRow([]))
  rows.push(padRow([
    '📌 Tournament Rules: Single elimination knockout format. In case of ties after 90 mins, the higher seeded franchise advances. Stadium bonus excluded from all cup rounds.'
  ]))

  console.log(`[SuperCup] Clearing old cells and writing ${rows.length} rows...`)
  await sheets.spreadsheets.values.clear({ spreadsheetId: ssId, range: 'Super_Cup!A1:Z100' })
  await sheets.spreadsheets.values.update({
    spreadsheetId: ssId,
    range: 'Super_Cup!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows },
  })
  console.log('[SuperCup] ✅ Values & formulas written successfully.')

  // 2. Build Google Sheets Format & Style Requests
  console.log('[SuperCup] Applying visual design, colors, borders and column widths...')
  const requests = []

  // Ensure grid has clean bounds: 30 rows, 20 cols
  requests.push({
    updateSheetProperties: {
      properties: {
        sheetId,
        gridProperties: {
          rowCount: 30,
          columnCount: 20,
          frozenRowCount: 4,
        },
      },
      fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
    },
  })

  // Clear existing merges on sheet
  try {
    const currentMerges = superCupSheet.merges || []
    for (const m of currentMerges) {
      requests.push({ unmergeCells: { range: m } })
    }
  } catch (e) {}

  // Merge Title Banner: A1 to S1
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 19 },
      mergeType: 'MERGE_ALL',
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 19 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.BANNER_BG,
          textFormat: { bold: true, fontSize: 15, foregroundColor: COLORS.GOLD_ACCENT, fontFamily: 'Arial' },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  // Merge Subtitle Banner: A2 to S2
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 19 },
      mergeType: 'MERGE_ALL',
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 19 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.BANNER_SUB_BG,
          textFormat: { italic: true, fontSize: 10, foregroundColor: { red: 0.85, green: 0.90, blue: 0.95 }, fontFamily: 'Arial' },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  // Table Column Headers (Row 4, index 3 to 4, Cols A to G)
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 7 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.HEADER_BG,
          textFormat: { bold: true, fontSize: 10, foregroundColor: COLORS.WHITE, fontFamily: 'Arial' },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })

  // Bracket Stage Headers (Row 4, index 3 to 4, Cols I to S)
  const stageHeaderRanges = [
    { startCol: 8, endCol: 10, bg: COLORS.R16_HEADER },    // I-J: Round of 16
    { startCol: 11, endCol: 13, bg: COLORS.QF_HEADER },   // L-M: Quarter Finals
    { startCol: 14, endCol: 16, bg: COLORS.SF_HEADER },   // O-P: Semi Finals
    { startCol: 17, endCol: 19, bg: COLORS.FINAL_HEADER },// R-S: Grand Final
  ]

  for (const sh of stageHeaderRanges) {
    requests.push({
      mergeCells: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: sh.startCol, endColumnIndex: sh.endCol },
        mergeType: 'MERGE_ALL',
      },
    })
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: sh.startCol, endColumnIndex: sh.endCol },
        cell: {
          userEnteredFormat: {
            backgroundColor: sh.bg,
            textFormat: { bold: true, fontSize: 10, foregroundColor: COLORS.WHITE, fontFamily: 'Arial' },
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    })
  }

  // Master Match Table Rows (Rows 5 to 22) Zebra Striping & Alignment
  for (let r = 4; r < 22; r++) {
    const isEven = r % 2 === 0
    const bg = isEven ? COLORS.ROW_WHITE : COLORS.ROW_ALT

    // General Row formatting (Cols A to G)
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 0, endColumnIndex: 7 },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 10, fontFamily: 'Arial' },
            verticalAlignment: 'MIDDLE',
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment)',
      },
    })

    // Match ID (Col B): Centered bold
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 2 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 10 } } },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)',
      },
    })

    // Scores (Cols E & F): Centered bold
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 4, endColumnIndex: 6 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            textFormat: { bold: true, fontSize: 10 },
            backgroundColor: isEven ? { red: 0.98, green: 0.98, blue: 0.99 } : { red: 0.93, green: 0.95, blue: 0.98 }
          }
        },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat,backgroundColor)',
      },
    })

    // Winner (Col G): Centered bold
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 6, endColumnIndex: 7 },
        cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', textFormat: { bold: true, fontSize: 10 } } },
        fields: 'userEnteredFormat(horizontalAlignment,textFormat)',
      },
    })
  }

  // Highlight Grand Final Row (Row 22, index 21 to 22, Cols A to G)
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 21, endRowIndex: 22, startColumnIndex: 0, endColumnIndex: 7 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.CARD_FINAL_BG,
          textFormat: { bold: true, fontSize: 10, foregroundColor: COLORS.BORDER_DARK },
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat)',
    },
  })

  // Format Bracket Match Cards (Cols I, L, O, R)
  const bracketCardColumns = [
    { teamCol: 8, scoreCol: 9, bg: COLORS.CARD_R16_BG },
    { teamCol: 11, scoreCol: 12, bg: COLORS.CARD_QF_BG },
    { teamCol: 14, scoreCol: 15, bg: COLORS.CARD_SF_BG },
    { teamCol: 17, scoreCol: 18, bg: COLORS.CARD_FINAL_BG },
  ]

  for (const bCol of bracketCardColumns) {
    // Teams
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 21, startColumnIndex: bCol.teamCol, endColumnIndex: bCol.teamCol + 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { fontSize: 10, bold: false, fontFamily: 'Arial' },
            verticalAlignment: 'MIDDLE',
            padding: { left: 6, right: 3, top: 2, bottom: 2 }
          },
        },
        fields: 'userEnteredFormat(textFormat,verticalAlignment,padding)',
      },
    })
    // Scores
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: 4, endRowIndex: 21, startColumnIndex: bCol.scoreCol, endColumnIndex: bCol.scoreCol + 1 },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: { bold: true, fontSize: 10, fontFamily: 'Arial' },
          },
        },
        fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment,textFormat)',
      },
    })
  }

  // Champion Podium Styling (Cols R-S, Rows 15-16, index 14-16)
  // Row 15: "🏆 CHAMPION"
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 17, endColumnIndex: 19 },
      mergeType: 'MERGE_ALL',
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 14, endRowIndex: 15, startColumnIndex: 17, endColumnIndex: 19 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.GOLD_ACCENT,
          textFormat: { bold: true, fontSize: 11, foregroundColor: COLORS.WHITE, fontFamily: 'Arial' },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })
  // Row 16: Champion Team Name
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 17, endColumnIndex: 19 },
      mergeType: 'MERGE_ALL',
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 15, endRowIndex: 16, startColumnIndex: 17, endColumnIndex: 19 },
      cell: {
        userEnteredFormat: {
          backgroundColor: COLORS.CHAMPION_BG,
          textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 0.45, green: 0.25, blue: 0.05 }, fontFamily: 'Arial' },
          horizontalAlignment: 'CENTER',
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
    },
  })
  // Border around Champion Box
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 14, endRowIndex: 16, startColumnIndex: 17, endColumnIndex: 19 },
      top: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_GOLD },
      bottom: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_GOLD },
      left: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_GOLD },
      right: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_GOLD },
    },
  })

  // Rules / Footer Note (Row 24, index 23 to 24)
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 19 },
      mergeType: 'MERGE_ALL',
    },
  })
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 23, endRowIndex: 24, startColumnIndex: 0, endColumnIndex: 19 },
      cell: {
        userEnteredFormat: {
          textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.45, green: 0.50, blue: 0.58 } },
          verticalAlignment: 'MIDDLE',
        },
      },
      fields: 'userEnteredFormat(textFormat,verticalAlignment)',
    },
  })

  // Grid Borders for Master Table (Cols A to G, Rows 4 to 22)
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: 3, endRowIndex: 22, startColumnIndex: 0, endColumnIndex: 7 },
      top: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_DARK },
      bottom: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_DARK },
      left: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_DARK },
      right: { style: 'SOLID_MEDIUM', color: COLORS.BORDER_DARK },
      innerHorizontal: { style: 'SOLID', color: COLORS.BORDER_LIGHT },
      innerVertical: { style: 'SOLID', color: COLORS.BORDER_LIGHT },
    },
  })

  // Card Borders for Visual Bracket Matches
  const cardBorderRanges = [
    // R16 Cards (8 matches)
    { rStart: 4, rEnd: 6, cStart: 8, cEnd: 10 },
    { rStart: 6, rEnd: 8, cStart: 8, cEnd: 10 },
    { rStart: 8, rEnd: 10, cStart: 8, cEnd: 10 },
    { rStart: 10, rEnd: 12, cStart: 8, cEnd: 10 },
    { rStart: 12, rEnd: 14, cStart: 8, cEnd: 10 },
    { rStart: 14, rEnd: 16, cStart: 8, cEnd: 10 },
    { rStart: 16, rEnd: 18, cStart: 8, cEnd: 10 },
    { rStart: 18, rEnd: 20, cStart: 8, cEnd: 10 },

    // QF Cards (4 matches)
    { rStart: 5, rEnd: 7, cStart: 11, cEnd: 13 },
    { rStart: 9, rEnd: 11, cStart: 11, cEnd: 13 },
    { rStart: 13, rEnd: 15, cStart: 11, cEnd: 13 },
    { rStart: 17, rEnd: 19, cStart: 11, cEnd: 13 },

    // SF Cards (2 matches)
    { rStart: 7, rEnd: 9, cStart: 14, cEnd: 16 },
    { rStart: 15, rEnd: 17, cStart: 14, cEnd: 16 },

    // Final Card (1 match)
    { rStart: 11, rEnd: 13, cStart: 17, cEnd: 19 },
  ]

  for (const c of cardBorderRanges) {
    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex: c.rStart, endRowIndex: c.rEnd, startColumnIndex: c.cStart, endColumnIndex: c.cEnd },
        top: { style: 'SOLID', color: COLORS.BORDER_DARK },
        bottom: { style: 'SOLID', color: COLORS.BORDER_DARK },
        left: { style: 'SOLID', color: COLORS.BORDER_DARK },
        right: { style: 'SOLID', color: COLORS.BORDER_DARK },
        innerHorizontal: { style: 'SOLID', color: COLORS.BORDER_LIGHT },
        innerVertical: { style: 'SOLID', color: COLORS.BORDER_LIGHT },
      },
    })
  }

  // Column Widths (Cols A to S)
  const colWidths = [
    { idx: 0, width: 145 }, // A: Stage
    { idx: 1, width: 65 },  // B: Match
    { idx: 2, width: 145 }, // C: Home Team
    { idx: 3, width: 145 }, // D: Away Team
    { idx: 4, width: 55 },  // E: Score A
    { idx: 5, width: 55 },  // F: Score B
    { idx: 6, width: 155 }, // G: Winner
    { idx: 7, width: 22 },  // H: Separator
    { idx: 8, width: 135 }, // I: R16 Team
    { idx: 9, width: 38 },  // J: R16 Score
    { idx: 10, width: 22 }, // K: Separator
    { idx: 11, width: 135 },// L: QF Team
    { idx: 12, width: 38 }, // M: QF Score
    { idx: 13, width: 22 }, // N: Separator
    { idx: 14, width: 135 },// O: SF Team
    { idx: 15, width: 38 }, // P: SF Score
    { idx: 16, width: 22 }, // Q: Separator
    { idx: 17, width: 140 },// R: Final Team
    { idx: 18, width: 38 }, // S: Final Score
  ]

  for (const cw of colWidths) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: cw.idx, endIndex: cw.idx + 1 },
        properties: { pixelSize: cw.width },
        fields: 'pixelSize',
      },
    })
  }

  // Row Heights
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
      properties: { pixelSize: 38 }, // Row 1 Title
      fields: 'pixelSize',
    },
  })
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
      properties: { pixelSize: 25 }, // Row 2 Subtitle
      fields: 'pixelSize',
    },
  })
  requests.push({
    updateDimensionProperties: {
      range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 },
      properties: { pixelSize: 28 }, // Row 4 Table Header
      fields: 'pixelSize',
    },
  })

  // Match rows height (Rows 5 to 22)
  for (let r = 4; r < 22; r++) {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: r, endIndex: r + 1 },
        properties: { pixelSize: 24 },
        fields: 'pixelSize',
      },
    })
  }

  console.log(`[SuperCup] Sending batchUpdate with ${requests.length} formatting operations...`)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { requests },
  })

  console.log('===========================================================')
  console.log('✅ SUPER CUP DASHBOARD INITIALIZATION COMPLETE!')
  console.log('===========================================================')
}

main().catch((err) => {
  console.error('❌ Error initializing Super Cup layout:', err)
  process.exit(1)
})
