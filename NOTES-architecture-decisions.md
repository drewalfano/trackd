# Architecture decisions, and the questions a reader would ask about them

A list of the design and architecture decisions in this repo that a reader could
reasonably stop on and ask "why did you do it this way?". Each entry states the
decision as it stands in the code, the alternative it displaced, and what
choosing it costs or commits the app to.

This is a description, not an assessment. Nothing here is a recommendation and
nothing here rates any of it. Where a decision is recorded in a source comment,
the file is named so the argument can be read at the site.

Grouped by area: motion system, mode architecture, state handling, tablet
layout, offline behaviour, sound.

---

## Motion system

### M1. Gestures are written by hand against raw touch events

**Decision.** Every gesture in the app — row swipe, day paging, sheet dismissal,
toast dismissal, long press, press feedback — is implemented in
`src/lib/dom.js` on `touchstart`/`touchmove`/`touchend`, with each handler doing
its own axis decision, velocity sampling, resistance curve and settle.

**Rejected.** A gesture library, and Pointer Events as the underlying model.

**Consequence.** The five gestures share constants (`SWIPE_AXIS_THRESHOLD`,
`SWIPE_AXIS_RATIO`, `SWIPE_FLICK`) but not code, so a change to how a gesture
feels has to be made in each handler that should share it — the comments track
which fixes have and have not been propagated between them. The interaction
model is touch-only: there is no mouse or trackpad drag path, and the one
desktop affordance in the file is `contextmenu` standing in for long press
(`dom.js:1634`).

### M2. Motion is a named token scale, retrofitted over 101 literals

**Decision.** `styles.css:330` defines four curves and ten durations, and states
which five durations are deliberately off the five-step scale and what each of
them is load-bearing against. The stated aim is that the app's feel can be
retuned as a whole.

**Rejected.** Leaving the durations as literals argued for individually at each
rule, which is what the file did before.

**Consequence.** The exception list is a standing maintenance object: each of
`--dur-lead`, `--dur-brisk`, `--dur-mid`, `--dur-panel` and `--dur-fill` is
documented as paired with a neighbouring value, so collapsing one onto the scale
is a two-site change. Values that live in JS rather than CSS — `PANEL_MS`,
`PAGE_MS`, the swipe settle constants — are outside the token system and are
kept in step by comment.

### M3. Two curves, split by "arrival" versus "travel"

**Decision.** `--ease-out` (expo-out) is used for things landing; `--ease-glide`
(quad-out) for anything crossing a distance the eye is meant to follow. Panels,
view arrivals and the day deck are all on the glide curve.

**Rejected.** One house curve everywhere. Expo-out was tried on the sheet
panels, on the screen arrival and on the deck; the note at `dom.js:549` records
that it read as a bounce in each case, because it covers nine tenths of the
distance in the first third of the time.

**Consequence.** Three separate navigations (screen arrival, panel push, day
page) are deliberately pinned to the same duration and curve, so they cannot be
tuned independently without the set drifting apart.

### M4. Interruptible gestures read the painted transform, not the logical state

**Decision.** `paintedTranslate` (`dom.js:178`) and `currentX`
(`dom.js:751`) resolve the computed matrix so a new touch takes over from where
an element is actually being drawn mid-animation, and the handler then writes
that position back as an inline transform before continuing.

**Rejected.** Starting each gesture from the element's logical state
(`open ? -width : 0`), which is only true once a settle has finished.

**Consequence.** Each gesture carries the machinery this requires: a rebase at
the axis decision, a write-back so removing the transition does not snap to the
destination, and flags (`data-dragging`, `data-dismissing`, `data-closing`)
whose CSS ordering exists solely to stop keyframes outranking the inline
transform. `swipeToDismiss` notes that `data-dragging` is never cleared, because
un-suppressing would replay the entry keyframe from the start.

### M5. The distance spent deciding a gesture's axis is refunded

**Decision.** When a gesture is claimed as horizontal (or as a downward pull),
the travel spent proving it is given back so the surface starts from rest under
the finger. Rows and sheets refund exactly the threshold; the deck rebases to
the finger's current position (`dom.js:1000`) because its axis window can stay
open for 40px or more.

**Rejected.** Charging the evidence distance to the gesture, which made the
surface jump on capture.

**Consequence.** Three handlers each carry their own version of the same
correction, and the deck's version had to be generalised after the row's fixed
refund was copied into a context where the claim distance varies.

