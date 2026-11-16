// ---- Audiobooks (2026-11) ----
// An audiobook is a file under Files, read from where it is (an M4B or
// MP3, or a folder of them, never copied in), with a headphones mark on
// its card. It plays with the phone's own player, which goes on with the
// screen off; where you are, how fast, what it reads along with and your
// fixes sync by the file's fingerprint like any file read from outside
// (sync.js, OUTSIDE).
//
// Three ways to read along (listen.mode):
//   "book"        a book in the library (an EPUB from Discover, say): the
//                 phone writes a transcript a little ahead of you and
//                 listen.js matches its words to the book's.
//   "transcript"  the transcript itself is the clip's text.
//   "listen"      just listening; the clip shows its chapters.
// An EPUB with its own narration (Media Overlays) reads along by itself.
// The transcript and timings are this device's own (listen.json).

const L = C.listen;
const A = C.platform.audio;
const READ_OPTS = { footnotes: true, edges: false };
const LISTEN_KEY = "waypage.listen";
const listenPrefs = () => ({ pack: "", pauses: true, chapters: true, charging: false, back: 15, on: 30, rewind: true, awake: false, keep: false, mix: false, volume: 1, pip: true, ...(load(LISTEN_KEY, {}) || {}) });
const setListenPref = (k, v) => { store(LISTEN_KEY, { ...listenPrefs(), [k]: v }); if (["mix", "volume", "back", "on"].includes(k)) listenOptions(); if (k === "pip") listenFloat(); };
const listenOptions = () => { const p = listenPrefs(); C.platform.audio.options({ mix: p.mix, volume: p.mix ? Math.max(0, Math.min(2, Number(p.volume) || 0)) : 1, back: p.back, on: p.on }); };
const SPEEDS = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2, 2.5, 3];
const AHEAD = 10 * 60, CHUNK = 3 * 60;

// Where the finger is on the player's track while it drags, shown before it seeks.
let trackDrag = null;
const lis = { key: "", state: "stopped", part: 0, t: 0, data: null, dataFor: "", sync: null, syncFor: "", said: -1, savedAt: 0, writing: false, note: "", seen: 0 };
// An audiobook of its own; hasSound also takes an EPUB with narration.
const hasSound = (p) => !!(p && p.audio && p.audio.parts);
const isAudiobook = (p) => hasSound(p) && !p.audio.overlay;
const listenPage = () => state.pages.find((p) => p.id === lis.key) || null;
// The book the player in the reader is for: the one playing if it is
// this page's, else this page's own.
const playerBook = () => { const a = listenPage(), here = audioFor(state.open); return here && !(a && shownFor(a) === state.open) ? here : a || here; };
const listening = () => lis.state === "playing" || lis.state === "paused" || lis.state === "loading";
const modeOf = (a) => (a && a.listen && a.listen.mode) || (a && a.audio && a.audio.overlay ? "book" : "listen");
const speedOf = (a) => (a && a.listen && a.listen.speed) || 1;
const placeOf = (a) => (a && a.listen && a.listen.t) || 0;
const durOf = (a) => (a && a.audio && a.audio.dur) || (a && a.listen && a.listen.dur) || 0;
const chaptersOf = (a) => (a && a.audio && a.audio.chapters) || [];

// The book an audiobook reads along with: by its id, else the same file
// (another device's copy), else the same address.
function bookOf(a) {
  if (a && a.audio && a.audio.overlay) return a;
  const b = a && a.listen && a.listen.book;
  if (!b) return null;
  return state.pages.find((p) => p.id === b.id && !isAudiobook(p))
    || (b.fp && state.pages.find((p) => p.file && p.file.fp === b.fp && !isAudiobook(p)))
    || (b.url && state.pages.find((p) => p.url && sameUrl(p.url, b.url)))
    || null;
}
// The clip that shows while it plays: its book, or itself.
const shownFor = (a) => (modeOf(a) === "book" && bookOf(a)) || a;
// The audiobook that goes with an open clip.
const audioFor = (p) => (!p ? null : hasSound(p) ? p
  : state.pages.find((a) => isAudiobook(a) && modeOf(a) === "book" && bookOf(a) === p) || null);
// Opening an audiobook that reads along with a book opens the book.
function listenRedirect(p) {
  if (!isAudiobook(p) || p.audio.overlay) return null;
  const b = modeOf(p) === "book" ? bookOf(p) : null;
  return b ? b.id : null;
}

// ---- Bringing one in ----

const sha = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function partLength(part, file) {
  if (A.native) {
    const got = await A.probe(part.ref, part.offset, part.length);
    return got ? { dur: (got.duration || 0) / 1000, got } : { dur: 0, got: null };
  }
  const url = URL.createObjectURL(file);
  try { return { dur: await A.length(url), got: null }; } finally { URL.revokeObjectURL(url); }
}

// One sound file (`file` from the picker, `ref` its lasting permission).
async function addAudiobook(file, ref) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const lock = L.locked(head, file.name);
  if (lock) { if (ref) C.platform.files.release(ref); toast(L.lockedText(lock)); return; }
  if (!ref) { toast(t("Waypage plays an audiobook from where it is, so it needs lasting access. Add it with Add a file.")); return; }
  const kind = L.sniff(head, file.name) || "mp3";
  const dup = state.pages.find((p) => isAudiobook(p) && p.file && p.file.name === file.name && p.file.size === file.size);
  if (dup) { C.platform.files.release(ref); toast(t("Already in your library")); openPage(dup.id); return; }
  toast(t("Adding “{baseName}”…", { baseName: L.baseName(file.name) }));
  const part = { ref, name: file.name.slice(0, 200), size: file.size, dur: 0 };
  const [{ dur, got }, tags, fp] = await Promise.all([partLength(part, file), L.tags(file, kind), C.files.fingerprint(file)]);
  part.dur = dur;
  if (!dur) { toast(t("Waypage can't play this file.")); C.platform.files.release(ref); return; }
  const cover = (got && got.cover && b64bytes(got.cover)) || tags.cover || null;
  const meta = await newAudiobook({
    title: (got && (got.album || got.title)) || tags.title || L.baseName(file.name), byline: (got && got.artist) || tags.artist || "",
    file: { name: file.name.slice(0, 200), kind: "audio", ext: kind, size: file.size, ...(fp ? { fp } : {}) }, link: ref,
    audio: { parts: [part], chapters: tags.chapters.filter((c) => c.t < dur), dur },
  }, cover);
  arrived(meta);
}

// The folder's own picture: cover.jpg, folder.png and the like first,
// then the biggest one.
async function folderCover(all) {
  const pics = all.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name) && f.size > 0 && f.size < 20 << 20);
  if (!pics.length) return null;
  const named = (f) => /^(cover|folder|front|album ?art\w*)\./i.test(f.name);
  const pick = pics.find(named) || pics.sort((x, y) => y.size - x.size)[0];
  try {
    const blob = await C.platform.files.blob(pick.ref, pick.size);
    return new Uint8Array(await blob.slice(0, pick.size).arrayBuffer());
  } catch (e) { return null; }
}

// A folder of sound files, one book (the app): in name order, each a
// chapter unless a file has chapters of its own.
async function addAudiobookFolder() {
  let got = null;
  try { got = await C.platform.files.pickFolder(); } catch (e) { got = null; }
  if (!got) return;
  const scan = await C.platform.files.scan(got.ref);
  const files = L.inOrder(scan.files || []);
  if (!scan.ok || !files.length) {
    const lock = scan.ok && (scan.files || []).map((f) => L.locked(null, f.name)).find(Boolean);
    toast(lock ? L.lockedText(lock) : t("There are no sound files in {name}.", { name: got.name }));
    C.platform.files.release(got.ref);
    return;
  }
  if (state.pages.some((p) => isAudiobook(p) && p.link === got.ref)) { toast(t("Already in your library")); return; }
  toast(t("Adding “{x}”, {n} files…", { x: scan.name || got.name, n: files.length }));
  const parts = [], chapters = [];
  // Named for the folder (a file's own title is its chapter's), with the
  // picture in it as the cover, else one a file carries.
  const title = scan.name || got.name;
  let artist = "", cover = await folderCover(scan.files || []), at = 0;
  for (const f of files) {
    const part = { ref: f.ref, name: String(f.name).slice(0, 200), size: f.size || 0, dur: 0 };
    const { dur, got: g } = await partLength(part, null);
    if (!dur) continue;
    part.dur = dur;
    let own = [];
    if (/\.(mp3|m4a|m4b)$/i.test(f.name)) {
      try {
        const blob = await C.platform.files.blob(f.ref, f.size);
        const t = await L.tags(blob, L.sniff(null, f.name));
        own = t.chapters || [];
        if (!cover && t.cover) cover = t.cover;
        if (!artist && t.artist) artist = t.artist;
      } catch (e) { /* the name will do */ }
    }
    if (g) { if (!artist && g.artist) artist = g.artist; if (!cover && g.cover) cover = b64bytes(g.cover); }
    if (own.length > 1) own.forEach((c) => chapters.push({ t: at + c.t, title: c.title }));
    else chapters.push({ t: at, title: (g && g.title) || L.baseName(f.name) });
    parts.push(part);
    at += dur;
  }
  if (!parts.length) { toast(t("Waypage can't play the files in {name}.", { name: got.name })); C.platform.files.release(got.ref); return; }
  const fp = await sha(parts.map((p) => p.name + ":" + p.size).join("|"));
  const size = parts.reduce((s, p) => s + p.size, 0);
  const meta = await newAudiobook({
    title, byline: artist,
    file: { name: (scan.name || got.name).slice(0, 200), kind: "audio", ext: L.extOf(parts[0].name) || "mp3", size, fp }, link: got.ref,
    audio: { parts, chapters, dur: at, folder: true },
  }, cover);
  arrived(meta);
}

// The library entry and its page: the chapters until there are words.
async function newAudiobook(o, cover) {
  const id = o.id || C.save.newId();
  const meta = {
    id, url: "", title: String(o.title).replace(/\s+/g, " ").trim().slice(0, 300) || t("Audiobook"), site: t("Audiobook"), byline: String(o.byline || "").slice(0, 200), licence: null,
    savedAt: Date.now(), minutes: Math.max(1, Math.round(o.audio.dur / 60)), lang: "", dir: "", mode: "full", next: "", prev: "", at: 0, finished: false,
    images: 0, missing: 0, imageBytes: 0, file: o.file, link: o.link, audio: o.audio, listen: { t: 0, tAt: 0, dur: Math.round(o.audio.dur), mode: "listen" },
  };
  if (cover && cover.length) {
    const type = C.backup.imageType(cover);
    if (type) { try { meta.thumb = await C.files.thumbnail(id, cover, type); } catch (e) { /* no cover */ } }
  }
  await writeListenPage(meta, null);
  return meta;
}
async function arrived(meta) {
  outsideKnown(meta);
  state.pages.unshift(meta);
  await C.store.writeIndex(state.pages);
  await loadThumbs();
  renderLibrary();
  toast(t("Added “{title}”", { title: meta.title }));
  await openPage(meta.id);
  if (state.open === meta) openSheet("page");
}

