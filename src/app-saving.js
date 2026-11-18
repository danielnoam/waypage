// Waypage's shell (1.14.0): sync, saving several, next
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
const SYNCED_KEEP = ["savedAt", "title", "requested", "tags", "folder", "folderAt", "source", "series", "turn", "fav", "favAt", "folderFav", "folderFavAt", "coverPick", "at", "finished", "readAt", "readOn", "placeAt", "spot", "marks", "noShare", "folderNoShare", "folderTagNew", "folderSeries", "folderIn", "live"];
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
const syncsPage = (p) => (p.note ? C.sync.what.notes && !C.sync.tooBig(p) : C.sync.what.clips);
// Said on a note's card, in its ⋯ and in Sync (2026-11).
const tooBigLine = (p) => (C.sync.on && C.sync.tooBig(p) ? t("Over 50 MB, can't be synced") : "");
async function syncNow(quiet = true) {
  if (!C.sync.on || C.sync.paused) return null;
  // Not while a version is being put back (only its own syncs run).
  if (reverting && !reverting.syncing) return null;
  if (!navigator.onLine && quiet) return null;
  if (waitsForWifi(DATA_SYNC_KEY)) { if (!quiet) toast(t("Sync waits for Wi-Fi. Change that below.")); return null; }
  C.sync.device = deviceName();
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
      // A note or a clip this device doesn't sync (the switches in What
      // this device syncs) stays out of it.
      getPages: () => state.pages.filter((p) => !p.link && syncsPage(p)),
      urlKey,
      // The same objects are kept and updated in place: the open page,
      // an open menu and the position timer hold on to them.
      setPages: async (list) => {
        const live = new Map(state.pages.map((p) => [p.id, p]));
        const open = state.open, was = open && placeTime(open), inkWas = open && JSON.stringify(open.ink || null);
        state.pages = list.map((n) => {
          const o = live.get(n.id);
          if (!o || o === n) return n;
          for (const k of Object.keys(o)) if (!(k in n)) delete o[k];
          return Object.assign(o, n);
        }).concat(state.pages.filter((p) => p.link || !syncsPage(p))).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        // A place read further on another device is followed when it
        // comes in just after the clip opened, before it was scrolled here
        // at all (1.31.0): a clip opened from a widget before sync came in
        // stayed behind. Only a place moved later counts, never the same
        // place written another way, and never mid-reading (1.31.1): that
        // pulled the text back up under the finger.
        const follow = () => state.open === open && !movedHere && !C.reader.touched() && Date.now() - openedAt < FOLLOW_MS;
        if (open && placeTime(open) > was && follow()) C.reader.placed().then(() => { if (follow()) C.reader.jump(open.at || 0, open.spot || ""); });
        await C.store.writeIndexOnly(state.pages);
        // Drawings from another device on the clip open here show at once,
        // unless a pen is out (2026-11).
        if (open && state.open === open && !C.ink.on && JSON.stringify(open.ink || null) !== inkWas) { inkClose(); inkSync(open); }
        texts.clear();
        await loadThumbs();
        renderLibrary();
        if (state.folder) renderFolder();
        updateWidgets();
        noteCoversSoon();
      },
      getFeeds: () => feeds,
      setFeeds: syncedFeeds,
      getSeen: () => load(FEEDS_SEEN_KEY, 0),
      setSeen: (at) => { store(FEEDS_SEEN_KEY, at); if (sideShown()) renderSide(); },
      sameUrl,
      onProgress: () => { if (state.section === "sync") renderSection(); paintDownloads(); },
      light: syncsPlacesOnly(),
      isMail: (u) => isMail({ url: u }),
      getOutside: outsidePages,
      setOutside: outsideTake,
    });
  } catch (e) {
    if (!joined) unsynced = unsynced || sending;
    if (!quiet) toast(C.sync.last.error || t("Sync stopped. Try again."));
  }
  if (joined && unsynced) return syncNow(quiet);
  if (state.section === "sync") renderSection();
  paintDownloads();
  if (res && res.downloads.length) { syncQueue.push(...res.downloads.map((p) => p.id)); keepQueue(); fetchPictures(); }
  if (res && res.fromLinks.length) saveFromLinks(res.fromLinks);
  if (res && res.light) { if (!quiet) toast(t("Places and reading time synced. Clips wait for Wi-Fi.")); return res; }
  if (res && !quiet && !C.sync.paused) toast(res.up + res.down + res.removed ? t("Synced: {join}.", { join: [res.up ? t("{n} sent", { n: res.up }) : "", res.down ? t("{n} came in", { n: res.down }) : "", res.removed ? t("{n} removed", { n: res.removed }) : ""].filter(Boolean).join(", ") }) : t("Already in step."));
  return res;
}
// Files read from outside (2026-11): the file stays here, and where you
// are in it, its highlights and drawings, tags, collection and favourite
// sync by its
// fingerprint (sync.js, outsideOf). One from before fingerprints gets its
// own the first time it has something to send.
async function outsidePages() {
  const list = [];
  let found = false;
  for (const p of state.pages) {
    if (!p.link || !p.file || p.note) continue;
    if (!p.file.fp) {
      const has = p.at > 0 || p.finished || (p.marks || []).length || p.ink || (p.drawn || []).length || (p.tags || []).length || p.folder || p.fav || (p.listen && p.listen.t > 0);
      if (!has || !(await C.files.fingerprintOf(p))) continue;
      found = true;
    }
    const copy = { ...p, file: { ...p.file } };
    // A printed PDF's drawings live beside the clip; pictures stay here.
    if ((p.drawn || []).length) { const pages = C.backup.cleanInk(((await C.store.readInk(p.id)) || {}).pages); if (pages) copy.pages = pages; }
    list.push(copy);
  }
  if (found) await C.store.writeIndexOnly(state.pages);
  return list;
}
// What came back goes onto each file here with that fingerprint, unless
// it changed here while sync ran (it goes up next time) or its pen is out.
async function outsideTake(all, sent) {
  const now = C.sync.outsideOf(await outsidePages());
  const bare = (o) => { const x = { ...(o || {}) }; delete x.ids; delete x.name; return JSON.stringify(x); };
  let changed = false;
  for (const [fp, o] of Object.entries(all)) {
    if (sent[fp] && bare(now[fp]) !== bare(sent[fp])) continue;
    for (const p of state.pages.filter((x) => x.link && x.file && x.file.fp === fp && !x.note)) {
      if (state.open === p && C.ink.on) continue;
      const drew = await outsideDrawn(p, o.pages);
      const next = C.sync.outsideOnto(p, o);
      if (!next) { if (drew) { changed = true; if (state.open === p) { inkClose(); inkSync(p); } } continue; }
      const was = placeTime(p);
      for (const k of Object.keys(p)) if (!(k in next)) delete p[k];
      Object.assign(p, next);
      changed = true;
      if (state.open === p) {
        paintMarks(p);
        inkClose(); inkSync(p);
        if (placeTime(p) > was && !movedHere && !C.reader.touched() && Date.now() - openedAt < FOLLOW_MS) C.reader.placed().then(() => { if (state.open === p) C.reader.jump(p.at || 0, p.spot || ""); });
      }
    }
  }
  outsideStats(all);
  if (!changed) return;
  await C.store.writeIndexOnly(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
  updateWidgets();
}
// The same file's clip on another device counts as this one in the
// reading stats.
function outsideStats(all) {
  const same = {};
  for (const [fp, o] of Object.entries(all || {})) {
    const here = state.pages.filter((p) => p.link && p.file && p.file.fp === fp).map((p) => p.id);
    if (!here.length) continue;
    for (const id of (o.ids || []).concat(here.slice(1))) if (id !== here[0]) same[id] = here[0];
  }
  C.stats.same(same);
}
// A file read from outside, just brought in, takes what another device
// left on the same file, as this device last saw it.
function outsideKnown(p) {
  const fp = p && p.link && p.file && p.file.fp;
  const o = fp && C.sync.on && C.sync.what.clips && C.sync.outsideKnown(fp);
  if (!o) return false;
  for (const [k, v] of Object.entries(o)) if (k !== "ids" && k !== "name" && k !== "pages") p[k] = v;
  if (o.pages) outsideDrawn(p, o.pages).then((drew) => { if (drew) C.store.writeIndexOnly(state.pages); }).catch(() => {});
  outsideStats({ [fp]: o });
  return true;
}
// A printed PDF's drawn pages as they came back, keeping the pictures put
// on them here, which never sync. True when they changed.
async function outsideDrawn(p, got) {
  if (!got && !(p.drawn || []).length) return false;
  const old = (await C.store.readInk(p.id)) || {};
  if (JSON.stringify(C.backup.cleanInk(old.pages) || null) === JSON.stringify(got || null)) return false;
  const pages = JSON.parse(JSON.stringify(got || {}));
  for (const [n, list] of Object.entries(old.pages || {})) {
    const pics = (list || []).filter((x) => x && x.t === "i");
    if (pics.length) pages[n] = (pages[n] || []).concat(pics);
  }
  const keys = Object.keys(pages).filter((n) => pages[n].length);
  await C.store.writeInk(p.id, keys.length ? { v: 1, size: p.file.size || 0, pages } : null);
  const d = keys.map((n) => [Number(n), new Set(pages[n].map((x) => x.id)).size]).sort((a, b) => a[0] - b[0]);
  if (d.length) p.drawn = d; else delete p.drawn;
  return true;

}
// Pages that came as links only (0.30.3), saved here one after another
// like a run, each into its place in the library. In a browser only
// Wikipedia can be fetched, so the rest wait for the app.
async function saveFromLinks(list, label) {
  if (linksStopped) return;
  // One already saved here under the same address is left to sync, which
  // keeps one copy of each (sync.js, oneCopyEach).
  const jobs = list.filter((m) => m.url && (C.platform.native || C.save.wikipediaPage(m.url))
    && !state.pages.some((p) => p.id === m.id) && !state.saving.some((s) => s.synced && s.synced.id === m.id)
    && !savedAs(m.url) && !(m.requested && savedAs(m.requested)) && !savingAs(m.url))
    .map((m) => ({ ...newJob(m.url, null), key: "sync:" + m.id, synced: m, mode: m.mode, kind: m.comic ? "comic" : "article", waiting: true }));
  if (!jobs.length) return;
  const run = jobs.length > 1 ? Object.assign(startRun(null, jobs[0].site, jobs.length), { label: label || t("From sync"), sync: true, paused: !label && C.sync.paused }) : null;
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
  return C.sync.on ? [C.sync.oldToken ? syncNewToken() : null, syncState(), syncsList(), syncActivity(), syncWhat(), syncShare(), syncLeave()] : [syncSteps(), syncJoin()];
}
async function connectSync(text, btn) {
  if (btn) { btn.disabled = true; btn.textContent = t("Connecting…"); }
  try {
    await C.sync.connect(text);
  } catch (e) {
    if (btn) { btn.disabled = false; btn.textContent = t("Connect"); }
    return e instanceof C.sync.SyncError ? e.message : t("Couldn't connect. Try again.");
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
    placeholder: t("github_pat_… or a setup link"), "aria-label": t("GitHub token or setup link") });
  const note = el("p", { class: "choice-note warn", role: "status" });
  const go = el("button", { class: "btn-primary", type: "button" }, t("Connect"));
  const connect = async () => { note.textContent = (await connectSync(input.value, go)) || ""; };
  go.addEventListener("click", connect);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } });
  return section(t("Sync with GitHub"), t("Keeps your clips, feeds and newsletters the same on every device, through a private repo on your GitHub. Files read from outside stay on their device; your place and highlights in them sync. The token stays on this device and goes only to GitHub; made for waypage-data only, it can't touch anything else on your account. Sync stops if that repo is ever made public."),
    el("div", { class: "group" },
      outRow("https://github.com/signup", "1", t("Make a free GitHub account"), t("Skip this if you have one")),
      outRow(C.sync.NEW_REPO_URL, "2", t("Make a private repo for your library"), t("GitHub fills it in: keep it Private, then Create")),
      outRow(C.sync.KEY_URL, "3", t("Make a token for that repo only"), t("Only select repositories › waypage-data, then Generate and copy")),
      el("div", { class: "row sync-step sync-paste" },
        el("span", { class: "step-num", "aria-hidden": "true" }, "4"),
        el("div", { class: "choice-text" },
          el("span", { class: "choice-label" }, t("Paste it here")),
          input, go, note))));
}
// A token made under the old steps reaches every repo on the account
// (1.30.1): swapped here for one made for waypage-data alone, without
// leaving sync. Another device using the old token asks again once the
// old one is deleted.
function syncNewToken() {
  const input = el("input", { class: "feed-input", type: "password", autocomplete: "off", spellcheck: "false",
    placeholder: "github_pat_…", "aria-label": t("New GitHub token") });
  const note = el("p", { class: "choice-note warn", role: "status" });
  const go = el("button", { class: "btn-primary", type: "button" }, t("Connect"));
  const connect = async () => {
    if (C.sync.tokenIn(input.value)) { note.textContent = t("Paste a new token, not a setup link."); return; }
    note.textContent = (await connectSync(input.value, go)) || "";
  };
  go.addEventListener("click", connect);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); connect(); } });
  return section(t("Make a safer token"), t("This device's token can change every repo on your GitHub. If it ever got out, all of them would be open. A token for waypage-data alone can't touch anything else."),
    el("div", { class: "group" },
      outRow(C.sync.KEY_URL, "1", t("Make a token for waypage-data only"), t("Only select repositories › waypage-data, then Generate and copy")),
      el("div", { class: "row sync-step sync-paste" },
        el("span", { class: "step-num", "aria-hidden": "true" }, "2"),
        el("div", { class: "choice-text" },
          el("span", { class: "choice-label" }, t("Paste it here")),
          input, go, note)),
      outRow("https://github.com/settings/personal-access-tokens", "3", t("Delete the old token"), t("In GitHub's Fine-grained tokens; other devices then ask for the new one"))));
}
function syncJoin() {
  const scan = C.platform.canScan ? el("button", { class: "row", type: "button", onclick: scanSync },
    el("span", { class: "row-label accent" }, t("Scan its setup code"))) : null;
  return section(t("Already syncing on another device?"), t("The setup code and link are on that device, in Settings › GitHub sync › Add another device. {x}", { x: scan ? t("Scan the code here, or paste the link in step 4.") : t("Open its setup link here, or paste it in step 4.") }),
    scan ? el("div", { class: "group" }, scan) : el("div", { class: "group" }, el("div", { class: "row" }, el("span", { class: "row-label muted" }, t("Paste its setup link in step 4")))));
}
async function scanSync() {
  let text = null;
  try { text = await C.platform.scanQr(() => toast(t("Getting the scanner ready…"))); }
  catch (e) { toast(t("Couldn't scan. Paste the setup link in step 4 instead.")); return; }
  if (!text) return;
  if (!C.sync.tokenIn(text)) { toast(t("That isn't a Waypage setup code. Show the one in Settings, Sync on a synced device.")); return; }
  const err = await connectSync(text);
  if (err) toast(err);
}
// What a sync is doing, and what this device does after it (0.30.3):
// pages saved from their links, pictures fetched.
function syncProgress() {
  const p = C.sync.progress;
  if (!C.sync.running || !p) return { text: t("Syncing…"), part: null };
  if (p.stage === "up") return { text: t("Sending clips, {done} of {total}", { done: p.done, total: p.total }), part: p.total ? p.done / p.total : null };
  if (p.stage === "down") return { text: t("Bringing clips in, {done} of {total}", { done: p.done, total: p.total }), part: p.total ? p.done / p.total : null };
  return { text: t("Checking GitHub…"), part: null };
}
function syncNote() {
  if (!C.sync.on || C.sync.paused) return null;
  if (C.sync.running) {
    const p = C.sync.progress, now = syncProgress();
    return { title: t("Syncing your library"), text: now.text, done: p && p.total ? p.done : 0, total: p && p.total ? p.total : 0 };
  }
  const left = syncQueue.length + (fetchingPictures ? 1 : 0);
  if (left) return { title: t("Syncing your library"), text: t("Getting pictures for {clips}", { clips: countLine(left) }), done: 0, total: 0 };
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
  const label = running ? t("Sync: {what}", { what: C.sync.running ? now.text : syncNote().text })
    : backing ? t("Sync: backing up to Google Drive")
    : !on ? t("Sync")
    : C.sync.paused ? t("Sync: paused") : held ? t("Sync: waiting for Wi-Fi")
    : failed ? t("Sync: {what}", { what: C.sync.last.error }) : syncsPlacesOnly() ? t("Sync: places only, clips wait for Wi-Fi") : C.sync.last.at ? t("Sync: synced {when}", { when: whenText(C.sync.last.at) }) : t("Sync: not synced yet");
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
  return [syncLabel, syncsPlacesOnly(), C.sync.paused, C.sync.last.at, C.sync.last.error, syncAfter(), C.drive.on, l.at, l.error,
    r ? [r.restore, r.paused, r.stopped, !!r.merging].join() : ""].join("|");
}

