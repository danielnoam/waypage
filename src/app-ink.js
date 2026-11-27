// Waypage's shell (1.56.0): drawing on a PDF with a pen. The pen button
// in the reader bar, the bar of tools along the foot of the pages while
// Draw is on, the Drawings sheet in ⋯ and the copy of the PDF with the
// drawings in it. The strokes themselves are ink.js; this is what the
// person touches. Only a PDF shown as its own pages can be drawn on.
const INK_KEY = "waypage.ink";
const INK_OFFER_KEY = "waypage.inkOffered";
const INK_COLORS = {
  pen: [["ink", t("Black")], ["red", t("Red")], ["blue", t("Blue")], ["green", t("Green")]],
  highlighter: [["yellow", t("Yellow")], ["green", t("Green")], ["blue", t("Blue")], ["pink", t("Pink")], ["purple", t("Purple")]],
};
const INK_ICONS = {
  pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  highlighter: '<path d="M14.5 4.5l5 5L11 18H6v-5z"></path><path d="M4 21h16"></path>',
  eraser: '<path d="M7 21h10"></path><path d="M5.5 13.5l7-7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11.5 19H8l-2.5-2.5a2 2 0 0 1 0-3z"></path>',
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>',
  redo: '<path d="M15 14l5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h3"></path>',
  select: '<path d="M12 4c4.4 0 8 1.8 8 4s-3.6 4-8 4-8-1.8-8-4 3.6-4 8-4z" stroke-dasharray="3 3"></path><path d="M9 12.5c-.6 2.2.4 4 2 5.2 1.1.8 1.2 2.3-.2 3.3"></path>',
  add: '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  text: '<path d="M5 7V4h14v3"></path><path d="M12 4v16"></path><path d="M9 20h6"></path>',
  note: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path><path d="M8.5 11h7"></path><path d="M8.5 14.5h4"></path>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="9" cy="10" r="1.6"></circle><path d="M21 16l-5-5-9 9"></path>',
  cut: '<circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M8.1 8.1L20 20"></path><path d="M20 4L8.1 15.9"></path>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15V6a2 2 0 0 1 2-2h8"></path>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"></rect><path d="M9 4h6v3H9z"></path>',
  collapse: '<path d="M6 9l6 6 6-6"></path>',
  front: '<path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path>',
  back: '<path d="M12 5v14"></path><path d="M19 12l-7 7-7-7"></path>',
  trash: '<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13h10l1-13"></path><path d="M9 7V4h6v3"></path>',
  drop: '<path d="M20.5 3.5a2.1 2.1 0 0 0-3 0L14 7l-1-1-2 2 1 1-7 7v4h4l7-7 1 1 2-2-1-1 3.5-3.5a2.1 2.1 0 0 0 0-3z"></path>',
  finger: '<path d="M18 11V6a2 2 0 0 0-4 0v1"></path><path d="M14 10V4a2 2 0 0 0-4 0v6"></path><path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15"></path>',
};
const inkIcon = (name) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  s.innerHTML = INK_ICONS[name];
  return s;
};

