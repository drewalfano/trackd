/**
 * The pure logic: macro arithmetic, the sanity flags from spec 9, weight
 * smoothing, and local-date handling. No DOM and no database, so it runs
 * straight in node with `npm test`.
 *
 * These are the parts where a silent mistake would corrupt months of history
 * without ever looking wrong on screen, which is what earns them a test.
 */

import { readFileSync } from 'node:fs'

const R = new URL('../src/lib/', import.meta.url).href
const C = await import(R + 'compute.js')
const T = await import(R + 'trend.js')
const D = await import(R + 'dates.js')
const G = await import(R + 'targets.js')
const F = await import(R + 'format.js')

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
// Mid-sentence day labels: lowercase the relative words, never a real date
eq('relative labels lowercase mid-sentence', D.dayPhrase(D.todayStr()), 'today')
eq('an absolute date keeps its capitals', D.dayPhrase('2020-03-17'), D.formatDayLabel('2020-03-17'))
eq('and that date is not lowercased', /[A-Z]/.test(D.dayPhrase('2020-03-17')), true)

eq('block prefill: 08:00', D.blockForTime(new Date(2026, 0, 1, 8), { afternoon: 12, night: 17 }), 'morning')
eq('block prefill: 12:00', D.blockForTime(new Date(2026, 0, 1, 12), { afternoon: 12, night: 17 }), 'afternoon')
eq('block prefill: 17:00', D.blockForTime(new Date(2026, 0, 1, 17), { afternoon: 12, night: 17 }), 'night')

/* ------------------------------------------------------ weekly averages */

/**
 * The suppression threshold gets a test because the failure mode is silent: a
 * mean over one day renders as a confident weekly figure and nothing about it
 * looks wrong. Returning null below the threshold is the property worth
 * locking down — it makes the bad number unrenderable rather than unrendered.
 */
const day = (kcal, protein) => ({ entries: [{}], totals: { kcal, protein } })
const blank = () => ({ entries: [], totals: { kcal: 0, protein: 0 } })

eq('one tracked day yields no average at all', C.weeklyAverages([day(1235, 90), blank(), blank()]), { tracked: 1, complete: 1, partial: 0, of: 7, enough: false, kcal: null, protein: null })
eq('three is still not enough', C.weeklyAverages([day(2000, 150), day(2000, 150), day(2000, 150)]).enough, false)
eq('four is', C.weeklyAverages(Array.from({ length: 4 }, () => day(2000, 150))).enough, true)
eq('the mean divides by tracked days, not by seven', C.weeklyAverages([day(2000, 150), day(2400, 170), day(2000, 150), day(2400, 170), blank(), blank(), blank()]).kcal, 2200)
eq('untracked days do not drag the mean toward zero', C.weeklyAverages(Array.from({ length: 5 }, () => day(2000, 150)).concat([blank(), blank()])).kcal, 2000)
eq('only the last seven days count', C.weeklyAverages(Array.from({ length: 10 }, (_, i) => day(i < 7 ? 2000 : 9999, 150))).kcal, 2000)
eq('nothing tracked is zero tracked, not a divide by zero', C.weeklyAverages([blank(), blank()]), { tracked: 0, complete: 0, partial: 0, of: 7, enough: false, kcal: null, protein: null })

/**
 * Partial days.
 *
 * The failure this guards against is silent and compounding: a day someone
 * logged breakfast on and then forgot is not a 400-calorie day, but a naive mean
 * files it as one and reports a deficit that never happened. Both signals have
 * to agree before a day is written off — see `isPartialDay` — because either
 * alone discards something real.
 */
const dayIn = (kcal, blocks) => ({ entries: blocks.map((b) => ({ block: b })), totals: { kcal, protein: 100 } })
const TARGETS = { kcal: 2000, protein: 150 }

eq('one period and well under target is partial', C.isPartialDay(dayIn(600, ['morning']), TARGETS), true)
eq('the same calories spread over two periods is a real light day', C.isPartialDay(dayIn(600, ['morning', 'night']), TARGETS), false)
eq('one big meal is the whole day, not half of one', C.isPartialDay(dayIn(1400, ['night']), TARGETS), false)
eq('exactly at the fraction is not partial', C.isPartialDay(dayIn(1200, ['morning']), TARGETS), false)
eq('an untracked day is absent, not partial', C.isPartialDay({ entries: [], totals: { kcal: 0 } }, TARGETS), false)
/* Without a target there is nothing to be a fraction OF, so the rule switches
   itself off rather than guessing. This is what keeps the mean tests above
   honest — they pass no targets, so none of their days are partial. */
