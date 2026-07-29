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

  async function rerender() {
    if (disposed || pending) return
    pending = true
    const scrollY = window.scrollY
    try {
      const content = await build({ rerender })
      if (disposed) return
      mount(el, content)
      // Rebuilding changes document height; keep the user where they were.
      if (scrollY > 0) window.scrollTo(0, Math.min(scrollY, document.body.scrollHeight))
    } finally {
      pending = false
    }
  }

  const offData = onChange((scope) => {
    if (!watch || scope === 'all' || watch.includes(scope)) rerender()
  })
  const offDate = watchDate ? subscribe(rerender) : () => {}

  rerender()

  return {
    el,
    rerender,
    destroy() {
      disposed = true
      offData()
      offDate()
    },
  }
}
