// Waypage: WebDAV folders (the WebDAV extension, 2026-11). A folder on a
// server the person runs or rents (Nextcloud, ownCloud, a NAS, Koofr), read
// as a plain folder of files: no book software on the server, unlike a
// catalog (src/opds.js). Waypage ships none; the person adds theirs. Sync
// carries the list (address, name, username) but never a password, as
// catalogs do; backups leave them out.
//
//   list()                       the servers: [{ id, title, url, user, pass, at }]
//   add(s) / update(s) / remove(id)
//   changed(fn)                  fn() when the list changes
//   shared() / mergeIn(doc)      the list as sync sends it (no passwords), and one taken in
//   parse(xml, url)              a PROPFIND answer -> { folders, files }, the folder itself left out
//   read(server, url)            one folder, fetched and parsed
//   bytes(server, url, name)     a file, with the server's login
//   cover(server, file)          an image beside the book, as something an <img> shows, or ""
//   kindOf(name)                 the book kind from a file's name, or ""
//   login(server) / host(url) / home(url) / DavError
(function () {
  const C = (window.Waypage = window.Waypage || {});
  const KEY = "waypage.webdav";
  const DAV = "DAV:";
  // What the Library opens, by the file's name.
  const KINDS = { epub: "EPUB", azw3: "AZW3", azw: "MOBI", mobi: "MOBI", prc: "MOBI", fb2: "FB2", cbz: "CBZ", pdf: "PDF", md: "Markdown", markdown: "Markdown",
    txt: "Text", html: "HTML", htm: "HTML", m4b: "Audiobook", mp3: "Audio" };
  const PICTURE = /\.(jpe?g|png|webp)$/i;

  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return String(u || ""); } }
  // A folder's address always ends in /, as servers answer it.
  const folderUrl = (u) => { try { const x = new URL(String(u || "").trim()); if (!/^https?:$/.test(x.protocol)) return ""; x.hash = ""; if (!x.pathname.endsWith("/")) x.pathname += "/"; return x.href; } catch (e) { return ""; } };
  const lastName = (u) => { try { const p = new URL(u).pathname.replace(/\/+$/, "").split("/").pop(); return decodeURIComponent(p || ""); } catch (e) { return ""; } };

  // The list itself is src/servers.js's, shared with Catalogs and Audiobookshelf.
  const clean = (s) => {
    const url = folderUrl(s.url) || String(s.url || "").trim();
    return { id: s.id || "w" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(s.title || "").trim().slice(0, 80) || lastName(url) || host(url),
      url, user: String(s.user || ""), pass: String(s.pass || ""), at: Number(s.at) || Date.now() };
  };
  const S = C.servers({ key: KEY, clean, secrets: ["pass"] });
  const { add, remove, shared, mergeIn, changed } = S;
  const list = () => S.all().map((s) => ({ ...s }));
  const update = (s) => S.change(s.id, (x) => clean({ ...x, ...s, at: Date.now() }));

  const ext = (name) => ((String(name).match(/\.([a-z0-9]{1,8})$/i) || [])[1] || "").toLowerCase();
  const kindOf = (name) => (KINDS[ext(name)] ? ext(name) : "");
  const stem = (name) => String(name).replace(/\.[a-z0-9]{1,8}$/i, "");

  // ---- A PROPFIND answer (a multistatus) ----
  const dav = (node, name) => (node ? [...node.getElementsByTagNameNS(DAV, name)] : []);
  const txt = (node, name) => { const n = dav(node, name)[0]; return n ? n.textContent.trim() : ""; };
  const same = (a, b) => { try { return decodeURIComponent(new URL(a).pathname).replace(/\/+$/, "") === decodeURIComponent(new URL(b).pathname).replace(/\/+$/, ""); } catch (e) { return a === b; } };
  function parse(xml, url) {
    const doc = new DOMParser().parseFromString(String(xml || "").replace(/^﻿/, ""), "application/xml");
    const root = doc.documentElement;
    if (doc.querySelector("parsererror") || !root || root.localName !== "multistatus" || root.namespaceURI !== DAV) throw new DavError("not webdav");
    const out = { folders: [], files: [] };
    for (const r of dav(root, "response")) {
      const href = txt(r, "href");
      if (!href) continue;
      let at;
      try { at = new URL(href, url); } catch (e) { continue; }
      // Only on the same server: an answer can't send the login elsewhere.
      if (at.origin !== new URL(url).origin) continue;
      if (same(at.href, url)) continue;
      // The properties that came back (200); a server lists the missing ones apart.
      const ok = dav(r, "propstat").find((p) => /\s200\s/.test(" " + txt(p, "status") + " ")) || r;
      const folder = dav(ok, "collection").length > 0;
      const name = (txt(ok, "displayname") || lastName(at.href)).slice(0, 200);
      if (!name || name.startsWith(".")) continue;
      if (folder) { at.pathname = at.pathname.replace(/\/*$/, "/"); out.folders.push({ name, url: at.href }); continue; }
      out.files.push({ name, url: at.href, size: Number(txt(ok, "getcontentlength")) || 0, modified: Date.parse(txt(ok, "getlastmodified")) || 0,
        kind: kindOf(lastName(at.href)) || kindOf(name) });
    }
    const natural = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    out.folders.sort(natural);
    out.files.sort(natural);
    return out;
  }

  // ---- Fetching ----
  // The phone asks natively (no CORS). A browser asks the server straight,
  // never through the fetch proxy: it carries a login, and the proxy can't
  // reach a server at home anyway. Straight means the server has to allow
  // the web copy (CORS), which few do.
  const login = (s) => (s && s.user ? "Basic " + btoa(unescape(encodeURIComponent(s.user + ":" + s.pass))) : "");
  const home = (url) => { try { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|[^.]+$|.*\.(local|lan|home|internal)$)/i.test(new URL(url).hostname); } catch (e) { return false; } };

  class DavError extends Error {}
  async function read(s, url) {
    const at = folderUrl(url || s.url);
    if (!at) throw new DavError("not webdav");
    let res;
    try { res = await C.platform.dav(at, login(s), "1"); } catch (e) { throw new DavError(C.platform.native ? "offline" : "browser"); }
    if (res.status === 401 || res.status === 403) throw new DavError("login");
    if (res.status === 404) throw new DavError("gone");
    if (res.status !== 207 && res.status !== 200) throw new DavError(res.status === 405 || res.status === 501 ? "not webdav" : "HTTP " + res.status);
    const got = parse(res.text, folderUrl(res.url) || at);
    // A book's picture, by its name: "Dune.jpg" beside "Dune.epub", or the
    // folder's cover.jpg when the book is the only one in it (Calibre's way).
    const pics = got.files.filter((f) => PICTURE.test(f.name));
    const books = got.files.filter((f) => f.kind);
    const folderPic = pics.find((p) => /^(cover|folder)\.(jpe?g|png|webp)$/i.test(p.name));
    for (const b of books) {
      const mine = pics.find((p) => stem(p.name).toLowerCase() === stem(b.name).toLowerCase());
      b.cover = mine ? mine.url : books.length === 1 && folderPic ? folderPic.url : "";
    }
    return { url: at, folders: got.folders, books };
  }

  async function bytes(s, url, name) {
    if (C.platform.native) {
      const auth = login(s);
      return C.platform.fetchBytes(url, name, auth ? { Authorization: auth } : undefined);
    }
    let res;
    try { res = await fetch(url, { headers: login(s) ? { Authorization: login(s) } : {}, credentials: "omit" }); } catch (e) { throw new TypeError("Failed to fetch (browser)"); }
    return { status: res.status, url: res.url || url, type: res.headers.get("Content-Type") || "", blob: await res.blob() };
  }

  // Covers come with the login too, so not as a plain <img src>: the phone
  // downloads each once into its cache, a browser fetches it into memory.
  const covers = new Map();
  async function cover(s, f) {
    if (!f.cover) return "";
    if (covers.has(f.cover)) return covers.get(f.cover);
    const job = (async () => {
      try {
        if (C.platform.native && C.platform.downloadTo) {
          let h = 0;
          for (const c of f.cover) h = (h * 31 + c.charCodeAt(0)) | 0;
          const auth = login(s);
          return (await C.platform.downloadTo(f.cover, "webdav-covers/" + (h >>> 0).toString(36) + "." + (ext(f.cover) || "jpg"), null, "CACHE", auth ? { Authorization: auth } : undefined)) || "";
        }
        const got = await bytes(s, f.cover, "cover");
        return got.status === 200 && /^image\//.test(got.blob.type || got.type) ? URL.createObjectURL(got.blob) : "";
      } catch (e) { return ""; }
    })();
    covers.set(f.cover, job);
    return job;
  }

  C.webdav = { list, add, update, remove, changed, shared, mergeIn, parse, read, bytes, cover, kindOf, login, host, home, folderUrl, DavError, KINDS };
})();
