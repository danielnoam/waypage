// Waypage's shell: the home screen widgets and the app icon's shortcuts
// (split out of app-saving.js, 2026-11). See app.js for how the parts
// share.
// ---- Home screen widgets (0.29.0, Android) ----
// Keep reading shows the page read last that isn't finished (or the
// last one at all); Feeds the three newest posts not saved yet;
// Favourites (0.29.2) the favourite collections, then the clips
// favourited last (0.35.0), four in all; each collection widget (0.35.0)
// its collection's next clips to read. Handed over whenever the app
// goes to the background, and after changes.
let widgetTimer = null;
// The same clip as the library's Continue reading (1.40.1): in a
// collection, the chapter after one just finished. The newest unfinished
// clip read sent the widget and the Continue reading shortcut back to an
// older clip once the one you were in was finished.
function keepReading() {
  const go = continuePage();
  if (go) return go;
  const read = state.pages.filter((p) => p.readAt).sort((a, b) => b.readAt - a.readAt);
  return read.find((x) => !x.finished) || read[0];
}
function updateWidgets(now) {
  clearTimeout(widgetTimer);
  widgetTimer = setTimeout(() => {
    const p = keepReading();
    const posts = siteFeeds().flatMap((f) => feedPosts(f).filter((it) => !savedAs(it.url)).map((it) => ({ f, it })))
      .sort((a, b) => postAt(b.it) - postAt(a.it)).slice(0, 3)
      .map(({ f, it }) => ({ title: it.title, site: f.title, url: it.url, feed: f.url }));
    C.platform.widgets.update({
      reading: p ? { id: p.id, title: p.title, at: p.at || 0,
        meta: [siteOf(p), (p.at || 0) >= 0.995 ? t("Finished") : t("{n} min left", { n: clipLeft(p, p.at || 0) })].filter(Boolean).join(" · ") } : null,
      feeds: { following: siteFeeds().length > 0, fresh: freshPosts(), posts },
      favourites: [
        ...allFolders().filter(folderFav).map((name) => ({ name, at: Math.max(...folderPages(name).map((x) => x.folderFavAt || 0)) }))
          .sort((a, b) => b.at - a.at).map(({ name }) => ({ kind: "collection", name, title: name, meta: t("Collection") + " · " + readCount(folderPages(name)) })),
        ...state.pages.filter((x) => x.fav).sort((a, b) => (b.favAt || 0) - (a.favAt || 0))
          .map((x) => ({ id: x.id, title: x.title, meta: clipMeta(x) })),
      ].slice(0, 4),
      // A highlight a day (1.9.0): the latest hundred, latest first; the
      // widget picks the one for the day.
      marks: state.pages.flatMap((x) => (x.marks || []).map((m) => ({ id: x.id, mark: m.id, text: m.text.slice(0, 500), note: (m.note || "").slice(0, 200), title: x.title, at: m.at || 0 })))
        .sort((a, b) => b.at - a.at).slice(0, 100).map(({ at, ...m }) => m),
      collections: allFolders().sort((a, b) => a.localeCompare(b)).map((name) => {
        const list = folderPages(name);
        const i = folderNextIndex(list);
        // The clip the button opens comes first, then the ones after it
        // (1.10.1); no sites, just how much is left.
        const from = i < 0 ? 0 : i;
        // Its button (1.2.1): Start before anything in it was opened,
        // Continue while reading, Read again when all of it is read.
        const next = i < 0 ? list[0] : list[i];
        const started = list.some((x) => x.readAt || x.finished || (x.at || 0) > 0.02);
        return { name, meta: readCount(list), next: next ? next.id : "", button: !next ? "" : i < 0 ? t("Read again") : started ? t("Continue") : t("Start"),
          clips: list.slice(from, from + 4).map((x) => ({ id: x.id, title: x.title, meta: readingLine(x) })) };
      }),
      stats: statsWidget(),
    });
  }, now ? 0 : 800);
}

const clipMeta = (x) => [siteOf(x), readingLine(x)].filter(Boolean).join(" · ");
const readCount = (list) => { const done = list.filter((x) => x.finished).length; return done === list.length ? (caughtUp(list) ? t("Caught up") : t("All read")) : t("{done} of {n} read", { done, n: list.length }); };

// A widget's tap: the page to keep reading, a post, Feeds or a collection.
// The app icon's shortcuts (1.14.0) come the same way: Continue reading,
// Search, and Save the copied link.
async function takeWidget() {
  const got = await C.platform.widgets.take();
  if (!got || !got.kind) return;
  // A collection's Continue (1.40.1) opens its next clip as it is now,
  // not as it was when the widget was last drawn: the app put away just
  // after a chapter ended could leave the widget a chapter behind.
  if (got.kind === "page" && got.next) {
    const p = state.pages.find((x) => x.id === got.id);
    const q = p && p.folder ? folderNext(folderPages(p.folder)) : null;
    if (q) got.id = q.id;
  }
  // The clip already open stays as it is (1.30.2), not closed and opened
  // again: that went back to the place last written, not the one read.
  // Continue reading with a clip open is that clip (1.40.1).
  const id = got.kind === "reading" ? (state.open || keepReading() || {}).id : got.kind === "page" && !got.aloud ? got.id : null;
  if (id && state.open && state.open.id === id && !$("readerView").hidden) {
    if (state.sheet) history.back();
    return;
  }
  await toLibrary();
  if (got.kind === "reading") {
    const p = keepReading();
    if (p) openPage(p.id); else await goPlace("library");
    return;
  }
  if (got.kind === "search") { await goPlace("library"); openSearch(); return; }
  if (got.kind === "paste") { await goPlace("library"); saveCopied(); return; }
  if (got.kind === "page" && state.pages.some((p) => p.id === got.id)) {
    // The collection widget's read aloud (1.25.0): opens it and reads on
    // from where it was left; one already reading aloud just goes on.
    if (got.aloud) { aloudFrom(got.id); return; }
    openPage(got.id);
    return;
  }
  if (got.kind === "mark" && state.pages.some((p) => p.id === got.id)) { markAfterOpen = got.mark || null; openPage(got.id); return; }
  if (got.kind === "post" && got.url) {
    await goPlace("feeds");
    const f = feeds.find((x) => x.items.some((it) => it.url === got.url));
    const saved = savedAs(got.url);
    if (saved) openPage(saved.id);
    else if (f) previewPost(f, f.items.find((it) => it.url === got.url));
    return;
  }
  if (got.kind === "feeds" || got.kind === "library" || got.kind === "reading") await goPlace(got.kind);
  if (got.kind === "favourites") { await goPlace("library"); setFilter("favourites"); }
  if (got.kind === "collection" && got.name) {
    await goPlace("library");
    const name = allFolders().find((n) => sameTag(n, got.name));
    if (name) openFolder(name);
  }
}

// Android lets only the app in front read the clipboard, which the app
// just opened may not be yet: one more try, then the field to paste in.
async function saveCopied() {
  let text = await C.platform.widgets.copied();
  if (!linksFrom(text).length) { await new Promise((r) => setTimeout(r, 600)); text = await C.platform.widgets.copied(); }
  if (linksFrom(text).length) { saveTyped(text); return; }
  $("saveUrl").focus();
  toast(t("No link copied. Paste one here."));
}
