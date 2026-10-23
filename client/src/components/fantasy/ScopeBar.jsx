import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Contextual gameweek stepper.
 *
 * One global week for the whole hub, but only on screens whose content is
 * actually gameweek-scoped. On `/table` in Overall mode, and on the H2H / Super
 * Cup competition screens, the bar is not mounted at all — a control that does
 * nothing is worse than no control.
 *
 * The persistent bar is a 34px pill: `‹ GW 6 ▾ ›`. Paging weeks stays in the
 * URL with `replace: true`, so three back-steps never cost three Back presses.
 */
export function ScopeBar({ gw, latestGw, onChange, gameweeks = [], visible = true }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const toggleRef = useRef(null)
  const menuRef = useRef(null)

  const maxGw = latestGw || 1
  const canPrev = gw > 1
  const canNext = gw < maxGw
  const isLatest = gw >= maxGw
  const weeks = (
    gameweeks.length > 1 ? gameweeks : Array.from({ length: maxGw }, (_, i) => i + 1)
  )
    .slice()
    .sort((a, b) => b - a)

  // Close on outside pointer-down and Escape; focus returns to the pill so a
  // keyboard user never lands back at the top of the document.
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open) menuRef.current?.querySelector('button')?.focus()
  }, [open])

  if (!visible) return null

  const step = (delta) => {
    const next = gw + delta
    if (next < 1 || next > maxGw) return
    setOpen(false)
    onChange(next)
  }

  const select = (week) => {
    setOpen(false)
    onChange(week)
    toggleRef.current?.focus()
  }

  return (
    <div className="scope-bar">
      <span className="scope-label">
        {/* §4.2 — "GAMEWEEK" where there is room, "GW" where there is not.
            The full word stays in the DOM so the accessible name never shrinks. */}
        <span className="scope-label-full">Gameweek</span>
        <span className="scope-label-short" aria-hidden="true">GW</span>
      </span>

      <div className="gw-pill-wrap" ref={wrapRef}>
        <div className="gw-pill">
          <button
            type="button"
            className="gw-step"
            aria-label="Previous gameweek"
            disabled={!canPrev}
            onClick={() => step(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>

          <button
            type="button"
            ref={toggleRef}
            className="gw-pill-label"
            aria-expanded={open}
            aria-controls="gw-menu"
            aria-haspopup="menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="numeric" aria-live="polite" aria-atomic="true">
              GW {gw}
            </span>
            <ChevronDown aria-hidden="true" />
          </button>

          <button
            type="button"
            className="gw-step"
            aria-label="Next gameweek"
            disabled={!canNext}
            onClick={() => step(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        {open && (
          <div id="gw-menu" className="gw-menu" role="menu" ref={menuRef}>
            {weeks.map((week) => (
              <button
                key={week}
                type="button"
                role="menuitemradio"
                aria-checked={week === gw}
                onClick={() => select(week)}
              >
                GW {week}
              </button>
            ))}
            {!isLatest && (
              <button
                type="button"
                role="menuitem"
                className="gw-latest"
                onClick={() => select(maxGw)}
              >
                Latest · GW {maxGw}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
