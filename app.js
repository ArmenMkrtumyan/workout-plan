/* ===========================================================
   8-Week Gym + Meal Plan — app logic (no dependencies)
   Data source: window.PLAN (data.js, extracted from the xlsx)
   =========================================================== */
const P = window.PLAN;

/* ---------- tiny DOM helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- macros ---------- */
// Day totals are the sum of each meal's recipe macros (matches the original sheet exactly).
const RECIPE_BY_NAME = Object.fromEntries(P.recipes.map((r) => [r["Meal Name"], r]));
// small extras referenced in the plan that aren't full recipes
const EXTRA = { Apple: { Calories: 95, "Protein g": 0, Type: "Snack" } };
function itemMacro(name) {
  if (!name) return { cal: 0, pro: 0 };
  const r = RECIPE_BY_NAME[name] || EXTRA[name];
  if (!r) return { cal: 0, pro: 0 };
  return { cal: r["Calories"] || 0, pro: r["Protein g"] || 0 };
}

/* ---------- persistent state (localStorage) ---------- */
const LS_SWAP = "wp_meal_overrides_v1";
const LS_PROG = "wp_progress_v1";
const LS_DONE = "wp_meal_done_v1";
const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveJSON = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); if (window.onDataChanged) window.onDataChanged(); };
// Re-read all persisted state from localStorage and re-render (called after a cloud pull).
window.reloadFromStorage = () => {
  overrides = loadJSON(LS_SWAP); progress = loadJSON(LS_PROG); mealDone = loadJSON(LS_DONE);
  timingDone = loadJSON(LS_TIMING); weights = loadJSON(LS_WEIGHT); bought = loadJSON(LS_BOUGHT);
  actualPrice = loadJSON(LS_ACTUAL); render();
};
let overrides = loadJSON(LS_SWAP); // { "2026-06-15": { "Breakfast": "Protein Oatmeal" } }
let progress = loadJSON(LS_PROG);  // { "2026-06-15": { weight, calories, protein, steps, cardio, trained, sleep, timing, notes } }
let mealDone = loadJSON(LS_DONE);  // { "2026-06-15": { "Breakfast": true } }
const isDone = (date, slot) => !!(mealDone[date] && mealDone[date][slot]);
window.toggleMeal = (date, slot) => toggleFlag(mealDone, LS_DONE, date, slot);

const LS_TIMING = "wp_timing_done_v1";
let timingDone = loadJSON(LS_TIMING); // { "2026-06-15": { "Meal 1": true } }
const isTimingDone = (date, label) => !!(timingDone[date] && timingDone[date][label]);
window.toggleTiming = (date, label) => toggleFlag(timingDone, LS_TIMING, date, label);

// shared toggle for any { date: { key: true } } store; re-renders without losing scroll
function toggleFlag(store, lsKey, date, key) {
  store[date] ||= {};
  if (store[date][key]) delete store[date][key]; else store[date][key] = true;
  if (!Object.keys(store[date]).length) delete store[date];
  saveJSON(lsKey, store);
  const y = window.scrollY; render(); window.scrollTo(0, y);
}

/* ---------- per-exercise working weights (lb) ---------- */
// Starting suggestions for a returning lifter ~150 lb at week-1 effort (RPE 6–7).
// DB moves = weight PER dumbbell. These are guesses — edit to what you actually lift.
// Keyed by "<Template>#<Order>"; null = bodyweight / not weight-based.
const SUGGESTED = {
  "Push A#1": 95, "Push A#2": 30, "Push A#3": 25, "Push A#4": 10, "Push A#5": 25, "Push A#6": 30, "Push A#7": 25,
  "Pull A#1": 90, "Pull A#2": 50, "Pull A#3": 90, "Pull A#4": 25, "Pull A#5": 25, "Pull A#6": 20, "Pull A#7": 20,
  "Legs A#1": 90, "Legs A#2": 25, "Legs A#3": 200, "Legs A#4": 70, "Legs A#5": 80, "Legs A#6": 120, "Legs A#7": null,
  "Upper Mixed#1": 75, "Upper Mixed#2": 90, "Upper Mixed#3": 45, "Upper Mixed#4": 25, "Upper Mixed#5": 10, "Upper Mixed#6": 25, "Upper Mixed#7": 30,
  "Lower B#1": 135, "Lower B#2": 60, "Lower B#3": 20, "Lower B#4": 50, "Lower B#5": 70, "Lower B#6": 120, "Lower B#7": null,
  "Arms (Optional / Sat)#1": 50, "Arms (Optional / Sat)#2": 75, "Arms (Optional / Sat)#3": 30,
  "Arms (Optional / Sat)#4": 30, "Arms (Optional / Sat)#5": 10, "Arms (Optional / Sat)#6": 15, "Arms (Optional / Sat)#7": null,
};
const LS_WEIGHT = "wp_weights_v1";
let weights = loadJSON(LS_WEIGHT); // { "Push A#1": 105 }  (user-confirmed actual weights)
const exKey = (e) => `${e.Template}#${e.Order}`;
window.setWeight = (k, val, el) => {
  const n = parseFloat(val);
  if (val === "" || isNaN(n)) { delete weights[k]; if (el) { el.classList.remove("set"); el.classList.add("sug"); } }
  else { weights[k] = n; if (el) { el.classList.add("set"); el.classList.remove("sug"); } }
  saveJSON(LS_WEIGHT, weights);
};
const LB_TO_KG = 0.453592;
// live-update the kg readout next to a weight input as the user types
window.kgSync = (input) => {
  const el = input.closest("td") && input.closest("td").querySelector(".wt-kg");
  if (!el) return;
  const v = parseFloat(input.value);
  el.textContent = isNaN(v) ? "" : (v * LB_TO_KG).toFixed(1) + " kg";
};
function weightCell(e) {
  const k = exKey(e);
  const sug = SUGGESTED[k];
  const cur = weights[k];
  if (sug == null && cur == null) return `<span class="muted">BW</span>`;
  const val = cur != null ? cur : sug;
  const set = cur != null;
  const kg = (val * LB_TO_KG).toFixed(1);
  return `<input class="wt ${set ? "set" : "sug"}" type="number" inputmode="decimal" step="2.5" value="${val}"
    oninput="window.kgSync(this)" onchange="setWeight('${k}',this.value,this)" aria-label="Working weight in pounds"> <span class="muted" style="font-size:.72rem">lb</span>
    <div class="wt-kg muted" style="font-size:.72rem">${kg} kg</div>`;
}
// shared compact exercise row (this week's prescription + editable weight)
function exRowCompact(e, colKey) {
  return `<tr><td class="num">${esc(e.Order)}</td><td><b>${esc(e.Exercise)}</b>
    <div class="muted" style="font-size:.78rem">${esc(e["Technique cue"])} · alt: ${esc(e["Substitute if busy"])}</div></td>
    <td class="num"><b>${esc(e[colKey])}</b></td>
    <td class="num">${weightCell(e)}</td>
    <td class="num">${esc(e.Rest)}</td></tr>`;
}

const MEAL_SLOTS = ["Breakfast", "Lunch", "Dinner", "Snack 1", "Snack 2"];
function slotType(slot) {
  if (slot === "Breakfast") return ["Breakfast"];
  if (slot === "Lunch" || slot === "Dinner") return ["Lunch/Dinner"];
  return ["Snack"]; // snacks
}
function mealFor(dayRow, slot) {
  const date = dayRow.Date;
  return (overrides[date] && overrides[date][slot]) || dayRow[slot];
}

/* ---------- custom meals (AI-estimated, "I ate something else") ---------- */
const LS_CUSTOM = "wp_custom_meals_v1";
let customMeals = loadJSON(LS_CUSTOM);            // { "2026-06-18__Dinner": {name,cal,pro,carbs,fat,restaurant} }
const customKey = (date, slot) => `${date}__${slot}`;
const getCustom = (date, slot) => customMeals[customKey(date, slot)];
window.clearCustomMeal = (date, slot) => {
  delete customMeals[customKey(date, slot)];
  saveJSON(LS_CUSTOM, customMeals);
  const y = window.scrollY; render(); window.scrollTo(0, y);
};
// resolved per-slot view: a custom meal overrides the planned/swapped one
function slotInfo(day, slot) {
  const c = getCustom(day.Date, slot);
  if (c) return { name: c.name, cal: c.cal, pro: c.pro, carbs: c.carbs, fat: c.fat, custom: true };
  const name = mealFor(day, slot);
  const m = itemMacro(name);
  return { name, cal: m.cal, pro: m.pro, custom: false };
}

