/**
 * Small localStorage helpers, wrapped so a browser with storage disabled
 * (private mode, embedded webviews) degrades to "no memory" instead of
 * throwing on every render.
 */

const read = (key) => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* storage unavailable — the app still works, just forgets */
  }
}

export const getStored = (key) => read(key)
export const setStored = (key, value) => write(key, value)

/**
 * Session memory for in-screen state that should survive leaving and returning
 * to a screen (or a Back) without becoming a shareable URL — search text and an
 * expanded accordion group. A closed tab clears it, which is the "fresh entry"
 * boundary the navigation audit asks for.
 */
const readSession = (key) => {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

const writeSession = (key, value) => {
  try {
    window.sessionStorage.setItem(key, value)
  } catch {
    /* storage unavailable — view state simply resets */
  }
}

export const getSession = (key) => readSession(key)
export const setSession = (key, value) => writeSession(key, value)

export const KEYS = {
  unlocked: 'ff:unlocked',
  lastTeam: 'ff:last-team',
  role: 'ff:role',
  leaderboardQuery: 'ff:leaderboard-query',
  squadQuery: 'ff:squad-query',
  squadGroup: 'ff:squad-group',
  statsQuery: 'ff:stats-query',
}