// ---- From Discover: LibriVox (2026-11) ----
// A recording's MP3 parts downloaded one by one into the app's own storage
// (audiobooks/<id>/, removed with the clip), played from there like a
// folder of files. Never in a backup or sync, like any audiobook; its
// place syncs by a fingerprint made from the recording, so another phone
// that downloads it too picks up where you are. The app only: a browser
// can't keep files, and Android's player is the one that plays them.
function audioStore() { return C.platform.plugin("Filesystem"); }
const canGetAudiobooks = () => A.native && !!audioStore();
async function getAudiobook(s, withBook) {
  const FS = audioStore();
  if (!canGetAudiobooks()) return;
  if (state.pages.some((p) => p.audio && p.audio.from === s.id)) { toast(t("It's in your library already.")); return; }
  if (audioGets.some((g) => g.from === s.id)) { toast(t("It's downloading. It joins your Library when it's done.")); return; }
  if (!navigator.onLine) { toast(t("You're offline. Add it when you're back online.")); return; }
  const id = C.save.newId(), dir = "audiobooks/" + id;
  const g = { id, from: s.id, title: s.title, done: 0, total: 0, stopped: false };
  audioGets.push(g);
  renderDownloads();
  toast(t("Downloading “{replace}”. It's in Downloads.", { replace: s.title }));
  try {
    const d = await C.discover.lvDetails(s);
    const list = d.parts || [];
    if (!list.length) throw new Error("no parts");
    g.total = list.length;
    const parts = [], chapters = [];
    let at = 0, size = 0;
    for (let i = 0; i < list.length; i++) {
      if (g.stopped) throw new Error("stopped");
      g.done = i;
      paintDownloads();
      paintAudioGets();
      const path = dir + "/" + String(i + 1).padStart(3, "0") + ".mp3";
      // A part that breaks off is tried once more.
      for (let tries = 0; ; tries++) {
        try { await C.platform.downloadTo(list[i].url, path, null, "DATA", undefined, 15 * 60000); break; }
        catch (e) { if (tries || g.stopped) throw e; }
      }
      const { uri } = await FS.getUri({ path, directory: "DATA" });
      const bytes = (await FS.stat({ path, directory: "DATA" })).size || 0;
      const part = { ref: uri, name: (list[i].title || path.split("/").pop()).slice(0, 200), size: bytes, dur: list[i].dur || 0 };
      if (!part.dur) part.dur = (await partLength(part, null)).dur;
      if (!part.dur) continue;
      chapters.push({ t: at, title: list[i].title || t("Part {n}", { n: i + 1 }) });
      parts.push(part);
      at += part.dur;
      size += bytes;
    }
    if (!parts.length) throw new Error("no parts");
    g.done = g.total;
    paintDownloads();
    let cover = null;
    if (d.cover) {
      try { const got = await C.platform.fetchBytes(d.cover, "cover.jpg"); if (got.status === 200) cover = new Uint8Array(await got.blob.arrayBuffer()); } catch (e) { /* no cover */ }
    }
    const { uri: folder } = await FS.getUri({ path: dir, directory: "DATA" });
    const meta = await newAudiobook({
      id, title: d.title, byline: d.by,
      file: { name: d.title.slice(0, 200), kind: "audio", ext: "mp3", size, fp: await sha("librivox:" + s.id) }, link: folder,
      audio: { parts, chapters, dur: at, folder: true, from: s.id },
    }, cover);
    meta.url = d.url;
    meta.site = "LibriVox";
    dropAudioGet(g);
    await arrived(meta);
    if (withBook) await audiobookBook(meta, d);
  } catch (e) {
    FS.rmdir({ path: dir, directory: "DATA", recursive: true }).catch(() => {});
    toast(g.stopped ? t("Stopped. Nothing was kept.") : t("Couldn't download it just now. Try again later, or open it on the site."));
  } finally {
    dropAudioGet(g);
  }
}
function dropAudioGet(g) {
  const i = audioGets.indexOf(g);
  if (i < 0) return;
  audioGets.splice(i, 1);
  renderDownloads();
}
// The Project Gutenberg book the recording was read from, downloaded and
// read along with (Find the book in Discover does the same by hand).
async function audiobookBook(a, d) {
  try {
    const book = await C.discover.pgBook(C.discover.pgNumber(d.text));
    if (!book) return;
    const name = dzBookName(book);
    const have = state.pages.find((p) => p.file && p.file.name === name);
    if (have) { listenMode(a, "book", have); return; }
    pairPending = { audio: a.id, name, at: Date.now() };
    await saveFileLink(book.epub, name, book.url);
  } catch (e) { /* the audiobook is there; the book can be found by hand */ }
}

// ---- The audiobook's own page ----

// Its text: the transcript of the chapter you're in, under its name.
// Nothing at all where nothing is written yet: no chapter's words
// standing in for another's.
function heardWords(a, data) {
  return L.applyFixes(L.timedWords((data && data.pieces) || []), (a.listen && a.listen.fixes) || []);
}
const pageCh = {};
const placeNow = (a) => (lis.key === a.id ? lis.t : placeOf(a));
function chapterNow(a, t) {
  const ch = chaptersOf(a);
  return ch.length > 1 ? Math.max(0, L.chapterAt(ch, t)) : -1;
}
function inChapter(a, words, ci) {
  if (ci < 0) return words;
  const ch = chaptersOf(a), from = ch[ci].t - 0.3, to = ch[ci + 1] ? ch[ci + 1].t - 0.3 : Infinity;
  return words.filter((w) => w.t >= from && w.t < to);
}
function listenRoot(a, data, all, ci, out) {
  const prefs = listenPrefs();
  const words = inChapter(a, all, ci);
  const chapters = !prefs.chapters ? [] : ci < 0 ? chaptersOf(a) : [chaptersOf(a)[ci]];
  const root = words.length ? L.transcriptBody(out, L.paragraphs(words, { chapters, pauses: prefs.pauses, ranges: (data && data.ranges) || [] })) : out.createElement("div");
  root.className = "co-body";
  return root;
}
async function writeListenPage(a, data) {
  const out = document.implementation.createHTMLDocument("");
  const all = heardWords(a, data);
  const ci = chapterNow(a, placeNow(a));
  pageCh[a.id] = ci;
  const root = listenRoot(a, data, all, ci, out);
  const html = C.save.savedPageHtml(a, root, out);
  const text = C.save.plainText(root);
  a.bytes = (await C.store.writePage(a.id, html, a)) + C.store.bytesOf(text);
  if (all.length) a.minutes = Math.max(1, Math.round(durOf(a) / 60));
  await C.store.writeText(a.id, text);
  return html;
}

// ---- Streamed audiobooks ----
// An audiobook that streams from a server (`remote` on the entry, the
// Audiobookshelf extension) plays like any other. Its extension fills in
// REMOTE_AUDIO[kind] once it loads: open(a, adopt) starts the stream and
// gives each part's address (adopt: take the server's place when it's
// newer), uri(a, part) the address while open, heard(a, now) hears where
// you are, done(a) that it stopped.
const REMOTE_AUDIO = {};
async function remoteFor(a) {
  const kind = a.remote.kind;
  if (!REMOTE_AUDIO[kind]) { try { await C.ext.load(kind); } catch (e) { /* said below */ } }
  if (REMOTE_AUDIO[kind]) return REMOTE_AUDIO[kind];
  const x = C.ext.list().find((e) => e.id === kind);
  throw new Error(t("Turn on {name} in Settings › Extensions to play this.", { name: x ? x.title : kind }));
}
const remoteSaid = (a, how) => { const r = a && a.remote && REMOTE_AUDIO[a.remote.kind]; if (r) r[how === "done" ? "done" : "heard"](a, how); };

// ---- Playing ----

async function partsToPlay(a) {
  if (a.remote) {
    const urls = await (await remoteFor(a)).open(a, false);
    return urls.map((u) => (A.native ? { uri: u } : { src: async () => u }));
  }
  if (A.native) {
    return a.audio.parts.map((p) => (a.audio.overlay ? { uri: a.link, offset: p.offset, length: p.length } : { uri: p.ref }));
  }
  const whole = a.audio.overlay ? await C.platform.files.blob(a.link, a.file.size) : null;
  return a.audio.parts.map((p) => ({
    src: async () => {
      const blob = whole ? whole.slice(p.offset, p.offset + p.length) : await C.platform.files.blob(p.ref, p.size);
      const bytes = blob instanceof Blob ? blob : new Blob([await blob.arrayBuffer()]);
      return URL.createObjectURL(new Blob([bytes], { type: L.MIMES[L.extOf(p.name)] || "audio/mpeg" }));
    },
  }));
}

function chapterName(a, t) {
  const ch = chaptersOf(a), i = L.chapterAt(ch, t);
  return i >= 0 ? ch[i].title || i18n.t("Chapter {n}", { n: i + 1 }) : "";
}

