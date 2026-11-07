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
// Royal Road as last read: { at, items } per list, or an error line.
const dz = { busy: false, error: "", found: null };
// Only the phone reads the story sites: most sit behind Cloudflare's or
// their own bot checks, which turn the web copy's fetch proxy away (Royal
// Road refuses it outright), and the phone passes them in its hidden browser.
const dzCanRead = () => C.platform.canFetchPages;
// The sites this copy can browse: all of them in the app; in a browser,
// the books and texts, whose sites answer the fetch proxy.
const dzSources = () => C.discover.sources.filter((x) => C.platform.canFetchPages || (x.web && C.platform.canReadPages));
const DZ_KINDS = [["all", "All"], ["stories", "Sites"], ["feeds", "Feeds"], ["newsletters", "Newsletters"]];
const dzHost = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };

// Followed already: a feed from the same site (its page or its feed).
function dzFollowing(e) {
  const hosts = [dzHost(e.url), dzHost(e.feedUrl)].filter(Boolean);
  return feeds.some((f) => hosts.includes(dzHost(f.link)) || hosts.includes(dzHost(f.url)));
}
// A story saved already: a collection read from its page.
function dzSavedStory(s) {
  if (s.book) return state.pages.some((p) => p.file && p.file.name === dzBookName(s));
  return allFolders().some((n) => { const src = folderSource(folderPages(n)); return src && (s.serial ? sameUrl(src, s.url) : C.discover.storyId(src) === s.id); });
}

// The search field at the top searches what's shown: the picked lists as
// you type, and a story site's own search on Enter (Daniel: "it searches
// what's in your view"). It stays put, so typing keeps its focus.
let dzHead = null;
const dzQ = () => (dzHead ? dzHead.querySelector("input").value.trim() : "");
const dzMatch = (e, q) => !q || [e.name, e.about || "", dzHost(e.url)].some((t) => t.toLowerCase().includes(q.toLowerCase()));
function dzSearchHead() {
  const input = el("input", { type: "search", "aria-label": "Search Discover", autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  input.addEventListener("input", () => { if (!input.value.trim()) dz.found = null; renderDiscover(); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const src = dzSearchSrc();
    if (src && dzQ()) { input.blur(); dzSearch(dzQ(), src); }
  });
  const box = el("div", { class: "search dz-search", role: "search" }, input);
  box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
  return el("div", { class: "dz-head" }, box, el("div", { class: "chips filters feed-chips", role: "group", "aria-label": "Show" }));
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
  input.placeholder = dzPick === "feeds" ? "Search feeds" : dzPick === "newsletters" ? "Search newsletters"
    : dzPick === "stories" ? (src ? "Search " + src.label : "Search web serials") : "Search Discover";
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
  if (dzPick === "all" && !q) nodes.push(...dzWiki());
  if (dzPick === "stories") nodes.push(...dzGrid());
  else if (show("stories")) nodes.push(...dzStories());
  const pick = (kind) => entries.filter((e) => e.kind === kind && dzMatch(e, q));
  if (show("feeds") && pick("feed").length) {
    nodes.push(sectionHead("Feeds"), el("div", { class: "group feed-group" }, ...pick("feed").map(dzRow)));
  }
  if (show("newsletters") && pick("newsletter").length) {
    nodes.push(sectionHead("Newsletters"), el("div", { class: "group feed-group" }, ...pick("newsletter").map(dzRow)));
  }
  if (q && dzPick !== "stories" && !nodes.some(Boolean)) nodes.push(el("p", { class: "empty-text dz-none" }, "Nothing here matches that."));
  if (dzPick !== "stories" || !dzSrc()) nodes.push(el("p", { class: "footnote dz-foot" }, "Picked by hand. ",
    el("button", { class: "btn-text dz-suggest", type: "button", onclick: () => C.platform.openOutside("https://github.com/danielnoam/waypage/issues/new?title=" + encodeURIComponent("Discover: ")) }, "Suggest one on GitHub")));
  if (dzHead.parentNode !== root) root.replaceChildren(dzHead, el("div", { class: "dz-body" }));
  fill(root.querySelector(".dz-body"), ...nodes.filter(Boolean));
  chips.scrollLeft = scrollX;
}

// Under a typed search, a button that asks the story site itself.
function dzAsk(src) {
  const q = dzQ();
  return q && !dz.found ? el("button", { class: "btn-quiet dz-ask", type: "button", onclick: () => dzSearch(q, src) },
    "Search " + src.label + " for “" + q + "”") : null;
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
    on ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), "Following")
      : el("button", { class: "post-act post-save", type: "button", "aria-label": (e.kind === "newsletter" ? "Sign up to " : "Follow ") + e.name, onclick: add }, dzIcon("plus")));
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
    return dzPick === "stories" ? [sectionHead("Royal Road"), el("p", { class: "footnote" }, "Royal Road's lists show in Waypage on your phone. A story's link saved in the Library becomes a collection too.")] : [];
  }
  const rr = C.discover.sources.find((x) => x.key === "rr");
  if (dz.found) {
    const f = dz.found;
    return [sectionHead(f.label + " · " + f.words, el("button", { class: "btn-text", type: "button", onclick: dzClearSearch }, "Clear")),
      f.busy ? el("p", { class: "footnote dz-src" }, "Searching " + f.label + "…")
        : f.items.length ? dzCovers(f.items) : el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || "No stories with that in their title.")];
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
  const line = dz.busy ? "Reading the story sites…" : dz.error ? dz.error : navigator.onLine || items.length ? "" : "Story sites show when you're online.";
  const head = el("div", { class: "section-head wide" },
    el("h2", { class: "overline" }, el("button", { class: "section-link", type: "button", onclick: () => dzShowSites() },
      "Sites", el("span", { class: "section-chev", "aria-hidden": "true" }, "›"))));
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
    .map((e) => ({ id: "serial:" + e.url, url: e.url, title: e.name, about: e.about, site: "Web serial", serial: true, tags: [], chapters: 0, cover: "" }));
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
  const genre = src && (src.genres.some((x) => x.key === pref.genre) ? pref.genre : src.anyGenre ? "" : src.genres[0].key);
  return { source: src ? src.key : dzSource, key, genre: genre || "", page: 0, items: [], busy: false, error: "", done: false };
};
dz.grid = dzGrid0();

