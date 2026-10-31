// Waypage: a PowerPoint deck as a PDF (1.47.0). A .pptx is a zip of XML:
// each slide is redrawn on a canvas from its shapes, text, pictures and
// tables (theme colours and fonts, layout and master inherited), and the
// pictures of the slides are written into a small PDF by hand. Under each
// picture goes an invisible text layer (render mode 3), so the PDF reader's
// search, Narrate and highlights find the slides' words.
//
// Nothing here leaves the device and nothing in the deck runs: the XML is
// only parsed, pictures only decoded, a picture that points at an address
// outside the file is never fetched. It is a redraw, not PowerPoint:
// charts and SmartArt without a stand-in picture, effects and animations
// are left out (counted in `skipped`, so the app can say so).
(function () {
  const C = window.Waypage;
  const B = () => C.backup;
  const R_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const PT = 12700;
  const LONG = 1600;
  const MAX_SLIDES = 600;
  const MAX_PART = 64 << 20;
  const SANS = '"Instrument Sans", system-ui, sans-serif';
  const SERIF = '"Source Serif 4", Georgia, serif';

  // ---- XML helpers (by local name, so any prefix works) ----
  const kids = (n, name) => (n ? [...n.children].filter((c) => c.localName === name) : []);
  const kid = (n, name) => {
    if (!n) return null;
    for (const c of n.children) if (c.localName === name) return c;
    return null;
  };
  const walk = (n, path) => path.split("/").reduce((x, nm) => x && kid(x, nm), n);
  const attr = (n, a, d = null) => (n && n.hasAttribute(a) ? n.getAttribute(a) : d);
  const num = (v, d) => { const x = parseFloat(v); return isNaN(x) ? d : x; };
  const emu = (v) => (parseFloat(v) || 0) / PT;

  // ---- Colour ----
  const PRESET = { black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0], gray: [128, 128, 128], grey: [128, 128, 128], orange: [255, 165, 0] };
  const hexRgb = (h) => {
    h = String(h || "000000").replace("#", "");
    return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0];
  };
  function toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6, s, l];
  }
  function fromHsl([h, s, l]) {
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      t = (t + 1) % 1;
      return Math.round(255 * (t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p));
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  // A colour element (srgbClr, schemeClr…) → [r, g, b, a].
  function colorOf(n, env) {
    let rgb, a = 1;
    const val = n.getAttribute("val");
    switch (n.localName) {
      case "srgbClr": rgb = hexRgb(val); break;
      case "sysClr": rgb = hexRgb(n.getAttribute("lastClr") || "000000"); break;
      case "prstClr": rgb = PRESET[val] || [0, 0, 0]; break;
      case "scrgbClr": rgb = ["r", "g", "b"].map((k) => Math.round(clamp(num(n.getAttribute(k), 0) / 100000) * 255)); break;
      case "schemeClr": {
        if (val === "phClr") rgb = env.ph || [0, 0, 0];
        else rgb = hexRgb(env.theme.colors[env.map[val] || val]);
        break;
      }
      default: rgb = [0, 0, 0];
    }
    for (const m of n.children) {
      const v = num(m.getAttribute("val"), 100000) / 100000;
      let hsl;
      switch (m.localName) {
        case "lumMod": hsl = toHsl(rgb); hsl[2] = clamp(hsl[2] * v); rgb = fromHsl(hsl); break;
        case "lumOff": hsl = toHsl(rgb); hsl[2] = clamp(hsl[2] + v); rgb = fromHsl(hsl); break;
        case "satMod": hsl = toHsl(rgb); hsl[1] = clamp(hsl[1] * v); rgb = fromHsl(hsl); break;
        case "tint": rgb = rgb.map((c) => Math.round(c * v + 255 * (1 - v))); break;
        case "shade": rgb = rgb.map((c) => Math.round(c * v)); break;
        case "alpha": a = v; break;
        default: break;
      }
    }
    return [...rgb, a];
  }
  const css = (c) => "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + c[3] + ")";

  // The fill element among a shape's properties: null when it names none.
  function fillOf(parent, env) {
    if (!parent) return null;
    for (const c of parent.children) {
      switch (c.localName) {
        case "noFill": return { none: true };
        case "solidFill": { const cn = c.firstElementChild; return cn ? { solid: css(colorOf(cn, env)) } : null; }
        case "gradFill": {
          const stops = kids(walk(c, "gsLst"), "gs").map((s) => [num(s.getAttribute("pos"), 0) / 100000, css(colorOf(s.firstElementChild, env))]);
          if (!stops.length) return null;
          const lin = kid(c, "lin");
          return { grad: { stops, ang: lin ? num(lin.getAttribute("ang"), 0) / 60000 : 90, radial: !!kid(c, "path") } };
        }
        case "pattFill": { const fg = walk(c, "fgClr"); return fg && fg.firstElementChild ? { solid: css(colorOf(fg.firstElementChild, env)) } : null; }
        case "blipFill": { const b = kid(c, "blip"); return b ? { blip: b.getAttributeNS(R_NS, "embed"), crop: kid(c, "srcRect") } : null; }
        default: break;
      }
    }
    return null;
  }
  function paintOf(g, fill, x, y, w, h) {
    if (!fill || fill.none || fill.blip) return null;
    if (fill.solid) return fill.solid;
    const { stops, ang, radial } = fill.grad;
    let gr;
    if (radial) gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, Math.max(w, h) / 2 || 1);
    else {
      const r = ang * Math.PI / 180, dx = Math.cos(r), dy = Math.sin(r);
      const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2, cx = x + w / 2, cy = y + h / 2;
      gr = g.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
    }
    for (const [p, c] of stops) gr.addColorStop(clamp(p), c);
    return gr;
  }

  // ---- The package ----
  const dirOf = (p) => p.replace(/[^/]*$/, "");
  function resolveTo(from, target) {
    if (target[0] === "/") return target.slice(1);
    const out = [];
    for (const p of (dirOf(from) + target).split("/")) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    return out.join("/");
  }
  async function openDeck(file) {
    let entries;
    try { entries = await B().zipEntries(file); } catch (e) { throw new C.files.FileError("This isn't a PowerPoint file Waypage can read."); }
    const deck = { file, entries, docs: new Map(), bmp: new Map(), skipped: 0 };
    deck.bytes = async (p) => {
      const e = entries.get(p);
      if (!e || e.size > MAX_PART) return null;
      return B().zipRead(file, e);
    };
    deck.xml = async (p) => {
      if (!deck.docs.has(p)) {
        const b = await deck.bytes(p);
        let doc = null;
        if (b) {
          doc = new DOMParser().parseFromString(new TextDecoder().decode(b), "application/xml");
          if (doc.getElementsByTagName("parsererror").length) doc = null;
        }
        deck.docs.set(p, doc);
      }
      return deck.docs.get(p);
    };
    // A part's relationships: id → { path, type, external }.
    deck.rels = async (p) => {
      const doc = await deck.xml(dirOf(p) + "_rels/" + p.slice(dirOf(p).length) + ".rels");
      const out = new Map();
      for (const r of doc ? doc.documentElement.children : []) {
        const external = r.getAttribute("TargetMode") === "External";
        out.set(r.getAttribute("Id"), { path: external ? "" : resolveTo(p, r.getAttribute("Target") || ""), type: (r.getAttribute("Type") || "").split("/").pop(), external });
      }
      return out;
    };
    deck.bitmap = async (path) => {
      if (!path) return null;
      if (deck.bmp.has(path)) return deck.bmp.get(path);
      let b = null;
      if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(path)) {
        try { const bytes = await deck.bytes(path); if (bytes) b = await createImageBitmap(new Blob([bytes])); } catch (e) { b = null; }
      }
      if (!b) deck.skipped++;
      deck.bmp.set(path, b);
      // Decoded pictures are big; keep the latest few (a master's logo is reused).
      while (deck.bmp.size > 10) {
        const [k, v] = deck.bmp.entries().next().value;
        if (v && v.close) v.close();
        deck.bmp.delete(k);
      }
      return b;
    };
    deck.close = () => { for (const v of deck.bmp.values()) if (v && v.close) v.close(); deck.bmp.clear(); };
    return deck;
  }

  function themeOf(doc) {
    const colors = {};
    const root = doc && doc.documentElement;
    for (const c of walk(root, "themeElements/clrScheme") ? walk(root, "themeElements/clrScheme").children : []) {
      const v = c.firstElementChild;
      colors[c.localName] = v ? (v.localName === "sysClr" ? v.getAttribute("lastClr") : v.getAttribute("val")) : "000000";
    }
    const fs = walk(root, "themeElements/fontScheme");
    return { colors, major: attr(walk(fs, "majorFont/latin"), "typeface", ""), minor: attr(walk(fs, "minorFont/latin"), "typeface", "") };
  }

  // ---- Placeholders ----
  function nvPr(sp) {
    const nv = [...sp.children].find((c) => /^nv/.test(c.localName));
    return nv ? kid(nv, "nvPr") : null;
  }
  function phOf(sp) {
    const ph = kid(nvPr(sp), "ph");
    return ph ? { type: attr(ph, "type", "obj"), idx: attr(ph, "idx") } : null;
  }
  const normType = (t) => (t === "ctrTitle" ? "title" : t === "subTitle" || t === "obj" ? "body" : t);
  function findPh(tree, ph) {
    if (!tree || !ph) return null;
    const shapes = kids(tree, "sp");
    if (ph.idx != null) {
      const m = shapes.find((s) => { const p = phOf(s); return p && p.idx === ph.idx; });
      if (m) return m;
    }
    return shapes.find((s) => { const p = phOf(s); return p && normType(p.type) === normType(ph.type); }) || null;
  }

  // ---- Geometry ----
  function trace(g, prst, cust, x, y, w, h, adj) {
    g.beginPath();
    if (cust) return traceCust(g, cust, x, y, w, h);
    const a = (i, d) => num(adj && adj[i], d) / 100000;
    switch (prst) {
      case "ellipse": g.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); break;
      case "roundRect": case "round1Rect": case "round2SameRect": {
        const r = Math.min(w, h) * a(0, 16667); g.roundRect(x, y, w, h, Math.max(0, r)); break;
      }
      case "triangle": g.moveTo(x + w * a(0, 50000), y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); break;
      case "rtTriangle": g.moveTo(x, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); break;
      case "diamond": g.moveTo(x + w / 2, y); g.lineTo(x + w, y + h / 2); g.lineTo(x + w / 2, y + h); g.lineTo(x, y + h / 2); g.closePath(); break;
      case "parallelogram": { const o = Math.min(w, h) * a(0, 25000); g.moveTo(x + o, y); g.lineTo(x + w, y); g.lineTo(x + w - o, y + h); g.lineTo(x, y + h); g.closePath(); break; }
      case "hexagon": { const o = Math.min(w, h) * a(0, 25000); g.moveTo(x + o, y); g.lineTo(x + w - o, y); g.lineTo(x + w, y + h / 2); g.lineTo(x + w - o, y + h); g.lineTo(x + o, y + h); g.lineTo(x, y + h / 2); g.closePath(); break; }
      case "rightArrow": case "leftArrow": {
        const t = h * (1 - a(0, 50000)) / 2, hd = Math.min(w, h) * a(1, 50000), r = prst === "rightArrow";
        const X = (v) => (r ? x + v : x + w - v);
        g.moveTo(X(0), y + t); g.lineTo(X(w - hd), y + t); g.lineTo(X(w - hd), y); g.lineTo(X(w), y + h / 2);
        g.lineTo(X(w - hd), y + h); g.lineTo(X(w - hd), y + h - t); g.lineTo(X(0), y + h - t); g.closePath(); break;
      }
      case "line": case "straightConnector1": g.moveTo(x, y); g.lineTo(x + w, y + h); break;
      default: g.rect(x, y, w, h);
    }
  }
  function traceCust(g, cust, x, y, w, h) {
    const paths = kids(kid(cust, "pathLst"), "path");
    if (!paths.length) { g.rect(x, y, w, h); return; }
    for (const p of paths) {
      const pw = num(p.getAttribute("w"), 0) || 1, ph = num(p.getAttribute("h"), 0) || 1;
      const pt = (n) => [x + num(n.getAttribute("x"), 0) / pw * w, y + num(n.getAttribute("y"), 0) / ph * h];
      for (const c of p.children) {
        const pts = kids(c, "pt").map(pt);
        if (c.localName === "moveTo" && pts[0]) g.moveTo(...pts[0]);
        else if (c.localName === "lnTo" && pts[0]) g.lineTo(...pts[0]);
        else if (c.localName === "cubicBezTo" && pts.length === 3) g.bezierCurveTo(...pts[0], ...pts[1], ...pts[2]);
        else if (c.localName === "quadBezTo" && pts.length === 2) g.quadraticCurveTo(...pts[0], ...pts[1]);
        else if (c.localName === "close") g.closePath();
      }
    }
  }
  const adjOf = (geom) => {
    const out = [];
    for (const gd of kids(kid(geom, "avLst"), "gd")) out.push((gd.getAttribute("fmla") || "").replace(/^val\s+/, ""));
    return out;
  };

  // The shape's frame in slide points: { x, y, w, h, rot, flipH, flipV }.
  function frameOf(xfrm, T) {
    if (!xfrm) return null;
    const off = kid(xfrm, "off"), ext = kid(xfrm, "ext");
    if (!off || !ext) return null;
    return {
      x: T.dx + T.sx * num(off.getAttribute("x"), 0) / PT, y: T.dy + T.sy * num(off.getAttribute("y"), 0) / PT,
      w: T.sx * num(ext.getAttribute("cx"), 0) / PT, h: T.sy * num(ext.getAttribute("cy"), 0) / PT,
      rot: num(xfrm.getAttribute("rot"), 0) / 60000 * Math.PI / 180,
      flipH: xfrm.getAttribute("flipH") === "1", flipV: xfrm.getAttribute("flipV") === "1",
    };
  }
  function turned(g, f, fn) {
    g.save();
    if (f.rot) { g.translate(f.x + f.w / 2, f.y + f.h / 2); g.rotate(f.rot); g.translate(-(f.x + f.w / 2), -(f.y + f.h / 2)); }
    try { fn(); } finally { g.restore(); }
  }
  function flipped(g, f, fn) {
    g.save();
    if (f.flipH || f.flipV) {
      g.translate(f.x + f.w / 2, f.y + f.h / 2);
      g.scale(f.flipH ? -1 : 1, f.flipV ? -1 : 1);
      g.translate(-(f.x + f.w / 2), -(f.y + f.h / 2));
    }
    try { fn(); } finally { g.restore(); }
  }

  // ---- Lines ----
  const DASH = { dash: [4, 3], sysDash: [3, 1], dot: [1, 2], sysDot: [1, 1], lgDash: [8, 3], dashDot: [4, 3, 1, 3] };
  function strokeOf(g, ln, env, styleLn) {
    const fill = ln ? fillOf(ln, env) : null;
    if (fill && fill.none) return null;
    let color = fill && fill.solid;
    if (!color && styleLn) color = css(colorOf(styleLn, env));
    if (!color) return null;
    const w = ln && ln.hasAttribute("w") ? emu(ln.getAttribute("w")) : 1;
    const dash = (DASH[attr(kid(ln, "prstDash"), "val")] || []).map((d) => d * Math.max(w, 1));
    return { color, w, dash, tail: attr(kid(ln, "tailEnd"), "type", "none") !== "none", head: attr(kid(ln, "headEnd"), "type", "none") !== "none" };
  }
  function arrow(g, x1, y1, x2, y2, w, color) {
    const a = Math.atan2(y2 - y1, x2 - x1), s = Math.max(5, w * 3.5);
    g.save();
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
    g.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
    g.closePath();
    g.fill();
    g.restore();
  }

  // ---- Text ----
  const WING = { "§": "▪", "Ø": "➢", "ü": "✓", "q": "❑", "v": "❖", "l": "●", "n": "■", "ý": "✗", "þ": "☑", "¨": "▫" };
  const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const WORDS = /\s+|[぀-ヿ㐀-鿿]|[^\s぀-ヿ㐀-鿿]+/g;
  function familyOf(name, theme) {
    if (name === "+mj-lt") name = theme.major;
    else if (name === "+mn-lt" || !name) name = theme.minor;
    if (!name || /^\+/.test(name)) return SANS;
    const generic = /times|georgia|garamond|cambria|book|palatino|minion|serif|mincho|song/i.test(name) && !/sans/i.test(name);
    return '"' + name.replace(/"/g, "") + '", ' + (generic ? SERIF : SANS);
  }
  const attrFrom = (chain, a) => { for (let i = chain.length - 1; i >= 0; i--) if (chain[i].hasAttribute(a)) return chain[i].getAttribute(a); return null; };
  const kidFrom = (chain, n) => { for (let i = chain.length - 1; i >= 0; i--) { const c = kid(chain[i], n); if (c) return c; } return null; };
  function alphaN(n, upper) {
    let s = "";
    for (n; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(97 + ((n - 1) % 26)) + s;
    return upper ? s.toUpperCase() : s;
  }
  function romanN(n, upper) {
    const t = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
    let s = "";
    for (const [v, r] of t) while (n >= v) { s += r; n -= v; }
    return upper ? s.toUpperCase() : s;
  }
  function numbered(type, n) {
    const body = /^alphaLc/.test(type) ? alphaN(n, false) : /^alphaUc/.test(type) ? alphaN(n, true)
      : /^romanLc/.test(type) ? romanN(n, false) : /^romanUc/.test(type) ? romanN(n, true) : String(n);
    return /ParenBoth/.test(type) ? "(" + body + ")" : /ParenR/.test(type) ? body + ")" : /Period/.test(type) ? body + "." : body;
  }

  // The paragraphs of a text body with every run's style resolved.
  // `levels` is, per outline level, the list of lvlNpPr nodes from the
  // weakest source to the strongest; `dflt` the shape's own text colour,
  // and `strong` the deck's default text style when `dflt` outranks it.
  function parasOf(txBody, levels, env, dflt, scale, strong) {
    const out = [];
    const count = [];
    for (const p of kids(txBody, "p")) {
      const pPr = kid(p, "pPr");
      const lvl = Math.min(8, Math.max(0, num(attr(pPr, "lvl"), 0)));
      const chain = [...(levels[lvl] || []), pPr].filter(Boolean);
      const rchain = chain.map((c) => kid(c, "defRPr")).filter(Boolean);
      const endR = kid(p, "endParaRPr");
      const toks = [];
      let text = "";
      const style = (rPr) => {
        const rc = rPr ? [...rchain, rPr] : rchain;
        const sizeRaw = attrFrom(rc, "sz");
        const base = baselineOf(rc);
        // A colour the shape names itself (a style's font colour, a table's
        // header) outranks the deck's default text style.
        const fillN = kidFrom(strong ? rc.filter((n) => n.parentNode.parentNode !== strong) : rc, "solidFill");
        const lat = kidFrom(rc, "latin");
        return {
          size: (sizeRaw ? num(sizeRaw, 1800) / 100 : 18) * scale * (base ? 0.65 : 1), shift: base,
          bold: attrFrom(rc, "b") === "1", italic: attrFrom(rc, "i") === "1",
          underline: !!attrFrom(rc, "u") && attrFrom(rc, "u") !== "none", strike: !!attrFrom(rc, "strike") && attrFrom(rc, "strike") !== "noStrike",
          caps: attrFrom(rc, "cap") === "all",
          color: fillN && fillN.firstElementChild ? css(colorOf(fillN.firstElementChild, env)) : dflt,
          family: familyOf(lat ? lat.getAttribute("typeface") : "", env.theme),
        };
      };
      for (const r of p.children) {
        if (r.localName === "br") { toks.push({ br: true, ...style(kid(r, "rPr")) }); continue; }
        if (r.localName !== "r" && r.localName !== "fld") continue;
        const t = kid(r, "t");
        let s = t ? t.textContent : "";
        const st = style(kid(r, "rPr"));
        if (st.caps) s = s.toUpperCase();
        text += s;
        for (const w of s.match(WORDS) || []) toks.push({ text: w, space: /^\s+$/.test(w), ...st });
      }
      const rtl = attr(pPr, "rtl") === "1" || RTL.test(text);
      // Bullet.
      let bu = null;
      // The strongest level to name one of the three wins.
      const named = [...chain].reverse().map((c) => kid(c, "buNone") || kid(c, "buChar") || kid(c, "buAutoNum")).find(Boolean);
      const auto = !!named && named.localName === "buAutoNum";
      if (text.trim() && named && named.localName !== "buNone") {
        const fnt = kidFrom(chain, "buFont"), clr = kidFrom(chain, "buClr");
        const first = toks.find((t) => !t.br) || style(null);
        const face = fnt ? fnt.getAttribute("typeface") : "";
        let ch;
        if (!auto) { ch = named.getAttribute("char") || "•"; if (/wingdings|symbol/i.test(face)) ch = WING[ch] || "•"; }
        else { count[lvl] = (count[lvl] || num(named.getAttribute("startAt"), 1) - 1) + 1; ch = numbered(named.getAttribute("type") || "arabicPeriod", count[lvl]); }
        bu = { ch, size: first.size * (num(attr(kidFrom(chain, "buSzPct"), "val"), 100000) / 100000), color: clr && clr.firstElementChild ? css(colorOf(clr.firstElementChild, env)) : first.color, family: first.family, bold: first.bold };
      }
      if (!(bu && auto)) count[lvl] = 0;
      for (let l = lvl + 1; l < 9; l++) count[l] = 0;
      const spc = (n) => {
        if (!n) return null;
        const pct = kid(n, "spcPct"), pts = kid(n, "spcPts");
        return pct ? { pct: num(pct.getAttribute("val"), 0) / 100000 } : pts ? { pts: num(pts.getAttribute("val"), 0) / 100 } : null;
      };
      out.push({
        toks, text, rtl, bu,
        algn: attrFrom(chain, "algn") || (rtl ? "r" : "l"),
        marL: emu(attrFrom(chain, "marL") || 0), indent: emu(attrFrom(chain, "indent") || 0),
        lnSpc: spc(kidFrom(chain, "lnSpc")), spcBef: spc(kidFrom(chain, "spcBef")), spcAft: spc(kidFrom(chain, "spcAft")),
        endSize: (endR && endR.hasAttribute("sz") ? num(endR.getAttribute("sz"), 1800) / 100 : rchain.length && attrFrom(rchain, "sz") ? num(attrFrom(rchain, "sz"), 1800) / 100 : 18) * scale,
      });
    }
    return out;
  }
  function baselineOf(rc) {
    const b = num(attrFrom(rc, "baseline"), 0);
    return b > 0 ? 0.35 : b < 0 ? -0.15 : 0;
  }
  const fontStr = (t) => (t.italic ? "italic " : "") + (t.bold ? "600 " : "400 ") + t.size + "px " + t.family;

  // Words broken into lines for a width; heights from the sizes in them.
  function flow(g, paras, width, wrap, lnReduce) {
    const lines = [];
    let y = 0;
    paras.forEach((p, pi) => {
      const secondX = p.marL;
      const firstX = p.bu ? p.marL + p.indent : p.marL + p.indent;
      const textFirstX = p.bu ? p.marL : firstX;
      const lnPct = p.lnSpc && p.lnSpc.pct ? p.lnSpc.pct - lnReduce : 1 - lnReduce;
      const metric = (size) => (p.lnSpc && p.lnSpc.pts ? p.lnSpc.pts : size * 1.2 * lnPct);
      const bigOf = (size) => Math.max(size, 1);
      if (pi && p.spcBef) y += p.spcBef.pts != null ? p.spcBef.pts : (p.spcBef.pct || 0) * (p.toks[0] ? p.toks[0].size : p.endSize) * 1.2;
      let cur = [], w = 0, first = true, size = 0;
      const avail = () => (wrap ? Math.max(10, width - (first ? textFirstX : secondX)) : Infinity);
      const push = (last) => {
        while (cur.length && cur[cur.length - 1].space) { w -= cur[cur.length - 1].w; cur.pop(); }
        const s = bigOf(Math.max(size, first && p.bu ? p.bu.size : 0, cur.length ? 0 : p.endSize));
        const h = metric(s);
        lines.push({ toks: cur, w, h, size: s, p, first, last, x: first ? textFirstX : secondX, y, avail: width - (first ? textFirstX : secondX) });
        y += h;
        cur = []; w = 0; size = 0; first = false;
      };
      for (const t of p.toks) {
        if (t.br) { push(false); continue; }
        g.font = fontStr(t);
        t.w = g.measureText(t.text).width;
        if (t.space && !cur.length) continue;
        if (!t.space && cur.length && w + t.w > avail() + 0.5) push(false);
        cur.push(t); w += t.w; size = Math.max(size, t.size);
      }
      push(true);
      if (p.spcAft) y += p.spcAft.pts != null ? p.spcAft.pts : (p.spcAft.pct || 0) * lines[lines.length - 1].size * 1.2;
    });
    return { lines, height: y };
  }

  // Draws a text body into a box and records its lines (S.texts) for the
  // invisible text layer.
  function drawText(g, S, txBody, box, shape) {
    const { body, levels, env, dflt } = shape;
    const fs = kid(body, "normAutofit");
    const scale = fs ? num(fs.getAttribute("fontScale"), 100000) / 100000 : 1;
    const reduce = fs ? num(fs.getAttribute("lnSpcReduction"), 0) / 100000 : 0;
    const paras = parasOf(txBody, levels, env, dflt, scale, shape.strong ? S.deckStyle : null);
    if (!paras.some((p) => p.text.trim())) return;
    const ins = (a, d) => emu(body && body.hasAttribute(a) ? body.getAttribute(a) : d);
    const l = ins("lIns", 91440), t = ins("tIns", 45720), r = ins("rIns", 91440), b = ins("bIns", 45720);
    const inner = Math.max(1, box.w - l - r);
    const wrap = attr(body, "wrap") !== "none";
    const { lines, height } = flow(g, paras, inner, wrap, reduce);
    const anchor = attr(body, "anchor", "t");
    const top = box.y + t + (anchor === "ctr" ? (box.h - t - b - height) / 2 : anchor === "b" ? box.h - t - b - height : 0);
    g.textBaseline = "alphabetic";
    for (const ln of lines) {
      const p = ln.p;
      const baseline = top + ln.y + ln.h - ln.size * 0.25;
      const left = box.x + l, right = box.x + l + inner;
      const free = inner - ln.x - ln.w;
      const spaces = ln.toks.filter((x) => x.space).length;
      const justify = p.algn === "just" && !ln.last && spaces && wrap;
      let off = p.algn === "ctr" || p.algn === "dist" ? free / 2 : p.algn === "r" ? free : 0;
      const gap = justify ? Math.max(0, free) / spaces : 0;
      if (justify) off = 0;
      let x;
      if (p.rtl) {
        // Alignment is literal; the words are laid out from the line's right end.
        x = left + off + ln.w;
        if (ln.first && p.bu) { g.font = (p.bu.bold ? "600 " : "400 ") + p.bu.size + "px " + p.bu.family; g.fillStyle = p.bu.color; g.direction = "rtl"; g.textAlign = "right"; g.fillText(p.bu.ch, right - (p.marL + p.indent), baseline); }
      } else {
        x = left + ln.x + off;
        if (ln.first && p.bu) { g.font = (p.bu.bold ? "600 " : "400 ") + p.bu.size + "px " + p.bu.family; g.fillStyle = p.bu.color; g.direction = "ltr"; g.textAlign = "left"; g.fillText(p.bu.ch, left + p.marL + p.indent, baseline); }
      }
      const startX = x;
      for (const tk of ln.toks) {
        g.font = fontStr(tk);
        g.fillStyle = tk.color;
        g.direction = p.rtl ? "rtl" : "ltr";
        g.textAlign = p.rtl ? "right" : "left";
        const y = baseline - tk.shift * tk.size / 0.65 * (tk.shift ? 1 : 0);
        if (tk.text.trim()) g.fillText(tk.text, x, y);
        const adv = tk.w + (tk.space ? gap : 0);
        if (tk.underline || tk.strike) {
          const x0 = p.rtl ? x - adv : x;
          g.fillRect(x0, tk.underline ? y + tk.size * 0.1 : y - tk.size * 0.3, adv, Math.max(0.5, tk.size / 18));
        }
        x += p.rtl ? -adv : adv;
      }
      g.direction = "ltr";
      g.textAlign = "left";
      const spanW = Math.abs(x - startX);
      const str = ln.toks.map((tk) => tk.text).join("");
      if (str.trim()) S.texts.push({ x: p.rtl ? Math.min(startX, x) : startX, y: baseline, size: ln.size, text: str, width: spanW });
    }
  }

  // ---- Shapes ----
  async function drawSp(g, sp, S, T, decor) {
    const nv = [...sp.children].find((c) => /^nv/.test(c.localName));
    const cNv = nv && kid(nv, "cNvPr");
    if (attr(cNv, "hidden") === "1") return;
    const ph = decor ? null : phOf(sp);
    const lay = ph ? findPh(S.layoutTree, ph) : null;
    const mas = ph ? findPh(S.masterTree, lay ? phOf(lay) && { type: phOf(lay).type, idx: null } : ph) : null;
    const own = kid(sp, "spPr");
    const pick = (fn) => fn(own) || fn(kid(lay, "spPr")) || fn(kid(mas, "spPr")) || null;
    const f = frameOf(pick((s) => kid(s, "xfrm")), T);
    if (!f) return;
    const geomN = pick((s) => kid(s, "prstGeom"));
    const cust = pick((s) => kid(s, "custGeom"));
    const prst = attr(geomN, "prst", "rect");
    const env = S.env;
    const st = kid(sp, "style");
    const styleClr = (n) => { const c = kid(st, n); return c && c.firstElementChild; };
    let fill = pick((s) => fillOf(s, env));
    if (!fill && styleClr("fillRef") && num(attr(kid(st, "fillRef"), "idx"), 0) > 0) fill = { solid: css(colorOf(styleClr("fillRef"), env)) };
    const lnN = pick((s) => kid(s, "ln"));
    const lnRef = styleClr("lnRef") && num(attr(kid(st, "lnRef"), "idx"), 0) > 0 ? styleClr("lnRef") : null;
    const stroke = strokeOf(g, lnN, env, lnRef);
    turned(g, f, () => {
      flipped(g, f, () => {
        const isLine = sp.localName === "cxnSp" || prst === "line" || prst === "straightConnector1";
        if (!isLine || cust) {
          trace(g, prst, cust, f.x, f.y, f.w, f.h, adjOf(geomN));
          const paint = paintOf(g, fill, f.x, f.y, f.w, f.h);
          if (paint) { g.fillStyle = paint; g.fill(); }
        }
        if (stroke) {
          g.lineWidth = stroke.w; g.strokeStyle = stroke.color; g.setLineDash(stroke.dash);
          if (isLine && !cust) { g.beginPath(); g.moveTo(f.x, f.y); g.lineTo(f.x + f.w, f.y + f.h); }
          else trace(g, prst, cust, f.x, f.y, f.w, f.h, adjOf(geomN));
          g.stroke();
          g.setLineDash([]);
          if (isLine && stroke.tail) arrow(g, f.x, f.y, f.x + f.w, f.y + f.h, stroke.w, stroke.color);
          if (isLine && stroke.head) arrow(g, f.x + f.w, f.y + f.h, f.x, f.y, stroke.w, stroke.color);
        }
      });
      if (fill && fill.blip) { /* a picture fill is drawn behind the text below */ }
    });
    if (fill && fill.blip) await drawBlip(g, S, fill, f, prst, cust);
    const tx = kid(sp, "txBody");
    if (!tx || decor) return;
    // Text: the levels' properties from the deck's defaults, the master's
    // text styles for a placeholder, then each placeholder in turn.
    const levels = Array.from({ length: 9 }, (_, i) => [S.deckStyle && kid(S.deckStyle, "lvl" + (i + 1) + "pPr")].filter(Boolean));
    if (ph) {
      const t = normType(ph.type);
      const ts = kid(S.txStyles, t === "title" ? "titleStyle" : t === "body" ? "bodyStyle" : "otherStyle");
      for (let i = 0; i < 9; i++) { const n = kid(ts, "lvl" + (i + 1) + "pPr"); if (n) levels[i].push(n); }
    }
    for (const src of [mas, lay, sp]) {
      const ls = src && kid(kid(src, "txBody"), "lstStyle");
      for (let i = 0; i < 9; i++) { const n = kid(ls, "lvl" + (i + 1) + "pPr"); if (n) levels[i].push(n); }
    }
    // The body's properties: the strongest source naming each.
    const bodies = [mas, lay, sp].map((s) => s && kid(kid(s, "txBody"), "bodyPr")).filter(Boolean);
    const merged = { hasAttribute: (a) => bodies.some((b) => b.hasAttribute(a)), getAttribute: (a) => { for (let i = bodies.length - 1; i >= 0; i--) if (bodies[i].hasAttribute(a)) return bodies[i].getAttribute(a); return null; }, children: [] };
    for (let i = bodies.length - 1; i >= 0 && !merged.children.length; i--) if (kid(bodies[i], "normAutofit")) merged.children = [kid(bodies[i], "normAutofit")];
    const fontClr = styleClr("fontRef");
    const dflt = fontClr ? css(colorOf(fontClr, env)) : css(colorOf(kid(kid(kid(S.deckStyle, "lvl1pPr"), "defRPr"), "solidFill") ? kid(kid(kid(S.deckStyle, "lvl1pPr"), "defRPr"), "solidFill").firstElementChild : null, env) || [0, 0, 0, 1]);
    turned(g, f, () => drawText(g, S, tx, f, { body: merged, levels, env, dflt, strong: !!fontClr }));
  }

  async function drawBlip(g, S, fill, f, prst, cust) {
    const rel = S.rels.get(fill.blip);
    if (!rel || rel.external) { S.deck.skipped++; return; }
    const bmp = await S.deck.bitmap(rel.path);
    if (!bmp) return;
    const c = fill.crop;
    const cl = c ? num(c.getAttribute("l"), 0) / 100000 : 0, ct = c ? num(c.getAttribute("t"), 0) / 100000 : 0;
    const cr = c ? num(c.getAttribute("r"), 0) / 100000 : 0, cb = c ? num(c.getAttribute("b"), 0) / 100000 : 0;
    turned(g, f, () => {
      flipped(g, f, () => {
        if (prst && prst !== "rect") { trace(g, prst, cust, f.x, f.y, f.w, f.h); g.clip(); }
        try { g.drawImage(bmp, bmp.width * cl, bmp.height * ct, bmp.width * (1 - cl - cr), bmp.height * (1 - ct - cb), f.x, f.y, f.w, f.h); } catch (e) { /* a closed picture */ }
      });
    });
  }

  async function drawPic(g, pic, S, T) {
    const bf = kid(pic, "blipFill");
    const fill = bf ? fillOf({ children: [bf] }, S.env) : null;
    const ph = phOf(pic);
    const lay = ph ? findPh(S.layoutTree, ph) : null;
    const xfrm = kid(kid(pic, "spPr"), "xfrm") || kid(kid(lay, "spPr"), "xfrm");
    const f = frameOf(xfrm, T);
    if (!f || !fill || !fill.blip) return;
    await drawBlip(g, S, fill, f, attr(kid(kid(pic, "spPr"), "prstGeom"), "prst", "rect"), kid(kid(pic, "spPr"), "custGeom"));
  }

  async function drawGroup(g, grp, S, T) {
    const gp = kid(grp, "grpSpPr"), x = kid(gp, "xfrm");
    let U = T;
    if (x) {
      const off = kid(x, "off"), ext = kid(x, "ext"), co = kid(x, "chOff"), ce = kid(x, "chExt");
      if (off && ext && co && ce) {
        const kx = num(ext.getAttribute("cx"), 1) / (num(ce.getAttribute("cx"), 1) || 1), ky = num(ext.getAttribute("cy"), 1) / (num(ce.getAttribute("cy"), 1) || 1);
        U = {
          sx: T.sx * kx, sy: T.sy * ky,
          dx: T.dx + T.sx * (num(off.getAttribute("x"), 0) - num(co.getAttribute("x"), 0) * kx) / PT,
          dy: T.dy + T.sy * (num(off.getAttribute("y"), 0) - num(co.getAttribute("y"), 0) * ky) / PT,
        };
      }
    }
    await drawList(g, [...grp.children], S, U);
  }

  async function drawList(g, nodes, S, T, decor) {
    for (const n of nodes) {
      switch (n.localName) {
        case "sp": case "cxnSp": await drawSp(g, n, S, T, decor); break;
        case "pic": await drawPic(g, n, S, T); break;
        case "grpSp": await drawGroup(g, n, S, T); break;
        case "graphicFrame": await drawFrame(g, n, S, T); break;
        case "AlternateContent": {
          const pick = kid(n, "Fallback") || kid(n, "Choice");
          if (pick) await drawList(g, [...pick.children], S, T, decor);
          break;
        }
        default: break;
      }
    }
  }

  // A table: grid, cell fills and borders, and each cell's text. Its style
  // (header and banded rows) is approximated from the theme's accent 1.
  async function drawFrame(g, fr, S, T) {
    const data = walk(fr, "graphic/graphicData");
    const tbl = kid(data, "tbl");
    if (!tbl) { S.deck.skipped++; return; }
    const f = frameOf(kid(fr, "xfrm"), T);
    if (!f) return;
    const cols = kids(kid(tbl, "tblGrid"), "gridCol").map((c) => emu(c.getAttribute("w")) * T.sx);
    const pr = kid(tbl, "tblPr");
    const styled = !!kid(pr, "tableStyleId");
    const header = attr(pr, "firstRow") === "1", band = attr(pr, "bandRow") === "1";
    const accent = hexRgb(S.env.theme.colors.accent1);
    const env = S.env;
    let y = f.y;
    let ri = 0;
    for (const tr of kids(tbl, "tr")) {
      const h = emu(tr.getAttribute("h")) * T.sy;
      let x = f.x;
      let ci = 0;
      for (const tc of kids(tr, "tc")) {
        const span = Math.max(1, num(tc.getAttribute("gridSpan"), 1));
        const w = cols.slice(ci, ci + span).reduce((a, b) => a + b, 0);
        ci += span;
        if (tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1") { x += w; continue; }
        const tcPr = kid(tc, "tcPr");
        let fill = fillOf(tcPr, env);
        let color = css(colorOf(kid(kid(kid(S.deckStyle, "lvl1pPr"), "defRPr"), "solidFill") ? kid(kid(kid(S.deckStyle, "lvl1pPr"), "defRPr"), "solidFill").firstElementChild : null, env) || [0, 0, 0, 1]);
        let boldAll = false;
        if (!fill && styled) {
          if (header && ri === 0) { fill = { solid: css([...accent, 1]) }; color = "#fff"; boldAll = true; }
          else if (band) fill = { solid: css([...accent.map((c) => Math.round(c * 0.2 + 255 * 0.8)), ri % 2 ? 1 : 0.6]) };
        }
        const paint = paintOf(g, fill, x, y, w, h);
        if (paint) { g.fillStyle = paint; g.fillRect(x, y, w, h); }
        for (const [side, ax, ay, bx, by] of [["lnL", x, y, x, y + h], ["lnR", x + w, y, x + w, y + h], ["lnT", x, y, x + w, y], ["lnB", x, y + h, x + w, y + h]]) {
          const s = strokeOf(g, kid(tcPr, side), env, null);
          if (s && kid(kid(tcPr, side), "solidFill")) { g.strokeStyle = s.color; g.lineWidth = s.w; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
        }
        const tx = kid(tc, "txBody");
        if (tx) {
          const levels = Array.from({ length: 9 }, (_, i) => [S.deckStyle && kid(S.deckStyle, "lvl" + (i + 1) + "pPr")].filter(Boolean));
          const m = { lIns: attr(tcPr, "marL", 91440), tIns: attr(tcPr, "marT", 45720), rIns: attr(tcPr, "marR", 91440), bIns: attr(tcPr, "marB", 45720), anchor: attr(tcPr, "anchor", "t") };
          const body = { hasAttribute: (a) => a in m, getAttribute: (a) => m[a], children: [] };
          if (boldAll) for (const l of levels) l.push(new DOMParser().parseFromString('<a:lvl1pPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:defRPr b="1"/></a:lvl1pPr>', "application/xml").documentElement);
          drawText(g, S, tx, { x, y, w, h }, { body, levels, env, dflt: color, strong: boldAll });
        }
        x += w;
      }
      y += h;
      ri++;
    }
  }

  // ---- A slide ----
  async function renderSlide(deck, d, slidePath, pxW) {
    const doc = await deck.xml(slidePath);
    const rels = await deck.rels(slidePath);
    const layoutRel = [...rels.values()].find((r) => r.type === "slideLayout");
    const layoutDoc = layoutRel && await deck.xml(layoutRel.path);
    const layoutRels = layoutRel ? await deck.rels(layoutRel.path) : new Map();
    const masterRel = [...layoutRels.values()].find((r) => r.type === "slideMaster");
    const masterDoc = masterRel && await deck.xml(masterRel.path);
    const masterRels = masterRel ? await deck.rels(masterRel.path) : new Map();
    const themeRel = [...masterRels.values()].find((r) => r.type === "theme");
    const theme = themeOf(themeRel && await deck.xml(themeRel.path));
    const mroot = masterDoc && masterDoc.documentElement, lroot = layoutDoc && layoutDoc.documentElement;
    const map = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
    const cm = kid(mroot, "clrMap");
    if (cm) for (const a of cm.attributes) map[a.name] = a.value;
    const env = { theme, map, ph: null };
    const k = pxW / d.w;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(pxW);
    canvas.height = Math.round(d.h * k);
    const g = canvas.getContext("2d");
    g.scale(k, k);
    g.fillStyle = "#fff";
    g.fillRect(0, 0, d.w, d.h);
    const S = {
      deck, env, texts: [], rels, layoutTree: walk(lroot, "cSld/spTree"), masterTree: walk(mroot, "cSld/spTree"),
      txStyles: kid(mroot, "txStyles"), deckStyle: d.defaultStyle,
    };
    const T = { sx: 1, sy: 1, dx: 0, dy: 0 };
    // Background: the slide's, else the layout's, else the master's.
    for (const [root, rl] of [[doc.documentElement, rels], [lroot, layoutRels], [mroot, masterRels]]) {
      const bg = walk(root, "cSld/bg");
      if (!bg) continue;
      const bgPr = kid(bg, "bgPr"), ref = kid(bg, "bgRef");
      let fill = bgPr ? fillOf(bgPr, env) : ref && ref.firstElementChild ? { solid: css(colorOf(ref.firstElementChild, env)) } : null;
      if (!fill) continue;
      if (fill.blip) {
        const r = rl.get(fill.blip), bmp = r && !r.external && await deck.bitmap(r.path);
        if (bmp) g.drawImage(bmp, 0, 0, d.w, d.h);
      } else {
        const p = paintOf(g, fill, 0, 0, d.w, d.h);
        if (p) { g.fillStyle = p; g.fillRect(0, 0, d.w, d.h); }
      }
      break;
    }
    // The master's and layout's own drawings sit behind the slide's.
    const showMaster = attr(doc.documentElement, "showMasterSp") !== "0";
    const showMasterOnLayout = attr(lroot, "showMasterSp") !== "0";
    if (showMaster && showMasterOnLayout && S.masterTree) {
      await drawList(g, [...S.masterTree.children].filter((n) => !(n.localName === "sp" && phOf(n))), { ...S, rels: masterRels, layoutTree: null }, T, true);
    }
    if (showMaster && S.layoutTree) {
      await drawList(g, [...S.layoutTree.children].filter((n) => !(n.localName === "sp" && phOf(n))), { ...S, rels: layoutRels, layoutTree: null, masterTree: null }, T, true);
    }
    const tree = walk(doc.documentElement, "cSld/spTree");
    if (tree) await drawList(g, [...tree.children], S, T, false);
    const jpeg = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    const out = { jpeg: new Uint8Array(await jpeg.arrayBuffer()), iw: canvas.width, ih: canvas.height, texts: S.texts, w: d.w, h: d.h };
    canvas.width = canvas.height = 0;
    return out;
  }

  // ---- The PDF ----
  const hex4 = (s) => { let o = ""; for (let i = 0; i < s.length; i++) o += s.charCodeAt(i).toString(16).padStart(4, "0"); return o; };
  const f2 = (v) => (Math.round(v * 100) / 100).toString();
  function writePdf(pages) {
    const parts = [];
    const at = [];
    let len = 0;
    const put = (x) => { parts.push(x); len += x.length; };
    const obj = (n, body) => { at[n] = len; put(n + " 0 obj\n" + body + "\nendobj\n"); };
    // Plain ASCII throughout: strings are counted by length, and a Blob writes a byte above 127 as two.
    put("%PDF-1.5\n");
    const kidsRefs = pages.map((_, i) => 7 + i * 3 + " 0 R").join(" ");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [" + kidsRefs + "] /Count " + pages.length + " >>");
    obj(3, "<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [4 0 R] /ToUnicode 6 0 R >>");
    obj(4, "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 5 0 R /DW 500 /CIDToGIDMap /Identity >>");
    obj(5, "<< /Type /FontDescriptor /FontName /Helvetica /Flags 4 /FontBBox [0 -200 1000 900] /ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>");
    const cmap = "/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n" +
      "/CMapName /Adobe-Identity-UCS def /CMapType 2 def\n1 begincodespacerange <0000> <FFFF> endcodespacerange\n1 beginbfrange <0000> <FFFF> <0000> endbfrange\n" +
      "endcmap CMapName currentdict /CMap defineresource pop end end";
    obj(6, "<< /Length " + cmap.length + " >>\nstream\n" + cmap + "\nendstream");
    pages.forEach((p, i) => {
      const base = 7 + i * 3;
      let c = "q " + f2(p.w) + " 0 0 " + f2(p.h) + " 0 0 cm /Im0 Do Q\nBT 3 Tr\n";
      for (const t of p.texts) {
        // Right-to-left text is stored in the order it is seen; the PDF reader turns it back.
        const s = RTL.test(t.text) ? [...t.text].reverse().join("") : t.text;
        const natural = s.length * t.size * 0.5;
        c += "/F1 " + f2(t.size) + " Tf " + f2(natural ? Math.min(400, Math.max(10, t.width / natural * 100)) : 100) + " Tz 1 0 0 1 " + f2(t.x) + " " + f2(p.h - t.y) + " Tm <" + hex4(s) + "> Tj\n";
      }
      c += "ET";
      obj(base, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + f2(p.w) + " " + f2(p.h) + "] /Contents " + (base + 1) + " 0 R /Resources << /XObject << /Im0 " + (base + 2) + " 0 R >> /Font << /F1 3 0 R >> >> >>");
      obj(base + 1, "<< /Length " + c.length + " >>\nstream\n" + c + "\nendstream");
      at[base + 2] = len;
      put((base + 2) + " 0 obj\n<< /Type /XObject /Subtype /Image /Width " + p.iw + " /Height " + p.ih + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + p.jpeg.length + " >>\nstream\n");
      parts.push(p.jpeg); len += p.jpeg.length;
      put("\nendstream\nendobj\n");
    });
    const xref = len;
    const total = 7 + pages.length * 3;
    let x = "xref\n0 " + total + "\n0000000000 65535 f \n";
    for (let n = 1; n < total; n++) x += String(at[n]).padStart(10, "0") + " 00000 n \n";
    put(x + "trailer\n<< /Size " + total + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n");
    return new Blob(parts, { type: "application/pdf" });
  }

  // ---- The deck ----
  // Lets the page breathe between slides. A message, not a timer: a page
  // in the background gets its timers held back to one a second.
  const slow = () => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
  async function load(file) {
    const deck = await openDeck(file);
    const pres = await deck.xml("ppt/presentation.xml");
    if (!pres) throw new C.files.FileError("This PowerPoint file has no slides Waypage can read.");
    const rels = await deck.rels("ppt/presentation.xml");
    const root = pres.documentElement;
    const sz = kid(root, "sldSz");
    const d = { w: num(attr(sz, "cx"), 9144000) / PT, h: num(attr(sz, "cy"), 6858000) / PT, defaultStyle: kid(root, "defaultTextStyle") };
    const slides = kids(kid(root, "sldIdLst"), "sldId").map((s) => rels.get(s.getAttributeNS(R_NS, "id"))).filter((r) => r && r.path);
    if (!slides.length) throw new C.files.FileError("This PowerPoint file has no slides in it.");
    deck.hidden = new Set();
    // A slide marked hidden isn't part of the show.
    const keep = [];
    for (const r of slides.slice(0, MAX_SLIDES)) {
      const doc = await deck.xml(r.path);
      if (doc && attr(doc.documentElement, "show") !== "0") keep.push(r.path);
    }
    if (!keep.length) throw new C.files.FileError("Every slide in this PowerPoint file is hidden.");
    return { deck, d, slides: keep, total: slides.length };
  }

  // Resolves to { blob, name, slides, skipped }. `onProgress(done, total)`.
  async function toPdf(file, onProgress) {
    try { await Promise.all(['16px "Instrument Sans"', '600 16px "Instrument Sans"', '16px "Source Serif 4"', 'italic 16px "Source Serif 4"'].map((f) => document.fonts.load(f))); } catch (e) { /* the system's fonts then */ }
    const { deck, d, slides, total } = await load(file);
    const pxW = d.w >= d.h ? LONG : Math.round(LONG * d.w / d.h);
    const pages = [];
    try {
      for (const [i, path] of slides.entries()) {
        if (onProgress) onProgress(i, slides.length);
        try { pages.push(await renderSlide(deck, d, path, pxW)); } catch (e) { console.error(e); deck.skipped++; pages.push(await blank(d, pxW)); }
        await slow();
      }
    } finally { deck.close(); }
    if (onProgress) onProgress(slides.length, slides.length);
    return { blob: writePdf(pages), name: file.name.replace(/\.[a-z0-9]{1,8}$/i, "") + ".pdf", slides: slides.length, hidden: total - slides.length, skipped: deck.skipped };
  }
  async function blank(d, pxW) {
    const c = document.createElement("canvas");
    c.width = Math.round(pxW); c.height = Math.round(pxW * d.h / d.w);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    const b = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
    return { jpeg: new Uint8Array(await b.arrayBuffer()), iw: c.width, ih: c.height, texts: [], w: d.w, h: d.h };
  }

  C.pptx = { toPdf, writePdf };
})();
