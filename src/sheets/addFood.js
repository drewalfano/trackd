import { h, repaint } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { openSheet } from '../lib/sheet.js'
import { toast } from '../lib/toast.js'
import {
  getSettings,
  recentFoods,
  searchFoods,
  getFood,
  getMeal,
  deleteEntry,
  getPlate,
  savePlate,
  clearPlate,
} from '../lib/db.js'
import { computeMacros, emptyTotals, addTotals } from '../lib/compute.js'
import { quickLogFood, logMeal, logPlate, defaultServing } from '../lib/logging.js'
import { plateBar, pushPlate, resolvePlate, plateLoggedToast } from './plate.js'
import { macroLine, card, emptyRow, listRow, slot } from '../lib/ui.js'
import { foodTile } from '../lib/foodTile.js'
import { servingLabel, qty, unitLabel, pluralize } from '../lib/format.js'
import { blockForTime, formatDayLabel, todayStr } from '../lib/dates.js'
import { adoptDraft, isOnline, searchProducts } from '../lib/off.js'
import { state } from '../state.js'
import { pushServing } from './serving.js'
import { pushMeal } from './meal.js'
import { pushQuickAdd } from './quickAdd.js'
import { pushCustom } from './custom.js'
import { pushScan } from './scan.js'

/**
 * The add sheet.
 *
 * Section 3 of the brief is the whole argument for this screen: the app is a
 * recall interface, not a database interface. Favourites and Recents are the
 * front door and sit above the fold; Scan, Search and Custom are the
 * fallback for the handful of genuinely new foods.
 *
 * Search left the route row in v1.2.4 and became a bar of its own. Three routes
 * side by side said the three were alternatives of equal standing, and they are
 * not: scanning and typing numbers are things you do to a food the app has
 * never seen, while search is how you ask a question. A field is the shape
 * everybody already reads as "ask a question here", and it costs the row
 * nothing — the two buttons left behind get wider, not lonelier.
 */

/**
 * Shorter than the Open Food Facts panel's 300.
 *
 * That number is pacing a network request and is there to stop the app talking
 * to a server on every keystroke. This search reads an in-memory list, so the
 * only thing being paced is a repaint, and the wait is pure lag.
 */
const SEARCH_DEBOUNCE_MS = 120

/**
 * Row that opens on tap and logs on `+`.
 *
 * **Two verbs, two visible targets, and no long-press.** This is the third
 * arrangement the row has had and the first where nothing important is hidden.
 * It went pencil-and-tap, then `+`-stages-and-tap-logs with adjustment demoted
 * to an undocumented long-press, and now this.
 *
 * `+` means one thing everywhere in the app: commit this, now, at the amount
 * shown. The row itself opens the serving sheet, which is where the amount can
 * be changed and — since the plate lost the `+` it used to live on — where a
 * plate is now assembled.
 *
 * What this gives up is tap-to-log, which was the fastest path in the app and
 * was genuinely good. What it buys is that the fast path is now the SMALL
 * target rather than the whole row, so it is much harder to fire by accident
 * while scrolling; and that adjusting a serving is back to being a thing you
 * can see, instead of a gesture nobody was told about. The friction log's
 * question 28 was written to watch exactly that trade, and this is the answer.
 */
function pickRow({ title, subtitle, totals, onLog, onOpen }) {
  const row = h(
    'button',
    { class: 'row min-w-0 flex-1', onclick: onOpen },
    h(
      'div',
      { class: 'min-w-0 flex-1' },
      h('div', { class: 'truncate text-[16px] font-semibold leading-tight' }, title),
      h('div', { class: 'mt-[2px] truncate text-[12px] text-muted' }, subtitle),
      totals ? h('div', { class: 'mt-[4px]' }, macroLine(totals, { size: 12 })) : null
    )
  )

  return h(
    'div',
    { class: 'flex items-center' },
    row,
    h(
      'button',
      {
        class: 'icon-btn icon-btn-sm mr-[20px] bg-canvas',
        'aria-label': subtitle ? `Log ${title}, ${subtitle}` : `Log ${title}`,
        onclick: onLog,
      },
      icon('plus', { size: 18, stroke: 2.25 })
    )
  )
}

