import { h, repaint } from '../lib/dom.js'
import { putEntry, putFood, getSettings } from '../lib/db.js'
import { kcalFromMacros, perServingToPer100, MACRO_META } from '../lib/compute.js'
import {
  blockSelector,
  macroLine,
  numberInput,
  textInput,
  labelledField,
  notice,
  segmentedWide,
  switchRow,
  slot,
} from '../lib/ui.js'
import { logFood } from '../lib/logging.js'
import { round, UNITS, unitLabel } from '../lib/format.js'
import { blockForTime, formatDayLabel, todayStr } from '../lib/dates.js'

/**
 * The front door for typing numbers in yourself.
 *
 * By default it writes an entry and nothing else. `foodId` is null on purpose:
 * there is no food, and pretending otherwise would put a phantom in the
 * library. A restaurant meal eaten once should not rank in Recents and search
 * forever, crowding out the things that are actually staples — that is the
 * whole reason this route exists separately from authoring a food.
 *
 * The switch at the bottom is the escape hatch for when it IS a staple. It was
 * a second front-door button called "Custom", and the two read as duplicates
 * from the sheet: both are "type it in". They were never duplicates — they
 * produce different objects, one an entry and one a reusable food — but that
 * difference lived in the label, and "Custom" does not say "creates a food".
 * Now it is a decision inside one form, stated in the words of the consequence:
 * save it, or do not.
 *
 * **This panel is now the one called "Custom", which is not the collision it
 * looks like.** It shipped as "Quick add" and gave that name up when Today grew
 * a Quick add rail — a rail of foods you have already eaten has the better
 * claim to the phrase, and two different things one tap apart cannot share a
 * word. "Custom" was free to take back because the button that used to carry it
 * is the one folded into the switch below; the full editor it opened is titled
 * "New food" and "Edit food" wherever it still appears, and is no longer a
 * front door on this sheet at all.
 *
 * Turning it on is the ONE case that needs more than four numbers. A food is
 * defined per 100g, so it needs to know what one serving is; and it needs a
 * name, which is optional for an entry and cannot be for something you will go
 * looking for later. Both appear only when the switch is on, because a form
 * that asks for them up front is the form this one replaced.
 *
 * The full editor still exists — brand, barcode, label photo, per-100 basis,
 * sodium — and is still where a scan with no nutrition data lands and where a
 * food is edited. It is just no longer a front door.
 */

export const QUICK_ADD_SOURCE = 'quick'

export async function pushQuickAdd(ctx, { date = todayStr(), block } = {}) {
  const settings = await getSettings()
  ctx.push(quickAddPanel({ settings, date, block, onDone: () => ctx.close() }))
}

