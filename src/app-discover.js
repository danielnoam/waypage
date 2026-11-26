// Waypage: Discover, a place to browse new things to follow (src/discover.js
// holds the sources). It adds nothing of its own: a feed (a site, or a
// newsletter that has one) goes to the Add a feed sheet, a Royal Road story
// is saved as a collection (its chapter list, which then follows new
// chapters), and a newsletter (email only, Daniel: "Newsletters" means the
// app's own) gets an address from Newsletters and its sign-up page. See app.js for the order these files load in.

// The chip picked: all, stories (shown as Sites: Royal Road), feeds or
// newsletters (Daniel: no topic chips).
let dzPick = "all";
let dzList = load("waypage.discover.rrList", "rising");
// View options (the top bar's sliders, Discover only): Wikipedia today on or off.
let dzWikiOn = load("waypage.discover.showWiki", true) !== false;
// Royal Road as last read: { at, items } per list, or an error line.
const dz = { busy: false, error: "", found: null };
// Only the phone reads the story sites: most sit behind Cloudflare's or
// their own bot checks, which turn the web copy's fetch proxy away (Royal
// Road refuses it outright), and the phone passes them in its hidden browser.
const dzCanRead = () => C.platform.canFetchPages;
// The sites this copy can browse: all of them in the app; in a browser,
// the books and texts, whose sites answer the fetch proxy.
const dzSources = () => C.discover.sources.filter((x) => C.platform.canFetchPages || (x.web && C.platform.canReadPages));
const DZ_KINDS = [["all", t("All")], ["stories", t("Sites")], ["feeds", t("Feeds")], ["newsletters", t("Newsletters")]];
const dzHost = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };

// Followed already: a feed from the same site (its page or its feed).
function dzFollowing(e) {
  const hosts = [dzHost(e.url), dzHost(e.feedUrl)].filter(Boolean);
  return feeds.some((f) => hosts.includes(dzHost(f.link)) || hosts.includes(dzHost(f.url)));
}
// A story saved already: a collection read from its page.
function dzSavedStory(s) {
  if (s.zim) return !!packHere(s);
  if (s.book) return state.pages.some((p) => p.file && p.file.name === dzBookName(s)) || (!s.catalog && folderPages(folderName(s.title)).length > 0);
  if (s.audiobook) return state.pages.some((p) => p.audio && p.audio.from === s.id);
  return allFolders().some((n) => { const src = folderSource(folderPages(n)); return src && (s.serial ? sameUrl(src, s.url) : C.discover.storyId(src) === s.id); });
}

// The search field at the top searches what's shown: the picked lists as
// you type, and a story site's own search on Enter (Daniel: "it searches
// what's in your view"). It stays put, so typing keeps its focus.
let dzHead = null;
const dzQ = () => (dzHead ? dzHead.querySelector("input").value.trim() : "");
const dzMatch = (e, q) => !q || [e.name, e.about || "", dzHost(e.url)].some((t) => t.toLowerCase().includes(q.toLowerCase()));
function dzSearchHead() {
  const input = el("input", { type: "search", "aria-label": t("Search Discover"), autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  input.addEventListener("input", () => { if (!input.value.trim()) dz.found = null; renderDiscover(); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const src = dzSearchSrc();
    if (src && dzQ()) { input.blur(); dzSearch(dzQ(), src); }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || dzQ()) return;
    e.preventDefault();
    e.stopPropagation();
    input.blur();
  });
  const box = el("div", { class: "search dz-search", role: "search" }, input);
  box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
  return el("div", { class: "dz-head" }, box, el("div", { class: "chips filters feed-chips", role: "group", "aria-label": t("Show") }));
}
function openDzSearch() {
  window.scrollTo({ top: 0, behavior: M.reduced() ? "auto" : "smooth" });
  if (dzHead) dzHead.querySelector("input").focus({ preventScroll: true });
}

// The story site Enter searches: the grid's in Sites, Royal Road in All.
function dzSearchSrc() {
  if (dzPick === "stories") return dzSrc();
  return dzPick === "all" && dzCanRead() ? C.discover.sources.find((x) => x.key === "rr") : null;
}

function renderDiscover() {
  const root = $("discover");
  const { entries } = C.discover.list();
  if (!dzHead) dzHead = dzSearchHead();
  const input = dzHead.querySelector("input");
  const src = dzPick === "stories" ? dzSrc() : null;
  input.placeholder = dzPick === "feeds" ? t("Search feeds") : dzPick === "newsletters" ? t("Search newsletters")
    : dzPick === "stories" ? (src ? t("Search {label}", { label: src.label }) : t("Search web serials")) : t("Search Discover");
  const chip = (key, label) => el("button", { class: "chip" + (dzPick === key ? " on" : ""), type: "button", "aria-pressed": String(dzPick === key),
    "data-key": "chip:" + key, onclick: () => { dzPick = key; dz.found = null; renderDiscover(); } }, el("span", { class: "chip-label" }, label));
  const chips = dzHead.querySelector(".feed-chips");
  const scrollX = chips.scrollLeft;
  fill(chips, ...DZ_KINDS.map(([k, l]) => chip(k, l)));
  const q = dzQ();
  const nodes = [];
  const show = (k) => dzPick === "all" || dzPick === k;
  // Sites is the story sites to browse: a grid with every list and genre,
  // page after page; All shows a row of Royal Road.
  if (dzPick === "all" && !q && dzWikiOn) nodes.push(...dzWiki());
  if (dzPick === "stories") nodes.push(...dzGrid());
  else if (show("stories")) nodes.push(...dzStories());
  const pick = (kind) => entries.filter((e) => e.kind === kind && dzMatch(e, q));
  if (show("feeds") && pick("feed").length) {
    nodes.push(sectionHead(t("Feeds")), el("div", { class: "group feed-group" }, ...pick("feed").map(dzRow)));
  }
  if (show("newsletters") && pick("newsletter").length) {
    nodes.push(sectionHead(t("Newsletters")), el("div", { class: "group feed-group" }, ...pick("newsletter").map(dzRow)));
  }
  if (q && dzPick !== "stories" && !nodes.some(Boolean)) nodes.push(el("p", { class: "empty-text dz-none" }, t("Nothing here matches that.")));
  if (dzPick !== "stories" || !dzSrc()) nodes.push(el("p", { class: "footnote dz-foot" }, t("Picked by hand. "),
    el("button", { class: "btn-text dz-suggest", type: "button", onclick: () => C.platform.openOutside("https://github.com/danielnoam/waypage/issues/new?title=" + encodeURIComponent("Discover: ")) }, t("Suggest one on GitHub"))));
  if (dzHead.parentNode !== root) root.replaceChildren(dzHead, el("div", { class: "dz-body" }));
  fill(root.querySelector(".dz-body"), ...nodes.filter(Boolean));
  chips.scrollLeft = scrollX;
}

// Under a typed search, a button that asks the story site itself.
function dzAsk(src) {
  const q = dzQ();
  return q && !dz.found ? el("button", { class: "btn-quiet dz-ask", type: "button", onclick: () => dzSearch(q, src) },
    t("Search {label} for “{q}”", { label: src.label, q: q })) : null;
}

function dzRow(e) {
  const on = dzFollowing(e);
  const add = () => dzAdd(e);
  return el("div", { class: "post dz-row", "data-key": "dz:" + e.url },
    el("button", { class: "post-open", type: "button", "aria-label": e.name + (on ? ", following" : ""), onclick: on ? () => dzOpenFollowed(e) : add }),
    feedMark({ url: e.url, link: e.url, title: e.name }),
    el("span", { class: "post-body" },
      el("span", { class: "post-title", dir: "auto" }, e.name),
      e.about ? el("span", { class: "dz-about", dir: "auto" }, e.about) : null,
      el("span", { class: "post-meta" }, dzHost(e.url))),
    on ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), t("Following"))
      : el("button", { class: "post-act post-save", type: "button", "aria-label": e.kind === "newsletter" ? t("Sign up to {name}", { name: e.name }) : t("Follow {name}", { name: e.name }), onclick: add }, dzIcon("plus")));
}

