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
 * Order is fixed: state/captain badges → headshot → surname → opponent →
 * points. The four lineup states are driven by the stored `role`; nothing is
 * inferred in the UI.
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
  const stateBadge = state && state !== 'STARTER' ? STATE_BADGE[state] : null
  const gold = captainBadge(ccy)
  const points = effectivePoints ?? item?.points

  const isSubOut = state === 'AUTO_SUB_OUT'
  const isSubIn = state === 'AUTO_SUB_IN'
  const posKey = item?.pos ? item.pos.toLowerCase() : ''

  return (
    <button
      type="button"
      className={cn(
        'player-card',
        posKey && `player-card--${posKey}`,
        compact && 'player-compact',
        isSubOut && 'player-card--out',
        isSubIn && 'player-card--in',
        state === 'BENCH_UNUSED' && 'player-card--unused'
      )}
      onClick={onClick}
      aria-label={`${item?.name ?? 'Player'}${gold ? `, ${gold.aria}` : ''}${
        isSubOut ? ', Substituted out' : isSubIn ? ', Substituted in' : ''
      }, ${points ?? 0} points`}
    >
      <span className="player-top">
        <span className={cn('position-tag', posKey && `pos-${posKey}`)}>{item.pos}</span>
        {gold && (
          <span className={cn('player-state-badge', gold.className)} title={gold.aria}>
            {gold.label}
          </span>
        )}
      </span>

      <PlayerPhoto player={item} />

      <strong>{item.short || item.name}</strong>

      <span className="player-opponent">
        {opp ? `${opp.code} ${opp.venue === 'home' ? '(H)' : '(A)'}` : '—'}
      </span>

      <span className="player-bottom">
        {isSubOut ? (
          <span className="player-state-badge badge-auto-out">OUT</span>
        ) : isSubIn ? (
          <>
            <span className="player-state-badge badge-auto-in">IN</span>
            <b className={cn('numeric player-points', Number(points) < 0 && 'is-negative')}>
              {points ?? '—'}
            </b>
          </>
        ) : (
          <b className={cn('numeric player-points', Number(points) < 0 && 'is-negative')}>
            {points ?? '—'}
          </b>
        )}
      </span>
    </button>
  )
}
