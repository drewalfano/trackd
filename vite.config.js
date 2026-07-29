import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Repo name on GitHub Pages. Override with BASE_PATH=/ for a custom domain.
const base = process.env.BASE_PATH ?? '/macro-tracker-app/'

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
    name: 'macro-tracker:sw',
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

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [tailwindcss(), serviceWorker()],
  build: {
    target: 'es2022',
    // One user, one device, no code splitting worth the extra round trips.
    modulePreload: { polyfill: false },
  },
  server: { host: true },
})
