import { h, swipeToReveal, longPress } from './dom.js'
import { icon } from './icons.js'
import { estimateBadge, foodRowBody } from './ui.js'
import { DESCRIBE_SOURCE } from './logging.js'
import { formatTime } from './dates.js'

/**
 * One logged entry.
 *
 * Swiping left reveals edit and delete. The actions sit behind the row and the
 * surface tracks the finger directly — no spring, no bounce.
 *
 * They are full-size ink circles rather than the small tinted ones this used
 * to draw. Those were `bg-canvas` sitting on a `bg-canvas` track, so the only
 * thing marking either control was a 17px hairline glyph floating on the page
 * tint — no edge, no fill, nothing to say where one button ended and the next
 * began. A control revealed by a gesture has no label and no permanent home;
 * the shape has to do all of that work by itself, so it gets the full 44px and
 * the fill.
 */
export function entryRow(entry, { onEdit, onDelete, onDuplicate, onTap } = {}) {
  const actionBtn = (name, label, handler) =>
    h(
      'button',
      {
        class: 'icon-btn icon-btn-ink',
        'aria-label': label,
        onclick: (e) => {
          e.stopPropagation()
          wrapper._closeSwipe?.(false)
          handler(entry)
        },
      },
      icon(name, { size: 20 })
    )

  const surface = h(
    'div',
    {
      class: 'row relative',
      'data-swipe-surface': '',
      onclick: onTap ? () => onTap(entry) : null,
    },
    // The shape lives in `foodRowBody` now, shared with the add sheet's lists
    // and the plate. What is left here is what is genuinely this row's: the
    // swipe wrapper, the two revealed controls, the time in the detail slot, and
    // the sparkle on anything whose numbers a model guessed.
    //
    // The badge with no words beside it, unlike the plate, which keeps both. A
    // logged row has already been through the plate once — the label did its
    // explaining there — and this list is read by scanning names, where a
    // repeated word on some rows and not others is noise the glyph is not.
    foodRowBody({
      name: entry.foodName || 'Deleted food',
      detail: formatTime(entry.createdAt),
      totals: entry.computed,
      badge: entry.source === DESCRIBE_SOURCE ? estimateBadge() : null,
    })
  )

  const wrapper = h(
    'div',
    { class: 'swipe-row' },
    // 20px on the right is the row's own side padding, so the trailing circle
    // lands on the same margin every other thing in the card lines up on.
    h(
      'div',
      { class: 'swipe-actions absolute inset-y-0 right-0 flex items-center gap-[10px] pr-[20px]' },
      onEdit && actionBtn('pencil', 'Edit entry', onEdit),
      onDelete && actionBtn('trash', 'Delete entry', onDelete)
    ),
    surface
  )

  // 20 to the card's edge, 44, 10, 44 — 118 of track — and 10 more between the
  // row's rounded end and the first circle, which is the same 10 that separates
  // the two circles. 128 of travel.
  swipeToReveal(wrapper, { width: 128 })
  if (onDuplicate) longPress(wrapper, () => onDuplicate(entry))

  return wrapper
}
