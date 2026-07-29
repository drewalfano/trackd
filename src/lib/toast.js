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
        'pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center ' +
        'gap-[10px] px-[20px]',
      style: { paddingBottom: 'calc(var(--nav-height) + var(--nav-inset) + 10px)' },
      role: 'status',
      'aria-live': 'polite',
    })
    document.body.appendChild(host)
  }
  return host
}

export function toast(message, { action, onAction, duration = 5000 } = {}) {
  const el = h(
    'div',
    {
      class:
        'toast-in pointer-events-auto flex w-full max-w-[430px] items-center gap-[10px] ' +
        'rounded-[24px] bg-ink px-[20px] py-[15px] text-canvas',
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
        icon('undo', { size: 16 }),
        action
      )
  )

  let timer = null
  const dismiss = () => {
    clearTimeout(timer)
    if (!el.isConnected) return
    el.style.transition = 'opacity 160ms ease-in'
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 170)
  }

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
          'sheet-scrim fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-[20px] backdrop-blur-[2px]',
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
