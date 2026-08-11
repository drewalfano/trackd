import { h } from './dom.js'
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
      // Clears the floating tab bar, tracking its shared geometry.
      //
      // pointer-events-none is load-bearing. This host spans the full width and
      // sits above the tab bar, and its bottom padding overlaps the add button;
      // without it the first toast permanently swallows every tap on the tab
      // bar. Individual toasts opt back in.
      class:
        'pointer-events-none screen-floor z-[80] items-center ' +
        'gap-[10px] px-[20px]',
      style: { paddingBottom: 'calc(var(--nav-height) + var(--nav-inset) + 10px)' },
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
 * A message row, and — when there is something to press — a control row under it.
 *
 * What this replaces was one row holding all three: message, labelled button,
 * circle. That left the message **165px of a 335px toast**, so
 * `Logged Grilled Chicken Breast` — a completely ordinary entry — wrapped to two
 * lines. Giving row one to the message alone takes that to **295**, and 295 is
 * not an improvement so much as the ceiling: a line at full inner width is the
 * widest a single line can ever be in this toast. Anything still wrapping after
 * this is wider than the container and cannot be fixed by moving things around.
 *
 * **Both controls are 44 and neither needs `.tap-44`.** The row's height comes
 * from the button either way, so a 44px circle beside it is free — it was drawn
 * at 28 first, which cost the same height and bought only a smaller target. What
 * separates them is width: 241 against 44, which is the shape of a primary
 * action with a close beside it and does the hierarchy without a size trick.
 *
 * A 50/50 split of that row was drawn and rejected. Equal width asserts equal
 * weight, and the two are not equal — Undo is the only one with a consequence,
 * where dismissing is what the five-second timeout already does for free.
 *
 * **The X is 44 in both rows.** It shipped once at 28 in the message row and
 * that was wrong — see the note on the button. The size does not follow the row
 * it lands in; it follows the control, which is the same control doing the same
 * job in both.
 *
 * Heights at 375pt: **84px with no action**, **115px with one**, and **136px**
 * when the message wraps anyway.
 *
 * **The no-action toast is the one that got more expensive**, from the 67 the
 * old single-row version measured to 84, and it is the shape most of the app's
 * toasts take. That is the price of the circle being one size, and it was taken
 * deliberately rather than absorbed: the alternative was a sole control drawn
 * smaller than the same control elsewhere.
 *
 * One thing the bigger circle buys back. A two-line message is 42px, still under
 * the circle's 44, so on a no-action toast the message can wrap for free — the
 * box does not grow. `Could not copy. Screenshot it instead.` is the only string
 * in the app that this moved onto two lines, and it costs nothing.
 */
