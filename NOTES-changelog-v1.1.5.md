# Material for the next visual changelog entries

Four changes are in the tree and not in `CHANGELOG-visual.md`. This file is the
*what* — measured, checked against the code as it stands today, so nothing has
to be reconstructed from memory. The *why* line under each one is the part the
changelog exists for, and it is blank on purpose.

Where a commit already says something close to the reason, it is quoted at the
bottom of the section as **raw material** — words to argue with, not words to
paste. They were written to explain a diff; the changelog is explaining a
decision, and those are not the same sentence.

Delete this file once the entries are written.

## Numbering

Two ways to cut it:

- **One `v1.1.5`**, four sections. Reads as a single system pass, which is what
  it was — the font forced the title size, and the title size is why `fitText`
  exists.
- **`v1.1.5` and `v1.1.6`.** Sections 1–3 shipped in `8ac37eb`, the tab pill in
  `1af03b2` a few hours later. Matches the commits, and the pill is a motion
  change sitting in among type and surface changes.

Worth knowing either way: v1.1.4's entry is already in the file, but that work
actually landed *inside* `8ac37eb` rather than on its own.

---

## 1 · Inter replaces Inclusive Sans

**What moved**

- Self-hosted, two subsets — `inter-latin.woff2` and `inter-latin-ext.woff2` —
  variable 100–900, `font-display: swap`.
- **134 KB against 46 KB.** That is the whole cost, paid once, on a first load
  that already has to work offline afterwards.
- latin-ext is carried deliberately: Open Food Facts returns French and German
  product names, and without it they drop to the fallback face mid-list.
- **Real tabular figures.** `.tnum` is now just
  `font-variant-numeric: tabular-nums lining-nums`. The hand-set `0.66em` box
  per digit is gone — that was a widest-glyph approximation standing in for an
  advance the font never had.
- The per-digit spans stay, for an unrelated reason: `countTo` writes through
  them every frame rather than reflowing a text node mid-count. (`setTabularText`
  in `dom.js` said otherwise until just now; its comment is corrected.)
- **Knock-on:** Inter sets ~8% wider, which is what set section 3 in motion.

**The reason — yours.** The question a reviewer asks here is why a personal,
offline-first app spends 3× the bytes on a typeface. The answer is somewhere in
what the app *is* — mostly numbers, counting up or sitting in columns — and in
what the old face made you build to fake it.

**Also worth a line:** what did *not* change. The type scale was measured off
the mockups in v1.1.2 and did not move for the new face, except the title.

> Raw material, from `8ac37eb`: "Inter replaces Inclusive Sans. It costs 134 KB
> against 46, and buys real tabular figures — the hand-rolled fixed-advance
> digit hack is gone."

---

## 2 · Strokes come off buttons and fields

**What moved**

- `border: 0` across buttons, fields, cards and list rows.
- **Three strokes kept, each carrying information rather than decoration:**
  - `.chip-sm` — a transparent pill has no fill to be read from, so the edge is
    the control.
  - Every selected state — segments, the tab pill — where the edge *is* the
    selection.
  - The sheet's `border-top`. Measured against the scrim: **2.41:1 in light**,
    which the fill carries alone, but **1.05:1 in dark**, where the top edge
    would simply disappear. This is a surface meeting a dimmed one, not a card
    on a page.
- The bars keep both strokes — track and fill. Untouched, and the reasoning for
  them is already in v1.1.0.
- **Known consequence**, already listed in `NOTES-changelog-2026-08-02.md`: a
  segmented control placed directly on a page background would now be
  invisible. Every current one sits on a card.

**The reason — yours.** This is the "strokes or fills, not both" call from
Phase 4 of the design notes, so the entry is where that rule gets stated in the
app's own voice. The notes already name the symptom — *a dozen visible
hairlines, so nothing recedes* — the entry needs why fills won rather than
strokes, and how the three survivors are consistent with that rather than
exceptions to it.

> Raw material, from `8ac37eb`: "Two are kept and both carry information: the
> transparent pill, which has no fill to be read from, and every selected
> state, where the edge is the selection."

---

## 3 · Titles drop to 26px, and shrink themselves

**What moved**

- `--text-title`: **30px → 26px.** 30 was drawn for a narrower face.
- `fitText(el, { min: 22 })` steps down from the token size in 0.5px until
  `scrollWidth` fits. Common case exits on the first pass.
- `truncate` stays underneath it as the backstop — better a clipped title than
  one at 14px.
- Re-runs after `document.fonts.ready`: measuring before the webfont lands
  measures the fallback, and sizes the header against a font nobody sees.
- **The one line it exists for:** the day header, which has **227px** between
  two chevrons and holds everything from "Today, Aug 2" to "Wed, Jan 13, 2027".
  At title size those differ by **75px**.
- **Not wired to viewport resize.** Screens rebuild their header on navigation;
  a rotation without a navigation is the case this misses. Already listed under
  "Not done, on purpose".

**The reason — yours.** Two decisions stacked, and they are separable: why 26
became the token, and why the long strings shrink rather than truncate. The
second one is the interesting half — truncation is the default everywhere, and
this rejects it for one line in the app.

> Raw material, from `8ac37eb`: "Screen titles drop to 26px: 30 was drawn for a
> narrower face, and every everyday day-header string was over the 227px the
> header has."

---

## 4 · The tab selection slides

**What moved**

- One `.tab-pill` in the bar, absolutely positioned, `width: calc((100% - 8px) / 3)`,
  moved by `translateX` in multiples of 100% of its own width — which lands
  exactly on each tab because all three are `flex-1` against the same track.
- It replaces a background and an ink edge switched on and off per tab.
- **300ms, `cubic-bezier(0.16, 1, 0.3, 1)`** — the same curve as the calorie bar
  and the rings, so it belongs to the motion already in the app.
- The first placement does not animate: `syncTabs` suppresses the transition,
  forces a reflow, then restores it, so opening straight onto Settings finds the
  pill there rather than watching it cross the bar.
- `prefers-reduced-motion` zeroes it via the global rule — the pill snaps.
- The pill is `aria-hidden`; `aria-current` on each tab still announces the
  selection.
- **Three tabs is baked into the divisor and the JS together.** A fourth would
  have to change both.

**The reason — yours.** Phase 6 of the design notes says animations originate
from the thing that was touched, and this one does something more specific than
that: the direction of travel says where you came from. That is the sentence
worth owning, and it is the first motion in the app that carries information
rather than smoothing a change.

> Raw material, from `1af03b2`: "Two things happening reads as two things; one
> element travelling reads as the selection having moved, and the direction it
> travels says where you came from."
