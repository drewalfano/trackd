# Macro Tracker

A personal macro tracker. Installable PWA, single user, local first. No accounts,
no backend, no subscription — every byte lives on the device.

Built to replace a paid MacroFactor subscription, and to be a UX case study with
a real user and documented iteration. See [`CHANGELOG-visual.md`](CHANGELOG-visual.md)
for the visual system and every change made to it, and [`NOTES-friction.md`](NOTES-friction.md)
for the running log of things that broke or annoyed in daily use.

## Running it

```bash
npm install
npm run dev
```

The dev server serves at `/macro-tracker-app/` to match the GitHub Pages base
path, so the URL is `http://localhost:5173/macro-tracker-app/`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Generates icons, then builds to `dist/` |
| `npm run preview` | Serves the production build |
| `npm test` | Macro arithmetic, sanity flags, trend smoothing, local dates |
| `npm run icons` | Regenerates the PWA icons into `public/icons/` |

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). Enable Pages with
"GitHub Actions" as the source.

`BASE_PATH` must match the repository name. For a custom domain, build with
`BASE_PATH=/`.

HTTPS is not a nicety here: `getUserMedia` refuses to run on plain HTTP, so
barcode scanning only works because Pages serves over TLS. `localhost` counts as
a secure context, so scanning also works in development.

## Architecture

Vanilla JS. No framework, and no state library, because almost all state lives
in IndexedDB and the thing a framework buys — diffing a large render tree — is
not a problem this app has. Screens rebuild their own subtree when the data they
subscribe to changes.

```
src/
  main.js            app shell, tab bar, routing, service worker registration
  router.js          hash routing (Pages has no rewrite rules, so /log would 404)
  state.js           the only cross-screen state: which day you are looking at
  lib/
    db.js            IndexedDB, every read and write, plus export/import
    compute.js       macro arithmetic, Atwater, the sanity flags from spec 9
    off.js           Open Food Facts client; normalizes everything on ingest
    trend.js         weight smoothing and rate of change
    dates.js         local 'YYYY-MM-DD' handling — never UTC
    ui.js            the component vocabulary
    sheet.js         bottom sheet with a panel stack and history integration
    dom.js           ~100 lines of DOM helper: h(), swipe, long press, count-up
  screens/           today, log, history, weight, settings, foods
  sheets/            addFood, serving, search, custom, scan
  sw.template.js     service worker; vite.config.js stamps in the asset list
```

### Dependencies

Three, deliberately: `idb`, `@zxing/browser`, `@zxing/library`. ZXing is loaded
dynamically and only when you open the Scan route, so it stays out of the
initial bundle.

`vite-plugin-pwa` was evaluated and dropped. It pulls in 300+ packages and,
today, eight high-severity build-time advisories to do an app-shell precache and
one stale-while-revalidate route. A ~40-line Vite plugin stamps the hashed asset
list into `sw.template.js` instead. Charts are hand-rolled SVG for the same
reason — a charting library for one sparkline is not a trade worth making.

Initial load is ~29 KB gzipped of JS plus ~5 KB of CSS.

## Data model

One IndexedDB database, `macro-tracker`, version 1. Two decisions carry the
whole design:

**Foods store `per100`, normalized to 100 of their base unit.** Every serving
change downstream is multiplication, never a re-fetch. For `item` foods this
means "per 100 items", so the same arithmetic works for eggs and for rice.

**Entries snapshot their `computed` macros at the time of logging.** If a food's
nutrition is corrected later, history does not silently rewrite itself. This is
also why deleting a food leaves its entries intact and readable.

Two additions to the original spec, both forced by behaviour it asked for:

- Entries also snapshot `foodName` and `brand`. Without it, deleting a food
  turns months of history into rows labelled "Deleted food".
- Foods track `lastQuantity` and `lastUnit`. Recents promises "last used serving
  prefilled", and the alternative is scanning the entries index every time the
  add sheet opens — the one place latency is unacceptable.

## Backups

Export is the only backup. Clearing the browser's site data deletes everything,
and nothing is stored anywhere else. Settings → Data → Export data writes a
single JSON file with every store; import offers merge or replace with a preview
of exactly what will change first.

## Open questions, resolved

1. **Preact or vanilla** — vanilla. State lives in IndexedDB; a framework would
   be carrying weight it does not need to carry here.
2. **Red is spoken for by carbs** — destructive and error states are ink and
   grey. No second red anywhere, including delete confirmations, going over
   target, and offline notices.
3. **A "remaining" number** — no. `2504 / 2837` covers it, as the mockups said.
4. **Does the history view earn v1** — yes, but for the weekly averages rather
   than the day list. A single day is noise; seven days of mean calories and
   mean protein is the number worth designing around.

## Known limits

- Open Food Facts search is rate limited and intermittently returns 503. A
  transient failure gets one quiet retry before the user sees anything; a
  persistent one shows a retry notice. The local library stays searchable
  regardless.
- Scanning needs a rear camera and a secure context. Every failure path — denied
  permission, no camera, unknown barcode, a product with no nutrition data —
  falls back to manual entry or the custom form rather than dead-ending.
- IndexedDB is unavailable in private browsing on some browsers. The app detects
  this on boot and says so, rather than silently forgetting everything.
