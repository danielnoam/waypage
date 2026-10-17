// Waypage's shell, part 7 of 7 (1.14.0): wiring the page up, what other
// apps share in, the app updating itself and What's new. The last part,
// so what runs here at load can use anything above. See app.js.
// ---- Wiring ----

// Which Android the library's folder setting is on (placeGroup, app-settings.js).
if (C.platform.android && C.platform.plugin("Files") && C.platform.plugin("Files").where) {
  C.platform.plugin("Files").where().then((w) => { androidSdk = (w && w.sdk) || 0; if (!state.pages.length) renderLibrary(); }).catch(() => {});
}

function route(s) {
  if (s && s.view && s.launch !== LAUNCH) { history.replaceState(null, ""); s = null; }
  const view = s && s.view;
  const inSettings = view === "settings" || (view === "news" && s.over === "settings");
  if (view !== "reader") closeReader();
  if (view !== "menu") closeMenu();
  if (view !== "side") closeSide();
  if (view === "side" && !state.side) history.back();
  if (view !== "select" && !(view === "menu" && s.select)) endSelect();
  if (view !== "feedPick") endFeedPick();
  if (view === "feedPick" && !state.feedPick) history.back();
  if (view !== "news") closeNews();
  if (view !== "downloads") closeDownloads();
  if (view !== "sync") closeSyncPage();
  if (!inSettings) closeSettings();
  else if (!s.section) {
    // Back from a section beside the menu leaves Settings altogether.
    const had = state.section && state.settings && wide.matches && view === "settings";
    closeSection();
    if (had) { history.back(); return; }
  }
  if (view !== "batch") closeBatch();
  if (view === "batch") openBatch("", true, s.folder);
  const part = (view === "part" && s.part) || (["folder", "reader", "menu", "select"].includes(view) && state.part) || null;
  if (part !== state.part) { if (view === "part" || !part) changePart(part); else { state.part = part; renderLibrary(); } }
  const folder = ["folder", "reader", "batch", "select", "menu"].includes(view) && s.folder;
  if (!folder) closeFolder();
  else if (!state.folder) openFolder(folder, true);
  if (view === "select") startSelect([], true);
  // A sheet isn't rebuilt going forward: step back off it instead.
  if (view === "menu" && !state.menu) history.back();
  if (view === "reader" && String(s.page).startsWith("preview:") && !(state.open && state.open.id === s.page)) { history.back(); return; }
  if (view === "reader" && (!state.open || state.open.id !== s.page)) openPage(s.page, true);
  if (state.image && !(view === "reader" && s.image)) closeImage();
  if (view === "reader" && s.image && !state.image) history.back();
  if (state.finding && !(view === "reader" && s.find)) closeFind(true);
  if (view === "reader" && s.find && !state.finding) history.back();
  if (view === "reader" && s.sheet !== state.sheet) closeSheet();
  if (view === "reader" && s.sheet && state.open && state.open.id === s.page) openSheet(s.sheet, true);
  if (inSettings) { openSettings(true); if (s.section) openSection(s.section, true); }
  if (view === "news") openNews(true);
  if (view === "downloads") openDownloads(true);
  if (view === "sync") openSyncPage(true);
}

// Back to the library from whatever screen is up, through history so the
// stack stays honest; resolves once it's there.
function toLibrary() {
  if (!(history.state && history.state.view)) return Promise.resolve();
  return new Promise((resolve) => {
    addEventListener("popstate", () => resolve(), { once: true });
    history.go(-[state.folder, state.open, state.sheet, state.image, state.settings, state.section, state.batch, state.news, state.select, state.feedPick, state.menu, state.downloads, state.syncPage, state.side, state.part, state.finding].filter(Boolean).length || -1);
  });
}

