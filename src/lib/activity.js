import { ACTIVITY_METRICS, ImportError, checkActivityMetrics, isDay, isObject } from './backup.js'
import { fromDateStr, todayStr } from './dates.js'
import { pluralize } from './format.js'

/**
 * Daily Apple Watch totals, as an iOS Shortcut writes them. Pure: no DOM, no
 * database.
 *
 * The file is checked whole before any of it is merged, on the terms backup.js
 * sets out: a malformed row refuses the file rather than being skipped.
 */

export const ACTIVITY_FORMAT = 'trackd-health-activity'
export const ACTIVITY_VERSION = 1

const METRICS = Object.keys(ACTIVITY_METRICS)

/**
 * Check a parsed file and hand back one row per date, oldest first.
 *
 * Two rows for one date collapse to the later one, whole, and are counted in
 * `duplicates`: the rule `validateImport` has for a repeated key. A null only
 * gives way to a value already stored, which an earlier row in the file is not.
 *
 * A date with no reading at all is valid and has nothing to store, so it is
 * left out and counted in `noData`.
 */
export function validateActivityFile(data) {
  if (!isObject(data)) throw new ImportError('That file is not an Apple Health activity file.')
  if (data.format !== ACTIVITY_FORMAT) {
    throw new ImportError('That file is not an Apple Health activity file.')
  }
  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new ImportError('That file has a bad version number.')
  }
  if (data.version > ACTIVITY_VERSION) {
    throw new ImportError('That file needs a newer version of Trackd. Update the app, then import it.')
  }
  if (!Array.isArray(data.days)) throw new ImportError('The "days" data is malformed.')

  const byDate = new Map()
  data.days.forEach((row, i) => {
    if (!isObject(row)) throw new ImportError(`Day ${i + 1} is not a record.`)
    if (!isDay(row.date)) throw new ImportError(`Day ${i + 1} has no valid date.`)
    byDate.set(row.date, { date: row.date, ...checkActivityMetrics(row, `Activity for ${row.date}`) })
  })

  const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
  const days = all.filter((row) => METRICS.some((m) => row[m] != null))
  return { days, noData: all.length - days.length, duplicates: data.days.length - all.length }
}

/** `incoming` over `row`, a null leaving what was there. */
function overlay(row, incoming) {
  const out = { ...row }
  for (const m of METRICS) out[m] = incoming[m] ?? row[m] ?? null
  return out
}

/**
 * `rows` is only what has to be written. A date whose values already match is
 * left out, so it keeps the `importedAt` it has.
 *
 * `overwritten` counts stored dates that would change, not dates that are
 * merely present in both.
 */
export function mergeActivity(existing, days, importedAt) {
  const stored = new Map(existing.map((row) => [row.date, row]))
  const rows = []
  let overwritten = 0
  for (const day of days) {
    const before = stored.get(day.date)
    const next = overlay(before ?? { date: day.date }, day)
    if (before && METRICS.every((m) => (before[m] ?? null) === next[m])) continue
    if (before) overwritten++
    rows.push({ ...next, importedAt })
  }
  return {
    rows,
    total: days.length,
    start: days[0]?.date ?? null,
    end: days.at(-1)?.date ?? null,
    overwritten,
  }
}

/* ------------------------------------------------------------------- copy */

/** `Oct 12 to Nov 22`, with years once the span is not all this year. */
export function spanLabel(start, end, today) {
  const years = new Set([start, end, today].map((d) => d.slice(0, 4)))
  const label = (d) =>
    fromDateStr(d).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: years.size > 1 ? 'numeric' : undefined,
    })
  return start === end ? label(start) : `${label(start)} to ${label(end)}`
}

/** `42 days · Oct 12 to Nov 22 · 3 overwrite existing`. */
export function activitySummary({ rows, total, start, end, overwritten }, today = todayStr()) {
  if (!total) return 'No days with readings in that file'
  const parts = [pluralize(total, 'day'), spanLabel(start, end, today)]
  if (!rows.length) parts.push('all already stored')
  else if (overwritten) parts.push(`${overwritten} overwrite${overwritten === 1 ? 's' : ''} existing`)
  return parts.join(' · ')
}

export const duplicatesLabel = (n) =>
  `${pluralize(n, 'row')} in the file ${n === 1 ? 'repeats' : 'repeat'} an earlier date and will be counted once, keeping the later copy.`

export const noDataLabel = (n) =>
  `${pluralize(n, 'day')} in the file ${n === 1 ? 'has' : 'have'} no readings and will not be stored.`
