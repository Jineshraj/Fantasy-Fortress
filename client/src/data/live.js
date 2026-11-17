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

// Per-(team, gameweek) `match_breakdown` rows. Kept out of the global boot
// cache: the card only needs one team's 15 players for the visible week.
const teamBreakdownCache = new Map()

// Shared boot-progress state. Tier 1 (standings) and the background tiers push
// into the same lists so the splash can show honest, cumulative progress.
const progressState = { done: [], failed: [] }
const resetProgress = () => {
  progressState.done = []
  progressState.failed = []
}

const RETRY_DELAY_MS = 1000
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// One automatic retry, but only for failures that can actually heal themselves
// (network blip, cold Supabase). Missing tables/columns and other 4xx responses
// are surfaced immediately — retrying them only delays the error.
const isRetriableError = (err) => {
  const code = String(err?.code || err?.cause?.code || '')
  const status = Number(err?.status || err?.cause?.status || 0)
  if (['42P01', '42703', '42883', 'PGRST204', 'PGRST205'].includes(code)) return false
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return false
  const message = String(err?.message || err?.cause?.message || '').toLowerCase()
  if (message.includes('does not exist') || message.includes('column')) return false
  return true
}

async function loadPage(table, select, order, filter, from, to) {
  let attempt = 0
  for (;;) {
    try {
      let query = supabase.from(table).select(select)
      if (order) {
        query = query.order(order.column, { ascending: order.ascending !== false })
        if (order.column !== 'id') {
          query = query.order('id', { ascending: true })
        }
      }
      if (filter) {
        const filters = Array.isArray(filter) ? filter : [filter]
        filters.forEach((f) => {
          if (f?.column) query = query.eq(f.column, f.value)
        })
      }
      const { data, error } = await query.range(from, to)
      if (error) {
        throw new DataError(error.message || `Failed to load ${table}`, { cause: error, table })
      }
      return data || []
    } catch (err) {
      if (attempt < 1 && isRetriableError(err)) {
        attempt += 1
        await delay(RETRY_DELAY_MS)
        continue
      }
      throw err
    }
  }
}

/**
 * Load every page of a table. `filter` is an optional equality constraint
 * (`{ column, value }`) or a list of them so callers can pull one team's
 * single gameweek instead of the whole history. Each page gets one automatic
 * retry on transient failures.
 */
async function loadAll(table, select, order, filter) {
  if (!supabase) {
    throw new DataError('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.', { table })
  }
  const rows = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const data = await loadPage(table, select, order, filter, from, from + pageSize - 1)
    rows.push(...data)
    if (data.length < pageSize) break
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

// Scalar columns only. `points_breakdown` / `match_breakdown` are large JSON
// payloads that only the player-detail modal needs, so they are fetched on
// demand (see `fetchPlayerBreakdownRows`) instead of in this hot query.
const PLAYER_STATS_SELECT =
  'gameweek,team_name,player_name,position,role,minutes,goals,assists,clean_sheet,yellow_cards,red_cards,own_goals,penalty_miss,penalty_save,base_points,stadium_bonus,multiplier,final_points,is_effective_starter'

const BREAKDOWN_SELECT =
  'gameweek,team_name,player_name,points_breakdown,match_breakdown'

async function fetchAllPlayerStats() {
  if (cache.pstats) return cache.pstats
  const rows = await loadAll('player_gameweek_stats', PLAYER_STATS_SELECT, { column: 'gameweek' })
  cache.pstats = rows
  return rows
}

// On-demand JSON for one player. A schema without these columns simply yields
// no breakdown (the modal then shows its pending state), never a failed screen.
async function fetchPlayerBreakdownRows(playerName) {
  try {
    return await loadAll(
      'player_gameweek_stats',
      BREAKDOWN_SELECT,
      { column: 'gameweek' },
      { column: 'player_name', value: playerName }
    )
  } catch {
    return []
  }
}

// On-demand JSON for one team + gameweek only (≤15 rows). The global boot query
// deliberately does not select `match_breakdown`; see the loading-fix plan.
async function fetchTeamBreakdownRows(teamName, gw) {
  const key = `${teamName}::${gw}`
  if (teamBreakdownCache.has(key)) return teamBreakdownCache.get(key)
  const promise = loadAll(
    'player_gameweek_stats',
    'player_name,match_breakdown',
    null,
    [
      { column: 'team_name', value: teamName },
      { column: 'gameweek', value: gw },
    ]
  )
    .catch(() => [])
    .then((rows) => {
      const byPlayer = new Map()
      rows.forEach((r) => {
        if (r?.player_name) byPlayer.set(r.player_name, r.match_breakdown ?? null)
      })
      return byPlayer
    })
  teamBreakdownCache.set(key, promise)
  return promise
}

/**
 * `gameweek_team_scores` is one physical table serving two screens. Load the
 * union of columns exactly once and derive both H2H scores and captaincy from
 * the same rows instead of issuing two overlapping queries.
 */
let teamScoresPromise = null

async function fetchTeamScores() {
  if (cache.teamScores) return cache.teamScores
  if (teamScoresPromise) return teamScoresPromise
  teamScoresPromise = loadAll(
    'gameweek_team_scores',
    'team_name,gameweek,total_points,stadium_bonus,captain_name,effective_captain_name',
    { column: 'gameweek' }
  )
    .then((rows) => {
      cache.teamScores = rows
      return rows
    })
    .finally(() => {
      teamScoresPromise = null
    })
  return teamScoresPromise
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
    fetchTeamScores(),
    loadAll('lineups', 'team_name,gameweek,player_name,is_captain,is_vice', {
      column: 'gameweek',
    }),
  ])
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