function syncAfter() {
  const saving = state.saving.filter((s) => s.synced && !s.error).length;
  const failed = state.saving.filter((s) => s.synced && s.error).length;
  const pictures = syncQueue.length + (fetchingPictures ? 1 : 0);
  return [saving ? t("Saving {clips} from their links", { clips: countLine(saving) }) : "",
    failed ? t("{n} couldn't be saved, see Downloads", { n: failed }) : "",
    pictures ? t("Getting pictures for {clips}", { clips: countLine(pictures) }) : ""].filter(Boolean).join(" · ");
}
// Sync's one line: what it's doing, or when it last ran.
function syncLine(last, now, paused, running) {
  const since = last.at ? ". " + t("Last synced {when}", { when: whenText(last.at) }) : "";
  if (running) return now.text;
  if (paused) return t("Paused") + since;
  if (waitsForWifi(DATA_SYNC_KEY)) return t("Waiting for Wi-Fi") + since;
  if (last.error) return last.error;
  if (syncsPlacesOnly()) return (last.light ? t("Places synced {when}", { when: whenText(last.at) }) : t("On mobile data")) + ". " + t("Clips wait for Wi-Fi");
  return last.at ? t("Synced {when}", { when: whenText(last.at) }) : t("Not synced yet");
}
function syncState() {
  const last = C.sync.last;
  const now = syncProgress();
  const paused = C.sync.paused;
  const status = syncLine(last, now, paused, C.sync.running);
  const after = C.sync.running ? "" : syncAfter();
  return section(t("Sync with GitHub"), t("Syncs when Waypage opens, after a change, and every few minutes while it's open. Pausing stops at the next clip and picks up where it left off; nothing syncs until you resume, and what synced before stays."),
    el("div", { class: "group" },
      el("div", { class: "row sync-status" }, el("span", { class: "choice-text" },
        el("span", { class: "row-label" }, C.sync.account),
        el("span", { class: "choice-note" + (last.error && !C.sync.running ? " warn" : ""), role: "status" }, status),
        after ? el("span", { class: "choice-note accent" }, after) : null,
        C.sync.running ? el("span", { class: "progress thin" + (now.part == null ? " busy" : ""), "aria-hidden": "true" },
          el("span", { class: "progress-fill", style: "transform: scaleX(" + (now.part == null ? 1 : now.part) + ")" })) : null)),
      syncSpace(),
      paused ? null : el("button", { class: "row", type: "button", ...(C.sync.running ? { disabled: "" } : {}), onclick: () => syncNow(false) },
        el("span", { class: "row-label accent" }, t("Sync now"))),
      el("button", { class: "row", type: "button", onclick: () => pauseSync(!paused) },
        el("span", { class: "row-label accent" }, paused ? t("Resume syncing") : t("Pause syncing"))),
      navRow(t("Sync history"), t("Earlier versions of your library, and putting one back"), () => openSection("syncHistory", false, true))));
}
// How much room the repo has left (2026-11), against GitHub's 5 GB.
function syncSpace() {
  C.sync.space().then((changed) => { if (changed && state.section === "sync") renderSection(); });
  const used = C.sync.used;
  if (used == null) return null;
  const part = Math.min(1, used / C.sync.SPACE);
  const left = Math.max(0, C.sync.SPACE - used);
  return el("div", { class: "row sync-space" }, el("span", { class: "choice-text" },
    el("span", { class: "choice-label" }, t("{formatSize} left", { formatSize: formatSize(left) })),
    el("span", { class: "choice-note" + (part > 0.9 ? " warn" : "") }, t("{formatSize} of {formatSize2} used", { formatSize: formatSize(Math.max(used, 1000)), formatSize2: formatSize(C.sync.SPACE) })),
    el("span", { class: "progress thin", role: "progressbar", "aria-label": t("Space used on GitHub"), "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(part * 100)) },
      el("span", { class: "progress-fill", style: "transform: scaleX(" + part + ")" }))));
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
  if (!confirm(t("Disconnect from GitHub? Your clips stay on this {x} and on GitHub. To sync again you'll need a setup code or a token.", { x: C.platform.native ? t("phone") : t("browser") }))) return;
  for (const r of runs) if (r.sync) stopRun(r);
  syncQueue = [];
  keepQueue();
  C.sync.disconnect();
  renderSection();
  paintDownloads();
  toast(t("Disconnected. Your clips stay here and on GitHub."));
}
function syncLeave() {
  return section(t("Connection"), t("Disconnecting forgets the token on this device. Your clips stay here and on GitHub."),
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: disconnectSync }, el("span", { class: "row-label warn" }, t("Disconnect from GitHub")))));
}
// ---- Sync history ----
// Each library write is a commit on GitHub, so the repo holds every
// earlier version of the library. Putting one back is done here, by hand,
// as the changes it comes to (clips back, clips gone, tags and the rest as
// they were, feeds followed or not), and then synced like any change:
// the merge, the deletions and the other devices all work as they do for
// edits made here. Where you are in each clip and the reading stats stay
// as they are (C.sync.revertPlan).
let historyList = null, historyMore = false, historyPage = 0, historyError = "", historyBusy = false, historyStatus = "";
let reverting = null;   // { text, syncing }: a version is being put back
const historyOpen = new Set();   // shas of the versions folded out
const historyDiff = new Map();   // sha -> { busy } | { error } | { plan, view }
const historyReset = () => { historyList = null; historyMore = false; historyPage = 0; historyError = ""; historyStatus = ""; historyOpen.clear(); historyDiff.clear(); };
// This device's clips as sync sees them, and what to ask revertPlan.
function historyView() {
  const what = C.sync.what;
  const view = state.pages.filter((p) => !p.link).map((p) => C.sync.share(C.backup.cleanMeta(p, p.id) || p));
  return { view, opts: { feeds, skipNote: !what.notes, skipFeed: (u) => (isMail({ url: u }) ? !what.newsletters : !what.feeds) } };
}
// What a put-back does, in words: "2 clips come back, 1 saved since is deleted".
function historyParts(plan) {
  const isNote = (id) => { const p = state.pages.find((x) => x.id === id); return !!(p && p.note); };
  const said = (list, noteOf) => {
    const notes = list.filter(noteOf).length, clips = list.length - notes;
    return { n: list.length, who: i18n.join([clips ? countLine(clips) : "", notes ? tn(notes, "1 note", "{n} notes") : ""].filter(Boolean)) };
  };
  const back = said(plan.back, (m) => m.note), drop = said(plan.drop, isNote), change = said(plan.change, (c) => c.note);
  return [back.n ? tn(back.n, "{who} comes back", "{who} come back", { who: back.who }) : "",
    drop.n ? tn(drop.n, "{who} saved since is deleted", "{who} saved since are deleted", { who: drop.who }) : "",
    change.n ? tn(change.n, "{who} changes", "{who} change", { who: change.who }) : "",
    plan.followed ? tn(plan.followed, "1 feed is followed again", "{n} feeds are followed again") : "",
    plan.unfollowed ? tn(plan.unfollowed, "1 feed is unfollowed", "{n} feeds are unfollowed") : ""].filter(Boolean);
}
// For each changed note, what its sheets and strokes would do: read here and
// from that version, the first few only. c.detail stays unset when a read fails.
async function historyNotes(plan, T, sha) {
  for (const c of plan.change.filter((x) => x.note && x.text).slice(0, 20)) {
    try {
      const names = (T.files[c.id] && T.files[c.id].note) || {};
      if (!names["note.json"]) continue;
      const mine = await C.store.readNote(c.id), ink = await C.store.readInk(c.id);
      const then = JSON.parse(await C.sync.readText("notes/" + c.id + "/note.json", sha));
      const rawInk = names["ink.json"] ? await C.sync.readText("notes/" + c.id + "/ink.json", sha) : null;
      const thenInk = rawInk ? JSON.parse(rawInk) : null;
      c.detail = { sheets: [((mine && mine.sheets) || []).length, ((then && then.sheets) || []).length], ink: C.sync.inkDiff(ink && ink.pages, thenInk && thenInk.pages) };
    } catch (err) { /* the row says it as a whole */ }
  }
}
const strokesText = (here, then) => [here ? t("{n} new here", { n: here }) : "", then ? t("{n} erased since", { n: then }) : ""].filter(Boolean).join(", ");
// A dry run of the put-back under a version's row: reads that version from
// GitHub and works out the plan, and changes nothing here.
async function historyLook(e) {
  if (historyDiff.has(e.sha)) return;
  const mine = { busy: true };
  historyDiff.set(e.sha, mine);
  let got;
  try {
    const T = await C.sync.target(e.sha);
    const { view, opts } = historyView();
    got = { plan: C.sync.revertPlan(view, T, opts), view };
    await historyNotes(got.plan, T, e.sha);
  } catch (err) {
    got = { error: err instanceof C.sync.SyncError ? err.message : t("Couldn't read that version.") };
    if (!(err instanceof C.sync.SyncError)) console.error(err);
  }
  if (historyDiff.get(e.sha) !== mine) return;
  historyDiff.set(e.sha, got);
  if (state.section === "syncHistory") renderSection();
}
const HISTORY_SHOWN = 20;
function historyDiffRows(e) {
  const d = historyDiff.get(e.sha);
  const plain = (t, cls) => el("div", { class: "row" }, el("span", { class: "row-label " + (cls || "muted") }, t));
  if (!d || d.busy) return [plain(t("Looking on GitHub…"))];
  if (d.error) return [el("button", { class: "row", type: "button", onclick: () => { historyDiff.delete(e.sha); historyDiffFill(e); historyLook(e); } },
    el("span", { class: "row-label warn" }, t("{error} Try again", { error: d.error })))];
  const p = d.plan;
  if (!historyParts(p).length) return [plain(t("Same as your library now"))];
  const item = (title, note) => el("div", { class: "row" }, el("span", { class: "choice-text" },
    el("span", { class: "row-label", dir: "auto" }, title || t("Untitled")), note ? el("span", { class: "choice-note", dir: "auto" }, note) : null));
  const out = [];
  const group = (label, items) => {
    if (!items.length) return;
    out.push(el("div", { class: "history-head" }, label));
    for (const it of items.slice(0, HISTORY_SHOWN)) out.push(item(it.title, it.note));
    if (items.length > HISTORY_SHOWN) out.push(plain(t("and {n} more", { n: items.length - HISTORY_SHOWN })));
  };
  const hereBy = new Map(d.view.map((x) => [x.id, x]));
  const none = (v) => v || t("none");
  const says = (c) => {
    const h = hereBy.get(c.id) || {};
    const word = {
      text: () => (c.note ? "" : t("Text: the version from then")), title: (x) => t("Title: {was} → {now}", { was: x.was, now: x.now }),
      tags: (x) => t("Tags: {was} → {now}", { was: none(x.was.join(", ")), now: none(x.now.join(", ")) }),
      folder: (x) => t("Collection: {was} → {now}", { was: none(x.was), now: none(x.now) }), fav: (x) => (x.now ? t("Favourite: on") : t("Favourite: off")),
      marks: (x) => t("Highlights: {was} → {now}", { was: x.was, now: x.now }), ink: (x) => t("Drawings: {what}", { what: strokesText(x.here, x.then) }), other: () => t("Other details") };
    const lines = C.sync.revertChanges(h, c.next, c.text).map((x) => word[x.field](x)).filter(Boolean);
    if (c.note && c.text) {
      const d = c.detail;
      if (!d) lines.unshift(t("The note as it was then"));
      else {
        if (d.sheets[0] !== d.sheets[1]) lines.unshift(t("Sheets: {was} → {now}", { was: d.sheets[0], now: d.sheets[1] }));
        if (d.ink.here || d.ink.then) lines.push(t("Drawings: {what}", { what: strokesText(d.ink.here, d.ink.then) }));
        if (!lines.length) lines.push(t("Typed text or pictures"));
      }
    }
    return lines.join(" · ");
  };
  group(t("Come back"), p.back.map((m) => ({ title: m.title, note: m.note ? t("Note") : "" })));
  group(t("Deleted"), p.drop.map((id) => { const x = state.pages.find((y) => y.id === id) || {}; return { title: x.title, note: x.note ? t("Note") : "" }; }));
  group(t("Change"), p.change.map((c) => ({ title: c.next.title, note: (c.note ? t("Note") + " · " : "") + says(c) })));
  if (p.feeds) {
    const mine = new Set(feeds.map((f) => f.url)), kept = new Set(p.feeds.map((f) => f.url));
    group(t("Followed again"), p.feeds.filter((f) => !mine.has(f.url)).map((f) => ({ title: f.title || f.url })));
    group(t("Unfollowed"), feeds.filter((f) => !kept.has(f.url)).map((f) => ({ title: f.title || f.url })));
  }
  out.push(el("p", { class: "footnote history-note" }, t("Compared with this device's library now. Where you are in each clip isn't compared.")));
  return out;
}
// Fills a version's fold-out in place, where it is on screen.
function historyDiffFill(e) {
  const box = document.getElementById("history-" + e.sha);
  if (box) box.replaceChildren(...historyDiffRows(e));
}
// Why history can't be used now, or "".
function historyWhy() {
  if (!C.sync.on) return t("Turn on GitHub sync to see earlier versions of your library.");
  if (C.sync.paused) return t("Sync is paused. Resume it to see earlier versions.");
  if (!C.sync.what.clips) return t("This device doesn't sync Clips. Turn Clips on under What this device syncs to use history.");
  if (C.sync.links) return t("This device syncs Links only. History needs Clips too, since it brings clips' text back.");
  return "";
}
// A page of the commits, and more until one shows a version that differs:
// saves that changed nothing are left out (C.sync.distinct). Older commits
// with no print in their message are read once to compare, three at a time.
async function historyLoad(more) {
  if (historyBusy) return;
  historyBusy = true;
  historyError = "";
  historyStatus = "";
  if (state.section === "syncHistory") renderSection();
  try {
    const before = more && historyList ? C.sync.distinct(historyList).length : 1;
    for (let tries = 0; tries < 3; tries++) {
      const got = await C.sync.history(historyPage + 1);
      historyPage++;
      const todo = got.list.filter((e) => !e.print);
      for (let i = 0; i < todo.length; i += 3) {
        historyStatus = t("Comparing versions, {done} of {total}", { done: Math.min(i + 3, todo.length), total: todo.length });
        if (state.section === "syncHistory") renderSection();
        // One that can't be read keeps no print, and so keeps its row.
        await Promise.all(todo.slice(i, i + 3).map((e) => C.sync.printOf(e.sha).then((p) => { e.print = p; }, () => {})));
      }
      historyList = (more || tries ? historyList || [] : []).concat(got.list);
      historyMore = got.more;
      if (!got.more || C.sync.distinct(historyList).length > before) break;
    }
  } catch (e) {
    historyError = e instanceof C.sync.SyncError ? e.message : t("Couldn't read the history. Try again.");
    if (!(e instanceof C.sync.SyncError)) console.error(e);
  }
  historyStatus = "";
  historyBusy = false;
  if (state.section === "syncHistory") renderSection();
}
function historySections() {
  const why = historyWhy();
  // Loaded when its screen is open, not when Settings' search reads it.
  if (!why && state.section === "syncHistory" && !historyList && !historyError && !historyBusy) historyLoad(false);
  const off = reverting || historyBusy ? { disabled: "" } : {};
  const note = (e) => [e.kind === "feeds" ? t("Feeds changed") : e.kind === "back" ? t("Put back to {when}", { when: e.back }) : e.clips != null ? countLine(e.clips) : "",
    e.device ? t("from {device}", { device: e.device }) : ""].filter(Boolean).join(" · ");
  // Tap the version to see what it would change; only Put back puts it back.
  const rows = C.sync.distinct(historyList || []).flatMap((e, i) => {
    const text = el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, driveWhen(e.at)), el("span", { class: "choice-note" }, note(e)));
    if (i === 0) return [el("div", { class: "row" }, text, el("span", { class: "row-value" }, t("Now")))];
    const open = historyOpen.has(e.sha), id = "history-" + e.sha;
    const diff = el("div", { class: "history-diff", id });
    diff.hidden = !open;
    if (open) diff.append(...historyDiffRows(e));
    const fold = el("button", { class: "history-fold", type: "button", "aria-expanded": String(open), "aria-controls": id,
      onclick: () => {
        const now = !historyOpen.has(e.sha);
        if (now) historyOpen.add(e.sha); else historyOpen.delete(e.sha);
        fold.setAttribute("aria-expanded", String(now));
        diff.hidden = !now;
        if (now) { diff.replaceChildren(...historyDiffRows(e)); historyLook(e); }
      } },
      text, el("span", { class: "row-chev", "aria-hidden": "true" }, "›"));
    return [el("div", { class: "row history-row" }, fold,
      el("button", { class: "history-put", type: "button", ...off, onclick: () => syncRevert(e) }, t("Put back"))), diff];
  });
  const status = reverting ? [el("div", { class: "row" }, el("span", { class: "choice-text" },
    el("span", { class: "choice-label" }, reverting.text),
    el("span", { class: "progress thin busy", "aria-hidden": "true" }, el("span", { class: "progress-fill", style: "transform: scaleX(1)" }))))] : [];
  const rest = why ? [el("div", { class: "row" }, el("span", { class: "row-label muted" }, why))]
    : historyError ? [el("button", { class: "row", type: "button", onclick: () => historyLoad(!!historyList) }, el("span", { class: "row-label warn" }, t("{historyError} Try again", { historyError: historyError })))]
    : !historyList ? [el("div", { class: "row" }, el("span", { class: "row-label" }, historyStatus || t("Looking on GitHub…")))]
    : rows.length <= 1 && !historyMore ? [el("div", { class: "row" }, el("span", { class: "row-label" }, t("No earlier versions with changes yet")))]
    : [];
  return [section(t("Sync history"), null,
    el("div", { class: "group" }, ...status, ...rows, ...rest,
      !why && historyMore && !historyError ? el("button", { class: "row", type: "button", ...off, onclick: () => historyLoad(true) },
        el("span", { class: "row-label accent" }, historyBusy ? historyStatus || t("Looking…") : t("Show older"))) : null),
    el("p", { class: "footnote" }, t("Each time your library changed, GitHub kept a copy. Tap a version to see what it would change. Versions that changed nothing are left out. Putting one back makes your library as it was then, on every device: clips deleted since come back, clips saved since are deleted, and tags, collections, favourites, highlights and feeds go back too. Notes and drawings go back too. Where you are in each clip and your reading stats stay as they are. A clip deleted this way stays in history, so you can put a later version back from this list.{x}", { x: C.sync.what.notes ? "" : t(" This device doesn't sync Notes, so it leaves them as they are.") })))];
}
async function syncRevert(e) {
  if (reverting || historyWhy()) return;
  if (state.open) { toast(t("Close the clip you're reading, then put the library back.")); return; }
  if (!navigator.onLine) { toast(t("You're offline. Connect to put the library back.")); return; }
  const when = driveWhen(e.at);
  reverting = { text: t("Checking GitHub…"), syncing: true };
  renderSection();
  const say = (t) => { reverting.text = t; if (state.section === "syncHistory") renderSection(); };
  const fail = (msg) => { reverting = null; toast(msg); if (state.section === "syncHistory") renderSection(); };
  let plan, T;
  try {
    // Level with GitHub first, so this device's own changes since the last
    // sync are sent, and aren't taken for part of the put-back.
    await syncNow(true);
    if (C.sync.last.error) return fail(C.sync.last.error);
    T = await C.sync.target(e.sha);
    const { view, opts } = historyView();
    plan = C.sync.revertPlan(view, T, opts);
  } catch (err) {
    return fail(err instanceof C.sync.SyncError ? err.message : t("Couldn't read that version. Try again."));
  }
  const parts = historyParts(plan);
  if (!parts.length) { reverting = null; toast(t("Your library is already as it was then.")); if (state.section === "syncHistory") renderSection(); return; }
  if (!confirm(t("Put your library back as it was on {when}?\n\n{join}.\n\nYour other devices follow when they sync. Where you are in each clip stays as it is.", { when: when, join: parts.join(", ") }))) {
    reverting = null;
    if (state.section === "syncHistory") renderSection();
    return;
  }
  reverting.syncing = false;
  // All the text first, so a connection lost part way changes nothing.
  const want = plan.back.map((m) => ({ meta: m, have: null })).concat(plan.change.filter((c) => c.text).map((c) => ({ meta: c.next, have: state.pages.find((p) => p.id === c.id) })));
  const html = new Map(), noteData = new Map(), inkBase = new Map();
  try {
    // GitHub's own copy of a note's strokes is what the next sync compares with,
    // so it is the base: the old strokes then go up instead of merging with new ones.
    const head = want.some((w) => w.meta.note && w.have) ? await C.sync.target() : null;
    for (const [i, w] of want.entries()) {
      say(t("Bringing clips back, {i} of {n}", { i: i + 1, n: want.length }));
      html.set(w.meta.id, await C.sync.readText("pages/" + w.meta.id + ".html", e.sha));
      if (!w.meta.note) continue;
      const id = w.meta.id, names = T.files[id] && T.files[id].note;
      const got = await C.sync.noteFilesIn(id, names, e.sha);
      noteData.set(id, got);
      const at = head && head.files[id] && head.files[id].note;
      if (got && w.have && at && at["ink.json"]) {
        const text = await C.sync.readText("notes/" + id + "/ink.json");
        if (text) inkBase.set(id, { pages: JSON.parse(text).pages || {}, sha: at["ink.json"] });
      }
    }
  } catch (err) {
    return fail(err instanceof C.sync.SyncError ? err.message : t("Couldn't bring the clips back. Nothing was changed."));
  }
  say(t("Putting it back…"));
  const fromLinks = [], pictures = [], skipped = [];
  const written = new Map(), live = new Map(state.pages.map((p) => [p.id, p]));
  try {
    for (const w of want) {
      const text = html.get(w.meta.id);
      // No text kept for it on GitHub: saved again from its link, or left as it is.
      if (!text || (w.meta.note && !noteData.get(w.meta.id))) { if (w.have) skipped.push(w.meta.id); else if (w.meta.url && !w.meta.note) fromLinks.push(w.meta); continue; }
      if (w.have) await C.store.removePage(w.meta.id);
      const got = await C.sync.incoming(text, w.meta, e.sha);
      const meta = { ...w.meta, missing: got.missing };
      meta.bytes = await C.store.writePage(w.meta.id, got.html, meta);
      if (w.meta.note) {
        meta.bytes += await C.sync.noteFilesKeep(w.meta.id, noteData.get(w.meta.id));
        await C.store.writeInkBase(w.meta.id, inkBase.get(w.meta.id) || null);
      }
      written.set(w.meta.id, meta);
      if (got.missing) pictures.push(w.meta.id);
    }
    const gone = new Set(plan.drop);
    const edits = new Map(plan.change.map((c) => [c.id, c.next]));
    const next = [];
    for (const p of state.pages) {
      if (gone.has(p.id)) continue;
      const m = written.get(p.id);
      const edit = edits.get(p.id);
      if (m) { for (const k of Object.keys(p)) if (!(k in m)) delete p[k]; Object.assign(p, m); }
      else if (edit && !skipped.includes(p.id)) {
        // What came with the clip stays; what is its own is set as it was.
        const was = C.sync.share(C.backup.cleanMeta(p, p.id) || p);
        for (const k of Object.keys(was)) if (!(k in edit)) delete p[k];
        Object.assign(p, edit);
      }
      next.push(p);
    }
    for (const m of plan.back) if (written.has(m.id) && !live.has(m.id)) next.push(written.get(m.id));
    next.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    state.pages = next;
    await C.store.writeIndex(state.pages);
    for (const id of plan.drop) await C.store.removePage(id);
    if (plan.feeds) syncedFeeds(plan.feeds);
    texts.clear();
    await loadThumbs();
    C.store.keepStored();
    renderLibrary();
    if (state.folder) renderFolder();
    updateWidgets();
  } catch (err) {
    console.error(err);
    reverting = null;
    historyReset();
    if (state.section === "syncHistory") renderSection();
    toast(t("Couldn't put the library back. Some clips may have changed; syncing will bring the rest."));
    syncNow(true);
    return;
  }
  if (pictures.length) { syncQueue.push(...pictures); keepQueue(); }
  if (fromLinks.length) saveFromLinks(fromLinks, t("From sync history"));
  // Sent like any change of this device's, with a commit that says so.
  say(t("Syncing it…"));
  C.sync.note = when;
  unsynced = true;
  reverting.syncing = true;
  await syncNow(true);
  reverting = null;
  historyReset();
  fetchPictures();
  if (state.section === "syncHistory") renderSection();
  else if (state.section === "sync") renderSection();
  toast(C.sync.last.error ? t("Put back here. It goes to your other devices with the next sync.")
    : t("Library put back to {when}.", { when }) + (skipped.length ? " " + tn(skipped.length, "1 clip kept as it was, its old text isn't on GitHub.", "{n} clips kept as they were, their old text isn't on GitHub.") : ""));
}
// Pages too, or links only: the library and its marks always sync.
// What this device syncs (1.47.0): switches, like Google Drive's What
// goes in, with Links only under Clips (0.30.3).
function syncsList() {
  const what = C.sync.what;
  const sw = (key, label, note) => el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, label), el("span", { class: "choice-note" }, note)),
    el("input", { class: "switch", type: "checkbox", role: "switch", checked: !!what[key],
      onchange: (e) => { C.sync.setWhat(key, e.target.checked); renderSection(); syncSoon(500); } }));
  return section(t("What this device syncs"), t("Clips go with their highlights, tags, collections, favourites and where you were. With Clips too, each clip's text goes up, so another device gets it as you saved it even if the site changes; pictures come from the clip's site, or from GitHub when it has none, up to 100 MB a clip. With Links only, clips new to a device are saved again from their links, so one that changed or went away comes back different or not at all. A part turned off here is left as it is on GitHub for your other devices. Notes go up whole, with the PDF one was made from (up to 50 MB); what two devices wrote on one note is kept from both. A file read from outside stays on its device, but your place, highlights, tags and reading time in it sync to the same file on your other devices. Watched folders and settings don't sync.{x}", { x: C.platform.knowsConnection ? t(" On mobile data, Places and reading time only moves where you are in each clip, what you finished and your reading time on any connection, while new clips, tags and collections wait for Wi-Fi.") : "" }),
    el("div", { class: "group" },
      sw("clips", t("Clips"), C.sync.links ? t("Links, highlights, tags, collections and places") : t("Text, highlights, tags, collections and places")),
      what.clips ? el("div", { class: "row" }, seg("sync-what", t("What goes up of each clip"), [{ value: "pages", label: t("Clips too") }, { value: "links", label: t("Links only") }],
        C.sync.links ? "links" : "pages", (v) => { C.sync.links = v === "links"; renderSection(); syncSoon(500); })) : null,
      sw("notes", t("Notes"), t("Pages and highlights. Over 50 MB can't be synced")),
      sw("feeds", t("Feeds"), t("Which you follow and how")),
      sw("newsletters", t("Newsletters"), t("Your addresses and how they're set")),
      sw("stats", t("Reading stats"), t("Reading time from every device, added up")),
      C.ext.on("anki") ? sw("anki", t("Anki"), t("Decks, cards and reviews from every device")) : null,
      dataRow(DATA_SYNC_KEY, t("Sync"), t("Everything, on any connection"), t("Changes wait until then"),
        { value: "places", label: t("Places and reading time only"), note: t("Clips, tags and collections wait for Wi-Fi") })));
}
// Share reading activity (2026-11): activity/reading.json for other apps
// that read this repo, with which kinds go in it.
const SHARE_KINDS = [["book", t("Books"), "EPUB, PDF, MOBI, AZW3 and FB2 files"], ["audiobook", t("Audiobooks"), t("Listening time apart from reading")],
  ["comic", t("Comics"), t("CBZ files and clips saved as comics")], ["serial", t("Serials"), t("Collections that follow a story's new chapters")], ["article", t("Articles"), t("Web clips")]];
