# Visual changelog

The visual system is locked to the v1 mockups. Every change to it gets logged
here with the reason, because the record of what moved and why is part of the
case study, not a byproduct of it.

---

## v1.1.0 — mockup pass

Reconciled against the Figma mockups. Four of these are changes to the locked
system rather than additions to it, so they are listed first.

### Changed: the ground inverted

The page is now white (`canvas #FFFFFF`) and cards are grey (`surface #F0F0F0`)
with a **1px `#D9D9D9` outline**. v1 had it the other way round — white cards on
a grey page, grouping communicated by surface alone.

The outline is what makes the inversion work. With both grounds light, surface
change alone is too weak to separate a card from the page, and it fails entirely
for a component nested inside another component. Everything structural now
carries the outline: cards, bar tracks, fields, chips, buttons, the tab bar, the
segmented control, the camera viewfinder.

### Changed: colour is allowed on macro headings

v1 restricted the four hues to bar fills and the letter suffix. The mockups
colour the "Calories" / "Protein" / "Fat" / "Carbs" headings as well, and that
is now the rule.

What has *not* changed is the constraint underneath it: colour still only ever
means macro identity. Nothing is coloured for decoration, mood, or state, there
is still no second red anywhere, and the four hues still sit in the same narrow
lightness band. The heading is macro identity, so it is allowed; an error state
is not, so it still is not.

### Changed: every filled shape carries a darker edge

Bar fills now have a 1px stroke of a darker shade of their own hue
(`--color-kcal-edge` and friends; the fat and carbs values come straight from
the mockups). The fill also sits inside its track with a 3px inset rather than
filling it edge to edge. Both together make the bar read as an object in a
channel instead of a painted region — and the inset is what keeps the track's
own outline visible behind a full bar.

### Changed: the calorie block reads number-first

Was label, number, bar. Now number at display size with the target trailing
small and grey, then the coloured label, then the bar. Display size went 40px →
56px.

### Geometry, on a grid

- **Corner radius is 24px** on everything that is not a pill: cards, sheets,
  buttons, fields, chips, the route buttons, the camera view.
- **Single-line rows are exactly 48px** with a 24px radius, which makes them
  read as pills. Rows with a subtitle grow from a 48px minimum.
- **Layout spacing is on a 10px grid**: 10 inside a group, 20 between groups, 30
  between sections, 20px screen gutters. The only sub-10 values left are
  typographic — a heading and the line directly beneath it are one unit, not
  two, and get 2–4px.
- Type scale moved up throughout. Body 15px, row titles 17px, section headings
  20px bold ink, screen titles 28px. v1's 12–13px muted labels were below the
  mockups' floor.

### Safe areas

The screen container now pads by `env(safe-area-inset-top) + 20px`, so an
installed launch clears the notch or Dynamic Island instead of running the
header underneath it. Sheets cap their height at
`100svh - env(safe-area-inset-top) - 20px` for the same reason. In a browser tab
both resolve to the 20px base, since the browser chrome already does the job.

### Tab bar

- The pill is `surface` with an outline; the **active tab is a `canvas` pill
  with an ink edge**, matching the segmented control.
- Tab icons are **filled**, not stroked — the one place the icon set departs
  from single-stroke. The gear is generated rather than hand-authored, because
  eyeballing 32 path points produces a visible wobble at 22px.
- Add button and bar are both 68px.

### Progressive blur under the tab bar

Content scrolls underneath the floating bar, so without treatment the bar sits
on live text and both become hard to read. Four banded `backdrop-filter` layers
(1 / 3 / 7 / 14px), each masked to its own window, ramp the blur toward the
bottom edge; a single blurred layer with one mask shows a visible seam where the
mask crosses 50%. A black gradient scrim rides on top — 13% at the bottom in
light, 62% in dark — giving the bar an edge to sit against. It is decorative, so
it is `aria-hidden` and `pointer-events: none`.

### Two structural fixes found while doing this

**`.panel` split out from `.card`.** `.card > * + *` draws the row dividers, so
a card used as a padded container for a laid-out block ruled a line between
every child of that layout. The weight chart, the weekly averages, the serving
preview and the notice component are `.panel` now: same surface and outline, no
dividers.

**The toast host was swallowing taps on the tab bar.** It spans the full width
at `z-[80]` and its bottom padding overlaps the add button; its children opted
into pointer events but the host never opted out. After the first toast — that
is, after your first log of the day — the add button silently stopped working.
It is `pointer-events: none` now.

---