### M6. Day paging commits on `transitionend`, not on release

**Decision.** `swipePages` hands the day change to the caller when the slide
animation ends, because the track is then parked exactly where a freshly built
deck sits and the repaint has nothing to correct (`dom.js:528`).

**Rejected.** Committing on touchend, which would put the rebuild underneath a
still-moving track.

**Consequence.** The gesture needs two flags rather than one (`committing` for
the animation, `awaitingPaint` for the handover), a `PAINT_GRACE` timer in case
the caller never repaints, a single-slot `pending` queue so a tap inside the
settle is not dropped, and a `drain()` hook the caller must call at the end of
its repaint — `paintDeck` calls it as its last statement and the comment says it
has to be last.

### M7. Press feedback is one delegated document listener against a class list

**Decision.** `pressDelegate` (`dom.js:1440`) writes `data-pressed` on
touchstart for anything matching a hardcoded twelve-entry `PRESSABLE` selector
list, in the capture phase, installed once at boot and never torn down.

**Rejected.** `:active` (documented as unreliable on iOS for non-native
elements), and the earlier `pressable(el)` per-element binding, which reached
four controls out of eleven and had to be re-bound on every subtree rebuild.

**Consequence.** A control gets press feedback if and only if its class is in
that list, so the list is now the thing that has to be kept in step with the
component vocabulary rather than each construction site. Two press scales
(`--press-scale`, `--press-scale-sm`) replaced seven, with one documented
exception for the day card.

---

## Mode architecture

### A1. The dashboard card states each value once, and a mode switches which value

**Decision.** Today's card has two readings — eaten and remaining — and one
switch changes all of calories, bar and three ring centres at once
(`screens/today.js:27`). Calories previously read `1105`, `/ 2837` and `-1732`
in one row, and each ring read `115 / 180` with `65 left` under it.

**Rejected.** Showing both readings simultaneously, which is what the card did
before.

