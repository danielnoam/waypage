// App lock (1.38.0): a passcode to open Waypage, with fingerprint or face
// on top of it on Android. Per device: the lock and its passcode never
// sync. The passcode is kept only as a PBKDF2 hash with its own salt; a
// forgotten one can't be recovered, only erased with everything else on
// this device, and sync or a Drive backup brings the clips back.
//
// It keeps people who pick up the phone (or use the computer) out of
// Waypage. It doesn't encrypt the library: the files under it are the
// phone's own app storage, or the folder you picked (NOTES.md).
// Loaded after app-settings.js, before app-start.js.

const LOCK_KEY = "waypage.lock";
const LOCK_TRIES_KEY = "waypage.lockTries";
const LOCK_ITER = 210000;
const LOCK_MIN = 4, LOCK_MAX = 12;
// Wrong five times: a wait, twice as long each time after.
const LOCK_FREE_TRIES = 5, LOCK_WAIT_MS = 30000, LOCK_WAIT_MAX = 15 * 60000;
const LOCK_AFTERS = [
  { value: 0, label: "Right away", note: "Every time you leave the app" },
  { value: 60000, label: "After 1 minute", note: "Time to pick a file or sign in" },
  { value: 5 * 60000, label: "After 5 minutes" },
  { value: 15 * 60000, label: "After 15 minutes" },
];

const lockCfg = () => { const c = load(LOCK_KEY, null); return c && c.hash && c.salt ? c : null; };
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesOfHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
async function lockHash(code, saltHex, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
  return hexOf(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: bytesOfHex(saltHex), iterations: iter }, key, 256));
}
async function lockCheck(code) {
  const c = lockCfg();
  if (!c) return true;
  const h = await lockHash(code, c.salt, c.iter || LOCK_ITER);
  let diff = h.length ^ c.hash.length;
  for (let i = 0; i < h.length && i < c.hash.length; i++) diff |= h.charCodeAt(i) ^ c.hash.charCodeAt(i);
  return diff === 0;
}
async function lockSet(code) {
  const salt = hexOf(crypto.getRandomValues(new Uint8Array(16)));
  const was = lockCfg();
  store(LOCK_KEY, { v: 1, salt, iter: LOCK_ITER, hash: await lockHash(code, salt, LOCK_ITER), len: code.length,
    bio: !!(was && was.bio), after: was ? was.after : 60000 });
  store(LOCK_TRIES_KEY, null);
  C.platform.lock.hideRecents(true);
}
function lockChange(change) {
  const c = lockCfg();
  if (c) store(LOCK_KEY, { ...c, ...change });
}
const lockCan = () => !!(window.crypto && crypto.subtle);

// ---- The keypad ----
// One screen over everything, in three uses: unlocking, setting a new
// passcode (twice), and checking the passcode before it's changed or
// turned off, which can be cancelled.
const lock = { up: false, mode: "", code: "", first: "", done: null, busy: false, erase: false };
const lockTries = () => load(LOCK_TRIES_KEY, null) || { n: 0, until: 0 };
let lockWaitTimer = null;

function lockKeys() {
  const key = (label, value, aria) => el("button", { class: "lock-key", type: "button", "data-key": value, "aria-label": aria || label }, label);
  const del = el("button", { class: "lock-key lock-key-icon", type: "button", "data-key": "del", "aria-label": "Delete" });
  del.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h11v14H9l-6-7z"></path><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"></path></svg>';
  const bio = el("button", { class: "lock-key lock-key-icon", type: "button", "data-key": "bio", id: "lockBio", "aria-label": "Use fingerprint or face", hidden: "" });
  bio.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.2A7.5 7.5 0 0 1 19.5 11"></path><path d="M4.6 9.5a7.7 7.7 0 0 0-.1 1.5c0 2.3.5 4.4 1.4 6.2"></path><path d="M8 18.8c-.9-2.1-1.5-4.6-1.5-7.3a5.5 5.5 0 0 1 11 0v.7"></path><path d="M12 11.5c0 3.3.7 6.3 2 8.8"></path><path d="M9.5 11.5a2.5 2.5 0 0 1 5 0c0 2.6.5 5 1.4 7"></path><path d="M17.6 15.5c.2 1.3.6 2.5 1.1 3.6"></path></svg>';
  return [..."123456789"].map((d) => key(d, d)).concat([el("span", { class: "lock-key-gap" }, bio), key("0", "0"), del]);
}

