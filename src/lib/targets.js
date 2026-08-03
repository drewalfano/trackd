/**
 * Where the numbers on every other screen come from.
 *
 * Until now `targets` appeared in DEFAULT_SETTINGS as four constants with no
 * provenance, and every ring, bar and weekly mean in the app is drawn against
 * them. This module is the provenance: body stats in, calorie and macro targets
 * out, with the arithmetic stated once and testable.
 *
 * Pure. No DOM, no database, no clock except where one is passed in — which is
 * what lets `test/math.test.mjs` run it straight in node.
 *
 * The guardrails in here are the actual product decision, not a disclaimer.
 * A tracker that will happily calculate someone into 900 calories is a tracker
 * that made that choice, whatever its copy says.
 */

import { ATWATER } from './compute.js'

/* ------------------------------------------------------------------ inputs */

/**
 * Plain language, no multipliers on screen. Someone knows whether they sit at a
 * desk; nobody knows whether they are a 1.375.
 */
export const ACTIVITY_LEVELS = [
  { value: 'sedentary', factor: 1.2, label: 'Not much', description: 'Desk job, little or no exercise' },
  { value: 'light', factor: 1.375, label: 'A bit', description: 'On your feet some days, or one to three light sessions a week' },
  { value: 'moderate', factor: 1.55, label: 'Regular', description: 'Training three to five days a week' },
  { value: 'high', factor: 1.725, label: 'A lot', description: 'Hard training most days, or a physical job' },
]

/**
 * Four, not five. The usual fifth tier sits at 1.9 and is right for roughly
 * nobody who is reading a phone about it — offering it mostly produces an
 * inflated maintenance figure that then has a deficit taken off it.
 */
export const activityFactor = (value) =>
  ACTIVITY_LEVELS.find((l) => l.value === value)?.factor ?? null

export const GOALS = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'gain', label: 'Gain weight' },
]

/**
 * The presets, in kg per week. Deliberately short lists that top out well
 * before the rates a weight-loss app would normally advertise.
 *
 * "Lose 2 lb a week" as a tappable preset does not read as an aggressive
 * choice — it reads as one of the options, which is the whole problem. The
 * fastest thing offered here is half that.
 */
export const RATE_PRESETS = {
  lose: [
    { kgPerWeek: -0.25, label: 'Slowly' },
    { kgPerWeek: -0.5, label: 'Steadily' },
  ],
  maintain: [{ kgPerWeek: 0, label: 'Hold' }],
  gain: [
    { kgPerWeek: 0.125, label: 'Slowly' },
    { kgPerWeek: 0.25, label: 'Steadily' },
  ],
}

export const MAX_LOSS_KG_PER_WEEK = 0.5
export const MAX_GAIN_KG_PER_WEEK = 0.25
export const DEFAULT_RATE_KG_PER_WEEK = 0.25

/** Energy in a kilogram of body tissue. The conventional figure, and rough. */
export const KCAL_PER_KG = 7700

/**
 * The floor the calculator will not go below, whatever the arithmetic says.
 *
 * 1200 for women and 1500 for men are the commonly cited minimums and sit at
 * the bottom of the 1200–1500 / 1500–1800 ranges used for supervised
 * weight-loss diets. Worth knowing that several current sources argue 1200 is
 * itself too low for most adults and that anything under these figures belongs
 * with a clinician rather than an app — which is the reason this is a hard stop
 * on the *calculated* path rather than a warning the user can walk past.
 *
 * A manually entered target below the floor is still accepted. See
 * `belowFloor` — the user's tool, the user's call, but the app will not do the
 * arithmetic that lands them there.
 */
export const FLOOR_KCAL = { female: 1200, male: 1500 }

/**
 * When sex is unknown the calculator is off anyway, so this figure only decides
 * when a hand-typed number gets a note under it. The lower of the two, because
 * warning someone at 1400 who would have had a floor of 1200 is a false alarm,
 * and a false alarm is how a real one gets ignored.
 */
export const FLOOR_KCAL_UNKNOWN = 1200

export const floorFor = (sex) => FLOOR_KCAL[sex] ?? FLOOR_KCAL_UNKNOWN

/**
 * Protein as grams per kilogram rather than a percentage of calories.
 *
 * A percentage split holds its shape at any calorie number, which sounds like a
 * feature and is not: 25% of 1300 calories is 81 g, and the reason to eat
 * protein in a deficit does not scale down with the deficit. Grams per kilo
 * stays put while everything else moves, which is the correct behaviour.
 */
export const PROTEIN_G_PER_KG = 1.8
export const FAT_G_PER_KG = 0.8

/** The points below which the squeeze in `macroSplit` stops taking. */
export const MIN_PROTEIN_G_PER_KG = 1.2
export const MIN_FAT_G_PER_KG = 0.6

/* -------------------------------------------------------------------- age */

/**
 * Age is derived, never stored.
 *
 * Storing "31" means the app is quietly wrong from the next birthday onwards,
 * and wrong in a way nothing on screen would ever show — the targets just drift
 * by a few calories a year. Store the year, do the subtraction.
 */
export function ageFrom(birthYear, now = new Date()) {
  const year = Number(birthYear)
  if (!year) return null
  const age = now.getFullYear() - year
  return age >= 13 && age <= 120 ? age : null
}

/* ------------------------------------------------------------ the equations */

/**
 * Mifflin-St Jeor. Chosen over Harris-Benedict because it is the more accurate
 * of the two in the general population and is what most current guidance uses.
 *
 * It needs sex as a term, which is why "prefer not to say" cannot be calculated
 * for and falls through to manual entry rather than being quietly assigned a
 * default. Guessing here would be both wrong and invisible.
 */
