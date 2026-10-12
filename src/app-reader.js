// Waypage's shell, part 2 of 7 (1.14.0): moving between screens, the
// reader around the page (brightness, contents, Read aloud, highlights,
// its sheets) and the image viewer. See app.js for how the parts share.
// ---- Screens ----
// The reader and Settings are pushed over the library, which stays laid
// out underneath (inert, not hidden) so its scroll position survives. Each
// push is a history entry, so Android's back gesture pops it.

// The reader can open over a folder's screen; everything else is over the library.
const below = (screen) => ((screen.id === "readerView" || screen.id === "batchView") && state.folder ? $("folderView")
  : screen.id === "sectionView" ? $("settingsView")
  : screen.id === "newsView" && state.section ? $("sectionView")
  : screen.id === "newsView" && state.settings ? $("settingsView") : $("libraryView"));

// Big screens (1.5.0). From 700 px wide (a tablet) the save field moves
// up beside the menu button, Settings' menu stays beside the section it
// opened, and sheets open as dialogs and panels. From 1024 px (a laptop,
// a tablet held sideways) the sidebar stays open beside the library.
const mq = (q) => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });
const wide = mq("(min-width: 700px)");
const pinned = mq("(min-width: 1024px)");
// The sidebar is drawn when it's open over the page or pinned beside it.
const sideShown = () => state.side || pinned.matches;

// Each push counts, so a pop's animation ending after the same screen
// was pushed again (back, then a quick tap on it) doesn't hide it and
// leave the screen underneath inert, taking no taps.
const pushes = new WeakMap();

// The panel just tapped (a card, a collection, Continue reading, a
// collection's Continue button), so the screen it opens grows out of
// it. Opening a page reads its file first, hence the second's grace.
let tapped = null;
const zoomed = new WeakMap();
document.addEventListener("click", (e) => {
  const t = e.target.closest && e.target.closest(".card-open, .folder-go, .post-open");
  const panel = t && (t.classList.contains("folder-go") ? t : t.closest(".card, .tile, .post"));
  tapped = panel ? { rect: panel.getBoundingClientRect(), radius: parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0, at: Date.now(), panel, key: panelKey(panel) } : null;
}, true);
// The same panel after the library is drawn again (1.11.1), so Back
// shrinks into where it is now and as it looks now.
function panelKey(n) {
  const q = (a, v) => "[" + a + '="' + CSS.escape(v) + '"]';
  const sec = n.closest("#library > [data-key]");
  const pre = sec && sec !== n ? q("data-key", sec.dataset.key) + " " : "";
  if (n.dataset.ids) return pre + "." + n.classList[0] + q("data-ids", n.dataset.ids);
  if (n.dataset.name) return ".tile" + q("data-name", n.dataset.name);
  if (n.dataset.key) return q("data-key", n.dataset.key);
  if (n.classList.contains("folder-go")) return ".folder-go";
  return n.id ? "#" + CSS.escape(n.id) : "";
}
function panelNow(from, under) {
  let n = from.panel;
  if ((!n || !n.isConnected) && from.key && under) n = under.querySelector(from.key);
  if (!n || !n.isConnected || !n.offsetParent) return null;
  const r = n.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight && r.width ? { rect: r, panel: n } : null;
}
function zoomFrom(screen) {
  const t = tapped;
  tapped = null;
  if (!t || Date.now() - t.at > 1500 || (screen.id !== "readerView" && screen.id !== "folderView")) return null;
  return t;
}

// On a big screen (1.5.0) Save with options opens as a dialog and
// Downloads as a panel under its button, each over a catch that closes
// it; a post opened from Feeds at 1280 px reads in a pane beside them.
const DIALOGS = { batchView: "dialog", downloadsView: "panel" };
const asDialog = (screen) => (wide.matches && DIALOGS[screen.id]) || "";
// The button a dialog or panel grows out of (1.11.0).
const ANCHORS = { batchView: "severalBtn", downloadsView: "downloadsBtn" };
const anchorOf = (screen) => { const b = ANCHORS[screen.id] && $(ANCHORS[screen.id]); return b && b.offsetParent ? b : null; };
const asPane = (screen) => screen.id === "readerView" && pinned.matches && innerWidth >= 1280 && state.place !== "library" && !state.folder;

function pushScreen(screen) {
  pushes.set(screen, (pushes.get(screen) || 0) + 1);
  if (screen.id === "sectionView" && wide.matches) {
    screen.dataset.beside = "1";
    screen.hidden = false;
    return M.push(screen);
  }
  delete screen.dataset.beside;
  const dialog = asDialog(screen);
  if (dialog || asPane(screen)) {
    const again = !screen.hidden && !screen.dataset.leaving;
    delete screen.dataset.leaving;
    if (dialog) {
      screen.dataset.dialog = dialog;
      const c = $("screenCatch");
      c.classList.toggle("clear", dialog === "panel");
      c.hidden = false;
      M.dim(c, true);
      const n = pushes.get(screen);
      afterSettle(() => { if (pushes.get(screen) === n && !screen.hidden && !screen.dataset.leaving) below(screen).inert = true; });
    } else screen.dataset.pane = "1";
    screen.hidden = false;
    showAloudBar();
    if (again) return Promise.resolve();
    const from = dialog && anchorOf(screen);
    return dialog ? M.popFrom(screen, from && from.getBoundingClientRect()) : M.push(screen);
  }
  delete screen.dataset.dialog;
  delete screen.dataset.pane;
  delete screen.dataset.leaving;
  const under = below(screen);
  screen.hidden = false;
  showAloudBar();
  const from = zoomFrom(screen);
  if (from) zoomed.set(screen, from); else zoomed.delete(screen);
  const moved = from ? M.grow(screen, from.rect, from.radius, from.panel) : M.push(screen, under);
  // The screen underneath goes inert once this one covers it: in a big
  // library that restyles every card, which held the push's first frame
  // back by a tenth of a second on a phone (0.30.4).
  const n = pushes.get(screen);
  moved.then(() => { if (pushes.get(screen) === n && !screen.hidden && !screen.dataset.leaving) under.inert = true; });
  return moved;
}
// Heavy work after an animation's first frame, so it starts at once.
const afterStart = (fn) => requestAnimationFrame(() => setTimeout(fn, 0));
// Making the library inert, or live again, restyles every card: a long
// frame that stalled the sidebar and sheets just after they set off
// (0.30.8). It waits until the spring has all but landed.
const afterSettle = (fn) => setTimeout(fn, M.reduced() ? 130 : 300);

function popScreen(screen) {
  const n = pushes.get(screen);
  const hide = () => { if (pushes.get(screen) === n) screen.hidden = true; };
  if (screen.dataset.beside) return M.pop(screen).then(hide);
  if (screen.dataset.dialog || screen.dataset.pane) {
    screen.dataset.leaving = "1";
    if (screen.dataset.dialog) {
      const c = $("screenCatch"), under = below(screen);
      M.dim(c, false).then(() => { if (screen.dataset.leaving) c.hidden = true; });
      afterSettle(() => { if (pushes.get(screen) === n) under.inert = false; });
    }
    const to = screen.dataset.dialog && anchorOf(screen);
    return (screen.dataset.dialog ? M.popInto(screen, to && to.getBoundingClientRect()) : M.pop(screen)).then(hide).then(() => showAloudBar());
  }
  const under = below(screen);
  screen.dataset.leaving = "1";
  const from = zoomed.get(screen);
  zoomed.delete(screen);
  // Back shrinks it into the panel it grew from, where that panel is now,
  // hidden in the same frame it lands so the panel shows at once.
  const to = from && panelNow(from, under);
  const moved = to ? M.shrink(screen, to.rect, from.radius, to.panel, hide) : M.pop(screen, under);
  afterSettle(() => { if (pushes.get(screen) === n) under.inert = false; });
  return moved.then(hide).then(() => showAloudBar());
}

function showOffline() {
  $("offlinePill").hidden = navigator.onLine;
}

let opening = null;
// A book or a PDF (1.16.0) opens the reader at once, a spinner where the
// text goes, and shows the text once it's laid out and in place: a big
// EPUB showed nothing for seconds, then half-styled text.
let waiting = null;
function readerWait(p, fromHistory) {
  waiting = p.id;
  const swap = state.open && $("readerView").dataset.pane && !$("readerView").dataset.leaving;
  if (state.open) { closeSheet(true); hideReadHere(); brightClose(); closeFind(true); state.open = null; }
  C.reader.close();
  C.files.closeHeld();
  $("readerView").classList.add("waiting");
  $("readerView").classList.remove("bar-away");
  $("bright").hidden = true;
  $("readerContents").hidden = true;
  fill($("readerName"), p.site ? el("span", { class: "reader-site" }, p.site) : null, el("span", { class: "reader-title" }, p.title));
  if (!fromHistory) swap ? history.replaceState(readerState(p), "") : history.pushState(readerState(p), "");
  pushScreen($("readerView"));
}
function stopWaiting() {
  waiting = null;
  $("readerView").classList.remove("waiting");
}
async function openPage(id, fromHistory) {
  const p = state.pages.find((x) => x.id === id);
  if (!p || (!fromHistory && opening === id)) return;
  let html, trouble = null;
  opening = id;
  const wait = !!p.file;
  if (wait) readerWait(p, fromHistory);
  try {
    html = p.link ? await openLinked(p) : await C.store.readPage(id);
  } catch (e) {
    html = null;
    trouble = e instanceof C.files.FileError ? e.message : null;
  } finally { opening = null; }
  // Gone back, or on to another clip, while it was coming.
  if (wait && waiting !== id) return;
  if (!html) {
    toast(trouble || "This clip's file is missing. Delete it and save it again.");
    if (wait) { stopWaiting(); popScreen($("readerView")); if (history.state && history.state.view === "reader") history.back(); }
    return;
  }
  // Another post in the Feeds pane takes the place of the one there.
  const swap = state.open && $("readerView").dataset.pane && !$("readerView").dataset.leaving;
  if (!fromHistory && !wait) swap ? history.replaceState(readerState(p), "") : history.pushState(readerState(p), "");
  const shown = show(p, html);
  if (!wait) pushScreen($("readerView"));
  await shown;
  if (wait) {
    const d = $("readerFrame").contentDocument;
    await Promise.race([Promise.all([
      d && d.fonts ? d.fonts.ready : null,
      p.link ? C.files.drawNear($("readerFrame")) : null,
    ]), new Promise((r) => setTimeout(r, 4000))]);
    // The place it was left is set the frame after the fonts are in.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (waiting !== id) return;
    stopWaiting();
  } else if (p.link) C.files.drawNear($("readerFrame"));
  $("readerFrame").focus();
  if (markAfterOpen) {
    const id = markAfterOpen, d = $("readerFrame").contentDocument;
    markAfterOpen = null;
    // After the reader has gone back to where it was left.
    await (d && d.fonts ? d.fonts.ready : null);
    requestAnimationFrame(() => { if (state.open === p) C.reader.toMark(id); });
  }
  furtherRead(p);
}

// The furthest-read check (1.3.0): a look at the library on GitHub as a
// clip opens, and when another device read it further and later, a
// toast offers to go there. The open never waits for it.
let openedReadAt = 0;
// Each device names itself for that toast (1.4.2): what you typed in
// Settings, Sync, the name Android knows it by, or what kind of device
// it is. A guessed name reads
// "your phone", one you typed reads as you typed it.
const GUESSED_NAMES = ["phone", "tablet", "iPhone", "iPad", "computer"];
function guessedName() {
  if (C.platform.deviceName) return C.platform.deviceName;
  const ios = C.platform.ios || /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const big = Math.min(screen.width, screen.height) >= 600;
  if (ios) return big ? "iPad" : "iPhone";
  if (C.platform.native || /Android/.test(navigator.userAgent)) return big ? "tablet" : "phone";
  return "computer";
}
const deviceName = () => String(load(DEVICE_KEY, "") || "").trim().slice(0, 40) || guessedName();
function onDevice(name) {
  if (!name) return "on your other device";
  const mine = name === deviceName();
  if (GUESSED_NAMES.includes(name)) return "on your " + (mine ? "other " : "") + name;
  return mine ? "on your other device" : "on " + name;
}
async function furtherRead(p) {
  if (!C.sync.on || C.sync.paused || !navigator.onLine || p.link) return;
  let got;
  try { got = await C.sync.peek(); } catch (e) { got = null; }
  if (!got || state.open !== p) return;
  const other = got.pages.find((x) => x && x.id === p.id) || got.pages.find((x) => x && sameUrl(x.url, p.url));
  if (!other || !(other.readAt > openedReadAt) || typeof other.at !== "number") return;
  if (Math.abs(other.at - (p.at || 0)) < 0.01 && (!other.spot || other.spot === p.spot)) return;
  const pct = Math.round(other.at * 100);
  const where = onDevice(typeof other.readOn === "string" ? other.readOn : "");
  toast(other.finished || other.at >= 0.97 ? "Read to the end " + where + "." : "Read to " + pct + "% " + where + ".", "Go there", () => {
    if (state.open !== p) return;
    p.at = other.at;
    if (other.spot) p.spot = other.spot;
    if (other.finished) p.finished = true;
    p.readAt = Math.max(other.readAt, Date.now());
    p.readOn = deviceName();
    C.reader.jump(other.at, other.spot || "");
    savePositions();
  });
}

