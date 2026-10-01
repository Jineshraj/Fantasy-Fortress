import { useCallback, useEffect, useState } from 'react'
import { Crown, Sparkles } from 'lucide-react'
import { buildSuperCup } from '@/data/live'
import { TeamMark } from './TeamMark'
import { InlineError, LoadingBlock } from '@/components/ui/states'
import { cn } from '@/lib/utils'

function BracketMatch({ match, isFinal }) {
  const aWins = match.winner === match.home
  const bWins = match.winner === match.away
  return (
    <div className={cn('bracket-match', isFinal && 'bracket-final-match')}>
      <div className={cn('bracket-side', aWins && 'winner', bWins && 'loser')}>
        {match.home ? <TeamMark name={match.home} size={32} /> : <span className="avatar">?</span>}
        <strong>{match.home || 'Winner'}</strong>
        <b className="numeric">{match.homeScore ?? '–'}</b>
      </div>
      <div className={cn('bracket-side', bWins && 'winner', aWins && 'loser')}>
        {match.away ? <TeamMark name={match.away} size={32} /> : <span className="avatar">?</span>}
        <strong>{match.away || 'Winner'}</strong>
        <b className="numeric">{match.awayScore ?? '–'}</b>
      </div>
    </div>
  )
}

export function SuperCup() {
  const [state, setState] = useState({ status: 'loading', cup: null, error: null })

  const load = useCallback(() => {
    setState({ status: 'loading', cup: null, error: null })
    buildSuperCup()
      .then((cup) => setState({ status: 'ready', cup, error: null }))
      .catch((err) => setState({ status: 'error', cup: null, error: err?.message }))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const rounds = state.cup?.rounds ?? []
  const champion = state.cup?.champion ?? null
  const settledCount = rounds.reduce((n, r) => n + r.matches.filter((m) => m.settled).length, 0)
  const totalMatches = rounds.reduce((n, r) => n + r.matches.length, 0)

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Knockout tournament · 16 teams</p>
          <h1>Super Cup</h1>
        </div>
        {state.status === 'ready' && (
          <div className="update-note">
            <Sparkles /> {settledCount}/{totalMatches} played
          </div>
        )}
      </div>

      <div className="cup-hero">
        <Crown />
        <div>
          <strong>{champion ? `Glory to ${champion}` : 'Glory · Bragging rights'}</strong>
          <p>
            Single elimination across 4 rounds — R16 (GW5), QF (GW8), SF (GW11), Final (GW15).
            Stadium bonus excluded from cup scores.
          </p>
        </div>
      </div>

      {state.status === 'loading' && <LoadingBlock label="Loading bracket" rows={6} variant="card" />}

      {state.status === 'error' && <InlineError message={state.error} onRetry={load} />}

      {state.status === 'ready' && (
        <div className="bracket">
          {rounds.map((round, idx) => (
            <div className="bracket-round" key={round.stage}>
              <div className="bracket-round-head">
                <span className="eyebrow">
                  Round {idx + 1} · GW {round.gw}
                </span>
                <h2>{round.name}</h2>
              </div>
              <div className="bracket-round-matches">
                {round.matches.map((m) => (
                  <BracketMatch key={m.id} match={m} isFinal={round.stage === 'FINAL'} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