function syncActivity() {
  const on = C.sync.what.activity, kinds = C.sync.shareKinds;
  const sw = (label, note, checked, set) => switchRow(label, note, checked, (v) => { set(v); renderSection(); syncSoon(500); });
  return section(t("Other apps"), t("Other apps you connect to your {x} repo can read what you've read: titles, authors, how far you are, when you started and finished, and your minutes a day. It goes only to that repo, as activity/reading.json; no text, highlights or notes. A clip's ⋯ or a collection's Edit can keep it out. Turned off, the file is removed at the next sync. Each device has its own switch.", { x: C.sync.account.split("/")[1] }),
    el("div", { class: "group" },
      sw(t("Share reading activity"), "", on, (v) => C.sync.setWhat("activity", v)),
      ...(on ? SHARE_KINDS.map(([k, label, note]) => sw(label, note, !!kinds[k], (v) => C.sync.setShareKind(k, v))) : [])));
}
function syncWhat() {
  return section(t("This device"), null,
    el("div", { class: "group" },
      el("div", { class: "rc-list" },
        el("div", { class: "rc-row stack" }, el("label", { class: "rc-label", for: "deviceName" }, t("This device's name")),
          el("input", { class: "feed-input", id: "deviceName", type: "text", maxlength: "40", autocomplete: "off",
            value: load(DEVICE_KEY, ""), placeholder: guessedName().replace(/^./, (c) => c.toUpperCase()),
            onchange: (e) => store(DEVICE_KEY, e.target.value.trim().slice(0, 40)) })))),
    el("p", { class: "footnote" }, t("Shows on your other devices when this one read a clip further.")));
}
// The setup link points at the web copy: inside the app this page is at
// https://localhost, which no other device can open. The app's scanner
// reads only the token from it.
function syncShare() {
  const link = C.sync.setupLink(C.platform.webUrl() || location.origin + location.pathname);
  const encoder = window.Keel && window.Keel.qr;
  const svg = encoder && encoder.fits(link) ? encoder.svg(link, { size: 200 }) : null;
  const qr = svg ? el("div", { class: "sync-qr", role: "img", "aria-label": t("Setup code") }) : null;
  if (qr) qr.innerHTML = svg;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast(t("Setup link copied. Only send it to yourself.")); }
    catch (e) { toast(t("Couldn't copy the link.")); }
  };
  return section(t("Add another device"), t("In Waypage on the other device, go to Settings › GitHub sync and scan this code, or paste the link there. A phone's camera opens it in the web copy instead."),
    el("div", { class: "group" },
      qr,
      el("button", { class: "row", type: "button", onclick: copy }, el("span", { class: "row-label accent" }, t("Copy setup link")))),
    el("p", { class: "footnote warn" }, t("The code and link hold your token. Only use them on your own devices.")));
}

