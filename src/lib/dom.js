/**
 * A hundred lines of DOM helper instead of a framework.
 *
 * The state in this app is small and almost all of it lives in IndexedDB, so
 * the thing a framework would buy us — diffing a large render tree — is not the
 * problem we have. Screens re-render by replacing their own subtree.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

function apply(el, props) {
  for (const key in props) {
    const v = props[key]
    if (v == null || v === false) continue

    if (key === 'class') el.setAttribute('class', v)
    else if (key === 'style' && typeof v === 'object') Object.assign(el.style, v)
    else if (key === 'dataset') Object.assign(el.dataset, v)
    else if (key === 'html') el.innerHTML = v
    else if (key === 'ref') v(el)
    else if (key === 'value') el.value = v
    else if (key === 'checked') el.checked = !!v
    else if (key.startsWith('on') && typeof v === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), v)
    } else if (v === true) el.setAttribute(key, '')
    else el.setAttribute(key, v)
  }
}

function appendAll(el, children) {
  for (const child of children) {
    if (child == null || child === false || child === true) continue
    if (Array.isArray(child)) appendAll(el, child)
    else if (child instanceof Node) el.appendChild(child)
    else el.appendChild(document.createTextNode(String(child)))
  }
}

/** Create an HTML element. */
export function h(tag, props, ...children) {
  const el = document.createElement(tag)
  if (props instanceof Node || Array.isArray(props) || typeof props === 'string') {
    children.unshift(props)
  } else if (props) {
    apply(el, props)
  }
  appendAll(el, children)
  return el
}

/** Create an SVG element. Same signature as h(). */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag)
  if (props) apply(el, props)
  appendAll(el, children)
  return el
}

export function frag(...children) {
  const f = document.createDocumentFragment()
  appendAll(f, children)
  return f
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild)
  return el
}

export function mount(el, ...children) {
  clear(el)
  appendAll(el, children)
  return el
}

/**
 * Replace a node's children, dropping the empty ones.
 *
 * `h()` ignores a null child; `replaceChildren` stringifies it and renders the
 * word "null" on screen. Every in-place repaint in this app is conditional
 * somewhere, so they all go through this rather than each one remembering — it
 * had already shipped twice.
 */
export function repaint(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false))
  return el
}

/**
 * Shrink an element's text just enough to stop it truncating.
 *
 * For one line in the app: the day header, which sits in 227px between two
 * chevrons and has to hold everything from "Today, Aug 2" to
 * "Wed, Jan 13, 2027". At the title size those differ by 75px, so a single
 * font size either truncates the long ones or shrinks the everyday ones for
 * no reason. This shrinks only what needs it, and only as far as it needs.
 *
 * Runs again after `document.fonts.ready` on purpose. Measuring before the
 * webfont lands measures the fallback, and the fallback is a different width —
 * which would size the header against a font the user never sees.
 *
 * Not wired to viewport resize: screens rebuild their header on navigation, and
 * a rotation without a navigation is the one case this will not catch.
 */
export function fitText(el, { min = 22 } = {}) {
  const fit = () => {
    if (!el.isConnected || !el.clientWidth) return false
    el.style.fontSize = ''
    const max = parseFloat(getComputedStyle(el).fontSize)
    // Starts at the token size, so the common case exits on the first pass.
    for (let size = max; size >= min; size -= 0.5) {
      el.style.fontSize = `${size}px`
      if (el.scrollWidth <= el.clientWidth) break
    }
    return true
  }

  // The element is built before it is mounted, so the first measurement can
  // land while it still has no box. Retry until it does, then stop.
  let tries = 0
  const attempt = () => {
    if (!fit() && ++tries < 20) requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
  document.fonts?.ready.then(() => requestAnimationFrame(fit))
  return el
}

/** Fires once per user action, ~10ms, then gets out of the way. */
export function haptic(pattern = 8) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported, and not worth telling anyone about */
  }
}

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Render text with every digit in its own span, so `countTo` can write through
 * them each frame rather than replacing a text node mid-animation.
 *
 * The spans used to carry a fixed advance as well, because Inclusive Sans
 * shipped no `tnum`. Inter has real tabular figures and `body` asks for them,
 * so holding position is the font's job now — see the `.tnum` note in
 * styles.css.
 */
