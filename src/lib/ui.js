import { h, countTo } from './dom.js'
import { icon } from './icons.js'
import { MACRO_ORDER, MACRO_META, progress } from './compute.js'
import { g, kcal } from './format.js'
import { formatDateSub, formatDayLabel, isFuture, todayStr } from './dates.js'

/**
 * The component vocabulary. Everything visual that appears on more than one
 * screen lives here, so the visual system has exactly one place to change.
 */

const MACRO_VAR = {
  kcal: 'var(--color-kcal)',
  protein: 'var(--color-protein)',
  fat: 'var(--color-fat)',
  carbs: 'var(--color-carbs)',
}

export const macroColor = (macro) => MACRO_VAR[macro]

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
    { class: 'flex items-center gap-2 px-4 pb-4 pt-2' },
    onPrev
      ? h(
          'button',
          { class: 'icon-btn', 'aria-label': 'Previous day', onclick: onPrev },
          icon('chevronLeft', { size: 20 })
        )
      : h('div', { class: 'w-9' }),
    h(
      'button',
      {
        class: 'relative min-w-0 flex-1 py-1',
        style: future ? { opacity: '0.55' } : null,
        disabled: !onPickDate,
        onclick: (e) => {
          const input = e.currentTarget.querySelector('input')
          if (!input) return
          input.style.pointerEvents = 'auto'
          if (typeof input.showPicker === 'function') input.showPicker()
          else input.click()
        },
      },
      h('div', { class: 'truncate text-[17px] font-bold leading-tight' }, title),
      h(
        'div',
        { class: 'truncate text-[13px] leading-tight text-muted' },
        subtitle ?? (date ? formatDateSub(date) : '')
      ),
      dateInput
    ),
    onNext
      ? h(
          'button',
          { class: 'icon-btn', 'aria-label': 'Next day', onclick: onNext },
          icon('chevronRight', { size: 20 })
        )
      : h('div', { class: 'w-9' })
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

/* -------------------------------------------------------------- macro line */

/**
 * `650 cal · 35 P · 22 F · 70 C`
 * Numbers stay in ink so the data is readable; only the unit letter carries
 * colour. Fixed order, always.
 */
