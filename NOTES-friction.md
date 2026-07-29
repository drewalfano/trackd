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
`#data` `#offline` `#scan`.

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

## Findings

_Nothing yet — first entry goes here._
