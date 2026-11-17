// Waypage's shell (1.45.11 split): the cards. What a clip's card shows
// (thumbnails, site marks, minutes left), a save in progress and a run of
// saves, failed saves and their retries, updating or archiving a clip.
// See app.js for how the parts share.
function formatSize(bytes) {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1) + " MB";
  return Math.max(1, Math.round(bytes / 1e3)) + " KB";
}
const sizeOf = (pages) => pages.reduce((sum, p) => sum + (p.bytes || 0), 0);
const totalBytes = () => sizeOf(state.pages);
const countLine = (n) => tn(n, "1 clip", "{n} clips");
// Where the pages are kept, for the words that say so.
const HERE = C.platform.native ? t("this phone") : t("this browser");
const ON_HERE = C.platform.native ? t("on this phone") : t("in this browser");
const pagesLine = (n) => countLine(n) + " · " + formatSize(totalBytes());

// A browser's card pictures, read once from IndexedDB (0.27.12).
const webThumbs = new Map();
async function loadThumbs() {
  if (C.platform.native) return;
  const [got] = await Promise.all([C.store.readThumbs(), C.store.readCovers()]);
  webThumbs.clear();
  got.forEach((url, id) => webThumbs.set(id, url));
}

// A file copied into a clip is a clip like any other (1.45.8): it
// doesn't say what kind of file it came from. Copies made before then
// keep the kind as their site, so it's dropped here.
const siteOf = (p) => (p.file && !p.link && p.site === C.files.KINDS[p.file.kind] ? "" : p.site || "");
const dotted = (...parts) => parts.filter(Boolean).flatMap((x, i) => (i ? [" · ", x] : [x]));

function thumbUrl(p) {
  if (!p.thumb) return null;
  if (/^https?:/.test(p.thumb)) return p.thumb;
  if (webThumbs.has(p.id)) return webThumbs.get(p.id);
  const base = C.store.pageDirUrl(p.id);
  // A note's picture is drawn again as it is written on, at the same name,
  // so its address carries when it was drawn (thumbAt, this device's own).
  return base ? base + p.thumb + (p.note && (p.thumbAt || p.editedAt) ? "?v=" + (p.thumbAt || p.editedAt) : "") : null;
}

// The site's icon, for a card with no picture (0.27.6): kept beside the
// page, or its link; a page saved before then tries the site's
// /favicon.ico while online.
function iconUrl(p) {
  if (p.icon && /^https?:/.test(p.icon)) return navigator.onLine ? p.icon : null;
  if (p.icon) { const base = C.store.pageDirUrl(p.id); return base ? base + p.icon : null; }
  if (!navigator.onLine) return null;
  try { return new URL("/favicon.ico", p.url).href; } catch (e) { return null; }
}

// A collection's cover: the one picked for it, a picture of your own
// or one of its clips', else its linked page's (0.27.6), kept in _covers/,
// or its link.
const coverPick = (list) => (list.find((p) => p.coverPick) || {}).coverPick || "";
function pickedCoverUrl(list) {
  const pick = coverPick(list);
  if (pick.startsWith("clip:")) { const p = list.find((x) => x.id === pick.slice(5)); return p ? thumbUrl(p) : null; }
  return pick ? C.store.coverUrl(pick) : null;
}
// What the collection shows: its cover, else its first clip's picture.
function shownCover(list) {
  const c = coverUrl(list);
  if (c) return c;
  const p = list.find((x) => thumbUrl(x));
  return p ? thumbUrl(p) : null;
}
// The bytes of what the collection shows, for a book's cover (epub.js).
async function coverBytes(list) {
  const url = shownCover(list);
  if (!url) return null;
  try {
    const here = url.startsWith("data:") || new URL(url, location.href).origin === location.origin;
    const blob = here ? await (await fetch(url)).blob() : navigator.onLine ? (await C.platform.fetchBytes(url, "cover")).blob : null;
    return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch (e) { return null; }
}
function coverUrl(list) {
  const picked = pickedCoverUrl(list);
  if (picked) return picked;
  const c = (list.find((p) => p.cover) || {}).cover;
  if (!c) return null;
  if (/^https?:/.test(c)) return navigator.onLine ? c : null;
  const base = C.store.pageDirUrl("_covers");
  return base ? base + c : null;
}

// ---- Library ----

// What a save is doing, with the seconds it has taken once that's long
// enough to wonder, so a slow site doesn't look stuck.
function savingStatus(s) {
  if (s.waiting) return (s.offline ? t("Saves when you're back online") : s.wifi ? t("Waiting for Wi-Fi") : t("Waiting")) + (s.folder ? " · " + t("into {folder}", { folder: s.folder }) : "");
  const secs = s.started ? Math.floor((Date.now() - s.started) / 1000) : 0;
  const took = secs >= 5 ? " · " + t("{secs} s", { secs }) : "";
  if (s.total == null) return (s.drawing ? t("Letting the page draw itself") : t("Getting the page")) + took;
  if (!s.total) return t("Writing it to the phone") + took;
  return tn(s.total, "Saving {done} of 1 image", "Saving {done} of {n} images", { done: s.done }) + took;
}

// The bar: sweeping while the page itself downloads (no size known yet),
// then a tenth for the text and the rest by images saved.
const savingShare = (s) => (s.total == null ? null : s.total ? 0.1 + 0.9 * (s.done / s.total) : 1);

// A save that failed stays in the list with the reason until it's retried
// or removed: a toast alone is gone before anyone looks back at the phone.
function failedCard(s) {
  return el("div", { class: "card saving failed wide", role: "group", "aria-label": t("Couldn't save {site}", { site: s.site }) },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, s.site),
      el("span", { class: "card-title", dir: "auto" }, s.url),
      el("span", { class: "card-status" }, el("span", { class: "warn" }, s.error)),
      el("span", { class: "card-actions" },
        archiveBtn(s),
        s.gone ? null : el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, t("Try again")),
        el("button", { class: "btn-quiet", type: "button", onclick: () => dropFailed(s) }, t("Remove")))));
}

