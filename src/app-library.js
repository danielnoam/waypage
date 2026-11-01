// Waypage's shell (1.14.0): tags, collections, what a clip
// keeps, picking several, the library's sheets, export, import and
// watched folders. See app.js for how the parts share.
// ---- Tags ----
// Any number per page, as typed (trimmed, at most 32 characters), with
// case-insensitive duplicates dropped.

const cleanTag = (t) => String(t).replace(/\s+/g, " ").trim().slice(0, 32);
const sameTag = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

function allTags() {
  const counts = new Map();
  for (const p of state.pages) for (const t of p.tags || []) {
    const k = [...counts.keys()].find((x) => sameTag(x, t)) || t;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
}

// `has` plus `more`, without case-insensitive repeats.
function withTags(has, more) {
  const out = [...(has || [])];
  for (const t of more) if (!out.some((x) => sameTag(x, t))) out.push(t);
  return out;
}

async function setTags(p, tags) {
  p.tags = tags;
  await C.store.writeIndex(state.pages);
  renderLibrary();
}

// ---- Folders ----
// An ordered run of pages, like a web novel's chapters. A page is in at
// most one, named by `folder` on its index entry, in the order it joined
// (`folderAt`). Names match like tags, ignoring case.

// The pages of every folder, grouped once and kept while no page moved,
// came or went (1.2.0). Each redraw of the library asked for every
// collection's pages and scanned every clip each time, which was most
// of the time a page landing cost in a big library. The check is a pass
// over the pages (the same objects, in the same folders, at the same
// places), so a change made anywhere is seen at the next ask.
let folderCache = { list: [], f: [], at: [], by: new Map(), names: [] };
function folderIndex() {
  const pages = state.pages, c = folderCache;
  let same = c.list.length === pages.length;
  for (let i = 0; same && i < pages.length; i++) {
    const p = pages[i];
    same = c.list[i] === p && c.f[i] === p.folder && c.at[i] === (p.folderAt || p.savedAt || 0);
  }
  if (same) return c;
  const by = new Map(), names = [];
  for (const p of pages) {
    if (!p.folder) continue;
    const k = p.folder.toLocaleLowerCase();
    let g = by.get(k);
    if (!g) { g = []; by.set(k, g); names.push(p.folder); }
    g.push(p);
  }
  for (const g of by.values()) g.sort((a, b) => (a.folderAt || a.savedAt || 0) - (b.folderAt || b.savedAt || 0));
  folderCache = { list: pages.slice(), f: pages.map((p) => p.folder), at: pages.map((p) => p.folderAt || p.savedAt || 0), by, names };
  return folderCache;
}
function folderPages(name) {
  const g = folderIndex().by.get(String(name).toLocaleLowerCase());
  return g ? g.slice() : [];
}

const allFolders = () => folderIndex().names.slice();

// A favourite collection (0.30.9): a mark on its clips, so it goes
// wherever they go, through a rename, a backup and sync, like a clip's.
// Any of its clips carrying it makes the collection a favourite.
const folderFav = (name) => folderPages(name).some((p) => p.folderFav);
function setFolderFav(name, on) {
  const now = Date.now();
  for (const p of folderPages(name)) {
    if (on) { p.folderFav = true; p.folderFavAt = p.folderFavAt || now; }
    else { delete p.folderFav; delete p.folderFavAt; }
  }
}
// A clip moving to another collection takes that one's mark, or none.
function joinFav(p, name) {
  const on = name && folderPages(name).some((x) => x !== p && x.folderFav);
  if (on) { p.folderFav = true; p.folderFavAt = Date.now(); } else { delete p.folderFav; delete p.folderFavAt; }
}

// A folder's name as already spelled, if one by that name exists.
const folderName = (name) => allFolders().find((n) => sameTag(n, cleanTag(name))) || cleanTag(name);

// The page to carry on with: the first one not finished, else the first.
// The clip to go on with in a collection: the one read last, or the
// first unfinished one after it (1.10.1). The first unfinished one in
// the whole list sent a reader at chapter 144 back to a chapter 59 they
// had skipped. Nothing read yet: the first unfinished one.
function folderNextIndex(list) {
  let last = -1;
  list.forEach((p, i) => { if ((p.finished || (p.at || 0) > 0.02) && (p.readAt || 0) > ((list[last] && list[last].readAt) || 0)) last = i; });
  if (last >= 0) {
    if (!list[last].finished) return last;
    const after = list.findIndex((p, i) => i > last && !p.finished);
    if (after >= 0) return after;
  }
  return list.findIndex((p) => !p.finished);
}
function folderNext(list) {
  const i = folderNextIndex(list);
  return i < 0 ? list[0] : list[i];
}

async function setFolder(p, name) {
  const clean = name && cleanTag(name);
  if (clean) {
    if (p.folder && sameTag(p.folder, clean)) return;
    p.folder = folderName(clean);
    p.folderAt = Date.now();
    joinFav(p, p.folder);
  } else {
    delete p.folder;
    delete p.folderAt;
    joinFav(p, null);
  }
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
}

// A folder in the library's Folders row: its first picture, its name and
// how much of it is read.
function folderTile(name) {
  const list = folderPages(name);
  const done = list.filter((p) => p.finished).length;
  const withThumb = list.find((p) => thumbUrl(p));
  const cover = coverUrl(list);
  const thumb = cover || (withThumb ? thumbUrl(withThumb) : null);
  const fresh = freshCount(name);
  const fav = list.some((p) => p.folderFav);
  const tile = el("div", { class: "tile", role: "listitem", "data-ids": list.map((p) => p.id).join(","), "data-name": name },
    el("button", { class: "card-open", type: "button", "aria-label": name + (fav ? ", favourite" : "") + ", collection, " + list.length + " clips, " + done + " read" + (fresh ? ", " + newCountText(fresh) + " chapters" : ""),
      onclick: () => tapPages(list.map((p) => p.id), () => openFolder(name)) }),
    pickMark(),
    el("span", { class: "tile-thumb" + (thumb ? "" : " blank") },
      thumb ? el("img", { src: thumb, alt: "", loading: "lazy" }) : null,
      // The badge saves them (1.7.2); while picking, it picks like the tile.
      fresh ? el("button", { class: "tile-new" + (savingInto(name) ? " saving" : ""), type: "button", "aria-label": (savingInto(name) ? "Saving new chapters of " : "Save " + newCountText(fresh) + " " + chapterWord(list, fresh) + " of ") + name,
        onclick: (e) => {
          e.stopPropagation();
          if (state.select) { tile.querySelector(".card-open").click(); return; }
          // Saving already: the badge pulses (1.10.1), and a tap shows them.
          if (savingInto(name)) { openDownloads(); return; }
          e.currentTarget.classList.add("saving");
          saveNewChapters(name, e.currentTarget);
        } }, "+" + (fresh >= NEW_MAX ? NEW_MAX : fresh)) : null),
    el("span", { class: "tile-name", dir: "auto" }, name),
    el("span", { class: "tile-meta" }, el("span", { class: "tile-kind" }, "Collection · "), (done === list.length ? "All read" : done + " of " + list.length + " read"), el("span", { class: "tile-size" }, " · " + formatSize(sizeOf(list)))),
    el("span", { class: "progress thin", "aria-hidden": "true" },
      el("span", { class: "progress-fill", style: "transform: scaleX(" + done / list.length + ")" })));
  // A cover whose file is gone (a restored backup) is read again.
  if (cover) tile.querySelector(".tile-thumb img").addEventListener("error", () => {
    for (const p of list) { delete p.cover; delete p.coverFrom; }
    updateCover(name);
  }, { once: true });
  // No picture at all: its icon, big, the name already under it.
  if (!thumb) tile.querySelector(".tile-thumb").prepend(collectionIcon(list, 44));
  // A favourite's star in the picture's corner (1.16.0), where a book's
  // icon used to sit.
  if (fav) tile.querySelector(".tile-thumb").append(favStar());
  return tile;
}

// Scrolls sideways at phone width, wraps on a desktop.
function fillStrip(strip, names, folderSig) {
  const had = new Map([...strip.children].map((t) => [t.dataset.name, t]));
  const want = names.map((name) => {
    const sig = folderSig(name), old = had.get(name);
    if (old && old.dataset.sig === sig) return old;
    const t = folderTile(name);
    t.dataset.name = name;
    t.dataset.sig = sig;
    if (old) old.replaceWith(t);
    return t;
  });
  for (const [name, t] of had) if (!names.includes(name)) t.remove();
  // Moved only when the order changed, which a page landing doesn't do.
  want.forEach((t, i) => { if (strip.children[i] !== t) strip.insertBefore(t, strip.children[i] || null); });
}
const foldersStrip = (names) => el("div", { class: "folder-strip wide", role: "list", "aria-label": "Collections" }, ...names.map(folderTile));

function openFolder(name, fromHistory) {
  if (state.folder && sameTag(state.folder, name)) return;
  if (!folderPages(name).length) return;
  state.folder = folderPages(name)[0].folder;
  folderMode = "";
  renderFolder();
  if (!fromHistory) history.pushState({ view: "folder", folder: state.folder }, "");
  $("folderBody").scrollTop = 0;
  pushScreen($("folderView")).then(() => $("folderBack").focus());
  updateCover(state.folder);
  if (pinned.matches) renderSide();
}

function closeFolder() {
  if (!state.folder) return;
  closeFolderMenu(true);
  folderMode = "";
  state.folder = null;
  popScreen($("folderView"));
  if (pinned.matches) renderSide();
}

// The collection's screen is a book page (0.27.11): its cover and title,
// how far along, Continue, then its chapters. Its tools are in the ⋯
// menu; Rename, Reorder, the story page and Export take the screen over
// in place, with Cancel, Save or Done in the bar.
let folderMode = "";
const FOLDER_BARS = {
  rename: { title: "Rename", cancel: true, done: "Save" },
  order: { title: "Reorder", done: "Done" },
  chapters: { title: "Story page", done: "Done" },
  export: { title: "Export", done: "Done" },
};

function setFolderMode(m) {
  closeFolderMenu();
  folderMode = m;
  renderFolder();
  $("folderBody").scrollTop = 0;
  const field = $("folderBody").querySelector(".book-title-input");
  if (field) { field.focus(); field.select(); }
  else if (m) $("folderDone").focus({ preventScroll: true });
  else $("folderMore").focus({ preventScroll: true });
}

function paintFolderBar() {
  const bar = FOLDER_BARS[folderMode];
  $("folderBack").hidden = !!bar;
  $("folderMore").hidden = !!bar;
  $("folderCancel").hidden = !(bar && bar.cancel);
  $("folderDone").hidden = !bar;
  if (bar) $("folderDone").textContent = bar.done;
  if (bar) fill($("folderTitle"), bar.title);
  else fill($("folderTitle"), folderSource(folderPages(state.folder)) ? bookIcon(18) : null, state.folder);
  $("folderView").querySelector(".screen-bar").classList.toggle("editing", !!bar);
  paintFolderTitle();
}

// The bar names the collection once its title has scrolled away.
function paintFolderTitle() {
  const head = $("folderBody").querySelector(".book-title");
  const away = !folderMode && (!head || head.getBoundingClientRect().bottom < $("folderBody").getBoundingClientRect().top);
  $("folderView").querySelector(".screen-bar").classList.toggle("titled", !!folderMode || away);
}

const minutesText = (m) => (m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min");
const minutesLeft = (list) => list.filter((p) => !p.finished)
  .reduce((sum, p) => sum + clipLeft(p, p.at > 0.02 ? p.at : 0), 0);
const chapterWord = (list, n) => (isSeries(list) ? (n === 1 ? "chapter" : "chapters") : (n === 1 ? "clip" : "clips"));

function bookCover(list) {
  const url = coverUrl(list);
  if (url) {
    const img = el("img", { class: "book-cover", src: url, alt: "" });
    img.addEventListener("error", () => img.replaceWith(drawnCover(list)), { once: true });
    return img;
  }
  return drawnCover(list);
}
const drawnCover = (list) => el("div", { class: "book-cover drawn", "aria-hidden": "true" }, collectionIcon(list, 44));
// A story's book, or a plain folder (0.30.3: no name drawn on it).
function collectionIcon(list, size) {
  if (folderSource(list)) return bookIcon(size);
  const s = el("span", { class: "folder-icon", "aria-hidden": "true" });
  s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  return s;
}

function bookHead(list, next, done) {
  const n = list.length, name = state.folder;
  const renaming = folderMode === "rename";
  let title;
  if (renaming) {
    title = el("input", { class: "book-title-input", type: "text", value: name, "aria-label": "Collection name",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences", spellcheck: "false", dir: "auto" });
    title.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); $("folderDone").click(); }
      else if (e.key === "Escape") { e.preventDefault(); setFolderMode(""); }
    });
  } else title = el("h2", { class: "book-title", dir: "auto" }, name);
  const left = minutesLeft(list);
  const meta = done === n ? "All " + n + " read" : done + " of " + n + " read · " + minutesText(left) + " left";
  const bar = el("div", { class: "book-progress", role: "progressbar", "aria-label": "Read", "aria-valuemin": "0",
    "aria-valuemax": String(n), "aria-valuenow": String(done), "aria-valuetext": done + " of " + n + " read" },
    el("span", { class: "book-progress-fill", style: "width: " + (done / n * 100).toFixed(1) + "%" }));
  const head = el("div", { class: "book-head" },
    bookCover(list),
    el("div", { class: "book-facts" },
      el("p", { class: "book-site" }, [siteOf(list[0]), "Collection"].filter(Boolean).join(" · ")),
      title,
      el("p", { class: "meta folder-meta" }, meta),
      bar));
  if (renaming) {
    return [head, el("p", { class: "footnote book-note" }, n === 1 ? "Renames the collection on its clip." : "Renames the collection on all " + n + " of its clips.")];
  }
  const go = done === n ? "Read again from the start" : (next.at > 0.02 || done ? "Continue: " : "Start: ") + next.title;
  const s = savedParts(list);
  return [head,
    el("button", { class: "btn-primary folder-go", type: "button", dir: "auto", onclick: () => openPage(done === n ? list[0].id : next.id) }, go),
    saveNewButton(list),
    el("button", { class: "book-saved", type: "button", onclick: () => openMenu("saved") },
      el("span", null, formatSize(s.total) + " · " + picturesAs(list) + " · "),
      el("span", { class: "accent" }, "What's saved"))];
}

