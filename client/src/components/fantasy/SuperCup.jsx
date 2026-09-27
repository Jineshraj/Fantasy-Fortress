import { Crown, Sparkles } from 'lucide-react'
import { superCup } from '@/data/mock-fantasy'
import { cn } from '@/lib/utils'

const initials = (name) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

function BracketMatch({ match, isFinal }) {
  const aWins = match.winner === 'a'
  const bWins = match.winner === 'b'

  return (
    <div className={cn('bracket-match', isFinal && 'bracket-final-match')}>
      <div className={cn('bracket-side', aWins && 'winner', bWins && 'loser')}>
        <span className="avatar">{initials(match.a)}</span>
        <strong>{match.a}</strong>
        <b className="numeric">{match.aScore ?? '–'}</b>
      </div>
      <div className={cn('bracket-side', bWins && 'winner', aWins && 'loser')}>
        <span className="avatar">{initials(match.b)}</span>
        <strong>{match.b}</strong>
        <b className="numeric">{match.bScore ?? '–'}</b>
      </div>
    </div>
  )
}

export function SuperCup() {
  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Knockout tournament</p>
          <h1>{superCup.title}</h1>
        </div>
        <div className="update-note">
          <Sparkles /> {superCup.rounds[0].matches.length * 2} managers · 1 trophy
        </div>
      </div>

      <div className="cup-hero">
        <Crown />
        <div>
          <strong>Glory · Bragging rights</strong>
          <p>Top 4 after the group stage face off in a single-elimination bracket.</p>
        </div>
      </div>

      <div className="bracket">
        {superCup.rounds.map((round, idx) => (
          <div className="bracket-round" key={round.name}>
            <div className="bracket-round-head">
              <span className="eyebrow">Round {idx + 1}</span>
              <h2>{round.name}</h2>
            </div>
            <div className="bracket-round-matches">
              {round.matches.map((m) => (
                <BracketMatch key={m.id} match={m} isFinal={round.name === 'Final'} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}