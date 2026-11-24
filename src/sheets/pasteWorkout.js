import { h, repaint } from '../lib/dom.js'
import { openSheet } from '../lib/sheet.js'
import { toast } from '../lib/toast.js'
import { findWorkout, getSettings, saveWorkout } from '../lib/db.js'
import { MotraError, countMismatch, parseMotra, sameWorkout } from '../lib/motra.js'
import { unknownExercises } from '../lib/muscles.js'
import { setCount } from '../lib/training.js'
import { card, notice, slot } from '../lib/ui.js'
import { pluralize } from '../lib/format.js'
import { dayPhrase } from '../lib/dates.js'
import { musclePanel } from './musclePicker.js'
import { exerciseRow, setsPanel, workoutFigures, workoutHeading } from './workout.js'

/**
 * Paste a workout: read, preview, then save.
 *
 * **The clipboard is read on the first line of the tap**, before anything is
 * awaited or opened. iOS grants a read only inside the gesture that asked for
 * it. A refusal, or a browser with no clipboard to read, opens the same sheet
 * with an empty field.
 */
export function pasteWorkout({ onSaved } = {}) {
  let read = null
  try {
    read = navigator.clipboard?.readText?.() ?? null
  } catch {
    /* refused outright; the field is the way in */
  }
  if (!read) return openPaste({ onSaved, message: 'The clipboard could not be read here. Paste the text below.' })
  read.then(
    (text) =>
      text.trim()
        ? openPaste({ onSaved, text })
        : openPaste({ onSaved, message: 'The clipboard has no text. Paste the workout below.' }),
    () => openPaste({ onSaved, message: 'The clipboard could not be read. Paste the text below.' })
  )
}

/** Either the parse or the words for why not. */
function attempt(text) {
  try {
    return { parsed: parseMotra(text) }
  } catch (err) {
    if (!(err instanceof MotraError)) throw err
    return { refused: err.message }
  }
}

async function load(parsed) {
  const [settings, stored] = await Promise.all([getSettings(), findWorkout(parsed.workout)])
  return { parsed, stored, mappings: settings.exerciseMuscles }
}

async function openPaste({ onSaved, text = '', message = null }) {
  const first = text ? attempt(text) : {}
  // A clipboard that reads cleanly goes straight to the preview.
  if (first.parsed) return openSheet(previewPanel(await load(first.parsed), onSaved))

  openSheet({
    title: 'Paste workout',
    render: (ctx) => {
      const status = slot()
      const say = (words, iconName) => repaint(status, words ? notice(words, { iconName }) : null)

      const input = h('textarea', {
        class:
          'block min-h-[200px] w-full min-w-0 resize-none bg-transparent text-[16px] font-medium leading-snug',
        rows: '9',
        placeholder: 'My workout:',
        'aria-label': 'Motra workout text',
        autocapitalize: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        oninput: () => {
          readBtn.disabled = !input.value.trim()
        },
      })
      input.value = text

      const readBtn = h(
        'button',
        {
          class: 'btn-primary',
          type: 'button',
          disabled: !text.trim(),
          onclick: async () => {
            const { parsed, refused } = attempt(input.value)
            say(refused, 'alert')
            if (!parsed) return
            readBtn.disabled = true
            try {
              ctx.push(previewPanel(await load(parsed), onSaved))
            } finally {
              readBtn.disabled = false
            }
          },
        },
        'Read workout'
      )
      ctx.setFooter(readBtn)
      say(first.refused ?? message, first.refused ? 'alert' : 'info')

      return h(
        'div',
        { class: 'flex flex-col gap-[10px] pb-[10px]' },
        status,
        h('div', { class: 'panel px-[20px] py-[14px]' }, input),
        h('p', { class: 'text-[12px] text-muted' }, 'In Motra, tap Share, then Copy.')
      )
    },
  })
}

/**
 * What will be stored, before it is. Unknown exercises are asked about one at
 * a time after this, and the answers are written with the workout: leaving at
 * any point before the end writes nothing.
 */
function previewPanel({ parsed, stored, mappings }, onSaved) {
  const { workout } = parsed
  const unknown = unknownExercises(workout.exercises, mappings)
  // Under another id it came in from Motra's export, and is left as it is.
  const imported = !!stored && stored.id !== workout.id
  const same = imported || (!!stored && sameWorkout(stored, workout))

  const finish = async (answers, ctx) => {
    try {
      await saveWorkout(workout, answers)
    } catch (err) {
      toast(err.message || 'The workout was not saved')
      return
    }
    ctx.close()
    toast(`Workout saved for ${dayPhrase(workout.date)}`)
    onSaved?.(workout)
  }

  const ask = (i, answers, ctx) =>
    ctx.push(
      musclePanel({
        name: unknown[i],
        note:
          unknown.length > 1
            ? `New exercise, ${i + 1} of ${unknown.length}. The answer is kept for next time.`
            : 'New exercise. The answer is kept for next time.',
        saveLabel: i + 1 < unknown.length ? 'Next' : 'Save workout',
        onSave: (answer, next) => {
          const all = [...answers, [unknown[i], answer]]
          return i + 1 < unknown.length ? ask(i + 1, all, next) : finish(all, next)
        },
      })
    )

  return {
    title: 'Workout',
    render: (ctx) => {
      let busy = false
      if (!imported && (!same || unknown.length)) {
        ctx.setFooter(
          h(
            'button',
            {
              class: 'btn-primary',
              type: 'button',
              onclick: async () => {
                if (unknown.length) return ask(0, [], ctx)
                if (busy) return
                busy = true
                await finish([], ctx)
                busy = false
              },
            },
            unknown.length ? `Choose muscles for ${pluralize(unknown.length, 'exercise')}` : 'Save workout'
          )
        )
      }
      const mismatch = countMismatch(parsed)
      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        stored
          ? notice(
              imported
                ? 'This workout is already stored, from an earlier import. Nothing to save.'
                : same
                ? 'This workout is already stored, with the same sets.'
                : 'This workout is already stored. Saving replaces it.'
            )
          : null,
        mismatch ? notice(mismatch, { iconName: 'alert' }) : null,
        previewFacts(workout),
        previewExercises(workout, mappings, ctx)
      )
    },
  }
}

/** Title, when, and the totals in the paste. */
function previewFacts(workout) {
  return h(
    'div',
    { class: 'flex flex-col gap-[20px]' },
    workoutHeading(workout),
    workoutFigures(workout)
  )
}

/** What was read. A row opens its sets, so the reps can be checked first. */
function previewExercises(workout, mappings, ctx) {
  return h(
    'section',
    { class: 'flex flex-col gap-[10px]' },
    h('div', { class: 'section-title' }, `${pluralize(workout.exercises.length, 'exercise')}, ${pluralize(setCount(workout), 'set')}`),
    card(
      workout.exercises.map((ex) =>
        exerciseRow(ex, mappings, {
          onclick: () => ctx.push(setsPanel(ex, workout.unit, { editable: false })),
        })
      )
    )
  )
}
