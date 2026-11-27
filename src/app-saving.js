// Waypage's shell (1.14.0): saving several, next links, new chapters and
// Website sync. Sync is in app-sync.js, Feeds in app-feeds.js, the widgets
// in app-widgets.js. See app.js for how the parts share.
// ---- Saving several ----
// Opens when a paste or share holds more than one link: the links (one
// a line, editable), the folder to save them into, and Save.

// `from` is the page read as a list of chapters, which can still be
// saved as one page; `siteTags` ({ site, tags }) the tags that page gave it.
function openBatch(text, fromHistory, folder, from, siteTags) {
  if (state.batch) return;
  state.batch = true;
  renderBatch(linksFrom(text).join("\n"), folder || null, from, siteTags);
  if (!fromHistory) history.pushState({ view: "batch", folder: state.folder || undefined }, "");
  // Set once it shows: a hidden screen keeps its old scroll.
  const shown = pushScreen($("batchView"));
  $("batchBody").scrollTop = 0;
  shown.then(() => $("batchBack").focus());
}

function closeBatch() {
  if (!state.batch) return;
  state.batch = false;
  popScreen($("batchView"));
}

const LONG_LIST = 50;

// The site's tags join the picked ones when this is on; off by default,
// and remembered.
const SITE_TAGS_KEY = "waypage.saveSiteTags";
const TAG_NEW_KEY = "waypage.saveTagNew";

