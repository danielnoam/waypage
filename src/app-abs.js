// Waypage: the Audiobookshelf extension's place (2026-11). Your
// Audiobookshelf server (src/abs.js) in the sidebar: what you're listening
// to, then every audiobook as covers, its own search. Play adds the book to
// the Library as an audiobook that streams (`remote` on the entry, no file
// on the phone) and plays it in Waypage's own player, read-along and all;
// where you are goes back to the server. Its page in Settings ›
// Extensions lists the servers. Shell file, loaded only once the
// extension is on (src/extensions.js).

const ab = { key: "", places: new Map(), libs: null, lib: load("waypage.abs.lib", ""), sort: load("waypage.abs.sort", "added"), books: [], total: 0, page: 0, going: [], busy: false, error: "", found: null };
let abPick = load("waypage.abs.pick", "");
let abHead = null, abRun = 0;
const absNow = () => C.abs.list().find((s) => s.id === abPick) || C.abs.list()[0] || null;

function absWhy(e) {
  const m = (e && e.message) || "";
  if (m === "password") return t("The username or password isn't right.");
  if (m === "login") return t("Audiobookshelf asks you to sign in again.");
  if (m === "browser") return t("This browser can't reach your server. It works in Waypage on your phone.");
  if (m === "not abs") return t("That address isn't an Audiobookshelf server.");
  if (m === "busy") return t("Too many tries. Wait a few minutes, then try again.");
  if (m === "forbidden") return t("Your Audiobookshelf user can't open that.");
  if (m === "gone") return t("Audiobookshelf doesn't have that book any more.");
  if (m === "no audio") return t("That book has no sound to play.");
  return t("Couldn't reach your server. Check your connection and try again.");
}
const absLost = (e) => e instanceof C.abs.AbsError && e.message === "login";

// ---- Reading the server ----

async function absLibraries(s) {
  if (ab.libs && ab.key === s.id) return ab.libs;
  ab.libs = await C.abs.libraries(s);
  if (!ab.libs.some((l) => l.id === ab.lib)) ab.lib = (ab.libs[0] || {}).id || "";
  return ab.libs;
}
async function absLoad(s, more) {
  const mine = ++abRun;
  if (!more) Object.assign(ab, { books: [], total: 0, page: 0 });
  ab.busy = true;
  ab.error = "";
  ab.lost = false;
  absDraw();
  try {
    await absLibraries(s);
    if (!ab.lib) throw new C.abs.AbsError("no library");
    const [got, going, places] = await Promise.all([C.abs.books(s, ab.lib, { page: more ? ab.page + 1 : 0, sort: ab.sort }),
      more ? null : C.abs.going(s).catch(() => []), more ? ab.places : C.abs.places(s).catch(() => new Map())]);
    if (abRun !== mine) return;
    if (more) ab.page += 1;
    ab.places = places;
    const placed = (b) => ({ ...b, place: places.get(b.id) || b.place });
    const seen = new Set(ab.books.map((b) => b.id));
    ab.books.push(...got.books.filter((b) => !seen.has(b.id)).map(placed));
    ab.total = got.total;
    if (going) ab.going = going.filter((b) => (b.lib === ab.lib || !b.lib)).map(placed).filter((b) => !(b.place && (b.place.hide || b.place.done)));
  } catch (e) {
    if (abRun !== mine) return;
    ab.error = e.message === "no library" ? t("There are no audiobook libraries on this server.") : absWhy(e);
    ab.lost = absLost(e);
  }
  ab.busy = false;
  absDraw();
}
async function absSearch(s, words) {
  const f = ab.found = { words, books: [], busy: true, error: "" };
  absDraw();
  try { f.books = (await C.abs.search(s, ab.lib, words)).map((b) => ({ ...b, place: (ab.places && ab.places.get(b.id)) || b.place })); } catch (e) { f.error = absWhy(e); }
  f.busy = false;
  if (ab.found === f) absDraw();
}

