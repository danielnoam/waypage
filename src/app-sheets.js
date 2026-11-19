// Waypage's shell (2026-11): Page view of a note. Every sheet of the open
// note drawn small in one column, with the place you are (3/5) at the top.
// Tap one to go there; hold one to select, then tap more. Selected pages
// can be copied, pasted below, deleted, shared, saved (PDF or picture) or
// given another paper. The data work is notes.js arrange and ink.js arrange
// (strokes are kept by sheet number, so the two always change together);
// the open reader's slots are made again by files.js resheet.
const PV_PAPERS = [["blank", t("Blank note")], ["lines", t("Lines note")], ["squares", t("Squares note")]];
const PV_ICONS = {
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/>',
  paste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/>',
  trash: '<path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  save: '<path d="M12 4v11M8 11l4 4 4-4M5 19h14"/>',
  paper: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
};
const pvIcon = (name, size) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ width: size || 22, height: size || 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" })) s.setAttribute(k, v);
  s.innerHTML = PV_ICONS[name];
  return s;
};
// Copied pages, kept until the app closes: { from: the note's id, list: [...] }.
let pvBoard = null;
const pvToUrl = (bytes, type) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(new Blob([bytes], { type })); });

// A file for the person: saved where they choose in the app, a download on the web.
async function pvSave(blob, name, mime, share) {
  if (!C.platform.canSaveFiles) {
    if (share && navigator.canShare) {
      const f = new File([blob], name, { type: mime });
      if (navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title: name }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    }
    C.platform.download(name, blob);
    return;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const cache = await C.store.cacheFile(name);
  for (let i = 0; i < bytes.length; i += 1 << 20) await cache.append(bytes.subarray(i, i + (1 << 20)));
  const uri = await cache.uri();
  if (share) { await C.platform.shareFile(uri, name); return; }
  const saved = await C.platform.saveFile(uri, name, mime);
  if (saved === null) await C.platform.shareFile(uri, name);
  else if (saved) toast(t("Saved {name}", { name }));
}

function pageViewSheet() {
  const p = state.open;
  const held = () => C.files.noteHeld();
  const sel = new Set();
  let thumbs = new Map(), seen = null, mode = "", menuOpen = false, busy = false;
  const box = el("div", { class: "pageview" });
  const head = el("div", { class: "pv-head" });
  const list = el("ol", { class: "pv-list" });
  const bar = el("div", { class: "pv-bar" });
  const count = () => (held() ? held().handle.count : 0);
  let at = Math.min(Math.max(1, C.reader.printedNow()), Math.max(1, count()));

  const sizeOf = (n) => (held().handle.sizes[n - 1] || [C.notes.W, C.notes.H]);
  const closeView = () => history.back();
  const goTo = async (n) => { await back(); C.reader.toPrinted(n); };

  // ---- Drawing ----
  function paintHead() {
    const picking = sel.size > 0;
    fill(head,
      picking
        ? el("button", { class: "icon-btn pv-x", type: "button", "aria-label": t("Done"), title: t("Done"), onclick: () => { sel.clear(); mode = ""; paint(); } }, pvIcon("close"))
        : el("button", { class: "icon-btn pv-x", type: "button", "aria-label": t("Close"), title: t("Close"), onclick: closeView }, pvIcon("back")),
      el("h2", { class: "pv-count", "aria-live": "polite" },
        ...(picking ? [t("{n} selected", { n: sel.size })] : [el("strong", {}, String(at)), el("span", { class: "pv-of" }, "/" + count())])),
      el("button", { class: "icon-btn pv-more", type: "button", "aria-label": t("More"), "aria-expanded": String(menuOpen), title: t("More"), onclick: () => { menuOpen = !menuOpen; paint(); } }, pvIcon("more")));
    if (menuOpen) {
      head.append(el("div", { class: "pv-menu group", role: "menu" },
        menuRow(t("Select all"), () => { menuOpen = false; for (let n = 1; n <= count(); n++) sel.add(n); paint(); }),
        pvBoard && pvBoard.list.length ? menuRow(t("Paste at the end"), () => { menuOpen = false; paint(); pvPaste(count()); }) : null));
    }
  }
  function paintBar() {
    bar.hidden = sel.size === 0;
    if (!sel.size) { fill(bar); return; }
    if (mode === "save") {
      fill(bar, el("p", { class: "pv-ask" }, t("Save as")),
        el("div", { class: "pv-choices" },
          el("button", { class: "pv-choice", type: "button", onclick: () => { mode = ""; paintBar(); pvExport("pdf", false); } }, "PDF"),
          el("button", { class: "pv-choice", type: "button", onclick: () => { mode = ""; paintBar(); pvExport("png", false); } }, t("Image")),
          el("button", { class: "pv-choice quiet", type: "button", onclick: () => { mode = ""; paintBar(); } }, t("Cancel"))));
      return;
    }
    if (mode === "paper") {
      const pdf = [...sel].some((n) => held().handle.sheets[n - 1].bg === "pdf");
      fill(bar, el("p", { class: "pv-ask" }, t("Background")),
        pdf ? el("p", { class: "meta" }, t("The PDF page under it goes; your drawings stay.")) : null,
        el("div", { class: "pv-choices" },
          ...PV_PAPERS.map(([k, label]) => el("button", { class: "pv-choice", type: "button", onclick: () => { mode = ""; paintBar(); pvPaper(k); } }, label)),
          el("button", { class: "pv-choice quiet", type: "button", onclick: () => { mode = ""; paintBar(); } }, t("Cancel"))));
      return;
    }
    const tool = (icon, label, fn, off) => {
      const b = el("button", { class: "tile-btn pv-tool", type: "button", onclick: fn }, el("span", { class: "tile-icon", "aria-hidden": "true" }, pvIcon(icon)), label);
      if (off) b.disabled = true;
      return b;
    };
    fill(bar, el("div", { class: "tile-row pv-tools" },
      tool("copy", t("Copy"), pvCopy),
      tool("paste", t("Paste"), () => pvPaste(Math.max(...sel)), !(pvBoard && pvBoard.list.length)),
      tool("trash", t("Delete"), pvDelete),
      tool("share", t("Share"), () => pvExport("pdf", true)),
      tool("save", t("Save as"), () => { mode = "save"; paintBar(); }),
      tool("paper", t("Background"), () => { mode = "paper"; paintBar(); })));
  }
  function paintList() {
    if (seen) seen.disconnect();
    seen = new IntersectionObserver((hits) => {
      for (const x of hits) {
        if (!x.isIntersecting) continue;
        seen.unobserve(x.target);
        pvThumb(Number(x.target.dataset.n)).then((url) => { if (url && x.target.isConnected) { x.target.src = url; x.target.classList.add("in"); } });
      }
    }, { root: box, rootMargin: "400px 0px" });
    fill(list, ...Array.from({ length: count() }, (_, i) => {
      const n = i + 1, [w, h] = sizeOf(n);
      const img = el("img", { class: "pv-thumb", alt: "", "data-n": n, style: "aspect-ratio:" + w + "/" + h });
      seen.observe(img);
      const b = el("button", { class: "pv-sheet", type: "button", "data-n": n, "aria-label": t("Page {n}", { n }), "aria-pressed": String(sel.has(n)), "aria-current": n === at ? "true" : null },
        el("span", { class: "pv-page" }, img, el("span", { class: "pv-tick", "aria-hidden": "true" })), el("span", { class: "pv-num" }, String(n)));
      return el("li", { class: "pv-item" + (sel.has(n) ? " on" : "") }, b);
    }));
  }
  const paint = () => { paintHead(); paintBar(); paintMarks(); };
  function paintMarks() {
    for (const li of list.children) {
      const n = Number(li.firstChild.dataset.n), on = sel.has(n);
      li.classList.toggle("on", on);
      li.firstChild.setAttribute("aria-pressed", String(on));
    }
  }
  function pvThumb(n) {
    if (!thumbs.has(n)) {
      const dpr = Math.min(2, devicePixelRatio || 1);
      thumbs.set(n, (async () => {
        try {
          const bytes = await C.notes.sheetPicture(held().handle, n, Math.round(Math.min(box.clientWidth || 360, 480) * dpr), C.ink.strokes(n));
          return URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        } catch (e) { thumbs.delete(n); return null; }
      })());
    }
    return thumbs.get(n);
  }
  function redraw(keepAt) {
    for (const u of thumbs.values()) u.then((x) => x && URL.revokeObjectURL(x));
    thumbs = new Map();
    if (keepAt) at = Math.min(at, Math.max(1, count()));
    paintList();
    paint();
  }

  // ---- Choosing ----
  let hold = null, held_ = false;
  const sheetOf = (e) => e.target.closest && e.target.closest(".pv-sheet");
  list.addEventListener("pointerdown", (e) => {
    const b = sheetOf(e);
    held_ = false;
    if (!b || e.button) return;
    const start = { x: e.clientX, y: e.clientY };
    clearTimeout(hold);
    hold = setTimeout(() => {
      held_ = true;
      if (navigator.vibrate) navigator.vibrate(10);
      sel.add(Number(b.dataset.n));
      paint();
    }, 480);
    const move = (m) => { if (Math.hypot(m.clientX - start.x, m.clientY - start.y) > 10) { clearTimeout(hold); off(); } };
    const off = () => { clearTimeout(hold); list.removeEventListener("pointermove", move); };
    list.addEventListener("pointermove", move);
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) list.addEventListener(ev, off, { once: true });
  });
  list.addEventListener("contextmenu", (e) => {
    const b = sheetOf(e);
    if (!b) return;
    e.preventDefault();
    clearTimeout(hold);
    if (!held_) { held_ = true; sel.add(Number(b.dataset.n)); paint(); }
  });
  list.addEventListener("click", (e) => {
    const b = sheetOf(e);
    if (!b) return;
    if (held_) { held_ = false; e.preventDefault(); return; }
    const n = Number(b.dataset.n);
    if (!sel.size) { goTo(n); return; }
    if (sel.has(n)) sel.delete(n); else sel.add(n);
    paint();
  });
  box.addEventListener("scroll", () => {
    const top = box.getBoundingClientRect().top + head.offsetHeight + 24;
    for (const li of list.children) {
      if (li.getBoundingClientRect().bottom > top) { const n = Number(li.firstChild.dataset.n); if (n !== at) { at = n; if (!sel.size) paintHead(); } break; }
    }
  }, { passive: true });

  // ---- Changing the note ----
  // Both files change together, then the open reader's slots are made again.
  async function change(work, keepAt) {
    if (busy) return false;
    busy = true;
    try {
      await C.ink.flush();
      const out = await work();
      await C.ink.flush();
      C.files.resheet();
      if (typeof fitRail === "function") fitRail();
      redraw(keepAt !== false);
      return out;
    } catch (e) {
      console.error(e);
      toast(t("Couldn't do that. Try again."));
      redraw(true);
      return false;
    } finally { busy = false; }
  }
  const all = () => Array.from({ length: count() }, (_, i) => i + 1);

  async function pvCopy() {
    const h = held();
    const ns = [...sel].sort((a, b) => a - b);
    try {
      const out = [];
      for (const n of ns) {
        const s = h.handle.sheets[n - 1], one = C.ink.sheetCopy(n);
        const e = { sheet: { ...s }, strokes: one.strokes, images: one.images };
        // Into another note a PDF's page can only go as a picture of it.
        if (s.bg === "pdf") {
          const [w, hh] = sizeOf(n), url = await pvToUrl(await h.handle.draw(n, 1240), "image/jpeg");
          const strokes = [{ id: "bg-" + C.save.newId(), t: "i", f: "pic", x: 0, y: 0, w: 1, h: Math.round(hh / w * 1e5) / 1e5 }, ...one.strokes.filter((x) => !C.ink.isBack(x))];
          e.flat = { strokes, images: { ...one.images, pic: url } };
        }
        out.push(e);
      }
      pvBoard = { from: p.id, list: out };
      toast(tn(ns.length, "Copied 1 page", "Copied {n} pages"));
      paintBar();
    } catch (e) { console.error(e); toast(t("Couldn't do that. Try again.")); }
  }
  // After page `n` (the end when it is the last).
  async function pvPaste(n) {
    if (!pvBoard || !pvBoard.list.length) return;
    const h = held(), items = pvBoard.list, same = pvBoard.from === p.id;
    if (count() + items.length > C.notes.MAX_SHEETS) { toast(t("A note holds {n} pages at most.", { n: C.notes.MAX_SHEETS })); return; }
    const order = [...all().slice(0, n).map((i) => ({ from: i })),
      ...items.map((x) => (x.flat && !same ? { sheet: { bg: "paper" }, strokes: x.flat.strokes, images: x.flat.images } : { sheet: x.sheet, strokes: x.strokes, images: x.images })),
      ...all().slice(n).map((i) => ({ from: i }))];
    const ok = await change(async () => { C.ink.arrange(order); await C.notes.arrange(p.id, h.data, order); return true; });
    if (ok) {
      sel.clear();
      for (let i = 0; i < items.length; i++) sel.add(n + 1 + i);
      paint();
      toast(tn(items.length, "Pasted 1 page", "Pasted {n} pages"));
    }
  }
  async function pvDelete() {
    const h = held(), gone = [...sel].sort((a, b) => a - b);
    const sheets = h.data.sheets.map((s) => ({ ...s }));
    const order = all().filter((n) => !sel.has(n)).map((n) => ({ from: n }));
    let token = null;
    const ok = await change(async () => { token = C.ink.arrange(order); await C.notes.arrange(p.id, h.data, order); return true; });
    if (!ok) return;
    sel.clear();
    paint();
    toast(tn(gone.length, "Deleted 1 page", "Deleted {n} pages"), t("Undo"), async () => {
      if (state.open !== p || !held()) return;
      await change(async () => { C.ink.unarrange(token); h.data.sheets.splice(0, h.data.sheets.length, ...sheets); await C.notes.keep(p.id, h.data); return true; });
    });
  }
  async function pvPaper(kind) {
    const h = held(), ns = [...sel];
    const own = (p.note && p.note.paper) || "blank";
    await change(async () => {
      const pic = kind === own ? null : await pvToUrl(await C.notes.paper(kind, 1000), "image/jpeg");
      const order = all().map((n) => (sel.has(n) && h.handle.sheets[n - 1].bg === "pdf" ? { from: n, sheet: { bg: "paper" } } : { from: n }));
      for (const n of ns) C.ink.setBack(n, kind === own ? "" : kind, pic, C.notes.H / C.notes.W);
      C.ink.backsDone();
      await C.notes.arrange(p.id, h.data, order);
      return true;
    });
  }
  async function pvExport(type, share) {
    const h = held(), ns = [...sel].sort((a, b) => a - b);
    toast(type === "pdf" ? t("Making the PDF…") : t("Making the pictures…"));
    try {
      await C.ink.flush();
      const base = (p.title || "Note").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 100);
      if (type === "pdf") {
        const { blob, name } = await C.notes.toPdf(p, C.files.heldPdf(), C.ink.strokes, null, null, ns);
        await pvSave(blob, name, "application/pdf", share);
      } else {
        for (const n of ns) {
          const bytes = await C.notes.sheetPicture(h.handle, n, 1240, C.ink.strokes(n), null, "image/png");
          await pvSave(new Blob([bytes], { type: "image/png" }), base + " " + n + ".png", "image/png", false);
        }
      }
    } catch (e) {
      console.error(e);
      toast(type === "pdf" ? t("Couldn't make the PDF. Try again.") : t("Couldn't make the pictures. Try again."));
    }
  }

  fill(box, head, list, bar);
  box.setAttribute("tabindex", "-1");
  paintList();
  paint();
  // The page you were on is brought into view.
  requestAnimationFrame(() => { const li = list.children[at - 1]; if (li && at > 1) li.scrollIntoView({ block: "start" }); });
  return box;
}
SHEETS.pageview = { label: t("Page view"), build: pageViewSheet };
const openPageView = () => openSheet("pageview");
