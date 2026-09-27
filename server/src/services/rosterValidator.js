/**
 * 7 Officially Allowed Fantasy Football Formations
 */
export const ALLOWED_FORMATIONS = [
  { def: 4, mid: 4, fwd: 2, label: '4-4-2' },
  { def: 3, mid: 5, fwd: 2, label: '3-5-2' },
  { def: 3, mid: 4, fwd: 3, label: '3-4-3' },
  { def: 4, mid: 5, fwd: 1, label: '4-5-1' },
  { def: 4, mid: 3, fwd: 3, label: '4-3-3' },
  { def: 5, mid: 3, fwd: 2, label: '5-3-2' },
  { def: 5, mid: 4, fwd: 1, label: '5-4-1' },
]

const PLACEHOLDER_WORDS = new Set([
  'nill', 'nil', 'none', 'rest', 'all', 'na', 'n/a', '-', '--', 'empty', 'sub', 'subs', 'no one', 'nobody'
])

const POSITION_SUFFIXES = new Set([
  'lw', 'rw', 'rb', 'lb', 'cb', 'cf', 'cm', 'cam', 'cdm', 'gk', 'st', 'ss', 'lwb', 'rwb',
  'leftwinger', 'rightwinger', 'centreback', 'centerback',
  'centrefourward', 'centerforward', 'secondstriker',
  'attackingmidfielder', 'defensivemidfielder', 'goalkeeper',
  'leftback', 'rightback', 'leftwingback', 'rightwingback',
  'sweeper', 'striker',
])

const POSITION_SEPARATORS = /[\s·\-–_(),/]+/

// Pre-process: join multi-word position phrases into single tokens
// so they match the single-token entries in POSITION_SUFFIXES.
const MULTI_WORD_POSITIONS = [
  ['left wing back', 'leftwingback'],
  ['right wing back', 'rightwingback'],
  ['left winger', 'leftwinger'],
  ['right winger', 'rightwinger'],
  ['centre back', 'centreback'],
  ['center back', 'centerback'],
  ['centre forward', 'centrefourward'],
  ['center forward', 'centerforward'],
  ['second striker', 'secondstriker'],
  ['attacking midfielder', 'attackingmidfielder'],
  ['defensive midfielder', 'defensivemidfielder'],
  ['left back', 'leftback'],
  ['right back', 'rightback'],
  ['centre-back', 'centreback'],
  ['center-back', 'centerback'],
  ['left-back', 'leftback'],
  ['right-back', 'rightback'],
  ['goalkeeper', 'goalkeeper'],
  ['left wing-back', 'leftwingback'],
  ['right wing-back', 'rightwingback'],
  ['left-wing-back', 'leftwingback'],
  ['right-wing-back', 'rightwingback'],
]

function collapseMultiWordPositions(s) {
  let out = s
  for (const [phrase, token] of MULTI_WORD_POSITIONS) {
    // Use word-boundary-aware replace so "Centre Forward" inside "Centre Forward FC" still matches
    out = out.replace(new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), token)
  }
  return out
}

