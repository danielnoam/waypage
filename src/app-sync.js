// Waypage's shell: sync with GitHub and its history, Google Drive backups
// and the Sync screen (split out of app-saving.js, 2026-11). See app.js
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
const SYNCED_KEEP = ["savedAt", "title", "requested", "tags", "folder", "folderAt", "source", "series", "turn", "fav", "favAt", "folderFav", "folderFavAt", "coverPick", "statusPick", "folderNoStatus", "at", "finished", "readAt", "readOn", "placeAt", "spot", "marks", "noShare", "folderNoShare", "folderTagNew", "folderSeries", "folderIn", "live"];
// While a run of saves is on, sync waits longer (1.2.0): each sync is a
// merge of the whole library, and one after every page landing was a
// stutter every few seconds.
function syncSoon(ms = runs.size ? 20000 : 4000) {
  if (!C.sync.on || C.sync.paused) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { syncTimer = null; if (C.sync.running) syncSoon(ms); else syncNow(); }, ms);
}
// Where you are in a clip (2026-11): sent within a few minutes while you
// read or Narrate, and at once on leaving the clip or the app. A sync 4 s
// after every pause in scrolling, or every paragraph Narrate read, sent
// the whole library.json up each time: the bar's ring hardly stopped,
// and with a big library it came to hundreds of MB a month.
const PLACE_EVERY = 5 * 6e4;
let placeTimer = null;
function placeSoon() {
  unsynced = true;
  if (placeTimer || !C.sync.on || C.sync.paused) return;
  placeTimer = setTimeout(() => { placeTimer = null; if (unsynced) syncSoon(1000); }, PLACE_EVERY);
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
        const kept = new Set(list.map((n) => n.id));
        noteGone(state.pages.filter((p) => !kept.has(p.id) && !p.link && syncsPage(p)));
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
  const d = keys.map((n) => [Number(n), new Set(pages[n].filter((x) => x.t !== "n").map((x) => x.id)).size]).filter((x) => x[1]).sort((a, b) => a[0] - b[0]);
  if (d.length) p.drawn = d; else delete p.drawn;
  // Its comment bubbles' summary, for Highlights (2026-11).
  const noted = keys.flatMap((n) => pages[n].filter((x) => x.t === "n").map((x) => ({ id: x.id, n: Number(n), text: String(x.text || "").slice(0, 4000), c: x.c, ...(x.tags && x.tags.length ? { tags: x.tags } : {}) }))).slice(0, 500);
  if (noted.length) p.noted = noted; else delete p.noted;
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
    maxlength: String(NAME_MAX), enterkeyhint: "done", autocapitalize: "sentences", hidden: "" });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (cleanName(input.value)) then(input.value);
  });
  return input;
}
// Collections and series (2026-11) in one list, each under its name.
const NEW_SERIES = "\u0000series";
function folderRow(p, redraw) {
  let asSeries = false;
  const input = newField("new-collection", t("Name the new collection"), t("New collection"), (v) => {
    const fresh = !allFolders().some((n) => sameTag(n, cleanName(v)));
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
