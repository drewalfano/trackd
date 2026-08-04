import { round } from './format.js'
import { sanityCheck } from './compute.js'
import { putFood, findFoodByBarcode } from './db.js'

/**
 * Open Food Facts client.
 *
 * Everything crossing this boundary gets normalized to per-100 immediately.
 * OFF is crowdsourced and inconsistent — some products carry per-serving values
 * only, energy arrives in kJ or kcal depending on the contributor, and sodium
 * is sometimes only present as salt. All of that is this module's problem, and
 * nothing downstream should ever see a raw OFF field.
 */

const HOST = 'https://world.openfoodfacts.org'
const FIELDS = [
  'code',
  'product_name',
  'generic_name',
  'brands',
  'quantity',
  'serving_size',
  'serving_quantity',
  'nutrition_data_per',
  'nutriments',
].join(',')

export const isOnline = () => navigator.onLine !== false

export class OffError extends Error {}

/**
 * Open Food Facts is a free service and it wobbles: it rate limits search
 * harder than product lookups, and under load it serves an HTML maintenance
 * page rather than JSON. Both need to surface as a clean error the UI can
 * offer a retry on, not a raw SyntaxError from JSON.parse.
 */
async function getJson(url, { signal } = {}) {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })

  if (res.status === 429) throw new OffError('Open Food Facts is rate limiting. Try again shortly.')
  if (!res.ok) throw new OffError(`Open Food Facts is unavailable (${res.status}).`)

  const type = res.headers.get('content-type') || ''
  if (!type.includes('json')) throw new OffError('Open Food Facts returned an unexpected response.')

  try {
    return await res.json()
  } catch {
    throw new OffError('Open Food Facts returned an unexpected response.')
  }
}

/* ------------------------------------------------------------ normalizing */

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) ? n : null
}

/** Energy comes in kcal or kJ depending on who entered it. */
function energyKcal(n, suffix) {
  const kcal = num(n[`energy-kcal${suffix}`])
  if (kcal != null) return kcal
  const kj = num(n[`energy-kj${suffix}`])
  if (kj != null) return kj / 4.184
  const generic = num(n[`energy${suffix}`])
  if (generic == null) return null
  return n.energy_unit === 'kcal' ? generic : generic / 4.184
}

/** Sodium in mg. Falls back to salt, which is what most EU labels carry. */
function sodiumMg(n, suffix) {
  const sodium = num(n[`sodium${suffix}`]) // grams
  if (sodium != null) return sodium * 1000
  const salt = num(n[`salt${suffix}`])
  if (salt != null) return (salt / 2.5) * 1000
  return null
}

function pickSet(n, suffix) {
  return {
    kcal: energyKcal(n, suffix),
    protein: num(n[`proteins${suffix}`]),
    fat: num(n[`fat${suffix}`]),
    carbs: num(n[`carbohydrates${suffix}`]),
    sodium: sodiumMg(n, suffix),
  }
}

const hasAny = (set) =>
  set && [set.kcal, set.protein, set.fat, set.carbs].some((v) => v != null && v > 0)

/** "30 g", "1 scoop (30g)", "250ml" → 30 / 250. */
function parseServingQuantity(label) {
  if (!label) return null
  const match = String(label).match(/([\d.,]+)\s*(g|ml)\b/i)
  if (!match) return null
  return num(match[1].replace(',', '.'))
}

function detectUnit(product) {
  const haystack = `${product.serving_size || ''} ${product.quantity || ''}`
  return /\bml\b|\bl\b|litre|liter/i.test(haystack) ? 'ml' : 'g'
}

/**
 * @returns {{draft: object, warnings: string[], hasNutrition: boolean}}
 */