function renderBatch(text, preset, from, siteTags) {
  let folder = preset;
  // Saved into a series: an existing one, or New series….
  let series = false;
  // The page the chapters were read from, kept on the folder (0.26.0).
  let source = from || null;
  let mode = load(IMAGES_KEY, "previews");
  // A comic's folder saves its next chapters as comics too.
  let kind = preset && folderPages(preset).some((p) => p.comic) ? "comic" : "article";
  if (kind === "comic") mode = "full";
  const tags = [];
  let drawTagNew = null;
  const area = el("textarea", { class: "batch-links", rows: "6", "aria-label": t("Links, one a line"), spellcheck: "false",
    autocapitalize: "off", autocomplete: "off", dir: "ltr" });
  area.value = text;
  const count = el("p", { class: "meta batch-count" });
  // Links already saved can be left where they are, or (switched off)
  // moved into this folder at their place in the list.
  const skip = el("input", { class: "switch batch-skip", type: "checkbox", role: "switch", checked: true, onchange: () => sync() });
  const skipNote = el("span", { class: "choice-note" });
  const skipRow = el("div", { class: "group" }, el("label", { class: "row" },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, t("Skip links already saved")), skipNote), skip));
  const go = el("button", { class: "btn-primary batch-go", type: "submit" });
  const input = el("input", { class: "tag-input", type: "text", placeholder: t("New collection"), "aria-label": t("New collection"),
    maxlength: String(NAME_MAX), enterkeyhint: "done", autocapitalize: "sentences" });
  // One link may be a contents page: its chapters replace it, and the
  // folder takes its name.
  const finder = el("button", { class: "btn-small batch-find", type: "button", onclick: async () => {
    const url = linksFrom(area.value)[0];
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    finder.disabled = true;
    finder.textContent = t("Finding chapters…");
    try {
      const found = noteStatus(await C.save.findChapters(url));
      if (found.links.length) {
        source = found.page || url;
        area.value = found.links.join("\n");
        if (found.siteTags) setSiteTags(found.siteTags);
        if (!folder) choose(folderName(found.title || C.save.siteName(url)));
        sync();
      } else toast(t("Couldn't find a list of chapters on that page."));
    } catch (e) { toast(e instanceof C.save.SaveError ? e.message : t("Couldn't read that page. Try again.")); }
    finder.disabled = false;
    finder.textContent = t("Find chapters on this page");
  } }, t("Find chapters on this page"));
  const sync = () => {
    const links = linksFrom(area.value);
    const had = links.filter((u) => savedAs(u)).length;
    const n = skip.checked ? links.length - had : links.length;
    finder.hidden = links.length !== 1;
    skipRow.hidden = !had;
    skipNote.textContent = had === links.length ? t("All {had} are already saved", { had: had })
      : skip.checked ? t("{had} already saved, left where they are", { had }) : folder ? t("{had} already saved, moved into {folder}", { had, folder }) : t("{had} already saved", { had });
    count.textContent = links.length ? tn(links.length, "1 link", "{n} links") : t("No links yet. Paste them here, one a line.");
    go.textContent = n ? (folder ? t("Save {clips} into {folder}", { clips: countLine(n), folder }) : t("Save {clips}", { clips: countLine(n) })) : links.length ? t("Nothing new to save") : t("Save");
    go.disabled = !n;
    if (drawTagNew) drawTagNew();
  };
  const pick = (f, typed) => { folder = f; if (!typed) input.value = ""; sync(); };
  // The collection: None, one already there, or a new one typed in.
  const NEW = "\u0000new", NEW_SERIES = "\u0000series";
  const folderHead = el("h2", { class: "overline" });
  const folderNote = el("p", { class: "meta" });
  const paintKind = () => {
    folderHead.textContent = series ? t("Series") : t("Collection");
    folderNote.textContent = series ? t("Clips in a series keep the order of the links. It shows under Series in your Library.") : t("Clips in a collection keep the order of the links.");
    input.placeholder = series ? t("New series") : t("New collection");
    input.setAttribute("aria-label", input.placeholder);
  };
  // None, the collections and series there are, or a new one of either.
  const folderPick = dropdown({ label: t("Collection or series"), cls: "field-pick batch-folder", value: "",
    options: [{ value: "", label: t("None") },
      ...foldersByUse().map((f) => ({ value: f, label: isSeriesFolder(f) ? t("{name} · series", { name: f }) : f })),
      { value: NEW, label: t("New collection…") }, { value: NEW_SERIES, label: t("New series…") }],
    onpick: (v) => {
      const fresh = v === NEW || v === NEW_SERIES;
      input.hidden = !fresh;
      series = fresh ? v === NEW_SERIES : isSeriesFolder(v);
      paintKind();
      if (fresh) { pick(cleanName(input.value) ? folderName(input.value) : null, true); input.focus(); }
      else pick(v || null);
    } });
  input.hidden = true;
  paintKind();
  const choose = (name) => {
    const had = name && allFolders().find((f) => sameTag(f, name));
    if (had) series = series || isSeriesFolder(had);
    paintKind();
    folderPick.set(had || (name ? (series ? NEW_SERIES : NEW) : ""));
    input.hidden = !name || !!had;
    if (had) pick(had);
    else { input.value = name || ""; pick(name || null, true); }
  };
  // Tags for every page this saves: the ones picked, each with its ×,
  // then a dropdown of the rest and "New tag…", which opens a field.
  const tagBox = el("div", { class: "tag-edit" });
  let typing = false;
  const drawTags = (focus) => {
    const others = allTags().filter((t) => !tags.some((x) => sameTag(x, t)));
    const tagInput = el("input", { class: "tag-input", type: "text", placeholder: t("New tag"), "aria-label": t("New tag"),
      maxlength: "32", enterkeyhint: "done", autocapitalize: "off" });
    const add = (raw) => {
      const t = cleanTag(raw);
      if (!t || tags.some((x) => sameTag(x, t))) return;
      tags.push(allTags().find((x) => sameTag(x, t)) || t);
      typing = false;
      drawTags("pick");
    };
    tagInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(tagInput.value); } });
    const showInput = typing || !allTags().length;
    tagInput.hidden = !showInput;
    const tagPick = dropdown({ label: t("Add a tag"), placeholder: t("Add a tag"), cls: "field-pick batch-tag", value: null,
      options: [...others.map((t) => ({ value: t, label: t })), { value: NEW, label: t("New tag…") }],
      onpick: (v) => { if (v === NEW) { typing = true; drawTags("input"); } else add(v); } });
    fill(tagBox,
      tags.length ? el("div", { class: "chips" },
        ...tags.map((t) => el("button", { class: "chip on", type: "button", "aria-label": i18n.t("Remove tag {t}", { t: t }),
          onclick: () => { tags.splice(tags.indexOf(t), 1); drawTags(); } }, t, el("span", { class: "chip-x", "aria-hidden": "true" }, "×")))) : null,
      allTags().length ? tagPick : null, tagInput);
    if (drawTagNew) drawTagNew();
    if (focus === "input") tagInput.focus({ preventScroll: true });
    else if (focus === "pick" && allTags().length) tagPick.querySelector(".dropdown-btn").focus({ preventScroll: true });
  };
  drawTags();
  // A story page's own tags (Royal Road's, AO3's), offered as one switch.
  const siteBox = el("div", { class: "batch-site-tags" });
  let fromSite = [];
  const useSite = (on) => {
    tags.splice(0, tags.length, ...tags.filter((t) => !fromSite.some((x) => sameTag(x, t))));
    fromSite = [];
    if (on && siteTags) {
      for (const raw of siteTags.tags) {
        const t = cleanTag(raw);
        if (!t || tags.some((x) => sameTag(x, t))) continue;
        const known = allTags().find((x) => sameTag(x, t)) || t;
        tags.push(known);
        fromSite.push(known);
      }
    }
    drawTags();
  };
  const setSiteTags = (got) => {
    siteTags = got && got.tags && got.tags.length ? got : null;
    if (!siteTags) { useSite(false); siteBox.replaceChildren(); return; }
    const shown = siteTags.tags.slice(0, 3).join(", ") + (siteTags.tags.length > 3 ? " " + t("and {n} more", { n: siteTags.tags.length - 3 }) : "");
    const on = load(SITE_TAGS_KEY, false);
    siteBox.replaceChildren(el("div", { class: "group" },
      switchRow(t("{site}'s tags", { site: siteTags.site }), shown, on, (v) => { store(SITE_TAGS_KEY, v); useSite(v); }, { "aria-label": t("Add {site}'s tags", { site: siteTags.site }) })));
    useSite(on);
  };
  setSiteTags(siteTags);
  // Clips that join the collection later (Website sync, Next, a move)
  // take the tags its clips share.
  let tagNew = load(TAG_NEW_KEY, true);
  const tagNewBox = el("div", { class: "batch-tag-new" });
  drawTagNew = () => {
    tagNewBox.replaceChildren(folder && tags.length ? el("div", { class: "group" },
      switchRow(t("Tag new clips too"), t("Chapters added later get these tags"), tagNew, (v) => { tagNew = v; store(TAG_NEW_KEY, v); })) : "");
  };
  drawTagNew();
  area.addEventListener("input", sync);
  input.addEventListener("input", () => pick(cleanName(input.value) ? folderName(input.value) : null, true));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
  const KIND_NOTES = { article: t("The text and its pictures, read as a page."), comic: t("Only the page's pictures, in order, edge to edge. For comics and manga.") };
  const kindNote = el("p", { class: "meta" }, KIND_NOTES[kind]);
  const images = C.platform.native ? seg("batch-images", t("Images"), [
    { value: "previews", label: t("Previews") }, { value: "full", label: t("Full") }, { value: "links", label: t("Links") },
  ], mode, (v) => { mode = v; }) : null;
  const asPage = from ? el("section", { class: "settings-section batch-from" },
    el("p", { class: "meta" }, t("Waypage read this page as a list of chapters.")),
    el("button", { class: "btn-quiet batch-as-page", type: "button", onclick: () => { history.back(); savePage(from, null, { asPage: true }); } },
      t("Save it as one clip instead"))) : null;
  // A file of your own comes in from here too (0.31.0).
  const newNoteRow = el("button", { class: "row", type: "button", onclick: () => openMenu("newNote") },
    el("span", { class: "row-label accent" }, t("New note")));
  // Inside a collection the same, and what they bring in joins it (a
  // new note joins it by itself).
  const into = (adding) => () => (preset ? addInto(preset, adding) : adding());
  const fromFile = from ? null : el("section", { class: "settings-section batch-file" }, el("h2", { class: "overline" }, t("File")),
    el("div", { class: "group" }, el("button", { class: "row", type: "button", onclick: into(() => pickFile(() => back())) },
      el("span", { class: "row-label accent" }, t("Add a file"))),
      canAddFolder() ? el("button", { class: "row", type: "button", onclick: () => back().then(into(addFolder)) },
        el("span", { class: "row-label accent" }, t("Add a folder"))) : null,
      C.platform.files.canPickFolder ? el("button", { class: "row", type: "button", onclick: () => back().then(into(addAudiobookFolder)) },
        el("span", { class: "row-label accent" }, t("Add an audiobook folder"))) : null,
      newNoteRow),
    el("p", { class: "meta" }, preset
      ? t("An EPUB book, a Markdown or text note, an HTML page, an email (.eml), a CBZ comic, or an audiobook (M4B, MP3, a zip of them{x}). Everything added here joins {name}. It stays {ON_HERE}.", { x: C.platform.files.canPickFolder ? t(", or a folder of them") : "", name: preset, ON_HERE: ON_HERE })
      : t("An EPUB book, a Markdown or text note, an HTML page, an email (.eml), a CBZ comic, or an audiobook (M4B, MP3, a zip of them{x}). A folder's files are each added on their own, in a collection named after their folder. It stays {ON_HERE}.", { x: C.platform.files.canPickFolder ? t(", or a folder of them") : "", ON_HERE: ON_HERE })));
  const form = el("form", { class: "batch-form" }, asPage, fromFile,
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Links")), area, count, finder, skipRow),
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Save as")),
      seg("batch-kind", t("Save as"), [{ value: "article", label: t("Article") }, { value: "comic", label: t("Comic") }], kind, (v) => {
        kind = v;
        kindNote.textContent = KIND_NOTES[v];
        // Comics read best full size; still a choice below.
        const pick = images && images.querySelector('input[value="' + (v === "comic" ? "full" : load(IMAGES_KEY, "previews")) + '"]');
        if (pick) { pick.checked = true; mode = pick.value; }
      }),
      kindNote),
    images ? el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Images")), images,
      el("p", { class: "meta" }, t("Full images for comics, maps and diagrams. Settings picks the usual choice."))) : null,
    el("section", { class: "settings-section" }, folderHead,
      el("div", { class: "tag-edit" }, folderPick, input),
      folderNote),
    el("section", { class: "settings-section" }, el("h2", { class: "overline" }, t("Tags")), siteBox, tagBox, tagNewBox),
    go);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const all = linksFrom(area.value);
    const skipSaved = skip.checked && !skipRow.hidden;
    const urls = skipSaved ? all.filter((u) => !savedAs(u)) : all;
    if (!urls.length) return;
    if (urls.length > LONG_LIST && !confirm(t("Save {n} clips? They save one at a time, so a list this long takes a while. Pause and Stop are on its card.", { n: urls.length }))) return;
    history.back();
    saveAll(skipSaved ? all : urls, folder, tags, mode, skipSaved, kind, source, !!(folder && tags.length && tagNew), siteTags || undefined, series && !!folder);
  });
  $("batchBody").replaceChildren(form);
  if (folder) choose(folder);
  sync();
}

