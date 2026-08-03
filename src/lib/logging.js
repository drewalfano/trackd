import { computeMacros } from './compute.js'
import { getFood, putEntry, touchFood, putMeal, getMeal } from './db.js'
import { round } from './format.js'

/**
 * Writing to the log. Every path that creates an entry goes through here, so
 * the `computed` snapshot and the recency bump can never drift apart.
 */

/** What a food should default to when logged without opening the serving sheet. */
export function defaultServing(food) {
  if (food.lastQuantity != null && food.lastUnit) {
    return { quantity: food.lastQuantity, unit: food.lastUnit }
  }
  return { quantity: 1, unit: 'serving' }
}

export async function logFood({ food, quantity, unit, date, block }) {
  const macros = computeMacros(food, quantity, unit)
  const entry = await putEntry({
    date,
    block,
    foodId: food.id,
    // Denormalized alongside `computed` for the same reason: deleting a food
    // must not turn a month of history into rows labelled "Deleted food".
    foodName: food.name,
    brand: food.brand ?? null,
    quantity: Number(quantity),
    unit,
    computed: {
      kcal: round(macros.kcal, 1),
      protein: round(macros.protein, 1),
      fat: round(macros.fat, 1),
      carbs: round(macros.carbs, 1),
    },
  })
  await touchFood(food.id, { quantity, unit })
  return entry
}

/** One-tap log from Recents or Favourites. */
export async function quickLogFood(food, { date, block }) {
  const { quantity, unit } = defaultServing(food)
  return logFood({ food, quantity, unit, date, block })
}

/** Logs every item in a saved meal into the same block. */
export async function logMeal(meal, { date, block }) {
  const entries = []
  for (const item of meal.items) {
    const food = await getFood(item.foodId)
    if (!food) continue // the food was deleted; skip rather than fail the meal
    entries.push(await logFood({ food, quantity: item.quantity, unit: item.unit, date, block }))
  }
  const stored = await getMeal(meal.id)
  if (stored) await putMeal({ ...stored, useCount: (stored.useCount || 0) + 1 })
  return entries
}

/** Turn a set of entries into a reusable saved meal. */
export async function saveEntriesAsMeal(name, entries) {
  return putMeal({
    name,
    items: entries.map((e) => ({ foodId: e.foodId, quantity: e.quantity, unit: e.unit })),
  })
}

/**
 * Commit a plate. Same walk as `logMeal` — deliberately, since a plate and a
 * meal are the same list of items with different lifespans.
 */
export async function logPlate(plate) {
  const entries = []
  for (const item of plate.items) {
    const food = await getFood(item.foodId)
    if (!food) continue // deleted mid-assembly; skip rather than fail the plate
    entries.push(
      await logFood({
        food,
        quantity: item.quantity,
        unit: item.unit,
        date: plate.date,
        block: plate.block,
      })
    )
  }
  return entries
}

/**
 * The prospective path to a saved meal: name a plate you have not logged.
 *
 * Until this existed a meal could only be born by logging its items first and
 * saving the block afterwards, so building a template for something you were
 * not eating right now meant logging it and then deleting four entries.
 */
export async function saveDraftAsMeal(name, items) {
  return putMeal({
    name,
    items: items.map(({ foodId, quantity, unit }) => ({ foodId, quantity, unit })),
  })
}
