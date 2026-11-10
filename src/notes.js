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
  async function toPdf(meta, handle, strokesOf, onProgress) {
    const count = handle.count;
    let last = 1;
    for (let n = 1; n <= count; n++) if (strokesOf(n).length || handle.sheets[n - 1].bg === "pdf") last = n;
    const w = 1240, pages = [];
    const font = (z) => "400 " + Math.round(z * w * 100) / 100 + "px " + C.ink.TEXT_FONT;
    for (let n = 1; n <= last; n++) {
      if (onProgress) onProgress(n - 1, last);
      const [pw, ph] = handle.sizes[n - 1] || [W, H];
      const h = Math.round(w * ph / pw);
      // The sheet's own picture (paper, or the PDF's page), then the strokes.
      const bg = await createImageBitmap(new Blob([await handle.draw(n, w)], { type: "image/jpeg" }));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      g.drawImage(bg, 0, 0, w, h);
      bg.close();
      // Strokes are in page widths, so one scale puts them on the sheet.
      g.setTransform(w, 0, 0, w, 0, 0);
      const texts = [];
      for (const s of strokesOf(n)) {
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
            if (line.trim()) texts.push({ text: line, size: s.z * pw, x: s.x * pw, y: y * pw, width: Math.max(1, g.measureText(line).width / w * pw) });
          });
          g.restore();
          continue;
        }
        // A picture put on the sheet (width and height in page widths).
        if (s.t === "i") {
          const url = C.ink.imageUrl(s.f);
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
      pages.push({ jpeg: await jpeg(c, 0.9), iw: w, ih: h, texts, w: pw, h: ph });
      await new Promise((r) => setTimeout(r, 0));
    }
    if (onProgress) onProgress(last, last);
    return { blob: C.pptx.writePdf(pages), name: (meta.title || "Note").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) + ".pdf", sheets: last };
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
      if (base) meta.bytes += await C.store.writeNoteBase(meta.id, base);
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

  // A note made from a PDF (`src` is its library entry, `blob` its bytes):
  // a copy of the PDF is kept, one sheet to a page, and the PDF itself is
  // never touched. The sheets it grows by are lined paper.
  async function fromPdf(src, blob) {
    if (blob.size > MAX_BASE) throw new C.files.FileError("This PDF is too big to make a note from (over 100 MB).");
    let pages = 0;
    try { const doc = await C.pdf.open(blob); pages = doc.count || doc.pages || 0; doc.close(); }
    catch (e) { throw new C.files.FileError("Waypage can't read this PDF."); }
    if (!pages) throw new C.files.FileError("There are no pages in this PDF.");
    if (pages > MAX_SHEETS) throw new C.files.FileError("This PDF has over " + MAX_SHEETS + " pages, too many for a note.");
    const name = ((src.title || "PDF").slice(0, 280) + " (note)").trim();
    const sheets = Array.from({ length: pages }, (_, i) => ({ bg: "pdf", n: i + 1 }));
    return keepNew(entry(C.save.newId(), name, { paper: "lines", from: src.id }), sheets, blob);
  }

  C.notes = { PAPERS, LABELS, paper, toPdf, create, fromPdf, open, keep, W, H };
})();
