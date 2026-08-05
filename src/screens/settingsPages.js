import { h, repaint } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { openSheet } from '../lib/sheet.js'
import { toast, confirm } from '../lib/toast.js'
import {
  getSettings,
  saveSettings,
  exportAll,
  importAll,
  previewImport,
  clearAll,
  storageEstimate,
  listFoods,
} from '../lib/db.js'
import {
  backRow,
  card,
  listRow,
  segmentedWide,
  numberInput,
  textInput,
  labelledField,
  notice,
} from '../lib/ui.js'
import { round } from '../lib/format.js'
import { todayStr } from '../lib/dates.js'
import { navigate } from '../router.js'
import { openOnboardingOverlay } from './onboarding.js'
import { getAiKey, setAiKey, clearAiKey } from '../lib/aiKey.js'
import { VERSION, REPO_URL } from '../config.js'

/**
 * The four set-once corners of Settings, one tap in from the root.
 *
 * They share a file because they are one destination that was split by how
 * often anyone opens it, not four unrelated screens that happened to be
 * written together. Each is a lift of a section that used to sit in the root
 * scroll; the markup is moved rather than rewritten, so the diff that created
 * them is readable as the move it is.
 *
 * `suggestTarget.js` is the exception and has a file of its own, because it is
 * the only one of the five that computes anything.
 */

/**
 * The frame every pushed Settings screen wears: the way back, then the title.
 *
 * The back row names its destination rather than saying "Back". On a stack
 * exactly one deep the parent's name is the more useful of the two, and it is
 * the shape the food library already used before Settings had subpages.
 */
export function settingsPage(title, ...children) {
  return h(
    'div',
    { class: 'flex flex-col gap-[20px] pb-[20px]' },
    backRow({ label: 'Settings', onclick: () => navigate('settings') }),
    h('h1', { class: 'text-title font-semibold leading-tight' }, title),
    ...children
  )
}

/** A labelled row whose control sits under the label. Stacked, not beside. */
export function prefRow(label, control) {
  return h(
    'div',
    { class: 'row flex-col items-stretch gap-[10px]' },
    h('span', { class: 'text-[13px] font-medium' }, label),
    control
  )
}

/* ----------------------------------------------------------- preferences */

function editBlocksSheet(settings) {
  return openSheet({
    title: 'Time blocks',
    render: (ctx) => {
      const names = [...settings.blockNames]
      const thresholds = { ...settings.blockThresholds }

      ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: async () => {
              await saveSettings({ blockNames: names, blockThresholds: thresholds })
              ctx.close()
              toast('Blocks updated')
            },
          },
          'Save'
        )
      )

      return h(
        'div',
        { class: 'flex flex-col gap-[20px] pb-[10px]' },
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Names'),
          ...names.map((name, i) => textInput({ value: name, onInput: (v) => (names[i] = v) }))
        ),
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'When a new entry defaults to each block'),
          labelledField({
            label: `${names[1]} starts at`,
            children: numberInput({
              value: thresholds.afternoon,
              suffix: ':00',
              step: '1',
              onInput: (v) => (thresholds.afternoon = Number(v)),
            }),
          }),
          labelledField({
            label: `${names[2]} starts at`,
            children: numberInput({
              value: thresholds.night,
              suffix: ':00',
              step: '1',
              onInput: (v) => (thresholds.night = Number(v)),
            }),
          }),
          notice('These only set the prefill. You can always override the block when logging.')
        )
      )
    },
  })
}

