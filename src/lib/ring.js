import { h, s } from './dom.js'
import { progress, MACRO_META } from './compute.js'
import { g } from './format.js'
import { digits, macroColor, macroTextColor } from './ui.js'

/**
 * A mini macro ring.
 *
 * Concentric rings were rejected for the hero because a ring is a 0–100%
 * container with no honest way to draw overflow, and overflow is routine here.
 * Equal-diameter rings in a row keep the circular language while staying
 * comparable to each other — the thing concentric rings are worst at.
 *
 * The ring saturates rather than looping. Magnitude past the target is carried
 * by the text beneath it, never by a second lap.
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

/** Arc length for a percentage, with the zero state and the floor applied. */
function arcLength(pct) {
  if (pct <= 0) return 0
  return Math.max(MIN_ARC, (pct / 100) * C)
}

function ringSvg({ pct, macro, key, animate }) {
  const to = arcLength(pct)
  const from = animate ? (lastLen.get(key) ?? 0) : to
  lastLen.set(key, to)

  const track = s('circle', {
    cx: SIZE / 2,
    cy: SIZE / 2,
    r: R,
    fill: 'none',
    stroke: `color-mix(in srgb, ${macroColor(macro)} ${TRACK_MIX}%, transparent)`,
    'stroke-width': STROKE,
  })

  // Nothing logged draws the track alone. The empty ring is the zero state and
  // does not need a marker to say so.
  const arc =
    to > 0 || from > 0
      ? s('circle', {
          class: 'ring-arc',
          cx: SIZE / 2,
          cy: SIZE / 2,
          r: R,
          fill: 'none',
          // The FILL shade. An arc is a painted mark, not type, so this is the
          // same call the bars made — see MACRO_TEXT in ui.js for why the
          // labels underneath resolve to a different shade than the ring.
          stroke: macroColor(macro),
          'stroke-width': STROKE,
          'stroke-linecap': 'round',
          'stroke-dasharray': C,
          'stroke-dashoffset': C - from,
          // Start at 12 o'clock and run clockwise.
          transform: `rotate(-90 ${SIZE / 2} ${SIZE / 2})`,
        })
      : null

  if (arc && animate && from !== to) {
    requestAnimationFrame(() => {
      arc.style.strokeDashoffset = String(C - to)
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
    track,
    arc
  )
}

/**
 * Ring with a number in its centre and the macro name beneath.
 *
 * The centre states ONE of two readings, and which one is the card's business
 * rather than the ring's — `mode` comes down from Today, where a tap flips the
 * whole card at once. Consumed reads `115` over `/ 180`; remaining reads `65`
 * over `left`. Both are the same shape: the value at full size, its qualifier
 * small and muted beneath, which is what the calorie row does too.
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
 * The over state needs no special form in either mode: `320 / 300` carries
 * magnitude past the target by itself, and remaining says `20` over `over`.
 *
 * Both the number and the name take the TEXT shade, not the fill — a fill is
 * never used as type.
 */
export function macroRing({ macro, value, target, animate = true, key = macro, mode = 'consumed' }) {
  const { pct } = progress(value, target)
  // Round the operands, then difference. Rounding the difference of two raw
  // floats is what put a number on screen that did not match its own operands.
  const consumed = Math.round(Number(value) || 0)
  const goal = Math.round(Number(target) || 0)
  const remaining = goal - consumed
  const isOver = remaining < 0
  const colour = macroTextColor(macro)

  const remainingMode = mode === 'remaining'
  const big = remainingMode ? g(Math.abs(remaining)) : g(consumed)
  const small = remainingMode ? (isOver ? 'over' : 'left') : `/ ${g(goal)}`

  const centre = h(
    'div',
    {
      class: 'absolute inset-0 flex flex-col items-center justify-center leading-none',
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
      ringSvg({ pct, macro, key, animate }),
      centre
    ),
    h(
      'div',
      { class: 'text-[16px] font-semibold leading-tight', style: { color: colour } },
      MACRO_META[macro].label
    )
  )
}