// ---- Following a site's next links ----
// A page saved with a next link (save.js) can bring its next pages in
// after it, into its folder: one link at a time, each saved page giving
// the next. A page not yet in a folder starts one, named after it.

// "The Wandering Inn - Chapter 1.01" → "The Wandering Inn".
function seriesName(p) {
  if (p.series) return cleanName(p.series) || p.site;
  const t = p.title.replace(/[\s\-–—:|,·]*(chapter|ch\.?|part|episode|ep\.?|book|vol\.?|פרק|capítulo|chapitre|kapitel)\s*[\d.ivxl]+\b.*$/iu, "").trim();
  return cleanName(t && t !== p.title ? t : p.title) || p.site;
}

// Saves up to `n` pages following `from`'s next links (previous ones
// with `back`, placed before it in the folder); resolves to the first
// one saved (or already there), or null. Quiet when asked. A folder's
// run stops early when its Stop is tapped and waits while paused.
async function follow(from, n, quiet, back) {
  const key = back ? "prev" : "next";
  if (from[key] === undefined) {
    try { from[key] = await C.save.findNext(from.url, back); } catch (e) { toast(back ? t("Couldn't reach {site} to find the previous page.", { site: from.site }) : t("Couldn't reach {site} to find the next page.", { site: from.site })); return null; }
    await C.store.writeIndex(state.pages);
    if (!from[key]) { toast(back ? t("There's no previous page.") : t("There's no next page.")); return null; }
  }
  if (!from.folder) { from.folder = folderName(seriesName(from)); from.folderAt = Date.now(); }
  const name = from.folder;
  let at = from.folderAt || from.savedAt || Date.now();
  const place = () => (back ? --at : undefined);
  const run = n > 1 ? startRun(name, from.site, n === Infinity ? null : n) : null;
  const seen = new Set([from.url]);
  let url = from[key], saved = 0, first = null, failed = false, stopped = false;
  while (url && saved < n && !seen.has(url)) {
    if (run && run.stopped) { stopped = true; break; }
    seen.add(url);
    const had = savedAs(url);
    if (had) {
      if (!had.folder) { had.folder = name; had.folderAt = place() || Date.now(); }
      else if (back && sameTag(had.folder, name)) at = Math.min(at, had.folderAt || at);
      first = first || had;
      url = had[key];
      continue;
    }
    if (state.saving.some((s) => !s.error && sameUrl(s.url, url))) break;
    state.saving = state.saving.filter((s) => !(s.error && sameUrl(s.url, url)));
    if (saved) await new Promise((done) => setTimeout(done, PACE_MS));
    if (run && !(await gate(run))) { stopped = true; break; }
    const job = { ...newJob(url, name), folderAt: place(), run, ...(from.comic ? { kind: "comic", mode: from.mode } : {}) };
    state.saving.unshift(job);
    if (run) run.current = job;
    renderLibrary();
    if (state.folder) renderFolder();
    const meta = await runJob(job);
    if (run) run.current = null;
    if (!meta) { failed = true; if (run) run.failed++; break; }
    saved++;
    if (run) { run.saved++; updateRunCard(run); }
    first = first || meta;
    url = meta[key];
    if (state.folder) renderFolder();
  }
  endRun(run);
  await C.store.writeIndex(state.pages);
  renderLibrary();
  if (state.folder) renderFolder();
  if (!quiet || failed) {
    const end = back ? t("That's the first one.") : t("That's the last one.");
    toast(saved ? t("Saved {clips} into {name}.", { clips: countLine(saved), name }) + (failed ? " " + (back ? t("The previous one couldn't be saved.") : t("The next one couldn't be saved.")) : stopped ? " " + t("Stopped.") : !url ? " " + end : "")
      : failed ? (back ? t("Couldn't save the previous page.") : t("Couldn't save the next page.")) : first ? (back ? t("The previous page is already saved.") : t("The next page is already saved.")) : (back ? t("There's no previous page.") : t("There's no next page.")));
  }
  return first;
}

