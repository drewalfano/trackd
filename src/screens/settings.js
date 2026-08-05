import { h, repaint } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { openSheet } from '../lib/sheet.js'
import { toast, confirm } from '../lib/toast.js'
import {
  getSettings,
  saveSettings,
  saveProfile,
  listFoods,
  listMeals,
  listWeights,
  putWeight,
  getFood,
  getMeal,
  putMeal,
  deleteMeal,
  moveFavourite,
  toggleFavourite,
  exportAll,
  importAll,
  previewImport,
  clearAll,
  storageEstimate,
} from '../lib/db.js'
import { kcalFromMacros } from '../lib/compute.js'
import {
  ACTIVITY_LEVELS,
  GOALS,
  RATE_PRESETS,
  activityFactor,
  ageFrom,
  belowFloor,
  canCalculate,
  computeTargets,
  describeRate,
} from '../lib/targets.js'
import {
  card,
  listRow,
  emptyRow,
  segmentedWide,
  numberInput,
  heightInput,
  textInput,
  labelledField,
  notice,
} from '../lib/ui.js'
import { pluralize, round, kgToUnit, unitToKg } from '../lib/format.js'
import { todayStr } from '../lib/dates.js'
import { navigate } from '../router.js'
import { openOnboardingOverlay } from './onboarding.js'
import { getAiKey, setAiKey, clearAiKey } from '../lib/aiKey.js'
import { VERSION, REPO_URL } from '../config.js'

/**
 * Settings, which is also where the food library and saved meals live because
 * neither earns a tab of its own.
 */


/* -------------------------------------------------------------- value rows */

/** Ids for label association. Monotonic, since a rebuild makes new elements. */
let rowSeq = 0

/**
 * `a`, `a and b`, `a, b and c`. No serial comma, matching the app's own copy —
 * "Protein, fat and carbs work out to…" is two lines further down the screen.
 */
function listOut(items) {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

/**
 * A label on the left and an editable number on the right, on one line.
 *
 * This is `listRow` with its `right` slot handed an input instead of a static
 * span — the same `.row` in the same `card()`, so the hairline between rows,
 * the outer inset and the corner radius all come from rules that already exist.
 * The only new idea is that the value on the right is typed into.
 *
 * The row IS a `<label>`, which is what makes "tap the row to edit" true with
 * no JavaScript, no focus handler and nothing that could shift the layout: the
 * input was always live and always in place, it simply was not wearing a pill.
 * `for` is redundant beside the wrapping and kept anyway — the association is
 * the requirement, the mechanism is not.
 */
function valueRow(label, control) {
  const inputs = [...control.querySelectorAll('input')]
  const first = control.input ?? inputs[0]
  if (first && !first.id) first.id = `set-field-${++rowSeq}`

  /**
   * Two inputs under one label is the imperial height row, where the wrapping
   * label names both of them and neither says which one is feet. The suffix
   * beside each is on screen doing that job and is invisible to anything not
   * looking at it.
   */
  if (inputs.length > 1) {
    for (const input of inputs) {
      const unit = input.nextElementSibling?.textContent
      input.setAttribute('aria-label', unit ? `${label}, ${unit}` : label)
    }
  }

  return h(
    'label',
    { class: 'row', for: first?.id ?? null },
    h('span', { class: 'min-w-0 flex-1 truncate text-[16px] font-semibold' }, label),
    control
  )
}

/**
 * A line of explanation behind a chip, for something true and non-obvious that
 * does not need saying on the way past.
 *
 * The alternative was attaching it to the editing state, and there is no
 * editing state here to attach it to — every row on this screen is live all the
 * time, so "while you are editing" means "always" and the paragraph is back in
 * the scroll where it started.
 */
function disclosure(label, text) {
  const body = h(
    'p',
    { class: 'hidden px-0 pt-[10px] text-[12px] leading-snug text-muted', id: `disc-${++rowSeq}` },
    text
  )
  const chip = h(
    'button',
    {
      class: 'chip-sm self-start',
      'aria-expanded': 'false',
      'aria-controls': body.id,
      onclick: () => {
        const open = chip.getAttribute('aria-expanded') === 'true'
        chip.setAttribute('aria-expanded', String(!open))
        body.classList.toggle('hidden', open)
      },
    },
    label
  )
  return h('div', { class: 'flex flex-col items-start' }, chip, body)
}

/* ------------------------------------------------------------------ sheets */

/**
 * The four activity levels, with the descriptions that are the reason anyone
 * can answer the question. They are what makes the list four rows tall, and
 * they are also why it cannot simply be a segmented control — so the list moves
 * behind a row rather than being compressed into labels nobody can choose from.
 */
function activitySheet(current) {
  return openSheet({
    title: 'How active are you',
    render: (ctx) =>
      card(
        ACTIVITY_LEVELS.map((level) =>
          listRow({
            title: level.label,
            subtitle: level.description,
            right: current === level.value ? icon('check', { size: 20 }) : null,
            dim: current !== level.value,
            onclick: () => ctx.close(level.value),
          })
        )
      ),
  })
}

function editBlocksSheet(settings) {
  return openSheet({
    title: 'Time blocks',
    render: (ctx) => {
      const names = [...settings.blockNames]
      const thresholds = { ...settings.blockThresholds }

      ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: async () => {
              await saveSettings({ blockNames: names, blockThresholds: thresholds })
              ctx.close()
              toast('Blocks updated')
            },
          },
          'Save'
        )
      )

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Names'),
          ...names.map((name, i) =>
            textInput({ value: name, onInput: (v) => (names[i] = v) })
          )
        ),
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'When a new entry defaults to each block'),
          labelledField({
            label: `${names[1]} starts at`,
            children: numberInput({
              value: thresholds.afternoon,
              suffix: ':00',
              step: '1',
              onInput: (v) => (thresholds.afternoon = Number(v)),
            }),
          }),
          labelledField({
            label: `${names[2]} starts at`,
            children: numberInput({
              value: thresholds.night,
              suffix: ':00',
              step: '1',
              onInput: (v) => (thresholds.night = Number(v)),
            }),
          }),
          notice('These only set the prefill. You can always override the block when logging.')
        )
      )
    },
  })
}

