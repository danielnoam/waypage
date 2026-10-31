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
const countLine = (n) => n + (n === 1 ? " clip" : " clips");
// Where the pages are kept, for the words that say so.
const HERE = C.platform.native ? "this phone" : "this browser";
const ON_HERE = (C.platform.native ? "on " : "in ") + HERE;
const pagesLine = (n) => countLine(n) + " · " + formatSize(totalBytes());

// A browser's card pictures, read once from IndexedDB (0.27.12).
const webThumbs = new Map();
async function loadThumbs() {
  if (C.platform.native) return;
  const got = await C.store.readThumbs();
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
  return base ? base + p.thumb : null;
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

// A collection's cover (0.27.6), read from its story page: kept in
// _covers/, or its link.
function coverUrl(list) {
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
  if (s.waiting) return (s.offline ? "Saves when you're back online" : s.wifi ? "Waiting for Wi-Fi" : "Waiting") + (s.folder ? " · into " + s.folder : "");
  const secs = s.started ? Math.floor((Date.now() - s.started) / 1000) : 0;
  const took = secs >= 5 ? " · " + secs + " s" : "";
  if (s.total == null) return (s.drawing ? "Letting the page draw itself" : "Getting the page") + took;
  if (!s.total) return "Writing it to the phone" + took;
  return "Saving " + s.done + " of " + s.total + (s.total === 1 ? " image" : " images") + took;
}

// The bar: sweeping while the page itself downloads (no size known yet),
// then a tenth for the text and the rest by images saved.
const savingShare = (s) => (s.total == null ? null : s.total ? 0.1 + 0.9 * (s.done / s.total) : 1);

// A save that failed stays in the list with the reason until it's retried
// or removed: a toast alone is gone before anyone looks back at the phone.
function failedCard(s) {
  return el("div", { class: "card saving failed wide", role: "group", "aria-label": "Couldn't save " + s.site },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, s.site),
      el("span", { class: "card-title", dir: "auto" }, s.url),
      el("span", { class: "card-status" }, el("span", { class: "warn" }, s.error)),
      el("span", { class: "card-actions" },
        archiveBtn(s),
        s.gone ? null : el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, "Try again"),
        el("button", { class: "btn-quiet", type: "button", onclick: () => dropFailed(s) }, "Remove"))));
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
  const done = r.total ? r.saved + " of " + r.total + " saved" : r.saved + " saved";
  const failed = r.failed ? ", " + r.failed + " failed" : "";
  if (r.stopped) return done + failed + " · Stopping";
  if (r.paused) return (r.current || r.now ? "Pausing after this one · " : "Paused · ") + done + failed;
  // Files (1.1.3): what the file in hand is up to.
  if (r.files) return r.total === 1 ? r.now || "Opening" : done + failed + " · " + (r.now || "Next in a moment");
  return done + failed + " · " + (r.current && !r.current.waiting ? savingStatus(r.current) : "Next in a moment");
}
function runCard(r) {
  return el("div", { class: "card saving run wide", role: "group", "aria-label": r.files ? "Adding " + r.label : (r.again ? "Saving again in " : "Saving into ") + (r.folder || "the library") },
    el("span", { class: "card-body" },
      el("span", { class: "card-site" }, r.site, r.again ? " · Saving again" : null),
      el("span", { class: "card-title", dir: "auto" }, r.folder || r.label || "Saving several"),
      el("span", { class: "progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" },
        el("span", { class: "progress-fill" })),
      el("span", { class: "card-status accent" },
        el("span", { class: "spinner", "aria-hidden": "true" }),
        el("span", { class: "status-text" }, runStatus(r))),
      r.files && r.total === 1 ? null : el("span", { class: "card-actions" },
        el("button", { class: "btn-small run-pause", type: "button", onclick: () => pauseRun(r, !r.paused) }, r.paused ? "Resume" : "Pause"),
        el("button", { class: "btn-quiet danger", type: "button", onclick: () => stopRun(r) }, "Stop")),
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
      el("span", { class: "warn" }, list.length === 1 ? "1 clip couldn't be saved" : list.length + " clips couldn't be saved"),
      list.length > 1 ? el("button", { class: "btn-text", type: "button", onclick: () => retryAll(list) }, "Try all again") : null),
    ...list.map((s) => el("span", { class: "failed-row" },
      el("span", { class: "failed-text" },
        el("span", { class: "failed-url", dir: "auto" }, s.again ? s.again.title : s.url),
        el("span", { class: "failed-why" }, s.error)),
      archiveBtn(s) || el("button", { class: "btn-small", type: "button", onclick: () => retryJob(s) }, "Try again"),
      dropBtn(s))));
}
function dropBtn(s) {
  const b = el("button", { class: "icon-btn failed-drop", type: "button", "aria-label": "Remove", onclick: () => dropFailed(s) });
  b.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  return b;
}

