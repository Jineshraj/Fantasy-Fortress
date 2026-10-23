import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight, List, TriangleAlert, Users } from 'lucide-react'
import { fetchGameweekStatus, fetchTeamSquad } from '@/data/live'
import { PlayerCard } from './PlayerCard'
import { PlayerModal } from './PlayerModal'
import { PlayerPhoto } from './Imagery'
import { TeamMark } from './TeamMark'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

const LINE_POSITIONS = ['GKP', 'DEF', 'MID', 'FWD']
const normPos = (pos) => (pos === 'GK' ? 'GKP' : pos)

export function TeamView({ team, gw, latestGw, onGwChange }) {
  const [view, setView] = useState('pitch')
  const [selected, setSelected] = useState(null)
  const [state, setState] = useState({ status: 'loading', squad: null, error: null })
  const [statusText, setStatusText] = useState(null)

  const load = useCallback(() => {
    if (!team?.name) return
    setState({ status: 'loading', squad: null, error: null })
    fetchTeamSquad(team.name, gw)
      .then((squad) =>
        setState(
          squad.starters.length === 0
            ? { status: 'empty', squad: null, error: null }
            : { status: 'ready', squad, error: null }
        )
      )
      .catch((err) => setState({ status: 'error', squad: null, error: err?.message }))
  }, [team?.name, gw])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let alive = true
    fetchGameweekStatus(gw)
      .then((text) => alive && setStatusText(text))
      .catch(() => alive && setStatusText(null))
    return () => {
      alive = false
    }
  }, [gw])

  // The original submitted XI. AUTO_SUB_OUT rows stay on the pitch — the
  // tactical intent must remain visible even when a starter was replaced.
  const starters = state.squad?.starters ?? []
  const bench = state.squad?.bench ?? []
  const totals = state.squad?.totals ?? null
  const gwPoints = totals?.gw ?? null
  const seasonTotal = team?.total ?? totals?.season ?? 0

  const pitchLines = useMemo(
    () =>
      LINE_POSITIONS.map((pos) => ({
        pos,
        players: starters.filter((p) => normPos(p.pos) === pos),
      })).filter((line) => line.players.length > 0),
    [starters]
  )

  return (
    <section className="page-section team-page">
      {/* Breadcrumb row: Back to table */}
      <div className="team-breadcrumb-row">
        <Link to={`${ROUTES.table}${gw ? `?gw=${gw}` : ''}`} className="back-link">
          <ArrowLeft /> Back to table
        </Link>
      </div>

      {/* Hero row: Crest + Name / Manager */}
      <header className="team-hero">
        <div className="team-hero-identity">
          <div className="team-crest-wrap">
            <TeamMark name={team?.name} size={48} />
          </div>
          <div className="team-hero-copy">
            <h1 title={team?.name || undefined}>{team?.name || 'Team'}</h1>
            {team?.manager && <p className="team-hero-sub">{team.manager}</p>}
          </div>
        </div>
      </header>

      {/* 3-Pillar Unified Scoreboard: Previous GW | Current GW with Stepper | Season Total & Rank */}
      {state.status === 'ready' && totals && (
        <section className="team-three-pillar-card" aria-label={`Gameweek ${gw} score overview`}>
          {/* Left Pillar: Previous Gameweek */}
          <div
            className={cn('pillar-col is-prev', totals.prevGw && onGwChange && 'is-clickable')}
            onClick={() => totals.prevGw && onGwChange?.(totals.prevGw)}
            role={totals.prevGw && onGwChange ? 'button' : undefined}
            tabIndex={totals.prevGw && onGwChange ? 0 : undefined}
            title={totals.prevGw ? `View Gameweek ${totals.prevGw}` : undefined}
          >
            <span className="pillar-label">{totals.prevGw ? `GW ${totals.prevGw}` : 'PREV'}</span>
            <strong className="pillar-score numeric">
              {totals.prevGwTotal != null ? totals.prevGwTotal : '—'}
              {totals.prevGwTotal != null && <small> pts</small>}
            </strong>
            <span className="pillar-sub">Previous</span>
          </div>

          {/* Center Pillar: Active Gameweek + Stepper + Score + Status */}
          <div className="pillar-col is-current">
            <div className="pillar-stepper">
              <button
                type="button"
                className="pillar-step-arrow"
                disabled={gw <= 1}
                aria-label={`Previous Gameweek ${gw - 1}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (gw > 1) onGwChange?.(gw - 1)
                }}
              >
                <ChevronLeft />
              </button>
              <span className="pillar-gw-tag">GW {gw}</span>
              <button
                type="button"
                className="pillar-step-arrow"
                disabled={latestGw != null && gw >= latestGw}
                aria-label={`Next Gameweek ${gw + 1}`}
                onClick={(e) => {
                  e.stopPropagation()
                  if (latestGw != null && gw < latestGw) onGwChange?.(gw + 1)
                }}
              >
                <ChevronRight />
              </button>
            </div>

            <strong className="pillar-hero-score numeric">
              {gwPoints}
              <small> pts</small>
            </strong>

            <span className="pillar-status-line">
              {totals.playedCount}/{totals.startingSlots} Played
              {statusText ? ` · ${statusText}` : ''}
            </span>
          </div>

          {/* Right Pillar: Season Total & Rank */}
          <div className="pillar-col is-season">
            <span className="pillar-label">SEASON</span>
            <strong className="pillar-score numeric">
              {seasonTotal}
              <small> pts</small>
            </strong>
            <span className="pillar-sub">
              {team?.rank != null ? `Rank #${team.rank}` : 'Total'}
            </span>
          </div>
        </section>
      )}

      {state.status === 'ready' && (
        <div className="segmented view-toggle" role="group" aria-label="Squad view">
          <button
            type="button"
            className={view === 'pitch' ? 'active' : ''}
            aria-pressed={view === 'pitch'}
            onClick={() => setView('pitch')}
          >
            <Users /> Pitch
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            <List /> List
          </button>
        </div>
      )}

      {state.status === 'loading' && <LoadingBlock label="Loading squad" rows={6} variant="card" />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={load} />}

      {state.status === 'empty' && (
        <EmptyState
          icon={TriangleAlert}
          title={`GW ${gw} not scored yet`}
          message="This team's lineup for that gameweek has not been scored and synced."
        />
      )}

      {state.status === 'ready' && view === 'pitch' && (
        <>
          <div className="pitch" aria-label="Tactical lineup">
            {pitchLines.map((line) => (
              <div className="pitch-line" key={line.pos}>
                {line.players.map((p) => (
                  <PlayerCard
                    key={p.name}
                    item={p}
                    displayState={p.displayState}
                    captaincy={p.captaincy}
                    opponent={p.opponent}
                    effectivePoints={p.effectivePoints}
                    onClick={() => setSelected(p)}
                  />
                ))}
              </div>
            ))}
          </div>

          {bench.length > 0 && (
            <section className="bench-section" aria-label="Bench substitutes">
              <div className="bench-heading">
                <div>
                  <p className="eyebrow">Substitutes</p>
                  <h2>Bench</h2>
                </div>
              </div>
              <div className="bench-row">
                {bench.map((p) => (
                  <PlayerCard
                    compact
                    key={p.name}
                    item={p}
                    displayState={p.displayState}
                    captaincy={p.captaincy}
                    opponent={p.opponent}
                    effectivePoints={p.effectivePoints}
                    onClick={() => setSelected(p)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {state.status === 'ready' && view === 'list' && (
        <div className="compact-list" role="table" aria-label="Team lineup list">
          <div className="compact-list-head" role="row">
            <span className="col-player">Player</span>
            <span className="col-opp">Opp</span>
            <span className="col-pts">Pts</span>
          </div>

          {pitchLines.map((line) => (
            <div key={line.pos} className="compact-list-group">
              <div className="compact-list-group-divider">
                <span className="position-tag">{line.pos}</span>
                <span className="compact-list-group-count">{line.players.length}</span>
              </div>

              {line.players.map((p) => {
                const opp = p.opponent
                const pts = p.effectivePoints ?? p.points
                const ccy = p.captaincy
                const isNeg = Number(pts) < 0
                return (
                  <button
                    type="button"
                    key={p.name}
                    className="compact-list-row"
                    onClick={() => setSelected(p)}
                  >
                    <PlayerPhoto player={p} />
                    <span className="compact-player-info">
                      <span className="compact-player-name-row">
                        <strong>{p.name}</strong>
                        {ccy?.designation && (
                          <span
                            className={cn(
                              'player-state-badge',
                              ccy.designation === 'C'
                                ? (ccy.handedOver ? 'badge-captain-handover' : 'badge-captain')
                                : 'badge-vice'
                            )}
                          >
                            {ccy.designation}
                          </span>
                        )}
                        {p.displayState && p.displayState !== 'STARTER' && (
                          <span
                            className={cn(
                              'player-state-badge',
                              p.displayState === 'AUTO_SUB_OUT' && 'badge-auto-out',
                              p.displayState === 'AUTO_SUB_IN' && 'badge-auto-in'
                            )}
                          >
                            {p.displayState === 'AUTO_SUB_OUT' ? 'OUT' : 'IN'}
                          </span>
                        )}
                      </span>
                      <small>{p.club}</small>
                    </span>

                    <span className="compact-player-opp">
                      {opp ? `${opp.code} ${opp.venue === 'home' ? '(H)' : '(A)'}` : '—'}
                    </span>

                    <span className={cn('compact-player-pts numeric', isNeg && 'is-negative')}>
                      {pts ?? '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}

          {bench.length > 0 && (
            <div className="compact-list-group">
              <div className="compact-list-group-divider is-bench">
                <span className="position-tag">BENCH</span>
                <span className="compact-list-group-count">{bench.length}</span>
              </div>

              {bench.map((p) => {
                const opp = p.opponent
                const pts = p.effectivePoints ?? p.points
                const ccy = p.captaincy
                const isNeg = Number(pts) < 0
                return (
                  <button
                    type="button"
                    key={p.name}
                    className="compact-list-row is-bench"
                    onClick={() => setSelected(p)}
                  >
                    <PlayerPhoto player={p} />
                    <span className="compact-player-info">
                      <span className="compact-player-name-row">
                        <strong>{p.name}</strong>
                        {ccy?.designation && (
                          <span
                            className={cn(
                              'player-state-badge',
                              ccy.designation === 'C'
                                ? (ccy.handedOver ? 'badge-captain-handover' : 'badge-captain')
                                : 'badge-vice'
                            )}
                          >
                            {ccy.designation}
                          </span>
                        )}
                        {p.displayState && (
                          <span
                            className={cn(
                              'player-state-badge',
                              p.displayState === 'AUTO_SUB_IN' && 'badge-auto-in',
                              p.displayState === 'AUTO_SUB_OUT' && 'badge-auto-out',
                              p.displayState === 'BENCH_UNUSED' && 'badge-neutral'
                            )}
                          >
                            {p.displayState === 'AUTO_SUB_IN'
                              ? 'IN'
                              : p.displayState === 'AUTO_SUB_OUT'
                              ? 'OUT'
                              : 'UNUSED'}
                          </span>
                        )}
                      </span>
                      <small>
                        {normPos(p.pos)} · {p.club}
                      </small>
                    </span>

                    <span className="compact-player-opp">
                      {opp ? `${opp.code} ${opp.venue === 'home' ? '(H)' : '(A)'}` : '—'}
                    </span>

                    <span className={cn('compact-player-pts numeric', isNeg && 'is-negative')}>
                      {pts ?? '—'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {selected && <PlayerModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
