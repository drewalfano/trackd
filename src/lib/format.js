/** Number and unit formatting. Everything user-facing rounds here, once. */

export const round = (n, dp = 0) => {
  const f = 10 ** dp
  return Math.round((Number(n) || 0) * f) / f
}

/** Macro grams: whole numbers. Nobody logs 22.4g of fat. */
export const g = (n) => String(Math.round(Number(n) || 0))

/** Calories: whole numbers. */
export const kcal = (n) => String(Math.round(Number(n) || 0))

/** Quantities: up to one decimal, but no trailing ".0". */
export const qty = (n) => {
  const v = round(n, 1)
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

export const KG_PER_LB = 0.45359237

/**
 * There is one units preference, and this is how weight follows from it.
 *
 * Kept here rather than written out at each call site because it used to be
 * two: onboarding derived the weight unit from the units segment while Settings
 * offered it as a second control, so the same app could be told two different
 * things and the screens disagreed about which had been said last. Nobody wants
 * centimetres with pounds, and the canonical-unit rule is about storage, not
 * display.
 */
export const weightUnitFor = (units) => (units === 'imperial' ? 'lb' : 'kg')

export const kgToUnit = (kg, unit) => (unit === 'lb' ? kg / KG_PER_LB : kg)
export const unitToKg = (v, unit) => (unit === 'lb' ? v * KG_PER_LB : v)

/** Weights carry one decimal — the trend moves in tenths. */
export const weight = (kg, unit = 'kg') => kgToUnit(kg, unit).toFixed(1)

export const CM_PER_IN = 2.54

/**
 * Height is stored in centimetres and shown in whatever the units preference
 * says. Imperial is feet and inches, in two fields.
 *
 * This was one field of total inches for a while, on the argument that two
 * coupled fields is a lot of form for a number typed once. That was wrong in
 * the way that matters: nobody knows their height in inches. Asking for 71
 * instead of 5 and 11 makes the person do the conversion the app is for.
 */
export const cmToHeightUnit = (cm, units) => (units === 'imperial' ? cm / CM_PER_IN : cm)
export const heightUnitToCm = (v, units) => (units === 'imperial' ? v * CM_PER_IN : v)

/** Rounds to the nearest whole inch, then carries — 5 ft 12 in is 6 ft. */
export function cmToFtIn(cm) {
  const totalIn = Math.round((Number(cm) || 0) / CM_PER_IN)
  return { ft: Math.floor(totalIn / 12), in: totalIn % 12 }
}

/** Tolerates an out-of-range inches value rather than silently clamping it. */
export const ftInToCm = (ft, inches) =>
  ((Number(ft) || 0) * 12 + (Number(inches) || 0)) * CM_PER_IN

export function heightLabel(cm, units = 'metric') {
  if (!(Number(cm) > 0)) return '—'
  if (units !== 'imperial') return `${Math.round(cm)} cm`
  const { ft, in: inches } = cmToFtIn(cm)
  return `${ft}′ ${inches}″`
}

/** Signed, for rate-of-change readouts. "+0.3", "-0.4", "0.0". */
export const signed = (n, dp = 1) => {
  const v = round(n, dp)
  const s = v.toFixed(dp)
  return v > 0 ? `+${s}` : s
}

/** Serving units the app understands. 'item' covers eggs, bars, scoops. */
export const UNITS = ['g', 'ml', 'item']

export const unitLabel = (unit, n = 1) =>
  unit === 'item' ? (Math.abs(n) === 1 ? 'item' : 'items') : unit

/**
 * Human serving label, e.g. "1 scoop (30 g)" or "100 g".
 * Falls back to the numeric serving when the source gave us no label.
 */
export function servingLabel(food) {
  if (food.servingLabel) return food.servingLabel
  return `${qty(food.servingSize)} ${unitLabel(food.servingUnit, food.servingSize)}`
}

/** "2 servings", "150 g", "3 items" — how much of a food an entry represents. */
export function quantityLabel(entry, food) {
  if (entry.unit === 'serving') {
    const n = qty(entry.quantity)
    return `${n} ${Number(n) === 1 ? 'serving' : 'servings'}`
  }
  return `${qty(entry.quantity)} ${unitLabel(entry.unit, entry.quantity)}`
}

export function pluralize(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`
}
