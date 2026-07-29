import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings, toggleFavourite } from '../lib/db.js'
import { sumEntries } from '../lib/compute.js'
import { saveEntriesAsMeal } from '../lib/logging.js'
import { dayHeader, card, macroLine } from '../lib/ui.js'
import { entryRow } from '../lib/entryRow.js'
import { deleteEntryWithUndo, openDuplicateSheet } from '../lib/entryActions.js'
import { openEditEntry } from '../sheets/serving.js'
import { openAddFood } from '../sheets/addFood.js'
import { toast } from '../lib/toast.js'
import { openSheet } from '../lib/sheet.js'
import { textInput, labelledField } from '../lib/ui.js'
import { pluralize } from '../lib/format.js'
import { BLOCKS } from '../lib/dates.js'
import { state, setDate } from '../state.js'
import { navigate } from '../router.js'

/**
 * The Log day view.
 *
 * This is the only screen where the time blocks are visible, which is correct:
 * blocks are how you review a day, not how you log one.
 */

async function promptSaveAsMeal(entries, defaultName) {
  return openSheet({
    title: 'Save as meal',
    render: (ctx) => {
      let name = defaultName
      const save = h(
        'button',
        {
          class: 'btn-primary',
          onclick: async () => {
            const meal = await saveEntriesAsMeal(name.trim() || defaultName, entries)
            await toggleFavourite('meal', meal.id)
            ctx.close()
            toast(`Saved "${meal.name}" and pinned it`)
          },
        },
        'Save meal'
      )
      ctx.setFooter(save)

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        labelledField({
          label: 'Name',
          hint: 'Saved meals are pinned to Favourites so they stay in one place.',
          children: textInput({
            value: name,
            autofocus: true,
            onInput: (v) => {
              name = v
              save.disabled = !v.trim()
            },
          }),
        }),
        card(
          entries.map((e) =>
            h(
              'div',
              { class: 'row' },
              h('span', { class: 'flex-1 truncate text-[12px]' }, e.foodName),
              h('span', { class: 'text-[12px] text-muted' }, `${Math.round(e.computed.kcal)} cal`)
            )
          )
        )
      )
    },
  })
}

export function logScreen() {
  return createScreen(
    async () => {
      const [entries, settings] = await Promise.all([listEntries(state.date), getSettings()])
      const totals = sumEntries(entries)

      const sections = BLOCKS.map((block, i) => {
        const blockEntries = entries.filter((e) => e.block === block)
        const name = settings.blockNames[i]

        return h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h(
            'div',
            { class: 'flex items-end justify-between' },
            h('div', { class: 'section-label' }, name),
            blockEntries.length
              ? h(
                  'button',
                  {
                    class: 'section-action underline underline-offset-2',
                    onclick: () => promptSaveAsMeal(blockEntries, `Usual ${name.toLowerCase()}`),
                  },
                  'Save as meal'
                )
              : null
          ),
          card(
            blockEntries.length
              ? blockEntries.map((entry) =>
                  entryRow(entry, {
                    onEdit: openEditEntry,
                    onDelete: deleteEntryWithUndo,
                    onDuplicate: openDuplicateSheet,
                  })
                )
              : // Empty blocks collapse to one row rather than an empty container.
                h(
                  'button',
                  {
                    class: 'row text-[12px] text-muted',
                    onclick: () => openAddFood({ date: state.date, block }),
                  },
                  icon('plus', { size: 16 }),
                  `Add to ${name.toLowerCase()}`
                )
          )
        )
      })

      return h(
        'div',
        { class: 'flex flex-col gap-[30px]' },

        h(
          'div',
          { class: 'flex items-center justify-between' },
          h(
            'button',
            { class: 'flex items-center gap-[10px] text-[12px] font-medium', onclick: () => navigate('today') },
            icon('chevronLeft', { size: 18 }),
            'Today'
          ),
          h(
            'button',
            {
              class: 'flex items-center gap-[10px] text-[12px] font-medium text-muted',
              onclick: () => navigate('history'),
            },
            'History',
            icon('chevronRight', { size: 16 })
          )
        ),

        dayHeader({ date: state.date, setDate, title: 'Log' }),

        // The card wraps a row rather than being one: `.card > * + *` draws the
        // dividers, so a card that is itself a row would rule between its own
        // two halves.
        card(
          h(
            'div',
            { class: 'row justify-between' },
            h(
              'span',
              { class: 'shrink-0 text-[13px] font-semibold text-muted' },
              pluralize(entries.length, 'item')
            ),
            macroLine(totals, { size: 12 })
          )
        ),

        ...sections
      )
    },
    { watch: ['entries', 'settings', 'meals'] }
  )
}
