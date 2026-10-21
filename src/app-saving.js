// Waypage's shell, part 4 of 7 (1.14.0): sync, saving several, next
// links and new chapters, feeds and the home screen widgets. See app.js
// for how the parts share.
// ---- Sync (0.30.0) ----
// The library kept level with a private GitHub repo (src/sync.js): at
// launch, coming back to the app, a few seconds after any change, and
// every few minutes while open. Pages that came down get their pictures
// here, one page at a time, like Retry.
// Pages whose pictures are still to come are kept (1.13.0), so closing
// the app doesn't forget them.
const PICTURES_KEY = "waypage.syncPictures";
let syncTimer = null, syncQueue = load(PICTURES_KEY, null) || [], fetchingPictures = false;
const keepQueue = () => store(PICTURES_KEY, syncQueue.length ? [...new Set(syncQueue)] : null);
const SYNCED_KEEP = ["savedAt", "title", "requested", "tags", "folder", "folderAt", "source", "series", "fav", "favAt", "folderFav", "folderFavAt", "at", "finished", "readAt", "readOn", "placeAt", "spot", "marks"];
// While a run of saves is on, sync waits longer (1.2.0): each sync is a
// merge of the whole library, and one after every page landing was a
// stutter every few seconds.
function syncSoon(ms = runs.size ? 20000 : 4000) {
  if (!C.sync.on || C.sync.paused) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; if (C.sync.running) syncSoon(ms); else syncNow(); }, ms);
}
// A change on this device not yet sent (1.21.0), so going to another
// app sends it even when no sync was due, and one made while a sync ran
// goes in another right after it.
let unsynced = false;
async function syncNow(quiet = true) {
  if (!C.sync.on || C.sync.paused) return null;
  if (!navigator.onLine && quiet) return null;
  if (waitsForWifi(DATA_SYNC_KEY)) { if (!quiet) toast("Sync waits for Wi-Fi. Change that below."); return null; }
  clearTimeout(syncTimer);
  syncTimer = null;
  const joined = C.sync.running;
  const sending = unsynced;
  if (!joined) unsynced = false;
  let res = null;
  try {
    res = await C.sync.run({
      // A clip that reads from a file on this device can't be read from
      // another one, so it stays here (0.32.0). A copy syncs like any
      // other clip, with its pictures inside it.
      getPages: () => state.pages.filter((p) => !p.link),
      urlKey,
      // The same objects are kept and updated in place: the open page,
      // an open menu and the position timer hold on to them.
      setPages: async (list) => {
        const live = new Map(state.pages.map((p) => [p.id, p]));
        const open = state.open, was = open && placeTime(open);
        state.pages = list.map((n) => {
          const o = live.get(n.id);
          if (!o || o === n) return n;
          for (const k of Object.keys(o)) if (!(k in n)) delete o[k];
          return Object.assign(o, n);
        }).concat(state.pages.filter((p) => p.link)).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        // A place read further on another device is followed when it
        // comes in just after the clip opened, before it was scrolled here
        // at all (1.31.0): a clip opened from a widget before sync came in
        // stayed behind. Only a place moved later counts, never the same
        // place written another way, and never mid-reading (1.31.1): that
        // pulled the text back up under the finger.
        const follow = () => state.open === open && !movedHere && !C.reader.touched() && Date.now() - openedAt < FOLLOW_MS;
        if (open && placeTime(open) > was && follow()) C.reader.placed().then(() => { if (follow()) C.reader.jump(open.at || 0, open.spot || ""); });
        await C.store.writeIndexOnly(state.pages);
        texts.clear();
        await loadThumbs();
        renderLibrary();
        if (state.folder) renderFolder();
        updateWidgets();
      },
      getFeeds: () => feeds,
      setFeeds: syncedFeeds,
      getSeen: () => load(FEEDS_SEEN_KEY, 0),
      setSeen: (at) => { store(FEEDS_SEEN_KEY, at); if (sideShown()) renderSide(); },
      sameUrl,
      onProgress: () => { if (state.section === "sync") renderSection(); paintDownloads(); },
    });
  } catch (e) {
    if (!joined) unsynced = unsynced || sending;
    if (!quiet) toast(C.sync.last.error || "Sync stopped. Try again.");
  }
  if (joined && unsynced) return syncNow(quiet);
  if (state.section === "sync") renderSection();
  paintDownloads();
  if (res && res.downloads.length) { syncQueue.push(...res.downloads.map((p) => p.id)); keepQueue(); fetchPictures(); }
  if (res && res.fromLinks.length) saveFromLinks(res.fromLinks);
  if (res && !quiet && !C.sync.paused) toast(res.up + res.down + res.removed ? "Synced: " + [res.up ? res.up + " sent" : "", res.down ? res.down + " came in" : "", res.removed ? res.removed + " removed" : ""].filter(Boolean).join(", ") + "." : "Already in step.");
  return res;
}
// Pages that came as links only (0.30.3), saved here one after another
// like a run, each into its place in the library. In a browser only
// Wikipedia can be fetched, so the rest wait for the app.
async function saveFromLinks(list) {
  if (linksStopped) return;
  // One already saved here under the same address is left to sync, which
  // keeps one copy of each (sync.js, oneCopyEach).
  const jobs = list.filter((m) => m.url && (C.platform.native || C.save.wikipediaPage(m.url))
    && !state.pages.some((p) => p.id === m.id) && !state.saving.some((s) => s.synced && s.synced.id === m.id)
    && !savedAs(m.url) && !(m.requested && savedAs(m.requested)) && !savingAs(m.url))
    .map((m) => ({ ...newJob(m.url, null), key: "sync:" + m.id, synced: m, mode: m.mode, kind: m.comic ? "comic" : "article", waiting: true }));
  if (!jobs.length) return;
  const run = jobs.length > 1 ? Object.assign(startRun(null, jobs[0].site, jobs.length), { label: "From sync", sync: true, paused: C.sync.paused }) : null;
  jobs.forEach((j) => { j.run = run; });
  state.saving = [...jobs, ...state.saving];
  renderLibrary();
  if (state.section === "sync") renderSection();
  for (const [i, job] of jobs.entries()) {
    if (i) await new Promise((done) => setTimeout(done, PACE_MS));
    if (run && !(await gate(run))) continue;
    if (!state.saving.includes(job)) continue;
    job.waiting = false;
    if (run) run.current = job;
    renderLibrary();
    if (await runJob(job)) { if (run) run.saved++; } else if (run) run.failed++;
    if (run) { run.current = null; updateRunCard(run); }
    if (state.section === "sync") renderSection();
  }
  endRun(run);
  if (run) renderLibrary();
}
// Before 0.30.2 a new page's pictures never downloaded on Android (see
// platform.js, folderFor). Those pages fetch them once, when online.
const HEALED_KEY = "waypage.picturesHealed";
function healPictures() {
  if (!C.platform.native || !navigator.onLine || load(HEALED_KEY, false)) return;
  store(HEALED_KEY, true);
  syncQueue.push(...state.pages.filter((p) => p.missing && p.mode !== "links").map((p) => p.id));
  keepQueue();
  fetchPictures();
}
async function fetchPictures() {
  if (fetchingPictures || !syncQueue.length || !C.platform.native || waitsForWifi(DATA_SAVE_KEY)) return;
  fetchingPictures = true;
  try {
    while (syncQueue.length && navigator.onLine && !C.sync.paused) {
      paintDownloads();
      const p = state.pages.find((x) => x.id === syncQueue[0]);
      if (!p || !p.missing) { syncQueue.shift(); keepQueue(); continue; }
      let res = null;
      try { res = await C.save.retryMissing(p); } catch (e) { res = null; }
      // Off the list once it's done, so one cut off is tried again.
      syncQueue.shift();
      keepQueue();
      if (res && res.got) {
        Object.assign(p, { missing: res.missing, thumb: res.thumb, bytes: (p.bytes || 0) + res.bytes });
        await C.store.writeIndexOnly(state.pages);
        renderLibrary();
        if (state.folder) renderFolder();
      }
      if (state.section === "sync") renderSection();
    }
  } finally {
    fetchingPictures = false;
    if (state.section === "sync") renderSection();
    paintDownloads();
  }
}

// Sync's settings (0.30.1 laid out as steps, with LifeLog's setup code):
// off, the three steps to a first device and a way in for the next one;
// on, the state and a code that sets up another device.
function syncSections() {
  return C.sync.on ? [C.sync.oldToken ? syncNewToken() : null, syncState(), syncWhat(), dataGroup(DATA_SYNC_KEY, "Sync", "Syncs on any connection.", "Syncs when you're on Wi-Fi. Changes wait until then."), syncShare(), syncLeave()] : [syncSteps(), syncJoin()];
}
async function connectSync(text, btn) {
  if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }
  try {
    await C.sync.connect(text);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = "Connect"; }
    return e instanceof C.sync.SyncError ? e.message : "Couldn't connect. Try again.";
  }
  if (state.section === "sync") renderSection();
  syncNow(false);
  return null;
}
const outRow = (href, n, label, note) => el("a", { class: "row sync-step", href, target: "_blank", rel: "noopener" },
  el("span", { class: "step-num", "aria-hidden": "true" }, n),
  el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), el("span", { class: "choice-note" }, note)),
  el("span", { class: "row-value", "aria-hidden": "true" }, "↗"));
