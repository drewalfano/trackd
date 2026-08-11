# What depends on the rebuild

Read-only pass, 2026-08-11. Written before any of the node-identity work, and
the reason for writing it is narrow: the risk in that project is not the
diffing. It is that a number of behaviours in this app are designed **around**
the full-subtree rebuild rather than in spite of it, and none of them says so
out loud. Each one below is a thing that currently works, that a naive "keep the
nodes" change would quietly break, and that the refactor therefore has to
re-earn on purpose.

This is not a list of things to delete. Some of these are workarounds that
should go; some are load-bearing and must survive in another form. The column
that matters is which.

---

## The mechanism, stated once

`createScreen(build, { watch })` (`lib/screen.js`) rebuilds a screen's entire
subtree whenever a watched scope changes. `rerender` awaits `build()`, then
`mount(el, content)` — which is `clear` plus append. **After any data change, no
element on screen is the DOM node it was a moment ago.**

Three properties fall out of that, and things downstream rely on all three:

1. **No element survives, so nothing can transition.** Presence, order and shape
   cannot be animated at all. Anything expressible as *a number that can be
   re-animated from a remembered value* is recoverable, and that is what the
   memory maps below exist for. Nothing else is.
2. **A render can be thrown away.** `rerender` serialises, and a render marked
   stale by a request arriving mid-flight is **not painted at all** — deliberately,
   because mounting it and correcting it would put wrong numbers on screen for a
   frame. Any state written during `build()` is therefore written speculatively.
3. **The outgoing tree is still in the document while the new one is built.**
   `mount` does not run until `build()` resolves, so `build` can read what is
   currently painted. Two things do exactly that.

---

## 1. Value-continuity memory — six of them

| Memory | Where | Carries |
|---|---|---|
| `lastKcal` | today.js:186, ui.js:459 | the calorie hero's count-up origin |
| `lastKbarPct` | today.js:298 | the calorie bar's previous fill |
| `lastPct` | ui.js:355 | each `progressBar`'s previous fill, per key |
| `lastLen` | ring.js:179 | each ring arc's previous length, per key |
| `lastSegmentPill` | ui.js:742 | the outgoing pill's node, for a mid-flight handoff |
| `lastCalcKcal` | onboarding.js:527 | step five's previous calculated figure |

**These are the workaround, and they are what Phase 6 deletes.** Every one exists
because the element that should remember its own last value does not survive to
remember it. Once nodes persist, `countTo`'s own `dataset.value` and a plain CSS
transition do this with no module state at all.

Two of them have a subtlety worth carrying across rather than dropping:

- `lastKbarPct` is **live-card only**. A neighbour in the deck that wrote here
  would leave its own fill behind as the next card's starting point. Whatever
  replaces it needs the same rule — the deck holds three cards and only one of
  them is the subject.
- `lastSegmentPill` stores a **node**, not a number, and reads
  `translateXOf(outgoing)` to resume mid-flight. It also checks `isConnected`
  before trusting it. Under node identity the pill simply is not replaced and
  the whole handoff disappears — but if any intermediate state keeps the map, the
  `isConnected` guard is what stops it resuming from a node that was discarded.

## 2. `paintedDate()` and `dayChanged` — reads the outgoing DOM

`today.js:255`. `build()` calls `paintedDate()` **before** returning the new
tree, and it works only because `mount` has not run yet: it reads
`[data-today-log]`'s `dataset.todayLog` off the tree still on screen and compares
it to `state.date`. That answer drives `dayChanged`, which suppresses the count-up
and the ring animations on a day change and adds `.day-swap` to the log.

**Under node identity this reverses.** The node persists, so its dataset is
whatever the last render left there, and "what is painted" stops being a proxy
for "what the previous render was". The comparison has to move to explicit state
carried across renders instead. `was == null` on first paint is deliberate and
must stay deliberate: a first paint is not a day change and the card should fill
in normally.

## 3. `freshEntryIds` — reads the outgoing DOM, with a grace window

`today.js:259`, and the more delicate of the two. It answers "which of these rows
is new" by diffing the entries against the `[data-entry-id]`s currently painted,
and it carries an `arriving` map with `ARRIVAL_GRACE_MS` **because logging renders
Today twice**. The second render would otherwise find the row already on screen
and conclude it was not new, cancelling the animation the first render started.

`NOTES-motion-gaps.md` records that the obvious version — remember the newest
`createdAt` at module scope — was tried and was wrong twice: Undo restores an old
timestamp, and module-scoped memory is defeated by `createScreen` discarding
superseded renders (property 2 above).

