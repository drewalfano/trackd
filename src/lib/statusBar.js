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
const SCRIMMED = { light: '#9C9C9C', dark: '#0D0D0D' }

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