// A paywalled article (1.7.0) says so as it lands, with the way to the
// rest: in the app, signing in to the site (1.8.0).
function savedToast(meta) {
  if (meta.cut && C.platform.signIn.available) {
    toast(C.platform.signIn.for(meta.url) ? "Saved, but only the start, even signed in." : "Saved, but the site kept the rest for subscribers.",
      "Sign in", () => signInFor(meta));
  } else if (meta.cut) toast("Saved, but the site kept the rest for subscribers.", "Open it", () => C.platform.openOutside(meta.url));
  else toast(meta.missing ? "Saved. Some previews are missing." : "Saved for offline reading");
}

// Saving signed in (1.8.0): the site opens in a browser inside Waypage,
// and once it's closed the clip saves again with the site's cookies,
// taking the old copy's place, highlights and all.
async function signInFor(p) {
  if (!navigator.onLine) { toast("You're offline. Sign in when you're back online."); return; }
  if (!(await C.platform.signIn.open(p.url).catch(() => false))) { toast("Couldn't open the site."); return; }
  const now = state.pages.find((x) => x.id === p.id);
  if (now && /^https?:/.test(now.url || "")) saveClipAgain(now);
}
async function saveClipAgain(p, archived) {
  if (state.saving.some((s) => s.again === p)) return;
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: p.mode, kind: p.comic ? "comic" : "article", archived };
  state.saving.unshift(job);
  renderLibrary();
  toast("Saving it again…");
  const meta = await runJob(job);
  if (!meta) { toast("Couldn't save it again. It's in Downloads to try once more."); return; }
  if (archived) toast("Saved the archived copy from " + C.save.formatDate(archived.at) + ".");
  else if (meta.cut) toast("Still only the start. The site may want a subscription, or a different sign-in.", "Sign in", () => signInFor(meta));
  else toast("Saved again, the whole article this time.");
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
async function updateClip(p) {
  if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
  if (state.saving.some((s) => s.again === p)) return;
  const before = await C.store.readPage(p.id).catch(() => null);
  const keep = p.spot ? { spot: p.spot, spotWords: C.reader.spotWords(before, p.spot) } : null;
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: p.mode, kind: p.comic ? "comic" : "article", keep };
  state.saving.unshift(job);
  renderLibrary();
  toast("Checking the site for changes…");
  const meta = await runJob(job);
  if (!meta) { toast("Couldn't update it. It's in Downloads to try once more."); return; }
  const after = await C.store.readPage(meta.id).catch(() => null);
  const was = pageWords(before), now = pageWords(after);
  const lost = (meta.marks || []).filter((m) => m.text && !now.includes(m.text)).length;
  if (was && was === now) toast("Already up to date. Nothing on the page has changed.");
  else toast("Updated from the site." + (lost ? " " + lost + (lost === 1 ? " highlight's words aren't" : " highlights' words aren't") + " in it any more; " + (lost === 1 ? "it stays" : "they stay") + " under Highlights." : ""));
  if (state.open === p && after) { history.replaceState(readerState(meta), ""); show(meta, after); }
}

// Save as comic (1.49.0): a clip of a manga or comic that was read as an
// article, saved again as its pictures, in the old copy's place.
async function saveClipAsComic(p) {
  if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
  if (state.saving.some((s) => s.again === p)) return;
  const job = { ...newJob(p.url, p.folder), key: "again:" + p.id, again: p, mode: "full", kind: "comic" };
  state.saving.unshift(job);
  renderLibrary();
  toast("Saving it as a comic…");
  const meta = await runJob(job);
  if (!meta) { toast("Couldn't find the pictures. It's in Downloads to try once more."); return; }
  toast("Saved as a comic.");
  if (state.open === p) {
    const html = await C.store.readPage(meta.id).catch(() => null);
    if (html && state.open === p) { history.replaceState(readerState(meta), ""); show(meta, html); }
  }
}

