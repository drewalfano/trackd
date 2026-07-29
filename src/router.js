/**
 * Hash routing. Hash rather than history routing because this ships to GitHub
 * Pages, which has no rewrite rules, and a deep link to /log would 404.
 */

const routes = []
let onNavigate = null

export function route(pattern, handler) {
  const keys = []
  const regex = new RegExp(
    '^' +
      pattern
        .split('/')
        .map((part) => {
          if (part.startsWith(':')) {
            keys.push(part.slice(1))
            return '([^/]+)'
          }
          return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('/') +
      '$'
  )
  routes.push({ regex, keys, handler })
}

export function currentPath() {
  return (location.hash.replace(/^#\/?/, '') || 'today').replace(/\/$/, '')
}

export function navigate(path, { replace = false } = {}) {
  const target = `#/${path.replace(/^\//, '')}`
  if (location.hash === target) {
    resolve()
    return
  }
  if (replace) location.replace(target)
  else location.hash = target
}

function resolve() {
  const path = currentPath()
  for (const { regex, keys, handler } of routes) {
    const match = path.match(regex)
    if (!match) continue
    const params = Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]))
    onNavigate?.(path)
    handler(params)
    return
  }
  navigate('today', { replace: true })
}

export function startRouter(hook) {
  onNavigate = hook
  window.addEventListener('hashchange', resolve)
  resolve()
}

export { resolve as refreshRoute }
