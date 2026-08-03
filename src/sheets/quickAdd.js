import { h, repaint } from '../lib/dom.js'
import { putEntry, getSettings } from '../lib/db.js'
import { kcalFromMacros, MACRO_META } from '../lib/compute.js'
import { blockSelector, macroLine, numberInput, textInput, labelledField, notice } from '../lib/ui.js'
import { round } from '../lib/format.js'
import { blockForTime, formatDayLabel, todayStr } from '../lib/dates.js'

/**
 * Calories and macros, with no food behind them.
 *
 * Every other route ends by creating a library entry, which is right for
 * anything eaten twice. It is ceremony for a restaurant meal eaten once — and
 * worse than ceremony, because that one-off then ranks in Recents and search
 * forever, crowding out the foods that are actually staples.
 *
 * So this writes an entry and nothing else. `foodId` is null on purpose: there
 * is no food, and pretending otherwise would put a phantom in the library. The
 * entry still carries `computed`, which is the only thing any total ever reads,
 * so a quick add behaves exactly like every other entry everywhere downstream.
 */

export const QUICK_ADD_SOURCE = 'quick'

export async function pushQuickAdd(ctx, { date = todayStr(), block } = {}) {
  const settings = await getSettings()
  ctx.push(quickAddPanel({ settings, date, block, onDone: () => ctx.close() }))
}

export function quickAddPanel({ settings, date, block: initialBlock, onDone }) {
  return {
    title: 'Quick add',
    render: (ctx) => {
      let label = ''
      let block = initialBlock ?? blockForTime(new Date(), settings.blockThresholds)
      const macros = { protein: '', fat: '', carbs: '' }
      let kcal = ''
      /** True once the calorie field is typed in directly. */
      let kcalOverridden = false

      const kcalField = numberInput({
        value: '',
        suffix: 'cal',
        placeholder: '0',
        onInput: (v) => {
          kcal = v
          kcalOverridden = true
          sync()
        },
      })

      const derived = h('div', { class: 'px-0 text-[12px] leading-snug text-muted' })
      const preview = h('div')

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
        repaint(preview, macroLine(current, { size: 14 }))
        repaint(
          derived,
          kcalOverridden && fromMacros
            ? h(
                'span',
                {},
                `The macros work out to ${Math.round(fromMacros)} cal. `,
                h(
                  'button',
                  {
                    class: 'font-semibold underline underline-offset-2',
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
        saveBtn.disabled = !(current.kcal > 0 || current.protein || current.fat || current.carbs)
      }

      const saveBtn = h(
        'button',
        {
          class: 'btn-primary',
          onclick: async () => {
            saveBtn.disabled = true
            const t = totals()
            await putEntry({
              date,
              block,
              foodId: null,
              source: QUICK_ADD_SOURCE,
              // entryRow and the edit sheet both read `foodName`; without one a
              // quick add would render as "Deleted food".
              foodName: label.trim() || 'Quick add',
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

      const macroField = (key) =>
        labelledField({
          label: MACRO_META[key].label,
          children: numberInput({
            value: '',
            suffix: 'g',
            placeholder: '0',
            onInput: (v) => {
              macros[key] = v
              sync()
            },
          }),
        })

      paintBlock()
      sync()
      ctx.setFooter(saveBtn)

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },

        h('div', { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' }, preview),

        labelledField({
          label: 'What was it',
          hint: 'Optional. Shows in the log so the day still reads back.',
          children: textInput({
            value: '',
            placeholder: 'Quick add',
            onInput: (v) => (label = v),
          }),
        }),

        labelledField({ label: 'Calories', children: kcalField }),
        derived,
        macroField('protein'),
        macroField('fat'),
        macroField('carbs'),

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        ),

        date !== todayStr()
          ? notice(`This goes onto ${formatDayLabel(date)}, not today.`)
          : null,

        notice(
          'Nothing is saved to your food library. This is one entry on one day — ' +
            'if you will eat it again, use Custom instead.'
        )
      )
    },
  }
}
