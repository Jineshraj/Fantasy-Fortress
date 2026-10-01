// Live data layer — reads real tournament data from Supabase (anon/public read).
//
// NO FALLBACKS. There is no mock/demo data in this app. Every number rendered on
// screen came from the database. When a fetch fails the app shows an error state
// with a retry; it never substitutes fiction for a real result, and it never mixes
// real and fake rows on the same screen.

import { supabase } from '@/lib/supabase'
import {
  SUPER_CUP_FEEDERS,
  SUPER_CUP_R16,
  SUPER_CUP_ROUND_IDS,
  SUPER_CUP_STAGE_GW,
  SUPER_CUP_STAGE_LABEL,
  groupATeams,
  groupBTeams,
} from '@/data/tournamentFixtures'

export class DataError extends Error {
  constructor(message, { cause, table } = {}) {
    super(message)
    this.name = 'DataError'
    this.cause = cause
    this.table = table
  }
}

const cache = {
  standings: null,
  players: null,
  teams: null,
  pstats: null, // all player_gameweek_stats rows (~16 teams x 15 players x GWs)
  fixtures: null,
  gwScores: null,
}

async function loadAll(table, select, order) {
  if (!supabase) {
    throw new DataError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', { table })
  }
  let query = supabase.from(table).select(select)
  if (order) query = query.order(order.column, { ascending: order.ascending !== false })
  // paginate past the default 1000-row window
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) {
      throw new DataError(error.message || `Failed to load ${table}`, { cause: error, table })
    }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }
  return rows
}

// ---------- helpers ----------

