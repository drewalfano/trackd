import { h, repaint } from '../lib/dom.js'
import { createScreen } from '../lib/screen.js'
import { getSettings, saveSettings, listFoods, listWeights } from '../lib/db.js'
import { kcalFromMacros } from '../lib/compute.js'
import { belowFloor, canCalculate, computeTargets } from '../lib/targets.js'
import { card, listRow, valueRow, numberInput, notice } from '../lib/ui.js'
import { pluralize } from '../lib/format.js'
import { navigate } from '../router.js'
import { getAiKey } from '../lib/aiKey.js'
import { VERSION } from '../config.js'
// TEMPORARY — see the Preview onboarding section at the bottom of this file.
import { openOnboardingOverlay } from './onboarding.js'

/**
 * Settings root: the targets, and a door onto everything else.
 *
 * The split is by frequency of use rather than by category. Targets are the
 * reason this screen gets opened, so they stay here and stay editable in
 * place. Everything else is set once and then left — units, a key, an export,
 * the body stats that feed the suggestion — and one tap is the right price for
 * a thing you touch twice a year.
 *
 * The subpages are hash routes under `settings/`, which is not cosmetic:
 * `syncTabs` in main.js reads `path.split('/')[0]`, so nesting them here keeps
 * the Settings tab lit without the special case `foods` needs.
 */

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1)

export function settingsScreen() {
  return createScreen(
    async ({ rerender }) => {
      const settings = await getSettings()
      const [foods, weights] = await Promise.all([listFoods(), listWeights()])

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
       * Said once, under the card, and never again. A target below the floor
       * is accepted — this is the user's tool and they may have a reason — but
       * it should not pass without the app having mentioned it.
       *
       * `empty:hidden` because it usually is: an empty flex child still spends
       * a full 10px gap under the card it is not saying anything about.
       */
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
       *
       * The historical-days rule lives in `saveSettings`, not here: today gets
       * re-stamped, days already logged keep what they were logged against.
       */
      function queueSave() {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          saveSettings({ targets, targetsSource: 'manual' })
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

      /* ------------------------------------------------------ the doors */

      // Enough of the suggestion to say whether there is one, without opening
      // the screen that works it out.
      const suggestion = canCalculate(settings.profile, weights.at(-1)?.kg ?? null)
        ? `${computeTargets(settings.profile, { weightKg: weights.at(-1).kg }).kcal} cal from your profile`
        : 'Needs a few body stats'

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
              ? 'Worked out from your profile. Editing anything here makes them yours instead.'
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
          derivedHint
        ),

        h(
          'section',
          {},
          card(
            listRow({
              // Named for what is inside it, not for what it produces — the
              // subtitle is already carrying the output.
              title: 'About you',
              subtitle: suggestion,
              chevron: true,
              onclick: () => navigate('settings/target'),
            }),
            listRow({
              title: 'Foods',
              subtitle: pluralize(foods.length, 'food'),
              chevron: true,
              onclick: () => navigate('foods'),
            }),
            listRow({
              title: 'Preferences',
              subtitle: `${capitalise(settings.units)} · ${capitalise(settings.theme)}`,
              chevron: true,
              onclick: () => navigate('settings/preferences'),
            }),
            listRow({
              title: 'AI Describe',
              subtitle: getAiKey() ? 'Key saved' : 'No key',
              chevron: true,
              onclick: () => navigate('settings/ai'),
            }),
            listRow({
              title: 'Data',
              chevron: true,
              onclick: () => navigate('settings/data'),
            }),
            listRow({
              title: 'About',
              right: h('span', { class: 'text-[12px] text-muted' }, VERSION),
              chevron: true,
              onclick: () => navigate('settings/about'),
            })
          )
        ),

        /* ---------------------------------------------------------------- *
         * TEMPORARY: Preview onboarding. Delete this section, the import at
         * the top of this file, and nothing else.
         *
         * Kept at the root and in a card of its own rather than tucked into
         * About, so that removing it is one contiguous block and cannot take a
         * neighbour with it. It is scaffolding for reviewing the first-run
         * flow, not a feature, and it is going.
         *
         * Runs as a preview: blank draft, nothing written unless the last step
         * is taken deliberately, so walking through it cannot cost someone the
         * profile they already have.
         * ---------------------------------------------------------------- */
        h(
          'section',
          {},
          card(
            listRow({
              title: 'Preview onboarding',
              subtitle: 'The first-run flow, full screen, as a new person sees it',
              chevron: true,
              onclick: () => openOnboardingOverlay({ preview: true }).then(rerender),
            })
          )
        )
      )
    },
    { watch: [], watchDate: false }
  )
}
