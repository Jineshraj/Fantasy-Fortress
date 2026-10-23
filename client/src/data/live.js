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
import { getClubApiId, getClubBadgeUrl, getClubBroadcastCode } from '@/data/clubBadges'
import { playerPhoto } from '@/data/playerImages'

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
  teamScores: null, // gameweek_team_scores incl. captaincy resolution
  lineups: null, // submitted lineups incl. is_captain / is_vice
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

// Canonical three-letter broadcast code (ARS, CHE, RMA, FCB …). Never a
// three-character truncation — an unknown club renders an em dash.
export const broadcastCodeOf = (club) => getClubBroadcastCode(club)

const clubKey = (s) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

/**
 * True when two raw club strings describe the same real club. Resolution goes
 * through the shared club resolver (API-Football id) first and only falls back
 * to a normalized string compare — never a three-letter comparison.
 */
export const isSameClub = (a, b) => {
  if (!a || !b) return false
  const ida = getClubApiId(a)
  const idb = getClubApiId(b)
  if (ida && idb) return ida === idb
  return clubKey(a) === clubKey(b)
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
  const baseSelect =
    'gameweek,team_name,player_name,position,role,minutes,goals,assists,clean_sheet,yellow_cards,red_cards,own_goals,penalty_miss,penalty_save,base_points,stadium_bonus,multiplier,final_points,is_effective_starter'
  let rows
  try {
    rows = await loadAll(
      'player_gameweek_stats',
      `${baseSelect},points_breakdown,match_breakdown`,
      { column: 'gameweek' }
    )
  } catch {
    // Graceful fallback when points_breakdown and match_breakdown columns are not yet applied to Supabase
    rows = await loadAll('player_gameweek_stats', baseSelect, { column: 'gameweek' })
  }
  cache.pstats = rows
  return rows
}

/**
 * Submitted captain / vice and the server's final captain-handover result.
 * `gameweek_team_scores` carries the authoritative resolution; `lineups`
 * carries the original submission.
 */
async function fetchCaptaincyMap() {
  if (cache.teamScores && cache.lineups) {
    return { scores: cache.teamScores, lineups: cache.lineups }
  }
  const [scores, lineups] = await Promise.all([
    loadAll(
      'gameweek_team_scores',
      'team_name,gameweek,captain_name,effective_captain_name',
      { column: 'gameweek' }
    ),
    loadAll('lineups', 'team_name,gameweek,player_name,is_captain,is_vice', {
      column: 'gameweek',
    }),
  ])
  cache.teamScores = scores
  cache.lineups = lineups
  return { scores, lineups }
}

/** Captaincy context for one (team, gameweek). */
const captaincyContextFor = (scores, lineups, teamName, gw) => {
  const score = scores.find((r) => r.team_name === teamName && r.gameweek === gw)
  const rows = lineups.filter((r) => r.team_name === teamName && r.gameweek === gw)
  const submitted = rows.find((r) => r.is_captain)
  const vice = rows.find((r) => r.is_vice)
  return {
    submittedCaptain: score?.captain_name || submitted?.player_name || null,
    effectiveCaptain: score?.effective_captain_name || null,
    vice: vice?.player_name || null,
  }
}

/**
 * Captaincy metadata is a *display of the stored result* — `multiplier` and
 * `final_points` remain the scoring authority, so the gold `[ C ]` badge is
 * only ever attached to a row the engine actually doubled.
 */
const buildCaptaincy = (playerName, ctx, multiplier) => {
  const isEffectiveCaptain =
    Boolean(ctx.effectiveCaptain) &&
    playerName === ctx.effectiveCaptain &&
    Number(multiplier) === 2
  const designation = isEffectiveCaptain
    ? 'C'
    : ctx.vice && playerName === ctx.vice
      ? 'VC'
      : null
  return {
    designation,
    isEffectiveCaptain,
    multiplier: isEffectiveCaptain ? 2 : 1,
    handedOver:
      isEffectiveCaptain &&
      Boolean(ctx.submittedCaptain) &&
      ctx.submittedCaptain !== ctx.effectiveCaptain,
  }
}

