// Waypage's shell (1.14.0): the Highlights place, the
// sidebar, big screens, keys, gestures and a feed's sheets. See app.js
// for how the parts share.
// ---- Every highlight in one place (1.8.0) ----
// A place beside Library and Feeds: each clip's highlights under its
// title, the clip highlighted in last first, with a search over the
// words, the notes and the titles, and chips by colour (1.42.0). A tap
// opens the clip at the highlight.
let marksQuery = "", marksColors = [], marksTags = [];
// How the picked tags match (2026-11): any of them, all of them, or none.
const TAG_MATCH_KEY = "waypage.marksMatch";
let marksHow = ["any", "all", "none"].includes(load(TAG_MATCH_KEY, "any")) ? load(TAG_MATCH_KEY, "any") : "any";
const tagMatches = (m) => {
  if (!marksTags.length) return true;
  const has = (x) => (m.tags || []).some((y) => sameTag(x, y));
  return marksHow === "all" ? marksTags.every(has) : marksHow === "none" ? !marksTags.some(has) : marksTags.some(has);
};
// Colours (2026-11) are picked like tags: several at once, a highlight having
// one colour, so any of them or none of them.
const COLOR_MATCH_KEY = "waypage.marksColorMatch";
let marksColorHow = load(COLOR_MATCH_KEY, "any") === "none" ? "none" : "any";
const colorOk = (m) => !marksColors.length || marksColors.includes(colorOf(m)) === (marksColorHow !== "none");
let marksHead = null;
// Highlights come a screen's worth of clips at a time, the rest as the
// end nears (1.28.4): two thousand at once took the phone two seconds.
const MARKS_FIRST = 25, MARKS_MORE = 40;
let marksUpTo = MARKS_FIRST, marksList = "", marksSeen = null;
const marksMatch = (p, m, q) => colorOk(m) && tagMatches(m)
  && (!q || [m.text, m.note || "", p.title, ...(m.tags || [])].some((t) => t.toLowerCase().includes(q)));
// Drawings (2026-11) are listed with each clip's highlights; a search
// finds them by the clip's title, and a colour picked shows highlights alone.
const hasDrawings = (p) => !p.note && !!((p.ink && Object.keys(p.ink).length) || (p.drawn && p.drawn.length));
// Comment bubbles (2026-11) go through the same colour, tag and word filters as highlights.
const hasNotes = (p) => !!((p.noted && p.noted.length) || (p.ink && Object.values(p.ink).some((l) => Array.isArray(l) && l.some((s) => s && s.t === "n"))) || (state.open === p && inkReady() && C.ink.notes().length));
function marksShown() {
  const q = marksQuery.trim().toLowerCase();
  return state.pages.filter((p) => (p.marks || []).length || hasDrawings(p) || hasNotes(p))
    .map((p) => {
      const ink = !marksColors.length && !marksTags.length && hasDrawings(p) && (!q || p.title.toLowerCase().includes(q)) ? inkGroups(p) : [];
      const notes = hasNotes(p) ? inkNotes(p).filter((m) => marksMatch(p, m, q)) : [];
      return { p, ink, notes, last: Math.max(p.inkAt || 0, ...(p.marks || []).map((m) => m.at || 0)), list: (p.marks || []).filter((m) => marksMatch(p, m, q)) };
    })
    .filter((c) => c.list.length || c.ink.length || c.notes.length)
    .sort((a, b) => b.last - a.last);
}
// Past five drawings, a clip's list stops with Show all (a PDF can have hundreds of pages drawn on).
const INK_FIRST = 5;
const inkOpen = new Set();
function goToMark(p, id) {
  const m = (p.marks || []).find((x) => x.id === id);
  if (state.open === p && !$("readerView").hidden) { if (m) jumpToMark(p, m, true); return; }
  markAfterOpen = id;
  openPage(p.id);
}
const MATCH_WORDS = {
  any: { label: t("Any of these tags"), note: t("Has at least one"), count: t("any of {n} tags") },
  all: { label: t("All of these tags"), note: t("Has every one"), count: t("all of {n} tags") },
  none: { label: t("None of these tags"), note: t("Has none of them"), count: t("none of {n} tags") },
};
const COLOR_MATCH = {
  any: { label: t("Any of these colours"), note: t("Has one of them"), count: t("any of {n} colours") },
  none: { label: t("None of these colours"), note: t("Has none of them"), count: t("none of {n} colours") },
};
// One menu for both filters: "tags" (any, all or none) or "colors" (any or none).
let matchKind = "tags";
const matchBtnOf = () => document.querySelector('.hl-match[data-kind="' + matchKind + '"]');
function closeMatchMenu(away) {
  const pop = $("matchPop"), btn = matchBtnOf();
  removeEventListener("pointerdown", outsideMatch, true);
  if (!pop) return;
  pop.removeAttribute("id");
  pop.style.pointerEvents = "none";
  if (btn) { btn.setAttribute("aria-expanded", "false"); M.popOut(pop, btn.getBoundingClientRect()).then(() => pop.remove()); } else pop.remove();
  if (!away && btn) btn.focus();
}
function outsideMatch(e) {
  const pop = $("matchPop"), btn = matchBtnOf();
  if (pop && !pop.contains(e.target) && !(btn && btn.contains(e.target))) closeMatchMenu(true);
}
function openMatchMenu(kind = "tags") {
  if ($("matchPop")) { const same = matchKind === kind; closeMatchMenu(); if (same) return; }
  matchKind = kind;
  const btn = matchBtnOf();
  if (!btn || btn.disabled) return;
  const colors = kind === "colors";
  const words = colors ? COLOR_MATCH : MATCH_WORDS, now = colors ? marksColorHow : marksHow;
  const pop = el("div", { class: "pop-menu", id: "matchPop", role: "menu", "aria-label": colors ? t("How colours match") : t("How tags match") },
    el("p", { class: "pop-note pop-head" }, t("Show highlights with")),
    ...Object.entries(words).map(([how, w]) => {
      const on = how === now;
      const b = el("button", { class: "pop-item", type: "button", role: "menuitemradio", "aria-checked": String(on), tabindex: "-1",
        onclick: () => {
          if (colors) { marksColorHow = how; store(COLOR_MATCH_KEY, how); } else { marksHow = how; store(TAG_MATCH_KEY, how); }
          marksUpTo = MARKS_FIRST; closeMatchMenu(); renderHighlights();
        } },
        el("span", { class: "pop-icon", "aria-hidden": "true" }), el("span", { class: "pop-label" }, w.label, el("span", { class: "pop-sub" }, w.note)));
      if (on) b.firstChild.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
      return b;
    }));
  const at = btn.getBoundingClientRect();
  pop.style.top = at.bottom + 4 + "px";
  if (document.dir === "rtl") pop.style.left = Math.max(8, at.left) + "px";
  else pop.style.right = Math.max(8, innerWidth - at.right) + "px";
  $("highlights").append(pop);
  btn.setAttribute("aria-expanded", "true");
  M.popFrom(pop, at);
  const items = () => [...pop.querySelectorAll(".pop-item")];
  (items().find((b) => b.getAttribute("aria-checked") === "true") || items()[0]).focus();
  pop.addEventListener("keydown", (e) => {
    const all = items(), i = all.indexOf(document.activeElement);
    const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
    if (to !== undefined) { e.preventDefault(); all[(to + all.length) % all.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); closeMatchMenu(); }
    else if (e.key === "Tab") closeMatchMenu(true);
  });
  setTimeout(() => addEventListener("pointerdown", outsideMatch, true));
}
function markColorRow(list) {
  const used = MARK_COLORS.filter((c) => list.some((m) => colorOf(m) === c));
  if (used.length < 2) { marksColors = []; return null; }
  const toggle = (c) => { marksColors = marksColors.includes(c) ? marksColors.filter((x) => x !== c) : [...marksColors, c]; marksUpTo = MARKS_FIRST; renderHighlights(); };
  const btn = el("button", { class: "icon-btn hl-match" + (marksColorHow !== "any" ? " changed" : ""), type: "button", "data-kind": "colors", "aria-haspopup": "menu", "aria-expanded": "false",
    "aria-label": t("How colours match"), onclick: () => openMatchMenu("colors") });
  btn.disabled = !marksColors.length;
  btn.append(svgIcon("filter", 22));
  return el("div", { class: "hl-tags-row" },
    el("div", { class: "chips mark-filters", role: "group", "aria-label": t("Show highlights by colour") },
      el("button", { class: "chip" + (!marksColors.length ? " on" : ""), type: "button", "aria-pressed": String(!marksColors.length), onclick: () => { marksColors = []; marksUpTo = MARKS_FIRST; renderHighlights(); } }, t("All")),
      ...used.map((c) => { const on = marksColors.includes(c);
        return el("button", { class: "chip" + (on ? " on" : ""), type: "button", "data-color": c, "aria-pressed": String(on), onclick: () => toggle(c) }, swatchDot(c), markName(c)); })),
    btn);
}
function renderHighlights() {
  const root = $("highlights");
  const total = state.pages.reduce((n, p) => n + (p.marks || []).length, 0);
  const drawnIn = state.pages.filter(hasDrawings);
  const drawings = drawnIn.reduce((n, p) => n + inkTotal(p), 0);
  const everyNote = state.pages.filter(hasNotes).flatMap((p) => inkNotes(p));
  if (!marksHead) {
    const input = el("input", { type: "search", placeholder: t("Search your highlights"), "aria-label": t("Search your highlights"),
      autocomplete: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
    input.addEventListener("input", () => { marksQuery = input.value; renderHighlights(); });
    const box = el("div", { class: "search hl-search", role: "search" }, input);
    box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
    marksHead = el("div", { class: "hl-head" }, box,
      el("div", { class: "hl-line" },
        el("p", { class: "meta hl-count", role: "status" }),
        el("button", { class: "btn-text hl-copy", type: "button", onclick: () => {
          const text = marksShown().map((c) => C.backup.marksMarkdown({ ...c.p, marks: c.list }, c.notes)).join("\n");
          copyText(text, t("Highlights copied"));
        } }, t("Copy all"))),
      el("div", { class: "hl-colors" }),
      el("div", { class: "hl-tags" }));
  }
  const everyMark = [...state.pages.flatMap((p) => p.marks || []), ...everyNote];
  marksColors = marksColors.filter((c) => everyMark.some((m) => colorOf(m) === c));
  fill(marksHead.querySelector(".hl-colors"), markColorRow(everyMark));
  const usedTags = allMarkTags();
  marksTags = marksTags.filter((x) => usedTags.some((y) => sameTag(x, y)));
  const pickTag = (x) => {
    marksTags = marksTags.some((y) => sameTag(x, y)) ? marksTags.filter((y) => !sameTag(x, y)) : [...marksTags, x];
    marksUpTo = MARKS_FIRST;
    renderHighlights();
  };
  const matchBtn = el("button", { class: "icon-btn hl-match" + (marksHow !== "any" ? " changed" : ""), type: "button", "aria-haspopup": "menu", "aria-expanded": "false",
    "aria-label": t("How tags match"), onclick: () => openMatchMenu("tags") });
  matchBtn.dataset.kind = "tags";
  matchBtn.disabled = !marksTags.length;
  matchBtn.append(svgIcon("filter", 22));
  fill(marksHead.querySelector(".hl-tags"), usedTags.length ? el("div", { class: "hl-tags-row" },
    el("div", { class: "chips", role: "group", "aria-label": t("Show highlights by tag") },
      el("button", { class: "chip" + (!marksTags.length ? " on" : ""), type: "button", "aria-pressed": String(!marksTags.length), onclick: () => { marksTags = []; marksUpTo = MARKS_FIRST; renderHighlights(); } }, t("All tags")),
      ...usedTags.map((x) => { const on = marksTags.some((y) => sameTag(x, y));
        return el("button", { class: "chip" + (on ? " on" : ""), type: "button", "data-tag": x, "aria-pressed": String(on), dir: "auto", onclick: () => pickTag(x) }, "#" + x); })),
    matchBtn) : null);
  const clips = marksShown();
  const shown = clips.reduce((n, c) => n + c.list.length, 0), shownNotes = clips.reduce((n, c) => n + c.notes.length, 0);
  if (marksQuery !== marksList) { marksList = marksQuery; marksUpTo = MARKS_FIRST; }
  const more = clips.length > marksUpTo;
  marksHead.hidden = !total && !drawings && !everyNote.length;
  const hl = (n) => tn(n, "1 highlight", "{n} highlights");
  marksHead.querySelector(".hl-count").textContent = marksQuery.trim() || marksColors.length || marksTags.length
    ? t("{hl} found", { hl: [shown || !shownNotes ? hl(shown) : null, shownNotes ? noteWord(shownNotes) : null].filter(Boolean).join(" · ") }) + (marksTags.length && (marksTags.length > 1 || marksHow === "none") ? " · " + MATCH_WORDS[marksHow].count.replace("{n}", marksTags.length) : "") + (marksColors.length && (marksColors.length > 1 || marksColorHow === "none") ? " · " + COLOR_MATCH[marksColorHow].count.replace("{n}", marksColors.length) : "")
    : t("{what} in {clips}", { what: [total || (!drawings && !everyNote.length) ? hl(total) : null, everyNote.length ? noteWord(everyNote.length) : null, drawings ? inkWord(drawings) : null].filter(Boolean).join(" · "), clips: countLine(clips.length) });
  marksHead.querySelector(".hl-copy").hidden = !shown && !shownNotes;
  const nodes = clips.slice(0, marksUpTo).map(({ p, list, ink, notes }) => {
    const rows = list.map((m) => ({ at: m.page ? m.page : m.block || 0, row: el("li", { class: "mark-item", "data-mark": p.id + "|" + m.id },
      el("button", { class: "row mark-row", type: "button", "aria-label": t("{slice}, in {title}", { slice: m.text.slice(0, 120), title: p.title }), onclick: () => (state.markPick ? tapMark(p.id + "|" + m.id) : goToMark(p, m.id)) },
        el("span", { class: "mark-quote", "data-c": colorOf(m), dir: "auto" }, m.text),
        m.note ? el("span", { class: "mark-note", dir: "auto" }, m.note) : null,
        markTagsLine(m)),
      el("span", { class: "pick", "aria-hidden": "true" })) }));
    const all = inkOpen.has(p.id);
    for (const nt of notes) rows.push({ at: inkOrder(nt) + 0.25, row: noteRow(p, nt, () => inkNoteGo(p, nt), () => inkNoteGo(p, nt), p.title) });
    for (const g of all ? ink : ink.slice(0, INK_FIRST)) rows.push({ at: inkOrder(g) + 0.5, row: inkRow(p, g, () => inkGoTo(p, g)) });
    rows.sort((a, b) => a.at - b.at);
    const more = !all && ink.length > INK_FIRST
      ? el("li", { class: "mark-item" }, el("button", { class: "row hl-more", type: "button", onclick: () => { inkOpen.add(p.id); renderHighlights(); } },
        ink[0].page ? t("Show all {n} pages", { n: ink.length }) : t("Show all {n} drawings", { n: ink.length })))
      : null;
    return el("section", { class: "hl-clip", "data-key": "hl:" + p.id },
      el("button", { class: "hl-title", type: "button", onclick: () => openPage(p.id) },
        el("span", { class: "hl-name", dir: "auto" }, p.title),
        el("span", { class: "meta" }, siteOf(p))),
      el("ol", { class: "group marks-rows" }, ...rows.map((r) => r.row), more));
  });
  if (!total && !drawings && !everyNote.length) {
    nodes.push(el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("No highlights yet")),
      el("p", { class: "empty-text" }, t("Select words in a clip and tap Mark, or Draw. Every highlight and drawing in your library gathers here."))));
  } else if (!clips.length) nodes.push(el("p", { class: "empty-text hl-none" }, t("No highlights match that.")));
  if (more) nodes.push(el("div", { class: "lib-more", "aria-hidden": "true" }));
  // The search field stays put, so typing in it keeps its focus.
  if (marksHead.parentNode !== root) root.replaceChildren(marksHead, el("div", { class: "hl-list" }));
  fill(root.querySelector(".hl-list"), ...nodes);
  paintMarkPicks();
  if (more) {
    if (!marksSeen) marksSeen = new IntersectionObserver((hits) => {
      if (!hits.some((h) => h.isIntersecting) || $("highlights").hidden) return;
      marksUpTo += MARKS_MORE;
      renderHighlights();
    }, { rootMargin: "1500px 0px" });
    marksSeen.disconnect();
    marksSeen.observe(nodes[nodes.length - 1]);
  }
}

