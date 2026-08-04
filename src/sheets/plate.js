import { h, repaint } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { toast, confirm } from '../lib/toast.js'
import { getFood, getSettings, savePlate, clearPlate, deleteEntry } from '../lib/db.js'
import { computeMacros, emptyTotals, addTotals } from '../lib/compute.js'
import { logPlate, saveDraftAsMeal, defaultServing } from '../lib/logging.js'
import {
  blockSelector,
  card,
  macroLine,
  numberInput,
  segmentedWide,
  labelledField,
  textInput,
  notice,
} from '../lib/ui.js'
import { qty, servingLabel, unitLabel, pluralize, round } from '../lib/format.js'
import { addDays, formatDayLabel, todayStr } from '../lib/dates.js'

/**
 * The plate: foods assembled, then logged in one commit.
 *
 * The add sheet used to write on every tap and close itself, so a four-item
 * dinner was four trips through it. This is the staging area — and because it
 * holds a running total, it is also the first place the app can answer "what
 * does this do to my day" before the day is changed rather than after.
 *
 * Amounts are adjusted here rather than before adding. Tuning a meal against
 * one total beats guessing food by food, and it keeps the row in the add sheet
 * down to two targets.
 */

async function resolve(items) {
  const rows = []
  for (const item of items) {
    const food = await getFood(item.foodId)
    rows.push({ item, food, macros: food ? computeMacros(food, item.quantity, item.unit) : null })
  }
  return rows
}

export const plateTotals = (rows) =>
  rows.reduce((acc, r) => (r.macros ? addTotals(acc, r.macros) : acc), emptyTotals())

/** The one place a food is added to a plate, so the defaults stay in one spot. */
export function plateItemFor(food) {
  const { quantity, unit } = defaultServing(food)
  return { foodId: food.id, quantity, unit }
}

/* --------------------------------------------------------------- the panel */

