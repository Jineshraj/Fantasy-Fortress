import { cn } from '@/lib/utils'
import { PlayerPhoto } from './Imagery'

const STATE_BADGE = {
  AUTO_SUB_OUT: { className: 'badge-auto-out', label: 'OUT' },
  AUTO_SUB_IN: { className: 'badge-auto-in', label: 'IN' },
  BENCH_UNUSED: { className: 'badge-neutral', label: 'UNUSED' },
}

const captainBadge = (captaincy) => {
  if (!captaincy) return null
  if (captaincy.designation === 'C') {
    return {
      className: captaincy.handedOver ? 'badge-captain-handover' : 'badge-captain',
      label: 'C',
      aria: captaincy.handedOver
        ? 'Vice-captain; inherited captaincy; two times multiplier'
        : 'Captain; two times multiplier',
    }
  }
  if (captaincy.designation === 'VC') {
    return { className: 'badge-vice', label: 'VC', aria: 'Vice-captain' }
  }
  return null
}

/**
 * One player on the pitch or the bench.
 *
 * Design 1 Collectible Style + Neo-Brutalist Micro-Details:
 * - Golden Captain Card with [x2] multiplier
 * - Diagonal-hatched subbed OUT state
 * - Venue micro-chips ([H] / [A])
 * - Event/Bonus lightning bolt badge (⚡)
 * - Split bottom deck [ FIXTURE | POINTS ]
 */
export function PlayerCard({
  item,
  onClick,
  compact = false,
  displayState,
  captaincy,
  opponent,
  effectivePoints,
}) {
  const state = displayState ?? item?.displayState
  const ccy = captaincy ?? item?.captaincy
  const opp = opponent ?? item?.opponent
  const gold = captainBadge(ccy)
  const points = effectivePoints ?? item?.points

  const isCaptain = ccy?.designation === 'C' || item?.multiplier === 2
  const isVice = ccy?.designation === 'VC'
  const isSubOut = state === 'AUTO_SUB_OUT'
  const isSubIn = state === 'AUTO_SUB_IN'
  const posKey = item?.pos ? item.pos.toLowerCase() : ''
  const ptsNum = Number(points)
  const isHaul = !isNaN(ptsNum) && ptsNum >= 6
  const isNegative = !isNaN(ptsNum) && ptsNum < 0

  const hasOpp = Boolean(opp?.code)
  const isHome = opp?.venue === 'home'
  const hasStadiumBonus = Boolean(item?.stadiumBonus && Number(item.stadiumBonus) > 0)
  const yetToPlay = Boolean(item?.yetToPlay)

  return (
    <button
      type="button"
      className={cn(
        'player-card-unit',
        posKey && `pos-${posKey}`,
        isCaptain && 'is-captain',
        isVice && 'is-vice',
        compact && 'is-bench',
        isSubOut && 'is-sub-out',
        isSubIn && 'is-sub-in',
        state === 'BENCH_UNUSED' && 'is-bench-unused'
      )}
      onClick={onClick}
      aria-label={`${item?.name ?? 'Player'}${gold ? `, ${gold.aria}` : ''}${
        isSubOut ? ', Substituted out' : isSubIn ? ', Substituted in' : ''
      }, ${yetToPlay ? 'Yet to play' : `${points ?? 0} points`}`}
    >
      <div className="player-avatar-disk">
        <span className="player-info-dot" title="Player info" aria-hidden="true">
          i
        </span>
        {gold && (
          <span className={cn('player-cap-dot', gold.className, isVice && 'vc')} title={gold.aria}>
            {gold.label}
          </span>
        )}
        <div className="player-photo-circle">
          <PlayerPhoto player={item} />
        </div>
        {hasStadiumBonus && (
          <span
            className="player-event-bolt"
            title={`Stadium bonus: +${item.stadiumBonus} pt${Number(item.stadiumBonus) > 1 ? 's' : ''}`}
            aria-label="Stadium bonus"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M13 2 4 14h6l-1 8 9-12h-6z" fill="#1a0033" />
            </svg>
          </span>
        )}
      </div>

      <div className="player-plaque">
        <div className="player-name-wrap">
          <strong className="player-name">{item.short || item.name}</strong>
        </div>

        <div className="player-split-bar">
          <span className="player-fixture-cell">
            {hasOpp ? (
              <>
                <span className="fixture-code">{opp.code}</span>
                <span className={cn('venue-chip', isHome ? 'is-home' : 'is-away')}>
                  {isHome ? 'H' : 'A'}
                </span>
              </>
            ) : (
              '—'
            )}
          </span>
          {isSubOut ? (
            <span className="player-points-cell is-out">OUT</span>
          ) : isSubIn ? (
            <span className={cn('player-points-cell is-in', isHaul && 'is-haul')}>
              <small>IN</small>
              <b>{points ?? '—'}</b>
            </span>
          ) : yetToPlay ? (
            <span
              className="player-points-cell is-yet-to-play"
              title="Yet to play"
              aria-label="Yet to play"
            >
              YTP
            </span>
          ) : (
            <span
              className={cn(
                'player-points-cell',
                isHaul && 'is-haul',
                isNegative && 'is-negative'
              )}
            >
              {points ?? '—'}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
