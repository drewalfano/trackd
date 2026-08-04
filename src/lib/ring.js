import { h, s } from './dom.js'
import { progress, MACRO_META } from './compute.js'
import { g } from './format.js'
import { digits, macroColor, macroEdgeColor, macroTextColor } from './ui.js'

/**
 * A mini macro ring.
 *
 * Concentric rings were rejected for the hero because concentric arcs cannot be
 * compared to each other. Equal-diameter rings in a row keep the circular
 * language while staying comparable — the thing concentric rings are worst at.
 *
 * **Going over draws a second lap over the first, in the darker edge shade.**
 * This reverses the original call, which was that the ring saturates at its
 * target and magnitude past it is carried by the text alone. That was wrong in
 * use: a saturated ring draws `54g over` and `exactly on target` as the same
 * closed circle, so the one distinction this app most needs to make is the one
 * the mark collapses. `over is information` is the thesis, and a ring with
 * nowhere to put the excess cannot state it.
 *
 * The second lap is the shade the bars already use for overage, so excess reads
 * the same in both marks rather than being a ring-specific invention.
 */

const SIZE = 84
const STROKE = 10
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

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
 * How far the second lap takes to darken from the first lap's shade to its own.
 *
 * The second lap does not start as a different colour. Stepping straight from
 * the fill shade to the edge shade at 12 o'clock draws a hard vertical seam
 * exactly where the strand should be continuous, and the ring stops reading as
 * one thing that kept going and starts reading as two rings stacked up.
 *
 * So it leaves the first lap at the first lap's own colour and deepens into the
 * edge shade over the next quarter turn. One coil, rising. The colour is then
 * doing what it should — saying how far into the second lap you are — instead
 * of announcing that a second lap has begun, which the geometry already said.
 *
 * A sixth of a turn. This was a quarter, and a quarter was too generous: at 112%
 * the entire second lap sat inside the blend, so a ring 22g over looked very
 * close to one exactly on target — the original complaint, in miniature, at the
 * overages that actually happen. A sixth still swallows the seam and reaches
 * the full edge shade while there is still a lap left to show it on.
 */
const BLEND = C / 6

/**
 * Ids for the mask and the gradient.
 *
 * `url(#id)` resolves against the whole DOCUMENT and takes the first match, so
 * a counter alone is not enough: any second copy of this module starts counting
 * at one again, and every ring it draws then reaches into the first copy's
 * gradients. That failure is silent and it is ugly — a carbs ring painting
 * itself with the fat ramp — because a wrong reference still renders.
 *
 * So the counter is namespaced per module instance. Cheap insurance against a
 * whole class of bug whose symptom is "the wrong macro's colour, sometimes".
 */
const NS = Math.random().toString(36).slice(2, 8)
let maskUid = 0
const refId = (kind, uid) => `ring-${kind}-${NS}-${uid}`

