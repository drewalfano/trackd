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

        /**
         * An empty block is its own heading, and nothing else.
         *
         * It used to be a heading plus a card holding one 48px row — 102px of
         * screen with the 20px gap, to say a block has nothing in it. Three of
         * those is a fresh day: most of the screen given over to empty
         * affordances, with the third block pushed under the tab bar.
         *
         * The name does not move. It stays in the same heading, in the same
         * place it occupies when the block is full, and the pill opposite is the
         * one already used for `Save as meal` and `History` — so an empty block
         * is a populated block with the card taken away, rather than a different
         * kind of object. 64px.
         *
         * The whole row is the target, and the pill is a span rather than a
         * button: a button inside a button is two things to tab to and one
         * thing to tap, and the row is what the thumb actually goes for.
         */
        if (!blockEntries.length) {
          return h(
            'section',
            { class: 'flex flex-col' },
            h(
              'button',
              {
                class: 'block-add section-head w-full py-[5px]',
                'aria-label': `Add to ${name.toLowerCase()}`,
                onclick: () => openAddFood({ date: state.date, block }),
              },
              h('span', { class: 'section-label' }, name),
              h('span', { class: 'chip-sm' }, icon('plus', { size: 16 }), 'Add')
            )
          )
        }

        return h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h(
            'div',
            { class: 'section-head' },
            h('div', { class: 'section-label' }, name),
            h(
              'button',
              {
                class: 'chip-sm',
                onclick: () => promptSaveAsMeal(blockEntries, `Usual ${name.toLowerCase()}`),
              },
              'Save as meal'
            )
          ),
          card(
            blockEntries.map((entry) =>
              entryRow(entry, {
                onEdit: openEditEntry,
                onDelete: deleteEntryWithUndo,
                onDuplicate: openDuplicateSheet,
              })
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
          onForward: () => setDate(1),
          forwardLabel: 'Next day',
          forwardDisabled: isToday(state.date),
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