$("settingsBtn").addEventListener("click", () => openSettings());
$("sideBtn").addEventListener("click", openSide);
fitWidth();
wide.addEventListener("change", fitWidth);
pinned.addEventListener("change", fitWidth);
holdFeeds($("feeds"));
holdFeeds($("sidebar"));
swipeToSide($("libraryView"));
dragSide();
pullToCheck($("libraryView"));
$("sideCatch").addEventListener("click", () => history.back());
$("downloadsBtn").addEventListener("click", () => openDownloads());
$("syncBtn").addEventListener("click", () => openSyncPage());
$("syncBack").addEventListener("click", () => history.back());
$("downloadsBack").addEventListener("click", () => history.back());
$("screenCatch").addEventListener("click", () => history.back());
$("readKeys").addEventListener("click", () => openMenu("keys"));
// The notification's Stop (Android) stops every run.
C.platform.downloads.onStop(() => {
  for (const r of [...runs]) stopRun(r);
  pauseUpdate();
  if (C.sync.on && (C.sync.running || syncQueue.length || fetchingPictures)) pauseSync(true);
});
$("sectionBack").addEventListener("click", () => history.back());
// Search's button sits in the bar that stays, so it's there from anywhere
// in the list. A second tap, with the field empty or in view, puts it away.
$("searchBtn").addEventListener("click", () => {
  const box = $("searchBox");
  if (!box.hidden && (!state.query || box.getBoundingClientRect().bottom > $("topBar").offsetHeight)) closeSearch();
  else openSearch();
});
$("librarySearch").addEventListener("blur", () => { if (!state.query) { searchOpen = false; setTimeout(paintSearch, 150); } });
// The bar gets its hairline once the list scrolls under it.
const topBar = $("topBar");
addEventListener("scroll", () => topBar.classList.toggle("scrolled", scrollY > 0), { passive: true });
$("selectCancel").addEventListener("click", () => history.back());
$("selectAll").addEventListener("click", () => (state.feedPick ? pickAllPosts() : selectAll()));
$("selOpen").addEventListener("click", openPickedPosts);
$("selSave").addEventListener("click", savePickedPosts);
$("selTags").addEventListener("click", () => openMenu("tags"));
$("selFolder").addEventListener("click", () => openMenu("folder"));
$("selRead").addEventListener("click", readPicked);
$("selDelete").addEventListener("click", deletePicked);
$("selEdit").addEventListener("click", editPicked);
$("menuCatch").addEventListener("click", () => history.back());
longPress($("library"));
longPress($("folderBody"));
$("settingsBack").addEventListener("click", () => history.go(state.section && wide.matches ? -2 : -1));
$("folderBack").addEventListener("click", () => history.back());
$("folderMore").addEventListener("click", openFolderMenu);
$("folderCancel").addEventListener("click", () => setFolderMode(""));
$("folderDone").addEventListener("click", async () => {
  if (folderMode === "rename" && !(await renameFolder($("folderBody").querySelector(".book-title-input").value))) return;
  setFolderMode("");
});
$("folderBody").addEventListener("scroll", paintFolderTitle, { passive: true });
// Escape steps out of Reorder, the story page or Export; Rename's field
// handles its own.
$("folderView").addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !e.defaultPrevented && folderMode && !state.menu && !state.select) { e.preventDefault(); setFolderMode(""); }
});
$("batchBack").addEventListener("click", () => history.back());
// What's typed in the save field comes along, so one link can be saved
// as a comic or with other images.
$("severalBtn").addEventListener("click", () => { const typed = $("saveUrl").value; $("saveUrl").value = ""; openBatch(typed); });
$("librarySearch").addEventListener("input", onSearch);
$("librarySearch").addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  e.preventDefault();
  if (state.query) clearSearch();
  else { closeSearch(); $("searchBtn").focus(); }
});
$("searchClear").addEventListener("click", () => { clearSearch(); $("librarySearch").focus(); });
$("newsBack").addEventListener("click", () => history.back());

$("saveForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (state.place === "feeds") {
    const typed = $("saveUrl").value.trim();
    $("saveUrl").value = "";
    $("saveUrl").blur();
    openMenu("addFeed", { url: typed });
    return;
  }
  if (linksFrom($("saveUrl").value).length > 1) {
    openBatch($("saveUrl").value);
    $("saveUrl").value = "";
    $("saveUrl").blur();
    return;
  }
  const url = linkFrom($("saveUrl").value);
  if (!url) { toast("That doesn't look like a link. Paste the page's address."); return; }
  $("saveUrl").value = "";
  $("saveUrl").blur();
  savePage(url);
});

