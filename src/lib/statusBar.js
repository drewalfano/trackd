/**
 * The one `<meta name="theme-color">` tag, kept in sync with two things.
 *
 * On an installed iOS PWA that strip behind the clock is painted by the browser
 * from `theme-color`, not by the page — so it stays canvas-bright while a sheet
 * dims everything below it, and the seam reads as a hard edge across the top of
 * the screen. Publishing the scrimmed colour while a sheet is open closes it.
 *
 * The value is the same maths the scrim does: `bg-black/35` over canvas, which
 * is each channel at 65%. Kept as literals rather than read from the CSS var so
 * the two cannot drift apart silently — if `--color-canvas` moves, both entries
 * here move with it.
 */
const CANVAS = { light: '#F0F0F0', dark: '#141414' }
/**
 * TEMPORARY — REVERT ME. `light` is `#9C9C9C`, not this.
 *
 * A gradient appears behind the clock on the installed PWA whenever a sheet is
 * open, and nothing in the page draws it: every element and pseudo-element whose
 * box reaches the top 60px was checked with a sheet open and all of them are
 * flat. The remaining question is whether this tag reaches that strip at all
 * under `black-translucent`, which the note above asserts and which nothing has
 * ever tested.
 *
 * Red because the correct answer is invisible. `#9C9C9C` is exactly black at 35%
 * over `#F0F0F0` — 240 x 0.65 = 156 — so a working tag and a strip that ignores
 * the tag look identical. A colour that could never be produced by dimming the
 * page tells the two apart in one look.
 *
 * Red strip: the tag lands, and the grey it normally sends is being defeated by
 * something downstream of it. Grey gradient still: the tag is ignored in this
 * status bar mode, the note above is wrong, and the only lever left is not
 * dimming under the status bar.
 *
 * Light only. Drew is in light mode, and changing both would leave two things to
 * put back.
 */
const SCRIMMED = { light: '#FF0000', dark: '#0D0D0D' }

let dark = false
/** Sheets can stack, so this counts rather than toggles. */
let depth = 0

function publish() {
  const table = depth > 0 ? SCRIMMED : CANVAS
  const content = table[dark ? 'dark' : 'light']
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}

/** Called by `applyTheme` whenever the resolved light/dark answer changes. */
export function setThemeIsDark(isDark) {
  dark = isDark
  publish()
}

/** Called on sheet open (`true`) and on sheet teardown (`false`). */
export function setScrimmed(on) {
  depth = Math.max(0, depth + (on ? 1 : -1))
  publish()
}