function dayTotals(dayRow) {
  let cal = 0, pro = 0;
  for (const slot of MEAL_SLOTS) {
    const s = slotInfo(dayRow, slot);
    if (!s.name) continue;
    cal += s.cal; pro += s.pro;
  }
  return { cal, pro };
}
// macros actually eaten so far (only meals marked Done)
function dayConsumed(dayRow) {
  let cal = 0, pro = 0, doneCount = 0, totalCount = 0;
  for (const slot of MEAL_SLOTS) {
    const s = slotInfo(dayRow, slot);
    if (!s.name) continue;
    totalCount++;
    if (isDone(dayRow.Date, slot)) { cal += s.cal; pro += s.pro; doneCount++; }
  }
  return { cal, pro, doneCount, totalCount };
}
function consumedLine(dayRow) {
  const c = dayConsumed(dayRow), t = dayTotals(dayRow);
  if (!c.doneCount) return `<div class="muted" style="font-size:.8rem;margin-top:10px">Tap <b>Done</b> as you eat — your running total appears here.</div>`;
  const full = c.doneCount === c.totalCount;
  return `<div class="note-box ${full ? "" : ""}" style="margin-top:10px;font-size:.88rem">
    ✅ <b>Eaten:</b> ${c.cal} kcal · ${c.pro}g protein
    <span class="muted">— ${c.doneCount}/${c.totalCount} meals · planned ${t.cal} kcal · ${t.pro}g${full ? " · day complete 🎉" : ""}</span></div>`;
}

/* ---------- date helpers ---------- */
const fmtDate = (iso) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};
const todayISO = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
function planDayFor(iso) {
  const cal = P.gymCalendar;
  let row = cal.find((r) => r.Date === iso);
  if (row) return row;
  // clamp to plan range
  if (iso < cal[0].Date) return cal[0];
  if (iso > cal[cal.length - 1].Date) return cal[cal.length - 1];
  return cal[0];
}
function mealRowFor(iso) {
  return P.mealCalendar.find((r) => r.Date === iso) || P.mealCalendar[0];
}
function currentWeek() {
  const t = todayISO();
  const row = P.gymCalendar.find((r) => r.Date === t);
  if (row) return row.Week;
  if (t < P.gymCalendar[0].Date) return 1;
  return P.gymCalendar[P.gymCalendar.length - 1].Week;
}
function weekColKey(week) {
  if (week <= 2) return "Weeks 1–2";
  if (week <= 4) return "Weeks 3–4";
  if (week <= 6) return "Weeks 5–6";
  return "Weeks 7–8";
}

/* ===========================================================
   VIEWS
   =========================================================== */
const views = {};

/* ---------- TODAY (with day navigation) ---------- */
const PLAN_START = P.gymCalendar[0].Date;
const PLAN_END = P.gymCalendar[P.gymCalendar.length - 1].Date;
const clampDate = (iso) => (iso < PLAN_START ? PLAN_START : iso > PLAN_END ? PLAN_END : iso);
let selDate = clampDate(todayISO());
const shiftISO = (iso, days) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + days); return d.toLocaleDateString("en-CA"); };
window.navDay = (delta) => { selDate = clampDate(shiftISO(selDate, delta)); render(); };
window.jumpToday = () => { selDate = clampDate(todayISO()); render(); };