function syncSteps() {
  const input = el("input", { class: "feed-input", type: "password", autocomplete: "off", spellcheck: "false",
    placeholder: "github_pat_… or a setup link", "aria-label": "GitHub token or setup link" });
  const note = el("p", { class: "choice-note warn", role: "status" });
  const go = el("button", { class: "btn-primary", type: "button" }, "Connect");
  const connect = async () => { note.textContent = (await connectSync(input.value, go)) || ""; };
  go.addEventListener("click", connect);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } });
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Sync with GitHub"),
    el("p", { class: "section-lead" }, "Keeps your clips, tags, collections, favourites and where you are the same on every device, through a private repo on your GitHub. Each device gets the pictures itself."),
    el("div", { class: "group" },
      outRow("https://github.com/signup", "1", "Make a free GitHub account", "Skip this if you have one."),
      outRow(C.sync.NEW_REPO_URL, "2", "Make a private repo for your library", "GitHub fills it in. Keep it Private, then Create repository."),
      outRow(C.sync.KEY_URL, "3", "Make a token for that repo only", "GitHub fills it in. Under Repository access pick Only select repositories, then waypage-data. Generate token, and copy it."),
      el("div", { class: "row sync-step sync-paste" },
        el("span", { class: "step-num", "aria-hidden": "true" }, "4"),
        el("div", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Paste it here"),
          input, go, note))),
    el("p", { class: "footnote" }, "The token stays on this device and goes only to GitHub. Made for waypage-data only, it can't touch anything else on your account. Sync stops if that repo is ever made public."));
}
// A token made under the old steps reaches every repo on the account
// (1.30.1): swapped here for one made for waypage-data alone, without
// leaving sync. Another device using the old token asks again once the
// old one is deleted.
function syncNewToken() {
  const input = el("input", { class: "feed-input", type: "password", autocomplete: "off", spellcheck: "false",
    placeholder: "github_pat_…", "aria-label": "New GitHub token" });
  const note = el("p", { class: "choice-note warn", role: "status" });
  const go = el("button", { class: "btn-primary", type: "button" }, "Connect");
  const connect = async () => {
    if (C.sync.tokenIn(input.value)) { note.textContent = "Paste a new token, not a setup link."; return; }
    note.textContent = (await connectSync(input.value, go)) || "";
  };
  go.addEventListener("click", connect);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } });
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Make a safer token"),
    el("p", { class: "section-lead" }, "This device's token can change every repo on your GitHub. If it ever got out, all of them would be open. A token for waypage-data alone can't touch anything else."),
    el("div", { class: "group" },
      outRow(C.sync.KEY_URL, "1", "Make a token for waypage-data only", "Under Repository access pick Only select repositories, then waypage-data. Generate token, and copy it."),
      el("div", { class: "row sync-step sync-paste" },
        el("span", { class: "step-num", "aria-hidden": "true" }, "2"),
        el("div", { class: "choice-text" },
          el("span", { class: "choice-label" }, "Paste it here"),
          input, go, note)),
      outRow("https://github.com/settings/personal-access-tokens", "3", "Delete the old token", "On GitHub, in Fine-grained tokens. Your other devices ask for the new one, or scan this one's setup code.")));
}
function syncJoin() {
  const scan = C.platform.canScan ? el("button", { class: "row", type: "button", onclick: scanSync },
    el("span", { class: "row-label accent" }, "Scan its setup code")) : null;
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Already syncing on another device?"),
    scan ? el("div", { class: "group" }, scan) : null,
    el("p", { class: "footnote" }, (scan ? "" : "Open its setup link here, or paste it in step 4. ") + "The code and link are on that device, in Settings, Sync."));
}
async function scanSync() {
  let text = null;
  try { text = await C.platform.scanQr(() => toast("Getting the scanner ready…")); }
  catch (e) { toast("Couldn't scan. Paste the setup link in step 4 instead."); return; }
  if (!text) return;
  if (!C.sync.tokenIn(text)) { toast("That isn't a Waypage setup code. Show the one in Settings, Sync on a synced device."); return; }
  const err = await connectSync(text);
  if (err) toast(err);
}
// What a sync is doing, and what this device does after it (0.30.3):
// pages saved from their links, pictures fetched.
function syncProgress() {
  const p = C.sync.progress;
  if (!C.sync.running || !p) return { text: "Syncing…", part: null };
  if (p.stage === "up") return { text: "Sending clips, " + p.done + " of " + p.total, part: p.total ? p.done / p.total : null };
  if (p.stage === "down") return { text: "Bringing clips in, " + p.done + " of " + p.total, part: p.total ? p.done / p.total : null };
  return { text: "Checking GitHub…", part: null };
}
function syncNote() {
  if (!C.sync.on || C.sync.paused) return null;
  if (C.sync.running) {
    const p = C.sync.progress, now = syncProgress();
    return { title: "Syncing your library", text: now.text, done: p && p.total ? p.done : 0, total: p && p.total ? p.total : 0 };
  }
  const left = syncQueue.length + (fetchingPictures ? 1 : 0);
  if (left) return { title: "Syncing your library", text: "Getting pictures for " + countLine(left), done: 0, total: 0 };
  return null;
}
// The bar's sync button (1.13.0): there while GitHub sync or Google
// Drive is on, so their state is a look away. A ring while either runs
// (filling when it can count), a dot when the last sync failed, dimmed
// while paused or waiting for Wi-Fi. It opens the Sync screen (1.28.0).
let syncPainted = "", syncPageSaid = "", syncLabel = "";
function paintSync() {
  const btn = $("syncBtn");
  if (!btn) return;
  const on = C.sync.on;
  const backing = !!driveRun && !driveRun.restore;
  const running = on && (C.sync.running || !!syncNote());
  const now = syncProgress();
  const part = C.sync.running ? now.part : !running && backing ? driveRun.share : null;
  const held = on && !running && (C.sync.paused || waitsForWifi(DATA_SYNC_KEY));
  const failed = on && !running && !held && !!C.sync.last.error;
  const label = running ? (C.sync.running ? "Sync: " + now.text : "Sync: " + syncNote().text)
    : backing ? "Sync: backing up to Google Drive"
    : !on ? "Sync"
    : C.sync.paused ? "Sync: paused" : held ? "Sync: waiting for Wi-Fi"
    : failed ? "Sync: " + C.sync.last.error : C.sync.last.at ? "Sync: synced " + whenText(C.sync.last.at) : "Sync: not synced yet";
  const busy = running || backing;
  const said = [on, C.drive.on, busy, part, held, failed, label].join("|");
  if (said !== syncPainted) {
    syncPainted = said;
    btn.hidden = !on && !C.drive.on;
    btn.classList.toggle("busy", busy);
    btn.classList.toggle("looking", busy && part == null);
    btn.classList.toggle("held", held && !backing);
    btn.classList.toggle("failed", failed && !backing);
    btn.querySelector(".dl-ring-fill").style.strokeDashoffset = String(!busy ? 100 : part != null ? 100 - part * 100 : 75);
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }
  syncLabel = label;
  if (state.syncPage && syncPageSig() !== syncPageSaid) renderSyncPage();
}
function syncPageSig() {
  const l = C.drive.last, r = driveRun;
  return [syncLabel, C.sync.paused, C.sync.last.at, C.sync.last.error, syncAfter(), C.drive.on, l.at, l.error,
    r ? [r.restore, r.paused, r.stopped, !!r.merging].join() : ""].join("|");
}

function syncAfter() {
  const saving = state.saving.filter((s) => s.synced && !s.error).length;
  const failed = state.saving.filter((s) => s.synced && s.error).length;
  const pictures = syncQueue.length + (fetchingPictures ? 1 : 0);
  return [saving ? "Saving " + countLine(saving) + " from their links" : "",
    failed ? failed + " couldn't be saved, see Downloads" : "",
    pictures ? "Getting pictures for " + countLine(pictures) : ""].filter(Boolean).join(" · ");
}
function syncState() {
  const last = C.sync.last;
  const now = syncProgress();
  const paused = C.sync.paused;
  const status = C.sync.running ? now.text : paused ? "Paused" + (last.at ? ". Last synced " + whenText(last.at) : "")
    : waitsForWifi(DATA_SYNC_KEY) ? "Waiting for Wi-Fi" + (last.at ? ". Last synced " + whenText(last.at) : "")
    : last.error ? last.error : last.at ? "Synced " + whenText(last.at) : "Not synced yet";
  const after = C.sync.running ? "" : syncAfter();
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Sync with GitHub"),
    el("div", { class: "group" },
      el("div", { class: "row sync-status" }, el("span", { class: "choice-text" },
        el("span", { class: "row-label" }, C.sync.account),
        el("span", { class: "choice-note" + (last.error && !C.sync.running ? " warn" : ""), role: "status" }, status),
        after ? el("span", { class: "choice-note accent" }, after) : null,
        C.sync.running ? el("span", { class: "progress thin" + (now.part == null ? " busy" : ""), "aria-hidden": "true" },
          el("span", { class: "progress-fill", style: "transform: scaleX(" + (now.part == null ? 1 : now.part) + ")" })) : null)),
      paused ? null : el("button", { class: "row", type: "button", ...(C.sync.running ? { disabled: "" } : {}), onclick: () => syncNow(false) },
        el("span", { class: "row-label accent" }, "Sync now")),
      el("button", { class: "row", type: "button", onclick: () => pauseSync(!paused) },
        el("span", { class: "row-label accent" }, paused ? "Resume syncing" : "Pause syncing"))),
    el("p", { class: "footnote" }, paused
      ? "Nothing syncs until you resume. What synced before stays."
      : "Syncs when Waypage opens, after a change, and every few minutes while it's open. Pausing stops at the next clip and picks up where it left off."));
}
// Pause stops a sync at the next page and starts none until Resume;
// pages saving from their links and pictures wait too (0.30.4).
function pauseSync(on) {
  C.sync.paused = on;
  for (const r of runs) if (r.sync) pauseRun(r, on);
  if (state.section === "sync") renderSection();
  paintDownloads();
  if (!on) { syncNow(false); fetchPictures(); }
}
function disconnectSync() {
  if (!confirm("Disconnect from GitHub? Your clips stay on this " + (C.platform.native ? "phone" : "browser") + " and on GitHub. To sync again you'll need a setup code or a token.")) return;
  for (const r of runs) if (r.sync) stopRun(r);
  syncQueue = [];
  keepQueue();
  C.sync.disconnect();
  renderSection();
  paintDownloads();
  toast("Disconnected. Your clips stay here and on GitHub.");
}
function syncLeave() {
  return el("section", { class: "settings-section" },
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: disconnectSync }, el("span", { class: "row-label warn" }, "Disconnect from GitHub"))),
    el("p", { class: "footnote" }, "Forgets the token on this device. Your clips stay here and on GitHub."));
}
// Pages too, or links only: the library and its marks always sync.
function syncWhat() {
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "What this device syncs"),
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, "Clips"),
          seg("sync-what", "What this device syncs", [{ value: "pages", label: "Clips too" }, { value: "links", label: "Links only" }],
            C.sync.links ? "links" : "pages", (v) => { C.sync.links = v === "links"; renderSection(); syncSoon(500); })),
        el("div", { class: "rc-row stack" }, el("label", { class: "rc-label", for: "deviceName" }, "This device's name"),
          el("input", { class: "feed-input", id: "deviceName", type: "text", maxlength: "40", autocomplete: "off",
            value: load(DEVICE_KEY, ""), placeholder: guessedName().replace(/^./, (c) => c.toUpperCase()),
            onchange: (e) => store(DEVICE_KEY, e.target.value.trim().slice(0, 40)) })))),
    el("p", { class: "footnote" }, C.sync.links
      ? "Only links, tags, collections and where you are go up. Clips new to this device are saved again from their links, so one that changed or went away comes back different or not at all."
      : "Each clip's text goes up with it, so another device gets the clip as you saved it, even if the site changes or takes it down."),
    el("p", { class: "footnote" }, "The name shows on your other devices when this one read a clip further."));
}
// The setup link points at the web copy: inside the app this page is at
// https://localhost, which no other device can open. The app's scanner
// reads only the token from it.
function syncShare() {
  const link = C.sync.setupLink(C.platform.webUrl() || location.origin + location.pathname);
  const svg = C.qr && C.qr.fits(link) ? C.qr.svg(link, { size: 200 }) : null;
  const qr = svg ? el("div", { class: "sync-qr", role: "img", "aria-label": "Setup code" }) : null;
  if (qr) qr.innerHTML = svg;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast("Setup link copied. Only send it to yourself."); }
    catch (e) { toast("Couldn't copy the link."); }
  };
  return el("section", { class: "settings-section" },
    el("h2", { class: "overline" }, "Add another device"),
    el("div", { class: "group" },
      qr,
      el("button", { class: "row", type: "button", onclick: copy }, el("span", { class: "row-label accent" }, "Copy setup link"))),
    el("p", { class: "footnote" }, "In Waypage on the other device, go to Settings, Sync and scan this code, or paste the link there. A camera opens it in the web copy instead."),
    el("p", { class: "footnote warn" }, "The code and link hold your token. Only use them on your own devices."));
}

// Opening the web copy from a setup link (a phone's camera on the code)
// turns sync on there. The token leaves the address bar first.
async function takeSetupLink() {
  if (!C.sync.tokenIn(location.hash)) return;
  const hash = location.hash;
  history.replaceState(history.state, "", location.pathname + location.search);
  if (C.sync.on) return;
  const err = await connectSync(hash);
  toast(err || "Sync is on. Your library is on its way.");
}

// Send to Waypage (1.34.0): a bookmark in a computer's browser opens the
// web copy at #send and hands it the page it's on by postMessage. Only
// the window that opened this one is heard, the page must come from the
// address it says it's from, and nothing is saved until Save is pressed
// here, so another site opening Waypage can't slip a clip in.
const SEND_MAX = 20 * 1024 * 1024;
let sent = null;
function takeSend() {
  if (C.platform.native || location.hash !== "#send") return;
  history.replaceState(history.state, "", location.pathname + location.search);
  const from = window.opener;
  if (!from) { toast("Nothing came through: this site keeps other windows out. Save it on your phone instead."); return; }
  const hear = (e) => {
    const d = e.data;
    if (e.source !== from || !d || d.waypage !== "page" || typeof d.url !== "string" || typeof d.html !== "string") return;
    removeEventListener("message", hear);
    clearTimeout(late);
    let url = null;
    try { url = new URL(d.url); } catch (x) { /* not an address */ }
    if (!url || !/^https?:$/.test(url.protocol) || url.origin !== e.origin) { toast("That page couldn't be sent."); return; }
    if (d.html.length > SEND_MAX) { toast("That page is too big to send."); return; }
    sent = { url: url.href, html: d.html, title: String(d.title || "").replace(/\s+/g, " ").trim().slice(0, 300) };
    if (state.menu) back().then(() => openMenu("send")); else openMenu("send");
  };
  addEventListener("message", hear);
  const late = setTimeout(() => removeEventListener("message", hear), 30000);
  from.postMessage({ waypage: "ready" }, "*");
}
function sendSheet() {
  const s = sent;
  if (!s) return el("div");
  const answer = (yes) => {
    sent = null;
    back();
    if (yes) savePage(s.url, undefined, { given: { url: s.url, html: s.html } });
  };
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, s.title || C.save.siteName(s.url)),
      el("p", { class: "meta" }, C.save.siteName(s.url) + " · " + formatSize(s.html.length))),
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: () => answer(true) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, "Save this page"),
          el("span", { class: "choice-note" }, "As your browser shows it, signed in too. Its pictures stay links on this computer."))),
      el("button", { class: "row", type: "button", onclick: () => answer(false) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, "Don't save")))));
}
// The bookmark itself: it waits for this copy to say it's ready, and
// sends only to this copy's own address.
function bookmarklet() {
  const home = location.origin + location.pathname.replace(/[^/]*$/, "");
  const code = "(()=>{const H=" + JSON.stringify(home) + ",O=new URL(H).origin,w=window.open(H+'#send');"
    + "if(!w)return alert('Waypage: allow pop-ups for this site, then try again.');"
    + "const f=e=>{if(e.source!==w||e.origin!==O||!e.data||e.data.waypage!=='ready')return;removeEventListener('message',f);"
    + "w.postMessage({waypage:'page',url:location.href,title:document.title,html:'<!doctype html>'+document.documentElement.outerHTML},O)};"
    + "addEventListener('message',f);setTimeout(()=>removeEventListener('message',f),60000)})()";
  return "javascript:" + encodeURIComponent(code);
}