// A folder's first page saved before 0.20.0 never looked for a previous
// link: read it from the original once, quietly, when the folder opens.
const lookingBack = new Set();
function lookBack(p) {
  if (!p || p.prev !== undefined || p.licence === "wikipedia" || !navigator.onLine || lookingBack.has(p.id)) return;
  lookingBack.add(p.id);
  C.save.findNext(p.url, true).then((u) => {
    p.prev = u || "";
    return C.store.writeIndex(state.pages);
  }).then(() => { if (state.folder && p.prev && !savedAs(p.prev)) renderFolder(); }, () => {});
}

// "Save the next 1 · 5 · 10 · All" for the last page of a run with a
// next link, or the previous ones (`back`) for the first. While a run
// saves, Stop.
// Image chapters run to tens of megabytes, so a long run is confirmed
// with a size taken from the chapters saved last.
const BIG_CHAPTER = 5e6;
function sizeOk(p, n) {
  if (n < 5) return true;
  const last = (p.folder ? folderPages(p.folder) : [p]).filter((q) => q.bytes)
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)).slice(0, 3);
  const each = last.length ? sizeOf(last) / last.length : 0;
  if (each < BIG_CHAPTER) return true;
  return confirm(n === Infinity
    ? t("The last chapters were about {formatSize} each. Save all of them?", { formatSize: formatSize(each) })
    : t("The last chapters were about {formatSize} each, so {n} more is about {formatSize2}. Save them?", { formatSize: formatSize(each), n: n, formatSize2: formatSize(each * n) }));
}

function followControls(p, back) {
  const key = back ? "prev" : "next";
  // Pages saved before 0.10.0 never looked for a next link (`next` is
  // missing, not ""); follow() reads it from the original on first use.
  // A missing previous link is read when the folder opens (lookBack).
  const unknown = !back && p && p.next === undefined && p.licence !== "wikipedia";
  if (!p || (!unknown && (!p[key] || savedAs(p[key])))) return null;
  const busy = () => !!runFor(p.folder) || state.saving.some((s) => !s.error && s.folder && p.folder && sameTag(s.folder, p.folder));
  const what = back ? "previous" : "next";
  const going = runFor(p.folder);
  const stop = el("button", { class: "chip stop", type: "button", "aria-label": t("Stop saving"),
    onclick: () => { stopRun(runFor(p.folder)); stop.disabled = true; } }, t("Stop"));
  const pause = el("button", { class: "chip pause", type: "button", "aria-label": going && going.paused ? t("Resume saving") : t("Pause saving"),
    onclick: () => { const r = runFor(p.folder); if (r) pauseRun(r, !r.paused); } }, going && going.paused ? t("Resume") : t("Pause"));
  stop.hidden = !busy();
  pause.hidden = !going;
  const run = (n) => (e) => {
    if (busy()) return;
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    if (!sizeOk(p, n)) return;
    e.currentTarget.closest(".follow").querySelectorAll("button:not(.stop):not(.pause)").forEach((b) => { b.disabled = true; });
    stop.hidden = false;
    pause.hidden = n === 1;
    follow(p, n, false, back).then(() => { if (state.sheet === "page" && state.open) $("readingBody").replaceChildren(SHEETS.page.build()); });
  };
  const chip = (n) => {
    const b = el("button", { class: "chip", type: "button",
      "aria-label": n === Infinity ? t("Save all the {what} clips from {site}", { what: what, site: p.site }) : t("Save the {what} {countLine} from {site}", { what: what, countLine: countLine(n), site: p.site }),
      onclick: run(n) }, n === Infinity ? t("All") : String(n));
    b.disabled = busy();
    return b;
  };
  return el("div", { class: "rc-row follow" + (back ? " back" : "") }, el("span", { class: "rc-label" }, back ? t("Save previous") : t("Save next")),
    el("div", { class: "chips" }, ...[1, 5, 10, Infinity].map(chip), pause, stop));
}

// ---- New chapters (0.25.0) ----
// A series folder (one whose pages link to each other as next and
// previous) is checked for chapters after its last one by reading that
// page's next link again: the one kept when it was saved is often ""
// because it was the newest chapter then. Found chapters are counted by
// walking on, up to NEW_MAX, and the last page's `next` is updated, so
// the folder's Save next row appears. Results are kept per folder:
// { [lower-case name]: { at, count } }.
const NEW_MAX = 10;
const DAY = 864e5;
// Parsed once per value (1.2.0): it was read from localStorage and parsed
// for every collection on every redraw.
let newCache = { raw: undefined, all: {} };
const newChapters = () => {
  let raw = null;
  try { raw = localStorage.getItem(NEW_KEY); } catch (e) { raw = null; }
  if (raw !== newCache.raw) { let all; try { all = JSON.parse(raw); } catch (e) { all = null; } newCache = { raw, all: all && typeof all === "object" ? all : {} }; }
  return newCache.all;
};
const newFor = (name) => newChapters()[String(name).toLowerCase()] || null;
function setNewFor(name, entry) {
  const all = newChapters();
  if (entry) all[String(name).toLowerCase()] = entry; else delete all[String(name).toLowerCase()];
  store(NEW_KEY, all);
}

