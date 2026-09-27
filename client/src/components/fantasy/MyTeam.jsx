import { useState } from 'react'
import { BarChart3, ChevronDown } from 'lucide-react'
import { squad } from '@/data/mock-fantasy'

export function MyTeam() {
  const [openGroup, setOpenGroup] = useState('GKP')
  const groups = ['GKP', 'DEF', 'MID', 'FWD']

  const totals = squad.reduce(
    (acc, p) => {
      acc.gw += p.points
      acc.season += p.season
      acc.value += p.price
      return acc
    },
    { gw: 0, season: 0, value: 0 },
  )

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">My team</p>
          <h1>Squad</h1>
        </div>
      </div>

      <article className="points-summary-card">
        <BarChart3 />
        <span>This gameweek</span>
        <strong className="numeric">{totals.gw} pts</strong>
        <small>Season total · {totals.season} pts · £{totals.value.toFixed(1)}M squad</small>
      </article>

      <div className="accordion">
        {groups.map((group) => {
          const players = squad.filter((p) => p.pos === group)
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
                <div className="squad-table">
                  <div className="squad-table-head">
                    <span>Player</span>
                    <span>Value</span>
                    <span>Season</span>
                    <span>GW</span>
                  </div>
                  {players.map((p) => (
                    <div className="squad-row" key={p.name}>
                      <span>
                        <span className="shirt mini-shirt">{p.clubCode}</span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.club}</small>
                        </span>
                      </span>
                      <span className="numeric">£{p.price}M</span>
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
    </section>
  )
}