/**
 * One favourite, as a card in the rail.
 *
 * The card itself is `foodTile`, shared with Today's Quick add rail. What stays
 * here is the grammar — and it is now the SAME grammar as both the Recents row
 * below and the Today rail: the body opens, the `+` logs.
 *
 * The three surfaces disagreed for exactly one build. A favourite, a recent and
 * a quick-add tile are the same kind of thing pointed at from three places, and
 * a `+` that logged on one screen while staging a plate on another was one
 * glyph with two consequences, one of them a write you cannot see happen.
 */
function favCard({ title, subtitle, totals, onLog, onOpen }) {
  return foodTile({
    title,
    subtitle,
    totals,
    onBody: onOpen,
    bodyLabel: `Change the amount of ${title}`,
    onAction: onLog,
    actionLabel: subtitle ? `Log ${title}, ${subtitle}` : `Log ${title}`,
  })
}

/**
 * The search bar. A real field, and it filters the sheet in place.
 *
 * It was a button for one version: tap it and the Search panel pushed over the
 * top. That was the wrong shape for the common case. What someone types into
 * this box is nearly always a food they have eaten before — the library already
 * holds it, the answer is local and instant, and pushing a panel to fetch it
 * from the internet spends a screen transition and a network round trip to end
 * up somewhere the sheet could have shown without moving.
 *
 * So typing here swaps Favourites and Recents for Results, and clearing it puts
 * them back. Nothing navigates, the keyboard never has to be handed between two
 * inputs, and Escape or the clear button returns the sheet to where it started.
 *
 * Open Food Facts is still there, one tap down, under whatever the library
 * found. It is the answer to "this food is new", which is the rarer question and
 * now looks like the rarer question.
 */
function searchBar({ onInput, onClear }) {
  const input = h('input', {
    class: 'w-full min-w-0 bg-transparent text-[16px] font-medium',
    type: 'search',
    placeholder: 'Search foods…',
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    oninput: (e) => onInput(e.target.value),
    onkeydown: (e) => {
      if (e.key === 'Escape') onClear()
    },
  })

  // Hidden until there is something to clear, and it takes the `.field`'s own
  // right inset with it so the text does not end 20px short of the edge for a
  // button that is not there.
  const clear = h(
    'button',
    {
      class: 'icon-btn icon-btn-sm -mr-[10px] hidden shrink-0 bg-transparent',
      'aria-label': 'Clear search',
      onclick: onClear,
    },
    icon('close', { size: 18, stroke: 2.25 })
  )

  const field = h(
    'div',
    { class: 'field' },
    icon('search', { size: 18, class: 'shrink-0 text-muted' }),
    input,
    clear
  )

  field.input = input
  field.setClearable = (on) => clear.classList.toggle('hidden', !on)
  return field
}

/**
 * Route picker, not a tab set.
 *
 * `primary`, not `selected`. Scan renders solid because it is the route most
 * likely to be wanted, not because anything is chosen — nothing on this row has
 * a selected state, and it carried no `aria-pressed` to match the styling, so a
 * screen reader heard an ordinary button while the eye saw a picked one.
 *
 * Icon BESIDE the label, not above it, and 72px tall rather than 89 — the mock
 * is the authority on both. Stacked, the button was a tile and its label read
 * as a caption under a picture; side by side it reads as a line you press, and
 * the icon goes back to being a mark next to a word. It buys 17px of sheet
 * height on the way past, which Favourites spends.
 *
 * The mock's 176 × 72 keeps its height and gives up its width: two flex
 * children across a 375 sheet come to 162 each, and matching 176 would mean
 * breaking the page's own gutters to do it.
 *
 * 24px radius, per the mock — the one shape in the app that is deliberately NOT
 * a capsule. On a 72px box it reads rounder than it did on an 89px one without
 * the number changing, which is why it is still 24 and not more.
 *
 * The mock also carries 60% iOS corner smoothing. CSS has no equivalent — it
 * would take an SVG mask per button — so these are true rounded rects and read
 * very slightly sharper at the corners than the Figma file does.
 */
