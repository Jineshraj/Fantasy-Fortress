import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { PlayerPhoto } from './Imagery'
import { fetchPlayerDetail } from '@/data/live'
import { InlineError, LoadingBlock } from '@/components/ui/states'
import { useModalChrome } from '@/lib/modalChrome'
import { cn } from '@/lib/utils'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)

const rateOf = (points, count) => {
  if (!count) return 0
  return Math.round(num(points) / count)
}

const cardsText = (yellow, red) => {
  const parts = []
  if (yellow > 0) parts.push(`${yellow} yellow${yellow === 1 ? '' : 's'}`)
  if (red > 0) parts.push(`${red} red${red === 1 ? '' : 's'}`)
  return parts.join(', ') || '0'
}

const parseCards = (value) => {
  const m = /(\d+)\s*Y\s*(\d+)\s*R/i.exec(String(value ?? ''))
  return m ? { yellow: Number(m[1]), red: Number(m[2]) } : { yellow: 0, red: 0 }
}

/**
 * Filtered stat rows. A line appears only when it actually contributed: its
 * points are non-zero, or its count is non-zero. Appearance is the anchor and
 * always shows; a clean sheet only shows when it scored (so a MID/FWD never
 * gets a "0 +0" row). Values carry the rate where that makes the maths
 * checkable without memorising the scoring table.
 */
function buildStatRows(items, stats = {}) {
  if (!Array.isArray(items) || items.length === 0) return []
  const byKey = new Map(items.map((it) => [String(it.key ?? it.name ?? ''), it]))
  const rows = []

  const push = (key, label, value, points) => {
    rows.push({ key, label, value, points: num(points) })
  }

  const minutes = byKey.get('minutes')
  if (minutes) push('minutes', 'Appearance', minutes.value ?? '', minutes.points)

  const goals = num(byKey.get('goals')?.value)
  const goalPts = num(byKey.get('goals')?.points)
  if (goals > 0) {
    push('goals', 'Goals', `${goals} × ${rateOf(goalPts, goals)}`, goalPts)
  }

  const assists = num(byKey.get('assists')?.value)
  const assistPts = num(byKey.get('assists')?.points)
  if (assists > 0) {
    push('assists', 'Assists', `${assists} × ${rateOf(assistPts, assists)}`, assistPts)
  }

  const cleanSheet = byKey.get('clean_sheet')
  if (cleanSheet && num(cleanSheet.points) > 0) {
    push('clean_sheet', 'Clean sheet', 'Yes', cleanSheet.points)
  }

  const bonus = byKey.get('bonus')
  if (bonus && num(bonus.points) > 0) {
    const trigger =
      goals >= 3 ? `${goals} goals` : assists >= 3 ? `${assists} assists` : bonus.value || 'Hat-trick'
    push('bonus', 'Hat-trick bonus', trigger, bonus.points)
  }

  const cards = byKey.get('cards')
  if (cards) {
    const counts = Number.isFinite(Number(stats.yellowCards))
      ? { yellow: num(stats.yellowCards), red: num(stats.redCards) }
      : parseCards(cards.value)
    if (counts.yellow > 0 || counts.red > 0 || num(cards.points) !== 0) {
      push('cards', 'Cards', cardsText(counts.yellow, counts.red), cards.points)
    }
  }

  const ownGoals = byKey.get('own_goals')
  if (ownGoals && num(ownGoals.value) > 0) {
    push('own_goals', 'Own goals', ownGoals.value, ownGoals.points)
  }

  const penaltySave = byKey.get('penalty_save')
  if (penaltySave && num(penaltySave.value) > 0) {
    push('penalty_save', 'Penalty save', penaltySave.value, penaltySave.points)
  }

  const penaltyMiss = byKey.get('penalty_miss')
  if (penaltyMiss && num(penaltyMiss.value) > 0) {
    push('penalty_miss', 'Penalty miss', penaltyMiss.value, penaltyMiss.points)
  }

  return rows
}

/**
 * Itemized breakdown for a player or match. Uses server `pointsBreakdown` if available,
 * otherwise derives the exact breakdown from the player's recorded match stats.
 * If the derived sum matches the authoritative base points, the breakdown is 100% verified.
 */