views.today = () => {
  const iso = selDate;
  const day = planDayFor(iso);
  const meal = mealRowFor(day.Date);
  const tot = dayTotals(meal);
  const wk = day.Week;
  const isToday = iso === todayISO();

  let h = `<h1>${isToday ? "Today" : "Day view"}</h1>`;
  h += `<div class="daynav">
      <button class="arrow" onclick="navDay(-1)" ${iso <= PLAN_START ? "disabled" : ""} aria-label="Previous day">‹</button>
      <div class="label">${esc(fmtDate(day.Date))} · Week ${wk}/8</div>
      <button class="arrow" onclick="navDay(1)" ${iso >= PLAN_END ? "disabled" : ""} aria-label="Next day">›</button>
      ${isToday ? "" : `<button class="btn small" onclick="jumpToday()">Jump to today</button>`}
    </div>`;

  // Workout — shown inline (this week's prescription)
  const ex = exercisesFor(day["Workout Template"]);
  const colKey = weekColKey(wk);
  const intensity = (P.gymCalendar.find((r) => r.Week === wk) || {}).Intensity || "";
  h += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">🏋️ ${esc(day.Focus)}${day.Notes ? ` <span class="muted" style="font-weight:400;font-size:.88rem">· ${esc(day.Notes)}</span>` : ""}</h3>
        <span class="pill ${day.Focus === "Rest" ? "grey" : "green"}">${esc(day.Day)}</span>
      </div>`;
  if (ex.length) {
    h += `<p class="muted" style="font-size:.85rem;margin:8px 0 12px">💪 <b>Effort (all sets):</b> ${esc(intensity)} &nbsp;·&nbsp; 🚶 ${esc(day.Cardio)}</p>`;
    h += `<div class="table-wrap"><table><thead><tr><th>#</th><th>Exercise</th><th>This week</th><th>Weight (lb · kg)</th><th>Rest</th></tr></thead><tbody>`;
    for (const e of ex) h += exRowCompact(e, colKey);
    h += `</tbody></table></div>
      <p class="muted" style="font-size:.78rem;margin:8px 0 0">Weights (lb) are starting suggestions — tap to edit to what you actually lift. They save and carry to next week. DB moves = per dumbbell.</p>
      <div style="margin-top:10px"><button class="btn small ghost" onclick="openWorkout('${esc(day["Workout Template"])}','${esc(day.Date)}',true)">Show full 8-week progression</button></div>`;
  } else {
    h += `<p class="muted" style="margin:8px 0 0">${esc(day.Notes || "")}</p>
      <p class="note-box" style="margin-top:12px">🚶 <b>Today:</b> ${esc(day.Cardio)} · ${esc(day["Core/Mobility"])}. Focus on steps and recovery — no heavy lifting.</p>`;
  }
  h += `</div>`;

  // Meals
  h += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">🍽️ Meals</h3>
        <span class="pill blue">${tot.cal} kcal · ${tot.pro}g P</span>
      </div>
      <div style="margin-top:10px">${MEAL_SLOTS.map((s) => mealSlotRow(meal, s)).join("")}</div>
      ${consumedLine(meal)}
    </div>`;

  // Timing
  h += `<h2>⏱️ Today's timing</h2><div class="card"><div class="grid auto">
      ${timingChip("Wake", meal["Wake / Early Work"], day.Date)}
      ${timingChip("Meal 1", meal["Meal 1 Time"], day.Date)}
      ${timingChip(day.Focus === "Rest" || day.Focus === "Active Recovery" ? "Activity" : "Gym", meal["Gym Window"], day.Date)}
      ${timingChip("Meal 2", meal["Meal 2 Time"], day.Date)}
      ${timingChip("Snack", meal["Snack Time"], day.Date)}
      ${timingChip("Meal 3", meal["Meal 3 Time"], day.Date)}
    </div>
    <p class="note-box" style="margin-top:14px">${esc(meal["Timing Notes"] || "")}</p></div>`;

  // Quick log
  const pr = progress[iso] || {};
  h += `<h2>📈 Quick log</h2>
    <p class="muted" style="margin:-8px 0 12px;font-size:.86rem">Weigh yourself first thing in the morning, before eating or drinking. Fill in calories, protein and steps at the end of the day. The full daily log lives in the <b>Progress</b> tab.</p>
    <div class="card">
      <div class="form-grid">
        <label class="field">Weight (kg)<input type="number" step="0.1" id="qlw" value="${pr.weight ?? ""}"></label>
        <label class="field">Calories<input type="number" id="qlc" value="${pr.calories ?? ""}"></label>
        <label class="field">Protein (g)<input type="number" id="qlp" value="${pr.protein ?? ""}"></label>
        <label class="field">Steps<input type="number" id="qls" value="${pr.steps ?? ""}"></label>
      </div>
      <button class="btn primary" style="margin-top:14px" onclick="quickLog('${iso}')">Save today's log</button>
      <span id="qlmsg" class="muted" style="margin-left:10px"></span>
    </div>`;
  return h;
};
function timingChip(label, val, date) {
  const done = isTimingDone(date, label);
  return `<div class="stat timing-chip ${done ? "done" : ""}" role="button" onclick="toggleTiming('${esc(date)}','${esc(label)}')">
    <div class="label">${done ? "✓ " : ""}${esc(label)}</div>
    <div class="value" style="font-size:1rem">${esc(val || "—")}</div></div>`;
}
window.quickLog = (iso) => {
  const p = progress[iso] || { date: iso };
  p.weight = numOrNull($("#qlw").value); p.calories = numOrNull($("#qlc").value);
  p.protein = numOrNull($("#qlp").value); p.steps = numOrNull($("#qls").value);
  progress[iso] = p; saveJSON(LS_PROG, progress);
  $("#qlmsg").textContent = "Saved ✓";
};
const numOrNull = (v) => (v === "" || v == null ? null : Number(v));

/* ---------- DASHBOARD ---------- */
views.dashboard = () => {
  const m = P.meta;
  let h = `<h1>${esc(m.title)}</h1><p class="subtitle">${esc(m["Start date"])} → ${esc(m["End date"])} · ${esc(m["Plan length"])}</p>`;
  h += `<div class="grid cols-4">
    ${stat("Current", m["Current kg"] + " kg")}
    ${stat("Target", m["Target kg"] + " kg", true)}
    ${stat("Goal", m["Goal"])}
    ${stat("Pace", m["Expected pace"])}
  </div>`;
  h += `<h2>🎯 Daily targets</h2><div class="grid cols-4">
    ${stat("Calories", m["Calories"])}
    ${stat("Protein", m["Protein"], true)}
    ${stat("Fat", m["Fat"])}
    ${stat("Carbs", m["Carbs"])}
    ${stat("Training", m["Training"])}
    ${stat("Cardio", m["Cardio"])}
    ${stat("Steps", m["Steps"])}
    ${stat("Sleep", m["Sleep"])}
  </div>`;

  const cw = currentWeek();
  h += `<details class="collapse"><summary><span>🗓️ 8-week overview</span><span class="muted" style="font-weight:400;font-size:.85rem">Week ${cw}/8 · tap to expand</span></summary>
    <div class="table-wrap" style="margin-top:12px"><table><thead><tr>
    <th>Wk</th><th>Dates</th><th>Target</th><th>Training focus</th><th>Cardio</th><th>Nutrition</th><th>Notes</th>
    </tr></thead><tbody>`;
  for (const w of P.weekOverview) {
    h += `<tr class="${w.Week === cw ? "hl" : ""}"><td class="num"><b>${w.Week}</b></td><td>${esc(w.Dates)}</td>
      <td class="num">${esc(w["Target kg"])} kg</td><td>${esc(w["Training focus"])}</td>
      <td>${esc(w["Cardio goal"])}</td><td>${esc(w["Nutrition focus"])}</td><td class="muted">${esc(w.Notes)}</td></tr>`;
  }
  h += `</tbody></table></div></details>`;

  return h;
};
const stat = (label, value, accent) =>
  `<div class="stat"><div class="label">${esc(label)}</div><div class="value ${accent ? "accent" : ""}" style="font-size:${String(value).length > 16 ? "1rem" : "1.5rem"}">${esc(value)}</div></div>`;

/* ---------- TRAINING (calendar + templates) ---------- */
function exercisesFor(template) {
  return P.workoutDetails.filter((e) => e.Template === template);
}
views.training = () => {
  const cw = currentWeek();
  let h = `<h1>Training</h1><p class="subtitle">5 lifting days · Sat active recovery · Sun rest. Tap any day for the full workout.</p>`;
  h += `<div class="note-box" style="margin-bottom:18px"><b>Current week: ${cw}.</b> Progression target column is highlighted inside each workout.</div>`;

  const byWeek = {};
  for (const d of P.gymCalendar) (byWeek[d.Week] ||= []).push(d);
  const today = todayISO();

  for (const wk of Object.keys(byWeek)) {
    const days = byWeek[wk];
    h += `<div class="weekblock"><div class="weekhead"><span class="wk">Week ${wk}</span>
      <span class="dates">${esc(days[0].Date)} → ${esc(days[days.length - 1].Date)}</span>
      ${Number(wk) === cw ? '<span class="pill green">current</span>' : ""}</div>`;
    h += `<div class="grid auto">`;
    for (const d of days) {
      const rest = d.Focus === "Rest";
      const hasW = exercisesFor(d["Workout Template"]).length > 0;
      h += `<div class="daycard ${rest ? "rest" : ""} ${d.Date === today ? "today-mark" : ""}"
        ${hasW ? `onclick="openWorkout('${esc(d["Workout Template"])}','${esc(d.Date)}')"` : `onclick="openDayInfo('${esc(d.Date)}')"`}>
        <div class="dow">${esc(d.Day)} · ${esc(fmtDate(d.Date))}</div>
        <div class="focus">${esc(d.Focus)}</div>
        <div class="meta">${esc(d["Workout Template"])}</div>
        <div class="meta" style="margin-top:6px">🚶 ${esc(d.Cardio)}</div>
      </div>`;
    }
    h += `</div></div>`;
  }

  h += `<h2>📐 Progression rules</h2><div class="card"><ul class="list-clean">
    ${P.progressionRules.map((r) => `<li><span class="n">•</span><span><b>${esc(r.rule)}:</b> ${esc(r.what)}</span></li>`).join("")}
  </ul></div>`;
  return h;
};
window.openWorkout = (template, date, full = false) => {
  const ex = exercisesFor(template);
  const wk = date ? (P.gymCalendar.find((r) => r.Date === date)?.Week || currentWeek()) : currentWeek();
  const colKey = weekColKey(wk);
  const cols = ["Weeks 1–2", "Weeks 3–4", "Weeks 5–6", "Weeks 7–8"];
  const dateArg = date ? `'${esc(date)}'` : "null";

  let h = `<h2 style="margin-top:0">${esc(template)}</h2><p class="muted">${esc(date ? fmtDate(date) + " · " : "")}Week ${wk} of 8</p>`;
  if (template.includes("Optional")) h += `<p class="note-box warn">Optional. Only do this if recovered — the priority on Saturday is the long walk.</p>`;

  // session-wide effort target (applies to every working set this week)
  const intensity = (P.gymCalendar.find((r) => r.Week === wk) || {}).Intensity || "";
  if (intensity) h += `<p class="note-box" style="margin-bottom:10px">💪 <b>This week's effort — every working set:</b> ${esc(intensity)}</p>`;

  // plain-language legend
  h += `<p class="note-box" style="margin-bottom:14px">
    <b>How to read this:</b> "<b>3 x 8</b>" = 3 sets of 8 reps. <b>DB</b> = dumbbell.<br>
    <b>RPE</b> (Rate of Perceived Exertion) = how hard a set should feel:
    <b>RPE 6–7</b> ≈ 3–4 reps left in the tank, <b>RPE 8</b> ≈ 2 reps left. Don't grind to failure.<br>
    Only the main lift repeats an explicit <b>@ RPE</b> as a reminder — but aim for the effort above on <i>all</i> sets.</p>`;

  // toggle: this week only  ↔  full 8-week progression
  h += `<div style="margin-bottom:12px"><button class="btn small" onclick="openWorkout('${esc(template)}',${dateArg},${full ? "false" : "true"})">
    ${full ? "← Show this week only" : "Show full 8-week progression"}</button></div>`;

  if (full) {
    h += `<div class="table-wrap"><table><thead><tr><th>#</th><th>Exercise</th>
      ${cols.map((c) => `<th class="${c === colKey ? "hl" : ""}">${esc(c)}</th>`).join("")}
      <th>Rest</th></tr></thead><tbody>`;
    for (const e of ex) {
      h += `<tr><td class="num">${esc(e.Order)}</td><td><b>${esc(e.Exercise)}</b>
        <div class="muted" style="font-size:.78rem">${esc(e["Technique cue"])} · alt: ${esc(e["Substitute if busy"])}</div></td>
        ${cols.map((c) => `<td class="num ${c === colKey ? "hl" : ""}">${esc(e[c])}</td>`).join("")}
        <td class="num">${esc(e.Rest)}</td></tr>`;
    }
    h += `</tbody></table></div>`;
  } else {
    // compact: only this week's prescription + editable weight
    h += `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Exercise</th><th>This week</th><th>Weight (lb · kg)</th><th>Rest</th></tr></thead><tbody>`;
    for (const e of ex) h += exRowCompact(e, colKey);
    h += `</tbody></table></div>
      <p class="muted" style="font-size:.78rem;margin:8px 0 0">Weights (lb) are starting suggestions — edit to what you actually lift; they save and carry forward. DB moves = per dumbbell.</p>`;
  }
  openModal(h);
};
window.openDayInfo = (date) => {
  const d = P.gymCalendar.find((r) => r.Date === date);
  openModal(`<h2 style="margin-top:0">${esc(d.Focus)}</h2><p class="muted">${esc(d.Day)} · ${esc(fmtDate(date))}</p>
    <p>${esc(d.Notes)}</p>
    <div class="note-box">🚶 <b>Cardio:</b> ${esc(d.Cardio)}<br>🧘 <b>Mobility:</b> ${esc(d["Core/Mobility"])}</div>`);
};