// Chapters deleted from a series stay deleted (2026-11): they aren't
// counted as new or saved again with the rest. Kept on this device per
// collection as { [lower-case name]: [url keys] }; one deleted on another
// device is noted when sync takes it away here.
const GONE_KEY = "waypage.chaptersGone";
const GONE_MAX = 5000;
const goneFor = (name) => new Set((load(GONE_KEY, {}) || {})[String(name).toLowerCase()] || []);
function noteGone(list) {
  const all = load(GONE_KEY, {}) || {};
  const series = new Map();
  let changed = false;
  for (const p of list) {
    if (!p.folder || !/^https?:/.test(p.url || "")) continue;
    const key = String(p.folder).toLowerCase();
    if (!series.has(key)) series.set(key, isSeries(folderPages(p.folder)));
    if (!series.get(key)) continue;
    const had = all[key] || [];
    const u = urlKey(p.url);
    if (had.includes(u)) continue;
    all[key] = had.concat(u).slice(-GONE_MAX);
    changed = true;
  }
  if (changed) store(GONE_KEY, all);
}
// A linked collection's chapter list as last read, less the deleted ones.
function chapterLinks(name) {
  const entry = newFor(name);
  if (!entry || !entry.all) return [];
  const gone = goneFor(name);
  return gone.size ? entry.all.filter((u) => !gone.has(urlKey(u))) : entry.all;
}

// Only chapters after the last one saved, saving or deleted are new
// (2026-11): earlier ones, gaps included, are never counted or saved by
// sync, so a story started part way in doesn't fill in from chapter 1.
// "Save earlier" still saves them on purpose. -1 when none is had yet.
function laterFrom(name) {
  const entry = newFor(name);
  if (!entry || !entry.all) return -1;
  const gone = goneFor(name);
  let from = -1;
  entry.all.forEach((u, i) => { if (gone.has(urlKey(u)) || savedAs(u) || savingAs(u)) from = i; });
  return from;
}
function laterChapters(name) {
  const entry = newFor(name);
  if (!entry || !entry.all) return [];
  const gone = goneFor(name);
  return entry.all.slice(laterFrom(name) + 1).filter((u) => !gone.has(urlKey(u)) && !savedAs(u) && !savingAs(u));
}

// New chapters with the app closed (2026-11, Android): the phone's feed
// job also reads each linked collection's contents page every few hours
// and says when it lists a chapter this device hasn't seen. It can't run
// save.js, so it gets what it takes to spot one: the page, the path every
// chapter shares and how deep it goes, and every chapter already known.
// A story whose chapters share no such path (a blog's dated posts) is
// left to the daily check. Keys are a link's host (no www.) and path.
const chapterKey = (u) => { try { const x = new URL(u); return x.hostname.replace(/^www\./i, "").toLowerCase() + x.pathname.replace(/\/+$/, ""); } catch (e) { return ""; } };
function chapterShape(links) {
  const paths = [];
  for (const u of links) {
    try { const x = new URL(u); paths.push({ host: x.hostname.replace(/^www\./i, "").toLowerCase(), path: x.pathname.replace(/\/+$/, "") }); } catch (e) { /* not a link */ }
  }
  if (new Set(paths.map((p) => p.path)).size < 2 || paths.some((p) => p.host !== paths[0].host)) return null;
  let prefix = paths[0].path;
  for (const p of paths) while (prefix && !p.path.startsWith(prefix)) prefix = prefix.slice(0, -1);
  prefix = prefix.slice(0, prefix.lastIndexOf("/") + 1);
  const parts = prefix.split("/").filter(Boolean);
  if (!parts.length || (parts.length === 1 && /^\d{4}$/.test(parts[0]))) return null;
  return { host: paths[0].host, prefix, depths: [...new Set(paths.map((p) => p.path.split("/").length))] };
}
const STORY_KNOWN_MAX = 3000;
// Android asks once whether Waypage may notify, the first time a
// collection is linked (or at start, for one linked before 2026-11).
const CHAPTERS_ASKED_KEY = "waypage.chaptersAsked";
function askChapterAlerts() {
  if (!C.platform.android || load(CHAPTERS_ASKED_KEY, false)) return;
  store(CHAPTERS_ASKED_KEY, true);
  askToNotify = true;
  watchFeeds();
}
function chapterWatchList() {
  const n = notesPrefs();
  if (!C.platform.android || !n.on || !n.chapters || !load(DAILY_KEY, true)) return [];
  const out = [];
  for (const name of allFolders()) {
    const list = folderPages(name);
    const source = folderSource(list);
    const entry = newFor(name);
    if (!source || !entry || !entry.all || !entry.all.length) continue;
    const shape = chapterShape(entry.all);
    if (!shape) continue;
    const known = new Set([...entry.all, ...list.map((p) => p.url)].map(chapterKey).filter(Boolean));
    for (const k of goneFor(name)) known.add(chapterKey(k));
    for (const u of entry.all.slice(0, laterFrom(name) + 1)) known.add(chapterKey(u));
    out.push({ name, url: entry.page || source, ...shape, known: [...known].slice(-STORY_KNOWN_MAX) });
  }
  return out;
}

// Keep a set number (2026-11): a linked collection holds `n` unread
// chapters on this device. Read ones are deleted (and stay deleted, as
// above) and the next ones in the site's list are saved in their place.
// { [lower-case name]: n }, this device's own, since it's about its space.
const CHAPTERS_KEEP_KEY = "waypage.chaptersKeep";
const KEEP_CHOICES = [0, 3, 5, 10];
const keepFor = (name) => +((load(CHAPTERS_KEEP_KEY, {}) || {})[String(name).toLowerCase()]) || 0;
function setKeepFor(name, n) {
  const all = load(CHAPTERS_KEEP_KEY, {}) || {};
  if (n) all[String(name).toLowerCase()] = n; else delete all[String(name).toLowerCase()];
  store(CHAPTERS_KEEP_KEY, all);
}
// Translate its chapters (2026-11): a linked collection's chapters are
// translated into `to` on this device as each opens, shown under or
// instead of their words (`mode`). { [lower-case name]: { to, mode } },
// this device's own like the translations themselves.
const CHAPTERS_TR_KEY = "waypage.chaptersTranslate";
const chaptersTranslateFor = (name) => { const v = (load(CHAPTERS_TR_KEY, {}) || {})[String(name).toLowerCase()]; return v && v.to ? { to: v.to, mode: v.mode === "replace" ? "replace" : "under" } : null; };
function setChaptersTranslate(name, v) {
  const all = load(CHAPTERS_TR_KEY, {}) || {};
  if (v && v.to) all[String(name).toLowerCase()] = { to: v.to, mode: v.mode === "replace" ? "replace" : "under" }; else delete all[String(name).toLowerCase()];
  store(CHAPTERS_TR_KEY, all);
}
// Moves these with a renamed collection, or drops them with a removed one.
function moveChapterNotes(old, name) {
  for (const k of [GONE_KEY, CHAPTERS_KEEP_KEY, CHAPTERS_TR_KEY]) {
    const all = load(k, {}) || {};
    const from = String(old).toLowerCase();
    if (!(from in all)) continue;
    if (name) all[String(name).toLowerCase()] = all[from];
    if (!name || from !== String(name).toLowerCase()) delete all[from];
    store(k, all);
  }
}
// A read chapter with highlights, notes or drawings, a favourite, or
// the one open is never deleted to make room.
const keepsAnyway = (p) => p === state.open || p.fav || (p.marks || []).length || (p.ink && Object.keys(p.ink).length);
const keepDrops = (name) => folderPages(name).filter((p) => p.finished && /^https?:/.test(p.url || "") && !keepsAnyway(p));

