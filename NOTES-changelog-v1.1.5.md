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

---

## 5 · The day header stops clipping its own descenders

**What moved**

- `--text-title--line-height`: **1.1 → 1.25.**
- Inter's own box is **1.211em** (0.969 up, 0.242 down), so a 1.1 line box was
  shorter than the font it held. On its own that is invisible — text overflows
  a short line box every day and nobody notices.
- What made it visible is `truncate`, which brings `overflow: hidden` with it.
  The three titles that truncate — the day header, the sheet title, the screen
  header in `ui.js` — were the three that cut. **"Today, Aug 3" lost about 0.9px
  off the tail of its g**, every day the date has a g, q, p or y in it.
- 1.25 is also what every *non*-truncating title was already setting by hand
  with `leading-tight`. The token now says what the screens were saying over it.
- Header height is unchanged: the heading sits in a flex row against 44px
  chevrons, so a 32.5px line box still measures shorter than its own row.

**The reason — yours.** Sitting right next to entry 3, which is the other half
of this: 26px and `fitText` were about the *width* the day header has, and this
is the height. Both are the same line, and both were caused by the font swap
rather than by a layout decision — which is either an argument for merging them
or the reason to keep them apart.

---

## 6 · The swipe actions get drawn

**What moved**

- The revealed controls were `icon-btn-sm` at **38px with `bg-canvas`**, sitting
  on a track that was *also* `bg-canvas`. Two fills, one colour: nothing marked
  either control but a 17px hairline glyph floating on the page tint.
- Now **44px `.icon-btn-ink`** — ink fill, canvas glyph, 20px icon. Same
  inversion `.chip[aria-pressed]` already uses, so it is not a new treatment.
- The track flipped to the card's white, and the **tint moved onto the moving
  part**: an open row drops to `canvas` and rounds its trailing end at
  `--radius-card`, so it reads as a pill that has slid out of the card. White on
  white had no trailing edge to see, which is why the old state read as a hole
  in the card rather than as a row that had moved.
- Reveal is **128px**: 20 to the card's edge, 44, 10, 44 — 118 of track — and
  10 more between the row's rounded end and the first circle, which is the same
  10 that separates the two circles. The 20 is the row's own side padding, so
  the trailing circle lands on the margin everything else in the card lines up
  on.
- **The two dividers touching an open row leave with it.** A divider is a claim
  that two rows are next to each other, and an open row has stopped being next
  to anything — it is out of the list, on the ground, with two controls beside
  it. Holding the rules in place drew the row as a gap in a list that was still
  running, which is the opposite of what the gesture just did.
  - They travel rather than fade, on the row's own curve and duration, so it is
    one movement: the row goes left and takes its edges with it.
  - Two selectors, and they are not the same rule — `[data-open]` on the row
    hides the divider ABOVE it, the sibling combinator reaches forward for the
    one BELOW. Non-adjacent dividers are untouched.
  - Distance is `-100% - 20px`, not `-100%`. A percentage translate is of the
    element's own width, and the divider starts 20px in — so its own width
    lands its trailing end exactly on the card's edge and leaves a **20px stub
    of rule** sitting there. The extra 20 is the margin it has to clear.
- New `data-swiping` on the wrapper, set the instant `swipeToReveal` judges the
  gesture horizontal and cleared on close. **The tint has to arrive with the
  finger, not after it** — held until release, the row would go white → white →
  grey the moment your thumb left the glass, which is the wrong causal order.
- Checked in both themes: dark inverts to a light circle on a `#262626` card,
  and the open row drops to `#141414` — still the recessive tone, still the
  circles at full strength.

**The reason — yours.** The honest version is that this was unfinished rather
than wrong, so the entry is really about what a control revealed by a gesture
has to do that a permanent one does not: it has no label, no fixed home, and no
lead-in — the shape carries all of it, which is why 38px and a hairline was not
enough and 44px and a fill is.

---

## 7 · The palette gets its saturation back

**What moved**