/** The four states of the lineup state machine (uiux-improvements.md Item 4). */
const displayStateOf = (role) => {
  const r = String(role || '')
  if (r === 'AUTO_SUB_OUT') return 'AUTO_SUB_OUT'
  if (r === 'AUTO_SUB_IN') return 'AUTO_SUB_IN'
  if (r.startsWith('BENCH')) return 'BENCH_UNUSED'
  return 'STARTER'
}

/** Real-club opponent for a fantasy player in a given gameweek. */
const opponentLookup = (fixtures, gw) => {
  const list = fixtures.filter((f) => f.gw === gw)
  return (club) => {
    if (!club) return null
    for (const f of list) {
      if (isSameClub(club, f.homeName)) return { name: f.awayName, code: f.away, venue: 'home' }
      if (isSameClub(club, f.awayName)) return { name: f.homeName, code: f.home, venue: 'away' }
    }
    return null
  }
}

const toCard = (row, playersMap, seasonTotal, ctx, opponentOf) => {
  const meta = playersMap.get(row.player_name) || {}
  const club = meta.club || ''
  const role = row.role
  const isEffectiveStarter = Boolean(row.is_effective_starter)
  const displayState = displayStateOf(role)
  const points = row.final_points ?? 0

  return {
    name: row.player_name,
    short: shortName(row.player_name),
    pos: row.position,
    club,
    clubCode: broadcastCodeOf(club),
    points,
    // Only an effective starter's total counts anywhere it is shown; every
    // other row is explicitly zero rather than a silent 0-by-default.
    effectivePoints: isEffectiveStarter ? points : 0,
    season: seasonTotal ?? points,
    apiId: meta.apiId || null,
    photoUrl: playerPhoto(meta.apiId || null),
    minutes: row.minutes ?? 0,
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    role,
    displayState,
    isEffectiveStarter,
    captaincy: buildCaptaincy(row.player_name, ctx, row.multiplier),
    opponent: opponentOf(club),
    cleanSheet: Boolean(row.clean_sheet),
    yellowCards: row.yellow_cards ?? 0,
    redCards: row.red_cards ?? 0,
    ownGoals: row.own_goals ?? 0,
    penaltyMiss: row.penalty_miss ?? 0,
    penaltySave: row.penalty_save ?? 0,
    basePoints: row.base_points ?? null,
    stadiumBonus: row.stadium_bonus ?? 0,
    multiplier: row.multiplier ?? 1,
    gameweek: row.gameweek,
    teamName: row.team_name,
    pointsBreakdown: row.points_breakdown ?? null,
    matchBreakdown: row.match_breakdown ?? null,
  }
}

/**
 * Squad for one team + gameweek.
 *
 * Returns the *original submitted* XI in `starters` (including rows the engine
 * marked `AUTO_SUB_OUT`) and every bench row in `bench` — an auto-sub is never
 * moved onto the pitch. A gameweek with no rows returns an explicit empty
 * squad instead of falling back to another week's lineup.
 */
export async function fetchTeamSquad(teamName, gw) {
  const [rows, playersMap, fixtures, captaincy] = await Promise.all([
    fetchAllPlayerStats(),
    fetchPlayersMap(),
    fetchFixtures(),
    fetchCaptaincyMap(),
  ])
  const teamRows = rows.filter((r) => r.team_name === teamName)
  if (teamRows.length === 0) throw new DataError(`No stats for ${teamName}`, { table: 'player_gameweek_stats' })

  const seasonByPlayer = new Map()
  teamRows.forEach((r) => {
    seasonByPlayer.set(r.player_name, (seasonByPlayer.get(r.player_name) || 0) + (r.final_points || 0))
  })
  const teamSeasonTotal = [...seasonByPlayer.values()].reduce((s, v) => s + v, 0)

  const ctx = captaincyContextFor(captaincy.scores, captaincy.lineups, teamName, gw)
  const opponentOf = opponentLookup(fixtures, gw)

  // Requested week only — no fallback to a different gameweek.
  const gwRows = teamRows.filter((r) => r.gameweek === gw)
  const cards = gwRows.map((r) =>
    toCard(r, playersMap, seasonByPlayer.get(r.player_name) || 0, ctx, opponentOf)
  )

  const starters = cards.filter((c) => c.role === 'STARTER' || c.role === 'AUTO_SUB_OUT')
  const bench = cards
    .filter((c) => c.role === 'AUTO_SUB_IN' || String(c.role).startsWith('BENCH'))
    .sort((a, b) => String(a.role).localeCompare(String(b.role)))
  const effectiveStarters = cards.filter((c) => c.isEffectiveStarter)

  const prevGw = gw > 1 ? gw - 1 : null
  let prevGwTotal = null
  if (prevGw) {
    const prevEffective = teamRows.filter(
      (r) => r.gameweek === prevGw && (r.is_effective_starter || r.role === 'STARTER' || r.role === 'AUTO_SUB_IN')
    )
    if (prevEffective.length > 0) {
      prevGwTotal = prevEffective.reduce((s, p) => s + (p.final_points || 0), 0)
    }
  }

  const totals = {
    gw: effectiveStarters.reduce((s, p) => s + p.points, 0),
    prevGw,
    prevGwTotal,
    season: teamSeasonTotal,
    playedCount: starters.filter((p) => p.minutes > 0 || p.points > 0).length,
    effectivePlayerCount: effectiveStarters.length,
    startingSlots: starters.length,
  }

  return { starters, bench, effectiveStarters, totals }
}

