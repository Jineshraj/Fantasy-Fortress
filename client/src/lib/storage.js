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

export const KEYS = {
  unlocked: 'ff:unlocked',
  lastTeam: 'ff:last-team',
  role: 'ff:role',
}