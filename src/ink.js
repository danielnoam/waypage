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

  // Whether a point is on a stroke, to within `slop` (page widths).
  function hits(s, x, y, slop) {
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

  // ---- What's drawn on the open clip ----

  let clip = null;        // { id, size, pages: { "<n>": [stroke] } }
  let saveTimer = 0;
  let undos = [], redos = [];
  let onChange = null, onPen = null, onProbe = null, onDraw = null, onStroke = null;
  const layers = new Map(); // page -> svg

  // A stroke read back from a file: anything else is dropped.
  function clean(s) {
    if (!s || typeof s !== "object" || (s.t !== "p" && s.t !== "h")) return null;
    const palette = s.t === "h" ? HIGHLIGHT : PEN;
    if (!Object.prototype.hasOwnProperty.call(palette, s.c)) return null;
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
    return { stale };
  }
  function unload() {
    flush();
    clip = null;
    undos = []; redos = [];
    layers.clear();
    cur = null;
    changed();
  }
  function changed() { if (onChange) onChange(); }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 800);
  }
  function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!clip) return Promise.resolve();
    const empty = !Object.values(clip.pages).some((l) => l.length);
    const id = clip.id;
    return C.store.writeInk(id, empty ? null : { v: 1, size: clip.size, pages: clip.pages }).catch(() => {});
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
    svg.setAttribute("viewBox", "0 0 1 " + r5(b.height / (b.width || 1)));
  }
  function el(n, s) {
    const D = frameDoc();
    const path = D.createElementNS(NS, "path");
    path.setAttribute("class", s.t === "h" ? "hl c-" + s.c : "pen c-" + s.c);
    if (s.t === "h") path.setAttribute("stroke-width", String(s.w));
    path.setAttribute("d", pathOf(s));
    path.dataset.id = s.id;
    return path;
  }
  function paint(n) {
    const svg = layers.get(n);
    if (!svg) return;
    svg.replaceChildren(...strokes(n).map((s) => el(n, s)));
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
  let tool = "pen";       // "pen", "highlighter", "eraser"
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
    if (!on) { cur = null; away(); }
    const D = frameDoc();
    if (D) D.documentElement.toggleAttribute("data-co-inking", on);
    if (on) for (const n of shown()) ensure(n);
    for (const svg of layers.values()) svg.dataset.on = on ? "1" : "";
    if (!on) for (const n of [...layers.keys()]) if (!strokes(n).length) drop(n);
    changed();
  }
  function setting(o) {
    if (o.tool) tool = o.tool;
    if (o.color) color[tool === "highlighter" ? "highlighter" : "pen"] = o.color;
    if (o.colors) for (const k of ["pen", "highlighter"]) if (o.colors[k] in (k === "pen" ? PEN : HIGHLIGHT)) color[k] = o.colors[k];
    if (o.size != null) size = Math.max(0, Math.min(4, Math.round(Number(o.size)) || 0));
    if (STYLES.includes(o.style)) style = o.style;
    if (o.finger != null) finger = !!o.finger;
    changed();
  }
  const state = () => ({ on, tool, color: color[tool === "highlighter" ? "highlighter" : "pen"], colors: { ...color }, size, style, finger, count: count(), canUndo: !!undos.length, canRedo: !!redos.length });

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
    if (!cur.erase && cur.kind === "pen" && (penErases(e) || nat.eraser)) toEraser();
    // Every sample the pen made since the last frame, and the next ones
    // it is going to make, when the browser guesses them.
    const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    const events = list.length ? list : [e];
    for (const c of events) {
      const [x, y] = where(c, svg);
      if (cur.erase) wipe(x, y);
      else add(c, svg, x, y);
    }
    if (cur.erase) return;
    if (!cur.raf) cur.raf = requestAnimationFrame(() => {
      if (!cur) return;
      cur.raf = 0;
      cur.path.setAttribute("d", pathOf(cur.s));
    });
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
      if (!hits(s, x, y, 0.012)) continue;
      const took = take(cur.n, s.id);
      if (!took) continue;
      cur.gone.push({ n: cur.n, ...took });
      const node = cur.svg.querySelector('[data-id="' + s.id + '"]');
      if (node) node.remove();
    }
  }
  function up(e) {
    if (!cur || cur.id !== e.pointerId) return;
    const c = cur;
    cur = null;
    if (c.raf) cancelAnimationFrame(c.raf);
    lastStroke = performance.now();
    if (c.erase) {
      if (c.gone.length) { undos.push({ k: "del", items: c.gone }); redos = []; save(); changed(); }
      return;
    }
    if (!clip || !c.s.p.length) { if (c.path) c.path.remove(); return; }
    // A stroke of one point is a dot; the path is drawn as it ends.
    c.path.setAttribute("d", pathOf(c.s));
    put(c.n, c.s);
    undos.push({ k: "add", n: c.n, id: c.s.id });
    redos = [];
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
    for (const g of c.gone) put(g.n, g.s, g.i);
    paint(c.n);
  }
  // The click that follows a stroke isn't a tap on the page.
  function click(e) {
    return on && performance.now() - lastStroke < 500;
  }

  // ---- Undo ----

  function step(from, to, undo) {
    const op = from.pop();
    if (!op || !clip) return false;
    const pages = new Set();
    if (op.k === "add") {
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
        const rgb = (s.t === "h" ? HIGHLIGHT : PEN)[s.c];
        return { pts: s.p, w: s.w, rgb, a: s.t === "h" ? 0.4 : 1, k: s.t === "h" ? 1 : exportWidth(s) };
      });
    }
    return out;
  }

  C.ink = {
    PEN, HIGHLIGHT, SIZES, STYLES, penPath, linePath, hits, clean,
    load, unload, flush, setOn, setting, state, undo, redo, clearPage, clearAll, forPdf, count, drawn, strokes, shown,
    set onChange(f) { onChange = f; },
    set onPen(f) { onPen = f; },
    set onProbe(f) { onProbe = f; },
    set onDraw(f) { onDraw = f; },
    set onStroke(f) { onStroke = f; },
    snapshot, restore,
    fromPhone, eraseFrom, get nat() { return nat; },
    get on() { return on; },
    get lastStroke() { return lastStroke; },
  };
  if (C.reader) C.reader.inkHook = { show, hide, place: placeAll, reset, click, pen: () => { if (onPen) onPen(); } };
})();
