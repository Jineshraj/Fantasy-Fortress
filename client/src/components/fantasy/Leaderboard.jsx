import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Clock3, Search } from 'lucide-react'
import { TeamMark } from './TeamMark'
import { EmptyState } from '@/components/ui/states'
import { SearchBox } from '@/components/ui/SearchBox'
import { teamPath } from '@/lib/routes'
import { cn } from '@/lib/utils'

const gwPoints = (team, gw) => {
  if (Array.isArray(team.gwByWeek) && team.gwByWeek.length >= gw) return team.gwByWeek[gw - 1] || 0
  return 0
}

/**
 * Rank in both modes. The Overall↔Gameweek toggle re-sorts two columns that
 * usually produce a similar order (season_total is a cumulative sum of the
 * weekly scores), so it looked like a broken control. The movement delta between
 * the two ranks is the information the user actually wanted, so it is now
 * rendered explicitly.
 */
function useRanks(teams, gw) {
  return useMemo(() => {
    const overall = [...teams].sort((a, b) => b.total - a.total)
    const weekly = [...teams].sort((a, b) => gwPoints(b, gw) - gwPoints(a, gw))
    const overallRank = new Map(overall.map((t, i) => [t.name, i + 1]))
    const weeklyRank = new Map(weekly.map((t, i) => [t.name, i + 1]))
    return {
      overall,
      weekly,
      overallRank,
      weeklyRank,
      // Positive = climbed (weekly rank is better/lower than overall rank).
      movement: new Map(
        teams.map((t) => {
          const o = overallRank.get(t.name) ?? 0
          const w = weeklyRank.get(t.name) ?? 0
          return [t.name, o - w]
        })
      ),
    }
  }, [teams, gw])
}

export function Leaderboard({ teams, latestGw, gw }) {
  const [query, setQuery] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()

  // The Overall/Gameweek toggle is URL-addressable (?view=overall|gw) so the
  // app can tell whether the gameweek stepper belongs on this screen. The week
  // itself still comes from the global ScopeBar — there is deliberately no
  // second week control here.
  const mode = searchParams.get('view') === 'gw' ? 'gw' : 'overall'
  const setMode = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'gw') params.set('view', 'gw')
    else params.delete('view')
    // replace: a view option, not history.
    setSearchParams(params, { replace: true })
  }

  const week = gw ?? latestGw ?? 1

  const { overall, weekly, overallRank, weeklyRank, movement } = useRanks(teams, week)
  const q = query.trim().toLowerCase()

  const matches = (t) =>
    !q || t.name.toLowerCase().includes(q) || (t.manager || '').toLowerCase().includes(q)

  const sorted = [...(mode === 'overall' ? overall : weekly)].filter(matches)

  const rankOf = (t) => (mode === 'overall' ? overallRank : weeklyRank).get(t.name)

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">League table · {teams.length} managers</p>
          <h1>The standings</h1>
        </div>
        <div className="update-note">
          <Clock3 /> through GW {week}
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Leaderboard scoring period">
        <button
          type="button"
          className={mode === 'overall' ? 'active' : ''}
          aria-pressed={mode === 'overall'}
          onClick={() => setMode('overall')}
        >
          Overall
        </button>
        <button
          type="button"
          className={mode === 'gw' ? 'active' : ''}
          aria-pressed={mode === 'gw'}
          onClick={() => setMode('gw')}
        >
          Gameweek
        </button>
      </div>

      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search teams or managers…"
        label="Search teams or managers"
      />

      <div className={cn('leaderboard-head', mode === 'overall' ? 'emph-total' : 'emph-gw')}>
        <span>Rank / team</span>
        <span>GW</span>
        <span>Total</span>
      </div>

      <div className="leader-list">
        {sorted.length === 0 ? (
          <EmptyState icon={Search} title="No teams found" message="Try a different search." />
        ) : (
          sorted.map((team) => {
            const rank = rankOf(team)
            const podium = rank <= 3
            const delta = movement.get(team.name) ?? 0
            const weeklyPts = gwPoints(team, week)
            return (
              // A real <Link>, not a button: middle-click, ctrl-click and
              // "copy link address" all work, and the browser Back button
              // returns to the table exactly where you left it.
              <Link className={cn('team-row', mode === 'overall' ? 'emph-total' : 'emph-gw')} to={teamPath(team.name, week)} key={team.name}>
                <span className={cn('rank-badge', podium && `podium-${rank}`)}>{rank}</span>

                <span className="row-team">
                  <TeamMark name={team.name} size={34} />
                  <span className="team-copy">
                    <strong>{team.name}</strong>
                    <small className="row-meta">
                      {team.manager ? `${team.manager} · ` : ''}
                      {weeklyPts > 0 ? `${weeklyPts} pts in GW ${week}` : `no GW ${week} score`}
                    </small>
                  </span>
                </span>

                {/* Always rendered, even with no movement. The grid is
                    five tracks wide, so omitting this cell would let GW and
                    Total auto-place one track left of their headings. */}
                <span
                  className={cn('rank-move', delta > 0 ? 'up' : delta < 0 ? 'down' : 'none')}
                  aria-hidden={delta === 0}
                >
                  {delta === 0 ? '–' : `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`}
                </span>

                <strong className="numeric gw-points">{weeklyPts || '–'}</strong>
                <strong className="numeric total-points">{team.total}</strong>
              </Link>
            )
          })
        )}
      </div>
    </section>
  )
}