export function preferencesScreen() {
  return createScreen(
    async ({ rerender }) => {
      const settings = await getSettings()

      return settingsPage(
        'Preferences',
        card(
          // One control for both heights and weights. It was two — this row
          // and a kg/lb row under it — while onboarding set both from this
          // one, so the same preference could be stated twice and the two
          // screens disagreed about which statement counted. `weightUnit`
          // now follows `units`; see `weightUnitFor`.
          prefRow(
            'Units',
            segmentedWide({
              options: [
                { value: 'metric', label: 'Metric' },
                { value: 'imperial', label: 'Imperial' },
              ],
              value: settings.units,
              onChange: (v) => saveSettings({ units: v }).then(rerender),
            })
          ),
          prefRow(
            'Theme',
            segmentedWide({
              options: [
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ],
              value: settings.theme,
              onChange: (v) => saveSettings({ theme: v }).then(rerender),
            })
          ),
          prefRow(
            'Trend window',
            segmentedWide({
              options: [
                { value: 7, label: '7 days' },
                { value: 14, label: '14 days' },
              ],
              value: settings.trendWindow,
              onChange: (v) => saveSettings({ trendWindow: v }).then(rerender),
            })
          ),
          listRow({
            title: 'Time blocks',
            subtitle: settings.blockNames.join(' · '),
            chevron: true,
            onclick: () => editBlocksSheet(settings).then(rerender),
          })
        )
      )
    },
    { watch: [], watchDate: false }
  )
}

/* ----------------------------------------------------------- ai describe */

export function aiDescribeScreen() {
  return createScreen(
    async () => {
      /**
       * The key field, and nothing that uses the key.
       *
       * It is a `.field` with a chip appended rather than a new shared input,
       * because `textInput` already spreads its extra props onto the element
       * and `type: 'password'` is the only thing that makes this field
       * different. One caller does not earn a component, and `ui.js` is the
       * app's whole visual vocabulary — a `secretInput` in there would be a
       * word the system does not otherwise speak.
       *
       * Show/Hide is a `chip-sm` for the same reason: it is the pattern this
       * screen already uses for a small inline action, and it costs the icon
       * set nothing. There is no eye glyph in `icons.js` and the file's own
       * header argues against the set growing.
       */
      let storedKey = getAiKey()
      let keyDraft = storedKey
      let keyShown = false

      const keyField = textInput({
        value: storedKey,
        type: 'password',
        placeholder: 'Paste your key',
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        onInput: (v) => {
          keyDraft = v
          syncKey()
        },
      })

      const revealBtn = h(
        'button',
        {
          class: 'chip-sm shrink-0',
          onclick: () => {
            keyShown = !keyShown
            keyField.input.type = keyShown ? 'text' : 'password'
            revealBtn.textContent = keyShown ? 'Hide' : 'Show'
          },
        },
        'Show'
      )
      keyField.appendChild(revealBtn)

      const saveKeyBtn = h(
        'button',
        {
          class: 'btn-primary',
          disabled: true,
          onclick: () => {
            setAiKey(keyDraft)
            storedKey = getAiKey()
            keyDraft = storedKey
            keyField.input.value = storedKey
            syncKey()
            toast('Key saved')
          },
        },
        'Save'
      )

      // Clearing is reversible by pasting the key back, so it does not confirm
      // the way the Data screen's destructive rows do.
      const clearKeyBtn = h(
        'button',
        {
          class: 'chip-sm self-start',
          onclick: () => {
            clearAiKey()
            storedKey = ''
            keyDraft = ''
            keyField.input.value = ''
            keyShown = false
            keyField.input.type = 'password'
            revealBtn.textContent = 'Show'
            syncKey()
            toast('Key cleared')
          },
        },
        'Clear'
      )

      const clearKeySlot = h('div', { class: 'empty:hidden' })

      function syncKey() {
        const draft = keyDraft.trim()
        saveKeyBtn.disabled = !draft || draft === storedKey
        clearKeySlot.replaceChildren(...(storedKey ? [clearKeyBtn] : []))
      }
      syncKey()

      return settingsPage(
        'AI Describe',
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          labelledField({
            label: 'API key',
            hint:
              'Without a key, AI Describe still reads what it can and matches it against ' +
              'your foods. The key is for the rest — dishes with no entry anywhere, and ' +
              'wording the rules will not split.',
            children: keyField,
          }),
          saveKeyBtn,
          clearKeySlot
        )
      )
    },
    { watch: [], watchDate: false }
  )
}