// A linked PDF from before 1.2.1 gets its cover a moment after it opens
// (1.2.2, 1.2.4): the card learns of it here.
const openLinked = (p) => C.files.openLinked(p);
C.files.onCover = async (p) => {
  if (!state.pages.includes(p)) return;
  await C.store.writeIndex(state.pages);
  if (!C.platform.native) await loadThumbs();
  renderLibrary();
};
// The PDF sandbox and its library take a moment to come up; with a PDF
// in the library they come up after launch, not at the first open (1.2.4).
let warmed = false;
function warmPdf() {
  if (warmed || !state.pages.some((p) => p.link && p.file && p.file.kind === "pdf")) return;
  warmed = true;
  setTimeout(() => C.pdf.warm(), 2500);
}

// The history entry for a page in the reader (and the sheet over it).
const readerState = (p, sheet, image) => ({ view: "reader", page: p.id, folder: state.folder || undefined, sheet: sheet || undefined, image: image || undefined });

function show(p, html) {
  state.open = p;
  // Opening counts as reading for the order of things (sort by read, the
  // sidebar, Continue reading); the merge is safe because the place
  // itself only changes when you move (notePosition, reader.js's
  // restore doesn't count), and furtherRead compares with the time
  // from before this open.
  // Only once it's been open a few seconds (1.21.0): a clip that flashed
  // up on the way somewhere else (Back through history, a wrong tap)
  // became Continue reading.
  openedReadAt = p.readAt || 0;
  clearTimeout(openStamp);
  openStamp = setTimeout(() => {
    if (state.open !== p) return;
    p.readAt = Date.now();
    p.readOn = deviceName();
    clearTimeout(positionTimer);
    positionTimer = setTimeout(savePositions, 1500);
  }, OPEN_COUNTS);
  showOffline();
  $("readProgress").dir = p.dir || "ltr";
  $("readerContents").hidden = true;
  $("readerFolder").hidden = !(p.folder && !p.preview && folderPages(p.folder).length > 1);
  $("readerView").classList.remove("bar-away");
  jumpFrom = null;
  $("jumpBack").hidden = true;
  closeFind(true);
  // The rail is kept from the last clip while this one loads, so the
  // text isn't laid out twice; fitRail settles it once it's in.
  $("readerView").classList.toggle("railed", pinned.matches && readingPrefs().rail && !asPane($("readerView")));
  $("readerRail").hidden = !$("readerView").classList.contains("railed");
  fill($("railList"));
  fill($("readerName"), p.site ? el("span", { class: "reader-site" }, p.site) : null, el("span", { class: "reader-title" }, p.title));
  readerScrolled(p.at || 0, 0);
  return C.reader.open($("readerFrame"), html, p, {
    at: p.at || 0, spot: p.spot || "", next: endLink(p), prev: startLink(p),
    onPosition: (f, s) => notePosition(p, f, s),
    onScroll: readerScrolled,
    onImage: openImage,
    onTap: toggleBar,
    onMark: openMark,
    onSelect: showReadHere,
    pages: readingPrefs().layout === "pages",
    top: () => $("readerView").querySelector(".reader-bar").offsetHeight,
    bottom: () => $("readFoot").offsetHeight,
    onKey: onKeys,
    onEdge: brightEdge,
    onPinch: textPinch,
    onLink: openLink,
    onNote: openNote,
    onJump: jumped,
  }).then(() => {
    lostMarks = new Set();
    brightOpen();
    paintMarks(p);
    $("readerContents").hidden = C.reader.headings().length < 2;
    fitRail();
    // Reading aloud carries on across clips (1.4.0): its light and
    // player show again when its clip is the one open.
    setAloud(aloud.state, aloud.index);
    if (aloudAuto) { aloudAuto = false; startAloud(0); }
  });
}

// ---- Brightness while reading (1.10.0) ----
// A swipe up or down along the left edge of the text sets the screen's
// brightness, with a slider on the left while it moves; the slider also
// shows with the bars, to drag. The level is kept for the next clip and
// let go when the reader closes. In the app only (the Brightness plugin):
// a browser can't change the screen. Off in Settings or the Aa sheet.
const BRIGHT_KEY = "waypage.brightness";
const BRIGHT_SWIPE_KEY = "waypage.brightSwipe";
// Which side the slider and the swipe are on (1.16.0): hold the slider half a
// second, then swipe it across.
const BRIGHT_SIDE_KEY = "waypage.brightSide";
const brightSide = () => (load(BRIGHT_SIDE_KEY, "left") === "right" ? "right" : "left");
const brightOn = () => C.platform.brightness.available && load(BRIGHT_SWIPE_KEY, true) !== false;
let bright = 0.5, brightFrom = 0.5, brightSet = false, brightQueued = false, brightTimer = 0;
function paintBright() {
  const pct = Math.round(bright * 100);
  $("brightAuto").setAttribute("aria-pressed", String(!brightSet));
  $("brightFill").style.transform = "scaleY(" + bright + ")";
  $("brightTrack").setAttribute("aria-valuenow", pct);
  $("brightTrack").setAttribute("aria-valuetext", pct + "%");
}
function setBright(v) {
  bright = clamp(v, 0.01, 1);
  brightSet = true;
  paintBright();
  if (brightQueued) return;
  brightQueued = true;
  requestAnimationFrame(() => { brightQueued = false; C.platform.brightness.set(bright).catch(() => {}); });
}
function placeBright() {
  const f = $("readerFrame").getBoundingClientRect(), v = $("readerView").getBoundingClientRect();
  $("bright").style.setProperty("--frame-left", Math.max(0, f.left - v.left) + "px");
  $("bright").style.setProperty("--frame-right", Math.max(0, v.right - f.right) + "px");
  $("bright").classList.toggle("right", brightSide() === "right");
}
// To the other side, from where it was let go (`dx` along), so it glides
// the rest of the way.
function setBrightSide(side, dx = 0) {
  const box = $("bright"), was = box.getBoundingClientRect().left;
  store(BRIGHT_SIDE_KEY, side);
  box.style.transition = "none";
  box.classList.toggle("right", side === "right");
  document.querySelectorAll('input[name$="-brightSide"]').forEach((i) => { i.checked = i.value === side; });
  const now = box.getBoundingClientRect().left;
  box.style.translate = (was + dx - now) + "px 0";
  void box.offsetWidth;
  box.style.transition = "";
  box.style.translate = "";
}
async function brightOpen() {
  $("bright").hidden = !brightOn();
  if (!brightOn()) return;
  placeBright();
  const kept = Number(load(BRIGHT_KEY, 0));
  if (kept > 0) {
    bright = clamp(kept, 0.01, 1);
    brightSet = true;
    C.platform.brightness.set(bright).catch(() => {});
  } else {
    try { bright = clamp(Number((await C.platform.brightness.get()).level) || 0.5, 0.01, 1); } catch (e) { bright = 0.5; }
  }
  paintBright();
}
// Auto, under the slider (1.14.0): the phone's own level again, and kept
// so, until the next swipe.
async function brightAuto() {
  clearTimeout(brightTimer);
  if (brightSet) await C.platform.brightness.set(null).catch(() => {});
  brightSet = false;
  store(BRIGHT_KEY, 0);
  try { bright = clamp(Number((await C.platform.brightness.get()).level) || 0.5, 0.01, 1); } catch (e) { bright = 0.5; }
  paintBright();
  brightTimer = setTimeout(() => $("readerView").classList.remove("brightening"), 700);
}
function brightClose() {
  clearTimeout(brightTimer);
  $("readerView").classList.remove("brightening");
  if (brightSet) C.platform.brightness.set(null).catch(() => {});
  brightSet = false;
}
const brightEdge = {
  on: () => brightOn() && !state.sheet,
  side: brightSide,
  start() {
    clearTimeout(brightTimer);
    brightFrom = bright;
    $("readerView").classList.add("brightening");
  },
  move: (d) => setBright(brightFrom + d),
  end() {
    store(BRIGHT_KEY, bright);
    brightTimer = setTimeout(() => $("readerView").classList.remove("brightening"), 700);
  },
};
(() => {
  const track = $("brightTrack"), box = $("bright");
  let dragging = false, press = null;
  const at = (y) => { const r = track.getBoundingClientRect(); return 1 - (y - r.top) / r.height; };
  track.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    e.preventDefault();
    // Moves over the text keep coming here, not to the page's frame.
    try { track.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    dragging = true;
    clearTimeout(brightTimer);
    $("readerView").classList.add("brightening");
    brightFrom = bright;
    setBright(at(e.clientY));
  });
  // Held still for half a second (1.16.1), anywhere on it, it lifts and follows the
  // finger across; let go past the middle and it stays on that side.
  box.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    const id = e.pointerId, x = e.clientX, y = e.clientY;
    press = { id, x, y, lifted: false, timer: setTimeout(() => {
      if (!press || press.id !== id) return;
      press.lifted = true;
      try { box.setPointerCapture(id); } catch (err) { /* let go */ }
      if (dragging) { dragging = false; setBright(brightFrom); }
      clearTimeout(brightTimer);
      $("readerView").classList.add("brightening");
      box.classList.add("lifted");
      if (navigator.vibrate) navigator.vibrate(10);
    }, 500) };
  });
  addEventListener("pointermove", (e) => {
    if (press && press.id === e.pointerId) {
      if (press.lifted) {
        e.preventDefault();
        box.style.translate = (e.clientX - press.x) + "px 0";
        return;
      }
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) { clearTimeout(press.timer); press = null; }
    }
    if (dragging) setBright(at(e.clientY));
  });
  const up = (e) => {
    if (press && press.id === e.pointerId) {
      const p = press;
      clearTimeout(p.timer);
      press = null;
      if (p.lifted) {
        box.classList.remove("lifted");
        const v = $("readerView").getBoundingClientRect();
        const side = e.type === "pointerup" && e.clientX > v.left + v.width / 2 ? "right" : e.type === "pointerup" ? "left" : brightSide();
        // The tap that ends a hold isn't an Auto.
        const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
        addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener("click", swallow, true), 0);
        setBrightSide(side, e.clientX - p.x);
        brightTimer = setTimeout(() => $("readerView").classList.remove("brightening"), 700);
        return;
      }
    }
    if (!dragging) return;
    dragging = false;
    store(BRIGHT_KEY, bright);
    brightTimer = setTimeout(() => $("readerView").classList.remove("brightening"), 700);
  };
  addEventListener("pointerup", up);
  addEventListener("pointercancel", up);
  track.addEventListener("keydown", (e) => {
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
    const to = e.key === "Home" ? 0.01 : e.key === "End" ? 1 : step != null ? bright + step : null;
    if (to == null) return;
    e.preventDefault();
    setBright(to);
    store(BRIGHT_KEY, bright);
  });
  $("brightAuto").addEventListener("click", brightAuto);
  addEventListener("resize", () => { if (state.open && !$("bright").hidden) placeBright(); });
})();
function brightSwitch(id) {
  if (!C.platform.brightness.available) return null;
  return [el("label", { class: "rc-row switch-row" },
    el("span", { class: "choice-text" }, el("span", { class: "rc-label" }, "Brightness along the edge"),
      el("span", { class: "choice-note" }, "Swipe up or down along the slider's side while reading")),
    el("input", { class: "switch", type: "checkbox", role: "switch", "data-pref": "brightSwipe", checked: brightOn(),
      onchange: (e) => {
        store(BRIGHT_SWIPE_KEY, e.target.checked);
        document.querySelectorAll('input[data-pref="brightSwipe"]').forEach((i) => { i.checked = e.target.checked; });
        if (!state.open) return;
        if (e.target.checked) brightOpen();
        else { brightClose(); $("bright").hidden = true; }
      } })),
  // Also by holding the slider half a second and swiping it across.
  el("div", { class: "rc-row" }, el("span", { class: "rc-label" }, "Brightness slider"),
    seg(id + "-brightSide", "Brightness slider side", [
      { value: "left", label: "Left" }, { value: "right", label: "Right" },
    ], brightSide(), (v) => { setBrightSide(v); placeBright(); }))];
}

