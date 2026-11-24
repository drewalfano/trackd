/**
 * Just enough of .xlsx to read one sheet. A workbook is a zip of XML files.
 *
 * No library and no network: the browser inflates and parses. `parseXml` is
 * handed in, so everything but the two lines that use it runs anywhere. The
 * file is somebody else's bytes, so every size is capped as it is read rather
 * than as the file claims it.
 */

export class XlsxError extends Error {
  constructor(message) {
    super(message)
    this.name = 'XlsxError'
  }
}

export const MAX_FILE = 10 * 1024 * 1024
export const MAX_EXPANDED = 40 * 1024 * 1024
const MAX_ENTRIES = 1000

const NOT_XLSX = 'That file is not an Excel workbook (.xlsx).'
const DAMAGED = 'That Excel file is damaged.'
const TOO_BIG = 'That Excel file is too large to read.'
const refuse = (message) => {
  throw new XlsxError(message)
}

/* --------------------------------------------------------------------- zip */

/** Every entry by name, from the directory at the end of the file. */
export function readZip(buffer) {
  if (buffer.byteLength > MAX_FILE) refuse(TOO_BIG)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const size = bytes.length
  if (size < 22 || view.getUint32(0, true) !== 0x04034b50) refuse(NOT_XLSX)

  let end = -1
  for (let i = size - 22; i >= Math.max(0, size - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) refuse(DAMAGED)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  if (count > MAX_ENTRIES || at === 0xffffffff) refuse(TOO_BIG)

  const entries = new Map()
  for (let i = 0; i < count; i++) {
    if (at + 46 > size || view.getUint32(at, true) !== 0x02014b50) refuse(DAMAGED)
    const nameLength = view.getUint16(at + 28, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    entries.set(name, {
      encrypted: (view.getUint16(at + 8, true) & 1) === 1,
      method: view.getUint16(at + 10, true),
      packed: view.getUint32(at + 20, true),
      offset: view.getUint32(at + 42, true),
    })
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true)
  }
  return { view, bytes, entries, spent: 0 }
}

export const canInflate = () => {
  try {
    new DecompressionStream('deflate-raw')
    return true
  } catch {
    return false
  }
}

/** One entry as text, or null when the file has none by that name. */
export async function readEntry(zip, name) {
  const entry = zip.entries.get(name)
  if (!entry) return null
  if (entry.encrypted) refuse('That Excel file is locked with a password.')
  const { view, bytes } = zip
  const at = entry.offset
  if (at + 30 > bytes.length || view.getUint32(at, true) !== 0x04034b50) refuse(DAMAGED)
  const from = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true)
  if (from + entry.packed > bytes.length) refuse(DAMAGED)
  const packed = bytes.subarray(from, from + entry.packed)

  if (entry.method === 0) {
    zip.spent += packed.length
    if (zip.spent > MAX_EXPANDED) refuse(TOO_BIG)
    return new TextDecoder().decode(packed)
  }
  if (entry.method !== 8) refuse(DAMAGED)
  if (!canInflate()) refuse('This browser cannot open Excel files. Update it, then import again.')

  const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      zip.spent += value.length
      if (zip.spent > MAX_EXPANDED) {
        reader.cancel().catch(() => {})
        refuse(TOO_BIG)
      }
      text += decoder.decode(value, { stream: true })
    }
  } catch (err) {
    throw err instanceof XlsxError ? err : new XlsxError(DAMAGED)
  }
  return text + decoder.decode()
}

/* ------------------------------------------------------------------- sheet */

const all = (node, tag) => [...node.getElementsByTagNameNS('*', tag)]

/** `xl/workbook.xml` + `worksheets/sheet1.xml`, or from the root with a slash. */
function resolvePath(target) {
  const parts = []
  for (const part of (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  return parts.join('/')
}

/** `AB12` to 27. */
function columnOf(ref) {
  let n = 0
  for (const ch of /^[A-Z]{1,3}/.exec(ref)?.[0] ?? refuse(DAMAGED)) n = n * 26 + ch.charCodeAt(0) - 64
  return n - 1
}

/** Text runs, without the phonetic guides Excel can hang off them. */
const textOf = (node) =>
  all(node, 't')
    .filter((t) => t.parentNode.localName !== 'rPh')
    .map((t) => t.textContent)
    .join('')

/**
 * The rows of one named sheet: `[{ row, cells }]`, where `row` is Excel's own
 * row number and a cell is a string, a number, or undefined.
 */
export async function readSheet(buffer, sheetName, parseXml) {
  const zip = readZip(buffer)
  const load = async (path, required = true) => {
    const text = await readEntry(zip, path)
    if (text == null) return required ? refuse(NOT_XLSX) : null
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) refuse(DAMAGED)
    return parseXml(text) ?? refuse(DAMAGED)
  }

  const workbook = await load('xl/workbook.xml')
  const rels = await load('xl/_rels/workbook.xml.rels')
  const sheet = all(workbook, 'sheet').find((s) => s.getAttribute('name') === sheetName)
  if (!sheet) refuse(`That workbook has no sheet named "${sheetName}".`)
  const relId = [...sheet.attributes].find((a) => a.localName === 'id' && a.name !== 'id')?.value
  const links = all(rels, 'Relationship').filter((r) => r.getAttribute('TargetMode') !== 'External')
  const link = links.find((r) => r.getAttribute('Id') === relId)
  if (!link) refuse(DAMAGED)
  const strings = links.find((r) => r.getAttribute('Type')?.endsWith('/sharedStrings'))

  const shared = strings
    ? all(await load(resolvePath(strings.getAttribute('Target'))), 'si').map(textOf)
    : []
  const doc = await load(resolvePath(link.getAttribute('Target')))

  let row = 0
  return all(doc, 'row').map((r) => {
    row = Number(r.getAttribute('r')) || row + 1
    const cells = []
    let column = -1
    for (const c of r.children) {
      if (c.localName !== 'c') continue
      const ref = c.getAttribute('r')
      column = ref ? columnOf(ref) : column + 1
      const type = c.getAttribute('t') ?? 'n'
      const v = [...c.children].find((x) => x.localName === 'v')?.textContent
      if (type === 's') {
        if (v == null || !(Number(v) in shared)) refuse(`Row ${row} refers to text the file does not have.`)
        cells[column] = shared[Number(v)]
      } else if (type === 'inlineStr') cells[column] = textOf(c)
      else if (type === 'str') cells[column] = v ?? ''
      else if (v == null || v === '') continue
      else if (type === 'n') {
        const n = Number(v)
        if (!Number.isFinite(n)) refuse(`Row ${row} has a number Trackd cannot read.`)
        cells[column] = n
      } else refuse(`Row ${row} has a cell Trackd cannot read.`)
    }
    return { row, cells }
  })
}

/** The browser's parser, for `readSheet`. Null on malformed XML. */
export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  return doc.getElementsByTagName('parsererror').length ? null : doc
}
