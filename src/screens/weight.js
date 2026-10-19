import {
  h,
  s,
  repaint,
  reduceMotion,
  setTabularText,
  horizontalScrub,
} from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import {
  listWeights,
  getWeight,
  putWeight,
  getSettings,
} from '../lib/db.js'
import {
  smoothTrend,
  ratePerWeek,
  rangeSpan,
  pointsIn,
  meanGapDays,
  MIN_ENTRIES_FOR_TREND,
  SPARSE_GAP_DAYS,
} from '../lib/trend.js'
import { yScale, yTickLabel, xTicks, monotonePath } from '../lib/weightChart.js'
import {
  card,
  segmentedWide,
  numberInput,
  notice,
  emptyState,
  backRow,
  tnum,
} from '../lib/ui.js'
import {
  kgToUnit,
  unitToKg,
  weight as fmtWeight,
  signed,
  pluralize,
} from '../lib/format.js'
import { formatDayAge, todayStr, daysBetween, fromDateStr } from '../lib/dates.js'
import { toast } from '../lib/toast.js'
import { openWeighInSheet, todayWeightCard } from '../sheets/weighIn.js'
import { navigate } from '../router.js'

/**
 * Weight, one level under Trends.
 *
 * This is the chart, the range switch and the entry field that used to be the
 * top of the Trends screen. Trends is a grid of tiles now and the Weight tile
 * carries the latest reading, the rate and a sparkline; the chevron on it
 * lands here, where the chart has room to be honest about its axis and its
 * window. Everything below this comment moved wholesale from screens/trends.js
 * and keeps its reasoning.
 *
 * The chart is deliberately neutral — none of the four macros own body weight,
 * so borrowing one of their hues here would break the rule that colour means
 * macro identity. Ink for the trend, muted grey for the raw weigh-ins.
 */

let range = 30 // module-level so the toggle survives a re-render

/**
 * The chart's drawing box, in viewBox units.
 *
 * 322 wide because that is the card's inner width on an iPhone 17 Pro (402pt,
 * less the page's and the card's 20px each side, measured), so on the phone it
 * is used on one unit is one point and the 11px axis labels render at 11px.
 * Narrower phones scale it down with the card: 0.92 at 375pt, where the labels
 * come out at 10px. It was 340, which drew 9px labels at 8.5.
 *
 * The plot leaves a 4-unit inset at the left so a weigh-in on the first day of
 * the range is a whole circle rather than half of one, and a 34-unit gutter at
 * the right for the y labels, which Apple Health also hangs on the right: the
 * eye reads a chart left to right and arrives at the scale where the newest
 * reading is. The band under the plot holds the x labels.
 */
const CHART_W = 322
const CHART_H = 184
const PLOT = { top: 8, right: 288, bottom: 160, left: 4 }
/** Horizontal gridlines run a little past the plot, toward their labels. */
const GRID_RIGHT = 294
const AXIS_FONT = 11
/**
 * Past this many weigh-ins in view the circles go and the connecting line
 * stays. Sixty circles 3 units across in 284 units of width overlap into a
 * bead chain that reads as a thick second line competing with the trend.
 */
const DENSE_POINTS = 60

/**
 * How long a range switch takes to cross-fade — and why it is a cross-fade
 * rather than the chart morphing to its new axis.
 *
 * **This decision should not be re-litigated, so here is what it rests on.** The
 * scales are not properties the chart carries; they are `yScale(values, unit)`
 * and the range's days baked into every coordinate at construction — `y1`/`y2`
 * on each gridline, `y` on each label, and the whole `d` string on the trend
 * path. SVG geometry
 * attributes are not animatable properties, so there is nothing to transition
 * even in principle. `d` alone can interpolate, and only between paths whose
 * segment structure matches.
 *
 * It does not match, and that is the deeper reason. A range switch changes
 * `pointsIn(series, span)`, so thirty days and ninety days hold a different
 * NUMBER of points. It is not one line rescaled onto a new axis; it is
 * a different line. Morphing between them would have to invent intermediate
 * shapes that were never anybody's weight, which is a chart asserting data it
 * does not have — the same standard the honesty rules hold the rest of this
 * screen to.
 *
 * So the fade says the true thing: same instrument, different window. A morph
 * would say the line moved, and it did not.
 *
 * 180ms rather than the 160 the note that asked for this proposed, because the
 * `± / week` line changes in the same breath and takes `.reading-swap`'s 180.
 * One event, one clock — the mistake this pass has been unpicking everywhere
 * else.
 */
