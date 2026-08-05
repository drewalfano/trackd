/**
 * The whole icon set. Single stroke weight, no fills except where a control is
 * in a selected state. Keeping these in one file makes it obvious when the set
 * is growing — if this list gets long, something has gone wrong with the UI.
 */

/**
 * An 8-tooth gear, generated rather than hand-authored, because eyeballing 32
 * path points produces a gear with a visible wobble at 22px.
 */
function gearPath({ teeth = 8, outer = 10.6, inner = 8, hole = 3.6, cx = 12, cy = 12 } = {}) {
  const pts = []
  const per = (Math.PI * 2) / teeth
  // Four points per tooth: rise, tooth top, fall, valley.
  const offsets = [
    [-per * 0.22, outer],
    [per * 0.22, outer],
    [per * 0.28, inner],
    [per * 0.72, inner],
  ]
  for (let t = 0; t < teeth; t++) {
    for (const [off, r] of offsets) {
      const a = t * per + off - Math.PI / 2
      pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`)
    }
  }
  // Second subpath is the centre hole, knocked out by fill-rule evenodd.
  return (
    `<path fill-rule="evenodd" d="M${pts.join('L')}Z` +
    `M${cx} ${cy - hole}a${hole} ${hole} 0 1 0 0 ${hole * 2}a${hole} ${hole} 0 1 0 0 ${-hole * 2}Z"/>`
  )
}

/** Filled icons, used only in the tab bar. Everything else stays single stroke. */
export const FILLED = {
  calendarFilled:
    // Rounded-square ring, then a 4×3 grid of dots inside it.
    '<path fill-rule="evenodd" d="M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5Zm0 2.1a.4.4 0 0 0-.4.4v12a.4.4 0 0 0 .4.4h12a.4.4 0 0 0 .4-.4V6a.4.4 0 0 0-.4-.4H6Z"/>' +
    '<circle cx="8.2" cy="10.2" r="1.05"/><circle cx="12" cy="10.2" r="1.05"/><circle cx="15.8" cy="10.2" r="1.05"/>' +
    '<circle cx="8.2" cy="13.9" r="1.05"/><circle cx="12" cy="13.9" r="1.05"/><circle cx="15.8" cy="13.9" r="1.05"/>',

  /**
   * Three ascending pill bars.
   *
   * Replaces the scale that labelled this tab while it was called Weight. The
   * tab holds nutrition history as well now, and a scale named one of the two
   * things on it — the same problem the tab's own name had.
   *
   * Pills rather than square bars, and that is the whole reason this reads as
   * belonging to the app rather than to an icon set: every progress mark in
   * Trackd is a fully rounded bar or ring, so `rx` is half the width and the
   * bars come out as the same shape the screen behind them is full of.
   *
   * Bars rather than a rising line, though the screen's hero is a line chart. A
   * hairline zigzag has to survive being drawn at 22px in a tab bar, where it
   * is the one glyph with no label-sized detail to spare; three solid pills
   * carry at that size and a 2px polyline does not.
   */
  chartFilled:
    '<rect x="3.6" y="13" width="4.2" height="7.4" rx="2.1"/>' +
    '<rect x="9.9" y="8.6" width="4.2" height="11.8" rx="2.1"/>' +
    '<rect x="16.2" y="3.6" width="4.2" height="16.8" rx="2.1"/>',

  gearFilled: gearPath(),
}

const P = {
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  chevronDown: '<path d="M5 9l7 7 7-7"/>',
  chevronUp: '<path d="M19 15l-7-7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',

  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5L16.5 16.5"/>',
  /**
   * Brackets with bars inside, per the mock. The single horizontal line this
   * used to carry was a scanner beam — it says "a laser passes over this",
   * which is a picture of the machine rather than of the thing you point the
   * phone at. The bars say barcode, which is what someone is looking for when
   * they hold a packet up.
   */
  scan:
    '<path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5"/><path d="M8.5 8.5v7M11.5 8.5v7M14.5 8.5v7M17 8.5v7"/>',
  custom: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 9v6M9 12h6"/>',
  /**
   * Two four-point stars, the larger one off-centre.
   *
   * The convention every app has landed on for "a model did this", and the one
   * place this set borrows a meaning from outside itself rather than drawing
   * the thing. There is no picture of "describe it in words" — a speech bubble
   * would say "chat", which this deliberately is not, and a pencil is already
   * the app's edit glyph.
   *
   * Concave curves rather than straight-sided points: at 24px a star drawn with
   * straight edges reads as a plus sign with the corners knocked off.
   */
  sparkle:
    '<path d="M11 3.5l1.6 4.4a2 2 0 001.2 1.2l4.4 1.6-4.4 1.6a2 2 0 00-1.2 1.2L11 17.9l-1.6-4.4a2 2 0 00-1.2-1.2L3.8 10.7l4.4-1.6a2 2 0 001.2-1.2z"/>' +
    '<path d="M17.8 15.2l.6 1.6a1 1 0 00.6.6l1.6.6-1.6.6a1 1 0 00-.6.6l-.6 1.6-.6-1.6a1 1 0 00-.6-.6l-1.6-.6 1.6-.6a1 1 0 00.6-.6z"/>',
  barcode: '<path d="M4 6v12M8 6v12M11.5 6v12M15 6v12M20 6v12"/>',
  camera:
    '<path d="M3 8.5A2.5 2.5 0 015.5 6h1.7a1 1 0 00.83-.45l.94-1.4A1 1 0 019.8 3.7h4.4a1 1 0 01.83.45l.94 1.4A1 1 0 0016.8 6h1.7A2.5 2.5 0 0121 8.5v9a2.5 2.5 0 01-2.5 2.5h-13A2.5 2.5 0 013 17.5z"/><circle cx="12" cy="13" r="3.5"/>',

  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  weight:
    '<rect x="3" y="4" width="18" height="17" rx="4"/><path d="M8.5 15a3.5 3.5 0 117 0"/><path d="M12 15l2.6-3"/>',
  gear:
    '<circle cx="12" cy="12" r="3"/><path d="M19.1 14.5a1.6 1.6 0 00.32 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-.97 1.46V21a2 2 0 11-4 0v-.11a1.6 1.6 0 00-1.05-1.46 1.6 1.6 0 00-1.77.32l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.46-.97H3a2 2 0 110-4h.11a1.6 1.6 0 001.46-1.05 1.6 1.6 0 00-.32-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06a1.6 1.6 0 001.77.32H9a1.6 1.6 0 00.97-1.46V3a2 2 0 114 0v.11a1.6 1.6 0 00.97 1.46 1.6 1.6 0 001.77-.32l.06-.06a2 2 0 112.83 2.83l-.06.06a1.6 1.6 0 00-.32 1.77V9a1.6 1.6 0 001.46.97H21a2 2 0 110 4h-.11a1.6 1.6 0 00-1.46.97z"/>',
  home: '<path d="M4 10.5L12 4l8 6.5V19a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>',
  library:
    '<path d="M5 4.5A1.5 1.5 0 016.5 3H19v18H6.5A1.5 1.5 0 015 19.5z"/><path d="M5 17.5h14"/><path d="M9 7h6"/>',

  pencil: '<path d="M12.5 20H21"/><path d="M16.4 3.6a2.1 2.1 0 113 3L7.5 18.5l-4 1 1-4z"/>',
  trash: '<path d="M3.5 6.5h17"/><path d="M9 6.5V4.5h6v2"/><path d="M18.5 6.5l-1 14h-11l-1-14"/>',
  undo: '<path d="M3.5 10h11a5.5 5.5 0 010 11h-3"/><path d="M7.5 6l-4 4 4 4"/>',
  duplicate:
    '<rect x="8" y="8" width="12" height="12" rx="3"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  star: '<path d="M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.73-5.2 2.73 1-5.8-4.2-4.1 5.8-.85z"/>',

  download: '<path d="M12 3.5v12"/><path d="M7 10.5l5 5 5-5"/><path d="M4 20.5h16"/>',
  upload: '<path d="M12 20.5v-12"/><path d="M7 13.5l5-5 5 5"/><path d="M4 3.5h16"/>',
  share: '<path d="M12 15V3"/><path d="M8 7l4-4 4 4"/><path d="M5 13v6a2 2 0 002 2h10a2 2 0 002-2v-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.5v5M12 7.75v.5"/>',
  alert:
    '<path d="M10.3 4.3L2.8 17.5A2 2 0 004.5 20.5h15a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z"/><path d="M12 9.5v4M12 16.75v.25"/>',
  offline:
    '<path d="M3 3l18 18"/><path d="M5.5 10.5a10 10 0 013.2-2.1M12 5c3 0 5.8 1.1 8 3"/><path d="M8.5 14a6 6 0 015-1.1"/><path d="M12 18.5v.01"/>',
}

/**
 * @param {keyof typeof P} name
 * @param {{size?: number, stroke?: number, filled?: boolean, class?: string}} opts
 */
export function icon(name, opts = {}) {
  const { size = 22, stroke = 1.75, filled = false } = opts
  const solid = FILLED[name]
  const inner = solid ?? P[name]
  if (!inner) throw new Error(`Unknown icon: ${name}`)

  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', '0 0 24 24')
  el.setAttribute('width', size)
  el.setAttribute('height', size)
  el.setAttribute('fill', solid || filled ? 'currentColor' : 'none')
  el.setAttribute('stroke', solid ? 'none' : 'currentColor')
  el.setAttribute('stroke-width', stroke)
  el.setAttribute('stroke-linecap', 'round')
  el.setAttribute('stroke-linejoin', 'round')
  el.setAttribute('aria-hidden', 'true')
  if (opts.class) el.setAttribute('class', opts.class)
  el.innerHTML = inner
  return el
}

export const ICON_NAMES = [...Object.keys(P), ...Object.keys(FILLED)]