async function listenPlay(a, at) {
  if (!a) return;
  if (aloudOn()) stopAloud();
  if (a.audio.overlay && a.audio.parts.some((p) => !p.stored)) { toast(i18n.t("This book's narration is packed in a way Waypage can't play yet.")); return; }
  if (a.remote) {
    if (lis.key && lis.key !== a.id) saveListenPlace(true);
    Object.assign(lis, { key: a.id, state: "loading", said: -1 });
    paintListen();
    try { await (await remoteFor(a)).open(a, at == null); } catch (e) {
      Object.assign(lis, { key: "", state: "stopped" });
      paintListen();
      toast(e.message || i18n.t("Couldn't play it. Try again."));
      return;
    }
  }
  const t = Math.max(0, Math.min(at != null ? at : placeOf(a) >= durOf(a) - 2 ? 0 : placeOf(a), Math.max(0, durOf(a) - 1)));
  const { part, pos } = L.partAt(a.audio.parts, t);
  if (lis.key && lis.key !== a.id) saveListenPlace(true);
  Object.assign(lis, { key: a.id, state: "loading", part, t, said: -1, held: false });
  a.readAt = Date.now();
  paintListen();
  try {
    await A.play({ parts: await partsToPlay(a), part, pos: pos * 1000, rate: speedOf(a), title: a.title, subtitle: a.byline || "", key: a.id,
      chapters: carChapters(a), cover: thumbUrl(a) || "" });
  } catch (e) {
    lis.state = "stopped";
    paintListen();
    toast(a.remote ? (e && e.message) || i18n.t("Couldn't play it. Try again.") : i18n.t("Couldn't play it. If the file moved, add it again."));
    return;
  }
  loadListenData(a).then(() => { readAlong(true); writeAhead(); });
}
function listenToggle() {
  const a = listenPage();
  if (lis.state === "playing") A.pause();
  else if (lis.state === "paused" && a) {
    // Back a little after a pause, more after a long one.
    const away = lis.pausedAt ? Date.now() - lis.pausedAt : 0;
    if (listenPrefs().rewind && away > 10000) listenSeek(Math.max(0, lis.t - (away > 10 * 60000 ? 10 : 3)));
    A.resume();
  } else listenPlay(audioFor(state.open) || a);
}
function listenStop() {
  if (!lis.key) return;
  saveListenPlace(true);
  remoteSaid(listenPage(), "done");
  A.stop();
  C.stats.aloud(false, lis.key);
  Object.assign(lis, { key: "", state: "stopped", said: -1 });
  C.reader.say(-1);
  paintListen();
}
function listenSeek(t) {
  const a = listenPage();
  if (!a) return;
  t = Math.max(0, Math.min(t, durOf(a) - 0.5));
  const { part, pos } = L.partAt(a.audio.parts, t);
  lis.t = t; lis.part = part;
  A.seek(part, pos * 1000);
  saveListenPlace();
  paintListen();
  readAlong(true);
}
const listenSkip = (s) => listenSeek(lis.t + s);
function listenSpeed() {
  const a = playerBook();
  if (!a) return;
  const now = speedOf(a);
  const next = SPEEDS[(SPEEDS.indexOf(now) + 1) % SPEEDS.length] || 1;
  a.listen = { ...(a.listen || {}), speed: next, tAt: Date.now(), t: placeOf(a) };
  if (lis.key === a.id) A.rate(next);
  saveListenPlace(true);
  paintListen();
}

// The player's word on where it is, about twice a second.
A.on((s) => {
  if (!s || !s.key) return;
  if (!lis.key && (s.state === "playing" || s.state === "paused")) lis.key = s.key;
  if (s.key !== lis.key) return;
  const a = listenPage();
  if (!a) { if (s.state !== "stopped") A.stop(); return; }
  const was = lis.state;
  lis.state = s.state === "ended" ? "stopped" : s.state;
  lis.part = s.part || 0;
  const part = a.audio.parts[lis.part];
  if (part && s.dur > 0 && Math.abs((part.dur || 0) - s.dur / 1000) > 1) { part.dur = s.dur / 1000; a.audio.dur = a.audio.parts.reduce((x, p) => x + (p.dur || 0), 0); }
  if (s.state !== "loading") lis.t = L.startOf(a.audio.parts, lis.part) + (s.pos || 0) / 1000;
  if (s.state === "ended") { lis.t = durOf(a); a.finished = true; }
  if (a.remote && (s.state === "ended" || s.state === "stopped" || s.state === "error")) { saveListenPlace(true); remoteSaid(a, "done"); }
  C.stats.aloud(lis.state === "playing", a.id);
  if (s.state === "stopped") { Object.assign(lis, { key: "", state: "stopped" }); C.reader.say(-1); }
  if (was !== lis.state) {
    lis.pausedAt = lis.state === "paused" ? Date.now() : 0;
    listenFloat();
    if (listenPrefs().awake) speech.keepScreen(lis.state === "playing");
  }
  saveListenPlace(was !== lis.state);
  paintListen();
  readAlong(false);
  if (lis.state === "playing" && Date.now() - lis.seen > 20000) { lis.seen = Date.now(); writeAhead(); }
});
// The small window outside the app while an audiobook plays (Android),
// like Narrate's: its name, the chapter, and the paragraph being said.
function listenFloat() {
  A.pip(listening() && listenPrefs().pip, lis.state !== "paused");
  if (document.body.classList.contains("pip")) paintPip();
}
function listenPipView() {
  const a = listenPage();
  if (!a || !listening()) return null;
  const mine = state.open && shownFor(a) === state.open;
  const b = mine && lis.sync && lis.said >= 0 ? lis.sync.b[lis.said] : -1;
  const text = b >= 0 ? C.reader.readable(READ_OPTS)[b] || "" : "";
  return { title: a.title, over: chapterName(a, lis.t) || t("Audiobook"), text, paused: lis.state === "paused" };
}
listenOptions();
A.onSleep((at) => { lis.sleepAt = at; paintListen(); });
// Playing when the app opened (the phone kept it going).
A.state().then((s) => { if (s && s.key && (s.state === "playing" || s.state === "paused") && !lis.key) { lis.key = s.key; lis.state = s.state; lis.sleepAt = s.sleep || 0; } });

// Where you are goes into the entry: every few seconds while it plays,
// and at once when it stops or pauses. It syncs like a place in a clip.
function saveListenPlace(now) {
  const a = listenPage();
  if (!a || lis.state === "loading") return;
  a.listen = { ...(a.listen || {}), t: Math.round(lis.t * 10) / 10, tAt: Date.now(), dur: Math.round(durOf(a)) };
  if (a.remote) remoteSaid(a, now);
  if (!now && Date.now() - lis.savedAt < 8000) return;
  lis.savedAt = Date.now();
  C.store.writeIndexOnly(state.pages);
  if (now && C.sync.on) syncSoon();
}

// ---- The player in the reader, and the bar elsewhere ----

const ICON_HEAD = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z"></path></svg>';
function paintListen() {
  const a = listenPage();
  const open = state.open;
  const mine = open && (a ? shownFor(a) === open : !!audioFor(open));
  const here = audioFor(open);
  if (here && isAudiobook(open) && !open.audio.overlay) $("readerAloud").hidden = true;
  // No words on the page yet: nothing to highlight, draw on or translate.
  if (audioWordless(open)) {
    for (const id of ["readerMarks", "readerTranslate", "readerInk"]) $(id).hidden = true;
    coverIn(open);
  }
  const show = !!here;
  if (here && !here.audio.overlay && modeOf(here) === "transcript" && state.open === here && chapterNow(here, placeNow(here)) !== pageCh[here.id]) turnPage(here);
  $("readerChapters").hidden = !here || (chaptersOf(playerBook()).length < 2 && !bookmarksOf(playerBook()).length);
  const box = $("listenPlayer");
  const was = box.hidden;
  box.hidden = !show;
  $("readerView").classList.toggle("listening", show);
  if (show) {
    const b = a && mine ? a : here;
    const t = trackDrag ? trackDrag.at : a && mine ? lis.t : placeOf(b);
    const ch = chaptersOf(b), ci = L.chapterAt(ch, t);
    const from = ci >= 0 ? ch[ci].t : 0, to = ci >= 0 && ch[ci + 1] ? ch[ci + 1].t : durOf(b);
    const f = to > from ? Math.min(1, Math.max(0, (t - from) / (to - from))) : 0;
    $("listenFill").style.transform = "scaleX(" + f + ")";
    $("listenKnob").style.insetInlineStart = f * 100 + "%";
    $("listenTrack").setAttribute("aria-valuenow", String(Math.round(f * 100)));
    $("listenAt").textContent = L.timeText(t - from);
    $("listenLeft").textContent = "−" + L.timeText(Math.max(0, to - t));
    $("listenSpeed").textContent = (Math.round(speedOf(b) * 100) / 100) + "×";
    const { back, on } = listenPrefs();
    $("listenBack").lastChild.textContent = String(back);
    $("listenBack").setAttribute("aria-label", i18n.t("Back {back} seconds", { back: back }));
    $("listenOn").lastChild.textContent = String(on);
    $("listenOn").setAttribute("aria-label", i18n.t("Forward {on} seconds", { on: on }));
    const playing = !!(a && mine && lis.state === "playing");
    $("listenPlay").classList.toggle("paused", !playing);
    $("listenPlay").setAttribute("aria-label", playing ? i18n.t("Pause") : i18n.t("Play"));
    $("listenSleep").classList.toggle("on", !!lis.sleepAt);
    $("listenMark").classList.toggle("on", bookmarksOf(b).some((m) => Math.abs(m.t - t) < 3));
    if (was) $("readFoot").style.bottom = "";
    $("readFoot").style.bottom = box.offsetHeight + "px";
  } else $("readFoot").style.bottom = "";
  // The bar along the bottom while it plays from somewhere else.
  const bar = $("listenBar");
  const away = !!a && listening() && !mine && !here;
  bar.hidden = !away;
  document.body.classList.toggle("listen-bar-up", away);
  if (away) {
    $("listenBarTitle").textContent = a.title;
    $("listenBarNote").textContent = [chapterName(a, lis.t), i18n.t("{time} left", { time: L.timeText(Math.max(0, durOf(a) - lis.t)) })].filter(Boolean).join(" · ");
    $("listenBarPlay").classList.toggle("paused", lis.state !== "playing");
    $("listenBarPlay").setAttribute("aria-label", lis.state === "playing" ? t("Pause") : t("Play"));
    placeAloudBar(bar);
  }
}
// Into another chapter: the page becomes that chapter's.
let turning = false;
async function turnPage(a) {
  if (turning) return;
  turning = true;
  try {
    const html = await writeListenPage(a, await loadListenData(a));
    lis.sync = null;
    if (state.open === a) await show(a, html);
  } finally { turning = false; }
}
function audioWordless(p) {
  if (!isAudiobook(p) || state.open !== p) return false;
  const d = $("readerFrame").contentDocument, body = d && d.querySelector(".co-body");
  return !!body && !body.textContent.trim();
}
// Nothing to read yet: the book's cover fills the page instead.
function coverIn(p) {
  const d = $("readerFrame").contentDocument, body = d && d.querySelector(".co-body"), src = thumbUrl(p);
  if (!body || !src || body.querySelector(".co-listen-cover")) return;
  const img = d.createElement("img");
  img.className = "co-listen-cover";
  img.alt = "";
  img.src = src;
  body.append(img);
}
// How far the transcript goes on unbroken from `t`.
function writtenTo(data, t) {
  let to = t;
  for (const [a, b] of data.ranges) if (a <= to + 1 && b > to) to = b;
  return to;
}

