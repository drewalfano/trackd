import { ImportError } from './backup.js'
import { spanLabel } from './activity.js'
import { toDateStr, todayStr } from './dates.js'
import { pluralize } from './format.js'
import { MUSCLE_GROUPS, unknownExercises } from './muscles.js'
import { sameMoment, sameWorkout, titleKey } from './motra.js'

/**
 * Motra's Excel export, as rows. Pure: no zip, no XML, no database.
 *
 * Each workout is a title, label and value rows, an optional heart rate block,
 * then a table of sets. Rows this file does not know, and values it cannot
 * read, refuse the whole file and name the sheet row.
 */

export const MOTRA_SHEET = 'Workouts'

const LABELS = {
  'Workout Start': 'start',
  'Workout End': 'end',
  'Total Duration (seconds)': 'duration',
  'Total Sets': 'sets',
  'Burned Calories': 'calories',
  Effort: 'effort',
}
const VOLUME = /^Total TVL \((lbs?|kgs?)\)$/
const WEIGHT = /^Weight \((lbs?|kgs?)\)$/
const COLUMNS = ['Exercise', WEIGHT, 'Reps', 'Time (seconds)', 'Distance (m)', 'Rest Time (seconds)', 'Effort', 'Primary Muscle Groups', 'Note']
const ZONE_TIME = /^(?=\d)(?:\d+h ?)?(?:\d+m ?)?(?:\d+s)?$/
const STAMP = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

const unitOf = (text) => (text.startsWith('lb') ? 'lb' : 'kg')

/* ----------------------------------------------------------------- muscles */

const SAME_GROUP = ['chest', 'lats', 'traps', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'quads', 'hamstrings', 'glutes', 'calves']
/** Motra's groups Trackd has nothing for. Left out, and named in the preview. */
const NO_GROUP = { lowerBack: 'lower back', hipFlexors: 'hip flexors', abductors: 'abductors' }

/**
 * Motra's groups as Trackd's, or null when they do not settle it. `shoulders`
 * could be any of three here, so an exercise with it is left for a person.
 */
export function motraGroups(text) {
  const names = text.split(',').map((n) => n.trim()).filter(Boolean)
  if (names.some((n) => !SAME_GROUP.includes(n) && !(n in NO_GROUP))) return null
  const found = MUSCLE_GROUPS.filter((g) => names.includes(g))
  return found.length ? found : null
}

/* -------------------------------------------------------------------- rows */

/**
 * @param {{ row: number, cells: any[] }[]} rows
 * @returns {{ workouts, empty, notes, dropped }} `empty` counts workouts with no
 *   sets, `notes` the notes that are not kept, `dropped` Motra's groups left out
 */
