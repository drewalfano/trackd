import { getAiKey } from './aiKey.js'

/**
 * The model call, and the only file in the app that knows which model.
 *
 * Everything above this boundary speaks in `{spans, unresolved}` going in and a
 * plain array of items coming out. The endpoint, the auth header, the request
 * envelope and the response shape are all in here, so changing provider is a
 * change to this file and nothing else.
 *
 * **One call, and it happens after resolution rather than before it.** The
 * spec left this open — estimate in a second call, or estimate in the first and
 * use it only as a fallback. On the on-request design the question resolves
 * itself: the call fires only once the library, the staples table and Open Food
 * Facts have all already failed, so there is nothing left for a second round
 * trip to check. Asking for the estimate in the same call as the split costs
 * tokens that are already being spent and saves a whole extra request.
 *
 * What comes back is still treated as a fallback, never as an answer. Anything
 * the model names is put through resolution again on the way out — a dish it
 * splits out of a compound name may well exist in the library — and an estimate
 * is used only where that second pass also finds nothing. Spec 9.3 holds:
 * resolution before estimation, always.
 *
 * **What leaves the device is exactly the two lists passed in.** No date, no
 * targets, no profile, no library contents, and none of the items the rules
 * already placed. There is no logging, no proxy and no second recipient. The
 * key is read here and travels in the header of this one request.
 */

const HOST = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Flash rather than Pro. This is a short structured extraction against a
 * sentence, not a reasoning problem, and Pro is the model Google restricts
 * hardest on the free tier — 50 requests a day against Flash's 1,500.
 *
 * A LIST rather than a constant, because which of these a given key can reach
 * is not knowable from here. `gemini-2.5-flash` is a current stable model and
 * still returned 404 on a real device, which is the API saying "not for this
 * key" rather than "no such model" — a key scoped to a different project, or
 * an account on a different generation, will see a different set. Guessing
 * harder is not a fix; asking is.
 */
const PREFERRED_MODELS = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-2.5-flash-lite']

/** Where the model that actually worked is remembered, so this costs once. */
const MODEL_KEY = 'mt:aiModel'

/** One retry, per the spec. Beyond that a failure should be visible. */
const RETRY_DELAY_MS = 700

function storedModel() {
  try {
    return localStorage.getItem(MODEL_KEY) || ''
  } catch {
    return ''
  }
}

function rememberModel(name) {
  try {
    localStorage.setItem(MODEL_KEY, name)
  } catch {
    /* a working model that has to be rediscovered next time is still working */
  }
}

export class DescribeError extends Error {}

/**
 * The response shape, declared to the API rather than asked for in prose.
 *
 * Gemini enforces this server-side, so the failure mode is a model that returns
 * nothing rather than a model that returns prose the app then has to parse out
 * of a code fence. Macros are nullable on purpose: a fragment nobody can read
 * should come back admitting that, not carrying four invented numbers.
 */
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'NUMBER', nullable: true },
          unit: { type: 'STRING', enum: ['g', 'ml', 'serving'] },
          packaged: { type: 'BOOLEAN' },
          kcal: { type: 'NUMBER', nullable: true },
          protein: { type: 'NUMBER', nullable: true },
          fat: { type: 'NUMBER', nullable: true },
          carbs: { type: 'NUMBER', nullable: true },
        },
        required: ['name', 'quantity', 'unit', 'packaged', 'kcal', 'protein', 'fat', 'carbs'],
      },
    },
  },
  required: ['items'],
}

/**
 * The prompt.
 *
 * It says what the app already did, because the model's job here is not to
 * parse a meal — the rules did that — but to finish two specific jobs the rules
 * refused. Told that, it stops re-splitting things that are already settled.
 *
 * The instruction not to invent foods is the one that matters most. A model
 * asked to describe a plate will helpfully add the dressing on the salad and
 * the butter on the toast, and every one of those is a row somebody has to
 * notice and delete before committing.
 */
function buildPrompt({ spans, unresolved }) {
  const lines = []

  if (spans.length) {
    lines.push(
      'SPLIT — each line below may be one food whose name contains commas, or several foods ' +
        'written without them. Decide which, and return one entry per real food:'
    )
    spans.forEach((s) => lines.push(`- ${s}`))
  }

  if (unresolved.length) {
    lines.push(
      'ESTIMATE — each line below is one food the app has already failed to find in the ' +
        "user's own library, in a table of common foods, and in Open Food Facts. Return one " +
        'entry for each, keeping the amount that was written:'
    )
    unresolved.forEach((u) => lines.push(`- ${u}`))
  }

  return `A food logging app has parsed what someone ate. These are the parts its own parser could not finish. Finish them.

${lines.join('\n')}

For every entry return:
- name: what the food is, said as briefly as it can be. No quantity words in the name.
- quantity and unit: unit is exactly "g", "ml" or "serving". Use "serving" when the amount is a portion rather than a weight, and keep whatever amount was written.
- packaged: true for a branded or packaged product, false for a homemade or restaurant dish.
- kcal, protein, fat, carbs: your best estimate of the TOTAL for that quantity, not per 100 g. Macros in grams.

Rules:
- Return only foods that appear above. Do not add dressings, sides, drinks or garnishes that were not written, however likely they are.
- A line that is one dish whose name happens to contain commas comes back as one entry, under its full name.
- Where an amount was written as a portion — "a small serving", "a few handfuls" — estimate what that portion weighs for that food and give the macros for it.
- If a line means nothing you can identify, return it as one entry with the line as the name and null for quantity and all four macros. Do not guess.`
}

