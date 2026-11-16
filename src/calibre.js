// Waypage: a Calibre library folder (the Calibre extension, 2026-11). Calibre
// keeps a library as a folder: metadata.db (SQLite: titles, authors, series,
// tags, formats) and a folder per book with its files and cover.jpg. Picked
// once, the folder is read in place with no server: on the phone through
// the Files plugin, on a computer through the browser's folder picker
// (Chrome and Edge). Nothing is copied until a book is.
//
//   folder()            { name } of the picked folder, or null
//   pick()              asks for the folder; { name } or null
//   forget()            lets it go
//   ready()             "ok", "ask" (a browser wants a tap to read it again)
//                       or "none"
//   allow()             the tap: asks the browser again; true when allowed
//   books(force)        the library's books, read from metadata.db (kept in
//                       memory until force or the folder changes)
//   parse(bytes)        books from metadata.db's bytes
//   file(book)          { file, ref, name } of the book's best format
//   cover(book)         an object URL for its cover, or ""
(function () {
  const C = (window.Waypage = window.Waypage || {});
  const KEY = "waypage.calibre";
  // The formats Waypage opens, best first.
  const FORMATS = ["EPUB", "AZW3", "MOBI", "CBZ", "PDF", "FB2", "TXT"];

  const native = () => !!(C.platform && C.platform.files && C.platform.files.canPickFolder);
  const webPicker = () => !native() && typeof window.showDirectoryPicker === "function";
  const saved = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } };
  const keep = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* not kept */ } };

  // A browser's folder handle lives in IndexedDB (localStorage can't hold it).
  const idb = (mode, fn) => new Promise((ok, no) => {
    const r = indexedDB.open("waypage-calibre", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("h");
    r.onerror = () => no(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction("h", mode);
      const q = fn(tx.objectStore("h"));
      tx.oncomplete = () => { r.result.close(); ok(q && q.result); };
      tx.onerror = () => { r.result.close(); no(tx.error); };
    };
  });
  let handle = null;
  const dirHandle = async () => handle || (handle = await idb("readonly", (s) => s.get("dir")).catch(() => null));

  let cache = null;
  const folder = () => { const s = saved(); return s ? { name: s.name } : null; };
  async function pick() {
    if (native()) {
      let got = null;
      try { got = await C.platform.files.pickFolder(); } catch (e) { got = null; }
      if (!got) return null;
      keep({ tree: got.ref, name: got.name });
    } else if (webPicker()) {
      let h;
      try { h = await window.showDirectoryPicker({ id: "calibre", mode: "read" }); } catch (e) { return null; }
      handle = h;
      await idb("readwrite", (s) => s.put(h, "dir"));
      keep({ web: true, name: h.name });
    } else return null;
    cache = null;
    return folder();
  }
  function forget() {
    const s = saved();
    if (s && s.tree && C.platform.files.release) C.platform.files.release(s.tree);
    keep(null);
    handle = null;
    cache = null;
    if (window.indexedDB) idb("readwrite", (st) => st.delete("dir")).catch(() => {});
  }
  async function ready() {
    const s = saved();
    if (!s) return "none";
    if (s.tree) return native() ? "ok" : "none";
    const h = await dirHandle();
    if (!h) return "none";
    if (!h.queryPermission) return "ok";
    return (await h.queryPermission({ mode: "read" })) === "granted" ? "ok" : "ask";
  }
  async function allow() {
    const h = await dirHandle();
    if (!h || !h.requestPermission) return false;
    try { return (await h.requestPermission({ mode: "read" })) === "granted"; } catch (e) { return false; }
  }

  class CalibreError extends Error {}
  // A file in the folder by its path: { file, ref } (ref, for reading it
  // from where it is later), or null.
  async function at(path) {
    const s = saved();
    if (!s) return null;
    if (s.tree) {
      const ref = await C.platform.files.child(s.tree, path);
      if (!ref) return null;
      const info = await C.platform.files.info(ref);
      if (!info.ok) return null;
      return { ref, file: await C.platform.files.blob(ref, info.size) };
    }
    let dir = await dirHandle();
    if (!dir) return null;
    const parts = String(path).split("/");
    try {
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
      const fh = await dir.getFileHandle(parts[parts.length - 1]);
      return { fh, file: await fh.getFile() };
    } catch (e) { return null; }
  }

  // ---- metadata.db ----
  function table(db, name) {
    if (!db.tables().includes(name)) return [];
    const cols = db.columns(name);
    const out = [];
    db.rows(name, (rowid, v) => { const o = { rowid }; cols.forEach((c, i) => { o[c] = v[i]; }); if (o.id == null) o.id = rowid; out.push(o); });
    return out;
  }
  const byId = (rows, key = "id") => new Map(rows.map((r) => [r[key], r]));
  function parse(bytes) {
    let db;
    try { db = C.sqlite.open(bytes); } catch (e) { throw new CalibreError("not calibre"); }
    if (!db.tables().includes("books")) throw new CalibreError("not calibre");
    const authors = byId(table(db, "authors")), series = byId(table(db, "series")), tags = byId(table(db, "tags"));
    const many = (name, col, from) => {
      const m = new Map();
      for (const r of table(db, name)) { const x = from.get(r[col]); if (!x) continue; if (!m.has(r.book)) m.set(r.book, []); m.get(r.book).push(x.name); }
      return m;
    };
    const byAuthor = many("books_authors_link", "author", authors), byTag = many("books_tags_link", "tag", tags);
    const bySeries = many("books_series_link", "series", series);
    const notes = new Map(table(db, "comments").map((r) => [r.book, String(r.text || "")]));
    const files = new Map();
    for (const r of table(db, "data")) { if (!files.has(r.book)) files.set(r.book, []); files.get(r.book).push({ format: String(r.format || "").toUpperCase(), name: String(r.name || ""), size: r.uncompressed_size || 0 }); }
    const plain = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
    return table(db, "books").map((b) => {
      const formats = (files.get(b.id) || []).filter((f) => FORMATS.includes(f.format)).sort((x, y) => FORMATS.indexOf(x.format) - FORMATS.indexOf(y.format));
      return { id: b.id, uuid: String(b.uuid || b.id), title: String(b.title || ""), sort: String(b.sort || b.title || ""), by: (byAuthor.get(b.id) || []).join(", "),
        authorSort: String(b.author_sort || ""), series: (bySeries.get(b.id) || [])[0] || "", index: Number(b.series_index) || 0,
        tags: byTag.get(b.id) || [], about: plain(notes.get(b.id)).slice(0, 1200), path: String(b.path || ""), cover: !!b.has_cover,
        added: Date.parse(b.timestamp) || 0, formats };
    }).filter((b) => b.title && b.path);
  }

  async function books(force) {
    if (cache && !force) return cache;
    const got = await at("metadata.db");
    if (!got) throw new CalibreError("no db");
    cache = parse(new Uint8Array(await got.file.arrayBuffer()));
    return cache;
  }

  // The book's best format, read where it is.
  async function file(book) {
    const f = book.formats[0];
    if (!f) throw new CalibreError("no format");
    const name = f.name + "." + f.format.toLowerCase();
    const got = await at(book.path + "/" + name);
    if (!got) throw new CalibreError("gone");
    let ref = got.ref || null;
    if (got.fh && C.platform.files.adopt) ref = (await C.platform.files.adopt(got.fh) || {}).ref || null;
    const blob = got.file;
    const out = blob instanceof Blob ? new File([blob], name, { type: blob.type }) : Object.assign(blob, { name });
    return { file: out, ref, name };
  }
  const covers = new Map();
  async function cover(book) {
    if (!book.cover) return "";
    if (covers.has(book.uuid)) return covers.get(book.uuid);
    let url = "";
    try {
      const got = await at(book.path + "/cover.jpg");
      if (got) url = URL.createObjectURL(new Blob([await got.file.arrayBuffer()], { type: "image/jpeg" }));
    } catch (e) { url = ""; }
    covers.set(book.uuid, url);
    return url;
  }

  C.calibre = { folder, pick, forget, ready, allow, books, parse, file, cover, CalibreError, get canPick() { return native() || webPicker(); } };
})();