function actionButton({ iconName, label, primary, onclick }) {
  return h(
    'button',
    {
      class:
        'flex min-h-[72px] flex-1 items-center justify-center gap-[10px] rounded-[24px] ' +
        (primary ? 'bg-ink text-canvas' : 'bg-surface text-ink'),
      onclick,
    },
    // 24 and 16, both off the mock's own frame: 72 tall with 24 of padding top
    // and bottom leaves exactly 24 for the row, and the label is set to fill it.
    // The old 13px was sized to sit under an icon rather than beside one.
    icon(iconName, { size: 24 }),
    h('span', { class: 'text-[16px] font-semibold' }, label)
  )
}

export async function openAddFood({ date = state.date, block } = {}) {
  const settings = await getSettings()
  const targetBlock = block ?? blockForTime(new Date(), settings.blockThresholds)

  return openSheet({
    // One tap on a favourite logs immediately, so the day has to be legible
    // before the tap rather than discoverable after it. Only says so when the
    // answer is surprising — "Add to today" on the common path is noise.
    title: date === todayStr() ? 'Add Food' : `Add to ${formatDayLabel(date)}`,
    render: (ctx) => {
      const favouritesCard = h('div')
      const recentsCard = h('div')
      const resultsCard = h('div', { class: 'hidden' })
      // With no plate staged this took a full section gap for no height, so
      // the sheet opened with a 50px void under its header.
      const plateSlot = slot()

      let query = ''
      let searchTimer = null
      let controller = null

      /*
       * There was a "New food, with all the details" link here, under the
       * lists, and it is gone.
       *
       * It was the third way to type numbers into this sheet, and the comment
       * defending it claimed the full editor was "one tap away from inside
       * Custom", which was simply not true — Custom has never linked to
       * it. What Custom does have is a switch that saves what you typed as a
       * reusable food, and that covers the overlap: name, serving, macros. The
       * editor's extras are brand, barcode, label photo, the per-100 basis and
       * sodium, and every one of those is something you read off a packet.
       *
       * So the editor is kept for the routes that arrive holding a packet — an
       * unknown barcode, a scan with no nutrition data, a search that found
       * nothing — plus a New food button on the Food library screen, which is
       * where "add something to my library" was always the honest place to ask.
       * Choosing it cold from the add sheet, before there is a packet or a
       * failed search, is the case that never justified the line.
       */

      /** One row shape for Recents and Results, because they are one thing. */
      const foodRow = (food) => {
        const { quantity, unit } = defaultServing(food)
        return pickRow({
          title: food.name,
          subtitle:
            unit === 'serving'
              ? `${qty(quantity)} × ${servingLabel(food)}`
              : `${qty(quantity)} ${unitLabel(unit, quantity)}`,
          totals: computeMacros(food, quantity, unit),
          onLog: () => logAndClose(() => quickLogFood(food, { date, block: targetBlock }), food.name),
          onOpen: () =>
            pushServing(ctx, {
              food,
              date,
              block: targetBlock,
              onStage: (item) => addToPlate([item], food.name),
            }),
        })
      }

      const logAndClose = async (fn, label) => {
        const entries = await fn()
        ctx.close()
        const list = Array.isArray(entries) ? entries : [entries]
        toast(`Added ${label}`, {
          action: 'Undo',
          onAction: () => Promise.all(list.map((e) => deleteEntry(e.id))),
        })
      }

      /* ---------------------------------------------------------- the plate */

      /**
       * The plate keeps the day and block it was started with, so assembling at
       * 11pm and committing after midnight still lands where you meant.
       */
      const addToPlate = async (newItems, label) => {
        const plate = await getPlate()
        const next = {
          items: [...plate.items, ...newItems],
          date: plate.items.length ? plate.date : date,
          block: plate.items.length ? plate.block : targetBlock,
          startedAt: plate.startedAt ?? Date.now(),
        }
        await savePlate(next)
        await paintPlate()
        toast(`${label} added to your plate`)
      }

      const commitPlate = async () => {
        const plate = await getPlate()
        const entries = await logPlate(plate)
        await clearPlate()
        ctx.close()
        plateLoggedToast(entries)
      }

      async function paintPlate() {
        const plate = await getPlate()
        if (!plate.items.length) {
          repaint(plateSlot)
          return
        }
        const rows = await resolvePlate(plate.items)
        repaint(
          plateSlot,
          plateBar({
            rows,
            onOpen: () =>
              pushPlate(ctx, {
                plate,
                onCommitted: (entries) => {
                  ctx.close()
                  plateLoggedToast(entries)
                },
              }),
            onLog: commitPlate,
          })
        )
      }

      /* ------------------------------------------------ favourites + recents */

      async function paintLists() {
        const current = await getSettings()

        // Favourites are ordered by hand and never re-sort themselves. The
        // fixed position is what makes the tap muscle memory.
        const favNodes = []
        for (const fav of current.favourites) {
          if (fav.type === 'food') {
            const food = await getFood(fav.id)
            if (!food) continue
            const { quantity, unit } = defaultServing(food)
            favNodes.push(
              favCard({
                title: food.name,
                subtitle:
                  unit === 'serving'
                    ? `${qty(quantity)} × ${servingLabel(food)}`
                    : `${qty(quantity)} ${unitLabel(unit, quantity)}`,
                totals: computeMacros(food, quantity, unit),
                onLog: () =>
                  logAndClose(() => quickLogFood(food, { date, block: targetBlock }), food.name),
                onOpen: () =>
                  pushServing(ctx, {
                    food,
                    date,
                    block: targetBlock,
                    onStage: (item) => addToPlate([item], food.name),
                  }),
              })
            )
          } else {
            const meal = await getMeal(fav.id)
            if (!meal) continue
            let totals = emptyTotals()
            for (const item of meal.items) {
              const food = await getFood(item.foodId)
              if (food) totals = addTotals(totals, computeMacros(food, item.quantity, item.unit))
            }
            favNodes.push(
              favCard({
                title: meal.name,
                subtitle: pluralize(meal.items.length, 'item'),
                totals,
                onLog: () =>
                  logAndClose(() => logMeal(meal, { date, block: targetBlock }), meal.name),
                onOpen: () =>
                  pushMeal(ctx, {
                    meal,
                    date,
                    block: targetBlock,
                    onLogged: ({ block }) =>
                      logAndClose(() => logMeal(meal, { date, block }), meal.name),
                    // A meal on a plate expands into its items, so they can be
                    // adjusted individually rather than as one opaque lump.
                    onStage: () => addToPlate([...meal.items], meal.name),
                  }),
              })
            )
          }
        }

        favouritesCard.replaceChildren(
          h(
            'section',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-title' }, 'Your Favourites'),
            // An empty rail is a 150px card of nothing. With no favourites
            // pinned there is no row to scroll, so the empty state goes back to
            // a full-width card and says what the rail would have held.
            favNodes.length
              ? h('div', { class: 'food-rail' }, favNodes)
              : card(emptyRow('Pin the things you eat constantly. They stay put.'))
          )
        )

        const recents = (await recentFoods(30)).filter(
          (f) => !current.favourites.some((fav) => fav.type === 'food' && fav.id === f.id)
        )

        recentsCard.replaceChildren(
          h(
            'section',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-title' }, 'Recents'),
            card(
              recents.length
                ? recents.map(foodRow)
                : emptyRow('Anything you log shows up here.')
            )
          )
        )
      }

      /* -------------------------------------------------------- the results */

      /**
       * Typing swaps the two lists for one.
       *
       * `hidden` rather than emptying and repainting them: Favourites and
       * Recents are unchanged by a search and rebuilding them on every clear
       * would re-read the database and re-run the rail's layout to arrive back
       * at what was already on screen.
       */
      const showResults = (on) => {
        favouritesCard.classList.toggle('hidden', on)
        recentsCard.classList.toggle('hidden', on)
        resultsCard.classList.toggle('hidden', !on)
      }

      /**
       * A food the app has never held. It cannot be logged on tap the way every
       * other row here can — there is no default serving until it is in the
       * library — so it adopts first and opens the serving sheet, and the
       * chevron says as much.
       */
      const remoteRow = (draft) =>
        listRow({
          title: draft.name,
          subtitle: [draft.brand, draft.servingLabel].filter(Boolean).join(' · '),
          chevron: true,
          onclick: async () => {
            const food = await adoptDraft(draft)
            pushServing(ctx, { food, date, block: targetBlock })
          },
        })

      /**
       * One list. Your library first, then Open Food Facts, no second heading.
       *
       * The two were briefly separate sections, and the separation was an
       * implementation detail wearing a heading: local foods log on tap and
       * remote ones have to be adopted first, so they were filed apart. But
       * nobody types a word into a search box asking two questions. They ask
       * "where is this food", and the answer is one list — the ones you have
       * eaten at the top because they are the likely hit and they arrive with
       * no network at all, everything else under them.
       *
       * The difference in what a row does is carried by the row: yours have a
       * `+` and log on tap, the rest have a chevron and open the serving sheet.
       * That is the honest signal, and it does not need a heading to say it
       * twice.
       *
       * Rows go in as DIRECT children of the one card, appended as the network
       * answers, because `.card > * + *` is what draws the dividers — a
       * wrapper around the remote half would swallow them.
       */
      async function paintResults(q) {
        const found = await searchFoods(q, 30)

        // Guards against an earlier, slower query landing after a later one and
        // painting stale results over fresh ones.
        if (q !== query.trim()) return

        const list = card(found.map(foodRow))

        resultsCard.replaceChildren(
          h(
            'section',
            { class: 'flex flex-col gap-[10px]' },
            h('div', { class: 'section-title' }, 'Results'),
            list
          )
        )

        paintRemote(q, found, list)
      }

      /**
       * The trailing row: searching, offline, failed, or nothing found.
       *
       * It is a row in the same card rather than a notice beside it, so the
       * list has one edge and one set of dividers however it is going.
       */
      const setTail = (list, node) => {
        list.tail?.remove()
        list.tail = node
        if (node) list.appendChild(node)
      }

      async function paintRemote(q, local, list) {
        if (!isOnline()) {
          setTail(
            list,
            emptyRow(
              local.length
                ? 'Offline — only your library is searchable.'
                : 'Offline, and nothing in your library matches.'
            )
          )
          return
        }

        setTail(
          list,
          h('div', { class: 'row text-[14px] text-muted' }, 'Searching Open Food Facts…')
        )

        controller?.abort()
        controller = new AbortController()

        try {
          const products = await searchProducts(q, { signal: controller.signal })
          if (q !== query.trim()) return

          // A barcode already in the library is the same food twice on one
          // screen — once as something you have eaten, once as a stranger.
          const known = new Set(local.map((f) => f.barcode).filter(Boolean))
          const fresh = products.filter((r) => !known.has(r.draft.barcode))

          setTail(list, null)
          fresh.slice(0, 25).forEach(({ draft }) => list.appendChild(remoteRow(draft)))

          /**
           * Says so when the internet added nothing, even if the library found
           * something. Otherwise "Searching Open Food Facts…" simply disappears
           * and the list is left looking like it might still be loading — the
           * one state a search must never be ambiguous about.
           */
          if (!fresh.length) {
            setTail(
              list,
              local.length
                ? emptyRow('Nothing on Open Food Facts to add to this.')
                : emptyRow(`Nothing matches “${q}”.`, {
                    action: 'Create it',
                    onAction: () =>
                      pushCustom(ctx, { date, block: targetBlock, initial: { name: q } }),
                  })
            )
          }
        } catch (err) {
          if (err.name === 'AbortError') return
          setTail(
            list,
            emptyRow('Could not reach Open Food Facts.', {
              action: 'Try again',
              onAction: () => paintRemote(q, local, list),
            })
          )
        }
      }

      /**
       * Two characters, matching the Open Food Facts panel's own floor.
       *
       * One character matches most of a real library and the list that comes
       * back is noise — it costs a repaint of thirty rows to tell you nothing.
       */
      const runSearch = () => {
        clearTimeout(searchTimer)
        controller?.abort()
        const q = query.trim()
        bar.setClearable(query.length > 0)
        if (q.length < 2) {
          showResults(false)
          return
        }
        showResults(true)
        searchTimer = setTimeout(() => paintResults(q), SEARCH_DEBOUNCE_MS)
      }

      const onNetworkChange = () => runSearch()
      window.addEventListener('online', onNetworkChange)
      window.addEventListener('offline', onNetworkChange)

      const bar = searchBar({
        onInput: (value) => {
          query = value
          runSearch()
        },
        onClear: () => {
          query = ''
          bar.input.value = ''
          bar.input.focus()
          runSearch()
        },
      })

      ctx.onDispose(() => {
        clearTimeout(searchTimer)
        controller?.abort()
        window.removeEventListener('online', onNetworkChange)
        window.removeEventListener('offline', onNetworkChange)
      })

      paintLists()
      paintPlate()

      /* --------------------------------------------------------- route row */

      const routeRow = h(
        'div',
        { class: 'flex gap-[10px]' },
        // Typing the numbers yourself, rather than the full food editor: over a
        // month you type numbers in far more often than you author a food, and
        // the two read as duplicates side by side. The editor is still one tap
        // away, from inside this panel's save-as-a-food switch.
        //
        // **Called "Custom", which is what the mock called it all along.** It
        // shipped as "Quick add" for several versions, and that name stopped
        // being available the moment Today grew a Quick add rail — two
        // different things a tap apart cannot share a word, and the rail has
        // the better claim to it. A rail of foods you have already eaten IS a
        // quick add; typing four numbers into a form is a custom entry, which
        // is also the honest pairing with Scan beside it. Both buttons are
        // routes for a food the app has never seen: one reads the packet, one
        // is you typing it.
        actionButton({
          iconName: 'custom',
          label: 'Custom',
          onclick: () => pushQuickAdd(ctx, { date, block: targetBlock }),
        }),
        // Solid one goes on the right, per the mock. It is also the side a
        // right thumb reaches without moving the phone, and the only button
        // here anyone taps in a hurry.
        actionButton({
          iconName: 'scan',
          label: 'Scan',
          primary: true,
          onclick: () => pushScan(ctx, { date, block: targetBlock }),
        })
      )

      return h(
        'div',
        /**
         * One step of the scale between sections, half a step inside them: 20
         * here, 10 between a label and its card. The 30 this used to carry read
         * as a third value with nothing else in the sheet at 30 — every row,
         * card and gutter is already on 10/20 — so sections floated instead of
         * grouping. The bottom padding is the body's own 20; a further 10 here
         * put the last link at 30 from the edge, out of step with the 20 the
         * gutters hold on every other side.
         */
        { class: 'flex flex-col gap-[20px]' },
        // Above the routes rather than below the lists: it is the state of an
        // action in progress, and it should not have to be scrolled to.
        plateSlot,
        routeRow,
        // Under the routes rather than above them. Scan and Custom are the
        // two things you do to a food the app has never seen; this searches the
        // ones it has. Putting it first would open the sheet with the general
        // case above the specific ones.
        bar,
        favouritesCard,
        recentsCard,
        resultsCard
      )
    },
  })
}