function dzGrid() {
  if (!dzSources().length) return dzStories();
  const here = dzSrc();
  // The copy's reach can change after load (the app's plugins arrive).
  if (dz.grid.source !== (here ? here.key : "serials")) dz.grid = dzGrid0();
  const sources = dropdown({ label: "Site", cls: "field-pick dz-pick", value: here ? here.key : "serials",
    options: [...dzSources().map((x) => ({ value: x.key, label: x.label })), { value: "serials", label: "Web serials" }],
    onpick: (v) => { dzSource = v; store("waypage.discover.source", v); dz.found = null; dz.grid = dzGrid0(); renderDiscover(); } });
  const src = dzSrc();
  if (!src) {
    const serials = C.discover.list().entries.filter((e) => e.kind === "serial" && dzMatch(e, dzQ()));
    return [el("div", { class: "dz-tools" }, sources),
      serials.length ? el("div", { class: "group feed-group dz-serials" }, ...serials.map(dzSerialRow)) : el("p", { class: "empty-text dz-none" }, "Nothing here matches that."),
      el("p", { class: "footnote" }, "Stories posted on their own sites, most on WordPress. A tap saves the whole story as a collection.")];
  }
  if (dz.found) {
    const f = dz.found;
    return [el("div", { class: "dz-tools" }, sources),
      sectionHead("Results for “" + f.words + "”", el("button", { class: "btn-text", type: "button", onclick: dzClearSearch }, "Clear")),
      f.busy ? el("p", { class: "footnote dz-src" }, "Searching " + src.label + "…")
        : f.items.length ? dzCovers(f.items, true) : el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || "No stories with that in their title.")];
  }
  const g = dz.grid;
  const phoneOnly = dzCanRead() ? null : el("p", { class: "footnote" }, "The story sites (Royal Road, AO3 and the rest) show in Waypage on your phone.");
  if (src.searchOnly) {
    if (src.browse) src.browse(g.key, "", 0);
    const lists = dropdown({ label: src.label + " list", cls: "field-pick dz-pick", value: g.key,
      options: src.lists.map((l) => ({ value: l.key, label: l.label })), onpick: (v) => { store("waypage.discover.pick." + src.key, { key: v }); dz.grid = { ...dzGrid0(), key: v }; renderDiscover(); } });
    return [el("div", { class: "dz-tools" }, sources, lists), dzAsk(src),
      el("p", { class: "footnote dz-src" }, src.label + " shows its lists only in its own app. Search it with the field above.")];
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
  const lists = dropdown({ label: src.label + " list", cls: "field-pick dz-pick", value: g.key,
    options: src.lists.map((l) => ({ value: l.key, label: l.label })), onpick: (v) => keep({ key: v }) });
  const genres = src.genres.length ? dropdown({ label: src.genreLabel || "Genre", cls: "field-pick dz-pick", value: g.genre,
    options: [...(src.anyGenre ? [{ value: "", label: src.genreLabel ? "Every " + src.genreLabel.toLowerCase() : "Every genre" }] : []), ...src.genres.map((x) => ({ value: x.key, label: x.label }))],
    onpick: (v) => keep({ genre: v }) }) : null;
  const line = g.busy ? (g.page ? "Reading more…" : "Reading " + src.label + "…") : g.error;
  const q = dzQ().toLowerCase();
  const shown = g.items.filter((s) => !q || s.title.toLowerCase().includes(q));
  return [
    el("div", { class: "dz-tools" }, sources, src.lists.length > 1 ? lists : null, genres),
    dzAsk(src),
    shown.length ? dzCovers(shown, true) : null,
    line ? el("p", { class: "footnote dz-src" + (g.error && !g.busy ? " warn" : "") }, line) : null,
    g.items.length && !g.done && !g.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => dzMore() }, src.books ? "More books" : src.texts ? "More texts" : "More stories") : null,
    g.done && g.items.length ? el("p", { class: "footnote dz-src" }, "That's all of them.") : null,
    phoneOnly,
  ];
}

