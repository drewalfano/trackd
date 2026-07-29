import './styles.css'

import { h, mount, clear } from './lib/dom.js'
import { icon } from './lib/icons.js'
import { checkStorage, getSettings, saveSettings, onChange } from './lib/db.js'
import { toast } from './lib/toast.js'
import { closeAnySheet } from './lib/sheet.js'
import { route, startRouter, navigate, currentPath } from './router.js'
import { rollOverIfNeeded } from './state.js'

import { todayScreen } from './screens/today.js'
import { logScreen } from './screens/log.js'
import { historyScreen } from './screens/history.js'
import { weightScreen } from './screens/weight.js'
import { settingsScreen } from './screens/settings.js'
import { foodsScreen, foodDetailScreen } from './screens/foods.js'
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

function show(factory) {
  currentScreen?.destroy()
  currentScreen = factory()
  mount(view, currentScreen.el)
  window.scrollTo(0, 0)
}

const TABS = [
  { path: 'today', label: 'Today', iconName: 'calendarFilled' },
  { path: 'weight', label: 'Weight', iconName: 'weightFilled' },
  { path: 'settings', label: 'Settings', iconName: 'gearFilled' },
]

/**
 * Progressive blur and a gradient scrim behind the floating bar.
 *
 * Content scrolls underneath rather than stopping at it, so without this the
 * bar sits on top of live text and both become hard to read. The blur ramps
 * across four banded layers and the scrim gives the bar an edge to sit against.
 * Purely decorative, so it is hidden from assistive tech and ignores pointers.
 */
function tabBarFade() {
  return h(
    'div',
    { class: 'tabbar-fade', 'aria-hidden': 'true' },
    h('span'),
    h('span'),
    h('span'),
    h('span'),
    h('span')
  )
}

/**
 * The add button sits outside the pill, to its left, and is always available.
 * Both float clear of the bottom edge with content scrolling behind them.
 */
function tabBar() {
  const tabButtons = TABS.map((tab) =>
    h(
      'button',
      { class: 'tab', 'data-tab': tab.path, onclick: () => navigate(tab.path) },
      icon(tab.iconName, { size: 22 }),
      h('span', { class: 'text-[11px] font-bold' }, tab.label)
    )
  )

  return h(
    'nav',
    {
      class: 'pointer-events-none fixed inset-x-0 bottom-0 z-40 px-[20px]',
      style: { paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' },
    },
    h(
      'div',
      { class: 'pointer-events-auto mx-auto flex max-w-[430px] items-center gap-[10px]' },
      h(
        'button',
        { class: 'add-btn', 'aria-label': 'Add food', onclick: () => openAddFood() },
        icon('plus', { size: 28, stroke: 2.25 })
      ),
      h('div', { class: 'tabbar' }, tabButtons)
    )
  )
}

const nav = tabBar()
const fade = tabBarFade()

/** The active tab gets a canvas pill with an ink edge; the rest stay muted. */
function syncTabs(path) {
  const root = path.split('/')[0]
  const active =
    root === 'log' || root === 'history' ? 'today' : root === 'foods' ? 'settings' : root
  for (const btn of nav.querySelectorAll('[data-tab]')) {
    btn.setAttribute('aria-current', btn.dataset.tab === active ? 'page' : 'false')
  }
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