{
  // Another book playing: this one's play button switches to it.
  const mine = () => lis.key && playerBook() === listenPage();
  $("listenPlay").addEventListener("click", () => (mine() || !lis.key ? listenToggle() : listenPlay(playerBook())));
  $("listenBack").addEventListener("click", () => (mine() ? listenSkip(-listenPrefs().back) : null));
  $("listenOn").addEventListener("click", () => (mine() ? listenSkip(listenPrefs().on) : null));
  $("listenSpeed").addEventListener("click", listenSpeed);
  $("listenSleep").addEventListener("click", () => toggleSheet("listenSleep"));
  $("listenMark").addEventListener("click", listenBookmark);
  $("readerChapters").addEventListener("click", () => toggleSheet("listenChapters"));
  $("listenBarPlay").addEventListener("click", listenToggle);
  $("listenBarBack").addEventListener("click", () => listenSkip(-listenPrefs().back));
  $("listenBarStop").addEventListener("click", listenStop);
  $("listenBarOpen").addEventListener("click", () => { const a = listenPage(); if (a) openPage(shownFor(a).id); });
  // Dragging along the track moves within the chapter: the dot and the
  // times follow the finger, and it seeks once, on letting go.
  const track = $("listenTrack");
  const placeAt = (x) => {
    const a = playerBook();
    if (!a) return null;
    const r = track.getBoundingClientRect();
    let f = Math.min(1, Math.max(0, (x - r.left) / r.width));
    if (getComputedStyle(track).direction === "rtl") f = 1 - f;
    const ch = chaptersOf(a), t = lis.key === a.id ? lis.t : placeOf(a), ci = L.chapterAt(ch, t);
    const from = ci >= 0 ? ch[ci].t : 0, to = ci >= 0 && ch[ci + 1] ? ch[ci + 1].t : durOf(a);
    return { a, at: Math.min(from + f * (to - from), Math.max(from, to - 0.5)) };
  };
  const dragTo = (e) => { const p = placeAt(e.clientX); if (p) { trackDrag = p; paintListen(); } };
  const endDrag = (go) => {
    const p = trackDrag;
    trackDrag = null;
    track.classList.remove("dragging");
    if (!go || !p) { paintListen(); return; }
    if (lis.key === p.a.id) listenSeek(p.at); else listenPlay(p.a, p.at);
  };
  track.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    track.setPointerCapture(e.pointerId);
    track.classList.add("dragging");
    dragTo(e);
  });
  track.addEventListener("pointermove", (e) => { if (trackDrag) dragTo(e); });
  track.addEventListener("pointerup", () => endDrag(true));
  track.addEventListener("pointercancel", () => endDrag(false));
  track.addEventListener("lostpointercapture", () => { if (trackDrag) endDrag(true); });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); listenSkip((e.key === "ArrowRight") === (getComputedStyle(track).direction !== "rtl") ? listenPrefs().on : -listenPrefs().back); }
  });
  addEventListener("resize", () => { if (!$("listenBar").hidden) placeAloudBar($("listenBar")); });
}

// ---- Reading along ----

const listenData = async (a) => {
  const data = (await C.store.readListen(a.id)) || { pieces: [], ranges: [] };
  const mended = L.mendTimes(data.pieces || [], a.audio.parts);
  if (mended.some((x, i) => x !== data.pieces[i])) { data.pieces = mended; data.sync = null; data.syncKey = ""; await C.store.writeListen(a.id, data); }
  return data;
};
async function loadListenData(a) {
  if (lis.dataFor === a.id && lis.data) return lis.data;
  lis.data = await listenData(a);
  lis.dataFor = a.id;
  return lis.data;
}
// Called by the reader when a clip has opened (show, app-reader.js).
function listenOpened(p) {
  // Another clip opened by hand stops the book when "Keep playing when
  // you leave the book" is off, as Narrate's switch does (app-reader.js).
  const a0 = audioFor(p);
  if (lis.key && !listenPrefs().keep && (!a0 || a0.id !== lis.key)) listenStop();
  lis.said = -1;
  lis.sync = null; lis.syncFor = "";
  const a = audioFor(p);
  if (a) loadListenData(a).then(() => { if (state.open === p) { readAlong(true); paintListen(); } });
  paintListen();
}
function listenClosed() {
  if (lis.key && !listenPrefs().keep) listenStop();
  C.reader.say(-1);
  lis.said = -1;
  paintListen();
}

// The timings for the clip open now: made once a clip opens and again as
// the transcript grows, kept in listen.json for the next time.
let syncing = null;
async function syncFor(a, page) {
  const data = await loadListenData(a);
  const fixes = JSON.stringify((a.listen && a.listen.fixes) || []);
  const ci = page === a ? pageCh[a.id] : undefined;
  const key = page.id + ":" + (ci == null ? "" : "c" + ci + ":") + (page.editedAt || page.savedAt || 0) + ":" + (data.pieces || []).length + ":" + fixes.length + ":" + listenPrefs().pauses + listenPrefs().chapters;
  if (lis.syncFor === key && lis.sync) return lis.sync;
  if (data.syncKey === key && data.sync) { lis.sync = data.sync; lis.syncFor = key; return lis.sync; }
  if (syncing && syncing.key === key) return syncing.run;
  const run = (async () => {
    let sync;
    if (a.audio.overlay) {
      if (state.open !== page) return null;
      C.reader.readable(READ_OPTS);
      sync = L.overlaySync(a.audio.pars || [], a.audio.parts, (id) => C.reader.spotOfId(id));
    } else {
      const words = ci == null ? heardWords(a, data) : inChapter(a, heardWords(a, data), ci);
      if (!words.length) return null;
      const html = page === a ? await C.store.readPage(a.id) : page.link ? await C.files.openLinked(page) : await C.store.readPage(page.id);
      const texts = C.reader.readableIn(html, READ_OPTS);
      const book = L.bookWords(texts);
      sync = L.syncOf(book, L.align(words, book));
      if (page !== a && data.pieces.length > 20 && L.matched(words, sync) < 0.15 && !data.warned) {
        data.warned = true;
        toast(t("The audiobook doesn't seem to match this book's words. Check it's the same book and language."));
      }
    }
    data.sync = sync; data.syncKey = key;
    await C.store.writeListen(a.id, data);
    lis.sync = sync; lis.syncFor = key;
    return sync;
  })().finally(() => { if (syncing && syncing.key === key) syncing = null; });
  syncing = { key, run };
  return run;
}

// The word being said, lit in the open clip.
let alongBusy = false;
async function readAlong(force) {
  const a = listenPage();
  const p = state.open;
  if (!a || !p || shownFor(a) !== p || !listening()) { if (lis.said >= 0) { C.reader.say(-1); lis.said = -1; } return; }
  if (alongBusy) return;
  if (!lis.sync || force) {
    alongBusy = true;
    try { await syncFor(a, p); } catch (e) { /* no timings yet */ } finally { alongBusy = false; }
    if (state.open !== p) return;
    if (force) C.reader.readable(READ_OPTS);
  }
  const s = lis.sync;
  if (!s) return;
  const i = L.wordAt(s, lis.t);
  if (i === lis.said && !force) return;
  lis.said = i;
  if (C.reader.blockCount() === 0) C.reader.readable(READ_OPTS);
  if (i < 0) { C.reader.say(-1); maybeReshow(a); return; }
  C.reader.say(s.b[i], s.o[i], s.o[i] + s.l[i]);
  if (s.b[i] !== lis.pipBlock) { lis.pipBlock = s.b[i]; if (document.body.classList.contains("pip")) paintPip(); }
}
// A transcript that's grown past what's shown is shown again, now and
// then, when you're at its end.
let reshownAt = 0;
async function maybeReshow(a) {
  if (state.open !== a || !lis.data || Date.now() - reshownAt < 30000) return;
  const last = lis.sync && lis.sync.t.length ? lis.sync.t[lis.sync.t.length - 1] : -1;
  if (writtenTo(lis.data, lis.t) <= Math.max(last, lis.t) + 1) return;
  reshownAt = Date.now();
  const html = await C.store.readPage(a.id);
  if (state.open === a) await show(a, html);
}

// Play from here: the word picked in the open clip (the selection bar's
// button, which reads "Play from here" on an audiobook's text).
async function listenFrom(spot) {
  const p = state.open;
  const a = audioFor(p);
  if (!a) return false;
  C.reader.readable(READ_OPTS);
  const at = C.reader.spotIn(spot);
  const s = await syncFor(a, p).catch(() => null);
  const t = s ? L.timeAt(s, at.index, at.offset) : null;
  if (t == null) { toast(modeOf(a) === "listen" ? i18n.t("Pick a way to read along first, in ⋯.") : i18n.t("That part hasn't been heard yet. It plays from here once the transcript reaches it.")); return true; }
  if (lis.key === a.id) listenSeek(t); else listenPlay(a, t);
  return true;
}

// ---- Transcripts, a little ahead of where you are ----

let packs = null;
async function listenModels() { packs = await A.models(); return packs; }
const readyPack = () => {
  if (!packs || !packs.supported) return null;
  const want = listenPrefs().pack;
  const ready = (packs.packs || []).filter((p) => p.ready);
  return ready.find((p) => p.id === want) || ready.find((p) => p.id === "better") || ready[0] || null;
};
const wantsWords = (a) => !!a && !a.audio.overlay && (modeOf(a) === "transcript" || modeOf(a) === "book");

// The first stretch from `t` that isn't written yet, or null when the
// next AHEAD seconds are.
function nextGap(a, data, t, ahead) {
  const end = Math.min(durOf(a), t + ahead);
  if (ahead === Infinity) t = 0;
  let at = t;
  for (const [x, y] of [...(data.ranges || [])].sort((m, n) => m[0] - n[0])) if (x <= at + 1 && y > at) at = y;
  return at < end - 1 ? at : null;
}
function addRange(ranges, from, to) {
  const all = [...ranges, [from, to]].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const r of all) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]); else out.push([r[0], r[1]]); }
  return out;
}

