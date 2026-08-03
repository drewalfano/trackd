import { h, countTo } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings } from '../lib/db.js'
import { sumEntries, progress, MACRO_META } from '../lib/compute.js'
import { macroRing } from '../lib/ring.js'
import { tnum, digits, card, macroTextColor, navHeader } from '../lib/ui.js'
import { kcal, signed } from '../lib/format.js'
import { formatDayHeader, isToday } from '../lib/dates.js'
import { entryRow } from '../lib/entryRow.js'
import { deleteEntryWithUndo, openDuplicateSheet } from '../lib/entryActions.js'
import { openEditEntry } from '../sheets/serving.js'
import { state, setDate } from '../state.js'
import { navigate } from '../router.js'

/**
 * Today. A dashboard card, then the log.
 *
 * Calories is the summary and the macros are the breakdown that explains it,
 * so calories gets the number and the full-width bar while the macros get
 * three equal rings. Splitting the log into its own group is what lets the
 * dashboard be the thing you actually came for.
 *
 * Every value on the card is stated ONCE. The rings carry the gap to target in
 * their centres, which is why there is no `153g / 185g` line underneath them.
 */

/**
 * Count up from wherever the number last was, so logging one more thing ticks
 * 2255 → 2504 rather than restarting from zero.
 */
let lastKcal = 0

function calorieBlock({ value, target }) {
  const { pct } = progress(value, target)
  // Round the operands, then difference — same rule the rings use.
  const diff = Math.round(Number(value) || 0) - Math.round(Number(target) || 0)

  const number = h('span', { class: 'tnum text-display font-semibold' })
  number.dataset.value = String(lastKcal)
  lastKcal = value
  countTo(number, value, { format: (n) => kcal(n) })

  const fill = h('div', { class: 'kbar-fill', style: { width: '0%' } })
  requestAnimationFrame(() => {
    fill.style.width = `${pct}%`
  })

  return h(
    'div',
    {},
    h(
      'div',
      { class: 'text-[16px] font-semibold leading-tight', style: { color: macroTextColor('kcal') } },
      MACRO_META.kcal.label
    ),
    h(
      'div',
      { class: 'mt-[4px] flex items-baseline gap-[8px]' },
      number,
      tnum(`/ ${kcal(target)}`, 'text-[16px] text-muted'),
      // The gap to target, in the same signed form the rings use. Pushed to the
      // end of the row so the eye can read consumed-then-remaining or skip
      // straight to the number that decides dinner.
      h(
        'div',
        {
          class: 'tnum ml-auto text-[16px] font-semibold',
          style: { color: macroTextColor('kcal') },
        },
        ...digits(signed(diff, 0))
      )
    ),
    h(
      'div',
      {
        class: 'mt-[10px] kbar',
        role: 'progressbar',
        'aria-valuenow': Math.round(value),
        'aria-valuemin': '0',
        'aria-valuemax': Math.round(target) || 0,
      },
      fill
    )
  )
}

export function todayScreen() {
  return createScreen(
    async () => {
      const [entries, settings] = await Promise.all([listEntries(state.date), getSettings()])
      const totals = sumEntries(entries)
      const t = settings.targets

      return h(
        'div',
        // Gaps are set per element rather than by a uniform flex gap. Even
        // spacing reads as a list; varied spacing reads as a composition.
        { class: 'flex flex-col' },

        // Forward exists only when there is somewhere forward to go. The mockup
        // shows Today, where it would be disabled anyway — but without it,
        // stepping back once strands you in the past with no way home.
        navHeader({
          title: formatDayHeader(state.date),
          onBack: () => setDate(-1),
          backLabel: 'Previous day',
          onForward: isToday(state.date) ? null : () => setDate(1),
          forwardLabel: 'Next day',
        }),

        h(
          'div',
          { class: 'day-card' },
          calorieBlock({ value: totals.kcal, target: t.kcal }),
          // Fixed order: protein, fat, carbs. Equal diameter, evenly
          // distributed — comparable to each other, which is the one thing
          // concentric rings cannot do.
          h(
            'div',
            { class: 'day-rings' },
            macroRing({ macro: 'protein', value: totals.protein, target: t.protein }),
            macroRing({ macro: 'fat', value: totals.fat, target: t.fat }),
            macroRing({ macro: 'carbs', value: totals.carbs, target: t.carbs })
          )
        ),

        // The log. Its own group, and the route to the full Log screen — which
        // is in turn the only route to History, so this link keeps both
        // reachable. No empty state yet; an unlogged day drops the section.
        entries.length
          ? h(
              'section',
              { class: 'mt-[20px] flex flex-col gap-[10px]' },
              h(
                'div',
                { class: 'section-head' },
                h('div', { class: 'section-label' }, 'Log'),
                h(
                  'button',
                  { class: 'chip-sm', onclick: () => navigate('log') },
                  'Full Log'
                )
              ),
              card(
                entries.map((entry) =>
                  entryRow(entry, {
                    onEdit: openEditEntry,
                    onDelete: deleteEntryWithUndo,
                    onDuplicate: openDuplicateSheet,
                  })
                )
              )
            )
          : null
      )
    },
    { watch: ['entries', 'settings', 'foods'] }
  )
}