// ---- The place ----

// A book that's in the Library already, streaming from this server.
const absHas = (b) => state.pages.find((p) => p.remote && p.remote.kind === "audiobookshelf" && p.remote.server === b.server && p.remote.item === b.id) || null;

function absSearchHead() {
  const input = el("input", { type: "search", "aria-label": t("Search Audiobookshelf"), autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  input.addEventListener("input", () => { if (!input.value.trim()) { ab.found = null; absDraw(); } });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || !input.value.trim()) return;
    e.preventDefault();
    input.blur();
    const s = absNow();
    if (s && ab.lib) absSearch(s, input.value.trim());
  });
  const box = el("div", { class: "search dz-search", role: "search" }, input);
  box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
  return el("div", { class: "dz-head" }, box);
}

const absShare = (b) => (b.place && b.dur ? (b.place.done ? 1 : Math.min(1, b.place.t / b.dur)) : 0);
function absBook(b) {
  const had = absHas(b);
  const art = el("span", { class: "dz-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, b.title));
  if (b.cover) {
    const img = el("img", { src: b.cover, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => art.classList.add("has-img"));
    img.addEventListener("error", () => dzCoverAgain(img, b));
    art.prepend(img);
  }
  const share = absShare(b);
  const meta = [b.by, b.dur ? L.lengthText(b.dur) : ""].filter(Boolean).join(" · ");
  return el("button", { class: "dz-book", type: "button", role: "listitem", "data-key": "abs:" + b.id,
    "aria-label": had ? t("{title}, in your library", { title: b.title }) : b.title, onclick: () => openMenu("absBook", b) },
    el("span", { class: "dz-art" }, art, had ? el("span", { class: "dz-mark on" }, dzIcon("check", 16)) : null,
      share > 0.01 ? el("span", { class: "abs-bar", "aria-hidden": "true" }, el("span", { style: "inline-size:" + Math.round(share * 100) + "%" })) : null),
    el("span", { class: "dz-bt", dir: "auto" }, b.title),
    meta ? el("span", { class: "dz-bm", dir: "auto" }, meta) : null);
}
const absCovers = (list) => el("div", { class: "dz-covers dz-grid", role: "list" }, ...list.map(absBook));

const AB_SORTS = [["added", t("Recently added")], ["title", t("Title")], ["author", t("Author")]];
function absPickers(s, input) {
  const servers = C.abs.list();
  const server = servers.length > 1 ? dropdown({ label: t("Server"), cls: "field-pick dz-pick", value: s.id,
    options: servers.map((x) => ({ value: x.id, label: x.title })),
    onpick: (v) => { abPick = v; store("waypage.abs.pick", v); ab.key = ""; ab.libs = null; if (input) input.value = ""; absDraw(); } }) : null;
  const libs = ab.libs || [];
  const lib = libs.length > 1 ? dropdown({ label: t("Library"), cls: "field-pick dz-pick", value: ab.lib,
    options: libs.map((l) => ({ value: l.id, label: l.name })),
    onpick: (v) => { ab.lib = v; store("waypage.abs.lib", v); ab.found = null; if (input) input.value = ""; absLoad(s); } }) : null;
  const sort = dropdown({ label: t("Sort"), cls: "field-pick dz-pick", value: ab.sort, options: AB_SORTS.map(([v, l]) => ({ value: v, label: l })),
    onpick: (v) => { ab.sort = v; store("waypage.abs.sort", v); absLoad(s); } });
  return el("div", { class: "dz-tools" }, server, lib, sort);
}

function absDraw() {
  if (state.place !== "audiobookshelf") return;
  const root = $("audiobookshelf");
  const s = absNow();
  if (!s) {
    abHead = null;
    fill(root, el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("Sign in to Audiobookshelf")),
      el("p", { class: "empty-text" }, t("Your own Audiobookshelf server. Its audiobooks stream here, and where you are goes back to it. The password isn't kept.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("absServer") }, t("Sign in"))));
    return;
  }
  // One that came by sync, or whose sign-in ran out, signs in here.
  if (!s.signed) {
    abHead = null;
    fill(root, el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("Sign in to {title}", { title: s.title })),
      el("p", { class: "empty-text" }, t("Each device signs in once. The password isn't kept.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("absServer", s) }, t("Sign in"))));
    return;
  }
  if (ab.key !== s.id) {
    Object.assign(ab, { key: s.id, libs: null, books: [], going: [], total: 0, page: 0, busy: false, error: "", found: null });
    setTimeout(() => absLoad(s), 0);
  }
  if (!abHead) abHead = absSearchHead();
  const input = abHead.querySelector("input");
  input.placeholder = t("Search {label}", { label: s.title });
  let body;
  if (ab.found) {
    const f = ab.found;
    body = [sectionHead(t("Results for “{words}”", { words: f.words }), el("button", { class: "btn-text", type: "button", onclick: () => { ab.found = null; input.value = ""; absDraw(); } }, t("Clear"))),
      f.busy ? el("p", { class: "footnote dz-src" }, t("Searching {label}…", { label: s.title }))
        : f.books.length ? absCovers(f.books) : el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || t("Nothing here matches that."))];
  } else {
    const line = ab.busy ? (ab.books.length ? t("Reading more…") : t("Reading {site}…", { site: s.title })) : ab.error;
    const going = ab.going.filter((b) => !b.place || !b.place.done);
    body = [
      going.length ? sectionHead(t("Continue listening")) : null,
      going.length ? absCovers(going) : null,
      going.length && ab.books.length ? sectionHead(t("Audiobooks")) : null,
      ab.books.length ? absCovers(ab.books) : null,
      line ? el("p", { class: "footnote dz-src" + (ab.error && !ab.busy ? " warn" : "") }, line) : null,
      ab.error && !ab.busy ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => (ab.lost ? openMenu("absServer", s) : absLoad(s)) }, ab.lost ? t("Sign in") : t("Try again")) : null,
      !ab.busy && !ab.error && ab.books.length < ab.total ? el("button", { class: "btn-quiet dz-more", type: "button", onclick: () => absLoad(s, true) }, t("More audiobooks")) : null,
      !ab.busy && !ab.error && !ab.books.length ? el("p", { class: "empty-text dz-none" }, t("This library has no audiobooks yet.")) : null,
      ab.total ? el("p", { class: "footnote dz-foot" }, tn(ab.total, "1 audiobook on {name}", "{n} audiobooks on {name}", { name: s.title })) : null,
    ];
  }
  if (abHead.parentNode !== root) root.replaceChildren(abHead, el("div", { class: "dz-body" }));
  fill(root.querySelector(".dz-body"), absPickers(s, input), ...body.filter(Boolean));
}

// ---- A book's sheet ----

function absSheet() {
  const b = state.menu.page;
  const had = absHas(b);
  const s = C.abs.get(b.server);
  const art = el("span", { class: "dz-cover dz-sheet-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, b.title));
  if (b.cover) {
    const img = el("img", { src: b.cover, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => art.classList.add("has-img"));
    img.addEventListener("error", () => dzCoverAgain(img, b));
    art.prepend(img);
  }
  const share = absShare(b);
  const where = b.place && b.place.done ? t("Finished") : share > 0.01 ? t("{n}% heard", { n: Math.round(share * 100) }) : "";
  const facts = [b.dur ? L.lengthText(b.dur) : "", b.chapters.length > 1 ? tn(b.chapters.length, "1 chapter", "{n} chapters") : "", where].filter(Boolean).join(" · ");
  const play = el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); absPlay(b); } },
    share > 0.01 && !(b.place && b.place.done) ? t("Go on listening") : t("Play"));
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, art,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, b.title),
        b.by ? el("p", { class: "meta", dir: "auto" }, b.by) : null,
        b.narrator ? el("p", { class: "meta", dir: "auto" }, t("Read by {name}", { name: b.narrator })) : null,
        b.series ? el("p", { class: "meta", dir: "auto" }, b.series) : null,
        facts ? el("p", { class: "meta" }, facts) : null)),
    b.about ? el("p", { class: "dz-blurb", dir: "auto" }, b.about.slice(0, 600)) : null,
    play,
    el("p", { class: "footnote" }, had ? t("It's in your library already. It streams from your server, so it needs a connection to it.")
      : t("It joins your Library as an audiobook that streams from your server, so it needs a connection to it. Where you are goes back to Audiobookshelf.")),
    s ? el("button", { class: "btn-quiet", type: "button", onclick: () => C.platform.openOutside(s.url + "/item/" + encodeURIComponent(b.id)) }, dzIcon("out", 16), t("Open on {site}", { site: s.title })) : null);
}
MENUS.absBook = { label: t("Audiobook"), build: () => absSheet() };

