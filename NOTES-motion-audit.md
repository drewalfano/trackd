# Motion audit — every animation, transition and gesture

Read-only pass, 2026-08-09. Nothing here has been changed. Line references are to
the files as they stand.

Judged against iOS at 390pt, per `runs-as-ios-pwa`.

---

## Part 1 — inventory

### 1.1 Gestures

Three gesture engines, all in `src/lib/dom.js`, plus two press helpers.

#### `swipeToReveal` — log row swipe-to-edit/delete (dom.js:270)

| | |
|---|---|
| Trigger | `touchstart` on `.swipe-row`, axis judged at 12px with a 1.5:1 horizontal-over-vertical ratio |
| Tracks finger | **Yes, 1:1.** `setX(dx, false)` writes `transform: translateX()` with `transition: none` on every `touchmove` |
| Animates | `transform` on `[data-swipe-surface]`; `--swipe-progress` (0–1) published to the wrapper drives the two circles' `transform`/`opacity`; `background-color` + `border-radius` on the surface (160ms ease-out); `transform` on the two dividers (200ms) |
| Release | Open: 260ms `cubic-bezier(0.22, 1.12, 0.36, 1)` (overshoots). Close: 200ms `cubic-bezier(0.33, 0.9, 0.2, 1)` |
| Velocity | **Yes.** `SWIPE_FLICK = 0.45` px/ms overrides the halfway rule in either direction (dom.js:421–439) |
| Rubber band | **Past open only** — `SWIPE_RESIST = 0.32`, constant multiplier. Past closed is a hard clamp (`raw > 0 ? 0`) |
| Compositor | `transform`/`opacity` throughout ✓. The circles' transform is composed from a CSS custom property, so it recalcs on the main thread each frame — unavoidable given JS is already writing per frame |
| Interruptible | **No.** See finding 6 |
| Listeners | All passive; `touch-action: pan-y` means no `preventDefault` needed |
| Reduced motion | Via the global blanket rule (styles.css:2953) |

#### `swipePages` — the day swipe on Today (dom.js:476, wired at today.js:436)

| | |
|---|---|
| Trigger | `touchstart` on `.day-deck`; same 12px / 1.5:1 axis lock as the row |
| Tracks finger | **Yes, 1:1** where the direction exists; ×0.25 where it does not (`reach()` returns false forward off today) |
| Animates | `transform` on `.day-deck-track` only |
| Release | Fixed 220ms `cubic-bezier(0.16, 1, 0.3, 1)`, both for commit and for spring-back |
| Threshold | `Math.abs(dx) > Math.max(60, pageWidth * 0.25)` — distance only |
| Velocity | **No. Not read at all.** See finding 1 |
| Rubber band | Constant ×0.25 damping at the forward boundary; **no clamp at all in the reachable direction** |
| Compositor | `transform` ✓. `.day-deck-track` carries a permanent `will-change: transform` |
| Interruptible | **No.** `committing` blocks `touchstart` for 220ms + the rebuild's IndexedDB read |
| Commit | Fires on `transitionend`, so the incoming card is already parked where a fresh deck draws it and the rebuild has nothing to move. Good design; no timeout fallback |
| Click guard | Post-swipe click swallowed in the capture phase, flag consumed rather than read |

#### `swipeToDismiss` — pull a sheet down to close (dom.js:610, wired at sheet.js:583)

| | |
|---|---|
| Trigger | `touchstart` anywhere on `.sheet-panel`. Claimed immediately from the header; from the scroller only when `scrollTop === 0` |
| Tracks finger | **Yes, 1:1** downward (`dy = Math.max(0, deltaY)`); scrim opacity tracks with it, floored at 0.35 |
| Animates | `transform: translateY()` on the panel, `opacity` on the scrim |
| Release, cancelled | 200ms `cubic-bezier(0.16, 1, 0.3, 1)` back to 0 |
| Release, committed | 200ms **`ease-in`** to `translateY(100%)`, scrim `opacity 200ms ease-in` |
| Threshold | `dy > min(120, height × 0.3)` **or** `velocity > 0.6` px/ms |
| Velocity | **Yes**, for the outcome. **Not** for the duration — see finding 5b |
| Rubber band | None needed downward; upward is a hard clamp at 0 |
| Compositor | `transform`/`opacity` ✓ |
| Interruptible | Cancelled drags, yes. **A drag during the first 260ms of the sheet's life is silently ignored** — see finding 4 |
| Listeners | `touchmove` is non-passive, and is the only one in the file — necessary, since the axis belongs to the scroller until it does not |
| Reduced motion | Explicit branch: dismisses with no animation (dom.js:706) |

