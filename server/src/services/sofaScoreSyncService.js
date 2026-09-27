import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName, getSimilarityScore, cleanClubName, resolvePlayerDetails } from './rosterValidator.js'
import { SIMILARITY_THRESHOLDS } from '../lib/constants.js'
import { getActiveGameweek } from './sheetsService.js'
import { getCanonicalClubName } from './fixtureService.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID
const apiKey = process.env.RAPIDAPI_KEY
const apiHost = process.env.RAPIDAPI_SOFASCORE_HOST || 'sofascore6.p.rapidapi.com'
const fallbackApiKey = process.env.RAPIDAPI_KEY_FALLBACK

const STATUS_RETRY = new Set([429, 500, 502, 503, 504])

/**
 * Executes a SofaScore request, retrying once with the fallback RapidAPI key
 * when the primary key is rate-limited (429) or returns a transient 5xx.
 * Same host is assumed for both keys.
 */
async function sofaFetch(url, label) {
  const attempts = [
    { name: 'primary', key: apiKey },
    { name: 'primary-retry', key: apiKey },
    { name: 'fallback', key: fallbackApiKey },
  ].filter((a) => Boolean(a.key))

  let lastError
  let lastStatus
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 1500))
    }
    try {
      const res = await fetch(url, {
        headers: {
          'x-rapidapi-key': attempt.key,
          'x-rapidapi-host': apiHost,
        },
      })
      if (res.ok) {
        if (attempt.name === 'fallback') {
          console.warn(`[SofaScore] ${label}: primary key failed, served by fallback key`)
        } else if (attempt.name === 'primary-retry') {
          console.log(`[SofaScore] ${label}: succeeded on primary retry`)
        }
        return res
      }
      lastStatus = res.status
      const retryable = STATUS_RETRY.has(res.status)
      console.warn(`[SofaScore] ${label}: ${attempt.name} key returned ${res.status}${retryable && i < attempts.length - 1 ? ' — retrying' : ''}`)
      if (!retryable || i === attempts.length - 1) {
        return res
      }
    } catch (err) {
      lastError = err
      console.warn(`[SofaScore] ${label}: ${attempt.name} key threw ${err.message}${i < attempts.length - 1 ? ' — retrying' : ''}`)
    }
  }
  if (lastError) throw lastError
  const err = new Error(`SofaScore ${label} failed across all keys (last status ${lastStatus})`)
  err.status = lastStatus
  throw err
}

/**
 * Calculates official fantasy fortress match points
 */
export function calculatePlayerPoints(stats, fantasyPos = 'MID') {
  const pos = (fantasyPos || 'MID').toUpperCase()
  const minutes = Number(stats.minutes || 0)
  const goals = Number(stats.goals || 0)
  const assists = Number(stats.assists || 0)
  // Strictly parse boolean or string 'TRUE' — avoids Boolean('FALSE') === true trap
  const cleanSheet = stats.clean_sheet === true || String(stats.clean_sheet || '').trim().toUpperCase() === 'TRUE'
  const penMiss = Number(stats.pen_miss || 0)
  const penSave = Number(stats.pen_save || 0)
  const yellow = Number(stats.yellow || 0)
  const red = Number(stats.red || 0)
  const ownGoals = Number(stats.own_goals || 0)

  let points = 0

  // 1. Minutes Played
  if (minutes >= 60) {
    points += 2
  } else if (minutes >= 1) {
    points += 1
  }

  // 2. Goals by Position
  if (pos === 'GKP' || pos === 'GK') {
    points += goals * 10
  } else if (pos === 'DEF') {
    points += goals * 6
  } else if (pos === 'MID') {
    points += goals * 5
  } else {
    // FWD
    points += goals * 4
  }

  // 3. Assists
  if (pos === 'GKP' || pos === 'GK') {
    points += assists * 5
  } else {
    points += assists * 3
  }

  // 4. Clean Sheet (60+ mins on pitch)
  if (cleanSheet && minutes >= 60) {
    if (pos === 'GKP' || pos === 'GK') points += 5
    else if (pos === 'DEF') points += 4
  }

  // 5. Penalties
  points += penSave * 5
  points -= penMiss * 3

  // 6. Cards & Own Goals
  points -= yellow * 1
  points -= red * 3
  points -= ownGoals * 2

  // 7. Hat-trick Bonus (+3 if 3+ goals OR 3+ assists)
  if (goals >= 3 || assists >= 3) {
    points += 3
  }

  return points
}

/**
 * Fetches match lineups from SofaScore RapidAPI
 */
export async function fetchMatchBoxscore(matchId) {
  const url = `https://${apiHost}/api/sofascore/v1/match/lineups?match_id=${matchId}`
  const res = await sofaFetch(url, `lineups/${matchId}`)
  if (!res.ok) throw new Error(`SofaScore lineups failed status ${res.status}`)
  return await res.json()
}

/**
 * Fetches match incidents (cards, subs, penalty events) from SofaScore RapidAPI
 */
