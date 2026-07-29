# Visual changelog

The visual system is locked to the v1 mockups. Every change to it gets logged
here with the reason, because the record of what moved and why is part of the
case study, not a byproduct of it.

---

## v1.1.3 — tab bar placement, and a shorter fade

Measured off the Figma frame rather than estimated.

- **The bar sits 20px from the bottom and 20px from each side.** A flat inset,
  deliberately *not* `safe-area-inset-bottom`. That inset is 34pt on this device
  and is sized for content running edge to edge; adding it on top of a gutter
  pushed the bar ~54px up, which is what made it look like it was floating too
  high. A floating pill only has to clear the home indicator, which occupies
  about the bottom 13pt, so 20px clears it with room to spare.

- **The fade is 159px, bottom-anchored** — the exact height of the blur rect in
  the frame — where it had been 260px and washed out most of the log card.

- **The blur itself is much lighter**: three compounding layers reaching ~6px,
  down from four reaching ~25px. The Figma effect is a progressive blur of
  0 → 4, and the depth there comes from the gradient fill layered over it, not
  from the radius. Heavy blur reads as frosted glass; this reads as content
  receding. The veil ramps harder to compensate for the shorter band.

`--nav-inset`, `--nav-height` and `--nav-fade` are now shared custom properties,
so the screen's bottom padding and the toast's offset track the bar instead of
each hard-coding their own copy of the arithmetic.

---

## v1.1.2 — Inclusive Sans, and the type scale

### The family

**Inclusive Sans**, self-hosted rather than linked from Google Fonts, because a
webfont request in front of first paint is the one dependency this app cannot
have. Both files are the variable font — a single 300–700 axis covers Regular
and SemiBold — so the whole family is 46 KB. `latin-ext` is included on purpose:
Open Food Facts returns a lot of French and German product names, and without it
they would render in the fallback mid-list. OFL, license bundled.

Vite hashes the woff2 files into `assets/`, so the service worker picks them up
in the precache automatically and the font survives a cold offline launch.

### The scale, measured off the mockups

| | size | weight |
|---|---|---|
| calorie total | 48 | SemiBold |
| screen titles | 30 | SemiBold |
| section + macro labels | 16 | SemiBold |
| body, `/ 2837`, values | 16 | Regular |
| log row titles | 14 | SemiBold + Regular |
| macro line | 12 | Regular |

Five steps, and everything bold is now SemiBold (600) rather than Bold (700).

This is a step *down* from v1.1.0, which had run the scale up to 20px section
headings and a 15px macro line. That was a mistake I made reading the mockups at
low zoom — the real values were smaller, and Inclusive Sans carries enough
x-height that 12px holds up where the old system-font scale needed 15px.

### It has no tabular figures

The brief requires tabular lining figures throughout, because every number in
this app either updates live or sits in a column. Inclusive Sans has no `tnum`
feature — `font-variant-numeric` is measurably a no-op in it, and its digits vary
by **0.165em**, which is about 8px per digit at 48px. A four-digit calorie
count-up would have wobbled by ~30px.

So digits get a synthetic fixed advance instead: `.tnum > .d` sets each digit to
0.66em (the width of its widest glyph, `0`) and centres it. Every four-digit
value now measures exactly the same width. Applied only where position matters —
the calorie count-up, the history calorie column, the weekly averages, the weight
readouts, and the macro target line. Numbers inline in running text keep the
font's natural proportional spacing, which is what it was drawn for.

### Green

The mockups specify `#278544` for the Calories label. It is 4.64:1 on the white
page but **4.07:1 on the grey cards**, where the `cal` suffix in every log row
lives, so the token stays `#2A7340` — a hair darker, and 5.08:1 on grey. Same
reasoning that moved gold from `#8C7000` to `#7A6200` in v1.1.1.

### Frame

Layout is verified at **402 × 874** (iPhone 17 Pro), which with 20px gutters
gives the 363px content width the mockups are built on.

---

## v1.1.1 — overage segment, and a measured palette

### Overage is a segment of the bar, not a chip on it

Was a small pill floating inside the fill. Now a full-height segment of the
macro's darker shade, butted against the right end of the fill and clipped to
its cap by the fill's own `overflow: hidden`. The bar is one object that changes
tone where it passes the target, which is both closer to the mockups and a
better description of what actually happened.

It also fixes the legibility problem. White on a *fill* is 2.10:1 on gold and
3.28:1 on green — both unreadable. White on the darker shades runs 4.74:1 to
6.54:1, so putting the label on the darker segment is what makes `+7` work on
the gold bar at all.

### The palette is now measured, not chosen

Gold moved to `#D2B02A` as the fill. Every macro is three values:

| | fill | edge — stroke + overage | text (light) | text (dark) |
|---|---|---|---|---|
| calories | `#44A057` | `#2A7340` | `#2A7340` | `#44A057` |
| protein | `#5075BE` | `#3D5C9C` | `#3D5C9C` | `#7E9FD6` |
| fat | `#D2B02A` | `#7A6200` | `#7A6200` | `#D2B02A` |
| carbs | `#CD493D` | `#B42A2A` | `#B42A2A` | `#E2796E` |

**A fill is never used as type.** The obvious version of this rule — "measure it
on white" — is wrong, and measuring caught it: the `P`/`F`/`C` letters mostly
appear inside log rows, which are the grey `#F0F0F0` card, not the white page.
Against grey, all four fills land between 3.98:1 and 4.16:1 and every one of
them fails. The edges clear 5.0:1 there.

That is also why gold's darker shade is `#7A6200` rather than the `#8C7000` in
the brief. `#8C7000` is correct for the white page at 4.74:1, but it is 4.16:1
on a card. Two steps darker clears both grounds.

Dark mode inverts the problem — the darker shades sink into the ground, where
protein and carbs only reach 3.66:1 — so macro *type* lifts to a tint there. The
**fills still never move between themes**; only type does.

`--color-muted` went `#717171` → `#6B6B6B` for the same reason: 4.28:1 on a card.

### It is a test now, not a claim

`npm test` reads the hexes out of `styles.css` and checks 21 pairings — every
macro as type on both grounds in both themes, white on all four overage
segments, and ink and muted on both grounds. Changing a colour without
re-measuring it fails the build. Colour is the one part of this system where
"looks fine" and "is legible" genuinely diverge; the gold fill reads perfectly
as a bar and is unreadable as 15px type.

### Blur with depth

The four fixed bands read flat because the eye finds the seams between them. The
layers now compound — each is a stacked sibling that re-blurs the output of the
one beneath, so radii accumulate downward to roughly 28px at the bottom edge and
taper to nothing. Radii double while mask windows halve (`BLUR_RAMP` in
`main.js`), since perceived blur scales with the square root of the summed
radii, not linearly. The fade is 170px → 260px.

The scrim is two layers now. A veil in the **canvas** colour, so content
dissolves into the page rather than being greyed out — that is what makes the
bar read as floating above a surface instead of pasted onto one. Then a low
black gradient that only really shows in the last 60px, giving the bar an edge
to sit against.

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
