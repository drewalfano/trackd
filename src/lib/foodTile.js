import { h, longPress } from './dom.js'
import { icon } from './icons.js'
import { macroLine } from './ui.js'
import { displayName } from './format.js'

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
 * bottom row with the `+` leaves 80px for numbers, and `1010 cal · 120 P` does
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
  // Cased once, then used for both the visible name and the label read aloud,
  // so the two never diverge. Callers that compose their own `bodyLabel` case
  // it themselves — the string is already built by the time it arrives.
  const name = displayName(title)

  const hit = h('button', {
    class: 'absolute inset-0 rounded-[inherit]',
    'aria-label': bodyLabel ?? (subtitle ? `${name}, ${subtitle}` : name),
    onclick: onBody,
  })
  if (onOpen) longPress(hit, onOpen)

  return h(
    'div',
    { class: 'food-tile' },
    hit,
    // `relative` lifts the content over the overlay so it is not dimmed or
    // clipped by it; `pointer-events-none` hands the taps straight back.
    h('div', { class: 'food-tile-name pointer-events-none relative' }, name),
    // `mt-auto` on the row, so the numbers and the `+` land on the same
    // baseline in every card whether the name above them took one line or two.
    h(
      'div',
      { class: 'food-tile-action relative' },
      /**
       * Nudged 5px down, so the DIGITS sit on the button's bottom edge rather
       * than their box doing.
       *
       * `.food-tile-action` is `align-items: flex-end`, which lines up the two
       * boxes exactly — measured, the number's box bottom and the circle's are
       * the same pixel. The ink is not: at 12px in an 18px line box the baseline
       * sits 5px above the box's bottom, and a figure has no descenders to fill
       * that space, so the number floated 5px clear of a circle it was supposed
       * to share a line with. Both this file and the CSS claimed a shared
       * baseline; both were describing the boxes.
       *
       * `align-items: baseline` was tried first and is worse — 7.5px. A flex
       * container with no text synthesizes its baseline, and a 32px circle
       * holding one svg does not synthesize it at its bottom edge.
       *
       * So it is a measured offset, like `estimateBadge`'s `top-[2px]`. It is
       * `relative` rather than a margin because the descender space that now
       * hangs below the card's content is empty and should not push the tile:
       * height is unchanged at 97.
       *
       * The 5 is tied to `size: 12` and this line-height. Change either and
       * re-measure — the residual is `buttonBottom - digitBaseline`.
       */
      h(
        'div',
        { class: 'pointer-events-none relative top-[5px] min-w-0' },
        macroLine(totals, { size: 12, omit: ['protein', 'fat', 'carbs'] })
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