// A cover's bytes for the Library's thumbnail (covers need no login).
async function absCoverBytes(url) {
  try {
    const blob = C.platform.native ? (await C.platform.fetchBytes(url, "abs-cover.jpg")).blob : await (await fetch(url, { credentials: "omit" })).blob();
    return blob && blob.size ? new Uint8Array(await blob.arrayBuffer()) : null;
  } catch (e) { return null; }
}

// Play: the book's entry in the Library (made the first time), opened,
// and playing from where you are on any device.
async function absPlay(b) {
  let a = absHas(b);
  if (!a) {
    const s = C.abs.get(b.server);
    if (!s) return;
    toast(t("Adding “{title}”…", { title: b.title }));
    let full = b;
    try { full = await C.abs.book(s, b.id); } catch (e) { toast(absWhy(e)); if (absLost(e)) openMenu("absServer", s); return; }
    const cover = full.cover ? await absCoverBytes(full.cover) : null;
    const link = "abs:" + s.id + ":" + b.id;
    a = await newAudiobook({
      title: full.title, byline: full.by,
      file: { name: full.title.slice(0, 200), kind: "audio", ext: "m4b", size: 0, fp: link }, link,
      audio: { parts: [{ name: full.title.slice(0, 200), size: 0, dur: full.dur || 1 }], chapters: full.chapters, dur: full.dur || 1 },
    }, cover);
    a.site = s.title;
    a.url = s.url + "/item/" + encodeURIComponent(b.id);
    a.remote = { kind: "audiobookshelf", server: s.id, item: b.id };
    if (full.lang) a.lang = full.lang.slice(0, 2).toLowerCase();
    if (full.place) a.listen = { ...a.listen, t: full.place.t, tAt: full.place.at || 0 };
    outsideKnown(a);
    state.pages.unshift(a);
    await C.store.writeIndex(state.pages);
    await loadThumbs();
    renderLibrary();
    absDraw();
  }
  await openPage(a.id);
  listenPlay(a);
}

