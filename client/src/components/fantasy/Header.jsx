import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Swords, Trophy } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { BRAND } from '@/config/brand'
import { cn } from '@/lib/utils'

// Used only if a competition arrives without an Icon, so the dropdown can never
// crash on an undefined component type.
const COMPETITION_ICONS = { 'h2h': Swords, supercup: Trophy }

/**
 * The six-tab bottom bar was cramped, so H2H and Cup moved up here. They are
 * secondary to the weekly loop (table → squad → fixtures → stats) but stay one
 * tap away. Competitions are real routes, so they render as buttons that
 * navigate — `active` is matched by the parent's current path.
 */
export function Header({
  stamp,
  stampStale = false,
  competitions = [],
  onCompetition,
  activeCompetition,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <header className="topbar">
<div className="brand">
        <BrandLogo compact />
        <span className="brand-name">
          <strong className="brand-title">{BRAND.name}</strong>
          <em className="brand-season">{BRAND.season}</em>
        </span>
      </div>

      <div className="topbar-right" ref={ref}>
        {stamp && (
          <div
            className={cn('sync-stamp', stampStale && 'stale')}
            title={stampStale ? 'Last sync looks out of date — the nightly job may have stopped' : undefined}
          >
            {stamp}
          </div>
        )}

        {competitions.length > 0 && (
          <div className="comp-menu">
            <button
              type="button"
              className="comp-trigger"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <Trophy aria-hidden="true" />
              <span>Comps</span>
              <ChevronDown aria-hidden="true" className={open ? 'rotated' : ''} />
            </button>
            {open && (
              <div className="comp-dropdown" role="menu">
                {competitions.map(({ id, label, Icon }) => {
                  const Fallback = COMPETITION_ICONS[id] || Trophy
                  const Glyph = Icon || Fallback
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      className={activeCompetition === id ? 'active' : ''}
                      onClick={() => {
                        onCompetition(id)
                        setOpen(false)
                      }}
                    >
                      {Glyph ? <Glyph aria-hidden="true" /> : null}
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
