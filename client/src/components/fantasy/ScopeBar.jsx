import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * One global gameweek scope for the whole hub. Every data screen reads from
 * here, so "which week am I looking at" has exactly one answer and one location.
 *
 * Not rendered on the competition screens (H2H / Super Cup) — those are keyed to
 * their own fixed stage gameweeks, so a global week control there would be a
 * control that does nothing.
 */
export function ScopeBar({ gw, latestGw, onChange, gameweeks = [] }) {
  const maxGw = latestGw || 1
  const canPrev = gw > 1
  const canNext = gw < maxGw
  const isLatest = gw >= maxGw
  const weeks = gameweeks.length > 1 ? gameweeks : Array.from({ length: maxGw }, (_, i) => i + 1)

  return (
    <div className="scope-bar">
      <span className="scope-label">Gameweek</span>

      <div className="scope-stepper">
        <button
          type="button"
          onClick={() => canPrev && onChange(gw - 1)}
          disabled={!canPrev}
          aria-label="Previous gameweek"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <strong className="numeric" aria-live="polite" aria-atomic="true">
          {gw}
        </strong>
        <button
          type="button"
          onClick={() => canNext && onChange(gw + 1)}
          disabled={!canNext}
          aria-label="Next gameweek"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className="scope-chips" role="group" aria-label="Jump to gameweek">
        {weeks.map((g) => (
          <button
            key={g}
            type="button"
            className={cn(g === gw && 'active')}
            aria-pressed={g === gw}
            aria-current={g === gw ? 'true' : undefined}
            onClick={() => onChange(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {!isLatest && (
        <button type="button" className="scope-latest" onClick={() => onChange(maxGw)}>
          Latest · {maxGw}
        </button>
      )}
    </div>
  )
}