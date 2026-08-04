import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { entriesInRange, getSettings, firstLoggedDate } from '../lib/db.js'
import {
  sumEntries,
  progress,
  weeklyAverages,
  AVERAGES_MIN_DAYS,
  MACRO_META,
} from '../lib/compute.js'
import { macroColor, macroTextColor, card, emptyState, tnum, navHeader } from '../lib/ui.js'
import { kcal, g } from '../lib/format.js'
import { addDays, daysBetween, formatDayLabel, todayStr } from '../lib/dates.js'
import { setDate } from '../state.js'
import { navigate } from '../router.js'
import { openAddFood } from '../sheets/addFood.js'

/**
 * History.
 *
 * The weekly average is the number worth designing around — any single day is
 * noise, and seven days of mean calories and mean protein is the honest read on
 * whether the week went the way it was supposed to.
 */

/**
 * Three hairline indicators showing how close protein, fat and carbs landed.
 *
 * Labelled, because this is the only place the macro hues appear at this size
 * and colour alone is not a label — for the eight percent of men who cannot
 * separate the red from the gold, three grey ticks is all this ever was. The
 * letter is the macro's own initial from `MACRO_META`, so it stays in step if
 * the palette ever moves.
 *
 * The `title` stays as well: it carries the actual grams, which no tick can.
 */
function macroTicks(totals, targets) {
  return h(
    'div',
    { class: 'flex shrink-0 gap-[10px]' },
    ['protein', 'fat', 'carbs'].map((macro) => {
      const { pct } = progress(totals[macro], targets[macro])
      return h(
        'div',
        {
          class: 'flex flex-col items-center gap-[3px]',
          title: `${g(totals[macro])} / ${g(targets[macro])} ${macro}`,
        },
        h(
          'div',
          {
            class: 'h-1 w-6 overflow-hidden rounded-full',
            style: { background: 'color-mix(in srgb, var(--color-ink) 12%, transparent)' },
          },
          h('div', {
            class: 'h-full rounded-full',
            style: { width: `${pct}%`, background: macroColor(macro) },
          })
        ),
        h(
          'span',
          {
            class: 'text-[9px] font-semibold leading-none',
            style: { color: macroTextColor(macro) },
            'aria-hidden': 'true',
          },
          MACRO_META[macro].letter
        )
      )
    })
  )
}

/**
 * The weekly averages, or the reason there aren't any.
 *
 * Under the threshold this renders no mean at all. The caption that used to sit
 * beneath the figures was honest and lost anyway — it was 12px muted text under
 * a 30px semibold number, and the number lands first. Type hierarchy beats
 * copy, so the fix has to be structural rather than a better sentence.
 *
 * What replaces it is the tracked count at the same weight the mean would have
 * had. It is the true headline at that point: how much of the week is on the
 * record is the only thing the app actually knows yet.
 */
function averagesStrip(days, targets) {
  const week = weeklyAverages(days)

  const figure = (value, caption) =>
    h(
      'div',
      { class: 'flex flex-col' },
      tnum(value, 'text-title font-semibold leading-tight'),
      h('span', { class: 'text-[12px] text-muted' }, caption)
    )

  if (!week.enough) {
    const remaining = AVERAGES_MIN_DAYS - week.tracked
    return h(
      'div',
      { class: 'day-card flex flex-col gap-[20px]' },
      h('span', { class: 'section-label' }, 'Last 7 days'),
      figure(`${week.tracked} of ${week.of}`, 'days tracked'),
      h(
        'p',
        { class: 'text-[12px] leading-snug text-muted' },
        `Averages start at ${AVERAGES_MIN_DAYS} tracked days — ${remaining} more to go. ` +
          'A mean of one day is just that day.'
      )
    )
  }

  return h(
    'div',
    { class: 'day-card flex flex-col gap-[20px]' },
    h(
      'div',
      { class: 'flex items-baseline justify-between' },
      h('span', { class: 'section-label' }, 'Last 7 days'),
      h('span', { class: 'text-[12px] text-muted' }, `${week.tracked} of ${week.of} tracked`)
    ),
    h(
      'div',
      { class: 'flex gap-[30px]' },
      figure(kcal(week.kcal), `mean cal · target ${kcal(targets.kcal)}`),
      figure(g(week.protein), `mean protein · target ${g(targets.protein)}`)
    )
  )
}

