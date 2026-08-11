import { addDays, daysBetween } from './dates.js'

/**
 * Weight smoothing.
 *
 * Daily scale weight is mostly water, and the useful signal is the trend under
 * it. This uses an exponentially weighted moving average rather than a centred
 * one so that the most recent value is always a real endpoint — a centred
 * average cannot produce a value for today without inventing tomorrow.
 */

export const MIN_ENTRIES_FOR_TREND = 7

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
 * Where the three gridlines sit, as fractions of the axis from the bottom.
 *
 * These used to be `[max - pad, mid, min + pad]` — the data's own extremes,
 * which is why they read as meaningful. Once the axis can be floored, `pad`
 * stops describing the data at all, and on a nearly flat window all three
 * labels round to the same number: three rules and one value, three times.
 *
 * 0.115 and 0.885 are not new positions. On a data-fitted axis the padding is
 * 15% of the span each side, so the data's own maximum sits at 1.15/1.30 of the
 * axis and its minimum at 0.15/1.30 — these fractions to three decimals. Real
 * histories keep the gridlines exactly where they have always been; a floored
 * axis gets three distinct, evenly spaced labels instead of one repeated.
 */
export const GRID_FRACTIONS = [0.885, 0.5, 0.115]

/**
 * The shortest history that can carry a per-week figure.
 *
 * `ratePerWeek` is a least-squares slope, and least squares will happily fit a
 * line to eight days of water weight and report it to a tenth of a pound. The
 * count gate on the trend line does not catch this: seven readings inside eight
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
 * @param {{date: string, kg: number}[]} weights ascending, one per day
 * @param {number} window 7 or 14
 * @returns {{date: string, kg: number|null, trend: number|null}[]}
 */
export function computeTrend(weights, window = 7) {
  const series = dailySeries(weights)
  if (weights.length < MIN_ENTRIES_FOR_TREND) {
    // No fake smoothing on thin data.
    return series.map((p) => ({ ...p, trend: null }))
  }

  const alpha = 2 / (window + 1)
  let ewma = null

  return series.map((point) => {
    if (point.kg != null) {
      ewma = ewma == null ? point.kg : alpha * point.kg + (1 - alpha) * ewma
    }
    // A gap carries the trend forward flat rather than inventing a reading.
    return { ...point, trend: ewma }
  })
}

/**
 * Average change per week across the given trend points, by least squares.
 * Regression rather than (last - first) / weeks so one odd endpoint cannot
 * swing the number.
 *
 * **Gated on the RAW readings in these points, not on the trend values.** This
 * was the one figure on the weight card that asked the record a question and
 * then answered it about the window. `computeTrend` carries the last EWMA value
 * forward flat across gaps rather than inventing a reading, which is right for
 * drawing — but it means a window holding two real weigh-ins over an older
 * history hands thirty non-null `trend` values to a least-squares fit. The
 * count gate passed, the fortnight gate passed, and out came `0.0 lb / week`:
 * a slope through a line the chart had already refused to draw, because the
 * chart counts what is actually in the window and this did not.
 *
 * Same threshold as the line rather than a fifth constant, because it is the
 * same claim. The rate IS the slope of the trend line; a window that cannot
 * carry the line cannot carry a slope through it. One number, one sentence to
 * the reader.
 *
 * The gap case is worth naming, because it is the one that matters: you track
 * for a month, stop for six weeks, weigh in twice. That is exactly when a
 * confident "no change" does damage.
 */
export function ratePerWeek(points) {
  const data = points.filter((p) => p.trend != null)
  if (data.length < 2) return null
  // See above. Carried-forward trend is not evidence of a reading.
  if (points.filter((p) => p.kg != null).length < MIN_ENTRIES_FOR_TREND) return null
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

/** Clip a trend series to the last `days`, or all of it when days is null. */
export function windowPoints(points, days) {
  if (!days || !points.length) return points
  const last = points[points.length - 1].date
  const cutoff = addDays(last, -(days - 1))
  return points.filter((p) => p.date >= cutoff)
}
