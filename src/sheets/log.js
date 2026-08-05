import { h, repaint } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { listEntries, getSettings, toggleFavourite, onChange } from '../lib/db.js'
import { sumEntries, progress, MACRO_ORDER, MACRO_META } from '../lib/compute.js'
import { saveEntriesAsMeal } from '../lib/logging.js'
import { card, macroColor, macroEdgeColor, macroTextColor, digits } from '../lib/ui.js'
import { textInput, labelledField } from '../lib/ui.js'
import { entryRow } from '../lib/entryRow.js'
import { deleteEntryWithUndo, openDuplicateSheet } from '../lib/entryActions.js'
import { openEditEntry } from './serving.js'
import { openAddFood } from './addFood.js'
import { toast } from '../lib/toast.js'
import { openSheet, presentSheet } from '../lib/sheet.js'
import { g, kcal } from '../lib/format.js'
import { BLOCKS, formatDayHeader } from '../lib/dates.js'
import { state, subscribe } from '../state.js'

/**
 * The Log day view, as a sheet over Today.
 *
 * It was a routed screen, and the reason it stopped being one is that it had
 * three navigation models running at once and none of them left. A back chevron
 * that did not go back — it stepped the day — a tab bar saying this was a
 * top-level destination, and a History pill saying it was a browser. Three
 * controls that changed the date and nothing at all that closed it. The only way
 * out was the tab bar, which is a way of leaving the whole tab rather than this.
 *
 * A sheet answers that structurally instead of by relabelling: the scrim leaves
 * Today visibly behind it, so "this is temporary" needs no word to say it, and
 * the exit is the thing every other sheet in the app already has. What is left
 * in the header is one date control and one close button.
 *
 * This is the only surface where the time blocks are visible, which is still
 * correct: blocks are how you review a day, not how you log one.
 */

/* ------------------------------------------------------------- save as meal */

/**
 * `host` is the log's own ctx. Saving a meal is a step INTO the sheet rather
 * than a replacement for it — without this it would call `openSheet`, destroy
 * the log underneath it, and drop you on Today when it closed.
 */
async function promptSaveAsMeal(entries, defaultName, host) {
  return presentSheet(
    {
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
              ctx.pop()
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
    },
    host
  )
}

/* ----------------------------------------------------------------- summary */

/**
 * One macro: its name, `consumed / target`, and a thin bar.
 *
 * **This card is the reason the sheet is worth opening.** It used to read
 * `3 items` and `295 cal · 5 P · 8 F · 52 C` — four raw totals with nothing to
 * measure them against, on a screen reached from a card that shows the same day
 * as rings against targets. The drill-down was strictly less informative than
 * the thing it drilled into, which is backwards.
 *
 * The display convention is the one already established in `macroRow` and
 * `caloriesBlock`: the macro's name carries the colour, the consumed figure
 * stays in ink so it is readable, and the target trails it muted. Colour still
 * only ever means macro identity.
 *
 * Over target is a chip rather than a colour change — see `.chip-over`. Nothing
 * here goes red on excess, and carbs owns the only red in the palette anyway.
 */
function targetRow({ macro, value, target }) {
  const { pct, over } = progress(value, target)
  const isKcal = macro === 'kcal'
  const fmt = (n) => (isKcal ? kcal(n) : `${g(n)} g`)

  const fill = h('div', {
    class: 'bar-thin-fill',
    style: { width: '0%', background: macroColor(macro) },
  })
  // Painted at zero, then released on the next frame so the bar grows into
  // place rather than appearing full. The sheet animates in over 260ms and this
  // runs underneath it.
  requestAnimationFrame(() => {
    fill.style.width = `${pct}%`
  })

  return h(
    'div',
    { class: 'flex flex-col gap-[6px]' },
    h(
      'div',
      { class: 'flex items-baseline justify-between gap-[10px]' },
      h(
        'span',
        { class: 'shrink-0 text-[14px] font-semibold', style: { color: macroTextColor(macro) } },
        MACRO_META[macro].label
      ),
      h(
        'div',
        { class: 'flex min-w-0 items-baseline gap-[6px]' },
        over > 0
          ? h(
              'span',
              { class: 'chip-over', style: { background: macroEdgeColor(macro) } },
              `+${Math.round(over)}`
            )
          : null,
        h(
          'span',
          { class: 'tnum shrink-0 text-[14px]' },
          h('span', { class: 'font-semibold' }, ...digits(fmt(value))),
          h('span', { class: 'text-muted' }, ...digits(` / ${fmt(target)}`))
        )
      )
    ),
    h(
      'div',
      {
        class: 'bar-thin',
        role: 'progressbar',
        'aria-label': MACRO_META[macro].label,
        'aria-valuenow': Math.round(value),
        'aria-valuemin': '0',
        'aria-valuemax': Math.round(target) || 0,
      },
      fill
    )
  )
}

/**
 * `.panel`, not `.card`. A card rules a hairline between its children because
 * its children are a list of rows; these four are one layout, and the dividers
 * cut the summary into four unrelated statements instead of one reading.
 */
function summaryCard(totals, targets) {
  return h(
    'div',
    { class: 'panel flex flex-col gap-[14px] px-[20px] py-[20px]' },
    ...MACRO_ORDER.map((macro) =>
      targetRow({ macro, value: totals[macro], target: targets[macro] })
    )
  )
}

/* -------------------------------------------------------------------- body */

function loadDay(date) {
  return Promise.all([listEntries(date), getSettings()]).then(([entries, settings]) => ({
    entries,
    settings,
  }))
}

