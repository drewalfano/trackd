import { h, repaint, mount } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { toast } from '../lib/toast.js'
import { getSettings, saveSettings, putWeight, listWeights } from '../lib/db.js'
import { kcalFromMacros } from '../lib/compute.js'
import {
  ACTIVITY_LEVELS,
  GOALS,
  RATE_PRESETS,
  ageFrom,
  belowFloor,
  computeTargets,
  describeRate,
} from '../lib/targets.js'
import {
  card,
  listRow,
  segmentedWide,
  numberInput,
  heightInput,
  labelledField,
  notice,
} from '../lib/ui.js'
import { kgToUnit, unitToKg, round, weightUnitFor } from '../lib/format.js'
import { todayStr } from '../lib/dates.js'

/**
 * Onboarding — the first screen anyone ever sees.
 *
 * Full screen, not a sheet. A sheet implies something behind it that you could
 * dismiss back to, and on first launch there is nothing behind it: an empty
 * dashboard reading 0 / 2837 against a target nobody set. The first run has to
 * own the whole viewport or it is showing the user a meaningless app and asking
 * them to ignore it.
 *
 * Which means this owns its own chrome — progress, back, and a pinned action —
 * rather than borrowing the sheet's. It is mounted two ways and the difference
 * is only where: straight into `#app` before the shell exists at first launch,
 * or as a fixed overlay above a running app for the Settings preview.
 *
 * Owning the chrome does not mean owning the only way back. Every step is a
 * history entry, so the phone's back gesture walks the flow exactly as the
 * chevron does — see `go` and `onPop` below.
 *
 * Nothing is written until the last step. Every screen before it edits a draft,
 * so leaving at any point costs nothing — which matters most for the preview,
 * reachable by someone who already has a profile worth not destroying.
 */

const STEP_COUNT = 5

/** Marks the history entries this flow owns, the way the sheet marks its own. */
const HISTORY_KEY = 'mt-onboarding'

/* ------------------------------------------------------------------- steps */

function unitsStep(draft, { repaintStep }) {
  const row = h('div')
  const paint = () => {
    repaint(
      row,
      segmentedWide({
        options: [
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ],
        value: draft.units,
        onChange: (v) => {
          draft.units = v
          draft.weightUnit = weightUnitFor(v)
          paint()
        },
      })
    )
  }
  paint()

  return {
    title: 'Units',
    lede: 'How would you like weights and heights shown?',
    node: h(
      'div',
      { class: 'flex flex-col gap-[20px]' },
      row,
      notice(
        'This only changes what you see. Everything is stored the same way underneath, so ' +
          'switching later never converts or loses anything.'
      )
    ),
  }
}

function bodyStep(draft) {
  const sexRow = h('div')
  const note = h('div')

  const paintNote = () =>
    repaint(
      note,
      draft.sex === 'unspecified'
        ? notice(
            'The standard formula needs sex as one of its terms, so there is nothing to ' +
              'calculate from. You can set your targets by hand at the end — they work exactly ' +
              'the same once they are set.'
          )
        : null
    )

  const paintSex = () => {
    repaint(
      sexRow,
      segmentedWide({
        options: [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
          { value: 'unspecified', label: 'Rather not' },
        ],
        value: draft.sex,
        onChange: (v) => {
          draft.sex = v
          paintSex()
          paintNote()
        },
      })
    )
  }
  paintSex()
  paintNote()

  const ageHint = h('div', { class: 'px-0 text-[12px] text-muted' })
  const syncAge = () => {
    const age = ageFrom(draft.birthYear)
    ageHint.textContent = age ? `${age} years old` : ''
  }
  syncAge()

  return {
    title: 'About you',
    lede: 'Only used to suggest a target, and only on this device.',
    node: h(
      'div',
      { class: 'flex flex-col gap-[20px]' },
      h('div', { class: 'flex flex-col gap-[10px]' }, h('div', { class: 'section-label' }, 'Sex'), sexRow),
      note,
      labelledField({
        label: 'Birth year',
        children: numberInput({
          value: draft.birthYear ?? '',
          placeholder: '1994',
          step: '1',
          onInput: (v) => {
            draft.birthYear = Number(v) || null
            syncAge()
          },
        }),
      }),
      ageHint,
      labelledField({
        label: 'Height',
        children: heightInput({
          cm: draft.heightCm,
          units: draft.units,
          onChange: (cm) => {
            draft.heightCm = cm
          },
        }),
      }),
      labelledField({
        label: 'Current weight',
        hint: 'Saved as your first weigh-in, so the Weight tab has somewhere to start.',
        children: numberInput({
          value: draft.weightKg == null ? '' : round(kgToUnit(draft.weightKg, draft.weightUnit), 1),
          suffix: draft.weightUnit,
          step: '0.1',
          onInput: (v) => {
            draft.weightKg = v === '' ? null : unitToKg(Number(v), draft.weightUnit)
          },
        }),
      })
    ),
  }
}

