import { h, mount } from './dom.js'
import { onChange } from './db.js'
import { subscribe } from '../state.js'

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
  async function rerender() {
    if (disposed) return
    if (pending) {
      queued = true
      return
    }
    pending = true
    try {
      do {
        queued = false
        const scrollY = window.scrollY
        const content = await build({ rerender })
        if (disposed) return
        if (queued) continue
        mount(el, content)
        /**
         * Rebuilding changes document height; keep the user where they were.
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
         * `clientHeight` and not `innerHeight` for the subtrahend: on the
         * installed PWA those are 812 and 874, and the scrolling box is the
         * smaller one. See `.screen-floor` in styles.css.
         */
        const root = document.documentElement
        const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight)
        if (scrollY > 0) window.scrollTo(0, Math.min(scrollY, maxScroll))
      } while (queued)
    } finally {
      pending = false
    }
  }

  const offData = onChange((scope) => {
    if (!watch || scope === 'all' || watch.includes(scope)) rerender()
  })
  const offDate = watchDate ? subscribe(rerender) : () => {}

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
    destroy() {
      disposed = true
      offData()
      offDate()
    },
  }
}