let aheadTimer = 0;
async function writeAhead() {
  clearTimeout(aheadTimer);
  if (lis.writing || lis.held || !A.canTranscribe) return;
  if (!packs) await listenModels();
  const pack = readyPack();
  if (!pack) return;
  // The one playing, a little ahead; then one asked to be written whole
  // (Write the rest now); then, charging with the switch on, the one
  // heard last.
  const playing = listenPage();
  let a = null, data = null, from = null;
  const tryBook = async (b, t, ahead) => {
    if (!b || a) return;
    const d = b.id === lis.dataFor ? lis.data : await listenData(b);
    const f = nextGap(b, d, Math.max(0, t), ahead);
    if (f != null) { a = b; data = d; from = f; }
  };
  if (wantsWords(playing)) await tryBook(playing, lis.t - 2, AHEAD);
  const whole = lis.wholeFor && state.pages.find((p) => p.id === lis.wholeFor && wantsWords(p));
  if (lis.wholeFor && !a) {
    await tryBook(whole, 0, Infinity);
    if (!a) {
      if (whole) toast(t("The transcript of “{title}” is all written.", { title: whole.title }));
      lis.wholeFor = "";
    }
  }
  if (!a && listenPrefs().charging && packs && packs.charging) {
    const last = state.pages.filter((p) => isAudiobook(p) && wantsWords(p)).sort((x, y) => ((y.listen && y.listen.tAt) || 0) - ((x.listen && x.listen.tAt) || 0))[0];
    await tryBook(last, 0, Infinity);
  }
  if (!a) return;
  if (data.pack && data.pack !== pack.id && !data.pieces.length) data.pack = pack.id;
  const { part, pos } = L.partAt(a.audio.parts, from);
  const partStart = L.startOf(a.audio.parts, part), partEnd = partStart + (a.audio.parts[part].dur || 0);
  const to = Math.min(partEnd, from + CHUNK);
  if (to - from < 0.5) { data.ranges = addRange(data.ranges || [], from, to); aheadTimer = setTimeout(writeAhead, 100); return; }
  const p = a.audio.parts[part];
  lis.writing = true;
  lis.job = { id: a.id, from, to, data, partStart };
  paintListen();
  try {
    const ch = chaptersOf(a), ci = L.chapterAt(ch, from);
    const cFrom = ci >= 0 ? ch[ci].t : 0, cTo = ci >= 0 && ch[ci + 1] ? ch[ci + 1].t : durOf(a);
    const part01 = (t) => (cTo > cFrom ? Math.min(1, Math.max(0, (t - cFrom) / (cTo - cFrom))) : -1);
    const uri = a.remote ? REMOTE_AUDIO[a.remote.kind] && REMOTE_AUDIO[a.remote.kind].uri(a, part) : a.audio.overlay ? a.link : p.ref;
    if (!uri) throw new Error("stopped");
    const res = await A.transcribe({ uri, from: Math.round(pos * 1000), to: Math.round((pos + (to - from)) * 1000), pack: pack.id, lang: (a.lang || "").split("-")[0],
      title: a.title, text: ci >= 0 ? (ch[ci].title || t("Chapter {n}", { n: ci + 1 })) + (ch.length > 1 ? " · " + t("{done} of {total}", { done: ci + 1, total: ch.length }) : "") : "", done: part01(from), end: part01(to) });
    const pieces = L.onBookClock(res.pieces || [], partStart);
    data.pieces = (data.pieces || []).filter((x) => x.t1 <= from + 0.05 || x.t0 >= to - 0.05).concat(pieces).sort((x, y) => x.t0 - y.t0);
    data.ranges = addRange(data.ranges || [], from, to);
    data.pack = pack.id;
    if (a.id === lis.dataFor) lis.data = data;
    lis.note = "";
    if (modeOf(a) === "transcript") await writeListenPage(a, data);
    await C.store.writeListen(a.id, data);
    if (state.open && shownFor(a) === state.open) { lis.sync = null; readAlong(true); }
    aheadTimer = setTimeout(writeAhead, 1500);
  } catch (e) {
    const why = String((e && e.message) || e);
    lis.note = why === "battery" ? t("Transcript waits: the battery is low") : why === "hot" ? t("Transcript waits: the phone is hot") : why === "model" ? t("Download a transcript model in Settings") : "";
    if (why !== "stopped" && why !== "model") aheadTimer = setTimeout(writeAhead, why === "busy" ? 5000 : 60000);
  } finally {
    lis.writing = false;
    lis.job = null;
    paintListen();
  }
}
// Each piece as it's written (every 10 to 20 seconds of sound): into the
// book's words straight away, and onto the open transcript's page.
A.onPiece((e) => {
  const j = lis.job;
  if (!j || !j.data || !e || !e.piece) return;
  const a = state.pages.find((p) => p.id === j.id);
  if (!a) return;
  const [x] = L.onBookClock([e.piece], j.partStart);
  if (!x) return;
  const d = j.data;
  d.pieces = (d.pieces || []).filter((y) => y.t1 <= x.t0 + 0.05 || y.t0 >= x.t1 - 0.05).concat([x]).sort((m, n) => m.t0 - n.t0);
  d.ranges = addRange(d.ranges || [], j.from, Math.max(j.from, x.t1));
  liveShow(a, d);
});
// The page grows where it differs: what's there already, and anything
// marked on it, stays put.
function liveShow(a, data) {
  if (!state.open || shownFor(a) !== state.open) return;
  if (modeOf(a) === "transcript" && state.open === a) {
    const doc = $("readerFrame").contentDocument, body = doc && doc.querySelector(".co-body");
    if (!body) return;
    const ci = pageCh[a.id] != null ? pageCh[a.id] : chapterNow(a, placeNow(a));
    const root = listenRoot(a, data, heardWords(a, data), ci, doc);
    const now = [...body.children], want = [...root.children];
    let k = 0;
    while (k < now.length && k < want.length && now[k].textContent === want[k].textContent) k++;
    if (k === now.length && k === want.length) return;
    now.slice(k).forEach((n) => n.remove());
    body.append(...want.slice(k));
    if (!body.classList.contains("co-body")) body.className = "co-body";
  }
  lis.sync = null;
  if (listening()) readAlong(true);
  else C.reader.readable(READ_OPTS);
}

// While charging, with nothing playing, the rest gets written.
addEventListener("online", () => setTimeout(writeAhead, 5000));
setTimeout(() => { if (A.canTranscribe) listenModels().then(() => writeAhead()); }, 15000);
setInterval(() => { if (A.canTranscribe && !lis.writing && lis.state !== "playing") listenModels().then(() => writeAhead()); }, 5 * 60 * 1000);

// Write the rest now: every part of the book not written yet, from the
// start, until it's all there (or Stop).
function writeRest(a, on) {
  lis.wholeFor = on ? a.id : "";
  if (on) {
    if (!readyPack()) { toast(t("Download a transcript model in Settings › Audiobooks first."), t("Open"), () => openSettings(false, "audiobooks")); lis.wholeFor = ""; return; }
    lis.held = false;
    writeAhead();
  } else stopWriting();
}
// Stop, here or on the notification: nothing more is written until a
// book is played again or Write the rest now is pressed.
function stopWriting() {
  lis.held = true;
  lis.wholeFor = "";
  clearTimeout(aheadTimer);
  if (lis.writing) C.platform.audio.stopTranscribing();
  paintListen();
}
if (A.onWritingStopped) A.onWritingStopped(stopWriting);
function writeRestButton(a, after) {
  const on = lis.wholeFor === a.id || (lis.writing && lis.job && lis.job.id === a.id);
  return el("button", { class: "row", type: "button", onclick: () => { writeRest(a, !on); if (after) after(); } },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, on ? t("Stop writing") : t("Write the rest now")),
      el("span", { class: "choice-note" }, on ? t("Starts again when you play it, or here") : t("Every part not written yet, while the app is open"))));
}

// ---- The audiobook's sheet in the reader ----

