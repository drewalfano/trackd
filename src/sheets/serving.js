import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { openSheet, presentSheet } from '../lib/sheet.js'
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
import { logFood, defaultServing, DESCRIBE_SOURCE } from '../lib/logging.js'
import {
  blockSelector,
  macroLine,
  macroUnit,
  segmentedWide,
  numberInput,
  labelledField,
} from '../lib/ui.js'
import { unitLabel, servingLabel, round, displayName } from '../lib/format.js'
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

      const kcalEl = h('span', { class: 'text-title font-semibold leading-none' })
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

      /**
       * In the header, beside the close — not in the body.
       *
       * It used to sit on the row under the title, to the right of the food's
       * name, and the two problems there were the same problem. It carried
       * `bg-canvas`, which is what an `.icon-btn` wears when it sits ON a card
       * where the page tint reads as a well cut into white — but this sheet
       * already IS the canvas, so the button was #f0f0f0 on #f0f0f0. Measured,
       * not guessed: 1:1, no edge at all. A star with no visible control around
       * it, hanging beside a line of body text, is not obviously a button.
       *
       * Both go away in the header. It takes the plain surface fill every other
       * `.icon-btn` has, and it sits in the frame with the close rather than in
       * the payload — which is what it is. The two match exactly: same class,
       * same `size: 20, stroke: 2`.
       *
       * `stroke: 2` rather than the 1.75 default because the star is ten
       * vertices with concave curves where most icons here are two or three
       * strokes, so it loses more weight than they do at the same number. The
       * `+` on a food tile takes 2.25 for the same reason.
       */
      const favBtn = h('button', {
        class: 'icon-btn',
        'aria-label': 'Pin to favourites',
        onclick: async () => {
          const now = await toggleFavourite('food', food.id)
          favBtn.replaceChildren(icon('star', { size: 20, stroke: 2, filled: now }))
          toast(now ? 'Pinned to Favourites' : 'Unpinned')
        },
      })
      isFavourite('food', food.id).then((on) =>
        favBtn.replaceChildren(icon('star', { size: 20, stroke: 2, filled: on }))
      )
      ctx.setAction(favBtn)

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
          { class: 'min-w-0' },
          h('div', { class: 'text-[16px] font-semibold leading-tight' }, displayName(food.name)),
          food.brand ? h('div', { class: 'text-[12px] text-muted' }, displayName(food.brand)) : null
        ),

        h(
          'div',
          { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' },
          h(
            'div',
            { class: 'flex items-baseline gap-[10px]' },
            kcalEl,
            macroUnit('kcal', 'text-[12px] font-medium')
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
 *
 * **The option belongs to the surface, not the route.** Which is a rule the
 * code stated and then broke: a recent carried `onStage` and a scanned barcode
 * did not, so the same food on the same sheet offered a plate or withheld it
 * depending on how you had arrived at it. Scan and Custom now hand it down the
 * same way, and the passing test is the one the rule already implies — if the
 * plate bar is on screen behind this panel, the plate button is in its footer.
 *
 * The `food` handed back alongside the item is what makes that pass-through
 * possible: the add sheet knows it has a plate, but on the scan and Custom
 * routes it does not yet know WHICH food is going onto it, because the food is
 * created or adopted several panels deeper. So the item comes back with the
 * record it was built from rather than the caller having to have held one.
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
        toast(`Logged ${displayName(food.name)}`)
      },
      onStage:
        onStage &&
        (({ quantity, unit }) => onStage({ foodId: food.id, quantity, unit }, food)),
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
      toast(`Logged ${displayName(food.name)}`)
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
 *
 * **A described estimate is a THIRD reason, and it used to be told the second
 * one.** It has no `foodId` either, so it fell through to the quick-add copy and
 * the sheet claimed both that it was a quick add and that you typed the numbers.
 * Neither is true: it came from a sentence, and the numbers are a model's
 * estimate that you reviewed on the plate. That copy was also the one place in
 * the app still contradicting the sparkle sitting on the very same entry.
 *
 * `host` is the sheet this was opened from, when there is one. From the log it
 * pushes a panel rather than replacing the sheet the row is in; from Today,
 * where there is no sheet to be inside, it opens one as it always did.
 */
export async function openEditEntry(entry, host) {
  const [food, settings] = await Promise.all([
    entry.foodId ? getFood(entry.foodId) : null,
    getSettings(),
  ])
  const isEstimate = entry.source === DESCRIBE_SOURCE
  // Checked after the estimate, because an estimate satisfies the `!entry.foodId`
  // half of this too and the more specific reason is the true one.
  const isQuickAdd = !isEstimate && (entry.source === QUICK_ADD_SOURCE || !entry.foodId)

  if (!food) {
    return presentSheet({
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
          h('div', { class: 'text-[16px] font-semibold' }, displayName(entry.foodName) || 'Deleted food'),
          /**
           * The padding is on the CHILDREN, not on the card. Every other card in
           * the app is built that way and this one was not, which cost it both of
           * the spacings it got wrong.
           *
           * `.card` rules a divider above every child after the first, inset 20
           * from the card's own edge. Put 20 of padding on the card as well and
           * that inset lands on top of it — the rule drew at 40 while the text it
           * was separating sat at 20, so it read as a short line floating inside
           * the block rather than as the edge between two halves of it.
           *
           * The second fault came from the same place. A gap across a divider is
           * split between the two things it separates, 10 and 10; with the card
           * holding the padding there was nothing under the rule to carry the
           * second 10, and a lone `mt-[10px]` on the macro line put all of it
           * ABOVE the divider. 10 over, nothing under, and the numbers sat on the
           * line.
           */
          h(
            'div',
            { class: 'card' },
            h(
              'div',
              { class: 'px-[20px] pb-[10px] pt-[20px] text-[12px] leading-snug text-muted' },
              /**
               * Three reasons there is no amount here, and each says its own.
               *
               * They share a first clause because the consequence really is the
               * same — nothing to recalculate against — and differ in the second,
               * which is the only part that tells you anything you did not
               * already know from the absent controls.
               *
               * The estimate's second sentence names where the numbers came from
               * rather than which model produced them. `Estimated` on the plate
               * and `Estimated by AI` on the row both say it that way, and an
               * entry read back in two months should not be the one place in the
               * app carrying a vendor name that may have changed since.
               */
              isEstimate
                ? 'An estimate has no food behind it, so there is no amount to change. ' +
                    'These are the numbers estimated from your description and accepted ' +
                    'on the plate.'
                : isQuickAdd
                  ? 'A quick add has no food behind it, so there is no amount to change. ' +
                      'These are the numbers you entered.'
                  : 'This food was deleted from your library, so the amount can no longer be ' +
                      'recalculated. The numbers below are the ones recorded when you logged it.'
            ),
            h(
              'div',
              { class: 'px-[20px] pb-[20px] pt-[10px]' },
              macroLine(entry.computed, { size: 14 })
            )
          ),
          h('div', { class: 'flex flex-col gap-[10px]' }, h('div', { class: 'section-label' }, 'Block'), blockRow)
        )
      },
    }, host)
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
  return presentSheet({
    title: panel.title,
    render: (ctx) => {
      close = () => ctx.close()
      return panel.render(ctx)
    },
  }, host)
}
