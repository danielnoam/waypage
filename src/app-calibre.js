// Waypage: the Calibre extension's place (2026-11). Your Calibre library
// folder (src/calibre.js) in the sidebar: its books as covers, found by
// title, author, series or tag. A book reads from the folder where it is,
// or is copied into the Library; either way it becomes a File, its series
// a collection in order and its Calibre tags Waypage's tags. Shell file,
// loaded only once the extension is on.

const cb = { books: null, busy: false, error: "", sort: load("waypage.calibre.sort", "added"), tag: "", shown: 60, state: "" };
let cbHead = null;

function calibreWhy(e) {
  const m = (e && e.message) || "";
  if (m === "no db" || m === "not calibre") return t("There's no Calibre library in that folder. Pick the folder that has metadata.db in it.");
  if (m === "gone") return t("That book's file isn't in the folder any more. Read the library again.");
  if (m === "no format") return t("This book has no file Waypage opens.");
  return t("Couldn't read the folder. Pick it again in Settings › Extensions › Calibre.");
}

async function calibreRead(force) {
  if (cb.busy) return;
  cb.busy = true;
  cb.error = "";
  calibreDraw();
  try { cb.books = await C.calibre.books(force); } catch (e) { cb.books = null; cb.error = calibreWhy(e); }
  cb.busy = false;
  calibreDraw();
}

// Whether a book is in the Library already: by Calibre's id for it.
const calibreHas = (b) => state.pages.find((p) => p.calibre === b.uuid) || null;

async function calibreAdd(b, copy) {
  const had = calibreHas(b);
  if (had) { openPage(had.id); return; }
  toast(copy ? t("Copying “{title}”…", { title: b.title }) : t("Opening “{title}”…", { title: b.title }));
  try {
    const got = await C.calibre.file(b);
    const kind = await C.files.kindOf(got.file);
    if (!C.files.KINDS[kind]) throw new C.calibre.CalibreError("no format");
    // Kinds read from where they are (EPUB, CBZ, PDF); the rest are copied.
    const link = copy || !C.files.canLink(kind) ? null : got.ref;
    const meta = await C.files.bring(got.file, kind, { link, has: (n, size) => hasFile(n, size, link) });
    if (meta.already) {
      const p = fileLike(got.file.name, got.file.size, link);
      if (p) { p.calibre = b.uuid; await C.store.writeIndex(state.pages); openPage(p.id); }
      return;
    }
    meta.calibre = b.uuid;
    if (b.title) meta.title = b.title;
    if (b.by) meta.byline = b.by;
    if (b.series) { meta.series = b.series; meta.volume = b.index; }
    if (b.tags.length) meta.tags = withTags(meta.tags, b.tags.map(cleanTag).filter(Boolean));
    fileSeries(meta);
    outsideKnown(meta);
    state.pages.unshift(meta);
    await C.store.writeIndex(state.pages);
    await loadThumbs();
    C.store.keepStored();
    calibreDraw();
    openPage(meta.id);
  } catch (e) {
    if (!(e instanceof C.calibre.CalibreError) && !(e instanceof C.files.FileError)) console.error(e);
    toast(e instanceof C.calibre.CalibreError ? calibreWhy(e) : t("Couldn't open that book. Try again."));
  }
}