// A run of saves into one folder (Save next 10, Save several, a
// contents page) is one card from start to end, the same height
// throughout, so the library doesn't jump as each page comes and goes.
// Pause waits after the page in progress; Stop lets the rest go.
// Pages that fail wait on their own cards until the run ends.
const runs = new Set();
let runIds = 0;
const runFor = (folder) => [...runs].find((r) => r.folder && folder && sameTag(r.folder, folder));
function startRun(folder, site, total, again) {
  const r = { id: ++runIds, folder, site, total, again: !!again, saved: 0, failed: 0, paused: false, stopped: false, current: null, wake: null };
  runs.add(r);
  return r;
}
async function gate(r) {
  while (r.paused && !r.stopped) await new Promise((go) => { r.wake = go; });
  return !r.stopped;
}
function runChanged() {
  renderLibrary();
  if (state.folder) renderFolder();
  if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build());
}
function pauseRun(r, on) {
  r.paused = on;
  if (on && typeof keepHalt === "function") keepHalt(r);
  if (!on && r.wake) { r.wake(); r.wake = null; }
  // A pause is a quiet moment: what landed is written now (1.2.1).
  if (on) flushIndex();
  runChanged();
}
// Stop on sync's run (1.1.0): sync hands the same pages over again at
// its next run, so they'd start again seconds later. Stopped, they wait
// until Waypage is next opened.
let linksStopped = false;
// The same for a watched folder's files: Look now or a pull brings them.
let watchStopped = false;
function stopRun(r) {
  if (!r) return;
  if (r.sync) linksStopped = true;
  if (r.files) watchStopped = true;
  r.stopped = true;
  r.paused = false;
  if (typeof keepHalt === "function") keepHalt(r);
  // A file download waiting for Wi-Fi stops now, not once Wi-Fi comes;
  // every other waiter looks again and waits on.
  if (r.keep) while (wifiWaiters.length) wifiWaiters.shift()();
  if (r.wake) { r.wake(); r.wake = null; }
  state.saving = state.saving.filter((x) => !(x.run === r && x.waiting && !x.error));
  runChanged();
}
// While a run of saves is on, the index is written every few seconds
// and when the run ends (1.2.1), not after every page: the whole
// library.json crossed the bridge for each chapter that landed. A page
// whose entry wasn't written yet is saved again from its link.
let indexTimer = 0;
function indexSoon() {
  if (!runs.size) return C.store.writeIndex(state.pages);
  if (!indexTimer) indexTimer = setTimeout(flushIndex, 3000);
  return Promise.resolve();
}
function flushIndex() {
  if (!indexTimer) return Promise.resolve();
  clearTimeout(indexTimer);
  indexTimer = 0;
  return C.store.writeIndex(state.pages);
}
function endRun(r) {
  if (!r) return;
  runs.delete(r);
  flushIndex();
  oneEach();
  r.done = true;
  r.at = Date.now();
  if (r.saved || failedOf(r).length) finish({ key: "r:" + r.id, run: r });
  renderDownloads();
}

