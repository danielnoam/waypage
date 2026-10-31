// Waypage's shell (1.45.11 split): finding things in the library.
// Search over titles and text, the filters, the sort orders and the
// dropdown control they share. See app.js for how the parts share.
// ---- Search ----
// Titles, sites, tags and folders as you type; the pages' words after a
// pause. Matching ignores case, accents, Hebrew niqqud and Arabic
// harakat, and every word typed has to be there.

const fold = (s) => String(s || "").normalize("NFKD").replace(/[\p{M}\u0640]/gu, "").toLocaleLowerCase();
const terms = () => fold(state.query).split(/\s+/).filter(Boolean);
// id → { text, folded } once read; filled the first time a search needs it.
const texts = new Map();
let reading = null, searching = false;

function metaMatch(p, ts) {
  const hay = fold([p.title, siteOf(p), p.folder, ...(p.tags || []).map((t) => "#" + t)].join(" "));
  return ts.every((t) => hay.includes(t));
}

// The sentence the words were found in, trimmed to a line or two.
function snippet(p, ts) {
  const got = texts.get(p.id);
  if (!got) return null;
  if (!ts.every((t) => got.folded.includes(t))) return null;
  const lines = got.text.split("\n");
  for (const line of lines) {
    const f = fold(line);
    if (!f.includes(ts[0])) continue;
    const sentences = line.split(/(?<=[.!?\u05C3\u06D4])\s+/);
    const s = sentences.find((x) => fold(x).includes(ts[0])) || line;
    if (s.length <= 160) return s;
    const at = Math.max(0, fold(s).indexOf(ts[0]) - 60);
    return (at ? "…" : "") + s.slice(at, at + 150).trim() + "…";
  }
  return null;
}

// Reads every page's text that isn't in memory yet: text.txt, or for a
// page saved before 0.16.0 its page.html, writing text.txt for next time.
function readTexts() {
  if (reading) return reading;
  const todo = state.pages.filter((p) => !texts.has(p.id));
  if (!todo.length) return Promise.resolve();
  reading = (async () => {
    let done = 0;
    for (const p of todo) {
      let text = await C.store.readText(p.id);
      if (text == null) {
        try {
          const html = await C.store.readPage(p.id);
          text = html ? C.save.plainText(new DOMParser().parseFromString(html, "text/html").body) : "";
          if (html) C.store.writeText(p.id, text).catch(() => {});
        } catch (e) { text = ""; }
      }
      texts.set(p.id, { text, folded: fold(text) });
      done++;
      if (todo.length > 10 && done % 5 === 0) searchNote("Searching the text of your clips · " + done + " of " + todo.length);
    }
  })().finally(() => { reading = null; });
  return reading;
}

function searchNote(text) {
  const note = $("searchNote");
  note.textContent = text || "";
  note.hidden = !text;
}

let searchTimer = null;
function onSearch() {
  state.query = $("librarySearch").value;
  $("searchClear").hidden = !state.query;
  renderLibrary();
  clearTimeout(searchTimer);
  if (!terms().length) { searching = false; searchNote(""); return; }
  searching = true;
  searchTimer = setTimeout(async () => {
    await readTexts();
    searching = false;
    searchNote("");
    if (terms().length) renderLibrary();
  }, 300);
}

function clearSearch() {
  $("librarySearch").value = "";
  onSearch();
}

// Search shows when its button is tapped, and stays while something is
// typed in it; empty, it goes away again (0.27.10).
let searchOpen = false;
function paintSearch() {
  const on = !!state.pages.length && (searchOpen || !!state.query);
  $("searchBox").hidden = !on;
  $("searchBtn").setAttribute("aria-expanded", String(on));
  $("searchBtn").classList.toggle("on", on);
}
function openSearch() {
  searchOpen = true;
  paintSearch();
  window.scrollTo({ top: 0, behavior: M.reduced() ? "auto" : "smooth" });
  $("librarySearch").focus({ preventScroll: true });
}
function closeSearch() {
  if (state.query) clearSearch();
  searchOpen = false;
  paintSearch();
}

