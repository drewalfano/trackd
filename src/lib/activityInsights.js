import { AVERAGES_MIN_DAYS } from './compute.js'
import { addDays, formatDayShort, toDateStr } from './dates.js'
import { kcalGrouped, pluralize } from './format.js'
import { dayState } from './insights.js'
import { MIN_FULL_DAYS, windowLabel } from './maintenance.js'
import { MIN_ENTRIES_FOR_TREND, pointsIn, smoothTrend } from './trend.js'

/**
 * Reads that put Apple Health totals beside the food log and the scale. Pure:
 * no DOM, no database. Each is null below its threshold.
 *
 * `days` is newest first, the shape `loadDays` returns. `activity` is the
 * stored rows in any order. A missing reading is null and is never a zero.
 *
 * **Every window ends yesterday.** Today's steps, burn and intake are all
 * still arriving, and a half day in a mean is a low day that never happened.
 */

export const BURN_DAYS = 28
/** In each third, so eighteen usable days in all. */
export const MIN_BURN_GROUP = 6
/** Below this the Watch was barely worn. The burn comparison only. */
export const LOW_WEAR_KCAL = 50

export const SLEEP_DAYS = 90
export const MIN_SLEEP_GROUP = 5
export const SHORT_SLEEP_MIN = 6 * 60
export const LONG_SLEEP_MIN = 7 * 60

export const STEP_WEEKS = 6
/** Weeks that need both halves before the table is worth drawing. */
export const MIN_PAIRED_WEEKS = 2

/** The last `n` finished days. */
const finishedSpan = (n, today) => ({ start: addDays(today, -n), end: addDays(today, -1) })
const inSpan = ({ start, end }) => (row) => row.date >= start && row.date <= end
const mean = (values) => values.reduce((sum, v) => sum + v, 0) / values.length

/**
 * Steps and burn stop short on a row written on its own date, and stay short
 * once that date is no longer today. Importing again replaces the row's
 * `importedAt` along with its values, which is what makes it whole.
 *
 * Sleep is not held to this: it is filed under the waking date and over by then.
 */
const isFinished = (row) =>
  !(row.importedAt > 0) || toDateStr(new Date(row.importedAt)) > row.date

/** The readings of one daily total inside a span, as `{ date, value }`. */
const readings = (activity, metric, span) =>
  activity
    .filter((row) => inSpan(span)(row) && row[metric] != null && isFinished(row))
    .map((row) => ({ date: row.date, value: row[metric] }))

const averageOf = (activity, metric, span, minDays) => {
  const found = readings(activity, metric, span)
  return {
    mean: found.length >= minDays ? mean(found.map((r) => r.value)) : null,
    days: found.length,
  }
}

/**
 * Steps and burn over the last seven finished days. Each has its own day count,
 * since a Watch left off loses the burn and the phone still counts steps. Null
 * only with nothing imported at all.
 */
export function activityAverages({ activity, today }) {
  if (!activity.length) return null
  const span = finishedSpan(7, today)
  return {
    steps: averageOf(activity, 'steps', span, AVERAGES_MIN_DAYS),
    activeKcal: averageOf(activity, 'activeKcal', span, AVERAGES_MIN_DAYS),
    ...span,
  }
}

/** Intake on the highest-burn third of full days beside the lowest third. */
export function burnVsIntake({ days, activity, targets, today }) {
  const span = finishedSpan(BURN_DAYS, today)
  const burned = new Map(readings(activity, 'activeKcal', span).map((r) => [r.date, r.value]))
  const full = days
    .filter((d) => burned.has(d.date) && dayState(d, targets) === 'full')
    .map((d) => ({ date: d.date, active: burned.get(d.date), intake: d.totals?.kcal || 0 }))
  const worn = full.filter((d) => d.active >= LOW_WEAR_KCAL)
  const size = Math.floor(worn.length / 3)
  if (size < MIN_BURN_GROUP) return null

  const ranked = worn.sort((a, b) => a.active - b.active || a.date.localeCompare(b.date))
  const low = ranked.slice(0, size)
  const high = ranked.slice(-size)
  // The whole middle third is level with both ends, so neither end is an end.
  if (low.at(-1).active === high[0].active) return null

  const group = (rows) => ({
    days: rows.length,
    active: mean(rows.map((r) => r.active)),
    intake: mean(rows.map((r) => r.intake)),
  })
  return {
    high: group(high),
    low: group(low),
    fullDays: worn.length,
    leftOut: full.length - worn.length,
    ...span,
  }
}

/**
 * Weekly mean steps and the change in the weight trend, oldest week first.
 *
 * The change is between the trend at the last weigh-in of this week and of the
 * week before, so a week with no weigh-in on either side has none: the trend is
 * only carried flat there, and that would print as no change.
 */