export function platePanel({ plate, rows, settings, onChange, onCommitted }) {
  return {
    title: 'Your plate',
    render: (ctx) => {
      let items = [...plate.items]
      let block = plate.block
      let date = plate.date

      const body = h('div', { class: 'flex flex-col gap-[20px]' })

      const persist = () => onChange({ ...plate, items, block, date })

      async function repaintAll() {
        const resolved = await resolve(items)
        const totals = plateTotals(resolved)
        const missing = resolved.filter((r) => !r.food).length

        repaint(
          body,

          h(
            'div',
            { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' },
            h(
              'div',
              { class: 'flex items-baseline gap-[10px]' },
              h(
                'span',
                { class: 'tnum text-[30px] font-semibold leading-none' },
                String(Math.round(totals.kcal))
              ),
              h('span', { class: 'text-[12px] font-medium text-muted' }, 'cal')
            ),
            macroLine(totals, { size: 14, omit: ['kcal'] })
          ),

          items.length
            ? card(
                resolved.map(({ item, food, macros }, i) =>
                  h(
                    'div',
                    { class: 'row' },
                    // A plate item is the same food a moment before it becomes a
                    // logged entry, so it is the same body — and the amount takes
                    // its own line here for the same reason it does in the add
                    // sheet's lists.
                    foodRowBody({
                      name: food?.name || 'Deleted food',
                      sub: food
                        ? item.unit === 'serving'
                          ? `${qty(item.quantity)} × ${servingLabel(food)}`
                          : `${qty(item.quantity)} ${unitLabel(item.unit, item.quantity)}`
                        : 'No longer in your library',
                      totals: macros,
                      missing: !food,
                    }),
                    food
                      ? h(
                          'button',
                          {
                            class: 'icon-btn icon-btn-sm bg-canvas',
                            'aria-label': `Change amount of ${food.name}`,
                            onclick: () => openAmount(i, food, item),
                          },
                          icon('pencil', { size: 16 })
                        )
                      : null,
                    h(
                      'button',
                      {
                        class: 'icon-btn icon-btn-sm bg-canvas',
                        'aria-label': `Remove ${food?.name || 'item'} from plate`,
                        onclick: async () => {
                          items = items.filter((_, j) => j !== i)
                          await persist()
                          if (!items.length) {
                            ctx.close()
                            return
                          }
                          repaintAll()
                        },
                      },
                      icon('close', { size: 16 })
                    )
                  )
                )
              )
            : null,

          missing
            ? notice(
                `${pluralize(missing, 'food')} on this plate ${missing === 1 ? 'has' : 'have'} ` +
                  'been deleted from your library and will be skipped.',
                { iconName: 'alert' }
              )
            : null,

          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'Day'),
            segmentedWide({
              options: [
                { value: addDays(date, -1), label: formatDayLabel(addDays(date, -1)) },
                { value: date, label: formatDayLabel(date) },
                { value: addDays(date, 1), label: formatDayLabel(addDays(date, 1)) },
              ],
              value: date,
              onChange: async (v) => {
                date = v
                await persist()
                repaintAll()
              },
            })
          ),

          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'Block'),
            blockSelector({
              value: block,
              onChange: async (v) => {
                block = v
                await persist()
                repaintAll()
              },
              blockNames: settings.blockNames,
            })
          ),

          // Clearing is the one destructive action here and the least likely,
          // so it reads as a link rather than a slab. It also keeps the body
          // from ending in a full-width button butted against the pinned
          // footer, which made three actions look like three primaries.
          h(
            'button',
            {
              class: 'chip-sm self-start',
              onclick: async () => {
                const ok = await confirm({
                  title: 'Clear the plate?',
                  message: 'Nothing has been logged yet, so nothing comes off your day.',
                  confirmLabel: 'Clear',
                })
                if (!ok) return
                await clearPlate()
                ctx.close()
                toast('Plate cleared')
              },
            },
            'Clear plate'
          )
        )

        const logBtn = h(
          'button',
          {
            class: 'btn-primary',
            disabled: !resolved.some((r) => r.food),
            onclick: async () => {
              logBtn.disabled = true
              const entries = await logPlate({ items, date, block })
              await clearPlate()
              onCommitted(entries)
            },
          },
          `Log ${pluralize(resolved.filter((r) => r.food).length, 'item')}`
        )

        // Both real actions live in the pinned footer, primary above secondary,
        // the same pairing the serving sheet uses for Add and Remove. Saving a
        // plate as a meal is a genuine second option rather than an afterthought
        // at the bottom of a scroll.
        ctx.setFooter(
          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            logBtn,
            h(
              'button',
              { class: 'btn-secondary', onclick: () => openSaveAsMeal(items) },
              'Save as a meal'
            )
          )
        )
      }

      /** Amount editing, in place — the plate is where servings get tuned. */
      function openAmount(index, food, item) {
        let quantity = String(item.quantity)
        let unit = item.unit
        const options = [{ value: 'serving', label: 'servings' }]
        if (!(food.servingUnit === 'item' && Number(food.servingSize) === 1)) {
          options.push({ value: food.servingUnit, label: unitLabel(food.servingUnit, 2) })
        }

        ctx.push({
          title: food.name,
          render: (c) => {
            const previewEl = h('div')
            const field = numberInput({
              value: quantity,
              autofocus: true,
              onInput: (v) => {
                quantity = v
                paint()
              },
            })
            const unitRow = h('div')
            const paint = () => {
              repaint(previewEl, macroLine(computeMacros(food, Number(quantity) || 0, unit), { size: 14 }))
              repaint(
                unitRow,
                segmentedWide({
                  options,
                  value: unit,
                  onChange: (v) => {
                    const n = Number(quantity) || 0
                    if (v === 'serving' && unit !== 'serving') {
                      quantity = String(round(n / (Number(food.servingSize) || 1), 2))
                    } else if (v !== 'serving' && unit === 'serving') {
                      quantity = String(round(n * (Number(food.servingSize) || 1), 2))
                    }
                    unit = v
                    field.input.value = quantity
                    paint()
                  },
                })
              )
            }
            paint()

            c.setFooter(
              h(
                'button',
                {
                  class: 'btn-primary',
                  onclick: async () => {
                    items = items.map((it, j) =>
                      j === index ? { ...it, quantity: Number(quantity), unit } : it
                    )
                    await persist()
                    repaintAll()
                    c.pop()
                  },
                },
                'Update'
              )
            )

            return h(
              'div',
              { class: 'flex flex-col gap-[20px]' },
              h('div', { class: 'panel px-[20px] py-[20px]' }, previewEl),
              labelledField({
                label: 'Amount',
                children: field,
                hint: `1 serving = ${servingLabel(food)}`,
              }),
              unitRow
            )
          },
        })
      }

      function openSaveAsMeal(currentItems) {
        ctx.push({
          title: 'Save as a meal',
          render: (c) => {
            let name = ''
            const save = h(
              'button',
              {
                class: 'btn-primary',
                disabled: true,
                onclick: async () => {
                  await saveDraftAsMeal(name.trim(), currentItems)
                  c.pop()
                  toast(`Saved "${name.trim()}"`)
                },
              },
              'Save meal'
            )
            c.setFooter(save)
            return h(
              'div',
              { class: 'flex flex-col gap-[20px]' },
              labelledField({
                label: 'Name',
                hint: 'Saved meals are reusable. The plate stays as it is — saving does not log it.',
                children: textInput({
                  value: '',
                  autofocus: true,
                  placeholder: 'Usual breakfast',
                  onInput: (v) => {
                    name = v
                    save.disabled = !v.trim()
                  },
                }),
              })
            )
          },
        })
      }

      repaintAll()
      return body
    },
  }
}

