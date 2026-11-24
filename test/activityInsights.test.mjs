/** Activity beside intake and weight: thresholds, grouping, windows and copy. */

const R = new URL('../src/lib/', import.meta.url).href
const A = await import(R + 'activityInsights.js')
const { addDays, fromDateStr } = await import(R + 'dates.js')
const { smoothTrend } = await import(R + 'trend.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}

const today = '2026-11-23'
const targets = { kcal: 2000 }
const ago = (n) => addDays(today, -n)
const full = (n, kcal) => ({ date: ago(n), entries: [{ block: 'morning' }, { block: 'night' }], totals: { kcal } })
const part = (n) => ({ date: ago(n), entries: [{ block: 'morning' }], totals: { kcal: 300 } })
const act = (n, over) => ({ date: ago(n), activeKcal: null, steps: null, sleepMinutes: null, ...over })
/** One per day from yesterday back. */
const back = (n, make) => Array.from({ length: n }, (_, i) => make(i + 1))

// --- burn and intake
const burn = (over = {}) =>
  A.burnVsIntake({
    days: back(24, (n) => full(n, 2000 + n)),
    activity: back(24, (n) => act(n, { activeKcal: 100 * n })),
    targets, today, ...over,
  })
const b = burn()
eq('24 days split into eights', [b.high.days, b.low.days, b.fullDays], [8, 8, 24])
eq('top third is the highest burn', [b.high.active, b.high.intake], [2050, 2020.5])
eq('bottom third is the lowest', [b.low.active, b.low.intake], [450, 2004.5])
eq('the window is 28 finished days', [b.start, b.end], ['2026-10-26', '2026-11-22'])
eq('17 days is not enough', burn({ days: back(17, (n) => full(n, 2000)) }), null)
eq('18 is, six a side', burn({ days: back(18, (n) => full(n, 2000)) }).low.days, 6)
eq('20 days still six a side', burn({ days: back(20, (n) => full(n, 2000)) }).high.days, 6)
eq('partial days are outside it', burn({ days: back(24, (n) => (n > 17 ? part(n) : full(n, 2000))) }), null)
eq('days with no reading are outside it', burn({ activity: back(24, (n) => act(n, { activeKcal: n > 17 ? null : 100 * n })) }), null)
eq('a 29th day back is outside it', burn({ days: back(17, (n) => full(n, 2000)).concat(full(29, 9000)), activity: back(29, (n) => act(n, { activeKcal: 100 * n })) }), null)
eq('today is outside it', burn({ days: [full(0, 9000), ...back(17, (n) => full(n, 2000))], activity: [act(0, { activeKcal: 100 }), ...back(17, (n) => act(n, { activeKcal: 100 * n }))] }), null)
eq('level burn has no thirds', burn({ activity: back(24, (n) => act(n, { activeKcal: 500 })) }), null)
eq('no activity', burn({ activity: [] }), null)
eq('no days', burn({ days: [] }), null)

const unworn = (kcal, n = 25) => burn({
  days: back(n, (i) => full(i, 2000)),
  activity: back(n, (i) => act(i, { activeKcal: i === 10 ? kcal : 300 + i })),
})
eq('9.6 active kcal is left out and counted', [unworn(9.6).leftOut, unworn(9.6).fullDays], [1, 24])
eq('a literal 0 is too', unworn(0).leftOut, 1)
eq('49.9 is', unworn(49.9).leftOut, 1)
eq('50 is not', [unworn(50).leftOut, unworn(50).fullDays], [0, 25])
eq('left-out days count against the threshold', unworn(9.6, 18), null)
eq('a partial unworn day is not counted as left out', burn({ days: back(25, (n) => (n === 25 ? part(n) : full(n, 2000))), activity: back(25, (n) => act(n, { activeKcal: n === 25 ? 5 : 100 * n })) }).leftOut, 0)

const at = (n, h) => { const d = fromDateStr(ago(n)); d.setHours(h); return d.getTime() }
eq('a row imported on its own date is unfinished', burn({ activity: back(24, (n) => act(n, { activeKcal: 100 * n, importedAt: n === 1 ? at(1, 12) : at(0, 9) })) }).fullDays, 23)

eq('burn sentence', A.burnSentence({ high: { days: 8, active: 780.4, intake: 2340.2 }, low: { days: 8, active: 310, intake: 2010 } }), 'On your 8 highest-burn days (avg 780 active cal) you ate 2,340 cal on average. On your 8 lowest (avg 310) you ate 2,010.')
eq('burn basis', [A.burnBasis(b).split(' · ').length, A.burnBasis(b).startsWith('From 24 full days with active calories · ')], [2, true])
eq('burn basis names what was left out', A.burnBasis(unworn(9.6)).split(' · ')[2], '1 day under 50 active cal left out')
eq('and says days for two', A.burnBasis({ ...b, leftOut: 2 }).split(' · ')[2], '2 days under 50 active cal left out')

// --- sleep and intake
const nights = (shorts, longs, over = {}) => {
  const all = shorts + longs
  return A.sleepVsIntake({
    days: back(all, (n) => full(n, n <= shorts ? 2500 : 2000)),
    activity: back(all, (n) => act(n, { sleepMinutes: n <= shorts ? 359 : 420 })),
    targets, today, ...over,
  })
}
eq('five and five', [nights(5, 5).short, nights(5, 5).long], [{ days: 5, intake: 2500 }, { days: 5, intake: 2000 }])
eq('four short nights', nights(4, 9), null)
eq('four long nights', nights(9, 4), null)
eq('6 h exactly is not under 6', nights(5, 5, { activity: back(10, (n) => act(n, { sleepMinutes: n <= 5 ? 360 : 420 })) }), null)
eq('just under 7 h is not 7', nights(5, 5, { activity: back(10, (n) => act(n, { sleepMinutes: n <= 5 ? 300 : 419.9 })) }), null)
// Short nights end on 2, 4, 6, 8, 10 days ago; only those dates are heavy. A
// date + 1 reading would find the light ones.
const alternating = A.sleepVsIntake({
  days: back(12, (n) => full(n, n % 2 ? 1800 : 3000)),
  activity: back(12, (n) => act(n, { sleepMinutes: n % 2 ? 450 : 300 })),
  targets, today,
})
eq('the day after a night is the date it is filed under', [alternating.short.intake, alternating.long.intake], [3000, 1800])
eq('partial days are outside it', nights(5, 5, { days: back(10, (n) => (n === 1 ? part(n) : full(n, 2000))) }), null)
eq('today is outside it', nights(4, 5, { days: [full(0, 9000), ...back(9, (n) => full(n, 2000))], activity: [act(0, { sleepMinutes: 300 }), ...back(9, (n) => act(n, { sleepMinutes: n <= 4 ? 300 : 450 }))] }), null)
eq('91 days back is outside it', nights(4, 5, { days: [...back(9, (n) => full(n, 2000)), full(91, 2000)], activity: [...back(9, (n) => act(n, { sleepMinutes: n <= 4 ? 300 : 450 })), act(91, { sleepMinutes: 300 })] }), null)
eq('sleep on an import-day row still counts', nights(5, 5, { activity: back(10, (n) => act(n, { sleepMinutes: n <= 5 ? 300 : 450, importedAt: at(n, 12) })) })?.short.days, 5)
eq('no sleep readings', nights(5, 5, { activity: back(10, (n) => act(n, { steps: 1 })) }), null)
eq('sleep sentence', A.sleepSentence(nights(5, 6)), 'On the 5 days after under 6 h of sleep you ate 2,500 cal on average. On the 6 days after 7 h or more you ate 2,000.')

// --- steps and the weight trend
const daily = (n, kgAt) => back(n, (i) => i).reverse().map((i) => ({ date: ago(i), kg: kgAt(i) }))
const steps = (over = {}) => A.stepsAndTrend({ activity: back(42, (n) => act(n, { steps: 1000 * n })), weights: daily(60, (n) => 80 + n / 20), today, ...over })
const s = steps()
eq('six weeks, oldest first, ending yesterday', [s.weeks.length, s.weeks[0].start, s.weeks[5].end], [6, '2026-10-12', '2026-11-22'])
eq('weekly mean steps', s.weeks[5].steps, { mean: 4000, days: 7 })
const pts = new Map(smoothTrend(daily(60, (n) => 80 + n / 20)).map((p) => [p.date, p.trend]))
eq('trend change is the shared trend, week end to week end', s.weeks[5].changeKg, pts.get(ago(1)) - pts.get(ago(8)))
eq('basis counts', [s.stepDays, s.weighIns], [42, 42])
eq('three days of steps is no mean', steps({ activity: back(42, (n) => (n > 3 && n < 8 ? act(n, {}) : act(n, { steps: 9 }))) }).weeks[5].steps, { mean: null, days: 3 })
eq('four is', steps({ activity: back(42, (n) => (n > 4 && n < 8 ? act(n, {}) : act(n, { steps: 9 }))) }).weeks[5].steps, { mean: 9, days: 4 })
const gap = steps({ weights: daily(60, (n) => 80 + n / 20).filter((w) => w.date < ago(14) || w.date > ago(8)) })
eq('a week without a weigh-in has no change', gap.weeks[4].changeKg, null)
eq('nor does the one after it', gap.weeks[5].changeKg, null)
eq('the others keep theirs', gap.weeks[3].changeKg != null, true)
eq('no weigh-ins', steps({ weights: [] }), null)
eq('one paired week is not a table', steps({ weights: daily(60, () => 80).filter((w) => w.date > ago(15)), activity: back(7, (n) => act(n, { steps: 9 })) }), null)
eq('two are', steps({ weights: daily(21, () => 80), activity: back(14, (n) => act(n, { steps: 9 })) })?.weeks.filter((w) => w.changeKg != null).length, 2)
eq('two weigh-ins in six weeks is not a trend', steps({ weights: [45, 38, 31].map((n) => ({ date: ago(n), kg: 80 })) }), null)
eq('three are', steps({ weights: [45, 38, 31, 24].map((n) => ({ date: ago(n), kg: 80 })) })?.weighIns, 3)
eq('no activity', steps({ activity: [] }), null)

// --- the tile's averages
const avg = (activity) => A.activityAverages({ activity, today })
eq('nothing imported', avg([]), null)
eq('seven finished days', avg(back(9, (n) => act(n, { steps: 1000, activeKcal: 500.5 }))), { steps: { mean: 1000, days: 7 }, activeKcal: { mean: 500.5, days: 7 }, start: '2026-11-16', end: '2026-11-22' })
eq('today does not count', avg([act(0, { steps: 12 }), ...back(7, (n) => act(n, { steps: 1000 }))]).steps, { mean: 1000, days: 7 })
eq('each metric counts its own days', avg(back(7, (n) => act(n, { steps: 1000, activeKcal: n < 4 ? 500 : null }))).activeKcal, { mean: null, days: 3 })
eq('a stored 0 is a reading', avg(back(7, (n) => act(n, { steps: n === 1 ? 0 : 700 }))).steps, { mean: 600, days: 7 })
eq('an unworn day stays in this mean', avg(back(7, (n) => act(n, { activeKcal: n === 1 ? 9.6 : 500 }))).activeKcal.days, 7)
eq('old data only', avg([act(40, { steps: 5 })]).steps, { mean: null, days: 0 })

// --- the maintenance context
const span = { start: ago(27), end: today }
const ctx = (activity) => A.windowActiveKcal({ activity, span, today })
eq('same window, less today', ctx([act(0, { activeKcal: 5 }), ...back(40, () => 0).map((_, i) => act(i + 1, { activeKcal: 600 }))]), { kcal: 600, days: 27, start: '2026-10-27', end: '2026-11-22' })
eq('13 readings is not enough', ctx(back(13, (n) => act(n, { activeKcal: 600 }))), null)
eq('14 is', ctx(back(14, (n) => act(n, { activeKcal: 600 }))).days, 14)

// --- copy rules
const copy = [A.burnSentence(b), A.burnBasis(unworn(9.6)), A.sleepSentence(nights(5, 5)), A.sleepBasis(nights(5, 5)), A.stepsBasis(s), A.averageMissing({ days: 3 }), A.NO_ACTIVITY].join(' ')
eq('nothing advises or contrasts', /\b(try|should|consider|but|despite|however)\b|—/i.test(copy), false)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
