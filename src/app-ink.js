// Waypage's shell (1.57.0): drawing on a PDF with a pen. The pen button
// in the reader bar, the bar of tools along the foot of the pages while
// Draw is on, the Drawings sheet in ⋯ and the copy of the PDF with the
// drawings in it. The strokes themselves are ink.js; this is what the
// person touches. Only a PDF shown as its own pages can be drawn on.
const INK_KEY = "waypage.ink";
const INK_OFFER_KEY = "waypage.inkOffered";
const INK_COLORS = {
  pen: [["ink", "Black"], ["red", "Red"], ["blue", "Blue"], ["green", "Green"]],
  highlighter: [["yellow", "Yellow"], ["green", "Green"], ["blue", "Blue"], ["pink", "Pink"], ["purple", "Purple"]],
};
const INK_ICONS = {
  pen: '<path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path>',
  highlighter: '<path d="M14.5 4.5l5 5L11 18H6v-5z"></path><path d="M4 21h16"></path>',
  eraser: '<path d="M7 21h10"></path><path d="M5.5 13.5l7-7a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L11.5 19H8l-2.5-2.5a2 2 0 0 1 0-3z"></path>',
  undo: '<path d="M9 14L4 9l5-5"></path><path d="M4 9h10a6 6 0 0 1 0 12h-3"></path>',
  redo: '<path d="M15 14l5-5-5-5"></path><path d="M20 9H10a6 6 0 0 0 0 12h3"></path>',
  finger: '<path d="M18 11V6a2 2 0 0 0-4 0v1"></path><path d="M14 10V4a2 2 0 0 0-4 0v6"></path><path d="M10 10.5V6a2 2 0 0 0-4 0v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.4 16a2 2 0 0 1 3.2-2.4L8 15"></path>',
};
const inkIcon = (name) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  s.innerHTML = INK_ICONS[name];
  return s;
};

let inkBar = null, inkClipId = null;

// What the Pen plugin is asked to do: look at the pen (while a PDF's pages
// are open), tell everything (the pen test), take One UI's button-and-drag
// from the page (while Draw is on).
const penNative = { on: false, raw: false, grab: false };
function penNativeSet(patch) {
  Object.assign(penNative, patch);
  C.platform.pen.watch(penNative.on, penNative.on && penNative.raw, penNative.on && penNative.grab);
}

// The pen button follows the clip: shown on a PDF's printed pages, which
// is where the drawings can go. Called once the reader has the clip up.
async function inkSync(p) {
  const ok = !!p && !p.preview && C.files.drawable(p);
  $("readerInk").hidden = !ok;
  if (!ok) { inkClose(); return; }
  if (inkClipId === p.id) return;
  inkClose();
  inkClipId = p.id;
  // The pen's buttons are read natively while a PDF's pages are open.
  penNativeSet({ on: true });
  const { stale } = await C.ink.load(p);
  if (state.open !== p) return;
  if (stale) toast("This PDF has changed since you drew on it. The drawings may not line up.");
}
function inkClose() {
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
  // A computer draws with the mouse; a touch screen with the pen alone,
  // so a hand resting on the page leaves no mark.
  return { tool: ["pen", "highlighter", "eraser"].includes(saved.tool) ? saved.tool : "pen", colors: saved.colors || {}, size: [0, 1, 2].includes(saved.size) ? saved.size : 1,
    finger: typeof saved.finger === "boolean" ? saved.finger : !matchMedia("(pointer: coarse)").matches };
}
function inkKeep() {
  const s = C.ink.state();
  store(INK_KEY, { tool: s.tool, colors: s.colors, size: s.size, finger: s.finger });
}