// A web serial from the list: + saves it whole, from its contents page.
function dzSerialRow(e) {
  const on = allFolders().some((n) => { const src = folderSource(folderPages(n)); return src && sameUrl(src, e.url); });
  return el("div", { class: "post dz-row", "data-key": "dz:" + e.url },
    el("button", { class: "post-open", type: "button", "aria-label": e.name, onclick: () => dzSaveStory({ url: e.url, title: e.name, serial: true }) }),
    feedMark({ url: e.url, link: e.url, title: e.name }),
    el("span", { class: "post-body" },
      el("span", { class: "post-title", dir: "auto" }, e.name),
      e.about ? el("span", { class: "dz-about", dir: "auto" }, e.about) : null,
      el("span", { class: "post-meta" }, dzHost(e.url))),
    on ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), "Saved")
      : el("button", { class: "post-act post-save", type: "button", "aria-label": "Save " + e.name, onclick: () => dzSaveStory({ url: e.url, title: e.name, serial: true }) }, dzIcon("plus")));
}

// A story to the library: its chapter list, to check and save as a
// collection, which then follows its new chapters.
async function dzSaveStory(s) {
  if (!navigator.onLine) { toast("You're offline. Save it when you're back online."); return; }
  toast("Finding its chapters…");
  try {
    const found = s.serial ? await C.discover.serialChapters(s.url) : await C.save.findChapters(s.url);
    if (!found.links.length) { savePage(s.url); return; }
    openBatch(found.links.join("\n"), false, folderName(found.title || s.title), s.url);
  } catch (e) { toast(e instanceof C.save.SaveError ? e.message : "Couldn't read its chapters. Try again."); }
}

