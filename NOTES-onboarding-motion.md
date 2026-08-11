# Onboarding motion — the flow that both audits missed

Written and built 2026-08-11. Companion to `NOTES-motion-audit.md` (motion that
exists and is wrong) and `NOTES-motion-gaps.md` (motion that is not there). This
is the second kind, on the one screen neither pass covered.

Judged against iOS at 390pt, per `runs-as-ios-pwa`.

---

## Why it was missed

Both audits swept the app. Onboarding is not the app — it is the thing that runs
before the app exists, mounted straight into `#app` at first launch and as a
fixed overlay for the Settings preview. It owns its own chrome, so none of the
shared surfaces the audits inventoried (`.sheet-panel`, `.tab-pill`, `#view`)
appear in it. Search either document for "onboarding" and you get one hit: the
bubble field, which is ambient and was already right.

So the app's most heavily-designed screen — six screens' worth of copy arguing
its own case in the source — had no motion at all between its parts. That is the
first impression, and it is where a new user forms their opinion about whether
this thing is built or assembled.

## What it looked like before

Six screens. Between any two of them, on one frame:

- the entire body replaced by `repaint`
- the progress bar rebuilt as five fresh spans with a new `background` on each
- the step label's text node overwritten
- the footer torn down and rebuilt, including the button that never changes

Nothing transitioned, because after `repaint` there is no element left that was
there before. That is the structural cause `NOTES-motion-gaps.md` opens with,
and it applies here harder than anywhere: five of the six frames in this flow are
a total replacement.

Two secondary faults fell out of the same rebuild:

- **`body.scrollTop = 0` on every render, including self-repaints.** Tapping
  "Rather not" near the bottom of *About you* scrolled you to the top to watch a
  notice appear off screen.
- **A double gap under Sex.** The conditional notice was an always-present empty
  `<div>` in a `gap-[20px]` column, so its two gaps stacked to 40px whether or
  not it had anything in it.

Neither is motion. Both were only visible once the motion made them visible,
which is the usual way round.

---

## The two rules that decided everything

Both were already written in `styles.css`. Nothing here is a new principle.

### 1. The chrome is the frame, not the payload

From `view-in`:

> A nav bar that moves when you change tabs is the tell that a web app is
> animating a document rather than swapping a screen.

So the header does not move. The chevron, the step label and the progress bar
hold position through every step change, and only the body under them travels.

What the chrome **is** allowed to do is show its own value changing, which is a
different claim. The bar fills. The label swaps. Neither moves the frame, and
both are the chrome reporting on itself rather than being carried along.

That distinction is the whole design of the header, and it is why the step label
gets `.reading-swap` — the class written for the calorie card's mode toggle,
whose argument is *the instrument stayed put, the reading on it changed*. A
"Step 2 of 5" becoming "Step 3 of 5" is exactly that sentence.

### 2. Only what changed may move

From the `motion-asserts-change` memory. Enforced in four places here:

| Where | How |
|---|---|
| Progress segments | `--fill` is written only on the segment whose value differs. Four of five are untouched, and a transition on a property nobody wrote does not run. |
| Step arrival | A step repainting *itself* — choosing a sex, picking a goal — calls `render(index)` with `from === index`, so it gets no slide. Only a real navigation animates. |
| The calculated target | `countTo` compares `from` to `to`. Go back, change nothing, return: the number does not move. |
| The primary button's word | `setPrimary` returns early when the label is unchanged, which it is on four of the six screens. |

The pattern in every case is *do not write*, rather than *write a suppression*.
A flag that says "hold still" is a second thing that can drift out of sync with
the first; not touching the property cannot.

---

## What was built

### The step transition — the one directional change in the app

`view-in` is vertical and `panel-in` gave up its slide entirely, both because
neither knew which way it was going: `view-in` serves three sibling tabs *and*
pushed screens, and sheet panels push and pop through one function.

This one knows. The screen is numbered, there is a bar under the number filling
left to right, and a chevron in the corner whose only job is to say which
direction back is. A step arriving from the right and leaving to the left agrees
with three things already on screen rather than inventing a fourth.

```
220ms  cubic-bezier(0.25, 0.46, 0.45, 0.94)
       translateX(±10px) → 0
       opacity 0.65 → 1
```