// New chapters found by the daily check, saved from here: straight from
// the story page's list when it gave one, else by following the last
// chapter's next link.
// Chapters saving into a collection; while they are, its Save button
// gives way to a line that opens Downloads (0.30.2).
const savingInto = (name) => state.saving.filter((s) => !s.error && s.folder && sameTag(s.folder, name)).length;
// Saves a collection's new chapters, from its page or its badge in the
// library (1.7.2); `b` is the button pressed, held while it starts.
function saveNewChapters(name, b) {
  const list = folderPages(name);
  const fresh = freshCount(name);
  const entry = newFor(name);
  if (!fresh || !list.length) return;
  if (!navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
  if (runFor(name)) { toast("Already saving into " + name + ". It's in Downloads."); return; }
  if (entry && entry.all) { saveAll(entry.all, name, [], undefined, true, undefined, folderSource(list)); return; }
  const last = list[list.length - 1];
  if (!sizeOk(last, fresh)) return;
  if (b) b.disabled = true;
  follow(last, fresh, false).then(() => { if (b && b.isConnected) b.disabled = false; });
}
function saveNewButton(list) {
  const name = state.folder;
  const saving = savingInto(name);
  if (saving) {
    return el("button", { class: "btn-quiet book-new", type: "button", onclick: () => openDownloads() },
      "Saving " + saving + " " + chapterWord(list, saving) + " · ", el("span", { class: "accent" }, "See in Downloads"));
  }
  const fresh = freshCount(name);
  if (!fresh) return null;
  const entry = newFor(name);
  const b = el("button", { class: "btn-quiet book-new", type: "button", onclick: () => saveNewChapters(name, b) }, el("span", { class: "tile-icon", "aria-hidden": "true" }), "Save " + newCountText(fresh) + " " + chapterWord(list, fresh));
  b.firstChild.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS.add + "</svg>";
  return b;
}

function renderFolder() {
  const list = folderPages(state.folder);
  if (!list.length) {
    folderMode = "";
    paintFolderBar();
    $("folderBody").replaceChildren(el("p", { class: "empty-text" }, "This collection is empty."));
    return;
  }
  const picking = !!state.select;
  if (picking) folderMode = "";
  if (!picking && !folderMode) lookBack(list[0]);
  const next = folderNext(list);
  const done = list.filter((p) => p.finished).length;
  const ordering = folderMode === "order";
  let top;
  if (folderMode === "chapters") top = [chaptersPanel(list)];
  else if (folderMode === "export") top = [el("div", { class: "folder-actions export-panel" }, exportControls({ pages: list, title: state.folder }, () => setFolderMode("")))];
  else if (ordering) {
    top = [el("div", { class: "order-hint" },
      el("p", { class: "meta" }, "Drag a chapter by its handle, or use the arrows."),
      el("button", { class: "btn-quiet sort-chapters", type: "button", onclick: () => sortByChapter(list) }, "Sort by chapter"))];
  // On a big screen the book's cover and facts stand beside its list.
  } else top = [el("div", { class: "book-side" }, ...bookHead(list, next, done))];
  const showList = folderMode !== "export";
  fill($("folderBody"),
    ...top,
    showList && !ordering ? sectionHead((isSeries(list) ? "Chapters" : "Clips") + " · " + list.length) : null,
    showList ? el("ol", { class: "group folder-list" + (ordering ? " ordering" : "") },
      ...list.map((p, i) => el("li", folderMode ? { "data-id": p.id } : { "data-id": p.id, "data-ids": p.id },
        el("button", { class: "row chapter" + (p === next && done < list.length ? " now" : ""), type: "button",
          onclick: () => (folderMode ? null : tapPages([p.id], () => openPage(p.id))) },
          pickMark(),
          el("span", { class: "chapter-n", "aria-hidden": "true" }, String(i + 1)),
          el("span", { class: "choice-text" },
            el("span", { class: "row-label", dir: "auto" }, p.title),
            ordering ? null : el("span", { class: "choice-note" + (p.finished ? "" : p.at > 0.02 ? " accent" : "") }, readingLine(p))),
          ordering ? null : chapterMark(p)),
        ordering ? moveButton(p, i, -1, list.length) : null,
        ordering ? moveButton(p, i, 1, list.length) : null,
        ordering ? dragHandle(p) : null))) : null);
  paintFolderBar();
  paintPicks();
}

// A tick once read, a filling ring part way.
function chapterMark(p) {
  if (p.finished) {
    const s = el("span", { class: "chapter-mark done", "aria-hidden": "true" });
    s.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    return s;
  }
  if (p.at > 0.02) return el("span", { class: "chapter-mark ring", "aria-hidden": "true", style: "--at: " + Math.round(p.at * 360) + "deg" });
  return el("span", { class: "chapter-mark", "aria-hidden": "true" });
}

const CHEVRON = (d) => '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
const CHEVRON_UP = CHEVRON("M6 15l6-6 6 6"), CHEVRON_DOWN = CHEVRON("M6 9l6 6 6-6");

function moveButton(p, i, step, n) {
  const b = el("button", { class: "icon-btn move", type: "button", "data-step": String(step),
    "aria-label": "Move " + p.title + (step < 0 ? " up" : " down"), onclick: () => movePage(p, step) });
  b.innerHTML = step < 0 ? CHEVRON_UP : CHEVRON_DOWN;
  b.disabled = step < 0 ? i === 0 : i === n - 1;
  return b;
}

// Dragging is for fingers and mice; the arrows beside it do the same
// from a keyboard or a screen reader, so the handle is hidden from them.
function dragHandle(p) {
  const h = el("span", { class: "drag-handle", "aria-hidden": "true" });
  h.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 8h16M4 12h16M4 16h16"/></svg>';
  h.addEventListener("pointerdown", (e) => dragRow(e, h, p));
  return h;
}

function dragRow(e, handle, p) {
  if (e.button > 0) return;
  e.preventDefault();
  const li = handle.closest("li"), body = $("folderBody");
  const rows = [...li.parentNode.children], from = rows.indexOf(li);
  const step = li.offsetHeight, y0 = e.clientY, s0 = body.scrollTop;
  let to = from, y = y0;
  handle.setPointerCapture(e.pointerId);
  li.classList.add("lifted");
  li.parentNode.classList.add("dragging");
  const place = () => {
    const dy = y - y0 + body.scrollTop - s0;
    to = clamp(from + Math.round(dy / step), 0, rows.length - 1);
    li.style.transform = "translateY(" + dy + "px)";
    rows.forEach((r, i) => {
      if (r === li) return;
      const shift = i > from && i <= to ? -step : i < from && i >= to ? step : 0;
      r.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  };
  const move = (ev) => {
    y = ev.clientY;
    const box = body.getBoundingClientRect();
    if (y > box.bottom - 48) body.scrollTop += 12;
    else if (y < box.top + 48) body.scrollTop -= 12;
    place();
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    li.parentNode.classList.remove("dragging");
    li.classList.remove("lifted");
    rows.forEach((r) => { r.style.transform = ""; });
    if (to !== from) moveInFolder(p, to);
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}

// Moves a page to `to` in its folder. The folder's places are the
// pages' own `folderAt`s, made distinct and handed out again in the new
// order, so nothing else in the folder moves.
async function moveInFolder(p, to) {
  const list = folderPages(p.folder);
  const i = list.indexOf(p);
  if (i < 0 || to === i || to < 0 || to >= list.length) return false;
  const places = list.map((q) => q.folderAt || q.savedAt || 0);
  for (let k = 1; k < places.length; k++) if (places[k] <= places[k - 1]) places[k] = places[k - 1] + 1;
  list.splice(i, 1);
  list.splice(to, 0, p);
  list.forEach((q, k) => { q.folderAt = places[k]; });
  await C.store.writeIndex(state.pages);
  renderFolder();
  renderLibrary();
  return true;
}

async function movePage(p, step) {
  const list = folderPages(p.folder);
  if (!(await moveInFolder(p, list.indexOf(p) + step))) return;
  const row = $("folderBody").querySelector('li[data-id="' + p.id + '"]');
  const again = row && row.querySelector('.move[data-step="' + step + '"]');
  const focus = again && !again.disabled ? again : row && row.querySelector(".move:not(:disabled)");
  if (focus) focus.focus();
}

// Chapter numbers from the titles (or addresses) put the folder in
// order; pages without one keep their place relative to each other, at
// the end. The folder's own places are reused, as in moveInFolder.
async function sortByChapter(list) {
  const nums = new Map(list.map((p) => [p, C.save.chapterNumber(p.title, p.url)]));
  if ([...nums.values()].filter((n) => n != null).length < 2) { toast("These clips don't have chapter numbers to sort by."); return; }
  const places = list.map((q) => q.folderAt || q.savedAt || 0);
  for (let k = 1; k < places.length; k++) if (places[k] <= places[k - 1]) places[k] = places[k - 1] + 1;
  const sorted = list.map((p, i) => [p, i]).sort((a, b) => {
    const x = nums.get(a[0]), y = nums.get(b[0]);
    return (x == null ? Infinity : x) - (y == null ? Infinity : y) || a[1] - b[1];
  }).map(([p]) => p);
  const moved = sorted.some((p, i) => p !== list[i]);
  sorted.forEach((q, k) => { q.folderAt = places[k]; });
  await C.store.writeIndex(state.pages);
  renderFolder();
  renderLibrary();
  toast(moved ? "Sorted by chapter." : "Already in chapter order.");
}

// ---- The collection's ⋯ menu ----
// A popover under its button rather than a sheet: short, and every
// entry leads somewhere else.
function openFolderMenu() {
  if ($("folderPop")) { closeFolderMenu(); return; }
  const list = folderPages(state.folder);
  if (!list.length) return;
  const fresh = freshCount(state.folder);
  const item = (icon, label, onclick, opts = {}) => {
    const b = el("button", { class: "pop-item" + (opts.warn ? " warn" : ""), type: "button", role: "menuitem", tabindex: "-1",
      onclick: () => { closeFolderMenu(true); onclick(); } },
      el("span", { class: "pop-icon", "aria-hidden": "true" }), el("span", { class: "pop-label" }, label),
      opts.note ? el("span", { class: "pop-note" + (opts.accent ? " accent" : "") }, opts.note) : null);
    b.firstChild.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[icon] + "</svg>";
    b.disabled = !!opts.disabled;
    return b;
  };
  const sep = () => el("div", { class: "pop-sep", role: "separator" });
  const pop = el("div", { class: "pop-menu", id: "folderPop", role: "menu", "aria-label": "Collection" },
    item("saved", "What's saved", () => openMenu("saved"), { note: formatSize(sizeOf(list)) }),
    item("book", "Story page", () => setFolderMode("chapters"), fresh ? { note: newCountText(fresh), accent: true } : {}),
    item("add", "Add clips", () => openBatch("", false, state.folder)),
    sep(),
    item("rename", "Rename", () => setFolderMode("rename")),
    item("reorder", "Reorder", () => setFolderMode("order"), { disabled: list.length < 2 }),
    item("select", "Select", () => startSelect([])),
    item("send", "Export", () => setFolderMode("export")),
    item("star", folderFav(state.folder) ? "Unfavourite" : "Favourite", () => favFolder(state.folder, !folderFav(state.folder))),
    sep(),
    item("remove", "Remove", () => openMenu("remove"), { warn: true }));
  const more = $("folderMore"), at = more.getBoundingClientRect();
  pop.style.top = at.bottom + 4 + "px";
  pop.style.right = Math.max(8, innerWidth - at.right) + "px";
  $("folderView").append(pop);
  more.setAttribute("aria-expanded", "true");
  M.popFrom(pop, at);
  const items = () => [...pop.querySelectorAll(".pop-item:not(:disabled)")];
  items()[0].focus();
  pop.addEventListener("keydown", (e) => {
    const all = items(), i = all.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); all[(to + all.length) % all.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); closeFolderMenu(); }
    else if (e.key === "Tab") closeFolderMenu(true);
  });
  setTimeout(() => addEventListener("pointerdown", outsideMenu, true));
}

function outsideMenu(e) {
  const pop = $("folderPop");
  if (pop && !pop.contains(e.target) && !$("folderMore").contains(e.target)) closeFolderMenu(true);
}

// Focus goes back to ⋯ unless what was picked takes it somewhere.
function closeFolderMenu(away) {
  const pop = $("folderPop");
  removeEventListener("pointerdown", outsideMenu, true);
  if (!pop) return;
  pop.removeAttribute("id");
  pop.style.pointerEvents = "none";
  $("folderMore").setAttribute("aria-expanded", "false");
  M.popInto(pop, $("folderMore").getBoundingClientRect()).then(() => pop.remove());
  if (!away) $("folderMore").focus();
}

// ---- What's saved (0.27.11) ----
// A page's size split into its pictures (kept as `imageBytes` since
// 0.27.11, measured from its files for pages saved before) and the rest:
// its text, the page itself and the site's icon.
function savedParts(list) {
  const s = { total: 0, pictures: 0, known: true, previews: 0, full: 0, links: 0, missing: 0 };
  for (const p of list) {
    const imgs = p.images || 0, miss = p.missing || 0;
    s.total += p.bytes || 0;
    if (p.mode === "links") s.links += imgs;
    else {
      s[p.mode === "full" ? "full" : "previews"] += Math.max(0, imgs - miss);
      s.missing += miss;
    }
    if (p.imageBytes != null) s.pictures += p.imageBytes;
    else if (imgs && p.mode !== "links") s.known = false;
  }
  s.pictures = Math.min(s.pictures, s.total);
  s.text = s.total - s.pictures;
  return s;
}

function picturesAs(list) {
  const modes = new Set(list.filter((p) => p.images).map((p) => p.mode || "previews"));
  if (!modes.size) return "no pictures";
  if (modes.size > 1) return "pictures mixed";
  return { previews: "pictures as previews", full: "pictures full size", links: "pictures as links" }[[...modes][0]];
}

// What one page keeps, for its row in Storage.
function savedNote(p) {
  const s = savedParts([p]);
  return [s.previews ? s.previews + (s.previews === 1 ? " preview" : " previews") : null,
    s.full ? s.full + " full size" : null,
    s.links ? s.links + (s.links === 1 ? " link" : " links") : null,
    s.missing ? s.missing + " missing" : null].filter(Boolean).join(" · ") || "Text only";
}

function savedView(list) {
  const s = savedParts(list);
  const kept = s.previews + s.full;
  const what = s.previews && s.full ? "previews and full size" : s.full ? "full size" : "previews";
  const share = (b) => (s.total ? Math.max(b ? 2 : 0, Math.round(b / s.total * 100)) : 0);
  const legend = (cls, label, value) => el("div", { class: "saved-row" },
    el("span", { class: "saved-key " + cls, "aria-hidden": "true" }),
    el("span", { class: "saved-label" + (cls === "missing" ? " warn" : "") }, label),
    value ? el("span", { class: "saved-value" }, value) : null);
  const lean = s.known && kept && s.pictures > s.text * 2;
  return el("div", { class: "saved-view" },
    el("div", { class: "saved-head" },
      el("span", { class: "saved-title" }, "What's saved"),
      el("span", { class: "saved-value" }, formatSize(s.total))),
    s.known && s.total ? el("div", { class: "saved-bar", "aria-hidden": "true" },
      el("span", { class: "pics", style: "width: " + share(s.pictures) + "%" }),
      el("span", { class: "text", style: "width: " + share(s.text) + "%" })) : null,
    kept ? legend("pics", "Pictures, " + what + " · " + kept, s.known ? formatSize(s.pictures) : "") : null,
    legend("text", "Text", s.known ? formatSize(s.text) : ""),
    s.links ? legend("links", "Pictures as links · " + s.links + ", need a connection", "") : null,
    s.missing ? legend("missing", s.missing + (s.missing === 1 ? " preview" : " previews") + " missing, shown online", "") : null,
    !s.known ? el("p", { class: "footnote" }, C.platform.native ? "Measuring the pictures…" : "Picture sizes show for clips saved from 0.27.11 on.")
      : lean ? el("p", { class: "footnote" }, "Most of it is pictures. Save again with Links to keep only the text, about " + formatSize(s.text) + ".") : null);
}

// Pages saved before 0.27.11 have their pictures measured from their
// files, once, the first time What's saved is shown for them.
const measured = new Set();
async function measureSizes(list, then) {
  if (!C.platform.native) return;
  const todo = list.filter((p) => p.imageBytes == null && p.images && p.mode !== "links" && !measured.has(p.id));
  if (!todo.length) return;
  let changed = false;
  for (const p of todo) {
    measured.add(p.id);
    try {
      const files = await C.store.listSized(p.id);
      if (!files.length || files.some((f) => f.size == null)) continue;
      p.imageBytes = files.filter((f) => f.rel.startsWith("images/")).reduce((sum, f) => sum + f.size, 0);
      changed = true;
    } catch (e) { /* stays unknown */ }
  }
  if (!changed) return;
  await C.store.writeIndex(state.pages);
  then();
}

// The collection's What's saved sheet: the breakdown, and saving it all
// again with pictures another way.
function savedSheet() {
  const name = state.folder;
  const list = folderPages(name);
  const n = list.length;
  let mode = load(IMAGES_KEY, "previews");
  const s = savedParts(list);
  const note = el("p", { class: "footnote" });
  const paintNote = () => {
    note.textContent = (mode === "links" && s.known ? "Links keeps the text only, about " + formatSize(s.text) + ". " : "") + "Your place in each " + chapterWord(list, 1) + " stays.";
  };
  paintNote();
  const go = el("button", { class: "btn-primary refresh-go", type: "button", onclick: () => back().then(() => refreshFolder(name, mode, go)) },
    "Save " + n + " " + chapterWord(list, n) + " again");
  go.disabled = !list.some((p) => /^https?:/.test(p.url || "")) || !!runFor(name);
  measureSizes(list, () => { if (state.menu && state.menu.kind === "saved") redrawMenu(); if (state.folder) renderFolder(); });
  return el("div", { class: "page-controls saved-sheet" },
    savedView(list),
    C.platform.native ? el("h2", { class: "overline" }, "Save again with pictures as") : el("h2", { class: "overline" }, "Save again"),
    C.platform.native ? seg("refresh-images", "Pictures", [
      { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
    ], mode, (v) => { mode = v; paintNote(); }) : null,
    note,
    go);
}

function removeSheet() {
  const list = folderPages(state.folder);
  const n = list.length;
  return el("div", { class: "page-controls remove-sheet" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, "Remove “" + state.folder + "”?"),
      el("p", { class: "meta" }, countLine(n) + " · " + formatSize(sizeOf(list)))),
    el("button", { class: "sheet-row", type: "button", onclick: () => removeFolder(false) }, "Remove the collection, keep its " + countLine(n)),
    el("button", { class: "sheet-row danger", type: "button", onclick: () => removeFolder(true) }, "Delete the collection and its " + countLine(n)),
    el("button", { class: "btn-text menu-cancel", type: "button", onclick: () => history.back() }, "Cancel"));
}

// Takes the folder off its pages, or deletes them with it (asked once
// more, since that can't be undone), then goes back to the library.
async function removeFolder(withPages) {
  const name = state.folder;
  const list = folderPages(name);
  if (withPages && !confirm("Delete “" + name + "” and its " + countLine(list.length) + " from " + HERE + "?" + alsoSynced() + filesNote(list))) return;
  if (withPages) forgetWatched(list);
  for (const p of list) {
    if (withPages) { if (p.link && !p.watched) C.platform.files.release(p.link); await C.store.removePage(p.id); }
    else { delete p.folder; delete p.folderAt; delete p.folderFav; delete p.folderFavAt; }
  }
  if (withPages) state.pages = state.pages.filter((p) => !list.includes(p));
  await C.store.writeIndex(state.pages);
  folderMode = "";
  await back(state.menu ? 2 : 1);
  renderLibrary();
  toast(withPages ? "Deleted " + name + " and its " + countLine(list.length) : "Removed " + name + ". Its clips are in the library.");
}

// The page before or after `p` in its folder, if any.
function neighbour(p, step) {
  if (!p || !p.folder) return null;
  const list = folderPages(p.folder);
  return list[list.indexOf(p) + step] || null;
}

const ICONS = {
  open: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  send: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  original: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  select: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  reorder: '<path d="M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5"/>',
  rename: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  saved: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
  chapters: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 5.5v2M4.5 11.5v1M4 17h1.5l-1.5 2h1.5"/>',
  remove: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  tag: '<path d="M3 12V4h8l9 9-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z"/>',
  mark: '<path d="M14.5 4.5l5 5L11 18H6v-5z"/><path d="M4 21h16"/>',
  translate: '<path d="M4 5h9M8.5 3v2M11 5c-1 4-3.5 7-7 8.5M6.5 8.5c1.2 2 3 3.5 5 4.5"/><path d="M13 21l4-9 4 9M14.5 18h5"/>',
  lookup: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><path d="M9 8h7M9 11.5h5"/>',
};
function svgIcon(name, size) {
  const box = el("span", { class: "svg-icon", "aria-hidden": "true" });
  box.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[name] + "</svg>";
  return box;
}
function tileButton(icon, label, onclick, cls) {
  const b = el("button", { class: "tile-btn" + (cls ? " " + cls : ""), type: "button", onclick }, el("span", { class: "tile-icon", "aria-hidden": "true" }), label);
  b.firstChild.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[icon] + "</svg>";
  return b;
}
// Favourite (0.29.2): a mark on the page, shown in the library's Show
// menu and in the Favourites widget.
function favTile(p, redraw) {
  const b = tileButton("star", "Favourite", () => setFavourite([p], !p.fav).then(redraw), p.fav ? "on" : "");
  b.setAttribute("aria-pressed", p.fav ? "true" : "false");
  return b;
}
async function favFolder(name, on) {
  setFolderFav(name, on);
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
  updateWidgets();
  toast(on ? name + " is a favourite" : name + " is no longer a favourite");
}
async function setFavourite(list, on) {
  for (const p of list) {
    if (on && !p.fav) { p.fav = true; p.favAt = Date.now(); }
    else if (!on) { delete p.fav; delete p.favAt; }
  }
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
  updateWidgets();
}
const menuRow = (label, onclick, cls) => el("button", { class: "row", type: "button", onclick }, el("span", { class: "row-label" + (cls ? " " + cls : "") }, label));

// A page's actions in the order they're used: where it goes (open,
// share, send, the original), what it is (tags, folder), its series in
// the reader, then the rarely used. The reader's ⋯ and the library's
// long press are the same sheet.
function pageSheet(p, where) {
  const box = el("div", { class: "page-controls" });
  const inReader = where === "reader";
  let exporting = false, marking = false;
  const draw = () => {
    if (marking) {
      fill(box, marksView(p, (open) => {
        marking = false;
        if (open && !inReader) { back().then(() => openPage(p.id)); return; }
        draw();
        focusFirst(box);
      }));
      focusFirst(box);
      return;
    }
    if (exporting) {
      fill(box, exportControls(p, () => { exporting = false; draw(); focusFirst(box); }));
      focusFirst(box);
      return;
    }
    const series = inReader ? [neighbours(p), neighbour(p, -1) ? null : followControls(p, true), neighbour(p, 1) ? null : followControls(p)].filter(Boolean) : [];
    fill(box,
      inReader ? null : el("div", { class: "menu-head" },
        el("p", { class: "menu-title", dir: "auto" }, p.title),
        el("p", { class: "meta" }, [siteOf(p), p.folder, readingLine(p), formatSize(p.bytes || 0)].filter(Boolean).join(" · "))),
      el("div", { class: "tile-row" },
        inReader ? null : tileButton("open", "Open", () => back().then(() => openPage(p.id))),
        // A clip made from a file has no address to share or go back to.
        p.file ? null : tileButton("share", "Share", () => shareLink(p)),
        p.link ? null : tileButton("send", "Export", () => { exporting = true; draw(); }),
        p.file ? null : tileButton("original", "Original", () => C.platform.openOutside(p.url)),
        p.link && C.platform.files.canReveal ? tileButton("folder", "Folder", () => showFolder(p)) : null,
        favTile(p, draw)),
      el("h3", { class: "overline" }, p.link ? "This file" : "This clip"),
      p.preview || inReader || !(p.marks || []).length ? null : el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: () => { markFocus = null; marking = true; draw(); } },
          el("span", { class: "row-label" }, "Highlights"),
          el("span", { class: "row-value" }, String((p.marks || []).length)))),
      // Only the start of a paywalled article (1.8.0): sign in for the rest.
      p.cut && !p.file && !p.preview && C.platform.signIn.available ? el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: () => back().then(() => signInFor(p)) },
          el("span", { class: "row-label accent" }, (C.platform.signIn.for(p.url) ? "Sign in again to " : "Sign in to ") + C.platform.signIn.host(p.url)),
          el("span", { class: "row-value" }, "Only the start"))) : null,
      tagsRow(p, draw),
      folderRow(p, draw),
      p.file ? null : picturesRow(p, draw),
      kindRow(p),
      series.length ? el("h3", { class: "overline" }, "Series") : null,
      ...series,
      el("h3", { class: "overline" }, "More"),
      el("div", { class: "group" },
        p.link && p.file && p.file.kind === "pdf" && !p.comic
          ? menuRow(p.view === "text" ? "Show as printed pages" : "Show as text", () => switchView(p, where)) : null,
        inReader && !C.files.printed(p) ? menuRow("Find in this clip", () => back().then(openFind)) : null,
        inReader && !C.files.printed(p) && C.reader.links(p.url).length ? menuRow("Save linked pages", () => back().then(() => openSheet("links"))) : null,
        menuRow(p.finished ? "Mark as unread" : "Mark as read", () => markRead([p], !p.finished).then(draw)),
        // The page changed since (1.38.0): fetched again in its place.
        p.file || p.preview || !/^https?:/.test(p.url || "") ? null
          : menuRow("Update from the site", () => back().then(() => updateClip(p))),
        // The original gone or changed (1.15.0): the Wayback Machine's copy.
        p.file || p.preview || p.comic || !/^https?:/.test(p.url || "") ? null
          : menuRow(p.archived ? "Find a newer archived copy" : "Use the archived copy", () => back().then(() => archiveClip(p))),
        inReader ? null : menuRow("Select", () => back().then(() => startSelect([p.id]))),
        menuRow(p.link ? "Remove from Waypage" : "Delete this clip", () => deletePage(p, where), "warn")));
  };
  draw();
  return box;
}

