import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import {
  listFoods,
  listMeals,
  getFood,
  getSettings,
  deleteFood,
  countEntriesForFood,
  isFavourite,
  toggleFavourite,
} from '../lib/db.js'
import { computeMacros, MACRO_ORDER, MACRO_META } from '../lib/compute.js'
import {
  backRow,
  card,
  listRow,
  emptyRow,
  segmented,
  macroLine,
  emptyState,
  notice,
} from '../lib/ui.js'
import { servingLabel, g, kcal, pluralize } from '../lib/format.js'
import { toast, confirm } from '../lib/toast.js'
import { openCustomFood } from '../sheets/custom.js'
import { openServingSheet } from '../sheets/serving.js'
import { favouritesSheet, mealsSheet } from '../sheets/library.js'
import { state } from '../state.js'
import { navigate } from '../router.js'

/**
 * The food library, reached from Settings.
 *
 * This is the database interface the rest of the app deliberately is not — the
 * place to go when something needs correcting, rather than part of the daily
 * logging path.
 *
 * Favourites and Saved meals sit at the top of it rather than at the Settings
 * root, where they used to. All three are the same job — curating what is
 * already stored — and grouping them here is what let the root drop from three
 * food rows to one without the library gaining a tap: `Foods ›` points straight
 * at this screen.
 */

// Kept at module scope so returning from a detail view lands you back where you
// were, filters and query intact.
const view = { query: '', filter: 'all', sort: 'used' }

const SORTS = {
  used: (a, b) => (b.useCount || 0) - (a.useCount || 0) || a.name.localeCompare(b.name),
  alpha: (a, b) => a.name.localeCompare(b.name),
  added: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
}

