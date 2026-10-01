import { getFantasyLogo } from '@/data/live'
import { getTeamLogoCandidates, initials } from '@/data/teamLogos'
import { LayeredMedia } from './Media'

/**
 * Team crest. Falls back to an initials avatar, but only while no crest has
 * loaded — the crests are transparent PNGs, so the avatar must not stay
 * painted underneath them.
 */
export function TeamMark({ name, size = 32 }) {
  const override = getFantasyLogo(name, null)
  const chain = override ? [override, ...getTeamLogoCandidates(name)] : getTeamLogoCandidates(name)

  return (
    <LayeredMedia
      candidates={chain}
      resetKey={name}
      className="team-mark"
      imgClassName="team-logo"
      style={{ width: size, height: size }}
      fallback={<span className="avatar">{initials(name)}</span>}
    />
  )
}
