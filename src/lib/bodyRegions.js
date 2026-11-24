/**
 * What the body art's regions mean. Pure, so the tests can read the same rules
 * the drawing code does.
 */

/**
 * Regions drawn as part of the figure and never as a muscle, whatever their
 * `data-groups` says. The front's serratus is listed as lats, and the back
 * view has the lats themselves.
 */
export const UNTRAINED_REGIONS = ['serratus']

/** 'primary', 'secondary' or null for a region under one exercise or workout. */
export function regionRole(groups, { primary, secondary }) {
  if (groups.some((g) => primary.includes(g))) return 'primary'
  if (groups.some((g) => secondary.includes(g))) return 'secondary'
  return null
}

/** Primary and secondary across several exercises. Primary anywhere wins. */
export function rolesOf(maps, order) {
  const known = maps.filter(Boolean)
  const primary = new Set(known.flatMap((m) => m.primary))
  const secondary = new Set(known.flatMap((m) => m.secondary))
  return {
    primary: order.filter((g) => primary.has(g)),
    secondary: order.filter((g) => secondary.has(g) && !primary.has(g)),
  }
}

/* ------------------------------------------------------------- body halves */

const LOWER = ['quads', 'hamstrings', 'glutes', 'calves']
const SEEN_FROM_BEHIND = ['rearDelts', 'lats', 'traps', 'triceps', 'hamstrings', 'glutes', 'calves']

export const halfOf = (group) => (LOWER.includes(group) ? 'lower' : 'upper')

/**
 * The half of a drawing that shows an exercise: the one with the most of its
 * primary muscles, then the side those are usually seen from, then the front.
 * `views` is `[{ id, groups }]`, the groups each drawing has a region for.
 */
export function pickPiece(views, { primary, secondary }) {
  const wanted = primary.length ? primary : secondary
  let best = { view: views[0].id, half: 'upper', shown: 0, natural: 0 }
  for (const view of views) {
    for (const half of ['upper', 'lower']) {
      const here = wanted.filter((g) => halfOf(g) === half && view.groups.includes(g))
      const natural = here.filter((g) => SEEN_FROM_BEHIND.includes(g) === (view.id === 'back')).length
      const shown = here.length
      if (shown > best.shown || (shown === best.shown && natural > best.natural)) {
        best = { view: view.id, half, shown, natural }
      }
    }
  }
  return { view: best.view, half: best.half }
}

/** The muscles a piece draws: the ones that belong to its half of the body. */
export const inHalf = ({ primary, secondary }, half) => ({
  primary: primary.filter((g) => halfOf(g) === half),
  secondary: secondary.filter((g) => halfOf(g) === half),
})

/** Both halves are drawn at one scale: a square this many art units across. */
export const PIECE_SIDE = 212
const TOP = { upper: -9, lower: 134 }
const WAIST = { front: 41.5, back: 41 }

/** The square of the drawing a half is seen through. */
export const pieceBox = (half, width) => [width / 2 - PIECE_SIDE / 2, TOP[half], PIECE_SIDE, PIECE_SIDE]

/** Upper keeps head, arms and hands whole; lower keeps hips to feet, no hands. */
export function pieceClip(view, half, width) {
  const c = width / 2 + 0.3
  const b = WAIST[view]
  return half === 'lower'
    ? `M${c - b} 139 Q${c} 133 ${c + b} 139 V350 H${c - b}Z`
    : `M-5 -5 H200 V205 H${c + b} V149 Q${c + 18} 157 ${c} 167 Q${c - 18} 157 ${c - b} 149 V205 H-5Z`
}