// ---- Editing tags and colours, picking highlights (2026-11) ----
// Holding a tag chip, a colour chip or a highlight (or right-clicking one)
// opens what it can do: rename or take away a tag everywhere, give a colour
// your own label or remove it, or start picking highlights to tag or delete
// them together. A tag or colour is changed on every highlight and comment
// bubble that has it; a file's own bubbles take it when the file is opened
// (app-ink.js noteSummaryApply).
let markEdit = null; // { tag } or { color }: what the open sheet is about
const dedupeTags = (list) => list.reduce((out, x) => (out.some((y) => sameTag(x, y)) ? out : [...out, x]), []);
// Each holder of a tag and a colour: a highlight, or a comment bubble.
function eachMarkHolder(cb) {
  const now = Date.now();
  for (const p of state.pages) {
    for (const m of p.marks || []) cb({ p, tags: m.tags || [], color: colorOf(m), key: p.id + "|" + m.id,
      setTags: (to) => { if (to.length) m.tags = to; else delete m.tags; m.at = now; },
      setColor: (c) => setMarkColor(m, c) });
    eachNoteHolder(p, (h) => cb({ ...h, p,
      setTags: (to) => { h.setTags(to); p.inkAt = now; }, setColor: (c) => { h.setColor(c); p.inkAt = now; } }));
  }
}
async function markSaved() {
  if (state.open) paintMarks(state.open);
  await C.store.writeIndex(state.pages);
  syncSoon();
  renderHighlights();
}
function markTagUse(tag) {
  let hl = 0;
  const clips = new Set();
  eachMarkHolder((h) => { if (h.tags.some((x) => sameTag(x, tag))) { hl++; clips.add(h.p.id); } });
  return t("On {hl} in {clips}", { hl: tn(hl, "1 highlight", "{n} highlights"), clips: countLine(clips.size) });
}
// A tag renamed on every highlight; to a name another tag has, the two become one.
async function renameMarkTag(from, to) {
  const name = cleanTag(to);
  if (!name) return null;
  const into = allMarkTags().find((x) => sameTag(x, name) && !sameTag(x, from)) || name;
  eachMarkHolder((h) => { if (h.tags.some((x) => sameTag(x, from))) h.setTags(dedupeTags(h.tags.map((x) => (sameTag(x, from) ? into : x)))); });
  marksTags = dedupeTags(marksTags.map((x) => (sameTag(x, from) ? into : x)));
  await markSaved();
  return into;
}
// Off every highlight; the highlights stay. Undo puts it back where it was.
async function deleteMarkTag(tag) {
  const was = new Map();
  eachMarkHolder((h) => { if (h.tags.some((x) => sameTag(x, tag))) { was.set(h.key, h.tags.slice()); h.setTags(h.tags.filter((x) => !sameTag(x, tag))); } });
  await markSaved();
  toast(t("Deleted #{tag}", { tag }), t("Undo"), async () => {
    eachMarkHolder((h) => { if (was.has(h.key)) h.setTags(was.get(h.key)); });
    await markSaved();
  });
}
// A colour taken off: its highlights turn yellow and stay. Undo turns them back.
async function removeMarkColor(c) {
  const had = new Set();
  eachMarkHolder((h) => { if (h.color === c) { had.add(h.key); h.setColor("yellow"); } });
  marksColors = marksColors.filter((x) => x !== c);
  await markSaved();
  toast(t("Colour removed. {n} are yellow.", { n: tn(had.size, "1 highlight", "{n} highlights") }), t("Undo"), async () => {
    eachMarkHolder((h) => { if (had.has(h.key)) h.setColor(c); });
    await markSaved();
  });
}
function markTagSheet() {
  const tag = markEdit.tag;
  const input = el("input", { class: "tag-input", type: "text", "aria-label": t("Name"), maxlength: "32", enterkeyhint: "done", autocapitalize: "off", spellcheck: "false", dir: "auto" });
  input.value = tag;
  const note = el("p", { class: "footnote accent", hidden: true });
  const go = el("button", { class: "btn-primary tag-save", type: "button", disabled: true });
  const into = () => {
    const name = cleanTag(input.value);
    return { name, other: name && allMarkTags().find((x) => sameTag(x, name) && !sameTag(x, tag)) };
  };
  const paint = () => {
    const { name, other } = into();
    go.disabled = !name || name === tag;
    go.textContent = other ? t("Merge into #{tag}", { tag: other }) : t("Rename");
    note.hidden = !other;
    if (other) note.textContent = t("#{tag} is already a tag. The two become one, with every highlight of both.", { tag: other });
  };
  const save = async () => {
    if (go.disabled) return;
    const { other } = into();
    const now = await renameMarkTag(tag, input.value);
    history.back();
    toast(other ? t("Merged into #{tag}", { tag: now }) : t("Renamed to #{tag}", { tag: now }));
  };
  input.addEventListener("input", paint);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  go.addEventListener("click", save);
  paint();
  return el("div", { class: "page-controls" },
    el("h2", { class: "menu-title", dir: "auto" }, "#" + tag),
    el("p", { class: "meta tag-use" }, markTagUse(tag)),
    el("p", { class: "overline" }, t("Name")), input, note, go,
    el("div", { class: "group" },
      el("button", { class: "row", type: "button", onclick: () => { marksTags = [tag]; marksUpTo = MARKS_FIRST; history.back(); renderHighlights(); } },
        el("span", { class: "row-label accent" }, t("Show its highlights"))),
      el("button", { class: "row", type: "button", onclick: async () => { history.back(); await deleteMarkTag(tag); } },
        el("span", { class: "row-label warn" }, t("Delete tag")), el("span", { class: "row-value" }, t("Highlights stay")))));
}
function markColorSheet() {
  const c = markEdit.color;
  const input = el("input", { class: "tag-input", type: "text", "aria-label": t("Label"), maxlength: "24", enterkeyhint: "done", autocapitalize: "sentences", dir: "auto" });
  input.value = markName(c);
  const go = el("button", { class: "btn-primary tag-save", type: "button", disabled: true }, t("Rename"));
  const label = () => input.value.trim().replace(/\s+/g, " ");
  const paint = () => { go.disabled = !label() || label() === markName(c); };
  const keep = (name) => {
    const all = markLabels();
    if (!name || name === MARK_NAMES[c]) delete all[c]; else all[c] = name;
    store(MARK_LABELS_KEY, all);
    history.back();
    renderHighlights();
  };
  input.addEventListener("input", paint);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !go.disabled) { e.preventDefault(); keep(label()); } });
  go.addEventListener("click", () => keep(label()));
  const custom = !!markLabels()[c];
  let n = 0;
  eachMarkHolder((h) => { if (h.color === c) n++; });
  return el("div", { class: "page-controls" },
    el("h2", { class: "menu-title", dir: "auto" }, swatchDot(c), " ", markName(c)),
    el("p", { class: "meta tag-use" }, tn(n, "1 highlight", "{n} highlights")),
    el("p", { class: "overline" }, t("Label")), input,
    el("p", { class: "footnote" }, t("Your label shows wherever the colour's name does. It stays on this device.")), go,
    el("div", { class: "group" },
      custom ? el("button", { class: "row", type: "button", onclick: () => keep("") }, el("span", { class: "row-label accent" }, t("Back to {name}", { name: MARK_NAMES[c] }))) : null,
      c !== "yellow" ? el("button", { class: "row", type: "button", onclick: async () => { history.back(); await removeMarkColor(c); } },
        el("span", { class: "row-label warn" }, t("Remove colour")), el("span", { class: "row-value" }, t("Highlights turn yellow"))) : null));
}

// ---- Picking highlights ----
let lastMarkTap = null;
const markKeys = () => marksShown().flatMap((c) => c.list.map((m) => c.p.id + "|" + m.id));
function pickedMarks() {
  if (!state.markPick) return [];
  const out = [];
  for (const key of state.markPick) {
    const at = key.indexOf("|");
    const p = state.pages.find((x) => x.id === key.slice(0, at));
    const m = p && (p.marks || []).find((x) => x.id === key.slice(at + 1));
    if (m) out.push({ p, m });
  }
  return out;
}
function startMarkPick(keys) {
  if (state.markPick || state.select || state.feedPick) return;
  state.markPick = new Set(keys || []);
  lastMarkTap = keys && keys.length ? keys[0] : null;
  history.pushState({ view: "markPick" }, "");
  document.body.classList.add("selecting", "picking-marks");
  $("selectHead").hidden = false;
  $("selectBar").hidden = false;
  M.edgeIn($("selectHead"), "top");
  M.edgeIn($("selectBar"), "bottom");
  closeMatchMenu(true);
  paintMarkPicks();
  $("selectCancel").focus({ preventScroll: true });
}
function endMarkPick() {
  if (!state.markPick) return;
  state.markPick = null;
  document.body.classList.remove("selecting", "picking-marks");
  for (const [id, edge] of [["selectHead", "top"], ["selectBar", "bottom"]]) M.edgeOut($(id), edge).then(() => { if (!state.select && !state.feedPick && !state.markPick) $(id).hidden = true; });
  paintMarkPicks();
}
function tapMark(key) {
  const rows = [...$("highlights").querySelectorAll("[data-mark]")].map((n) => n.dataset.mark);
  if (shiftTap && lastMarkTap && rows.includes(lastMarkTap) && rows.includes(key)) {
    const a = rows.indexOf(lastMarkTap), b = rows.indexOf(key);
    for (const k of rows.slice(Math.min(a, b), Math.max(a, b) + 1)) state.markPick.add(k);
  } else state.markPick.has(key) ? state.markPick.delete(key) : state.markPick.add(key);
  lastMarkTap = key;
  paintMarkPicks();
}
// Select all picks every highlight the filters show, drawn yet or not.
function pickAllMarks(only) {
  const all = markKeys();
  const every = all.length && all.every((k) => state.markPick.has(k));
  for (const k of all) every && !only ? state.markPick.delete(k) : state.markPick.add(k);
  paintMarkPicks();
}
function paintMarkPicks() {
  const root = $("highlights");
  const on = !!state.markPick;
  for (const row of root.querySelectorAll("[data-mark]")) {
    const isPicked = on && state.markPick.has(row.dataset.mark);
    row.classList.toggle("picked", isPicked);
    const b = row.querySelector(".mark-row");
    if (on) b.setAttribute("aria-pressed", String(isPicked)); else b.removeAttribute("aria-pressed");
  }
  if (!on) return;
  const n = state.markPick.size, all = markKeys();
  $("selectCount").textContent = n ? tn(n, "1 highlight picked", "{n} highlights picked") : t("Pick highlights");
  $("selectAll").textContent = all.length && all.every((k) => state.markPick.has(k)) ? t("Pick none") : t("Select all");
  $("selectMore").hidden = true;
  for (const id of ["selTags", "selDelete"]) $(id).disabled = !n;
}
async function deleteMarkPicked() {
  const list = pickedMarks();
  if (!list.length) return;
  const gone = new Map();
  for (const { p, m } of list) gone.set(p, [...(gone.get(p) || []), m]);
  for (const [p, ms] of gone) { p.marks = (p.marks || []).filter((x) => !ms.includes(x)); if (!p.marks.length) delete p.marks; }
  history.back();
  await markSaved();
  renderLibrary();
  updateWidgets();
  toast(list.length === 1 ? t("Highlight removed") : t("{n} highlights removed", { n: list.length }), t("Undo"), async () => {
    for (const [p, ms] of gone) { p.marks = [...(p.marks || []), ...ms].sort(byPlace); }
    await markSaved();
    renderLibrary();
    updateWidgets();
  });
}
// Tags for every picked highlight: a tag on all of them is on, one on some
// shows how many; a tap puts it on all of them, or takes it off all.
function markPickTagsSheet() {
  const box = el("div", { class: "page-controls" });
  const draw = () => {
    const list = pickedMarks().map((x) => x.m), n = list.length;
    const on = (x) => list.filter((m) => (m.tags || []).some((y) => sameTag(y, x))).length;
    const write = async (change) => {
      const now = Date.now();
      for (const m of list) { change(m); if (m.tags && !m.tags.length) delete m.tags; m.at = now; }
      await markSaved();
      draw();
    };
    const add = (raw) => {
      const x = cleanTag(raw);
      if (!x) return;
      const name = allMarkTags().find((y) => sameTag(y, x)) || x;
      write((m) => { m.tags = withTags(m.tags, [name]); }).then(() => box.querySelector(".tag-input").focus({ preventScroll: true }));
    };
    const input = el("input", { class: "tag-input", type: "text", placeholder: t("New tag"), "aria-label": t("New tag"), maxlength: "32", enterkeyhint: "done", autocapitalize: "off", dir: "auto" });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(input.value); } });
    const tags = allMarkTags();
    fill(box,
      el("h2", { class: "menu-title" }, tn(n, "Tags for 1 highlight", "Tags for {n} highlights")),
      tags.length ? el("div", { class: "chips" }, ...tags.map((x) => {
        const k = on(x), all = k === n;
        return el("button", { class: "chip" + (all ? " on" : k ? " some" : ""), type: "button", "aria-pressed": all ? "true" : k ? "mixed" : "false", dir: "auto",
          "aria-label": all ? i18n.t("{tag}, on all, remove", { tag: x }) : k ? i18n.t("{tag}, on {k} of {n}, add to all", { tag: x, k, n }) : i18n.t("{tag}, add", { tag: x }),
          onclick: () => (all ? write((m) => { m.tags = (m.tags || []).filter((y) => !sameTag(y, x)); }) : add(x)) },
        x, k && !all ? el("span", { class: "chip-n" }, k + "/" + n) : null);
      })) : null,
      input,
      el("button", { class: "btn-primary menu-done", type: "button", onclick: () => history.back() }, t("Done")));
  };
  draw();
  return box;
}
addEventListener("keydown", (e) => {
  if (!state.markPick || state.menu || e.defaultPrevented) return;
  if (e.target.closest && e.target.closest("input, textarea, [contenteditable]")) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); pickAllMarks(true); }
  else if (e.key === "Delete" && state.markPick.size) { e.preventDefault(); deleteMarkPicked(); }
  else if (e.key === "Escape") { e.preventDefault(); history.back(); }
});

// ---- Holding in Highlights ----
// A hold (or right-click) on a tag or colour chip opens its sheet; on a
// highlight it starts picking with that one picked, and while picking it picks.
function holdMarks(root) {
  let timer = null, start = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const target = (e) => e.target.closest("[data-tag], [data-color], .mark-item[data-mark]");
  const open = (node) => {
    if (navigator.vibrate) navigator.vibrate(10);
    if (node.dataset.mark) { if (!state.markPick) startMarkPick([node.dataset.mark]); else tapMark(node.dataset.mark); return; }
    if (state.markPick || state.menu) return;
    closeMatchMenu(true);
    markEdit = node.dataset.tag ? { tag: node.dataset.tag } : { color: node.dataset.color };
    openMenu(node.dataset.tag ? "markTag" : "markColor");
  };
  root.addEventListener("pointerdown", (e) => {
    fired = false;
    const node = e.button === 0 && target(e);
    if (!node) return;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => { timer = null; fired = true; open(node); }, 480);
  });
  root.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(t, cancel);
  root.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener("contextmenu", (e) => {
    const node = target(e);
    if (!node) return;
    e.preventDefault();
    cancel();
    if (!fired) { fired = true; open(node); }
  });
}