eq('no target means nothing is partial', C.isPartialDay(dayIn(600, ['morning']), {}), false)

const withPartial = Array.from({ length: 4 }, () => dayIn(2000, ['morning', 'afternoon', 'night'])).concat([dayIn(400, ['morning'])])
eq('a partial day does not drag the mean down', C.weeklyAverages(withPartial, TARGETS).kcal, 2000)
eq('and is counted so the screen can say so', C.weeklyAverages(withPartial, TARGETS).partial, 1)
eq('the denominator is complete days, not tracked ones', C.weeklyAverages(withPartial, TARGETS).complete, 4)
eq('tracked still counts everything logged', C.weeklyAverages(withPartial, TARGETS).tracked, 5)
/* Four complete days is the threshold, so dropping one partial day below it has
   to withhold the mean rather than quietly average three. */
eq('excluding a partial day can drop you under the threshold', C.weeklyAverages(Array.from({ length: 3 }, () => dayIn(2000, ['morning', 'night'])).concat([dayIn(400, ['morning'])]), TARGETS).enough, false)

/* ----------------------------------------------------------------- height */

/**
 * Height feeds Mifflin-St Jeor at 6.25 cal per centimetre, so a conversion that
 * drifts by an inch moves someone's target by about 16 calories a day, forever,
 * without ever looking wrong on screen.
 */
eq('5 ft 11 in', Math.round(F.ftInToCm(5, 11)), 180)
eq('180 cm back to feet and inches', F.cmToFtIn(180), { ft: 5, in: 11 })
eq('a round 6 ft', F.cmToFtIn(F.ftInToCm(6, 0)), { ft: 6, in: 0 })
eq('inches carry: 5 ft 12 in is 6 ft', F.cmToFtIn(F.ftInToCm(5, 12)), { ft: 6, in: 0 })
eq('and keep carrying: 5 ft 25 in', F.cmToFtIn(F.ftInToCm(5, 25)), { ft: 7, in: 1 })
eq('empty height is not a negative person', F.cmToFtIn(0), { ft: 0, in: 0 })
eq('every whole inch survives the round trip', Array.from({ length: 96 }, (_, i) => {
  const back = F.cmToFtIn(F.ftInToCm(Math.floor(i / 12), i % 12))
  return back.ft * 12 + back.in === i
}).every(Boolean), true)
eq('label reads as feet and inches', F.heightLabel(180, 'imperial'), '5′ 11″')
eq('and as centimetres otherwise', F.heightLabel(180, 'metric'), '180 cm')

/* --------------------------------------------------------------- targets */

/**
 * The guardrails get tests before the onboarding UI gets pixels, because a
 * calculator that can produce an 900-calorie target is a product decision, and
 * a product decision that only exists in a comment is not one.
 */

// Mifflin-St Jeor, both terms, worked by hand
eq('BMR male 80kg 180cm 30y', G.bmr({ sex: 'male', weightKg: 80, heightCm: 180, age: 30 }), 1780)
eq('BMR female 65kg 165cm 30y', G.bmr({ sex: 'female', weightKg: 65, heightCm: 165, age: 30 }), 1370.25)
eq('BMR refuses an unspecified sex rather than guessing', G.bmr({ sex: 'unspecified', weightKg: 65, heightCm: 165, age: 30 }), null)
eq('BMR refuses a missing weight', G.bmr({ sex: 'male', heightCm: 180, age: 30 }), null)

// Age is derived, so a stored profile cannot go quietly stale
eq('age from birth year', G.ageFrom(1996, new Date(2026, 5, 1)), 30)
eq('implausible age is no age', G.ageFrom(2021, new Date(2026, 5, 1)), null)
eq('no birth year is no age', G.ageFrom(null), null)

// Rates are capped on the way in, not just absent from the presets
eq('an aggressive loss rate is capped', G.clampRate(-2, 'lose'), -0.5)
eq('an aggressive gain rate is capped', G.clampRate(5, 'gain'), 0.25)
eq('a goal with no rate gets the gentle default', G.clampRate(0, 'lose'), -0.25)
eq('maintain is always zero', G.clampRate(-1, 'maintain'), 0)

