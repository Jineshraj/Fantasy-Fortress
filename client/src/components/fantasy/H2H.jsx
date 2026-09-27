import { useState } from 'react'
import { Swords, Trophy } from 'lucide-react'
import { h2hWeeks, teams } from '@/data/mock-fantasy'
import { cn } from '@/lib/utils'

const initials = (name) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

export function H2H() {
  const [activeGw, setActiveGw] = useState(h2hWeeks[0].gw)
  const week = h2hWeeks.find((w) => w.gw === activeGw) ?? h2hWeeks[0]

  const findTeam = (name) => teams.find((t) => t.name === name)

  const standings = [...teams]
    .sort((a, b) => b.total - a.total)
    .slice(0, 4)
    .map((t, i) => ({ ...t, rank: i + 1, wins: 4 - i, losses: i }))

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Weekly head-to-head</p>
          <h1>H2H matchups</h1>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="H2H gameweek">
        {h2hWeeks.map((w) => (
          <button
            key={w.gw}
            type="button"
            className={activeGw === w.gw ? 'active' : ''}
            onClick={() => setActiveGw(w.gw)}
          >
            GW {w.gw}
          </button>
        ))}
      </div>

      <div className="h2h-list">
        {week.matches.map((m) => {
          const home = findTeam(m.home)
          const away = findTeam(m.away)
          const isFinal = m.winner !== null
          const homeWins = m.winner === 'home'
          const awayWins = m.winner === 'away'
          return (
            <article key={m.id} className={cn('h2h-card', isFinal && 'final')}>
              <div className="h2h-meta">
                <span>GW {week.gw}{isFinal ? ' · Final' : ' · Upcoming'}</span>
              </div>
              <div className="h2h-row">
                <div className={cn('h2h-side', homeWins && 'winner', awayWins && 'loser')}>
                  <span className="avatar">{initials(m.home)}</span>
                  <strong>{m.home}</strong>
                </div>
                <div className="h2h-score">
                  <strong className="numeric">{m.homeGw}</strong>
                  <i>–</i>
                  <strong className="numeric">{m.awayGw}</strong>
                </div>
                <div className={cn('h2h-side', awayWins && 'winner', homeWins && 'loser')}>
                  <strong>{m.away}</strong>
                  <span className="avatar">{initials(m.away)}</span>
                </div>
              </div>
              {(home || away) && (
                <div className="h2h-foot">
                  {home && <small>#{home.rank} in standings</small>}
                  {away && <small>#{away.rank} in standings</small>}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <div className="h2h-leader">
        <div className="h2h-leader-head">
          <Trophy />
          <div>
            <strong>H2H standings</strong>
            <small>After GW {week.gw}</small>
          </div>
        </div>
        <div className="h2h-leader-list">
          {standings.map((t, i) => (
            <div key={t.name} className="h2h-leader-row">
              <span className={cn('rank-badge', i < 3 && `podium-${i + 1}`)}>{i + 1}</span>
              <strong>{t.name}</strong>
              <span className="numeric">{t.wins}W · {t.losses}L</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}