#### `pressable` (dom.js:747) and `longPress` (dom.js:786)

`pressable` holds `data-pressed` while a finger is down, releasing at 10px of
travel — two pixels under `swipePages`' 12px capture, so a card has stopped
looking pressed before it starts moving. Applied to the live day card and the
add button, and nothing else. `longPress` is 500ms with 8px of slop, on entry
rows (duplicate) and food tiles.

### 1.2 Sheets

| Element | Enter | Exit |
|---|---|---|
| `.sheet-panel` | `sheet-in` 260ms `cubic-bezier(0.16, 1, 0.3, 1)`, `translateY(100% → 0)` | `sheet-out` 200ms `ease-in`, forwards |
| `.sheet-scrim` | `scrim-in` 260ms `ease-out`, opacity | `scrim-out` 200ms `ease-in`, forwards |
| Teardown | — | `destroy()` at 200ms via `setTimeout` (sheet.js:468) |

`data-dismissing` sets `animation: none` on both so a finger-carried exit
finishes under its own inline transition rather than snapping back to
closed-position first. Declared after the closing rules so it wins.

Panel pushes inside a sheet (`showTop`) have **no transition** — the body's
children are swapped synchronously. Sheet entry is 260ms (in band), exit 200ms
(0.77× the entry, near the 2/3 target). Both compositor-friendly.

### 1.3 Tab switching

| Piece | Value |
|---|---|
| `.tab-pill` | `transform: translateX(index × 100%)`, `transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1)`. First placement suppressed with a forced reflow (main.js:278) |
| `.tab` colour | `transition: color 200ms ease-out` |
| Screen content | **No animation.** `show()` awaits the screen's IndexedDB read, then `mount()` replaces the subtree and `window.scrollTo(0, 0)` |
| Ordering | `resolve()` calls `onNavigate` (moves the pill) before `handler` (starts the async build), so the pill responds on the tap frame |
| Stale taps | Guarded by `showToken` — a superseded build is destroyed, not mounted |
| Press feedback | **None on `.tab`.** No `:active`, no `data-pressed` |

### 1.4 Everything else

| What | Trigger | Values | Property | Notes |
|---|---|---|---|---|
| Press dip — `.icon-btn`, `.btn-primary/secondary`, `.chip-sm`, `.back-btn`, `.food-tile`, `.add-btn`, `.cal-day` | `:active` / `data-pressed` | 120ms `cubic-bezier(0.16, 1, 0.3, 1)` + `opacity 120ms ease-out` | transform, opacity | Compositor ✓, under 200ms ✓. Scale varies by size (0.92 circles, 0.97 pills, 0.9 calendar day, 0.99 card) — deliberate and documented |
| `.day-card-toggle` press | tap on live day card | 120ms, `scale(0.99)` + `opacity 0.9` | transform, opacity | Suppressed during a drag via `.day-deck[data-paging]` |
| `countTo` | totals change | 200ms, cubic ease-out (`1-(1-t)³`), rAF | text content | Writes through per-digit spans to avoid reflow. Skipped on reduced motion and on a mode swap |
| `.reading-swap` | mode toggle | 180ms `cubic-bezier(0.16, 1, 0.3, 1)`, `translateY(3px)` + opacity | transform, opacity | Own reduced-motion rule |
| `.kbar-fill` | every Today render | `width 250ms cubic-bezier(0.16, 1, 0.3, 1)` | **width** | Replays from 0% every render — finding 2 |
| `.bar-fill` | value change | `width 250ms` + `opacity 250ms` | **width** | Has `lastPct` memory, so it animates on change only |
| `.bar-thin-fill` | value change | `width 320ms` | **width** | Odd one out at 320 |
| `.ring-arc` | value change | `stroke-dashoffset 250ms` | SVG geometry | Per-key `lastLen` memory. Not compositable, but repaint is cheap at this size |
| `.tab-pill` / `.segment-pill` | selection | `transform 300ms` (+ pill `opacity 160ms`) | transform | Segment pill resumes mid-flight from the outgoing pill's computed matrix (ui.js:689) |
| `.switch-knob` | toggle | `transform 160ms` + track `background-color 160ms` | transform, background | ✓ |
| `.swipe-row` divider | `data-swiping` / `data-open` | `transform 200ms cubic-bezier(0.16, 1, 0.3, 1)` | transform | Binary flag, not progress-driven — finding 3 |
| `toast-in` | toast appears | 200ms `cubic-bezier(0.16, 1, 0.3, 1)`, `translateY(12px)` + opacity | transform, opacity | Exit is `opacity 160ms ease-in`, removed at 170ms |
| `.bubble-row` | onboarding, ambient | `bubble-pan` 60–90s linear infinite, `translateX(-50%)` | transform | The one loop in the app. Parked under reduced motion |
| `.tabbar-fade` / `.sheet-fade` | scrollability | none — `display: none` toggle | — | Deliberately not opacity, so the backdrop-filter layers stop compositing |

