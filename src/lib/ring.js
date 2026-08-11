import { h, s } from './dom.js'
import { progress, MACRO_META } from './compute.js'
import { g } from './format.js'
import { digits, macroColor, macroTextColor } from './ui.js'

/**
 * A mini macro ring.
 *
 * Concentric rings were rejected for the hero because concentric arcs cannot be
 * compared to each other. Equal-diameter rings in a row keep the circular
 * language while staying comparable — the thing concentric rings are worst at.
 *
 * ---
 *
 * **Past target the ring runs a second lap on the same track.** It completes
 * one circle, then the overage draws as a second arc at the same radius and the
 * same width, on top of the first, separated by a hairline knocked out of the
 * ring.
 *
 * This answers the one thing a saturating ring cannot say: at 100% and at 141%
 * it drew the same closed circle, so the mark carried no information at all
 * once the target was reached and the shape of a miss was invisible. The centre
 * reading said it and the `aria-label` said it; the mark did not.
 *
 * Three constraints define the treatment, and each one rules out the obvious
 * alternative.
 *
 * **One hue.** The overage lap is `macroColor`, the same shade as the lap
 * underneath it. No second shade, no tint, no opacity step. Overage here is
 * neutral information, not an alert: over on protein is usually good, over on
 * fat usually is not, over on calories depends on the day, so any treatment
 * that reads as a warning is wrong on at least one of the three rings. It is
 * also structurally impossible to alert-code, carbs owning the only red in the
 * palette. An earlier build used the darker edge shade with a gradient ramp
 * into it; that is what this deliberately reverses.
 *
 * **One end cap.** The lap starts flush at twelve o'clock with no cap and ends
 * in a single rounded head. A rounded cap at the start would be a bulge marking
 * nothing. An incomplete ring has one cap at its head and an overage ring has
 * one cap at its head, a lap further on — same grammar either way.
 *
 * **Same track.** No inner ring, no outer ring, no change of radius or width.
 *
 * Which means the two laps are exactly coincident, and the consequence is worth
 * stating plainly rather than discovering later: the overage lap completely
 * covers the ring beneath it, so the gap cannot sit *between* the strands. It
 * can only run along their flanks. What renders is the overage lap **outlined**
 * against the ring — a cut tracing however far past target you went, ending in
 * a rounded head — not a strand visibly lying on top of another.
 *
 * This passage used to end by arguing that the resulting read is quiet by
 * construction, that quiet is correct, and that the gap is not to be widened
 * chasing anything prouder. That was written from the desktop preview. On a
 * phone at 84px the cut was one device pixel on each flank, which is not quiet —
 * it is invisible, and a mark nobody can see is not making a subtle point. The
 * gap has been widened once, deliberately, and `GAP_RATIO` records where it
 * landed and why.
 *
 * What has NOT changed is everything the original argument was actually
 * protecting: one hue, one track, one cap. Those are still the constraints, and
 * a wider cut does not weaken any of them.
 *
 * The Log sheet keeps saying the same thing a different way, as a `+4` chip on
 * the macro bars. Two visual languages for one concept, which is allowed
 * because the contexts differ — a dense list reads a chip faster, a single
 * glanceable state reads geometry faster. What is not allowed is the two
 * disagreeing about the number, so both now come from `progress().over`.
 */

const SIZE = 84
const STROKE = 10
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

/**
 * The gap, as a proportion of the ring's stroke width rather than a number.
 *
 * The gap is the entire mechanism — with one hue on one track it is the only
 * ink that distinguishes the overage lap from the ring under it — so it is a
 * token that holds if the ring is ever redrawn at another size, not a magic
 * number tuned to 10px and quietly wrong at 12.
 *
 * **0.5, which puts the knockout at 1.5x the ring's stroke and 2.5px proud on
 * each flank.** It was 0.2 — 1.2x, one pixel a side — chosen on a desktop
 * preview where one pixel is a visible hairline. On the phone this actually runs
 * on it is not: at 84px in a hand the cut disappeared into the ring and the
 * over-target state read as a plain closed circle, which is the exact failure
 * the second lap exists to fix.
 *
 * 1.2x, 1.5x, 1.75x and 2x were rendered side by side at true size and at 2.4x
 * before this was picked. 1.5 is the first step where the cut survives the trip
 * to a real screen; 2x reads as a chunk taken out of the ring and starts
 * suggesting a second concentric track, which is still the thing being avoided.
 * The bound at the top of the range is real, so this is a considered value and
 * not a floor to keep raising.
 */
