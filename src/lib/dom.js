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
 * Where an element is actually PAINTED right now, mid-animation included.
 *
 * The computed transform resolves to a matrix whichever way the element got
 * there — an inline transform, a CSS transition still running, a keyframe
 * animation halfway through — so this is the only honest answer to "where is
 * this thing" while something is moving it.
 *
 * That is what makes a gesture interruptible. Every handler below that takes
 * over from an animation in flight starts from this rather than from whatever
 * the code last decided the element's state was, because those two disagree for
 * exactly as long as the animation lasts, which is exactly when a second touch
 * is most likely to arrive.
 *
 * `matrix(a, b, c, d, tx, ty)` — the last two are the translation. `none` on an
 * untransformed element, which reads as the origin.
 */
export function paintedTranslate(el) {
  const m = getComputedStyle(el).transform?.match(/matrix\(([^)]+)\)/)
  if (!m) return { x: 0, y: 0 }
  const v = m[1].split(',')
  return { x: parseFloat(v[4]) || 0, y: parseFloat(v[5]) || 0 }
}

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
 * How a released row settles.
 *
 * Opening and closing are not the same event and do not get the same curve.
 * Opening ARRIVES at something — two controls that were not there a moment ago
 * — so it is allowed a few pixels of overshoot and a little longer to spend
 * them: the row passes its resting place, the circles settle back with it, and
 * the whole thing reads as weight coming to rest. Closing is a dismissal, and
 * a dismissal that bounces is asking to be noticed on its way out. It gets a
 * plain decelerating curve, and it gets there sooner.
 *
 * Overshoot is also only safe in one direction. Past the open position there
 * is empty track to move into; past the closed position there is the card's
 * own left edge, and a row that springs off it exposes a sliver of nothing
 * where the row used to be.
 */
const SWIPE_OPEN_MS = 260
const SWIPE_CLOSE_MS = 200
const SWIPE_OPEN_EASE = 'cubic-bezier(0.22, 1.12, 0.36, 1)'
const SWIPE_CLOSE_EASE = 'cubic-bezier(0.33, 0.9, 0.2, 1)'

/**
 * Past the open position the row keeps moving, at a third of the finger.
 *
 * A hard stop at the reveal width told the truth — there is nothing further —
 * but it told it by feeling like the row had jammed. Resistance says the same
 * thing without the collision: keep pulling and it keeps giving, less and less,
 * which is what the end of every scroll on this platform already does.
 */
const SWIPE_RESIST = 0.32

/**
 * A flick decides on its own, without having to reach halfway.
 *
 * The halfway rule alone punishes the fast gesture: a quick flick that lifts at
 * 50px has clearly asked for the row to open, and springing it shut is the app
 * disagreeing with something unambiguous. Above this speed the direction of the
 * finger settles it and distance stops mattering. 0.45px/ms is roughly a
 * deliberate flick and well clear of the drift at the end of a slow drag.
 */
const SWIPE_FLICK = 0.45

/**
 * The one row that is open, app-wide.
 *
 * Two open rows is four identical circles on screen with nothing to say which
 * pair belongs to which entry, and the delete in that set is not a control to
 * be vague about. Held here rather than per-list because the rows themselves do
 * not know about each other, and because Today and the full-log sheet can both
 * have entries mounted at once.
 */
let openSwipeRow = null

/**
 * Swipe an entry left to reveal actions. Returns a cleanup function.
 *
 * The row tracks the finger while the finger is down, resists past the end of
 * its travel, and settles on release — see the constants above for what
 * "settles" means in each direction. It publishes `--swipe-progress` (0 to 1)
 * on the wrapper the whole time, which is how the revealed controls animate
 * with the movement rather than appearing fully formed underneath it.
 */
