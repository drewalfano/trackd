# Audit — from use

Started 2026-08-03, after the first real day of logging. Annotations made on
device screenshots; this file is the sortable copy.

Distinct from [NOTES-audit.md](NOTES-audit.md), which was written from a read of
the code. This one is written from using the thing, which means it catches a
different class: the problems that only appear with real data on the screen at
8am. Where the two overlap, the overlap is itself evidence.

**The images are the evidence, this is the record.** Keep the frame reference so
each entry can be traced back.

---

## Format

```
### U0 · Short title — severity · verdict
**Frame:** Section N, callout position
**Effect:** what it does to the person looking at it.
**Why:** the mechanism. Not "it's ugly" — what specifically produces the effect.
**Impulse:** the first fix that came to mind. Labelled as an impulse on purpose.
**Verdict:** fix / watch / refuse — and the reason.
`#tag`
```

**Effect / Why / Impulse** is the annotation triad. `Impulse` stays the word:
it marks the fix as a first instinct rather than a decision, which keeps the
observation intact when the instinct turns out to be wrong.

**Verdict is the one that isn't optional.** An audit where every entry resolves
to "fix" is a to-do list. The refusals are what make it a design position, so
they get the same amount of writing as the fixes.

Severity is about **what it costs the user**, not how hard it is to fix — same
scale as NOTES-audit.md.

Tags: `#speed` `#accuracy` `#discoverability` `#data` `#offline` `#scan`
`#looks` `#keep` `#thesis`.

`#thesis` is new here, and it outranks the rest. It marks the entries where the
screen contradicts the Phase 0 sentence rather than merely looking wrong.

Add `+1` to an entry each time it recurs. For a personal app **frequency beats
severity** — a small annoyance fifty times a week outranks a big one hit once.

---

## Before writing these up

