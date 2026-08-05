import { h } from './dom.js'
import { deleteEntry, putEntry, getSettings, uid } from './db.js'
import { toast } from './toast.js'
import { presentSheet } from './sheet.js'
import { blockSelector, segmented, macroLine } from './ui.js'
import { addDays, formatDayLabel, todayStr } from './dates.js'

/**
 * Delete, then offer it back. The undo restores the original record verbatim,
 * including its id and timestamp, so nothing about the day shifts.
 */
export async function deleteEntryWithUndo(entry) {
  await deleteEntry(entry.id)
  toast(`Removed ${entry.foodName || 'entry'}`, {
    action: 'Undo',
    onAction: () => putEntry(entry),
  })
}

/**
 * Long-press duplicate: same food and quantity, a block and day you choose.
 * Covers "I ate that again" and the 1 AM meal that belongs to yesterday.
 *
 * `host` is the sheet this was launched from, when it was launched from one —
 * the log. Passed on to `presentSheet`, which pushes a panel rather than
 * replacing the sheet the row lives in.
 */
export async function openDuplicateSheet(entry, host) {
  const settings = await getSettings()
  let block = entry.block
  let date = entry.date

  return presentSheet({
    title: 'Duplicate',
    render: (ctx) => {
      const dayOptions = [
        { value: addDays(todayStr(), -1), label: 'Yesterday' },
        { value: todayStr(), label: 'Today' },
        { value: addDays(todayStr(), 1), label: 'Tomorrow' },
      ]
      if (!dayOptions.some((o) => o.value === date)) {
        dayOptions.unshift({ value: date, label: formatDayLabel(date) })
      }

      const dayRow = h('div')
      const blockRow = h('div')

      const paintDay = () => {
        dayRow.replaceChildren(
          segmented({
            options: dayOptions,
            value: date,
            onChange: (v) => {
              date = v
              paintDay()
            },
          })
        )
      }
      const paintBlock = () => {
        blockRow.replaceChildren(
          blockSelector({
            value: block,
            onChange: (v) => {
              block = v
              paintBlock()
            },
            blockNames: settings.blockNames,
          })
        )
      }
      paintDay()
      paintBlock()

      ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: async () => {
              await putEntry({
                ...entry,
                id: uid(),
                date,
                block,
                createdAt: Date.now(),
              })
              ctx.close()
              toast(`Added to ${formatDayLabel(date)}`)
            },
          },
          'Duplicate'
        )
      )

      // Spacing and type match the other sheets: 20 between sections, 10 inside
      // one, and the 16/14/12 steps. This was the only surface built off the
      // default Tailwind scale (gap-5, py-3, text-[15px]) — close enough to
      // look intentional, far enough off to look wrong, and impossible to name.
      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },
        h(
          'div',
          { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' },
          h('div', { class: 'text-[16px] font-semibold leading-tight' }, entry.foodName),
          macroLine(entry.computed, { size: 14 })
        ),
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Day'),
          dayRow
        ),
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        )
      )
    },
  }, host)
}
