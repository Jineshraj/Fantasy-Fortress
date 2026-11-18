import { useLayoutEffect, useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scroll behaviour for a client-side router:
 *   - a new screen resets to the top
 *   - changing only the query string (?gw=, ?view=) leaves scroll alone
 *   - Back/forward restores the position the user actually left
 *
 * React Router does not do this for you. Without it, going back from a team
 * page dumps you at the top of a long league table.
 *
 * Positions are keyed by the history entry's `key`, not by pathname: two visits
 * to the same URL are different entries and each keeps its own position. The
 * map is mirrored into sessionStorage so a refresh followed by Back can still
 * restore the place the user was reading.
 */
const STORAGE_KEY = 'ff:scroll-positions'
const MAX_ENTRIES = 60

const loadPositions = () => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return new Map()
    return new Map(Object.entries(parsed).slice(-MAX_ENTRIES))
  } catch {
    return new Map()
  }
}

const positions = loadPositions()

const persist = () => {
  try {
    const entries = [...positions.entries()].slice(-MAX_ENTRIES)
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    /* storage unavailable — in-memory positions still work for this page */
  }
}

const save = (key, y) => {
  if (!key) return
  if (positions.get(key) === y) return
  positions.set(key, y)
  persistSoon()
}

const read = (key) => (key && positions.has(key) ? positions.get(key) : null)

// Persisting every scroll frame would JSON.stringify the whole map at 60fps.
// Keep the map authoritative in memory and write it at most a few times a
// second; pagehide/unmount flush immediately.
let persistTimer = null
const persistSoon = () => {
  if (persistTimer !== null) return
  persistTimer = window.setTimeout(() => {
    persistTimer = null
    persist()
  }, 250)
}

/**
 * Scroll to `y`, re-applying for a short window because the target screen often
 * renders its data after the route changes. The clamp keeps a short skeleton
 * from capping the position before the real list has grown underneath it.
 */
const restore = (y, token, tokenRef) => {
  let attempts = 0

  const stop = () => {
    window.removeEventListener('wheel', cancel)
    window.removeEventListener('touchstart', cancel)
    window.removeEventListener('keydown', cancel)
  }

  // The moment the user takes over, stop re-applying — a late retry must never
  // drag the page away from where they intentionally scrolled.
  const cancel = () => {
    tokenRef.current += 1
    stop()
  }

  window.addEventListener('wheel', cancel, { passive: true })
  window.addEventListener('touchstart', cancel, { passive: true })
  window.addEventListener('keydown', cancel)

  const apply = () => {
    if (token !== tokenRef.current) {
      stop()
      return
    }
    const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    const target = Math.min(y, maxY)
    window.scrollTo(0, target)

    const settled = Math.abs(window.scrollY - target) < 2 && maxY >= y - 2
    attempts += 1
    if (settled || attempts >= 40) {
      stop()
      return
    }
    window.setTimeout(apply, attempts < 4 ? 40 : 120)
  }

  apply()
}

export function ScrollRestoration() {
  const { pathname, key } = useLocation()
  const navType = useNavigationType()

  const current = useRef({ key, pathname })
  // Last known real scroll offset. Read from a ref (not window.scrollY) when
  // leaving a screen: once the new, shorter route has mounted, the browser may
  // already have clamped scrollY for the old position.
  const lastY = useRef(typeof window === 'undefined' ? 0 : window.scrollY)
  const restoreToken = useRef(0)
  const firstRun = useRef(true)

  // Persist the position continuously (throttled to a frame) so a refresh, a
  // pagehide, or a hard navigation never loses the last place.
  useEffect(() => {
    let frame = null
    const saveNow = () => {
      frame = null
      save(current.current.key, lastY.current)
    }
    const onScroll = () => {
      lastY.current = window.scrollY
      if (frame === null) frame = window.requestAnimationFrame(saveNow)
    }
    const onHide = () => {
      save(current.current.key, lastY.current)
      persist()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', onHide)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pagehide', onHide)
      if (frame !== null) window.cancelAnimationFrame(frame)
      save(current.current.key, lastY.current)
      persist()
    }
  }, [])

  // The browser's own restoration fights the async re-apply above.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.history) return undefined
    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = 'manual'
    return () => {
      window.history.scrollRestoration = previous
    }
  }, [])

  useLayoutEffect(() => {
    const previous = current.current
    const pathChanged = previous.pathname !== pathname

    // Save the outgoing entry under its own key before moving away from it.
    if (!firstRun.current && previous.key !== key) {
      save(previous.key, lastY.current)
    }

    current.current = { key, pathname }
    firstRun.current = false

    if (navType === 'POP') {
      const y = read(key)
      if (y != null) {
        lastY.current = y
        const token = ++restoreToken.current
        restore(y, token, restoreToken)
      } else {
        lastY.current = 0
        restoreToken.current += 1
        window.scrollTo(0, 0)
      }
      return
    }

    // A query-string change (?gw=, ?view=) is a view option on the same
    // screen, not a new screen. Leave the scroll exactly where it is, but
    // remember it under the new history key so a refresh keeps the place.
    const y = pathChanged ? 0 : lastY.current
    save(key, y)
    if (pathChanged) {
      lastY.current = 0
      restoreToken.current += 1
      window.scrollTo(0, 0)
    }
  }, [pathname, key, navType])

  return null
}
