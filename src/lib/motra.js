import { toDateStr } from './dates.js'

/**
 * Motra's share text, read line by line. Pure and fixed: no model, no guess.
 *
 * Every line has to be one this file knows. A line that is not refuses the
 * whole paste and is named, so nothing is ever left out quietly. Blank lines
 * separate blocks and mean nothing else.
 */

export class MotraError extends Error {
  constructor(message) {
    super(message)
    this.name = 'MotraError'
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const DATE = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}) (AM|PM)$/
const HEADER = /^(Duration|Volume|Calories|Exercises):\s*(.*)$/
const NUMBERED = /^(\d+):/
const WEIGHTED = /^(\d+): (\d+) reps x (\d+(?:\.\d+)?|\.\d+) (lb|kg)$/
const BODYWEIGHT = /^(\d+): (\d+) reps$/
const TIMED = /^(\d+): (\d+) s$/
const CREDIT = /^Tracked with Motra\.?$/
const LINK = /^https:\/\/motra\.com\/share\/workout\/([A-Za-z0-9_-]+)$/

const LINE_BREAK = /\r\n|\n|\r/

const SET_EXAMPLE = '"1: 12 reps x 35 lb", "1: 12 reps" or "1: 30 s"'

/** iOS writes a narrow no-break space before AM and PM, among other things. */
const tidy = (line) => line.replace(/\s+/g, ' ').trim()

function readDate(text) {
  const m = DATE.exec(text)
  if (!m) return null
  const month = MONTHS.indexOf(m[1])
  const [day, year, hour, minute] = [m[2], m[3], m[4], m[5]].map(Number)
  if (month < 0 || hour < 1 || hour > 12 || minute > 59) return null
  const at = new Date(year, month, day, (hour % 12) + (m[6] === 'PM' ? 12 : 0), minute)
  // Feb 30 rolls into March rather than failing, so the day is read back.
  if (at.getMonth() !== month || at.getDate() !== day || at.getFullYear() !== year) return null
  return at
}

