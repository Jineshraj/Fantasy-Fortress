// Single source of truth for branding.
//
// Every user-visible name, the season marker and the logo path live here so
// there is exactly one place to change them. Previously "Sunday League
// Society" was hardcoded across index.html, Header, Access, Splash, Crest and
// lib/routes.js, which is how the name drifted out of sync in the first place.

export const BRAND = {
  name: 'Fantasy Fortress',
  season: 'Season 2',
  tagline: 'Private fantasy football league',
  // Emitted as "Fantasy Fortress · Season 2" wherever the full name is shown.
  full: 'Fantasy Fortress · Season 2',
}

// League logo lives in client/public/Fantasy Fortress/ (the space is
// URL-encoded — browsers do this automatically, and Vite serves it fine).
export const LOGO_SRC = '/Fantasy%20Fortress/Fantasy-fortress-logo.png'

// The crest already reads well as a small square mark, so it doubles as the
// tab / home-screen icon. No separate favicon asset needed.
export const FAVICON_SRC = LOGO_SRC

// The crest carries its own "FANTASY FORTRESS" wordmark, so the header shows
// the mark plus a season badge rather than repeating the full name.
export const LOGO_HAS_WORDMARK = true

export const DOC_TITLE = `${BRAND.name} ${BRAND.season}`
export const DOC_DESCRIPTION = `${BRAND.tagline} — live standings, squads, fixtures, H2H league and Super Cup.`