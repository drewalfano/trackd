import { h, swipeAway, paintedTranslate } from './dom.js'
import { icon } from './icons.js'

/**
 * Toasts, including the undo path after a delete.
 *
 * Note what is missing: colour. Red belongs to carbs, so a destructive
 * confirmation is ink and grey like everything else. Spec 7.
 */

let host = null

function getHost() {
  if (!host) {
    host = h('div', {
      // The bottom inset moved to `.toast-host` in styles.css, because it is not
      // one number: a toast clears the tab bar when the tab bar is there, and
      // sits on the bottom edge when a sheet has covered it. See the rule.
      //
      // pointer-events-none is load-bearing. This host spans the full width and
      // sits above the tab bar, and its bottom padding overlaps the add button;
      // without it the first toast permanently swallows every tap on the tab
      // bar. Individual toasts opt back in.
      class:
        'toast-host pointer-events-none screen-floor z-[80] items-center ' +
        'gap-[10px] px-[20px]',
      role: 'status',
      'aria-live': 'polite',
    })
    document.body.appendChild(host)
  }
  return host
}

/**
 * How many toasts may be on screen at once.
 *
 * They stack upward from the tab bar, over the bottom of whatever screen you
 * are on, and three of them reach halfway up a phone — deleting a few entries
 * in a row buried Today's Quick add rail completely. Two is the smallest cap
 * that does not cost anything real: the case that produces more than one toast
 * is a burst of the same action, and each carries its own Undo, so collapsing
 * to a single toast would silently throw away the ability to undo all but the
 * last.
 *
 * Over the cap the OLDEST goes, not the newest. The newest is the one whose
 * consequence you are still looking for, and the oldest has had the longest to
 * be read and undone.
 */
const MAX_VISIBLE = 2

/** Live toasts, oldest first, so the cap and Escape both have something to act on. */
const open = new Set()

/**
 * Escape clears everything.
 *
 * The tap is the real dismissal and works with a thumb; this is the same
 * affordance for a keyboard, which otherwise has no way past a toast at all.
 * Registered once, on first use, and never removed — the app is a single page
 * and the listener is idle whenever the set is empty.
 */
let escBound = false
function bindEscape() {
  if (escBound) return
  escBound = true
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !open.size) return
    for (const fn of [...open]) fn()
  })
}

/**
 * `actionDismisses` says the labelled button IS the way out.
 *
 * An Undo toast has two different jobs on it — take the recovery, or decline it
 * — so it draws two controls. A toast that is only telling you something has
 * one job, and "Got it" is it. Drawing the bare circle beside it put two
 * buttons on the same toast that did the same thing, with the toast's only
 * emphasised control spending its weight on a choice that was not there.
 *
 * One flag rather than two options, because both of the things it changes
 * follow from the same fact: the button gets the close glyph instead of the
 * undo arrow, and the circle is not drawn at all.
 */
/**
 * ONE ROW: the message, and the action if there is one.
 *
 * What this replaces was two rows and a circle — a message row, then a control
 * row holding a full-width Undo beside a 44px X. It measured **115px** with an
 * action and **84px** without, on a box that exists for five seconds over the
 * bottom of whatever you were just looking at.
 *
 * The two rows were bought for a specific reason and the reason does not survive
 * being measured. Row one was given to the message alone so a name like
 * `Grilled Chicken Breast, 180g` would have the full 295px and not wrap.
 *
 * That name does wrap here, and the wrap costs **6px**: the line box goes 21 to
 * 42, the action holds the row at 36, so the taller of the two wins and the
 * toast goes 60 to 66. The old shape spent ~50px making sure it never happened.
 * Paying fifty to avoid six is the whole of the change.
 *
 * The X is gone with it. It existed so the toast could be dismissed early, and
 * it was the app's only control drawn at 44px purely so it would not look
 * smaller than itself elsewhere — the note that used to be here admitted it
 * cost 17px on the commonest toast in the app and took that deliberately. Early
 * dismissal is now the swipe, which costs no pixels at all.
 *
 * **The one thing the X was genuinely protecting is still protected.** A toast
 * sits where a thumb rests, and the thing it covers is the thing you just
 * changed, so a stray tap is likely — and on an Undo toast a stray tap that
 * dismissed would destroy the recovery you were just offered. There is still no
 * tap-to-dismiss surface. The only tappable thing on a toast is its action, and
 * a swipe is a deliberate gesture that a resting thumb does not perform.
 *
 * The action is a 36px pill rather than a 44px full-width bar. It keeps its fill
 * so it still reads as a control, at a size proportional to a message that is
 * leaving on its own in five seconds — a full-width filled button is the shape
 * of a primary action, and Undo is an offer, not an instruction.
 *
 * Measured at 375pt: **60px with an action, 45px without, 66px when the message
 * wraps.** Against 115 and 84 before, and the old two-row shape was 115 whether
 * the message wrapped or not.
 */
