#!/usr/bin/env node
/**
 * Generates src/lib/staplesData.js from the USDA FoodData Central SR Legacy
 * export.
 *
 * The table was hand-entered to begin with, from memory of the USDA figures,
 * which was fine for judging whether the feature was worth having and not fine
 * for counting calories against. This replaces that: every macro in the output
 * is copied from the dataset, and nothing in the output is typed by a person
 * except the things a dataset cannot supply.
 *
 * **What stays editorial, and why the manifest exists.** SR Legacy has 7,793
 * rows and most of them are not foods anyone searches for. Three decisions have
 * to be made per staple and none of them can be derived:
 *
 *   1. WHICH of the 7,793 — `Egg, whole, raw, fresh` against nine other eggs.
 *   2. What it is CALLED — `Egg`, not `Egg, whole, raw, fresh`.
 *   3. What one PORTION is — the difference between answering "I ate an egg"
 *      and handing someone 100 g of egg to divide.
 *
 * So the manifest carries the judgement and this script carries the arithmetic.
 *
 * Usage:
 *   node scripts/build-staples.mjs --data <path-to-sr-legacy.json>
 *   node scripts/build-staples.mjs --data <path> --find "chicken breast"
 *
 * The dataset is ~13 MB zipped, public domain, no key:
 *   https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip
 *
 * It is deliberately NOT vendored into the repo. It is 200 MB unzipped, it
 * changes about once a decade, and the generated file is the artefact that
 * matters — checking in the source would be checking in a quarry to ship a
 * brick.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { MANIFEST } from './staples-manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../src/lib/staplesData.js')

const DOWNLOAD =
  'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip'

/* ------------------------------------------------------------------- args */

const args = process.argv.slice(2)
const argOf = (flag) => {
  const i = args.indexOf(flag)
  return i === -1 ? null : args[i + 1]
}

const dataPath = argOf('--data')
const findTerm = argOf('--find')

if (!dataPath) {
  console.error(
    `\nNeed the SR Legacy JSON.\n\n  curl -LO ${DOWNLOAD}\n  unzip FoodData_Central_sr_legacy_food_json_2018-04.zip\n  node scripts/build-staples.mjs --data FoodData_Central_sr_legacy_food_json_2018-04.json\n`
  )
  process.exit(1)
}

/* ------------------------------------------------------------------- data */

const raw = JSON.parse(readFileSync(dataPath, 'utf8'))
const FOODS = raw.SRLegacyFoods || raw.foods || raw
if (!Array.isArray(FOODS)) {
  console.error('Unrecognised dataset shape — expected SRLegacyFoods to be an array.')
  process.exit(1)
}

/** SR Legacy carries every nutrient per 100 g of the edible portion. */
const NUTRIENTS = {
  kcal: (n) => n.nutrient.name === 'Energy' && n.nutrient.unitName.toLowerCase() === 'kcal',
  protein: (n) => n.nutrient.name === 'Protein',
  fat: (n) => n.nutrient.name === 'Total lipid (fat)',
  carbs: (n) => n.nutrient.name === 'Carbohydrate, by difference',
  sodium: (n) => n.nutrient.name === 'Sodium, Na',
}

const per100 = (food) => {
  const out = {}
  for (const [key, match] of Object.entries(NUTRIENTS)) {
    const hit = food.foodNutrients.find(match)
    out[key] = hit && typeof hit.amount === 'number' ? round(hit.amount, 2) : null
  }
  return out
}

