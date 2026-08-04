import { h, countTo, haptic, swipePages, pressable } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { listEntries, getSettings, saveCardMode } from '../lib/db.js'
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
 * The card states every value exactly once, and one switch changes WHICH value
 * that is: eaten, or remaining, everywhere at once.
 *
 * It used to say each one three times over. Calories read `1105`, then
 * `/ 2837`, then `-1732` at the end of the row; each ring read `115 / 180` and
 * then `65 left` underneath. Every one of those is the same fact — you have
 * eaten some of a number — and the third statement of a fact is not emphasis,
 * it is noise. The gap and the `left` line are gone.
 *
 * What makes that affordable is that the other reading stays reachable. Saying
 * it once is only economy if you can still ask for the half that is not on
 * screen, and both readings are one touch apart, neither permanently occupying
 * space to say what the other already said.
 *
 * Which one leads is not arbitrary. Eaten runs with its own arc — the number
 * grows as the ring fills — where remaining runs against it, counting down all
 * day while the mark beside it counts up. That disagreement is the reason
 * remaining is not the first-run default, and it stops being a problem the
 * moment it is the reading you asked for rather than the one you were handed.
 *
 * ---
 *
 * **How you get to the other reading has now been through six answers**, and
 * has arrived back where it started. The order is the useful part, because each
 * one only looked wrong once it existed:
 *
 *   1. A bare tap on the card, nothing on screen to say so — undiscoverable.
 *   2. A segmented Eaten / Remaining switch — redundant with the tap, redundant
 *      with the reading, and the reason the header band was as tall as it was.
 *   3. Two paging dots — on a card that pages horizontally with yesterday
 *      peeking in at the left, which made them read as "swipe for more cards".
 *   4. A vertical swap glyph — no longer a paging signal, still an object.
 *   5. A muted state label in the corner — the best of them, and still a fifth
 *      statement of a reading the card already gives four times.
 *   6. The bare tap again.
 *
 * Five of the six were built and looked at rather than argued about, which is
 * the only reason the sixth is a decision instead of the thing nobody got round
 * to. What is left underneath it is `modeReach`: a control with no pixels, so
 * the reading stays reachable without anything claiming space to say so.
 *
 * The discoverability problem is real and is now openly unsolved. See
 * `modeReach`.
 */

/**
 * Which reading the card is showing. Module scope, not screen scope, because
 * `createScreen` rebuilds the whole tree on every data change — logging a
 * banana would otherwise snap the card back under your thumb.
 *
 * Seeded from settings on every build, so the stored preference wins on first
 * paint and the module copy is what every render in between reads. There is no
 * frame of the wrong mode to fix afterwards: the build already awaits
 * `getSettings` for the targets, and nothing mounts until that resolves.
 */
let cardMode = 'consumed'

const MODE_OPTIONS = [
  { value: 'consumed', label: 'Eaten' },
  { value: 'remaining', label: 'Remaining' },
]

/**
 * Seeded from the store ONCE per session, on the first build, and not read from
 * settings again after that.
 *
 * The module copy is authoritative from then on, and it has to be: a build can
 * be triggered by a date swipe milliseconds after the switch was pressed, while
 * the write is still in flight, and re-reading settings there would hand back
 * the value the tap just replaced and snap the card under the thumb. The write
 * is one-way traffic — this screen is the only thing that sets `cardMode` and
 * the only thing that reads it.
 *
 * The cost is that a data import does not adopt the imported reading until the
 * next launch, which is the smallest thing in a backup and the one nobody
 * restores a backup for.
 */
let modeSeeded = false

/**
 * True only for the repaint a mode switch causes, and false again by the end of
 * it. Two things read it, and both are about the same distinction: **a mode
 * switch is not a data change.**
 *
 * The card cannot tell the difference on its own — it gets rebuilt either way,
 * with different numbers in it either way — so it has to be told, or it treats
 * "you asked a different question" exactly like "you ate something".
 */