export function foodsScreen() {
  return createScreen(
    async ({ rerender }) => {
      const [foods, meals, settings] = await Promise.all([listFoods(), listMeals(), getSettings()])

      /**
       * Query, filter and sort repaint the list in place rather than going
       * through `rerender`.
       *
       * `rerender` is `mount()` — it replaces the screen's whole subtree,
       * including the input the user is typing into. Calling it from `oninput`
       * destroyed the field on every keystroke: the text survived, because the
       * replacement was built with the stored query, but the caret did not, and
       * on a phone the keyboard closes with it. One character per tap on the
       * field is not a search box.
       *
       * The Open Food Facts sheet already worked this way — see
       * the add sheet's own search. This makes the two agree.
       *
       * No debounce here, unlike that sheet. This filters an array already in
       * memory, so there is nothing to wait for; a debounce would only add lag.
       */
      const listSlot = h('div')
      const filterSlot = h('div')
      const sortSlot = h('div')

      function paintList() {
        const query = view.query.trim().toLowerCase()
        const filtered = foods
          .filter((f) => {
            if (view.filter === 'custom' && f.source !== 'custom') return false
            if (view.filter === 'scanned' && f.source !== 'off') return false
            if (!query) return true
            return `${f.name} ${f.brand || ''}`.toLowerCase().includes(query)
          })
          .sort(SORTS[view.sort])

        listSlot.replaceChildren(
          filtered.length
            ? card(
                filtered.map((food) =>
                  listRow({
                    title: food.name,
                    subtitle: [food.brand, servingLabel(food), `used ${food.useCount || 0}×`]
                      .filter(Boolean)
                      .join(' · '),
                    chevron: true,
                    onclick: () => navigate(`foods/${encodeURIComponent(food.id)}`),
                  })
                )
              )
            : card(
                emptyRow(
                  foods.length ? 'Nothing matches those filters.' : 'Nothing in the library yet.'
                )
              )
        )
      }

      // The segmented controls repaint themselves too, since `aria-pressed` is
      // what draws the selection and it is set at construction.
      function paintFilter() {
        filterSlot.replaceChildren(
          segmented({
            options: [
              { value: 'all', label: 'All' },
              { value: 'custom', label: 'Custom' },
              { value: 'scanned', label: 'Scanned' },
            ],
            value: view.filter,
            onChange: (v) => {
              view.filter = v
              paintFilter()
              paintList()
            },
          })
        )
      }

      function paintSort() {
        sortSlot.replaceChildren(
          segmented({
            options: [
              { value: 'used', label: 'Most used' },
              { value: 'alpha', label: 'A–Z' },
              { value: 'added', label: 'Recently added' },
            ],
            value: view.sort,
            onChange: (v) => {
              view.sort = v
              paintSort()
              paintList()
            },
          })
        )
      }

      const search = h(
        'div',
        { class: 'field' },
        icon('search', { size: 18, class: 'shrink-0 text-muted' }),
        h('input', {
          class: 'w-full min-w-0 text-[16px]',
          type: 'search',
          placeholder: 'Search your foods',
          value: view.query,
          autocomplete: 'off',
          autocorrect: 'off',
          spellcheck: 'false',
          oninput: (e) => {
            view.query = e.target.value
            paintList()
          },
        })
      )

      paintFilter()
      paintSort()
      paintList()

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[20px]' },
        backRow({ label: 'Settings', onclick: () => navigate('settings') }),
        h(
          'div',
          { class: 'flex items-start gap-[10px] px-0' },
          h(
            'div',
            { class: 'min-w-0 flex-1' },
            h('h1', { class: 'text-title font-semibold leading-tight' }, 'Food library'),
            h('p', { class: 'text-[12px] text-muted' }, pluralize(foods.length, 'food'))
          ),
          /**
           * The full editor's front door, and the only one that is not holding
           * a packet already.
           *
           * It used to be a link at the bottom of the add sheet, where it was
           * the third route to typing numbers on a screen that already had
           * Custom. Every other way into the editor arrives from something
           * specific — an unknown barcode, a scan with no nutrition data, a
           * search that found nothing — and this is the one remaining case:
           * deciding, cold, to put a food in the library. That decision belongs
           * on the screen that holds the library, next to the count of what is
           * in it, rather than on the sheet used to log lunch.
           *
           * A surface button, NOT the ink fill it was first given. Solid ink
           * plus a `+` is the floating button in the corner of every screen,
           * and that one means log something now. Two identical dark circles
           * doing different things on one screen is worse than no button here
           * at all — this is the ordinary `.icon-btn` every other control in
           * the app uses, and the FAB keeps its fill to itself.
           */
          h(
            'button',
            {
              class: 'icon-btn shrink-0',
              'aria-label': 'New food',
              onclick: async () => {
                await openCustomFood({ mode: 'create' })
                rerender()
              },
            },
            icon('plus', { size: 20, stroke: 2.25 })
          )
        ),

        // Above the search box, because they are about the library as a whole
        // and the search box is the start of looking inside it.
        card(
          listRow({
            title: 'Favourites',
            subtitle: pluralize(settings.favourites.length, 'pinned item'),
            chevron: true,
            onclick: () => favouritesSheet().then(rerender),
          }),
          listRow({
            title: 'Saved meals',
            subtitle: pluralize(meals.length, 'meal'),
            chevron: true,
            onclick: () => mealsSheet().then(rerender),
          })
        ),

        search,
        filterSlot,
        sortSlot,
        listSlot
      )
    },
    { watch: ['foods', 'meals', 'settings'], watchDate: false }
  )
}

/* ------------------------------------------------------------------ detail */

function nutritionTable(food) {
  const per100 = food.per100 || {}
  const perServing = computeMacros(food, 1, 'serving')

  const row = (label, a, b) =>
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'flex-1 text-[12px] font-medium' }, label),
      h('span', { class: 'w-[76px] text-right text-[12px]' }, a),
      h('span', { class: 'w-[76px] text-right text-[12px]' }, b)
    )

  return card(
    h(
      'div',
      { class: 'row' },
      h('span', { class: 'flex-1 text-[12px] font-semibold text-muted' }, ''),
      h(
        'span',
        { class: 'w-[76px] text-right text-[12px] font-semibold text-muted' },
        `Per 100 ${food.servingUnit}`
      ),
      h('span', { class: 'w-[76px] text-right text-[12px] font-semibold text-muted' }, 'Per serving')
    ),
    // Full words here, without the colour-coded suffix — "Calories cal" reads
    // badly, and the macro line directly above already carries the identity.
    ...MACRO_ORDER.map((macro) =>
      row(
        MACRO_META[macro].label,
        macro === 'kcal' ? kcal(per100.kcal) : `${g(per100[macro])} g`,
        macro === 'kcal' ? kcal(perServing.kcal) : `${g(perServing[macro])} g`
      )
    ),
    // Sodium is reference only: no target, and it never appears on Today.
    per100.sodium != null
      ? row('Sodium', `${g(per100.sodium)} mg`, `${g(perServing.sodium)} mg`)
      : null
  )
}

