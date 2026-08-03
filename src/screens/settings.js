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
import { VERSION, REPO_URL } from '../config.js'

/**
 * Settings, which is also where the food library and saved meals live because
 * neither earns a tab of its own.
 */


/* ------------------------------------------------------------------ sheets */

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
  const a = h('a', { href: url, download: `macro-tracker-${todayStr()}.json` })
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

      /* --------------------------------------------------------- targets */

      const targets = { ...settings.targets }
      let kcalOverridden = true
      let saveTimer = null

      const kcalField = numberInput({
        value: targets.kcal,
        suffix: 'cal',
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
      const floorHint = h('div')
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
            'span',
            {},
            `Protein, fat and carbs work out to ${Math.round(derived)} cal. `,
            kcalOverridden
              ? h(
                  'button',
                  {
                    class: 'font-semibold underline underline-offset-2',
                    onclick: () => {
                      kcalOverridden = false
                      syncDerived()
                      queueSave()
                    },
                  },
                  'Use that'
                )
              : 'Calories now follow the macros.'
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

      const macroField = (key, label) =>
        labelledField({
          label,
          children: numberInput({
            value: targets[key],
            suffix: 'g',
            onInput: (v) => {
              targets[key] = Number(v) || 0
              syncDerived()
              queueSave()
            },
          }),
        })

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

      const choiceRow = (selected, title, subtitle, onclick) =>
        listRow({
          title,
          subtitle,
          onclick,
          right: selected ? icon('check', { size: 20 }) : null,
          dim: !selected,
        })

      const activityCard = h('div')
      function paintActivity() {
        activityCard.replaceChildren(
          card(
            ACTIVITY_LEVELS.map((level) =>
              choiceRow(profile.activity === level.value, level.label, level.description, () => {
                profile.activity = level.value
                queueProfileSave()
                paintActivity()
                paintCalc()
              })
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
          repaint(
            calcBlock,
            notice(
              profile.sex === 'unspecified'
                ? 'The standard formula needs sex as one of its terms, so there is nothing to ' +
                    'calculate here. Set the targets above by hand instead — they work exactly ' +
                    'the same once they are set.'
                : 'Fill in sex, birth year, height, a weigh-in and an activity level and a ' +
                    'suggested target appears here. Or skip it and type the targets above.'
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
          h('div', { class: 'section-label' }, 'Targets'),
          h(
            'p',
            { class: 'px-0 text-[12px] leading-snug text-muted' },
            settings.targetsSource === 'calculated'
              ? 'Worked out from your profile below. Editing anything here makes them yours instead.'
              : 'Set by hand. Nothing recalculates these unless you ask it to.'
          ),
          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            labelledField({ label: 'Calories', children: kcalField }),
            derivedHint,
            floorHint,
            macroField('protein', 'Protein'),
            macroField('fat', 'Fat'),
            macroField('carbs', 'Carbs')
          ),
          h(
            'p',
            { class: 'px-0 pt-[10px] text-[12px] leading-snug text-muted' },
            'Changing a target changes today and everything after it. Days you have already ' +
              'logged keep the target they were logged against.'
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-[20px]' },
          h('div', { class: 'section-label' }, 'About you'),
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
            profile.goal === 'maintain' ? null : prefRow('How fast', rateRow)
          ),

          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            labelledField({
              label: 'Birth year',
              hint: ageFrom(profile.birthYear) ? `${ageFrom(profile.birthYear)} years old` : null,
              children: numberInput({
                value: profile.birthYear ?? '',
                placeholder: '1994',
                step: '1',
                onInput: (v) => {
                  profile.birthYear = Number(v) || null
                  queueProfileSave()
                  paintCalc()
                },
              }),
            }),
            labelledField({
              label: 'Height',
              children: heightInput({
                cm: profile.heightCm,
                units: settings.units,
                onChange: (cm) => {
                  profile.heightCm = cm
                  queueProfileSave()
                  paintCalc()
                },
              }),
            }),
            labelledField({
              label: 'Current weight',
              hint: 'Saved as today’s weigh-in — the Weight tab is the record, not a second copy.',
              children: numberInput({
                value: currentKg == null ? '' : round(kgToUnit(currentKg, weightUnit), 1),
                suffix: weightUnit,
                step: '0.1',
                onInput: (v) => {
                  const entered = Number(v)
                  if (!(entered > 0)) return
                  currentKg = unitToKg(entered, weightUnit)
                  clearTimeout(weightTimer)
                  weightTimer = setTimeout(() => putWeight(todayStr(), currentKg), 600)
                  paintCalc()
                },
              }),
            })
          ),

          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'How active are you'),
            activityCard
          ),

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
          h('div', { class: 'section-label' }, 'Foods'),
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
          h('div', { class: 'section-label' }, 'Preferences'),
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

        h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Data'),
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
            })
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
          )
        )
      )
    },
    { watch: [], watchDate: false }
  )
}
