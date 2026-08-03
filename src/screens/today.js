import { h, countTo, haptic, swipePages, pressable } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings } from '../lib/db.js'
import { sumEntries, progress, MACRO_META } from '../lib/compute.js'
import { macroRing } from '../lib/ring.js'
import { tnum, card, macroTextColor, navHeader } from '../lib/ui.js'
import { kcal } from '../lib/format.js'
import { formatDayHeader, isToday, addDays } from '../lib/dates.js'
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

function calorieBlock({ value, target, mode, live = true }) {
  const { pct } = progress(value, target)
  // Round the operands, then difference — same rule the rings use.
  const diff = Math.round(Number(value) || 0) - Math.round(Number(target) || 0)
  const remainingMode = mode === 'remaining'
  const shown = remainingMode ? Math.abs(diff) : value

  const number = h('span', { class: 'tnum text-display font-semibold' })
  // Only the live card writes to the shared memory. A neighbour that counted
  // would leave its own total behind as the next card's starting point, so
  // paging would tick from yesterday's calories rather than from what the
  // number on screen actually said.
  number.dataset.value = String(live ? lastKcal : shown)
  if (live) lastKcal = shown
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
 * One day's card. `live` is the one you are actually on.
 *
 * The neighbours are the same component with the same numbers drawn the same
 * way — not a placeholder, not a blurred rectangle. At rest you see 14px of
 * one, so a cheaper stand-in would pass; a drag brings the whole thing into
 * view, and the moment it does, anything less than the real card is a lie that
 * resolves into the truth halfway through the gesture.
 *
 * What `live` gates is everything that is about the day you are ON rather than
 * the day you are looking at: the count-up's memory, the button role, the
 * focus stop, and being visible to a screen reader at all. Three days of
 * numbers announced as one card would be unreadable.
 */
function dayCard({ totals, targets, live = false, position = 'current' }) {
  const el = h('div', {
    class: live ? 'day-card day-card-toggle' : 'day-card',
    'data-day': position,
    ...(live ? { role: 'button', tabindex: '0' } : { 'aria-hidden': 'true' }),
  })

  const paint = () => {
    const remaining = cardMode === 'remaining'
    if (live) {
      el.setAttribute('aria-pressed', String(remaining))
      // Names the ACTION, not the state — aria-pressed already carries the
      // state, and "showing remaining" as a label makes the button announce
      // itself as the thing it just did.
      el.setAttribute('aria-label', remaining ? 'Show consumed' : 'Show remaining')
    }
    el.replaceChildren(
      calorieBlock({ value: totals.kcal, target: targets.kcal, mode: cardMode, live }),
      // Fixed order: protein, fat, carbs. Equal diameter, evenly distributed —
      // comparable to each other, which is the one thing concentric rings
      // cannot do.
      h(
        'div',
        { class: 'day-rings' },
        ...['protein', 'fat', 'carbs'].map((macro) =>
          macroRing({
            macro,
            value: totals[macro],
            target: targets[macro],
            mode: cardMode,
            // Arc animation is remembered per key. The live card keeps the bare
            // macro name so its arcs carry across a re-render; the neighbours
            // get their own, or all three cards would fight over one memory and
            // every render would replay somebody's entrance.
            key: live ? macro : `${macro}:${position}`,
            animate: live,
          })
        )
      )
    )
  }

  paint()
  return { el, paint }
}

/**
 * The deck: the day you are on, with its neighbours parked either side.
 *
 * The 14px of yesterday showing past the left gutter is the entire affordance.
 * There is no arrow and no hint text — a card that is visibly one of a row is
 * already saying it is one of a row, and it says it in the same breath as
 * showing you that yesterday exists and has been filled in.
 *
 * The neighbours are absolutely positioned rather than laid out in a row, which
 * is what keeps the resting state free. A scroller would have to be scrolled to
 * the middle on every build, and `createScreen` builds a fresh tree on every
 * data change — so there would be a frame of yesterday under the header before
 * the correction landed. That is the exact failure the screen swap was written
 * to avoid. Here, rest IS `transform: none`, so a newly built deck is already
 * where it belongs and there is nothing to correct.
 *
 * Which is also why the commit fires at the END of the slide: the outgoing
 * animation parks the incoming card precisely where a fresh deck will draw it,
 * so the rebuild has nothing to move.
 */
function dayDeck({ current, prev, next }) {
  const cards = [
    prev && dayCard({ ...prev, position: 'prev' }),
    dayCard({ ...current, live: true, position: 'current' }),
    next && dayCard({ ...next, position: 'next' }),
  ].filter(Boolean)

  const live = cards.find((c) => c.el.dataset.day === 'current')
  const track = h('div', { class: 'day-deck-track' }, ...cards.map((c) => c.el))
  const deck = h('div', { class: 'day-deck' }, track)

  const toggle = () => {
    cardMode = cardMode === 'consumed' ? 'remaining' : 'consumed'
    haptic()
    // Every card, not just the live one. The neighbours are two thirds of what
    // a drag reveals, and a card that changed its mind about what it was
    // showing while sliding into view would be worse than one that never
    // offered the choice.
    for (const c of cards) c.paint()
  }

  // No guard against a swipe landing here as a tap — `swipePages` swallows that
  // click in the capture phase before it reaches this.
  live.el.addEventListener('click', toggle)
  pressable(live.el)
  live.el.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    // Space scrolls the page otherwise, and this card is most of the viewport.
    e.preventDefault()
    toggle()
  })

  swipePages(deck, {
    track,
    // Measured, not computed from the gap token, so the two cannot drift. Both
    // cards sit on the same track, so the distance holds mid-drag.
    pageWidth: () => {
      const other = (prev ? cards[0] : cards[cards.length - 1])?.el
      const a = live.el.getBoundingClientRect()
      if (!other || other === live.el) return a.width
      return Math.abs(other.getBoundingClientRect().left - a.left)
    },
    // Forward off today would be tomorrow, which has not happened. Same rule
    // the header's forward chevron is disabled by.
    reach: (dir) => dir === -1 || !isToday(state.date),
    onCommit: (dir) => setDate(dir),
  })

  return deck
}

export function todayScreen() {
  return createScreen(
    async () => {
      // The neighbours are read alongside the day itself rather than lazily on
      // the first drag. A gesture that has to wait on IndexedDB before it can
      // show you what it is dragging in is a gesture that stutters exactly
      // once, on the first use, which is the worst possible time.
      const forward = isToday(state.date) ? null : addDays(state.date, 1)
      const [entries, prevEntries, nextEntries, settings] = await Promise.all([
        listEntries(state.date),
        listEntries(addDays(state.date, -1)),
        forward ? listEntries(forward) : Promise.resolve(null),
        getSettings(),
      ])
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

        // Targets are `settings.targets` for every card in the deck, including
        // the neighbours. That is what Today already did for the day you step
        // to with a chevron, so the deck is not inventing a second rule —
        // per-day targets are History's job, and this is not History.
        dayDeck({
          current: { totals, targets: t },
          prev: { totals: sumEntries(prevEntries), targets: t },
          next: nextEntries ? { totals: sumEntries(nextEntries), targets: t } : null,
        }),

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
