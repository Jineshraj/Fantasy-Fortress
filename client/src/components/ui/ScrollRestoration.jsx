import { useEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * Scroll behaviour for a client-side router:
 *   - a new navigation resets to the top
 *   - back/forward restores where the user actually was
 *
 * React Router does not do this for you. Without it, going back from a team
 * page dumps you at the top of a long league table.
 */
const POSITIONS = new Map()

export function ScrollRestoration() {
  const { pathname, search, key } = useLocation()
  const navType = useNavigationType()
  const restoring = useRef(false)

  useEffect(() => {
    const id = `${pathname}${search}`

    // Save the outgoing position before we move away from it.
    if (!restoring.current) {
      POSITIONS.set(key, window.scrollY)
    }

    if (navType === 'POP') {
      const y = POSITIONS.get(id) ?? POSITIONS.get(key) ?? 0
      restoring.current = true
      // Wait a frame so the target screen has rendered before scrolling.
      requestAnimationFrame(() => {
        window.scrollTo(0, y)
        restoring.current = false
      })
      return
    }

    window.scrollTo(0, 0)
  }, [pathname, search, key, navType])

  return null
}