function dzOpenFollowed(e) {
  const hosts = [dzHost(e.url), dzHost(e.feedUrl)];
  const f = feeds.find((x) => hosts.includes(dzHost(x.link)) || hosts.includes(dzHost(x.url)));
  if (f) goPlace(isMail(f) ? "newsletters" : "feeds", f.url);
}

function dzAdd(e) {
  if (e.kind === "newsletter") { openMenu("signup", e); return; }
  openMenu("addFeed", { url: e.feedUrl || e.url });
}

const DZ_ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
function dzIcon(name, size) {
  const box = el("span", { class: "side-icon", "aria-hidden": "true" });
  const s = size || 18;
  box.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + DZ_ICONS[name] + "</svg>";
  return box;
}

// ---- Royal Road ----

function dzStories() {
  if (!dzCanRead()) {
    return dzPick === "stories" ? [sectionHead(t("Royal Road")), el("p", { class: "footnote" }, t("Royal Road's lists show in Waypage on your phone. A story's link saved in the Library becomes a collection too."))] : [];
  }
  const rr = C.discover.sources.find((x) => x.key === "rr");
  if (dz.found) {
    const f = dz.found;
    return [sectionHead(f.label + " · " + f.words, el("button", { class: "btn-text", type: "button", onclick: dzClearSearch }, t("Clear"))),
      f.busy ? el("p", { class: "footnote dz-src" }, t("Searching {label}…", { label: f.label }))
        : f.items.length ? dzCovers(f.items) : el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || t("No stories with that in their title."))];
  }
  // A few from each site, taken in turn (Daniel: "Sites", then some from
  // different sites); the heading opens Sites to browse them all.
  const q = dzQ().toLowerCase();
  const def = C.discover.rrLists.find((l) => l.key === dzList) || C.discover.rrLists[0];
  const got = C.discover.rrSaved(def.key), first = DZ_FIRST.map((k) => C.discover.firstSaved(k));
  const rows = [got ? got.items.map((s) => ({ ...s, site: "Royal Road" })) : [], ...first.map((x) => (x ? x.items : [])), dzSerials()]
    .map((list) => list.filter((s) => !q || s.title.toLowerCase().includes(q)));
  const items = [];
  for (let i = 0; items.length < 18 && rows.some((r) => r[i]); i++) rows.forEach((r) => { if (r[i] && items.length < 18) items.push(r[i]); });
  const line = dz.busy ? t("Reading the story sites…") : dz.error ? dz.error : navigator.onLine || items.length ? "" : t("Story sites show when you're online.");
  const head = el("div", { class: "section-head wide" },
    el("h2", { class: "overline" }, el("button", { class: "section-link", type: "button", onclick: () => dzShowSites() },
      t("Sites"), el("span", { class: "section-chev", "aria-hidden": "true" }, "›"))));
  return [head,
    items.length ? dzCovers(items, false, true) : null,
    dzAsk(rr),
    line ? el("p", { class: "footnote dz-src" + (dz.error && !dz.busy ? " warn" : "") }, line) : null];
}

// The sites All's row takes a few from besides Royal Road: ones that answer
// quickly (each one read is a page load, some through the hidden browser).
const DZ_FIRST = ["fp", "wp"];
// The hand-picked web serials as stories.
function dzSerials() {
  return C.discover.list().entries.filter((e) => e.kind === "serial")
    .map((e) => ({ id: "serial:" + e.url, url: e.url, title: e.name, about: e.about, site: t("Web serial"), serial: true, tags: [], chapters: 0, cover: "" }));
}

