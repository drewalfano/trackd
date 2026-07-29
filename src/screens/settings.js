import { h } from '../lib/dom.js'
import { icon } from '../lib/icons.js'
import { createScreen } from '../lib/screen.js'
import { openSheet } from '../lib/sheet.js'
import { toast, confirm } from '../lib/toast.js'
import {
  getSettings,
  saveSettings,
  listFoods,
  listMeals,
  getFood,
  getMeal,
  putMeal,
  deleteMeal,
  moveFavourite,
  toggleFavourite,
  exportAll,
  importAll,
  previewImport,
  clearAll,
  storageEstimate,
} from '../lib/db.js'
import { kcalFromMacros } from '../lib/compute.js'
import {
  card,
  listRow,
  emptyRow,
  segmentedWide,
  numberInput,
  textInput,
  labelledField,
  notice,
} from '../lib/ui.js'
import { pluralize, round } from '../lib/format.js'
import { todayStr } from '../lib/dates.js'
import { navigate } from '../router.js'
import { VERSION, REPO_URL } from '../config.js'

/**
 * Settings, which is also where the food library and saved meals live because
 * neither earns a tab of its own.
 */

/* ------------------------------------------------------------------ sheets */

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
        { class: 'flex flex-col gap-5 pb-2' },
        h(
          'div',
          { class: 'flex flex-col gap-3' },
          h('div', { class: 'section-label' }, 'Names'),
          ...names.map((name, i) =>
            textInput({ value: name, onInput: (v) => (names[i] = v) })
          )
        ),
        h(
          'div',
          { class: 'flex flex-col gap-3' },
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

function favouritesSheet() {
  return openSheet({
    title: 'Favourites',
    render: (ctx) => {
      const list = h('div')

      async function paint() {
        const settings = await getSettings()
        const rows = []
        for (const [index, fav] of settings.favourites.entries()) {
          const item =
            fav.type === 'food' ? await getFood(fav.id) : await getMeal(fav.id)
          if (!item) continue
          rows.push(
            h(
              'div',
              { class: 'row' },
              h(
                'div',
                { class: 'min-w-0 flex-1' },
                h('div', { class: 'truncate text-[15px] font-medium' }, item.name),
                h(
                  'div',
                  { class: 'text-[12px] text-muted' },
                  fav.type === 'meal' ? pluralize(item.items.length, 'item') : 'Food'
                )
              ),
              h(
                'button',
                {
                  class: 'icon-btn bg-canvas',
                  'aria-label': 'Move up',
                  disabled: index === 0,
                  style: index === 0 ? { opacity: '0.3' } : null,
                  onclick: async () => {
                    await moveFavourite(index, -1)
                    paint()
                  },
                },
                icon('chevronUp', { size: 18 })
              ),
              h(
                'button',
                {
                  class: 'icon-btn bg-canvas',
                  'aria-label': 'Move down',
                  disabled: index === settings.favourites.length - 1,
                  style: index === settings.favourites.length - 1 ? { opacity: '0.3' } : null,
                  onclick: async () => {
                    await moveFavourite(index, 1)
                    paint()
                  },
                },
                icon('chevronDown', { size: 18 })
              ),
              h(
                'button',
                {
                  class: 'icon-btn bg-canvas',
                  'aria-label': 'Unpin',
                  onclick: async () => {
                    await toggleFavourite(fav.type, fav.id)
                    paint()
                  },
                },
                icon('close', { size: 16 })
              )
            )
          )
        }

        list.replaceChildren(
          card(rows.length ? rows : emptyRow('Nothing pinned yet.')),
          h(
            'p',
            { class: 'px-1 pt-3 text-[12px] leading-snug text-muted' },
            'Favourites never re-sort themselves. Fixed positions are what make the tap ' +
              'muscle memory, so the order here is the order in the add sheet.'
          )
        )
      }

      paint()
      return list
    },
  })
}

function mealsSheet() {
  return openSheet({
    title: 'Saved meals',
    render: (ctx) => {
      const list = h('div')

      async function paint() {
        const [meals, settings] = await Promise.all([listMeals(), getSettings()])
        meals.sort((a, b) => (b.useCount || 0) - (a.useCount || 0))

        list.replaceChildren(
          card(
            meals.length
              ? meals.map((meal) =>
                  h(
                    'div',
                    { class: 'row' },
                    h(
                      'div',
                      { class: 'min-w-0 flex-1' },
                      h('div', { class: 'truncate text-[15px] font-medium' }, meal.name),
                      h(
                        'div',
                        { class: 'text-[12px] text-muted' },
                        `${pluralize(meal.items.length, 'item')} · used ${meal.useCount || 0}×`
                      )
                    ),
                    h(
                      'button',
                      {
                        class: 'icon-btn bg-canvas',
                        'aria-label': 'Pin or unpin',
                        onclick: async () => {
                          await toggleFavourite('meal', meal.id)
                          paint()
                        },
                      },
                      icon('star', {
                        size: 17,
                        filled: settings.favourites.some(
                          (f) => f.type === 'meal' && f.id === meal.id
                        ),
                      })
                    ),
                    h(
                      'button',
                      {
                        class: 'icon-btn bg-canvas',
                        'aria-label': 'Rename',
                        onclick: async () => {
                          const name = await promptText('Rename meal', meal.name)
                          if (name) {
                            await putMeal({ ...meal, name })
                            paint()
                          }
                        },
                      },
                      icon('pencil', { size: 16 })
                    ),
                    h(
                      'button',
                      {
                        class: 'icon-btn bg-canvas',
                        'aria-label': 'Delete',
                        onclick: async () => {
                          const ok = await confirm({
                            title: `Delete "${meal.name}"?`,
                            message: 'Entries already logged from it are not affected.',
                          })
                          if (ok) {
                            await deleteMeal(meal.id)
                            paint()
                          }
                        },
                      },
                      icon('trash', { size: 16 })
                    )
                  )
                )
              : emptyRow('Save a block from the Log day view to create one.')
          )
        )
      }

      paint()
      return list
    },
  })
}

/** Small one-field sheet, used for renames. */
function promptText(title, initial) {
  return openSheet({
    title,
    render: (ctx) => {
      let value = initial
      ctx.setFooter(
        h('button', { class: 'btn-primary', onclick: () => ctx.close(value.trim()) }, 'Save')
      )
      return h(
        'div',
        { class: 'pb-2' },
        textInput({ value, autofocus: true, onInput: (v) => (value = v) })
      )
    },
  })
}

/* -------------------------------------------------------------------- data */

async function doExport() {
  const data = await exportAll()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: `macro-tracker-${todayStr()}.json` })
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
      const body = h('div', { class: 'flex flex-col gap-4' })

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
            h('div', { class: 'flex-1 text-[15px] font-medium capitalize' }, store),
            h(
              'div',
              { class: 'text-right text-[12px] leading-tight text-muted' },
              h('div', {}, mode === 'replace' ? `${c.existing} → ${c.after}` : `${c.existing} → ${c.after}`),
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

        body.replaceChildren(
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
                { class: 'px-1 text-[12px] text-muted' },
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
      return h('div', { class: 'pb-2' }, body)
    },
  })
}

