// Waypage's shell: Kiwix packs and books kept as files (2026-11). A pack
// (a .zim: Wikipedia, Wiktionary, Stack Exchange...) is found in
// Discover › Sites › Kiwix, downloaded where the person picks (the + sheet
// in app-discover.js) and read from there, in Files: never synced or
// backed up. Its clip shows one article at a time (files.js openZim);
// links between articles stay in the pack and Back steps back through
// them (each article is its own history entry, `pack` in readerState);
// Find searches the pack's titles; Save this article makes a clip of it.
// The same + downloads a Gutenberg or Standard Ebooks book as an EPUB
// file kept where it's picked, or as a collection of clips.
// See app.js for the order these files load in.

// The + sheet's answer: { as: "file" | "clips", where, wifi }.
async function dzAddGo(s, how) {
  if (s.zim) return packDownload(s, how);
  if (how.as === "clips") return bookAsClips(s);
  return bookAsFile(s, how);
}

// A folder picked for a download, asked before it starts (the app only).
async function pickedTree(how) {
  if (how.where !== "folder" || !C.platform.native) return null;
  let got = null;
  try { got = await C.platform.files.pickFolder(); } catch (e) { got = null; }
  return got ? got.ref : false;
}

// A card in the library and Downloads while a file comes, with how far.
// Its Pause and Stop (1.65.0 had neither) pause Downloads' fetch, which
// keeps what came; `keep` downloads through it and, after a pause, goes
// on from there once Resume is pressed. Stopped, it throws "stopped".
let keepingRun = null;
function keepRun(title, label) {
  const run = Object.assign(startRun(null, title, 1), { label, files: true, keep: true, now: t("Starting") });
  runChanged();
  const progress = (bytes, total) => {
    run.part = total > 0 ? Math.min(1, bytes / total) : null;
    run.now = total > 0 ? t("{done} of {total}", { done: formatSize(bytes), total: formatSize(total) }) : formatSize(bytes);
    updateRunCard(run);
  };
  const done = () => { run.now = null; if (keepingRun === run) keepingRun = null; runs.delete(run); runChanged(); };
  const keep = async (url, name, where, tree, onProgress) => {
    for (;;) {
      if (!(await gate(run))) throw new Error("stopped");
      try {
        return await C.platform.keepFile(url, name, where, (bytes, total) => {
          keepingRun = run;
          if (run.paused || run.stopped) { C.platform.pauseKeep(); return; }
          (onProgress || progress)(bytes, total);
        }, tree);
      } catch (e) {
        if (!(e && e.code === "PAUSED") && !run.paused && !run.stopped) throw e;
        if (run.stopped) throw new Error("stopped");
        run.now = t("Paused");
        updateRunCard(run);
      } finally {
        if (keepingRun === run) keepingRun = null;
      }
    }
  };
  return { run, progress, done, keep };
}
// Pause and Stop on a file's card: the download in progress stops now.
function keepHalt(r) {
  if (r && r.keep && keepingRun === r) C.platform.pauseKeep();
}

// ---- Packs ----

const packFileName = (s) => decodeURIComponent(String(s.file || "").split("/").pop() || "pack.zim");
const packHere = (s) => state.pages.find((p) => p.zim && p.file && p.file.name === packFileName(s));
const packsComing = new Set();

async function packDownload(s, how) {
  const had = packHere(s);
  if (had) { toast(t("It's in your library already.")); openPage(had.id); return; }
  if (packsComing.has(s.file)) { toast(t("It's downloading. It's in Downloads.")); return; }
  // A browser can't keep a file where Waypage reads it again: the browser
  // downloads it, and Add a file brings it in.
  if (!C.platform.native) {
    C.platform.openOutside(s.file);
    toast(t("Your browser downloads it. Then add it with Add a file."));
    return;
  }
  const tree = await pickedTree(how);
  if (tree === false) return;
  if (!navigator.onLine) { toast(t("You're offline. Download it when you're back online.")); return; }
  packsComing.add(s.file);
  const k = keepRun(t("Downloading a pack"), s.title);
  renderDiscoverSoon();
  try {
    // Big packs wait for Wi-Fi when asked, shown as waiting.
    while (how.wifi && C.platform.metered && !k.run.stopped) {
      k.run.now = t("Waiting for Wi-Fi");
      updateRunCard(k.run);
      await new Promise((go) => wifiWaiters.push(go));
    }
    const ref = await k.keep(s.file, packFileName(s), how.where, tree);
    k.run.now = t("Opening");
    updateRunCard(k.run);
    const file = await C.platform.files.blob(ref, s.size);
    await openFile(file, null, false, ref, { ref });
    const got = state.pages.find((p) => p.link === ref && p.zim);
    if (got && how.where !== "folder") { got.zim.ours = true; await C.store.writeIndex(state.pages); }
  } catch (e) {
    toast(k.run.stopped ? t("Stopped.") : t("Couldn't download {title}. Try again: it goes on from where it stopped.", { title: s.title }));
  } finally {
    packsComing.delete(s.file);
    k.done();
    renderDiscoverSoon();
  }
}
const renderDiscoverSoon = () => { if (state.place === "discover") renderDiscover(); };

