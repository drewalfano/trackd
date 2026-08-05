import { h, repaint } from '../lib/dom.js'
import { toast } from '../lib/toast.js'
import { parseDescription } from '../lib/describeRules.js'
import { resolveParsed, resolveModelItems } from '../lib/describeResolve.js'
import { describeLeftovers } from '../lib/describeModel.js'
import { hasAiKey } from '../lib/aiKey.js'
import { notice, slot } from '../lib/ui.js'

/**
 * Describing a meal in words.
 *
 * The panel is deliberately thin. It holds a field and a button, and every
 * decision about what the words mean happens in `describeRules` and
 * `describeResolve` — which is what lets the whole feature work with no key and
 * no network, and what keeps this file from becoming the place the feature
 * secretly lives.
 *
 * **Nothing is sent from here.** The rules run locally, the resolution chain
 * reads your library and the bundled staples table before it touches the
 * network at all, and the result goes onto the plate. The one control that
 * sends anything is on the plate, next to the rows it would send, and it is
 * never reached by pressing this button.
 *
 * The text is not cleared after a parse. Sheet panels keep their DOM when you
 * push past them, so coming back from the plate finds the sentence still here —
 * which matters because the fallback for this feature failing is editing what
 * you wrote, not typing it again.
 */

/** A `.field`, but tall and multi-line. The only input in the app that is. */
function describeField({ value, placeholder, onInput }) {
  const input = h('textarea', {
    class: 'w-full min-w-0 resize-none bg-transparent text-[16px] font-medium leading-snug',
    rows: '5',
    placeholder,
    autocapitalize: 'sentences',
    autocorrect: 'on',
    spellcheck: 'true',
    oninput: (e) => onInput?.(e.target.value, e),
  })
  input.value = value ?? ''
  const wrapper = h('div', { class: 'field items-start py-[14px]' }, input)
  wrapper.input = input
  return wrapper
}

/**
 * @param {object} ctx
 * @param {(items: object[]) => Promise<void>} onItems  what to do with the result
 */
export function pushDescribe(ctx, { onItems }) {
  ctx.push({
    title: 'Describe',
    render: (c) => {
      let text = ''
      let working = false
      let controller = null
      const status = slot()
      c.onDispose(() => controller?.abort())

      const field = describeField({
        value: '',
        // One line, not three. A placeholder long enough to wrap reads as
        // content already in the box, and this one has to look empty.
        placeholder: 'An omelette, a house salad and 1.5 pieces of sourdough',
        onInput: (v) => {
          text = v
          setBusy(null)
        },
      })

      const readBtn = h(
        'button',
        {
          class: 'btn-primary',
          disabled: true,
          onclick: async () => {
            if (working) return
            const input = text.trim()
            if (!input) return

            working = true
            setBusy('Reading…')
            repaint(status)

            try {
              const parsed = parseDescription(input)

              /**
               * Nothing at all came back — an empty sentence, or one that was
               * only a preamble. Say so rather than opening an empty plate,
               * and leave the words where they are so they can be edited.
               */
              if (!parsed.parts.length) {
                repaint(
                  status,
                  notice('Nothing in that reads as a food. Try naming what you ate.', {
                    iconName: 'alert',
                  })
                )
                return
              }

              const items = await resolveParsed(parsed)
              await onItems(items)
            } catch (err) {
              /**
               * Spec 9.1: a failure lands in the manual flow with the typed
               * text intact, rather than throwing the sentence away. The panel
               * keeps its DOM, so "intact" is the default and this only has to
               * say what happened.
               */
              repaint(
                status,
                notice(
                  'That could not be read. Your words are still here, or add the foods ' +
                    'the usual way.',
                  { iconName: 'alert' }
                )
              )
              toast(err.message || 'Could not read that')
            } finally {
              working = false
              setBusy(null)
            }
          },
        },
        'Make a plate'
      )

      /**
       * The override, for when the rules get the SHAPE wrong.
       *
       * Every other way into Gemini sends fragments, because the rules have
       * already placed everything they could and only the leftovers are worth
       * anyone else's opinion. This one exists because that assumes the rules
       * split correctly in the first place, and when they do not there is
       * nothing to hand over — "french toast made with 2 eggs and homemade
       * bread" arrived as three confident items, and no amount of editing three
       * rows puts them back together.
       *
       * So this skips the parse entirely and sends the sentence as written, as
       * a single unplaced span, which is exactly the case the prompt's SPLIT
       * half already handles. It is a second button rather than a fallback the
       * app chooses for you: the whole sentence leaving the device is a bigger
       * thing than a fragment leaving it, and it should be a thing you did.
       */
      const sendAllBtn = h(
        'button',
        {
          class: 'btn-secondary',
          disabled: true,
          onclick: async () => {
            if (working) return
            const input = text.trim()
            if (!input) return

            working = true
            setBusy('Sending…')
            repaint(status)

            controller?.abort()
            controller = new AbortController()

            try {
              const returned = await describeLeftovers({
                spans: [input],
                unresolved: [],
                signal: controller.signal,
              })
              const items = await resolveModelItems(returned, { signal: controller.signal })
              if (!items.length) {
                repaint(
                  status,
                  notice('Gemini did not find a food in that.', { iconName: 'alert' })
                )
                return
              }
              await onItems(items)
            } catch (err) {
              if (err.name === 'AbortError') return
              toast(err.message || 'Could not reach Gemini')
            } finally {
              working = false
              setBusy(null)
            }
          },
        },
        'Send it all to Gemini'
      )

      /** One place that knows what the two buttons say and when they are off. */
      function setBusy(label) {
        const empty = !text.trim()
        readBtn.disabled = empty || working
        sendAllBtn.disabled = empty || working
        readBtn.textContent = label === 'Reading…' ? label : 'Make a plate'
        sendAllBtn.textContent = label === 'Sending…' ? label : 'Send it all to Gemini'
      }

      c.setFooter(
        hasAiKey()
          ? h('div', { class: 'flex flex-col gap-[10px]' }, readBtn, sendAllBtn)
          : readBtn
      )

      /**
       * A field, one line of grey, and the button. Nothing else.
       *
       * This screen had four blocks of text on it before anything was typed: a
       * label repeating the sheet's own title, a placeholder three lines deep,
       * a hint explaining what the placeholder was already demonstrating, and
       * the standing line in a notice panel that outweighed the field it was
       * about. Four things asking to be read first is no hierarchy at all.
       *
       * So the label goes — the title says Describe and the placeholder shows
       * what that means. The hint goes with it, for the same reason. And the
       * standing line drops out of its panel into the muted paragraph the app
       * uses under every section heading in Settings, which is the weight an
       * always-true sentence should carry. The field is now the only thing on
       * the screen with a fill, which makes it the only thing to look at.
       */
      return h(
        'div',
        { class: 'flex flex-col gap-[10px]' },
        field,
        status,
        h(
          'p',
          { class: 'px-0 text-[12px] leading-snug text-muted' },
          'Anything the app cannot find in your foods or a food database is an educated ' +
            'estimate. Check it on the plate before you log it.'
        )
      )
    },
  })
}