function activityStep(draft) {
  const list = h('div')
  const paint = () => {
    repaint(
      list,
      card(
        ACTIVITY_LEVELS.map((level) =>
          listRow({
            title: level.label,
            subtitle: level.description,
            dim: draft.activity !== level.value,
            right: draft.activity === level.value ? icon('check', { size: 20 }) : null,
            onclick: () => {
              draft.activity = level.value
              paint()
            },
          })
        )
      )
    )
  }
  paint()

  return {
    title: 'How active are you',
    lede: 'Outside of deliberate exercise as well — a job on your feet counts.',
    node: list,
  }
}

function goalStep(draft) {
  const goalRow = h('div')
  const rateRow = h('div')

  const paintRate = () => {
    const presets = RATE_PRESETS[draft.goal] || RATE_PRESETS.maintain
    if (!presets.some((p) => p.kgPerWeek === draft.rateKgPerWeek)) {
      draft.rateKgPerWeek = presets[0].kgPerWeek
    }
    repaint(
      rateRow,
      draft.goal === 'maintain'
        ? null
        : h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-label' }, 'How fast'),
            segmentedWide({
              options: presets.map((p) => ({
                value: p.kgPerWeek,
                label: describeRate(p.kgPerWeek, draft.weightUnit),
              })),
              value: draft.rateKgPerWeek,
              onChange: (v) => {
                draft.rateKgPerWeek = v
                paintRate()
              },
            }),
            // The guardrail said once and plainly. The fastest option offered
            // is half what a weight-loss app would normally advertise, and that
            // is the product decision — not the copy.
            draft.goal === 'lose'
              ? notice(
                  'These are the only two rates offered on purpose. Faster than this mostly ' +
                    'costs muscle, and a target you can hold beats one you cannot.'
                )
              : null
          )
    )
  }

  const paintGoal = () => {
    repaint(
      goalRow,
      segmentedWide({
        options: GOALS.map((g) => ({ value: g.value, label: g.label })),
        value: draft.goal,
        onChange: (v) => {
          draft.goal = v
          paintGoal()
          paintRate()
        },
      })
    )
  }
  paintGoal()
  paintRate()

  return {
    title: 'Your goal',
    lede: 'What are you aiming for?',
    node: h('div', { class: 'flex flex-col gap-[20px]' }, goalRow, rateRow),
  }
}

