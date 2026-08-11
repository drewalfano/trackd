import { h, repaint, replay } from '../lib/dom.js'
import { toast } from '../lib/toast.js'
import { parseDescription } from '../lib/describeRules.js'
import { resolveParsed, resolveModelItems } from '../lib/describeResolve.js'
import { describeLeftovers } from '../lib/describeModel.js'
import { hasAiKey } from '../lib/aiKey.js'
import { notice, slot, busyLabel } from '../lib/ui.js'

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

/**
 * The one multi-line input in the app, and it is a PANEL with a textarea in it
 * rather than a tall `.field`.
 *
 * `.field` is a capsule. That is not a description of how it looks, it is what
 * the class is: 48px tall with a 24px radius, so the corner is exactly half the
 * height and the box comes out a true pill. Every one of the app's other inputs
 * is that shape. This one is a five-row textarea at **138px**, and it wore
 * `.field` anyway — same 24px corner on a box nearly three times the height, so
 * the radius came out 17% of it. A pill here would need a 69px corner. It was
 * the only `.field` in the app that was not a capsule, and nothing said so.
 *
 * `.panel` is the same fill and the same 24px radius, so **the rendered box does
 * not change by a pixel**. What changes is that the object is now named for what
 * it is. A tall rounded box is a container, and 24 is the container radius — the
 * corner is correct here for the reason it was wrong on `.field`. The control is
 * the textarea inside it, not the box around it.
 *
 * The app already makes this move in the other direction: `numberInput({ bare:
 * true })` drops the pill when the row's card is already the container, because
 * "a `.field` inside one draws a second box around the first". Same principle,
 * applied to the one input that outgrew the pill.
 *
 * The fill is load-bearing and is preserved — see the note on the render below:
 * this is the only thing on the screen with one, which is what makes it the only
 * thing to look at.
 */
function describeField({ value, placeholder, onInput }) {
  const input = h('textarea', {
    // `block`, because the wrapper is no longer a flex container. A textarea is
    // `inline-block` by default, so in a block box it sits on a line and takes
    // the line-height's descender space under it — 7px of dead air the old
    // `.field` was suppressing by being flex rather than by intent.
    class: 'block w-full min-w-0 resize-none bg-transparent text-[16px] font-medium leading-snug',
    rows: '5',
    placeholder,
    autocapitalize: 'sentences',
    autocorrect: 'on',
    spellcheck: 'true',
    oninput: (e) => onInput?.(e.target.value, e),
  })
  input.value = value ?? ''
  const wrapper = h('div', { class: 'panel px-[20px] py-[14px]' }, input)
  wrapper.input = input
  return wrapper
}

/**
 * The three points at which a wait stops being a wait.
 *
 * **6s: the copy changes.** A normal Flash round trip on this payload is a
 * couple of seconds, and `describeModel` will spend another 700ms plus a second
 * attempt on a dropped connection before it gives up. Six is roughly double
 * that, so this fires when something is genuinely slow rather than merely
 * unlucky. Only the words change; the mark keeps its cycle, because nothing has
 * actually happened yet and restarting it would say otherwise.
 *
 * **15s: an escape appears.** Past the point where anyone still believes it is
 * coming. A loop with no way out is worse than no animation at all, and until
 * now the only way to stop this was to close the sheet.
 *
 * **30s: it is over.** There is no timeout anywhere in `describeModel` — the
 * fetch has none, so a connection that opens and then goes nowhere hangs for as
 * long as the platform allows, which on cellular is a long way past any of
 * these. This is the ceiling, and it lands in the ordinary failure path.
 *
 * All three are reasoned starting points rather than measurements. The honest
 * way to set them is to watch real round trips on a real phone for a while.
 */
