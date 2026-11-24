import front from '../assets/body-front.svg?raw'
import back from '../assets/body-back.svg?raw'
import { s } from './dom.js'
import { UNTRAINED_REGIONS, inHalf, pickPiece, pieceBox, pieceClip, regionRole } from './bodyRegions.js'

/**
 * The body map. The supplied drawings, inlined so their regions can be filled
 * and tapped. The paths are never touched.
 *
 * One entry per drawing; a page draws however many there are. They share a
 * viewBox height and not a width, so they are sized by height.
 */
export const BODY_VIEWS = [
  { id: 'front', label: 'Front', art: front },
  { id: 'back', label: 'Back', art: back },
]

/**
 * Every id gets a prefix of its own per figure. Trends and the page under it
 * can both be in the document, and the two drawings reuse each other's ids.
 */
let serial = 0

/** One drawing, scoped, with its untrained regions taken out of the muscles. */
function drawing(view) {
  const parsed = new DOMParser().parseFromString(view.art, 'image/svg+xml').documentElement
  const svg = document.importNode(parsed, true)
  const scope = `body-${++serial}-`
  for (const el of svg.querySelectorAll('[id]')) {
    if (el.id === 'structure') el.dataset.part = 'structure'
    if (UNTRAINED_REGIONS.includes(el.id)) {
      el.classList.remove('muscle')
      delete el.dataset.groups
      el.dataset.part = 'structure'
      el.dataset.inert = ''
    }
    el.id = scope + el.id
  }
  svg.id = scope + svg.id
  return svg
}

const groupsOf = (region) => region.dataset.groups.split(' ')

/** How far off a region a tap still counts, in CSS px: half of a 44px target. */
const REACH = 22

function nearestRegion(svg, x, y) {
  for (let r = 4; r <= REACH; r += 3) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * 2 * Math.PI
      const el = document.elementFromPoint(x + r * Math.cos(a), y + r * Math.sin(a))
      const region = el?.closest?.('[data-groups]')
      if (region && svg.contains(region)) return region
    }
  }
  return null
}

/**
 * @param {object} o
 * @param {(groups: string[]) => number} o.step  the ramp step for a region
 * @param {number} [o.height]                    drawn height in px; without it the caller sizes it
 * @param {string} o.label                       what the whole figure is
 * @param {(groups: string[]) => void} [o.onRegion]
 * @param {(groups: string[]) => string} [o.regionLabel]
 */
export function bodyMap({ view = BODY_VIEWS[0], step, height, label, onRegion, regionLabel }) {
  const svg = drawing(view)
  svg.setAttribute('class', 'body-map')
  if (height) svg.style.height = `${height}px`
  else svg.style.width = '100%'
  svg.setAttribute('role', onRegion ? 'group' : 'img')
  svg.setAttribute('aria-label', label)

  const named = new Set()
  for (const region of svg.querySelectorAll('.muscle')) {
    const groups = groupsOf(region)
    region.dataset.step = step(groups)
    if (!onRegion) continue
    // Four quad regions are one muscle: one stop for a keyboard or VoiceOver.
    const key = region.dataset.groups
    if (named.has(key)) {
      region.setAttribute('aria-hidden', 'true')
      continue
    }
    named.add(key)
    region.setAttribute('role', 'button')
    region.setAttribute('tabindex', '0')
    region.setAttribute('aria-label', regionLabel(groups))
    region.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault()
      onRegion(groups)
    })
  }

  if (onRegion) {
    svg.addEventListener('click', (e) => {
      if (e.target.closest('[data-inert]')) return
      const region =
        e.target.closest('[data-groups]') ?? nearestRegion(svg, e.clientX, e.clientY)
      if (region) onRegion(groupsOf(region))
    })
  }
  return svg
}

/* -------------------------------------------------------------- thumbnails */

/** The ramp steps a role borrows on a workout's own figures. */
export const ROLE_STEP = { primary: 4, secondary: 2 }

/**
 * Each drawing once, as a `<symbol>` in one hidden svg: the outline filled flat,
 * and every region invisible until a thumbnail lights it through a custom
 * property. A thumbnail is then one `<use>` behind one shared clip, so a list
 * of them is not a list of drawings.
 *
 * Styled inline, because a rule scoped to the sprite does not reach a `<use>`.
 */
let sprite = null

function thumbSprite() {
  if (sprite) return sprite
  const host = s('svg', { class: 'body-sprite', 'aria-hidden': 'true', width: 0, height: 0 })
  const views = BODY_VIEWS.map((view) => {
    const svg = drawing(view)
    const { width, height } = svg.viewBox.baseVal
    const symbol = s('symbol', { id: `body-thumb-${view.id}`, viewBox: `0 0 ${width} ${height}`, overflow: 'visible' })

    const silhouette = svg.querySelector('[id$="-outline"]')
    for (const path of silhouette.querySelectorAll('path')) {
      path.style.fill = 'var(--thumb-body)'
      path.style.stroke = 'none'
    }
    const regions = [...svg.querySelectorAll('.muscle')].map((el, i) => {
      const name = `--lit-${view.id}-${i}`
      el.removeAttribute('class')
      el.style.fill = `var(${name}, none)`
      el.style.stroke = `var(${name}-edge, none)`
      el.style.strokeWidth = '0.8px'
      return { groups: groupsOf(el), name, el }
    })
    symbol.append(silhouette, ...regions.map((r) => r.el))
    host.append(symbol)
    for (const half of ['upper', 'lower']) {
      host.append(
        s(
          'clipPath',
          { id: `body-thumb-${view.id}-${half}` },
          s('path', { d: pieceClip(view.id, half, width) })
        )
      )
    }
    return { id: view.id, regions, groups: regions.flatMap((r) => r.groups), width, height }
  })
  document.body.append(host)
  sprite = { views }
  return sprite
}

/**
 * One exercise as half a body: the half and side that show its primary muscles.
 * With no muscles chosen, the plain upper half.
 */
export function bodyThumb(muscles) {
  const { views } = thumbSprite()
  const all = muscles ?? { primary: [], secondary: [] }
  const piece = pickPiece(views, all)
  const view = views.find((v) => v.id === piece.view)
  const lit = inHalf(all, piece.half)

  const svg = s(
    'svg',
    {
      class: 'body-thumb',
      viewBox: pieceBox(piece.half, view.width).join(' '),
      dataset: piece,
      'aria-hidden': 'true',
    },
    s(
      'g',
      { 'clip-path': `url(#body-thumb-${view.id}-${piece.half})` },
      s('use', { href: `#body-thumb-${view.id}`, x: 0, y: 0, width: view.width, height: view.height })
    )
  )
  for (const region of view.regions) {
    const role = regionRole(region.groups, lit)
    if (!role) continue
    svg.style.setProperty(region.name, `var(--lit-${role})`)
    svg.style.setProperty(`${region.name}-edge`, 'var(--thumb-body)')
  }
  return svg
}