const GAP_RATIO = 0.5
const GAP = STROKE * GAP_RATIO
const GAP_STROKE = STROKE + GAP

/**
 * The viewBox carries headroom the ring itself does not need.
 *
 * At R 37 and STROKE 10 the ring band reaches exactly SIZE/2 — it is already
 * flush with the box on all four sides. The gap is wider than the ring by
 * design, so its outer edge sits GAP/2 past that and would be clipped along the
 * top, bottom and both flanks: the seam would simply stop existing at the four
 * points where the lap crosses an axis.
 *
 * So the box grows by the gap and the drawing origin moves back by half of it.
 * The ring's own geometry is untouched — same centre at SIZE/2, same R, same
 * stroke — and the centre reading stays concentric with it because the wrapper
 * grows by the same 2px.
 */
const PAD = GAP / 2
const BOX = SIZE + GAP

/**
 * The track is the macro's own hue at low opacity rather than a neutral.
 *
 * This is the Fitness-rings move, and it is doing real work here: it means an
 * empty ring still carries macro identity, so a fresh morning reads as three
 * labelled-but-empty rings rather than three identical grey circles. It also
 * removes the last neutral from the mark, so the ring is one hue at two
 * strengths instead of a coloured arc sitting in a grey channel.
 */
const TRACK_MIX = 20

/**
 * The interior fill past target, and it is well under the track's strength — 8,
 * not the 20 the track uses.
 *
 * It started at 20 so the mark would be one hue at exactly two strengths, which
 * is a tidy argument and did not survive measurement. The centre reading sits on
 * this fill, and at 20% it fell through the floor: on a white card the `94`
 * measured 4.16:1 against the fill and `/ 80g` 4.29:1, both down from 5.16 and
 * 5.33 on the bare card and both under the 4.5 this app holds itself to. Fat is
 * the binding case for the figure and protein and carbs for the qualifier, so
 * there is no single macro to special-case around.
 *
 * **The two themes cap it differently, and dark is the tighter of the two.**
 * Light tolerates 10 — its worst case is fat's qualifier at 4.54:1. Dark does
 * not: the same pair measures 4.36:1 there, because `--color-muted` lifts to
 * #949494 while the fill darkens toward the card. 8 is the strongest value that
 * clears 4.5 on both lines, in both themes, on all three macros; the tightest
 * reading anywhere is fat's qualifier in dark at 4.51:1.
 *
 * So the ring is one hue at three strengths rather than two. That is a real
 * cost and it is the smaller one: a legible number on a slightly paler ground
 * beats a tidy palette rule and a figure nobody can read.
 */
const FILL_MIX = 8

/**
 * The shortest arc that still reads as an arc.
 *
 * With a round cap the stroke extends STROKE/2 past each end, so a dash of
 * length L paints L + STROKE of visible ink. Below about one stroke width of
 * dash the two caps meet and the arc renders as a dot sitting at 12 o'clock —
 * which is the same failure the bars had at `width: 0` (v1.1.4), where a
 * zero-width fill collapsed its own stroke into a coloured tick and read as a
 * rendering fault rather than as "nothing logged".
 *
 * So: zero draws no arc at all, and anything above zero draws at least this.
 * The floor overstates very small values by roughly 4% of the target, the same
 * trade the bars made with their 24px minimum fill.
 *
 * UNVERIFIED ON DEVICE. At this size in a hand at 3x, the distance between
 * "barely anything" and "nothing" is exactly what needs looking at.
 */
const MIN_ARC = STROKE