// ---------------------------------------------------------------------------
// Player detail (Item 6) — points ledger, form timeline and DGW match cards.
//
// Everything rendered by the modal is server-provided: `points_breakdown` is
// generated by the scoring engine, `match_breakdown` is the per-fixture split.
// When either payload is absent the component shows an explicit pending state
// rather than distributing an aggregate the database never split.
// ---------------------------------------------------------------------------

const normalizeBreakdown = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const items = Array.isArray(raw.items) ? raw.items : null
  if (!items || items.length === 0) return null
  return { available: raw.available !== false, items }
}

/**
 * Shells come from the `fixtures` table and are the fixture truth for the
 * gameweek; `match_breakdown` only adds stats. Matching by `fixtureId` (rather
 * than by index) means the tabs stay correct even when the engine and the
 * fixture list order a double gameweek differently, and a fixture with no
 * per-fixture row still appears with `Match breakdown pending`.
 */
const normalizeMatches = (row, shells) => {
  const raw = row.match_breakdown
  const list = Array.isArray(raw) && raw.length > 0 ? raw : null

  const merge = (shellIn, m) => {
    const shell = shellIn || {}
    if (!m) return shell
    return {
      fixtureId: String(m.fixtureId ?? m.fixture_id ?? shell.fixtureId ?? ''),
      gameweek: Number(m.gameweek ?? shell.gameweek ?? row.gameweek),
      venue: m.venue === 'home' || m.venue === 'away' ? m.venue : shell.venue ?? null,
      opponent: {
        name: m.opponent?.name ?? m.opponentName ?? shell.opponent?.name ?? '—',
        code: m.opponent?.code ?? m.opponentCode ?? shell.opponent?.code ?? '—',
      },
      result: {
        home: m.result?.home ?? shell.result?.home ?? null,
        away: m.result?.away ?? shell.result?.away ?? null,
        status: m.result?.status ?? shell.result?.status ?? 'UNKNOWN',
      },
      minutes: m.minutes ?? shell.minutes ?? null,
      goals: m.goals ?? shell.goals ?? 0,
      assists: m.assists ?? shell.assists ?? 0,
      cleanSheet: m.cleanSheet ?? shell.cleanSheet ?? null,
      yellowCards: m.yellowCards ?? shell.yellowCards ?? 0,
      redCards: m.redCards ?? shell.redCards ?? 0,
      ownGoals: m.ownGoals ?? shell.ownGoals ?? 0,
      penaltySave: m.penaltySave ?? shell.penaltySave ?? 0,
      penaltyMiss: m.penaltyMiss ?? shell.penaltyMiss ?? 0,
      stadiumBonus: m.stadiumBonus ?? shell.stadiumBonus ?? 0,
      basePoints: m.basePoints ?? shell.basePoints ?? null,
      multiplier: m.multiplier === 2 ? 2 : shell.multiplier === 2 ? 2 : 1,
      totalPoints: m.totalPoints ?? shell.totalPoints ?? null,
      breakdown: Array.isArray(m.breakdown) ? m.breakdown : shell.breakdown || [],
      breakdownAvailable: Boolean(m.breakdownAvailable) || Boolean(shell.breakdownAvailable),
    }
  }

  const out = shells.map((shell, i) => {
    const m = list
      ? list.find((x) => String(x.fixtureId ?? x.fixture_id) === shell.fixtureId) || null
      : null
    return merge(shell, m)
  })

  if (list) {
    for (const m of list) {
      const fixtureId = String(m.fixtureId ?? m.fixture_id)
      if (!out.some((x) => x.fixtureId === fixtureId)) out.push(merge(null, m))
    }
  }
  return out
}