function listenMode(a, mode, book) {
  a.listen = { ...(a.listen || {}), mode, t: placeOf(a), tAt: Date.now() };
  if (book) a.listen.book = { id: book.id, ...(book.file && book.file.fp ? { fp: book.file.fp } : {}), ...(book.url ? { url: book.url } : {}) };
  if (mode !== "book") delete a.listen.book;
  lis.sync = null; lis.syncFor = "";
  C.store.writeIndexOnly(state.pages);
  if (C.sync.on) syncSoon();
}
// Read along with: under the reader's ⋯, for the audiobook open or the
// one this book is read along with.
function listenAlongRows(p) {
  const a = audioFor(p);
  if (!a || a.audio.overlay) return null;
  const head = el("h3", { class: "overline" }, t("Read along"));
  if (!A.canTranscribe) return [head, el("p", { class: "meta" }, t("Reading along with a book or a transcript is in the Android app, which writes the transcript on the phone."))];
  const row = (label, note, act, accent) => el("button", { class: "row", type: "button", onclick: act },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" + (accent ? " accent" : "") }, label), note ? el("span", { class: "choice-note" }, note) : null));
  // The drop-down picks what it reads along with; under it, only what
  // that one needs. The book waits to be found before it's picked.
  let view = modeOf(a);
  const box = el("div", { class: "listen-along" });
  const reshow = async () => {
    await writeListenPage(a, modeOf(a) === "transcript" ? await loadListenData(a) : null);
    if (state.open === a) show(a, await C.store.readPage(a.id));
  };
  const draw = () => {
    const mode = modeOf(a), book = bookOf(a);
    const data = lis.dataFor === a.id ? lis.data : null;
    const pick = pickRow({ label: t("Read along with"), options: [
      { value: "transcript", label: t("A transcript"), note: t("Written on this phone from the sound") },
      { value: "book", label: t("The book"), note: book ? book.title : t("Find it below") },
      { value: "listen", label: t("Nothing"), note: t("Just listen, with the chapters") }],
      get: () => view,
      set: async (v) => {
        view = v;
        if (v === "transcript" && mode !== "transcript") {
          listenMode(a, "transcript");
          if (!readyPack()) toast(t("Download a transcript model in Settings › Audiobooks."), t("Open"), () => openSettings(false, "audiobooks"));
          lis.held = false;
          writeAhead();
          reshow();
        } else if (v === "listen" && mode !== "listen") { listenMode(a, "listen"); reshow(); }
        else if (v === "book" && book && mode !== "book") { closeSheet(true); pairWith(a, book); return; }
        draw();
      } });
    const transcriptRows = () => [
      writeRestButton(a, () => closeSheet()),
      data && data.pieces && data.pieces.length ? row(t("Search the transcript"), t("Every time a word or phrase was heard"), () => { closeSheet(true); openSheet("listenSearch"); }, true) : null,
      data && data.pieces && data.pieces.length ? row(t("Export the transcript"), t("As Markdown, with the chapters and times"), () => exportTranscript(a), true) : null,
      data && data.pieces && data.pieces.length ? row(t("Write the transcript again"), t("From the start, with the model picked in Settings › Audiobooks"), async () => {
        if (!confirm(t("Write the transcript again from the start? Your fixes stay."))) return;
        await C.platform.audio.stopTranscribing();
        data.pieces = []; data.ranges = []; data.sync = null; data.syncKey = "";
        await C.store.writeListen(a.id, data);
        lis.sync = null;
        if (modeOf(a) === "transcript") await reshow();
        closeSheet();
        lis.held = false;
        writeAhead();
      }, true) : null];
    const findRows = () => [
      row(book ? t("Another book in Discover") : t("Find it in Discover"), t("Searches Discover's book sites for “{title}”", { title: a.title }), () => { closeSheet(true); openSheet("listenFind"); }, true),
      row(book ? t("Another book in your Library") : t("Pick it from your Library"), t("An EPUB or other book you already have"), () => { closeSheet(true); openSheet("listenBook"); }, true)];
    box.replaceChildren(el("div", { class: "group" }, pick,
      ...(view === "transcript" ? transcriptRows() : view === "book" ? [...findRows(), ...(mode === "book" ? transcriptRows() : [])] : [])));
  };
  draw();
  return [head, box];
}

function listenSleepSheet() {
  const a = playerBook();
  if (!a) return el("div");
  const ch = chaptersOf(a);
  const t = lis.key === a.id ? lis.t : placeOf(a);
  const sleeps = [["", i18n.t("Off")], ["15", "15 min"], ["30", "30 min"], ["60", "1 hour"], ["chapter", i18n.t("End of chapter")]];
  const setSleep = (v) => {
    let at = 0;
    if (v === "chapter") { const next = ch[L.chapterAt(ch, t) + 1]; at = Date.now() + Math.max(10, ((next ? next.t : durOf(a)) - t) / speedOf(a)) * 1000; }
    else if (v) at = Date.now() + Number(v) * 60000;
    lis.sleepAt = at;
    A.sleep(at);
    closeSheet();
    paintListen();
  };
  return el("div", { class: "page-controls listen-sheet" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title" }, i18n.t("Sleep timer")),
      el("p", { class: "meta" }, lis.sleepAt ? i18n.t("Stops in {x} min", { x: Math.max(1, Math.round((lis.sleepAt - Date.now()) / 60000)) }) : i18n.t("Off"))),
    el("div", { class: "listen-sleeps", role: "group", "aria-label": i18n.t("Sleep timer") }, ...sleeps.map(([v, label]) =>
      el("button", { class: "chip" + ((v === "" && !lis.sleepAt) ? " on" : ""), type: "button", onclick: () => setSleep(v) }, label))));
}

// A chapter's transcript, in a few words: written, being written, or not.
function chapterState(a, data, i) {
  const ch = chaptersOf(a);
  const from = ch.length ? ch[i].t : 0, to = ch[i + 1] ? ch[i + 1].t : durOf(a);
  if (lis.job && lis.job.id === a.id && lis.job.from >= from - 0.5 && lis.job.from < to) return { now: true, text: t("Writing now") };
  const f = L.covered(data && data.ranges, from, to);
  return f >= 0.98 ? { done: true, text: t("Written") } : f > 0.01 ? { text: t("{pct}% written", { pct: Math.floor(f * 100) }) } : { text: t("Not written yet") };
}
function transcriptLine(a, data) {
  const ch = chaptersOf(a);
  const n = ch.length > 1 ? ch.length : 1;
  let done = 0;
  for (let i = 0; i < n; i++) if (chapterState(a, data, i).done) done++;
  const f = Math.round(L.covered(data && data.ranges, 0, durOf(a)) * 100);
  return (n > 1 ? t("Transcript: {done} of {n} chapters written", { done, n }) : t("Transcript: {pct}% written", { pct: f })) + (lis.note ? ". " + lis.note : "");
}

// The chapters, from the top left like a collection's clips.
function listenChaptersSheet() {
  const a = playerBook();
  if (!a) return el("div");
  const ch = chaptersOf(a);
  const t = lis.key === a.id ? lis.t : placeOf(a);
  const now = L.chapterAt(ch, t);
  const rows = ch.map((c, i) => {
    const next = ch[i + 1] ? ch[i + 1].t : durOf(a);
    const b = el("button", { class: "row contents-row folder-row", type: "button", onclick: () => { closeSheet(); playFrom(a, c.t + 0.01); } },
      el("span", { class: "folder-n", "aria-hidden": "true" }, String(i + 1)),
      el("span", { class: "choice-text" },
        el("span", { class: "row-label", dir: "auto" }, c.title || i18n.t("Chapter {i}", { i: i + 1 })),
        el("span", { class: "choice-note", "data-ch": String(i) }, L.timeText(c.t) + " · " + L.lengthText(next - c.t)),
        wantsWords(a) && A.canTranscribe ? el("span", { class: "listen-ch-tr" },
          el("span", null, i18n.t("Transcript")),
          el("span", { class: "listen-ch-bar", "aria-hidden": "true" }, el("span", { class: "listen-ch-fill" })),
          el("span", { class: "listen-ch-pc" })) : null));
    if (i === now) b.setAttribute("aria-current", "true");
    return el("li", null, b);
  });
  const nav = el("nav", { class: "contents", "aria-label": a.title },
    el("p", { class: "menu-title", dir: "auto" }, a.title),
    el("p", { class: "meta" }, [i18n.t("Audiobook"), L.lengthText(durOf(a)), i18n.tn(ch.length, "1 chapter", "{n} chapters"), a.audio.folder ? i18n.tn(a.audio.parts.length, "1 file", "{n} files") : ""].filter(Boolean).join(" · ")),
    ch.length > 1 ? el("ol", { class: "group contents-list" }, ...rows) : null,
    ...bookmarkRows(a));
  requestAnimationFrame(() => centreIn(nav.querySelector("[aria-current]")));
  // Each chapter's transcript, kept up while the sheet is open.
  if (wantsWords(a) && A.canTranscribe) {
    const head = el("p", { class: "meta" });
    nav.querySelector(".meta").after(head);
    let timer = 0;
    const fill = async () => {
      clearTimeout(timer);
      if (!nav.isConnected && nav.dataset.drawn) return;
      nav.dataset.drawn = "1";
      const data = await loadListenData(a);
      head.textContent = transcriptLine(a, data);
      nav.querySelectorAll("[data-ch]").forEach((n) => {
        const i = Number(n.dataset.ch), c = ch[i], next = ch[i + 1] ? ch[i + 1].t : durOf(a), st = chapterState(a, data, i);
        n.textContent = L.timeText(c.t) + " · " + L.lengthText(next - c.t) + (st.now ? " · " + st.text : "");
        n.classList.toggle("accent", !!st.now);
        // Labelled, so it doesn't read as how far you've listened.
        const tr = n.closest(".row").querySelector(".listen-ch-tr");
        if (tr) {
          const f = Math.min(1, L.covered(data.ranges, c.t, next));
          tr.classList.toggle("now", !!st.now);
          tr.querySelector(".listen-ch-fill").style.width = f * 100 + "%";
          tr.querySelector(".listen-ch-pc").textContent = (st.done ? 100 : Math.floor(f * 100)) + "%";
        }
      });
      timer = setTimeout(fill, 2000);
    };
    fill();
  }
  return nav;
}

// A book in the library to read along with, the likeliest first.
function listenBookSheet() {
  const a = audioFor(state.open);
  if (!a) return el("div");
  const words = new Set(L.norm(a.title).length ? a.title.split(/\s+/).map(L.norm).filter((w) => w.length > 2) : []);
  const score = (p) => p.title.split(/\s+/).map(L.norm).filter((w) => words.has(w)).length;
  const books = state.pages.filter((p) => !isAudiobook(p) && !p.comic && !p.preview && (p.file || (p.minutes || 0) >= 20))
    .map((p) => ({ p, s: score(p) })).sort((x, y) => y.s - x.s || (y.p.readAt || y.p.savedAt || 0) - (x.p.readAt || x.p.savedAt || 0)).slice(0, 60);
  if (!books.length) return el("div", { class: "page-controls" }, el("p", { class: "meta" }, t("No books in your library yet. Find one in Discover.")));
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Read along with")), el("p", { class: "meta" }, t("A transcript is written a little ahead of you and matched to the book's words."))),
    el("div", { class: "group" }, ...books.map(({ p }) => el("button", { class: "row", type: "button", onclick: () => pairWith(a, p) },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, p.title),
        el("span", { class: "choice-note", dir: "auto" }, [p.byline, p.file ? (p.file.ext || "").toUpperCase() : siteOf(p)].filter(Boolean).join(" · ")))))));
}
async function pairWith(a, book) {
  listenMode(a, "book", book);
  closeSheet(true);
  if (!readyPack()) toast(t("Download a transcript model in Settings › Audiobooks to match the book."), t("Open"), () => openSettings(false, "audiobooks"));
  await openPage(book.id);
  writeAhead();
}

// Find the book in Discover: every book site Discover has, searched for
// the audiobook's title; the one picked is downloaded and read along with.
let finding = null, pairPending = null;
const bookTitle = (t) => String(t).replace(/\((unabridged|abridged|audiobook|audible[^)]*)\)/gi, "").replace(/\[[^\]]*\]/g, "").replace(/\s*[-:|]\s*(unabridged|audiobook).*$/i, "").replace(/\s+/g, " ").trim();
function listenFindSheet() {
  const a = audioFor(state.open);
  if (!a) return el("div");
  const q = bookTitle(a.title);
  const box = el("div", { class: "group listen-found" }, el("p", { class: "footnote" }, t("Searching…")));
  const sites = C.discover.sources.filter((s) => s.books && s.search);
  if (!finding || finding.q !== q) {
    finding = { q, items: null, error: "" };
    const f = finding;
    if (!navigator.onLine) f.error = t("You're offline. Search when you're back online.");
    else Promise.all(sites.map((s) => s.search(q).then((list) => list.map((x) => ({ ...x, from: s.label }))).catch(() => []))).then((lists) => {
      const by = L.norm((a.byline || "").split(/[ ,]/).pop() || "");
      f.items = lists.flat().sort((x, y) => (by && L.norm(y.by || "").includes(by) ? 1 : 0) - (by && L.norm(x.by || "").includes(by) ? 1 : 0)).slice(0, 30);
      if (state.sheet === "listenFind") $("readingBody").replaceChildren(listenFindSheet());
    });
  }
  const f = finding;
  if (f.error) fill(box, el("p", { class: "footnote" }, f.error));
  else if (f.items && !f.items.length) fill(box, el("p", { class: "footnote" }, t("None of Discover's book sites ({join}) has “{q}”. Add the book as a file, then pick it under A book in your Library.", { join: sites.map((s) => s.label).join(", "), q: q })));
  else if (f.items) fill(box, ...f.items.map((s) => el("button", { class: "row", type: "button", onclick: () => findPicked(a, s) },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, s.title),
      el("span", { class: "choice-note", dir: "auto" }, [s.by, s.from].filter(Boolean).join(" · "))))));
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Find the book in Discover")),
      el("p", { class: "meta" }, t("“{q}” on {join}. Pick the same edition and translation the narrator reads, if you can.", { q: q, join: i18n.join(sites.map((s) => s.label)) }))),
    box);
}
async function findPicked(a, s) {
  closeSheet(true);
  const name = dzBookName(s);
  const have = state.pages.find((p) => p.file && p.file.name === name);
  if (have) { pairWith(a, have); return; }
  if (!s.epub) { toast(t("That one has no book file to download.")); return; }
  pairPending = { audio: a.id, name, at: Date.now() };
  await saveFileLink(s.epub, name, s.url);
}
// A file just added: the book that was asked for, read along with.
function pairArrived(meta) {
  if (!pairPending || !meta || !meta.file || meta.file.name !== pairPending.name || Date.now() - pairPending.at > 10 * 60000) return;
  const a = state.pages.find((p) => p.id === pairPending.audio);
  pairPending = null;
  if (!a) return;
  listenMode(a, "book", meta);
  toast(t("Reading along with “{title}”. The transcript is written as you listen.", { title: meta.title }));
  setTimeout(writeAhead, 2000);
}