export function bmr({ sex, weightKg, heightCm, age }) {
  const kg = Number(weightKg)
  const cm = Number(heightCm)
  const years = Number(age)
  if (!(kg > 0) || !(cm > 0) || !(years > 0)) return null
  if (sex !== 'female' && sex !== 'male') return null
  const base = 10 * kg + 6.25 * cm - 5 * years
  return sex === 'male' ? base + 5 : base - 161
}

/** Everything the calculator needs before it will produce a number. */
export function canCalculate(profile = {}, weightKg) {
  const kg = Number(weightKg ?? profile.weightKg)
  return Boolean(
    (profile.sex === 'female' || profile.sex === 'male') &&
      ageFrom(profile.birthYear) &&
      Number(profile.heightCm) > 0 &&
      kg > 0 &&
      activityFactor(profile.activity)
  )
}

/**
 * Clamp a rate to what the goal allows, and supply the gentler default when
 * none has been chosen. Rates are signed: negative loses, positive gains.
 */
export function clampRate(rate, goal) {
  if (goal !== 'lose' && goal !== 'gain') return 0
  const magnitude = Math.abs(Number(rate)) || DEFAULT_RATE_KG_PER_WEEK
  return goal === 'lose'
    ? -Math.min(magnitude, MAX_LOSS_KG_PER_WEEK)
    : Math.min(magnitude, MAX_GAIN_KG_PER_WEEK)
}

/* ------------------------------------------------------------ macro split */

const to5 = (n) => Math.max(0, Math.round(n / 5) * 5)

/**
 * Protein and fat are fixed against bodyweight; carbs are the remainder.
 *
 * Carbs last is the honest order. They are the macro with no minimum worth
 * defending, so they are the one that should absorb whatever the calorie
 * target leaves — rather than each macro losing a proportional share and the
 * protein figure silently becoming a number nobody chose.
 */
export function macroSplit(kcal, weightKg) {
  const target = Math.max(0, Number(kcal) || 0)
  const kg = Math.max(0, Number(weightKg) || 0)
  if (!target || !kg) return { protein: 0, fat: 0, carbs: 0 }

  let protein = PROTEIN_G_PER_KG * kg
  let fat = FAT_G_PER_KG * kg
  const spent = () => protein * ATWATER.protein + fat * ATWATER.fat

  // On a heavier body at a floored target the two fixed figures can spend the
  // entire budget before carbs get any of it. Fat gives way first, down to the
  // figure usually cited as the hormonal minimum; then protein, down to the
  // bottom of the range that is still defensible in a deficit; then both scale
  // together, because at that point there is no good answer and a proportional
  // one at least does not pretend otherwise.
  if (spent() > target) fat = Math.max(MIN_FAT_G_PER_KG * kg, (target - protein * ATWATER.protein) / ATWATER.fat)
  if (spent() > target) protein = Math.max(MIN_PROTEIN_G_PER_KG * kg, (target - fat * ATWATER.fat) / ATWATER.protein)
  if (spent() > target) {
    const scale = target / spent()
    protein *= scale
    fat *= scale
  }

  protein = to5(protein)
  fat = to5(fat)
  return { protein, fat, carbs: to5((target - protein * ATWATER.protein - fat * ATWATER.fat) / ATWATER.carbs) }
}

/* ------------------------------------------------------------------ output */

/**
 * Body stats and a goal in, targets out — plus the working, because the
 * confirmation screen has to be able to show what it did and where it stopped.
 *
 * Returns null rather than a guess when it does not have what it needs.
 */
export function computeTargets(profile = {}, { weightKg, now = new Date() } = {}) {
  const kg = Number(weightKg ?? profile.weightKg) || 0
  const base = bmr({
    sex: profile.sex,
    weightKg: kg,
    heightCm: profile.heightCm,
    age: ageFrom(profile.birthYear, now),
  })
  const factor = activityFactor(profile.activity)
  if (base == null || factor == null) return null

  const maintenance = base * factor
  const rateKgPerWeek = clampRate(profile.rateKgPerWeek, profile.goal)
  const requested = Math.round((maintenance + (rateKgPerWeek * KCAL_PER_KG) / 7) / 10) * 10
  const floor = floorFor(profile.sex)
  const kcal = Math.max(floor, requested)

  return {
    bmr: Math.round(base),
    maintenance: Math.round(maintenance),
    rateKgPerWeek,
    requested,
    floor,
    /** True when the floor, not the arithmetic, decided the number. */
    floored: requested < floor,
    kcal,
    ...macroSplit(kcal, kg),
  }
}

/**
 * For a hand-typed calorie target. Not a block and not a confirmation step —
 * the number is accepted either way. It exists so the app never presents a
 * figure below the floor as the recommended path without saying so once.
 */
export function belowFloor(kcal, sex) {
  const value = Number(kcal) || 0
  const floor = floorFor(sex)
  return value > 0 && value < floor ? floor : null
}

/**
 * "0.5 kg a week" / "1.1 lb a week". The sign is carried by the goal, which is
 * already on screen next to it, so the number itself stays unsigned.
 */
export function describeRate(kgPerWeek, unit = 'kg') {
  const magnitude = Math.abs(Number(kgPerWeek) || 0)
  if (!magnitude) return 'Holding steady'
  const value = unit === 'lb' ? magnitude / 0.45359237 : magnitude
  return `${value.toFixed(2).replace(/\.?0+$/, '')} ${unit} a week`
}
