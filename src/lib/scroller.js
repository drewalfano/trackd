/**
 * The element that scrolls a page, which is no longer the document.
 *
 * `#view` is a fixed box the height of the screen and the only thing a finger
 * on a page can scroll; see the note on `#view` in styles.css for why the
 * document was retired from the job and why it still has a 62pt floor nobody
 * can reach. Every "where is the page scrolled to" and "scroll the page" in the
 * app goes through here, so there is one answer to which element that means.
 *
 * Falls back to the document's own scroller before the shell is mounted
 * (onboarding, the storage-blocked screen), where the document is still the
 * thing that scrolls.
 */
export function pageScroller() {
  return document.getElementById('view') || document.scrollingElement || document.documentElement
}

/** The last scrollable pixel, never negative. */
export function maxScroll(el = pageScroller()) {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

/**
 * The nearest ancestor that actually scrolls, for code that can live either on
 * a page or inside a sheet (the reorder grid is on Trends and in the Library
 * sheet). Inside a sheet that is `.sheet-body`; on a page it is `#view`.
 */
export function scrollParent(el) {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return pageScroller()
}