// Text size from a pinch on a clip's words (1.16.0); pictures and a
// PDF's printed pages zoom as they did.
const PINCH_KEY = "waypage.pinchText";
const pinchOn = () => load(PINCH_KEY, true) !== false;
// The text keeping its place under the fingers scrolls it, which isn't
// reading on: the bars stay as they were.
let pinchedAt = -1e9;
const textPinch = {
  on: () => pinchOn() && !state.sheet,
  size: () => readingPrefs().size,
  set: (px) => { pinchedAt = performance.now(); px = clamp(px, SIZE_MIN, SIZE_MAX); if (px !== readingPrefs().size) setReading({ size: px }); },
};
function pinchSwitch() {
  return el("label", { class: "rc-row switch-row" },
    el("span", { class: "choice-text" }, el("span", { class: "rc-label" }, "Pinch for text size"),
      el("span", { class: "choice-note" }, "Pictures and PDF pages still zoom")),
    el("input", { class: "switch", type: "checkbox", role: "switch", "data-pref": "pinchText", checked: pinchOn(),
      onchange: (e) => {
        store(PINCH_KEY, e.target.checked);
        document.querySelectorAll('input[data-pref="pinchText"]').forEach((i) => { i.checked = e.target.checked; });
      } }));
}

// A tap on the text brings the bar back, or hides it for reading.
function toggleBar() {
  if (state.sheet) return;
  const away = !$("readerView").classList.contains("bar-away");
  $("readerView").classList.toggle("bar-away", away);
  lastY = readerY;
  if (!away) readerFoot(C.reader.position());
}

// Under the bar's line along the bottom: the section being read and the
// minutes left, shown with the bar.
function readerFoot(at) {
  const p = state.open;
  if (!p) return;
  $("readLeft").textContent = at >= 0.995 ? "End" : Math.max(1, Math.ceil((p.minutes || 1) * (1 - at))) + " min left";
  const pg = C.reader.pageInfo();
  const section = C.reader.section();
  $("readSection").textContent = pg ? "Page " + pg.page + " of " + pg.pages + (section ? " · " + section : "") : section;
}

// The bar along the bottom fills as the page is read. The top bar slides
// away on any scroll, up or down, and a tap brings it back; it stays at
// the top, at the end, and while a sheet is up. Read aloud's own
// scrolling, following the voice, leaves it as it is.
let lastY = 0, readerY = 0;
function readerScrolled(at, y) {
  readerY = y;
  if (state.open && state.open.link) C.files.drawNear($("readerFrame"));
  if (readHere && !readHere.hidden) showReadHere();
  $("readProgress").firstElementChild.style.transform = "scaleX(" + at + ")";
  railNow();
  if (!$("readerView").classList.contains("bar-away") || aloudHere()) readerFoot(at);
  const bar = $("readerView").querySelector(".reader-bar").offsetHeight;
  let away = $("readerView").classList.contains("bar-away");
  if (y <= bar || at >= 0.999 || state.sheet) away = false;
  else if (C.reader.following() || performance.now() - pinchedAt < 400) { lastY = y; return; }
  else if (Math.abs(y - lastY) > 12) away = true;
  else return;
  lastY = y;
  $("readerView").classList.toggle("bar-away", away);
  if (!away) readerFoot(at);
}

// ---- The contents rail (1.5.0) ----
// From 1024 px the contents sit beside the text, the section being read
// marked, with Back, and the licence and the original link at the foot.
// Reader settings has a switch to keep it away.
// A book of pictures (a scan, a PDF read from its file, a comic) has its
// pages there instead, drawn small (1.5.1).
const railPages = () => C.reader.headings().length >= 2 ? [] : C.reader.printedPages();
const railOn = () => pinned.matches && readingPrefs().rail && !!state.open && !$("readerView").dataset.pane
  && (C.reader.headings().length >= 2 || C.reader.printedPages().length >= 2);
const RAIL_THUMB = 112;
let railSeen = null;
function fitRail() {
  const on = railOn(), view = $("readerView");
  const was = view.classList.contains("railed");
  view.classList.toggle("railed", on);
  $("readerRail").hidden = !on;
  if (on) paintRail();
  if (was !== on && state.open) C.reader.refit();
}
function paintRail() {
  const p = state.open;
  $("railBackLabel").textContent = state.folder || (state.place === "feeds" ? "Feeds" : state.place === "highlights" ? "Highlights" : "Library");
  const pages = railPages();
  $("readerRail").classList.toggle("paged", pages.length > 0);
  $("readerRail").setAttribute("aria-label", pages.length ? "Pages" : "Contents");
  $("railOver").textContent = pages.length ? "Pages" : "Contents";
  if (railSeen) railSeen.disconnect();
  if (pages.length) {
    // Each page is drawn as it scrolls into the rail.
    railSeen = new IntersectionObserver((seen) => {
      for (const x of seen) {
        if (!x.isIntersecting) continue;
        railSeen.unobserve(x.target);
        const img = x.target, at = pages[Number(img.dataset.n) - 1];
        const put = (url) => { if (url && img.isConnected) { img.src = url; img.classList.add("in"); } };
        if (at.page) C.files.pageThumb(at.page, Math.round(RAIL_THUMB * (devicePixelRatio || 1))).then(put);
        else put(C.reader.printedPages()[at.n - 1].src);
      }
    }, { root: $("railList"), rootMargin: "200px 0px" });
    fill($("railList"), ...pages.map((x) => {
      const img = el("img", { class: "rail-thumb", alt: "", "data-n": x.n });
      railSeen.observe(img);
      return el("li", null, el("button", { class: "rail-page", type: "button", "aria-label": "Page " + x.n, onclick: () => C.reader.toPrinted(x.n) },
        img, el("span", { class: "rail-num" }, String(x.n))));
    }));
  } else {
    fill($("railList"), ...C.reader.headings().map((h, i) => el("li", null,
      el("button", { class: "rail-row" + (h.level === 3 ? " sub" : ""), type: "button", dir: "auto", onclick: () => C.reader.jumpTo(i) }, h.text))));
  }
  const link = /^https?:/.test(p.url || "") ? el("button", { class: "rail-original", type: "button", onclick: () => C.platform.openOutside(p.url) }) : null;
  if (link) link.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>Read the original';
  fill($("railFoot"),
    p.licence === "wikipedia" ? el("p", { class: "rail-licence" }, "Text from Wikipedia, CC BY-SA 4.0, by Wikipedia contributors.") : null, link);
  railNow();
}
function railNow() {
  const rail = $("readerRail");
  if (rail.hidden) return;
  let current = -1;
  if (rail.classList.contains("paged")) current = C.reader.printedNow() - 1;
  else {
    const now = C.reader.section();
    C.reader.headings().forEach((h, i) => { if (h.text === now) current = i; });
  }
  rail.querySelectorAll(".rail-row, .rail-page").forEach((b, i) => {
    if (i !== current) { b.removeAttribute("aria-current"); return; }
    if (b.hasAttribute("aria-current")) return;
    b.setAttribute("aria-current", "location");
    const list = $("railList"), r = b.getBoundingClientRect(), box = list.getBoundingClientRect();
    if (r.top < box.top || r.bottom > box.bottom) b.scrollIntoView({ block: "center" });
  });
}
$("railBack").addEventListener("click", () => $("readerBack").click());

// The clips in this one's collection, in order (1.23.0); a tap turns to
// that clip, the one open marked.
function folderList() {
  const p = state.open;
  const list = p && p.folder ? folderPages(p.folder) : [];
  const rows = list.map((q, i) => {
    const b = el("button", { class: "row contents-row folder-row", type: "button", onclick: () => { if (q !== state.open) goTo(q, i < list.indexOf(state.open) ? -1 : 1); else history.back(); } },
      el("span", { class: "folder-n", "aria-hidden": "true" }, String(i + 1)),
      el("span", { class: "choice-text" },
        el("span", { class: "row-label", dir: "auto" }, q.title),
        el("span", { class: "choice-note" }, q.finished ? "Finished" : readingLine(q))));
    if (q === p) b.setAttribute("aria-current", "page");
    return el("li", null, b);
  });
  const nav = el("nav", { class: "contents", "aria-label": p ? p.folder : "Collection" },
    el("p", { class: "menu-title", dir: "auto" }, p ? p.folder : ""),
    el("ol", { class: "group contents-list" }, ...rows));
  requestAnimationFrame(() => centreIn(nav.querySelector("[aria-current]")));
  return nav;
}

// The open row in the middle of the sheet (1.23.1). scrollIntoView moved
// every scroller above it too, the reader's page with them, while the
// sheet was still rising: the whole page dropped in from the top.
function centreIn(row) {
  const box = $("readingBody");
  if (!row || !box.contains(row)) return;
  const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
  box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
}

// The page's h2 and h3 headings; a tap goes there.
function contentsList() {
  const now = C.reader.section();
  let current = -1;
  const list = C.reader.headings();
  list.forEach((h, i) => { if (h.text === now) current = i; });
  const rows = list.map((h, i) => {
    const b = el("button", { class: "row contents-row" + (h.level === 3 ? " sub" : ""), type: "button",
      onclick: () => { history.back(); C.reader.jumpTo(i); } }, el("span", { class: "row-label", dir: "auto" }, h.text));
    if (i === current) b.setAttribute("aria-current", "location");
    return el("li", null, b);
  });
  const nav = el("nav", { class: "contents", "aria-label": "Contents" }, el("ol", { class: "group contents-list" }, ...rows));
  if (current > 0) requestAnimationFrame(() => centreIn(nav.querySelector("[aria-current]")));
  return nav;
}

// What the end of a page offers: the next page in its folder, else the
// site's next page (saved already, or to save now and open).
function endLink(p) {
  if (p.preview) return null;
  const next = neighbour(p, 1);
  if (next) return { over: "Next in " + p.folder, title: next.title, go: () => goTo(next, true) };
  if (!p.next) return null;
  const had = savedAs(p.next);
  if (had) return { over: "Next on " + p.site, title: had.title, go: () => goTo(had, true) };
  return { over: "Next on " + p.site, title: "Save it and read on", go: () => followAndOpen(p) };
}

// What the top of a page offers (1.23.0): the page before it in its
// folder, else the site's previous page (saved already, or to save now).
function startLink(p) {
  if (p.preview) return null;
  const prev = neighbour(p, -1);
  if (prev) return { over: "Previous in " + p.folder, title: prev.title, go: () => goTo(prev, -1) };
  if (typeof p.prev !== "string" || !p.prev) return null;
  const had = savedAs(p.prev);
  if (had) return { over: "Previous on " + p.site, title: had.title, go: () => goTo(had, -1) };
  return { over: "Previous on " + p.site, title: "Save it and read it", go: async () => {
    if (!navigator.onLine) { toast("You're offline. The page before saves when you're back online."); return; }
    toast("Saving the page before…");
    const got = await follow(p, 1, true, true);
    if (got && state.open === p) goTo(got, -1);
  } };
}

async function followAndOpen(p) {
  if (!navigator.onLine) { toast("You're offline. The next page saves when you're back online."); return; }
  toast("Saving the next page…");
  const got = await follow(p, 1, true);
  if (got && state.open === p) goTo(got, true);
}

// Next or previous in a folder: the reader stays and its page changes,
// in the same history entry, so back still leaves the reader.
// From the end link (0.28.2) the page turns: the one read slides away
// to the left and the next comes in from the right; turn -1 (1.23.1) is
// backwards, the page before coming in from the left or the top.
async function goTo(p, turn) {
  let html;
  try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
  if (!html) { toast("This clip's file is missing. Delete it and save it again."); return; }
  if (state.sheet) await new Promise((resolve) => { addEventListener("popstate", () => resolve(), { once: true }); history.back(); });
  if (positionTimer) savePositions();
  history.replaceState(readerState(p), "");
  const frame = $("readerFrame");
  const side = C.reader.paged;
  const dir = turn === -1 ? -1 : 1;
  if (turn) await M.pageOut(frame, side, dir);
  try { await show(p, html); } finally { if (turn) await M.pageIn(frame, side, dir); }
  frame.focus();
}

// Where each page was left (`at`, 0 to 1) and whether it was ever read to
// the end, kept in the library index; written a moment after scrolling
// stops, and when the page is closed.
let positionTimer = null;
let openStamp = null;
const OPEN_COUNTS = 3000;
function notePosition(p, f, s) {
  const at = Math.round(f * 1000) / 1000;
  // Read just now only when the place really moved (1.10.1): pictures
  // coming in or the text laid out again shift the fraction a little
  // with no reading, and that made another clip Continue reading (on
  // this device, or on another one through sync).
  const moved = s && p.spot ? s !== p.spot : Math.abs(at - (p.at || 0)) >= 0.01;
  p.at = at;
  // An empty spot (Pages, with no block starting on this page) clears
  // the old one, so the fraction decides the place.
  if (s) p.spot = s; else delete p.spot;
  if (f >= 0.97) p.finished = true;
  if (moved) { p.readAt = Date.now(); p.readOn = deviceName(); }
  clearTimeout(positionTimer);
  positionTimer = setTimeout(savePositions, 1500);
}
function savePositions() {
  clearTimeout(positionTimer);
  positionTimer = null;
  updateWidgets();
  return C.store.writeIndex(state.pages).catch(() => {});
}