// Opening the web copy from a setup link (a phone's camera on the code)
// turns sync on there. The token leaves the address bar first.
async function takeSetupLink() {
  if (!C.sync.tokenIn(location.hash)) return;
  const hash = location.hash;
  history.replaceState(history.state, "", location.pathname + location.search);
  if (C.sync.on) return;
  const err = await connectSync(hash);
  toast(err || t("Sync is on. Your library is on its way."));
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
  if (!from) { toast(t("Nothing came through: this site keeps other windows out. Save it on your phone instead.")); return; }
  const hear = (e) => {
    const d = e.data;
    if (e.source !== from || !d || d.waypage !== "page" || typeof d.url !== "string" || typeof d.html !== "string") return;
    removeEventListener("message", hear);
    clearTimeout(late);
    let url = null;
    try { url = new URL(d.url); } catch (x) { /* not an address */ }
    if (!url || !/^https?:$/.test(url.protocol) || url.origin !== e.origin) { toast(t("That page couldn't be sent.")); return; }
    if (d.html.length > SEND_MAX) { toast(t("That page is too big to send.")); return; }
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
        el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, t("Save this page")),
          el("span", { class: "choice-note" }, t("As your browser shows it, signed in too. Its pictures stay links on this computer.")))),
      el("button", { class: "row", type: "button", onclick: () => answer(false) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, t("Don't save"))))));
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
const PICTURE_MODES = [{ value: "previews", label: t("Previews") }, { value: "full", label: t("Full size") }, { value: "links", label: t("Links") }];
function picturesRow(p, redraw) {
  if (!C.platform.native || !p.images) return null;
  const note = el("p", { class: "footnote pictures-note", role: "status" }, savedNote(p));
  return el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, t("Pictures")),
    seg("pictures-" + p.id, t("Pictures"), PICTURE_MODES, p.mode || "previews", (v) => changePictures(p, v, note, redraw)),
    note);
}

let changingPictures = false;
async function changePictures(p, mode, note, redraw) {
  if (changingPictures) return;
  if (mode !== "links" && !navigator.onLine && (mode === "full" || p.mode === "links")) {
    toast(t("You're offline. Try again when you're back online."));
    redraw();
    return;
  }
  changingPictures = true;
  const word = { previews: t("previews"), full: t("full images"), links: t("links") }[mode];
  note.textContent = t("Keeping {word}…", { word: word });
  let res = null;
  try { res = await C.save.setPictures(p, mode, (done, total) => { note.textContent = t("Keeping {word}, {done} of {total}", { word: word, done: done, total: total }); }); }
  catch (e) { res = null; }
  changingPictures = false;
  if (!res) { toast(t("Couldn't open this clip's file. Try again.")); redraw(); return; }
  Object.assign(p, { mode, missing: res.missing, thumb: res.thumb, bytes: Math.max(0, (p.bytes || 0) + res.bytes) });
  if (p.imageBytes != null) p.imageBytes = Math.max(0, p.imageBytes + res.bytes);
  await C.store.writeIndex(state.pages);
  texts.clear();
  await loadThumbs();
  renderLibrary();
  if (state.folder) renderFolder();
  toast(res.failed ? tn(res.failed, "1 picture couldn't be fetched. It shows online.", "{n} pictures couldn't be fetched. They show online.") : mode === "links" ? t("Pictures are links now. They show when you're online.") : t("Pictures saved as {word}.", { word: word }));
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
// Collections and series (2026-11) in one list, each under its name.
const NEW_SERIES = "\u0000series";
function folderRow(p, redraw) {
  let asSeries = false;
  const input = newField("new-collection", t("Name the new collection"), t("New collection"), (v) => {
    const fresh = !allFolders().some((n) => sameTag(n, cleanTag(v)));
    return setFolder(p, v).then(async () => {
      if (asSeries && fresh) { markSeries(p.folder, true); await C.store.writeIndex(state.pages); renderLibrary(); }
      redraw();
    });
  });
  const names = allFolders().sort((a, b) => a.localeCompare(b));
  const series = names.filter(isSeriesFolder), plain = names.filter((n) => !isSeriesFolder(n));
  const opts = (list) => list.map((n) => ({ value: n, label: n }));
  const pick = dropdown({
    label: t("Part of"), cls: "field-pick",
    options: [{ value: "", label: t("None") },
      ...(series.length && plain.length ? [{ head: t("Collections") }] : []), ...opts(plain),
      ...(series.length ? [{ head: t("Series") }] : []), ...opts(series),
      { value: NEW_PICK, label: t("New collection…") }, { value: NEW_SERIES, label: t("New series…") }],
    value: p.folder && names.find((n) => sameTag(n, p.folder)) || "",
    onpick: (v) => {
      if (v === NEW_PICK || v === NEW_SERIES) {
        asSeries = v === NEW_SERIES;
        input.placeholder = asSeries ? t("Name the new series") : t("Name the new collection");
        input.setAttribute("aria-label", asSeries ? t("New series") : t("New collection"));
        input.hidden = false; input.focus(); return;
      }
      setFolder(p, v || null).then(redraw);
    },
  });
  return el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, t("Part of")),
    el("div", { class: "tag-edit" }, pick, input));
}

function neighbours(p) {
  const prev = neighbour(p, -1), next = neighbour(p, 1);
  if (!prev && !next) return null;
  const step = (q, label) => {
    const b = el("button", { class: "sheet-row step-row", type: "button", onclick: () => q && goTo(q) },
      el("span", { class: "step-over" }, label), el("span", { class: "step-title", dir: "auto" }, q ? q.title : t("None")));
    b.disabled = !q;
    return b;
  };
  return el("div", { class: "step-rows" }, step(prev, t("Previous")), step(next, t("Next")));
}

// ---- Saving several ----
// Opens when a paste or share holds more than one link: the links (one
// a line, editable), the folder to save them into, and Save.

