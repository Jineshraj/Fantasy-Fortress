// URL <-> data helpers. Kept out of components so the rules are testable and
// defined in exactly one place.

import { slugifyTeam } from '@/data/teamLogos'
import { BRAND } from '@/config/brand'

export const ROUTES = {
  table: '/table',
  squad: '/squad',
  fixtures: '/fixtures',
  stats: '/stats',
  h2h: '/h2h',
  cup: '/cup',
  home: '/',
}

export const DEFAULT_ROUTE = ROUTES.table

/** Route for a team page. Omit `gw` to inherit whatever is already in the URL. */
export const teamPath = (teamName, gw) => {
  const base = `/team/${slugifyTeam(teamName)}`
  return gw ? `${base}?gw=${gw}` : base
}

/** Resolve a :slug param back to a real team, or null. */
export const findTeamBySlug = (teams, slug) => {
  if (!slug) return null
  const target = String(slug).toLowerCase()
  return teams.find((t) => slugifyTeam(t.name).toLowerCase() === target) ?? null
}

/**
 * Validate a ?gw= value.
 *
 * Anything that isn't a plain integer in 1..latestGw falls back to latestGw —
 * so `?gw=abc`, `?gw=-1`, `?gw=999` and a missing param all render the latest
 * scored week rather than an empty screen.
 */
export const clampGw = (raw, latestGw) => {
  const max = Math.max(1, Number(latestGw) || 1)
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1 || n > max) return max
  return n
}

export const TITLE_SUFFIX = `${BRAND.name} ${BRAND.season}`

export const routeTitle = (pathname) => {
  const known = {
    [ROUTES.table]: 'League Table',
    [ROUTES.squad]: 'Squads',
    [ROUTES.fixtures]: 'Fixtures',
    [ROUTES.stats]: 'Player Stats',
    [ROUTES.h2h]: 'H2H League',
    [ROUTES.cup]: 'Super Cup',
  }
  if (pathname.startsWith('/team/')) return 'Team'
  return known[pathname] || BRAND.name
}