export const shortName = (name = '') => {
  const parts = name.trim().split(/\s+/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

export const clubCodeOf = (club = '') => {
  const clean = club.replace(/[^a-zA-Z]/g, '')
  return (clean.slice(0, 3) || '—').toUpperCase()
}

// crest_url from Supabase `teams` wins; otherwise the local /fantasy-logos/*.png
const crestMap = new Map()
export const getFantasyLogo = (name, localFallback) => {
  if (name && crestMap.has(name)) return crestMap.get(name)
  return localFallback
}
export const setCrestMap = (rows = []) => {
  crestMap.clear()
  rows.forEach((r) => {
    if (r?.name && r?.crest_url) crestMap.set(r.name, r.crest_url)
  })
}

// Image failure memory lives in playerImages.js with the rest of the image
// concern; re-exported here because consumers import from the data layer.
export { markImageBroken, isImageBroken } from '@/data/playerImages'

// ---------- standings ----------

export async function fetchStandings() {
  if (cache.standings) return cache.standings
  const rows = await loadAll('standings', 'team_name,season_rank,season_total,gw_scores,updated_at', {
    column: 'season_rank',
  })
  if (rows.length === 0) {
    throw new DataError('The standings table is empty. Run the Supabase sync to populate it.', { table: 'standings' })
  }
  const teams = rows
    .filter((r) => r.team_name)
    .map((r) => ({
      name: r.team_name,
      manager: null,
      rank: r.season_rank ?? 0,
      total: r.season_total ?? 0,
      gwByWeek: Array.isArray(r.gw_scores) ? r.gw_scores.map((v) => Number(v) || 0) : [],
      updatedAt: r.updated_at || null,
    }))
    .sort((a, b) => a.rank - b.rank)

  // Latest gameweek = highest week index with a non-zero score for any team.
  let latestGw = 1
  teams.forEach((t) => {
    t.gwByWeek.forEach((v, i) => {
      if (v > 0) latestGw = Math.max(latestGw, i + 1)
    })
  })

  // Crests are cosmetic: a failure here must not fail the standings load.
  try {
    const teamRows = await loadAll('teams', 'name,crest_url')
    setCrestMap(teamRows)
  } catch {
    /* crests stay local-only */
  }

  const stamps = teams.map((t) => t.updatedAt).filter(Boolean).sort()
  const updatedAt = stamps.length ? stamps[stamps.length - 1] : null

  cache.standings = { teams, latestGw, updatedAt }
  return cache.standings
}

// ---------- players master (club + headshot id) ----------

export async function fetchPlayersMap() {
  if (cache.players) return cache.players
  const rows = await loadAll('players', 'name,club,position,api_football_id')
  const map = new Map()
  rows.forEach((r) => {
    if (r?.name) map.set(r.name, { club: r.club || '', apiId: r.api_football_id || null })
  })
  cache.players = map
  return map
}

// ---------- player gameweek stats ----------

async function fetchAllPlayerStats() {
  if (cache.pstats) return cache.pstats
  const rows = await loadAll(
    'player_gameweek_stats',
    'gameweek,team_name,player_name,position,role,minutes,goals,assists,clean_sheet,yellow_cards,red_cards,own_goals,penalty_miss,penalty_save,base_points,stadium_bonus,multiplier,final_points,is_effective_starter',
    { column: 'gameweek' }
  )
  cache.pstats = rows
  return rows
}

const toCard = (row, playersMap, seasonTotal) => {
  const meta = playersMap.get(row.player_name) || {}
  const club = meta.club || ''
  return {
    name: row.player_name,
    short: shortName(row.player_name),
    pos: row.position,
    club,
    clubCode: club ? clubCodeOf(club) : '—',
    points: row.final_points ?? 0,
    season: seasonTotal ?? row.final_points ?? 0,
    apiId: meta.apiId || null,
    minutes: row.minutes ?? 0,
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    role: row.role,
    cleanSheet: Boolean(row.clean_sheet),
    yellowCards: row.yellow_cards ?? 0,
    redCards: row.red_cards ?? 0,
    ownGoals: row.own_goals ?? 0,
    penaltyMiss: row.penalty_miss ?? 0,
    penaltySave: row.penalty_save ?? 0,
  }
}

// Squad for one team + gameweek. Returns { starters, bench, totals }.
export async function fetchTeamSquad(teamName, gw) {
  const [rows, playersMap] = await Promise.all([fetchAllPlayerStats(), fetchPlayersMap()])
  const teamRows = rows.filter((r) => r.team_name === teamName)
  if (teamRows.length === 0) throw new Error(`No stats for ${teamName}`)

  const seasonByPlayer = new Map()
  teamRows.forEach((r) => {
    seasonByPlayer.set(r.player_name, (seasonByPlayer.get(r.player_name) || 0) + (r.final_points || 0))
  })

  const gwRows = teamRows.filter((r) => r.gameweek === gw)
  const source =
    gwRows.length > 0
      ? gwRows
      : teamRows.filter((r) => r.gameweek === Math.max(...teamRows.map((x) => x.gameweek)))
  const cards = source.map((r) => toCard(r, playersMap, seasonByPlayer.get(r.player_name) || 0))

  // Roles written by the scoring engine: STARTER, AUTO_SUB_IN (bench who came
  // on) are on the pitch; BENCH_1..4 and AUTO_SUB_OUT (subbed-off starter) are not.
  const starters = cards.filter((c) => c.role === 'STARTER' || c.role === 'AUTO_SUB_IN')
  const bench = cards
    .filter((c) => !(c.role === 'STARTER' || c.role === 'AUTO_SUB_IN'))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)))

  const totals = {
    gw: starters.reduce((s, p) => s + p.points, 0),
    season: [...seasonByPlayer.values()].reduce((s, v) => s + v, 0),
  }
  return { starters, bench, totals }
}

// Cross-team leaders for the Stats tab.
export async function fetchStatLeaders(gw, limit = 10) {
  const [rows, playersMap] = await Promise.all([fetchAllPlayerStats(), fetchPlayersMap()])
  if (rows.length === 0) throw new Error('No player stats synced yet')
  const byPlayer = new Map()
  rows.forEach((r) => {
    if (!byPlayer.has(r.player_name)) {
      byPlayer.set(r.player_name, {
        position: r.position,
        gw: 0,
        season: 0,
        goals: 0,
        assists: 0,
        cleanSheet: false,
      })
    }
    const agg = byPlayer.get(r.player_name)
    agg.season += r.final_points || 0
    if (r.gameweek === gw) {
      agg.gw += r.final_points || 0
      agg.goals += r.goals || 0
      agg.assists += r.assists || 0
      agg.cleanSheet = agg.cleanSheet || Boolean(r.clean_sheet)
    }
  })
  return [...byPlayer.entries()]
    .map(([name, agg]) => {
      const meta = playersMap.get(name) || {}
      const club = meta.club || ''
      return {
        name,
        short: shortName(name),
        pos: agg.position,
        club,
        clubCode: club ? clubCodeOf(club) : '—',
        points: agg.gw,
        season: agg.season,
        apiId: meta.apiId || null,
        goals: agg.goals,
        assists: agg.assists,
        cleanSheet: agg.cleanSheet,
      }
    })
    .sort((a, b) => b.points - a.points || b.season - a.season)
    .slice(0, limit)
}

