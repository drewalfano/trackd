# Audit — small gaps

Written 2026-08-02, from a read of every screen, sheet and lib, with the live
app open.

**Progress: all findings closed**, each verified in the running app.
A8 was closed as *keep, documented* rather than changed — the measurement is in
its entry. The plate shipped too; see [NOTES-plate-spec.md](NOTES-plate-spec.md).

Same spirit as the plate: things a person would hit and not be able to name.
Split by whether they are new, or already written down somewhere and still open.

Severity is about **what it costs the user**, not how hard it is to fix.

---

## New findings

### A1 · The food library search loses focus on every keystroke — high · **fixed**

[foods.js:66](src/screens/foods.js#L66) calls `rerender()` from `oninput`, and
`rerender` is `mount(el, content)` ([screen.js:23](src/lib/screen.js#L23)) — it
clears and rebuilds the whole subtree, input included.

Verified in the browser: focus the field, type one character, and
`document.activeElement` is `BODY`. The text survives (the new input is built
with `value: view.query`) but the caret does not. **On a phone the keyboard
dismisses after every character**, which makes the field unusable for anything
longer than one letter.

This is an inconsistency rather than a decision: the Open Food Facts search sheet
does the same job correctly two files away — it debounces, keeps the input node,
and repaints only the results ([search.js:75](src/sheets/search.js#L75)). It even
aborts the in-flight request.

**Fix:** mirror `search.js`. Hold the input, repaint only the list.

`#speed` `#discoverability`

### A2 · The pencil on a pinned meal logs it instead of opening it — medium · **fixed**

[addFood.js:135](src/sheets/addFood.js#L135). For a favourited meal, `onLog` and
`onOpen` are the same call:

```js
onLog:  () => logAndClose(() => logMeal(meal, …), meal.name),
onOpen: () => logAndClose(() => logMeal(meal, …), meal.name),
```

Everywhere else the pencil means "adjust before logging". Here it silently logs
every item in the meal. Reaching for the safer-looking control gets you the
irreversible action — the one direction a mistake should never go.

**Fix:** falls out of the plate work — the pencil opens the meal into the plate,
where it can be adjusted. Without the plate, the minimum is a panel listing the
items with a block and day selector.

`#accuracy`

### A3 · The Duplicate sheet is off the design system — low · **fixed**

[entryActions.js:94–111](src/lib/entryActions.js#L94) uses `gap-5`, `pb-2`,
`px-4 py-3`, `mt-0.5` and `text-[15px]` while every other surface uses
`gap-[20px]`, `px-[20px]` and the 48/30/16/14/12 scale. `text-[15px]` is not in
the scale at all.

It is the only sheet that looks slightly wrong, and nobody would be able to say
why — which is exactly the kind of thing the `#looks` tag was added for.

`#looks`

### A4 · No way to record a weigh-in for any day but today — medium · **fixed**

[weight.js](src/screens/weight.js) computes `const today = todayStr()` and the
input writes there. Miss a morning and there is no way to enter it later; the
trend has a hole that cannot be filled.

The trend refuses to draw under seven readings, so on a tab whose whole job is a
smoothed line, losing readings costs more than it looks. The sitemap already
notes Weight has no children ([NOTES-sitemap.md:32](NOTES-sitemap.md#L32)) — this
is the concrete one.

`#data`

### A5 · No quick-add for calories and macros — medium · **fixed**

Every logged thing has to become a food in the library first. For a restaurant
meal eaten once, that is a custom-food form for a record that will never be
reused — and it quietly fills the library with one-offs, which then rank in
Recents and search.

Related to the plate but a separate decision. See the plate spec's *Out of scope*.

`#speed` `#data`

### A6 · Add-mode serving sheet has no day control — low · **fixed**

[serving.js:228](src/sheets/serving.js#L228) shows the day selector only in edit
mode. Opening the add sheet inherits the browsed date correctly, but "Log this"
from a food detail page passes `state.date` — which, because History mutates that
shared date, may be a day you were only looking at. You would not find out until
Today showed no change.

Ties into the History/Today date-mutation bug already on the build list.

`#accuracy`

### A7 · "Scan" is permanently styled as selected — low · **fixed**

`actionButton({ … selected: true })` in [addFood.js](src/sheets/addFood.js) is
hardcoded. It is emphasis, not state — nothing is selected — and there is no
`aria-pressed`, so a screen reader hears an ordinary button while the eye sees a
chosen one. Either make it a real default with the attribute to match, or style
it as emphasis rather than selection.

`#looks`

### A8 · One container stroke survived the fills pass — low · **kept, documented**

[sheet.js:95](src/lib/sheet.js#L95) still carries `border-t border-outline` after
this session's move to fills. It may well be earning it — the sheet meets a dark
scrim there, which is not the same problem as a card on a page. Worth an explicit
call rather than leaving it as the one thing the rule missed.

`#looks`

### A9 · `loggedDates()` walks every entry on every History visit — low · **fixed**

[db.js:268](src/lib/db.js#L268) opens a key cursor across the whole `date` index
to collect distinct dates, and `entriesInRange` then re-reads the same range. Two
full passes per visit. Irrelevant at current volume, real after a year of daily
logging on an old phone.

`#speed`

---

## Already documented, still open

Listed so the audit does not read as if these were missed. All are Drew's own.

| # | Finding | Where |
| --- | --- | --- |
| B1 | An empty day has no route to Log, and therefore none to History — the first-run state | [NOTES-sitemap.md:141](NOTES-sitemap.md#L141) |
| B2 | History is three taps deep and arguably the most valuable screen | [NOTES-sitemap.md:148](NOTES-sitemap.md#L148) |
| B3 | No settings entry point from the screens the settings govern | [NOTES-sitemap.md:159](NOTES-sitemap.md#L159) |
| B4 | Macro bars on History are unlabelled — colour only | brief 2.3 · **fixed** |
| B5 | Untracked History rows have no chevron and do not read as tappable | brief 2.2 · **fixed** |
| B6 | History's 7-day window collapses to one row at one day tracked | brief 2.4 · **fixed** |
| B7 | History rows mutate the date shared with Today | **fixed** — see below |
| B8 | Edit-logged-entry sheet exists but is missing from the sitemap | still a docs fix |

**On B7.** The shared date is deliberate and stayed — stepping back on Today and
opening Log should keep your place. What was wrong is that the tab labelled
*Today* did not go to today, so a row tapped in History stranded you in the past
with only the forward chevron to walk back one day at a time. Tapping the tab is
the "go home" gesture rather than part of that pairing, so it now resets the day.

---

## Shipped this session, worth a second look

Not findings — flagged when they were made, and still true.

- **History's weekly mean is compared against the *current* target** while
  per-day targets now exist in `dayTargets`. Once a target changes, that line
  mixes eras. Belongs with the History polish item.
- **`segmentedWide` on the page ground is now invisible** — its track is canvas
  on canvas since the strokes came off. Every current instance sits on a card, so
  nothing is broken today, but the next one placed directly on a page will be.
- **`fitText` is not wired to viewport resize.** A rotation without a navigation
  will not re-fit the day header.

---

## Suggested order

Grouped by what they cost, not by effort.

1. **A1** — the only one that makes a screen unusable on the target device.
2. **A2** — the only one where the cautious control does the destructive thing.
3. **A4**, **A6** — silent data loss and silent wrong-day writes.
4. **B4, B5, B6** — already scheduled as item 3 in the build order.
5. **A5** — needs a design decision, not just a fix.
6. **A3, A7, A8** — polish, cheap, do them in one pass.
7. **A9** — revisit when there is a year of data to test against.
