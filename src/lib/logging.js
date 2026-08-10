import { computeMacros } from './compute.js'
import {
  getFood,
  putEntry,
  touchFood,
  putMeal,
  getMeal,
  listFoods,
  identityKey,
  rememberPortion,
} from './db.js'
import { adoptDraft } from './off.js'
import { classifyItem } from './describeResolve.js'
import { round } from './format.js'

/**
 * Writing to the log. Every path that creates an entry goes through here, so
 * the `computed` snapshot and the recency bump can never drift apart.
 */

/**
 * What an estimate is filed under, and the only durable record that a row's
 * numbers came from the model.
 *
 * Named rather than written inline because two screens now read it back —
 * `entryRow` marks these with a sparkle — and a string spelled out at three
 * call sites is a string that eventually gets spelled differently at one of
 * them. Only the `estimated` branch below writes it: an item that resolved to a
 * real food goes through `logFood` and carries no source, because the numbers
 * came from the food and nothing was guessed.
 */
export const DESCRIBE_SOURCE = 'describe'

/** What a food should default to when logged without opening the serving sheet. */
export function defaultServing(food) {
  if (food.lastQuantity != null && food.lastUnit) {
    return { quantity: food.lastQuantity, unit: food.lastUnit }
  }
  return { quantity: 1, unit: 'serving' }
}

/**
 * **The recency bump goes FIRST, and the order is load-bearing.**
 *
 * These are two writes and each one emits, so logging rebuilds Today twice. With
 * `putEntry` first, the render that carries the new entry was the EARLIER of the
 * pair: it moved every memory on the card to its new value — `lastKcal`, the
 * calorie bar's fill, each ring's arc length — and then the second render, a
 * frame later, found `from === to` everywhere and replaced the whole subtree
 * with a static one. The count-up, the bar and the three arcs were all being
 * started and then thrown away, so logging animated nothing at all.
 *
 * Reversed, the first render sees the food's new recency but the same entries,
 * so it moves nothing and disturbs no memory. The second render is the one with
 * the entry in it, it is the one that survives, and it animates from where the
 * card actually was.
 *
 * The alternative was to batch both writes behind a single emit, which is the
 * better fix and belongs in the write layer rather than here. This is the
 * version that does not require it.
 */
export async function logFood({ food, quantity, unit, date, block }) {
  const macros = computeMacros(food, quantity, unit)
  await touchFood(food.id, { quantity, unit })
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
    const kind = classifyItem(item)

    /**
     * An estimate becomes an ordinary entry, and `source` is the one thing that
     * remembers what it was.
     *
     * This is otherwise the same record `quickAdd` writes for a custom entry —
     * no food, a name, and a `computed` block — and it counts towards the day
     * and towards History exactly like any other row, which is the point: a
     * reviewed estimate is a real thing you ate.
     *
     * What it is NOT is a measurement, and that distinction outlives the review.
     * Two months on, "Chicken katsu curry · 780 cal" reads as fact whether the
     * number came off a packet or out of a model, and the row is the only place
     * that difference can still be told. So the source is kept and `entryRow`
     * draws a sparkle from it — no second field, no flag to keep in step.
     */
    if (kind === 'estimated') {
      entries.push(
        await putEntry({
          date: plate.date,
          block: plate.block,
          foodId: null,
          source: DESCRIBE_SOURCE,
          foodName: item.name || 'Unnamed',
          quantity: Number(item.quantity) || 1,
          unit: item.unit || 'serving',
          computed: {
            kcal: round(item.computed.kcal, 1),
            protein: round(item.computed.protein, 1),
            fat: round(item.computed.fat, 1),
            carbs: round(item.computed.carbs, 1),
          },
        })
      )
      continue
    }

    // Nothing without an amount or a match reaches here — the plate blocks the
    // commit — but skipping is the safe reading rather than logging a zero.
    if (kind !== 'matched') continue

    // A staple or an Open Food Facts product becomes one of your foods at the
    // moment it is committed, and not before.
    const food = item.foodId ? await getFood(item.foodId) : await adoptForLog(item.draft)
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

    /**
     * Spec 5: a corrected amount is remembered, but only against a real food.
     *
     * `corrected` is set by the plate when YOU change the amount, so the app
     * never learns from a number it supplied itself. Done here rather than at
     * the moment of the edit because a draft has no food record to write to
     * until this line has created one.
     */
    if (item.corrected && item.phrase) {
      await rememberPortion(food.id, item.phrase, { quantity: item.quantity, unit: item.unit })
    }
  }
  return entries
}

/**
 * A draft becomes a food, reusing an existing record rather than duplicating.
 *
 * `adoptDraft` already owns "an Open Food Facts draft becomes one of your
 * foods", including the barcode reuse, so this adds only the one thing it does
 * not do: the name-identity check `adoptStaple` uses, which is what a staple
 * needs since it has no barcode. `identityKey` already prefers a barcode when
 * there is one, so the single lookup covers both and `adoptDraft` handles
 * everything after it.
 */
async function adoptForLog(draft) {
  if (!draft) return null
  const library = await listFoods()
  const existing = library.find((f) => identityKey(f) === identityKey(draft))
  return existing || adoptDraft(draft)
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
