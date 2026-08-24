import { h } from './dom.js'

/**
 * The progressive blur behind floating chrome.
 *
 * A page scrolls underneath the tab bar rather than stopping at it, so without
 * this the bar sits on top of live text and both become hard to read. Purely
 * decorative — callers hide it from assistive tech and it never takes pointers.
 *
 * Two callers: `.tabbar-fade` and `.sheet-head-fade`. The sheet FOOTER's band
 * is a third band of the same family and deliberately not one of them — it is a
 * plain gradient over its own box; see the note on `SHEET_HEAD_RAMP` below for
 * what separates the two ends of a sheet.
 *
 * **A ramp is [radius, solid to %, transparent by %], measured from the deep
 * end.** `dir` is which way that measurement runs — `to top` for a band whose
 * deep end is its bottom edge, `to bottom` for one hanging from its top. Each
 * layer sits on top of the previous one and re-blurs its output, so radii
 * compound rather than replace.
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
export function fadeLayers(ramp, dir = 'to top') {
  return ramp.map(([radius, solid, clear]) => {
    const span = h('span')
    const mask = `linear-gradient(${dir}, #000 0%, #000 ${solid}%, transparent ${clear}%)`
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
 * **A page under the tab bar was held to have no such end, and it does.** That
 * exemption is what kept this band unchanged while the sheet's was rewritten,
 * and it was wrong in the one state it needed to be right in: `.screen` reserves
 * a bottom margin, so at full scroll the last card parks on a line and stops.
 * The line was 118px and the band is 159, which put 41px of veil over a row with
 * nowhere left to go — the same claim the sheet's band was making, on the same
 * evidence.
 *
 * The ramp does stay as it is. What changed is the reservation: `--nav-clear` is
 * now the band rather than the bar, so the resting line and the band's top edge
 * are the same edge and the ramp reaches over open page again.
 */
export const FADE_RAMP = [
  [1.5, 34, 62],
  [3, 16, 42],
  [5, 0, 24],
]

/**
 * The other ramp: the band under a sheet's header, hanging from its top edge.
 *
 * **A sheet has two ends and they are not the same argument.** The footer's
 * band is a plain gradient because it reaches full sheet colour at the button's
 * top edge — nothing survives behind the deep end for a blur to act on, so
 * three compositor snapshots a frame would buy nothing. See `.sheet-fade` in
 * styles.css, which makes that case at length.
 *
 * The header's band is the opposite case and is the tab bar's. Its deep end is
 * a title with no surface of its own, sitting over a list that runs on
 * underneath it — so what is behind it matters, and the only question is
 * whether it reads as receding or as clipped. It read as clipped: the scroller
 * used to END at the header, so the first row was cut through the middle by a
 * hard horizontal line the moment anything scrolled. A veil alone would have
 * moved that line rather than removed it. The blur is what makes the content
 * go away rather than stop.
 *
 * **Measured top-down over a 124px band** — an 84px header (44px controls
 * between two gutters) plus two gutters of rise below it. The veil is opaque
 * for the top 44 and ramps out over the remaining 80, so the blur is spent in
 * that 80: the first layer covers all of it, and the two deeper ones stack up
 * where the row is emerging and are gone well before the band's bottom edge.
 *
 * The radii run a little higher than the tab bar's 1.5/3/5. That band gets
 * 105px to ramp through and this one gets 80, and the effect is the distance
 * over which the blur changes, not the depth it reaches — the same softness
 * over a shorter run has to be steeper.
 */
export const SHEET_HEAD_RAMP = [
  [2, 35, 100],
  [4, 22, 72],
  [6, 10, 48],
]