// ---- Streaming (app-listen.js asks through REMOTE_AUDIO) ----

// The play session open now: one at a time, for the book playing.
let abSession = null;
async function absOpen(a, adopt) {
  const s = C.abs.get(a.remote.server);
  if (!s) throw new Error(t("This book's Audiobookshelf server isn't in Waypage any more. Add it in Settings › Extensions › Audiobookshelf."));
  if (!s.signed) { openMenu("absServer", s); throw new Error(t("Sign in to {title} to play this.", { title: s.title })); }
  const live = abSession && abSession.key === a.id && Date.now() - abSession.opened < 6 * 36e5;
  if (live && !adopt) return abSession.urls;
  if (abSession) await absDone(state.pages.find((p) => p.id === abSession.key) || null);
  let got, there = null;
  try {
    [got, there] = await Promise.all([C.abs.play(s, a.remote.item), adopt ? C.abs.place(s, a.remote.item).catch(() => null) : null]);
  } catch (e) {
    if (absLost(e)) openMenu("absServer", s);
    throw new Error(absWhy(e));
  }
  // The server's tracks are the parts; its chapters the chapters.
  a.audio = { ...a.audio, parts: got.tracks.map((x) => ({ name: x.name || a.title, size: 0, dur: x.dur })), dur: got.dur || a.audio.dur };
  if (got.chapters.length) a.audio.chapters = got.chapters;
  // Listened to somewhere else since: on from there.
  if (there && there.at > ((a.listen && a.listen.tAt) || 0) + 2000 && !there.done) a.listen = { ...(a.listen || {}), t: there.t, tAt: there.at };
  abSession = { key: a.id, server: s.id, item: a.remote.item, id: got.session, urls: got.tracks.map((x) => x.url), opened: Date.now(), seen: Date.now(), heard: 0, sent: Date.now() };
  C.store.writeIndexOnly(state.pages);
  return abSession.urls;
}
// Where you are, to the server: every half minute while it plays, and at
// once on a pause or a jump. Offline, it's said with the next one.
function absHeard(a, now) {
  const run = abSession && abSession.key === a.id ? abSession : null;
  const o = { t: placeOf(a), dur: durOf(a), listened: 0 };
  const s = C.abs.get(a.remote.server);
  if (!s || !s.signed) return;
  if (!run) { if (now === true) C.abs.setPlace(s, a.remote.item, o).catch(() => {}); return; }
  const n = Date.now();
  if (lis.key === a.id && lis.state === "playing") run.heard += Math.min(n - run.seen, 30000) / 1000;
  run.seen = n;
  if (now !== true && n - run.sent < 30000) return;
  // Said already, just now (a pause, then Stop).
  if (now === true && run.at === o.t && n - run.sent < 5000) return;
  run.sent = n;
  run.at = o.t;
  o.listened = run.heard;
  run.heard = 0;
  C.abs.heard(s, run.id, o).then((open) => {
    if (open) return;
    // The server closed the session (restarted, or too long away).
    if (abSession === run) abSession = null;
    return C.abs.setPlace(s, a.remote.item, o);
  }).catch(() => { run.heard += o.listened; });
}
async function absDone(a) {
  const run = abSession;
  if (!run || (a && run.key !== a.id)) return;
  abSession = null;
  const s = C.abs.get(run.server);
  const p = a || state.pages.find((x) => x.id === run.key);
  if (!s || !s.signed) return;
  if (lis.key === run.key && lis.state === "playing") run.heard += Math.min(Date.now() - run.seen, 30000) / 1000;
  const o = p ? { t: placeOf(p), dur: durOf(p), listened: run.heard } : null;
  try { await C.abs.close(s, run.id, o); } catch (e) { if (o) C.abs.setPlace(s, run.item, o).catch(() => {}); }
}
REMOTE_AUDIO.audiobookshelf = {
  open: absOpen,
  uri: (a, part) => (abSession && abSession.key === a.id ? abSession.urls[part] || "" : ""),
  heard: absHeard,
  done: (a) => { absDone(a).catch(() => {}); },
};