// How a page keeps its pictures, switched from its sheet (0.30.2), in
// place of 0.17.0's "Save full images".
const PICTURE_MODES = [{ value: "previews", label: "Previews" }, { value: "full", label: "Full size" }, { value: "links", label: "Links" }];
function picturesRow(p, redraw) {
  if (!C.platform.native || !p.images) return null;
  const note = el("p", { class: "footnote pictures-note", role: "status" }, savedNote(p));
  return el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, "Pictures"),
    seg("pictures-" + p.id, "Pictures", PICTURE_MODES, p.mode || "previews", (v) => changePictures(p, v, note, redraw)),
    note);
}

let changingPictures = false;
async function changePictures(p, mode, note, redraw) {
  if (changingPictures) return;
  if (mode !== "links" && !navigator.onLine && (mode === "full" || p.mode === "links")) {
    toast("You're offline. Try again when you're back online.");
    redraw();
    return;
  }
  changingPictures = true;
  const word = { previews: "previews", full: "full images", links: "links" }[mode];
  note.textContent = "Keeping " + word + "…";
  let res = null;
  try { res = await C.save.setPictures(p, mode, (done, total) => { note.textContent = "Keeping " + word + ", " + done + " of " + total; }); }
  catch (e) { res = null; }
  changingPictures = false;
  if (!res) { toast("Couldn't open this clip's file. Try again."); redraw(); return; }
  Object.assign(p, { mode, missing: res.missing, thumb: res.thumb, bytes: Math.max(0, (p.bytes || 0) + res.bytes) });
  if (p.imageBytes != null) p.imageBytes = Math.max(0, p.imageBytes + res.bytes);
  await C.store.writeIndex(state.pages);
  texts.clear();
  await loadThumbs();
  renderLibrary();
  if (state.folder) renderFolder();
  toast(res.failed ? res.failed + (res.failed === 1 ? " picture" : " pictures") + " couldn't be fetched. They show online." : mode === "links" ? "Pictures are links now. They show when you're online." : "Pictures saved as " + word + ".");
  redraw();
  if (state.open !== p) return;
  const html = await C.store.readPage(p.id).catch(() => null);
  if (html) show(p, html);
}

// Collection and tags are picked from dropdowns (0.30.2), with a field
// for a new one.
const NEW_PICK = "\u0000new";
function newField(cls, placeholder, label, then) {
  const input = el("input", { class: "tag-input new-pick " + cls, type: "text", placeholder, "aria-label": label,
    maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences", hidden: "" });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (cleanTag(input.value)) then(input.value);
  });
  return input;
}
function folderRow(p, redraw) {
  const input = newField("new-collection", "Name the new collection", "New collection", (v) => setFolder(p, v).then(redraw));
  const names = allFolders().sort((a, b) => a.localeCompare(b));
  const pick = dropdown({
    label: "Collection", cls: "field-pick",
    options: [{ value: "", label: "None" }, ...names.map((n) => ({ value: n, label: n })), { value: NEW_PICK, label: "New collection…" }],
    value: p.folder && names.find((n) => sameTag(n, p.folder)) || "",
    onpick: (v) => {
      if (v === NEW_PICK) { input.hidden = false; input.focus(); return; }
      setFolder(p, v || null).then(redraw);
    },
  });
  return el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, "Collection"),
    el("div", { class: "tag-edit" }, pick, input));
}

function neighbours(p) {
  const prev = neighbour(p, -1), next = neighbour(p, 1);
  if (!prev && !next) return null;
  const step = (q, label) => {
    const b = el("button", { class: "sheet-row step-row", type: "button", onclick: () => q && goTo(q) },
      el("span", { class: "step-over" }, label), el("span", { class: "step-title", dir: "auto" }, q ? q.title : "None"));
    b.disabled = !q;
    return b;
  };
  return el("div", { class: "step-rows" }, step(prev, "Previous"), step(next, "Next"));
}

// ---- Saving several ----
// Opens when a paste or share holds more than one link: the links (one
// a line, editable), the folder to save them into, and Save.

// `from` is the page read as a list of chapters, which can still be
// saved as one page.
function openBatch(text, fromHistory, folder, from) {
  if (state.batch) return;
  state.batch = true;
  renderBatch(linksFrom(text).join("\n"), folder || null, from);
  if (!fromHistory) history.pushState({ view: "batch", folder: state.folder || undefined }, "");
  // Set once it shows: a hidden screen keeps its old scroll.
  const shown = pushScreen($("batchView"));
  $("batchBody").scrollTop = 0;
  shown.then(() => $("batchBack").focus());
}

function closeBatch() {
  if (!state.batch) return;
  state.batch = false;
  popScreen($("batchView"));
}

const LONG_LIST = 50;

function renderBatch(text, preset, from) {
  let folder = preset;
  // The page the chapters were read from, kept on the folder (0.26.0).
  let source = from || null;
  let mode = load(IMAGES_KEY, "previews");
  // A comic's folder saves its next chapters as comics too.
  let kind = preset && folderPages(preset).some((p) => p.comic) ? "comic" : "article";
  if (kind === "comic") mode = "full";
  const tags = [];
  const area = el("textarea", { class: "batch-links", rows: "6", "aria-label": "Links, one a line", spellcheck: "false",
    autocapitalize: "off", autocomplete: "off", dir: "ltr" });
  area.value = text;
  const count = el("p", { class: "meta batch-count" });
  // Links already saved can be left where they are, or (switched off)
  // moved into this folder at their place in the list.
  const skip = el("input", { class: "switch batch-skip", type: "checkbox", role: "switch", checked: true, onchange: () => sync() });
  const skipNote = el("span", { class: "choice-note" });
  const skipRow = el("div", { class: "group" }, el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, "Skip links already saved"), skipNote), skip));
  const go = el("button", { class: "btn-primary batch-go", type: "submit" });
  const input = el("input", { class: "tag-input", type: "text", placeholder: "New collection", "aria-label": "New collection",
    maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
  // One link may be a contents page: its chapters replace it, and the
  // folder takes its name.
  const finder = el("button", { class: "btn-small batch-find", type: "button", onclick: async () => {
    const url = linksFrom(area.value)[0];
    if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    finder.disabled = true;
    finder.textContent = "Finding chapters…";
    try {
      const found = await C.save.findChapters(url);
      if (found.links.length) {
        source = url;
        area.value = found.links.join("\n");
        if (!folder) choose(folderName(found.title || C.save.siteName(url)));
        sync();
      } else toast("Couldn't find a list of chapters on that page.");
    } catch (e) { toast(e instanceof C.save.SaveError ? e.message : "Couldn't read that page. Try again."); }
    finder.disabled = false;
    finder.textContent = "Find chapters on this page";
  } }, "Find chapters on this page");
  const sync = () => {
    const links = linksFrom(area.value);
    const had = links.filter((u) => savedAs(u)).length;
    const n = skip.checked ? links.length - had : links.length;
    finder.hidden = links.length !== 1;
    skipRow.hidden = !had;
    skipNote.textContent = had === links.length ? "All " + had + " are already saved"
      : had + " already saved" + (skip.checked ? ", left where they are" : (folder ? ", moved into " + folder : ""));
    count.textContent = links.length ? links.length + (links.length === 1 ? " link" : " links") : "No links yet. Paste them here, one a line.";
    go.textContent = n ? "Save " + countLine(n) + (folder ? " into " + folder : "") : links.length ? "Nothing new to save" : "Save";
    go.disabled = !n;
  };
  const pick = (f, typed) => { folder = f; if (!typed) input.value = ""; sync(); };
  // The collection: None, one already there, or a new one typed in.
  const NEW = "\u0000new";
  const folderPick = dropdown({ label: "Collection", cls: "field-pick batch-folder", value: "",
    options: [{ value: "", label: "None" }, ...foldersByUse().map((f) => ({ value: f, label: f })), { value: NEW, label: "New collection…" }],
    onpick: (v) => {
      input.hidden = v !== NEW;
      if (v === NEW) { pick(cleanTag(input.value) ? folderName(input.value) : null, true); input.focus(); }
      else pick(v || null);
    } });
  input.hidden = true;
  const choose = (name) => {
    const had = name && allFolders().find((f) => sameTag(f, name));
    folderPick.set(had || (name ? NEW : ""));
    input.hidden = !name || !!had;
    if (had) pick(had);
    else { input.value = name || ""; pick(name || null, true); }
  };
  // Tags for every page this saves: the ones picked, each with its ×,
  // then a dropdown of the rest and "New tag…", which opens a field.
  const tagBox = el("div", { class: "tag-edit" });
  let typing = false;
  const drawTags = (focus) => {
    const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t)));
    const tagInput = el("input", { class: "tag-input", type: "text", placeholder: "New tag", "aria-label": "New tag",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
    const add = (raw) => {
      const t = cleanTag(raw);
      if (!t || tags.some((x) => sameTag(x, t))) return;
      tags.push(allTags().find((x) => sameTag(x, t)) || t);
      typing = false;
      drawTags("pick");
    };
    tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(tagInput.value); } });
    const showInput = typing || !allTags().length;
    tagInput.hidden = !showInput;
    const tagPick = dropdown({ label: "Add a tag", placeholder: "Add a tag", cls: "field-pick batch-tag", value: null,
      options: [...others.map((t) => ({ value: t, label: t })), { value: NEW, label: "New tag…" }],
      onpick: (v) => { if (v === NEW) { typing = true; drawTags("input"); } else add(v); } });
    fill(tagBox,
      tags.length ? el("div", { class: "chips" },
        ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
          onclick: () => { tags.splice(tags.indexOf(t), 1); drawTags(); } }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×")))) : null,
      allTags().length ? tagPick : null, tagInput);
    if (focus === "input") tagInput.focus({ preventScroll: true });
    else if (focus === "pick" && allTags().length) tagPick.querySelector(".dropdown-btn").focus({ preventScroll: true });
  };
  drawTags();
  area.addEventListener("input", sync);
  input.addEventListener("input", () => pick(cleanTag(input.value) ? folderName(input.value) : null, true));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
  const KIND_NOTES = { article: "The text and its pictures, read as a page.", comic: "Only the page's pictures, in order, edge to edge. For comics and manga." };
  const kindNote = el("p", { class: "meta" }, KIND_NOTES[kind]);
  const images = C.platform.native ? seg("batch-images", "Images", [
    { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
  ], mode, (v) => { mode = v; }) : null;
  const asPage = from ? el("section", { class: "settings-section batch-from" },
    el("p", { class: "meta" }, "Waypage read this page as a list of chapters."),
    el("button", { class: "btn-quiet batch-as-page", type: "button", onclick: () => { history.back(); savePage(from, null, { asPage: true }); } },
      "Save it as one clip instead")) : null;
  // A file of your own comes in from here too (0.31.0).
  const fromFile = preset || from ? null : el("section", { class: "settings-section batch-file" }, el("h2", { class: "overline" }, "File"),
    el("div", { class: "group" }, el("button", { class: "row", type: "button", onclick: () => pickFile(() => back()) },
      el("span", { class: "row-label accent" }, "Open a file"))),
    el("p", { class: "meta" }, "An EPUB book, a Markdown or text note, an HTML page, an email (.eml) or a CBZ comic. It stays " + ON_HERE + "."));
  const form = el("form", { class: "batch-form" }, asPage, fromFile,
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Links"), area, count, finder, skipRow),
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Save as"),
      seg("batch-kind", "Save as", [{ value: "article", label: "Article" }, { value: "comic", label: "Comic" }], kind, (v) => {
        kind = v;
        kindNote.textContent = KIND_NOTES[v];
        // Comics read best full size; still a choice below.
        const pick = images && images.querySelector('input[value="' + (v === "comic" ? "full" : load(IMAGES_KEY, "previews")) + '"]');
        if (pick) { pick.checked = true; mode = pick.value; }
      }),
      kindNote),
    images ? el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Images"), images,
      el("p", { class: "meta" }, "Full images for comics, maps and diagrams. Settings picks the usual choice.")) : null,
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Collection"),
      el("div", { class: "tag-edit" }, folderPick, input),
      el("p", { class: "meta" }, "Clips in a collection keep the order of the links.")),
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, "Tags"), tagBox),
    go);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const all = linksFrom(area.value);
    const skipSaved = skip.checked && !skipRow.hidden;
    const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
    if (!urls.length) return;
    if (urls.length > LONG_LIST && !confirm("Save " + urls.length + " clips? They save one at a time, so a list this long takes a while. Pause and Stop are on its card.")) return;
    history.back();
    saveAll(skipSaved ? all : urls, folder, tags, mode, skipSaved, kind, source);
  });
  $("batchBody").replaceChildren(form);
  if (folder) choose(folder);
  sync();
}