const CHART_SWAP_MS = 180

/**
 * The chart's box, held when there is no chart to put in it.
 *
 * `aspect-ratio` off the chart's own constants rather than a measured height,
 * because the svg is `w-full` on a fixed viewBox — its rendered height is always
 * width × CHART_H/CHART_W, so a fixed number would only be right at one screen
 * width. The two boxes are therefore the same box at every width, which is what
 * lets the cross-fade swap one for the other without the card changing height.
 * It was `py-[30px]` once, 96px against the chart's 130 at 375pt, and the card
 * jumped 34px the moment a second weigh-in landed.
 *
 * Only for a range with no weigh-ins in it now. One reading is a chart: a
 * single circle on a dated axis says when it was and what it read, which is
 * more than a sentence about needing two.
 */
function chartPlaceholder(range) {
  return h(
    'div',
    {
      class: 'flex items-center justify-center text-center text-[12px] text-muted',
      style: { aspectRatio: `${CHART_W} / ${CHART_H}` },
    },
    `No weigh-ins in the last ${range} days.`,
  )
}

/**
 * Why the line is not there, said once, in the only place that says it.
 *
 * **This used to be built from the record and never changed.** It was gated on
 * `weights.length`, so a long history with a quiet fortnight in view showed a
 * chart with no line, a withheld rate, and nothing at all accounting for
 * either. The card went quiet in three places at once and explained itself in
 * none of them. It reads off the window now, in the same breath as the chart
 * and the rate, because it is the sentence those two absences share.
 *
 * Two forms, and the pivot between them is whether the count in view is the
 * count you have. `5 more to go` is a true and useful thing to tell someone
 * starting out; told to someone with forty readings and a gap it is nonsense,
 * because they are not short of weigh-ins, they are short of recent ones.
 *
 * `This range holds` rather than `the last 30 days holds`, because the same
 * sentence serves `All`, which is not a number of days.
 */
function trendNotice(inWindow, total) {
  if (inWindow === total) {
    return notice(
      `The trend line starts at ${MIN_ENTRIES_FOR_TREND} weigh-ins, with ` +
        `${MIN_ENTRIES_FOR_TREND - total} more to go. ` +
        'Fewer than that and the line is just tracing water weight.',
    )
  }
  return notice(
    `This range holds ${pluralize(inWindow, 'weigh-in')}. ` +
      `The trend line starts at ${MIN_ENTRIES_FOR_TREND}, and fewer than that ` +
      'is just tracing water weight.',
  )
}

/**
 * The chart draws what the data supports and no more.
 *
 * **The y-axis has a floor.** See `MIN_AXIS_SPAN`. Fitted to its data, this
 * chart drew every history at the same amplitude — a fortnight of water noise
 * and a real three-pound cut both filled the frame — so the shape of the line
 * carried no information at all. Below the floor the line compresses toward
 * flat, which is what a flat fortnight actually is. The labels are round
 * numbers from `yScale`, not the data's own extremes, so they say where the
 * scale is rather than repeating three of the readings.
 *
 * **The x-axis is the range, ending today.** Not the first to the last
 * weigh-in: a range's worth of days, so the gaps between readings are drawn
 * as the distances they were, and the days since the last one are the empty
 * space at the right that they are.
 *
 * **The trend line is gated on the weigh-ins IN THIS RANGE.** `smoothTrend`
 * runs over the whole record, so forty readings from six months ago and none
 * since would still hand the 30-day view a confident line. The gate has to be
 * applied where the drawing happens, against the points being drawn, and it is
 * the rate's gate, because the rate is this line's slope.
 *
 * Both lines carry on from the last reading before the range, so they enter
 * at the left edge rather than starting abruptly at the first reading inside
 * it. The svg clips whatever falls left of its box.
 *
 * Returns the svg, with `_marks` (each weigh-in in range with its position)
 * and `_select(i)` for the scrub. Null when the range holds no weigh-ins.
 */
