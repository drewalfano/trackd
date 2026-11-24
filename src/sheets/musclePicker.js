import { h } from '../lib/dom.js'
import { MUSCLE_GROUPS, MUSCLE_LABELS } from '../lib/muscles.js'

/**
 * Which muscles one exercise trains, as a sheet panel.
 *
 * Nothing is filled in for an exercise the app does not know. A muscle is
 * primary or secondary and never both, so choosing it in one list takes it out
 * of the other. "No muscles" is an answer and is remembered as one.
 */
export function musclePanel({ name, start = null, note = null, saveLabel = 'Save', onSave }) {
  return {
    title: 'Choose muscles',
    render: (ctx) => {
      const primary = new Set(start?.primary)
      const secondary = new Set(start?.secondary)
      const chips = []
      let busy = false

      const submit = async (answer) => {
        if (busy) return
        busy = true
        try {
          await onSave(answer, ctx)
        } finally {
          busy = false
        }
      }
      const inOrder = (set) => MUSCLE_GROUPS.filter((g) => set.has(g))

      const saveBtn = h(
        'button',
        {
          class: 'btn-primary',
          type: 'button',
          onclick: () => submit({ primary: inOrder(primary), secondary: inOrder(secondary) }),
        },
        saveLabel
      )
      ctx.setFooter(
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          saveBtn,
          h(
            'button',
            { class: 'btn-secondary', type: 'button', onclick: () => submit({ primary: [], secondary: [] }) },
            'No muscles'
          )
        )
      )

      const sync = () => {
        for (const { el, set, group } of chips) el.setAttribute('aria-pressed', String(set.has(group)))
        saveBtn.disabled = !primary.size && !secondary.size
      }

      const list = (title, hint, set, other) =>
        h(
          'section',
          { class: 'flex flex-col gap-[10px]', role: 'group', 'aria-label': `${title} muscles` },
          h(
            'div',
            { class: 'flex flex-col gap-[2px]' },
            h('div', { class: 'section-title' }, title),
            h('span', { class: 'text-[12px] text-muted' }, hint)
          ),
          h(
            'div',
            { class: 'flex flex-wrap gap-[6px]' },
            MUSCLE_GROUPS.map((group) => {
              const el = h(
                'button',
                {
                  class: 'chip',
                  type: 'button',
                  onclick: () => {
                    if (set.has(group)) set.delete(group)
                    else {
                      set.add(group)
                      other.delete(group)
                    }
                    sync()
                  },
                },
                MUSCLE_LABELS[group]
              )
              chips.push({ el, set, group })
              return el
            })
          )
        )

      const body = h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        h(
          'div',
          { class: 'flex flex-col gap-[2px]' },
          h('p', { class: 'text-[16px] font-semibold' }, name),
          note ? h('p', { class: 'text-[12px] text-muted' }, note) : null
        ),
        list('Primary', 'Each set counts 1', primary, secondary),
        list('Secondary', 'Each set counts 0.5', secondary, primary)
      )
      sync()
      return body
    },
  }
}