function dzShowSites() {
  dzPick = "stories";
  renderDiscover();
  scrollTo(0, 0);
  const on = $("discover").querySelector(".feed-chips .chip.on");
  if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// ---- Sites: story sites as a grid ----
// Royal Road and FictionPress browsed page after page, by list and genre,
// or searched; web serials (WordPress and the like) from the hand-picked
// list. The grid's source, list, genre, its pages so far, and whether
// there are more.
let dzSource = load("waypage.discover.source", "rr");
const dzSrc = () => (dzSource === "serials" ? null : dzSources().find((x) => x.key === dzSource) || dzSources()[0] || null);
const dzGrid0 = () => {
  const src = dzSrc();
  const pref = load("waypage.discover.pick." + (src ? src.key : dzSource), {});
  const key = src && src.lists.some((l) => l.key === pref.key) ? pref.key : src ? (src.key === "rr" ? dzList : src.lists[0].key) : "";
  const own = src && src.packs && pref.genre === undefined ? (i18n.lang === "he" ? "heb" : "eng") : pref.genre;
  const genre = src && (src.genres.some((x) => x.key === own) ? own : src.anyGenre ? "" : src.genres[0].key);
  return { source: src ? src.key : dzSource, key, genre: genre || "", page: 0, items: [], busy: false, error: "", done: false };
};
dz.grid = dzGrid0();

function dzGrid() {
  if (!dzSources().length) return dzStories();
  const here = dzSrc();
  // The copy's reach can change after load (the app's plugins arrive).
  if (dz.grid.source !== (here ? here.key : "serials")) dz.grid = dzGrid0();
  const sources = dropdown({ label: t("Site"), cls: "field-pick dz-pick", value: here ? here.key : "serials",
    options: [...dzSources().map((x) => ({ value: x.key, label: x.label })), { value: "serials", label: t("Web serials") }],
    onpick: (v) => { dzSource = v; store("waypage.discover.source", v); dz.found = null; dz.grid = dzGrid0(); renderDiscover(); } });
  const src = dzSrc();
  if (!src) {
    const serials = C.discover.list().entries.filter((e) => e.kind === "serial" && dzMatch(e, dzQ()));
    return [el("div", { class: "dz-tools" }, sources),
      serials.length ? el("div", { class: "group feed-group dz-serials" }, ...serials.map(dzSerialRow)) : el("p", { class: "empty-text dz-none" }, t("Nothing here matches that.")),
      el("p", { class: "footnote" }, t("Stories posted on their own sites, most on WordPress. A tap saves the whole story as a collection."))];
  }
  if (dz.found) {
    const f = dz.found;
    return [el("div", { class: "dz-tools" }, sources),
      sectionHead(t("Results for “{words}”", { words: f.words }), el("button", { class: "btn-text", type: "button", onclick: dzClearSearch }, t("Clear"))),
      f.busy ? el("p", { class: "footnote dz-src" }, t("Searching {label}…", { label: src.label }))
        : f.items.length ? (src.packs ? dzPacks(f.items) : dzCovers(f.items, true)) : el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || (src.packs ? t("No packs with that in their name.") : t("No stories with that in their title.")))];
  }
  const g = dz.grid;
  const phoneOnly = dzCanRead() ? null : el("p", { class: "footnote" }, t("The story sites (Royal Road, AO3 and the rest) show in Waypage on your phone."));
  if (src.searchOnly) {
    if (src.browse) src.browse(g.key, "", 0);
    const lists = dropdown({ label: t("{label} list", { label: src.label }), cls: "field-pick dz-pick", value: g.key,
      options: src.lists.map((l) => ({ value: l.key, label: l.label })), onpick: (v) => { store("waypage.discover.pick." + src.key, { key: v }); dz.grid = { ...dzGrid0(), key: v }; renderDiscover(); } });
    return [el("div", { class: "dz-tools" }, sources, lists), dzAsk(src),
      el("p", { class: "footnote dz-src" }, t("{label} shows its lists only in its own app. Search it with the field above.", { label: src.label }))];
  }
  if (!g.page && !g.busy && !g.error) {
    // Royal Road's first page of a list is the one the row keeps.
    const had = src.key === "rr" && !g.genre && C.discover.rrSaved(g.key);
    if (had) Object.assign(g, { page: 1, items: had.items.slice() });
    else setTimeout(() => dzMore(), 0);
  }
  const keep = (change) => {
    const pick = { key: g.key, genre: g.genre, ...change };
    store("waypage.discover.pick." + src.key, pick);
    if (src.key === "rr") { dzList = pick.key; store("waypage.discover.rrList", pick.key); }
    dz.grid = { ...dzGrid0(), ...pick };
    renderDiscover();
  };
  const lists = dropdown({ label: t("{label} list", { label: src.label }), cls: "field-pick dz-pick", value: g.key,
    options: src.lists.map((l) => ({ value: l.key, label: l.label })), onpick: (v) => keep({ key: v }) });
  const genres = src.genres.length ? dropdown({ label: { Tag: t("Tag"), Subject: t("Subject"), Fandom: t("Fandom"), Language: t("Language") }[src.genreLabel] || t("Genre"), cls: "field-pick dz-pick", value: g.genre,
    options: [...(src.anyGenre ? [{ value: "", label: ({ Tag: t("Every tag"), Subject: t("Every subject"), Fandom: t("Every fandom"), Language: t("Every language") }[src.genreLabel] || t("Every genre")) }] : []), ...src.genres.map((x) => ({ value: x.key, label: x.label }))],
    onpick: (v) => keep({ genre: v }) }) : null;
  const line = g.busy ? (g.page ? t("Reading more…") : t("Reading {site}…", { site: src.label })) : g.error;
  const q = dzQ().toLowerCase();
  const shown = g.items.filter((s) => !q || s.title.toLowerCase().includes(q));
  return [
    el("div", { class: "dz-tools" }, sources, src.lists.length > 1 ? lists : null, genres),
    dzAsk(src),
    shown.length ? (src.packs ? dzPacks(shown) : dzCovers(shown, true)) : null,
    src.packs && !g.busy && !g.error ? el("p", { class: "footnote" }, t("A pack is a whole site in one file, to read with no connection. It's read from where you save it, in Files.")) : null,
    line ? el("p", { class: "footnote dz-src" + (g.error && !g.busy ? " warn" : "") }, line) : null,
    g.items.length && !g.done && !g.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => dzMore() }, src.books ? t("More books") : src.audiobooks ? t("More audiobooks") : src.texts ? t("More texts") : src.packs ? t("More packs") : t("More stories")) : null,
    g.done && g.items.length ? el("p", { class: "footnote dz-src" }, t("That's all of them.")) : null,
    phoneOnly,
  ];
}

