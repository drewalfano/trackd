import { h, countTo, setTabularText, fitText } from './dom.js'
import { icon } from './icons.js'
import { MACRO_ORDER, MACRO_META, progress } from './compute.js'
import { g, kcal, round, cmToFtIn, ftInToCm } from './format.js'
import { formatDateSub, formatDayLabel, isFuture } from './dates.js'

/**
 * The component vocabulary. Everything visual that appears on more than one
 * screen lives here, so the visual system has exactly one place to change.
 *
 * Layout spacing is on a 10px grid throughout: 10 inside a group, 20 between
 * groups, 30 between sections. The only sub-10 values are typographic — a
 * heading and the line directly under it are one unit, not two.
 */

const MACRO_VAR = {
  kcal: 'var(--color-kcal)',
  protein: 'var(--color-protein)',
  fat: 'var(--color-fat)',
  carbs: 'var(--color-carbs)',
}

const MACRO_EDGE = {
  kcal: 'var(--color-kcal-edge)',
  protein: 'var(--color-protein-edge)',
  fat: 'var(--color-fat-edge)',
  carbs: 'var(--color-carbs-edge)',
}

/**
 * Macro colour as TEXT, which is never the fill.
 *
 * The gold fill is 2.10:1 on white and the green 3.28:1 — both fail AA for the
 * 15px P/F/C suffixes. These resolve to the darker shade in light mode and to a
 * lighter tint in dark, where the darker shades fail instead.
 */
const MACRO_TEXT = {
  kcal: 'var(--color-kcal-text)',
  protein: 'var(--color-protein-text)',
  fat: 'var(--color-fat-text)',
  carbs: 'var(--color-carbs-text)',
}

/** Digit nodes for a string, for use inside an element that carries .tnum. */
export function digits(text) {
  const holder = h('span')
  setTabularText(holder, text)
  return [...holder.childNodes]
}

/** A number that holds its position as it changes. See `.tnum` in styles.css. */
export function tnum(text, cls = '') {
  return h('span', { class: `tnum ${cls}`.trim() }, ...digits(text))
}

/** The fill shade. For painted areas only — see MACRO_TEXT for type. */
export const macroColor = (macro) => MACRO_VAR[macro]
export const macroTextColor = (macro) => MACRO_TEXT[macro]

/**
 * The darker shade of the same hue. It means one thing everywhere it appears:
 * the part past the target. The bars carry it on `bar-over`, the rings on the
 * second lap, so excess is one encoding across both marks rather than two.
 */
export const macroEdgeColor = (macro) => MACRO_EDGE[macro]

/* ------------------------------------------------------------------ header */

/**
 * Centred title, muted date beneath, circular chevrons either side.
 * Future dates are permitted but muted — you can log ahead, it just does not
 * look like today.
 */
export function screenHeader({ title, date, onPrev, onNext, onPickDate, subtitle }) {
  const future = date ? isFuture(date) : false

  const dateInput =
    onPickDate &&
    h('input', {
      type: 'date',
      value: date,
      class: 'pointer-events-none absolute inset-0 h-full w-full opacity-0',
      tabindex: '-1',
      'aria-hidden': 'true',
      onchange: (e) => e.target.value && onPickDate(e.target.value),
    })

  return h(
    'header',
    { class: 'flex items-center gap-[10px]' },
    onPrev
      ? h(
          'button',
          { class: 'icon-btn', 'aria-label': 'Previous day', onclick: onPrev },
          icon('chevronLeft', { size: 20, stroke: 2 })
        )
      : h('div', { class: 'w-11 shrink-0' }),
    h(
      'button',
      {
        class: 'relative min-w-0 flex-1',
        style: future ? { opacity: '0.5' } : null,
        disabled: !onPickDate,
        onclick: (e) => {
          const input = e.currentTarget.querySelector('input')
          if (!input) return
          input.style.pointerEvents = 'auto'
          if (typeof input.showPicker === 'function') input.showPicker()
          else input.click()
        },
      },
      h(
        'div',
        { class: 'truncate text-title font-semibold' },
        title
      ),
      h(
        'div',
        { class: 'truncate text-[12px] leading-tight text-muted' },
        subtitle ?? (date ? formatDateSub(date) : '')
      ),
      dateInput
    ),
    onNext
      ? h(
          'button',
          { class: 'icon-btn', 'aria-label': 'Next day', onclick: onNext },
          icon('chevronRight', { size: 20, stroke: 2 })
        )
      : h('div', { class: 'w-11 shrink-0' })
  )
}

