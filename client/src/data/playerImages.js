// External image helpers.
//
// Club badges + player headshots come from the API-Sports CDN — the same
// provider family the backend already syncs (API-Football). No API key needed
// for these static assets. Every caller must render a visible fallback
// underneath (CSS shirt / initials avatar), because a missing headshot is
// common for youth and lower-league players.

import { getClubBadgeUrl } from './clubBadges'

export const clubBadge = (idOrName) => getClubBadgeUrl(idOrName)

export const playerPhoto = (apiFootballPlayerId) =>
  apiFootballPlayerId
    ? `https://media.api-sports.io/football/players/${apiFootballPlayerId}.png`
    : null

// Generic resolver for a player object. Supports the provider ID under any of
// the names it has carried, plus a prebuilt `photoUrl` from the data layer, so
// component code never has to care.
export const getPlayerImageUrl = (player = {}) =>
  player.photoUrl ??
  playerPhoto(player.apiId ?? player.api_football_id ?? player.apiFootballId ?? null)

// ---------------------------------------------------------------------------
// Failure memory
//
// A missing headshot or crest is normal (youth players, franchises without a
// PNG). Without this, every re-render fires another 404. Once an image fails we
// record its src and never ask again — the fallback underneath becomes the
// permanent mark.
// ---------------------------------------------------------------------------
const brokenImages = new Set()

export const markImageBroken = (src) => {
  if (src) brokenImages.add(src)
}

export const isImageBroken = (src) => (src ? brokenImages.has(src) : false)