export function macroLine(totals, { size = 13, muted = false, omit = [] } = {}) {
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
          { style: { color: MACRO_VAR[macro] }, class: 'font-semibold' },
          macro === 'kcal' ? 'cal' : meta.letter
        )
      )
    )
  })

  return h(
    'div',
    {
      class: 'flex flex-wrap items-baseline gap-x-1.5 font-medium',
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
 * A track and a fill. Going over fills the track and shows the excess as a chip
 * inside the fill — no colour change, no error state. Over is information.
 */
export function progressBar({ value, target, macro, animate = true, key = macro }) {
  const { pct, over } = progress(value, target)
  const from = animate ? (lastPct.get(key) ?? 0) : pct
  lastPct.set(key, pct)

  const fill = h(
    'div',
    {
      class: 'bar-fill',
      style: {
        width: `${from}%`,
        background: MACRO_VAR[macro],
      },
    },
    over > 0
      ? h(
          'span',
          {
            class: 'mr-1 rounded-full px-1.5 text-[10px] font-semibold leading-[13px] text-white',
            style: { background: 'color-mix(in srgb, #000 26%, transparent)' },
          },
          `+${Math.round(over)}`
        )
      : null
  )

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

  if (animate && from !== pct) requestAnimationFrame(() => (fill.style.width = `${pct}%`))
  return track
}

/** Label, `consumed / target` beneath, then the bar. Used for P, F, C. */
export function macroRow({ macro, value, target }) {
  return h(
    'div',
    { class: 'flex flex-col gap-1.5' },
    h(
      'div',
      { class: 'flex items-baseline justify-between' },
      h('span', { class: 'text-[14px] font-semibold' }, MACRO_META[macro].label),
      h(
        'span',
        { class: 'text-[13px] text-muted' },
        `${g(value)} / ${g(target)}`,
        h('span', { class: 'ml-0.5' }, 'g')
      )
    ),
    progressBar({ value, target, macro })
  )
}

/**
 * The calories block: label, display number with the target trailing small and
 * grey, then a full-width bar.
 */
let lastKcal = 0

export function caloriesBlock({ value, target }) {
  const number = h('span', { class: 'text-display font-bold' })
  // Same reasoning as the bars: count up from wherever the number last was, so
  // logging one more thing ticks 2255 → 2489 rather than restarting at zero.
  number.dataset.value = String(lastKcal)
  lastKcal = value
  countTo(number, value, { format: (n) => kcal(n) })

  return h(
    'div',
    { class: 'flex flex-col gap-2' },
    h('span', { class: 'text-[14px] font-semibold' }, 'Calories'),
    h(
      'div',
      { class: 'flex items-baseline gap-1.5' },
      number,
      h('span', { class: 'text-[15px] font-medium text-muted' }, `/ ${kcal(target)}`)
    ),
    progressBar({ value, target, macro: 'kcal' })
  )
}

/* ------------------------------------------------------------------- lists */

export function card(...children) {
  return h('div', { class: 'card' }, children)
}

export function sectionLabel(text, right) {
  return h(
    'div',
    { class: 'flex items-end justify-between' },
    h('div', { class: 'section-label' }, text),
    right || null
  )
}

/**
 * A tappable row inside a grouped card. `right` sits at the end, before the
 * chevron. Keeps the 44px minimum without every caller remembering to.
 */
export function listRow({ title, subtitle, right, onclick, chevron = false, leading, dim = false }) {
  const tag = onclick ? 'button' : 'div'
  return h(
    tag,
    { class: 'row' + (dim ? ' opacity-60' : ''), onclick, type: onclick ? 'button' : null },
    leading || null,
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      h('div', { class: 'truncate text-[15px] font-medium' }, title),
      subtitle ? h('div', { class: 'mt-0.5 truncate text-[13px] text-muted' }, subtitle) : null
    ),
    right || null,
    chevron ? icon('chevronRight', { size: 18, class: 'text-muted shrink-0' }) : null
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
    { class: 'flex flex-col items-center gap-2 px-8 py-14 text-center' },
    h('p', { class: 'text-[16px] font-semibold' }, title),
    h('p', { class: 'text-[14px] leading-snug text-muted' }, body),
    action || null
  )
}

/* ---------------------------------------------------------------- controls */

/** Pill segmented control. Selected segment goes solid ink. */
export function segmented({ options, value, onChange, class: cls = '' }) {
  return h(
    'div',
    { class: `flex gap-2 overflow-x-auto no-scrollbar ${cls}` },
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

/**
 * Full-width segmented control that splits the row evenly.
 * `on` picks the track colour: surface against the canvas, canvas inside a card.
 */
export function segmentedWide({ options, value, onChange, on = 'canvas' }) {
  return h(
    'div',
    { class: `flex gap-1 rounded-full p-1 ${on === 'card' ? 'bg-canvas' : 'bg-surface'}` },
    options.map((opt) =>
      h(
        'button',
        {
          class:
            'flex-1 rounded-full py-2 text-[14px] font-semibold transition-colors ' +
            (opt.value === value ? 'bg-ink text-surface' : 'text-muted'),
          onclick: () => onChange(opt.value),
        },
        opt.label
      )
    )
  )
}

export function labelledField({ label, hint, children }) {
  return h(
    'label',
    { class: 'flex flex-col gap-1.5' },
    h('span', { class: 'text-[13px] font-semibold text-muted' }, label),
    children,
    hint ? h('span', { class: 'text-[12px] text-muted' }, hint) : null
  )
}

export function numberInput({ value, onInput, placeholder, suffix, step = 'any', ...rest }) {
  const input = h('input', {
    class: 'w-full text-[17px] font-medium',
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
    { class: 'field flex items-center gap-2' },
    input,
    suffix ? h('span', { class: 'text-[14px] text-muted' }, suffix) : null
  )
  // Callers that need to write a new value back (the unit toggle converting
  // 2 servings into 60 g) need the field itself, not the wrapper.
  wrapper.input = input
  return wrapper
}

export function textInput({ value, onInput, placeholder, ...rest }) {
  return h('input', {
    class: 'field text-[17px] font-medium',
    type: 'text',
    value: value ?? '',
    placeholder: placeholder ?? '',
    oninput: (e) => onInput?.(e.target.value, e),
    ...rest,
  })
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
    { class: 'flex items-start gap-2.5 rounded-2xl bg-surface px-4 py-3' },
    icon(iconName, { size: 18, class: 'mt-px shrink-0 text-muted' }),
    h(
      'div',
      { class: 'flex-1 text-[13px] leading-snug' },
      text,
      action
        ? h(
            'button',
            {
              class: 'mt-1.5 block text-[13px] font-semibold underline underline-offset-2',
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
    { class: 'flex items-center justify-center gap-2 py-8 text-[14px] text-muted' },
    label + '…'
  )
}
