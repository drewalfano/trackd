# Plate — spec

Status: **built 2026-08-02**, to the recommendation below. Verified end to end:
a four-item plate assembled, an amount adjusted inside it, saved as a meal
without logging (entry count unchanged), then committed to a chosen block with a
single undo.

**The one thing to watch.** The recommendation traded the visible pencil for a
long-press. If adjusting a single food at a non-default amount turns out to be
common, that is the first thing to revisit — see *The cost, stated plainly*.

A staging area in the add sheet. Assemble several foods, see what they do to the
day, then log them in one commit — instead of committing on every tap.

---

## Why

Two gaps, and they are not the same gap.

**1. The add sheet commits on every tap.** `logAndClose`
([addFood.js:84](src/sheets/addFood.js#L84)) writes the entry *and closes the
sheet*. A four-item dinner is: tap `+`, tap row, sheet closes, tap `+`, tap row,
sheet closes — four times.

| Task | Now | With a plate |
| --- | --- | --- |
| Log one food | 2 taps, 1 sheet | 2 taps, 1 sheet |
| Log a 4-item dinner | **8 taps, 4 sheets** | **6 taps, 1 sheet** |
| Build a saved meal from scratch | not possible without logging it first | 6 taps + a name |

The single-food case — the common one — does not get worse. That is the
constraint the design has to hold.

**2. Saved meals can only be born retrospectively.** The only way to create one
is to log the items, let them land in a block, then "Save as meal"
([log.js:99](src/screens/log.js#L99)). To build a template for a meal you are
not eating right now, you have to log it, save it, then delete four entries.

This was predicted on day 0:

> Saved meals can only be created from a Log day view block. If meals get built
> by hand more often than by saving a day, that path is missing.
> — [NOTES-friction.md:91](NOTES-friction.md#L91)

**3. A third thing, free.** A plate with a running total shows what dinner does
to the day *before* it is committed. Today you find out afterwards. This is also
the only sensible home for the "what fits" idea in
[NOTES-sitemap.md:198](NOTES-sitemap.md#L198) — given what is left, which
favourites still fit.

## What a plate is not

A **plate is a cart**: ephemeral, one-time, discarded on commit.
A **saved meal is a template**: named, reusable, persistent.

They look alike and they are not. MacroFactor ships both. Collapsing them is the
main way this goes wrong — every plate becoming a saved meal would turn
Favourites into a junk drawer within a fortnight. A plate becomes a meal only
when explicitly asked.

---

## Data model

A plate is a draft, not a record. It never enters an export — a backup of
something you have not logged yet is noise.

```js
{
  items: [{ foodId, quantity, unit }],   // ordered, same shape as meal.items
  date,                                  // captured when the plate is started
  block,                                 // ditto, editable before committing
  startedAt,
}
```

**Storage.** Key `'plate'` in the existing `settings` object store. That store is
a plain keyval (`createObjectStore('settings')`, no keyPath), so this needs no DB
version bump, and `getSettings`/`exportAll` only ever read the `'settings'` key —
so the plate stays out of both by construction.

**Why persist at all.** A plate lives across a sheet close. The phone locks
mid-assembly, a notification steals focus, you navigate to Today to check what is
left — none of those should throw away four taps of work.

**Why `items` matches `meal.items`.** `saveDraftAsMeal(name, items)` is then
`putMeal({ name, items })` with no translation, and `logMeal` and `logPlate` can
share their walk over the list.

---

## Interaction

### The crux: what does tapping a favourite do?

**It logs, immediately, exactly as it does now.** The one-tap path is what the
app is built around — [db.js:20](src/lib/db.js#L20) and the favourites sheet both
go out of their way to protect the muscle memory, and a tap that means different
things depending on whether a plate is open is the one change that could make the
common case worse in order to improve the rarer one.

So the plate needs its own affordance on the row, and `pickRow` already has two
targets (row logs, pencil adjusts). Three controls in a 375px row is not
available.

### Recommendation: the `+` replaces the pencil

- **Tap the row** — logs now, at the default serving. Unchanged.
- **Tap `+`** — adds to the plate at the default serving. New.
- **Adjust servings inside the plate**, not before adding.
- **Long-press the row** — opens the serving sheet directly, for the
  single-food-with-a-custom-amount case. `longPress` already exists in
  [dom.js](src/lib/dom.js) and `entryRow` already uses it.

Adjusting inside the plate is better than adjusting before adding: you tune the
whole meal against one running total instead of guessing food by food.

**The cost, stated plainly.** This trades a visible affordance (the pencil) for a
hidden one (long-press). Logging a single food at a non-default amount goes from
2 taps to 4 (or to a long-press nobody has been told about). Day 0 already
flagged the row/pencil pair as the thing most likely to annoy first
([NOTES-friction.md:73](NOTES-friction.md#L73)) — this replaces that question
with a different one rather than answering it.

**The alternative** is keeping all three controls and letting the title truncate
harder. Worth prototyping both before committing; this is a thumb question, not a
reasoning question.

### The plate bar

Pinned above the add sheet's footer, visible whenever the plate is non-empty:

```
┌──────────────────────────────────────────┐
│  4 items · 812 cal                       │
│  38 P · 22 F · 74 C          [ Log 4 ]   │
└──────────────────────────────────────────┘
```

- Tapping the bar (not the button) opens the plate panel.
- `Log 4` commits without needing to open the panel — the fast path.
- The bar is the whole discoverability story for the feature. If it is not
  obvious that `+` fills the bar, nothing else about this works.

### The plate panel

Pushed like Scan/Search/Custom, so back-button handling is free:

- Each item: name, amount, macros. Tap to adjust, swipe to remove — the same
  gestures `entryRow` already uses, so nothing new to learn.
- **Day and block selectors.** The one place choosing a block for a whole meal
  makes sense, rather than per food.
- Primary: `Log 4 items`.
- Secondary: `Save as meal` — the prospective creation path. Names it, saves it,
  and offers to pin it, matching `promptSaveAsMeal`.
- Tertiary: `Clear plate`, with a confirm.

---

## Committing

`logPlate(plate)`:

1. Walk `items`, `logFood` each — reuses the existing path, so `touchFood`,
   `computed` snapshots and the `dayTargets` stamp all happen for free.
2. Skip any food deleted from the library mid-assembly, exactly as
   [logging.js:52](src/lib/logging.js#L52) already does for meals.
3. Clear the plate.
4. One toast: `Added 4 items`, with an Undo that deletes all four.

The undo has to remove the whole plate, not the last item. Four separate undo
toasts for one action is worse than none.

---

## Edge cases

| Case | Behaviour |
| --- | --- |
| Plate open, app reopened next day | Plate keeps the date it was started on; the panel shows it, so logging yesterday's dinner is deliberate rather than accidental |
| Food deleted mid-assembly | Dropped on commit with a note, same as `logMeal` |
| A saved meal added to a plate | Expands into its items, so they can be adjusted individually |
| Plate abandoned for days | Show its age in the panel. Do not auto-clear — silently binning someone's work is worse than a stale bar |
| Quick log while a plate is open | Still logs immediately. The plate is unaffected |

---

## Out of scope, but adjacent

**Quick Add.** MacroFactor lets you add bare calories and macros to a plate with
no food record at all — for the restaurant meal you will never eat again. This
app requires creating a food for everything, which is a lot of ceremony for
something used once. Related, genuinely useful, and a separate decision.

---

## Before building

The tap-count table at [NOTES-friction.md:118](NOTES-friction.md#L118) has no row
for a multi-item meal. That is the row this feature lives or dies on, and filling
it in for the current app takes two minutes with a stopwatch. Add:

| Task | Taps | Seconds |
| --- | --- | --- |
| Log a 4-item dinner from favourites | | |
| Build a saved meal from scratch | | |

And the inbox line to watch for: `[MISSING] assembling dinner, +1`. If it does
not recur across a week of real use, this is a feature wanted because another app
has it rather than because this one needs it — and the friction log's own rule is
that frequency outranks severity.

---

## Sources

- [How to Log Food in MacroFactor](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor)
- [Multi-Add Foods](https://help.macrofactorapp.com/en/articles/40-multi-add-foods)
- [Quick-Add Calories and Macros](https://help.macrofactorapp.com/en/articles/41-quick-add-calories-and-macros-to-your-food-log)
- [MacroFactor: the new food logger](https://macrofactor.com/new-food-logger/)
