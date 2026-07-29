/**
 * The pure logic: macro arithmetic, the sanity flags from spec 9, weight
 * smoothing, and local-date handling. No DOM and no database, so it runs
 * straight in node with `npm test`.
 *
 * These are the parts where a silent mistake would corrupt months of history
 * without ever looking wrong on screen, which is what earns them a test.
 */

const R = new URL('../src/lib/', import.meta.url).href
const C = await import(R + 'compute.js')
const T = await import(R + 'trend.js')
const D = await import(R + 'dates.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}

// --- per-100 arithmetic, the modelling decision everything leans on
const whey = { servingSize: 30, servingUnit: 'g', per100: { kcal: 400, protein: 80, fat: 6.7, carbs: 6.7, sodium: 250 } }
eq('1 serving of whey', C.computeMacros(whey, 1, 'serving'), { kcal: 120, protein: 24, fat: 2, carbs: 2, sodium: 75 })
eq('60 g of whey == 2 servings', C.computeMacros(whey, 60, 'g'), C.computeMacros(whey, 2, 'serving'))
eq('0 quantity is zero, not NaN', C.computeMacros(whey, 0, 'g'), { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: 0 })

// item-based foods: per100 means "per 100 items"
const egg = { servingSize: 2, servingUnit: 'item', per100: { kcal: 7800, protein: 630, fat: 530, carbs: 60, sodium: null } }
eq('1 egg', C.computeMacros(egg, 1, 'item'), { kcal: 78, protein: 6.3, fat: 5.3, carbs: 0.6, sodium: null })
eq('1 serving = 2 eggs', C.computeMacros(egg, 1, 'serving'), { kcal: 156, protein: 12.6, fat: 10.6, carbs: 1.2, sodium: null })

// --- Atwater
eq('Atwater', C.kcalFromMacros({ protein: 30, carbs: 40, fat: 10 }), 30*4 + 40*4 + 10*9)

// --- per-serving <-> per-100 round trip
const per100 = C.perServingToPer100({ kcal: 120, protein: 24, fat: 2, carbs: 2, sodium: 75 }, 30)
eq('perServing -> per100', per100, { kcal: 400, protein: 80, fat: 6.67, carbs: 6.67, sodium: 250 })
eq('per100 -> perServing round trip', C.per100ToPerServing(per100, 30), { kcal: 120, protein: 24, fat: 2, carbs: 2, sodium: 75 })
eq('zero serving size does not divide by zero', C.perServingToPer100({ kcal: 5 }, 0), { kcal: 0, protein: 0, fat: 0, carbs: 0, sodium: null })

// --- spec 9 sanity flags
eq('impossible protein flagged', C.sanityCheck({ kcal: 400, protein: 120, fat: 5, carbs: 5 }).length > 0, true)
eq('mass over 100g flagged', C.sanityCheck({ kcal: 500, protein: 50, fat: 40, carbs: 40 }).length > 0, true)
eq('kcal above pure fat flagged', C.sanityCheck({ kcal: 1200, protein: 0, fat: 99, carbs: 0 }).length > 0, true)
eq('label rounding NOT flagged', C.sanityCheck({ kcal: 165, protein: 31, fat: 3.6, carbs: 0 }), [])
eq('olive oil NOT flagged', C.sanityCheck({ kcal: 884, protein: 0, fat: 100, carbs: 0 }), [])
eq('item foods skip the mass ceiling', C.sanityCheck({ kcal: 7800, protein: 630, fat: 530, carbs: 60 }, 'item'), [])

// --- progress / overshoot
eq('under target', C.progress(2255, 2837).pct.toFixed(1), '79.5')
eq('over target clamps bar, keeps excess', { pct: C.progress(2911, 2837).pct, over: Math.round(C.progress(2911, 2837).over) }, { pct: 100, over: 74 })
eq('no target is not a divide by zero', C.progress(500, 0), { pct: 0, over: 0, ratio: 0 })

// --- trend
const mk = (n, fn) => Array.from({ length: n }, (_, i) => ({ date: D.addDays('2026-01-01', i), kg: fn(i) }))
eq('under 7 readings suppresses the trend', T.computeTrend(mk(6, () => 80), 7).every(p => p.trend === null), true)
const flat = T.computeTrend(mk(20, () => 80), 7)
eq('flat data gives a flat trend', Math.round(flat.at(-1).trend * 100) / 100, 80)
eq('flat data gives ~0 per week', Math.abs(T.ratePerWeek(flat)) < 0.001, true)
const cut = T.computeTrend(mk(60, i => 85 - i * 0.07142857), 7)   // exactly -0.5 kg/week
eq('steady cut reads about -0.5 kg/week', T.ratePerWeek(T.windowPoints(cut, 30)).toFixed(2), '-0.50')
const noisy = T.computeTrend(mk(40, i => 85 - i * 0.05 + (i % 2 ? 1.2 : -1.2)), 7)
eq('trend smooths alternating 2.4kg water swings', Math.abs(noisy.at(-1).trend - (85 - 39 * 0.05)) < 0.6, true)
const gappy = T.computeTrend(mk(30, i => (i % 3 === 0 ? 80 : null)).filter(p => p.kg !== null), 7)
eq('gaps do not invent readings', gappy.filter(p => p.kg === null).length > 0 && gappy.every(p => p.trend !== null), true)

// --- local dates never shift
eq('date string is local, not UTC', D.toDateStr(new Date(2026, 0, 1, 0, 30)), '2026-01-01')
eq('late-night entry keeps its local day', D.toDateStr(new Date(2026, 0, 1, 23, 59)), '2026-01-01')
eq('day arithmetic crosses a month', D.addDays('2026-01-31', 1), '2026-02-01')
eq('day arithmetic crosses a leap day', D.addDays('2028-02-28', 1), '2028-02-29')
eq('block prefill: 08:00', D.blockForTime(new Date(2026, 0, 1, 8), { afternoon: 12, night: 17 }), 'morning')
eq('block prefill: 12:00', D.blockForTime(new Date(2026, 0, 1, 12), { afternoon: 12, night: 17 }), 'afternoon')
eq('block prefill: 17:00', D.blockForTime(new Date(2026, 0, 1, 17), { afternoon: 12, night: 17 }), 'night')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