// A web serial from the list: + saves it whole, from its contents page.
function dzSerialRow(e) {
  const on = allFolders().some((n) => { const src = folderSource(folderPages(n)); return src && sameUrl(src, e.url); });
  return el("div", { class: "post dz-row", "data-key": "dz:" + e.url },
    el("button", { class: "post-open", type: "button", "aria-label": e.name, onclick: () => openMenu("saveStory", { url: e.url, title: e.name, serial: true, tags: [] }) }),
    feedMark({ url: e.url, link: e.url, title: e.name }),
    el("span", { class: "post-body" },
      el("span", { class: "post-title", dir: "auto" }, e.name),
      e.about ? el("span", { class: "dz-about", dir: "auto" }, e.about) : null,
      el("span", { class: "post-meta" }, dzHost(e.url))),
    on ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), t("Saved"))
      : el("button", { class: "post-act post-save", type: "button", "aria-label": t("Save {name}", { name: e.name }), onclick: () => openMenu("saveStory", { url: e.url, title: e.name, serial: true, tags: [] }) }, dzIcon("plus")));
}

// A story to the library, as the Save sheet picked (2026-11, Daniel:
// not always a collection): `as` "collection" or "series" opens its
// chapter list to check, then saves it into one that follows its new
// chapters; "file" makes one book of it (dzStoryFile), with no collection.
async function dzSaveStory(s, how = { as: "collection" }) {
  if (!navigator.onLine) { toast(t("You're offline. Save it when you're back online.")); return; }
  toast(t("Finding its chapters…"));
  try {
    const found = s.serial ? await C.discover.serialChapters(s.url) : noteStatus(await findWithProgress(s.url));
    const title = found.title || s.title;
    if (how.as === "file") { dzStoryFile(s, found.links.length ? found.links : [s.url], title, how); return; }
    if (!found.links.length) { savePage(s.url); return; }
    // The story page's own tags; Discover's list row, when it gave none.
    const siteTags = found.siteTags || (s.tags && s.tags.length ? { site: s.serial ? dzHost(s.url) : s.site || "Royal Road", tags: s.tags } : null);
    openBatch(found.links.join("\n"), false, folderName(title), s.url, siteTags);
  } catch (e) { toast(e instanceof C.save.SaveError ? e.message : t("Couldn't read its chapters. Try again.")); }
}

const dzIsComic = (s) => C.discover.sources.some((x) => x.comics && x.label === s.site);

// The Save sheet: a collection, a series, or one book file. The pick and
// the file's place are remembered.
const DZ_STORY_AS_KEY = "waypage.discover.storyAs";
function dzStorySaveSheet() {
  const s = state.menu.page;
  const comic = dzIsComic(s);
  // Clips go into a collection or a series, picked on Save with options.
  let as = load(DZ_STORY_AS_KEY, "clips") === "file" ? "file" : "clips";
  let where = dzWhere();
  const whereRow = C.platform.native ? dzWhereRow(() => where, (v) => { where = v; }) : null;
  const note = el("p", { class: "footnote dz-add-note" });
  const paint = () => {
    if (whereRow) whereRow.hidden = as !== "file";
    note.textContent = as === "file" ? (comic ? t("Every episode downloads, then they become one CBZ comic in Files. It doesn't follow new episodes.")
      : t("Every chapter downloads, then they become one EPUB book in Files. It doesn't follow new chapters."))
      : t("Its chapter list opens to check, with a collection or a series to save it into. New chapters join it when they're out.");
  };
  const asRow = pickRow({ label: t("Save as"), options: [
    { value: "clips", label: t("Collection or series"), note: t("A clip for each chapter") },
    { value: "file", label: comic ? t("CBZ file") : t("EPUB file"), note: t("One file in Files, no collection") },
  ], get: () => as, set: (v) => { as = v; store(DZ_STORY_AS_KEY, v); paint(); } });
  paint();
  const site = s.serial ? dzHost(s.url) : s.site || "Royal Road";
  return el("div", { class: "page-controls dz-add" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, s.title),
      el("p", { class: "meta" }, site)),
    el("div", { class: "group" }, asRow, whereRow),
    note,
    el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); dzSaveStory(s, { as, where }); } }, t("Save")));
}
MENUS.saveStory = { label: t("Save"), build: () => dzStorySaveSheet() };

// A story made into one book: every chapter is saved out of sight (never
// in the Library), made into an EPUB (a CBZ for comics) as Export does,
// then the saved chapters go and the book is added like a file brought in,
// kept where Save in says. The card in Downloads has Pause and Stop.
async function dzStoryFile(s, links, title, how) {
  if (!C.platform.canReadPages) { toast(t("This browser can't download from that site. Add it in Waypage on your phone.")); return; }
  const comic = dzIsComic(s);
  const tree = await pickedTree(how);
  if (tree === false) return;
  const k = keepRun(comic ? t("Making a comic") : t("Making a book"), title);
  const made = [];
  const say = (part, now) => { k.run.part = part; k.run.now = now; updateRunCard(k.run); };
  let failed = 0;
  try {
    for (const [i, url] of links.entries()) {
      if (!(await gate(k.run))) throw new Error("stopped");
      await wifiGate();
      say(0.8 * i / links.length, comic ? t("Episode {done} of {total}", { done: i + 1, total: links.length }) : t("Chapter {done} of {total}", { done: i + 1, total: links.length }));
      if (i) await new Promise((go) => setTimeout(go, PACE_MS));
      try { made.push(await saveOnce({ url, site: s.site }, { mode: comic ? "full" : load(IMAGES_KEY, "previews"), kind: comic ? "comic" : "article" })); }
      catch (e) { failed++; }
    }
    if (!made.length) throw new Error("none saved");
    if (!(await gate(k.run))) throw new Error("stopped");
    const by = s.by || made[0].byline || "";
    const name = dzBookName({ title, by, kind: comic ? "cbz" : "epub" });
    const cover = comic ? null : await dzCoverBytes(s);
    const packing = (done, total, pack) => say(0.8 + 0.2 * (pack ? done / total : 0), pack ? t("Packing the book…") : comic ? t("Making the comic…") : t("Making the book…"));
    const out = comic ? await C.files.exportComic(made, title, packing)
      : await C.epub.exportBook(made, title, cover, packing, { heads: true, author: by || made[0].site || "" });
    const mime = comic ? "application/vnd.comicbook+zip" : "application/epub+zip";
    say(1, t("Opening"));
    let file, ref = null;
    if (out.uri) {
      ref = await C.platform.keepMade(out.uri, name, how.where, tree);
      file = await C.platform.files.blob(ref, 0);
    } else {
      file = new File([out.blob], name, { type: mime });
      const kept = await C.platform.saveLinked(file, name, mime).catch(() => ({ saved: null, ref: null }));
      if (kept.saved === false) throw new Error("stopped");
      ref = kept.ref || null;
    }
    k.done();
    const siteTags = s.tags && s.tags.length ? { site: s.serial ? dzHost(s.url) : s.site || "Royal Road", tags: s.tags } : undefined;
    await openFile(file, null, false, ref, { ...(ref ? { ref } : {}), siteTags });
    if (failed) toast(tn(failed, "1 chapter couldn't be saved and isn't in the book.", "{n} chapters couldn't be saved and aren't in the book."));
  } catch (e) {
    k.done();
    if (!(e instanceof C.save.SaveError)) console.error(e);
    toast(k.run.stopped || (e && e.message === "stopped") ? t("Stopped.") : made.length ? t("Couldn't make the book. Try again.") : t("Couldn't save its chapters. Try again."));
  } finally {
    for (const m of made) C.store.removePage(m.id).catch(() => {});
    if (state.place === "discover") renderDiscover();
  }
}

