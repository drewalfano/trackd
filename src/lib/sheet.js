import { h, clear, swipeToDismiss } from './dom.js'
import { icon } from './icons.js'
import { fadeLayers, FADE_RAMP } from './fade.js'
import { setScrimmed } from './statusBar.js'
import { captureViewportState } from './viewportProbe.js'

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
 *
 * The height is given rather than left to `height: auto`, which would shrink the
 * pinned body to its content, and rather than `bottom: 0`, which is the edge
 * `.screen-floor` in styles.css exists because WebKit will not commit to. It uses
 * `--screen-h` for the same reason everything else does: `dvh` is short here. The box
 * runs from `-lockedScrollY` to the bottom of the screen — so the page still
 * shows the row it was showing, and the `overflow: hidden` clip lands a full
 * viewport below the fold rather than mid-screen.
 */
let lockedScrollY = 0

function lockScroll(lock) {
  const { style } = document.body
  if (lock) {
    lockedScrollY = window.scrollY
    style.position = 'fixed'
    style.top = `-${lockedScrollY}px`
    style.height = `calc(var(--screen-h) + ${lockedScrollY}px)`
    style.left = '0'
    style.right = '0'
  } else {
    style.position = ''
    style.top = ''
    style.height = ''
    style.left = ''
    style.right = ''
    window.scrollTo(0, lockedScrollY)
  }
}

/**
 * A pinned `<body>` with no sheet on screen, released.
 *
 * This has gone wrong once already and the note on `onPop` describes what it
 * cost: a sheet whose history entry was misread never reached `destroy`, so
 * `lockScroll(false)` never ran and the body stayed at `position: fixed;
 * overflow: hidden` for the rest of the session. **On iOS that is not a quiet
 * failure.** A pinned layout viewport drags fixed chrome off the bottom of the
 * screen — the tab bar stops sitting 20px up, the sheet's own bottom edge stops
 * meeting the screen's, and a list ends well above where the screen does.
 *
 * That specific route is closed: history entries carry the sheet's id, and
 * `destroy` is idempotent. This is not a substitute for either. It is the
 * admission that the balance of one `lockScroll(true)` against one
 * `lockScroll(false)` is a property of every close path there is — the close
 * button, the scrim, Escape, the swipe, the hardware back, a sheet replaced by
 * another mid-teardown — and that the cost of getting it wrong is paid on the
 * screen the app is looked at first, silently, until the app is relaunched.
 *
 * So the invariant is checked rather than argued: no sheet in the document
 * means the body is not pinned. Checked on the events that bracket where the
 * failure would be noticed — coming back to a backgrounded PWA, a viewport
 * change, a restore from the page cache — rather than on a timer, because there
 * is nothing here worth a wakeup.
 *
 * `active` is deliberately not the test on its own. It stays set through the
 * 200ms exit animation, and what matters is whether anything is actually on
 * screen holding the lock, which is a fact about the document.
 */
function releaseOrphanedLock() {
  if (active || document.querySelector('.sheet-scrim')) return
  if (document.body.style.position !== 'fixed') return
  lockScroll(false)
}

window.addEventListener('pageshow', releaseOrphanedLock)
window.addEventListener('resize', releaseOrphanedLock)
document.addEventListener('visibilitychange', releaseOrphanedLock)

export function isSheetOpen() {
  return !!active
}

/**
 * Open a spec as a sheet, or as a PANEL on a sheet that is already open.
 *
 * `openSheet` destroys any live sheet before building its own — "one sheet at a
 * time", and every top-level entry point in the app relies on that. It stopped
 * being the whole story when the Log screen became a sheet, because everything
 * you can do to a row in there — edit, duplicate, save as meal, add to a block —
 * is itself an `openSheet` call. Each one would have destroyed the log out from
 * under the finger, and closing it would have landed you on Today rather than
 * back in the log you were reading.
 *
 * The panel stack already models exactly this: a sheet within a sheet, with a
 * back chevron and a history entry to unwind. So the fix is not a second sheet,
 * it is the caller saying which one it is inside. `host` is the ctx of the sheet
 * the action was launched FROM, and is threaded down from the log's row
 * handlers. Absent — every other caller in the app — this is `openSheet`
 * unchanged, which is why nothing else had to move.
 */
