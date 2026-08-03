/**
 * IndexedDB layer. Every write in the app goes through here and nothing here
 * touches the network — the app is fully usable with the radio off.
 */

import { openDB } from 'idb'
import { todayStr } from './dates.js'
import { weightUnitFor } from './format.js'

export const DB_NAME = 'macro-tracker'
export const DB_VERSION = 2

/**
 * What onboarding fills in. Every field is null until someone says otherwise,
 * because a default here is a number the app made up and then drew rings
 * against — and `sex: 'male'` as a fallback would be exactly that.
 *
 * Height and weight are canonical metric and converted at display time. Weight
 * is not stored here at all: the `weights` store is already the record of what
 * someone weighs, and a second copy would be a second answer.
 */
export const DEFAULT_PROFILE = {
  /** 'female' | 'male' | 'unspecified'. Unspecified means manual targets. */
  sex: null,
  /** The year, not the age — an age is wrong from the next birthday onwards. */
  birthYear: null,
  heightCm: null,
  activity: null,
  goal: 'maintain',
  /** Signed kg per week. Negative loses. Clamped on the way into the maths. */
  rateKgPerWeek: 0,
}

export const DEFAULT_SETTINGS = {
  targets: { kcal: 2837, protein: 180, fat: 80, carbs: 300 },
  /**
   * 'calculated' follows the profile; 'manual' does not, and wins. Any hand
   * edit of a target flips this, so the app never quietly overwrites a number
   * somebody typed on purpose.
   */
  targetsSource: 'manual',
  profile: { ...DEFAULT_PROFILE },
  onboardingComplete: false,
  units: 'metric',
  weightUnit: 'kg',
  blockNames: ['Morning', 'Afternoon', 'Night'],
  blockThresholds: { afternoon: 12, night: 17 },
  theme: 'system',
  trendWindow: 7,
  /** Ordered and manual. These do not re-sort themselves — that is the point. */
  favourites: [],
  firstRunSeen: false,
}

/** Everything that travels in an export. Order matters only for readability. */
const DATA_STORES = ['foods', 'entries', 'meals', 'weights', 'dayTargets']

/** Two stores are keyed by date rather than by a generated id. */
const keyPathFor = (store) => (store === 'weights' || store === 'dayTargets' ? 'date' : 'id')

export const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

/** Thrown when storage is unavailable, e.g. private browsing on some browsers. */
export class StorageUnavailableError extends Error {
  constructor(cause) {
    super('IndexedDB is unavailable')
    this.name = 'StorageUnavailableError'
    this.cause = cause
  }
}

export class QuotaError extends Error {
  constructor(cause) {
    super('Storage is full')
    this.name = 'QuotaError'
    this.cause = cause
  }
}

/* ---------------------------------------------------------------- change bus */

const listeners = new Set()

/** Screens subscribe to this and re-render. Coarse on purpose: writes are rare. */
export function onChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(scope) {
  for (const fn of listeners) fn(scope)
}

/* -------------------------------------------------------------------- open */

let dbPromise = null

export function db() {
  if (!dbPromise) {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new StorageUnavailableError())
    }
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      // Stepped rather than unconditional: an existing v1 database runs only
      // the v2 block, and re-creating a store that is already there throws.
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          const foods = database.createObjectStore('foods', { keyPath: 'id' })
          foods.createIndex('barcode', 'barcode')
          foods.createIndex('lastUsedAt', 'lastUsedAt')
          foods.createIndex('useCount', 'useCount')
          foods.createIndex('nameLower', 'nameLower')

          const entries = database.createObjectStore('entries', { keyPath: 'id' })
          entries.createIndex('date', 'date')
          entries.createIndex('dateBlock', ['date', 'block'])
          entries.createIndex('foodId', 'foodId')

          const meals = database.createObjectStore('meals', { keyPath: 'id' })
          meals.createIndex('useCount', 'useCount')

          database.createObjectStore('weights', { keyPath: 'date' })
          database.createObjectStore('settings')
        }
        if (oldVersion < 2) {
          // What the target was on a given day. Not backfilled — days logged
          // before this shipped have no record and fall back to the current
          // target, because inventing one would be worse than admitting it.
          database.createObjectStore('dayTargets', { keyPath: 'date' })
        }
      },
      blocked() {
        console.warn('Another tab is holding an old version of the database open.')
      },
    }).catch((err) => {
      dbPromise = null
      throw new StorageUnavailableError(err)
    })
  }
  return dbPromise
}

/**
 * Confirm storage actually works before the app renders anything.
 * Safari in private mode exposes `indexedDB` and then fails on open, so the
 * only honest test is a real round trip.
 */
export async function checkStorage() {
  const d = await db()
  await d.get('settings', 'settings')
  return true
}