// ---- Following a site's next links ----
// A page saved with a next link (save.js) can bring its next pages in
// after it, into its folder: one link at a time, each saved page giving
// the next. A page not yet in a folder starts one, named after it.

// "The Wandering Inn - Chapter 1.01" → "The Wandering Inn".
function seriesName(p) {
  if (p.series) return cleanTag(p.series) || p.site;
  const t = p.title.replace(/[\s\-–—:|,·]*(chapter|ch\.?|part|episode|ep\.?|book|vol\.?|פרק|capítulo|chapitre|kapitel)\s*[\d.ivxl]+\b.*$/iu, "").trim();
  return cleanTag(t && t !== p.title ? t : p.title) || p.site;
}

// Saves up to `n` pages following `from`'s next links (previous ones
// with `back`, placed before it in the folder); resolves to the first
// one saved (or already there), or null. Quiet when asked. A folder's
// run stops early when its Stop is tapped and waits while paused.
async function follow(from, n, quiet, back) {
  const key = back ? "prev" : "next", word = back ? "previous" : "next";
  if (from[key] === undefined) {
    try { from[key] = await C.save.findNext(from.url, back); } catch (e) { toast("Couldn't reach " + from.site + " to find the " + word + " page."); return null; }
    await C.store.writeIndex(state.pages);
    if (!from[key]) { toast("There's no " + word + " page."); return null; }
  }
  if (!from.folder) { from.folder = folderName(seriesName(from)); from.folderAt = Date.now(); }
  const name = from.folder;
  let at = from.folderAt || from.savedAt || Date.now();
  const place = () => (back ? --at : undefined);
  const run = n > 1 ? startRun(name, from.site, n === Infinity ? null : n) : null;
  const seen = new Set([from.url]);
  let url = from[key], saved = 0, first = null, failed = false, stopped = false;
  while (url && saved < n && !seen.has(url)) {
    if (run && run.stopped) { stopped = true; break; }
    seen.add(url);
    const had = savedAs(url);
    if (had) {
      if (!had.folder) { had.folder = name; had.folderAt = place() || Date.now(); }
      else if (back && sameTag(had.folder, name)) at = Math.min(at, had.folderAt || at);
      first = first || had;
      url = had[key];
      continue;
    }
    if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) break;
    state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
    if (saved) await new Promise((done) => setTimeout(done, PACE_MS));
    if (run && !(await gate(run))) { stopped = true; break; }
    const job = { ...newJob(url, name), folderAt: place(), run, ...(from.comic ? { kind: "comic", mode: from.mode } : {}) };
    state.saving.unshift(job);
    if (run) run.current = job;
    renderLibrary();
    if (state.folder) renderFolder();
    const meta = await runJob(job);
    if (run) run.current = null;
    if (!meta) { failed = true; if (run) run.failed++; break; }
    saved++;
    if (run) { run.saved++; updateRunCard(run); }
    first = first || meta;
    url = meta[key];
    if (state.folder) renderFolder();
  }
  endRun(run);
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
  if (!quiet || failed) {
    const end = back ? ". That's the first one." : ". That's the last one.";
    toast(saved ? "Saved " + countLine(saved) + " into " + name + (failed ? ". The " + word + " one couldn't be saved." : stopped ? ". Stopped." : !url ? end : ".")
      : failed ? "Couldn't save the " + word + " page." : first ? "The " + word + " page is already saved." : "There's no " + word + " page.");
  }
  return first;
}

// A folder's first page saved before 0.20.0 never looked for a previous
// link: read it from the original once, quietly, when the folder opens.
const lookingBack = new Set();
function lookBack(p) {
  if (!p || p.prev !== undefined || p.licence === "wikipedia" || !navigator.onLine || lookingBack.has(p.id)) return;
  lookingBack.add(p.id);
  C.save.findNext(p.url, true).then((u) => {
    p.prev = u || "";
    return C.store.writeIndex(state.pages);
  }).then(() => { if (state.folder && p.prev && !savedAs(p.prev)) renderFolder(); }, () => {});
}

// "Save the next 1 · 5 · 10 · All" for the last page of a run with a
// next link, or the previous ones (`back`) for the first. While a run
// saves, Stop.
// Image chapters run to tens of megabytes, so a long run is confirmed
// with a size taken from the chapters saved last.
const BIG_CHAPTER = 5e6;
function sizeOk(p, n) {
  if (n < 5) return true;
  const last = (p.folder ? folderPages(p.folder) : [p]).filter((q) => q.bytes)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 3);
  const each = last.length ? sizeOf(last) / last.length : 0;
  if (each < BIG_CHAPTER) return true;
  return confirm(n === Infinity
    ? "The last chapters were about " + formatSize(each) + " each. Save all of them?"
    : "The last chapters were about " + formatSize(each) + " each, so " + n + " more is about " + formatSize(each * n) + ". Save them?");
}

function followControls(p, back) {
  const key = back ? "prev" : "next";
  // Pages saved before 0.10.0 never looked for a next link (`next` is
  // missing, not ""); follow() reads it from the original on first use.
  // A missing previous link is read when the folder opens (lookBack).
  const unknown = !back && p && p.next === undefined && p.licence !== "wikipedia";
  if (!p || (!unknown && (!p[key] || savedAs(p[key])))) return null;
  const busy = () => !!runFor(p.folder) || state.saving.some((s) => !s.error && s.folder && p.folder && sameTag(s.folder, p.folder));
  const what = back ? "previous" : "next";
  const going = runFor(p.folder);
  const stop = el("button", { class: "chip stop", type: "button", "aria-label": "Stop saving",
    onclick: () => { stopRun(runFor(p.folder)); stop.disabled = true; } }, "Stop");
  const pause = el("button", { class: "chip pause", type: "button", "aria-label": going && going.paused ? "Resume saving" : "Pause saving",
    onclick: () => { const r = runFor(p.folder); if (r) pauseRun(r, !r.paused); } }, going && going.paused ? "Resume" : "Pause");
  stop.hidden = !busy();
  pause.hidden = !going;
  const run = (n) => (e) => {
    if (busy()) return;
    if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    if (!sizeOk(p, n)) return;
    e.currentTarget.closest(".follow").querySelectorAll("button:not(.stop):not(.pause)").forEach((b) => { b.disabled = true; });
    stop.hidden = false;
    pause.hidden = n === 1;
    follow(p, n, false, back).then(() => { if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build()); });
  };
  const chip = (n) => {
    const b = el("button", { class: "chip", type: "button",
      "aria-label": n === Infinity ? "Save all the " + what + " clips from " + p.site : "Save the " + what + " " + countLine(n) + " from " + p.site,
      onclick: run(n) }, n === Infinity ? "All" : String(n));
    b.disabled = busy();
    return b;
  };
  return el("div", { class: "rc-row follow" + (back ? " back" : "") }, el("span", { class: "rc-label" }, back ? "Save previous" : "Save next"),
    el("div", { class: "chips" }, ...[1, 5, 10, Infinity].map(chip), pause, stop));
}

// ---- New chapters (0.25.0) ----
// A series folder (one whose pages link to each other as next and
// previous) is checked for chapters after its last one by reading that
// page's next link again: the one kept when it was saved is often ""
// because it was the newest chapter then. Found chapters are counted by
// walking on, up to NEW_MAX, and the last page's `next` is updated, so
// the folder's Save next row appears. Results are kept per folder:
// { [lower-case name]: { at, count } }.
const NEW_MAX = 10;
const DAY = 864e5;
// Parsed once per value (1.2.0): it was read from localStorage and parsed
// for every collection on every redraw.
let newCache = { raw: undefined, all: {} };
const newChapters = () => {
  let raw = null;
  try { raw = localStorage.getItem(NEW_KEY); } catch (e) { raw = null; }
  if (raw !== newCache.raw) { let all; try { all = JSON.parse(raw); } catch (e) { all = null; } newCache = { raw, all: all && typeof all === "object" ? all : {} }; }
  return newCache.all;
};
const newFor = (name) => newChapters()[String(name).toLowerCase()] || null;
function setNewFor(name, entry) {
  const all = newChapters();
  if (entry) all[String(name).toLowerCase()] = entry; else delete all[String(name).toLowerCase()];
  store(NEW_KEY, all);
}

// The story's page a folder is linked to (0.26.0): kept on each of its
// pages as `source`, so it travels with them in backups. "" when none.
const folderSource = (list) => (list.find((p) => p.source) || {}).source || "";
function bookIcon(size) {
  const s = el("span", { class: "book-icon", "aria-hidden": "true" });
  s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS.book + "</svg>";
  return s;
}

function isSeries(list) {
  if (folderSource(list)) return true;
  if (list.length < 2) return false;
  const last = list[list.length - 1];
  if (!/^https?:/.test(last.url || "") || last.licence === "wikipedia") return false;
  return list.some((p) => list.some((q) => q !== p && ((p.next && sameUrl(p.next, q.url)) || (p.prev && sameUrl(p.prev, q.url)))));
}

const checking = new Set();
// Resolves to the number of new chapters found (NEW_MAX meaning at
// least that many), or null when the site couldn't be reached.
async function checkNew(name, quiet) {
  const key = String(name).toLowerCase();
  if (checking.has(key)) return null;
  const list = folderPages(name);
  const last = list[list.length - 1];
  if (!last) return null;
  checking.add(key);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  let count = 0;
  const source = folderSource(list);
  try {
    if (source) {
      // A linked folder reads the story's own chapter list: whatever in
      // it isn't saved is new, wherever it sits.
      const found = await C.save.findChapters(source);
      const all = found.links.slice(0, 5000);
      count = all.filter((u) => !savedAs(u) && !savingAs(u)).length;
      setNewFor(name, { at: Date.now(), count, all });
      await updateCover(name, found.cover || "");
    } else {
      let url = await C.save.findNext(last.url);
      if (url && !savedAs(url)) {
        last.next = url;
        await C.store.writeIndex(state.pages);
        const seen = new Set([last.url]);
        while (url && !seen.has(url) && !savedAs(url) && count < NEW_MAX) {
          seen.add(url);
          count++;
          if (count === NEW_MAX) break;
          try { url = await C.save.findNext(url); } catch (e) { break; }
        }
      }
      setNewFor(name, { at: Date.now(), count });
    }
  } catch (e) {
    if (!quiet) toast("Couldn't reach " + last.site + " to look for new chapters.");
    count = null;
  } finally {
    checking.delete(key);
  }
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
  if (!quiet && count === 0) toast("No new chapters yet.");
  return count;
}

const newCountText = (n) => (n >= NEW_MAX ? NEW_MAX + "+" : String(n)) + " new";

// The new chapters still unsaved: those saved since the check no
// longer count, and none are left once the last page's next is saved.
function freshCount(name) {
  const entry = newFor(name);
  if (!entry || !entry.count) return 0;
  if (entry.all) return entry.all.filter((u) => !savedAs(u) && !savingAs(u)).length;
  const list = folderPages(name);
  const last = list[list.length - 1];
  if (!last || !last.next || savedAs(last.next)) return 0;
  const since = list.filter((p) => (p.savedAt || 0) > entry.at).length;
  return Math.max(1, entry.count - since);
}

function checkRow(list) {
  if (!isSeries(list)) return null;
  const name = state.folder;
  const entry = newFor(name);
  const fresh = freshCount(name);
  const busy = checking.has(String(name).toLowerCase());
  const note = busy ? "Looking…" : !entry ? "Not checked yet"
    : fresh ? newCountText(fresh) + " · checked " + whenText(entry.at)
    : "None yet · checked " + whenText(entry.at);
  const btn = el("button", { class: "chip", type: "button", onclick: () => {
    if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    checkNew(name, false);
  } }, "Check");
  btn.disabled = busy;
  // From a story page, the new ones are saved straight from its list,
  // each at its place among those already saved.
  const take = entry && entry.all && fresh && !savingInto(name) ? el("button", { class: "chip on save-new", type: "button", onclick: () => {
    if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    saveAll(entry.all, name, [], undefined, true, undefined, folderSource(list));
  } }, "Save " + fresh) : null;
  return el("div", { class: "rc-row check-new" },
    el("span", { class: "rc-label" }, "New chapters"),
    el("div", { class: "chips" },
      el("span", { class: "check-note" + (fresh ? " accent" : ""), role: "status" }, note), take, btn));
}

