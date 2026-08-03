import { h, swipeToReveal, longPress } from './dom.js'
import { icon } from './icons.js'
import { macroLine } from './ui.js'
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
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      /**
       * Name and time read as one line, separated by a middot, per the mockups.
       *
       * Truncating the line as a whole ate the time, because the time is at the
       * end of it — `organic granola bites chocolate banana · 9:4…`. That is
       * backwards: a clipped name is still recognisable from its first
       * two-thirds, while a clipped time is unreadable and unguessable, and the
       * time is the only thing on the row you cannot work out from the food
       * itself.
       *
       * So the name is the only part that yields. `whitespace-pre` on the
       * separator keeps the exact spacing the single text node used to give.
       */
      h(
        'div',
        { class: 'flex items-baseline text-[14px] font-semibold leading-tight' },
        h('span', { class: 'min-w-0 truncate' }, entry.foodName || 'Deleted food'),
        h('span', { class: 'shrink-0 whitespace-pre text-muted' }, ' · '),
        h('span', { class: 'shrink-0 font-normal' }, formatTime(entry.createdAt))
      ),
      // 2px, not 4. The two lines are one thing said twice — what it was and
      // what it cost — so they want to sit as a block rather than as a pair.
      // The gap does not need to be big to separate them; the weight change
      // from semibold name to regular figures is already doing that.
      h('div', { class: 'mt-[2px]' }, macroLine(entry.computed, { size: 12 }))
    )
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