function favouritesSheet() {
  return openSheet({
    title: 'Favourites',
    render: (ctx) => {
      const list = h('div')

      async function paint() {
        const settings = await getSettings()
        const rows = []
        for (const [index, fav] of settings.favourites.entries()) {
          const item =
            fav.type === 'food' ? await getFood(fav.id) : await getMeal(fav.id)
          if (!item) continue
          rows.push(
            h(
              'div',
              { class: 'row' },
              h(
                'div',
                { class: 'min-w-0 flex-1' },
                h('div', { class: 'truncate text-[13px] font-medium' }, item.name),
                h(
                  'div',
                  { class: 'text-[12px] text-muted' },
                  fav.type === 'meal' ? pluralize(item.items.length, 'item') : 'Food'
                )
              ),
              h(
                'button',
                {
                  class: 'icon-btn bg-canvas',
                  'aria-label': 'Move up',
                  disabled: index === 0,
                  style: index === 0 ? { opacity: '0.3' } : null,
                  onclick: async () => {
                    await moveFavourite(index, -1)
                    paint()
                  },
                },
                icon('chevronUp', { size: 18 })
              ),
              h(
                'button',
                {
                  class: 'icon-btn bg-canvas',
                  'aria-label': 'Move down',
                  disabled: index === settings.favourites.length - 1,
                  style: index === settings.favourites.length - 1 ? { opacity: '0.3' } : null,
                  onclick: async () => {
                    await moveFavourite(index, 1)
                    paint()
                  },
                },
                icon('chevronDown', { size: 18 })
              ),
              h(
                'button',
                {
                  class: 'icon-btn bg-canvas',
                  'aria-label': 'Unpin',
                  onclick: async () => {
                    await toggleFavourite(fav.type, fav.id)
                    paint()
                  },
                },
                icon('close', { size: 16 })
              )
            )
          )
        }

        list.replaceChildren(
          card(rows.length ? rows : emptyRow('Nothing pinned yet.')),
          h(
            'p',
            { class: 'px-0 pt-[10px] text-[12px] leading-snug text-muted' },
            'Favourites never re-sort themselves. Fixed positions are what make the tap ' +
              'muscle memory, so the order here is the order in the add sheet.'
          )
        )
      }

      paint()
      return list
    },
  })
}