// Article or Comic (1.49.3): how a clip or file is read, switched here.
// A web clip saves again; a file only changes how it's shown. A PDF read
// read from outside stays as it is: its printed pages are pictures.
function kindRow(p) {
  if (p.preview || (p.link && p.file && p.file.kind === "pdf")) return null;
  if (!p.file && !/^https?:/.test(p.url || "")) return null;
  return el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, "Read as"),
    seg("kind-" + p.id, "Read as", [{ value: "article", label: "Article" }, { value: "comic", label: "Comic" }], p.comic ? "comic" : "article",
      (v) => back().then(() => setClipKind(p, v))));
}

let tagTyping = false;
function tagsRow(p, redraw) {
  const tags = p.tags || [];
  const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t))).sort((a, b) => a.localeCompare(b));
  const add = (raw, typed) => {
    const t = cleanTag(raw);
    if (!t || tags.some((x) => sameTag(x, t))) return;
    const known = allTags().find((x) => sameTag(x, t));
    // Typed tags keep the field open for the next one.
    tagTyping = !!typed;
    setTags(p, [...tags, known || t]).then(redraw);
  };
  const input = newField("new-tag", "Name the new tag", "New tag", (v) => add(v, true));
  input.setAttribute("autocapitalize", "off");
  if (tagTyping) {
    tagTyping = false;
    input.hidden = false;
    setTimeout(() => { const i = document.querySelector(".sheet:not([hidden]) .new-tag"); if (i) i.focus({ preventScroll: true }); }, 0);
  }
  const pick = dropdown({
    label: "Add a tag", cls: "field-pick", placeholder: "Add a tag",
    options: [...others.map((t) => ({ value: t, label: t })), { value: NEW_PICK, label: "New tag…" }],
    value: null,
    onpick: (v) => {
      if (v === NEW_PICK) { input.hidden = false; input.focus(); return; }
      add(v);
    },
  });
  return el("div", { class: "rc-row tall" }, el("span", { class: "rc-label" }, "Tags"),
    el("div", { class: "tag-edit" },
      tags.length ? el("div", { class: "chips" },
        ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": "Remove tag " + t,
          onclick: () => setTags(p, tags.filter((x) => x !== t)).then(redraw) }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×")))) : null,
      pick, input));
}

