import { useCallback, useEffect, useRef } from 'react'

/**
 * Modal chrome shared by the player and fixture-ownership dialogs.
 *
 * Adds the two things a local `useState` modal cannot do on its own:
 *   1. a history entry, so mobile Back closes the modal instead of leaving the
 *      page underneath (X / Escape / backdrop also route through `close`)
 *   2. a body scroll lock that restores the exact scroll position on close
 *
 * A marker id (rather than a boolean) distinguishes our own entry from a stale
 * marker left in `history.state` by a reload, so opening a modal later in that
 * session cannot accidentally call `history.back()` out of the app.
 */
let lastMarker = null
let markerSeq = 0

export function useModalChrome(onClose) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const scrollY = window.scrollY
    const { body } = document
    const previousOverflow = body.style.overflow
    const previousPaddingRight = body.style.paddingRight
    const scrollbarGap = window.innerWidth - document.documentElement.clientWidth

    body.style.overflow = 'hidden'
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`

    // StrictMode re-runs this effect in development. Reuse the marker we just
    // pushed rather than stacking a second no-op history entry.
    if (!(window.history.state?.ffMarker && window.history.state.ffMarker === lastMarker)) {
      if (window.history.state?.ffMarker) {
        window.history.replaceState({ ...window.history.state, ffMarker: null }, '')
      }
      markerSeq += 1
      lastMarker = `${Date.now()}-${markerSeq}`
      // Keep the router's own state (usr/key/idx) on the new entry and give it
      // a fresh key, so a reload while the sheet is open cannot desynchronise
      // the router's history index.
      const base = window.history.state || {}
      const idx = typeof base.idx === 'number' ? base.idx + 1 : 0
      window.history.pushState(
        { ...base, key: `ff-modal-${lastMarker}`, idx, ffMarker: lastMarker },
        ''
      )
    }

    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      window.removeEventListener('popstate', onPop)
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPaddingRight
      // Wait for the parent to unmount the dialog before restoring, then put
      // the page back exactly where it was before the modal opened.
      window.requestAnimationFrame(() => window.scrollTo(0, scrollY))
    }

    const onPop = () => {
      finish()
      onCloseRef.current?.()
    }

    window.addEventListener('popstate', onPop)
    return () => {
      finish()
    }
  }, [])

  return useCallback(() => {
    if (window.history.state?.ffMarker) window.history.back()
    else onCloseRef.current?.()
  }, [])
}