/* ---------- MEALS (with swap) ---------- */
views.meals = () => {
  let h = `<h1>Meals</h1><p class="subtitle">Default plan repeats weekly. Tap <b>Swap</b> on any meal for a cheaper/easier alternative with matching macros — totals update live.</p>`;
  if (Object.keys(overrides).length)
    h += `<button class="btn ghost small" style="margin-bottom:14px" onclick="resetSwaps()">↺ Reset all swaps to default plan</button>`;

  h += shoppingListHTML();

  const byWeek = {};
  for (const r of P.mealCalendar) (byWeek[r.Week] ||= []).push(r);
  const today = todayISO();
  for (const wk of Object.keys(byWeek)) {
    h += `<div class="weekblock"><div class="weekhead"><span class="wk">Week ${wk}</span></div><div class="grid cols-2">`;
    for (const day of byWeek[wk]) {
      const tot = dayTotals(day);
      const floor = tot.cal < 1900;
      h += `<div class="card" ${day.Date === today ? 'style="border-color:var(--accent)"' : ""}>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${esc(day["Training Day"])}</b>
          <span class="pill ${floor ? "warn" : "blue"}">${tot.cal} kcal · ${tot.pro}g P</span>
        </div>
        <div class="muted" style="font-size:.76rem;margin-bottom:8px">${esc(fmtDate(day.Date))}</div>
        ${MEAL_SLOTS.map((s) => mealSlotRow(day, s)).join("")}
        ${consumedLine(day)}
      </div>`;
    }
    h += `</div></div>`;
  }
  return h;
};
function mealSlotRow(day, slot) {
  const s = slotInfo(day, slot);
  if (!s.name && slot === "Snack 2") return ""; // no second snack that day
  const swapped = overrides[day.Date] && overrides[day.Date][slot];
  const candidates = s.custom ? [] : swapCandidates(s.name, slot);
  const done = isDone(day.Date, slot);
  const tag = s.custom ? '<span class="swapped-flag" style="color:var(--accent2)">custom</span>'
    : (swapped ? '<span class="swapped-flag">swapped</span>' : "");
  const macros = `${s.cal} kcal · ${s.pro}g protein${s.custom && s.carbs != null ? ` · ${s.carbs}g C · ${s.fat}g F` : ""}`;
  return `<div class="mealslot ${done ? "done" : ""}">
    <span class="slot-label">${esc(slot)}</span>
    <div class="info" style="flex:1">
      <div class="name">${done ? "✓ " : ""}${esc(s.name || "—")}${tag}</div>
      <div class="macros">${macros}</div>
    </div>
    <div class="slot-actions">
      ${s.name ? `<button class="btn small ${done ? "primary" : ""}" onclick="toggleMeal('${esc(day.Date)}','${esc(slot)}')">${done ? "✓ Done" : "Done"}</button>` : ""}
      ${s.custom ? `<button class="btn small" title="Back to planned meal" onclick="clearCustomMeal('${esc(day.Date)}','${esc(slot)}')">↺</button>`
        : (s.name && candidates.length ? `<button class="btn small" onclick="openSwap('${esc(day.Date)}','${esc(slot)}')">Swap</button>` : "")}
      ${s.name ? `<button class="btn small" title="I ate something else" onclick="openCustomMeal('${esc(day.Date)}','${esc(slot)}')">✎ Other</button>` : ""}
    </div>
  </div>`;
}
// matching candidates: same meal type, similar calories (±120) & protein (±12); all recipes are cheap & dorm-easy
function swapCandidates(currentName, slot) {
  const cur = itemMacro(currentName);
  const types = slotType(slot);
  return P.recipes
    .filter((r) => types.includes(r.Type) && r["Meal Name"] !== currentName)
    .filter((r) => Math.abs((r["Calories"] || 0) - cur.cal) <= 120 && Math.abs((r["Protein g"] || 0) - cur.pro) <= 12)
    .sort((a, b) => Math.abs(a["Calories"] - cur.cal) - Math.abs(b["Calories"] - cur.cal));
}
window.openSwap = (date, slot) => {
  const current = mealFor(mealRowFor(date), slot);
  const opts = swapCandidates(current, slot);
  let h = `<h2 style="margin-top:0">Swap ${esc(slot)}</h2><p class="muted">Currently: <b>${esc(current)}</b>. Alternatives match the meal type and macros — all use your grocery staples and need little cooking.</p>`;
  for (const r of opts) {
    h += `<div class="swap-option">
      <div><b>${esc(r["Meal Name"])}</b><div class="macros">${r["Calories"]} kcal · ${r["Protein g"]}g P · ${esc(r["Best use"])}</div></div>
      <button class="btn small primary" onclick="applySwap('${esc(date)}','${esc(slot)}','${esc(r["Meal Name"])}')">Use</button>
    </div>`;
  }
  if (overrides[date] && overrides[date][slot])
    h += `<button class="btn ghost small" style="margin-top:6px" onclick="applySwap('${esc(date)}','${esc(slot)}','')">↺ Restore default</button>`;
  openModal(h);
};
window.applySwap = (date, slot, name) => {
  overrides[date] ||= {};
  if (name) overrides[date][slot] = name;
  else { delete overrides[date][slot]; if (!Object.keys(overrides[date]).length) delete overrides[date]; }
  saveJSON(LS_SWAP, overrides);
  closeModal(); render();
};
window.resetSwaps = () => { overrides = {}; saveJSON(LS_SWAP, overrides); render(); };

