/**
 * The one `<meta name="theme-color">` tag, kept in sync with two things.
 *
 * **`SCRIMMED` does nothing on the installed iOS PWA, and this file used to
 * claim the opposite.** The claim was that iOS paints the strip behind the clock
 * from `theme-color`, so publishing a dimmed value while a sheet is open closes
 * the seam across the top of the screen. It was tested by shipping `#FF0000`
 * here and opening a sheet on the phone: the strip did not change. Under
 * `apple-mobile-web-app-status-bar-style: black-translucent` the status bar is
 * transparent and the PAGE is what shows through it, so there is no browser-
 * painted band for this tag to colour and no seam for it to close.
 *
 * Why it read as working for so long: `#9C9C9C` is exactly `bg-black/35` over
 * `#F0F0F0` — 240 x 0.65 = 156 — which is precisely what the page under the
 * scrim already is. A tag that lands and a tag that is ignored render the same
 * pixel. The only value that could tell them apart was one the page could not
 * produce.
 *
 * The rest of the tag is still doing real work and is not a candidate for
 * deletion: `CANVAS` is what the app declares to every browser that DOES paint
 * chrome from it — Android, desktop, and iOS Safari when the app is opened as a
 * tab rather than installed. `SCRIMMED` still reaches those. What is now known
 * to be inert is only its effect on Drew's phone, which is also the only place
 * the seam it was written for was ever seen.
 *
 * `SCRIM_TINT_DELAY` in lib/sheet.js exists solely to time this publish against
 * the scrim's fade, and inherits the same status. See the note there.
 *
 * Values kept as literals rather than read from the CSS var so the two cannot
 * drift apart silently — if `--color-canvas` moves, both entries here move
 * with it.
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