let modeSwap = false

/**
 * The way to the other reading, for anything that is not a thumb.
 *
 * **Nothing visible marks the switch.** Four things were built and none of them
 * earned the space: a segmented Eaten / Remaining control, two paging dots, a
 * vertical swap glyph, and a muted state label in the corner. The sheet that
 * killed the last of them is in NOTES-use-audit.md, U2.
 *
 * The argument that outlived all four is the card's own, from the top of this
 * file: it already states its reading in words, in four places at once —
 * `1236 over` against `4073 / 2837`, and the same inside every ring. A control
 * that names the reading is the fifth statement of a fact the card was
 * deliberately rebuilt to stop saying twice, and every version of it read as
 * one more object on a card that had just been cleared of two.
 *
 * So the tap stands alone again, and this is what is left underneath it: a
 * control with no pixels, so that the reading is still reachable by keyboard
 * and still announced to a screen reader. Removing the visible one is a design
 * decision; removing the only way in is a regression, and they are not the same
 * edit.
 *
 * **The open cost, stated rather than hidden:** nothing on the screen says the
 * card can be tapped. `.day-card-toggle` in styles.css has admitted that since
 * it was written — "a press only answers the question after you have already
 * asked it" — and it is still true and still unsolved. A first-click test is
 * what would settle whether anyone finds it, and none of the four candidates
 * was worth shipping to avoid running one.
 */
function modeReach(mode, onMode) {
  const other = MODE_OPTIONS.find((o) => o.value !== mode)
  return h(
    'button',
    {
      type: 'button',
      class: 'reach-only',
      onclick: (e) => {
        // The card underneath is a toggle too; without this a press would flip
        // the mode and have the card flip it straight back.
        e.stopPropagation()
        onMode(other.value)
      },
    },
    `Show ${other.label.toLowerCase()}`
  )
}

function seedMode(settings) {
  if (modeSeeded) return
  modeSeeded = true
  if (MODE_OPTIONS.some((o) => o.value === settings.cardMode)) cardMode = settings.cardMode
}

/**
 * Count up from wherever the number last was, so logging one more thing ticks
 * 2255 → 2504 rather than restarting from zero.
 *
 * This tracks what was last DRAWN rather than what was last eaten, so a toggle
 * counts across the gap too — 1105 running up to 1732 rather than appearing.
 */
let lastKcal = 0