function chart({ series, span, unit }) {
  const inRange = pointsIn(series, span)
  if (!inRange.length) return null

  let before = null
  for (const p of series) {
    if (p.date >= span.start) break
    before = p
  }
  const drawn = before ? [before, ...inRange] : inRange
  const withTrend = inRange.length >= MIN_ENTRIES_FOR_TREND
  const dense = inRange.length > DENSE_POINTS

  const spanDays = Math.max(1, daysBetween(span.start, span.end))
  const x = (date) =>
    PLOT.left + (daysBetween(span.start, date) / spanDays) * (PLOT.right - PLOT.left)

  const u = (kg) => kgToUnit(kg, unit)
  const values = inRange.map((p) => u(p.kg))
  if (withTrend) values.push(...inRange.map((p) => u(p.trend)))
  if (before) {
    // Where the two lines cross the left edge, so the axis has room for the
    // part of them that enters from outside the range.
    const first = inRange[0]
    const f = daysBetween(before.date, span.start) / daysBetween(before.date, first.date)
    values.push(u(before.kg + (first.kg - before.kg) * f))
    if (withTrend) values.push(u(before.trend + (first.trend - before.trend) * f))
  }
  const { min, max, step, ticks } = yScale(values, unit)
  const y = (v) => PLOT.top + ((max - v) / (max - min)) * (PLOT.bottom - PLOT.top)

  const label = (props, text) =>
    s(
      'text',
      { fill: 'var(--color-muted)', 'font-size': AXIS_FONT, ...props },
      text,
    )
  const rule = (props) =>
    s('line', {
      stroke: 'var(--color-outline)',
      'stroke-width': '1',
      'vector-effect': 'non-scaling-stroke',
      ...props,
    })

  const yAxis = ticks.map((t) =>
    s(
      'g',
      {},
      rule({ x1: 0, x2: GRID_RIGHT, y1: y(t).toFixed(1), y2: y(t).toFixed(1) }),
      label(
        { x: CHART_W, y: y(t).toFixed(1), 'text-anchor': 'end', 'dominant-baseline': 'central' },
        yTickLabel(t, step),
      ),
    ),
  )

  /**
   * Dashed, and running down through the label band with the label hung off
   * its right side, as Apple Health draws them. Dashed so they read as a
   * calendar behind the data rather than as part of it; the solid rules are
   * the scale the values are read against.
   *
   * A label is dropped, and its line kept, only if it would run off the
   * right edge of the box. The y gutter is empty below the plot, so a label
   * for the last Sunday before today still fits there.
   */
  const xAxis = xTicks(span.start, span.end).map((t) => {
    const tx = x(t.date)
    const fits = tx + 3 + t.label.length * AXIS_FONT * 0.6 <= CHART_W
    return s(
      'g',
      {},
      rule({
        x1: tx.toFixed(1),
        x2: tx.toFixed(1),
        y1: PLOT.top,
        y2: CHART_H - 2,
        'stroke-dasharray': '2 3',
      }),
      fits ? label({ x: (tx + 3).toFixed(1), y: CHART_H - 6 }, t.label) : null,
    )
  })

  // The floor of the plot, which a round bottom tick is not always on.
  const baseline = rule({ x1: 0, x2: GRID_RIGHT, y1: PLOT.bottom, y2: PLOT.bottom })

  const marks = inRange.map((p) => ({ ...p, x: x(p.date), y: y(u(p.kg)) }))

  /**
   * The readings as they were: straight segments between them, light and
   * thin, so the path the scale actually took is legible behind the trend.
   *
   * 0.45 with a trend over it, full strength without one. With the line gated
   * off there is no subject for this to sit behind, and the same faintness
   * leaves the only marks on the card looking like a rendering fault rather
   * than like the weigh-ins they are.
   */
  const raw =
    drawn.length > 1
      ? s('polyline', {
          points: drawn.map((p) => `${x(p.date).toFixed(1)},${y(u(p.kg)).toFixed(1)}`).join(' '),
          fill: 'none',
          stroke: 'var(--color-muted)',
          'stroke-width': '1',
          'stroke-linejoin': 'round',
          'vector-effect': 'non-scaling-stroke',
          opacity: withTrend ? '0.45' : '1',
        })
      : null

  /**
   * Hollow, filled with the card's own surface so the connecting line stops
   * at the ring rather than running through its middle. Dropped past
   * `DENSE_POINTS`; one reading always gets its circle, since without a line
   * it is the whole chart.
   */
  const circles = dense
    ? null
    : marks.map((m) =>
        s('circle', {
          cx: m.x.toFixed(1),
          cy: m.y.toFixed(1),
          r: '3',
          fill: 'var(--color-surface)',
          stroke: 'var(--color-muted)',
          'stroke-width': '1.5',
          'vector-effect': 'non-scaling-stroke',
        }),
      )

  const trend = withTrend
    ? s('path', {
        d: monotonePath(drawn.map((p) => [x(p.date), y(u(p.trend))])),
        fill: 'none',
        stroke: 'var(--color-ink)',
        'stroke-width': '2.5',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'vector-effect': 'non-scaling-stroke',
      })
    : null

  // The scrub's marks, drawn last so they sit over everything and hidden
  // until a finger is on the chart.
  const scrubLine = rule({
    y1: PLOT.top,
    y2: PLOT.bottom,
    stroke: 'var(--color-ink)',
  })
  const scrubDot = s('circle', {
    r: '4.5',
    fill: 'var(--color-ink)',
    stroke: 'var(--color-surface)',
    'stroke-width': '2',
    'vector-effect': 'non-scaling-stroke',
  })
  const scrub = s('g', { visibility: 'hidden', 'pointer-events': 'none' }, scrubLine, scrubDot)

  const svg = s(
    'svg',
    {
      viewBox: `0 0 ${CHART_W} ${CHART_H}`,
      class: 'w-full block',
      role: 'img',
      'aria-label': `Weight chart, ${formatSpan(span)}`,
    },
    yAxis,
    xAxis,
    baseline,
    raw,
    circles,
    trend,
    scrub,
  )

  svg._marks = marks
  svg._select = (i) => {
    if (i == null) {
      scrub.setAttribute('visibility', 'hidden')
      return
    }
    const m = marks[i]
    scrubLine.setAttribute('x1', m.x.toFixed(1))
    scrubLine.setAttribute('x2', m.x.toFixed(1))
    scrubDot.setAttribute('cx', m.x.toFixed(1))
    scrubDot.setAttribute('cy', m.y.toFixed(1))
    scrub.setAttribute('visibility', 'visible')
  }
  svg._withTrend = withTrend
  return svg
}