$("readerBack").addEventListener("click", () => history.go(state.sheet || state.image ? -2 : -1));
// A button closes its own sheet, and swaps the other one in place (one
// history entry for whichever sheet is up).
function toggleSheet(kind) {
  if (state.sheet === kind) { history.back(); return; }
  if (state.sheet) history.replaceState(readerState(state.open, kind), "");
  openSheet(kind, !!state.sheet);
}
$("readerMore").addEventListener("click", () => toggleSheet("page"));
$("readerAa").addEventListener("click", () => toggleSheet("reading"));
$("readerMarks").addEventListener("click", () => { if (state.sheet !== "marks") markFocus = null; toggleSheet("marks"); });
$("readerContents").addEventListener("click", () => toggleSheet("contents"));
$("readerFolder").addEventListener("click", () => toggleSheet("folder"));
$("sheetCatch").addEventListener("click", () => history.back());
dragToClose($("readingSheet"), null, () => !!state.sheet && !$("readingSheet").dataset.pop, () => history.back());
dragToClose($("menuSheet"), $("menuCatch"), () => !!state.menu && !wide.matches, () => history.back());
addEventListener("keydown", onKeys);
addEventListener("popstate", (e) => route(e.state));
addEventListener("online", () => { showOffline(); renderLibrary(); });
addEventListener("offline", () => { showOffline(); renderLibrary(); });

// ---- Shared from another app (Android) ----
// native/share hands over what Chrome's share sheet sent: usually the
// link, sometimes "Title https://…". Saved straight away.
// 0.31.0 kept the file beside the clip it made; 0.32.0 doesn't, so the
// copies it left are given back. Once, quietly.
const TIDIED_KEY = "waypage.tidiedFiles";
async function tidyOldFiles() {
  if (!C.platform.native || load(TIDIED_KEY, false)) return;
  store(TIDIED_KEY, true);
  let freed = 0;
  for (const p of state.pages.filter((x) => x.file && x.file.ext && !x.link)) {
    const went = await C.store.removeFile(p.id, "original." + p.file.ext).catch(() => 0);
    if (went) { freed += went; p.bytes = Math.max(0, (p.bytes || 0) - went); }
  }
  if (freed) await C.store.writeIndex(state.pages);
}

async function saveShared() {
  const share = C.platform.plugin("ShareTarget");
  if (!share) return;
  let got;
  try { got = await share.take(); } catch (e) { return; }
  // A file opened with Waypage, or shared to it (0.31.0): copied into
  // the app's cache by the plugin, read back through the WebView.
  if (got && got.file) {
    await toLibrary();
    try {
      const cap = window.Capacitor;
      const r = await fetch(cap && cap.convertFileSrc ? cap.convertFileSrc(got.file.uri) : got.file.uri);
      if (!r.ok) throw new Error("unreadable");
      const blob = await r.blob();
      await openFile(new File([blob], got.file.name || "file", { type: got.file.mime || blob.type }), null, true, got.file.link || undefined);
    } catch (e) { toast("Couldn't read that file. Try opening it again."); }
    return;
  }
  if (!got || !got.text) return;
  if (sharedWords(got.text)) { await toLibrary(); saveText(got.text, got.subject); return; }
  if (linksFrom(got.text).length > 1) { await toLibrary(); openBatch(got.text); return; }
  const url = linkFrom(got.text);
  if (!url) { toast("That share had no link in it."); return; }
  await toLibrary();
  savePage(url);
}

// Text shared on its own (1.10.0), say an email's words selected in Gmail,
// which has no way to share a whole message: a clip of its own, titled
// by the share's subject or its first line. Text with no link in it, or
// a link with a long passage around it (a link with a line or two about
// it is still the link, saved as before).
function sharedWords(text) {
  const t = String(text).trim();
  const links = linksFrom(t);
  if (!links.length) return !linkFrom(t) && /\S/.test(t);
  let rest = t;
  for (const u of links) rest = rest.split(u).join(" ");
  return (rest.match(/\S+/g) || []).length >= 60;
}
async function saveText(text, subject) {
  const t = String(text).replace(/\r\n?/g, "\n").trim();
  const first = (t.replace(/https?:\/\/\S+/gi, " ").split("\n").find((l) => l.trim()) || "").replace(/\s+/g, " ").trim() || "Shared text";
  const title = (subject && subject.trim() !== t ? subject.trim() : "") || (first.length > 80 ? first.slice(0, 80).replace(/\s+\S*$/, "") + "…" : first);
  try {
    const meta = await C.files.bring(new File([t], "Shared text.txt", { type: "text/plain" }), "txt", { title });
    state.pages.unshift(meta);
    await C.store.writeIndex(state.pages);
    await loadThumbs();
    C.store.keepStored();
    renderLibrary();
    toast("Saved “" + meta.title + "”", "Open", () => openPage(meta.id));
  } catch (e) {
    if (!(e instanceof C.files.FileError)) console.error(e);
    toast("Couldn't keep that text. Free some space and try again.");
  }
}