/* ---------- custom meal: AI macro estimate via Google Gemini (free) ---------- */
const LS_GEMKEY = "wp_gemini_key"; // stored only in this browser, never synced
const getGemKey = () => localStorage.getItem(LS_GEMKEY) || "";
async function geminiMacros(desc) {
  const key = getGemKey();
  if (!key) throw new Error("no-key");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ parts: [{ text: `Estimate the nutrition for one serving of this meal as actually eaten. Give realistic integer estimates.\n\n${desc}` }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: { calories: { type: "integer" }, protein: { type: "integer" }, carbs: { type: "integer" }, fat: { type: "integer" } },
        required: ["calories", "protein", "carbs", "fat"],
      },
    },
  };
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch {}
    throw new Error("api-" + res.status + (detail ? ": " + detail : ""));
  }
  const data = await res.json();
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!txt) throw new Error("no-output");
  const j = JSON.parse(txt);
  return { cal: Math.round(j.calories), pro: Math.round(j.protein), carbs: Math.round(j.carbs), fat: Math.round(j.fat) };
}
window.openCustomMeal = (date, slot) => {
  const hasKey = !!getGemKey();
  openModal(`<h2 style="margin-top:0">Ate something else?</h2>
    <p class="muted" style="font-size:.86rem">Describe what you actually had for <b>${esc(slot)}</b> — an AI estimates the macros (approximate) and swaps it in. Your <b>Eaten</b> tally uses the new numbers.</p>
    <div class="note-box" style="margin-bottom:12px">${hasKey
      ? `Gemini key saved on this device. Leave the key box blank to keep it, or paste a new one to replace it.`
      : `First time only: paste a free <b>Google Gemini</b> API key — <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" class="shop-link">get one free ↗</a> (no credit card). Stored only in this browser. <b>Tip:</b> use the copy button on the key page — don't type the shortened <code>…O4Qw</code> version.`}
      <label class="field" style="margin-top:8px">Gemini API key${hasKey ? " <span class='muted'>(blank = keep saved)</span>" : ""}<input id="cm-key" type="password" placeholder="${hasKey ? "key saved — paste to replace" : "AIza…"}"></label></div>
    <label class="field" style="margin-bottom:10px">What did you eat?<input id="cm-name" placeholder="e.g. Chicken burrito bowl"></label>
    <label class="field" style="margin-bottom:10px">Restaurant <span class="muted">(optional)</span><input id="cm-rest" placeholder="e.g. Chipotle"></label>
    <label class="field" style="margin-bottom:12px">Portion / details <span class="muted">(optional)</span><input id="cm-notes" placeholder="e.g. double chicken, no rice, guac"></label>
    <div id="cm-msg" style="font-size:.84rem;min-height:1.1em;margin-bottom:10px"></div>
    <button class="btn primary" id="cm-go" onclick="estimateCustomMeal('${esc(date)}','${esc(slot)}')">Estimate &amp; use</button>`);
};
window.estimateCustomMeal = async (date, slot) => {
  const msg = $("#cm-msg"), go = $("#cm-go"), keyEl = $("#cm-key");
  if (keyEl && keyEl.value.trim()) localStorage.setItem(LS_GEMKEY, keyEl.value.trim());
  if (!getGemKey()) { msg.style.color = "var(--danger)"; msg.textContent = "Paste your Gemini API key first."; return; }
  const name = ($("#cm-name").value || "").trim();
  if (!name) { msg.style.color = "var(--danger)"; msg.textContent = "Tell me what you ate."; return; }
  const rest = ($("#cm-rest").value || "").trim(), notes = ($("#cm-notes").value || "").trim();
  const desc = `Meal: ${name}.` + (rest ? ` Restaurant: ${rest}.` : "") + (notes ? ` Details: ${notes}.` : "");
  go.disabled = true; msg.style.color = "var(--muted)"; msg.textContent = "Estimating…";
  try {
    const m = await geminiMacros(desc);
    customMeals[customKey(date, slot)] = { name: rest ? `${name} · ${rest}` : name, restaurant: rest, cal: m.cal, pro: m.pro, carbs: m.carbs, fat: m.fat };
    saveJSON(LS_CUSTOM, customMeals);
    closeModal(); const y = window.scrollY; render(); window.scrollTo(0, y);
  } catch (e) {
    go.disabled = false; msg.style.color = "var(--danger)";
    msg.textContent = /no-key/.test(e.message) ? "Add your Gemini key above."
      : /^api-/.test(e.message) ? e.message.replace(/^api-(\d+):?\s*/, "API $1 — ").slice(0, 220)
      : "Couldn't estimate (network/API issue). Try again.";
  }
};

/* ---------- RECIPES ---------- */
views.recipes = () => {
  let h = `<h1>Recipes & snacks</h1><p class="subtitle">Approximate macros. Track oil, peanut butter, nuts, cheese, sauces, pasta, rice & bread closely.</p>`;
  const order = ["Breakfast", "Lunch/Dinner", "Snack"];
  for (const t of order) {
    const list = P.recipes.filter((r) => r.Type === t);
    h += `<h2>${t === "Lunch/Dinner" ? "🍗 Mains" : t === "Breakfast" ? "🍳 Breakfast" : "🥤 Snacks"}</h2><div class="grid auto">`;
    for (const r of list) {
      h += `<div class="card">
        <div style="display:flex;justify-content:space-between;align-items:start"><h3>${esc(r["Meal Name"])}</h3>
          <span class="pill green">${r["Calories"]} · ${r["Protein g"]}g</span></div>
        <p class="muted" style="font-size:.84rem;margin:4px 0 8px"><b>Ingredients:</b> ${esc(r.Ingredients)}</p>
        <p style="font-size:.86rem;margin:0 0 8px">${esc(r["How to make"])}</p>
        <p class="muted" style="font-size:.78rem;margin:0">${esc(r["Best use"])} · ${esc(r.Notes || "")}</p>
      </div>`;
    }
    h += `</div>`;
  }
  return h;
};

/* ---------- GROCERY (with budget) ---------- */
// Estimated cost @ Fenway (city) Target, Good & Gather store brand, mid-2026, no substitutions.
// [cost, frequency]  freq: "wk" weekly | "mo" monthly staple | "once" one-time
const PRICES = {
  "Chicken breast or tenderloins": [15, "wk"], "93% lean ground turkey": [8, "wk"], "Eggs": [4, "wk"],
  "Liquid egg whites": [3.5, "wk"], "Nonfat Greek yogurt": [9, "wk"], "Cottage cheese": [4, "wk"],
  "Tuna cans/pouches": [5, "wk"], "Salmon/frozen fish": [11, "wk"], "Whey protein": [28, "mo"],
  "Oats": [3.5, "wk"], "Rice": [4, "wk"], "Potatoes": [4.5, "wk"], "Whole-wheat wraps": [3.5, "wk"],
  "Whole-wheat bread": [3, "wk"], "Pasta": [1.5, "wk"], "Bananas": [2, "wk"], "Apples/oranges": [5, "wk"],
  "Frozen berries": [3.5, "wk"], "Frozen broccoli/mixed veg": [10, "wk"], "Spinach/salad greens": [5, "wk"],
  "Salad kits": [5, "wk"], "Cucumbers/tomatoes/peppers/onions": [5, "wk"], "Olive oil": [9, "mo"],
  "Peanut butter": [3.5, "mo"], "Avocado": [2.5, "wk"], "Salsa/hot sauce/mustard": [8, "mo"],
  "Marinara sauce": [2.5, "wk"], "Food containers": [12, "once"],
};
const FREQ_LABEL = { wk: "/wk", mo: "/mo", once: "once" };
const money = (n) => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
// Target search link from each item's search terms (first segment = cleanest query).
const targetSearchUrl = (g) =>
  "https://www.target.com/s?searchTerm=" + encodeURIComponent((g["Target search/aisle words"] || g.Item).split(",")[0].trim());

/* ---------- CONFIRMED products (from the actual Target cart, Fenway) ---------- */
// price = sale price paid; products = [name, product-page path]. Specific links, not searches.
const TGT = "https://www.target.com";
const CONFIRMED = {
  "Chicken breast or tenderloins": { price: 11.43, label: "$11.43 ($2.69/lb)", products: [["Fresh Boneless & Skinless Chicken Breast Value Pack (2.5–5.25 lb)", "/p/-/A-86676070"]] },
  "93% lean ground turkey": { price: 4.24, products: [["G&G Fresh 93/7 Ground Turkey, 16oz", "/p/-/A-79853412"]] },
  "Eggs": { price: 1.44, products: [["G&G Cage-Free Large White Eggs, 12ct", "/p/-/A-83719456"]] },
  "Liquid egg whites": { price: 6.62, products: [["G&G Cage-Free Liquid Egg Whites, 32oz", "/p/-/A-79520023"]] },
  "Nonfat Greek yogurt": { price: 5.52, products: [["FAGE Total 0% Plain Greek Yogurt, 32oz", "/p/-/A-14729218"]] },
  "Cottage cheese": { price: 4.24, products: [["Good Culture 2% Simply Cottage Cheese, 16oz", "/p/-/A-52007667"]] },
  "Tuna cans/pouches": { price: 1.01, products: [["G&G Chunk Light Tuna in Water, 5oz", "/p/-/A-76833339"]] },
  "Salmon/frozen fish": { price: 10.19, products: [["G&G Atlantic Salmon, Frozen, 16oz", "/p/-/A-80114702"]] },
  "Whey protein": { price: 31.44, products: [["ON Gold Standard 100% Whey, Double Rich Chocolate", "/p/-/A-78807252"]] },
  "Oats": { price: 4.07, products: [["G&G Old Fashioned Oats, 42oz", "/p/-/A-79364999"]] },
  "Rice": { price: 3.73, products: [["G&G Jasmine Rice, 32oz", "/p/-/A-54604313"]] },
  "Potatoes": { price: 2.80, products: [["Idaho Russet Potatoes, 5 lb", "/p/-/A-77775602"]] },
  "Whole-wheat wraps": { price: 3.82, products: [["Mission Carb Balance Whole Wheat Tortillas (taco)", "/p/-/A-49159664"]] },
  "Whole-wheat bread": { price: 1.69, products: [["Market Pantry 100% Whole Wheat Bread, 20oz", "/p/-/A-85593788"]] },
  "Pasta": { price: 1.61, products: [["Barilla Penne Pasta, 16oz", "/p/-/A-13156215"]] },
  "Bananas": { price: 1.65, label: "$1.65 (5 ct)", products: [["G&G Fresh Banana (each)", "/p/-/A-15013944"]] },
  "Apples/oranges": { price: 2.80, products: [["G&G Fresh Gala Apples, 3 lb bag", "/p/-/A-54579479"]] },
  "Frozen berries": { price: 3.31, products: [["G&G Frozen Blueberries, 12oz", "/p/-/A-54532041"]] },
  "Frozen broccoli/mixed veg": { price: 1.35, products: [["G&G Frozen Broccoli Florets, 12oz", "/p/-/A-79397039"]] },
  "Spinach/salad greens": { price: 2.12, products: [["G&G Fresh Baby Spinach, 5oz", "/p/-/A-54555524"]] },
  "Salad kits": { price: 3.65, products: [["G&G Avocado Ranch Chopped Salad Kit, 12.8oz", "/p/-/A-54560621"]] },
  "Cucumbers/tomatoes/peppers/onions": { price: 7.36, label: "$7.36 (4 items)", products: [
    ["Rainbow Bell Peppers, 3ct", "/p/-/A-78832378"], ["G&G Grape Tomatoes, 10oz", "/p/-/A-82667184"],
    ["English Cucumber (each)", "/p/-/A-13219631"], ["Yellow Onion (each)", "/p/-/A-13474244"]] },
  "Olive oil": { price: 6.54, products: [["G&G Extra Virgin Olive Oil, 16.9oz", "/p/-/A-77643078"]] },
  "Peanut butter": { price: 1.69, products: [["G&G Creamy Peanut Butter, 16oz", "/p/-/A-84067786"]] },
  "Avocado": { price: 2.29, products: [["G&G Hass Avocados, 4ct", "/p/-/A-81957708"]] },
  "Salsa/hot sauce/mustard": { price: 2.71, products: [["G&G Mild Heat Restaurant Style Salsa, 16oz", "/p/-/A-79500172"]] },
  "Marinara sauce": { price: 2.54, products: [["Bertolli Traditional Marinara, 24oz", "/p/-/A-53589721"]] },
  "Food containers": { price: 9.34, products: [["Rubbermaid 16pc TakeAlongs Meal Prep Set", "/p/-/A-76539602"]] },
};
const confLinks = (item) => CONFIRMED[item]
  ? CONFIRMED[item].products.map((p) => `<a href="${TGT}${p[1]}" target="_blank" rel="noopener" class="shop-link">🎯 ${esc(p[0])} ↗</a>`).join("<br>")
  : null;

/* ---------- weekly shopping checklist (got-it + actual price you paid) ---------- */
const LS_BOUGHT = "wp_bought_v1";
const LS_ACTUAL = "wp_actual_price_v1";
let bought = loadJSON(LS_BOUGHT);      // { "Eggs": true }
let actualPrice = loadJSON(LS_ACTUAL); // { "Eggs": 4.29 }
const jsq = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const round2 = (n) => Math.round(n * 100) / 100;
window.toggleBought = (item) => {
  if (bought[item]) delete bought[item]; else bought[item] = true;
  saveJSON(LS_BOUGHT, bought);
  const y = window.scrollY; render(); window.scrollTo(0, y);
};
window.setActualPrice = (item, val) => {
  const n = parseFloat(val);
  if (val === "" || isNaN(n)) delete actualPrice[item]; else actualPrice[item] = n;
  saveJSON(LS_ACTUAL, actualPrice);
  const y = window.scrollY; render(); window.scrollTo(0, y);
};
function shoppingListHTML() {
  // running total uses your entered price if any, else the confirmed cart price
  let total = 0, priced = 0;
  for (const g of P.grocery) {
    const v = (g.Item in actualPrice) ? actualPrice[g.Item] : (CONFIRMED[g.Item] ? CONFIRMED[g.Item].price : null);
    if (v != null) { total += v; priced++; }
  }

  const byCat = {};
  for (const g of P.grocery) (byCat[g.Category] ||= []).push(g);
  let rows = "";
  for (const cat of Object.keys(byCat)) {
    rows += `<tr><td colspan="3" style="background:var(--panel2);font-weight:700;font-size:.74rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)">${esc(cat)}</td></tr>`;
    for (const g of byCat[cat]) {
      const cf = CONFIRMED[g.Item];
      const got = !!bought[g.Item];
      const userP = (g.Item in actualPrice) ? actualPrice[g.Item] : null;
      const links = confLinks(g.Item) || `<a href="${targetSearchUrl(g)}" target="_blank" rel="noopener" class="shop-link">🎯 Buy at Target ↗</a>`;
      const ph = cf ? cf.price : (PRICES[g.Item] ? PRICES[g.Item][0] : "");
      rows += `<tr class="${got ? "got" : ""}">
        <td><b>${esc(g.Item)}</b> <span class="muted" style="font-size:.78rem">· ${esc(g["Weekly Quantity"])}</span>
          <div style="font-size:.76rem;margin-top:4px">${links}</div></td>
        <td style="text-align:center"><input type="checkbox" class="gotbox" ${got ? "checked" : ""} onchange="toggleBought('${jsq(g.Item)}')" aria-label="Got it"></td>
        <td class="num"><span class="muted">$</span><input class="price" type="number" inputmode="decimal" step="0.01" value="${userP ?? (cf ? cf.price : "")}" placeholder="${ph}" onchange="setActualPrice('${jsq(g.Item)}',this.value)" aria-label="Price paid"></td>
      </tr>`;
    }
  }
  return `<details class="collapse" open>
    <summary><span>🛒 Weekly grocery list</span><span class="muted" style="font-weight:400;font-size:.85rem">≈ ${money(round2(total))} · ${priced}/${P.grocery.length} from your cart</span></summary>
    <p class="muted" style="font-size:.84rem">Prices and links are your actual Target picks (Fenway). Each links straight to the product page. Edit a price if it changes.</p>
    <div class="table-wrap"><table><thead><tr><th>Item · amount</th><th style="text-align:center">Got it</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table></div>
  </details>`;
}

views.grocery = () => {
  // totals
  let weekly = 0, monthly = 0, once = 0;
  for (const [c, f] of Object.values(PRICES)) {
    if (f === "wk") weekly += c; else if (f === "mo") monthly += c; else once += c;
  }
  const monthlyTotal = Math.round(weekly * 4.3 + monthly);

  let h = `<h1>Weekly grocery list</h1><p class="subtitle">Buy once a week. Prep Sunday & Wednesday. Costs are estimates for the Fenway Target (store brand, no substitutions).</p>`;
  h += `<div class="grid cols-4">
    ${stat("Weekly groceries", "≈ " + money(weekly), true)}
    ${stat("Monthly staples", "≈ " + money(monthly))}
    ${stat("Est. monthly total", "≈ " + money(monthlyTotal), true)}
    ${stat("One-time (containers)", "≈ " + money(once))}
  </div>`;
  h += `<p class="note-box">Estimate, not a live price check. Weekly items × ~4.3 weeks + monthly staples. City-Target prices are baked in (~5–10% over a suburban Super Target). Dropping the two optional items — fish & whey — would bring this to about <b>${money(monthlyTotal - 28 - Math.round(11 * 4.3))}/month</b>.</p>`;
  h += `<p class="note-box">🎯 Items below link straight to the <b>exact products</b> in your Target cart (Fenway), with the prices you paid. Items not yet confirmed fall back to a Target search.</p>`;

  const byCat = {};
  for (const g of P.grocery) (byCat[g.Category] ||= []).push(g);
  for (const cat of Object.keys(byCat)) {
    const catWeekly = byCat[cat].reduce((s, g) => s + (CONFIRMED[g.Item] ? CONFIRMED[g.Item].price : ((PRICES[g.Item]?.[1] === "wk") ? PRICES[g.Item][0] : 0)), 0);
    h += `<h2>${esc(cat)} ${catWeekly ? `<span class="pill green">~${money(round2(catWeekly))}</span>` : ""}</h2>
      <div class="table-wrap"><table><thead><tr>
      <th>Item</th><th>Price</th><th>Qty / week</th><th>Used for</th><th>Note</th></tr></thead><tbody>`;
    for (const g of byCat[cat]) {
      const cf = CONFIRMED[g.Item];
      const p = PRICES[g.Item];
      const costCell = cf
        ? `<b>${cf.label || money(cf.price)}</b>`
        : (p
          ? `<b>${money(p[0])}</b> <span class="muted" style="font-size:.78rem">${FREQ_LABEL[p[1]]}</span>${p[1] !== "wk" ? ` <span class="pill ${p[1] === "mo" ? "blue" : "grey"}" style="margin-left:2px">${p[1] === "mo" ? "monthly" : "one-time"}</span>` : ""}`
          : `<span class="muted">—</span>`);
      const links = confLinks(g.Item) || `<a href="${targetSearchUrl(g)}" target="_blank" rel="noopener" class="shop-link">🎯 Buy at Target ↗</a>`;
      h += `<tr><td><b>${esc(g.Item)}</b>
          <div style="font-size:.76rem;margin-top:3px">${links}</div></td>
        <td class="num">${costCell}</td>
        <td>${esc(g["Weekly Quantity"])}</td><td class="muted">${esc(g["Used for"])}</td>
        <td class="muted">${esc(g["Budget note"])}</td></tr>`;
    }
    h += `</tbody></table></div>`;
  }
  h += `<h2>🔪 Prep plan</h2><div class="card"><ul class="list-clean">
    ${P.groceryPrep.map((p) => `<li><span class="n">${esc(p.when)}</span><span>${esc(p.what)}</span></li>`).join("")}
  </ul></div>`;
  return h;
};

/* ---------- SPENDINGS (actual orders) ---------- */
// Real grocery orders — what you actually paid (after discounts + tax).
const ORDERS = [
  {
    date: "2026-06-15", store: "Target — Boston Fenway", items: 31,
    subtotal: 162.86, discount: 24.42, discountNote: "15% off one purchase",
    fulfillment: "Free", tax: 2.76, total: 141.20, payment: "Visa ••4250",
  },
];
const monthKey = (iso) => iso.slice(0, 7);
const monthName = (key) => new Date(key + "-01T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });

views.spendings = () => {
  const totalSpent = ORDERS.reduce((s, o) => s + o.total, 0);
  const totalSaved = ORDERS.reduce((s, o) => s + o.discount, 0);
  const totalTax = ORDERS.reduce((s, o) => s + o.tax, 0);

  let h = `<h1>Spendings</h1><p class="subtitle">Your real grocery orders — what you actually paid, after discounts and tax.</p>`;
  h += `<div class="grid cols-4">
    ${stat("Total spent", money(round2(totalSpent)), true)}
    ${stat("Orders", String(ORDERS.length))}
    ${stat("Saved with deals", money(round2(totalSaved)))}
    ${stat("Tax paid", money(round2(totalTax)))}
  </div>`;

  // month-to-date totals
  const byMonth = {};
  for (const o of ORDERS) byMonth[monthKey(o.date)] = (byMonth[monthKey(o.date)] || 0) + o.total;
  h += `<h2>By month</h2><div class="table-wrap"><table><thead><tr><th>Month</th><th>Orders</th><th>Spent</th></tr></thead><tbody>`;
  for (const k of Object.keys(byMonth).sort()) {
    const n = ORDERS.filter((o) => monthKey(o.date) === k).length;
    h += `<tr><td>${esc(monthName(k))}</td><td class="num">${n}</td><td class="num"><b>${money(round2(byMonth[k]))}</b></td></tr>`;
  }
  h += `</tbody></table></div>`;

  h += `<h2>Orders</h2>`;
  for (const o of ORDERS) {
    h += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <b>${esc(fmtDate(o.date))} · ${esc(o.store)}</b>
        <span class="pill green">${money(o.total)} paid</span>
      </div>
      <table class="spend"><tbody>
        <tr><td>Subtotal <span class="muted">(${o.items} items)</span></td><td class="num">${money(o.subtotal)}</td></tr>
        <tr><td>Discounts <span class="muted">— ${esc(o.discountNote)}</span></td><td class="num" style="color:var(--accent)">−${money(o.discount)}</td></tr>
        <tr><td>Fulfillment</td><td class="num">${esc(o.fulfillment)}</td></tr>
        <tr><td>Tax</td><td class="num">${money(o.tax)}</td></tr>
        <tr class="grand"><td><b>Total</b></td><td class="num"><b>${money(o.total)}</b></td></tr>
        <tr><td class="muted">Paid with</td><td class="num muted">${esc(o.payment)}</td></tr>
      </tbody></table>
    </div>`;
  }
  h += `<p class="note-box">📊 Each order logged here builds your true monthly grocery spend. Charts + month-by-month tables are the next step — and a button to log new orders yourself.</p>`;
  return h;
};

