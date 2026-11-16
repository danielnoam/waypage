// Waypage: Audiobookshelf servers (the Audiobookshelf extension, 2026-11).
// Audiobookshelf is a server people run at home for their audiobooks. Its
// books stream into Waypage's audiobook player, and where you are goes back
// to the server, so its own app and Waypage agree.
//
// Signing in sends the password once (POST /login) and keeps the two
// tokens the server gives back, on this device only: an access token (an
// hour) and a refresh token (30 days, renewed with each use). The password
// is never kept. Sync carries the server list (address, name, username)
// but never a token, so another device signs in once. Nothing goes through
// the fetch proxy. Streams use the play session's own address
// (/public/session/<id>/track/<n>), which needs no token, so no token is
// ever in a URL the player or the server's log sees.
//
//   list()                       the servers: [{ id, title, url, user, signed }]
//   add(s) / update(s) / remove(id)
//   login(s, pass)               signs in; resolves to the server as kept
//   signOut(id)                  forgets this device's tokens (and tells the server)
//   libraries(s)                 [{ id, name }] of the book libraries
//   books(s, lib, { page, sort })   { books, total }
//   search(s, lib, words)        books
//   going(s)                     books in progress, newest first
//   places(s)                    Map of item id -> { t, at, done, progress, hide }: your place in each
//   book(s, id)                  one book with its chapters and your place
//   play(s, id)                  opens a play session: { session, tracks, chapters, dur, t }
//   heard(s, session, o)         where you are, to an open session; false when it's gone
//   close(s, session, o)
//   place(s, id) / setPlace(s, id, o)   your place without a session
//   cover(s, id)                 a cover's address (covers need no login)
//   changed(fn)
//   shared() / mergeIn(doc)      the list as sync sends it (no tokens), and one taken in
(function () {
  const C = (window.Waypage = window.Waypage || {});
  const KEY = "waypage.abs";
  const GONE = "waypage.abs.gone";
  const DEVICE = "waypage.abs.device";
  const MIMES = ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/x-m4b", "audio/aac", "audio/ogg", "audio/opus", "audio/flac", "audio/wav", "audio/webm"];

  class AbsError extends Error {}
  const read$ = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  const write$ = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full: it stays as it was */ } };
  const all$ = () => { const v = read$(KEY, []); return Array.isArray(v) ? v : []; };
  const gone$ = () => { const v = read$(GONE, {}); return v && typeof v === "object" ? v : {}; };
  const watchers = [];
  const changed = (fn) => { watchers.push(fn); };
  const tell = () => { for (const fn of watchers) { try { fn(); } catch (e) { console.error(e); } } };

  const trim = (u) => String(u || "").trim().replace(/\/+$/, "");
  function host(u) { try { return new URL(u).host.replace(/^www\./, ""); } catch (e) { return String(u || ""); } }
  const clean = (s) => ({ id: s.id || "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(s.title || "").trim().slice(0, 80) || host(s.url),
    url: trim(s.url), user: String(s.user || "").trim().slice(0, 200), at: Number(s.at) || Date.now(),
    token: String(s.token || ""), refresh: String(s.refresh || "") });
  const out = (s) => ({ id: s.id, title: s.title, url: s.url, user: s.user, signed: !!(s.token || s.refresh) });
  const list = () => all$().map(out);
  const mine = (id) => all$().find((s) => s.id === id) || null;
  function add(s) { const x = clean({ ...s, at: Date.now() }); write$(KEY, [...all$(), x]); tell(); return out(x); }
  // Tokens are the server's to change (login, refresh, signOut), never a caller's.
  function update(s) { write$(KEY, all$().map((x) => (x.id === s.id ? clean({ ...x, title: s.title != null ? s.title : x.title, url: s.url || x.url, user: s.user != null ? s.user : x.user, at: Date.now() }) : x))); tell(); }
  const keepTokens = (id, token, refresh) => write$(KEY, all$().map((x) => (x.id === id ? { ...x, token: token || "", refresh: refresh || "" } : x)));
  function remove(id) {
    const s = mine(id);
    if (s && s.refresh) logout(s).catch(() => {});
    write$(KEY, all$().filter((x) => x.id !== id));
    write$(GONE, { ...gone$(), [id]: Date.now() });
    tell();
  }

  // What sync sends: every server but its tokens, and those removed.
  const shared = () => ({ v: 1, list: all$().map(({ token, refresh, ...s }) => s), gone: gone$() });
  // Another device's list: the newer of each wins, tokens here stay here
  // (for the same address and user), one removed anywhere goes.
  function mergeIn(doc) {
    if (!doc || !Array.isArray(doc.list)) return false;
    const gone = { ...gone$() };
    for (const [id, at] of Object.entries(doc.gone || {})) if (typeof at === "number" && !(gone[id] >= at)) gone[id] = at;
    const here = new Map(all$().map((s) => [s.id, s]));
    for (const r of doc.list) {
      if (!r || !r.id || !/^https?:\/\//i.test(r.url || "")) continue;
      const at = Number(r.at) || 0, had = here.get(r.id);
      const same = had && had.user === r.user && trim(had.url) === trim(r.url);
      if (!had) here.set(r.id, clean({ ...r, token: "", refresh: "", at }));
      else if (at > (had.at || 0)) here.set(r.id, clean({ ...r, token: same ? had.token : "", refresh: same ? had.refresh : "", at }));
    }
    for (const [id, at] of Object.entries(gone)) { const s = here.get(id); if (s && (s.at || 0) <= at) here.delete(id); }
    const before = JSON.stringify(all$());
    const next = [...here.values()];
    write$(GONE, gone);
    if (JSON.stringify(next) === before) return false;
    write$(KEY, next);
    tell();
    return true;
  }

  // This device as the server's sessions list names it.
  function device() {
    let id = read$(DEVICE, "");
    if (!id) { id = "waypage-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); write$(DEVICE, id); }
    const P = C.platform || {};
    return { deviceId: id, clientName: "Waypage", clientVersion: String((C.version) || ""), manufacturer: P.android ? "Android" : P.ios ? "Apple" : "", model: P.native ? "" : "Browser" };
  }

  // ---- Talking to the server ----
  // The phone asks natively (no CORS). A browser asks the server straight,
  // never through the fetch proxy (a token never leaves for a third
  // party); that works only where the server lists the web copy under
  // Settings › Allowed origins (CORS).
  async function ask(s, path, o = {}) {
    let res;
    try { res = await C.platform.request(s.url + path, { method: o.method || "GET", headers: { Accept: "application/json", ...(o.headers || {}) }, body: o.body }); }
    catch (e) { throw new AbsError(C.platform.native ? "offline" : "browser"); }
    let data = null;
    try { data = res.text ? JSON.parse(res.text) : null; } catch (e) { data = null; }
    return { status: res.status, data };
  }
  const bearer = (s) => ({ Authorization: "Bearer " + s.token });
  // One refresh at a time per server: the server retires a refresh token
  // as it hands out the next one.
  const renewing = new Map();
  function renew(s) {
    if (!renewing.has(s.id)) {
      renewing.set(s.id, (async () => {
        const r = await ask(s, "/auth/refresh", { method: "POST", headers: { "x-refresh-token": s.refresh } });
        const u = r.data && r.data.user;
        if (r.status !== 200 || !u || !u.accessToken) {
          if (r.status === 401 || r.status === 403) { keepTokens(s.id, "", ""); tell(); throw new AbsError("login"); }
          throw new AbsError("HTTP " + r.status);
        }
        keepTokens(s.id, u.accessToken, u.refreshToken || s.refresh);
        return mine(s.id);
      })().finally(() => renewing.delete(s.id)));
    }
    return renewing.get(s.id);
  }
  // The server's answer to an API call as JSON; an expired access token is
  // renewed once and the call asked again.
  async function api(sv, path, o = {}) {
    let s = mine(sv.id) || sv;
    if (!s.token && !s.refresh) throw new AbsError("login");
    if (!s.token) s = await renew(s);
    let r = await ask(s, path, { ...o, headers: { ...bearer(s), ...(o.headers || {}) } });
    if (r.status === 401 && s.refresh) {
      s = await renew(s);
      r = await ask(s, path, { ...o, headers: { ...bearer(s), ...(o.headers || {}) } });
    }
    if (r.status === 401 || r.status === 403) throw new AbsError(r.status === 401 ? "login" : "forbidden");
    if (r.status === 404) throw new AbsError("gone");
    if (r.status < 200 || r.status >= 300) throw new AbsError("HTTP " + r.status);
    return r.data;
  }

  async function login(sv, pass) {
    const s = mine(sv.id) || clean(sv);
    const r = await ask(s, "/login", { method: "POST", headers: { "Content-Type": "application/json", "x-return-tokens": "true" }, body: JSON.stringify({ username: s.user, password: String(pass || "") }) });
    if (r.status === 401 || r.status === 400) throw new AbsError("password");
    if (r.status === 429) throw new AbsError("busy");
    const u = r.data && r.data.user;
    if (r.status !== 200 || !u) throw new AbsError(r.status === 200 || r.status === 404 ? "not abs" : "HTTP " + r.status);
    // A server older than 2.26 gives only its lasting token.
    const token = u.accessToken || u.token || "", refresh = u.refreshToken || "";
    if (!token) throw new AbsError("not abs");
    const title = (r.data.serverSettings && r.data.serverSettings.title) || "";
    if (!mine(s.id)) write$(KEY, [...all$(), clean({ ...s, title: s.title || title, at: Date.now() })]);
    keepTokens(s.id, token, refresh);
    tell();
    return { ...out(mine(s.id)), library: r.data.userDefaultLibraryId || "" };
  }
  async function logout(s) {
    if (!s.refresh) return;
    await ask(s, "/logout", { method: "POST", headers: { "x-refresh-token": s.refresh } }).catch(() => {});
  }
  async function signOut(id) {
    const s = mine(id);
    if (!s) return;
    await logout(s);
    keepTokens(id, "", "");
    tell();
  }

  // ---- Books ----
  const text = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  const plain = (html) => text(new DOMParser().parseFromString("<body>" + String(html || ""), "text/html").body.textContent, 1200);
  const names = (list, key) => (Array.isArray(list) ? list.map((x) => (typeof x === "string" ? x : x && x.name)).filter(Boolean) : []);
  // A library item as Waypage shows it, from the full or the minified shape.
  function bookOf(s, li) {
    const media = (li && li.media) || {}, m = media.metadata || {};
    const by = m.authorName || names(m.authors).join(", ");
    const series = m.seriesName || names(m.series).join(", ");
    const p = li.userMediaProgress || li.mediaProgress || null;
    return {
      id: String(li.id), lib: String(li.libraryId || ""), server: s.id, title: text(m.title, 300) || "Audiobook", by: text(by, 200),
      narrator: text(m.narratorName || names(m.narrators).join(", "), 200), series: text(series, 200),
      about: plain(m.description), year: text(m.publishedYear, 8), lang: text(m.language, 20),
      dur: Number(media.duration) || 0, tracks: Number(media.numTracks) || (media.tracks ? media.tracks.length : 0) || (media.audioFiles ? media.audioFiles.length : 0),
      chapters: (media.chapters || []).map((c) => ({ t: Number(c.start) || 0, title: text(c.title, 200) })),
      cover: media.coverPath || li.coverPath ? cover(s, li.id, li.updatedAt) : "",
      ebook: !!(media.ebookFile || media.ebookFormat),
      place: p ? { t: Number(p.currentTime) || 0, at: Number(p.lastUpdate) || 0, done: !!p.isFinished, progress: Number(p.progress) || 0 } : null,
      audio: media.numAudioFiles != null ? media.numAudioFiles > 0 : (media.duration || 0) > 0 || (media.tracks || media.audioFiles || []).length > 0,
    };
  }
  const cover = (s, id, ts) => s.url + "/api/items/" + encodeURIComponent(id) + "/cover?width=400" + (ts ? "&ts=" + encodeURIComponent(ts) : "");

  async function libraries(s) {
    const d = await api(s, "/api/libraries");
    return ((d && d.libraries) || d || []).filter((l) => l && (l.mediaType || "book") === "book").map((l) => ({ id: String(l.id), name: text(l.name, 80) }));
  }
  const SORTS = { added: ["addedAt", 1], title: ["media.metadata.title", 0], author: ["media.metadata.authorName", 0], recent: ["progress", 1] };
  async function books(s, lib, o = {}) {
    const [sort, desc] = SORTS[o.sort] || SORTS.added;
    const q = new URLSearchParams({ limit: String(o.limit || 60), page: String(o.page || 0), sort, desc: String(desc), minified: "1" });
    const d = await api(s, "/api/libraries/" + encodeURIComponent(lib) + "/items?" + q);
    return { books: ((d && d.results) || []).map((li) => bookOf(s, li)).filter((b) => b.audio), total: Number(d && d.total) || 0 };
  }
  async function search(s, lib, words) {
    const d = await api(s, "/api/libraries/" + encodeURIComponent(lib) + "/search?" + new URLSearchParams({ q: String(words || "").trim(), limit: "40" }));
    return ((d && d.book) || []).map((x) => bookOf(s, x.libraryItem || x)).filter((b) => b.audio);
  }
  async function going(s) {
    const d = await api(s, "/api/me/items-in-progress?limit=12");
    return ((d && d.libraryItems) || []).filter((li) => li.mediaType !== "podcast").map((li) => bookOf(s, li)).filter((b) => b.audio);
  }
  // Your place in every book, by item: { t, at, done, progress, hide }.
  async function places(s) {
    const d = await api(s, "/api/me");
    const out = new Map();
    for (const p of (d && d.mediaProgress) || []) {
      if (!p || !p.libraryItemId || p.episodeId) continue;
      out.set(String(p.libraryItemId), { t: Number(p.currentTime) || 0, at: Number(p.lastUpdate) || 0, done: !!p.isFinished, progress: Number(p.progress) || 0, hide: !!p.hideFromContinueListening });
    }
    return out;
  }
  async function book(s, id) {
    return bookOf(s, await api(s, "/api/items/" + encodeURIComponent(id) + "?expanded=1&include=progress"));
  }

  // ---- Listening ----
  // A play session: the server's tracks in order, each streamed from the
  // session's own address while it is open (the server closes one after
  // 36 hours without news, or when this device opens another).
  async function play(s, id) {
    const d = await api(s, "/api/items/" + encodeURIComponent(id) + "/play", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceInfo: device(), forceDirectPlay: true, forceTranscode: false, mediaPlayer: "waypage", supportedMimeTypes: MIMES }) });
    if (!d || !d.id || !Array.isArray(d.audioTracks) || !d.audioTracks.length) throw new AbsError("no audio");
    const base = (mine(s.id) || s).url;
    const tracks = d.audioTracks.slice().sort((a, b) => (a.startOffset || 0) - (b.startOffset || 0)).map((tr, i) => ({
      url: base + "/public/session/" + encodeURIComponent(d.id) + "/track/" + encodeURIComponent(tr.index != null ? tr.index : i + 1),
      dur: Number(tr.duration) || 0, start: Number(tr.startOffset) || 0, name: text(tr.title || (tr.metadata && tr.metadata.filename), 200), mime: tr.mimeType || "",
    }));
    return { session: d.id, tracks, chapters: (d.chapters || []).map((c) => ({ t: Number(c.start) || 0, title: text(c.title, 200) })),
      dur: Number(d.duration) || tracks.reduce((n, x) => n + x.dur, 0), t: Number(d.currentTime) || 0 };
  }
  const syncBody = (o) => JSON.stringify({ currentTime: Math.max(0, Number(o.t) || 0), timeListened: Math.max(0, Math.round(Number(o.listened) || 0)), duration: Number(o.dur) || 0 });
  async function heard(s, session, o) {
    try { await api(s, "/api/session/" + encodeURIComponent(session) + "/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: syncBody(o) }); return true; }
    catch (e) { if (e instanceof AbsError && e.message === "gone") return false; throw e; }
  }
  async function close(s, session, o) {
    try { await api(s, "/api/session/" + encodeURIComponent(session) + "/close", { method: "POST", headers: { "Content-Type": "application/json" }, body: o ? syncBody(o) : "{}" }); }
    catch (e) { if (!(e instanceof AbsError && e.message === "gone")) throw e; }
  }
  async function place(s, id) {
    try {
      const p = await api(s, "/api/me/progress/" + encodeURIComponent(id));
      return p ? { t: Number(p.currentTime) || 0, at: Number(p.lastUpdate) || 0, done: !!p.isFinished } : null;
    } catch (e) { if (e instanceof AbsError && e.message === "gone") return null; throw e; }
  }
  async function setPlace(s, id, o) {
    const dur = Number(o.dur) || 0, t = Math.max(0, Number(o.t) || 0);
    await api(s, "/api/me/progress/" + encodeURIComponent(id), { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentTime: t, duration: dur, progress: dur ? Math.min(1, t / dur) : 0, ...(o.done != null ? { isFinished: !!o.done } : {}) }) });
  }

  C.abs = { list, add, update, remove, login, signOut, libraries, books, search, going, places, book, play, heard, close, place, setPlace, cover, changed, shared, mergeIn, host, AbsError,
    get: (id) => { const s = mine(id); return s ? out(s) : null; } };
})();
