import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { entriesInRange, getSettings, loggedDates } from '../lib/db.js'
import { sumEntries, progress } from '../lib/compute.js'
import { macroColor, card, emptyState, tnum } from '../lib/ui.js'
import { kcal, g } from '../lib/format.js'
import { addDays, daysBetween, formatDayLabel, todayStr } from '../lib/dates.js'
import { setDate } from '../state.js'
import { navigate } from '../router.js'

/**
 * History.
 *
 * The weekly average is the number worth designing around — any single day is
 * noise, and seven days of mean calories and mean protein is the honest read on
 * whether the week went the way it was supposed to.
 */

/** Three hairline indicators showing how close protein, fat and carbs landed. */
function macroTicks(totals, targets) {
  return h(
    'div',
    { class: 'flex shrink-0 gap-[10px]' },
    ['protein', 'fat', 'carbs'].map((macro) => {
      const { pct } = progress(totals[macro], targets[macro])
      return h(
        'div',
        {
          class: 'h-1 w-6 overflow-hidden rounded-full',
          style: { background: 'color-mix(in srgb, var(--color-ink) 12%, transparent)' },
          title: `${g(totals[macro])} / ${g(targets[macro])} ${macro}`,
        },
        h('div', {
          class: 'h-full rounded-full',
          style: { width: `${pct}%`, background: macroColor(macro) },
        })
      )
    })
  )
}

function averagesStrip(days, targets) {
  const tracked = days.filter((d) => d.entries.length)
  const last7 = days.slice(0, 7).filter((d) => d.entries.length)
  const mean = (key) =>
    last7.length ? last7.reduce((sum, d) => sum + d.totals[key], 0) / last7.length : 0

  return h(
    'div',
    { class: 'panel flex flex-col gap-[20px] px-[20px] py-[20px]' },
    h(
      'div',
      { class: 'flex items-baseline justify-between' },
      h('span', { class: 'section-label' }, 'Last 7 days'),
      h(
        'span',
        { class: 'text-[12px] text-muted' },
        last7.length ? `${last7.length} of 7 tracked` : 'nothing tracked'
      )
    ),
    h(
      'div',
      { class: 'flex gap-[30px]' },
      h(
        'div',
        { class: 'flex flex-col' },
        tnum(kcal(mean('kcal')), 'text-title font-semibold leading-tight'),
        h(
          'span',
          { class: 'text-[12px] text-muted' },
          `mean cal · target ${kcal(targets.kcal)}`
        )
      ),
      h(
        'div',
        { class: 'flex flex-col' },
        tnum(g(mean('protein')), 'text-title font-semibold leading-tight'),
        h(
          'span',
          { class: 'text-[12px] text-muted' },
          `mean protein · target ${g(targets.protein)}`
        )
      )
    ),
    tracked.length < 3
      ? h(
          'p',
          { class: 'text-[12px] leading-snug text-muted' },
          'Averages get useful after about a week of tracking.'
        )
      : null
  )
}

export function historyScreen() {
  return createScreen(
    async () => {
      const settings = await getSettings()
      const targets = settings.targets
      const dates = await loggedDates()

      if (!dates.length) {
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
      const first = dates[0]
      // Cap the walk so a year of use does not build a thousand rows at once.
      const span = Math.min(daysBetween(first, today), 180)
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
          : // Untracked days stay visible as a hairline so gaps in the record
            // are part of the record.
            h(
              'button',
              {
                class: 'flex w-full items-center gap-[10px] px-[20px] py-[8px]',
                onclick: () => {
                  setDate(day.date)
                  navigate('log')
                },
              },
              h('span', { class: 'shrink-0 text-[12px] text-muted' }, formatDayLabel(day.date)),
              h('span', { class: 'h-px flex-1', style: { background: 'var(--color-hairline)' } }),
              h('span', { class: 'shrink-0 text-[12px] text-muted' }, 'not tracked')
            )
      )

      return h(
        'div',
        { class: 'flex flex-col gap-[30px]' },
        header(),
        averagesStrip(days, targets),
        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Days'),
          card(rows)
        )
      )
    },
    { watch: ['entries', 'settings'], watchDate: false }
  )
}

function header() {
  return h(
    'div',
    { class: 'flex flex-col gap-[10px] pt-[10px]' },
    h(
      'button',
      {
        class: 'flex items-center gap-[10px] self-start px-0 text-[12px] font-medium',
        onclick: () => navigate('log'),
      },
      icon('chevronLeft', { size: 18 }),
      'Log'
    ),
    h(
      'div',
      { class: 'px-0 pt-[10px]' },
      h('h1', { class: 'text-title font-semibold leading-tight' }, 'History'),
      h('p', { class: 'text-[12px] text-muted' }, 'Averages are more honest than any single day.')
    )
  )
}