function closeReader() {
  if (waiting && !state.open) { stopWaiting(); C.reader.close(); C.files.closeHeld(); popScreen($("readerView")); return; }
  stopWaiting();
  if (!state.open) return;
  if (positionTimer) savePositions();
  // Where you got to goes to GitHub now, not in four seconds (1.3.0).
  if (C.sync.on && navigator.onLine) syncNow();
  closeSheet(true);
  if (state.image) { state.image = false; $("imageViewer").hidden = true; $("viewerImg").removeAttribute("src"); }
  // Reading aloud goes on (1.4.0): the bar along the bottom carries it.
  hideReadHere();
  brightClose();
  closeFind(true);
  $("jumpBack").hidden = true;
  state.open = null;
  showAloudBar();
  // The library redraws (where you got to) before the reader shrinks
  // into its card (1.11.1), so the card it lands on is already the new
  // one; after it, the card changed a frame late. Only what changed is
  // drawn again, so a big library no longer holds Back up (0.30.4).
  renderLibrary();
  if (state.folder) renderFolder();
  popScreen($("readerView")).then(() => {
    if (state.open) return;
    C.reader.close();
    C.files.closeHeld();
  });
}

// ---- Read aloud (0.27.0) ----
// The page's blocks go to the phone's speech engine (platform.js) as
// pieces of a sentence or few, from the block at the top of the screen.
// The app reads on with the screen off; a browser while the page is open.
// `map` is each piece's block, which the reader lights up.

const speech = C.platform.speech;
const aloud = { key: "", map: [], state: "stopped", index: -1, arrived: false };
// Whether the clip being read aloud is the one open in the reader; when
// it isn't (another clip, the library, Settings), the bar along the
// bottom of the app shows it instead (1.4.0).
const aloudOn = () => aloud.state === "playing" || aloud.state === "paused";
const aloudHere = () => (aloudOn() || aloud.state === "ended") && !!state.open && state.open.id === aloud.key;
const aloudPage = () => state.pages.find((x) => x.id === aloud.key) || null;
let aloudAuto = false;
// Speed is a slider since 0.34.0, from half to three times.
const RATE_MIN = 0.5, RATE_MAX = 3;
const FOOTNOTES_KEY = "waypage.aloudFootnotes";
const EDGES_KEY = "waypage.aloudSkipEdges";
// Read next by itself at the end of a clip (1.6.0), when there's a next.
const GO_ON_KEY = "waypage.aloudGoOn";
let wentOnFrom = "";
const PIECE = 600;