function inkSet(on) {
  on = !!on && !$("readerInk").hidden;
  if (on === C.ink.on && (!!inkBar && !inkBar.hidden) === on) { $("readerInk").setAttribute("aria-pressed", String(on)); return; }
  if (on) C.ink.setting(inkPrefs());
  C.ink.setOn(on);
  penNativeSet({ grab: on });
  $("readerInk").setAttribute("aria-pressed", String(on));
  $("readerInk").setAttribute("aria-label", on ? "Stop drawing" : "Draw");
  if (on) {
    if (!inkBar) inkBuild();
    inkPaint();
    inkBar.hidden = false;
    M.appear(inkBar);
    hideReadHere();
  } else if (inkBar && !inkBar.hidden) {
    const bar = inkBar;
    M.vanish(bar).finally(() => { if (!C.ink.on) bar.hidden = true; });
  }
}

function inkBuild() {
  const btn = (label, icon, act, extra) => {
    const b = el("button", { type: "button", "aria-label": label, title: label, "data-act": act, ...(extra || {}) });
    if (icon) b.append(inkIcon(icon));
    return b;
  };
  inkBar = el("div", { class: "ink-bar", role: "toolbar", "aria-label": "Draw", hidden: true },
    el("div", { class: "ink-row ink-tools" },
      btn("Pen", "pen", "tool:pen"), btn("Highlighter", "highlighter", "tool:highlighter"), btn("Eraser", "eraser", "tool:eraser"),
      el("span", { class: "ink-gap" }),
      btn("Undo", "undo", "undo"), btn("Redo", "redo", "redo"),
      el("button", { type: "button", class: "ink-done", "data-act": "done" }, "Done")),
    el("div", { class: "ink-row ink-style" }),
    // The pen test's page steps (app-pentest.js).
    el("div", { class: "ink-row ink-test", hidden: true },
      el("span", { class: "ink-test-text" }),
      el("button", { type: "button", class: "ink-done", "data-act": "testdone" }, "Next step"),
      el("button", { type: "button", class: "ink-done", "data-act": "testskip" }, "Skip")));
  inkBar.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]");
    if (!b || b.disabled) return;
    const [act, arg] = b.dataset.act.split(":");
    if (act === "tool") C.ink.setting({ tool: arg });
    else if (act === "color") C.ink.setting({ color: arg });
    else if (act === "size") C.ink.setting({ size: (C.ink.state().size + 1) % 3 });
    else if (act === "finger") C.ink.setting({ finger: !C.ink.state().finger });
    else if (act === "undo") inkGo(C.ink.undo());
    else if (act === "redo") inkGo(C.ink.redo());
    else if (act === "testdone") { penTestNext(false); return; }
    else if (act === "testskip") { penTestNext(true); return; }
    else if (act === "done") { inkSet(false); return; }
    inkKeep();
  });
  $("readerView").append(inkBar);
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
  const row = inkBar.querySelector(".ink-style");
  const hl = s.tool === "highlighter";
  const swatches = s.tool === "eraser" ? [] : INK_COLORS[hl ? "highlighter" : "pen"].map(([c, name]) =>
    el("button", { type: "button", "aria-label": name, title: name, "aria-pressed": String(s.color === c), "data-act": "color:" + c },
      el("span", { class: "ink-dot", "data-c": c, "data-t": hl ? "h" : "p" })));
  const dia = [4, 8, 13][s.size];
  fill(row, ...swatches,
    s.tool === "eraser" ? null : el("button", { type: "button", "aria-label": "Size: " + ["fine", "medium", "bold"][s.size], title: "Size", "data-act": "size" },
      el("span", { class: "ink-size", style: "width:" + dia + "px;height:" + dia + "px" })),
    el("button", { type: "button", "aria-label": "Draw with a finger", title: "Draw with a finger or mouse", "aria-pressed": String(s.finger), "data-act": "finger" }, inkIcon("finger")));
}
C.ink.onChange = () => {
  inkPaint();
  if (state.sheet === "ink") $("readingBody").replaceChildren(SHEETS.ink.build());
};
// The first time a pen touches a PDF's pages, Draw is offered, once.
C.ink.onPen = () => {
  if (C.ink.on || $("readerInk").hidden || state.sheet || load(INK_OFFER_KEY, false)) return;
  store(INK_OFFER_KEY, true);
  toast("Draw on this PDF with your pen?", "Draw", () => inkSet(true));
};
$("readerInk").addEventListener("click", () => inkSet(!C.ink.on));
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