/** Quota rejections are rare at this data volume but must not fail silently. */
async function write(fn) {
  try {
    return await fn()
  } catch (err) {
    if (err?.name === 'QuotaExceededError' || err?.code === 22) throw new QuotaError(err)
    throw err
  }
}

/* ---------------------------------------------------------------- settings */

let settingsCache = null

export async function getSettings() {
  if (settingsCache) return settingsCache
  const stored = (await (await db()).get('settings', 'settings')) || {}
  settingsCache = {
    ...DEFAULT_SETTINGS,
    ...stored,
    targets: { ...DEFAULT_SETTINGS.targets, ...(stored.targets || {}) },
    profile: { ...DEFAULT_PROFILE, ...(stored.profile || {}) },
    blockThresholds: { ...DEFAULT_SETTINGS.blockThresholds, ...(stored.blockThresholds || {}) },
    blockNames: stored.blockNames || [...DEFAULT_SETTINGS.blockNames],
    favourites: stored.favourites || [],
  }
  return derive(settingsCache)
}

/**
 * `weightUnit` follows `units` and is not settable on its own. It stays a
 * stored field so every consumer reads one value rather than each deriving its
 * own — which means the invariant has to be restored on both paths, not just on
 * load: settings written before Settings dropped its second control can hold a
 * combination (metric with pounds) that nothing in the app can now produce, and
 * a patch that changes `units` would otherwise leave the old weight unit
 * merged in beside it.
 */
function derive(settings) {
  settings.weightUnit = weightUnitFor(settings.units)
  return settings
}

export async function saveSettings(patch) {
  const previous = await getSettings()
  const next = derive({ ...previous, ...patch })
  await write(async () => (await db()).put('settings', next, 'settings'))
  settingsCache = next

  // Today is not history yet, so a target changed now applies to the day in
  // progress. Past days keep whatever was in force when they were logged —
  // that is the whole point of the snapshot, and re-stamping them here would
  // undo it.
  if (patch.targets && JSON.stringify(patch.targets) !== JSON.stringify(previous.targets)) {
    await putDayTargets(todayStr(), next.targets)
  }

  emit('settings')
  return next
}

/** Shallow-merges into `profile` rather than replacing it, unlike saveSettings. */
export async function saveProfile(patch) {
  const settings = await getSettings()
  return saveSettings({ profile: { ...settings.profile, ...patch } })
}

/* --------------------------------------------------------------- the plate */

/**
 * The staging area: foods assembled but not yet logged.
 *
 * Stored under its own key in the `settings` store, which is a plain keyval —
 * so this needs no schema change, and `getSettings` and `exportAll` both only
 * ever read the `'settings'` key, which keeps a draft out of the settings
 * object and out of backups by construction. A backup of something you have not
 * logged yet is noise.
 *
 * Persisted rather than held in memory because a plate outlives the sheet. The
 * phone locks mid-assembly, a notification steals focus, you go and check what
 * is left on Today — none of those should throw away four taps of work.
 */
export const EMPTY_PLATE = { items: [], date: null, block: null, startedAt: null }

export async function getPlate() {
  const stored = await (await db()).get('settings', 'plate')
  return stored?.items ? stored : { ...EMPTY_PLATE }
}

export async function savePlate(plate) {
  await write(async () => (await db()).put('settings', plate, 'plate'))
  emit('plate')
  return plate
}

export async function clearPlate() {
  await write(async () => (await db()).delete('settings', 'plate'))
  emit('plate')
}

/* --------------------------------------------------------------- day targets */

/**
 * A day's row in History should read against the target that was in force when
 * it was logged, not against whatever the target happens to be today. Changing
 * a goal in August must not silently rewrite how March went.
 */
export async function putDayTargets(date, targets) {
  const record = { date, targets: { ...targets }, savedAt: Date.now() }
  await write(async () => (await db()).put('dayTargets', record))
  emit('dayTargets')
  return record
}

/**
 * Stamp the day the first time anything is logged into it. First write wins:
 * the target in force when you started logging is the one the day is judged by.
 */
export async function ensureDayTargets(date) {
  if (!date) return null
  const existing = await (await db()).get('dayTargets', date)
  if (existing) return existing
  const { targets } = await getSettings()
  return putDayTargets(date, targets)
}

/** Falls back to the current target for days that were never stamped. */
export async function getDayTargets(date) {
  const stored = await (await db()).get('dayTargets', date)
  if (stored?.targets) return stored.targets
  return (await getSettings()).targets
}

/**
 * Bulk read for History, which needs one target per row and should not do a
 * round trip per day to get them.
 */
export async function dayTargetsInRange(from, to) {
  const rows = await (await db()).getAll('dayTargets', IDBKeyRange.bound(from, to))
  return new Map(rows.map((r) => [r.date, r.targets]))
}