// `parts` is [{ text, block }]; a block can be in two parts when the
// reading starts partway through it.
function pieces(parts) {
  const items = [], map = [];
  let first = -1;
  // A sentence longer than a piece breaks after a comma, else a space.
  const cut = (x) => {
    const out = [];
    while (x.length > PIECE) {
      let at = x.lastIndexOf(", ", PIECE);
      if (at < PIECE / 2) at = x.lastIndexOf(" ", PIECE);
      if (at < PIECE / 2) at = PIECE;
      out.push(x.slice(0, at + 1));
      x = x.slice(at + 1);
    }
    return x ? out.concat(x) : out;
  };
  parts.forEach(({ text: t, block: b, from }) => {
    if (from) first = items.length;
    const sentences = (t.match(/[^.!?。！？]+(?:[.!?。！？]+["'”’)\]]*\s*|$)/g) || [t]).flatMap(cut);
    let cur = "";
    for (const x of sentences) {
      if (cur && (cur + x).length > PIECE) { items.push(cur.trim()); map.push(b); cur = ""; }
      cur += x;
    }
    if (cur.trim()) { items.push(cur.trim()); map.push(b); }
  });
  return { items, map, first };
}

const langOf = (p) => ((p && p.lang) || navigator.language || "en").toLowerCase().replace(/^iw\b/, "he");
const primary = (lang) => String(lang || "").toLowerCase().split(/[-_]/)[0].replace(/^iw$/, "he");
const voiceFor = (p) => load(VOICE_KEY, {})[primary(langOf(p))] || "";

// From a block, or from a word in it (`spot` from a selection).
async function startAloud(from, spot) {
  const p = state.open;
  if (!p) return;
  const texts = C.reader.readable({ footnotes: !!load(FOOTNOTES_KEY, false), edges: !!load(EDGES_KEY, false) });
  if (!texts.length) { toast(C.files.printed(p) ? "Switch this PDF to Show as text, in ⋯, to read it aloud." : "There's no text in this clip to read aloud."); return; }
  const block = spot ? spot.block : from == null ? C.reader.firstShown() : from;
  const parts = [];
  texts.forEach((text, b) => {
    if (b !== block) { parts.push({ text, block: b }); return; }
    let cut = spot ? wordAt(text, spot) : 0;
    if (cut > 0) parts.push({ text: text.slice(0, cut), block: b });
    parts.push({ text: text.slice(cut), block: b, from: true });
  });
  const { items, map, first } = pieces(parts);
  const start = Math.max(0, first);
  Object.assign(aloud, { key: p.id, map });
  setAloud("playing", start);
  queued = null;
  try {
    await speech.play({ items, start, lang: p.lang || "", voice: voiceFor(p), rate: load(RATE_KEY, 1),
      title: p.title, subtitle: p.folder || p.site || "", key: p.id });
    queueNext();
  } catch (e) {
    setAloud("stopped", -1);
    toast("Couldn't read aloud. Check the phone's text-to-speech settings.");
  }
}

// Going on with the app put away (1.23.0). At the end of a clip the app
// opened the next one in the reader to read it, which a page in the
// background can't draw, so nothing went on until the app was looked at.
// Now, while a clip is read with Go on to the next clip on, the next one
// (already saved) is read from its file and handed to the phone, which
// goes straight on to it; the app catches up when it's back.
let queued = null, openOnReturn = "";
async function queueNext() {
  const p = aloudPage();
  let next = p && aloudOn() && load(GO_ON_KEY, false) ? neighbour(p, 1) || (p.next ? savedAs(p.next) : null) : null;
  if (next && (next.file || next.link || next.preview)) next = null;
  if (!next) {
    if (queued) { queued = null; speech.queue({ after: "", items: [] }); }
    return;
  }
  if (queued && queued.key === next.id && queued.after === p.id) return;
  let html;
  try { html = await C.store.readPage(next.id); } catch (e) { html = null; }
  if (!html || aloud.key !== p.id) return;
  const texts = C.reader.readableIn(html, { footnotes: !!load(FOOTNOTES_KEY, false), edges: !!load(EDGES_KEY, false) });
  if (!texts.length) return;
  const { items, map } = pieces(texts.map((text, block) => ({ text, block })));
  queued = { key: next.id, after: p.id, map };
  const ok = await speech.queue({ after: p.id, items, start: 0, lang: next.lang || "", voice: voiceFor(next),
    title: next.title, subtitle: next.folder || next.site || "", key: next.id });
  if (!ok) queued = null;
}
// The phone went on to the queued clip: the one before is finished, and
// the reader turns to the new one now, or when the app is back.
function wentOn(key) {
  if (!queued || queued.key !== key) return false;
  const was = aloudPage();
  const next = state.pages.find((x) => x.id === key);
  if (!next) return false;
  if (was) { was.finished = true; was.at = 1; delete was.spot; savePositions(); }
  Object.assign(aloud, { key, map: queued.map });
  queued = null;
  wentOnFrom = "";
  if (was && state.open && state.open.id === was.id) {
    if (document.hidden) openOnReturn = key;
    else goTo(next, true);
  }
  return true;
}

// Where the selected word starts in the block's spoken text: the copy of
// the word nearest the selection's offset, else the word at the offset.
function wordAt(text, spot) {
  const near = (i) => (i < 0 ? Infinity : Math.abs(i - spot.offset));
  let best = -1;
  if (spot.word) for (let i = text.indexOf(spot.word); i >= 0; i = text.indexOf(spot.word, i + 1)) if (near(i) < near(best)) best = i;
  if (best >= 0 && near(best) < 40) return best;
  const at = Math.min(spot.offset, text.length);
  const space = text.lastIndexOf(" ", at - 1);
  return space < 0 ? 0 : space + 1;
}

// Under a selection while one is up: Highlight (1.7.0), Read from here
// when the phone can read aloud, and Translate (1.8.0). Look up, which
// searched Wiktionary, went in 1.11.1: the phone's own menu has it.
let readHere = null, quietUntil = 0;
const myLang = () => (navigator.language || "en").split("-")[0].toLowerCase().replace(/^iw$/, "he");
// Translate hands the words to the phone's translate app where it can
// (1.8.1): Google Translate took the web address but dropped the words.
async function translate(text) {
  hideReadHere();
  C.reader.clearSelection();
  if (await C.platform.translateText(text)) return;
  if (!navigator.onLine) { toast("You're offline. Translate opens on the web."); return; }
  C.platform.openOutside(translateUrl(text));
}
const translateUrl = (text) => "https://translate.google.com/?sl=auto&tl=" + myLang() + "&op=translate&text=" + encodeURIComponent(text.slice(0, 1500));
function showReadHere() {
  const p = state.open;
  const mark = p && !p.preview && !state.sheet && Date.now() > quietUntil ? C.reader.selectionMark() : null;
  const spot = p && speech.available && !state.sheet ? C.reader.selectionSpot() : null;
  const picked = p && !state.sheet && Date.now() > quietUntil ? C.reader.selectionText() : null;
  const box = (mark && mark.box) || spot || (picked && picked.box);
  if (!box) { hideReadHere(); return; }
  if (!readHere) {
    const aloudBtn = el("button", { class: "sel-aloud", type: "button", "aria-label": "Read from here", onclick: () => {
      const s = C.reader.selectionSpot();
      hideReadHere();
      C.reader.clearSelection();
      if (s) startAloud(null, s);
    } });
    aloudBtn.innerHTML = $("readerAloud").innerHTML;
    aloudBtn.append(el("span", { class: "sel-label" }, "Read from here"));
    const markBtn = el("button", { class: "sel-mark", type: "button", onclick: () => (markBtn.dataset.remove ? removeMarks(markBtn.dataset.remove.split(",")) : addMark()) });
    markBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS.mark + "</svg>";
    markBtn.append(el("span", { class: "sel-label sel-mark-label" }, "Highlight"));
    const outBtn = (cls, label, icon, act) => {
      const b = el("button", { class: cls + " sel-icon", type: "button", "aria-label": label, title: label, onclick: () => {
        const s = C.reader.selectionText();
        if (s) act(s.text);
      } });
      b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + "</svg>";
      return b;
    };
    readHere = el("div", { class: "read-here", role: "toolbar", "aria-label": "Selection" }, markBtn, aloudBtn,
      outBtn("sel-translate", "Translate", ICONS.translate, translate));
    $("readerView").append(readHere);
  }
  const markBtn = readHere.querySelector(".sel-mark");
  markBtn.hidden = !mark;
  // Words already highlighted (1.7.1): the button takes the highlight off.
  const on = mark ? C.reader.selectionMarks() : { all: false };
  if (on.all) markBtn.dataset.remove = on.ids.join(","); else delete markBtn.dataset.remove;
  markBtn.querySelector(".sel-mark-label").textContent = on.all ? "Remove highlight" : "Highlight";
  markBtn.setAttribute("aria-label", on.all ? "Remove highlight" : "Highlight");
  readHere.querySelector(".sel-aloud").hidden = !spot;
  readHere.querySelector(".sel-translate").hidden = !picked;
  const frame = $("readerFrame").getBoundingClientRect();
  const h = 44, room = frame.bottom - 72;
  const bar = $("readerView").classList.contains("bar-away") ? 0 : $("readerView").querySelector(".reader-bar").offsetHeight;
  // Under the selection, else over it; a selection taller than the
  // screen pins it to the bottom (1.7.1), since at the top it sat under
  // the reader's bar and the phone's own Copy and Share bar.
  let top = frame.top + box.bottom + 12;
  if (top + h > room) top = frame.top + box.top - h - 12;
  if (top < frame.top + bar + 8) top = room - h;
  readHere.style.top = top + "px";
  readHere.hidden = false;
  // Too wide for the screen, Read from here is its icon alone, then
  // every button is.
  readHere.classList.remove("tight", "tighter");
  if (readHere.offsetWidth > innerWidth - 16) readHere.classList.add("tight");
  if (readHere.offsetWidth > innerWidth - 16) readHere.classList.add("tighter");
  // Kept on screen whole, however wide its buttons make it.
  const half = readHere.offsetWidth / 2;
  readHere.style.left = Math.max(8 + half, Math.min(frame.left + (box.left + box.right) / 2, innerWidth - 8 - half)) + "px";
  // The reader can be scrolled a little itself, under the frame, which
  // moves the bar with it: it's put back where it was meant to go.
  const off = readHere.getBoundingClientRect().top - top;
  if (Math.abs(off) > 1) readHere.style.top = top - off + "px";
}
function hideReadHere() { if (readHere) readHere.hidden = true; }

// ---- Highlights (1.7.0) ----
// Kept on the clip's index entry as `marks`, so they sync, back up and
// export with it: [{ id, block, start, endBlock, end, text, note, at }].
// reader.js finds and paints them; a tap on one opens it here.
const byPlace = (a, b) => a.block - b.block || a.start - b.start;
// Ids of the open clip's highlights that this copy of it has no place for.
let lostMarks = new Set();
function paintMarks(p) {
  if (state.open !== p) return;
  const found = new Set(C.reader.paintMarks(p.marks || []));
  lostMarks = new Set((p.marks || []).map((m) => m.id).filter((id) => !found.has(id)));
}
async function saveMarks(p) {
  if (p.marks && !p.marks.length) delete p.marks;
  await C.store.writeIndex(state.pages);
  paintMarks(p);
  renderLibrary();
  updateWidgets();
}
async function addMark() {
  const p = state.open;
  const m = C.reader.selectionMark();
  hideReadHere();
  C.reader.clearSelection();
  // The selection change the new highlight makes doesn't bring the bar back.
  quietUntil = Date.now() + 600;
  if (!p || !m) return;
  // A highlight over one already there takes its place, keeping its note.
  const over = (p.marks || []).filter((x) => !(x.endBlock < m.block || (x.endBlock === m.block && x.end <= m.start)
    || x.block > m.endBlock || (x.block === m.endBlock && x.start >= m.end)));
  const keep = { id: C.save.newId(), block: m.block, start: m.start, endBlock: m.endBlock, end: m.end, text: m.text.slice(0, 4000), at: Date.now() };
  const notes = over.map((x) => x.note).filter(Boolean);
  if (notes.length) keep.note = notes.join("\n\n");
  p.marks = [...(p.marks || []).filter((x) => !over.includes(x)), keep].sort(byPlace);
  await saveMarks(p);
  toast("Highlighted. Tap it to add a note.");
}
async function removeMarks(ids) {
  const p = state.open;
  hideReadHere();
  C.reader.clearSelection();
  quietUntil = Date.now() + 600;
  if (!p) return;
  p.marks = (p.marks || []).filter((x) => !ids.includes(x.id));
  await saveMarks(p);
  toast(ids.length === 1 ? "Highlight removed" : ids.length + " highlights removed");
}
// A tap on a highlight in the text.
let markFocus = null;
function openMark(id) {
  if (!state.open) return;
  markFocus = id;
  if (state.sheet === "marks") { $("readingBody").replaceChildren(SHEETS.marks.build()); return; }
  openSheet("marks");
}
// After opening a clip from its highlights in the library, go to one.
let markAfterOpen = null;

// The clip's highlights: a list to jump from, or one with its note.
// `back` (from the clip's sheet) returns to it.
function marksView(p, back) {
  const box = el("div", { class: "marks" });
  const inReader = state.open === p;
  const draw = () => {
    const one = markFocus && (p.marks || []).find((m) => m.id === markFocus);
    if (!one) markFocus = null;
    fill(box, one ? markOne(p, one, draw) : markList(p, back, draw));
  };
  const markList = (p, back, draw) => {
    const list = p.marks || [];
    const rows = list.map((m) => {
      const lost = inReader && lostMarks.has(m.id);
      const go = () => {
        if (lost) { markFocus = m.id; draw(); return; }
        if (inReader) { history.back(); setTimeout(() => C.reader.toMark(m.id), 0); return; }
        markAfterOpen = m.id;
        back(true);
      };
      return el("li", { class: "mark-item" },
        el("button", { class: "row mark-row", type: "button", onclick: go },
          el("span", { class: "mark-quote", dir: "auto" }, m.text),
          m.note ? el("span", { class: "mark-note", dir: "auto" }, m.note) : null,
          lost ? el("span", { class: "meta" }, "Not found in this copy of the clip") : null),
        el("button", { class: "icon-btn mark-edit", type: "button", "aria-label": "Note and more", onclick: () => { markFocus = m.id; draw(); } },
          svgIcon("rename", 18)));
    });
    return el("div", { class: "marks-list" },
      el("div", { class: "export-top" },
        back ? el("button", { class: "btn-quiet export-back", type: "button", onclick: () => back() }, "Back") : null,
        el("p", { class: "menu-title" }, list.length === 1 ? "1 highlight" : list.length + " highlights"),
        list.length ? el("button", { class: "btn-quiet marks-copy", type: "button", onclick: () => copyText(C.backup.marksMarkdown(p), "Highlights copied") }, "Copy all") : null),
      list.length ? el("ol", { class: "group marks-rows" }, ...rows)
        : el("p", { class: "footnote" }, "Select words in the text and tap Highlight. Highlights go with the clip to your other devices, and into its Markdown export."));
  };
  const markOne = (p, m, draw) => {
    const note = el("textarea", { class: "mark-note-field", rows: "3", placeholder: "Add a note", "aria-label": "Note", dir: "auto" });
    note.value = m.note || "";
    let timer = 0;
    const keepNote = () => {
      clearTimeout(timer);
      const v = note.value.trim().slice(0, 4000);
      if ((m.note || "") === v) return;
      if (v) m.note = v; else delete m.note;
      m.at = Date.now();
      saveMarks(p);
    };
    note.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(keepNote, 800); });
    note.addEventListener("blur", keepNote);
    return el("div", { class: "mark-one" },
      el("div", { class: "export-top" },
        el("button", { class: "btn-quiet export-back", type: "button", onclick: () => { keepNote(); markFocus = null; draw(); } }, "All highlights")),
      el("blockquote", { class: "mark-quote big", dir: "auto" }, m.text),
      note,
      el("div", { class: "group" },
        inReader && !lostMarks.has(m.id) ? menuRow("Go to it", () => { keepNote(); markFocus = null; history.back(); setTimeout(() => C.reader.toMark(m.id), 0); }) : null,
        menuRow("Copy", () => copyText(m.text + (m.note ? "\n\n" + m.note : ""), "Copied")),
        menuRow("Remove highlight", () => {
          clearTimeout(timer);
          p.marks = (p.marks || []).filter((x) => x !== m);
          markFocus = null;
          saveMarks(p).then(draw);
        }, "warn")));
  };
  draw();
  return box;
}
async function copyText(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch (e) { toast("Couldn't copy. Try Export instead."); }
}

function stopAloud() {
  if (aloud.state === "stopped") return;
  const was = aloud.state;
  setAloud("stopped", -1);
  if (was !== "ended") speech.stop();
}
// Read the next clip (1.4.0): the next chapter in the collection, or the
// page the clip links to as its next, saved first when it isn't yet. It
// opens in the reader and starts reading from the top.
async function readNext() {
  const p = aloudPage();
  const link = p && endLink(p);
  if (!link) return;
  aloudAuto = true;
  if (state.open === p) { link.go(); return; }
  let next = neighbour(p, 1) || (p.next ? savedAs(p.next) : null);
  if (!next && p.next) {
    if (!navigator.onLine) { aloudAuto = false; toast("You're offline. The next page saves when you're back online."); return; }
    toast("Saving the next page…");
    next = await follow(p, 1, true);
  }
  if (!next) { aloudAuto = false; return; }
  await toLibrary();
  openPage(next.id);
}

// The block that piece `i` is in, and the first piece of a block.
const blockAt = (i) => aloud.map[i] ?? -1;
function moveAloud(d) {
  const b = blockAt(aloud.index) + d;
  const i = aloud.map.indexOf(b);
  if (i < 0) return;
  setAloud(aloud.state, i);
  speech.seek(i);
}

function setAloud(st, index) {
  const on = st === "playing" || st === "paused";
  // At the end, the clip stays "being read" while there's a next clip
  // to offer (1.4.0); otherwise the reading is over.
  const p = aloudPage();
  const ended = st === "ended" && !!(p && endLink(p));
  aloud.state = on ? st : ended ? "ended" : "stopped";
  if (index >= 0 || !on) aloud.index = index;
  const here = aloudHere();
  const btn = $("readerAloud");
  btn.setAttribute("aria-pressed", String(on && here));
  btn.setAttribute("aria-label", on && here ? "Stop reading aloud" : "Read aloud");
  $("aloudPlayer").hidden = !(on && here);
  $("aloudReadNext").hidden = !(ended && here);
  $("readerView").classList.toggle("aloud", here);
  if (here && state.open) readerFoot(C.reader.position());
  const play = $("aloudPlay");
  play.classList.toggle("paused", st === "paused");
  play.setAttribute("aria-label", st === "paused" ? "Play" : "Pause");
  const b = blockAt(aloud.index);
  $("aloudPrev").disabled = !on || b <= 0;
  $("aloudNext").disabled = !on || b >= (aloud.map[aloud.map.length - 1] ?? 0);
  if (state.open && state.open.id === aloud.key) C.reader.light(on ? b : -1);
  if (st === "playing") wentOnFrom = "";
  if (ended && st === "ended" && load(GO_ON_KEY, false) && wentOnFrom !== aloud.key) {
    wentOnFrom = aloud.key;
    setTimeout(() => { if (aloud.state === "ended" && aloud.key === wentOnFrom) readNext(); }, 800);
  }
  if (!on && !ended) aloud.key = "";
  showAloudBar();
  if (st === "error") toast("The phone's voice stopped. Try again, or pick another voice in Aa.");
}

// The bar along the bottom of the app while a clip is read aloud away
// from its page (1.4.0): pause or play, the clip's name (a tap opens
// it), and Stop; at the end, Read next.
function showAloudBar() {
  const bar = $("aloudBar");
  const p = aloudPage();
  const show = !!p && (aloudOn() || aloud.state === "ended") && !aloudHere();
  if (!show) {
    if (!bar.hidden && !bar.dataset.leaving) {
      bar.dataset.leaving = "1";
      document.body.classList.remove("aloud-bar-up", "aloud-docked");
      M.edgeOut(bar, nearEdge(bar)).then(() => { if (bar.dataset.leaving) { bar.hidden = true; delete bar.dataset.leaving; } });
    }
    return;
  }
  const ended = aloud.state === "ended";
  $("aloudBarTitle").textContent = p.title;
  bar.setAttribute("aria-label", (ended ? "Read to the end: " : aloud.state === "paused" ? "Paused: " : "Reading aloud: ") + p.title);
  $("aloudBarPlay").hidden = ended;
  $("aloudBarPlay").classList.toggle("paused", aloud.state === "paused");
  $("aloudBarPlay").setAttribute("aria-label", aloud.state === "paused" ? "Play" : "Pause");
  $("aloudBarNext").hidden = !ended;
  document.body.classList.add("aloud-bar-up");
  const coming = bar.hidden || bar.dataset.leaving;
  if (coming) { delete bar.dataset.leaving; bar.hidden = false; }
  placeAloudBar();
  if (coming) M.edgeIn(bar, nearEdge(bar));
}

// Which edge of the screen a floating bar is nearer, to come and go by.
function nearEdge(el) {
  const r = el.getBoundingClientRect();
  return r.top + r.height / 2 < innerHeight / 2 ? "top" : "bottom";
}

// Where the bar sits (1.4.1): a compact card you can drag anywhere. It
// snaps to the left or right edge when let go, and the side and height
// are remembered; until it's moved it sits at the bottom right, above
// the library's bottom field when that's what's on screen.
const ALOUD_BAR_KEY = "waypage.aloudBar";
function placeAloudBar() {
  const bar = $("aloudBar");
  if (bar.hidden) return;
  const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gutter")) || 16;
  const safe = parseFloat(getComputedStyle(bar).getPropertyValue("--safe-bottom")) || 0;
  const w = bar.offsetWidth, h = bar.offsetHeight;
  // Docked at the foot of the pinned sidebar (1.5.0), over Settings,
  // when the sidebar is what's beside it.
  const docked = pinned.matches && !document.querySelector("#readerView:not([hidden]), #settingsView:not([hidden])");
  bar.classList.toggle("docked", docked);
  document.body.classList.toggle("aloud-docked", docked);
  if (docked) {
    const settings = $("sidebar").querySelector(".side-settings");
    const foot = settings ? settings.getBoundingClientRect().top : innerHeight - gutter;
    bar.style.left = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--s-4")) + "px";
    bar.style.top = foot - h - 8 + "px";
    return;
  }
  const put = load(ALOUD_BAR_KEY, null);
  let left, top;
  if (put && typeof put.y === "number") {
    left = put.side === "left" ? gutter : innerWidth - gutter - w;
    top = Math.round(put.y * innerHeight);
  } else {
    const screen = document.querySelector(".screen:not([hidden]):not([data-leaving])");
    const lift = screen ? 0 : $("libraryView").querySelector(".save-bar").offsetHeight;
    left = innerWidth - gutter - w;
    top = innerHeight - lift - safe - 8 - h;
  }
  top = Math.max(gutter, Math.min(top, innerHeight - safe - 8 - h));
  bar.style.left = left + "px";
  bar.style.top = top + "px";
}
{
  const bar = $("aloudBar");
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    if (e.button || bar.classList.contains("docked")) return;
    const r = bar.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
  });
  // The moves are heard on the window: a quick drag leaves the card
  // before its first move event, and capturing the pointer on the card
  // would take the tap from its buttons.
  addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) { drag.moved = true; bar.classList.add("dragging"); }
    bar.style.left = drag.left + dx + "px";
    bar.style.top = drag.top + dy + "px";
  });
  const drop = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const was = drag;
    drag = null;
    if (!was.moved) return;
    bar.classList.remove("dragging");
    // A drag isn't a tap: the click that follows it does nothing.
    bar.dataset.dragged = "1";
    setTimeout(() => delete bar.dataset.dragged, 0);
    const r = bar.getBoundingClientRect();
    const side = r.left + r.width / 2 < innerWidth / 2 ? "left" : "right";
    store(ALOUD_BAR_KEY, { side, y: Math.max(0, Math.min(1, r.top / innerHeight)) });
    bar.classList.add("snapping");
    placeAloudBar();
    setTimeout(() => bar.classList.remove("snapping"), 400);
  };
  addEventListener("pointerup", drop);
  addEventListener("pointercancel", drop);
  addEventListener("click", (e) => { if (bar.dataset.dragged) { e.stopPropagation(); e.preventDefault(); } }, true);
}
$("aloudBarPlay").addEventListener("click", () => $("aloudPlay").click());
$("aloudBarStop").addEventListener("click", stopAloud);
$("aloudBarNext").addEventListener("click", readNext);
$("aloudReadNext").addEventListener("click", readNext);
$("aloudBarOpen").addEventListener("click", async () => {
  const p = aloudPage();
  if (!p) return;
  if (state.open === p) return;
  if (state.open) { await toLibrary(); }
  openPage(p.id);
});
addEventListener("resize", () => { if (!$("aloudBar").hidden) placeAloudBar(); });