**10px, not the 16 the sheet panels tried.** That slide was built and pulled on
device feel, and the finding underneath it was that the panel was also *resizing*
— 16px of travel laid over a 94px height snap, which no easing on the contents
could cover. Nothing resizes here: the body is a fixed-height scroller between a
fixed header and a pinned footer. So the distance only has to be big enough to
read as movement. `view-in` reached 6px from the other side after 4px turned out
to be a flicker; 10 is that plus the room a horizontal axis needs, since the eye
tracks sideways motion across a shorter span than vertical.

**Quad-out, not the house expo-out.** Expo-out read as a bounce on an arriving
screen in both places it was tried. `panel-in` carries that argument.

**220ms** sits between `view-in`'s 200 and the sheet's 260 — more than a tab
switch (the whole question changed), less than a modal (the container did not).

**There is no exit half**, and that is a constraint rather than a decision.
`repaint` has already replaced the body before anything could play. Same wall
`panel-in` ran into.

One thing the slide needs that a vertical one would not: `.step-body` takes
`overflow-x: clip`. An `overflow-y: auto` box will not hold `overflow-x:
visible` — the visible axis computes to `auto` — so without the guard a 10px
translate becomes 10px of page the user can drag off the left edge. `.day-deck`
reached for the same guard one screen over.

### The progress bar — filling rather than recolouring

It was five spans whose `background` was rewritten per render. That is a bar
reporting a position; the point of a progress bar is to show that you **moved**,
and a colour swapped on one frame cannot.

The five are now built once and kept. Only the one that changed is written.

**`scaleX`, not `width`** — audit 1's finding 8, taken as read. The rounded-cap
distortion that made that finding expensive for `.kbar-fill` costs nothing at
this size: the radius is 1.5px on a 3px bar, and there is no chip riding inside
the fill needing a counter-scale.

**`transform-origin` is set by the direction of travel, and that is the idea.**

- Forward: the segment fills from its **left** edge — the way you are heading.
- Back: it drains toward its **right** edge — the way you came.

Same element, same 260ms. The bar now says which way you moved rather than only
how far along you are. A fill that always grew from the left would run the film
backwards on a back gesture, which is the specific thing that makes a progress
bar read as a readout instead of a place.

260ms is the sheet's number rather than the 200 of a frequent control: this runs
once per step with a whole screen changing beside it, and at 200 it finished
before the step had settled — two events where there was one.

### The footer stops being rebuilt

The largest structural change, and it is mostly not an animation.

The one control on screen for the entire journey — bottom of the viewport, under
the thumb, same shape and same job on all six screens — was destroyed and rebuilt
five times. Nothing about it changed except the word inside it on the last step.
`motion-asserts-change` cuts both ways: a thing that did not change should not be
*replaced* either. The rebuild also discarded `data-pressed` mid-press, so a
finger held across a step change lost its dip.

Now: one button, one label span, and the only things written per step are the
text and the handler. The label swap gets `.reading-swap`, for the same reason
the step label does.

The secondary slot below it — *Skip for now* on the welcome screen, *Discard the
preview* on the last step — is a `revealSlot`, so it opens and closes instead of
the footer changing height on one frame and shoving the primary button up under
the thumb reaching for it.

### `revealSlot` — blocks that appear because of the choice above them

Two of them: the note under "Rather not", the rate control under Lose or Gain.
Both used to arrive at full height on the tap frame, pushing everything below
down 60–140px with nothing in between. That is gaps item 4's complaint pointed
the other way — a layout that jumps has thrown away the evidence of what caused
it to jump, and here the cause is a control the user is still looking at.

`grid-template-rows: 0fr → 1fr`, the app's existing way of collapsing without
measuring, already carrying the deleting row and the draining toast stack.

Three details worth keeping:

- **The child needs `min-height: 0`** or it refuses to go under its own content
  height. This is the part that is easy to leave out and then looks like the
  transition simply not working.
- **The opacity is shorter than the height and starts after it**, so the words
  become readable once there is a box to read them in. Reversed reads as two
  animations fighting over one event.
- **Closing keeps its children for the length of the collapse.** Emptying first
  would give you an empty gap closing, which says the opposite of what happened.

The negative margin on `.reveal` is not a hack — it is the flex gap being paid
for. A collapsed slot is zero pixels tall and still a child, so a 20px column gap
lands on both sides of it. `--reveal-gap` lets the column state its own spacing
rather than having it assumed here, and it transitions on the same curve as the
rows because it is the same movement.

### The calculated target counts

