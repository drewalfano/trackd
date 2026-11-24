import { h } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { getSettings, listActivity, listWeights } from '../lib/db.js'
import { loadDays } from '../lib/days.js'
import {
  NO_ACTIVITY,
  SLEEP_DAYS,
  activityAverages,
  burnBasis,
  burnSentence,
  burnVsIntake,
  sleepBasis,
  sleepSentence,
  sleepVsIntake,
  stepsAndTrend,
  stepsBasis,
} from '../lib/activityInsights.js'
import { trendsPage } from '../lib/trendTile.js'
import { tnum } from '../lib/ui.js'
import { kcalGrouped, kgToUnit, signed } from '../lib/format.js'
import { formatDayShort, todayStr } from '../lib/dates.js'
import { activityFigure, activityWindow, activeUnit, stepsUnit } from './trendTiles.js'
import { navigate } from '../router.js'

/**
 * Activity, one level under Trends.
 *
 * The week's averages, then whichever comparisons have enough days behind
 * them, each with its basis. A section that falls short is absent rather than
 * drawn empty.
 */
export function activityScreen() {
  return createScreen(
    async () => {
      const [settings, weights, activity, days] = await Promise.all([
        getSettings(),
        listWeights(),
        listActivity(),
        loadDays(SLEEP_DAYS),
      ])
      const today = todayStr()
      const read = { days, activity, weights, targets: settings.targets, today }
      const page = (...children) =>
        trendsPage({ title: 'Activity', onBack: () => navigate('trends') }, ...children)

      const averages = activityAverages(read)
      if (!averages) return page(note(NO_ACTIVITY))

      const burn = burnVsIntake(read)
      const steps = stepsAndTrend({ ...read, trendWindow: settings.trendWindow })
      const sleep = sleepVsIntake(read)

      return page(
        h(
          'div',
          { class: 'day-card flex flex-col gap-[10px]' },
          h(
            'div',
            { class: 'flex gap-[10px]' },
            activityFigure(averages.steps, 'Steps', stepsUnit()),
            activityFigure(averages.activeKcal, 'Active calories', activeUnit(), 'active, '),
          ),
          caption(`7-day average · ${activityWindow(averages, activity)}`),
        ),
        burn && section('Burn and intake', insight(burnSentence(burn), burnBasis(burn))),
        steps && section('Steps and weight trend', stepsTable(steps, settings.weightUnit)),
        sleep && section('Sleep and intake', insight(sleepSentence(sleep), sleepBasis(sleep))),
        burn || steps || sleep ? null : note('No comparison has enough days yet.'),
      )
    },
    { watch: ['activity', 'entries', 'weights', 'settings'], watchDate: false },
  )
}

const caption = (text) => h('span', { class: 'text-[12px] leading-snug text-muted' }, text)
const note = (text) => h('p', { class: 'text-[14px] leading-snug text-muted' }, text)

const section = (title, body) =>
  h('section', { class: 'flex flex-col gap-[10px]' }, h('div', { class: 'section-title' }, title), body)

const insight = (sentence, basis) =>
  h(
    'div',
    { class: 'day-card flex flex-col gap-[4px]' },
    h('p', { class: 'text-[14px] leading-snug' }, sentence),
    caption(basis),
  )

/**
 * Six weeks, oldest first, named by the day each starts. Each row is headed by
 * a line of its own, because six columns and a label do not fit a phone. Under
 * each figure is the number of readings behind it.
 */
function stepsTable(read, unit) {
  const cell = (value, count) =>
    h(
      'td',
      { class: 'text-center' },
      h(
        'div',
        { class: 'flex flex-col' },
        value == null
          ? h('span', { class: 'text-[12px] text-muted' }, '—')
          : tnum(value, 'text-[12px] font-semibold'),
        tnum(String(count), 'text-[12px] text-muted'),
      ),
    )
  const rowHead = (title, sub) =>
    h(
      'tr',
      {},
      h(
        'th',
        { colspan: String(read.weeks.length), scope: 'rowgroup', class: 'pt-[16px] pb-[4px] text-left' },
        h(
          'div',
          { class: 'flex flex-col' },
          h('span', { class: 'text-[14px] font-semibold' }, title),
          h('span', { class: 'text-[12px] font-normal text-muted' }, sub),
        ),
      ),
    )

  return h(
    'div',
    { class: 'day-card flex flex-col gap-[16px]' },
    h(
      'table',
      { class: 'w-full table-fixed' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          ...read.weeks.map((w) =>
            h(
              'th',
              { scope: 'col', class: 'text-center text-[12px] font-normal text-muted' },
              formatDayShort(w.start),
            ),
          ),
        ),
      ),
      h(
        'tbody',
        {},
        rowHead('Steps a day', 'Weekly mean, with days counted under it'),
        h('tr', {}, ...read.weeks.map((w) => cell(w.steps.mean == null ? null : kcalGrouped(w.steps.mean), w.steps.days))),
      ),
      h(
        'tbody',
        {},
        rowHead(`Weight trend change, ${unit}`, 'Since the week before, with weigh-ins under it'),
        h('tr', {}, ...read.weeks.map((w) => cell(w.changeKg == null ? null : signed(kgToUnit(w.changeKg, unit)), w.weighIns))),
      ),
    ),
    caption(`Weeks by start date. ${stepsBasis(read)}`),
  )
}