/** `Sep 20 to Oct 19, 2026`, or with both years when the span crosses one. */
function formatSpan({ start, end }) {
  const a = fromDateStr(start)
  const b = fromDateStr(end)
  const day = { month: 'short', day: 'numeric' }
  const full = { ...day, year: 'numeric' }
  const sameYear = a.getFullYear() === b.getFullYear()
  return `${a.toLocaleDateString(undefined, sameYear ? day : full)} to ${b.toLocaleDateString(undefined, full)}`
}

/** Restart `.reading-swap` on a line whose text just changed. */
function replayReading(el) {
  el.classList.remove('reading-swap')
  void el.offsetWidth
  el.classList.add('reading-swap')
}

/** What the rate is over, said after it: `last 90 days`, or `all time`. */
const rangePhrase = (range) => (range ? `last ${range} days` : 'all time')

/**
 * Said once, quietly, under the card, when the readings in view are more than
 * `SPARSE_GAP_DAYS` apart on average. Not a notice: nothing is missing and
 * nothing is wrong, it is advice about the next weigh-in. Never alongside
 * `trendNotice`, which already says the more important thing.
 */
function sparseNote(inRange) {
  const gap = meanGapDays(inRange)
  if (gap == null || gap <= SPARSE_GAP_DAYS) return null
  return h(
    'p',
    { class: 'px-[20px] text-[12px] text-muted' },
    'Weigh in a few times a week for a more accurate trend.',
  )
}

/* ----------------------------------------------------------------- history */