// ---- Reading (1.39.0) ----
// The reading stats as a place: a week, month or year of time read and
// heard, a bar a day (a month in a year), the totals under them, days in
// a row, and the clips you spent most time on. Every device's counts
// added up (stats.js). All time (2026-11) is everything since counting
// began: every day is kept, so nothing in it is cut short.
const SPAN_KEY = "waypage.readingSpan";
const SPANS = { week: t("Week"), month: t("Month"), year: t("Year"), all: t("All time") };
let readSpan = SPANS[load(SPAN_KEY, "week")] ? load(SPAN_KEY, "week") : "week";
let readBack = 0; // how many weeks, months or years before this one
const dayAt = (k) => new Date(k + "T12:00:00");
const keyOf = (d) => C.stats.dayKey(d.getTime());
// The first day of the week where you are (Sunday in Israel, Monday in
// most of Europe), from the browser when it says.
function weekStart() {
  try {
    const l = new Intl.Locale(navigator.language);
    const w = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo;
    if (w && w.firstDay) return w.firstDay % 7;
  } catch (e) { /* Monday */ }
  return 1;
}
function readRange(span = readSpan, back = readBack) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (span === "all") {
    const from = C.stats.dayKey(C.stats.since());
    return { from, to: keyOf(now), title: t("Since {toLocaleDateString}", { toLocaleDateString: dayAt(from).toLocaleDateString(i18n.lang, { day: "numeric", month: "long", year: "numeric" }) }), now: null, all: true };
  }
  if (span === "week") {
    const a = new Date(now);
    a.setDate(a.getDate() - ((a.getDay() - weekStart() + 7) % 7) - 7 * back);
    const b = new Date(a);
    b.setDate(b.getDate() + 6);
    const opts = { day: "numeric", month: a.getMonth() === b.getMonth() ? "long" : "short" };
    if (b.getFullYear() !== now.getFullYear()) opts.year = "numeric";
    const f = new Intl.DateTimeFormat(undefined, opts);
    const title = f.formatRange ? f.formatRange(a, b) : f.format(a) + " – " + f.format(b);
    return { from: keyOf(a), to: keyOf(b), title, now: back === 0 ? t("This week") : back === 1 ? t("Last week") : null };
  }
  if (span === "month") {
    const a = new Date(now.getFullYear(), now.getMonth() - back, 1, 12);
    const b = new Date(a.getFullYear(), a.getMonth() + 1, 0, 12);
    return { from: keyOf(a), to: keyOf(b), title: a.toLocaleDateString(i18n.lang, { month: "long", year: "numeric" }), now: back === 0 ? t("This month") : null };
  }
  const y = now.getFullYear() - back;
  return { from: y + "-01-01", to: y + "-12-31", title: String(y), now: back === 0 ? t("This year") : null };
}
// The days in a range. All time goes over the days there are: days()
// walks every day and stops at 400.
const readDays = (range) => (range.all
  ? Object.entries(C.stats.totals().days).filter(([k]) => k >= range.from && k <= range.to).map(([key, d]) => ({ key, ...d }))
  : C.stats.days(range.from, range.to));
// All time: a month each, at least six, or a year each past two years.
function allBars(range, days) {
  const today = C.stats.dayKey(Date.now());
  const y0 = Number(range.from.slice(0, 4)), m0 = Number(range.from.slice(5, 7)) - 1;
  const y1 = Number(today.slice(0, 4)), m1 = Number(today.slice(5, 7)) - 1;
  const months = (y1 - y0) * 12 + m1 - m0 + 1;
  if (months > 24) {
    const years = [];
    for (let y = y0; y <= y1; y++) years.push({ read: 0, aloud: 0, label: String(y), name: String(y), today: y === y1, future: false });
    for (const d of days) { const b = years[Number(d.key.slice(0, 4)) - y0]; if (b) { b.read += d.readMs; b.aloud += d.aloudMs; } }
    return Object.assign(years, { unit: "year" });
  }
  const bars = [], at = {};
  const first = new Date(y1, m1 - Math.max(6, months) + 1, 1, 12);
  for (let i = 0, n = Math.max(6, months); i < n; i++) {
    const t = new Date(first.getFullYear(), first.getMonth() + i, 1, 12);
    const k = keyOf(t).slice(0, 7);
    at[k] = bars.length;
    // Months before counting began are left empty, not drawn as none read.
    bars.push({ read: 0, aloud: 0, today: i === n - 1, future: k < range.from.slice(0, 7),
      label: n <= 12 ? t.toLocaleDateString(i18n.lang, { month: "narrow" }) : i === 0 || t.getMonth() === 0 ? String(t.getFullYear()) : "",
      name: t.toLocaleDateString(i18n.lang, { month: "long", year: "numeric" }) });
  }
  for (const d of days) { const b = bars[at[d.key.slice(0, 7)]]; if (b) { b.read += d.readMs; b.aloud += d.aloudMs; } }
  return Object.assign(bars, { unit: "month", dense: bars.length > 12 });
}
// The bars: a day each, or in a year a month each.
function readBars(range, days = readDays(range)) {
  const today = C.stats.dayKey(Date.now());
  if (range.all) return allBars(range, days);
  if (readSpan !== "year") {
    return days.map((d, i) => {
      const t = dayAt(d.key);
      const label = readSpan === "week" ? t.toLocaleDateString(i18n.lang, { weekday: "narrow" })
        : (i % 7 === 0 ? String(t.getDate()) : "");
      return { read: d.readMs, aloud: d.aloudMs, label, today: d.key === today, future: d.key > today,
        name: t.toLocaleDateString(i18n.lang, { weekday: "long", day: "numeric", month: "long" }) };
    });
  }
  const months = [];
  for (let m = 0; m < 12; m++) months.push({ read: 0, aloud: 0, label: new Date(2000, m, 1).toLocaleDateString(i18n.lang, { month: "narrow" }),
    name: new Date(2000, m, 1).toLocaleDateString(i18n.lang, { month: "long" }), today: false, future: false });
  const thisMonth = today.slice(0, 7);
  for (const d of days) { const m = Number(d.key.slice(5, 7)) - 1; months[m].read += d.readMs; months[m].aloud += d.aloudMs; }
  months.forEach((m, i) => { const k = range.from.slice(0, 4) + "-" + String(i + 1).padStart(2, "0"); m.today = k === thisMonth; m.future = k > thisMonth; });
  return Object.assign(months, { unit: "month" });
}
// A top worth drawing a line at: 15, 30 or 60 minutes, then whole hours.
function niceMax(ms) {
  const m = Math.max(1, ms / 60000);
  for (const s of [15, 30, 60, 90, 120]) if (m <= s) return s * 60000;
  return Math.ceil(m / 60) * 3600000;
}
function readChart(bars) {
  const top = niceMax(Math.max(...bars.map((b) => b.read + b.aloud)));
  const col = (b) => {
    const h = (v) => (v > 0 ? Math.max(2, (v / top) * 100) : 0);
    const c = el("div", { class: "rs-col" + (b.today ? " today" : "") + (b.future ? " future" : "") },
      el("div", { class: "rs-stack" },
        b.aloud ? el("span", { class: "rs-aloud", style: "height:" + h(b.aloud) + "%" }) : null,
        b.read ? el("span", { class: "rs-read", style: "height:" + h(b.read) + "%" }) : null,
        !b.read && !b.aloud && !b.future ? el("span", { class: "rs-none" }) : null),
      el("span", { class: "rs-day", "aria-hidden": "true" }, b.label));
    c.title = b.name + ": " + (b.read + b.aloud >= 60000 ? spanText(b.read + b.aloud) : "nothing");
    return c;
  };
  const said = bars.filter((b) => b.read + b.aloud >= 60000).map((b) => b.name + " " + spanText(b.read + b.aloud)).join(", ");
  return el("div", { class: "rs-chart rs-" + readSpan + (bars.dense ? " rs-dense" : ""), role: "img", "aria-label": said ? ({ year: t("Time a year: {said}", { said }), month: t("Time a month: {said}", { said }) }[bars.unit] || t("Time a day: {said}", { said })) : ({ all: t("No reading yet"), year: t("No reading this year"), month: t("No reading this month") }[readSpan] || t("No reading this week")) },
    el("span", { class: "rs-top meta" }, spanText(top)),
    el("div", { class: "rs-cols" }, ...bars.map(col)));
}
function readFigure(n, label) {
  return el("div", { class: "rs-fig" }, el("b", null, n.toLocaleString(i18n.lang)), el("span", null, label));
}
function readStreak() {
  const s = C.stats.streak();
  const today = Date.now();
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = C.stats.day(C.stats.dayKey(today - i * 864e5));
    dots.push(el("i", { class: d.readMs + d.aloudMs >= C.stats.READ_DAY ? "on" : "" }));
  }
  const best = s.best > s.now && s.bestEnd
    ? t("Longest: {n} days, in {month}", { n: s.best, month: dayAt(s.bestEnd).toLocaleDateString(i18n.lang, { month: "long" }) }) : s.now ? t("Your longest yet") : t("A minute a day keeps a run going");
  return el("div", { class: "rs-streak" },
    el("div", { class: "rs-dots", "aria-hidden": "true" }, ...dots),
    el("div", null,
      el("p", { class: "rs-streak-n" }, s.now === 1 ? t("1 day in a row") : s.now ? t("{now} days in a row", { now: s.now }) : t("No run of days yet")),
      el("p", { class: "meta" }, best)));
}
// What the Reading widgets show (1.39.0), worked out here for the day
// it's handed over; the widgets know to say nothing yet on a later day.
function statsWidget() {
  const S = C.stats;
  const week = readRange("week", 0);
  const days = S.days(week.from, week.to);
  const today = S.dayKey(Date.now());
  const t = S.day(today), run = S.streak();
  const ms = days.reduce((n, d) => n + d.readMs + d.aloudMs, 0);
  const finished = S.finishedIn(week.from, week.to);
  return {
    day: today, weekTo: week.to,
    week: spanText(ms),
    weekMeta: [run.now ? (run.now === 1 ? i18n.t("1 day in a row") : i18n.t("{now} days in a row", { now: run.now })) : null, finished ? i18n.t("{n} finished", { n: finished }) : null].filter(Boolean).join(" · ") || week.title,
    bars: days.map((d) => ({ day: d.key, r: Math.round(d.readMs / 6000) / 10, a: Math.round(d.aloudMs / 6000) / 10,
      label: dayAt(d.key).toLocaleDateString(i18n.lang, { weekday: "narrow" }) })),
    today: spanText(t.readMs + t.aloudMs),
    todayMeta: t.readMs + t.aloudMs < 60000 ? i18n.t("Nothing yet today") : t.aloudMs >= 60000 ? i18n.t("{read} reading, {aloud} listening", { read: spanText(t.readMs), aloud: spanText(t.aloudMs) }) : t.words >= 50 ? i18n.t("About {n} words", { n: Math.round(t.words / 10) * 10 }) : i18n.t("Reading"),
    readToday: t.readMs + t.aloudMs >= S.READ_DAY,
    run: i18n.tn(run.now, "1 day", "{n} days"),
    runMeta: run.best > run.now ? i18n.t("Longest {n}", { n: run.best }) : run.now ? i18n.t("Your longest yet") : i18n.t("Read a minute today to start"),
  };
}
function renderReading() {
  const root = $("reading");
  const range = readRange();
  const days = readDays(range);
  const read = days.reduce((n, d) => n + d.readMs, 0), aloud = days.reduce((n, d) => n + d.aloudMs, 0);
  const since = C.stats.dayKey(C.stats.since());
  const older = range.all || range.from <= since;
  const step = (n) => () => { readBack = Math.max(0, readBack + n); renderReading(); };
  const seg = el("div", { class: "rs-seg", role: "tablist", "aria-label": t("Show") }, ...Object.keys(SPANS).map((s) => {
    const b = el("button", { class: "rs-tab", type: "button", role: "tab", "aria-selected": String(s === readSpan),
      onclick: () => { readSpan = s; readBack = 0; store(SPAN_KEY, s); renderReading(); } }, SPANS[s]);
    return b;
  }));
  const back = el("button", { class: "icon-btn", type: "button", "aria-label": t("Before"), onclick: step(1) });
  back.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  back.disabled = older;
  const on = el("button", { class: "icon-btn", type: "button", "aria-label": t("After"), onclick: step(-1) });
  on.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  on.disabled = readBack === 0;
  statsNames();
  const tops = C.stats.top(range.from, range.to, 20).map((t) => ({ ...t, p: state.pages.find((p) => p.id === t.id) }))
    .map((t) => ({ ...t, gone: t.p ? null : goneName(t.id) }))
    .filter((t) => (t.p || t.gone) && t.ms >= 60000).slice(0, 5);
  const opened = days.reduce((n, d) => n + d.opened, 0), saved = days.reduce((n, d) => n + d.saved, 0);
  const words = days.reduce((n, d) => n + d.words, 0);
  fill(root,
    seg,
    el("div", { class: "rs-range" }, back, el("p", { class: "rs-title", "aria-live": "polite" }, range.title), on),
    el("p", { class: "rs-total" }, read + aloud >= 60000 ? spanText(read + aloud) : t("0 min")),
    el("p", { class: "meta rs-split" }, t("{spanText} reading · {spanText2} listening", { spanText: spanText(read), spanText2: spanText(aloud) })),
    readChart(readBars(range, days)),
    el("div", { class: "rs-legend meta", "aria-hidden": "true" }, el("span", null, el("i", { class: "rs-key-read" }), t("Reading")), el("span", null, el("i", { class: "rs-key-aloud" }), t("Listening"))),
    older && !range.all ? el("p", { class: "meta rs-since" }, t("Counting since {toLocaleDateString}", { toLocaleDateString: dayAt(since).toLocaleDateString(i18n.lang, { day: "numeric", month: "long", year: "numeric" }) })) : null,
    el("div", { class: "rs-figs" },
      readFigure(Math.round(words / 100) * 100 || words, "words"),
      readFigure(C.stats.finishedIn(range.from, range.to), "clips finished"),
      readFigure(opened, "clips opened"),
      readFigure(saved, "clips saved")),
    readStreak(),
    tops.length ? el("h2", { class: "overline rs-over" }, range.all ? t("Most time overall") : range.now ? t("Most time {x}", { x: range.now.toLowerCase() }) : t("Most time then")) : null,
    tops.length ? el("ul", { class: "rs-top-list" }, ...tops.map((t) => t.gone ? goneRow(t) : el("li", null,
      el("button", { class: "rs-clip", type: "button", onclick: () => openPage(t.p.id) },
        clipCover(t.p),
        el("span", { class: "rs-clip-text" },
          el("span", { class: "rs-clip-title", dir: "auto" }, t.p.title),
          el("span", { class: "meta" }, [t.p.link ? i18n.t("Files") : siteOf(t.p), (C.stats.clip(t.p.id) || {}).finished ? i18n.t("finished") : null].filter(Boolean).join(" · "))),
        el("span", { class: "rs-clip-time" }, spanText(t.ms)))))) : null,
    el("p", { class: "footnote rs-note" }, t("{x}A clip's time counts while it's on screen, until a little after the words on screen should have taken you. {x2}", { x: C.sync.on
      ? t("Each of your devices counts its own, and GitHub sync adds them up. ")
      : t("Counted on this device; with GitHub sync on, your other devices' time adds in here. "), x2: C.stats.paceKnown() ? t("Your pace is about {n} words a minute, from the last 30 days; clips' minutes go by it.", { n: C.stats.pace() })
        : t("Clips' minutes go by 230 words a minute until Waypage has seen enough of your reading to know your pace.") })));
}