function targetsStep(draft) {
  const calc = computeTargets(draft, { weightKg: draft.weightKg })
  const targets =
    draft.targets ??
    (calc
      ? { kcal: calc.kcal, protein: calc.protein, fat: calc.fat, carbs: calc.carbs }
      : { kcal: 2000, protein: 150, fat: 65, carbs: 200 })
  draft.targets = targets
  draft.calculated = Boolean(calc)

  const derived = h('div', { class: 'px-0 text-[12px] leading-snug text-muted' })
  const floorHint = h('div')

  const sync = () => {
    derived.textContent = `Protein, fat and carbs work out to ${Math.round(
      kcalFromMacros(targets)
    )} cal.`
    const floor = belowFloor(targets.kcal, draft.sex)
    repaint(
      floorHint,
      floor
        ? notice(
            `That is below ${floor} cal, which is the point where this is worth talking to ` +
              'someone about rather than typing into an app. Saved either way.',
            { iconName: 'alert' }
          )
        : null
    )
  }

  const field = (key, label, suffix) =>
    labelledField({
      label,
      children: numberInput({
        value: targets[key],
        suffix,
        onInput: (v) => {
          targets[key] = Number(v) || 0
          sync()
        },
      }),
    })

  sync()

  return {
    title: 'Your targets',
    node: h(
      'div',
      { class: 'flex flex-col gap-[20px]' },
      calc
        ? h(
            'div',
            { class: 'day-card flex flex-col gap-[10px]' },
            h(
              'div',
              { class: 'flex items-baseline gap-[10px]' },
              h('span', { class: 'tnum text-display font-semibold leading-none' }, String(calc.kcal)),
              h('span', { class: 'text-[12px] font-medium text-muted' }, 'cal a day')
            ),
            h(
              'p',
              { class: 'text-[12px] leading-snug text-muted' },
              `${calc.bmr} at rest, ${calc.maintenance} with your activity` +
                (calc.rateKgPerWeek
                  ? `, then ${calc.rateKgPerWeek < 0 ? 'less' : 'more'} for ${describeRate(
                      calc.rateKgPerWeek,
                      draft.weightUnit
                    )}.`
                  : '.')
            )
          )
        : notice(
            'Not enough to calculate from, so these are starting numbers rather than a ' +
              'suggestion. Set them to whatever you already know works.'
          ),

      calc?.floored
        ? notice(
            `The arithmetic came to ${calc.requested} cal. This stops at ${calc.floor} and will ` +
              'not calculate anyone below it.',
            { iconName: 'info' }
          )
        : null,

      h(
        'p',
        { class: 'px-0 text-[14px] leading-snug' },
        'Nothing here is locked in. Change any of it now or from Settings later — past days ' +
          'keep the target they were logged against.'
      ),

      field('kcal', 'Calories', 'cal'),
      derived,
      floorHint,
      field('protein', 'Protein', 'g'),
      field('fat', 'Fat', 'g'),
      field('carbs', 'Carbs', 'g')
    ),
  }
}

const STEPS = [unitsStep, bodyStep, activityStep, goalStep, targetsStep]

/* -------------------------------------------------------------------- view */