// Two clips of one address (a chapter saved by a run while sync was
// bringing it in, before 1.1.0) become one: the one saved last, with the
// other's tags, favourite, collection and reading, as sync does. Run at
// launch and when a run ends. Files of your own have no address.
async function oneEach() {
  const web = state.pages.filter((p) => p.url && !p.file);
  const gone = {};
  const kept = new Map(C.sync.oneCopyEach(web, gone, Date.now(), sameUrl, urlKey).map((p) => [p.id, p]));
  const ids = Object.keys(gone);
  if (!ids.length) return 0;
  state.pages = state.pages.filter((p) => !gone[p.id]).map((p) => {
    const k = kept.get(p.id);
    if (!k || k === p) return p;
    for (const key of Object.keys(p)) if (!(key in k)) delete p[key];
    return Object.assign(p, k);
  });
  await C.store.writeIndex(state.pages);
  for (const id of ids) await C.store.removePage(id).catch(() => {});
  renderLibrary();
  if (state.folder) renderFolder();
  return ids.length;
}

// Downloads keeps the last 30 finished, for this session.
function finish(entry) {
  state.finished = [{ ...entry, at: Date.now() }, ...state.finished.filter((x) => x.key !== entry.key)].slice(0, 30);
}

// A run's pages that couldn't be saved, waiting on Try again.
const failedOf = (r) => state.saving.filter((s) => s.run === r && s.error);
function runStatus(r) {
  const done = r.total ? t("{saved} of {total} saved", { saved: r.saved, total: r.total }) : t("{saved} saved", { saved: r.saved });
  const failed = r.failed ? ", " + t("{failed} failed", { failed: r.failed }) : "";
  if (r.stopped) return done + failed + " · " + t("Stopping");
  if (r.paused) return (r.current || r.now ? t("Pausing after this one") : t("Paused")) + " · " + done + failed;
  // Files (1.1.3): what the file in hand is up to.
  if (r.files) return r.total === 1 ? r.now || t("Opening") : done + failed + " · " + (r.now || t("Next in a moment"));
  return done + failed + " · " + (r.current && !r.current.waiting ? savingStatus(r.current) : t("Next in a moment"));
}
function runCard(r) {
  return el("div", { class: "card saving run wide", role: "group", "aria-label": r.files ? t("Adding {label}", { label: r.label }) : r.folder ? (r.again ? t("Saving again in {folder}", { folder: r.folder }) : t("Saving into {folder}", { folder: r.folder })) : (r.again ? t("Saving again in the library") : t("Saving into the library")) },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, r.site, r.again ? t(" · Saving again") : null),
      el("span", { class: "card-title", dir: "auto" }, r.folder || r.label || t("Saving several")),
      el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status accent" },
        el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { class: "status-text" }, runStatus(r))),
      r.files && r.total === 1 && !r.keep ? null : el("span", { class: "card-actions" },
        el("button", { class: "btn-small run-pause", type: "button", onclick: () => pauseRun(r, !r.paused) }, r.paused ? t("Resume") : t("Pause")),
        el("button", { class: "btn-quiet danger", type: "button", onclick: () => stopRun(r) }, t("Stop"))),
      failedList(r)));
}
// A run's bar is the whole run when its length is known, else the page
// in progress.
function runShare(r) {
  const page = r.files ? r.part : r.current && !r.current.waiting ? savingShare(r.current) : 0;
  if (!r.total || (page == null && !r.saved && !r.failed)) return page;
  return Math.min(1, (r.saved + r.failed + (page || 0)) / r.total);
}
function updateRunCard(r) {
  paintDownloads();
  const card = $("downloads").querySelector('[data-key="r:' + r.id + '"]');
  if (!card) return;
  const share = runShare(r);
  const bar = card.querySelector(".progress");
  bar.classList.toggle("busy", share == null);
  if (share == null) bar.removeAttribute("aria-valuenow");
  else bar.setAttribute("aria-valuenow", String(Math.round(share * 100)));
  card.querySelector(".progress-fill").style.transform = "scaleX(" + (share || 0) + ")";
  card.querySelector(".spinner").hidden = r.paused && !r.current;
  card.querySelector(".status-text").textContent = runStatus(r);
}

function dropFailed(s) {
  state.saving = state.saving.filter((x) => x !== s);
  renderLibrary();
}

