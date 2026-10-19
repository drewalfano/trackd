import { h, mount } from './dom.js'
import { onChange } from './db.js'
import { subscribe } from '../state.js'
import { pageScroller, maxScroll } from './scroller.js'

/**
 * Screens rebuild their own subtree when the data they care about changes.
 *
 * `watch` is a filter on the change scope. Without it, typing into a Settings
 * field would save, emit, and re-render the field out from under the cursor.
 */
export function createScreen(build, { watch = null, watchDate = true } = {}) {
  const el = h('div')
  let disposed = false
  let pending = false
  let queued = false
  /**
   * A kept-alive tab that is not on screen (Phase 4; see `show` in main.js).
   *
   * Today, Trends and Settings are built once and hidden rather than destroyed
   * when you leave them, and a hidden screen has no business re-rendering on
   * every write: logging a food would otherwise run three full builds, two of
   * them for screens nobody can see. So while paused a change only marks the
   * screen `dirty`, and `resume` runs the one render it is owed, before the
   * screen is shown again so it never appears with the old numbers.
   */
  let paused = false
  let dirty = false
  const requestRender = () => {
    if (paused) dirty = true
    else rerender()
  }

  /**
   * Renders are serialised, and a request arriving mid-render marks the one in
   * flight stale rather than being dropped.
   *
   * Dropping it was wrong in a way that showed: stepping the day twice quickly
   * ran the first render and discarded the second, and because a screen reads
   * `state.date` again after its `await` to build the header, the result was
   * yesterday's header sitting above the day before's numbers. Whichever way
   * that mismatch falls, it is the screen quietly lying about what it is
   * showing.
   *
   * A stale render is not painted at all. Mounting it and then correcting it
   * would put the wrong numbers on screen for a frame, which is the same lie in
   * a shorter unit of time.
   */
  // The render in flight, so a caller arriving mid-render (`resume` above all)
  // waits for the one that will actually land rather than returning early.
  let inflight = null
  function rerender() {
    if (disposed) return Promise.resolve()
    if (pending) {
      queued = true
      return inflight
    }
    inflight = renderLoop()
    return inflight
  }

  async function renderLoop() {
    pending = true
    try {
      do {
        queued = false
        // Cleared as the read starts, so a change landing mid-build marks the
        // screen stale again rather than being absorbed by this render.
        dirty = false
        const scroller = pageScroller()
        const scrollY = scroller.scrollTop
        const content = await build({ rerender })
        if (disposed) return
        if (queued) continue
        /**
         * A build that hands back what is already on screen has patched in
         * place, and re-mounting it would undo the point of having done so.
         *
         * `mount` is `clear` plus append, so the node is detached and
         * reattached — and **that cancels every running transition and
         * animation in the subtree**. Measured rather than assumed: an element
         * mid-transition reports one running animation and its computed value
         * still at the start; after a synchronous remove-and-re-append it
         * reports none and the computed value has jumped straight to the
         * destination. So a screen cannot keep its nodes just by returning the
         * same ones — the remount destroys exactly the continuity keeping them
         * was for.
         *
         * Hence the identity check rather than a flag. A screen opts in simply
         * by returning the element it was given last time, which is what "this
         * build patched rather than rebuilt" already means; every screen that
         * returns a fresh tree is untouched and takes the same path it always
         * did. See NOTES-node-identity.md.
         */
        if (el.childNodes.length !== 1 || el.firstChild !== content) mount(el, content)
        /**
         * Rebuilding changes the page's height; keep the user where they were.
         *
         * Clamped to the LAST SCROLLABLE PIXEL, which is the document's height
         * less the SCROLLING BOX's — not to the document's height, which was the
         * ceiling here and is roughly a viewport too generous. Swiping from a
         * full day to an empty one is the case that ceiling let through: the
         * rebuild shrinks the page to less than a screen, the old offset is
         * asked for anyway, and the scroll is set past the end of a document
         * that has nothing left to scroll. A browser clamps that; iOS clamps it
         * against a layout it is in the middle of recomputing.
         *
         * The scroller is `#view` now, not the document (see lib/scroller.js),
         * which also retires the old trap here: the document's `clientHeight`
         * and `innerHeight` disagreed by the top inset on the installed PWA.
         * `#view` is one box, so its own two heights are the whole answer.
         */
        // Only for the screen actually on show. A kept-alive tab rendering
        // while hidden (or a new screen rendering before it is mounted) would
        // otherwise clamp the scroll of whatever screen IS on show.
        const onShow = el.isConnected && !el.hidden
        if (onShow && scrollY > 0) scroller.scrollTop = Math.min(scrollY, maxScroll(scroller))
      } while (queued)
    } finally {
      pending = false
    }
  }

  const offData = onChange((scope) => {
    if (!watch || scope === 'all' || watch.includes(scope)) requestRender()
  })
  const offDate = watchDate ? subscribe(requestRender) : () => {}

  /**
   * The first render is async, because it reads IndexedDB. Callers must wait
   * on this before putting `el` on screen — mounting it early shows an empty
   * div for as long as the read takes, which reads as a white flash on every
   * navigation.
   */
  const ready = rerender()

  return {
    el,
    rerender,
    ready,
    /** Hidden: changes only mark the screen stale. See `paused`. */
    pause() {
      paused = true
    },
    /** About to be shown: resolves once any render it missed has landed. */
    resume() {
      paused = false
      return dirty ? rerender() : Promise.resolve()
    },
    destroy() {
      disposed = true
      offData()
      offDate()
    },
  }
}