/**
 * Where each ring was last drawn, so a re-render resumes from the previous arc
 * instead of replaying from zero. Screens rebuild their whole subtree on any
 * data change; without this, logging anything would re-run every ring's
 * entrance animation. Same reasoning, and same shape, as `lastPct` for the bars.
 */
const lastLen = new Map()

/**
 * Clip paths are referenced by id, and there are three rings per card and three
 * cards in the deck — so the id has to be unique per instance or nine elements
 * point at whichever definition happened to render last.
 */
let clipSeq = 0

/** Arc length for a percentage, with the zero state and the floor applied. */
function arcLength(pct) {
  if (pct <= 0) return 0
  return Math.max(MIN_ARC, (pct / 100) * C)
}

/**
 * How far round the overage runs, in degrees, clamped at one full lap.
 *
 * Past 360 the lap closes and the distinction it exists to draw is lost again,
 * so it stops there and the centre number carries the rest. Reachable on carbs;
 * effectively unreachable on protein and fat.
 *
 * **Deliberately not passed through `arcLength`.** The floor there exists so a
 * tiny first-lap arc does not collapse into a dot at 12 o'clock, and applying
 * it here would misreport a 1% overage as a 4% one — inventing magnitude on the
 * one mark whose whole job is to report it. A very small overage is allowed to
 * render as very little. It is honest, it scales continuously, and it vanishes
 * cleanly at exactly zero.
 */
function overAngle(over, goal) {
  if (!(over > 0) || !(goal > 0)) return 0
  return Math.min(360, (over / goal) * 360)
}

/**
 * The point on the ring's centreline at a given angle, clockwise from twelve.
 *
 * Computed rather than rotated into place: the heads are fills, not strokes, so
 * they do not ride the `rotate(-90)` the arcs use to start at twelve o'clock,
 * and giving them their own transform would be two ways of saying one thing.
 */
function pointAt(deg) {
  const rad = (deg * Math.PI) / 180
  return { x: SIZE / 2 + R * Math.sin(rad), y: SIZE / 2 - R * Math.cos(rad) }
}

/** The shared circle geometry every arc in here is drawn on. */
const onRing = (extra) => ({
  cx: SIZE / 2,
  cy: SIZE / 2,
  r: R,
  fill: 'none',
  'stroke-width': STROKE,
  // Start at 12 o'clock and run clockwise.
  transform: `rotate(-90 ${SIZE / 2} ${SIZE / 2})`,
  ...extra,
})

/** A round-capped arc of length `from`, on the transition so it can be grown. */
function lap(colour, from) {
  return s(
    'circle',
    onRing({
      class: 'ring-arc',
      stroke: colour,
      'stroke-linecap': 'round',
      'stroke-dasharray': C,
      'stroke-dashoffset': C - from,
    })
  )
}

/**
 * An arc from twelve o'clock through `deg`, both ends square.
 *
 * A dash offset circle, not a path. The rule that forces the head to be a
 * painted disc — `stroke-linecap` applies to both ends of a stroke, so a dashed
 * circle gives two round caps or none — says nothing about the body of the arc,
 * and with `butt` caps and the head painted separately a dash draws it exactly.
 * This is also what keeps the overage lap on the same primitive as the ring
 * below it rather than introducing a second way to draw an arc in one file.
 */
function span(deg, colour, width) {
  const len = (deg / 360) * C
  return s(
    'circle',
    onRing({
      stroke: colour,
      'stroke-width': width,
      'stroke-linecap': 'butt',
      'stroke-dasharray': `${len} ${C - len}`,
    })
  )
}

/**
 * The rounded head, painted AT the end of the strand rather than masked out of
 * a longer one.
 *
 * Every earlier build produced this end by masking an overrun with a disc,
 * which meant the strand had to be painted longer than it was and any change to
 * how far brought the end back square with a bite out of it. Painted, there is
 * nothing for it to be out of step with.
 */
function headAt(deg, colour, width) {
  const { x, y } = pointAt(deg)
  return s('circle', { cx: x, cy: y, r: width / 2, fill: colour })
}