// A run's failed pages sit in its card, in Downloads, each with its own
// Try again, and Try all again over two or more.
function failedList(r) {
  const list = failedOf(r);
  if (!list.length) return null;
  return el("span", { class: "failed-list" },
    el("span", { class: "failed-head" },
      el("span", { class: "warn" }, list.length === 1 ? t("1 clip couldn't be saved") : t("{n} clips couldn't be saved", { n: list.length })),
      list.length > 1 ? el("button", { class: "btn-text", type: "button", onclick: () => retryAll(list) }, t("Try all again")) : null),
    ...list.map((s) => el("span", { class: "failed-row" },
      el("span", { class: "failed-text" },
        el("span", { class: "failed-url", dir: "auto" }, s.again ? s.again.title : s.url),
        el("span", { class: "failed-why" }, s.error)),
      archiveBtn(s) || el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, t("Try again")),
      dropBtn(s))));
}
function dropBtn(s) {
  const b = el("button", { class: "icon-btn failed-drop", type: "button", "aria-label": t("Remove"), onclick: () => dropFailed(s) });
  b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  return b;
}

// A paywalled article (1.7.0) says so as it lands, with the way to the
// rest: in the app, signing in to the site (1.8.0).
function savedToast(meta) {
  if (meta.cut && C.platform.signIn.available) {
    toast(C.platform.signIn.for(meta.url) ? t("Saved, but only the start, even signed in.") : t("Saved, but the site kept the rest for subscribers."),
      t("Sign in"), () => signInFor(meta));
  } else if (meta.cut) toast(t("Saved, but the site kept the rest for subscribers."), t("Open it"), () => C.platform.openOutside(meta.url));
  else toast(meta.missing ? t("Saved. Some previews are missing.") : t("Saved for offline reading"));
}

// Saving signed in (1.8.0): the site opens in a browser inside Waypage,
// and once it's closed the clip saves again with the site's cookies,
// taking the old copy's place, highlights and all.
async function signInFor(p) {
  if (!navigator.onLine) { toast(t("You're offline. Sign in when you're back online.")); return; }
  if (!(await C.platform.signIn.open(p.url).catch(() => false))) { toast(t("Couldn't open the site.")); return; }
  const now = state.pages.find((x) => x.id === p.id);
  if (now && /^https?:/.test(now.url || "")) saveClipAgain(now);
}
async function saveClipAgain(p, archived) {
  if (state.saving.some((s) => s.again === p)) return;
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: p.mode, kind: p.comic ? "comic" : "article", archived };
  state.saving.unshift(job);
  renderLibrary();
  toast(t("Saving it again…"));
  const meta = await runJob(job);
  if (!meta) { toast(t("Couldn't save it again. It's in Downloads to try once more.")); return; }
  if (archived) toast(t("Saved the archived copy from {formatDate}.", { formatDate: C.save.formatDate(archived.at) }));
  else if (meta.cut) toast(t("Still only the start. The site may want a subscription, or a different sign-in."), t("Sign in"), () => signInFor(meta));
  else toast(t("Saved again, the whole article this time."));
  // Open in the reader, it shows the new copy in the old one's place.
  if (state.open === p) {
    const html = await C.store.readPage(meta.id).catch(() => null);
    if (html && state.open === p) { history.replaceState(readerState(meta), ""); show(meta, html); }
  }
}

// Update from the site (1.38.0): the page fetched again for what's
// changed since it was saved (a living article, docs, a post that was
// edited), in the old copy's place. Highlights stay wherever their words
// are still in the text, and the reading place stays on its paragraph
// when that's still there, else at the same distance through.
const pageWords = (html) => {
  const d = new DOMParser().parseFromString(html || "", "text/html");
  d.querySelectorAll(".co-meta, .co-licence, .co-next, script, style").forEach((n) => n.remove());
  return (d.body ? d.body.textContent : "").replace(/\s+/g, " ").trim();
};
// Update from the site keeps the copy it replaces as the earlier one,
// on this device only (not synced or backed up), so a page that came
// back broken can be undone; a copy that looks broken (much shorter,
// or only the start where it was whole) isn't put in place at all.
// Live clips (Daniel's ask, 2026-11-16) update themselves as they open,
// at most once an hour, online and where saving is allowed.
const LIVE_EVERY = 36e5;
const LIVE_SHORT = 100;
const EARLIER_KEY = "waypage.earlierCopies";
const countWords = (s) => (s ? s.split(" ").length : 0);
const contentOf = (p) => {
  const o = { ...p };
  for (const k of [...AGAIN_KEEP, "earlier", "liveAt", "spot", "spotWords"]) delete o[k];
  return o;
};
const brokenCopy = (was, now, old, meta) => (meta.cut && !old.cut)
  || (now < LIVE_SHORT && was >= LIVE_SHORT) || now < was / 2;

