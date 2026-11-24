import { h, repaint } from '../lib/dom.js'
import { openSheet } from '../lib/sheet.js'
import { toast } from '../lib/toast.js'
import { getSettings, importWorkouts, listWorkouts, onChange, previewWorkouts, saveExerciseMuscles } from '../lib/db.js'
import { MAX_FILE, parseXml, readSheet } from '../lib/xlsx.js'
import { MOTRA_SHEET, changeLine, leftOut, parseMotraRows, summaryLine } from '../lib/motraImport.js'
import { unknownExercises } from '../lib/muscles.js'
import { card, emptyRow, listRow, notice } from '../lib/ui.js'
import { pluralize } from '../lib/format.js'
import { musclePanel } from './musclePicker.js'

/**
 * Motra's Excel export: pick, read, preview, then write. Nothing is stored
 * until Import is pressed, and a file that cannot be read whole has no Import.
 */
export function pickWorkouts() {
  const input = h('input', {
    type: 'file',
    accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    class: 'hidden',
    onchange: (e) => {
      const file = e.target.files?.[0]
      input.remove()
      if (file) openImport(file)
    },
  })
  document.body.appendChild(input)
  input.click()
  setTimeout(() => input.remove(), 60000)
}

async function openImport(file) {
  let parsed = null
  let preview = null
  let refused = null
  try {
    if (file.size > MAX_FILE) throw new Error('That Excel file is too large to read.')
    parsed = parseMotraRows(await readSheet(await file.arrayBuffer(), MOTRA_SHEET, parseXml))
    preview = await previewWorkouts(parsed)
  } catch (err) {
    refused = err.message || 'Import failed'
  }

  return openSheet({
    title: 'Import workouts',
    render: (ctx) => {
      if (refused) return h('div', { class: 'pb-[10px]' }, notice(refused, { iconName: 'alert' }))
      let busy = false
      if (preview.rows.length) {
        ctx.setFooter(
          h(
            'button',
            {
              class: 'btn-primary',
              type: 'button',
              onclick: async () => {
                if (busy) return
                busy = true
                try {
                  const { rows } = await importWorkouts(parsed)
                  if (preview.unchosen.length) ctx.push(donePanel(rows.length))
                  else {
                    ctx.close()
                    toast(`${pluralize(rows.length, 'workout')} imported`)
                  }
                } catch (err) {
                  busy = false
                  toast(err.message || 'Import failed')
                }
              },
            },
            `Import ${pluralize(preview.rows.length, 'workout')}`
          )
        )
      }
      const small = (text) => h('p', { class: 'text-[12px] leading-snug text-muted' }, text)
      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        h(
          'div',
          { class: 'panel flex flex-col gap-[4px] p-[20px]' },
          h('p', { class: 'text-[16px] font-semibold leading-snug' }, summaryLine(preview)),
          preview.total ? h('p', { class: 'text-[14px] text-muted' }, changeLine(preview)) : null
        ),
        preview.unchosen.length
          ? notice(
              `${pluralize(preview.unchosen.length, 'exercise')} ${preview.unchosen.length === 1 ? 'has' : 'have'} no muscles chosen: ${preview.unchosen.join(', ')}. Their sets are stored and stay off the body map until muscles are chosen.`
            )
          : null,
        h('div', { class: 'flex flex-col gap-[4px]' }, leftOut(preview).map(small))
      )
    },
  })
}

/** Said once, after the write, with the list to work through now or later. */
function donePanel(count) {
  return {
    title: 'Imported',
    render: (ctx) => {
      ctx.setFooter(h('button', { class: 'btn-primary', type: 'button', onclick: () => ctx.close() }, 'Done'))
      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        notice(`${pluralize(count, 'workout')} imported.`, { iconName: 'check' }),
        unchosenList(ctx),
        h('p', { class: 'text-[12px] leading-snug text-muted' }, 'The same list is at the foot of the Training page.')
      )
    },
  }
}

/** Every stored exercise with no muscles. A row opens the picker for it. */
function unchosenList(ctx) {
  const body = h('div', { class: 'flex flex-col gap-[10px]' })
  const paint = async () => {
    const [workouts, { exerciseMuscles }] = await Promise.all([listWorkouts(), getSettings()])
    const names = unknownExercises(workouts.flatMap((w) => w.exercises), exerciseMuscles)
    repaint(
      body,
      h('div', { class: 'section-title' }, names.length ? `No muscles chosen, ${names.length}` : 'No muscles chosen'),
      card(
        names.length
          ? names.map((name) =>
              listRow({
                title: name,
                chevron: true,
                onclick: () =>
                  ctx.push(
                    musclePanel({
                      name,
                      note: 'Applies to every workout with this exercise.',
                      onSave: async (answer, panel) => {
                        await saveExerciseMuscles(name, answer)
                        panel.pop()
                      },
                    })
                  ),
              })
            )
          : emptyRow('Every exercise has an answer')
      )
    )
  }
  paint()
  ctx.onDispose(onChange((scope) => ['settings', 'workouts', 'all'].includes(scope) && paint()))
  return body
}

export function openUnchosen() {
  return openSheet({
    title: 'Choose muscles',
    render: (ctx) => h('div', { class: 'pb-[10px]' }, unchosenList(ctx)),
  })
}
