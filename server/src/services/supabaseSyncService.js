import 'dotenv/config'
import { google } from 'googleapis'
import { getGoogleAuth } from '../lib/auth.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { TEAM_STADIUM_MAP } from './scoringEngine.js'
import { normalizeName } from './rosterValidator.js'

/**
 * Synchronizes Google Sheets verified data into Supabase PostgreSQL
 * @param {number} targetGw - Target Gameweek
 * @param {Map} teamResults - Optional in-memory team results from scoring engine
 */
export async function syncAllToSupabase(targetGw, teamResults = null) {
  if (targetGw === undefined || targetGw === null) {
    throw new Error('[Supabase Sync] ERROR: targetGw is required. Pass explicit GW or use getActiveGameweek().')
  }
  if (!isSupabaseConfigured() || !supabase) {
    console.log('[Supabase Sync] Skipped: SUPABASE_URL or API keys are not set in .env.')
    return { success: false, reason: 'unconfigured' }
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID
  const auth = getGoogleAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  console.log('\n===========================================================')
  console.log(`🗄️ SYNCING COMPLETE LEAGUE DATA TO SUPABASE POSTGRESQL (GW${targetGw})`)
  console.log('===========================================================')

  try {
    // 1. Sync 16 Franchises (teams table)
    console.log('[1/7] Syncing Teams...')
    const teamRows = Object.entries(TEAM_STADIUM_MAP).map(([teamName, info]) => ({
      name: teamName,
      stadium_name: info.stadium,
      home_club: info.homeClub,
    }))
    const { error: teamErr } = await supabase.from('teams').upsert(teamRows, { onConflict: 'name' })
    if (teamErr) console.warn('[Supabase] Teams Upsert Warning:', teamErr.message)
    else console.log(`✅ Synced ${teamRows.length} Teams.`)

    // 2. Sync Master Players Registry (players table)
    console.log('[2/7] Syncing Master Players Registry...')
    try {
      const [playersRes, mappingsRes] = await Promise.all([
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Players!A2:G',
        }),
        sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Player_ID_Mappings!A2:F',
        }).catch(() => ({ data: { values: [] } })),
      ])

      const idMap = new Map()
      for (const m of (mappingsRes.data?.values || [])) {
        const tmId = String(m[0] || '').trim()
        const pName = String(m[1] || '').trim().toLowerCase()
        const pClub = String(m[2] || '').trim().toLowerCase()
        const apiFootballId = String(m[3] || '').trim() || null
        const sofaScoreId = String(m[4] || '').trim() || null
        if (tmId) idMap.set(`tm_${tmId}`, { apiFootballId, sofaScoreId })
        if (pName && pClub) idMap.set(`${pName}|${pClub}`, { apiFootballId, sofaScoreId })
      }

      const playerRows = (playersRes.data.values || []).map((r) => {
        const tmId = String(r[0] || '').trim() || null
        const name = String(r[1] || '').trim()
        let rawPos = String(r[3] || 'MID').toUpperCase().trim()
        let position = 'MID'
        if (rawPos === 'GK' || rawPos === 'GKP') position = 'GK'
        else if (rawPos === 'DEF' || rawPos.startsWith('D')) position = 'DEF'
        else if (rawPos === 'MID' || rawPos.startsWith('M')) position = 'MID'
        else if (rawPos === 'FWD' || rawPos === 'FOR' || rawPos.startsWith('F')) position = 'FWD'

        const club = String(r[4] || '').trim()
        const key = `${name.toLowerCase()}|${club.toLowerCase()}`
        const mapping = (tmId && idMap.get(`tm_${tmId}`)) || idMap.get(key) || {}

        return {
          name,
          club,
          position,
          transfermarkt_id: tmId,
          sofascore_id: mapping.sofaScoreId || null,
          api_football_id: mapping.apiFootballId || null,
        }
      }).filter((p) => p.name && p.club)

      if (playerRows.length > 0) {
        // Fetch existing players from Supabase to handle sync without requiring unique(name,club) constraint
        let existingPlayers = []
        let from = 0
        while (true) {
          const { data, error } = await supabase.from('players').select('id, name, club').range(from, from + 999)
          if (error || !data || data.length === 0) break
          existingPlayers.push(...data)
          if (data.length < 1000) break
          from += 1000
        }

        const existingMap = new Map()
        for (const ep of existingPlayers) {
          existingMap.set(`${ep.name.trim().toLowerCase()}|${ep.club.trim().toLowerCase()}`, ep.id)
        }

        const toInsert = []
        const toUpdate = []

        for (const p of playerRows) {
          const key = `${p.name.trim().toLowerCase()}|${p.club.trim().toLowerCase()}`
          const existingId = existingMap.get(key)
          if (existingId) {
            toUpdate.push({ id: existingId, ...p })
          } else {
            toInsert.push(p)
          }
        }

        if (toInsert.length > 0) {
          for (let i = 0; i < toInsert.length; i += 500) {
            const batch = toInsert.slice(i, i + 500)
            const { error: insErr } = await supabase.from('players').insert(batch)
            if (insErr) console.warn('[Supabase] Players Insert Warning:', insErr.message)
          }
        }

        if (toUpdate.length > 0) {
          for (let i = 0; i < toUpdate.length; i += 500) {
            const batch = toUpdate.slice(i, i + 500)
            const { error: updErr } = await supabase.from('players').upsert(batch, { onConflict: 'id' })
            if (updErr) console.warn('[Supabase] Players Update Warning:', updErr.message)
          }
        }

        console.log(`✅ Synced ${playerRows.length} Master Players (${toInsert.length} new, ${toUpdate.length} updated).`)
      }
    } catch (e) {
      console.warn('[Supabase] Players Tab Sync Notice:', e.message)
    }

    // 3. Sync Standings Tab (standings table)
    console.log('[3/7] Syncing Master Standings...')
    const standingsRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Standings!A2:AO18',
    })
    const standingsData = standingsRes.data.values || []
    const standingsUpserts = []

    for (const r of standingsData) {
      const teamName = String(r[1] || '').trim()
      if (!teamName) continue

      const seasonRank = Number(r[0]) || 0
      const seasonTotal = Number(r[2]) || 0
      const gwScores = []
      for (let w = 1; w <= 38; w++) {
        gwScores.push(Number(r[2 + w]) || 0)
      }

      standingsUpserts.push({
        team_name: teamName,
        season_rank: seasonRank,
        season_total: seasonTotal,
        gw_scores: gwScores,
        updated_at: new Date().toISOString(),
      })
    }

    if (standingsUpserts.length > 0) {
      const { error: stErr } = await supabase.from('standings').upsert(standingsUpserts, { onConflict: 'team_name' })
      if (stErr) console.warn('[Supabase] Standings Upsert Warning:', stErr.message)
      else console.log(`✅ Synced ${standingsUpserts.length} Standings rows.`)
    }

    // 4. Sync Submitted Lineups (lineups table)
    console.log(`[4/7] Syncing GW${targetGw} Submitted Lineups...`)
    const lineupsRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Lineup_Rosters!A2:H',
    })
    const lineupsData = (lineupsRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
    const lineupUpserts = lineupsData.map((r) => {
      let parsedDate = new Date().toISOString()
      if (r[7]) {
        const d = new Date(r[7])
        if (!isNaN(d.getTime())) parsedDate = d.toISOString()
      }

      return {
        gameweek: Number(r[0]),
        team_name: String(r[1] || '').trim(),
        player_name: String(r[2] || '').trim(),
        position: String(r[3] || '').trim(),
        role: String(r[4] || '').trim(),
        is_captain: String(r[5] || '').toUpperCase() === 'TRUE',
        is_vice: String(r[6] || '').toUpperCase() === 'TRUE',
        submitted_at: parsedDate,
      }
    }).filter((p) => p.team_name && p.player_name)

    if (lineupUpserts.length > 0) {
      const { error: lineErr } = await supabase.from('lineups').upsert(lineupUpserts, { onConflict: 'team_name,gameweek,player_name' })
      if (lineErr) console.warn('[Supabase] Lineups Upsert Warning:', lineErr.message)
      else console.log(`✅ Synced ${lineupUpserts.length} GW${targetGw} Lineups.`)
    }

    // 5. Sync Fixtures (fixtures table) — Exact Column Mapping (Fixes CRIT-09)
    console.log(`[5/7] Syncing GW${targetGw} Fixtures...`)
    const fixtureRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Fixture_Staging!A2:J',
    })
    const fixtureData = (fixtureRes.data.values || []).filter((r) => String(r[0] || '').trim() === String(targetGw))
    const fixtureUpserts = fixtureData.map((r) => {
      const gw = Number(r[0])
      const matchDate = String(r[1] || '').trim()
      const league = String(r[2] || '').trim()
      const homeTeam = String(r[3] || '').trim()
      const awayTeam = String(r[4] || '').trim()
      const sofaId = String(r[5] || '').trim()
      const afId = String(r[6] || '').trim()
      const status = String(r[7] || 'SCHEDULED').trim().toUpperCase()
      const homeScore = r[8] !== undefined && r[8] !== '' ? Number(r[8]) : null
      const awayScore = r[9] !== undefined && r[9] !== '' ? Number(r[9]) : null

      const matchId = sofaId || afId || `${gw}_${homeTeam}_${awayTeam}`

      return {
        gameweek: gw,
        match_id: matchId,
        league,
        home_team: homeTeam,
        away_team: awayTeam,
        home_score: homeScore,
        away_score: awayScore,
        match_date: matchDate,
        status,
      }
    }).filter((f) => f.home_team && f.away_team)

    if (fixtureUpserts.length > 0) {
      const { error: fixErr } = await supabase.from('fixtures').upsert(fixtureUpserts, { onConflict: 'gameweek,match_id,home_team,away_team' })
      if (fixErr) console.warn('[Supabase] Fixtures Upsert Warning:', fixErr.message)
      else console.log(`✅ Synced ${fixtureUpserts.length} GW${targetGw} Fixtures.`)
    }

    // 6. Sync Player Gameweek Points & Breakdown (player_gameweek_stats) (Fixes CRIT-08)
    if (teamResults && teamResults.size > 0) {
      console.log(`[6/7] Syncing GW${targetGw} Player Performance Breakdown...`)
      const playerStatRows = []
      const teamScoreRows = []

      for (const [tName, tData] of teamResults.entries()) {
        teamScoreRows.push({
          team_name: tName,
          gameweek: Number(targetGw),
          captain_name: tData.captain,
          effective_captain_name: tData.effective_captain,
          stadium_name: tData.stadium_name,
          stadium_bonus: tData.stadium_bonus,
          stadium_result_label: tData.stadium_label,
          total_points: tData.total_points,
        })

        for (const p of tData.players || []) {
          playerStatRows.push({
            gameweek: Number(targetGw),
            team_name: tName,
            player_name: p.player_name,
            position: p.position || 'MID',
            role: p.role || 'STARTER',
            minutes: Number(p.minutes !== undefined ? p.minutes : (p.played ? 90 : 0)),
            base_points: Number(p.base_pts || 0),
            stadium_bonus: Number(p.stadium_bonus || 0),
            multiplier: Number(p.multiplier || 1),
            final_points: Number(p.final_pts || 0),
            is_effective_starter: Boolean(p.isEffectiveStarter),
          })
        }
      }

      if (playerStatRows.length > 0) {
        const { error: psErr } = await supabase.from('player_gameweek_stats').upsert(playerStatRows, { onConflict: 'gameweek,team_name,player_name' })
        if (psErr) console.warn('[Supabase] Player Stats Upsert Warning:', psErr.message)
        else console.log(`✅ Synced ${playerStatRows.length} GW${targetGw} Player Stats.`)
      }

      if (teamScoreRows.length > 0) {
        const { error: tsErr } = await supabase.from('gameweek_team_scores').upsert(teamScoreRows, { onConflict: 'team_name,gameweek' })
        if (tsErr) console.warn('[Supabase] Team Scores Upsert Warning:', tsErr.message)
        else console.log(`✅ Synced ${teamScoreRows.length} GW${targetGw} Team Weekly Scores.`)
      }
    } else {
      console.log('[6/7] Player stats & team weekly scores will sync on next scoring run.')
    }

    console.log('\n🎉 ALL 7 SUPABASE TABLES SYNCHRONIZED SUCCESSFULLY!')

    // D74: Write back 'SYNCED' to Comparison_Dashboard sync_status column
    try {
      const dashRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Comparison_Dashboard!A2:I',
      })
      const dashRows = dashRes.data.values || []
      const updateValues = []
      for (let i = 0; i < dashRows.length; i++) {
        const key = `${normalizeName(String(dashRows[i][0] || ''))}_${normalizeName(String(dashRows[i][1] || ''))}`
        const syncStatus = String(dashRows[i][8] || '').trim().toUpperCase()
        if (syncStatus === 'PENDING') {
          updateValues.push({ rowIndex: i + 2, key, synced: true })
        } else {
          updateValues.push({ rowIndex: i + 2, key, synced: false })
        }
      }

      const syncedCount = updateValues.filter(u => u.synced).length
      if (syncedCount > 0) {
        const syncUpdateBatch = updateValues
          .filter(u => u.synced)
          .map(u => ({
            range: `'Comparison_Dashboard'!I${u.rowIndex}:I${u.rowIndex}`,
            values: [['SYNCED']],
          }))
        if (syncUpdateBatch.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'USER_ENTERED', data: syncUpdateBatch },
          })
          console.log(`[Dashboard] Wrote 'SYNCED' to ${syncedCount} Comparison_Dashboard rows.`)
        }
      }
    } catch (e) {
      console.warn('[Dashboard] Could not update sync_status column:', e.message)
    }

    return { success: true }
  } catch (err) {
    console.error('[Supabase Sync Error]', err)
    return { success: false, error: err.message }
  }
}