const DEAD_FIXTURE_STATUSES = new Set([
  'POSTPONED',
  'CANCELLED',
  'CANCELED',
  'ABANDONED',
  'AWARDED',
  'VOID',
  'SUSPENDED',
])

const kickoffTime = (fixture) => {
  const t = Date.parse(fixture?.kickoff ?? fixture?.match_date ?? '')
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t
}

/** Real-club opponent for a fantasy player in a given gameweek. */
const opponentLookup = (fixtures, gw) => {
  const list = fixtures.filter((f) => f.gw === gw)
  return (club) => {
    if (!club) return null
    const clubFixtures = list
      .filter((f) => isSameClub(club, f.homeName) || isSameClub(club, f.awayName))
      .slice()
      .sort((a, b) => kickoffTime(a) - kickoffTime(b) || String(a.id).localeCompare(String(b.id)))
    if (clubFixtures.length === 0) return null

    // Keep the legacy single-opponent shape (first fixture in kickoff order)
    // for callers that only need one; `fixtures` is the full chronological list.
    const f = clubFixtures[0]
    const isHome = isSameClub(club, f.homeName)
    return {
      name: isHome ? f.awayName : f.homeName,
      code: isHome ? f.away : f.home,
      venue: isHome ? 'home' : 'away',
      status: f.status,
      kickoff: f.kickoff,
      fixtureCount: clubFixtures.length,
      allScheduled: clubFixtures.every((x) => x.status === 'SCHEDULED'),
      hasLive: clubFixtures.some((x) => x.status === 'LIVE'),
      allFinished: clubFixtures.every((x) => x.status === 'FINISHED'),
      anyPostponed: clubFixtures.some((x) => x.status === 'POSTPONED'),
      anyDead: clubFixtures.some((x) => DEAD_FIXTURE_STATUSES.has(x.status)),
      fixtures: clubFixtures.map((x) => {
        const home = isSameClub(club, x.homeName)
        return {
          fixtureId: String(x.id),
          code: home ? x.away : x.home,
          venue: home ? 'home' : 'away',
          status: x.status,
          kickoff: x.kickoff,
          matchDate: x.kickoff,
          result: x.score ? { home: x.score[0], away: x.score[1] } : null,
        }
      }),
    }
  }
}

/**
 * §4.3 display points — a frontend-only transformation of the stored per-match
 * base points so DGW halves sum to `final_points`:
 *   (base + stadiumBonusAllocatedTo(match)) * multiplier
 * The stadium bonus is home-earned, so it goes on the first home match (and is
 * never split arbitrarily). `final_points` remains the authority.
 */
const withDisplayPoints = (matches, { multiplier, stadiumBonus } = {}) => {
  const mult = multiplier === 2 ? 2 : 1
  const bonus = Number(stadiumBonus) || 0
  const firstHome = matches.findIndex((m) => m.venue === 'home')
  return matches.map((m, i) => {
    const base = m.basePoints ?? m.totalPoints
    const available =
      Boolean(m.breakdownAvailable) &&
      base !== null &&
      base !== undefined &&
      Number.isFinite(Number(base)) &&
      Number(m.minutes) > 0
    if (!available) return { ...m, displayPoints: null }
    const allocated = i === firstHome ? bonus : 0
    return { ...m, displayPoints: (Number(base) + allocated) * mult }
  })
}

