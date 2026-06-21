# 8-Week Gym + Meal Plan

A personal, dependency-free web app for an 8-week training and nutrition plan
(Jun 16 – Aug 10, 2026). Opens straight from `index.html` — no build step, no
server, no npm. Hosted on GitHub Pages; state syncs across devices via Firebase.

## Features
- **Today / day view** — flip through any day; shows the workout, meals, and timing.
- **Dashboard** — targets and the (hideable) 8-week overview.
- **Training** — full workout calendar with per-week progression and per-exercise
  working weights (lb + auto kg).
- **Meals** — daily meals with live-computed macros, a macro-matched **swap**,
  per-meal **Done** check-offs with a running eaten-calorie/protein tally, and
  **custom AI meals** (Gemini estimates macros from a description or photo).
- **Recipes**, **Grocery** (checklist + Target links/prices), **Spendings**, **Guides**.
- **Progress** — daily log + weight-vs-target-band chart (canvas, no chart lib).
- **Skip day** — pushes the *lifting* schedule forward one day; meals stay put.

## Files
| File | Purpose |
|------|---------|
| `index.html` | Markup + the three script tags (load order matters — see below) |
| `styles.css` | All styling |
| `app.js` | The whole app: views, rendering, state, all `window.*` click handlers |
| `firebase-sync.js` | Cloud sync (ES module): anonymous auth + one shared Firestore doc |
| `data.js` | Plan data (`window.PLAN`), generated from the source spreadsheet |
| `Armen_2_Month_Gym_Meal_Plan_With_Timing.xlsx` | Source spreadsheet |

## Architecture

Three scripts load in order (see `index.html`); there is no bundler:

1. **`data.js`** — defines `window.PLAN` (days, recipes, templates). Pure data.
2. **`app.js`** — classic `<script>` (not a module) so inline `onclick="..."`
   handlers can reach functions on `window`. Owns all UI and all persisted state.
3. **`firebase-sync.js`** — `type="module"`, loads last. Mirrors localStorage to
   the cloud and back.

### State — single source of truth
All synced state lives in **one registry** at the top of `app.js`
(the *PERSISTENT STATE* block):

```js
const STORES = [
  { key: LS_SWAP,   load: () => (overrides = loadJSON(LS_SWAP)) },
  …one line per store…
];
STORES.forEach((s) => s.load());                  // initial load
window.WP_SYNCED_KEYS = STORES.map((s) => s.key); // what Firebase syncs
window.reloadFromStorage = () => { STORES.forEach((s) => s.load()); render(); };
```

This registry is the *only* place that lists the stores. It drives three things
that used to be maintained separately (and drifted, causing sync bugs):
initial load, re-load after a cloud pull, and the exact key set Firebase syncs.

**➤ To add a new synced store: add one line to `STORES`.** Nothing else —
`firebase-sync.js` reads `window.WP_SYNCED_KEYS`, so it picks it up automatically.

- `loadJSON(key)` / `saveJSON(key, value)` — read/write a store. `saveJSON` also
  calls `window.onDataChanged` (defined by `firebase-sync.js`) to push to the cloud.
- `toggleFlag(store, key, date, flag)` — shared helper for the `{ date: { x: true } }`
  stores (meal Done, timing Done); re-renders without losing scroll position.
- The **Gemini API key** is deliberately *not* in `STORES`: it's a device-local
  secret (`LS_GEMKEY`), never synced and never committed.

### Cloud sync (`firebase-sync.js`)
Single-user, no login: signs in **anonymously**, then mirrors the
`WP_SYNCED_KEYS` slice of localStorage to one shared Firestore doc
(`shared/data`) as a single JSON blob. Last-write-wins across devices; an
`onSnapshot` listener pulls remote changes and calls `reloadFromStorage()`.
The Firebase config is public-safe (locked down by Firestore security rules).

## Regenerating data
`data.js` is generated from the spreadsheet. If the spreadsheet changes,
regenerate `data.js` from it (recipes are expressed in cups; lift schedule is
Tue–Sat, active recovery Sun, rest Mon).