// ---------- fixtures ----------

export async function fetchFixtures() {
  if (cache.fixtures) return cache.fixtures
  const rows = await loadAll(
    'fixtures',
    'gameweek,home_team,away_team,home_score,away_score,match_date,status',
    { column: 'gameweek' }
  )
  const mapped = rows.map((r, i) => {
    const played =
      r.home_score !== null &&
      r.home_score !== undefined &&
      r.away_score !== null &&
      r.away_score !== undefined
    return {
      id: `live-${r.gameweek}-${i}`,
      gw: r.gameweek,
      kickoff: r.match_date || 'TBD',
      home: clubCodeOf(r.home_team),
      away: clubCodeOf(r.away_team),
      homeName: r.home_team,
      awayName: r.away_team,
      score: played ? [r.home_score, r.away_score] : null,
    }
  })
  cache.fixtures = mapped
  return mapped
}

// ---------- H2H + Super Cup match scores ----------

// Every team's weekly H2H score = team total - stadium bonus.
// Mirrors getTeamH2HScores() in server/src/services/h2hScoringService.js:90.
// Returns Map<"GW<n>:<team>", number> so any fixture can be scored by lookup.
async function fetchH2HScores() {
  if (cache.gwScores) return cache.gwScores
  const rows = await loadAll(
    'gameweek_team_scores',
    'team_name,gameweek,total_points,stadium_bonus',
    { column: 'gameweek' }
  )
  const map = new Map()
  rows.forEach((r) => {
    const h2hScore = (Number(r.total_points) || 0) - (Number(r.stadium_bonus) || 0)
    map.set(`GW${r.gameweek}:${r.team_name}`, h2hScore)
  })
  cache.gwScores = map
  return map
}

// Returns a decorated H2H week: each match gets homeGw/awayGw + winner.
export async function buildH2HWeek(week) {
  const scores = await fetchH2HScores()
  if (scores.size === 0) throw new Error('No team scores synced yet')
  return {
    gw: week.gw,
    matches: week.matches.map((m) => {
      const homeGw = scores.get(`GW${week.gw}:${m.home}`)
      const awayGw = scores.get(`GW${week.gw}:${m.away}`)
      const played = homeGw !== undefined && awayGw !== undefined
      return {
        ...m,
        homeGw: played ? homeGw : null,
        awayGw: played ? awayGw : null,
        winner: played ? (homeGw > awayGw ? 'home' : awayGw > homeGw ? 'away' : null) : null,
        played,
      }
    }),
  }
}

const sortTable = (a, b) =>
  b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team)

// Standings per group derived from all played H2H group matches.
export async function buildH2HStandings(weeks) {
  const scores = await fetchH2HScores()
  if (scores.size === 0) throw new Error('No team scores synced yet')
  const playedWeeks = weeks.filter((w) =>
    w.matches.some(
      (m) => scores.has(`GW${w.gw}:${m.home}`) && scores.has(`GW${w.gw}:${m.away}`)
    )
  )
  const table = new Map()
  const bump = (team, f, l) => {
    if (!table.has(team)) table.set(team, { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 })
    const t = table.get(team)
    t.p += 1
    t.w += f
    t.l += l
    t.pts += f * 3
    return t
  }
  playedWeeks.forEach((w) =>
    w.matches.forEach((m) => {
      const hg = scores.get(`GW${w.gw}:${m.home}`)
      const ag = scores.get(`GW${w.gw}:${m.away}`)
      if (hg === undefined || ag === undefined) return
      const h = bump(m.home, hg > ag ? 1 : 0, hg < ag ? 1 : 0)
      const a = bump(m.away, ag > hg ? 1 : 0, ag < hg ? 1 : 0)
      h.gf += hg
      h.ga += ag
      a.gf += ag
      a.ga += hg
      if (hg === ag) {
        h.d += 1
        a.d += 1
        h.pts += 1
        a.pts += 1
      }
    })
  )
  return {
    GroupA: [...table.values()].filter((t) => groupATeams.includes(t.team)).sort(sortTable),
    GroupB: [...table.values()].filter((t) => groupBTeams.includes(t.team)).sort(sortTable),
  }
}