// How long opening took (1.21.0), kept for the last few starts and shown
// under Report a problem (1.28.3, About until then) and in the report:
// the scripts, the library read from disk, and the first screen drawn. Measured from the page starting to
// load, so not the phone starting the app around it.
const START_KEY = "waypage.startTimes";
const startAt = { scripts: performance.now() };
function noteStart() {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const t = { at: Date.now(), clips: state.pages.length, scripts: Math.round(startAt.scripts), library: Math.round(startAt.library - startAt.scripts), shown: Math.round(performance.now()) };
    store(START_KEY, [...load(START_KEY, []), t].slice(-5));
  }));
}
function startLine() {
  const list = load(START_KEY, []);
  const t = list[list.length - 1];
  if (!t) return "";
  const s = (ms) => (ms / 1000).toFixed(1) + " s";
  return "Opened in " + s(t.shown) + " with " + countLine(t.clips) + ": scripts " + s(t.scripts) + ", library " + s(t.library) + ", first screen " + s(t.shown - t.scripts - t.library) + ".";
}

paintPlace();
// The library is read as soon as its place is known, beside the build's
// details rather than after them (1.2.0).
const firstIndex = C.store.ready.then(() => Promise.all([C.store.readIndex(), loadThumbs()])).then((got) => { startAt.library = performance.now(); return got; });
Promise.all([C.platform.ready, firstIndex]).then(([, [pages]]) => {
  // Google's sign-in window, back at this address only to hand over.
  if (C.drive.closing) {
    document.body.replaceChildren(el("p", { class: "drive-done" }, "Google Drive is connected. You can close this window."));
    return;
  }
  state.pages = Array.isArray(pages) ? pages : [];
  loaded = true;
  setTimeout(() => oneEach().then((n) => { if (n) toast("Removed " + (n === 1 ? "a clip that was" : n + " clips that were") + " saved twice."); }), 1200);
  if (history.state && history.state.view) history.replaceState(null, "");
  paintPlace();
  noteStart();
  noteVersion();
  if (C.store.problem) setTimeout(() => toast(C.store.problem), 800);
  tidyOldFiles();
  loadUserFonts().catch(() => {});
  const share = C.platform.plugin("ShareTarget");
  if (share && share.addListener) share.addListener("shared", saveShared);
  saveShared();
  showWaiting();
  setTimeout(saveWaiting, 1000);
  setTimeout(() => dailyCheck(false), 1500);
  setTimeout(() => checkFeeds(false), 3000);
  // Feeds followed before 0.28.4 are handed over once, with the ask.
  if (feeds.length && !load(FEEDS_ASKED_KEY, false)) { store(FEEDS_ASKED_KEY, true); askToNotify = true; }
  watchFeeds();
  takeFeedNews();
  C.platform.feedChecks.onOpen(takeFeedNews);
  takeWidget();
  C.platform.widgets.onOpen(takeWidget);
  updateWidgets();
  C.store.onIndex = () => { unsynced = true; syncSoon(); };
  takeSetupLink();
  takeSend();
  setTimeout(healPictures, 4000);
  addEventListener("hashchange", takeSetupLink);
  setTimeout(() => syncNow(), 2000);
  setTimeout(fetchPictures, 3000);
  if (C.drive.resume === "connect") driveConnect(null);
  else if (C.drive.resume === "backup") driveBackUp(false);
  else setTimeout(driveDue, 8000);
  paintSync();
  watchSoon(2500);
  document.addEventListener("visibilitychange", () => {
    // Going to another app (1.21.0): what's written is sent once it's on
    // disk. Before, it went only if a sync was already waiting, and a
    // place read just now usually wasn't one yet.
    if (document.hidden) {
      if (state.open) C.reader.settle();
      const writes = [flushIndex()];
      if (positionTimer) writes.push(savePositions());
      updateWidgets();
      Promise.all(writes).then(() => { if (unsynced || syncTimer) syncNow(); });
      return;
    }
    takeFeedNews();
    takeWidget();
    syncSoon(1000);
    watchSoon(800);
    setTimeout(driveDue, 3000);
  });
});
addEventListener("online", () => { saveWaiting(); dailyCheck(false); checkFeeds(false); syncSoon(1000); fetchPictures(); });
setInterval(() => { if (!document.hidden) syncNow(); }, 5 * 6e4);
// Between those, a cheap look every minute (1.3.0): an unchanged library
// is a 304 GitHub doesn't count, so a device reading alongside catches
// up within the minute.
setInterval(async () => {
  if (document.hidden || !C.sync.on || C.sync.paused || C.sync.running || !navigator.onLine) return;
  let moved = false;
  try { moved = await C.sync.poll(); } catch (e) { moved = false; }
  if (moved) syncNow();
}, 6e4);
// Feeds are due every few hours; asked about while the app is open.
setInterval(() => checkFeeds(false), 15 * 6e4);