// From the reader, back out of it; from the library's sheet, back to the
// library (or out of a folder this emptied).
// With sync on, a deletion reaches every device.
const alsoSynced = () => (C.sync.on ? " With sync on, it goes from your other devices too." : "");
// A file read from where it is is only taken out of Waypage (1.1.3).
function linkedStays(list) {
  const w = list.map(watchOf).find(Boolean);
  return (list.length === 1 ? "The file itself stays" : "The files themselves stay") + (w ? " in " + w.name + ", and Waypage won't add " + (list.length === 1 ? "it" : "them") + " back." : " where " + (list.length === 1 ? "it is." : "they are."));
}
const filesNote = (list) => (list.some((p) => p.link) ? " Files read from where they are stay where they are." : "");
// A PDF read from where it is: its printed pages, or its words (1.1.3).
async function switchView(p, where) {
  if (p.view === "text") delete p.view; else p.view = "text";
  await C.store.writeIndex(state.pages);
  await back();
  if (where !== "reader" || state.open !== p) return;
  let html = null;
  try { html = await openLinked(p); } catch (e) { html = null; }
  if (!html) { toast("Couldn't open this clip's file. Try again."); return; }
  await show(p, html);
  C.files.drawNear($("readerFrame"));
}

async function deletePage(p, where) {
  if (!confirm(p.link ? "Remove “" + p.title + "” from Waypage? " + linkedStays([p])
    : "Delete “" + p.title + "” from " + HERE + "?" + alsoSynced())) return;
  forgetWatched([p]);
  if (p.link && !p.watched) C.platform.files.release(p.link);
  await C.store.removePage(p.id);
  state.pages = state.pages.filter((x) => x.id !== p.id);
  await C.store.writeIndex(state.pages);
  if (where === "reader") history.go(state.sheet ? -2 : -1);
  // From a key or the right-click menu (1.5.0) no sheet was opened.
  else if (where !== "keys") await back(andFolder(1));
  renderLibrary();
  if (state.folder) renderFolder();
  toast(p.link ? "Removed" : "Deleted");
}

// ---- Picking several ----
// "Select" (or a long press on a folder) turns taps into picks; the bar
// along the bottom then tags, moves, marks or deletes every picked page
// at once. A history entry, so back leaves it.

const picked = () => state.pages.filter((p) => state.select && state.select.has(p.id));

// A tap on a card or a folder: opens it, or picks it while picking.
// Shift-click (1.5.0) picks every card from the last one tapped to
// this one, and starts picking if it hadn't begun.
let shiftTap = false, lastTap = null;
document.addEventListener("click", (e) => { shiftTap = e.shiftKey; }, true);
function tapPages(ids, open) {
  if (!state.select && shiftTap && open) { lastTap = ids; startSelect(ids); return; }
  if (!state.select) { open(); return; }
  if (shiftTap && lastTap) {
    const nodes = [...listNow().querySelectorAll("[data-ids]")];
    const at = (list) => nodes.findIndex((n) => n.dataset.ids === list.join(","));
    const a = at(lastTap), b = at(ids);
    if (a >= 0 && b >= 0) {
      for (const n of nodes.slice(Math.min(a, b), Math.max(a, b) + 1)) for (const id of n.dataset.ids.split(",")) state.select.add(id);
      lastTap = ids;
      paintPicks();
      return;
    }
  }
  lastTap = ids;
  const all = ids.every((id) => state.select.has(id));
  for (const id of ids) all ? state.select.delete(id) : state.select.add(id);
  paintPicks();
}

function startSelect(ids, fromHistory) {
  if (state.select) return;
  state.select = new Set(ids || []);
  if (!fromHistory) history.pushState({ view: "select", folder: state.folder || undefined }, "");
  $("selectHead").hidden = false;
  $("selectBar").hidden = false;
  M.edgeIn($("selectHead"), "top");
  M.edgeIn($("selectBar"), "bottom");
  if (state.folder) renderFolder(); else renderLibrary();
  paintPicks();
  $("selectCancel").focus({ preventScroll: true });
}

function endSelect() {
  if (!state.select) return;
  state.select = null;
  for (const [id, edge] of [["selectHead", "top"], ["selectBar", "bottom"]]) M.edgeOut($(id), edge).then(() => { if (!state.select) $(id).hidden = true; });
  renderLibrary();
  if (state.folder) renderFolder();
}

// Picks are painted onto the cards already there, so picking never
// rebuilds the list or moves focus.
let picksPainted = false;
function paintPicks() {
  const on = !!state.select;
  document.body.classList.toggle("selecting", on || !!state.feedPick);
  // Nothing to clear when nothing was picked (1.2.0): every card was
  // visited on every redraw.
  if (!on && !picksPainted) return;
  picksPainted = on;
  for (const node of document.querySelectorAll("[data-ids]")) {
    const ids = node.dataset.ids.split(",");
    const isPicked = on && ids.every((id) => state.select.has(id));
    node.classList.toggle("picked", isPicked);
    const open = node.querySelector("button");
    if (on) open.setAttribute("aria-pressed", String(isPicked)); else open.removeAttribute("aria-pressed");
  }
  if (!on) return;
  const list = picked();
  const scope = state.folder ? folderPages(state.folder) : onScreen;
  $("selectCount").textContent = list.length ? countLine(list.length) + " picked" : "Pick clips";
  $("selectAll").textContent = scope.length && scope.every((p) => state.select.has(p.id)) ? "Pick none" : "Select all";
  $("selReadLabel").textContent = list.length && list.every((p) => p.finished) ? "Mark unread" : "Mark read";
  for (const id of ["selTags", "selFolder", "selRead", "selEdit", "selDelete"]) $(id).disabled = !list.length;
}

function selectAll() {
  const scope = state.folder ? folderPages(state.folder) : onScreen;
  const all = scope.every((p) => state.select.has(p.id));
  for (const p of scope) all ? state.select.delete(p.id) : state.select.add(p.id);
  paintPicks();
}

async function markRead(list, read) {
  for (const p of list) {
    p.finished = read;
    if (!read) p.at = 0;
  }
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
}

// Back through `n` history entries; resolves once there.
const back = (n = 1) => new Promise((resolve) => {
  addEventListener("popstate", () => resolve(), { once: true });
  history.go(-n);
});

// How far back a change that empties the open folder has to go.
const andFolder = (n) => n + (state.folder && !folderPages(state.folder).length ? 1 : 0);

async function readPicked() {
  const list = picked();
  if (!list.length) return;
  const read = !list.every((p) => p.finished);
  await markRead(list, read);
  await back();
  toast("Marked " + countLine(list.length) + (read ? " as read" : " as unread"));
}

async function deletePicked() {
  const list = picked();
  if (!list.length || !confirm(list.every((p) => p.link)
    ? "Remove " + (list.length === 1 ? "1 file" : list.length + " files") + " from Waypage? " + linkedStays(list)
    : "Delete " + countLine(list.length) + " from " + HERE + "?" + alsoSynced() + filesNote(list))) return;
  forgetWatched(list);
  for (const p of list) { if (p.link && !p.watched) C.platform.files.release(p.link); await C.store.removePage(p.id); }
  state.pages = state.pages.filter((p) => !list.includes(p));
  await C.store.writeIndex(state.pages);
  await back(andFolder(1));
  renderLibrary();
  toast((list.every((p) => p.link) ? "Removed " : "Deleted ") + countLine(list.length));
}

// ---- The library's sheet ----
// A page's menu (a long press, or right-click), and the tags and folder
// for picked pages. One sheet from the bottom over a dimmed library, in
// its own history entry.

const MENUS = {
  page: { label: "Clip", build: () => pageSheet(state.menu.page, "library") },
  tags: { label: "Tags", build: tagsSheet },
  folder: { label: "Collection", build: folderSheet },
  saved: { label: "What's saved", build: savedSheet },
  file: { label: "Opening a file", build: fileSheet },
  remove: { label: "Remove collection", build: removeSheet },
  addFeed: { label: "Add a feed", build: () => addFeedSheet() },
  feed: { label: "Feed", build: () => feedSheet() },
  newMail: { label: "New newsletter address", build: () => newMailSheet() },
  export: { label: "Export", build: () => exportControls(state.menu.page, () => history.back()) },
  keys: { label: "Keyboard shortcuts", build: () => keysSheet() },
  importList: { label: "Import", build: () => importSheet() },
  send: { label: "Saving a page", build: () => sendSheet() },
};
let menuUnder = [];
let menuFrom = null;

function openMenu(kind, page) {
  if (state.menu || !MENUS[kind]) return;
  state.menu = { kind, page };
  history.pushState({ view: "menu", kind, page: page ? page.id : undefined, folder: state.folder || undefined,
    select: state.select ? true : undefined }, "");
  $("menuBody").replaceChildren(MENUS[kind].build());
  $("menuSheet").setAttribute("aria-label", MENUS[kind].label);
  $("menuCatch").hidden = false;
  $("menuSheet").hidden = false;
  M.dim($("menuCatch"), true);
  // From 700 px a sheet is a dialog in the middle (1.5.0), grown out of
  // the button that asked for it (1.11.0).
  $("menuSheet").dataset.kind = kind;
  const asker = document.activeElement && document.activeElement.closest && document.activeElement.closest("button");
  menuFrom = asker && asker.offsetParent && !$("menuSheet").contains(asker) ? asker.getBoundingClientRect() : null;
  if (wide.matches) M.popFrom($("menuSheet"), menuFrom); else M.rise($("menuSheet"));
  const open = state.menu;
  afterSettle(() => {
    if (state.menu !== open) return;
    menuUnder = [state.folder ? $("folderView") : $("libraryView"), $("selectHead"), $("selectBar")].filter((n) => !covered(n));
    menuUnder.forEach((n) => cover(n, true));
    const first = $("menuSheet").querySelector("button:not(:disabled)");
    if (first && !$("menuSheet").contains(document.activeElement)) first.focus({ preventScroll: true });
  });
}