export function cleanClubName(raw) {
  if (!raw) return ''
  const str = String(raw).trim()
  const lower = str.toLowerCase()
  const collapsed = collapseMultiWordPositions(lower)
  const tokens = collapsed.split(POSITION_SEPARATORS)
  const cleaned = tokens.filter(t => t && !POSITION_SUFFIXES.has(t))
  // Preserve Unicode letters (accents like é, ñ, ü) but strip other punctuation.
  // Use the 'u' flag with \p{L} to match any Unicode letter, plus \p{N} for digits.
  return cleaned.join(' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim()
}

export function isPlaceholder(str) {
  if (!str) return true
  const clean = str.toLowerCase().trim().replace(/[^a-z0-9]/g, '')
  return clean.length === 0 || PLACEHOLDER_WORDS.has(clean) || clean === 'nil' || clean === 'nill'
}

/**
 * Normalizes string by removing accents/diacritics and special characters
 */
export function normalizeName(str) {
  if (!str) return ''
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    // Non-ASCII letter substitutions that NFD doesn't decompose.
    // Handles Turkish (Marmoush, Çalhanoğlu), German (Straßburg),
    // Danish/Norwegian (Sørloth), Croatian (Đurić), Polish (Lewandowski ł→l).
    .replace(/ı/g, 'i')
    .replace(/ß/g, 'ss')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
}

export function cleanPlayerNameInput(str) {
  if (!str) return ''
  return str
    .replace(/\s*\((c|vc|v|captain|vice|vice captain)\)/gi, '')
    .replace(/\s+\b(c|vc|v|cap|captain|vice)\b$/gi, '')
    .trim()
}

/**
 * Calculates similarity between two strings with full string & token weighting
 */
export function getSimilarityScore(rawInput, officialName) {
  if (isPlaceholder(rawInput) || isPlaceholder(officialName)) return 0

  const cleanedInput = cleanPlayerNameInput(rawInput)
  const normInput = normalizeName(cleanedInput)
  const normOfficial = normalizeName(officialName)

  if (!normInput || !normOfficial) return 0
  if (normInput === normOfficial) return 1.0

  // Check no-space match (e.g. 'le paul' -> 'lepaul', 'deketelaere' -> 'de ketelaere')
  const noSpaceInput = normInput.replace(/\s+/g, '')
  const noSpaceOfficial = normOfficial.replace(/\s+/g, '')
  if (noSpaceInput === noSpaceOfficial) return 0.98

  // 1. Full string Levenshtein distance
  const fullDist = levenshteinDistance(normInput, normOfficial)
  const maxLen = Math.max(normInput.length, normOfficial.length)
  const fullStringScore = maxLen === 0 ? 1 : 1 - fullDist / maxLen

  // 2. Exact Word/Token matches
  const officialWords = normOfficial.split(/\s+/)
  const inputWords = normInput.split(/\s+/)

  // Common football acronyms (e.g. CDK -> Charles De Ketelaere)
  const acronym = officialWords.map((w) => w[0]).join('')
  if (normInput === acronym && normInput.length >= 2) return 0.95

  let matchingTokens = 0
  for (const inWord of inputWords) {
    if (inWord.length >= 3) {
      if (officialWords.some((w) => w === inWord)) {
        matchingTokens += 1
      } else if (officialWords.some((w) => w.startsWith(inWord) || inWord.startsWith(w))) {
        // Prefix matching e.g. 'cucu' -> 'cucurella', 'kvara' -> 'kvaratskhelia', 'mittel' -> 'mittelstadt'
        matchingTokens += 0.9
      } else if (officialWords.some((w) => levenshteinDistance(inWord, w) <= 2 && Math.abs(inWord.length - w.length) <= 2)) {
        // e.g. 'oriley' -> 'oreilly', 'horneck' -> 'hornicek'
        matchingTokens += 0.85
      }
    }
  }

  // Use max token length so single-word names (e.g. 'Wesley') do not match multi-word names (e.g. 'Wesley Fofana') with high score
  const tokenScore = matchingTokens / Math.max(inputWords.length, officialWords.length)

  // Highest composite score
  return Math.max(fullStringScore, tokenScore * 0.95)
}

function levenshteinDistance(s1, s2) {
  const matrix = Array.from({ length: s1.length + 1 }, () =>
    Array(s2.length + 1).fill(0)
  )

  for (let i = 0; i <= s1.length; i++) matrix[i][0] = i
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[s1.length][s2.length]
}

/**
 * Validates whether a list of 11 starters matches one of the 7 allowed formations
 */
export function validateFormation(starters) {
  let gkp = 0, def = 0, mid = 0, fwd = 0

  starters.forEach((p) => {
    const pos = (p.pos || 'MID').toUpperCase()
    if (pos === 'GKP' || pos === 'GK') gkp++
    else if (pos === 'DEF') def++
    else if (pos === 'MID') mid++
    else if (pos === 'FWD' || pos === 'FOR') fwd++
  })

  const matched = ALLOWED_FORMATIONS.find(
    (f) => f.def === def && f.mid === mid && f.fwd === fwd && gkp === 1
  )

  if (matched) {
    return { isValid: true, formation: matched.label, counts: { gkp, def, mid, fwd } }
  }

  return {
    isValid: false,
    formation: `${def}-${mid}-${fwd} (${gkp} GK)`,
    counts: { gkp, def, mid, fwd },
    error: `Invalid formation: ${def}-${mid}-${fwd}. Must be one of: 4-4-2, 3-5-2, 3-4-3, 4-5-1, 4-3-3, 5-3-2, 5-4-1 with exactly 1 Goalkeeper.`,
  }
}

/**
 * Auto-fills incomplete lineups using available reserve squad players to form a valid formation
 */
function autoFillIncompleteLineup(starters, bench, officialSquad) {
  const usedPlayerNames = new Set(
    [...starters, ...bench].map((p) => normalizeName(p.name))
  )

  const availableReserves = officialSquad.filter(
    (p) => !usedPlayerNames.has(normalizeName(p.name))
  )

  const autoFilledStarters = [...starters]
  const autoFilledBench = [...bench]
  const autoFilledNotices = []

  const getCounts = (list) => {
    let gkp = 0, def = 0, mid = 0, fwd = 0
    list.forEach((p) => {
      const pos = (p.pos || 'MID').toUpperCase()
      if (pos === 'GKP' || pos === 'GK') gkp++
      else if (pos === 'DEF') def++
      else if (pos === 'MID') mid++
      else if (pos === 'FWD' || pos === 'FOR') fwd++
    })
    return { gkp, def, mid, fwd }
  }

  // 1. Ensure exactly 1 Goalkeeper in Starters
  let counts = getCounts(autoFilledStarters)
  if (counts.gkp === 0) {
    const reserveGkpIdx = availableReserves.findIndex(
      (p) => p.pos === 'GKP' || p.pos === 'GK'
    )
    if (reserveGkpIdx !== -1) {
      const [gkpPlayer] = availableReserves.splice(reserveGkpIdx, 1)
      autoFilledStarters.unshift({ ...gkpPlayer, autoFilled: true })
      autoFilledNotices.push(`Auto-promoted Goalkeeper '${gkpPlayer.name}' to Starters.`)
    }
  }

  // 2. Find best target formation among the 7 allowed that fits current starters
  counts = getCounts(autoFilledStarters)
  let bestTargetFormation = ALLOWED_FORMATIONS[0] // default 4-4-2
  let minNeeded = Infinity

  for (const form of ALLOWED_FORMATIONS) {
    const defNeeded = Math.max(0, form.def - counts.def)
    const midNeeded = Math.max(0, form.mid - counts.mid)
    const fwdNeeded = Math.max(0, form.fwd - counts.fwd)
    const totalNeeded = defNeeded + midNeeded + fwdNeeded

    if (totalNeeded < minNeeded) {
      minNeeded = totalNeeded
      bestTargetFormation = form
    }
  }

  // 3. Fill required position slots to meet the target formation
  const fillPosition = (posMatch, targetCount) => {
    let current = getCounts(autoFilledStarters)
    let posKey = posMatch === 'DEF' ? 'def' : posMatch === 'MID' ? 'mid' : 'fwd'

    while (current[posKey] < targetCount && autoFilledStarters.length < 11) {
      const idx = availableReserves.findIndex((p) => {
        const pPos = (p.pos || 'MID').toUpperCase()
        if (posMatch === 'DEF') return pPos === 'DEF'
        if (posMatch === 'MID') return pPos === 'MID'
        return pPos === 'FWD' || pPos === 'FOR'
      })

      if (idx !== -1) {
        const [p] = availableReserves.splice(idx, 1)
        autoFilledStarters.push({ ...p, autoFilled: true })
        autoFilledNotices.push(`Auto-filled '${p.name}' (${p.pos}) to Starters.`)
        current = getCounts(autoFilledStarters)
      } else {
        break
      }
    }
  }

  fillPosition('DEF', bestTargetFormation.def)
  fillPosition('MID', bestTargetFormation.mid)
  fillPosition('FWD', bestTargetFormation.fwd)

  // 4. If still under 11, add any remaining outfield reserves
  while (autoFilledStarters.length < 11 && availableReserves.length > 0) {
    const p = availableReserves.shift()
    autoFilledStarters.push({ ...p, autoFilled: true })
    autoFilledNotices.push(`Auto-filled '${p.name}' (${p.pos}) to complete 11 Starters.`)
  }

  // 5. Fill remaining squad players onto Bench (up to 4 bench slots)
  while (autoFilledBench.length < 4 && availableReserves.length > 0) {
    const p = availableReserves.shift()
    autoFilledBench.push({ ...p, autoFilled: true })
  }

  return {
    starters: autoFilledStarters,
    bench: autoFilledBench,
    notices: autoFilledNotices,
  }
}

/**
 * Main Roster Validation & Matching Engine
 */
export function validateAndMatchRoster(extractedLineup, officialTeamSquad = []) {
  const starters = extractedLineup.starters || []
  const bench = extractedLineup.bench || []
  const captain = extractedLineup.captain || ''
  const vice_captain = extractedLineup.vice_captain || ''

  const matchedStarters = []
  const matchedBench = []
  const warnings = []

  // Helper function to find best matching official squad player
  const findBestMatch = (rawName) => {
    if (!rawName || isPlaceholder(rawName)) return null
    let bestPlayer = null
    let highestScore = 0

    for (const officialPlayer of officialTeamSquad) {
      const nameToCompare = officialPlayer.name || officialPlayer.player_name || ''
      const score = getSimilarityScore(rawName, nameToCompare)

      if (score > highestScore) {
        highestScore = score
        bestPlayer = officialPlayer
      }
    }

    if (highestScore >= 0.5 && bestPlayer) {
      return {
        name: bestPlayer.name || bestPlayer.player_name,
        pos: bestPlayer.pos || bestPlayer.position || 'MID',
        matched: true,
      }
    }

    warnings.push(`Could not match '${rawName}' to official squad.`)
    return { name: rawName, pos: 'MID', matched: false }
  }

  // 1. Filter out placeholder words and match real starters
  starters.forEach((rawStarter) => {
    const rawName = typeof rawStarter === 'string' ? rawStarter : rawStarter?.name
    if (rawName && !isPlaceholder(rawName)) {
      const match = findBestMatch(rawName)
      if (match) matchedStarters.push(match)
    }
  })

  // 2. Filter out placeholder words and match real bench
  bench.forEach((rawBench) => {
    const rawName = typeof rawBench === 'string' ? rawBench : rawBench?.name
    if (rawName && !isPlaceholder(rawName)) {
      const match = findBestMatch(rawName)
      if (match) matchedBench.push(match)
    }
  })

  // 3. Auto-Fill if Incomplete (< 11 Starters or < 4 Bench)
  let finalStarters = matchedStarters
  let finalBench = matchedBench
  let autoFillNotices = []

  if (officialTeamSquad.length > 0 && (matchedStarters.length < 11 || matchedBench.length < 4)) {
    const autoFilled = autoFillIncompleteLineup(matchedStarters, matchedBench, officialTeamSquad)
    finalStarters = autoFilled.starters
    finalBench = autoFilled.bench
    autoFillNotices = autoFilled.notices
  }

  // 4. Validate Formation
  const formationCheck = validateFormation(finalStarters)
  if (!formationCheck.isValid) {
    warnings.push(formationCheck.error)
  }

  // 5. Match Captain & Vice-Captain safely
  const firstStarterName = finalStarters[0]?.name || 'Captain'
  const secondStarterName = finalStarters[1]?.name || firstStarterName

  const validCap = !isPlaceholder(captain) ? captain : firstStarterName
  const validVice = !isPlaceholder(vice_captain) ? vice_captain : secondStarterName

  const matchedCaptain = findBestMatch(validCap)?.name || firstStarterName
  const matchedVice = findBestMatch(validVice)?.name || secondStarterName

  return {
    ...extractedLineup,
    starters: finalStarters,
    bench: finalBench,
    captain: matchedCaptain,
    vice_captain: matchedVice,
    formation: formationCheck.formation,
    isFormationValid: formationCheck.isValid,
    autoFillNotices,
    warnings,
  }
}

export const CLUB_ALIASES = {
  'Liverpool FC': ['Liverpool', 'LFC'],
  'Manchester City': ['Man City', 'Man. City', 'MCFC'],
  'Real Madrid': ['Real Madrid CF', 'Real Madrid C.F.'],
  'Bayern Munich': ['FC Bayern München', 'Bayern München', 'FCB'],
  'Paris Saint-Germain': ['PSG', 'Paris SG', 'Paris Saint-Germain FC'],
  'Inter Milan': ['Inter', 'FC Internazionale', 'Internazionale'],
  'Manchester United': ['Man United', 'Man. United', 'MUFC'],
  'Arsenal FC': ['Arsenal', 'AFC'],
  'Chelsea FC': ['Chelsea', 'CFC'],
  'FC Barcelona': ['Barcelona', 'Barça', 'Barca'],
  'Atlético de Madrid': ['Atletico Madrid', 'Atletico de Madrid', 'ATM'],
  'Borussia Dortmund': ['BVB', 'Dortmund'],
  'VfB Stuttgart': ['Stuttgart', 'VFB'],
  'Stade Rennais FC': ['Rennais', 'Rennes', 'SRFC'],
  'Tottenham Hotspur': ['Tottenham', 'Spurs'],
  'Nottingham Forest': ['Nottm Forest', 'Nottingham', 'NFO'],
  'Wolverhampton Wanderers': ['Wolves', 'Wolverhampton'],
  'Brighton & Hove Albion': ['Brighton', 'BHA'],
  'West Ham United': ['West Ham', 'WHU'],
  'Newcastle United': ['Newcastle', 'NUFC'],
  'Athletic Bilbao': ['Athletic Club', 'Bilbao'],
}

/**
 * Compares two club names taking into account aliases, root tokens, and fuzzy similarity.
 */
export function isSameClub(clubA, clubB) {
  if (!clubA || !clubB) return true
  const normA = normalizeName(clubA)
  const normB = normalizeName(clubB)
  if (normA === normB) return true
  if (normA.includes(normB) || normB.includes(normA)) return true

  for (const [canonical, aliases] of Object.entries(CLUB_ALIASES)) {
    const normCanonical = normalizeName(canonical)
    const allNames = [normCanonical, ...aliases.map((a) => normalizeName(a))]
    if (allNames.includes(normA) && allNames.includes(normB)) return true
  }

  const stopWords = new Set(['fc', 'cf', 'afc', 'bc', 'calcio', 'sco', 'rc', 'club', 'de', 'stade', 'real', 'rcd', 'ssc', 'ac', 'as', 'us', 'ud', 'cd', 'ca', 'aj', 'estac', 'la', 'coruna', 'saint', 'germain', 'hotspur'])
  const tokenA = normA.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t))[0] || normA
  const tokenB = normB.split(/\s+/).filter(t => t.length > 2 && !stopWords.has(t))[0] || normB
  if (tokenA === tokenB) return true

  return getSimilarityScore(normA, normB) >= 0.55
}