/**
 * The mini ring. Same construction as the hero rings on Today, at a tenth the
 * area.
 *
 * These were flat bars, and rings are the better mark here for the reason the
 * dashboard already uses them: the app's language for "how much of a target"
 * is a ring, and a list that answers the same question with a different shape
 * makes the reader translate between two vocabularies to compare a day against
 * the card they just came from.
 *
 * Everything about how it is drawn is inherited rather than reinvented — see
 * lib/ring.js. The track is the macro's own hue at 20%, not a neutral, so an
 * untracked day still reads as three labelled macro rings rather than three
 * identical grey circles. The arc starts at 12 o'clock, runs clockwise, and is
 * round-capped. Zero draws no arc at all, and anything above zero draws at
 * least one stroke width — below that the two caps meet and the arc renders as
 * a dot at 12 o'clock, which reads as a fault rather than as "nearly nothing".
 *
 * It saturates at the target, as the hero rings do. Overage is carried by the
 * calorie figure beside it and by the `title`, not by the mark.
 */
export function weightScreen() {
  return createScreen(
    async () => {
      const [weights, settings] = await Promise.all([listWeights(), getSettings()])
      const unit = settings.weightUnit
      const today = todayStr()
      const todayEntry = await getWeight(today)

      // The trend at every weigh-in, over the whole record. Each range reads
      // its slice of this rather than smoothing its own, so the line in the
      // 30-day view is the same line as the last 30 days of the 90-day one.
      const series = smoothTrend(weights, settings.trendWindow)
      const latest = weights[weights.length - 1] || null
      // The headline figure is the record's, not the range's, and takes the
      // same three-reading floor the line does.
      const latestTrend =
        series.length >= MIN_ENTRIES_FOR_TREND ? series[series.length - 1].trend : null

      /**
       * The range switch stops rebuilding the screen and repaints its own two
       * marks instead.
       *
       * `range` changes the chart, the `± / week` line and the date-range line,
       * all three read off the same span. Everything else in this card is the
       * latest weigh-in and the trend figure, which do not know the range
       * exists. Routing the toggle through `rerender()` threw all of it away to
       * redraw two of them, and the visible cost was gaps item 12: the header,
       * the card, the control you just pressed and the chart were all replaced
       * on one frame, so the 30-day line and the 90-day line read as two
       * unrelated charts that happened to appear in the same box.
       *
       * This is the shape onboarding already uses one screen over: a shell that
       * is built once and holds still, and a payload handed a freshly built
       * subtree. The only rule that matters is the one that makes it safe —
       * `repaint` is never given a node the container is already holding, so
       * nothing on screen is ever detached and reattached, and anything mid-
       * transition keeps running.
       */
      const rateEl = h('span', { class: 'whitespace-nowrap text-[12px] text-muted' })
      const spanEl = h('span', { class: 'text-[12px] text-muted' })
      const chartSlot = h('div', { class: 'chart-slot' })
      /**
       * `contents`, so the wrapper is not in the layout when it is empty.
       *
       * The notice is a child of a `gap-[20px]` column, and an empty div still
       * counts as a child: a plain wrapper would hold 20px of air between the
       * chart card and the entry block in the ordinary state where there is no
       * notice to show. `display: contents` takes the box out of the flow
       * entirely and lets whatever it holds sit in the column directly, so the
       * gap appears with the notice and leaves with it.
       */
      const noticeSlot = h('div', { class: 'contents' })
      let swapTimer = null
      // The chart on show, for the scrub to read, and the rate line's text,
      // for the scrub to put back.
      let current = null
      let rateText = ''
      let shownSpan = null

      const drawRange = (animate) => {
        const span = rangeSpan(range, today, weights[0]?.date ?? today)
        const inRange = pointsIn(series, span)
        const rate = ratePerWeek(inRange)
        const readings = inRange.length

        // Same span, same breath. The chart, the rate and the sentence
        // explaining them are three views of one count.
        repaint(
          noticeSlot,
          readings < MIN_ENTRIES_FOR_TREND
            ? trendNotice(readings, weights.length)
            : sparseNote(inRange),
        )

        rateText =
          rate == null
            ? 'Not enough data'
            : `${signed(kgToUnit(rate, unit))} ${unit} / week, ${rangePhrase(range)}`
        const spanText = formatSpan(span)
        const changed = [rateEl, spanEl].filter((el, i) => el.textContent !== [rateText, spanText][i])
        rateEl.textContent = rateText
        spanEl.textContent = spanText

        /**
         * The same span draws the same chart, and then the chart is left alone.
         * `All` on a history younger than ninety days covers exactly the
         * 90-day span, and a cross-fade between two identical drawings is a
         * repaint dressed as a change. The rate line still changes (`all time`
         * for `last 90 days`), so it alone takes the swap.
         */
        const sameChart = span.start === shownSpan?.start && span.end === shownSpan?.end
        shownSpan = span
        if (animate && sameChart) {
          if (!reduceMotion()) changed.forEach((el) => replayReading(el))
          return
        }

        const next = chart({ series, span, unit }) || chartPlaceholder(range)
        current = next

        if (!animate || reduceMotion()) {
          clearTimeout(swapTimer)
          repaint(chartSlot, next)
          return
        }

        /**
         * The reading changed and the instrument did not, which is the sentence
         * `.reading-swap` was written for. Restarting it needs the class off,
         * a forced reflow, then on — the long form of why a `requestAnimationFrame`
         * is not a substitute is at `replay` in screens/onboarding.js.
         */
        changed.forEach((el) => replayReading(el))

        clearTimeout(swapTimer)
        // A second switch while the first is still fading finishes the first
        // outright rather than leaving three charts stacked in one box.
        chartSlot.querySelectorAll('[data-leaving="true"]').forEach((node) => node.remove())
        const outgoing = chartSlot.firstElementChild
        if (outgoing) outgoing.dataset.leaving = 'true'
        next.classList.add('chart-in')
        chartSlot.appendChild(next)
        swapTimer = setTimeout(() => {
          outgoing?.remove()
          next.classList.remove('chart-in')
        }, CHART_SWAP_MS)
      }

      const entryBlock = h(
        'section',
        { class: 'flex flex-col gap-[10px]' },
        h('div', { class: 'section-head' }, h('div', { class: 'section-label' }, 'Today’s weight')),
        todayWeightCard({ unit, today, todayEntry }),
      )

      if (!weights.length) {
        return h(
          'div',
          {},
          heading(),
          h(
            'div',
            { class: 'flex flex-col gap-[20px] pb-[20px]' },
            h(
              'section',
              { class: 'flex flex-col gap-[20px]' },
              h(
                'div',
                { class: 'flex flex-col gap-[10px]' },
                emptyState(
                  'No weigh-ins yet',
                  // `after a week of readings` named the wrong unit: the gate is
                  // 7 weigh-ins, not 7 days, and those are different promises to
                  // anyone who does not weigh in daily.
                  `Add today’s weight below. The trend line appears after ${MIN_ENTRIES_FOR_TREND} weigh-ins.`,
                ),
              ),
              entryBlock,
            ),
                      ),
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
        // Repaints its own two marks rather than rebuilding the screen. The
        // control moves its own pill, so nothing here has to redraw it.
        onChange: (v) => {
          range = v
          drawRange(true)
        },
      })

      /* ------------------------------------------------------- headline */

      const latestLabel = h('span', { class: 'text-[12px] font-semibold text-muted' }, 'Latest')
      const latestNum = tnum(fmtWeight(latest.kg, unit), 'text-display font-semibold')
      // Turns into `12 days ago` once the date stops being the useful fact
      // about it — see `formatDayAge`.
      const latestSub = h('span', { class: 'text-[12px] text-muted' }, formatDayAge(latest.date))
      const trendText = latestTrend == null ? '—' : fmtWeight(latestTrend, unit)
      const trendNum = tnum(trendText, 'text-title font-semibold')

      /**
       * The scrub: a finger on the chart picks the nearest weigh-in, and the
       * headline reads that weigh-in until the finger lifts.
       *
       * The headline rather than a tooltip, as Apple Health does it, because a
       * tooltip has to go somewhere and under a thumb there is nowhere it can
       * be read. The headline is already the place the eye goes for a number,
       * and its two columns map straight across: the reading on the left, the
       * trend at that reading on the right, which is the point of the heavy
       * line directly under the finger.
       *
       * Nearest weigh-in by x only. The trend between readings is a curve the
       * app drew, not a value it has, so the scrub never reports one.
       */
      let selected = null
      const showEntry = (i) => {
        if (i === selected) return
        selected = i
        current?._select?.(i)
        if (i == null) {
          latestLabel.textContent = 'Latest'
          setTabularText(latestNum, fmtWeight(latest.kg, unit))
          latestSub.textContent = formatDayAge(latest.date)
          setTabularText(trendNum, trendText)
          rateEl.textContent = rateText
          return
        }
        const m = current._marks[i]
        latestLabel.textContent = 'Weigh-in'
        setTabularText(latestNum, fmtWeight(m.kg, unit))
        latestSub.textContent = fromDateStr(m.date).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        setTabularText(trendNum, current._withTrend ? fmtWeight(m.trend, unit) : '—')
        // Held rather than emptied, for the reason at `rateEl` below.
        rateEl.textContent = '\u00a0'
      }

      horizontalScrub(chartSlot, {
        onScrub: (clientX) => {
          const marks = current?._marks
          if (!marks?.length) return
          const box = current.getBoundingClientRect()
          const vx = ((clientX - box.left) / box.width) * CHART_W
          let best = 0
          for (let i = 1; i < marks.length; i++) {
            if (Math.abs(marks[i].x - vx) < Math.abs(marks[best].x - vx)) best = i
          }
          showEntry(best)
        },
        onEnd: () => showEntry(null),
      })

      // The first paint fills the slot without animating: there is nothing for
      // the chart to have crossed from, and a screen that fades in on arrival is
      // a screen that looks like it is loading.
      drawRange(false)

      return h(
        'div',
        {},
        heading(),

        h(
          'div',
          { class: 'flex flex-col gap-[20px] pb-[20px]' },

          /**
           * `Weight` and `History`, each under a heading of its own.
           *
           * The chart had none, because for the tab's whole life it was the only
           * thing on the screen and the page title named it. Once history arrived
           * with a heading, the group without one read as page furniture rather
           * than as the first of two.
           *
           * The entry controls sit inside this section rather than after it: the
           * chart and the field are the same subject, and separating them would
           * make the section a chart with a stray form beneath it.
           */
          h(
            'section',
            { class: 'flex flex-col gap-[20px]' },

            /* Heading and chart are one group at 10; the 20 stays between the
               groups under it — chart, notice, entry. */
            h(
              'div',
              { class: 'flex flex-col gap-[10px]' },

              /**
               * `All weigh-ins` belongs to the section, not to today's field.
               *
               * It was the last row of the `Today's weight` card, which put a door
               * onto the entire record inside the one group scoped to a single day
               * of it. Up here it is the same shape as `Logged` and `Full log` on
               * Today: a heading names a group, and the control opposite goes to
               * all of it.
               *
               * Sitting over the chart is the better adjacency anyway — the chart
               * is the drawing, this is the readings behind it.
               *
               * No count on it, for the reason the log chip lost its own: a
               * destination's label should say where it goes, not how much is
               * there, or it has to be re-read every time it changes.
               */
              h(
                'div',
                { class: 'day-card flex flex-col gap-[20px]' },
                h(
                  'div',
                  { class: 'flex flex-col gap-[8px]' },
                  h(
                    'div',
                    { class: 'flex items-end justify-between gap-[10px]' },
                    h(
                      'div',
                      { class: 'flex flex-col' },
                      /**
                       * `Latest`, not `Current`.
                       *
                       * The figure is the most recent reading in the record, which
                       * is a different claim from the weight you are now — it was
                       * `Current` over a value from two days ago, and over one from
                       * nine days ago it would still have said so. `Latest` is the
                       * fact the app actually has; whether that is current is what
                       * the date under it is for.
                       */
                      latestLabel,
                      h(
                        'div',
                        { class: 'flex items-baseline gap-[10px]' },
                        latestNum,
                        h('span', { class: 'text-[12px] font-medium text-muted' }, unit),
                      ),
                      latestSub,
                    ),
                    /**
                     * `min-w-0` and a rate line that does not wrap: at 375pt
                     * `-0.2 lb / week, last 90 days` is a pixel wider than this
                     * column can be beside the 48px reading, and wrapping it put
                     * `days` on a line of its own and made the card a line
                     * taller on 30 and 90 than on All. The line it shares a row
                     * with on the left is `12 days ago`, not the reading, so
                     * there is room for it to run left past the column, which
                     * `items-end` does when the column is narrower than it.
                     */
                    h(
                      'div',
                      { class: 'flex min-w-0 flex-col items-end' },
                      h('span', { class: 'text-[12px] font-semibold text-muted' }, 'Trend'),
                      h(
                        'div',
                        { class: 'flex items-baseline gap-[10px]' },
                        trendNum,
                        h('span', { class: 'text-[12px] font-medium text-muted' }, unit),
                      ),
                      /**
                       * The rate over the selected range, or `Not enough data`
                       * when the range cannot carry one: fewer than three
                       * weigh-ins in it, or under a fortnight between the first
                       * and the last. It used to say nothing at all in that
                       * state and leave the notice below to explain, but the
                       * subtitle names the range now, so an empty one read as a
                       * rate that failed to load.
                       *
                       * The line is never empty, and that is a layout fact
                       * rather than a copy decision. This row is `items-end`, so
                       * the two columns hang from a shared baseline and the
                       * right one is three lines tall — dropping the third let
                       * the whole Trend stack slide down by a line. A card that
                       * reshuffles as data crosses a threshold reads as a
                       * rendering fault. The scrub holds it with a non-breaking
                       * space for the same reason: the same line box the real
                       * text occupies, so it stays right if the type size
                       * changes.
                       */
                      // Built above and filled by `drawRange`: this line reads off
                      // the same span the chart does, so it has to change in the
                      // same breath rather than a frame later.
                      rateEl,
                    ),
                  ),
                  // The span the chart covers, which `30 days` alone does not
                  // say: which thirty, and that they end today.
                  spanEl,
                ),

                // The chart's own box, filled and swapped by `drawRange`. The
                // held-height argument that used to live here moved to
                // `chartPlaceholder`, which is the thing that holds it.
                chartSlot,

                rangeRow,
              ),
            ),

            /**
             * Built and filled by `drawRange`, alongside the chart and the rate
             * — see `trendNotice` for what it says and why it reads off the
             * window rather than the record.
             *
             * The sentence itself is the same shape the History card makes
             * about averages: where the threshold is, how far off it is, and
             * what would be wrong with drawing it now. It read `The trend line
             * needs 7 weigh-ins before it means anything. You have 2.`, which
             * states the rule and the count but leaves "means anything" to be
             * taken on trust. The closing clause states the reason instead, and
             * states it as a principle rather than against the current count —
             * the way `An average of one day is just that day` does. It has to
             * hold at two weigh-ins and at six, so it cannot name a number.
             */
            noticeSlot,

            entryBlock,
          ),

                  ),
      )
    },
    // `entries` joins the watch list now that history lives here. `watchDate`
    // stays false: this screen is anchored to today and to its own range, and
    // opening the Log sheet from a row sets the shared date — re-rendering the
    // whole screen underneath the sheet that just opened would be work nobody
    // can see.
    { watch: ['weights', 'settings'], watchDate: false },
  )
}

/**
 * Root tab, so no chevrons — the plain variant. It holds Today's 44px slot
 * anyway, which is what puts this title on Today's baseline rather than 5.75px
 * above it. Settings renders the identical call with a different string.
 */
function heading() {
  return h(
    'div',
    { class: 'flex flex-col gap-[20px] pb-[20px]' },
    backRow({ label: 'Trends', onclick: () => navigate('trends') }),
    h(
      'div',
      { class: 'flex items-center justify-between gap-[10px]' },
      h('h1', { class: 'text-title font-semibold leading-tight' }, 'Weight'),
      h('button', { class: 'chip-sm', onclick: () => openWeighInSheet() }, 'All weigh-ins'),
    ),
  )
}