// Share reading activity (2026-11): what you're reading, as one file in
// your own sync repo, activity/reading.json, for other apps you connect to
// that repo. Off by default; written only by GitHub sync, only while the
// switch is on. The format is public and documented in
// docs/reading-activity.md: fields are only ever added.
//
// Each item's kind comes from the library's own marks, never a guess:
// an audiobook, a book file (EPUB, MOBI, AZW3, FB2; a PDF only when
// counted as a book), a comic (CBZ, or saved as a comic), a serial (a
// collection linked to a story's page) or an article (a web clip). Notes
// and anything kept out with "In other apps" off are never in it.
//
// window.Waypage.activity: build(pages, totals, opts), kindOf(p, folder),
// carry(doc, prev), sig(doc), KINDS, DEFAULT_KINDS.
(function () {
  "use strict";
  const C = window.Waypage = window.Waypage || {};
  const SCHEMA = 1;
  const KINDS = ["book", "audiobook", "comic", "serial", "article"];
  const DEFAULT_KINDS = { book: true, audiobook: true, comic: true, serial: true, article: false };
  const BOOK_EXTS = new Set(["epub", "mobi", "azw3", "fb2"]);
  // Opened to look at isn't reading: listed from 10 minutes or 5% in.
  const MIN_MS = 10 * 60000, MIN_PART = 0.05;
  const FP = /^[0-9a-f]{32}$/;

  const dayKey = (t) => {
    const d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const round2 = (n) => Math.round(Math.max(0, Math.min(1, n || 0)) * 100) / 100;
  const mins = (ms) => Math.round((ms || 0) / 60000);
  const audiobook = (p) => !!(p.audio && p.audio.parts && !p.audio.overlay);
  const ext = (p) => String((p.file && (p.file.ext || p.file.kind)) || "").toLowerCase();
  // A short, stable name for a story's page.
  const hash = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };

  // What a library entry is, or null when it's never shared. `folder` is
  // its collection's marks: { books } (its PDFs count as books).
  function kindOf(p, folder) {
    if (!p || p.note || p.preview) return null;
    if (audiobook(p)) return "audiobook";
    const e = ext(p);
    if (p.comic || e === "cbz") return "comic";
    if (BOOK_EXTS.has(e)) return "book";
    if (e === "pdf") return p.book || (folder && folder.books) ? "book" : null;
    if (!p.file && /^https?:/.test(p.url || "")) return "article";
    return null;
  }
  // The same file read from outside has its own clip id on each device;
  // its fingerprint is the one name they share.
  const idOf = (p) => (p.link && p.file && FP.test(p.file.fp || "") ? "f" + p.file.fp : p.id);

  // How far in: an audiobook by its time, the rest by their place.
  function partOf(p, t) {
    if (audiobook(p)) {
      const dur = (p.audio && p.audio.dur) || (p.listen && p.listen.dur) || 0;
      return p.finished ? 1 : dur > 0 ? ((p.listen && p.listen.t) || 0) / dur : 0;
    }
    return p.finished ? 1 : Math.max(p.at || 0, (t && t.far) || 0);
  }
  // Time in it. Reading counts while it's on screen, listening while it
  // plays; both run while an audiobook plays on screen, so the larger.
  const msOf = (t) => (t ? Math.max(t.readMs || 0, t.aloudMs || 0) : 0);

  // `pages`: the library (every entry, files read from outside too).
  // `totals`: the stats added up over every device ({ days, clips }).
  // `opts.kinds`: which kinds are shared. `opts.now`: for updatedAt.
  function build(pages, totals, opts = {}) {
    const kinds = { ...DEFAULT_KINDS, ...(opts.kinds || {}) };
    const days = (totals && totals.days) || {};
    const clips = (totals && totals.clips) || {};
    // The first day each clip had any time: when it was started.
    const first = {};
    for (const k of Object.keys(days).sort()) for (const [id, ms] of Object.entries(days[k].clips || {})) if (ms > 0 && !first[id]) first[id] = k;

    const byFolder = new Map();
    for (const p of pages) if (p.folder) {
      const k = p.folder.toLocaleLowerCase();
      if (!byFolder.has(k)) byFolder.set(k, []);
      byFolder.get(k).push(p);
    }
    const folderOf = (p) => (p.folder ? byFolder.get(p.folder.toLocaleLowerCase()) : null);
    const marks = new Map();
    for (const [k, list] of byFolder) marks.set(k, {
      off: list.some((p) => p.folderNoShare),
      books: list.some((p) => p.folderBooks),
      source: (list.find((p) => p.source) || {}).source || "",
    });
    const markOf = (p) => (p.folder ? marks.get(p.folder.toLocaleLowerCase()) : null);

    const items = [];
    const finishedDay = (p, t) => (t && t.finished ? dayKey(t.finished) : p.readAt ? dayKey(p.readAt) : dayKey(p.savedAt || Date.now()));
    for (const p of pages) {
      const m = markOf(p);
      if (p.noShare || (m && m.off)) continue;
      // A serial's chapters are the serial, below.
      if (m && m.source && !p.file && !p.note) continue;
      const kind = kindOf(p, m);
      if (!kind || !kinds[kind]) continue;
      const t = clips[p.id] || null;
      const part = partOf(p, t), ms = msOf(t);
      if (ms < MIN_MS && part < MIN_PART && !p.finished) continue;
      const item = { id: idOf(p), kind, title: p.title || "", author: p.byline || "", collection: p.folder || "", progress: round2(part) };
      if (kind === "audiobook" && p.audio && Array.isArray(p.audio.chapters) && p.audio.chapters.length > 1) {
        const at = (p.listen && p.listen.t) || 0;
        item.chapters = { read: p.finished ? p.audio.chapters.length : p.audio.chapters.filter((c, i) => (p.audio.chapters[i + 1] ? p.audio.chapters[i + 1].t : Infinity) <= at).length, total: p.audio.chapters.length };
      }
      item.startedAt = first[p.id] || (t && t.last ? dayKey(t.last) : null);
      item.finishedAt = p.finished ? finishedDay(p, t) : null;
      item.minutes = mins(ms);
      items.push(item);
    }

    if (kinds.serial) for (const [k, list] of byFolder) {
      const m = marks.get(k);
      if (!m.source || m.off) continue;
      const chapters = list.filter((p) => !p.file && !p.note && !p.preview && !p.noShare);
      if (!chapters.length) continue;
      const read = chapters.filter((p) => p.finished).length;
      let ms = 0, start = null, done = 0;
      for (const p of chapters) {
        const t = clips[p.id];
        ms += msOf(t);
        const s = first[p.id];
        if (s && (!start || s < start)) start = s;
        if (p.finished) done = Math.max(done, (t && t.finished) || p.readAt || 0);
      }
      const part = read / chapters.length;
      if (ms < MIN_MS && part < MIN_PART) continue;
      const by = chapters.find((p) => p.byline);
      items.push({
        id: "s" + hash(m.source), kind: "serial", title: list[0].folder, author: by ? by.byline : "", collection: list[0].folder,
        progress: round2(part), chapters: { read, total: chapters.length },
        startedAt: start, finishedAt: read === chapters.length ? (done ? dayKey(done) : null) : null, minutes: mins(ms),
      });
    }

    // Minutes a day, reading and listening apart. Reading is by eye
    // (paceMs, not while anything plays); before 1.41.0 kept it, all of it.
    const out = {};
    for (const k of Object.keys(days).sort()) {
      const d = days[k];
      const read = mins(d.paceMs || (d.aloudMs ? Math.max(0, (d.readMs || 0) - d.aloudMs) : d.readMs));
      const listened = mins(d.aloudMs);
      if (read || listened) out[k] = { read, listened };
    }
    items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { schema: SCHEMA, app: "waypage", updatedAt: new Date(opts.now || Date.now()).toISOString().replace(/\.\d{3}Z$/, "Z"), items, days: out };
  }

  // Files read from outside are on one device only. Items for files this
  // device doesn't have stay as the file had them, so two devices don't
  // keep taking each other's away. `known`: the fingerprint ids of every
  // outside file here, shared or not.
  function carry(doc, prev, known) {
    if (!prev || !Array.isArray(prev.items)) return doc;
    const have = new Set(doc.items.map((i) => i.id));
    const kept = prev.items.filter((i) => i && typeof i.id === "string" && /^f[0-9a-f]{32}$/.test(i.id) && !have.has(i.id) && !known.has(i.id) && KINDS.includes(i.kind));
    if (!kept.length) return doc;
    const items = doc.items.concat(kept).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { ...doc, items };
  }
  // What changed, without the time it was written.
  const sig = (doc) => hash(JSON.stringify({ ...doc, updatedAt: "" }));

  C.activity = { build, kindOf, carry, sig, idOf, KINDS, DEFAULT_KINDS, SCHEMA };
})();
