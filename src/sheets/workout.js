import { h } from '../lib/dom.js'
import { openSheet } from '../lib/sheet.js'
import { getSettings, onChange, saveExerciseMuscles } from '../lib/db.js'
import { BODY_VIEWS, ROLE_STEP, bodyMap, bodyThumb } from '../lib/bodyMap.js'
import { regionRole, rolesOf } from '../lib/bodyRegions.js'
import { MUSCLE_GROUPS, MUSCLE_LABELS, musclesLabel, musclesOf, primaryLabel } from '../lib/muscles.js'
import { performedSets, setCount, setLabel } from '../lib/training.js'
import { card, macroUnit, rowChevron, tnum } from '../lib/ui.js'
import { kcalGrouped, pluralize } from '../lib/format.js'
import { formatDayLabel, formatTime } from '../lib/dates.js'
import { musclePanel } from './musclePicker.js'

/**
 * One workout: what and when, its three totals, the exercises with the
 * part of the body each trains, then the whole of it on both figures.
 */

const LISTED_WEIGHTS = 'Weights as listed in Motra, per hand for dumbbells.'

const caption = (text) => h('span', { class: 'text-[12px] leading-snug text-muted' }, text)

const section = (title, ...body) =>
  h('section', { class: 'flex flex-col gap-[10px]' }, h('div', { class: 'section-title' }, title), ...body)

/**
 * One drawing with its name under it. Widths are shared out in proportion to
 * the drawings' own, which is what makes their heights equal.
 */
function figure(view, options) {
  const svg = bodyMap({ view, ...options })
  const { width } = svg.viewBox.baseVal
  return h(
    'div',
    { class: 'flex min-w-0 flex-col gap-[6px]', style: { flex: `${width} 1 0` } },
    svg,
    h('span', { class: 'text-center text-[12px] leading-tight text-muted', 'aria-hidden': 'true' }, view.label)
  )
}

/** Both figures at one height. `options` is asked once per drawing. */
export const bodyPair = (options) =>
  h(
    'div',
    { class: 'flex justify-center gap-[10px]' },
    BODY_VIEWS.map((view) => figure(view, options(view)))
  )

export const workoutHeading = (workout) =>
  h(
    'div',
    { class: 'flex flex-col gap-[4px]' },
    h('h2', { class: 'text-title font-semibold leading-tight' }, workout.title),
    h(
      'p',
      { class: 'text-[14px] text-muted' },
      `${formatDayLabel(workout.date)} · ${formatTime(workout.startedAt)}`
    )
  )

/** Motra rounds above this, so a longer figure would claim digits it did not give. */
const volumeFigure = (n) => (n >= 10000 ? `${Math.round(n / 100) / 10}K` : kcalGrouped(n))

/** Only the totals the paste had. An absent one is absent, not a zero. */
export function workoutFigures({ durationMin, reportedVolume, unit, calories }) {
  const muted = (text) => h('span', { class: 'text-[12px] font-medium text-muted' }, text)
  const figure = (value, mark, label) =>
    h(
      'div',
      { class: 'flex min-w-0 flex-1 flex-col gap-[2px]' },
      h(
        'div',
        { class: 'flex items-baseline gap-[4px]' },
        tnum(value, 'text-[20px] font-semibold leading-tight'),
        mark
      ),
      caption(label)
    )
  const figures = [
    durationMin == null ? null : figure(String(durationMin), muted('min'), 'Time'),
    reportedVolume == null ? null : figure(volumeFigure(reportedVolume), muted(unit), 'Volume'),
    calories == null ? null : figure(kcalGrouped(calories), macroUnit('kcal', 'text-[12px] font-semibold'), 'Calories'),
  ].filter(Boolean)
  return figures.length
    ? h(
        'div',
        { class: 'panel flex gap-[10px] p-[20px]' },
        figures
      )
    : null
}

/**
 * The half body, the name, and its sets with the primary muscles. A button with
 * `onclick`. `full` is the exercise's own sheet, which names the secondary ones.
 */