let inkBar = null, inkClipId = null;
// The bar tucked away into one round button (2026-11), kept for next time.
let inkSmall = false, inkTab = null, inkMini = null;
// The colours in the bar, kept: a name is the colour it always was, "#rrggbb" one of your own.
let inkSlots = null;
const inkColorOk = (kind, c) => (/^#[0-9a-f]{6}$/.test(c) || INK_COLORS[kind].some((x) => x[0] === c));
const inkSlotsOf = (kind) => (inkSlots && inkSlots[kind]) || INK_COLORS[kind].map((x) => x[0]);

// What the Pen plugin is asked to do: look at the pen (while a PDF's pages
// are open), tell everything (the pen test), take One UI's button-and-drag
// from the page (while Draw is on).
const penNative = { on: false, raw: false, grab: false };
function penNativeSet(patch) {
  Object.assign(penNative, patch);
  C.platform.pen.watch(penNative.on, penNative.on && penNative.raw, penNative.on && penNative.grab);
}

// Drawing goes with highlights (2026-11): any clip or file can be drawn on,
// from its Highlights sheet or the selection bar. Only a note keeps the pen
// in the reader bar, since writing is what a note is for. Called once the
// reader has the clip up.
async function inkSync(p) {
  const ok = !!p && !p.preview && C.files.drawable(p);
  $("readerInk").hidden = !(ok && p.note);
  if (!ok) { inkClose(); return; }
  if (inkClipId === p.id) return;
  inkClose();
  inkClipId = p.id;
  // The pen's buttons are read natively while something drawable is open.
  penNativeSet({ on: true });
  const { stale } = await C.ink.load(p);
  if (state.open !== p) return;
  if (stale) toast(t("This PDF has changed since you drew on it. The drawings may not line up."));
  // A note is for writing: its pen is ready when it opens.
  if (p.note) { inkSet(true); if (!p.thumb) noteCoverSoon(p, 1500); }
}
// A note's card shows its first sheet (2026-11), drawn again a moment
// after the first sheet is written on, and once for a note that came
// from another device (a card picture never syncs).
let noteCoverTimer = 0;
function noteCoverSoon(p, ms) {
  clearTimeout(noteCoverTimer);
  noteCoverTimer = setTimeout(() => noteCover(p), ms);
}
async function noteCover(p) {
  const handle = C.files.heldPdf();
  if (state.open !== p || !p.note || !handle || !handle.sheets) return;
  await noteCoverKeep(p, () => C.notes.cover(handle, C.ink.strokes(1)), () => state.open === p);
}
// Draws the picture with `make`, keeps it as the card's and stamps when,
// so the card's address changes (the file's name never does).
async function noteCoverKeep(p, make, still) {
  try {
    const bytes = await make();
    if (!still()) return;
    p.thumb = await C.files.thumbnail(p.id, bytes, "image/jpeg");
    p.thumbAt = Date.now();
    await C.store.writeIndexOnly(state.pages);
    if (!C.platform.native) await loadThumbs();
    renderLibrary();
  } catch (e) { /* the card keeps what it had */ }
}
// A note's card drawn without opening it: its first sheet and the strokes
// on it, read from the note's own files.
async function noteCoverOf(p) {
  if (!p || !p.note || state.open === p) return;
  let opened = null;
  try {
    opened = await C.notes.open(p);
    const d = await C.store.readInk(p.id);
    const list = d && d.pages && Array.isArray(d.pages[1]) ? d.pages[1].map(C.ink.clean).filter(Boolean) : [];
    const images = {};
    for (const s of list) if (s.t === "i" && !(s.f in images)) images[s.f] = await C.store.readInkImage(p.id, s.f);
    await noteCoverKeep(p, () => C.notes.cover(opened.handle, list, images), () => state.pages.includes(p) && state.open !== p);
  } catch (e) { /* the card keeps what it had */ }
  finally { if (opened) opened.handle.close(); }
}
// Every note whose card is missing or older than its last edit, one at a
// time while the app is idle (a card picture never syncs, so a note that
// came from another device has none).
let noteCoverQueue = null;
const noteCoverTried = new Map();
function noteCoversSoon() {
  const due = () => state.pages.filter((p) => p.note && state.open !== p && (!p.thumb || (p.editedAt || 0) > (p.thumbAt || 0)));
  if (noteCoverQueue) return;
  noteCoverQueue = true;
  const next = async () => {
    const p = due().find((x) => !(noteCoverTried.get(x.id) >= (x.editedAt || 0) + 1));
    if (!p) { noteCoverQueue = null; return; }
    noteCoverTried.set(p.id, (p.editedAt || 0) + 1);
    await noteCoverOf(p);
    setTimeout(next, 200);
  };
  setTimeout(next, 1500);
}
// A clip's drawings by block live on its index entry (`ink`, page -> strokes),
// beside its highlights, so they sync and back up the same way.
C.ink.blockStore = {
  read: (meta) => (meta.ink && typeof meta.ink === "object" ? meta.ink : null),
  write: async (id, pages) => {
    const p = state.pages.find((x) => x.id === id);
    if (!p) return;
    if (pages) p.ink = JSON.parse(JSON.stringify(pages)); else delete p.ink;
    p.inkAt = Date.now();
    await C.store.writeIndex(state.pages);
    renderLibrary();
  },
};
const inkReady = () => inkClipId != null && !!state.open && state.open.id === inkClipId;
// Draw from the Highlights sheet or the selection bar.
function inkStart() {
  if (!inkReady()) return;
  const go = () => inkSet(true);
  if (state.sheet) { history.back(); setTimeout(go, 0); } else go();
}
function inkClose() {
  if (inkColor) inkColor.close();
  if (inkClipId == null && !C.ink.on) return;
  // A pen test going on is stopped, and what it drew on the page taken off.
  if (penT) penTestEnd(true, true);
  inkSet(false);
  C.ink.unload();
  penNativeSet({ on: false, raw: false, grab: false });
  inkClipId = null;
}
function inkPrefs() {
  const saved = load(INK_KEY, {}) || {};
  // Three sizes became five (1.56.0): an older saved one keeps its place on the scale.
  const size = saved.v === 2 ? saved.size : [0, 2, 4][saved.size];
  // A computer draws with the mouse; a touch screen with the pen alone,
  // so a hand resting on the page leaves no mark.
  inkSlots = {};
  for (const kind of ["pen", "highlighter"]) {
    const n = INK_COLORS[kind].length, mine = saved.slots && Array.isArray(saved.slots[kind]) ? saved.slots[kind] : [];
    inkSlots[kind] = INK_COLORS[kind].map((x, i) => (typeof mine[i] === "string" && inkColorOk(kind, mine[i]) ? mine[i] : x[0])).slice(0, n);
  }
  inkSmall = saved.small === true;
  return { tool: ["pen", "highlighter", "eraser", "select"].includes(saved.tool) ? saved.tool : "pen", colors: saved.colors || {}, size: [0, 1, 2, 3, 4].includes(size) ? size : 2,
    style: C.ink.STYLES.includes(saved.style) ? saved.style : "ball",
    finger: typeof saved.finger === "boolean" ? saved.finger : !matchMedia("(pointer: coarse)").matches,
    shapes: saved.shapes !== false };
}
function inkKeep() {
  const s = C.ink.state();
  store(INK_KEY, { v: 2, tool: s.tool, colors: s.colors, slots: inkSlots || undefined, small: inkSmall || undefined, size: s.size, style: s.style, finger: s.finger, shapes: s.shapes });
}
// Whether a held line or circle is made straight or round (the Draw tab's switch).
const inkShapesOn = () => ((load(INK_KEY, {}) || {}).shapes !== false);
function inkShapes(on) {
  C.ink.setting({ shapes: !!on });
  const o = load(INK_KEY, {}) || {};
  o.shapes = !!on;
  store(INK_KEY, o);
}

function inkSet(on) {
  on = !!on && inkReady();
  if (on === C.ink.on && (!!inkBar && !inkBar.hidden) === on) { $("readerInk").setAttribute("aria-pressed", String(on)); return; }
  if (on) C.ink.setting(inkPrefs());
  C.ink.setOn(on);
  penNativeSet({ grab: on });
  $("readerInk").setAttribute("aria-pressed", String(on));
  $("readerInk").setAttribute("aria-label", on ? t("Stop drawing") : t("Draw"));
  if (on) {
    if (!inkBar) inkBuild();
    inkPaint();
    hideReadHere();
  }
  inkLayout();
}
// The full bar with its tab, or the round button, or neither (Draw off).
function inkLayout() {
  if (!C.ink.on || inkSmall) { inkPopClose(true); if (inkColor) inkColor.close(); }
  inkReveal(inkBar, C.ink.on && !inkSmall);
  inkReveal(inkTab, C.ink.on && !inkSmall);
  inkReveal(inkMini, C.ink.on && inkSmall);
}
function inkReveal(el, yes) {
  if (!el) return;
  el._want = yes;
  if (yes && el.hidden) { el.hidden = false; if (el === inkMini) inkMiniPlace(); M.edgeIn(el, "bottom"); }
  else if (!yes && !el.hidden) M.edgeOut(el, "bottom").finally(() => { if (!el._want) el.hidden = true; });
}
// The round button can be dragged anywhere (2026-11). Let go, it snaps to the
// nearer side, and the side and height are kept, as the Narrate card does.
const INK_MINI_KEY = "waypage.inkMini";
function inkMiniPlace() {
  if (!inkMini || inkMini.hidden) return;
  const gap = 16, w = inkMini.offsetWidth, h = inkMini.offsetHeight;
  const safe = parseFloat(getComputedStyle(inkMini).getPropertyValue("--safe-bottom")) || 0;
  const head = $("readerView").querySelector(".reader-bar");
  const topMin = Math.max(gap, head ? head.getBoundingClientRect().bottom + 8 : gap);
  const topMax = innerHeight - safe - gap - h;
  const put = load(INK_MINI_KEY, null);
  const end = document.documentElement.dir === "rtl" ? "left" : "right";
  const side = put && (put.side === "left" || put.side === "right") ? put.side : end;
  const top = put && typeof put.y === "number" ? Math.round(put.y * innerHeight) : topMax;
  inkMini.style.left = (side === "left" ? gap : innerWidth - gap - w) + "px";
  inkMini.style.top = Math.max(topMin, Math.min(top, topMax)) + "px";
}
function inkMiniDrag() {
  let drag = null;
  inkMini.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const r = inkMini.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
  });
  // Moves are heard on the window: a quick drag leaves the button before its first move.
  addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; inkMini.classList.add("dragging"); }
    inkMini.style.left = drag.left + dx + "px";
    inkMini.style.top = drag.top + dy + "px";
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag;
    drag = null;
    if (!was.moved) return;
    inkMini.classList.remove("dragging");
    // A drag isn't a tap: the click that follows it does nothing.
    inkMini.dataset.dragged = "1";
    setTimeout(() => delete inkMini.dataset.dragged, 0);
    const r = inkMini.getBoundingClientRect();
    store(INK_MINI_KEY, { side: r.left + r.width / 2 < innerWidth / 2 ? "left" : "right", y: Math.max(0, Math.min(1, r.top / innerHeight)) });
    inkMini.classList.add("snapping");
    inkMiniPlace();
    setTimeout(() => inkMini.classList.remove("snapping"), 400);
  };
  addEventListener("pointerup", drop);
  addEventListener("pointercancel", drop);
  addEventListener("resize", inkMiniPlace);
}
function inkSmallSet(on) {
  if (!C.ink.on || inkSmall === on) return;
  inkSmall = on;
  inkKeep();
  inkLayout();
  inkPaint();
  if (document.body.classList.contains("keys")) (on ? inkMini : inkTab).focus();
}