/**
 * The gap's own head, and the one place the two heads are not the same shape:
 * this is the FORWARD half only, flat edge facing back along the ring.
 *
 * A full disc here is what the first build used and it is wrong at small
 * overages, in a way that is invisible in the maths and unmissable on screen.
 * The gap disc is a radius larger than the strand's, so it shows as a hairline
 * ring around the head — correct where the lap runs beneath it, and at 12
 * o'clock there is no lap beneath it. Under about 2.6% over, the disc still
 * reaches back past twelve, so that hairline closes into an unbroken circle and
 * the mark reads as a hole punched in the ring rather than as a bead. At +1g on
 * a 180g target it is the only thing on screen, so the ring's first statement
 * past target is a rendering fault.
 *
 * The half disc fixes it by construction rather than by a threshold. Its flat
 * edge lands exactly where the lap begins, so the knockout can never precede
 * the thing it exists to separate, and what renders at +1 is a crescent hugging
 * the leading edge of the bead — the lap emerging from twelve o'clock flush,
 * which is the grammar the start of the lap is supposed to have anyway.
 *
 * Past the point where the disc clears twelve this changes nothing at all: the
 * half it drops was already covered by the gap arc, which spans the same radial
 * band at every angle the lap covers.
 *
 * Drawn at twelve o'clock and rotated into place. The alternative is to solve
 * for the two endpoints with a sine and a cosine and hand the arc a sweep flag,
 * which is the same shape described in a way that has to be re-derived by
 * anyone reading it.
 */
function gapHead(deg, colour) {
  const c = SIZE / 2
  const r = GAP_STROKE / 2
  return s('path', {
    // Top of the head round to the bottom, bulging forward — sweep 1 is
    // clockwise on screen, which is the direction the lap runs.
    d: `M ${c} ${c - R - r} A ${r} ${r} 0 0 1 ${c} ${c - R + r} Z`,
    fill: colour,
    transform: `rotate(${deg} ${c} ${c})`,
  })
}

