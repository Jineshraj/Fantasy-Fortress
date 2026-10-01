// Fantasy franchise logo resolver.
//
// Source files live in `client/public/fantasy-logos/`. The delivered file names
// do NOT follow a derivable convention (mixed `-removebg-preview.png` vs
// `.jpeg`, underscores vs spaces, and two names that differ from the database:
// "Committe Team" -> Committee_Team, "Mamangam DC" -> Mamangam,
// "xG Illuminati" -> xg_illuminati). So the mapping is declared explicitly here
// rather than guessed from a slug.
//
// Each entry is an ORDERED list of candidates. Transparent `-removebg` PNGs are
// preferred; the `.jpeg` originals are the fallback. If a candidate 404s the
// next one is tried (see TeamMark.jsx), and failures are remembered per session
// in playerImages.js so a missing file is requested at most once.

export const TEAM_LOGOS = {
  'Aguilas Dorados': ['Aguilas_Dorados-removebg-preview.png', 'Aguilas Dorados.jpeg'],
  'Aura Farmers': ['Aura_Farmers-removebg-preview.png', 'Aura Farmers.jpeg'],
  'Aztec Blinders': ['Aztec_Blinders-removebg-preview.png', 'Aztec Blinders.jpeg'],
  'Choakers FC': ['Choakers_FC-removebg-preview.png', 'Choakers FC.jpeg'],
  // DB says "Committe", the file says "Committee".
  'Committe Team': ['Committee_Team-removebg-preview.png', 'Committee Team.jpeg'],
  'Iberian Wizards': ['Iberian_Wizards-removebg-preview.png', 'Iberian Wizards.jpeg'],
  'Jogo Bonito': ['Jogo_Bonito-removebg-preview.png', 'Jogo Bonito.jpeg'],
  'Kroos Control': ['Kroos_Control-removebg-preview.png', 'Kroos Control.jpeg'],
  'La Pulga': ['La_Pulga-removebg-preview.png', 'La Pulga.jpeg'],
  // DB says "Mamangam DC", the file says "Mamangam".
  'Mamangam DC': ['Mamangam-removebg-preview.png', 'Mamangam.jpeg'],
  Mancunians: ['Mancunians-removebg-preview.png', 'Mancunians.jpeg'],
  'Meridian Athletic': ['Meridian_Athletic-removebg-preview.png', 'Meridian Athletic.jpeg'],
  'Phoenix Flyers': ['Phoenix_Flyers-removebg-preview.png', 'Phoenix Flyers.jpeg'],
  Reds: ['Reds-removebg-preview.png', 'Reds.jpeg'],
  'Relegated FC': ['Relegated_FC-removebg-preview.png', 'Relegated FC.jpeg'],
  // Lowercase "xg" in the filename.
  'xG Illuminati': ['xg_illuminati-removebg-preview.png', 'xg illuminati.jpeg'],
}

const BASE = '/fantasy-logos/'

export const slugifyTeam = (name = '') =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

/** All candidate URLs for a team, best first. */
export const getTeamLogoCandidates = (name) => {
  if (!name) return []
  const declared = TEAM_LOGOS[name]
  const list = Array.isArray(declared) ? declared : declared ? [declared] : []
  // Last-resort convention guess, in case a team is added without updating this map.
  list.push(`${BASE}${slugifyTeam(name)}.png`)
  return list.map((f) => (f.startsWith('/') ? f : BASE + f))
}

/** Best single candidate — used where a fallback chain isn't possible. */
export const getTeamLogo = (name) => getTeamLogoCandidates(name)[0] || null

export const initials = (name = '') =>
  name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
