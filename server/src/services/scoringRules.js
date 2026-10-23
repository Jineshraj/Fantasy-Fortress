// ---------------------------------------------------------------------------
// Fantasy scoring rules — single source of truth.
//
// Every displayed points figure must be traceable back to the scoring engine
// (uiux-improvements.md §3.1). The engine needs both a TOTAL
// (`calculatePlayerPoints`, used by the dashboard and drift checker) and an
// ITEMIZED LEDGER (`buildPointsBreakdownItems`, persisted as
// `player_gameweek_stats.points_breakdown`). They are derived from one rule
// table so the two can never drift apart: the total is literally the sum of
// the items.
// ---------------------------------------------------------------------------

const num = (v) => Number(v || 0)

// Matches the historical parser exactly: `clean_sheet === true` or the literal
// string 'TRUE'. Anything else is false.
const isTrue = (v) => v === true || String(v || '').trim().toUpperCase() === 'TRUE'

const readBool = (stats, ...keys) => {
  for (const k of keys) {
    if (stats[k] !== undefined && stats[k] !== null) return isTrue(stats[k])
  }
  return false
}

const readNum = (stats, ...keys) => {
  for (const k of keys) {
    if (stats[k] !== undefined && stats[k] !== null) return num(stats[k])
  }
  return 0
}

/**
 * Itemized ledger for one player in one gameweek.
 *
 * Accepts both the staging column names (`clean_sheet`, `pen_miss`, `pen_save`)
 * and the scoring-engine detail names (`isCS`, `penMiss`, `penSave`).
 *
 * @param {object} stats  minutes/goals/assists/clean-sheet/card/penalty counts
 * @param {string} fantasyPos  GKP | GK | DEF | MID | FWD
 * @returns {Array<{key: string, label: string, value: string|number, points: number}>}
 */
export function buildPointsBreakdownItems(stats = {}, fantasyPos = 'MID') {
  const pos = String(fantasyPos || 'MID').toUpperCase()
  // Fantasy codes (GKP/DEF/MID/FWD) plus the provider short codes (G/D/M) that
  // calculateApiFootballFantasyPoints already accepts.
  const isGK = pos === 'GKP' || pos === 'GK' || pos === 'G'
  const isDEF = pos === 'DEF' || pos === 'D'
  const isMID = pos === 'MID' || pos === 'M'

  const minutes = readNum(stats, 'minutes')
  const goals = readNum(stats, 'goals')
  const assists = readNum(stats, 'assists')
  const cleanSheet = readBool(stats, 'clean_sheet', 'isCS')
  const penSave = readNum(stats, 'pen_save', 'penSave')
  const penMiss = readNum(stats, 'pen_miss', 'penMiss')
  const yellow = readNum(stats, 'yellow')
  const red = readNum(stats, 'red')
  const ownGoals = readNum(stats, 'own_goals', 'ownGoals')

  // 1. Minutes played
  const minutesPts = minutes >= 60 ? 2 : minutes >= 1 ? 1 : 0

  // 2. Goals by position
  const goalRate = isGK ? 10 : isDEF ? 6 : isMID ? 5 : 4
  const goalsPts = goals * goalRate

  // 3. Assists
  const assistRate = isGK ? 5 : 3
  const assistsPts = assists * assistRate

  // 4. Clean sheet (60+ minutes on the pitch)
  const cleanSheetPts = cleanSheet && minutes >= 60 ? (isGK ? 5 : isDEF ? 4 : 0) : 0

  // 5. Penalties
  const penaltySavePts = penSave * 5
  const penaltyMissPts = -penMiss * 3

  // 6. Cards & own goals
  const cardsPts = -yellow * 1 - red * 3
  const ownGoalsPts = -ownGoals * 2

  // 7. Hat-trick bonus
  const bonusPts = goals >= 3 || assists >= 3 ? 3 : 0

  return [
    { key: 'minutes', label: 'Minutes', value: `${minutes}'`, points: minutesPts },
    { key: 'goals', label: 'Goals', value: goals, points: goalsPts },
    { key: 'assists', label: 'Assists', value: assists, points: assistsPts },
    { key: 'clean_sheet', label: 'Clean sheet', value: cleanSheet ? 1 : 0, points: cleanSheetPts },
    { key: 'bonus', label: 'Bonus', value: bonusPts ? 'Hat-trick' : '—', points: bonusPts },
    {
      key: 'cards',
      label: 'Cards',
      value: `${yellow}Y ${red}R`,
      points: cardsPts,
    },
    { key: 'own_goals', label: 'Own goals', value: ownGoals, points: ownGoalsPts },
    { key: 'penalty_save', label: 'Penalty save', value: penSave, points: penaltySavePts },
    { key: 'penalty_miss', label: 'Penalty miss', value: penMiss, points: penaltyMissPts },
  ]
}

