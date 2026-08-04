import { h, haptic } from '../lib/dom.js'
import { findFoodByBarcode } from '../lib/db.js'
import { adoptDraft, fetchByBarcode, isOnline } from '../lib/off.js'
import { card, notice, textInput, labelledField } from '../lib/ui.js'
import { pushServing } from './serving.js'
import { pushCustom } from './custom.js'

/**
 * Barcode scanning.
 *
 * Every failure mode here has a way forward rather than a dead end: no camera
 * permission falls back to typing the digits, an unknown barcode offers to
 * create the food with the code prefilled, and a product with no nutrition
 * data hands off to the custom form instead of pretending it worked.
 */

const FORMATS = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'CODE_128', 'CODE_39', 'ITF']

/**
 * `onStage` is passed straight through to every panel this can end on, and is
 * never read here.
 *
 * Scanning is a way of NAMING a food, not a separate place to put one. Whatever
 * the camera finds ends up on the serving panel or in the custom editor, and
 * both of those are the same screens a recent or a search result opens — so
 * they must offer the same destinations. They did not: a food found by barcode
 * could only be logged, while the same food found by typing three letters could
 * also go on a plate.
 */
export function pushScan(ctx, { date, block, onStage }) {
  ctx.push({
    title: 'Scan',
    render: (c) => {
      const stage = h('div', { class: 'flex flex-col gap-[20px]' })
      let controls = null
      let stopped = false

      const stopCamera = () => {
        stopped = true
        try {
          controls?.stop()
        } catch {
          /* already stopped */
        }
        controls = null
      }
      c.onDispose(stopCamera)

      /* ---------------------------------------------------------- lookups */

      async function handleCode(code) {
        stopCamera()
        haptic(10)
        showLooking(code)

        // Spec 9: a barcode already in the library is reused, not duplicated.
        const known = await findFoodByBarcode(code)
        if (known) {
          pushServing(c, { food: known, date, block, onStage })
          return
        }

        if (!isOnline()) {
          showNoMatch(code, 'You are offline, so this barcode could not be looked up.')
          return
        }

        try {
          const result = await fetchByBarcode(code)
          if (!result) {
            showNoMatch(code, 'Open Food Facts has no product with this barcode.')
            return
          }
          if (!result.hasNutrition) {
            // The product exists but carries no numbers. Hand off with what we
            // do know rather than failing silently.
            pushCustom(c, {
              date,
              block,
              initial: { ...result.draft, source: 'custom', per100: null },
              onStage,
            })
            return
          }
          const food = await adoptDraft(result.draft)
          pushServing(c, { food, date, block, onStage })
        } catch {
          showNoMatch(code, 'Could not reach Open Food Facts.')
        }
      }

      /* ----------------------------------------------------------- stages */

      function showLooking(code) {
        stage.replaceChildren(
          h(
            'div',
            { class: 'flex flex-col items-center gap-[10px] py-[50px]' },
            h('div', { class: 'text-[16px] font-semibold' }, 'Looking up…'),
            h('div', { class: 'text-[13px] text-muted' }, code)
          )
        )
      }

      function showNoMatch(code, reason) {
        stage.replaceChildren(
          notice(reason, { iconName: 'info' }),
          card(
            h(
              'div',
              { class: 'flex flex-col gap-[10px] p-[20px]' },
              h('div', { class: 'text-[16px] font-semibold' }, 'Create this food'),
              h(
                'div',
                { class: 'text-[13px] leading-snug text-muted' },
                `The barcode ${code} will be saved with it, so the next scan finds it instantly.`
              ),
              h(
                'button',
                {
                  class: 'btn-primary',
                  onclick: () =>
                    pushCustom(c, { date, block, initial: { barcode: code }, onStage }),
                },
                'Create it'
              )
            )
          ),
          h('button', { class: 'btn-secondary', onclick: start }, 'Scan again')
        )
      }

      function showManualEntry(heading, body, { retry = false } = {}) {
        let code = ''
        const submit = h(
          'button',
          {
            class: 'btn-primary',
            disabled: true,
            onclick: () => handleCode(code.trim()),
          },
          'Look up'
        )

        stage.replaceChildren(
          card(
            h(
              'div',
              { class: 'flex flex-col gap-[10px] p-[20px]' },
              h('div', { class: 'text-[16px] font-semibold' }, heading),
              h('div', { class: 'text-[13px] leading-snug text-muted' }, body),
              retry
                ? h(
                    'button',
                    { class: 'btn-primary', onclick: start },
                    'Allow camera access'
                  )
                : null
            )
          ),
          h(
            'div',
            { class: 'flex flex-col gap-[10px]' },
            labelledField({
              label: 'Or type the barcode',
              children: textInput({
                placeholder: '0123456789012',
                inputmode: 'numeric',
                onInput: (v) => {
                  code = v
                  submit.disabled = v.trim().length < 6
                },
              }),
            }),
            submit
          ),
          h(
            'button',
            {
              class: 'btn-secondary',
              onclick: () => pushCustom(c, { date, block, initial: {}, onStage }),
            },
            'Create a custom food'
          )
        )
      }

      /* ----------------------------------------------------------- camera */

      async function start() {
        stopped = false
        const video = h('video', {
          class: 'h-full w-full object-cover',
          playsinline: true,
          muted: true,
          'aria-label': 'Camera viewfinder',
        })

        stage.replaceChildren(
          h(
            'div',
            { class: 'relative overflow-hidden rounded-[24px] border border-outline bg-black', style: { aspectRatio: '3 / 4' } },
            video,
            // Framing guide: four corner brackets and a centre line.
            h(
              'div',
              { class: 'pointer-events-none absolute inset-0 flex items-center justify-center' },
              h('div', {
                class: 'h-[38%] w-[78%] rounded-[14px]',
                style: {
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)',
                  outline: '2px solid rgba(255,255,255,0.9)',
                },
              })
            ),
            h(
              'div',
              {
                class:
                  'pointer-events-none absolute inset-x-0 bottom-0 p-[20px] text-center text-[14px] font-semibold text-white',
              },
              'Line the barcode up inside the frame'
            )
          ),
          h(
            'button',
            {
              class: 'btn-secondary',
              onclick: () =>
                showManualEntry(
                  'Type the barcode',
                  'Useful when the label is scuffed or the light is bad.'
                ),
            },
            'Enter barcode manually'
          )
        )

        try {
          const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] =
            await Promise.all([import('@zxing/browser'), import('@zxing/library')])

          if (stopped) return

          const hints = new Map()
          hints.set(
            DecodeHintType.POSSIBLE_FORMATS,
            FORMATS.map((f) => BarcodeFormat[f]).filter((v) => v != null)
          )
          const reader = new BrowserMultiFormatReader(hints)

          controls = await reader.decodeFromConstraints(
            { video: { facingMode: { ideal: 'environment' } } },
            video,
            (result) => {
              if (!result || stopped) return
              handleCode(result.getText())
            }
          )
          if (stopped) stopCamera()
        } catch (err) {
          if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
            showManualEntry(
              'Camera access is off',
              'Scanning needs the camera. Turn it back on for this site in your browser settings, then try again.',
              { retry: true }
            )
          } else if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') {
            showManualEntry('No camera found', 'This device has no camera available to scan with.')
          } else {
            showManualEntry(
              'Could not start the camera',
              'Something went wrong opening the camera on this device.',
              { retry: true }
            )
          }
        }
      }

      // getUserMedia is unavailable on plain HTTP, which is why this ships to
      // Pages over HTTPS. Locally it works on localhost too.
      if (!navigator.mediaDevices?.getUserMedia) {
        showManualEntry(
          'Scanning is unavailable here',
          'The camera needs a secure connection. Open the app over HTTPS to scan.'
        )
      } else {
        start()
      }

      return stage
    },
  })
}