function inkBuild() {
  const btn = (label, icon, act, extra) => {
    const b = el("button", { type: "button", "aria-label": label, title: label, "data-act": act, ...(extra || {}) });
    if (icon) b.append(inkIcon(icon));
    return b;
  };
  inkBar = el("div", { class: "ink-bar", role: "toolbar", "aria-label": t("Draw"), hidden: true },
    el("div", { class: "ink-row ink-tools" },
      btn(t("Pen"), "pen", "tool:pen"), btn(t("Highlighter"), "highlighter", "tool:highlighter"), btn(t("Eraser"), "eraser", "tool:eraser"), btn(t("Select"), "select", "tool:select"),
      btn(t("Add"), "add", "add", { "aria-haspopup": "menu", "aria-expanded": "false" }),
      el("span", { class: "ink-gap" }),
      btn(t("Undo"), "undo", "undo"), btn(t("Redo"), "redo", "redo"),
      el("button", { type: "button", class: "ink-done", "data-act": "done" }, t("Done"))),
    el("div", { class: "ink-row ink-style" }));
  inkBar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    const [act, arg] = b.dataset.act.split(":");
    // Size and Style open their small menu; anything else closes it.
    if (inkLP.fired) { inkLP.fired = false; return; }
    if (act === "size" || act === "style" || act === "add") { inkPopOpen(act, b); return; }
    if (act === "cut") { C.ink.cut(); return; }
    if (act === "copy") { C.ink.copy(); return; }
    if (act === "paste") { C.ink.paste(); return; }
    if (act === "delete") { C.ink.del(); return; }
    if (act === "front") { C.ink.front(); return; }
    if (act === "back") { C.ink.back(); return; }
    if (act === "edittext") { const t = C.ink.selectedText(); if (t) inkText(t); return; }
    if (act === "editnote") { const n = C.ink.selectedNote(); if (n) inkNote(n.id); return; }
    inkPopClose();
    if (act === "tool") C.ink.setting({ tool: arg });
    else if (act === "color") C.ink.setting({ color: arg });
    else if (act === "finger") C.ink.setting({ finger: !C.ink.state().finger });
    else if (act === "undo") inkGo(C.ink.undo());
    else if (act === "redo") inkGo(C.ink.redo());
    else if (act === "done") { inkSet(false); return; }
    inkKeep();
  });
  $("readerView").append(inkBar);
  // Hide tools: a tab on the bar's top edge; the round button brings it back.
  inkTab = el("button", { type: "button", class: "ink-tab", "aria-label": t("Hide tools"), title: t("Hide tools"), hidden: true, onclick: () => inkSmallSet(true) }, inkIcon("collapse"));
  inkMini = el("button", { type: "button", class: "ink-mini", "aria-label": t("Show tools"), title: t("Show tools"), hidden: true, onclick: () => { if (!inkMini.dataset.dragged) inkSmallSet(false); } });
  $("readerView").append(inkTab, inkMini);
  inkMiniDrag();
  // Long press on a colour opens the colour sheet for it (a right click does too).
  const slotOf = (e) => { const b = e.target.closest && e.target.closest('button[data-slot]'); return b && inkBar.contains(b) ? b : null; };
  inkBar.addEventListener("pointerdown", (e) => {
    const b = slotOf(e);
    clearTimeout(inkLP.timer);
    inkLP.fired = false;
    if (!b) return;
    inkLP.timer = setTimeout(() => { inkLP.fired = true; inkColorOpen(Number(b.dataset.slot)); }, 500);
  });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) inkBar.addEventListener(t, () => clearTimeout(inkLP.timer));
  inkBar.addEventListener("contextmenu", (e) => { const b = slotOf(e); if (!b) return; e.preventDefault(); inkColorOpen(Number(b.dataset.slot)); });
  inkBar.addEventListener("keydown", (e) => { const b = slotOf(e); if (b && e.key === "Enter" && e.shiftKey) { e.preventDefault(); inkColorOpen(Number(b.dataset.slot)); } });
  // The file picker behind Add > Image.
  inkFile = el("input", { type: "file", accept: "image/*", class: "visually-hidden", tabindex: "-1", "aria-hidden": "true" });
  inkFile.addEventListener("change", () => { const f = inkFile.files[0]; inkFile.value = ""; if (f) inkAddImage(f); });
  inkBar.append(inkFile);
}
const inkLP = { timer: 0, fired: false };
let inkFile = null;

