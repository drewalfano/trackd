import { addDays, todayStr } from './lib/dates.js'

/**
 * The only cross-screen state in the app: which day you are looking at.
 * Today and Log share it, so stepping back a day on one and then opening the
 * other keeps you where you were.
 */

const subs = new Set()

export const state = {
  date: todayStr(),
  /** True while the user is sitting on "today" rather than browsing history. */
  pinnedToToday: true,
}

export function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

function emit() {
  for (const fn of subs) fn(state)
}

/** Accepts a delta (-1, +1) or an absolute 'YYYY-MM-DD'. */
export function setDate(value) {
  const next = typeof value === 'number' ? addDays(state.date, value) : value
  if (next === state.date) return
  state.date = next
  state.pinnedToToday = next === todayStr()
  emit()
}

/**
 * The app is almost never closed, so it will be open across midnight. If the
 * user was sitting on today, roll them onto the new today; if they were
 * deliberately browsing a past day, leave them there.
 */
export function rollOverIfNeeded() {
  const today = todayStr()
  if (state.pinnedToToday && state.date !== today) {
    state.date = today
    emit()
  }
}