export async function createOnboarding({ preview = false, onDone } = {}) {
  const settings = await getSettings()
  const weights = await listWeights()

  /**
   * A brand-new person starts blank, which is also what the preview shows —
   * previewing the first run against a filled-in profile would not be the first
   * run. Re-entry that is neither of those keeps what is already known.
   */
  const draft = preview
    ? {
        units: 'metric',
        weightUnit: 'kg',
        sex: null,
        birthYear: null,
        heightCm: null,
        weightKg: null,
        activity: null,
        goal: 'maintain',
        rateKgPerWeek: 0,
        targets: null,
      }
    : {
        units: settings.units,
        weightUnit: settings.weightUnit,
        ...settings.profile,
        weightKg: weights.at(-1)?.kg ?? null,
        targets: null,
      }

  /** 0 is the welcome screen; 1..5 are the steps. */
  let index = 0

  // Back is the gesture, and the chevron is a second way to perform it — not a
  // parallel path. Both go through history, so they cannot disagree about where
  // "back" is.
  const backBtn = h(
    'button',
    { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() },
    icon('chevronLeft', { size: 20, stroke: 2 })
  )

  /**
   * "Step 2 of 5" sits where Today puts "Today, Aug 2" — centred between the
   * back chevron and a matching spacer, so the two screens orient you from the
   * same place. The bars move under it and run the full width, which is where a
   * progress bar wants to be anyway.
   *
   * Not at `text-title` though, despite that being the size Today uses there:
   * the step's own name is a 30px heading immediately below, and two of those
   * stacked is two headings arguing. The position is what carries the match.
   */
  const stepLabel = h('div', {
    class: 'min-w-0 flex-1 truncate text-center text-[16px] font-semibold',
  })
  const headerSpacer = h('div', { class: 'w-11 shrink-0' })
  const progress = h('div', { class: 'flex items-center gap-[4px]' })

  /**
   * Safe-area padding is composed into one value rather than layered as a
   * second utility class: a `padding-top` utility and a `pt-[20px]` set the same
   * property, so one silently wins and the header ends up flush against the
   * notch. This is the same `calc()` the `.screen` rule does, and the reason
   * there is a `.safe-b` utility but no `.safe-t` one to reach for.
   */
  const header = h(
    'header',
    {
      class: 'shrink-0 px-[20px]',
      style: { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 20px)' },
    },
    h(
      'div',
      { class: 'mx-auto flex max-w-[430px] flex-col gap-[15px]' },
      h(
        'div',
        { class: 'flex items-center gap-[10px]' },
        backBtn,
        stepLabel,
        headerSpacer
      ),
      progress
    )
  )

  const body = h('div', { class: 'min-h-0 flex-1 overflow-y-auto px-[20px] pt-[20px]' })
  const footer = h('div', {
    class: 'shrink-0 px-[20px] pt-[10px]',
    style: { paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' },
  })

  const root = h(
    'div',
    { class: 'flex h-svh flex-col bg-canvas' },
    header,
    body,
    footer
  )

  /**
   * How many history entries this flow has pushed at the current step.
   *
   * The overlay owns one for the welcome screen as well, so a back gesture on
   * the first screen closes the preview exactly as it closes a sheet. At first
   * launch there is nothing behind the app to return to, so step 0 pushes
   * nothing and the gesture leaves the app — which is what it does on every
   * other root screen, and the right answer for a screen with nothing behind it.
   */
  const baseDepth = preview ? 1 : 0
  const pushedDepth = () => index + baseDepth

  let finishing = false

  /**
   * Drop the entries this flow pushed, so a back gesture *after* it is done
   * does not walk into a flow that is no longer on screen — and, at first
   * launch, does not land on the welcome screen of an app that is already set
   * up. One `history.go` fires one popstate for the whole jump.
   *
   * The timeout is a floor for the case where it fires none: boot waits on this
   * promise, and a tidy back stack is worth less than an app that starts.
   */
  function unwindHistory() {
    const depth = pushedDepth()
    if (!depth) return Promise.resolve()
    return new Promise((resolve) => {
      let timer
      const done = () => {
        clearTimeout(timer)
        window.removeEventListener('popstate', done)
        resolve()
      }
      timer = setTimeout(done, 300)
      window.addEventListener('popstate', done)
      history.go(-depth)
    })
  }

  /**
   * `popped` says the browser has already walked back out of this flow, which
   * is the one path that must not unwind again — doing so would eat an entry
   * belonging to the app underneath and send Settings somewhere nobody asked
   * for.
   */
  const finish = async (save, { popped = false } = {}) => {
    if (finishing) return
    finishing = true
    window.removeEventListener('popstate', onPop)
    if (!popped) await unwindHistory()

    if (save) {
      await saveSettings({
        units: draft.units,
        weightUnit: draft.weightUnit,
        targets: { ...draft.targets },
        targetsSource: draft.calculated ? 'calculated' : 'manual',
        onboardingComplete: true,
        profile: {
          sex: draft.sex,
          birthYear: draft.birthYear,
          heightCm: draft.heightCm,
          activity: draft.activity,
          goal: draft.goal,
          rateKgPerWeek: draft.rateKgPerWeek,
        },
      })
      // The weigh-in goes to the weights store, never onto the profile — one
      // record of what someone weighs, not two that can disagree.
      if (draft.weightKg > 0) await putWeight(todayStr(), draft.weightKg)
    } else if (!preview) {
      // Skipping is allowed and must still not ask again. The app already has
      // working defaults; Settings can do all of this later.
      await saveSettings({ onboardingComplete: true })
    }
    onDone?.(Boolean(save))
  }

  function paintProgress() {
    // The count says where you are; the bars say how much is left without
    // having to do the subtraction. They are not redundant, they answer
    // different questions — which is why both stay.
    stepLabel.textContent = index === 0 ? '' : `Step ${index} of ${STEP_COUNT}`
    repaint(
      progress,
      index === 0
        ? null
        : Array.from({ length: STEP_COUNT }, (_, i) =>
            h('span', {
              class: 'h-[3px] flex-1 rounded-full',
              style: {
                background:
                  i < index ? 'var(--color-ink)' : 'color-mix(in srgb, var(--color-ink) 12%, transparent)',
              },
            })
          )
    )
    backBtn.style.visibility = index === 0 ? 'hidden' : ''
    headerSpacer.style.display = index === 0 ? 'none' : ''
  }

  /** Forward: one new entry per step, so one back gesture undoes exactly one. */
  function go(next) {
    history.pushState({ [HISTORY_KEY]: next }, '')
    render(next)
  }

  function onPop(event) {
    if (finishing) return
    const next = event.state?.[HISTORY_KEY]
    if (typeof next === 'number') {
      render(next)
      return
    }
    /**
     * Popped past the entries this flow owns. In the preview that is a back
     * gesture on the welcome screen, which closes it — the same thing the
     * scrim does for a sheet, and the reason the overlay pushes an entry for
     * step 0 at all. At first launch step 0 owns no entry, so this is the boot
     * entry being restored and the flow simply stays where it is.
     */
    if (preview) finish(false, { popped: true })
    else render(0)
  }

  function render(next) {
    index = Math.max(0, Math.min(STEPS.length, next))
    paintProgress()
    body.scrollTop = 0

    if (index === 0) {
      repaint(body, welcomeNode())
      repaint(
        footer,
        h(
          'div',
          { class: 'mx-auto flex max-w-[430px] flex-col gap-[10px]' },
          h('button', { class: 'btn-primary', onclick: () => go(1) }, 'Get started'),
          h(
            'button',
            {
              class: 'self-center px-0 py-[10px] text-[13px] font-semibold underline underline-offset-2',
              onclick: () => finish(false),
            },
            preview ? 'Close the preview' : 'Skip for now'
          )
        )
      )
      return
    }

    // A step repainting itself is not navigation, so it never touches history.
    const step = STEPS[index - 1](draft, { repaintStep: () => render(index) })
    const last = index === STEPS.length

    repaint(
      body,
      h(
        'div',
        { class: 'mx-auto flex max-w-[430px] flex-col gap-[20px] pb-[20px]' },
        h('h1', { class: 'text-title font-semibold leading-tight' }, step.title),
        step.lede ? h('p', { class: 'px-0 text-[14px] leading-snug' }, step.lede) : null,
        step.node
      )
    )

    repaint(
      footer,
      h(
        'div',
        { class: 'mx-auto flex max-w-[430px] flex-col gap-[10px]' },
        h(
          'button',
          { class: 'btn-primary', onclick: () => (last ? finish(true) : go(index + 1)) },
          last ? (preview ? 'Save these for real' : 'Start tracking') : 'Continue'
        ),
        last && preview
          ? h(
              'button',
              { class: 'btn-secondary', onclick: () => finish(false) },
              'Discard — this was a preview'
            )
          : null
      )
    )
  }

  function welcomeNode() {
    return h(
      'div',
      { class: 'mx-auto flex min-h-full max-w-[430px] flex-col justify-center gap-[20px] pb-[20px]' },
      h('h1', { class: 'text-display font-semibold leading-none' }, 'Macro Tracker'),
      h(
        'p',
        { class: 'text-[16px] leading-snug' },
        'Log what you eat, see how the week actually went. Everything stays on this device — ' +
          'no account, no upload, works with the radio off.'
      ),
      h(
        'p',
        { class: 'text-[14px] leading-snug text-muted' },
        'The next few screens work out a calorie and macro target. You can change every ' +
          'number at the end, and change it again whenever you like.'
      ),
      preview
        ? notice(
            'This is the first-run flow as a new person sees it. Nothing is saved unless you ' +
              'choose to at the end.',
            { iconName: 'info' }
          )
        : null
    )
  }

  window.addEventListener('popstate', onPop)
  // The overlay's own entry, pushed before the first paint so the flow is
  // never on screen without a history entry standing behind it.
  if (preview) history.pushState({ [HISTORY_KEY]: 0 }, '')
  render(0)
  return root
}

/**
 * Mount over a running app, for the Settings preview. Boot mounts the same view
 * straight into `#app` instead, so there is nothing behind it to cover.
 */
export async function openOnboardingOverlay({ preview = false } = {}) {
  return new Promise((resolve) => {
    const host = h('div', { class: 'fixed inset-0 z-[70] overflow-hidden' })
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    createOnboarding({
      preview,
      onDone: (saved) => {
        host.remove()
        document.body.style.overflow = previousOverflow
        if (saved) toast('Targets saved')
        resolve(saved)
      },
    }).then((view) => mount(host, view))

    document.body.appendChild(host)
  })
}