/**
 * The player's base fantasy points before stadium bonus and captain multiplier.
 * @param {object} stats
 * @param {string} fantasyPos
 * @returns {number}
 */
export function calculatePlayerPoints(stats, fantasyPos = 'MID') {
  return buildPointsBreakdownItems(stats, fantasyPos).reduce((sum, item) => sum + item.points, 0)
}

/**
 * Publish the ledger only when it reconciles exactly with the approved base
 * total. A ledger that does not add up is worse than no ledger: the caller
 * falls back to `Base points (server)` + `Breakdown pending` instead of
 * showing a fabricated explanation.
 *
 * @param {object} stats
 * @param {string} fantasyPos
 * @param {number} basePts  the authoritative `base_points` value
 * @returns {{available: boolean, items: Array<{key: string, label: string, value: string|number, points: number}>}}
 */
export function buildPointsBreakdown(stats, fantasyPos, basePts) {
  const items = buildPointsBreakdownItems(stats, fantasyPos)
  const sum = items.reduce((total, item) => total + item.points, 0)
  const available = Number.isFinite(Number(basePts)) && sum === Number(basePts)
  return { available, items: available ? items : [] }
}

/**
 * Per-fixture split persisted as `player_gameweek_stats.match_breakdown`.
 *
 * The rows come from staging, which is genuinely one row per (player, match),
 * so a Double Gameweek can be displayed fixture-by-fixture without ever
 * dividing the aggregate. Returns `null` when no per-fixture source rows
 * exist — the client then keeps its `Match breakdown pending` state instead of
 * inventing a split.
 *
 * @param {object} detail  the engine's chosen stats detail (carries `matches`)
 * @param {object} opts
 * @param {string} opts.position  fantasy position used for the per-fixture ledger
 * @param {number} opts.gameweek
 * @returns {Array<object>|null}
 */
export function buildMatchBreakdown(detail, { position = 'MID', gameweek } = {}) {
  const recs = Array.isArray(detail?.matches) ? detail.matches : []
  const out = []
  for (const rec of recs) {
    if (!rec || !rec.fixtureId) continue
    const stats = {
      minutes: rec.minutes,
      goals: rec.goals,
      assists: rec.assists,
      clean_sheet: rec.isCS,
      pen_save: rec.penSave,
      pen_miss: rec.penMiss,
      yellow: rec.yellow,
      red: rec.red,
      own_goals: rec.ownGoals,
    }
    const ledger = buildPointsBreakdown(stats, position, rec.pts)
    const pts = Number.isFinite(Number(rec.pts)) ? Number(rec.pts) : null
    out.push({
      fixtureId: String(rec.fixtureId),
      gameweek: Number.isFinite(Number(gameweek)) ? Number(gameweek) : null,
      venue: rec.venue === 'home' || rec.venue === 'away' ? rec.venue : null,
      // No broadcast code here — that map lives in the browser. The client
      // falls back to the fixture row it already loaded for the same id.
      opponent: { name: rec.opponentName || null, code: null },
      result: {
        home: rec.homeScore ?? null,
        away: rec.awayScore ?? null,
        status: rec.status || 'UNKNOWN',
      },
      minutes: num(rec.minutes),
      goals: num(rec.goals),
      assists: num(rec.assists),
      cleanSheet: rec.isCS === true,
      yellowCards: num(rec.yellow),
      redCards: num(rec.red),
      ownGoals: num(rec.ownGoals),
      penaltySave: num(rec.penSave),
      penaltyMiss: num(rec.penMiss),
      // Stadium bonus is a team-level award and the captain multiplier applies
      // to the gameweek total, not to an individual fixture. Both stay out of
      // the per-fixture figure so the two never disagree with `final_points`.
      stadiumBonus: 0,
      multiplier: 1,
      basePoints: ledger.available ? pts : null,
      totalPoints: ledger.available ? pts : null,
      breakdown: ledger.items,
      breakdownAvailable: ledger.available,
    })
  }
  return out.length > 0 ? out : null
}
