// Cloud sync via Firebase (no build step — pure ES modules from CDN).
// Single-user app, no login: signs in anonymously and syncs all app state to one
// shared Firestore document. localStorage stays as the offline cache.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously, setPersistence, browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDVNe4s0AKuHPHWVpFVHyZCw16ajSliDro",
  authDomain: "workout-plan-e40cf.firebaseapp.com",
  projectId: "workout-plan-e40cf",
  storageBucket: "workout-plan-e40cf.firebasestorage.app",
  messagingSenderId: "659115683502",
  appId: "1:659115683502:web:70647c25fc6a04eb3cc73f",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// app.js owns the list of synced stores (see its PERSISTENT STATE section) and
// exposes it as window.WP_SYNCED_KEYS, so the two files can never drift apart.
// app.js is a plain <script> loaded before this module, so it's already defined.
const KEYS = window.WP_SYNCED_KEYS;
const DOC = doc(db, "shared", "data"); // one shared doc for the single user

const PENDING_KEY = "wp_sync_pending"; // device-local flag: a change is waiting to reach
                                       // the cloud. Survives reloads so it can't be lost.
const SHADOW_KEY = "wp_sync_shadow";   // device-local: the last payload this device agreed
                                       // with the cloud on. It's the "base" for 3-way merge,
                                       // letting us push only what THIS device changed.

let ready = false;
let applyingRemote = false;
let pushTimer = null;

const snapshotPayload = () => Object.fromEntries(KEYS.map((k) => [k, localStorage.getItem(k)]));
function applyPayload(p) {
  for (const k of KEYS) {
    const v = p ? p[k] : null;
    if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  }
  if (window.reloadFromStorage) window.reloadFromStorage();
}
const loadShadow = () => { try { return JSON.parse(localStorage.getItem(SHADOW_KEY)) || {}; } catch { return {}; } };
const saveShadow = (p) => localStorage.setItem(SHADOW_KEY, JSON.stringify(p));

/* ---------- 3-way merge (base = shadow, local = this device, remote = cloud) ----------
   Entry-level, so a device only contributes what it actually changed since it last synced.
   A stale device can no longer wipe entries another device added; real deletions still
   propagate, but a delete loses to a concurrent edit on the other side (undelete wins). */
const isPlainObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function merge3(base, local, remote) {
  if (isPlainObj(local) && isPlainObj(remote)) {
    const b = isPlainObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(b), ...Object.keys(local), ...Object.keys(remote)])) {
      const inB = k in b, inL = k in local, inR = k in remote;
      if (inL && inR) { out[k] = merge3(inB ? b[k] : undefined, local[k], remote[k]); continue; }
      if (!inL && inR) { if (inB && deepEq(b[k], remote[k])) continue; out[k] = remote[k]; continue; }
      if (inL && !inR) { if (inB && deepEq(b[k], local[k])) continue; out[k] = local[k]; continue; }
    }
    return out;
  }
  if (deepEq(local, remote)) return local;
  if (base !== undefined && deepEq(base, local)) return remote;  // only remote changed
  if (base !== undefined && deepEq(base, remote)) return local;  // only local changed
  return local;                                                  // true conflict -> local wins
}
// merge whole payloads (each store is a JSON string or null); returns {key: string|null}
function mergePayload(base, local, remote) {
  const parse = (s) => { if (s == null) return undefined; try { return JSON.parse(s); } catch { return undefined; } };
  const out = {};
  for (const k of KEYS) {
    const b = parse(base[k]), l = parse(local[k]), r = parse(remote[k]);
    if (l === undefined && r === undefined) out[k] = null;
    else if (l === undefined) out[k] = JSON.stringify(r);
    else if (r === undefined) out[k] = JSON.stringify(l);
    else out[k] = JSON.stringify(merge3(b, l, r));
  }
  return out;
}
const normalize = (p) => JSON.stringify(Object.fromEntries(KEYS.map((k) => [k, p[k] ?? null])));

