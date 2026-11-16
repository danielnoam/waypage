// Waypage: the Catalogs extension's place (2026-11). Catalogs the person
// adds (src/opds.js) get a place of their own in the sidebar (Daniel:
// Discover is for what Waypage ships): their folders to open, their books
// as covers, their own search. A book's sheet is Discover's, and Add the
// book downloads its file into the Library, the way Gutenberg's books come.
// Its page in Settings › Extensions lists them to change or remove. Shell
// file, loaded only once the extension is on (src/extensions.js).

// The catalog shown, and where in it: the folders walked into (‹ goes up
// one) and the feed shown, page after page; or a search's results.
let catPick = load("waypage.catalogs.pick", "");
const catNow = () => C.opds.list().find((c) => c.id === catPick) || C.opds.list()[0] || null;
const catalogBook = (cat, b) => ({ ...b, site: cat.title, book: true, epub: b.file, chapters: 0, followers: 0, rating: 0,
  stat: b.kinds.map((k) => k.toUpperCase()).join(", "), catalog: cat });
const cg = { key: "", stack: [], folders: [], books: [], next: "", busy: false, error: "", found: null };
const catRoots = {};
let catRun = 0, catHead = null;
function catalogWhy(e) {
  const m = (e && e.message) || "";
  if (m === "login") return t("It asks for a login. Check the username and password in Settings › Extensions › Catalogs.");
  if (m === "browser") return t("This browser can't reach it. It opens in Waypage on your phone.");
  if (m === "not a catalog") return t("That address isn't a catalog. Look for the server's OPDS address.");
  if (m === "no search") return t("This catalog has no search.");
  return t("Couldn't reach it. Check your connection and try again.");
}
async function catalogLoad(cat, more) {
  const at = cg.stack[cg.stack.length - 1];
  if (!more) Object.assign(cg, { folders: [], books: [], next: "" });
  cg.busy = true;
  cg.error = "";
  catalogDraw();
  const mine = ++catRun;
  try {
    const feed = await C.opds.read(cat, more ? cg.next : at.url);
    if (catRun !== mine) return;
    if (cg.stack.length === 1 && !more) catRoots[cat.id] = feed;
    const seen = new Set(cg.books.map((b) => b.id));
    cg.folders.push(...feed.folders);
    cg.books.push(...feed.books.filter((b) => !seen.has(b.id)).map((b) => catalogBook(cat, b)));
    cg.next = feed.next && feed.next !== at.url ? feed.next : "";
  } catch (e) {
    if (catRun !== mine) return;
    cg.error = catalogWhy(e);
  }
  cg.busy = false;
  catalogDraw();
}
function catalogOpen(cat, url, title) {
  cg.stack.push({ url, title });
  cg.found = null;
  catalogLoad(cat);
  scrollTo(0, 0);
}
function catalogUp(cat) {
  if (cg.stack.length < 2) return;
  cg.stack = cg.stack.slice(0, -1);
  catalogLoad(cat);
}
async function catalogSearch(cat, words) {
  const f = cg.found = { words, books: [], busy: true, error: "" };
  catalogDraw();
  try {
    const root = catRoots[cat.id] || (catRoots[cat.id] = await C.opds.read(cat, cat.url));
    if (!root.search) throw new C.opds.CatalogError("no search");
    const feed = await C.opds.read(cat, C.opds.searchUrl(root.search, words));
    f.books = feed.books.map((b) => catalogBook(cat, b));
  } catch (e) { f.error = catalogWhy(e); }
  f.busy = false;
  if (cg.found === f) catalogDraw();
}

function catalogSearchHead() {
  const input = el("input", { type: "search", "aria-label": t("Search the catalog"), autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  input.addEventListener("input", () => { if (!input.value.trim()) cg.found = null; catalogDraw(); });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    e.preventDefault();
    input.blur();
    const cat = catNow();
    if (cat) catalogSearch(cat, input.value.trim());
  });
  const box = el("div", { class: "search dz-search", role: "search" }, input);
  box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
  return el("div", { class: "dz-head" }, box);
}

// Which catalog, or Add a catalog…
function catalogPick(cat, input) {
  return dropdown({ label: t("Catalog"), cls: "field-pick dz-pick", value: cat.id,
    options: [...C.opds.list().map((c) => ({ value: c.id, label: c.title })), { value: "+", label: t("Add a catalog…") }],
    onpick: (v) => { if (v === "+") { openMenu("addCatalog"); catalogDraw(); return; } catPick = v; store("waypage.catalogs.pick", v); if (input) input.value = ""; catalogDraw(); } });
}

