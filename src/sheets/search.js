import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { searchFoods, putFood, findFoodByBarcode } from '../lib/db.js'
import { searchProducts, isOnline } from '../lib/off.js'
import { computeMacros } from '../lib/compute.js'
import { card, emptyRow, notice, macroLine, slot } from '../lib/ui.js'
import { servingLabel } from '../lib/format.js'
import { pushServing } from './serving.js'
import { pushCustom } from './custom.js'

/**
 * Text search against Open Food Facts, with the local library layered on top.
 *
 * Local results float above remote ones and are marked, because a food already
 * in the library is the one whose numbers have been checked once already.
 */

const DEBOUNCE_MS = 300

/** Copy a normalized OFF draft into the local library, reusing by barcode. */
export async function adoptDraft(draft) {
  if (draft.barcode) {
    const existing = await findFoodByBarcode(draft.barcode)
    // Spec 9: a barcode already in the library is reused, never duplicated.
    if (existing) return existing
  }
  return putFood({ ...draft, source: draft.source || 'off' })
}

function resultRow({ title, subtitle, totals, badge, onclick }) {
  return h(
    'button',
    { class: 'row', onclick },
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      h(
        'div',
        { class: 'flex items-center gap-[10px]' },
        h('span', { class: 'min-w-0 flex-1 truncate text-[16px] font-semibold' }, title),
        badge
          ? h(
              'span',
              { class: 'chip h-[26px] shrink-0 bg-canvas px-[10px] text-[12px]' },
              badge
            )
          : null
      ),
      subtitle ? h('div', { class: 'mt-[2px] truncate text-[12px] text-muted' }, subtitle) : null,
      totals ? h('div', { class: 'mt-[4px]' }, macroLine(totals, { size: 12 })) : null
    ),
    icon('chevronRight', { size: 20, class: 'shrink-0 text-muted' })
  )
}

export function pushSearch(ctx, { date, block }) {
  ctx.push({
    title: 'Search',
    render: (c) => {
      let timer = null
      let controller = null
      let query = ''

      const results = h('div', { class: 'flex flex-col gap-[20px]' })
      const offlineNotice = slot()

      const input = h('input', {
        class: 'w-full min-w-0 text-[16px] font-semibold',
        type: 'search',
        placeholder: 'Search foods',
        enterkeyhint: 'search',
        autocomplete: 'off',
        autocorrect: 'off',
        spellcheck: 'false',
        oninput: (e) => {
          query = e.target.value
          clearTimeout(timer)
          timer = setTimeout(run, DEBOUNCE_MS)
        },
      })

      const field = h(
        'div',
        { class: 'field' },
        icon('search', { size: 18, class: 'shrink-0 text-muted' }),
        input
      )

      function syncOnline() {
        const online = isOnline()
        input.disabled = false // the local library stays searchable either way
        input.placeholder = online ? 'Search foods' : 'Search your library'
        offlineNotice.replaceChildren(
          online
            ? ''
            : notice(
                'You are offline. Open Food Facts is unavailable, but everything already in your library is still searchable.',
                { iconName: 'offline' }
              )
        )
      }

      async function run() {
        const q = query.trim()
        controller?.abort()

        if (q.length < 2) {
          results.replaceChildren(
            card(emptyRow('Type at least two characters.'))
          )
          return
        }

        const local = await searchFoods(q, 20)
        const localCard = h(
          'section',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Your library'),
          card(
            local.length
              ? local.map((food) =>
                  resultRow({
                    title: food.name,
                    subtitle: [food.brand, servingLabel(food)].filter(Boolean).join(' · '),
                    totals: computeMacros(food, 1, 'serving'),
                    badge: 'Saved',
                    onclick: () => pushServing(c, { food, date, block }),
                  })
                )
              : emptyRow('Nothing matching in your library.')
          )
        )

        const remoteSlot = h('div')
        results.replaceChildren(localCard, remoteSlot)

        if (!isOnline()) return

        remoteSlot.replaceChildren(
          h('div', { class: 'py-[30px] text-center text-[13px] text-muted' }, 'Searching…')
        )

        controller = new AbortController()
        try {
          const found = await searchProducts(q, { signal: controller.signal })
          const localBarcodes = new Set(local.map((f) => f.barcode).filter(Boolean))
          const fresh = found.filter((r) => !localBarcodes.has(r.draft.barcode))

          remoteSlot.replaceChildren(
            h(
              'section',
              { class: 'flex flex-col gap-[10px]' },
              h('div', { class: 'section-label' }, 'Open Food Facts'),
              card(
                fresh.length
                  ? fresh.slice(0, 25).map(({ draft }) =>
                      resultRow({
                        title: draft.name,
                        subtitle: [draft.brand, draft.servingLabel].filter(Boolean).join(' · '),
                        totals: computeMacros(draft, 1, 'serving'),
                        onclick: async () => {
                          const food = await adoptDraft(draft)
                          pushServing(c, { food, date, block })
                        },
                      })
                    )
                  : emptyRow('No results.', {
                      action: 'Create it',
                      onAction: () => pushCustom(c, { date, block, initial: { name: q } }),
                    })
              )
            )
          )
        } catch (err) {
          if (err.name === 'AbortError') return
          remoteSlot.replaceChildren(
            notice('Could not reach Open Food Facts.', {
              iconName: 'offline',
              action: 'Try again',
              onAction: run,
            })
          )
        }
      }

      const onNetworkChange = () => {
        syncOnline()
        if (query.trim().length >= 2) run()
      }
      window.addEventListener('online', onNetworkChange)
      window.addEventListener('offline', onNetworkChange)

      c.onDispose(() => {
        clearTimeout(timer)
        controller?.abort()
        window.removeEventListener('online', onNetworkChange)
        window.removeEventListener('offline', onNetworkChange)
      })

      syncOnline()
      results.replaceChildren(card(emptyRow('Type at least two characters.')))
      requestAnimationFrame(() => input.focus())

      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },
        field,
        offlineNotice,
        results,
        h(
          'button',
          {
            class: 'btn-secondary',
            onclick: () => pushCustom(c, { date, block, initial: { name: query.trim() } }),
          },
          'Create a custom food'
        )
      )
    },
  })
}
