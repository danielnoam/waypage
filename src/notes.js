// Waypage: notes (2.0.0). A note is a library item you draw on: a stack of
// sheets in one scroll. A sheet is a page of paper (blank, lines or
// squares) that the app draws itself, or a page of a PDF the note was made
// from (a copy of it is kept beside the note: base.pdf). A note is opened
// through the same pipeline as a PDF's printed pages (files.js fillPdf,
// drawNear, ink.js), by handing it a stand-in for the pdf.js document:
// `handle` answers draw(n, width) with a sheet's picture. A note grows as
// you write: a stroke on its last sheet adds a sheet of paper. Its sheets
// are in note.json, its strokes in ink.json (ink.js), beside the item.
(function () {
  const C = window.Waypage;
  // A4 in points, the size a PDF page is measured in.
  const W = 595, H = 842;
  const PAPERS = ["blank", "lines", "squares"];
  const LABELS = { blank: "Blank note", lines: "Lines note", squares: "Squares note" };
  const MAX_SHEETS = 500;
  // A PDF's copy is kept whole beside the note, so a very big one is refused.
  const MAX_BASE = 100 * 1024 * 1024;

  const paperOf = (v) => (PAPERS.includes(v) ? v : "blank");
  const title = () => "Note, " + new Date().toLocaleDateString(undefined, { day: "numeric", month: "short" });

  // A sheet of paper as a picture, `width` px wide. Lines are ruled about
  // 8 mm apart, squares about 5 mm, in a light ink so a pen stays the
  // loudest thing on the page.
  function paintPaper(g, kind, w, h) {
    const k = w / W;
    g.fillStyle = "#fdfcf8";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c8d2e2";
    g.lineWidth = Math.max(1, k * 0.6);
    g.beginPath();
    if (kind === "lines") {
      const step = 22.7 * k;
      for (let y = 64 * k; y < h - 20 * k; y += step) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); }
    } else if (kind === "squares") {
      const step = 14.2 * k;
      for (let x = step; x < w; x += step) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, h); }
      for (let y = step; y < h; y += step) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(w, Math.round(y) + 0.5); }
    }
    g.stroke();
  }
  // The canvas as JPEG bytes; the canvas is let go.
  const jpeg = (c, q) => new Promise((res, rej) => c.toBlob(async (b) => {
    c.width = c.height = 0;
    if (!b) { rej(new Error("no picture")); return; }
    res(new Uint8Array(await b.arrayBuffer()));
  }, "image/jpeg", q));
  function paper(kind, width) {
    const w = Math.max(200, Math.min(2400, Math.round(width || 1200)));
    const h = Math.round(w * H / W);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    paintPaper(c.getContext("2d"), kind, w, h);
    return jpeg(c, 0.85);
  }

  // A note as a PDF (2.0.0): each sheet drawn with its strokes, about 150
  // dpi, written by pptx.js writePdf as a picture to a page. Sheets after
  // the last one written on are left out (a PDF's own pages all stay).
  // `handle` is the open note's (heldPdf); `strokesOf(n)` is ink.js's.
  // The file's name: the note's, without what a file name can't have.
  const pdfName = (meta) => (meta.title || "Note").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) + ".pdf";
  // One sheet as a canvas `w` px wide: its own picture (paper, or the
  // PDF's page), then what is drawn on it. `texts` collects typed text as
  // a PDF's invisible words, when given.
  async function sheetCanvas(handle, n, w, strokes, images, texts) {
    const [pw, ph] = handle.sizes[n - 1] || [W, H];
    const h = Math.round(w * ph / pw);
    const font = (z) => "400 " + Math.round(z * w * 100) / 100 + "px " + C.ink.TEXT_FONT;
    const bg = await createImageBitmap(new Blob([await handle.draw(n, w)], { type: "image/jpeg" }));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(bg, 0, 0, w, h);
    bg.close();
    // Strokes are in page widths, so one scale puts them on the sheet.
    g.setTransform(w, 0, 0, w, 0, 0);
    for (const s of strokes) {
      // Typed text: set in pixels (a font that small isn't asked of a scaled canvas), and
      // also written as the PDF's invisible words, so it can be searched.
      if (s.t === "x") {
        const rgb = C.ink.rgbOf(s) || [28, 27, 25];
        g.save();
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "rgb(" + rgb.join(",") + ")";
        g.font = font(s.z);
        s.text.split("\n").forEach((line, i) => {
          const y = s.y + s.z * (0.95 + i * C.ink.TEXT_LINE);
          g.fillText(line, s.x * w, y * w);
          if (texts && line.trim()) texts.push({ text: line, size: s.z * pw, x: s.x * pw, y: y * pw, width: Math.max(1, g.measureText(line).width / w * pw) });
        });
        g.restore();
        continue;
      }
      // A picture put on the sheet (width and height in page widths).
      if (s.t === "i") {
        const url = (images && images[s.f]) || C.ink.imageUrl(s.f);
        if (url) { try { const im = await createImageBitmap(await (await fetch(url)).blob()); g.drawImage(im, s.x, s.y, s.w, s.h); im.close(); } catch (e) { /* left out */ } }
        continue;
      }
      const rgb = C.ink.rgbOf(s) || [28, 27, 25];
      const col = "rgb(" + rgb.join(",") + ")";
      if (s.t === "h") {
        g.save();
        g.globalAlpha = 0.55; g.globalCompositeOperation = "multiply";
        g.strokeStyle = col; g.lineWidth = s.w; g.lineCap = "butt"; g.lineJoin = "round";
        g.stroke(new Path2D(C.ink.linePath(s.p)));
        g.restore();
      } else { g.fillStyle = col; g.fill(new Path2D(C.ink.penPath(s.p, s.w, s.y))); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    return { c, pw, ph, h };
  }
  async function toPdf(meta, handle, strokesOf, onProgress, images) {
    const count = handle.count;
    let last = 1;
    for (let n = 1; n <= count; n++) if (strokesOf(n).length || handle.sheets[n - 1].bg === "pdf") last = n;
    const w = 1240, pages = [];
    for (let n = 1; n <= last; n++) {
      if (onProgress) onProgress(n - 1, last);
      const texts = [];
      const { c, pw, ph, h } = await sheetCanvas(handle, n, w, strokesOf(n), images, texts);
      pages.push({ jpeg: await jpeg(c, 0.9), iw: w, ih: h, texts, w: pw, h: ph });
      await new Promise((r) => setTimeout(r, 0));
    }
    if (onProgress) onProgress(last, last);
    return { blob: C.pptx.writePdf(pages), name: pdfName(meta), sheets: last };
  }
  // A note's card picture (2026-11): its first sheet as it is now, drawn on.
  async function cover(handle, strokes, images) {
    const { c } = await sheetCanvas(handle, 1, 360, strokes || [], images);
    return jpeg(c, 0.8);
  }

  // note.json read back: a sheet is paper or a page of the PDF; anything
  // else is dropped, and a note always has a sheet.
  function clean(d) {
    const sheets = [];
    for (const s of (d && Array.isArray(d.sheets) ? d.sheets : []).slice(0, MAX_SHEETS)) {
      if (s && s.bg === "paper") sheets.push({ bg: "paper" });
      else if (s && s.bg === "pdf" && Number.isInteger(s.n) && s.n >= 1) sheets.push({ bg: "pdf", n: s.n });
    }
    if (!sheets.length) sheets.push({ bg: "paper" });
    return { v: 1, sheets };
  }

  // What drawNear and fillPdf ask of an open PDF, for a note. `base` is
  // the open PDF a note made from one draws its pages from.
  function handle(meta, data, base) {
    const sheets = data.sheets;
    const kind = paperOf(meta.note && meta.note.paper);
    const h = {
      sheets,
      get count() { return sheets.length; },
      get pages() { return sheets.length; },
      // A page of the PDF whose size isn't known yet has none (fillPdf
      // gives it its neighbour's and marks it a guess); the last sheet
      // always has one, which fillPdf takes for a page not yet known.
      get sizes() {
        const out = sheets.map((s) => (s.bg === "pdf" ? (base && base.sizes[s.n - 1]) || null : [W, H]));
        if (!out[out.length - 1]) out[out.length - 1] = [...out].reverse().find(Boolean) || [W, H];
        return out;
      },
      onSizes: null,
      draw: (n, width) => {
        const s = sheets[n - 1];
        return s && s.bg === "pdf" && base ? base.draw(s.n, width) : paper(kind, width);
      },
      text: async () => [],
      outline: async () => [],
      close() { if (base) base.close(); },
      // One more sheet of paper at the end; the page that shows it is files.js addSheet.
      add() {
        if (sheets.length >= MAX_SHEETS) return false;
        sheets.push({ bg: "paper" });
        return true;
      },
    };
    if (base) base.onSizes = () => { if (h.onSizes) h.onSizes(); };
    return h;
  }

  async function open(meta) {
    const data = clean(await C.store.readNote(meta.id));
    let base = null;
    if (data.sheets.some((s) => s.bg === "pdf")) {
      const bytes = await C.store.readNoteBase(meta.id);
      if (!bytes) throw new C.files.FileError("This note's PDF is missing, so its pages can't be shown.");
      try { base = await C.pdf.open(bytes instanceof Blob ? bytes : new Blob([bytes], { type: "application/pdf" })); }
      catch (e) { throw new C.files.FileError("Waypage can't read this note's PDF any more."); }
    }
    return { data, handle: handle(meta, data, base) };
  }
  const keep = (id, data) => C.store.writeNote(id, { v: 1, sheets: data.sheets });

  const entry = (id, name, note) => ({
    id, url: "", title: name, site: "", byline: "", licence: null, savedAt: Date.now(), minutes: 0, lang: "", dir: "ltr", mode: "full",
    next: "", prev: "", at: 0, finished: false, images: 0, missing: 0, imageBytes: 0, note,
  });
  // The page a note is stored as: only a shell, its sheets are drawn from note.json.
  async function keepNew(meta, sheets, base) {
    const out = document.implementation.createHTMLDocument("");
    const root = out.createElement("div");
    root.className = "co-body";
    try {
      meta.bytes = await C.store.writePage(meta.id, C.save.savedPageHtml(meta, root, out), meta);
      await C.store.writeNote(meta.id, { v: 1, sheets });
      await C.store.writeText(meta.id, "");
      if (base) { meta.bytes += await C.store.writeNoteBase(meta.id, base); meta.noteBytes = base.size; }
    } catch (e) {
      await C.store.removePage(meta.id);
      throw e;
    }
    return meta;
  }

  // A new, empty note on `kind` of paper. Resolves to its library entry,
  // which the caller puts first in the library.
  async function create(kind) {
    kind = paperOf(kind);
    return keepNew(entry(C.save.newId(), title(), { paper: kind }), [{ bg: "paper" }]);
  }

  // A note brought back from its files (Recover): `got` is what sync's
  // noteFilesIn reads, { note, ink?, imgs, base? }. It always has an id of
  // its own, as the old one may have a deletion marker in sync.
  async function bring(name, paper, got) {
    const meta = entry(C.save.newId(), (name || "Note").slice(0, 300).trim(), { paper: paperOf(paper) });
    const base = got.base ? new Blob([got.base], { type: "application/pdf" }) : null;
    await keepNew(meta, clean(got.note).sheets, base);
    try {
      if (got.ink) await C.store.writeInk(meta.id, got.ink);
      for (const [f, url] of Object.entries(got.imgs || {})) await C.store.writeInkImage(meta.id, f, url);
    } catch (e) {
      await C.store.removePage(meta.id);
      throw e;
    }
    meta.editedAt = Date.now();
    return meta;
  }

  // A note made from a PDF (`src` is its library entry, or just { title } for a
  // file picked to be one; `blob` its bytes):
  // a copy of the PDF is kept, one sheet to a page, and the PDF itself is
  // never touched. The sheets it grows by are lined paper.
  async function fromPdf(src, blob) {
    if (blob.size > MAX_BASE) throw new C.files.FileError("This PDF is too big to make a note from (over 100 MB).");
    let pages = 0;
    try { const doc = await C.pdf.open(blob); pages = doc.count || doc.pages || 0; doc.close(); }
    catch (e) { throw new C.files.FileError("Waypage can't read this PDF."); }
    if (!pages) throw new C.files.FileError("There are no pages in this PDF.");
    if (pages > MAX_SHEETS) throw new C.files.FileError("This PDF has over " + MAX_SHEETS + " pages, too many for a note.");
    const name = (src.title || "PDF").slice(0, 300).trim();
    const sheets = Array.from({ length: pages }, (_, i) => ({ bg: "pdf", n: i + 1 }));
    return keepNew(entry(C.save.newId(), name, { paper: "lines", ...(src.id ? { from: src.id } : {}) }), sheets, blob);
  }

  // Any clip of a file as a PDF to make a note from (2026-11): a comic's
  // pictures one to a page; anything else set as a book's pages, its
  // headings, paragraphs and pictures in order on A4. `root` is the
  // clip's body, `picture(img)` resolves to an <img>'s bytes or null.
  // Resolves to the PDF as a Blob.
  const PX = 1100, PY = Math.round(PX * H / W), MARGIN = 110;
  const FONT = "Georgia, 'Times New Roman', serif";
  const SIZE = { H1: 50, H2: 42, H3: 36, H4: 32, H5: 30, H6: 30 };
  async function layout(root, comic, picture, onProgress, title) {
    const pages = [];
    const done = async (c, w, h) => {
      if (pages.length >= MAX_SHEETS) throw new C.files.FileError("This is over " + MAX_SHEETS + " pages long, too long for a note.");
      pages.push({ jpeg: await jpeg(c, 0.8), iw: w, ih: h, texts: [], w: W, h: Math.round(W * h / w) });
      if (onProgress) onProgress(pages.length);
      await new Promise((r) => setTimeout(r, 0));
    };
    const bitmap = async (img) => {
      try { const b = await picture(img); return b ? await createImageBitmap(new Blob([b], { type: C.backup.imageType(b) || "image/jpeg" })) : null; } catch (e) { return null; }
    };
    const imgs = [...root.querySelectorAll("img")];
    if (comic) {
      for (const img of imgs) {
        const bmp = await bitmap(img);
        if (!bmp) continue;
        const w = Math.min(PX, bmp.width), h = Math.max(1, Math.round(bmp.height * w / bmp.width));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(bmp, 0, 0, w, h);
        bmp.close();
        await done(c, w, h);
      }
      if (!pages.length) throw new C.files.FileError("There are no pictures to make a note from.");
      return C.pptx.writePdf(pages);
    }
    let c = null, g = null, y = 0;
    const fresh = () => {
      c = document.createElement("canvas");
      c.width = PX; c.height = PY;
      g = c.getContext("2d");
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, PX, PY);
      g.fillStyle = "#1c1b19"; g.textBaseline = "alphabetic";
      y = MARGIN;
    };
    const flush = async () => { if (c && y > MARGIN) await done(c, PX, PY); c = null; };
    const room = async (h) => { if (!c) fresh(); if (y + h > PY - MARGIN && y > MARGIN) { await flush(); fresh(); } };
    const width = PX - MARGIN * 2;
    const words = async (text, size, bold, gap, indent = 0) => {
      g || fresh();
      const font = (bold ? "700 " : "400 ") + size + "px " + FONT;
      g.font = font;
      const line = Math.round(size * 1.45);
      let cur = "";
      const lines = [];
      for (const w of text.split(/\s+/).filter(Boolean)) {
        const next = cur ? cur + " " + w : w;
        if (g.measureText(next).width > width - indent && cur) { lines.push(cur); cur = w; } else cur = next;
      }
      if (cur) lines.push(cur);
      for (const l of lines) {
        await room(line);
        g.font = font; g.fillStyle = "#1c1b19";
        g.fillText(l, MARGIN + indent, y + size);
        y += line;
      }
      y += gap;
    };
    // The title first, as the reader shows it above the text.
    if (title && !root.querySelector("h1")) await words(title, SIZE.H1, true, 28);
    const BLOCK = "h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dt,dd,figcaption,img";
    for (const b of root.querySelectorAll(BLOCK)) {
      // Only the innermost block: a paragraph inside a quote is set once.
      if (b.tagName !== "IMG" && b.querySelector(BLOCK.replace(",img", ""))) continue;
      if (b.tagName === "IMG") {
        const bmp = await bitmap(b);
        if (!bmp) continue;
        const w = Math.min(width, bmp.width * 1.5), h = Math.min(PY - MARGIN * 2, Math.round(bmp.height * w / bmp.width));
        const ww = Math.round(bmp.width * h / bmp.height);
        await room(h);
        g.drawImage(bmp, MARGIN + (width - ww) / 2, y, ww, h);
        bmp.close();
        y += h + 24;
        continue;
      }
      const text = b.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const head = SIZE[b.tagName];
      if (head) { await room(head * 3); y += 18; await words(text, head, true, 20); }
      else await words((b.tagName === "LI" ? "• " : "") + text, 30, false, 22, b.tagName === "BLOCKQUOTE" || b.tagName === "DD" ? 40 : 0);
    }
    await flush();
    if (!pages.length) throw new C.files.FileError("There's nothing in it to make a note from.");
    return C.pptx.writePdf(pages);
  }

  C.notes = { PAPERS, LABELS, paper, toPdf, cover, layout, pdfName, create, bring, fromPdf, open, keep, W, H };
})();
