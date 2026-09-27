/**
 * Initialize the H2H_League tab with a clean, readable layout.
 *
 * Layout (20 cols wide):
 *   Group A: cols A-I (1 GW col + 4 matches × 2 cols: home name, home score)
 *   Separator: col J
 *   Group B: cols K-S (same layout)
 *   Each match's home cell shows "Home\nvs\nAway" (with newlines for vertical display)
 *
 * Team name columns: B, D, F, H (Group A), L, N, P, R (Group B) - wider
 * Score columns: C, E, G, I, M, O, Q, S - narrow
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

const auth = getGoogleAuth()
const sheets = google.sheets({ version: 'v4', auth })
const ssId = process.env.GOOGLE_SHEET_ID

// All fixtures (home, away)
const H2H_FIXTURES = {
  'GW3-GroupA': [['Aguilas Dorados', 'Reds'], ['Aztec Blinders', 'Meridian Athletic'], ['Choakers FC', 'Mamangam DC'], ['Iberian Wizards', 'La Pulga']],
  'GW3-GroupB': [['Aura Farmers', 'xG Illuminati'], ['Committe Team', 'Relegated FC'], ['Jogo Bonito', 'Phoenix Flyers'], ['Kroos Control', 'Mancunians']],
  'GW4-GroupA': [['Aguilas Dorados', 'Meridian Athletic'], ['Reds', 'Mamangam DC'], ['Aztec Blinders', 'La Pulga'], ['Choakers FC', 'Iberian Wizards']],
  'GW4-GroupB': [['Aura Farmers', 'Relegated FC'], ['xG Illuminati', 'Phoenix Flyers'], ['Committe Team', 'Mancunians'], ['Jogo Bonito', 'Kroos Control']],
  'GW6-GroupA': [['Aguilas Dorados', 'Mamangam DC'], ['Meridian Athletic', 'La Pulga'], ['Reds', 'Iberian Wizards'], ['Aztec Blinders', 'Choakers FC']],
  'GW6-GroupB': [['Aura Farmers', 'Phoenix Flyers'], ['Relegated FC', 'Mancunians'], ['xG Illuminati', 'Kroos Control'], ['Committe Team', 'Jogo Bonito']],
  'GW7-GroupA': [['Aguilas Dorados', 'La Pulga'], ['Mamangam DC', 'Iberian Wizards'], ['Meridian Athletic', 'Choakers FC'], ['Reds', 'Aztec Blinders']],
  'GW7-GroupB': [['Aura Farmers', 'Mancunians'], ['Phoenix Flyers', 'Kroos Control'], ['Relegated FC', 'Jogo Bonito'], ['xG Illuminati', 'Committe Team']],
  'GW9-GroupA': [['Aguilas Dorados', 'Iberian Wizards'], ['La Pulga', 'Choakers FC'], ['Mamangam DC', 'Aztec Blinders'], ['Meridian Athletic', 'Reds']],
  'GW9-GroupB': [['Aura Farmers', 'Kroos Control'], ['Mancunians', 'Jogo Bonito'], ['Phoenix Flyers', 'Committe Team'], ['Relegated FC', 'xG Illuminati']],
  'GW10-GroupA': [['Aguilas Dorados', 'Choakers FC'], ['Iberian Wizards', 'Aztec Blinders'], ['La Pulga', 'Reds'], ['Mamangam DC', 'Meridian Athletic']],
  'GW10-GroupB': [['Aura Farmers', 'Jogo Bonito'], ['Kroos Control', 'Committe Team'], ['Mancunians', 'xG Illuminati'], ['Phoenix Flyers', 'Relegated FC']],
  'GW12-GroupA': [['Aguilas Dorados', 'Aztec Blinders'], ['Choakers FC', 'Reds'], ['Iberian Wizards', 'Meridian Athletic'], ['La Pulga', 'Mamangam DC']],
  'GW12-GroupB': [['Aura Farmers', 'Committe Team'], ['Jogo Bonito', 'xG Illuminati'], ['Kroos Control', 'Relegated FC'], ['Mancunians', 'Phoenix Flyers']],
  'GW13-GroupA': [['Reds', 'Aguilas Dorados'], ['Meridian Athletic', 'Aztec Blinders'], ['Mamangam DC', 'Choakers FC'], ['La Pulga', 'Iberian Wizards']],
  'GW13-GroupB': [['xG Illuminati', 'Aura Farmers'], ['Relegated FC', 'Committe Team'], ['Phoenix Flyers', 'Jogo Bonito'], ['Mancunians', 'Kroos Control']],
  'GW14-GroupA': [['Meridian Athletic', 'Aguilas Dorados'], ['Mamangam DC', 'Reds'], ['La Pulga', 'Aztec Blinders'], ['Iberian Wizards', 'Choakers FC']],
  'GW14-GroupB': [['Relegated FC', 'Aura Farmers'], ['Phoenix Flyers', 'xG Illuminati'], ['Mancunians', 'Committe Team'], ['Kroos Control', 'Jogo Bonito']],
  'GW16-GroupA': [['Mamangam DC', 'Aguilas Dorados'], ['La Pulga', 'Meridian Athletic'], ['Iberian Wizards', 'Reds'], ['Choakers FC', 'Aztec Blinders']],
  'GW16-GroupB': [['Phoenix Flyers', 'Aura Farmers'], ['Mancunians', 'Relegated FC'], ['Kroos Control', 'xG Illuminati'], ['Jogo Bonito', 'Committe Team']],
  'GW17-GroupA': [['La Pulga', 'Aguilas Dorados'], ['Iberian Wizards', 'Mamangam DC'], ['Choakers FC', 'Meridian Athletic'], ['Aztec Blinders', 'Reds']],
  'GW17-GroupB': [['Mancunians', 'Aura Farmers'], ['Kroos Control', 'Phoenix Flyers'], ['Jogo Bonito', 'Relegated FC'], ['Committe Team', 'xG Illuminati']],
  'GW18-GroupA': [['Iberian Wizards', 'Aguilas Dorados'], ['Choakers FC', 'La Pulga'], ['Aztec Blinders', 'Mamangam DC'], ['Reds', 'Meridian Athletic']],
  'GW18-GroupB': [['Kroos Control', 'Aura Farmers'], ['Jogo Bonito', 'Mancunians'], ['Committe Team', 'Phoenix Flyers'], ['xG Illuminati', 'Relegated FC']],
  'GW19-GroupA': [['Choakers FC', 'Aguilas Dorados'], ['Aztec Blinders', 'Iberian Wizards'], ['Reds', 'La Pulga'], ['Meridian Athletic', 'Mamangam DC']],
  'GW19-GroupB': [['Jogo Bonito', 'Aura Farmers'], ['Committe Team', 'Kroos Control'], ['xG Illuminati', 'Mancunians'], ['Relegated FC', 'Phoenix Flyers']],
  'GW20-GroupA': [['Aztec Blinders', 'Aguilas Dorados'], ['Reds', 'Choakers FC'], ['Meridian Athletic', 'Iberian Wizards'], ['Mamangam DC', 'La Pulga']],
  'GW20-GroupB': [['Committe Team', 'Aura Farmers'], ['xG Illuminati', 'Jogo Bonito'], ['Relegated FC', 'Kroos Control'], ['Phoenix Flyers', 'Mancunians']],
}

const H2H_GWS = [3, 4, 6, 7, 9, 10, 12, 13, 14, 16, 17, 18, 19, 20]

const groupATeams = ['Aguilas Dorados', 'Reds', 'Aztec Blinders', 'Meridian Athletic',
  'Choakers FC', 'Mamangam DC', 'Iberian Wizards', 'La Pulga']
const groupBTeams = ['Aura Farmers', 'xG Illuminati', 'Committe Team', 'Relegated FC',
  'Jogo Bonito', 'Phoenix Flyers', 'Kroos Control', 'Mancunians']

// Build the layout — exactly 18 cols
const data = []

// Row 1: Title
data.push(['H2H LEAGUE', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])

// Row 2: Group labels (Group A in A-I, Group B in K-S)
data.push(['GROUP A', '', '', '', '', '', '', '', '', 'GROUP B', '', '', '', '', '', '', '', ''])

// Row 3: blank
data.push([])

// Row 4: column headers
// Group A: A=GW, B=GA1 team, C=GA1 score, D=GA2 team, E=GA2 score, F=GA3 team, G=GA3 score, H=GA4 team, I=GA4 score
// Group B: K=GW (sep J), L=GB1 team, M=GB1 score, N=GB2 team, O=GB2 score, P=GB3 team, Q=GB3 score, R=GB4 team, S=GB4 score
data.push([
  'GW', 'GA1', '', 'GA2', '', 'GA3', '', 'GA4', '', '',
  'GB1', '', 'GB2', '', 'GB3', '', 'GB4', ''
])

// Rows 5-18: 14 GWs of fixtures, one row per GW
// Team name format: "Home\nvs\nAway" so it wraps in the cell
for (let i = 0; i < H2H_GWS.length; i++) {
  const gw = H2H_GWS[i]
  const groupA = H2H_FIXTURES[`GW${gw}-GroupA`]
  const groupB = H2H_FIXTURES[`GW${gw}-GroupB`]
  const fmt = (m) => `${m[0]}\nvs\n${m[1]}` // multiline
  const row = [
    `GW${gw}`,
    fmt(groupA[0]), '', fmt(groupA[1]), '', fmt(groupA[2]), '', fmt(groupA[3]), '',
    '', // col J = separator
    fmt(groupB[0]), '', fmt(groupB[1]), '', fmt(groupB[2]), '', fmt(groupB[3]), ''
  ]
  data.push(row)
}

// Row 19: blank
data.push([])

// Row 20: STANDINGS header
data.push(['=== STANDINGS ===', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])

// Row 21: column headers
data.push([
  'Pos', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts',  // A-J (Group A)
  'Pos', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts',  // K-T (Group B) — 20 cols total
])

// Rows 22-29: Standings placeholders
for (let i = 0; i < 8; i++) {
  data.push([
    i + 1, groupATeams[i], 0, 0, 0, 0, 0, 0, 0, 0,
    i + 1, groupBTeams[i], 0, 0, 0, 0, 0, 0, 0, 0
  ])
}

// Row 30: blank
data.push([])

// Row 31: KNOCKOUT header
data.push(['=== KNOCKOUT BRACKET (Top 2 of each group advance) ===', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])

// Row 32: column headers
data.push(['STAGE', 'Match', 'Home', '', 'Away', '', 'Winner', '', '', '', '', '', '', '', '', '', '', '', ''])

// Rows 33-36: Knockout matches
data.push(['SEMI FINAL 1 (GW22)', 'SF1', 'A1', '', 'B2', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
data.push(['SEMI FINAL 2 (GW22)', 'SF2', 'B1', '', 'A2', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])
data.push([])
data.push(['FINAL (GW24)', 'F1', 'Winner SF1', '', 'Winner SF2', '', '', '', '', '', '', '', '', '', '', '', '', '', ''])

console.log(`[H2H Init] Writing ${data.length} rows of side-by-side layout...`)
await sheets.spreadsheets.values.clear({ spreadsheetId: ssId, range: 'H2H_League!A1:Z200' })
await sheets.spreadsheets.values.update({
  spreadsheetId: ssId,
  range: 'H2H_League!A1',
  valueInputOption: 'USER_ENTERED',
  requestBody: { values: data },
})
console.log('[H2H Init] ✅ Layout written')

// Apply formatting
const meta = await sheets.spreadsheets.get({ spreadsheetId: ssId })
const h2hSheet = meta.data.sheets.find((s) => s.properties.title === 'H2H_League')
const sheetId = h2hSheet.properties.sheetId

const COLORS = {
  TITLE: { red: 0.13, green: 0.20, blue: 0.40 },
  GROUP_A: { red: 0.20, green: 0.40, blue: 0.70 },
  GROUP_B: { red: 0.65, green: 0.20, blue: 0.30 },
  COL_HEADER: { red: 0.85, green: 0.85, blue: 0.85 },
  STAGE: { red: 0.30, green: 0.50, blue: 0.30 },
  WHITE: { red: 1, green: 1, blue: 1 },
  ALT: { red: 0.96, green: 0.96, blue: 0.96 },
  GW_BG: { red: 0.92, green: 0.92, blue: 0.95 },
}

const requests = []

// Title (all 20 cols)
requests.push({
  repeatCell: {
    range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 20 },
    cell: { userEnteredFormat: { backgroundColor: COLORS.TITLE, textFormat: { bold: true, fontSize: 18, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
  },
})
// Group A label (A2:I2)
requests.push({
  repeatCell: {
    range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 9 },
    cell: { userEnteredFormat: { backgroundColor: COLORS.GROUP_A, textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
  },
})
// Group B label (K2:S2)
requests.push({
  repeatCell: {
    range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 10, endColumnIndex: 19 },
    cell: { userEnteredFormat: { backgroundColor: COLORS.GROUP_B, textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
  },
})
// Column headers (row 4, all 20 cols)
requests.push({
  repeatCell: {
    range: { sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: 20 },
    cell: { userEnteredFormat: { backgroundColor: COLORS.COL_HEADER, textFormat: { bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
  },
})
// Standings header (row 20)
requests.push({
  repeatCell: {
    range: { sheetId, startRowIndex: 19, endRowIndex: 20, startColumnIndex: 0, endColumnIndex: 20 },
    cell: { userEnteredFormat: { backgroundColor: COLORS.STAGE, textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
  },
})
// Standings col headers (row 21)
requests.push({
  repeatCell: {
    range: { sheetId, startRowIndex: 20, endRowIndex: 21, startColumnIndex: 0, endColumnIndex: 20 },
    cell: { userEnteredFormat: { backgroundColor: COLORS.COL_HEADER, textFormat: { bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER' } },
    fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
  },
})
// Standings rows alternating colors
for (let i = 0; i < 8; i++) {
  const bg = i % 2 === 0 ? COLORS.WHITE : COLORS.ALT
  requests.push({
    repeatCell: { range: { sheetId, startRowIndex: 21 + i, endRowIndex: 22 + i, startColumnIndex: 0, endColumnIndex: 20 }, cell: { userEnteredFormat: { backgroundColor: bg } }, fields: 'userEnteredFormat.backgroundColor' },
  })
}
// Fixture rows alternating colors + wrap + bold GW column
for (let i = 0; i < 14; i++) {
  const bg = i % 2 === 0 ? COLORS.WHITE : COLORS.ALT
  requests.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 4 + i, endRowIndex: 5 + i, startColumnIndex: 0, endColumnIndex: 20 },
      cell: { userEnteredFormat: { backgroundColor: bg, textFormat: { fontSize: 10 }, horizontalAlignment: 'CENTER', wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } },
      fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy,verticalAlignment)',
    },
  })
}
requests.push({
  repeatCell: { range: { sheetId, startRowIndex: 4, endRowIndex: 18, startColumnIndex: 0, endColumnIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 11 }, backgroundColor: COLORS.GW_BG } }, fields: 'userEnteredFormat(textFormat,backgroundColor)' },
})
// Knockout header (row 31)
requests.push({
  repeatCell: { range: { sheetId, startRowIndex: 30, endRowIndex: 31, startColumnIndex: 0, endColumnIndex: 20 }, cell: { userEnteredFormat: { backgroundColor: COLORS.STAGE, textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' },
})
requests.push({
  repeatCell: { range: { sheetId, startRowIndex: 31, endRowIndex: 32, startColumnIndex: 0, endColumnIndex: 20 }, cell: { userEnteredFormat: { backgroundColor: COLORS.COL_HEADER, textFormat: { bold: true, fontSize: 10 }, horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)' },
})

// Borders
for (const [start, end] of [[3, 18], [19, 30], [30, 37]]) {
  requests.push({
    updateBorders: {
      range: { sheetId, startRowIndex: start, endRowIndex: end, startColumnIndex: 0, endColumnIndex: 20 },
      top: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
      bottom: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
      left: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
      right: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } },
      innerHorizontal: { style: 'SOLID', color: { red: 0.7, green: 0.7, blue: 0.7 } },
      innerVertical: { style: 'SOLID', color: { red: 0.7, green: 0.7, blue: 0.7 } },
    },
  })
}

// Column widths — 20 columns
requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 45 }, fields: 'pixelSize' } })
// Team name columns (B, D, F, H, L, N, P, R): 110px each
for (const idx of [1, 3, 5, 7, 11, 13, 15, 17]) {
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 }, properties: { pixelSize: 110 }, fields: 'pixelSize' } })
}
// Score columns (C, E, G, I, M, O, Q, S): 30px
for (const idx of [2, 4, 6, 8, 12, 14, 16, 18]) {
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 }, properties: { pixelSize: 30 }, fields: 'pixelSize' } })
  // Separator cols (J, T)
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 }, properties: { pixelSize: 12 }, fields: 'pixelSize' } })
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 19, endIndex: 20 }, properties: { pixelSize: 12 }, fields: 'pixelSize' } })
  // Standings narrow cols (C-J, M-T)
  for (const idx of [2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19]) {
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } })
  }

  // Freeze top 4 rows
  requests.push({ updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 4 } }, fields: 'gridProperties.frozenRowCount' } })
  // Row heights
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } })
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 28 }, fields: 'pixelSize' } })
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 26 }, fields: 'pixelSize' } })
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 4, endIndex: 18 }, properties: { pixelSize: 48 }, fields: 'pixelSize' } })
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 19, endIndex: 20 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } })
  requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 30, endIndex: 31 }, properties: { pixelSize: 32 }, fields: 'pixelSize' } })

  console.log(`[H2H Init] Applying ${requests.length} formatting requests...`)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: ssId,
    requestBody: { requests },
  })
  console.log('[H2H Init] ✅ Formatting applied')
  console.log('\nFinal layout:')
  console.log('  Row 1:    H2H LEAGUE (title)')
  console.log('  Row 2:    GROUP A | GROUP B labels')
  console.log('  Row 4:    Column headers (frozen)')
  console.log('  Rows 5-18: 14 GWs of fixtures (side by side, 2 cols per match)')
  console.log('            Team cells contain "Home\\nvs\\nAway" (multiline)')
  console.log('  Row 20:   === STANDINGS ===')
  console.log('  Rows 22-29: Standings (8 teams per group, side by side)')
  console.log('  Row 31:   === KNOCKOUT BRACKET ===')
}