// ---- The app updating itself (from LifeLog's 0.179.0) ----
// A newer build is a newer APK on this repo's Releases, tagged
// app-v<APP_VERSION> by .github/workflows/android.yml, whose notes are
// that version's CHANGELOG.md section. Asked once per launch,
// unauthenticated: the Releases are public. The work lives in Settings'
// Updates section; the library's bar is only the nudge that leads there.
function isNewerVersion(a, b) {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// `upd`, the update's state, is in app.js: Downloads shows it (1.23.0).

function setUpd(change) {
  const was = upd.phase + upd.error;
  Object.assign(upd, change);
  paintUpdateBar();
  if (was !== upd.phase + upd.error || !("pct" in change)) {
    if (state.settings) renderSettings();
    if (state.section === "updates" && $("updatesSection")) $("updatesSection").replaceWith(updatesGroup());
    renderDownloads();
  } else {
    if (state.section === "updates" && $("updatesSection")) $("updatesSection").replaceWith(updatesGroup());
    paintUpdateCard();
  }
}

async function checkForNewerApp() {
  const build = await C.platform.ready;
  if (!C.platform.native || !build || !build.repo) return;
  if (["checking", "downloading", "paused"].includes(upd.phase)) return;
  C.platform.clearOldUpdates(APP_VERSION, isNewerVersion);
  setUpd({ phase: "checking" });
  try {
    const res = await C.platform.fetchText("https://api.github.com/repos/" + build.repo + "/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } });
    if (res.status !== 200) throw new Error("HTTP " + res.status);
    const release = JSON.parse(res.text);
    const latest = String(release.tag_name || "").replace(/^app-v/, "");
    if (/^\d+\.\d+\.\d+$/.test(latest) && isNewerVersion(latest, APP_VERSION)) {
      setUpd({ phase: upd.latest === latest && upd.apk ? "ready" : "available", latest, notes: String(release.body || "") });
    } else setUpd({ phase: "current" });
  } catch (e) {
    setUpd({ phase: "failed", error: "Couldn't check. Try again when you're online." });
  }
}

// Android downloads the APK with its progress, then opens the installer;
// if that's dismissed, Install reopens it from the same file. iOS installs
// nothing an app hands it: a sideloaded build is updated from AltStore or
// SideStore, so there it opens the release.
// The download is a card in Downloads (1.23.0), with Pause and Resume,
// and goes on with the app put away; a paused one picks up where it
// stopped, even after the app was closed.
let installWhenBack = false;
async function startUpdate() {
  if (C.platform.ios) { C.platform.openOutside(C.platform.releasesUrl()); return; }
  if (upd.phase === "ready") return install();
  if (upd.phase === "downloading") { openDownloads(); return; }
  const resuming = upd.phase === "paused";
  setUpd({ phase: "downloading", error: "" });
  if (!resuming && !state.downloads) toast("Downloading Waypage " + upd.latest + ".", "Downloads", () => openDownloads());
  let apk;
  try {
    apk = await C.platform.downloadUpdate(upd.latest, (f, bytes, total) => setUpd({ pct: Math.round(f * 100), bytes: bytes || 0, total: total || 0 }));
  } catch (e) {
    if (e && e.code === "PAUSED") { setUpd({ phase: "paused" }); return; }
    setUpd({ phase: "paused", error: "The download stopped. Resume picks up where it was." });
    return;
  }
  if (!apk) {
    setUpd({ phase: "available" });
    C.platform.openOutside(C.platform.apkUrl());
    return;
  }
  setUpd({ phase: "ready", apk, error: "", pct: 100 });
  // Android won't open the installer over another app: it opens when
  // Waypage is back.
  if (document.hidden) installWhenBack = true;
  else install();
}
function pauseUpdate() {
  if (upd.phase === "downloading") C.platform.pauseUpdate();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !installWhenBack) return;
  installWhenBack = false;
  if (upd.phase === "ready") install();
});

