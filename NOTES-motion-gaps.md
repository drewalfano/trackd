# Missing motion — where the screen changes with nothing in between

Read-only pass, 2026-08-09. Companion to `NOTES-motion-audit.md`, which covers
motion that exists and is wrong. This one covers motion that is not there.

Ranked by how often the interaction happens, not by how good the fix is.

> **Status, 2026-08-09.** Items 1, 3, 4 and 5 are shipped. Two of the fixes
> proposed below turned out to be wrong when built, and the code carries the
> corrected reasoning — read it there rather than here:
>
> - **Item 1** suggested remembering the newest `createdAt`. Wrong twice: Undo
>   restores an old timestamp, and module-scoped memory is defeated by
>   `createScreen` discarding superseded renders. It reads the DOM instead, with
>   a grace window, because logging renders Today *twice*. See `freshEntryIds`
>   in screens/today.js.
> - **Item 3** suggested a directional 16px slide. Built, rejected on device
>   feel, and removed. The real problem was that **the sheet was not resizing**
>   between panels of different heights — a 94px snap that no easing on the
>   contents could cover. What shipped is `resizeTo` in lib/sheet.js plus a plain
>   cross-fade. Direction is no longer expressed; the back chevron and title
>   carry it. See `.panel-in` in styles.css.
> - Item 4's collapse needs a forced reflow, not a `requestAnimationFrame` —
>   `auto → 0` will not interpolate. See `entryRow`.
>
> Item 7 shipped on 2026-08-10, and its second half — the hero counting across a
> day change — turned out to be the larger of the two. Nothing on the card moves
> when the DAY moved now. The first half went the other way: the chevrons were
> NOT routed through the deck's slide, because the complaint on device was that
> the day change had too much motion rather than too little.
>
> What replaced it is a 140ms dissolve on the log alone. Not the Quick add rail —
> `quickAddFoods` takes no date and ranks over a window ending at the real today,
> so the rail is identical on every day and fading it would assert a change that
> did not happen. That rule is now the general one; see the `motion-asserts-change`
> memory.
>
> Item 2 is still unbuilt and still needs a device reading first.

---

## The structural reason, first

Almost everything below has one cause, and it is worth stating before the list
because it decides which fixes are cheap and which are not.

`createScreen` rebuilds the **entire screen subtree** on any data change
(`screen.js:44`, `mount(el, content)` → `clear` + append). Sheets do the same
thing one level down — `showTop` runs `clear(body)`, and the log's `paint()`
calls `repaint(body, …)`. So after any write, **no element on screen is the same
DOM node it was a moment ago**. There is nothing left to transition *from*.

What the app has instead is a **value-continuity system**: a set of
module-scoped maps that remember the last drawn number so a freshly built
element can animate from it.

| Memory | Where | What it saves |
|---|---|---|
| `lastKcal` | today.js:186 | the calorie hero's count-up origin |
| `lastPct` | ui.js:332 | each `progressBar`'s previous fill |
| `lastLen` | ring.js | each ring arc's previous length, per key |
| `lastSegmentPill` | ui.js:687 | the outgoing pill's mid-flight matrix |

That system is good, and it is why the numbers on Today feel alive. But it can
only carry things expressible as **a number that can be re-animated from a
remembered value**. It cannot carry **presence** — a row existing or not, a tile
being third rather than first, a section changing shape. Those are the gaps, and
they are all the same gap.

So: fixes that re-animate a value are cheap. Fixes that need node identity
across a rebuild (list insert, list removal, reorder) need either a small amount
of remembered state passed into the build, or FLIP. I have noted which is which,
and in one case the right answer is to stop the movement rather than animate it.

---

## 1. Adding an entry — the row just appears

**Frequency: the highest in the app.** This is the primary action.

**What happens now.** `+` on a Quick add tile → `quickLogFood` → IndexedDB write
→ `onChange('entries')` → full Today rebuild → the new row is drawn at the top
of `Logged` (`today.js:767`, newest first). Four things change on that frame:

- the calorie hero counts up over 200ms ✓
- the three rings grow over 250ms ✓
- the calorie bar wipes from 0 over 250ms (wrongly — audit 1, finding 2)
- a toast slides up over 200ms ✓
- **the row itself pops into existence with nothing at all**

And if the day was already at eight entries, the eighth row silently vanishes at
the same moment (`LOG_PREVIEW_MAX`), with nothing to say it was pushed out
rather than lost.