function deriveBreakdown(detail) {
  if (!detail) return { items: [], available: false }
  const bd = detail.pointsBreakdown
  if (bd?.available && Array.isArray(bd.items) && bd.items.length > 0) {
    return { items: bd.items, available: true }
  }

  const pos = String(detail.position || detail.pos || 'MID').toUpperCase()
  const isGK = pos === 'GKP' || pos === 'GK' || pos === 'G'
  const isDEF = pos === 'DEF' || pos === 'D'
  const isMID = pos === 'MID' || pos === 'M'

  const minutes = num(detail.minutes)
  const goals = num(detail.goals)
  const assists = num(detail.assists)
  const cleanSheet = Boolean(detail.cleanSheet || detail.clean_sheet)
  const yellow = num(detail.yellowCards || detail.yellow_cards)
  const red = num(detail.redCards || detail.red_cards)
  const ownGoals = num(detail.ownGoals || detail.own_goals)
  const penSave = num(detail.penaltySave || detail.penalty_save)
  const penMiss = num(detail.penaltyMiss || detail.penalty_miss)

  const minutesPts = minutes >= 60 ? 2 : minutes >= 1 ? 1 : 0
  const goalRate = isGK ? 10 : isDEF ? 6 : isMID ? 5 : 4
  const goalsPts = goals * goalRate
  const assistRate = isGK ? 5 : 3
  const assistsPts = assists * assistRate
  const cleanSheetPts = cleanSheet && minutes >= 60 ? (isGK ? 5 : isDEF ? 4 : 0) : 0
  const penSavePts = penSave * 5
  const penMissPts = -penMiss * 3
  const cardsPts = red >= 1 ? -red * 3 : -yellow * 1
  const ownGoalsPts = -ownGoals * 2
  const bonusPts = goals >= 3 || assists >= 3 ? 3 : 0

  const items = [
    { key: 'minutes', label: 'Minutes', value: `${minutes}'`, points: minutesPts },
    { key: 'goals', label: 'Goals', value: goals, points: goalsPts },
    { key: 'assists', label: 'Assists', value: assists, points: assistsPts },
    { key: 'clean_sheet', label: 'Clean sheet', value: cleanSheet ? 'Yes' : 'No', points: cleanSheetPts },
    { key: 'bonus', label: 'Hat-trick bonus', value: bonusPts ? 'Hat-trick' : '—', points: bonusPts },
    { key: 'cards', label: 'Cards', value: `${yellow}Y ${red}R`, points: cardsPts },
    { key: 'own_goals', label: 'Own goals', value: ownGoals, points: ownGoalsPts },
    { key: 'penalty_save', label: 'Penalty save', value: penSave, points: penSavePts },
    { key: 'penalty_miss', label: 'Penalty miss', value: penMiss, points: penMissPts },
  ]

  const calculatedBase = items.reduce((sum, it) => sum + it.points, 0)
  const rawBase =
    detail.basePoints !== null && detail.basePoints !== undefined
      ? detail.basePoints
      : detail.gameweek?.totalPoints ?? detail.totalPoints
  const base = num(rawBase)

  if (calculatedBase === base) {
    return { items, available: true }
  }

  return { items: [], available: false }
}

/**
 * Ledger rows: only the stat lines that happened, then the Base points
 * subtotal (only when modifiers like bonus or multiplier exist), the stadium bonus,
 * the captain formula (only when ×2), and the authoritative total.
 */
function buildLedger(detail) {
  const breakdown = deriveBreakdown(detail)
  const rows = []
  const available = breakdown.available
  const bonus = num(detail.stadiumBonus)
  const multiplier = Number(detail.multiplier) === 2 ? 2 : 1
  const rawBase = detail.basePoints
  const base =
    rawBase === null || rawBase === undefined || rawBase === '' || !Number.isFinite(Number(rawBase))
      ? null
      : Number(rawBase)
  const total = detail.gameweek?.totalPoints ?? null

  if (available) {
    rows.push(
      ...buildStatRows(breakdown.items, {
        goals: detail.goals,
        assists: detail.assists,
        yellowCards: detail.yellowCards,
        redCards: detail.redCards,
      })
    )
    // Only show a Base points subtotal row if there is a stadium bonus or multiplier
    // that modifies the score. When there are no modifiers, stats sum directly into Total.
    if ((bonus !== 0 || multiplier === 2) && base !== null) {
      rows.push({ key: 'base', label: 'Base points', value: '', points: base })
    }
  } else {
    rows.push({
      key: 'base',
      label: 'Base points',
      value: detail.minutes ? `${detail.minutes}'` : '',
      points: base,
      pending: true,
    })
  }

  if (detail.displayState === 'AUTO_SUB_OUT') {
    rows.push({
      key: 'sub-out-note',
      label: 'Auto-subbed out (points transferred to bench)',
      note: true,
    })
    rows.push({ key: 'total', label: 'Total', points: total, total: true })
    return { rows, pending: !available }
  }

  if (bonus !== 0) {
    rows.push({ key: 'stadium_bonus', label: 'Stadium bonus', value: '', points: bonus })
  }

  if (multiplier === 2) {
    const formula =
      base === null
        ? '×2'
        : bonus !== 0
          ? `(${base} ${bonus > 0 ? '+' : '−'} ${Math.abs(bonus)}) × 2`
          : `${base} × 2`
    rows.push({
      key: 'captain',
      label: detail.captaincy?.handedOver ? 'Captain (VC) ×2' : 'Captain ×2',
      value: formula,
      formula: true,
    })
  }

  rows.push({ key: 'total', label: 'Total', points: total, total: true })
  return { rows, pending: !available }
}