async function install() {
  try {
    await C.platform.openInstaller(upd.apk);
  } catch (e) {
    setUpd({ error: "Couldn't open the installer. Try again." });
  }
}

// The library's bar: a newer version is out (View opens Settings at
// Updates), or this one just arrived (What's new). × puts it away.
let barDismissed = null;
function paintUpdateBar() {
  const bar = $("updateBar");
  const out = UPD_OUT.includes(upd.phase) && upd.latest;
  const fresh = !out && justUpdated;
  const key = out ? "out:" + upd.latest : fresh ? "new:" + APP_VERSION : null;
  if (!key || barDismissed === key) {
    bar.hidden = true;
    return;
  }
  $("updateText").textContent = out
    ? (upd.phase === "downloading" ? "Downloading " + upd.latest + " · " + upd.pct + "%" : upd.phase === "paused" ? "Paused: Waypage " + upd.latest + " · " + upd.pct + "%"
      : upd.phase === "ready" ? "Waypage " + upd.latest + " is ready to install" : "Waypage " + upd.latest + " is out")
    : "Updated to " + APP_VERSION;
  const btn = $("updateBtn");
  btn.textContent = out ? "View" : "What's new";
  btn.onclick = () => (out && upd.phase !== "available" ? openDownloads() : out ? openSettings(false, "updates") : openNews());
  $("updateClose").onclick = () => {
    barDismissed = key;
    if (fresh) justUpdated = false;
    M.edgeOut(bar).then(() => { if (barDismissed === key) bar.hidden = true; });
  };
  if (bar.hidden) {
    bar.hidden = false;
    M.edgeIn(bar);
  }
}

// Shown once after an update arrives: the version seen last is kept, and
// a library that existed before this was kept counts as an update.
let justUpdated = false;
function noteVersion() {
  const seen = load(SEEN_KEY, null);
  justUpdated = seen ? isNewerVersion(APP_VERSION, seen) : state.pages.length > 0;
  store(SEEN_KEY, APP_VERSION);
  paintUpdateBar();
}

// Updates and About in one (0.30.2): the version is the button that
// checks for a newer one, then What's new.
function updatesGroup() {
  const list = el("div", { class: "group" });
  if (C.platform.native) {
    const out = UPD_OUT.includes(upd.phase);
    const status = {
      idle: "Tap to check for updates", checking: "Checking…", current: "You have the latest version",
      failed: upd.error, available: "Waypage " + upd.latest + " is out",
      downloading: "Downloading " + upd.latest + " · " + upd.pct + "%", paused: "Paused at " + upd.pct + "%", ready: "Waypage " + upd.latest + " is ready to install",
    }[upd.phase];
    const busy = upd.phase === "checking";
    const version = el("button", { class: "row update-row" + (out ? " out" : ""), type: "button", onclick: () => (out ? startUpdate() : checkForNewerApp()) },
      busy ? el("span", { class: "spinner", "aria-hidden": "true" }) : null,
      el("span", { class: "choice-text" },
        el("span", { class: "row-label" }, "Version " + APP_VERSION),
        el("span", { class: "choice-note" + (out ? " accent" : upd.phase === "failed" ? " warn" : ""), role: "status" }, status)),
      out ? el("span", { class: "btn-small", "aria-hidden": "true" }, upd.phase === "downloading" ? upd.pct + "%" : C.platform.ios ? "Get it" : upd.phase === "ready" ? "Install" : upd.phase === "paused" ? "Resume" : "Update") : null);
    version.disabled = busy;
    list.append(version);
    if (out && upd.error) list.append(el("div", { class: "row" }, el("span", { class: "row-label warn" }, upd.error)));
  } else {
    list.append(el("div", { class: "row" }, el("span", { class: "row-label" }, "Version"), el("span", { class: "row-value" }, APP_VERSION)));
  }
  list.append(el("button", { class: "row", type: "button", onclick: () => openNews() },
    el("span", { class: "row-label accent" }, "What's new"), el("span", { class: "row-value", "aria-hidden": "true" }, "›")));
  return el("section", { class: "settings-section", id: "updatesSection" }, list);
}