/* ------------------------------------------------------------------- foods */

const withSearchKey = (food) => ({
  ...food,
  nameLower: `${food.name} ${food.brand || ''}`.toLowerCase().trim(),
})

export async function listFoods() {
  return (await db()).getAll('foods')
}

export async function getFood(id) {
  return (await db()).get('foods', id)
}

export async function putFood(food) {
  const record = withSearchKey({
    source: 'custom',
    createdAt: Date.now(),
    lastUsedAt: 0,
    useCount: 0,
    ...food,
    id: food.id || uid(),
  })
  await write(async () => (await db()).put('foods', record))
  emit('foods')
  return record
}

export async function deleteFood(id) {
  await write(async () => (await db()).delete('foods', id))
  // Historical entries are deliberately left alone; `computed` was snapshotted.
  const settings = await getSettings()
  const favourites = settings.favourites.filter((f) => !(f.type === 'food' && f.id === id))
  if (favourites.length !== settings.favourites.length) await saveSettings({ favourites })
  emit('foods')
}

export async function findFoodByBarcode(barcode) {
  if (!barcode) return undefined
  return (await db()).getFromIndex('foods', 'barcode', barcode)
}

/**
 * Bump recency. Called on every log, which is what drives the Recents list.
 *
 * `lastQuantity`/`lastUnit` are an addition to the spec's food shape. Recents
 * promises "last used serving prefilled", and that has to be remembered
 * somewhere — the alternative is scanning the entries index on every open of
 * the add sheet, which is the one place latency is unacceptable.
 */
export async function touchFood(id, { quantity, unit } = {}) {
  const d = await db()
  const food = await d.get('foods', id)
  if (!food) return
  food.lastUsedAt = Date.now()
  food.useCount = (food.useCount || 0) + 1
  if (quantity != null) food.lastQuantity = quantity
  if (unit != null) food.lastUnit = unit
  await write(async () => d.put('foods', food))
  emit('foods')
}