**What the user loses.** The causal link between the tap and the thing the tap
made. Four elements animate to acknowledge a new entry and the one element that
*is* the new entry is the only one that does not move — so the eye, which
follows movement, is drawn to the summary and away from the record. On a day
with eight rows you have to read to find out which one is yours.

**Smallest fix.** A one-shot entry animation on the new row, using the same
value-memory pattern already in the file. Remember the newest `createdAt` at
module scope alongside `lastKcal`; if the top entry beats it, that row gets a
class:

```
@keyframes row-in { from { opacity: 0; transform: translateY(-6px) } to { … } }
.row-in { animation: row-in 200ms cubic-bezier(0.16, 1, 0.3, 1) }
```

`translateY(-6px)`, downward into place, because it arrived from above. Same
grammar as `.reading-swap` and `toast-in`, both of which already rise 3–12px.
Compositor-only, ~12 lines total including the memory.

The list below sliding down to make room is the fuller answer and needs FLIP.
Not worth it — the rows below are context, not the subject.

---

## 2. The keyboard covers the sheet footer, and nothing responds

**Frequency: every custom food, every serving edit, every search, every weigh-in.**

**What happens now.** Nothing in the app listens to the keyboard.
`window.visualViewport` appears in exactly two places, `lib/viewportProbe.js`
and the Settings › Viewport diagnostic screen — neither of which adjusts
layout.

The geometry: `.sheet-scrim` is `.screen-cover` (`position: fixed; top: 0;
height: var(--screen-h)`), `.sheet-panel` is `absolute; bottom: 0` inside it,
and `.sheet-footer` — which holds the primary button on every sheet that has one
— is `absolute; bottom: 0` inside the panel. iOS does not resize the layout
viewport for the keyboard, so none of those three boxes move. Meanwhile
`lockScroll` has pinned `<body>` at `position: fixed`, so WebKit's automatic
scroll-the-focused-input-into-view has nowhere to put the page.

**What the user loses.** Not an animation — possibly the button. If the
keyboard covers `Add` / `Save` / `Duplicate`, the flow becomes: type, dismiss
the keyboard, then commit. That is a per-use tax on the app's main creation
path.

**I have not verified this on device and cannot** — see
`no-ios-simulator-on-this-mac`, and the standing rule that heights get measured
at 390pt rather than asserted. **This is the one item here that needs a reading
before it is designed.** The apparatus already exists: `captureViewportState`
stashes `SHORT SCREEN` and `SHEET OPEN` blocks. A third auto-captured block —
`KEYBOARD OPEN`, triggered on `visualViewport` resize while a sheet is open,
recording `visualViewport.height`, `offsetTop`, and `.sheet-footer`'s
`getBoundingClientRect().bottom` — would settle it in one session on the phone.

**Smallest fix, if confirmed.** A single listener publishing the occluded
height as a token, and two consumers:

```
const vv = window.visualViewport
const sync = () => document.documentElement.style.setProperty(
  '--kb-inset', `${Math.max(0, innerHeight - vv.height - vv.offsetTop)}px`)
vv?.addEventListener('resize', sync)
vv?.addEventListener('scroll', sync)
```

then `.sheet-panel { max-height: calc(… - var(--kb-inset, 0px)) }` and
`.sheet-footer { transform: translateY(calc(-1 * var(--kb-inset, 0px))) }`,
transitioned over 250ms `ease-out` to sit alongside the keyboard's own rise.
`transform` on the footer keeps it compositor-only; the panel's `max-height` is
a layout change but it happens twice per keyboard, not per frame.

Ranked second on frequency alone. If the device reading shows the footer is
actually reachable, this drops off the list entirely.

---

## 3. Sheet panel pushes have no transition — `sheet.js:368`

**Frequency: every add-food flow.** Add → Scan / Search / Custom is the app's
main creation path and every step of it is a push.

**What happens now.** `showTop()` runs `clear(body)` then appends the new
panel's node. The body's entire contents are replaced on one frame. The header's
back chevron appears from `display: none`, the title text swaps, and the footer
is replaced — all instantly, all at once. The sheet shell itself does not move,
so there is no motion anywhere on screen to say a navigation happened.

**What the user loses.** Depth. The panel stack is a real hierarchy — it has a
back chevron, it consumes history entries, `pop` unwinds it — and none of that
is visible. Pushing Search and popping back to the root look identical: the
contents change. On the way back there is not even a direction to read.

**Smallest fix.** A directional one-shot on the incoming panel node only, since
the outgoing one is already gone by then:

```
.panel-push { animation: panel-push 200ms cubic-bezier(0.16, 1, 0.3, 1) }
.panel-pop  { animation: panel-pop  200ms cubic-bezier(0.16, 1, 0.3, 1) }
@keyframes panel-push { from { opacity: 0; transform: translateX(16px) } to { … } }
@keyframes panel-pop  { from { opacity: 0; transform: translateX(-16px) } to { … } }
```

`showTop` already knows which it is — `pushPanel` calls it after growing the
stack, `onPop` after splicing it. Pass the direction in. ~10 lines, no layout,
and 200ms keeps it under the frequent-interaction bar.

Worth doing on the header title too, or the chrome will read as static while the
body moves.

---

## 4. Deleting an entry — the list jumps, and Undo jumps it back

**Frequency: high, and it is the one destructive action in the app.**

**What happens now.** Swipe → tap delete → `wrapper._closeSwipe(false)` →
`deleteEntryWithUndo` → `deleteEntry` → full rebuild. The row is gone on the
next paint and every row below it moves up by its full height instantly.
Simultaneously the card's numbers wind down and a toast rises.

Then the recovery path does it in reverse: `Undo` → `putEntry` → rebuild → the
row reappears and the list jumps back down. Neither direction has any motion.

**What the user loses.** The gap closing is what confirms the *right* row went.
An instant reflow gives you a list that is one shorter with no evidence about
which one left — and the row you were looking at is now where a different row
used to be. That is the moment the Undo in the toast is supposed to answer, and
by the time you read the toast the visual evidence has already been discarded.
The Undo landing is worse: a row materialises somewhere in the middle of a list
that shifts under it, and nothing says it went back where it was.

**Smallest fix.** Animate the doomed node before the rebuild replaces it, and
delay the write by exactly that long. In `entryRow`'s action handler:

```
wrapper.dataset.removing = 'true'
setTimeout(() => handler(entry), 180)
```

with a collapse that does not animate `height` directly:

```
.swipe-row[data-removing='true'] {
  display: grid; grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 180ms ease-in, opacity 140ms ease-in;
}
```

(`grid-template-rows: 1fr → 0fr` with the child at `min-height: 0` is the
current way to collapse to zero without measuring; the row's own
`overflow: hidden` is already there.)

180ms and `ease-in` — an exit, accelerating away, two thirds of the 260ms the
row took to open. The rebuild arriving afterwards finds the row already gone and
has nothing left to jump.

The Undo direction can reuse the `.row-in` from item 1 for free: the restored
entry is by definition the newest change, so the same "is this row new" check
catches it.

**Same gap, worse, inside the Full log sheet.** There, deleting the last entry
in a block flips `populatedBlock` → `emptyBlock` (`log.js:306`) — a different
component with a different height and a different heading style. That is a whole
section changing shape on one frame.

---

## 5. Tab switches — a hard cut with a pause in front of it

**Frequency: many times per session.**

**What happens now.** Tap → `syncTabs` moves the pill (300ms — audit 1, finding
9) → `show(factory)` constructs the screen and **awaits its IndexedDB read**
with the old screen still on display → `mount(view, next.el)` replaces
everything on one frame → `window.scrollTo(0, 0)`, also instant.

Holding the outgoing screen during the read is deliberate and right
(`main.js:59` — it avoids a white flash). The gap is that nothing marks the
boundary when the swap finally comes. The sequence reads as: tap, pause of
unpredictable length, pop.

**What the user loses.** Any sense of having gone somewhere. Three sibling tabs
with a left-to-right relationship the pill is already expressing, and the
content refuses to agree with it. The variable-length pause makes the eventual
pop read as a page load rather than a transition — which is the one thing a
local-first app should never look like.

**Smallest fix.** Mark the arrival:

```
#view[data-entering] { animation: view-in 160ms cubic-bezier(0.16, 1, 0.3, 1) }
@keyframes view-in { from { opacity: 0; transform: translateY(4px) } to { … } }
```

set in `show()` right after `mount`, cleared on `animationend`. Four lines.

**Better, if the tabs are worth it:** make it directional so the content agrees
with the pill. `TABS.findIndex` for the outgoing and incoming paths gives the
sign; `translateX(±12px)` instead of `translateY(4px)`. Keep the distance small
and check `#app` for horizontal overflow before committing — `.day-deck` already
had to reach for `overflow-x: clip` for exactly this reason, and a full-width
slide would need the same guard one level up.

---

## 6. Quick Add tiles reorder under the finger — and the fix is not an animation

**Frequency: most quick-add logs where the food was not already ranked first.**