function calibreSearchHead() {
  const input = el("input", { type: "search", "aria-label": t("Search your Calibre library"), placeholder: t("Search your Calibre library"), autocomplete: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  input.addEventListener("input", () => { cb.shown = 60; calibreDraw(); });
  const box = el("div", { class: "search dz-search", role: "search" }, input);
  box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
  return el("div", { class: "dz-head" }, box);
}

const CB_SORTS = [["added", t("Recently added")], ["title", t("Title")], ["author", t("Author")], ["series", t("Series")]];
function calibreList() {
  const q = cbHead ? cbHead.querySelector("input").value.trim().toLowerCase() : "";
  let list = (cb.books || []).filter((b) => (!cb.tag || b.tags.includes(cb.tag))
    && (!q || [b.title, b.by, b.series, ...b.tags].some((x) => String(x).toLowerCase().includes(q))));
  const by = { added: (a, b) => b.added - a.added, title: (a, b) => a.sort.localeCompare(b.sort), author: (a, b) => a.authorSort.localeCompare(b.authorSort) || a.sort.localeCompare(b.sort),
    series: (a, b) => (!a.series - !b.series) || a.series.localeCompare(b.series) || a.index - b.index }[cb.sort] || (() => 0);
  return list.slice().sort(by);
}

// Covers come from the folder as they scroll into view.
const cbSeen = "IntersectionObserver" in window ? new IntersectionObserver((xs) => {
  for (const x of xs) {
    if (!x.isIntersecting) continue;
    cbSeen.unobserve(x.target);
    const b = x.target._book, art = x.target;
    C.calibre.cover(b).then((url) => {
      if (!url) return;
      const img = el("img", { src: url, alt: "" });
      img.addEventListener("load", () => art.classList.add("has-img"));
      art.prepend(img);
    });
  }
}, { rootMargin: "400px" }) : null;

function calibreBook(b) {
  const had = calibreHas(b);
  const art = el("span", { class: "dz-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, b.title));
  art._book = b;
  if (b.cover && cbSeen) cbSeen.observe(art);
  const meta = [b.by, b.series ? b.series + (b.index ? " " + b.index : "") : ""].filter(Boolean).join(" · ");
  return el("button", { class: "dz-book", type: "button", role: "listitem", "data-key": "cb:" + b.uuid,
    "aria-label": had ? t("{title}, in your library", { title: b.title }) : b.title, onclick: () => openMenu("calibreBook", b) },
    el("span", { class: "dz-art" }, art, had ? el("span", { class: "dz-mark on" }, dzIcon("check", 16)) : null),
    el("span", { class: "dz-bt", dir: "auto" }, b.title),
    meta ? el("span", { class: "dz-bm", dir: "auto" }, meta) : null);
}

function calibreDraw() {
  if (state.place !== "calibre") return;
  const root = $("calibre");
  const f = C.calibre.folder();
  if (!f || cb.state === "none") {
    fill(root, el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("Pick your Calibre library")),
      el("p", { class: "empty-text" }, C.calibre.canPick ? t("The folder with metadata.db in it, synced to this device or on it. Its books stay where they are.")
        : t("This browser can't open a folder. Use Chrome or Edge, or Waypage on your phone.")),
      C.calibre.canPick ? el("button", { class: "btn-primary", type: "button", onclick: calibrePick }, t("Pick the folder")) : null));
    return;
  }
  if (cb.state === "ask") {
    fill(root, el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, f.name),
      el("p", { class: "empty-text" }, t("This browser asks before reading the folder again.")),
      el("button", { class: "btn-primary", type: "button", onclick: async () => { if (await C.calibre.allow()) { cb.state = "ok"; calibreRead(); } } }, t("Open {name}", { name: f.name }))));
    return;
  }
  if (!cbHead) cbHead = calibreSearchHead();
  const all = calibreList();
  const tags = [...new Set((cb.books || []).flatMap((b) => b.tags))].sort((a, b) => a.localeCompare(b));
  const sort = dropdown({ label: t("Sort"), cls: "field-pick dz-pick", value: cb.sort, options: CB_SORTS.map(([v, l]) => ({ value: v, label: l })),
    onpick: (v) => { cb.sort = v; store("waypage.calibre.sort", v); cb.shown = 60; calibreDraw(); } });
  const tag = tags.length ? dropdown({ label: t("Tag"), cls: "field-pick dz-pick", value: cb.tag, options: [{ value: "", label: t("Every tag") }, ...tags.map((x) => ({ value: x, label: x }))],
    onpick: (v) => { cb.tag = v; cb.shown = 60; calibreDraw(); } }) : null;
  const line = cb.busy ? t("Reading {name}…", { name: f.name }) : cb.error;
  const body = [
    el("div", { class: "dz-tools" }, sort, tag),
    all.length ? el("div", { class: "dz-covers dz-grid", role: "list" }, ...all.slice(0, cb.shown).map(calibreBook)) : null,
    all.length > cb.shown ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => { cb.shown += 120; calibreDraw(); } }, t("More books")) : null,
    line ? el("p", { class: "footnote dz-src" + (cb.error && !cb.busy ? " warn" : "") }, line) : null,
    cb.books && !all.length ? el("p", { class: "empty-text dz-none" }, t("Nothing here matches that.")) : null,
    cb.books ? el("p", { class: "footnote dz-foot" }, tn(cb.books.length, "1 book in {name}", "{n} books in {name}", { name: f.name }), " ",
      el("button", { class: "btn-text", type: "button", onclick: () => calibreRead(true) }, t("Read it again"))) : null,
  ];
  if (cbHead.parentNode !== root) root.replaceChildren(cbHead, el("div", { class: "dz-body" }));
  fill(root.querySelector(".dz-body"), ...body.filter(Boolean));
}

