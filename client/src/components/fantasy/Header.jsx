import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronDown, RefreshCw, Swords, Trophy } from 'lucide-react'
import { BrandLogo } from './BrandLogo'
import { BRAND } from '@/config/brand'
import { ROUTES } from '@/lib/routes'
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
  onRefresh,
  refreshing = false,
  competitions = [],
  onCompetition,
  activeCompetition,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const gw = searchParams.get('gw')
  const homeTo = gw ? `${ROUTES.table}?gw=${gw}` : ROUTES.table
  const activeComp = competitions.find((c) => c.id === activeCompetition) ?? null

  // §4.1 — on narrow phones the stamp collapses to just its age. The full
  // string stays in the DOM (visually hidden, still announced), so no state is
  // lost and no accessible title is dropped.
  const stampShort = stamp && (stamp.includes('·') ? stamp.slice(stamp.indexOf('·') + 1).trim() : stamp)

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

  // The header sits outside <Routes>, so it never unmounts. Close the menu on
  // any navigation (the old page's dropdown used to hang over the new one) and
  // on scroll, since it is anchored to a sticky bar.
  useEffect(() => {
    setOpen(false)
  }, [location.pathname, location.search])

  useEffect(() => {
    if (!open) return undefined
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [open])

  return (
    <header className="topbar">
      <Link to={homeTo} className="brand" aria-label={`${BRAND.name} — league table`}>
        <BrandLogo compact />
        <span className="brand-name">
          <strong className="brand-title">{BRAND.name}</strong>
          <em className="brand-season">{BRAND.season}</em>
        </span>
      </Link>

<div className="topbar-right" ref={ref}>
        {onRefresh && (
          <button
            type="button"
            className="icon-button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label={refreshing ? 'Refreshing data' : 'Refresh data'}
            title="Check for a newer sync"
          >
            <RefreshCw aria-hidden="true" className={refreshing ? 'spin' : ''} />
          </button>
        )}

        {stamp && (
          <div
            className={cn('sync-stamp', stampStale && 'stale')}
            title={stampStale ? 'Last sync looks out of date — the nightly job may have stopped' : stamp}
          >
            <span className="sync-stamp-full">{stamp}</span>
            <span className="sync-stamp-short" aria-hidden="true">{stampShort}</span>
          </div>
        )}

        {competitions.length > 0 && (
          <div className="comp-menu">
            <button
              type="button"
              className="comp-trigger"
              aria-haspopup="menu"
              aria-expanded={open}
              data-active={activeCompetition ? 'true' : undefined}
              onClick={() => setOpen((v) => !v)}
            >
              <Trophy aria-hidden="true" />
              <span className="visually-hidden">Competitions</span>
              <span className="comp-label-full">{activeComp ? activeComp.label : 'Comps'}</span>
              <span className="comp-label-short" aria-hidden="true">
                {activeComp ? activeComp.short || activeComp.label : 'Comps'}
              </span>
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
                      aria-current={activeCompetition === id ? 'true' : undefined}
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