export function setTabularText(el, text) {
  const out = []
  let run = ''
  for (const ch of String(text)) {
    if (ch >= '0' && ch <= '9') {
      if (run) { out.push(document.createTextNode(run)); run = '' }
      out.push(h('span', { class: 'd' }, ch))
    } else {
      run += ch
    }
  }
  if (run) out.push(document.createTextNode(run))
  el.replaceChildren(...out)
}

/**
 * Count a number up to its new value over ~200ms.
 * Used for the totals on Today, which are the only numbers that earn it.
 */
export function countTo(el, to, { duration = 200, format = (n) => Math.round(n) } = {}) {
  const from = Number(el.dataset.value ?? 0)
  el.dataset.value = String(to)
  // The element carries .tnum, so write digits as fixed-advance spans rather
  // than as a text node — otherwise the number reflows on every frame.
  const write = (v) => setTabularText(el, format(v))
  if (from === to || reduceMotion()) {
    write(to)
    return
  }
  /**
   * Paint the starting value NOW, not on the first animation frame.
   *
   * Everything below is scheduled, so between this call and the first frame the
   * element held nothing at all. That was invisible while the only caller was a
   * screen render — the element was not in the document yet — but Today's card
   * now rebuilds this number on a tap, in place, and a frame of blank where a
   * 48px number was reads as the card breaking. It is also however long a
   * backgrounded tab takes to run a frame, which is unbounded.
   */
  write(from)
  const start = performance.now()
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - t, 3)
    write(from + (to - from) * eased)
    if (t < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

/**
 * How far a gesture travels before its axis is judged, and how far horizontal
 * has to beat vertical to take it. A row lives inside a scrolling list, so the
 * list gets the benefit of the doubt: a gesture has to be decidedly sideways,
 * not merely more sideways than not.
 */
const SWIPE_AXIS_THRESHOLD = 12
const SWIPE_AXIS_RATIO = 1.5

/**
 * Swipe an entry left to reveal actions. Tracks the finger directly — no
 * spring, no overshoot. Returns a cleanup function.
 */
export function swipeToReveal(el, { width = 96, onOpen, onClose } = {}) {
  let startX = 0
  let startY = 0
  let dx = 0
  let dragging = false
  let decided = false
  let open = false
  const surface = el.querySelector('[data-swipe-surface]')
  if (!surface) return () => {}

  /**
   * `pan-y` tells the compositor this row scrolls vertically and never pans
   * horizontally. That does two things: vertical scrolling no longer waits on
   * our JS, and horizontal gestures need no preventDefault — which lets every
   * listener below be passive. A non-passive touchmove on each of a dozen log
   * rows is enough to make the whole list feel like it is dragging.
   */
  el.style.touchAction = 'pan-y'

  const setX = (x, animate) => {
    surface.style.transition = animate ? 'transform 200ms cubic-bezier(0.16,1,0.3,1)' : 'none'
    surface.style.transform = `translateX(${x}px)`
  }

  const close = (animate = true) => {
    open = false
    dx = 0
    setX(0, animate)
    el.dataset.open = 'false'
    delete el.dataset.swiping
    onClose?.()
  }

  const onStart = (e) => {
    if (e.touches?.length > 1) return
    const p = e.touches ? e.touches[0] : e
    startX = p.clientX
    startY = p.clientY
    dragging = true
    decided = false
  }

  const onMove = (e) => {
    if (!dragging) return
    const p = e.touches ? e.touches[0] : e
    const deltaX = p.clientX - startX
    const deltaY = p.clientY - startY

    if (!decided) {
      /**
       * Judge the axis once, on enough movement to judge it by.
       *
       * This decision is final — that is what an axis lock is for — so the only
       * question that matters is how much evidence it waits for. At 6px it was
       * deciding during the opening arc of the gesture, and a thumb flicking a
       * list downward travels sideways first: 9px across and 4px down is a
       * genuinely horizontal sample, and it was enough to capture the row for
       * the remaining 200px of a vertical scroll. The row then tracked the
       * finger out of its own container, clipped by the wrapper, and sprang
       * back over 200ms on release.
       *
       * 12px is past the arc, and the ratio means a gesture has to be decidedly
       * sideways rather than merely sideways-ish at one sampled instant.
       *
       * Declining costs nothing: `pan-y` means the browser has been scrolling
       * the page since the gesture began, without waiting on any of this.
       */
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_AXIS_THRESHOLD) return
      if (Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_AXIS_RATIO) {
        dragging = false
        return
      }
      decided = true
      /**
       * Announce the gesture the moment it is judged horizontal, so anything
       * styling the open row can start with the movement rather than after it.
       * Set once here and cleared on close — `onEnd` leaves it in place when
       * the row settles open, since open is where it is meant to stay.
       */
      el.dataset.swiping = 'true'
    }
    dx = Math.max(-width - 24, Math.min(0, (open ? -width : 0) + deltaX))
    setX(dx, false)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (!decided) return
    if (dx < -width / 2) {
      open = true
      dx = -width
      setX(-width, true)
      el.dataset.open = 'true'
      onOpen?.()
    } else {
      close()
    }
  }

  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: true })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', onEnd)

  el._closeSwipe = close
  return () => {
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  }
}

