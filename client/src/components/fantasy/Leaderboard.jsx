import { useState } from 'react'
import { Clock3, Trophy } from 'lucide-react'
import { teams } from '@/data/mock-fantasy'
import { cn } from '@/lib/utils'

export function Leaderboard({ onTeam, lastUpdated }) {
  const [mode, setMode] = useState('overall')
  const sorted = [...teams].sort((a, b) => (mode === 'overall' ? b.total - a.total : b.gw - a.gw))

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">League table · 7 managers</p>
          <h1>The standings</h1>
        </div>
        {lastUpdated && (
          <div className="update-note">
            <Clock3 /> {lastUpdated}
          </div>
        )}
      </div>

      <div className="segmented" role="group" aria-label="Leaderboard scoring period">
        <button
          type="button"
          className={mode === 'overall' ? 'active' : ''}
          onClick={() => setMode('overall')}
        >
          Overall
        </button>
        <button
          type="button"
          className={mode === 'gw' ? 'active' : ''}
          onClick={() => setMode('gw')}
        >
          Gameweek
        </button>
      </div>

      <div className="leaderboard-head">
        <span>Rank / team</span>
        <span>GW</span>
        <span>Total</span>
      </div>

      <div className="leader-list">
        {sorted.map((team, index) => {
          const podium = index < 3
          return (
            <button
              type="button"
              className="team-row"
              key={team.name}
              onClick={() => onTeam(team)}
            >
              <span className={cn('rank-badge', podium && `podium-${index + 1}`)}>
                {index + 1}
              </span>
              <span className="team-copy">
                <strong>{team.name}</strong>
                <small>{team.manager}</small>
              </span>
              <strong className="numeric gw-points">{team.gw}</strong>
              <strong className="numeric total-points">{team.total}</strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}