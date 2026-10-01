import { getPlayerImageUrl } from '@/data/playerImages'
import { LayeredMedia } from './Media'

/**
 * Player headshot layered over the CSS shirt. The shirt is a *fallback*: it is
 * hidden as soon as a photo loads, so a missing or transparent image never
 * shows a cyan block through it.
 */
export function PlayerPhoto({ player, className = 'player-photo-wrap' }) {
  const url = getPlayerImageUrl(player)
  return (
    <LayeredMedia
      candidates={url ? [url] : []}
      resetKey={url || player?.name || ''}
      className={className}
      imgClassName="player-photo"
      fallback={
        <span className="shirt">
          <span>{player?.clubCode}</span>
        </span>
      }
    />
  )
}

/**
 * Real-club badge layered over the shirt, used on fixtures. Fixture rows
 * currently carry no provider team IDs, so in practice this renders the shirt
 * until those are synced.
 */
export function ClubMark({ code, url }) {
  return (
    <LayeredMedia
      candidates={url ? [url] : []}
      resetKey={url || code}
      className="club-mark"
      imgClassName="club-badge"
      fallback={<span className="shirt mini-shirt">{code}</span>}
    />
  )
}