async function calibreOpen() {
  cb.state = await C.calibre.ready();
  calibreDraw();
  if (cb.state === "ok" && !cb.books && !cb.busy) calibreRead();
}
async function calibrePick() {
  const got = await C.calibre.pick();
  if (!got) return;
  cb.books = null;
  cb.state = "ok";
  if (state.section === "calibre") renderSection();
  if (state.place !== "calibre") await goPlace("calibre");
  calibreRead(true);
}

// A book's sheet: what Calibre knows, then Read it (from the folder) or
// Copy into the Library.
function calibreSheet() {
  const b = state.menu.page;
  const had = calibreHas(b);
  const art = el("span", { class: "dz-cover dz-sheet-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, b.title));
  C.calibre.cover(b).then((url) => { if (url) { art.prepend(el("img", { src: url, alt: "" })); art.classList.add("has-img"); } });
  const f = b.formats[0];
  const series = b.series ? (b.index ? t("{series}, book {n}", { series: b.series, n: String(b.index).replace(/\.0+$/, "") }) : b.series) : "";
  const read = el("button", { class: "btn-primary", type: "button", ...(f ? {} : { disabled: "" }), onclick: async () => { await back(); calibreAdd(b, false); } },
    had ? t("Open it") : t("Read it"));
  const copy = had || !f ? null : el("button", { class: "btn-quiet", type: "button", onclick: async () => { await back(); calibreAdd(b, true); } }, t("Copy into your Library"));
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, art,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, b.title),
        b.by ? el("p", { class: "meta", dir: "auto" }, b.by) : null,
        series ? el("p", { class: "meta", dir: "auto" }, series) : null,
        el("p", { class: "meta" }, [b.formats.map((x) => x.format).join(", "), b.tags.slice(0, 4).join(", ")].filter(Boolean).join(" · ")))),
    b.about ? el("p", { class: "dz-blurb", dir: "auto" }, b.about.slice(0, 600)) : null,
    read, copy,
    el("p", { class: "footnote" }, !f ? t("This book has no file Waypage opens.") : had ? t("It's in your library already.")
      : t("Read it opens the {format} from your Calibre folder, nothing copied. Copy brings it into your Library, to sync and back up.", { format: f.format })));
}
MENUS.calibreBook = { label: t("Book"), build: () => calibreSheet() };

// The extension's page in Settings: the folder, to pick again or let go.
EXT_PAGES.calibre = () => {
  const f = C.calibre.folder();
  return [section(t("Library folder"), null, el("div", { class: "group" },
    f ? navRow(f.name, t("Pick another folder"), calibrePick) : navRow(t("Pick the folder"), t("The one with metadata.db in it"), calibrePick),
    f ? el("button", { class: "row", type: "button", onclick: () => { C.calibre.forget(); cb.books = null; cb.state = "none"; renderSection(); calibreDraw(); } },
      el("span", { class: "row-label accent" }, t("Forget this folder"))) : null))];
};

if (state.place === "calibre") calibreOpen();