// The story's cover from its site, for the book's own.
async function dzCoverBytes(s) {
  if (!s.cover) return null;
  try { return new Uint8Array(await (await C.platform.fetchBytes(s.cover, "cover")).blob.arrayBuffer()); } catch (e) { return null; }
}

// The next page of the grid's list, added under what's there.
async function dzMore() {
  const g = dz.grid;
  if (g.busy || g.done) return;
  if (!navigator.onLine) { g.error = t("Story sites show when you're online."); renderDiscover(); return; }
  g.busy = true;
  g.error = "";
  renderDiscover();
  try {
    const src = C.discover.sources.find((x) => x.key === g.source);
    const items = await src.browse(g.key, g.genre, g.page + 1);
    if (dz.grid !== g) return;
    const seen = new Set(g.items.map((s) => s.id));
    const fresh = items.filter((s) => !seen.has(s.id));
    g.items.push(...fresh);
    g.page++;
    if (!fresh.length) g.done = true;
  } catch (e) {
    if (dz.grid !== g) return;
    if (g.page && /^no stories/.test((e && e.message) || "")) g.done = true;
    else g.error = t("Couldn't read it just now. Pull down to try again. ({why})", { why: dzWhy(e) });
  }
  g.busy = false;
  if (state.place === "discover") renderDiscover();
}

// A story's cover, and under it a card of its own for when there's no
// picture (AO3, the forums and most of FictionPress have none): its site,
// title and author on a colour picked from the story, the same each time.
function dzCoverCard(s, cls) {
  let h = 0;
  for (const c of String(s.id || s.url || s.title)) h = (h * 31 + c.codePointAt(0)) % 360;
  const site = s.serial ? dzHost(s.url) : s.site || "Royal Road";
  return el("span", { class: "dz-cover" + (cls ? " " + cls : ""), "aria-hidden": "true", style: "--dz-hue:" + h },
    el("span", { class: "dz-cover-s" }, el("bdi", {}, site)),
    el("span", { class: "dz-cover-t", dir: "auto" }, s.title),
    s.by ? el("span", { class: "dz-cover-by", dir: "auto" }, s.by) : null);
}

function dzCovers(items, grid, sites) {
  return el("div", { class: grid ? "dz-covers dz-grid" : "dz-covers", role: "list" }, ...items.map((s) => {
    const saved = dzSavedStory(s);
    const art = dzCoverCard(s);
    if (s.cover) {
      const img = el("img", { src: s.cover, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("load", () => art.classList.add("has-img"));
      img.addEventListener("error", () => dzCoverAgain(img, s));
      art.prepend(img);
    }
    const meta = [sites ? s.site || "Royal Road" : s.book || s.audiobook ? s.by : s.tags[0], s.chapters ? s.chapters + " ch." : ""].filter(Boolean).join(" · ");
    return el("button", { class: "dz-book", type: "button", role: "listitem", "data-key": "rr:" + s.id,
      "aria-label": saved ? t("{title}, in your library", { title: s.title }) : s.title, onclick: () => openMenu("story", s) },
      el("span", { class: "dz-art" }, art, el("span", { class: "dz-mark" + (saved ? " on" : "") }, dzIcon(saved ? "check" : "plus", 16))),
      el("span", { class: "dz-bt", dir: "auto" }, s.title),
      meta ? el("span", { class: "dz-bm" }, meta) : null);
  }));
}

// Kiwix packs as rows: the pack's picture, name, what it is, its
// language and size; + asks where to download it (the + sheet).
function dzPacks(items) {
  return el("div", { class: "group feed-group dz-packs" }, ...items.map((s) => {
    const here = packHere(s), coming = packsComing.has(s.file);
    const add = () => (here ? openPage(here.id) : openMenu("addBook", s));
    const mark = el("span", { class: "site-mark feed-mark dz-pack-mark", "aria-hidden": "true" });
    if (s.cover) {
      const img = el("img", { src: s.cover, alt: "", loading: "lazy", referrerpolicy: "no-referrer", width: "48", height: "48" });
      img.addEventListener("error", () => img.remove());
      mark.append(img);
    } else mark.textContent = (s.title || "?").slice(0, 1);
    return el("div", { class: "post dz-row", "data-key": s.id },
      el("button", { class: "post-open", type: "button", "aria-label": s.title + (here ? ", " + t("in your library") : ""), onclick: add }),
      mark,
      el("span", { class: "post-body" },
        el("span", { class: "post-title", dir: "auto" }, s.title),
        s.about ? el("span", { class: "dz-about", dir: "auto" }, s.about) : null,
        el("span", { class: "post-meta" }, [s.by, s.flavour === "maxi" ? t("with pictures") : s.flavour === "nopic" ? t("no pictures") : s.flavour === "mini" ? t("introductions only") : "", s.size ? C.discover.kxSize(s.size) : ""].filter(Boolean).join(" · "))),
      here ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), t("Saved"))
        : coming ? el("span", { class: "post-saved" }, t("Downloading"))
          : el("button", { class: "post-act post-save", type: "button", "aria-label": t("Download {name}", { name: s.title }), onclick: add }, dzIcon("plus")));
  }));
}