export function swipeToReveal(el, { width = 96, onOpen, onClose } = {}) {
  let startX = 0
  let startY = 0
  let dx = 0
  let dragging = false
  let decided = false
  let open = false
  let lastX = 0
  let lastT = 0
  let velocity = 0
  /** Where the surface was painted when this gesture took it over. */
  let baseX = 0
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

  /**
   * One write moves the row and tells the controls how far it got.
   *
   * `--swipe-settle` is the duration the buttons should take to catch up, and
   * it has to be published here rather than keyed off `data-swiping`: that flag
   * stays on while a row sits open, so it cannot distinguish "following a
   * finger" from "settling after one". 0ms during the drag means the circles
   * are pinned to the movement; the release duration means they arrive with it.
   */
  const setX = (x, animate) => {
    const settle = x < 0 ? SWIPE_OPEN_MS : SWIPE_CLOSE_MS
    const ease = x < 0 ? SWIPE_OPEN_EASE : SWIPE_CLOSE_EASE
    surface.style.transition = animate ? `transform ${settle}ms ${ease}` : 'none'
    surface.style.transform = `translateX(${x}px)`
    el.style.setProperty('--swipe-progress', Math.min(1, -x / width).toFixed(3))
    el.style.setProperty('--swipe-settle', animate ? `${settle}ms` : '0ms')
  }

  const close = (animate = true) => {
    open = false
    dx = 0
    setX(0, animate)
    el.dataset.open = 'false'
    delete el.dataset.swiping
    if (openSwipeRow === el) openSwipeRow = null
    onClose?.()
  }

  /**
   * Touching any row closes whichever other row is open.
   *
   * On touchstart rather than once the gesture is judged horizontal, because
   * every way of reaching another row should dismiss the open one — a tap on a
   * neighbour, a scroll of the list, a swipe on a second entry. Waiting for the
   * axis decision would only handle the third, and leave a stale pair of
   * circles sitting behind a sheet the tap just opened.
   *
   * `isConnected` because the list rebuilds on delete and on day change, which
   * can leave this pointing at a row that is no longer in the document.
   */
  const closeOthers = () => {
    if (!openSwipeRow || openSwipeRow === el) return
    if (openSwipeRow.isConnected) openSwipeRow._closeSwipe?.(true)
    openSwipeRow = null
  }

  const onStart = (e) => {
    if (e.touches?.length > 1) return
    const p = e.touches ? e.touches[0] : e
    closeOthers()
    startX = p.clientX
    startY = p.clientY
    lastX = p.clientX
    lastT = e.timeStamp || performance.now()
    velocity = 0
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
      /**
       * Take over from where the row is PAINTED, not from where it belongs.
       *
       * The origin used to be the logical state — `open ? -width : 0` — and that
       * is only true once a settle has finished. Catch a row during the 260ms it
       * spends arriving and the next frame recomputed it from the destination,
       * so the surface teleported to its end position and carried on from there.
       * Catching something you just released is an ordinary correction, and it
       * produced a jump.
       *
       * Read at the DECIDE, not at touchstart: between the two the settle is
       * still running and the row has moved further along it, so a position
       * captured at the start would be stale by the time it is used.
       *
       * **And written back, which is the half that is easy to miss.** The inline
       * transform still says the DESTINATION — a transition animates the
       * computed value while the declared one sits at its end point — so simply
       * removing the transition snaps the row to where it was heading. Reading
       * the painted position and pinning it as the new inline value is what
       * makes the handover invisible. `setX` does both and republishes
       * `--swipe-progress`, so the revealed circles hold their size too.
       */
      baseX = paintedTranslate(surface).x
      dx = baseX
      setX(baseX, false)
      /**
       * Give back the threshold, and only the threshold.
       *
       * The 12px above is evidence, not travel: charging it to the gesture made
       * the row jump 12px the instant it was captured, which is the single
       * biggest thing that made this feel like a mechanism rather than a
       * surface. Moving the origin forward by exactly that much starts the row
       * from rest under the finger.
       *
       * By exactly that much, and no more. Resetting the origin to wherever the
       * finger is on the deciding frame would also throw away the extra 40 or
       * 50px a fast flick has already covered by the time we look, and the row
       * would spend the rest of the gesture trailing the thumb.
       */
      startX += deltaX > 0 ? SWIPE_AXIS_THRESHOLD : -SWIPE_AXIS_THRESHOLD
      return
    }

    const now = e.timeStamp || performance.now()
    const dt = now - lastT
    // Last sample only, not an average over the gesture: what decides a release
    // is where the finger was going as it left, and a slow drag that ends in a
    // flick should read as a flick.
    if (dt > 0) velocity = (p.clientX - lastX) / dt
    lastX = p.clientX
    lastT = now

    // From where the row was when this gesture claimed it — see `baseX`.
    const raw = baseX + deltaX
    dx = raw > 0 ? 0 : raw < -width ? -width + (raw + width) * SWIPE_RESIST : raw
    setX(dx, false)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (!decided) return
    // A definite flick settles it; anything slower falls back to which side of
    // halfway the row was left on.
    const shouldOpen =
      velocity < -SWIPE_FLICK ? true : velocity > SWIPE_FLICK ? false : dx < -width / 2
    if (shouldOpen) {
      open = true
      dx = -width
      setX(-width, true)
      el.dataset.open = 'true'
      openSwipeRow = el
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
/**
 * How a released page settles.
 *
 * This was 220ms on `cubic-bezier(0.16, 1, 0.3, 1)`, the expo-out the app
 * reaches for by default. That curve is right for a press dip — it is nearly
 * done before you can see it — and wrong for a surface travelling a whole page
 * width: it covers about nine tenths of the distance in the first third of the
 * time and then floats through the rest, which does not overshoot but reads
 * exactly like it does. It was called a bounce on device, as the same curve was
 * on the sheet panels and the screen arrival before it.
 *
 * Quad-out decelerates at close to a constant rate, so the page arrives instead
 * of drifting in. 200ms with no float in it is shorter than 220 with one.
 *
 * Deliberately the same pair as `.panel-in` and `view-in` in styles.css: three
 * different navigations, one way of moving.
 */
const PAGE_MS = 200
const PAGE_EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'

/**
 * Resistance as a curve rather than a fraction.
 *
 * The boundary damping here was a flat `× 0.25`, which is not what a rubber band
 * does: a constant multiplier still moves 75px for a 300px pull, so "there is
 * nothing that way" was being said at a quarter volume forever. This tapers —
 * 1:1 for the first few pixels, so the surface still feels live under the
 * finger, then asymptotically toward `limit` however hard you pull.
 */
const rubber = (d, limit) => (d * limit) / (Math.abs(d) + limit)

export function swipePages(deck, { track, pageWidth, reach, onCommit, duration = PAGE_MS }) {
  let startX = 0
  let startY = 0
  let dx = 0
  let dragging = false
  let decided = false
  let committing = false
  let lastX = 0
  let lastT = 0
  let velocity = 0
  /** Measured once, when the gesture is claimed, rather than on every frame. */
  let pageW = 0

  deck.style.touchAction = 'pan-y'

  const setX = (x, ms) => {
    track.style.transition = ms ? `transform ${ms}ms ${PAGE_EASE}` : 'none'
    track.style.transform = `translateX(${x}px)`
  }

  /**
   * How long the rest of the journey should take.
   *
   * A fixed duration is wrong at both ends. Released at nine tenths of the way
   * over, the last sliver still took the whole 200ms and visibly decelerated
   * into a stop it had already reached; thrown hard from a standing start, the
   * page dawdled behind the thumb that threw it.
   *
   * So it is whichever is sooner: the time the finger's own speed implies, or
   * the time the remaining distance implies at the full-page rate. Floored at
   * 90ms so it can never become a snap, capped at the full duration so it can
   * never become a crawl.
   */
  const settleMs = (travel, w) => {
    const byFinger = Math.abs(velocity) > 0.05 ? travel / Math.abs(velocity) : Infinity
    const byDistance = (travel / w) * duration
    return Math.round(Math.min(duration, Math.max(90, Math.min(byFinger, byDistance))))
  }

  /**
   * Past a full page there is no third card, so the track gives rather than
   * running on into bare canvas. Nothing used to stop it: a long drag carried
   * the neighbour clean past the opposite edge and exposed the page tint where
   * a card should be.
   */
  const withinReach = (d) => {
    const over = Math.abs(d) - pageW
    if (over <= 0) return d
    return (d < 0 ? -1 : 1) * (pageW + rubber(over, pageW * 0.15))
  }

  const onStart = (e) => {
    if (committing || e.touches?.length > 1) return
    const p = e.touches ? e.touches[0] : e
    startX = p.clientX
    startY = p.clientY
    lastX = p.clientX
    lastT = e.timeStamp || performance.now()
    velocity = 0
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
      pageW = pageWidth() || 1
      /**
       * Give back the threshold, exactly as a row swipe does.
       *
       * The 12px above is evidence that the gesture is horizontal, not travel
       * the finger meant to spend — and charging it to the deck made the whole
       * card jump 12px the instant it was captured. `swipeToReveal` fixed this
       * for rows and calls it "the single biggest thing that made this feel like
       * a mechanism rather than a surface"; the deck never got the same
       * treatment, so the two gestures started differently under one thumb.
       */
      startX += deltaX > 0 ? SWIPE_AXIS_THRESHOLD : -SWIPE_AXIS_THRESHOLD
      return
    }

    const now = e.timeStamp || performance.now()
    const dt = now - lastT
    // Last sample only, for the reason a row swipe gives: what decides a release
    // is where the finger was going as it left, not its average over the drag.
    if (dt > 0) velocity = (p.clientX - lastX) / dt
    lastX = p.clientX
    lastT = now

    // A drag to the RIGHT reveals what is to the left, which is the previous
    // day — so the sign of the movement and the sign of the step are opposite.
    const dir = deltaX > 0 ? -1 : 1
    dx = reach(dir) ? withinReach(deltaX) : rubber(deltaX, pageW * 0.3)
    setX(dx, 0)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (!decided) return
    const w = pageW || pageWidth() || 1

    /**
     * A flick decides on its own, without having to reach a quarter of a page.
     *
     * The deck was distance-only while the row swipe eight pixels away had used
     * velocity since it was written — so the same quick flick of the same thumb
     * opened a row and sprang the day back, and the app disagreed with something
     * unambiguous depending on where the finger happened to land. The argument
     * and the constant are `SWIPE_FLICK`'s, unchanged: above that speed the
     * direction of travel settles it and distance stops mattering.
     *
     * The direction comes from the velocity when it is a flick, so reversing at
     * the last moment does what the last moment said — drag left, flick right,
     * and you get the previous day.
     */
    const flick = Math.abs(velocity) > SWIPE_FLICK
    const dir = flick ? (velocity > 0 ? -1 : 1) : dx > 0 ? -1 : 1
    // A quarter of a page, or 60px, whichever is further. The floor is what
    // stops a small flick on a large phone from being read as indecision.
    const enough = flick || Math.abs(dx) > Math.max(60, w * 0.25)

    if (!enough || !reach(dir)) {
      delete deck.dataset.paging
      setX(0, settleMs(Math.abs(dx), w))
      return
    }

    const target = dir === -1 ? w : -w
    const ms = settleMs(Math.abs(target - dx), w)
    committing = true
    setX(target, ms)

    /**
     * The commit fires once, whichever way the transition ends.
     *
     * `committing` is cleared only by the rebuild that `onCommit` triggers, so a
     * `transitionend` that never arrives left the deck refusing gestures for the
     * life of the screen. It can genuinely not arrive: an unrelated data change
     * rebuilds this screen and replaces the track mid-flight, a backgrounded tab
     * never runs the frame, or the target happens to equal where it already is.
     * The timer is the backstop and `settled` keeps the pair idempotent.
     */
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      clearTimeout(fallback)
      track.removeEventListener('transitionend', done)
      onCommit(dir)
    }
    const done = (e) => {
      if (e.target !== track) return
      finish()
    }
    track.addEventListener('transitionend', done)
    const fallback = setTimeout(finish, ms + 80)
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
  /** How far the finger has travelled, as distinct from where the panel is. */
  let pulled = 0
  let lastY = 0
  let lastT = 0
  let velocity = 0
  let dragging = false
  let decided = false
  let fromScroller = false
  let done = false
  /** Where the panel was painted when the drag claimed it — see `onMove`. */
  let baseY = 0

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
    pulled = 0
    baseY = 0
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
      /**
       * Take the sheet off its entry animation, at the position it has reached.
       *
       * `.sheet-panel` runs a 260ms `sheet-in` keyframe, and a CSS animation
       * outranks an inline style — so for the whole of that window this handler
       * tracked the finger, wrote a transform, and nothing moved. Silently: no
       * lag, no snap, just a sheet that ignored you. It is also the exact
       * quarter-second in which someone who opened a sheet by mistake reaches to
       * throw it away.
       *
       * **`data-dragging`, not `data-dismissing`.** The existing flag means "the
       * finger is carrying this out" and suppresses every keyframe including the
       * EXIT, which is right at release and wrong here — a drag that gets
       * abandoned leaves the sheet open, and it must still be able to animate
       * away when it is eventually closed. So claiming the sheet gets its own
       * flag, and the stylesheet orders the three so that `closing` beats
       * `dragging` and `dismissing` beats `closing`.
       *
       * **Never cleared.** Un-suppressing would hand `sheet-in` back to a sheet
       * that has already arrived, and a fresh animation-name plays from the
       * start — so abandoning a drag would drop the sheet to the bottom of the
       * screen and slide it up again. It has served its purpose the moment the
       * sheet is on screen; leaving it off costs nothing.
       *
       * The position has to be carried across either way, or cancelling the
       * entry would drop the sheet from wherever it had risen to straight back
       * down. `baseY` is that position, and every offset below is measured from
       * it — so a sheet caught halfway in keeps rising to `0` if the drag is
       * abandoned, and carries on down if it is not.
       */
      baseY = paintedTranslate(panel).y
      panel.dataset.dragging = 'true'
      if (scrim) scrim.dataset.dragging = 'true'
      // Pinned to where it was actually painted, in the same breath. Turning the
      // keyframes off drops the panel to whatever its inline transform says, and
      // during the entry that is nothing at all — so without this the sheet
      // would jump to fully-open before starting to follow the finger down.
      setY(baseY, false)
    }

    // Claimed. Without this the sheet moves AND the page behind it scrolls.
    if (e.cancelable) e.preventDefault()

    const dt = e.timeStamp - lastT
    if (dt > 0) velocity = (p.clientY - lastY) / dt
    lastY = p.clientY
    lastT = e.timeStamp

    /**
     * Two numbers, because they answer different questions.
     *
     * `dy` is where the panel is DRAWN — from wherever it actually was when the
     * drag claimed it, which is 0 for a sheet at rest and part-way down for one
     * still arriving. `pulled` is how far the FINGER has travelled, which is
     * what the release is judged on.
     *
     * They were the same value until a sheet could be caught mid-entry, and
     * collapsing them was briefly a real bug: a sheet grabbed 130px into its
     * arrival started with `dy` already past the 120px dismissal threshold, so
     * the smallest touch threw it away before the finger had moved at all. How
     * far a sheet happens to have risen is not something the user did.
     */
    pulled = Math.max(0, deltaY)
    dy = Math.max(0, baseY + deltaY)
    setY(dy, false)
  }

  const onEnd = () => {
    if (!dragging) return
    dragging = false
    if (!decided) return

    // `pulled`, not `dy` — see the note in `onMove`. What was asked for is how
    // far the finger went, not how far down the panel happens to be sitting.
    const far = pulled > Math.min(120, panel.offsetHeight * 0.3)
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