// The next page of the grid's list, added under what's there.
async function dzMore() {
  const g = dz.grid;
  if (g.busy || g.done) return;
  if (!navigator.onLine) { g.error = "Story sites show when you're online."; renderDiscover(); return; }
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
    else g.error = "Couldn't read it just now. Pull down to try again. (" + dzWhy(e) + ")";
  }
  g.busy = false;
  if (state.place === "discover") renderDiscover();
}

function dzCovers(items, grid, sites) {
  return el("div", { class: grid ? "dz-covers dz-grid" : "dz-covers", role: "list" }, ...items.map((s) => {
    const saved = dzSavedStory(s);
    const art = el("span", { class: "dz-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, s.title));
    if (s.cover) {
      const img = el("img", { src: s.cover, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("load", () => art.classList.add("has-img"));
      img.addEventListener("error", () => dzCoverAgain(img, s));
      art.prepend(img);
    }
    const meta = [sites ? s.site || "Royal Road" : s.book ? s.by : s.tags[0], s.chapters ? s.chapters + " ch." : ""].filter(Boolean).join(" · ");
    return el("button", { class: "dz-book", type: "button", role: "listitem", "data-key": "rr:" + s.id,
      "aria-label": s.title + (saved ? ", in your library" : ""), onclick: () => openMenu("story", s) },
      el("span", { class: "dz-art" }, art, el("span", { class: "dz-mark" + (saved ? " on" : "") }, dzIcon(saved ? "check" : "plus", 16))),
      el("span", { class: "dz-bt", dir: "auto" }, s.title),
      meta ? el("span", { class: "dz-bm" }, meta) : null);
  }));
}

// A cover that won't load in the page: WEBTOON's (and some others') come
// only to a visit from their own site, so the phone downloads it once
// with that site as its Referer, into the cache, and shows that copy.
async function dzCoverAgain(img, s) {
  if (img.dataset.again || !C.platform.downloadTo || !s.cover) { img.remove(); return; }
  img.dataset.again = "1";
  try {
    const name = "discover-covers/" + String(s.id || "").replace(/[^a-z0-9_-]/gi, "_") + ".jpg";
    const src = await C.platform.downloadTo(s.cover, name, s.url, "CACHE");
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
  if (rrErr) dz.error = (had ? "Couldn't reach Royal Road. This is the list from " + whenText(had.at) + "." : "Couldn't read Royal Road's list just now. Pull down to try again.") + " (" + dzWhy(rrErr) + ")";
  dz.busy = false;
  if (state.place === "discover") renderDiscover();
}

// Why Royal Road failed, in a few words, so a phone report says it.
function dzWhy(e) {
  const m = String((e && e.message) || e || "");
  if (/^HTTP (403|418|503)/.test(m)) return m + ": the site turned the app away";
  if (/^HTTP /.test(m)) return m;
  if (/no stories/.test(m)) return "the page came back, but no stories were found in it " + (m.match(/\(.*\)/) || [""])[0];
  return m.slice(0, 80) || "no answer";
}

async function dzSearch(words, src) {
  if (!src || !dzCanRead()) return;
  if (!navigator.onLine) { toast("You're offline. Search when you're back online."); return; }
  const f = dz.found = { words, label: src.label, items: [], error: "", busy: true };
  renderDiscover();
  try { f.items = await src.search(words); }
  catch (e) { f.error = "Couldn't reach " + src.label + ". Try again in a while. (" + dzWhy(e) + ")"; }
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
  const saved = dzSavedStory(s);
  const cover = el("span", { class: "dz-cover dz-sheet-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, s.title));
  if (s.cover) {
    const img = el("img", { src: s.cover, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => cover.classList.add("has-img"));
    img.addEventListener("error", () => dzCoverAgain(img, s));
    cover.prepend(img);
  }
  const parts = C.discover.sources.some((x) => x.comics && x.label === s.site) ? ["episode", "episodes"] : ["chapter", "chapters"];
  const facts = [s.chapters ? s.chapters + " " + parts[s.chapters === 1 ? 0 : 1] : "", s.followers ? s.followers.toLocaleString() + " following" : "", s.stat || ""].filter(Boolean).join(" · ");
  const rated = [s.rating ? "★ " + s.rating.toFixed(1) : "", s.tags.join(", ")].filter(Boolean).join(" · ");
  const site = s.serial ? dzHost(s.url) : s.site || "Royal Road";
  const save = s.book
    ? el("button", { class: "btn-primary", type: "button", ...(saved ? { disabled: "" } : {}), onclick: async () => { await back(); dzSaveBook(s); } }, saved ? "In your library" : "Add the book")
    : el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); dzSaveStory(s); } },
      saved ? "Save it again" : s.texts ? "Save it" : "Save as a collection");
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, cover,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, s.title),
        el("p", { class: "meta" }, site + (s.by ? " · " + s.by : "")),
        facts ? el("p", { class: "meta" }, facts) : null,
        rated ? el("p", { class: "meta" }, rated) : null)),
    s.about ? el("p", { class: "dz-blurb", dir: "auto" }, s.about) : null,
    saved ? el("p", { class: "footnote dz-ok" }, "It's in your library already.") : null,
    save,
    el("p", { class: "footnote" }, s.book ? "Its EPUB downloads and joins your Library, to read offline. It's in the public domain."
      : s.texts ? "A text in parts saves as a collection, its parts checked first; a short one saves as one clip."
        : "Its chapter list opens to check, then every chapter saves for reading offline. New chapters join the collection when they're out."),
    el("button", { class: "btn-quiet", type: "button", onclick: () => C.platform.openOutside(s.url) }, dzIcon("out", 16), "Open on " + site));
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
      el("button", { class: "chip" + (!picked ? " on" : ""), type: "button", "aria-pressed": String(!picked), onclick: () => { picked = null; paint(); } }, "New address"));
    addr.textContent = picked ? mailAddress(picked) : "A new address named " + e.name + ", made when you sign up.";
    go.textContent = picked ? "Copy address and sign up" : "Make it, copy it and sign up";
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
    toast("Address copied. Paste it on their sign-up page, then tap Confirm in Newsletters when their mail comes.");
  });
  return el("div", { class: "page-controls dz-signup" },
    el("div", { class: "dz-sheethead" }, feedMark({ url: e.url, link: e.url, title: e.name }),
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, e.name),
        el("p", { class: "meta" }, "Comes by email only"))),
    el("p", { class: "dz-blurb" }, "It goes to one of your Newsletters addresses. Sign up with the address on their page, then tap Confirm in Newsletters when their first mail comes."),
    chips, addr, go);
}

