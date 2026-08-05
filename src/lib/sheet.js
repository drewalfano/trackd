import { h, clear, swipeToDismiss } from './dom.js'
import { icon } from './icons.js'
import { setScrimmed } from './statusBar.js'

/**
 * Bottom sheet with a panel stack.
 *
 * The Add Food action row is a route picker, not a tab set, so choosing Scan or
 * Search or Custom pushes a panel rather than swapping the body. Panels keep
 * their DOM when you push past them, so going back to a search restores the
 * query and results instead of starting over.
 *
 * The hardware/gesture back button pops one panel, which is why each push gets
 * its own history entry.
 */

let active = null

const STATE = 'mt-sheet'

/**
 * iOS-safe scroll lock.
 *
 * `overflow: hidden` on body does not reliably lock scrolling in mobile Safari,
 * and the page loses its scroll offset while the sheet is open — so closing it
 * snaps the list back to the top. Pinning the body at a negative offset holds
 * the position visually, and it is restored on unlock.
 */
let lockedScrollY = 0

function lockScroll(lock) {
  const { style } = document.body
  if (lock) {
    lockedScrollY = window.scrollY
    style.position = 'fixed'
    style.top = `-${lockedScrollY}px`
    style.left = '0'
    style.right = '0'
    style.overflow = 'hidden'
  } else {
    style.position = ''
    style.top = ''
    style.left = ''
    style.right = ''
    style.overflow = ''
    window.scrollTo(0, lockedScrollY)
  }
}

export function isSheetOpen() {
  return !!active
}