/* ------------------------------------------------------------------ data */

async function doExport() {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: `trackd-${todayStr()}.json` })
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast('Export downloaded')
}

function doImport() {
  const input = h('input', {
    type: 'file',
    accept: 'application/json,.json',
    class: 'hidden',
    onchange: async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      let data
      try {
        data = JSON.parse(await file.text())
      } catch {
        toast('That file is not valid JSON.')
        return
      }
      openImportSheet(data)
    },
  })
  document.body.appendChild(input)
  input.click()
  setTimeout(() => input.remove(), 60000)
}

function openImportSheet(data) {
  return openSheet({
    title: 'Import data',
    render: (ctx) => {
      let mode = 'merge'
      const body = h('div', { class: 'flex flex-col gap-[20px]' })

      async function paint() {
        let counts
        try {
          counts = await previewImport(data, mode)
        } catch (err) {
          body.replaceChildren(notice(err.message, { iconName: 'alert' }))
          return
        }

        const rows = Object.entries(counts).map(([store, c]) =>
          h(
            'div',
            { class: 'row' },
            h('div', { class: 'flex-1 text-[13px] font-medium capitalize' }, store),
            h(
              'div',
              { class: 'text-right text-[12px] leading-tight text-muted' },
              h('div', {}, `${c.existing} → ${c.after}`),
              h(
                'div',
                {},
                mode === 'replace'
                  ? `${c.incoming} imported, ${c.removed} replaced`
                  : `${c.added} new, ${c.overwritten} updated`
              )
            )
          )
        )

        // Same null-child trap: an export taken before `exportedAt` existed
        // would otherwise put the word "null" under the preview.
        repaint(
          body,
          segmentedWide({
            options: [
              { value: 'merge', label: 'Merge' },
              { value: 'replace', label: 'Replace' },
            ],
            value: mode,
            onChange: (v) => {
              mode = v
              paint()
            },
          }),
          notice(
            mode === 'merge'
              ? 'Anything with a matching id is updated, everything else is added. Your settings are left alone.'
              : 'Everything currently on this device is deleted first, including settings and targets.',
            { iconName: mode === 'replace' ? 'alert' : 'info' }
          ),
          card(rows),
          data.exportedAt
            ? h(
                'p',
                { class: 'px-0 text-[12px] text-muted' },
                `Exported ${new Date(data.exportedAt).toLocaleString()}`
              )
            : null
        )
      }

      ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: async () => {
              if (mode === 'replace') {
                const ok = await confirm({
                  title: 'Replace everything?',
                  message: 'All data on this device is deleted and rebuilt from the file.',
                  confirmLabel: 'Replace',
                })
                if (!ok) return
              }
              try {
                await importAll(data, mode)
                ctx.close()
                toast('Import complete')
              } catch (err) {
                toast(err.message || 'Import failed')
              }
            },
          },
          'Import'
        )
      )

      paint()
      return h('div', { class: 'pb-[10px]' }, body)
    },
  })
}