// ---- Filters and order ----

const unread = (p) => !p.finished && !(p.at > 0.02);
function shown(p) {
  const f = state.filter;
  if (f === "unread") return unread(p);
  if (f === "finished") return !!p.finished;
  if (f === "favourites") return !!p.fav;
  if (f === "highlights") return !!(p.marks && p.marks.length);
  if (f.startsWith("#")) return (p.tags || []).some((t) => sameTag(t, f.slice(1)));
  return true;
}

const FILTER_NAMES = { unread: "Unread", finished: "Finished", favourites: "Favourites", highlights: "Highlighted" };
const filterName = () => FILTER_NAMES[state.filter] || state.filter;

function setFilter(f) {
  state.filter = f;
  store(FILTER_KEY, f);
  renderLibrary();
}

// Show and Order (0.28.0), over everything the library lists: one
// dropdown each, so a long tag list waits in a menu instead of a row of
// capsules. Rebuilt only when what they show changes, so a save landing
// doesn't close a menu that's open.
function renderTools() {
  const tags = allTags();
  const sig = [state.pages.length > 0, state.filter, state.sort, state.pages.some((p) => p.marks && p.marks.length), tags.join("\u0000")].join("|");
  if (libTools.dataset.sig === sig) return;
  libTools.dataset.sig = sig;
  libTools.hidden = !state.pages.length;
  if (libTools.hidden) return;
  fill(libTools, dropdown({
    label: "Show", cls: "start show-wrap" + (state.filter === "all" ? "" : " on"),
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
    options: [{ value: "all", label: "All clips" }, { value: "unread", label: "Unread" }, { value: "finished", label: "Finished" }, { value: "favourites", label: "Favourites" },
      ...(state.pages.some((p) => p.marks && p.marks.length) || state.filter === "highlights" ? [{ value: "highlights", label: "Highlighted" }] : []),
      ...(tags.length ? [{ head: "Tags" }, ...tags.map((t) => ({ value: "#" + t, label: "#" + t }))] : [])],
    value: state.filter,
    onpick: setFilter,
  }), el("div", { class: "lib-tools-end" }, sortControl()));
}


const SORTS = [["saved", "Newest saved"], ["read", "Last read"], ["length", "Longest"], ["site", "Site"]];
const BY = {
  saved: (a, b) => (b.savedAt || 0) - (a.savedAt || 0),
  read: (a, b) => (b.readAt || 0) - (a.readAt || 0) || (b.savedAt || 0) - (a.savedAt || 0),
  length: (a, b) => (b.minutes || 0) - (a.minutes || 0),
  site: (a, b) => siteOf(a).localeCompare(siteOf(b)) || a.title.localeCompare(b.title),
};
const sorted = (list) => [...list].sort(BY[state.sort] || BY.saved);

function sortControl() {
  return dropdown({
    label: "Order", cls: "end sort-wrap",
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/></svg>',
    options: SORTS.map(([value, label]) => ({ value, label })),
    value: BY[state.sort] ? state.sort : "saved",
    onpick: (v) => { state.sort = v; store(SORT_KEY, v); renderLibrary(); },
  });
}

