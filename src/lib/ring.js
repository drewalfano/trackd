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
 * Ring with `consumed / target` in its centre, macro name and the gap beneath.
 *
 * The ring used to hold the gap alone, as a negative: `-159g`. Two things were
 * wrong with that. A minus sign reads as debt or as an error even when it means
 * "still to eat" — and the same sign carried opposite valences, `-32g` on
 * protein being 32 to go while `-46g` on fat is 46 of headroom, with nothing on
 * screen to say which. And the number ran the wrong way: it was largest on an
 * empty morning and counted down while the arc filled up, so the two halves of
 * the same mark moved in opposite directions all day.
 *
 * Consumed over target is what the calorie row already does, and it is stated
 * the way the calorie row states it: the value at full size, the target small
 * and muted beneath. Two lines rather than one because `180 / 300` measures
 * 68.4px in Inter at 15px and the hole gives 62.2px across at that height —
 * every three-digit pair is exactly that wide, the figures being tabular.
 *
 * The over state needs no special form: `320 / 300` carries magnitude past the
 * target by itself, where the old centre needed a `+` to do it.
 *
 * Both the number and the name take the TEXT shade, not the fill — a fill is
 * never used as type.
 */
export function macroRing({ macro, value, target, animate = true, key = macro }) {
  const { pct } = progress(value, target)
  // Round the operands, then difference. Rounding the difference of two raw
  // floats is what put a number on screen that did not match its own operands.
  const consumed = Math.round(Number(value) || 0)
  const goal = Math.round(Number(target) || 0)
  const remaining = goal - consumed
  const isOver = remaining < 0
  const colour = macroTextColor(macro)

  const centre = h(
    'div',
    {
      class: 'absolute inset-0 flex flex-col items-center justify-center leading-none',
      style: { color: colour },
    },
    h('div', { class: 'tnum text-[15px] font-semibold' }, ...digits(g(consumed))),
    h('div', { class: 'tnum mt-[3px] text-[11px] font-medium text-muted' }, ...digits(`/ ${g(goal)}`))
  )

  /**
   * The gap moves here rather than disappearing. It is the answer to "how much
   * protein is left", which is the question the card exists to answer, and
   * subtracting two numbers in your head at 8am is not an answer.
   */
  const gap = isOver ? `${g(-remaining)} over` : `${g(remaining)} left`

  return h(
    'div',
    {
      class: 'flex flex-col items-center gap-[10px]',
      role: 'group',
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
      { class: 'flex flex-col items-center gap-[2px]' },
      h(
        'div',
        { class: 'text-[16px] font-semibold leading-tight', style: { color: colour } },
        MACRO_META[macro].label
      ),
      h('div', { class: 'tnum text-[12px] leading-tight text-muted' }, ...digits(gap))
    )
  )
}
