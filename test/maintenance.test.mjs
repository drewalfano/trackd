/** The maintenance estimate, its gates and copy, and the tile order it joins. */

const R = new URL('../src/lib/', import.meta.url).href
const M = await import(R + 'maintenance.js')
const { addDays } = await import(R + 'dates.js')
const { kgToUnit, unitToKg } = await import(R + 'format.js')
const { computeTrend, pointsIn, ratePerWeek } = await import(R + 'trend.js')
const { TILE_IDS, normaliseTiles } = await import(R + 'tileOrder.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}

const TODAY = '2026-11-23'
const T = { kcal: 2000 }
const ago = (n) => addDays(TODAY, -n)
const full = (kcal) => ({ entries: [{ block: 'morning' }, { block: 'night' }], totals: { kcal } })
const part = () => ({ entries: [{ block: 'morning' }], totals: { kcal: 300 } })
const off = () => ({ entries: [], totals: { kcal: 0 } })
const days = (n, make) => Array.from({ length: n }, (_, i) => ({ date: ago(i), ...make(i) }))
const daily = (n, kgAt) => Array.from({ length: n }, (_, i) => n - 1 - i).map((d) => ({ date: ago(d), kg: kgAt(d) }))
const run = (over = {}) => M.estimateMaintenance({ days: days(28, () => full(2150)), weights: daily(28, () => 80), targets: T, unit: 'kg', ...over })

// --- the estimate
const steady = run()
eq('steady weight: the estimate is the intake', steady, { kcal: 2150, intake: 2150, ratePerWeekKg: 0, fullDays: 28, weighIns: 28, start: '2026-10-27', end: TODAY })
eq('rounded to the nearest 10', run({ days: days(28, () => full(2146)) }).kcal, 2150)

// Long enough that the smoothing has settled onto the line's own slope.
const losing = daily(365, (d) => 80 + (0.4 * d) / 7)
const loss = run({ weights: losing })
eq('a 0.4 kg a week loss is found', loss.ratePerWeekKg.toFixed(3), '-0.400')
eq('and adds 440 a day to the intake', loss.kcal, 2590) // 2150 + 0.4 * 7700 / 7
eq('a gain comes off it', run({ weights: daily(365, (d) => 80 - (0.4 * d) / 7) }).kcal, 1710)
eq('the rate is the trend helpers\' own', loss.ratePerWeekKg, ratePerWeek(pointsIn(computeTrend(losing), loss)))
eq('the Trend window setting reaches the rate', run({ weights: daily(40, (d) => 80 + (d < 14 ? 0 : d / 7)), trendWindow: 14 }).ratePerWeekKg !== run({ weights: daily(40, (d) => 80 + (d < 14 ? 0 : d / 7)) }).ratePerWeekKg, true)

// --- units
eq('the unit shown does not change the estimate', run({ weights: losing, unit: 'lb' }), loss)
const viaLb = losing.map((w) => ({ ...w, kg: unitToKg(kgToUnit(w.kg, 'lb'), 'lb') }))
eq('nor does a weight entered in pounds', run({ weights: viaLb, unit: 'lb' }).kcal, loss.kcal)

// --- gates
eq('13 full days is not enough', run({ days: days(28, (i) => (i < 13 ? full(2150) : off())) }), { kcal: null, reason: 'intake', fullDays: 13, weighIns: 28 })
eq('14 is', run({ days: days(28, (i) => (i < 14 ? full(2150) : off())) }).kcal, 2150)
eq('two weigh-ins are not enough', run({ weights: [{ date: ago(20), kg: 80 }, { date: TODAY, kg: 80 }] }), { kcal: null, reason: 'weight', fullDays: 28, weighIns: 2 })
eq('nor are many inside 14 days', run({ weights: daily(14, () => 80) }), { kcal: null, reason: 'weight', fullDays: 28, weighIns: 14 })
eq('15 days of them is a 14-day span', run({ weights: daily(15, () => 80) }).kcal, 2150)
eq('old weigh-ins do not count', run({ weights: daily(365, () => 80).filter((w) => w.date < ago(27)) }).weighIns, 0)
eq('no record at all', run({ days: [], weights: [] }), { kcal: null, reason: 'intake', fullDays: 0, weighIns: 0 })

// --- what counts as intake
const mixed = run({ days: days(28, (i) => (i % 4 === 0 ? part() : full(2150))) })
eq('partial days are outside the mean', mixed.intake, 2150)
eq('and outside the count', mixed.fullDays, 21)
eq('days before the window are outside both', run({ days: days(60, (i) => full(i < 28 ? 2150 : 4000)) }).intake, 2150)

// --- copy
eq('basis', M.basisLabel(mixed), 'From 21 logged days and 28 weigh-ins')
eq('missing days', M.missingLabel({ reason: 'intake', fullDays: 9, weighIns: 0 }), 'Needs 14 full days logged (9 so far)')
eq('missing weigh-ins', M.missingLabel({ reason: 'weight', fullDays: 20, weighIns: 2 }), 'Needs 3 weigh-ins in 28 days (2 so far)')
eq('missing span', M.missingLabel({ reason: 'weight', fullDays: 20, weighIns: 8 }), 'Needs 2 weeks of weigh-ins')
eq('sentence, falling', M.maintenanceSentence({ intake: 2150, ratePerWeekKg: unitToKg(-0.6, 'lb') }, 'lb'), 'Average intake was 2,150 cal while the weight trend fell 0.6 lb a week.')
eq('sentence, rising', M.maintenanceSentence({ intake: 2150, ratePerWeekKg: 0.3 }, 'kg'), 'Average intake was 2,150 cal while the weight trend rose 0.3 kg a week.')
eq('a rate that prints as 0.0 is level', M.maintenanceSentence({ intake: 2150, ratePerWeekKg: -0.04 }, 'kg'), 'Average intake was 2,150 cal while the weight trend held level.')

// --- the tile order
eq('a fresh install has it after calories', normaliseTiles({ order: [], variants: {} }).order, TILE_IDS)
eq('which is second', TILE_IDS.indexOf('maintenance'), TILE_IDS.indexOf('calories') + 1)
const saved = { order: ['weight', 'macros', 'calories', 'streak', 'consistency'], variants: { weight: 'small' } }
eq('an older arrangement keeps its order and gains it at the end', normaliseTiles(saved), { order: [...saved.order, 'maintenance', 'activity', 'training'], variants: { weight: 'small' } })
const phase2 = { order: ['weight', 'calories', 'maintenance', 'streak', 'consistency', 'macros'], variants: {} }
eq('one from before activity gains it at the end', normaliseTiles(phase2).order, [...phase2.order, 'activity', 'training'])
eq('one from before training gains it at the end', normaliseTiles({ order: [...phase2.order, 'activity'] }).order, [...phase2.order, 'activity', 'training'])
eq('no arrangement at all', normaliseTiles(undefined).order, TILE_IDS)
eq('an unknown tile is dropped', normaliseTiles({ order: ['gone', 'weight'] }).order.includes('gone'), false)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
