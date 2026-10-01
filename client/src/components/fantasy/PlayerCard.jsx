import { cn } from '@/lib/utils'
import { PlayerPhoto } from './Imagery'

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
      <PlayerPhoto player={item} />
      <strong>{item.short || item.name}</strong>
      <span className="player-bottom">
        <small>{item.clubCode}</small>
        <b className="numeric">{item.points}</b>
      </span>
    </button>
  )
}