**What happens now.** `quickAddFoods` ranks by recency and frequency over a
window, and its cache is invalidated on every `entries` or `foods` change
(`db.js:145`). So tapping `+` on the tile in position five writes an entry,
invalidates the ranking, rebuilds Today, and redraws the rail with that food
now in position one. The tile **you are still touching** teleports across the
screen and the four tiles between shift right by 160px.

**What the user loses.** Their place. This is the most disorienting instant swap
in the app because it moves the object under the thumb, and it does it as a
side effect of a successful action — so the feedback for "that worked" is the
target disappearing from where you hit it.

**The fix here is not motion.** FLIP would make the reorder legible, and a
legible reorder is still a rail that will not hold still while you use it. The
right answer is the one this codebase already reached for the card's mode
(`today.js:99`):

> a build can be triggered by a date swipe milliseconds after the switch was
> pressed … and snap the card under the thumb

Same argument, same shape of fix: freeze the rail's order for the life of the
mounted screen. Compute the ranking on mount, keep it in a module-scoped array
next to `cardMode`, and let re-ranking happen on the next navigation or day
change. New foods entering the top eight can append rather than insert.

~10 lines, no animation, and it removes the problem instead of narrating it.
Flagged here because the brief asks where no animation is correct: this is the
clearest case in the app.

---

## 7. The day changes two ways, and only one of them moves

**Frequency: daily, and the chevron is the discoverable route.**

**What happens now.** Swiping the deck runs a 220ms slide and commits at
`transitionend` — good, and the commit deliberately lands where a fresh deck
draws it so the rebuild has nothing to correct (`dom.js:464`).

The **chevrons directly above it** (`pageHeader`'s `onPrev`/`onNext` →
`setDate(±1)`) and the **date picker** (`onPick: setDate`) skip all of that.
`setDate` emits, the screen rebuilds, and the new day's card is simply *there*.

**What the user loses.** The consistency between two controls doing one thing,
eight pixels apart. The gesture teaches you that days are laid out left to
right; the chevron then changes the day with no lateral movement at all, which
quietly contradicts it. The picker is worse — jumping three weeks back is
exactly when you most want to see that you moved.

**Smallest fix.** Route the chevrons through the deck's own commit. `swipePages`
already contains the animation; expose it as an imperative `page(dir)` on the
handle it returns, and have `onPrev`/`onNext` call that instead of `setDate`
directly. The commit callback is unchanged, so there is one code path to the day
change and one animation for it.

For the picker, a lateral slide is wrong — the jump is not one day — so a
`.row-in`-style 180ms fade on the rebuilt deck is the honest mark. Different
distance, different motion.

**Related, and it is over-animation rather than under.** On any day change the
new live card reads `lastKcal`, which still holds the *previous day's* total —
so the calorie hero **counts from yesterday's calories to today's**
(`today.js:215`). The rings do the same through `lastLen`, since the live card
keeps the bare macro key across the rebuild. That is precisely the error
`modeSwap` was built to prevent, quoted from `today.js:200`:

> Counting means the number changed. On a toggle the number did not change; the
> question did.

A day change is the same category — the day changed, not the intake. The fix is
the one already written: seed `from` with the destination when the date moved,
exactly as `swapping` does. ~4 lines, and it should land with item 7's animation
rather than after it, or the card will slide in *and* count.

---

## 8. The toast stack drops when one expires — `toast.js:147`

**Frequency: whenever two actions land inside 5s. Deleting a few rows does it.**

**What happens now.** `MAX_VISIBLE = 2`, and the host is a flex column anchored
to the bottom. `dismiss()` fades the element over 160ms — but the element still
occupies its box for that whole time, and is then `remove()`d at 170ms. So the
survivor sitting above it holds position through the fade and then jumps down by
a toast height plus the 10px gap, on the frame the node leaves the DOM.

**What the user loses.** Small, but it is the last thing that happens after a
delete, and a jump at the end reads as a glitch rather than as a queue
draining.

**Smallest fix.** Collapse the box with the fade rather than after it — the same
`grid-template-rows: 0fr` trick as item 4, on the same 160ms, so by the time
`remove()` runs the element occupies nothing and there is no jump left to make.
Two lines of CSS and no JS change.

---

## 9. The ring centre jumps while the arc travels — `ring.js:583`

**Frequency: every log, on all three rings.**

**What happens now.** `.ring-arc` transitions `stroke-dashoffset` over 250ms
with per-key memory ✓ — but the number inside the ring is written directly into
a fresh node. So on every entry the arc sweeps for a quarter second while the
figure at its centre has already changed.

