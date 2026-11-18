import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Swords, Trophy } from 'lucide-react'
import { H2H_WEEKS, groupATeams, groupBTeams } from '@/data/tournamentFixtures'
import { buildH2HStandings, buildH2HWeek, scoredGameweeks } from '@/data/live'
import { TeamMark } from './TeamMark'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { cn } from '@/lib/utils'

const GroupTable = ({ title, rows, scored }) => (
  <div className="group-table">
    <div className="h2h-group-head">{title}</div>
    {rows.length === 0 ? (
      <p className="group-empty">No results yet</p>
    ) : (
      <div className="h2h-leader-list">
        {rows.map((t, i) => (
          <div key={t.team} className="h2h-leader-row">
            <span className={cn('rank-badge', i < 3 && `podium-${i + 1}`)}>{i + 1}</span>
            <strong>{t.team}</strong>
            {scored ? (
              <span className="numeric">
                {t.pts} pts · {t.w}W {t.d}D {t.l}L
              </span>
            ) : (
              <span className="numeric">–</span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
)

export function H2H() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawWeek = Number.parseInt(searchParams.get('week'), 10)
  const validParam = H2H_WEEKS.some((w) => w.gw === rawWeek) ? rawWeek : null

  // Default to the last week in the schedule, corrected once we know which
  // gameweeks actually have scores. A ?week= in the URL always wins, so Back,
  // refresh and a shared link all land on the round the user was viewing.
  const [activeGw, setActiveGw] = useState(
    () => validParam ?? H2H_WEEKS[H2H_WEEKS.length - 1].gw
  )
  const [state, setState] = useState({ status: 'loading', week: null, standings: null, error: null })

  useEffect(() => {
    if (validParam) return undefined
    let cancelled = false
    scoredGameweeks()
      .then((scored) => {
        if (cancelled || scored.size === 0) return
        const best = [...H2H_WEEKS].reverse().find((w) => scored.has(w.gw))
        if (best) setActiveGw((prev) => (prev === best.gw ? prev : best.gw))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [validParam])

  const selectWeek = (week) => {
    setActiveGw(week)
    const params = new URLSearchParams(searchParams)
    params.set('week', String(week))
    setSearchParams(params, { replace: true })
  }

  const target = useMemo(
    () => H2H_WEEKS.find((w) => w.gw === activeGw) ?? H2H_WEEKS[0],
    [activeGw]
  )

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: 'loading', error: null }))
    Promise.all([buildH2HWeek(target), buildH2HStandings(H2H_WEEKS)])
      .then(([week, standings]) =>
        setState({ status: 'ready', week, standings, error: null })
      )
      .catch((err) => setState({ status: 'error', week: null, standings: null, error: err?.message }))
  }, [target])

  useEffect(() => {
    load()
  }, [load])

  const allPlayed = state.week?.matches.every((m) => m.played) ?? false

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Weekly head-to-head · 2 groups of 8</p>
          <h1>H2H matchups</h1>
        </div>
      </div>

      <div className="filter-chips" role="group" aria-label="H2H gameweek">
        {H2H_WEEKS.map((w) => (
          <button
            key={w.gw}
            type="button"
            className={activeGw === w.gw ? 'active' : ''}
            aria-pressed={activeGw === w.gw}
            onClick={() => selectWeek(w.gw)}
          >
            GW {w.gw}
          </button>
        ))}
      </div>

      {state.status === 'loading' && <LoadingBlock label="Loading head-to-head" rows={4} />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={load} />}

      {state.status === 'ready' && !allPlayed && (
        <div className="notice-strip">
          <Swords aria-hidden="true" />
          GW {activeGw} head-to-heads have not all been scored yet — unscored ties show as dashes.
        </div>
      )}

      {state.status === 'ready' && (
        <div className="h2h-list">
          {state.week.matches.map((m) => {
            const homeWins = m.winner === 'home'
            const awayWins = m.winner === 'away'
            return (
              <article key={m.id} className={cn('h2h-card', m.played && 'final')}>
                <div className="h2h-meta">
                  <span>
                    {m.group} · {m.played ? 'Final' : 'Upcoming'}
                  </span>
                </div>
                <div className="h2h-row">
                  <div className={cn('h2h-side', homeWins && 'winner', awayWins && 'loser')}>
                    <TeamMark name={m.home} />
                    <strong>{m.home}</strong>
                  </div>
                  <div className="h2h-score">
                    <strong className="numeric">{m.homeGw ?? '–'}</strong>
                    <i>–</i>
                    <strong className="numeric">{m.awayGw ?? '–'}</strong>
                  </div>
                  <div className={cn('h2h-side', awayWins && 'winner', homeWins && 'loser')}>
                    <strong>{m.away}</strong>
                    <TeamMark name={m.away} />
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <div className="h2h-leader">
        <div className="h2h-leader-head">
          <Trophy />
          <div>
            <strong>H2H standings</strong>
            <small>3 points for a win · stadium bonus excluded</small>
          </div>
        </div>

        {state.status === 'ready' && state.standings ? (
          <>
            <GroupTable title="Group A" rows={state.standings.GroupA} scored />
            <GroupTable title="Group B" rows={state.standings.GroupB} scored />
          </>
        ) : state.status === 'ready' ? (
          <>
            <GroupTable
              title="Group A"
              rows={groupATeams.map((team) => ({ team, pts: 0 }))}
              scored={false}
            />
            <GroupTable
              title="Group B"
              rows={groupBTeams.map((team) => ({ team, pts: 0 }))}
              scored={false}
            />
          </>
        ) : (
          <LoadingBlock label="Loading standings" rows={4} />
        )}
      </div>
    </section>
  )
}