function closeMenu() {
  if (!state.menu) return;
  // The file question put away without an answer: nothing is opened.
  if (state.menu.kind === "file" && askingFile && !askingFile.answered) {
    askingFile.answered = true;
    askingFile.done(null);
  }
  state.menu = null;
  const was = menuUnder;
  menuUnder = [];
  const sheet = $("menuSheet"), catcher = $("menuCatch");
  M.dim(catcher, false).then(() => { if (!state.menu) catcher.hidden = true; });
  (wide.matches ? M.popInto(sheet, menuFrom) : M.sink(sheet, sheetDrop(sheet))).then(() => { if (!state.menu) sheet.hidden = true; delete sheet.dataset.drop; });
  afterSettle(() => was.forEach((n) => cover(n, false)));
}

function redrawMenu() {
  if (state.menu) $("menuBody").replaceChildren(MENUS[state.menu.kind].build());
}

// Tags for every picked page: a tag on all of them is on, one on some
// shows how many; a tap puts it on all of them, or takes it off all.
function tagsSheet() {
  const box = el("div", { class: "page-controls" });
  const draw = () => {
    const list = picked(), n = list.length;
    const on = (t) => list.filter((p) => (p.tags || []).some((x) => sameTag(x, t))).length;
    const write = async (change) => {
      list.forEach(change);
      await C.store.writeIndex(state.pages);
      renderLibrary();
      if (state.folder) renderFolder();
      draw();
    };
    const add = (raw) => {
      const t = cleanTag(raw);
      if (!t) return;
      const name = allTags().find((x) => sameTag(x, t)) || t;
      write((p) => { p.tags = withTags(p.tags, [name]); }).then(() => box.querySelector(".tag-input").focus({ preventScroll: true }));
    };
    const input = el("input", { class: "tag-input", type: "text", placeholder: "New tag", "aria-label": "New tag",
      maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(input.value); } });
    const tags = allTags();
    fill(box,
      el("h2", { class: "menu-title" }, "Tags for " + countLine(n)),
      tags.length ? el("div", { class: "chips" }, ...tags.map((t) => {
        const k = on(t), all = k === n;
        return el("button", { class: "chip" + (all ? " on" : k ? " some" : ""), type: "button", "aria-pressed": all ? "true" : k ? "mixed" : "false",
          "aria-label": t + (all ? ", on all, remove" : k ? ", on " + k + " of " + n + ", add to all" : ", add"),
          onclick: () => (all ? write((p) => { p.tags = (p.tags || []).filter((x) => !sameTag(x, t)); }) : add(t)) },
        t, k && !all ? el("span", { class: "chip-n" }, k + "/" + n) : null);
      })) : null,
      input,
      el("button", { class: "btn-primary menu-done", type: "button", onclick: () => history.back() }, "Done"));
  };
  draw();
  return box;
}

// Moves every picked page into one folder, keeping their order, or out
// of their folders.
function folderSheet() {
  const list = picked(), n = list.length;
  const move = async (name) => {
    const target = name && cleanTag(name) ? folderName(name) : null;
    const now = Date.now();
    [...list].sort((a, b) => (a.folderAt || a.savedAt || 0) - (b.folderAt || b.savedAt || 0)).forEach((p, i) => {
      if (!target) { delete p.folder; delete p.folderAt; joinFav(p, null); return; }
      if (p.folder && sameTag(p.folder, target)) return;
      joinFav(p, target);
      p.folder = target;
      p.folderAt = now + i;
    });
    await C.store.writeIndex(state.pages);
    await back(andFolder(2));
    renderLibrary();
    if (state.folder) renderFolder();
    toast(target ? "Moved " + countLine(n) + " to " + target : "Took " + countLine(n) + " out of their collections");
  };
  const input = el("input", { class: "tag-input", type: "text", placeholder: "New collection", "aria-label": "New collection",
    maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && cleanTag(input.value)) { e.preventDefault(); move(input.value); } });
  const folders = allFolders();
  return el("div", { class: "page-controls" },
    el("h2", { class: "menu-title" }, "Move " + countLine(n) + " to"),
    folders.length ? el("div", { class: "chips" }, ...folders.map((f) => el("button", { class: "chip", type: "button", onclick: () => move(f) }, f))) : null,
    input,
    list.some((p) => p.folder) ? el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: () => move(null) }, el("span", { class: "row-label" }, "Take out of their collections"))) : null);
}

// A long press (or right-click) on a page opens its menu; on a folder it
// starts picking with the folder picked; while picking it picks.
function onLongPress(node) {
  const ids = node.dataset.ids.split(",");
  if (state.select) { tapPages(ids); return; }
  if (node.classList.contains("tile")) { startSelect(ids); return; }
  const p = state.pages.find((x) => x.id === ids[0]);
  if (p) openMenu("page", p);
}

function longPress(root) {
  let timer = null, start = null, fired = false, mouse = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  root.addEventListener("pointerdown", (e) => {
    fired = false;
    mouse = e.pointerType === "mouse";
    const node = e.button === 0 && e.target.closest("[data-ids]");
    if (!node || e.target.closest(".card-retry, .move")) return;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      if (navigator.vibrate) navigator.vibrate(10);
      onLongPress(node);
    }, 480);
  });
  root.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(t, cancel);
  root.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener("contextmenu", (e) => {
    const node = e.target.closest("[data-ids]");
    if (!node) return;
    e.preventDefault();
    cancel();
    if (fired) return;
    // A right-click on a big screen opens a menu where it was clicked.
    if (mouse && wide.matches && !state.select && !node.classList.contains("tile")) { clipMenu(node, e.clientX, e.clientY); return; }
    fired = true;
    onLongPress(node);
  });
}

// The right-click menu (1.5.0): what the clip's sheet does, as a list
// by the pointer, with each one's key.
function clipMenu(node, x, y) {
  closeClipMenu(true);
  const p = state.pages.find((q) => q.id === node.dataset.ids.split(",")[0]);
  if (!p) return;
  const item = (icon, label, onclick, opts = {}) => {
    const b = el("button", { class: "pop-item" + (opts.warn ? " warn" : ""), type: "button", role: "menuitem", tabindex: "-1",
      onclick: () => { closeClipMenu(true); onclick(); } },
      el("span", { class: "pop-icon", "aria-hidden": "true" }), el("span", { class: "pop-label" }, label),
      opts.key ? el("kbd", { class: "pop-key" }, opts.key) : null);
    b.firstChild.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS[icon] + "</svg>";
    return b;
  };
  const sep = () => el("div", { class: "pop-sep", role: "separator" });
  const pop = el("div", { class: "pop-menu clip-pop", id: "clipPop", role: "menu", "aria-label": p.title },
    item("open", "Open", () => openPage(p.id), { key: "Enter" }),
    p.file ? null : item("original", "Open the original", () => C.platform.openOutside(p.url)),
    p.link && C.platform.files.canReveal ? item("folder", "Show in folder", () => showFolder(p)) : null,
    sep(),
    item("star", p.fav ? "Unfavourite" : "Favourite", () => setFavourite([p], !p.fav), { key: "F" }),
    item("tag", "Tags and collection…", () => openMenu("page", p)),
    item("check", p.finished ? "Mark as unread" : "Mark as read", () => markRead([p], !p.finished)),
    sep(),
    p.file ? null : item("share", "Share…", () => shareLink(p)),
    p.link ? null : item("send", "Export…", () => openMenu("export", p), { key: "E" }),
    item("select", "Select", () => startSelect([p.id]), { key: "X" }),
    sep(),
    item("remove", p.link ? "Remove from Waypage" : "Delete", () => deletePage(p, "keys"), { warn: true, key: "Del" }));
  document.body.append(pop);
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px";
  pop.style.top = Math.max(8, Math.min(y, innerHeight - h - 8)) + "px";
  node.classList.add("menu-on");
  clipMenuFor = node;
  // It grows from the point it was asked for: the ⋯ button, or where the
  // card was pressed or right-clicked.
  pop.from = { left: x, top: y, right: x + 1, bottom: y + 1, width: 1, height: 1 };
  M.popFrom(pop, pop.from);
  const items = () => [...pop.querySelectorAll(".pop-item:not(:disabled)")];
  items()[0].focus({ preventScroll: true });
  pop.addEventListener("keydown", (e) => {
    const all = items(), i = all.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); all[(to + all.length) % all.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeClipMenu(); }
    else if (e.key === "Tab") closeClipMenu(true);
  });
  setTimeout(() => {
    addEventListener("pointerdown", outsideClipMenu, true);
    addEventListener("scroll", closeOnScroll, { capture: true, once: true });
  });
}
let clipMenuFor = null;
const closeOnScroll = () => closeClipMenu(true);
function outsideClipMenu(e) {
  const pop = $("clipPop");
  if (pop && !pop.contains(e.target)) closeClipMenu(true);
}
function closeClipMenu(away) {
  const pop = $("clipPop");
  removeEventListener("pointerdown", outsideClipMenu, true);
  removeEventListener("scroll", closeOnScroll, true);
  const node = clipMenuFor;
  clipMenuFor = null;
  if (node) node.classList.remove("menu-on");
  if (!pop) return;
  pop.removeAttribute("id");
  pop.style.pointerEvents = "none";
  M.popInto(pop, pop.from).then(() => pop.remove());
  if (!away && node) { const b = node.querySelector("button"); if (b) b.focus({ preventScroll: true }); }
}

// ---- Pages leaving the app, and coming back (backup.js) ----

async function shareLink(p) {
  try {
    if (await C.platform.shareLink(p.title, p.url)) return;
    await navigator.clipboard.writeText(p.url);
    toast("Link copied");
  } catch (e) { toast("Couldn't share the link. Try again."); }
}

// ---- Export (0.25.2) ----
// A page as a file of the kind picked, saved where the person picks or
// handed to the share sheet. PDF goes through the print screen, where
// Save as PDF is a printer; page source is the site's page fetched again,
// for working out why a site saves badly.
const EXPORTS = [
  { value: "pdf", label: "PDF", note: "Opens the print screen, where Save as PDF is a printer." },
  { value: "html", label: "HTML", note: "One file with its pictures. Opens in any browser, and back in Waypage.", mime: "text/html" },
  { value: "epub", label: "EPUB", note: "For an e-reader, Apple Books or Send to Kindle.", mime: "application/epub+zip" },
  { value: "md", label: "Markdown", note: "The text for a notes app. Pictures link to the site.", mime: "text/markdown" },
  { value: "source", label: "Page source", note: "The site's own page, fetched again. Send it when a site saves badly.", mime: "text/html" },
];
const exportKind = () => { const k = load(EXPORT_KEY, "html"); return EXPORTS.some((e) => e.value === k) ? k : "html"; };

function focusFirst(box) {
  requestAnimationFrame(() => { const f = box.querySelector("input:checked, button"); if (f) f.focus({ preventScroll: true }); });
}

// `what` is a page, or { pages, title } for a folder.
function exportControls(what, done) {
  const folder = !!what.pages;
  const kinds = EXPORTS.filter((e) => !folder || e.value !== "source");
  let kind = folder ? load(EXPORT_KEY + ".folder", "epub") : exportKind();
  if (!kinds.some((e) => e.value === kind)) kind = "epub";
  const p = what;
  const save = el("button", { class: "btn-primary export-save", type: "button", onclick: () => exportAs(p, kind, "save", save) });
  const send = el("button", { class: "btn-quiet export-send", type: "button", onclick: () => exportAs(p, kind, "send", send) }, "Send");
  const sync = () => {
    save.textContent = kind === "pdf" ? "Print or save as PDF" : C.platform.native ? "Save to device" : "Download";
    send.hidden = kind === "pdf" || !C.platform.native;
  };
  const group = choiceGroup({ key: "export-kind", label: "Export as", options: kinds, get: () => kind,
    set: (v) => { kind = v; store(folder ? EXPORT_KEY + ".folder" : EXPORT_KEY, v); sync(); } });
  sync();
  return el("div", { class: "export" },
    el("div", { class: "export-top" },
      el("button", { class: "btn-quiet export-back", type: "button", onclick: done }, "Back"),
      el("p", { class: "menu-title", dir: "auto" }, folder ? what.title : p.title)),
    group,
    el("div", { class: "export-actions" }, save, send));
}

async function exportAs(p, kind, how, btn) {
  const pages = p.pages || null;
  if (kind === "pdf") { await (pages ? printPages(pages, p.title, btn) : printPage(p, btn)); return; }
  if (kind === "source" && !navigator.onLine) { toast("You're offline. Try again when you're back online."); return; }
  const mime = EXPORTS.find((e) => e.value === kind).mime;
  btn.disabled = true;
  try {
    let name, text = null, uri = null, blob = null;
    if (kind === "epub") ({ name, uri = null, blob = null } = await C.epub.exportBook(pages || [p], pages ? p.title : undefined));
    else if (kind === "md") ({ name, text } = await (pages ? C.backup.exportMarkdownAll(pages, p.title) : C.backup.exportMarkdown(p)));
    else if (kind === "html") ({ name, html: text } = await (pages ? C.backup.exportPages(pages, p.title) : C.backup.exportPage(p)));
    else ({ name, html: text } = await C.save.pageSource(p.url));
    if (!uri && text != null) uri = await C.platform.writeCache(name, text);
    if (!uri) C.platform.download(name, blob || new Blob([text], { type: mime }));
    else if (how === "save") {
      const saved = await C.platform.saveFile(uri, name, mime);
      if (saved === null) await C.platform.shareFile(uri, name);
      else if (saved) toast("Saved " + name);
    } else await C.platform.shareFile(uri, name);
  } catch (e) {
    if (!(e instanceof C.save.SaveError)) console.error(e);
    toast(e instanceof C.save.SaveError ? e.message : "Couldn't make the file. Try again.");
  }
  btn.disabled = false;
}

