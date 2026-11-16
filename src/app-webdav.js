// Waypage: the WebDAV extension's place (2026-11). A folder on a server
// (src/webdav.js: Nextcloud, a NAS) in the sidebar: its folders to open,
// its books as covers, found by name. A book is downloaded into the
// Library, to read offline, and is marked as there from then on. Its page
// in Settings › Extensions lists the servers to change or remove. Shell
// file, loaded only once the extension is on (src/extensions.js).

let wdPick = load("waypage.webdav.pick", "");
const wdNow = () => C.webdav.list().find((s) => s.id === wdPick) || C.webdav.list()[0] || null;
// Where in the server: the folders walked into (‹ goes up one).
const wd = { key: "", stack: [], folders: [], books: [], busy: false, error: "" };
let wdRun = 0, wdHead = null;

function webdavWhy(e) {
  const m = (e && e.message) || "";
  if (m === "login") return t("It asks for a login. Check the username and password in Settings › Extensions › WebDAV.");
  if (m === "browser") return t("This browser can't reach it. It opens in Waypage on your phone.");
  if (m === "not webdav") return t("That address isn't a WebDAV folder. Look for the server's WebDAV address.");
  if (m === "gone") return t("That folder isn't on the server any more.");
  return t("Couldn't reach it. Check your connection and try again.");
}

async function webdavLoad(s) {
  const at = wd.stack[wd.stack.length - 1];
  Object.assign(wd, { folders: [], books: [], busy: true, error: "" });
  webdavDraw();
  const mine = ++wdRun;
  try {
    const got = await C.webdav.read(s, at.url);
    if (wdRun !== mine) return;
    wd.folders = got.folders;
    wd.books = got.books;
  } catch (e) {
    if (wdRun !== mine) return;
    wd.error = webdavWhy(e);
  }
  wd.busy = false;
  webdavDraw();
}
function webdavOpen(s, f) {
  wd.stack.push({ url: f.url, title: f.name });
  if (wdHead) wdHead.querySelector("input").value = "";
  webdavLoad(s);
  scrollTo(0, 0);
}
function webdavUp(s) {
  if (wd.stack.length < 2) return;
  wd.stack = wd.stack.slice(0, -1);
  webdavLoad(s);
}

// Whether a book is in the Library already: by its address on the server.
const webdavHas = (b) => state.pages.find((p) => p.webdav === b.url) || null;

async function webdavAdd(s, b) {
  const had = webdavHas(b);
  if (had) { openPage(had.id); return; }
  if (!navigator.onLine) { toast(t("You're offline. Add it when you're back online.")); return; }
  toast(t("Downloading “{replace}”…", { replace: b.name.replace(/\.[a-z0-9]+$/i, "") }));
  let got;
  try {
    got = await C.webdav.bytes(s, b.url, b.name);
    if (got.status === 401 || got.status === 403) throw new C.webdav.DavError("login");
    if (got.status !== 200) throw new Error("HTTP " + got.status);
  } catch (e) {
    toast(e instanceof C.webdav.DavError ? webdavWhy(e) : t("Couldn't download it just now. Try again later."));
    return;
  }
  const file = new File([got.blob], b.name, { type: got.blob.type || got.type || "" });
  await openFile(file, null, true, null, {});
  const p = fileLike(file.name, file.size, null);
  if (p && !p.webdav) {
    p.webdav = b.url;
    await C.store.writeIndex(state.pages);
  }
  webdavDraw();
}