/**
 * A period with nothing in it: one row, the name at reduced weight, and the same
 * `Add` pill a populated period's heading carries.
 *
 * The whole row is the target and the pill is a span rather than a button — a
 * button inside a button is two things to tab to and one thing to tap, and the
 * row is what the thumb actually goes for.
 */
function emptyBlock({ name, block, date, host }) {
  return h(
    'section',
    { class: 'flex flex-col' },
    h(
      'button',
      {
        class: 'block-add section-head w-full py-[5px]',
        'aria-label': `Add to ${name.toLowerCase()}`,
        onclick: () => openAddFood({ date, block }, host),
      },
      h('span', { class: 'block-empty-label' }, name),
      h('span', { class: 'chip-sm' }, icon('plus', { size: 16 }), 'Add')
    )
  )
}

/**
 * A meal is a combination, so one entry is not one.
 *
 * Below this the button offered to bundle a single food into a named, pinned
 * group — which the app can already do, better, one screen away: the entry's
 * Edit sheet carries a star that pins the underlying food to Favourites, and
 * pinned foods and saved meals land in the same list. So at one entry the
 * control was not a shortcut to something else, it was a worse spelling of
 * something that existed.
 */
const SAVE_AS_MEAL_MIN = 2

function populatedBlock({ name, entries, host }) {
  return h(
    'section',
    { class: 'flex flex-col gap-[10px]' },
    h(
      'div',
      { class: 'section-head' },
      h('div', { class: 'section-label' }, name),
      entries.length >= SAVE_AS_MEAL_MIN
        ? h(
            'button',
            {
              class: 'chip-sm',
              onclick: () => promptSaveAsMeal(entries, `Usual ${name.toLowerCase()}`, host),
            },
            'Save as meal'
          )
        : null
    ),
    card(
      entries.map((entry) =>
        entryRow(entry, {
          onEdit: (e) => openEditEntry(e, host),
          onDelete: deleteEntryWithUndo,
          onDuplicate: (e) => openDuplicateSheet(e, host),
        })
      )
    )
  )
}

/**
 * Open the log for whatever day `state.date` is on.
 *
 * **This sheet reads the date and never writes it.** It briefly owned a full set
 * of day controls — two chevrons and a tappable date opening a picker — and that
 * was the wrong half of the problem to solve. The sheet does not cover the
 * viewport, so Today's own header stays visible above it, and the result was two
 * date steppers on screen at once doing the same job to the same value. Dimming
 * one does not make it not a control.
 *
 * Navigation belongs to the layer that already had it. Today steps the day; this
 * is the detail view of whichever day that landed on, and its header is a label
 * rather than a control. The only thing it can do is close.
 *
 * The date cannot change while the sheet is open — Today is behind a scrim and
 * cannot be reached — but the subscription stays anyway, because "cannot happen"
 * is a property of today's layout rather than a guarantee, and a sheet showing
 * one day under a title naming another is the worst thing it could do.
 *
 * The first read is awaited BEFORE the sheet is built, so it animates in with
 * the day already in it. Every read after that repaints in place, where there is
 * no empty frame to show because the previous day is still on screen until the
 * new one replaces it.
 */
export async function openLogSheet() {
  let data = await loadDay(state.date)

  return openSheet({
    /**
     * The plain sheet title, which is now all the header needs to be — so the
     * custom-header machinery this sheet was the only user of is gone with it.
     */
    title: formatDayHeader(state.date),
    // Deliberately more than the 20 every other sheet leaves. The log is tall
    // enough to hit its own cap, and a sheet that stops one hairline short of
    // the status bar has stopped being a sheet — the visible band of Today above
    // it is what says this is temporary, without a word spent saying so.
    inset: 60,
    render: (ctx) => {
      const body = h('div', { class: 'flex flex-col gap-[20px]' })

      const paint = () => {
        const { entries, settings } = data
        const totals = sumEntries(entries)

        const sections = BLOCKS.map((block, i) => {
          const blockEntries = entries.filter((e) => e.block === block)
          const name = settings.blockNames[i]
          return blockEntries.length
            ? populatedBlock({ name, entries: blockEntries, host: ctx })
            : emptyBlock({ name, block, date: state.date, host: ctx })
        })

        repaint(
          body,
          summaryCard(totals, settings.targets),
          /**
           * A day with nothing on it gets one line, not three empty periods.
           *
           * Three rows that each say a different part of the day is empty are
           * three statements of one fact, and the fact is "you have not logged
           * anything yet". The periods come back the moment there is anything to
           * sort into them.
           */
          entries.length
            ? sections
            : card(
                h(
                  'button',
                  {
                    class: 'row justify-between',
                    onclick: () => openAddFood({ date: state.date }, ctx),
                  },
                  h('span', { class: 'text-[14px] text-muted' }, 'Nothing logged yet'),
                  h('span', { class: 'chip-sm' }, icon('plus', { size: 16 }), 'Add')
                )
              )
        )
      }

      const reload = () =>
        loadDay(state.date).then((next) => {
          data = next
          paint()
        })

      paint()

      /**
       * The sheet keeps itself current, which a routed screen got from
       * `createScreen` for free and a sheet does not.
       *
       * Both subscriptions are registered as disposers, so they are torn down
       * when the sheet closes — and also when this panel is re-rendered, since
       * `ctx.refresh` runs the disposers before calling `render` again. Without
       * that, every refresh would leave a live listener behind holding a body
       * that is no longer on screen.
       */
      ctx.onDispose(
        onChange((scope) => {
          if (['entries', 'settings', 'meals', 'all'].includes(scope)) reload()
        })
      )
      ctx.onDispose(
        subscribe(() => {
          ctx.setTitle(formatDayHeader(state.date))
          reload()
        })
      )

      return body
    },
  })
}
