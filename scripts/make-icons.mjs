/**
 * Generates the PWA icons.
 *
 * Hand-rolled rather than pulling in an image library, for the same reason the
 * charts are hand-rolled: this draws four rounded bars on a flat ground, and
 * that is not worth a dependency. Rendering happens at 4× and is box-filtered
 * down, which is where the smooth edges come from.
 *
 * The icon is the macro bars — the only place colour is allowed to mean
 * anything in this app, so it is the only thing worth putting on the icon.
 */

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'public/icons')

/**
 * The palette is read out of styles.css rather than copied here.
 *
 * It was copied here once, and the two drifted: the icon kept a retired set
 * where fat was gold and carbs was red, long after the app had moved to orange
 * and magenta. The icon is the one asset nobody re-opens after shipping it, so
 * it is exactly the wrong place to keep a second copy of anything.
 */
const css = readFileSync(resolve(ROOT, 'src/styles.css'), 'utf8')

function token(name) {
  const m = css.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`icons: token --color-${name} not found in styles.css`)
  return m[1]
}

const rgb = (hex) => hex.match(/[0-9a-fA-F]{2}/g).map((h) => parseInt(h, 16))

const INK = rgb(token('ink'))
const BARS = ['kcal', 'protein', 'fat', 'carbs'].map((name) => rgb(token(name)))
const WIDTHS = [1.0, 0.68, 0.46, 0.84]

const SS = 4 // supersample factor

/* ------------------------------------------------------------- PNG encoder */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

/** @param {Buffer} rgb width*height*3 */
function encodePng(width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------------------------------------------------------------- drawing */

function drawIcon(size, { inset = 0 } = {}) {
  const big = size * SS
  const buf = Buffer.alloc(big * big * 3)

  // Flat ink ground.
  for (let i = 0; i < big * big; i++) {
    buf[i * 3] = INK[0]
    buf[i * 3 + 1] = INK[1]
    buf[i * 3 + 2] = INK[2]
  }

  // `inset` shrinks the artwork for the maskable variant's safe zone.
  const scale = 1 - inset * 2
  const left = big * (0.2 * scale + inset)
  const fullWidth = big * 0.6 * scale
  const barH = big * 0.082 * scale
  const gap = big * 0.048 * scale
  const totalH = barH * 4 + gap * 3
  const top = (big - totalH) / 2
  const radius = barH / 2

  BARS.forEach((color, i) => {
    const y0 = top + i * (barH + gap)
    const w = fullWidth * WIDTHS[i]
    const x0 = left
    const x1 = left + w
    const y1 = y0 + barH

    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
        // Inside a rounded rect: clamp to the inner rect, then check radius.
        const cx = Math.min(Math.max(x + 0.5, x0 + radius), x1 - radius)
        const cy = Math.min(Math.max(y + 0.5, y0 + radius), y1 - radius)
        const dx = x + 0.5 - cx
        const dy = y + 0.5 - cy
        if (dx * dx + dy * dy > radius * radius) continue
        const idx = (y * big + x) * 3
        buf[idx] = color[0]
        buf[idx + 1] = color[1]
        buf[idx + 2] = color[2]
      }
    }
  })

  // Box-filter down to the target size. This is the anti-aliasing.
  const out = Buffer.alloc(size * size * 3)
  const area = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const idx = ((y * SS + sy) * big + (x * SS + sx)) * 3
          r += buf[idx]
          g += buf[idx + 1]
          b += buf[idx + 2]
        }
      }
      const idx = (y * size + x) * 3
      out[idx] = Math.round(r / area)
      out[idx + 1] = Math.round(g / area)
      out[idx + 2] = Math.round(b / area)
    }
  }

  return encodePng(size, size, out)
}

mkdirSync(OUT, { recursive: true })

const files = [
  ['icon-192.png', drawIcon(192)],
  ['icon-512.png', drawIcon(512)],
  // Maskable icons get cropped to a circle on some launchers, so the artwork
  // sits inside the 80% safe zone.
  ['icon-maskable-512.png', drawIcon(512, { inset: 0.1 })],
  // iOS applies its own rounding and never uses transparency.
  ['apple-touch-icon.png', drawIcon(180)],
]

for (const [name, data] of files) {
  writeFileSync(resolve(OUT, name), data)
  console.log(`icons: ${name} (${(data.length / 1024).toFixed(1)} KB)`)
}