// Super Cup: resolve winners through the bracket using each stage's gameweek.
export async function buildSuperCup() {
  const scores = await fetchH2HScores()
  if (scores.size === 0) throw new Error('No team scores synced yet')

  const winnerOf = new Map()
  const matchById = new Map(SUPER_CUP_R16.map((m) => [m.id, m]))
  const rounds = []

  const buildRound = (stage, ids, label) => ({
    stage,
    name: label,
    gw: SUPER_CUP_STAGE_GW[stage],
    matches: ids.map((id) => {
      const feeder = SUPER_CUP_FEEDERS[id]
      const home = id.startsWith('M') ? matchById.get(id).home : winnerOf.get(feeder.home)
      const away = id.startsWith('M') ? matchById.get(id).away : winnerOf.get(feeder.away)
      const gw = SUPER_CUP_STAGE_GW[stage]
      const homeGw = home ? scores.get(`GW${gw}:${home}`) : undefined
      const awayGw = away ? scores.get(`GW${gw}:${away}`) : undefined
      const settled = homeGw !== undefined && awayGw !== undefined
      const winner = settled ? (homeGw > awayGw ? home : awayGw > homeGw ? away : null) : null
      if (winner) winnerOf.set(id, winner)
      return {
        id,
        home: home ?? null,
        away: away ?? null,
        homeScore: homeGw ?? null,
        awayScore: awayGw ?? null,
        winner,
        settled,
      }
    }),
  })

  rounds.push(buildRound('M', SUPER_CUP_ROUND_IDS.M, SUPER_CUP_STAGE_LABEL.M))
  rounds.push(buildRound('QF', SUPER_CUP_ROUND_IDS.QF, SUPER_CUP_STAGE_LABEL.QF))
  rounds.push(buildRound('SF', SUPER_CUP_ROUND_IDS.SF, SUPER_CUP_STAGE_LABEL.SF))
  rounds.push(buildRound('FINAL', SUPER_CUP_ROUND_IDS.FINAL, SUPER_CUP_STAGE_LABEL.FINAL))

  const champion = winnerOf.get('FINAL') || null
  return { rounds, champion }
}

export function clearLiveCache() {
  cache.standings = null
  cache.players = null
  cache.teams = null
  cache.pstats = null
  cache.fixtures = null
  cache.gwScores = null
}

// ---------------------------------------------------------------------------
// Boot prefetch — starts on app mount, in parallel, and gates the splash.
//
// The splash used to be a fixed 2s timer that fired *before* any request was
// made, so the user waited 2s for nothing and then waited again for data. This
// warms every core dataset up front and reports per-step progress so the
// loading screen reflects real work.
//
// `standings` is the only hard requirement: without it there is no app. The
// rest are best-effort — a failure there degrades that one screen (which shows
// its own error state) rather than blocking the whole hub.
// ---------------------------------------------------------------------------
export const PREFETCH_STEPS = [
  { key: 'standings', label: 'League table' },
  { key: 'squads', label: 'Squads & player stats' },
  { key: 'scores', label: 'H2H & cup scores' },
  { key: 'fixtures', label: 'Fixtures' },
]

let prefetchPromise = null

/**
 * @param {(progress: {done: string[], failed: string[]}) => void} [onProgress]
 * @returns {Promise<{standings: object, errors: Record<string, string>}>}
 */
export function prefetchAll(onProgress) {
  if (prefetchPromise) return prefetchPromise

  const done = []
  const failed = []
  const errors = {}
  const report = () => onProgress?.({ done: [...done], failed: [...failed] })

  const track = (key, promise) =>
    promise.then(
      (value) => {
        done.push(key)
        report()
        return value
      },
      (err) => {
        failed.push(key)
        errors[key] = err?.message || 'Unknown error'
        report()
        // Swallow: a non-critical step must not reject the whole boot.
        return null
      }
    )

  const standingsPromise = track('standings', fetchStandings())

  prefetchPromise = Promise.all([
    standingsPromise,
    track('squads', fetchAllPlayerStats().then(() => fetchPlayersMap())),
    track('scores', fetchH2HScores()),
    track('fixtures', fetchFixtures()),
  ]).then(([standings]) => {
    if (!standings) {
      throw new DataError(errors.standings || 'Could not load the league table.', { table: 'standings' })
    }
    return { standings, errors }
  })

  return prefetchPromise
}

/** Retry path: drop the cache and boot again. */
export function retryPrefetch(onProgress) {
  clearLiveCache()
  prefetchPromise = null
  return prefetchAll(onProgress)
}