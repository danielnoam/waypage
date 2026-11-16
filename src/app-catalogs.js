// Waypage: the Catalogs extension's places (2026-11). Catalogs the person
// adds (src/opds.js) show in Discover › Sites beside Gutenberg: their
// folders to open, their books as covers, their own search. A book's +
// downloads its file into the Library, the way Gutenberg's books come.
// Its page in Settings › Extensions lists them to change or remove. Shell
// file, loaded only once the extension is on (src/extensions.js).

// The catalogs as Discover's sites.
function catalogSources() {
  return C.opds.list().map((cat) => ({ key: "cat:" + cat.id, label: cat.title, books: true, web: true, catalog: cat, lists: [], genres: [], anyGenre: true,
    search: (words) => catalogSearch(cat, words) }));
}
const catalogBook = (cat, b) => ({ ...b, site: cat.title, book: true, epub: b.file, chapters: 0, followers: 0, rating: 0,
  stat: b.kinds.map((k) => k.toUpperCase()).join(", "), catalog: cat });

// What's open in a catalog: the folders walked into (Back goes up one),
// and the feed shown, page after page.
const cg = { key: "", stack: [], folders: [], books: [], next: "", busy: false, error: "" };
const catRoots = {};
let catRun = 0;
function catalogWhy(e) {
  const m = (e && e.message) || "";
  if (m === "login") return t("It asks for a login. Check the username and password in Settings › Extensions › Catalogs.");
  if (m === "browser") return t("This browser can't reach it. It opens in Waypage on your phone.");
  if (m === "not a catalog") return t("That address isn't a catalog. Look for the server's OPDS address.");
  if (m === "no search") return t("This catalog has no search.");
  return t("Couldn't reach it. Check your connection and try again.");
}
async function catalogOpen(src, url, title) {
  if (cg.key !== src.key) Object.assign(cg, { key: src.key, stack: [] });
  cg.stack.push({ url, title });
  await catalogLoad(src.catalog);
}
async function catalogLoad(cat, more) {
  const at = cg.stack[cg.stack.length - 1];
  if (!more) Object.assign(cg, { folders: [], books: [], next: "" });
  cg.busy = true;
  cg.error = "";
  renderDiscover();
  const mine = ++catRun;
  try {
    const feed = await C.opds.read(cat, more ? cg.next : at.url);
    if (catRun !== mine) return;
    if (cg.stack.length === 1 && !more) catRoots[cat.id] = feed;
    if (!at.title && feed.title) at.title = feed.title;
    const seen = new Set(cg.books.map((b) => b.id));
    cg.folders.push(...feed.folders);
    cg.books.push(...feed.books.filter((b) => !seen.has(b.id)).map((b) => catalogBook(cat, b)));
    cg.next = feed.next && feed.next !== at.url ? feed.next : "";
  } catch (e) {
    if (catRun !== mine) return;
    cg.error = catalogWhy(e);
  }
  cg.busy = false;
  if (state.place === "discover") renderDiscover();
}
async function catalogSearch(cat, words) {
  const root = catRoots[cat.id] || (catRoots[cat.id] = await C.opds.read(cat, cat.url));
  if (!root.search) throw new C.opds.CatalogError("no search");
  const feed = await C.opds.read(cat, C.opds.searchUrl(root.search, words));
  return feed.books.map((b) => catalogBook(cat, b));
}
function catalogUp() {
  if (cg.stack.length < 2) return;
  cg.stack = cg.stack.slice(0, -1);
  catalogLoad(dzSrc().catalog);
}

// Sites with a catalog picked: where you are, its folders, its books.
function catalogGrid(src, tools) {
  if (cg.key !== src.key || !cg.stack.length) {
    Object.assign(cg, { key: src.key, stack: [{ url: src.catalog.url, title: src.catalog.title }], folders: [], books: [], next: "", busy: false, error: "" });
    setTimeout(() => catalogLoad(src.catalog), 0);
  }
  const at = cg.stack[cg.stack.length - 1];
  const up = cg.stack.length > 1 ? cg.stack[cg.stack.length - 2] : null;
  const q = dzQ().toLowerCase();
  const folders = cg.folders.filter((f) => !q || f.title.toLowerCase().includes(q));
  const books = cg.books.filter((b) => !q || b.title.toLowerCase().includes(q) || (b.by || "").toLowerCase().includes(q));
  const line = cg.busy ? (cg.books.length || cg.folders.length ? t("Reading more…") : t("Reading {site}…", { site: src.label })) : cg.error;
  return [
    el("div", { class: "dz-tools" }, tools),
    up ? el("div", { class: "section-head wide cat-where" },
      el("button", { class: "btn-text cat-up", type: "button", "aria-label": t("Back to {title}", { title: up.title }), onclick: catalogUp }, "‹ " + up.title),
      el("h2", { class: "overline", dir: "auto" }, at.title)) : null,
    dzAsk(src),
    folders.length ? el("div", { class: "group cat-folders" }, ...folders.map((f) => el("button", { class: "row nav-row", type: "button", onclick: () => catalogOpen(src, f.url, f.title) },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, f.title), f.about ? el("span", { class: "choice-note", dir: "auto" }, f.about) : null),
      el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))) : null,
    books.length ? dzCovers(books, true) : null,
    line ? el("p", { class: "footnote dz-src" + (cg.error && !cg.busy ? " warn" : "") }, line) : null,
    cg.error && !cg.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => catalogLoad(src.catalog) }, t("Try again")) : null,
    cg.next && !cg.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => catalogLoad(src.catalog, true) }, t("More books")) : null,
    !cg.busy && !cg.error && !folders.length && !books.length ? el("p", { class: "empty-text dz-none" }, q ? t("Nothing here matches that.") : t("This part of the catalog is empty.")) : null,
  ];
}

