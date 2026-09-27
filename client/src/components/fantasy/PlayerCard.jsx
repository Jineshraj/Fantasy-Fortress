import { cn } from '@/lib/utils'

export function PlayerCard({ item, onClick, compact = false }) {
  return (
    <button
      type="button"
      className={cn('player-card', compact && 'player-compact')}
      onClick={onClick}
    >
      <span className="player-top">
        <span className="position-tag">{item.pos}</span>
      </span>
      <span className="shirt">
        <span>{item.clubCode}</span>
      </span>
      <strong>{item.short}</strong>
      <span className="player-bottom">
        <small>{item.clubCode}</small>
        <b className="numeric">{item.points}</b>
      </span>
    </button>
  )
}