// Our own dropdown (0.26.0), in place of the system's <select>: a
// button showing the choice, and a small menu that arrives under it.
// Arrow keys move through it, Escape or a tap outside puts it away.
function dropdown(o) {
  let value = o.value;
  const face = el("span", { class: "dropdown-face" });
  const btn = el("button", { class: "dropdown-btn", type: "button", "aria-haspopup": "listbox", "aria-expanded": "false" }, face);
  if (o.icon) btn.insertAdjacentHTML("afterbegin", o.icon);
  btn.insertAdjacentHTML("beforeend", '<svg class="dropdown-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>');
  const wrap = el("div", { class: "dropdown " + (o.cls || "") }, btn);
  const show = () => {
    const at = o.options.find((x) => !x.head && x.value === value) || (o.placeholder ? { label: o.placeholder } : o.options[0]);
    const empty = !!o.placeholder && at.label === o.placeholder;
    face.textContent = at.label;
    face.style.cssText = at.style || "";
    face.classList.toggle("unset", empty);
    btn.setAttribute("aria-label", empty ? o.label : o.label + ": " + at.label);
  };
  let menu = null;
  const outside = (e) => { if (!wrap.contains(e.target)) close(false); };
  function close(focus) {
    if (!menu) return;
    const m = menu;
    menu = null;
    m.style.pointerEvents = "none";
    btn.setAttribute("aria-expanded", "false");
    const g = wrap.closest(".group");
    document.removeEventListener("pointerdown", outside, true);
    M.popInto(m, btn.getBoundingClientRect()).then(() => { m.remove(); if (g && !menu) g.classList.remove("menu-open"); });
    if (focus) btn.focus();
  }
  // In a sheet or other scrolling box (0.34.1), a menu fits inside it:
  // it opens upward when there's more room above and scrolls in itself,
  // so the box under it doesn't scroll and stay moved. On the page, a
  // menu opened low on the screen scrolls the page up instead.
  function fit(m) {
    let box = null;
    for (let p = wrap.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(p).overflowY)) { box = p.getBoundingClientRect(); break; }
    }
    if (!box) { m.scrollIntoView({ block: "nearest" }); return false; }
    const b = btn.getBoundingClientRect(), gap = 8, need = m.scrollHeight;
    const below = Math.min(box.bottom, innerHeight) - b.bottom - gap;
    const above = b.top - Math.max(box.top, 0) - gap;
    const up = need > below && above > below;
    m.classList.toggle("up", up);
    if (need > (up ? above : below)) m.style.maxHeight = Math.max(up ? above : below, 132) + "px";
    return up;
  }
  function open() {
    const nodes = o.options.map((x) => {
      if (x.head) return el("div", { class: "dropdown-head", role: "presentation" }, x.head);
      const check = el("span", { class: "dropdown-check", "aria-hidden": "true" });
      if (x.value === value) check.innerHTML = CHECK;
      return el("button", { class: "dropdown-item", type: "button", role: "option", "aria-selected": String(x.value === value),
        onclick: () => {
          const changed = x.value !== value;
          value = x.value;
          show();
          // The new choice pops into the face (1.48.0).
          if (changed) { face.classList.remove("changed"); void face.offsetWidth; face.classList.add("changed"); }
          close(true);
          if (changed) o.onpick(x.value);
        } },
        el("span", { class: "dropdown-text", dir: "auto", style: x.style || null }, x.label, x.sample || null), check);
    });
    const items = nodes.filter((x) => x.tagName === "BUTTON");
    menu = el("div", { class: "dropdown-menu", role: "listbox", "aria-label": o.label }, ...nodes);
    menu.addEventListener("keydown", (e) => {
      const i = items.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(true); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus(); }
      else if (e.key === "Home" || e.key === "End") { e.preventDefault(); items[e.key === "Home" ? 0 : items.length - 1].focus(); }
      else if (e.key === "Tab") close(false);
    });
    wrap.append(menu);
    btn.setAttribute("aria-expanded", "true");
    const g = wrap.closest(".group");
    if (g) g.classList.add("menu-open");
    fit(menu);
    M.popFrom(menu, btn.getBoundingClientRect());
    document.addEventListener("pointerdown", outside, true);
    (items.find((b) => b.getAttribute("aria-selected") === "true") || items[0]).focus({ preventScroll: true });
  }
  btn.addEventListener("click", () => (menu ? close(true) : open()));
  btn.addEventListener("keydown", (e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !menu) { e.preventDefault(); open(); } });
  show();
  wrap.set = (v) => { value = v; show(); };
  return wrap;
}