- Four new hues, taken off the mockup: **blue `#2049b2`** (hand-picked),
  **orange**, **magenta**, and a green pulled off the teal that was drawn with
  them. Chroma rises on all four — carbs **0.118 → 0.224** in OKLCH, protein
  **0.121 → 0.173**. The old set was not at the limit of anything; it was drawn
  cooler than it had to be.
- **The constraint that shaped everything: a fill has to clear 3:1 against a
  white card AND against the `#262626` dark card.** That pins its relative
  luminance into **0.158 … 0.300** — about one and a half stops, for every
  colour in the app. Hue and chroma are free inside it; lightness is spent the
  moment you pick a hue.
- So each fill holds the drawn hue and chroma and only its **lightness** moved.
  The drawn colours survive unchanged as the TEXT shade, where the band is
  different: `--color-protein-edge` **is** `#2049b2`, unmodified.
- What could not survive is those values as fills. `#2049b2` sits at 0.083
  luminance — **1.91:1 on the dark card**. Blue carries 7.2% of luminance
  against green's 71.5%, so a saturated blue is dark whether you want it or not.
  Protein's fill is `#4d7cea`: same hue to the tenth of a degree, same chroma,
  lighter. One blue at two strengths.
- **Every number re-measured, `npm test` green at 107.** Marks now run 3.08:1
  (fat) to 3.90:1 (protein) on the white card; text 4.50:1 to 7.90:1.
- Dark-mode tints move with them, at the same hue and near enough the same
  chroma, so the palette reads as one set across both themes rather than as two.
- **Red delete buttons: not taken.** They were in the mockup only. Colour in
  this system means macro identity and never state — and the delete is undoable,
  so red overstated it.

**Not measured, and worth knowing.** Under simulated red-green colour blindness
the four are *further* apart than the old set (worst pair 6.2 → 9.2 deuter,
4.3 → 5.8 protan, in OKLab distance). Under **tritanopia** — blue-yellow, rare,
roughly 1 in 10,000 — fat and carbs converge at 2.3. That is the one case this
palette is worse at than it looks, and no hex fixes it: the P/F/C letters carry
their own initial, which is what actually does the work there.

**The reason — yours.** Two things to separate. The first is why the app wanted
more saturation at all, which is a claim about what the screen is *for* — a
dashboard you read in two seconds is not a document. The second is the more
interesting one: the palette is now the output of a constraint rather than a
set of picks, and the constraint is dark mode. Worth saying plainly that the
values were computed, not chosen, and that the drawn colours survived exactly
where the maths let them.

---

## 8 · The log's spacing

**What moved**

- **20px inset at the top and bottom of the log card**, matching the 20 the
  sides already had. Rows carry `10px 20px`, which was right between two
  entries — 10, rule, 10 — but a gap at the card's edge has no neighbour to
  split it with, so the same 10 read as half a gap there.
- **Divider to next item stays 10.** It was already 10; only the two ends moved.
- **The divider is inset 20px to match the text**, where it used to run the full
  width of the card. `.card > * + *` rules edge to edge, which is right for rows
  that fill their card and wrong for these, whose content starts 20 in and stops
  20 short — the rule was drawing a box the entries do not fill.
  - A pseudo-element, because a border cannot be inset. Kept **in flow** as a
    1px block with 20px margins rather than positioned over the row: it takes
    the pixel the border used to, so the 10s stay 10 instead of quietly becoming
    9, and as its own band the surface slides *past* it on a swipe rather than
    under it — so it needs no stacking order to survive an open row.
- Scoped to `.swipe-row`, so settings and the food library keep their fixed 48px
  `.row-single` rows.
- The revealed swipe circles centre on the wrapper, and the wrapper is what
  grew — they were 5px off the text on the first and last rows until they took
  the same edge padding the row does. **Measured 0 on all three rows after.**
- **Name to macro line: 4px → 2px.** The two lines are one thing said twice —
  what it was and what it cost — and the weight change from semibold name to
  regular figures is already separating them.

**The reason — yours.** Small enough that the entry is probably one sentence
about the log reading as rows of *entries* rather than rows of *text*, and the
edge inset is what makes the card feel like it contains them.