export function parseMotraRows(rows) {
  const refuse = (row, why) => {
    throw new ImportError(`Row ${row} ${why}`)
  }
  const clean = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : v)
  const lines = rows
    .map(({ row, cells }) => {
      const tidy = Array.from(cells, clean)
      while (tidy.length && (tidy.at(-1) === '' || tidy.at(-1) === undefined)) tidy.pop()
      return { row, cells: tidy }
    })
    .filter((l) => l.cells.length)
  if (!lines.length) throw new ImportError('There are no workouts in that file.')

  const quote = (v) => `"${String(v ?? '').slice(0, 40)}"`
  const number = (line, value, what, { whole = false, na = false } = {}) => {
    if (na && value === 'N/A') return null
    if (typeof value !== 'number' || value < 0 || (whole && !Number.isInteger(value))) {
      refuse(line.row, `has a bad ${what}: ${quote(value)}.`)
    }
    return value
  }
  const stamp = (line, value) => {
    const m = STAMP.exec(value)
    if (m) {
      const [y, mo, d, h, mi, s] = m.slice(1).map(Number)
      const at = new Date(y, mo - 1, d, h, mi, s)
      if (toDateStr(at) === value.slice(0, 10) && h < 24 && mi < 60 && s < 60) return at
    }
    return refuse(line.row, `has a bad date: ${quote(value)}.`)
  }

  const workouts = []
  const ids = new Map()
  const dropped = new Set()
  let empty = 0
  let notes = 0
  let i = 0
  const here = () => lines[i]
  const isTitle = (at) => lines[at]?.cells.length === 1 && lines[at + 1]?.cells[0] === 'Workout Start'

  while (i < lines.length) {
    const titleLine = here()
    if (!isTitle(i)) refuse(titleLine.row, `is not a line Trackd knows: ${quote(titleLine.cells[0])}.`)
    const title = String(titleLine.cells[0])
    i++

    const head = {}
    let volumeUnit = null
    let setsLine = titleLine
    for (; i < lines.length; i++) {
      const line = here()
      const [label, value] = line.cells
      const volume = VOLUME.exec(label)
      const field = volume ? 'volume' : LABELS[label]
      if (!field || !Object.hasOwn(LABELS, label) && !volume) break
      if (line.cells.length > 2) refuse(line.row, `has more in it than a ${label} line.`)
      if (field in head) refuse(line.row, `is a second ${label} line.`)
      if (volume) volumeUnit = unitOf(volume[1])
      if (field === 'sets') setsLine = line
      head[field] =
        field === 'start' || field === 'end'
          ? stamp(line, value)
          : field === 'effort'
            ? null
            : number(line, value, label, { whole: field === 'sets', na: field !== 'sets' })
      if (field === 'start') head.stamp = value
    }
    const at = (text) => here()?.cells.length === 1 && here().cells[0] === text
    if (at('Heart Rate Zones')) {
      i++
      const names = here()
      const times = lines[i + 1]
      if (!names?.cells.every((c, n) => c === `Zone ${n + 1}`)) refuse((names ?? lines[i - 1]).row, 'is not a row of heart rate zones.')
      if (times?.cells.length !== names.cells.length || !times.cells.every((c) => c === 'N/A' || ZONE_TIME.test(c))) {
        refuse((times ?? names).row, 'is not a row of heart rate zone times.')
      }
      i += 2
    }
    if (!at('All Sets')) {
      const line = here()
      if (!line) refuse(titleLine.row, 'starts a workout with no "All Sets" table.')
      refuse(line.row, `is not a line Trackd knows: ${quote(line.cells[0])}.`)
    }
    i++
    const columns = here()
    if (!columns) refuse(lines[i - 1].row, 'has no table under it.')
    const fits = (want, got) => (want instanceof RegExp ? want.test(got) : want === got)
    if (columns.cells.length !== COLUMNS.length || !COLUMNS.every((c, n) => fits(c, columns.cells[n]))) {
      refuse(columns.row, 'is not the table heading Trackd knows.')
    }
    const unit = unitOf(WEIGHT.exec(columns.cells[1])[1])
    if (volumeUnit && volumeUnit !== unit) refuse(columns.row, `is in ${unit}, and the workout total is in ${volumeUnit}.`)
    i++

    const exercises = []
    let count = 0
    for (; i < lines.length && !isTitle(i); i++) {
      const line = here()
      const [name, weight, reps, time, , , , groups, note] = line.cells
      if (typeof name !== 'string' || !name || line.cells.length < 3) {
        refuse(line.row, `is not a set Trackd can read: ${quote(name)}.`)
      }
      const set = {
        reps: number(line, reps, 'Reps', { whole: true }),
        weight: number(line, weight, 'Weight'),
      }
      const seconds = time === undefined || time === '' ? 0 : number(line, time, 'Time')
      if (Math.round(seconds) > 0) set.seconds = Math.round(seconds)
      if (groups !== undefined && typeof groups !== 'string') refuse(line.row, `has bad muscle groups: ${quote(groups)}.`)
      for (const g of (groups ?? '').split(',')) if (Object.hasOwn(NO_GROUP, g.trim())) dropped.add(NO_GROUP[g.trim()])
      if (note !== undefined && note !== '') notes++

      let ex = exercises.at(-1)
      if (ex?.name !== name) {
        ex = { name, sets: [] }
        const muscles = motraGroups(groups ?? '')
        if (muscles) ex.motraMuscles = muscles
        exercises.push(ex)
      }
      ex.sets.push(set)
      count++
    }

    if (!head.start) refuse(titleLine.row, 'starts a workout with no start time.')
    if (head.sets != null && head.sets !== count) {
      refuse(setsLine.row, `says ${pluralize(head.sets, 'set')}, and the table has ${count}.`)
    }
    if (!count) {
      empty++
      continue
    }
    const id = `motra ${head.stamp} ${titleKey(title)}`
    if (ids.has(id)) refuse(titleLine.row, `repeats the workout at row ${ids.get(id)}.`)
    ids.set(id, titleLine.row)
    workouts.push({
      id,
      title,
      startedAt: head.start.getTime(),
      date: toDateStr(head.start),
      durationMin: head.duration == null ? null : Math.round(head.duration / 60),
      calories: head.calories ?? null,
      reportedVolume: head.volume ?? null,
      unit,
      exercises,
    })
  }
  return { workouts, empty, notes, dropped: [...dropped] }
}

