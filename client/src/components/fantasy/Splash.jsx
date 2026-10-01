import { Check, Loader2 } from 'lucide-react'
import { PREFETCH_STEPS } from '@/data/live'
import { BRAND } from '@/config/brand'
import { BrandLogo } from './BrandLogo'

/**
 * Loading gate, not a decorative timer. Renders the real prefetch progress so
 * the bar tracks actual network work. Held open by the parent for a minimum
 * time so the crest animation doesn't flash, and force-completed after a
 * maximum so a slow network can never trap the user here.
 */
export function Splash({ done = [], failed = [] }) {
  const total = PREFETCH_STEPS.length
  const complete = done.length + failed.length
  const pct = Math.round((complete / total) * 100)

  return (
    <main className="splash">
      <div className="pulse-crest">
        <BrandLogo />
      </div>
      <div>
        <p className="eyebrow">{BRAND.full}</p>
        <h1>Entering the league hub</h1>
      </div>

      <ul className="boot-steps" aria-live="polite">
        {PREFETCH_STEPS.map((step) => {
          const isDone = done.includes(step.key)
          const isFailed = failed.includes(step.key)
          return (
            <li key={step.key} className={isDone ? 'ok' : isFailed ? 'bad' : 'pending'}>
              <span className="boot-step-icon" aria-hidden="true">
                {isDone ? <Check /> : isFailed ? '!' : <Loader2 className="spin" />}
              </span>
              {step.label}
              {isFailed && <em>skipped</em>}
            </li>
          )
        })}
      </ul>

      <div className="loading-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ transform: `scaleX(${Math.max(pct, 4) / 100})` }} />
      </div>
    </main>
  )
}
