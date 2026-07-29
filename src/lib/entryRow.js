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
      // Name and time read as one line, separated by a middot, per the mockups.
      h(
        'div',
        { class: 'truncate text-[17px] font-semibold leading-tight' },
        entry.foodName || 'Deleted food',
        h('span', { class: 'text-muted' }, ' · '),
        h('span', { class: 'font-medium' }, formatTime(entry.createdAt))
      ),
      h('div', { class: 'mt-[4px]' }, macroLine(entry.computed, { size: 15 }))
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