// ---- Clips gone from the library, kept in Stats (2026-11) ----
// Stats keeps a name for each clip read (stats.js). A deleted one stays
// in "Most time" greyed, until it's removed from Stats or saved again:
// the same address, or the same file, picks its numbers back up.
function statsKey(p) {
  if (!p || p.note || p.preview) return "";
  if (p.file) return p.file.fp ? "f:" + p.file.fp : p.file.name ? "n:" + p.file.name + ":" + (p.file.size || 0) : "";
  return /^https?:/.test(p.url || "") ? "u:" + C.sync.urlKey(p.url) : "";
}
function statsNames() {
  // A library that didn't read isn't a library emptied.
  if (!loaded || C.store.problem) return;
  const S = C.stats, read = S.totals().clips, have = new Set();
  for (const p of state.pages) {
    have.add(p.id);
    if (read[p.id] && !p.preview) S.name(p.id, { t: p.title, s: p.link ? "" : siteOf(p), k: statsKey(p), u: p.file ? "" : p.url });
  }
  S.left(have);
  const waiting = new Map();
  for (const g of S.gone(have)) if (g.k) waiting.set(g.k, g.id);
  if (!waiting.size) return;
  for (const p of state.pages) {
    const k = [statsKey(p), p.requested && !p.file ? "u:" + C.sync.urlKey(p.requested) : ""].find((x) => x && waiting.has(x));
    if (k) { S.moved(waiting.get(k), p.id); waiting.delete(k); }
  }
}
let statsNamesTimer = null;
const statsNamesSoon = () => { clearTimeout(statsNamesTimer); statsNamesTimer = setTimeout(statsNames, 1500); };
function goneName(id) {
  const n = C.stats.named(id);
  return n && n.g && !C.stats.hidden(id) ? { id, ...n } : null;
}
function goneMark() {
  const box = el("span", { class: "side-cover rs-gone-mark", "aria-hidden": "true" });
  box.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  return box;
}
function goneRow(r) {
  return el("li", { class: "rs-gone" },
    el("button", { class: "rs-clip", type: "button", onclick: () => openMenu("statsGone", r.gone) },
      goneMark(),
      el("span", { class: "rs-clip-text" },
        el("span", { class: "rs-clip-title", dir: "auto" }, r.gone.t),
        el("span", { class: "meta" }, [t("Deleted"), r.gone.s].filter(Boolean).join(" · "))),
      el("span", { class: "rs-clip-time" }, spanText(r.ms))));
}
function statsGoneSheet(g) {
  const c = C.stats.clip(g.id);
  const time = c && c.readMs + c.aloudMs >= 60000 ? spanText(c.readMs + c.aloudMs) : "";
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, g.t),
      el("p", { class: "meta" }, [t("Deleted"), time, g.s].filter(Boolean).join(" · "))),
    el("p", { class: "meta" }, g.u ? t("Its time stays in your totals. Save it again and it picks up where it left off.")
      : t("Its time stays in your totals. Bring the same file back and it picks up where it left off.")),
    el("div", { class: "group" },
      g.u ? menuRow(t("Save again"), () => back().then(() => savePage(g.u))) : null,
      g.u ? menuRow(t("Open the original"), () => C.platform.openOutside(g.u)) : null,
      menuRow(t("Remove from Stats"), () => back().then(() => { C.stats.hide(g.id); renderReading(); }), "warn")));
}

async function checkNow(f) {
  if (!navigator.onLine) { toast(t("You're offline. Check again when you're back online.")); return; }
  if (f) { feedsChecking = true; paintFeeds(); try { await checkFeed(f); } finally { feedsChecking = false; paintFeeds(); } }
  else await checkFeeds(true);
}

// A post: a tap opens it (the saved copy, or the original online); +
// saves it into its feed's collection.
function postRow(f, it, withFeed) {
  const saved = savedAs(it.url);
  const busy = !saved && savingUrl(it.url);
  const when = whenText(postAt(it));
  const key = f.url + " " + postKey(it);
  const open = () => (state.feedPick ? tapPost(key) : saved ? openPage(saved.id) : previewPost(f, it));
  const outside = el("button", { class: "post-act", type: "button", "aria-label": t("Open {title} in the browser", { title: it.title }),
    onclick: () => C.platform.openOutside(it.url) }, feedIcon("out", 18));
  let right;
  if (saved) right = el("span", { class: "post-saved" }, t("Saved"));
  else {
    right = el("button", { class: "post-act post-save", type: "button", "aria-label": busy ? t("Saving {title}", { title: it.title }) : t("Save {title}", { title: it.title }),
      onclick: () => saveFeedPosts([{ f, it }]) });
    if (busy) { right.disabled = true; right.append(el("span", { class: "spinner", "aria-hidden": "true" })); }
    else right.append(feedIcon("add", 18));
  }
  const isPicked = !!state.feedPick && state.feedPick.has(key);
  const openBtn = el("button", { class: "post-open", type: "button", "aria-label": (saved ? "Read " : "Open ") + it.title, onclick: open });
  if (state.feedPick) openBtn.setAttribute("aria-pressed", String(isPicked));
  return el("div", { class: "post" + (isPicked ? " picked" : ""), "data-key": "post:" + key, "data-post": key },
    openBtn, pickMark(),
    withFeed ? feedMark(f) : null,
    el("span", { class: "post-body" },
      withFeed ? el("span", { class: "post-feed", dir: "auto" }, f.title) : null,
      el("span", { class: "post-title", dir: "auto" }, it.title),
      el("span", { class: "post-meta" }, saved ? readingLine(saved) + " · " + when : f.releases ? releaseMeta(it, withFeed) + " · " + when : when)),
    outside, right);
}

// ---- Picking several posts (1.20.0) ----
// Holding a post (1.22.0, was a Select button) turns taps into picks, using the library's bars: Open
// sends every picked post to the browser, Save saves them all. A history
// entry, so Back leaves it.

function feedPostsShown() {
  const feeds = siteFeeds();
  const picked = state.feed && feeds.find((f) => f.url === state.feed);
  const ts = postTerms();
  return (picked ? [picked] : feeds).flatMap((f) => feedPosts(f).filter((it) => !ts.length || postMatch(f, it, ts)).map((it) => ({ f, it, key: f.url + " " + postKey(it) })));
}
const pickedPosts = () => feedPostsShown().filter((x) => state.feedPick && state.feedPick.has(x.key));

function startFeedPick(fromHistory) {
  if (state.feedPick) return;
  state.feedPick = new Set();
  if (!fromHistory) history.pushState({ view: "feedPick" }, "");
  document.body.classList.add("selecting", "picking-posts");
  $("selectHead").hidden = false;
  $("selectBar").hidden = false;
  M.edgeIn($("selectHead"), "top");
  M.edgeIn($("selectBar"), "bottom");
  renderFeeds();
  paintPostPicks();
  $("selectCancel").focus({ preventScroll: true });
}

function endFeedPick() {
  if (!state.feedPick) return;
  state.feedPick = null;
  document.body.classList.remove("selecting", "picking-posts");
  for (const [id, edge] of [["selectHead", "top"], ["selectBar", "bottom"]]) M.edgeOut($(id), edge).then(() => { if (!state.select && !state.feedPick) $(id).hidden = true; });
  renderFeeds();
}

function tapPost(key) {
  state.feedPick.has(key) ? state.feedPick.delete(key) : state.feedPick.add(key);
  paintPostPicks();
}

function pickAllPosts() {
  const all = feedPostsShown();
  const every = all.length && all.every((x) => state.feedPick.has(x.key));
  for (const x of all) every ? state.feedPick.delete(x.key) : state.feedPick.add(x.key);
  paintPostPicks();
}

function paintPostPicks() {
  if (!state.feedPick) return;
  for (const row of $("feeds").querySelectorAll("[data-post]")) {
    const on = state.feedPick.has(row.dataset.post);
    row.classList.toggle("picked", on);
    row.querySelector(".post-open").setAttribute("aria-pressed", String(on));
  }
  const list = pickedPosts();
  const all = feedPostsShown();
  $("selectCount").textContent = list.length ? tn(list.length, "1 post picked", "{n} posts picked") : t("Pick posts");
  $("selectAll").textContent = all.length && all.every((x) => state.feedPick.has(x.key)) ? t("Pick none") : t("Select all");
  $("selOpen").disabled = !list.length;
  $("selSave").disabled = !list.some((x) => !savedAs(x.it.url) && !savingUrl(x.it.url));
}

async function openPickedPosts() {
  const list = pickedPosts();
  if (!list.length) return;
  await back();
  // One after another, so the browser takes each as a tab of its own.
  list.forEach((x, i) => setTimeout(() => C.platform.openOutside(x.it.url), i * 400));
}

async function savePickedPosts() {
  const list = pickedPosts().filter((x) => !savedAs(x.it.url) && !savingUrl(x.it.url));
  if (!list.length) return;
  await back();
  saveFeedPosts(list);
  toast(t("Saving {countLine}", { countLine: countLine(list.length) }));
}

// A post read in the app without saving it: the reader shows it, and
// its ⋯ offers Save and the browser. Discover's Wikipedia rows come with
// no feed.
let previewing = null;
// The last few read this way, so Back from a link read here comes to them.
const previewsKept = new Map();
async function previewPost(f, it) {
  if (!navigator.onLine) { toast(t("You're offline. Save posts while you're online to read them here.")); return; }
  if (previewing) return;
  previewing = it.url;
  toast(t("Opening…"));
  let got;
  try { got = await C.save.preview(it.url); }
  catch (e) {
    toast(e instanceof C.save.SaveError ? e.message : C.platform.canReadPages
      ? t("Couldn't open that post. Try the browser button.") : t("This browser can't reach that site. Try the browser button."));
    return;
  } finally { previewing = null; }
  if (f) got.meta.feed = f.url;
  got.meta.post = it.url;
  previewsKept.set(got.meta.id, got);
  while (previewsKept.size > 6) previewsKept.delete(previewsKept.keys().next().value);
  const swap = state.open && $("readerView").dataset.pane && !$("readerView").dataset.leaving;
  if (swap) { closeSheet(true); history.replaceState(readerState(got.meta), ""); }
  else history.pushState(readerState(got.meta), "");
  const shown = show(got.meta, got.html);
  pushScreen($("readerView"));
  await shown;
  $("readerFrame").focus();
}

function previewSheet(p) {
  const f = feeds.find((x) => x.url === p.feed);
  const saved = savedAs(p.post) || savedAs(p.url);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, p.title),
      el("p", { class: "meta" }, [p.site, t("{n} min", { n: clipMinutes(p) }), t("Not saved")].join(" · "))),
    el("div", { class: "tile-row" },
      tileButton("add", saved ? t("Saved") : t("Save"), saved ? () => {} : () => {
        if (f) saveFeedPosts([{ f, it: { url: p.post, date: Date.now() } }]);
        else savePage(p.post || p.url);
        history.back();
      }),
      tileButton("original", t("Browser"), () => C.platform.openOutside(p.url))));
}

// ---- Newsletters (1.43.0) ----
// An inbox, not a river: each address's emails by day, unread ones
// marked, a confirm email as a Confirm button, and the address itself on
// top to copy. Kill the Newsletter keeps an email a month, so a new one
// is saved as a clip when it arrives (the address's "Save them", on by
// default), and that clip is what sync carries to a computer, which
// can't read the address itself.