// ---- Reading a pack ----

// Where each article was left this visit, so Back goes back to the place.
const packPlaces = new Map();
let packBusy = false;

// A link in the open pack's article: another article, read here.
function packLink(href) {
  const p = state.open;
  if (!p || !p.zim) return false;
  const to = C.files.zimLink(p, href);
  if (!to) return false;
  packGo(p, to.path, to.hash);
  return true;
}

// One at a time; a Back pressed while an article comes is done after it.
let packNext = null;
async function packGo(p, path, hash, fromHistory) {
  if (state.open !== p) return;
  if (packBusy) { packNext = [p, path, hash, fromHistory]; return; }
  packBusy = true;
  const was = p.zim.at, wasAt = p.at || 0;
  try {
    if (path === was && !fromHistory) { if (hash) packJump(hash); return; }
    if (positionTimer) savePositions();
    packPlaces.set(p.id + ":" + was, p.at || 0);
    let html = null;
    try { html = await C.files.openZim(p, path); } catch (e) { html = null; }
    if (!html || state.open !== p) {
      p.zim.at = was;
      toast(t("That page isn't in this pack."));
      if (fromHistory) history.replaceState(readerState(p), "");
      return;
    }
    p.at = fromHistory ? packPlaces.get(p.id + ":" + p.zim.at) || 0 : 0;
    delete p.spot;
    delete p.spotWords;
    if (!fromHistory) history.pushState(readerState(p), "");
    await show(p, html);
    C.files.drawNear($("readerFrame"));
    if (hash) C.reader.placed().then(() => packJump(hash));
    C.store.writeIndex(state.pages).catch(() => {});
  } catch (e) {
    p.zim.at = was;
    p.at = wasAt;
  } finally {
    packBusy = false;
    const next = packNext;
    packNext = null;
    if (next) packGo(...next);
  }
}
function packJump(hash) {
  const d = $("readerFrame").contentDocument;
  let id = hash;
  try { id = decodeURIComponent(hash); } catch (e) { /* as is */ }
  const to = d && d.getElementById(id);
  if (to) to.scrollIntoView({ block: "start" });
}

// The pack's rows in the reader's sheet.
function packRows(p) {
  const go = (f) => () => back().then(f);
  return [el("h3", { class: "overline" }, t("This pack")),
    el("div", { class: "group" },
      menuRow(t("Search this pack"), go(() => openSheet("packSearch"))),
      p.zim.main && p.zim.at !== p.zim.main ? menuRow(t("Main page"), go(() => packGo(p, p.zim.main))) : null,
      menuRow(t("Save this article"), go(() => packSave(p))))];
}

async function packSave(p) {
  toast(t("Saving “{title}”…", { title: C.reader.frameDoc && C.reader.frameDoc.title || p.title }));
  try {
    const meta = await C.files.zimSave(p);
    const had = meta.url && savedAs(meta.url);
    state.pages.unshift(meta);
    await C.store.writeIndex(state.pages);
    await loadThumbs();
    C.store.keepStored();
    renderLibrary();
    toast(had ? t("Saved again as a clip of its own") : t("Saved “{title}”", { title: meta.title }));
  } catch (e) {
    toast(e instanceof C.files.FileError ? e.message : t("Couldn't save this article. Try again."));
  }
}