// A picture from the phone onto the page in view: at most 2000 px a side,
// a JPEG, or a PNG when it has see-through parts. Nothing leaves the device.
async function inkAddImage(file) {
  try {
    if (!/^image\//.test(file.type) || file.size > 40e6) throw new Error("not a picture");
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const px = g.getImageData(0, 0, w, h).data;
    let see = false;
    for (let i = 3; i < px.length; i += 16) if (px[i] < 250) { see = true; break; }
    const url = cv.toDataURL(see ? "image/png" : "image/jpeg", 0.85);
    // Select first: changing tool lets go of what is taken, and the new picture is.
    inkSelect();
    if (!C.ink.addImage(url, h / w)) throw new Error("no page");
  } catch (e) {
    toast(t("Couldn't add that picture. Try another."));
  }
}
// The picture just added is taken, so it can be moved: Select is the tool.
function inkSelect() {
  if (C.ink.state().tool !== "select") { C.ink.setting({ tool: "select" }); inkKeep(); }
}
// ---- Size and pen style: a small menu above their button ----

const INK_DOTS = [3, 6, 9, 12, 16];
const INK_STYLES = [["ball", t("Ballpoint")], ["marker", t("Marker")], ["fountain", t("Fountain pen")], ["brush", t("Brush")]];
const inkStyleName = (y) => (INK_STYLES.find((x) => x[0] === y) || INK_STYLES[0])[1];
let inkPop = null;     // { kind, el }

// A short stroke in a style, drawn by the engine that draws the real ones.
function inkSample(style, width, height) {
  const NS = "http://www.w3.org/2000/svg";
  const h = height / width, svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 1 " + h);
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("aria-hidden", "true");
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    pts.push(0.1 + 0.8 * t, h / 2 + h * 0.22 * Math.sin(t * Math.PI * 2), 0.3 + 0.6 * Math.sin(t * Math.PI));
  }
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", C.ink.penPath(pts, 0.09, style));
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}
function inkPopMenu(kind) {
  const s = C.ink.state();
  const pick = (patch) => { C.ink.setting(patch); inkKeep(); inkPopClose(); };
  if (kind === "size") {
    return el("div", { class: "ink-pop ink-pop-sizes", role: "menu", "aria-label": t("Size") },
      ...INK_DOTS.map((d, i) => el("button", { type: "button", role: "menuitemradio", "aria-checked": String(s.size === i), "aria-pressed": String(s.size === i), "aria-label": t("Size {i}", { i: i + 1 }), onclick: () => pick({ size: i }) },
        el("span", { class: "ink-pop-dot" }, el("span", { class: "ink-size", style: "width:" + d + "px;height:" + d + "px" })), el("span", { class: "ink-pop-n" }, String(i + 1)))));
  }
  if (kind === "add") {
    return el("div", { class: "ink-pop ink-pop-styles", role: "menu", "aria-label": t("Add") },
      // A picture stays on this device, so a clip's drawings, which sync, take none.
      C.ink.blocks ? null : el("button", { type: "button", role: "menuitem", onclick: () => { inkPopClose(); inkFile.click(); } }, inkIcon("image"), el("span", { class: "ink-pop-name" }, t("Image"))),
      // Typed text goes on a note (2.0.0).
      el("button", { type: "button", role: "menuitem", onclick: () => { inkPopClose(); inkText(null); } }, inkIcon("text"), el("span", { class: "ink-pop-name" }, t("Text"))),
      // A comment bubble: colour and tags are a highlight's own (2026-11).
      el("button", { type: "button", role: "menuitem", onclick: () => { inkPopClose(); inkAddNote(); } }, inkIcon("note"), el("span", { class: "ink-pop-name" }, t("Note"))));
  }
  return el("div", { class: "ink-pop ink-pop-styles", role: "menu", "aria-label": t("Pen style") },
    ...INK_STYLES.map(([y, name]) => el("button", { type: "button", role: "menuitemradio", "aria-checked": String(s.style === y), "aria-pressed": String(s.style === y), onclick: () => pick({ style: y }) },
      inkSample(y, 72, 28), el("span", { class: "ink-pop-name" }, name), el("span", { class: "ink-pop-tick", "aria-hidden": "true" }, s.style === y ? "✓" : ""))));
}
function inkPopOpen(kind, btn) {
  if (inkPop && inkPop.kind === kind) { inkPopClose(); return; }
  inkPopClose(true);
  const menu = inkPopMenu(kind);
  $("readerView").append(menu);
  // Over its button and above the bar (so it covers none of the bar's own
  // buttons), kept inside the screen.
  const r = btn.getBoundingClientRect(), top = inkBar.getBoundingClientRect().top, w = menu.offsetWidth;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  menu.style.left = left + "px";
  menu.style.bottom = (innerHeight - top + 8) + "px";
  M.popFrom(menu, r);
  inkPop = { kind, el: menu, btn };
  inkPopMark();
  const first = menu.querySelector('[aria-checked="true"]') || menu.querySelector("button");
  if (first && document.body.classList.contains("keys")) first.focus();
}
function inkPopClose(now) {
  const p = inkPop;
  if (!p) return;
  inkPop = null;
  if (now) p.el.remove();
  else M.popOut(p.el, p.btn.getBoundingClientRect()).then(() => p.el.remove());
  inkPopMark();
}
// Which button has its menu open, said in place: the bar's buttons stay as they are, so a tap on
// another one while a menu closes still lands on it.
function inkPopMark() {
  if (!inkBar) return;
  for (const kind of ["size", "style", "add"]) {
    const b = inkBar.querySelector('[data-act="' + kind + '"]');
    if (b) b.setAttribute("aria-expanded", String(!!inkPop && inkPop.kind === kind));
  }
}
// A tap anywhere else, and drawing, close it.
document.addEventListener("pointerdown", (e) => {
  if (!inkPop || inkPop.el.contains(e.target)) return;
  const t = inkBar && inkBar.querySelector('[data-act="' + inkPop.kind + '"]');
  if (t && t.contains(e.target)) return;
  inkPopClose();
}, true);
C.ink.onDraw = () => inkPopClose();
// Arrow keys move along an open menu.
document.addEventListener("keydown", (e) => {
  if (!inkPop || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const items = [...inkPop.el.querySelectorAll("button")], at = items.indexOf(document.activeElement);
  const d = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1;
  items[(at + d + items.length) % items.length].focus();
  e.preventDefault();
});
// Smaller or bigger, from the keys.
function inkSize(d) {
  const to = Math.max(0, Math.min(4, C.ink.state().size + d));
  C.ink.setting({ size: to });
  inkKeep();
}

// Undo or redo on a page that isn't on screen goes there.
function inkGo(n) {
  if (n && !C.ink.shown().includes(n)) C.reader.toPrinted(n);
}
// The bar as it stands: the tool and the colour, size and Finger beside.
function inkPaint() {
  if (!inkBar) return;
  const s = C.ink.state();
  for (const b of inkBar.querySelectorAll('[data-act^="tool:"]')) b.setAttribute("aria-pressed", String(b.dataset.act === "tool:" + s.tool));
  inkBar.querySelector('[data-act="undo"]').disabled = !s.canUndo;
  inkBar.querySelector('[data-act="redo"]').disabled = !s.canRedo;
  // The round button shows the tool and, for a pen, its colour.
  if (inkMini) {
    const tc = s.color, mine = typeof tc === "string" && tc[0] === "#";
    inkMini.replaceChildren(inkIcon(s.tool), ...(s.tool === "pen" || s.tool === "highlighter" ? [el("span", { class: "ink-dot ink-mini-dot", "data-c": mine ? "" : tc, "data-t": s.tool === "highlighter" ? "h" : "p", ...(mine ? { style: "background:" + tc } : {}) })] : []));
  }
  const row = inkBar.querySelector(".ink-style");
  const hl = s.tool === "highlighter";
  const kind = hl ? "highlighter" : "pen";
  const swatches = s.tool === "eraser" || s.tool === "select" ? [] : INK_COLORS[kind].map(([name0, name], i) => {
    const c = inkSlotsOf(kind)[i], mine = c[0] === "#";
    return el("button", { type: "button", "aria-label": mine ? t("Your colour {toUpperCase}", { toUpperCase: c.toUpperCase() }) : name, title: t("Hold to change this colour"), "aria-pressed": String(s.color === c), "data-act": "color:" + c, "data-slot": String(i) },
      el("span", { class: "ink-dot", "data-c": mine ? "" : c, "data-t": hl ? "h" : "p", ...(mine ? { style: "background:" + c } : {}) }));
  });
  const act = (label, icon, a, on) => el("button", { type: "button", "aria-label": label, title: label, "data-act": a, ...(on ? {} : { disabled: "" }) }, inkIcon(icon));
  const editRow = s.tool === "select" ? [...(C.ink.selectedText() ? [act(t("Edit text"), "text", "edittext", true)] : []), ...(C.ink.selectedNote() ? [act(t("Edit note"), "note", "editnote", true)] : []), act(t("Cut"), "cut", "cut", s.selected), act(t("Copy"), "copy", "copy", s.selected), act(t("Paste"), "paste", "paste", s.canPaste), act(t("Delete"), "trash", "delete", s.selected), act(t("Move to top"), "front", "front", s.selected), act(t("Move to bottom"), "back", "back", s.selected)] : [];
  const sizeBtn = s.tool === "eraser" || s.tool === "select" ? null : el("button", { type: "button", "aria-label": t("Size {n} of 5", { n: s.size + 1 }), title: t("Size"), "aria-haspopup": "menu", "aria-expanded": String(!!inkPop && inkPop.kind === "size"), "data-act": "size" },
    el("span", { class: "ink-size", style: "width:" + INK_DOTS[s.size] + "px;height:" + INK_DOTS[s.size] + "px" }));
  const styleBtn = s.tool !== "pen" ? null : el("button", { type: "button", "aria-label": t("Pen style: {inkStyleName}", { inkStyleName: inkStyleName(s.style) }), title: t("Pen style"), "aria-haspopup": "menu", "aria-expanded": String(!!inkPop && inkPop.kind === "style"), "data-act": "style" },
    inkSample(s.style, 28, 16));
  fill(row, ...swatches, ...editRow, sizeBtn, styleBtn,
    s.tool === "select" ? el("span", { class: "ink-gap" }) : null,
    el("button", { type: "button", "aria-label": t("Draw with a finger"), title: t("Draw with a finger or mouse"), "aria-pressed": String(s.finger), "data-act": "finger" }, inkIcon("finger")));
  // What's open can't be, with this tool.
  if (inkPop && ((inkPop.kind === "style" && s.tool !== "pen") || (inkPop.kind === "size" && s.tool === "eraser"))) inkPopClose(true);
}
C.ink.onChange = () => {
  inkPaint();
  if (state.sheet === "ink") $("readingBody").replaceChildren(SHEETS.ink.build());
};
// A note written on counts as edited, so sync sends it again (2.0.0).
// A PDF's pages drawn on keep a summary on its entry (`drawn`: [page,
// strokes]), so Highlights can list them without opening the PDF.
C.ink.onSaved = (id) => {
  const p = state.pages.find((x) => x.id === id);
  if (!p) return;
  // A sheet's or page's comment bubbles are summed up on the entry too
  // (`noted`), so Highlights lists them and their tags without opening the file.
  const keepNoted = () => {
    if (C.ink.blocks || state.open !== p) return;
    const list = C.ink.notes().slice(0, 500).map((x) => ({ id: x.id, n: x.n, text: x.text.slice(0, 4000), c: x.c, ...(x.tags.length ? { tags: x.tags } : {}) }));
    if (list.length) p.noted = list; else delete p.noted;
  };
  if (p.note) { p.editedAt = Date.now(); keepNoted(); if (C.ink.strokes(1).length || p.thumb) noteCoverSoon(p, 2000); }
  else if (!C.ink.blocks && C.ink.state && state.open === p) {
    const d = C.ink.drawn().map((x) => [x.page, new Set(C.ink.strokes(x.page).filter((s) => s.t !== "n").map((s) => s.id)).size]);
    if (d.length) p.drawn = d; else delete p.drawn;
    keepNoted();
    p.inkAt = Date.now();
  } else return;
  indexSoon();
};
// The first time a pen touches something drawable, Draw is offered, once.
C.ink.onPen = () => {
  if (C.ink.on || !inkReady() || state.sheet || load(INK_OFFER_KEY, false)) return;
  store(INK_OFFER_KEY, true);
  toast(state.open && state.open.note ? t("Draw on this note with your pen?") : t("Draw here with your pen?"), t("Draw"), () => inkSet(true));
};
$("readerInk").addEventListener("click", () => inkSet(!C.ink.on));
// A note grows as you write: a stroke on its last sheet adds one.
C.ink.onStroke = (n) => { if (n === C.files.noteSheets()) C.files.addSheet(); };
// What the phone says of the pen: near, the eraser end, a button held.
if (C.platform.pen.available) {
  C.platform.pen.onState((s) => { C.ink.fromPhone(s); penTestState(s); });
  // The side button and a drag (One UI sends no touch for it): erases, from the web view's corner.
  C.platform.pen.onErase((e) => {
    penTestErase(e);
    const r = $("readerFrame").getBoundingClientRect(), k = devicePixelRatio || 1;
    C.ink.eraseFrom(e.a, e.x / k - r.left, e.y / k - r.top);
  });
}

// ---- Drawings, in ⋯ ----

// Try your pen (from Highlights): what the page and the phone each say of
// a pen, and the pen test.
function inkSheet() {
  return el("div", { class: "ink-sheet" }, inkProbe());
}
// Every drawing on the clip gone, page by page or block by block.
async function inkRemoveAll(p, groups) {
  for (const g of groups) await inkRemoveGroup(p, g);
}

// A pad to try the pen on, with what the page and the phone each say of
// it: the pen's side button shows as `buttons` 2 or 32 in a browser, or
// not at all, and as "button yes" from the phone's own touch events. It
// says what a pen really sends, where it can't be seen otherwise.
function inkProbe() {
  const out = el("pre", { class: "ink-probe-out" });
  let web = null, touch = "";
  const yes = (v) => (v ? "yes" : "no");
  const paint = () => {
    const n = C.ink.nat;
    out.textContent = t("Page: {x}\nPhone: {x2}", { x: web ? web.pointerType + " " + web.type + " · button " + web.button + " · buttons " + web.buttons + " · pressure " + web.pressure + (touch ? " · touch " + touch : "") : "nothing yet", x2: C.platform.pen.available ? "near " + yes(n.near) + " · down " + yes(n.down) + " · button " + yes(n.button) + " · eraser " + yes(n.eraser) + " · tool " + n.tool + " · buttons " + n.buttons : t("no pen reading here") });
  };
  const pad = el("div", { class: "ink-probe-pad" }, t("Touch here with the pen, with a button held too"));
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerenter"]) {
    pad.addEventListener(t, (e) => { web = { type: e.type, pointerType: e.pointerType, button: e.button, buttons: e.buttons, pressure: Math.round(e.pressure * 100) / 100 }; paint(); });
  }
  pad.addEventListener("touchstart", (e) => { touch = (e.changedTouches[0] && e.changedTouches[0].touchType) || ""; paint(); }, { passive: true });
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
  penTestPad(pad);
  C.ink.onProbe = paint;
  paint();
  return el("div", { class: "ink-probe" }, pad, out, penTestView());
}

