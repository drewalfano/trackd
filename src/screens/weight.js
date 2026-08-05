import { h, s } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { listWeights, getWeight, putWeight, deleteWeight, getSettings } from '../lib/db.js'
import { computeTrend, ratePerWeek, windowPoints, MIN_ENTRIES_FOR_TREND } from '../lib/trend.js'
import {
  card,
  segmentedWide,
  numberInput,
  notice,
  emptyState,
  tnum,
  digits,
  navHeader,
} from '../lib/ui.js'
import { kgToUnit, unitToKg, weight as fmtWeight, signed } from '../lib/format.js'
import { formatDayLabel, todayStr } from '../lib/dates.js'
import { toast, confirm } from '../lib/toast.js'
import { openWeighInSheet } from '../sheets/weighIn.js'

/**
 * Weight.
 *
 * The chart is deliberately neutral — none of the four macros own body weight,
 * so borrowing one of their hues here would break the rule that colour means
 * macro identity. Ink for the trend, muted grey for the raw dots.
 */

let range = 30 // module-level so the toggle survives a re-render

const CHART_W = 340
const CHART_H = 150
const PAD = { top: 10, right: 6, bottom: 8, left: 6 }

function chart(points, unit) {
  const drawn = points.filter((p) => p.kg != null || p.trend != null)
  if (drawn.length < 2) return null

  const values = []
  for (const p of drawn) {
    if (p.kg != null) values.push(kgToUnit(p.kg, unit))
    if (p.trend != null) values.push(kgToUnit(p.trend, unit))
  }
  let min = Math.min(...values)
  let max = Math.max(...values)
  // Never let a flat fortnight render as a jagged line across the full height.
  const pad = Math.max((max - min) * 0.15, 0.4)
  min -= pad
  max += pad

  const innerW = CHART_W - PAD.left - PAD.right
  const innerH = CHART_H - PAD.top - PAD.bottom
  const x = (i) => PAD.left + (i / (points.length - 1 || 1)) * innerW
  const y = (v) => PAD.top + innerH - ((v - min) / (max - min || 1)) * innerH

  const trendPath = []
  points.forEach((p, i) => {
    if (p.trend == null) return
    const px = x(i)
    const py = y(kgToUnit(p.trend, unit))
    trendPath.push(`${trendPath.length ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`)
  })

  const gridlines = [max - pad, (max + min) / 2, min + pad].map((v) =>
    s('g', {}, [
      s('line', {
        x1: PAD.left,
        x2: CHART_W - PAD.right,
        y1: y(v).toFixed(1),
        y2: y(v).toFixed(1),
        stroke: 'var(--color-outline)',
        'stroke-width': '1',
      }),
      s(
        'text',
        {
          x: PAD.left + 2,
          y: (y(v) - 4).toFixed(1),
          fill: 'var(--color-muted)',
          'font-size': '9',
        },
        fmtWeight(unitToKg(v, unit), unit)
      ),
    ])
  )

  return s(
    'svg',
    {
      viewBox: `0 0 ${CHART_W} ${CHART_H}`,
      class: 'w-full',
      role: 'img',
      'aria-label': 'Weight trend chart',
    },
    gridlines,
    // Raw daily readings sit behind and stay muted.
    points.map((p, i) =>
      p.kg == null
        ? null
        : s('circle', {
            cx: x(i).toFixed(1),
            cy: y(kgToUnit(p.kg, unit)).toFixed(1),
            r: '2',
            fill: 'var(--color-muted)',
            opacity: '0.55',
          })
    ),
    trendPath.length > 1
      ? s('path', {
          d: trendPath.join(''),
          fill: 'none',
          stroke: 'var(--color-ink)',
          'stroke-width': '2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'vector-effect': 'non-scaling-stroke',
        })
      : null
  )
}