**What the user loses.** The two halves of one mark disagree about when the
value changed. It is small at 15px type, and it is the same defect the calorie
hero solved years-of-commits ago with `countTo`.

**Smallest fix.** The mechanism exists. `countTo` is exported from `dom.js`,
takes a format function, and already has per-element memory via
`dataset.value` — point it at the ring's `big` span with
`format: (n) => g(n) + 'g'` and a 250ms duration to match the arc. Skip it when
`swapping` is set, for the reason the calorie block already skips it.

Roughly 6 lines. Do it only if item 1 is done first — a ring counting under a
row that still pops would be polish in the wrong order.

---

## 10. Full log sheet: the status bar snaps while everything else fades

**Frequency: whenever the sheet is opened, which is the route to History.**

The sheet itself is fine — 260ms in, 200ms out, and the day is loaded *before*
`openSheet` so it animates in already populated (`log.js:271`, deliberate and
right).

**What is instant.** `setScrimmed(true)` runs on the same frame the scrim is
appended (`sheet.js:588`), and it rewrites `<meta name="theme-color">`. On the
installed PWA that strip behind the clock is painted by the browser, so it
**snaps** from `#F0F0F0` to `#9C9C9C` while the scrim below it fades in over
260ms. For a quarter second there is a hard horizontal seam across the top of
the screen — which is the exact artefact `statusBar.js` was written to close.

Closing is asymmetric: `setScrimmed(false)` runs inside `destroy()` at the
200ms mark, so the strip stays dark for the whole exit and then snaps back after
the scrim has already gone.

**What the user loses.** A quarter second of the app looking like two layers
that were composited separately.

**Smallest fix.** No CSS can reach that strip, so either step it or move it.
Stepping is four lines — publish 3–4 intermediate mixes on `requestAnimationFrame`
over the animation's duration. Moving it is one line and buys most of the
benefit: publish the scrimmed colour at the animation's midpoint (~130ms in)
rather than at t=0, and publish canvas at the *start* of the exit rather than at
its end. Both edges then land where the scrim is closest to matching them.

---

## 11. Search results replace a text row with up to 25 rows — `addFood.js:684`

**Frequency: moderate, and it is the slowest interaction in the app.**

**What happens now.** Debounced query → `Searching Open Food Facts…` appended as
a plain row → network round trip → `setTail(list, null)` and up to 25
`remoteRow`s appended in a loop. No fade, no stagger. The card's height can
increase several-fold on one frame.

There is also a `spinner()` helper exported at `ui.js:1041` with **zero callers**
— dead code that should either be used here or deleted.

**What the user loses.** Not much on a fast connection. On a slow one the page
sits still for a second and then triples in height, which reads as a jolt rather
than as an arrival — and the thing that was there a moment ago (the local
results you might have wanted) has moved down the screen without warning.

**Smallest fix.** One fade on the block, not per row — 120ms opacity on a
wrapper around the remote results. A stagger would be worse: 25 rows arriving in
sequence is a loading animation pretending to be content.

---

## 12. Weight chart range change — two unrelated charts

**Frequency: low. Ranked here for that reason, not because it is minor.**

**What happens now.** `segmentedWide.onChange` → `range = v` → `rerender()` →
whole Trends screen rebuilt → a brand new `<svg>`. The path, the dots, the
gridlines and the axis labels are all replaced at once, and because
`axisBounds` is fitted to the visible window, **the y-scale changes too** — so
the line does not merely extend, it redraws at a different amplitude in a
different place.

The segment pill slides 300ms while this happens, so once again the indicator
moves and the content cuts.

**What the user loses.** The relationship between the two views. The 30-day line
*is* the right-hand end of the 90-day line, and nothing on screen says so — they
read as two separate charts that happened to appear in the same box.

**Smallest fix.** A 160ms crossfade on the `<svg>` node, plus holding the card's
height so the layout does not jump underneath it. Interpolating `d` between two
paths is the real answer and is not worth it here: the point counts differ, the
axis differs, and this fires a few times a month.

Worth pairing with the honesty rules already governing this chart — a fade says
"same instrument, different window", which is true; a morph would imply the line
itself moved, which is not.

---

## 13. Empty → populated, and threshold crossings

**Frequency: once each for the true empty states. Recurring for the thresholds.**

