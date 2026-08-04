import { identityKey, putFood, listFoods } from './db.js'

/**
 * Searching the staples table.
 *
 * The table itself is in `staplesData.js` and is loaded on the first search
 * that needs it, never at boot — the app opens on Today, which never searches,
 * and a hundred-odd foods have no business in the bundle that draws a ring.
 * Same argument as the barcode decoder's dynamic import in `scan.js`, at a much
 * smaller size: about 3.6 KB over the wire, once per session.
 *
 * The module-level cache means the cost is paid once per session rather than
 * once per keystroke. `import()` is itself idempotent, so this is belt and
 * braces — but it also lets `searchStaples` stay synchronous-feeling after the
 * first hit, which is the whole reason a local table beats a network one.
 */

let cache = null

async function table() {
  if (!cache) {
    const mod = await import('./staplesData.js')
    cache = mod.STAPLES
  }
  return cache
}

/**
 * How a staple reads on a row.
 *
 * `name` and `note` are stored apart, so this one function is the naming
 * convention for the whole table. The three candidates are `Chicken breast`,
 * USDA's own `Chicken breast, raw`, and `Chicken breast (raw)`.
 *
 * The comma form is the one in use. It is USDA's, it disambiguates the pairs
 * that genuinely need it — whole milk against skim, raw chicken against cooked,
 * where the macros differ enough to matter — and unlike the bare form it does
 * not collide with itself: two rows both reading `Milk` would be a list asking
 * you to guess.
 *
 * The bare form is the friendlier read and stays available for a table whose
 * notes are all suppressed. This is a one-line change, deliberately.
 */
export const stapleName = (staple) =>
  staple.note ? `${staple.name}, ${staple.note}` : staple.name

/**
 * A staple is a draft, not a food, until it is used.
 *
 * Same shape `off.js` hands to `adoptDraft`, and for the same reason: nothing
 * enters the foods store because it exists somewhere, only because someone
 * reached for it. Seeding forty records at first run would put forty foods
 * nobody chose into the Food library, into the recents that feed the Quick add
 * rail, and into an export of "your foods".
 */
export const stapleDraft = (staple) => ({
  name: stapleName(staple),
  brand: null,
  barcode: null,
  servingSize: staple.servingSize,
  servingUnit: 'g',
  servingLabel: staple.servingLabel,
  per100: { ...staple.per100 },
  source: 'staple',
})

/**
 * Scored the same way `searchFoods` scores the library: every term has to
 * appear, and a prefix match beats a mid-string one. `egg` should not have to
 * compete with `nutmeg`.
 *
 * The note and the synonyms are searchable as well as the name, so `raw
 * chicken`, `chicken raw` and `shrimp` all land. Neither contributes to the
 * prefix bonus — the name is what someone is typing at, and a synonym match
 * should not outrank a food whose actual name starts with the word.
 */
export async function searchStaples(query, limit = 10) {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const terms = q.split(/\s+/)

  return (await table())
    .map((staple) => {
      const name = staple.name.toLowerCase()
      const hay = `${name} ${(staple.note || '').toLowerCase()} ${(staple.aka || '').toLowerCase()}`
      if (!terms.every((t) => hay.includes(t))) return null
      return { staple, score: name.startsWith(terms[0]) ? 2 : name.includes(terms[0]) ? 1 : 0 }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.staple)
}

/**
 * Staples the library has not already absorbed.
 *
 * Once a staple has been used it IS a food record, and it will come back from
 * `searchFoods` carrying a real serving history and a use count. Showing the
 * table's copy beside it would be the same food twice, once as something you
 * have eaten and once as a stranger — which is the exact duplicate `recentFoods`
 * already dedupes in the rail, so it uses the same key.
 */
export async function searchNewStaples(query, limit = 10) {
  const [found, library] = await Promise.all([searchStaples(query, limit * 2), listFoods()])
  const known = new Set(library.map(identityKey))
  return found.filter((s) => !known.has(identityKey({ name: stapleName(s) }))).slice(0, limit)
}

/**
 * Copy a staple into the library. Mirrors `adoptDraft`, minus the barcode reuse
 * — a staple has no barcode, and its name IS its identity.
 */
export async function adoptStaple(staple) {
  const draft = stapleDraft(staple)
  const library = await listFoods()
  const existing = library.find((f) => identityKey(f) === identityKey(draft))
  return existing || putFood(draft)
}
