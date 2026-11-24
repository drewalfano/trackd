/**
 * The Apple Health file, the merge, the write path, and the v2 to v3 upgrade.
 * The database half runs against fake-indexeddb, as in backup.test.mjs.
 */

import 'fake-indexeddb/auto'
import { openDB } from 'idb'
import { readFileSync } from 'node:fs'

const R = new URL('../src/lib/', import.meta.url).href
const A = await import(R + 'activity.js')
const B = await import(R + 'backup.js')
const DB = await import(R + 'db.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}
const day = (date, over = {}) => ({ date, activeKcal: 612, steps: 9840, sleepMinutes: 412, ...over })
const file = (days, over = {}) => ({ format: 'trackd-health-activity', version: 1, days, ...over })
const rejects = (label, data, fragment) => {
  let got = 'accepted'
  try {
    A.validateActivityFile(data)
  } catch (err) {
    got = err instanceof B.ImportError && err.message.includes(fragment) ? fragment : `wrong: ${err}`
  }
  eq(`rejects ${label}`, got, fragment)
}

console.log('--- the file ---')
eq('a good file', A.validateActivityFile(file([day('2026-11-22')])), { days: [day('2026-11-22')], noData: 0, duplicates: 0 })
eq('absent metrics are null and zero stays zero', A.validateActivityFile(file([{ date: '2026-11-22', steps: 0 }])).days, [{ date: '2026-11-22', activeKcal: null, steps: 0, sleepMinutes: null }])
eq('sorted by date, unknown fields dropped', A.validateActivityFile(file([day('2026-11-22', { x: 1 }), day('2026-11-20')])).days, [day('2026-11-20'), day('2026-11-22')])
eq('a repeated date: the later row wins whole', A.validateActivityFile(file([day('2026-11-22'), { date: '2026-11-22', steps: 5 }])), { days: [{ date: '2026-11-22', activeKcal: null, steps: 5, sleepMinutes: null }], noData: 0, duplicates: 1 })
eq('a day with no readings is counted, not stored', A.validateActivityFile(file([{ date: '2026-11-22', steps: null }, day('2026-11-21')])), { days: [day('2026-11-21')], noData: 1, duplicates: 0 })
eq('no days at all', A.validateActivityFile(file([])), { days: [], noData: 0, duplicates: 0 })
for (const bad of [null, [], 'x', 3]) rejects(`${JSON.stringify(bad)} as a file`, bad, 'not an Apple Health activity file')
rejects('a Trackd backup', { format: B.EXPORT_FORMAT, version: 3 }, 'not an Apple Health activity file')
for (const version of [undefined, null, 0, 1.5, '1']) rejects(`version ${version}`, file([], { version }), 'bad version number')
rejects('a newer version', file([], { version: 2 }), 'newer version of Trackd')
for (const days of [undefined, null, {}]) rejects(`days ${JSON.stringify(days)}`, file(days), '"days" data is malformed')
rejects('a day that is not a record', file([day('2026-11-22'), null]), 'Day 2 is not a record')
for (const date of [undefined, '2026-02-30', '11/22/2026', '2026-11-22T00:00:00Z', 20261122]) rejects(`date ${date}`, file([day(date)]), 'Day 1 has no valid date')
for (const v of [-1, '612', NaN, Infinity, true, [], {}]) {
  rejects(`active calories ${String(v)}`, file([day('2026-11-22', { activeKcal: v })]), 'Activity for 2026-11-22 has a bad active calories value')
  rejects(`steps ${String(v)}`, file([day('2026-11-22', { steps: v })]), 'bad steps value')
  rejects(`sleep ${String(v)}`, file([day('2026-11-22', { sleepMinutes: v })]), 'bad sleep value')
}

console.log('\n--- the merge ---')
const stored = [{ ...day('2026-11-20'), importedAt: 1 }, { ...day('2026-11-21'), importedAt: 1 }]
const m = A.mergeActivity(stored, [day('2026-11-20'), day('2026-11-21', { steps: 1, sleepMinutes: null }), day('2026-11-22')], 9)
eq('only changed and new rows are written', m.rows, [{ ...day('2026-11-21', { steps: 1 }), importedAt: 9 }, { ...day('2026-11-22'), importedAt: 9 }])
eq('counts', [m.total, m.overwritten, m.start, m.end], [3, 1, '2026-11-20', '2026-11-22'])
eq('nulls over stored values change nothing', A.mergeActivity(stored, [day('2026-11-20', { activeKcal: null, steps: null })], 9).rows, [])
eq('a reading fills a stored null', A.mergeActivity([{ ...day('2026-11-20', { steps: null }), importedAt: 1 }], [day('2026-11-20')], 9).rows, [{ ...day('2026-11-20'), importedAt: 9 }])
eq('a zero overwrites a value', A.mergeActivity(stored, [day('2026-11-20', { steps: 0 })], 9).rows[0].steps, 0)
eq('the inputs are not mutated', stored[1], { ...day('2026-11-21'), importedAt: 1 })

console.log('\n--- copy ---')
const sum = (over) => A.activitySummary({ rows: [1], total: 42, start: '2026-10-12', end: '2026-11-22', overwritten: 3, ...over }, '2026-11-23')
eq('summary', sum(), '42 days · Oct 12 to Nov 22 · 3 overwrite existing')
eq('one overwrite', sum({ overwritten: 1 }), '42 days · Oct 12 to Nov 22 · 1 overwrites existing')
eq('none', sum({ overwritten: 0 }), '42 days · Oct 12 to Nov 22')
eq('nothing to write', sum({ rows: [], overwritten: 0 }), '42 days · Oct 12 to Nov 22 · all already stored')
eq('one day', sum({ total: 1, start: '2026-11-22', overwritten: 0 }), '1 day · Nov 22')
eq('a span over a year end carries years', sum({ start: '2025-11-23', overwritten: 0 }), '42 days · Nov 23, 2025 to Nov 22, 2026')
eq('empty', sum({ rows: [], total: 0, start: null, end: null }), 'No days with readings in that file')
eq('duplicates', A.duplicatesLabel(1), '1 row in the file repeats an earlier date and will be counted once, keeping the later copy.')
eq('no readings', [A.noDataLabel(1), A.noDataLabel(2)], ['1 day in the file has no readings and will not be stored.', '2 days in the file have no readings and will not be stored.'])

console.log('\n--- v2 to v3 ---')
{
  // The v2 schema as deployed, written out by hand so that changing db.js
  // cannot change what this starts from.
  const old = await openDB('macro-tracker', 2, {
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
    },
  })
  const rows = {
    foods: [{ id: 'f1', name: 'Oats', nameLower: 'oats', barcode: '123', lastUsedAt: 2, useCount: 1 }],
    entries: [{ id: 'e1', date: '2026-11-20', block: 'night', foodId: 'f1', createdAt: 3 }],
    meals: [{ id: 'm1', name: 'Bowl', items: [], useCount: 0 }],
    weights: [{ date: '2026-11-20', kg: 80, createdAt: 1 }],
    dayTargets: [{ date: '2026-11-20', targets: { kcal: 2000 }, savedAt: 1 }],
  }
  for (const [store, list] of Object.entries(rows)) for (const row of list) await old.put(store, row)
  await old.put('settings', { onboardingComplete: true, theme: 'dark' }, 'settings')
  await old.put('settings', { items: [{ id: 'p' }] }, 'plate')
  old.close()

  const d = await DB.db()
  eq('opens at version 3', d.version, 3)
  for (const [store, list] of Object.entries(rows)) eq(`${store} kept`, await d.getAll(store), list)
  eq('settings kept', await d.get('settings', 'settings'), { onboardingComplete: true, theme: 'dark' })
  eq('the plate kept', await DB.getPlate(), { items: [{ id: 'p' }] })
  eq('indexes still answer', [(await DB.findFoodByBarcode('123')).id, (await DB.listEntries('2026-11-20'))[0].id], ['f1', 'e1'])
  eq('activity starts empty', await DB.listActivity(), [])
}

