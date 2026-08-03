import { h } from '../lib/dom.js'
import { getFood, getSettings } from '../lib/db.js'
import { computeMacros, emptyTotals, addTotals } from '../lib/compute.js'
import { blockSelector, card, macroLine, notice } from '../lib/ui.js'
import { qty, servingLabel, unitLabel, pluralize } from '../lib/format.js'
import { formatDayLabel, todayStr } from '../lib/dates.js'

/**
 * A saved meal, opened rather than logged.
 *
 * This is the counterpart to the serving sheet. Tapping a pinned meal logs it
 * outright, which is correct — that is the whole point of pinning one. But the
 * control beside it means "let me look first" everywhere else in the app, and
 * on a meal it used to call `logMeal` too: the same irreversible write, from
 * the button that looks like the careful one.
 *
 * So this is what "look first" now opens. It shows what is in the meal, what it
 * adds up to, and which block it is going into — then logs the lot.
 */

/** Resolve a meal's items against the library, keeping the ones that are gone. */
async function resolveItems(meal) {
  const rows = []
  for (const item of meal.items) {
    const food = await getFood(item.foodId)
    rows.push({
      item,
      food,
      macros: food ? computeMacros(food, item.quantity, item.unit) : null,
    })
  }
  return rows
}

const amountLabel = (food, { quantity, unit }) =>
  unit === 'serving'
    ? `${qty(quantity)} × ${servingLabel(food)}`
    : `${qty(quantity)} ${unitLabel(unit, quantity)}`

export function mealPanel({ meal, rows, settings, date, block: initialBlock, onLogged }) {
  return {
    title: meal.name,
    render: (ctx) => {
      let block = initialBlock

      const available = rows.filter((r) => r.food)
      const missing = rows.length - available.length
      const totals = available.reduce((acc, r) => addTotals(acc, r.macros), emptyTotals())

      const logBtn = h(
        'button',
        {
          class: 'btn-primary',
          disabled: !available.length,
          onclick: async () => {
            logBtn.disabled = true
            await onLogged({ block })
          },
        },
        available.length
          ? `Log ${pluralize(available.length, 'item')}`
          : 'Nothing left to log'
      )

      const blockRow = h('div')
      const paintBlock = () => {
        blockRow.replaceChildren(
          blockSelector({
            value: block,
            onChange: (v) => {
              block = v
              paintBlock()
            },
            blockNames: settings.blockNames,
          })
        )
      }
      paintBlock()

      ctx.setFooter(logBtn)

      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },

        // Same shape as the serving sheet's preview: the total first, at
        // display weight, then the breakdown.
        h(
          'div',
          { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' },
          h(
            'div',
            { class: 'flex items-baseline gap-[10px]' },
            h('span', { class: 'text-[30px] font-semibold leading-none' }, String(Math.round(totals.kcal))),
            h('span', { class: 'text-[12px] font-medium text-muted' }, 'cal')
          ),
          macroLine(totals, { size: 14, omit: ['kcal'] })
        ),

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, pluralize(rows.length, 'item')),
          card(
            rows.map(({ item, food, macros }) =>
              h(
                'div',
                { class: 'row' },
                h(
                  'div',
                  { class: 'min-w-0 flex-1' },
                  h(
                    'div',
                    {
                      class:
                        'truncate text-[14px] font-semibold leading-tight' +
                        (food ? '' : ' text-muted line-through'),
                    },
                    food?.name || 'Deleted food'
                  ),
                  h(
                    'div',
                    { class: 'mt-[2px] truncate text-[12px] text-muted' },
                    food ? amountLabel(food, item) : 'No longer in your library'
                  )
                ),
                macros
                  ? h(
                      'span',
                      { class: 'tnum shrink-0 text-[14px] font-semibold' },
                      String(Math.round(macros.kcal)),
                      h('span', { class: 'ml-[4px] text-[12px] font-normal text-muted' }, 'cal')
                    )
                  : null
              )
            )
          )
        ),

        // Said once, here, rather than as a surprise in the toast afterwards.
        missing
          ? notice(
              `${pluralize(missing, 'food')} in this meal ${missing === 1 ? 'has' : 'have'} been ` +
                'deleted from your library and will be skipped. The rest logs normally.',
              { iconName: 'alert' }
            )
          : null,

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        ),

        // Same rule as the serving sheet: state the day only when it is not
        // today, so logging a meal onto a day you were browsing is not silent.
        date !== todayStr()
          ? notice(`This goes onto ${formatDayLabel(date)}, not today.`)
          : null
      )
    },
  }
}

/** Push the meal panel onto the add sheet's stack. */
export async function pushMeal(ctx, { meal, date, block, onLogged }) {
  const [settings, rows] = await Promise.all([getSettings(), resolveItems(meal)])
  ctx.push(
    mealPanel({
      meal,
      rows,
      settings,
      date,
      block,
      onLogged,
    })
  )
}