/* ------------------------------------------------------------------- merge */

/**
 * What an import would write. A workout that was pasted is matched by its start
 * minute and title, keeps its own id and is left exactly as it is. One from an
 * earlier import is matched by id, and written again only if the file changed.
 */
export function mergeWorkouts(stored, incoming) {
  const byId = new Map(stored.map((w) => [w.id, w]))
  const rows = []
  let same = 0
  let replaced = 0
  for (const w of incoming) {
    const before = byId.get(w.id)
    if (before ? sameWorkout(before, w) : stored.some((s) => sameMoment(s, w))) same++
    else {
      if (before) replaced++
      rows.push(w)
    }
  }
  return { rows, same, replaced }
}

/** Everything the preview says, from what the file has and what is stored. */
export function importSummary(parsed, stored, mappings) {
  const { workouts } = parsed
  const dates = workouts.map((w) => w.date).sort()
  return {
    ...parsed,
    ...mergeWorkouts(stored, workouts),
    total: workouts.length,
    start: dates[0] ?? null,
    end: dates.at(-1) ?? null,
    sets: workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0), 0),
    unchosen: unknownExercises(workouts.flatMap((w) => w.exercises), mappings),
  }
}

/* -------------------------------------------------------------------- copy */

/** `42 workouts · Oct 12 to Nov 22 · 600 sets`. */
export function summaryLine({ total, start, end, sets }, today = todayStr()) {
  if (!total) return 'No workouts with sets in that file'
  return [
    pluralize(total, 'workout'),
    spanLabel(start, end, today),
    `${sets.toLocaleString('en-US')} ${sets === 1 ? 'set' : 'sets'}`,
  ].join(' · ')
}

/** New, already stored and replaced, each only when there are any. */
export function changeLine({ rows, same, replaced }) {
  const fresh = rows.length - replaced
  return [
    fresh ? `${fresh} new` : null,
    same ? `${same} already stored` : null,
    replaced ? `${replaced} changed and replaced` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** What the file has that is not kept. One string per thing. */
export function leftOut({ empty, notes, dropped }) {
  return [
    'Rest, distance, effort and heart rate are not stored.',
    notes ? `${pluralize(notes, 'note')} in the file ${notes === 1 ? 'is' : 'are'} not stored.` : null,
    empty ? `${pluralize(empty, 'workout')} in the file ${empty === 1 ? 'has' : 'have'} no sets and will not be stored.` : null,
    dropped.length ? `Trackd has no muscle for ${dropped.join(', ')}, so those are left out.` : null,
  ].filter(Boolean)
}
