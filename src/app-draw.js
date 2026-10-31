// Waypage's shell (1.45.11 split): drawing the library. Section heads,
// a part opened alone and the flip between, Continue reading, the three
// layouts and renderLibrary itself, drawn on scroll. See app.js for how
// the parts share.
const sectionHead = (label, extra) => el("div", { class: "section-head wide" }, el("h2", { class: "overline" }, label), extra || null);
// A section's head that opens it alone (0.30.2): every collection in a
// grid, or just the pages in none.
const partHead = (part, label) => el("div", { class: "section-head wide" },
  el("h2", { class: "overline" }, el("button", { class: "section-link", type: "button", onclick: () => openPart(part) },
    label, el("span", { class: "section-chev", "aria-hidden": "true" }, "›"))));
function openPart(part, fromHistory) {
  if (!fromHistory) history.pushState({ view: "part", part }, "");
  changePart(part);
}
// Collections or Clips opening alone, and back (1.11.0): the section
// grows into the whole view. What stays (the collections, the clips)
// slides from where it was to where it lands; what goes leaves past the
// top or bottom edge, whichever side of the section it was on, and
// what's new comes in from that side.
let flipping = false;
function changePart(part) {
  const before = libSnap();
  flipping = true;
  try { state.part = part; renderLibrary(); if (part) scrollTo(0, 0); } finally { flipping = false; }
  libFlip(before);
}
// The cards, tiles and section heads on screen now, by what they show.
function libSnap() {
  const m = new Map();
  if (covered($("libraryView")) || $("libraryView").hidden || $("library").hidden) return m;
  const all = $("library").querySelectorAll(".card, .tile, .section-head");
  for (let i = 0; i < all.length && m.size < 120; i++) {
    const n = all[i], id = n.dataset.name ? "f:" + n.dataset.name : n.dataset.ids ? "p:" + n.dataset.ids : "h:" + n.textContent;
    if (m.has(id)) continue;
    const r = n.getBoundingClientRect();
    // Past the screen's bottom, so is everything after it (1.28.4):
    // measuring hundreds of cards below took half a second.
    if (r.width && r.top > innerHeight && !n.closest(".folder-strip")) break;
    if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
    m.set(id, { n, r });
  }
  return m;
}
// small: a card or two arrived or left, which grow in and shrink away
// where they are; otherwise they come and go past the screen's edges.
function libFlip(before, small) {
  if (!before.size || M.reduced()) return;
  const after = libSnap(), moved = new Map(), enter = [];
  let y = null;
  for (const [id, a] of after) {
    const b = before.get(id);
    if (b) { moved.set(a.n, b.r); if (y == null) y = a.r.top; }
  }
  if (y == null) y = innerHeight / 2;
  for (const [id, a] of after) {
    if (before.has(id)) continue;
    if (small) M.appear(a.n);
    else enter.push([a.n, [{ transform: M.fromPast(a.r, a.r.top < y ? "top" : "bottom") }, { transform: "none" }]]);
  }
  M.flip(moved, enter);
  for (const [id, b] of before) {
    if (after.has(id)) continue;
    if (small) { const g = ghost(b.n, b.r); M.vanish(g).finally(() => g.remove()); }
    else M.ghostOut(b.n, b.r, b.r.top < y ? "top" : "bottom");
  }
}
function ghost(n, r) {
  const g = n.cloneNode(true);
  g.removeAttribute("id");
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", margin: "0", pointerEvents: "none", zIndex: "1", boxSizing: "border-box" });
  document.body.appendChild(g);
  return g;
}

// The page to carry on with: the one read last that isn't finished.
function continuePage() {
  // The clip read last, in a collection (1.10.1): the next one in it to
  // read, rather than whatever other clip was read before it. Otherwise the clip read last that isn't finished.
  // Not only once it's finished (1.26.4): the next chapter, opened from
  // here and left near its top, counted as nothing read, and Continue
  // reading went to some clip elsewhere.
  const last = state.pages.reduce((a, p) => ((p.readAt || 0) > ((a && a.readAt) || 0) ? p : a), null);
  if (last && last.folder) {
    const list = folderPages(last.folder);
    const i = folderNextIndex(list);
    if (i >= 0) return list[i];
  }
  const going = state.pages.filter((p) => !p.finished && p.at > 0.02);
  return going.sort((a, b) => (b.readAt || 0) - (a.readAt || 0))[0] || null;
}

