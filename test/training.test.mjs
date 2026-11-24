/** Muscles, the weekly read, the ramp, the write, and the v3 to v4 upgrade. */
import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { readFileSync } from 'node:fs'
const R = new URL('../src/lib/', import.meta.url).href
const U = await import(R + 'muscles.js')
const T = await import(R + 'training.js')
const M = await import(R + 'motra.js')
const G = await import(R + 'bodyRegions.js')
const DB = await import(R + 'db.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}
const wk = (date, exercises, over = {}) => ({
  id: date, title: 'Test', date, startedAt: Date.parse(`${date}T12:00:00`), durationMin: null, calories: null, reportedVolume: null, unit: 'lb',
  exercises: exercises.map(([name, n]) => ({ name, sets: Array.from({ length: n }, () => ({ reps: 10, weight: 20 })) })), ...over,
})

console.log('--- muscles ---')
eq('fifteen groups', U.MUSCLE_GROUPS.length, 15)
eq('names normalise', U.exerciseKey('  Dumbbell Bench-Press '), 'dumbbell bench press')
eq('the plan\'s seed', U.musclesFor('Dumbbell Bench Press'), { primary: ['chest'], secondary: ['frontDelts', 'triceps'] })
eq('every seed names real groups, none twice', [...U.SEED.values()].filter((m) => { const all = [...m.primary, ...m.secondary]; return !m.primary.length || all.some((g) => !U.MUSCLE_GROUPS.includes(g)) || new Set(all).size !== all.length }), [])
eq('common lifts are known', ['Barbell Back Squat', 'Cable Lateral Raise', 'Machine Leg Press', 'Barbell Deadlift', 'Pull-Up', 'Dumbbell Romanian Deadlift', 'Cable Triceps Pushdown', 'Machine Seated Leg Curl'].filter((n) => !U.musclesFor(n)), [])
eq('part of a name is not a match', U.musclesFor('Bench Press Throw Test'), null)
eq('names on Object.prototype are unknown', [U.musclesFor('constructor', {}), U.musclesFor('toString', {})], [null, null])
const mine = { 'dumbbell bench press': { primary: ['triceps'], secondary: [] }, 'test exercise a': { primary: [], secondary: [] } }
eq('an answer overrides the seed', U.musclesFor('Dumbbell bench press', mine).primary, ['triceps'])
eq('unknown once each, as first written', U.unknownExercises([{ name: 'Test Exercise A' }, { name: 'test exercise-a' }, { name: 'Dumbbell Bench Press' }], {}), ['Test Exercise A'])
eq('"no muscles" is an answer', U.unknownExercises([{ name: 'Test Exercise A' }], mine), [])

console.log('\n--- the week ---')
eq('Monday to Sunday', ['2026-11-22', '2026-11-23', '2026-11-29', '2026-11-30'].map(T.weekStart), ['2026-11-16', '2026-11-23', '2026-11-23', '2026-11-30'])
eq('across clock changes and the year', [T.weekStart('2026-11-01'), T.weekStart('2026-03-08'), T.weekStart('2027-01-01')], ['2026-10-26', '2026-03-02', '2026-12-28'])
const list = [wk('2026-11-22', [['Dumbbell Bench Press', 9]]), wk('2026-11-23', [['Dumbbell Bench Press', 3], ['Test Exercise A', 2]]), wk('2026-11-29', [['Dumbbell Bench Press', 1], ['Dumbbell Incline Hammer Curl', 2]]), wk('2026-11-30', [['Dumbbell Bench Press', 9]])]
const w = T.trainingWeek(list, '2026-11-23', {})
eq('its workouts', w.workouts.map((x) => x.date), ['2026-11-23', '2026-11-29'])
eq('whole sets, unknown exercises included', w.sets, 8)
eq('primary 1, secondary 0.5', [w.muscles.chest.sets, w.muscles.triceps.sets, w.muscles.biceps.sets, w.muscles.forearms.sets, w.muscles.quads.sets], [4, 2, 2, 1, 0])
eq('one row per exercise', w.muscles.triceps.from, [{ name: 'Dumbbell Bench Press', sets: 4, role: 'secondary', credit: 2 }])
eq('unassigned are named', w.unassigned, ['Test Exercise A'])
eq('summary is whole sets', T.weekSummary(w), '8 sets · 2 workouts')
eq('a half', T.trainingWeek([wk('2026-11-23', [['Dumbbell Bench Press', 1]])], '2026-11-23', {}).muscles.triceps.sets, 0.5)
eq('a set of no reps was not performed', T.trainingWeek([wk('2026-11-23', [], { exercises: [{ name: 'Dumbbell Bench Press', sets: [{ reps: 0, weight: 5 }, { reps: 1, weight: 5 }, { reps: null, weight: null, seconds: 30 }] }] })], '2026-11-23', {}).sets, 2)
eq('an empty week', [T.trainingWeek(list, '2026-12-07', {}).sets, T.musclesSentence(T.trainingWeek(list, '2026-12-07', {}))], [0, null])
eq('a muscle in both lists counts once, as primary', T.trainingWeek([wk('2026-11-23', [['Test Exercise A', 2]])], '2026-11-23', { 'test exercise a': { primary: ['abs'], secondary: ['abs'] } }).muscles.abs.sets, 2)

console.log('\n--- the ramp ---')
eq('steps', [0, 0.5, 1, 4, 4.5, 5, 9, 9.5, 10, 14.5, 15, 40].map(T.rampStep), [0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4])
eq('a region takes its highest group', T.regionSets(['frontDelts', 'sideDelts'], { frontDelts: { sets: 2 }, sideDelts: { sets: 5 } }), 5)
eq('infraspinatus takes the higher of its two, either way', [T.regionSets(['rearDelts', 'lats'], { rearDelts: { sets: 5 }, lats: { sets: 9 } }), T.regionSets(['rearDelts', 'lats'], { rearDelts: { sets: 5 }, lats: { sets: 0 } })], [9, 5])
eq('its name', T.regionName(['rearDelts', 'lats']), 'Rear delts and lats')
eq('region names', [T.regionName(['frontDelts', 'sideDelts']), T.regionName(['lats'])], ['Front and side delts', 'Lats'])

console.log('\n--- copy ---')
eq('sentence', T.musclesSentence(w), 'Chest 4, front delts 2, biceps 2 sets this week.')
eq('set labels', [T.setLabel({ reps: 12, weight: 35 }, 'lb'), T.setLabel({ reps: 1, weight: null }, null), T.setLabel({ reps: null, weight: null, seconds: 30 }, null)], ['12 × 35 lb', '1 rep', '30 s'])
eq('labels', [U.musclesLabel(null), U.musclesLabel({ primary: [], secondary: [] }), U.musclesLabel(U.musclesFor('Dumbbell Bench Press')), U.musclesLabel({ primary: [], secondary: ['abs'] })], ['Muscles not chosen yet', 'No muscles counted', 'Chest. Secondary: front delts, triceps', 'Secondary: abs'])

console.log('\n--- regions ---')
eq('roles', [['lats'], ['triceps', 'abs'], ['quads']].map((g) => G.regionRole(g, { primary: ['lats'], secondary: ['abs'] })), ['primary', 'secondary', null])
eq('primary in one exercise wins over secondary in another', G.rolesOf([{ primary: ['chest'], secondary: ['triceps'] }, null, { primary: ['triceps'], secondary: ['abs'] }], U.MUSCLE_GROUPS), { primary: ['chest', 'triceps'], secondary: ['abs'] })
{
  const svgOf = (id) => readFileSync(new URL(`../src/assets/body-${id}.svg`, import.meta.url), 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  const views = ['front', 'back'].map((id) => ({
    id,
    groups: [...svgOf(id).matchAll(/<g id="([^"]+)" class="muscle" data-groups="([^"]+)"/g)].filter((m) => !G.UNTRAINED_REGIONS.includes(m[1])).flatMap((m) => m[2].split(' ')),
  }))
  const piece = (primary, secondary = []) => { const p = G.pickPiece(views, { primary, secondary }); return `${p.view} ${p.half}` }
  eq('each muscle on its own', Object.fromEntries(U.MUSCLE_GROUPS.map((g) => [g, piece([g])])), {
    chest: 'front upper', frontDelts: 'front upper', sideDelts: 'front upper', rearDelts: 'back upper', lats: 'back upper', traps: 'back upper',
    biceps: 'front upper', triceps: 'back upper', forearms: 'front upper', abs: 'front upper', obliques: 'front upper',
    quads: 'front lower', hamstrings: 'back lower', glutes: 'back lower', calves: 'back lower',
  })
  eq('several: the piece with most of them', [piece(['chest', 'triceps']), piece(['lats', 'biceps', 'rearDelts']), piece(['glutes', 'hamstrings']), piece(['quads', 'glutes', 'hamstrings'])], ['front upper', 'back upper', 'back lower', 'back lower'])
  eq('secondary decides only with no primary', [piece(['chest'], ['quads', 'glutes']), piece([], ['quads'])], ['front upper', 'front lower'])
  eq('nothing chosen is the plain upper front', piece([]), 'front upper')
  eq('a piece draws its own half', G.inHalf({ primary: ['lats'], secondary: ['glutes', 'traps'] }, 'upper'), { primary: ['lats'], secondary: ['traps'] })
  eq('both halves share one scale', [G.pieceBox('upper', 170), G.pieceBox('lower', 170)], [[-21, -9, 212, 212], [-21, 134, 212, 212]])
}
eq('short labels', [U.primaryLabel(null), U.primaryLabel({ primary: [], secondary: [] }), U.primaryLabel({ primary: ['lats', 'frontDelts'], secondary: ['abs'] }), U.primaryLabel({ primary: [], secondary: ['abs'] })], ['Muscles not chosen yet', 'No muscles counted', 'Lats, front delts', null])
eq('six common dumbbell names are known', U.unknownExercises(['Dumbbell Bench Press', 'Dumbbell Single-Arm Row', 'Dumbbell Incline Bench Press', 'Dumbbell Lateral Raise', 'Dumbbell Skull Crusher', 'Dumbbell Incline Hammer Curl'].map((name) => ({ name })), {}), [])

console.log('\n--- the art ---')
{
  const all = []
  for (const view of ['front', 'back']) {
    const svg = readFileSync(new URL(`../src/assets/body-${view}.svg`, import.meta.url), 'utf8')
    const tags = [...svg.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<g\b[^>]*class="muscle"[^>]*>/g)].map((m) => m[0])
    const regions = tags.filter((t) => !G.UNTRAINED_REGIONS.includes(/ id="([^"]+)"/.exec(t)[1])).map((t) => /data-groups="([^"]+)"/.exec(t)?.[1].split(' '))
    eq(`${view} has regions, each with groups`, [regions.length > 10, regions.every(Boolean)], [true, true])
    eq(`every ${view} region names real groups`, regions.flat().filter((g) => !U.MUSCLE_GROUPS.includes(g)), [])
    all.push(...regions.flat())
  }
  eq('serratus is the one region left out', G.UNTRAINED_REGIONS, ['serratus'])
  eq('every group is on a figure', U.MUSCLE_GROUPS.filter((g) => !all.includes(g)), [])
}

console.log('\n--- v3 to v4 ---')
{
  // The v3 schema as deployed, written out by hand so that changing db.js
  // cannot change what this starts from.
  const old = await openDB('macro-tracker', 3, {
    upgrade(d) {
      const foods = d.createObjectStore('foods', { keyPath: 'id' })
      for (const k of ['barcode', 'lastUsedAt', 'useCount', 'nameLower']) foods.createIndex(k, k)
      const entries = d.createObjectStore('entries', { keyPath: 'id' })
      entries.createIndex('date', 'date')
      entries.createIndex('dateBlock', ['date', 'block'])
      entries.createIndex('foodId', 'foodId')
      d.createObjectStore('meals', { keyPath: 'id' }).createIndex('useCount', 'useCount')
      d.createObjectStore('weights', { keyPath: 'date' })
      d.createObjectStore('settings')
      d.createObjectStore('dayTargets', { keyPath: 'date' })
      d.createObjectStore('activity', { keyPath: 'date' })
    },
  })
  const rows = {
    foods: [{ id: 'f1', name: 'Oats', nameLower: 'oats', barcode: '123', lastUsedAt: 2, useCount: 1 }],
    entries: [{ id: 'e1', date: '2026-11-20', block: 'night', foodId: 'f1', createdAt: 3 }],
    meals: [{ id: 'm1', name: 'Bowl', items: [], useCount: 0 }],
    weights: [{ date: '2026-11-19', kg: 80.1, createdAt: 1 }, { date: '2026-11-20', kg: 80, createdAt: 1 }],
    dayTargets: [{ date: '2026-11-20', targets: { kcal: 2000 }, savedAt: 1 }],
    activity: [{ date: '2026-11-20', activeKcal: 612, steps: 9840, sleepMinutes: null, importedAt: 5 }],
  }
  for (const [store, all] of Object.entries(rows)) for (const row of all) await old.put(store, row)
  const kept = { onboardingComplete: true, theme: 'dark', trendsTiles: { order: ['weight'], variants: {} } }
  await old.put('settings', kept, 'settings')
  await old.put('settings', { items: [{ id: 'p' }] }, 'plate')
  old.close()

  const d = await DB.db()
  eq('opens at version 4', d.version, 4)
  for (const [store, all] of Object.entries(rows)) eq(`${store} kept`, await d.getAll(store), all)
  eq('settings kept', await d.get('settings', 'settings'), kept)
  eq('the plate kept', await DB.getPlate(), { items: [{ id: 'p' }] })
  eq('indexes still answer', [(await DB.findFoodByBarcode('123')).id, (await DB.listEntries('2026-11-20'))[0].id], ['f1', 'e1'])
  eq('workouts start empty, with no answers', [await DB.listWorkouts(), (await DB.getSettings()).exerciseMuscles], [[], {}])
}

console.log('\n--- the write ---')
{
  const scopes = []
  DB.onChange((s) => scopes.push(s))
  const text = readFileSync(new URL('./fixtures/motra-sample.txt', import.meta.url), 'utf8')
  const { workout } = M.parseMotra(text)
  eq('the first paste writes', await DB.saveWorkout(workout), true)
  eq('and emits workouts alone', scopes.splice(0), ['workouts'])
  eq('the second does not', await DB.saveWorkout(M.parseMotra(text).workout), false)
  eq('and emits nothing', [scopes.length, await DB.listWorkouts()], [0, [workout]])
  const edited = M.parseMotra(text.replace('2: 10 reps', '2: 11 reps')).workout
  await DB.saveWorkout(edited, [['Test Exercise-A', { primary: ['abs'], secondary: [] }]])
  eq('a changed paste overwrites, with its answers', [await DB.listWorkouts(), (await DB.getSettings()).exerciseMuscles], [[edited], { 'test exercise a': { primary: ['abs'], secondary: [] } }])
  eq('other settings survive', (await DB.getSettings()).theme, 'dark')
  eq('and both are emitted', scopes.splice(0), ['settings', 'workouts'])
  await DB.saveExerciseMuscles('Dumbbell Bench Press', { primary: ['triceps'], secondary: [] })
  eq('a later answer joins the first', Object.keys((await DB.getSettings()).exerciseMuscles), ['test exercise a', 'dumbbell bench press'])

  // A write that fails partway rolls back what landed before it.
  const proto = IDBObjectStore.prototype
  const put = proto.put
  let n = 0
  proto.put = function (...a) {
    if (++n === 2) throw new Error('disk')
    return put.apply(this, a)
  }
  scopes.length = 0
  let message = null
  await DB.saveWorkout({ ...workout, id: 'other', title: 'Another Test' }, [['Test Exercise B', { primary: ['abs'], secondary: [] }]]).catch((e) => (message = e.message))
  proto.put = put
  eq('a failed write rejects and keeps nothing', [message, (await DB.listWorkouts()).length, 'test exercise b' in (await DB.getSettings()).exerciseMuscles, scopes], ['disk', 1, false, []])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
