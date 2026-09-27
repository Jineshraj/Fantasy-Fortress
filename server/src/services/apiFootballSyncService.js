import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { normalizeName, getSimilarityScore, cleanClubName, isSameClub, resolvePlayerPosition, resolvePlayerDetails } from './rosterValidator.js'
import { SIMILARITY_THRESHOLDS } from '../lib/constants.js'

const spreadsheetId = process.env.GOOGLE_SHEET_ID || '1smqnbGD0chXTYLRepUrmiQePc5zuMdQu4AFaASZZRcU'
const apiFootballKey = process.env.API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'

// Official API-Football League IDs for Top 5 European Leagues
export const TOP_5_LEAGUES = {
  PREMIER_LEAGUE: 39,
  LA_LIGA: 140,
  SERIE_A: 135,
  BUNDESLIGA: 78,
  LIGUE_1: 61,
}

const TOP_5_LEAGUE_IDS_SET = new Set(Object.values(TOP_5_LEAGUES))

/**
 * Fantasy Scoring Formula for API-Football (exact mirror of tournament rules)
 */
export function calculateApiFootballFantasyPoints({
  minutes = 0,
  goalsScored = 0,
  assists = 0,
  conceded = 0,
  penaltiesSaved = 0,
  penaltiesMissed = 0,
  yellowCards = 0,
  redCards = 0,
  ownGoals = 0,
  isCleanSheet = false,
  pos = 'MID',
}) {
  let points = 0

  // 1. Appearance Points
  if (minutes >= 60) {
    points += 2
  } else if (minutes > 0) {
    points += 1
  } else {
    return 0 // Did not play
  }

  // 2. Goal Scoring Points
  if (pos === 'GKP' || pos === 'GK' || pos === 'G') {
    points += goalsScored * 10
  } else if (pos === 'DEF' || pos === 'D') {
    points += goalsScored * 6
  } else if (pos === 'MID' || pos === 'M') {
    points += goalsScored * 5
  } else {
    // Forward
    points += goalsScored * 4
  }

  // 3. Assists
  if (pos === 'GKP' || pos === 'GK' || pos === 'G') {
    points += assists * 5
  } else {
    points += assists * 3
  }

  // 4. Clean Sheets (GKP/GK/G and DEF/D only, >= 60 min, sub-aware 0 goals conceded)
  if (isCleanSheet) {
    if (pos === 'GKP' || pos === 'GK' || pos === 'G') points += 5
    else if (pos === 'DEF' || pos === 'D') points += 4
  }

  // 5. Penalties
  points += penaltiesSaved * 5
  points -= penaltiesMissed * 3

  // 6. Cards & Own Goals
  points -= yellowCards * 1
  points -= redCards * 3
  points -= ownGoals * 2

  // 7. Hat-trick Bonus (+3 if 3+ goals OR 3+ assists)
  if (goalsScored >= 3 || assists >= 3) {
    points += 3
  }

  return points
}

/**
 * Fetches all Top-5 League finished fixtures for a specific date in 1 single API call
 */
export async function fetchTop5FixturesByDate(dateStr) {
  if (!apiFootballKey) {
    console.warn('[API-Football] ⚠️ API_FOOTBALL_KEY is not set in .env!')
    return []
  }

  const url = `${BASE_URL}/fixtures?date=${dateStr}`
  console.log(`[API-Football API] Fetching fixtures for ${dateStr}...`)

  try {
    const res = await fetch(url, {
      headers: {
        'x-apisports-key': apiFootballKey,
      },
    })

    const data = await res.json()
    const allMatches = data.response || []

    const top5Matches = allMatches.filter((item) => TOP_5_LEAGUE_IDS_SET.has(item.league?.id))
    console.log(`[API-Football] Found ${top5Matches.length} Top-5 League matches on ${dateStr}.`)
    return top5Matches
  } catch (err) {
    console.error(`[API-Football] Error fetching fixtures for ${dateStr}:`, err.message)
    return []
  }
}

/**
 * Fetches all-in-one fixture details (events, lineups, statistics, players) with rate limit retry
 */
