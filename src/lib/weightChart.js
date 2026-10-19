import { axisBounds } from './trend.js'
import { addDays, daysBetween, fromDateStr } from './dates.js'

/**
 * The weight chart's scales, as pure functions.
 *
 * Kept out of screens/weight.js for the reason `axisBounds` was pulled out of
 * the chart before them: inline, the only way to check a tick was to draw the
 * chart and look at it, and "looks about right" is how the old axis came to
 * label its gridlines with the data's own extremes.
 */

/**
 * The y steps the axis may use, per display unit, smallest first.
 *
 * Round numbers in the unit being read, not one list converted: a 1 lb step
 * is 0.45 kg, and an axis reading 72.12, 72.57, 73.03 is no rounder than the
 * data-valued labels this replaces. Kilograms get a half step at the bottom
 * because `MIN_AXIS_SPAN.kg` is 2, and a 2 kg axis in whole kilograms has two
 * or three ticks where the 4 lb one has four or five.
 */
export const Y_STEPS = {
  lb: [1, 2, 5, 10, 20, 50],
  kg: [0.5, 1, 2, 5, 10, 20],
}

const MIN_TICKS = 3
const MAX_TICKS = 5

const ticksInside = (min, max, step) => {
  const out = []
  // The epsilon keeps a tick sitting exactly on the boundary from being lost
  // to 0.1 + 0.2 arithmetic.
  for (let k = Math.ceil(min / step - 1e-9); k * step <= max + 1e-9; k++) out.push(+(k * step).toFixed(6))
  return out
}

/**
 * The y domain and its round ticks, for values already in display units.
 *
 * The DOMAIN is `axisBounds`: the data padded 15% each side and floored at
 * `MIN_AXIS_SPAN`, so no point sits on an edge and a flat fortnight still
 * reads as flat. The TICKS are the multiples of the smallest step in `Y_STEPS`
 * that puts three to five of them inside that domain. They do not have to land
 * on its edges, which is what lets the domain stay fitted to the data instead
 * of being rounded out to the next tick and leaving the line in a third of the
 * height.
 *
 * Where no step lands in three to five (rare, since each step is at most 2.5×
 * the one before), the domain is widened to the nearest ticks outside it, a
 * step at a time, until there are three. It never narrows, so the padding
 * holds.
 *
 * @returns {{min: number, max: number, step: number, ticks: number[]}}
 */
export function yScale(values, unit = 'kg') {
  let { min, max } = axisBounds(values, unit)
  const steps = Y_STEPS[unit] ?? Y_STEPS.kg
  for (const step of steps) {
    const ticks = ticksInside(min, max, step)
    if (ticks.length > MAX_TICKS) continue
    if (ticks.length >= MIN_TICKS) return { min, max, step, ticks }
    // Too few at the first step that is not too many: widen to the ticks
    // just outside, alternating ends, until there are three.
    let lo = Math.floor(min / step + 1e-9) * step
    let hi = Math.ceil(max / step - 1e-9) * step
    let grow = 'hi'
    while (Math.round((hi - lo) / step) + 1 < MIN_TICKS) {
      if (grow === 'hi') hi += step
      else lo -= step
      grow = grow === 'hi' ? 'lo' : 'hi'
    }
    min = Math.min(min, lo)
    max = Math.max(max, hi)
    return { min, max, step, ticks: ticksInside(min, max, step) }
  }
  const step = steps[steps.length - 1]
  return { min, max, step, ticks: ticksInside(min, max, step) }
}

/** A tick label: whole numbers for whole steps, one decimal for the half. */
export const yTickLabel = (v, step) => (step < 1 ? v.toFixed(1) : String(Math.round(v)))

/**
 * Up to this many days of span ticks every week; up to the next, every other
 * week; past that, months. By span rather than by the range button, so `All`
 * on a six-week history gets weeks like `30 days` does rather than one lonely
 * month label.
 */
export const WEEKLY_MAX_DAYS = 45
export const BIWEEKLY_MAX_DAYS = 120
const MAX_MONTH_TICKS = 6
const MONTH_STEPS = [1, 2, 3, 6, 12]

/**
 * A Sunday the fortnightly ticks count from, so they fall on the same Sundays
 * every day rather than stepping back from whatever today is. Anchored to the
 * calendar, a gridline stays put as the days go by; anchored to today, every
 * one of them would move a day's width each morning, which reads as the data
 * having changed when it has not.
 */
const FORTNIGHT_EPOCH = '2026-01-04'