/* ------------------------------------------------------------------ screen */

export function settingsScreen() {
  return createScreen(
    async ({ rerender }) => {
      const settings = await getSettings()
      const [foods, meals, estimate] = await Promise.all([
        listFoods(),
        listMeals(),
        storageEstimate(),
      ])

      /* --------------------------------------------------------- targets */

      const targets = { ...settings.targets }
      let kcalOverridden = true
      let saveTimer = null

      const kcalField = numberInput({
        value: targets.kcal,
        suffix: 'cal',
        onInput: (v) => {
          targets.kcal = Number(v) || 0
          kcalOverridden = true
          queueSave()
        },
      })

      const derivedHint = h('div', { class: 'px-1 text-[12px] text-muted' })

      const syncDerived = () => {
        const derived = kcalFromMacros(targets)
        if (!kcalOverridden) {
          targets.kcal = Math.round(derived)
          kcalField.input.value = targets.kcal
        }
        derivedHint.replaceChildren(
          h(
            'span',
            {},
            `Protein, fat and carbs work out to ${Math.round(derived)} cal. `,
            kcalOverridden
              ? h(
                  'button',
                  {
                    class: 'font-semibold underline underline-offset-2',
                    onclick: () => {
                      kcalOverridden = false
                      syncDerived()
                      queueSave()
                    },
                  },
                  'Use that'
                )
              : 'Calories now follow the macros.'
          )
        )
      }

      function queueSave() {
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => saveSettings({ targets }), 400)
      }

      const macroField = (key, label) =>
        labelledField({
          label,
          children: numberInput({
            value: targets[key],
            suffix: 'g',
            onInput: (v) => {
              targets[key] = Number(v) || 0
              syncDerived()
              queueSave()
            },
          }),
        })

      syncDerived()

      /* ------------------------------------------------------------ rows */

      const prefRow = (label, control) =>
        h(
          'div',
          { class: 'row flex-col items-stretch gap-2' },
          h('span', { class: 'text-[15px] font-medium' }, label),
          control
        )

      return h(
        'div',
        { class: 'flex flex-col gap-6 pb-4' },
        h(
          'div',
          { class: 'px-1 pt-2' },
          h('h1', { class: 'text-[22px] font-bold leading-tight' }, 'Settings')
        ),

        h(
          'section',
          { class: 'flex flex-col gap-2' },
          h('div', { class: 'section-label' }, 'Targets'),
          h(
            'div',
            { class: 'flex flex-col gap-3' },
            labelledField({ label: 'Calories', children: kcalField }),
            derivedHint,
            macroField('protein', 'Protein'),
            macroField('fat', 'Fat'),
            macroField('carbs', 'Carbs')
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-2' },
          h('div', { class: 'section-label' }, 'Foods'),
          card(
            listRow({
              title: 'Food library',
              subtitle: pluralize(foods.length, 'food'),
              chevron: true,
              onclick: () => navigate('foods'),
            }),
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
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-2' },
          h('div', { class: 'section-label' }, 'Preferences'),
          card(
            prefRow(
              'Units',
              segmentedWide({
                options: [
                  { value: 'metric', label: 'Metric' },
                  { value: 'imperial', label: 'Imperial' },
                ],
                value: settings.units,
                onChange: (v) => saveSettings({ units: v }).then(rerender),
                on: 'card',
              })
            ),
            prefRow(
              'Weight unit',
              segmentedWide({
                options: [
                  { value: 'kg', label: 'kg' },
                  { value: 'lb', label: 'lb' },
                ],
                value: settings.weightUnit,
                onChange: (v) => saveSettings({ weightUnit: v }).then(rerender),
                on: 'card',
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
                on: 'card',
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
                on: 'card',
              })
            ),
            listRow({
              title: 'Time blocks',
              subtitle: settings.blockNames.join(' · '),
              chevron: true,
              onclick: () => editBlocksSheet(settings).then(rerender),
            })
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-2' },
          h('div', { class: 'section-label' }, 'Data'),
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
            })
          ),
          h(
            'p',
            { class: 'px-1 pt-1 text-[12px] leading-snug text-muted' },
            'Export is the only backup. Clearing this browser’s site data deletes everything ' +
              'here, and nothing is stored anywhere else.'
          )
        ),

        h(
          'section',
          { class: 'flex flex-col gap-2' },
          card(
            listRow({
              title: 'Version',
              right: h('span', { class: 'text-[13px] text-muted' }, VERSION),
            }),
            estimate?.usage != null
              ? listRow({
                  title: 'Storage used',
                  right: h(
                    'span',
                    { class: 'text-[13px] text-muted' },
                    `${round(estimate.usage / 1024, 0)} KB`
                  ),
                })
              : null,
            h(
              'a',
              { class: 'row', href: REPO_URL, target: '_blank', rel: 'noreferrer noopener' },
              h('span', { class: 'flex-1 text-[15px] font-medium' }, 'Source code'),
              icon('chevronRight', { size: 18, class: 'text-muted' })
            )
          )
        )
      )
    },
    { watch: [], watchDate: false }
  )
}
