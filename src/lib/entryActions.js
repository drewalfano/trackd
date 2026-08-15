import { h } from './dom.js'
import { deleteEntry, putEntry, getSettings, uid } from './db.js'
import { toast } from './toast.js'
import { presentSheet } from './sheet.js'
import { blockSelector, segmentedWide, macroLine } from './ui.js'
import { addDays, formatDayLabel, formatDayShort, todayStr } from './dates.js'
import { displayName } from './format.js'

/**
 * Delete, then offer it back. The undo restores the original record verbatim,
 * including its id and timestamp, so nothing about the day shifts.
 */
export async function deleteEntryWithUndo(entry) {
  await deleteEntry(entry.id)
  toast(`Removed ${displayName(entry.foodName) || 'entry'}`, {
    action: 'Undo',
    onAction: () => putEntry(entry),
  })
}

/**
 * Long-press duplicate: same food and quantity, a block and day you choose.
 * Covers "I ate that again" and the 1 AM meal that belongs to yesterday.
 *
 * `host` is the sheet this was launched from, when it was launched from one —
 * the log. Passed on to `presentSheet`, which pushes a panel rather than
 * replacing the sheet the row lives in.
 */
export async function openDuplicateSheet(entry, host) {
  const settings = await getSettings()
  let block = entry.block
  let date = entry.date

  return presentSheet({
    title: 'Duplicate',
    render: (ctx) => {
      const days = [addDays(todayStr(), -1), todayStr(), addDays(todayStr(), 1)]
      // The row's own day, when it is not one of the three already offered —
      // duplicating a Tuesday dinner onto that same Tuesday is a real thing to
      // want, and it is the day you are already looking at.
      if (!days.includes(date)) days.unshift(date)

      /**
       * **A fourth day changes what the labels can be, because the segments now
       * have a width.**
       *
       * `segmentedWide` splits the track evenly, so the label has to fit its
       * share rather than push its neighbours along the way a scrolling chip
       * row would. Measured at 375pt, the track is 335: three segments are
       * 106.3 each and `Tomorrow` sets 68.8 of ink in one, which leaves 18.7 of
       * pill either side. Four segments are 78.8, and the same word leaves 5 —
       * the pill drawn hard against the letters, which is what it looked like.
       *
       * So at four the relative words give way to dates and every segment takes
       * the same short shape: 52 of ink, 13.4 of room. Today keeps its name,
       * because it is the one segment anyone is scanning for and the one that
       * anchors the three dates around it as dates.
       *
       * Three is still the ordinary case and still reads Yesterday / Today /
       * Tomorrow. The words are better when they fit, which is the only reason
       * to spend the width on them.
       */
      const label =
        days.length > 3
          ? (d) => (d === todayStr() ? 'Today' : formatDayShort(d))
          : formatDayLabel
      const dayOptions = days.map((d) => ({ value: d, label: label(d) }))

      const dayRow = h('div')
      const blockRow = h('div')

      /**
       * `segmentedWide`, which is what Block directly beneath it has always
       * been.
       *
       * This was `segmented` — the scrolling row of `.chip`s, ink-filled on the
       * selected one — so the sheet asked the same kind of question twice, ten
       * pixels apart, in two different controls: a solid black pill for the day
       * and an outlined pill on a recessed track for the block. Two encodings of
       * "this one is chosen" stacked vertically read as two different KINDS of
       * choice, and they are not; they are the same one-of-N pick over a short
       * fixed list.
       *
       * The wide one is the right survivor of the pair. It splits the row evenly
       * so the options are a set rather than a queue, its selection travels
       * between segments instead of switching on somewhere new, and it is what
       * `blockSelector` is built on — so matching it here is the whole sheet
       * agreeing rather than a third spelling.
       *
       * It takes the fourth segment when there is one. `dayOptions` grows a
       * dated entry for a row older than yesterday, and `.segment-pill` sizes
       * itself from `--seg-n` for exactly that reason: the control ships at two,
       * three and four across the app.
       */
      const paintDay = () => {
        dayRow.replaceChildren(
          segmentedWide({
            options: dayOptions,
            value: date,
            onChange: (v) => {
              date = v
              paintDay()
            },
          })
        )
      }
      const paintBlock = () => {
        blockRow.replaceChildren(
          blockSelector({
            value: block,
            onChange: (v) => {
              block = v
              paintBlock()
            },
            blockNames: settings.blockNames,
          })
        )
      }
      paintDay()
      paintBlock()

      ctx.setFooter(
        h(
          'button',
          {
            class: 'btn-primary',
            onclick: async () => {
              await putEntry({
                ...entry,
                id: uid(),
                date,
                block,
                createdAt: Date.now(),
              })
              ctx.close()
              toast(`Added to ${formatDayLabel(date)}`)
            },
          },
          'Duplicate'
        )
      )

      // Spacing and type match the other sheets: 20 between sections, 10 inside
      // one, and the 16/14/12 steps. This was the only surface built off the
      // default Tailwind scale (gap-5, py-3, text-[15px]) — close enough to
      // look intentional, far enough off to look wrong, and impossible to name.
      return h(
        'div',
        { class: 'flex flex-col gap-[20px]' },
        h(
          'div',
          { class: 'panel flex flex-col gap-[10px] px-[20px] py-[20px]' },
          h('div', { class: 'text-[16px] font-semibold leading-tight' }, displayName(entry.foodName)),
          macroLine(entry.computed, { size: 14 })
        ),
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Day'),
          dayRow
        ),
        h(
          'div',
          { class: 'flex flex-col gap-[10px]' },
          h('div', { class: 'section-label' }, 'Block'),
          blockRow
        )
      )
    },
  }, host)
}