// The emails' HTML from the last check, for saving without asking again.
const mailBodies = new Map();
const CONFIRM_LINK = /confirm|verify|activate|validate|opt[- ]?in|\byes\b|subscribe/i;
function keepMails(got) {
  for (const it of got.items) {
    if (!it.body) continue;
    if (isConfirm(it)) it.act = confirmLink(it.body);
    mailBodies.set(it.url, it.body);
  }
  while (mailBodies.size > 60) mailBodies.delete(mailBodies.keys().next().value);
}
// The email's own confirm link: the first whose words, or else whose
// address, say so. Parsed, never run (DOMParser's documents run nothing).
function confirmLink(html) {
  const doc = new DOMParser().parseFromString("<body>" + html, "text/html");
  const links = [...doc.querySelectorAll("a[href]")].map((a) => ({ a, href: a.getAttribute("href").trim() }))
    .filter((x) => /^https?:\/\//i.test(x.href) && !/unsub/i.test(x.href + x.a.textContent) && !x.href.includes(KTN));
  const hit = links.find((x) => CONFIRM_LINK.test(x.a.textContent)) || links.find((x) => CONFIRM_LINK.test(x.href));
  return hit ? hit.href : "";
}
// Kill the Newsletter has the address mail bounces to, not the sender's
// name, and the big mailing services share theirs; so the sender is a
// guess from its domain, or the address's own name.
const MAILERS = /(^|\.)(mcsv\.net|mcdlv\.net|rsgsv\.net|mailchimpapp\.net|mandrillapp\.com|sendgrid\.net|amazonses\.com|mailgun\.(org|net)|sparkpostmail\.com|mtasv\.net|mailjet\.com|sendinblue\.com|brevo\.com|klaviyomail\.com|createsend\d*\.com|cmail\d+\.com|exacttarget\.com|hubspotemail\.net|hs-email\.net|mktomail\.com|ccsend\.com|substack\.com|beehiiv\.com|ghost\.io|buttondown\.email|convertkit-mail\d*\.com|ckespa\.com)$/i;
function senderOf(f, it) {
  const host = String((it && it.from) || "").split("@")[1] || "";
  if (!host || MAILERS.test(host)) return f.title;
  const parts = host.toLowerCase().split(".");
  const name = parts[parts.length - (parts.length > 2 && /^(co|com|org|net|ac)$/.test(parts[parts.length - 2]) ? 3 : 2)] || "";
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : f.title;
}
// The email as a page to save: titled by its subject, named by its
// sender, without Kill the Newsletter's settings link at its foot;
// save tidies it as an email (C.save.tidyMail).
function mailPage(f, it, html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const a of doc.querySelectorAll('a[href*="' + KTN + '/feeds/"]')) {
    if (/\/entries\//.test(a.getAttribute("href"))) continue;
    const p = a.closest("p") || a;
    const hr = p.previousElementSibling;
    if (hr && hr.localName === "hr") hr.remove();
    p.remove();
  }
  return { url: it.url, html: "<!doctype html>\n" + doc.documentElement.outerHTML, title: it.title, site: senderOf(f, it), mail: true, from: it.from };
}
async function saveMail(f, it) {
  const full = f.items.find((x) => sameUrl(x.url, it.url)) || it;
  let html = mailBodies.get(full.url);
  if (!html) {
    try {
      const res = await C.platform.fetchText(full.url);
      if (res.status >= 400) throw new Error(String(res.status));
      html = res.text;
    } catch (e) { toast(t("Couldn't reach that email. Kill the Newsletter keeps them a month.")); return; }
  }
  const folder = f.folder ? folderName(f.folder) : undefined;
  await savePage(full.url, folder, { mode: C.platform.native ? f.images || feedImages() : undefined, given: mailPage(f, full, html) });
}

// Every address's emails: the ones its feed has, and on a computer (or
// once the feed has let them go) the ones saved, from the library.
const MAIL_ENTRY = "https://" + KTN + "/feeds/";
function mailList(boxes) {
  const out = [], had = new Set(), by = new Map();
  for (const f of boxes) {
    by.set(f.url.slice(MAIL_ENTRY.length, -4), f);
    for (const it of feedPosts(f)) { out.push({ f, it }); had.add(it.url); }
  }
  // One look through the library for them all (3,000 clips at 6x CPU).
  for (const p of state.pages) {
    if (!p.url || !p.url.startsWith(MAIL_ENTRY) || had.has(p.url)) continue;
    const f = by.get(p.url.slice(MAIL_ENTRY.length).split("/")[0]);
    if (f) out.push({ f, it: { url: p.url, title: p.title, date: p.savedAt, foundAt: p.savedAt, opened: !!p.readAt } });
  }
  return out.sort((a, b) => postAt(b.it) - postAt(a.it));
}
const mailUnread = (it) => { const saved = savedAs(it.url); return !it.opened && !(saved && (saved.readAt || saved.finished)); };

function openMail(f, it) {
  const saved = savedAs(it.url);
  if (!it.opened && f.items.includes(it)) { it.opened = true; store(FEEDS_KEY, feeds); }
  if (saved) openPage(saved.id);
  else previewPost(f, it);
  paintFeeds();
}

function mailRow(f, it, withBox) {
  const saved = savedAs(it.url);
  const busy = !saved && savingUrl(it.url);
  const confirm = !saved && isConfirm(it);
  const when = whenText(postAt(it));
  const open = el("button", { class: "post-open", type: "button", "aria-label": (saved ? "Read " : "Open ") + it.title, onclick: () => openMail(f, it) });
  let right;
  if (saved) right = el("span", { class: "post-saved" }, t("Saved"));
  else if (confirm) {
    right = el("button", { class: "btn-small nl-confirm", type: "button", "aria-label": t("Confirm the subscription in the browser"),
      onclick: () => { if (it.act) { it.opened = true; store(FEEDS_KEY, feeds); C.platform.openOutside(it.act); paintFeeds(); } else openMail(f, it); } }, t("Confirm"));
  } else {
    right = el("button", { class: "post-act post-save", type: "button", "aria-label": busy ? t("Saving {title}", { title: it.title }) : t("Save {title}", { title: it.title }),
      onclick: () => saveFeedPosts([{ f, it }]) });
    if (busy) { right.disabled = true; right.append(el("span", { class: "spinner", "aria-hidden": "true" })); }
    else right.append(feedIcon("add", 18));
  }
  const unread = mailUnread(it);
  return el("div", { class: "post" + (unread ? " nl-unread" : ""), "data-key": "mail:" + it.url },
    open,
    el("span", { class: "post-body" },
      el("span", { class: "post-feed", dir: "auto" }, withBox && senderOf(f, it) !== f.title ? senderOf(f, it) + " · " + f.title : senderOf(f, it)),
      el("span", { class: "post-title", dir: "auto" }, (unread ? el("span", { class: "visually-hidden" }, t("Unread: ")) : null), it.title),
      el("span", { class: "post-meta" }, saved ? readingLine(saved) + " · " + when : when)),
    right);
}

function pickBox(url) {
  state.feed = url;
  renderNewsletters();
}

function renderNewsletters() {
  const root = $("newsletters");
  const boxes = mailBoxes();
  const picked = state.feed && boxes.find((f) => f.url === state.feed);
  if (state.feed && !picked) state.feed = null;
  const nodes = [];
  if (!boxes.length) {
    leavePostSearch();
    nodes.push(el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("Read newsletters here")),
      el("p", { class: "empty-text" }, t("Make an email address for newsletters and sign up with it. Each email arrives here, and is saved for reading offline.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => $("saveUrl").focus() }, t("Make an address"))));
    root.replaceChildren(...nodes);
    return;
  }
  // Laid out like Feeds (1.43.1): chips (hold one for its settings), a
  // line with Copy address, and a new address from the bottom field.
  const one = picked || (boxes.length === 1 ? boxes[0] : null);
  const all = mailList(boxes);
  const box = postSearchBox(), ts = postTerms();
  const list = all.filter((x) => (!picked || x.f === picked) && (!ts.length || postMatch(x.f, x.it, ts)));
  const chip = (label, n, on, onclick, key, url) => {
    const b = el("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), "data-key": key, onclick },
      el("span", { class: "chip-label", dir: "auto" }, label), n ? " · " + n : null);
    if (url) b.dataset.feed = url;
    return b;
  };
  const unread = new Map();
  for (const x of all) if (mailUnread(x.it)) unread.set(x.f, (unread.get(x.f) || 0) + 1);
  nodes.push(el("div", { class: "chips filters feed-chips", role: "group", "aria-label": t("Addresses") },
    chip(t("All"), [...unread.values()].reduce((n, k) => n + k, 0), !picked, () => pickBox(null), "chip:all"),
    ...boxes.map((f) => chip(f.title, unread.get(f) || 0, picked === f, () => pickBox(f.url), "chip:" + f.url, f.url))));
  const checked = Math.max(0, ...(picked ? [picked] : boxes).map((f) => f.checkedAt || 0));
  const line = ts.length ? tn(list.length, "1 email found", "{n} emails found")
    : !C.platform.canFetchPages ? t("Your phone collects these. Saved ones come here through sync.")
    : feedsChecking ? t("Checking…") : picked && picked.error ? picked.error : checked ? t("Checked {when}", { when: whenText(checked) }) : t("Not checked yet");
  nodes.push(el("div", { class: "feed-head" },
    el("p", { class: "meta" + (picked && picked.error && !feedsChecking && !ts.length ? " warn" : ""), role: ts.length ? "status" : null },
      one ? el("span", { class: "nl-mail" }, mailAddress(one)) : null, one ? el("br") : null, line),
    one ? el("span", { class: "feed-head-acts" },
      el("button", { class: "btn-text", type: "button", "data-key": "copy", onclick: () => copyText(mailAddress(one), t("Address copied. Sign up with it.")) }, t("Copy address"))) : null));
  let day = null, group = null;
  for (const x of list) {
    const d = dayName(postAt(x.it));
    if (d !== day) {
      day = d;
      const open = list.filter((y) => dayName(postAt(y.it)) === d && !savedAs(y.it.url) && !savingUrl(y.it.url) && !isConfirm(y.it) && y.f.items.includes(y.it));
      nodes.push(sectionHead(d, open.length > 1
        ? el("button", { class: "btn-text", type: "button", "data-key": "all:" + d, onclick: () => saveFeedPosts(open) }, t("Save all {n}", { n: open.length })) : null));
      group = el("div", { class: "group feed-group" });
      nodes.push(group);
    }
    group.append(mailRow(x.f, x.it, !picked && boxes.length > 1));
  }
  if (!list.length && ts.length) nodes.push(el("p", { class: "empty-text hl-none" }, t("No emails match that.")));
  else if (!list.length) {
    nodes.push(el("div", { class: "empty" },
      el("p", { class: "empty-text" }, (picked && picked.error) || (one ? t("No emails yet. Copy the address and sign up to a newsletter with it.") : t("No emails yet.")))));
  }
  fillPosts(root, box, nodes);
  const chips = root.querySelector(".feed-chips");
  if (chips && picked) { const on = chips.querySelector(".chip.on"); if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" }); }
}

// Making an address: the app asks Kill the Newsletter for one, named as
// you like, from the bottom field (1.43.1). A browser can't (no CORS), so
// there a sheet asks for the feed link of one made on their page.
async function addMailBox(url, title) {
  if (feeds.some((f) => sameUrl(f.url, url))) { toast(t("That address is here already.")); return false; }
  const f = { url, title, link: "", icon: "", mode: "save", images: feedImages(), folder: title, days: MAIL_DAYS,
    addedAt: Date.now(), checkedAt: 0, error: "", items: [] };
  feeds.push(f);
  askToNotify = true;
  saveFeeds();
  await goPlace("newsletters", f.url);
  toast(t("Your address is ready. Copy it and sign up with it."));
  return true;
}
let makingMail = false;
async function makeMailBox(name) {
  const title = name || t("Newsletters");
  if (!C.platform.canFetchPages) { openMenu("newMail", { name: title }); return false; }
  if (!navigator.onLine) { toast(t("You're offline. Make it when you're back online.")); return false; }
  if (makingMail) return false;
  makingMail = true;
  toast(t("Making the address…"));
  try {
    const res = await C.platform.postForm("https://" + KTN + "/feeds", { title }, { headers: { "CSRF-Protection": "true" } });
    const got = res.status < 400 ? JSON.parse(res.text) : null;
    if (!got || !MAIL_FEED.test(got.feed)) throw new Error(String(res.status));
    return await addMailBox(got.feed, title);
  } catch (e) {
    toast(t("Kill the Newsletter didn't make one just now. Try again in a while."));
    return false;
  } finally { makingMail = false; }
}
function newMailSheet() {
  const name = el("input", { class: "feed-input", type: "text", placeholder: t("Newsletters"), "aria-label": t("Name"), maxlength: String(NAME_MAX),
    value: (state.menu && state.menu.page && state.menu.page.name) || "", autocomplete: "off", autocapitalize: "sentences", enterkeyhint: "next" });
  const link = el("input", { class: "feed-input", type: "url", inputmode: "url", placeholder: "https://kill-the-newsletter.com/feeds/….xml",
    "aria-label": t("Its feed link"), autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "go" });
  const help = el("p", { class: "footnote" }, t("Make it in Waypage on your phone, or make one on Kill the Newsletter's page and paste its feed link here."));
  const go = el("button", { class: "btn-primary", type: "button" }, t("Add it"));
  go.addEventListener("click", async () => {
    const url = link.value.trim();
    if (!MAIL_FEED.test(url)) { help.className = "footnote warn"; help.textContent = t("That isn't a Kill the Newsletter feed link. It ends in .xml."); link.focus(); return; }
    await back();
    if (await addMailBox(url, cleanName(name.value) || t("Newsletters"))) $("saveUrl").value = "";
  });
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); link.focus(); } });
  link.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
  setTimeout(() => link.focus({ preventScroll: true }), 50);
  return el("div", { class: "page-controls add-feed" },
    el("h2", { class: "menu-title" }, t("New newsletter address")),
    el("div", { class: "feed-field" }, name, link, help),
    el("button", { class: "sheet-row", type: "button", onclick: () => C.platform.openOutside("https://" + KTN + "/") }, t("Open Kill the Newsletter")),
    go,
    el("p", { class: "footnote" }, t("Kill the Newsletter, a free service, receives the emails, so it can read them. Anyone with the address can send to it. Waypage keeps it on this device and in your sync.")));
}

// Deleting an address there too, so mail sent to it bounces. The app
// only; a computer just stops showing it.
async function removeMailBox(f) {
  if (C.platform.canFetchPages && navigator.onLine) {
    const id = (f.url.match(MAIL_FEED) || [])[1];
    try { await C.platform.postForm("https://" + KTN + "/feeds/" + id, {}, { method: "DELETE", headers: { "CSRF-Protection": "true" } }); }
    catch (e) { /* it ends with Kill the Newsletter's month */ }
  }
  feeds = feeds.filter((x) => x !== f);
  saveFeeds();
  if (state.feed === f.url) state.feed = null;
  await back();
  paintFeeds();
  toast(C.platform.canFetchPages ? t("Deleted {title}. The emails you saved stay.", { title: f.title }) : t("Removed {title}. The emails you saved stay.", { title: f.title }));
}

// ---- The sidebar ----
// Library with its favourites and parts under it, then Feeds with its
// feeds, from the bar's menu button, over a dimmed screen in its own
// history entry. Feeds shows the three touched last (0.28.1); Library
// the favourite collections, then the favourite clips (1.14.0).
const SIDE_MAX = 3;
function sideCover(name) {
  const list = folderPages(name);
  const src = coverUrl(list) || list.map(thumbUrl).find(Boolean);
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.append(src ? el("img", { src, alt: "", loading: "lazy" }) : collectionIcon(list, 16));
  return box;
}

const sideMark = (name) => {
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.append(svgIcon(name, 16));
  return box;
};
function clipCover(p) {
  const src = thumbUrl(p);
  if (!src) return sideMark("open");
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.append(el("img", { src, alt: "", loading: "lazy" }));
  return box;
}

const fileMark = () => {
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  return box;
};

// Off the sidebar to the library: the sidebar put away, or with it
// pinned, whatever is open over the library.
const fromSide = () => (pinned.matches ? toLibrary() : back());

function openFromSide(name) {
  if (pinned.matches && state.folder === name) return Promise.resolve();
  return fromSide().then(() => {
    if (state.place !== "library") { state.place = "library"; store(PLACE_KEY, "library"); paintPlace(); }
    openFolder(name);
  });
}

function partFromSide(part) {
  return fromSide().then(() => {
    if (state.place !== "library") { state.place = "library"; store(PLACE_KEY, "library"); paintPlace(); }
    // A part only shows under All clips, so Clips and the rest put Show back there.
    if (state.filter !== "all") setFilter("all");
    if (state.part !== part) openPart(part);
  });
}
// Notes, from the sidebar: the library's All notes filter, as Favourites does.
function notesFromSide() {
  return toLibrary().then(() => goPlace("library")).then(() => setFilter("notes"));
}
function sideFavourites() {
  const folders = allFolders().filter(folderFav)
    .map((name) => ({ name, at: Math.max(...folderPages(name).map((x) => x.folderFavAt || 0)) }))
    .sort((a, b) => b.at - a.at).map((x) => ({ folder: x.name }));
  const clips = state.pages.filter((x) => x.fav).sort((a, b) => (b.favAt || 0) - (a.favAt || 0)).map((p) => ({ page: p }));
  return folders.concat(clips);
}

const withFeed = (node, f) => { node.dataset.feed = f.url; return node; };

// The three addresses with the latest emails (1.44.0), each with its
// unread count; addresses with none yet come after.
function sideBoxes(mails) {
  const by = new Map();
  for (const { f, it } of mails) {
    if (!by.has(f.url)) by.set(f.url, { f, fresh: 0 });
    if (mailUnread(it)) by.get(f.url).fresh++;
  }
  for (const f of mailBoxes()) if (!by.has(f.url)) by.set(f.url, { f, fresh: 0 });
  return [...by.values()].slice(0, SIDE_MAX);
}
const mailMark = (f) => {
  const box = siteMark({ site: f.title });
  box.className = "site-mark feed-mark small";
  return box;
};

// Library and Feeds fold their items away under a small arrow (1.43.2),
// remembered on this device. The rows slide shut on the control spring.
const SIDE_FOLD_KEY = "waypage.sideFolded";
// Settings › Appearance › Sidebar (2026-11, Daniel's ask): each fold can
// be turned off, leaving the place as a single row; and what heads
// Library's fold: the 3 favourites marked last, the 3 clips read last,
// or nothing.
const SIDE_FOLDS_KEY = "waypage.sideFolds";
const SIDE_TOP_KEY = "waypage.sideTop";
const sideFolds = (name) => load(SIDE_FOLDS_KEY, {})[name] !== false;
const sideTop = () => load(SIDE_TOP_KEY, "favourites");
function sideTopItems(favs) {
  const top = sideTop();
  if (top === "recent") return state.pages.filter((p) => p.readAt).sort((a, b) => b.readAt - a.readAt).slice(0, SIDE_MAX).map((p) => ({ page: p }));
  return top === "off" ? [] : favs.slice(0, SIDE_MAX);
}
function sideFold(name, head, subs) {
  subs = subs.filter(Boolean);
  if (!subs.length || !sideFolds(name)) return [head];
  const folded = !!load(SIDE_FOLD_KEY, {})[name];
  const group = el("div", { class: "side-group" + (folded ? " folded" : ""), id: "sideGroup-" + name }, el("div", { class: "side-group-in" }, ...subs));
  group.inert = folded;
  const label = head.querySelector(".side-label").textContent;
  const fold = el("button", { class: "side-fold", type: "button", "aria-expanded": String(!folded), "aria-controls": group.id, "aria-label": t("{label} items", { label: label }),
    onclick: () => {
      const shut = !group.classList.contains("folded");
      group.classList.toggle("folded", shut);
      group.inert = shut;
      fold.setAttribute("aria-expanded", String(!shut));
      store(SIDE_FOLD_KEY, { ...load(SIDE_FOLD_KEY, {}), [name]: shut });
    } });
  fold.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  return [el("div", { class: "side-row" }, head, fold), group];
}