export function presentSheet(spec, host) {
  return host ? host.push(spec) : openSheet(spec)
}

/**
 * There was an `inset` option here — the gap left above the sheet, defaulting to
 * the 20px notch clearance, with the log asking for 60 so it would read as
 * temporary. Two sheets opened over the same screen therefore came to rest at
 * two different heights, and neither height was anchored to anything on the page
 * behind them: 20 clipped the day's title, 60 clipped the dashboard card.
 *
 * The cap is now `--content-top` for every sheet, in CSS on `.sheet-panel`, so a
 * sheet's top edge is the dashboard card's top edge. What the log wanted is what
 * that gives — a visible band of Today above the sheet — except it is a whole
 * element rather than an arbitrary distance, and every other sheet gets it too.
 *
 * There was briefly a `header` option here too, letting the root panel swap the
 * default back/title/close row for one of its own. The log was its only caller
 * and used it for a date stepper, which turned out to be the duplicate of a
 * control already visible on Today through the scrim. With the stepper gone the
 * log wants a plain title like everything else, so the option went with it.
 */
export function openSheet({ title, render, footer = null }) {
  // One sheet at a time. A second open replaces the first.
  if (active) active.destroy()

  /**
   * Where focus goes when this closes.
   *
   * Captured before anything is built, because building the panel is what moves
   * focus off it. Restored in `destroy` rather than `teardown` so it lands after
   * the exit animation, not in the middle of one.
   */
  const opener = document.activeElement

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
  /**
   * `isolate` matters now that the footer floats over this.
   *
   * Anything positioned inside a panel is free to set its own `z-index` — the
   * segmented control's segments carry `z-index: 1` so the travelling pill sits
   * under its labels — and while the footer was a flex sibling BELOW the
   * scroller that never mattered. Overlapping it, those inner stacks were
   * climbing straight over the footer: a disabled `Add` button with `Afternoon`
   * printed across it.
   *
   * Isolating the scroller contains every one of them, so no panel can reach the
   * chrome no matter what it does internally. Raising the footer's own z-index
   * would have fixed this instance and left the next one to be found by eye.
   */
  const body = h('div', {
    class: 'isolate min-h-0 flex-1 overflow-y-auto overscroll-contain px-[20px]',
  })

  /**
   * The footer FLOATS over the scroller; it is not a slab below it.
   *
   * This is the whole difference between the sheet's bottom edge and the tab
   * bar's, and it took three attempts at the gradient to notice that the
   * gradient was never the problem. The tab bar works because the page scrolls
   * UNDER it — `.screen` reserves the bar's height as bottom padding, so a card
   * runs on behind the bar and you see live, softened content around it. The
   * footer was a flex sibling, which meant the scroller ENDED at its top edge:
   * the card stopped dead there, and below it was bare canvas. No band above a
   * hard edge like that can look like content receding, because there is no
   * content down there to recede.
   *
   * So the footer is taken out of flow and the scroller is padded by its height
   * instead.
   *
   * A flat 20 from the bottom, with no safe-area inset added — the same call the
   * tab bar makes and for the same reason, written up on `--nav-inset`: the
   * 34pt inset is sized for content running edge to edge, and adding it under a
   * floating control pushes it visibly high. A pill only has to clear the home
   * indicator, which is about 13pt. Footerless sheets still get the full inset,
   * in the body's own padding below.
   */
  const footerEl = h('div', {
    // `pt-[20px]`, not 10. The body reserves this whole box as its bottom
    // padding, so the footer's own top inset IS the gap between the last of the
    // content and the button — and 20 is what that gap is everywhere else.
    class: 'sheet-footer absolute inset-x-0 bottom-0 px-[20px] pb-[20px] pt-[20px] empty:hidden',
  })

  /**
   * The same progressive blur the tab bar uses, at the sheet's own anchor.
   *
   * This was a flat 24px gradient and nothing else, which put a hard-edged band
   * of canvas directly under the footer while the tab bar — the other floating
   * control in the app, often on screen at the same moment — faded over 159px
   * with three layers of blur behind it. Two pieces of chrome doing the same job
   * on the same page, and content arrived at one of them sharp and at the other
   * softened.
   *
   * Built as a real element rather than `::before` because three backdrop
   * filters need three boxes and a pseudo-element gives you two. It is added and
   * removed WITH the footer's content in `syncHeader`, so `empty:hidden` still
   * works — a permanent child would make every footerless sheet render an empty
   * slab.
   */
  const footerFade = h(
    'div',
    { class: 'sheet-fade', 'aria-hidden': 'true' },
    fadeLayers(FADE_RAMP),
    h('span', { class: 'sheet-fade-veil' })
  )

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
      // `safe-b` moved to the footer, which is the bottom-most element now that
      // it floats. The body carries the same inset in its own padding.
      //
      // `bottom-0` is safe HERE, unlike everywhere else in the app: the scrim is
      // `.screen-cover`, so this is absolute inside a box whose own height is
      // already the screen's. It is the FIXED bottom edge that was ambiguous.
      class: 'sheet-panel absolute inset-x-0 bottom-0 flex flex-col border-t border-outline',
      /**
       * The `max-height` that used to be written here as an inline style now
       * lives on `.sheet-panel`, since it no longer varies per sheet. Its two
       * standing arguments moved with it: `100%` of the scrim rather than a
       * viewport unit — `100svh` measured 812 on Drew's phone against a real
       * 874, and then had the 62px top inset taken out of a height that had
       * already lost it, capping every sheet in the app 62px short — and the
       * scrim being `.screen-cover` is what makes the percentage trustworthy.
       */
      role: 'dialog',
      'aria-modal': 'true',
      /**
       * Focusable so the dialog itself can take focus on open. Without a target
       * of its own, focus stays on whatever was behind the scrim, and the trap
       * below has nothing to trap.
       */
      tabindex: '-1',
      onclick: (e) => e.stopPropagation(),
    },
    header,
    body,
    footerEl
  )

  const scrim = h(
    'div',
    {
      class: 'sheet-scrim screen-cover z-[60] bg-black/35',
      onclick: () => closeAll(),
    },
    panel
  )

  function syncHeader() {
    const top = panels[panels.length - 1]
    titleEl.textContent = top?.title ?? ''
    backBtn.style.display = panels.length > 1 ? '' : 'none'
    const hasFooter = !!top?.footerNode
    footerEl.replaceChildren(...(hasFooter ? [footerFade, top.footerNode] : []))
    /**
     * Reserve the floating footer's height at the foot of the scroller, so the
     * last row can be scrolled clear of the button rather than parking under it
     * permanently. Measured rather than assumed, because a footer is one button
     * on most sheets and two on the weigh-in editor.
     *
     * After a frame, since the height is only knowable once the new content has
     * laid out.
     */
    requestAnimationFrame(() => {
      body.style.paddingBottom = hasFooter
        ? `${footerEl.offsetHeight}px`
        : 'calc(20px + env(safe-area-inset-bottom, 0px))'
      syncFooterFade()
    })
  }

  /**
   * The fade only exists for content passing under the button.
   *
   * On a panel short enough not to scroll, nothing ever does — and what is left
   * is a wash of canvas over the bottom of a grid that was never going to move.
   * The date picker is the clear case: seven columns that fit exactly, with its
   * last row dimmed for no reason.
   *
   * This is the rule `syncFade` already applies to the tab bar, and it is
   * applied the same way for the same reason: `display: none` rather than
   * opacity, so the backdrop-filter layers stop compositing as well as stop
   * showing. That cost is paid every frame while the band exists.
   */
  function syncFooterFade() {
    footerFade.dataset.active = String(body.scrollHeight > body.clientHeight + 1)
  }

  /**
   * A panel's height is not known when it is appended — the log reads IndexedDB
   * and paints into its body afterwards, and the picker re-renders a new month
   * in place. Watching the mounted node catches both, where a single check after
   * `showTop` would only ever see the first frame.
   */
  const contentObserver =
    typeof ResizeObserver === 'function' ? new ResizeObserver(syncFooterFade) : null

  function showTop() {
    const top = panels[panels.length - 1]
    clear(body)
    if (top?.node) body.appendChild(top.node)
    syncHeader()
    body.scrollTop = top?.scrollTop ?? 0
    contentObserver?.disconnect()
    if (top?.node) contentObserver?.observe(top.node)
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
    /**
     * Whether the focus we are about to strip belonged to us.
     *
     * Read BEFORE the scrim leaves the document, since `contains` stops being
     * true the moment it does. If focus had already moved on — a replacing sheet
     * has taken it, or the user clicked into the page — it is not ours to put
     * back, and yanking it to the opener would be the sheet interrupting
     * whatever came after it.
     */
    contentObserver?.disconnect()
    const heldFocus = scrim.contains(document.activeElement)
    scrim.remove()
    lockScroll(false)
    if (heldFocus && opener?.isConnected && typeof opener.focus === 'function') {
      opener.focus({ preventScroll: true })
    }
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

  const FOCUSABLE =
    'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), ' +
    'textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

  /**
   * Only what is actually reachable. A panel that has been pushed past keeps its
   * DOM so its scroll position and form state survive being come back to, and
   * the hidden `input[type=date]` behind a date label is deliberately not a tab
   * stop — neither should answer the Tab key.
   */
  function focusables() {
    return [...panel.querySelectorAll(FOCUSABLE)].filter(
      (el) =>
        /**
         * `tabIndex < 0` is checked on the ELEMENT rather than left to the
         * selector, which cannot catch it. The date label's picker is an
         * `input` carrying `tabindex="-1"`, so it matches
         * `input:not(:disabled)` on its own and slips past the
         * `[tabindex]:not([tabindex="-1"])` clause entirely. It is a full-size
         * transparent overlay, so it passes the visibility test too — and being
         * in this list at the wrong end would hand Tab to something the browser
         * itself will not focus, and the cycle would stall there.
         */
        el.tabIndex >= 0 &&
        (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement)
    )
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      closeAll()
      return
    }
    if (e.key !== 'Tab') return

    /**
     * The trap. A modal that can be tabbed out of is a modal in appearance
     * only — behind it sits a whole screen of live controls that are covered,
     * inert to the eye, and perfectly reachable by keyboard.
     */
    const list = focusables()
    if (!list.length) {
      e.preventDefault()
      panel.focus({ preventScroll: true })
      return
    }
    const first = list[0]
    const last = list[list.length - 1]
    const current = document.activeElement

    if (!panel.contains(current)) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus({ preventScroll: true })
    } else if (e.shiftKey && current === first) {
      e.preventDefault()
      last.focus({ preventScroll: true })
    } else if (!e.shiftKey && current === last) {
      e.preventDefault()
      first.focus({ preventScroll: true })
    }
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

  /**
   * A reading of the sheet, once it has finished arriving.
   *
   * The body's ResizeObserver in main.js fires when `lockScroll` pins the page,
   * which is a frame before this panel has slid anywhere — measuring `.sheet-panel`
   * then reports its opening transform rather than where it comes to rest. The
   * 260ms `sheet-in` plus a margin is what makes the number mean something.
   *
   * See `captureViewportState`: a sheet is one of the two states the readout
   * cannot be navigated to, because looking at the readout closes it.
   */
  setTimeout(captureViewportState, 400)

  /**
   * Focus the dialog itself rather than the first control in it.
   *
   * The first control is whatever happens to be top-left — a close button, a
   * back chevron, a day step — and starting there both announces the wrong
   * thing and puts the very first Enter on a control nobody was reaching for.
   * The panel carries `role="dialog"`, so landing on it is what gets the sheet
   * announced, and one Tab from there reaches the same controls in order.
   *
   * `preventScroll` because the panel is inside a fixed, scroll-locked scrim on
   * iOS, where focusing a tall element is enough to shift the layout viewport
   * out from under everything.
   */
  panel.focus({ preventScroll: true })

  return result
}

/** Used by the router: navigating away should not leave a sheet floating. */
export function closeAnySheet() {
  active?.closeAll()
}