speech.onProgress(({ key, index, state: st }) => {
  if (!key) return;
  const moved = key !== aloud.key;
  if (moved && !wentOn(key)) return;
  setAloud(st, index);
  if (moved) queueNext();
});
// Back from the lock screen: the reading may have moved on or ended
// while the page slept.
document.addEventListener("visibilitychange", async () => {
  if (document.hidden || !aloudOn()) return;
  const now = await speech.state();
  if (now.key && (now.key === aloud.key || wentOn(now.key))) {
    setAloud(now.state, now.index);
    queueNext();
  } else setAloud("stopped", -1);
  // Gone on to the next clip while the app was away: the reader turns to it.
  const p = openOnReturn && openOnReturn === aloud.key ? aloudPage() : null;
  openOnReturn = "";
  if (p && state.open && state.open.id !== p.id && !document.hidden) goTo(p, true);
});

$("readerAloud").hidden = !speech.available;
$("readerAloud").addEventListener("click", () => (aloudOn() && aloudHere() ? stopAloud() : startAloud()));
$("aloudPlay").addEventListener("click", () => {
  if (aloud.state === "playing") { setAloud("paused", aloud.index); speech.pause(); }
  else { setAloud("playing", aloud.index); speech.resume(); }
});
$("aloudPrev").addEventListener("click", () => moveAloud(-1));
$("aloudNext").addEventListener("click", () => moveAloud(1));

// Voices told apart (0.34.2): grouped by country, the best first, coded
// names ("en-us-x-iol-local") shown as Voice 1, 2… with what sets each
// apart. Google lists most voices twice, on the phone and online; the
// online twin is left out unless it's the only one or already picked.
function voiceOptions(list, saved) {
  const coded = (v) => /-x-|#|^[a-z]{2,3}[-_]/i.test(v.name);
  const twin = (v) => { const m = /^(.+-x-[a-z0-9]+)-(local|network)$/i.exec(v.name); return m ? m[1].toLowerCase() : ""; };
  const local = new Set(list.filter((v) => !v.online && twin(v)).map(twin));
  const kept = list.filter((v) => !(v.online && local.has(twin(v)) && v.id !== saved));
  const region = (v) => { try { return new Intl.Locale(v.lang.replace("_", "-")).region || ""; } catch (e) { return ""; } };
  const named = (code) => {
    for (const l of [navigator.language, "en"]) { try { return new Intl.DisplayNames([l], { type: "region" }).of(code); } catch (e) { /* next */ } }
    return code;
  };
  const groups = new Map();
  for (const v of kept) { const k = region(v); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); }
  const order = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length || a.localeCompare(b));
  const out = [];
  for (const k of order) {
    const vs = groups.get(k).sort((a, b) => (a.online - b.online) || ((b.quality || 0) - (a.quality || 0)) || coded(a) - coded(b));
    if (order.length > 1) out.push({ head: k ? named(k) : "Other" });
    let n = 0;
    for (const v of vs) {
      const name = /-language$/i.test(v.name) ? "Standard" : coded(v) ? "Voice " + ++n : v.name;
      const tags = [v.gender, (v.quality || 0) >= 400 ? "natural" : "", v.online ? "online" : ""].filter(Boolean);
      out.push({ value: v.id, label: [name, ...tags].join(" · ") });
    }
  }
  return out;
}

// In the Aa sheet: the voice for this page's language and the speed.
function aloudControls() {
  const p = state.open;
  const lang = primary(langOf(p));
  const name = (() => { try { return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(lang); } catch (e) { return lang; } })();
  const voiceRow = el("div", { class: "rc-row" }, el("span", { class: "rc-label" }, "Voice"), el("span", { class: "meta" }, "Looking…"));
  const note = el("p", { class: "footnote aloud-note" }, speech.background ? "Keeps reading with the screen off. Pause it from the lock screen." : p ? "Reads while this clip is open." : "");
  note.hidden = !note.textContent;
  speech.voices().then((all) => {
    const mine = all.filter((v) => primary(v.lang) === lang);
    if (!mine.length) {
      voiceRow.lastChild.replaceWith(el("span", { class: "meta" }, "Phone's default"));
      note.textContent = "No " + name + " voice on this phone. Add one in its text-to-speech settings, then come back.";
      note.hidden = false;
      return;
    }
    const saved = voiceFor(p);
    const options = [{ value: "", label: "Phone's default" }, ...voiceOptions(mine, saved)];
    voiceRow.lastChild.replaceWith(dropdown({ label: "Voice", cls: "field-pick font-pick voice-pick", options,
      value: options.some((o) => o.value === saved) ? saved : "",
      onpick: (v) => {
        const all = load(VOICE_KEY, {});
        if (v) all[lang] = v; else delete all[lang];
        store(VOICE_KEY, all);
        if (aloud.state !== "stopped" && state.open && aloud.key === state.open.id) startAloud(blockAt(aloud.index));
      } }));
  });
  const rate = clamp(Number(load(RATE_KEY, 1)) || 1, RATE_MIN, RATE_MAX);
  const shown = el("span", { class: "rc-value" }, rateText(rate));
  const speed = el("input", { class: "range", type: "range", min: RATE_MIN, max: RATE_MAX, step: 0.1, value: rate, "aria-label": "Speed",
    "aria-valuetext": rateText(rate),
    oninput: (e) => { const v = Number(e.target.value); shown.textContent = rateText(v); e.target.setAttribute("aria-valuetext", rateText(v)); },
    // Applied when the thumb is let go: a phone's voice restarts its sentence on each change.
    onchange: (e) => { const v = Number(e.target.value); store(RATE_KEY, v); if (aloud.state !== "stopped") speech.rate(v); } });
  speed.value = rate;
  const check = (key, text, note, restart = true) => {
    const input = el("input", { class: "switch", type: "checkbox", role: "switch", checked: !!load(key, false),
      onchange: () => {
        store(key, input.checked);
        if (key === GO_ON_KEY) queueNext();
        if (restart && aloud.state !== "stopped" && state.open && aloud.key === state.open.id) startAloud(blockAt(aloud.index));
      } });
    return el("label", { class: "rc-row switch-row" },
      el("span", { class: "choice-text" }, el("span", { class: "rc-label" }, text), el("span", { class: "choice-note" }, note)), input);
  };
  return el("div", { class: "aloud-controls" },
    voiceRow,
    el("div", { class: "rc-row" }, el("span", { class: "rc-label" }, "Speed", shown),
      el("div", { class: "stepper" }, speed)),
    check(FOOTNOTES_KEY, "Read footnotes", "The notes at the end, as part of the clip."),
    check(EDGES_KEY, "Skip headers and footers", "Just the body: no title, captions or page heads."),
    check(GO_ON_KEY, "Go on to the next clip", "At the end, the next chapter or the page it links to starts by itself.", false),
    note);
}
const rateText = (v) => (Math.round(v * 10) / 10) + "×";

// The same controls in the Aa sheet and in Settings. A change is applied
// at once and every copy on screen follows it in place, so focus stays put.
function seg(name, label, options, current, onpick, cls) {
  return el("div", { class: "seg" + (cls ? " " + cls : ""), role: "radiogroup", "aria-label": label },
    ...options.map((o) => el("label", { class: "seg-item" },
      el("input", { class: "visually-hidden", type: "radio", name, value: o.value, checked: o.value === current,
        onchange: () => onpick(o.value) }),
      el("span", { class: "seg-face", style: o.style || null }, o.swatch ? swatch(o.swatch, o.auto ? "auto" : "") : null, o.label, o.sample || null))));
}

const themeOptions = (list, short) => list.map((t) => ({ value: t.value, label: (short && t.short) || t.label, swatch: [t.value] }));

function slider(label, min, max, step, onvalue, pref) {
  return el("input", { class: "range", type: "range", min, max, step, "aria-label": label, "data-pref": pref,
    oninput: (e) => onvalue(Number(e.target.value)) });
}

const TEXT_PREFS = ["font", "hebrew", "size", "align", "spacing", "letters", "words", "paras"];
const prefsOf = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

