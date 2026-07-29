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
 */
export function ratePerWeek(points) {
  const data = points.filter((p) => p.trend != null)
  if (data.length < 2) return null

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
