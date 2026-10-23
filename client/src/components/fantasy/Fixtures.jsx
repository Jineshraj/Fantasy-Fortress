import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronDown } from 'lucide-react'
import { fetchFixtures, fetchFixtureOwnership } from '@/data/live'
import { ClubMark } from './Imagery'
import { FixtureOwnershipModal } from './FixtureOwnershipModal'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const toOwnershipFixture = (f) => ({
  id: String(f.id),
  gameweek: f.gw,
  kickoff: f.kickoff,
  status: f.status,
  home: { name: f.homeName, code: f.home, apiId: f.homeApiId ?? null, badgeUrl: f.homeBadge },
  away: { name: f.awayName, code: f.away, apiId: f.awayApiId ?? null, badgeUrl: f.awayBadge },
  score: f.score,
})

/**
 * Fixtures grouped by gameweek, newest first, collapsible.
 *
 * Each fixture is a real `<button>` that opens the "Who owns who?" dialog. The
 * mobile row shows the canonical broadcast code (ARS / CHE / …) instead of full
 * club names — full names still reach the accessible label and the modal
 * header, so nothing is lost to screen readers.
 */
export function Fixtures({ gw }) {
  const [state, setState] = useState({ status: 'loading', rows: null, error: null })
  const [open, setOpen] = useState(() => new Set())
  const [ownership, setOwnership] = useState({
    fixture: null,
    status: 'idle',
    rows: [],
    error: null,
  })

  const load = () => {
    setState({ status: 'loading', rows: null, error: null })
    fetchFixtures()
      .then((rows) =>
        setState(
          rows.length === 0
            ? { status: 'empty', rows: null, error: null }
            : { status: 'ready', rows, error: null }
        )
      )
      .catch((err) => setState({ status: 'error', rows: null, error: err?.message }))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byGw = useMemo(() => {
    if (!state.rows) return []
    const map = new Map()
    state.rows.forEach((f) => {
      if (!map.has(f.gw)) map.set(f.gw, [])
      map.get(f.gw).push(f)
    })
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [state.rows])

  // Follow the global week: whichever gameweek the ScopeBar is scoped to stays
  // expanded. Previously this only opened on first render, so changing the week
  // left a different gameweek expanded.
  useEffect(() => {
    if (byGw.length === 0) return
    setOpen((prev) => {
      const target = byGw.some(([g]) => g === gw) ? gw : byGw[0][0]
      if (prev.size === 1 && prev.has(target)) return prev
      return new Set([target])
    })
  }, [byGw, gw])

  const toggle = (g) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })

  const openOwnership = async (f) => {
    const fixture = toOwnershipFixture(f)
    setOwnership({ fixture, status: 'loading', rows: [], error: null })
    try {
      const rows = await fetchFixtureOwnership(f, f.gw)
      setOwnership({
        fixture,
        status: rows.length > 0 ? 'ready' : 'empty',
        rows,
        error: null,
      })
    } catch (err) {
      setOwnership({ fixture, status: 'error', rows: [], error: err?.message || null })
    }
  }

  const closeOwnership = useCallback(
    () => setOwnership({ fixture: null, status: 'idle', rows: [], error: null }),
    []
  )

  const retryOwnership = () => {
    const f = ownership.fixture
    if (!f) return
    setOwnership({ fixture: f, status: 'loading', rows: [], error: null })
    fetchFixtureOwnership(
      { homeName: f.home.name, awayName: f.away.name },
      f.gameweek
    )
      .then((rows) =>
        setOwnership({
          fixture: f,
          status: rows.length > 0 ? 'ready' : 'empty',
          rows,
          error: null,
        })
      )
      .catch((err) =>
        setOwnership({ fixture: f, status: 'error', rows: [], error: err?.message || null })
      )
  }

  const statusLabel = (f) => (f.score !== null ? 'Full time' : 'Upcoming')

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Matchday schedule</p>
          <h1>Fixtures</h1>
        </div>
      </div>

      {state.status === 'loading' && <LoadingBlock label="Loading fixtures" rows={5} />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={load} />}

      {state.status === 'empty' && (
        <EmptyState
          icon={CalendarClock}
          title="No fixtures synced"
          message="Run the Supabase sync to load the match schedule."
        />
      )}

      {state.status === 'ready' && (
        <div className="gw-groups">
          {byGw.map(([g, rows]) => {
            const expanded = open.has(g)
            const played = rows.filter((f) => f.score !== null).length
            return (
              <div className={cn('accordion-group gw-group', g === gw && 'current')} key={g}>
                <button type="button" aria-expanded={expanded} onClick={() => toggle(g)}>
                  <span>
                    <b>GW {g}</b>
                    <small>
                      {played}/{rows.length} played{g === gw ? ' · viewing' : ''}
                    </small>
                  </span>
                  <ChevronDown className={expanded ? 'rotated' : ''} />
                </button>

                {expanded && (
                  <div className="fixtures-list grouped">
                    {rows.map((f) => {
                      const isFinal = f.score !== null
                      const label = statusLabel(f)
                      return (
                        <button
                          key={f.id}
                          type="button"
                          className={cn(
                            'fixture-card',
                            'fixture-card--interactive',
                            isFinal && 'final'
                          )}
                          aria-label={`${f.homeName} versus ${f.awayName}, gameweek ${g}, ${
                            isFinal ? `${f.score[0]} to ${f.score[1]}, full time` : 'upcoming'
                          }. View league ownership.`}
                          onClick={() => openOwnership(f)}
                        >
                          <div className="fixture-meta">
                            {!isFinal && <span className="fixture-kickoff">{f.kickoff}</span>}
                            <span
                              className={cn('fixture-status', isFinal && 'is-final')}
                              aria-hidden="true"
                            >
                              <span className="status-dot" />
                              {label}
                            </span>
                          </div>

                          <div className="fixture-teams">
                            <div className="fixture-side home">
                              <ClubMark code={f.home} url={f.homeBadge} />
                              <span className="fixture-broadcast">{f.home}</span>
                            </div>
                            <div className="fixture-score">
                              {isFinal ? (
                                <>
                                  <strong className="numeric">{f.score[0]}</strong>
                                  <i>–</i>
                                  <strong className="numeric">{f.score[1]}</strong>
                                </>
                              ) : (
                                <span className="vs">VS</span>
                              )}
                            </div>
                            <div className="fixture-side away">
                              <span className="fixture-broadcast">{f.away}</span>
                              <ClubMark code={f.away} url={f.awayBadge} />
                            </div>
                          </div>

                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {ownership.fixture && (
        <FixtureOwnershipModal
          fixture={ownership.fixture}
          rows={ownership.rows}
          status={ownership.status}
          error={ownership.error}
          onRetry={retryOwnership}
          onClose={closeOwnership}
        />
      )}
    </section>
  )
}
