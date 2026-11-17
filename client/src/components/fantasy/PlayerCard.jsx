import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { PlayerPhoto } from './Imagery'

const DEAD_FIXTURE_STATUSES = new Set([
  'POSTPONED',
  'CANCELLED',
  'CANCELED',
  'ABANDONED',
  'AWARDED',
  'VOID',
  'SUSPENDED',
])

const statusOf = (match) => String(match?.status || '').toUpperCase()

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

function FixtureBlock({ match, full = false }) {
  return (
    <span className={cn('player-fixture-cell', full && 'is-full')}>
      {match?.code ? (
        <>
          <span className="fixture-code">{match.code}</span>
          <span className={cn('venue-chip', match.venue === 'home' ? 'is-home' : 'is-away')}>
            {match.venue === 'home' ? 'H' : 'A'}
          </span>
        </>
      ) : (
        '—'
      )}
    </span>
  )
}

function PointsBlock({ value, full = false, multiplier = 1, stadiumBonus = 0 }) {
  const n = Number(value)
  const isHaul = Number.isFinite(n) && n >= 6
  const isNegative = Number.isFinite(n) && n < 0
  const bonus = Number(stadiumBonus) || 0
  return (
    <span
      className={cn(
        'player-points-cell',
        full && 'is-full',
        isHaul && 'is-haul',
        isNegative && 'is-negative'
      )}
    >
      <span className="player-points-value">
        {value === null || value === undefined ? '—' : value}
      </span>
      {full && multiplier === 2 && <span className="player-mult-tag">×2</span>}
      {full && bonus !== 0 && (
        <span className="player-bonus-tag">{bonus > 0 ? `+${bonus}` : `−${Math.abs(bonus)}`}</span>
      )}
    </span>
  )
}

function TextBlock({ label, variant = 'is-empty', full = false }) {
  return (
    <span className={cn('player-points-cell', variant, full && 'is-full')}>{label}</span>
  )
}

/**
 * One player on the pitch or the bench.
 *
 * The bottom block shows exactly one thing: the fixture while it is still to be
 * played, or the points once the nightly sync has landed. A double gameweek
 * splits the block 1fr / 1fr until both matches are finished, then collapses to
 * the authoritative `final_points` (with ×2 / stadium bonus made explicit).
 */