function ringSvg({ ratio, over, goal, macro, key, animate, surface }) {
  // The first lap saturates. Everything past it is the second lap's business.
  const pct = Math.min(100, ratio * 100)

  const to = arcLength(pct)
  const from = animate ? (lastLen.get(key) ?? 0) : to
  lastLen.set(key, to)

  // Kept while it has somewhere to animate FROM, so deleting the last entry
  // unwinds the arc instead of snapping it away.
  const hasArc = to > 0 || from > 0

  const track = s(
    'circle',
    onRing({
      stroke: `color-mix(in srgb, ${macroColor(macro)} ${TRACK_MIX}%, transparent)`,
    })
  )

  // Nothing logged draws the track alone. An empty ring is the zero state and
  // does not need a marker to say so.
  const arc = hasArc ? lap(macroColor(macro), from) : null

  if (animate) {
    requestAnimationFrame(() => {
      if (arc && from !== to) arc.style.strokeDashoffset = String(C - to)
    })
  }

  /**
   * The second lap, in five marks and in this order.
   *
   * The gap is PAINTED in the surface colour rather than cut as a hole. A hole
   * is the more self-contained answer — it reveals whatever is behind and so
   * the ring never has to know what it is sitting on — and it is what an
   * earlier build used. It was given up for the same reason the head is painted
   * now: masks in this component had four rebuilds and every fix broke another
   * one, and a mark that is correct on every frame beats a cleverer one that is
   * occasionally wrong.
   *
   * What the paint costs is that the colour has to be right, and the failure
   * mode is loud — a light value hardcoded here draws a bright seam floating on
   * a dark ring. So it comes in as a token that resolves per theme, and the
   * caller can override it, because the ring's surface is a fact about where it
   * was put and not about the ring.
   *
   * The gap arc knocks out the ring beneath the whole overage lap and stands
   * GAP/2 proud on each flank; the gap head does the same for the rounded end,
   * which is why steps 3 and 5 exist at all — they are what produce one round
   * cap on a strand whose stroke is square at both ends.
   */
  const deg = overAngle(over, goal)

  /**
   * The fill tint, mixed against the SURFACE rather than against transparent.
   *
   * Opaque, and that is the whole point. The gap is painted rather than cut, so
   * a semi-transparent value there would wash over the opaque lap beneath it and
   * come out as a lightened orange rather than as the tint. Mixing with the
   * surface produces the composite directly, and it is the same value the fill
   * uses — which is what makes the cut read as the fill showing through the rim
   * rather than as a second colour laid over it.
   */
  const wash = `color-mix(in srgb, ${macroColor(macro)} ${FILL_MIX}%, ${surface})`

  /**
   * The gap knocks through to the FILL now, not to the card — and it is clipped
   * to the ring's outer edge, which it was not before and now must be.
   *
   * It used to paint the card's own colour, because the only thing behind the
   * ring was the card. Past target there is now a filled disc under the whole
   * band, so painting the card colour here would cut a white slot through a
   * filled vessel — the seam would read as damage rather than as depth.
   *
   * **The clip is the direct cost of that.** The cut is deliberately wider than
   * the stroke, so it has always stood GAP/2 proud of the ring on both flanks.
   * While it painted the card colour that overhang was invisible by definition —
   * card colour on a card. Painted in the tint it is not: it renders as a pale
   * halo bulging outside the ring, which is the fill escaping the vessel it is
   * supposed to be inside. Clipping to `R + STROKE/2` is what keeps the tint on
   * the inside of the rim, where it belongs.
   */
  const clipId = `ring-clip-${++clipSeq}`
  const clip = s(
    'clipPath',
    { id: clipId },
    s('circle', { cx: SIZE / 2, cy: SIZE / 2, r: R + STROKE / 2 })
  )
  const lapOver = deg > 0
    ? [
        s('defs', {}, clip),
        s(
          'g',
          { 'clip-path': `url(#${clipId})` },
          span(deg, wash, GAP_STROKE),
          gapHead(deg, wash)
        ),
        span(deg, macroColor(macro), STROKE),
        headAt(deg, macroColor(macro), STROKE),
      ]
    : []

  /**
   * Past target, the hole fills with the track's own tint.
   *
   * The second lap says "over" in geometry, and geometry is read by looking at
   * one specific arc — you have to find the cut and follow it. This says the
   * same thing with area, which is read without looking at anything: the ring
   * that has gone past its target is the one that is filled in.
   *
   * **It is the track's exact mix, and that is the whole reason it is allowed.**
   * `TRACK_MIX` at 20% is already the ring's second strength — the shade an
   * unfilled ring shows. Reusing it adds no new value to the palette, so the
   * mark is still one hue at two strengths. It also inverts cleanly: below
   * target the tint sits in the RING and the hole is empty, above target the
   * ring is solid and the tint sits in the HOLE. The pale shade migrates inward
   * as you cross over, which is one idea rather than two.
   *
   * **It runs to the OUTER edge of the stroke, not the inner one, and sits
   * beneath it.** Stopping at the inner edge is the obvious construction and it
   * is wrong: the fill and the ring then meet along a shared boundary, two
   * antialiased edges on one coordinate, and what renders is a hairline seam
   * that makes them read as a disc sitting inside a separate annulus. Run out to
   * `R + STROKE/2` and the stroke is drawn ON a filled ground rather than beside
   * it — one vessel with a rim, which is the thing being drawn.
   *
   * It also makes the gap honest. With the fill under the whole band, the cut
   * reveals what is beneath the ring instead of punching through to the card,
   * so the seam reads as depth rather than as a hole. See `wash` below.
   */
  const centreFill = deg > 0
    ? s('circle', {
        cx: SIZE / 2,
        cy: SIZE / 2,
        r: R + STROKE / 2,
        fill: wash,
      })
    : null

  return s(
    'svg',
    {
      width: BOX,
      height: BOX,
      viewBox: `${-PAD} ${-PAD} ${BOX} ${BOX}`,
      'aria-hidden': 'true',
      class: 'block',
    },
    centreFill,
    track,
    arc,
    ...lapOver
  )
}