export function stepsAndTrend({ activity, weights, today, trendWindow = 7 }) {
  const span = finishedSpan(STEP_WEEKS * 7, today)
  const points = smoothTrend(weights, trendWindow)
  const weighIns = pointsIn(points, span).length
  const weeks = Array.from({ length: STEP_WEEKS }, (_, i) => {
    const start = addDays(span.start, i * 7)
    const week = { start, end: addDays(start, 6) }
    const here = pointsIn(points, week)
    const before = pointsIn(points, { start: addDays(start, -7), end: addDays(start, -1) })
    return {
      ...week,
      steps: averageOf(activity, 'steps', week, AVERAGES_MIN_DAYS),
      weighIns: here.length,
      changeKg:
        weighIns >= MIN_ENTRIES_FOR_TREND && here.length && before.length
          ? here.at(-1).trend - before.at(-1).trend
          : null,
    }
  })
  const paired = weeks.filter((w) => w.steps.mean != null && w.changeKg != null)
  if (paired.length < MIN_PAIRED_WEEKS) return null
  return { weeks, stepDays: readings(activity, 'steps', span).length, weighIns, ...span }
}

/**
 * Intake after a short night beside intake after a long one.
 *
 * **`sleepMinutes` is filed under the date it ended**, so the day after a night
 * is that same date, with nothing added to it.
 */
export function sleepVsIntake({ days, activity, targets, today }) {
  const span = finishedSpan(SLEEP_DAYS, today)
  const slept = new Map(
    activity.filter((r) => r.sleepMinutes != null).map((r) => [r.date, r.sleepMinutes]),
  )
  const full = days.filter(
    (d) => inSpan(span)(d) && slept.has(d.date) && dayState(d, targets) === 'full',
  )
  const group = (test) => full.filter((d) => test(slept.get(d.date)))
  const short = group((m) => m < SHORT_SLEEP_MIN)
  const long = group((m) => m >= LONG_SLEEP_MIN)
  if (short.length < MIN_SLEEP_GROUP || long.length < MIN_SLEEP_GROUP) return null
  const read = (rows) => ({ days: rows.length, intake: mean(rows.map((d) => d.totals?.kcal || 0)) })
  return { short: read(short), long: read(long), fullDays: full.length, ...span }
}

/**
 * Mean burn over the maintenance window, less today. Context beside the
 * estimate and no part of it. Held to the estimate's own floor for a mean over
 * that window.
 */
export function windowActiveKcal({ activity, span, today }) {
  const yesterday = addDays(today, -1)
  const window = { start: span.start, end: span.end < yesterday ? span.end : yesterday }
  const read = averageOf(activity, 'activeKcal', window, MIN_FULL_DAYS)
  return read.mean == null ? null : { kcal: read.mean, days: read.days, ...window }
}

/* ------------------------------------------------------------------- copy */

export const NO_ACTIVITY = 'Import from Apple Health in Settings'

export const burnSentence = ({ high, low }) =>
  `On your ${high.days} highest-burn days (avg ${kcalGrouped(high.active)} active cal) you ate ` +
  `${kcalGrouped(high.intake)} cal on average. On your ${low.days} lowest ` +
  `(avg ${kcalGrouped(low.active)}) you ate ${kcalGrouped(low.intake)}.`

export const burnBasis = (r) =>
  [
    `From ${r.fullDays} full days with active calories`,
    windowLabel(r),
    r.leftOut ? `${pluralize(r.leftOut, 'day')} under ${LOW_WEAR_KCAL} active cal left out` : null,
  ]
    .filter(Boolean)
    .join(' · ')

export const sleepSentence = ({ short, long }) =>
  `On the ${short.days} days after under 6 h of sleep you ate ${kcalGrouped(short.intake)} cal on ` +
  `average. On the ${long.days} days after 7 h or more you ate ${kcalGrouped(long.intake)}.`

export const sleepBasis = (r) =>
  `From ${r.fullDays} full days with sleep readings · ${windowLabel(r)}`

export const stepsBasis = (r) =>
  `From ${r.stepDays} days of steps and ${pluralize(r.weighIns, 'weigh-in')} · ${windowLabel(r)}`

/** What an average is waiting for, in place of it. */
export const averageMissing = ({ days }) => `Needs ${AVERAGES_MIN_DAYS} days (${days} so far)`

/** The newest date with any reading, for when none falls in the window. */
export const latestLabel = (activity) =>
  `Latest reading ${formatDayShort(activity.reduce((max, r) => (r.date > max ? r.date : max), ''))}`
