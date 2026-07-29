/**
 * The whole icon set. Single stroke weight, no fills except where a control is
 * in a selected state. Keeping these in one file makes it obvious when the set
 * is growing — if this list gets long, something has gone wrong with the UI.
 */

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
  scan:
    '<path d="M4 8.5V6a2 2 0 012-2h2.5M15.5 4H18a2 2 0 012 2v2.5M20 15.5V18a2 2 0 01-2 2h-2.5M8.5 20H6a2 2 0 01-2-2v-2.5"/><path d="M4 12h16"/>',
  custom: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 9v6M9 12h6"/>',
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
  const inner = P[name]
  if (!inner) throw new Error(`Unknown icon: ${name}`)

  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', '0 0 24 24')
  el.setAttribute('width', size)
  el.setAttribute('height', size)
  el.setAttribute('fill', filled ? 'currentColor' : 'none')
  el.setAttribute('stroke', 'currentColor')
  el.setAttribute('stroke-width', stroke)
  el.setAttribute('stroke-linecap', 'round')
  el.setAttribute('stroke-linejoin', 'round')
  el.setAttribute('aria-hidden', 'true')
  if (opts.class) el.setAttribute('class', opts.class)
  el.innerHTML = inner
  return el
}

export const ICON_NAMES = Object.keys(P)