## v1.0.0 — initial build

### The system as locked

A neutral, near-monochrome interface where colour carries exactly one job.
Black, white and grey do all the structural work. The only saturated colour in
the app is macro identity.

**Neutrals** — `ink #232323`, `canvas #F0F0F0`, `surface #FFFFFF`,
`muted #717171`, `hairline #D8D8D8`.

**Macros** — calories `#44A057`, protein `#5075BE`, fat `#CAAF3A`, carbs
`#CD493D`. All four sit in a 45–60% lightness band, which is why they read as
one deliberate set rather than four unrelated brights.

Three rules that keep it from going tacky, all of which held through the build:

1. The four hues appear in exactly two places: progress bar fills, and the
   single-letter suffix on macro values.
2. The order is fixed everywhere: calories, protein, fat, carbs.
3. Nothing else in the app is ever red, because carbs own it.

Dark mode inverts neutrals only (`#141414` / `#1E1E1E` / `#F0F0F0`). The macro
hues do not move and were not brightened.

---

### Decisions the mockups did not cover

**Progress bar height: 16 px, uniform across calories and macros.**
The overshoot chip has to sit legibly *inside* the fill, and 16 px is the
smallest height that allows a 12 px chip with 10 px text. Making the calorie bar
taller than the macro bars was tried and rejected — a uniform height keeps the
block reading as one system, and the calorie bar already carries more weight
from the display number above it.

**Overshoot chip: a 26%-black overlay pill with white text, inside the fill.**
Going over fills the track completely and shows the excess as `+117`. No colour
change, no error state. Confirmed against real data at `2911 / 2837`.

**Destructive and error states are ink and grey.**
Resolving the flag raised in the brief. Delete confirmations, the offline
notice, the storage-unavailable screen, and every "this looks wrong" warning on
imported nutrition data are neutral. There is no second red in the app.

**A "remaining" number was not added.** `2504 / 2837` covers it.

---

### Deviations from the written spec, with reasons

**Secondary action buttons in the Add sheet are `surface`, not "light grey".**
The spec asks for Scan in solid dark with the other two "in light grey". The
sheet's ground *is* light grey (`canvas`), so grey-on-grey would disappear. They
use `surface` white, which is already the established treatment for an
unselected control elsewhere in the app (chips, segmented controls). The
intent — neutral, clearly unselected, visibly secondary to Scan — is preserved.

**Segmented controls carry two ground variants.**
Same problem in reverse: a white track vanishes on a white card. `on: 'card'`
switches the track to `canvas`. No new colour, just the existing two neutrals
swapping roles by context.

**The serving sheet's unit toggle uses bare unit names.**
It first read `serving (1 scoop (30 g))`, which nests parentheses, wraps to two
lines, and squeezes the adjacent `g` segment into a sliver. The segments are now
`servings` / `g`, and the serving definition moved to a hint line under the
amount field: `1 serving = 1 scoop (30 g)`.

**The serving sheet shows calories once, not twice.**
The live preview was printing the calorie total as the display number *and*
again at the head of the macro line. The macro line now omits calories there.

**The food detail nutrition table drops the colour-coded letter suffix.**
"Calories cal" reads badly, and the table's label column already uses full
words. Colour identity in that view is carried by the macro line directly above
it. This is the one place a macro value appears without its coloured letter, and
it is deliberate.

**A pin affordance was added to the serving sheet.**
The spec puts favourites management in Settings, and it stays there — reorder,
rename and unpin all live in Settings → Favourites. But the moment you realise
you eat something constantly is the moment you are logging it, not the next time
you open Settings, so the serving sheet carries a star. Same icon, same filled
state convention as the food detail view.

**Type is the system grotesque stack, not a webfont.**
SF Pro on the target device is a neo-grotesque with tabular figures, costs
nothing to load, and cannot fail offline. Tabular lining figures are on
globally, so every number that updates live or sits in a column holds its width.

---

### Motion

Implemented as specified — fires once, in response to the user, then gets out of
the way. Bar fills 250 ms ease-out, numbers count up over 200 ms, sheets slide
up with the background dimming behind, swipe-to-reveal tracks the finger with no
spring. All of it collapses under `prefers-reduced-motion`.

One correction during the build: bars and the calorie total were replaying their
entrance animation from zero on *every* re-render, because screens rebuild their
subtree whenever data changes. They now remember their last drawn value and
animate from it, so logging one more item ticks `2255 → 2489` rather than
restarting at zero. The spec said "animate on value change only"; this is what
that actually requires.
