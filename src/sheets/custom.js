import { h } from '../lib/dom.js'
import { putFood } from '../lib/db.js'
import { toast } from '../lib/toast.js'
import { openSheet } from '../lib/sheet.js'
import {
  kcalFromMacros,
  perServingToPer100,
  per100ToPerServing,
  sanityCheck,
} from '../lib/compute.js'
import { segmentedWide, numberInput, textInput, labelledField, notice } from '../lib/ui.js'
import { labelPhotoField } from '../lib/labelPhoto.js'
import { round, UNITS, unitLabel } from '../lib/format.js'
import { pushServing } from './serving.js'

/**
 * The full food editor, also used to edit an existing food and to finish a scan
 * that came back with a barcode but no nutrition data.
 *
 * No longer a front-door button on the Add sheet — Quick add took that slot,
 * and the two read as duplicates side by side. What is left here is everything
 * Quick add's switch does not need: brand, barcode, label photo, the per-100
 * basis and sodium.
 *
 * Two things earn their complexity here. The per-serving / per-100 toggle,
 * because labels are printed both ways and retyping arithmetic at a restaurant
 * table is where logging gets abandoned. And the calorie override, because
 * Atwater almost never reproduces the rounded number on the package — when they
 * disagree, the label wins.
 *
 * The label photo sits at the top for the same reason both of those exist: this
 * form is where someone is copying numbers off a packet, and every route that
 * ends in a packet ends here — an unknown barcode, a search that found nothing,
 * or Custom picked outright.
 */

const emptyValues = () => ({ kcal: '', protein: '', fat: '', carbs: '', sodium: '' })
const numOf = (v) => (v === '' || v == null ? 0 : Number(v) || 0)