function mealsSheet() {
  return openSheet({
    title: 'Saved meals',
    render: (ctx) => {
      const list = h('div')

      async function paint() {
        const [meals, settings] = await Promise.all([listMeals(), getSettings()])
        meals.sort((a, b) => (b.useCount || 0) - (a.useCount || 0))

        list.replaceChildren(
          card(
            meals.length
              ? meals.map((meal) =>
                  h(
                    'div',
                    { class: 'row' },
                    h(
                      'div',
                      { class: 'min-w-0 flex-1' },
                      h('div', { class: 'truncate text-[13px] font-medium' }, meal.name),
                      h(
                        'div',
                        { class: 'text-[12px] text-muted' },
                        `${pluralize(meal.items.length, 'item')} · used ${meal.useCount || 0}×`
                      )
                    ),
                    h(
                      'button',
                      {
                        class: 'icon-btn bg-canvas',
                        'aria-label': 'Pin or unpin',
                        onclick: async () => {
                          await toggleFavourite('meal', meal.id)
                          paint()
                        },
                      },
                      icon('star', {
                        size: 17,
                        filled: settings.favourites.some(
                          (f) => f.type === 'meal' && f.id === meal.id
                        ),
                      })
                    ),
                    h(
                      'button',
                      {
                        class: 'icon-btn bg-canvas',
                        'aria-label': 'Rename',
                        onclick: async () => {
                          const name = await promptText('Rename meal', meal.name)
                          if (name) {
                            await putMeal({ ...meal, name })
                            paint()
                          }
                        },
                      },
                      icon('pencil', { size: 16 })
                    ),
                    h(
                      'button',
                      {
                        class: 'icon-btn bg-canvas',
                        'aria-label': 'Delete',
                        onclick: async () => {
                          const ok = await confirm({
                            title: `Delete "${meal.name}"?`,
                            message: 'Entries already logged from it are not affected.',
                          })
                          if (ok) {
                            await deleteMeal(meal.id)
                            paint()
                          }
                        },
                      },
                      icon('trash', { size: 16 })
                    )
                  )
                )
              : emptyRow('Save a block from the Log day view to create one.')
          )
        )
      }

      paint()
      return list
    },
  })
}

/** Small one-field sheet, used for renames. */
function promptText(title, initial) {
  return openSheet({
    title,
    render: (ctx) => {
      let value = initial
      ctx.setFooter(
        h('button', { class: 'btn-primary', onclick: () => ctx.close(value.trim()) }, 'Save')
      )
      return h(
        'div',
        { class: 'pb-[10px]' },
        textInput({ value, autofocus: true, onInput: (v) => (value = v) })
      )
    },
  })
}

/* -------------------------------------------------------------------- data */

async function doExport() {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: `trackd-${todayStr()}.json` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast('Export downloaded')
}

function doImport() {
  const input = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      let data
      try {
        data = JSON.parse(await file.text())
      } catch {
        toast('That file is not valid JSON.')
        return
      }
      openImportSheet(data)
    },
  })
  document.body.appendChild(input)
  input.click()
  setTimeout(() => input.remove(), 60000)
}

function openImportSheet(data) {
  return openSheet({
    title: 'Import data',
    render: (ctx) => {
      let mode = 'merge'
      const body = h('div', { class: 'flex flex-col gap-[20px]' })

      async function paint() {
        let counts
        try {
          counts = await previewImport(data, mode)
        } catch (err) {
          body.replaceChildren(notice(err.message, { iconName: 'alert' }))
          return
        }

        const rows = Object.entries(counts).map(([store, c]) =>
          h(
            'div',
            { class: 'row' },
            h('div', { class: 'flex-1 text-[13px] font-medium capitalize' }, store),
            h(
              'div',
              { class: 'text-right text-[12px] leading-tight text-muted' },
              h('div', {}, mode === 'replace' ? `${c.existing} → ${c.after}` : `${c.existing} → ${c.after}`),
              h(
                'div',
                {},
                mode === 'replace'
                  ? `${c.incoming} imported, ${c.removed} replaced`
                  : `${c.added} new, ${c.overwritten} updated`
              )
            )
          )
        )

        // Same null-child trap: an export taken before `exportedAt` existed
        // would otherwise put the word "null" under the preview.
        repaint(
          body,
          segmentedWide({
            options: [
              { value: 'merge', label: 'Merge' },
              { value: 'replace', label: 'Replace' },
            ],
            value: mode,
            onChange: (v) => {
              mode = v
              paint()
            },
          }),
          notice(
            mode === 'merge'
              ? 'Anything with a matching id is updated, everything else is added. Your settings are left alone.'
              : 'Everything currently on this device is deleted first, including settings and targets.',
            { iconName: mode === 'replace' ? 'alert' : 'info' }
          ),
          card(rows),
          data.exportedAt
            ? h(
                'p',
                { class: 'px-0 text-[12px] text-muted' },
                `Exported ${new Date(data.exportedAt).toLocaleString()}`
              )
            : null
        )
      }

      ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: async () => {
              if (mode === 'replace') {
                const ok = await confirm({
                  title: 'Replace everything?',
                  message: 'All data on this device is deleted and rebuilt from the file.',
                  confirmLabel: 'Replace',
                })
                if (!ok) return
              }
              try {
                await importAll(data, mode)
                ctx.close()
                toast('Import complete')
              } catch (err) {
                toast(err.message || 'Import failed')
              }
            },
          },
          'Import'
        )
      )

      paint()
      return h('div', { class: 'pb-[10px]' }, body)
    },
  })
}