// Reconcile local + cloud with a 3-way merge, apply the result locally, and write it back
// if it differs from what the cloud already has. Never blindly overwrites the cloud.
async function pushNow() {
  if (!ready || applyingRemote) return;
  clearTimeout(pushTimer); pushTimer = null;
  setBadge("saving…");
  try {
    const snap = await getDoc(DOC);
    const remote = snap.exists() && snap.data().payload ? JSON.parse(snap.data().payload) : {};
    const merged = mergePayload(loadShadow(), snapshotPayload(), remote);
    applyingRemote = true; applyPayload(merged); applyingRemote = false;
    saveShadow(merged);
    if (normalize(merged) !== normalize(remote)) {
      await setDoc(DOC, { payload: JSON.stringify(merged), updatedAt: serverTimestamp() }, { merge: true });
    }
    localStorage.removeItem(PENDING_KEY);
    setBadge("synced");
  } catch { setBadge("offline"); } // PENDING_KEY stays set -> retried later
}

// local change -> cloud (debounced). Mark pending FIRST (and persist it) so a change
// made before sync is ready, or right before the tab closes, is never silently dropped.
window.onDataChanged = () => {
  if (applyingRemote) return;
  localStorage.setItem(PENDING_KEY, "1");
  if (!ready) return; // flushed once auth/initial-load completes (see below)
  clearTimeout(pushTimer);
  setBadge("saving…");
  pushTimer = setTimeout(pushNow, 800);
};

// flush a pending change immediately when the tab is hidden/closed, so a change made
// inside the 800ms debounce window isn't lost on navigation away.
function flushPending() { if (localStorage.getItem(PENDING_KEY) && ready && !applyingRemote) pushNow(); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPending(); });
window.addEventListener("pagehide", flushPending);

onAuthStateChanged(auth, async (user) => {
  if (!user) { ready = false; setBadge("connecting…"); signInAnonymously(auth).catch(() => setBadge("offline — tap to retry")); return; }
  setBadge("syncing…");
  try {
    const snap = await getDoc(DOC);
    const remote = snap.exists() && snap.data().payload ? JSON.parse(snap.data().payload) : {};
    // 3-way merge on connect: union local + cloud without losing either side. On a fresh
    // device the shadow is empty, so this becomes a plain union (nothing is dropped).
    const merged = mergePayload(loadShadow(), snapshotPayload(), remote);
    applyingRemote = true; applyPayload(merged); applyingRemote = false;
    saveShadow(merged);
    if (normalize(merged) !== normalize(remote)) {
      await setDoc(DOC, { payload: JSON.stringify(merged), updatedAt: serverTimestamp() }, { merge: true });
    }
    localStorage.removeItem(PENDING_KEY);
    ready = true;
  } catch { setBadge("offline"); }
  onSnapshot(DOC, (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return; // skip our own writes
    const p = snap.data().payload; if (!p) return;
    const remote = JSON.parse(p);
    const merged = mergePayload(loadShadow(), snapshotPayload(), remote);
    if (normalize(merged) === normalize(snapshotPayload())) { saveShadow(merged); setBadge("synced"); return; }
    applyingRemote = true; applyPayload(merged); applyingRemote = false;
    saveShadow(merged);
    // if the merge produced something the cloud doesn't have yet (local-only edits), push it
    if (normalize(merged) !== normalize(remote)) onDataChanged();
    else setBadge("synced");
  });
  setBadge("synced");
});

/* ---------- status badge only (no login UI) ---------- */
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const badge = el(`<button id="fb-badge" title="Sync status — tap to sync now">☁︎ …</button>`);
document.head.append(el(`<style>
  #fb-badge{margin-left:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);
    font:600 .76rem -apple-system,sans-serif;padding:5px 10px;border-radius:999px;cursor:pointer}
  #fb-badge:hover{border-color:var(--accent);color:var(--accent)}
</style>`));
function setBadge(txt) { badge.textContent = "☁︎ " + txt; }
function mount() {
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.append(badge);
  // Tap when signed out -> retry login. Tap when connected -> sync now (a safe 3-way
  // merge; it combines this device with the cloud instead of overwriting either).
  badge.onclick = () => {
    if (!auth.currentUser) { setBadge("connecting…"); signInAnonymously(auth).catch(() => setBadge("offline — tap to retry")); return; }
    if (!ready) return;
    pushNow();
  };
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