const keepingUp = new Set();
async function keepUp(name) {
  const n = keepFor(name);
  const key = String(name).toLowerCase();
  if (!n || keepingUp.has(key) || !folderSource(folderPages(name))) return;
  keepingUp.add(key);
  try {
    const drop = keepDrops(name);
    if (drop.length) {
      noteGone(drop);
      for (const p of drop) { dropPackFile(p); dropAudioFiles(p); await C.store.removePage(p.id); }
      state.pages = state.pages.filter((p) => !drop.includes(p));
      await C.store.writeIndex(state.pages);
      renderLibrary();
      if (state.folder) renderFolder();
      toast(tn(drop.length, "Deleted 1 read chapter of {name}", "Deleted {n} read chapters of {name}", { name: name }));
    }
    if (!navigator.onLine || savingInto(name)) return;
    const list = folderPages(name);
    const room = n - list.filter((p) => !p.finished).length;
    const links = chapterLinks(name);
    if (room <= 0 || !links.length) return;
    // The next ones: after the last chapter saved or deleted, so earlier
    // chapters never saved (a story started part way in) stay out.
    const next = laterChapters(name).slice(0, room);
    if (next.length) saveAll(next, name, [], undefined, true, undefined, folderSource(list));
  } finally {
    keepingUp.delete(key);
  }
}
async function pickKeep(name, n) {
  if (n) {
    const drop = keepDrops(name);
    if (drop.length && !confirm(tn(drop.length, "Delete the 1 read chapter of {name}? Read chapters are deleted from now on, and the next ones saved.{alsoSynced}", "Delete the {n} read chapters of {name}? Read chapters are deleted from now on, and the next ones saved.{alsoSynced}", { name: name, alsoSynced: alsoSynced() }))) { if (state.folder && sameTag(state.folder, name)) renderFolder(); return; }
  }
  setKeepFor(name, n);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  if (!n) return;
  if (navigator.onLine) await checkNew(name, true); else await keepUp(name);
}

// The story's page a folder is linked to (0.26.0): kept on each of its
// pages as `source`, so it travels with them in backups. "" when none.
const folderSource = (list) => (list.find((p) => p.source) || {}).source || "";
function bookIcon(size) {
  const s = el("span", { class: "book-icon", "aria-hidden": "true" });
  s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + ICONS.book + "</svg>";
  return s;
}

function isSeries(list) {
  if (folderSource(list)) return true;
  if (list.length < 2) return false;
  const last = list[list.length - 1];
  if (!/^https?:/.test(last.url || "") || last.licence === "wikipedia") return false;
  return list.some((p) => list.some((q) => q !== p && ((p.next && sameUrl(p.next, q.url)) || (p.prev && sameUrl(p.prev, q.url)))));
}

const checking = new Set();
// Resolves to the number of new chapters found (NEW_MAX meaning at
// least that many), or null when the site couldn't be reached.
async function checkNew(name, quiet) {
  const key = String(name).toLowerCase();
  if (checking.has(key)) return null;
  const list = folderPages(name);
  const last = list[list.length - 1];
  if (!last) return null;
  checking.add(key);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  let count = 0;
  const source = folderSource(list);
  try {
    if (source) {
      // A linked folder reads the story's own chapter list: whatever in
      // it isn't saved is new, wherever it sits.
      const found = await C.save.findChapters(source);
      const all = found.links.slice(0, 5000);
      setNewFor(name, { at: Date.now(), count: 0, all, page: found.page || source });
      count = laterChapters(name).length;
      setNewFor(name, { at: Date.now(), count, all, page: found.page || source });
      watchFeeds();
      await updateCover(name, found.cover || "");
      await keepStoryTags(name, found.siteTags);
      await keepStoryStatus(name, found.status);
    } else {
      let url = await C.save.findNext(last.url);
      if (url && !savedAs(url)) {
        last.next = url;
        await C.store.writeIndex(state.pages);
        const seen = new Set([last.url]);
        const gone = goneFor(name);
        while (url && !seen.has(url) && !savedAs(url) && count < NEW_MAX) {
          seen.add(url);
          if (!gone.has(urlKey(url))) count++;
          if (count === NEW_MAX) break;
          try { url = await C.save.findNext(url); } catch (e) { break; }
        }
      }
      setNewFor(name, { at: Date.now(), count });
    }
  } catch (e) {
    if (!quiet) toast(t("Couldn't reach {site} to look for new chapters.", { site: last.site }));
    count = null;
  } finally {
    checking.delete(key);
  }
  if (count != null && keepFor(name)) await keepUp(name);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
  if (!quiet && count === 0) toast(t("No new chapters yet."));
  return count;
}

const newCountText = (n) => t("{n} new", { n: n >= NEW_MAX ? NEW_MAX + "+" : String(n) });

// The new chapters still unsaved: those saved since the check no
// longer count, and none are left once the last page's next is saved.
function freshCount(name) {
  const entry = newFor(name);
  if (!entry || !entry.count) return 0;
  if (entry.all) return laterChapters(name).length;
  const list = folderPages(name);
  const last = list[list.length - 1];
  if (!last || !last.next || savedAs(last.next)) return 0;
  const since = list.filter((p) => (p.savedAt || 0) > entry.at).length;
  return Math.max(1, entry.count - since);
}