const formatKickoff = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw || raw.toUpperCase() === 'TBD') return ''
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw)
  const date = new Date(dateOnly ? `${raw}T00:00:00` : raw)
  if (Number.isNaN(date.getTime())) return raw
  const options = dateOnly
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat('en-GB', options).format(date)
}

const hasScore = (result) => {
  const home = result?.home
  const away = result?.away
  return (
    home !== null &&
    home !== undefined &&
    home !== '' &&
    Number.isFinite(Number(home)) &&
    away !== null &&
    away !== undefined &&
    away !== '' &&
    Number.isFinite(Number(away))
  )
}

const fixtureLine = (match) => {
  const venue = match?.venue === 'home' ? 'Home vs' : match?.venue === 'away' ? 'Away at' : 'vs'
  const opponent = match?.opponent?.name || match?.opponent?.code || '—'
  const status = String(match?.result?.status || '').toUpperCase()
  const score = hasScore(match?.result) ? `${match.result.home}–${match.result.away}` : ''

  let meta = ''
  if (status === 'LIVE' || status === 'INPLAY' || status === 'IN_PLAY') {
    meta = score ? `LIVE ${score}` : 'LIVE'
  } else if (status === 'FINISHED' || status === 'FT') {
    meta = score ? `FT ${score}` : 'FT'
  } else if (status === 'POSTPONED') {
    meta = 'PPD'
  } else if (status === 'CANCELLED' || status === 'CANCELED') {
    meta = 'Cancelled'
  } else if (status === 'ABANDONED') {
    meta = 'Abandoned'
  } else if (status === 'SUSPENDED') {
    meta = 'Suspended'
  } else if (status === 'AWARDED') {
    meta = 'Awarded'
  } else {
    meta = formatKickoff(match?.kickoff)
  }

  return { main: `${venue} ${opponent}`, meta }
}

function LedgerRow({ row }) {
  return (
    <div
      className={cn(
        'points-ledger-row',
        row.points < 0 && 'is-negative',
        row.total && 'is-total',
        row.note && 'is-note'
      )}
    >
      <span className="ledger-label">{row.label}</span>
      {!row.note && (
        <>
          <span className="ledger-value">{row.value || ''}</span>
          <b className="ledger-points">
            {row.formula
              ? ''
              : row.points === null || row.points === undefined
                ? '—'
                : row.total
                  ? row.points
                  : signed(row.points)}
          </b>
        </>
      )}
    </div>
  )
}