/**
 * Resolves a player's fantasy position using a multi-tier fallback strategy:
 * Tier 1: Exact normalized name match in playerPositionMap
 * Tier 2: API Player ID lookup in afIdToPosMap
 * Tier 3: First-initial + surname match (e.g. "M. Sels" -> "Matz Sels", "D. Udogie" -> "Destiny Udogie")
 * Tier 4: Mononym / Single-token / Same-club substring match (e.g. "Jair" -> "Jair Cunha")
 * Tier 5: Same-club fuzzy match (>= 0.80)
 * Tier 6: Global fuzzy match (>= 0.88)
 * Tier 7: Live match position fallback ('G'/'GK' -> 'GK', 'D'/'DEF' -> 'DEF', etc.)
 */
/**
 * Resolves full player details (fantasy position, canonical name, and resolution tier):
 * Tier 0: Player_Aliases sheet match (manual admin alias override)
 * Tier 1: Exact normalized name match in playerPositionMap
 * Tier 2: API Player ID lookup in afIdToPosMap
 * Tier 3: First-initial + surname match (e.g. "M. Sels" -> "Matz Sels", "D. Udogie" -> "Destiny Udogie")
 * Tier 4: Mononym / Single-token / Same-club substring match (e.g. "Jair" -> "Jair Cunha")
 * Tier 5: Same-club fuzzy match (>= 0.80)
 * Tier 6: Global fuzzy match (>= 0.88)
 * Tier 7: Live match position fallback ('G'/'GK' -> 'GK', 'D'/'DEF' -> 'DEF', etc.)
 */