function rememberEarlier(id) {
  const list = load(EARLIER_KEY, []);
  const ids = Array.isArray(list) ? list : [];
  if (!ids.includes(id)) store(EARLIER_KEY, [...ids, id]);
}
// An earlier copy whose clip was deleted, or replaced through sync,
// is removed with the next update.
async function sweepEarlier() {
  const list = load(EARLIER_KEY, []);
  if (!Array.isArray(list) || !list.length || !state.pages.length) return;
  const used = new Set();
  for (const p of state.pages) { used.add(p.id); if (p.earlier) used.add(p.earlier.id); }
  const dropped = new Set(list.filter((id) => !used.has(id)));
  for (const id of dropped) await C.store.removePage(id).catch(() => {});
  // Read again: an update running alongside may have added one meanwhile.
  const now = load(EARLIER_KEY, []);
  store(EARLIER_KEY, (Array.isArray(now) ? now : []).filter((id) => !dropped.has(id)));
}
async function dropEarlier(p) {
  if (!p.earlier) return;
  await C.store.removePage(p.earlier.id).catch(() => {});
  delete p.earlier;
}

// `next` (a copy's own meta) in `cur`'s place, with `cur`'s copy kept as
// the earlier one; reading place, highlights and the rest go with it.
async function putCopy(cur, next, curHtml, nextHtml) {
  const p = contentOf(next);
  for (const k of AGAIN_KEEP) if (cur[k] !== undefined) p[k] = cur[k];
  if (cur.liveAt) p.liveAt = cur.liveAt;
  if (cur.spot) {
    p.spot = cur.spot;
    const words = C.reader.spotWords(curHtml, cur.spot);
    if (words) p.spotWords = words;
  }
  p.earlier = contentOf(cur);
  rememberEarlier(cur.id);
  const i = state.pages.indexOf(cur);
  if (i < 0) return null;
  state.pages[i] = p;
  C.stats.moved(cur.id, p.id);
  await C.store.writeIndex(state.pages);
  renderLibraryLater();
  if (state.open === cur && nextHtml) { history.replaceState(readerState(p), ""); show(p, nextHtml); }
  return p;
}

// Swaps a clip with its other copy (going back, or on to a newer one
// that looked broken).
async function swapCopy(id) {
  const cur = state.pages.find((x) => x.id === id);
  if (!cur || !cur.earlier) return null;
  const there = await C.store.readPage(cur.earlier.id).catch(() => null);
  if (!there) {
    delete cur.earlier;
    await C.store.writeIndex(state.pages);
    toast(t("The other copy isn't on this device any more."));
    return null;
  }
  const here = await C.store.readPage(cur.id).catch(() => null);
  return putCopy(cur, cur.earlier, here, there);
}
async function goBackCopy(id) {
  const p = state.pages.find((x) => x.id === id);
  if (!p || !p.earlier) return;
  const newer = (p.earlier.savedAt || 0) > (p.savedAt || 0);
  const now = await swapCopy(p.id);
  if (!now) return;
  toast(newer ? t("Showing the newer copy.") : t("Back to the copy from {when}.", { when: whenText(now.savedAt || 0) }), t("Undo"), () => goBackCopy(now.id));
}