/**
 * Normalized `PlayerDetail` for the player modal (see uiux-improvements.md §3.1).
 * @param {string} playerName
 * @param {string} teamName
 * @param {number} gw
 */
export async function fetchPlayerDetail(playerName, teamName, gw) {
  const [rows, playersMap, captaincy, fixtures] = await Promise.all([
    fetchAllPlayerStats(),
    fetchPlayersMap(),
    fetchCaptaincyMap(),
    fetchFixtures(),
  ])

  const row = rows.find(
    (r) => r.gameweek === gw && r.team_name === teamName && r.player_name === playerName
  )
  if (!row) {
    throw new DataError(`No GW${gw} stats for ${playerName}`, { table: 'player_gameweek_stats' })
  }

  const meta = playersMap.get(playerName) || {}
  const club = meta.club || ''
  const ctx = captaincyContextFor(captaincy.scores, captaincy.lineups, teamName, gw)
  const opponentOf = opponentLookup(fixtures, gw)

  const totalPoints = row.final_points ?? null
  const breakdown = normalizeBreakdown(row.points_breakdown)

  const mult = row.multiplier === 2 ? 2 : 1

  // Every real fixture this player's club has in the gameweek. Two of them
  // means a Double Gameweek — detected from the fixture list, never guessed
  // from a single aggregate row.
  const clubFixtures = fixtures.filter(
    (f) => f.gw === gw && club && (isSameClub(club, f.homeName) || isSameClub(club, f.awayName))
  )
  const isDouble = clubFixtures.length === 2

  const shellFromFixture = (f) => {
    const isHome = isSameClub(club, f.homeName)
    return {
      fixtureId: String(f.id),
      gameweek: gw,
      venue: isHome ? 'home' : 'away',
      opponent: { name: isHome ? f.awayName : f.homeName, code: isHome ? f.away : f.home },
      result: {
        home: f.score?.[0] ?? null,
        away: f.score?.[1] ?? null,
        status: f.status || (f.score ? 'FINISHED' : 'SCHEDULED'),
      },
      minutes: null,
      goals: 0,
      assists: 0,
      cleanSheet: null,
      yellowCards: 0,
      redCards: 0,
      ownGoals: 0,
      penaltySave: 0,
      penaltyMiss: 0,
      stadiumBonus: 0,
      basePoints: null,
      multiplier: mult,
      totalPoints: null,
      breakdown: [],
      breakdownAvailable: false,
    }
  }

  const shells = clubFixtures.map(shellFromFixture)
  if (shells.length === 0) {
    const opp = opponentOf(club)
    shells.push({
      fixtureId: 'aggregate',
      gameweek: gw,
      venue: opp?.venue ?? null,
      opponent: { name: opp?.name ?? '—', code: opp?.code ?? '—' },
      result: { home: null, away: null, status: 'UNKNOWN' },
      minutes: null,
      goals: 0,
      assists: 0,
      cleanSheet: null,
      yellowCards: 0,
      redCards: 0,
      ownGoals: 0,
      penaltySave: 0,
      penaltyMiss: 0,
      stadiumBonus: 0,
      basePoints: null,
      multiplier: mult,
      totalPoints: null,
      breakdown: [],
      breakdownAvailable: false,
    })
  }

  // A single-fixture week carries the aggregate row itself — that IS the match.
  if (shells.length === 1) {
    shells[0] = {
      ...shells[0],
      minutes: row.minutes ?? null,
      goals: row.goals ?? 0,
      assists: row.assists ?? 0,
      cleanSheet: row.clean_sheet === true,
      yellowCards: row.yellow_cards ?? 0,
      redCards: row.red_cards ?? 0,
      ownGoals: row.own_goals ?? 0,
      penaltySave: row.penalty_save ?? 0,
      penaltyMiss: row.penalty_miss ?? 0,
      stadiumBonus: row.stadium_bonus ?? 0,
      basePoints: row.base_points ?? null,
      multiplier: mult,
      totalPoints,
      breakdown: breakdown?.items ?? [],
      breakdownAvailable: Boolean(breakdown?.available),
    }
  }

  const matches = normalizeMatches(row, shells)

  // Form: the player's completed gameweeks for this fantasy team, chronological,
  // latest five. Rows with no minutes and no points are omitted — a fabricated
  // zero is worse than an absent chip.
  const form = rows
    .filter(
      (r) =>
        r.team_name === teamName &&
        r.player_name === playerName &&
        r.gameweek !== gw &&
        (Number(r.minutes) > 0 || Number(r.final_points) !== 0)
    )
    .sort((a, b) => a.gameweek - b.gameweek)
    .slice(-4)
    .map((r) => ({
      gameweek: r.gameweek,
      points: r.final_points ?? 0,
      isDouble: Array.isArray(r.match_breakdown) && r.match_breakdown.length === 2,
    }))
    .concat([{ gameweek: gw, points: totalPoints ?? 0, isDouble }])
    .sort((a, b) => a.gameweek - b.gameweek)

  return {
    playerId: playerName,
    name: playerName,
    shortName: shortName(playerName),
    position: row.position,
    club,
    clubCode: broadcastCodeOf(club),
    photoUrl: playerPhoto(meta.apiId || null),
    selectedGameweek: gw,
    teamName,
    captaincy: buildCaptaincy(playerName, ctx, row.multiplier),
    gameweek: {
      gameweek: gw,
      totalPoints,
      isDouble,
      fixtureCount: clubFixtures.length,
      matches,
    },
    form,
    // Season/minutes/aggregate stats used by the modal header.
    season: rows
      .filter((r) => r.team_name === teamName && r.player_name === playerName)
      .reduce((s, r) => s + (r.final_points || 0), 0),
    minutes: row.minutes ?? 0,
    goals: row.goals ?? 0,
    assists: row.assists ?? 0,
    cleanSheet: Boolean(row.clean_sheet),
    yellowCards: row.yellow_cards ?? 0,
    redCards: row.red_cards ?? 0,
    basePoints: row.base_points ?? null,
    stadiumBonus: row.stadium_bonus ?? 0,
    multiplier: row.multiplier ?? 1,
    pointsBreakdown: breakdown,
    isEffectiveStarter: Boolean(row.is_effective_starter),
    displayState: displayStateOf(row.role),
    role: row.role,
  }
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
    'id,match_id,gameweek,home_team,away_team,home_score,away_score,match_date,status',
    { column: 'gameweek' }
  )
  const mapped = rows.map((r) => {
    const played =
      r.home_score !== null &&
      r.home_score !== undefined &&
      r.away_score !== null &&
      r.away_score !== undefined
    const status = String(r.status || '').trim().toUpperCase()
    return {
      // Provider id wins; the row UUID is the stable fallback. No positional
      // `live-${gw}-${index}` ids — they change whenever a match is re-synced.
      id: r.match_id || r.id,
      matchId: r.match_id || null,
      gw: r.gameweek,
      kickoff: r.match_date || 'TBD',
      status: status || (played ? 'FINISHED' : 'SCHEDULED'),
      home: getClubBroadcastCode(r.home_team),
      away: getClubBroadcastCode(r.away_team),
      homeName: r.home_team,
      awayName: r.away_team,
      homeApiId: getClubApiId(r.home_team),
      awayApiId: getClubApiId(r.away_team),
      homeBadge: getClubBadgeUrl(r.home_team),
      awayBadge: getClubBadgeUrl(r.away_team),
      score: played ? [r.home_score, r.away_score] : null,
    }
  })
  cache.fixtures = mapped
  return mapped
}

