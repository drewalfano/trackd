import { addDays, formatDayShort, fromDateStr } from './dates.js'
import { pluralize } from './format.js'
import { MUSCLE_GROUPS, MUSCLE_LABELS, exerciseKey, musclesOf, unknownExercises } from './muscles.js'

/**
 * The week's training, read two ways that are never mixed.
 *
 * **Sets** are whole sets performed, each counted once. **Weighted sets** are
 * per muscle: a set counts 1 for a primary muscle and 0.5 for a secondary one,
 * so one set can add to several muscles and the two totals do not match.
 */

export const PRIMARY = 1
export const SECONDARY = 0.5

/** The Monday of the week `date` falls in. Dates are local calendar days. */
export const weekStart = (date) => addDays(date, -((fromDateStr(date).getDay() + 6) % 7))

export const weekSpan = (start) => ({ start, end: addDays(start, 6) })

export const weekLabel = (start) => `${formatDayShort(start)} to ${formatDayShort(addDays(start, 6))}`

/** A set of no reps and no time is stored as listed and was not performed. */
export const performedSets = (sets) => sets.filter((s) => s.reps !== 0 || s.seconds > 0).length

export const setCount = (workout) =>
  workout.exercises.reduce((n, e) => n + performedSets(e.sets), 0)

export function workoutsInWeek(workouts, start) {
  const { end } = weekSpan(start)
  return workouts
    .filter((w) => w.date >= start && w.date <= end)
    .sort((a, b) => a.startedAt - b.startedAt)
}

/**
 * @returns {{ start, end, workouts, sets, muscles, unassigned }}
 *   `muscles[group]` is `{ sets, from: [{ name, sets, role, credit }] }`, with
 *   `sets` weighted and `from[].sets` whole. `unassigned` names the exercises
 *   whose muscles nobody has said, which add to `sets` and to no muscle.
 */
export function trainingWeek(workouts, start, mappings) {
  const rows = workoutsInWeek(workouts, start)
  const muscles = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { sets: 0, from: new Map() }]))

  const add = (group, role, exercise, count) => {
    const credit = count * (role === 'primary' ? PRIMARY : SECONDARY)
    const bucket = muscles[group]
    bucket.sets += credit
    const key = exerciseKey(exercise.name)
    const row = bucket.from.get(key) ?? { name: exercise.name, sets: 0, role, credit: 0 }
    row.sets += count
    row.credit += credit
    bucket.from.set(key, row)
  }

  for (const exercise of rows.flatMap((w) => w.exercises)) {
    const map = musclesOf(exercise, mappings)
    const count = performedSets(exercise.sets)
    if (!map || !count) continue
    const primary = new Set(map.primary)
    for (const g of primary) add(g, 'primary', exercise, count)
    for (const g of new Set(map.secondary)) if (!primary.has(g)) add(g, 'secondary', exercise, count)
  }

  for (const g of MUSCLE_GROUPS) {
    muscles[g].from = [...muscles[g].from.values()].sort((a, b) => b.credit - a.credit)
  }
  return {
    ...weekSpan(start),
    workouts: rows,
    sets: rows.reduce((n, w) => n + setCount(w), 0),
    muscles,
    unassigned: unknownExercises(rows.flatMap((w) => w.exercises), mappings),
  }
}

/* ---------------------------------------------------------------- the ramp */

/**
 * The lower edge of each step. A fraction belongs to the step it has reached
 * the edge of: 4.5 has not reached 5 and is in 1 to 4. Anything above 0 has
 * left 0, so 0.5 is in 1 to 4 as well.
 */
export const RAMP = [
  { label: '0' },
  { label: '1 to 4' },
  { label: '5 to 9', from: 5 },
  { label: '10 to 14', from: 10 },
  { label: '15+', from: 15 },
]

export function rampStep(sets) {
  if (!(sets > 0)) return 0
  for (let i = RAMP.length - 1; i >= 2; i--) if (sets >= RAMP[i].from) return i
  return 1
}

/** A region that stands for several groups is shaded by the highest of them. */
export const regionSets = (groups, muscles) => Math.max(...groups.map((g) => muscles[g].sets))

/* -------------------------------------------------------------------- copy */

/** `9`, `4.5`. Weighted sets only ever land on a half. */
export const setsFigure = (n) => String(Math.round(n * 10) / 10)

export const regionName = (groups) =>
  groups.length > 1 && groups.every((g) => / delts$/.test(MUSCLE_LABELS[g]))
    ? `${groups.map((g) => MUSCLE_LABELS[g].replace(' delts', '')).map((n, i) => (i ? n.toLowerCase() : n)).join(' and ')} delts`
    : groups.map((g, i) => (i ? MUSCLE_LABELS[g].toLowerCase() : MUSCLE_LABELS[g])).join(' and ')

export const NO_WORKOUTS = 'Paste a workout from Motra'

export const weekSummary = ({ sets, workouts }) =>
  `${pluralize(sets, 'set')} · ${pluralize(workouts.length, 'workout')}`

const TOP = 3

/**
 * Up to three muscles, highest weighted sets first. Null in a week with none.
 * Ties keep MUSCLE_GROUPS order.
 */
export function musclesSentence({ muscles }, when = 'this week') {
  const top = MUSCLE_GROUPS.map((g) => ({ g, sets: muscles[g].sets }))
    .filter((r) => r.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, TOP)
  if (!top.length) return null
  const list = top.map(({ g, sets }, i) => {
    const name = i ? MUSCLE_LABELS[g].toLowerCase() : MUSCLE_LABELS[g]
    return `${name} ${setsFigure(sets)}`
  })
  return `${list.join(', ')} sets ${when}.`
}

export const WEIGHTED_BASIS = 'A secondary muscle counts half a set.'

/**
 * `12 × 35 lb`, `12 reps`, `30 s`, `15 reps, 63 s`. A weight of 0 is no weight.
 * A weighted set's time is how long the reps took, and is left unsaid.
 */
export function setLabel({ reps, weight, seconds }, unit) {
  if (weight && reps != null) return `${reps} × ${weight} ${unit}`
  return [reps == null || (!reps && seconds) ? null : pluralize(reps, 'rep'), seconds ? `${seconds} s` : null].filter(Boolean).join(', ') || '0 s'
}