/**
 * Page a deck sideways with the finger, one page per gesture.
 *
 * Same bones as `swipeToReveal` — `pan-y`, passive listeners, one axis
 * decision — and deliberately the same feel, because they are the same hand
 * doing the same thing eight pixels apart on the same screen. What differs is
 * what a release means: the row above SETTLES into a state and stays there,
 * this one COMMITS to a change and hands the result back.
 *
 * The commit fires on `transitionend`, not on release. The caller's job is to
 * replace what is on screen with the day it just paged to, and the honest
 * moment for that is when the incoming page has finished arriving — the track
 * is then already sitting exactly where a freshly built deck sits, so the swap
 * has nothing to animate and nothing to correct.
 *
 * `reach` decides whether a direction exists at all. Where it does not, the
 * drag is damped to a quarter rather than frozen: a page that will not move is
 * indistinguishable from a page that did not receive the gesture, and one of
 * those is a bug. The give says "there is nothing that way" — the same thing a
 * rubber band says at the end of a scroll.
 */
export function swipePages(deck, { track, pageWidth, reach, onCommit, duration = 220 }) {
  let startX = 0
  let startY = 0
  let dx = 0
  let dragging = false
  let decided = false
  let committing = false

  deck.style.touchAction = 'pan-y'

  const setX = (x, animate) => {
    track.style.transition = animate ? `transform ${duration}ms cubic-bezier(0.16,1,0.3,1)` : 'none'
    track.style.transform = `translateX(${x}px)`
  }

  const onStart = (e) => {
    if (committing || e.touches?.length > 1) return
    const p = e.touches ? e.touches[0] : e
    startX = p.clientX
    startY = p.clientY
    dx = 0
    dragging = true
    decided = false
  }

  const onMove = (e) => {
    if (!dragging) return
    const p = e.touches ? e.touches[0] : e
    const deltaX = p.clientX - startX
    const deltaY = p.clientY - startY

    if (!decided) {
      // Same threshold and ratio as a row swipe. A deck that captured gestures
      // more eagerly than the rows beneath it would make the same flick of the
      // thumb do different things depending on where it landed.
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SWIPE_AXIS_THRESHOLD) return
      if (Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_AXIS_RATIO) {
        dragging = false
        return
      }
      decided = true
      deck.dataset.paging = 'true'
    }
    // A drag to the RIGHT reveals what is to the left, which is the previous
    // day — so the sign of the movement and the sign of the step are opposite.
    const dir = deltaX > 0 ? -1 : 1
    dx = reach(dir) ? deltaX : deltaX * 0.25
    setX(dx, false)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (!decided) return
    const w = pageWidth()
    // A quarter of a page, or 60px, whichever is further. The floor is what
    // stops a small flick on a large phone from being read as indecision.
    const enough = Math.abs(dx) > Math.max(60, w * 0.25)
    const dir = dx > 0 ? -1 : 1

    if (!enough || !reach(dir)) {
      delete deck.dataset.paging
      setX(0, true)
      return
    }

    committing = true
    setX(dir === -1 ? w : -w, true)
    const done = (e) => {
      if (e.target !== track) return
      track.removeEventListener('transitionend', done)
      onCommit(dir)
    }
    track.addEventListener('transitionend', done)
  }

  /**
   * A page gesture ends with a click, and the deck's contents are tappable.
   *
   * Swallowed here, in the capture phase, rather than by asking every handler
   * inside the deck to check whether a swipe just happened. Anything the deck
   * ever contains gets the guard for free, and none of it has to know this
   * gesture exists.
   *
   * The flag is CONSUMED, not just read. Leaving it set until the next
   * `touchstart` works on a phone, where every tap starts with one — and fails
   * on a trackpad, where the click after a swipe is the only event that
   * arrives, so the flag would still be standing and the next real click would
   * be eaten instead.
   */
  const onClickCapture = (e) => {
    if (!decided && !committing) return
    e.stopPropagation()
    e.preventDefault()
    decided = false
  }

  deck.addEventListener('touchstart', onStart, { passive: true })
  deck.addEventListener('touchmove', onMove, { passive: true })
  deck.addEventListener('touchend', onEnd)
  deck.addEventListener('touchcancel', onEnd)
  deck.addEventListener('click', onClickCapture, true)

  return () => {
    deck.removeEventListener('touchstart', onStart)
    deck.removeEventListener('touchmove', onMove)
    deck.removeEventListener('touchend', onEnd)
    deck.removeEventListener('touchcancel', onEnd)
    deck.removeEventListener('click', onClickCapture, true)
  }
}

