import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronDown, TriangleAlert, UserSearch } from 'lucide-react'
import { fetchTeamSquad } from '@/data/live'
import { PlayerPhoto } from './Imagery'
import { TeamMark } from './TeamMark'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { SearchBox } from '@/components/ui/SearchBox'

const GROUPS = ['GKP', 'DEF', 'MID', 'FWD']
const normPos = (pos) => (pos === 'GK' ? 'GKP' : pos)

/**
 * Squad view. There is no per-manager identity in the app yet (login IDs are
 * still to come), so the team is chosen explicitly via a dropdown and the
 * heading says Squad rather than "My team".
 *
 * Two different totals are shown because they are genuinely different numbers:
 *   - Squad total  — this week's 15 players combined
 *   - Season total — the manager's cumulative league points (from Standings)
 */
export function Squad({ teams, gw }) {
  const [openGroup, setOpenGroup] = useState('GKP')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState(null)
  const [state, setState] = useState({ status: 'idle', squad: null, error: null })

  const teamOptions = useMemo(() => teams.map((t) => t.name), [teams])
  const activeTeam = picked ?? teamOptions[0] ?? null
  const activeMeta = useMemo(() => teams.find((t) => t.name === activeTeam) ?? null, [teams, activeTeam])
  const q = query.trim().toLowerCase()

  const load = useCallback(() => {
    if (!activeTeam) return
    setState({ status: 'loading', squad: null, error: null })
    fetchTeamSquad(activeTeam, gw)
      .then((squad) =>
        setState(
          squad.starters.length === 0
            ? { status: 'empty', squad: null, error: null }
            : { status: 'ready', squad, error: null }
        )
      )
      .catch((err) => setState({ status: 'error', squad: null, error: err?.message }))
  }, [activeTeam, gw])

  useEffect(() => {
    load()
  }, [load])

  const squad = useMemo(() => {
    if (!state.squad) return []
    const norm = (p) => ({ ...p, pos: normPos(p.pos) })
    return [...state.squad.starters.map(norm), ...state.squad.bench.map(norm)]
  }, [state.squad])

  const squadTotal = useMemo(
    () => squad.reduce((sum, p) => sum + (p.points || 0), 0),
    [squad]
  )

  const visibleGroups = useMemo(() => {
    const out = []
    for (const group of GROUPS) {
      const players = squad.filter(
        (p) =>
          p.pos === group &&
          (!q || p.name.toLowerCase().includes(q) || (p.club || '').toLowerCase().includes(q))
      )
      if (players.length > 0) out.push({ group, players })
    }
    return out
  }, [squad, q])

  const totalPlayers = squad.length
  const noSearchMatch = !!q && visibleGroups.length === 0

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Squad · Gameweek {gw}</p>
          <h1>{activeTeam || 'Squad'}</h1>
        </div>
      </div>

      {teamOptions.length > 1 && (
        <div className="team-select">
          <label htmlFor="squad-team">Team</label>
          <div className="team-select-control">
            {activeTeam && <TeamMark name={activeTeam} size={26} />}
            <select
              id="squad-team"
              value={activeTeam ?? ''}
              onChange={(e) => setPicked(e.target.value)}
            >
              {teamOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" className="select-caret" />
          </div>
          {activeMeta && (
            <small className="team-select-meta">
              Rank #{activeMeta.rank} · {activeMeta.total} pts overall
            </small>
          )}
        </div>
      )}

      {state.status === 'ready' && (
        <article className="points-summary-card">
          <BarChart3 />
          <span>Gameweek {gw} squad total</span>
          <strong className="numeric">{squadTotal} pts</strong>
          <small>
            {totalPlayers} players · season {activeMeta?.total ?? 0} pts in the league table
          </small>
        </article>
      )}

      {state.status === 'loading' && <LoadingBlock label="Loading squad" rows={5} />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={load} />}

      {state.status === 'empty' && (
        <EmptyState
          icon={TriangleAlert}
          title={`Gameweek ${gw} not scored yet`}
          message="This team's lineup for that gameweek has not been scored and synced."
        />
      )}

      {state.status === 'ready' && (
        <>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search players or clubs…"
            label="Search players or clubs"
          />

          {noSearchMatch && (
            <EmptyState
              icon={UserSearch}
              title={`No player matches “${query}”`}
              message="That player is not in this squad. Try another name or club."
            />
          )}

          {!noSearchMatch && (
            <div className="accordion">
              {visibleGroups.map(({ group, players }) => {
                const expanded = openGroup === group
                return (
                  <div className="accordion-group" key={group}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpenGroup(expanded ? null : group)}
                    >
                      <span>
                        <b>{group}</b>
                        <small>{players.length} players</small>
                      </span>
                      <ChevronDown className={expanded ? 'rotated' : ''} />
                    </button>

                    {expanded && (
                      <div className="squad-table three">
                        <div className="squad-table-head">
                          <span>Player</span>
                          <span>Season</span>
                          <span>GW</span>
                        </div>
                        {players.map((p) => (
                          <div className="squad-row" key={p.name}>
                            <span>
                              <PlayerPhoto player={p} />
                              <span>
                                <strong>{p.name}</strong>
                                <small>{p.club}</small>
                              </span>
                            </span>
                            <span className="numeric">{p.season}</span>
                            <strong className="numeric">{p.points}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </section>
  )
}