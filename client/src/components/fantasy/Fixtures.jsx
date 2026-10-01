import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, ChevronDown, Tv } from 'lucide-react'
import { fetchFixtures } from '@/data/live'
import { clubBadge } from '@/data/playerImages'
import { ClubMark } from './Imagery'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { cn } from '@/lib/utils'

/**
 * Fixtures grouped by gameweek, newest first, collapsible. Previously this was
 * one flat Upcoming/Results list spanning all 38 gameweeks, which was long
 * enough to be unscannable.
 */
export function Fixtures({ gw }) {
  const [state, setState] = useState({ status: 'loading', rows: null, error: null })
  const [open, setOpen] = useState(() => new Set())

  const load = () => {
    setState({ status: 'loading', rows: null, error: null })
    fetchFixtures()
      .then((rows) =>
        setState(rows.length === 0 ? { status: 'empty', rows: null, error: null } : { status: 'ready', rows, error: null })
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
                      return (
                        <article key={f.id} className={cn('fixture-card', isFinal && 'final')}>
                          <div className="fixture-meta">
                            <span className="fixture-kickoff">{isFinal ? 'FT' : f.kickoff}</span>
                            <span className="fixture-status">
                              {isFinal ? <Tv /> : <CalendarClock />}
                              {isFinal ? 'Full time' : 'Upcoming'}
                            </span>
                          </div>
                          <div className="fixture-teams">
                            <div className="fixture-side home">
                              <ClubMark code={f.home} url={clubBadge(f.homeApiId)} />
                              <strong>{f.homeName}</strong>
                            </div>
                            <div className="fixture-score">
                              {f.score ? (
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
                              <strong>{f.awayName}</strong>
                              <ClubMark code={f.away} url={clubBadge(f.awayApiId)} />
                            </div>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