/* ---------- PROGRESS (chart + log) ---------- */
views.progress = () => {
  const iso = todayISO();
  const pr = progress[iso] || {};
  let h = `<h1>Progress</h1><p class="subtitle">Log your morning weight. The chart shows your actual weight vs the target band — small daily swings are normal.</p>`;

  h += `<div class="chart-wrap"><canvas id="wchart" height="320"></canvas>
    <div class="muted" style="font-size:.8rem;margin-top:8px;text-align:center">
      <span style="color:var(--accent)">●</span> your weight &nbsp;
      <span style="color:var(--accent2)">●</span> 7-day average &nbsp;
      <span style="color:var(--muted)">▬</span> target line &nbsp; shaded = ±1.0 kg target band</div>
  </div>`;

  // today's full log form
  h += `<h2>Log — ${esc(fmtDate(iso))}</h2><div class="card">
    <div class="form-grid">
      ${field("weight", "Weight (kg)", pr.weight, "number", "0.1")}
      ${field("calories", "Calories", pr.calories, "number")}
      ${field("protein", "Protein (g)", pr.protein, "number")}
      ${field("steps", "Steps", pr.steps, "number")}
      ${field("cardio", "Cardio (min)", pr.cardio, "number")}
      ${field("sleep", "Sleep (hrs)", pr.sleep, "number", "0.5")}
      <label class="field">Trained?
        <select id="pf_trained"><option value="">—</option>
          <option ${pr.trained === "Yes" ? "selected" : ""}>Yes</option>
          <option ${pr.trained === "No" ? "selected" : ""}>No</option></select></label>
      <label class="field">Meal timing followed?
        <select id="pf_timing"><option value="">—</option>
          <option ${pr.timing === "Yes" ? "selected" : ""}>Yes</option>
          <option ${pr.timing === "Partly" ? "selected" : ""}>Partly</option>
          <option ${pr.timing === "No" ? "selected" : ""}>No</option></select></label>
    </div>
    <label class="field" style="margin-top:12px">Notes<textarea id="pf_notes" rows="2">${esc(pr.notes || "")}</textarea></label>
    <button class="btn primary" style="margin-top:14px" onclick="saveProgress('${iso}')">Save</button>
    <span id="pmsg" class="muted" style="margin-left:10px"></span>
  </div>`;

  // history table
  const logged = Object.values(progress).filter((p) => p.weight != null).sort((a, b) => b.date.localeCompare(a.date));
  if (logged.length) {
    h += `<h2>History</h2><div class="table-wrap"><table><thead><tr>
      <th>Date</th><th>Weight</th><th>Target</th><th>Δ</th><th>Cals</th><th>Protein</th><th>Steps</th><th>Trained</th></tr></thead><tbody>`;
    for (const p of logged) {
      const t = P.progressTracker.find((x) => x.date === p.date);
      const tgt = t ? t.targetKg : null;
      const delta = tgt != null && p.weight != null ? (p.weight - tgt).toFixed(1) : "";
      h += `<tr><td>${esc(fmtDate(p.date))}</td><td class="num"><b>${esc(p.weight)}</b></td>
        <td class="num">${tgt ?? "—"}</td><td class="num" style="color:${delta > 0 ? "var(--warn)" : "var(--accent)"}">${delta > 0 ? "+" : ""}${delta}</td>
        <td class="num">${p.calories ?? "—"}</td><td class="num">${p.protein ?? "—"}</td>
        <td class="num">${p.steps ?? "—"}</td><td>${esc(p.trained || "—")}</td></tr>`;
    }
    h += `</tbody></table></div>`;
  }
  return h;
};
function field(id, label, val, type = "number", step) {
  return `<label class="field">${label}<input id="pf_${id}" type="${type}" ${step ? `step="${step}"` : ""} value="${val ?? ""}"></label>`;
}
window.saveProgress = (iso) => {
  const g = (id) => $("#pf_" + id).value;
  progress[iso] = {
    date: iso,
    weight: numOrNull(g("weight")), calories: numOrNull(g("calories")), protein: numOrNull(g("protein")),
    steps: numOrNull(g("steps")), cardio: numOrNull(g("cardio")), sleep: numOrNull(g("sleep")),
    trained: g("trained"), timing: g("timing"), notes: g("notes"),
  };
  saveJSON(LS_PROG, progress);
  $("#pmsg").textContent = "Saved ✓";
  drawChart();
};

