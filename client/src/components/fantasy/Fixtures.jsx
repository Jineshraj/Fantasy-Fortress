import { useState } from 'react'
import { CalendarClock, Tv } from 'lucide-react'
import { fixtures } from '@/data/mock-fantasy'
import { cn } from '@/lib/utils'

export function Fixtures() {
  const [mode, setMode] = useState('upcoming')
  const filtered = fixtures.filter((f) =>
    mode === 'upcoming' ? f.score === null : f.score !== null,
  )

  return (
    <section className="page-section">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Matchday schedule</p>
          <h1>Fixtures</h1>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Fixture period">
        <button
          type="button"
          className={mode === 'upcoming' ? 'active' : ''}
          onClick={() => setMode('upcoming')}
        >
          Upcoming
        </button>
        <button
          type="button"
          className={mode === 'results' ? 'active' : ''}
          onClick={() => setMode('results')}
        >
          Results
        </button>
      </div>

      <div className="fixtures-list">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <CalendarClock />
            <strong>No {mode} matches</strong>
            <p>Fixtures will appear here after the next sync.</p>
          </div>
        ) : (
          filtered.map((f) => {
            const isFinal = f.score !== null
            return (
              <article key={f.id} className={cn('fixture-card', isFinal && 'final')}>
                <div className="fixture-meta">
                  <span className="fixture-kickoff">
                    {isFinal ? `GW ${f.gw} · FT` : `GW ${f.gw} · ${f.kickoff}`}
                  </span>
                  {!isFinal && (
                    <span className="fixture-status">
                      <CalendarClock /> Upcoming
                    </span>
                  )}
                  {isFinal && (
                    <span className="fixture-status">
                      <Tv /> Full time
                    </span>
                  )}
                </div>
                <div className="fixture-teams">
                  <div className="fixture-side home">
                    <span className="shirt mini-shirt">{f.home}</span>
                    <strong>{f.homeName}</strong>
                  </div>
                  <div className="fixture-score">
                    {f.score ? (
                      <>
                        <strong className="numeric">{f.score[0]}</strong>
                        <i>–</i>
                        <strong className="numeric">{f.score[1]}</strong>
                      </>
                    ) : (
                      <span className="vs">VS</span>
                    )}
                  </div>
                  <div className="fixture-side away">
                    <strong>{f.awayName}</strong>
                    <span className="shirt mini-shirt">{f.away}</span>
                  </div>
                </div>
              </article>
            )
          })
        )}
      </div>
    </section>
  )
}