function lockPaint(note, warn) {
  const t = lockTries();
  const waiting = lock.mode !== "set" && t.until > Date.now();
  const titles = {
    unlock: "Enter your passcode",
    check: "Enter your passcode",
    set: lock.first ? "Enter it again" : "Choose a passcode",
  };
  $("lockTitle").textContent = lock.erase ? "Erase Waypage on this device?" : titles[lock.mode];
  $("lockView").classList.toggle("erasing", lock.erase);
  const n = lock.mode === "set" ? Math.max(LOCK_MIN, lock.code.length) : (lockCfg() || {}).len || Math.max(LOCK_MIN, lock.code.length);
  fill($("lockDots"), ...Array.from({ length: Math.min(LOCK_MAX, n) }, (_, i) => el("span", { class: "lock-dot" + (i < lock.code.length ? " on" : "") })));
  $("lockDots").setAttribute("aria-label", lock.code.length + (lock.code.length === 1 ? " number" : " numbers") + " entered");
  const text = waiting ? "Too many wrong tries. Try again in " + lockWaitText(t.until - Date.now()) + "."
    : note || (lock.mode === "set" && !lock.first ? LOCK_MIN + " to " + LOCK_MAX + " numbers." + (C.platform.os === "android" ? " Fingerprint or face can be added after." : "") : "");
  $("lockNote").textContent = text;
  $("lockNote").classList.toggle("warn", !!warn || waiting);
  $("lockNext").hidden = lock.mode !== "set";
  $("lockNext").disabled = lock.code.length < LOCK_MIN;
  $("lockNext").textContent = lock.first ? "Turn on" : "Next";
  $("lockCancel").hidden = lock.mode === "unlock";
  $("lockForgot").hidden = lock.mode === "set";
  for (const b of $("lockKeys").querySelectorAll("button")) b.disabled = lock.busy || waiting;
  clearTimeout(lockWaitTimer);
  if (waiting) lockWaitTimer = setTimeout(() => lockPaint(), Math.min(1000, t.until - Date.now()));
}
function lockWaitText(ms) {
  const s = Math.ceil(ms / 1000);
  return s < 60 ? s + (s === 1 ? " second" : " seconds") : Math.ceil(s / 60) + (Math.ceil(s / 60) === 1 ? " minute" : " minutes");
}

// Shows the keypad; resolves true once unlocked, set or checked, false
// when cancelled.
function lockShow(mode) {
  if (lock.up) { lockHide(false); }
  Object.assign(lock, { up: true, mode, code: "", first: "", busy: false, erase: false });
  document.documentElement.classList.add("locked");
  const view = $("lockView");
  view.hidden = false;
  $("lockErase").hidden = true;
  $("lockPad").hidden = false;
  lockPaint();
  const done = new Promise((r) => { lock.done = r; });
  if (mode === "unlock") {
    C.stats.closed();
    const c = lockCfg();
    if (c && c.bio) C.platform.lock.biometric().then((ok) => {
      $("lockBio").hidden = !ok;
      // The phone's own prompt straight away, once the screen is up.
      if (ok && lock.up && lock.mode === "unlock" && !document.hidden) lockBio();
    });
  } else $("lockBio").hidden = true;
  afterStart(() => { if (lock.up) $("lockView").focus({ preventScroll: true }); });
  return done;
}
function lockHide(result) {
  if (!lock.up) return;
  lock.up = false;
  clearTimeout(lockWaitTimer);
  $("lockView").hidden = true;
  document.documentElement.classList.remove("locked");
  const r = lock.done;
  lock.done = null;
  if (r) r(result);
  if (state.open) C.stats.opened(state.open.id, true);
}

async function lockBio() {
  if (lock.busy || !lock.up) return;
  lock.busy = true;
  const ok = await C.platform.lock.verify("Unlock Waypage");
  lock.busy = false;
  if (!lock.up) return;
  if (ok) { store(LOCK_TRIES_KEY, null); lockHide(true); return; }
  lockPaint();
}