function inkSheet(p) {
  const box = el("div", { class: "ink-sheet" });
  const go = (n) => { history.back(); setTimeout(() => C.reader.toPrinted(n), 0); };
  const total = C.ink.count(), list = C.ink.drawn();
  const word = (n, one, many) => n + " " + (n === 1 ? one : many);
  fill(box,
    el("p", { class: "meta" }, total
      ? word(total, "stroke", "strokes") + " on " + word(list.length, "page", "pages") + ". They stay on this device. Save a copy to keep them with the PDF."
      : "Nothing drawn yet. Tap the pen in the reader bar and draw."),
    list.length ? el("div", { class: "group" }, ...list.map((d) =>
      el("button", { class: "row", type: "button", onclick: () => go(d.page) },
        el("span", { class: "row-label" }, "Page " + d.page), el("span", { class: "row-value" }, String(d.strokes))))) : null,
    total ? el("div", { class: "group" },
      menuRow("Save a copy with drawings", () => inkCopy(p)),
      menuRow("Remove all drawings", () => { if (confirm("Remove all drawings from “" + p.title + "”? This can't be undone.")) C.ink.clearAll(); }, "warn")) : null,
    inkProbe());
  return box;
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
    out.textContent = "Page: " + (web ? web.pointerType + " " + web.type + " · button " + web.button + " · buttons " + web.buttons + " · pressure " + web.pressure + (touch ? " · touch " + touch : "") : "nothing yet") + "\n" +
      "Phone: " + (C.platform.pen.available ? "near " + yes(n.near) + " · down " + yes(n.down) + " · button " + yes(n.button) + " · eraser " + yes(n.eraser) + " · tool " + n.tool + " · buttons " + n.buttons : "no pen reading here");
  };
  const pad = el("div", { class: "ink-probe-pad" }, "Touch here with the pen, with a button held too");
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel", "pointerenter"]) {
    pad.addEventListener(t, (e) => { web = { type: e.type, pointerType: e.pointerType, button: e.button, buttons: e.buttons, pressure: Math.round(e.pressure * 100) / 100 }; paint(); });
  }
  pad.addEventListener("touchstart", (e) => { touch = (e.changedTouches[0] && e.changedTouches[0].touchType) || ""; paint(); }, { passive: true });
  pad.addEventListener("contextmenu", (e) => e.preventDefault());
  penTestPad(pad);
  C.ink.onProbe = paint;
  paint();
  return el("div", { class: "ink-probe" }, el("h3", { class: "overline" }, "Try your pen"), pad, out, penTestView());
}

// The PDF with the drawings in it as ink annotations, saved where the
// person picks. The file Waypage reads from is never changed.
async function inkCopy(p) {
  const pdf = C.files.heldPdf();
  if (!pdf || !pdf.ink) { toast("Open the PDF's pages first."); return; }
  toast("Making the copy…");
  try {
    await C.ink.flush();
    const bytes = await pdf.ink(C.ink.forPdf());
    const name = ((p.file && p.file.name) || p.title || "Drawing").replace(/\.pdf$/i, "") + " (drawn).pdf";
    if (!C.platform.canSaveFiles) { C.platform.download(name, new Blob([bytes], { type: "application/pdf" })); return; }
    const cache = await C.store.cacheFile(name);
    for (let i = 0; i < bytes.length; i += 1 << 20) await cache.append(bytes.subarray(i, i + (1 << 20)));
    const uri = await cache.uri();
    const saved = await C.platform.saveFile(uri, name, "application/pdf");
    if (saved === null) await C.platform.shareFile(uri, name);
    else if (saved) toast("Saved " + name);
  } catch (e) {
    console.error(e);
    toast("Couldn't make the copy. Try again.");
  }
}