// `from` is the page read as a list of chapters, which can still be
// saved as one page; `siteTags` ({ site, tags }) the tags that page gave it.
function openBatch(text, fromHistory, folder, from, siteTags) {
  if (state.batch) return;
  state.batch = true;
  renderBatch(linksFrom(text).join("\n"), folder || null, from, siteTags);
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

// The site's tags join the picked ones when this is on; off by default,
// and remembered.
const SITE_TAGS_KEY = "waypage.saveSiteTags";
const TAG_NEW_KEY = "waypage.saveTagNew";

function renderBatch(text, preset, from, siteTags) {
  let folder = preset;
  // The page the chapters were read from, kept on the folder (0.26.0).
  let source = from || null;
  let mode = load(IMAGES_KEY, "previews");
  // A comic's folder saves its next chapters as comics too.
  let kind = preset && folderPages(preset).some((p) => p.comic) ? "comic" : "article";
  if (kind === "comic") mode = "full";
  const tags = [];
  let drawTagNew = null;
  const area = el("textarea", { class: "batch-links", rows: "6", "aria-label": t("Links, one a line"), spellcheck: "false",
    autocapitalize: "off", autocomplete: "off", dir: "ltr" });
  area.value = text;
  const count = el("p", { class: "meta batch-count" });
  // Links already saved can be left where they are, or (switched off)
  // moved into this folder at their place in the list.
  const skip = el("input", { class: "switch batch-skip", type: "checkbox", role: "switch", checked: true, onchange: () => sync() });
  const skipNote = el("span", { class: "choice-note" });
  const skipRow = el("div", { class: "group" }, el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, t("Skip links already saved")), skipNote), skip));
  const go = el("button", { class: "btn-primary batch-go", type: "submit" });
  const input = el("input", { class: "tag-input", type: "text", placeholder: t("New collection"), "aria-label": t("New collection"),
    maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
  // One link may be a contents page: its chapters replace it, and the
  // folder takes its name.
  const finder = el("button", { class: "btn-small batch-find", type: "button", onclick: async () => {
    const url = linksFrom(area.value)[0];
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    finder.disabled = true;
    finder.textContent = t("Finding chapters…");
    try {
      const found = await C.save.findChapters(url);
      if (found.links.length) {
        source = found.page || url;
        area.value = found.links.join("\n");
        if (found.siteTags) setSiteTags(found.siteTags);
        if (!folder) choose(folderName(found.title || C.save.siteName(url)));
        sync();
      } else toast(t("Couldn't find a list of chapters on that page."));
    } catch (e) { toast(e instanceof C.save.SaveError ? e.message : t("Couldn't read that page. Try again.")); }
    finder.disabled = false;
    finder.textContent = t("Find chapters on this page");
  } }, t("Find chapters on this page"));
  const sync = () => {
    const links = linksFrom(area.value);
    const had = links.filter((u) => savedAs(u)).length;
    const n = skip.checked ? links.length - had : links.length;
    finder.hidden = links.length !== 1;
    skipRow.hidden = !had;
    skipNote.textContent = had === links.length ? t("All {had} are already saved", { had: had })
      : skip.checked ? t("{had} already saved, left where they are", { had }) : folder ? t("{had} already saved, moved into {folder}", { had, folder }) : t("{had} already saved", { had });
    count.textContent = links.length ? tn(links.length, "1 link", "{n} links") : t("No links yet. Paste them here, one a line.");
    go.textContent = n ? (folder ? t("Save {clips} into {folder}", { clips: countLine(n), folder }) : t("Save {clips}", { clips: countLine(n) })) : links.length ? t("Nothing new to save") : t("Save");
    go.disabled = !n;
    if (drawTagNew) drawTagNew();
  };
  const pick = (f, typed) => { folder = f; if (!typed) input.value = ""; sync(); };
  // The collection: None, one already there, or a new one typed in.
  const NEW = "\u0000new";
  const folderPick = dropdown({ label: t("Collection"), cls: "field-pick batch-folder", value: "",
    options: [{ value: "", label: t("None") }, ...foldersByUse().map((f) => ({ value: f, label: f })), { value: NEW, label: t("New collection…") }],
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
    const tagInput = el("input", { class: "tag-input", type: "text", placeholder: t("New tag"), "aria-label": t("New tag"),
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
    const tagPick = dropdown({ label: t("Add a tag"), placeholder: t("Add a tag"), cls: "field-pick batch-tag", value: null,
      options: [...others.map((t) => ({ value: t, label: t })), { value: NEW, label: t("New tag…") }],
      onpick: (v) => { if (v === NEW) { typing = true; drawTags("input"); } else add(v); } });
    fill(tagBox,
      tags.length ? el("div", { class: "chips" },
        ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": i18n.t("Remove tag {t}", { t: t }),
          onclick: () => { tags.splice(tags.indexOf(t), 1); drawTags(); } }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×")))) : null,
      allTags().length ? tagPick : null, tagInput);
    if (drawTagNew) drawTagNew();
    if (focus === "input") tagInput.focus({ preventScroll: true });
    else if (focus === "pick" && allTags().length) tagPick.querySelector(".dropdown-btn").focus({ preventScroll: true });
  };
  drawTags();
  // A story page's own tags (Royal Road's, AO3's), offered as one switch.
  const siteBox = el("div", { class: "batch-site-tags" });
  let fromSite = [];
  const useSite = (on) => {
    tags.splice(0, tags.length, ...tags.filter((t) => !fromSite.some((x) => sameTag(x, t))));
    fromSite = [];
    if (on && siteTags) {
      for (const raw of siteTags.tags) {
        const t = cleanTag(raw);
        if (!t || tags.some((x) => sameTag(x, t))) continue;
        const known = allTags().find((x) => sameTag(x, t)) || t;
        tags.push(known);
        fromSite.push(known);
      }
    }
    drawTags();
  };
  const setSiteTags = (got) => {
    siteTags = got && got.tags && got.tags.length ? got : null;
    if (!siteTags) { useSite(false); siteBox.replaceChildren(); return; }
    const shown = siteTags.tags.slice(0, 3).join(", ") + (siteTags.tags.length > 3 ? " " + t("and {n} more", { n: siteTags.tags.length - 3 }) : "");
    const on = load(SITE_TAGS_KEY, false);
    siteBox.replaceChildren(el("div", { class: "group" },
      switchRow(t("{site}'s tags", { site: siteTags.site }), shown, on, (v) => { store(SITE_TAGS_KEY, v); useSite(v); }, { "aria-label": t("Add {site}'s tags", { site: siteTags.site }) })));
    useSite(on);
  };
  setSiteTags(siteTags);
  // Clips that join the collection later (Website sync, Next, a move)
  // take the tags its clips share.
  let tagNew = load(TAG_NEW_KEY, true);
  const tagNewBox = el("div", { class: "batch-tag-new" });
  drawTagNew = () => {
    tagNewBox.replaceChildren(folder && tags.length ? el("div", { class: "group" },
      switchRow(t("Tag new clips too"), t("Chapters added later get these tags"), tagNew, (v) => { tagNew = v; store(TAG_NEW_KEY, v); })) : "");
  };
  drawTagNew();
  area.addEventListener("input", sync);
  input.addEventListener("input", () => pick(cleanTag(input.value) ? folderName(input.value) : null, true));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
  const KIND_NOTES = { article: t("The text and its pictures, read as a page."), comic: t("Only the page's pictures, in order, edge to edge. For comics and manga.") };
  const kindNote = el("p", { class: "meta" }, KIND_NOTES[kind]);
  const images = C.platform.native ? seg("batch-images", t("Images"), [
    { value: "previews", label: t("Previews") }, { value: "full", label: t("Full") }, { value: "links", label: t("Links") },
  ], mode, (v) => { mode = v; }) : null;
  const asPage = from ? el("section", { class: "settings-section batch-from" },
    el("p", { class: "meta" }, t("Waypage read this page as a list of chapters.")),
    el("button", { class: "btn-quiet batch-as-page", type: "button", onclick: () => { history.back(); savePage(from, null, { asPage: true }); } },
      t("Save it as one clip instead"))) : null;
  // A file of your own comes in from here too (0.31.0).
  const newNoteRow = el("button", { class: "row", type: "button", onclick: () => openMenu("newNote") },
    el("span", { class: "row-label accent" }, t("New note")));
  // Inside a collection only a new note is offered: it joins the collection.
  const fromFile = from ? null : preset ? el("section", { class: "settings-section batch-file" }, el("h2", { class: "overline" }, t("Note")),
    el("div", { class: "group" }, newNoteRow)) : el("section", { class: "settings-section batch-file" }, el("h2", { class: "overline" }, t("File")),
    el("div", { class: "group" }, el("button", { class: "row", type: "button", onclick: () => pickFile(() => back()) },
      el("span", { class: "row-label accent" }, t("Add a file"))),
      canAddFolder() ? el("button", { class: "row", type: "button", onclick: () => back().then(addFolder) },
        el("span", { class: "row-label accent" }, t("Add a folder"))) : null,
      C.platform.files.canPickFolder ? el("button", { class: "row", type: "button", onclick: () => back().then(addAudiobookFolder) },
        el("span", { class: "row-label accent" }, t("Add an audiobook folder"))) : null,
      newNoteRow),
    el("p", { class: "meta" }, t("An EPUB book, a Markdown or text note, an HTML page, an email (.eml), a CBZ comic, or an audiobook (M4B, MP3{x}). A folder's files are each added on their own, in a collection named after their folder. It stays {ON_HERE}.", { x: C.platform.files.canPickFolder ? t(", or a folder of them") : "", ON_HERE: ON_HERE })));
  const form = el("form", { class: "batch-form" }, asPage, fromFile,
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Links")), area, count, finder, skipRow),
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Save as")),
      seg("batch-kind", t("Save as"), [{ value: "article", label: t("Article") }, { value: "comic", label: t("Comic") }], kind, (v) => {
        kind = v;
        kindNote.textContent = KIND_NOTES[v];
        // Comics read best full size; still a choice below.
        const pick = images && images.querySelector('input[value="' + (v === "comic" ? "full" : load(IMAGES_KEY, "previews")) + '"]');
        if (pick) { pick.checked = true; mode = pick.value; }
      }),
      kindNote),
    images ? el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Images")), images,
      el("p", { class: "meta" }, t("Full images for comics, maps and diagrams. Settings picks the usual choice."))) : null,
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Collection")),
      el("div", { class: "tag-edit" }, folderPick, input),
      el("p", { class: "meta" }, t("Clips in a collection keep the order of the links."))),
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Tags")), siteBox, tagBox, tagNewBox),
    go);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const all = linksFrom(area.value);
    const skipSaved = skip.checked && !skipRow.hidden;
    const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
    if (!urls.length) return;
    if (urls.length > LONG_LIST && !confirm(t("Save {n} clips? They save one at a time, so a list this long takes a while. Pause and Stop are on its card.", { n: urls.length }))) return;
    history.back();
    saveAll(skipSaved ? all : urls, folder, tags, mode, skipSaved, kind, source, !!(folder && tags.length && tagNew), siteTags || undefined);
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
  const key = back ? "prev" : "next";
  if (from[key] === undefined) {
    try { from[key] = await C.save.findNext(from.url, back); } catch (e) { toast(back ? t("Couldn't reach {site} to find the previous page.", { site: from.site }) : t("Couldn't reach {site} to find the next page.", { site: from.site })); return null; }
    await C.store.writeIndex(state.pages);
    if (!from[key]) { toast(back ? t("There's no previous page.") : t("There's no next page.")); return null; }
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
    const end = back ? t("That's the first one.") : t("That's the last one.");
    toast(saved ? t("Saved {clips} into {name}.", { clips: countLine(saved), name }) + (failed ? " " + (back ? t("The previous one couldn't be saved.") : t("The next one couldn't be saved.")) : stopped ? " " + t("Stopped.") : !url ? " " + end : "")
      : failed ? (back ? t("Couldn't save the previous page.") : t("Couldn't save the next page.")) : first ? (back ? t("The previous page is already saved.") : t("The next page is already saved.")) : (back ? t("There's no previous page.") : t("There's no next page.")));
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
    ? t("The last chapters were about {formatSize} each. Save all of them?", { formatSize: formatSize(each) })
    : t("The last chapters were about {formatSize} each, so {n} more is about {formatSize2}. Save them?", { formatSize: formatSize(each), n: n, formatSize2: formatSize(each * n) }));
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
  const stop = el("button", { class: "chip stop", type: "button", "aria-label": t("Stop saving"),
    onclick: () => { stopRun(runFor(p.folder)); stop.disabled = true; } }, t("Stop"));
  const pause = el("button", { class: "chip pause", type: "button", "aria-label": going && going.paused ? t("Resume saving") : t("Pause saving"),
    onclick: () => { const r = runFor(p.folder); if (r) pauseRun(r, !r.paused); } }, going && going.paused ? t("Resume") : t("Pause"));
  stop.hidden = !busy();
  pause.hidden = !going;
  const run = (n) => (e) => {
    if (busy()) return;
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    if (!sizeOk(p, n)) return;
    e.currentTarget.closest(".follow").querySelectorAll("button:not(.stop):not(.pause)").forEach((b) => { b.disabled = true; });
    stop.hidden = false;
    pause.hidden = n === 1;
    follow(p, n, false, back).then(() => { if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build()); });
  };
  const chip = (n) => {
    const b = el("button", { class: "chip", type: "button",
      "aria-label": n === Infinity ? t("Save all the {what} clips from {site}", { what: what, site: p.site }) : t("Save the {what} {countLine} from {site}", { what: what, countLine: countLine(n), site: p.site }),
      onclick: run(n) }, n === Infinity ? t("All") : String(n));
    b.disabled = busy();
    return b;
  };
  return el("div", { class: "rc-row follow" + (back ? " back" : "") }, el("span", { class: "rc-label" }, back ? t("Save previous") : t("Save next")),
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
      await keepStoryTags(name, found.siteTags);
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
    if (!quiet) toast(t("Couldn't reach {site} to look for new chapters.", { site: last.site }));
    count = null;
  } finally {
    checking.delete(key);
  }
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
  if (!quiet && count === 0) toast(t("No new chapters yet."));
  return count;
}

const newCountText = (n) => t("{n} new", { n: n >= NEW_MAX ? NEW_MAX + "+" : String(n) });

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
  const note = busy ? t("Looking…") : !entry ? t("Not checked yet")
    : (fresh ? newCountText(fresh) : t("None yet")) + " · " + t("checked {when}", { when: whenText(entry.at) });
  const btn = el("button", { class: "chip", type: "button", onclick: () => {
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    checkNew(name, false);
  } }, t("Check"));
  btn.disabled = busy;
  // From a linked page, the new ones are saved straight from its list,
  // each at its place among those already saved.
  const take = entry && entry.all && fresh && !savingInto(name) ? el("button", { class: "chip on save-new", type: "button", onclick: () => {
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    saveAll(entry.all, name, [], undefined, true, undefined, folderSource(list));
  } }, t("Save {fresh}", { fresh: fresh })) : null;
  return el("div", { class: "rc-row check-new" },
    el("span", { class: "rc-label" }, t("New chapters")),
    el("div", { class: "chips" },
      el("span", { class: "check-note" + (fresh ? " accent" : ""), role: "status" }, note), take, btn));
}

// ---- The folder's Website sync panel (0.26.0, was Story page) ----
// Everything about a series in one place: new chapters, saving earlier
// or later ones, the site's page it's linked to (any site's contents
// page, or one of its chapters), and saving the saved
// ones again.
function chaptersPanel(list) {
  const rows = [checkRow(list), followControls(list[0], true), followControls(list[list.length - 1])].filter(Boolean);
  return el("div", { class: "folder-actions chapters-panel" },
    rows.length ? el("div", { class: "chapter-tools" }, ...rows)
      : el("p", { class: "meta" }, t("These clips don't link to each other, so there's nothing to look for. Link the collection to its website below.")),
    sourceSection(list));
}

function sourceSection(list) {
  const name = state.folder;
  const src = folderSource(list);
  const input = el("input", { class: "tag-input source-input", type: "url", inputmode: "url", value: src,
    placeholder: t("Its contents page, or any chapter"), "aria-label": t("Page to sync with"), autocapitalize: "off", spellcheck: "false" });
  const link = el("button", { class: "btn-quiet source-link", type: "button", onclick: async () => {
    const u = linkFrom(input.value);
    if (!u) { toast(t("Paste the link to its contents page or a chapter.")); return; }
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    link.disabled = true;
    link.textContent = t("Reading…");
    try {
      const found = await C.save.findChapters(u);
      if (!found.links.length) { toast(t("Couldn't find a list of chapters on that page.")); return; }
      setSource(name, found.page || u, found.cover || "");
      keepStoryTags(name, found.siteTags);
      toast(t("Linked to {replace} on {siteName}", { replace: countLine(found.links.length).replace("clip", "chapter"), siteName: C.save.siteName(u) }));
    } catch (e) {
      toast(e instanceof C.save.SaveError ? e.message : t("Couldn't read that page. Try again."));
    } finally {
      if (link.isConnected) { link.disabled = false; link.textContent = src ? t("Change") : t("Link"); }
    }
  } }, src ? t("Change") : t("Link"));
  const unlink = src ? el("button", { class: "btn-quiet source-unlink", type: "button", onclick: () => { setSource(name, ""); toast(t("Unlinked {name}", { name: name })); } }, t("Unlink")) : null;
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); link.click(); } });
  return el("section", { class: "settings-section source-section" },
    el("h2", { class: "overline" }, t("Synced with")),
    el("div", { class: "source-row" }, input, link, unlink),
    el("p", { class: "footnote" }, t("New chapters are read from its chapter list, which also finds chapters added in between.")));
}