/**
 * The page header the redesign settled on: a circular button, a centred title,
 * a circular button. Either side may be absent and leaves a spacer, so the
 * title stays optically centred whether it is flanked by two controls, one, or
 * none.
 *
 * Both chevrons are the same shape and mean different things by screen — on a
 * day view they step the date, on a pushed screen they go back. That ambiguity
 * is in the design; the `aria-label` is what keeps it unambiguous to anything
 * that is not looking at it.
 *
 * `forwardDisabled` keeps the forward chevron present but dimmed rather than
 * swapping it for a spacer. A day view that shows one chevron, on the left,
 * with empty space opposite is reading as a Back button on the screen where iOS
 * has trained everyone that a lone top-left chevron means exactly that. Two
 * chevrons flanking a date read as a stepper, and the pair stays put as the
 * date changes instead of the header re-forming under the thumb.
 */
export function navHeader({
  title,
  onBack,
  backLabel = 'Back',
  onForward,
  forwardLabel = 'Forward',
  forwardDisabled = false,
}) {
  const spacer = () => h('div', { class: 'w-11 shrink-0' })
  const btn = (label, handler, name, disabled = false) =>
    h(
      'button',
      { class: 'icon-btn', 'aria-label': label, disabled, onclick: handler },
      icon(name, { size: 20, stroke: 2 })
    )

  // `truncate` stays as the backstop for anything `fitText` cannot shrink to
  // fit by the floor — better a clipped title than one at 14px.
  const heading = fitText(
    h('h1', { class: 'min-w-0 flex-1 truncate text-center text-title font-semibold' }, title)
  )

  return h(
    'header',
    { class: 'mb-[16px] flex items-center gap-[10px]' },
    onBack ? btn(backLabel, onBack, 'chevronLeft') : spacer(),
    heading,
    onForward || forwardDisabled
      ? btn(forwardLabel, onForward, 'chevronRight', forwardDisabled)
      : spacer()
  )
}

/** Header for a date-navigating screen. Title doubles as the relative day. */
export function dayHeader({ date, setDate, title }) {
  return screenHeader({
    title: title ?? formatDayLabel(date),
    date,
    onPrev: () => setDate(-1),
    onNext: () => setDate(1),
    onPickDate: (value) => setDate(value),
  })
}

/** Plain screen title for the destinations that do not navigate by day. */
export function pageTitle(title, subtitle) {
  return h(
    'div',
    {},
    h('h1', { class: 'text-title font-semibold' }, title),
    subtitle ? h('p', { class: 'text-[13px] text-muted' }, subtitle) : null
  )
}

/* -------------------------------------------------------------- macro line */

/**
 * `650 cal · 35 P · 22 F · 70 C`
 * Numbers stay in ink so the data is readable; only the unit carries colour.
 * Fixed order, always.
 */
export function macroLine(totals, { size = 12, muted = false, omit = [] } = {}) {
  const parts = []
  const shown = MACRO_ORDER.filter((m) => !omit.includes(m))
  shown.forEach((macro, i) => {
    const meta = MACRO_META[macro]
    const value = macro === 'kcal' ? kcal(totals.kcal) : g(totals[macro])
    if (i > 0) parts.push(h('span', { class: 'text-muted', 'aria-hidden': 'true' }, '·'))
    parts.push(
      h(
        'span',
        { class: 'whitespace-nowrap' },
        h('span', { class: muted ? 'text-muted' : '' }, value),
        ' ',
        h(
          'span',
          { style: { color: MACRO_TEXT[macro] }, class: 'font-semibold' },
          macro === 'kcal' ? 'cal' : meta.letter
        )
      )
    )
  })

  return h(
    'div',
    {
      class: 'flex flex-wrap items-baseline gap-x-[6px] font-medium',
      style: { fontSize: `${size}px` },
      'aria-label': `${kcal(totals.kcal)} calories, ${g(totals.protein)} grams protein, ${g(
        totals.fat
      )} grams fat, ${g(totals.carbs)} grams carbs`,
    },
    parts
  )
}

/* ------------------------------------------------------------------- bars */

/**
 * Where each bar was last drawn, so a re-render resumes from the previous fill
 * instead of replaying from zero. Screens rebuild their whole subtree on any
 * data change, and without this every keystroke elsewhere would re-run the
 * entrance animation — bars animate on value change only.
 */
const lastPct = new Map()

/**
 * A track and an inset fill. Going over fills the track and shows the excess as
 * a chip inside the fill — no colour change, no error state. Over is
 * information.
 *
 * Zero draws no fill at all. A zero-width fill is not invisible: its own 1px
 * stroke collapses into a 2px coloured tick against the left cap, and four of
 * those stacked up on a fresh day read as a rendering fault rather than as
 * "nothing logged". The empty track is the zero state.
 */
