import { h, repaint } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { openSheet } from '../lib/sheet.js'
import { toast } from '../lib/toast.js'
import { getSettings, saveSettings, saveProfile, listWeights, putWeight } from '../lib/db.js'
import {
  ACTIVITY_LEVELS,
  GOALS,
  RATE_PRESETS,
  activityFactor,
  ageFrom,
  canCalculate,
  computeTargets,
  describeRate,
} from '../lib/targets.js'
import {
  card,
  listRow,
  valueRow,
  segmentedWide,
  numberInput,
  heightInput,
  notice,
} from '../lib/ui.js'
import { round, kgToUnit, unitToKg } from '../lib/format.js'
import { todayStr, dayPhrase } from '../lib/dates.js'
import { navigate } from '../router.js'
import { settingsPage, prefRow } from './settingsPages.js'

/**
 * Everything that exists only to produce a suggested target, on the screen
 * that produces it.
 *
 * Sex, birth year, height, weight and activity level have no independent
 * function in this app — nothing else reads them. At the Settings root they
 * sat at the same weight as the targets themselves, two screens away from the
 * only number they feed. Here they are the inputs to the thing directly below
 * them, which is what they always were.
 *
 * **On screen this is "About you"; in here it is the target suggester.** The
 * title names what you find inside, because "Suggest a target" described the
 * output and left the contents to be guessed at — and the row's subtitle is
 * already carrying that output. The module keeps the purpose in its name
 * because that is the thing worth knowing while editing it.
 *
 * The route stays `settings/target` for the same reason: `settings/about` is
 * the actual About page, and two routes a hyphen apart would be a trap.
 */

/**
 * Four rows and eleven lines of description, for a question asked once.
 *
 * The descriptions are the reason anyone can answer it, which is why this
 * cannot collapse into a segmented control — so the list moves behind a row
 * and keeps them.
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

/**
 * `a`, `a and b`, `a, b and c`. No serial comma, matching the app's own copy —
 * "Protein, fat and carbs work out to…" is the line this echoes.
 */
function listOut(items) {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}

export function suggestTargetScreen() {
  return createScreen(
    async ({ rerender }) => {
      const settings = await getSettings()
      const weights = await listWeights()

      const profile = { ...settings.profile }
      const weightUnit = settings.weightUnit
      /**
       * The seed is the most recent weigh-in of ANY date, not today's.
       *
       * That is deliberate and it is the only sensible reading: almost nobody
       * weighs daily, and the calculator needs a weight or it has nothing to
       * say. Blanking the field on every day you did not step on the scales
       * would take the suggestion away from the majority of days.
       *
       * What was wrong was saying nothing about it. The field is seeded from
       * one day and writes to another, under a label that claims to be current,
       * so the note under the card names the day the number came from until
       * that day is today.
       */
      const latestWeighIn = weights.at(-1) ?? null
      let currentKg = latestWeighIn?.kg ?? null
      let weighInDate = latestWeighIn?.date ?? null
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

      /**
       * The one field where a plausible typo is silent: 1949 for 1994 moves the
       * suggestion by a couple of hundred calories and looks like a year either
       * way. The age is the read-back, so it follows the keystrokes rather than
       * waiting for a rebuild this screen deliberately never does.
       *
       * Appended to the field rather than passed as its suffix: `numberInput`
       * builds no span for an empty suffix, and there would then be nothing to
       * write the age into on the first year typed.
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
       * What the weight field is showing, and where it will go.
       *
       * Two facts, and which two depends on the day. Where it goes is constant
       * and non-obvious enough to say every time — this field writes into the
       * Weight tab's record rather than keeping a copy. Where it came FROM only
       * needs saying while those are different days, which is why this repaints
       * rather than being written once into the tree.
       */
      const weighInNote = h('p', { class: 'px-0 text-[12px] leading-snug text-muted' })

      function syncWeighInNote() {
        const stale = weighInDate && weighInDate !== todayStr()
        weighInNote.textContent = stale
          ? `Showing your weigh-in from ${dayPhrase(weighInDate)}. Editing it saves a new one ` +
            'for today. The Weight tab is the record, not a second copy.'
          : 'Weight is saved as today’s weigh-in. The Weight tab is the record, not a second copy.'
      }
      syncWeighInNote()

      /** Repaints only the calculated block, so typing does not lose focus. */
      const calcBlock = h('div', { class: 'flex flex-col gap-[10px]' })

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
                  onclick: () => activitySheet(profile.activity).then((v) => v && choose(v)),
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
           * Naming what is still missing, rather than restating the whole
           * requirement every time. Four lines explaining it is a paragraph
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
                ? 'The formula needs sex as one of its terms, so set the targets by hand instead.'
                : `Needs ${listOut(missing)}.`
            )
          )
          return
        }

        const calc = computeTargets(profile, { weightKg: currentKg })
        const same = ['kcal', 'protein', 'fat', 'carbs'].every(
          (k) => Math.round(settings.targets[k]) === calc[k]
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
                    // Back to where the numbers live, so the change is visible
                    // on arrival rather than announced on the screen leaving.
                    navigate('settings')
                    toast('Targets updated')
                  },
                },
                'Use this as my target'
              )
        )
      }
      paintCalc()

      return settingsPage(
        'About you',
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
          /**
           * "How fast" was a question with its subject missing, and the
           * sentence that supplied it — "How fast do you want to lose weight" —
           * ran 273px into a 310px row, between siblings reading "Sex" and
           * "Goal". A noun phrase names the thing outright and never dangles.
           *
           * The maintain branch never renders, which is why this can index the
           * goal directly rather than defending against a third case.
           */
          profile.goal === 'maintain'
            ? null
            : prefRow(`Weight ${profile.goal === 'lose' ? 'loss' : 'gain'} rate`, rateRow),
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
                // The number on screen is now today's, whatever day it arrived
                // from, so the note stops dating it.
                weighInDate = todayStr()
                syncWeighInNote()
                clearTimeout(weightTimer)
                weightTimer = setTimeout(() => putWeight(todayStr(), currentKg), 600)
                paintCalc()
              },
            })
          )
        ),

        weighInNote,

        activityCard,

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Suggested target'),
          calcBlock
        )
      )
    },
    { watch: [], watchDate: false }
  )
}