export function openSheet({ title, render, footer = null }) {
  // One sheet at a time. A second open replaces the first.
  if (active) active.destroy()

  let resolveResult
  const result = new Promise((r) => (resolveResult = r))

  const panels = []
  let closing = false
  let destroyed = false
  /** Distinguishes this sheet's history entries from a previous sheet's. */
  const id = Math.random().toString(36).slice(2)

  const titleEl = h('h2', {
    class: 'flex-1 truncate text-title font-semibold',
  })
  const backBtn = h(
    'button',
    { class: 'icon-btn', 'aria-label': 'Back', onclick: () => history.back() },
    icon('chevronLeft', { size: 20, stroke: 2 })
  )
  const closeBtn = h(
    'button',
    { class: 'icon-btn', 'aria-label': 'Close', onclick: () => closeAll() },
    icon('close', { size: 20, stroke: 2 })
  )

  const header = h(
    'header',
    { class: 'flex items-center gap-[10px] px-[20px] pb-[20px] pt-[20px]' },
    backBtn,
    titleEl,
    closeBtn
  )
  /**
   * The body owns every edge inset a panel gets: 20 on all four sides, the
   * same gutter the sheet's header and footer hold. Panels used to add a
   * further 10 of their own, which put their last element at 30 from the
   * bottom while sitting at 20 from the sides — and 30 from a footer button
   * that already has its own 20. Panels lay out their content; the chrome
   * decides where the content stops.
   */
  const body = h('div', {
    class: 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[20px]',
  })
  const footerEl = h('div', { class: 'sheet-footer px-[20px] pb-[20px] pt-[10px] empty:hidden' })

  const panel = h(
    'div',
    {
      /**
       * Capped so a tall sheet stops clear of the notch or Dynamic Island
       * rather than running its header underneath them.
       *
       * `border-t` is the one stroke left after controls and containers went to
       * fills, and it is kept deliberately. Measured against the scrim, the
       * sheet's own edge is 2.41:1 in light — which carries it alone — but
       * 1.05:1 in dark, where the top edge would simply disappear. This is not
       * a card on a page; it is a surface meeting a dimmed one, and in dark mode
       * the hairline is the only thing drawing it.
       */
      class:
        'sheet-panel absolute inset-x-0 bottom-0 flex flex-col rounded-t-[24px] border-t border-outline bg-canvas safe-b',
      style: {
        maxHeight: 'calc(100svh - env(safe-area-inset-top, 0px) - 20px)',
      },
      role: 'dialog',
      'aria-modal': 'true',
      onclick: (e) => e.stopPropagation(),
    },
    header,
    body,
    footerEl
  )

  const scrim = h(
    'div',
    {
      class: 'sheet-scrim fixed inset-0 z-[60] bg-black/35',
      onclick: () => closeAll(),
    },
    panel
  )

  function syncHeader() {
    const top = panels[panels.length - 1]
    titleEl.textContent = top?.title ?? ''
    backBtn.style.display = panels.length > 1 ? '' : 'none'
    footerEl.replaceChildren(...(top?.footerNode ? [top.footerNode] : []))
  }

  function showTop() {
    const top = panels[panels.length - 1]
    clear(body)
    if (top?.node) body.appendChild(top.node)
    syncHeader()
    body.scrollTop = top?.scrollTop ?? 0
  }

  function makeCtx(entry) {
    return {
      close: (value) => closeAll(value),
      pop: () => history.back(),
      push: (spec) => pushPanel(spec),
      /**
       * Runs when this panel is popped or the sheet closes. Anything holding a
       * hardware resource — the camera, an in-flight fetch — registers here.
       */
      onDispose: (fn) => entry.disposers.push(fn),
      setTitle: (t) => {
        entry.title = t
        syncHeader()
      },
      setFooter: (node) => {
        entry.footerNode = node
        syncHeader()
      },
      /** Re-run this panel's render in place, e.g. after a data change. */
      refresh: () => {
        runDisposers(entry)
        const next = entry.render(makeCtx(entry))
        entry.node = next
        if (panels[panels.length - 1] === entry) showTop()
      },
      body,
    }
  }

  function pushPanel(spec) {
    const current = panels[panels.length - 1]
    if (current) current.scrollTop = body.scrollTop

    const entry = {
      title: spec.title,
      render: spec.render,
      footerNode: spec.footer ?? null,
      disposers: [],
    }
    entry.node = spec.render(makeCtx(entry))
    panels.push(entry)

    history.pushState({ [STATE]: { id, depth: panels.length } }, '')
    showTop()
    return entry
  }

  function runDisposers(entry) {
    for (const fn of entry.disposers.splice(0)) {
      try {
        fn()
      } catch (err) {
        console.warn('Sheet panel cleanup failed', err)
      }
    }
  }

  function destroy() {
    /* Idempotent: opening a sheet over a live one destroys it early, and that
       sheet's own teardown timer still fires afterwards. */
    if (destroyed) return
    destroyed = true
    setScrimmed(false)
    for (const entry of panels) runDisposers(entry)
    window.removeEventListener('popstate', onPop)
    document.removeEventListener('keydown', onKey)
    scrim.remove()
    lockScroll(false)
    if (active?.scrim === scrim) active = null
  }

  function teardown(value) {
    if (closing) return
    closing = true
    scrim.dataset.closing = 'true'
    panel.dataset.closing = 'true'
    setTimeout(destroy, 200)
    resolveResult(value)
  }

  /** Close every panel at once, unwinding the history entries we pushed. */
  function closeAll(value) {
    if (closing) return
    const depth = panels.length
    pendingValue = value
    history.go(-depth)
  }

  let pendingValue

  /**
   * `STATE` alone is not enough to tell one sheet's history entries from
   * another's, and that was leaving the page scroll-locked.
   *
   * Every sheet stamped the same key, so an entry left behind by an EARLIER
   * sheet still reads as `{'mt-sheet': 1}` — and when a later sheet went back
   * onto it, `depth >= panels.length` said "not mine" and returned. `teardown`
   * never ran, `destroy` never ran, and `lockScroll(false)` never ran: the sheet
   * stayed in the DOM and `<body>` stayed at `position: fixed; overflow: hidden`
   * for the rest of the session. The page stopped scrolling, and on iOS a
   * pinned layout viewport is what makes fixed chrome — the tab bar, the sheet's
   * own bottom edge — drift away from where it should be.
   *
   * The id makes each sheet's entries its own, so an entry that is not this
   * sheet's is now correctly read as "we have left the sheet entirely" rather
   * than as a depth to compare against.
   */
  function onPop(event) {
    const state = event.state?.[STATE]
    const mine = state && state.id === id
    const depth = mine ? state.depth : 0
    if (mine && depth >= panels.length) return
    if (depth <= 0) {
      teardown(pendingValue)
      return
    }
    // Popped back to a panel we still have — drop everything above it.
    for (const entry of panels.splice(depth)) runDisposers(entry)
    showTop()
  }

  function onKey(e) {
    if (e.key === 'Escape') closeAll()
  }

  /**
   * Pull the sheet down to close it.
   *
   * `closeAll()` rather than `teardown()` on purpose: the sheet's exit is
   * history-driven, and every panel it pushed has an entry to unwind. Tearing
   * down directly would leave those behind, so the next hardware back would
   * step through a sheet that is no longer on screen.
   */
  swipeToDismiss(panel, { scroller: body, scrim, onDismiss: () => closeAll() })

  window.addEventListener('popstate', onPop)
  document.addEventListener('keydown', onKey)
  document.body.appendChild(scrim)
  setScrimmed(true)
  lockScroll(true)

  active = { scrim, destroy, closeAll }
  pushPanel({ title, render, footer })

  return result
}

/** Used by the router: navigating away should not leave a sheet floating. */
export function closeAnySheet() {
  active?.closeAll()
}