export function normalizeProduct(product) {
  const n = product?.nutriments || {}
  const unit = detectUnit(product)

  const per100Raw = pickSet(n, '_100g')
  const perServingRaw = pickSet(n, '_serving')
  const servingQty =
    num(product.serving_quantity) ?? parseServingQuantity(product.serving_size) ?? null

  let per100 = null
  let derivedFromServing = false

  if (hasAny(per100Raw)) {
    per100 = per100Raw
  } else if (hasAny(perServingRaw) && servingQty > 0) {
    // Per-serving only: scale it up rather than dropping the product.
    const f = 100 / servingQty
    per100 = {
      kcal: perServingRaw.kcal == null ? null : perServingRaw.kcal * f,
      protein: perServingRaw.protein == null ? null : perServingRaw.protein * f,
      fat: perServingRaw.fat == null ? null : perServingRaw.fat * f,
      carbs: perServingRaw.carbs == null ? null : perServingRaw.carbs * f,
      sodium: perServingRaw.sodium == null ? null : perServingRaw.sodium * f,
    }
    derivedFromServing = true
  }

  const hasNutrition = hasAny(per100)
  const clean = {
    kcal: round(per100?.kcal ?? 0, 2),
    protein: round(per100?.protein ?? 0, 2),
    fat: round(per100?.fat ?? 0, 2),
    carbs: round(per100?.carbs ?? 0, 2),
    sodium: per100?.sodium == null ? null : round(per100.sodium, 1),
  }

  const name =
    (product.product_name || '').trim() ||
    (product.generic_name || '').trim() ||
    (product.brands || '').split(',')[0]?.trim() ||
    'Unnamed product'

  const servingSize = servingQty && servingQty > 0 ? servingQty : 100
  const draft = {
    name,
    brand: (product.brands || '').split(',')[0]?.trim() || null,
    barcode: product.code || null,
    servingSize: round(servingSize, 2),
    servingUnit: unit,
    servingLabel: (product.serving_size || '').trim() || `${round(servingSize, 2)} ${unit}`,
    per100: clean,
    source: 'off',
  }

  const warnings = hasNutrition ? sanityCheck(clean, unit) : []
  if (derivedFromServing) {
    warnings.push('This product only listed per-serving values, so they were scaled to per 100 g.')
  }

  return { draft, warnings, hasNutrition }
}

/* -------------------------------------------------------------- endpoints */

/** Barcode lookup. Resolves to null when OFF has never seen the code. */
export async function fetchByBarcode(barcode, { signal } = {}) {
  const url = `${HOST}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`
  const data = await getJson(url, { signal })
  if (data?.status !== 1 || !data.product) return null
  return normalizeProduct({ ...data.product, code: data.product.code || barcode })
}

/**
 * Text search. Trimmed to the fields we normalize, to keep responses small.
 *
 * Uses the legacy cgi/search.pl rather than /api/v2/search, which is the more
 * modern endpoint but currently returns 503 far more often. Even this one
 * intermittently 503s under load, so a transient failure gets one quiet retry
 * before the user is shown anything — a spurious "try again" for a service
 * that would have answered a second later is exactly the kind of friction this
 * app is meant to avoid.
 */
export async function searchProducts(query, { signal, pageSize = 25 } = {}) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: '1',
    action: 'process',
    json: '1',
    page_size: String(pageSize),
    fields: FIELDS,
  })
  const url = `${HOST}/cgi/search.pl?${params}`

  let data
  try {
    data = await getJson(url, { signal })
  } catch (err) {
    /**
     * `TypeError` is in here as well as `OffError` because a dropped connection
     * is the transient this retry exists for and it was the one case falling
     * straight through. `fetch` rejects with a bare "Failed to fetch" when the
     * socket dies mid-request — no status, no body — and OFF does that under
     * load on a repeat query, which is exactly the shape of someone typing.
     * Since search moved inline it fires on the keystroke rather than on a
     * button, so it meets that failure far more often than it used to.
     *
     * `AbortError` is never retried: that one is the app's own doing.
     */
    if (err.name === 'AbortError') throw err
    if (!(err instanceof OffError) && !(err instanceof TypeError)) throw err
    await new Promise((resolve) => setTimeout(resolve, 700))
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    data = await getJson(url, { signal })
  }
  const products = Array.isArray(data?.products) ? data.products : []
  return products
    .map((p) => normalizeProduct(p))
    .filter((r) => r.hasNutrition && r.draft.name !== 'Unnamed product')
}

/**
 * Copy a normalized draft into the local library, reusing by barcode.
 *
 * Lives here rather than with either caller because both the scanner and the
 * search results reach it, and it is the one place that decides an OFF product
 * has become one of your foods. Spec 9: a barcode already in the library is
 * reused, never duplicated — scanning the same tin twice is one food with two
 * log entries, not two foods.
 */
export async function adoptDraft(draft) {
  if (draft.barcode) {
    const existing = await findFoodByBarcode(draft.barcode)
    if (existing) return existing
  }
  return putFood({ ...draft, source: draft.source || 'off' })
}