/**
 * Ring with a number in its centre and the macro name beneath.
 *
 * The centre states ONE of two readings, and which one is the card's business
 * rather than the ring's — `mode` comes down from Today, where one switch flips
 * the whole card at once. Consumed reads `115` over `/ 180g`; remaining reads
 * `65g` over `left`. Both are the same shape: the value at full size, its
 * qualifier small and muted beneath, which is what the calorie row does too.
 *
 * The `g` lands once per reading, never twice. In consumed mode that is on the
 * target, because `115 / 180g` is one measurement with one unit and `115g /
 * 180g` is the unit stuttering; in remaining there is only one number, so it
 * takes the suffix itself. Calories never take one in either mode — a bare
 * number under a label that says Calories is not ambiguous about its unit, and
 * `cal` there would be the same stutter.
 *
 * Two lines rather than one because `180 / 300` measures 68.4px in Inter at
 * 15px and the hole gives 62.2px across at that height — every three-digit pair
 * is exactly that wide, the figures being tabular.
 *
 * ---
 *
 * Remaining used to be the only reading, as a negative in the centre: `-159g`.
 * Two things were wrong with it, and neither is a reason not to offer it now.
 *
 * A minus sign reads as debt or as an error even when it means "still to eat",
 * and the same sign carried opposite valences — `-32g` on protein being 32 to
 * go while `-46g` on fat is 46 of headroom, with nothing on screen to say
 * which. That is fixed by the word: `left` and `over` say which, and no sign is
 * needed.
 *
 * And the number ran the wrong way — largest on an empty morning, counting down
 * while the arc filled up, the two halves of one mark moving in opposite
 * directions all day. That is still true of remaining, and it is why consumed
 * is the default. What has changed is that it is now a reading you asked for
 * rather than one the card chose for you, and a number that disagrees with its
 * arc is a very different thing when you were the one who turned it on.
 *
 * The over state needs no special form in either mode: `320 / 300g` carries
 * magnitude past the target by itself, and remaining says `20g` over `over`.
 * No sign is added in either case — a `+` or a `-` in front of these would be
 * the third notation for one fact, on a card whose whole argument is that it
 * states each fact once.
 *
 * Both the number and the name take the TEXT shade, not the fill — a fill is
 * never used as type.
 */