export async function fetchFixtureDetailsById(fixtureId, retries = 4) {
  if (!apiFootballKey) return null

  const url = `${BASE_URL}/fixtures?id=${fixtureId}`
  console.log(`[API-Football API] 📥 Fetching all-in-one match data for fixture ID ${fixtureId}...`)

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'x-apisports-key': apiFootballKey,
        },
      })

      const data = await res.json()
      if (data.errors && Object.keys(data.errors).length > 0) {
        console.warn(`[API-Football] API error for fixture ${fixtureId} (attempt ${attempt + 1}):`, data.errors)
        if (attempt < retries) {
          const waitMs = data.errors?.rateLimit ? 12000 : 3000
          await new Promise((r) => setTimeout(r, waitMs))
          continue
        }
      }
      return data.response?.[0] || null
    } catch (err) {
      console.error(`[API-Football] Error fetching fixture ${fixtureId} (attempt ${attempt + 1}):`, err.message)
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 3000))
      } else {
        return null
      }
    }
  }
  return null
}

/**
 * Syncs match statistics to API_Football_Staging tab with exact 14-column layout & Player_ID_Mappings updates
 */
export async function syncApiFootballGameweekStats(gameweek = 2, dateList = [], forceRefresh = false) {
  console.log('===========================================================')
  console.log(`🏆 SYNCING API-FOOTBALL STATS FOR GW${gameweek}`)
  console.log('===========================================================')

  if (!apiFootballKey) {
    console.warn('[API-Football] ⚠️ API_FOOTBALL_KEY is not configured in .env. Skipping API-Football pull.')
    return
  }

  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Master Player Position Registry from 'Players' tab
  // Columns: A=id, B=player_name, C=?, D=position, E=club
  const playersRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Players!A2:E' })
  const playerPositionMap = new Map()
  const playerClubMap = new Map()
  const playerCanonicalMap = new Map()
  ;(playersRes.data.values || []).forEach((r) => {
    const name = String(r[1] || '').trim() // B = player_name
    const pos = String(r[3] || 'MID').trim().toUpperCase() // D = position
    const club = String(r[4] || '').trim() // E = club
    if (name) {
      const norm = normalizeName(name)
      playerPositionMap.set(norm, pos)
      playerCanonicalMap.set(norm, name)
      if (club) playerClubMap.set(norm, club)
    }
  })

  // Load or initialize Player_Aliases sheet (Tier 0 admin override)
  const playerAliasMap = new Map()
  try {
    const aliasRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Player_Aliases!A2:D' })
    ;(aliasRes.data.values || []).forEach((r) => {
      const aliasName = String(r[0] || '').trim()
      const canonicalName = String(r[2] || '').trim()
      const club = String(r[3] || '').trim()
      if (aliasName && canonicalName) {
        playerAliasMap.set(normalizeName(aliasName), { aliasName, canonicalName, club })
      }
    })
  } catch (err) {
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: 'Player_Aliases' } } }],
        },
      })
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Player_Aliases!A1:D1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['alias_name', 'alias_source', 'canonical_name', 'club']] },
      })
      console.log('[API-Football] Initialized "Player_Aliases" sheet with header.')
    } catch (e) {
      // Ignore if tab already exists
    }
  }

  // Load Player_ID_Mappings to build reverse AF-ID -> position mapping
  const mappingRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: 'Player_ID_Mappings!A2:F' })
  const playerMappingList = (mappingRes.data.values || []).map((r, idx) => ({
    rowIdx: idx + 2,
    player_name: String(r[1] || '').trim(),
    club: String(r[2] || '').trim(),
    api_football_id: String(r[3] || '').trim(),
  }))
  const afIdToPosMap = new Map()
  playerMappingList.forEach((m) => {
    if (m.api_football_id) {
      const pos = playerPositionMap.get(normalizeName(m.player_name))
      if (pos) {
        afIdToPosMap.set(String(m.api_football_id).trim(), { pos, canonicalName: m.player_name })
      }
    }
  })
  const updatedMappings = new Map()

  // Read needed fixture IDs and authoritative scores from Fixture_Staging directly
  const fixtureRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Fixture_Staging!A2:J',
  })
  const fixtureRows = (fixtureRes.data.values || []).filter((r) => {
    return String(r[0] || '').trim() === String(gameweek) && String(r[7] || '').trim().toUpperCase() === 'FINISHED'
  })
  const neededFixtureIds = [...new Set(fixtureRows.map((r) => String(r[6] || '').trim()).filter(Boolean))]

  const scoreByAfId = new Map()
  fixtureRows.forEach((r) => {
    const afId = String(r[6] || '').trim()
    const homeScore = Number(r[8] || 0)
    const awayScore = Number(r[9] || 0)
    if (afId) {
      scoreByAfId.set(afId, { homeScore, awayScore })
    }
  })

  // 1. Check existing cached matches in API_Football_Staging
  const stagingRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'API_Football_Staging!A1:N',
  })
  const allStagingRows = stagingRes.data.values || []
  const header = allStagingRows[0] || [
    'gw', 'fixture_id', 'player_name', 'club', 'minutes',
    'goals', 'assists', 'clean_sheet', 'pen_miss', 'pen_save',
    'yellow_cards', 'red_cards', 'own_goals', 'points'
  ]
  const existingRows = allStagingRows.slice(1)

  // Identify fully completed cached matches with CS-ratio anomaly invalidation (Bug 5)
  const stagedMatchCountMap = new Map()
  const stagedMaxMinutesMap = new Map()
  const stagedCsCountMap = new Map()
  const stagedTotalMap = new Map()
  existingRows.forEach((r) => {
    const fId = String(r[1] || '').trim()
    const mins = Number(r[4] || 0)
    const isCs = String(r[7] || '').trim().toUpperCase() === 'TRUE'
    if (fId) {
      stagedMatchCountMap.set(fId, (stagedMatchCountMap.get(fId) || 0) + 1)
      stagedMaxMinutesMap.set(fId, Math.max(stagedMaxMinutesMap.get(fId) || 0, mins))
      stagedTotalMap.set(fId, (stagedTotalMap.get(fId) || 0) + 1)
      if (isCs) stagedCsCountMap.set(fId, (stagedCsCountMap.get(fId) || 0) + 1)
    }
  })

  const csInvalidateRatio = 0.50
  const fullyCachedMatchIds = new Set()
  for (const [fId, count] of stagedMatchCountMap.entries()) {
    const maxMins = stagedMaxMinutesMap.get(fId) || 0
    const totalCount = stagedTotalMap.get(fId) || 0
    const csCount = stagedCsCountMap.get(fId) || 0
    const csRatio = totalCount > 0 ? csCount / totalCount : 0
    const fixtureScore = scoreByAfId.get(fId)
    const bothConceded = fixtureScore && fixtureScore.homeScore > 0 && fixtureScore.awayScore > 0
    const suspiciousBothConceded = bothConceded && csCount > 2

    const looksValid = count >= 14 && maxMins >= 85 && csRatio <= csInvalidateRatio && !suspiciousBothConceded
    if (looksValid) {
      fullyCachedMatchIds.add(fId)
    } else if (count >= 14) {
      console.warn(`[API-Football Cache] ⚠️ Invalidating match ${fId}: ${csCount}/${totalCount} rows have CS=TRUE (${(csRatio * 100).toFixed(0)}%)${suspiciousBothConceded ? ' despite both teams conceding' : ''} — re-fetching.`)
    }
  }

  const isForceRefresh = Boolean(forceRefresh || process.env.FORCE_REFRESH_AF === 'true')
  if (isForceRefresh) {
    console.log(`[API-Football Cache] 🔄 Force refresh requested. Re-fetching all matches for GW${gameweek}.`)
    fullyCachedMatchIds.clear()
  }

  console.log(`[API-Football Cache] ${fullyCachedMatchIds.size} fully finished matches cached. ${stagedMatchCountMap.size - fullyCachedMatchIds.size} partial matches will be refreshed.`)

  if (neededFixtureIds.length === 0) {
    console.log(`[API-Football] No finished fixtures found in Fixture_Staging for GW${gameweek}. Skipping.`)
    return
  }

  console.log(`[API-Football] Found ${neededFixtureIds.length} finished fixtures in Fixture_Staging for GW${gameweek}. Fetching details directly with rate-limit safety.`)

  const newRows = []
  const unresolvedPosCollector = []

  // Throttled sequential fetch to respect API-Football's rate limits
  for (let i = 0; i < neededFixtureIds.length; i++) {
    const fixtureId = neededFixtureIds[i]
    if (fullyCachedMatchIds.has(fixtureId)) {
      console.log(`[API-Football Cache] ⚡ Skipping already-staged match: ${fixtureId}`)
      continue
    }

    const matchData = await fetchFixtureDetailsById(fixtureId)
    // 6.2s delay between requests to strictly respect API-Football's 10 req/min rate limit
    if (i < neededFixtureIds.length - 1) {
      const throttleMs = Number(process.env.API_FOOTBALL_THROTTLE_MS || 6200)
      await new Promise((r) => setTimeout(r, throttleMs))
    }

    if (!matchData || !matchData.players) {
      console.warn(`[API-Football] ⚠️ No player statistics returned for fixture ID ${fixtureId}.`)
      continue
    }

    const matchName = `${matchData.teams?.home?.name} vs ${matchData.teams?.away?.name}`
    const statusShort = String(matchData.fixture?.status?.short || '').toUpperCase()
    if (statusShort !== 'FT' && statusShort !== 'AET' && statusShort !== 'PEN') {
      console.log(`⏳ Match ${matchName} is currently ${statusShort} (in progress / scheduled). Skipping staging until full-time.`)
      continue
    }

    const homeScore = Number(matchData.goals?.home ?? 0)
    const awayScore = Number(matchData.goals?.away ?? 0)

    // Sub-aware CS: build per-player on-pitch windows from lineups[].startXI / substitutes.
    // Build per-fixture goal events with minute + scoring team id.
    // Also track per-event index in the events array for the Llorente
    // edge case (sub and goal sharing the same minute — we use event
    // order to disambiguate).
    //
    // Step 6: Also build a per-player own-goal count from the events array,
    // because `stats.goals.owngoals` in the player statistics block is
    // NOT present in the API-Football response. The events array is the
    // only reliable source for OG data.
    const matchGoalEvents = []
    const subOutEvents = [] // { afPlayerId, minute, eventIdx }
    const ownGoalCount = new Map()      // afPlayerId -> count of own goals
    const penaltyMissCount = new Map()  // afPlayerId -> count of missed penalties
    const penaltySaveCount = new Map()  // afPlayerId -> count of saved penalties (GKs)
    for (let evIdx = 0; evIdx < (matchData.events || []).length; evIdx++) {
      const ev = matchData.events[evIdx]
      if (ev.type === 'Goal' && ev.team?.id && ev.time?.elapsed != null) {
        // Missed penalty is NOT a scored goal — do not add to opponent conceded timeline
        if (ev.detail !== 'Missed Penalty') {
          matchGoalEvents.push({
            minute: Number(ev.time.elapsed),
            scoringTeamId: Number(ev.team.id),
            _eventIdx: evIdx,
          })
        }
        // Own goal: type='Goal' and detail='Own Goal'
        if (ev.detail === 'Own Goal' && ev.player?.id) {
          const pid = String(ev.player.id)
          ownGoalCount.set(pid, (ownGoalCount.get(pid) || 0) + 1)
        }
        // Missed penalty: type='Goal' and detail='Missed Penalty'
        if (ev.detail === 'Missed Penalty' && ev.player?.id) {
          const pid = String(ev.player.id)
          penaltyMissCount.set(pid, (penaltyMissCount.get(pid) || 0) + 1)
        }
        // Saved penalty: type='Goal' and detail='Penalty' (scored against GK) —
        // the player.id on a successful penalty is the SCORER, not the GK. AF does
        // not emit a separate "saved" event, so we fall back to stats.penalty.saved
        // for GKs and use this branch only as a defensive secondary source.
      } else if (ev.type === 'subst' && ev.player?.id && ev.time?.elapsed != null) {
        // AF API: the "player" field in subst events is the player going OUT,
        // and the "assist" field is the player coming IN. So player.id is
        // the OUT player.
        subOutEvents.push({
          afPlayerId: String(ev.player.id),
          minute: Number(ev.time.elapsed),
          eventIdx: evIdx,
        })
      }
    }

    // playerWindow[afPlayerId] = { start, end, isStarter, isHome }
    const playerWindow = new Map()
    for (const lineup of matchData.lineups || []) {
      const teamId = lineup.team?.id
      if (!teamId) continue
      for (const sx of lineup.startXI || []) {
        const pid = String(sx.player?.id || '')
        if (pid) playerWindow.set(pid, { start: 0, end: 90, isStarter: true, isHome: lineup.team?.id === matchData.teams?.home?.id })
      }
      for (const sub of lineup.substitutes || []) {
        const inId = String(sub.player?.id || '')
        const inTime = Number(sub.substitution?.time || 0)
        if (inId) playerWindow.set(inId, { start: inTime, end: 90, isStarter: false, isHome: lineup.team?.id === matchData.teams?.home?.id })
      }
    }

    for (const teamItem of matchData.players) {
      const isHome = teamItem.team?.id === matchData.teams?.home?.id
      const teamName = cleanClubName(teamItem.team?.name) || teamItem.team?.name
      const teamConceded = isHome ? awayScore : homeScore
      const players = teamItem.players || []

      for (const p of players) {
        const pName = p.player?.name
        const afPlayerId = String(p.player?.id || '')
        const stats = p.statistics?.[0] || {}
        const minutes = Number(stats.games?.minutes || 0)
        if (minutes === 0) continue

        const pos = String(stats.games?.position || 'M')
        const goals = Number(stats.goals?.total || 0)
        const assists = Number(stats.goals?.assists || 0)
        const yellowCards = Number(stats.cards?.yellow || 0)
        const redCards = Number(stats.cards?.red || 0)
        // Step 6: own goals come from the events array (ownGoalCount map),
        // NOT from stats.goals.owngoals (which is missing in the API response).
        const ownGoals = ownGoalCount.get(afPlayerId) || 0
        const penaltiesMissed = penaltyMissCount.get(afPlayerId) ?? Number(stats.penalty?.missed || 0)
        const penaltiesSaved = penaltySaveCount.get(afPlayerId) ?? Number(stats.penalty?.saved || 0)
        // Source-of-truth: team score is ground truth
        const finalConceded = teamConceded

        // Sub-aware clean sheet calculation (Bugs 1, 9 & Option C):
        // Resolve full player details (canonical name & position)
        const playerDetails = resolvePlayerDetails({
          rawName: pName,
          clubName: teamName,
          livePos: pos,
          playerPositionMap,
          playerClubMap,
          afIdToPosMap,
          afPlayerId,
          playerCanonicalMap,
          playerAliasMap,
          diagCollector: unresolvedPosCollector,
        })
        const fantasyPos = playerDetails.pos
        const canonicalPlayerName = playerDetails.canonicalName || pName
        const fantasyIsDefOrGk = fantasyPos === 'GK' || fantasyPos === 'GKP' || fantasyPos === 'DEF'
        let isCleanSheet = false

        if (fantasyIsDefOrGk && minutes >= 60) {
          const win = playerWindow.get(afPlayerId)
          if (win) {
            // Determine the player's on-pitch end (defaults to 90 for starters,
            // but check if they were subbed out — Llorente edge case).
            let playerEnd = win.end
            let subOutEvent = null
            for (const so of subOutEvents) {
              if (so.afPlayerId === afPlayerId) {
                if (so.minute < playerEnd || subOutEvent === null) {
                  playerEnd = so.minute
                  subOutEvent = so
                }
              }
            }
            // Bug 3: Starter subbed off with missing subOutEvent in events feed
            if (win.isStarter && minutes < 85 && !subOutEvent) {
              playerEnd = Math.min(90, win.start + minutes)
            }

            // Count opponent goals scored during [win.start, playerEnd]
            const oppGoalsOnPitch = matchGoalEvents.filter((g) => {
              const isOppGoal = win.isHome ? g.scoringTeamId !== matchData.teams?.home?.id : g.scoringTeamId !== matchData.teams?.away?.id
              if (!isOppGoal) return false
              if (g.minute < win.start || g.minute > playerEnd) return false
              // Llorente edge case: sub and goal share the same minute. If
              // the sub event came BEFORE the goal in the events feed, the
              // player was off the pitch for the goal.
              if (g.minute === playerEnd && subOutEvent) {
                if (subOutEvent.eventIdx < g._eventIdx) return false
              }
              return true
            }).length
            isCleanSheet = oppGoalsOnPitch === 0

            // Bug 2 safety net: If full-match defender's team conceded >= 1, cannot have clean sheet
            if (finalConceded > 0 && !subOutEvent && isCleanSheet) {
              isCleanSheet = false
            }
          } else {
            // Bug 4: Safe fallback when lineup window is missing: only award if team conceded 0 and played >= 60 mins
            isCleanSheet = finalConceded === 0 && minutes >= 60
          }
        }

        // Match with Player_ID_Mappings to store api_football_id
        if (afPlayerId && pName) {
          const normPName = normalizeName(pName)
          const normTeam = normalizeName(teamName)

          const matched = playerMappingList.find((tm) => {
            const tmNorm = normalizeName(tm.player_name)
            if (!tm.club || !isSameClub(tm.club, teamName)) return false
            const isSingleToken = !tmNorm.includes(' ') || !normPName.includes(' ')
            if (isSingleToken) {
              return tmNorm === normPName
            }
            return tmNorm === normPName || getSimilarityScore(tmNorm, normPName) >= SIMILARITY_THRESHOLDS.AF_NAME
          })

          if (matched && !matched.api_football_id) {
            updatedMappings.set(matched.rowIdx, {
              player_name: matched.player_name,
              api_football_id: afPlayerId,
            })
            matched.api_football_id = afPlayerId
            const mappedPos = playerPositionMap.get(normalizeName(matched.player_name))
            if (mappedPos) {
              afIdToPosMap.set(String(afPlayerId).trim(), mappedPos)
            }
          }
        }

        const pts = calculateApiFootballFantasyPoints({
          minutes,
          goalsScored: goals,
          assists,
          conceded: finalConceded,
          penaltiesSaved,
          penaltiesMissed,
          yellowCards,
          redCards,
          ownGoals,
          isCleanSheet,
          pos: fantasyPos,
        })

        newRows.push([
          String(gameweek),
          fixtureId,
          canonicalPlayerName, // Option C: Write canonical Players!B name to Column C
          teamName,
          minutes,
          goals,
          assists,
          isCleanSheet ? 'TRUE' : 'FALSE',
          penaltiesMissed,
          penaltiesSaved,
          yellowCards,
          redCards,
          ownGoals,
          pts,
        ])
      }
    }

    // Bug 6: Write-time CS anomaly sanity check
    const fixtureRowsWritten = newRows.filter((r) => r[1] === fixtureId)
    const defGkTotal = fixtureRowsWritten.filter((r) => {
      const p = playerPositionMap.get(normalizeName(r[2])) || ''
      return p === 'GK' || p === 'GKP' || p === 'DEF'
    }).length
    const defGkCsTrue = fixtureRowsWritten.filter((r) => {
      if (r[7] !== 'TRUE') return false
      const p = playerPositionMap.get(normalizeName(r[2])) || ''
      return p === 'GK' || p === 'GKP' || p === 'DEF'
    }).length
    if (defGkTotal > 0 && defGkCsTrue / defGkTotal > 0.8) {
      console.warn(`[API-Football CS Anomaly] Fixture ${fixtureId}: ${Math.round((defGkCsTrue / defGkTotal) * 100)}% of def/gk got CS (${defGkCsTrue}/${defGkTotal})`)
    }
  }

  // 3. Cleanly update API_Football_Staging tab (Retain fully cached + Add new/refreshed)
  // CRITICAL (Step 8): Merge-write instead of full-sheet clear+rewrite.
  // Preserve rows for OTHER GWs and rows for the target GW whose matchId is
  // NOT being re-fetched. The previous values.clear({A:N}) + values.update
  // approach wiped all other GWs' data on every sync.
  const refreshedMatchIds = new Set(newRows.map((r) => String(r[1] || '').trim()))

  // Read the current sheet content
  const existingSheetRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'API_Football_Staging!A1:N',
  })
  const existingValues = existingSheetRes.data.values || []
  const existingHeader = existingValues[0] || []
  const existingData = existingValues.slice(1)

  // Keep rows that aren't being replaced
  const rowsToKeep = existingData.filter((r) => {
    const gw = String(r[0] || '').trim()
    if (gw !== String(gameweek)) return true // other GW — keep
    const mId = String(r[1] || '').trim()
    return !refreshedMatchIds.has(mId) // target GW not re-fetched — keep
  })

  // De-dupe: if a row in rowsToKeep has same (gw, match_id, player_name) as a
  // new row, drop the existing one
  const newRowKey = (r) => `${String(r[0] || '').trim()}|${String(r[1] || '').trim()}|${String(r[2] || '').trim()}`
  const newKeys = new Set(newRows.map(newRowKey))
  const dedupedRowsToKeep = rowsToKeep.filter((r) => !newKeys.has(newRowKey(r)))

  // Also keep the fullyCachedMatchIds logic (legacy: existing rows for cached
  // matches are kept even if not in the refresh set)
  // The merge-write above already handles this since we only drop rows for
  // matches being re-fetched. So we don't need retainedRows anymore.

  const finalStagingData = [header, ...dedupedRowsToKeep, ...newRows]

  if (newRows.length > 0) {
    console.log(`[Google Sheets] Updating API_Football_Staging with ${finalStagingData.length - 1} total player rows (${newRows.length} new/refreshed)...`)

    // Pre-write safety snapshot
    const preWriteGwCounts = { '1': 0, '2': 0 }
    for (const r of dedupedRowsToKeep) {
      const gw = String(r[0] || '').trim()
      if (preWriteGwCounts[gw] !== undefined) preWriteGwCounts[gw]++
    }
    console.log(`[AF Pre-Snapshot] GW1=${preWriteGwCounts['1']} GW2=${preWriteGwCounts['2']} (must not change)`)

    // Single write — no values.clear needed
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'API_Football_Staging!A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: finalStagingData },
    })

    // Post-write safety check
    const postWriteRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'API_Football_Staging!A1:N',
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
        console.error(`🚨 [AF CRITICAL] GW${g} row count changed: ${preWriteGwCounts[g]} → ${postWriteGwCounts[g]}`)
      }
    }
    console.log(`[AF Post-Snapshot] GW1=${postWriteGwCounts['1']} GW2=${postWriteGwCounts['2']} ${preWriteGwCounts['1'] === postWriteGwCounts['1'] && preWriteGwCounts['2'] === postWriteGwCounts['2'] ? '✅ UNCHANGED' : '🚨 CHANGED'}`)
    console.log(`✅ Successfully updated API_Football_Staging tab with full 90-minute player boxscores!`)
  }

  // 4. Update Player_ID_Mappings with api_football_id
  if (updatedMappings.size > 0) {
    console.log(`Updating ${updatedMappings.size} API-Football IDs in Player_ID_Mappings...`)
    const updateData = []
    for (const [rowIdx, tm] of updatedMappings.entries()) {
      updateData.push({
        range: `Player_ID_Mappings!D${rowIdx}`,
        values: [[tm.api_football_id]],
      })
    }
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updateData,
      },
    })
    console.log(`✅ Updated ${updatedMappings.size} API-Football IDs in Player_ID_Mappings!`)
  }

  // Phase 3 Diagnostic: Log players with >= 60 mins who fell back to live match position
  const longUnresolved = unresolvedPosCollector.filter((p) => p.minutes >= 60)
  if (longUnresolved.length > 0) {
    console.warn(`[API-Football Diagnostic] ${longUnresolved.length} players with >=60 mins fell back to live position:`,
      longUnresolved.map((p) => `${p.rawName} (${p.clubName} - live: ${p.livePos} -> ${p.fallback})`).join(', ')
    )
  }
}