The one figure the whole flow was for. Four screens of questions resolve to it,
so arriving at full value on frame one delivers it as a fact that was always
there.

`countTo`, 200ms — the same instrument and the same number as Today's calorie
hero, one screen earlier. The memory has to live outside the node
(`lastCalcKcal`) because step five is rebuilt from scratch on every arrival,
which is the same problem `lastKcal`, `lastPct` and `lastSegmentPill` each solve
one screen later.

**It counts from zero the first time and from the old figure afterwards, and the
difference is the point.** First arrival: the number is new information and there
is nothing to count from. Coming back after changing your activity level: the
number *moved*, and how far it moved is the useful part — 2,140 → 2,390 is a
different fact from 2,140 → 2,150, and only one of them was worth going back for.
Change nothing and return, and `from === to` stops it dead.

Reset per flow rather than per module, so opening the preview twice shows the
number arrive twice. The second viewing is a first viewing.

### `.segment` gets its press dip — audit 1, finding 11

Shipped here because onboarding leans on this control hardest: three of its five
questions are asked with it, and on those three it is the only thing on the page
you can touch.

`scale(0.96)`, not `.btn-primary`'s 0.97 — a segment is a third of a row rather
than the whole of one, and the same ratio on a smaller box reads as less. The
scale numbers in this file already vary by control size on purpose (0.92 circles,
0.97 pills, 0.9 calendar day); this is that rule, not an exception to it.

`pressable()` rather than `:active` alone, for the reason at `dom.js`'s note on
it — iOS does not hand `:active` to these reliably, and a press state that
appears on some taps is worse than none. The CSS carries both selectors so a
pointer still gets it.

**The colour transition is the smaller half and the more visible one.** The pill
takes 300ms to travel and the label ink was switching on frame one, so for a
fifth of a second the destination read as selected while the selection was
plainly still somewhere else. 200ms sits inside the pill's 300 without chasing
it.

This is app-wide, not onboarding-only. It is the finding the audit already
wrote; onboarding is only the reason it finally got built.

---

## What was deliberately left alone

Recording these so they do not get "fixed" later.

- **The bubble field.** Ambient, correct, and already parked under reduced
  motion. It is also the one thing on the welcome screen doing the job the
  welcome screen exists to do.
- **The welcome screen's body arriving.** It is the first frame of the app's
  entire life. There is nothing for it to have replaced, and a screen that fades
  in on cold boot is a screen that looks like it is loading — which is the one
  thing a local-first app should never look like (`main.js:59`, again).
- **The number fields on step five.** Typing into Calories updates the derived
  line under it. That line is being *corrected*, not delivered; a count-up on it
  would animate the consequence of a keystroke that has not finished.
- **The rate block's own contents changing** when you switch Lose to Gain. The
  box is already open, so the labels swap inside it while the segment pill
  handles its own continuity. Marking it as well would be two claims about one
  tap.
- **Any exit animation.** `repaint` gets there first; see above.

---

## Reduced motion

Nothing new was needed. The blanket rule at the foot of `styles.css` is
unlayered, so it beats every duration above, and all six additions here are
either CSS animations, CSS transitions, or `countTo` — which branches on
`reduceMotion()` itself.

The one thing worth stating: under reduce, the step transition collapses to a
0.01ms cut, which is exactly the behaviour that shipped before this change. The
flow does not become *less* usable; it becomes what it already was.

---

## Summary

| What | Kind | Value |
|---|---|---|
| Step arrival | new | 220ms quad-out, `translateX(±10px)`, opacity floor 0.65, directional |
| Progress segment | rewritten | 260ms expo-out `scaleX`, origin by direction of travel |
| Step label | new | `.reading-swap`, 180ms |
| Primary button label | new | `.reading-swap`, 180ms; button no longer rebuilt |
| Secondary footer slot | new | `.reveal`, 220ms |
| Conditional blocks (×2) | new | `.reveal`, 220ms + 140ms opacity at 80ms delay |
| Calculated target | new | `countTo`, 200ms, from zero once and from memory after |
| `.segment` press | audit finding 11 | `scale(0.96)` 120ms + colour 200ms, app-wide |
| `body.scrollTop` reset | bug | now only on navigation |
| Double gap under Sex | bug | absorbed by `--reveal-gap` |

Six files' worth of argument, four of them numbers already decided elsewhere in
this codebase. The only genuinely new judgement is the direction — that this is
the one flow in the app that has earned the right to say which way it is going.