async function lockEnter() {
  if (lock.busy) return;
  const code = lock.code;
  if (lock.mode === "set") {
    if (code.length < LOCK_MIN) return;
    if (!lock.first) { lock.first = code; lock.code = ""; lockPaint(); return; }
    if (code !== lock.first) { lock.first = ""; lock.code = ""; lockPaint("Those didn't match. Choose a passcode again.", true); return; }
    lock.busy = true;
    lockPaint();
    await lockSet(code);
    lock.busy = false;
    lockHide(true);
    return;
  }
  const t = lockTries();
  if (t.until > Date.now()) return;
  lock.busy = true;
  lockPaint();
  const ok = await lockCheck(code);
  lock.busy = false;
  lock.code = "";
  if (ok) { store(LOCK_TRIES_KEY, null); lockHide(true); return; }
  const n = t.n + 1;
  const wait = n < LOCK_FREE_TRIES ? 0 : Math.min(LOCK_WAIT_MAX, LOCK_WAIT_MS * 2 ** (n - LOCK_FREE_TRIES));
  store(LOCK_TRIES_KEY, { n, until: wait ? Date.now() + wait : 0 });
  $("lockDots").classList.remove("shake");
  void $("lockDots").offsetWidth;
  if (!M.reduced()) $("lockDots").classList.add("shake");
  lockPaint("That's not it. Try again.", true);
}

function lockPress(k) {
  if (!lock.up || lock.busy || lock.erase) return;
  if (k === "bio") { lockBio(); return; }
  if (k === "del") { lock.code = lock.code.slice(0, -1); lockPaint(); return; }
  if (k === "enter") { lockEnter(); return; }
  if (!/^\d$/.test(k) || lock.code.length >= LOCK_MAX) return;
  if (lock.mode !== "set" && lockTries().until > Date.now()) return;
  lock.code += k;
  lockPaint();
  // A passcode that's being checked goes as soon as it's long enough.
  const len = (lockCfg() || {}).len;
  if (lock.mode !== "set" && len && lock.code.length === len) setTimeout(lockEnter, 80);
}

// ---- Forgot the passcode ----
// Everything this device keeps for Waypage goes: the clips and their
// pictures (the copies Waypage made; files read from where they are stay
// there), fonts, feeds, highlights, settings and the lock. Sync's token
// and Drive's sign-in go too, so connecting again on this device brings
// the clips back.
async function eraseAll() {
  lock.busy = true;
  $("lockEraseGo").disabled = true;
  $("lockEraseGo").textContent = "Erasing…";
  try { stopAloud(); } catch (e) { /* not reading */ }
  try {
    await C.store.ready;
    const list = await C.store.readIndex().catch(() => state.pages);
    for (const p of list || []) await C.store.removePage(p.id).catch(() => {});
    for (const f of await C.store.listFonts().catch(() => [])) await C.store.removeFont(f).catch(() => {});
    await C.store.writeIndex([]).catch(() => {});
  } catch (e) { /* what's left is cleared with the storage below */ }
  state.pages = [];
  feeds = [];
  try { C.platform.feedChecks.watch([], false, { style: "off", quiet: [] }); } catch (e) { /* no feeds */ }
  try { updateWidgets(); } catch (e) { /* no widgets */ }
  C.platform.lock.hideRecents(false);
  try {
    for (const k of Object.keys(localStorage)) if (/^(waypage|carryon|carry-on)[.:]/.test(k)) localStorage.removeItem(k);
  } catch (e) { /* no storage */ }
  try { if (!C.platform.native && window.indexedDB) indexedDB.deleteDatabase("carryon"); } catch (e) { /* not there */ }
  setTimeout(() => location.reload(), 300);
}