export function PlayerCard({
  item,
  onClick,
  compact = false,
  displayState,
  captaincy,
  opponent,
  matches: matchesProp,
}) {
  const state = displayState ?? item?.displayState
  const ccy = captaincy ?? item?.captaincy
  const opp = opponent ?? item?.opponent
  const gold = captainBadge(ccy)
  const isVice = ccy?.designation === 'VC'
  const isSubOut = state === 'AUTO_SUB_OUT'
  const isSubIn = state === 'AUTO_SUB_IN'
  const posKey = item?.pos ? item.pos.toLowerCase() : ''

  const matches = matchesProp ?? item?.matches ?? []
  const isDouble = matches.length > 1
  const multiplier = Number(item?.multiplier) === 2 ? 2 : 1
  const stadiumBonus = Number(item?.stadiumBonus) || 0
  const finalPoints = item?.finalPoints ?? null
  const hasFinalPoints = finalPoints !== null && finalPoints !== undefined
  const allFinished =
    matches.length > 0 && matches.every((m) => statusOf(m) === 'FINISHED')

  // Player played if they have registered minutes or have non-zero points
  const played =
    hasFinalPoints &&
    (Number(item?.minutes) > 0 || Number(finalPoints) !== 0)

  // Player explicitly did not play: 0 minutes and 0 points
  const didNotPlay =
    Number(item?.minutes) === 0 && Number(finalPoints) === 0

  // One cell of the bottom block (used for DGW halves and individual match blocks)
  const renderCell = (match, { full = false, pendingAsFixture = true } = {}) => {
    const status = statusOf(match)
    if (!match) return <TextBlock label="—" full={full} />
    if (DEAD_FIXTURE_STATUSES.has(status)) {
      return <TextBlock label={status === 'POSTPONED' ? 'PPD' : '—'} full={full} />
    }
    if (status === 'LIVE') return <TextBlock label="LIVE" variant="is-live" full={full} />
    if (status === 'FINISHED') {
      if (!match.breakdownAvailable) {
        return pendingAsFixture ? (
          <FixtureBlock match={match} full={full} />
        ) : (
          <TextBlock label="—" full={full} />
        )
      }
      if (!(Number(match.minutes) > 0)) return <TextBlock label="—" full={full} />
      if (match.displayPoints === null || match.displayPoints === undefined) {
        return <TextBlock label="—" full={full} />
      }
      return <PointsBlock value={match.displayPoints} full={full} />
    }
    return <FixtureBlock match={match} full={full} />
  }

  // Derive bottom block from fixture status + stats row authority
  const resolvedBottom = (() => {
    if (matches.length === 0) {
      return played ? (
        <PointsBlock
          value={finalPoints}
          full
          multiplier={multiplier}
          stadiumBonus={stadiumBonus}
        />
      ) : (
        <TextBlock label="—" full />
      )
    }

    if (isDouble) {
      if (allFinished) {
        if (played) {
          return (
            <PointsBlock
              value={finalPoints}
              full
              multiplier={multiplier}
              stadiumBonus={stadiumBonus}
            />
          )
        }
        if (didNotPlay) {
          return <TextBlock label="—" full />
        }
        return hasFinalPoints ? (
          <PointsBlock
            value={finalPoints}
            full
            multiplier={multiplier}
            stadiumBonus={stadiumBonus}
          />
        ) : (
          <TextBlock label="—" full />
        )
      }
      // DGW in progress / upcoming: show both match halves
      return matches.slice(0, 2).map((m) => (
        <Fragment key={m.fixtureId}>{renderCell(m, { pendingAsFixture: true })}</Fragment>
      ))
    }

    // Single fixture
    const m = matches[0]
    const status = statusOf(m)

    if (DEAD_FIXTURE_STATUSES.has(status)) {
      return <TextBlock label={status === 'POSTPONED' ? 'PPD' : '—'} full />
    }

    if (status === 'LIVE') {
      return <TextBlock label="LIVE" variant="is-live" full />
    }

    if (status === 'FINISHED') {
      if (played) {
        return (
          <PointsBlock
            value={finalPoints}
            full
            multiplier={multiplier}
            stadiumBonus={stadiumBonus}
          />
        )
      }
      if (didNotPlay) {
        return <TextBlock label="—" full />
      }
      if (hasFinalPoints) {
        return (
          <PointsBlock
            value={finalPoints}
            full
            multiplier={multiplier}
            stadiumBonus={stadiumBonus}
          />
        )
      }
      // Finished fixture but stats row not yet synced -> keep fixture
      return <FixtureBlock match={m} full />
    }

    // SCHEDULED or upcoming
    return <FixtureBlock match={m} full />
  })()

  const isSplit = isDouble && !allFinished
  const hasOpp = Boolean(opp?.code)
  const hasStadiumBonus = Boolean(item?.stadiumBonus && Number(item.stadiumBonus) > 0)
  const allScheduled =
    matches.length > 0 && matches.every((m) => statusOf(m) === 'SCHEDULED')

  const bottomLabel =
    matches.length === 0
      ? 'No fixture'
      : allScheduled
        ? 'Yet to play'
        : didNotPlay && allFinished
          ? 'Did not play'
          : hasFinalPoints
            ? `${finalPoints} points`
            : 'No points'

  return (
    <button
      type="button"
      className={cn(
        'player-card-unit',
        posKey && `pos-${posKey}`,
        gold && 'is-captain',
        isVice && 'is-vice',
        compact && 'is-bench',
        isSubOut && 'is-sub-out',
        isSubIn && 'is-sub-in',
        state === 'BENCH_UNUSED' && 'is-bench-unused'
      )}
      onClick={onClick}
      aria-label={`${item?.name ?? 'Player'}${gold ? `, ${gold.aria}` : ''}${
        isSubOut ? ', Substituted out' : isSubIn ? ', Substituted in' : ''
      }, ${bottomLabel}`}
    >
      <div className="player-avatar-disk">
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

        <div
          className={cn(
            'player-split-bar',
            isSplit ? 'is-dgw' : 'is-full',
            hasOpp ? null : 'is-no-fixture'
          )}
        >
          {resolvedBottom}
        </div>
      </div>
    </button>
  )
}
