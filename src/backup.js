// Waypage: pages leaving the app and coming back (0.18.0). One page as a
// self-contained HTML file, and the whole library as one zip: library.json
// plus every page directory, stored without compression (pictures are
// already compressed), written and read by the small zip code below.
//
// Anything read back is untrusted: index entries keep only the fields
// Waypage writes, file names only the shapes it makes, and an imported
// page's HTML goes through save.cleanSaved.
(function () {
  const C = window.Waypage;
  const S = () => C.store;

  // ---- The index entry ----

  const ID = /^[a-z0-9]{4,24}$/;
  const LOCAL = /^images\/[A-Za-z0-9._-]{1,80}$/;
  // A picture of your own picked as a collection's cover: its file's name.
  const COVER_FILE = /^u[a-z0-9]{4,24}\.(jpg|png)$/;
  const httpUrl = (v) => (typeof v === "string" && /^https?:\/\//i.test(v) ? v.slice(0, 2000) : "");
  const text = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");
  const num = (v) => (typeof v === "number" && isFinite(v) ? v : 0);

  // A clip made from a file of your own (0.31.0): what the file was.
  const FP = /^[0-9a-f]{32}$/;
  const FILE_KINDS = ["epub", "md", "txt", "html", "cbz", "pdf", "audio"];
  function cleanFile(f) {
    if (!f || typeof f !== "object" || !FILE_KINDS.includes(f.kind) || !/^[a-z0-9]{1,8}$/.test(f.ext || "")) return null;
    const out = { name: text(f.name, 200) || "file." + f.ext, kind: f.kind, ext: f.ext, size: num(f.size) };
    if (typeof f.fp === "string" && FP.test(f.fp)) out.fp = f.fp;
    return out;
  }
  // A note's paper, and the PDF it was made from when it was.
  function cleanNote(n) {
    const out = { paper: ["blank", "lines", "squares"].includes(n.paper) ? n.paper : "blank" };
    if (typeof n.from === "string" && /^[a-z0-9]{4,24}$/.test(n.from)) out.from = n.from;
    return out;
  }
  const sameFile = (a, b) => !!(a.file && b.file && a.file.name === b.file.name && a.file.size === b.file.size);

  // An entry from a file, down to the fields an index entry has. null when
  // it has no address to call home, and wasn't made from a file.
  function cleanMeta(m, id) {
    const file = m && typeof m === "object" ? cleanFile(m.file) : null;
    // A note (2.0.0) has no address and no file: it is its own page.
    const note = m && typeof m === "object" && m.note && typeof m.note === "object" ? cleanNote(m.note) : null;
    if (!m || typeof m !== "object" || (!httpUrl(m.url) && !file && !note)) return null;
    const out = {
      id, url: httpUrl(m.url), title: text(m.title, 300) || httpUrl(m.url) || (file ? file.name : "Note"), site: text(m.site, 100), byline: text(m.byline, 200),
      licence: m.licence === "wikipedia" ? "wikipedia" : null, savedAt: num(m.savedAt) || Date.now(), minutes: Math.max(1, Math.round(num(m.minutes)) || 1),
      lang: text(m.lang, 20), dir: m.dir === "rtl" ? "rtl" : "", mode: ["previews", "full", "links"].includes(m.mode) ? m.mode : "previews",
      images: num(m.images), missing: num(m.missing), bytes: num(m.bytes),
      at: Math.min(1, Math.max(0, num(m.at))), finished: m.finished === true,
    };
    if (num(m.readAt)) out.readAt = num(m.readAt);
    if (out.readAt && typeof m.readOn === "string" && m.readOn.trim()) out.readOn = m.readOn.trim().slice(0, 40);
    if (num(m.placeAt)) out.placeAt = num(m.placeAt);
    if (typeof m.spot === "string" && /^\d{1,6}\/\d{1,2}c?$/.test(m.spot)) out.spot = m.spot;
    if (typeof m.imageBytes === "number" && m.imageBytes >= 0) out.imageBytes = num(m.imageBytes);
    if (m.comic === true) out.comic = true;
    if (m.manga === true) out.manga = true;
    if (m.turn === "rtl" || m.turn === "ltr") out.turn = m.turn;
    if (typeof m.volume === "number" && Number.isFinite(m.volume)) out.volume = m.volume;
    if (m.cut === true) out.cut = true;
    if (num(m.archived)) out.archived = num(m.archived);
    if (num(m.editedAt)) out.editedAt = num(m.editedAt);
    if (num(m.published)) out.published = num(m.published);
    if (num(m.back)) out.back = num(m.back);
    if (m.fav === true) { out.fav = true; out.favAt = num(m.favAt) || out.savedAt; }
    if (typeof m.next === "string") out.next = httpUrl(m.next);
    if (typeof m.prev === "string") out.prev = httpUrl(m.prev);
    if (httpUrl(m.requested)) out.requested = httpUrl(m.requested);
    if (typeof m.thumb === "string" && (LOCAL.test(m.thumb) || httpUrl(m.thumb))) out.thumb = m.thumb;
    const tags = Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === "string").map((t) => t.replace(/\s+/g, " ").trim().slice(0, 32)).filter(Boolean) : [];
    if (tags.length) out.tags = [...new Set(tags)].slice(0, 50);
    const folder = text(m.folder, 32).replace(/\s+/g, " ").trim();
    if (folder) { out.folder = folder; out.folderAt = num(m.folderAt) || out.savedAt; }
    if (folder && m.folderFav === true) { out.folderFav = true; out.folderFavAt = num(m.folderFavAt) || out.savedAt; }
    // Share reading activity (2026-11): kept out of it, a clip or a
    // collection (on its clips, like folderFav).
    if (m.noShare === true) out.noShare = true;
    if (folder && m.folderNoShare === true) out.folderNoShare = true;
    if (folder && httpUrl(m.source)) out.source = httpUrl(m.source);
    if (folder && typeof m.coverPick === "string" && (COVER_FILE.test(m.coverPick) || /^clip:[a-z0-9]{4,24}$/.test(m.coverPick))) out.coverPick = m.coverPick;
    if (text(m.series, 200)) out.series = text(m.series, 200);
    if (file) out.file = file;
    if (note) out.note = note;
    const marks = cleanMarks(m.marks);
    if (marks.length) out.marks = marks;
    // Drawings by block (2026-11): with the highlights, on the entry.
    const ink = cleanInk(m.ink);
    if (ink) { out.ink = ink; if (num(m.inkAt)) out.inkAt = num(m.inkAt); }
    // An audiobook's place and fixes (2026-11).
    const listen = cleanListen(m.listen);
    if (listen) out.listen = listen;
    return out;
  }

  // The listening part of an index entry, as read from sync or a backup:
  // where you are (t seconds, at tAt), how fast, what you read along
  // with, and your fixes. null when there's nothing usable.
  function cleanListen(v) {
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const out = { t: Math.max(0, num(v.t)), tAt: Math.max(0, num(v.tAt)) };
    if (num(v.dur) > 0) out.dur = num(v.dur);
    if (num(v.speed) >= 0.5 && num(v.speed) <= 3) out.speed = Math.round(num(v.speed) * 100) / 100;
    if (["transcript", "book", "listen"].includes(v.mode)) out.mode = v.mode;
    if (v.book && typeof v.book === "object") {
      const b = {};
      if (typeof v.book.id === "string" && /^[a-z0-9]{4,24}$/.test(v.book.id)) b.id = v.book.id;
      if (typeof v.book.fp === "string" && /^[0-9a-f]{32}$/.test(v.book.fp)) b.fp = v.book.fp;
      if (typeof v.book.url === "string" && /^https?:\/\//i.test(v.book.url)) b.url = v.book.url.slice(0, 2000);
      if (b.id || b.fp || b.url) out.book = b;
    }
    const fixes = Array.isArray(v.fixes) ? v.fixes.slice(0, 500).filter((f) => f && typeof f.from === "string" && typeof f.to === "string" && f.from.trim() && f.to.trim())
      .map((f) => ({ from: f.from.replace(/\s+/g, " ").trim().slice(0, 100), to: f.to.replace(/\s+/g, " ").trim().slice(0, 100), at: num(f.at) })) : [];
    if (fixes.length) out.fixes = fixes;
    return out;
  }
  // Highlights (1.7.0): where each is in the clip's text blocks, its words,
  // its note and its colour.
  // Colours other than yellow (1.42.0); yellow has none.
  const MARK_COLORS = ["green", "blue", "pink", "purple"];
  // A clip's drawings by block: { "<block>": [stroke] }, each stroke as
  // ink.js keeps it (ink.js clean). null when there are none.
  function cleanInk(pages) {
    if (!pages || typeof pages !== "object" || Array.isArray(pages) || !(C.ink && C.ink.clean)) return null;
    const out = {};
    let n = 0;
    for (const [k, list] of Object.entries(pages)) {
      const b = Math.floor(Number(k));
      if (!(b >= 1 && b <= 20000) || !Array.isArray(list)) continue;
      const ok = list.slice(0, 5000).map(C.ink.clean).filter(Boolean).filter((s) => s.t !== "i");
      if (ok.length) { out[b] = ok; n += ok.length; }
      if (n > 20000) break;
    }
    return n ? out : null;
  }
  function cleanMarks(list) {
    if (!Array.isArray(list)) return [];
    const ids = new Set();
    const out = [];
    for (const m of list.slice(0, 2000)) {
      if (!m || typeof m !== "object") continue;
      const id = text(m.id, 40), words = text(m.text, 4000).replace(/\s+/g, " ").trim();
      if (!id || ids.has(id) || !words) continue;
      const start = Math.max(0, Math.floor(num(m.start))), end = Math.max(0, Math.floor(num(m.end)));
      let o;
      if (m.page != null) {
        // One on a PDF's printed pages (1.56.0): by page, with its boxes
        // on the page as fractions of it.
        const page = Math.floor(num(m.page)), endPage = Math.floor(num(m.endPage));
        if (page < 1 || endPage < page) continue;
        const rects = (Array.isArray(m.rects) ? m.rects : []).slice(0, 60)
          .filter((r) => Array.isArray(r) && r.length === 5 && r.every((v) => Number.isFinite(v)) && r[0] >= page && r[0] <= endPage)
          .map(([n, ...b]) => [Math.floor(n), ...b.map((v) => Math.min(1, Math.max(0, v)))]);
        o = { id, page, start, endPage, end, text: words, at: num(m.at) || Date.now() };
        if (rects.length) o.rects = rects;
      } else {
        const block = Math.floor(num(m.block)), endBlock = Math.floor(num(m.endBlock));
        if (block < 0 || endBlock < block) continue;
        o = { id, block, start, endBlock, end, text: words, at: num(m.at) || Date.now() };
      }
      ids.add(id);
      if (text(m.note, 4000).trim()) o.note = text(m.note, 4000).trim();
      if (MARK_COLORS.includes(m.color)) o.color = m.color;
      out.push(o);
    }
    return out;
  }

  // A followed feed from a file, down to the fields Waypage keeps. null
  // when it has no address to read.
  function cleanFeed(f) {
    if (!f || typeof f !== "object" || !httpUrl(f.url)) return null;
    const items = Array.isArray(f.items) ? f.items : [];
    const out = {
      url: httpUrl(f.url), title: text(f.title, 300) || httpUrl(f.url), link: httpUrl(f.link) || null, icon: httpUrl(f.icon) || null,
      mode: f.mode === "save" ? "save" : "show", images: ["previews", "full", "links"].includes(f.images) ? f.images : "previews",
      folder: text(f.folder, 32).replace(/\s+/g, " ").trim(), days: [3, 7, 30].includes(f.days) ? f.days : 7,
      addedAt: num(f.addedAt) || Date.now(), checkedAt: 0, error: "",
      items: items.filter((it) => it && httpUrl(it.url)).slice(0, 100).map((it) => {
        const o = { id: text(it.id, 2000) || null, url: httpUrl(it.url), title: text(it.title, 300), date: num(it.date) || null, foundAt: num(it.foundAt) || Date.now() };
        if (it.tried === true) o.tried = true;
        return o;
      }),
    };
    return out;
  }

  // ---- Zip, stored ----

  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const utf8 = (s) => new TextEncoder().encode(s);

  // Entries go out as they're added; `sink(bytes)` takes them in order.
  function zipWriter(sink) {
    const dir = [];
    let offset = 0, pending = [], pendingSize = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    async function put(bytes, force) {
      if (bytes.length) { pending.push(bytes); pendingSize += bytes.length; }
      if (pendingSize < (force ? 1 : 1 << 20)) return;
      const all = new Uint8Array(pendingSize);
      let at = 0;
      for (const b of pending) { all.set(b, at); at += b.length; }
      pending = []; pendingSize = 0;
      await sink(all);
    }
    function header(sig, size) {
      const b = new Uint8Array(size);
      const v = new DataView(b.buffer);
      v.setUint32(0, sig, true);
      return [b, v];
    }
    return {
      async add(name, bytes) {
        const n = utf8(name), crc = crc32(bytes);
        const [h, v] = header(0x04034b50, 30);
        v.setUint16(4, 20, true); v.setUint16(6, 0x800, true); v.setUint16(8, 0, true);
        v.setUint16(10, time, true); v.setUint16(12, date, true); v.setUint32(14, crc, true);
        v.setUint32(18, bytes.length, true); v.setUint32(22, bytes.length, true); v.setUint16(26, n.length, true);
        dir.push({ n, crc, size: bytes.length, offset });
        offset += 30 + n.length + bytes.length;
        await put(h); await put(n); await put(bytes);
      },
      async finish() {
        let size = 0;
        for (const e of dir) {
          const [h, v] = header(0x02014b50, 46);
          v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x800, true);
          v.setUint16(12, time, true); v.setUint16(14, date, true); v.setUint32(16, e.crc, true);
          v.setUint32(20, e.size, true); v.setUint32(24, e.size, true); v.setUint16(28, e.n.length, true);
          v.setUint32(42, e.offset, true);
          await put(h); await put(e.n);
          size += 46 + e.n.length;
        }
        const [h, v] = header(0x06054b50, 22);
        v.setUint16(8, dir.length, true); v.setUint16(10, dir.length, true);
        v.setUint32(12, size, true); v.setUint32(16, offset, true);
        await put(h);
        await put(new Uint8Array(0), true);
      },
    };
  }

  const bytesOf = async (blob, from, to) => new Uint8Array(await blob.slice(from, to).arrayBuffer());

  // The entries of a zip held in a Blob (a picked File), read from its
  // central directory without loading the whole file. Map of name → entry.
  async function zipEntries(blob) {
    const tail = await bytesOf(blob, Math.max(0, blob.size - 65557), blob.size);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 5 && tail[i + 3] === 6) { end = i; break; }
    }
    if (end < 0) throw new Error("not a zip");
    const ev = new DataView(tail.buffer, end);
    const count = ev.getUint16(10, true), size = ev.getUint32(12, true), start = ev.getUint32(16, true);
    const cd = await bytesOf(blob, start, start + size);
    const v = new DataView(cd.buffer);
    const out = new Map();
    for (let i = 0, p = 0; i < count && p + 46 <= cd.length; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) break;
      const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true);
      const name = new TextDecoder().decode(cd.subarray(p + 46, p + 46 + nameLen));
      out.set(name, { method: v.getUint16(p + 10, true), packed: v.getUint32(p + 20, true), size: v.getUint32(p + 24, true), offset: v.getUint32(p + 42, true) });
      p += 46 + nameLen + extra + note;
    }
    return out;
  }

  async function zipRead(blob, e) {
    const h = await bytesOf(blob, e.offset, e.offset + 30);
    const v = new DataView(h.buffer);
    if (v.getUint32(0, true) !== 0x04034b50) throw new Error("bad entry");
    const from = e.offset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
    const raw = await bytesOf(blob, from, from + e.packed);
    if (e.method === 0) return raw;
    // A backup someone re-zipped with their computer's own tool.
    if (e.method === 8 && typeof DecompressionStream === "function") {
      const out = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(out).arrayBuffer());
    }
    throw new Error("unsupported entry");
  }

  // ---- The whole library ----

  const today = () => new Date().toISOString().slice(0, 10);

  // The files a backup starts with, also handed to the Drive backup that
  // runs with the app closed (1.47.0).
  async function headFiles(listed, feeds) {
    const covers = await coversOf(listed);
    return [
      { name: "waypage.json", text: JSON.stringify({ format: 1, app: C.version, made: Date.now(), pages: listed.length, feeds: (feeds || []).length }) },
      { name: "library.json", text: JSON.stringify(listed) },
      ...(feeds && feeds.length ? [{ name: "feeds.json", text: JSON.stringify(feeds) }] : []),
      // Reading stats (1.39.0): this device's and the others it knows.
      ...(C.stats ? [{ name: "stats.json", text: JSON.stringify(C.stats.backup()) }] : []),
      // Pictures picked as covers, small enough to go as text.
      ...(Object.keys(covers).length ? [{ name: "covers.json", text: JSON.stringify(covers) }] : []),
    ];
  }
  async function coversOf(pages) {
    const out = {};
    for (const name of new Set(pages.map((p) => p.coverPick).filter((c) => COVER_FILE.test(c || "")))) {
      const bytes = await S().readCover(name);
      if (bytes) out[name] = S().toBase64(bytes);
    }
    return out;
  }
  async function restoreCovers(blob, entry) {
    let got;
    try { got = JSON.parse(new TextDecoder().decode(await zipRead(blob, entry))); } catch (e) { return; }
    if (!got || typeof got !== "object") return;
    for (const [name, b64] of Object.entries(got)) {
      if (!COVER_FILE.test(name) || typeof b64 !== "string" || await S().readCover(name)) continue;
      try {
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const type = imageType(bytes);
        if (type === "image/jpeg" || type === "image/png") await S().writeCover(name, bytes, type);
      } catch (e) { /* the clips matter more */ }
    }
  }

  // Writes the backup and resolves to { uri } in the app (a file in its
  // cache, for the share sheet) or { blob } in a browser.
  // `gate`, when given, is awaited between clips: false stops the backup
  // (1.27.1), which then throws an Error with code "cancelled".
  // A file read from outside never goes in (1.46.0): the file stays where
  // it is, and its link to it means nothing on another device.
  // `bare`, when given (1.47.0, Drive's Links only), is the ids whose
  // files stay out: they go in the list alone, to be saved again from
  // their links on restore.
  async function exportLibrary(pages, onProgress, feeds, gate, bare) {
    pages = pages.filter((p) => !p.link);
    const listed = pages;
    if (bare && bare.size) pages = pages.filter((p) => !bare.has(p.id));
    const native = C.platform.native;
    const name = "waypage-backup-" + today() + ".zip";
    const head = await headFiles(listed, feeds);
    const from = native ? await S().packSource().catch(() => null) : null;
    if (from) return packNatively(name, pages, head, from, onProgress);
    const file = native ? await S().cacheFile(name) : null;
    const parts = [];
    const zip = zipWriter(native ? (b) => file.append(b) : (b) => { parts.push(b); });
    for (const h of head) await zip.add(h.name, utf8(h.text));
    let done = 0;
    const stop = async () => { if (gate && !(await gate())) throw Object.assign(new Error("Stopped."), { code: "cancelled" }); };
    if (native) {
      for (const p of pages) {
        for (const rel of await S().listFiles(p.id)) {
          try { await zip.add("pages/" + p.id + "/" + rel, await S().readBytes(p.id, rel)); } catch (e) { /* gone since listing */ }
        }
        if (onProgress) onProgress(++done, pages.length);
        await stop();
      }
    } else {
      // A batch read at a time (1.47.0), the next one read while this one
      // is packed.
      const BATCH = 50;
      const read = (at) => (at < pages.length ? S().readPages(pages.slice(at, at + BATCH).map((p) => p.id)) : null);
      let next = read(0);
      for (let at = 0; at < pages.length; at += BATCH) {
        const got = await next;
        next = read(at + BATCH);
        for (let i = 0; i < got.length; i++) {
          const id = pages[at + i].id, { html, text } = got[i];
          if (html) await zip.add("pages/" + id + "/page.html", utf8(html));
          if (text != null) await zip.add("pages/" + id + "/text.txt", utf8(text));
          if (pages[at + i].note) for (const f of await noteFiles(id)) await zip.add("pages/" + id + "/" + f.name, f.bytes);
          if (onProgress) onProgress(++done, pages.length);
        }
        await stop();
      }
      if (next) await next.catch(() => {});
    }
    await zip.finish();
    return native ? { uri: await file.uri(), name } : { blob: new Blob(parts, { type: "application/zip" }), name };
  }

  // A note's own files, as the app keeps them beside its page (2026-11):
  // its sheets, its strokes, the pictures put on it and its PDF. In the
  // app they are in its folder and go in with it.
  async function noteFiles(id) {
    const out = [];
    const note = await S().readNote(id);
    if (note) out.push({ name: "note.json", bytes: utf8(JSON.stringify(note)) });
    const ink = await S().readInk(id);
    if (ink) {
      out.push({ name: "ink.json", bytes: utf8(JSON.stringify(ink)) });
      const used = new Set();
      for (const list of Object.values(ink.pages || {})) for (const s of list || []) if (s && s.t === "i" && typeof s.f === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(s.f)) used.add(s.f);
      for (const f of used) { const url = await S().readInkImage(id, f); if (url) out.push({ name: "ink/" + f + ".txt", bytes: utf8(url) }); }
    }
    const base = await S().readNoteBase(id);
    if (base) out.push({ name: "base.pdf", bytes: base instanceof Uint8Array ? base : new Uint8Array(await base.arrayBuffer()) });
    return out;
  }

  // In the app, FilesPlugin streams the files into the zip itself
  // (1.45.10): many times faster than reading each one into the WebView
  // and writing it back over the bridge. Pause and Stop reach it through
  // holdPack and stopPack, since it doesn't come back between clips.
  let packing = false;
  async function packNatively(name, pages, head, from, onProgress) {
    const F = C.platform.plugin("Files");
    const heard = onProgress ? await F.addListener("packProgress", (p) => onProgress(p.done, p.total)) : null;
    packing = true;
    try {
      const r = await F.pack({ name, ids: pages.map((p) => p.id), head, ...from });
      return { uri: r.uri, name };
    } catch (e) {
      throw e && e.code === "cancelled" ? Object.assign(new Error("Stopped."), { code: "cancelled" }) : e;
    } finally {
      packing = false;
      if (heard) heard.remove();
    }
  }
  const holdPack = (hold) => { if (packing) C.platform.plugin("Files").packHold({ hold: !!hold }).catch(() => {}); };
  const stopPack = () => { if (packing) C.platform.plugin("Files").packStop().catch(() => {}); };

  const PAGE_FILE = /^(page\.html|meta\.json|text\.txt|images\/[A-Za-z0-9._-]{1,80}|note\.json|ink\.json|base\.pdf|ink\/[A-Za-z0-9_-]{1,40}\.txt)$/;

  // Merges a backup into the library: a page not here is added, one here
  // already is replaced only by a copy saved later, never the other way.
  // `same(a, b)` says whether two addresses are the same page. Resolves to
  // { pages, added, replaced, kept, feeds, links } where `pages` is the new
  // index, `feeds` the backup's followed feeds, cleaned, and `links` the
  // clips it holds as links only (1.47.0), not here yet, to be saved again.
  async function restoreLibrary(blob, current, same, onProgress) {
    let entries;
    try { entries = await zipEntries(blob); } catch (e) { throw new Error("This file isn't a Waypage backup."); }
    const indexEntry = entries.get("library.json");
    let list;
    try { list = JSON.parse(new TextDecoder().decode(await zipRead(blob, indexEntry))); } catch (e) { list = null; }
    if (!indexEntry || !Array.isArray(list)) throw new Error("This file isn't a Waypage backup.");
    const pages = [...current];
    const taken = new Set(pages.map((p) => p.id));
    let added = 0, replaced = 0, kept = 0, done = 0;
    const links = [];
    for (const raw of list) {
      // An older backup's file read from outside (before 1.46.0) is left
      // out, rather than coming back as a clip of its text.
      const from = raw && typeof raw.id === "string" && ID.test(raw.id) && !raw.link ? raw.id : null;
      const meta = from && entries.has("pages/" + from + "/page.html") && cleanMeta(raw, from);
      const link = from && !meta && cleanMeta(raw, from);
      if (link && link.url && !link.file && !pages.some((p) => same(p.url, link.url))) {
        link.back = Date.now();
        links.push(link);
      }
      if (meta) {
        // A note has no address: it is known by its id.
        const i = pages.findIndex((p) => (meta.note ? p.id === from && p.note : meta.file ? sameFile(p, meta) : same(p.url, meta.url)));
        if (i >= 0 && (pages[i].savedAt || 0) >= meta.savedAt) kept++;
        else {
          if (i >= 0) { await S().removePage(pages[i].id); taken.delete(pages[i].id); }
          let id = from;
          while (taken.has(id)) id = C.save.newId();
          meta.id = id;
          taken.add(id);
          // Brought back on purpose (1.46.0): sync lets it beat an older
          // deletion, rather than deleting it again.
          meta.back = Date.now();
          await restorePage(blob, entries, from, meta);
          if (i >= 0) { pages[i] = meta; replaced++; } else { pages.push(meta); added++; }
        }
      }
      if (onProgress) onProgress(++done, list.length);
    }
    pages.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    let feeds = [];
    const feedsEntry = entries.get("feeds.json");
    if (feedsEntry) {
      try { feeds = JSON.parse(new TextDecoder().decode(await zipRead(blob, feedsEntry))); } catch (e) { feeds = []; }
      feeds = Array.isArray(feeds) ? feeds.map(cleanFeed).filter(Boolean) : [];
    }
    const coversEntry = entries.get("covers.json");
    if (coversEntry) await restoreCovers(blob, coversEntry);
    const statsEntry = entries.get("stats.json");
    if (statsEntry && C.stats) {
      try { C.stats.restore(JSON.parse(new TextDecoder().decode(await zipRead(blob, statsEntry)))); } catch (e) { /* the clips matter more */ }
    }
    return { pages, added, replaced, kept, feeds, links };
  }

  async function restorePage(blob, entries, from, meta) {
    const prefix = "pages/" + from + "/";
    const html = entries.get(prefix + "page.html");
    if (!C.platform.native) {
      let page = new TextDecoder().decode(await zipRead(blob, html));
      // A browser has nowhere to put the pictures, so they go into the page.
      const pics = new Map();
      for (const [name, e] of entries) {
        if (!name.startsWith(prefix + "images/")) continue;
        const rel = name.slice(prefix.length);
        const bytes = await zipRead(blob, e);
        pics.set(rel, dataUrl(bytes, imageType(bytes) || (/\.svg$/i.test(rel) ? "image/svg+xml" : "image/jpeg")));
      }
      if (pics.size) page = page.replace(/(\s(?:src|poster)=")(images\/[^"]+)"/g, (m, at, rel) => (pics.has(rel) ? at + pics.get(rel) + '"' : m));
      await S().writePage(meta.id, page, meta);
      if (meta.thumb && pics.has(meta.thumb)) await S().writeThumb(meta.id, pics.get(meta.thumb));
      const words = entries.get(prefix + "text.txt");
      if (words) await S().writeText(meta.id, new TextDecoder().decode(await zipRead(blob, words)));
      if (meta.note) {
        const read = async (rel) => { const e = entries.get(prefix + rel); return e ? zipRead(blob, e) : null; };
        const json = async (rel) => { const b = await read(rel); try { return b ? JSON.parse(new TextDecoder().decode(b)) : null; } catch (e) { return null; } };
        const note = await json("note.json");
        if (note) await S().writeNote(meta.id, note);
        const ink = await json("ink.json");
        if (ink) await S().writeInk(meta.id, ink);
        for (const [name, e] of entries) {
          const m = name.startsWith(prefix + "ink/") && /^ink\/([A-Za-z0-9_-]{1,40})\.txt$/.exec(name.slice(prefix.length));
          if (m) { const url = new TextDecoder().decode(await zipRead(blob, e)); if (/^data:image\//.test(url)) await S().writeInkImage(meta.id, m[1], url); }
        }
        const base = await read("base.pdf");
        if (base) await S().writeNoteBase(meta.id, new Blob([base], { type: "application/pdf" }));
      }
      return;
    }
    for (const [name, e] of entries) {
      if (!name.startsWith(prefix)) continue;
      const rel = name.slice(prefix.length);
      if (!PAGE_FILE.test(rel) || rel === "meta.json") continue;
      await S().writeBytes(meta.id, rel, await zipRead(blob, e));
    }
    await S().writeBytes(meta.id, "meta.json", utf8(JSON.stringify(meta, null, 1)));
  }

  // ---- One page ----

  const dataUrl = (bytes, type) => "data:" + type + ";base64," + S().toBase64(bytes);
  // What a picture is, from its first bytes: a file named .jpg after its
  // address may well hold a WebP.
  function imageType(b) {
    if (b[0] === 0x89 && b[1] === 0x50) return "image/png";
    if (b[0] === 0xff && b[1] === 0xd8) return "image/jpeg";
    if (b[0] === 0x47 && b[1] === 0x49) return "image/gif";
    if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
    return null;
  }

  // The page as one HTML file: its saved pictures inlined, its index entry
  // in a <meta> for importing it back. Resolves to { name, html }.
  async function exportPage(p) {
    const doc = new DOMParser().parseFromString(await S().readPage(p.id), "text/html");
    for (const img of doc.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      if (!LOCAL.test(src)) continue;
      try {
        const bytes = await S().readBytes(p.id, src);
        const type = imageType(bytes);
        if (!type) throw new Error("not a picture");
        img.setAttribute("src", dataUrl(bytes, type));
      } catch (e) {
        img.removeAttribute("src");
        if (img.hasAttribute("data-full")) img.className = "co-missing";
      }
    }
    const keep = { ...p };
    delete keep.id; delete keep.thumb; delete keep.bytes;
    const m = doc.createElement("meta");
    m.name = "waypage-page";
    m.content = JSON.stringify(keep);
    doc.head.prepend(m);
    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    doc.head.prepend(charset);
    return { name: pageSlug(p.title) + ".html", html: "<!doctype html>\n" + doc.documentElement.outerHTML };
  }

  // ---- A page as Markdown (0.25.2) ----
  // The saved page's text: headings, paragraphs, lists, quotes, code,
  // tables and links. Pictures point at the full image on the site, since
  // the local preview stays in the app; a video is a link.
  const pageSlug = (title) => title.replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Page";
  const mdEscape = (t) => t.replace(/([\\`*_[\]])/g, "\\$1").replace(/^(\s*)(?:([#>+-])|(\d+)\.)(?=\s)/, (m, sp, mark, num) => sp + (mark ? "\\" + mark : num + "\\."));
  const webUrl = (u) => (/^(https?:|mailto:)/i.test(u || "") ? u.replace(/[()\s]/g, (c) => encodeURIComponent(c)) : "");
  const imageUrl = (img) => webUrl(img.getAttribute("data-full")) || webUrl(img.getAttribute("src"));

  function mdInline(node) {
    let out = "";
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { out += mdEscape(n.textContent.replace(/\s+/g, " ")); continue; }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      const inner = () => mdInline(n);
      const wrap = (mark) => { const t = inner().trim(); return t ? mark + t + mark : ""; };
      if (tag === "br") out += "  \n";
      else if (tag === "strong" || tag === "b") out += wrap("**");
      else if (tag === "em" || tag === "i") out += wrap("*");
      else if (tag === "s" || tag === "del") out += wrap("~~");
      else if (tag === "code") { const t = n.textContent; const tick = t.includes("`") ? "``" : "`"; out += tick + t + tick; }
      else if (tag === "img") { const u = imageUrl(n); if (u) out += "![" + mdEscape(n.getAttribute("alt") || "") + "](" + u + ")"; }
      else if (tag === "a") { const t = inner().trim(); const u = webUrl(n.getAttribute("href")); out += u && t ? "[" + t + "](" + u + ")" : t; }
      else if (tag === "script" || tag === "style") continue;
      else out += inner();
    }
    return out;
  }

  const BLOCK_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "hr", "figure", "table", "div", "section", "article", "header", "footer", "aside", "main", "dl", "dt", "dd", "figcaption", "details", "summary", "nav"]);
  const hasBlocks = (n) => [...n.children].some((c) => BLOCK_TAGS.has(c.tagName.toLowerCase()));

  // Each block as a string; blocks are joined with a blank line.
  function mdBlocks(node, out) {
    let loose = null;
    const flush = () => { if (loose) { const t = mdInline(loose).trim(); if (t) out.push(t); loose = null; } };
    for (const n of node.childNodes) {
      const block = n.nodeType === 1 && BLOCK_TAGS.has(n.tagName.toLowerCase());
      if (!block) {
        if (n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())) {
          if (!loose) loose = node.ownerDocument.createElement("span");
          loose.append(n.cloneNode(true));
        }
        continue;
      }
      flush();
      mdBlock(n, out);
    }
    flush();
  }

  function mdList(list, depth) {
    const lines = [];
    let i = Number(list.getAttribute("start")) || 1;
    const ordered = list.tagName.toLowerCase() === "ol";
    for (const li of list.children) {
      if (li.tagName.toLowerCase() !== "li") continue;
      const mark = ordered ? i++ + ". " : "- ";
      const pad = " ".repeat(mark.length);
      const own = li.cloneNode(true);
      own.querySelectorAll(":scope > ul, :scope > ol").forEach((x) => x.remove());
      const parts = [];
      if (hasBlocks(own)) mdBlocks(own, parts); else parts.push(mdInline(own).trim());
      const text = parts.filter(Boolean).join("\n\n").split("\n").map((l, k) => (k ? (l ? pad + l : l) : l)).join("\n");
      lines.push("  ".repeat(depth) + mark + text);
      for (const sub of li.querySelectorAll(":scope > ul, :scope > ol")) lines.push(mdList(sub, depth + 1));
    }
    return lines.join("\n");
  }

  function mdTable(table) {
    const rows = [...table.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => mdInline(c).replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim()));
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const line = (r) => "| " + Array.from({ length: width }, (_, k) => r[k] || "").join(" | ") + " |";
    return [line(rows[0]), "|" + " --- |".repeat(width), ...rows.slice(1).map(line)].join("\n");
  }

  function mdBlock(n, out) {
    const tag = n.tagName.toLowerCase();
    if (n.classList.contains("co-head") || n.classList.contains("co-licence") || n.classList.contains("co-next")) return;
    const quoted = (parts) => parts.join("\n\n").split("\n").map((l) => (l ? "> " + l : ">")).join("\n");
    if (/^h[1-6]$/.test(tag)) { const t = mdInline(n).trim(); if (t) out.push("#".repeat(Math.min(6, +tag[1] + (tag === "h1" ? 1 : 0))) + " " + t); }
    else if (tag === "p" || tag === "dt" || tag === "summary") { const t = mdInline(n).trim(); if (t) out.push(tag === "dt" ? "**" + t + "**" : t); }
    else if (tag === "ul" || tag === "ol") { const t = mdList(n, 0); if (t) out.push(t); }
    else if (tag === "blockquote") { const parts = []; mdBlocks(n, parts); if (parts.length) out.push(quoted(parts)); }
    else if (tag === "pre") { const t = n.textContent.replace(/\n$/, ""); const fence = t.includes("```") ? "~~~" : "```"; out.push(fence + "\n" + t + "\n" + fence); }
    else if (tag === "hr") out.push("---");
    else if (tag === "table") { const t = mdTable(n); if (t) out.push(t); }
    else if (tag === "figure" && n.classList.contains("co-video")) {
      const a = n.querySelector("a[href]");
      const title = (n.querySelector(".co-video-title") || {}).textContent || "Video";
      const u = a && webUrl(a.getAttribute("href"));
      if (u) out.push("[▶ " + mdEscape(title.trim()) + "](" + u + ")");
    } else if (tag === "figure") {
      for (const img of n.querySelectorAll("img")) { const u = imageUrl(img); if (u) out.push("![" + mdEscape(img.getAttribute("alt") || "") + "](" + u + ")"); }
      const cap = n.querySelector("figcaption");
      const t = cap && mdInline(cap).trim();
      if (t) out.push("*" + t + "*");
    } else mdBlocks(n, out);
  }

  // { name, text } for a saved page as Markdown: its title, byline and
  // source first, the licence line last.
  async function exportMarkdown(p) {
    const doc = new DOMParser().parseFromString(await S().readPage(p.id), "text/html");
    const out = [];
    mdBlocks(doc.body, out);
    const head = ["# " + mdEscape(p.title)];
    if (p.byline) head.push("*" + mdEscape(p.byline) + "*");
    head.push("[" + mdEscape(p.site || p.url) + "](" + webUrl(p.url) + ")");
    const licence = doc.querySelector(".co-licence");
    const foot = licence ? "---\n\n" + mdInline(licence).trim() : "";
    const marks = (p.marks || []).length || (p.ink && Object.keys(p.ink).length) ? "## Highlights\n\n" + marksBody(p) : "";
    const text = [...head, ...out, marks, foot].filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n") + "\n";
    return { name: pageSlug(p.title) + ".md", text };
  }

  // A clip's highlights as Markdown (1.7.0): each a quote, its note under it.
  // Highlights, and where something was drawn (2026-11): Markdown can't
  // hold a drawing, so it says where one is, in the clip's order.
  function marksBody(p) {
    const rows = (p.marks || []).map((m) => ({ at: m.page ? m.page : m.block || 0,
      text: "> " + mdEscape(m.text) + (m.note ? "\n\n" + m.note.split("\n").map((l) => l.trim()).join("\n") : "") }));
    if (!p.note && p.ink && typeof p.ink === "object") for (const k of Object.keys(p.ink)) if (Array.isArray(p.ink[k]) && p.ink[k].length) rows.push({ at: Number(k) - 0.5, text: "_Drawing, paragraph " + k + "_" });
    if (!p.note && Array.isArray(p.drawn)) for (const d of p.drawn) if (Array.isArray(d)) rows.push({ at: d[0] + 0.5, text: "_Drawing, page " + d[0] + "_" });
    return rows.sort((a, b) => a.at - b.at).map((r) => r.text).join("\n\n");
  }
  function marksMarkdown(p) {
    const link = p.file ? "" : "[" + mdEscape(p.site || p.url) + "](" + webUrl(p.url) + ")";
    return ["# " + mdEscape(p.title), link, marksBody(p)].filter(Boolean).join("\n\n") + "\n";
  }

  // A folder as one file (0.26.0): its pages in order, each with its own
  // title and licence line, pictures inside.
  async function exportPages(pages, title) {
    const out = document.implementation.createHTMLDocument(title);
    const charset = out.createElement("meta");
    charset.setAttribute("charset", "utf-8");
    out.head.prepend(charset);
    const h = out.createElement("h1");
    h.className = "co-folder";
    h.textContent = title;
    out.body.append(h);
    for (const p of pages) {
      const doc = new DOMParser().parseFromString((await exportPage(p)).html, "text/html");
      const part = out.createElement("section");
      part.className = "co-part";
      part.append(...[...doc.body.childNodes].map((n) => out.importNode(n, true)));
      part.querySelectorAll(".co-head h1").forEach((n) => { const h2 = out.createElement("h2"); h2.textContent = n.textContent; n.replaceWith(h2); });
      out.body.append(part);
    }
    return { name: pageSlug(title) + ".html", html: "<!doctype html>\n" + out.documentElement.outerHTML };
  }

  async function exportMarkdownAll(pages, title) {
    const parts = [];
    for (const p of pages) parts.push((await exportMarkdown(p)).text.replace(/^# /, "## ").trim());
    return { name: pageSlug(title) + ".md", text: "# " + mdEscape(title) + "\n\n" + parts.join("\n\n---\n\n") + "\n" };
  }

  // A page file back into the library. Resolves to its new index entry,
  // or to { already } with the address when `has(url)` says it's saved;
  // throws an Error whose message says what's wrong with the file.
  async function importPage(html, has) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const tag = doc.querySelector('meta[name="waypage-page"], meta[name="carry-on-page"]');
    let raw = null;
    try { raw = tag && JSON.parse(tag.getAttribute("content")); } catch (e) { raw = null; }
    const id = C.save.newId();
    const meta = cleanMeta(raw, id);
    if (!meta) throw new Error("This file wasn't sent from Waypage, so it can't be opened here.");
    if (has && has(meta.url)) return { already: meta.url };
    const out = document.implementation.createHTMLDocument("");
    const { root, images } = C.save.cleanSaved(doc.body, out);
    if (!root.textContent.trim()) throw new Error("This clip file is empty.");
    let bytes = 0, thumb = null;
    for (const [i, im] of images.entries()) {
      const [head, b64] = im.data.split(",");
      const ext = (head.match(/image\/(\w+)/) || [])[1].replace("jpeg", "jpg");
      if (!C.platform.native) {
        im.el.setAttribute("src", im.data);
        if (!thumb && !im.el.closest(".co-video")) { thumb = "images/" + i + "." + ext; await S().writeThumb(id, im.data); }
        continue;
      }
      const bin = Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      const rel = "images/" + i + "." + ext;
      await S().writeBytes(id, rel, bin);
      bytes += bin.length;
      im.el.setAttribute("src", rel);
      if (!thumb && !im.el.closest(".co-video")) thumb = rel;
    }
    Object.assign(meta, { missing: root.querySelectorAll("img.co-missing").length, images: root.querySelectorAll("img").length });
    if (thumb) meta.thumb = thumb;
    const page = C.save.savedPageHtml(meta, root, out);
    const words = C.save.plainText(root);
    meta.bytes = bytes + await S().writePage(id, page, meta) + S().bytesOf(words);
    await S().writeText(id, words);
    return meta;
  }

  C.backup = { COVER_FILE, holdPack, stopPack, cleanMeta, cleanMarks, cleanListen, cleanInk, marksMarkdown, sameFile, cleanFeed, crc32, zipWriter, zipEntries, zipRead, headFiles, exportLibrary, restoreLibrary, exportPage, exportPages, exportMarkdown, exportMarkdownAll, importPage, imageType, mdBlocks };
})();
