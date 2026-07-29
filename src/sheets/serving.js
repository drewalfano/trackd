import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { openSheet } from '../lib/sheet.js'
import { toast, confirm } from '../lib/toast.js'
import {
  getFood,
  getSettings,
  putEntry,
  deleteEntry,
  isFavourite,
  toggleFavourite,
} from '../lib/db.js'
import { computeMacros } from '../lib/compute.js'
import { logFood, defaultServing } from '../lib/logging.js'
import { blockSelector, macroLine, segmentedWide, numberInput, labelledField } from '../lib/ui.js'
import { unitLabel, servingLabel, round } from '../lib/format.js'
import { blockForTime, formatDayLabel, addDays, todayStr } from '../lib/dates.js'

/**
 * The serving sheet, shared by scan, search, custom, recents and favourites.
 *
 * This is the moment the app feels good or doesn't: the preview recalculates on
 * every keystroke, synchronously, off numbers already in memory. There is no
 * fetch and no await anywhere in the input path.
 */

function unitOptions(food) {
  // Bare unit names only. Spelling the serving out here — "serving (1 scoop
  // (30 g))" — nests parentheses and wraps; it belongs in the hint line under
  // the amount field instead.
  const options = [{ value: 'serving', label: 'servings' }]
  // A one-item serving has nothing to toggle between.
  if (!(food.servingUnit === 'item' && Number(food.servingSize) === 1)) {
    options.push({ value: food.servingUnit, label: unitLabel(food.servingUnit, 2) })
  }
  return options
}