// A cover that won't load in the page: WEBTOON's (and some others') come
// only to a visit from their own site, so the phone downloads it once
// with that site as its Referer, into the cache, and shows that copy.
async function dzCoverAgain(img, s) {
  if (img.dataset.again || !C.platform.downloadTo || !s.cover) { img.remove(); return; }
  img.dataset.again = "1";
  try {
    const name = "discover-covers/" + String(s.id || "").replace(/[^a-z0-9_-]/gi, "_").slice(-80) + ".jpg";
    // A catalog's covers may want its login, or be plain http (blocked in the app's page).
    const src = await C.platform.downloadTo(s.cover, name, s.url, "CACHE", s.catalog ? C.opds.login(s.catalog, s.cover) : undefined);
    if (src) img.src = src; else img.remove();
  } catch (e) { img.remove(); }
}

async function dzReadRR(force) {
  if (!dzCanRead() || dz.busy || dz.found) return;
  const def = C.discover.rrLists.find((l) => l.key === dzList) || C.discover.rrLists[0];
  const had = C.discover.rrSaved(def.key);
  const fresh = (x) => x && Date.now() - x.at < 36e5;
  if (!force && fresh(had) && DZ_FIRST.every((k) => fresh(C.discover.firstSaved(k)))) return;
  if (!navigator.onLine) return;
  dz.busy = true;
  dz.error = "";
  if (state.place === "discover") renderDiscover();
  // One after the other: both may need the hidden browser.
  let rrErr = null;
  try { await C.discover.rrRead(def.key, force); } catch (e) { rrErr = e; }
  for (const k of DZ_FIRST) { try { await C.discover.firstRead(k, force); } catch (e) { /* the row shows the others */ } }
  if (rrErr) dz.error = (had ? t("Couldn't reach Royal Road. This is the list from {when}.", { when: whenText(had.at) }) : t("Couldn't read Royal Road's list just now. Pull down to try again.")) + " (" + dzWhy(rrErr) + ")";
  dz.busy = false;
  if (state.place === "discover") renderDiscover();
}

// Why Royal Road failed, in a few words, so a phone report says it.
function dzWhy(e) {
  const m = String((e && e.message) || e || "");
  if (/^HTTP (403|418|503)/.test(m)) return t("{m}: the site turned the app away", { m });
  if (/^HTTP /.test(m)) return m;
  if (/no stories/.test(m)) return t("the page came back, but no stories were found in it") + " " + (m.match(/\(.*\)/) || [""])[0];
  return m.slice(0, 80) || "no answer";
}

async function dzSearch(words, src) {
  if (!src || !(dzCanRead() || (src.web && C.platform.canReadPages))) return;
  if (!navigator.onLine) { toast(t("You're offline. Search when you're back online.")); return; }
  const f = dz.found = { words, label: src.label, items: [], error: "", busy: true };
  renderDiscover();
  try { f.items = await src.search(words); }
  catch (e) { f.error = t("Couldn't reach {site}. Try again in a while. ({why})", { site: src.label, why: dzWhy(e) }); }
  f.busy = false;
  if (dz.found === f && state.place === "discover") renderDiscover();
}
function dzClearSearch() {
  dz.found = null;
  if (dzHead) dzHead.querySelector("input").value = "";
  renderDiscover();
}

function openDiscover() {
  renderDiscover();
  dzReadWiki();
  dzReadRR();
  const repo = C.platform.native && C.platform.build && C.platform.build.repo;
  if (repo && navigator.onLine) C.discover.refresh(repo).then((changed) => { if (changed && state.place === "discover") renderDiscover(); });
}

// ---- The sheets ----

function storySheet() {
  const s = state.menu.page;
  if (s.audiobook) return dzAudioSheet(s);
  const saved = dzSavedStory(s);
  const cover = dzCoverCard(s, "dz-sheet-cover");
  if (s.cover) {
    const img = el("img", { src: s.cover, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => cover.classList.add("has-img"));
    img.addEventListener("error", () => dzCoverAgain(img, s));
    cover.prepend(img);
  }
  const comics = C.discover.sources.some((x) => x.comics && x.label === s.site);
  const facts = [s.chapters ? (comics ? tn(s.chapters, "1 episode", "{n} episodes") : tn(s.chapters, "1 chapter", "{n} chapters")) : "", s.followers ? tn(s.followers, "1 following", "{n} following") : "", s.stat || ""].filter(Boolean).join(" · ");
  const rated = [s.rating ? "★ " + s.rating.toFixed(1) : "", s.tags.join(", ")].filter(Boolean).join(" · ");
  const site = s.serial ? dzHost(s.url) : s.site || "Royal Road";
  const kind = (s.kind || "epub").toUpperCase();
  const save = s.book
    ? el("button", { class: "btn-primary", type: "button", ...(saved ? { disabled: "" } : {}), onclick: async () => { await back(); if (s.catalog) dzSaveBook(s); else openMenu("addBook", s); } }, saved ? t("In your library") : t("Add the book"))
    : el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); openMenu("saveStory", s); } },
      saved ? t("Save it again") : t("Save"));
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, cover,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, s.title),
        el("p", { class: "meta" }, site + (s.by ? " · " + s.by : "")),
        facts ? el("p", { class: "meta" }, facts) : null,
        rated ? el("p", { class: "meta" }, rated) : null)),
    s.about ? el("p", { class: "dz-blurb", dir: "auto" }, s.about) : null,
    saved ? el("p", { class: "footnote dz-ok" }, t("It's in your library already.")) : null,
    save,
    el("p", { class: "footnote" }, s.catalog ? t("Its {kind} downloads and joins your Library, to read offline.", { kind })
      : s.book ? t("Its EPUB downloads and joins your Library, to read offline. It's in the public domain.")
      : s.texts ? t("A text in parts saves as a collection, a series or one EPUB book; a short one saves as one clip.")
        : t("Save it as a collection or a series that gets its new chapters, or as one EPUB book.")),
    s.catalog && s.url === s.epub ? null : el("button", { class: "btn-quiet", type: "button", onclick: () => C.platform.openOutside(s.url) }, dzIcon("out", 16), t("Open on {site}", { site: site })));
}

