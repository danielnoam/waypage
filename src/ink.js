// Waypage: drawing on a PDF's printed pages with a pen (1.56.0). A page
// gets a layer of SVG over its picture, a sibling of its words' layer
// (reader.js placeText puts both over the picture); a stroke is one path
// in it. Strokes are kept as points in fractions of the page's width
// (x, y, pressure), so they paint again at any zoom, width or layout, and
// the file they are drawn on is never touched: a copy with the drawings
// as ink annotations is made on request (pdf.js inkOf). They are this
// device's alone, like the file (store.js readInk).
(function () {
  const C = window.Waypage;
  const NS = "http://www.w3.org/2000/svg";

  // Colours by name, so a theme can show them its own way (reader.css).
  // The rgb is what a copy of the PDF gets.
  const PEN = { ink: [28, 27, 25], red: [208, 49, 45], blue: [43, 97, 196], green: [46, 139, 87] };
  const HIGHLIGHT = { yellow: [255, 214, 10], green: [91, 214, 107], blue: [90, 176, 255], pink: [255, 122, 182], purple: [181, 140, 255] };
  // Widths as fractions of the page's width, five steps: the pen's about 0.7,
  // 1.2, 2, 3 and 4.5 px on a 600 px page. The highlighter is wider.
  const SIZES = { pen: [0.0012, 0.0022, 0.0034, 0.005, 0.0072], highlighter: [0.01, 0.016, 0.022, 0.028, 0.036] };
  // How a pen writes: a ballpoint (wider with pressure), a marker (one
  // width), a fountain pen (a slanted nib: thick across it, thin along
  // it) and a brush (a strong pressure response, tapered ends).
  const STYLES = ["ball", "marker", "fountain", "brush"];
  const NIB = -Math.PI / 4;
  const MAX_POINTS = 6000, MAX_STROKES = 5000;
  // Typed text on a note (2.0.0): sizes as fractions of the page's width, and
  // a line's height in sizes.
  const TEXT_SIZES = [0.018, 0.026, 0.038], TEXT_LINE = 1.25, MAX_TEXT = 4000;
  const TEXT_FONT = "Instrument Sans, system-ui, sans-serif";

  // A colour of your own is "#rrggbb" in place of a name (the colour picker).
  const isHex = (c) => typeof c === "string" && /^#[0-9a-f]{6}$/.test(c);
  const hexRgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))).toString(16).padStart(2, "0")).join("");
  // h 0-360, s and v 0-1, to r, g, b 0-255, and back.
  function hsvRgb(h, sat, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * sat * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5), f(3), f(1)].map((x) => Math.round(x * 255));
  }
  function rgbHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [Math.round(h * 60 * 10) / 10, max ? d / max : 0, max];
  }
  const rgbOf = (s) => (isHex(s.c) ? hexRgb(s.c) : (s.t === "h" ? HIGHLIGHT : PEN)[s.c]);
  const okColor = (kind, c) => isHex(c) || Object.prototype.hasOwnProperty.call(kind === "highlighter" ? HIGHLIGHT : PEN, c);

  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  // A pen's radius at a pressure: an even line (0.5) is the size itself.
  const radius = (w, pr, style) => {
    const half = w / 2;
    if (style === "marker") return half * 1.15;
    if (style === "brush") return half * (0.2 + 1.6 * pr);
    if (style === "fountain") return half * (0.8 + 0.4 * pr);
    return half * (0.55 + 0.9 * pr);
  };
  // How wide a fountain pen's nib draws going this way: thin along the
  // nib's edge, thick across it.
  const nibWidth = (dx, dy) => 0.3 + 0.7 * Math.abs(Math.sin(Math.atan2(dy, dx) - NIB));

  // ---- Drawing a stroke ----

  // A pen stroke as a filled outline, wider with pressure, with round
  // ends, smoothed through the midpoints of its sides. `p` is x, y,
  // pressure triples; the path is in the layer's units (page widths).
  function penPath(p, w, style) {
    const pts = [];
    for (let i = 0; i + 2 < p.length; i += 3) {
      const last = pts[pts.length - 1];
      const here = { x: p[i], y: p[i + 1], r: radius(w, p[i + 2], style) };
      // Points too close to say a direction are one, the last one kept.
      if (last && Math.hypot(here.x - last.x, here.y - last.y) < w * 0.15) { if (i + 3 >= p.length) { last.x = here.x; last.y = here.y; } continue; }
      pts.push(here);
    }
    if (!pts.length) return "";
    if (pts.length === 1) {
      const { x, y, r } = pts[0];
      return "M" + r5(x - r) + " " + r5(y) + "a" + r5(r) + " " + r5(r) + " 0 1 0 " + r5(2 * r) + " 0a" + r5(r) + " " + r5(r) + " 0 1 0 " + r5(-2 * r) + " 0z";
    }
    // Radii evened out over three points, so a jittery pressure doesn't
    // make the line lumpy.
    const rs = pts.map((q, i) => (pts[Math.max(0, i - 1)].r + q.r + pts[Math.min(pts.length - 1, i + 1)].r) / 3);
    // The way the line goes at each point.
    const dirs = pts.map((q, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      return [dx / len, dy / len];
    });
    // The nib's width follows the direction, evened out as the radii are.
    if (style === "fountain") {
      const k = dirs.map(([dx, dy]) => nibWidth(dx, dy));
      for (let i = 0; i < rs.length; i++) rs[i] *= (k[Math.max(0, i - 1)] + k[i] + k[Math.min(k.length - 1, i + 1)]) / 3;
    }
    // A brush comes to a point at both ends, over a few widths of the line.
    if (style === "brush") {
      const along = [0];
      for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
      const total = along[along.length - 1], reach = Math.min(w * 8, total / 2) || 1;
      for (let i = 0; i < rs.length; i++) rs[i] *= Math.max(0.08, Math.min(1, along[i] / reach, (total - along[i]) / reach));
    }
    const left = [], right = [];
    let d0 = dirs[0], dn = dirs[dirs.length - 1];
    for (let i = 0; i < pts.length; i++) {
      const [dx, dy] = dirs[i];
      left.push([pts[i].x - dy * rs[i], pts[i].y + dx * rs[i]]);
      right.push([pts[i].x + dy * rs[i], pts[i].y - dx * rs[i]]);
    }
    // A half circle round an end, from one side to the other through
    // the way the line was going.
    const cap = (c, r, d) => {
      const out = [];
      for (let k = 1; k < 6; k++) {
        const a = (Math.PI * k) / 6;
        out.push([c.x + r * (-d[1] * Math.cos(a) + d[0] * Math.sin(a)), c.y + r * (d[0] * Math.cos(a) + d[1] * Math.sin(a))]);
      }
      return out;
    };
    const n = pts.length - 1;
    const ring = [...left, ...cap(pts[n], rs[n], dn), ...right.reverse(), ...cap(pts[0], rs[0], [-d0[0], -d0[1]])];
    return smooth(ring) + "z";
  }

  // The points joined by curves through their midpoints.
  function smooth(ring) {
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let out = "";
    const first = mid(ring[ring.length - 1], ring[0]);
    out += "M" + r5(first[0]) + " " + r5(first[1]);
    for (let i = 0; i < ring.length; i++) {
      const m = mid(ring[i], ring[(i + 1) % ring.length]);
      out += "Q" + r5(ring[i][0]) + " " + r5(ring[i][1]) + " " + r5(m[0]) + " " + r5(m[1]);
    }
    return out;
  }

  // A highlighter stroke as a line (stroked, flat ended, in reader.css).
  function linePath(p) {
    const pts = [];
    for (let i = 0; i + 2 < p.length; i += 3) pts.push([p[i], p[i + 1]]);
    if (!pts.length) return "";
    if (pts.length === 1) return "M" + r5(pts[0][0]) + " " + r5(pts[0][1]) + "h0.0001";
    let out = "M" + r5(pts[0][0]) + " " + r5(pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      out += "Q" + r5(pts[i][0]) + " " + r5(pts[i][1]) + " " + r5(m[0]) + " " + r5(m[1]);
    }
    const e = pts[pts.length - 1];
    return out + "L" + r5(e[0]) + " " + r5(e[1]);
  }

  const pathOf = (s) => (s.t === "h" ? linePath(s.p) : penPath(s.p, s.w, s.y));
  // A picture or a line of typed text (2.0.0, notes) is a box, not a stroke.
  const boxy = (s) => s.t === "i" || s.t === "x";

  // Whether a point is on a stroke, to within `slop` (page widths).
  function hits(s, x, y, slop) {
    if (boxy(s)) return x >= s.x - slop && x <= s.x + s.w + slop && y >= s.y - slop && y <= s.y + s.h + slop;
    const reach = (s.t === "h" ? s.w : s.w * (s.y === "brush" ? 1.9 : 1.2)) / 2 + slop;
    const p = s.p;
    if (p.length < 6) return Math.hypot(p[0] - x, p[1] - y) <= reach;
    for (let i = 0; i + 5 < p.length; i += 3) {
      const ax = p[i], ay = p[i + 1], bx = p[i + 3], by = p[i + 4];
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
      if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= reach) return true;
    }
    return false;
  }

  // Whether a point is inside a loop (even-odd), the lasso's test.
  function inside(poly, x, y) {
    let in_ = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) in_ = !in_;
    }
    return in_;
  }
  // What a loop takes: a stroke with half its points inside, a picture with its middle.
  function within(poly, s) {
    if (boxy(s)) return inside(poly, s.x + s.w / 2, s.y + s.h / 2);
    let n = 0, all = 0;
    for (let i = 0; i + 2 < s.p.length; i += 3) { all++; if (inside(poly, s.p[i], s.p[i + 1])) n++; }
    return all > 0 && n * 2 >= all;
  }
  // The box round items, in page widths: [x, y, w, h].
  function boxOf(list) {
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const s of list) {
      if (boxy(s)) { a = Math.min(a, s.x); b = Math.min(b, s.y); c = Math.max(c, s.x + s.w); d = Math.max(d, s.y + s.h); continue; }
      const pad = s.w / 2;
      for (let i = 0; i + 2 < s.p.length; i += 3) { a = Math.min(a, s.p[i] - pad); b = Math.min(b, s.p[i + 1] - pad); c = Math.max(c, s.p[i] + pad); d = Math.max(d, s.p[i + 1] + pad); }
    }
    return a === Infinity ? null : [a - 0.006, b - 0.006, c - a + 0.012, d - b + 0.012];
  }
  const copyOf = (s) => JSON.parse(JSON.stringify(s));

  // ---- Pages as one surface ----
  // A stroke or picture that reaches over more than one page is kept on each
  // of them, whole, in that page's own widths and with the same id; each
  // layer clips what lies past its edge, so the pages show one connected
  // drawing. `pages` below is [{ n, rect: { left, top, width, height }, h }]
  // in client px, h being the page's height in its widths.

  // An item moved from one page's widths to another's, as a copy.
  function convertItem(s, from, to) {
    const c = copyOf(s), k = from.width / to.width;
    const ox = (from.left - to.left) / to.width, oy = (from.top - to.top) / to.width;
    if (boxy(c)) { c.x = r5(c.x * k + ox); c.y = r5(c.y * k + oy); c.w = r5(c.w * k); c.h = r5(c.h * k); if (c.t === "x") c.z = r5(c.z * k); return c; }
    for (let i = 0; i + 2 < c.p.length; i += 3) { c.p[i] = r4(c.p[i] * k + ox); c.p[i + 1] = r4(c.p[i + 1] * k + oy); }
    c.w = r5(c.w * k);
    return c;
  }
  // Items shifted together so their box lies inside a page of height h (a
  // box bigger than the page keeps its top left corner on it).
  function clampInto(items, h) {
    const b = boxOf(items);
    if (!b) return [0, 0];
    const fit = (lo, len, max) => (len >= max ? -lo : lo < 0 ? -lo : lo + len > max ? max - (lo + len) : 0);
    const dx = fit(b[0], b[2], 1), dy = fit(b[1], b[3], h);
    if (!dx && !dy) return [0, 0];
    for (const s of items) {
      if (boxy(s)) { s.x = r5(s.x + dx); s.y = r5(s.y + dy); continue; }
      for (let i = 0; i + 2 < s.p.length; i += 3) { s.p[i] = r4(s.p[i] + dx); s.p[i + 1] = r4(s.p[i + 1] + dy); }
    }
    return [dx, dy];
  }
  // Where an item drawn or dropped on page `origin` belongs: a copy on every
  // page its box reaches, or, when too little of it is on any page, on the
  // nearest one, moved inside. [{ n, s }]; the origin's own copy is `s`.
  function placeOn(s, origin, pages) {
    const from = pages.find((p) => p.n === origin);
    const b = boxOf([s]);
    if (!from || !b) return [{ n: origin, s }];
    const k = from.rect.width;
    const cb = { l: from.rect.left + b[0] * k, t: from.rect.top + b[1] * k, r: from.rect.left + (b[0] + b[2]) * k, b: from.rect.top + (b[1] + b[3]) * k };
    const hit = [];
    for (const p of pages) {
      const ox = Math.min(cb.r, p.rect.left + p.rect.width) - Math.max(cb.l, p.rect.left);
      const oy = Math.min(cb.b, p.rect.top + p.rect.height) - Math.max(cb.t, p.rect.top);
      if (ox > 0 && oy > 0) hit.push({ p, ox, oy });
    }
    let best = null;
    for (const h of hit) if (!best || h.ox * h.oy > best.ox * best.oy) best = h;
    const bw = cb.r - cb.l, bh = cb.b - cb.t;
    if (!best || best.ox < Math.min(bw, best.p.rect.width) * 0.25 || best.oy < Math.min(bh, best.p.rect.height) * 0.25) {
      let target = best && best.p;
      if (!target) {
        const cx = (cb.l + cb.r) / 2, cy = (cb.t + cb.b) / 2;
        let d = Infinity;
        for (const p of pages) {
          const dx = Math.max(p.rect.left - cx, 0, cx - (p.rect.left + p.rect.width)), dy = Math.max(p.rect.top - cy, 0, cy - (p.rect.top + p.rect.height));
          if (Math.hypot(dx, dy) < d) { d = Math.hypot(dx, dy); target = p; }
        }
      }
      const c = target.n === origin ? s : convertItem(s, from.rect, target.rect);
      clampInto([c], target.h);
      return [{ n: target.n, s: c }];
    }
    if (hit.length === 1 && hit[0].p.n === origin) return [{ n: origin, s }];
    return hit.map(({ p }) => ({ n: p.n, s: p.n === origin ? s : convertItem(s, from.rect, p.rect) }));
  }

  // ---- What's drawn on the open clip ----

  let clip = null;        // { id, size, pages: { "<n>": [stroke] } }
  let saveTimer = 0;
  let undos = [], redos = [];
  const imgs = new Map();   // file id -> data: URL of a picture put on a page
  let sel = null;           // the selection: { n, ids }
  let board = null;         // Copy and Cut: { items, n, k, imgs }
  let picker = null;        // the eyedropper waits: the next tap on a page goes to it
  let onChange = null, onPen = null, onProbe = null, onDraw = null, onStroke = null, onSaved = null;
  // Something changed since the last write: a note then counts as edited (sync).
  let dirty = false;
  const layers = new Map(); // page -> svg

  // A stroke read back from a file: anything else is dropped.
  function clean(s) {
    if (s && typeof s === "object" && s.t === "x") {
      const n = [s.x, s.y, s.w, s.h, s.z].map(Number);
      if (typeof s.text !== "string" || !s.text.trim() || s.text.length > MAX_TEXT || !n.every(Number.isFinite)) return null;
      if (!(n[4] >= 0.005 && n[4] <= 0.2 && n[2] > 0 && n[2] <= 3 && n[3] > 0 && n[3] <= 4 && n[0] > -2 && n[0] < 3 && n[1] > -2 && n[1] < 20)) return null;
      if (!okColor("pen", s.c)) return null;
      return { id: String(s.id || "").slice(0, 40) || C.save.newId(), t: "x", c: s.c, x: n[0], y: n[1], w: n[2], h: n[3], z: n[4], text: s.text };
    }
    if (s && typeof s === "object" && s.t === "i") {
      const n = [s.x, s.y, s.w, s.h].map(Number);
      if (typeof s.f !== "string" || !/^[A-Za-z0-9_-]{1,40}$/.test(s.f) || !n.every(Number.isFinite)) return null;
      if (!(n[2] > 0 && n[2] <= 2 && n[3] > 0 && n[3] <= 4 && n[0] > -2 && n[0] < 3 && n[1] > -2 && n[1] < 20)) return null;
      return { id: String(s.id || "").slice(0, 40) || C.save.newId(), t: "i", f: s.f, x: n[0], y: n[1], w: n[2], h: n[3] };
    }
    if (!s || typeof s !== "object" || (s.t !== "p" && s.t !== "h")) return null;
    if (!okColor(s.t === "h" ? "highlighter" : "pen", s.c)) return null;
    const w = Number(s.w);
    if (!(w > 0 && w < 0.2) || !Array.isArray(s.p) || s.p.length < 3 || s.p.length % 3 || s.p.length > MAX_POINTS * 3) return null;
    if (!s.p.every((v) => Number.isFinite(v))) return null;
    const out = { id: String(s.id || "").slice(0, 40) || C.save.newId(), t: s.t, c: s.c, w, p: s.p.map((v, i) => (i % 3 === 2 ? Math.min(1, Math.max(0, v)) : v)) };
    // How a pen wrote; a stroke from before styles, or one that names none we know, is a ballpoint's.
    if (s.t === "p" && STYLES.includes(s.y) && s.y !== "ball") out.y = s.y;
    return out;
  }
  async function load(meta) {
    unload();
    if (!meta || !meta.id) return { stale: false };
    const mine = { id: meta.id, size: (meta.file && meta.file.size) || 0, pages: {} };
    clip = mine;
    const d = await C.store.readInk(meta.id);
    if (clip !== mine) return { stale: false };
    let stale = false;
    if (d && d.pages && typeof d.pages === "object") {
      for (const [k, list] of Object.entries(d.pages)) {
        const n = Math.floor(Number(k));
        if (!(n >= 1 && n <= 20000) || !Array.isArray(list)) continue;
        const ok = list.slice(0, MAX_STROKES).map(clean).filter(Boolean);
        if (ok.length) mine.pages[n] = ok;
      }
      stale = !!(d.size && mine.size && d.size !== mine.size);
    }
    for (const n of shown()) show(n);
    changed();
    // The pictures put on pages come in after, each when it's read.
    const want = new Set();
    for (const list of Object.values(mine.pages)) for (const s of list) if (s.t === "i") want.add(s.f);
    for (const f of want) {
      const url = await C.store.readInkImage(mine.id, f);
      if (clip !== mine) break;
      if (url) { imgs.set(f, url); for (const n of layers.keys()) paint(n); }
    }
    return { stale };
  }
  // The strokes of an ink.json read without opening the note (a note's PDF
  // for Drive): n -> the strokes on page n.
  function strokesFrom(d) {
    const pages = {};
    if (d && d.pages && typeof d.pages === "object") {
      for (const [k, list] of Object.entries(d.pages)) {
        const n = Math.floor(Number(k));
        if (!(n >= 1 && n <= 20000) || !Array.isArray(list)) continue;
        const ok = list.slice(0, MAX_STROKES).map(clean).filter(Boolean);
        if (ok.length) pages[n] = ok;
      }
    }
    return (n) => pages[n] || [];
  }
  function unload() {
    flush();
    clip = null;
    undos = []; redos = [];
    layers.clear();
    imgs.clear();
    cur = null; sel = null; picker = null;
    changed();
  }
  function changed() { if (onChange) onChange(); }
  function save() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!clip) return Promise.resolve();
    const edited = dirty;
    dirty = false;
    const empty = !Object.values(clip.pages).some((l) => l.length);
    const id = clip.id;
    // A picture no page names any more (undo and redo keep it until now) goes.
    const used = new Set();
    for (const list of Object.values(clip.pages)) for (const s of list) if (s.t === "i") used.add(s.f);
    for (const op of [...undos, ...redos]) {
      for (const g of [...(op.del || []), ...(op.add || []), ...(op.s ? [{ s: op.s }] : [])]) if (g.s && g.s.t === "i") used.add(g.s.f);
      for (const lists of [op.before, op.after]) if (lists && !Array.isArray(lists)) for (const l of Object.values(lists)) for (const it of l) if (it.t === "i") used.add(it.f);
    }
    for (const f of [...imgs.keys()]) if (!used.has(f)) { imgs.delete(f); C.store.removeInkImage(id, f); }
    return C.store.writeInk(id, empty ? null : { v: 1, size: clip.size, pages: clip.pages }).then(() => { if (edited && onSaved) onSaved(id); }, () => {});
  }
  const strokes = (n) => (clip && clip.pages[n]) || [];
  const count = () => (clip ? Object.values(clip.pages).reduce((a, l) => a + l.length, 0) : 0);
  // Pages with drawings, in order, with how many strokes each has.
  const drawn = () => (clip ? Object.keys(clip.pages).map(Number).filter((n) => clip.pages[n].length).sort((a, b) => a - b).map((n) => ({ page: n, strokes: clip.pages[n].length })) : []);
  function put(n, s, at) {
    const list = (clip.pages[n] = clip.pages[n] || []);
    list.splice(at == null ? list.length : Math.min(at, list.length), 0, s);
  }
  function take(n, id) {
    const list = clip.pages[n] || [];
    const i = list.findIndex((s) => s.id === id);
    if (i < 0) return null;
    const [s] = list.splice(i, 1);
    if (!list.length) delete clip.pages[n];
    return { s, i };
  }

  // ---- The layers ----

  const frameDoc = () => C.reader.frameDoc;
  function ensure(n) {
    if (layers.has(n)) return layers.get(n);
    const D = frameDoc(), img = C.reader.pageImg(n), root = img && img.parentNode;
    if (!root) return null;
    const svg = D.createElementNS(NS, "svg");
    svg.setAttribute("class", "co-ink");
    svg.dataset.page = String(n);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.dataset.on = on ? "1" : "";
    // After the words' layers, so it's on top of them when drawing.
    root.append(svg);
    layers.set(n, svg);
    bind(svg);
    paint(n);
    place(svg);
    return svg;
  }
  function drop(n) {
    const svg = layers.get(n);
    if (cur && cur.n === n) cur = null;
    if (svg) svg.remove();
    layers.delete(n);
  }
  function place(svg) {
    const img = C.reader.pageImg(svg.dataset.page);
    if (!img) return;
    const b = C.reader.pageBox(img);
    svg.style.left = b.left + "px";
    svg.style.top = b.top + "px";
    svg.style.width = b.width + "px";
    svg.style.height = b.height + "px";
    const h = b.height / (b.width || 1);
    svg.setAttribute("viewBox", "0 0 1 " + r5(h));
    rescue(svg, h);
  }
  // A drag used to leave things off the page's edge, where they couldn't be
  // seen: anything wholly outside its page comes back inside.
  function rescue(svg, h) {
    const n = Number(svg.dataset.page), img = C.reader.pageImg(n);
    if (!clip || !img || !img.complete || !img.naturalWidth || !(h > 0.1)) return;
    let moved = false;
    for (const s of strokes(n)) {
      const b = boxOf([s]);
      if (b && (b[0] >= 1.05 || b[0] + b[2] <= -0.05 || b[1] >= h + 0.05 || b[1] + b[3] <= -0.05)) { clampInto([s], h); moved = true; }
    }
    if (!moved) return;
    paint(n);
    save();
  }
  function el(n, s) {
    const D = frameDoc();
    if (s.t === "x") {
      const t = D.createElementNS(NS, "text");
      t.setAttribute("class", "txt " + (isHex(s.c) ? "custom" : "c-" + s.c));
      t.setAttribute("font-size", String(s.z));
      if (isHex(s.c)) t.setAttribute("fill", s.c);
      s.text.split("\n").forEach((line, i) => {
        const sp = D.createElementNS(NS, "tspan");
        sp.setAttribute("x", String(s.x));
        sp.setAttribute("y", String(r5(s.y + s.z * (0.95 + i * TEXT_LINE))));
        sp.textContent = line || " ";
        t.append(sp);
      });
      t.dataset.id = s.id;
      return t;
    }
    if (s.t === "i") {
      const im = D.createElementNS(NS, "image");
      im.setAttribute("class", "pic");
      for (const [k, v] of Object.entries({ x: s.x, y: s.y, width: s.w, height: s.h, preserveAspectRatio: "none" })) im.setAttribute(k, String(v));
      if (imgs.has(s.f)) im.setAttribute("href", imgs.get(s.f));
      im.dataset.id = s.id;
      return im;
    }
    const path = D.createElementNS(NS, "path");
    const hex = isHex(s.c);
    path.setAttribute("class", (s.t === "h" ? "hl " : "pen ") + (hex ? "custom" : "c-" + s.c));
    if (hex) path.setAttribute(s.t === "h" ? "stroke" : "fill", s.c);
    if (s.t === "h") path.setAttribute("stroke-width", String(s.w));
    path.setAttribute("d", pathOf(s));
    path.dataset.id = s.id;
    return path;
  }
  function paint(n) {
    const svg = layers.get(n);
    if (!svg) return;
    svg.replaceChildren(...strokes(n).map((s) => el(n, s)));
    selDraw(n);
  }
  // A page that has its picture gets a layer when it has drawings, or
  // when drawing is on.
  function show(n) {
    if (strokes(n).length || on) ensure(n);
  }
  function hide(n) { drop(n); }
  function placeAll() { for (const svg of layers.values()) place(svg); }
  function reset() { layers.clear(); cur = null; }
  // The pages drawn now: every page that has its picture.
  function shown() {
    const D = frameDoc();
    if (!D) return [];
    return [...D.querySelectorAll(".co-comic > img[data-page]")].filter((img) => !/^data:/.test(img.getAttribute("src") || "")).map((img) => Number(img.dataset.page));
  }

  // ---- Drawing ----

  let on = false;
  let tool = "pen";       // "pen", "highlighter", "eraser", "select"
  let color = { pen: "ink", highlighter: "yellow" };
  let size = 2;           // 0 to 4
  let style = "ball";     // how the pen writes
  let finger = false;     // whether a finger or mouse draws, not only a pen
  let cur = null;         // the stroke being drawn, or the eraser's pass
  let lastStroke = 0;
  let penTouch = false;   // a pen's touch is down: its touchstart must not scroll
  let penAt = 0;          // when a pen was last seen on a page, hovering or down
  // What the phone says of the pen (platform.pen, the Pen plugin): the page
  // can't tell its side button from a touch, so it is read natively.
  let nat = { near: false, down: false, button: false, eraser: false, tool: 0, buttons: 0 };
  let nearUntil = 0, nearTimer = 0;

  function setOn(v) {
    on = !!v;
    if (!on) { cur = null; picker = null; selClear(); away(); }
    const D = frameDoc();
    if (D) D.documentElement.toggleAttribute("data-co-inking", on);
    if (on) for (const n of shown()) ensure(n);
    for (const svg of layers.values()) svg.dataset.on = on ? "1" : "";
    if (!on) for (const n of [...layers.keys()]) if (!strokes(n).length) drop(n);
    changed();
  }
  function setting(o) {
    if (o.tool && o.tool !== tool) { tool = o.tool; selClear(); }
    const kind = tool === "highlighter" ? "highlighter" : "pen";
    if (o.color && okColor(kind, o.color)) color[kind] = o.color;
    if (o.colors) for (const k of ["pen", "highlighter"]) if (okColor(k, o.colors[k])) color[k] = o.colors[k];
    if (o.size != null) size = Math.max(0, Math.min(4, Math.round(Number(o.size)) || 0));
    if (STYLES.includes(o.style)) style = o.style;
    if (o.finger != null) finger = !!o.finger;
    changed();
  }
  const state = () => ({ on, tool, color: color[tool === "highlighter" ? "highlighter" : "pen"], colors: { ...color }, size, style, finger, selected: sel ? sel.ids.length : 0, canPaste: !!board, count: count(), canUndo: !!undos.length, canRedo: !!redos.length });

  const where = (e, svg) => {
    const r = svg.getBoundingClientRect();
    return [(e.clientX - r.left) / (r.width || 1), (e.clientY - r.top) / (r.width || 1)];
  };

  // While a pen is near the layers take no pan from the browser
  // (reader.css: touch-action none), so the pen's drag can't scroll the page
  // however its touch is reported: the browser decides at the touch, and
  // hovering says it's coming. A finger scrolls again once it's gone.
  // `set`: the phone's word, which says how long, instead of adding to it.
  function near(ms, set) {
    const D = frameDoc();
    nearUntil = set ? performance.now() + ms : Math.max(nearUntil, performance.now() + ms);
    if (D) D.documentElement.setAttribute("data-co-pen-near", "");
    clearTimeout(nearTimer);
    nearTimer = setTimeout(() => {
      const left = nearUntil - performance.now();
      if (left > 20) { near(0); return; }
      const d = frameDoc();
      if (d) d.documentElement.removeAttribute("data-co-pen-near");
    }, Math.max(0, nearUntil - performance.now()) + 10);
  }
  function away() {
    nearUntil = 0;
    clearTimeout(nearTimer);
    const D = frameDoc();
    if (D) D.documentElement.removeAttribute("data-co-pen-near");
  }
  // The Pen plugin's word: near, and the eraser end or a button held.
  function fromPhone(s) {
    nat = { near: !!s.near, down: !!s.down, button: !!s.button, eraser: !!s.eraser, tool: s.tool | 0, buttons: s.buttons | 0 };
    // One UI sends the pen's hover exit just before its touch, and this word
    // for the touch comes after it has begun: a pen that has just left is
    // still near for a moment, or the touch would be let pan.
    near(nat.near ? 8000 : 1500, true);
    if (nat.eraser && cur && cur.kind === "pen" && !cur.erase) toEraser();
    if (onProbe) onProbe();
  }
  // The side button held and the pen dragged (the Pen plugin's "erase"):
  // x, y are in the frame's own corner, in CSS px. A pass over the pages
  // takes the strokes it crosses, as the eraser does.
  function eraseFrom(phase, px, py) {
    if (!on) return;
    const D = frameDoc();
    if (!D) return;
    // The page under the point.
    let under = null;
    for (const svg of layers.values()) {
      const r = svg.getBoundingClientRect();
      if (px >= r.left && px <= r.right && py >= r.top && py <= r.bottom) { under = { svg, r }; break; }
    }
    if (phase === "down") {
      if (cur) cur = null;
      cur = { id: -1, kind: "phone", n: 0, svg: null, erase: true, gone: [], at: performance.now() };
    }
    if (!cur || cur.kind !== "phone") return;
    if (under) {
      const n = Number(under.svg.dataset.page);
      if (n !== cur.n) cur.last = null;
      cur.n = n;
      cur.svg = under.svg;
      wipe((px - under.r.left) / (under.r.width || 1), (py - under.r.top) / (under.r.width || 1));
    }
    if (phase === "up") {
      const c = cur;
      cur = null;
      lastStroke = performance.now();
      if (c.gone.length) { undos.push({ k: "del", items: c.gone }); redos = []; save(); changed(); }
    }
  }
  // What a stroke being drawn becomes when the button is pressed: what it
  // drew so far is dropped, and it erases from here.
  function toEraser() {
    if (cur.path) cur.path.remove();
    cur.path = null;
    cur.s = null;
    cur.erase = true;
  }

  // Whether a pen pointer means to erase: the flip-over eraser end (button
  // 5, buttons 32) or its side button, which browsers report as a right
  // button (buttons 2, button 2).
  const penErases = (e) => e.pointerType === "pen" && (e.button === 5 || e.button === 2 || (e.buttons & (32 | 2)) !== 0);

  function bind(svg) {
    // First, before down() can return early: a pen is on the page.
    svg.addEventListener("pointerdown", (e) => { if (e.pointerType === "pen") { penTouch = true; penAt = performance.now(); near(1300); } });
    svg.addEventListener("pointerdown", down);
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerenter", (e) => { if (e.pointerType === "pen") { penAt = performance.now(); near(1300); } });
    svg.addEventListener("pointerup", up);
    // A finger's stroke cancelled is a palm (or a gesture): it's dropped.
    svg.addEventListener("pointercancel", (e) => { if (cur && cur.id === e.pointerId && e.pointerType === "touch") abandon(); else up(e); });
    svg.addEventListener("lostpointercapture", up);
    for (const name of ["pointerup", "pointercancel"]) svg.addEventListener(name, (e) => { if (e.pointerType === "pen") { penTouch = false; penAt = performance.now(); near(1300); } });
    // A pen would otherwise scroll the page as a finger does: the touch it
    // makes is taken for drawing. It is told by its pointer, which comes
    // just before its touch: not every device says "stylus" in the touch.
    // A finger scrolls, unless it draws.
    svg.addEventListener("touchstart", (e) => {
      if (!on || e.touches.length > 1) return;
      const t = e.changedTouches[0];
      if (penTouch || (t && t.touchType === "stylus") || finger) { if (e.cancelable) e.preventDefault(); }
    }, { passive: false });
    // The pen's button would open a menu.
    svg.addEventListener("contextmenu", (e) => { if (on) e.preventDefault(); });
  }
  function down(e) {
    if (!on) return;
    const svg = e.currentTarget;
    const pen = e.pointerType === "pen";
    // The eyedropper takes the next tap, whatever draws.
    if (picker) {
      e.preventDefault();
      const done = picker;
      picker = null;
      lastStroke = performance.now();
      done(colorAt(e.clientX, e.clientY));
      return;
    }
    // A stroke left over from the same pointer (it never got its end) is
    // dropped, so it can't keep the next one out.
    if (cur && cur.id === e.pointerId) abandon();
    // A second finger is a pinch: whatever the first one drew is undone.
    if (cur && cur.id !== e.pointerId) { if (cur.kind === "touch") abandon(); return; }
    if (cur) return;
    if (!pen && !finger) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (!e.isPrimary) return;
    // A hand resting beside the pen doesn't write.
    if (e.pointerType === "touch" && performance.now() - penAt < 1000) return;
    const n = Number(svg.dataset.page);
    // The pen's own eraser end, or its button held, whatever the tool.
    const erase = tool === "eraser" || penErases(e) || (pen && nat.eraser);
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* it draws anyway */ }
    const [x, y] = where(e, svg);
    if (tool === "select" && !erase) { selDown(e, svg, n, x, y); return; }
    const hl = !erase && tool === "highlighter";
    cur = { id: e.pointerId, kind: pen ? "pen" : e.pointerType, n, svg, erase, gone: [], at: performance.now() };
    if (erase) { wipe(x, y); return; }
    const kind = hl ? "highlighter" : "pen";
    const s = { id: C.save.newId(), t: hl ? "h" : "p", c: color[kind], w: SIZES[kind][size], p: [] };
    if (!hl && style !== "ball") s.y = style;
    if (onDraw) onDraw();
    cur.s = s;
    cur.press = pen;
    add(e, svg, x, y);
    cur.path = el(n, s);
    cur.path.setAttribute("d", pathOf(s));
    svg.append(cur.path);
    // Over the next page too, if the line goes on to it.
    lift(n);
  }
  function add(e, svg, x, y) {
    const s = cur.s;
    if (s.p.length >= MAX_POINTS * 3) return;
    const pr = cur.press ? Math.min(1, Math.max(0.05, e.pressure || 0.5)) : 0.5;
    s.p.push(r4(x), r4(y), Math.round(pr * 100) / 100);
  }
  function move(e) {
    if (e.pointerType === "pen") { penAt = performance.now(); near(1300); }
    if (!cur || cur.id !== e.pointerId) return;
    const svg = cur.svg;
    // The button pressed after the pen touched down: what it drew so far
    // is dropped and it erases from here.
    if (cur.select) { selMove(e); return; }
    if (!cur.erase && cur.kind === "pen" && (penErases(e) || nat.eraser)) toEraser();
    // Every sample the pen made since the last frame, and the next ones
    // it is going to make, when the browser guesses them.
    const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    const events = list.length ? list : [e];
    for (const c of events) {
      if (cur.erase) { eraseAtClient(c.clientX, c.clientY, svg); continue; }
      const [x, y] = where(c, svg);
      add(c, svg, x, y);
    }
    if (cur.erase) return;
    if (!cur.raf) cur.raf = requestAnimationFrame(() => {
      if (!cur) return;
      cur.raf = 0;
      cur.path.setAttribute("d", pathOf(cur.s));
    });
  }
  // The eraser follows the pointer over from one page to the next.
  function eraseAtClient(cx, cy, svg) {
    const L = layerAt(cx, cy);
    if (!L) { cur.last = null; return; }
    if (L.n !== cur.n) { cur.last = null; cur.n = L.n; cur.svg = L.svg; }
    wipe((cx - L.r.left) / (L.r.width || 1), (cy - L.r.top) / (L.r.width || 1));
  }
  // A pass of the eraser takes the strokes it crosses, whole.
  function wipe(x, y) {
    // Along the way from the last sample, so a quick pass doesn't skip
    // over a line between two of them.
    const from = cur.last || [x, y];
    cur.last = [x, y];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from[0], y - from[1]) / 0.004));
    for (let i = 1; i <= steps; i++) wipeAt(from[0] + ((x - from[0]) * i) / steps, from[1] + ((y - from[1]) * i) / steps);
  }
  function wipeAt(x, y) {
    for (const s of [...strokes(cur.n)]) {
      if (boxy(s) || !hits(s, x, y, 0.012)) continue;
      const took = take(cur.n, s.id);
      if (!took) continue;
      cur.gone.push({ n: cur.n, ...took });
      const node = cur.svg.querySelector('[data-id="' + s.id + '"]');
      if (node) node.remove();
      // Its copies on the other pages it reaches go with it.
      for (const g of copiesOf([s.id])) {
        const t = take(g.n, s.id);
        if (!t) continue;
        cur.gone.push({ n: g.n, ...t });
        const other = layers.get(g.n) && layers.get(g.n).querySelector('[data-id="' + s.id + '"]');
        if (other) other.remove();
      }
    }
  }
  function up(e) {
    if (!cur || cur.id !== e.pointerId) return;
    const c = cur;
    cur = null;
    if (c.raf) cancelAnimationFrame(c.raf);
    lastStroke = performance.now();
    if (c.select) { selUp(c, e); return; }
    // A stroke that turned into an erase (the pen's button) was lifted too.
    unlift();
    if (c.erase) {
      if (c.gone.length) { undos.push({ k: "del", items: c.gone }); redos = []; save(); changed(); }
      return;
    }
    if (!clip || !c.s.p.length) { if (c.path) c.path.remove(); return; }
    // On the pages it reaches, a copy on each; on one, as it was drawn.
    const placed = placeOn(c.s, c.n, pagesOf());
    if (placed.length === 1 && placed[0].n === c.n && placed[0].s === c.s) {
      // A stroke of one point is a dot; the path is drawn as it ends.
      c.path.setAttribute("d", pathOf(c.s));
      put(c.n, c.s);
      undos.push({ k: "add", n: c.n, id: c.s.id });
      redos = [];
    } else {
      if (c.path) c.path.remove();
      commitPlaced(placed, [c.n]);
    }
    save();
    changed();
    if (onStroke) onStroke(c.n);
  }
  // A finger stroke that turned out to be a pinch.
  function abandon() {
    const c = cur;
    cur = null;
    if (!c) return;
    if (c.path) c.path.remove();
    unlift();
    // A drag that was a pinch: the items go back to their pages as they were.
    if (c.select && c.before) { setPages(c.before); repaintAll(c.touched); selDrawAll(); return; }
    for (const g of c.gone) put(g.n, g.s, g.i);
    paint(c.n);
  }
  // The click that follows a stroke isn't a tap on the page.
  function click(e) {
    return on && performance.now() - lastStroke < 500;
  }

  // ---- Pages, lists and order ----

  // The pages' shapes on screen, for placing things between them.
  function pagesOf() {
    return [...layers].map(([n, svg]) => {
      const r = svg.getBoundingClientRect();
      return { n, rect: { left: r.left, top: r.top, width: r.width, height: r.height }, h: r.height / (r.width || 1) };
    });
  }
  // The page under a point, and its rect.
  function layerAt(cx, cy) {
    for (const [n, svg] of layers) {
      const r = svg.getBoundingClientRect();
      if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return { n, svg, r };
    }
    return null;
  }
  // The lists of some pages as they are (to undo to), and put back.
  function snap(ns) {
    const out = {};
    for (const n of ns) out[n] = copyOf(clip.pages[n] || []);
    return out;
  }
  function setPages(o) {
    for (const [k, list] of Object.entries(o)) {
      const n = Number(k);
      if (list.length) clip.pages[n] = copyOf(list); else delete clip.pages[n];
    }
  }
  const repaintAll = (ns) => { for (const n of ns) { if (layers.has(n)) paint(n); else if (on) show(n); } };
  // While a stroke is drawn or an item dragged its page's layer is lifted
  // above the others and isn't clipped, so it shows over the next page.
  const lift = (n) => { const svg = layers.get(n); if (svg) svg.dataset.lift = "1"; };
  const unlift = () => { for (const svg of layers.values()) delete svg.dataset.lift; };
  // Items put on their pages, at the front, as one step to undo.
  function commitPlaced(placed, more) {
    const ns = [...new Set([...placed.map((g) => g.n), ...(more || [])])];
    const before = snap(ns);
    for (const g of placed) put(g.n, g.s);
    undos.push({ k: "pages", before, after: snap(ns) });
    redos = [];
    repaintAll(ns);
  }
  // Every copy of the given ids, on every page: [{ n, s }].
  function copiesOf(ids) {
    const set = new Set(ids), out = [];
    if (clip) for (const [k, list] of Object.entries(clip.pages)) for (const s of list) if (set.has(s.id)) out.push({ n: Number(k), s });
    return out;
  }
  // An item in the widths of page n: its copy there, or one from another page moved over.
  function canonOf(id, n, all) {
    const mine = all.find((g) => g.n === n && g.s.id === id);
    if (mine) return mine.s;
    const other = all.find((g) => g.s.id === id);
    if (!other) return null;
    const pages = pagesOf(), a = pages.find((p) => p.n === other.n), b = pages.find((p) => p.n === n);
    return a && b ? convertItem(other.s, a.rect, b.rect) : copyOf(other.s);
  }
  // Items to the front or the back of every page they are on.
  function reorder(front) {
    const all = selItems();
    if (!all.length) return false;
    const ids = new Set(sel.ids), ns = [...new Set(all.map((g) => g.n))];
    const before = snap(ns);
    for (const n of ns) {
      const list = clip.pages[n], mine = list.filter((x) => ids.has(x.id)), rest = list.filter((x) => !ids.has(x.id));
      clip.pages[n] = front ? [...rest, ...mine] : [...mine, ...rest];
    }
    const after = snap(ns);
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    undos.push({ k: "pages", before, after });
    redos = [];
    repaintAll(ns);
    save();
    changed();
    return true;
  }

  // ---- Select: a loop takes what's inside it ----

  // Everything taken, every copy on every page: [{ n, s }].
  const selItems = () => (sel ? copiesOf(sel.ids) : []);
  function selClear() {
    if (!sel) return;
    sel = null;
    selDrawAll();
    changed();
  }
  // `list`: items on page n; their copies on other pages come with them.
  function selSet(n, list) {
    sel = list.length ? { n, ids: [...new Set(list.map((s) => s.id))] } : null;
    selDrawAll();
    changed();
  }
  function selDrawAll() {
    const by = new Map();
    for (const g of selItems()) { if (!by.has(g.n)) by.set(g.n, []); by.get(g.n).push(g.s); }
    for (const n of layers.keys()) drawSel(n, by.get(n) || []);
  }
  const selDraw = (n) => drawSel(n, sel ? selItems().filter((g) => g.n === n).map((g) => g.s) : []);
  // The dashed box, and a handle at its corner when one picture is taken.
  function drawSel(n, list) {
    const svg = layers.get(n);
    if (!svg) return;
    for (const old of svg.querySelectorAll(".sel, .hnd")) old.remove();
    if (!list.length) return;
    const b = boxOf(list);
    if (!b) return;
    const D = frameDoc();
    const r = D.createElementNS(NS, "rect");
    r.setAttribute("class", "sel");
    for (const [k, v] of Object.entries({ x: r5(b[0]), y: r5(b[1]), width: r5(b[2]), height: r5(b[3]) })) r.setAttribute(k, String(v));
    svg.append(r);
    if (sel.ids.length === 1 && list.length === 1 && list[0].t === "i") {
      const h = D.createElementNS(NS, "circle");
      h.setAttribute("class", "hnd");
      h.setAttribute("cx", String(r5(b[0] + b[2]))); h.setAttribute("cy", String(r5(b[1] + b[3])));
      h.setAttribute("r", String(r5(7 / (svg.getBoundingClientRect().width || 400))));
      svg.append(h);
    }
  }
  function selDown(e, svg, n, x, y) {
    const px = 14 / (svg.getBoundingClientRect().width || 400);
    cur = { id: e.pointerId, kind: e.pointerType === "pen" ? "pen" : e.pointerType, n, svg, select: true, gone: [], at: performance.now(), x0: x, y0: y, moved: 0 };
    const mine = sel ? selItems().filter((g) => g.n === n).map((g) => g.s) : [];
    const b = mine.length ? boxOf(mine) : null;
    // The corner handle of a picture, or anywhere in the box: drag.
    if (b && sel.ids.length === 1 && mine.length === 1 && mine[0].t === "i" && Math.hypot(x - (b[0] + b[2]), y - (b[1] + b[3])) <= px * 1.6) cur.mode = "resize";
    else if (b && x >= b[0] - px && x <= b[0] + b[2] + px && y >= b[1] - px && y <= b[1] + b[3] + px) cur.mode = "drag";
    if (cur.mode) { selLift(cur); return; }
    cur.mode = "lasso";
    cur.pts = [[x, y]];
    cur.path = frameDoc().createElementNS(NS, "path");
    cur.path.setAttribute("class", "lasso");
    svg.append(cur.path);
  }
  // A drag picks the items up: every copy leaves its page, and one copy in
  // the widths of the page touched is moved about, above the others.
  function selLift(c) {
    const all = selItems();
    c.ids = [...sel.ids];
    c.touched = [...new Set([...all.map((g) => g.n), c.n])];
    c.before = snap(c.touched);
    const canon = c.ids.map((id) => canonOf(id, c.n, all)).filter(Boolean);
    for (const g of all) take(g.n, g.s.id);
    for (const s of canon) put(c.n, s);
    c.orig = canon.map(copyOf);
    repaintAll(c.touched);
    lift(c.n);
  }
  function selMove(e) {
    const c = cur, svg = c.svg;
    const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    for (const ev of list.length ? list : [e]) {
      const [x, y] = where(ev, svg);
      c.moved = Math.max(c.moved, Math.hypot(x - c.x0, y - c.y0));
      if (c.mode === "lasso") { c.pts.push([x, y]); continue; }
      const dx = x - c.x0, dy = y - c.y0;
      for (const o of c.orig) {
        const t = strokes(c.n).find((s) => s.id === o.id);
        if (!t) continue;
        if (c.mode === "resize") {
          // Keeps the picture's shape: the width follows the corner.
          const w = Math.max(0.03, Math.min(2, o.w + dx)), k = w / o.w;
          t.w = w; t.h = o.h * k;
        } else if (boxy(t)) { t.x = o.x + dx; t.y = o.y + dy; }
        else for (let i = 0; i + 2 < o.p.length; i += 3) { t.p[i] = r4(o.p[i] + dx); t.p[i + 1] = r4(o.p[i + 1] + dy); }
      }
    }
    if (c.raf) return;
    c.raf = requestAnimationFrame(() => {
      if (cur !== c) return;
      c.raf = 0;
      if (c.mode === "lasso") c.path.setAttribute("d", "M" + c.pts.map((q) => r4(q[0]) + " " + r4(q[1])).join("L") + "z");
      else { paint(c.n); lift(c.n); }
    });
  }
  function selUp(c, e) {
    if (c.raf) cancelAnimationFrame(c.raf);
    if (c.path) c.path.remove();
    const tap = c.moved < 0.006;
    if (c.mode === "lasso") {
      if (tap) {
        // A tap on a stroke or a picture takes it, the top one; on nothing, the selection goes.
        const hit = [...strokes(c.n)].reverse().find((s) => hits(s, c.x0, c.y0, 0.01));
        if (hit) selSet(c.n, [hit]); else selClear();
        return;
      }
      if (c.pts.length < 3) { selClear(); return; }
      selSet(c.n, strokes(c.n).filter((s) => within(c.pts, s)));
      return;
    }
    unlift();
    if (tap) { setPages(c.before); repaintAll(c.touched); selDrawAll(); return; }
    selDrop(c);
  }
  // Let go: the items go to the pages they are over, at the front of each.
  function selDrop(c) {
    const items = strokes(c.n).filter((s) => c.ids.includes(s.id));
    for (const s of items) take(c.n, s.id);
    const pages = pagesOf();
    const placed = items.flatMap((s) => placeOn(s, c.n, pages));
    const before = { ...c.before };
    for (const g of placed) if (!(g.n in before)) before[g.n] = copyOf(strokes(g.n));
    for (const g of placed) put(g.n, g.s);
    const ns = Object.keys(before).map(Number);
    undos.push({ k: "pages", before, after: snap(ns) });
    redos = [];
    sel = { n: placed.length ? placed[0].n : c.n, ids: c.ids };
    repaintAll(ns);
    selDrawAll();
    save();
    changed();
  }
  // Delete what's taken; Cut also keeps it for Paste, Copy only keeps it.
  function selDelete() {
    const all = selItems();
    if (!all.length) return false;
    const gone = [];
    for (const g of all) { const t = take(g.n, g.s.id); if (t) gone.push({ n: g.n, ...t }); }
    undos.push({ k: "many", del: gone, add: [] });
    redos = [];
    sel = null;
    repaintAll([...new Set(all.map((g) => g.n))]);
    save();
    changed();
    return true;
  }
  function selCopy() {
    const all = selItems();
    if (!all.length) return false;
    const used = {}, items = [];
    for (const id of sel.ids) {
      const s = canonOf(id, sel.n, all);
      if (!s) continue;
      items.push(copyOf(s));
      if (s.t === "i" && imgs.has(s.f)) used[s.f] = imgs.get(s.f);
    }
    board = { items, n: sel.n, k: 0, imgs: used };
    changed();
    return true;
  }
  const selCut = () => selCopy() && selDelete();
  // Put what was copied on the page most in view, a little to one side of
  // where it was, taken.
  function selPaste() {
    const v = viewPage();
    if (!board || !clip || !v) return false;
    const n = v.n;
    board.k++;
    const off = board.n === n ? 0.02 * board.k : 0;
    const items = board.items.map((it) => {
      const c = copyOf(it);
      c.id = C.save.newId();
      if (c.t === "i") { c.x += off; c.y += off; if (!imgs.has(c.f) && board.imgs[c.f]) { imgs.set(c.f, board.imgs[c.f]); C.store.writeInkImage(clip.id, c.f, board.imgs[c.f]).catch(() => {}); } }
      else if (c.t === "x") { c.x += off; c.y += off; }
      else for (let i = 0; i + 2 < c.p.length; i += 3) { c.p[i] = r4(c.p[i] + off); c.p[i + 1] = r4(c.p[i + 1] + off); }
      return c;
    });
    const pages = pagesOf();
    commitPlaced(items.flatMap((s) => placeOn(s, n, pages)));
    selSet(n, items);
    save();
    return true;
  }
  // The page most in view that has a layer, and the middle of what shows
  // of it (in page widths, down from its top).
  function viewPage() {
    const D = frameDoc();
    const vh = (D && D.defaultView && D.defaultView.innerHeight) || 800;
    let best = null, most = 0;
    for (const [n, svg] of layers) {
      const r = svg.getBoundingClientRect();
      const seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (seen > most) { most = seen; best = { n, mid: ((Math.min(r.bottom, vh) + Math.max(r.top, 0)) / 2 - r.top) / (r.width || 1), height: r.height / (r.width || 1) }; }
    }
    return best;
  }
  // A picture on the page most in view (a data: URL, its shape known): in
  // the middle of the part shown, no wider than 40% of the page, and taken.
  function addImage(url, ratio) {
    const v = viewPage();
    if (!v || !clip || !/^data:image\//.test(url) || !(ratio > 0)) return false;
    const n = v.n;
    const f = C.save.newId().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 30) || "img" + Date.now();
    const w = Math.min(0.4, 0.4 / Math.max(1, ratio)), h = w * ratio;
    const s = { id: C.save.newId(), t: "i", f, x: r4(Math.max(0, (1 - w) / 2)), y: r4(Math.max(0, Math.min(v.height - h, v.mid - h / 2))), w: r4(w), h: r4(h) };
    imgs.set(f, url);
    C.store.writeInkImage(clip.id, f, url).catch(() => {});
    put(n, s);
    undos.push({ k: "many", del: [], add: [{ n, s, i: strokes(n).length - 1 }] });
    redos = [];
    if (!layers.has(n)) show(n);
    paint(n);
    selSet(n, [s]);
    save();
    return true;
  }

  // ---- Typed text (notes) ----

  // How big text sets, in page widths, measured on a canvas: [w, h].
  let measure = null;
  function textSize(text, z) {
    if (!measure) measure = document.createElement("canvas").getContext("2d");
    measure.font = "400 100px " + TEXT_FONT;
    const lines = text.split("\n");
    let w = 0;
    for (const l of lines) w = Math.max(w, measure.measureText(l).width / 100 * z);
    return { w: r4(Math.max(w, z)), h: r4(lines.length * z * TEXT_LINE + z * 0.2) };
  }
  // Text on the page most in view: in the middle of the part shown, and taken.
  function addText(text, z, c) {
    const v = viewPage();
    text = String(text || "").replace(/\r/g, "").slice(0, MAX_TEXT);
    if (!v || !clip || !text.trim()) return false;
    c = okColor("pen", c) ? c : color.pen;
    z = TEXT_SIZES.includes(z) ? z : TEXT_SIZES[1];
    const m = textSize(text, z), w = Math.min(m.w, 0.95);
    const s = { id: C.save.newId(), t: "x", c, x: r4(Math.max(0, (1 - w) / 2)), y: r4(Math.max(0, Math.min(v.height - m.h, v.mid - m.h / 2))), w: m.w, h: m.h, z, text };
    commitPlaced([{ n: v.n, s }]);
    selSet(v.n, [s]);
    save();
    return true;
  }
  // The words, size or colour of the text with this id changed, as one step to undo.
  // Emptied, it goes.
  function editText(id, text, z, c) {
    const all = copiesOf([id]).filter((g) => g.s.t === "x");
    if (!all.length || !clip) return false;
    text = String(text || "").replace(/\r/g, "").slice(0, MAX_TEXT);
    if (!text.trim()) { selSet(all[0].n, [all[0].s]); selDelete(); return true; }
    const ns = [...new Set(all.map((g) => g.n))], before = snap(ns);
    for (const g of all) {
      const s = g.s;
      s.text = text;
      if (TEXT_SIZES.includes(z)) s.z = z;
      if (c && okColor("pen", c)) s.c = c;
      const m = textSize(text, s.z);
      s.w = m.w; s.h = m.h;
    }
    undos.push({ k: "pages", before, after: snap(ns) });
    redos = [];
    repaintAll(ns);
    selDrawAll();
    save();
    changed();
    return true;
  }
  // The one text item that is taken, to edit: { id, text, z, c }, or null.
  function selectedText() {
    const items = sel ? selItems() : [];
    const t = items.length && items.every((g) => g.s.id === items[0].s.id) && items[0].s.t === "x" ? items[0].s : null;
    return t ? { id: t.id, text: t.text, z: t.z, c: t.c } : null;
  }

  // ---- The eyedropper ----

  // The colour under a point on a page: a stroke's own, else the page's
  // picture there. "#rrggbb", or null off the pages.
  function colorAt(clientX, clientY) {
    for (const [n, svg] of layers) {
      const r = svg.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const x = (clientX - r.left) / (r.width || 1), y = (clientY - r.top) / (r.width || 1);
      const top = [...strokes(n)].reverse().find((s) => !boxy(s) && hits(s, x, y, 0.004));
      if (top) { const v = rgbOf(top); return v ? rgbHex(...v) : null; }
      const img = C.reader.pageImg(n);
      if (!img || !img.naturalWidth) return null;
      try {
        const b = img.getBoundingClientRect();
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        const g = cv.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, Math.floor(((clientX - b.left) / (b.width || 1)) * img.naturalWidth), Math.floor(((clientY - b.top) / (b.height || 1)) * img.naturalHeight), 1, 1, 0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        return rgbHex(d[0], d[1], d[2]);
      } catch (err) { return null; }
    }
    return null;
  }
  // The next tap on a page is read for its colour and handed to `f`
  // (null when it fell off the pages); pick(null) stops waiting.
  function pick(f) { picker = f || null; }

  // ---- Undo ----

  function step(from, to, undo) {
    const op = from.pop();
    if (!op || !clip) return false;
    const pages = new Set();
    if (op.k === "pages") {
      // Whole lists of the pages touched, as they were or as they became.
      setPages(undo ? op.before : op.after);
      for (const k of Object.keys(op.before)) pages.add(Number(k));
    } else if (op.k === "set") {
      // Moved or resized: the items as they were, or as they became.
      for (const it of undo ? op.before : op.after) {
        const t = strokes(op.n).find((s) => s.id === it.id);
        if (t) Object.assign(t, copyOf(it));
      }
      pages.add(op.n);
    } else if (op.k === "many") {
      const gone = undo ? op.add : op.del, back = undo ? op.del : op.add;
      for (const g of gone) { take(g.n, g.s.id); pages.add(g.n); }
      for (const g of undo ? [...back].reverse() : back) { put(g.n, g.s, g.i); pages.add(g.n); }
    } else if (op.k === "add") {
      if (undo) {
        const t = take(op.n, op.id);
        if (t) op.s = t.s, op.i = t.i;
      } else if (op.s) put(op.n, op.s, op.i);
      pages.add(op.n);
    } else {
      // Put back in the opposite order they were taken.
      for (const g of undo ? [...op.items].reverse() : op.items) {
        if (undo) put(g.n, g.s, g.i);
        else take(g.n, g.s.id);
        pages.add(g.n);
      }
    }
    to.push(op);
    selClear();
    for (const n of pages) { if (layers.has(n)) paint(n); else if (on) show(n); }
    save();
    changed();
    return [...pages][0];
  }
  const undo = () => step(undos, redos, true);
  const redo = () => step(redos, undos, false);
  function clearPage(n) {
    const list = strokes(n);
    if (!list.length) return;
    undos.push({ k: "del", items: list.map((s, i) => ({ n, s, i })).reverse() });
    redos = [];
    delete clip.pages[n];
    paint(n);
    save();
    changed();
  }

  // The drawings as they are, to put back (the pen test draws on the page).
  const snapshot = () => JSON.stringify(clip ? clip.pages : {});
  function restore(snap) {
    if (!clip) return;
    try { clip.pages = JSON.parse(snap) || {}; } catch (e) { return; }
    undos = []; redos = [];
    for (const n of [...layers.keys()]) { if (strokes(n).length || on) paint(n); else drop(n); }
    save();
    changed();
  }

  // Everything on the clip gone, for good (Remove all drawings).
  function clearAll() {
    if (!clip) return;
    clip.pages = {};
    undos = []; redos = [];
    for (const n of layers.keys()) paint(n);
    save();
    changed();
  }

  // A pen stroke in a copy of the PDF is one even width, so it's the
  // width the stroke has on average, as a multiple of its size.
  function exportWidth(s) {
    let sum = 0, n = 0;
    for (let i = 2; i < s.p.length; i += 3) { sum += s.p[i]; n++; }
    const pr = n ? sum / n : 0.5;
    return (2 * radius(s.w, pr, s.y)) / s.w * (s.y === "fountain" ? 0.7 : s.y === "brush" ? 0.75 : 1);
  }

  // The drawings for a copy of the PDF, to pdf.js inkOf.
  function forPdf() {
    const out = {};
    for (const [n, list] of Object.entries(clip ? clip.pages : {})) {
      out[n] = list.map((s) => {
        if (s.t === "x") return { img: "" };
        if (s.t === "i") return { img: imgs.get(s.f) || "", x: s.x, y: s.y, w: s.w, h: s.h };
        return { pts: s.p, w: s.w, rgb: rgbOf(s), a: s.t === "h" ? 0.4 : 1, k: s.t === "h" ? 1 : exportWidth(s) };
      }).filter((s) => !("img" in s) || s.img);
    }
    return out;
  }

  C.ink = {
    PEN, HIGHLIGHT, SIZES, STYLES, penPath, linePath, rgbOf, imageUrl: (f) => imgs.get(f) || "", TEXT_SIZES, TEXT_LINE, TEXT_FONT, textSize, addText, editText, selectedText, hits, clean, inside, within, boxOf, isHex, hexRgb, rgbHex, hsvRgb, rgbHsv,
    cut: selCut, copy: selCopy, paste: selPaste, del: selDelete, front: () => reorder(true), back: () => reorder(false), convertItem, clampInto, placeOn, addImage, viewPage, pick, colorAt, clearSelection: selClear,
    load, unload, flush, strokesFrom, setOn, setting, state, undo, redo, clearPage, clearAll, forPdf, count, drawn, strokes, shown,
    set onChange(f) { onChange = f; },
    set onPen(f) { onPen = f; },
    set onProbe(f) { onProbe = f; },
    set onDraw(f) { onDraw = f; },
    set onStroke(f) { onStroke = f; },
    set onSaved(f) { onSaved = f; },
    snapshot, restore,
    fromPhone, eraseFrom, get nat() { return nat; },
    get on() { return on; },
    get lastStroke() { return lastStroke; },
  };
  if (C.reader) C.reader.inkHook = { show, hide, place: placeAll, reset, click, pen: () => { if (onPen) onPen(); } };
})();
