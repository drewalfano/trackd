import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { openSheet } from '../lib/sheet.js'
import { toast } from '../lib/toast.js'
import { getSettings, recentFoods, getFood, getMeal, deleteEntry } from '../lib/db.js'
import { computeMacros, emptyTotals, addTotals } from '../lib/compute.js'
import { quickLogFood, logMeal, defaultServing } from '../lib/logging.js'
import { macroLine, card, emptyRow } from '../lib/ui.js'
import { servingLabel, qty, unitLabel, pluralize } from '../lib/format.js'
import { blockForTime } from '../lib/dates.js'
import { state } from '../state.js'
import { pushServing } from './serving.js'
import { pushSearch } from './search.js'
import { pushCustom } from './custom.js'
import { pushScan } from './scan.js'

/**
 * The add sheet.
 *
 * Section 3 of the brief is the whole argument for this screen: the app is a
 * recall interface, not a database interface. Favourites and Recents are the
 * front door and sit above the fold; Scan, Search and Custom are the fallback
 * for the handful of genuinely new foods.
 */

/** Row that logs on tap, with a second target to adjust the serving first. */
function pickRow({ title, subtitle, totals, onLog, onOpen }) {
  return h(
    'div',
    { class: 'flex items-center' },
    h(
      'button',
      { class: 'row min-w-0 flex-1', onclick: onLog },
      h(
        'div',
        { class: 'min-w-0 flex-1' },
        h('div', { class: 'truncate text-[17px] font-semibold leading-tight' }, title),
        h('div', { class: 'mt-[2px] truncate text-[14px] text-muted' }, subtitle),
        totals ? h('div', { class: 'mt-[4px]' }, macroLine(totals, { size: 15 })) : null
      )
    ),
    h(
      'button',
      {
        class: 'icon-btn icon-btn-sm mr-[20px] bg-canvas',
        'aria-label': `Adjust ${title}`,
        onclick: onOpen,
      },
      icon('pencil', { size: 17 })
    )
  )
}

/**
 * Route picker, not a tab set. Scan is the default and renders solid; the other
 * two sit on surface with an outline like every other unselected control.
 */
function actionButton({ iconName, label, selected, onclick }) {
  return h(
    'button',
    {
      class:
        'flex flex-1 flex-col items-center justify-center gap-[10px] rounded-[24px] py-[20px] ' +
        (selected
          ? 'border border-ink bg-ink text-canvas'
          : 'border border-outline bg-surface text-ink'),
      onclick,
    },
    icon(iconName, { size: 26 }),
    h('span', { class: 'text-[15px] font-bold' }, label)
  )
}

export async function openAddFood({ date = state.date, block } = {}) {
  const settings = await getSettings()
  const targetBlock = block ?? blockForTime(new Date(), settings.blockThresholds)

  return openSheet({
    title: 'Add Food',
    render: (ctx) => {
      const favouritesCard = h('div')
      const recentsCard = h('div')

      const logAndClose = async (fn, label) => {
        const entries = await fn()
        ctx.close()
        const list = Array.isArray(entries) ? entries : [entries]
        toast(`Added ${label}`, {
          action: 'Undo',
          onAction: () => Promise.all(list.map((e) => deleteEntry(e.id))),
        })
      }

      /* ------------------------------------------------ favourites + recents */

      async function paintLists() {
        const current = await getSettings()

        // Favourites are ordered by hand and never re-sort themselves. The
        // fixed position is what makes the tap muscle memory.
        const favNodes = []
        for (const fav of current.favourites) {
          if (fav.type === 'food') {
            const food = await getFood(fav.id)
            if (!food) continue
            const { quantity, unit } = defaultServing(food)
            favNodes.push(
              pickRow({
                title: food.name,
                subtitle:
                  unit === 'serving'
                    ? `${qty(quantity)} × ${servingLabel(food)}`
                    : `${qty(quantity)} ${unitLabel(unit, quantity)}`,
                totals: computeMacros(food, quantity, unit),
                onLog: () =>
                  logAndClose(() => quickLogFood(food, { date, block: targetBlock }), food.name),
                onOpen: () => pushServing(ctx, { food, date, block: targetBlock }),
              })
            )
          } else {
            const meal = await getMeal(fav.id)
            if (!meal) continue
            let totals = emptyTotals()
            for (const item of meal.items) {
              const food = await getFood(item.foodId)
              if (food) totals = addTotals(totals, computeMacros(food, item.quantity, item.unit))
            }
            favNodes.push(
              pickRow({
                title: meal.name,
                subtitle: pluralize(meal.items.length, 'item'),
                totals,
                onLog: () =>
                  logAndClose(() => logMeal(meal, { date, block: targetBlock }), meal.name),
                onOpen: () =>
                  logAndClose(() => logMeal(meal, { date, block: targetBlock }), meal.name),
              })
            )
          }
        }

        favouritesCard.replaceChildren(
          h(
            'section',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'Your Favourites'),
            card(
              favNodes.length
                ? favNodes
                : emptyRow('Pin the things you eat constantly. They stay put.')
            )
          )
        )

        const recents = (await recentFoods(30)).filter(
          (f) => !current.favourites.some((fav) => fav.type === 'food' && fav.id === f.id)
        )

        recentsCard.replaceChildren(
          h(
            'section',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'Recents'),
            card(
              recents.length
                ? recents.map((food) => {
                    const { quantity, unit } = defaultServing(food)
                    return pickRow({
                      title: food.name,
                      subtitle:
                        unit === 'serving'
                          ? `${qty(quantity)} × ${servingLabel(food)}`
                          : `${qty(quantity)} ${unitLabel(unit, quantity)}`,
                      totals: computeMacros(food, quantity, unit),
                      onLog: () =>
                        logAndClose(
                          () => quickLogFood(food, { date, block: targetBlock }),
                          food.name
                        ),
                      onOpen: () => pushServing(ctx, { food, date, block: targetBlock }),
                    })
                  })
                : emptyRow('Anything you log shows up here.')
            )
          )
        )
      }

      paintLists()

      /* --------------------------------------------------------- route row */

      const routeRow = h(
        'div',
        { class: 'flex gap-[10px]' },
        actionButton({
          iconName: 'scan',
          label: 'Scan',
          selected: true,
          onclick: () => pushScan(ctx, { date, block: targetBlock }),
        }),
        actionButton({
          iconName: 'search',
          label: 'Search',
          onclick: () => pushSearch(ctx, { date, block: targetBlock }),
        }),
        actionButton({
          iconName: 'custom',
          label: 'Custom',
          onclick: () => pushCustom(ctx, { date, block: targetBlock }),
        })
      )

      return h(
        'div',
        { class: 'flex flex-col gap-[30px] pb-[10px]' },
        routeRow,
        favouritesCard,
        recentsCard
      )
    },
  })
}
