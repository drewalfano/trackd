import { h, repaint } from '../lib/dom.js'
import { toast } from '../lib/toast.js'
import { parseDescription } from '../lib/describeRules.js'
import { resolveParsed } from '../lib/describeResolve.js'
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
      const status = slot()

      const field = describeField({
        value: '',
        // One line, not three. A placeholder long enough to wrap reads as
        // content already in the box, and this one has to look empty.
        placeholder: 'An omelette, a house salad and 1.5 pieces of sourdough',
        onInput: (v) => {
          text = v
          readBtn.disabled = !v.trim() || working
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
            readBtn.disabled = true
            readBtn.textContent = 'Reading…'
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
              readBtn.disabled = !text.trim()
              readBtn.textContent = 'Make a plate'
            }
          },
        },
        'Make a plate'
      )

      c.setFooter(readBtn)

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
