import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings, toggleFavourite } from '../lib/db.js'
import { sumEntries } from '../lib/compute.js'
import { saveEntriesAsMeal } from '../lib/logging.js'
import { navHeader, card, macroLine } from '../lib/ui.js'
import { entryRow } from '../lib/entryRow.js'
import { deleteEntryWithUndo, openDuplicateSheet } from '../lib/entryActions.js'
import { openEditEntry } from '../sheets/serving.js'
import { openAddFood } from '../sheets/addFood.js'
import { toast } from '../lib/toast.js'
import { openSheet } from '../lib/sheet.js'
import { textInput, labelledField } from '../lib/ui.js'
import { pluralize } from '../lib/format.js'
import { BLOCKS, formatDayHeader, isToday } from '../lib/dates.js'
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
            { class: 'section-head' },
            h('div', { class: 'section-label' }, name),
            blockEntries.length
              ? h(
                  'button',
                  {
                    class: 'chip-sm',
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
        { class: 'flex flex-col gap-[20px]' },

        // Same day navigation as Today — this is the same day, seen by block
        // rather than as a summary. Returning to Today is the tab bar, which
        // already treats Log as part of that tab.
        // Titled "Log", not the date — Today already owns the date as a title,
        // and two screens with identical headers is a way to lose your place.
        // The day moves to the section label directly beneath, where the
        // chevrons above still read as stepping it.
        navHeader({
          title: 'Log',
          onBack: () => setDate(-1),
          backLabel: 'Previous day',
          onForward: isToday(state.date) ? null : () => setDate(1),
          forwardLabel: 'Next day',
        }),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h(
            'div',
            { class: 'section-head' },
            h('div', { class: 'section-label' }, formatDayHeader(state.date)),
            h('button', { class: 'chip-sm', onclick: () => navigate('history') }, 'History')
          ),
          // The card wraps a row rather than being one: `.card > * + *` draws
          // the dividers, so a card that is itself a row would rule between its
          // own two halves.
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
          )
        ),

        ...sections
      )
    },
    { watch: ['entries', 'settings', 'meals'] }
  )
}
