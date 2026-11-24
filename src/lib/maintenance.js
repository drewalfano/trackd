import { dayState } from './insights.js'
import { computeTrend, pointsIn, ratePerWeek, rangeSpan, MIN_ENTRIES_FOR_TREND } from './trend.js'
import { KCAL_PER_KG } from './targets.js'
import { formatDayShort, todayStr } from './dates.js'
import { kcalGrouped, kgToUnit, pluralize, round } from './format.js'

/**
 * Maintenance calories, estimated from what was logged and what the weight
 * trend did over the same days. Pure: no DOM, no database.
 *
 * Intake less the energy the trend's change accounts for. Someone whose trend
 * held level maintained on what they ate, and the rest is that sentence with
 * the change taken out of it.
 *
 * Distinct from `suggestTarget` in targets.js, whose maintenance figure is a
 * formula over body stats. Nothing here reads or writes a target.
 */

export const MAINTENANCE_DAYS = 28

/** Half the default window. Below it the mean is a claim about too few days. */
export const MIN_FULL_DAYS = 14

/**
 * `days` is newest first, the shape `loadDays` returns, with today at index 0.
 * `weights` is ascending and in kilograms.
 *
 * `unit` is accepted and never read: storage is kilograms, so the estimate
 * cannot depend on the unit it is shown beside, and a test holds it to that.
 * `trendWindow` is the Trend window setting, so the rate here is the slope of
 * the same line the Weight page draws.
 *
 * `kcal` is null, with a reason, whenever either half is short of data.
 */
export function estimateMaintenance({
  days,
  weights,
  targets,
  windowDays = MAINTENANCE_DAYS,
  trendWindow = 7,
}) {
  const span = rangeSpan(windowDays, days[0]?.date ?? todayStr())
  const full = days.filter(
    (d) => d.date >= span.start && d.date <= span.end && dayState(d, targets) === 'full',
  )
  const points = pointsIn(computeTrend(weights, trendWindow), span)
  const basis = {
    fullDays: full.length,
    weighIns: points.filter((p) => p.kg != null).length,
  }

  if (full.length < MIN_FULL_DAYS) return { kcal: null, reason: 'intake', ...basis }
  const rate = ratePerWeek(points)
  if (rate == null) return { kcal: null, reason: 'weight', ...basis }

  const intake = full.reduce((sum, d) => sum + (d.totals?.kcal || 0), 0) / full.length
  return {
    kcal: Math.round((intake - (rate * KCAL_PER_KG) / 7) / 10) * 10,
    intake,
    ratePerWeekKg: rate,
    ...basis,
    ...span,
  }
}

/** How far back the page goes. */
export const HISTORY_WEEKS = 16

/**
 * The same estimate as it stood one week ago, two weeks ago and so on, newest
 * first. Each is a full window of its own, so neighbours share three weeks of
 * days. Weeks before the first one with any full day are left off; a short week
 * inside the record stays, with what it was missing.
 */
export function maintenanceHistory({ days, weeks = HISTORY_WEEKS, ...rest }) {
  const out = []
  for (let w = 1; w <= weeks && w * 7 < days.length; w++) {
    const past = days.slice(w * 7)
    out.push({ end: past[0].date, ...estimateMaintenance({ ...rest, days: past }) })
  }
  while (out.length && !out.at(-1).fullDays) out.pop()
  return out
}

/* ------------------------------------------------------------------- copy */

/** `Oct 27 to Nov 23`. */
export const windowLabel = ({ start, end }) => `${formatDayShort(start)} to ${formatDayShort(end)}`

/** What the number was drawn from: both counts, since it stands on both. */
export const basisLabel = ({ fullDays, weighIns }) =>
  `From ${pluralize(fullDays, 'logged day')} and ${pluralize(weighIns, 'weigh-in')}`

/**
 * What is missing, in place of the number.
 *
 * `reason: 'weight'` is two shortfalls, because `ratePerWeek` has two gates.
 * Two readings three weeks apart do not need more weeks, so the count is
 * named when it is the count.
 */
export function missingLabel({ reason, fullDays, weighIns }) {
  if (reason === 'intake') return `Needs ${MIN_FULL_DAYS} full days logged (${fullDays} so far)`
  if (weighIns < MIN_ENTRIES_FOR_TREND) {
    return `Needs ${MIN_ENTRIES_FOR_TREND} weigh-ins in ${MAINTENANCE_DAYS} days (${weighIns} so far)`
  }
  return 'Needs 2 weeks of weigh-ins'
}

/** One sentence that describes. The direction is read off the printed figure. */
export function maintenanceSentence({ intake, ratePerWeekKg }, unit) {
  const rate = round(kgToUnit(ratePerWeekKg, unit), 1)
  const moved = rate === 0 ? 'held level' : rate < 0 ? 'fell' : 'rose'
  const trend = rate === 0 ? moved : `${moved} ${Math.abs(rate).toFixed(1)} ${unit} a week`
  return `Average intake was ${kcalGrouped(intake)} cal while the weight trend ${trend}.`
}