export function macroRing({
  macro,
  value,
  target,
  animate = true,
  key = macro,
  mode = 'consumed',
  swapping = false,
  /**
   * What the gap knocks out to. Every ring today sits on a day card, which is
   * `--color-surface` in both themes, so the default is right everywhere it is
   * currently drawn — and the parameter exists so that stops being an assumption
   * the moment one is drawn somewhere else. A sheet is `--color-sheet`, which is
   * canvas, and a ring put there with this defaulted would paint a card-coloured
   * seam on a page-coloured ground.
   */
  surface = 'var(--color-surface)',
}) {
  const { ratio, over } = progress(value, target)
  // Round the operands, then difference. Rounding the difference of two raw
  // floats is what put a number on screen that did not match its own operands.
  const consumed = Math.round(Number(value) || 0)
  const goal = Math.round(Number(target) || 0)
  const remaining = goal - consumed
  const isOver = remaining < 0
  const colour = macroTextColor(macro)

  const remainingMode = mode === 'remaining'
  const big = remainingMode ? `${g(Math.abs(remaining))}g` : g(consumed)
  const small = remainingMode ? (isOver ? 'over' : 'left') : `/ ${g(goal)}g`

  /**
   * An empty ring puts its centre in ink rather than in the macro's colour.
   *
   * Pale type inside an unfilled outline is the standard vocabulary of a
   * loading skeleton, and at zero the ring was drawing exactly that: a hollow
   * circle with a faint coloured `0` in it. Reading a report of zero as a
   * placeholder that has not finished arriving is the one thing the mark cannot
   * afford — it means the instrument looks broken on the screen you see first
   * every morning.
   *
   * Ink at zero and colour above it also makes the transition legible. The
   * first thing you log turns the numeral the macro's colour on the same frame
   * the arc appears, so the two halves of the mark start together.
   *
   * Keyed on what has been EATEN, not on the number being drawn. In remaining
   * mode an untouched macro shows its whole target — `180g left`, a large
   * number over an empty ring — and colouring that would say the ring is
   * carrying data when it is carrying none. The rule is about the ring, so it
   * has to read the ring's own value.
   */
  const empty = consumed === 0

  const centre = h(
    'div',
    {
      // `reading` marks the text that a mode switch rewrites, so the swap can
      // be animated as one gesture across the card — the calorie number and all
      // three ring centres change at the same moment and for the same reason.
      class: `reading${swapping ? ' reading-swap' : ''} absolute inset-0 flex flex-col items-center justify-center leading-none`,
      style: { color: empty ? 'var(--color-ink)' : colour },
    },
    h('div', { class: 'tnum text-[16px] font-semibold' }, ...digits(big)),
    h('div', { class: 'tnum mt-[3px] text-[12px] font-medium text-muted' }, ...digits(small))
  )

  // Named for what it is rather than `gap`, which in this file now means the
  // seam that separates the two laps.
  const standing = isOver ? `${g(-remaining)} over` : `${g(remaining)} left`

  return h(
    'div',
    {
      class: 'flex flex-col items-center gap-[10px]',
      role: 'group',
      // Both readings, whichever one is drawn. A screen reader should not have
      // to toggle the card to hear the other half.
      'aria-label': `${MACRO_META[macro].label}, ${g(consumed)} of ${g(goal)} grams, ${standing}`,
    },
    h(
      'div',
      /**
       * SIZE, not BOX — the box is bigger than the ring and must not be what
       * the row is laid out on.
       *
       * The svg carries the gap's headroom, so it grew when the gap did. Laying
       * the row out on that box put PAD of empty space outside every ring, and
       * the outer two are aligned to the outer edges of their columns precisely
       * so protein's left edge and carbs' right edge land on the ends of the
       * calorie bar above them. Widening the gap would have walked both of them
       * inward off that alignment — a change to the ring's internals silently
       * moving a mark on the other side of the card.
       *
       * So the footprint is the RING, and the headroom overflows it: the svg is
       * pulled back by PAD on both axes, which puts its centre back on the
       * wrapper's centre. The centre reading is `inset-0` on this same SIZE box,
       * so the two still agree and the number stays concentric.
       */
      { class: 'relative', style: { width: `${SIZE}px`, height: `${SIZE}px` } },
      h(
        'div',
        { class: 'absolute', style: { left: `${-PAD}px`, top: `${-PAD}px` } },
        ringSvg({ ratio, over, goal, macro, key, animate, surface })
      ),
      centre
    ),
    /**
     * The name, and nothing beside it.
     *
     * The Log sheet's `+14` chip was tried here, both under the name and beside
     * it, and neither survived the worst case. Under, it added a fourth row to a
     * three-row grid and left the other two columns standing over an empty strip
     * — permanent dead space on two thirds of the card to annotate one third of
     * it. Beside, it fit, but only just: with all three macros over and
     * three-digit overages, the three name-and-chip pairs measured 103.5, 72.4
     * and 94.8 in 98.3px columns at 375pt, leaving 11.6px and 12.6px between
     * them. Nothing clipped and nothing overlapped, and it still read as one
     * dense band of text rather than three labelled rings.
     *
     * The ring already says it. Past target it runs a second lap with a cut
     * along it, the centre reads `194 / 80g`, and the group's `aria-label` ends
     * "114 over". A chip here would be the fourth statement of one fact on the
     * one card in the app that is meant to be read in a glance.
     *
     * It stays on the Log sheet, where the argument runs the other way: a dense
     * list of bars reads a chip faster than it reads geometry, and there is a
     * whole row's width to put one in. Two visual languages for one concept is
     * allowed because the contexts differ — what is not allowed is the two
     * disagreeing about the number, and both still come from `progress().over`.
     */
    h(
      'div',
      { class: 'text-[16px] font-semibold leading-tight', style: { color: colour } },
      MACRO_META[macro].label
    )
  )
}