(function wireLock() {
  const keys = $("lockKeys");
  keys.replaceChildren(...lockKeys());
  keys.addEventListener("click", (e) => { const b = e.target.closest("[data-key]"); if (b) lockPress(b.dataset.key); });
  $("lockNext").addEventListener("click", () => lockEnter());
  $("lockCancel").addEventListener("click", () => lockHide(false));
  $("lockForgot").addEventListener("click", () => {
    lock.erase = true;
    $("lockPad").hidden = true;
    $("lockErase").hidden = false;
    lockPaint();
    $("lockEraseNo").focus({ preventScroll: true });
  });
  $("lockEraseNo").addEventListener("click", () => {
    lock.erase = false;
    $("lockErase").hidden = true;
    $("lockPad").hidden = false;
    lockPaint();
  });
  $("lockEraseGo").addEventListener("click", () => eraseAll());
  // Typing on a computer: numbers, Backspace and Enter; nothing else
  // reaches the app under it while it's up.
  addEventListener("keydown", (e) => {
    if (!lock.up) return;
    if (e.key === "Tab") return;
    if (lock.erase) { if (e.key === "Escape") $("lockEraseNo").click(); return; }
    if (/^\d$/.test(e.key)) lockPress(e.key);
    else if (e.key === "Backspace") lockPress("del");
    else if (e.key === "Enter" && e.target.closest && !e.target.closest(".lock-key, button")) lockPress("enter");
    else if (e.key === "Escape" && lock.mode !== "unlock") lockHide(false);
    else if (e.key === "Enter" || e.key === " ") return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // Locks when the app comes back after being away for the time picked.
  let awayAt = 0;
  document.addEventListener("visibilitychange", () => {
    const c = lockCfg();
    if (!c) return;
    if (document.hidden) { awayAt = Date.now(); return; }
    if (!lock.up && awayAt && Date.now() - awayAt >= (c.after || 0)) lockShow("unlock");
    awayAt = 0;
  });
  if (lockCfg()) {
    C.platform.lock.hideRecents(true);
    lockShow("unlock");
  } else document.documentElement.classList.remove("locked");
})();
const lockUp = () => lock.up;
// Android's Back on the keypad: cancels a change, or puts the app away.
function lockBack() {
  if (lock.erase) { $("lockEraseNo").click(); return; }
  if (lock.mode === "unlock") C.platform.exitApp();
  else lockHide(false);
}

// ---- Settings › App lock ----
async function turnLockOn() {
  if (!lockCan()) { toast("This browser can't keep a passcode safely here."); return; }
  if (await lockShow("set")) { toast("App lock is on."); renderSection(); renderSettings(); }
}
async function turnLockOff() {
  if (!(await lockShow("check"))) return;
  store(LOCK_KEY, null);
  store(LOCK_TRIES_KEY, null);
  C.platform.lock.hideRecents(false);
  toast("App lock is off.");
  renderSection();
  renderSettings();
}
async function changeLock() {
  if (!(await lockShow("check"))) return;
  if (await lockShow("set")) toast("Passcode changed.");
}
async function setLockBio(on, input) {
  if (on && !(await C.platform.lock.verify("Use your fingerprint or face for Waypage"))) { input.checked = false; return; }
  lockChange({ bio: on });
}

function lockSections() {
  const c = lockCfg();
  const help = "The lock is for this " + (C.platform.native ? "phone" : "browser") + " only, and the passcode never leaves it. "
    + "It keeps anyone who picks up your " + (C.platform.native ? "phone" : "computer") + " out of Waypage; it doesn't encrypt the files. "
    + "Forgot it? You can erase Waypage on this device and start again: GitHub sync or a Google Drive backup brings your clips back.";
  if (!c) return [section("Lock", help,
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: turnLockOn },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label accent" }, "Turn on app lock"),
          el("span", { class: "choice-note" }, "A passcode" + (C.platform.os === "android" ? ", fingerprint or face" : ""))))))];
  const bio = el("label", { class: "row", hidden: "" });
  C.platform.lock.biometric().then((ok) => {
    if (!ok) return;
    const input = el("input", { class: "switch", type: "checkbox", role: "switch", checked: !!c.bio, onchange: (e) => setLockBio(e.target.checked, e.target) });
    bio.append(el("span", { class: "choice-text" },
      el("span", { class: "choice-label" }, "Fingerprint or face"),
      el("span", { class: "choice-note" }, "The passcode still works")), input);
    bio.hidden = false;
  });
  return [section("Lock", help + " Locks says how long Waypage stays open after you leave it; a minute gives time to pick a file or sign in to a site without unlocking again.",
    el("div", { class: "group" },
      bio,
      pickRow({ key: LOCK_KEY + ".after", label: "Locks", get: () => (lockCfg() || {}).after || 0, set: (v) => lockChange({ after: Number(v) }), options: LOCK_AFTERS }),
      menuRow("Change the passcode", changeLock),
      menuRow("Turn off app lock", turnLockOff, "warn")))];
}
const lockValue = () => (lockCfg() ? "On" : "Off");
SECTIONS.lock = { title: "App lock", build: lockSections, value: lockValue };
