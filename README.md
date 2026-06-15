# 8-Week Gym + Meal Plan

A personal, dependency-free web app for an 8-week training and nutrition plan (Jun 15 – Aug 9, 2026). Opens straight from `index.html` — no build step, no server required.

## Features
- **Today / day view** — flip through any day; shows the workout, meals, and timing.
- **Dashboard** — targets and the 8-week overview.
- **Training** — full workout calendar with per-week progression highlighting.
- **Meals** — daily meals with live-computed macros and a macro-matched **swap** feature.
- **Recipes**, **Grocery** (with cost/budget estimates), and **Guides**.
- **Progress tracker** — daily log + weight-vs-target-band chart. Data is stored in the browser (localStorage).

## Files
| File | Purpose |
|------|---------|
| `index.html` / `styles.css` / `app.js` | The app |
| `data.js` | Plan data, generated from the source spreadsheet (`window.PLAN`) |
| `Armen_2_Month_Gym_Meal_Plan_With_Timing.xlsx` | Source spreadsheet |

## Notes
- Logged progress and meal swaps are stored per-browser in `localStorage` (not synced across devices).
- If the spreadsheet changes, `data.js` must be regenerated from it.