const WAIT_LONG_MS = 6000
const WAIT_ESCAPE_MS = 15000
const WAIT_CEILING_MS = 30000

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
      let waitTimers = []
      // Set only once a wait has run long enough to earn an escape, which is
      // also what turns the busy button back into a control — see `send`.
      let onStop = null
      const status = slot()

      const clearWaitTimers = () => {
        waitTimers.forEach(clearTimeout)
        waitTimers = []
      }
      c.onDispose(() => {
        controller?.abort()
        clearWaitTimers()
      })

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
            setBusy('read')
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
          /**
           * One control, three jobs, and which one it is doing is whatever its
           * label currently says.
           *
           * While a call is in flight this button IS the wait, so pressing it
           * can only mean the one thing the wait offers — and it offers nothing
           * until 15 seconds have passed, which is exactly when `onStop` gets
           * set and the button comes back off disabled.
           */
          onclick: () => (working ? onStop?.() : send()),
        },
        'Send it all to Gemini'
      )

      /**
       * The wait, and the three ways out of it.
       *
       * A function rather than the button's handler inline, because the failure
       * notice offers "Try again" and that is this same call from the top.
       */
      async function send() {
        if (working) return
        const input = text.trim()
        if (!input) return

        working = true
        setBusy('send')

        /**
         * **The wait happens inside the button that started it.**
         *
         * There was a panel above the field for this, and it was a worse idea:
         * pressing send greyed the button out and then described what the
         * greyed button was doing, in a box somewhere else. The control is
         * already the thing that claims the work. It changes what it says, the
         * mark starts moving in it, and nothing else on the screen moves at all.
         *
         * Painted BEFORE the first `await`, so it lands in the tap's own task
         * and the mark is breathing on the very next frame. After an await it
         * would start a round trip late, which is the exact fault this replaces:
         * a screen sitting still while something is happening to it.
         */
        const busy = busyLabel('Sending to Gemini')
        repaint(sendAllBtn, busy)
        // Last attempt's reason goes with it. Leaving it would put "Gemini did
        // not answer in time" above a button saying it is sending, which is the
        // screen contradicting itself about the same call.
        repaint(status)

        controller?.abort()
        controller = new AbortController()
        const live = controller

        // Which of the three exits was taken, since two of them arrive at the
        // catch as the same `AbortError` and mean opposite things.
        let stopped = false
        let timedOut = false

        clearWaitTimers()
        waitTimers = [
          setTimeout(() => {
            // The app's mark for "this reading was rewritten", which is what
            // this is. Only the words change; the mark keeps its cycle, because
            // nothing has actually happened — see `busyLabel`.
            busy.label.textContent = 'Still waiting on Gemini'
            replay(busy.label, 'reading-swap')
          }, WAIT_LONG_MS),
          /**
           * The escape lands on the same button, which is the whole reason it
           * is worth having there: the control you pressed to start this is the
           * control that stops it, and no new object arrives to offer it.
           *
           * The label goes back to naming an action rather than a state, and
           * the mark keeps breathing beside it — the words say what pressing it
           * does, the mark says the call is still out.
           */
          setTimeout(() => {
            busy.label.textContent = 'Stop waiting'
            replay(busy.label, 'reading-swap')
            onStop = () => {
              stopped = true
              live.abort()
            }
            sendAllBtn.disabled = false
          }, WAIT_ESCAPE_MS),
          setTimeout(() => {
            timedOut = true
            live.abort()
          }, WAIT_CEILING_MS),
        ]

        try {
          const returned = await describeLeftovers({
            spans: [input],
            unresolved: [],
            signal: live.signal,
          })
          const items = await resolveModelItems(returned, { signal: live.signal })
          if (!items.length) {
            settle('Gemini did not find a food in that.', { iconName: 'alert' })
            return
          }
          /**
           * No exit animation, on purpose. `onItems` pushes the plate in this
           * same tick, and the sheet's own resize plus `panel-in` carry the
           * whole footer away with the panel while the plate's rows arrive on
           * `row-in`. Settling the button back to its label first would put a
           * frame of "Send it all to Gemini" between the wait and the result.
           */
          await onItems(items)
        } catch (err) {
          if (err.name === 'AbortError') {
            if (stopped) {
              settle('Stopped. Your words are still here, or make a plate without Gemini.', {
                iconName: 'info',
                action: 'Try again',
                onAction: () => send(),
              })
              return
            }
            // Not stopped and not timed out means something else aborted this
            // call and owns the screen now. Leave whatever it put there.
            if (!timedOut) return
          }
          /**
           * **The diagnosis goes in the notice, not the toast.** This used to
           * be both: a notice carrying standing advice and a toast carrying
           * `err.message`, which is the half that actually says what went
           * wrong. "That key was refused. Check it in Settings" is not
           * something to show for two seconds and then take away.
           *
           * So the specific reason leads, the standing offer follows, and
           * "Try again" is a control rather than an instruction.
           */
          const reason = timedOut
            ? 'Gemini did not answer in time.'
            : err.message || 'Gemini could not be reached.'
          settle(`${reason} Your words are still here, or make a plate without Gemini.`, {
            iconName: 'alert',
            action: 'Try again',
            onAction: () => send(),
          })
        } finally {
          clearWaitTimers()
          onStop = null
          working = false
          // Puts the button's own label back, which is what unwinds the busy
          // contents and stops both animations. See `setBusy`.
          setBusy(null)
        }
      }

      /**
       * The wait ending in words instead of a plate.
       *
       * It lands above the field, in the slot the parse path's failures already
       * use, rather than in the button — a button says what pressing it does,
       * and "That key was refused. Check it in Settings" is not that. The button
       * goes back to offering the send, and the reason sits beside the words it
       * is about.
       *
       * `panel-in` is the app's fade for a panel whose contents changed, which
       * is what this is: the slot was empty or held the previous attempt's
       * notice, and the sheet's height animation carries the difference.
       */
      function settle(message, opts) {
        const n = notice(message, opts)
        n.classList.add('panel-in')
        repaint(status, n)
      }

      /**
       * One place that knows what the buttons say and when they are off.
       *
       * **Only the button you pressed says anything about being busy.** Both go
       * disabled — one call is in flight and a second would race it — but the
       * one that is not working keeps its ordinary label and just greys out,
       * which is what a disabled control already means.
       *
       * This used to put a busy label on whichever button was pressed while
       * leaving the other one greyed beside it, and the pair read as two things
       * loading at once with no way to tell which was actually doing the work.
       * The busy label is the thing that claims the work, so exactly one button
       * may ever carry it.
       *
       * **Send's busy label is no longer a label**, it is `busyLabel` — the
       * same claim with the sparkle moving in it, painted by `send` rather than
       * here, because only `send` knows which of the three things it currently
       * says. What this owns is putting the plain label BACK, which is also
       * what stops the animations: the busy contents are replaced by a text
       * node and both `<svg>` elements go with them.
       *
       * Make a plate keeps an ordinary busy label. Its work is local and
       * instant, there is nothing to wait on, and a mark that says "a model is
       * thinking" would be a lie about a parse that never leaves the device.
       */
      function setBusy(which) {
        const empty = !text.trim()
        readBtn.disabled = empty || working
        sendAllBtn.disabled = empty || working
        readBtn.textContent = which === 'read' ? 'Making your plate…' : 'Make a plate'
        if (which !== 'send') sendAllBtn.textContent = 'Send it all to Gemini'
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