const monthShort = (d) => d.toLocaleDateString(undefined, { month: 'short' })

/**
 * The x ticks for a span: `{ date, label }`, oldest first.
 *
 * Weeks and fortnights tick on Sundays and label with the day of the month.
 * The first tick, and the first in each new month, carries the month too
 * (`Sep 21`, `28`, `Oct 5`), because a column of bare day numbers that wraps
 * from 28 to 5 says nothing about which month either is in.
 *
 * Months tick on the 1st, at a step of 1, 2, 3, 6 or 12 months chosen so
 * there are at most six, aligned to January so quarters land on Jan, Apr, Jul
 * and Oct. January is labelled with its year instead of its name, which is
 * where a span crossing a new year says so.
 */
export function xTicks(start, end) {
  const span = daysBetween(start, end)
  if (span <= BIWEEKLY_MAX_DAYS) {
    const every = span <= WEEKLY_MAX_DAYS ? 7 : 14
    const out = []
    let prevMonth = null
    for (let i = 0; i <= span; i++) {
      const date = addDays(start, i)
      const d = fromDateStr(date)
      if (d.getDay() !== 0) continue
      if (every === 14 && (((daysBetween(FORTNIGHT_EPOCH, date) % 14) + 14) % 14) !== 0) continue
      const month = d.getMonth()
      const label = month === prevMonth ? String(d.getDate()) : `${monthShort(d)} ${d.getDate()}`
      prevMonth = month
      out.push({ date, label })
    }
    return out
  }

  // Every 1st of a month in the span, then the smallest step that keeps six
  // or fewer of them.
  const firsts = []
  const s = fromDateStr(start)
  for (let d = new Date(s.getFullYear(), s.getMonth(), 1); ; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    if (date > end) break
    if (date >= start) firsts.push({ date, d })
  }
  for (const step of MONTH_STEPS) {
    const picked = firsts.filter(({ d }) => (d.getFullYear() * 12 + d.getMonth()) % step === 0)
    if (picked.length > MAX_MONTH_TICKS && step !== MONTH_STEPS[MONTH_STEPS.length - 1]) continue
    return picked.map(({ date, d }) => ({
      date,
      label: d.getMonth() === 0 ? String(d.getFullYear()) : monthShort(d),
    }))
  }
  return []
}

/**
 * An SVG path through `[x, y]` points by monotone cubic interpolation.
 *
 * The same construction as d3's `curveMonotoneX` (Steffen's tangents): each
 * segment is a cubic whose control points are set from slopes clamped so the
 * curve never rises or falls past either of the points it joins. That is the
 * whole reason for it here. A Catmull-Rom or plain cubic through a trend that
 * drops at the end overshoots below the last point and draws a trough no
 * reading supports; monotone cannot.
 *
 * Points must be in ascending x. Two points draw a straight segment, one draws
 * a bare move, which renders nothing on its own.
 */
export function monotonePath(points) {
  const n = points.length
  if (!n) return ''
  const f = (v) => v.toFixed(1)
  if (n === 1) return `M${f(points[0][0])} ${f(points[0][1])}`
  if (n === 2) return `M${f(points[0][0])} ${f(points[0][1])}L${f(points[1][0])} ${f(points[1][1])}`

  const sign = (v) => (v < 0 ? -1 : 1)
  const t = new Array(n)
  for (let i = 1; i < n - 1; i++) {
    const [x0, y0] = points[i - 1]
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    const h0 = x1 - x0
    const h1 = x2 - x1
    // Readings are one per day, so no two points share an x and neither
    // width can be zero.
    const s0 = (y1 - y0) / h0
    const s1 = (y2 - y1) / h1
    const p = (s0 * h1 + s1 * h0) / (h0 + h1)
    t[i] = (sign(s0) + sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0
  }
  // Ends: the one-sided three-point estimate, as d3 does.
  const end = (a, b, tb) => {
    const h = points[b][0] - points[a][0]
    return h ? ((3 * (points[b][1] - points[a][1])) / h - tb) / 2 : tb
  }
  t[0] = end(0, 1, t[1])
  t[n - 1] = end(n - 2, n - 1, t[n - 2])

  let d = `M${f(points[0][0])} ${f(points[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const dx = (x1 - x0) / 3
    d += `C${f(x0 + dx)} ${f(y0 + dx * t[i])} ${f(x1 - dx)} ${f(y1 - dx * t[i + 1])} ${f(x1)} ${f(y1)}`
  }
  return d
}
