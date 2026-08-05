import { BUILD_ID, VERSION } from '../config.js'

/**
 * What the viewport actually measures, on the device, in the broken state.
 *
 * This exists because the bottom-of-the-screen bug reproduces on the installed
 * iOS PWA and nowhere else — not in a Safari tab, not at 390pt in a desktop
 * browser, and not in a simulator, since this machine has Command Line Tools
 * and no Xcode. Two fixes have now been reasoned out from a screenshot and
 * shipped, and both were wrong, because a screenshot shows that the tab bar is
 * high and cannot show which of four viewport heights it is high against.
 *
 * So the numbers get read off the phone instead. Everything here is measured;
 * nothing is computed from an assumption about what iOS reports.
 */

/**
 * Resolve a CSS length by measuring an element that uses it.
 *
 * The viewport units are the whole point of this file and there is no way to
 * ask for their value directly — `getComputedStyle` on `height: 100svh` returns
 * the used pixel height, which is exactly what is wanted, but only once the
 * element is in the document and laid out.
 *
 * `position: fixed` so a probe asking for `100lvh` cannot lengthen the document
 * it is trying to describe, and `visibility: hidden` rather than `display: none`
 * because a `display: none` element has no used height at all.
 */
function measure(decl) {
  const probe = document.createElement('div')
  probe.setAttribute('style', `position:fixed;left:0;top:0;width:1px;visibility:hidden;${decl}`)
  document.body.appendChild(probe)
  const box = probe.getBoundingClientRect()
  const styles = getComputedStyle(probe)
  const out = {
    height: box.height,
    paddingTop: parseFloat(styles.paddingTop) || 0,
    paddingRight: parseFloat(styles.paddingRight) || 0,
    paddingBottom: parseFloat(styles.paddingBottom) || 0,
    paddingLeft: parseFloat(styles.paddingLeft) || 0,
  }
  probe.remove()
  return out
}

const round1 = (n) => (typeof n === 'number' ? Math.round(n * 10) / 10 : n)

/**
 * One reading, taken now.
 *
 * The rows that matter are the last three. `.tabbar` is the visible pill and it
 * asks for exactly `--nav-inset` — 20px — off the bottom of the screen, so both
 * gaps should read 20 and the two heights they are measured against should agree.
 *
 * The first version of this measured `nav` instead, which is the full-bleed
 * transparent box the pill sits inside; its own bottom edge is flush with its
 * anchor by construction, so it reported 0 and 0 on a screen where the bar was
 * visibly 62px high. Measure the thing you can see.
 */
export function readViewport() {
  const vv = window.visualViewport
  const bar = document.querySelector('.tabbar')
  const barBox = bar ? bar.getBoundingClientRect() : null
  const route = (location.hash || '#/').replace(/^#\/?/, '') || 'today'
  const insets = measure(
    'padding-top:env(safe-area-inset-top);padding-right:env(safe-area-inset-right);' +
      'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left)'
  )
  const panel = document.querySelector('.sheet-panel')
  const panelBox = panel ? panel.getBoundingClientRect() : null

  return {
    build: BUILD_ID,
    version: VERSION,
    route,
    standalone: `${window.matchMedia('(display-mode: standalone)').matches} / ${
      navigator.standalone ?? '—'
    }`,

    'screen.height': window.screen.height,
    innerHeight: window.innerHeight,
    'documentElement.clientHeight': document.documentElement.clientHeight,
    'visualViewport.height': vv ? round1(vv.height) : '—',
    'visualViewport.offsetTop': vv ? round1(vv.offsetTop) : '—',
    'visualViewport.pageTop': vv ? round1(vv.pageTop) : '—',
    'visualViewport.scale': vv ? round1(vv.scale) : '—',

    /* The token every anchor in the app now resolves through. If this does not
       equal `screen.height` on the phone, nothing bottom-anchored can be right. */
    '--screen-h': round1(measure('height:var(--screen-h)').height),

    '100vh': round1(measure('height:100vh').height),
    '100svh': round1(measure('height:100svh').height),
    '100lvh': round1(measure('height:100lvh').height),
    '100dvh': round1(measure('height:100dvh').height),

    'safe-area top': round1(insets.paddingTop),
    'safe-area bottom': round1(insets.paddingBottom),
    'safe-area left/right': `${round1(insets.paddingLeft)} / ${round1(insets.paddingRight)}`,

    'doc.scrollHeight': document.documentElement.scrollHeight,
    'body.scrollHeight': document.body.scrollHeight,
    'body.clientHeight': document.body.clientHeight,
    scrollY: round1(window.scrollY),
    scrollable: document.documentElement.scrollHeight > window.innerHeight + 1,

    'body pinned': document.body.style.position === 'fixed',
    'body top/height': `${document.body.style.top || '—'} / ${document.body.style.height || '—'}`,

    'tabbar.bottom': barBox ? round1(barBox.bottom) : '—',
    gapBelowBarFromInner: barBox ? round1(window.innerHeight - barBox.bottom) : '—',
    gapBelowBarFromScreen: barBox ? round1(window.screen.height - barBox.bottom) : '—',

    'panel.bottom': panelBox ? round1(panelBox.bottom) : '—',
    gapBelowPanel: panelBox ? round1(window.innerHeight - panelBox.bottom) : '—',
  }
}

/**
 * The states that reproduce the bug, captured where they happen.
 *
 * **This is the fix to the instrument, and not having it is why three attempts
 * went out on guesses.** The Viewport page is a long card of rows, so it always
 * scrolls — and a scrolling document is precisely the case that behaves. Every
 * reading taken off that page has been taken in the one state where the bar is
 * already correct, which is why they all looked fine while the phone did not.
 *
 * A reading cannot be taken by hand on a screen that has no readout on it. So the
 * app takes it for itself: whenever the document is too short to scroll, or a
 * sheet is open, the reading is stashed and the Viewport page shows it afterwards.
 *
 * `localStorage`, so it survives the navigation to go and look at it — which is
 * the whole difficulty, since navigating to the readout leaves the state being
 * measured. Two slots, not a log: the last of each is the one worth having, and a
 * growing list in `localStorage` is a leak with no reader.
 */
const SHORT_KEY = 'mt:vp:short'
const SHEET_KEY = 'mt:vp:sheet'

export function captureViewportState() {
  // The readout's own screen is not a subject. It scrolls by construction, so it
  // would never qualify as short — but a sheet opened FROM it would overwrite the
  // sheet slot with the one panel whose page behind is atypical.
  if ((location.hash || '').includes('settings/viewport')) return

  const reading = readViewport()
  try {
    if (document.querySelector('.sheet-panel')) {
      localStorage.setItem(SHEET_KEY, JSON.stringify(reading))
    } else if (!reading.scrollable) {
      localStorage.setItem(SHORT_KEY, JSON.stringify(reading))
    }
  } catch {
    /* storage may be locked down; the live reading still works */
  }
}

/** The two stashed readings, or nulls. */
export function readCaptures() {
  const load = (key) => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }
  return { short: load(SHORT_KEY), sheet: load(SHEET_KEY) }
}

/** The same reading as one block of text, for pasting into a message. */
export function formatViewport(reading) {
  const width = Math.max(...Object.keys(reading).map((k) => k.length))
  return Object.entries(reading)
    .map(([key, value]) => `${key.padEnd(width)}  ${value}`)
    .join('\n')
}