// Fetches the clip again and decides what to keep. `live`: started by
// opening a live clip, so it says nothing unless something changed;
// "pull" (a pull on the library) says nothing at all, and the pull sums
// up what came back: "updated", "kept" (looked broken) or "same".
async function updateClip(p, live) {
  if (!navigator.onLine) { if (!live) toast(t("You're offline. Try again when you're back online.")); return; }
  // One that failed before waits in Downloads; asked again, this one takes its place.
  state.saving = state.saving.filter((s) => !(s.again === p && s.error));
  if (state.saving.some((s) => s.again === p)) return;
  p.liveAt = Date.now();
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: p.mode, kind: p.comic ? "comic" : "article", hold: true, quiet: live };
  state.saving.unshift(job);
  renderLibraryLater();
  if (!live) toast(t("Checking the site for changes…"));
  const meta = await runJob(job);
  if (!meta) {
    if (live) { state.saving = state.saving.filter((s) => s !== job); renderLibraryLater(); }
    else toast(t("Couldn't update it. It's in Downloads to try once more."));
    return;
  }
  return takeUpdate(p, meta, live);
}
// What came back from the site, put in place or kept aside (also for
// Try again in Downloads, which fetches the held copy again).
async function takeUpdate(p, meta, live) {
  const pull = live === "pull";
  const cur = state.pages.find((x) => x.id === p.id);
  const before = cur ? await C.store.readPage(cur.id).catch(() => null) : null;
  const after = await C.store.readPage(meta.id).catch(() => null);
  if (!cur || !before || !after) { await C.store.removePage(meta.id).catch(() => {}); return; }
  const was = pageWords(before), now = pageWords(after);
  if (was === now) {
    // Nothing changed: the copy here stays, and nothing new goes to sync.
    await C.store.removePage(meta.id).catch(() => {});
    await C.store.writeIndex(state.pages);
    if (!live) toast(t("Already up to date. Nothing on the page has changed."));
    return "same";
  }
  sweepEarlier();
  const wasN = countWords(was), nowN = countWords(now);
  if (brokenCopy(wasN, nowN, cur, meta)) {
    // Kept as the other copy, to take anyway.
    await dropEarlier(cur);
    cur.earlier = contentOf(meta);
    rememberEarlier(meta.id);
    await C.store.writeIndex(state.pages);
    if (pull) return "kept";
    toast(meta.cut && !cur.cut ? t("The site sent back only the start. Kept your copy.")
      : t("The site sent back {now} words, not {was}. Kept your copy.", { now: nowN.toLocaleString(), was: wasN.toLocaleString() }),
    t("Use it anyway"), () => goBackCopy(cur.id));
    return "kept";
  }
  await dropEarlier(cur);
  const fresh = await putCopy(cur, meta, before, after);
  if (!fresh) { await C.store.removePage(meta.id).catch(() => {}); return; }
  if (pull) return "updated";
  const lost = (fresh.marks || []).filter((m) => m.text && !now.includes(m.text)).length;
  const more = nowN - wasN;
  const said = lost ? tn(lost, "Updated from the site. 1 highlight's words aren't in it any more; it stays under Highlights.", "Updated from the site. {n} highlights' words aren't in it any more; they stay under Highlights.")
    : more > 0 ? tn(more, "Updated from the site, 1 word more.", "Updated from the site, {n} words more.")
    : t("Updated from the site.");
  toast(said, t("Undo"), () => goBackCopy(fresh.id));
  return "updated";
}

// A live clip as it opens: updated when the copy here is over an hour
// old, and never on mobile data when saving waits for Wi-Fi.
const liveNow = (p) => p.live && !p.file && !p.preview && /^https?:/.test(p.url || "") && navigator.onLine && !waitsForWifi(DATA_SAVE_KEY);
function liveOnOpen(p) {
  if (!liveNow(p)) return;
  if (Date.now() - Math.max(p.savedAt || 0, p.liveAt || 0) < LIVE_EVERY) return;
  updateClip(p, true);
}
// A pull on the library (Daniel's ask, 2026-11-17) updates every live
// clip, as it checks Website sync collections; asked for, so not held to
// once an hour. Three at a time. Gives how many came back changed.
async function updateLiveClips() {
  const list = state.pages.filter(liveNow);
  let n = 0;
  const go = async () => { for (let p; (p = list.shift());) if ((await updateClip(p, "pull").catch(() => null)) === "updated") n++; };
  await Promise.all([go(), go(), go()]);
  return n;
}
async function setLive(p, on) {
  if (on) p.live = true; else delete p.live;
  await C.store.writeIndex(state.pages);
  renderLibraryLater();
  if (on && state.open === p) liveOnOpen(p);
}

// Read as Article or Comic (1.50.0, in place of 1.49.0's Save as comic):
// a web clip is saved again that way, in the old copy's place; a file
// already holds its pictures, so only how it's shown changes.
async function setClipKind(p, kind) {
  if (!!p.comic === (kind === "comic")) return;
  if (p.file) return setFileKind(p, kind);
  if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
  if (state.saving.some((s) => s.again === p)) return;
  const comic = kind === "comic";
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: comic ? "full" : p.mode, kind };
  state.saving.unshift(job);
  renderLibrary();
  toast(comic ? t("Saving it as a comic…") : t("Saving it as an article…"));
  const meta = await runJob(job);
  if (!meta) { toast(comic ? t("Couldn't find the pictures. It's in Downloads to try once more.") : t("Couldn't save it again. It's in Downloads to try once more.")); return; }
  toast(comic ? t("Saved as a comic.") : t("Saved as an article."));
  if (state.open === p) {
    const html = await C.store.readPage(meta.id).catch(() => null);
    if (html && state.open === p) { history.replaceState(readerState(meta), ""); show(meta, html); }
  }
}