// The Wayback Machine (1.15.0): a page that's gone saved from the
// Internet Archive's newest copy, with its own address kept.
async function findArchive(url) {
  if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return null; }
  toast("Looking in the Internet Archive…");
  let found = null;
  try { found = await C.save.findArchived(url); }
  catch (e) { toast(e instanceof C.save.SaveError ? e.message : "Couldn't reach the Internet Archive."); return null; }
  if (!found) toast("The Internet Archive has no copy of this page.");
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
  if (p.archived && found.at <= p.archived) { toast("This is already the newest archived copy."); return; }
  saveClipAgain(p, found);
}
const archiveBtn = (s) => (s.gone ? el("button", { class: "btn-small", type: "button", onclick: () => saveArchived(s) }, "Archived copy") : null);

// Saves a failed page again where it was headed: its collection, its
// place there, its tags, or the page it was replacing.
async function retryJob(s) {
  Object.assign(s, { error: null, contents: null, done: 0, total: null, drawing: false, waiting: false });
  renderLibrary();
  const meta = await runJob(s);
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
  if (p.finished) return "Finished";
  if (p.at > 0.02) return clipLeft(p, p.at) + " min left";
  return clipMinutes(p) + " min";
}

// Only what needs a look gets a word: missing previews, or images that
// load online only. Anything else is ready offline, which goes unsaid.
// Continue reading's card shows its collection's cover, when it has one.
function pageCard(p, found, hero) {
  const cover = hero && p.folder ? coverUrl(folderPages(p.folder)) : null;
  const thumb = thumbUrl(p);
  const facts = [readingLine(p), formatSize(p.bytes || 0)].join(" · ");
  const started = !p.finished && p.at > 0.02;
  const status = p.missing
    ? el("span", { class: "warn" }, p.missing + (p.missing === 1 ? " preview" : " previews") + " missing")
    : p.cut ? el("span", { class: "warn" }, "Only the start")
    : p.mode === "links" ? el("span", null, "Images online") : null;
  // The whole card opens the page (a button stretched under everything);
  // Retry sits above it, since a button can't hold another.
  const retry = p.missing && C.platform.native && navigator.onLine
    ? el("button", { class: "card-retry", type: "button", onclick: (e) => retryPreviews(p, e.currentTarget) }, "Retry")
    : null;
  return el("div", { class: "card page-card" + (hero ? " continue wide" : "") + (cover ? " has-cover" : ""), "data-ids": p.id },
    el("button", { class: "card-open", type: "button", "aria-label": p.title + (p.fav ? ", favourite" : ""), onclick: () => tapPages([p.id], () => openPage(p.id)) }),
    pickMark(),
    favThumb(p.fav, cover ? el("img", { class: "card-thumb cover", src: cover, alt: "", loading: "lazy" })
      : thumb ? el("img", { class: "card-thumb", src: thumb, alt: "", loading: "lazy" }) : siteMark(p)),
    el("span", { class: "card-body" },
      el("span", { class: "card-site", dir: "auto" }, ...dotted(siteOf(p), p.folder, ...(p.tags || []).map((t) => el("span", { class: "card-tag" }, "#" + t)))),
      el("span", { class: "card-title", dir: "auto" }, p.title),
      found ? el("span", { class: "card-found", dir: "auto" }, found) : null,
      el("span", { class: "card-status" }, facts, status ? " · " : null, status, retry ? " · " : null, retry),
      started ? el("span", { class: "progress thin", role: "progressbar", "aria-label": "Read so far",
        "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(p.at * 100)) },
        el("span", { class: "progress-fill", style: "transform: scaleX(" + p.at + ")" })) : null));
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
  btn.textContent = "Retrying…";
  let res;
  try {
    res = await C.save.retryMissing(p, (done, total) => { btn.textContent = "Retrying " + done + " of " + total; });
  } catch (e) {
    res = null;
  }
  // A card whose content didn't change isn't rebuilt, so its button is reset here.
  btn.disabled = false;
  btn.textContent = "Retry";
  if (!res) { toast("Couldn't open this clip's file. Try again."); return; }
  if (res.got) {
    Object.assign(p, { missing: res.missing, thumb: res.thumb, bytes: (p.bytes || 0) + res.bytes });
    if (p.imageBytes != null) p.imageBytes += res.bytes;
    await C.store.writeIndex(state.pages);
  }
  toast(!res.got ? "Still couldn't get them. The site may be down; the images load online."
    : res.missing ? "Got " + res.got + ". " + res.missing + " still missing."
    : "All previews saved. Offline ready.");
  renderLibrary();
}
