import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName, getSimilarityScore, cleanClubName, isSameClub, resolvePlayerDetails } from './rosterValidator.js'
import { HOME_CLUB_ALIASES, matchHomeClub } from './stadiumService.js'
import { getActiveGameweek } from './sheetsService.js'
import { MASTER_TOP5_CLUBS } from './fixtureService.js'
import { calculatePlayerPoints } from './sofaScoreSyncService.js'
import { calculateApiFootballFantasyPoints } from './apiFootballSyncService.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID

/**
 * Syncs active tournament players into Comparison_Dashboard (Dual-Source Cross-Check)
 */
export async function syncComparisonDashboard(targetGw) {
  if (!targetGw) {
    targetGw = await getActiveGameweek()
  }

  console.log('===========================================================')
  console.log(`📊 POPULATING COMPARISON DASHBOARD FOR GW${targetGw}`)
  console.log('===========================================================')

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // 0. Read existing Comparison_Dashboard to track prior state & preserve true Admin Manual Approvals (Column H)
  const existingDashboardMap = new Map()
  try {
    const existingDashRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Comparison_Dashboard!A2:J',
    })
    const existingRows = existingDashRes.data.values || []
    existingRows.forEach((r) => {
      const tName = String(r[0] || '').trim()
      const pName = String(r[1] || '').trim()
      const existingGw = String(r[9] || '').trim()
      const existingStatus = String(r[6] || '').trim().toUpperCase()
      const approvedPts = r[7] !== undefined && r[7] !== '' ? String(r[7]).trim() : null
      const existingSofa = r[4] !== undefined && r[4] !== '' && !isNaN(Number(r[4])) ? Number(r[4]) : null
      const existingAf = r[5] !== undefined && r[5] !== '' && !isNaN(Number(r[5])) ? Number(r[5]) : null

      // CRITICAL: NEVER carry over approvals from a different Gameweek!
      if (existingGw !== String(targetGw)) return

      if (tName && pName) {
        const key = `${targetGw}_${normalizeName(tName)}_${normalizeName(pName)}`
        const hasApprovedVal = approvedPts !== null && !isNaN(Number(approvedPts))
        // A true admin override is when the row was explicitly marked MANUAL_OVERRIDE,
        // or when an admin typed an approval into a DISCREPANCY, or when approved points
        // diverge from the provider numbers. Auto-verified rows where both providers matched
        // are NOT treated as immutable admin overrides.
        const isTrueAdminOverride = hasApprovedVal && (
          existingStatus === 'MANUAL_OVERRIDE' ||
          existingStatus === 'DISCREPANCY' ||
          (existingSofa !== null && existingAf !== null && existingSofa !== existingAf)
        )

        existingDashboardMap.set(key, {
          sofaPts: existingSofa,
          afPts: existingAf,
          status: existingStatus,
          approvedPts: hasApprovedVal ? Number(approvedPts) : null,
          isTrueAdminOverride,
        })
      }
    })
    if (existingDashboardMap.size > 0) {
      console.log(`[Dashboard] Checked ${existingDashboardMap.size} existing rows for manual approvals / prior match state.`)
    }
  } catch (e) {
    console.log('[Dashboard] No existing Comparison_Dashboard found or empty.')
  }

  // 1. Load Submitted Tournament Lineups for target GW from Lineup_Rosters
  console.log('\n[1/5] Loading submitted tournament players from "Lineup_Rosters"...')
  const rosterRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Lineup_Rosters!A2:H',
  })
  const rosterRows = (rosterRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
  console.log(`Loaded ${rosterRows.length} submitted roster rows for GW${targetGw}.`)

  // 2. Load Master Player Positions & Clubs from 'Players' tab
  console.log('\n[2/5] Loading player clubs & positions from "Players" tab...')
  const playersRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Players!A2:E',
  })
  const playerClubMap = new Map()
  const playerPosMap = new Map()
  const playerCanonicalMap = new Map()
  ;(playersRes.data.values || []).forEach((r) => {
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

  // Load Player_Aliases sheet (manual overrides / abbreviated forms)
  const playerAliasMap = new Map()
  try {
    const aliasRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Player_Aliases!A2:D',
    })
    for (const r of aliasRes.data.values || []) {
      const aliasName = String(r[0] || '').trim()
      const canonicalName = String(r[2] || '').trim()
      const club = String(r[3] || '').trim()
      if (aliasName && canonicalName) {
        playerAliasMap.set(normalizeName(aliasName), {
          aliasName,
          canonicalName,
          club,
        })
      }
    }
  } catch (err) {
    // Non-fatal if Player_Aliases is missing
  }

  // 2b. Defensive recompute of stale calculated_pts in staging tabs (runs BEFORE loading stats)
  // Walks every SofaScore_Staging and API_Football_Staging row for targetGw,
  // recomputes pts from raw stat columns using canonical position from Players tab,
  // and patches any row whose stored calculated_pts doesn't match BEFORE loading into dashboard.
  console.log('\n[2b] Defensively recomputing calculated_pts in staging tabs before load...')
  try {
    function normalizePosForRecompute(p) {
      if (p === 'GKP' || p === 'GK') return 'GK'
      if (p === 'D' || p === 'DEF') return 'DEF'
      if (p === 'M' || p === 'MID') return 'MID'
      if (p === 'F' || p === 'FWD' || p === 'FOR') return 'FWD'
      return p || 'MID'
    }

    const stagingRecomputes = []
    for (const tab of ['SofaScore_Staging', 'API_Football_Staging']) {
      const fullSheetRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${tab}!A2:N`,
      })
      const fullSheetData = fullSheetRes.data.values || []

      for (let sheetRowIdx = 0; sheetRowIdx < fullSheetData.length; sheetRowIdx++) {
        const r = fullSheetData[sheetRowIdx]
        const gw = String(r[0] || '').trim()
        if (gw !== String(targetGw)) continue
        const sheetRow = sheetRowIdx + 2
        const player = String(r[2] || '').trim()
        const club = String(r[3] || '').trim()

        const resolved = resolvePlayerDetails({
          rawName: player,
          clubName: club,
          playerPositionMap: playerPosMap,
          playerClubMap,
          playerCanonicalMap,
          playerAliasMap,
        })
        const fantasyPos = normalizePosForRecompute(resolved.pos || playerPosMap.get(normalizeName(player)))

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
          stagingRecomputes.push({ range: `${tab}!N${sheetRow}`, values: [[String(newPts)]] })
        }
      }
    }

    if (stagingRecomputes.length > 0) {
      console.log(`[2b] Found ${stagingRecomputes.length} stale staging row(s) to patch...`)
      for (let i = 0; i < stagingRecomputes.length; i += 10) {
        const chunk = stagingRecomputes.slice(i, i + 10)
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId,
          requestBody: { valueInputOption: 'USER_ENTERED', data: chunk },
        })
      }
      console.log(`[2b] ✅ Staging tables patched and clean!`)
    } else {
      console.log('[2b] ✅ All calculated_pts values already match current formula')
    }
  } catch (err) {
    console.error('[2b] ⚠️ Defensive recompute failed (non-fatal):', err.message)
  }

  // 3. Load Staged Player Stats from SofaScore_Staging (Col N = calculated_pts, index 13)
  console.log('\n[3/5] Loading match stats from "SofaScore_Staging"...')
  const sofaRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SofaScore_Staging!A2:N',
  })
  const sofaRows = (sofaRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
  console.log(`Loaded ${sofaRows.length} player performance rows from "SofaScore_Staging".`)

  const sofaAggMap = new Map()
  sofaRows.forEach((r) => {
    const pName = String(r[2] || '').trim()
    const pts = Number(r[13] || 0)
    const penSave = Number(r[9] || 0)
    const club = String(r[3] || '').trim()
    if (pName) {
      const norm = normalizeName(pName)
      // Aggregate by player name only (handles double-gameweek where club field may differ
      // due to cleanClubName removing parts of the club name like "Real Betis Balompié" -> "Real Betis")
      const key = norm
      if (sofaAggMap.has(key)) {
        const existing = sofaAggMap.get(key)
        existing.pts += pts
        existing.penSave = (existing.penSave || 0) + penSave
        existing.matchCount = (existing.matchCount || 1) + 1
      } else {
        const resolved = resolvePlayerDetails({
          rawName: pName,
          clubName: club,
          playerPositionMap: playerPosMap,
          playerClubMap,
          playerCanonicalMap,
          playerAliasMap,
        })
        const pos = resolved.pos || playerPosMap.get(norm) || ''
        const canonNorm = resolved.canonicalName ? normalizeName(resolved.canonicalName) : norm
        sofaAggMap.set(key, { normName: norm, canonicalNorm: canonNorm, name: pName, club, pos, pts, penSave, matchCount: 1 })
      }
    }
  })
  const sofaStatsList = Array.from(sofaAggMap.values())

  // 4. Load Staged Player Stats from API_Football_Staging (Col N = calculated_pts, index 13)
  console.log('\n[4/5] Loading match stats from "API_Football_Staging"...')
  let apiFootballRows = []
  try {
    const apiFootballRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'API_Football_Staging!A2:N',
    })
    apiFootballRows = (apiFootballRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
    console.log(`Loaded ${apiFootballRows.length} player performance rows from "API_Football_Staging".`)
  } catch (e) {
    console.log('API_Football_Staging tab is empty or not yet created.')
  }

  const afAggMap = new Map()
  apiFootballRows.forEach((r) => {
    const pName = String(r[2] || '').trim()
    const pts = Number(r[13] !== undefined ? r[13] : 0)
    const penSave = Number(r[9] || 0)
    const club = String(r[3] || '').trim()
    if (pName) {
      const norm = normalizeName(pName)
      // Aggregate by player name only (handles double-gameweek, see comment in sofaAggMap)
      const key = norm
      if (afAggMap.has(key)) {
        const existing = afAggMap.get(key)
        existing.pts += pts
        existing.penSave = (existing.penSave || 0) + penSave
        existing.matchCount = (existing.matchCount || 1) + 1
      } else {
        const resolved = resolvePlayerDetails({
          rawName: pName,
          clubName: club,
          playerPositionMap: playerPosMap,
          playerClubMap,
          playerCanonicalMap,
          playerAliasMap,
        })
        const pos = resolved.pos || playerPosMap.get(norm) || ''
        const canonNorm = resolved.canonicalName ? normalizeName(resolved.canonicalName) : norm
        afAggMap.set(key, { normName: norm, canonicalNorm: canonNorm, name: pName, club, pos, pts, penSave, matchCount: 1 })
      }
    }
  })
  const apiFootballStatsList = Array.from(afAggMap.values())

  function getClubRootToken(clubName) {
    const norm = normalizeName(clubName)
    const stopWords = new Set(['fc', 'cf', 'afc', 'bc', 'calcio', 'sco', 'rc', 'club', 'de', 'stade', 'real', 'rcd', 'ssc', 'ac', 'as', 'us', 'ud', 'cd', 'ca', 'aj', 'la', 'coruna', 'saint', 'germain', 'rb', 'vfb', 'vfl', 'tsg', 'fsv', 'sv', 'sc'])
    const tokens = norm.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t))
    return tokens[0] || norm
  }

  const clubSameCache = new Map()
  function fastIsSameClub(cA, cB) {
    if (!cA || !cB) return true
    const k = `${cA}:::${cB}`
    if (clubSameCache.has(k)) return clubSameCache.get(k)
    const res = isSameClub(cA, cB)
    clubSameCache.set(k, res)
    return res
  }

  // Helper matching function with strict Position & Club awareness
  function findMatchInList(normName, club, position, statsList) {
    let bestMatch = null
    let highestScore = 0
    let bestIsSameClub = false
    const partsA = normName.split(/\s+/)

    for (const sData of statsList) {
      // Enforce Goalkeeper vs Outfield position compatibility (Bug 10)
      if (position && sData.pos) {
        const posA = String(position).toUpperCase().trim()
        const posB = String(sData.pos).toUpperCase().trim()
        const isGkA = posA === 'GK' || posA === 'GKP'
        const isGkB = posB === 'GK' || posB === 'GKP'
        if (isGkA !== isGkB) continue // Outfield player cannot match GK
      }

      const sameClub = club && sData.club ? fastIsSameClub(club, sData.club) : false
      const isExactMatch = normName === sData.normName || (sData.canonicalNorm && normName === sData.canonicalNorm)

      // If exact name match on same club, it's 100% authoritative - return immediately!
      if (isExactMatch && sameClub) {
        return sData
      }

      // Check initial+surname match heuristic (Option B defensive layer)
      let isInitialMatch = false
      const partsB = sData.normName.split(/\s+/)
      if (partsA.length >= 2 && partsA[0].length === 1) {
        const surnameA = partsA.slice(1).join(' ')
        if (sData.normName.startsWith(partsA[0]) && (sData.normName.endsWith(surnameA) || sData.normName.endsWith(' ' + surnameA))) {
          isInitialMatch = true
        }
      } else if (partsB.length >= 2 && partsB[0].length === 1) {
        const surnameB = partsB.slice(1).join(' ')
        if (normName.startsWith(partsB[0]) && (normName.endsWith(surnameB) || normName.endsWith(' ' + surnameB))) {
          isInitialMatch = true
        }
      }

      // Check same-club mononym / token containment heuristic (Tier 4)
      let isTokenMatch = false
      if (sameClub) {
        if (partsA.includes(sData.normName) || partsB.includes(normName)) {
          isTokenMatch = true
        }
      }

      let nameScore = getSimilarityScore(normName, sData.normName)
      if (isExactMatch) {
        nameScore = 1.0
      } else if (isInitialMatch || isTokenMatch) {
        nameScore = Math.max(nameScore, 0.90)
      }

      // If we already have a same-club match, NEVER replace it with a different-club candidate!
      if (bestIsSameClub && !sameClub) {
        continue
      }

      // Tier 5: same-club fuzzy match (≥ 0.80) — for "Athletic Club" vs "Athletic Bilbao" etc.
      if (sameClub && nameScore >= 0.80) {
        const isSamePos = position && sData.pos && (String(position).toUpperCase().trim() === String(sData.pos).toUpperCase().trim())
        const totalScore = nameScore + 0.1 + (isSamePos ? 0.05 : 0)
        if (totalScore > highestScore || (!bestIsSameClub && sameClub)) {
          highestScore = totalScore
          bestMatch = sData
          bestIsSameClub = true
        }
        continue
      }

      // Tier 6: global fuzzy match (≥ 0.88) — for nearly-identical names that the substring check missed
      if (nameScore >= 0.88) {
        // MONONYM & CROSS-CLUB GUARD:
        // 1. Single-token names (e.g., 'Wesley', 'Danilo', 'Pedri') can NEVER match globally across different clubs.
        // 2. If both clubs are known and different, do not match across different clubs.
        const isSingleToken = partsA.length === 1 || partsB.length === 1
        if (isSingleToken && !sameClub) {
          continue
        }
        if (club && sData.club && !sameClub) {
          continue
        }

        const totalScore = nameScore + (sameClub ? 0.1 : 0)
        if (totalScore > highestScore) {
          highestScore = totalScore
          bestMatch = sData
          bestIsSameClub = sameClub
        }
        continue
      }

      if (!isTokenMatch && !isInitialMatch && nameScore < 0.70 && !sData.normName.includes(normName) && !normName.includes(sData.normName)) {
        continue
      }

      if (club && sData.club) {
        if (!sameClub) continue
        const clubScore = 1.0
        const totalScore = nameScore * 0.7 + clubScore * 0.3 + 0.1
        if (totalScore > highestScore && totalScore >= 0.70) {
          highestScore = totalScore
          bestMatch = sData
          bestIsSameClub = true
        }
      } else {
        if (nameScore > highestScore && nameScore >= 0.82) {
          highestScore = nameScore
          bestMatch = sData
          bestIsSameClub = false
        }
      }
    }
    return bestMatch
  }

  // 5. Match Tournament Players against Staged Matches & Cross-Check
  console.log('\n[5/5] Cross-checking stats and assembling Comparison_Dashboard...')
  const dashboardRows = []
  const seenPlayerKeys = new Set()
  const unmatchedRosterPlayers = []
  const matchedSofaPlayerKeys = new Set()
  const matchedAfPlayerKeys = new Set()

  for (const r of rosterRows) {
    const teamName = String(r[1] || '').trim()
    const playerName = String(r[2] || '').trim()
    const normName = normalizeName(playerName)
    const club = playerClubMap.get(normName) || ''

    // Resolve canonical tournament player position using multi-tier resolver (A8.2)
    const resolved = resolvePlayerDetails({
      rawName: playerName,
      clubName: club,
      livePos: String(r[3] || 'MID').trim().toUpperCase(),
      playerPositionMap: playerPosMap,
      playerClubMap,
      playerCanonicalMap,
      playerAliasMap,
    })
    const position = resolved.pos

    const sofaMatch = findMatchInList(normName, club, position, sofaStatsList)
    const apiFootballMatch = findMatchInList(normName, club, position, apiFootballStatsList)

    if (sofaMatch) matchedSofaPlayerKeys.add(sofaMatch.normName)
    if (apiFootballMatch) matchedAfPlayerKeys.add(apiFootballMatch.normName)

    if (sofaMatch || apiFootballMatch) {
      const uniqueKey = `${teamName}_${playerName}`
      const keyLower = uniqueKey.toLowerCase()
      if (seenPlayerKeys.has(keyLower)) continue
      seenPlayerKeys.add(keyLower)

      const hasSofa = sofaMatch !== null && sofaMatch !== undefined
      const hasApi = apiFootballMatch !== null && apiFootballMatch !== undefined

      const sofaPts = hasSofa ? sofaMatch.pts : ''
      const apiFootballPts = hasApi ? apiFootballMatch.pts : ''

      const playerKey = `${targetGw}_${normalizeName(teamName)}_${normalizeName(playerName)}`
      const existing = existingDashboardMap.get(playerKey)

      const currentSofaNum = (hasSofa && sofaPts !== '' && !isNaN(Number(sofaPts))) ? Number(sofaPts) : null
      const currentAfNum = (hasApi && apiFootballPts !== '' && !isNaN(Number(apiFootballPts))) ? Number(apiFootballPts) : null

      // Detect if provider points have changed since previous run (e.g. from Match 2 in a DGW)
      const sofaChanged = existing && existing.sofaPts !== null && currentSofaNum !== null && (currentSofaNum !== existing.sofaPts)
      const afChanged = existing && existing.afPts !== null && currentAfNum !== null && (currentAfNum !== existing.afPts)
      const statsChanged = sofaChanged || afChanged

      let status = 'DISCREPANCY'
      let finalApprovedPts = ''

      // 1. If BOTH sources exist AND points match 100% -> Auto VERIFIED (updates dynamically for Match 1 & Match 2)
      if (hasSofa && hasApi && currentSofaNum !== null && currentAfNum !== null && currentSofaNum === currentAfNum) {
        status = 'VERIFIED'
        finalApprovedPts = currentSofaNum
      }
      // 2. Else if admin previously entered a true manual override AND stats have NOT changed -> preserve it
      else if (existing && existing.isTrueAdminOverride && existing.approvedPts !== null && !statsChanged) {
        status = 'MANUAL_OVERRIDE'
        finalApprovedPts = existing.approvedPts
      }
      // 3. Otherwise (sources disagree, or stats have changed in a DGW) -> STRICTLY DISCREPANCY with BLANK points for Admin review!
      else {
        status = 'DISCREPANCY'
        finalApprovedPts = ''
      }

      let syncStatus = 'PENDING'
      if (status === 'VERIFIED' && hasSofa && hasApi) syncStatus = 'SYNCED'
      else if (hasSofa && !hasApi) syncStatus = 'SOFA_ONLY'
      else if (!hasSofa && hasApi) syncStatus = 'API_ONLY'
      else syncStatus = 'PENDING'

      dashboardRows.push([
        teamName,
        playerName,
        club || (sofaMatch ? sofaMatch.club : apiFootballMatch?.club || ''),
        position,
        sofaPts,
        apiFootballPts,
        status,
        finalApprovedPts,
        syncStatus,
        targetGw,
      ])
    } else {
      unmatchedRosterPlayers.push({ teamName, playerName, club, position })
    }
  }

  // Sort rows alphabetically by Team Name then Player Name
  dashboardRows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))

  console.log(`Found ${dashboardRows.length} active tournament players with staged stats for GW${targetGw}!`)
  if (unmatchedRosterPlayers.length > 0) {
    console.log(`[Dashboard Diagnostic] ${unmatchedRosterPlayers.length} roster players had no staging match:`,
      unmatchedRosterPlayers.map((p) => `${p.playerName} (${p.club || 'No Club'})`).join(', ')
    )
  }

  // Diagnostic coverage for staging tables (A8.6)
  const unmatchedSofaCount = sofaStatsList.length - matchedSofaPlayerKeys.size
  const unmatchedAfCount = apiFootballStatsList.length - matchedAfPlayerKeys.size
  console.log(`[Staging Diagnostic] SofaScore staging entries matched: ${matchedSofaPlayerKeys.size}/${sofaStatsList.length} (${unmatchedSofaCount} non-tournament players)`)
  console.log(`[Staging Diagnostic] API-Football staging entries matched: ${matchedAfPlayerKeys.size}/${apiFootballStatsList.length} (${unmatchedAfCount} non-tournament players)`)

  // 6. Write cleanly to Comparison_Dashboard Tab
  const header = [
    'team_name', 'player_name', 'club', 'position',
    'sofascore_pts', 'api_football_pts', 'status', 'final_approved_pts', 'sync_status', 'last_updated_gw'
  ]

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Comparison_Dashboard!A:J',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Comparison_Dashboard!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [header, ...dashboardRows],
    },
  })

  console.log(`\n🎉 SUCCESS! Populated ${dashboardRows.length} tournament player rows in 'Comparison_Dashboard' tab!`)

  // D100: Propagate true admin manual overrides back to staging tabs ONLY for single-match players.
  // Note: DGW players have cumulative tournament gameweek totals in Comparison_Dashboard,
  // while staging tables store individual per-match boxscores. Therefore, cumulative points
  // must NEVER be written to individual match rows.
  // Also, auto-VERIFIED rows are NEVER considered overrides — both providers already matched.
  const approvedOverrides = dashboardRows.filter((r) => {
    const status = String(r[6] || '').trim().toUpperCase()
    const approved = r[7]
    return approved !== '' && approved !== undefined && approved !== null && status === 'MANUAL_OVERRIDE'
  })

  if (approvedOverrides.length > 0) {
    console.log(`\n[D100] Checking ${approvedOverrides.length} admin manual overrides for staging propagation...`)

    // Build per-tab batch update lists
    const sofaUpdates = []
    const afUpdates = []

    // Read full sheets once to find row indexes (outside the loop to avoid rate limits)
    const fullSofaForD100 = await sheets.spreadsheets.values.get({
      spreadsheetId, range: 'SofaScore_Staging!A2:N',
    })
    const fullAfForD100 = await sheets.spreadsheets.values.get({
      spreadsheetId, range: 'API_Football_Staging!A2:N',
    })
    const sofaRowByKeyD100 = new Map()
    for (let i = 0; i < (fullSofaForD100.data.values || []).length; i++) {
      const r2 = fullSofaForD100.data.values[i]
      const gw2 = String(r2[0] || '').trim()
      const mId2 = String(r2[1] || '').trim()
      const player2 = String(r2[2] || '').trim()
      sofaRowByKeyD100.set(`${gw2}|${normalizeName(player2)}`, i + 2)
      sofaRowByKeyD100.set(`${gw2}|${mId2}|${normalizeName(player2)}`, i + 2)
    }
    const afRowByKeyD100 = new Map()
    for (let i = 0; i < (fullAfForD100.data.values || []).length; i++) {
      const r2 = fullAfForD100.data.values[i]
      const gw2 = String(r2[0] || '').trim()
      const mId2 = String(r2[1] || '').trim()
      const player2 = String(r2[2] || '').trim()
      afRowByKeyD100.set(`${gw2}|${normalizeName(player2)}`, i + 2)
      afRowByKeyD100.set(`${gw2}|${mId2}|${normalizeName(player2)}`, i + 2)
    }

    for (const r of approvedOverrides) {
      const gw = String(r[9] || targetGw).trim()
      const pName = String(r[1] || '').trim()
      const norm = normalizeName(pName)
      const approvedPts = Number(r[7])

      const sofaMatches = sofaRows
        .filter((sr) => String(sr[0]).trim() === gw && normalizeName(String(sr[2] || '').trim()) === norm)
        .map((sr) => {
          const key1 = `${gw}|${normalizeName(sr[2] || '')}`
          const key2 = `${gw}|${String(sr[1] || '').trim()}|${normalizeName(sr[2] || '')}`
          return { sr, sheetRow: sofaRowByKeyD100.get(key2) || sofaRowByKeyD100.get(key1) }
        })
      const afMatches = apiFootballRows
        .filter((sr) => String(sr[0]).trim() === gw && normalizeName(String(sr[2] || '').trim()) === norm)
        .map((sr) => {
          const key1 = `${gw}|${normalizeName(sr[2] || '')}`
          const key2 = `${gw}|${String(sr[1] || '').trim()}|${normalizeName(sr[2] || '')}`
          return { sr, sheetRow: afRowByKeyD100.get(key2) || afRowByKeyD100.get(key1) }
        })

      // Only propagate if player had exactly 1 match in this GW
      if (sofaMatches.length === 1) {
        const { sheetRow, sr } = sofaMatches[0]
        const sofaPts = Number(sr[13] || 0)
        if (sheetRow && sofaPts !== approvedPts) {
          console.log(`[D100] Propagating manual override ${pName} GW${gw}: approved=${approvedPts}, staging=${sofaPts}`)
          sofaUpdates.push({ range: `SofaScore_Staging!N${sheetRow}`, values: [[approvedPts]] })
        }
      } else if (sofaMatches.length > 1) {
        console.warn(`[D100] Skipping SofaScore staging propagation for DGW player ${pName} (${sofaMatches.length} matches in GW${gw})`)
      }

      if (afMatches.length === 1) {
        const { sheetRow, sr } = afMatches[0]
        const afPts = Number(sr[13] !== undefined ? sr[13] : 0)
        if (sheetRow && afPts !== approvedPts) {
          console.log(`[D100] Propagating manual override ${pName} GW${gw}: approved=${approvedPts}, staging=${afPts}`)
          afUpdates.push({ range: `API_Football_Staging!N${sheetRow}`, values: [[approvedPts]] })
        }
      } else if (afMatches.length > 1) {
        console.warn(`[D100] Skipping API-Football staging propagation for DGW player ${pName} (${afMatches.length} matches in GW${gw})`)
      }
    }

    if (sofaUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data: sofaUpdates },
      })
      console.log(`[D100] ✅ Updated ${sofaUpdates.length} SofaScore_Staging rows`)
    }
    if (afUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data: afUpdates },
      })
      console.log(`[D100] ✅ Updated ${afUpdates.length} API_Football_Staging rows`)
    }
  }
}