// The floor: a sedentary 65 kg woman losing at the fastest offered rate lands
// under 1200 on the arithmetic, and the calculator stops rather than following.
const floored = G.computeTargets(
  { sex: 'female', birthYear: 1996, heightCm: 165, activity: 'sedentary', goal: 'lose', rateKgPerWeek: -0.5 },
  { weightKg: 65, now: new Date(2026, 5, 1) }
)
eq('the arithmetic really did go below the floor', floored.requested < 1200, true)
eq('the target stops at the floor', floored.kcal, 1200)
eq('and says that is what happened', floored.floored, true)

const normal = G.computeTargets(
  { sex: 'male', birthYear: 1996, heightCm: 180, activity: 'moderate', goal: 'maintain' },
  { weightKg: 80, now: new Date(2026, 5, 1) }
)
eq('maintenance is BMR times the activity factor', normal.maintenance, Math.round(1780 * 1.55))
eq('no goal means no adjustment', normal.kcal, Math.round((1780 * 1.55) / 10) * 10)
eq('an incomplete profile returns nothing rather than a guess', G.computeTargets({ sex: 'male' }, { weightKg: 80 }), null)
eq('prefer-not-to-say cannot be calculated for', G.canCalculate({ sex: 'unspecified', birthYear: 1996, heightCm: 180, activity: 'moderate' }, 80), false)

// Grams per kilo, not a percentage: the whole argument in one assertion
eq(
  'protein does not shrink with the calorie target',
  G.macroSplit(2500, 70).protein === G.macroSplit(1600, 70).protein,
  true
)
eq('normal split', G.macroSplit(1200, 65), { protein: 115, fat: 50, carbs: 75 })

// A heavy body at a floored target cannot afford both fixed figures
const squeezed = G.macroSplit(1500, 130)
eq('the squeeze never returns negative carbs', squeezed.carbs >= 0, true)
eq('the squeeze holds protein above the minimum', squeezed.protein >= 1.2 * 130 - 5, true)
eq('the squeeze holds fat above the minimum', squeezed.fat >= 0.6 * 130 - 5, true)
eq('no weight means no split rather than NaN', G.macroSplit(2000, 0), { protein: 0, fat: 0, carbs: 0 })

// A hand-typed target below the floor is accepted, and mentioned once
eq('a low manual target is flagged', G.belowFloor(1000, 'female'), 1200)
eq('a fine manual target is not', G.belowFloor(1300, 'female'), null)
eq('the male floor is higher', G.belowFloor(1300, 'male'), 1500)
eq('unknown sex uses the lower floor, to avoid a false alarm', G.belowFloor(1300, null), null)

/* -------------------------------------------------------------- contrast */

/**
 * The macro palette is checked against WCAG AA here rather than trusted.
 *
 * These values are read straight out of styles.css, so changing a hex there
 * without re-measuring it fails the build. Colour is the one part of this
 * design system where "it looks fine" and "it is legible" genuinely diverge —
 * the gold fill reads perfectly well as a bar and is unreadable as 15px type.
 */
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')

