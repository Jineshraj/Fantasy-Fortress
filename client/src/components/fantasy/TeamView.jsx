import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, List, TriangleAlert, Users } from 'lucide-react'
import { fetchTeamSquad } from '@/data/live'
import { PlayerCard } from './PlayerCard'
import { PlayerModal } from './PlayerModal'
import { PlayerPhoto } from './Imagery'
import { TeamMark } from './TeamMark'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { ROUTES } from '@/lib/routes'

const LINE_POSITIONS = ['GKP', 'DEF', 'MID', 'FWD']
const normPos = (pos) => (pos === 'GK' ? 'GKP' : pos)

const gwPointsOf = (team, gw) =>
  Array.isArray(team?.gwByWeek) && team.gwByWeek.length >= gw ? team.gwByWeek[gw - 1] || 0 : null

export function TeamView({ team, gw }) {
  const [view, setView] = useState('pitch')
  const [selected, setSelected] = useState(null)
  const [state, setState] = useState({ status: 'loading', squad: null, error: null })

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

  const starters = state.squad?.starters ?? []
  const bench = state.squad?.bench ?? []
  const gwScore = state.squad?.totals.gw ?? gwPointsOf(team, gw)

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
      <Link to={`${ROUTES.table}${gw ? `?gw=${gw}` : ''}`} className="back-link">
        <ArrowLeft /> Back to table
      </Link>

      <div className="team-title">
        <div className="team-title-id">
          <TeamMark name={team?.name} size={44} />
          <div>
            <p className="eyebrow">
              Rank #{team?.rank ?? '–'} · GW {gw}
            </p>
            <h1>{team?.name}</h1>
          </div>
        </div>
        <div className="score-badge">
          <span>GW score</span>
          <strong className="numeric">{gwScore ?? '–'}</strong>
        </div>
      </div>

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
        <div className="pitch" aria-label="Tactical lineup">
          {pitchLines.map((line) => (
            <div className="pitch-line" key={line.pos}>
              {line.players.map((p) => (
                <PlayerCard key={p.name} item={p} onClick={() => setSelected(p)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {state.status === 'ready' && view === 'list' && (
        <div className="compact-list">
          {starters.map((p, i) => (
            <button type="button" key={p.name} onClick={() => setSelected(p)}>
              <span>{i + 1}</span>
              <PlayerPhoto player={p} />
              <span>
                <strong>{p.name}</strong>
                <small>
                  {normPos(p.pos)} · {p.club}
                </small>
              </span>
              <b className="numeric">{p.points}</b>
            </button>
          ))}
        </div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="bench-heading">
            <div>
              <p className="eyebrow">Substitutes</p>
              <h2>Bench</h2>
            </div>
          </div>
          <div className="bench-row">
            {bench.map((p) => (
              <PlayerCard compact key={p.name} item={p} onClick={() => setSelected(p)} />
            ))}
          </div>
        </>
      )}

      {selected && <PlayerModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}