export function dataScreen() {
  return createScreen(
    async ({ rerender }) => {
      // Dev only, and compiled out with the row that reads it.
      const sampleLoaded =
        import.meta.env.DEV &&
        (await listFoods()).some((f) => String(f.id).startsWith('sample-'))

      return settingsPage(
        'Data',
        card(
          listRow({
            title: 'Export data',
            subtitle: 'One JSON file with everything',
            leading: icon('download', { size: 19, class: 'text-muted' }),
            onclick: doExport,
          }),
          listRow({
            title: 'Import data',
            subtitle: 'Merge or replace, with a preview first',
            leading: icon('upload', { size: 19, class: 'text-muted' }),
            onclick: doImport,
          }),
          listRow({
            title: 'Clear all data',
            subtitle: 'Cannot be undone',
            leading: icon('trash', { size: 19, class: 'text-muted' }),
            onclick: async () => {
              const ok = await confirm({
                title: 'Delete everything?',
                message:
                  'Every food, entry, meal and weigh-in on this device is removed. ' +
                  'Export first if you want a copy.',
                confirmLabel: 'Delete everything',
                requireText: 'DELETE',
              })
              if (ok) {
                await clearAll()
                toast('All data cleared')
                rerender()
              }
            },
          }),
          /**
           * Dev only. `import.meta.env.DEV` is a literal at build time, so
           * the installed app gets `false && …` and the bundler drops both
           * this row and the module behind it — the filler cannot ship.
           *
           * It lives under Data rather than in a console command because the
           * person who needs it is looking at the design, not at a terminal.
           */
          import.meta.env.DEV
            ? listRow({
                title: sampleLoaded ? 'Remove sample favourites' : 'Load sample favourites',
                subtitle: sampleLoaded
                  ? 'Takes back exactly what it added'
                  : 'Six foods, pinned, for looking at the rail',
                leading: icon('star', { size: 19, class: 'text-muted' }),
                onclick: async () => {
                  const { loadSampleFoods, clearSampleFoods } = await import(
                    '../lib/sampleData.js'
                  )
                  const n = sampleLoaded ? await clearSampleFoods() : await loadSampleFoods()
                  toast(sampleLoaded ? `Removed ${n} sample foods` : `Added ${n} sample foods`)
                  rerender()
                },
              })
            : null
        ),
        h(
          'p',
          { class: 'px-0 text-[12px] leading-snug text-muted' },
          'Export is the only backup. Clearing this browser’s site data deletes everything ' +
            'here, and nothing is stored anywhere else.'
        )
      )
    },
    { watch: ['foods'], watchDate: false }
  )
}

/* ----------------------------------------------------------------- about */

export function aboutScreen() {
  return createScreen(
    async ({ rerender }) => {
      const estimate = await storageEstimate()

      return settingsPage(
        'About',
        card(
          listRow({
            title: 'Version',
            right: h('span', { class: 'text-[12px] text-muted' }, VERSION),
          }),
          estimate?.usage != null
            ? listRow({
                title: 'Storage used',
                right: h(
                  'span',
                  { class: 'text-[12px] text-muted' },
                  `${round(estimate.usage / 1024, 0)} KB`
                ),
              })
            : null,
          h(
            'a',
            { class: 'row', href: REPO_URL, target: '_blank', rel: 'noreferrer noopener' },
            h('span', { class: 'flex-1 text-[13px] font-medium' }, 'Source code'),
            icon('chevronRight', { size: 18, class: 'text-muted shrink-0' })
          )
        ),

        /**
         * The door onto the first-run flow, which is a thing to review rather
         * than a thing to use — at the root it read as a product feature.
         *
         * Runs as a preview: blank draft, nothing written unless the last step
         * is taken deliberately, so walking through it cannot cost someone the
         * profile they already have. Left in the shipped build on purpose: a
         * flow nobody can reach is a flow nobody can check.
         */
        card(
          listRow({
            title: 'Preview onboarding',
            subtitle: 'The first-run flow, full screen, as a new person sees it',
            chevron: true,
            onclick: () => openOnboardingOverlay({ preview: true }).then(rerender),
          })
        ),

        /**
         * Where the food data comes from.
         *
         * Neither source requires this. Open Food Facts is ODbL and the
         * obligation attaches to redistributing the database, which the app
         * does not do — it copies a product into your library when you log
         * it. USDA FoodData Central is a work of the US federal government
         * and is in the public domain outright.
         *
         * It is here anyway, because both are volunteer or public efforts the
         * app leans on entirely for the half of its data it did not author,
         * and saying so costs two lines.
         */
        h(
          'p',
          { class: 'px-0 text-[12px] leading-snug text-muted' },
          'Barcode and product data from Open Food Facts. Common foods from USDA ' +
            'FoodData Central.'
        )
      )
    },
    { watch: [], watchDate: false }
  )
}