// The PDF with the drawings in it as ink annotations, saved where the
// person picks. The file Waypage reads from is never changed.
async function inkCopy(p) {
  const pdf = C.files.heldPdf();
  if (!pdf || !pdf.ink) { toast(t("Open the PDF's pages first.")); return; }
  toast(t("Making the copy…"));
  try {
    await C.ink.flush();
    const bytes = await pdf.ink(C.ink.forPdf());
    const name = ((p.file && p.file.name) || p.title || t("Drawing")).replace(/\.pdf$/i, "") + " (drawn).pdf";
    if (!C.platform.canSaveFiles) { C.platform.download(name, new Blob([bytes], { type: "application/pdf" })); return; }
    const cache = await C.store.cacheFile(name);
    for (let i = 0; i < bytes.length; i += 1 << 20) await cache.append(bytes.subarray(i, i + (1 << 20)));
    const uri = await cache.uri();
    const saved = await C.platform.saveFile(uri, name, "application/pdf");
    if (saved === null) await C.platform.shareFile(uri, name);
    else if (saved) toast(t("Saved {name}", { name: name }));
  } catch (e) {
    console.error(e);
    toast(t("Couldn't make the copy. Try again."));
  }
}

// ---- Your own colours: the colour sheet ----
// Opened by a long press on a colour in the bar. A spectrum (hue across,
// pale at the top), a slider for how light it is, the colour as Hex and
// Red, Green and Blue to type into, the tool's colours to pick which one
// changes, and an eyedropper that reads a colour off the PDF.

let inkColor = null;   // { el, kind, slots, orig, at, h, s, v, stop }
const inkRgbOf = (kind, c) => (c[0] === "#" ? C.ink.hexRgb(c) : (kind === "highlighter" ? C.ink.HIGHLIGHT : C.ink.PEN)[c]);