// A page, or a folder in its order, as an e-book (epub.js), for an
// e-reader or Send to Kindle.
async function sendBook(pages, btn, title) {
  btn.disabled = true;
  try {
    const out = await C.epub.exportBook([].concat(pages), title);
    if (out.uri) await C.platform.shareFile(out.uri, out.name);
    else C.platform.download(out.name, out.blob);
  } catch (e) {
    console.error(e);
    toast("Couldn't make the book. Try again.");
  }
  btn.disabled = false;
}

// The page file with a plain print style, on the phone's print screen;
// it runs no scripts and loads nothing, its pictures are inside it.
const printPage = (p, btn) => printFile(() => C.backup.exportPage(p), btn);
const printPages = (pages, title, btn) => printFile(() => C.backup.exportPages(pages, title), btn);
async function printFile(make, btn) {
  btn.disabled = true;
  try {
    const { name, html } = await make();
    const head = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'">' +
      "<style>" + C.epub.STYLE + "</style>";
    await C.platform.printHtml(name.replace(/\.html$/, ""), html.replace(/<head>/i, "<head>" + head));
  } catch (e) {
    console.error(e);
    toast("Couldn't open printing. Try again.");
  }
  btn.disabled = false;
}

// Back up the library (1.47.0): Pause and Stop while it runs, like
// Google Drive's. In a browser `gate` holds it between clips; the app's
// native packing listens to holdPack and stopPack instead.
let backupRun = null;
async function backUp() {
  if (backupRun) return;
  if (!state.pages.length && !feeds.length) { toast("There's nothing to back up yet."); return; }
  if (driveRun) { toast("Wait for the Google Drive backup to finish."); return; }
  const r = backupRun = { text: "Getting ready…", paused: false, stopped: false, wake: null };
  backupPaint(true);
  const gate = async () => {
    while (r.paused && !r.stopped) await new Promise((go) => { r.wake = go; });
    return !r.stopped;
  };
  try {
    const out = await C.backup.exportLibrary(state.pages, (done, total) => { r.text = done + " of " + total; backupPaint(); }, feeds, gate);
    backupRun = null;
    backupPaint(true);
    if (out.uri) await C.platform.shareFile(out.uri, out.name);
    else C.platform.download(out.name, out.blob);
  } catch (e) {
    if (e && e.code === "cancelled") toast("Backup stopped.");
    else { console.error(e); toast("Couldn't write the backup. Free some space and try again."); }
  }
  backupRun = null;
  backupPaint(true);
}
function backupPause(on) {
  const r = backupRun;
  if (!r || r.stopped) return;
  r.paused = on;
  C.backup.holdPack(on);
  if (!on && r.wake) { r.wake(); r.wake = null; }
  backupPaint(true);
}
function backupStop() {
  const r = backupRun;
  if (!r) return;
  r.stopped = true;
  C.backup.stopPack();
  if (r.wake) { r.wake(); r.wake = null; }
  backupPaint(true);
}
// Progress changes only the line; Pause, Stop and the end redraw the row.
function backupPaint(whole) {
  const row = $("backupRow");
  if (!row) return;
  if (whole) { row.replaceWith(backupRow()); return; }
  const line = $("backupStatus");
  if (line && backupRun) line.textContent = backupLine();
}
const backupLine = () => { const r = backupRun; return r.stopped ? "Stopping…" : r.paused ? "Paused · " + r.text : r.text; };
function backupRow() {
  const r = backupRun;
  if (!r) return el("button", { class: "row", id: "backupRow", type: "button", onclick: backUp },
    el("span", { class: "row-label accent" }, "Back up the library"));
  return el("div", { class: "row", id: "backupRow" },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label" }, "Backing up"),
      el("span", { class: "choice-note", id: "backupStatus", "aria-live": "polite" }, backupLine())),
    el("span", { class: "backup-actions" },
      el("button", { class: "btn-small", type: "button", ...(r.stopped ? { disabled: "" } : {}), onclick: () => backupPause(!r.paused) }, r.paused ? "Resume" : "Pause"),
      el("button", { class: "btn-quiet danger", type: "button", ...(r.stopped ? { disabled: "" } : {}), onclick: backupStop }, "Stop")));
}

// Every highlight as one Markdown file (1.14.0), clip by clip, the clip
// highlighted last first, as the Highlights place's Copy all writes them.
// The feeds you follow as OPML (1.32.0), for another RSS reader.
async function saveOpml(btn) {
  if (!feeds.length) return;
  const name = "Waypage feeds " + new Date().toISOString().slice(0, 10) + ".opml";
  // Not the newsletter addresses (1.43.0): their links are their keys.
  const text = C.imports.writeOpml(siteFeeds());
  btn.disabled = true;
  try {
    const uri = await C.platform.writeCache(name, text);
    if (!uri) C.platform.download(name, new Blob([text], { type: "text/x-opml" }));
    else {
      const saved = await C.platform.saveFile(uri, name, "text/x-opml");
      if (saved === null) await C.platform.shareFile(uri, name);
      else if (saved) toast("Saved " + name);
    }
  } catch (e) {
    console.error(e);
    toast("Couldn't make the file. Try again.");
  }
  btn.disabled = false;
}

async function saveHighlights(btn) {
  const clips = state.pages.filter((p) => (p.marks || []).length)
    .map((p) => ({ p, last: Math.max(...p.marks.map((m) => m.at || 0)) })).sort((a, b) => b.last - a.last);
  if (!clips.length) { toast("No highlights yet."); return; }
  const name = "Waypage highlights " + new Date().toISOString().slice(0, 10) + ".md";
  const text = clips.map((c) => C.backup.marksMarkdown(c.p)).join("\n");
  btn.disabled = true;
  try {
    const uri = await C.platform.writeCache(name, text);
    if (!uri) C.platform.download(name, new Blob([text], { type: "text/markdown" }));
    else {
      const saved = await C.platform.saveFile(uri, name, "text/markdown");
      if (saved === null) await C.platform.shareFile(uri, name);
      else if (saved) toast("Saved " + name);
    }
  } catch (e) {
    console.error(e);
    toast("Couldn't make the file. Try again.");
  }
  btn.disabled = false;
}

// A backup (a zip) or one page's file, picked from the phone.
// A file opened from Settings, the save screen, a drop or another app
// (0.31.0): a backup is restored, a clip sent as a file comes back, and
// a book, a note, a page or a comic becomes a clip of its own. `open`
// opens it once it's in.
const FILE_ACCEPT = ".epub,.mobi,.azw,.azw3,.prc,.fb2,.md,.markdown,.txt,.html,.htm,.eml,.cbz,.pdf,.pptx,.csv,.json,.zip,.opml,.xml,application/epub+zip,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/markdown,text/plain,text/html,message/rfc822,text/csv,application/json,application/zip";
// The system's picker where there is one (it also grants a lasting
// permission, for a clip that reads from the file); the browser's own
// otherwise.
async function pickFile(first) {
  if (C.platform.files.canLink) {
    let got = null;
    try { got = await C.platform.files.pick(); } catch (e) { got = null; }
    if (!got) return;
    if (first) await first();
    let file;
    try { file = await C.platform.files.blob(got.ref, got.size); } catch (e) {
      toast("Couldn't read that file. Try opening it again.");
      return;
    }
    openFile(file, null, true, got.ref);
    return;
  }
  // Kept in the page while the picker is up, so it isn't collected.
  document.querySelectorAll(".file-pick").forEach((n) => n.remove());
  const input = el("input", { type: "file", accept: FILE_ACCEPT, class: "file-pick visually-hidden", tabindex: "-1", "aria-hidden": "true" });
  document.body.append(input);
  input.addEventListener("change", async () => {
    const f = input.files[0];
    input.remove();
    if (!f) return;
    if (first) await first();
    openFile(f, null, true);
  });
  input.click();
}

// ---- Import (1.9.0) ----
// Pocket's, Instapaper's or Omnivore's export (src/imports.js), saved as
// one run like a list of links: their tags kept, the ones read there
// marked read here, oldest first so the newest ends up on top. Links
// already saved only get the tags.
let importing = null;
function importSheet() {
  const x = importing;
  if (!x) return el("div");
  const fresh = x.items.filter((it) => !savedAs(it.url));
  const unread = fresh.filter((it) => !it.read);
  let which = unread.length ? "unread" : "all";
  const n = () => (which === "unread" ? unread : fresh).length;
  const go = el("button", { class: "btn-primary import-go", type: "button" });
  const note = el("p", { class: "footnote" });
  const paint = () => {
    go.textContent = n() ? "Save " + countLine(n()) : "Nothing new to save";
    go.disabled = !n();
    note.textContent = n() ? "They save one after another, in Downloads, about " + Math.max(1, Math.round(n() * 3 / 60)) + " min" + (n() > 40 ? "; Waypage needs to stay open" : "") + ". Their tags come along" + (which === "all" && fresh.length > unread.length ? ", and the ones you read there are marked read" : "") + "." : "Everything in it is already in your library.";
  };
  go.addEventListener("click", () => {
    const list = which === "unread" ? unread : fresh;
    const by = new Map(list.map((it) => [it.url, it]));
    importing = null;
    back().then(() => saveAll(list.map((it) => it.url), null, (u) => ({ tags: (by.get(u) || {}).tags || [], finished: !!(by.get(u) || {}).read }), undefined, true));
  });
  paint();
  const from = x.source === "a list" ? "a list of links" : x.source === "bookmarks" ? "your bookmarks" : x.source;
  return el("div", { class: "page-controls import-sheet" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title" }, "Import from " + from),
      el("p", { class: "meta" }, [x.items.length === 1 ? "1 link" : x.items.length + " links", x.items.length - fresh.length ? (x.items.length - fresh.length) + " already here" : ""].filter(Boolean).join(" · "))),
    fresh.length > unread.length && unread.length ? seg("import-which", "Which", [
      { value: "unread", label: "To read · " + unread.length },
      { value: "all", label: "All · " + fresh.length },
    ], which, (v) => { which = v; paint(); }) : null,
    note,
    go);
}

