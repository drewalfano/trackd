# Friction log

Phase 6 of the build plan: use it daily for thirty days, log every friction
point here, ship fixes. This file is the raw material for the case study, so the
entries are worth writing while annoyed rather than tidied up afterwards.

**Format.** One entry per friction point. Date it, say what you were actually
doing, and what the app did instead. Resist writing the fix in the same breath —
the first instinct is usually a feature, and the second is usually the design
problem underneath it.

```
## YYYY-MM-DD — short title
**Context:** where you were, what you were trying to log, one hand or two.
**What happened:** the actual sequence.
**Cost:** seconds lost / gave up / logged it wrong / logged it later.
**Guess at the cause:**
**Fixed in:** commit or "not yet"
```

Tag entries so they can be sorted later: `#speed` `#accuracy` `#discoverability`
`#data` `#offline` `#scan` `#looks` `#keep`.

`#looks` and `#keep` are late additions and both matter. The original tags are all
interaction — there was nowhere to put "this is ugly", which is how the first real
finding arrived. And a log that only records annoyances loses the evidence of what
to protect, so things that work go in too.

## Two speeds

The format above is a sit-down format. Friction happens one-handed at 8am, and
six fields will not get filled in. So capture fast, write up later.

**Fast lane — the inbox.** One line, in the moment, untidied. Capture wherever is
quickest on the phone (Notes, a voice memo) and paste it in at the end of the day.
Getting it *down* beats getting it right.

```
- [TAG] 08:12 — what happened, in the words you'd use out loud. +1
```

`[TAG]` is one of `LOOKS` `WORKS` `MISSING` `KEEP`. That single word is what stops
a flow problem getting fixed with a colour change. Add `+1` each time the same
thing happens again — for a personal app, **frequency matters more than severity.**
A small annoyance fifty times a week outranks a big one you hit once.

Then once or twice a week, promote the recurring inbox lines into full entries
under Findings. Most inbox lines never graduate, and that's the point — the
filtering is the analysis.

### Inbox

_Paste raw lines here._

**Two things to watch deliberately, added 2026-08-02 when the plate shipped.**
Both are trades made on purpose, and both are cheap to reverse if the log says
they were wrong. Neither will show up unless it is looked for.

- `[MISSING]` adjusting one food's amount. The pencil on a Favourites/Recents row
  became `+` (add to plate); adjusting now means long-press, or going through the
  plate. If reaching for a control that is not there recurs, the row needs three
  targets after all. See NOTES-plate-spec.md.
- `[MISSING]` assembling a meal. The plate exists now — if it goes unused for a
  week, it was a feature wanted because MacroFactor has it rather than because
  this app needed it.

---

## Day 0 — pre-use notes

Written before real use, so they are predictions rather than findings. Worth
keeping honest: the point of the next thirty days is to find out which of these
were wrong.

**Expected to hold up**

- Favourites and Recents covering the large majority of logging. The two-tap
  path is a tap on `+` and a tap on the row.
- The per-100 model. Every serving change is arithmetic, so the preview updates
  on keystroke with no lag and no fetch.

**Expected to be the first thing that annoys**

- One tap on a Recents row logs immediately, with Undo in the toast. The pencil
  beside it opens the serving sheet. If the wrong one gets hit repeatedly, the
  targets are too close together or the affordance is not reading.
- Blocks are prefilled from the clock at 12:00 and 17:00. A late lunch or an
  early dinner will land in the wrong block. The thresholds are editable, but
  needing to edit them is itself the finding.
- Whether `2504 / 2837` really does cover it, or whether a remaining number gets
  wanted around 8pm. The mockups say it does. Thirty days will say otherwise or
  not.

**Known rough edges going in**

- Open Food Facts search is rate limited and 503s intermittently. There is one
  quiet retry before the user sees anything. If searches still feel unreliable
  in practice, the honest fix is to lean harder on the local library rather than
  to retry more aggressively. `#speed`
- Barcode scanning is untested against a real camera and real packaging. Every
  failure path has a way forward, but decode speed in bad kitchen light is
  unknown. `#scan`
- Saved meals can only be created from a Log day view block. If meals get built
  by hand more often than by saving a day, that path is missing.

---

## First run — write this tonight or lose it

Perishable. There is one window where this app can be seen with fresh eyes, and it
closes within about a week — every rough edge normalises and then cannot be found
again. These answers cannot be reconstructed later.

**The full instrument is NOTES-first-run.md** — these six plus what they miss:
what went unlogged, what wasn't believed, and what to protect. Answer it there.

- Opening it for the first time, what did you go looking for that wasn't there?
- What did you tap that turned out not to be tappable?
- Where did you hesitate, even for a second?
- Would you have known to look in the Share sheet to install it, if you hadn't
  already known? (This is the first-run experience for every person you ever
  show it to.)
- What did you expect to happen after saving something, that didn't?
- Anything you had to look at twice to understand.

---

## Tap counts

The baseline for every "I made it faster" claim later. Count tonight, while it
still irritates. Stopwatch on the phone, count from the home screen icon.

| Task | Taps | Seconds | Notes |
| --- | --- | --- | --- |
| Log a food you've logged before |  |  |  |
| Log a brand-new food by search |  |  |  |
| Log by barcode |  |  |  |
| Fix a serving size after logging |  |  |  |
| Record today's weight |  |  |  |
| Check how much protein is left |  |  |  |

Repeat the same table in MyFitnessPal for the comparison. Same meal, same
conditions, same thumb.

---

## Findings

Format example, seeded from the first real finding so the shape is clear. The
analysis fields are deliberately blank — that part is the work.

### 2026-07-29 — empty macro bars say nothing

**Context:** Opening the app in the morning, nothing logged yet.
**What happened:** Four empty tracks, each painting a small coloured tick at the
left cap. Read as broken rather than as empty. `#looks`
**Cost:**
**Guess at the cause:**
**Fixed in:** the tick is gone (uncommitted). Whether the empty screen now *says*
anything is a separate question.

Worth noting this one was **not** in the Day 0 predictions, and it is the only
visual entry on a list of six interaction predictions. Whether that pattern holds
over thirty days is itself a finding.