/**
 * Drag a bottom sheet down to close it.
 *
 * The whole difficulty is that the sheet is mostly a scrolling list, and pulling
 * down is what you do to scroll a list back up. The rule that separates them is
 * the one every native sheet uses: the drag is only yours if the content has
 * nothing left to scroll. Start on the header and it is yours immediately;
 * start on the list and you get it only once the list is at the top, which is
 * exactly when a downward pull has stopped meaning "scroll".
 *
 * That is also why the `touchmove` listener is the one non-passive listener in
 * this file. Every other gesture here declares its axis up front with
 * `touch-action` and never has to cancel anything; this one cannot, because the
 * same axis belongs to the scroller until the moment it does not. Claiming it
 * means calling `preventDefault`, and calling it means the listener has to be
 * cancellable.
 *
 * Velocity counts as well as distance. A short sharp flick is a dismissal —
 * requiring it to also travel a third of the screen makes the sheet feel like
 * it is resisting, and resistance from a sheet reads as it being stuck rather
 * than as it being sure.
 */
export function swipeToDismiss(panel, { scroller, scrim, onDismiss, duration = 200 } = {}) {
  let startY = 0
  let startX = 0
  let dy = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0
  let dragging = false
  let decided = false
  let fromScroller = false
  let done = false

  const setY = (y, animate) => {
    panel.style.transition = animate
      ? `transform ${duration}ms cubic-bezier(0.16,1,0.3,1)`
      : 'none'
    panel.style.transform = y ? `translateY(${y}px)` : ''
    if (!scrim) return
    scrim.style.transition = animate ? `opacity ${duration}ms ease-out` : 'none'
    // Down to a third at a full sheet-height pull, never past it. The scrim
    // lifting as the sheet leaves is what makes the page behind feel like it
    // was there all along rather than being rebuilt.
    scrim.style.opacity = y ? String(Math.max(0.35, 1 - y / panel.offsetHeight)) : ''
  }

  const onStart = (e) => {
    if (done || e.touches.length > 1) return
    const p = e.touches[0]
    startY = lastY = p.clientY
    startX = p.clientX
    lastT = e.timeStamp
    dy = 0
    velocity = 0
    dragging = true
    decided = false
    fromScroller = !!scroller && scroller.contains(e.target)
  }

  const onMove = (e) => {
    if (!dragging) return
    const p = e.touches[0]
    const deltaY = p.clientY - startY
    const deltaX = p.clientX - startX

    if (!decided) {
      if (Math.max(Math.abs(deltaY), Math.abs(deltaX)) < SWIPE_AXIS_THRESHOLD) return
      // Downward, and decidedly vertical — the same ratio a row swipe demands
      // of horizontal, pointed the other way.
      if (deltaY <= 0 || Math.abs(deltaY) <= Math.abs(deltaX) * SWIPE_AXIS_RATIO) {
        dragging = false
        return
      }
      // The list still has somewhere to go, so this pull belongs to it.
      if (fromScroller && scroller.scrollTop > 0) {
        dragging = false
        return
      }
      decided = true
    }

    // Claimed. Without this the sheet moves AND the page behind it scrolls.
    if (e.cancelable) e.preventDefault()

    const dt = e.timeStamp - lastT
    if (dt > 0) velocity = (p.clientY - lastY) / dt
    lastY = p.clientY
    lastT = e.timeStamp

    dy = Math.max(0, deltaY)
    setY(dy, false)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (!decided) return

    const far = dy > Math.min(120, panel.offsetHeight * 0.3)
    const fast = velocity > 0.6
    if (!far && !fast) {
      setY(0, true)
      return
    }

    done = true
    /**
     * Finish under our own transition, from where the finger left it.
     *
     * `data-closing` runs a keyframe exit that starts at `translateY(0)`, and a
     * CSS animation outranks an inline transform — so handing over to it would
     * snap the sheet back up to closed-position and then play it out. The flag
     * turns those keyframes off; the CSS rule for it is declared after the
     * closing rules so it wins when both are set.
     */
    panel.dataset.dismissing = 'true'
    if (scrim) scrim.dataset.dismissing = 'true'
    if (reduceMotion()) {
      onDismiss?.()
      return
    }
    panel.style.transition = `transform ${duration}ms ease-in`
    panel.style.transform = 'translateY(100%)'
    if (scrim) {
      scrim.style.transition = `opacity ${duration}ms ease-in`
      scrim.style.opacity = '0'
    }
    onDismiss?.()
  }

  panel.addEventListener('touchstart', onStart, { passive: true })
  panel.addEventListener('touchmove', onMove, { passive: false })
  panel.addEventListener('touchend', onEnd)
  panel.addEventListener('touchcancel', onEnd)

  return () => {
    panel.removeEventListener('touchstart', onStart)
    panel.removeEventListener('touchmove', onMove)
    panel.removeEventListener('touchend', onEnd)
    panel.removeEventListener('touchcancel', onEnd)
  }
}

