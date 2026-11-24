import { h } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { getSettings, listWorkouts } from '../lib/db.js'
import { openSheet } from '../lib/sheet.js'
import { icon } from '../lib/icons.js'
import { MUSCLE_GROUPS, MUSCLE_LABELS, unknownExercises } from '../lib/muscles.js'
import {
  NO_WORKOUTS,
  RAMP,
  WEIGHTED_BASIS,
  musclesSentence,
  rampStep,
  regionName,
  regionSets,
  setCount,
  setsFigure,
  trainingWeek,
  weekLabel,
  weekStart,
  weekSummary,
} from '../lib/training.js'
import { trendsPage } from '../lib/trendTile.js'
import { card, listRow, notice, rowChevron, tnum } from '../lib/ui.js'
import { pluralize } from '../lib/format.js'
import { addDays, formatDayAge, formatDayLabel, formatTime, todayStr } from '../lib/dates.js'
import { navigate } from '../router.js'
import { openUnchosen, pickWorkouts } from '../sheets/importWorkouts.js'
import { pasteWorkout } from '../sheets/pasteWorkout.js'
import { bodyPair, openWorkout } from '../sheets/workout.js'

/**
 * Training, one level under Trends. A week at a time: the map, every muscle by
 * weighted sets, then the workouts.
 *
 * The figures are small enough side by side that the list under them is the
 * easy way to open any one muscle.
 */
export function trainingScreen() {
  // Which week, for as long as the page is open.
  let start = null

  return createScreen(
    async ({ rerender }) => {
      const [settings, workouts] = await Promise.all([getSettings(), listWorkouts()])
      const mappings = settings.exerciseMuscles
      const show = (next) => {
        start = next
        rerender()
      }
      const page = (...children) =>
        trendsPage(
          {
            title: 'Training',
            right: h(
              'button',
              {
                class: 'chip-sm',
                type: 'button',
                // The read has to start inside this tap; see `pasteWorkout`.
                onclick: () => pasteWorkout({ onSaved: (w) => show(weekStart(w.date)) }),
              },
              'Paste workout'
            ),
            onBack: () => navigate('trends'),
          },
          ...children
        )

      if (!workouts.length) {
        return page(
          h(
            'div',
            { class: 'day-card flex flex-col items-start gap-[10px]' },
            h(
              'p',
              { class: 'text-[14px] leading-snug text-muted' },
              `${NO_WORKOUTS}, or import its Excel export. Import is also in Settings, under Data.`
            ),
            h('button', { class: 'chip-sm', type: 'button', onclick: pickWorkouts }, 'Import from Motra')
          )
        )
      }

      const unchosen = unknownExercises(workouts.flatMap((w) => w.exercises), mappings)
      const current = weekStart(todayStr())
      const first = weekStart(workouts.at(-1).date)
      const newest = weekStart(workouts[0].date)
      const last = newest > current ? newest : current
      start ??= current
      const week = trainingWeek(workouts, start, mappings)
      const when = start === current ? 'this week' : 'that week'
      const worked = week.workouts.length > 0
      const open = (groups) => openSheet(regionSheet(groups, week))

      const step = (dir, label, name, off) =>
        h(
          'button',
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': label,
            disabled: off,
            onclick: () => show(addDays(start, dir * 7)),
          },
          icon(name, { size: 20, stroke: 2 })
        )

      const switcher = h(
        'div',
        { class: 'flex items-center justify-between gap-[10px]' },
        step(-1, 'Previous week', 'chevronLeft', start <= first && start <= current),
        h(
          'div',
          { class: 'flex min-w-0 flex-col items-center gap-[2px] text-center', 'aria-live': 'polite' },
          h('span', { class: 'text-[16px] font-semibold leading-tight' }, weekLabel(start)),
          h(
            'span',
            { class: 'text-[12px] leading-tight text-muted' },
            worked
              ? weekSummary(week)
              : start === current
                ? `No workouts this week. Last one: ${formatDayAge(workouts[0].date)}`
                : 'No workouts'
          )
        ),
        step(1, 'Next week', 'chevronRight', start >= last)
      )

      const sentence = musclesSentence(week, when)
      const map = h(
        'div',
        { class: 'day-card flex flex-col gap-[16px]' },
        bodyPair((view) => ({
          step: (groups) => rampStep(regionSets(groups, week.muscles)),
          label: `Body map, ${view.label.toLowerCase()}, ${weekLabel(start)}`,
          onRegion: open,
          regionLabel: (groups) =>
            worked
              ? `${regionName(groups)}, ${setsFigure(regionSets(groups, week.muscles))} sets`
              : `${regionName(groups)}, no workouts`,
        })),
        rampKey(),
        sentence
          ? h(
              'div',
              { class: 'flex flex-col gap-[4px]' },
              h('p', { class: 'text-[14px] leading-snug' }, sentence),
              caption(WEIGHTED_BASIS)
            )
          : null
      )

      return page(
        switcher,
        map,
        worked && week.unassigned.length
          ? notice(
              `${pluralize(week.unassigned.length, 'exercise')} in this week ${week.unassigned.length === 1 ? 'has' : 'have'} no muscles chosen, so ${week.unassigned.length === 1 ? 'its' : 'their'} sets are not on the map: ${week.unassigned.join(', ')}. Open the workout to choose.`,
            )
          : null,
        worked &&
          section(
            'Sets by muscle',
            card(
              // Most first; ties keep the list's own order.
              [...MUSCLE_GROUPS].sort((a, b) => week.muscles[b].sets - week.muscles[a].sets).map((g) =>
                h(
                  'button',
                  { class: 'row row-single', type: 'button', onclick: () => open([g]) },
                  h('span', { class: 'min-w-0 flex-1 text-[14px] font-semibold' }, MUSCLE_LABELS[g]),
                  tnum(setsFigure(week.muscles[g].sets), 'text-[14px] font-semibold'),
                  rowChevron()
                )
              )
            )
          ),
        worked &&
          section(
            'Workouts',
            card(
              week.workouts
                .slice()
                .reverse()
                .map((w) =>
                  h(
                    'button',
                    {
                      class: 'row',
                      type: 'button',
                      onclick: () => openWorkout(w),
                    },
                    h(
                      'div',
                      { class: 'min-w-0 flex-1' },
                      h('div', { class: 'truncate text-[16px] font-semibold' }, w.title),
                      h(
                        'div',
                        { class: 'mt-[2px] text-[12px] text-muted' },
                        [formatDayLabel(w.date), formatTime(w.startedAt), pluralize(setCount(w), 'set')].join(' · ')
                      )
                    ),
                    rowChevron()
                  )
                )
            )
          ),
        unchosen.length
          ? card(
              listRow({
                title: 'Choose muscles',
                subtitle: `${pluralize(unchosen.length, 'exercise')} in all workouts with none chosen`,
                chevron: true,
                onclick: openUnchosen,
              })
            )
          : null
      )
    },
    { watch: ['workouts', 'settings'], watchDate: false }
  )
}