async function setSource(name, url, cover) {
  for (const p of folderPages(name)) { if (url) p.source = url; else delete p.source; }
  setNewFor(name, null);
  await C.store.writeIndex(state.pages);
  renderFolder();
  renderLibrary();
  if (url) updateCover(name, cover);
}

// Keeps a linked collection's cover (its linked page's picture) in step:
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
  if (!list.length || !navigator.onLine) { if (!navigator.onLine) toast(t("You're offline. Try again when you're back online.")); return; }
  btn.disabled = true;
  const run = startRun(folderName(name), list[0].site, list.length, true);
  const jobs = list.map((old) => ({ ...newJob(old.url, name), key: "again:" + old.id, again: old, mode, kind: old.comic ? "comic" : "article", waiting: true, run }));
  state.saving = [...jobs, ...state.saving];
  renderLibrary();
  toast(t("Saving {countLine} again. They're in Downloads.", { countLine: countLine(list.length) }));
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
  toast([t("Saved {clips} again", { clips: countLine(done) }), failed ? t("{n} couldn't be saved", { n: failed }) : "", stopped ? t("stopped before {clips}", { clips: countLine(stopped) }) : ""].filter(Boolean).join(" · ") + ".");
}

function whenText(at) {
  const mins = Math.round((Date.now() - at) / 6e4);
  if (mins < 2) return t("just now");
  if (mins < 60) return t("{n} min ago", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("{n} h ago", { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t("yesterday") : tn(days, "1 day ago", "{n} days ago");
}

// Once a day per series folder, after the library is up and online,
// one folder at a time, quietly.
let dailyRunning = false;
async function dailyCheck(force) {
  if (dailyRunning || !navigator.onLine || (!force && !load(DAILY_KEY, true))) return 0;
  if (waitsForWifi(DATA_SAVE_KEY)) { if (force) toast(t("Collections check for new chapters when you're on Wi-Fi.")); return 0; }
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
  if (!name) { toast(t("Type a name for the collection.")); return false; }
  if (name === old) return true;
  const clash = allFolders().find((n) => sameTag(n, name) && !sameTag(n, old));
  if (clash) { toast(t("There's already a collection called {clash}.", { clash: clash })); return false; }
  const inside = seriesInside(old);
  for (const p of folderPages(old)) p.folder = name;
  for (const f of inside) for (const p of folderPages(f)) p.folderIn = name;
  renameReadingSet(old, name);
  renameFolderLook(old, name);
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
const FEED_DAYS = [{ value: "3", label: t("3 days") }, { value: "7", label: t("A week") }, { value: "30", label: t("A month") }];
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
// Newsletters (1.43.0) are Kill the Newsletter addresses: each one an
// email address and the Atom feed its emails arrive in, followed like
// any feed but shown in Newsletters, never in Feeds.
const KTN = "kill-the-newsletter.com";
const MAIL_FEED = /^https:\/\/kill-the-newsletter\.com\/feeds\/([a-z0-9]+)\.xml$/i;
const MAIL_DAYS = 30;
const isMail = (f) => MAIL_FEED.test((f && f.url) || "");
const mailBoxes = () => feeds.filter(isMail);
const siteFeeds = () => feeds.filter((f) => !isMail(f));
const mailAddress = (f) => (f.url.match(MAIL_FEED) || [])[1] + "@" + KTN;
// "Please confirm your subscription": a Confirm button, not a clip.
const CONFIRM = /\b(confirm|verify|activate|validate)|opt[- ]?in/i;
const isConfirm = (it) => CONFIRM.test((it && it.title) || "");
state.place = ["feeds", "newsletters", "highlights", "reading", "discover"].includes(load(PLACE_KEY, "library")) || (["anki", "calibre", "catalogs", "audiobookshelf", "webdav"].includes(load(PLACE_KEY, "library")) && C.ext.on(load(PLACE_KEY, "library"))) ? load(PLACE_KEY, "library") : "library";
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
  return siteFeeds().reduce((n, f) => n + feedPosts(f).filter((it) => it.foundAt > seen && !savedAs(it.url)).length, 0);
};

// The feed's site icon, or its first letter, like a card with no picture.
function feedMark(f, small) {
  const url = f.link || f.url;
  const box = siteMark({ site: C.feeds.siteOf(url) || f.title, icon: f.icon, url });
  box.className = "site-mark feed-mark" + (small ? " small" : "");
  return box;
}

// "About 2 posts a day · last one 2 h ago", from the posts' dates.
function rateLine(items, mail) {
  const ds = items.map((it) => it.date).filter(Boolean).sort((a, b) => b - a);
  if (!ds.length) return items.length ? (mail ? tn(items.length, "1 email", "{n} emails") : tn(items.length, "1 post", "{n} posts")) : mail ? t("No emails yet") : t("No posts yet");
  const last = whenText(ds[0]);
  if (ds.length < 2) return mail ? t("Last email {when}", { when: last }) : t("Last post {when}", { when: last });
  const perDay = (ds.length - 1) / Math.max((ds[0] - ds[ds.length - 1]) / DAY, 1 / 24);
  const perWeek = perDay * 7;
  const rate = mail
    ? (perDay >= 1.5 ? t("About {n} emails a day", { n: Math.round(perDay) })
      : perDay >= 0.75 ? t("About an email a day")
      : perWeek >= 1.5 ? t("About {n} emails a week", { n: Math.round(perWeek) })
      : perWeek >= 0.75 ? t("About an email a week") : t("An email now and then"))
    : (perDay >= 1.5 ? t("About {n} posts a day", { n: Math.round(perDay) })
      : perDay >= 0.75 ? t("About a post a day")
      : perWeek >= 1.5 ? t("About {n} posts a week", { n: Math.round(perWeek) })
      : perWeek >= 0.75 ? t("About a post a week") : t("A post now and then"));
  return rate + " · " + t("last one {when}", { when: last });
}

// A GitHub repo's releases (2026-11): what the add sheet says of them,
// and each release's row, "6 added · 3 changed · 3 fixed" in its own
// list and just "Release" among every feed's posts.
function releasesLine(items) {
  const last = Math.max(0, ...items.map((it) => it.date || 0));
  return last ? t("Releases on GitHub · last one {when}", { when: whenText(last) }) : t("Releases on GitHub · none yet");
}
function releaseMeta(it, short) {
  const n = it.notes || {};
  const parts = [n.added && t("{n} added", { n: n.added }), n.changed && t("{n} changed", { n: n.changed }), n.fixed && t("{n} fixed", { n: n.fixed }), n.removed && t("{n} removed", { n: n.removed })].filter(Boolean);
  return short || !parts.length ? t("Release") : parts.join(" · ");
}

// Today, Yesterday, a weekday this week, then the date.
function dayName(t) {
  const start = new Date().setHours(0, 0, 0, 0);
  if (t >= start) return i18n.t("Today");
  if (t >= start - DAY) return i18n.t("Yesterday");
  const d = new Date(t);
  if (t >= start - 6 * DAY) return d.toLocaleDateString(i18n.lang, { weekday: "long" });
  return d.toLocaleDateString(i18n.lang, { day: "numeric", month: "long" });
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
    // A newsletter's email (1.43.0): its sender, its confirm link, and
    // whether it was opened.
    if (it.from) out.from = it.from;
    if (it.act) out.act = it.act;
    if (it.notes) out.notes = it.notes;
    if (old && old.opened) out.opened = true;
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
    feeds.push({ url: o.url, title, link: "", icon: "", mode: "show", images: feedImages(),
      folder: cleanTag(o.folder) || title, days: 7, addedAt: Date.now(), checkedAt: 0, error: "", items: [] });
    added++;
  }
  if (!added) { toast(list.length ? t("You follow all of those feeds already.") : t("No feeds in that file.")); return; }
  saveFeeds();
  paintFeeds();
  toast(tn(added, "Following 1 feed. Its posts are in Feeds.", "Following {n} feeds. Their posts are in Feeds."));
  setTimeout(() => checkFeeds(true), 0);
}

// Feeds from a backup: one not followed here is followed again, with its
// posts; one followed already keeps its settings here. Returns how
// many were added.
// Followed again now (1.46.0), so sync takes it over an older unfollow.
function restoreFeeds(list) {
  let added = 0;
  for (const f of list || []) {
    if (feeds.some((h) => sameUrl(h.url, f.url))) continue;
    feeds.push({ ...f, addedAt: Date.now() });
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
// The same clip as the library's Continue reading (1.40.1): in a
// collection, the chapter after one just finished. The newest unfinished
// clip read sent the widget and the Continue reading shortcut back to an
// older clip once the one you were in was finished.
function keepReading() {
  const go = continuePage();
  if (go) return go;
  const read = state.pages.filter((p) => p.readAt).sort((a, b) => b.readAt - a.readAt);
  return read.find((x) => !x.finished) || read[0];
}
function updateWidgets(now) {
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const p = keepReading();
    const posts = siteFeeds().flatMap((f) => feedPosts(f).filter((it) => !savedAs(it.url)).map((it) => ({ f, it })))
      .sort((a, b) => postAt(b.it) - postAt(a.it)).slice(0, 3)
      .map(({ f, it }) => ({ title: it.title, site: f.title, url: it.url, feed: f.url }));
    C.platform.widgets.update({
      reading: p ? { id: p.id, title: p.title, at: p.at || 0,
        meta: [siteOf(p), (p.at || 0) >= 0.995 ? t("Finished") : t("{n} min left", { n: clipLeft(p, p.at || 0) })].filter(Boolean).join(" · ") } : null,
      feeds: { following: siteFeeds().length > 0, fresh: freshPosts(), posts },
      favourites: [
        ...allFolders().filter(folderFav).map((name) => ({ name, at: Math.max(...folderPages(name).map((x) => x.folderFavAt || 0)) }))
          .sort((a, b) => b.at - a.at).map(({ name }) => ({ kind: "collection", name, title: name, meta: t("Collection") + " · " + readCount(folderPages(name)) })),
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
        return { name, meta: readCount(list), next: next ? next.id : "", button: !next ? "" : i < 0 ? t("Read again") : started ? t("Continue") : t("Start"),
          clips: list.slice(from, from + 4).map((x) => ({ id: x.id, title: x.title, meta: readingLine(x) })) };
      }),
      stats: statsWidget(),
    });
  }, now ? 0 : 800);
}

const clipMeta = (x) => [siteOf(x), readingLine(x)].filter(Boolean).join(" · ");
const readCount = (list) => { const done = list.filter((x) => x.finished).length; return done === list.length ? t("All read") : t("{done} of {n} read", { done, n: list.length }); };

// A widget's tap: the page to keep reading, a post, Feeds or a collection.
// The app icon's shortcuts (1.14.0) come the same way: Continue reading,
// Search, and Save the copied link.
async function takeWidget() {
  const got = await C.platform.widgets.take();
  if (!got || !got.kind) return;
  // A collection's Continue (1.40.1) opens its next clip as it is now,
  // not as it was when the widget was last drawn: the app put away just
  // after a chapter ended could leave the widget a chapter behind.
  if (got.kind === "page" && got.next) {
    const p = state.pages.find((x) => x.id === got.id);
    const q = p && p.folder ? folderNext(folderPages(p.folder)) : null;
    if (q) got.id = q.id;
  }
  // The clip already open stays as it is (1.30.2), not closed and opened
  // again: that went back to the place last written, not the one read.
  // Continue reading with a clip open is that clip (1.40.1).
  const id = got.kind === "reading" ? (state.open || keepReading() || {}).id : got.kind === "page" && !got.aloud ? got.id : null;
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
  toast(t("No link copied. Paste one here."));
}

// Posts found with the app closed: those feeds are read again now, and
// the notification's tap opens Feeds.
async function takeFeedNews() {
  const news = await C.platform.feedChecks.news();
  if (news.open) {
    await toLibrary();
    const to = news.feed && feeds.some((f) => f.url === news.feed) ? news.feed : null;
    const place = to && isMail({ url: to }) ? "newsletters" : "feeds";
    if (state.place !== place || state.feed !== to) await goPlace(place, to);
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
  catch (e) { error = e instanceof C.feeds.FeedError ? e.message : t("Couldn't check this feed. Try again later."); }
  if (!feeds.includes(f)) return;
  if (got && isMail(f)) keepMails(got);
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
  if (waitsForWifi(DATA_SAVE_KEY)) { if (force) toast(t("Feeds check when you're on Wi-Fi.")); return; }
  feedsChecking = true;
  paintFeeds();
  try {
    for (const f of [...feeds]) {
      if (!force && f.checkedAt && Date.now() - f.checkedAt < FEED_EVERY) continue;
      // A browser can't read a newsletter address; the phone does.
      if (isMail(f) && !C.platform.canFetchPages) continue;
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
  // A newsletter's confirm email waits for its Confirm, never saved.
  const todo = feedPosts(f).filter((it) => !it.tried && !savedAs(it.url) && !savingUrl(it.url) && !(isMail(f) && isConfirm(it)));
  if (!todo.length) return;
  todo.forEach((it) => { it.tried = true; });
  saveFeeds();
  saveFeedPosts(todo.map((it) => ({ f, it })));
}

// Into each post's feed's collection, oldest first so the collection
// reads in order, with the feed's pictures setting.
function saveFeedPosts(list) {
  if (!navigator.onLine) { toast(t("You're offline. Save these when you're back online.")); return feedSaves; }
  const by = new Map();
  for (const x of [...list].sort((a, b) => postAt(a.it) - postAt(b.it))) {
    if (savedAs(x.it.url) || savingUrl(x.it.url)) continue;
    if (isMail(x.f)) { feedSaves = feedSaves.then(() => saveMail(x.f, x.it)).then(paintFeeds, paintFeeds); continue; }
    if (!by.has(x.f)) by.set(x.f, []);
    by.get(x.f).push(x.it.url);
  }
  for (const [f, urls] of by) {
    const folder = f.folder ? folderName(f.folder) : null;
    const how = { mode: C.platform.native ? f.images || feedImages() : undefined };
    feedSaves = feedSaves.then(() => urls.length === 1 ? savePage(urls[0], folder || undefined, how)
      : saveAll(urls, folder, [], how.mode, true)).then(paintFeeds, paintFeeds);
  }
  paintFeeds();
  return feedSaves;
}

function paintFeeds() {
  if (state.place === "feeds") renderFeeds();
  if (state.place === "newsletters") renderNewsletters();
  if (state.place === "discover") renderDiscover();
  if (sideShown()) renderSide();
  if (state.menu && state.menu.kind === "feed") redrawMenu();
}

// Library, Feeds or Highlights under the same bar; only the title changes.
function paintPlace() {
  const feedsOn = state.place === "feeds";
  const mailOn = state.place === "newsletters";
  const marksOn = state.place === "highlights";
  const readOn = state.place === "reading";
  const findOn = state.place === "discover";
  const ankiOn = state.place === "anki";
  const calOn = state.place === "calibre";
  const catOn = state.place === "catalogs";
  const absOn = state.place === "audiobookshelf";
  const davOn = state.place === "webdav";
  $("placeTitle").textContent = feedsOn ? t("Feeds") : mailOn ? t("Newsletters") : marksOn ? t("Highlights") : readOn ? t("Stats") : findOn ? t("Discover") : ankiOn ? t("Anki") : calOn ? t("Calibre") : absOn ? t("Audiobookshelf") : catOn ? t("Catalogs") : davOn ? t("WebDAV") : t("Library");
  $("libraryView").dataset.place = state.place;
  $("library").hidden = feedsOn || mailOn || marksOn || readOn || findOn || ankiOn || calOn || catOn || absOn || davOn;
  $("feeds").hidden = !feedsOn;
  $("newsletters").hidden = !mailOn;
  $("highlights").hidden = !marksOn;
  $("reading").hidden = !readOn;
  $("discover").hidden = !findOn;
  $("anki").hidden = !ankiOn;
  $("calibre").hidden = !calOn;
  $("catalogs").hidden = !catOn;
  $("audiobookshelf").hidden = !absOn;
  $("webdav").hidden = !davOn;
  $("paneNote").textContent = marksOn ? t("Pick a highlight to read it here") : readOn ? t("Pick a clip to read it here") : mailOn ? t("Pick an email to read it here") : t("Pick a post to read it here");
  // The bottom field follows a feed in Feeds, makes a newsletter address
  // in Newsletters (1.43.1), searches Royal Road or follows a site in
  // Discover, and saves a link elsewhere.
  $("saveUrl").placeholder = feedsOn ? t("Paste a site or feed to follow") : mailOn ? t("Name a new address") : t("Paste a link to save");
  $("saveUrl").inputMode = mailOn ? "text" : "url";
  $("saveUrl").autocapitalize = mailOn ? "sentences" : "off";
  $("saveUrl").enterKeyHint = "go";
  if (mailOn) $("saveUrl").maxLength = 32; else $("saveUrl").removeAttribute("maxlength");
  document.querySelector('label[for="saveUrl"]').textContent = feedsOn ? t("Site or feed") : mailOn ? t("New address's name") : t("Page link");
  $("saveForm").querySelector(".btn-primary").textContent = feedsOn ? t("Follow") : mailOn ? t("Make") : t("Save");
  $("severalBtn").hidden = feedsOn || mailOn || findOn || ankiOn || calOn || catOn || absOn || davOn;
  $("viewBtn").hidden = !findOn && !(state.place === "library" && state.pages.length);
  if (feedsOn || mailOn || marksOn || readOn || findOn || ankiOn || calOn || catOn || absOn || davOn) { if (state.query) clearSearch(); }
  if (feedsOn) renderFeeds();
  else if (mailOn) renderNewsletters();
  else if (marksOn) renderHighlights();
  else if (readOn) renderReading();
  else if (findOn) openDiscover();
  else if (ankiOn) renderAnki();
  else if (calOn) renderCalibre();
  else if (catOn) renderCatalogs();
  else if (absOn) renderAudiobookshelf();
  else if (davOn) renderWebdav();
  else renderLibrary();
}

function goPlace(place, feed) {
  // The pinned sidebar is there over a collection or Files too: a tap in
  // it steps back to the library first.
  if (pinned.matches && history.state && history.state.view) return toLibrary().then(() => goPlace(place, feed));
  if (place !== state.place) leavePostSearch();
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
  // Newsletters (1.43.0) are feeds underneath, with a place of their own.
  const feeds = siteFeeds();
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
    leavePostSearch();
    nodes.push(el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("Follow the sites you read")),
      el("p", { class: "empty-text" }, C.platform.native
        ? t("Add a site and its new posts wait here for you to save, or save themselves.")
        : t("Add a site and its new posts wait here. Most sites only let Waypage on your phone read their feed.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addFeed") }, t("Add a feed"))));
    root.replaceChildren(...nodes);
    return;
  }
  const chip = (label, n, on, onclick, key) => {
    const b = el("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), "data-key": key, onclick },
      el("span", { class: "chip-label", dir: "auto" }, label), n ? " · " + n : null);
    return b;
  };
  const all = feeds.reduce((n, f) => n + waitingIn(f), 0);
  nodes.push(el("div", { class: "chips filters feed-chips", role: "group", "aria-label": t("Feeds") },
    chip(t("All"), all, !picked, () => pickFeed(null), "chip:all"),
    ...feeds.map((f) => {
      const c = chip(f.title, waitingIn(f), picked === f, () => pickFeed(f.url), "chip:" + f.url);
      c.dataset.feed = f.url;
      return c;
    })));
  const checked = Math.max(0, ...(picked ? [picked] : feeds).map((f) => f.checkedAt || 0));
  const box = postSearchBox(), ts = postTerms();
  const list = (picked ? [picked] : feeds).flatMap((f) => feedPosts(f).map((it) => ({ f, it })))
    .filter((x) => !ts.length || postMatch(x.f, x.it, ts))
    .sort((a, b) => postAt(b.it) - postAt(a.it));
  const line = ts.length ? tn(list.length, "1 post found", "{n} posts found")
    : feedsChecking ? t("Checking…") : picked && picked.error ? picked.error
    : checked ? t("Checked {when}", { when: whenText(checked) }) : t("Not checked yet");
  nodes.push(el("div", { class: "feed-head" },
    el("p", { class: "meta" + (picked && picked.error && !feedsChecking && !ts.length ? " warn" : ""), role: ts.length ? "status" : null }, line),
    // Phones pull down to check; a pointer gets the button.
    el("span", { class: "feed-head-acts" },
      el("button", { class: "btn-text feed-check", type: "button", "data-key": "check", onclick: () => checkNow(picked) }, t("Check now")))));
  let day = null, group = null;
  for (const x of list) {
    const d = dayName(postAt(x.it));
    if (d !== day) {
      day = d;
      const open = list.filter((y) => dayName(postAt(y.it)) === d && !savedAs(y.it.url) && !savingUrl(y.it.url));
      nodes.push(sectionHead(d, open.length > 1
        ? el("button", { class: "btn-text", type: "button", "data-key": "all:" + d, onclick: () => saveFeedPosts(open) }, t("Save all {n}", { n: open.length })) : null));
      group = el("div", { class: "group feed-group" });
      nodes.push(group);
    }
    group.append(postRow(x.f, x.it, !picked));
  }
  if (!list.length && ts.length) nodes.push(el("p", { class: "empty-text hl-none" }, t("No posts match that.")));
  else if (!list.length) {
    const days = (picked || feeds[0]).days || 7;
    nodes.push(el("div", { class: "empty" },
      el("p", { class: "empty-text" }, (picked && picked.error) || (!checked ? t("Its posts show up after the first check.")
        : ({ "3": t("Nothing posted in the last 3 days."), "30": t("Nothing posted in the last month.") }[String(days)] || t("Nothing posted in the last week."))))));
  }
  fillPosts(root, box, nodes);
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
// Beside sync, not instead of it: Back up now, an automatic one on Wi-Fi (how often picked since 1.46.0)
// while Waypage is open, the last three kept, and any of them restored
// the way a backup file is (the copy saved last wins).

// While one runs: { restore, text, share, paused, stopped, ctl }. Pause and
// Stop are in Downloads and in Settings (1.27.1).
let driveRun = null;
let driveFiles = null;    // the backups in Drive, once listed
let driveListError = "";
let driveDueSaid = false;

const driveWhen = (at) => new Date(at).toLocaleString(i18n.lang, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
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
  return r.stopped ? t("Stopping…") : r.paused ? t("Paused") + " · " + r.text : r.text;
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
  C.backup.holdPack(on);
  if (on && r.ctl.stop) r.ctl.stop();
  if (!on && r.wake) { r.wake(); r.wake = null; }
  drivePaint();
}
function driveStop() {
  const r = driveRun;
  if (!r) return;
  r.stopped = true;
  C.backup.stopPack();
  if (r.ctl.stop) r.ctl.stop();
  if (r.wake) { r.wake(); r.wake = null; }
  drivePaint();
}
const driveCanStop = () => !!driveRun && !driveRun.merging;
function driveControls(cls) {
  const r = driveRun;
  if (!driveCanStop()) return null;
  return el("span", { class: cls },
    r.restore ? null : el("button", { class: "btn-small", type: "button", ...(r.stopped ? { disabled: "" } : {}), onclick: () => drivePause(!r.paused) }, r.paused ? t("Resume") : t("Pause")),
    el("button", { class: "btn-quiet danger", type: "button", ...(r.stopped ? { disabled: "" } : {}), onclick: driveStop }, t("Stop")));
}
// The run as a card in Downloads, like the app's own update.
function driveCard() {
  const r = driveRun;
  return el("div", { class: "card saving drive-run wide", role: "group", "aria-label": r.restore ? t("Restoring from Google Drive") : t("Backing up to Google Drive") },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, t("Google Drive")),
      el("span", { class: "card-title" }, r.restore ? t("Restoring your library") : t("Backing up your library")),
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
    sectionHead(t("GitHub sync")), githubCard(),
    C.drive.available ? sectionHead(t("Google Drive")) : null,
    C.drive.available ? (r && !r.restore ? driveCard() : driveRestCard()) : null);
  if (r && !r.restore) paintDriveCard();
}
const toSettings = (section) => toLibrary().then(() => openSettings(false, section));
function githubCard() {
  if (!C.sync.on) {
    return el("div", { class: "card wide", role: "group", "aria-label": t("GitHub sync") },
      el("span", { class: "card-body" },
        el("span", { class: "card-site" }, t("GitHub")),
        el("span", { class: "card-title" }, t("Not set up")),
        el("span", { class: "card-status" }, t("Keeps your library the same on your phone and computer.")),
        el("span", { class: "card-actions" },
          el("button", { class: "btn-small", type: "button", onclick: () => toSettings("sync") }, t("Set up")))));
  }
  const last = C.sync.last, now = syncProgress(), paused = C.sync.paused, running = C.sync.running;
  const status = syncLine(last, now, paused, running);
  const after = running ? "" : syncAfter();
  return el("div", { class: "card saving sync-run wide", role: "group", "aria-label": t("GitHub sync") },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, C.sync.account),
      el("span", { class: "card-title" }, running ? t("Syncing your library") : t("Your library")),
      running ? el("span", { class: "progress" + (now.part == null ? " busy" : ""), "aria-hidden": "true" },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + (now.part || 0) + ")" })) : null,
      el("span", { class: "card-status" + (running ? " accent" : last.error ? " warn" : ""), role: "status" },
        running ? el("span", { class: "spinner", "aria-hidden": "true" }) : null,
        el("span", { class: "status-text" }, status)),
      after ? el("span", { class: "card-status accent" }, after) : null,
      el("span", { class: "card-actions" },
        paused || running ? null : el("button", { class: "btn-small", type: "button", onclick: () => syncNow(false) }, t("Sync now")),
        el("button", { class: paused ? "btn-small" : "btn-quiet", type: "button", onclick: () => pauseSync(!paused) }, paused ? t("Resume") : t("Pause")),
        el("button", { class: "btn-quiet", type: "button", onclick: () => toSettings("sync") }, t("Settings")))));
}
// Google Drive when no backup is going up: when the last one was, and
// Back up now.
function driveRestCard() {
  const on = C.drive.on, l = C.drive.last;
  const status = !on ? t("A copy of your library in your own Google Drive, made by itself as often as you pick and whenever you ask.")
    : driveRun ? t("Restoring a backup, in Downloads")
    : l.error ? l.error
    : l.at ? t("Last backup {when}", { when: whenText(l.at) }) + (l.size ? ", " + formatSize(l.size) : "") : t("No backup yet");
  return el("div", { class: "card wide", role: "group", "aria-label": t("Google Drive") },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, t("Google Drive")),
      el("span", { class: "card-title" }, on ? t("Backups") : t("Not connected")),
      el("span", { class: "card-status" + (on && l.error && !driveRun ? " warn" : "") }, status),
      el("span", { class: "card-actions" },
        on ? el("button", { class: "btn-small", type: "button", ...driveBusy(), onclick: () => driveBackUp(false) }, t("Back up now")) : null,
        el("button", { class: on ? "btn-quiet" : "btn-small", type: "button", onclick: () => toSettings("drive") }, on ? t("Settings") : t("Set up")))));
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
  if (!C.drive.on) return t("Off");
  if (driveRun) return driveRun.paused ? t("Paused") : driveRun.restore ? t("Restoring") : t("Backing up");
  const l = C.drive.last;
  return l.error ? t("Didn't back up") : l.at ? whenText(l.at).replace(/^./, (c) => c.toUpperCase()) : "On";
}

