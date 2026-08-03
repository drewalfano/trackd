# Design process — turning this into a UI project

A working plan for taking the app from "clean but characterless" to something
with a point of view. Structured so the decisions stay mine and the production
can be delegated.

Division of labour, applied throughout:

| Mine | Delegated |
| --- | --- |
| The thesis | Reference gathering |
| Which variants die | Building variants to react to |
| Aesthetic calls | Implementation |
| The writing | Contrast / a11y checking, hostile critique |

The test for whether this is still my project: **can I defend every decision
without attributing it?** If yes, it's mine no matter who typed. If no, it isn't,
no matter who typed.

---

## Phase 0 — Pick the thesis

~1 hour. Alone. No screens, no code.

One sentence: *what does this app believe that other trackers don't?* Everything
downstream gets judged against it, so it has to be something I actually hold, not
the one that sounds best.

Candidates already latent in the codebase (pull the exact comments — they're the
raw material):

- **Nothing here judges you.** "Over is information" — no red, no error state, no
  streaks, no shame. Every mainstream tracker is punitive; this one isn't.
- **The app admits what it doesn't know.** The trend refuses to draw through two
  points. Data has *confidence* and *provenance*, and both are visible.
- **A log is a record, not a feed.** Entries are snapshots; editing a food doesn't
  rewrite history.
- **You eat at times, not at meals.** Morning / afternoon / night, already in the
  data model and currently invisible in the UI.

**Done when:** the sentence is written down, and I can name one thing the design
must therefore do and one thing it must therefore refuse.

---

## Phase 1 — Reference and vocabulary

~2 hours. This is the phase that substitutes for "having taste."

1. Collect **15–20 images**. At least 5 from *outside* app design. Not Dribbble —
   Dribbble is where portfolio-bland is manufactured.
   - Apps worth mining for structure: Apple Fitness / Health / Sleep / Weather,
     Flighty, Copilot Money, Gentler Streak, Things, Bear, Oura.
   - Outside app design, especially for a confidence/uncertainty thesis:
     hurricane cones, election forecast fans, Bayesian posterior plots, Tufte,
     lab notebooks, aircraft instrument panels, transit maps, book typography.
2. For each, write **one sentence naming what's doing the work.** Not "I like
   this." Mechanical and specific:

   > *Fitness rings work because the labels are tiny and the marks are huge — the
   > data outweighs the frame by 10:1, and there is no container at all.*

   This is the actual skill, and it's learnable in an afternoon. Twenty of these
   sentences is a vocabulary I didn't have that morning.
3. Sort the sentences into **moves I could steal** vs **moves that belong to that
   brand.** Steal skeletons; never surfaces.

**Done when:** 20 annotated references, and 5–8 reusable moves written as
instructions to myself.

---

## Phase 2 — Rules

~1 hour. Alone, then critiqued.

Write **five rules** for this app's visual language. The important distinction:

- **Prohibitive rules** prevent ugliness and produce clean, characterless work.
  Existing examples: *"one radius, 24px on everything that is not a pill"*,
  *"colour only ever means macro identity."* These are why the app currently
  reads rigid — a ruleset that can only remove converges on tasteful blandness.
- **Generative rules** force invention. Existing example: *"over is
  information"* — that one rule produced the overage segment, the only element
  in the app that couldn't have come from a component library.

Target: at least three of the five generative. Keep the humane prohibitions,
retire the arbitrary ones.

**Done when:** five rules written, each labelled generative or prohibitive, and
each traceable to the Phase 0 thesis.

---

## Phase 3 — The hero

The biggest single lever. Apple spends its whole quality budget on one element
per screen and makes everything else nearly free; this app currently spreads it
evenly across a dozen outlined containers, which is why nothing looks expensive.

1. **Pick the one element** that carries the thesis. Strongest candidate: the
   four macros drawn as **one composed object** rather than four independent
   bars — protein, fat and carbs *sum* to the calorie total (Atwater;
   `kcalFromMacros` already computes it). One object means colour appears in
   exactly one place and is doing real work.
   Runner-up: the weight trend, drawn *as uncertain* rather than hidden behind an
   apology in a notice box.
2. **Volume, not precision.** ~20 variants, ugly and fast, side by side on one
   page. Something appears around #14 that can't be reasoned to directly. This is
   the part everyone skips and it's the part that works.
3. **Kill ruthlessly.** 20 → 3 → 1. Say why each one dies, in whatever words come
   out; vague is fine and can be translated. The reasons are the case study.
4. **Three refinement rounds** on the survivor.

**Done when:** one element I'd put on the portfolio's first slide, plus the
rejected sheet kept — reviewers care about the rejects more than the winner.

---

## Phase 4 — System

Propagate outward from the hero. Decisions to make explicitly, each written down
with a reason:

- **Strokes or fills, not both.** Currently every element has a grey fill *and* a
  1px ring — a dozen visible hairlines on the Today screen, so nothing recedes.
  Pick one encoding. If strokes go, fills get slightly stronger to compensate.
- **Type scale with real contrast.** The rigidity is partly that everything is
  near the same size. Apple screens run 60px against 11px.
- **Spacing rhythm.** Intra-group 2–4px so a label binds to its number;
  inter-group 32–40px. Even 10px everywhere reads as a list, not a composition.
  Retire the "everything on a 10px grid" rule if it's fighting this.
- **Colour rationing.** Decide where the four hues are *allowed*. Note the live
  tension: the spec says colour means identity and never state, but green
  calories and red carbs are so culturally loaded they editorialize anyway.
- **Fix the known inconsistencies.** `caloriesBlock` is number-then-label;
  `macroRow` is label-then-number. The `+` button is a detached Material FAB.
  Text buttons are underlined, which is a web convention.

**Done when:** `styles.css` tokens updated, and each change has a changelog entry
with the reason.

---

## Phase 5 — Screens

Apply the system in order of visibility: **Today → Weight → Log → Foods →
Settings → sheets.** Every screen answers: what is the one thing here, and what
is deliberately cheap?

Screenshot each before and after. The before/afters are the case study spine.

---

## Phase 6 — Motion

Highest polish-per-pixel lever in existence, and it adds no visual weight.

- **Springs, not cubic-beziers.** Currently one 250ms curve and a count-up.
- **Animations originate from the thing that was touched**, not from the centre of
  the screen.
- **Interruptible.** A second tap mid-animation must not queue.
- Keep the existing rule: fires once, in response to the user, no ambient motion.

---

## Phase 7 — Case study

Write it myself, in the voice already established in `CHANGELOG-visual.md`. That
file is the rare half of a portfolio piece — a decision log written *as it
happened* rather than reverse-engineered afterwards.

Structure reviewers look for:

1. **Problem** — and specifically why existing trackers get it wrong.
2. **Constraints** — single user, local first, offline, one hand, often rushed.
3. **Thesis** — the Phase 0 sentence.
4. **Explorations** — *including the rejected sheet.* This is the part that
   separates a real case study from a pretty picture.
5. **Decisions** — with the reasoning, pulled from the changelog.
6. **Craft evidence** — the contrast ratios enforced in `npm test`, the synthetic
   tabular figures, the progressive blur. Measured, not asserted.
7. **Outcome** — before/after, and what I'd do next.

State the tooling plainly: directed the design, used AI for exploration and
production. That reads as competence; hiding it is the only real risk.

---

## Appendix — critique vocabulary

For turning "something feels off" into something actionable. The words are the
skill; the eye follows.

- **Weight** — how much ink an element carries. *"The stroke is heavier than the
  label it contains."*
- **Contrast** — difference in any dimension: size, weight, colour, density. Low
  contrast is what reads as *rigid* or *monotonous*.
- **Hierarchy** — the order the eye is forced into. Squint: what's first, second,
  third? If that's not the intended order, hierarchy is broken.
- **Density** — information per area. Uniform density reads as a form; varied
  density reads as a dashboard.
- **Rhythm** — the pattern of the gaps. Even gaps make a list. Varied gaps make a
  composition.
- **Figure / ground** — what's object, what's background. Ambiguity here is
  exactly why "grey fill *plus* ring" feels muddy.
- **Grouping / proximity** — near things read as one unit. A heading 10px from its
  number is not bound to it.
- **Ink-to-data ratio** — how much of the drawing is data vs frame. The current
  bars are mostly frame: track ring, gutter, fill ring, then finally the data.
- **Optical vs mathematical** — centred by measurement vs centred by eye. Caps,
  round glyphs and icons all need optical correction.
- **Tension** — deliberate near-misses. Everything aligned is rigid; nothing
  aligned is chaos; one intentional break is composition.
- **Recede / advance** — what falls back, what comes forward. *"Nothing recedes"*
  is the single most accurate criticism of the current screen.
- **Affordance** — does it look like it can be pressed.

Useful phrasings to reach for: *the frame is louder than the content* · *this
reads as an error state* · *it's evenly loud* · *the label and the number aren't
bound* · *the corner is fighting the height* · *there's no quiet here.*

### How to review a variant sheet

- **Squint** until detail is gone. Only structure survives — judge that first.
- **Cover** the winner and see if the runner-up is better without it adjacent.
- **Flip horizontally.** Breaks reading habits and exposes imbalance.
- **Look at it on the actual device, at arm's length.** Half the things that look
  crisp at 100% on a laptop look grubby at 3x in a hand.
- **Sleep on it.** Anything that survives the morning is real.
