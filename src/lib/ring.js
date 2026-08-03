import { h, s } from './dom.js'
import { progress, MACRO_META } from './compute.js'
import { g, signed } from './format.js'
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
 * Ring with the gap to target in its centre, macro name beneath.
 *
 * The number lives in the hole rather than under the ring. That puts the
 * magnitude AT the mark instead of beside it, and it means the centre is never
 * an empty slot that only fills up in the over state.
 *
 * One consequence worth keeping in view: the sign is a direction, not a
 * verdict. `-32g` on protein means 32 still to eat; `-46g` on fat means 46 of
 * headroom. Same sign, opposite valence, and the screen does not say which.
 *
 * Both the number and the name take the TEXT shade, not the fill — a fill is
 * never used as type. The carbs fill is 4.55:1 on white, which scrapes AA by
 * 0.05 and fails the moment the card is anything but pure white.
 */
export function macroRing({ macro, value, target, animate = true, key = macro }) {
  const { pct, over } = progress(value, target)
  const isOver = over > 0
  // Round the operands, then difference. Rounding the difference of two raw
  // floats is what put a number on screen that did not match its own operands.
  const diff = Math.round(Number(value) || 0) - Math.round(Number(target) || 0)
  const colour = macroTextColor(macro)

  const centre = h(
    'div',
    {
      class: 'tnum absolute inset-0 flex items-center justify-center text-[15px] font-semibold',
      style: { color: colour },
    },
    ...digits(`${signed(diff, 0)}g`)
  )

  return h(
    'div',
    {
      class: 'flex flex-col items-center gap-[10px]',
      role: 'group',
      'aria-label': `${MACRO_META[macro].label}, ${g(Math.abs(diff))} grams ${
        isOver ? 'over target' : 'under target'
      }`,
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
