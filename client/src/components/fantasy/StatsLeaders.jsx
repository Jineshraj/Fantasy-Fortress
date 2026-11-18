import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search } from 'lucide-react'
import { fetchStatLeaders } from '@/data/live'
import { PlayerPhoto } from './Imagery'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { SearchBox } from '@/components/ui/SearchBox'
import { KEYS, getSession, setSession } from '@/lib/storage'
import { cn } from '@/lib/utils'

const POS_FILTERS = ['ALL', 'GKP', 'DEF', 'MID', 'FWD']
const normPos = (pos) => (pos === 'GK' ? 'GKP' : pos)

export function StatsLeaders({ gw }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQueryState] = useState(() => getSession(KEYS.statsQuery) ?? '')
  const [state, setState] = useState({ status: 'loading', rows: null, error: null })
  const q = query.trim().toLowerCase()

  // Period + position are shareable views of this screen, so they live in the
  // URL and survive Back. Search text stays in session memory.
  const board = searchParams.get('board') === 'season' ? 'season' : 'gw'
  const rawPos = searchParams.get('pos')
  const pos = POS_FILTERS.includes(rawPos) ? rawPos : 'ALL'

  const setBoard = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'season') params.set('board', 'season')
    else params.delete('board')
    setSearchParams(params, { replace: true })
  }

  const setPos = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next && next !== 'ALL') params.set('pos', next)
    else params.delete('pos')
    setSearchParams(params, { replace: true })
  }

  const setQuery = (next) => {
    setQueryState(next)
    setSession(KEYS.statsQuery, next)
  }

  const load = useCallback(() => {
    setState({ status: 'loading', rows: null, error: null })
    fetchStatLeaders(gw, 200)
      .then((rows) =>
        setState(rows.length === 0 ? { status: 'empty', rows: null, error: null } : { status: 'ready', rows, error: null })
      )
      .catch((err) => setState({ status: 'error', rows: null, error: err?.message }))
  }, [gw])

  useEffect(() => {
    load()
  }, [load])

  const rows = useMemo(() => {
    if (!state.rows) return []
    return state.rows.filter(
      (p) =>
        (pos === 'ALL' || normPos(p.pos) === pos) &&
        (!q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q))
    )
  }, [state.rows, pos, q])

  const leaders = useMemo(() => {
    const sorted = [...rows].sort((a, b) =>
      board === 'gw' ? b.points - a.points : b.season - a.season
    )
    return sorted.slice(0, 10)
  }, [rows, board])

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">
            {board === 'gw' ? `GW ${gw} points` : 'Season points'} · all 16 squads
          </p>
          <h1>Stats</h1>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Stats period">
        <button type="button" className={board === 'gw' ? 'active' : ''} aria-pressed={board === 'gw'} onClick={() => setBoard('gw')}>
          Gameweek {gw}
        </button>
        <button type="button" className={board === 'season' ? 'active' : ''} aria-pressed={board === 'season'} onClick={() => setBoard('season')}>
          Season
        </button>
      </div>

      <div className="filter-chips" role="group" aria-label="Position filter">
        {POS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={pos === f ? 'active' : ''}
            aria-pressed={pos === f}
            onClick={() => setPos(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search players or clubs…"
        label="Search players or clubs"
      />

      {state.status === 'loading' && <LoadingBlock label="Loading player stats" rows={6} />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={load} />}

      {state.status === 'empty' && (
        <EmptyState icon={Search} title="No player stats" message="No player stats have been synced yet." />
      )}

      {state.status === 'ready' && leaders.length === 0 && (
        <EmptyState icon={Search} title="No players found" message="Try a different search or position." />
      )}

      {state.status === 'ready' && leaders.length > 0 && (
        <div className="compact-list">
          {leaders.map((p, i) => {
            const value = board === 'gw' ? p.points : p.season
            return (
              <div key={p.name} className={cn('stat-leader-card', i < 3 && `podium-card-${i + 1}`)}>
                <span className={cn('rank-badge', i < 3 && `podium-${i + 1}`)}>{i + 1}</span>
                <span className="leader-id">
                  <PlayerPhoto player={p} />
                  <span className="leader-copy">
                    <strong>{p.name}</strong>
                    <small>
                      {normPos(p.pos)} · {p.club || '—'}
                    </small>
                    {board === 'gw' && (p.goals > 0 || p.assists > 0 || p.cleanSheet) && (
                      <span className="leader-events">
                        {p.goals > 0 && <em>{p.goals}G</em>}
                        {p.assists > 0 && <em>{p.assists}A</em>}
                        {p.cleanSheet && <em>CS</em>}
                      </span>
                    )}
                  </span>
                </span>
                <strong className="numeric leader-value">{value}</strong>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
