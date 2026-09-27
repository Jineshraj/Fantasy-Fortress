import { useState } from 'react'
import { ArrowLeft, List, Users } from 'lucide-react'
import { bench, starters, teams } from '@/data/mock-fantasy'
import { PlayerCard } from './PlayerCard'
import { PlayerModal } from './PlayerModal'

const LINE_POSITIONS = [
  { pos: 'GKP', name: 'Goalkeeper' },
  { pos: 'DEF', name: 'Defenders' },
  { pos: 'MID', name: 'Midfielders' },
  { pos: 'FWD', name: 'Forwards' },
]

export function TeamView({ team, onBack }) {
  const [view, setView] = useState('pitch')
  const [selected, setSelected] = useState(null)
  const me = teams.find((t) => t.name === team?.name) ?? team

  const pitchLines = LINE_POSITIONS.map((line) => ({
    pos: line.pos,
    players: starters.filter((p) => p.pos === line.pos),
  }))

  return (
    <section className="page-section team-page">
      <button type="button" className="back-link" onClick={onBack}>
        <ArrowLeft /> Back to table
      </button>

      <div className="team-title">
        <div>
          <p className="eyebrow">Rank #{me.rank} · {me.manager}</p>
          <h1>{me.name}</h1>
        </div>
        <div className="score-badge">
          <span>GW score</span>
          <strong className="numeric">{me.gw}</strong>
        </div>
      </div>

      <div className="segmented view-toggle" role="group" aria-label="Squad view">
        <button
          type="button"
          className={view === 'pitch' ? 'active' : ''}
          onClick={() => setView('pitch')}
        >
          <Users /> Pitch
        </button>
        <button
          type="button"
          className={view === 'list' ? 'active' : ''}
          onClick={() => setView('list')}
        >
          <List /> List
        </button>
      </div>

      {view === 'pitch' ? (
        <div className="pitch" aria-label="Tactical lineup">
          {pitchLines.map((line) => (
            <div className="pitch-line" key={line.pos}>
              {line.players.map((p) => (
                <PlayerCard key={p.name} item={p} onClick={() => setSelected(p)} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="compact-list">
          {starters.map((p, i) => (
            <button type="button" key={p.name} onClick={() => setSelected(p)}>
              <span>{i + 1}</span>
              <span className="shirt mini-shirt">{p.clubCode}</span>
              <span>
                <strong>{p.name}</strong>
                <small>
                  {p.pos} · {p.club}
                </small>
              </span>
              <b className="numeric">{p.points}</b>
            </button>
          ))}
        </div>
      )}

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

      {selected && <PlayerModal item={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}