MENUS.story = { label: "Story", build: () => storySheet() };
MENUS.signup = { label: "Sign up", build: () => signupSheet() };

// ---- Books ----

// A book's EPUB, named by its title and author, as the Library shows it.
function dzBookName(s) {
  return ((s.title || "Book") + (s.by ? " - " + s.by : "")).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100) + ".epub";
}
// Downloads the book's EPUB and adds it like a file brought in.
function dzSaveBook(s) {
  if (dzSavedStory(s)) { toast("It's in your library already."); return; }
  saveFileLink(s.epub, dzBookName(s), s.url);
}

// ---- Wikipedia today ----

let dzWikiBusy = false;
function dzWiki() {
  const w = C.discover.wikiSaved();
  if (!w || (!w.featured && !w.most.length)) return [];
  const rows = [w.featured ? { ...w.featured, what: "Featured article" } : null, ...w.most.map((a) => ({ ...a, what: "Most read" }))].filter(Boolean);
  return [sectionHead("Wikipedia today"), el("div", { class: "group feed-group dz-wiki" }, ...rows.map(dzWikiRow))];
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
    had ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), "Saved")
      : el("button", { class: "post-act post-save", type: "button", "aria-label": "Save " + a.title, onclick: () => savePage(a.url) }, dzIcon("plus")));
}
async function dzReadWiki() {
  if (dzWikiBusy || !navigator.onLine || !C.platform.canReadPages) return;
  dzWikiBusy = true;
  try { await C.discover.wikiToday(); } catch (e) { /* yesterday's stays, or none */ }
  dzWikiBusy = false;
  if (state.place === "discover") renderDiscover();
}
