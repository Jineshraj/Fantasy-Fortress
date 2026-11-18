import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Settings2, TriangleAlert, UserSearch } from 'lucide-react'
import { clearLiveCache, fetchGameweekStatus, fetchTeamSquad } from '@/data/live'
import { PlayerPhoto } from './Imagery'
import { TeamMark } from './TeamMark'
import { EmptyState, InlineError, LoadingBlock } from '@/components/ui/states'
import { SearchBox } from '@/components/ui/SearchBox'
import { KEYS, getSession, getStored, setSession, setStored } from '@/lib/storage'
import { cn } from '@/lib/utils'

const GROUPS = ['GKP', 'DEF', 'MID', 'FWD']
const normPos = (pos) => (pos === 'GK' ? 'GKP' : pos)

/**
 * Squad view. There is no per-manager identity in the app yet (login IDs are
 * still to come), so the team is chosen explicitly via a compact switcher and
 * the heading says Squad rather than "My team".
 *
 * The hero reports the *effective XI* total written by the scoring engine —
 * never a 15-player sum built in JSX. Bench points stay visible in the player
 * detail but never inflate the headline.
 */
export function Squad({ teams, gw }) {
  const [openGroup, setOpenGroupState] = useState(() => {
    const stored = getSession(KEYS.squadGroup)
    return stored === null ? 'GKP' : stored || null
  })
  const [query, setQueryState] = useState(() => getSession(KEYS.squadQuery) ?? '')
  // Search + accordion are view state, not URL state: remember them for the
  // session so Back from a team page returns to the squad you were reading.
  const setOpenGroup = (next) => {
    setOpenGroupState(next)
    setSession(KEYS.squadGroup, next ?? '')
  }
  const setQuery = (next) => {
    setQueryState(next)
    setSession(KEYS.squadQuery, next)
  }
  // Remembered so returning to the tab shows the team you were actually looking
  // at, instead of defaulting to whoever is top of the standings.
  const [picked, setPicked] = useState(() => getStored(KEYS.lastTeam))
  const [state, setState] = useState({ status: 'idle', squad: null, error: null })
  const [statusText, setStatusText] = useState(null)

  const teamOptions = useMemo(() => teams.map((t) => t.name), [teams])
  // Guard against a remembered team that no longer exists (renamed franchise).
  const remembered = picked && teamOptions.includes(picked) ? picked : null
  const activeTeam = remembered ?? teamOptions[0] ?? null
  const activeMeta = useMemo(() => teams.find((t) => t.name === activeTeam) ?? null, [teams, activeTeam])
  // No authentication yet — the switcher stays behind a capability flag so the
  // header never renders a second full-width title on mobile.
  const canSwitchTeams = teamOptions.length > 1
  const q = query.trim().toLowerCase()

  const load = useCallback((force = false) => {
    if (!activeTeam) return
    if (force) clearLiveCache('pstats')
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

  // Exactly one status pill; null means "not available" and the pill is omitted
  // rather than showing a fabricated zero.
  useEffect(() => {
    let alive = true
    fetchGameweekStatus(gw)
      .then((text) => alive && setStatusText(text))
      .catch(() => alive && setStatusText(null))
    return () => {
      alive = false
    }
  }, [gw])

  const squad = useMemo(() => {
    if (!state.squad) return []
    const norm = (p) => ({ ...p, pos: normPos(p.pos) })
    return [...state.squad.starters.map(norm), ...state.squad.bench.map(norm)]
  }, [state.squad])

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

  const noSearchMatch = !!q && visibleGroups.length === 0
  const totals = state.squad?.totals ?? null
  const gwPoints = totals?.gw ?? 0
  const seasonTotal = activeMeta?.total ?? totals?.season ?? 0
  const rank = activeMeta?.rank ?? null

  return (
    <section className="page-section">
      {/* Two fixed rows: context/actions on top, identity below. The title is a
          single line that truncates — it never wraps into a cramped block. */}
      <header className="squad-head">
        <div className="squad-context">
          <p className="eyebrow">Squad · Gameweek {gw}</p>
        </div>

        <div className="squad-actions">
          {canSwitchTeams && (
            <label className="team-switcher">
              <span className="visually-hidden">Choose a team</span>
              <select
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
              <Settings2 aria-hidden="true" />
            </label>
          )}
        </div>

        <div className="squad-identity">
          {activeTeam && <TeamMark name={activeTeam} size={48} />}
          <div className="squad-identity-copy">
            <h1 title={activeTeam || undefined}>{activeTeam || 'Squad'}</h1>
            <p className="squad-identity-meta">
              Rank #{rank ?? '–'} · {seasonTotal ?? 0} pts
            </p>
          </div>
        </div>
      </header>

      {state.status === 'ready' && totals && (
        <section className="points-summary ff-scorecard" aria-label={`Gameweek ${gw} score`}>
          <div className="points-summary-primary">
            <span className="eyebrow">Gameweek {gw} points</span>
            <strong className="points-summary-score numeric">
              {gwPoints}
              <small> pts</small>
            </strong>
            <span className="points-summary-label">Effective XI total</span>
          </div>
          <div className="points-summary-metrics">
            <div>
              <span>Season rank</span>
              <strong className="numeric">#{rank ?? '–'}</strong>
            </div>
            <div>
              <span>Season total</span>
              <strong className="numeric">{seasonTotal} pts</strong>
            </div>
          </div>
          <div className="points-summary-status">
            <span className="badge-live">
              {totals.playedCount}/{totals.startingSlots} Played
            </span>
            {statusText && <span className="scorecard-delta">{statusText}</span>}
          </div>
        </section>
      )}

      {state.status === 'loading' && <LoadingBlock label="Loading squad" rows={5} />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={() => load(true)} />}

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
                            <strong
                              className={cn('numeric', p.yetToPlay && 'is-yet-to-play')}
                              title={p.yetToPlay ? 'Yet to play' : undefined}
                            >
                              {p.yetToPlay ? 'YTP' : p.points}
                            </strong>
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
