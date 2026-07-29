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
        class: 'flex h-9 w-9 items-center justify-center rounded-full bg-canvas',
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
      h(
        'div',
        { class: 'flex items-baseline gap-2' },
        h('span', { class: 'min-w-0 flex-1 truncate text-[15px] font-medium' }, entry.foodName || 'Deleted food'),
        h('span', { class: 'shrink-0 text-[12px] text-muted' }, formatTime(entry.createdAt))
      ),
      h('div', { class: 'mt-1' }, macroLine(entry.computed, { size: 13 }))
    )
  )

  const wrapper = h(
    'div',
    { class: 'row-group relative overflow-hidden bg-canvas' },
    h(
      'div',
      { class: 'absolute inset-y-0 right-0 flex items-center gap-2 pr-3' },
      onEdit && actionBtn('pencil', 'Edit entry', onEdit),
      onDelete && actionBtn('trash', 'Delete entry', onDelete)
    ),
    surface
  )

  swipeToReveal(wrapper, { width: 96 })
  if (onDuplicate) longPress(wrapper, () => onDuplicate(entry))

  return wrapper
}