/* ------------------------------------------------------------------ screen */

export function settingsScreen() {
  return createScreen(
    async ({ rerender }) => {
      const settings = await getSettings()
      const [foods, meals, weights, estimate] = await Promise.all([
        listFoods(),
        listMeals(),
        listWeights(),
        storageEstimate(),
      ])

      // Dev only, and compiled out with the row that reads it.
      const sampleLoaded =
        import.meta.env.DEV && foods.some((f) => String(f.id).startsWith('sample-'))

      /* --------------------------------------------------------- targets */

      const targets = { ...settings.targets }
      let kcalOverridden = true
      let saveTimer = null

      const kcalField = numberInput({
        value: targets.kcal,
        suffix: 'cal',
        bare: true,
        onInput: (v) => {
          targets.kcal = Number(v) || 0
          kcalOverridden = true
          syncFloorHint()
          queueSave()
        },
      })

      const derivedHint = h('div', { class: 'px-0 text-[12px] text-muted' })

      /**
       * Said once, under the field, and never again. A target below the floor
       * is accepted — this is the user's tool and they may have a reason — but
       * it should not pass without the app having mentioned it.
       */
      // `empty:hidden` because it usually is: an empty flex child still spends a
      // full 10px gap under the card it is not saying anything about.
      const floorHint = h('div', { class: 'empty:hidden' })
      const syncFloorHint = () => {
        const floor = belowFloor(targets.kcal, settings.profile.sex)
        repaint(
          floorHint,
          floor
            ? notice(
                `That is below ${floor} cal, which is the point where this is worth talking ` +
                  'to someone about rather than typing into an app. Saved either way.',
                { iconName: 'alert' }
              )
            : null
        )
      }

      const syncDerived = () => {
        const derived = kcalFromMacros(targets)
        if (!kcalOverridden) {
          targets.kcal = Math.round(derived)
          kcalField.input.value = targets.kcal
        }
        derivedHint.replaceChildren(
          h(
            'div',
            { class: 'flex flex-col items-start gap-[10px]' },
            h(
              'span',
              {},
              `Protein, fat and carbs work out to ${Math.round(derived)} cal.`,
              kcalOverridden ? '' : ' Calories now follow the macros.'
            ),
            kcalOverridden
              ? h(
                  'button',
                  {
                    class: 'chip-sm',
                    onclick: () => {
                      kcalOverridden = false
                      syncDerived()
                      queueSave()
                    },
                  },
                  'Use that'
                )
              : null
          )
        )
      }

      /**
       * Any hand edit flips the source to manual. Typed numbers win over
       * calculated ones permanently, rather than until the next time the
       * profile changes and something quietly recomputes over the top.
       */
      function queueSave() {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveSettings({ targets, targetsSource: 'manual' }).then(paintCalc)
        }, 400)
      }

      const macroTargetRow = (key, label) =>
        valueRow(
          label,
          numberInput({
            value: targets[key],
            suffix: 'g',
            bare: true,
            onInput: (v) => {
              targets[key] = Number(v) || 0
              syncDerived()
              queueSave()
            },
          })
        )

      syncDerived()
      syncFloorHint()

      /* ------------------------------------------------------ about you */

      const profile = { ...settings.profile }
      const weightUnit = settings.weightUnit
      let currentKg = weights.at(-1)?.kg ?? null
      let profileTimer = null
      let weightTimer = null

      function queueProfileSave() {
        clearTimeout(profileTimer)
        profileTimer = setTimeout(() => saveProfile(profile), 400)
      }

      /**
       * The one field where a plausible typo is silent: 1949 for 1994 moves the
       * target by a couple of hundred calories and looks like a year either way.
       * The age is the read-back, so it follows the keystrokes rather than
       * waiting for a rebuild that this screen deliberately never does.
       *
       * Appended to the field rather than passed as its suffix, the way the API
       * key field appends its Show button: `numberInput` builds no span for an
       * empty suffix, and there would then be nothing to write the age into on
       * the first year typed.
       */
      const ageLabel = (year) => {
        const age = ageFrom(year)
        return age ? `${age} years old` : ''
      }

      const ageHint = h(
        'span',
        { class: 'shrink-0 text-[14px] text-muted' },
        ageLabel(profile.birthYear)
      )

      const birthYearField = numberInput({
        value: profile.birthYear ?? '',
        placeholder: '—',
        step: '1',
        bare: true,
        onInput: (v) => {
          profile.birthYear = Number(v) || null
          ageHint.textContent = ageLabel(profile.birthYear)
          queueProfileSave()
          paintCalc()
        },
      })
      birthYearField.appendChild(ageHint)

      /**
       * For the taps rather than the typing. A choice that changes what else is
       * on screen has to be written before the screen is rebuilt from it, or
       * the rebuild reads the value it just replaced.
       */
      const saveProfileNow = (patch) => {
        clearTimeout(profileTimer)
        Object.assign(profile, patch)
        return saveProfile(profile)
      }

      /** Repaints only the calculated block, so typing does not lose focus. */
      const calcBlock = h('div', { class: 'flex flex-col gap-[10px]' })

      /**
       * Four rows and eleven lines of description, for a question asked once.
       *
       * Answered, it collapses to the answer: the descriptions are there to help
       * someone choose, and re-reading all four to confirm you are still "A bit"
       * is not a thing anybody does. Unanswered, the list stays open — a chevron
       * row is a good way to change a decision and a poor way to prompt one.
       */
      const activityCard = h('div')
      function paintActivity() {
        const chosen = ACTIVITY_LEVELS.find((l) => l.value === profile.activity)

        const choose = (value) => {
          profile.activity = value
          queueProfileSave()
          paintActivity()
          paintCalc()
        }

        activityCard.replaceChildren(
          chosen
            ? card(
                listRow({
                  title: 'How active',
                  right: h('span', { class: 'text-[12px] text-muted' }, chosen.label),
                  chevron: true,
                  onclick: () =>
                    activitySheet(profile.activity).then((v) => v && choose(v)),
                })
              )
            : h(
                'div',
                { class: 'flex flex-col gap-[10px]' },
                h('div', { class: 'section-label' }, 'How active are you'),
                // Nothing is selected in this branch, by definition, so no row
                // carries a check and every one of them is equally dimmed.
                card(
                  ACTIVITY_LEVELS.map((level) =>
                    listRow({
                      title: level.label,
                      subtitle: level.description,
                      dim: true,
                      onclick: () => choose(level.value),
                    })
                  )
                )
              )
        )
      }
      paintActivity()

      const rateRow = h('div')
      function paintRate() {
        const presets = RATE_PRESETS[profile.goal] || RATE_PRESETS.maintain
        repaint(
          rateRow,
          profile.goal === 'maintain'
            ? null
            : segmentedWide({
                // The rate alone. Pairing it with the preset name wrapped to two
                // lines in a segment, and "Steadily" next to "0.5 kg a week"
                // was not telling anyone anything the number had not.
                options: presets.map((p) => ({
                  value: p.kgPerWeek,
                  label: describeRate(p.kgPerWeek, weightUnit),
                })),
                value: presets.find((p) => p.kgPerWeek === profile.rateKgPerWeek)
                  ? profile.rateKgPerWeek
                  : presets[0].kgPerWeek,
                onChange: (v) => {
                  profile.rateKgPerWeek = v
                  queueProfileSave()
                  paintRate()
                  paintCalc()
                },
              })
        )
      }
      paintRate()

      /**
       * The calculated figures, always visible and never applied on their own.
       * Applying is a button, because a target changing underneath someone
       * because they corrected their height is not a thing an app should do.
       */
      function paintCalc() {
        if (!canCalculate(profile, currentKg)) {
          /**
           * Naming what is still missing, rather than restating the whole list
           * every time. Four lines explaining the requirement is a paragraph
           * about a form; one line saying "needs your height" is an instruction.
           */
          const missing = []
          if (profile.sex !== 'female' && profile.sex !== 'male') missing.push('sex')
          if (!ageFrom(profile.birthYear)) missing.push('birth year')
          if (!(Number(profile.heightCm) > 0)) missing.push('height')
          if (!(currentKg > 0)) missing.push('a weigh-in')
          if (!activityFactor(profile.activity)) missing.push('an activity level')

          repaint(
            calcBlock,
            notice(
              profile.sex === 'unspecified'
                ? 'The formula needs sex as one of its terms, so set the targets above by hand.'
                : `Needs ${listOut(missing)}.`
            )
          )
          return
        }

        const calc = computeTargets(profile, { weightKg: currentKg })
        const same = ['kcal', 'protein', 'fat', 'carbs'].every(
          (k) => Math.round(targets[k]) === calc[k]
        )

        repaint(
          calcBlock,
          card(
            listRow({
              title: `${calc.kcal} cal`,
              subtitle: `${calc.protein} g protein · ${calc.fat} g fat · ${calc.carbs} g carbs`,
            }),
            listRow({
              title: 'How that is worked out',
              subtitle:
                `${calc.bmr} at rest, ${calc.maintenance} with activity` +
                (calc.rateKgPerWeek
                  ? `, then ${calc.rateKgPerWeek < 0 ? 'less' : 'more'} for ${describeRate(
                      calc.rateKgPerWeek,
                      weightUnit
                    )}`
                  : ', and no adjustment'),
            })
          ),
          calc.floored
            ? notice(
                `The arithmetic came to ${calc.requested} cal. This stops at ${calc.floor} and ` +
                  'will not calculate anyone below it.',
                { iconName: 'info' }
              )
            : null,
          same
            ? h('p', { class: 'px-0 text-[12px] text-muted' }, 'Your targets match this.')
            : h(
                'button',
                {
                  class: 'btn-primary',
                  onclick: async () => {
                    await saveSettings({
                      targets: {
                        kcal: calc.kcal,
                        protein: calc.protein,
                        fat: calc.fat,
                        carbs: calc.carbs,
                      },
                      targetsSource: 'calculated',
                    })
                    toast('Targets updated')
                    rerender()
                  },
                },
                'Use these targets'
              )
        )
      }
      paintCalc()

      /* ----------------------------------------------------- ai describe */

      /**
       * The key field, and nothing that uses the key.
       *
       * It is a `.field` with a chip appended rather than a new shared input,
       * because `textInput` already spreads its extra props onto the element
       * and `type: 'password'` is the only thing that makes this field
       * different. One caller does not earn a component, and `ui.js` is the
       * app's whole visual vocabulary — a `secretInput` in there would be a
       * word the system does not otherwise speak.
       *
       * Show/Hide is a `chip-sm` for the same reason: it is the pattern this
       * screen already uses for a small inline action ("Use that",
       * "Recalculate"), and it costs the icon set nothing. There is no eye
       * glyph in `icons.js` and the file's own header argues against the set
       * growing.
       */
      let storedKey = getAiKey()
      let keyDraft = storedKey
      let keyShown = false

      const keyField = textInput({
        value: storedKey,
        type: 'password',
        placeholder: 'Paste your key',
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        onInput: (v) => {
          keyDraft = v
          syncKey()
        },
      })

      const revealBtn = h(
        'button',
        {
          class: 'chip-sm shrink-0',
          onclick: () => {
            keyShown = !keyShown
            keyField.input.type = keyShown ? 'text' : 'password'
            revealBtn.textContent = keyShown ? 'Hide' : 'Show'
          },
        },
        'Show'
      )
      keyField.appendChild(revealBtn)

      const saveKeyBtn = h(
        'button',
        {
          class: 'btn-primary',
          disabled: true,
          onclick: () => {
            setAiKey(keyDraft)
            storedKey = getAiKey()
            keyDraft = storedKey
            keyField.input.value = storedKey
            syncKey()
            toast('Key saved')
          },
        },
        'Save'
      )

      // Clearing is reversible by pasting the key back, so it does not confirm
      // the way the Data section's destructive rows do.
      const clearKeyBtn = h(
        'button',
        {
          class: 'chip-sm self-start',
          onclick: () => {
            clearAiKey()
            storedKey = ''
            keyDraft = ''
            keyField.input.value = ''
            keyShown = false
            keyField.input.type = 'password'
            revealBtn.textContent = 'Show'
            syncKey()
            toast('Key cleared')
          },
        },
        'Clear'
      )

      const clearKeySlot = h('div', { class: 'empty:hidden' })

      function syncKey() {
        const draft = keyDraft.trim()
        saveKeyBtn.disabled = !draft || draft === storedKey
        clearKeySlot.replaceChildren(...(storedKey ? [clearKeyBtn] : []))
      }
      syncKey()

      /* ------------------------------------------------------------ rows */

      const prefRow = (label, control) =>
        h(
          'div',
          { class: 'row flex-col items-stretch gap-[10px]' },
          h('span', { class: 'text-[13px] font-medium' }, label),
          control
        )

      return h(
        'div',
        { class: 'flex flex-col gap-[30px] pb-[20px]' },
        h(
          'div',
          { class: 'px-0 pt-[10px]' },
          h('h1', { class: 'text-title font-semibold leading-tight' }, 'Settings')
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-title' }, 'Targets'),
          h(
            'p',
            { class: 'px-0 text-[12px] leading-snug text-muted' },
            settings.targetsSource === 'calculated'
              ? 'Worked out from your profile below. Editing anything here makes them yours instead.'
              : 'Set by hand. Nothing recalculates these unless you ask it to.'
          ),
          card(
            valueRow('Calories', kcalField),
            macroTargetRow('protein', 'Protein'),
            macroTargetRow('fat', 'Fat'),
            macroTargetRow('carbs', 'Carbs')
          ),
          // Both of these describe the four numbers above rather than any one of
          // them, so they sit under the card instead of between the rows.
          floorHint,
          derivedHint,
          disclosure(
            'What this affects',
            'Changing a target changes today and everything after it. Days you have already ' +
              'logged keep the target they were logged against.'
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[20px]' },
          h('div', { class: 'section-title' }, 'About you'),
          h(
            'p',
            { class: 'px-0 text-[12px] leading-snug text-muted' },
            'Only used to suggest a target. None of it leaves this device, and the app works ' +
              'without any of it.'
          ),

          card(
            prefRow(
              'Sex',
              segmentedWide({
                options: [
                  { value: 'female', label: 'Female' },
                  { value: 'male', label: 'Male' },
                  { value: 'unspecified', label: 'Rather not' },
                ],
                value: profile.sex,
                onChange: (v) => saveProfileNow({ sex: v }).then(rerender),
              })
            ),
            prefRow(
              'Goal',
              segmentedWide({
                options: GOALS.map((g) => ({ value: g.value, label: g.label })),
                value: profile.goal,
                onChange: (v) =>
                  saveProfileNow({
                    goal: v,
                    // A goal without a rate is a goal at the gentlest one.
                    rateKgPerWeek: (RATE_PRESETS[v] || RATE_PRESETS.maintain)[0].kgPerWeek,
                  }).then(rerender),
              })
            ),
            profile.goal === 'maintain' ? null : prefRow('How fast', rateRow),
            valueRow('Birth year', birthYearField),
            valueRow(
              'Height',
              heightInput({
                cm: profile.heightCm,
                units: settings.units,
                bare: true,
                placeholder: '—',
                onChange: (cm) => {
                  profile.heightCm = cm
                  queueProfileSave()
                  paintCalc()
                },
              })
            ),
            valueRow(
              'Current weight',
              numberInput({
                value: currentKg == null ? '' : round(kgToUnit(currentKg, weightUnit), 1),
                suffix: weightUnit,
                placeholder: '—',
                step: '0.1',
                bare: true,
                onInput: (v) => {
                  const entered = Number(v)
                  if (!(entered > 0)) return
                  currentKg = unitToKg(entered, weightUnit)
                  clearTimeout(weightTimer)
                  weightTimer = setTimeout(() => putWeight(todayStr(), currentKg), 600)
                  paintCalc()
                },
              })
            )
          ),

          h(
            'p',
            { class: 'px-0 text-[12px] leading-snug text-muted' },
            'Weight is saved as today’s weigh-in — the Weight tab is the record, not a second copy.'
          ),

          activityCard,

          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'Suggested target'),
            calcBlock
          ),

          // Temporary door onto the first-run flow while it is being built.
          // Runs as a preview: blank draft, nothing written unless the last
          // step is taken deliberately, so walking through it cannot cost
          // someone the profile they already have.
          card(
            listRow({
              title: 'Preview onboarding',
              subtitle: 'The first-run flow, full screen, as a new person sees it',
              chevron: true,
              onclick: () => openOnboardingOverlay({ preview: true }).then(rerender),
            })
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-title' }, 'Foods'),
          card(
            listRow({
              title: 'Food library',
              subtitle: pluralize(foods.length, 'food'),
              chevron: true,
              onclick: () => navigate('foods'),
            }),
            listRow({
              title: 'Favourites',
              subtitle: pluralize(settings.favourites.length, 'pinned item'),
              chevron: true,
              onclick: () => favouritesSheet().then(rerender),
            }),
            listRow({
              title: 'Saved meals',
              subtitle: pluralize(meals.length, 'meal'),
              chevron: true,
              onclick: () => mealsSheet().then(rerender),
            })
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-title' }, 'Preferences'),
          card(
            // One control for both heights and weights. It was two — this row
            // and a kg/lb row under it — while onboarding set both from this
            // one, so the same preference could be stated twice and the two
            // screens disagreed about which statement counted. `weightUnit`
            // now follows `units`; see `weightUnitFor`.
            prefRow(
              'Units',
              segmentedWide({
                options: [
                  { value: 'metric', label: 'Metric' },
                  { value: 'imperial', label: 'Imperial' },
                ],
                value: settings.units,
                onChange: (v) => saveSettings({ units: v }).then(rerender),
                on: 'card',
              })
            ),
            prefRow(
              'Theme',
              segmentedWide({
                options: [
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ],
                value: settings.theme,
                onChange: (v) => saveSettings({ theme: v }).then(rerender),
                on: 'card',
              })
            ),
            prefRow(
              'Trend window',
              segmentedWide({
                options: [
                  { value: 7, label: '7 days' },
                  { value: 14, label: '14 days' },
                ],
                value: settings.trendWindow,
                onChange: (v) => saveSettings({ trendWindow: v }).then(rerender),
                on: 'card',
              })
            ),
            listRow({
              title: 'Time blocks',
              subtitle: settings.blockNames.join(' · '),
              chevron: true,
              onclick: () => editBlocksSheet(settings).then(rerender),
            })
          )
        ),

        // The intro line under this heading is deliberately absent: it is still
        // with the author. Everything here works without it.
        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-title' }, 'AI Describe'),
          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            labelledField({
              label: 'API key',
              hint:
                'Without a key, AI Describe still reads what it can and matches it against ' +
                'your foods. The key is for the rest — dishes with no entry anywhere, and ' +
                'wording the rules will not split.',
              children: keyField,
            }),
            saveKeyBtn,
            clearKeySlot
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-title' }, 'Data'),
          card(
            listRow({
              title: 'Export data',
              subtitle: 'One JSON file with everything',
              leading: icon('download', { size: 19, class: 'text-muted' }),
              onclick: doExport,
            }),
            listRow({
              title: 'Import data',
              subtitle: 'Merge or replace, with a preview first',
              leading: icon('upload', { size: 19, class: 'text-muted' }),
              onclick: doImport,
            }),
            listRow({
              title: 'Clear all data',
              subtitle: 'Cannot be undone',
              leading: icon('trash', { size: 19, class: 'text-muted' }),
              onclick: async () => {
                const ok = await confirm({
                  title: 'Delete everything?',
                  message:
                    'Every food, entry, meal and weigh-in on this device is removed. ' +
                    'Export first if you want a copy.',
                  confirmLabel: 'Delete everything',
                  requireText: 'DELETE',
                })
                if (ok) {
                  await clearAll()
                  toast('All data cleared')
                  rerender()
                }
              },
            }),
            /**
             * Dev only. `import.meta.env.DEV` is a literal at build time, so
             * the installed app gets `false && …` and the bundler drops both
             * this row and the module behind it — the filler cannot ship.
             *
             * It lives under Data rather than in a console command because the
             * person who needs it is looking at the design, not at a terminal.
             */
            import.meta.env.DEV
              ? listRow({
                  title: sampleLoaded ? 'Remove sample favourites' : 'Load sample favourites',
                  subtitle: sampleLoaded
                    ? 'Takes back exactly what it added'
                    : 'Six foods, pinned, for looking at the rail',
                  leading: icon('star', { size: 19, class: 'text-muted' }),
                  onclick: async () => {
                    const { loadSampleFoods, clearSampleFoods } = await import(
                      '../lib/sampleData.js'
                    )
                    const n = sampleLoaded ? await clearSampleFoods() : await loadSampleFoods()
                    toast(sampleLoaded ? `Removed ${n} sample foods` : `Added ${n} sample foods`)
                    rerender()
                  },
                })
              : null
          ),
          h(
            'p',
            { class: 'px-0 pt-[10px] text-[12px] leading-snug text-muted' },
            'Export is the only backup. Clearing this browser’s site data deletes everything ' +
              'here, and nothing is stored anywhere else.'
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          card(
            listRow({
              title: 'Version',
              right: h('span', { class: 'text-[12px] text-muted' }, VERSION),
            }),
            estimate?.usage != null
              ? listRow({
                  title: 'Storage used',
                  right: h(
                    'span',
                    { class: 'text-[12px] text-muted' },
                    `${round(estimate.usage / 1024, 0)} KB`
                  ),
                })
              : null,
            h(
              'a',
              { class: 'row', href: REPO_URL, target: '_blank', rel: 'noreferrer noopener' },
              h('span', { class: 'flex-1 text-[13px] font-medium' }, 'Source code'),
              icon('chevronRight', { size: 18, class: 'text-muted' })
            )
          ),
          /**
           * Where the food data comes from.
           *
           * Neither source requires this. Open Food Facts is ODbL and the
           * obligation attaches to redistributing the database, which the app
           * does not do — it copies a product into your library when you log
           * it. USDA FoodData Central is a work of the US federal government
           * and is in the public domain outright.
           *
           * It is here anyway, because both are volunteer or public efforts the
           * app leans on entirely for the half of its data it did not author,
           * and saying so costs two lines.
           */
          h(
            'p',
            { class: 'px-0 pt-[10px] text-[12px] leading-snug text-muted' },
            'Barcode and product data from Open Food Facts. Common foods from USDA ' +
              'FoodData Central.'
          )
        )
      )
    },
    { watch: [], watchDate: false }
  )
}