// Keep a copy, or read from the file where it is? Asked for every file
// of your own (0.32.2). `can` is false when the file came without a
// lasting permission (shared from another app that doesn't give one):
// the second way is shown, with what to do instead. Resolves to true to
// link, false to copy, null to stop.
let askingFile = null;
function askKeep(file, kind, can) {
  return new Promise((done) => {
    askingFile = { file, kind, done, can, answered: false };
    openMenu("file");
  });
}
// A PowerPoint deck can't be read as it is, so it's offered as a PDF made
// from it (1.49.0). Resolves to true to convert, null to stop.
function askConvert(file) {
  return new Promise((done) => {
    askingFile = { file, kind: "pptx", done, convert: true, answered: false };
    openMenu("file");
  });
}
function fileSheet() {
  const a = askingFile;
  if (!a) return el("div");
  const answer = (v) => { if (a.answered) return; a.answered = true; a.done(v); back(); };
  const big = formatSize(a.file.size || 0);
  if (a.convert) {
    return el("div", { class: "page-controls" },
      el("div", { class: "menu-head" },
        el("p", { class: "menu-title", dir: "auto" }, a.file.name),
        el("p", { class: "meta" }, ["PowerPoint", big].filter(Boolean).join(" · "))),
      el("div", { class: "group" },
        el("button", { class: "row", type: "button", onclick: () => answer(true) },
          el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, "Convert to PDF"),
            el("span", { class: "choice-note" }, "Makes a PDF of the slides, which you save where you like, and opens it. The slides are redrawn, so some effects, charts and fonts may look different."))),
        el("button", { class: "row", type: "button", onclick: () => answer(null) },
          el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, "Cancel"),
            el("span", { class: "choice-note" }, "Nothing is opened or saved.")))));
  }
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, a.file.name),
      el("p", { class: "meta" }, [C.files.KINDS[a.kind], big].filter(Boolean).join(" · "))),
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: () => answer(false) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, "Keep a copy"),
          el("span", { class: "choice-note" }, "A clip like any other: it syncs, and it stays when the file goes. About " + big + " " + ON_HERE + "."))),
      el("button", { class: "row", type: "button", ...(a.can ? {} : { disabled: "" }), onclick: () => answer(true) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label" + (a.can ? " accent" : "") }, "Read from where it is"),
          el("span", { class: "choice-note" }, a.can
            ? "Lives in Files and costs almost nothing here. It needs the file to stay where it is, and doesn't sync."
            : "Waypage wasn't given lasting access to this file. Open it with Open a file to read it from where it is.")))));
}
// A file dropped on the window, on a computer.
addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
// Chrome and Edge hand over a lasting handle too, so a dropped file can
// be read from where it is; it has to be asked for before the event ends.
addEventListener("drop", async (e) => {
  const files = [...((e.dataTransfer && e.dataTransfer.files) || [])];
  if (!files.length) return;
  e.preventDefault();
  const items = [...(e.dataTransfer.items || [])].filter((i) => i.kind === "file");
  const handles = items.length === files.length && items.every((i) => i.getAsFileSystemHandle)
    ? items.map((i) => i.getAsFileSystemHandle().catch(() => null)) : [];
  for (const [i, f] of files.entries()) {
    let got = null;
    if (handles[i]) { try { got = await C.platform.files.adopt(await handles[i]); } catch (err) { got = null; } }
    await openFile(f, null, files.length === 1, got && got.ref);
  }
});
// The same file again is already here, unless it's being brought in the
// other way this time (a copy of one read from where it is, or back).
const hasFile = (name, size, link) => state.pages.some((p) => p.file && p.file.name === name && p.file.size === size && !p.link === !link);
const fileLike = (name, size, link) => state.pages.find((p) => p.file && p.file.name === name && p.file.size === size && !p.link === !link);
const FILE_KINDS_LINE = "EPUB, PDF, PowerPoint, Markdown, text, HTML, email (.eml) and CBZ comic files";
async function openFile(file, btn, open, ref, forced) {
  if (!file) return;
  const label = btn ? btn.querySelector(".row-label") : null;
  const say = (t) => { if (label) label.textContent = t; };
  if (btn) btn.disabled = true;
  say("Opening…");
  try {
    // Feeds from another RSS reader, as OPML (1.32.0): followed here.
    const feedList = await C.imports.readOpml(file).catch(() => null);
    if (feedList) {
      if (ref) C.platform.files.release(ref);
      if (btn) { btn.disabled = false; say("Restore"); }
      followFeeds(feedList);
      return;
    }
    // Another read-later app's export (1.9.0): its links, to save.
    const exported = await C.imports.read(file).catch(() => null);
    if (exported) {
      if (ref) C.platform.files.release(ref);
      if (btn) { btn.disabled = false; say("Restore"); }
      importing = exported;
      openMenu("importList");
      return;
    }
    const kind = await C.files.kindOf(file);
    if (kind === "pptx") {
      if (btn) { btn.disabled = false; say("Restore or open a file"); }
      await convertDeck(file, ref, open);
      return;
    }
    // Already here from the watched folder (1.1.3), copy or not.
    const inFolder = C.files.KINDS[kind] && state.pages.find((p) => p.watched && p.file && p.file.name === file.name && p.file.size === file.size);
    if (inFolder) {
      if (ref) C.platform.files.release(ref);
      toast("Already in your library, from " + ((watchOf(inFolder) || {}).name || "your watched folder"));
      if (open) openPage(inFolder.id);
      if (btn) { btn.disabled = false; say("Restore"); }
      return;
    }
    let link = null;
    // A PDF made from a deck was saved just now, so it isn't asked about.
    if (forced) link = forced.ref || null;
    else if (C.files.canLink(kind) && (ref || C.platform.files.canLink)) {
      const asked = await askKeep(file, kind, !!ref);
      if (asked == null) { if (btn) { btn.disabled = false; say("Restore"); } return; }
      link = asked ? ref : null;
    }
    if (ref && !link) C.platform.files.release(ref);
    if (kind === "backup") {
      await restoreBackup(file, say);
    } else if (kind === "zip") {
      toast("This zip isn't a Waypage backup, an EPUB or a comic, so it can't be opened here.");
    } else if (!kind) {
      toast("Waypage opens " + FILE_KINDS_LINE + ", and its own backups.");
    } else {
      // A file being read is a card in the library and Downloads (1.1.3).
      const run = kind === "clip" ? null : Object.assign(startRun(null, "Adding a file", 1), { label: file.name, files: true, now: "Opening" });
      if (run) runChanged();
      const shown = run && fileProgress(run, "Reading");
      let meta;
      try {
        meta = kind === "clip" ? await C.backup.importPage(await file.text(), (url) => !!savedAs(url))
          : await C.files.bring(file, kind, { has: (name, size) => hasFile(name, size, link), link,
            onProgress: (done, total, what) => {
              shown(done, total, what);
              say(what === "words" ? "Reading, page " + done + " of " + total : "Pictures, " + done + " of " + total);
            } });
      } finally {
        if (run) { run.now = null; runs.delete(run); runChanged(); }
      }
      if (meta.already) {
        toast("Already in your library");
        const had = open && kind !== "clip" && fileLike(file.name, file.size, link);
        if (had) openPage(had.id);
      } else {
        state.pages.unshift(meta);
        await C.store.writeIndex(state.pages);
        await loadThumbs();
        C.store.keepStored();
        toast("Added “" + meta.title + "”");
        if (open) openPage(meta.id);
      }
    }
    renderLibrary();
  } catch (e) {
    const told = e instanceof C.files.FileError || /Waypage|empty/.test(e.message);
    if (!told) console.error(e);
    toast(told ? e.message : "Couldn't open that file. Try again.");
  }
  if (btn) btn.disabled = false;
  if (state.settings) renderSettings();
  if (state.section) renderSection();
}

// A deck asked about, turned into a PDF, saved where the person picks and
// opened from there, as a PDF picked from that place would be (1.49.0).
async function convertDeck(file, ref, open) {
  if (!(await askConvert(file))) { if (ref) C.platform.files.release(ref); return; }
  const run = Object.assign(startRun(null, "Converting a deck", 1), { label: file.name, files: true, now: "Converting" });
  runChanged();
  let made, saved;
  try {
    made = await C.pptx.toPdf(file, (done, total) => {
      run.now = "Slide " + Math.min(done + 1, total) + " of " + total;
      run.part = total ? done / total : null;
      updateRunCard(run);
    });
    run.now = "Saving";
    updateRunCard(run);
    saved = await C.platform.saveLinked(made.blob, made.name, "application/pdf", ref);
  } catch (e) {
    const told = e instanceof C.files.FileError;
    if (!told) console.error(e);
    toast(told ? e.message : "Couldn't turn that into a PDF. Try again.");
    return;
  } finally {
    run.now = null; runs.delete(run); runChanged();
    if (ref) C.platform.files.release(ref);
  }
  if (saved.saved === false) { toast("Not converted: the PDF wasn't saved."); return; }
  // No place to keep it (a browser without the save picker): it downloads,
  // and a copy is what opens.
  if (saved.saved === null) C.platform.download(made.name, made.blob);
  await openFile(new File([made.blob], made.name, { type: "application/pdf" }), null, open, saved.ref, { ref: saved.ref });
  if (made.skipped) toast(made.skipped === 1 ? "One chart or picture couldn't be drawn." : made.skipped + " charts or pictures couldn't be drawn.");
}

// A backup merged in: a file opened here, or one from Google Drive.
async function restoreBackup(file, say) {
  const res = await C.backup.restoreLibrary(file, state.pages, sameUrl, (done, total) => say("Restoring, " + done + " of " + total));
  state.pages = res.pages;
  await C.store.writeIndex(state.pages);
  texts.clear();
  await loadThumbs();
  if (res.added + res.replaced) C.store.keepStored();
  const followed = restoreFeeds(res.feeds);
  // A Links only backup's clips (1.47.0), saved again as sync's are.
  if (res.links.length) saveFromLinks(res.links, "From the backup");
  const n = res.added + res.replaced;
  const what = [n ? countLine(n) : "", followed ? (followed === 1 ? "1 feed" : followed + " feeds") : "",
    res.links.length ? res.links.length + " to save again from their links" : ""].filter(Boolean).join(" and ");
  toast((what ? "Restored " + what : "Nothing new to restore") + (res.kept ? ". " + res.kept + " already here" + (res.kept === 1 ? " was" : " were") + " kept." : "."));
}

// ---- A watched folder (1.1.0) ----
// A folder picked once (say Books) that Waypage looks in each time it
// opens, comes back, or is pulled down: a file it hasn't seen becomes a
// clip reading from where it is, with no question, in a collection named
// after its own folder when it's in one; a clip whose file left the
// folder leaves the library. Clips from it carry `watched` (the folder).
// This device's own, like any clip that reads from a file: never synced.
// In the app on Android, and on iOS since 1.6.0 (a bookmark of the folder).
// Since 1.4.0 any number of folders, a list under WATCHES_KEY; the one
// folder from before moves into it.
const WATCH_KEY = "waypage.watch";
const WATCHES_KEY = "waypage.watches";
const WATCH_EXTS = /\.(epub|mobi|azw3?|prc|fb2|pdf|cbz|md|markdown|txt|html?|xhtml|eml)$/i;
let watching = null;
function watches() {
  let list = load(WATCHES_KEY, null);
  if (!Array.isArray(list)) {
    const w = load(WATCH_KEY, null);
    list = w && w.tree ? [w] : [];
    store(WATCHES_KEY, list);
    localStorage.removeItem(WATCH_KEY);
  }
  return list.filter((w) => w && w.tree);
}
const saveWatch = (w) => store(WATCHES_KEY, watches().map((x) => (x.tree === w.tree ? w : x)));
// Where a file read from outside sits, in the phone's Files app (1.27.2).
async function showFolder(p) {
  const w = watchOf(p);
  const got = await C.platform.files.reveal(p.link, w ? w.tree : null);
  if (!got.opened) toast(got.where ? "It's in " + got.where : "Couldn't open its folder");
}
const watchOf = (p) => (p && p.watched ? watches().find((w) => w.tree === p.watched) || null : null);
function watchSoon(ms = 1500) {
  if (!C.platform.files.canWatch || !watches().length || watchStopped) return;
  clearTimeout(watchSoon.t);
  watchSoon.t = setTimeout(() => lookInFolder(), ms);
}
// Looks in every watched folder; one toast for all of them when asked to.
async function lookInFolder(said, only) {
  const list = only ? watches().filter((w) => w.tree === only.tree) : watches();
  if (!list.length || !C.platform.files.canWatch) return null;
  if (said !== undefined) watchStopped = false;
  if (watching) return watching;
  watching = (async () => {
    // Every folder is listed at once (1.6.0), so a slow memory card holds
    // up only its own files; what's found is then added one folder at a
    // time, since adding writes the library's index.
    const scans = list.map((w) => C.platform.files.scan(w.tree));
    const got = [];
    for (let i = 0; i < list.length; i++) got.push(await lookInOne(list[i], said, scans[i]));
    const added = got.reduce((n, g) => n + g.added, 0), gone = got.reduce((n, g) => n + g.gone, 0);
    const failed = got.flatMap((g) => g.failed);
    const lost = got.filter((g) => g.lost).map((g) => g.name);
    const names = list.length === 1 ? list[0].name : "your watched folders";
    // Said each time it looks, since they're tried again each time.
    if (said && lost.length) toast("Waypage can't open " + lost.join(" or ") + " any more. Pick it again in Settings, Content.");
    else if (failed.length && said !== false) toast(failed.length === 1 ? failed[0] : "Couldn't read " + failed.length + " files from " + names + ". " + failed[0]);
    else if (added && said !== false) toast("Added " + (added === 1 ? "1 file" : added + " files") + " from " + (list.length === 1 ? names : got.filter((g) => g.added).map((g) => g.name).join(", ")));
    else if (said && !gone) toast("Nothing new in " + names + ".");
    if (added || gone || got.some((g) => g.joined)) { renderLibrary(); updateWidgets(); }
    return { added, gone };
  })();
  try { return await watching; } finally { watching = null; if (state.section === "library") renderSection(); }
}
async function lookInOne(w, said, scan) {
  const out = { name: w.name, added: 0, gone: 0, joined: 0, failed: [], lost: false };
  {
    const got = await scan;
    // A folder that can't be read (a memory card out, the permission
    // taken back) takes nothing away: its clips wait for it.
    if (!got.ok) {
      w.lost = true; saveWatch(w);
      out.lost = true;
      return out;
    }
    if (w.lost) { delete w.lost; saveWatch(w); }
    // A Drive folder picked before 1.27.1 was named by its id.
    if (got.name && got.name !== w.name) { w.name = out.name = got.name; saveWatch(w); }
    const there = got.files.filter((f) => WATCH_EXTS.test(f.name));
    const refs = new Set(there.map((f) => f.ref));
    // Files removed from Waypage stay out while they're in the folder.
    if (w.skip && w.skip.some((ref) => !refs.has(ref))) { w.skip = w.skip.filter((ref) => refs.has(ref)); saveWatch(w); }
    const gone = state.pages.filter((p) => p.watched === w.tree && !refs.has(p.link));
    if (gone.length) {
      for (const p of gone) await C.store.removePage(p.id);
      state.pages = state.pages.filter((p) => !gone.includes(p));
      await C.store.writeIndex(state.pages);
      if (state.folder) renderFolder();
    }
    const known = new Set(state.pages.filter((p) => p.link).map((p) => p.link));
    // A file already brought in by hand (1.1.3) isn't brought in again:
    // one read from where it is joins the folder, a copy stays a copy.
    let joined = 0;
    for (const f of there) {
      if (known.has(f.ref)) continue;
      const had = state.pages.find((p) => p.file && !p.watched && p.file.name === f.name && p.file.size === f.size);
      if (!had) continue;
      known.add(f.ref);
      if (!had.link) continue;
      if (had.link !== f.ref) C.platform.files.release(had.link);
      Object.assign(had, { link: f.ref, watched: w.tree });
      had.file.path = f.path.slice(0, 500);
      joined++;
    }
    // Files here before a collection was picked for the folder follow it
    // (1.28.2), once: one moved by hand since then stays.
    if (w.into && !w.intoAt) { w.intoAt = Date.now(); saveWatch(w); }
    if (w.into) {
      const to = folderName(w.into);
      for (const p of state.pages) {
        if (p.watched !== w.tree || p.folder === to || (p.folderAt || 0) >= w.intoAt) continue;
        Object.assign(p, { folder: to, folderAt: w.intoAt });
        joined++;
      }
    }
    if (joined) await C.store.writeIndex(state.pages);
    out.joined = joined;
    const fresh = there.filter((f) => !known.has(f.ref) && !(w.skip || []).includes(f.ref))
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }));
    let added = 0;
    const failed = [];
    // Each file is a step on one card in the library and Downloads,
    // with Pause and Stop, like a run of saves (1.1.3).
    const run = fresh.length ? Object.assign(startRun(null, "Watched folder", fresh.length), { label: w.name, files: true }) : null;
    if (run) runChanged();
    for (const f of fresh) {
      if (!(await gate(run))) break;
      Object.assign(run, { now: "Opening " + f.name, part: null });
      updateRunCard(run);
      try {
        const file = await C.platform.files.blob(f.ref, f.size);
        const kind = await C.files.kindOf(file);
        if (!C.files.KINDS[kind]) { run.total--; continue; }
        const meta = await C.files.bring(file, kind, { link: f.ref, has: (name, size) => hasFile(name, size, f.ref), onProgress: fileProgress(run, f.name) });
        if (meta.already) { run.total--; continue; }
        meta.watched = w.tree;
        meta.file.path = f.path.slice(0, 500);
        // The collection picked for the folder (1.28.0), else its subfolder's name.
        const dir = w.into || f.path.split("/").slice(-2, -1)[0];
        if (dir) { meta.folder = folderName(dir); meta.folderAt = Date.now(); }
        state.pages.unshift(meta);
        await C.store.writeIndex(state.pages);
        added++;
        run.saved++;
      } catch (e) {
        if (!(e instanceof C.files.FileError)) console.error(e);
        failed.push(f.name + ": " + (e && e.message ? e.message : "couldn't read it"));
        run.failed++;
      }
    }
    if (run) { run.now = null; run.part = null; endRun(run); }
    if (added) { await loadThumbs(); C.store.keepStored(); }
    Object.assign(out, { added, gone: gone.length, failed });
    return out;
  }
}
// "Page 3 of 40" on a file's card as it's read.
const fileProgress = (run, name) => (done, total, what) => {
  run.now = name + " · " + (what === "words" ? "page " : "picture ") + done + " of " + total;
  run.part = total ? done / total : null;
  updateRunCard(run);
};
// Watched folders in Settings, Content (1.4.1; a list since 1.4.0): a row per
// folder with how many files came from it and Stop watching at its end,
// then Look now and Watch a folder.
// Sites signed in to (1.8.0), on this device only: each can be signed
// out of, and another signed in to by its address.
function signedGroup() {
  if (!C.platform.signIn.available) return null;
  const list = C.platform.signIn.sites();
  const rows = list.map((s) => el("div", { class: "row watch-row" },
    el("span", { class: "row-label", dir: "auto" }, s.host),
    el("span", { class: "row-value" }, "Signed in " + whenText(s.at)),
    el("button", { class: "row-x", type: "button", "aria-label": "Sign out of " + s.host, title: "Sign out", onclick: async () => {
      if (!confirm("Sign out of " + s.host + "? Waypage forgets its cookies on " + HERE + ".")) return;
      await C.platform.signIn.signOut(s.host);
      toast("Signed out of " + s.host);
      renderSection();
    } }, el("span", { class: "visually-hidden" }, "Sign out"), svgX())));
  const field = el("input", { class: "tag-input sign-in-field", type: "url", placeholder: "nytimes.com", "aria-label": "Site to sign in to",
    inputmode: "url", enterkeyhint: "go", autocapitalize: "off", autocomplete: "off", spellcheck: "false", hidden: "" });
  field.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const typed = field.value.trim();
    const url = /^https?:\/\//i.test(typed) ? typed : "https://" + typed;
    if (!C.platform.signIn.host(url) || !C.platform.signIn.host(url).includes(".")) { toast("That doesn't look like a site's address."); return; }
    if (!navigator.onLine) { toast("You're offline. Sign in when you're back online."); return; }
    field.value = "";
    await C.platform.signIn.open(url).catch(() => {});
    renderSection();
  });
  rows.push(el("button", { class: "row", type: "button", onclick: () => { field.hidden = false; field.focus(); } },
    el("span", { class: "row-label accent" }, list.length ? "Sign in to another site" : "Sign in to a site")));
  const sec = section("Signed in", "Subscribe to a site? Sign in to it here, and Waypage saves its articles as you, whole instead of only their start. Sign-ins stay on " + HERE + " and don't sync.",
    el("div", { class: "group" }, ...rows),
    field);
  sec.id = "signedSection";
  return sec;
}