const token = (name, scope = css) => {
  const m = scope.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6}|var\\(--color-[\\w-]+\\))`))
  if (!m) throw new Error(`token --color-${name} not found`)
  // A token may alias another, e.g. --color-fat-text: var(--color-fat-edge).
  return m[1].startsWith('#') ? m[1] : token(m[1].slice(4, -1).replace('--color-', ''), scope)
}

const darkBlock = css.slice(css.indexOf("[data-theme='dark']"), css.indexOf('@media'))

const luminance = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
const atLeast = (label, a, b, min) => {
  const r = contrast(a, b)
  eq(`${label} (${r.toFixed(2)}:1 >= ${min})`, r >= min, true)
}

const MACROS = ['kcal', 'protein', 'fat', 'carbs']
const AA = 4.5 // the P/F/C suffixes are 15px, which is not "large text"

// Macro type on the light page.
for (const m of MACROS) atLeast(`${m} text on white`, token(`${m}-text`), token('canvas'), AA)

// Macro type on a card, which is the grey surface rather than the page.
for (const m of MACROS) atLeast(`${m} text on surface`, token(`${m}-text`), token('surface'), AA)

// White "+74" on the overage segment, which is the edge shade.
for (const m of MACROS) atLeast(`white on ${m} overage`, '#ffffff', token(`${m}-edge`), AA)

// Dark mode: the darker shades invert into the ground, so text lifts to a tint.
for (const m of MACROS) {
  atLeast(`${m} text on dark surface`, token(`${m}-text`, darkBlock), token('surface', darkBlock), AA)
}

/**
 * Fills are MARKS, and a mark has a floor of its own: WCAG 1.4.11 asks 3:1 of
 * anything you have to see in order to read the screen, which an arc showing
 * how much of a target is gone certainly is.
 *
 * Nothing measured this before, and the gap is exactly where the gold went
 * missing — its text shade passed AA at 5.87:1 while the fill it was named
 * after sat at 2.10:1 on a white card. Both facts were true at once, which is
 * how "fat is low contrast" and "fat passes the contrast test" coexisted.
 *
 * The fills DID once hold across both themes, and that is what kept them pale —
 * one value clearing 3:1 on white and on near-black has about a stop and a half
 * to live in. Since v1.2.0 they move like the type does, so each theme's own
 * fill is measured against its own card.
 */
const MARK = 3
for (const m of MACROS) atLeast(`${m} fill as a mark on a card`, token(m), token('surface'), MARK)
for (const m of MACROS) {
  atLeast(`${m} fill as a mark on a dark card`, token(m, darkBlock), token('surface', darkBlock), MARK)
}

/**
 * The EDGE is NOT measured against a card, and the reason is worth writing down
 * because getting it wrong shipped a bug.
 *
 * v1.1.7 made the edge the ring's second lap, and v1.2.0 concluded that a lap
 * is a mark and therefore owes 3:1 against the surface — which the light-mode
 * edges fail on the dark card at 1.91:1 to 2.95:1. That produced a dark theme
 * where the lap got BRIGHTER as it went over while light got darker, so the one
 * state the app exists to show meant two opposite things depending on theme.
 *
 * The ground was wrong. **Overage only exists once the fill has closed**, so it
 * is painted on top of the fill every time and never touches the card. What
 * governs it is the separation from the fill, below.
 *
 * The ring's second lap was removed in v1.2.5 — see the note at the top of
 * `lib/ring.js`. The rule outlives it: `bar-over` is the same shade in the same
 * relationship, a segment butted inside the fill, and it is what these rows
 * measure now.
 *
 * The light edge still owes 4.5:1 as TYPE — `--color-X-text` aliases it — and
 * the AA rows above already measure exactly that.
 */

/**
 * The two shades of a macro have to be far enough apart to read as two.
 *
 * This is the bar's whole argument for overage — the chip is the fill's colour
 * moved — so if a pair closes up the mark stops saying anything. A plain
 * contrast ratio between the pair, in both themes, because here the eye is
 * comparing them to each other and to nothing else.
 */
const PAIR = 1.55
for (const m of MACROS) atLeast(`${m} fill vs edge`, token(m), token(`${m}-edge`), PAIR)
for (const m of MACROS) {
  atLeast(`${m} fill vs edge, dark`, token(m, darkBlock), token(`${m}-edge`, darkBlock), PAIR)
}

// Body and secondary text.
atLeast('ink on canvas', token('ink'), token('canvas'), 7)
atLeast('muted on canvas', token('muted'), token('canvas'), AA)
atLeast('muted on surface', token('muted'), token('surface'), AA)
atLeast('ink on dark canvas', token('ink', darkBlock), token('canvas', darkBlock), 7)
atLeast('muted on dark surface', token('muted', darkBlock), token('surface', darkBlock), AA)

/**
 * The sheet's ground, and the measurement that pins it.
 *
 * `--color-sheet` is the third elevation level — page, sheet, then the cards on
 * the sheet — and it deliberately aliases canvas rather than lifting above it.
 * The alias is asserted rather than assumed, because it is what makes the token
 * follow each theme's page without needing an override in the dark block.
 *
 * The pair below is the reason it must not be tuned upward. A card has to stay
 * readable AS a card on whatever the sheet is, and the two themes currently sit
 * at 1.14 in light and 1.22 in dark. Lifting the dark sheet to `#1c1c1c` drops
 * its cards to 1.1267, which is what the floor is set to catch: the sheet cannot
 * buy its own elevation with the separation of everything sitting on it.
 *
 * 1.13 rather than the 1.14 Material names, because light is 1.1397 and would
 * fail its own status quo. The gap between that and the 1.1267 this exists to
 * reject is narrow, and it is the real gap — a floor rounded up to look tidier
 * would fail a surface that ships today.
 */
eq('sheet aliases canvas', /--color-sheet:\s*var\(--color-canvas\)/.test(css), true)
const SURFACE_PAIR = 1.13
atLeast('card on sheet', token('surface'), token('sheet'), SURFACE_PAIR)
atLeast('card on sheet, dark', token('surface', darkBlock), token('canvas', darkBlock), SURFACE_PAIR)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