export function weightScreen() {
  return createScreen(
    async ({ rerender }) => {
      const [weights, settings] = await Promise.all([listWeights(), getSettings()])
      const unit = settings.weightUnit
      const today = todayStr()
      const todayEntry = await getWeight(today)

      const allPoints = computeTrend(weights, settings.trendWindow)
      const points = windowPoints(allPoints, range)
      const latest = weights[weights.length - 1] || null
      const latestTrend = [...allPoints].reverse().find((p) => p.trend != null)?.trend ?? null
      const rate = ratePerWeek(points)

      /* ----------------------------------------------------------- input */

      let draft = todayEntry ? String(kgToUnit(todayEntry.kg, unit).toFixed(1)) : ''
      const saveBtn = h(
        'button',
        {
          class: 'btn-primary btn-compact',
          disabled: !draft,
          onclick: async () => {
            const value = Number(draft)
            if (!(value > 0)) return
            await putWeight(today, unitToKg(value, unit))
            toast(todayEntry ? 'Weight updated' : 'Weight saved')
          },
        },
        todayEntry ? 'Update' : 'Save'
      )

      const input = numberInput({
        value: draft,
        suffix: unit,
        placeholder: '—',
        step: '0.1',
        onInput: (v) => {
          draft = v
          saveBtn.disabled = !(Number(v) > 0)
        },
      })

      const entryBlock = h(
        'section',
        { class: 'flex flex-col gap-[10px]' },
        h(
          'div',
          { class: 'section-head' },
          h('div', { class: 'section-label' }, 'Today’s weight'),
          todayEntry
            ? h(
                'button',
                {
                  class: 'chip-sm',
                  onclick: async () => {
                    const ok = await confirm({
                      title: 'Remove today’s weight?',
                      message: 'The trend recalculates without it.',
                      confirmLabel: 'Remove',
                    })
                    if (ok) await deleteWeight(today)
                  },
                },
                'Remove'
              )
            : null
        ),
        h(
          'div',
          { class: 'flex items-center gap-[10px]' },
          h('div', { class: 'min-w-0 flex-1' }, input),
          saveBtn
        ),
        todayEntry
          ? h(
              'p',
              { class: 'px-0 text-[12px] text-muted' },
              'Saving again replaces today’s value rather than adding a second one.'
            )
          : null,

        // The back door for a morning you missed, and the only way to correct
        // or remove any reading other than today's. Kept out of the main path
        // on purpose — weighing in is a daily habit, not a form.
        h(
          'button',
          {
            class: 'chip-sm self-start',
            onclick: () => openWeighInSheet(),
          },
          'Add or edit another day'
        )
      )

      if (!weights.length) {
        return h(
          'div',
          { class: 'flex flex-col gap-[20px] pb-[20px]' },
          heading(),
          emptyState(
            'No weigh-ins yet',
            'Add today’s weight below. The trend line appears after a week of readings.'
          ),
          entryBlock
        )
      }

      /* ---------------------------------------------------------- header */

      const rangeRow = segmentedWide({
        options: [
          { value: 30, label: '30 days' },
          { value: 90, label: '90 days' },
          { value: null, label: 'All' },
        ],
        value: range,
        onChange: (v) => {
          range = v
          rerender()
        },
        on: 'card',
      })

      const chartNode = chart(points, unit)

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[20px]' },
        heading(),

        h(
          'section',
          { class: 'day-card flex flex-col gap-[20px]' },
          h(
            'div',
            { class: 'flex items-end justify-between' },
            h(
              'div',
              { class: 'flex flex-col' },
              h('span', { class: 'text-[12px] font-semibold text-muted' }, 'Current'),
              h(
                'div',
                { class: 'flex items-baseline gap-[10px]' },
                tnum(fmtWeight(latest.kg, unit), 'text-display font-semibold'),
                h('span', { class: 'text-[12px] font-medium text-muted' }, unit)
              ),
              h('span', { class: 'text-[12px] text-muted' }, formatDayLabel(latest.date))
            ),
            h(
              'div',
              { class: 'flex flex-col items-end' },
              h('span', { class: 'text-[12px] font-semibold text-muted' }, 'Trend'),
              h(
                'div',
                { class: 'flex items-baseline gap-[10px]' },
                h(
                  'span',
                  { class: 'tnum text-title font-semibold' },
                  ...digits(latestTrend == null ? '—' : fmtWeight(latestTrend, unit))
                ),
                h('span', { class: 'text-[12px] font-medium text-muted' }, unit)
              ),
              // Nothing at all when there is no rate yet. The notice below the
              // card already says what is missing and how far off it is, and
              // the trend figure above is already an em-dash — a second dash
              // under the first says the same thing twice, in the weaker of the
              // two positions.
              rate == null
                ? null
                : h(
                    'span',
                    { class: 'text-[12px] text-muted' },
                    `${signed(kgToUnit(rate, unit))} ${unit} / week`
                  )
            )
          ),

          chartNode ||
            h(
              'div',
              { class: 'py-[30px] text-center text-[12px] text-muted' },
              'Two readings are needed before there is anything to draw.'
            ),

          rangeRow
        ),

        weights.length < MIN_ENTRIES_FOR_TREND
          ? notice(
              `The trend line needs ${MIN_ENTRIES_FOR_TREND} weigh-ins before it means anything. ` +
                `You have ${weights.length}.`
            )
          : null,

        entryBlock
      )
    },
    { watch: ['weights', 'settings'], watchDate: false }
  )
}

/** Root tab, so no chevrons — the spacers keep the title optically centred
    against Today and Log, which do have them. */
function heading() {
  return navHeader({ title: 'Weight' })
}
