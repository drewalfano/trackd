import { h, repaint } from './dom.js'
import { icon } from './icons.js'
import { fromDateStr, toDateStr, todayStr } from './dates.js'

/**
 * A month grid, in the app's own language.
 *
 * **This exists because the native one cannot be styled.** `ui.js` used to argue
 * the opposite — "the one control where the platform picker is unambiguously
 * better than anything worth building here" — and that was right about the
 * INPUT and wrong about the POPUP. `showPicker()` hands the whole surface to the
 * browser: on desktop Chrome that is a white card with blue accents, its own
 * radii, its own type, and its own idea of a selected day, sitting over an app
 * that has spent a design system's worth of decisions on all four. No CSS
 * reaches inside it. The choice is not "style it or leave it", it is "build it
 * or accept a foreign object".
 *
 * What the native picker was genuinely buying is kept, and it is the part nobody
 * wants to hand-roll: the locale's own week order and day names. Both come from
 * `Intl` here rather than being assumed — a hard-coded Sunday-first grid with
 * English initials is the usual way a custom picker is worse than the one it
 * replaced.
 */

/**
 * The locale's first weekday as 0=Sunday.
 *
 * `Intl` reports 1=Monday…7=Sunday, so Sunday arrives as 7 and `% 7` maps it
 * back to 0. `getWeekInfo` is not everywhere yet — Firefox exposes it as a
 * `weekInfo` property instead, and older Safari has neither — so both spellings
 * are tried before falling back to Sunday.
 */
function firstDayOfWeek() {
  try {
    const locale = new Intl.Locale(navigator.language)
    const info = typeof locale.getWeekInfo === 'function' ? locale.getWeekInfo() : locale.weekInfo
    if (info?.firstDay) return info.firstDay % 7
  } catch {
    /* no Intl.Locale, or a language tag it will not parse */
  }
  return 0
}

/**
 * Narrow weekday initials, rotated to start on the locale's first day.
 *
 * Counted off a date known to be a Sunday rather than off today, so the labels
 * do not depend on when the picker happens to be opened.
 */
function weekdayLabels(first) {
  const sunday = new Date(2024, 0, 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday)
    d.setDate(sunday.getDate() + ((first + i) % 7))
    return d.toLocaleDateString(undefined, { weekday: 'narrow' })
  })
}

/**
 * Always six rows, never five.
 *
 * A grid sized to its month is 44px shorter in February, and paging months would
 * resize the sheet under the thumb every few taps. The trailing days are drawn
 * muted and stay pickable — they are real days, and a grid that shows you
 * September the 1st but refuses it is a worse answer than one that takes you
 * there.
 */
function monthCells(year, month, first) {
  const lead = (new Date(year, month, 1).getDay() - first + 7) % 7
  const start = new Date(year, month, 1 - lead)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

/**
 * A panel spec for the sheet's own stack — push it, do not open it.
 *
 * Being a panel rather than a popover is what makes this work on a phone: the
 * grid gets the sheet's full width, so a day is a 44px target instead of the
 * 30-odd a floating card would allow, and it arrives with a back chevron and a
 * title for free. Picking a day pops straight back to the log.
 *
 * `max` defaults to today, matching the log header's forward chevron — the day
 * after today is a day nothing can have been eaten on, and the two controls
 * should not disagree about that.
 */
export function datePickerPanel({ value, max = todayStr(), min = null, onPick }) {
  return {
    title: 'Pick a day',
    render: (ctx) => {
      const selected = value
      const today = todayStr()
      const first = firstDayOfWeek()
      const cursor = fromDateStr(selected)
      let year = cursor.getFullYear()
      let month = cursor.getMonth()

      const label = h('div', { class: 'cal-month' })
      const grid = h('div', { class: 'cal-grid', role: 'grid' })

      const prev = h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': 'Previous month',
          onclick: () => {
            month -= 1
            if (month < 0) {
              month = 11
              year -= 1
            }
            paint()
          },
        },
        icon('chevronLeft', { size: 20, stroke: 2 })
      )

      const next = h(
        'button',
        {
          class: 'icon-btn',
          'aria-label': 'Next month',
          onclick: () => {
            month += 1
            if (month > 11) {
              month = 0
              year += 1
            }
            paint()
          },
        },
        icon('chevronRight', { size: 20, stroke: 2 })
      )

      /**
       * Picking pops the panel itself rather than leaving that to the caller.
       * Choosing a day IS finishing with this screen, and a picker that stayed
       * open after you had answered it would be asking twice.
       */
      const choose = (iso) => {
        onPick(iso)
        ctx.pop()
      }

      const jumpToday = h(
        'button',
        {
          class: 'btn-secondary',
          onclick: () => choose(today),
        },
        'Today'
      )
      ctx.setFooter(jumpToday)

      function paint() {
        label.textContent = new Date(year, month, 1).toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        })

        // A month whose every day is past `max` has nothing to offer, so the
        // chevron that would reach it is closed off rather than left to land on
        // a grid of dead cells.
        next.disabled = !!max && toDateStr(new Date(year, month + 1, 1)) > max
        prev.disabled = !!min && toDateStr(new Date(year, month, 0)) < min

        repaint(
          grid,
          ...monthCells(year, month, first).map((d) => {
            const iso = toDateStr(d)
            const outside = d.getMonth() !== month
            const disabled = (max && iso > max) || (min && iso < min)

            return h(
              'button',
              {
                class: 'cal-day',
                role: 'gridcell',
                'data-outside': String(outside),
                'data-today': String(iso === today),
                'aria-pressed': String(iso === selected),
                'aria-current': iso === today ? 'date' : null,
                // The visible cell is a bare number, which says nothing on its
                // own once it is read aloud out of the grid it sits in.
                'aria-label': d.toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
                disabled,
                onclick: () => choose(iso),
              },
              String(d.getDate())
            )
          })
        )
      }

      paint()

      return h(
        'div',
        { class: 'flex flex-col gap-[10px]' },
        h('div', { class: 'cal-head' }, prev, label, next),
        h(
          'div',
          { class: 'cal-dow-row', 'aria-hidden': 'true' },
          ...weekdayLabels(first).map((d) => h('div', { class: 'cal-dow' }, d))
        ),
        grid
      )
    },
  }
}