// Add a catalog, or change or remove one (`state.menu.page`).
function catalogSheet() {
  const had = state.menu && state.menu.page && state.menu.page.id ? state.menu.page : null;
  const field = (attrs) => el("input", { class: "feed-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false", ...attrs });
  const addr = field({ type: "url", inputmode: "url", placeholder: t("Catalog address (OPDS)"), "aria-label": t("Catalog address (OPDS)"), enterkeyhint: "go" });
  const user = field({ type: "text", placeholder: t("Username, if it asks"), "aria-label": t("Username") });
  const pass = field({ type: "password", placeholder: t("Password"), "aria-label": t("Password"), autocomplete: "new-password" });
  if (had) { addr.value = had.url; user.value = had.user; pass.value = had.pass; }
  const help = el("p", { class: "footnote" }, t("Calibre, Calibre-Web, Kavita, Komga and many libraries share one. A login stays on this device."));
  const label = had ? t("Save") : t("Add the catalog");
  const go = el("button", { class: "btn-primary", type: "button" }, label);
  const add = async () => {
    let url = addr.value.trim();
    if (!url) { addr.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = (C.opds.home("http://" + url) ? "http://" : "https://") + url;
    const cat = { id: had ? had.id : "", url, user: user.value.trim(), pass: pass.value };
    go.disabled = true;
    go.textContent = t("Reading the catalog…");
    try {
      const feed = await C.opds.read(cat, url);
      const title = (had && had.title !== C.opds.host(had.url) ? had.title : "") || feed.title || C.opds.host(url);
      const kept = had ? { ...cat, title } : C.opds.add({ ...cat, title });
      if (had) C.opds.update(kept);
      catRoots[kept.id] = feed;
      cg.key = "";
      await back();
      if (!had) {
        dzSource = "cat:" + kept.id;
        store("waypage.discover.source", dzSource);
        dz.grid = dzGrid0();
        await goPlace("discover");
        dzShowSites();
        toast(t("Added {title}", { title }));
      }
    } catch (e) {
      help.className = "footnote warn";
      help.textContent = catalogWhy(e);
      go.disabled = false;
      go.textContent = label;
    }
  };
  go.addEventListener("click", add);
  for (const i of [addr, user, pass]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
  if (!had) setTimeout(() => addr.focus({ preventScroll: true }), 50);
  const drop = had ? el("button", { class: "btn-quiet", type: "button", onclick: async () => {
    if (!confirm(t("Remove {title}? Books you added from it stay in your Library.", { title: had.title }))) return;
    await back();
    C.opds.remove(had.id);
  } }, t("Remove this catalog")) : null;
  return el("div", { class: "page-controls add-feed add-catalog" },
    el("h2", { class: "menu-title" }, had ? had.title : t("Add a catalog")),
    el("div", { class: "feed-field" }, addr, user, pass, help), go, drop);
}
MENUS.addCatalog = { label: t("Add a catalog"), build: () => catalogSheet() };

// The extension's page in Settings: each catalog (a tap changes or removes
// it), then Add a catalog under Actions.
EXT_PAGES.catalogs = () => {
  const cats = C.opds.list();
  return [
    cats.length ? section(t("Your catalogs"), null, el("div", { class: "group" },
      ...cats.map((cat) => navRow(cat.title, C.opds.host(cat.url) + (cat.user ? " · " + t("Signed in") : ""), () => openMenu("addCatalog", cat))))) : null,
    section(t("Actions"), null, el("div", { class: "group" }, navRow(t("Add a catalog"), null, () => openMenu("addCatalog")))),
  ].filter(Boolean);
};

C.opds.changed(() => {
  if (state.section === "catalogs") renderSection();
  if (state.place === "discover") renderDiscover();
});
if (state.place === "discover") renderDiscover();
