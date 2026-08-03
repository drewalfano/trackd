import { h, countTo, haptic } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings } from '../lib/db.js'
import { sumEntries, progress, MACRO_META } from '../lib/compute.js'
import { macroRing } from '../lib/ring.js'
import { tnum, card, macroTextColor, navHeader } from '../lib/ui.js'
import { kcal } from '../lib/format.js'
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
 * ---
 *
 * The card states every value exactly once, and a tap on it changes WHICH
 * value that is: consumed, or remaining, everywhere at once.
 *
 * It used to say each one three times over. Calories read `1105`, then
 * `/ 2837`, then `-1732` at the end of the row; each ring read `115 / 180` and
 * then `65 left` underneath. Every one of those is the same fact — you have
 * eaten some of a number — and the third statement of a fact is not emphasis,
 * it is noise. The gap and the `left` line are gone.
 *
 * What makes that affordable is the tap. Saying it once is only economy if the
 * other reading is still reachable, and it is: one touch anywhere on the card,
 * both readings one gesture apart, neither of them permanently occupying space
 * to say what the other already said.
 *
 * Which one leads is not arbitrary. Consumed runs with its own arc — the number
 * grows as the ring fills — where remaining runs against it, counting down all
 * day while the mark beside it counts up. That disagreement is the reason
 * remaining is not the default, and it stops being a problem the moment it is
 * the reading you asked for rather than the one you were handed.
 */

/**
 * Which reading the card is showing. Module scope, not screen scope, because
 * `createScreen` rebuilds the whole tree on every data change — logging a
 * banana would otherwise snap the card back to consumed under your thumb.
 *
 * Deliberately not persisted to settings. It is a way of looking at today, not
 * a preference about the app, and it costs one tap to get back.
 */
let cardMode = 'consumed'

/**
 * Count up from wherever the number last was, so logging one more thing ticks
 * 2255 → 2504 rather than restarting from zero.
 *
 * This tracks what was last DRAWN rather than what was last eaten, so a toggle
 * counts across the gap too — 1105 running up to 1732 rather than appearing.
 */
let lastKcal = 0

function calorieBlock({ value, target, mode }) {
  const { pct } = progress(value, target)
  // Round the operands, then difference — same rule the rings use.
  const diff = Math.round(Number(value) || 0) - Math.round(Number(target) || 0)
  const remainingMode = mode === 'remaining'
  const shown = remainingMode ? Math.abs(diff) : value

  const number = h('span', { class: 'tnum text-display font-semibold' })
  number.dataset.value = String(lastKcal)
  lastKcal = shown
  countTo(number, shown, { format: (n) => kcal(n) })

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
      // The qualifier the rings use, in the row's own size: the target in
      // consumed mode, the word in remaining.
      tnum(
        remainingMode ? (diff > 0 ? 'over' : 'left') : `/ ${kcal(target)}`,
        'text-[16px] text-muted'
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

/**
 * The card, and the tap that flips it.
 *
 * It repaints itself rather than asking the screen to re-render. The screen's
 * render is async — it reads IndexedDB — and this changes nothing in the
 * database, so going back through `createScreen` would re-read two stores to
 * redraw numbers it already has. It would also rebuild the log, which has
 * nothing to do with this and may have a row swiped open under the user's
 * thumb.
 *
 * `role="button"` rather than a real `<button>`: the card contains a
 * `progressbar`, and a button may not contain another widget. The trade is that
 * the keyboard handling has to be written out — Enter and Space, which a button
 * would have given for free.
 */
function dayCard({ totals, targets }) {
  const card = h('div', {
    class: 'day-card day-card-toggle',
    role: 'button',
    tabindex: '0',
  })

  const paint = () => {
    const remaining = cardMode === 'remaining'
    card.setAttribute('aria-pressed', String(remaining))
    // Names the ACTION, not the state — aria-pressed already carries the state,
    // and "showing remaining" as a label makes the button announce itself as
    // the thing it just did.
    card.setAttribute('aria-label', remaining ? 'Show consumed' : 'Show remaining')
    card.replaceChildren(
      calorieBlock({ value: totals.kcal, target: targets.kcal, mode: cardMode }),
      // Fixed order: protein, fat, carbs. Equal diameter, evenly distributed —
      // comparable to each other, which is the one thing concentric rings
      // cannot do.
      h(
        'div',
        { class: 'day-rings' },
        macroRing({ macro: 'protein', value: totals.protein, target: targets.protein, mode: cardMode }),
        macroRing({ macro: 'fat', value: totals.fat, target: targets.fat, mode: cardMode }),
        macroRing({ macro: 'carbs', value: totals.carbs, target: targets.carbs, mode: cardMode })
      )
    )
  }

  const toggle = () => {
    cardMode = cardMode === 'consumed' ? 'remaining' : 'consumed'
    haptic()
    paint()
  }

  card.addEventListener('click', toggle)
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Space scrolls the page otherwise, and this card is most of the viewport.
    e.preventDefault()
    toggle()
  })

  paint()
  return card
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

        // Both chevrons are always drawn; forward dims on today rather than
        // vanishing. One chevron on the left of a root screen reads as Back,
        // which is not what it does — it steps the day, and the pair is what
        // says so.
        navHeader({
          title: formatDayHeader(state.date),
          onBack: () => setDate(-1),
          backLabel: 'Previous day',
          onForward: () => setDate(1),
          forwardLabel: 'Next day',
          forwardDisabled: isToday(state.date),
        }),

        dayCard({ totals, targets: t }),

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