export function progressBar({ value, target, macro, animate = true, key = macro }) {
  const { pct, over } = progress(value, target)
  const from = animate ? (lastPct.get(key) ?? 0) : pct
  lastPct.set(key, pct)

  // Kept when it has somewhere to animate FROM, so deleting the last entry
  // still shrinks the bar away instead of snapping.
  const fill =
    pct > 0 || from > 0
      ? h(
          'div',
          {
            class: 'bar-fill',
            style: {
              width: `${from}%`,
              background: MACRO_VAR[macro],
              borderColor: MACRO_EDGE[macro],
              // A 2% sliver would render as a broken-looking nub; below the
              // width of its own cap the fill is better shown as nothing at all.
              minWidth: pct > 0 ? '24px' : '0px',
            },
          },
          // A full-height segment of the darker shade, butted against the fill's
          // right end and clipped to its cap by the fill's own overflow:hidden.
          over > 0
            ? h(
                'span',
                { class: 'bar-over', style: { background: MACRO_EDGE[macro] } },
                `+${Math.round(over)}`
              )
            : null
        )
      : null

  const track = h(
    'div',
    {
      class: 'bar-track',
      role: 'progressbar',
      'aria-valuenow': Math.round(value),
      'aria-valuemin': '0',
      'aria-valuemax': Math.round(target) || 0,
    },
    fill
  )

  if (fill && animate && from !== pct) {
    requestAnimationFrame(() => {
      fill.style.width = `${pct}%`
      // Fades the stroke out with the width, so the shrink does not land on the
      // same 2px tick the zero state exists to avoid.
      if (pct === 0) fill.style.opacity = '0'
    })
  }
  return track
}

/**
 * Coloured macro heading, `consumed / target` beneath it, then the bar.
 * The heading and its numbers are one typographic unit; the 10px gap is
 * between that unit and the bar.
 */
export function macroRow({ macro, value, target }) {
  return h(
    'div',
    { class: 'flex flex-col gap-[10px]' },
    h(
      'div',
      {},
      h(
        'div',
        {
          class: 'text-[16px] font-semibold leading-tight',
          style: { color: MACRO_TEXT[macro] },
        },
        MACRO_META[macro].label
      ),
      h(
        'div',
        { class: 'tnum text-[16px] leading-tight' },
        h('span', { class: 'font-semibold' }, ...digits(`${g(value)}g`)),
        h('span', { class: 'text-muted' }, ...digits(` / ${g(target)}g`))
      )
    ),
    progressBar({ value, target, macro })
  )
}

/**
 * The calories block: the number at display size with the target trailing small
 * and grey, the label beneath it, then a full-width bar.
 */
let lastKcal = 0

export function caloriesBlock({ value, target }) {
  const number = h('span', { class: 'tnum text-display font-semibold' })
  // Same reasoning as the bars: count up from wherever the number last was, so
  // logging one more thing ticks 2255 → 2489 rather than restarting at zero.
  number.dataset.value = String(lastKcal)
  lastKcal = value
  countTo(number, value, { format: (n) => kcal(n) })

  return h(
    'div',
    { class: 'flex flex-col gap-[10px]' },
    h(
      'div',
      {},
      h(
        'div',
        { class: 'flex items-baseline gap-[8px]' },
        number,
        tnum(`/ ${kcal(target)}`, 'text-[16px] text-muted')
      ),
      h(
        'div',
        {
          class: 'text-[16px] font-semibold leading-tight',
          style: { color: MACRO_TEXT.kcal },
        },
        'Calories'
      )
    ),
    progressBar({ value, target, macro: 'kcal' })
  )
}

/* ------------------------------------------------------------------- lists */

export function card(...children) {
  return h('div', { class: 'card' }, children)
}

/**
 * A container whose contents get painted in later, and may stay empty.
 *
 * `empty:hidden` is the whole point. Panels lay out in a `gap` column, and an
 * empty flex child still takes a full gap — so an offline notice that is not
 * showing, or a hint line with nothing to say, silently spends 20px it has no
 * content to justify. Left alone, the sheet's rhythm depends on state nobody
 * can see. Anything painted unconditionally can stay a plain div.
 */
export function slot(className = '') {
  return h('div', { class: `empty:hidden ${className}`.trim() })
}

export function sectionLabel(text, right) {
  return h(
    'div',
    { class: 'flex items-center justify-between gap-[10px]' },
    h('div', { class: 'section-label' }, text),
    right || null
  )
}

/**
 * A row inside a grouped card. Single-line rows are exactly 48px; rows with a
 * subtitle grow. `right` sits at the end, before the chevron.
 */
