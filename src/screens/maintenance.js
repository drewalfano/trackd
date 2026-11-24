import { h } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { getSettings, listActivity, listWeights } from '../lib/db.js'
import { loadDays } from '../lib/days.js'
import { rangeSpan, MIN_ENTRIES_FOR_TREND } from '../lib/trend.js'
import {
  estimateMaintenance,
  maintenanceHistory,
  HISTORY_WEEKS,
  basisLabel,
  missingLabel,
  windowLabel,
  maintenanceSentence,
  MAINTENANCE_DAYS,
  MIN_FULL_DAYS,
} from '../lib/maintenance.js'
import { windowActiveKcal } from '../lib/activityInsights.js'
import { trendsPage } from '../lib/trendTile.js'
import { card, tnum, macroUnit } from '../lib/ui.js'
import { kcalGrouped, kgToUnit, pluralize, signed } from '../lib/format.js'
import { formatDayShort, todayStr } from '../lib/dates.js'
import { navigate } from '../router.js'

/**
 * Maintenance, one level under Trends.
 *
 * The estimate, then the parts it was made from, then one sentence that puts
 * the two parts side by side. Short of data the number is absent and the rows
 * are the two counts against what each needs, so the page says which half is
 * missing. It reads the log and the scale and changes neither, and it does
 * not touch the calorie target.
 */
export function maintenanceScreen() {
  return createScreen(
    async () => {
      const [settings, weights, activity, days] = await Promise.all([
        getSettings(),
        listWeights(),
        listActivity(),
        loadDays(MAINTENANCE_DAYS - 1 + HISTORY_WEEKS * 7),
      ])
      const unit = settings.weightUnit
      const read = {
        days,
        weights,
        targets: settings.targets,
        trendWindow: settings.trendWindow,
        unit,
      }
      const estimate = estimateMaintenance(read)
      const history = maintenanceHistory(read)
      const enough = estimate.kcal != null
      const span = rangeSpan(MAINTENANCE_DAYS, todayStr())
      const dates = windowLabel(span)
      const active = windowActiveKcal({ activity, span, today: todayStr() })

      const headline = enough
        ? h(
            'div',
            { class: 'day-card flex flex-col gap-[2px]' },
            h(
              'div',
              { class: 'flex items-baseline gap-[6px]' },
              tnum(kcalGrouped(estimate.kcal), 'text-title font-semibold'),
              macroUnit('kcal', 'text-[14px] font-semibold'),
              caption('a day'),
            ),
            caption(basisLabel(estimate)),
            caption(dates),
          )
        : h(
            'div',
            { class: 'day-card flex flex-col gap-[2px]' },
            h('span', { class: 'text-[16px] font-semibold' }, missingLabel(estimate)),
            caption(dates),
          )

      const rows = enough
        ? [
            row(
              'Average intake',
              pluralize(estimate.fullDays, 'full day'),
              tnum(kcalGrouped(estimate.intake), 'text-[16px] font-semibold'),
              macroUnit('kcal', 'text-[12px] font-semibold'),
            ),
            row(
              'Weight trend',
              pluralize(estimate.weighIns, 'weigh-in'),
              tnum(signed(kgToUnit(estimate.ratePerWeekKg, unit)), 'text-[16px] font-semibold'),
              h('span', { class: 'text-[12px] font-medium text-muted' }, `${unit} / week`),
            ),
            row('Window', dates, tnum(String(MAINTENANCE_DAYS), 'text-[16px] font-semibold'), dayUnit()),
          ]
        : [
            row('Full days logged', `Needs ${MIN_FULL_DAYS}`, tnum(String(estimate.fullDays), 'text-[16px] font-semibold')),
            row(
              'Weigh-ins',
              `Needs ${MIN_ENTRIES_FOR_TREND} across 2 weeks`,
              tnum(String(estimate.weighIns), 'text-[16px] font-semibold'),
            ),
            row('Window', dates, tnum(String(MAINTENANCE_DAYS), 'text-[16px] font-semibold'), dayUnit()),
          ]

      return trendsPage(
        { title: 'Est. maintenance', onBack: () => navigate('trends') },
        headline,
        card(rows),
        enough
          ? h('p', { class: 'text-[14px] leading-snug text-muted' }, maintenanceSentence(estimate, unit))
          : null,
        // A card apart from the estimate's parts, because it is not one.
        active
          ? card([
              row(
                'Average active calories',
                `${pluralize(active.days, 'day')} · ${windowLabel(active)} · not part of the estimate`,
                tnum(kcalGrouped(active.kcal), 'text-[16px] font-semibold'),
                macroUnit('kcal', 'text-[12px] font-semibold'),
              ),
            ])
          : null,
        history.length
          ? h(
              'section',
              { class: 'flex flex-col gap-[10px]' },
              h('div', { class: 'section-title' }, 'Earlier'),
              card(
                history.map((past) =>
                  row(
                    formatDayShort(past.end),
                    `${pluralize(past.fullDays, 'full day')}, ${pluralize(past.weighIns, 'weigh-in')}`,
                    ...(past.kcal == null
                      ? [h('span', { class: 'text-[14px] text-muted' }, '—')]
                      : [
                          tnum(kcalGrouped(past.kcal), 'text-[16px] font-semibold'),
                          macroUnit('kcal', 'text-[12px] font-semibold'),
                        ]),
                  ),
                ),
              ),
              caption(`Each from the ${MAINTENANCE_DAYS} days ending that date.`),
            )
          : null,
      )
    },
    { watch: ['entries', 'weights', 'settings', 'activity'], watchDate: false },
  )
}

const caption = (text) => h('span', { class: 'text-[12px] leading-snug text-muted' }, text)

const dayUnit = () => h('span', { class: 'text-[12px] font-medium text-muted' }, 'days')

const row = (label, basis, ...value) =>
  h(
    'div',
    { class: 'row justify-between' },
    h(
      'div',
      { class: 'flex flex-col' },
      h('span', { class: 'text-[16px] font-semibold' }, label),
      h('span', { class: 'text-[12px] text-muted' }, basis),
    ),
    h('span', { class: 'flex shrink-0 items-baseline gap-[3px]' }, ...value),
  )