function renderSide() {
  const item = (icon, label, on, extra, onclick, cls) => {
    const b = el("button", { class: "side-item" + (cls ? " " + cls : ""), type: "button", onclick }, icon,
      el("span", { class: "side-label", dir: "auto" }, label), extra || null);
    if (on) b.setAttribute("aria-current", "page");
    return b;
  };
  const count = (n, cls) => (n ? el("span", { class: cls || "side-n" }, String(n)) : null);
  const fresh = freshPosts();
  const mails = mailList(mailBoxes());
  const freshMail = mails.filter((x) => mailUnread(x.it)).length;
  const inFeeds = state.place === "feeds";
  const inMarks = state.place === "highlights";
  const latest = (f) => Math.max(0, ...f.items.map(postAt));
  const big = wide.matches;
  const inLib = !inFeeds && !inMarks && !["reading", "newsletters", "discover"].includes(state.place) && !C.ext.place(state.place);
  const inLibrary = inLib && !state.part && !state.folder && state.filter !== "favourites" && state.filter !== "notes";
  const favs = sideFavourites();
  const hasFolders = (load(SERIES_APART_KEY, true) ? plainFolders() : allFolders()).length > 0;
  fill($("sidebar"),
    el("div", { class: "side-head" },
      el("p", { class: "side-title" }, t("Waypage"))),
    // From inside Collections, Clips, a collection or the favourites
    // (1.20.0), Library steps all the way back to the library itself.
    ...sideFold("library", item(feedIcon("library"), t("Library"), inLibrary, null, () =>
      inLib && (state.part || state.folder || state.filter === "favourites" || state.filter === "notes")
        ? toLibrary().then(() => { if (state.filter === "favourites" || state.filter === "notes") setFilter("all"); return goPlace("library"); })
        : goPlace("library")), [
    ...sideTopItems(favs).map((f) => f.folder
      ? item(sideCover(f.folder), f.folder, state.folder === f.folder, count(freshCount(f.folder)), () => openFromSide(f.folder), "side-sub")
      : item(clipCover(f.page), f.page.title, state.open === f.page, null, () => fromSide().then(() => openPage(f.page.id)), "side-sub")),
    // Favourites, always there (2026-11, Daniel's ask): the library's
    // favourites filter, collections and clips alike.
    item(sideMark("star"), t("Favourites"), inLib && !state.part && !state.folder && state.filter === "favourites", count(favs.length),
      () => toLibrary().then(() => goPlace("library")).then(() => setFilter("favourites")), "side-sub"),
    // The library's parts (1.14.0), each opening alone.
    hasFolders ? item(sideMark("folder"), t("Collections"), inLib && state.part === "collections", null, () => partFromSide("collections"), "side-sub") : null,
    load(SERIES_APART_KEY, true) && allFolders().some(isSeriesFolder) ? item(sideMark("folder"), t("Series"), inLib && state.part === "series", null, () => partFromSide("series"), "side-sub") : null,
    item(sideMark("open"), t("Clips"), inLib && state.part === "pages", null, () => partFromSide("pages"), "side-sub"),
    // Notes (2.0.0), above Files (2026-11) as in the library.
    state.pages.some((p) => p.note) ? item(sideMark("open"), t("Notes"), inLib && !state.part && !state.folder && state.filter === "notes", null, notesFromSide, "side-sub") : null,
    // Files of your own (0.31.0), their part of the library.
    state.pages.some((p) => p.link && !p.note) ? item(fileMark(), t("Files"), inLib && state.part === "files", null, () => partFromSide("files"), "side-sub") : null]),
    ...sideFold("feeds", item(feedIcon("feeds"), t("Feeds"), inFeeds && !state.feed, fresh ? el("span", { class: "side-pill" }, t("{fresh} new", { fresh: fresh })) : null,
      () => goPlace("feeds")), siteFeeds().sort((a, b) => latest(b) - latest(a)).slice(0, SIDE_MAX).map((f) =>
      withFeed(item(feedMark(f, true), f.title, inFeeds && state.feed === f.url, null, () => goPlace("feeds", f.url), "side-sub"), f))),
    // Newsletters (1.43.0): their own place, under Feeds.
    ...sideFold("newsletters", item(sideSvg("mail"), t("Newsletters"), state.place === "newsletters" && !state.feed, freshMail ? el("span", { class: "side-pill" }, t("{freshMail} new", { freshMail: freshMail })) : null,
      () => goPlace("newsletters")), sideBoxes(mails).map(({ f, fresh: n }) =>
      withFeed(item(mailMark(f), f.title, state.place === "newsletters" && state.feed === f.url, count(n), () => goPlace("newsletters", f.url), "side-sub"), f))),
    // Discover: new things to follow, last of the places you follow from.
    item(sideSvg("discover"), t("Discover"), state.place === "discover", null, () => goPlace("discover")),
    // Every highlight in the library (1.8.0), a place of its own.
    item(sideSvg("marks"), t("Highlights"), inMarks, null, () => goPlace("highlights")),
    // The places of the extensions that are on (Settings › Extensions),
    // in the catalogue's order.
    ...C.ext.places().filter((x) => C.ext.on(x.id)).map((x) => item(sideIcon(x.place.icon), x.place.title(), state.place === x.id, null, () => goPlace(x.id))),
    item(sideSvg("reading"), t("Stats"), state.place === "reading", null, () => goPlace("reading")),
    // On a big screen the sidebar carries the rest (1.5.0): the tags,
    // and Settings at its foot. Feeds are added from the Feeds place.
    ...(big ? sideMore() : []),
    // Opens Settings › About (Daniel's ask, 2026-11-17).
    el("button", { class: "side-version", type: "button", onclick: () => (state.side ? back() : Promise.resolve()).then(() => openSettings(false, "updates")) },
      t("Version {APP_VERSION}", { APP_VERSION: APP_VERSION })));
}

function sideMore() {
  const tags = allTags().slice(0, 12);
  return [
    tags.length ? el("div", { class: "side-space", "aria-hidden": "true" }) : null,
    tags.length ? el("div", { class: "side-over-row" }, el("p", { class: "side-over" }, t("Tags")),
      el("button", { class: "btn-text side-edit", type: "button", onclick: () => (state.side ? back() : Promise.resolve()).then(() => openSettings(false, "tags")) }, t("Edit"))) : null,
    tags.length ? el("div", { class: "side-tags" }, ...tags.map((t) => {
      const on = state.place === "library" && state.filter === "#" + t;
      const b = el("button", { class: "chip side-tag" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), dir: "auto",
        onclick: () => goPlace("library").then(() => setFilter(on ? "all" : "#" + t)) }, "#" + t);
      return b;
    })) : null,
    // Search and Settings live at the top bar's right end, as on a phone
    // (1.49.0, Daniel's ask), not in the sidebar. The gap keeps room for
    // the docked Narrate player.
    el("span", { class: "side-gap", "aria-hidden": "true" }),
  ];
}

const SIDE_SVG = {
  marks: ICONS.mark,
  reading: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  discover: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
};
const sideSvg = (name) => sideIcon(SIDE_SVG[name]);
function sideIcon(paths) {
  const box = el("span", { class: "side-icon", "aria-hidden": "true" });
  box.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + "</svg>";
  return box;
}

// The library's parts move under the sidebar one by one, not the library
// as a whole: a transform on it made a phone drop the sticky bar along
// the bottom (1.45.5).
const libParts = () => [...$("libraryView").children];
const drift = (t) => libParts().forEach((x) => { x.style.transform = t; });

function openSide() {
  if (state.side || pinned.matches) return;
  state.side = true;
  history.pushState({ view: "side" }, "");
  renderSide();
  const side = $("sidebar");
  $("sideBtn").setAttribute("aria-expanded", "true");
  side.style.pointerEvents = "";
  $("sideCatch").hidden = false;
  side.hidden = false;
  // The library drifts right a little under it, and stays there while
  // it's open (1.11.0).
  const lib = libParts();
  M.dim($("sideCatch"), true);
  M.slideIn(side, M.reduced() ? null : lib).then(() => { if (state.side && !pinned.matches && !M.reduced()) drift(M.sideDrift(side)); });
  afterSettle(() => {
    if (!state.side) return;
    cover($("libraryView"), true);
    const at = side.querySelector("[aria-current]") || side.querySelector("button");
    if (at) at.focus({ preventScroll: true });
  });
}

function closeSide() {
  if (!state.side) return;
  state.side = false;
  sideByBack = false;
  const side = $("sidebar"), catcher = $("sideCatch");
  // The window grew wide enough to pin it while it was open: it stays.
  if (pinned.matches) {
    catcher.hidden = true;
    side.style.pointerEvents = "";
    cover($("libraryView"), false);
    drift("");
    return;
  }
  const had = side.contains(document.activeElement);
  $("sideBtn").setAttribute("aria-expanded", "false");
  side.style.pointerEvents = "none";
  const from = sideDragged;
  sideDragged = 0;
  const lib = libParts();
  drift("");
  M.dim(catcher, false).then(() => { if (!state.side) catcher.hidden = true; });
  M.slideOut(side, from, M.reduced() ? null : lib).then(() => { if (!state.side) side.hidden = true; });
  afterSettle(() => {
    if (state.side) return;
    cover($("libraryView"), false);
    if (had) $("sideBtn").focus({ preventScroll: true });
  });
}

// ---- Big screens (1.5.0) ----
// From 700 px the save field sits in the bar at the top, and the
// library's name, size, Show and Order share a row under it. From 1024 px
// the sidebar is pinned beside everything but the reader and Settings.
const libHead = el("div", { class: "lib-head" });
function fitWidth() {
  const bar = $("topBar"), form = $("saveForm"), top = $("libraryView").querySelector(".top");
  if (wide.matches && form.parentElement !== bar) {
    bar.insertBefore(form, bar.querySelector(".top-actions"));
    top.prepend(libHead);
    libHead.append($("placeTitle"), $("libraryMeta"), $("libTools"));
  } else if (!wide.matches && form.parentElement === bar) {
    $("libraryView").querySelector(".save-bar").append(form);
    bar.insertBefore($("placeTitle"), bar.querySelector(".top-actions"));
    top.prepend($("libraryMeta"));
    $("searchNote").after($("libTools"));
    libHead.remove();
  }
  const side = $("sidebar");
  document.body.classList.toggle("pinned", pinned.matches);
  if (pinned.matches) {
    if (state.side) history.back();
    side.hidden = false;
    side.style.pointerEvents = "";
    renderSide();
  } else if (!state.side) side.hidden = true;
  else renderSide();
  if (state.open) fitRail();
  if (!$("aloudBar").hidden) placeAloudBar();
}

// ---- Keys (1.5.0) ----
// Escape steps back; in pages the arrows turn them. With a keyboard the
// rest of the app has letters too, listed behind "?". Keys pressed in
// the reader's page come here through reader.js.
const KEYS = [
  [t("Anywhere"), [["/", t("Search")], [(/Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2 ? "⌘" : "Ctrl") + " V", t("Save a copied link")],
    ["1  2  3  4  5  6", "Library, Feeds, Newsletters, Highlights, Stats, Discover"], [t("G then L"), t("Go to the library")],
    [t("G then F"), t("Go to Feeds")], [t("G then N"), t("Go to Newsletters")], [t("G then H"), t("Go to Highlights")], [t("G then S"), t("Go to Stats")], [t("G then E"), t("Go to Discover")], ["D", t("Downloads")], [",", t("Settings")], ["?", t("These shortcuts")]]],
  [t("In the library"), [["↑ ↓", t("Move between clips")], ["Enter", t("Open")], ["X", t("Pick, to act on several")], ["Shift-click", t("Pick a run")],
    ["F", t("Favourite")], ["E", t("Export")], ["F2", t("Rename")], ["Del", t("Delete")]]],
  [t("Reading"), [["Space  ← →", t("Next or previous page")], ["J  K", t("Next or previous section")], ["T", t("Contents beside the text")],
    ["S", t("Narrate, or auto-scroll a comic")], ["A", t("Reader settings")], ["H", t("Highlights")], ["1–5", t("Highlight the selected words in a colour")], ["D", "Draw, then P pen, B highlighter, E eraser, [ ] size"], ["L", t("Translate this clip")], ["/", t("Find in this clip")], ["+  −", t("Text size")], ["O", t("Open the original")], [t("Esc"), t("Back")]]],
];
function keysSheet() {
  return el("div", { class: "keys-sheet" },
    el("h2", { class: "menu-title" }, t("Keyboard shortcuts")),
    el("div", { class: "keys-groups" }, ...KEYS.map(([title, rows]) => el("section", { class: "keys-group" },
      el("h3", { class: "overline" }, title),
      el("dl", { class: "keys-list" }, ...rows.flatMap(([k, what]) => [
        el("dt", null, ...k.split(/(\s+then\s+|\s{2}|\s(?=\S))/).filter((x) => x.trim()).map((x) => /then/.test(x) ? el("span", { class: "keys-then" }, t(" then ")) : el("kbd", null, x.trim()))),
        el("dd", null, what)]))))));
}

const typingIn = (t) => !!(t && t.closest && t.closest("input, textarea, select, [contenteditable]"));
// The card or collection with focus, in the list on screen.
const listNow = () => (state.folder ? $("folderBody") : state.place === "feeds" ? $("feeds") : state.place === "newsletters" ? $("newsletters") : state.place === "highlights" ? $("highlights") : state.place === "reading" ? $("reading") : state.place === "discover" ? $("discover") : C.ext.place(state.place) ? $(state.place) : $("library"));
const focusedNode = () => { const a = document.activeElement; return a && a.closest && listNow().contains(a) ? a.closest("[data-ids]") : null; };
const focusedPage = () => {
  const n = focusedNode();
  const ids = n ? n.dataset.ids.split(",") : [];
  return ids.length === 1 && !n.classList.contains("tile") ? state.pages.find((p) => p.id === ids[0]) || null : null;
};
function moveFocus(d) {
  const all = [...listNow().querySelectorAll(".card-open, .post-open")].filter((b) => b.offsetParent);
  if (!all.length) return false;
  const at = all.indexOf(document.activeElement);
  const to = all[at < 0 ? (d > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, at + d))];
  to.focus({ preventScroll: true });
  to.closest(".card, .tile, .post").scrollIntoView({ block: "nearest" });
  return true;
}
function jumpSection(d) {
  const list = C.reader.headings();
  if (!list.length) return;
  const now = C.reader.section();
  let at = -1;
  list.forEach((h, i) => { if (h.text === now) at = i; });
  C.reader.jumpTo(Math.max(0, Math.min(list.length - 1, at + d)));
}