async function setFileKind(p, kind) {
  const comic = kind === "comic";
  let html = null;
  try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
  if (!html) { toast(t("Couldn't open this file. Try again.")); return; }
  const doc = new DOMParser().parseFromString(html, "text/html");
  const root = doc.querySelector(".co-body") || doc.body;
  root.classList.toggle("co-comic", comic);
  if (comic) p.comic = true; else delete p.comic;
  await C.store.writePage(p.id, "<!doctype html>" + doc.documentElement.outerHTML, p);
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
  toast(comic ? t("Shown as a comic.") : t("Shown as an article."));
  if (state.open !== p) return;
  const now = await (p.link || p.note ? openLinked(p) : C.store.readPage(p.id)).catch(() => null);
  if (now && state.open === p) show(p, now);
}

// The Wayback Machine (1.15.0): a page that's gone saved from the
// Internet Archive's newest copy, with its own address kept.
async function findArchive(url) {
  if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return null; }
  toast(t("Looking in the Internet Archive…"));
  let found = null;
  try { found = await C.save.findArchived(url); }
  catch (e) { toast(e instanceof C.save.SaveError ? e.message : t("Couldn't reach the Internet Archive.")); return null; }
  if (!found) toast(t("The Internet Archive has no copy of this page."));
  return found;
}
async function saveArchived(s) {
  const found = await findArchive(s.url);
  if (!found || !state.saving.includes(s)) return;
  s.archived = found;
  s.gone = false;
  return retryJob(s);
}
async function archiveClip(p) {
  const found = await findArchive(p.url);
  if (!found) return;
  if (p.archived && found.at <= p.archived) { toast(t("This is already the newest archived copy.")); return; }
  saveClipAgain(p, found);
}
const archiveBtn = (s) => (s.gone ? el("button", { class: "btn-small", type: "button", onclick: () => saveArchived(s) }, t("Archived copy")) : null);

// Saves a failed page again where it was headed: its collection, its
// place there, its tags, or the page it was replacing.
async function retryJob(s) {
  Object.assign(s, { error: null, contents: null, done: 0, total: null, drawing: false, waiting: false });
  renderLibrary();
  const meta = await runJob(s);
  // Update from the site: the copy came back held, and is weighed like
  // the first try's would have been.
  if (meta && s.hold) { await takeUpdate(s.again, meta, false); renderDownloads(); return meta; }
  if (meta) {
    if (s.run) { s.run.saved++; s.run.failed = Math.max(0, s.run.failed - 1); }
    savedToast(meta);
    renderDownloads();
  } else if (s.contents) contentsFound(s);
  if (state.folder) renderFolder();
  return meta;
}

async function retryAll(list) {
  let n = 0;
  for (const s of list) {
    if (!s.error || !state.saving.includes(s)) continue;
    if (n++) await new Promise((done) => setTimeout(done, PACE_MS));
    await retryJob(s);
  }
}

// A clip's minutes at your own pace (1.41.0): saved at the usual 230
// words a minute, read at what Reading stats measured. Comics go by
// their pictures.
function clipMinutes(p) {
  const m = p.minutes || 1;
  return p.comic ? m : Math.max(1, Math.round(m * C.save.WORDS_PER_MINUTE / C.stats.pace()));
}
const clipLeft = (p, at) => Math.max(1, Math.ceil(clipMinutes(p) * (1 - at)));
// "Finished" once read to the end, "6 min left" part way, else the length.
function readingLine(p) {
  if (isAudiobook(p)) return listenLine(p);
  if (p.finished) return t("Finished");
  if (p.at > 0.02) return t("{n} min left", { n: clipLeft(p, p.at) });
  return t("{n} min", { n: clipMinutes(p) });
}