export function toast(message, { action, onAction, actionDismisses = false, duration = 5000 } = {}) {
  /**
   * A real close target, rather than dismissing on a tap anywhere.
   *
   * Tap-the-whole-surface is the tidier rule and it is wrong here. A toast
   * lives at the bottom of the screen, directly over where a thumb rests, and
   * the thing it is covering is the thing you just changed — so a stray tap is
   * likely, and on an Undo toast a stray tap would destroy the undo. That is
   * the one interaction in the app where being careless costs you a recovery
   * you were explicitly offered.
   *
   * So the glyph earns its pixels: dismissal becomes deliberate, and Undo can
   * never be lost to a mis-tap. Drawn on every toast that does not already
   * carry its own way out — the rule being fought for is that a toast is never
   * without a visible dismissal, not that it always has this exact circle, and
   * a second one next to "Got it" makes the first less trusted, not more.
   *
   * **44 in both rows, and it needs no `.tap-44` because 44 is what it is.**
   *
   * It was drawn at 28 in the message row for one version, on the precedent
   * `.icon-btn-sm` sets — a full circle next to type reads as a second button
   * rather than as something the row owns. That precedent does not reach this
   * case and the version that shipped it was wrong. `.icon-btn-sm` sits among
   * other controls on a busy row; here, with no action, the circle is the ONLY
   * control on the toast, and drawing the sole control as the smaller of its two
   * variants is backwards. One control doing one job is one size.
   *
   * The cost is honest and is paid on the common toast: once the circle is
   * taller than the 21px line box it sets the row height, so `Saved` goes from
   * 68px to **84px**. There is no arrangement that avoids that — absolutely
   * positioning the circle only moves the overflow somewhere worse.
   *
   * The fill is `.16`, the same as the action button's. Drawn lighter first, at
   * `.10`, so the circle would sit behind Undo rather than beside it — and at
   * matched heights that read as a control someone had greyed out rather than as
   * a quieter one. Same weight, different width, is the version that looks right.
   */
  const dismissBtn = actionDismisses
    ? null
    : h(
        'button',
        {
          class: 'flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full',
          style: { background: 'color-mix(in srgb, currentColor 16%, transparent)' },
          'aria-label': 'Dismiss',
          onclick: () => dismiss(),
        },
        icon('close', { size: 16, stroke: 2.25 })
      )

  /**
   * The action, taking what is left of the control row.
   *
   * `flex-1`, not `w-full`: it shares the row with the dismiss circle, and a
   * full-width button beside a 44px sibling overflows the row rather than
   * splitting it. 241 × 44 at 375pt.
   *
   * No `.tap-44` — it is past the floor on both axes already, and a class that
   * changes nothing is a thing someone has to explain later.
   */
  const actionBtn = action
    ? h(
        'button',
        {
          class:
            'flex h-[44px] min-w-0 flex-1 items-center justify-center gap-[6px] ' +
            'rounded-full text-[14px] font-semibold',
          style: { background: 'color-mix(in srgb, currentColor 16%, transparent)' },
          onclick: () => {
            dismiss()
            onAction?.()
          },
        },
        // Trailing, where the circle it replaced was, and where a close on this
        // app already lives — every sheet's X is the last thing on its header
        // row. Leading is right for the undo arrow, which is a verb the label
        // completes: the glyph says what happens and the word says to what. An X
        // is not a verb. It is the exit, and the exit goes at the end.
        //
        // Same 16 at 2.25 the circle draws, so an X means one thing on a toast
        // however it is labelled.
        ...(actionDismisses
          ? [action, icon('close', { size: 16, stroke: 2.25 })]
          : [icon('undo', { size: 16 }), action])
      )
    : null

  const el = h(
    'div',
    {
      class:
        'toast toast-in pointer-events-auto flex w-full max-w-[430px] flex-col ' +
        'gap-[10px] rounded-[24px] bg-ink p-[20px] text-canvas',
    },
    /**
     * The message row. It holds the dismiss circle ONLY when there is no control
     * row for it to live in — that is the whole conditional, and it is why the
     * message gets the full 295 in the case that needed it.
     *
     * `items-center` rather than `items-start`, which only shows on a message
     * long enough to wrap. On one line the two are identical; on two, centring is
     * what this app's own sheet headers do with the same pair of a title and an
     * X, and pinning the circle to the first line's top would need an optical
     * nudge to sit against a 21px line box anyway.
     */
    h(
      'div',
      { class: 'flex items-center gap-[10px]' },
      h('span', { class: 'min-w-0 flex-1 text-[14px] font-medium' }, message),
      action ? null : dismissBtn
    ),
    /**
     * The control row. `actionDismisses` leaves `dismissBtn` null, so the "Got
     * it" button takes the whole row on its own — which is right, because that
     * flag means the labelled button IS the way out and a circle beside it would
     * be a second one.
     */
    actionBtn && h('div', { class: 'flex items-center gap-[10px]' }, actionBtn, dismissBtn)
  )

  let timer = null
  const dismiss = () => {
    clearTimeout(timer)
    open.delete(dismiss)
    if (!el.isConnected) return
    /**
     * The box collapses with the fade rather than after it.
     *
     * It used to hold its full height for the whole 160ms and then vanish on the
     * frame `remove()` ran, so a survivor sitting above it stayed put through
     * the fade and then dropped by a toast height plus the gap. That jump is the
     * last thing that happens after a delete, and a jump at the end reads as a
     * glitch rather than as a queue draining.
     *
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
          class: 'w-full max-w-[380px] rounded-[24px] border border-outline bg-canvas p-[20px]',
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