// New chapters as one row: how many and when it last looked, with Check.
function checkRow(list) {
  if (!isSeries(list)) return null;
  const name = state.folder;
  const entry = newFor(name);
  const fresh = freshCount(name);
  const busy = checking.has(String(name).toLowerCase());
  const label = busy ? t("Looking…") : !entry ? t("Not checked yet") : fresh ? newCountText(fresh) : t("None yet");
  const btn = el("button", { class: "chip", type: "button", onclick: () => {
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    checkNew(name, false);
  } }, t("Check"));
  btn.disabled = busy;
  // From a linked page, the new ones are saved straight from its list,
  // each at its place among those already saved.
  const take = entry && entry.all && fresh && !busy && !savingInto(name) ? el("button", { class: "chip on take-new", type: "button",
    "aria-label": tn(fresh, "Save 1 new chapter", "Save {n} new chapters", { n: fresh >= NEW_MAX ? NEW_MAX + "+" : fresh }),
    onclick: (e) => saveNewChapters(name, e.currentTarget) }, t("Save")) : null;
  return el("div", { class: "row check-new", role: "status" },
    el("span", { class: "choice-text" },
      el("span", { class: "choice-label" + (fresh && !busy ? " accent" : "") }, label),
      entry && !busy ? el("span", { class: "choice-note" }, t("Checked {when}", { when: whenText(entry.at) })) : null),
    take, btn);
}

// ---- The folder's Website sync panel (0.26.0, was Story page) ----
// Everything about a series in one place, in Settings' groups (2026-11):
// the site's page it's linked to (any site's contents page, or one of
// its chapters), first (Daniel 2026-11-23), then new chapters and how
// many to keep, and saving earlier or later ones. Edit's second tab.
function chaptersPanel(list) {
  const top = [checkRow(list), keepRow(list), ...translateRows(list)].filter(Boolean);
  const more = [followControls(list[list.length - 1]), followControls(list[0], true)].filter(Boolean);
  return el("div", { class: "folder-actions chapters-panel" },
    sourceSection(list),
    top.length ? section(t("New chapters"), null, el("div", { class: "group" }, ...top))
      : el("p", { class: "meta" }, t("These clips don't link to each other, so there's nothing to look for. Link the collection to its website above.")),
    more.length ? section(t("Save more"), null, el("div", { class: "group follow-group" }, ...more)) : null);
}

function keepRow(list) {
  if (!folderSource(list)) return null;
  const name = state.folder;
  const keepNote = t("Read ones make way for the next");
  return pickRow({ label: t("Keep on this device"), cls: "keep-pick",
    options: KEEP_CHOICES.map((n) => (n ? { value: String(n), label: t("{n} unread", { n: n }), note: keepNote } : { value: "0", label: t("Every chapter"), note: t("Nothing is deleted") })),
    get: () => String(keepFor(name)), set: (v) => pickKeep(name, +v) });
}

// Where this device can translate (platform.js's translator), a linked
// collection can have each chapter translated as it opens.
function translateRows(list) {
  const T = C.platform.translator;
  if (!folderSource(list) || !T.available) return [];
  const name = state.folder;
  const want = chaptersTranslateFor(name);
  const langs = TR_LANGS.map((c) => ({ value: c, label: langName(c) })).sort((a, b) => a.label.localeCompare(b.label));
  const into = pickRow({ label: t("Translate chapters"), cls: "translate-pick",
    options: [{ value: "", label: t("Off"), note: t("Each chapter in its own words") }, ...langs.map((o) => ({ ...o, note: t("Each chapter as it opens, on this device") }))],
    get: () => (chaptersTranslateFor(name) || {}).to || "",
    set: (v) => {
      setChaptersTranslate(name, v ? { to: v, mode: (chaptersTranslateFor(name) || {}).mode } : null);
      renderFolder();
      if (v) prepareChapterLanguages(list, v);
    } });
  const show = want ? pickRow({ label: t("Show"), cls: "translate-show",
    options: [{ value: "under", label: t("Under the text") }, { value: "replace", label: t("Instead of the text") }],
    get: () => (chaptersTranslateFor(name) || {}).mode || "under",
    set: (v) => setChaptersTranslate(name, { to: (chaptersTranslateFor(name) || {}).to, mode: v }) }) : null;
  return [into, show];
}
// The languages downloaded now, while online, so chapters translate on a
// plane too. Only when the chapters say what language they're in.
async function prepareChapterLanguages(list, to) {
  const T = C.platform.translator;
  const from = primary((list.find((p) => p.lang) || {}).lang);
  if (!from || from === to || !navigator.onLine) return;
  try {
    if ((await T.ready(from, to)) !== "downloadable") return;
    toast(t("Downloading {langName} and {langName2}, once, so chapters translate offline.", { langName: langName(from), langName2: langName(to) }));
    await T.prepare(from, to, () => {});
  } catch (e) { /* tried again when a chapter opens */ }
}

function sourceSection(list) {
  const name = state.folder;
  const src = folderSource(list);
  const input = el("input", { class: "source-input", type: "url", inputmode: "url", value: src,
    placeholder: t("Its contents page, or any chapter"), "aria-label": t("Page to sync with"), autocapitalize: "off", spellcheck: "false" });
  // One button (Daniel's ask): the link in the box is read again, or
  // linked for the first time; an empty box unlinks.
  const label = src ? t("Refresh") : t("Link");
  const link = el("button", { class: "chip source-link", type: "button", onclick: async () => {
    if (src && !input.value.trim()) { setSource(name, ""); toast(t("Unlinked {name}", { name: name })); return; }
    const u = linkFrom(input.value);
    if (!u) { toast(t("Paste the link to its contents page or a chapter.")); return; }
    if (!navigator.onLine) { toast(t("You're offline. Try again when you're back online.")); return; }
    link.disabled = true;
    link.textContent = t("Reading…");
    try {
      const found = await C.save.findChapters(u);
      if (!found.links.length) { toast(t("Couldn't find a list of chapters on that page.")); return; }
      setSource(name, found.page || u, found.cover || "");
      keepStoryTags(name, found.siteTags);
      keepStoryStatus(name, found.status);
      toast(t("Linked to {replace} on {siteName}", { replace: countLine(found.links.length).replace("clip", "chapter"), siteName: C.save.siteName(u) }));
    } catch (e) {
      toast(e instanceof C.save.SaveError ? e.message : t("Couldn't read that page. Try again."));
    } finally {
      if (link.isConnected) { link.disabled = false; link.textContent = label; }
    }
  } }, label);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); link.click(); } });
  // Where the story stands, from its page (2026-11); off, Edit's own pick shows.
  const said = siteStatusOf(list);
  const statusSwitch = src ? switchRow(t("Status from the site"), said ? t("{site} says {status}", { site: siteOf(list[0]) || C.save.siteName(src), status: statusName(said) }) : t("The site doesn't say"),
    siteStatusOn(list), (v) => setFolderStatus(name, "folderNoStatus", v ? "" : true)) : null;
  return section(t("Synced with"), null,
    el("div", { class: "group" }, el("div", { class: "row source-row" }, input, link), statusSwitch),
    el("p", { class: "footnote" }, t("New chapters are read from its chapter list, which also finds chapters added in between."), " ", t("Chapters you delete don't come back as new."),
      src ? " " + t("Empty the box and press Refresh to unlink.") : ""));
}

