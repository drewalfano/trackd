import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings } from '../lib/db.js'
import { sumEntries } from '../lib/compute.js'
import { caloriesBlock, macroRow, dayHeader, card, emptyRow } from '../lib/ui.js'
import { entryRow } from '../lib/entryRow.js'
import { deleteEntryWithUndo, openDuplicateSheet } from '../lib/entryActions.js'
import { openAddFood } from '../sheets/addFood.js'
import { openEditEntry } from '../sheets/serving.js'
import { state, setDate } from '../state.js'
import { navigate } from '../router.js'

/**
 * Today. Answers one question — where am I against my numbers — and then gets
 * out of the way. Everything below the totals is a shortcut back into logging.
 */
export function todayScreen() {
  return createScreen(
    async () => {
      const [entries, settings] = await Promise.all([listEntries(state.date), getSettings()])
      const totals = sumEntries(entries)
      const t = settings.targets

      return h(
        'div',
        { class: 'flex flex-col gap-[30px]' },
        dayHeader({ date: state.date, setDate }),

        // The totals sit directly on the page rather than in a card. Wrapping
        // them would put an outlined box inside an outlined box for every bar.
        h(
          'section',
          { class: 'flex flex-col gap-[20px]' },
          caloriesBlock({ value: totals.kcal, target: t.kcal }),
          // Fixed order: protein, fat, carbs.
          macroRow({ macro: 'protein', value: totals.protein, target: t.protein }),
          macroRow({ macro: 'fat', value: totals.fat, target: t.fat }),
          macroRow({ macro: 'carbs', value: totals.carbs, target: t.carbs })
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h(
            'button',
            {
              class: 'flex w-full items-center justify-between gap-[10px]',
              onclick: () => navigate('log'),
            },
            h('span', { class: 'section-label' }, 'Log'),
            h(
              'span',
              { class: 'flex items-center gap-[6px] text-[13px] text-muted' },
              entries.length ? `${entries.length}` : '',
              icon('chevronRight', { size: 20 })
            )
          ),
          // Flat and chronological here. Blocks are a Log page concern.
          card(
            entries.length
              ? entries.map((entry) =>
                  entryRow(entry, {
                    onEdit: openEditEntry,
                    onDelete: deleteEntryWithUndo,
                    onDuplicate: openDuplicateSheet,
                  })
                )
              : emptyRow('Nothing logged yet.', {
                  action: 'Add food',
                  onAction: () => openAddFood({ date: state.date }),
                })
          )
        )
      )
    },
    { watch: ['entries', 'settings', 'foods'] }
  )
}