function inkColorOpen(at) {
  if (inkColor) return;
  const kind = C.ink.state().tool === "highlighter" ? "highlighter" : "pen";
  if (C.ink.state().tool !== kind) return;
  inkPopClose(true);
  const slots = [...inkSlotsOf(kind)];
  const k = { kind, slots, orig: [...slots], at, h: 0, s: 0, v: 1, stop: null };
  const sheet = el("div", { class: "ink-color", role: "dialog", "aria-label": t("Colour") });
  k.el = sheet;
  inkColor = k;
  const slotRect = () => { const b = inkBar && inkBar.querySelector('[data-slot="' + at + '"]'); return b ? b.getBoundingClientRect() : null; };
  const canvas = el("canvas", { class: "ic-spectrum", width: 320, height: 200, "aria-label": t("Colour spectrum") });
  const ring = el("span", { class: "ic-ring" });
  const slider = el("input", { type: "range", class: "ic-slider", min: 0, max: 100, step: 1, "aria-label": t("Lightness") });
  const pct = el("span", { class: "ic-pct" });
  const oldSw = el("span", { class: "ic-old" }), newSw = el("span", { class: "ic-new" });
  const field = (label, attrs) => { const i = el("input", { class: "ic-field", "aria-label": label, autocomplete: "off", spellcheck: "false", ...attrs }); return [i, el("label", { class: "ic-col" }, el("span", {}, label), i)]; };
  const [hexI, hexC] = field(t("Hex"), { type: "text", maxlength: 7, inputmode: "text" });
  const [rI, rC] = field(t("Red"), { type: "text", inputmode: "numeric", maxlength: 3 });
  const [gI, gC] = field(t("Green"), { type: "text", inputmode: "numeric", maxlength: 3 });
  const [bI, bC] = field(t("Blue"), { type: "text", inputmode: "numeric", maxlength: 3 });
  const slotRow = el("div", { class: "ic-slots", role: "group", "aria-label": t("Which colour to change") });
  const dropper = el("button", { type: "button", class: "ic-drop", "aria-label": t("Pick a colour from the page"), title: t("Pick a colour from the page") }, inkIcon("drop"));
  const cancel = el("button", { type: "button", class: "ic-btn" }, t("Cancel")), done = el("button", { type: "button", class: "ic-btn" }, t("Done"));

  const rgb = () => C.ink.hsvRgb(k.h, k.s, k.v);
  const hex = () => C.ink.rgbHex(...rgb());
  // Paint the spectrum once: hue across, white fading in from the bottom to the top.
  const g = canvas.getContext("2d");
  const hues = g.createLinearGradient(0, 0, canvas.width, 0);
  for (let i = 0; i <= 6; i++) hues.addColorStop(i / 6, "hsl(" + i * 60 + " 100% 50%)");
  g.fillStyle = hues; g.fillRect(0, 0, canvas.width, canvas.height);
  const pale = g.createLinearGradient(0, 0, 0, canvas.height);
  pale.addColorStop(0, "#fff"); pale.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = pale; g.fillRect(0, 0, canvas.width, canvas.height);

  const set = (rgbv) => { [k.h, k.s, k.v] = C.ink.rgbHsv(...rgbv); paint(); };
  function paint(from) {
    const [r, gr, b] = rgb(), h = C.ink.rgbHex(r, gr, b);
    k.slots[k.at] = h;
    ring.style.left = (k.h / 360) * 100 + "%";
    ring.style.top = k.s * 100 + "%";
    ring.style.background = h;
    slider.value = Math.round(k.v * 100);
    slider.style.setProperty("--ic-to", C.ink.rgbHex(...C.ink.hsvRgb(k.h, k.s, 1)));
    pct.textContent = Math.round(k.v * 100) + "%";
    newSw.style.background = h;
    if (from !== "hex") hexI.value = h.toUpperCase();
    if (from !== "rgb") { rI.value = String(r); gI.value = String(gr); bI.value = String(b); }
    paintSlots();
  }
  function paintSlots() {
    slotRow.replaceChildren(...k.slots.map((c, i) => el("button", { type: "button", class: "ic-slot", "aria-pressed": String(i === k.at), "aria-label": t("Colour {n}, {hex}", { n: i + 1, hex: c.toUpperCase() }), onclick: () => { k.at = i; oldSw.style.background = "rgb(" + inkRgbOf(kind, k.orig[i]).join(",") + ")"; set(inkRgbOf(kind, c)); } },
      el("span", { class: "ink-dot", style: "background:rgb(" + inkRgbOf(kind, c).join(",") + ")" }))), dropper);
  }
  // Drag on the spectrum with a pen, a finger or the mouse.
  const fromSpectrum = (e) => {
    const r = canvas.getBoundingClientRect();
    k.h = Math.max(0, Math.min(359.9, ((e.clientX - r.left) / r.width) * 360));
    k.s = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    paint();
  };
  const wrap = el("div", { class: "ic-spec", tabindex: "0", role: "slider", "aria-label": t("Hue and paleness") }, canvas, ring);
  wrap.addEventListener("pointerdown", (e) => { e.preventDefault(); try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* it drags anyway */ } k.drag = true; fromSpectrum(e); });
  wrap.addEventListener("pointermove", (e) => { if (k.drag) fromSpectrum(e); });
  for (const t of ["pointerup", "pointercancel"]) wrap.addEventListener(t, () => { k.drag = false; });
  wrap.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: [-6, 0], ArrowRight: [6, 0], ArrowUp: [0, -0.04], ArrowDown: [0, 0.04] }[e.key];
    if (!d) return;
    e.preventDefault();
    k.h = (k.h + d[0] + 360) % 360; k.s = Math.max(0, Math.min(1, k.s + d[1]));
    paint();
  });
  slider.addEventListener("input", () => { k.v = Number(slider.value) / 100; paint(); });
  hexI.addEventListener("input", () => { let t = hexI.value.trim().toLowerCase(); if (t && t[0] !== "#") t = "#" + t; if (/^#[0-9a-f]{6}$/.test(t)) set(C.ink.hexRgb(t)), paint("hex"); });
  for (const i of [rI, gI, bI]) i.addEventListener("input", () => {
    const v = [rI, gI, bI].map((x) => x.value.trim());
    if (v.every((x) => /^\d{1,3}$/.test(x))) { [k.h, k.s, k.v] = C.ink.rgbHsv(...v.map((x) => Math.min(255, Number(x)))); paint("rgb"); }
  });
  for (const i of [hexI, rI, gI, bI]) i.addEventListener("blur", () => paint());
  dropper.addEventListener("click", () => {
    sheet.hidden = true;
    toast(t("Tap the page to take its colour. Esc to stop."));
    const back = () => { k.stop = null; if (inkColor === k) sheet.hidden = false; };
    k.stop = back;
    C.ink.pick((c) => {
      back();
      if (c) set(C.ink.hexRgb(c)); else toast(t("Couldn't read a colour there."));
    });
  });
  const close = () => { C.ink.pick(null); inkColor = null; M.dialogOut(sheet, slotRect()).then(() => sheet.remove()); };
  k.close = close;
  cancel.addEventListener("click", close);
  done.addEventListener("click", () => {
    // A colour the sheet only passed through (a rounding off by one) stays as it was.
    const near = (a, b) => inkRgbOf(kind, a).every((v, i) => Math.abs(v - inkRgbOf(kind, b)[i]) <= 1);
    inkSlots[kind] = k.slots.map((c, i) => (near(c, k.orig[i]) ? k.orig[i] : c));
    C.ink.setting({ color: inkSlots[kind][k.at] });
    inkKeep();
    inkPaint();
    close();
  });
  sheet.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); if (sheet.hidden) { C.ink.pick(null); k.stop && k.stop(); } else close(); } });
  fill(sheet, wrap,
    el("div", { class: "ic-slide" }, slider, pct),
    el("div", { class: "ic-values" }, el("span", { class: "ic-pair" }, oldSw, newSw), hexC, rC, gC, bC),
    el("hr", { class: "ic-rule" }), slotRow,
    el("div", { class: "ic-actions" }, cancel, done));
  inkInit(k, oldSw, set);
  $("readerView").append(sheet);
  M.dialogIn(sheet, slotRect());
  hexI.blur();
}
function inkInit(k, oldSw, set) {
  oldSw.style.background = "rgb(" + inkRgbOf(k.kind, k.orig[k.at]).join(",") + ")";
  set(inkRgbOf(k.kind, k.orig[k.at]));
}
// Esc while the sheet is hidden for the eyedropper gives it back.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && inkColor && inkColor.el.hidden) { C.ink.pick(null); inkColor.stop && inkColor.stop(); }
}, true);

