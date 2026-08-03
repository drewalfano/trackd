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
 * Render text with every digit in a fixed-advance span, so numbers hold their
 * position as they change. See the `.tnum` note in styles.css for why the font
 * cannot do this itself.
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
      // Let the page scroll unless the gesture is clearly horizontal.
      if (Math.abs(deltaY) > Math.abs(deltaX)) {
        dragging = false
        return
      }
      if (Math.abs(deltaX) < 6) return
      decided = true
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
