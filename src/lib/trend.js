import { addDays, daysBetween } from './dates.js'

/**
 * Weight smoothing.
 *
 * Daily scale weight is mostly water, and the useful signal is the trend under
 * it. This uses an exponentially weighted moving average rather than a centred
 * one so that the most recent value is always a real endpoint — a centred
 * average cannot produce a value for today without inventing tomorrow.
 *
 * **Weighted by elapsed days, not by entry count.** It was `alpha = 2/(N+1)`
 * per READING, which is only a statement about time for someone who weighs in
 * every day. Eight readings in ninety days got exactly the smoothing a daily
 * week gets, so the line had no idea a fortnight had passed between two of
 * them, and the rate fitted through it read `-0.1 lb / week` over a chart that
 * had dropped about 2.5 lb in thirteen weeks. Now the old trend keeps
 * `2^(-days / half-life)` of its weight, so a reading counts for more the
 * longer it has been since the last one, which is what a reading after a gap
 * actually is: the only news in that time.
 */

/**
 * How many weigh-ins IN THE DRAWN RANGE the trend line and the weekly rate
 * need before either is shown.
 *
 * It was 7, and the reason given was that it matched the 7-entry EWMA. That
 * reason went with the entry-count EWMA: the smoothing is in days now, so a
 * count gate no longer has a window to match, and at 7 someone who weighs in
 * twice a week waited most of a month for a line. 3 is the fewest readings a
 * slope can be fitted through and still have a residual, so it is the floor
 * for the rate, and the line takes the same floor because the rate IS the
 * line's slope: a range that can carry one can carry the other.
 */
export const MIN_ENTRIES_FOR_TREND = 3

/**
 * The longest gap the trend is allowed to see, in days.
 *
 * Uncapped, a reading after a long gap takes almost all of the trend: after
 * 12 days at the half-life below the old trend keeps 55%, after a month 23%,
 * after three months nothing. That is the right arithmetic and the wrong
 * answer, because a single reading after time away is one noisy sample, not a
 * month of evidence, and it was a single low weigh-in at the end of a sparse
 * history that yanked the whole line down. Past a week the trend treats the
 * gap as a week, so one reading can move it at most `1 - 2^(-7/14)` of the way,
 * 29% on the default setting.
 */
export const GAP_CAP_DAYS = 7

/**
 * The half-life of the trend, in days, for the `Trend window` setting.
 *
 * **Twice the window, and that is a change, so here is why.** The literal
 * carry-over of the old strength, `2/(7+1) = 0.25` per day, gives a reading
 * after the capped 7-day gap `1 - 0.75^7 = 87%` of the trend, which is the
 * yank the gap cap exists to stop, just limited to 87% instead of 97%. With
 * the window as the half-life (7 days) it is 50%, a reading after a week
 * counting as much as everything before it. Measured against the sparse
 * fixture (8 weigh-ins in 90 days, the last 3 lb low) that still bent the end
 * of the line down 1.7 lb, more than the old chart's 1.0 lb step it was meant
 * to fix.
 *
 * At twice the window a reading after a week or more counts 29%, and the same
 * fixture ends 1.2 lb down on a smooth curve. A daily reading counts 4.8%,
 * close to the 10% per day the Hacker's Diet trend uses, and smoother.
 *
 * What it costs: on a steady loss the trend sits behind the scale by about
 * three weeks of that loss, so a daily weigher losing 1 lb a week sees a trend
 * about 2.8 lb above today's reading. The weekly RATE is unaffected, because
 * a lag shifts the line without tilting it.
 */
export const trendHalfLife = (window = 7) => 2 * window

/**
 * The narrowest y-axis the weight chart may draw, in the unit it is drawing in.
 *
 * **A chart that fits its axis to its data reports every dataset as the same
 * amount of movement.** The chart auto-fitted with a floor on the PADDING —
 * `max((max - min) * 0.15, 0.4)` — which made the narrowest axis it could ever
 * produce 0.8 wide. Two weigh-ins 0.8 lb apart therefore filled it corner to
 * corner, and seven readings of overnight water noise drew a line with peaks
 * and valleys in it above a readout saying `+0.1 lb / week`. The line was
 * drawing the noise at the same amplitude a real cut would get.
 *
 * 4 lb rather than 5. Day-to-day scale weight swings about a pound or two on
 * water alone, so at 4 the raw dots still scatter visibly — that IS what a
 * bathroom scale does, and flattening it away would be its own kind of lie —
 * while the smoothed line through them goes nearly flat, which is the true
 * statement. A sustainable half to one pound a week fills most of the height
 * over a 30-day window; at a 5 lb floor a genuinely good month would read as
 * less than it was.
 *
 * Per unit rather than one canonical figure converted, because the axis labels
 * are drawn in the display unit and a single 1.8 kg floor lands on a 3.97 lb
 * axis. The old 0.4 was worse than imprecise here: it was unit-blind, so the
 * same fortnight looked 2.2× flatter to someone reading kilograms.
 */