// ---- What's new ----
// CHANGELOG.md, bundled with the app, read into versions of headed lists.

function changelogEntries(md) {
  const out = [];
  let entry = null, section = null, item = null;
  for (const line of String(md).split("\n")) {
    let m;
    if ((m = line.match(/^## \[([^\]]+)\](?:\s*-\s*(\S+))?/))) { entry = { version: m[1], date: m[2] || "", sections: [] }; out.push(entry); section = item = null; }
    else if (!entry) continue;
    else if ((m = line.match(/^### (.+)/))) { section = { title: m[1].trim(), items: [] }; entry.sections.push(section); item = null; }
    else if ((m = line.match(/^\s*[-*] (.+)/))) {
      if (!section) { section = { title: "", items: [] }; entry.sections.push(section); }
      item = m[1].trim();
      section.items.push(item);
    } else if (line.trim() && section && section.items.length && /^\s/.test(line)) {
      section.items[section.items.length - 1] += " " + line.trim();
    } else if (!line.trim()) item = null;
  }
  // Markdown's marks aren't needed to read a line.
  for (const e of out) for (const sec of e.sections) sec.items = sec.items.map((t) => t.replace(/\*\*|`/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
  return out;
}

function notesView(entries) {
  return entries.flatMap((e) => e.sections.map((sec) => el("div", { class: "news-section" },
    sec.title ? el("h4", { class: "news-kind" }, sec.title) : null,
    el("ul", { class: "news-list" }, ...sec.items.map((t) => el("li", null, t))))));
}

let changelog = null;
async function readChangelog() {
  if (changelog) return changelog;
  try {
    const res = await fetch("CHANGELOG.md?v=" + APP_VERSION);
    if (!res.ok) throw new Error("HTTP " + res.status);
    changelog = changelogEntries(await res.text());
  } catch (e) {
    changelog = null;
  }
  return changelog;
}

async function openNews(fromHistory) {
  if (state.news) return;
  state.news = true;
  const over = state.settings ? "settings" : undefined;
  if (!fromHistory) history.pushState({ view: "news", over, section: state.section || undefined }, "");
  justUpdated = false;
  paintUpdateBar();
  $("newsBody").replaceChildren(el("p", { class: "meta" }, "Loading…"));
  $("newsBody").scrollTop = 0;
  pushScreen($("newsView")).then(() => $("newsBack").focus());
  const entries = await readChangelog();
  if (!state.news) return;
  $("newsBody").replaceChildren(...(entries && entries.length ? entries.map((e) => el("section", { class: "news-entry" + (e.version === APP_VERSION ? " now" : "") },
    el("h2", { class: "news-version" }, e.version, e.version === APP_VERSION ? el("span", { class: "news-you" }, "You have this") : null),
    e.date ? el("p", { class: "meta" }, formatDay(e.date)) : null,
    ...notesView([e]))) : [el("p", { class: "empty-text" }, "The list of changes didn't load.")]));
}

function closeNews() {
  if (!state.news) return;
  state.news = false;
  popScreen($("newsView"));
}

function formatDay(iso) {
  const d = new Date(iso + "T12:00:00");
  return isNaN(d) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

checkForNewerApp();

if (!C.platform.native && "serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

C.linkFrom = linkFrom;
C.isNewerVersion = isNewerVersion;