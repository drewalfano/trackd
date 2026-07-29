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
      class: 'fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 safe-b',
      style: { paddingBottom: 'calc(112px + env(safe-area-inset-bottom, 0px))' },
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
        'toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-surface shadow-none',
    },
    h('span', { class: 'flex-1 text-sm font-medium' }, message),
    action &&
      h(
        'button',
        {
          class: 'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold',
          style: { background: 'color-mix(in srgb, currentColor 15%, transparent)' },
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
          'sheet-scrim fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-6 backdrop-blur-[2px]',
        onclick: (e) => {
          if (e.target === scrim) close(false)
        },
      },
      h(
        'div',
        {
          class: 'w-full max-w-sm rounded-[24px] bg-surface p-5',
          role: 'alertdialog',
          'aria-modal': 'true',
        },
        h('h2', { class: 'text-[18px] font-bold' }, title),
        message && h('p', { class: 'mt-2 text-[15px] leading-snug text-muted' }, message),
        requireText &&
          h(
            'div',
            { class: 'mt-4' },
            h('p', { class: 'mb-2 text-[13px] text-muted' }, `Type ${requireText} to confirm.`),
            h('input', {
              class: 'field bg-canvas',
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
          { class: 'mt-5 flex flex-col gap-2' },
          confirmBtn,
          h('button', { class: 'btn-secondary bg-canvas', onclick: () => close(false) }, cancelLabel)
        )
      )
    )

    document.body.appendChild(scrim)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => input?.focus())
  })
}