// ---- The folder's Chapters panel (0.26.0) ----
// Everything about a series in one place: new chapters, saving earlier
// or later ones, the story page it's linked to, and saving the saved
// ones again.
function chaptersPanel(list) {
  const rows = [checkRow(list), followControls(list[0], true), followControls(list[list.length - 1])].filter(Boolean);
  return el("div", { class: "folder-actions chapters-panel" },
    rows.length ? el("div", { class: "chapter-tools" }, ...rows)
      : el("p", { class: "meta" }, "These clips don't link to each other, so there's nothing to look for. Link the collection to its story page below."),
    sourceSection(list));
}

function sourceSection(list) {
  const name = state.folder;
  const src = folderSource(list);
  const input = el("input", { class: "tag-input source-input", type: "url", inputmode: "url", value: src,
    placeholder: "The story's page, with its chapter list", "aria-label": "Story page", autocapitalize: "off", spellcheck: "false" });
  const link = el("button", { class: "btn-quiet source-link", type: "button", onclick: async () => {
    const u = linkFrom(input.value);
    if (!u) { toast("Paste the link to the story's page."); return; }
    if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
    link.disabled = true;
    link.textContent = "Reading…";
    try {
      const found = await C.save.findChapters(u);
      if (!found.links.length) { toast("Couldn't find a list of chapters on that page."); return; }
      setSource(name, u, found.cover || "");
      toast("Linked to " + countLine(found.links.length).replace("clip", "chapter") + " on " + C.save.siteName(u));
    } catch (e) {
      toast(e instanceof C.save.SaveError ? e.message : "Couldn't read that page. Try again.");
    } finally {
      if (link.isConnected) { link.disabled = false; link.textContent = src ? "Change" : "Link"; }
    }
  } }, src ? "Change" : "Link");
  const unlink = src ? el("button", { class: "btn-quiet source-unlink", type: "button", onclick: () => { setSource(name, ""); toast("Unlinked " + name); } }, "Unlink") : null;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); link.click(); } });
  return el("section", { class: "settings-section source-section" },
    el("h2", { class: "overline" }, "Story page"),
    el("div", { class: "source-row" }, input, link, unlink),
    el("p", { class: "footnote" }, "New chapters are read from its chapter list, which also finds chapters added in between."));
}

async function setSource(name, url, cover) {
  for (const p of folderPages(name)) { if (url) p.source = url; else delete p.source; }
  setNewFor(name, null);
  await C.store.writeIndex(state.pages);
  renderFolder();
  renderLibrary();
  if (url) updateCover(name, cover);
}

// Keeps a linked collection's cover (its story page's picture) in step:
// `url` when the page was just read, else the page is read for it.
// Once per session for a collection that has none.
const coverTried = new Set();
async function updateCover(name, url) {
  const list = folderPages(name);
  const src = folderSource(list);
  if (!list.length || !src) return;
  if (url === undefined) {
    const key = String(name).toLowerCase();
    if (coverTried.has(key) || !navigator.onLine || list.some((p) => p.cover)) return;
    coverTried.add(key);
    try { url = (await C.save.findChapters(src)).cover || ""; } catch (e) { return; }
  }
  if (!url || list.some((p) => p.coverFrom === url && p.cover)) return;
  const cover = await C.save.keepCover(url, src);
  for (const p of folderPages(name)) { p.cover = cover; p.coverFrom = url; }
  await C.store.writeIndex(state.pages);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
}

// Saves the folder's pages again where they are, to switch their
// pictures or pick up an author's edits; each keeps its place, tags
// and read position. Started from What's saved.
// Each page is a job that knows the page it replaces, in a run of its
// own, so it shows in Downloads with Pause and Stop like any other.
async function refreshFolder(name, mode, btn) {
  const list = folderPages(name).filter((p) => /^https?:/.test(p.url || ""));
  if (!list.length || !navigator.onLine) { if (!navigator.onLine) toast("You're offline. Try again when you're back online."); return; }
  btn.disabled = true;
  const run = startRun(folderName(name), list[0].site, list.length, true);
  const jobs = list.map((old) => ({ ...newJob(old.url, name), key: "again:" + old.id, again: old, mode, kind: old.comic ? "comic" : "article", waiting: true, run }));
  state.saving = [...jobs, ...state.saving];
  renderLibrary();
  toast("Saving " + countLine(list.length) + " again. They're in Downloads.");
  let done = 0, failed = 0, stopped = 0;
  for (const job of jobs) {
    if (done + failed) await new Promise((ok) => setTimeout(ok, PACE_MS));
    if (!(await gate(run)) || !state.saving.includes(job)) { stopped++; continue; }
    job.waiting = false;
    run.current = job;
    renderLibrary();
    if (await runJob(job)) { done++; run.saved++; } else { failed++; run.failed++; }
    run.current = null;
    updateRunCard(run);
  }
  endRun(run);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
  toast("Saved " + countLine(done) + " again" + (failed ? " · " + failed + " couldn't be saved" : "") + (stopped ? " · stopped before " + countLine(stopped) : "") + ".");
}

function whenText(at) {
  const mins = Math.round((Date.now() - at) / 6e4);
  if (mins < 2) return "just now";
  if (mins < 60) return mins + " min ago";
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + " h ago";
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : days + " days ago";
}

// Once a day per series folder, after the library is up and online,
// one folder at a time, quietly.
let dailyRunning = false;
async function dailyCheck(force) {
  if (dailyRunning || !navigator.onLine || (!force && !load(DAILY_KEY, true))) return 0;
  if (waitsForWifi(DATA_SAVE_KEY)) { if (force) toast("Collections check for new chapters when you're on Wi-Fi."); return 0; }
  dailyRunning = true;
  let found = 0;
  try {
    for (const name of allFolders()) {
      if (!isSeries(folderPages(name))) continue;
      const entry = newFor(name);
      if (!force && entry && Date.now() - entry.at < DAY) continue;
      const n = await checkNew(name, true);
      if (n) found++;
    }
  } finally {
    dailyRunning = false;
  }
  return found;
}

// Renamed in place on the book page; the new-chapters entry follows.
async function renameFolder(raw) {
  const old = state.folder;
  const name = cleanTag(raw || "");
  if (!name) { toast("Type a name for the collection."); return false; }
  if (name === old) return true;
  const clash = allFolders().find((n) => sameTag(n, name) && !sameTag(n, old));
  if (clash) { toast("There's already a collection called " + clash + "."); return false; }
  for (const p of folderPages(old)) p.folder = name;
  C.platform.widgets.renamed(old, name);
  const entry = newFor(old);
  if (entry && !sameTag(old, name)) { setNewFor(name, entry); setNewFor(old, null); }
  await C.store.writeIndex(state.pages);
  state.folder = name;
  history.replaceState({ view: "folder", folder: name }, "");
  renderLibrary();
  updateWidgets();
  return true;
}

// ---- Feeds (0.28.0) ----
// Following a site: its feed is read every few hours while the app is
// open and online, and its posts wait in one river, newest day first,
// until they're saved, or save themselves where the feed is set to. A
// post stays in the river (as Saved, once saved) until it's older than
// its feed's window. Feeds are kept in localStorage as [{ url, title,
// link, icon, mode: "show" | "save", images, folder, days, addedAt,
// checkedAt, error, items: [{ id, url, title, date, foundAt, tried }] }].
const FEEDS_KEY = "waypage.feeds";
const PLACE_KEY = "waypage.place";
const FEEDS_SEEN_KEY = "waypage.feedsSeen";
const FEEDS_ASKED_KEY = "waypage.feedsAsked";
const FEED_EVERY = 3 * 36e5;
const FEED_KEEP = 100;
const FEED_DAYS = [{ value: "3", label: "3 days" }, { value: "7", label: "A week" }, { value: "30", label: "A month" }];
const FEED_ICONS = {
  library: ICONS.book,
  feeds: '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.5"/>',
  add: ICONS.add,
  out: ICONS.original,
};
const feedIcon = (name, size = 20) => {
  const s = el("span", { class: "side-icon", "aria-hidden": "true" });
  s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + FEED_ICONS[name] + "</svg>";
  return s;
};

let feeds = load(FEEDS_KEY, []);
if (!Array.isArray(feeds)) feeds = [];
state.place = ["feeds", "highlights", "reading"].includes(load(PLACE_KEY, "library")) ? load(PLACE_KEY, "library") : "library";
// The feed picked in the river (its url), or null for all of them.
state.feed = null;
state.side = false;
let feedsChecking = false;

// What's followed and how goes to sync (0.30.1); new posts don't.
const feedSig = () => JSON.stringify(feeds.map((f) => [f.url, f.title, f.mode, f.images, f.folder, f.days]));
let lastFeedSig = feedSig();
const saveFeeds = () => {
  store(FEEDS_KEY, feeds); watchFeeds(); updateWidgets();
  const sig = feedSig();
  if (sig !== lastFeedSig) { lastFeedSig = sig; syncSoon(); }
};
// Feeds as sync settled them: one followed elsewhere is checked here.
function syncedFeeds(list) {
  const had = new Map(feeds.map((f) => [f.url, f]));
  const fresh = [];
  const next = list.map((m) => {
    const f = had.get(m.url);
    if (!f) { const n = { ...m, folder: m.folder || "", link: m.link || null, icon: m.icon || null, checkedAt: 0, error: "", items: [] }; fresh.push(n); return n; }
    Object.assign(f, m);
    if (!m.folder) f.folder = "";
    return f;
  });
  const before = feedSig();
  feeds = next;
  if (feedSig() === before && !fresh.length) return;
  lastFeedSig = feedSig();
  if (state.feed && !feeds.some((f) => f.url === state.feed)) state.feed = null;
  store(FEEDS_KEY, feeds); watchFeeds(); updateWidgets();
  paintFeeds();
  if (fresh.length) setTimeout(() => checkFeeds(false), 0);
}
// Notifications (1.30.0), this phone's own: off, or new posts each on
// their own (title and summary, grouped by feed, with Save) or all in one,
// and feeds kept quiet.
const NOTES_KEY = "waypage.notes";
function notesPrefs() {
  const n = load(NOTES_KEY, {}) || {};
  return { on: n.on !== false, posts: n.posts === "together" ? "together" : "each", quiet: Array.isArray(n.quiet) ? n.quiet : [] };
}
function setNotes(change) {
  store(NOTES_KEY, { ...notesPrefs(), ...change });
  watchFeeds();
}
const feedQuiet = (f) => notesPrefs().quiet.includes(f.url);
function setFeedQuiet(f, quiet) {
  const q = notesPrefs().quiet.filter((u) => u !== f.url && feeds.some((x) => x.url === u));
  if (quiet) q.push(f.url);
  setNotes({ quiet: q });
}
// What the closed app's checks compare with: every post each feed has.
let watchTimer = null, askToNotify = false;
function watchFeeds() {
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    const list = feeds.map((f) => ({ url: f.url, title: f.title, known: [...new Set(f.items.flatMap((it) => [it.id, it.url]).filter(Boolean))] }));
    const n = notesPrefs();
    C.platform.feedChecks.watch(list, n.on && askToNotify && list.length > 0, { style: n.on ? n.posts : "off", quiet: n.quiet });
    askToNotify = false;
  }, 1000);
}
const postAt = (it) => it.date || it.foundAt || 0;
const postKey = (it) => it.id || it.url;
const inWindow = (f, it) => postAt(it) >= Date.now() - (f.days || 7) * DAY;
const feedPosts = (f) => f.items.filter((it) => inWindow(f, it));
const savingUrl = (url) => state.saving.some((s) => !s.error && sameUrl(s.url, url));
const waitingIn = (f) => feedPosts(f).filter((it) => !savedAs(it.url)).length;
// New since Feeds was last looked at, for the sidebar's pill.
const freshPosts = () => {
  const seen = load(FEEDS_SEEN_KEY, 0);
  return feeds.reduce((n, f) => n + feedPosts(f).filter((it) => it.foundAt > seen && !savedAs(it.url)).length, 0);
};

// The feed's site icon, or its first letter, like a card with no picture.
function feedMark(f, small) {
  const url = f.link || f.url;
  const box = siteMark({ site: C.feeds.siteOf(url) || f.title, icon: f.icon, url });
  box.className = "site-mark feed-mark" + (small ? " small" : "");
  return box;
}

// "About 2 posts a day · last one 2 h ago", from the posts' dates.
function rateLine(items) {
  const ds = items.map((it) => it.date).filter(Boolean).sort((a, b) => b - a);
  if (!ds.length) return items.length ? countLine(items.length).replace("clip", "post") : "No posts yet";
  const last = whenText(ds[0]);
  if (ds.length < 2) return "Last post " + last;
  const perDay = (ds.length - 1) / Math.max((ds[0] - ds[ds.length - 1]) / DAY, 1 / 24);
  const perWeek = perDay * 7;
  const rate = perDay >= 1.5 ? "About " + Math.round(perDay) + " posts a day"
    : perDay >= 0.75 ? "About a post a day"
    : perWeek >= 1.5 ? "About " + Math.round(perWeek) + " posts a week"
    : perWeek >= 0.75 ? "About a post a week" : "A post now and then";
  return rate + " · last one " + last;
}

