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

export const kgToUnit = (kg, unit) => (unit === 'lb' ? kg / KG_PER_LB : kg)
export const unitToKg = (v, unit) => (unit === 'lb' ? v * KG_PER_LB : v)

/** Weights carry one decimal — the trend moves in tenths. */
export const weight = (kg, unit = 'kg') => kgToUnit(kg, unit).toFixed(1)

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