function webdavSearchHead() {
  const input = el("input", { type: "search", "aria-label": t("Find in this folder"), placeholder: t("Find in this folder"), autocomplete: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  input.addEventListener("input", () => webdavDraw());
  const box = el("div", { class: "search dz-search", role: "search" }, input);
  box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
  return el("div", { class: "dz-head" }, box);
}

function webdavPick(s) {
  return dropdown({ label: t("Server"), cls: "field-pick dz-pick", value: s.id,
    options: [...C.webdav.list().map((x) => ({ value: x.id, label: x.title })), { value: "+", label: t("Add a server…") }],
    onpick: (v) => { if (v === "+") { openMenu("addWebdav"); webdavDraw(); return; } wdPick = v; store("waypage.webdav.pick", v); if (wdHead) wdHead.querySelector("input").value = ""; webdavDraw(); } });
}

// Covers come from the server as they scroll into view.
const wdSeen = "IntersectionObserver" in window ? new IntersectionObserver((xs) => {
  for (const x of xs) {
    if (!x.isIntersecting) continue;
    wdSeen.unobserve(x.target);
    const art = x.target;
    C.webdav.cover(art._server, art._book).then((url) => {
      if (!url || !art.isConnected) return;
      const img = el("img", { src: url, alt: "" });
      img.addEventListener("load", () => art.classList.add("has-img"));
      art.prepend(img);
    });
  }
}, { rootMargin: "400px" }) : null;

const webdavTitle = (b) => b.name.replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_]+/g, " ").trim() || b.name;
function webdavBook(s, b) {
  const had = webdavHas(b);
  const title = webdavTitle(b);
  const art = el("span", { class: "dz-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, title));
  art._book = b;
  art._server = s;
  if (b.cover && wdSeen) wdSeen.observe(art);
  return el("button", { class: "dz-book", type: "button", role: "listitem", "data-key": "wd:" + b.url,
    "aria-label": had ? t("{title}, in your library", { title }) : title, onclick: () => openMenu("webdavBook", { server: s, book: b }) },
    el("span", { class: "dz-art" }, art, had ? el("span", { class: "dz-mark on" }, dzIcon("check", 16)) : null),
    el("span", { class: "dz-bt", dir: "auto" }, title),
    el("span", { class: "dz-bm" }, C.webdav.KINDS[b.kind] + (b.size ? " · " + webdavSize(b.size) : "")));
}
const webdavSize = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + " GB" : n >= 1e6 ? Math.max(1, Math.round(n / 1e6)) + " MB" : Math.max(1, Math.round(n / 1e3)) + " KB");

// The WebDAV place: which server (or Add a server…), where you are in it,
// its folders, its books.
function webdavDraw() {
  if (state.place !== "webdav") return;
  const root = $("webdav");
  const s = wdNow();
  if (!s) {
    wdHead = null;
    fill(root, el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("No servers yet")),
      el("p", { class: "empty-text" }, t("A folder of books on Nextcloud, a NAS or any WebDAV server. A password stays on this device.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addWebdav") }, t("Add a server"))));
    return;
  }
  // One that came by sync has its username but not the password, which
  // never leaves the device it was typed on.
  if (s.user && !s.pass) {
    wdHead = null;
    fill(root, el("div", { class: "dz-body" }, el("div", { class: "dz-tools" }, webdavPick(s)),
      el("div", { class: "empty" },
        el("h2", { class: "empty-title" }, t("Type the password for {title}", { title: s.title })),
        el("p", { class: "empty-text" }, t("Servers sync without their passwords, so each device asks once.")),
        el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addWebdav", s) }, t("Type the password")))));
    return;
  }
  if (wd.key !== s.id + " " + s.url) {
    Object.assign(wd, { key: s.id + " " + s.url, stack: [{ url: s.url, title: s.title }], folders: [], books: [], busy: false, error: "" });
    setTimeout(() => webdavLoad(s), 0);
  }
  if (!wdHead) wdHead = webdavSearchHead();
  const q = wdHead.querySelector("input").value.trim().toLowerCase();
  const at = wd.stack[wd.stack.length - 1];
  const up = wd.stack.length > 1 ? wd.stack[wd.stack.length - 2] : null;
  const folders = wd.folders.filter((f) => !q || f.name.toLowerCase().includes(q));
  const books = wd.books.filter((b) => !q || b.name.toLowerCase().includes(q));
  const line = wd.busy ? t("Reading {site}…", { site: at.title }) : wd.error;
  const body = [
    el("div", { class: "dz-tools" }, webdavPick(s)),
    up ? el("div", { class: "section-head wide cat-where" },
      el("button", { class: "btn-text cat-up", type: "button", "aria-label": t("Back to {title}", { title: up.title }), onclick: () => webdavUp(s) }, "‹ " + up.title),
      el("h2", { class: "overline", dir: "auto" }, at.title)) : null,
    folders.length ? el("div", { class: "group cat-folders" }, ...folders.map((f) => el("button", { class: "row nav-row", type: "button", onclick: () => webdavOpen(s, f) },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, f.name)),
      el("span", { class: "row-chev", "aria-hidden": "true" }, "›")))) : null,
    books.length ? el("div", { class: "dz-covers dz-grid", role: "list" }, ...books.map((b) => webdavBook(s, b))) : null,
    line ? el("p", { class: "footnote dz-src" + (wd.error && !wd.busy ? " warn" : "") }, line) : null,
    wd.error && !wd.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => webdavLoad(s) }, t("Try again")) : null,
    !wd.busy && !wd.error && !folders.length && !books.length ? el("p", { class: "empty-text dz-none" }, q ? t("Nothing here matches that.") : t("No books or folders here.")) : null,
  ];
  if (wdHead.parentNode !== root) root.replaceChildren(wdHead, el("div", { class: "dz-body" }));
  fill(root.querySelector(".dz-body"), ...body.filter(Boolean));
}