export function historyScreen() {
  return createScreen(
    async () => {
      const settings = await getSettings()
      const targets = settings.targets
      const first = await firstLoggedDate()

      if (!first) {
        return h(
          'div',
          { class: 'flex flex-col gap-[20px]' },
          header(),
          emptyState(
            'No history yet',
            'Once you have logged a few days, this is where the weekly averages live.'
          )
        )
      }

      const today = todayStr()
      /**
       * Always at least a full week, capped at 180 days.
       *
       * The floor is the fix for the empty-looking first week: the walk used to
       * start at the first logged day, so one day tracked drew exactly one row
       * and the screen was mostly dead space under a card about seven days. The
       * window now has a stable shape from the start and fills in rather than
       * growing. The cap stops a year of use building a thousand rows at once.
       */
      const span = Math.max(6, Math.min(daysBetween(first, today), 180))
      const start = addDays(today, -span)

      const all = await entriesInRange(start, today)
      const byDate = new Map()
      for (const entry of all) {
        if (!byDate.has(entry.date)) byDate.set(entry.date, [])
        byDate.get(entry.date).push(entry)
      }

      const days = []
      for (let i = 0; i <= span; i++) {
        const date = addDays(today, -i)
        const entries = byDate.get(date) || []
        days.push({ date, entries, totals: sumEntries(entries) })
      }

      const rows = days.map((day) =>
        day.entries.length
          ? h(
              'button',
              {
                class: 'row',
                onclick: () => {
                  setDate(day.date)
                  navigate('log')
                },
              },
              h(
                'div',
                { class: 'min-w-0 flex-1' },
                h('div', { class: 'truncate text-[16px] font-semibold' }, formatDayLabel(day.date)),
                h(
                  'div',
                  { class: 'mt-[2px] text-[12px] text-muted' },
                  `${day.entries.length} item${day.entries.length === 1 ? '' : 's'}`
                )
              ),
              macroTicks(day.totals, targets),
              h(
                'span',
                // A right-aligned column, so the digits must not drift.
                { class: 'w-[70px] shrink-0 text-right text-[16px] font-semibold' },
                tnum(kcal(day.totals.kcal)),
                h('span', { class: 'ml-[4px] text-[12px] font-normal text-muted' }, 'cal')
              ),
              icon('chevronRight', { size: 16, class: 'shrink-0 text-muted' })
            )
          : /**
             * Untracked days stay visible as a hairline so gaps in the record
             * are part of the record — but they were the only rows on the
             * screen with no chevron, while being the only rows with an obvious
             * next action. They now carry one and open the add sheet for that
             * day rather than a log with nothing in it.
             *
             * Opening the add sheet on a past day is only safe because the
             * sheet titles itself "Add to Thu, 30 Jul" when the target is not
             * today. Without that this would be a way to log to the wrong day
             * without ever seeing which one.
             */
            h(
              'button',
              {
                class: 'flex w-full items-center gap-[10px] px-[20px] py-[8px]',
                onclick: () => openAddFood({ date: day.date }),
              },
              h('span', { class: 'shrink-0 text-[12px] text-muted' }, formatDayLabel(day.date)),
              h('span', { class: 'h-px flex-1', style: { background: 'var(--color-outline)' } }),
              h('span', { class: 'shrink-0 text-[12px] text-muted' }, 'not tracked'),
              icon('chevronRight', { size: 16, class: 'shrink-0 text-muted' })
            )
      )

      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },
        header(),
        averagesStrip(days, targets),
        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-title' }, 'Days'),
          card(rows)
        )
      )
    },
    { watch: ['entries', 'settings'], watchDate: false }
  )
}

function header() {
  return navHeader({
    title: 'History',
    onBack: () => navigate('log'),
    backLabel: 'Back to Log',
  })
}
