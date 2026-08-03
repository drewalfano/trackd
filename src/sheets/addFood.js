import { h, repaint, longPress } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { openSheet } from '../lib/sheet.js'
import { toast } from '../lib/toast.js'
import {
  getSettings,
  recentFoods,
  getFood,
  getMeal,
  deleteEntry,
  getPlate,
  savePlate,
  clearPlate,
} from '../lib/db.js'
import { computeMacros, emptyTotals, addTotals } from '../lib/compute.js'
import { quickLogFood, logMeal, logPlate, defaultServing } from '../lib/logging.js'
import {
  plateBar,
  plateItemFor,
  pushPlate,
  resolvePlate,
  plateLoggedToast,
} from './plate.js'
import { macroLine, card, emptyRow, slot } from '../lib/ui.js'
import { servingLabel, qty, unitLabel, pluralize } from '../lib/format.js'
import { blockForTime, formatDayLabel, todayStr } from '../lib/dates.js'
import { state } from '../state.js'
import { pushServing } from './serving.js'
import { pushMeal } from './meal.js'
import { pushQuickAdd } from './quickAdd.js'
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

/**
 * Row that logs on tap, stages on `+`, and inspects on long-press.
 *
 * Three verbs, two visible targets. Tap still logs immediately — that is the
 * path the whole app is built around and it does not change. The second control
 * is `+` rather than the old pencil, because assembling a meal is the thing the
 * row could not do at all, while adjusting a serving already had a home: the
 * plate, where you tune the whole meal against one running total instead of
 * guessing food by food.
 *
 * The cost is real and worth stating: adjusting a single food at a non-default
 * amount moves from a visible pencil to a long-press nobody has been told
 * about. That is the one thing to watch in the friction log.
 */
function pickRow({ title, subtitle, totals, onLog, onAdd, onOpen, openLabel = `Open ${title}` }) {
  const row = h(
    'button',
    { class: 'row min-w-0 flex-1', onclick: onLog },
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      h('div', { class: 'truncate text-[16px] font-semibold leading-tight' }, title),
      h('div', { class: 'mt-[2px] truncate text-[12px] text-muted' }, subtitle),
      totals ? h('div', { class: 'mt-[4px]' }, macroLine(totals, { size: 12 })) : null
    )
  )
  if (onOpen) longPress(row, onOpen)

  return h(
    'div',
    { class: 'flex items-center' },
    row,
    h(
      'button',
      {
        class: 'icon-btn icon-btn-sm mr-[20px] bg-canvas',
        'aria-label': `Add ${title} to your plate`,
        onclick: onAdd,
      },
      icon('plus', { size: 18, stroke: 2.25 })
    )
  )
}

/**
 * Route picker, not a tab set.
 *
 * `primary`, not `selected`. Scan renders solid because it is the route most
 * likely to be wanted, not because anything is chosen — nothing on this row has
 * a selected state, and it carried no `aria-pressed` to match the styling, so a
 * screen reader heard an ordinary button while the eye saw a picked one.
 *
 * 24px radius on an 89px box, per the mock — the one shape in the app that is
 * deliberately NOT a capsule. The width comes from the layout rather than the
 * mock's 114: three flex children across a 375 sheet give 105, and matching the
 * mock's width would mean breaking the page's own gutters to do it.
 *
 * The mock also carries 60% iOS corner smoothing. CSS has no equivalent — it
 * would take an SVG mask per button — so these are true rounded rects and read
 * very slightly sharper at the corners than the Figma file does.
 */
function actionButton({ iconName, label, primary, onclick }) {
  return h(
    'button',
    {
      class:
        'flex min-h-[89px] flex-1 flex-col items-center justify-center gap-[10px] rounded-[24px] ' +
        (primary ? 'bg-ink text-canvas' : 'bg-surface text-ink'),
      onclick,
    },
    icon(iconName, { size: 26 }),
    h('span', { class: 'text-[13px] font-semibold' }, label)
  )
}