export function resolvePlayerDetails(
  arg1,
  clubName = '',
  livePos = '',
  playerPositionMap = new Map(),
  playerClubMap = new Map(),
  afIdToPosMap = new Map(),
  afPlayerId = null,
  playerCanonicalMap = new Map(),
  playerAliasMap = new Map(),
  diagCollector = null
) {
  let rawName, opts
  if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
    opts = arg1
    rawName = opts.rawName
    clubName = opts.clubName || ''
    livePos = opts.livePos || ''
    playerPositionMap = opts.playerPositionMap || new Map()
    playerClubMap = opts.playerClubMap || new Map()
    afIdToPosMap = opts.afIdToPosMap || new Map()
    afPlayerId = opts.afPlayerId != null ? opts.afPlayerId : null
    playerCanonicalMap = opts.playerCanonicalMap || new Map()
    playerAliasMap = opts.playerAliasMap || new Map()
    diagCollector = opts.diagCollector || null
  } else {
    rawName = arg1
  }

  const norm = normalizeName(rawName)

  // Tier 0: Player_Aliases sheet match (manual admin override)
  if (norm && playerAliasMap && playerAliasMap.has(norm)) {
    const alias = playerAliasMap.get(norm)
    const canonicalName = alias.canonicalName || alias.canonical_name || rawName
    const pos = alias.position || alias.pos || playerPositionMap.get(normalizeName(canonicalName)) || 'MID'
    return { pos, canonicalName, resolvedBy: 'tier0_player_aliases' }
  }

  // Tier 1: Exact normalized name match
  if (norm && playerPositionMap && playerPositionMap.has(norm)) {
    const pos = playerPositionMap.get(norm)
    const canonicalName = playerCanonicalMap?.get(norm) || rawName
    return { pos, canonicalName, resolvedBy: 'tier1_exact' }
  }

  // Tier 2: API Player ID lookup
  if (afPlayerId != null && afIdToPosMap && afIdToPosMap.has(String(afPlayerId).trim())) {
    const idEntry = afIdToPosMap.get(String(afPlayerId).trim())
    if (typeof idEntry === 'object' && idEntry !== null) {
      return { pos: idEntry.pos, canonicalName: idEntry.canonicalName || rawName, resolvedBy: 'tier2_af_id' }
    }
    const canonicalName = playerCanonicalMap?.get(normalizeName(rawName)) || rawName
    return { pos: idEntry, canonicalName, resolvedBy: 'tier2_af_id' }
  }

  // Tier 3: First-initial + surname match
  // Handles names like "M. Sels" -> "m sels", "D. Udogie" -> "d udogie", "M. van de Ven" -> "m van de ven"
  if (norm && playerPositionMap) {
    const parts = norm.split(/\s+/)
    if (parts.length >= 2 && parts[0].length === 1) {
      const initial = parts[0]
      const surnamePart = parts[1].length === 1 && parts.length >= 3
        ? parts.slice(2).join(' ')
        : parts.slice(1).join(' ')

      let bestCand = null
      let clubMatched = false

      for (const [candNorm, pos] of playerPositionMap.entries()) {
        if (!candNorm.startsWith(initial)) continue
        const candEnds = candNorm.endsWith(surnamePart) || candNorm.endsWith(' ' + surnamePart)
        if (!candEnds) continue

        const candClub = playerClubMap?.get(candNorm) || ''
        const canonical = playerCanonicalMap?.get(candNorm) || candNorm
        if (clubName && candClub && isSameClub(clubName, candClub)) {
          bestCand = { pos, canonicalName: canonical, candNorm }
          clubMatched = true
          break
        }
        if (!bestCand) {
          bestCand = { pos, canonicalName: canonical, candNorm }
        }
      }

      if (bestCand && (clubMatched || !clubName)) {
        return { pos: bestCand.pos, canonicalName: bestCand.canonicalName, resolvedBy: 'tier3_initial_surname' }
      }
    }
  }

  // Tier 4: Mononym / Single-token / Same-club substring match
  // E.g. "Jair" on Nottingham Forest matching "Jair Cunha"
  if (norm && clubName && playerClubMap && playerPositionMap) {
    for (const [candNorm, pos] of playerPositionMap.entries()) {
      const candClub = playerClubMap.get(candNorm) || ''
      if (!candClub || !isSameClub(clubName, candClub)) continue

      const candTokens = candNorm.split(/\s+/)
      const normTokens = norm.split(/\s+/)
      const isSubMatch = candTokens.includes(norm) ||
        normTokens.includes(candNorm) ||
        (norm.length >= 4 && candNorm.includes(norm))

      if (isSubMatch) {
        const canonical = playerCanonicalMap?.get(candNorm) || candNorm
        return { pos, canonicalName: canonical, resolvedBy: 'tier4_same_club_token' }
      }
    }
  }

  // Tier 5: Same-club fuzzy match (>= 0.80)
  if (norm && clubName && playerClubMap && playerPositionMap) {
    let highestSim = 0
    let bestCand = null
    for (const [candNorm, pos] of playerPositionMap.entries()) {
      const candClub = playerClubMap.get(candNorm) || ''
      if (!candClub || !isSameClub(clubName, candClub)) continue

      const sim = getSimilarityScore(norm, candNorm)
      if (sim > highestSim && sim >= 0.80) {
        highestSim = sim
        const canonical = playerCanonicalMap?.get(candNorm) || candNorm
        bestCand = { pos, canonicalName: canonical }
      }
    }
    if (bestCand) return { ...bestCand, resolvedBy: 'tier5_same_club_fuzzy' }
  }

  // Tier 6: Global fuzzy match (>= 0.88)
  if (norm && playerPositionMap) {
    let highestSim = 0
    let bestCand = null
    for (const [candNorm, pos] of playerPositionMap.entries()) {
      const sim = getSimilarityScore(norm, candNorm)
      if (sim > highestSim && sim >= 0.88) {
        highestSim = sim
        const canonical = playerCanonicalMap?.get(candNorm) || candNorm
        bestCand = { pos, canonicalName: canonical }
      }
    }
    if (bestCand) return { ...bestCand, resolvedBy: 'tier6_global_fuzzy' }
  }

  // Tier 7: Live match position fallback
  if (livePos) {
    const p = String(livePos).toUpperCase().trim()
    let fallback = 'MID'
    if (p === 'G' || p === 'GK' || p === 'GKP') fallback = 'GK'
    else if (p === 'D' || p === 'DEF') fallback = 'DEF'
    else if (p === 'M' || p === 'MID') fallback = 'MID'
    else if (p === 'F' || p === 'FWD' || p === 'A' || p === 'ATT' || p === 'ST') fallback = 'FWD'

    if (diagCollector && rawName) {
      diagCollector.push({ rawName, clubName, livePos, fallback })
    }
    return { pos: fallback, canonicalName: rawName, resolvedBy: 'tier7_live_fallback' }
  }

  return { pos: 'MID', canonicalName: rawName, resolvedBy: 'default' }
}

export function resolvePlayerPosition(...args) {
  const res = resolvePlayerDetails(...args)
  return res.pos
}