export const MIN_AXIS_SPAN = { lb: 4, kg: 2 }

/** How much of the axis sits above the data, when the data is what sets it. */
const AXIS_PAD = 0.15

/**
 * The y-axis for a set of values, already in display units.
 *
 * Pure, exported and unit-aware so it can be tested — it was inline in the
 * chart, where the only way to check the span was to draw one and look.
 */
export function axisBounds(values, unit = 'kg') {
  if (!values.length) return { min: 0, max: 1 }

  const dataMin = Math.min(...values)
  const dataMax = Math.max(...values)
  const pad = (dataMax - dataMin) * AXIS_PAD
  let min = dataMin - pad
  let max = dataMax + pad

  // The floor is on the SPAN, not on the padding, which is the whole
  // correction: padding scales with the data and so can never rescue a dataset
  // that has nearly none.
  const floor = MIN_AXIS_SPAN[unit] ?? MIN_AXIS_SPAN.kg
  if (max - min < floor) {
    const mid = (dataMin + dataMax) / 2
    min = mid - floor / 2
    max = mid + floor / 2
  }

  return { min, max }
}

/**
 * The shortest history that can carry a per-week figure.
 *
 * `ratePerWeek` is a least-squares slope, and least squares will happily fit a
 * line to eight days of water weight and report it to a tenth of a pound. The
 * count gate on the trend line does not catch this: three readings inside four
 * days clears it, and the rate that comes out the other side — `+0.1 lb / week`
 * — is an extrapolation from noise wearing the same type as a measurement.
 *
 * Two weeks is the shortest window in which a weekly rate is a rate rather than
 * a restatement of a couple of days.
 */
export const MIN_RATE_DAYS = 14

/**
 * Fill the calendar between the first and last weigh-in, leaving gaps as null.
 * @returns {{date: string, kg: number|null}[]} ascending
 */
export function dailySeries(weights) {
  if (!weights.length) return []
  const byDate = new Map(weights.map((w) => [w.date, w.kg]))
  const first = weights[0].date
  const last = weights[weights.length - 1].date
  const span = daysBetween(first, last)

  return Array.from({ length: span + 1 }, (_, i) => {
    const date = addDays(first, i)
    return { date, kg: byDate.has(date) ? byDate.get(date) : null }
  })
}

/**
 * The trend at each weigh-in, by the elapsed-days EWMA described at the top.
 *
 * One point per reading rather than one per day, because those are the only
 * days the trend has news on. Between readings the trend is not a value the
 * app knows; the chart draws a curve through these points and nothing else.
 *
 * No gate here. The trend exists from the first reading (it IS the first
 * reading), and whether there is enough of it to show is a question about a
 * drawn range, answered where the range is: see `MIN_ENTRIES_FOR_TREND`.
 *
 * @param {{date: string, kg: number}[]} weights ascending, one per day
 * @param {number} window the `Trend window` setting, 7 or 14
 * @returns {{date: string, kg: number, trend: number}[]}
 */
export function smoothTrend(weights, window = 7) {
  const halfLife = trendHalfLife(window)
  let trend = null
  let prev = null
  return weights.map((w) => {
    if (trend == null) {
      trend = w.kg
    } else {
      const gap = Math.min(daysBetween(prev, w.date), GAP_CAP_DAYS)
      const alpha = 1 - 2 ** (-gap / halfLife)
      trend += alpha * (w.kg - trend)
    }
    prev = w.date
    return { date: w.date, kg: w.kg, trend }
  })
}

/**
 * The same trend on a calendar: every day from the first weigh-in to the last,
 * `kg` null on days without one, `trend` carried flat across them.
 *
 * Only the Weight tile's sparkline reads this shape now, because it spaces its
 * line by day index. The chart page reads `smoothTrend` directly.
 *
 * @returns {{date: string, kg: number|null, trend: number}[]}
 */
