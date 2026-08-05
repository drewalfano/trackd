import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execSync } from 'node:child_process'

// Repo name on GitHub Pages. Override with BASE_PATH=/ for a custom domain.
const base = process.env.BASE_PATH ?? '/trackd/'

/**
 * Hand-rolled service worker build step.
 *
 * Workbox is a lot of machinery for "precache the shell, stale-while-revalidate
 * one API host". All this needs to do is take the final hashed filenames Rollup
 * produced and stamp them into a template, so that's all it does.
 */
function serviceWorker() {
  const templatePath = resolve(process.cwd(), 'src/sw.template.js')
  return {
    name: 'trackd:sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => base + f)

      // The shell itself, plus everything copied verbatim out of public/ —
      // those never appear in `bundle`, so they are listed by hand.
      const shell = [
        base,
        base + 'manifest.webmanifest',
        base + 'icons/icon-192.png',
        base + 'icons/icon-512.png',
        base + 'icons/icon-maskable-512.png',
        base + 'icons/apple-touch-icon.png',
      ]
      const precache = [...new Set([...shell, ...assets])].sort()

      // Content-derived version: the SW only re-installs when output changes.
      const version = Object.values(bundle)
        .map((c) => (c.type === 'chunk' ? c.code : c.source))
        .join('')
        .length.toString(36)

      const source = readFileSync(templatePath, 'utf8')
        .replace('__PRECACHE__', JSON.stringify(precache, null, 2))
        .replace('__VERSION__', JSON.stringify(version))
        .replace('__BASE__', JSON.stringify(base))

      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))

/**
 * Which build is actually running, as a short commit.
 *
 * `VERSION` is the package version and has read 1.0.0 through every deploy
 * there has been, so it cannot answer the first question any device-only bug
 * asks: is the phone on the build that was meant to fix it, or still on the
 * service worker's copy of the one before? A commit changes every push and
 * settles that in one glance.
 *
 * `GITHUB_SHA` first, because Actions checks out a detached HEAD and the local
 * command would report it correctly but the env var is already there.
 */
function buildId() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  plugins: [tailwindcss(), serviceWorker()],
  build: {
    target: 'es2022',
    // One user, one device, no code splitting worth the extra round trips.
    modulePreload: { polyfill: false },
  },
  // `PORT` so a second dev server can be told where to sit rather than picking
  // for itself; unset falls through to Vite's own 5173.
  server: { host: true, port: process.env.PORT ? Number(process.env.PORT) : undefined },
})