const buildFixtureMatches = (fixtureList, matchBreakdown, options) => {
  const raw = Array.isArray(matchBreakdown) ? matchBreakdown : []
  const byId = new Map(raw.map((m) => [String(m.fixtureId ?? m.fixture_id), m]))
  const merged = (fixtureList || []).map((f) => {
    const m = byId.get(String(f.fixtureId)) || null
    const base = m?.totalPoints ?? null
    return {
      fixtureId: String(f.fixtureId),
      code: f.code,
      venue: f.venue,
      status: f.status,
      kickoff: f.kickoff,
      minutes: m?.minutes ?? null,
      basePoints: base,
      breakdownAvailable:
        m !== null &&
        m?.breakdownAvailable !== false &&
        base !== null &&
        base !== undefined &&
        Number.isFinite(Number(base)),
    }
  })
  return withDisplayPoints(merged, options)
}

const toCard = (row, playersMap, seasonTotal, ctx, opponentOf, breakdownByPlayer) => {
  const meta = playersMap.get(row.player_name) || {}
  const club = meta.club || ''
  const role = row.role
  const isEffectiveStarter = Boolean(row.is_effective_starter)
  const displayState = displayStateOf(role)
  const points = row.final_points ?? 0
  const opponent = opponentOf(club)
  const matchBreakdown =
    breakdownByPlayer?.get(row.player_name) ?? row.match_breakdown ?? null
  const matches = buildFixtureMatches(opponent?.fixtures, matchBreakdown, {
    multiplier: row.multiplier,
    stadiumBonus: row.stadium_bonus,
  })

  return {
    name: row.player_name,
    short: shortName(row.player_name),
    pos: row.position,
    club,
    clubCode: broadcastCodeOf(club),
    points,
    finalPoints: row.final_points ?? null,
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
    opponent,
    matches,
    yetToPlay: Boolean(opponent?.allScheduled),
    allScheduled: Boolean(opponent?.allScheduled),
    allFinished: Boolean(opponent?.allFinished),
    hasLive: Boolean(opponent?.hasLive),
    anyDead: Boolean(opponent?.anyDead),
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
    matchBreakdown,
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
  const [rows, playersMap, fixtures, captaincy, breakdownByPlayer] = await Promise.all([
    fetchAllPlayerStats(),
    fetchPlayersMap(),
    fetchFixtures(),
    fetchCaptaincyMap(),
    fetchTeamBreakdownRows(teamName, gw),
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
    toCard(r, playersMap, seasonByPlayer.get(r.player_name) || 0, ctx, opponentOf, breakdownByPlayer)
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
  const [rows, playersMap, captaincy, fixtures, breakdownRows] = await Promise.all([
    fetchAllPlayerStats(),
    fetchPlayersMap(),
    fetchCaptaincyMap(),
    fetchFixtures(),
    fetchPlayerBreakdownRows(playerName),
  ])

  const heavyByGw = new Map(breakdownRows.map((r) => [r.gameweek, r]))

  const baseRow = rows.find(
    (r) => r.gameweek === gw && r.team_name === teamName && r.player_name === playerName
  )
  if (!baseRow) {
    throw new DataError(`No GW${gw} stats for ${playerName}`, { table: 'player_gameweek_stats' })
  }
  // The scalar select no longer carries the JSON columns; attach the on-demand
  // row so the ledger and DGW tabs behave exactly as before.
  const heavy = heavyByGw.get(gw)
  const row = heavy
    ? {
        ...baseRow,
        points_breakdown: heavy.points_breakdown ?? null,
        match_breakdown: heavy.match_breakdown ?? null,
      }
    : baseRow

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
  const clubFixtures = fixtures
    .filter(
      (f) => f.gw === gw && club && (isSameClub(club, f.homeName) || isSameClub(club, f.awayName))
    )
    .slice()
    .sort((a, b) => kickoffTime(a) - kickoffTime(b) || String(a.id).localeCompare(String(b.id)))
  const isDouble = clubFixtures.length === 2
  const yetToPlay =
    clubFixtures.length > 0 && clubFixtures.every((f) => f.status === 'SCHEDULED')

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

  const matches = withDisplayPoints(normalizeMatches(row, shells), {
    multiplier: mult,
    stadiumBonus: row.stadium_bonus,
  })

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
      isDouble: Array.isArray(heavyByGw.get(r.gameweek)?.match_breakdown)
        ? heavyByGw.get(r.gameweek).match_breakdown.length === 2
        : false,
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
    yetToPlay,
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
  const TERMINAL_STATUSES = new Set([
    'FINISHED', 'POSTPONED', 'CANCELLED', 'CANCELED',
    'ABANDONED', 'AWARDED', 'VOID', 'SUSPENDED',
  ])
  if (list.every((f) => TERMINAL_STATUSES.has(f.status))) return 'Final'
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
  const rows = await fetchTeamScores()
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

export function clearLiveCache(key) {
  if (key && key in cache) {
    cache[key] = null
    if (key === 'pstats') teamBreakdownCache.clear()
    return
  }
  cache.standings = null
  cache.players = null
  cache.teams = null
  cache.pstats = null
  cache.fixtures = null
  cache.gwScores = null
  cache.teamScores = null
  cache.lineups = null
  teamBreakdownCache.clear()
  resetProgress()
}

// ---------------------------------------------------------------------------
// Boot prefetch — Tier 1 (standings) gates the first paint; the rest warm up
// in the background or load on demand per screen.
//
// Previously every core dataset was awaited together, so the splash could not
// finish until the heaviest table (`player_gameweek_stats` for all gameweeks,
// including the JSON breakdown columns) had loaded. That is why a slow cold
// load used to fall through to the "League data unavailable" panel.
//
// Tier 1:  standings + crests — the only data /table cannot render without.
// Tier 2:  fixtures, H2H/cup team scores, players master — background.
// On demand: player_gameweek_stats (Squad/Stats/Player), breakdown JSON.
// ---------------------------------------------------------------------------
export const PREFETCH_STEPS = [
  { key: 'standings', label: 'League table', critical: true },
  { key: 'fixtures', label: 'Fixtures' },
  { key: 'scores', label: 'H2H & cup scores' },
  { key: 'players', label: 'Players' },
]

const reportProgress = (onProgress) =>
  onProgress?.({ done: [...progressState.done], failed: [...progressState.failed] })

const track = (key, promise, onProgress) =>
  promise.then(
    (value) => {
      if (!progressState.done.includes(key)) progressState.done.push(key)
      progressState.failed = progressState.failed.filter((k) => k !== key)
      reportProgress(onProgress)
      return value
    },
    (err) => {
      if (!progressState.failed.includes(key)) progressState.failed.push(key)
      progressState.done = progressState.done.filter((k) => k !== key)
      reportProgress(onProgress)
      throw err
    }
  )

let standingsPromise = null

/**
 * Tier 1 — the only data the hub cannot render without. Safe to call from the
 * access screen, the splash, or a retry: concurrent callers share one request.
 * @returns {Promise<{standings: object}>}
 */
export function prefetchStandings(onProgress) {
  if (cache.standings) {
    if (!progressState.done.includes('standings')) progressState.done.push('standings')
    reportProgress(onProgress)
    return Promise.resolve({ standings: cache.standings })
  }
  if (!standingsPromise) {
    standingsPromise = track('standings', fetchStandings(), onProgress)
      .then((standings) => ({ standings }))
      .catch((err) => {
        standingsPromise = null
        throw err
      })
  } else {
    reportProgress(onProgress)
  }
  return standingsPromise
}

let restPromise = null

/**
 * Tiers 2–3 — best-effort background warm-up. A failure here degrades one
 * screen (which owns its retry) and never blocks the hub.
 * @returns {Promise<{done: string[], failed: string[], errors: Record<string, string>}>}
 */
export function prefetchRest(onProgress) {
  if (restPromise) return restPromise
  const errors = {}
  const settle = (key, promise) =>
    track(key, promise, onProgress).catch((err) => {
      errors[key] = err?.message || 'Unknown error'
      return null
    })

  restPromise = Promise.all([
    settle('fixtures', fetchFixtures()),
    settle('scores', Promise.all([fetchH2HScores(), fetchCaptaincyMap()])),
    settle('players', fetchPlayersMap()),
  ]).then(() => ({
    done: [...progressState.done],
    failed: [...progressState.failed],
    errors,
  }))
  return restPromise
}

let prefetchPromise = null

/**
 * Full warm-up (Tier 1 then the background tiers). Used by refresh and retry
 * callers that want the whole set; the first paint must use
 * `prefetchStandings()` directly so it never waits on the heavy tiers.
 * @param {(progress: {done: string[], failed: string[]}) => void} [onProgress]
 * @returns {Promise<{standings: object, errors: Record<string, string>}>}
 */
export function prefetchAll(onProgress) {
  if (prefetchPromise) return prefetchPromise
  prefetchPromise = prefetchStandings(onProgress)
    .then(async ({ standings }) => {
      const rest = await prefetchRest(onProgress)
      return { standings, errors: rest.errors }
    })
    .catch((err) => {
      prefetchPromise = null
      throw err
    })
  return prefetchPromise
}

/**
 * Retry path — reuse every tier that already succeeded and re-run only the
 * failed ones. Deliberately does NOT clear the memo caches: completed fetches
 * resolve instantly, so pressing Try again is cheap. A deliberate refresh
 * (`revalidate`, header button) is what clears the cache.
 */
export function retryPrefetch(onProgress) {
  // Drop a Tier-1 promise that is still pending — after a timeout it may never
  // settle, and attaching a retry to it would hang the splash forever.
  standingsPromise = null
  restPromise = null
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
  restPromise = null
  standingsPromise = null
  return prefetchAll(onProgress)
}