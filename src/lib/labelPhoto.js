import { h } from './dom.js'
import { icon } from './icons.js'

/**
 * The label photo: a picture of the Nutrition Facts panel, pinned above the
 * form you are copying it into.
 *
 * Deliberately not text recognition. The numbers still get typed — but they get
 * typed while the label is on screen rather than pinched in the other hand,
 * which is the friction the "scan the label" instinct is actually reaching for.
 * It costs no bytes, has no failure modes, and it is the fallback any OCR would
 * need anyway for bad light, curved packaging and two-column EU labels. When
 * recognition does land it reads `field.file` — that is why this hands back the
 * File rather than a data URL.
 *
 * `<input capture>` rather than `getUserMedia`: iOS opens its own camera app,
 * so there is no permission dance, no viewfinder to build, no secure-context
 * gate, full sensor resolution, and the OS pinch-to-zoom while framing — all of
 * which the barcode scanner had to be written by hand.
 */

/** Zoomed width, as a percentage of the strip. Enough to read 6pt small print. */
const ZOOM_PCT = 260

/** Strip height. Two fields stay visible beneath it on the smallest phone. */
const STRIP_H = 200

export function labelPhotoField() {
  const slot = h('div')
  let file = null
  let url = null

  const input = h('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    class: 'sr-only',
    tabindex: '-1',
    onchange: (e) => {
      const picked = e.target.files?.[0]
      // Cleared so retaking and choosing the same file still fires a change.
      e.target.value = ''
      if (!picked) return
      release()
      file = picked
      paint()
    },
  })

  /**
   * Idempotent, and safe to call while a photo is still on screen: revoking the
   * URL does not blank an <img> that has already loaded it, and `strip()` mints
   * a fresh one from the retained File if it ever needs to repaint. That is what
   * lets the sheet run this on every re-render without the photo disappearing.
   */
  function release() {
    if (url) URL.revokeObjectURL(url)
    url = null
  }

  function button() {
    return h(
      'button',
      { class: 'btn-secondary gap-[10px]', onclick: () => input.click() },
      icon('camera', { size: 20, stroke: 2 }),
      'Photograph the label'
    )
  }

  function strip() {
    if (!url) url = URL.createObjectURL(file)
    let zoomed = false

    const img = h('img', {
      src: url,
      alt: 'The nutrition label you photographed',
      class: 'block h-auto max-w-none',
      style: { width: '100%' },
      draggable: 'false',
    })

    // Fit shows the whole panel so you can find the row; zoom makes it legible
    // once you have. Panning at zoom is the scroll container doing its job, so
    // there is no gesture code here.
    //
    // The controls sit ABOVE the photo rather than floating on it. A nutrition
    // panel is printed edge to edge, so an overlaid button always lands on a
    // number — and the one thing this element exists to do is let you read every
    // number on it.
    const zoomBtn = h(
      'button',
      {
        class: 'chip-sm',
        onclick: () => {
          zoomed = !zoomed
          img.style.width = zoomed ? `${ZOOM_PCT}%` : '100%'
          zoomBtn.textContent = zoomed ? 'Fit' : 'Zoom in'
        },
      },
      'Zoom in'
    )

    return h(
      'div',
      { class: 'flex flex-col gap-[10px]' },
      h(
        'div',
        { class: 'section-head' },
        h('div', { class: 'section-label' }, 'Label'),
        h(
          'div',
          { class: 'flex gap-[10px]' },
          zoomBtn,
          h(
            'button',
            {
              class: 'chip-sm',
              onclick: () => {
                release()
                file = null
                paint()
              },
            },
            'Remove'
          )
        )
      ),
      h(
        'div',
        { class: 'overflow-hidden rounded-[24px] border border-outline bg-black' },
        h(
          'div',
          {
            class: 'overflow-auto overscroll-contain',
            style: { height: `${STRIP_H}px` },
          },
          img
        )
      )
    )
  }

  /**
   * Sticky lives on the slot itself, not on an inner wrapper: a sticky element
   * can only travel inside its own parent's box, so wrapping it in a div its own
   * height would pin it to nothing. The slot's parent is the whole form, which
   * is the distance it needs to travel.
   *
   * Bled to the sheet's edges so the fields scroll UNDER the photo rather than
   * beside it. A label that scrolls away with the fields it exists to help you
   * fill in would be decoration.
   *
   * `pb-20 -mb-20` is doing one job: the form's 20px flex gap is transparent, so
   * without it the fields reappear in the gap under the photo, clipped halfway.
   * The padding paints that gap in canvas and the negative margin gives the
   * space back, leaving the same 20px rhythm as every other group in the form.
   *
   * The hairline is where the clip happens. A field cut off mid-pill reads as a
   * rendering fault until there is an edge for it to be cut off BY; the same 1px
   * that would be clutter on a static screen is what makes the scroll legible.
   */
  function paint() {
    slot.setAttribute(
      'class',
      file
        ? 'sticky top-0 z-10 -mx-[20px] -mb-[20px] border-b border-outline bg-canvas px-[20px] pb-[20px]'
        : ''
    )
    slot.replaceChildren(file ? strip() : button(), input)
  }

  paint()

  return {
    node: slot,
    release,
    get file() {
      return file
    },
  }
}