// ---- Fixing a word in a transcript ----

let fixing = null;
async function listenFix(text) {
  const a = audioFor(state.open);
  if (!a || !text.trim()) return;
  const data = await loadListenData(a);
  const words = heardWords(a, data);
  const heard = text.replace(/\s+/g, " ").trim().slice(0, 100);
  fixing = { a, heard, n: L.countHeard(words, heard) };
  hideReadHere();
  openSheet("listenFix");
}
function listenFixSheet() {
  const f = fixing;
  if (!f) return el("div");
  const input = el("input", { class: "tag-input", type: "text", value: f.heard, "aria-label": t("Written as"), autocomplete: "off", dir: "auto" });
  const save = async () => {
    const to = input.value.replace(/\s+/g, " ").trim();
    if (!to || to === f.heard) { closeSheet(); return; }
    const a = f.a;
    const list = ((a.listen && a.listen.fixes) || []).filter((x) => L.norm(x.from) !== L.norm(f.heard));
    a.listen = { ...(a.listen || {}), t: placeOf(a), tAt: Date.now(), fixes: [...list, { from: f.heard, to, at: Date.now() }] };
    closeSheet();
    await C.store.writeIndexOnly(state.pages);
    if (C.sync.on) syncSoon();
    lis.sync = null;
    if (modeOf(a) === "transcript") {
      await writeListenPage(a, await loadListenData(a));
      if (state.open === a) await show(a, await C.store.readPage(a.id));
    }
    toast(f.n > 1 ? t("Fixed {n} times, and from now on", { n: f.n }) : t("Fixed, and from now on"));
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  setTimeout(() => { if (input.isConnected) { input.focus(); input.select(); } }, 300);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Fix this word")),
      el("p", { class: "meta" }, f.n > 1 ? t("Heard as “{heard}”, {n} times in this book", { heard: f.heard, n: f.n }) : t("Heard as “{heard}”", { heard: f.heard }))),
    el("div", { class: "group" }, el("div", { class: "row" }, input)),
    el("p", { class: "footnote" }, t("Every time it's heard, now and as the transcript goes on. It syncs with the audiobook.")),
    el("div", { class: "export-actions" },
      el("button", { class: "btn-quiet", type: "button", onclick: () => closeSheet() }, t("Cancel")),
      el("button", { class: "btn-primary", type: "button", onclick: save }, f.n > 1 ? t("Fix all {n}", { n: f.n }) : t("Fix"))));
}
// The selection bar's extra for a transcript: Fix.
function listenSelection(bar, picked) {
  let b = bar.querySelector(".sel-fix");
  if (!b) {
    b = el("button", { class: "sel-fix sel-icon", type: "button", "aria-label": t("Fix"), title: t("Fix"), onclick: () => { const s = C.reader.selectionText(); if (s) listenFix(s.text); } });
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"></path></svg>';
    bar.append(b);
  }
  const p = state.open;
  b.hidden = !(picked && isAudiobook(p) && modeOf(p) === "transcript" && picked.text.trim().split(/\s+/).length <= 6);
}

// ---- Bookmarks (2026-11): a moment in the book, with a note if you like ----
// Kept in the listen field, so they sync with the place.
const bookmarksOf = (a) => ((a && a.listen && a.listen.bookmarks) || []).slice().sort((x, y) => x.t - y.t);
function playFrom(a, t) {
  if (lis.key === a.id) listenSeek(t);
  else listenPlay(a, t);
}
async function saveBookmarks(a, list) {
  a.listen = { ...(a.listen || {}), bookmarks: list };
  if (!list.length) delete a.listen.bookmarks;
  await C.store.writeIndexOnly(state.pages);
  if (C.sync.on) syncSoon();
  paintListen();
}
let marking = null;
async function listenBookmark() {
  const a = playerBook();
  if (!a) return;
  const t = Math.round((lis.key === a.id ? lis.t : placeOf(a)) * 10) / 10;
  const list = bookmarksOf(a);
  const near = list.find((m) => Math.abs(m.t - t) < 3);
  if (near) { marking = { a, id: near.id }; openSheet("listenMark"); return; }
  const m = { id: C.save.newId(), t, at: Date.now() };
  await saveBookmarks(a, [...list, m]);
  toast(i18n.t("Bookmarked at {timeText}", { timeText: L.timeText(t) }), i18n.t("Add a note"), () => { marking = { a, id: m.id }; openSheet("listenMark"); });
}
function bookmarkRows(a) {
  const marks = bookmarksOf(a);
  if (!marks.length) return [];
  return [el("h3", { class: "overline listen-marks-head" }, t("Bookmarks")),
    el("ol", { class: "group contents-list listen-marks" }, ...marks.map((m) => el("li", null,
      el("button", { class: "row", type: "button", onclick: () => { closeSheet(); playFrom(a, m.t); } },
        el("span", { class: "choice-text" },
          el("span", { class: "row-label", dir: "auto" }, m.note || L.timeText(m.t)),
          el("span", { class: "choice-note", dir: "auto" }, [m.note ? L.timeText(m.t) : "", chapterName(a, m.t)].filter(Boolean).join(" · ")))),
      el("button", { class: "icon-btn", type: "button", "aria-label": t("Edit the bookmark at {timeText}", { timeText: L.timeText(m.t) }), onclick: () => { marking = { a, id: m.id }; closeSheet(true); openSheet("listenMark"); } },
        svgIcon("rename", 18)))))];
}
function listenMarkSheet() {
  const k = marking;
  const m = k && bookmarksOf(k.a).find((x) => x.id === k.id);
  if (!m) return el("div");
  const input = el("input", { class: "tag-input", type: "text", value: m.note || "", placeholder: t("A note"), "aria-label": t("Note"), autocomplete: "off", dir: "auto", maxlength: "500" });
  const save = async () => {
    const note = input.value.replace(/\s+/g, " ").trim().slice(0, 500);
    const list = bookmarksOf(k.a).map((x) => (x.id === m.id ? { id: x.id, t: x.t, at: Date.now(), ...(note ? { note } : {}) } : x));
    closeSheet();
    await saveBookmarks(k.a, list);
  };
  const remove = async () => {
    closeSheet();
    await saveBookmarks(k.a, bookmarksOf(k.a).filter((x) => x.id !== m.id));
    toast(t("Bookmark removed"));
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  setTimeout(() => { if (input.isConnected) input.focus(); }, 300);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Bookmark at {timeText}", { timeText: L.timeText(m.t) })),
      el("p", { class: "meta", dir: "auto" }, chapterName(k.a, m.t) || k.a.title)),
    el("div", { class: "group" }, el("div", { class: "row" }, input)),
    el("div", { class: "export-actions" },
      el("button", { class: "btn-quiet", type: "button", onclick: remove }, t("Remove")),
      el("button", { class: "btn-primary", type: "button", onclick: save }, t("Save"))));
}

// ---- Search and export the transcript (2026-11) ----
// The whole transcript, not just the chapter on the page.
let heardSearch = { id: "", q: "", words: null };
function listenSearchSheet() {
  const a = audioFor(state.open);
  if (!a) return el("div");
  if (heardSearch.id !== a.id) heardSearch = { id: a.id, q: "", words: null };
  const s = heardSearch;
  const input = el("input", { class: "tag-input", type: "search", value: s.q, placeholder: t("A word or phrase"), "aria-label": t("Search the transcript"), autocomplete: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
  const meta = el("p", { class: "meta" });
  const list = el("div", { class: "group listen-hits" });
  const draw = () => {
    if (!s.words) { meta.textContent = t("Reading the transcript…"); list.replaceChildren(); return; }
    const hits = s.q.trim() ? L.findHeard(s.words, s.q) : [];
    meta.textContent = !s.q.trim() ? (s.words.length ? t("In what's written so far") : t("Nothing is written yet"))
      : hits.length ? (hits.length >= 300 ? t("The first 300 times") : hits.length === 1 ? t("Heard once") : t("Heard {n} times", { n: hits.length })) : t("Not heard in what's written so far");
    list.hidden = !hits.length;
    list.replaceChildren(...hits.map((h) => el("button", { class: "row", type: "button", onclick: () => { closeSheet(); playFrom(a, Math.max(0, h.t - 0.3)); } },
      el("span", { class: "choice-text" },
        el("span", { class: "choice-label", dir: "auto" }, (h.before ? (h.more[0] ? "…" : "") + h.before + " " : ""), el("mark", null, h.hit),
          (h.after ? " " + h.after + (h.more[1] && !/[.!?…]$/.test(h.after) ? "…" : "") : "")),
        el("span", { class: "choice-note" }, [L.timeText(h.t), chapterName(a, h.t)].filter(Boolean).join(" · "))))));
  };
  let timer = 0;
  input.addEventListener("input", () => { s.q = input.value; clearTimeout(timer); timer = setTimeout(draw, 150); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); draw(); input.blur(); } });
  if (!s.words) loadListenData(a).then((data) => { s.words = heardWords(a, data); if (list.isConnected) draw(); });
  draw();
  setTimeout(() => { if (input.isConnected) input.focus(); }, 300);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, t("Search the transcript")), meta),
    el("div", { class: "group" }, el("div", { class: "row" }, input)),
    list);
}
// Find in this clip, on an audiobook's transcript, looks through all of it.
const findsTranscript = (p) => !!p && isAudiobook(p) && modeOf(p) === "transcript";

async function exportTranscript(a) {
  closeSheet();
  const data = await loadListenData(a);
  const words = heardWords(a, data);
  if (!words.length) { toast(t("Nothing is written yet.")); return; }
  const parts = L.paragraphs(words, { chapters: chaptersOf(a), pauses: listenPrefs().pauses, ranges: data.ranges || [] });
  const text = L.transcriptMarkdown(a.title, a.byline, parts);
  const name = (a.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || t("Audiobook")) + " " + t("transcript") + ".md";
  try {
    const uri = await C.platform.writeCache(name, text);
    if (!uri) C.platform.download(name, new Blob([text], { type: "text/markdown" }));
    else {
      const saved = await C.platform.saveFile(uri, name, "text/markdown");
      if (saved === null) await C.platform.shareFile(uri, name);
      else if (saved) toast(t("Saved {name}", { name: name }));
    }
  } catch (e) {
    console.error(e);
    toast(t("Couldn't make the file. Try again."));
  }
}