### 1.5 What the standards already pass

- **No `ease-in-out` anywhere.** Entries are `cubic-bezier(0.16, 1, 0.3, 1)`
  (expo-out) or `ease-out`; the one spring is the row's open curve.
- **Exits are faster than entries** in all three places that have both: sheet
  260/200, toast 200/160, row swipe 260/200.
- **Press feedback is 120ms** everywhere it exists — well under the 200ms bar.
- **Sheets are 260ms**, inside the 250–350 band.
- **All three gestures track the finger 1:1.** None of them animate only on
  release.
- **`prefers-reduced-motion` is handled** by a global blanket at styles.css:2953
  (`0.01ms !important`, which is deliberately non-zero so `transitionend` still
  fires and `swipePages`' commit does not deadlock), plus targeted rules for
  `.reading-swap` and `.bubble-row`, plus JS branches in `countTo` and
  `swipeToDismiss`. The blanket is unlayered, so it beats both the layered
  component rules and the inline durations JS writes. This is genuinely well
  covered.

---

## Part 2 — findings, ranked by quality gained per unit of work

### 1. The day swipe ignores release velocity — `dom.js:526`

**Current:** `const enough = Math.abs(dx) > Math.max(60, w * 0.25)`. Nothing
else. A flick that lifts at 50px on a 350pt card springs back over 220ms.

**Why it feels wrong:** it is the one gesture in the app that does not know how
fast you were going, and it sits eight pixels from one that does. `dom.js:239`
argues the case already, for the row swipe: *"The halfway rule alone punishes
the fast gesture… springing it shut is the app disagreeing with something
unambiguous."* The deck never got the same treatment. On device this reads as
the day swipe being heavier than the row swipe under the same thumb.

**Replacement:** sample velocity in `onMove` exactly as `swipeToReveal` does
(last sample only, not an average), then in `onEnd`:

```
const flick = Math.abs(velocity) > 0.45          // same constant as the row
const enough = flick || Math.abs(dx) > Math.max(60, w * 0.25)
const dir = flick ? (velocity > 0 ? -1 : 1) : (dx > 0 ? -1 : 1)
```

Share `SWIPE_FLICK` rather than declaring a second number — the argument for
0.45 is already written at `dom.js:239` and applies unchanged.

**Work:** ~12 lines, one file, no CSS.

---

### 2. The calorie bar replays from zero on every render — `today.js:236`

**Current:** `.kbar-fill` is built at `width: '0%'` and driven to `pct` in a
`requestAnimationFrame`, unconditionally, on every call to `calorieBlock` — for
all three cards in the deck.

**Why it feels wrong:** it is the only mark on the card with no memory. The
number has `lastKcal`, the rings have `lastLen` keyed per card, and the mode
swap goes to real trouble (`modeSwap`, `swapping`) to make sure neither of them
*counts* when the question changed rather than the data. The bar underneath them
wipes from empty to full every single time — on a mode toggle, on a day swipe,
on any unrelated data change that triggers `createScreen` to rebuild. The
argument at `today.js:200` — *"the eye reads a count as new data arriving, so it
lands as the card glitching rather than as the card answering"* — is exactly as
true of a bar sweeping across as of digits winding.

It is also the most visible instance of the width problem in finding 8: a
250ms layout-and-paint animation replayed on every repaint of the busiest
screen.

**Replacement:** give it the same per-key memory `progressBar` already has
(`ui.js:332`), keyed by card position so the neighbours do not share the live
card's:

```
const from = live && !swapping ? (lastKbarPct.get(key) ?? 0) : pct
lastKbarPct.set(key, pct)
// rAF only when from !== pct
```

Same shape as `ringSvg`, so the three marks on the card finally agree about when
they move.

**Work:** ~10 lines in one function. Highest quality-per-line in this list.

---

### 3. The row-swipe dividers move on a binary flag, not with the finger — `styles.css:1961`

**Current:** `data-swiping='true'` (set once, at the axis decision) triggers
`transform: translateX(calc(-100% - 20px))` over `200ms
cubic-bezier(0.16, 1, 0.3, 1)`.

**Why it feels wrong:** two things.

- It fires on the deciding frame, so a hesitant 15px drag sends both dividers
  fully off the card while the row itself has barely moved. The comment at
  `styles.css:1958` wants them to *start with the gesture* — as written they
  complete independently of it.
- 200ms `cubic-bezier(0.16, 1, 0.3, 1)` is not the row's curve. The row settles
  open at 260ms on `cubic-bezier(0.22, 1.12, 0.36, 1)`. The comment claims *"on
  the row's own curve and duration"*; neither number matches.

The circles beside it already do this correctly — `--swipe-progress` scales
them continuously, `--swipe-settle` is 0ms during the drag and the release
duration after.

**Replacement:** drive the divider from the same two custom properties the
circles use:

```
transform: translateX(calc(var(--swipe-progress, 0) * (-100% - 20px)));
transition: transform var(--swipe-settle, 0ms) cubic-bezier(0.22, 1.12, 0.36, 1);
```

and drop the `[data-swiping]` selectors, keeping `[data-open]` only as the
resting state for a row that is already open when the list repaints.

**Work:** one selector rewritten, one deleted. No JS — the properties are
already published.

---

### 4. A sheet cannot be dragged during its first 260ms — `styles.css:2925`

**Current:** `.sheet-panel { animation: sheet-in 260ms … }`. `swipeToDismiss`
writes `panel.style.transform` inline, and a running CSS animation outranks an
inline style. So a drag begun inside the entry window is tracked in JS, produces
no movement on screen, and then jumps into place when the animation ends.

The codebase knows this rule — `styles.css:2936` documents it precisely for the
*exit* case and solves it with `data-dismissing`. The entry case was never
covered.

**Why it feels wrong:** the sheet is unresponsive for the exact quarter-second
in which someone who opened it by mistake reaches to throw it away. It is
silent — no snap, no lag, just nothing — which reads as the touch not having
landed.

**Replacement:** set the flag the moment the gesture is claimed rather than at
release. In `swipeToDismiss.onMove`, right after `decided = true`:

```
panel.dataset.dismissing = 'true'
if (scrim) scrim.dataset.dismissing = 'true'
```

and clear both on a cancelled release. `animation: none` then hands the panel to
the inline transform mid-flight. Optionally read the panel's computed matrix
first so it picks up from where the entry animation had reached rather than from
0 — `translateXOf` at `ui.js:690` is the same technique on the other axis.

**Work:** ~6 lines, one flag moved earlier.

---

### 5. Two problems with how released gestures finish

**5a. The day swipe's 220ms is fixed regardless of distance left.**
`swipePages` `setX(±w, true)` uses the same duration whether the card has 20px
left to travel or 300. Released at 90% of the way over, the last 10% takes the
full 220ms and reads as sludge — the card visibly decelerates into a stop it
had almost reached.

*Replacement:* scale the duration to the remaining distance, clamped so it never
becomes a snap or a crawl:

```
const remaining = Math.abs((dir === -1 ? w : -w) - dx)
const ms = Math.round(Math.min(300, Math.max(120, (remaining / w) * 260)))
```

**5b. The sheet's committed dismissal is `ease-in` from a moving finger.**
`dom.js:710` — `transform 200ms ease-in` starting from wherever the drag left
it. The sheet is travelling at speed at the moment of release; `ease-in` restarts
it from zero velocity and accelerates. That discontinuity is what makes a flicked
sheet feel like it hesitates before leaving.

*Replacement:* the release curve should preserve the finger's velocity, not
restart from rest. `cubic-bezier(0.3, 0.8, 0.4, 1)` with a
velocity-proportional duration:

```
const remaining = panel.offsetHeight - dy
const ms = Math.round(Math.min(260, Math.max(120, remaining / Math.max(velocity, 1.2))))
```

Keep the scrim on `ease-out` at the same duration — a scrim that accelerates
away leaves the page snapping back into brightness.

**Work:** ~8 lines each, both local to one function.

---

### 6. The row swipe is not interruptible mid-settle — `dom.js:421`

**Current:** on release, `onEnd` sets `open = true; dx = -width` (or `0`) and
starts a 260ms transition. A new `touchstart` 100ms later computes
`raw = (open ? -width : 0) + deltaX` from the *destination*, not from where the
row is actually painted — so the row teleports to its end position and continues
from there.

**Why it feels wrong:** it breaks the one promise the gesture makes, that the
row is under your finger. Catching a row you have just released is a natural
correction, and it produces a jump.

**Replacement:** read the painted position at `touchstart` and use it as the
origin, which is exactly what `segmentedWide` does for its pill (`ui.js:715`,
`translateXOf`). Add the Y-axis equivalent for `swipeToDismiss` while there —
same defect, lower frequency.

```
const painted = translateXOf(surface)      // mid-transition included
surface.style.transition = 'none'
dx = painted
```

then track from `painted + deltaX` rather than from the logical state.

**Work:** ~15 lines, plus lifting `translateXOf` out of `ui.js` into `dom.js`
where both callers can reach it.

---

### 7. The deck over-drags into empty canvas, and its boundary damping is not a rubber band — `dom.js:522`

**Current:** `dx = reach(dir) ? deltaX : deltaX * 0.25`. Two issues.

- **No clamp in the reachable direction.** The deck holds exactly three cards.
  Drag 500px on a 390pt screen and the track carries the neighbour past the
  opposite edge, exposing bare canvas where no card exists. Nothing stops it.
- **×0.25 is a constant, not a rubber band.** At the forward boundary a 300px
  pull still moves the card 75px. Real rubber-band resistance is asymptotic —
  it keeps giving, less and less, and never runs out. iOS scroll does this, and
  `swipeToReveal`'s own note at `dom.js:229` argues for exactly that behaviour
  past the open position.

**Replacement:** clamp the free direction to roughly 1.15 page widths, and make
the boundary give asymptotic:

```
const LIMIT = w * 0.35                                   // asymptote
const rubber = (d) => (d * LIMIT) / (Math.abs(d) + LIMIT)
dx = reach(dir) ? Math.max(-w * 1.15, Math.min(w * 1.15, deltaX)) : rubber(deltaX)
```

`rubber()` gives 1:1 near zero and tapers toward `LIMIT`, so the first few
pixels still feel live — which is the whole point of the note at `dom.js:470`
about a page that will not move being indistinguishable from one that did not
receive the gesture.

**Work:** ~8 lines. Also worth applying `rubber()` to `SWIPE_RESIST` so the two
gestures resist the same way.

---

### 8. Three bars animate `width`, forcing layout every frame

**Current:**

| Selector | Value | Where |
|---|---|---|
| `.kbar-fill` | `width 250ms cubic-bezier(0.16, 1, 0.3, 1)` | Today's hero calorie bar |
| `.bar-fill` | `width 250ms` + `opacity 250ms` | Log sheet macro bars, up to 4 stacked |
| `.bar-thin-fill` | `width 320ms` | Log sheet summary |

**Why it feels wrong:** each frame is a layout + paint of the fill and its
contents rather than a compositor transform. Individually small; `.kbar-fill`
matters most because finding 2 makes it run on every repaint of the busiest
screen, and because it carries the `.kbar-over` chip inside it, so the chip's
position is re-laid-out 15 times per animation.

**Replacement:** `transform: scaleX()` with `transform-origin: left` and the
fill sized to 100%. The complication is real and should be priced in: both
`.kbar-fill` and `.bar-fill` hold a right-aligned child (`.kbar-over`,
`.bar-over`), which needs a counter-scale — `transform: scaleX(calc(1 / var(--fill)))`
on the child, with `--fill` set as the driving custom property. Border radius
distorts under a non-uniform scale, so the rounded caps need to move to the
track's `overflow: hidden` (already present on `.kbar` and `.bar-thin`) or the
fill needs a fixed-width rounded cap element.

Given that, this is worth doing for `.kbar-fill` — 250ms, hero position, runs
constantly — and is arguable for the other two, which fire once on a value
change inside a sheet.

Separately: `.bar-thin-fill` at **320ms** is the odd number in a file where
every other progress mark is 250. Make it 250 regardless of whether the
transform work happens.

**Work:** ~30 lines and careful device checking for the two bars with chips
inside. This is the largest item here, which is why it is ranked below the
one-line wins despite being the only true compositor violation.

---

### 9. Tab switching: a 300ms indicator over an instant content swap

**Current:** `.tab-pill` transitions `transform` over **300ms**; the screen it
points at is mounted with no transition whatsoever, typically well before the
pill arrives.

**Why it feels wrong:** two clocks. The content is already the new screen while
the marker is still sliding toward the tab that owns it, so for ~200ms the bar
and the page disagree. 300ms is also sheet-tier timing on the most frequently
tapped control in the app — the standards put frequent interactions under 200ms
and this is three tabs' worth of travel, not a modal arriving.

There is a second, related gap: **`.tab` has no press state.** No `:active`, no
`data-pressed`. Every other control in the app dips 120ms on touch, including
the add button eight pixels to the right of the tab bar. The three tabs are the
only untouched controls on the screen.

**Replacement:**

- `.tab-pill` → `transform 200ms cubic-bezier(0.16, 1, 0.3, 1)`. Same for
  `.segment-pill`, which is 300ms for the same reason and is a control people
  toggle repeatedly.
- Add the standard dip to `.tab`, matched to its size — `scale(0.94)` at 120ms,
  on `:active` and `data-pressed` both, with `pressable()` applied in
  `tabBar()` since iOS will not give `:active` to these reliably. The note at
  `dom.js:732` is the reason.

**Work:** two numbers and one small CSS block plus three `pressable()` calls.

---

### 10. `swipePages` has no fallback if `transitionend` never fires — `dom.js:544`

**Current:** `committing = true` is cleared only by the deck being rebuilt after
`onCommit`. If the transition never completes — the screen rebuilds mid-commit
because an unrelated `entries` change fired, the page is backgrounded, or the
target transform happens to equal the current one — `committing` stays true and
the deck stops accepting gestures for the life of the screen.

The mid-commit rebuild is the plausible one: `createScreen` re-renders Today on
any data change, and a toast's Undo landing during those 220ms replaces the
track under the running transition.

**Replacement:** a `setTimeout(done, duration + 80)` racing the listener, with
both paths idempotent. Six lines, and it removes a class of failure that would
be very hard to reproduce from a bug report.

---

### 11. Polish, batched

- **`.day-deck-track { will-change: transform }` is permanent** (styles.css:1167).
  `will-change` is meant to be set shortly before an animation and removed
  after; held for the life of the screen it pins a compositor layer holding
  three full day cards. Set it in `swipePages.onStart` and clear it in
  `onEnd`/after the commit — the property exists to be toggled.
- **`scrim-out` is `ease-in`** (styles.css:2934). An opacity fade that starts
  slow leaves the page dim and then snaps clear. `ease-out` or `linear` for the
  scrim; the panel keeps its `ease-in`, which is correct for something leaving
  the screen.
- **`.bar-thin-fill` 320ms → 250ms**, per finding 8.
- **`.segment` has no press state**, same gap as `.tab`.
- **Sheet panel pushes have no transition** — pushing Scan or Search onto the
  add sheet swaps the body instantly while the header's back chevron appears.
  Not wrong, but it is the one place in the app where a navigation happens with
  no motion at all. A 200ms `translateX(12px)` + opacity on the incoming panel
  would match `toast-in`'s grammar. Low priority; listed for completeness.

---

## Summary table

| # | Finding | Impact | Work |
|---|---|---|---|
| 1 | Day swipe ignores release velocity | High | S |
| 2 | Calorie bar replays 0→pct every render | High | S |
| 3 | Row-swipe dividers on a binary flag | Medium | XS |
| 4 | Sheet ignores drag during its 260ms entry | Medium | XS |
| 5 | Fixed release durations (deck 220ms; sheet `ease-in` from speed) | Medium | S |
| 6 | Row swipe not interruptible mid-settle | Medium | M |
| 7 | Deck over-drags to empty canvas; flat boundary damping | Medium | S |
| 8 | Three bars animate `width` | Medium | L |
| 9 | Tab pill 300ms; no press state on tabs | Medium | S |
| 10 | No `transitionend` fallback on commit | Low (severe when hit) | XS |
| 11 | Polish batch | Low | S |

Nothing in this audit needs the app rearchitected. Findings 1–4 are about
40 lines between them and are where the perceived-quality gain is.
