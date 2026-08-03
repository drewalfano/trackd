import './styles.css'

import { h, mount, clear } from './lib/dom.js'
import { icon } from './lib/icons.js'
import { checkStorage, getSettings, saveSettings, onChange } from './lib/db.js'
import { toast } from './lib/toast.js'
import { closeAnySheet } from './lib/sheet.js'
import { route, startRouter, navigate, currentPath } from './router.js'
import { rollOverIfNeeded, setDate } from './state.js'
import { todayStr } from './lib/dates.js'

import { todayScreen } from './screens/today.js'
import { logScreen } from './screens/log.js'
import { historyScreen } from './screens/history.js'
import { weightScreen } from './screens/weight.js'
import { settingsScreen } from './screens/settings.js'
import { foodsScreen, foodDetailScreen } from './screens/foods.js'
import { createOnboarding } from './screens/onboarding.js'
import { openAddFood } from './sheets/addFood.js'

const app = document.getElementById('app')

/* ------------------------------------------------------------------ theme */

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('mt:theme', theme)
  } catch {
    /* storage may be locked down; the default still works */
  }
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove()
  document.head.appendChild(
    h('meta', { name: 'theme-color', content: dark ? '#141414' : '#F0F0F0' })
  )
}

/* --------------------------------------------------------------- app shell */

const view = h('main', { class: 'screen', id: 'view' })

let currentScreen = null

let showToken = 0

/**
 * Swap screens only once the new one has actually rendered.
 *
 * A screen's first render is async — it reads IndexedDB — so mounting it as
 * soon as it is constructed puts an empty div on screen until the read
 * resolves. On a phone that is a visible white flash on every tap. The outgoing
 * screen stays put until the incoming one has content.
 */
async function show(factory) {
  const token = ++showToken
  const next = factory()
  await next.ready
  // A faster tap already started another navigation; this one is stale.
  if (token !== showToken) {
    next.destroy()
    return
  }
  currentScreen?.destroy()
  currentScreen = next
  mount(view, next.el)
  window.scrollTo(0, 0)
}

const TABS = [
  { path: 'today', label: 'Today', iconName: 'calendarFilled' },
  { path: 'weight', label: 'Weight', iconName: 'weightFilled' },
  { path: 'settings', label: 'Settings', iconName: 'gearFilled' },
]

/**
 * The blur ramp: [radius, solid to %, transparent by %], bottom-up.
 *
 * Each layer sits on top of the previous one and re-blurs its output, so the
 * radii compound rather than replace — about 6px effective at the bottom edge,
 * tapering to nothing by the top of the band.
 *
 * 6px is deliberately mild, because the Figma effect is a progressive blur of
 * 0 → 4 and the depth comes from the gradient fill layered over it, not from
 * the radius. An aggressive blur reads as frosted glass; this reads as content
 * receding.
 *
 * Three layers, not more. Every backdrop-filter costs the compositor its own
 * snapshot-and-blur of the region behind it, every frame, and this band is
 * fixed over a scrolling list — so it pays that continuously.
 */
const BLUR_RAMP = [
  [1.5, 60, 100],
  [3, 32, 66],
  [5, 0, 36],
]

/**
 * Progressive blur and gradient scrims behind the floating bar.
 *
 * Content scrolls underneath rather than stopping at it, so without this the
 * bar sits on top of live text and both become hard to read.
 * Purely decorative, so it is hidden from assistive tech and ignores pointers.
 */
function tabBarFade() {
  const layers = BLUR_RAMP.map(([radius, solid, clear]) => {
    const span = h('span')
    const mask = `linear-gradient(to top, #000 0%, #000 ${solid}%, transparent ${clear}%)`
    span.style.backdropFilter = `blur(${radius}px)`
    span.style.webkitBackdropFilter = `blur(${radius}px)`
    span.style.maskImage = mask
    span.style.webkitMaskImage = mask
    return span
  })

  return h(
    'div',
    { class: 'tabbar-fade', 'aria-hidden': 'true' },
    layers,
    h('span', { class: 'fade-veil' }),
    h('span', { class: 'fade-shade' })
  )
}

/**
 * The add button sits outside the pill, to its RIGHT, and is always available.
 * Both float clear of the bottom edge with content scrolling behind them.
 *
 * Right rather than left: it is the app's primary action and the only control
 * on this bar that is not navigation, so it belongs under the thumb rather than
 * across the hand. The tabs are destinations and can afford the longer reach.
 */
function tabBar() {
  /**
   * The Today tab means today.
   *
   * The date is shared across Today and Log on purpose — stepping back on one
   * and opening the other keeps your place, which is right for that pair. But
   * History also sets it, so tapping a row there and then reaching for the tab
   * left you on a past day, on a tab labelled Today, with only the forward
   * chevron to walk back one day at a time.
   *
   * Tapping the tab is the "go home" gesture rather than part of that pairing,
   * so it resets the day. Everything else about the shared date is unchanged.
   */
  // Purely decorative — the aria-current on each tab is what announces the
  // selection, so this is hidden from assistive tech rather than doubled up.
  const tabPill = h('span', { class: 'tab-pill', 'aria-hidden': 'true' })

  const tabButtons = TABS.map((tab) =>
    h(
      'button',
      {
        class: 'tab',
        'data-tab': tab.path,
        onclick: () => {
          if (tab.path === 'today') setDate(todayStr())
          navigate(tab.path)
        },
      },
      icon(tab.iconName, { size: 22 }),
      h('span', { class: 'text-[11px] font-bold' }, tab.label)
    )
  )

  return h(
    'nav',
    {
      class: 'pointer-events-none fixed inset-x-0 bottom-0 z-40 px-[20px]',
      style: { paddingBottom: 'var(--nav-inset)' },
    },
    h(
      'div',
      { class: 'pointer-events-auto mx-auto flex max-w-[430px] items-center gap-[10px]' },
      h('div', { class: 'tabbar' }, tabPill, tabButtons),
      h(
        'button',
        { class: 'add-btn', 'aria-label': 'Add food', onclick: () => openAddFood() },
        icon('plus', { size: 28, stroke: 2.25 })
      )
    )
  )
}