export function listRow({ title, subtitle, right, onclick, chevron = false, leading, dim = false }) {
  const tag = onclick ? 'button' : 'div'
  return h(
    tag,
    {
      class: `row${subtitle ? '' : ' row-single'}${dim ? ' opacity-60' : ''}`,
      onclick,
      type: onclick ? 'button' : null,
    },
    leading || null,
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      h('div', { class: 'truncate text-[16px] font-semibold' }, title),
      subtitle ? h('div', { class: 'truncate text-[12px] text-muted' }, subtitle) : null
    ),
    right || null,
    chevron ? icon('chevronRight', { size: 20, class: 'text-muted shrink-0' }) : null
  )
}

export function emptyRow(text, { action, onAction } = {}) {
  return h(
    'div',
    { class: 'row justify-between' },
    h('span', { class: 'text-[14px] text-muted' }, text),
    action
      ? h(
          'button',
          { class: 'text-[14px] font-semibold underline underline-offset-2', onclick: onAction },
          action
        )
      : null
  )
}

/** A full-screen "nothing here yet" state. Text only, no illustration. */
export function emptyState(title, body, action) {
  return h(
    'div',
    { class: 'flex flex-col items-center gap-[10px] px-[20px] py-[50px] text-center' },
    h('p', { class: 'text-[16px] font-semibold' }, title),
    h('p', { class: 'text-[14px] leading-snug text-muted' }, body),
    action || null
  )
}

/* ---------------------------------------------------------------- controls */

/** Scrolling row of pill chips. Selected chip goes solid ink. */
export function segmented({ options, value, onChange, class: cls = '' }) {
  return h(
    'div',
    { class: `flex gap-[10px] overflow-x-auto no-scrollbar ${cls}` },
    options.map((opt) =>
      h(
        'button',
        {
          class: 'chip',
          'aria-pressed': String(opt.value === value),
          onclick: () => onChange(opt.value),
        },
        opt.label
      )
    )
  )
}

/** Full-width segmented control that splits the row evenly. */
export function segmentedWide({ options, value, onChange }) {
  return h(
    'div',
    { class: 'segmented' },
    options.map((opt) =>
      h(
        'button',
        {
          class: 'segment',
          'aria-pressed': String(opt.value === value),
          onclick: () => onChange(opt.value),
        },
        opt.label
      )
    )
  )
}

/* Removed in v1.2.1. Its one caller was the day card's Eaten / Remaining
   switch, and that control is gone — see `modeDots` in screens/today.js for
   what replaced it and why. */

export function labelledField({ label, hint, children }) {
  return h(
    'label',
    { class: 'flex flex-col gap-[10px]' },
    h('span', { class: 'text-[14px] font-semibold' }, label),
    children,
    hint ? h('span', { class: 'text-[12px] text-muted' }, hint) : null
  )
}

/**
 * A labelled on/off row.
 *
 * The app's other binary is `segmented`, which names both sides and demands a
 * choice — right for "per serving or per 100", where neither is a default and
 * getting it wrong changes what the numbers mean. This is for the other kind:
 * one side is the ordinary case and the other is an opt-in, and the control
 * should be quiet about it rather than asking every time.
 *
 * A real `role="switch"` rather than a checkbox, because "off" here is not
 * "unticked, please tick" — it is a complete, correct answer.
 */
export function switchRow({ label, hint, checked = false, onChange }) {
  const knob = h('span', { class: 'switch-knob' })
  const control = h(
    'button',
    {
      type: 'button',
      class: 'switch',
      role: 'switch',
      'aria-checked': String(checked),
      onclick: () => {
        const next = control.getAttribute('aria-checked') !== 'true'
        control.setAttribute('aria-checked', String(next))
        onChange?.(next)
      },
    },
    knob
  )

  return h(
    'div',
    { class: 'flex items-center gap-[20px]' },
    h(
      'div',
      { class: 'flex min-w-0 flex-1 flex-col gap-[2px]' },
      h('span', { class: 'text-[14px] font-semibold' }, label),
      hint ? h('span', { class: 'text-[12px] leading-snug text-muted' }, hint) : null
    ),
    control
  )
}

export function numberInput({ value, onInput, placeholder, suffix, step = 'any', ...rest }) {
  const input = h('input', {
    class: 'w-full min-w-0 text-[16px] font-semibold',
    type: 'number',
    inputmode: 'decimal',
    step,
    value: value ?? '',
    placeholder: placeholder ?? '0',
    oninput: (e) => onInput?.(e.target.value, e),
    ...rest,
  })
  const wrapper = h(
    'div',
    { class: 'field' },
    input,
    suffix ? h('span', { class: 'shrink-0 text-[14px] text-muted' }, suffix) : null
  )
  // Callers that need to write a new value back (the unit toggle converting
  // 2 servings into 60 g) need the field itself, not the wrapper.
  wrapper.input = input
  return wrapper
}