// Find in a pack: its titles, as you type.
const packFind = { id: null, q: "", hits: [] };
function packSearchSheet() {
  const p = state.open;
  if (!p || !p.zim) return el("div");
  if (packFind.id !== p.id) Object.assign(packFind, { id: p.id, q: "", hits: [] });
  const input = el("input", { class: "tag-input", type: "search", value: packFind.q, placeholder: t("An article's title"), "aria-label": t("Search this pack"), autocomplete: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  const meta = el("p", { class: "meta" });
  const list = el("div", { class: "group pack-hits" });
  let asked = 0;
  const draw = () => {
    const q = packFind.q.trim();
    meta.textContent = !q ? p.title : packFind.hits.length ? "" : t("No article starts with that.");
    list.hidden = !packFind.hits.length;
    list.replaceChildren(...packFind.hits.map((h) => el("button", { class: "row", type: "button", onclick: () => back().then(() => packGo(p, h.path)) },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, h.title)))));
  };
  const run = async () => {
    const q = packFind.q.trim(), mine = ++asked;
    if (!q) { packFind.hits = []; draw(); return; }
    let hits = [];
    try { hits = await C.files.zimSearch(p, q, 30); } catch (e) { hits = []; }
    if (mine !== asked) return;
    packFind.hits = hits;
    if (list.isConnected) draw();
  };
  let timer = 0;
  input.addEventListener("input", () => { packFind.q = input.value; clearTimeout(timer); timer = setTimeout(run, 150); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    clearTimeout(timer);
    if (packFind.hits[0]) back().then(() => packGo(p, packFind.hits[0].path)); else run();
  });
  draw();
  setTimeout(() => { if (input.isConnected) input.focus(); }, 300);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Search this pack")), meta),
    el("div", { class: "group" }, el("div", { class: "row" }, input)),
    list);
}
SHEETS.packSearch = { button: "readerMore", label: t("Search this pack"), build: packSearchSheet };

// A pack Waypage downloaded into one of its own places goes when its clip
// is removed; one in a picked folder, or added from anywhere, stays.
function dropPackFile(p) {
  if (!p.zim || !p.link) return;
  C.files.forgetPack(p.link);
  if (p.zim.ours) C.platform.dropKept(p.link);
}

// ---- Books kept as files ----

async function bookAsFile(s, how) {
  if (dzSavedStory(s)) { toast(t("It's in your library already.")); return; }
  if (!navigator.onLine) { toast(t("You're offline. Add it when you're back online.")); return; }
  const name = dzBookName(s);
  if (C.platform.native) {
    const tree = await pickedTree(how);
    if (tree === false) return;
    const k = keepRun(t("Downloading a book"), s.title);
    try {
      const ref = await k.keep(s.epub, name, how.where, tree);
      const file = await C.platform.files.blob(ref, 0);
      k.done();
      await openFile(file, null, false, ref, { ref });
    } catch (e) {
      k.done();
      toast(k.run.stopped ? t("Stopped.") : t("Couldn't download it just now. Try again later{x}", { x: t(", or open it on the site.") }));
    }
    return;
  }
  // A browser keeps a lasting hold only on a file saved through its own
  // picker (Chrome and Edge); elsewhere the book is copied in.
  toast(t("Downloading “{replace}”…", { replace: s.title }));
  let file;
  try { file = await fetchFileLink(s.epub, name); } catch (e) { toast(t("Couldn't download it just now. Try again later{x}", { x: t(", or open it on the site.") })); return; }
  const kept = await C.platform.saveLinked(file, name, "application/epub+zip").catch(() => ({ saved: null, ref: null }));
  if (kept.saved === false) return;
  await openFile(file, null, false, kept.ref || null, kept.ref ? { ref: kept.ref } : {});
}

async function bookAsClips(s) {
  if (!navigator.onLine) { toast(t("You're offline. Add it when you're back online.")); return; }
  if (!C.platform.canReadPages) { toast(t("This browser can't download from that site. Add it in Waypage on your phone.")); return; }
  const k = keepRun(t("Adding a book"), s.title);
  try {
    const file = await fetchFileLink(s.epub, dzBookName(s));
    k.run.now = t("Making clips");
    updateRunCard(k.run);
    const made = await C.files.bookClips(file, (done, total) => { k.run.part = done / total; k.run.now = t("Chapter {done} of {total}", { done, total }); updateRunCard(k.run); });
    const folder = folderName(made[0].folder);
    made.forEach((m) => { m.folder = folder; joinFav(m, folder); });
    state.pages.unshift(...made.slice().reverse());
    await C.store.writeIndex(state.pages);
    await loadThumbs();
    C.store.keepStored();
    renderLibrary();
    if (state.place === "discover") renderDiscover();
    toast(tn(made.length, "Added “{title}” as 1 clip", "Added “{title}” as {n} clips", { title: folder }), t("Open"), () => openFolder(folder));
  } catch (e) {
    toast(e instanceof C.files.FileError ? e.message : t("Couldn't download it just now. Try again later{x}", { x: t(", or open it on the site.") }));
  } finally { k.done(); }
}