**True empty states — leave them alone.** `Nothing logged yet` → the first row,
`Tap + to log your first food` → the rail, `No weigh-ins yet` → the chart card,
`No history yet` → the averages. Each happens once per install, is directly
caused by the user, and is accompanied by the toast and the count-up that item 1
covers. A transition here would be decoration on a moment that is already
legible. **No animation is correct.**

**Threshold crossings are different**, because they are the app changing what it
is able to tell you:

- `averagesStrip` flips from `3 of 7 full days logged` to the two-figure grid at
  `AVERAGES_MIN_DAYS` (`trends.js:319`)
- the trend notice disappears at `MIN_ENTRIES_FOR_TREND` weigh-ins
- the `± / week` rate line goes from a held-empty line box to a real figure

The codebase already cares about this class of problem — `trends.js:786` holds
an empty line box specifically so the card does not reshuffle when the rate
appears, and calls a card that reshuffles at a threshold "a rendering fault".
That is exactly right, and it is the argument for marking the crossing rather
than hiding it. A 180ms `.reading-swap` on the newly-qualified content would say
"this is new information", once, on the day it becomes true.

Low frequency, low cost, genuinely nice. Bottom of the list on the ranking the
brief asked for.

---

## 14. `confirm()` pops in at full size — `toast.js:201`

**Frequency: low. Deletes of foods and data, mostly in Settings.**

The scrim is `.sheet-scrim`, so it inherits `scrim-in 260ms ease-out` ✓. The
dialog box inside it is a plain div with no animation, so **it appears at full
size on frame one while the scrim fades in behind it** — the box arrives before
its own backdrop. Closing is fine by accident: the box is a child of the scrim,
so `scrim-out` fades both together.

**Smallest fix.** Give the box the sheet's own vocabulary at a shorter distance:
`translateY(8px) scale(0.98)` → rest, 200ms `cubic-bezier(0.16, 1, 0.3, 1)`.
Four lines, and it makes the app's one blocking dialog behave like the rest of
its modal surfaces.

---

## Where no animation is correct

Worth recording so these do not get "fixed" later:

- **`show()` holding the outgoing screen through the IndexedDB read.** Documented
  at `main.js:59`. A spinner here would be a worse answer than stale-but-real
  content.
- **The deck's commit landing exactly where a fresh deck draws it.** The
  *absence* of a correction is the design (`dom.js:464`). Nothing should be
  added at that seam.
- **`.tabbar-fade` / `.sheet-fade` toggling with `display: none`.** Deliberately
  not opacity, so the backdrop-filter layers stop compositing rather than merely
  stop showing. An animated fade here would cost frames to hide something that
  is already invisible.
- **The first tab-pill placement, suppressed with a forced reflow**
  (`main.js:278`). Opening straight onto Settings should find the pill there,
  not watch it travel.
- **The segment pill fading in when nothing was selected** rather than sliding
  from an edge it was never at (`styles.css:2279`).
- **First-run empty states becoming content.** Item 13.
- **The Quick add rail's reorder.** Item 6 — the fix is to stop moving, not to
  animate the move.
- **Reduced motion parking the bubble field rather than slowing it**
  (`styles.css:2694`).

And two places that need **less** motion, not more:

- the calorie hero and the ring arcs counting across a **day change**, because
  the day changed and the intake did not (item 7)
- the calorie bar replaying from zero on every render (audit 1, finding 2)

---

## Ranked summary

| # | Gap | Frequency | Fix size |
|---|---|---|---|
| 1 | New entry row appears with no motion | Highest | S |
| 2 | Keyboard covers sheet footers, nothing responds | Very high | M — **needs a device reading first** |
| 3 | Sheet panel pushes have no transition | Very high | S |
| 4 | Delete jumps the list; Undo jumps it back | High | S |
| 5 | Tab content swaps on a hard cut | High | XS |
| 6 | Quick add rail reorders under the finger | High | S — *not* an animation |
| 7 | Chevron/picker day change has no motion; hero counts across days | Daily | S |
| 8 | Toast stack drops when one expires | Moderate | XS |
| 9 | Ring centre jumps while its arc travels | Every log | XS |
| 10 | Status bar colour snaps against a fading scrim | Per sheet open | XS |
| 11 | Search results replace a line with 25 rows | Moderate | XS |
| 12 | Weight chart range change redraws cold | Low | XS |
| 13 | Threshold crossings unmarked | Rare | XS |
| 14 | `confirm()` box arrives before its scrim | Rare | XS |

Items 1, 3, 4 and 5 are about 40 lines between them and cover the four things
people do most. Item 2 is the largest unknown in either audit and is the only
one that needs the phone before it can be designed.