export function quickAddPanel({ settings, date, block: initialBlock, onDone }) {
  return {
    title: 'Custom',
    render: (ctx) => {
      let label = ''
      let block = initialBlock ?? blockForTime(new Date(), settings.blockThresholds)
      const macros = { protein: '', fat: '', carbs: '' }
      let kcal = ''
      /** True once the calorie field is typed in directly. */
      let kcalOverridden = false
      /** Off writes an entry; on also writes a food. */
      let keep = false
      let servingSize = '100'
      let servingUnit = 'g'

      const kcalField = numberInput({
        value: '',
        suffix: 'cal',
        suffixMacro: 'kcal',
        placeholder: '—',
        onInput: (v) => {
          kcal = v
          kcalOverridden = true
          sync()
        },
      })

      const derived = slot('px-0 text-[12px] leading-snug text-muted')

      /**
       * The strip is the panel, rather than a div inside one, so it can take
       * itself out of the form when it has nothing to say.
       *
       * `empty:hidden` needs the emptiable element and the styled element to be
       * the SAME element — with the old arrangement the panel always held one
       * child, an empty div, so `:empty` never matched and a card of blank
       * canvas stayed in the layout. `display: none` rather than a height
       * animation because a flex gap belongs to a visible child; hidden, the
       * strip costs its own 61px and the 20px above it.
       */
      const preview = h('div', {
        class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px] empty:hidden',
      })

      const totals = () => ({
        kcal: Number(kcal) || 0,
        protein: Number(macros.protein) || 0,
        fat: Number(macros.fat) || 0,
        carbs: Number(macros.carbs) || 0,
      })

      /**
       * Calories follow the macros until they are typed over, the same bargain
       * the Settings targets make. Someone who only knows "about 600 calories"
       * types that and leaves the rest blank; someone reading a menu enters the
       * macros and the calories fill themselves in.
       */
      function sync() {
        const t = totals()
        const fromMacros = kcalFromMacros(t)
        if (!kcalOverridden) {
          kcal = fromMacros ? String(Math.round(fromMacros)) : ''
          kcalField.input.value = kcal
        }
        const current = totals()
        /**
         * Nothing typed, nothing to summarise.
         *
         * The test is on the VALUES rather than on whether a field has been
         * touched, because `0` is a real answer here — a 0 cal drink, 0 g of
         * fat — and answering it does not give the strip anything to say. It
         * would read `0 cal · 0 P · 0 F · 0 C`, which is the form narrating its
         * own blankness; `derived` below already declines to do exactly that on
         * an untouched sheet, and for the same reason.
         *
         * Calories count, not just the three macros. Someone who only knows
         * "about 600" types that and leaves the rest blank, and `600 cal` is
         * worth reading back. In practice the two rarely differ, since typing a
         * macro derives calories anyway.
         */
        const hasAnything =
          current.kcal > 0 || current.protein > 0 || current.fat > 0 || current.carbs > 0
        repaint(preview, hasAnything ? macroLine(current, { size: 14 }) : null)

        /**
         * Same rule as the Settings targets, and now the same arrangement.
         *
         * The chip was shown whenever there were macros to derive from, which
         * meant it stayed up while the calorie field already held the number it
         * was offering — `600 cal` typed, macros working out to 600, and a
         * button proposing to write 600 over it. The test is whether pressing
         * it would change the value, rounded on both sides because that is what
         * it would write; the long form is on `syncDerived` in screens/settings.
         *
         * The block was a vertical stack, and it moved from 58px tall to 18 the
         * moment the two figures met — a 40px jump in the middle of a sheet,
         * from typing a digit. Side by side under a `min-h-[30px]` it is 30
         * either way. That it now matches the arrangement of the identical
         * sentence one screen over is the point rather than a side effect: this
         * is one component that had been copied twice and allowed to drift.
         */
        const rounded = Math.round(fromMacros)
        const wouldChange = rounded > 0 && rounded !== Math.round(Number(kcal) || 0)

        /**
         * The hint stays once calories are following the macros, and says so.
         *
         * **It used to vanish outright.** The block was gated on
         * `kcalOverridden`, so pressing `Use that` removed the sentence along
         * with the button — the reader pressed something and the only line
         * describing what it did disappeared, leaving a calorie field that had
         * silently changed and nothing accounting for it. Settings has always
         * kept the line and appended `Calories now follow the macros.`, which
         * is the state the reader has just entered and the one they need told,
         * because it persists: every later macro edit moves the calorie figure
         * too.
         *
         * So the gate moves from the block to the chip. The block appears as
         * soon as there is a figure to state and stays put; the chip is the
         * only thing that comes and goes.
         *
         * The remaining `fromMacros` guard is not the same test. An untouched
         * sheet has no macros at all, and `The macros work out to 0 cal.` over
         * three empty fields is the form narrating its own blankness. Settings
         * shows it at zero because that card always holds four saved numbers;
         * this one starts empty.
         */
        repaint(
          derived,
          fromMacros
            ? h(
                'div',
                { class: 'flex items-center gap-[10px]' },
                h(
                  'span',
                  { class: 'min-w-0 flex-1' },
                  `The macros work out to ${rounded} cal.`,
                  kcalOverridden ? '' : ' Calories now follow the macros.'
                ),
                h(
                  'button',
                  {
                    // `self-end` and `invisible` for the reasons Settings gives
                    // at length: one bottom edge for the group, and the chip's
                    // box held in the line whether or not it is offering
                    // anything, so the sentence wraps the same way either way.
                    class: `chip-sm self-end${kcalOverridden && wouldChange ? '' : ' invisible'}`,
                    onclick: () => {
                      kcalOverridden = false
                      sync()
                    },
                  },
                  'Use that'
                )
              )
            : null
        )
        const hasNumbers = current.kcal > 0 || current.protein || current.fat || current.carbs
        // A food you cannot name is a food you will never find again, so the
        // name stops being optional the moment the switch goes on.
        const nameable = !keep || label.trim().length > 0
        saveBtn.disabled = !(hasNumbers && nameable)
        saveBtn.textContent = keep ? 'Save and add' : 'Add'
      }

      /**
       * Everything the switch reveals, in one block that is either there or is
       * not — rather than fields that grey out. A disabled field still occupies
       * the form and still has to be read past to know it does not apply.
       */
      const keepFields = h('div', { class: 'flex flex-col gap-[20px] empty:hidden' })

      const paintKeep = () => {
        if (!keep) {
          keepFields.replaceChildren()
          return
        }
        keepFields.replaceChildren(
          labelledField({
            label: 'One serving is',
            hint: 'What the numbers above describe. Foods are stored per 100, so this is how it converts.',
            // Size above, unit below, the same shape the full editor uses for
            // the same pair. Side by side, the segments get squeezed to about
            // a third of the row and stop reading as a segmented control.
            children: h(
              'div',
              { class: 'flex flex-col gap-[10px]' },
              numberInput({
                value: servingSize,
                placeholder: '100',
                onInput: (v) => {
                  servingSize = v
                  sync()
                },
              }),
              segmentedWide({
                options: UNITS.map((u) => ({ value: u, label: u === 'item' ? 'items' : u })),
                value: servingUnit,
                onChange: (v) => {
                  servingUnit = v
                  paintKeep()
                },
              })
            ),
          })
        )
      }

      const saveBtn = h(
        'button',
        {
          class: 'btn-primary',
          onclick: async () => {
            saveBtn.disabled = true
            const t = totals()

            if (keep) {
              /**
               * Create the food, then log it through `logFood` rather than
               * writing the entry here.
               *
               * That is the one path that keeps `computed` and the recency bump
               * from drifting apart, and it means this entry is indistinguishable
               * from one logged off the same food tomorrow. The numbers make the
               * round trip — typed per serving, stored per 100, recomputed back
               * for one serving — and land where they started, which is the
               * point: the food IS what was typed, not an approximation of it.
               */
              const size = Number(servingSize) || 0
              const food = await putFood({
                name: label.trim(),
                brand: null,
                barcode: null,
                servingSize: size,
                servingUnit,
                servingLabel: `${round(size, 2)} ${unitLabel(servingUnit, size)}`,
                source: 'custom',
                per100: perServingToPer100(t, size),
              })
              await logFood({ food, quantity: 1, unit: 'serving', date, block })
              onDone?.()
              return
            }

            await putEntry({
              date,
              block,
              foodId: null,
              source: QUICK_ADD_SOURCE,
              /**
               * entryRow, the Log screen and the edit sheet all read
               * `foodName`; without one a custom entry would render as
               * "Deleted food", which is a lie about a row that was never
               * attached to a food in the first place.
               *
               * "Unnamed" rather than "Custom", and neither rather than the
               * "Quick add" this shipped with. A log row is a list of things
               * you ate, and the two earlier names both answered a question
               * nobody reading the log is asking — they named the ROUTE the
               * entry came in by, which matters at the moment of typing and
               * never again. Two months on, "Custom · 420 cal" tells you the
               * form you used and nothing about the food.
               *
               * The field above is optional and says so, so leaving it blank is
               * a complete answer rather than a mistake. The honest row is the
               * one that admits the name is missing and lets the macros and the
               * timestamp carry the rest, which is all the day needs to read
               * back.
               */
              foodName: label.trim() || 'Unnamed',
              quantity: 1,
              unit: 'item',
              computed: {
                kcal: round(t.kcal, 1),
                protein: round(t.protein, 1),
                fat: round(t.fat, 1),
                carbs: round(t.carbs, 1),
              },
            })
            onDone?.()
          },
        },
        'Add'
      )

      const blockRow = h('div')
      const paintBlock = () => {
        repaint(
          blockRow,
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

      /**
       * One of three equal columns, not a row of its own.
       *
       * The three are the same question asked three times in the same unit, and
       * stacked they took 277px of a 802px form — a third of it, to hold three
       * numbers that are each at most four characters. Side by side they take
       * 79px and read as the set they are.
       *
       * `min-w-0` on the wrapper because a `flex-1` column will not shrink below
       * its content's intrinsic width without it, and a `type="number"` input
       * reports a wide one — three columns would overflow the sheet rather than
       * divide it.
       *
       * Calories keeps its own full-width row. It is not a fourth macro: it is
       * derived from these three, carries a hint underneath about that, and is
       * the number most likely to be four digits.
       */
      const macroField = (key) =>
        h(
          'div',
          { class: 'min-w-0 flex-1' },
          labelledField({
            label: MACRO_META[key].label,
            children: numberInput({
              value: '',
              suffix: 'g',
              placeholder: '—',
              onInput: (v) => {
                macros[key] = v
                sync()
              },
            }),
          })
        )

      const nameRow = h('div')
      const paintName = () =>
        repaint(
          nameRow,
          labelledField({
            label: keep ? 'Name' : 'What was it',
            hint: keep
              ? 'Required. This is what you will search for.'
              : 'Optional. Shows in the log so the day still reads back.',
            children: textInput({
              value: label,
              // Two different jobs, which is why the two placeholders are not
              // the same kind of word. With the switch on the field is required
              // and the placeholder is an EXAMPLE of what to type. With it off
              // the field is optional, so the placeholder is a PREVIEW of what
              // the log will say if you leave it alone — it has to stay in step
              // with the `foodName` fallback below, or the field advertises one
              // row and writes another.
              placeholder: keep ? 'Overnight oats' : 'Unnamed',
              onInput: (v) => {
                label = v
                sync()
              },
            }),
          })
        )

      paintBlock()
      paintName()
      paintKeep()
      sync()
      ctx.setFooter(saveBtn)

      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },

        preview,

        nameRow,

        labelledField({ label: 'Calories', children: kcalField }),
        derived,
        h(
          'div',
          { class: 'macro-row flex gap-[10px]' },
          macroField('protein'),
          macroField('fat'),
          macroField('carbs')
        ),

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        ),

        date !== todayStr()
          ? notice(`This goes onto ${formatDayLabel(date)}, not today.`)
          : null,

        // The one decision this form makes beyond the numbers, and it sits at
        // the bottom because it is about what happens AFTER — everything above
        // is the same either way.
        h(
          'div',
          { class: 'panel flex flex-col gap-[20px] px-[20px] py-[20px]' },
          switchRow({
            label: 'Save to my foods',
            // One line, and the text column is what sets this row's height —
            // 56px against the switch's 31 — so the second line was costing the
            // panel 16px to restate the first. Measured at 375pt, the app's
            // narrowest target and the binding one: the column is 224px there
            // and this is 196. "not just this once" reads better and measures
            // 220, which is four pixels of headroom and not worth trusting.
            hint: 'Keep it for next time, not just once.',
            checked: keep,
            onChange: (v) => {
              keep = v
              paintName()
              paintKeep()
              sync()
            },
          }),
          keepFields
        )
      )
    },
  }
}