// A book's sheet: its name, kind and size, then Add to your Library (or
// Open it, once it's there).
function webdavSheet() {
  const { server: s, book: b } = state.menu.page;
  const had = webdavHas(b);
  const title = webdavTitle(b);
  const art = el("span", { class: "dz-cover dz-sheet-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, title));
  C.webdav.cover(s, b).then((url) => { if (url) { art.prepend(el("img", { src: url, alt: "" })); art.classList.add("has-img"); } });
  const when = b.modified ? new Date(b.modified).toLocaleDateString(i18n.lang, { year: "numeric", month: "short", day: "numeric" }) : "";
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, art,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, title),
        el("p", { class: "meta", dir: "auto" }, b.name),
        el("p", { class: "meta" }, [C.webdav.KINDS[b.kind], b.size ? webdavSize(b.size) : "", when].filter(Boolean).join(" · ")))),
    el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); webdavAdd(s, b); } }, had ? t("Open it") : t("Add to your Library")),
    el("p", { class: "footnote" }, had ? t("It's in your library already.") : t("It downloads from {title} into your Library, to read offline.", { title: s.title })));
}
MENUS.webdavBook = { label: t("Book"), build: () => webdavSheet() };

// Add a server, or change or remove one (`state.menu.page`).
function webdavServerSheet() {
  const had = state.menu && state.menu.page && state.menu.page.id ? state.menu.page : null;
  const field = (attrs) => el("input", { class: "feed-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false", ...attrs });
  const addr = field({ type: "url", inputmode: "url", placeholder: t("Folder address (WebDAV)"), "aria-label": t("Folder address (WebDAV)"), enterkeyhint: "go" });
  const user = field({ type: "text", placeholder: t("Username"), "aria-label": t("Username") });
  const pass = field({ type: "password", placeholder: t("Password"), "aria-label": t("Password"), autocomplete: "new-password" });
  if (had) { addr.value = had.url; user.value = had.user; pass.value = had.pass; }
  const help = el("p", { class: "footnote" }, t("On Nextcloud it's under Files › Settings › WebDAV, and an app password is safer than your own. A password stays on this device."));
  const label = had ? t("Save") : t("Add the server");
  const go = el("button", { class: "btn-primary", type: "button" }, label);
  const add = async () => {
    let url = addr.value.trim();
    if (!url) { addr.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = (C.webdav.home("http://" + url) ? "http://" : "https://") + url;
    url = C.webdav.folderUrl(url);
    if (!url) { help.className = "footnote warn"; help.textContent = webdavWhy(new C.webdav.DavError("not webdav")); return; }
    const s = { id: had ? had.id : "", url, user: user.value.trim(), pass: pass.value };
    go.disabled = true;
    go.textContent = t("Reading the folder…");
    try {
      await C.webdav.read(s, url);
      const kept = had ? { ...s, title: had.title } : C.webdav.add(s);
      if (had) C.webdav.update(kept);
      wd.key = "";
      await back();
      if (!had) {
        wdPick = kept.id;
        store("waypage.webdav.pick", kept.id);
        await goPlace("webdav");
        toast(t("Added {title}", { title: kept.title }));
      }
    } catch (e) {
      help.className = "footnote warn";
      help.textContent = webdavWhy(e);
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
    C.webdav.remove(had.id);
  } }, t("Remove this server")) : null;
  return el("div", { class: "page-controls add-feed add-catalog" },
    el("h2", { class: "menu-title" }, had ? had.title : t("Add a server")),
    el("div", { class: "feed-field" }, addr, user, pass, help), go, drop);
}
MENUS.addWebdav = { label: t("Add a server"), build: () => webdavServerSheet() };

// The extension's page in Settings: each server (a tap changes or removes
// it), then Add a server under Actions.
EXT_PAGES.webdav = () => {
  const all = C.webdav.list();
  return [
    all.length ? section(t("Your servers"), null, el("div", { class: "group" },
      ...all.map((s) => navRow(s.title, C.webdav.host(s.url) + (s.user ? " · " + (s.pass ? t("Signed in") : t("Needs its password")) : ""), () => openMenu("addWebdav", s))))) : null,
    section(t("Actions"), null, el("div", { class: "group" }, navRow(t("Add a server"), null, () => openMenu("addWebdav")))),
  ].filter(Boolean);
};

C.webdav.changed(() => {
  wd.key = "";
  if (state.section === "webdav") renderSection();
  webdavDraw();
  if (sideShown()) renderSide();
});
webdavDraw();
