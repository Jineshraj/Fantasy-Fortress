import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../src/lib/auth.js'
import { normalizeName, resolvePlayerDetails } from '../src/services/rosterValidator.js'
import { calculatePlayerPoints } from '../src/services/sofaScoreSyncService.js'
import { calculateApiFootballFantasyPoints } from '../src/services/apiFootballSyncService.js'

async function checkDrift() {
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = process.env.GOOGLE_SHEET_ID

  const playersRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Players!A2:E' })
  const playerPosMap = new Map()
  const playerClubMap = new Map()
  const playerCanonicalMap = new Map()
  ;(playersRes.data.values || []).forEach(r => {
    const name = String(r[1] || '').trim()
    const pos = String(r[3] || 'MID').trim().toUpperCase()
    const club = String(r[4] || '').trim()
    if (name) {
      const norm = normalizeName(name)
      playerClubMap.set(norm, club)
      playerPosMap.set(norm, pos)
      playerCanonicalMap.set(norm, name)
    }
  })

  const aliasRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Player_Aliases!A2:D' })
  const playerAliasMap = new Map()
  ;(aliasRes.data.values || []).forEach(r => {
    const aliasName = String(r[0] || '').trim()
    const canonicalName = String(r[2] || '').trim()
    const club = String(r[3] || '').trim()
    if (aliasName && canonicalName) {
      playerAliasMap.set(normalizeName(aliasName), { aliasName, canonicalName, club })
    }
  })

  function normalizePos(p) {
    if (p === 'GKP' || p === 'GK') return 'GK'
    if (p === 'D' || p === 'DEF') return 'DEF'
    if (p === 'M' || p === 'MID') return 'MID'
    if (p === 'F' || p === 'FWD' || p === 'FOR') return 'FWD'
    return p || 'MID'
  }

  for (const tab of ['SofaScore_Staging', 'API_Football_Staging']) {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${tab}!A2:N` })
    const rows = res.data.values || []
    const drift = []

    rows.forEach((r, idx) => {
      if (String(r[0]).trim() !== '5') return
      const sheetRow = idx + 2
      const mId = String(r[1] || '').trim()
      const pName = String(r[2] || '').trim()
      const club = String(r[3] || '').trim()
      const minutes = Number(r[4] || 0) || 0
      const goals = Number(r[5] || 0) || 0
      const assists = Number(r[6] || 0) || 0
      const cs = String(r[7] || '').trim().toUpperCase() === 'TRUE'
      const penMiss = Number(r[8] || 0) || 0
      const penSave = Number(r[9] || 0) || 0
      const yellow = Number(r[10] || 0) || 0
      const red = Number(r[11] || 0) || 0
      const ownGoals = Number(r[12] || 0) || 0
      const currentPts = Number(r[13] || 0) || 0

      const resolved = resolvePlayerDetails({
        rawName: pName,
        clubName: club,
        playerPositionMap: playerPosMap,
        playerClubMap,
        playerCanonicalMap,
        playerAliasMap,
      })
      const fantasyPos = normalizePos(resolved.pos || playerPosMap.get(normalizeName(pName)))

      let newPts
      if (tab === 'SofaScore_Staging') {
        newPts = calculatePlayerPoints(
          { minutes, goals, assists, clean_sheet: cs, pen_miss: penMiss, pen_save: penSave, yellow, red, own_goals: ownGoals },
          fantasyPos
        )
      } else {
        newPts = calculateApiFootballFantasyPoints({
          minutes,
          goalsScored: goals,
          assists,
          conceded: 0,
          penaltiesSaved: penSave,
          penaltiesMissed: penMiss,
          yellowCards: yellow,
          redCards: red,
          ownGoals,
          isCleanSheet: cs,
          pos: fantasyPos,
        })
      }

      if (newPts !== currentPts) {
        drift.push({ sheetRow, mId, pName, club, fantasyPos, minutes, goals, assists, currentPts, newPts })
      }
    })

    console.log(`=== ${tab} DRIFT COUNT: ${drift.length} ===`)
    drift.forEach(d => console.log(`  Row ${d.sheetRow} (Match ${d.mId}): ${d.pName} (${d.club}, ${d.fantasyPos}) mins=${d.minutes} G=${d.goals} A=${d.assists}: currentPts=${d.currentPts} -> shouldBe=${d.newPts}`))

    if (process.argv.includes('--fix') && drift.length > 0) {
      console.log(`Patching ${drift.length} rows in ${tab}...`)
      const updates = drift.map(d => ({
        range: `${tab}!N${d.sheetRow}`,
        values: [[String(d.newPts)]]
      }))

      // Batch in chunks of 10
      for (let i = 0; i < updates.length; i += 10) {
        const chunk = updates.slice(i, i + 10)
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: {
            valueInputOption: 'USER_ENTERED',
            data: chunk
          }
        })
      }
      console.log(`✅ Successfully patched ${tab}!`)
    }
  }
}

checkDrift()