// Folders, the one read last first, then the newest made. Pages landing
// in one don't move it (1.1.0).
function foldersByUse() {
  const last = (name) => { const list = folderPages(name);
    return Math.max(...list.map((p) => p.readAt || 0), Math.min(...list.map((p) => p.savedAt || 0))); };
  return allFolders().map((n) => [n, last(n)]).sort((a, b) => b[1] - a[1]).map(([n]) => n);
}

// A collection as one item among pages, for the library's order: when
// it was made (its first page), the page read last, its length and its
// site. Made, not its newest page: pages downloading into collections
// reshuffled them with every one that landed (1.1.0).
function asItem(name) {
  const list = folderPages(name);
  return { folder: name, title: name, site: siteOf(list[0]),
    savedAt: Math.min(...list.map((p) => p.savedAt || 0)),
    readAt: Math.max(...list.map((p) => p.readAt || 0)),
    minutes: list.reduce((n, p) => n + (p.minutes || 0), 0) };
}

// One list's groups: by day under Newest saved and Last read, by site
// under Site, none under Longest.
function groupOf(x) {
  if (state.sort === "site") return siteOf(x);
  if (state.sort === "length") return "";
  const t = state.sort === "read" ? x.readAt : x.savedAt;
  if (!t) return "Not started";
  const day = 864e5, start = new Date().setHours(0, 0, 0, 0);
  return t >= start ? "Today" : t >= start - day ? "Yesterday" : t >= start - 6 * day ? "This week"
    : t >= start - 29 * day ? "This month" : "Earlier";
}

const layout = () => { const v = load(LAYOUT_KEY, "shelf"); return LAYOUTS.some((l) => l.value === v) ? v : "shelf"; };

const pageSig = (p) => [p.title, readingLine(p), p.missing, p.thumb, Math.round((p.at || 0) * 50), navigator.onLine, (p.tags || []).join(","), p.folder, p.mode, !!p.fav].join("|");

// The pages the library is showing, for Select all.
let onScreen = [];