// Cut, Copy, Paste and Delete from the keys while Select is the tool.
document.addEventListener("keydown", (e) => {
  if (!C.ink.on || C.ink.state().tool !== "select" || e.target.closest("input, textarea, [contenteditable]")) return;
  const mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
  if (mod && key === "c") C.ink.copy();
  else if (mod && key === "x") C.ink.cut();
  else if (mod && key === "v") C.ink.paste();
  else if (mod && e.shiftKey && e.key === "ArrowUp") C.ink.front();
  else if (mod && e.shiftKey && e.key === "ArrowDown") C.ink.back();
  else if (e.key === "Delete" || e.key === "Backspace") C.ink.del();
  else if (e.key === "Escape") C.ink.clearSelection();
  else return;
  e.preventDefault();
});

// A note saved as a PDF (2.0.0): every sheet with what is drawn on it, as a
// picture to a page. Saved or shared the way the copy of a PDF is.
async function noteToPdf(p) {
  if (!p.note || state.open !== p) return;
  toast(t("Making the PDF…"));
  try {
    await C.ink.flush();
    const { blob, name } = await C.notes.toPdf(p, C.files.heldPdf(), C.ink.strokes);
    if (!C.platform.canSaveFiles) { C.platform.download(name, blob); return; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const cache = await C.store.cacheFile(name);
    for (let i = 0; i < bytes.length; i += 1 << 20) await cache.append(bytes.subarray(i, i + (1 << 20)));
    const uri = await cache.uri();
    const saved = await C.platform.saveFile(uri, name, "application/pdf");
    if (saved === null) await C.platform.shareFile(uri, name);
    else if (saved) toast(t("Saved {name}", { name: name }));
  } catch (e) {
    console.error(e);
    toast(t("Couldn't make the PDF. Try again."));
  }
}

// ---- Typed text on a note (2.0.0) ----

// What the text sheet is for: a new text, or the one taken ({ id, text, z }).
let inkTextFor = null;
function inkText(existing) {
  inkTextFor = existing ? { ...existing } : { id: null, text: "", z: C.ink.TEXT_SIZES[1] };
  openMenu("noteText");
}
// The words in a box, a size, and Done; empty, a text is taken off.
function noteTextSheet() {
  const t = inkTextFor || { id: null, text: "", z: C.ink.TEXT_SIZES[1] };
  const box = el("textarea", { class: "note-text", rows: "5", "aria-label": i18n.t("Text"), placeholder: i18n.t("Type here"), maxlength: "4000", dir: "auto" });
  box.value = t.text;
  const names = [i18n.t("Small"), i18n.t("Medium"), i18n.t("Large")];
  const sizes = seg("note-text-size", i18n.t("Size"), C.ink.TEXT_SIZES.map((v, i) => ({ value: String(v), label: names[i] })), String(t.z), (v) => { t.z = Number(v); });
  const done = () => {
    const text = box.value, z = t.z, id = t.id;
    back().then(() => {
      if (id) C.ink.editText(id, text, z);
      else if (text.trim()) { inkSelect(); C.ink.addText(text, z); }
    });
  };
  setTimeout(() => box.focus(), 80);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t.id ? i18n.t("Edit text") : i18n.t("Add text"))),
    box,
    el("div", { class: "rc-row" }, el("span", { class: "rc-label" }, i18n.t("Size")), sizes),
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: done }, el("span", { class: "row-label accent" }, i18n.t("Done"))),
      el("button", { class: "row", type: "button", onclick: () => back() }, el("span", { class: "row-label" }, i18n.t("Cancel")))));
}

// ---- A comment bubble (2026-11) ----

// Add > Note: a bubble on the page in view, taken, and its sheet open to write in.
function inkAddNote() {
  inkSelect();
  const id = C.ink.addNote(markColor());
  if (id) inkNote(id); else toast(t("Couldn't add a note here. Try again."));
}
let inkNoteId = null;
function inkNote(id) { inkNoteId = id; openMenu("inkNote"); }
C.ink.onNote = (id) => inkNote(id);
C.ink.noteLabel = (x) => (x ? t("Note: {text}", { text: x }) : t("Note"));
// What a note holds, laid out like a highlight's sheet: colour, comment, tags.
function inkNoteSheet() {
  const id = inkNoteId;
  const box = el("div", { class: "mark-one" });
  let timer = 0, area = null;
  const keep = () => {
    clearTimeout(timer);
    if (!area) return;
    const n = C.ink.noteOf(id), v = area.value.slice(0, 4000);
    if (n && n.text !== v) C.ink.editNote(id, { text: v });
  };
  const draw = () => {
    const n = C.ink.noteOf(id);
    if (!n) { back(); return; }
    area = el("textarea", { class: "mark-note-field", rows: "4", placeholder: t("Write a comment"), "aria-label": t("Note"), maxlength: "4000", dir: "auto" });
    area.value = n.text;
    area.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(keep, 800); });
    area.addEventListener("blur", keep);
    const m = { tags: n.tags };
    fill(box,
      el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Note"))),
      el("div", { class: "mark-colors", role: "radiogroup", "aria-label": t("Colour") },
        ...MARK_COLORS.map((c) => el("button", { class: "mark-swatch", type: "button", role: "radio", "aria-checked": String(n.c === c),
          "aria-label": MARK_NAMES[c], title: MARK_NAMES[c], onclick: () => { keep(); store(MARK_COLOR_KEY, c); C.ink.editNote(id, { c }); draw(); } }, swatchDot(c)))),
      area,
      markTagsEditor(null, m, draw, (tags) => { keep(); C.ink.editNote(id, { tags }); }),
      el("div", { class: "group" },
        menuRow(t("Copy"), () => { keep(); const x = C.ink.noteOf(id); if (x) copyText(x.text, t("Copied")); }),
        menuRow(t("Delete note"), () => { clearTimeout(timer); area = null; back().then(() => C.ink.removeNote(id)); }, "warn"),
        menuRow(t("Done"), () => { keep(); const x = C.ink.noteOf(id); back().then(() => { if (x && !x.text.trim() && !x.tags.length) C.ink.removeNote(id); }); }, "accent")));
    if (!n.text) setTimeout(() => area && area.focus(), 80);
  };
  draw();
  return box;
}