function driveSections() {
  if (!C.drive.on) {
    return [section(t("Back up to Google Drive"), t("A copy of your library in your own Google Drive, made by itself as often as you pick and whenever you ask, to bring back on a new phone or after a mistake. Waypage can only see the backups it makes, in a Waypage folder in your Drive; nothing else there is opened or read."),
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: (e) => driveConnect(e.currentTarget) },
          el("span", { class: "row-label accent" }, t("Connect Google Drive")))))];
  }
  const l = C.drive.last;
  const status = driveRun ? driveStatusText()
    : l.error ? l.error
    : l.at ? t("Last backup {when}", { when: whenText(l.at) }) + (l.size ? ", " + formatSize(l.size) : "")
    : t("No backup yet");
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
      el("span", { class: "row-value accent" }, t("Restore"))),
    el("button", { class: "row-x drive-delete", type: "button", ...driveBusy(), "aria-label": t("Delete the backup of {driveWhen}", { driveWhen: driveWhen(f.at) }), title: t("Delete"), onclick: () => driveDelete(f) },
      el("span", { class: "visually-hidden" }, t("Delete")),
      svgBin()))) : [];
  return [
    section(t("Backups"), t("A copy of your library in a Waypage folder in your Drive, which is all Waypage can see there. {x}Drive keeps the last {KEEP} backups{x2}; an older one is deleted when a new one is made.", { x: C.platform.native ? (C.drive.background ? t("Automatic backups run on Wi-Fi, even with Waypage closed, when Android finds a good moment. ") : t("Automatic backups run on Wi-Fi while Waypage is open. ")) : t("This browser signs in to Google for an hour at a time, so an automatic backup asks first. "), KEEP: C.drive.KEEP, x2: C.drive.auto && C.drive.every < 7 ? t(", and one from a week before them") : "" }),
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", ...driveBusy(), onclick: () => driveBackUp(false) },
          el("span", { class: "choice-text" },
            el("span", { class: "choice-label accent" }, t("Back up now")),
            el("span", { class: "choice-note" + (l.error && !driveRun ? " warn" : ""), id: "driveStatus", role: "status" }, status))),
        driveRun ? el("div", { class: "row" }, driveControls("drive-actions")) : null),
      // How often (1.46.0; it was a weekly switch), a pick row like the
      // other settings' (1.48.4; a drop-down under its name from 1.47.0).
      el("div", { class: "group" },
        pickRow({ label: t("Back up by itself"), cls: "drive-every", get: () => (C.drive.auto ? String(C.drive.every) : "off"),
          set: (v) => { if (v === "off") C.drive.auto = false; else { C.drive.every = Number(v); C.drive.auto = true; } renderSection(); },
          options: [...C.drive.EVERY.map((d) => ({ value: String(d), label: DRIVE_EVERY[d], note: t("And whenever you ask") })),
            { value: "off", label: t("Only when I ask"), note: t("Back up now, above") }] }))),
    section(t("What goes in"), t("Tags, collections, favourites and your reading stats go with the clips. Links only makes a backup much smaller, but a clip whose page changed or went away comes back different or not at all{x}; books you copied in and newsletter mails still go in whole. Files read from outside and watched folders stay where they are, and settings don't go in.", { x: C.platform.native ? "" : t(", and this browser can only save Wikipedia pages again") }),
      el("div", { class: "group" },
        sw("clips", t("Clips"), what.links ? t("Links, highlights and places") : t("Text, pictures, highlights and places")),
        what.clips ? el("div", { class: "row" }, seg("drive-links", t("What goes in of each clip"), [{ value: "pages", label: t("Clips too") }, { value: "links", label: t("Links only") }],
          what.links ? "links" : "pages", (v) => { C.drive.setWhat("links", v === "links"); renderSection(); })) : null,
        sw("notes", t("Notes"), t("Every note, whole")),
        sw("feeds", t("Feeds"), t("Which you follow and how")),
        sw("newsletters", t("Newsletters"), t("Your addresses and how they're set")))),
    section(t("Restore"), t("Restoring adds what isn't here and keeps whichever copy of a clip was saved last. Nothing here is deleted. A clip or feed you deleted since comes back, on your synced devices too. The bin deletes a backup from Drive for good."),
      el("div", { class: "group" }, ...(list.length ? list
        : driveListError === DRIVE_SIGN_IN ? [el("button", { class: "row", type: "button", onclick: driveSignIn }, el("span", { class: "row-label accent" }, t("Sign in to Google to see them")))]
        : [el("div", { class: "row" }, el("span", { class: "row-label" + (driveListError ? " warn" : "") }, driveListError || (driveFiles ? t("No backups in Drive yet") : t("Looking in Drive…"))))]))),
    section(t("Account"), t("Disconnecting forgets the sign-in on this device. The backups stay in your Drive."),
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", ...driveBusy(), onclick: driveDisconnect },
          el("span", { class: "choice-text" }, el("span", { class: "choice-label warn" }, t("Disconnect Google Drive")), C.drive.email ? el("span", { class: "choice-note" }, t("Connected as {email}", { email: C.drive.email })) : null)))),
  ];
}

