import { Crest } from './Crest'

export function Splash() {
  return (
    <main className="splash">
      <div className="pulse-crest">
        <Crest />
      </div>
      <div>
        <p className="eyebrow">Matchday 14</p>
        <h1>Entering the league hub</h1>
      </div>
      <div className="loading-track">
        <span />
      </div>
    </main>
  )
}