export function servingPanel({ food, initial = {}, mode = 'add', settings, onSubmit, onDelete }) {
  return {
    title: mode === 'edit' ? 'Edit entry' : 'Add',
    render: (ctx) => {
      const options = unitOptions(food)
      let quantity = String(initial.quantity ?? defaultServing(food).quantity)
      let unit = initial.unit ?? defaultServing(food).unit
      if (!options.some((o) => o.value === unit)) unit = options[0].value
      let block =
        initial.block ?? blockForTime(new Date(), settings.blockThresholds)
      let date = initial.date ?? todayStr()

      const kcalEl = h('span', { class: 'text-[34px] font-bold leading-none' })
      const macrosEl = h('div')

      const repaintPreview = () => {
        const m = computeMacros(food, Number(quantity) || 0, unit)
        kcalEl.textContent = String(Math.round(m.kcal))
        // Calories are already the display number above, so omit them here.
        macrosEl.replaceChildren(macroLine(m, { size: 14, omit: ['kcal'] }))
        submitBtn.disabled = !(Number(quantity) > 0)
      }

      const submitBtn = h(
        'button',
        {
          class: 'btn-primary',
          onclick: async () => {
            submitBtn.disabled = true
            await onSubmit({ quantity: Number(quantity), unit, block, date })
          },
        },
        mode === 'edit' ? 'Save' : 'Add'
      )

      const unitRow = h('div')
      const paintUnits = () => {
        unitRow.replaceChildren(
          segmentedWide({
            options,
            value: unit,
            onChange: (v) => {
              // Keep the amount meaningful when switching: 1 serving ⇄ 30 g.
              const n = Number(quantity) || 0
              if (v === 'serving' && unit !== 'serving') {
                quantity = String(round(n / (Number(food.servingSize) || 1), 2))
              } else if (v !== 'serving' && unit === 'serving') {
                quantity = String(round(n * (Number(food.servingSize) || 1), 2))
              }
              unit = v
              qtyInput.input.value = quantity
              paintUnits()
              repaintPreview()
            },
          })
        )
      }

      const qtyInput = numberInput({
        value: quantity,
        onInput: (v) => {
          quantity = v
          repaintPreview()
        },
        placeholder: '1',
        autofocus: mode === 'add',
      })

      const blockRow = h('div')
      const paintBlocks = () => {
        blockRow.replaceChildren(
          blockSelector({
            value: block,
            onChange: (v) => {
              block = v
              paintBlocks()
            },
            blockNames: settings.blockNames,
          })
        )
      }

      // Only the edit path exposes the date. Spec 9: a meal eaten at 1 AM
      // belongs to the day the user says it does.
      const dateRow = h('div')
      const paintDate = () => {
        const opts = [
          { value: addDays(date, -1), label: formatDayLabel(addDays(date, -1)) },
          { value: date, label: formatDayLabel(date) },
          { value: addDays(date, 1), label: formatDayLabel(addDays(date, 1)) },
        ]
        dateRow.replaceChildren(
          segmentedWide({
            options: opts,
            value: date,
            onChange: (v) => {
              date = v
              paintDate()
            },
          })
        )
      }

      const favBtn = h('button', {
        class: 'icon-btn bg-canvas',
        'aria-label': 'Pin to favourites',
        onclick: async () => {
          const now = await toggleFavourite('food', food.id)
          favBtn.replaceChildren(icon('star', { size: 18, filled: now }))
          toast(now ? 'Pinned to Favourites' : 'Unpinned')
        },
      })
      isFavourite('food', food.id).then((on) =>
        favBtn.replaceChildren(icon('star', { size: 18, filled: on }))
      )

      paintUnits()
      paintBlocks()
      paintDate()
      repaintPreview()

      ctx.setFooter(
        h(
          'div',
          { class: 'flex flex-col gap-2' },
          submitBtn,
          onDelete &&
            h(
              'button',
              {
                class: 'btn-secondary',
                onclick: async () => {
                  const ok = await confirm({
                    title: 'Remove this entry?',
                    message: 'It comes off this day’s totals. You can undo straight after.',
                    confirmLabel: 'Remove',
                  })
                  if (ok) {
                    await onDelete()
                    ctx.close()
                  }
                },
              },
              'Remove from log'
            )
        )
      )

      return h(
        'div',
        { class: 'flex flex-col gap-5 pb-2' },
        h(
          'div',
          { class: 'flex items-start gap-3' },
          h(
            'div',
            { class: 'min-w-0 flex-1' },
            h('div', { class: 'text-[17px] font-bold leading-tight' }, food.name),
            food.brand ? h('div', { class: 'text-[13px] text-muted' }, food.brand) : null
          ),
          favBtn
        ),

        h(
          'div',
          { class: 'card flex flex-col gap-2 px-4 py-4' },
          h(
            'div',
            { class: 'flex items-baseline gap-1.5' },
            kcalEl,
            h('span', { class: 'text-[14px] font-medium text-muted' }, 'cal')
          ),
          macrosEl
        ),

        labelledField({
          label: 'Amount',
          children: qtyInput,
          hint: `1 serving = ${servingLabel(food)}`,
        }),
        unitRow,

        h(
          'div',
          { class: 'flex flex-col gap-2' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        ),

        mode === 'edit'
          ? h(
              'div',
              { class: 'flex flex-col gap-2' },
              h('div', { class: 'section-label' }, 'Day'),
              dateRow
            )
          : null
      )
    },
  }
}

/** Push the serving sheet onto an existing sheet (the add-food flow). */
export async function pushServing(ctx, { food, date, block }) {
  const settings = await getSettings()
  ctx.push(
    servingPanel({
      food,
      settings,
      initial: { ...defaultServing(food), date, block },
      onSubmit: async ({ quantity, unit, block: b, date: d }) => {
        await logFood({ food, quantity, unit, date: d, block: b })
        ctx.close()
        toast(`Added ${food.name}`)
      },
    })
  )
}

/** Open the serving sheet standalone, e.g. from the food library. */
export async function openServingSheet({ food, date, block }) {
  const settings = await getSettings()
  const panel = servingPanel({
    food,
    settings,
    initial: { ...defaultServing(food), date, block },
    onSubmit: async ({ quantity, unit, block: b, date: d }) => {
      await logFood({ food, quantity, unit, date: d, block: b })
      closeCurrent()
      toast(`Added ${food.name}`)
    },
  })
  let closeCurrent = () => {}
  const promise = openSheet({
    title: panel.title,
    render: (ctx) => {
      closeCurrent = () => ctx.close()
      return panel.render(ctx)
    },
  })
  return promise
}

/**
 * Edit an existing entry. If the underlying food has been deleted the entry is
 * still valid — `computed` was snapshotted — so we offer what can still be
 * changed rather than a dead end.
 */
export async function openEditEntry(entry) {
  const [food, settings] = await Promise.all([getFood(entry.foodId), getSettings()])

  if (!food) {
    return openSheet({
      title: 'Edit entry',
      render: (ctx) => {
        let block = entry.block
        let date = entry.date
        const blockRow = h('div')
        const paint = () => {
          blockRow.replaceChildren(
            blockSelector({
              value: block,
              onChange: (v) => {
                block = v
                paint()
              },
              blockNames: settings.blockNames,
            })
          )
        }
        paint()

        ctx.setFooter(
          h(
            'div',
            { class: 'flex flex-col gap-2' },
            h(
              'button',
              {
                class: 'btn-primary',
                onclick: async () => {
                  await putEntry({ ...entry, block, date })
                  ctx.close()
                },
              },
              'Save'
            ),
            h(
              'button',
              {
                class: 'btn-secondary',
                onclick: async () => {
                  await deleteEntry(entry.id)
                  ctx.close()
                  toast('Removed', { action: 'Undo', onAction: () => putEntry(entry) })
                },
              },
              'Remove from log'
            )
          )
        )

        return h(
          'div',
          { class: 'flex flex-col gap-5 pb-2' },
          h('div', { class: 'text-[17px] font-bold' }, entry.foodName || 'Deleted food'),
          h(
            'div',
            { class: 'card px-4 py-4' },
            h('div', { class: 'text-[13px] leading-snug text-muted' },
              'This food was deleted from your library, so the amount can no longer be recalculated. The numbers below are the ones recorded when you logged it.'),
            h('div', { class: 'mt-3' }, macroLine(entry.computed, { size: 14 }))
          ),
          h('div', { class: 'flex flex-col gap-2' }, h('div', { class: 'section-label' }, 'Block'), blockRow)
        )
      },
    })
  }

  const panel = servingPanel({
    food,
    settings,
    mode: 'edit',
    initial: {
      quantity: entry.quantity,
      unit: entry.unit,
      block: entry.block,
      date: entry.date,
    },
    onSubmit: async ({ quantity, unit, block, date }) => {
      const macros = computeMacros(food, quantity, unit)
      await putEntry({
        ...entry,
        quantity,
        unit,
        block,
        date,
        computed: {
          kcal: round(macros.kcal, 1),
          protein: round(macros.protein, 1),
          fat: round(macros.fat, 1),
          carbs: round(macros.carbs, 1),
        },
      })
      close()
    },
    onDelete: async () => {
      await deleteEntry(entry.id)
      toast('Removed', { action: 'Undo', onAction: () => putEntry(entry) })
    },
  })

  let close = () => {}
  return openSheet({
    title: panel.title,
    render: (ctx) => {
      close = () => ctx.close()
      return panel.render(ctx)
    },
  })
}