// Today, Yesterday, a weekday this week, then the date.
function dayName(t) {
  const start = new Date().setHours(0, 0, 0, 0);
  if (t >= start) return "Today";
  if (t >= start - DAY) return "Yesterday";
  const d = new Date(t);
  if (t >= start - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "long" });
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long" });
}

// A feed's posts after a check: what it lists now, with when each was
// first seen kept, plus earlier posts it dropped while they're still
// inside the window.
function mergeFeed(f, got) {
  const now = Date.now();
  const had = new Map(f.items.map((it) => [postKey(it), it]));
  const items = got.items.map((it) => {
    const old = had.get(postKey(it));
    const out = { id: it.id, url: it.url, title: it.title, date: it.date, foundAt: old ? old.foundAt : now };
    if (old && old.tried) out.tried = true;
    return out;
  });
  const now_ = new Set(items.map(postKey));
  for (const old of f.items) if (!now_.has(postKey(old)) && inWindow(f, old)) items.push(old);
  f.items = items.sort((a, b) => postAt(b) - postAt(a)).slice(0, FEED_KEEP);
  if (got.icon) f.icon = got.icon;
  if (got.link) f.link = got.link;
}

// Feeds from another reader's OPML (1.32.0): each one not followed yet
// is followed, its posts shown in Feeds rather than saved, into a
// collection named after its group there or itself.
function followFeeds(list) {
  let added = 0;
  for (const o of list) {
    if (feeds.some((h) => sameUrl(h.url, o.url))) continue;
    const title = cleanTag(o.title) || C.feeds.siteOf(o.url);
    feeds.push({ url: o.url, title, link: "", icon: "", mode: "show", images: load(IMAGES_KEY, "previews"),
      folder: cleanTag(o.folder) || title, days: 7, addedAt: Date.now(), checkedAt: 0, error: "", items: [] });
    added++;
  }
  if (!added) { toast(list.length ? "You follow all of those feeds already." : "No feeds in that file."); return; }
  saveFeeds();
  paintFeeds();
  toast("Following " + added + (added === 1 ? " feed" : " feeds") + ". Their posts are in Feeds.");
  setTimeout(() => checkFeeds(true), 0);
}

// Feeds from a backup: one not followed here is followed again, with its
// posts; one followed already keeps its settings here. Returns how
// many were added.
function restoreFeeds(list) {
  let added = 0;
  for (const f of list || []) {
    if (feeds.some((h) => sameUrl(h.url, f.url))) continue;
    feeds.push(f);
    added++;
  }
  if (added) {
    saveFeeds();
    paintFeeds();
    setTimeout(() => checkFeeds(), 0);
  }
  return added;
}

// ---- Home screen widgets (0.29.0, Android) ----
// Keep reading shows the page read last that isn't finished (or the
// last one at all); Feeds the three newest posts not saved yet;
// Favourites (0.29.2) the favourite collections, then the clips
// favourited last (0.35.0), four in all; each collection widget (0.35.0)
// its collection's next clips to read. Handed over whenever the app
// goes to the background, and after changes.
let widgetTimer = null;
function keepReading() {
  const read = state.pages.filter((p) => p.readAt).sort((a, b) => b.readAt - a.readAt);
  return read.find((x) => !x.finished) || read[0];
}
function updateWidgets() {
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const p = keepReading();
    const posts = feeds.flatMap((f) => feedPosts(f).filter((it) => !savedAs(it.url)).map((it) => ({ f, it })))
      .sort((a, b) => postAt(b.it) - postAt(a.it)).slice(0, 3)
      .map(({ f, it }) => ({ title: it.title, site: f.title, url: it.url, feed: f.url }));
    C.platform.widgets.update({
      reading: p ? { id: p.id, title: p.title, at: p.at || 0,
        meta: [p.site, (p.at || 0) >= 0.995 ? "Finished" : Math.max(1, Math.ceil((p.minutes || 1) * (1 - (p.at || 0)))) + " min left"].filter(Boolean).join(" · ") } : null,
      feeds: { following: feeds.length > 0, fresh: freshPosts(), posts },
      favourites: [
        ...allFolders().filter(folderFav).map((name) => ({ name, at: Math.max(...folderPages(name).map((x) => x.folderFavAt || 0)) }))
          .sort((a, b) => b.at - a.at).map(({ name }) => ({ kind: "collection", name, title: name, meta: "Collection · " + readCount(folderPages(name)) })),
        ...state.pages.filter((x) => x.fav).sort((a, b) => (b.favAt || 0) - (a.favAt || 0))
          .map((x) => ({ id: x.id, title: x.title, meta: clipMeta(x) })),
      ].slice(0, 4),
      // A highlight a day (1.9.0): the latest hundred, latest first; the
      // widget picks the one for the day.
      marks: state.pages.flatMap((x) => (x.marks || []).map((m) => ({ id: x.id, mark: m.id, text: m.text.slice(0, 500), note: (m.note || "").slice(0, 200), title: x.title, at: m.at || 0 })))
        .sort((a, b) => b.at - a.at).slice(0, 100).map(({ at, ...m }) => m),
      collections: allFolders().sort((a, b) => a.localeCompare(b)).map((name) => {
        const list = folderPages(name);
        const i = folderNextIndex(list);
        // The clip the button opens comes first, then the ones after it
        // (1.10.1); no sites, just how much is left.
        const from = i < 0 ? 0 : i;
        // Its button (1.2.1): Start before anything in it was opened,
        // Continue while reading, Read again when all of it is read.
        const next = i < 0 ? list[0] : list[i];
        const started = list.some((x) => x.readAt || x.finished || (x.at || 0) > 0.02);
        return { name, meta: readCount(list), next: next ? next.id : "", button: !next ? "" : i < 0 ? "Read again" : started ? "Continue" : "Start",
          clips: list.slice(from, from + 4).map((x) => ({ id: x.id, title: x.title, meta: readingLine(x) })) };
      }),
      stats: statsWidget(),
    });
  }, 800);
}

const clipMeta = (x) => [x.site, readingLine(x)].filter(Boolean).join(" · ");
const readCount = (list) => { const done = list.filter((x) => x.finished).length; return done === list.length ? "All read" : done + " of " + list.length + " read"; };

// A widget's tap: the page to keep reading, a post, Feeds or a collection.
// The app icon's shortcuts (1.14.0) come the same way: Continue reading,
// Search, and Save the copied link.
async function takeWidget() {
  const got = await C.platform.widgets.take();
  if (!got || !got.kind) return;
  // The clip already open stays as it is (1.30.2), not closed and opened
  // again: that went back to the place last written, not the one read.
  const id = got.kind === "reading" ? (keepReading() || {}).id : got.kind === "page" && !got.aloud ? got.id : null;
  if (id && state.open && state.open.id === id && !$("readerView").hidden) {
    if (state.sheet) history.back();
    return;
  }
  await toLibrary();
  if (got.kind === "reading") {
    const p = keepReading();
    if (p) openPage(p.id); else await goPlace("library");
    return;
  }
  if (got.kind === "search") { await goPlace("library"); openSearch(); return; }
  if (got.kind === "paste") { await goPlace("library"); saveCopied(); return; }
  if (got.kind === "page" && state.pages.some((p) => p.id === got.id)) {
    // The collection widget's read aloud (1.25.0): opens it and reads on
    // from where it was left; one already reading aloud just goes on.
    if (got.aloud) { aloudFrom(got.id); return; }
    openPage(got.id);
    return;
  }
  if (got.kind === "mark" && state.pages.some((p) => p.id === got.id)) { markAfterOpen = got.mark || null; openPage(got.id); return; }
  if (got.kind === "post" && got.url) {
    await goPlace("feeds");
    const f = feeds.find((x) => x.items.some((it) => it.url === got.url));
    const saved = savedAs(got.url);
    if (saved) openPage(saved.id);
    else if (f) previewPost(f, f.items.find((it) => it.url === got.url));
    return;
  }
  if (got.kind === "feeds" || got.kind === "library" || got.kind === "reading") await goPlace(got.kind);
  if (got.kind === "favourites") { await goPlace("library"); setFilter("favourites"); }
  if (got.kind === "collection" && got.name) {
    await goPlace("library");
    const name = allFolders().find((n) => sameTag(n, got.name));
    if (name) openFolder(name);
  }
}

// Android lets only the app in front read the clipboard, which the app
// just opened may not be yet: one more try, then the field to paste in.
async function saveCopied() {
  let text = await C.platform.widgets.copied();
  if (!linksFrom(text).length) { await new Promise((r) => setTimeout(r, 600)); text = await C.platform.widgets.copied(); }
  if (linksFrom(text).length) { saveTyped(text); return; }
  $("saveUrl").focus();
  toast("No link copied. Paste one here.");
}

// Posts found with the app closed: those feeds are read again now, and
// the notification's tap opens Feeds.
async function takeFeedNews() {
  const news = await C.platform.feedChecks.news();
  if (news.open) {
    await toLibrary();
    const to = news.feed && feeds.some((f) => f.url === news.feed) ? news.feed : null;
    if (state.place !== "feeds" || state.feed !== to) await goPlace("feeds", to);
  }
  // A post's Save, from its notification.
  if (news.save && /^https?:/.test(news.save)) {
    const f = feeds.find((x) => x.url === news.feed);
    const it = f && f.items.find((x) => sameUrl(x.url, news.save));
    if (f) saveFeedPosts([{ f, it: it || { url: news.save, foundAt: Date.now() } }]);
    else savePage(news.save);
  }
  let due = false;
  for (const url of news.feeds) {
    const f = feeds.find((x) => x.url === url);
    if (f) { f.checkedAt = 0; due = true; }
  }
  if (due) checkFeeds(false);
}

// One feed read again; a feed set to save its posts saves the new ones.
async function checkFeed(f) {
  let got = null, error = "";
  try { got = await C.feeds.readFeed(f.url); }
  catch (e) { error = e instanceof C.feeds.FeedError ? e.message : "Couldn't check this feed. Try again later."; }
  if (!feeds.includes(f)) return;
  if (got) mergeFeed(f, got);
  f.error = error;
  f.checkedAt = Date.now();
  saveFeeds();
  paintFeeds();
  if (got && f.mode === "save") autoSave(f);
}

// Every feed not checked in the last few hours, one at a time, quietly.
async function checkFeeds(force) {
  if (feedsChecking || !navigator.onLine || !feeds.length) return;
  if (waitsForWifi(DATA_SAVE_KEY)) { if (force) toast("Feeds check when you're on Wi-Fi."); return; }
  feedsChecking = true;
  paintFeeds();
  try {
    for (const f of [...feeds]) {
      if (!force && f.checkedAt && Date.now() - f.checkedAt < FEED_EVERY) continue;
      await checkFeed(f);
    }
  } finally {
    feedsChecking = false;
    paintFeeds();
  }
}

// Saves run one feed after another, so two feeds saving at once don't
// interleave their runs.
let feedSaves = Promise.resolve();
function autoSave(f) {
  const todo = feedPosts(f).filter((it) => !it.tried && !savedAs(it.url) && !savingUrl(it.url));
  if (!todo.length) return;
  todo.forEach((it) => { it.tried = true; });
  saveFeeds();
  saveFeedPosts(todo.map((it) => ({ f, it })));
}

// Into each post's feed's collection, oldest first so the collection
// reads in order, with the feed's pictures setting.
function saveFeedPosts(list) {
  if (!navigator.onLine) { toast("You're offline. Save these when you're back online."); return feedSaves; }
  const by = new Map();
  for (const x of [...list].sort((a, b) => postAt(a.it) - postAt(b.it))) {
    if (savedAs(x.it.url) || savingUrl(x.it.url)) continue;
    if (!by.has(x.f)) by.set(x.f, []);
    by.get(x.f).push(x.it.url);
  }
  for (const [f, urls] of by) {
    const folder = f.folder ? folderName(f.folder) : null;
    const how = { mode: C.platform.native ? f.images || load(IMAGES_KEY, "previews") : undefined };
    feedSaves = feedSaves.then(() => urls.length === 1 ? savePage(urls[0], folder || undefined, how)
      : saveAll(urls, folder, [], how.mode, true)).then(paintFeeds, paintFeeds);
  }
  paintFeeds();
  return feedSaves;
}

function paintFeeds() {
  if (state.place === "feeds") renderFeeds();
  if (sideShown()) renderSide();
  if (state.menu && state.menu.kind === "feed") redrawMenu();
}