let gAt = 0;
const PLACE_KEYS = ["library", "feeds", "newsletters", "highlights", "reading", "discover"];
function onKeys(e) {
  if (e.key === "Tab" || e.key.startsWith("Arrow") || e.key === "Enter" || e.key === "Escape") document.body.classList.add("keys");
  if (e.defaultPrevented || e.isComposing) return;
  const k = e.key, inFrame = e.target && e.target.ownerDocument !== document;
  if (k === "Escape" && inkPop) { inkPopClose(); e.preventDefault(); return; }
  if (k === "Escape" && (state.sheet || state.image || state.menu || state.select || state.side)) { history.back(); return; }
  if (state.image && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const act = { ArrowLeft: () => stepImage(M.x(-1)), ArrowRight: () => stepImage(M.x(1)), "+": () => zoomStep(1), "=": () => zoomStep(1), "-": () => zoomStep(-1) }[k];
    if (act) { e.preventDefault(); act(); }
    return;
  }
  if (state.open && !state.image && (e.ctrlKey || e.metaKey) && !e.altKey && k.toLowerCase() === "f") { e.preventDefault(); openFind(); return; }
  // Undo and redo for a pen drawing (1.56.0).
  if (state.open && C.ink.on && !state.sheet && !state.menu && (e.ctrlKey || e.metaKey) && !e.altKey && k.toLowerCase() === "z" && !typingIn(e.target)) {
    e.preventDefault();
    inkGo(e.shiftKey ? C.ink.redo() : C.ink.undo());
    return;
  }
  if (e.altKey || e.ctrlKey || e.metaKey || typingIn(e.target)) return;
  // In pages, the arrow keys turn them (inside the page, src/reader.js
  // does the same).
  if (state.open && !state.sheet && !state.image && C.reader.paged) {
    const rtl = state.open.dir === "rtl";
    const d = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, PageDown: 1, PageUp: -1 }[k];
    if (d) { e.preventDefault(); C.reader.turn(d); return; }
  }
  const go = (fn) => { e.preventDefault(); fn(); };
  if (k === "?") { go(() => { if (state.menu && state.menu.kind === "keys") history.back(); else if (!state.menu) openMenu("keys"); }); return; }
  if (state.menu || state.sheet || state.image || state.side || state.batch || state.downloads || state.syncPage || state.news) return;
  if (state.open) {
    const p = state.open;
    const size = (d) => setReading({ size: clamp(readingPrefs().size + d, SIZE_MIN, SIZE_MAX) });
    const acts = {
      Escape: () => $("readerBack").click(),
      j: () => jumpSection(1), k: () => jumpSection(-1),
      "/": () => openFind(),
      t: () => (pinned.matches ? setReading({ rail: !readingPrefs().rail }) : !$("readerContents").hidden && toggleSheet("contents")),
      s: () => { const b = $("readerAloud").hidden ? $("readerScroll") : $("readerAloud"); if (!b.hidden) b.click(); },
      a: () => toggleSheet("reading"),
      h: () => !$("readerMarks").hidden && $("readerMarks").click(),
      ...Object.fromEntries(MARK_COLORS.map((c, i) => [String(i + 1), () => markKey(i)])),
      d: () => inkReady() && inkSet(!C.ink.on),
      // While drawing (1.56.0).
      p: () => C.ink.on && (C.ink.setting({ tool: "pen" }), inkKeep()),
      b: () => C.ink.on && (C.ink.setting({ tool: "highlighter" }), inkKeep()),
      e: () => C.ink.on && (C.ink.setting({ tool: "eraser" }), inkKeep()),
      "[": () => C.ink.on && inkSize(-1), "]": () => C.ink.on && inkSize(1),
      l: () => !$("readerTranslate").hidden && $("readerTranslate").click(),
      "+": () => size(1), "=": () => size(1), "-": () => size(-1), "−": () => size(-1),
      o: () => /^https?:/.test(p.url || "") && C.platform.openOutside(p.url),
      // In scroll, Space in the page scrolls it already.
      " ": () => (C.reader.paged ? C.reader.turn(e.shiftKey ? -1 : 1)
        : !inFrame && $("readerFrame").contentWindow.scrollBy({ top: (e.shiftKey ? -0.85 : 0.85) * $("readerFrame").clientHeight, behavior: M.reduced() ? "auto" : "smooth" })),
    };
    const act = acts[k.length === 1 ? k.toLowerCase() : k];
    if (act && !(k === " " && inFrame && !C.reader.paged)) go(act);
    return;
  }
  if (state.settings) {
    if (k === "Escape") go(() => history.go(state.section && wide.matches ? -2 : -1));
    return;
  }
  if (Date.now() - gAt < 1200) {
    gAt = 0;
    const to = { l: "library", f: "feeds", n: "newsletters", h: "highlights", s: "reading", r: "reading", e: "discover" }[k.toLowerCase()];
    if (to) go(() => goPlace(to));
    return;
  }
  const p = focusedPage(), node = focusedNode();
  const acts = {
    g: () => { gAt = Date.now(); },
    // 1 to 5: the sidebar's places, in its order (1.49.0).
    ...Object.fromEntries(PLACE_KEYS.map((to, i) => [String(i + 1), () => (state.folder ? toLibrary() : Promise.resolve()).then(() => goPlace(to))])),
    "/": () => (state.folder ? toLibrary() : Promise.resolve()).then(() => {
      if (state.place === "highlights") { $("highlights").querySelector(".hl-search input").focus(); return; }
      if (state.place === "discover") { openDzSearch(); return; }
      if (postPlace() && (state.place === "feeds" ? siteFeeds() : mailBoxes()).length) { openPostSearch(); return; }
      return (["feeds", "newsletters", "reading"].includes(state.place) || C.ext.place(state.place) ? goPlace("library") : Promise.resolve()).then(openSearch);
    }),
    d: () => openDownloads(),
    ",": () => openSettings(),
    Escape: () => history.state && history.state.view && history.back(),
    ArrowDown: () => moveFocus(1), ArrowUp: () => moveFocus(-1),
    x: () => node && (state.select ? tapPages(node.dataset.ids.split(",")) : startSelect(node.dataset.ids.split(","))),
    f: () => p && setFavourite([p], !p.fav),
    e: () => p && !p.link && openMenu("export", p),
    F2: () => p && openMenu("rename", p),
    Delete: () => (state.select ? deletePicked() : p && deletePage(p, "keys")),
    Backspace: () => (state.select ? deletePicked() : p && deletePage(p, "keys")),
  };
  const act = acts[k.length === 1 ? k.toLowerCase() : k];
  if (act) go(act);
}

// The line between a list and the post beside it, from 1280 px (1.49.0):
// drag it, or focus it and use the arrow keys; a double-click puts it
// back in the middle. The share of the room is kept, so it holds when
// the window is resized. Right to left the panes run from the right.
{
  const grip = $("paneGrip"), KEY = "waypage.listShare", MIN = 320, PANE_MIN = 400;
  const sideW = () => $("sidebar").offsetWidth || 272;
  const room = () => innerWidth - sideW();
  let share = load(KEY, 0.5);
  function place(f) {
    const r = room(), w = Math.round(Math.max(MIN, Math.min(r - PANE_MIN, f * r)));
    document.documentElement.style.setProperty("--list-w", w + "px");
    grip.setAttribute("aria-valuenow", String(Math.round((w / r) * 100)));
    return w / r;
  }
  const keep = (f) => { share = place(f); store(KEY, share); };
  place(share);
  addEventListener("resize", () => place(share));
  grip.addEventListener("pointerdown", (e) => {
    if (e.button) return;
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    grip.classList.add("dragging");
    document.body.classList.add("resizing");
  });
  grip.addEventListener("pointermove", (e) => { if (grip.classList.contains("dragging")) share = place(((M.rtl() ? innerWidth - e.clientX : e.clientX) - sideW()) / room()); });
  const end = () => {
    if (!grip.classList.contains("dragging")) return;
    grip.classList.remove("dragging");
    document.body.classList.remove("resizing");
    keep(share);
  };
  grip.addEventListener("pointerup", end);
  grip.addEventListener("pointercancel", end);
  grip.addEventListener("dblclick", () => keep(0.5));
  grip.addEventListener("keydown", (e) => {
    const d = { ArrowLeft: -0.02, ArrowRight: 0.02 }[e.key];
    if (d) { e.preventDefault(); keep(share + M.x(d)); }
    else if (e.key === "Home" || e.key === "End") { e.preventDefault(); keep(e.key === "Home" ? 0 : 1); }
  });
}

// Ctrl V (⌘ V) with no field to paste into saves the link, from 700 px.
document.addEventListener("paste", (e) => {
  if (!wide.matches || typingIn(e.target) || state.open || state.menu || state.settings || state.batch) return;
  const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
  const links = linksFrom(text);
  if (!links.length) return;
  e.preventDefault();
  saveTyped(text);
});

// A link dropped anywhere on the library is saved (1.5.0); a list of
// them goes to Save with options.
function saveTyped(text) {
  if (state.place === "feeds") { openMenu("addFeed", { url: text.trim() }); return; }
  if (linksFrom(text).length > 1) { openBatch(text); return; }
  const url = linkFrom(text);
  if (!url) { toast(t("That doesn't look like a link. Paste the page's address.")); return; }
  savePage(url);
}
{
  const zone = $("dropZone");
  // Files are opened by the window's own drop handler above; the zone
  // only says so. A file manager's drag also carries file:// links,
  // which aren't saved as pages.
  const filey = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const linky = (e) => !!e.dataTransfer && !filey(e) && [...e.dataTransfer.types].some((t) => t === "text/uri-list" || t === "text/plain")
    && !state.open && !state.menu && !state.settings && !state.batch;
  const shown = (e) => filey(e) ? !state.menu : linky(e);
  let depth = 0;
  // The zone is there while something is held over the window and gone
  // when it leaves, with no motion: a mouse wants it at once (1.11.0).
  const hide = () => { depth = 0; zone.hidden = true; };
  document.addEventListener("dragenter", (e) => {
    if (!shown(e)) return;
    depth++;
    if (zone.hidden) {
      $("dropTitle").textContent = filey(e) ? t("Drop to open") : state.place === "feeds" ? t("Drop to follow") : t("Drop to save");
      $("dropNote").textContent = filey(e) ? FILE_KINDS_LINE : state.place === "feeds" ? t("Followed like an added feed") : t("Saved for reading offline, like a pasted link");
      zone.hidden = false;
    }
  });
  document.addEventListener("dragover", (e) => { if (linky(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  document.addEventListener("dragleave", () => { if (--depth <= 0) hide(); });
  document.addEventListener("drop", (e) => {
    if (filey(e) && state.menu) { e.preventDefault(); e.stopPropagation(); hide(); return; }
    if (!linky(e)) { hide(); return; }
    e.preventDefault();
    hide();
    const text = e.dataTransfer.getData("text/uri-list").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).join("\n") || e.dataTransfer.getData("text/plain");
    if (text) saveTyped(text);
  });
}

// ---- Gestures (0.28.2) ----

// Holding a feed (its chip, or its row in the sidebar), or right-clicking
// it, opens its settings. Holding a post starts picking posts with it
// picked, as holding a clip does in the library.
function holdFeeds(root) {
  let timer = null, start = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const target = (e) => e.target.closest(".post-act") ? null : e.target.closest("[data-post], [data-feed]");
  const open = (node) => {
    if (node.dataset.post) {
      if (navigator.vibrate) navigator.vibrate(10);
      if (!state.feedPick) startFeedPick();
      tapPost(node.dataset.post);
      return;
    }
    const f = feeds.find((x) => x.url === node.dataset.feed);
    if (!f) return;
    if (navigator.vibrate) navigator.vibrate(10);
    (state.side ? back() : Promise.resolve()).then(() => openMenu("feed", f));
  };
  root.addEventListener("pointerdown", (e) => {
    fired = false;
    const node = e.button === 0 && target(e);
    if (!node) return;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => { timer = null; fired = true; open(node); }, 480);
  });
  root.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(t, cancel);
  root.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener("contextmenu", (e) => {
    const node = target(e);
    if (!node) return;
    e.preventDefault();
    cancel();
    if (!fired) { fired = true; open(node); }
  });
}

// Android's Back in Library or Feeds opens the sidebar (0.29.0), and Back
// again with it open that way puts the app away. Anywhere else Back
// steps back through history as before.
let sideByBack = false;
const backOpens = C.platform.onBack(({ canGoBack }) => {
  if (lockUp()) { lockBack(); return; }
  if (state.side && sideByBack) { C.platform.exitApp(); return; }
  if (canGoBack && history.state && history.state.view) { history.back(); return; }
  if (!state.side && !pinned.matches) { openSide(); sideByBack = true; return; }
  C.platform.exitApp();
});

// The sidebar follows a finger dragging it toward its edge (0.30.5; the
// left, or the right in Hebrew): let go past a third of its width, or
// with a flick, and it closes from there; short of that it springs back.
// Its rows still scroll up and down. dx is kept as the screen's px; M.x()
// turns it toward the sidebar's edge and back.
let sideDragged = 0, sideDragEnd = 0;
function dragSide() {
  const side = $("sidebar"), catcher = $("sideCatch");
  let drag = null;
  const down = (e) => {
    if (!state.side || e.pointerType === "mouse" || !e.isPrimary) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, on: false, t: e.timeStamp, v: 0, w: side.offsetWidth };
  };
  const move = (e) => {
    if (!drag || !e.isPrimary) return;
    const dx = Math.min(0, M.x(e.clientX - drag.x)), dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(e.clientX - drag.x)) { drag = null; return; }
      if (dx > -10) return;
      drag.on = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    }
    const dt = Math.max(1, e.timeStamp - drag.t);
    drag.v = (dx - drag.dx) / dt;
    drag.t = e.timeStamp;
    drag.dx = dx;
    side.style.transform = "translateX(" + M.x(dx) + "px)";
    catcher.style.opacity = String(Math.max(0, 1 + dx / drag.w));
    if (!M.reduced()) drift("translateX(" + M.x(Math.round(drag.w * 0.2 * (1 + dx / drag.w))) + "px)");
  };
  const up = () => {
    const d = drag;
    drag = null;
    if (!d || !d.on) return;
    sideDragEnd = performance.now();
    side.style.transform = "";
    const lib = libParts();
    if (d.dx < -d.w / 3 || d.v < -0.5) { sideDragged = M.x(d.dx); history.back(); }
    else {
      M.dim(catcher, true);
      M.slideBack(side, M.x(d.dx), M.reduced() ? null : lib);
      if (!M.reduced()) drift(M.sideDrift(side));
    }
  };
  for (const n of [side, catcher]) {
    n.addEventListener("pointerdown", down);
    n.addEventListener("pointermove", move);
    n.addEventListener("pointerup", up);
    n.addEventListener("pointercancel", up);
  }
  // A drag that ends on the catch isn't a tap on it.
  catcher.addEventListener("click", (e) => { if (performance.now() - sideDragEnd < 400) e.stopImmediatePropagation(); }, true);
}

// Where there's no Back to use (iOS, a browser), a swipe in from the
// sidebar's edge (the left, or the right in Hebrew) opens it. Rows that
// scroll sideways keep theirs.
const EDGE = 24;
function swipeToSide(root) {
  if (backOpens) return;
  let start = null;
  root.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 && (M.rtl() ? innerWidth - t.clientX : t.clientX) <= EDGE && !state.select && !state.menu && !state.side
      && !e.target.closest(".filters, .folder-strip, input, textarea, .drag-handle, .dropdown-menu") ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = e.touches[0], dx = M.x(t.clientX - start.x), dy = Math.abs(t.clientY - start.y);
    if (dy > 24 || dx < -24) { start = null; return; }
    if (dx > 64 && dy < dx / 2) { start = null; openSide(); }
  }, { passive: true });
  root.addEventListener("touchend", () => { start = null; }, { passive: true });
}

// In Feeds and Newsletters a swipe sideways goes to the feed or address
// next to this one, in the chips' order, All first (1.45.5). The list
// follows the finger, then the next one comes in from that side. Not from
// the sidebar's edge or on the chips, which scroll sideways. Right to
// left the chips run from the right, so a swipe to the right goes on.
function swipeFeeds(root) {
  let go = null;
  const chips = () => [...root.querySelectorAll(".feed-chips:not([hidden]) .chip")];
  // The chips stay put; what's under them slides (Daniel, 1.45.6).
  // Discover's search and chips sit in one box at the top; it stays too,
  // and so does the search field over Feeds and Newsletters.
  const parts = () => [...root.children].filter((x) => !x.matches(".feed-chips, .post-search") && !x.querySelector(".feed-chips"));
  const move = (t) => parts().forEach((x) => { x.style.transform = t; });
  const play = (frames, timing) => parts().map((x) => x.animate(frames, timing));
  const neighbour = (d) => {
    const all = chips(), at = all.findIndex((c) => c.classList.contains("on"));
    return at < 0 ? null : all[at + d] || null;
  };
  root.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    go = e.touches.length === 1 && (M.rtl() ? innerWidth - t.clientX : t.clientX) > EDGE && !state.feedPick && !state.side && !state.menu && chips().length > 1
      // Discover's row of covers scrolls sideways on its own; its grid doesn't.
      && !e.target.closest(".filters, input, textarea, .dz-covers:not(.dz-grid), .dropdown-menu") ? { x: t.clientX, y: t.clientY, on: false, dx: 0, t: e.timeStamp } : null;
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (!go) return;
    const t = e.touches[0], dx = t.clientX - go.x, dy = t.clientY - go.y;
    if (!go.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { go = null; return; }
      if (Math.abs(dx) < 16) return;
      go.on = true;
    }
    go.dx = dx;
    // Past the first or last, it gives a little and no more.
    const to = neighbour(M.x(dx < 0 ? 1 : -1));
    if (!M.reduced()) move("translateX(" + (to ? dx : dx / 4) + "px)");
  }, { passive: true });
  const end = (e) => {
    const g = go;
    go = null;
    if (!g || !g.on) return;
    const d = g.dx < 0 ? 1 : -1, to = neighbour(M.x(d));
    const fast = Math.abs(g.dx) / Math.max(1, e.timeStamp - g.t) > 0.5;
    const w = root.offsetWidth || innerWidth;
    if (!to || (Math.abs(g.dx) < w / 4 && !fast)) {
      if (M.reduced()) return;
      play([{ transform: "translateX(" + (to ? g.dx : g.dx / 4) + "px)" }, { transform: "none" }], M.timing("controlEdge"));
      move("");
      return;
    }
    if (M.reduced()) { to.click(); return; }
    const out = play([{ transform: "translateX(" + g.dx + "px)" }, { transform: "translateX(" + -d * w + "px)" }], { ...M.timing("control"), fill: "forwards" });
    move("");
    Promise.all(out.map((a) => a.finished)).then(() => {
      to.click();
      scrollTo(0, 0);
      play([{ transform: "translateX(" + d * w + "px)" }, { transform: "none" }], M.timing("sheetEdge"));
      out.forEach((a) => a.cancel());
      const on = root.querySelector(".feed-chips .chip.on");
      if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, () => {});
  };
  root.addEventListener("touchend", end, { passive: true });
  root.addEventListener("touchcancel", end, { passive: true });
}