/**
 * One-word status for a gameweek: `Gameweek Live`, `Final` or
 * `Awaiting scores`. Returns null when fixtures are unavailable so the caller
 * can omit the pill instead of showing a fabricated state.
 */
export async function fetchGameweekStatus(gw) {
  let fixtures
  try {
    fixtures = await fetchFixtures()
  } catch {
    return null
  }
  const list = fixtures.filter((f) => f.gw === gw)
  if (list.length === 0) return null
  if (list.some((f) => f.status === 'LIVE')) return 'Gameweek Live'
  if (list.every((f) => f.status === 'FINISHED' || f.score)) return 'Final'
  return 'Awaiting scores'
}

// ---------------------------------------------------------------------------
// Fixture ownership (Item 7) — "Who owns who?" for one real fixture.
//
// Rows are keyed by (player_name, fantasy_team_name): a player drafted by two
// franchises appears once per owner. Points come from `final_points` (the
// stored total incl. multiplier); a player with no synced stats row is omitted
// rather than shown as a zero.
// ---------------------------------------------------------------------------

/**
 * @param {{homeName: string, awayName: string}} fixture
 * @param {number} gw
 * @returns {Promise<import('./live').OwnedPlayerRow[]>}
 */
export async function fetchFixtureOwnership(fixture, gw) {
  const [rows, playersMap, standings] = await Promise.all([
    fetchAllPlayerStats(),
    fetchPlayersMap(),
    fetchStandings(),
  ])
  const managerByTeam = new Map(standings.teams.map((t) => [t.name, t.manager]))

  const out = []
  const seen = new Set()
  for (const r of rows) {
    if (r.gameweek !== gw) continue
    const meta = playersMap.get(r.player_name) || {}
    const club = meta.club || ''
    const side = isSameClub(club, fixture.homeName)
      ? 'home'
      : isSameClub(club, fixture.awayName)
        ? 'away'
        : null
    if (!side) continue

    const key = `${r.player_name}::${r.team_name}`
    if (seen.has(key)) continue
    seen.add(key)

    const managerName = managerByTeam.get(r.team_name) || null
    out.push({
      playerId: r.player_name,
      playerName: r.player_name,
      photoUrl: playerPhoto(meta.apiId || null),
      side,
      club,
      clubCode: broadcastCodeOf(club),
      points: r.final_points ?? null,
      fantasyTeamName: r.team_name,
      managerName,
      ownerLabel: managerName || r.team_name,
      multiplier: r.multiplier ?? 1,
    })
  }

  return out.sort(
    (a, b) =>
      (a.side === b.side ? 0 : a.side === 'home' ? -1 : 1) ||
      (b.points ?? -Infinity) - (a.points ?? -Infinity) ||
      a.playerName.localeCompare(b.playerName)
  )
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

/** Highest gameweek that actually has team scores, or null when none do. */
export async function latestScoredGw() {
  const scores = await fetchH2HScores()
  if (scores.size === 0) return null
  let max = 0
  scores.forEach((_, key) => {
    const gw = Number(String(key).split(':')[0].replace('GW', ''))
    if (Number.isFinite(gw)) max = Math.max(max, gw)
  })
  return max || null
}

/** Set of gameweeks that have at least one team score. */
export async function scoredGameweeks() {
  const scores = await fetchH2HScores()
  const set = new Set()
  scores.forEach((_, key) => {
    const gw = Number(String(key).split(':')[0].replace('GW', ''))
    if (Number.isFinite(gw)) set.add(gw)
  })
  return set
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
  cache.teamScores = null
  cache.lineups = null
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
    track('scores', Promise.all([fetchH2HScores(), fetchCaptaincyMap()])),
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

/**
 * Revalidate in the background.
 *
 * Used by the header refresh button and the tab-focus refetch. It clears the
 * memo cache so the next read hits the network, then re-warms everything.
 *
 * The caller is responsible for keeping its current data on screen while this
 * is in flight — that is what makes it a background refresh rather than a
 * blanking reload. A rejection means the refresh failed; callers that already
 * have valid data should swallow it.
 */
export function revalidate(onProgress) {
  clearLiveCache()
  prefetchPromise = null
  return prefetchAll(onProgress)
}