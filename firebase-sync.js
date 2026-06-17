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

const KEYS = [
  "wp_meal_overrides_v1", "wp_progress_v1", "wp_meal_done_v1", "wp_timing_done_v1",
  "wp_weights_v1", "wp_bought_v1", "wp_actual_price_v1", "wp_custom_meals_v1",
];
const DOC = doc(db, "shared", "data"); // one shared doc for the single user

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

// local change -> cloud (debounced)
window.onDataChanged = () => {
  if (applyingRemote || !ready) return;
  clearTimeout(pushTimer);
  setBadge("saving…");
  pushTimer = setTimeout(async () => {
    try {
      await setDoc(DOC, { payload: JSON.stringify(snapshotPayload()), updatedAt: serverTimestamp() }, { merge: true });
      setBadge("synced");
    } catch { setBadge("offline"); }
  }, 800);
};

onAuthStateChanged(auth, async (user) => {
  if (!user) { ready = false; setBadge("connecting…"); signInAnonymously(auth).catch(() => setBadge("offline — tap to retry")); return; }
  setBadge("syncing…");
  try {
    const snap = await getDoc(DOC);
    if (snap.exists() && snap.data().payload) {
      applyingRemote = true; applyPayload(JSON.parse(snap.data().payload)); applyingRemote = false;
    } else {
      await setDoc(DOC, { payload: JSON.stringify(snapshotPayload()), updatedAt: serverTimestamp() });
    }
    ready = true;
  } catch { setBadge("offline"); }
  onSnapshot(DOC, (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return; // skip our own writes
    const p = snap.data().payload; if (!p) return;
    const incoming = JSON.parse(p);
    if (JSON.stringify(incoming) === JSON.stringify(snapshotPayload())) return;
    applyingRemote = true; applyPayload(incoming); applyingRemote = false;
    setBadge("synced");
  });
  setBadge("synced");
});

/* ---------- status badge only (no login UI) ---------- */
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
const badge = el(`<button id="fb-badge" title="Cloud sync status">☁︎ …</button>`);
document.head.append(el(`<style>
  #fb-badge{margin-left:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);
    font:600 .76rem -apple-system,sans-serif;padding:5px 10px;border-radius:999px;cursor:pointer}
  #fb-badge:hover{border-color:var(--accent);color:var(--accent)}
</style>`));
function setBadge(txt) { badge.textContent = "☁︎ " + txt; }
function mount() {
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.append(badge);
  badge.onclick = () => { if (!auth.currentUser) signInAnonymously(auth).catch(() => {}); };
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
