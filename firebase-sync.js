// Cloud sync via Firebase (no build step — pure ES modules from CDN).
// Stores all localStorage app state in Firestore, private to the signed-in user.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
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

// the localStorage keys app.js uses
const KEYS = [
  "wp_meal_overrides_v1", "wp_progress_v1", "wp_meal_done_v1", "wp_timing_done_v1",
  "wp_weights_v1", "wp_bought_v1", "wp_actual_price_v1",
];

let userDocRef = null;
let applyingRemote = false; // guards against echo loops
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
  if (applyingRemote || !userDocRef) return;
  clearTimeout(pushTimer);
  setBadge("saving…");
  pushTimer = setTimeout(async () => {
    try {
      await setDoc(userDocRef, { payload: JSON.stringify(snapshotPayload()), updatedAt: serverTimestamp() }, { merge: true });
      setBadge("synced");
    } catch { setBadge("offline — will retry"); }
  }, 800);
};

onAuthStateChanged(auth, async (user) => {
  if (!user) { userDocRef = null; showLogin(); setBadge("not signed in"); return; }
  hideLogin();
  userDocRef = doc(db, "users", user.uid);
  setBadge("syncing…");
  try {
    const snap = await getDoc(userDocRef);
    if (snap.exists() && snap.data().payload) {
      applyingRemote = true; applyPayload(JSON.parse(snap.data().payload)); applyingRemote = false;
    } else {
      await setDoc(userDocRef, { payload: JSON.stringify(snapshotPayload()), updatedAt: serverTimestamp() });
    }
  } catch { setBadge("offline"); }
  // live updates from other devices
  onSnapshot(userDocRef, (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return; // skip our own writes
    const p = snap.data().payload; if (!p) return;
    const incoming = JSON.parse(p);
    if (JSON.stringify(incoming) === JSON.stringify(snapshotPayload())) return;
    applyingRemote = true; applyPayload(incoming); applyingRemote = false;
    setBadge("synced");
  });
  setBadge("synced · " + user.email);
});

/* ---------- minimal UI: login overlay + status badge ---------- */
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }

const badge = el(`<button id="fb-badge" title="Cloud sync">☁︎ …</button>`);
const badgeCSS = el(`<style>
  #fb-badge{margin-left:8px;border:1px solid var(--line);background:var(--panel);color:var(--muted);
    font:600 .76rem -apple-system,sans-serif;padding:5px 10px;border-radius:999px;cursor:pointer}
  #fb-badge:hover{border-color:var(--accent);color:var(--accent)}
  #fb-login{position:fixed;inset:0;background:rgba(27,35,48,.5);display:flex;align-items:center;justify-content:center;z-index:60;padding:18px}
  #fb-login .box{background:var(--panel);border:1px solid var(--line);border-radius:16px;max-width:370px;width:100%;padding:24px;box-shadow:0 18px 50px rgba(27,35,48,.3)}
  #fb-login label{display:flex;flex-direction:column;gap:5px;font-size:.8rem;color:var(--muted);margin-bottom:11px}
  #fb-login input{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:8px;padding:10px 11px;font-size:16px}
  #fb-login .row{display:flex;gap:8px;margin-top:4px}
  #fb-msg{font-size:.82rem;min-height:1em;margin:4px 0 10px}
</style>`);
document.head.append(badgeCSS);

const login = el(`<div id="fb-login" hidden>
  <div class="box">
    <h2 style="margin:0 0 6px">☁︎ Cloud sync</h2>
    <p class="muted" style="font-size:.86rem;margin:0 0 16px">Sign in to sync across phone &amp; Mac. Use the same email &amp; password on each device.</p>
    <label>Email<input id="fb-email" type="email" autocomplete="username"></label>
    <label>Password<input id="fb-pass" type="password" autocomplete="current-password"></label>
    <div id="fb-msg" class="muted"></div>
    <div class="row">
      <button class="btn primary" id="fb-signin" style="flex:1">Sign in</button>
      <button class="btn" id="fb-signup" style="flex:1">Create account</button>
    </div>
    <div style="margin-top:14px;text-align:center"><a href="#" id="fb-skip" class="muted" style="font-size:.82rem">Use offline (no sync)</a></div>
  </div>
</div>`);

function mount() {
  const topbar = document.querySelector(".topbar");
  if (topbar) topbar.append(badge);
  document.body.append(login);
  badge.onclick = () => { if (auth.currentUser) { if (confirm("Sign out of cloud sync on this device?")) signOut(auth); } else showLogin(); };
  login.querySelector("#fb-skip").onclick = (e) => { e.preventDefault(); hideLogin(); };
  login.querySelector("#fb-signin").onclick = () => authAction(signInWithEmailAndPassword);
  login.querySelector("#fb-signup").onclick = () => authAction(createUserWithEmailAndPassword);
}
async function authAction(fn) {
  const email = login.querySelector("#fb-email").value.trim();
  const pass = login.querySelector("#fb-pass").value;
  const msg = login.querySelector("#fb-msg");
  if (!email || !pass) { msg.textContent = "Enter email and password."; return; }
  msg.style.color = "var(--muted)"; msg.textContent = "Working…";
  try { await fn(auth, email, pass); }
  catch (e) { msg.style.color = "var(--danger)"; msg.textContent = friendly(e.code || e.message); }
}
function friendly(code) {
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return "Wrong email/password — or tap Create account if you're new.";
  if (/email-already-in-use/.test(code)) return "Account exists — use Sign in.";
  if (/weak-password/.test(code)) return "Password too short (min 6 characters).";
  if (/invalid-email/.test(code)) return "That email doesn't look right.";
  return "Couldn't sign in: " + code;
}
function showLogin() { login.hidden = false; }
function hideLogin() { login.hidden = true; }
function setBadge(txt) { badge.textContent = "☁︎ " + txt; }

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
