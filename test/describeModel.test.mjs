/**
 * The model call under a Gemini that is shedding load.
 *
 * Pinned because of a real outage: every phone showed "Gemini is unavailable
 * (503)" at the same moment. Google overloads per model, and the first
 * version of the call treated one busy model as the end of the road. It is
 * not — the next model in the list, or the same one a moment later, answers.
 *
 * `fetch` and `localStorage` are stubbed, so what is checked is exactly which
 * requests go out, in what order, and what the sheet is told at the end.
 */

const R = new URL('../src/lib/', import.meta.url).href

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}

let pass = 0
let fail = 0
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  ok ? pass++ : fail++
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`
  )
}

const { setAiKey } = await import(R + 'aiKey.js')
const { describeMeal, DescribeError } = await import(R + 'describeModel.js')
setAiKey('test-key')

const reply = (items) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ items }) }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
const status = (code) => new Response('', { status: code })
const modelOf = (url) => String(url).match(/models\/([^:]+):generateContent/)?.[1] || String(url)

/** Answer each request from a script of statuses keyed by model; record the order. */
function script(byModel) {
  const calls = []
  globalThis.fetch = async (url) => {
    const model = modelOf(url)
    calls.push(model)
    const next = byModel[model]?.shift()
    if (next === 'ok') return reply([{ name: 'toast', brand: null, quantity: 1, unit: 'serving', modifiers: [], packaged: false, kcal: 80, protein: 3, fat: 1, carbs: 15 }])
    if (typeof next === 'number') return status(next)
    return status(404)
  }
  return calls
}

const failure = (p) => p.then(() => null, (e) => ({ kind: e instanceof DescribeError ? 'describe' : e.name, message: e.message }))

// 1. The first model is overloaded; the next one answers. No error, one row.
{
  store.clear()
  setAiKey('test-key')
  const calls = script({ 'gemini-2.5-flash': [503], 'gemini-3.6-flash': ['ok'] })
  const items = await describeMeal({ text: 'toast' })
  eq('503 on one model moves to the next', calls, ['gemini-2.5-flash', 'gemini-3.6-flash'])
  eq('and the read comes back', items.map((i) => i.name), ['toast'])
  eq('the model that answered is remembered', store.get('mt:aiModel'), 'v1beta|gemini-3.6-flash')
}

// 2. The remembered model is busy once and fine on the retry pass.
{
  store.clear()
  setAiKey('test-key')
  store.set('mt:aiModel', 'v1beta|gemini-2.5-flash')
  const calls = script({ 'gemini-2.5-flash': [503, 'ok'] })
  const items = await describeMeal({ text: 'toast' })
  eq('a busy model is retried after the wait', calls.filter((m) => m === 'gemini-2.5-flash').length, 2)
  eq('and the read comes back', items.length, 1)
}

// 3. Everything is busy on both passes: the message says so, and does not blame the key.
{
  store.clear()
  setAiKey('test-key')
  const calls = script({
    'gemini-2.5-flash': [503, 503],
    'gemini-3.6-flash': [503, 503],
    'gemini-2.5-flash-lite': [502, 502],
  })
  const err = await failure(describeMeal({ text: 'toast' }))
  eq('all busy is a DescribeError', err.kind, 'describe')
  eq('that names the overload, not the key', /overloaded/.test(err.message) && !/key/i.test(err.message), true)
  eq('and stays within the attempt budget per pass', calls.filter((m) => !m.includes('/')).length <= 10, true)
}

// 4. A key that is refused is still final, with no retry behind it.
{
  store.clear()
  setAiKey('test-key')
  const calls = script({ 'gemini-2.5-flash': [403] })
  const err = await failure(describeMeal({ text: 'toast' }))
  eq('403 is not retried', calls, ['gemini-2.5-flash'])
  eq('403 blames the key', /refused/.test(err.message), true)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