/* ---------- canvas chart: actual vs target band ---------- */
function drawChart() {
  const cv = $("#wchart");
  if (!cv) return;
  const dpr = window.devicePixelRatio || 1;
  const W = cv.clientWidth, H = 320;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const series = P.progressTracker; // {date, targetKg}
  const pad = { l: 42, r: 14, t: 14, b: 26 };
  const n = series.length;
  const xAt = (i) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);

  const BAND = 1.0;
  const targets = series.map((s) => s.targetKg);
  const actuals = series.map((s) => (progress[s.date]?.weight ?? null));
  const all = [...targets.map((t) => t + BAND), ...targets.map((t) => t - BAND), ...actuals.filter((v) => v != null)];
  let min = Math.min(...all), max = Math.max(...all);
  const margin = (max - min) * 0.12 || 1; min -= margin; max += margin;
  const yAt = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);

  // grid + y labels
  ctx.strokeStyle = "#dde3ec"; ctx.fillStyle = "#647182"; ctx.font = "11px -apple-system,sans-serif"; ctx.lineWidth = 1;
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const v = min + (i / ticks) * (max - min);
    const y = yAt(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(v.toFixed(1), 6, y + 3);
  }

  // target band (shaded)
  ctx.fillStyle = "rgba(100,113,130,.14)";
  ctx.beginPath();
  series.forEach((s, i) => { const x = xAt(i), y = yAt(s.targetKg + BAND); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(xAt(i), yAt(series[i].targetKg - BAND));
  ctx.closePath(); ctx.fill();

  // target line (dashed)
  ctx.strokeStyle = "#647182"; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5;
  ctx.beginPath();
  series.forEach((s, i) => { const x = xAt(i), y = yAt(s.targetKg); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.stroke(); ctx.setLineDash([]);

  // 7-day rolling average of actuals
  const roll = actuals.map((_, i) => {
    const win = actuals.slice(Math.max(0, i - 6), i + 1).filter((v) => v != null);
    return win.length ? win.reduce((a, b) => a + b, 0) / win.length : null;
  });
  drawLine(ctx, series, roll, xAt, yAt, "#2b7fff", 2, false);
  // actual weight points + line
  drawLine(ctx, series, actuals, xAt, yAt, "#12a06d", 2, true);

  // x labels (week starts)
  ctx.fillStyle = "#647182";
  series.forEach((s, i) => {
    if (i % 7 === 0) { ctx.fillText("W" + (i / 7 + 1), xAt(i) - 6, H - 8); }
  });
}
function drawLine(ctx, series, vals, xAt, yAt, color, w, dots) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); let started = false;
  vals.forEach((v, i) => {
    if (v == null) { started = false; return; }
    const x = xAt(i), y = yAt(v);
    started ? ctx.lineTo(x, y) : ctx.moveTo(x, y); started = true;
  });
  ctx.stroke();
  if (dots) vals.forEach((v, i) => { if (v != null) { ctx.beginPath(); ctx.arc(xAt(i), yAt(v), 3, 0, 7); ctx.fill(); } });
}

/* ---------- GUIDES (timing + rules) ---------- */
views.guides = () => {
  let h = `<h1>Guides</h1><p class="subtitle">Meal timing, fat-loss adjustments, and practical dorm/Boston notes.</p>`;
  for (const sec of [...P.timingSections, ...P.rulesSections]) {
    if (!sec.rows.length) continue;
    h += `<h2>${esc(sec.title)}</h2>`;
    const first = sec.rows[0];
    // table if first row looks like a header (>=3 cols & short cells), else definition list
    const isTable = first.length >= 3 && first.every((c) => typeof c === "string" && c.length < 24);
    if (isTable) {
      h += `<div class="table-wrap"><table><thead><tr>${first.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>`;
      for (const r of sec.rows.slice(1)) h += `<tr>${first.map((_, i) => `<td>${esc(r[i] ?? "")}</td>`).join("")}</tr>`;
      h += `</tbody></table></div>`;
    } else {
      h += `<div class="card"><ul class="list-clean">`;
      for (const r of sec.rows) h += `<li><span class="n">•</span><span>${r.map((c, i) => (i === 0 ? `<b>${esc(c)}:</b> ` : esc(c))).join("")}</span></li>`;
      h += `</ul></div>`;
    }
  }
  return h;
};

/* ===========================================================
   ROUTER + MODAL
   =========================================================== */
function render() {
  const view = (location.hash.replace("#", "") || "today");
  const fn = views[view] || views.today;
  $("#content").innerHTML = fn();
  $$(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.view === view));
  $("#sidebar").classList.remove("open");
  window.scrollTo(0, 0);
  if (view === "progress") setTimeout(drawChart, 30);
}
function openModal(html) { $("#modalBody").innerHTML = html; $("#modal").hidden = false; }
function closeModal() { $("#modal").hidden = true; }
window.openModal = openModal; window.closeModal = closeModal;

window.addEventListener("hashchange", render);
window.addEventListener("resize", () => { if (location.hash.replace("#", "") === "progress") drawChart(); });
document.addEventListener("DOMContentLoaded", () => {
  $("#topbarMeta").innerHTML =
    `<span>🎯 <b>${P.meta["Target kg"]} kg</b> by ${P.meta["End date"]}</span><span>Week <b>${currentWeek()}</b>/8</span>`;
  $("#navToggle").onclick = () => $("#sidebar").classList.toggle("open");
  $("#modalClose").onclick = closeModal;
  $("#modal").onclick = (e) => { if (e.target.id === "modal") closeModal(); };
  render();
});
