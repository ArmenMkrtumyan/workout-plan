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

// push the current local snapshot to the cloud now (no debounce). Clears the pending
// flag only on success, so a failed/offline push is retried on the next flush.
async function pushNow() {
  if (!ready || applyingRemote) return;
  clearTimeout(pushTimer); pushTimer = null;
  setBadge("saving…");
  try {
    await setDoc(DOC, { payload: JSON.stringify(snapshotPayload()), updatedAt: serverTimestamp() }, { merge: true });
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
    const hasLocalPending = !!localStorage.getItem(PENDING_KEY);
    if (snap.exists() && snap.data().payload && !hasLocalPending) {
      // no unsynced local edits -> adopt the cloud copy
      applyingRemote = true; applyPayload(JSON.parse(snap.data().payload)); applyingRemote = false;
    } else {
      // first ever write, OR this device has unsynced local changes that must win
      await setDoc(DOC, { payload: JSON.stringify(snapshotPayload()), updatedAt: serverTimestamp() });
      localStorage.removeItem(PENDING_KEY);
    }
    ready = true;
    if (localStorage.getItem(PENDING_KEY)) pushNow(); // flush anything queued while connecting
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
const badge = el(`<button id="fb-badge" title="Sync status — tap to push THIS device's data to the cloud">☁︎ …</button>`);
document.head.append(el(`<style>
  #fb-badge{margin-left:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);
    font:600 .76rem -apple-system,sans-serif;padding:5px 10px;border-radius:999px;cursor:pointer}
  #fb-badge:hover{border-color:var(--accent);color:var(--accent)}
</style>`));
function setBadge(txt) { badge.textContent = "☁︎ " + txt; }
function mount() {
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.append(badge);
  // Tap when signed out -> retry login. Tap when connected -> force this device's data
  // up to the cloud so it wins on every other device (fixes two devices that disagree).
  badge.onclick = () => {
    if (!auth.currentUser) { setBadge("connecting…"); signInAnonymously(auth).catch(() => setBadge("offline — tap to retry")); return; }
    if (!ready) return;
    if (confirm("Push THIS device's data to the cloud now? It becomes the version every other device loads.")) {
      localStorage.setItem(PENDING_KEY, "1"); pushNow();
    }
  };
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