// Library, Feeds or Highlights under the same bar; only the title changes.
function paintPlace() {
  const feedsOn = state.place === "feeds";
  const marksOn = state.place === "highlights";
  const readOn = state.place === "reading";
  $("placeTitle").textContent = feedsOn ? "Feeds" : marksOn ? "Highlights" : readOn ? "Reading" : "Library";
  $("libraryView").dataset.place = state.place;
  $("library").hidden = feedsOn || marksOn || readOn;
  $("feeds").hidden = !feedsOn;
  $("highlights").hidden = !marksOn;
  $("reading").hidden = !readOn;
  $("paneNote").textContent = marksOn ? "Pick a highlight to read it here" : readOn ? "Pick a clip to read it here" : "Pick a post to read it here";
  // The bottom field follows a feed in Feeds, and saves a link elsewhere.
  $("saveUrl").placeholder = feedsOn ? "Paste a site or feed to follow" : "Paste a link to save";
  document.querySelector('label[for="saveUrl"]').textContent = feedsOn ? "Site or feed" : "Page link";
  $("saveForm").querySelector(".btn-primary").textContent = feedsOn ? "Follow" : "Save";
  $("severalBtn").hidden = feedsOn;
  if (feedsOn || marksOn || readOn) { if (state.query) clearSearch(); }
  if (feedsOn) renderFeeds();
  else if (marksOn) renderHighlights();
  else if (readOn) renderReading();
  else renderLibrary();
}

function goPlace(place, feed) {
  // The pinned sidebar is there over a collection or Files too: a tap in
  // it steps back to the library first.
  if (pinned.matches && history.state && history.state.view) return toLibrary().then(() => goPlace(place, feed));
  state.place = place;
  state.feed = feed || null;
  store(PLACE_KEY, place);
  const done = state.side ? back() : Promise.resolve();
  paintPlace();
  if (pinned.matches) renderSide();
  scrollTo(0, 0);
  return done;
}

function pickFeed(url) {
  state.feed = url;
  renderFeeds();
}

function renderFeeds() {
  const root = $("feeds");
  const picked = state.feed && feeds.find((f) => f.url === state.feed);
  if (state.feed && !picked) state.feed = null;
  // Looking at Feeds clears what's new; only a change goes to sync, so
  // an open river doesn't write to GitHub every few minutes.
  if (document.visibilityState !== "hidden" && freshPosts()) { store(FEEDS_SEEN_KEY, Date.now()); syncSoon(); }
  const active = document.activeElement && root.contains(document.activeElement)
    ? [document.activeElement.closest("[data-key]"), document.activeElement.className] : null;
  const chipsAt = root.querySelector(".feed-chips");
  const scrollX = chipsAt ? chipsAt.scrollLeft : 0;
  const nodes = [];
  if (!feeds.length) {
    nodes.push(el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, "Follow the sites you read"),
      el("p", { class: "empty-text" }, C.platform.native
        ? "Add a site and its new posts wait here for you to save, or save themselves."
        : "Add a site and its new posts wait here. Most sites only let Waypage on your phone read their feed."),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addFeed") }, "Add a feed")));
    root.replaceChildren(...nodes);
    return;
  }
  const chip = (label, n, on, onclick, key) => {
    const b = el("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), "data-key": key, onclick },
      el("span", { class: "chip-label", dir: "auto" }, label), n ? " · " + n : null);
    return b;
  };
  const all = feeds.reduce((n, f) => n + waitingIn(f), 0);
  nodes.push(el("div", { class: "chips filters feed-chips", role: "group", "aria-label": "Feeds" },
    chip("All", all, !picked, () => pickFeed(null), "chip:all"),
    ...feeds.map((f) => {
      const c = chip(f.title, waitingIn(f), picked === f, () => pickFeed(f.url), "chip:" + f.url);
      c.dataset.feed = f.url;
      return c;
    })));
  const checked = Math.max(0, ...(picked ? [picked] : feeds).map((f) => f.checkedAt || 0));
  const line = feedsChecking ? "Checking…" : picked && picked.error ? picked.error
    : checked ? "Checked " + whenText(checked) : "Not checked yet";
  const list = (picked ? [picked] : feeds).flatMap((f) => feedPosts(f).map((it) => ({ f, it })))
    .sort((a, b) => postAt(b.it) - postAt(a.it));
  nodes.push(el("div", { class: "feed-head" },
    el("p", { class: "meta" + (picked && picked.error && !feedsChecking ? " warn" : "") }, line),
    // Phones pull down to check; a pointer gets the button.
    el("span", { class: "feed-head-acts" },
      el("button", { class: "btn-text feed-check", type: "button", "data-key": "check", onclick: () => checkNow(picked) }, "Check now"))));
  let day = null, group = null;
  for (const x of list) {
    const d = dayName(postAt(x.it));
    if (d !== day) {
      day = d;
      const open = list.filter((y) => dayName(postAt(y.it)) === d && !savedAs(y.it.url) && !savingUrl(y.it.url));
      nodes.push(sectionHead(d, open.length > 1
        ? el("button", { class: "btn-text", type: "button", "data-key": "all:" + d, onclick: () => saveFeedPosts(open) }, "Save all " + open.length) : null));
      group = el("div", { class: "group feed-group" });
      nodes.push(group);
    }
    group.append(postRow(x.f, x.it, !picked));
  }
  if (!list.length) {
    const days = (picked || feeds[0]).days || 7;
    nodes.push(el("div", { class: "empty" },
      el("p", { class: "empty-text" }, (picked && picked.error) || (!checked ? "Its posts show up after the first check."
        : "Nothing posted in the last " + (FEED_DAYS.find((o) => o.value === String(days)) || FEED_DAYS[1]).label.replace(/^A /, "").toLowerCase() + "."))));
  }
  root.replaceChildren(...nodes);
  if (state.feedPick) paintPostPicks();
  const chips = root.querySelector(".feed-chips");
  if (chips) chips.scrollLeft = scrollX;
  if (active && active[0]) {
    const again = root.querySelector('[data-key="' + CSS.escape(active[0].dataset.key) + '"]');
    const cls = String(active[1]).split(" ")[0];
    const target = again && cls && (again.classList.contains(cls) ? again : again.querySelector("." + cls));
    if (target) target.focus({ preventScroll: true });
  }
}

// ---- Google Drive backups (1.27.0) ----
// Beside sync, not instead of it: Back up now, a weekly backup on Wi-Fi
// while Waypage is open, the last three kept, and any of them restored
// the way a backup file is (the copy saved last wins).

// While one runs: { restore, text, share, paused, stopped, ctl }. Pause and
// Stop are in Downloads and in Settings (1.27.1).
let driveRun = null;
let driveFiles = null;    // the backups in Drive, once listed
let driveListError = "";
let driveDueSaid = false;

const driveWhen = (at) => new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
function driveSay(text, share) {
  if (!driveRun) return;
  driveRun.text = text;
  if (share !== undefined) driveRun.share = share;
  const n = document.getElementById("driveStatus");
  if (n) n.textContent = driveStatusText();
  paintDriveCard();
}
function driveStatusText() {
  const r = driveRun;
  return r.stopped ? "Stopping…" : r.paused ? "Paused · " + r.text : r.text;
}
async function driveGate() {
  const r = driveRun;
  while (r && r.paused && !r.stopped) await new Promise((go) => { r.wake = go; });
  return !!r && !r.stopped;
}
// Pausing a transfer breaks it off; Resume sends on from where Drive got
// to (the app) or sends the file again (a browser).
function drivePause(on) {
  const r = driveRun;
  if (!r || r.stopped) return;
  r.paused = on;
  if (on && r.ctl.stop) r.ctl.stop();
  if (!on && r.wake) { r.wake(); r.wake = null; }
  drivePaint();
}
function driveStop() {
  const r = driveRun;
  if (!r) return;
  r.stopped = true;
  if (r.ctl.stop) r.ctl.stop();
  if (r.wake) { r.wake(); r.wake = null; }
  drivePaint();
}
const driveCanStop = () => !!driveRun && !driveRun.merging;
function driveControls(cls) {
  const r = driveRun;
  if (!driveCanStop()) return null;
  return el("span", { class: cls },
    r.restore ? null : el("button", { class: "btn-small", type: "button", ...(r.stopped ? { disabled: "" } : {}), onclick: () => drivePause(!r.paused) }, r.paused ? "Resume" : "Pause"),
    el("button", { class: "btn-quiet danger", type: "button", ...(r.stopped ? { disabled: "" } : {}), onclick: driveStop }, "Stop"));
}
// The run as a card in Downloads, like the app's own update.
function driveCard() {
  const r = driveRun;
  return el("div", { class: "card saving drive-run wide", role: "group", "aria-label": r.restore ? "Restoring from Google Drive" : "Backing up to Google Drive" },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, "Google Drive"),
      el("span", { class: "card-title" }, r.restore ? "Restoring your library" : "Backing up your library"),
      el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" }, el("span", { class: "progress-fill" })),
      el("span", { class: "card-status" + (r.paused ? "" : " accent") },
        r.paused ? null : el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { class: "status-text" }, driveStatusText())),
      driveControls("card-actions")));
}
function paintDriveCard() {
  paintDownloads();
  if (!driveRun) return;
  // A backup's card is on the Sync screen, a restore's in Downloads.
  for (const card of document.querySelectorAll(".drive-run")) {
    const share = driveRun.share;
    const bar = card.querySelector(".progress");
    bar.classList.toggle("busy", share == null);
    if (share == null) bar.removeAttribute("aria-valuenow");
    else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
    bar.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
    card.querySelector(".status-text").textContent = driveStatusText();
  }
}
const driveBusy = () => (driveRun ? { disabled: "" } : {});
function drivePaint() {
  if (state.section === "drive") renderSection();
  if (state.syncPage) renderSyncPage();
  if (state.settings) renderSettings();
  renderDownloads();
  paintDriveCard();
}
// ---- The Sync screen (1.28.0) ----
// From the bar's sync button, like Downloads: GitHub sync and Google
// Drive backups, each with its progress and controls. A restore comes
// down, so it's in Downloads.
function renderSyncPage() {
  const root = $("syncList");
  const r = driveRun;
  syncPageSaid = syncPageSig();
  root.replaceChildren(
    sectionHead("GitHub sync"), githubCard(),
    C.drive.available ? sectionHead("Google Drive") : null,
    C.drive.available ? (r && !r.restore ? driveCard() : driveRestCard()) : null);
  if (r && !r.restore) paintDriveCard();
}
const toSettings = (section) => toLibrary().then(() => openSettings(false, section));
function githubCard() {
  if (!C.sync.on) {
    return el("div", { class: "card wide", role: "group", "aria-label": "GitHub sync" },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, "GitHub"),
        el("span", { class: "card-title" }, "Not set up"),
        el("span", { class: "card-status" }, "Keeps your library the same on your phone and computer."),
        el("span", { class: "card-actions" },
          el("button", { class: "btn-small", type: "button", onclick: () => toSettings("sync") }, "Set up"))));
  }
  const last = C.sync.last, now = syncProgress(), paused = C.sync.paused, running = C.sync.running;
  const status = running ? now.text : paused ? "Paused" + (last.at ? ". Last synced " + whenText(last.at) : "")
    : waitsForWifi(DATA_SYNC_KEY) ? "Waiting for Wi-Fi" + (last.at ? ". Last synced " + whenText(last.at) : "")
    : last.error ? last.error : last.at ? "Synced " + whenText(last.at) : "Not synced yet";
  const after = running ? "" : syncAfter();
  return el("div", { class: "card saving sync-run wide", role: "group", "aria-label": "GitHub sync" },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, C.sync.account),
      el("span", { class: "card-title" }, running ? "Syncing your library" : "Your library"),
      running ? el("span", { class: "progress" + (now.part == null ? " busy" : ""), "aria-hidden": "true" },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + (now.part || 0) + ")" })) : null,
      el("span", { class: "card-status" + (running ? " accent" : last.error ? " warn" : ""), role: "status" },
        running ? el("span", { class: "spinner", "aria-hidden": "true" }) : null,
        el("span", { class: "status-text" }, status)),
      after ? el("span", { class: "card-status accent" }, after) : null,
      el("span", { class: "card-actions" },
        paused || running ? null : el("button", { class: "btn-small", type: "button", onclick: () => syncNow(false) }, "Sync now"),
        el("button", { class: paused ? "btn-small" : "btn-quiet", type: "button", onclick: () => pauseSync(!paused) }, paused ? "Resume" : "Pause"),
        el("button", { class: "btn-quiet", type: "button", onclick: () => toSettings("sync") }, "Settings"))));
}
// Google Drive when no backup is going up: when the last one was, and
// Back up now.
function driveRestCard() {
  const on = C.drive.on, l = C.drive.last;
  const status = !on ? "A copy of your library in your own Google Drive, every week and whenever you ask."
    : driveRun ? "Restoring a backup, in Downloads"
    : l.error ? l.error
    : l.at ? "Last backup " + whenText(l.at) + (l.size ? ", " + formatSize(l.size) : "") : "No backup yet";
  return el("div", { class: "card wide", role: "group", "aria-label": "Google Drive" },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, "Google Drive"),
      el("span", { class: "card-title" }, on ? "Backups" : "Not connected"),
      el("span", { class: "card-status" + (on && l.error && !driveRun ? " warn" : "") }, status),
      el("span", { class: "card-actions" },
        on ? el("button", { class: "btn-small", type: "button", ...driveBusy(), onclick: () => driveBackUp(false) }, "Back up now") : null,
        el("button", { class: on ? "btn-quiet" : "btn-small", type: "button", onclick: () => toSettings("drive") }, on ? "Settings" : "Set up"))));
}
function openSyncPage(fromHistory) {
  if (state.syncPage) return;
  if (!fromHistory && (state.settings || state.news || state.downloads)) { toLibrary().then(() => openSyncPage()); return; }
  state.syncPage = true;
  paintSync();
  renderSyncPage();
  if (!fromHistory) history.pushState({ view: "sync" }, "");
  $("syncBody").scrollTop = 0;
  pushScreen($("syncView")).then(() => $("syncBack").focus());
}
function closeSyncPage() {
  if (!state.syncPage) return;
  state.syncPage = false;
  popScreen($("syncView"));
}