**This one is load-bearing and the double-render is the real invariant.** Node
identity does not by itself fix it; a persistent row still needs to know whether
it is new, and the write path still renders twice. Do not assume this problem
disappears — check whether the double render is still there, and if it is,
whatever replaces this needs the same tolerance.

## 4. The deck commit lands where a fresh deck draws it

`dom.js:519` and `today.js:553`. `swipePages` fires `onCommit` on `transitionend`,
not on release, and the note is explicit about why: at that moment the track "is
already sitting exactly where a freshly built deck sits, so the swap has nothing
to animate and nothing to correct."

**This is the invariant most likely to break silently.** The absence of a
correction at that seam is the design. If the deck keeps its nodes, the rebuild
no longer redraws the track from scratch, so the thing the commit was aiming at
stops existing — the incoming card is already the live card and the track's
transform is now stale state that somebody has to reset. Get this wrong and the
symptom is a day change that jumps one page width, which will look like a
gesture bug rather than a rendering one.

`committing` and its `transitionend`/timeout pair are a separate concern and
should survive unchanged: the flag is cleared by the rebuild, so if the rebuild
changes shape, check that the flag still gets cleared on every path.

## 5. Ids that are unique *because* the tree is rebuilt

- `clipSeq` (ring.js:186) — clip paths are referenced by id, three rings per card
  and three cards in the deck, so a repeated id points nine elements at whichever
  definition rendered last.
- `rowSeq` (ui.js:580) — label/input association, "monotonic, since a rebuild
  makes new elements".

Both are monotonic counters that assume every render mints fresh elements. Under
node identity elements are reused, so a counter that keeps incrementing is
harmless but pointless — and any code that *derives* an id from the counter at
render time will hand a persistent element a new id on every patch, breaking
`aria-labelledby` and `clip-path` references that pointed at the old one. Ids
have to become stable per element rather than per render.

## 6. `modeSwap` — a flag that is safe only because rendering is synchronous

`today.js:125`, set around `setMode`'s repaint. The comment states the reason it
works: "Nothing schedules in between — `paint` builds its subtree synchronously —
so the flag is read by exactly the elements this switch created, and the next
repaint from any other cause finds it down."

That is a precise dependency on the build being synchronous and atomic. Any
patching scheme that defers work across frames, batches, or interleaves two
updates invalidates it, and the failure is a mode toggle whose suppression leaks
into an unrelated render.

`cardMode` and `modeSeeded` are ordinary preference state and are fine.

## 7. Scroll restoration

`screen.js:42–65`. `rerender` captures `window.scrollY` before `build()` and
restores it after `mount`, clamped to the last scrollable pixel — not to the
document height, which was a viewport too generous and let a swipe from a full
day to an empty one ask for an offset past the end of a document iOS was still
laying out.

Under node identity most renders will no longer change document height, so this
mostly stops firing — which is the win. It cannot simply be deleted, though: any
patch that adds or removes rows still changes height, and the clamp is the part
that was expensive to get right.

## 8. `watch` scopes are a filter, not an optimisation

`screen.js:8`. Several screens pass `watch: []` — `settingsPages.js:628` says
why: "so nothing in the database can rebuild this out from under a" (form being
typed into). Today watches `entries, settings, foods`; Trends watches
`weights, settings, entries`.

Under node identity the reflex will be to widen these, since a patch is cheap
where a rebuild was not. Resist it for the form screens specifically — the reason
those are narrow is correctness, not cost.

---

## What this means for the order of work

Trends first is the right call and this document is the evidence. Checked rather
than assumed: `trends.js` contains **zero** `document.querySelector` calls, so it
does not read the outgoing tree; it uses no `countTo`, no `ringSvg` and no
`progressBar`, so it owns none of the six memories; and it has no gesture that
commits into a rebuild. Its entire entry in this document is `range` at
trends.js:68 — a plain module-level toggle so the segmented control survives a
re-render — plus `lastSegmentPill`, which it inherits from `segmentedWide` at
trends.js:696 and which is `ui.js`'s to own rather than the screen's.

So Trends is the screen where the pattern can be established with not one of the
delicate invariants in play. That is the whole argument for doing it first, and
it is stronger than it looked before this pass.

Today has items 1, 2, 3, 4, 6 and 7 between them, and item 4 is the one to design
for before writing any code.

## Checklist for each screen converted

- [ ] Does anything in this screen read the outgoing DOM during `build()`?
- [ ] Does anything depend on `build()` being synchronous end to end?
- [ ] Are there ids minted per render that a persistent element would now change?
- [ ] Does a gesture in this screen commit into the rebuild, expecting it to redraw?
- [ ] Which value-continuity memories can be deleted, and does anything else read them?
- [ ] Does the screen still render twice on a write, and does anything rely on that?