---

## 9 · The tab bar's fade goes away when nothing scrolls under it

**What moved**

- `.tabbar-fade` — three compounding `backdrop-filter` layers, a canvas veil and
  a black shade — now sets `display: none` on any screen the page does not
  scroll. `syncFade` in main.js sets a `data-active` flag.
- **`display: none`, not opacity.** The three blur layers stop compositing as
  well as stop showing. That cost is paid every frame while the band exists,
  which is the note already sitting above `BLUR_RAMP` — this is the case where
  the right number of layers is zero.
- Measured against the document, not any one screen: `.screen` already reserves
  the bar's height as bottom padding, so "does the page scroll at all" and "can
  anything reach the bar" are the same question. 1px of slack, because a
  fractional viewport height reports as scrollable when it is not.
- Driven by a `ResizeObserver` on `<body>` rather than by the router, since
  content height changes on every data load, not only on navigation.
- Where it bites: an empty Today, a short log, Settings on a large phone. Where
  it does not: Settings on a normal phone, the full log, history.

**The reason — yours.** The band is a legibility device for text passing under
the bar, and on a screen with no such text it was just tinting the bottom of the
page — an effect running with nothing to act on. Probably one line about a
scrim being a response to content rather than a decoration on a bar.

---

## 10 · The card says each number once, and a tap changes which one

**What moved**

- **Two removals.** The signed gap at the end of the calorie row (`-1732`) and
  the `65 left` line under every ring. Calories used to read `1105`, then
  `/ 2837`, then `-1732`; each ring read `115 / 180` and then `65 left`. Every
  one of those is the same fact — you have eaten some of a number — and the
  third statement of a fact is not emphasis, it is noise.
- **Tapping the card flips every number in it** between consumed and remaining.
  Consumed reads `1105` `/ 2837` and `115` `/ 180`; remaining reads `1680`
  `left` and `64` `left`. Same shape in both: the value at full size, its
  qualifier small and muted beneath.
- Over target needs no special form either way — `256 / 180`, or `76` `over`.
- **Which one leads is not arbitrary.** Consumed runs WITH its own arc, the
  number growing as the ring fills; remaining runs against it, counting down all
  day while the mark beside it counts up. That disagreement is why consumed is
  the default — and it stops being a fault the moment it is the reading you
  asked for rather than the one you were handed. It is also the exact objection
  that killed remaining-in-the-centre back in v1.1.2, so the entry should say
  what changed: not the number, the fact that you chose it.
- **Mode lives at module scope, not in the screen**, because `createScreen`
  rebuilds the tree on every data change — logging a banana would otherwise snap
  the card back to consumed under your thumb. Verified: still `remaining` after
  a write.
- Not persisted to settings. A way of looking at today, not a preference about
  the app, and one tap back.
- The card repaints itself instead of re-rendering the screen: nothing in the
  database changed, and a full render would re-read two stores and rebuild the
  log — which may have a row swiped open under the user's thumb.
- `role="button"` rather than a real `<button>`, because the card contains a
  `progressbar` and a button may not contain another widget. Cost: Enter and
  Space written out by hand. The ring `aria-label`s state BOTH readings
  regardless of mode, so a screen reader never has to toggle to hear the other.

**Found on the way in.** `countTo` wrote nothing until its first animation
frame, so the element held **nothing at all** between the call and that frame.
Invisible while the only caller was a screen render — the node was not in the
document yet — but this card now rebuilds a 48px number in place on a tap, and
a frame of blank reads as the card breaking. It is also however long a
backgrounded tab takes to run a frame, which is unbounded. It now paints the
starting value synchronously.

**Not done.** Nothing on the card says it is tappable. It gets the same press
scale-and-dim as every other control, which answers the question only once you
have asked it. A **first-click test** — "how many calories do you have left?" —
is what would settle whether anyone finds it.

**The reason — yours.** The economy argument is the interesting half: v1.1.2's
entry spent "every value exactly once" to buy a number that agreed with its arc,
and this buys it back without giving that up, because the second reading moved
into a gesture rather than onto the card.
