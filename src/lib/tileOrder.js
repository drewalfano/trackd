/** Every tile the Trends grid can show, in the order a fresh install gets. */
export const TILE_IDS = ['calories', 'maintenance', 'streak', 'consistency', 'macros', 'weight']

/**
 * The stored arrangement made safe to render: unknown ids dropped, missing
 * ones appended, so a tile added in a later version shows up at the end
 * without wiping what was arranged.
 */
export function normaliseTiles(stored) {
  const known = (stored?.order || []).filter((id) => TILE_IDS.includes(id))
  const order = [...known, ...TILE_IDS.filter((id) => !known.includes(id))]
  return { order, variants: { ...(stored?.variants || {}) } }
}