// ---- Drawings in Highlights (2026-11) ----
// Drawing is part of highlights: the Highlights sheet and place list what
// was drawn, one row per paragraph (or picture) of a clip, or per page of a
// PDF, however many strokes are on it.
// From the entry (by block), from what ink.js holds of the open clip, or
// from the summary an outside file's entry keeps of its pages (`drawn`).
function inkGroups(p) {
  if (!p || p.note) return [];
  // Comment bubbles aren't drawings: they have rows of their own (inkNotes).
  const strokesOf = (list) => (list || []).filter((s) => s && s.t !== "n");
  if (state.open === p && inkReady()) {
    if (C.ink.blocks) return C.ink.drawn().map((d) => ({ n: d.page, page: false, strokes: strokesOf(C.ink.strokes(d.page)) }));
    return C.ink.drawn().map((d) => ({ n: d.page, page: true, strokes: strokesOf(C.ink.strokes(d.page)) }));
  }
  if (p.ink && typeof p.ink === "object") {
    return Object.keys(p.ink).map(Number).filter((n) => Array.isArray(p.ink[n]) && strokesOf(p.ink[n]).length).sort((a, b) => a - b)
      .map((n) => ({ n, page: false, strokes: strokesOf(p.ink[n]) }));
  }
  if (Array.isArray(p.drawn)) return p.drawn.filter((d) => Array.isArray(d) && d[0] >= 1).map(([n, k]) => ({ n, page: true, strokes: null, count: k }));
  return [];
}
const inkGroupCount = (g) => (g.strokes ? new Set(g.strokes.map((s) => s.id)).size : g.count || 0);
const inkTotal = (p) => inkGroups(p).reduce((a, g) => a + inkGroupCount(g), 0);
// A clip's comment bubbles (2026-11), listed among its highlights as what they
// say: [{ id, n, page, text, c, tags }], from the open clip, the entry's
// drawings by block, or the summary a file's entry keeps (`noted`).
function inkNotes(p) {
  if (!p) return [];
  const one = (x, n, page) => { const c = MARK_COLORS.includes(x.c) ? x.c : "yellow"; return { id: x.id, n: Number(n), page, text: String(x.text || ""), c, color: c, tags: Array.isArray(x.tags) ? x.tags : [] }; };
  if (state.open === p && inkReady()) return C.ink.notes().map((x) => one(x, x.n, !C.ink.blocks));
  const out = [];
  if (p.ink && typeof p.ink === "object") for (const [n, list] of Object.entries(p.ink)) for (const x of Array.isArray(list) ? list : []) if (x && x.t === "n") out.push(one(x, n, false));
  if (Array.isArray(p.noted)) for (const x of p.noted) if (x && x.id) out.push(one(x, x.n, true));
  return out.sort((a, b) => a.n - b.n);
}
// A bubble's row, laid out as a highlight's: the comment in its colour, its tags,
// and the pencil to its sheet.
function noteRow(p, nt, onGo, onEdit, title) {
  const words = nt.text.trim();
  return el("li", { class: "mark-item note-item" },
    el("button", { class: "row mark-row", type: "button", "aria-label": words ? (title ? t("Note: {text}, in {title}", { text: words.slice(0, 120), title }) : t("Note: {text}", { text: words.slice(0, 120) })) : t("Note"), onclick: onGo },
      el("span", { class: "mark-quote note-quote" + (words ? "" : " empty"), "data-c": nt.c, dir: "auto" }, inkIcon("note"), words || t("Note")),
      markTagsLine(nt)),
    onEdit ? el("button", { class: "icon-btn mark-edit", type: "button", "aria-label": t("Edit note"), title: t("Edit note"), onclick: onEdit }, svgIcon("rename", 18)) : null);
}
// To a bubble: there in the clip, with its sheet open.
async function inkNoteGo(p, nt) {
  await inkGoTo(p, nt);
  const t0 = Date.now();
  const open = () => {
    if (state.open !== p || Date.now() - t0 > 5000) return;
    if (!inkReady() || !C.ink.noteOf(nt.id)) { setTimeout(open, 150); return; }
    inkNote(nt.id);
  };
  setTimeout(open, 250);
}

// Where a row goes among the highlights: by block (highlights count blocks
// from 0) or by page.
const inkOrder = (g) => (g.page ? g.n : g.n - 1);
const inkWord = (n) => tn(n, "1 drawing", "{n} drawings");
const noteWord = (n) => tn(n, "1 note", "{n} notes");
function inkLabel(p, g) {
  if (g.page) return (p.note ? "Sheet " : "Page ") + g.n;
  const w = state.open === p ? C.reader.inkBlockWords(g.n) : null;
  return w && w.picture ? t("Picture") : t("Paragraph {n}", { n: g.n });
}
// A small picture of what's drawn there: the strokes alone, fitted.
function inkThumb(strokes) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "ink-thumb");
  svg.setAttribute("aria-hidden", "true");
  const list = (strokes || []).filter((s) => s.t === "p" || s.t === "h");
  const b = list.length ? C.ink.boxOf(list) : null;
  if (!b) { svg.setAttribute("viewBox", "0 0 4 3"); return svg; }
  const pad = Math.max(b[2], b[3]) * 0.12 + 0.01;
  svg.setAttribute("viewBox", [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2].map((v) => Math.round(v * 10000) / 10000).join(" "));
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  for (const s of list.slice(0, 200)) {
    const path = document.createElementNS(NS, "path");
    const rgb = "rgb(" + (C.ink.rgbOf(s) || [28, 27, 25]).join(",") + ")";
    if (s.t === "h") { path.setAttribute("d", C.ink.linePath(s.p)); path.setAttribute("fill", "none"); path.setAttribute("stroke", rgb); path.setAttribute("stroke-width", String(s.w)); path.setAttribute("opacity", "0.5"); path.setAttribute("stroke-linecap", "butt"); }
    else { path.setAttribute("d", C.ink.penPath(s.p, Math.max(s.w, (b[2] + b[3]) / 120), s.y)); path.setAttribute("fill", rgb); }
    svg.append(path);
  }
  return svg;
}
// To a drawing: in the reader, scroll to it; else open the clip there.
async function inkGoTo(p, g) {
  const go = () => {
    if (state.open !== p) return;
    if (g.page) C.reader.toPrinted(g.n);
    else C.reader.jump(0, (g.n - 1) + "/0", true);
  };
  if (state.open === p && !$("readerView").hidden) { go(); return; }
  await openPage(p.id);
  const t0 = Date.now();
  const wait = () => { if (state.open !== p || Date.now() - t0 > 4000) return; C.reader.placed().then(() => setTimeout(go, 120)); };
  wait();
}
// Drawings on one row taken away.
async function inkRemoveGroup(p, g) {
  if (state.open === p && inkReady()) { C.ink.clearPage(g.n); await C.ink.flush(); return; }
  if (p.ink && p.ink[g.n]) {
    const notes = p.ink[g.n].filter((s) => s && s.t === "n");
    if (notes.length) p.ink[g.n] = notes; else delete p.ink[g.n];
    if (!Object.keys(p.ink).length) delete p.ink;
    p.inkAt = Date.now();
    await C.store.writeIndex(state.pages);
    renderLibrary();
  }
}
function inkRow(p, g, onGo, onRemove) {
  const k = inkGroupCount(g);
  const words = !g.page && state.open === p ? C.reader.inkBlockWords(g.n) : null;
  return el("li", { class: "mark-item ink-item" },
    el("button", { class: "row mark-row ink-row", type: "button", "aria-label": inkLabel(p, g) + ", " + inkWord(k), onclick: onGo },
      g.strokes ? inkThumb(g.strokes) : el("span", { class: "ink-thumb ink-thumb-page", "aria-hidden": "true" }),
      el("span", { class: "ink-row-text" },
        el("span", { class: "row-label" }, inkLabel(p, g)),
        el("span", { class: "meta" }, inkWord(k)),
        words && words.text ? el("span", { class: "mark-note", dir: "auto" }, "“" + words.text.slice(0, 90) + (words.text.length > 90 ? "…" : "") + "”") : null)),
    onRemove ? el("button", { class: "icon-btn mark-edit", type: "button", "aria-label": t("Remove these drawings"), title: t("Remove these drawings"), onclick: onRemove },
      svgIcon("remove", 18)) : null);
}
// Out of an open sheet or menu (app-library.js back), for where `back` means another thing.
const inkBack = () => back();
