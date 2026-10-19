/**
 * The weight chart's scales: round y ticks, calendar x ticks and the monotone
 * curve. Pure, so they run in node like the trend maths in math.test.mjs.
 */

const R = new URL('../src/lib/', import.meta.url).href
const W = await import(R + 'weightChart.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}

// --- y: round ticks, three to five of them, inside a padded domain
const y = (vals, unit) => W.yScale(vals, unit)
const drew = y([165.4, 164.8, 165.0, 164.2, 163.8, 163.6, 163.0, 160.0, 162.8], 'lb')
eq('the sparse history ticks every 2 lb', drew.step, 2)
eq('on round numbers', drew.ticks, [160, 162, 164, 166])
eq('with no point on an edge', drew.min < 160.0 && drew.max > 165.4, true)
eq('a flat fortnight ticks every pound', y([165.0, 165.4], 'lb').ticks, [164, 165, 166, 167])
eq('a 12 lb spread ticks every 5', y([160, 172], 'lb').ticks, [160, 165, 170])
eq('a 40 lb year ticks every 10', y([150, 190], 'lb').ticks, [150, 160, 170, 180, 190])
eq('kilograms get half steps', y([80, 80.2], 'kg').step, 0.5)
eq('and their own round numbers', y([80, 80.2], 'kg').ticks, [79.5, 80, 80.5, 81])
eq('a 6 kg spread ticks every 2 kg', y([72, 78], 'kg').ticks, [72, 74, 76, 78])
eq('one value still gets an axis', y([80], 'kg').ticks.length >= 3, true)
const counts = []
for (let lo = 150; lo < 170; lo += 0.37) for (const span of [0, 0.5, 2, 4.3, 7, 11, 18, 33, 61]) counts.push(y([lo, lo + span], 'lb').ticks.length)
for (let lo = 60; lo < 90; lo += 0.23) for (const span of [0, 0.3, 1, 2.2, 4, 7, 13, 25]) counts.push(y([lo, lo + span], 'kg').ticks.length)
eq('every span gets three to five ticks', counts.every((c) => c >= 3 && c <= 5), true)
eq('every tick is inside its domain', [[150, 151], [160, 172], [80, 80.2], [72.3, 74.1]].every(([a, b]) => {
  const s = y([a, b], a > 100 ? 'lb' : 'kg'); return s.ticks.every((t) => t >= s.min && t <= s.max)
}), true)
eq('whole labels for whole steps', W.yTickLabel(164, 2), '164')
eq('one decimal for the half', W.yTickLabel(79.5, 0.5), '79.5')

// --- x: weeks, fortnights, months
const x30 = W.xTicks('2026-09-20', '2026-10-19')
eq('30 days ticks every Sunday', x30.map((t) => t.date), ['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18'])
eq('with day numbers, and the month where it starts', x30.map((t) => t.label), ['Sep 20', '27', 'Oct 4', '11', '18'])
const x90 = W.xTicks('2026-07-22', '2026-10-19')
eq('90 days ticks every other Sunday', x90.map((t) => t.date), ['2026-08-02', '2026-08-16', '2026-08-30', '2026-09-13', '2026-09-27', '2026-10-11'])
eq('the fortnights are the same Sundays tomorrow', W.xTicks('2026-07-23', '2026-10-20').map((t) => t.date), x90.map((t) => t.date))
eq('fortnight labels', x90.map((t) => t.label), ['Aug 2', '16', '30', 'Sep 13', '27', 'Oct 11'])
const year = W.xTicks('2025-11-14', '2026-10-19')
// Every other month, aligned to January so the same months tick all year.
eq('a year ticks every other month', year.map((t) => t.date), ['2026-01-01', '2026-03-01', '2026-05-01', '2026-07-01', '2026-09-01'])
eq('in month names, with January as its year', year.map((t) => t.label), ['2026', 'Mar', 'May', 'Jul', 'Sep'])
const six = W.xTicks('2026-04-10', '2026-10-19')
eq('six months tick monthly', six.map((t) => t.label), ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'])
const two = W.xTicks('2024-09-01', '2026-10-19')
eq('two years tick by quarter or more, at most six', two.length <= 6 && two.length >= 3, true)
eq('a January says its year', W.xTicks('2025-10-01', '2026-03-15').map((t) => t.label), ['Oct', 'Nov', 'Dec', '2026', 'Feb', 'Mar'])
eq('a short All ticks weekly', W.xTicks('2026-10-13', '2026-10-19').map((t) => t.date), ['2026-10-18'])
eq('ticks never leave the span', [x30, x90, year, six, two].every((ts) => ts.length && ts.every((t, i) => !i || t.date > ts[i - 1].date)), true)

// --- the curve: monotone, so it never overshoots a point it passes through
const nums = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number)
eq('no points, no path', W.monotonePath([]), '')
eq('one point is a bare move', W.monotonePath([[1, 2]]), 'M1.0 2.0')
eq('two points are a line', W.monotonePath([[0, 0], [10, 5]]), 'M0.0 0.0L10.0 5.0')
const pts = [[0, 100], [30, 98], [60, 99], [90, 60], [100, 61]]
const d = W.monotonePath(pts)
eq('a cubic per segment', (d.match(/C/g) || []).length, 4)
eq('it passes through every point', pts.every(([px, py]) => d.includes(`${px.toFixed(1)} ${py.toFixed(1)}`)), true)
// Each segment's control points sit within its own endpoints' y range, which
// is what makes a cubic Bezier unable to overshoot them.
const segs = d.split('C').slice(1).map(nums)
const inRange = segs.every(([, c1y, , c2y, , ey], i) => {
  const sy = pts[i][1]; const lo = Math.min(sy, ey) - 1e-6; const hi = Math.max(sy, ey) + 1e-6
  return c1y >= lo && c1y <= hi && c2y >= lo && c2y <= hi
})
eq('no segment overshoots its endpoints', inRange, true)
// A flat run stays flat: no bulge between two equal readings.
const flat = W.monotonePath([[0, 50], [10, 50], [20, 50], [30, 40]]).split('C').slice(1).map(nums)
eq('a flat run stays flat', flat[0][1] === 50 && flat[0][3] === 50 && flat[1][1] === 50 && flat[1][3] === 50, true)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
