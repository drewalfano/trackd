import { h } from './dom.js'
import { deleteEntry, putEntry, getSettings, uid } from './db.js'
import { toast } from './toast.js'
import { openSheet } from './sheet.js'
import { blockSelector, segmented } from './ui.js'
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
 */
export async function openDuplicateSheet(entry) {
  const settings = await getSettings()
  let block = entry.block
  let date = entry.date

  return openSheet({
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

      return h(
        'div',
        { class: 'flex flex-col gap-5 pb-2' },
        h(
          'div',
          { class: 'card px-4 py-3' },
          h('div', { class: 'text-[15px] font-semibold' }, entry.foodName),
          h(
            'div',
            { class: 'mt-0.5 text-[13px] text-muted' },
            `${Math.round(entry.computed.kcal)} cal`
          )
        ),
        h('div', { class: 'flex flex-col gap-2' }, h('div', { class: 'section-label' }, 'Day'), dayRow),
        h(
          'div',
          { class: 'flex flex-col gap-2' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        )
      )
    },
  })
}
