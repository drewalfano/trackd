import { h } from './dom.js'

/**
 * The progressive blur behind floating chrome.
 *
 * Content scrolls underneath the tab bar and under a sheet's footer rather than
 * stopping at them, so without this the controls sit on top of live text and
 * both become hard to read. Purely decorative — callers hide it from assistive
 * tech and it never takes pointers.
 *
 * **A ramp is [radius, solid to %, transparent by %], bottom-up.** Each layer
 * sits on top of the previous one and re-blurs its output, so radii compound
 * rather than replace.
 *
 * The radii are deliberately mild. The effect's depth comes from the gradient
 * veil layered over the blur, not from the radius — an aggressive blur reads as
 * frosted glass, this reads as content receding. Layer count is kept low for the
 * same reason it always is: every `backdrop-filter` costs the compositor its own
 * snapshot-and-blur of the region behind it, every frame, and these bands are
 * fixed over scrolling lists, so they pay it continuously.
 *
 * **The percentages stop short of 100 on purpose.** Running the mildest layer
 * the full height puts a 1.5px blur over text that is nowhere near the chrome
 * and has every reason to be legible. Blurring readable content is a cost with
 * no matching benefit: nothing is about to slide under the bar up there.
 */
export function fadeLayers(ramp) {
  return ramp.map(([radius, solid, clear]) => {
    const span = h('span')
    const mask = `linear-gradient(to top, #000 0%, #000 ${solid}%, transparent ${clear}%)`
    span.style.backdropFilter = `blur(${radius}px)`
    span.style.webkitBackdropFilter = `blur(${radius}px)`
    span.style.maskImage = mask
    span.style.webkitMaskImage = mask
    return span
  })
}

/**
 * One ramp, both bands.
 *
 * The tab bar's band is 159px, of which the bar occupies the bottom 88 (20 inset
 * plus 68 tall), leaving 71px of open page above it. 62% — 98px, ten above the
 * bar's top edge — is where the mildest layer has finished fading out.
 *
 * A sheet's footer is the same object at a slightly smaller size: a rounded
 * control 20px off the bottom edge with 20px gutters, 56px tall against the
 * bar's 68. Its band is therefore 147px rather than 159 — and because that is a
 * uniform scale of the whole geometry, these percentages come out identical and
 * are used unchanged. Only the pixel height differs; see `--sheet-fade`.
 */
export const FADE_RAMP = [
  [1.5, 34, 62],
  [3, 16, 42],
  [5, 0, 24],
]

