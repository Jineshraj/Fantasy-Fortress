import { useCallback, useEffect, useRef, useState } from 'react'
import { isImageBroken, markImageBroken } from '@/data/live'
import { cn } from '@/lib/utils'

/**
 * A layered image with a fallback underneath.
 *
 * The fallback (initials avatar, CSS shirt, SVG shield) is only painted *until*
 * an image actually loads. That matters because the crests are transparent PNGs
 * — leaving the opaque fallback behind them shows a coloured rectangle through
 * every transparent pixel.
 *
 * Candidates are tried in order. A 404 is recorded for the session (via
 * `markImageBroken`) and the next candidate is tried; remounting starts past
 * candidates already known to be missing.
 */
export function LayeredMedia({
  candidates = [],
  fallback = null,
  className = '',
  imgClassName = 'media-img',
  resetKey = '',
  alt = '',
  style,
}) {
  const [idx, setIdx] = useState(() => Math.max(0, candidates.findIndex((c) => !isImageBroken(c))))
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef(null)

  // Skip candidates that already failed this session.
  useEffect(() => {
    setIdx(Math.max(0, candidates.findIndex((c) => !isImageBroken(c))))
    setLoaded(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  const src = candidates[idx]
  const exhausted = idx >= candidates.length

  // A cached image can finish decoding before React attaches onLoad, which
  // would leave the fallback painted underneath forever. Check `complete` on
  // every mount as well as listening for the event.
  const attach = useCallback((node) => {
    imgRef.current = node
    if (node && node.complete && node.naturalWidth > 0) setLoaded(true)
  }, [])

  return (
    <span className={cn('media', className, loaded && 'has-media')} style={style} aria-hidden="true">
      <span className="media-fallback">{fallback}</span>
      {!exhausted && src && (
        <img
          ref={attach}
          className={imgClassName}
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => {
            markImageBroken(src)
            setLoaded(false)
            setIdx((i) => i + 1)
          }}
        />
      )}
    </span>
  )
}