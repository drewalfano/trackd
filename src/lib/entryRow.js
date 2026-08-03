import { h, swipeToReveal, longPress } from './dom.js'
import { icon } from './icons.js'
import { macroLine } from './ui.js'
import { formatTime } from './dates.js'

/**
 * One logged entry.
 *
 * Swiping left reveals edit and delete. The actions sit behind the row and the
 * surface tracks the finger directly — no spring, no bounce.
 */
export function entryRow(entry, { onEdit, onDelete, onDuplicate, onTap } = {}) {
  const actionBtn = (name, label, handler) =>
    h(
      'button',
      {
        class: 'icon-btn icon-btn-sm bg-canvas',
        'aria-label': label,
        onclick: (e) => {
          e.stopPropagation()
          wrapper._closeSwipe?.(false)
          handler(entry)
        },
      },
      icon(name, { size: 17 })
    )

  const surface = h(
    'div',
    {
      class: 'row relative bg-surface',
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
      h('div', { class: 'mt-[4px]' }, macroLine(entry.computed, { size: 12 }))
    )
  )

  const wrapper = h(
    'div',
    { class: 'relative overflow-hidden bg-canvas' },
    h(
      'div',
      { class: 'absolute inset-y-0 right-0 flex items-center gap-[10px] pr-[15px]' },
      onEdit && actionBtn('pencil', 'Edit entry', onEdit),
      onDelete && actionBtn('trash', 'Delete entry', onDelete)
    ),
    surface
  )

  swipeToReveal(wrapper, { width: 106 })
  if (onDuplicate) longPress(wrapper, () => onDuplicate(entry))

  return wrapper
}