/** Header values. Each returns undefined for something it cannot read. */
const VALUES = {
  Duration(text) {
    const m = /^(?:(\d+)h)? ?(?:(\d+)m)?$/.exec(text)
    return m && (m[1] || m[2]) ? Number(m[1] || 0) * 60 + Number(m[2] || 0) : undefined
  },
  Volume(text) {
    const m = /^(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(K?) (lb|kg)$/.exec(text)
    if (!m) return undefined
    const n = Number(m[1].replaceAll(',', '') + (m[2] || ''))
    return { amount: m[3] ? Math.round(n * 1000) : n, unit: m[4] }
  },
  Calories(text) {
    const m = /^(\d{1,3}(?:,\d{3})+|\d+) cal$/.exec(text)
    return m ? Number(m[1].replaceAll(',', '')) : undefined
  },
  Exercises(text) {
    return /^\d+$/.test(text) ? Number(text) : undefined
  },
}

function readSet(text) {
  let m = WEIGHTED.exec(text)
  if (m) return { n: Number(m[1]), unit: m[4], set: { reps: Number(m[2]), weight: Number(m[3]) } }
  m = BODYWEIGHT.exec(text)
  if (m) return { n: Number(m[1]), unit: null, set: { reps: Number(m[2]), weight: null } }
  m = TIMED.exec(text)
  if (m) return { n: Number(m[1]), unit: null, set: { reps: null, weight: null, seconds: Number(m[2]) } }
  return null
}

/**
 * @returns {{ workout: object, listed: number|null }} the record as it is
 *   stored, and the number of exercises Motra's own header gives. The header
 *   count is not stored and does not refuse the paste; see `countMismatch`.
 */
export function parseMotra(text) {
  const lines = String(text ?? '')
    .split(LINE_BREAK)
    .map((raw, i) => ({ text: tidy(raw), no: i + 1 }))
  const refuse = (line, why) => {
    throw new MotraError(`Line ${line.no}, "${line.text}", ${why}`)
  }

  const filled = lines.filter((l) => l.text)
  if (!filled.length) throw new MotraError('There is no text to read.')
  if (filled[0].text !== 'My workout:') refuse(filled[0], 'is not how a Motra workout starts. The first line is "My workout:".')
  const title = filled[1]
  if (!title) throw new MotraError('The text ends before the workout title.')
  const when = filled[2]
  if (!when) throw new MotraError('The text ends before the workout date.')
  const at = readDate(when.text)
  if (!at) refuse(when, 'is not a date like "Nov 23, 2026 at 9:48 AM".')

  const header = {}
  const exercises = []
  let unit = null
  let open = null
  let id = null
  let credited = false
  let previousBlank = true

  for (let i = lines.indexOf(when) + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.text) {
      open = null
      previousBlank = true
      continue
    }
    const startsBlock = previousBlank
    previousBlank = false

    const link = LINK.exec(line.text)
    if (link) {
      if (id) refuse(line, 'is a second workout link.')
      id = link[1]
      open = null
      continue
    }
    if (id) refuse(line, 'comes after the workout link.')
    if (CREDIT.test(line.text)) {
      if (credited) refuse(line, 'is repeated.')
      credited = true
      open = null
      continue
    }
    if (credited) refuse(line, 'is not a workout link.')

    const head = !exercises.length && !open && HEADER.exec(line.text)
    if (head) {
      const [, field, value] = head
      if (Object.hasOwn(header, field)) refuse(line, `is a second ${field} line.`)
      const read = VALUES[field](value)
      if (read === undefined) refuse(line, `is not a ${field} Trackd can read.`)
      header[field] = read
      continue
    }

    const read = readSet(line.text)
    if (read) {
      if (!open) refuse(line, 'is a set with no exercise above it.')
      const want = open.sets.length + 1
      if (read.n !== want) refuse(line, `is out of order. Set ${want} comes next.`)
      if (read.unit) {
        if (unit && unit !== read.unit) refuse(line, `is in ${read.unit}, and the workout is in ${unit}.`)
        unit = read.unit
      }
      open.sets.push(read.set)
      continue
    }

    // Not a set. It is a name only at the top of a block, with a set under it.
    const next = lines[i + 1]
    if (open || NUMBERED.test(line.text)) refuse(line, `is not a set Trackd can read. A set is ${SET_EXAMPLE}.`)
    if (!startsBlock) refuse(line, 'is not a line Trackd knows.')
    if (!next?.text) refuse(line, 'has no sets under it.')
    // A `Label: value` line is a header this file does not know, not a name.
    if (!readSet(next.text) && (/^[A-Za-z ]+: /.test(line.text) || HEADER.test(next.text))) {
      refuse(line, 'is not a line Trackd knows.')
    }
    if (!readSet(next.text)) refuse(next, `is not a set Trackd can read. A set is ${SET_EXAMPLE}.`)
    open = { name: line.text, sets: [] }
    exercises.push(open)
  }

  if (!exercises.length) throw new MotraError('There are no exercises in that text.')

  const volume = header.Volume ?? null
  if (volume && unit && volume.unit !== unit) {
    throw new MotraError(`The volume is in ${volume.unit}, and the sets are in ${unit}.`)
  }

  const date = toDateStr(at)
  return {
    workout: {
      id: id ?? `${date} ${when.text.split(' at ')[1]} ${title.text}`,
      title: title.text,
      startedAt: at.getTime(),
      date,
      durationMin: header.Duration ?? null,
      calories: header.Calories ?? null,
      reportedVolume: volume?.amount ?? null,
      unit: unit ?? volume?.unit ?? null,
      exercises,
    },
    listed: header.Exercises ?? null,
  }
}

/** Said on the preview before anything is saved. Null when the counts agree. */
export function countMismatch({ workout, listed }) {
  const found = workout.exercises.length
  if (listed == null || listed === found) return null
  return `Motra lists ${listed} exercise${listed === 1 ? '' : 's'} and this text has ${found}. Saving stores the ${found} in the text.`
}

/** A title as it is compared, not as it is shown. */
export const titleKey = (title) => title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * The same workout by another route: the same start minute and the same title.
 * A paste knows the minute and the export knows the second, and neither has
 * the other's id.
 */
export const sameMoment = (a, b) =>
  Math.floor(a.startedAt / 60000) === Math.floor(b.startedAt / 60000) && titleKey(a.title) === titleKey(b.title)

/** The stored row a workout already has, by id first. */
export const storedMatch = (stored, w) => stored.find((s) => s.id === w.id) ?? stored.find((s) => sameMoment(s, w)) ?? null

/** Field by field, so a stored row's key order does not matter. */
export function sameWorkout(a, b) {
  const flat = (w) =>
    JSON.stringify([
      w.id, w.title, w.startedAt, w.date, w.durationMin, w.calories, w.reportedVolume, w.unit,
      w.exercises.map((e) => [e.name, e.motraMuscles ?? null, e.sets.map((s) => [s.reps, s.weight, s.seconds ?? null])]),
    ])
  return flat(a) === flat(b)
}