**Consequence.** Half the information is off screen at any moment, so the switch
becomes load-bearing rather than a convenience — the file states this explicitly
("saying it once is only economy if you can still ask for the half that is not
on screen"). It also constrains later additions: the over-target `+79` pill is
drawn in eaten mode only, because in remaining mode the hero already says it.

### A2. Nothing visible marks the switch

**Decision.** The only way to change reading with a thumb is a bare tap anywhere
on the card. What is left underneath is `modeReach` — a visually hidden
`.reach-only` button that exists for keyboard and assistive tech.

**Rejected.** Four built alternatives, listed in order at `today.js:59`: a
segmented Eaten/Remaining control, two paging dots, a vertical swap glyph, and a
muted state label in the corner. The stated argument against all four is that
the card already names its reading in four places, so a control naming it is a
fifth statement.

**Consequence.** The comment records the cost as open and unsolved: nothing on
screen says the card can be tapped, and no first-click test has been run. The
"eaten by default, remaining on request" ordering is a partial answer — the file
argues remaining counts down while the ring counts up, so it is acceptable as a
reading you asked for and not as one you were handed.

### A3. `cardMode` is a stored setting written through a path that does not emit

**Decision.** The reading is persisted in the settings store, but by
`saveCardMode` (`lib/db.js:356`) rather than `saveSettings` — it writes the
record and updates the cache without firing the change bus.

**Rejected.** Going through `saveSettings` like every other preference.

**Consequence.** This is the only setting in the app whose write is invisible to
subscribers, and it is correct only while Today is both the sole reader and the
sole writer of the field. The reason given is cost: Today watches the `settings`
scope, so an emit would re-read three days of entries and restart the calorie
bar's fill on every flick of the switch.

### A4. The mode lives in module scope and is seeded once per session

**Decision.** `cardMode` is a module-level variable in `today.js`, seeded from
settings on the first build and never re-read (`modeSeeded`, `today.js:99`).

**Rejected.** Screen-scoped state, and re-reading settings on each build.
Screen scope fails because `createScreen` rebuilds the whole tree on any data
change, so logging a banana would snap the card back; re-reading fails because a
day swipe milliseconds after a tap would return the pre-tap value while the
write is still in flight.

**Consequence.** Stated in the file: a data import does not adopt the imported
reading until the next launch.

### A5. A mode switch is explicitly not a data change

**Decision.** A module flag, `modeSwap`, is raised for exactly the repaint a
switch causes and lowered on the far side. It suppresses the calorie count-up
and the ring arc sweep, and triggers a `.reading-swap` fade instead.

**Rejected.** Letting the card animate identically whichever caused the rebuild
— the card cannot tell the difference on its own, since it is rebuilt with
different numbers either way.

**Consequence.** The same suppression channel is now used by a second, unrelated
distinction (`dayChanged`, for paging), so two conceptually different "do not
animate" cases share one mechanism. The neighbour cards are repainted through it
too, so all three cards change reading together even though two are two-thirds
off screen.

---

## State handling

### S1. Vanilla JS, no framework and no state library

**Decision.** Screens rebuild their own subtree when data they subscribe to
changes; `dom.js` provides `h()`, `repaint()` and a handful of helpers.

**Rejected.** Preact, named in the README as an open question and resolved
against. The stated reason is that almost all state lives in IndexedDB, so
diffing a large render tree is not the problem the app has.

**Consequence.** Continuity of running animations becomes a manual concern:
`createScreen` has to identity-check whether a build returned the same node it
was given last time, because `mount` is clear-and-append and detaching cancels
every in-flight transition in the subtree (`lib/screen.js`, and
`NOTES-node-identity.md`). Today's deck keeps three card elements alive for the
life of the screen for the same reason.

### S2. Exactly one piece of cross-screen state

**Decision.** `src/state.js` holds `date` and `pinnedToToday` and nothing else,
with a `Set` of subscribers. Everything else is read from IndexedDB on demand.

**Rejected.** A general client-side store.

**Consequence.** The shared date is a deliberate coupling between Today and the
Log sheet, and the exceptions to it have to be handled by hand — the Today tab
button resets the date because History also sets it (`main.js:162`), and
`rollOverIfNeeded` is wired to `visibilitychange` because the app is expected to
be open across midnight.

### S3. Writes are optimistic, with a chained barrier for reads that bypass the cache

**Decision.** `putEntry` and `deleteEntry` patch the in-memory day cache and
emit before the IndexedDB transaction commits, then roll the cache back and
re-emit if the write throws. Reads that go around the cache (`entriesInRange`,
`getEntry`, a cache miss) first await `settled()`, a promise chain of in-flight
writes (`lib/db.js:167`).

**Rejected.** Emitting after the commit — measured at 6.25ms on desktop
Chromium, which the file treats as too long to sit between a tap and a repaint.

**Consequence.** There is a window in which the cache knows something the store
does not, and correctness depends on ordering that is one statement wide: the
write must be registered in the barrier *before* the emit, because `emit` runs
its listeners synchronously and a listener can reach `settled()` in the same
tick. The rollback also means a failed log is visible to the user as a row that
appears and then leaves.

### S4. Two opposite cache policies in the same file

**Decision.** `quickAddCache` is dropped centrally in `emit()` on any relevant
scope; `entriesByDate` is maintained surgically by the two entry writers and is
only cleared on `'all'` (`lib/db.js:105`).

**Rejected.** One policy for both. The stated reasoning is that the quick-add
ranking can be reordered by any food write and has no cheap patch, while a day's
entries can only be changed by two functions that each know exactly which row
moved.

**Consequence.** Import and `clearAll` are the special case that has to be
remembered, because they rewrite the store without going through either writer —
which is why `'all'` clears `entriesByDate`, `stampedDays` and
`firstLoggedCache` explicitly.

### S5. Entries snapshot their computed macros, name and brand

**Decision.** An entry stores the macro numbers it was logged with, plus
`foodName` and `brand`, rather than a reference to be resolved at read time.

**Rejected.** Recomputing from the food record. The README states both halves:
correcting a food's nutrition later would silently rewrite history, and deleting
a food would turn months of rows into "Deleted food".

**Consequence.** Deleting a food deliberately leaves its entries intact and
readable, so the entries store is not referentially consistent with the foods
store by design. `getFood` also has to tolerate `null` ids, because quick adds
and AI-described estimates are entries with no food behind them
(`lib/db.js:481`).

### S6. Day targets are stamped on first write and never backfilled

**Decision.** `ensureDayTargets` writes a target snapshot the first time
anything is logged into a day; first write wins, and `saveSettings` re-stamps
only today (`lib/db.js:421`).

**Rejected.** Backfilling days logged before the store existed, and judging
every day against the current target. The DB v2 upgrade comment says inventing a
target for those days "would be worse than admitting it".

**Consequence.** Days from before the feature fall back to the current target,
so the history view mixes snapshotted and inferred rows with nothing marking
which is which. A `stampedDays` set exists purely to keep the second and later
logs of a day free of a round trip.

---

## Tablet layout

### T1. One fixed column width, and no breakpoint anywhere

**Decision.** `.screen` is `max-width: 430px; margin-inline: auto`
(`styles.css:930`), and the tab bar row is clamped to the same 430. The
stylesheet contains six media queries in total: two for `prefers-color-scheme`,
one for `display-mode: standalone`, three for `prefers-reduced-motion`. There is
no width breakpoint in the app.

**Rejected.** A responsive or adaptive layout — a wider column, a two-pane
split, or anything keyed to available width.

**Consequence.** On a tablet or a desktop browser the app renders as a 430px
phone column centred in the viewport, with the floating tab bar and the sheet
inheriting the same clamp. Sheets are sized against the same assumption: the
sheet body is documented as 350px wide at 390pt, and controls such as the
seven-segment row are fitted to that number (`styles.css:1770`).

### T2. Portrait is declared, and rotation is not handled

**Decision.** `public/manifest.webmanifest` sets `"orientation": "portrait"`,
and `index.html` sets `user-scalable=no` with `viewport-fit=cover`.

**Rejected.** Letting the installed app rotate, and allowing pinch zoom.

**Consequence.** The one place the code acknowledges rotation says it is not
covered: `fitText` (`dom.js:107`) is deliberately not wired to viewport resize
because screens rebuild their header on navigation, and "a rotation without a
navigation is the one case this will not catch". The manifest declaration only
binds where the app is installed; in a browser tab the layout is whatever the
430px column does at that size.

### T3. Vertical anchoring goes through one token derived from device measurements

**Decision.** Everything that anchors to the bottom of the screen uses
`.screen-floor` / `.screen-cover` — `position: fixed; top: 0; height:
var(--screen-h)` — rather than `bottom: 0`, and `--screen-h` is `100svh`, raised
to `100lvh` under `display-mode: standalone` (`styles.css:841`).

**Rejected.** `bottom: 0`, `100dvh` and `100lvh` unconditionally. The comment
records all three as shipped and reverted, with a measurement table from one
iPhone 17 Pro showing what each unit reported in three states.

**Consequence.** The layout's vertical anchor is calibrated to a single device
under a single status-bar style; `index.html` states that
`apple-mobile-web-app-status-bar-style: black-translucent` and the `lvh` anchor
are one decision and must not be changed separately. A whole instrument,
`lib/viewportProbe.js`, exists to take these readings on device and stash them
in `localStorage`, because the failure state is a screen with no readout on it.

### T4. Drawn size and touch size are separated by pseudo-elements

**Decision.** Controls smaller than 44px keep their drawn diameter and get a
`max(100%, 44px)` pseudo-element for the target (`styles.css:3421`). A flat 44
was rejected explicitly because it would shrink the reachable area of a
295px-wide toast button.

**Rejected.** Sizing controls to 44px, or hardcoding a 44px box per control.

**Consequence.** The pseudo-element only ever grows a control vertically, since
the three controls it is applied to are already wider than 44 — which the
comment gives as the reason it is safe to apply by class list rather than
case by case, because every adjacency in this layout is horizontal. It also
means the drawn size of a control is no longer a reliable reading of what it
occupies, so a tablet or desktop pointer sees hit areas larger than anything on
screen indicates.

---

## Offline behaviour

### O1. A hand-written service worker, stamped by a ~40-line Vite plugin

**Decision.** `src/sw.template.js` plus a `trackd:sw` plugin in
`vite.config.js` that injects the hashed asset list and a content-derived
version string at build time.

**Rejected.** `vite-plugin-pwa` / Workbox, evaluated and dropped. The README
gives the count: 300+ packages and eight high-severity build-time advisories for
an app-shell precache and one stale-while-revalidate route.

**Consequence.** Files copied verbatim out of `public/` never appear in the
Rollup bundle, so they are listed by hand in the plugin — the precache manifest
is partly generated and partly maintained. The version is the total length of
the emitted output in base 36, so the worker re-installs only when output
changes.

### O2. Two caching strategies, and a hard cap on the third-party one

**Decision.** Same-origin requests are cache-first into a versioned shell cache;
Open Food Facts is stale-while-revalidate into an unversioned `mt-off-v1` cache
trimmed to 300 entries oldest-first; navigations are network-first with the
cached shell as fallback.

**Rejected.** A single strategy, and an unbounded product cache.

**Consequence.** A food looked up once resolves offline afterwards, but the 301st
distinct product evicts the front of the cache's key order regardless of how
often it was used — the trim reads nothing about usage. When both cache and
network fail,
the worker synthesises a `503` with `{ status: 0, offline: true }` so callers get
JSON rather than a network error.

### O3. `ignoreVary: true` on every cache match

**Decision.** All three lookup paths pass `{ ignoreVary: true }`
(`sw.template.js:22`).

**Rejected.** Default `Vary` matching.

**Consequence.** The comment states the failure it exists for: precaching from
URL strings stores responses against requests with no `Origin` header, while a
`<script type="module">` tag is fetched in CORS mode and sends one — so on hosts
replying `Vary: Origin` the cached entry would fail to match the request it
exists to answer, and the app would boot blank offline. The trade is that
genuinely varying responses would be served interchangeably.

### O4. An update is never applied underneath the user

**Decision.** A waiting worker raises a toast with an Update action and a 20s
duration; only pressing it posts `SKIP_WAITING`. A `controllerchange` listener
then reloads once (`main.js:387`).

**Rejected.** `skipWaiting()` on install.

**Consequence.** Because an installed iOS PWA can go days without a real boot,
the app has to ask for itself: `reg.update()` is called on every
`visibilitychange` to visible and on `pageshow`, and a worker that installed on a
previous visit is prompted immediately rather than waiting for an `updatefound`
that has already fired. The comment records the cost of not doing this — a round
of device readings returned stamped with a build two fixes behind, which is also
why `__BUILD_ID__` exists as a separate constant from `VERSION`.

### O5. Export is the only backup, and import is merge-or-replace with a preview

**Decision.** `exportAll` walks five data stores plus settings into one JSON
file. `previewImport` computes per-store added/overwritten/removed/after counts
that are shown before anything is committed, and the import itself runs in one
transaction.

**Rejected.** Any sync or remote backup — the app has no accounts and no
backend. Also rejected: merging settings, which only cross on a replace, on the
grounds that merging someone else's targets into a live app "is a surprise
nobody asked for".

**Consequence.** Clearing site data deletes everything, which the README states
plainly. The AI key is deliberately kept in `localStorage` rather than IndexedDB
so that "not included in an export" is true by construction rather than by
filtering (`lib/aiKey.js`) — which also means the key is outside the store the
app treats as its source of truth.

---

## Sound

### N1. The app has no audio

**Decision.** There is no Web Audio, no `<audio>` element, and no sound asset
anywhere in `src/` or `public/`.

**Rejected.** A confirmation tone on the actions that currently have none — the
scanner capture is the obvious candidate, since it is the one moment the user is
looking at a camera viewfinder rather than at the result.

**Consequence.** Every confirmation in the app is visual, or visual plus a
vibration. There is nothing to fall back on when the screen is not being looked
at, and no audio settings to build, ship or respect.

### N2. Non-visual feedback is one unguarded `navigator.vibrate` call

**Decision.** `haptic(pattern = 8)` (`dom.js:147`) calls
`navigator.vibrate?.(pattern)` inside a `try`/`catch` whose comment is "not
supported, and not worth telling anyone about".

**Rejected.** Feature detection with a visible consequence — a fallback
treatment where vibration is unavailable, or a setting that reflects whether it
works.

**Consequence.** `navigator.vibrate` is not implemented in iOS Safari, which is
the platform the rest of the app is measured against (`black-translucent`, the
`--screen-h` table, the install hint gated on `isIOS()`). On that platform the
three haptic moments are silent no-ops, and by design nothing in the app or its
settings says so.

### N3. Three haptic moments, chosen individually rather than as a vocabulary

**Decision.** `haptic()` is called in exactly three places: the day card's mode
switch at the 8ms default (`today.js:639`), a barcode capture at 10ms
(`scan.js:53`), and a long press firing at 12ms (`dom.js:1616`).

**Rejected.** A consistent haptic vocabulary across confirmations — logging a
food, deleting a row, undoing, changing tab and paging the day all produce no
haptic, and each is at least as consequential as a mode switch.

**Consequence.** The durations encode a rough scale (8/10/12) that is never
declared as one, unlike the motion tokens in `styles.css`, so there is no shared
place to change it. `DEFAULT_SETTINGS` has no haptics field and Settings offers
no control, so the feedback is not something a user can turn off or on.
