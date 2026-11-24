/**
 * Motra's Excel export. Every workout here is invented; only the shape of the
 * sheet is Motra's.
 */
import 'fake-indexeddb/auto'
import { deflateRawSync } from 'node:zlib'
const R = new URL('../src/lib/', import.meta.url).href
const I = await import(R + 'motraImport.js')
const X = await import(R + 'xlsx.js')
const M = await import(R + 'motra.js')
const U = await import(R + 'muscles.js')
const T = await import(R + 'training.js')
const B = await import(R + 'backup.js')
const DB = await import(R + 'db.js')

let pass = 0, fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`)
}

/* ------------------------------------------------------------ a fake sheet */

const COLS = ['Exercise', 'Weight (lbs)', 'Reps', 'Time (seconds)', 'Distance (m)', 'Rest Time (seconds)', 'Effort', 'Primary Muscle Groups', 'Note']
const set = (name, weight, reps, { time = 0, rest = 60, groups = 'chest', note = '' } = {}) => [name, weight, reps, time, 0, rest, '', groups, note]
const block = ({ title = 'Test Day', start = '2026-01-05 09:15:51', sets = [set('Test Press', 50, 12)], total = sets.length, zones = true, volume = 'Total TVL (lbs)', cols = COLS, head = [] } = {}) => [
  [title], ['Workout Start', start], ['Workout End', '2026-01-05 10:00:00'], ['Total Duration (seconds)', 2666], ['Total Sets', total], ['Burned Calories', 400], [volume, 6730], ['Effort', 'N/A'], ...head,
  ['   '], ...(zones ? [['Heart Rate Zones'], ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5'], ['26s', '7m 32s', '1h 2m', '13m', '0s'], ['   ']] : []),
  ['All Sets'], cols, ...sets, [''],
]
const rows = (...blocks) => blocks.flat().map((cells, i) => ({ row: i + 1, cells }))
const parse = (...blocks) => I.parseMotraRows(rows(...blocks))
const rejects = (label, input, ...fragments) => {
  let got = 'accepted'
  try { I.parseMotraRows(input) } catch (err) { got = err instanceof B.ImportError ? err.message : `wrong: ${err.stack}` }
  eq(`rejects ${label}`, fragments.every((f) => got.includes(f)) ? 'named' : got, 'named')
}

console.log('--- rows ---')
const one = parse(block({ sets: [set('Test Press', 27.5, 12, { time: 27.9 }), set('Test Press', 30, 10), set('Test Plank', 0, 15, { time: 63.2, groups: 'abs, obliques', rest: -4, note: 'x' }), set('Test Press', 30, 8)] }))
eq('a workout', one.workouts, [{
  id: 'motra 2026-01-05 09:15:51 test day', title: 'Test Day', startedAt: new Date(2026, 0, 5, 9, 15, 51).getTime(), date: '2026-01-05', durationMin: 44, calories: 400, reportedVolume: 6730, unit: 'lb',
  exercises: [
    { name: 'Test Press', sets: [{ reps: 12, weight: 27.5, seconds: 28 }, { reps: 10, weight: 30 }], motraMuscles: ['chest'] },
    { name: 'Test Plank', sets: [{ reps: 15, weight: 0, seconds: 63 }], motraMuscles: ['abs', 'obliques'] },
    { name: 'Test Press', sets: [{ reps: 8, weight: 30 }], motraMuscles: ['chest'] },
  ],
}])
eq('notes are counted', one.notes, 1)
eq('no zones block', parse(block({ zones: false })).workouts.length, 1)
eq('kg', parse(block({ volume: 'Total TVL (kg)', cols: COLS.with(1, 'Weight (kg)') })).workouts[0].unit, 'kg')
eq('a workout with no sets is left out and counted', (({ workouts, empty }) => [workouts.length, empty])(parse(block({ sets: [] }), block())), [1, 1])
eq('N/A totals are null', parse(block().map((r) => (r[0] === 'Burned Calories' ? [r[0], 'N/A'] : r))).workouts[0].calories, null)
eq('a set validates in a backup', B.validateImport({ format: B.EXPORT_FORMAT, version: 4, workouts: one.workouts }).stores.workouts, one.workouts)

console.log('\n--- muscles ---')
eq('direct groups', I.motraGroups('quads, glutes'), ['quads', 'glutes'])
eq('groups with no match are dropped', I.motraGroups('hamstrings, glutes, lowerBack'), ['hamstrings', 'glutes'])
eq('only those leaves none', I.motraGroups('abductors'), null)
eq('shoulders is not guessed, alone or with others', [I.motraGroups('shoulders'), I.motraGroups('abs, shoulders')], [null, null])
eq('an unknown group is not guessed', I.motraGroups('abs, neck'), null)
eq('dropped ones are named', parse(block({ sets: [set('Test', 1, 1, { groups: 'abs, hipFlexors' }), set('Test', 1, 1, { groups: 'lowerBack' })] })).dropped, ['hip flexors', 'lower back'])
eq('the fallback is behind the seed and the person', [
  U.musclesOf({ name: 'Test Press', motraMuscles: ['abs'] }, {}), U.musclesOf({ name: 'Dumbbell Bench Press', motraMuscles: ['abs'] }, {}).primary, U.musclesOf({ name: 'Test Press', motraMuscles: ['abs'] }, { 'test press': { primary: ['quads'], secondary: [] } }).primary,
], [{ primary: ['abs'], secondary: [] }, ['chest'], ['quads']])
eq('names the export uses are seeded', ['Bench Dips', 'Cable Lat Pull Down Wide-Grip', 'Cable Rope Tricep Pushdown / Extension', 'Machine Hip Thrust (Glute Bridge)', 'Dumbbell Rear Delt (Reverse) Fly', 'Machine Seated Chest Press', 'Leg / Hamstring Curl Seated', 'EZ-Bar Close-Grip Bicep Curl'].filter((n) => !U.musclesFor(n)), [])
eq('the week counts the fallback', T.trainingWeek(one.workouts, '2026-01-05', {}).muscles.chest.sets, 3)

console.log('\n--- refusals name the row ---')
const at = (b, r, cells) => rows(b).map((l) => (l.row === r ? { ...l, cells } : l))
rejects('an empty sheet', [], 'no workouts')
rejects('another sheet', rows([['Name', 'Age'], ['x', 3]]), 'Row 1', 'not a line')
rejects('an unknown label', rows(block({ head: [['Mood', 3]] })), 'Row 9', '"Mood"')
rejects('a repeated label', rows(block({ head: [['Effort', 3]] })), 'Row 9', 'second Effort')
rejects('a wide label row', at(block(), 5, ['Total Sets', 1, 2]), 'Row 5')
for (const bad of ['2026-02-30 09:00:00', '2026-01-05', '2026-01-05 24:00:00', 46027.4]) rejects(`start ${bad}`, at(block(), 2, ['Workout Start', bad]), 'Row 2', 'bad date')
for (const bad of [-1, 'x', undefined]) rejects(`calories ${bad}`, at(block(), 6, ['Burned Calories', bad]), 'Row 6', 'Burned Calories')
rejects('a set total that disagrees', rows(block({ total: 3 })), 'Row 5', 'says 3 sets', 'has 1')
rejects('odd zones', at(block(), 11, ['Zone 1', 'Zone 3']), 'Row 11', 'zones')
rejects('odd zone times', at(block(), 12, ['26s', '1', '2', '3', '4']), 'Row 12', 'zone times')
rejects('a new column', rows(block({ cols: [...COLS, 'RPE'] })), 'Row 15', 'table heading')
rejects('an unknown weight unit', rows(block({ cols: COLS.with(1, 'Weight (stone)') })), 'Row 15')
rejects('units that disagree', rows(block({ cols: COLS.with(1, 'Weight (kg)') })), 'Row 15', 'in kg', 'in lb')
for (const [i, bad, what] of [[1, -5, 'Weight'], [1, 'x', 'Weight'], [2, 1.5, 'Reps'], [2, undefined, 'Reps'], [3, -1, 'Time'], [0, 7, 'not a set'], [7, 9, 'muscle groups']]) rejects(`set cell ${i} of ${bad}`, at(block(), 16, set('Test Press', 50, 12).with(i, bad)), 'Row 16', what)
rejects('a stray line', rows(block(), [['hello']]), 'Row 18', 'not a set', '"hello"')
rejects('a cut-off workout', rows([['Test Day'], ['Workout Start', '2026-01-05 09:15:51']]), 'Row 1', 'All Sets')
rejects('a workout listed twice', rows(block(), block()), 'Row 18', 'row 1')
eq('two in one minute with different titles', parse(block(), block({ title: 'Other Day' })).workouts.length, 2)

console.log('\n--- zip and sheet ---')
/** Enough of a DOM for `readSheet`; the browser's own is used in the app. */
function miniXml(text) {
  const root = { localName: '#doc', children: [], parentNode: null, attributes: [] }
  let cur = root
  const ent = (s) => s.replace(/&(lt|gt|amp|quot|apos);/g, (_, n) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[n])
  for (const m of text.matchAll(/<\?[^>]*>|<(\/?)([\w:]+)((?:\s+[\w:]+="[^"]*")*)\s*(\/?)>|([^<]+)/g)) {
    if (m[5] != null) cur.children.push({ text: ent(m[5]) })
    else if (m[2] && m[1]) cur = cur.parentNode
    else if (m[2]) {
      const node = { localName: m[2].split(':').at(-1), children: [], parentNode: cur, attributes: [...m[3].matchAll(/([\w:]+)="([^"]*)"/g)].map((a) => ({ name: a[1], localName: a[1].split(':').at(-1), value: ent(a[2]) })) }
      cur.children.push(node)
      if (!m[4]) cur = node
    }
  }
  const wrap = (n) => ({
    localName: n.localName, attributes: n.attributes, get parentNode() { return n.parentNode },
    getAttribute: (k) => n.attributes.find((a) => a.name === k)?.value ?? null,
    get children() { return n.children.filter((c) => c.localName).map(wrap) },
    get textContent() { const t = (x) => x.text ?? x.children.map(t).join(''); return t(n) },
    getElementsByTagNameNS: (_, tag) => { const out = []; const walk = (x) => x.children.forEach((c) => { if (c.localName) { if (c.localName === tag) out.push(wrap(c)); walk(c) } }); walk(n); return out },
  })
  return wrap(root)
}
function zip(files, { method = 8, flags = 0 } = {}) {
  const parts = [], dir = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), data = method === 8 ? deflateRawSync(raw) : raw, n = Buffer.from(name)
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(flags, 8); c.writeUInt16LE(method, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(offset, 42)
    parts.push(local, n, data); dir.push(c, n); offset += 30 + n.length + data.length
  }
  const size = dir.reduce((s, b) => s + b.length, 0)
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(dir.length / 2, 10); end.writeUInt32LE(size, 12); end.writeUInt32LE(offset, 16)
  const all = Buffer.concat([...parts, ...dir, end])
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.length)
}
const book = (over = {}, opts) => zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Other" r:id="r1"/><sheet name="Workouts" sheetId="1" r:id="r9"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="r9" Type="x/worksheet" Target="worksheets/odd.xml"/><Relationship Id="r2" Type="x/sharedStrings" Target="/xl/sharedStrings.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Push &amp; pull</t></si><si><r><t>Two </t></r><r><t>runs</t></r><rPh><t>no</t></rPh></si></sst>',
  'xl/worksheets/odd.xml': '<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2"><v>27.5</v></c><c r="AB2" t="inlineStr"><is><t>in</t></is></c></row><row><c t="s"><v>1</v></c><c t="str"><v>f</v></c><c/></row></sheetData></worksheet>',
  ...over,
}, opts)
const read = (buffer, parser = miniXml) => X.readSheet(buffer, 'Workouts', parser)
const sheetFails = async (label, buffer, fragment, parser) => {
  let got = 'accepted'
  await read(buffer, parser).catch((e) => (got = e instanceof X.XlsxError ? e.message : `wrong: ${e.stack}`))
  eq(`refuses ${label}`, got.includes(fragment) ? 'said' : got, 'said')
}
const cells = new Array(28); cells[0] = 'Push & pull'; cells[2] = 27.5; cells[27] = 'in'
eq('shared, inline and formula strings, numbers, gaps, rels', await read(book()), [{ row: 2, cells }, { row: 3, cells: ['Two runs', 'f'] }])
eq('stored without compression', (await read(book({}, { method: 0 }))).length, 2)
await sheetFails('a text file', new TextEncoder().encode('{"format":"macro-tracker-export"} and more').buffer, 'not an Excel workbook')
await sheetFails('an empty file', new ArrayBuffer(0), 'not an Excel workbook')
await sheetFails('some other zip', zip({ 'a.txt': 'x' }), 'not an Excel workbook')
await sheetFails('a cut-off file', book().slice(0, 300), 'damaged')
await sheetFails('a password', book({}, { flags: 1 }), 'password')
await sheetFails('another method', book({}, { method: 12 }), 'damaged')
await sheetFails('a missing sheet', book({ 'xl/workbook.xml': '<workbook><sheets/></workbook>' }), 'no sheet named "Workouts"')
await sheetFails('malformed XML', book(), 'damaged', () => null)
await sheetFails('a document type', book({ 'xl/workbook.xml': '<!DOCTYPE x><workbook/>' }), 'damaged')
await sheetFails('an error cell', book({ 'xl/worksheets/odd.xml': '<worksheet><row r="4"><c r="A4" t="e"><v>#REF!</v></c></row></worksheet>' }), 'Row 4')
await sheetFails('a missing shared string', book({ 'xl/worksheets/odd.xml': '<worksheet><row r="4"><c r="A4" t="s"><v>99</v></c></row></worksheet>' }), 'Row 4')
await sheetFails('a file over the cap', new ArrayBuffer(X.MAX_FILE + 1), 'too large')
await sheetFails('a small file that expands past the cap', book({ 'xl/sharedStrings.xml': ' '.repeat(X.MAX_EXPANDED + 10) }), 'too large')
{
  const bytes = Buffer.from(book()); const i = bytes.indexOf('xl/worksheets/odd.xml') + 21; bytes.fill(0xff, i, i + 20)
  await sheetFails('damaged compression', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length), 'damaged')
}

console.log('\n--- merge and write ---')
const pasteText = (title, time, reps = 12) => `My workout:\n\n${title}\nJan 5, 2026 at ${time}\n\nDumbbell Bench Press\n1: ${reps} reps x 35 lb\n\nTracked with Motra.\nhttps://motra.com/share/workout/test0001`
const scopes = []
DB.onChange((s) => scopes.push(s))
const file = parse(block(), block({ title: 'Other Day' }), block({ title: 'Later', start: '2026-01-06 18:00:00' }))
{
  const p = await DB.previewWorkouts(file)
  eq('preview', [I.summaryLine(p, '2026-02-01'), I.changeLine(p), p.unchosen], ['3 workouts · Jan 5 to Jan 6 · 3 sets', '3 new', []])
  eq('writes nothing', (await DB.listWorkouts()).length, 0)
  await DB.importWorkouts(file)
  eq('stored, one emit', [(await DB.listWorkouts()).length, scopes.splice(0)], [3, ['workouts']])
  await DB.importWorkouts(file)
  eq('a second import writes and emits nothing', [(await DB.listWorkouts()).length, scopes.length], [3, 0])
  eq('and says so', I.changeLine(await DB.previewWorkouts(file)), '3 already stored')
  const changed = parse(block({ sets: [set('Test Press', 55, 12)] }))
  eq('a changed export replaces its own row', [I.changeLine(await DB.previewWorkouts(changed)), (await DB.importWorkouts(changed)).rows.length, (await DB.listWorkouts()).length], ['1 changed and replaced', 1, 3])
  await DB.importWorkouts(file)
  scopes.length = 0

  const pasted = M.parseMotra(pasteText('  TEST  day', '9:15 AM')).workout
  eq('pasting an imported workout finds it', (await DB.findWorkout(pasted)).id, 'motra 2026-01-05 09:15:51 test day')
  eq('and adds nothing', [await DB.saveWorkout(pasted), (await DB.listWorkouts()).length, scopes.length], [false, 3, 0])
  eq('same minute, other title, is another workout', await DB.saveWorkout(M.parseMotra(pasteText('Third', '9:15 AM')).workout), true)
  eq('same title, other minute, is another workout', await DB.findWorkout(M.parseMotra(pasteText('Test Day', '9:16 AM').replace('test0001', 'test0002')).workout), null)
}
{
  await (await DB.db()).clear('workouts')
  const pasted = M.parseMotra(pasteText('Test Day', '9:15 AM')).workout
  await DB.saveWorkout(pasted)
  const p = await DB.previewWorkouts(file)
  eq('a pasted workout counts as already stored', I.changeLine(p), '2 new · 1 already stored')
  await DB.importWorkouts(file)
  const stored = await DB.listWorkouts()
  eq('it keeps its id and is not enriched', [stored.length, stored.find((w) => w.title === 'Test Day')], [3, pasted])
  await DB.importWorkouts(file)
  eq('and again', (await DB.listWorkouts()).length, 3)
}
{
  const before = await DB.listWorkouts()
  const proto = IDBObjectStore.prototype, put = proto.put
  let n = 0
  proto.put = function (...a) { if (++n === 2) throw new Error('disk'); return put.apply(this, a) }
  let message = null
  await DB.importWorkouts(parse(block({ title: 'A', start: '2026-03-01 09:00:00' }), block({ title: 'B', start: '2026-03-02 09:00:00' }))).catch((e) => (message = e.message))
  proto.put = put
  eq('a failed write keeps nothing', [message, await DB.listWorkouts()], ['disk', before])
}

console.log('\n--- copy ---')
eq('set labels', [T.setLabel({ reps: 15, weight: 0, seconds: 63 }, 'lb'), T.setLabel({ reps: 12, weight: 35, seconds: 28 }, 'lb'), T.setLabel({ reps: 0, weight: 0, seconds: 40 }, 'lb')], ['15 reps, 63 s', '12 × 35 lb', '40 s'])
eq('left out', I.leftOut({ notes: 2, empty: 1, dropped: ['lower back'] }), ['Rest, distance, effort and heart rate are not stored.', '2 notes in the file are not stored.', '1 workout in the file has no sets and will not be stored.', 'Trackd has no muscle for lower back, so those are left out.'])
eq('nothing in the file', I.summaryLine({ total: 0 }), 'No workouts with sets in that file')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
