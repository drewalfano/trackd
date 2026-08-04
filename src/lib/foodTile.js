import { h, longPress } from './dom.js'
import { icon } from './icons.js'
import { macroLine } from './ui.js'

/**
 * One food, as a card in a horizontal rail.
 *
 * Lifted out of the add sheet's `favCard` without a pixel changing, because it
 * is now on two screens: the add sheet's Favourites, and Today's Quick add.
 *
 * **It takes three handlers and encodes no grammar of its own.** That is the
 * whole reason it is shaped this way, and the two callers do genuinely
 * disagree: on the add sheet a body tap LOGS and the `+` stages to the plate;
 * on Today's Quick add rail a body tap OPENS THE AMOUNT SHEET and the `+` logs.
 * A component that decided which was which would have had to be forked the
 * moment they diverged, and forking it is the thing extracting it was meant to
 * avoid.
 *
 * That divergence is a known cost, not an oversight — two identical-looking
 * cards do different things on a body tap depending on the screen. The
 * reasoning for Today's half is on `quickAddTile` in screens/today.js.
 *
 * What it DOES fix is the shape: fixed width so a given food is always in the
 * same place, two-line name clamp so the rail cannot ripple, and one bottom row
 * holding the calories and the `+` on a shared baseline whatever the name above
 * them did.
 *
 * TWO buttons, not one nested in another. The card is a plain div: the body's
 * tap target is a transparent overlay pinned to its edges, and the `+` sits
 * above it. A `<button>` inside a `<button>` is invalid, and the browsers that
 * tolerate it disagree about which one a tap belongs to.
 *
 * Calories only on the face, which is what buys the short card. Sharing the
 * bottom row with the `+` leaves 84px for numbers, and `1010 cal · 120 P` does
 * not fit at all — protein could only be kept by letting the line wrap, which
 * puts the height straight back. The serving comes off the face entirely and
 * lives in the label a screen reader gets; it is a constant for a given food,
 * so it tells you nothing at the moment you are choosing between four of them.
 */
export function foodTile({
  title,
  subtitle,
  totals,
  /** The body tap. */
  onBody,
  /** What the body tap does, for anything not looking at it. */
  bodyLabel,
  /** The corner button. */
  onAction,
  actionLabel,
  /** Long-press. Optional — the tile is complete without one. */
  onOpen,
}) {
  const hit = h('button', {
    class: 'absolute inset-0 rounded-[inherit]',
    'aria-label': bodyLabel ?? (subtitle ? `${title}, ${subtitle}` : title),
    onclick: onBody,
  })
  if (onOpen) longPress(hit, onOpen)

  return h(
    'div',
    { class: 'food-tile' },
    hit,
    // `relative` lifts the content over the overlay so it is not dimmed or
    // clipped by it; `pointer-events-none` hands the taps straight back.
    h('div', { class: 'food-tile-name pointer-events-none relative' }, title),
    // `mt-auto` on the row, so the numbers and the `+` land on the same
    // baseline in every card whether the name above them took one line or two.
    h(
      'div',
      { class: 'food-tile-action relative' },
      h(
        'div',
        { class: 'pointer-events-none min-w-0' },
        macroLine(totals, { size: 11, omit: ['protein', 'fat', 'carbs'] })
      ),
      h(
        'button',
        {
          class: 'icon-btn icon-btn-sm shrink-0 bg-canvas',
          'aria-label': actionLabel,
          onclick: onAction,
        },
        icon('plus', { size: 17, stroke: 2.25 })
      )
    )
  )
}
