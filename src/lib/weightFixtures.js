import { DB_NAME, listWeights, putWeight, deleteWeight, saveSettings } from './db.js'
import { addDays, todayStr } from './dates.js'
import { unitToKg } from './format.js'

/**
 * Weight histories for looking at the chart with something in it.
 *
 * DEV ONLY, and only ever against a separate database. Opened as
 * `?db=fixture&fixture=sparse`, boot calls `seedWeightFixture` before anything
 * renders; it refuses outright unless `DB_NAME` is a `?db=` dev database, so
 * no combination of query strings can point it at the real record. The one
 * caller is behind `import.meta.env.DEV` in main.js, so production never
 * bundles this file.
 *
 * Each history is built back from today, so the gap since the last weigh-in
 * is the same whatever day it is opened. Values are in pounds and converted on
 * the way in, because the stored record is kilograms.
 */

const lb = (days, v) => ({ days, v })

/** The four shapes the chart has to survive. */
export const WEIGHT_FIXTURES = {
  /**
   * Drew's shape: eight weigh-ins over about 90 days, roughly eleven days
   * apart, a slow loss, the last one 3 lb under it, and nothing for the
   * twelve days since.
   */
  sparse: [
    lb(89, 165.4), lb(77, 164.8), lb(66, 165.0), lb(54, 164.2),
    lb(44, 163.8), lb(33, 163.6), lb(22, 163.0), lb(12, 160.0),
  ],
  /**
   * Daily for 200 days: a steady half pound a week down with a pound or two
   * of day-to-day water, so the 90-day view has more than 60 points and the
   * circles drop, and All crosses into month ticks.
   */
  dense: Array.from({ length: 200 }, (_, i) => {
    const days = 199 - i
    const water = Math.sin(i * 1.7) * 0.9 + Math.sin(i * 0.37) * 0.6
    return lb(days, +(178 - (i * 0.5) / 7 + water).toFixed(1))
  }),
  single: [lb(3, 172.4)],
  empty: [],
}

export async function seedWeightFixture(name, unit = 'lb') {
  if (DB_NAME === 'macro-tracker') {
    throw new Error('Weight fixtures only load into a ?db= dev database.')
  }
  const rows = WEIGHT_FIXTURES[name]
  if (!rows) throw new Error(`No weight fixture called ${name}.`)

  const today = todayStr()
  for (const w of await listWeights()) await deleteWeight(w.date)
  for (const { days, v } of rows) await putWeight(addDays(today, -days), unitToKg(v, 'lb'))
  await saveSettings({ onboardingComplete: true, units: unit === 'kg' ? 'metric' : 'imperial' })
  return rows.length
}