// A LibriVox recording: + downloads its parts into the app as one
// audiobook (app-listen.js), with its book from Project Gutenberg to read
// along with when there is one. Its parts and book are asked for as the
// sheet opens, when the list didn't give them.
function dzAudioSheet(s) {
  const saved = dzSavedStory(s);
  const can = canGetAudiobooks();
  const cover = dzCoverCard(s, "dz-sheet-cover");
  if (s.cover) {
    const img = el("img", { src: s.cover, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => cover.classList.add("has-img"));
    img.addEventListener("error", () => img.remove());
    cover.prepend(img);
  }
  const facts = el("p", { class: "meta" });
  const blurb = el("p", { class: "dz-blurb", dir: "auto" });
  const along = el("div");
  // Where the parts go, as for any download; a long book (64 kbps: about
  // 29 MB an hour) can wait for Wi-Fi.
  let where = dzWhere(), wifi = null;
  const size = () => Math.round((s.secs || 0) * 8000);
  const paint = () => {
    const n = s.parts ? s.parts.length : 0;
    facts.textContent = [s.secs ? C.listen.lengthText(s.secs) : "", n ? tn(n, "1 part", "{n} parts") : "", size() ? formatSize(size()) : "", s.stat && !/parts$/.test(s.stat) && !s.secs ? s.stat : ""].filter(Boolean).join(" · ");
    blurb.textContent = s.about || "";
    blurb.hidden = !s.about;
    const pg = C.discover.pgNumber(s.text);
    if (wifi == null && size()) wifi = size() > 200e6;
    fill(along, ...(can && !saved ? [el("div", { class: "group" }, dzWhereRow(() => where, (v) => { where = v; }),
      size() > 50e6 ? switchRow(t("Wait for Wi-Fi"), t("Starts on Wi-Fi, not on mobile data"), !!wifi, (on) => { wifi = on; }) : null,
      pg ? switchRow(t("Read along with the book"), t("Its text from Project Gutenberg downloads too"),
        load("waypage.discover.lvBook", true) !== false, (on) => store("waypage.discover.lvBook", on)) : null)] : []));
  };
  paint();
  if (!s.parts && !s.asked && navigator.onLine && C.platform.canReadPages) {
    s.asked = true;
    C.discover.lvDetails(s).then((d) => { Object.assign(s, d, { id: s.id }); if (facts.isConnected) paint(); }).catch(() => {});
  }
  const add = can
    ? el("button", { class: "btn-primary", type: "button", ...(saved ? { disabled: "" } : {}), onclick: async () => { await back(); getAudiobook(s, { where, wifi: !!wifi, book: !!C.discover.pgNumber(s.text) && load("waypage.discover.lvBook", true) !== false }); } },
      saved ? t("In your library") : t("Add the audiobook"))
    : s.zip ? el("button", { class: "btn-primary", type: "button", onclick: () => C.platform.openOutside(s.zip) }, t("Download the zip")) : null;
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, cover,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, s.title),
        el("p", { class: "meta" }, "LibriVox" + (s.by ? " · " + s.by : "")),
        facts)),
    blurb,
    saved ? el("p", { class: "footnote dz-ok" }, t("It's in your library already.")) : null,
    along,
    add,
    el("p", { class: "footnote" }, can ? t("Its parts download where you pick, in a folder of its own, and join Files as one audiobook, to listen offline. It's in the public domain.")
      : t("Audiobooks download into Waypage on Android. Here you can take the whole book as a zip of MP3s.")),
    el("button", { class: "btn-quiet", type: "button", onclick: () => C.platform.openOutside(s.url) }, dzIcon("out", 16), t("Open on {site}", { site: s.lv ? "LibriVox" : "archive.org" })));
}

function signupSheet() {
  const e = state.menu.page;
  const boxes = mailBoxes();
  // A new address by default (Daniel), one per newsletter.
  let picked = null;
  const addr = el("p", { class: "dz-addr" });
  const chips = el("div", { class: "chips" });
  const go = el("button", { class: "btn-primary", type: "button" });
  const paint = () => {
    fill(chips, ...boxes.map((f) => el("button", { class: "chip" + (picked === f ? " on" : ""), type: "button", "aria-pressed": String(picked === f),
      onclick: () => { picked = f; paint(); } }, el("span", { class: "chip-label", dir: "auto" }, f.title))),
      el("button", { class: "chip" + (!picked ? " on" : ""), type: "button", "aria-pressed": String(!picked), onclick: () => { picked = null; paint(); } }, t("New address")));
    addr.textContent = picked ? mailAddress(picked) : t("A new address named {name}, made when you sign up.", { name: e.name });
    go.textContent = picked ? t("Copy address and sign up") : t("Make it, copy it and sign up");
  };
  paint();
  go.addEventListener("click", async () => {
    let box = picked;
    await back();
    if (!box) {
      const before = new Set(mailBoxes());
      if (!(await makeMailBox(e.name))) return;
      box = mailBoxes().find((f) => !before.has(f));
      if (!box) return;
    }
    try { await navigator.clipboard.writeText(mailAddress(box)); } catch (err) { /* shown below */ }
    C.platform.openOutside(e.signup || e.url);
    toast(t("Address copied. Paste it on their sign-up page, then tap Confirm in Newsletters when their mail comes."));
  });
  return el("div", { class: "page-controls dz-signup" },
    el("div", { class: "dz-sheethead" }, feedMark({ url: e.url, link: e.url, title: e.name }),
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, e.name),
        el("p", { class: "meta" }, t("Comes by email only")))),
    el("p", { class: "dz-blurb" }, t("It goes to one of your Newsletters addresses. Sign up with the address on their page, then tap Confirm in Newsletters when their first mail comes.")),
    chips, addr, go);
}

function dzViewSheet() {
  return el("div", { class: "page-controls dz-view" },
    el("h2", { class: "menu-title" }, t("View options")),
    el("div", { class: "group" },
      switchRow(t("Wikipedia today"), t("The featured article and the most read, at the top of All"), dzWikiOn, (on) => {
        dzWikiOn = on;
        store("waypage.discover.showWiki", on);
        renderDiscover();
        if (on) dzReadWiki();
      })));
}
$("viewBtn").addEventListener("click", () => openMenu(state.place === "discover" ? "discoverView" : "libView"));