function watchGroup() {
  if (!C.platform.files.canWatch) return null;
  const list = watches();
  const count = (w) => state.pages.filter((p) => p.watched === w.tree).length;
  const rows = list.map((w) => el("div", { class: "row watch-row" },
    el("span", { class: "row-label" }, w.name),
    el("span", { class: "row-value" }, w.lost ? "Can't open it" : count(w) === 1 ? "1 file" : count(w) + " files"),
    el("button", { class: "row-x row-refresh" + (watching ? " looking" : ""), type: "button", ...(watching ? { disabled: "" } : {}), "aria-label": "Look in " + w.name + " now", title: "Look now", onclick: () => lookInFolder(true, w) },
      el("span", { class: "visually-hidden" }, "Look now"),
      svgRefresh()),
    el("button", { class: "row-x", type: "button", "aria-label": "Stop watching " + w.name, title: "Stop watching", onclick: () => stopWatching(w) },
      el("span", { class: "visually-hidden" }, "Stop watching"),
      svgX())));
  // Under each folder, the collection its new files go into (1.28.0).
  for (const [i, w] of [...list.entries()].reverse()) rows.splice(i + 1, 0, el("div", { class: "row watch-into" },
    el("span", { class: "row-label" }, "New files go into"), watchIntoPick(w)));
  rows.push(el("button", { class: "row", type: "button", onclick: pickWatched }, el("span", { class: "row-label accent" }, list.length ? "Watch another folder" : "Watch a folder")));
  const lost = list.filter((w) => w.lost).map((w) => w.name);
  const sec = section(list.length === 1 ? "Watched folder" : "Watched folders", "Pick a folder, like Books, and Waypage adds what's in it each time it opens, or when you tap the arrow. New files go into the collection picked under each folder, or one named after their folder, and a file you delete there leaves Waypage too. Each file is read from where it is, so it doesn't sync.",
    el("div", { class: "group" }, ...rows),
    lost.length ? el("p", { class: "footnote warn" }, "Waypage can't open " + lost.join(" or ") + " any more. Pick it again to carry on.") : null);
  sec.id = "watchSection";
  return sec;
}
const WATCH_NEW = "\u0000new";
function watchIntoPick(w) {
  const names = allFolders();
  const options = [{ value: "", label: "Its subfolders" }, ...[...new Set([...(w.into ? [w.into] : []), ...names])].map((f) => ({ value: f, label: f })),
    { value: WATCH_NEW, label: "New collection…" }];
  // The folder's files already here move too (1.28.1): a picked
  // collection is made by the files in it, so with none moved it didn't
  // show at all.
  const set = async (into) => {
    const now = watches().find((x) => x.tree === w.tree);
    if (!now) return;
    const at = Date.now();
    if (into) { now.into = into; now.intoAt = at; } else { delete now.into; delete now.intoAt; }
    saveWatch(now);
    let moved = 0;
    for (const p of state.pages) {
      if (p.watched !== w.tree) continue;
      const dir = into || ((p.file && p.file.path) || "").split("/").slice(-2, -1)[0];
      const to = dir ? folderName(dir) : null;
      if ((p.folder || null) === to) continue;
      if (to) Object.assign(p, { folder: to, folderAt: at }); else { delete p.folder; delete p.folderAt; }
      moved++;
    }
    if (moved) { await C.store.writeIndex(state.pages); renderLibrary(); updateWidgets(); }
    renderSection();
    const files = moved === 1 ? "1 file" : moved + " files";
    toast(into ? (moved ? "Moved " + files + " into " + into + ". New ones go there too." : "New files from " + w.name + " go into " + into)
      : (moved ? "Moved " + files + " back into collections named after their folders" : "New files from " + w.name + " go into collections named after their folders"));
  };
  return dropdown({ label: "New files from " + w.name + " go into", cls: "field-pick watch-pick", value: w.into || "", options,
    onpick: (v) => {
      if (v !== WATCH_NEW) { set(v); return; }
      const typed = prompt("Name the new collection");
      if (typed && cleanTag(typed)) set(folderName(typed));
      else renderSection();
    } });
}
const svgRefresh = () => { const s = el("span", { class: "row-x-icon", "aria-hidden": "true" }); s.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v5h-5"></path></svg>'; return s; };
const svgBin = () => { const s = el("span", { class: "row-x-icon", "aria-hidden": "true" }); s.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICONS.remove + "</svg>"; return s; };
const svgX = () => { const s = el("span", { class: "row-x-icon", "aria-hidden": "true" }); s.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>'; return s; };
async function pickWatched() {
  let got = null;
  try { got = await C.platform.files.pickFolder(); } catch (e) { got = null; }
  if (!got) return;
  const list = watches();
  const had = list.find((w) => w.tree === got.ref);
  if (had) {
    if (had.lost) { delete had.lost; saveWatch(had); }
    else toast("Already watching " + got.name + ".");
  } else store(WATCHES_KEY, [...list, { tree: got.ref, name: got.name }]);
  if (state.section === "library") renderSection();
  await lookInFolder(true, { tree: got.ref });
}
// A file removed from Waypage that's still in its watched folder isn't
// added back the next time Waypage looks.
function forgetWatched(list) {
  for (const w of watches()) {
    const refs = list.filter((p) => p.watched === w.tree && p.link).map((p) => p.link);
    if (!refs.length) continue;
    w.skip = [...new Set([...(w.skip || []), ...refs])];
    saveWatch(w);
  }
}
async function stopWatching(w) {
  for (const p of state.pages) if (p.watched === w.tree) delete p.watched;
  await C.store.writeIndex(state.pages);
  store(WATCHES_KEY, watches().filter((x) => x.tree !== w.tree));
  if (state.section === "library") renderSection();
  toast("Stopped watching " + w.name + ". Its files stay in your library.");
}

// Storage's Actions (1.47.0, was Backup): backing up, then making room.
function backupGroup(more = []) {
  const input = el("input", { type: "file", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
  const open = el("button", { class: "row", type: "button", onclick: () => (C.platform.files.canLink ? pickFile() : input.click()) },
    el("span", { class: "row-label accent" }, "Restore"));
  input.addEventListener("change", () => { const f = input.files[0]; input.value = ""; openFile(f, open); });
  const sec = section("Actions", "Back up the library makes one file with every clip, its pictures, tags, collections and where you were, and the feeds and newsletters you follow; files read from outside stay out. " + (C.platform.native ? "Keep it off the phone. " : "Keep it somewhere other than this browser. ") + "Restore brings a backup back, keeping whichever copy of a clip was saved last. Highlights save as one Markdown file with their notes and links. Keep only the text drops the saved pictures of clips you've finished; they show again when you're online. Make pictures smaller rewrites full pictures to a quarter of the size, still sharp on a phone.",
    el("div", { class: "group" },
      backupRow(),
      state.pages.some((p) => (p.marks || []).length) ? el("button", { class: "row", type: "button", onclick: (e) => saveHighlights(e.currentTarget) },
        el("span", { class: "row-label accent" }, "Save all highlights")) : null,
      siteFeeds().length ? el("button", { class: "row", type: "button", onclick: (e) => saveOpml(e.currentTarget) },
        el("span", { class: "row-label accent" }, "Save the feeds you follow (OPML)")) : null,
      open, ...more, input));
  sec.id = "backupSection";
  return sec;
}
// Import, in Library since 1.47.0 (Saving from 1.12.0, Backup before): the
// same picker. The row sits under Library's Actions with Edit clips.
function importRow() {
  const input = el("input", { type: "file", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
  const open = el("button", { class: "row", type: "button", onclick: () => (C.platform.files.canLink ? pickFile() : input.click()) },
        el("span", { class: "choice-text" },
          el("span", { class: "choice-label accent" }, "Import from another app"),
          el("span", { class: "choice-note" }, "Pocket, Instapaper, Omnivore, Wallabag, Raindrop, OPML")));
  input.addEventListener("change", () => { const f = input.files[0]; input.value = ""; openFile(f, open); });
  return [open, input];
}