console.log('\n--- the write ---')
{
  const scopes = []
  DB.onChange((s) => scopes.push(s))
  const f = file([day('2026-11-20'), day('2026-11-21', { sleepMinutes: null })])
  eq('the preview counts', (await DB.previewActivity(f)).rows.length, 2)
  eq('and writes nothing', await DB.listActivity(), [])
  await DB.importActivity(f)
  const first = await DB.listActivity()
  eq('rows land in the stored shape', Object.keys(first[0]), ['date', 'activeKcal', 'steps', 'sleepMinutes', 'importedAt'])
  eq('a null is stored as null', first[1].sleepMinutes, null)
  eq('activity is emitted once', scopes, ['activity'])

  await new Promise((r) => setTimeout(r, 5))
  await DB.importActivity(f)
  eq('the same file again changes nothing, importedAt included', await DB.listActivity(), first)
  eq('and emits nothing', scopes, ['activity'])

  await DB.importActivity(file([day('2026-11-20', { steps: 11000, activeKcal: null }), day('2026-11-21', { sleepMinutes: null })]))
  const third = await DB.listActivity()
  eq('a later file overwrites the date and its nulls do not', [third[0].steps, third[0].activeKcal], [11000, 612])
  eq('the changed row is restamped', third[0].importedAt > first[0].importedAt, true)
  eq('the unchanged one is not', third[1], first[1])

  scopes.length = 0
  let message = null
  await DB.importActivity(file([day('2026-11-25'), day('2026-11-26', { steps: -4 })])).catch((e) => (message = e.message))
  eq('one bad row refuses the file', message, 'Activity for 2026-11-26 has a bad steps value.')
  eq('with nothing written or emitted', [await DB.listActivity(), scopes], [third, []])

  // A write that fails partway rolls back what landed before it.
  const proto = IDBObjectStore.prototype
  const put = proto.put
  let n = 0
  proto.put = function (...a) {
    if (++n === 2) throw new Error('disk')
    return put.apply(this, a)
  }
  message = null
  await DB.importActivity(file([day('2026-11-27'), day('2026-11-28')])).catch((e) => (message = e.message))
  proto.put = put
  eq('a failed write rejects', message, 'disk')
  eq('and nothing of it is kept', [await DB.listActivity(), scopes], [third, []])
}