export function computeTrend(weights, window = 7) {
  const byDate = new Map(smoothTrend(weights, window).map((p) => [p.date, p.trend]))
  let trend = null
  return dailySeries(weights).map((p) => {
    if (byDate.has(p.date)) trend = byDate.get(p.date)
    return { ...p, trend }
  })
}

/**
 * Average change per week across the given points: the least-squares slope of
 * the TREND at each weigh-in in them, times seven.
 *
 * **Fitted through the line, not through the scale.** The number sits above a
 * chart whose heavy line is these same trend values, so fitting anything else
 * lets the two disagree, and they did: the fit used to run over a daily series
 * that carried the trend flat between readings, and on a sparse history those
 * flat runs outvoted the readings. Eight weigh-ins over ninety days became 78
 * mostly level points and a `-0.1 lb / week` under a line that fell 2.5 lb. The
 * fit sees only the days a reading exists now, which are the points the curve
 * is drawn through. Regression rather than (last - first) / weeks so one odd
 * endpoint cannot swing the number.
 *
 * Two gates, both a matter of the number not stating more than it has:
 *
 * - **`MIN_ENTRIES_FOR_TREND` weigh-ins in these points.** Counted from `kg`,
 *   not `trend`, so a calendar series carrying one old value forward cannot
 *   pass as thirty readings.
 * - **`MIN_RATE_DAYS` between the first and last of them.** See there.
 *
 * Accepts either shape — `smoothTrend` or `computeTrend` — because both mark a
 * reading by a non-null `kg`.
 */
export function ratePerWeek(points) {
  const data = points.filter((p) => p.kg != null && p.trend != null)
  if (data.length < MIN_ENTRIES_FOR_TREND) return null
  // See MIN_RATE_DAYS. A slope is only a weekly rate once there are weeks.
  if (daysBetween(data[0].date, data[data.length - 1].date) < MIN_RATE_DAYS) return null

  const first = data[0].date
  const xs = data.map((p) => daysBetween(first, p.date))
  const ys = data.map((p) => p.trend)
  const n = xs.length
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  if (den === 0) return null
  return (num / den) * 7
}

/**
 * The calendar span a range covers: the last `days` days ending TODAY, or for
 * `All` (null) from the first weigh-in to today.
 *
 * **Today, not the last weigh-in.** The window used to end at the newest
 * reading, so a fortnight away from the scale was invisible: the 30-day chart
 * simply started a fortnight earlier and looked as full as ever. Ending at
 * today puts that fortnight on the chart as the empty space it is.
 *
 * `All` gets a week at least, so a first weigh-in made today still has an
 * axis with a width to it.
 *
 * @returns {{start: string, end: string}}
 */
export const MIN_RANGE_DAYS = 7
export function rangeSpan(days, today, firstDate = today) {
  if (days) return { start: addDays(today, -(days - 1)), end: today }
  const floor = addDays(today, -(MIN_RANGE_DAYS - 1))
  return { start: firstDate < floor ? firstDate : floor, end: today }
}

/** The points whose date falls inside a span from `rangeSpan`, inclusive. */
export function pointsIn(points, { start, end }) {
  return points.filter((p) => p.date >= start && p.date <= end)
}

/**
 * Clip a calendar series to the last `days` ending at `end`, or all of it when
 * days is null. `end` defaults to the series' own last date for callers that
 * have no today to hand, but the tile passes today so its rate agrees with
 * the 30-day chart's.
 */
export function windowPoints(points, days, end = points[points.length - 1]?.date) {
  if (!days || !points.length) return points
  const cutoff = addDays(end, -(days - 1))
  return points.filter((p) => p.date >= cutoff && p.date <= end)
}

/**
 * Mean days between consecutive weigh-ins, or null under two.
 *
 * Over the readings themselves, first to last, not over the range: the gap
 * since the last reading is already on the chart as empty space, and it is
 * the cadence of weighing in, not the wait since, that decides how far a
 * trend through them can be trusted.
 */
export function meanGapDays(points) {
  const data = points.filter((p) => p.kg != null)
  if (data.length < 2) return null
  return daysBetween(data[0].date, data[data.length - 1].date) / (data.length - 1)
}

/**
 * Past this mean gap the chart says, once and quietly, that more frequent
 * weigh-ins would make the trend more accurate. Five days rather than seven
 * because twice a week is still a good cadence and three times is better; past
 * five a week holds one reading, and a trend through one reading a week is
 * mostly the scale's noise on that one morning.
 */
export const SPARSE_GAP_DAYS = 5
