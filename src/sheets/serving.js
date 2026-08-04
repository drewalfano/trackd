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
import { QUICK_ADD_SOURCE } from './quickAdd.js'

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

/**
 * `onStage` is the plate's way in, and it is here because the `+` that used to
 * carry it on every tile and row now logs.
 *
 * That swap is the whole point of the rearrangement: `+` means the same thing
 * everywhere in the app — commit this, now, at the amount shown — and the
 * larger target always opens this panel first. Staging had to go somewhere, and
 * this is the honest place for it: you are building a meal out of specific
 * amounts, and this is the screen where an amount exists. The old `+` staged a
 * default serving and left you to fix it on the plate afterwards.
 *
 * It costs a tap per item against the old one-tap staging. A plate is a
 * deliberate, multi-item activity, so the tap buys a decision that was
 * previously deferred, on a path nobody walks by accident.
 *
 * Absent on `edit`, where there is nothing to stage — the entry is already in
 * the log.
 */
export function servingPanel({
  food,
  initial = {},
  mode = 'add',
  settings,
  onSubmit,
  onStage,
  onDelete,
}) {
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

      const kcalEl = h('span', { class: 'text-[30px] font-semibold leading-none' })
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
        /**
         * "Log it", not "Add", and the reason is the button underneath.
         *
         * Alone, "Add" was fine — the sheet is titled Add and there was nowhere
         * else for a food to go. Once staging moved in here, the pair read as
         * one action and a more specific version of it: "Add" never named its
         * destination, so "Add to plate" looked like the same button with
         * detail attached rather than a different place to send the food.
         *
         * Four footers were built and looked at rather than argued about. Two
         * of them kept the verb and named both destinations — "Add to log" over
         * "Add to plate" — which is the tidier pair on paper and still two
         * near-identical pills at a glance. Different verbs is what actually
         * separates them at the speed anyone reads a footer.
         *
         * `Save` still wins on edit: nothing is being logged there, the entry
         * already exists, and staging is absent on that path anyway.
         */
        mode === 'edit' ? 'Save' : 'Log it'
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

      /**
       * The day is on screen when it matters and out of the way when it does
       * not.
       *
       * Editing always shows it — spec 9, a meal eaten at 1 AM belongs to the
       * day the user says it does. Adding shows it only when the target is not
       * today, which is the case that used to be silent: "Log this" from the
       * food library passes `state.date`, and because History moves that shared
       * date, it can be a day you were only looking at. You would find out when
       * Today did not change.
       */
      const showDate = mode === 'edit' || date !== todayStr()
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

      const stageBtn =
        onStage &&
        mode !== 'edit' &&
        h(
          'button',
          {
            class: 'btn-secondary',
            /**
             * Pops back to the list rather than closing or staying put.
             *
             * A plate is built one food at a time, so staging is almost never
             * the last thing you do — the next action is finding the next item,
             * which is on the panel underneath. Closing the sheet outright
             * would throw away the search or the rail position you were using
             * to find things; staying here leaves you on a dead panel with a
             * spent button, holding an amount for a food already on the plate.
             *
             * The `+` this replaced kept you on the list for exactly this
             * reason. That property was worth carrying over even though the
             * control moved.
             */
            onclick: async () => {
              stageBtn.disabled = true
              await onStage({ quantity: Number(quantity), unit, block, date })
              ctx.pop()
            },
          },
          'Add to plate'
        )

      ctx.setFooter(
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          submitBtn,
          // Under the primary, not beside it. Side by side they read as two
          // equal choices and the panel stops having an obvious way out;
          // logging is what this sheet is for, and staging is the variant.
          stageBtn || null,
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
        { class: 'flex flex-col gap-[20px]' },
        h(
          'div',
          { class: 'flex items-start gap-[10px]' },
          h(
            'div',
            { class: 'min-w-0 flex-1' },
            h('div', { class: 'text-[16px] font-semibold leading-tight' }, food.name),
            food.brand ? h('div', { class: 'text-[12px] text-muted' }, food.brand) : null
          ),
          favBtn
        ),

        h(
          'div',
          { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' },
          h(
            'div',
            { class: 'flex items-baseline gap-[10px]' },
            kcalEl,
            h('span', { class: 'text-[12px] font-medium text-muted' }, 'cal')
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
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        ),

        showDate
          ? h(
              'div',
              { class: 'flex flex-col gap-[10px]' },
              h('div', { class: 'section-label' }, 'Day'),
              dateRow
            )
          : null
      )
    },
  }
}

/**
 * Push the serving sheet onto an existing sheet (the add-food flow).
 *
 * `onStage` is optional and comes from the add sheet, which is the only caller
 * that has a plate to stage onto. Left off, the panel simply has no plate
 * button — the food library and Today's rail both open this without one,
 * because a plate assembled from a screen that cannot show you the plate is a
 * buffer you have no way of seeing.
 */
export async function pushServing(ctx, { food, date, block, onStage }) {
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
      onStage:
        onStage &&
        (({ quantity, unit }) => onStage({ foodId: food.id, quantity, unit })),
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
 *
 * A quick add lands in the same branch, because it never had a food to begin
 * with. Same controls, different reason, so it must not be told its food was
 * deleted — nothing was.
 */
export async function openEditEntry(entry) {
  const [food, settings] = await Promise.all([
    entry.foodId ? getFood(entry.foodId) : null,
    getSettings(),
  ])
  const isQuickAdd = entry.source === QUICK_ADD_SOURCE || !entry.foodId

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
            { class: 'flex flex-col gap-[10px]' },
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
          { class: 'flex flex-col gap-[20px]' },
          h('div', { class: 'text-[16px] font-semibold' }, entry.foodName || 'Deleted food'),
          h(
            'div',
            { class: 'card px-[20px] py-[20px]' },
            h(
              'div',
              { class: 'text-[12px] leading-snug text-muted' },
              isQuickAdd
                ? 'A quick add has no food behind it, so there is no amount to change. ' +
                    'These are the numbers you entered.'
                : 'This food was deleted from your library, so the amount can no longer be ' +
                    'recalculated. The numbers below are the ones recorded when you logged it.'
            ),
            h('div', { class: 'mt-[10px]' }, macroLine(entry.computed, { size: 14 }))
          ),
          h('div', { class: 'flex flex-col gap-[10px]' }, h('div', { class: 'section-label' }, 'Block'), blockRow)
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