const nav = tabBar()
const fade = tabBarFade()

/** Whether the pill has been placed once. The first placement must not slide. */
let pillPlaced = false

/** The active tab gets the pill; the rest stay muted. */
function syncTabs(path) {
  const root = path.split('/')[0]
  const active =
    root === 'log' || root === 'history' ? 'today' : root === 'foods' ? 'settings' : root
  for (const btn of nav.querySelectorAll('[data-tab]')) {
    btn.setAttribute('aria-current', btn.dataset.tab === active ? 'page' : 'false')
  }

  const index = TABS.findIndex((tab) => tab.path === active)
  if (index < 0) return

  const pill = nav.querySelector('.tab-pill')
  // Opening straight onto Settings should find the pill already there, not
  // watch it travel across the bar on first paint. Suppress the transition for
  // that one placement, forcing a reflow so the next move still animates.
  if (!pillPlaced) {
    pill.style.transition = 'none'
    pill.style.transform = `translateX(${index * 100}%)`
    void pill.offsetWidth
    pill.style.transition = ''
    pillPlaced = true
    return
  }
  pill.style.transform = `translateX(${index * 100}%)`
}

/* ----------------------------------------------------------------- routing */

function defineRoutes() {
  route('today', () => show(todayScreen))
  route('log', () => show(logScreen))
  route('history', () => show(historyScreen))
  route('weight', () => show(weightScreen))
  route('settings', () => show(settingsScreen))
  route('foods', () => show(foodsScreen))
  route('foods/:id', (params) => show(() => foodDetailScreen(params.id)))
}

/* ------------------------------------------------------- service worker */

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  try {
    const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL,
    })

    // Never swap versions underneath someone mid-entry. Ask first.
    const promptUpdate = (worker) => {
      toast('A new version is ready.', {
        action: 'Update',
        duration: 20000,
        onAction: () => worker.postMessage({ type: 'SKIP_WAITING' }),
      })
    }

    if (reg.waiting) promptUpdate(reg.waiting)

    reg.addEventListener('updatefound', () => {
      const worker = reg.installing
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(worker)
      })
    })

    let reloading = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return
      reloading = true
      location.reload()
    })
  } catch (err) {
    console.warn('Service worker registration failed', err)
  }
}

/* --------------------------------------------------------- failure states */

/**
 * Spec 9: IndexedDB is unavailable in private browsing on some browsers.
 * Blocking on this is the honest move — a tracker that silently forgets is
 * worse than one that says it cannot run.
 */
function renderStorageBlocked() {
  mount(
    app,
    h(
      'div',
      { class: 'mx-auto flex min-h-svh max-w-md flex-col justify-center gap-3 px-6' },
      icon('alert', { size: 28, class: 'text-muted' }),
      h('h1', { class: 'text-[22px] font-bold' }, 'Storage is unavailable'),
      h(
        'p',
        { class: 'text-[15px] leading-snug text-muted' },
        'Macro Tracker keeps everything on this device, so it needs local storage to run. ' +
          'This usually means private browsing is on, or site data is blocked for this page.'
      ),
      h(
        'p',
        { class: 'text-[15px] leading-snug text-muted' },
        'Open the app in a normal window, or allow site data, then reload.'
      ),
      h('button', { class: 'btn-primary mt-2', onclick: () => location.reload() }, 'Reload')
    )
  )
}

/* -------------------------------------------------------------- first run */

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/** iOS gives no install prompt, so the app has to explain itself once. */
function maybeShowInstallHint(settings) {
  if (settings.firstRunSeen || isStandalone() || !isIOS()) return
  setTimeout(() => {
    toast('Add to Home Screen from the Share menu to use this offline.', {
      action: 'Got it',
      duration: 15000,
      onAction: () => saveSettings({ firstRunSeen: true }),
    })
  }, 1200)
}

/* ------------------------------------------------------------------- boot */

async function boot() {
  try {
    await checkStorage()
  } catch {
    renderStorageBlocked()
    return
  }

  const settings = await getSettings()
  applyTheme(settings.theme)
  onChange((scope) => {
    if (scope === 'settings' || scope === 'all') getSettings().then((s) => applyTheme(s.theme))
  })

  /**
   * First launch: onboarding owns the whole screen, and the shell is not built
   * until it is done.
   *
   * Mounting it over the app instead would mean rendering Today first — an
   * empty dashboard reading 0 against a target nobody chose — and then covering
   * it up. Nothing behind means nothing to flash, and no tab bar to tap through
   * to a version of the app that has not been set up yet.
   */
  if (!settings.onboardingComplete) {
    clear(app)
    await new Promise((resolve) => {
      createOnboarding({ onDone: resolve }).then((el) => mount(app, el))
    })
  }

  clear(app)
  app.appendChild(view)
  app.appendChild(fade)
  app.appendChild(nav)

  defineRoutes()
  startRouter((path) => {
    syncTabs(path)
    closeAnySheet()
  })

  registerServiceWorker()
  maybeShowInstallHint(settings)

  // Resuming after midnight should land on the new day, not yesterday.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rollOverIfNeeded()
  })

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    getSettings().then((s) => s.theme === 'system' && applyTheme('system'))
  })
}

boot()