export function PlayerModal({ item, onClose, gw }) {
  const dialogRef = useRef(null)
  const openerRef = useRef(null)

  const week = gw ?? item?.gameweek
  const teamName = item?.teamName

  const [state, setState] = useState({ status: 'loading', detail: null, error: null })
  const [tab, setTab] = useState(0)

  const load = useCallback(async () => {
    if (!item?.name || !teamName || !week) {
      setState({ status: 'ready', detail: null, error: null })
      return
    }
    setState((s) => ({ ...s, status: 'loading', error: null }))
    try {
      const detail = await fetchPlayerDetail(item.name, teamName, week)
      setState({ status: 'ready', detail, error: null })
    } catch (error) {
      setState({ status: 'error', detail: null, error })
    }
  }, [item?.name, teamName, week])

  useEffect(() => {
    setTab(0)
    load()
  }, [load])

  // Focus trap + focus restoration. Unchanged behaviour from the original
  // modal: Escape closes, backdrop closes, Tab stays inside, focus returns to
  // the card that opened it.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // Back / X / Escape / backdrop all close the sheet and leave the page's
  // scroll position untouched.
  const close = useModalChrome(onClose)
  onCloseRef.current = close

  useEffect(() => {
    openerRef.current = document.activeElement
    const dialog = dialogRef.current
    dialog?.querySelector(FOCUSABLE)?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const nodes = [...dialog.querySelectorAll(FOCUSABLE)].filter(
        (n) => n.offsetWidth > 0 || n.offsetHeight > 0
      )
      if (nodes.length === 0) return
      const edge = event.shiftKey ? nodes[0] : nodes[nodes.length - 1]
      if (document.activeElement === edge) {
        event.preventDefault()
        ;(event.shiftKey ? nodes[nodes.length - 1] : nodes[0]).focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      openerRef.current?.focus?.()
    }
  }, [])

  const detail = state.detail
  const ccy = detail?.captaincy ?? item?.captaincy
  const ledger = useMemo(() => (detail ? buildLedger(detail) : { rows: [], pending: false }), [detail])

  const matches = detail?.gameweek?.matches ?? []
  const dgw = Boolean(detail) && (detail.gameweek.isDouble || matches.length === 2)
  const activeMatch = matches[Math.min(tab, Math.max(0, matches.length - 1))]
  const matchRows = useMemo(() => {
    if (!activeMatch) return null
    let items = activeMatch.breakdown
    if (!Array.isArray(items) || items.length === 0) {
      const derived = deriveBreakdown({
        ...activeMatch,
        position: detail?.position || item?.pos,
      })
      if (derived.available) items = derived.items
    }
    if (!Array.isArray(items) || items.length === 0) return null
    return buildStatRows(items, {
      goals: activeMatch.goals,
      assists: activeMatch.assists,
      yellowCards: activeMatch.yellowCards,
      redCards: activeMatch.redCards,
    })
  }, [activeMatch, detail?.position, item?.pos])
  const fixtureMatches = matches.filter(
    (m) => m.opponent?.name && m.opponent.name !== '—'
  )
  const missing = state.status === 'error' || (!detail && state.status !== 'loading')

  const club = detail?.club ?? item?.club ?? ''
  const position = detail?.position ?? item?.pos ?? '—'
  const displayState = detail?.displayState ?? item?.displayState
  const subState =
    displayState === 'AUTO_SUB_OUT'
      ? { label: 'OUT', className: 'badge-auto-out' }
      : displayState === 'AUTO_SUB_IN'
        ? { label: 'IN', className: 'badge-auto-in' }
        : displayState === 'BENCH_UNUSED'
          ? { label: 'UNUSED', className: 'badge-neutral' }
          : null
  const total = detail?.gameweek?.totalPoints ?? item?.points ?? null
  const yetToPlay = Boolean(detail?.yetToPlay ?? item?.yetToPlay)

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-modal-title"
        className="player-modal"
      >
        <button
          type="button"
          className="modal-close"
          onClick={close}
          aria-label="Close player details"
        >
          <X />
        </button>

        <div className="modal-hero">
          <PlayerPhoto player={detail ?? item} className="modal-photo-wrap" />
          <div>
            <span className="position-tag">
              {club || '—'} · {position}
              {ccy?.designation === 'C' && (
                <b className={cn('player-state-badge', ccy.handedOver ? 'badge-captain-handover' : 'badge-captain')}>
                  C
                </b>
              )}
              {ccy?.designation === 'VC' && <b className="player-state-badge badge-vice">VC</b>}
              {subState && (
                <b className={cn('player-state-badge', subState.className)}>{subState.label}</b>
              )}
            </span>
            <h2 id="player-modal-title">{detail?.name ?? item?.name}</h2>
            <div className="modal-hero-totals">
              <span className="modal-stat-pill">
                GW {week} · <b className="numeric">{total ?? '—'} pts</b>
              </span>
              {detail &&
                detail.season !== null &&
                detail.season !== undefined &&
                detail.season !== '' &&
                Number.isFinite(Number(detail.season)) && (
                  <span className="modal-stat-pill is-season">
                    Season · <b className="numeric">{detail.season} pts</b>
                  </span>
                )}
            </div>
            {yetToPlay && <p className="modal-note">Yet to play</p>}
          </div>
        </div>

        {state.status === 'loading' && <LoadingBlock label="Loading player detail" />}

        {state.status === 'error' && (
          <InlineError
            message={state.error?.message || 'Player detail unavailable'}
            onRetry={load}
          />
        )}

        {!missing && state.status !== 'loading' && detail && (
          <>
            {fixtureMatches.length > 0 && (
              <div className="modal-fixtures">
                {fixtureMatches.map((m, i) => {
                  const line = fixtureLine(m)
                  return (
                    <p className="modal-fixture-line" key={`${m.fixtureId || 'fixture'}-${i}`}>
                      {dgw && <span className="modal-fixture-match">Match {i + 1}</span>}
                      <span className="modal-fixture-main">{line.main}</span>
                      {line.meta && <span className="modal-fixture-meta">{line.meta}</span>}
                    </p>
                  )
                })}
              </div>
            )}

            {!yetToPlay && (
              <section aria-labelledby="ledger-heading">
                <h3 id="ledger-heading" className="modal-section-title">
                  Points ledger
                </h3>
                <div className="points-ledger">
                  {ledger.rows.map((r) => (
                    <LedgerRow key={r.key} row={r} />
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="form-heading">
              <h3 id="form-heading" className="modal-section-title">
                Last 5
              </h3>
              <div className="form-timeline">
                {detail.form.length === 0 && <span className="modal-note">Not available</span>}
                {detail.form.map((f) => (
                  <span
                    key={f.gameweek}
                    className={cn(
                      'form-chip',
                      f.points > 0 ? 'is-pos' : f.points === 0 ? 'is-zero' : 'is-neg'
                    )}
                  >
                    <b className="form-gw">
                      GW{f.gameweek}
                      {f.isDouble && <em> DGW</em>}
                    </b>
                    <strong className="numeric">
                      {f.points} {f.points === 1 ? 'pt' : 'pts'}
                    </strong>
                  </span>
                ))}
              </div>
            </section>

            {dgw && (
              <section aria-labelledby="dgw-heading">
                <h3 id="dgw-heading" className="modal-section-title">
                  Double gameweek
                </h3>

                <div className="player-modal-tabs" role="tablist" aria-label="Fixtures">
                  {matches.map((m, i) => (
                    <button
                      key={m.fixtureId}
                      type="button"
                      role="tab"
                      id={`dgw-tab-${i}`}
                      aria-selected={i === tab}
                      aria-controls="dgw-panel"
                      className={cn('player-modal-tab', i === tab && 'active')}
                      onClick={() => setTab(i)}
                    >
                      Match {i + 1}
                      <span className="tab-opponent">
                        vs {m.opponent?.code || '—'}
                      </span>
                    </button>
                  ))}
                </div>

                <div
                  id="dgw-panel"
                  role="tabpanel"
                  aria-labelledby={`dgw-tab-${tab}`}
                  className="dgw-match-card active"
                >
                  {activeMatch ? (
                    <>
                      <div className="dgw-match-head">
                        <span>
                          {activeMatch.venue === 'home' ? 'Home' : 'Away'} vs{' '}
                          {activeMatch.opponent?.name || '—'}
                        </span>
                        <b className="numeric">
                          {hasScore(activeMatch.result)
                            ? `${activeMatch.result.home}–${activeMatch.result.away}`
                            : activeMatch.result?.status || '—'}
                        </b>
                      </div>

                      {matchRows ? (
                        <div className="points-ledger">
                          {matchRows.map((r) => (
                            <LedgerRow key={r.key} row={r} />
                          ))}
                          <div className="points-ledger-row is-total">
                            <span className="ledger-label">Match points</span>
                            <span className="ledger-value" />
                            <b className="ledger-points">
                              {activeMatch.displayPoints ?? '—'}
                            </b>
                          </div>
                        </div>
                      ) : (
                        <p className="modal-note">Match breakdown pending</p>
                      )}

                      {matchRows &&
                        (Number(detail.multiplier) === 2 || Number(detail.stadiumBonus) !== 0) && (
                          <p className="modal-note">
                            Includes stadium bonus and captain multiplier.
                          </p>
                        )}
                    </>
                  ) : (
                    <p className="modal-note">Not available</p>
                  )}
                </div>

                <div className="dgw-cumulative">
                  <span>GW {week} cumulative</span>
                  <b className="numeric">
                    {detail.gameweek.totalPoints ?? '—'}
                    {detail.gameweek.totalPoints !== null ? ' pts' : ''}
                  </b>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