export function exerciseRow(ex, mappings, { onclick = null, full = false } = {}) {
  const muscles = musclesOf(ex, mappings)
  const sets = pluralize(performedSets(ex.sets), 'set')
  const line = (text) => h('span', { class: 'text-[14px] leading-snug text-muted' }, text)
  return h(
    onclick ? 'button' : 'div',
    { class: 'row', type: onclick ? 'button' : null, onclick },
    bodyThumb(muscles),
    h(
      'div',
      { class: 'flex min-w-0 flex-1 flex-col gap-[2px]' },
      h('span', { class: 'line-clamp-2 text-[16px] font-semibold leading-tight' }, ex.name),
      full
        ? [line(sets), line(musclesLabel(muscles))]
        : line([sets, primaryLabel(muscles)].filter(Boolean).join(' · '))
    ),
    onclick ? rowChevron() : null
  )
}

function musclesCard(workout, mappings) {
  const roles = rolesOf(workout.exercises.map((ex) => musclesOf(ex, mappings)), MUSCLE_GROUPS)
  if (!roles.primary.length && !roles.secondary.length) return null
  const chips = (role, title) =>
    roles[role].length
      ? h(
          'div',
          { class: 'flex flex-col gap-[6px]' },
          h(
            'div',
            { class: 'flex items-center gap-[6px] text-[12px] text-muted' },
            h('span', { class: 'role-dot', dataset: { step: String(ROLE_STEP[role]) }, 'aria-hidden': 'true' }),
            title
          ),
          h(
            'div',
            { class: 'flex flex-wrap gap-[6px]' },
            roles[role].map((g) => h('span', { class: 'delta-chip' }, MUSCLE_LABELS[g]))
          )
        )
      : null
  return section(
    'Muscles',
    h(
      'div',
      { class: 'day-card flex flex-col gap-[16px]' },
      bodyPair((view) => ({
        step: (groups) => ROLE_STEP[regionRole(groups, roles)] ?? 0,
        label: `Muscles in this workout, ${view.label.toLowerCase()}`,
      })),
      chips('primary', 'Primary'),
      chips('secondary', 'Secondary')
    )
  )
}

/** Repaints `el` whenever a muscle answer changes, for as long as it is open. */
function follow(ctx, el, build) {
  const paint = async () => {
    const { exerciseMuscles } = await getSettings()
    el.replaceChildren(...build(exerciseMuscles).filter(Boolean))
  }
  ctx.onDispose(onChange((scope) => (scope === 'settings' || scope === 'all') && paint()))
  return paint()
}

/** An exercise's sets and, once the workout is stored, the way to its muscles. */
export function setsPanel(ex, unit, { editable = true } = {}) {
  return {
    title: 'Sets',
    render: (ctx) => {
      if (editable) ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-secondary',
            type: 'button',
            onclick: async () => {
              const { exerciseMuscles } = await getSettings()
              ctx.push(
                musclePanel({
                  name: ex.name,
                  start: musclesOf(ex, exerciseMuscles),
                  note: 'Applies to every workout with this exercise.',
                  onSave: async (answer, panel) => {
                    await saveExerciseMuscles(ex.name, answer)
                    panel.pop()
                  },
                })
              )
            },
          },
          'Change muscles'
        )
      )
      const head = h('div', { class: 'card' })
      follow(ctx, head, (mappings) => [
        exerciseRow(ex, mappings, { full: true }),
      ])
      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        head,
        card(
          ex.sets.map((set, i) =>
            h(
              'div',
              { class: 'row row-single justify-between' },
              h('span', { class: 'text-[14px] text-muted' }, `Set ${i + 1}`),
              tnum(setLabel(set, unit), 'text-[14px] font-semibold')
            )
          )
        ),
        caption(LISTED_WEIGHTS)
      )
    },
  }
}

export function openWorkout(workout) {
  return openSheet({
    title: 'Workout',
    render: (ctx) => {
      const rest = h('div', { class: 'flex flex-col gap-[20px]' })
      follow(ctx, rest, (mappings) => [
        section(
          `${pluralize(workout.exercises.length, 'exercise')}, ${pluralize(setCount(workout), 'set')}`,
          card(
            workout.exercises.map((ex) =>
              exerciseRow(ex, mappings, {
                onclick: () => ctx.push(setsPanel(ex, workout.unit)),
              })
            )
          )
        ),
        musclesCard(workout, mappings),
      ])
      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        workoutHeading(workout),
        workoutFigures(workout),
        rest
      )
    },
  })
}