let readingGroups = 0;
function readingControls(withTheme) {
  const r = readingPrefs();
  const id = "rc" + ++readingGroups;
  const label = (text, key) => el("span", { class: "rc-label" }, text, key ? el("span", { class: "rc-value", "data-value": key }) : null);
  const row = (text, control, key) => el("div", { class: "rc-row" }, label(text, key), control);
  const stack = (text, control) => el("div", { class: "rc-row stack" }, label(text), control);
  const nudge = (d) => setReading({ size: clamp(readingPrefs().size + d, SIZE_MIN, SIZE_MAX) });
  const part = (name, title, ...rows) => el("div", { class: "rc-part", "data-part": name },
    el("h2", { class: "overline" }, title), ...rows);
  // Fonts are drop-downs (0.34.0), each name set in its own face.
  const fontPick = (pref, label, options) => {
    const d = dropdown({ label, cls: "field-pick font-pick", options, value: r[pref], onpick: (v) => setReading({ [pref]: v }) });
    d.dataset.pref = pref;
    return d;
  };
  const layout = part("layout", "Layout",
    row("Show as", seg(id + "-layout", "Show as", [
      { value: "scroll", label: "Scroll" }, { value: "pages", label: "Pages" },
    ], r.layout, (v) => setReading({ layout: v }))),
    row("Margins", seg(id + "-margins", "Margins", [
      { value: "narrow", label: "Narrow" }, { value: "normal", label: "Normal" }, { value: "wide", label: "Wide" },
    ], r.margins, (v) => setReading({ margins: v }))),
    ...(brightSwitch(id) || []),
    // Big screens (1.5.0): two pages side by side, and the contents
    // beside the text.
    wide.matches ? stack("Pages on a wide window", seg(id + "-spread", "Pages on a wide window", [
      { value: "one", label: "One" }, { value: "two", label: "Two" }, { value: "auto", label: "Auto" },
    ], r.spread, (v) => setReading({ spread: v }))) : null,
    wide.matches ? el("label", { class: "rc-row switch-row" },
      el("span", { class: "choice-text" }, el("span", { class: "rc-label" }, "Contents beside the text"),
        el("span", { class: "choice-note" }, "On windows 1024 px and wider")),
      el("input", { class: "switch", type: "checkbox", role: "switch", "data-pref": "rail", checked: r.rail,
        onchange: (e) => setReading({ rail: e.target.checked }) })) : null,
    withTheme ? stack("Theme", seg(id + "-theme", "Theme",
      [{ value: "system", label: "Auto", swatch: autoSwatch(), auto: true }, ...themeOptions(THEMES)],
      state.theme, (v) => { setTheme(v); syncThemeInputs(); }, "themes scroll")) : null);
  const text = part("text", "Text",
    row("Font", fontPick("font", "Font",
      FONTS.map((f) => ({ value: f.value, label: f.label, style: "font-family: " + f.family + ", var(--sans)" })))),
    row("Hebrew", fontPick("hebrew", "Hebrew font",
      HEBREW.map((f) => ({ value: f.value, label: f.label,
        sample: f.family ? el("span", { class: "seg-sample", lang: "he", dir: "rtl", style: "font-family: " + f.family, "aria-hidden": "true" }, "עברית") : null })))),
    row("Text size", el("div", { class: "stepper" },
      el("button", { class: "step-btn small", type: "button", "data-step": "-1", "aria-label": "Smaller text", onclick: () => nudge(-1) }, "A"),
      slider("Text size", SIZE_MIN, SIZE_MAX, 1, (v) => setReading({ size: v }), "size"),
      el("button", { class: "step-btn large", type: "button", "data-step": "1", "aria-label": "Larger text", onclick: () => nudge(1) }, "A")), "size"),
    pinchSwitch(),
    row("Alignment", fontPick("align", "Alignment", ALIGNS)),
    // Spacing (1.19.0), headed on its own so the labels stay one word.
    el("h2", { class: "overline rc-sub" }, "Spacing"),
    row("Lines", el("div", { class: "stepper" },
      slider("Line spacing", SPACING_MIN, SPACING_MAX, 0.05, (v) => setReading({ spacing: v }), "spacing")), "spacing"),
    ...[["letters", "Letters", "Letter spacing"], ["words", "Words", "Word spacing"], ["paras", "Paragraphs", "Paragraph spacing"]].map(([k, name, aria]) =>
      row(name, el("div", { class: "stepper" },
        slider(aria, SPACES[k].min, SPACES[k].max, SPACES[k].step, (v) => setReading({ [k]: v }), k)), k)),
    el("button", { class: "btn-quiet reset", type: "button", onclick: () => setReading(prefsOf(READING_DEFAULT, TEXT_PREFS)) }, "Reset text"));
  const box = el("div", { class: "reading-controls" }, layout, text);
  syncReadingControls(box);
  requestAnimationFrame(() => box.querySelectorAll(".seg.scroll").forEach(showPicked));
  return box;
}

// A row that scrolls sideways opens with its picked item in view.
function showPicked(row) {
  const item = row.querySelector("input:checked");
  if (item) row.scrollLeft = item.parentElement.offsetLeft - (row.clientWidth - item.parentElement.offsetWidth) / 2;
}

function syncReadingControls(box) {
  const r = readingPrefs();
  const shown = {
    size: r.size + " px", spacing: r.spacing.toFixed(2),
    letters: r.letters ? (r.letters > 0 ? "+" : "") + r.letters.toFixed(2) + " em" : "Normal",
    words: r.words ? "+" + r.words.toFixed(2) + " em" : "Normal",
    paras: r.paras === 1 ? "Normal" : r.paras + "×",
  };
  for (const [k, text] of Object.entries(shown)) {
    const range = box.querySelector('.range[data-pref="' + k + '"]');
    range.value = r[k];
    range.setAttribute("aria-valuetext", k === "size" ? r.size + " pixels" : text);
    box.querySelector('[data-value="' + k + '"]').textContent = text;
  }
  box.querySelector('[data-step="-1"]').disabled = r.size <= SIZE_MIN;
  box.querySelector('[data-step="1"]').disabled = r.size >= SIZE_MAX;
  const rail = box.querySelector('[data-pref="rail"]');
  if (rail) rail.checked = r.rail;
  for (const k of ["layout", "margins", "spread"]) {
    box.querySelectorAll('input[name$="-' + k + '"]').forEach((i) => { i.checked = i.value === r[k]; });
  }
  box.querySelectorAll(".font-pick").forEach((d) => d.set(r[d.dataset.pref]));
  // Reset text leaves the layout as it is.
  box.querySelector(".reset").disabled = TEXT_PREFS.every((k) => r[k] === READING_DEFAULT[k]);
}

// The theme lives in two places (Aa and Settings); keep both radios true.
function syncThemeInputs() {
  document.querySelectorAll('input[name$="-theme"], input[name="' + THEME_KEY + '"]').forEach((i) => { i.checked = i.value === state.theme; });
}

// The reader's settings (0.34.0): Layout, Text and Read aloud, one at a
// time behind tabs, the last one opened coming back.
const SHEET_TAB_KEY = "waypage.sheetTab";
function readerSettings() {
  const box = readingControls(true);
  const parts = [...box.querySelectorAll(".rc-part")];
  if (speech.available) {
    const a = aloudControls();
    a.classList.add("rc-part");
    a.dataset.part = "aloud";
    a.prepend(el("h2", { class: "overline" }, "Read aloud"));
    box.append(a);
    parts.push(a);
  }
  const names = { layout: "Layout", text: "Text", aloud: "Read aloud" };
  let tab = load(SHEET_TAB_KEY, "text");
  if (!parts.some((x) => x.dataset.part === tab)) tab = "text";
  const show = (v) => {
    tab = v;
    store(SHEET_TAB_KEY, v);
    for (const x of parts) x.hidden = x.dataset.part !== v;
  };
  const tabs = seg("sheet-tab", "Settings", parts.map((x) => ({ value: x.dataset.part, label: names[x.dataset.part] })), tab, show, "sheet-tabs");
  show(tab);
  return el("div", { class: "reader-settings" }, tabs, box);
}

// ---- The reader's sheets ----
// "reading" (Aa) and "page" (tags, delete) share one sheet. Each is a
// history entry of its own, so Android's back closes it before the page.

const SHEETS = {
  reading: { button: "readerAa", label: "Reader settings", build: readerSettings },
  page: { button: "readerMore", label: "This clip", build: () => state.open.preview ? previewSheet(state.open) : pageSheet(state.open, "reader") },
  contents: { button: "readerContents", label: "Contents", build: contentsList },
  folder: { button: "readerFolder", label: "Clips in this collection", build: folderList },
  marks: { button: "readerMarks", label: "Highlights", build: () => marksView(state.open) },
  // From the text itself (1.14.0), with no button of their own.
  note: { label: "Note", build: () => noteSheet(noteNow) },
  link: { label: "Link", build: () => linkSheet(linkNow) },
};

function openSheet(kind, fromHistory) {
  if (state.sheet === kind || !state.open || !SHEETS[kind]) return;
  if (state.sheet) closeSheet(true);
  state.sheet = kind;
  const s = SHEETS[kind];
  $("readingBody").replaceChildren(s.build());
  $("readingSheet").setAttribute("aria-label", s.label);
  if (!fromHistory) history.pushState(readerState(state.open, kind), "");
  if (s.button) $(s.button).setAttribute("aria-expanded", "true");
  $("readerView").classList.remove("bar-away");
  $("sheetCatch").hidden = false;
  const sheet = $("readingSheet");
  sheet.hidden = false;
  // From 700 px the sheet is a panel under its button (1.5.0).
  if (wide.matches && s.button) {
    const at = $(s.button).getBoundingClientRect(), box = $("readerView").getBoundingClientRect();
    const left = at.left + at.width / 2 < box.left + box.width / 2;
    sheet.dataset.pop = left ? "start" : "end";
    sheet.style.top = at.bottom - box.top + 4 + "px";
    sheet.style.left = left ? Math.max(8, at.left - box.left) + "px" : "";
    sheet.style.right = left ? "" : Math.max(8, box.right - at.right) + "px";
    M.popFrom(sheet, at);
  } else {
    delete sheet.dataset.pop;
    sheet.style.top = sheet.style.left = sheet.style.right = "";
    M.rise(sheet);
  }
  const first = kind === "contents" || kind === "folder" ? $("readingSheet").querySelector("[aria-current]") || $("readingSheet").querySelector("button")
    : $("readingSheet").querySelector("button:not(:disabled), input:checked");
  if (first && kind !== "page") afterStart(() => { if (state.sheet === kind) first.focus({ preventScroll: true }); });
}

function closeSheet(now) {
  if (!state.sheet) return;
  const button = SHEETS[state.sheet].button ? $(SHEETS[state.sheet].button) : null;
  state.sheet = false;
  if (button) button.setAttribute("aria-expanded", "false");
  $("sheetCatch").hidden = true;
  const sheet = $("readingSheet");
  if (now) { sheet.hidden = true; return; }
  (sheet.dataset.pop && button ? M.popInto(sheet, button.getBoundingClientRect()) : M.sink(sheet, sheetDrop(sheet))).then(() => { if (!state.sheet) sheet.hidden = true; delete sheet.dataset.drop; });
  if (button) afterStart(() => button.focus({ preventScroll: true }));
}

// ---- Notes, links and jumps inside a clip (1.14.0) ----
// A note mark ([3]) opens its note over the page; a link to another page
// asks whether to open it or save it for later; a jump within the clip
// (its own contents, "see below") leaves a way back.
let noteNow = null, linkNow = null, jumpFrom = null;
function openNote(note) {
  noteNow = note;
  if (state.sheet === "note") { $("readingBody").replaceChildren(SHEETS.note.build()); return; }
  openSheet("note");
}
function noteSheet(n) {
  if (!n) return el("p", { class: "meta" }, "That note isn't here any more.");
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, n.label ? "Note " + n.label.replace(/^\[|\]$/g, "") : "Note")),
    el("p", { class: "note-text", dir: "auto" }, n.text),
    n.links.length ? el("div", { class: "group" }, ...n.links.map((l) => el("button", { class: "row", type: "button", onclick: () => openLink(l.href, l.text) },
      el("span", { class: "choice-text" },
        el("span", { class: "row-label accent", dir: "auto" }, l.text || hostOf(l.href)),
        el("span", { class: "choice-note" }, hostOf(l.href)))))) : null,
    el("div", { class: "group" }, menuRow("Go to the note", () => back().then(() => n.go()))));
}
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; } };
function openLink(href, text) {
  linkNow = { href, text };
  if (state.sheet === "link") { $("readingBody").replaceChildren(SHEETS.link.build()); return; }
  openSheet("link");
}
function linkSheet(l) {
  if (!l) return el("p", { class: "meta" }, "That link isn't here any more.");
  const saved = savedAs(l.href);
  const go = (f) => () => back().then(f);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, saved ? saved.title : l.text && l.text.length > 2 ? l.text : hostOf(l.href)),
      el("p", { class: "link-url" }, l.href)),
    el("div", { class: "group" },
      saved ? menuRow("Open the saved clip", go(() => openPage(saved.id))) : null,
      saved ? null : el("button", { class: "row", type: "button", onclick: go(() => saveLater(l.href)) },
        el("span", { class: "choice-text" },
          el("span", { class: "row-label accent" }, "Save for later"),
          el("span", { class: "choice-note" }, navigator.onLine ? "Into your library, to read offline" : "It saves when you're back online"))),
      menuRow("Open in the browser", go(() => C.platform.openOutside(l.href))),
      menuRow("Copy the link", go(() => copyText(l.href, "Link copied")))));
}
function jumped(spot) {
  if (!jumpFrom) jumpFrom = { spot, at: C.reader.position() };
  $("jumpBack").hidden = false;
}
$("jumpBack").addEventListener("click", () => {
  const from = jumpFrom;
  jumpFrom = null;
  $("jumpBack").hidden = true;
  if (from && state.open) C.reader.jump(from.at, from.spot);
});

// ---- Find in this clip (1.14.0) ----
// A bar over the reader's own: every match marked, Enter or the arrows
// for the next and previous, the count between. Its own history entry,
// so Back closes it before the clip.
let findTimer = 0, findCount = 0, findAt = -1;
function openFind() {
  if (!state.open) return;
  if (state.finding) { $("findInput").focus(); return; }
  if (state.sheet) { back().then(openFind); return; }
  state.finding = true;
  history.pushState({ ...readerState(state.open), find: true }, "");
  $("findBar").hidden = false;
  $("readerView").classList.remove("bar-away");
  $("findInput").value = "";
  paintFind();
  $("findInput").focus();
}
function closeFind(now) {
  clearTimeout(findTimer);
  if (state.open || now) C.reader.clearFind();
  findCount = 0;
  findAt = -1;
  $("findBar").hidden = true;
  if (!state.finding) return;
  state.finding = false;
  if (!now) history.back();
}
function paintFind() {
  const q = $("findInput").value.trim();
  $("findCount").textContent = !q ? "" : findCount ? (findAt + 1) + " of " + findCount : "None";
  $("findPrev").disabled = $("findNext").disabled = findCount < 2;
}
function runFind() {
  findCount = C.reader.find($("findInput").value);
  findAt = findCount ? C.reader.findGo(0) : -1;
  paintFind();
}
function stepFind(d) {
  if (!findCount) return;
  findAt = C.reader.findGo(findAt + d);
  paintFind();
}
$("findInput").addEventListener("input", () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 250); });
$("findInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); clearTimeout(findTimer); if ($("findInput").value.trim() && !findCount) runFind(); else stepFind(e.shiftKey ? -1 : 1); }
  else if (e.key === "Escape") { e.preventDefault(); closeFind(); }
});
$("findPrev").addEventListener("click", () => stepFind(-1));
$("findNext").addEventListener("click", () => stepFind(1));
$("findDone").addEventListener("click", () => closeFind());

