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
const loadJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let overrides = loadJSON(LS_SWAP); // { "2026-06-15": { "Breakfast": "Protein Oatmeal" } }
let progress = loadJSON(LS_PROG);  // { "2026-06-15": { weight, calories, protein, steps, cardio, trained, sleep, timing, notes } }

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
function dayTotals(dayRow) {
  let cal = 0, pro = 0;
  for (const slot of MEAL_SLOTS) {
    const m = itemMacro(mealFor(dayRow, slot));
    cal += m.cal; pro += m.pro;
  }
  return { cal, pro };
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

  // Workout summary
  h += `<div class="grid cols-2">`;
  h += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">🏋️ ${esc(day.Focus)}</h3>
        <span class="pill ${day.Focus === "Rest" ? "grey" : "green"}">${esc(day.Day)}</span>
      </div>
      <p class="muted" style="margin:8px 0">${esc(day.Notes || "")}</p>
      <div class="muted" style="font-size:.86rem"><b>Cardio:</b> ${esc(day.Cardio)}<br>
        <b>Core/Mobility:</b> ${esc(day["Core/Mobility"])}<br>
        <b>Intensity:</b> ${esc(day.Intensity)}</div>
      ${exercisesFor(day["Workout Template"]).length
        ? `<button class="btn primary" style="margin-top:12px" onclick="openWorkout('${esc(day["Workout Template"])}')">View full workout</button>`
        : `<p class="note-box" style="margin-top:12px">No lifting today — focus on the walk, steps, and recovery.</p>`}
    </div>`;

  // Meal summary
  h += `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h3 style="margin:0">🍽️ Meals</h3>
        <span class="pill blue">${tot.cal} kcal · ${tot.pro}g P</span>
      </div>
      <div style="margin-top:10px">${MEAL_SLOTS.map((s) => mealSlotRow(meal, s)).join("")}</div>
    </div>`;
  h += `</div>`;

  // Timing
  h += `<h2>⏱️ Today's timing</h2><div class="card"><div class="grid auto">
      ${timingChip("Wake", meal["Wake / Early Work"])}
      ${timingChip("Meal 1", meal["Meal 1 Time"])}
      ${timingChip(day.Focus === "Rest" || day.Focus === "Active Recovery" ? "Activity" : "Gym", meal["Gym Window"])}
      ${timingChip("Meal 2", meal["Meal 2 Time"])}
      ${timingChip("Snack", meal["Snack Time"])}
      ${timingChip("Meal 3", meal["Meal 3 Time"])}
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
function timingChip(label, val) {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value" style="font-size:1rem">${esc(val || "—")}</div></div>`;
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

  h += `<h2>🗓️ 8-week overview</h2><div class="table-wrap"><table><thead><tr>
    <th>Wk</th><th>Dates</th><th>Target</th><th>Training focus</th><th>Cardio</th><th>Nutrition</th><th>Notes</th>
    </tr></thead><tbody>`;
  const cw = currentWeek();
  for (const w of P.weekOverview) {
    h += `<tr class="${w.Week === cw ? "hl" : ""}"><td class="num"><b>${w.Week}</b></td><td>${esc(w.Dates)}</td>
      <td class="num">${esc(w["Target kg"])} kg</td><td>${esc(w["Training focus"])}</td>
      <td>${esc(w["Cardio goal"])}</td><td>${esc(w["Nutrition focus"])}</td><td class="muted">${esc(w.Notes)}</td></tr>`;
  }
  h += `</tbody></table></div>`;

  h += `<h2>✅ Daily non-negotiables</h2><div class="card"><ul class="list-clean">
    ${P.nonNegotiables.map((n, i) => `<li><span class="n">${i + 1}</span><span>${esc(n)}</span></li>`).join("")}
  </ul></div>`;
  h += `<p class="note-box">${esc(m["Safety"] || "")} · Adjust only after the 7-day weight trend, never one reading.</p>`;
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
    // compact: only this week's prescription
    h += `<div class="table-wrap"><table><thead><tr>
      <th>#</th><th>Exercise</th><th>This week</th><th>Rest</th></tr></thead><tbody>`;
    for (const e of ex) {
      h += `<tr><td class="num">${esc(e.Order)}</td><td><b>${esc(e.Exercise)}</b>
        <div class="muted" style="font-size:.78rem">${esc(e["Technique cue"])} · alt: ${esc(e["Substitute if busy"])}</div></td>
        <td class="num"><b>${esc(e[colKey])}</b></td>
        <td class="num">${esc(e.Rest)}</td></tr>`;
    }
    h += `</tbody></table></div>`;
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
      </div>`;
    }
    h += `</div></div>`;
  }
  return h;
};
function mealSlotRow(day, slot) {
  const name = mealFor(day, slot);
  if (!name && slot === "Snack 2") return ""; // no second snack that day
  const m = itemMacro(name);
  const swapped = overrides[day.Date] && overrides[day.Date][slot];
  const candidates = swapCandidates(name, slot);
  return `<div class="mealslot">
    <span class="slot-label">${esc(slot)}</span>
    <div class="info" style="flex:1">
      <div class="name">${esc(name || "—")}${swapped ? '<span class="swapped-flag">swapped</span>' : ""}</div>
      <div class="macros">${m.cal} kcal · ${m.pro}g protein</div>
    </div>
    ${name && candidates.length ? `<button class="btn small" onclick="openSwap('${esc(day.Date)}','${esc(slot)}')">Swap</button>` : ""}
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

  const byCat = {};
  for (const g of P.grocery) (byCat[g.Category] ||= []).push(g);
  for (const cat of Object.keys(byCat)) {
    const catWeekly = byCat[cat].reduce((s, g) => s + ((PRICES[g.Item]?.[1] === "wk") ? PRICES[g.Item][0] : 0), 0);
    h += `<h2>${esc(cat)} ${catWeekly ? `<span class="pill green">~${money(catWeekly)}/wk</span>` : ""}</h2>
      <div class="table-wrap"><table><thead><tr>
      <th>Item</th><th>Est. cost</th><th>Qty / week</th><th>Used for</th><th>Note</th></tr></thead><tbody>`;
    for (const g of byCat[cat]) {
      const p = PRICES[g.Item];
      const costCell = p
        ? `<b>${money(p[0])}</b> <span class="muted" style="font-size:.78rem">${FREQ_LABEL[p[1]]}</span>${p[1] !== "wk" ? ` <span class="pill ${p[1] === "mo" ? "blue" : "grey"}" style="margin-left:2px">${p[1] === "mo" ? "monthly" : "one-time"}</span>` : ""}`
        : `<span class="muted">—</span>`;
      h += `<tr><td><b>${esc(g.Item)}</b><div class="muted" style="font-size:.76rem">🔎 ${esc(g["Target search/aisle words"])}</div></td>
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