/**
 * A day. Native `type="date"` rather than a hand-rolled calendar: it is the one
 * control where the platform picker is unambiguously better than anything worth
 * building here, and it comes with the locale's own date order for free.
 */
export function dateInput({ value, max, min, onChange }) {
  const input = h('input', {
    class: 'w-full min-w-0 bg-transparent text-[16px] font-semibold',
    type: 'date',
    value: value ?? '',
    max: max ?? null,
    min: min ?? null,
    onchange: (e) => onChange?.(e.target.value, e),
  })
  const wrapper = h('div', { class: 'field' }, input)
  wrapper.input = input
  return wrapper
}

/**
 * Height, in one field or two depending on the units preference.
 *
 * The two imperial fields are one measurement, so they report a single value in
 * centimetres and the caller never sees feet or inches at all. Inches over 11
 * are accepted while typing and carried on blur — normalising mid-keystroke
 * would move the digits under the finger, and 5 ft 13 in is a legible thing to
 * be halfway through typing.
 */
export function heightInput({ cm, units, onChange }) {
  if (units !== 'imperial') {
    return numberInput({
      value: cm == null ? '' : round(cm, 1),
      suffix: 'cm',
      onInput: (v) => onChange(v === '' ? null : Number(v)),
    })
  }

  const start = cm == null ? { ft: '', in: '' } : cmToFtIn(cm)
  let ft = String(start.ft)
  let inches = String(start.in)

  const emit = () =>
    onChange(ft === '' && inches === '' ? null : ftInToCm(ft, inches))

  const normalise = () => {
    if (ft === '' && inches === '') return
    const carried = cmToFtIn(ftInToCm(ft, inches))
    ft = String(carried.ft)
    inches = String(carried.in)
    ftField.input.value = ft
    inField.input.value = inches
    emit()
  }

  const ftField = numberInput({
    value: ft,
    suffix: 'ft',
    step: '1',
    placeholder: '5',
    onInput: (v) => {
      ft = v
      emit()
    },
    onblur: normalise,
  })

  const inField = numberInput({
    value: inches,
    suffix: 'in',
    step: '1',
    placeholder: '11',
    onInput: (v) => {
      inches = v
      emit()
    },
    onblur: normalise,
  })

  return h(
    'div',
    { class: 'flex gap-[10px]' },
    h('div', { class: 'min-w-0 flex-1' }, ftField),
    h('div', { class: 'min-w-0 flex-1' }, inField)
  )
}

export function textInput({ value, onInput, placeholder, ...rest }) {
  const input = h('input', {
    class: 'w-full min-w-0 text-[16px] font-semibold',
    type: 'text',
    value: value ?? '',
    placeholder: placeholder ?? '',
    oninput: (e) => onInput?.(e.target.value, e),
    ...rest,
  })
  const wrapper = h('div', { class: 'field' }, input)
  wrapper.input = input
  return wrapper
}

/** Time-block picker, prefilled by the clock but always overrideable. */
export function blockSelector({ value, onChange, blockNames }) {
  return segmentedWide({
    options: ['morning', 'afternoon', 'night'].map((b, i) => ({
      value: b,
      label: blockNames[i],
    })),
    value,
    onChange,
  })
}

/**
 * A non-blocking notice. Used for OFF data that looks wrong, offline states,
 * and the iOS install hint. Ink and grey — never red, never an alert colour.
 */
export function notice(text, { iconName = 'info', action, onAction } = {}) {
  return h(
    'div',
    /* Same box as a `.row` — 10/20 inset, 48 minimum — so a notice sitting
       above a card lines up with the rows inside it. The 15 it used to carry
       hit the same height by a number the app uses nowhere else. */
    { class: 'panel flex min-h-[48px] items-start gap-[10px] px-[20px] py-[10px]' },
    icon(iconName, { size: 20, class: 'mt-px shrink-0 text-muted' }),
    h(
      'div',
      { class: 'flex-1 text-[13px] leading-snug' },
      text,
      action
        ? h(
            'button',
            {
              class: 'mt-[10px] block text-[13px] font-semibold underline underline-offset-2',
              onclick: onAction,
            },
            action
          )
        : null
    )
  )
}

export function spinner(label = 'Loading') {
  return h(
    'div',
    { class: 'flex items-center justify-center py-[40px] text-[14px] text-muted' },
    label + '…'
  )
}