export function customPanel({ initial = {}, mode = 'create', onSaved }) {
  // Form state lives out here, not inside render(), because switching the
  // per-serving / per-100 basis re-renders the panel and must not wipe the
  // half-typed label the user is looking at.
  const draft = {
    id: initial.id,
    name: initial.name ?? '',
    brand: initial.brand ?? '',
    barcode: initial.barcode ?? null,
    servingSize: initial.servingSize ?? 100,
    servingUnit: initial.servingUnit ?? 'g',
    servingLabel: initial.servingLabel ?? '',
    source: initial.source ?? 'custom',
    createdAt: initial.createdAt,
    lastUsedAt: initial.lastUsedAt,
    useCount: initial.useCount,
  }

  let basis = 'serving'
  let values = emptyValues()
  let kcalOverridden = false

  // Outside render() for the same reason the draft is: switching the basis
  // re-renders the panel, and a photo you just took must not be thrown away by
  // a toggle. The node is reused across renders rather than rebuilt.
  const labelPhoto = labelPhotoField()

  if (initial.per100) {
    const perServing = per100ToPerServing(initial.per100, draft.servingSize)
    values = {
      kcal: String(perServing.kcal),
      protein: String(perServing.protein),
      fat: String(perServing.fat),
      carbs: String(perServing.carbs),
      sodium: perServing.sodium == null ? '' : String(perServing.sodium),
    }
    // An imported food's calories are authoritative; do not recompute them.
    kcalOverridden = true
  }

  return {
    title: mode === 'edit' ? 'Edit food' : 'New food',
    render: (ctx) => {
      const warningsEl = h('div')
      const kcalHint = h('div', { class: 'text-[12px] leading-snug text-muted' })
      let kcalInput

      const currentPer100 = () => {
        const raw = {
          kcal: numOf(values.kcal),
          protein: numOf(values.protein),
          fat: numOf(values.fat),
          carbs: numOf(values.carbs),
          sodium: values.sodium === '' ? null : numOf(values.sodium),
        }
        return basis === 'serving' ? perServingToPer100(raw, draft.servingSize) : raw
      }

      function syncCalories() {
        if (!kcalOverridden) {
          const derived = kcalFromMacros({
            protein: numOf(values.protein),
            carbs: numOf(values.carbs),
            fat: numOf(values.fat),
          })
          values.kcal = derived ? String(round(derived, 0)) : ''
          if (kcalInput) kcalInput.value = values.kcal
        }
        kcalHint.replaceChildren(
          kcalOverridden
            ? h(
                'span',
                {},
                'Using your number. ',
                h(
                  'button',
                  {
                    class: 'font-semibold underline underline-offset-2',
                    onclick: () => {
                      kcalOverridden = false
                      syncCalories()
                      validate()
                    },
                  },
                  'Recalculate'
                )
              )
            : 'Calculated from protein, fat and carbs. Type over it to use the label instead.'
        )
      }

      function validate() {
        const per100 = currentPer100()
        const warnings = sanityCheck(per100, draft.servingUnit)
        warningsEl.replaceChildren(
          ...warnings.map((w) => notice(w, { iconName: 'alert' }))
        )
        saveBtn.disabled = !draft.name.trim() || !(Number(draft.servingSize) > 0)
        return per100
      }

      const saveBtn = h(
        'button',
        {
          class: 'btn-primary',
          onclick: async () => {
            saveBtn.disabled = true
            const per100 = currentPer100()
            const food = await putFood({
              ...draft,
              name: draft.name.trim(),
              brand: draft.brand.trim() || null,
              servingSize: Number(draft.servingSize),
              servingLabel:
                draft.servingLabel.trim() ||
                `${round(draft.servingSize, 2)} ${unitLabel(draft.servingUnit, draft.servingSize)}`,
              per100,
            })
            await onSaved(food, ctx)
          },
        },
        mode === 'edit' ? 'Save food' : 'Save and add'
      )

      /* ------------------------------------------------------------ fields */

      const macroField = (key, label, suffix) =>
        labelledField({
          label,
          children: numberInput({
            value: values[key],
            suffix,
            onInput: (v) => {
              values[key] = v
              if (key === 'kcal') kcalOverridden = v !== ''
              else syncCalories()
              validate()
            },
            ref: key === 'kcal' ? (el) => (kcalInput = el) : undefined,
          }),
        })

      const unitRow = h('div')
      const paintUnits = () => {
        unitRow.replaceChildren(
          segmentedWide({
            options: UNITS.map((u) => ({ value: u, label: u === 'item' ? 'items' : u })),
            value: draft.servingUnit,
            onChange: (v) => {
              draft.servingUnit = v
              paintUnits()
              validate()
            },
          })
        )
      }
      paintUnits()

      const basisRow = h('div')
      const paintBasis = () => {
        basisRow.replaceChildren(
          segmentedWide({
            options: [
              { value: 'serving', label: 'Per serving' },
              { value: '100', label: `Per 100 ${draft.servingUnit}` },
            ],
            value: basis,
            onChange: (v) => {
              if (v === basis) return
              // Convert what is already typed rather than making them retype it.
              const per100 = currentPer100()
              const next =
                v === '100' ? per100 : per100ToPerServing(per100, draft.servingSize)
              values = {
                kcal: next.kcal ? String(round(next.kcal, 1)) : '',
                protein: next.protein ? String(round(next.protein, 1)) : '',
                fat: next.fat ? String(round(next.fat, 1)) : '',
                carbs: next.carbs ? String(round(next.carbs, 1)) : '',
                sodium: next.sodium == null ? '' : String(round(next.sodium, 1)),
              }
              basis = v
              ctx.refresh()
            },
          })
        )
      }
      paintBasis()

      ctx.setFooter(saveBtn)
      ctx.onDispose(() => labelPhoto.release())
      syncCalories()
      validate()

      // The basis toggle directly above already says per-serving or per-100, so
      // the field suffixes stay as bare units and fit on one line.
      const basisLabel = basis === 'serving' ? 'per serving' : `per 100 ${draft.servingUnit}`

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        labelPhoto.node,
        draft.barcode
          ? notice(`Barcode ${draft.barcode} will be saved with this food.`, {
              iconName: 'barcode',
            })
          : null,

        labelledField({
          label: 'Name',
          children: textInput({
            value: draft.name,
            placeholder: 'Chicken thigh, cooked',
            autofocus: !draft.name,
            onInput: (v) => {
              draft.name = v
              validate()
            },
          }),
        }),

        labelledField({
          label: 'Brand',
          children: textInput({
            value: draft.brand,
            placeholder: 'Optional',
            onInput: (v) => (draft.brand = v),
          }),
        }),

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Serving'),
          h(
            'div',
            { class: 'flex gap-[10px]' },
            h(
              'div',
              { class: 'flex-1' },
              numberInput({
                value: draft.servingSize,
                suffix: draft.servingUnit,
                onInput: (v) => {
                  draft.servingSize = v
                  paintBasis()
                  validate()
                },
              })
            )
          ),
          unitRow,
          textInput({
            value: draft.servingLabel,
            placeholder: 'Label, e.g. 1 scoop (30 g)',
            onInput: (v) => (draft.servingLabel = v),
          })
        ),

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, `Nutrition ${basisLabel}`),
          basisRow,
          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            macroField('protein', 'Protein', 'g'),
            macroField('fat', 'Fat', 'g'),
            macroField('carbs', 'Carbs', 'g'),
            h(
              'div',
              { class: 'flex flex-col gap-[10px]' },
              macroField('kcal', 'Calories', 'cal'),
              kcalHint
            ),
            macroField('sodium', 'Sodium', 'mg')
          )
        ),

        warningsEl
      )
    },
  }
}

/** Custom route from the add sheet: save, then go straight to the serving step. */
export function pushCustom(ctx, { date, block, initial = {} }) {
  ctx.push(
    customPanel({
      initial,
      onSaved: async (food, c) => {
        pushServing(c, { food, date, block })
      },
    })
  )
}

/** Standalone editor, used from the food library. */
export function openCustomFood({ initial = {}, mode = 'edit' } = {}) {
  const panel = customPanel({
    initial,
    mode,
    onSaved: async (food, ctx) => {
      ctx.close(food)
      toast('Saved')
    },
  })
  return openSheet({ title: panel.title, render: panel.render })
}
