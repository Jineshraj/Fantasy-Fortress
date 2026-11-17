import { useEffect, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { PREFETCH_STEPS } from '@/data/live'
import { BRAND } from '@/config/brand'
import { BrandLogo } from './BrandLogo'

/**
 * Loading gate, not a decorative timer. Renders the real prefetch progress so
 * the bar tracks actual network work. The bar fills for the critical tier (the
 * league table) only — background tiers keep warming after the hub opens, so
 * 100% must mean "the screen you are about to see is ready", not "everything
 * has finished". There is no forced cut-off: a slow network keeps this screen
 * up until Tier 1 settles or genuinely fails.
 */
export function Splash({ done = [], failed = [] }) {
  const critical = PREFETCH_STEPS.filter((s) => s.critical)
  const criticalComplete = critical.filter(
    (s) => done.includes(s.key) || failed.includes(s.key)
  ).length
  const pct = critical.length ? Math.round((criticalComplete / critical.length) * 100) : 100

  // A calm "still working" note after 10s. It never implies failure.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 10000)
    return () => clearTimeout(t)
  }, [])

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

      {slow && (
        <p className="boot-note" role="status">
          Still warming up — a slow connection can take a few more seconds.
        </p>
      )}

      <div className="loading-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ transform: `scaleX(${Math.max(pct, 4) / 100})` }} />
      </div>
    </main>
  )
}