// The Catalogs place: which catalog (or Add a catalog…), where you are in
// it, its folders, its books; Enter in the field asks its own search.
function catalogDraw() {
  if (state.place !== "catalogs") return;
  const root = $("catalogs");
  const cat = catNow();
  if (!cat) {
    catHead = null;
    fill(root, el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("No catalogs yet")),
      el("p", { class: "empty-text" }, t("Calibre, Calibre-Web, Kavita, Komga and many libraries share one. A password stays on this device.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addCatalog") }, t("Add a catalog"))));
    return;
  }
  // One that came by sync has its username but not the password, which
  // never leaves the device it was typed on.
  if (cat.user && !cat.pass) {
    catHead = null;
    fill(root, el("div", { class: "dz-body" }, el("div", { class: "dz-tools" }, catalogPick(cat, null)),
      el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, t("Type the password for {title}", { title: cat.title })),
        el("p", { class: "empty-text" }, t("Catalogs sync without their passwords, so each device asks once.")),
        el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addCatalog", cat) }, t("Type the password")))));
    return;
  }
  if (cg.key !== cat.id) {
    Object.assign(cg, { key: cat.id, stack: [{ url: cat.url, title: cat.title }], folders: [], books: [], next: "", busy: false, error: "", found: null });
    setTimeout(() => catalogLoad(cat), 0);
  }
  if (!catHead) catHead = catalogSearchHead();
  const input = catHead.querySelector("input");
  input.placeholder = t("Search {label}", { label: cat.title });
  const pick = catalogPick(cat, input);
  const q = input.value.trim().toLowerCase();
  let body;
  if (cg.found) {
    const f = cg.found;
    body = [sectionHead(t("Results for “{words}”", { words: f.words }), el("button", { class: "btn-text", type: "button", onclick: () => { cg.found = null; input.value = ""; catalogDraw(); } }, t("Clear"))),
      f.busy ? el("p", { class: "footnote dz-src" }, t("Searching {label}…", { label: cat.title }))
        : f.books.length ? dzCovers(f.books, true) : el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || t("Nothing here matches that."))];
  } else {
    const at = cg.stack[cg.stack.length - 1];
    const up = cg.stack.length > 1 ? cg.stack[cg.stack.length - 2] : null;
    const folders = cg.folders.filter((f) => !q || f.title.toLowerCase().includes(q));
    const books = cg.books.filter((b) => !q || b.title.toLowerCase().includes(q) || (b.by || "").toLowerCase().includes(q));
    const line = cg.busy ? (cg.books.length || cg.folders.length ? t("Reading more…") : t("Reading {site}…", { site: cat.title })) : cg.error;
    body = [
      up ? el("div", { class: "section-head wide cat-where" },
        el("button", { class: "btn-text cat-up", type: "button", "aria-label": t("Back to {title}", { title: up.title }), onclick: () => catalogUp(cat) }, "‹ " + up.title),
        el("h2", { class: "overline", dir: "auto" }, at.title)) : null,
      folders.length ? el("div", { class: "group cat-folders" }, ...folders.map((f) => el("button", { class: "row nav-row", type: "button", onclick: () => catalogOpen(cat, f.url, f.title) },
        el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, f.title), f.about ? el("span", { class: "choice-note", dir: "auto" }, f.about) : null),
        el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))) : null,
      books.length ? dzCovers(books, true) : null,
      line ? el("p", { class: "footnote dz-src" + (cg.error && !cg.busy ? " warn" : "") }, line) : null,
      cg.error && !cg.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => catalogLoad(cat) }, t("Try again")) : null,
      cg.next && !cg.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => catalogLoad(cat, true) }, t("More books")) : null,
      !cg.busy && !cg.error && !folders.length && !books.length ? el("p", { class: "empty-text dz-none" }, q ? t("Nothing here matches that.") : t("This part of the catalog is empty.")) : null,
    ];
  }
  if (catHead.parentNode !== root) root.replaceChildren(catHead, el("div", { class: "dz-body" }));
  fill(root.querySelector(".dz-body"), el("div", { class: "dz-tools" }, pick), ...body.filter(Boolean));
}

// Add a catalog, or change or remove one (`state.menu.page`).
function catalogSheet() {
  const had = state.menu && state.menu.page && state.menu.page.id ? state.menu.page : null;
  const field = (attrs) => el("input", { class: "feed-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false", ...attrs });
  const addr = field({ type: "url", inputmode: "url", placeholder: t("Catalog address (OPDS)"), "aria-label": t("Catalog address (OPDS)"), enterkeyhint: "go" });
  const user = field({ type: "text", placeholder: t("Username, if it asks"), "aria-label": t("Username") });
  const pass = field({ type: "password", placeholder: t("Password"), "aria-label": t("Password"), autocomplete: "new-password" });
  if (had) { addr.value = had.url; user.value = had.user; pass.value = had.pass; }
  const help = el("p", { class: "footnote" }, t("Calibre, Calibre-Web, Kavita, Komga and many libraries share one. A password stays on this device."));
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
        catPick = kept.id;
        store("waypage.catalogs.pick", kept.id);
        await goPlace("catalogs");
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
  else if (had.user && !had.pass) setTimeout(() => pass.focus({ preventScroll: true }), 50);
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
      ...cats.map((cat) => navRow(cat.title, C.opds.host(cat.url) + (cat.user ? " · " + (cat.pass ? t("Signed in") : t("Needs its password")) : ""), () => openMenu("addCatalog", cat))))) : null,
    section(t("Actions"), null, el("div", { class: "group" }, navRow(t("Add a catalog"), null, () => openMenu("addCatalog")))),
  ].filter(Boolean);
};

C.opds.changed(() => {
  cg.key = "";
  if (state.section === "catalogs") renderSection();
  catalogDraw();
  if (sideShown()) renderSide();
});
catalogDraw();