export function foodDetailScreen(id) {
  return createScreen(
    async ({ rerender }) => {
      const food = await getFood(id)
      if (!food) {
        return h(
          'div',
          { class: 'flex flex-col gap-[20px]' },
          libraryBackRow(),
          emptyState('Food not found', 'It may have been deleted.')
        )
      }

      const [entryCount, pinned] = await Promise.all([
        countEntriesForFood(id),
        isFavourite('food', id),
      ])

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[20px]' },
        libraryBackRow(),

        h(
          'div',
          { class: 'flex items-start gap-[10px] px-0' },
          h(
            'div',
            { class: 'min-w-0 flex-1' },
            h('h1', { class: 'text-title font-semibold leading-tight' }, food.name),
            food.brand ? h('p', { class: 'text-[12px] text-muted' }, food.brand) : null,
            h('div', { class: 'mt-[4px]' }, macroLine(computeMacros(food, 1, 'serving'), { size: 12 }))
          ),
          h(
            'button',
            {
              class: 'icon-btn',
              'aria-label': pinned ? 'Unpin from favourites' : 'Pin to favourites',
              onclick: async () => {
                const now = await toggleFavourite('food', id)
                toast(now ? 'Pinned to Favourites' : 'Unpinned')
                rerender()
              },
            },
            icon('star', { size: 19, filled: pinned })
          )
        ),

        nutritionTable(food),

        card(
          listRow({
            title: 'Serving',
            right: h('span', { class: 'text-[12px] text-muted' }, servingLabel(food)),
          }),
          listRow({
            title: 'Source',
            right: h(
              'span',
              { class: 'text-[12px] text-muted' },
              food.source === 'off' ? 'Open Food Facts' : 'Custom'
            ),
          }),
          food.barcode
            ? listRow({
                title: 'Barcode',
                right: h('span', { class: 'text-[12px] text-muted' }, food.barcode),
              })
            : null,
          listRow({
            title: 'Times logged',
            right: h('span', { class: 'text-[12px] text-muted' }, String(food.useCount || 0)),
          })
        ),

        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h(
            'button',
            {
              class: 'btn-primary',
              onclick: () => openServingSheet({ food, date: state.date }),
            },
            'Log this'
          ),
          h(
            'button',
            {
              class: 'btn-secondary',
              onclick: async () => {
                await openCustomFood({ initial: food, mode: 'edit' })
                rerender()
              },
            },
            'Edit food'
          ),
          h(
            'button',
            {
              class: 'btn-secondary',
              onclick: async () => {
                const ok = await confirm({
                  title: `Delete "${food.name}"?`,
                  message: entryCount
                    ? `${pluralize(entryCount, 'entry', 'entries')} already logged from this food ` +
                      'will stay exactly as they are. The numbers were recorded at the time.'
                    : 'It is removed from your library.',
                })
                if (!ok) return
                await deleteFood(id)
                toast('Deleted')
                navigate('foods')
              },
            },
            'Delete food'
          )
        ),

        entryCount
          ? notice(
              `${pluralize(entryCount, 'entry', 'entries')} in your history use this food. ` +
                'Editing it changes future logs only; past entries keep the numbers they were ' +
                'logged with.'
            )
          : null
      )
    },
    { watch: ['foods', 'entries'], watchDate: false }
  )
}

const libraryBackRow = () =>
  backRow({ label: 'Food library', onclick: () => navigate('foods') })