// Cards are keyed and kept between renders; only ones that weren't there
// before arrive on a spring, so a re-render never replays the list.
// Show and Order sit over everything. Shelf and Grid are in sections:
// Continue reading (unless it's turned off, or something is filtered),
// Collections, then the pages in no collection. One list puts the
// collections among those pages, in groups. A tag filter lists every
// page it matches, collections' pages too; a search lists only what it
// found.
let firstRender = true;
let loaded = false;
const FIRST_SCREEN = 30;
// After the first screen the rest come this many at a time, drawn as
// the end of the list nears the screen (1.28.3). Drawn in tasks right
// after the first screen (1.7.1), three thousand clips kept a phone busy
// for seconds after it opened, and a tap in that time hung.
const NEXT_SCREENS = 60;
// What's drawn so far stays through a redraw of the same list (a clip
// landing, coming back from the reader); another list (a search, a
// filter, a sort, a part) starts again at the first screen (1.28.4),
// as a search with hundreds of cards drawn redrew them all each letter.
let drawUpTo = FIRST_SCREEN, growing = false, moreSeen = null, drawnList = "";
function watchMore(node) {
  if (!moreSeen) moreSeen = new IntersectionObserver((hits) => {
    if (!hits.some((h) => h.isIntersecting) || !loaded) return;
    drawUpTo += NEXT_SCREENS;
    growing = true;
    try { renderLibrary(); } finally { growing = false; }
  }, { rootMargin: "1500px 0px" });
  // Watched afresh each draw: the mark stays in view when the cards
  // added don't reach past the margin, and only a change is reported.
  moreSeen.unobserve(node);
  moreSeen.observe(node);
}
// Android's version, from the Files plugin (0.33.0): what the storage
// places and the empty library's way back (1.1.0) offer.
let androidSdk = 0;
function renderLibrary() {
  const before = flipping || firstRender || growing ? null : libSnap();
  const root = $("library");
  const old = new Map([...root.querySelectorAll(":scope > [data-key]")].map((n) => [n.dataset.key, n]));
  const n = state.pages.length;
  // A tag filter whose last page lost the tag (or was deleted) falls back to All.
  if (n && state.filter.startsWith("#")
    && !allTags().some((t) => sameTag(t, state.filter.slice(1)))) { state.filter = "all"; store(FILTER_KEY, "all"); }
  renderTools();
  // Until the library is read nothing is said (1.2.0): the empty state
  // showed for the second it took, as if there were no clips.
  $("libraryMeta").textContent = n ? pagesLine(n) : loaded ? "Nothing saved yet" : "";
  $("searchBtn").hidden = !n;
  paintSearch();
  const how = layout();
  $("libraryView").dataset.layout = how;
  const listKey = [state.query, state.filter, state.sort, state.part, state.place, how].join("\x1f");
  if (listKey !== drawnList) { drawnList = listKey; drawUpTo = FIRST_SCREEN; }
  const nodes = [];
  const fresh = [];
  // A kept card whose content changed (reading progress, a renamed page)
  // is rebuilt in place, without arriving again.
  const keep = (key, make, sig) => {
    let node = old.get(key);
    if (!node) { node = make(); node.dataset.key = key; fresh.push(node); }
    else if (sig != null && node.dataset.sig !== sig) { node = make(); node.dataset.key = key; }
    if (sig != null) node.dataset.sig = sig;
    nodes.push(node);
  };
  const ts = terms();
  const found = new Map();
  const pages = sorted(state.pages.filter(shown).filter((p) => {
    if (!ts.length) return true;
    if (metaMatch(p, ts)) return found.set(p.id, null), true;
    const s = snippet(p, ts);
    if (s) return found.set(p.id, s), true;
    return false;
  }));
  onScreen = pages;
  // Unread and Finished keep collections whole: a collection shows when
  // it has an unread page, or when all of it is read.
  const status = state.filter === "unread" || state.filter === "finished";
  // Favourites shows the favourite collections, then every favourite
  // clip, in a collection or not (0.30.9).
  const favs = state.filter === "favourites";
  const flat = ts.length || (state.filter !== "all" && !status && !favs);
  const folders = flat ? [] : allFolders().filter((f) => favs ? folderFav(f) : !status
    || (state.filter === "unread" ? folderPages(f).some(unread) : folderPages(f).every((x) => x.finished)));
  const folderSig = (f) => [f, freshCount(f), folderFav(f), ...folderPages(f).map((x) => x.id + readingLine(x) + (x.thumb || "") + (x.cover || ""))].join("|");
  if (!ts.length && state.filter === "all" && !state.part) {
    const going = !state.select && load(CONTINUE_KEY, true) && continuePage();
    if (going) {
      keep("h:continue", () => sectionHead("Continue reading"));
      keep("c:" + going.id, () => pageCard(going, null, true), pageSig(going));
    }
  }
  const loose = flat || favs ? pages : pages.filter((p) => !p.folder);
  // A big library shows a screen's worth of cards and draws the rest as
  // they're scrolled to (1.2.1, 1.28.3): every card at once held the
  // first paint back on a phone.
  const first = loaded ? drawUpTo : Infinity;
  let more = false;
  const some = (list) => { if (list.length <= first) return list; more = true; return list.slice(0, first); };
  if (how === "list" && !flat) {
    const items = some(sorted([...folders.map(asItem), ...loose]));
    let group = null;
    for (const x of items) {
      const g = groupOf(x);
      if (g && g !== group) keep("h:g:" + g, () => sectionHead(g));
      group = g;
      if (x.id) keep("p:" + x.id, () => pageCard(x), pageSig(x));
      else keep("t:" + x.folder, () => { const t = folderTile(x.folder); t.removeAttribute("role"); return t; }, folderSig(x.folder));
    }
  } else {
    const part = !flat && state.part;
    const back = () => keep("h:part:" + part, () => el("div", { class: "section-head wide part-head" },
      el("button", { class: "btn-quiet part-back", type: "button", onclick: () => history.back() },
        el("span", { "aria-hidden": "true" }, "‹ "), "Library")));
    if (part) back();
    // Files of your own (0.31.0) are a part of their own after Clips,
    // unless a search or filter lists everything together.
    // Files are the clips that read from a file of your own; a copy is
    // a clip like any other (0.32.0).
    const apart = !ts.length && state.filter === "all";
    const mine = apart ? loose.filter((p) => p.link) : [];
    const clips = apart ? loose.filter((p) => !p.link) : loose;
    if (folders.length && (!part || part === "collections")) {
      const names = sorted(folders.map(asItem)).map((x) => x.folder);
      const label = "Collections · " + names.length;
      if (part) keep("h:folders:all", () => sectionHead(label), label);
      else keep("h:folders", () => partHead("collections", "Collections"));
      // The strip stays and only its changed tiles are drawn again (1.1.1):
      // drawn whole, it lost where it was scrolled to with every page
      // that landed in a collection.
      keep(part ? "folders:all" : "folders", () => { const strip = foldersStrip([]); if (part) strip.classList.add("folder-grid"); return strip; });
      fillStrip(nodes[nodes.length - 1], names, folderSig);
    }
    if (clips.length && (!part || part === "pages")) {
      const label = (ts.length ? "Found" : state.filter === "all" ? "Clips"
        : (status || favs) && folders.length ? filterName() + " clips" : filterName()) + " · " + clips.length;
      if (part || ts.length || (!folders.length && !mine.length)) keep("h:pages", () => sectionHead(label), label);
      else keep("h:pages", () => partHead("pages", label), "link" + label);
    }
    if (!part || part === "pages") for (const p of some(clips)) {
      if (ts.length) {
        const s = found.get(p.id);
        keep("q:" + p.id, () => pageCard(p, s), [pageSig(p), s].join("|"));
      } else keep("p:" + p.id, () => pageCard(p), pageSig(p));
    }
    if (mine.length && (!part || part === "files")) {
      const label = "Files · " + mine.length;
      if (part || (!folders.length && !clips.length)) keep("h:files", () => sectionHead(label), label);
      else keep("h:files", () => partHead("files", label), "link" + label);
      for (const p of some(mine)) keep("p:" + p.id, () => pageCard(p), pageSig(p));
    }
  }
  if (more) keep("more", () => el("div", { class: "lib-more", "aria-hidden": "true" }));
  if (n && !pages.length && ts.length) {
    keep("none:q", () => el("div", { class: "empty wide" },
      el("p", { class: "empty-text", "data-q": "" }),
      el("button", { class: "btn-quiet", type: "button", onclick: clearSearch }, "Clear search")));
    nodes[nodes.length - 1].querySelector("[data-q]").textContent = searching ? "Searching…"
      : "Nothing matches “" + state.query.trim() + "”" + (state.filter === "all" ? "." : " in " + filterName() + ".");
  } else if (n && !loose.length && !folders.length) {
    keep("none:" + state.filter, () => el("div", { class: "empty wide" },
      el("p", { class: "empty-text" }, state.filter === "unread" ? "You've started everything you saved."
        : state.filter === "finished" ? "Nothing finished yet."
        : state.filter === "favourites" ? "No favourites yet. Hold a clip, or open a collection's ⋯, and tap Favourite." : "No clips tagged " + state.filter + "."),
      el("button", { class: "btn-quiet", type: "button", onclick: () => setFilter("all") }, "Show all")));
  }
  // Until it's read, the library says it's on its way (1.7.1); the first
  // one is in index.html, there before any script runs.
  if (!loaded) keep("loading", () => el("div", { class: "lib-loading wide", role: "status" }, el("span", { class: "spinner", "aria-hidden": "true" }), "Opening your library"));
  if (!n && loaded) {
    keep("empty", () => el("div", { class: "empty wide" },
      el("h2", { class: "empty-title" }, "Clips you take with you"),
      el("p", { class: "empty-text" }, C.platform.native
        ? "Share a page to Waypage from your browser, or paste its link below. It stays readable with no connection, with a link back to the original."
        : "Paste a Wikipedia link below, or bring the clips you saved on your phone: back up there, then open the backup here."),
      el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => pickFile() }, "Open a file"),
      // After a reinstall Android hides what the last install kept in
      // Documents/Waypage until it's picked again (1.1.0).
      C.platform.android && C.platform.files.canPickFolder && C.store.place.kind === "app" && androidSdk >= 30
        ? el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => changePlace("folder", "Documents/Waypage") }, "Get back your library from Documents") : null,
      C.platform.native ? null : el("button", { class: "btn-quiet empty-open", type: "button", onclick: () => openSettings(false, "storage") }, "Open a backup")),
    [androidSdk, C.store.place.kind].join("|"));
  }
  // Nodes that stay are left where they are and only what changed moves
  // (1.1.1): taking them all out and back reset every strip's scroll.
  const wanted = new Set(nodes);
  for (const c of [...root.children]) if (!wanted.has(c)) c.remove();
  nodes.forEach((node, i) => { if (root.children[i] !== node) root.insertBefore(node, root.children[i] || null); });
  // A card or two arriving grows in and the cards around it slide to
  // make room (1.11.0); a whole new list (a filter, a search) is just
  // drawn, as two hundred animations at once dropped it to a few frames
  // a second.
  if (before && fresh.length <= 6 && old.size - (nodes.length - fresh.length) <= 6) libFlip(before, true);
  if (more) watchMore(nodes.find((x) => x.dataset.key === "more"));
  if (loaded && firstRender) { firstRender = false; warmPdf(); }
  paintPicks();
  renderDownloads();
  if (state.place === "feeds") renderFeeds();
  if (state.place === "newsletters") renderNewsletters();
  if (state.place === "highlights") renderHighlights();
  if (state.place === "reading") renderReading();
  if (sideShown()) renderSide();
}
