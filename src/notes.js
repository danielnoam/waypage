// Waypage: notes (2.0.0). A note is a library item you draw on: a stack of
// A4 sheets in one scroll, each a page of paper (blank, lines or squares)
// that the app draws itself. It is opened through the same pipeline as a
// PDF's printed pages (files.js fillPdf, drawNear, ink.js), by handing it a
// stand-in for the pdf.js document: `handle` answers draw(n, width) with a
// sheet's picture. A note grows as you write: a stroke on its last sheet
// adds another. Its sheets are in note.json, its strokes in ink.json
// (ink.js), beside the item.
(function () {
  const C = window.Waypage;
  // A4 in points, the size a PDF page is measured in.
  const W = 595, H = 842;
  const PAPERS = ["blank", "lines", "squares"];
  const LABELS = { blank: "Blank note", lines: "Lines note", squares: "Squares note" };
  const MAX_SHEETS = 500;

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
  // the last one written on are left out. `strokesOf(n)` is ink.js's.
  async function toPdf(meta, count, strokesOf, onProgress) {
    let last = 1;
    for (let n = 1; n <= count; n++) if (strokesOf(n).length) last = n;
    const w = 1240, h = Math.round(w * H / W), pages = [];
    for (let n = 1; n <= last; n++) {
      if (onProgress) onProgress(n - 1, last);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d");
      paintPaper(g, paperOf(meta.note && meta.note.paper), w, h);
      // Strokes are in page widths, so one scale puts them on the sheet.
      g.setTransform(w, 0, 0, w, 0, 0);
      for (const s of strokesOf(n)) {
        const rgb = (s.t === "h" ? C.ink.HIGHLIGHT : C.ink.PEN)[s.c] || [28, 27, 25];
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
      pages.push({ jpeg: await jpeg(c, 0.9), iw: w, ih: h, texts: [], w: W, h: H });
      await new Promise((r) => setTimeout(r, 0));
    }
    if (onProgress) onProgress(last, last);
    return { blob: C.pptx.writePdf(pages), name: (meta.title || "Note").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 120) + ".pdf", sheets: last };
  }

  // note.json read back: anything else is dropped.
  function clean(d) {
    const sheets = d && Array.isArray(d.sheets) ? d.sheets.slice(0, MAX_SHEETS).filter((s) => s && s.bg === "paper") : [];
    if (!sheets.length) sheets.push({ bg: "paper" });
    return { v: 1, sheets: sheets.map(() => ({ bg: "paper" })) };
  }

  // What drawNear and fillPdf ask of an open PDF, for a note.
  function handle(meta, data) {
    const sheets = data.sheets;
    const h = {
      get count() { return sheets.length; },
      get pages() { return sheets.length; },
      sizes: sheets.map(() => [W, H]),
      onSizes: null,
      draw: (n, width) => paper(paperOf(meta.note && meta.note.paper), width),
      text: async () => [],
      outline: async () => [],
      close() { /* nothing is held */ },
      // One more sheet at the end; the page that shows it is files.js addSheet.
      add() {
        if (sheets.length >= MAX_SHEETS) return false;
        sheets.push({ bg: "paper" });
        h.sizes.push([W, H]);
        return true;
      },
    };
    return h;
  }

  async function open(meta) {
    const data = clean(await C.store.readNote(meta.id));
    return { data, handle: handle(meta, data) };
  }
  const keep = (id, data) => C.store.writeNote(id, data);

  // A new, empty note on `kind` of paper. Resolves to its library entry,
  // which the caller puts first in the library.
  async function create(kind) {
    kind = paperOf(kind);
    const id = C.save.newId();
    const out = document.implementation.createHTMLDocument("");
    const root = out.createElement("div");
    root.className = "co-body";
    const meta = {
      id, url: "", title: title(), site: "", byline: "", licence: null, savedAt: Date.now(), minutes: 0, lang: "", dir: "ltr", mode: "full",
      next: "", prev: "", at: 0, finished: false, images: 0, missing: 0, imageBytes: 0, note: { paper: kind },
    };
    try {
      meta.bytes = await C.store.writePage(id, C.save.savedPageHtml(meta, root, out), meta);
      await C.store.writeNote(id, { v: 1, sheets: [{ bg: "paper" }] });
      await C.store.writeText(id, "");
    } catch (e) {
      await C.store.removePage(id);
      throw e;
    }
    return meta;
  }

  C.notes = { PAPERS, LABELS, paper, toPdf, create, open, keep, W, H };
})();