function driveValue() {
  if (!C.drive.on) return "Off";
  if (driveRun) return driveRun.paused ? "Paused" : driveRun.restore ? "Restoring" : "Backing up";
  const l = C.drive.last;
  return l.error ? "Didn't back up" : l.at ? whenText(l.at).replace(/^./, (c) => c.toUpperCase()) : "On";
}

function driveSections() {
  if (!C.drive.on) {
    return [el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Back up to Google Drive"),
      el("p", { class: "section-lead" }, "A copy of your library in your own Google Drive, made every week and whenever you ask, to bring back on a new phone or after a mistake."),
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: (e) => driveConnect(e.currentTarget) },
          el("span", { class: "row-label accent" }, "Connect Google Drive"))),
      el("p", { class: "footnote" }, "Waypage can only see the backups it makes, in a Waypage folder in your Drive. Nothing else there is opened or read."))];
  }
  const l = C.drive.last;
  const status = driveRun ? driveStatusText()
    : l.error ? l.error
    : l.at ? "Last backup " + whenText(l.at) + (l.size ? ", " + formatSize(l.size) : "")
    : "No backup yet";
  const what = C.drive.what;
  const sw = (key, label, note) => el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), note ? el("span", { class: "choice-note" }, note) : null),
    el("input", { class: "switch", type: "checkbox", role: "switch", checked: !!what[key], ...driveBusy(),
      onchange: (e) => { C.drive.setWhat(key, e.target.checked); renderSection(); } }));
  if (!driveFiles && !driveListError && !driveRun) driveRefresh();
  // Each with its own delete (1.31.0).
  const list = driveFiles ? driveFiles.map((f) => el("div", { class: "row drive-row" },
    el("button", { class: "row drive-pick", type: "button", ...driveBusy(), onclick: () => driveRestore(f) },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label" }, driveWhen(f.at)),
        el("span", { class: "choice-note" }, [formatSize(f.size), f.clips ? countLine(f.clips) : "", f.from ? "from " + f.from : ""].filter(Boolean).join(" · "))),
      el("span", { class: "row-value accent" }, "Restore")),
    el("button", { class: "row-x drive-delete", type: "button", ...driveBusy(), "aria-label": "Delete the backup of " + driveWhen(f.at), title: "Delete", onclick: () => driveDelete(f) },
      el("span", { class: "visually-hidden" }, "Delete"),
      svgBin()))) : [];
  return [
    el("section", { class: "settings-section" },
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", ...driveBusy(), onclick: () => driveBackUp(false) },
          el("span", { class: "choice-text" },
            el("span", { class: "choice-label accent" }, "Back up now"),
            el("span", { class: "choice-note" + (l.error && !driveRun ? " warn" : ""), id: "driveStatus", role: "status" }, status))),
        driveRun ? el("div", { class: "row" }, driveControls("drive-actions")) : null,
        el("label", { class: "row" },
          el("span", { class: "choice-text" },
            el("span", { class: "choice-label" }, "Every week"),
            el("span", { class: "choice-note" }, C.platform.native ? "On Wi-Fi, while Waypage is open" : "Asks first, since this browser signs in to Google for an hour at a time")),
          el("input", { class: "switch", type: "checkbox", role: "switch", checked: C.drive.auto,
            onchange: (e) => { C.drive.auto = e.target.checked; } }))),
      el("p", { class: "footnote" }, "Drive keeps the last " + C.drive.KEEP + " backups; an older one is deleted when a new one is made.")),
    el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "What goes in"),
      el("div", { class: "group" },
        sw("clips", "Clips", "With their pictures, highlights and where you were"),
        sw("files", "Files", "Books, PDFs and comics, usually the biggest part"),
        sw("feeds", "Feeds you follow", "")),
      el("p", { class: "footnote" }, "Tags, collections and favourites go with the clips and files they're on.")),
    el("section", { class: "settings-section" },
      el("h2", { class: "overline" }, "Restore"),
      el("div", { class: "group" }, ...(list.length ? list
        : driveListError === DRIVE_SIGN_IN ? [el("button", { class: "row", type: "button", onclick: driveSignIn }, el("span", { class: "row-label accent" }, "Sign in to Google to see them"))]
        : [el("div", { class: "row" }, el("span", { class: "row-label" + (driveListError ? " warn" : "") }, driveListError || (driveFiles ? "No backups in Drive yet" : "Looking in Drive…")))])),
      el("p", { class: "footnote" }, "Restoring adds what isn't here and keeps whichever copy of a clip was saved last. Nothing here is deleted. The bin deletes a backup from Drive for good.")),
    el("section", { class: "settings-section" },
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", ...driveBusy(), onclick: driveDisconnect },
          el("span", { class: "row-label warn" }, "Disconnect Google Drive"))),
      el("p", { class: "footnote" }, (C.drive.email ? "Connected as " + C.drive.email + ". " : "") + "The backups stay in your Drive.")),
  ];
}

async function driveConnect(btn) {
  if (btn) { btn.disabled = true; btn.querySelector(".row-label").textContent = "Connecting…"; }
  try {
    await C.drive.connect();
    driveFiles = null;
    driveListError = "";
    toast("Google Drive connected");
  } catch (e) {
    if (!(e instanceof C.drive.DriveError)) console.error(e);
    if (!e || e.code !== "again") toast(e instanceof C.drive.DriveError ? e.message : "Couldn't connect. Try again.");
  }
  drivePaint();
}

async function driveDisconnect() {
  await C.drive.disconnect();
  driveFiles = null;
  driveListError = "";
  drivePaint();
  toast("Disconnected. Your backups stay in Google Drive.");
}

const DRIVE_SIGN_IN = "signin";
async function driveSignIn() {
  try { await C.drive.getToken(true); } catch (e) { if (!e || e.code !== "again") toast((e && e.message) || "Couldn't sign in. Try again."); return; }
  driveFiles = null;
  driveListError = "";
  driveRefresh();
}
async function driveRefresh() {
  try {
    driveFiles = await C.drive.list();
    driveListError = "";
  } catch (e) {
    driveListError = e instanceof C.drive.DriveError && e.code === "signin" ? DRIVE_SIGN_IN : (e && e.message) || "Couldn't look in Drive";
    if (!(e instanceof C.drive.DriveError)) console.error(e);
  }
  if (state.section === "drive") renderSection();
}

// What a backup holds, from Settings › Google Drive › What goes in.
function driveContents() {
  const w = C.drive.what;
  const pages = state.pages.filter((p) => (p.file ? w.files : w.clips));
  return { pages, feeds: w.feeds ? feeds : [] };
}

async function driveBackUp(auto) {
  if (driveRun || !C.drive.on) return;
  const { pages, feeds: fs } = driveContents();
  if (!pages.length && !fs.length) { if (!auto) toast("There's nothing to back up with what's picked."); return; }
  const run = driveRun = { restore: false, text: "Getting ready…", share: null, paused: false, stopped: false, ctl: {} };
  drivePaint();
  let out = null;
  try {
    // Asked for first: a browser can open Google's window only straight
    // from the tap.
    await C.drive.getToken(!auto, "backup");
    out = await C.backup.exportLibrary(pages, (done, total) => driveSay("Packing, " + done + " of " + total, (done / total) * 0.3), fs, driveGate);
    if (!(await driveGate())) throw new C.drive.DriveError("Stopped.", "cancelled");
    driveSay("Sending to Drive…", 0.3);
    const info = { device: load(DEVICE_KEY, "") || guessedName(), clips: pages.length };
    const sent = (done, total) => driveSay("Sending to Drive, " + (total ? Math.round((done / total) * 100) + "%" : formatSize(done)), total ? 0.3 + 0.7 * (done / total) : null);
    let made;
    for (;;) {
      try { made = await C.drive.upload(out, info, sent, run.ctl); break; }
      catch (e) {
        if (e && e.code === "cancelled" && run.paused && await driveGate()) { driveSay("Sending to Drive…"); continue; }
        throw e;
      }
    }
    C.drive.last = { at: Date.now(), size: made.size || (out.blob ? out.blob.size : 0) };
    driveFiles = null;
    if (!auto) toast("Backed up to Google Drive");
  } catch (e) {
    if (e && e.code === "cancelled") {
      toast("Backup stopped");
      if (out && out.uri) C.platform.plugin("Filesystem").deleteFile({ path: out.name, directory: "CACHE" }).catch(() => {});
      driveRun = null;
      drivePaint();
      return;
    }
    if (!(e instanceof C.drive.DriveError)) console.error(e);
    const msg = e instanceof C.drive.DriveError ? e.message : "Couldn't make the backup. Free some space and try again.";
    C.drive.last = { ...C.drive.last, error: msg, tried: Date.now() };
    if (!auto && (!e || e.code !== "again")) toast(msg);
  }
  if (out && out.uri) C.platform.plugin("Filesystem").deleteFile({ path: out.name, directory: "CACHE" }).catch(() => {});
  driveRun = null;
  drivePaint();
}

async function driveDelete(f) {
  if (driveRun || !confirm("Delete the backup of " + driveWhen(f.at) + " from Google Drive? It can't be brought back.")) return;
  try {
    await C.drive.remove(f.id);
  } catch (e) {
    // Already gone counts as deleted.
    if (!(e instanceof C.drive.DriveError && e.code === "gone")) { toast((e && e.message) || "Couldn't delete it. Try again."); return; }
  }
  if (driveFiles) driveFiles = driveFiles.filter((x) => x.id !== f.id);
  drivePaint();
  toast("Backup deleted");
}

async function driveRestore(f) {
  if (driveRun) return;
  const asked = C.drive.getToken(true);
  const run = driveRun = { restore: true, text: "Bringing the backup down…", share: null, paused: false, stopped: false, ctl: {} };
  drivePaint();
  try {
    await asked;
    const file = await C.drive.download(f.id, (done, total) => driveSay("Bringing it down, " + (total > 0 ? Math.round((done / total) * 100) + "%" : formatSize(done)), total > 0 ? (done / total) * 0.5 : null), run.ctl);
    if (run.stopped) throw new C.drive.DriveError("Stopped.", "cancelled");
    // Merging can't stop halfway: the clips are written before the index.
    run.merging = true;
    drivePaint();
    await restoreBackup(file, (t) => { const m = /(\d+) of (\d+)/.exec(t); driveSay(t, m ? 0.5 + 0.5 * (m[1] / m[2]) : undefined); });
    renderLibrary();
  } catch (e) {
    if (e && e.code === "cancelled") { toast("Restore stopped. Nothing was changed."); driveRun = null; drivePaint(); return; }
    const told = e instanceof C.drive.DriveError || /Waypage/.test((e && e.message) || "");
    if (!told) console.error(e);
    toast(told ? e.message : "Couldn't restore that backup. Try again.");
  }
  driveRun = null;
  drivePaint();
}

// The weekly backup, looked for on opening and on coming back: a week
// since the last one (or since connecting, 1.27.1), on Wi-Fi, and not again within six hours of one
// that failed. A browser without a live sign-in asks with a toast.
function driveDue() {
  if (!C.drive.available || !C.drive.on || !C.drive.auto || driveRun || document.hidden) return;
  const l = C.drive.last;
  if (Date.now() - Math.max(l.at || 0, C.drive.since) < C.drive.WEEK || Date.now() - (l.tried || 0) < 6 * 3600e3) return;
  if (!navigator.onLine || C.platform.metered) return;
  if (C.drive.signedIn) { driveBackUp(true); return; }
  if (driveDueSaid) return;
  driveDueSaid = true;
  toast("Your weekly Google Drive backup is due", "Back up", () => driveBackUp(false));
}