export async function openAddFood({ date = state.date, block } = {}) {
  const settings = await getSettings()
  const targetBlock = block ?? blockForTime(new Date(), settings.blockThresholds)

  return openSheet({
    // One tap on a favourite logs immediately, so the day has to be legible
    // before the tap rather than discoverable after it. Only says so when the
    // answer is surprising — "Add to today" on the common path is noise.
    title: date === todayStr() ? 'Add Food' : `Add to ${formatDayLabel(date)}`,
    render: (ctx) => {
      const favouritesCard = h('div')
      const recentsCard = h('div')
      // With no plate staged this took a full section gap for no height, so
      // the sheet opened with a 50px void under its header.
      const plateSlot = slot()

      const logAndClose = async (fn, label) => {
        const entries = await fn()
        ctx.close()
        const list = Array.isArray(entries) ? entries : [entries]
        toast(`Added ${label}`, {
          action: 'Undo',
          onAction: () => Promise.all(list.map((e) => deleteEntry(e.id))),
        })
      }

      /* ---------------------------------------------------------- the plate */

      /**
       * The plate keeps the day and block it was started with, so assembling at
       * 11pm and committing after midnight still lands where you meant.
       */
      const addToPlate = async (newItems, label) => {
        const plate = await getPlate()
        const next = {
          items: [...plate.items, ...newItems],
          date: plate.items.length ? plate.date : date,
          block: plate.items.length ? plate.block : targetBlock,
          startedAt: plate.startedAt ?? Date.now(),
        }
        await savePlate(next)
        await paintPlate()
        toast(`${label} added to your plate`)
      }

      const commitPlate = async () => {
        const plate = await getPlate()
        const entries = await logPlate(plate)
        await clearPlate()
        ctx.close()
        plateLoggedToast(entries)
      }

      async function paintPlate() {
        const plate = await getPlate()
        if (!plate.items.length) {
          repaint(plateSlot)
          return
        }
        const rows = await resolvePlate(plate.items)
        repaint(
          plateSlot,
          plateBar({
            rows,
            onOpen: () =>
              pushPlate(ctx, {
                plate,
                onCommitted: (entries) => {
                  ctx.close()
                  plateLoggedToast(entries)
                },
              }),
            onLog: commitPlate,
          })
        )
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
                onAdd: () => addToPlate([plateItemFor(food)], food.name),
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
                openLabel: `Open ${meal.name}`,
                onLog: () =>
                  logAndClose(() => logMeal(meal, { date, block: targetBlock }), meal.name),
                // A meal on a plate expands into its items, so they can be
                // adjusted individually rather than as one opaque lump.
                onAdd: () => addToPlate([...meal.items], meal.name),
                // Was the same call as onLog — the careful-looking control did
                // the irreversible thing. It opens the meal now.
                onOpen: () =>
                  pushMeal(ctx, {
                    meal,
                    date,
                    block: targetBlock,
                    onLogged: ({ block }) =>
                      logAndClose(() => logMeal(meal, { date, block }), meal.name),
                  }),
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
                      onAdd: () => addToPlate([plateItemFor(food)], food.name),
                      onOpen: () => pushServing(ctx, { food, date, block: targetBlock }),
                    })
                  })
                : emptyRow('Anything you log shows up here.')
            )
          )
        )
      }

      paintLists()
      paintPlate()

      /* --------------------------------------------------------- route row */

      const routeRow = h(
        'div',
        { class: 'flex gap-[10px]' },
        actionButton({
          iconName: 'scan',
          label: 'Scan',
          primary: true,
          onclick: () => pushScan(ctx, { date, block: targetBlock }),
        }),
        actionButton({
          iconName: 'search',
          label: 'Search',
          onclick: () => pushSearch(ctx, { date, block: targetBlock }),
        }),
        // Quick add rather than the full editor, because over a month you type
        // numbers in far more often than you author a food — and the two read
        // as duplicates side by side. The editor is still one tap away, from
        // inside Quick add or from the link below.
        actionButton({
          iconName: 'custom',
          label: 'Quick add',
          onclick: () => pushQuickAdd(ctx, { date, block: targetBlock }),
        })
      )

      return h(
        'div',
        /**
         * One step of the scale between sections, half a step inside them: 20
         * here, 10 between a label and its card. The 30 this used to carry read
         * as a third value with nothing else in the sheet at 30 — every row,
         * card and gutter is already on 10/20 — so sections floated instead of
         * grouping. The bottom padding is the body's own 20; a further 10 here
         * put the last link at 30 from the edge, out of step with the 20 the
         * gutters hold on every other side.
         */
        { class: 'flex flex-col gap-[20px]' },
        // Above the routes rather than below the lists: it is the state of an
        // action in progress, and it should not have to be scrolled to.
        plateSlot,
        routeRow,
        favouritesCard,
        recentsCard,
        // Deliberately not a fourth route button. Four across 375px would be
        // taller than wide — wrong for a 24px radius — and a 2×2 grid would
        // push Favourites below the fold, which is the one thing this sheet's
        // layout exists to prevent.
        // The full editor — brand, barcode, label photo, per-100 basis, sodium.
        // A link rather than a button because authoring a food from scratch is
        // the rarest way into this sheet: most foods arrive by scan or search,
        // and the ones you type get typed through Quick add.
        h(
          'button',
          {
            class: 'self-start px-0 text-[13px] font-semibold underline underline-offset-2',
            onclick: () => pushCustom(ctx, { date, block: targetBlock }),
          },
          'New food, with all the details'
        )
      )
    },
  })
}