// Pulling down from the top checks for what's new: in Feeds the feeds
// on show (all, or the picked one), in the library every collection
// that follows a series, for new chapters.
const PULL_AT = 64;
function pullToCheck(root) {
  const hint = $("pullHint");
  let start = null, pulled = 0;
  const set = (h, settle) => {
    hint.classList.toggle("settle", !!settle && !M.reduced());
    hint.style.height = h + "px";
    hint.classList.toggle("ready", h >= PULL_AT);
  };
  root.addEventListener("touchstart", (e) => {
    // Not from inside an open drop-down: pulling its list down to its top
    // reloaded the page behind it and shut the menu (2026-11).
    start = !feedsChecking && !dailyRunning && scrollY <= 0 && e.touches.length === 1 && !state.side && !state.menu
      && !e.target.closest(".dropdown-menu") ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    pulled = 0;
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = e.touches[0], dy = t.clientY - start.y, dx = Math.abs(t.clientX - start.x);
    if (dy < 0 || (pulled === 0 && dx > dy)) { start = null; if (pulled) set(0, true); pulled = 0; return; }
    pulled = Math.min(PULL_AT * 1.4, dy * 0.5);
    hint.hidden = false;
    set(pulled);
  }, { passive: true });
  root.addEventListener("touchend", () => {
    if (!start) return;
    start = null;
    if (pulled < PULL_AT) { set(0, true); pulled = 0; return; }
    pulled = 0;
    set(48, true);
    hint.classList.add("busy");
    const picked = state.feed && feeds.find((f) => f.url === state.feed);
    const done = () => { hint.classList.remove("busy"); set(0, true); };
    // A pull also looks for a newer Waypage (0.34.0); the bar says so.
    const app = checkForNewerApp().catch(() => {});
    if (state.place === "feeds" || state.place === "newsletters") { Promise.all([checkNow(picked || null), app]).finally(done); return; }
    if (state.place === "discover") { Promise.all([dzReadRR(true), app]).finally(done); return; }
    // And in the library, in the watched folder (1.1.0).
    Promise.all([pullChapters(app), lookInFolder(false)]).finally(done);
  }, { passive: true });
}

// Website sync collections' new chapters and live clips' changes.
async function pullChapters(app) {
  const series = allFolders().some((n) => isSeries(folderPages(n)));
  const live = state.pages.some(liveNow);
  if (!navigator.onLine || (series && !live)) { await Promise.all([checkChapters(), app]); return; }
  if (!series && !live) {
    await app;
    toast(updateOut() ? t("Waypage {latest} is out.", { latest: upd.latest }) : t("Nothing new."));
    return;
  }
  const [found, changed] = await Promise.all([series ? dailyCheck(true) : 0, updateLiveClips(), app]);
  renderLibrary();
  const said = [found ? tn(found, "New chapters in 1 collection.", "New chapters in {n} collections.") : null,
    changed ? tn(changed, "1 live clip updated.", "{n} live clips updated.") : null].filter(Boolean);
  toast(said.length ? said.join(" ") : series ? t("No new chapters.") : t("Nothing new."));
}

async function checkChapters() {
  if (!navigator.onLine) { toast(t("You're offline. Check again when you're back online.")); return; }
  if (!allFolders().some((n) => isSeries(folderPages(n)))) { toast(t("No collections follow a series yet.")); return; }
  const found = await dailyCheck(true);
  renderLibrary();
  toast(found ? tn(found, "New chapters in 1 collection.", "New chapters in {n} collections.") : t("No new chapters."));
}

// ---- Add a feed, and a feed's settings ----

const picturesLine = (mode) => !C.platform.native ? ""
  : mode === "full" ? t(", with full pictures") : mode === "links" ? t(", with pictures as links") : t(", with pictures as previews");

function addFeedSheet() {
  let found = null, mode = "show";
  const input = el("input", { class: "feed-input", type: "url", inputmode: "url", placeholder: t("A site or its feed"), "aria-label": t("A site or its feed"),
    autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "go" });
  const help = el("p", { class: "footnote" }, t("A site's address is enough: Waypage finds its feed."));
  const card = el("div", { class: "found-feed" });
  const note = el("p", { class: "footnote" });
  const modeBox = el("div", { class: "feed-mode" },
    el("h2", { class: "overline" }, t("New posts")),
    seg("add-feed-mode", t("New posts"), [{ value: "show", label: t("Show them") }, { value: "save", label: t("Save them") }], mode,
      (v) => { mode = v; paintNote(); }),
    note);
  const go = el("button", { class: "btn-primary", type: "button" }, t("Find its feed"));
  const paintNote = () => {
    if (!found) return;
    note.textContent = t("{x}Saved posts go into a collection called {cleanTag}{picturesLine}.", { x: mode === "save" ? t("New posts save themselves while you're online. ") : t("New posts wait in Feeds for you to save. "), cleanTag: cleanName(found.feed.title), picturesLine: picturesLine(feedImages()) });
  };
  const reset = () => {
    found = null;
    card.hidden = true;
    modeBox.hidden = true;
    go.textContent = t("Find its feed");
    help.className = "footnote";
    help.textContent = t("A site's address is enough: Waypage finds its feed.");
  };
  reset();
  const find = async () => {
    const typed = input.value.trim();
    if (!typed) { input.focus(); return; }
    go.disabled = true;
    go.textContent = t("Looking for its feed…");
    try {
      const got = await C.feeds.findFeed(linkFrom(typed) || typed);
      const had = feeds.find((f) => sameUrl(f.url, got.url));
      if (had) throw new C.feeds.FeedError(t("You already follow {title}.", { title: had.title }));
      if (input.value.trim() !== typed) return;
      found = got;
      fill(card, feedMark({ url: got.url, link: got.feed.link, icon: got.feed.icon, title: got.feed.title }),
        el("span", { class: "found-text" },
          el("span", { class: "found-name", dir: "auto" }, got.feed.title),
          el("span", { class: "meta" }, got.feed.releases ? releasesLine(got.feed.items) : rateLine(got.feed.items))));
      card.hidden = false;
      modeBox.hidden = false;
      help.className = "footnote";
      help.textContent = C.feeds.siteOf(got.url) + " · " + tn(got.feed.items.length, "1 post in its feed", "{n} posts in its feed");
      go.textContent = t("Follow");
      paintNote();
    } catch (e) {
      reset();
      help.className = "footnote warn";
      help.textContent = e instanceof C.feeds.FeedError ? e.message : t("Couldn't read that. Check the address and try again.");
    } finally {
      go.disabled = false;
    }
  };
  const follow = async () => {
    const got = found;
    const f = { url: got.url, title: cleanName(got.feed.title) || C.feeds.siteOf(got.url), link: got.feed.link, icon: got.feed.icon,
      mode, images: feedImages(), folder: cleanName(got.feed.title) || C.feeds.siteOf(got.url), days: got.feed.releases ? 30 : 7,
      addedAt: Date.now(), checkedAt: Date.now(), error: "", items: [] };
    // A GitHub repo's releases (2026-11) come a few a month, not a day.
    if (got.feed.releases) f.releases = true;
    // A newsletter address pasted here (1.43.0) goes to Newsletters.
    const mail = isMail(f);
    if (mail) Object.assign(f, { folder: f.title, days: MAIL_DAYS });
    mergeFeed(f, got.feed);
    feeds.push(f);
    askToNotify = true;
    saveFeeds();
    await back();
    await goPlace(mail ? "newsletters" : "feeds", f.url);
    toast(t("Following {title}", { title: f.title }));
    if (mode === "save") autoSave(f);
  };
  go.addEventListener("click", () => (found ? follow() : find()));
  input.addEventListener("input", () => { if (found) reset(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
  const preset = state.menu && state.menu.page && state.menu.page.url;
  if (preset) { input.value = preset; setTimeout(find, 0); }
  else setTimeout(() => input.focus({ preventScroll: true }), 50);
  return el("div", { class: "page-controls add-feed" },
    el("h2", { class: "menu-title" }, t("Add a feed")),
    el("div", { class: "feed-field" }, input, help),
    card, modeBox, go);
}

function feedSheet() {
  const f = state.menu.page;
  const mail = isMail(f);
  const set = (change) => { Object.assign(f, change); saveFeeds(); paintFeeds(); };
  const row = (label, control) => el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, label), control);
  const into = el("input", { class: "tag-input", type: "text", value: f.folder || "", placeholder: t("No collection"), "aria-label": t("Save into"),
    maxlength: String(NAME_MAX), enterkeyhint: "done", autocapitalize: "sentences" });
  into.addEventListener("change", () => set({ folder: cleanName(into.value) }));
  into.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); into.blur(); } });
  const shortUrl = mail ? mailAddress(f) : f.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return el("div", { class: "page-controls feed-sheet" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, f.title),
      el("p", { class: "meta" }, shortUrl)),
    el("div", { class: "rc-list" },
      row(mail ? t("New emails") : t("New posts"), seg("feed-mode", mail ? t("New emails") : t("New posts"), [{ value: "show", label: t("Show them") }, { value: "save", label: t("Save them") }], f.mode,
        (v) => { set({ mode: v }); if (v === "save") autoSave(f); })),
      C.platform.native ? row(t("Pictures"), seg("feed-images", t("Pictures"), [
        { value: "previews", label: t("Previews") }, { value: "full", label: t("Full") }, { value: "links", label: t("Links") },
      ], f.images || feedImages(), (v) => set({ images: v }))) : null,
      row(t("Save into"), into),
      row(mail ? t("Skip emails older than") : t("Skip posts older than"), seg("feed-days", mail ? t("Skip emails older than") : t("Skip posts older than"), FEED_DAYS, String(f.days || 7), (v) => set({ days: Number(v) }))),
      C.platform.native && notesPrefs().on ? row(t("Notifications"), seg("feed-notes", t("Notifications"), [{ value: "on", label: t("On") }, { value: "off", label: t("Off") }],
        feedQuiet(f) ? "off" : "on", (v) => setFeedQuiet(f, v === "off"))) : null),
    el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || (f.checkedAt ? t("Checked {when}", { when: whenText(f.checkedAt) }) + ". " : "") + rateLine(f.items, mail) + "."),
    mail && !C.platform.canFetchPages ? null : el("button", { class: "sheet-row", type: "button", onclick: (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = t("Checking…");
      checkNow(f).then(redrawMenu);
    } }, t("Check now")),
    mail ? el("button", { class: "sheet-row", type: "button", onclick: () => copyText(mailAddress(f), t("Address copied.")) }, t("Copy address")) : null,
    mail ? el("button", { class: "sheet-row danger", type: "button", onclick: () => removeMailBox(f) }, C.platform.canFetchPages ? t("Delete the address") : t("Remove the address"))
      : el("button", { class: "sheet-row danger", type: "button", onclick: () => unfollow(f) }, t("Unfollow")),
    el("p", { class: "footnote" }, !mail ? t("Unfollowing keeps the posts you saved.") : C.platform.canFetchPages
      ? t("Deleting it makes its emails bounce. The ones you saved stay.") : t("Removed here, it still takes emails. Delete it in Waypage on your phone to stop them.")));
}

async function unfollow(f) {
  feeds = feeds.filter((x) => x !== f);
  saveFeeds();
  if (state.feed === f.url) state.feed = null;
  await back();
  paintFeeds();
  toast(t("Unfollowed {title}. The posts you saved stay.", { title: f.title }));
}

// ---- Going to a place (moved from app-saving.js, 2026-11) ----
// Library, Feeds or Highlights under the same bar; only the title changes.
function paintPlace() {
  const feedsOn = state.place === "feeds";
  const mailOn = state.place === "newsletters";
  const marksOn = state.place === "highlights";
  const readOn = state.place === "reading";
  const findOn = state.place === "discover";
  // An extension's place (Anki, Calibre, ...), or null.
  const ext = C.ext.place(state.place);
  $("placeTitle").textContent = feedsOn ? t("Feeds") : mailOn ? t("Newsletters") : marksOn ? t("Highlights") : readOn ? t("Stats") : findOn ? t("Discover") : ext ? ext.place.title() : t("Library");
  $("libraryView").dataset.place = state.place;
  $("library").hidden = feedsOn || mailOn || marksOn || readOn || findOn || !!ext;
  $("feeds").hidden = !feedsOn;
  $("newsletters").hidden = !mailOn;
  $("highlights").hidden = !marksOn;
  $("reading").hidden = !readOn;
  $("discover").hidden = !findOn;
  for (const x of C.ext.places()) $(x.id).hidden = x.id !== state.place;
  $("paneNote").textContent = marksOn ? t("Pick a highlight to read it here") : readOn ? t("Pick a clip to read it here") : mailOn ? t("Pick an email to read it here") : t("Pick a post to read it here");
  // The bottom field follows a feed in Feeds, makes a newsletter address
  // in Newsletters (1.43.1), searches Royal Road or follows a site in
  // Discover, and saves a link elsewhere.
  $("saveUrl").placeholder = feedsOn ? t("Paste a site or feed to follow") : mailOn ? t("Name a new address") : t("Paste a link to save");
  $("saveUrl").inputMode = mailOn ? "text" : "url";
  $("saveUrl").autocapitalize = mailOn ? "sentences" : "off";
  $("saveUrl").enterKeyHint = "go";
  if (mailOn) $("saveUrl").maxLength = NAME_MAX; else $("saveUrl").removeAttribute("maxlength");
  document.querySelector('label[for="saveUrl"]').textContent = feedsOn ? t("Site or feed") : mailOn ? t("New address's name") : t("Page link");
  $("saveForm").querySelector(".btn-primary").textContent = feedsOn ? t("Follow") : mailOn ? t("Make") : t("Save");
  $("severalBtn").hidden = feedsOn || mailOn || findOn || !!ext;
  $("viewBtn").hidden = !findOn && !(state.place === "library" && state.pages.length);
  if (feedsOn || mailOn || marksOn || readOn || findOn || !!ext) { if (state.query) clearSearch(); }
  if (feedsOn) renderFeeds();
  else if (mailOn) renderNewsletters();
  else if (marksOn) renderHighlights();
  else if (readOn) renderReading();
  else if (findOn) openDiscover();
  else if (ext) renderExtension(ext.id);
  else renderLibrary();
}

function goPlace(place, feed) {
  // The pinned sidebar is there over a collection or Files too: a tap in
  // it steps back to the library first.
  if (pinned.matches && history.state && history.state.view) return toLibrary().then(() => goPlace(place, feed));
  if (place !== state.place) leavePostSearch();
  state.place = place;
  state.feed = feed || null;
  store(PLACE_KEY, place);
  const done = state.side ? back() : Promise.resolve();
  paintPlace();
  if (pinned.matches) renderSide();
  scrollTo(0, 0);
  return done;
}