/* ------------------------------------------------------------------ call */

/** Thrown only for a model this key cannot reach, so discovery can catch it. */
class ModelNotFoundError extends DescribeError {}

function authHeaders() {
  const key = getAiKey()
  if (!key) throw new DescribeError('No API key is stored.')
  return { 'Content-Type': 'application/json', 'x-goog-api-key': key }
}

async function post(model, body, { signal }) {
  const res = await fetch(`${HOST}/models/${model}:generateContent`, {
    method: 'POST',
    signal,
    headers: authHeaders(),
    body: JSON.stringify(body),
  })

  if (res.status === 404) throw new ModelNotFoundError(`No access to ${model}.`)
  if (res.status === 400) throw new DescribeError('That key was rejected. Check it in Settings.')
  if (res.status === 401 || res.status === 403) {
    throw new DescribeError('That key was refused. Check it in Settings.')
  }
  if (res.status === 429) {
    throw new DescribeError('Gemini is rate limiting. Wait a minute and try again.')
  }
  if (!res.ok) throw new DescribeError(`Gemini is unavailable (${res.status}).`)

  try {
    return await res.json()
  } catch {
    throw new DescribeError('Gemini returned something unreadable.')
  }
}

/**
 * What this key can actually reach.
 *
 * One GET, and only ever after a 404 has already proved the guess wrong. The
 * preference order is kept — Flash first, cheapest tier of it — but the list
 * itself is the authority, so a key on a different generation of models finds
 * its own rather than needing this file edited.
 *
 * An empty list is a different diagnosis entirely: the key reaches the API and
 * the API has nothing for it, which is a key or project problem rather than a
 * model-name one, and the message says so instead of naming a model.
 */
async function discoverModel({ signal }) {
  const res = await fetch(`${HOST}/models`, { signal, headers: authHeaders() })
  if (!res.ok) throw new DescribeError(`Gemini is unavailable (${res.status}).`)

  const data = await res.json().catch(() => null)
  const usable = (data?.models || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name || '').replace(/^models\//, ''))
    .filter(Boolean)

  if (!usable.length) {
    throw new DescribeError('That key cannot reach any Gemini models. Check it in Settings.')
  }

  const pick =
    PREFERRED_MODELS.find((p) => usable.includes(p)) ||
    // Flash before anything else, and never a preview or a specialised variant.
    usable.find((m) => /flash/.test(m) && !/preview|tts|audio|live|image|embedding/.test(m)) ||
    usable.find((m) => !/preview|tts|audio|live|image|embedding/.test(m)) ||
    usable[0]

  rememberModel(pick)
  return pick
}

const number = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Ask the model to finish what the rules would not.
 *
 * @param {{spans: string[], unresolved: string[], signal?: AbortSignal}} input
 * @returns {Promise<Array<{name, quantity, unit, packaged, estimate}>>}
 */
export async function describeLeftovers({ spans = [], unresolved = [], signal } = {}) {
  if (!spans.length && !unresolved.length) return []

  const body = {
    contents: [{ role: 'user', parts: [{ text: buildPrompt({ spans, unresolved }) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      // Deterministic on purpose: the same sentence should not produce a
      // different plate depending on when it was sent.
      temperature: 0,
    },
  }

  let model = storedModel() || PREFERRED_MODELS[0]
  let data

  /**
   * One retry, and only for things a retry can fix.
   *
   * This used to retry on ANY failure, which meant a 404 — an answer that will
   * be identical every time — fired a second request behind a 700ms wait. On a
   * free tier metered per minute that is how one tap becomes two requests and
   * a handful of taps becomes a rate limit, which is exactly what happened on
   * the first real device: a 404 that could never succeed, quietly doubled,
   * until the next error to arrive was a 429 blaming the wrong thing.
   *
   * So a 4xx is now final except for the one that is genuinely recoverable —
   * an unreachable model, which is recovered by finding a reachable one rather
   * than by asking again.
   */
  try {
    data = await post(model, body, { signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err

    if (err instanceof ModelNotFoundError) {
      model = await discoverModel({ signal })
      data = await post(model, body, { signal })
    } else if (err instanceof DescribeError) {
      // Rejected keys, refused keys and rate limits are all final.
      throw err
    } else {
      // A dropped connection, which is the transient this retry exists for.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      data = await post(model, body, { signal })
    }
  }

  // Only remembered once it has actually produced an answer.
  if (model !== storedModel()) rememberModel(model)

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new DescribeError('Gemini returned nothing to read.')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new DescribeError('Gemini returned something unreadable.')
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : []

  return items
    .filter((raw) => raw && typeof raw.name === 'string' && raw.name.trim())
    .map((raw) => ({
      name: raw.name.trim(),
      quantity: number(raw.quantity),
      unit: ['g', 'ml', 'serving'].includes(raw.unit) ? raw.unit : 'serving',
      packaged: raw.packaged === true,
      /**
       * Kept apart from the item rather than spread onto it, so that nothing
       * downstream can use these by accident. They are consulted only where
       * resolution has already come back empty.
       */
      estimate:
        number(raw.kcal) == null
          ? null
          : {
              kcal: number(raw.kcal) ?? 0,
              protein: number(raw.protein) ?? 0,
              fat: number(raw.fat) ?? 0,
              carbs: number(raw.carbs) ?? 0,
            },
    }))
}