/** Local library search. Always available, network or not. */
export async function searchFoods(query, limit = 50) {
  const q = query.trim().toLowerCase()
  const all = await listFoods()
  if (!q) return all.sort((a, b) => (b.useCount || 0) - (a.useCount || 0)).slice(0, limit)
  const terms = q.split(/\s+/)
  return all
    .map((food) => {
      const hay = food.nameLower || `${food.name} ${food.brand || ''}`.toLowerCase()
      if (!terms.every((t) => hay.includes(t))) return null
      // Prefix matches beat mid-string ones; ties break on how often it is used.
      const score = (hay.startsWith(terms[0]) ? 1000 : 0) + (food.useCount || 0)
      return { food, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.food)
}

export async function recentFoods(limit = 30) {
  const all = await listFoods()
  return all
    .filter((f) => f.lastUsedAt > 0)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, limit)
}

/* ----------------------------------------------------------------- entries */

export async function listEntries(date) {
  const rows = await (await db()).getAllFromIndex('entries', 'date', date)
  return rows.sort((a, b) => a.createdAt - b.createdAt)
}

export async function entriesInRange(from, to) {
  return (await db()).getAllFromIndex('entries', 'date', IDBKeyRange.bound(from, to))
}

export async function getEntry(id) {
  return (await db()).get('entries', id)
}

export async function putEntry(entry) {
  const record = { createdAt: Date.now(), ...entry, id: entry.id || uid() }
  await write(async () => (await db()).put('entries', record))
  await ensureDayTargets(record.date)
  emit('entries')
  return record
}

export async function deleteEntry(id) {
  await write(async () => (await db()).delete('entries', id))
  emit('entries')
}

export async function countEntriesForFood(id) {
  return (await db()).countFromIndex('entries', 'foodId', id)
}

/**
 * The earliest date with an entry, or null if nothing has ever been logged.
 *
 * History only ever needed these two facts, and used to get them by cursoring
 * over every entry key in the database to build a set of distinct dates — then
 * reading the same range again for the entries themselves. Two full passes per
 * visit to learn where to start. The `date` index is already sorted, so the
 * first key is one read.
 */
export async function firstLoggedDate() {
  const cursor = await (await db()).transaction('entries').store.index('date').openKeyCursor()
  return cursor ? cursor.key : null
}

/* ------------------------------------------------------------------- meals */

export async function listMeals() {
  return (await db()).getAll('meals')
}

export async function getMeal(id) {
  return (await db()).get('meals', id)
}

export async function putMeal(meal) {
  const record = { createdAt: Date.now(), useCount: 0, ...meal, id: meal.id || uid() }
  await write(async () => (await db()).put('meals', record))
  emit('meals')
  return record
}

export async function deleteMeal(id) {
  await write(async () => (await db()).delete('meals', id))
  const settings = await getSettings()
  const favourites = settings.favourites.filter((f) => !(f.type === 'meal' && f.id === id))
  if (favourites.length !== settings.favourites.length) await saveSettings({ favourites })
  emit('meals')
}

/* ----------------------------------------------------------------- weights */

export async function listWeights() {
  const rows = await (await db()).getAll('weights')
  return rows.sort((a, b) => a.date.localeCompare(b.date))
}

export async function getWeight(date) {
  return (await db()).get('weights', date)
}

/** One per day. A second value for the same date overwrites, never appends. */
export async function putWeight(date, kg) {
  const record = { date, kg: Number(kg), createdAt: Date.now() }
  await write(async () => (await db()).put('weights', record))
  emit('weights')
  return record
}

export async function deleteWeight(date) {
  await write(async () => (await db()).delete('weights', date))
  emit('weights')
}

/* -------------------------------------------------------------- favourites */

export async function isFavourite(type, id) {
  const { favourites } = await getSettings()
  return favourites.some((f) => f.type === type && f.id === id)
}

export async function toggleFavourite(type, id) {
  const settings = await getSettings()
  const exists = settings.favourites.some((f) => f.type === type && f.id === id)
  const favourites = exists
    ? settings.favourites.filter((f) => !(f.type === type && f.id === id))
    : [...settings.favourites, { type, id }]
  await saveSettings({ favourites })
  return !exists
}

export async function moveFavourite(index, delta) {
  const settings = await getSettings()
  const favourites = [...settings.favourites]
  const target = index + delta
  if (target < 0 || target >= favourites.length) return
  ;[favourites[index], favourites[target]] = [favourites[target], favourites[index]]
  await saveSettings({ favourites })
}

/* ------------------------------------------------------------ export/import */

export const EXPORT_FORMAT = 'macro-tracker-export'

export async function exportAll() {
  const d = await db()
  const rows = await Promise.all(DATA_STORES.map((store) => d.getAll(store)))
  return {
    format: EXPORT_FORMAT,
    version: DB_VERSION,
    exportedAt: new Date().toISOString(),
    exportedOn: todayStr(),
    settings: await getSettings(),
    ...Object.fromEntries(DATA_STORES.map((store, i) => [store, rows[i]])),
  }
}

export function validateImport(data) {
  if (!data || typeof data !== 'object') throw new Error('That file is not valid JSON.')
  if (data.format !== EXPORT_FORMAT) {
    throw new Error('That file was not exported from Macro Tracker.')
  }
  // A store missing entirely is fine — an export taken before it existed.
  for (const key of DATA_STORES) {
    if (data[key] && !Array.isArray(data[key])) throw new Error(`The "${key}" data is malformed.`)
  }
  return true
}

/** What a merge or replace would actually change, shown before committing. */
export async function previewImport(data, mode) {
  validateImport(data)
  const d = await db()
  const counts = {}
  for (const store of DATA_STORES) {
    const incoming = data[store] || []
    const existingKeys = new Set(await d.getAllKeys(store))
    const key = keyPathFor(store)
    const overlapping = incoming.filter((r) => existingKeys.has(r?.[key])).length
    counts[store] = {
      existing: existingKeys.size,
      incoming: incoming.length,
      added: incoming.length - overlapping,
      overwritten: overlapping,
      removed: mode === 'replace' ? existingKeys.size : 0,
      after: mode === 'replace' ? incoming.length : existingKeys.size + (incoming.length - overlapping),
    }
  }
  return counts
}

export async function importAll(data, mode = 'merge') {
  validateImport(data)
  const d = await db()
  const stores = [...DATA_STORES, 'settings']

  await write(async () => {
    const tx = d.transaction(stores, 'readwrite')
    if (mode === 'replace') {
      for (const store of stores) tx.objectStore(store).clear()
    }
    for (const store of DATA_STORES) {
      const rows = data[store] || []
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue
        tx.objectStore(store).put(store === 'foods' ? withSearchKey(row) : row)
      }
    }
    // Settings only come across on a replace. Merging someone else's targets
    // into a live app is a surprise nobody asked for.
    if (mode === 'replace' && data.settings) {
      tx.objectStore('settings').put(data.settings, 'settings')
    }
    await tx.done
  })

  settingsCache = null
  emit('all')
}

export async function clearAll() {
  const d = await db()
  const stores = [...DATA_STORES, 'settings']
  const tx = d.transaction(stores, 'readwrite')
  for (const store of stores) tx.objectStore(store).clear()
  await tx.done
  settingsCache = null
  emit('all')
}

/** Rough footprint, shown in Settings so "export it" has a sense of scale. */
export async function storageEstimate() {
  try {
    const est = await navigator.storage?.estimate?.()
    return est || null
  } catch {
    return null
  }
}