const caption = (text) => h('span', { class: 'text-[12px] leading-snug text-muted' }, text)

const section = (title, body) =>
  h('section', { class: 'flex flex-col gap-[10px]' }, h('div', { class: 'section-title' }, title), body)

const weekBasis = (week) => `${pluralize(week.workouts.length, 'workout')}, ${weekLabel(week.start)}.`

/** The five steps and what each stands for. */
function rampKey() {
  return h(
    'div',
    { class: 'flex flex-col gap-[6px]' },
    h(
      'div',
      { class: 'flex gap-[6px]' },
      RAMP.map(({ label }, i) =>
        h(
          'div',
          { class: 'flex min-w-0 flex-1 flex-col gap-[4px] text-center' },
          h('span', { class: 'ramp-swatch', dataset: { step: String(i) }, 'aria-hidden': 'true' }),
          h('span', { class: 'text-[12px] leading-tight text-muted' }, label)
        )
      )
    ),
  )
}

/** One region: each group it stands for, and the exercises behind the number. */
function regionSheet(groups, week) {
  return {
    title: regionName(groups),
    render: () =>
      h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        groups.map((g) => {
          const { sets, from } = week.muscles[g]
          return h(
            'section',
            { class: 'flex flex-col gap-[10px]' },
            groups.length > 1 ? h('div', { class: 'section-title' }, MUSCLE_LABELS[g]) : null,
            week.workouts.length
              ? h(
                  'div',
                  { class: 'panel flex flex-col gap-[2px] p-[20px]' },
                  h(
                    'div',
                    { class: 'flex items-baseline gap-[6px]' },
                    tnum(setsFigure(sets), 'text-title font-semibold'),
                    h('span', { class: 'text-[14px] font-medium text-muted' }, 'sets')
                  ),
                  caption(weekBasis(week))
                )
              : notice(`No workouts, ${weekLabel(week.start)}.`),
            from.length
              ? card(
                  from.map((row) =>
                    h(
                      'div',
                      { class: 'row' },
                      h(
                        'div',
                        { class: 'min-w-0 flex-1' },
                        h('div', { class: 'text-[14px] font-semibold leading-snug' }, row.name),
                        h(
                          'div',
                          { class: 'mt-[2px] text-[12px] text-muted' },
                          `${pluralize(row.sets, 'set')}, ${row.role}`
                        )
                      ),
                      tnum(setsFigure(row.credit), 'text-[14px] font-semibold')
                    )
                  )
                )
              : null
          )
        }),
        week.workouts.length ? caption(WEIGHTED_BASIS) : null
      ),
  }
}