// A sheet from the bottom drags down to close (1.11.0, touch only): it
// follows the finger, the dimming behind it follows the sheet, and let
// go past a third of its height, or with a flick, it goes; otherwise it
// springs back. A drag that starts in a list scrolled down scrolls it.
const sheetDrop = (sheet) => +(sheet.dataset.drop || 0);
function dragToClose(sheet, catcher, canDrag, close) {
  let d = null;
  sheet.addEventListener("touchstart", (e) => {
    d = null;
    if (e.touches.length !== 1 || !canDrag() || M.reduced()) return;
    if (e.target.closest("input, textarea, select, [role=slider], .dropdown-menu")) return;
    let scroller = null;
    for (let n = e.target; n && n !== sheet; n = n.parentElement) if (n.scrollHeight > n.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(n).overflowY)) { scroller = n; break; }
    const t = e.touches[0];
    d = { x: t.clientX, y: t.clientY, on: false, dy: 0, scroller, last: [{ y: t.clientY, t: e.timeStamp }] };
  }, { passive: true });
  sheet.addEventListener("touchmove", (e) => {
    if (!d) return;
    const t = e.touches[0], dy = t.clientY - d.y, dx = t.clientX - d.x;
    if (!d.on) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { d = null; return; }
      if (dy < 8) { if (dy < -8) d = null; return; }
      if (d.scroller && d.scroller.scrollTop > 0) { d = null; return; }
      d.on = true;
      d.h = sheet.offsetHeight;
      sheet.getAnimations().forEach((a) => a.cancel());
    }
    e.preventDefault();
    d.dy = Math.max(0, dy);
    sheet.style.transform = "translateY(" + d.dy + "px)";
    if (catcher) catcher.style.opacity = String(Math.max(0, 1 - d.dy / d.h));
    d.last.push({ y: t.clientY, t: e.timeStamp });
    if (d.last.length > 5) d.last.shift();
  }, { passive: false });
  const end = () => {
    if (!d || !d.on) { d = null; return; }
    const a = d.last[0], b = d.last[d.last.length - 1], v = (b.y - a.y) / Math.max(1, b.t - a.t);
    const dy = d.dy;
    d = null;
    sheet.style.transform = "";
    if (dy > sheet.offsetHeight / 3 || v > 0.5) { sheet.dataset.drop = dy; close(); return; }
    M.settle(sheet, dy);
    if (catcher) M.dim(catcher, true);
  };
  sheet.addEventListener("touchend", end);
  sheet.addEventListener("touchcancel", end);
}

// ---- Image viewer ----
// A tapped image, full screen, in its own history entry so back closes
// it. It grows from where it sat in the page (a fade under reduced
// motion), shows the preview at once and the full image when online.

const V = { s: 1, x: 0, y: 0, drag: 0, pointers: new Map(), start: null, tap: null };
const MAX_ZOOM = 5;

function openImage(info) {
  if (state.image || !state.open) return;
  state.image = true;
  history.pushState(readerState(state.open, undefined, true), "");
  const viewer = $("imageViewer"), img = $("viewerImg");
  V.list = C.reader.images();
  V.at = V.list.findIndex((x) => (x.currentSrc || x.src) === info.src);
  viewImage(info);
  viewer.hidden = false;
  $("readerView").classList.remove("bar-away");
  afterStart(() => { if (state.image) $("viewerClose").focus({ preventScroll: true }); });
  V.from = info.rect;
  const grow = () => {
    const small = imageSpot(info.rect);
    if (M.reduced() || !small) return M.appear(viewer);
    // The backdrop darkens with the picture's growing, on its spring.
    const t = M.timing("sheet");
    viewer.animate([{ opacity: 0 }, { opacity: 1 }], { ...t, pseudoElement: "::before" });
    img.animate([{ transform: small }, { transform: "none" }], t);
  };
  if (img.complete && img.naturalWidth) grow(); else img.addEventListener("load", grow, { once: true });
}

// Where the viewer's picture would sit to cover the one in the page.
function imageSpot(rect) {
  const r = $("viewerImg").getBoundingClientRect();
  if (!rect || !rect.width || !r.width) return null;
  const k = rect.width / r.width;
  const dx = rect.left + rect.width / 2 - (r.left + r.width / 2);
  const dy = rect.top + rect.height / 2 - (r.top + r.height / 2);
  return "translate(" + dx + "px," + dy + "px) scale(" + k + ")";
}

function viewImage(info) {
  const img = $("viewerImg");
  img.alt = info.alt || info.caption || "";
  img.src = info.src;
  $("viewerCaption").textContent = info.caption;
  $("viewerCaption").hidden = !info.caption;
  if (info.full && info.full !== info.src && navigator.onLine) {
    const probe = new Image();
    probe.onload = () => { if (state.image && img.getAttribute("src") === info.src) img.src = info.full; };
    probe.src = info.full;
  }
  resetView(false);
  const many = V.list && V.list.length > 1 && V.at >= 0;
  $("viewerPrev").hidden = $("viewerNext").hidden = !many;
  if (many) { $("viewerPrev").disabled = V.at === 0; $("viewerNext").disabled = V.at === V.list.length - 1; }
}
// The page's other pictures, by arrow buttons and keys (1.5.0).
function stepImage(d) {
  if (!state.image || !V.list || V.at < 0) return;
  const to = V.at + d;
  if (to < 0 || to >= V.list.length) return;
  V.at = to;
  viewImage(C.reader.imageInfo(V.list[to]));
  M.edgeIn($("viewerImg"), d > 0 ? "right" : "left");
}
function zoomStep(d) {
  const r = $("viewerStage").getBoundingClientRect();
  zoomAt(d > 0 ? V.s * 1.5 : V.s / 1.5, r.left + r.width / 2, r.top + r.height / 2);
  paintView(true);
}

function closeImage() {
  if (!state.image) return;
  state.image = false;
  const viewer = $("imageViewer"), img = $("viewerImg");
  // It shrinks back into the picture in the page, from wherever a drag
  // or a zoom left it (1.11.0).
  const now = V.list && V.at >= 0 && V.list[V.at] && V.list[V.at].isConnected ? C.reader.imageInfo(V.list[V.at]).rect : V.from;
  const small = M.reduced() ? null : (img.style.transform = "", imageSpot(now));
  const at = "translate(" + V.x + "px," + (V.y + V.drag) + "px) scale(" + V.s + ")";
  const gone = small
    ? Promise.all([img.animate([{ transform: at }, { transform: small }], { ...M.timing("sheet"), fill: "forwards" }).finished,
      viewer.animate([{ opacity: viewer.style.getPropertyValue("--dim") || 1 }, { opacity: 0 }], { ...M.timing("sheet"), pseudoElement: "::before", fill: "forwards" }).finished]).catch(() => {})
    : M.vanish(viewer);
  gone.then(() => {
    img.getAnimations().forEach((a) => a.cancel());
    viewer.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    if (state.image) return;
    viewer.hidden = true;
    $("viewerImg").removeAttribute("src");
    resetView(false);
  });
  afterStart(() => $("readerFrame").focus({ preventScroll: true }));
}

function paintView(settle) {
  const img = $("viewerImg");
  img.classList.toggle("settle", !!settle);
  img.style.transform = "translate(" + V.x + "px," + (V.y + V.drag) + "px) scale(" + V.s + ")";
  $("imageViewer").classList.toggle("zoomed", V.s > 1);
  const fade = V.s === 1 ? Math.max(0.3, 1 - Math.abs(V.drag) / 400) : 1;
  // The backdrop lightens as a drag down takes the picture away.
  if (fade < 1) $("imageViewer").style.setProperty("--dim", fade); else $("imageViewer").style.removeProperty("--dim");
}
function resetView(settle) {
  V.s = 1; V.x = 0; V.y = 0; V.drag = 0;
  paintView(settle);
}
// Keeps a zoomed image covering the stage: no panning off into black.
function clampView() {
  const stage = $("viewerStage").getBoundingClientRect();
  const img = $("viewerImg");
  const w = img.offsetWidth * V.s, h = img.offsetHeight * V.s;
  const mx = Math.max(0, (w - stage.width) / 2), my = Math.max(0, (h - stage.height) / 2);
  V.x = Math.min(mx, Math.max(-mx, V.x));
  V.y = Math.min(my, Math.max(-my, V.y));
}
// Zooms to `s` keeping the point under (px, py) (stage coordinates) still.
function zoomAt(s, px, py) {
  const stage = $("viewerStage").getBoundingClientRect();
  const cx = px - stage.left - stage.width / 2, cy = py - stage.top - stage.height / 2;
  s = Math.min(MAX_ZOOM, Math.max(1, s));
  const k = s / V.s;
  V.x = cx - (cx - V.x) * k;
  V.y = cy - (cy - V.y) * k;
  V.s = s;
  if (s === 1) { V.x = 0; V.y = 0; }
  clampView();
}

const stage = $("viewerStage");
const pts = () => [...V.pointers.values()];
stage.addEventListener("pointerdown", (e) => {
  stage.setPointerCapture(e.pointerId);
  V.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = pts();
  if (p.length === 2) {
    V.start = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), s: V.s, x: V.x, y: V.y, mx: (p[0].x + p[1].x) / 2, my: (p[0].y + p[1].y) / 2, pinch: true };
    V.drag = 0;
  } else if (p.length === 1) {
    V.start = { px: e.clientX, py: e.clientY, x: V.x, y: V.y, t: Date.now(), moved: false };
  }
});
stage.addEventListener("pointermove", (e) => {
  if (!V.pointers.has(e.pointerId) || !V.start) return;
  V.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const p = pts();
  if (V.start.pinch && p.length === 2) {
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
    V.x = V.start.x + (mx - V.start.mx); V.y = V.start.y + (my - V.start.my);
    zoomAt(V.start.s * d / V.start.d, mx, my);
    paintView(false);
    return;
  }
  if (V.start.pinch) return;
  const dx = e.clientX - V.start.px, dy = e.clientY - V.start.py;
  if (Math.hypot(dx, dy) > 6) V.start.moved = true;
  if (V.s > 1) { V.x = V.start.x + dx; V.y = V.start.y + dy; clampView(); }
  else V.drag = dy;
  paintView(false);
});
const lift = (e) => {
  if (!V.pointers.has(e.pointerId)) return;
  V.pointers.delete(e.pointerId);
  const start = V.start;
  if (V.pointers.size) { if (start && start.pinch) V.start = null; return; }
  V.start = null;
  if (!start || start.pinch) { clampView(); paintView(true); return; }
  if (V.drag) {
    const far = Math.abs(V.drag) > 120 || Math.abs(V.drag) / Math.max(1, Date.now() - start.t) > 0.6;
    if (far) { history.back(); return; }
    V.drag = 0;
    paintView(true);
    return;
  }
  if (start.moved || e.type === "pointercancel") return;
  // A double tap zooms in on that spot, or back out.
  const now = Date.now();
  if (V.tap && now - V.tap.t < 300 && Math.hypot(e.clientX - V.tap.x, e.clientY - V.tap.y) < 30) {
    V.tap = null;
    if (V.s > 1) resetView(true); else { zoomAt(2.5, e.clientX, e.clientY); paintView(true); }
    return;
  }
  V.tap = { t: now, x: e.clientX, y: e.clientY };
};
stage.addEventListener("pointerup", lift);
stage.addEventListener("pointercancel", lift);
stage.addEventListener("wheel", (e) => {
  e.preventDefault();
  zoomAt(V.s * Math.exp(-e.deltaY / 300), e.clientX, e.clientY);
  paintView(false);
}, { passive: false });
$("viewerClose").addEventListener("click", () => history.back());
$("viewerPrev").addEventListener("click", () => stepImage(-1));
$("viewerNext").addEventListener("click", () => stepImage(1));
$("viewerZoomIn").addEventListener("click", () => zoomStep(1));
$("viewerZoomOut").addEventListener("click", () => zoomStep(-1));