function calorieBlock({ value, target, mode, live = true, control = null, swapping = false }) {
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
  /**
   * A mode switch does not count.
   *
   * The count-up was deliberately built to run across a toggle — the note above
   * `lastKcal` says so, "1105 running up to 1732 rather than appearing" — and
   * that was the wrong call. **Counting means the number changed.** On a toggle
   * the number did not change; the question did. 3366 winding down to 1236
   * asserts that a thousand calories left the day, and the eye reads a count as
   * new data arriving, so it lands as the card glitching rather than as the
   * card answering.
   *
   * Seeding `from` with the destination makes `countTo` write it outright, so
   * the swap is a swap. It still counts for everything that IS a data change:
   * logging, editing, deleting.
   */
  number.dataset.value = String(swapping ? shown : live ? lastKcal : shown)
  if (live) lastKcal = shown
  countTo(number, shown, { format: (n) => kcal(n) })

  const fill = h('div', { class: 'kbar-fill', style: { width: '0%' } })
  requestAnimationFrame(() => {
    fill.style.width = `${pct}%`
  })

  return h(
    'div',
    {},
    // The label and the switch share a top edge, and the switch — the taller of
    // the two — is what the band is as tall as. The hero then starts at the
    // bottom of that band, so the number clears the control instead of running
    // up alongside it.
    //
    // `items-start` rather than `items-center` for exactly that reason: centred,
    // the switch hangs 4px below the label and the digits crowd it from
    // underneath. And no gap under the band at all — the label and the number
    // are one typographic unit, and the space the switch already contributes is
    // the only separation they need.
    //
    // The switch is opposite the label rather than under the number because the
    // label is the only thing up here at its own weight; anything nearer the
    // hero would argue with the one mark the card exists to show.
    h(
      'div',
      { class: 'flex items-start justify-between gap-[10px]' },
      h(
        'div',
        {
          class: 'text-[16px] font-semibold leading-tight',
          style: { color: macroTextColor('kcal') },
        },
        MACRO_META.kcal.label
      ),
      control
    ),
    h(
      'div',
      { class: `reading${swapping ? ' reading-swap' : ''} flex items-baseline gap-[8px]` },
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
function dayCard({ totals, targets, live = false, position = 'current', onMode }) {
  const el = h('div', {
    class: live ? 'day-card day-card-toggle' : 'day-card',
    'data-day': position,
    // `inert` as well as `aria-hidden` on the neighbours. Hiding a subtree from
    // assistive tech while leaving real buttons inside it focusable is the one
    // way to make a card that is not on screen answer the Tab key, and the
    // switch put buttons in there for the first time.
    ...(live ? {} : { 'aria-hidden': 'true', inert: true }),
  })

  const paint = () => {
    el.replaceChildren(
      calorieBlock({
        value: totals.kcal,
        target: targets.kcal,
        mode: cardMode,
        live,
        swapping: live && modeSwap,
        // Drawn on the neighbours too, not just the live card. They are the
        // real card at rest and a drag brings them fully into view — one that
        // arrived without the indicator, or with it on the other dot, would be
        // a lie that resolves halfway through the gesture. `inert` is what
        // keeps them from being operable; it is not their job to look
        // different.
        control: modeReach(cardMode, onMode),
      }),
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
            swapping: live && modeSwap,
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
  /**
   * Set the reading, everywhere, and remember it.
   *
   * Paints first and writes after, without waiting: the switch answers on the
   * frame it was pressed, and the trip to IndexedDB is bookkeeping for the next
   * launch rather than something the finger should be held up for. A failed
   * write costs the preference, not the interaction — the card in front of you
   * is already showing what you asked for.
   *
   * Every card repaints, not just the live one. The neighbours are two thirds
   * of what a drag reveals, and a card that changed its mind about what it was
   * showing while sliding into view would be worse than one that never offered
   * the choice.
   */
  const setMode = (next) => {
    if (next === cardMode) return
    cardMode = next
    haptic()
    // Raised for the length of the repaint and lowered again on the far side.
    // Nothing schedules in between — `paint` builds its subtree synchronously —
    // so the flag is read by exactly the elements this switch created, and the
    // next repaint from any other cause finds it down.
    modeSwap = true
    for (const c of cards) c.paint()
    modeSwap = false
    saveCardMode(next).catch(() => {})
  }

  const cards = [
    prev && dayCard({ ...prev, position: 'prev', onMode: setMode }),
    dayCard({ ...current, live: true, position: 'current', onMode: setMode }),
    next && dayCard({ ...next, position: 'next', onMode: setMode }),
  ].filter(Boolean)

  const live = cards.find((c) => c.el.dataset.day === 'current')
  const track = h('div', { class: 'day-deck-track' }, ...cards.map((c) => c.el))
  const deck = h('div', { class: 'day-deck' }, track)

  // The tap that predates the switch, kept for the hands that learned it. It
  // goes through the same setter, so the control it did not come from still
  // ends up marking the right segment.
  //
  // No guard against a swipe landing here as a tap — `swipePages` swallows that
  // click in the capture phase before it reaches this. The switch's own clicks
  // stop short of here on their own; see `modeReach`.
  live.el.addEventListener('click', () => {
    setMode(cardMode === 'consumed' ? 'remaining' : 'consumed')
  })
  pressable(live.el)

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
      // Before anything is built, so the first card drawn is already in the
      // stored reading. `createScreen` does not mount until this build resolves,
      // which is what makes that a guarantee rather than a fast correction.
      seedMode(settings)

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
