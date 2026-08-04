# Food search: finding common foods

Drafted 2026-08-04, in response to: searching `Egg` returns eight mayonnaises.

The requirement is one sentence, and it is Drew's: **you should be able to search
for a common food and get it, without having to author it yourself.** The
positioning argument for why that matters belongs in Drew's half of the record;
what follows is the how.

---

## 1. What actually happens now

Reproduced against the live API, not inferred from the code.

`searchProducts` calls the legacy `cgi/search.pl` with `search_simple=1`
([off.js:192](src/lib/off.js#L192)). That endpoint full-text matches across all
product text **including ingredient lists**, so `egg` matches every product that
contains egg. It returns:

```
count: 21900
 - Mayonnaise Classique à l'huile de colza | Lesieur
 - Queso blanco pasteurizado              | Hacendado
 - Mayonnaise de Dijon                     | Amora
 - Mayonnaise American Style               | Heinz
 - Petites Madeleines                      | St Michel
```

Byte-identical to what the app renders. **The app is not the bug.**

Three separate facts, established by testing:

1. **Ranking cannot be fixed on that endpoint.** `sort_by=unique_scans_n`
   returns identical results — the parameter is ignored alongside
   `search_simple=1`.
2. **OFF's modern search does return eggs.**
   `search.openfoodfacts.org/search?q=egg` gives `Large Eggs — The Happy Egg
   Co`, `12 large eggs — birdbros`, and so on, top of list.
3. **It returns no nutrition.** `nutriments` is absent even when requested by
   name, and `searchProducts` drops anything without nutrition. The batch join
   (`/api/v2/search?code=a,b,c`) answered **503** in testing, which matches the
   existing note at [off.js:186](src/lib/off.js#L186). The reliable join is one
   `/api/v2/product/{code}.json` per result — verified working, returning
   131 kcal and 12.6 g protein per 100 g for eggs.

**And the part no endpoint fixes.** Open Food Facts is a database of *barcoded
packaged products*. Even its good answers are branded boxes — `Large Eggs — The
Happy Egg Co` — not `Egg, whole, raw`. Basic whole foods are structurally
underserved by it. This is presumably already known here, since the app's own
sample data hand-authors `Grilled Chicken Breast` rather than pulling it.

So the requirement cannot be met by fixing the OFF call. It needs a second
source.

---

## 2. Change A — a bundled table of staples

The primary change. Everything else is secondary to it.

### 2.1 Source

USDA FoodData Central, **Foundation Foods** and **SR Legacy**. Works of the US
federal government, public domain, bulk-downloadable, no API key and no account
— which matters, because a key would be the first credential this app has ever
needed and it is built around not having one.

Attribution is not required. Include it anyway, in Settings, next to the
existing Open Food Facts credit.

### 2.2 Scope

**200–400 foods, curated. Not the full 8,000-row SR Legacy.**

Selection rule: a food someone would search for **by a bare noun**. Egg, banana,
chicken breast, white rice, rolled oats, whole milk, olive oil, almonds, cheddar,
black beans. If the honest search for it includes a brand, it is Open Food Facts'
job and does not belong here.

The rule matters more than the number. A table that grows past what the rule
admits stops being staples and becomes a second, worse product database.

### 2.3 Shape

Same as a `food` record minus the `id`, so it can go through the adoption path
that already exists for Open Food Facts drafts:

```js
{
  name: 'Egg',
  servingSize: 50,
  servingUnit: 'g',
  servingLabel: '1 large egg (50 g)',
  per100: { kcal: 143, protein: 12.6, fat: 9.5, carbs: 0.7, sodium: 142 },
  source: 'staple',
}
```

`source: 'staple'` sits alongside the existing `sample`, `custom` and `off`.

### 2.4 The serving is the work, not the macros

Macros are a column lookup. **The default serving is the whole point and it is
hand-work.** USDA gives per-100 g plus portion weights; the table needs the
portion a person actually means:

| Food | Default serving |
| --- | --- |
| Egg | 1 large egg (50 g) |
| Banana | 1 medium (118 g) |
| Chicken breast | 1 breast (174 g) |
| Olive oil | 1 tbsp (13.5 g) |
| Rolled oats | 40 g |

Without this, every staple defaults to 100 g and the user does arithmetic at the
moment they were trying to avoid it — which would make the feature technically
present and practically useless. Budget the effort here.

### 2.5 Delivery

A JSON module, **lazy-imported on first search**, like the zxing chunk in
[scan.js:228](src/sheets/scan.js#L228). Rough order: 400 records at ~120 bytes is
50 KB raw, well under that gzipped. It must not land in the initial bundle — the
app opens on Today, which never searches.

### 2.6 Staples are NOT seeded into the foods store

They stay a static table and are searched from it. Seeding 400 records would:

- flood the Food library screen with foods nobody chose
- put 400 candidates into `quickAddFoods` and `recentFoods`
- make an export of "your foods" meaningless

A staple becomes a real `food` record **only when it is first used**, by the same
adoption `adoptDraft` already performs for an Open Food Facts product
([off.js:239](src/lib/off.js#L239)). One more caller, no new lifecycle.

### 2.7 Search order and dedupe

**Your library → staples → Open Food Facts.**

Your own foods first because they are the likely hit and cost no network.
Staples above OFF because for a bare noun the generic answer beats the branded
one — which is the entire complaint being fixed.

Once a staple has been adopted, the library hit wins and the staple is
suppressed, by the same `identityKey` rule that already stops a scanned and a
hand-typed yoghurt from spending two slots in the rail
([db.js:438](src/lib/db.js#L438)).

Rows render as local rows — `+` logs, body opens the Add screen — because after
adoption that is exactly what they are.

---

## 3. Change B — the search endpoint

Secondary, and **cheaper to justify after A than before it.** With staples in
place, `egg` is answered locally and instantly, and Open Food Facts goes back to
what it is good at: a specific branded packet, usually reached by scanning.

If it is done:

- Swap `cgi/search.pl` for `search.openfoodfacts.org/search?q=`.
- Join nutrition with one `/api/v2/product/{code}.json` per result. The batch
  form 503s; per-code lookup is the path `fetchByBarcode` already uses reliably.
- **Cap the join.** 25 results is 25 requests against a free service that rate
  limits search, fired off a debounced keystroke. Join the top 8, render the
  rest without macros or drop them — a decision, not an implementation detail.
- Cache by barcode for the session, so retyping a query costs nothing.
- `brands` arrives as an **array** there, where `normalizeProduct` expects a
  comma-separated string ([off.js:155](src/lib/off.js#L155)).

**The honest risk:** this trades a bad-ranking problem for a request-volume
problem, on a service the app does not pay for and cannot lean on. That is why it
is B and not A.

---

## 4. Change C — `Create it` is hidden when it is most needed

The smallest change here and the most obviously wrong thing.

`Create it` renders only when the library found nothing **and** Open Food Facts
found nothing ([addFood.js:614](src/sheets/addFood.js#L614)). Search `egg` today
and OFF returns 25 results, so the escape hatch never appears — you are left
scrolling mayonnaise with no way forward. It is available precisely when the
search was quiet and hidden precisely when it was noisy and wrong.

- Show it whenever **the library** found nothing, whatever the remote count.
- Put it at the **top** of the results, not the tail. Below 25 wrong answers is
  the same as absent.

This one is worth doing regardless of A and B, and does not depend on either.

---

## 5. Acceptance criteria

- [ ] Searching `egg`, `banana`, `chicken breast`, `rice`, `milk` each return a
      generic food in the first three results
- [ ] Staples rank below your own library and above Open Food Facts
- [ ] A staple already adopted appears once, as the library food, never twice
- [ ] Every staple has a default serving that is a real portion, not 100 g
- [ ] The staples table is not in the initial bundle
- [ ] The foods store contains no staple that has never been used
- [ ] A staple logs through `logFood`, so recency and `computed` behave normally
- [ ] Staple rows carry `+` and open the Add screen, like any library row
- [ ] `Create it` appears whenever the library has no match, at the top of results
- [ ] Search still works offline for library and staples
- [ ] USDA credited in Settings beside Open Food Facts

---

## 6. Decisions needed before building

1. **Naming convention.** `Egg`, `Egg, whole, raw` (USDA's own), or
   `Egg (large)`? USDA names are precise and read like a database; bare nouns
   read like an app and collide more. This sets the tone of every search result
   and should be looked at rendered, not chosen on paper.
2. **The list itself.** I can propose 200–400 with servings for review, but the
   selection is a product judgement about what this app is for.
3. **Whether B is worth its request cost**, given A removes most of its urgency.