/** Arc length for a percentage, with the zero state and the floor applied. */
function arcLength(pct) {
  if (pct <= 0) return 0
  return Math.max(MIN_ARC, (pct / 100) * C)
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

/** An arc covering [from, to] along the path, both ends square. */
function span(from, to, stroke) {
  // Half a pixel of overlap at each join. Butted exactly, adjacent arcs leave a
  // hairline of background between them where the antialiasing does not quite
  // meet, and ten of those would read as a dotted line rather than a ramp.
  const a = Math.max(0, from - 0.3)
  const len = to - a + 0.3
  return s(
    'circle',
    onRing({
      stroke,
      'stroke-dasharray': `${len} ${C - len}`,
      'stroke-dashoffset': -a,
    })
  )
}

/**
 * The ramp, as a real gradient rather than as steps of `color-mix`.
 *
 * Ten mixed segments was the first build and it banded: at 84px each step is
 * six device pixels wide at 3x, so the blend read as a staircase rather than a
 * ramp, which is worse than the hard seam it replaced — a seam is at least
 * deliberate.
 *
 * The axis is horizontal in the arc's own space, which the -90 rotation turns
 * into the vertical at 12 o'clock: full at the top of the ring, edge shade a
 * quarter turn later. Everything past that pads to the edge shade, and because
 * this is only ever painted over the first quarter turn, the pad never gets a
 * chance to run backwards up the other side.
 *
 * Positional rather than path-length based, which is the property that matters:
 * the shade at any point on the strand depends on WHERE IT IS, not on how far
 * over you are. The ramp is nailed to the ring, so it cannot stretch or slide
 * as the day goes on.
 */
function ramp(id, macro) {
  return s(
    'linearGradient',
    {
      id,
      gradientUnits: 'userSpaceOnUse',
      x1: SIZE / 2 + R,
      y1: SIZE / 2,
      x2: SIZE / 2,
      y2: SIZE / 2,
    },
    s('stop', { offset: '0', 'stop-color': macroColor(macro) }),
    s('stop', { offset: '1', 'stop-color': macroEdgeColor(macro) })
  )
}

/**
 * The second lap, painted at its full length and revealed by a mask.
 *
 * Painting it whole and masking it — rather than growing the arcs themselves —
 * is what keeps the ramp fixed to the strand.
 *
 * Two arcs: the edge shade the whole way, then the ramp laid over its first
 * quarter turn. Drawn this way round so the pure shade is the default and the
 * blend is the exception, which is also the only reason the gradient never has
 * to wrap.
 */
function overStrand(macro, rampId) {
  return [span(0, C, macroEdgeColor(macro)), span(0, BLEND, `url(#${rampId})`)]
}

/**
 * A round-capped arc of length `from`, on the transition so it can be grown.
 * Used for the first lap, and for the mask that reveals the second.
 */
function lap(colour, from, maskId) {
  return s(
    'circle',
    onRing({
      class: 'ring-arc',
      stroke: colour,
      'stroke-linecap': 'round',
      'stroke-dasharray': C,
      'stroke-dashoffset': C - from,
      ...(maskId ? { mask: `url(#${maskId})` } : {}),
    })
  )
}

function ringSvg({ ratio, macro, key, animate }) {
  const total = ratio * 100

  // Past double the target the second lap closes too, and a third lap is not
  // something a ring can say without becoming a puzzle. The centre number is
  // already carrying magnitude by then, so the mark stops counting and the
  // reading becomes "at least twice over", which is true and legible.
  const basePct = Math.min(100, total)
  const overPct = Math.min(100, Math.max(0, total - 100))

  const overKey = `${key}:over`
  const baseTo = arcLength(basePct)
  const overTo = arcLength(overPct)
  const baseFrom = animate ? (lastLen.get(key) ?? 0) : baseTo
  const overFrom = animate ? (lastLen.get(overKey) ?? 0) : overTo
  lastLen.set(key, baseTo)
  lastLen.set(overKey, overTo)

  // Each lap is kept while it has somewhere to animate FROM, so deleting the
  // entry that put you over unwinds the lap instead of snapping it away.
  const hasBase = baseTo > 0 || baseFrom > 0
  const hasOver = overTo > 0 || overFrom > 0

  const track = s(
    'circle',
    onRing({
      stroke: `color-mix(in srgb, ${macroColor(macro)} ${TRACK_MIX}%, transparent)`,
    })
  )

  const uid = hasOver ? ++maskUid : null

  // The second lap is painted whole and uncovered by this, so the colour ramp
  // stays put on the strand instead of stretching with it.
  //
  // Two pieces, because the ends want different caps and a stroke only gets
  // one. The body is square at BOTH ends: the strand leaves the first lap where
  // the first lap stopped, so a cap there would be a second nose on a strand
  // that never ended. A round one is worse than redundant — it reaches half a
  // stroke BACKWARDS past 12 o'clock, and on a closed path that is the far end
  // of the ring, where it uncovered a 5px patch of the darkest paint on the
  // strand and hung it at 11 o'clock unattached to anything.
  //
  // The tip is then a zero-length round dash, which renders as a disc, parked
  // on the leading end. That disc is the cap the whole mark ends on.
  const revealBody = hasOver
    ? s(
        'circle',
        onRing({
          class: 'ring-arc',
          stroke: '#fff',
          'stroke-linecap': 'butt',
          'stroke-dasharray': C,
          'stroke-dashoffset': C - overFrom,
        })
      )
    : null

  const revealTip = hasOver
    ? s(
        'circle',
        onRing({
          class: 'ring-arc',
          stroke: '#fff',
          'stroke-linecap': 'round',
          'stroke-dasharray': `0.01 ${C}`,
          'stroke-dashoffset': -overFrom,
        })
      )
    : null

  const overMask = hasOver
    ? s(
        'mask',
        { id: refId('over', uid), maskUnits: 'userSpaceOnUse' },
        s('rect', { x: 0, y: 0, width: SIZE, height: SIZE, fill: '#000' }),
        revealBody,
        revealTip
      )
    : null

  // Nothing logged draws the track alone. An empty ring is the zero state and
  // does not need a marker to say so.
  const base = hasBase ? lap(macroColor(macro), baseFrom, null) : null
  const over = hasOver
    ? s('g', { mask: `url(#${refId('over', uid)})` }, ...overStrand(macro, refId('ramp', uid)))
    : null

  if (animate) {
    requestAnimationFrame(() => {
      if (base && baseFrom !== baseTo) base.style.strokeDashoffset = String(C - baseTo)
      if (overFrom !== overTo) {
        revealBody.style.strokeDashoffset = String(C - overTo)
        revealTip.style.strokeDashoffset = String(-overTo)
      }
    })
  }

  return s(
    'svg',
    {
      width: SIZE,
      height: SIZE,
      viewBox: `0 0 ${SIZE} ${SIZE}`,
      'aria-hidden': 'true',
      class: 'block',
    },
    hasOver ? ramp(refId('ramp', uid), macro) : null,
    overMask,
    track,
    // Drawn in order, so the strand continues over the lap below it and ends on
    // its own cap, which is the only thing marking where it crossed.
    base,
    over
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
}) {
  const { ratio } = progress(value, target)
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

  const centre = h(
    'div',
    {
      // `reading` marks the text that a mode switch rewrites, so the swap can
      // be animated as one gesture across the card — the calorie number and all
      // three ring centres change at the same moment and for the same reason.
      class: `reading${swapping ? ' reading-swap' : ''} absolute inset-0 flex flex-col items-center justify-center leading-none`,
      style: { color: colour },
    },
    h('div', { class: 'tnum text-[15px] font-semibold' }, ...digits(big)),
    h('div', { class: 'tnum mt-[3px] text-[11px] font-medium text-muted' }, ...digits(small))
  )

  const gap = isOver ? `${g(-remaining)} over` : `${g(remaining)} left`

  return h(
    'div',
    {
      class: 'flex flex-col items-center gap-[10px]',
      role: 'group',
      // Both readings, whichever one is drawn. A screen reader should not have
      // to toggle the card to hear the other half.
      'aria-label': `${MACRO_META[macro].label}, ${g(consumed)} of ${g(goal)} grams, ${gap}`,
    },
    h(
      'div',
      { class: 'relative', style: { width: `${SIZE}px`, height: `${SIZE}px` } },
      ringSvg({ ratio, macro, key, animate }),
      centre
    ),
    h(
      'div',
      { class: 'text-[16px] font-semibold leading-tight', style: { color: colour } },
      MACRO_META[macro].label
    )
  )
}