/* ------------------------------------------------------------------ bar */

/**
 * The running total, pinned above the add sheet's footer.
 *
 * This is the whole discoverability story: if it is not obvious that `+` fills
 * this bar, nothing else about the plate works. Tapping the bar opens it;
 * the button commits without opening it, which is the fast path.
 */
export function plateBar({ rows, onOpen, onLog }) {
  const totals = plateTotals(rows)
  const count = rows.filter((r) => r.food).length

  return h(
    'div',
    /**
     * 10 on three sides, 20 on the left.
     *
     * The `Log` pill is what the padding has to answer to, and a uniform 20
     * gave it 10 above and below (its own height sets the bar's) against 20 to
     * the right — sitting in a slot it did not fill. Its inset is now equal on
     * the three edges it touches. The left keeps 20 because that side is text,
     * and a glyph needs the gutter every other row in the app gives it; a
     * filled pill carries its own padding and does not.
     */
    {
      class:
        'flex items-center gap-[10px] rounded-[24px] bg-ink py-[10px] pl-[20px] pr-[10px] text-canvas',
    },
    /**
     * The count and the calories, and nothing else.
     *
     * `P · F · C` used to sit under them at 70% opacity, and it was three
     * numbers nobody was going to act on. This bar is a running tally of a
     * plate still being assembled: the question it answers is "how much have I
     * put on here so far", and calories are the answer to that. The macro
     * split matters when the plate is being tuned — which is the plate screen,
     * one tap away through this very button, where every row carries its own
     * full line.
     *
     * It also cost the bar a second line to say it, which pushed the two
     * buttons below it further down a sheet whose whole layout argument is
     * keeping Favourites above the fold.
     */
    h(
      'button',
      {
        class: 'min-w-0 flex-1 text-left text-[14px] font-semibold leading-tight',
        onclick: onOpen,
        'aria-label': 'Open your plate',
      },
      `${pluralize(count, 'item')} · ${Math.round(totals.kcal)} cal`
    ),
    h(
      'button',
      {
        class: 'shrink-0 rounded-[999px] bg-canvas px-[20px] py-[10px] text-[13px] font-semibold text-ink',
        onclick: onLog,
      },
      /**
       * `Log`, bare.
       *
       * Not "Log 1" — the count is already three words to the left of it, and a
       * bar that says the number twice is a bar with nothing else to say. Not
       * "Add to log" either, which is what this read for several versions: the
       * verb in a direct-log flow is `log`, and "add" was the one place it
       * became something else.
       *
       * The old objection to `Log` alone was that it is the weakest verb in the
       * app — the noun on Today, the name of a screen, a section heading — so a
       * button carrying it says which it means only from where it sits. That is
       * true and it is answered by where this sits: it is on a bar reading
       * `3 items · 812 cal`, which is a sentence with exactly one verb missing.
       *
       * The plate screen keeps `Log {n} items`, because a screen you navigated
       * to has no such sentence beside the button and confirming what is being
       * committed is worth the repetition there.
       */
      'Log'
    )
  )
}

/* --------------------------------------------------------------- opening */

export async function pushPlate(ctx, { plate, onCommitted }) {
  const [settings, rows] = await Promise.all([getSettings(), resolve(plate.items)])
  ctx.push(
    platePanel({
      plate,
      rows,
      settings,
      onChange: savePlate,
      onCommitted,
    })
  )
}

/** Shared commit toast: one undo for the whole plate, never one per item. */
export function plateLoggedToast(entries) {
  toast(`Logged ${pluralize(entries.length, 'item')}`, {
    action: 'Undo',
    onAction: () => Promise.all(entries.map((e) => deleteEntry(e.id))),
  })
}

export { resolve as resolvePlate }