MENUS.discoverView = { label: t("View options"), build: () => dzViewSheet() };
MENUS.libView = { label: t("View options"), build: () => libViewSheet() };
MENUS.story = { label: t("Story"), build: () => storySheet() };
MENUS.signup = { label: t("Sign up"), build: () => signupSheet() };

// ---- Books ----

// A book's EPUB, named by its title and author, as the Library shows it.
function dzBookName(s) {
  return ((s.title || t("Book")) + (s.by ? " - " + s.by : "")).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) + "." + (s.kind || "epub");
}
// Where a downloaded file goes (2026-11, Daniel: "+ should always just ask"):
// a book as an EPUB file read from where it's saved, or as a collection
// of clips; a Kiwix pack always as a file. The place is remembered.
const DZ_WHERE_KEY = "waypage.discover.saveIn";
const DZ_AS_KEY = "waypage.discover.bookAs";
const dzWhere = () => load(DZ_WHERE_KEY, "app");
// The Save in row, shared by every + that downloads a file.
function dzWhereRow(get, set) {
  return pickRow({ label: t("Save in"), options: [
    { value: "app", label: t("Inside Waypage"), note: t("Private to the app. Goes when Waypage is uninstalled.") },
    { value: "downloads", label: t("Downloads"), note: t("The phone's Downloads folder. Stays after an uninstall.") },
    { value: "documents", label: t("Documents"), note: t("Documents/Waypage, seen in the Files app. Stays after an uninstall.") },
    { value: "folder", label: t("A folder you pick"), note: t("Anywhere on the phone, a memory card too. Asked each time.") },
  ], get, set: (v) => { store(DZ_WHERE_KEY, v); set(v); } });
}
function dzAddSheet() {
  const s = state.menu.page;
  const pack = !!s.zim;
  let as = pack ? "file" : load(DZ_AS_KEY, "file"), where = dzWhere();
  const big = s.size || 0;
  let wifi = big > 200e6;
  const whereRow = dzWhereRow(() => where, (v) => { where = v; });
  const note = el("p", { class: "footnote dz-add-note" });
  const paint = () => {
    whereRow.hidden = as !== "file" || !C.platform.native;
    note.textContent = pack ? t("Read from where it's saved, in Files. Never synced or backed up.")
      : as === "file" ? t("In Files, read from where it's saved. Doesn't sync.")
        : t("A collection with a clip for each chapter. Syncs like any clip.");
  };
  const asRow = pack ? null : pickRow({ label: t("Add as"),
    options: [{ value: "file", label: t("EPUB file") }, { value: "clips", label: t("Clips") }],
    get: () => as, set: (v) => { as = v; store(DZ_AS_KEY, v); paint(); } });
  paint();
  // The book's own tags from its site (Gutenberg's bookshelves, a
  // catalog's subjects): a remembered switch, as in Save with options.
  const siteTags = !pack && s.site && s.tags && s.tags.length ? { site: s.site, tags: s.tags } : null;
  let useTags = load(SITE_TAGS_KEY, false);
  const tagsRow = siteTags ? switchRow(t("{site}'s tags", { site: siteTags.site }), siteTags.tags.join(", "), useTags, (v) => { useTags = v; store(SITE_TAGS_KEY, v); }) : null;
  const facts = [s.site || (pack ? "Kiwix" : ""), s.by, big ? formatSize(big) : ""].filter(Boolean).join(" · ");
  return el("div", { class: "page-controls dz-add" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, s.title),
      facts ? el("p", { class: "meta" }, facts) : null),
    el("div", { class: "group" }, asRow, whereRow, tagsRow,
      pack && big > 50e6 ? switchRow(t("Wait for Wi-Fi"), t("Starts on Wi-Fi, not on mobile data"), wifi, (on) => { wifi = on; }) : null),
    note,
    el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); dzAddGo(s, { as, where, wifi, siteTags, tags: siteTags && useTags ? siteTags.tags : [] }); } },
      pack ? t("Download") : t("Add the book")));
}
MENUS.addBook = { label: t("Add"), build: () => dzAddSheet() };

// Downloads the book's EPUB and adds it like a file brought in.
function dzSaveBook(s) {
  if (dzSavedStory(s)) { toast(t("It's in your library already.")); return; }
  saveFileLink(s.epub, dzBookName(s), s.url, s.catalog ? (u, n) => C.opds.bytes(s.catalog, u, n) : undefined,
    s.site && s.tags && s.tags.length ? { siteTags: { site: s.site, tags: s.tags } } : undefined);
}

// ---- Wikipedia today ----

let dzWikiBusy = false;
function dzWiki() {
  const w = C.discover.wikiSaved();
  if (!w || (!w.featured && !w.most.length)) return [];
  const rows = [w.featured ? { ...w.featured, what: t("Featured article") } : null, ...w.most.map((a) => ({ ...a, what: t("Most read") }))].filter(Boolean);
  return [sectionHead(t("Wikipedia today")), el("div", { class: "group feed-group dz-wiki" }, ...rows.map(dzWikiRow))];
}
function dzWikiRow(a) {
  const had = savedAs(a.url);
  const open = () => (had ? openPage(had.id) : previewPost(null, { url: a.url }));
  return el("div", { class: "post dz-row", "data-key": "wiki:" + a.url },
    el("button", { class: "post-open", type: "button", "aria-label": a.title + (had ? ", saved" : ""), onclick: open }),
    Object.assign(siteMark({ site: "Wikipedia", url: "https://www.wikipedia.org/" }), { className: "site-mark feed-mark" }),
    el("span", { class: "post-body" },
      el("span", { class: "post-title", dir: "auto" }, a.title),
      a.about ? el("span", { class: "dz-about", dir: "auto" }, a.about) : null,
      el("span", { class: "post-meta" }, a.what)),
    had ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), t("Saved"))
      : el("button", { class: "post-act post-save", type: "button", "aria-label": t("Save {title}", { title: a.title }), onclick: () => savePage(a.url) }, dzIcon("plus")));
}
async function dzReadWiki() {
  if (!dzWikiOn || dzWikiBusy || !navigator.onLine || !C.platform.canReadPages) return;
  dzWikiBusy = true;
  try { await C.discover.wikiToday(); } catch (e) { /* yesterday's stays, or none */ }
  dzWikiBusy = false;
  if (state.place === "discover") renderDiscover();
}