const DRIVE_EVERY = { 1: t("Every day"), 3: t("Every 3 days"), 7: t("Every week"), 14: t("Every 2 weeks"), 30: t("Every month") };

async function driveConnect(btn) {
  if (btn) { btn.disabled = true; btn.querySelector(".row-label").textContent = t("Connecting…"); }
  try {
    await C.drive.connect();
    driveFiles = null;
    driveListError = "";
    toast(t("Google Drive connected"));
  } catch (e) {
    if (!(e instanceof C.drive.DriveError)) console.error(e);
    if (!e || e.code !== "again") toast(e instanceof C.drive.DriveError ? e.message : t("Couldn't connect. Try again."));
  }
  drivePaint();
}

async function driveDisconnect() {
  await C.drive.disconnect();
  driveFiles = null;
  driveListError = "";
  drivePaint();
  toast(t("Disconnected. Your backups stay in Google Drive."));
}

const DRIVE_SIGN_IN = "signin";
async function driveSignIn() {
  try { await C.drive.getToken(true); } catch (e) { if (!e || e.code !== "again") toast((e && e.message) || t("Couldn't sign in. Try again.")); return; }
  driveFiles = null;
  driveListError = "";
  driveRefresh();
}
async function driveRefresh() {
  try {
    driveFiles = await C.drive.list();
    driveListError = "";
  } catch (e) {
    driveListError = e instanceof C.drive.DriveError && e.code === "signin" ? DRIVE_SIGN_IN : (e && e.message) || t("Couldn't look in Drive");
    if (!(e instanceof C.drive.DriveError)) console.error(e);
  }
  if (state.section === "drive") renderSection();
}

// What a backup holds, from Settings › Google Drive › What goes in.
// Files read from outside stay out, as in GitHub sync, and a file copied
// in is a clip like any other (1.46.0: no Files switch).
// With Links only (1.47.0), a clip that can be saved again from its
// address goes in as that address alone; one that can't (a file copied
// in, a newsletter's mail, which Kill the Newsletter keeps a month) goes
// in whole.
const savableAgain = (p) => !!p.url && !p.file && !p.url.startsWith(MAIL_ENTRY);
function driveContents() {
  const w = C.drive.what;
  // Notes are a part of their own (2026-11), whole, PDF and all.
  const pages = state.pages.filter((p) => !p.link && (p.note ? w.notes : w.clips));
  const bare = w.clips && w.links ? new Set(pages.filter(savableAgain).map((p) => p.id)) : null;
  return { pages, bare, feeds: [...(w.feeds ? siteFeeds() : []), ...(w.newsletters ? mailBoxes() : [])] };
}

// The automatic backup with Waypage closed (1.47.0, Android): on going to
// the background the job gets what a backup now would hold; on coming
// back it's held, and what it did becomes the last backup here.
let driveHanded = "";
async function driveHandOver() {
  if (!C.drive.background) return;
  if (!C.drive.on || !C.drive.auto || !C.drive.folder) { if (driveHanded !== "off") { driveHanded = "off"; C.drive.handOver(null); } return; }
  const from = await C.store.packSource().catch(() => null);
  if (!from) return;
  const { pages, bare, feeds: fs } = driveContents();
  const kept = pages.filter((p) => !p.link && !p.note);
  const ids = kept.filter((p) => !bare || !bare.has(p.id)).map((p) => p.id);
  const l = C.drive.last;
  const plan = { every: C.drive.every, last: Math.max(l.at || 0, C.drive.since), tried: l.tried || 0, folder: C.drive.folder,
    device: load(DEVICE_KEY, "") || guessedName(), clips: kept.length, ids, head: await C.backup.headFiles(kept, fs), ...from };
  const sig = JSON.stringify({ ...plan, head: plan.head.map((h) => (h.name === "waypage.json" ? "" : h.text)) });
  if (sig === driveHanded) return;
  driveHanded = sig;
  C.drive.handOver(plan);
}
async function driveTakeBackground() {
  if (!C.drive.background || !C.drive.on) return;
  C.drive.hold(true);
  const s = await C.drive.backgroundDone();
  if (!s) return;
  const l = C.drive.last;
  if (s.at > (l.at || 0)) { C.drive.last = { at: s.at, size: s.size || 0 }; driveFiles = null; drivePaint(); }
  else if (s.error && s.tried > (l.tried || 0) && s.tried > (l.at || 0)) { C.drive.last = { ...l, error: s.error, tried: s.tried }; drivePaint(); }
}

async function driveBackUp(auto) {
  if (driveRun || !C.drive.on) return;
  const { pages, bare, feeds: fs } = driveContents();
  const zip = pages.length > 0 || fs.length > 0;
  if (!zip) { if (!auto) toast(t("There's nothing to back up with what's picked.")); return; }
  const run = driveRun = { restore: false, text: t("Getting ready…"), share: null, paused: false, stopped: false, ctl: {} };
  drivePaint();
  let out = null;
  try {
    // Asked for first: a browser can open Google's window only straight
    // from the tap.
    await C.drive.getToken(!auto, "backup");
    let made = null;
    if (zip) {
      out = await C.backup.exportLibrary(pages, (done, total) => driveSay(t("Packing, {done} of {total}", { done: done, total: total }), (done / total) * 0.3), fs, driveGate, bare);
      if (!(await driveGate())) throw new C.drive.DriveError("Stopped.", "cancelled");
      driveSay(t("Sending to Drive…"), 0.3);
      const info = { device: load(DEVICE_KEY, "") || guessedName(), clips: pages.length };
      const sent = (done, total) => driveSay(t("Sending to Drive, {x}", { x: total ? Math.round((done / total) * 100) + "%" : formatSize(done) }), total ? 0.3 + 0.7 * (done / total) : null);
      for (;;) {
        try { made = await C.drive.upload(out, info, sent, run.ctl); break; }
        catch (e) {
          if (e && e.code === "cancelled" && run.paused && await driveGate()) { driveSay(t("Sending to Drive…")); continue; }
          throw e;
        }
      }
    }
    C.drive.last = { at: Date.now(), size: made ? made.size || (out.blob ? out.blob.size : 0) : 0 };
    driveFiles = null;
    if (!auto) toast(t("Backed up to Google Drive"));
  } catch (e) {
    if (e && e.code === "cancelled") {
      toast(t("Backup stopped"));
      if (out && out.uri) C.platform.plugin("Filesystem").deleteFile({ path: out.name, directory: "CACHE" }).catch(() => {});
      driveRun = null;
      drivePaint();
      return;
    }
    if (!(e instanceof C.drive.DriveError)) console.error(e);
    const msg = e instanceof C.drive.DriveError ? e.message : t("Couldn't make the backup. Free some space and try again.");
    C.drive.last = { ...C.drive.last, error: msg, tried: Date.now() };
    if (!auto && (!e || e.code !== "again")) toast(msg);
  }
  if (out && out.uri) C.platform.plugin("Filesystem").deleteFile({ path: out.name, directory: "CACHE" }).catch(() => {});
  driveRun = null;
  drivePaint();
}

async function driveDelete(f) {
  if (driveRun || !confirm(t("Delete the backup of {driveWhen} from Google Drive? It can't be brought back.", { driveWhen: driveWhen(f.at) }))) return;
  try {
    await C.drive.remove(f.id);
  } catch (e) {
    // Already gone counts as deleted.
    if (!(e instanceof C.drive.DriveError && e.code === "gone")) { toast((e && e.message) || t("Couldn't delete it. Try again.")); return; }
  }
  if (driveFiles) driveFiles = driveFiles.filter((x) => x.id !== f.id);
  drivePaint();
  toast(t("Backup deleted"));
}

async function driveRestore(f) {
  if (driveRun) return;
  const asked = C.drive.getToken(true);
  const run = driveRun = { restore: true, text: t("Bringing the backup down…"), share: null, paused: false, stopped: false, ctl: {} };
  drivePaint();
  try {
    await asked;
    const file = await C.drive.download(f.id, (done, total) => driveSay(t("Bringing it down, {x}", { x: total > 0 ? Math.round((done / total) * 100) + "%" : formatSize(done) }), total > 0 ? (done / total) * 0.5 : null), run.ctl);
    if (run.stopped) throw new C.drive.DriveError("Stopped.", "cancelled");
    // Merging can't stop halfway: the clips are written before the index.
    run.merging = true;
    drivePaint();
    await restoreBackup(file, (t) => { const m = /(\d+) of (\d+)/.exec(t); driveSay(t, m ? 0.5 + 0.5 * (m[1] / m[2]) : undefined); });
    renderLibrary();
  } catch (e) {
    if (e && e.code === "cancelled") { toast(t("Restore stopped. Nothing was changed.")); driveRun = null; drivePaint(); return; }
    const told = e instanceof C.drive.DriveError || /Waypage|[\u0590-\u05FF]/.test((e && e.message) || "");
    if (!told) console.error(e);
    toast(told ? e.message : t("Couldn't restore that backup. Try again."));
  }
  driveRun = null;
  drivePaint();
}

// The automatic backup, looked for on opening and on coming back: its
// days (a week unless picked, 1.46.0) since the last one (or since
// connecting, 1.27.1), on Wi-Fi, and not again within six hours of one
// that failed. A browser without a live sign-in asks with a toast.
function driveDue() {
  if (!C.drive.available || !C.drive.on || !C.drive.auto || driveRun || document.hidden) return;
  const l = C.drive.last;
  if (Date.now() - Math.max(l.at || 0, C.drive.since) < C.drive.every * C.drive.DAY || Date.now() - (l.tried || 0) < 6 * 3600e3) return;
  if (!navigator.onLine || C.platform.metered) return;
  if (C.drive.signedIn) { driveBackUp(true); return; }
  if (driveDueSaid) return;
  driveDueSaid = true;
  toast(t("Your Google Drive backup is due"), t("Back up"), () => driveBackUp(false));
}