console.log('\n--- the fixture ---')
{
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/health-activity.json', import.meta.url), 'utf8'))
  await (await DB.db()).clear('activity')
  const held = { date: '2026-11-18', activeKcal: 1, steps: 2, sleepMinutes: 399, importedAt: 7 }
  await (await DB.db()).put('activity', held)
  const scopes = []
  DB.onChange((s) => scopes.push(s))

  for (const run of [DB.previewActivity, DB.importActivity]) {
    let message = null
    await run(fixture).catch((e) => (message = e instanceof B.ImportError && e.message))
    eq(`${run.name} refuses the whole file for its invalid date`, message, 'Day 8 has no valid date.')
  }
  eq('with nothing written or emitted', [await DB.listActivity(), scopes], [[held], []])

  const good = { ...fixture, days: fixture.days.filter((d) => d.date !== '2026-11-31') }
  const p = await DB.previewActivity(good)
  eq('without it: counts', [p.total, p.rows.length, p.overwritten, p.duplicates, p.noData, p.start, p.end], [7, 7, 1, 1, 1, '2026-11-13', '2026-11-20'])
  eq('and the summary', A.activitySummary(p, '2026-11-23'), '7 days · Nov 13 to Nov 20 · 1 overwrites existing')
  await DB.importActivity(good)
  const after = await DB.listActivity()
  const at = (date) => {
    const r = after.find((row) => row.date === date)
    return r && [r.activeKcal, r.steps, r.sleepMinutes]
  }
  eq('nulls and absent fields are stored as null', [at('2026-11-14'), at('2026-11-15'), at('2026-11-16')], [[702.5, 11950, null], [null, 6210, 455], [null, 9034, null]])
  eq('the empty day is not stored', at('2026-11-17'), undefined)
  eq('the later duplicate wins and its null keeps the stored sleep', at('2026-11-18'), [655, 10322, 399])
  await new Promise((r) => setTimeout(r, 5))
  await DB.importActivity(good)
  eq('a second import changes nothing', [await DB.listActivity(), scopes], [after, ['activity']])
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