async function setSource(name, url, cover) {
  if (url) askChapterAlerts();
  for (const p of folderPages(name)) { if (url) p.source = url; else delete p.source; }
  setNewFor(name, null);
  await C.store.writeIndex(state.pages);
  renderFolder();
  renderLibrary();
  if (url) updateCover(name, cover);
}

// Keeps a linked collection's cover (its linked page's picture) in step:
// `url` when the page was just read, else the page is read for it.
// Once per session for a collection that has none.
const coverTried = new Set();
async function updateCover(name, url) {
  const list = folderPages(name);
  const src = folderSource(list);
  if (!list.length || !src) return;
  if (url === undefined) {
    const key = String(name).toLowerCase();
    if (coverTried.has(key) || !navigator.onLine || list.some((p) => p.cover)) return;
    coverTried.add(key);
    try { url = (await C.save.findChapters(src)).cover || ""; } catch (e) { return; }
  }
  if (!url || list.some((p) => p.coverFrom === url && p.cover)) return;
  const cover = await C.save.keepCover(url, src);
  for (const p of folderPages(name)) { p.cover = cover; p.coverFrom = url; }
  await C.store.writeIndex(state.pages);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
}

// Saves the folder's pages again where they are, to switch their
// pictures or pick up an author's edits; each keeps its place, tags
// and read position. Started from What's saved.
// Each page is a job that knows the page it replaces, in a run of its
// own, so it shows in Downloads with Pause and Stop like any other.
async function refreshFolder(name, mode, btn) {
  const list = folderPages(name).filter((p) => /^https?:/.test(p.url || ""));
  if (!list.length || !navigator.onLine) { if (!navigator.onLine) toast(t("You're offline. Try again when you're back online.")); return; }
  btn.disabled = true;
  const run = startRun(folderName(name), list[0].site, list.length, true);
  const jobs = list.map((old) => ({ ...newJob(old.url, name), key: "again:" + old.id, again: old, mode, kind: old.comic ? "comic" : "article", waiting: true, run }));
  state.saving = [...jobs, ...state.saving];
  renderLibrary();
  toast(t("Saving {countLine} again. They're in Downloads.", { countLine: countLine(list.length) }));
  let done = 0, failed = 0, stopped = 0;
  for (const job of jobs) {
    if (done + failed) await new Promise((ok) => setTimeout(ok, PACE_MS));
    if (!(await gate(run)) || !state.saving.includes(job)) { stopped++; continue; }
    job.waiting = false;
    run.current = job;
    renderLibrary();
    if (await runJob(job)) { done++; run.saved++; } else { failed++; run.failed++; }
    run.current = null;
    updateRunCard(run);
  }
  endRun(run);
  if (state.folder && sameTag(state.folder, name)) renderFolder();
  renderLibrary();
  toast([t("Saved {clips} again", { clips: countLine(done) }), failed ? t("{n} couldn't be saved", { n: failed }) : "", stopped ? t("stopped before {clips}", { clips: countLine(stopped) }) : ""].filter(Boolean).join(" · ") + ".");
}

function whenText(at) {
  const mins = Math.round((Date.now() - at) / 6e4);
  if (mins < 2) return t("just now");
  if (mins < 60) return t("{n} min ago", { n: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return t("{n} h ago", { n: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t("yesterday") : tn(days, "1 day ago", "{n} days ago");
}

// Once a day per series folder, after the library is up and online,
// one folder at a time, quietly.
let dailyRunning = false;
async function dailyCheck(force) {
  if (dailyRunning || !navigator.onLine || (!force && !load(DAILY_KEY, true))) return 0;
  if (waitsForWifi(DATA_SAVE_KEY)) { if (force) toast(t("Collections check for new chapters when you're on Wi-Fi.")); return 0; }
  dailyRunning = true;
  let found = 0;
  try {
    for (const name of allFolders()) {
      if (!isSeries(folderPages(name))) continue;
      const entry = newFor(name);
      if (!force && entry && Date.now() - entry.at < DAY) { if (keepFor(name)) await keepUp(name); continue; }
      const n = await checkNew(name, true);
      if (n) found++;
    }
  } finally {
    dailyRunning = false;
  }
  return found;
}

// Renamed in place on the book page; the new-chapters entry follows.
async function renameFolder(raw) {
  const old = state.folder;
  const name = cleanName(raw || "");
  if (!name) { toast(t("Type a name for the collection.")); return false; }
  if (name === old) return true;
  const clash = allFolders().find((n) => sameTag(n, name) && !sameTag(n, old));
  if (clash) { toast(t("There's already a collection called {clash}.", { clash: clash })); return false; }
  const inside = seriesInside(old);
  for (const p of folderPages(old)) p.folder = name;
  for (const f of inside) for (const p of folderPages(f)) p.folderIn = name;
  renameReadingSet(old, name);
  renameFolderLook(old, name);
  moveChapterNotes(old, name);
  C.platform.widgets.renamed(old, name);
  const entry = newFor(old);
  if (entry && !sameTag(old, name)) { setNewFor(name, entry); setNewFor(old, null); }
  await C.store.writeIndex(state.pages);
  state.folder = name;
  history.replaceState({ view: "folder", folder: name }, "");
  renderLibrary();
  updateWidgets();
  return true;
}