SHEETS.listenSleep = { button: "listenSleep", label: t("Sleep timer"), build: listenSleepSheet };
SHEETS.listenMark = { button: "listenMark", label: t("Bookmark"), build: listenMarkSheet };
SHEETS.listenSearch = { button: "readerMore", label: t("Search the transcript"), build: listenSearchSheet };
SHEETS.listenChapters = { button: "readerChapters", label: t("Chapters"), build: listenChaptersSheet };
SHEETS.listenBook = { button: "readerMore", label: t("A book to read along with"), build: listenBookSheet };
SHEETS.listenFind = { button: "readerMore", label: t("Find the book in Discover"), build: listenFindSheet };
SHEETS.listenFix = { label: t("Fix a word"), build: listenFixSheet };

// ---- An EPUB's own narration ----
// Looked for once in a book read from where it is (a copy keeps no
// sound), the first time it opens.
async function lookForNarration(p) {
  if (!p || !p.link || !p.file || p.file.kind !== "epub" || p.narration != null || isAudiobook(p)) return;
  let found = null;
  try { found = await L.overlays(await C.platform.files.blob(p.link, p.file.size)); } catch (e) { found = null; }
  p.narration = !!found;
  if (found) {
    const dur = found.parts.reduce((s, x) => s + x.dur, 0);
    p.audio = { parts: found.parts.map((x) => ({ name: x.name, offset: x.offset, length: x.length, stored: x.stored, dur: x.dur })), pars: found.pars, chapters: [], dur, overlay: true };
    p.listen = { ...(p.listen || {}), t: (p.listen && p.listen.t) || 0, tAt: (p.listen && p.listen.tAt) || 0, dur: Math.round(dur), mode: "book" };
  }
  await C.store.writeIndexOnly(state.pages);
  if (found && state.open === p) { paintListen(); toast(t("This book has its own narration. Press play to read along."), t("Play"), () => listenPlay(p)); }
}

// ---- The card and the library ----

// An audiobook's line on its card: what's left to hear.
// Finished is the sound's end, not the transcript's.
function listenLine(p) {
  const t = placeOf(p), d = durOf(p);
  if (d && t >= d - 5) return i18n.t("Finished");
  const left = t > 30 && d ? i18n.t("{time} left", { time: L.lengthText(d - t) }) : L.lengthText(d);
  const how = modeOf(p) === "book" && bookOf(p) ? i18n.t("Read along") : modeOf(p) === "transcript" ? i18n.t("Transcript") : "";
  return [left, how].filter(Boolean).join(" · ");
}
const listenDone = (p) => (durOf(p) ? Math.min(1, placeOf(p) / durOf(p)) : 0);
// The headphones on an audiobook's cover.
function listenBadge(p, thumb) {
  if (!isAudiobook(p) || p.audio.overlay) return thumb;
  const mark = el("span", { class: "listen-badge", "aria-hidden": "true" });
  mark.innerHTML = ICON_HEAD;
  if (thumb.tagName !== "IMG") { thumb.classList.add("has-listen"); thumb.append(mark); return thumb; }
  const box = el("span", { class: thumb.className + " has-listen", "aria-hidden": "true" }, thumb, mark);
  thumb.className = "";
  return box;
}

// ---- Settings › Audiobooks ----

// Listening: Narrate's settings, as they apply to an audiobook.
function listeningGroup(title = t("Listening")) {
  const prefs = listenPrefs();
  const volRow = A.native ? volumeRow(prefs.volume, (v) => setListenPref("volume", v)) : null;
  if (volRow) volRow.hidden = !prefs.mix;
  const secs = (list) => list.map((v) => ({ value: String(v), label: t("{v} seconds", { v: v }) }));
  return section(title, null, el("div", { class: "group" },
    pickRow({ label: t("Back"), options: secs([5, 10, 15, 30, 60]), get: () => String(listenPrefs().back), set: (v) => { setListenPref("back", Number(v)); paintListen(); } }),
    pickRow({ label: t("Forward"), options: secs([10, 15, 30, 45, 60]), get: () => String(listenPrefs().on), set: (v) => { setListenPref("on", Number(v)); paintListen(); } }),
    switchRow(t("Back a little after a pause"), t("3 seconds, or 10 after a long one, so you pick up the sentence"), prefs.rewind, (on) => setListenPref("rewind", on)),
    switchRow(t("Keep the screen on"), t("While it plays, so you can read along"), prefs.awake, (on) => { setListenPref("awake", on); speech.keepScreen(on && lis.state === "playing"); }),
    switchRow(t("Keep playing when you leave the book"), t("Off: it stops when you go back or open another clip"), prefs.keep, (on) => setListenPref("keep", on)),
    A.native ? switchRow(t("Allow mixing"), t("Music or a podcast in another app keeps playing under the book. Off: they pause while it plays"), prefs.mix, (on) => { setListenPref("mix", on); volRow.hidden = !on; }) : null,
    volRow,
    A.native ? switchRow(t("Small window outside the app"), t("Going home, the book stays in a window you can move, with back, play and forward"), prefs.pip, (on) => setListenPref("pip", on)) : null));
}
// The reader sheet's tab for an audiobook, in Narrate's place.
function listenSheetPart() {
  const part = el("div", null, el("h2", { class: "overline" }, t("Audiobook")), listeningGroup(null));
  if (A.canTranscribe) {
    const pack = readyPack();
    part.append(el("div", { class: "group" }, el("button", { class: "row", type: "button", onclick: () => { closeSheet(true); openSettings(false, "audiobooks"); } },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, t("Transcripts")), el("span", { class: "choice-note" }, pack ? t("{title} · in Settings › Audiobooks", { title: pack.title }) : t("Download a model in Settings › Audiobooks"))))));
  }
  return part;
}
function audiobookSections() {
  const adding = el("p", { class: "footnote" }, t("Add an M4B or MP3 with Add a file{x}. It's played from where it is, and shows under Files.", { x: C.platform.files.canPickFolder ? t(", or a folder of them with Add an audiobook folder") : "" }));
  if (!A.canTranscribe) return [listeningGroup(), adding, el("p", { class: "footnote" }, t("Reading along with a book or a transcript is in the Android app."))];
  const slot = el("div", { class: "kokoro-slot" }, el("p", { class: "footnote" }, t("Looking…")));
  fillTranscripts(slot);
  return [listeningGroup(), slot, adding];
}
async function fillTranscripts(slot) {
  const s = await listenModels();
  if (!slot.isConnected && slot.dataset.drawn) return;
  slot.dataset.drawn = "1";
  if (!s || !s.supported) { slot.replaceChildren(el("p", { class: "footnote" }, t("Transcripts need an Android phone with a 64-bit processor."))); return; }
  const busy = s.step === "downloading" || s.step === "checking" || s.step === "unpacking";
  const again = () => fillTranscripts(slot);
  const act = (fn) => async () => { try { await fn(); } catch (e) { toast((e && e.message) || t("Couldn't do that. Try again.")); } again(); };
  const using = readyPack();
  const rows = (s.packs || []).map((p) => {
    const mine = s.busy === p.id;
    const note = mine && s.step === "downloading" ? t("Downloading · {pct}%", { pct: s.total ? Math.min(99, Math.floor(s.done / s.total * 100)) : 0 })
      : mine && busy ? t("Unpacking…")
      : mine && s.step === "bad" ? t("The download wasn't the right file. Try again.")
      : mine && s.step === "failed" ? t("Couldn't download. Try again on Wi-Fi.")
      : p.note + " · " + formatSize(p.ready ? p.size : p.bytes);
    const control = mine && s.step === "downloading" ? el("button", { class: "btn-text", type: "button", onclick: act(() => A.cancel()) }, t("Stop"))
      : mine && busy ? null
      : p.ready ? el("button", { class: "row-x kokoro-delete", type: "button", "aria-label": t("Delete {title}", { title: p.title }), title: t("Delete"), disabled: busy || s.working || null,
        onclick: () => { if (confirm(t("Delete {title}? It takes {formatSize}; you can download it again.", { title: p.title, formatSize: formatSize(p.size) }))) act(() => A.remove(p.id))(); } },
        el("span", { class: "visually-hidden" }, t("Delete")), svgBin())
      : el("button", { class: "btn-text", type: "button", disabled: busy || null, onclick: act(() => A.download(p.id)) }, t("Download"));
    const radio = p.ready ? el("input", { type: "radio", name: "listen-pack", class: "listen-pack", checked: using && using.id === p.id, "aria-label": t("Use {title}", { title: p.title }),
      onchange: () => { setListenPref("pack", p.id); toast(t("{title} writes from now on. Write the transcript again, in the audiobook's ⋯, to redo what's written.", { title: p.title })); } }) : null;
    return el("label", { class: "row kokoro-row" }, radio,
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, p.title), el("span", { class: "choice-note" }, note)), control);
  });
  const prefs = listenPrefs();
  slot.replaceChildren(
    section(t("Transcripts"), t("Each one is a download, made on Wi-Fi. Fast writes well ahead and is easy on the battery. Better has punctuation and capitals and knows 25 European languages. Most languages is the slowest and needs a recent phone."), el("div", { class: "group" }, ...rows)),
    section(t("Make it better"), null, el("div", { class: "group" },
      switchRow(t("Write ahead while charging"), t("The rest of the book gets written while the phone charges"), prefs.charging, (on) => { setListenPref("charging", on); if (on) { lis.held = false; writeAhead(); } }),
      switchRow(t("Paragraphs from pauses"), t("A long pause from the narrator starts a new paragraph"), prefs.pauses, (on) => setListenPref("pauses", on)),
      switchRow(t("Chapters from the file"), t("The audiobook's own chapter names as headings"), prefs.chapters, (on) => setListenPref("chapters", on)))),
    el("p", { class: "footnote" }, t("Transcripts stay on this phone, written while you listen and never when the battery is low or the phone is hot. To fix a word heard wrong, select it in the transcript and tap the pen: it's fixed everywhere it's heard, and the fix syncs.")));
  if (busy) setTimeout(() => { if (slot.isConnected) again(); }, 1000);
}
SECTIONS.audiobooks = { title: t("Audiobooks"), build: audiobookSections, value: () => (readyPack() || {}).title || "" };