// Only what needs a look gets a word: missing previews, or images that
// load online only. Anything else is ready offline, which goes unsaid.
// Continue reading's card shows its collection's cover, when it has one.
function pageCard(p, found, hero) {
  const cover = hero && p.folder ? coverUrl(folderPages(p.folder)) : null;
  const thumb = thumbUrl(p);
  const facts = isAudiobook(p) ? readingLine(p) : [readingLine(p), formatSize(p.bytes || 0)].join(" · ");
  const done = isAudiobook(p) ? listenDone(p) : p.at;
  const started = isAudiobook(p) ? done > 0.02 && done < 0.995 : !p.finished && done > 0.02;
  const status = p.missing
    ? el("span", { class: "warn" }, tn(p.missing, "1 preview missing", "{n} previews missing"))
    : p.cut ? el("span", { class: "warn" }, t("Only the start"))
    : p.mode === "links" ? el("span", null, t("Images online"))
    : tooBigLine(p) ? el("span", { class: "warn" }, t("Not synced, too big")) : null;
  // The whole card opens the page (a button stretched under everything);
  // Retry sits above it, since a button can't hold another.
  const retry = p.missing && C.platform.native && navigator.onLine
    ? el("button", { class: "card-retry", type: "button", onclick: (e) => retryPreviews(p, e.currentTarget) }, t("Retry"))
    : null;
  return el("div", { class: "card page-card" + (hero ? " continue wide" : "") + (cover ? " has-cover" : ""), "data-ids": p.id },
    el("button", { class: "card-open", type: "button", "aria-label": p.title + (p.fav ? ", favourite" : ""), onclick: () => tapPages([p.id], () => openPage(p.id)) }),
    pickMark(),
    favThumb(p.fav, listenBadge(p, cover ? el("img", { class: "card-thumb cover", src: cover, alt: "", loading: "lazy" })
      : thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p))),
    el("span", { class: "card-body" },
      el("span", { class: "card-site", dir: "auto" }, ...dotted(p.live ? el("span", { class: "card-live" }, t("Live")) : null, siteOf(p), p.folder, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, "#" + t)))),
      el("span", { class: "card-title", dir: "auto" }, p.title),
      found ? el("span", { class: "card-found", dir: "auto" }, found) : null,
      el("span", { class: "card-status" }, facts, status ? " · " : null, status, retry ? " · " : null, retry),
      started ? el("span", { class: "progress thin", role: "progressbar", "aria-label": t("Read so far"),
        "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(done * 100)) },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + done + ")" })) : null));
}

// A favourite's star sits on its picture's corner (1.16.0), not by its
// name; a picture is boxed to carry it.
const favStar = () => el("span", { class: "thumb-fav", "aria-hidden": "true" }, "★");
function favThumb(fav, thumb) {
  if (!fav) return thumb;
  if (thumb.tagName !== "IMG") { thumb.append(favStar()); return thumb; }
  const box = el("span", { class: thumb.className + " has-fav", "aria-hidden": "true" }, thumb, favStar());
  thumb.className = "";
  return box;
}

// A card with no picture shows its site: the icon on the preview tint,
// or the site's first letter when there's no icon to show.
function siteMark(p) {
  // A note shows that it is one (2.0.0).
  if (p.note) return el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, el("span", { class: "site-letter file-ext" }, "NOTE"));
  // A file with no picture shows what kind it is (0.31.0).
  if (p.link) return el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, el("span", { class: "site-letter file-ext" }, p.file.ext.toUpperCase()));
  if (p.file) return el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, el("span", { class: "site-letter" }, (p.title || "?").trim().charAt(0).toUpperCase()));
  const letter = el("span", { class: "site-letter" }, (p.site || "?").replace(/^www\./, "").charAt(0).toUpperCase());
  const box = el("span", { class: "card-thumb site-mark", "aria-hidden": "true" }, letter);
  const src = iconUrl(p);
  if (src) {
    const img = el("img", { src, alt: "", loading: "lazy" });
    img.addEventListener("load", () => { if (img.naturalWidth > 1) box.classList.add("has-icon"); });
    box.prepend(img);
  }
  return box;
}

// The circle a card shows while picking pages.
const pickMark = () => el("span", { class: "pick", "aria-hidden": "true" });

async function retryPreviews(p, btn) {
  btn.disabled = true;
  btn.textContent = t("Retrying…");
  let res;
  try {
    res = await C.save.retryMissing(p, (done, total) => { btn.textContent = t("Retrying {done} of {total}", { done: done, total: total }); });
  } catch (e) {
    res = null;
  }
  // A card whose content didn't change isn't rebuilt, so its button is reset here.
  btn.disabled = false;
  btn.textContent = t("Retry");
  if (!res) { toast(t("Couldn't open this clip's file. Try again.")); return; }
  if (res.got) {
    Object.assign(p, { missing: res.missing, thumb: res.thumb, bytes: (p.bytes || 0) + res.bytes });
    if (p.imageBytes != null) p.imageBytes += res.bytes;
    await C.store.writeIndex(state.pages);
  }
  toast(!res.got ? t("Still couldn't get them. The site may be down; the images load online.")
    : res.missing ? t("Got {got}. {missing} still missing.", { got: res.got, missing: res.missing })
    : t("All previews saved. Offline ready."));
  renderLibrary();
}
