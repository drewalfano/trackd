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
export function toast(message, { action, onAction, actionDismisses = false, duration = 5000 } = {}) {
  const el = h(
    'div',
    {
      class:
        'toast-in pointer-events-auto flex w-full max-w-[430px] items-center ' +
        'gap-[10px] rounded-[24px] bg-ink py-[15px] pl-[20px] pr-[10px] text-canvas',
    },
    h('span', { class: 'flex-1 text-[15px] font-medium' }, message),
    action &&
      h(
        'button',
        {
          class: 'flex shrink-0 items-center gap-[6px] rounded-full px-[14px] py-[8px] text-[14px] font-bold',
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
      ),
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
     */
    !actionDismisses &&
      h(
        'button',
        {
          class: 'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full',
          style: { background: 'color-mix(in srgb, currentColor 12%, transparent)' },
          'aria-label': 'Dismiss',
          onclick: () => dismiss(),
        },
        icon('close', { size: 16, stroke: 2.25 })
      )
  )

  let timer = null
  const dismiss = () => {
    clearTimeout(timer)
    open.delete(dismiss)
    if (!el.isConnected) return
    el.style.transition = 'opacity 160ms ease-in'
    el.style.opacity = '0'
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
        h('h2', { class: 'text-[20px] font-bold' }, title),
        message && h('p', { class: 'mt-[10px] text-[15px] leading-snug text-muted' }, message),
        requireText &&
          h(
            'div',
            { class: 'mt-[20px]' },
            h('p', { class: 'mb-[10px] text-[14px] text-muted' }, `Type ${requireText} to confirm.`),
            h('input', {
              class: 'field text-[17px] font-semibold',
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