export async function fetchMatchIncidents(matchId) {
  const url = `https://${apiHost}/api/sofascore/v1/match/incidents?match_id=${matchId}`
  const res = await sofaFetch(url, `incidents/${matchId}`)
  if (!res.ok) {
    console.warn(`[SofaScore] Incidents API returned ${res.status} for match ${matchId} — cards/penalties will fall back to boxscore stats only`)
    return []
  }
  const data = await res.json()
  return data.incidents || data.events || data || []
}

/**
 * Main Sync Service: Ingests match stats into SofaScore_Staging & links Player_ID_Mappings
 */
export async function syncSofaScoreStaging(targetGw) {
  if (!targetGw) {
    targetGw = await getActiveGameweek()
  }

  console.log('===========================================================')
  console.log(`⚡ SYNCING SOFASCORE MATCH STATS & INCIDENTS FOR GW${targetGw}`)
  console.log('===========================================================')

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // 1. Fetch Fixtures for target GW
  console.log('\n[1/5] Loading finished matches from "Fixture_Staging"...')
  const fixRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A2:J',
  })

  const fixtureRows = fixRes.data.values || []
  const matchesToProcess = fixtureRows.filter((r) => {
    const gw = String(r[0] || '').trim()
    const status = String(r[7] || '').trim().toUpperCase()
    return gw === String(targetGw) && status === 'FINISHED'
  })

  // Build a per-match score map from Fixture_Staging so the synthetic-goals
  // fallback below can derive correct CS even when the SofaScore incidents
  // endpoint returns no goals. (SofaScore's lineups endpoint doesn't include
  // scores, so boxscore.home.score / away.score are always undefined.)
  // Columns: gw, match_date, league, home_club, away_club, sofascore_event_id,
  //          api_football_fixture_id, status, home_score, away_score
  const scoreBySofaId = new Map()
  const scoreByAfId = new Map()
  for (const r of fixtureRows) {
    if (String(r[0]).trim() !== String(targetGw)) continue
    if (String(r[7]).trim().toUpperCase() !== 'FINISHED') continue
    const sofaId = String(r[5] || '').trim()
    const afId = String(r[6] || '').trim()
    const h = Number(r[8])
    const a = Number(r[9])
    if (Number.isFinite(h) && Number.isFinite(a)) {
      if (sofaId) scoreBySofaId.set(sofaId, { homeScore: h, awayScore: a })
      if (afId) scoreByAfId.set(afId, { homeScore: h, awayScore: a })
    }
  }

  console.log(`Found ${matchesToProcess.length} finished matches for GW${targetGw}.`)

  // 2. Load Master Player Position Registry from 'Players' tab
  console.log('\n[2/5] Loading player positions from "Players" tab...')
  const playersRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Players!A2:E',
  })
  const playerPositionMap = new Map()
  const playerClubMap = new Map()
  const playerCanonicalMap = new Map()
  ;(playersRes.data.values || []).forEach((r) => {
    const name = String(r[1] || '').trim()
    const pos = String(r[3] || 'MID').trim().toUpperCase()
    const club = String(r[4] || '').trim()
    if (name) {
      const norm = normalizeName(name)
      playerPositionMap.set(norm, pos)
      playerClubMap.set(norm, club)
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

  // 3. Load Master Player_ID_Mappings
  console.log('\n[3/5] Loading "Player_ID_Mappings"...')
  const mappingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Player_ID_Mappings!A2:F',
  })
  const mappingRows = mappingRes.data.values || []
  const sofaIdToPosMap = new Map()
  const playerMappingList = mappingRows.map((r, idx) => {
    const pName = String(r[1] || '').trim()
    const club = String(r[2] || '').trim()
    const apiId = String(r[3] || '').trim()
    const sofaId = String(r[4] || '').trim()
    const status = String(r[5] || '').trim()
    if (sofaId && pName) {
      const norm = normalizeName(pName)
      const pos = playerPositionMap.get(norm) || 'MID'
      sofaIdToPosMap.set(sofaId, { pos, canonicalName: pName, club })
    }
    return {
      rowIdx: idx + 2,
      player_name: pName,
      club,
      api_football_id: apiId,
      sofascore_id: sofaId,
      status,
    }
  })

  // 4. Load Existing Staged Matches to Avoid Redundant API Calls
  console.log('\n[4/6] Checking existing matches in "SofaScore_Staging"...')
  let existingStagingRows = []
  const fullyCachedMatchIds = new Set()
  const matchRowCountMap = new Map()
  const telemetry = { newMatchesProcessed: 0, playersProcessed: 0, cacheChecked: false }
  try {
    const existingStagingRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'SofaScore_Staging!A2:N',
    })
    existingStagingRows = existingStagingRes.data.values || []
    const matchMaxMinutesMap = new Map()
    // D-new: Track per-match cleansheet ratio to invalidate stale data left
    // behind by the previous isHome bug (where every goal was tagged as away,
    // causing ~100% CS=TRUE for the affected matches).
    const matchRowCSMap = new Map() // mId -> count of CS=TRUE rows
    const matchRowTotalMap = new Map() // mId -> total rows for this match
    existingStagingRows.forEach((r) => {
      const mId = String(r[1] || '').trim()
      const mins = Number(r[4] || 0)
      if (mId) {
        matchRowCountMap.set(mId, (matchRowCountMap.get(mId) || 0) + 1)
        matchMaxMinutesMap.set(mId, Math.max(matchMaxMinutesMap.get(mId) || 0, mins))
        matchRowTotalMap.set(mId, (matchRowTotalMap.get(mId) || 0) + 1)
        if (String(r[7] || '').toUpperCase().trim() === 'TRUE') {
          matchRowCSMap.set(mId, (matchRowCSMap.get(mId) || 0) + 1)
        }
      }
    })
    // D89 + D-new: SofaScore cache check mirrors API-Football: count >= 14
    // AND max minutes >= 85. ALSO invalidate if existing data looks suspicious
    // (CS ratio > 50% — a real match has opponents conceding, so ~50%+ should
    // NOT have CS=TRUE). Also invalidate if both teams conceded according to
    // Fixture_Staging but multiple CS=TRUE rows exist.
    const csInvalidateRatio = Number(process.env.SOFA_CS_INVALIDATE_RATIO || 0.50)
    for (const [mId, count] of matchRowCountMap.entries()) {
      const maxMins = matchMaxMinutesMap.get(mId) || 0
      const csCount = matchRowCSMap.get(mId) || 0
      const totalCount = matchRowTotalMap.get(mId) || 0
      const csRatio = totalCount > 0 ? csCount / totalCount : 0
      const fixtureScore = scoreBySofaId.get(mId) || scoreByAfId.get(mId)
      const bothConceded = fixtureScore && fixtureScore.homeScore > 0 && fixtureScore.awayScore > 0
      const suspiciousBothConceded = bothConceded && csCount > 2

      const looksValid = count >= 14 && maxMins >= 85 && csRatio <= csInvalidateRatio && !suspiciousBothConceded
      if (looksValid) {
        fullyCachedMatchIds.add(mId)
      } else if (count >= 14) {
        console.warn(`[SofaScore Cache] ⚠️ Invalidating match ${mId}: ${csCount}/${totalCount} rows have CS=TRUE (${(csRatio * 100).toFixed(0)}%)${suspiciousBothConceded ? ' despite both teams conceding' : ''} — likely stale data, will re-fetch.`)
      }
    }
    const cacheStats = {
      totalUniqueMatchIds: matchRowCountMap.size,
      fullyCached: fullyCachedMatchIds.size,
      partialOrEmpty: matchRowCountMap.size - fullyCachedMatchIds.size,
    }
    console.log(`[SofaScore Cache] ${cacheStats.totalUniqueMatchIds} unique match IDs found, ${cacheStats.fullyCached} fully cached (>=14 rows), ${cacheStats.partialOrEmpty} partial/empty`)
    telemetry.cacheChecked = true
  } catch (e) {
    console.log('No existing rows in SofaScore_Staging.')
  }

  // 5. Process each match boxscore & incidents
  console.log('\n[5/6] Fetching match boxscores + incidents for new matches...')
  // Only keep rows from fully cached matches (cleans up any broken partial matches)
  const stagingRows = existingStagingRows.filter(r => fullyCachedMatchIds.has(String(r[1] || '').trim()))
  const updatedMappings = new Map()

  for (const matchRow of matchesToProcess) {
    const matchId = String(matchRow[5] || '').trim()
    const homeClub = cleanClubName(matchRow[3]) || String(matchRow[3] || '').trim()
    const awayClub = cleanClubName(matchRow[4]) || String(matchRow[4] || '').trim()

    if (!matchId) continue

    // If match is already fully synced, skip API call to save quota!
    if (fullyCachedMatchIds.has(matchId)) {
      continue
    }

    console.log(`\n➡️ Processing NEW MATCH: ${homeClub} vs ${awayClub} (Match ID: ${matchId})...`)
    try {
      const [boxscore, incidents] = await Promise.all([
        fetchMatchBoxscore(matchId),
        fetchMatchIncidents(matchId),
      ])

      // Parse incident map & match goals by team
      const playerIncidents = new Map()
      const matchGoals = [] // { time, isHome }
      const playerSubMinutes = new Map() // player_id -> subOutMinute
      const playerInMinutes = new Map() // player_id -> subInMinute
      let matchHasIncidentAssists = false

      // Build player-id → team-side maps from the boxscore so we can derive
      // which side a goal belongs to without relying on `inc.isHome`, which
      // is missing from the rapidapi incidents payload (caused the home/away
      // cleansheet regression — every goal was tagged as away, so home
      // players over-lost CS and away players over-gained CS).
      const homePlayerIds = new Set(
        (boxscore.home?.players || []).map((p) => String(p.player?.id || p.id || '')).filter(Boolean),
      )
      const awayPlayerIds = new Set(
        (boxscore.away?.players || []).map((p) => String(p.player?.id || p.id || '')).filter(Boolean),
      )
      const homePlayerNames = new Set(
        (boxscore.home?.players || []).map((p) => normalizeName(p.player?.name || p.player?.shortName || p.name || p.shortName || '')).filter(Boolean),
      )
      const awayPlayerNames = new Set(
        (boxscore.away?.players || []).map((p) => normalizeName(p.player?.name || p.player?.shortName || p.name || p.shortName || '')).filter(Boolean),
      )

      // Track each goal's position in the incidents array and each sub's
      // position so the CS calculation can correctly disambiguate the
      // Llorente edge case (sub and goal share the same minute integer —
      // the earlier-positioned event in the chronological feed happens first).
      const goalIncidentIndexes = [] // indexes into the incidents array
      const subIncidentIndexes = new Map() // playerId -> incident array index when subbed off

      // SofaScore API returns incidents in reverse chronological order (latest 90'+ down to 1').
      // Normalize to strictly chronological order so smaller index = earlier event in match timeline.
      const rawIncidentsList = Array.isArray(incidents) ? incidents : (incidents?.incidents || [])
      const isReverse = rawIncidentsList.length >= 2 && (rawIncidentsList[0]?.time ?? 0) >= (rawIncidentsList[rawIncidentsList.length - 1]?.time ?? 0)
      const orderedIncidents = isReverse ? [...rawIncidentsList].reverse() : rawIncidentsList

      for (let incIdx = 0; incIdx < orderedIncidents.length; incIdx++) {
        const inc = orderedIncidents[incIdx]
        const pId = String(inc.player?.id || inc.playerIn?.id || inc.playerOut?.id || '')
        const pName = normalizeName(inc.playerName || inc.player?.name || '')
        const key = pId || pName

        if (!playerIncidents.has(key)) {
          playerIncidents.set(key, { yellow: 0, red: 0, ownGoals: 0, penMiss: 0, penSave: 0, assists: 0 })
        }

        const data = playerIncidents.get(key)
        if (inc.incidentType === 'card') {
          if (inc.incidentClass === 'yellow') data.yellow += 1
          if (inc.incidentClass === 'yellowRed') data.red += 1
          if (inc.incidentClass === 'red') data.red += 1
        } else if (inc.incidentType === 'goal') {
          const isOwnGoal = inc.incidentClass === 'ownGoal'
          let isScorerHome = null

          // Derive scorer side from boxscore player IDs or player names
          if (pId && homePlayerIds.has(pId)) isScorerHome = true
          else if (pId && awayPlayerIds.has(pId)) isScorerHome = false
          else if (pName && homePlayerNames.has(pName)) isScorerHome = true
          else if (pName && awayPlayerNames.has(pName)) isScorerHome = false
          else if (typeof inc.teamSide === 'string') isScorerHome = inc.teamSide === 'home'
          else if (typeof inc.isHome === 'boolean') isScorerHome = inc.isHome

          let goalIsHome = null
          if (isScorerHome !== null) {
            // Own goal awards the goal to the OPPONENT team
            goalIsHome = isOwnGoal ? !isScorerHome : isScorerHome
          } else {
            // Unresolved scorer — check authoritative fixture score
            const finalScore = scoreBySofaId.get(matchId) || scoreByAfId.get(matchId)
            if (finalScore) {
              if (finalScore.homeScore === 0 && finalScore.awayScore > 0) goalIsHome = false
              else if (finalScore.awayScore === 0 && finalScore.homeScore > 0) goalIsHome = true
            }
          }

          matchGoals.push({ time: inc.time || 0, isHome: goalIsHome, _incidentIdx: incIdx })
          goalIncidentIndexes.push(incIdx)
          if (isOwnGoal) data.ownGoals += 1
          if (inc.incidentClass !== 'ownGoal') {
            const a1Id = inc.assist1?.id || inc.assist1?.playerId
            const a2Id = inc.assist2?.id || inc.assist2?.playerId
            if (a1Id) {
              const aKey = String(a1Id)
              if (!playerIncidents.has(aKey)) {
                playerIncidents.set(aKey, { yellow: 0, red: 0, ownGoals: 0, penMiss: 0, penSave: 0, assists: 0 })
              }
              playerIncidents.get(aKey).assists += 1
              matchHasIncidentAssists = true
            }
            if (a2Id) {
              const aKey = String(a2Id)
              if (!playerIncidents.has(aKey)) {
                playerIncidents.set(aKey, { yellow: 0, red: 0, ownGoals: 0, penMiss: 0, penSave: 0, assists: 0 })
              }
              playerIncidents.get(aKey).assists += 1
              matchHasIncidentAssists = true
            }
          }
        } else if (inc.incidentType === 'penalty' && inc.incidentClass === 'missed') {
          data.penMiss += 1
        } else if (inc.incidentType === 'penalty' && inc.incidentClass === 'saved') {
          data.penSave += 1
        } else if (inc.incidentType === 'substitution') {
          if (inc.playerOut?.id) {
            const outId = String(inc.playerOut.id)
            playerSubMinutes.set(outId, inc.time || 90)
            subIncidentIndexes.set(outId, incIdx)
          }
          if (inc.playerIn?.id) playerInMinutes.set(String(inc.playerIn.id), inc.time || 0)
        }
      }

      const allMatchPlayers = [
        ...(boxscore.home?.players || []).map((p) => ({ ...p, matchClub: cleanClubName(homeClub) || homeClub, isHome: true })),
        ...(boxscore.away?.players || []).map((p) => ({ ...p, matchClub: cleanClubName(awayClub) || awayClub, isHome: false })),
      ]

      // Reconcile incident goals with authoritative Fixture_Staging final score.
      // 1. If incidents endpoint returned 0 goals but match had score > 0 -> synthetic goals.
      // 2. If incidents goal sides contradict the authoritative score -> re-align with fixture score.
      const finalScore = scoreBySofaId.get(matchId) || scoreByAfId.get(matchId)
      let effectiveMatchGoals = matchGoals
      if (matchGoals.length === 0) {
        if (finalScore && (finalScore.homeScore > 0 || finalScore.awayScore > 0)) {
          effectiveMatchGoals = [
            ...Array(finalScore.homeScore).fill(null).map(() => ({ time: 90, isHome: true })),
            ...Array(finalScore.awayScore).fill(null).map(() => ({ time: 90, isHome: false })),
          ]
          console.warn(`[SofaScore] Match ${matchId}: empty incidents payload — derived ${effectiveMatchGoals.length} synthetic goal(s) from Fixture_Staging (${finalScore.homeScore}-${finalScore.awayScore})`)
        }
      } else if (finalScore) {
        const homeGoalsCount = matchGoals.filter((g) => g.isHome === true).length
        const awayGoalsCount = matchGoals.filter((g) => g.isHome === false).length
        if (homeGoalsCount !== finalScore.homeScore || awayGoalsCount !== finalScore.awayScore) {
          console.warn(`[SofaScore] Match ${matchId}: incident goals (${homeGoalsCount} home, ${awayGoalsCount} away) contradict Fixture_Staging (${finalScore.homeScore}-${finalScore.awayScore}) — reconciling to authoritative score`)
          effectiveMatchGoals = [
            ...Array(finalScore.homeScore).fill(null).map((_, i) => ({ time: matchGoals[i]?.time || 90, isHome: true })),
            ...Array(finalScore.awayScore).fill(null).map((_, i) => ({ time: matchGoals[finalScore.homeScore + i]?.time || 90, isHome: false })),
          ]
        }
      }

      for (const p of allMatchPlayers) {
        const stats = p.statistics || {}
        const minutes = stats.minutesPlayed || 0

        // Skip non-playing bench players
        if (minutes === 0) continue

        const playerObj = p.player || p
        const rawPlayerName = playerObj.name || playerObj.shortName || p.name || p.shortName || ''
        const rawSlug = playerObj.slug || p.slug || ''
        const matchClub = p.matchClub
        const sofaPlayerId = String(playerObj.id || p.id || '')

        // Map match position
        const pPos = playerObj.position || p.position
        const matchPos = pPos === 'G' ? 'GK' : pPos === 'D' ? 'DEF' : pPos === 'F' ? 'FWD' : 'MID'

        // Find match in our Master Player Registry (Position-Aware)
        let matchedTM = null
        let highestScore = 0

        for (const tmPlayer of playerMappingList) {
          const tmPos = playerPositionMap.get(normalizeName(tmPlayer.player_name)) || ''

          // Position Compatibility: Goalkeepers are strict; outfield players can flex tactically (wingbacks DEF/MID, wingers MID/FWD)
          if (matchPos && tmPos) {
            if ((matchPos === 'GK' || matchPos === 'GKP') && tmPos !== 'GK' && tmPos !== 'GKP') continue
            if ((tmPos === 'GK' || tmPos === 'GKP') && matchPos !== 'GK' && matchPos !== 'GKP') continue
          }

          // 1. Direct ID Match (100% confidence)
          if (tmPlayer.sofascore_id && String(tmPlayer.sofascore_id) === sofaPlayerId) {
            matchedTM = tmPlayer
            break
          }

          const nameScore = Math.max(
            getSimilarityScore(rawPlayerName, tmPlayer.player_name),
            getSimilarityScore(rawSlug, tmPlayer.player_name)
          )

          const clubScore = getSimilarityScore(matchClub, tmPlayer.club)

          // 2. Strict Match: MUST be same club AND high name similarity
          if (clubScore >= SIMILARITY_THRESHOLDS.SOFA_CLUB && nameScore >= SIMILARITY_THRESHOLDS.SOFA_NAME) {
            const totalScore = nameScore * 0.7 + clubScore * 0.3
            if (totalScore > highestScore) {
              highestScore = totalScore
              matchedTM = tmPlayer
            }
          }
        }

        // Always preserve the real match player name in staging, but resolve canonical name & position
        const officialName = rawPlayerName
        const officialClub = matchClub // Always use live real-world match club

        const playerDetails = resolvePlayerDetails({
          rawName: officialName,
          clubName: officialClub,
          livePos: matchPos,
          playerPositionMap,
          playerClubMap,
          afIdToPosMap: sofaIdToPosMap,
          afPlayerId: sofaPlayerId,
          playerCanonicalMap,
          playerAliasMap,
        })
        const fantasyPos = playerDetails.pos
        const canonicalPlayerName = playerDetails.canonicalName || officialName

        // Link sofascore_id in Player_ID_Mappings if strictly matched.
        // Always overwrite the stored sofascore_id when we get a confident match
        // — a mismatched stored ID indicates a wrong mapping (e.g., the row
        // "Gabriel" was originally linked to Gabriel Martinelli's SS ID instead
        // of Gabriel Magalhães's). Self-healing: re-sync each gameweek to
        // correct any wrong IDs.
        if (matchedTM) {
          let mappingChanged = false
          if (!matchedTM.sofascore_id || matchedTM.sofascore_id === '' || String(matchedTM.sofascore_id) !== sofaPlayerId) {
            if (matchedTM.sofascore_id && String(matchedTM.sofascore_id) !== sofaPlayerId) {
              console.log(`[Player_ID_Mappings] Correcting sofascore_id for "${matchedTM.player_name}" (${matchedTM.club}): ${matchedTM.sofascore_id} → ${sofaPlayerId}`)
            }
            matchedTM.sofascore_id = sofaPlayerId
            matchedTM.status = 'VERIFIED'
            mappingChanged = true
          }
          if (mappingChanged) {
            updatedMappings.set(matchedTM.rowIdx, matchedTM)
          }
        }

        // Calculate Clean Sheet accurately from incidents timeline (Fixes HIGH-03, D96)
        // D96: AET/PEN matches have extra time - window should extend to 120
        const isAetMatch = boxscore.status?.type === 'finished' && (boxscore.status?.reason === 'AET' || boxscore.status?.reason === 'PEN')
        const isStarter = !p.substitute
        const subbedOutAt = playerSubMinutes.get(sofaPlayerId)
        const windowEnd = isAetMatch ? 120 : 90
        const endMinute = subbedOutAt !== undefined ? subbedOutAt : windowEnd
        const startMinute = isStarter ? 0 : playerInMinutes.get(sofaPlayerId) || (90 - minutes)

        // Opponent goals conceded during player's time on pitch.
        // Prefer the per-pitch-window from incidents when available, but fall
        // back to the team-level score from Fixture_Staging (authoritative)
        // when the incidents endpoint returned no goals. Without this fallback,
        // an empty incidents payload would cause every 60+ min player on
        // BOTH teams to incorrectly receive CS=TRUE.
        const finalScoreFallback = scoreBySofaId.get(matchId) || scoreByAfId.get(matchId)
        const teamConcededFallback = finalScoreFallback
          ? (p.isHome ? finalScoreFallback.awayScore : finalScoreFallback.homeScore)
          : null
        const opponentGoalsOnPitchFromIncidents = effectiveMatchGoals.filter((g) => {
          const isOpponentGoal = p.isHome ? !g.isHome : g.isHome
          if (!isOpponentGoal) return false
          if (g.time < startMinute || g.time > endMinute) return false
          // Llorente edge case: sub and goal share the same integer minute.
          // If the sub event came BEFORE the goal event in the incidents feed,
          // the player was off the pitch for the goal (substitution during a
          // stoppage, then play resumes and goal is scored).
          if (g.time === endMinute && subbedOutAt !== undefined) {
            const subIdx = subIncidentIndexes.get(sofaPlayerId)
            if (subIdx !== undefined && typeof g._incidentIdx === 'number' && subIdx < g._incidentIdx) {
              return false // sub happened first → off the pitch
            }
          }
          return true
        }).length
        // Llorente case: per-pitch window is the AUTHORITATIVE source. If the
        // player wasn't on the pitch for any opponent goal, they keep CS
        // even if the team conceded after they left. Only fall back to the
        // team-level score when incidents are empty (otherwise we'd deny CS
        // to players who were correctly subbed off before a goal).
        const incidentsAreEmpty = effectiveMatchGoals.length === 0
        let isCleanSheet = minutes >= 60 && opponentGoalsOnPitchFromIncidents === 0
        // Safety net: if authoritative score indicates team conceded >= 1:
        // 1. If incidents are empty, always invalidate CS.
        // 2. If player played full match (not subbed out, minutes >= 60), player was on pitch at FT and conceded.
        if (teamConcededFallback !== null && teamConcededFallback > 0) {
          if (incidentsAreEmpty) {
            isCleanSheet = false
          } else if (subbedOutAt === undefined && minutes >= 60) {
            isCleanSheet = false
          }
        }

        // Fetch cards from incident timeline
        const incidentData = playerIncidents.get(sofaPlayerId) || playerIncidents.get(normalizeName(rawPlayerName)) || {}
        const yellow = incidentData.yellow || Number(stats.yellowCard || stats.yellowCards || p.yellowCard || 0)
        const red = incidentData.red || Number(stats.redCard || stats.redCards || p.redCard || 0)
        const ownGoals = incidentData.ownGoals || Number(stats.ownGoal || stats.ownGoals || p.ownGoal || 0)
        const penMiss = incidentData.penMiss || Number(stats.penaltyMiss || stats.penaltyMissed || 0)
        const penSave = incidentData.penSave || Number(stats.penaltySave || stats.penaltySaved || 0)

        const goalAssistVal = stats.goalAssist ?? stats.assists ?? stats.assist
        const boxscoreAssists = Number(goalAssistVal ?? 0)
        const incidentsAssists = Number(incidentData.assists || 0)
        const assists = Math.max(boxscoreAssists, incidentsAssists)
        if (boxscoreAssists === 0 && incidentsAssists === 0 && matchGoals.length > 0 && !matchHasIncidentAssists) {
          console.warn(`[SofaScore] Match ${matchId}: boxscore has 0 assists but ${matchGoals.length} goals scored with no incident-assist data. Possible assist schema change.`)
        }

        const playerStats = {
          minutes,
          goals: Number(stats.goals || stats.goal || p.goals || 0),
          assists,
          clean_sheet: Boolean(isCleanSheet),
          pen_miss: penMiss,
          pen_save: penSave,
          yellow: yellow,
          red: red,
          own_goals: ownGoals,
        }

        const calculatedPts = calculatePlayerPoints(playerStats, fantasyPos)

        const canonicalHome = getCanonicalClubName(homeClub)
        const canonicalAway = getCanonicalClubName(awayClub)
        if (canonicalHome !== homeClub || canonicalAway !== awayClub) {
          console.warn(`[SofaScore] Match ${matchId}: club canonicalized home="${homeClub}"->"${canonicalHome}" away="${awayClub}"->"${canonicalAway}"`)
        }

        stagingRows.push([
          String(targetGw),
          matchId,
          canonicalPlayerName,
          officialClub,
          playerStats.minutes,
          playerStats.goals,
          playerStats.assists,
          isCleanSheet ? 'TRUE' : 'FALSE',
          playerStats.pen_miss,
          playerStats.pen_save,
          playerStats.yellow,
          playerStats.red,
          playerStats.own_goals,
          calculatedPts,
        ])
      }

      const activePlayers = allMatchPlayers.filter((p) => (p.statistics?.minutesPlayed || 0) > 0).length
      telemetry.playersProcessed += activePlayers
      telemetry.newMatchesProcessed += 1
      console.log(`✅ Processed ${activePlayers} active players for ${homeClub} vs ${awayClub}`)

      // Sanity check: if more than 80% of def/gk players got CS=TRUE, that's
      // likely an incident-parsing regression (e.g., empty incidents endpoint
      // or wrong team-side tagging). Flag it loudly for investigation.
      const defGkCsTrue = stagingRows.filter((r) => {
        if (r[1] !== matchId) return false
        if (r[7] !== 'TRUE') return false
        const pos = playerPositionMap.get(normalizeName(r[2])) || ''
        return pos === 'GK' || pos === 'GKP' || pos === 'DEF'
      }).length
      const defGkTotal = stagingRows.filter((r) => {
        if (r[1] !== matchId) return false
        const pos = playerPositionMap.get(normalizeName(r[2])) || ''
        return pos === 'GK' || pos === 'GKP' || pos === 'DEF'
      }).length
      if (defGkTotal > 0 && defGkCsTrue / defGkTotal > 0.8) {
        console.warn(`[SofaScore CS Anomaly] ${homeClub} vs ${awayClub}: ${Math.round((defGkCsTrue / defGkTotal) * 100)}% of def/gk got CS (${defGkCsTrue}/${defGkTotal})`)
      }
      // Polite 500ms delay between match calls
      await new Promise((r) => setTimeout(r, 500))
    } catch (err) {
      console.error(`Error processing match ${matchId}:`, err.message)
    }
  }

  // 5. Write to SofaScore_Staging Tab (MERGE-WRITE: preserve other GWs)
  console.log(`\n[5/5] Writing ${stagingRows.length} player stats rows to "SofaScore_Staging" tab...`)

  const header = [
    'gw', 'match_id', 'player_name', 'club', 'minutes', 'goals', 'assists', 'clean_sheet',
    'pen_miss', 'pen_save', 'yellow', 'red', 'own_goals', 'calculated_pts'
  ]

  // CRITICAL (Step 8): Merge-write instead of full-sheet clear+rewrite.
  // The previous behavior was values.clear({A:N}) followed by update with only
  // the target GW's rows — this wiped all other GWs' data. The new approach
  // reads existing rows, preserves rows for OTHER GWs (and rows for the target
  // GW that aren't being re-fetched), and merges in the newly-fetched rows.
  // Build the set of matchIds being re-fetched in this sync (target GW only)
  const refreshedMatchIds = new Set()
  for (const r of stagingRows) {
    const gw = String(r[0] || '').trim()
    if (gw === String(targetGw)) {
      refreshedMatchIds.add(String(r[1] || '').trim())
    }
  }

  // Read the current sheet content (header + data)
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SofaScore_Staging!A1:N',
  })
  const existingValues = existingRes.data.values || []
  const existingHeader = existingValues[0] || []
  const existingData = existingValues.slice(1)

  // Determine which existing rows to KEEP:
  //   - Rows for other GWs (always keep)
  //   - Rows for the target GW whose matchId is NOT being re-fetched (keep)
  //   - Drop rows for the target GW whose matchId IS being re-fetched (they'll be
  //     replaced by the new stagingRows entries)
  const rowsToKeep = existingData.filter((r) => {
    const gw = String(r[0] || '').trim()
    if (gw !== String(targetGw)) return true // other GW — keep
    const mId = String(r[1] || '').trim()
    return !refreshedMatchIds.has(mId) // target GW not re-fetched — keep
  })

  // De-dupe: if a row in rowsToKeep happens to have the same (gw, match_id, player_name)
  // as one of the new stagingRows, drop the existing one and keep the new one
  const newRowKey = (r) => `${String(r[0] || '').trim()}|${String(r[1] || '').trim()}|${String(r[2] || '').trim()}`
  const newKeys = new Set(stagingRows.map(newRowKey))
  const dedupedRowsToKeep = rowsToKeep.filter((r) => !newKeys.has(newRowKey(r)))

  // Safety snapshot: verify GW1+GW2 row counts are unchanged BEFORE we write
  const preWriteGwCounts = { '1': 0, '2': 0 }
  for (const r of existingStagingRows) {
    const gw = String(r[0] || '').trim()
    if (preWriteGwCounts[gw] !== undefined) preWriteGwCounts[gw]++
  }

  // Combine: existing kept rows + new staging rows
  const finalData = [...dedupedRowsToKeep, ...stagingRows]

  console.log(`[SofaScore Merge-Write] Keeping ${dedupedRowsToKeep.length} existing rows (other GWs + non-refreshed target matches), adding ${stagingRows.length} new/refreshed rows. Total: ${finalData.length}`)
  console.log(`[SofaScore Pre-Snapshot] GW1=${preWriteGwCounts['1']} GW2=${preWriteGwCounts['2']} (must not change)`)

  // Single write — no values.clear needed since values.update overwrites cleanly
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'SofaScore_Staging!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [header, ...finalData],
    },
  })

  // Post-write safety check
  const postWriteRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'SofaScore_Staging!A1:N',
  })
  const postValues = postWriteRes.data.values || []
  const postData = postValues.slice(1)
  const postWriteGwCounts = { '1': 0, '2': 0 }
  for (const r of postData) {
    const gw = String(r[0] || '').trim()
    if (postWriteGwCounts[gw] !== undefined) postWriteGwCounts[gw]++
  }
  for (const g of ['1', '2']) {
    if (preWriteGwCounts[g] !== postWriteGwCounts[g]) {
      console.error(`🚨 [SofaScore CRITICAL] GW${g} row count changed: ${preWriteGwCounts[g]} → ${postWriteGwCounts[g]}`)
    }
  }
  console.log(`[SofaScore Post-Snapshot] GW1=${postWriteGwCounts['1']} GW2=${postWriteGwCounts['2']} ${preWriteGwCounts['1'] === postWriteGwCounts['1'] && preWriteGwCounts['2'] === postWriteGwCounts['2'] ? '✅ UNCHANGED' : '🚨 CHANGED'}`)

  // Also update verified IDs in Player_ID_Mappings tab via per-row updates (D76 fix: no full tab rewrite)
  if (updatedMappings.size > 0) {
    console.log(`Updating ${updatedMappings.size} verified SofaScore IDs in 'Player_ID_Mappings' tab...`)
    const perRowUpdates = []
    for (const [rowIdx, tm] of updatedMappings.entries()) {
      perRowUpdates.push({
        range: `Player_ID_Mappings!E${rowIdx}`,
        values: [[tm.sofascore_id || '']],
      })
    }
    if (perRowUpdates.length > 0) {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data: perRowUpdates },
      })
      console.log(`✅ Updated ${perRowUpdates.length} Player_ID_Mappings rows (sofascore_id column only).`)
    }
  }

  console.log('\n🎉 SOFASCORE STAGING SYNC WITH INCIDENTS COMPLETED SUCCESSFULLY!')
  console.log(`[SofaScore Telemetry] GW${targetGw}: ${telemetry.newMatchesProcessed} new matches processed, ${telemetry.playersProcessed} players staged, cache checked: ${telemetry.cacheChecked}`)
  return { success: true, telemetry }
}