export function toast(message, { action, onAction, actionDismisses = false, duration = 5000 } = {}) {
  /**
   * The action, and the only thing on a toast you can tap.
   *
   * `shrink-0` so the message yields to it rather than the other way round: the
   * label is two known words and the message is arbitrary, so the message is the
   * one that should wrap. `min-w-0` on the message is what allows that — without
   * it a long word refuses to go under its own content width and pushes the pill
   * off the end.
   */
  const actionBtn = action
    ? h(
        'button',
        {
          class:
            'toast-act flex h-[36px] shrink-0 items-center gap-[6px] rounded-full ' +
            'px-[16px] text-[13px] font-semibold',
          style: { background: 'color-mix(in srgb, currentColor 16%, transparent)' },
          onclick: () => {
            dismiss()
            onAction?.()
          },
        },
        // Leading for the undo arrow, which is a verb the label completes: the
        // glyph says what happens and the word says to what. Trailing for the X,
        // because an X is not a verb — it is the exit, and the exit goes last.
        ...(actionDismisses
          ? [action, icon('close', { size: 16, stroke: 2.25 })]
          : [icon('undo', { size: 16 }), action])
      )
    : null

  const el = h(
    'div',
    {
      class:
        'toast toast-in pointer-events-auto flex w-full max-w-[430px] items-center ' +
        'gap-[12px] rounded-[24px] bg-ink py-[12px] pl-[20px] text-canvas ' +
        // 12 behind the pill because the pill's own fill carries the edge; 20
        // when there is nothing there, so a message-only toast is padded evenly.
        (actionBtn ? 'pr-[12px]' : 'pr-[20px]'),
    },
    h('span', { class: 'min-w-0 flex-1 text-[14px] font-medium' }, message),
    actionBtn
  )

  let timer = null
  const dismiss = () => {
    clearTimeout(timer)
    open.delete(dismiss)
    if (!el.isConnected) return
    /**
     * TWO EXITS, and which one runs is decided by whether anything is left.
     *
     * The collapse exists for exactly one reason: a survivor sitting above this
     * toast would otherwise hold still through the fade and then drop by a toast
     * height plus the gap on the frame `remove()` ran. A jump at the end reads as
     * a glitch rather than as a queue draining.
     *
     * **That reason does not exist when this is the last toast on screen**, and
     * that is the common case — most of all on Undo, where you tapped the one
     * control on the one toast that was up. Folding a box shut when there is
     * nothing above it to protect is an accordion played at the moment the user
     * has already got what they asked for: the undo has happened, and the toast
     * is still on screen taking 160ms to concertina. It leaves instead, on the
     * reverse of the way it arrived — `toast-in` comes up 12px, so this goes back
     * down 12 and fades.
     *
     * `open` has already had this dismissal deleted from it by the line above, so
     * its size is what will be left, not what was there.
     */
    if (open.size === 0) {
      /**
       * Written inline rather than left to the stylesheet, because a swipe has
       * already put an inline transform and opacity on this element and inline
       * wins. A rule that said `translateY(12px)` would haul a toast the finger
       * had dragged to 60 back UP before fading it.
       *
       * So the exit is relative: wherever it is now, 12 further in the direction
       * it was already going. A tapped toast starts at 0 and drifts 12 — the
       * reverse of `toast-in` — and a swiped one carries on out.
       */
      const { y } = paintedTranslate(el)
      el.dataset.removing = 'solo'
      el.style.transition =
        'opacity var(--dur-fast) ease-in, transform var(--dur-fast) ease-in'
      void el.offsetHeight
      el.style.transform = `translateY(${y + 12}px)`
      el.style.opacity = '0'
      setTimeout(() => el.remove(), 170)
      return
    }
    /**
     * Measured, written, reflowed, then zeroed — `height: auto` does not
     * interpolate, and a `requestAnimationFrame` here is not a substitute. The
     * long form of that argument is at `entryRow`, which leaves a list the same
     * way for the same reason.
     */
    el.style.height = `${el.offsetHeight}px`
    el.dataset.removing = 'true'
    void el.offsetHeight
    el.style.height = '0px'
    setTimeout(() => el.remove(), 170)
  }

  // Before appending, so the cap counts what will be on screen rather than one
  // frame of three.
  while (open.size >= MAX_VISIBLE) {
    const oldest = open.values().next().value
    oldest()
  }

  open.add(dismiss)
  bindEscape()
  getHost().appendChild(el)
  timer = setTimeout(dismiss, duration)

  /**
   * The gesture that replaced the X.
   *
   * Wired here rather than beside `el`, because it needs `dismiss` — which needs
   * `el` — and the pause needs `timer`. All three exist by this line.
   *
   * The hold is the point of `onHold`/`onRelease`: a finger on the toast stops
   * the clock, and letting go without committing starts a full fresh five
   * seconds rather than resuming a partly spent one. Resuming would mean a toast
   * you deliberately grabbed could still vanish a few hundred milliseconds
   * later, which is the behaviour the pause exists to prevent.
   */
  swipeAway(el, {
    onDismiss: dismiss,
    onHold: () => clearTimeout(timer),
    onRelease: () => {
      timer = setTimeout(dismiss, duration)
    },
  })

  return dismiss
}

