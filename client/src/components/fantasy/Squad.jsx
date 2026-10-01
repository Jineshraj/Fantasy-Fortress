import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, TriangleAlert, UserSearch } from 'lucide-react'
import { fetchTeamSquad } from '@/data/live'
import { PlayerPhoto } from './Imagery'
import { TeamMark } from './TeamMark'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { SearchBox } from '@/components/ui/SearchBox'
import { KEYS, getStored, setStored } from '@/lib/storage'

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
  // Remembered so returning to the tab shows the team you were actually looking
  // at, instead of defaulting to whoever is top of the standings.
  const [picked, setPicked] = useState(() => getStored(KEYS.lastTeam))
  const [state, setState] = useState({ status: 'idle', squad: null, error: null })

  const teamOptions = useMemo(() => teams.map((t) => t.name), [teams])
  // Guard against a remembered team that no longer exists (renamed franchise).
  const remembered = picked && teamOptions.includes(picked) ? picked : null
  const activeTeam = remembered ?? teamOptions[0] ?? null
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
      {/* Heading row carries crest + team name; the selector is a compact
          affordance on the same row rather than a second page header. */}
      <div className="squad-head">
        <div className="squad-head-id">
          {activeTeam && <TeamMark name={activeTeam} size={40} />}
          <div className="squad-head-copy">
            <p className="eyebrow">Squad · Gameweek {gw}</p>
            <h1>{activeTeam || 'Squad'}</h1>
            {activeMeta && (
              <small className="squad-head-meta">
                Rank #{activeMeta.rank} · {activeMeta.total} pts overall
              </small>
            )}
          </div>
        </div>

        {teamOptions.length > 1 && (
          <label className="team-select" htmlFor="squad-team">
            <span className="visually-hidden">Choose a team</span>
            <span className="team-select-control team-select-compact">
              <select
                id="squad-team"
                value={activeTeam ?? ''}
                aria-label="Choose a team"
                onChange={(e) => {
                  setPicked(e.target.value)
                  setStored(KEYS.lastTeam, e.target.value)
                }}
              >
                {teamOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="select-caret" />
            </span>
          </label>
        )}
      </div>

      {state.status === 'ready' && (
        <div className="squad-summary">
          <div className="squad-summary-main">
            <strong className="numeric">{squadTotal}</strong>
            <span>squad total · this week</span>
          </div>
          <div className="squad-summary-sub">
            <span className="numeric">{activeMeta?.total ?? 0}</span> season total ·{' '}
            <span className="numeric">{totalPlayers}</span> players
          </div>
        </div>
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