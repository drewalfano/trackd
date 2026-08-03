# What changed — 2026-08-02

Everything below is built, verified in the running app, and passing 90 tests.
Plain-English list; the reasoning lives in the linked notes.

---

## 1 · Targets now come from somewhere

Every ring and bar in the app was drawn against four numbers with no origin.

- **Onboarding data model.** Body stats, activity, goal → calorie and macro
  targets, using the standard Mifflin-St Jeor equation.
- **Guardrails are code, not copy.** The calculator will not go below 1200 cal
  (women) or 1500 (men), the fastest loss rate offered is 0.5 kg/week, and a
  rate typed higher is capped on the way in. A target you type yourself is
  always accepted — but the app will not do the arithmetic that lands you there.
- **Protein is grams per kilo, not a percentage**, so it holds its size as
  calories come down. Carbs absorb the difference.
- **Stub settings form** to enter it all. The UI can come later.
- **Every day now stores the target it was logged against**, so changing a goal
  in August does not rewrite how March went.
- **Age is stored as a birth year**, so it cannot go quietly stale.

## 2 · History stops showing a misleading average

- Under **4 tracked days of 7**, no average is shown at all — just the count and
  why. A mean of one day was reading as a 1600-calorie deficit at a glance.
- The seven-day window now **always shows seven rows**. It used to collapse to a
  single row on your first day, leaving the screen mostly empty.
- **Macro bars are labelled P / F / C.** Colour alone was never a label.
- **Untracked days have a chevron** and open the add sheet for that day.

## 3 · The plate

Assemble several foods, then log them in one go.

- A four-item dinner was **8 taps and 4 trips** through the add sheet. It is now
  **6 taps and one**.
- A running total shows what the meal does to your day **before** you commit it.
- **You can now build a saved meal without logging it first.** Previously the
  only way to create one was to log the items and save the block afterwards.
- The plate survives the sheet closing, keeps the day it was started on, and
  commits with a single undo for the whole thing.

**One trade worth knowing:** the pencil on a Favourites row is now `+` (add to
plate). Adjusting a single food's amount moved to long-press, or to the plate
itself. This is flagged in the friction log as the first thing to revisit.

## 4 · Quick add

Log calories and macros with **no food record** — for the restaurant meal you
will never eat again. Nothing is saved to your library, so one-offs stop
crowding out your staples in Recents and search.

## 5 · Fixes

- **The food library search was unusable on a phone** — the keyboard closed after
  every single character. This was the most serious thing found.
- **The pencil on a saved meal logged it instead of opening it.** The careful
  looking control was doing the irreversible thing.
- **You can now record a weigh-in for any day**, not just today — and edit or
  delete any past reading. Previously a missed morning was a permanent hole in
  the trend.
- **The Today tab now goes to today.** Tapping a History row left you stranded on
  a past day.
- **Logging to a day that isn't today now says so**, in the sheet title and on
  the serving sheet.
- The Duplicate sheet was **off the type and spacing scale** — the only screen
  that looked subtly wrong.
- "Scan" was **styled as if selected** when nothing was.
- History **no longer scans the whole database** on every visit.

## 6 · Look and feel

- **Inter throughout**, self-hosted so the app still works offline. It has real
  tabular figures, so the hand-rolled digit-alignment hack came out.
- **Strokes removed from buttons and fields.** Two kept on purpose: outlined pill
  buttons, and selected states where the edge *is* the selection.
- The **add sheet's route buttons** match the Figma spec — 24px radius, 89 tall.
- **Screen titles shrink themselves** rather than truncating. Inter runs ~8%
  wider, and the day header has only 227px between two chevrons.

---

## Not done, on purpose

- **Onboarding UI.** The data model and a stub form exist; the polished flow does
  not. That was the agreed order.
- **The sitemap is out of date** — it does not mention the plate, quick add, the
  weigh-in sheet, or the edit-entry sheet that already existed.
- **History still compares the weekly average to your *current* target**, even
  though per-day targets are now stored.
- **`fitText` does not re-run on rotation** without a navigation.
- **A segmented control placed directly on a page background would be invisible**
  now that strokes are off. Every current one sits on a card.

---

## Where the detail lives

| Document | What it holds |
| --- | --- |
| [NOTES-plate-spec.md](NOTES-plate-spec.md) | The plate: why, the tap counts, the design crux and its cost |
| [NOTES-audit.md](NOTES-audit.md) | All 9 audit findings, severity, and what each fix was |
| [NOTES-friction.md](NOTES-friction.md) | Two things to watch in real use, added at the bottom of the inbox |
