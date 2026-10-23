import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { syncStadiumPoints } from '../src/services/stadiumService.js'
import { calculateAndSyncTeamScores } from '../src/services/scoringEngine.js'
import { syncAllToSupabase } from '../src/services/supabaseSyncService.js'

async function fixRennesFixture() {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID

  console.log('===========================================================')
  console.log('🔧 FIXING DUPLICATE RENNES FIXTURE IN FIXTURE_STAGING')
  console.log('===========================================================')

  // 1. Get sheetId for Fixture_Staging
  const metaRes = await sheets.spreadsheets.get({ spreadsheetId })
  const fixtureSheet = metaRes.data.sheets.find(s => s.properties.title === 'Fixture_Staging')
  if (!fixtureSheet) throw new Error('Fixture_Staging sheet not found')
  const sheetId = fixtureSheet.properties.sheetId

  // 2. Fetch all rows in Fixture_Staging
  const fixRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A1:J',
  })
  const rows = fixRes.data.values || []

  // Find the two Rennes vs Auxerre rows for GW7
  const rennesIndices = []
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (String(r[0]).trim() === '7' && r.join(' ').toLowerCase().includes('auxerre')) {
      rennesIndices.push({ rowIdx: i + 1, arrayIdx: i, data: r })
    }
  }

  console.log('Found Rennes rows:', rennesIndices.length)
  rennesIndices.forEach(item => {
    console.log(`  Row ${item.rowIdx}:`, item.data)
  })

  if (rennesIndices.length !== 2) {
    console.warn(`Expected exactly 2 Rennes rows, found ${rennesIndices.length}. Aborting.`);
    return
  }

  const [row1, row2] = rennesIndices

  // Merge into row1:
  // gw, date, league, home_team, away_team, sofa_id, af_id, status, home_score, away_score
  const sofaId = row1.data[5] || row2.data[5] || '16310973'
  const afId = row1.data[6] || row2.data[6] || '1552781'
  const mergedRow = [
    '7',
    '2026-10-11',
    'Ligue 1',
    'Stade Rennais FC',
    'AJ Auxerre',
    sofaId,
    afId,
    'FINISHED',
    '4',
    '1',
  ]

  console.log(`\nUpdating Row ${row1.rowIdx} with merged data:`, mergedRow)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Fixture_Staging!A${row1.rowIdx}:J${row1.rowIdx}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [mergedRow] },
  })

  console.log(`Deleting duplicate Row ${row2.rowIdx} (0-indexed: ${row2.arrayIdx})...`)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: row2.arrayIdx,
              endIndex: row2.arrayIdx + 1,
            },
          },
        },
      ],
    },
  })
  console.log('✅ Duplicate row deleted from Fixture_Staging!')

  // 3. Re-sync Stadium Points
  console.log('\n--- Syncing Stadium Points for GW7 ---')
  await syncStadiumPoints(7)

  // 4. Re-calculate and Sync Team Scores
  console.log('\n--- Calculating and Updating Team Scores for GW7 ---')
  const scoreResult = await calculateAndSyncTeamScores(7)

  // 5. Mirror to Supabase
  console.log('\n--- Mirroring to Supabase PostgreSQL for GW7 ---')
  await syncAllToSupabase(7, scoreResult?.teamResults)

  console.log('\n🎉 ALL DONE! Committe Team Roazhon Park stadium points and totals are now fixed!')
}

fixRennesFixture().catch(console.error)