/**
 * Blocking confirm. Used for deletes and other one-way doors.
 * `destructive` changes the wording weight, not the colour.
 */
export function confirm(
  { title, message, confirmLabel = 'Delete', cancelLabel = 'Cancel', requireText = null } = {}
) {
  return new Promise((resolve) => {
    let input = null

    const close = (result) => {
      scrim.dataset.closing = 'true'
      setTimeout(() => scrim.remove(), 200)
      document.removeEventListener('keydown', onKey)
      resolve(result)
    }

    const onKey = (e) => {
      if (e.key === 'Escape') close(false)
    }

    const confirmBtn = h(
      'button',
      {
        class: 'btn-primary',
        disabled: !!requireText,
        onclick: () => close(true),
      },
      confirmLabel
    )

    const scrim = h(
      'div',
      {
        class:
          'sheet-scrim screen-cover z-[90] flex items-center justify-center bg-black/40 px-[20px] backdrop-blur-[2px]',
        onclick: (e) => {
          if (e.target === scrim) close(false)
        },
      },
      h(
        'div',
        {
          // `confirm-in`, because the box used to arrive at full size on frame
          // one while the scrim was still fading in behind it — the app's one
          // blocking dialog turning up ahead of its own backdrop. See the rule.
          class:
            'confirm-in w-full max-w-[380px] rounded-[24px] border border-outline bg-canvas p-[20px]',
          role: 'alertdialog',
          'aria-modal': 'true',
        },
        h('h2', { class: 'text-[20px] font-semibold' }, title),
        message && h('p', { class: 'mt-[10px] text-[14px] leading-snug text-muted' }, message),
        requireText &&
          h(
            'div',
            { class: 'mt-[20px]' },
            h('p', { class: 'mb-[10px] text-[14px] text-muted' }, `Type ${requireText} to confirm.`),
            h('input', {
              class: 'field text-[16px] font-semibold',
              autocapitalize: 'characters',
              autocomplete: 'off',
              ref: (el) => (input = el),
              oninput: () => {
                confirmBtn.disabled = input.value.trim().toUpperCase() !== requireText.toUpperCase()
              },
            })
          ),
        h(
          'div',
          { class: 'mt-[20px] flex flex-col gap-[10px]' },
          confirmBtn,
          h('button', { class: 'btn-secondary', onclick: () => close(false) }, cancelLabel)
        )
      )
    )

    document.body.appendChild(scrim)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => input?.focus())
  })
}
