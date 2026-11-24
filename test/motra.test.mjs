/**
 * Motra's share text. The sample is the plan's own, with a made-up link id: its header says
 * six exercises and it shows two, so the six-exercise, sixteen-set paste below
 * is made of exercises that are plainly invented.
 */
import { readFileSync } from 'node:fs'
const R = new URL('../src/lib/', import.meta.url).href
const M = await import(R + 'motra.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}
const rejects = (label, text, ...fragments) => {
  let got = 'accepted'
  try { M.parseMotra(text) } catch (err) { got = err instanceof M.MotraError ? err.message : `wrong: ${err}` }
  eq(`rejects ${label}`, fragments.every((f) => got.includes(f)) ? 'named' : got, 'named')
}
const lines = (...l) => l.join('\n')
const text = ({ head = ['Duration: 56m', 'Exercises: 1'], blocks = [['Test Exercise A', '1: 12 reps x 35 lb']], date = 'Nov 23, 2026 at 9:48 AM', foot = ['Tracked with Motra.', 'https://motra.com/share/workout/abc'] } = {}) =>
  lines('My workout:', '', 'Test Workout', date, '', ...head, '', ...blocks.flatMap((b) => [...b, '']), ...foot)
const block = (...sets) => text({ blocks: [['Test Exercise A', ...sets]] })
const one = (over) => M.parseMotra(text(over)).workout

console.log('--- the sample in the plan ---')
const sample = readFileSync(new URL('./fixtures/motra-sample.txt', import.meta.url), 'utf8')
const p = M.parseMotra(sample)
const s35 = (reps) => ({ reps, weight: 35 })
eq('parses exactly', p, {
  workout: {
    id: 'sample0001', title: 'Sample Upper Body Workout',
    startedAt: new Date(2026, 0, 5, 8, 30).getTime(), date: '2026-01-05', durationMin: 50, calories: 310,
    reportedVolume: 10200, unit: 'lb',
    exercises: [
      { name: 'Dumbbell Bench Press', sets: [s35(12), s35(12), s35(12)] },
      { name: 'Dumbbell Incline Hammer Curl', sets: [s35(12), s35(10)] },
    ],
  },
  listed: 6,
})
eq('the count mismatch is said', M.countMismatch(p), 'Motra lists 6 exercises and this text has 2. Saving stores the 2 in the text.')

console.log('\n--- six exercises, sixteen sets (synthetic) ---')
{
  const counts = [3, 2, 3, 3, 3, 2]
  const blocks = counts.map((n, i) => [`Test Exercise ${'ABCDEF'[i]}`, ...Array.from({ length: n }, (_, j) => `${j + 1}: 10 reps x 20 lb`)])
  const full = M.parseMotra(text({ head: ['Exercises: 6'], blocks }))
  eq('six and sixteen', [full.workout.exercises.length, full.workout.exercises.reduce((n, e) => n + e.sets.length, 0)], [6, 16])
  eq('and no mismatch', M.countMismatch(full), null)
}

console.log('\n--- header ---')
for (const [d, want] of [['56m', 56], ['1h 12m', 72], ['2h', 120]]) eq(`duration ${d}`, one({ head: [`Duration: ${d}`] }).durationMin, want)
for (const [v, want] of [['11.6K lb', 11600], ['850 lb', 850], ['1,250 lb', 1250], ['0 lb', 0]]) eq(`volume ${v}`, one({ head: [`Volume: ${v}`] }).reportedVolume, want)
eq('absent fields are null, not zero', (({ durationMin, calories, reportedVolume }) => [durationMin, calories, reportedVolume])(one({ head: [] })), [null, null, null])
eq('midnight and noon', [one({ date: 'Nov 23, 2026 at 12:05 AM' }).startedAt, one({ date: 'Nov 23, 2026 at 12:05 PM' }).startedAt], [new Date(2026, 10, 23, 0, 5).getTime(), new Date(2026, 10, 23, 12, 5).getTime()])
eq('late evening keeps its local date', one({ date: 'Nov 23, 2026 at 11:59 PM' }).date, '2026-11-23')
eq('a narrow no-break space before AM', one({ date: `Nov 23, 2026 at 9:48${String.fromCharCode(0x202f)}AM` }).date, '2026-11-23')
eq('Windows line ends', M.parseMotra(sample.replaceAll('\n', '\r\n')), p)

console.log('\n--- sets ---')
eq('kg', M.parseMotra(block('1: 8 reps x 22.5 kg')).workout.exercises[0].sets, [{ reps: 8, weight: 22.5 }])
eq('kg is the unit', M.parseMotra(block('1: 8 reps x 22.5 kg')).workout.unit, 'kg')
eq('bodyweight', M.parseMotra(block('1: 12 reps')).workout.exercises[0].sets, [{ reps: 12, weight: null }])
eq('timed', M.parseMotra(block('1: 30 s')).workout.exercises[0].sets, [{ reps: null, weight: null, seconds: 30 }])
eq('no weights and no volume has no unit', M.parseMotra(block('1: 12 reps')).workout.unit, null)

console.log('\n--- id ---')
eq('a second paste has the same id', M.parseMotra(sample).workout.id, p.workout.id)
eq('no link: the date line plus the title', one({ foot: ['Tracked with Motra.'] }).id, '2026-11-23 9:48 AM Test Workout')
eq('no footer at all', one({ foot: [] }).id, '2026-11-23 9:48 AM Test Workout')
eq('same workout', M.sameWorkout(p.workout, M.parseMotra(sample).workout), true)
eq('one rep different is a different workout', M.sameWorkout(p.workout, M.parseMotra(sample.replace('2: 10 reps', '2: 11 reps')).workout), false)

console.log('\n--- refusals name the line ---')
const bad = 'is not a set Trackd can read'
for (const set of ['1: twelve reps x 35 lb', '1: 12 reps x 35', '1: 12 reps x 35 stone', '1: 12 reps × 35 lb', '1 12 reps x 35 lb', '1: 1 rep x 35 lb', '1: 12 reps x 3.5.0 lb', '1: 1m 30s', '1: 12 reps x 35 lb RPE 8', 'warmup: 12 reps x 35 lb']) {
  rejects(`first set "${set}"`, block(set, '2: 12 reps x 35 lb'), `"${set}"`, 'Line')
}
rejects('a malformed middle set', block('1: 12 reps x 35 lb', '2: 12 rps x 35 lb', '3: 12 reps x 35 lb'), 'Line 11, "2: 12 rps x 35 lb"', bad)
rejects('a malformed last set', block('1: 12 reps x 35 lb', '2 12 reps'), '"2 12 reps"', bad)
rejects('a note under a set', block('1: 12 reps x 35 lb', 'felt good'), '"felt good"')
rejects('a missing set number', block('1: 12 reps', '3: 12 reps'), '"3: 12 reps"', 'Set 2 comes next')
rejects('a set with no exercise', text({ blocks: [['1: 12 reps']] }), '"1: 12 reps"', 'no exercise above it')
rejects('an exercise with no sets', text({ blocks: [['Test Exercise A'], ['Test Exercise B', '1: 1 reps']] }), '"Test Exercise A"', 'has no sets')
rejects('lb and kg together', block('1: 12 reps x 35 lb', '2: 12 reps x 15 kg'), '"2: 12 reps x 15 kg"')
rejects('volume in another unit', text({ head: ['Volume: 5K kg'] }), 'volume is in kg')
for (const h of ['Duration: an hour', 'Duration: ', 'Volume: lots', 'Calories: 376', 'Exercises: six']) rejects(`header "${h}"`, text({ head: [h] }), `"${h.trim()}"`)
rejects('an unknown header first', text({ head: ['Distance: 2 mi', 'Duration: 56m'] }), '"Distance: 2 mi"')
rejects('an unknown header last', text({ head: ['Duration: 56m', 'Heart rate: 120'] }), '"Heart rate: 120"')
rejects('a repeated header', text({ head: ['Calories: 3 cal', 'Calories: 4 cal'] }), 'second Calories line')
for (const d of ['Feb 30, 2026 at 9:48 AM', '23 Nov 2026', 'Nov 23, 2026 at 13:48 PM', 'Nov 23, 2026 at 9:61 AM']) rejects(`date "${d}"`, text({ date: d }), `"${d}"`)
rejects('a line after the link', `${sample}\nmore`, '"more"', 'after the workout link')
rejects('another site', text({ foot: ['Tracked with Motra.', 'https://example.com/x'] }), '"https://example.com/x"')
rejects('other text', 'Milk, eggs', 'Line 1, "Milk, eggs"')
rejects('nothing', '  \n ', 'no text')
rejects('a title alone', 'My workout:\n\nTitle', 'before the workout date')
rejects('no exercises', text({ blocks: [] }), 'no exercises')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