Confirm the build. The zero-width macro tick was annotated as live but is fixed
in source at [ui.js:256](src/lib/ui.js#L256), shipped in `8ac37eb` on 2026-08-02
at 21:30 — four minutes before `dist/` was built. If the installed PWA is
serving cached assets, some entries here are already closed, and *that* is the
finding. Check the deployed build before spending anything on this list.

---

## Findings

Transcribed from Section 5, 2026-08-03. **Effect** and **Why** are your words off
the frame; severity and **Verdict** are proposals to overrule.

### U1 · Going over draws a completed ring — high · **fixed**, v1.1.7
**Frame:** Section 5, Carbs ring, `54g over`
**Effect:** the data stops looking alive. Over and done render the same.
**Why:** "the pink bar should overlap itself. it should not be a complete circle
because the data is still there it just went over. similar to how apple handles
this in fitness with the activity rings." Overlapping "shows the data is still
alive, properly displays the data being shown."
**Impulse:** second lap drawn over the first, activity-ring style.
**Verdict:** fix, and first. `over is information` is the Phase 0 thesis, and
this is where the screen contradicts it. The bars already solved this with the
overage segment; the rings regressed it.
`#thesis` `#looks`

**Shipped in v1.1.7.** The strand keeps going past the target, deepening into
the edge shade over a quarter turn rather than switching at 12 o'clock —
*"it is one coiled ring moving upward"*, which killed the first build's hard
seam — and ends on its own round cap. Stops at two laps. Reasoning in
[CHANGELOG-visual.md](CHANGELOG-visual.md).

Three things tried and dropped on the way, all three only decidable by looking:
a drop shadow at the crossing (adds depth to a flat system), a 2px gap
outlining the cap (invisible at 84px, and redundant once the ramp was smooth),
and stepped `color-mix` segments for the ramp (banded at 3x). **Not yet checked
on device.**

Left open: at 103% the second lap is entirely inside the blend and looks very
close to 100%. Working as designed, but it is this same finding in miniature.
`BLEND` in [ring.js](src/lib/ring.js) is the one number that trades those off.

### U2 · Eaten / Remaining is a button doing an indicator's job — medium · **removed**, v1.2.1
**Frame:** Section 5, toggle above `290 left`
**Effect:** redundant, wasting space, and it "glitches on you" rather than
responding.
**Why:** "i want to focus on gestures and showing people that when you tap it
something is happening, it has a purpose. not glitching on you." The control
announces a mode where it should confirm a change.
**Impulse:** "i think we somehow evoke it through something more visual and
tactile. an indicator instead of a button."
**Verdict:** fix — but the impulse is two changes, and they should be separated.
Replacing the button with a gesture is a navigation decision; making the
transition feel tactile is Phase 6 motion. The second is worth doing even if the
first is refused. Note this reverses part of `ef40885`, which is fine — that
commit made the two readings *nameable*, and naming them is not the same as
spending a button on them.
`#looks` `#discoverability`

**Removed in v1.2.1, and nothing replaced it.** Five candidates were built and
looked at rather than argued about: the segmented switch, two paging dots, a
vertical swap glyph, a muted state label in the corner, and the bare tap. The
variant sheet is what killed the middle three — and the dots died to something
only visible once they were on the real card, which is that the deck pages
horizontally with yesterday peeking in at the left, so two dots read as *swipe
for more cards*. A pager indicator cannot be borrowed on a surface that is
already a pager.

The muted label got closest and lost to the card's own rule: the reading is
already stated in words four times over, so a label naming it is a fifth
statement of a fact the card was rebuilt to stop saying twice.

**Split verdict, because the note was two complaints:**

- *"redundant and wasting space"* — **fixed.** The control is gone and the
  header band is 20px instead of the switch's height. The whole card has been
  the toggle since v1.1.6; the switch was a second way to do a thing that
  already worked.
- *"glitching on you"* — **fixed, and it was a real bug.** The calorie count-up
  ran across a mode switch by design (the note above `lastKcal` said so). A
  count means the number changed; on a toggle the number did not change, the
  question did. 4073 winding down to 1236 asserts a thousand calories left the
  day. It cross-fades now, and still counts for anything that IS a data change.
- *"showing people that when you tap it something is happening"* — **partly.**
  Every reading on the card now rises 3px together as one answer to one tap.
- *"an indicator instead of a button"* — **open.** Nothing on screen says the
  card can be tapped, which `.day-card-toggle` has admitted since it was
  written. Left deliberately unsolved rather than solved badly. The cheap thing
  that would settle it is a first-click test, which is one of the methods
  already specced in [NOTES-sitemap.md](NOTES-sitemap.md).

### U3 · The tab bar fade is muddy and starts too high — medium · **fixed**, v1.1.8
**Frame:** Section 5, bottom edge, over the Bananes row
**Effect:** "it catches my eye for the wrong reasons. your eye should go to the
data, not a distraction." Reads as unfinished, thrown together.
**Why:** three separate faults in your note, worth keeping separate —
1. "the blur starts too high. it is blurring text that should be readable."
2. "it goes too dark at the bottom especially in light mode. it feels muddy and
   'dirty'."
3. the whole thing reads unfinished.
**Impulse:** "possibly by switching out black as the colour and looking and
researching alternatives and what competitors do."
**Verdict:** fix. All three are one file: `--nav-fade: 159px`
([styles.css:323](src/styles.css#L323)) is the height, taken from the Figma blur
rect, and `.fade-shade` ([styles.css:1203](src/styles.css#L1203)) is the black
gradient you're reacting to — the comment above it already admits it is "a low
black gradient." The veil is canvas-coloured and is probably not the problem;
the shade is. Competitor research is the right instinct here and it is Phase 1
work — collect before changing the value.
`#looks`

**Shipped in v1.1.8.** Your three sub-notes had three separate causes, which is
the useful part:

1. *Blur too high* — arithmetic, not taste. The band is 159px and the bar
   occupies the bottom 88, so 71px of it was over open page and the mildest
   layer ran the whole height. Now tapers out at 98px, ten above the bar.
2. *Muddy in light* — the black. Black over canvas desaturates rather than
   darkens; #f0f0f0 under 10% black is a dead grey. In dark it pooled *darker
   than the page*, which is why it read as dirt rather than as shadow.
3. *Unfinished* — the consequence of the other two, and it needed no separate
   fix.

The shade is deleted, not retuned: the veil had been left at 92%, and the black
existed only to hide what that last 8% let through. Taking the veil to full
canvas removes both. Five layers to four. **Competitor research not done** —
your instinct to look was right and it stays worth doing, but the bug turned out
to be arithmetic and a wrong colour model, so it would have been research in
support of a decision that had already made itself.

### U4 · Full Log outweighs the section it belongs to — low · **fixed**, v1.2.3
**Frame:** Section 5, `Log` row
**Effect:** "unbalanced and out of place."
**Why:** "the full log button being bigger than the tile title is
unproportionate. the hierarchy is off."
**Impulse:** "maybe we bring up the title font size. or look into other button
size options / method options."
**Verdict:** fix, and it belongs to Phase 4 rather than to a fix list — this is
the type-scale problem, not a one-off. [NOTES-design-process.md:130](NOTES-design-process.md#L130)
already calls it: everything is near the same size, so a button and a heading
compete. Raising the title is the local fix; the scale is the real one.
`#looks`

**Fixed in v1.2.3, both halves of the impulse, and the impulse was right.** The
mechanism was narrower than "everything is the same size": `.section-label` was
16px doing two different jobs, heading a section and captioning a field in a
sheet. Same size for both leaves physical mass as the only hierarchy signal on
that row, and a 34px stroked pill wins that against a 16px word. Headings are
20px now, scoped to `.section-head` so only the heading job moves; the pill is
30px and 14px of padding, with its stroke untouched, because the contrast was
never the problem.

**The scale is still open.** This raised one step; it did not build a scale, and
the reason a heading and a caption were the same size to begin with is that
there are five steps for the whole app. Phase 4 keeps the entry.

Two things worth carrying forward:

- **`.chip-sm` is a 30px tap target** where it stands alone, under the 44 iOS
  asks for. It was under at 34, so this changed nothing, but it is now written
  down rather than unnoticed. Log's empty block is fine — the whole
  `.block-add` row is the target there.
- **`sectionLabel()` in [ui.js](src/lib/ui.js) is dead** and builds the
  heading-with-action row by hand instead of using `.section-head`, so it would
  not have picked this up. It has no callers. Delete it or point it at the
  class; leaving it is how the next heading gets the wrong size.

### U5 · Item times are hard to skim — low · watch
**Frame:** Section 5, entry rows
**Effect:** "its hard to skim as is right now."
**Why:** "should the item times be in the same position?" They currently trail
the food name, so they start at a different x on every row — the eye has no
column to run down.
**Impulse:** align them.
**Verdict:** watch, not fix. Right-aligning the times is the obvious move and it
costs the food name its full width, which is already truncating ("organic
granola bites chocolate ba…"). Skim is a claim about a task — decide what the
log is *for* first. If it's checking what you ate, names win; if it's finding
the gap in the day, times win. `#speed` on the second reading, `#looks` on the
first, and which tag it takes is the actual question.
`#speed` `#looks`

### U6 · The date header isn't tappable — medium · fix
**Frame:** Section 5, `Today, Aug 3`
**Effect:** history is harder to reach than it should be.
**Why:** "i want to be able to more easily see your history."
**Impulse:** "can we make this tappable to bring up a calendar option? maybe too
when it is on a previous day, beside calendar is a go back to today button."
**Verdict:** fix — but it is a sitemap change, not a screen fix, and it lands on
top of a known correctness bug. Today already shares `state.date` with Log, and
History rows mutating that shared date is unresolved
([NOTES-sitemap.md](NOTES-sitemap.md)). Adding a third way to change the date
before that is fixed multiplies the bug. Fix the shared-date bug first, then add
the affordance. The back-to-today button is the smaller half and can ship
separately.
`#discoverability` `#data`

---

**Six callouts, one screen, ten minutes.** Five resolve to fix and one to watch,
which is a thin refusal rate — the ratio to watch as the list grows, not a
problem yet at n=6.

Three of these are not screen fixes at all: U2 is partly navigation, U4 is the
type scale, U6 is the sitemap. Worth noticing that annotating one screen surfaced
three system-level problems, because that is the argument for the whole method.

---

## Not on any screen

The annotations can only catch what a screenshot holds. These come from the
first-run questions in [NOTES-first-run.md](NOTES-first-run.md) — what went
unlogged, what wasn't believed, how long it took, whether over read as
information or as failure. They expire; the screen problems don't.

_Paste the voice-memo answers here._
