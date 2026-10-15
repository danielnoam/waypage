// Waypage: where saved pages live. One directory per page, `pages/<id>/`
// with page.html, meta.json and images/, plus library.json listing them
// (docs/PROPOSAL.md, "Store and read").
//
// Where that is, in the app (0.33.0): the app's own storage (the default),
// Documents/Waypage on the phone (Android 11 and later), or a folder you
// picked, which Android lets the app reach only through its folder access
// (the Files plugin; the WebView reads it at /_waypage_folder_/). On iOS
// (1.6.0) a picked folder is a bookmark the Files plugin opens, and the
// WebView reads it from disk like the app's own storage. Every read and
// write below goes through `cur`, so that's the only difference.
//
// In a browser there is no directory: page.html, the index and a page's
// card picture go to IndexedDB (the index was in localStorage before
// 0.27.12), and a saved page's pictures are inside its HTML as data:
// URLs. Pages saved in the browser keep images as links.
(function () {
  const P = window.Waypage.platform;
  const FS = () => P.plugin("Filesystem");
  const F = () => P.plugin("Files");
  const INDEX_KEY = "waypage.library";
  const PLACE_KEY = "waypage.storagePlace";

  const bytesOf = (text) => new Blob([text]).size;

  // ---- Where the library is (0.33.0) ----

  // { kind: "app" } | { kind: "documents" } | { kind: "folder", tree, name }
  function savedPlace() {
    try {
      const p = JSON.parse(localStorage.getItem(PLACE_KEY));
      if (p && (p.kind === "documents" || (p.kind === "folder" && p.tree))) return p;
    } catch (e) { /* the default */ }
    return { kind: "app" };
  }

  // One place's reads and writes. Paths are inside the library: "library.json",
  // "pages/<id>/page.html". `data` is utf8 text, or base64 bytes.
  function backend(place) {
    if (place.kind === "folder") {
      const tree = place.tree;
      return {
        place,
        write: (path, data, utf8) => F().folderWrite({ tree, path, data, encoding: utf8 ? "utf8" : "base64" }),
        read: async (path) => (await F().folderRead({ tree, path })).data,
        async stat(path) {
          const s = await F().folderStat({ tree, path });
          if (!s.exists) throw new Error("missing " + path);
          return s.size || 0;
        },
        remove: (path) => F().folderDelete({ tree, path }),
        rmdir: (path) => F().folderDelete({ tree, path }),
        list: async (path) => (await F().folderList({ tree, path })).files || [],
        async download(url, path, page) {
          const tmp = "incoming-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          await P.downloadTo(url, tmp, page, "CACHE");
          const { uri } = await FS().getUri({ path: tmp, directory: "CACHE" });
          return (await F().folderMoveIn({ tree, path, from: uri })).size || 0;
        },
        async base() {
          if (!P.ios) return location.origin + "/_waypage_folder_/";
          const got = await F().serve({ tree });
          if (!got || !got.path) throw new Error("Can't reach the folder");
          return window.Capacitor.convertFileSrc("file://" + encodeURI(got.path)).replace(/\/?$/, "/");
        },
      };
    }
    const directory = place.kind === "documents" ? "DOCUMENTS" : "DATA";
    const pre = place.kind === "documents" ? "Waypage/" : "";
    return {
      place, directory, pre,
      write: (path, data, utf8) => FS().writeFile({ path: pre + path, data, directory, recursive: true, ...(utf8 ? { encoding: "utf8" } : {}) }),
      read: async (path) => (await FS().readFile({ path: pre + path, directory, encoding: "utf8" })).data,
      stat: async (path) => (await FS().stat({ path: pre + path, directory })).size || 0,
      remove: (path) => FS().deleteFile({ path: pre + path, directory }),
      rmdir: (path) => FS().rmdir({ path: pre + path, directory, recursive: true }),
      list: async (path) => (await FS().readdir({ path: pre + path, directory })).files || [],
      async download(url, path, page) {
        await P.downloadTo(url, pre + path, page, directory);
        return (await FS().stat({ path: pre + path, directory })).size || 0;
      },
      async base() {
        const { uri } = await FS().getUri({ path: pre, directory });
        const cap = window.Capacitor;
        return (cap && cap.convertFileSrc ? cap.convertFileSrc(uri) : uri).replace(/\/?$/, "/");
      },
    };
  }

  let cur = null;
  // The library's directory as a URL the WebView can load, so a page
  // directory can be the reader's <base> and a card can show its preview.
  // null in a browser.
  let dataUrl = null;
  // Set when the library's place can't be reached (a picked folder that
  // was deleted, or whose access was taken back): what to tell the reader.
  let problem = null;

  async function use(place) {
    cur = backend(place);
    if (F() && F().serve) await F().serve({ tree: place.kind === "folder" ? place.tree : null }).catch(() => {});
    try { dataUrl = await cur.base(); } catch (e) { dataUrl = null; }
  }

  const ready = (async () => {
    if (!FS()) return;
    const place = savedPlace();
    await use(place);
    problem = null;
    if (place.kind !== "app") {
      try { await cur.stat("library.json"); }
      catch (e) { problem = "Waypage can't reach " + placeName(place) + ". Pick it again in Settings, under Storage."; }
    }
  })();

  function placeName(place) {
    if (place.kind === "documents") return "Documents/Waypage";
    if (place.kind === "folder") return place.name || "the folder you picked";
    return "the app's own storage";
  }

  // While the library moves, everything else waits for it.
  let gate = Promise.resolve();
  const B = async () => { await ready; await gate; return cur; };

  // The browser's library keeps Carry-on's database name (1.0.0): the web
  // copy moved from /carry-on/ to /waypage/ on the same origin, so the
  // library it already has stays where it is.
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("carryon", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("pages");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("pages", mode);
      const req = fn(tx.objectStore("pages"));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // In a browser the index moved from localStorage (about 5 MB, which a
  // phone's backup can outgrow) to IndexedDB in 0.27.12; localStorage is
  // read until the first write, and is the fallback where IndexedDB fails.
  const IDB_INDEX = "__library";
  // On a phone the index is fetched from the library's own address
  // (1.28.3), as a card's preview is: read over the plugin bridge, three
  // thousand clips went through two more copies of the text on the way.
  async function readIndex() {
    if (FS()) {
      if (dataUrl) {
        try {
          const res = await fetch(dataUrl + "library.json", { cache: "no-store" });
          if (res.ok) {
            const got = await res.json();
            if (Array.isArray(got)) return got;
          }
        } catch (e) { /* the bridge below */ }
      }
      try {
        return JSON.parse(await (await B()).read("library.json"));
      } catch (e) { return []; }
    }
    try {
      const text = await idbDo("readonly", (s) => s.get(IDB_INDEX));
      if (typeof text === "string") return JSON.parse(text);
    } catch (e) { /* fall back */ }
    try { return JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { return []; }
  }

  // Told after each write, so sync (0.30.0) can send the change.
  let onIndex = null;
  async function writeIndex(pages) {
    await writeIndexOnly(pages);
    if (onIndex) onIndex();
  }
  // One write after another, in the order asked (1.21.0): two at once
  // could land out of order, leaving an older library on disk (a reading
  // place going back after a restart).
  let indexWrites = Promise.resolve();
  function writeIndexOnly(pages) {
    const text = JSON.stringify(pages);
    const next = indexWrites.then(() => writeIndexText(text));
    indexWrites = next.catch(() => {});
    return next;
  }
  async function writeIndexText(text) {
    if (FS()) {
      await (await B()).write("library.json", text, true);
      return;
    }
    try {
      await idbDo("readwrite", (s) => s.put(text, IDB_INDEX));
      try { localStorage.removeItem(INDEX_KEY); } catch (e) { /* nothing there */ }
    } catch (e) {
      try { localStorage.setItem(INDEX_KEY, text); } catch (e2) { /* not kept */ }
    }
  }

  // A browser's card pictures, as data: URLs kept beside the pages, since
  // there's no directory to point at. All of them at once, for the library.
  async function writeThumb(id, url) {
    if (!FS()) await idbDo("readwrite", (s) => s.put(url, id + ":thumb"));
  }
  async function readThumbs() {
    if (FS()) return new Map();
    try {
      const db = await idb();
      return await new Promise((resolve) => {
        const out = new Map();
        const store = db.transaction("pages").objectStore("pages");
        const keys = store.getAllKeys(IDBKeyRange.bound("", "\uffff"));
        keys.onsuccess = () => {
          const want = keys.result.filter((k) => typeof k === "string" && k.endsWith(":thumb"));
          if (!want.length) { db.close(); resolve(out); return; }
          let left = want.length;
          for (const k of want) {
            const r = store.get(k);
            r.onsuccess = r.onerror = () => {
              if (typeof r.result === "string") out.set(k.slice(0, -6), r.result);
              if (!--left) { db.close(); resolve(out); }
            };
          }
        };
        keys.onerror = () => { db.close(); resolve(out); };
      });
    } catch (e) { return new Map(); }
  }

  // How much a browser keeps, and whether it may clear it when space is
  // short. null in the app, whose pages are files.
  async function storageInfo() {
    if (FS() || !navigator.storage || !navigator.storage.estimate) return null;
    try {
      const { usage, quota } = await navigator.storage.estimate();
      const kept = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      return { usage: usage || 0, quota: quota || 0, kept };
    } catch (e) { return null; }
  }
  async function keepStored() {
    if (FS() || !navigator.storage || !navigator.storage.persist) return false;
    try { return await navigator.storage.persist(); } catch (e) { return false; }
  }

  async function writePage(id, html, meta) {
    if (FS()) {
      const base = "pages/" + id + "/";
      const b = await B();
      await b.write(base + "page.html", html, true);
      await b.write(base + "meta.json", JSON.stringify(meta, null, 1), true);
    } else {
      await idbDo("readwrite", (s) => s.put(html, id));
    }
    return bytesOf(html);
  }

  async function readPage(id) {
    if (FS()) {
      return (await B()).read("pages/" + id + "/page.html");
    }
    return idbDo("readonly", (s) => s.get(id));
  }

  async function removePage(id) {
    if (FS()) {
      try { await (await B()).rmdir("pages/" + id); } catch (e) { /* already gone */ }
      return;
    }
    try { await idbDo("readwrite", (s) => { s.delete(id + ":text"); s.delete(id + ":thumb"); return s.delete(id); }); } catch (e) { /* already gone */ }
  }

  // The page's words as plain text (text.txt), for searching the library.
  // null when it was saved before 0.16.0 and hasn't been read for it yet.
  async function writeText(id, text) {
    if (FS()) {
      await (await B()).write("pages/" + id + "/text.txt", text, true);
    } else {
      await idbDo("readwrite", (s) => s.put(text, id + ":text"));
    }
  }
  async function readText(id) {
    try {
      if (FS()) return await (await B()).read("pages/" + id + "/text.txt");
      const t = await idbDo("readonly", (s) => s.get(id + ":text"));
      return typeof t === "string" ? t : null;
    } catch (e) { return null; }
  }

  // Downloads `url` into the page's directory; resolves to the file's size.
  // Throws where there is no directory, so callers keep the link instead.
  // `page` is the address of the page the file is on: sites that refuse
  // other sites' pages their pictures check it (0.22.0).
  async function download(id, rel, url, page) {
    if (!FS()) throw new Error("no directory");
    const size = await (await B()).download(url, "pages/" + id + "/" + rel, page);
    if (!size) throw new Error("empty download");
    return size;
  }

  // A file's size in a page's directory, 0 when it isn't there.
  async function sizeOf(id, rel) {
    if (!FS()) return 0;
    try { return await (await B()).stat("pages/" + id + "/" + rel); } catch (e) { return 0; }
  }

  // Deletes one file in a page's directory; resolves to the bytes freed.
  async function removeFile(id, rel) {
    if (!FS()) return 0;
    const path = "pages/" + id + "/" + rel;
    try {
      const b = await B();
      const size = await b.stat(path);
      await b.remove(path);
      return size || 0;
    } catch (e) { return 0; }
  }

  // Redraws a downloaded image that's much wider than `max` at `max` px:
  // JPEG, or PNG when it has see-through parts (a logo, a diagram). Keeps
  // whichever file is smaller. Animated GIFs and SVGs are left alone. The
  // file is served from the app's own origin, so the canvas can be read.
  // Resolves to { rel, bytes } of the file kept. One at a time, so four
  // big photos aren't decoded at once.
  let drawing = Promise.resolve();
  function shrink(id, rel, size, max) {
    const turn = drawing.then(() => shrinkNow(id, rel, size, max));
    drawing = turn;
    return turn;
  }
  // A full picture made smaller (1.18.0): no wider than `max`, and saved
  // again as WebP (JPEG where the WebView can't write WebP), kept only
  // when that's at least a tenth smaller. Pictures stay sharp on a phone.
  function squeeze(id, rel, size, max) {
    const turn = drawing.then(() => shrinkNow(id, rel, size, max, true));
    drawing = turn;
    return turn;
  }
  let webp = null;
  const writesWebp = () => {
    if (webp == null) { try { const c = document.createElement("canvas"); c.width = c.height = 1; webp = c.toDataURL("image/webp").startsWith("data:image/webp"); } catch (e) { webp = false; } }
    return webp;
  };
  // A canvas bigger than this fails on iPhones; such a picture is kept.
  const CANVAS_MAX = 16e6;
  async function shrinkNow(id, rel, size, max, squeezing) {
    const dir = pageDirUrl(id);
    const same = { rel, bytes: size };
    if (!dir || /\.(gif|svg)$/i.test(rel)) return same;
    try {
      const img = new Image();
      img.src = dir + rel;
      await img.decode();
      if (!squeezing && img.naturalWidth <= max * 1.25) return same;
      const w = Math.min(max, img.naturalWidth), h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
      if (w * h > CANVAS_MAX) return same;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      const clear = !/\.jpe?g$/i.test(rel) && seeThrough(ctx.getImageData(0, 0, w, h).data);
      const type = squeezing && writesWebp() ? "image/webp" : clear ? "image/png" : "image/jpeg";
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, squeezing ? 0.8 : 0.82));
      if (!blob || blob.size >= (squeezing ? size * 0.9 : size)) return same;
      const out = rel.replace(/\.[^./]*$/, "") + "s." + ({ "image/webp": "webp", "image/png": "png" }[type] || "jpg");
      await (await B()).write("pages/" + id + "/" + out, await base64(blob));
      await removeFile(id, rel);
      return { rel: out, bytes: blob.size };
    } catch (e) { return same; }
  }

  function seeThrough(px) {
    for (let i = 3; i < px.length; i += 4) if (px[i] < 255) return true;
    return false;
  }

  function base64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1]);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // ---- Files for export and backup (0.18.0) ----

  // Every file in a page's directory, as paths inside it ("page.html",
  // "images/0s.jpg"), with their sizes where the phone says. Empty in a
  // browser.
  async function listSized(id) {
    if (!FS()) return [];
    const out = [];
    async function walk(dir) {
      let files;
      try { files = await (await B()).list("pages/" + id + (dir ? "/" + dir : "")); } catch (e) { return; }
      for (const f of files) {
        const name = typeof f === "string" ? f : f.name;
        const rel = (dir ? dir + "/" : "") + name;
        if (f.type === "directory") await walk(rel);
        else out.push({ rel, size: typeof f.size === "number" ? f.size : null });
      }
    }
    await walk("");
    return out;
  }
  const listFiles = async (id) => (await listSized(id)).map((f) => f.rel);

  // A file in a page's directory as bytes, read through the WebView's own
  // file server like an image is.
  async function readBytes(id, rel) {
    const r = await fetch(pageDirUrl(id) + rel.split("/").map(encodeURIComponent).join("/"));
    if (!r.ok) throw new Error("missing " + rel);
    return new Uint8Array(await r.arrayBuffer());
  }

  async function writeBytes(id, rel, bytes) {
    await (await B()).write("pages/" + id + "/" + rel, toBase64(bytes));
  }

  // A file in the app's cache written a piece at a time, so a backup of
  // hundreds of megabytes never sits in memory or crosses the bridge whole.
  async function cacheFile(name) {
    await FS().writeFile({ path: name, data: "", directory: "CACHE", recursive: true });
    return {
      append: (bytes) => FS().appendFile({ path: name, data: toBase64(bytes), directory: "CACHE" }),
      uri: async () => (await FS().getUri({ path: name, directory: "CACHE" })).uri,
    };
  }

  function toBase64(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  // The URL a page's relative paths (images/3.jpg) resolve against.
  function pageDirUrl(id) {
    return dataUrl ? dataUrl + "pages/" + id + "/" : null;
  }

  // ---- Moving the library (0.33.0) ----

  // Every file under `path` in a place, as paths inside the library.
  async function walkAll(b, path) {
    let files;
    try { files = await b.list(path); } catch (e) { return []; }
    const out = [];
    for (const f of files) {
      const name = typeof f === "string" ? f : f.name;
      const rel = path + "/" + name;
      if (f.type === "directory") out.push(...await walkAll(b, rel));
      else out.push(rel);
    }
    return out;
  }

  // On Android the files go across in Java, at disk speed, instead of each
  // one through the bridge as base64 (1.19.0).
  async function endOf(b) {
    if (b.place.kind === "folder") return { tree: b.place.tree };
    const { uri } = await FS().getUri({ path: b.pre, directory: b.directory });
    return { dir: decodeURIComponent(uri.replace(/^file:\/\//, "")) };
  }

  async function copyNative(from, to, paths, onProgress) {
    const listen = onProgress && await F().addListener("copied", (e) => onProgress(e.done, e.total));
    try {
      await F().copyFiles({ from: await endOf(from), to: await endOf(to), paths });
    } finally {
      if (listen) listen.remove();
    }
  }

  // Moves the whole library to `next`, then uses it. A library already
  // there is kept: its clips join this one's (the same clip in both, this
  // one wins). The old place is cleared only once everything is across.
  // onProgress(done, total). Resolves to the joined index.
  async function moveTo(next, onProgress) {
    await ready;
    let open;
    const turn = gate.then(() => new Promise((done) => { open = done; }));
    const before = gate;
    gate = turn;
    await before;
    try {
      const from = cur;
      const to = backend(next);
      const fromBase = dataUrl;
      const mine = JSON.parse(await from.read("library.json").catch(() => "[]"));
      let there = [];
      try { there = JSON.parse(await to.read("library.json")); } catch (e) { there = []; }
      const files = await walkAll(from, "pages");
      if (onProgress) onProgress(0, files.length);
      if (P.android && files.length) await copyNative(from, to, files, onProgress);
      else {
        let done = 0;
        for (const path of files) {
          const r = await fetch(fromBase + path.split("/").map(encodeURIComponent).join("/"));
          if (!r.ok) throw new Error("Couldn't read " + path);
          await to.write(path, toBase64(new Uint8Array(await r.arrayBuffer())));
          if (onProgress) onProgress(++done, files.length);
        }
      }
      const joined = [...mine, ...there.filter((p) => !mine.some((m) => m.id === p.id))];
      await to.write("library.json", JSON.stringify(joined), true);
      // Read back before anything is let go.
      if (JSON.parse(await to.read("library.json")).length !== joined.length) throw new Error("The library didn't arrive whole.");
      const old = from.place;
      localStorage.setItem(PLACE_KEY, JSON.stringify(next));
      await use(next);
      problem = null;
      try { await from.rmdir("pages"); } catch (e) { /* left behind */ }
      try { await from.remove("library.json"); } catch (e) { /* left behind */ }
      if (old.kind === "folder" && old.tree !== (next.tree || "")) P.files.release(old.tree);
      return joined;
    } finally {
      open();
    }
  }

  window.Waypage.store = { ready,
    get place() { return cur ? cur.place : savedPlace(); }, placeName, get problem() { return problem; }, moveTo, readIndex, writeIndex, writeIndexOnly, set onIndex(f) { onIndex = f; }, writeThumb, readThumbs, storageInfo, keepStored, writePage, readPage, removePage, writeText, readText, download, removeFile, sizeOf, shrink, squeeze, pageDirUrl, bytesOf,
    listFiles, listSized, readBytes, writeBytes, cacheFile, toBase64 };
})();
