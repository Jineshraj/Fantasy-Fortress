import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { PlayerPhoto } from './Imagery'
import { fetchPlayerDetail } from '@/data/live'
import { InlineError, LoadingBlock } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Display order from uiux-improvements.md §3.1 — Minutes … Total.
const LABELS = {
  minutes: 'Minutes',
  goals: 'Goals',
  assists: 'Assists',
  clean_sheet: 'Clean sheet',
  cleanSheet: 'Clean sheet',
  bonus: 'Bonus',
  cards: 'Cards',
  own_goals: 'Own goals',
  ownGoals: 'Own goals',
  penalty_save: 'Penalty save',
  penaltySave: 'Penalty save',
  penalty_miss: 'Penalty miss',
  penaltyMiss: 'Penalty miss',
  yellow_cards: 'Cards',
  red_cards: 'Cards',
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

/**
 * Ledger rows. The server's itemized `points_breakdown` wins outright; until it
 * exists the card degrades to `Base points (server)` plus a pending note
 * instead of inventing a `Bonus` line. The displayed total is always
 * `final_points` read from the row — never a sum of the rows above it.
 */
function buildLedger(detail) {
  const bd = detail.pointsBreakdown
  const rows = []

  if (bd?.available && bd.items.length > 0) {
    bd.items.forEach((it, i) => {
      const key = String(it.key ?? it.name ?? i)
      rows.push({
        key,
        label: LABELS[key] ?? it.label ?? key,
        value: it.value ?? '',
        points: Number(it.points ?? 0),
      })
    })
  } else {
    rows.push({
      key: 'base',
      label: 'Base points (server)',
      value: detail.minutes ? `${detail.minutes}'` : '',
      points: detail.basePoints,
      pending: true,
    })
  }

  rows.push({
    key: 'stadium_bonus',
    label: 'Stadium bonus',
    value: '',
    points: detail.stadiumBonus,
  })
  rows.push({
    key: 'multiplier',
    label: 'Multiplier',
    value: '',
    points: detail.multiplier === 2 ? 2 : 1,
    multiplier: true,
  })
  rows.push({
    key: 'total',
    label: 'Total',
    value: '',
    points: detail.gameweek.totalPoints,
    total: true,
  })

  return rows
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
  useEffect(() => {
    openerRef.current = document.activeElement
    const dialog = dialogRef.current
    dialog?.querySelector(FOCUSABLE)?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
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
  }, [onClose])

  const detail = state.detail
  const ccy = detail?.captaincy ?? item?.captaincy
  const rows = useMemo(() => (detail ? buildLedger(detail) : []), [detail])

  const matches = detail?.gameweek?.matches ?? []
  const dgw = Boolean(detail) && (detail.gameweek.isDouble || matches.length === 2)
  const activeMatch = matches[Math.min(tab, Math.max(0, matches.length - 1))]
  const missing = state.status === 'error' || (!detail && state.status !== 'loading')

  const club = detail?.club ?? item?.club ?? ''
  const position = detail?.position ?? item?.pos ?? '—'
  const total = detail?.gameweek?.totalPoints ?? item?.points ?? null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
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
          onClick={onClose}
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
            </span>
            <h2 id="player-modal-title">{detail?.name ?? item?.name}</h2>
            <p className="modal-total">
              GW {week} total
              <b className="numeric">{total ?? '—'}</b>
            </p>
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
            <section aria-labelledby="ledger-heading">
              <h3 id="ledger-heading" className="modal-section-title">
                Points ledger
              </h3>
              <div className="points-ledger">
                {rows.map((r) => (
                  <div
                    key={r.key}
                    className={cn(
                      'points-ledger-row',
                      r.points < 0 && 'is-negative',
                      r.total && 'is-total'
                    )}
                  >
                    <span className="ledger-label">{r.label}</span>
                    <span className="ledger-value">{r.value || ''}</span>
                    <b className="ledger-points">
                      {r.multiplier
                        ? `${detail.multiplier}x`
                        : r.points === null || r.points === undefined
                          ? '—'
                          : r.total
                            ? r.points
                            : signed(r.points)}
                    </b>
                  </div>
                ))}
              </div>
              {rows.every((r) => r.pending) && (
                <p className="modal-note">Breakdown pending</p>
              )}
            </section>

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
                          {activeMatch.result?.home !== null &&
                          activeMatch.result?.home !== undefined &&
                          activeMatch.result?.away !== null &&
                          activeMatch.result?.away !== undefined
                            ? `${activeMatch.result.home}–${activeMatch.result.away}`
                            : activeMatch.result?.status || '—'}
                        </b>
                      </div>

                      {activeMatch.breakdownAvailable ? (
                        <div className="dgw-stats">
                          <span>
                            Minutes <b className="numeric">{activeMatch.minutes ?? '—'}'</b>
                          </span>
                          <span>
                            Goals <b className="numeric">{activeMatch.goals ?? 0}</b>
                          </span>
                          <span>
                            Assists <b className="numeric">{activeMatch.assists ?? 0}</b>
                          </span>
                          <span>
                            Fixture total{' '}
                            <b className="numeric">
                              {activeMatch.totalPoints ?? '—'}
                            </b>
                          </span>
                        </div>
                      ) : (
                        <p className="modal-note">Match breakdown pending</p>
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
