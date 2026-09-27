export function Crest({ compact = false, size = 'lg' }) {
  const dim = compact ? 40 : 92
  const labelSize = compact ? 11 : 24
  const stroke = compact ? 3 : 4
  const dotR = compact ? 1.6 : 4

  return (
    <span
      className="crest-mark"
      style={{ width: dim, height: dim }}
      aria-label="Sunday League Society crest"
      role="img"
    >
      <svg viewBox="0 0 100 110" width={dim} height={dim} aria-hidden="true">
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
          SLS
        </text>
        <circle cx="50" cy="92" r={dotR} fill="#25003d" />
      </svg>
    </span>
  )
}