// ---- Signing in, and the servers ----

// A server at home (an address on the local network) is usually plain http.
const absHome = (url) => { try { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^.]+$|.*\.(local|lan|home|internal)$)/i.test(new URL(url).hostname); } catch (e) { return false; } };
function absServerSheet() {
  const had = state.menu && state.menu.page && state.menu.page.id ? C.abs.get(state.menu.page.id) : null;
  const field = (attrs) => el("input", { class: "feed-input", autocomplete: "off", autocapitalize: "off", spellcheck: "false", ...attrs });
  const addr = field({ type: "url", inputmode: "url", placeholder: t("Server address"), "aria-label": t("Server address"), enterkeyhint: "next" });
  const user = field({ type: "text", placeholder: t("Username"), "aria-label": t("Username"), enterkeyhint: "next" });
  const pass = field({ type: "password", placeholder: t("Password"), "aria-label": t("Password"), autocomplete: "current-password", enterkeyhint: "go" });
  if (had) { addr.value = had.url; user.value = had.user; }
  const help = el("p", { class: "footnote" }, t("The address you open Audiobookshelf at. The password goes to your server once and isn't kept."));
  const label = t("Sign in");
  const go = el("button", { class: "btn-primary", type: "button" }, label);
  const signIn = async () => {
    let url = addr.value.trim();
    if (!url) { addr.focus(); return; }
    if (!user.value.trim()) { user.focus(); return; }
    if (!/^https?:\/\//i.test(url)) url = (absHome("http://" + url) ? "http://" : "https://") + url;
    url = url.replace(/\/+$/, "").replace(/\/login$/i, "");
    go.disabled = true;
    go.textContent = t("Signing in…");
    try {
      const was = had && (had.url !== url || had.user !== user.value.trim());
      if (had && was) C.abs.update({ id: had.id, url, user: user.value.trim(), title: had.title });
      const kept = await C.abs.login({ id: had ? had.id : "", url, user: user.value.trim(), title: had ? had.title : "" }, pass.value);
      pass.value = "";
      ab.key = "";
      if (kept.library && !ab.lib) { ab.lib = kept.library; store("waypage.abs.lib", kept.library); }
      abPick = kept.id;
      store("waypage.abs.pick", kept.id);
      await back();
      if (state.place !== "audiobookshelf") await goPlace("audiobookshelf"); else absDraw();
      toast(t("Signed in to {title}", { title: kept.title }));
    } catch (e) {
      help.className = "footnote warn";
      help.textContent = absWhy(e);
      go.disabled = false;
      go.textContent = label;
    }
  };
  go.addEventListener("click", signIn);
  for (const i of [addr, user, pass]) i.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); signIn(); } });
  setTimeout(() => (had ? pass : addr).focus({ preventScroll: true }), 50);
  const out = had && had.signed ? el("button", { class: "btn-quiet", type: "button", onclick: async () => { await back(); await C.abs.signOut(had.id); toast(t("Signed out")); } }, t("Sign out")) : null;
  const drop = had ? el("button", { class: "btn-quiet", type: "button", onclick: async () => {
    if (!confirm(t("Remove {title}? Its audiobooks in your Library stay there, but can't play until you add it again.", { title: had.title }))) return;
    await back();
    C.abs.remove(had.id);
  } }, t("Remove this server")) : null;
  return el("div", { class: "page-controls add-feed add-catalog" },
    el("h2", { class: "menu-title" }, had ? had.title : t("Sign in to Audiobookshelf")),
    el("div", { class: "feed-field" }, addr, user, pass, help), go, out, drop);
}
MENUS.absServer = { label: t("Audiobookshelf"), build: () => absServerSheet() };

// The extension's page in Settings: each server (a tap signs in again,
// signs out or removes it), then Add a server under Actions.
EXT_PLACES.audiobookshelf = absDraw;
EXT_PAGES.audiobookshelf = () => {
  const list = C.abs.list();
  return [
    list.length ? section(t("Your servers"), null, el("div", { class: "group" },
      ...list.map((s) => navRow(s.title, [C.abs.host(s.url), s.user, s.signed ? t("Signed in") : t("Needs signing in")].filter(Boolean).join(" · "), () => openMenu("absServer", s))))) : null,
    section(t("Actions"), null, el("div", { class: "group" }, navRow(t("Add a server"), null, () => openMenu("absServer")))),
  ].filter(Boolean);
};

C.abs.changed(() => {
  ab.key = "";
  if (state.section === "audiobookshelf") renderSection();
  absDraw();
  if (sideShown()) renderSide();
});
absDraw();
