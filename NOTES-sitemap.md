# Sitemap

What exists today, read off the routes in [`src/main.js`](src/main.js#L189) and the
screens themselves. Two things this is for: seeing the shape of the app without
the pixels, and seeing which of its beliefs are invisible.

Nothing here is a proposal unless it says so.

_Last walked 2026-08-02, after the plate, quick add, the weigh-in sheet and the
audit fixes. The **Findings** and **Where the differentiation actually is**
sections below are the original analysis and are left in their own voice — only
the status lines under them have been touched._

---

## The map

Three tabs. Two of them own sub-screens that are not tabs.

Routes are unchanged since the first walk. Everything added since is a sheet or
a panel, which is the shape this app keeps reaching for: the router holds the
places you *are*, and sheets hold the things you *do*.

```
FIRST LAUNCH · Onboarding        (full screen — no tabs, no shell behind it)
└── Welcome → Units → About you → How active → Your goal → Your targets
    Skippable at the welcome; nothing is written until the last step.
    Re-enterable from Settings → Preview onboarding, as an overlay.

+ (add)  ─────────────── global, floats right of the tab pill, on every screen
│                        titled "Add to <day>" when the target is not today
│
├── [plate bar]                    ← only when the plate has something on it
│      ├── tap  → Plate            (panel — amounts, day, block)
│      │           ├── (item) → Amount        (panel)
│      │           └── Save as a meal         (panel)
│      └── Log N → commits, one undo for the whole plate
│
├── Favourites / Recents          ← the front door
│      ├── tap        → logs it, undo in the toast
│      ├── +          → adds to the plate
│      └── long-press → Serving (food) · Meal (saved meal)
│
├── Scan          → Serving
├── Search        → Serving  ·  → Custom
├── Custom        → Serving
└── Quick add calories → Quick add   (panel — macros only, no food record)

TAB 1 · Today                      #/today
├── Log                            #/log         ← chip, only when the day has entries
│   ├── History                    #/history     ← chip
│   │   ├── (tracked row)   → sets date, returns to Log
│   │   └── (untracked row) → Add sheet for that day
│   └── Save as meal per block     (sheet)
└── (entry) → Edit entry (sheet) · Duplicate (sheet, long-press)

TAB 2 · Weight                     #/weight
└── Add or edit another day        (sheet — any past day, save or remove)

TAB 3 · Settings                   #/settings
├── Food library                   #/foods
│   └── Food detail                #/foods/:id
│       └── Edit → Custom sheet · Log → Serving sheet
├── Favourites          (sheet — reorder, unpin)
├── Saved meals         (sheet — rename, delete, inspect)
├── Time blocks         (sheet — names + threshold times)
└── Import data         (sheet — merge/replace with preview)
```

Depth from a cold start, counting taps:

| Screen | Taps | Notes |
| --- | --- | --- |
| Today | 0 | launch screen |
| Add sheet | 1 | |
| Weight, Settings | 1 | |
| Log | 2 | **0 routes in on an empty day** — see Findings |
| Food library, Favourites, Saved meals | 2 | |
| Quick add, Weigh-in for another day | 2 | |
| History | 3 | via Today → Log → History |
| Food detail | 3 | |
| Plate | 2 | but only exists once something is on it |

And the number the plate was built for:

| Task | Taps | Sheets opened |
| --- | --- | --- |
| Log one known food | 2 | 1 |
| Log a 4-item dinner | 6 | 1 — was 8 taps and 4 sheets |
| Build a saved meal from scratch | 6 + a name | 1 — was not possible without logging it first |

---

## Screens and what's on them

### Today — `#/today`

The dashboard, then a preview of the log.

- Day header, chevron back always, chevron forward only when there is a forward
- **Calorie block** — count-up number that ticks from the previous value, `/ target`,
  signed gap pushed to the row end, full-width bar
- **Three macro rings** — protein, fat, carbs, equal diameter, gap-to-target in the centre
- Every value stated once; the rings carry the remainder so there is no `153g / 185g` line
- **Log preview** — entry rows with edit / delete-with-undo / duplicate, plus a `Full Log` chip
- The entire Log section is dropped when the day is empty

### Log — `#/log` (under the Today tab)

The same day, seen by block instead of as a summary. The only screen where time
blocks are visible.

- Day nav, same chevrons as Today
- Day summary row: item count + macro line
- `History` chip
- Three blocks, user-named, prefilled from the clock at the configured thresholds
- **Save as meal** per block → names it, saves it, pins it to Favourites
- Empty block collapses to a single `Add to <block>` row rather than an empty container
- Entry actions: edit, delete + undo toast, duplicate

### History — `#/history` (under the Today tab)

- **Last 7 days** card: mean calories and mean protein against target, `n of 7 tracked`
- **Under 4 tracked days there is no mean at all** — the tracked count takes the
  figure's place, at the figure's weight, with a line saying why. The old guard
  copy sat under a 30px number and lost to it; the fix had to be structural
- Day rows: label, item count, three macro ticks, calories, chevron → sets the date and lands on Log
- **Macro ticks are labelled P / F / C**, since this is the only place the hues
  appear at this size and colour alone is not a label
- **Untracked days render as a hairline** rather than being skipped — gaps are part of the record
- Untracked rows carry a chevron and open the **add sheet for that day**
- The window is **never shorter than seven days**, so the shape is stable from
  day one rather than growing a row at a time
- 180-day walk cap; the start date is one indexed read rather than a full scan
- Empty state

### Weight — `#/weight`

- Current weight + date, Trend + rate per week, side by side
- Hand-rolled SVG chart: raw dots muted, smoothed trend in ink — no macro hue, on purpose
- Range: 30 / 90 / All
- Today's input; saving again replaces rather than adding a second reading; Remove with confirm
- **Add or edit another day** — a back door for a morning you missed, and the
  only way to correct or delete a reading that is not today's. Kept out of the
  main path because weighing in is a habit, not a form
- **Refuses to draw** under two points, and a notice when under the trend minimum
- Empty state

### Settings — `#/settings`

- **Targets** — calories, protein, fat, carbs, and whether they are calculated or
  set by hand. Any edit flips them to manual permanently
- **About you** — sex, birth year, height, current weight, activity, goal and
  rate, with the calculated suggestion shown below and applied only by a button.
  A stub form on purpose: the data model was the blocker, not the flow
- **Foods** — Food library, Favourites, Saved meals
- **Preferences** — units, weight unit, theme, trend window (7/14), Time blocks
- **Data** — Export JSON, Import (merge or replace, preview first), Clear all
- **About** — version, storage used

### Food library — `#/foods` → `#/foods/:id`

Explicitly the database interface the rest of the app refuses to be.

- Search, filter (all / custom / scanned), sort (most used / A–Z / recently added)
- Filter and query survive a trip into a detail view and back
- Detail: macros, favourite toggle, edit, delete (warns with the entry count), log it

### The add sheet — global `+`

A recall interface, not a database interface. Panel stack with real back-button
integration.

- **Favourites and Recents above the fold** — one tap logs, undo in the toast
- **Three verbs, two visible targets.** Tap logs, `+` stages onto the plate,
  long-press opens the detail. The `+` replaced the pencil, which is the one
  trade in here worth watching: adjusting a single food at a non-default amount
  moved from a visible control to a hidden one
- **The plate** — assemble, see the running total, then commit in one write with
  a single undo. Survives the sheet closing, keeps the day it was started on, and
  can be saved as a meal without ever being logged. That is the only prospective
  route to a saved meal; the Log's "Save as meal" is still the retrospective one
- **Quick add** — calories and macros with no food behind them, for the meal
  eaten once. Writes an entry and nothing else, so one-offs stop ranking in
  Recents and search
- **Serving** — amount + unit toggle, preview recalculated on every keystroke with no
  fetch and no await in the input path, block selector, date, favourite toggle
- **Search** — Open Food Facts, with local library results floated above and badged
- **Scan** — camera, ZXing loaded only on this route; every failure has a way forward
  (no permission → type the digits, unknown code → create with it prefilled, no
  nutrition → hand off to Custom)
- **Custom** — per-serving ↔ per-100 toggle, calorie override when the label disagrees
  with Atwater, sanity flags, and a **label photo** pinned above the form: the packet
  stays on screen while its numbers get typed, instead of in the other hand. Every
  route that ends at a packet ends here, so the scan-not-found and search-not-found
  handoffs get it for free. Text recognition, if it ever earns its megabytes, reads
  the same photo.

---

## Findings the map exposes

_Original analysis, unedited. Status lines added underneath on 2026-08-02 —
three of the five are still open, and the two that moved did not move because
they were designed away._

**1. Log and History are unreachable on an untracked day.** The `Full Log` chip lives
inside the section that only renders when `entries.length` is truthy
([`today.js:130`](src/screens/today.js#L130)). Open the app on a day you haven't
logged and there is no route to Log, and therefore none to History either. Worst
case is the first run, where it is every route.

> **Still open.** Untouched. It is now the oldest known finding in the file and
> the only one that costs a first-time user every route in the app.

**2. History is the deepest screen and arguably the most valuable one.** Three taps,
behind a chip inside another chip. If the weekly average is the honest read on
whether the week went the way it was meant to, it is currently filed like an
archive.

> **Still open**, and the screen got better while staying three taps away — which
> arguably sharpens the finding rather than softening it. Note the traffic now
> runs the other way too: an untracked row in History opens the add sheet, so
> History is a place you log *from*, not only a place you read.

**3. Weight is a whole tab for one number.** Compare its traffic to Today's. Not
necessarily wrong — a tab is also a reminder to weigh in — but it is a bet worth
naming.

> **Still open**, and slightly less true: the tab now owns a second job in
> backfilling and correcting past readings.

**4. Favourites appears in two places** with different jobs: managed in Settings,
used in the add sheet. Fine, probably, but it is the one duplicated node.

> **Still true, and now doubled.** Saved meals are also in two places — managed
> in Settings, and creatable from both the plate (prospective) and a Log block
> (retrospective). Whether that is one node in three places or three jobs that
> happen to share a noun is the question worth asking before adding a fourth.

**5. There is no settings entry point from the screens the settings govern.**
Targets are edited three taps away from the rings they draw; block times are
edited two taps from the only screen that shows blocks.

> **Still open.** Settings gained the whole "About you" section since, so the
> distance between a target and the thing that computes it grew rather than
> shrank.

---

## Where the differentiation actually is

Naming what this app believes is Phase 0 of your own plan and it is your call, so
this is an inventory, not a recommendation. Split into what is already true in the
code and what would be new.

### Already built, currently invisible

These are the strong ones, because you would be designing something into view
rather than adding a feature.

| The belief | Where it already lives | Where it does not show |
| --- | --- | --- |
| **You eat at times, not at meals** | `block` is in the data model, prefilled from the clock | Only surfaces on Log. Today, History and the rings know nothing about it |
| **The app admits what it doesn't know** | Trend refuses under two points; untracked days drawn as hairlines; sanity flags on custom foods; local-vs-OFF badges in search; **History refuses to average under four tracked days**; **the target calculator refuses to go below a floor** | Six different treatments now, still no shared vocabulary. Nothing on Today expresses confidence at all |
| **Nothing here judges you** | No streaks, no red, over is information | Invisible, because nothing on screen would have been red. An absence you cannot see is not a feature yet |
| **A log is a record, not a feed** | Entries are snapshots; editing a food does not rewrite history | Nothing in the UI says so, and nothing would look different if it were false |
| **Your data is yours** | No account, no backend, full JSON export, works offline | One Settings row reading `Export data` |

Every mainstream tracker breaks at least three of those, and MacroFactor charges
a subscription for the fourth. The gap is presentation, not capability.

### Candidates that would be new

Unbuilt, listed so they can be killed on purpose rather than forgotten. Roughly
ordered by how much they'd cost.

- **An empty day that says something.** Currently the section vanishes; see finding 1.
  This is the first screen anyone you show the app to will ever see.
- **Remaining rather than consumed**, toggleable or automatic late in the day. Your
  own Day 0 note flags this as the thing 30 days will settle.
- **Blocks visible on Today** — three quiet marks under the calorie bar showing when
  the day's calories landed. Cheap, and it is the one belief no competitor holds.
- **What fits.** Given what is left, which Favourites still fit. The strongest genuinely
  new idea on this list and the most expensive, because it needs a ranking rule you
  would have to be able to defend. _Cheaper than it was: the plate already holds a
  running total against a target, which is the surface this would live on._
- **A weekly review**, as opposed to a list of days with an average stapled to the top.
- **One provenance vocabulary** — scanned / typed / estimated, treated the same way
  everywhere, including on the rings.

---

## Before this gets built into

Two cheap checks, both an afternoon:

**Tree test.** Give five people the bare hierarchy above — no visuals, no app —
and one task each: *"where would you go to see how last week went?"* They point at
a node, you record right or wrong and how many wrong turns first. It tests
structure with the visual design out of the room, which is the only time you can.
Finding 2 either survives that or it doesn't.

**Reachability pass.** Walk the map from a cold start with an empty database and
mark every node you cannot get to. That is how finding 1 turned up, and an empty
database is the state every new person starts in and the state you will never see
again.