const round = (n, dp) => {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/* -------------------------------------------------------------- resolving */

const norm = (s) => (s || '').toLowerCase()

/**
 * Whole-word matching, not substring.
 *
 * `with` matched `without` on the first run, so `apples raw with skin` resolved
 * to `Apples, raw, without skin` — a real 4 kcal error arriving silently, and
 * the `not` filters were failing the same way in reverse. Word boundaries are
 * built by hand rather than with `\b` because the terms include `85%` and
 * `3.25`, where `\b` sits in the wrong place or not at all.
 */
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasWord = (haystack, term) =>
  new RegExp(`(^|[^a-z0-9])${escape(term)}([^a-z0-9]|$)`).test(haystack)

/**
 * Every term has to appear, and the SHORTEST surviving description wins.
 *
 * Length is a decent proxy for genericness in this dataset: `Egg, whole, raw,
 * fresh` beats `Egg custards, dry mix, prepared with whole milk` on the query
 * `egg whole raw` because the qualifiers people do not want are extra words.
 * Where it picks wrong, the manifest pins an fdcId and this never runs.
 */
function findFood(entry) {
  if (entry.fdcId) {
    const hit = FOODS.find((f) => f.fdcId === entry.fdcId)
    if (!hit) throw new Error(`fdcId ${entry.fdcId} not in dataset (${entry.name})`)
    return hit
  }
  const terms = norm(entry.q).split(/\s+/).filter(Boolean)
  const banned = norm(entry.not || '').split(/\s+/).filter(Boolean)

  const hits = FOODS.filter((f) => {
    const d = norm(f.description)
    return terms.every((t) => hasWord(d, t)) && !banned.some((b) => hasWord(d, b))
  }).sort((a, b) => a.description.length - b.description.length)

  if (!hits.length) throw new Error(`no match for "${entry.q}" (${entry.name})`)
  return hits[0]
}

/**
 * The gram weight of one portion.
 *
 * `g` on the manifest wins outright — some portions are a judgement the dataset
 * does not hold, like calling 40 g a serving of dry oats. Otherwise `portion`
 * names a modifier to look up: `large` on an egg is 50 g, straight from USDA.
 */
function servingOf(entry, food) {
  if (entry.g) return { grams: entry.g, from: 'manifest' }

  const portions = food.foodPortions || []
  const want = norm(entry.portion)
  const hit =
    portions.find((p) => norm(p.modifier) === want) ||
    portions.find((p) => norm(p.modifier).startsWith(want)) ||
    portions.find((p) => norm(p.modifier).includes(want))

  if (!hit || !hit.gramWeight) {
    const available = portions.map((p) => `${p.modifier} (${p.gramWeight} g)`).join(', ')
    throw new Error(
      `no portion "${entry.portion}" for ${entry.name}. Available: ${available || 'none'}`
    )
  }
  return { grams: round(hit.gramWeight, 2), from: hit.modifier }
}

/* ----------------------------------------------------------- lookup mode */

if (findTerm) {
  const terms = norm(findTerm).split(/\s+/)
  const hits = FOODS.filter((f) => terms.every((t) => norm(f.description).includes(t)))
    .sort((a, b) => a.description.length - b.description.length)
    .slice(0, 15)
  console.log(`\n${hits.length} shown, shortest first:\n`)
  for (const f of hits) {
    const p = per100(f)
    const portions = (f.foodPortions || [])
      .map((x) => `${x.modifier}=${x.gramWeight}g`)
      .join(' ')
    console.log(`${String(f.fdcId).padEnd(8)} ${f.description}`)
    console.log(`         ${p.kcal} kcal  ${p.protein}P ${p.fat}F ${p.carbs}C   ${portions}`)
  }
  process.exit(0)
}

/* ------------------------------------------------------------ generating */

const rows = []
const problems = []
const audit = []

for (const entry of MANIFEST) {
  try {
    const food = findFood(entry)
    const macros = per100(food)
    if (macros.kcal == null) throw new Error(`no energy value for ${food.description}`)

    const { grams, from } = servingOf(entry, food)
    const label = entry.label || `1 ${from} (${grams} g)`

    rows.push({
      name: entry.name,
      note: entry.note,
      aka: entry.aka,
      servingSize: grams,
      servingLabel: label,
      per100: macros,
    })
    audit.push(`${entry.name.padEnd(24)} <- ${food.description}  [${food.fdcId}]`)
  } catch (err) {
    problems.push(`${entry.name}: ${err.message}`)
  }
}

if (problems.length) {
  console.error(`\n${problems.length} unresolved:\n`)
  for (const p of problems) console.error('  ' + p)
  console.error('\nNothing written. Pin an fdcId or fix the query.\n')
  process.exit(1)
}

/* Sorted by name so the diff of a regeneration is readable, and so two runs on
   the same manifest can never differ by ordering alone. */
rows.sort((a, b) => a.name.localeCompare(b.name) || (a.note || '').localeCompare(b.note || ''))

const lit = (r) => {
  const parts = [`name: ${JSON.stringify(r.name)}`]
  if (r.note) parts.push(`note: ${JSON.stringify(r.note)}`)
  if (r.aka) parts.push(`aka: ${JSON.stringify(r.aka)}`)
  parts.push(`servingSize: ${r.servingSize}`)
  parts.push(`servingLabel: ${JSON.stringify(r.servingLabel)}`)
  const p = r.per100
  parts.push(
    `per100: { kcal: ${p.kcal}, protein: ${p.protein}, fat: ${p.fat}, carbs: ${p.carbs}, sodium: ${p.sodium} }`
  )
  return `  { ${parts.join(', ')} },`
}

const header = `/**
 * Common whole foods, as a static table.
 *
 * GENERATED FILE — do not edit by hand. Regenerate with:
 *
 *   node scripts/build-staples.mjs --data <sr-legacy.json>
 *
 * Source: USDA FoodData Central, SR Legacy. A work of the US federal
 * government, public domain, no API key and no account — which matters here,
 * because a key would be the first credential this app has ever needed and it
 * is built around not having one.
 *
 * Every macro below is copied from that dataset, per 100 g of edible portion.
 * The name, the note, the synonyms and the portion are editorial and live in
 * scripts/staples-manifest.mjs; the reasoning for each is there.
 *
 * ---
 *
 * The gap this fills: Open Food Facts is a database of BARCODED PACKAGED
 * PRODUCTS. Searching it for \`egg\` returns twenty-one thousand things that
 * CONTAIN egg — mayonnaise, madeleines, cheddar röstis — because its text search
 * reads ingredient lists, and its best honest answer is still a branded box of
 * eggs rather than an egg. No change to the query fixes that; the data is not
 * in there. So the basics live here instead.
 *
 * \`note\` is kept separate from \`name\` so the naming convention is one line in
 * \`stapleName\` rather than ${rows.length} edits here. \`aka\` is searched and never
 * shown: the word someone types is often not the word on the row — cheese has
 * to find Cheddar, and the same table serves shrimp and prawns, yogurt and
 * yoghurt, whole wheat and wholemeal.
 *
 * \`sodium\` is null where the dataset has no value for it. Null is honest; a
 * zero would be a claim.
 */

/** @typedef {{name: string, note?: string, aka?: string, servingSize: number, servingLabel: string, per100: {kcal: number, protein: number, fat: number, carbs: number, sodium: number|null}}} Staple */

export const STAPLES = [
`

writeFileSync(OUT, header + rows.map(lit).join('\n') + '\n]\n')

console.log(`\n${rows.length} staples written to src/lib/staplesData.js\n`)
console.log('Resolved as:\n')
for (const line of audit.sort()) console.log('  ' + line)
console.log('')