/**
 * Hold a `data-pressed` flag on an element for as long as a finger is on it.
 *
 * `:active` is what draws the press on a desktop pointer, and on iOS it is
 * close to useless: Safari only applies it to a non-native element if the
 * element or an ancestor carries a touch listener, and even where that is
 * satisfied it can hang on after the finger has gone. So touch gets its own
 * flag and the CSS honours either.
 *
 * The press RELEASES at 10px of travel, two pixels under the threshold at which
 * `swipePages` claims the gesture. That ordering is deliberate: the card must
 * have stopped looking pressed before it starts moving, or the first frame of
 * every page turn is a card that is both dipped and sliding — which reads as
 * the tap having gone wrong rather than as a swipe having begun.
 */
export function pressable(el, { slop = 10 } = {}) {
  let startX = 0
  let startY = 0
  let down = false

  const set = (on) => {
    down = on
    if (on) el.dataset.pressed = 'true'
    else delete el.dataset.pressed
  }

  const onStart = (e) => {
    if (e.touches.length > 1) return
    const p = e.touches[0]
    startX = p.clientX
    startY = p.clientY
    set(true)
  }
  const onMove = (e) => {
    if (!down) return
    const p = e.touches[0]
    if (Math.abs(p.clientX - startX) > slop || Math.abs(p.clientY - startY) > slop) set(false)
  }
  const onEnd = () => set(false)

  el.addEventListener('touchstart', onStart, { passive: true })
  el.addEventListener('touchmove', onMove, { passive: true })
  el.addEventListener('touchend', onEnd)
  el.addEventListener('touchcancel', onEnd)

  return () => {
    el.removeEventListener('touchstart', onStart)
    el.removeEventListener('touchmove', onMove)
    el.removeEventListener('touchend', onEnd)
    el.removeEventListener('touchcancel', onEnd)
  }
}

/** Long press without swallowing taps or fighting the swipe handler. */
export function longPress(el, handler, ms = 500) {
  let timer = null
  let startX = 0
  let startY = 0

  const cancel = () => {
    clearTimeout(timer)
    timer = null
  }

  el.addEventListener(
    'touchstart',
    (e) => {
      const p = e.touches[0]
      startX = p.clientX
      startY = p.clientY
      timer = setTimeout(() => {
        timer = null
        haptic(12)
        handler(e)
      }, ms)
    },
    { passive: true }
  )
  el.addEventListener(
    'touchmove',
    (e) => {
      const p = e.touches[0]
      if (Math.abs(p.clientX - startX) > 8 || Math.abs(p.clientY - startY) > 8) cancel()
    },
    { passive: true }
  )
  el.addEventListener('touchend', cancel)
  el.addEventListener('touchcancel', cancel)

  // Desktop equivalent, so this is testable without a phone.
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    handler(e)
  })
}
