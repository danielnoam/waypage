// Waypage's shell (1.45.11 split): saving jobs. Links out of a paste or
// share, the index of saved addresses, one save, a saved-for-later one,
// waiting for Wi-Fi, and saving many at once. See app.js for how the
// parts share.
// The first link in whatever was pasted or shared ("Read this:
// https://…"), or the text itself as a link when it looks like one
// without its https://.
function linkFrom(text) {
  const t = String(text).trim();
  const m = t.match(/https?:\/\/[^\s<>"]+/i);
  if (m) return m[0].replace(/[).,;!?]+$/, "");
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t)) return "https://" + t;
  return null;
}

// Every link in a paste or share, in order and once each. A text field
// drops line breaks, so a link also ends where the next one starts.
function linksFrom(text) {
  const out = [];
  for (const m of String(text).match(/https?:\/\/.+?(?=https?:\/\/|[\s<>"]|$)/gi) || []) {
    const url = m.replace(/[).,;!?]+$/, "");
    if (!out.some((u) => sameUrl(u, url))) out.push(url);
  }
  return out;
}

// One rule for when two addresses are the same clip, shared with sync
// (and its worker, 1.2.1).
const urlKey = C.sync.urlKey;
const sameUrl = C.sync.sameUrl;
// Every clip by each of its addresses, kept while the pages are the same
// objects with the same addresses (1.2.0): savedAs is asked many times
// a redraw, and each ask was a pass over every clip.
let urlCache = { list: [], u: [], r: [], by: new Map() };
function urlIndex() {
  const pages = state.pages, c = urlCache;
  let same = c.list.length === pages.length;
  for (let i = 0; same && i < pages.length; i++) { const p = pages[i]; same = c.list[i] === p && c.u[i] === p.url && c.r[i] === p.requested; }
  if (same) return c.by;
  const by = new Map();
  for (const p of pages) {
    for (const u of [p.url, p.requested]) {
      if (!u) continue;
      const k = urlKey(u);
      if (!by.has(k)) by.set(k, p);
    }
  }
  urlCache = { list: pages.slice(), u: pages.map((p) => p.url), r: pages.map((p) => p.requested), by };
  return by;
}
const savedAs = (url) => (url ? urlIndex().get(urlKey(url)) || null : null);
// Being saved now, or waiting to be: a page sync is bringing in from its
// link counts, under either of its addresses (1.1.0). Missing those let
// Save new chapters save again what sync was already fetching.
const savingAs = (url) => state.saving.some((s) => !s.error && (sameUrl(s.url, url)
  || (s.synced && (sameUrl(s.synced.url, url) || sameUrl(s.synced.requested, url)))));
const newJob = (url, folder) => ({ key: url, url, site: C.save.siteName(url), done: 0, total: null, error: null, folder: folder || null });

async function savePage(url, folder, how) {
  const existing = savedAs(url);
  if (existing) { toast("Already in your library"); openPage(existing.id); return; }
  if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) return;
  state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
  const job = { ...newJob(url, folder), ...how };
  state.saving.unshift(job);
  renderLibrary();
  toast(waitsForWifi(DATA_SAVE_KEY) ? "It saves when you're on Wi-Fi. It's in Downloads." : "Saving. It's in Downloads.");
  await wifiGate(job);
  if (!state.saving.includes(job)) return;
  job.waiting = false;
  const meta = await runJob(job);
  if (meta) savedToast(meta);
  if (meta && !C.platform.native) C.store.keepStored();
  else if (job.contents) contentsFound(job);
}

// Save for later, offline (1.14.0): the link waits in Downloads, and in
// waypage.later so closing the app keeps it, and saves once the phone is
// back online (saveWaiting, on the online event and at start).
const LATER_KEY = "waypage.later";
function saveLater(url, folder) {
  if (navigator.onLine || savedAs(url)) return savePage(url, folder);
  const list = load(LATER_KEY, []);
  if (!list.some((x) => sameUrl(x.url, url))) { list.push({ url, folder: folder || null }); store(LATER_KEY, list); }
  showWaiting();
  toast("It saves when you're back online. It's in Downloads.");
}
function showWaiting() {
  for (const x of load(LATER_KEY, [])) {
    if (!state.saving.some((s) => sameUrl(s.url, x.url))) state.saving.push({ ...newJob(x.url, x.folder), waiting: true, offline: true });
  }
  renderLibraryLater();
}
function dropLater(s) {
  store(LATER_KEY, load(LATER_KEY, []).filter((x) => !sameUrl(x.url, s.url)));
  state.saving = state.saving.filter((x) => x !== s);
  renderLibrary();
}
let savingWaiting = false;
async function saveWaiting() {
  const list = load(LATER_KEY, []);
  if (!loaded || !navigator.onLine || !list.length || savingWaiting) return;
  savingWaiting = true;
  store(LATER_KEY, []);
  state.saving = state.saving.filter((s) => !s.offline);
  try { for (const x of list) await savePage(x.url, x.folder || undefined); } finally { savingWaiting = false; }
}

// A link that turned out to be a contents page opens as a list to check.
function contentsFound(job) {
  dropFailed(job);
  openBatch(job.contents.links.join("\n"), false, folderName(job.contents.title || job.site), job.url);
  toast("That's a list of chapters. Check them, then save.");
}

// Waiting for Wi-Fi (1.4.1): with "Wait for Wi-Fi" on and the phone on
// mobile data, a save holds here, shown as waiting in Downloads, and goes
// on when the connection changes; the quiet fetches (pictures, feeds,
// new chapters) skip their turn instead.
const waitsForWifi = (key) => load(key, "any") === "wifi" && C.platform.metered;
// Places and stats only on mobile data (1.40.0): clips wait for Wi-Fi.
const syncsPlacesOnly = () => load(DATA_SYNC_KEY, "any") === "places" && C.platform.metered;
const wifiWaiters = [];
async function wifiGate(job) {
  while (waitsForWifi(DATA_SAVE_KEY)) {
    if (job) { job.waiting = true; job.wifi = true; renderLibraryLater(); }
    await new Promise((go) => wifiWaiters.push(go));
  }
  if (job) job.wifi = false;
}
C.platform.onConnection(() => {
  if (C.platform.metered) return;
  while (wifiWaiters.length) wifiWaiters.shift()();
  if (!waitsForWifi(DATA_SYNC_KEY)) syncSoon(1000);
  fetchPictures();
  if (state.section === "sync" || state.section === "saving") renderSection();
});

// Saves one after another are half a second apart, as WebToEpub spaces
// them, so a long run doesn't hammer the site.
const PACE_MS = 500;

// Several links saved one after another, in order, optionally into a
// folder (so its pages follow the order of the links). A link already
// saved isn't saved again; it just joins the folder at its place.
// `tags` is a list for every link, or (an import, 1.9.0) a function
// giving each link its own { tags, finished }.
async function saveAll(all, folder, tags = [], mode, skipSaved, kind, source) {
  const name = folder ? folderName(folder) : null;
  const per = typeof tags === "function" ? tags : () => ({ tags });
  const places = skipSaved && name ? placesBetween(all, name) : new Map();
  const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
  const jobs = urls.filter((u) => !savingAs(u)).map((u) => ({ ...newJob(u, name), tags: [], ...per(u), mode, kind, source: name ? source : undefined }));
  state.saving = state.saving.filter((s) => !(s.error && jobs.some((j) => sameUrl(j.url, s.url))));
  const fresh = jobs.filter((j) => !savedAs(j.url));
  fresh.forEach((j) => { if (places.has(j.url)) j.folderAt = places.get(j.url); });
  const run = fresh.length > 1 ? startRun(name, fresh[0].site, fresh.length) : null;
  fresh.forEach((j) => { j.waiting = true; j.run = run; });
  state.saving = [...fresh, ...state.saving];
  renderLibrary();
  if (state.folder) renderFolder();
  if (run) toast("Saving " + countLine(fresh.length) + ". They're in Downloads.");
  let saved = 0, failed = 0, had = 0, stopped = 0;
  for (const job of jobs) {
    if (job.waiting && !state.saving.includes(job)) { stopped++; continue; }
    const existing = savedAs(job.url);
    if (existing) {
      had++;
      if (name) { joinFav(existing, name); existing.folder = name; existing.folderAt = Date.now(); if (source) existing.source = source; }
      if (job.tags.length) existing.tags = withTags(existing.tags, job.tags);
      if (name || job.tags.length) { await C.store.writeIndex(state.pages); renderLibrary(); if (state.folder) renderFolder(); }
      continue;
    }
    if (saved + failed) await new Promise((done) => setTimeout(done, PACE_MS));
    if (run && !(await gate(run))) { stopped++; continue; }
    await wifiGate(job);
    if (!state.saving.includes(job)) { stopped++; continue; }
    job.waiting = false;
    if (run) run.current = job;
    renderLibraryLater();
    if (await runJob(job)) { saved++; if (run) run.saved++; } else { failed++; if (run) run.failed++; }
    if (run) { run.current = null; updateRunCard(run); }
    renderLibraryLater();
  }
  endRun(run);
  if (run) renderLibrary();
  if (name && source) updateCover(name);
  if (!jobs.length) return;
  toast([saved ? "Saved " + countLine(saved) + (name ? " into " + name : "") : "",
    had ? had + " already saved" + (name && !saved ? ", now in " + name : "") : "",
    failed ? failed + " couldn't be saved" : "", stopped ? "stopped before " + countLine(stopped) : ""].filter(Boolean).join(" · ") + ".");
}

// Where new pages go in a folder when the pages around them in the list
// are already there: between their neighbours, in the list's order, so
// filling in chapters 1 to 40 under 41 to 60 puts them first. Links
// with no neighbour in the folder are left out (they go at the end).
function placesBetween(urls, name) {
  const at = urls.map((u) => {
    const p = savedAs(u);
    return p && p.folder && sameTag(p.folder, name) ? (p.folderAt || p.savedAt || 0) : null;
  });
  const out = new Map();
  for (let i = 0; i < urls.length;) {
    if (at[i] != null || savedAs(urls[i])) { i++; continue; }
    let j = i;
    while (j < urls.length && at[j] == null) j++;
    const gap = urls.slice(i, j).filter((u) => !savedAs(u));
    let back = i - 1;
    while (back >= 0 && at[back] == null) back--;
    const lo = back >= 0 ? at[back] : null, hi = j < urls.length ? at[j] : null;
    gap.forEach((u, k) => {
      if (lo != null && hi != null && hi > lo) out.set(u, lo + ((hi - lo) * (k + 1)) / (gap.length + 1));
      else if (hi != null) out.set(u, hi - (gap.length - k) / 1000);
      else if (lo != null) out.set(u, lo + (k + 1) / 1000);
    });
    i = j;
  }
  return out;
}

// A page landing while something moves (a screen sliding in, a sheet
// rising) redraws the library once it has settled (1.2.0): a redraw of
// a few hundred cards in the middle of a slide dropped its frames.
let renderWait = 0;
function renderLibraryLater() {
  if (renderWait) return;
  const go = () => {
    if (M.busy()) { renderWait = setTimeout(go, 120); return; }
    renderWait = 0;
    renderLibrary();
    if (state.folder) renderFolder();
  };
  renderWait = setTimeout(go, 0);
}

// Saves one queued link; resolves to its meta, or null when it failed
// (the card then says why and offers Try again).
// A save that fails in a way a second try often fixes goes again once,
// after a moment, before it shows as failed (1.10.1).
async function saveOnce(job, opts) {
  try {
    return await C.save.save(job.url, opts);
  } catch (e) {
    if (!(e instanceof C.save.SaveError) || !e.again || job.triedAgain) throw e;
    job.triedAgain = true;
    C.platform.log.note("save", (job.site || "") + ": " + e.message + " (trying again)");
    job.drawing = false;
    job.done = 0;
    updateSavingCard(job);
    await new Promise((go) => setTimeout(go, 1500));
    return C.save.save(job.url, opts);
  }
}

async function runJob(job) {
  job.started = Date.now();
  job.triedAgain = false;
  try {
    const meta = await saveOnce(job, {
      mode: job.mode || load(IMAGES_KEY, "previews"),
      kind: job.kind || "article",
      asPage: !!job.asPage,
      id: job.synced ? job.synced.id : undefined,
      archived: job.archived,
      given: job.given,
      onProgress: (p) => {
        if (p.stage === "drawing") job.drawing = true;
        if (p.stage === "images") { job.done = p.done; job.total = p.total; }
        updateSavingCard(job);
      },
    });
    const old = job.again;
    if (old) {
      // Saved again: the new copy takes the old one's place, keeping its
      // collection, tags and read position.
      for (const k of ["requested", "folder", "folderAt", "folderFav", "folderFavAt", "source", "tags", "at", "finished", "readAt", "readOn", "placeAt", "fav", "favAt", "marks"]) if (old[k] !== undefined) meta[k] = old[k];
      if (job.keep) Object.assign(meta, job.keep);
      C.stats.moved(old.id, meta.id);
      const i = state.pages.indexOf(old);
      if (i < 0) await C.store.removePage(meta.id);
      else {
        state.pages[i] = meta;
        await C.store.writeIndex(state.pages);
        await C.store.removePage(old.id);
      }
    } else if (job.synced) {
      // A synced page saved here from its link: the library's entry for
      // it, with this copy's text and pictures.
      for (const k of SYNCED_KEEP) if (job.synced[k] !== undefined) meta[k] = job.synced[k];
      if (state.pages.some((p) => p.id === meta.id)) await C.store.removePage(meta.id).catch(() => {});
      else { state.pages.unshift(meta); await indexSoon(); }
      syncSoon();
    } else {
      meta.requested = job.url;
      if (job.folder) { meta.folder = folderName(job.folder); meta.folderAt = job.folderAt || Date.now(); if (job.source) meta.source = job.source; }
      if (job.tags && job.tags.length) meta.tags = withTags([], job.tags);
      if (job.finished) meta.finished = true;
      state.pages.unshift(meta);
      C.stats.saved();
      await indexSoon();
    }
    state.saving = state.saving.filter((s) => s !== job);
    if (!job.run) finish({ key: "p:" + meta.id, page: meta.id });
    renderLibraryLater();
    return meta;
  } catch (e) {
    job.error = e instanceof C.save.SaveError ? e.message : "Couldn't save this clip. Try again.";
    job.gone = e instanceof C.save.SaveError && e.gone && !job.archived;
    if (e instanceof C.save.ContentsPage) job.contents = e.contents;
    if (!(e instanceof C.save.SaveError)) console.error(e);
    else C.platform.log.note("save", (job.site || "") + ": " + job.error);
    renderLibraryLater();
    return null;
  }
}
