import { h, repaint } from '../lib/dom.js'
import { openSheet } from '../lib/sheet.js'
import { toast, confirm } from '../lib/toast.js'
import { getWeight, putWeight, deleteWeight, getSettings } from '../lib/db.js'
import { dateInput, numberInput, labelledField, notice, slot } from '../lib/ui.js'
import { kgToUnit, unitToKg } from '../lib/format.js'
import { dayPhrase, formatDayLabel, todayStr } from '../lib/dates.js'

/**
 * A weigh-in for a day that is not today.
 *
 * The Weight tab's own field is deliberately today-only — weighing yourself is
 * a morning habit and the field should be one tap from the tab, not a form. But
 * that left no way to enter a morning you missed, and no way to correct or
 * remove any reading except today's. The trend refuses to draw under seven
 * readings, so on a screen whose whole job is a smoothed line, a hole you
 * cannot fill costs more than it looks.
 *
 * This is the back door: pick a day, see what is already there, save or remove.
 * One record per day still — `putWeight` overwrites rather than appending, so
 * saving onto an existing day is an edit, and the sheet says so.
 */
export async function openWeighInSheet({ date = todayStr() } = {}) {
  const settings = await getSettings()
  const unit = settings.weightUnit

  return openSheet({
    title: 'Weigh-in',
    render: (ctx) => {
      let day = date
      let draft = ''
      let existing = null

      const amount = numberInput({
        value: '',
        suffix: unit,
        placeholder: '0.0',
        step: '0.1',
        onInput: (v) => {
          draft = v
          syncFooter()
        },
      })

      const status = slot()

      const saveBtn = h(
        'button',
        {
          class: 'btn-primary',
          onclick: async () => {
            const value = Number(draft)
            if (!(value > 0)) return
            saveBtn.disabled = true
            await putWeight(day, unitToKg(value, unit))
            ctx.close()
            toast(`${existing ? 'Updated' : 'Saved'} ${dayPhrase(day)}`)
          },
        },
        'Save'
      )

      const removeBtn = h(
        'button',
        {
          class: 'btn-secondary',
          onclick: async () => {
            const ok = await confirm({
              title: `Remove ${dayPhrase(day)}’s weight?`,
              message: 'The trend recalculates without it.',
              confirmLabel: 'Remove',
            })
            if (!ok) return
            await deleteWeight(day)
            ctx.close()
            toast('Weigh-in removed')
          },
        },
        'Remove this weigh-in'
      )

      function syncFooter() {
        saveBtn.disabled = !(Number(draft) > 0)
        saveBtn.textContent = existing ? 'Update' : 'Save'
        ctx.setFooter(
          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            saveBtn,
            ...(existing ? [removeBtn] : [])
          )
        )
      }

      /** Re-read the picked day so the field always shows what is stored. */
      async function loadDay() {
        existing = await getWeight(day)
        draft = existing ? String(kgToUnit(existing.kg, unit).toFixed(1)) : ''
        amount.input.value = draft
        repaint(
          status,
          existing
            ? notice(
                `${formatDayLabel(day)} already has ${kgToUnit(existing.kg, unit).toFixed(1)} ${unit}. ` +
                  'Saving replaces it — there is only ever one reading a day.'
              )
            : null
        )
        syncFooter()
      }

      loadDay()

      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },
        labelledField({
          label: 'Day',
          // No future weigh-ins. You cannot have stood on the scales tomorrow.
          children: dateInput({
            value: day,
            max: todayStr(),
            onChange: (v) => {
              if (!v) return
              day = v
              loadDay()
            },
          }),
        }),
        labelledField({ label: 'Weight', children: amount }),
        status
      )
    },
  })
}
