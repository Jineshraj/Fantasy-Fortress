import { LayeredMedia } from './Media'
import { BRAND, LOGO_SRC } from '@/config/brand'

/**
 * The league crest.
 *
 * The real logo is layered on top; the SVG shield is the fallback and still
 * paints if the logo file is missing or fails to load, so the header never
 * collapses to empty space.
 *
 * Sizing note: the crest is portrait with a baked-in "FANTASY FORTRESS"
 * wordmark. The wordmark is only legible at the large sizes, so the header
 * uses `compact` (which just shows the mark reading as a crest) while the
 * access and splash screens use the full size.
 *
 * The old shield read "SLS" (Sunday League Society) — the fallback now reads
 * the current initials.
 */
export function BrandLogo({ compact = false }) {
  const size = compact ? 34 : 128
  const shieldDim = compact ? 40 : 92
  const labelSize = compact ? 11 : 24
  const stroke = compact ? 3 : 4
  const dotR = compact ? 1.6 : 4
  const initials = BRAND.name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

  return (
    <LayeredMedia
      candidates={[LOGO_SRC]}
      resetKey={LOGO_SRC}
      className="brand-logo"
      style={{ width: size, height: size }}
      imgClassName="brand-logo-img"
      fallback={
        <svg viewBox="0 0 100 110" width={shieldDim} height={shieldDim} aria-hidden="true">
          <polygon
            points="50,4 92,22 92,72 50,106 8,72 8,22"
            fill="#39ff91"
            stroke="#25003d"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <polygon
            points="50,4 92,22 50,40"
            fill="#00d9ff"
            stroke="#25003d"
            strokeWidth={stroke}
            strokeLinejoin="round"
          />
          <line x1="8" y1="40" x2="92" y2="40" stroke="#25003d" strokeWidth={stroke} />
          <text
            x="50"
            y="76"
            textAnchor="middle"
            fontFamily="var(--font-heading)"
            fontWeight="800"
            fontSize={labelSize}
            fill="#25003d"
            letterSpacing="-1"
          >
            {initials}
          </text>
          <circle cx="50" cy="92" r={dotR} fill="#25003d" />
        </svg>
      }
    />
  )
}