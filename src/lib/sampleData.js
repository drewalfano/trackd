import { putFood, deleteFood, listFoods, getSettings, saveSettings } from './db.js'

/**
 * Filler favourites, for looking at the design with something in it.
 *
 * The add sheet's Favourites rail is the part of the app that cannot be judged
 * empty — the whole question is whether four food names are recognisable at a
 * glance, and an empty state answers none of it. This exists so the rail can be
 * looked at without logging a week of real meals first.
 *
 * DEV ONLY. Nothing imports this in a production build: the one caller is a row
 * in Settings behind `import.meta.env.DEV`, so the bundler drops the module
 * entirely. It writes through the ordinary `putFood` / `saveSettings` path
 * rather than touching IndexedDB directly, so seeded foods are real records and
 * every screen treats them like any other.
 *
 * Every id is prefixed `sample-`, which is what makes the removal exact — it
 * takes back what it added and cannot take anything else.
 */

const PREFIX = 'sample-'

/**
 * Numbers are per 100 g and real, taken from ordinary packet values rather than
 * invented. A filler food with impossible macros trains the eye on a layout
 * that will never occur: the mock's pretzel reads 90 cal against 10 P, 4 F and
 * 68 C, which is 348 calories of macros, and the digit widths that come with
 * numbers like that are not the ones the rail has to survive.
 *
 * The names are chosen to stress the card rather than to flatter it. "Homemade
 * Spaghetti & Meatballs" is the three-line case the clamp exists for, "Whey
 * Protein" is the short one that leaves the card half empty, and both have to
 * look deliberate sitting next to each other.
 */
export const SAMPLE_FOODS = [
  {
    id: `${PREFIX}pretzel`,
    name: 'Pub Style Soft Pretzel',
    servingSize: 45,
    servingUnit: 'g',
    per100: { kcal: 200, protein: 6.7, fat: 1.1, carbs: 40 },
  },
  {
    id: `${PREFIX}spaghetti`,
    name: 'Homemade Spaghetti & Meatballs',
    servingSize: 450,
    servingUnit: 'g',
    per100: { kcal: 144, protein: 7.8, fat: 4.9, carbs: 17.8 },
  },
  {
    id: `${PREFIX}whey`,
    name: 'Whey Protein',
    brand: 'Optimum Nutrition',
    servingSize: 30,
    servingUnit: 'g',
    servingLabel: '1 scoop (30 g)',
    per100: { kcal: 433, protein: 80, fat: 6.7, carbs: 6.7 },
  },
  {
    id: `${PREFIX}chicken`,
    name: 'Grilled Chicken Breast',
    servingSize: 170,
    servingUnit: 'g',
    per100: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
  },
  {
    id: `${PREFIX}oats`,
    name: 'Overnight Oats with Blueberries',
    servingSize: 250,
    servingUnit: 'g',
    per100: { kcal: 132, protein: 4.4, fat: 3.2, carbs: 21 },
  },
  {
    id: `${PREFIX}yoghurt`,
    name: 'Greek Yoghurt, 0%',
    servingSize: 170,
    servingUnit: 'g',
    per100: { kcal: 59, protein: 10, fat: 0.4, carbs: 3.6 },
  },
]

/** Whether the filler is currently in the library. */
export async function hasSampleFoods(foods) {
  const all = foods ?? (await listFoods())
  return all.some((f) => String(f.id).startsWith(PREFIX))
}

/**
 * Adds the foods and pins them, in order.
 *
 * Existing favourites are kept and the filler goes after them, because someone
 * with real favourites pinned wants to see the rail they actually have plus
 * enough to make it scroll — not their list replaced by a demo.
 */
export async function loadSampleFoods() {
  for (const food of SAMPLE_FOODS) {
    await putFood({ ...food, source: 'sample', lastUsedAt: Date.now(), useCount: 3 })
  }

  const { favourites } = await getSettings()
  const missing = SAMPLE_FOODS.filter(
    (food) => !favourites.some((f) => f.type === 'food' && f.id === food.id)
  ).map((food) => ({ type: 'food', id: food.id }))

  if (missing.length) await saveSettings({ favourites: [...favourites, ...missing] })
  return SAMPLE_FOODS.length
}

/**
 * Takes back exactly what was added.
 *
 * `deleteFood` also unpins, so favourites need no separate cleanup. Anything
 * logged from a sample food stays in the log on purpose — entries snapshot
 * their own macros, so a deleted food leaves the day's numbers correct, and
 * silently rewriting history to tidy up a demo would be the worse surprise.
 */
export async function clearSampleFoods() {
  const foods = await listFoods()
  const mine = foods.filter((f) => String(f.id).startsWith(PREFIX))
  for (const food of mine) await deleteFood(food.id)
  return mine.length
}
