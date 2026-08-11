import { h } from './dom.js'

/**
 * The progressive blur behind floating chrome.
 *
 * A page scrolls underneath the tab bar rather than stopping at it, so without
 * this the bar sits on top of live text and both become hard to read. Purely
 * decorative — callers hide it from assistive tech and it never takes pointers.
 *
 * One caller now: `.tabbar-fade`. The sheet footer's band was the other and is
 * still there, but it is a plain gradient over its own box rather than a
 * progressive blur; see the note on `FADE_RAMP` below for what stopped this
 * applying to it.
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
 * One ramp, one band.
 *
 * The tab bar's band is 159px, of which the bar occupies the bottom 88 (20 inset
 * plus 68 tall), leaving 71px of open page above it. 62% — 98px, ten above the
 * bar's top edge — is where the mildest layer has finished fading out.
 *
 * It was two bands. A sheet's footer is the same object at a slightly smaller
 * size — a rounded control 20px off the bottom edge with 20px gutters, 56px tall
 * against the bar's 68 — so `.sheet-fade` was a uniform 147px scale of this
 * geometry and reused these percentages unchanged.
 *
 * **The scale was honest about the control and silent about the box**, which is
 * what broke it. A sheet's scroller reserves the footer's height, so its content
 * has a defined end to park at; the band was 147px against a 96px footer, stood
 * 51px above that line, and dimmed a row already at rest. It is now the footer's
 * own box with a one-gutter ramp, and shares none of this. See `.sheet-fade` in
 * styles.css.
 *
 * A page under the tab bar has no such end — there is always more below and the
 * band is entitled to say so — which is why this ramp stays as it is.
 */
export const FADE_RAMP = [
  [1.5, 34, 62],
  [3, 16, 42],
  [5, 0, 24],
]

