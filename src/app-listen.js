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
const listenPrefs = () => ({ pack: "", pauses: true, chapters: true, charging: true, back: 15, on: 30, rewind: true, awake: false, mix: false, pip: true, ...(load(LISTEN_KEY, {}) || {}) });
const setListenPref = (k, v) => { store(LISTEN_KEY, { ...listenPrefs(), [k]: v }); if (["mix", "back", "on"].includes(k)) listenOptions(); if (k === "pip") listenFloat(); };
const listenOptions = () => { const p = listenPrefs(); C.platform.audio.options({ mix: p.mix, back: p.back, on: p.on }); };
const SPEEDS = [0.8, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2, 2.5, 3];
const AHEAD = 10 * 60, CHUNK = 3 * 60;

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
  if (!ref) { toast("Waypage plays an audiobook from where it is, so it needs lasting access. Open it with Open a file."); return; }
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const kind = L.sniff(head, file.name) || "mp3";
  const dup = state.pages.find((p) => isAudiobook(p) && p.file && p.file.name === file.name && p.file.size === file.size);
  if (dup) { C.platform.files.release(ref); toast("Already in your library"); openPage(dup.id); return; }
  toast("Adding “" + L.baseName(file.name) + "”…");
  const part = { ref, name: file.name.slice(0, 200), size: file.size, dur: 0 };
  const [{ dur, got }, tags, fp] = await Promise.all([partLength(part, file), L.tags(file, kind), C.files.fingerprint(file)]);
  part.dur = dur;
  if (!dur) { toast("Waypage can't play this file."); C.platform.files.release(ref); return; }
  const cover = (got && got.cover && b64bytes(got.cover)) || tags.cover || null;
  const meta = await newAudiobook({
    title: (got && (got.album || got.title)) || tags.title || L.baseName(file.name), byline: (got && got.artist) || tags.artist || "",
    file: { name: file.name.slice(0, 200), kind: "audio", ext: kind, size: file.size, ...(fp ? { fp } : {}) }, link: ref,
    audio: { parts: [part], chapters: tags.chapters.filter((c) => c.t < dur), dur },
  }, cover);
  arrived(meta);
}

// A folder of sound files, one book (Android): in name order, each a
// chapter unless a file has chapters of its own.
async function addAudiobookFolder() {
  let got = null;
  try { got = await C.platform.files.pickFolder(); } catch (e) { got = null; }
  if (!got) return;
  const scan = await C.platform.files.scan(got.ref);
  const files = L.inOrder(scan.files || []);
  if (!scan.ok || !files.length) { toast("There are no sound files in " + got.name + "."); C.platform.files.release(got.ref); return; }
  if (state.pages.some((p) => isAudiobook(p) && p.link === got.ref)) { toast("Already in your library"); return; }
  toast("Adding “" + (scan.name || got.name) + "”, " + files.length + " files…");
  const parts = [], chapters = [];
  let title = "", artist = "", cover = null, at = 0;
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
        if (!title && t.title) title = t.title;
        if (!artist && t.artist) artist = t.artist;
      } catch (e) { /* the name will do */ }
    }
    if (g) { if (!title && g.album) title = g.album; if (!artist && g.artist) artist = g.artist; if (!cover && g.cover) cover = b64bytes(g.cover); }
    if (own.length > 1) own.forEach((c) => chapters.push({ t: at + c.t, title: c.title }));
    else chapters.push({ t: at, title: (g && g.title) || L.baseName(f.name) });
    parts.push(part);
    at += dur;
  }
  if (!parts.length) { toast("Waypage can't play the files in " + got.name + "."); C.platform.files.release(got.ref); return; }
  const fp = await sha(parts.map((p) => p.name + ":" + p.size).join("|"));
  const size = parts.reduce((s, p) => s + p.size, 0);
  const meta = await newAudiobook({
    title: title || scan.name || got.name, byline: artist,
    file: { name: (scan.name || got.name).slice(0, 200), kind: "audio", ext: L.extOf(parts[0].name) || "mp3", size, fp }, link: got.ref,
    audio: { parts, chapters, dur: at, folder: true },
  }, cover);
  arrived(meta);
}

// The library entry and its page: the chapters until there are words.
async function newAudiobook(o, cover) {
  const id = C.save.newId();
  const meta = {
    id, url: "", title: String(o.title).replace(/\s+/g, " ").trim().slice(0, 300) || "Audiobook", site: "Audiobook", byline: String(o.byline || "").slice(0, 200), licence: null,
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
  toast("Added “" + meta.title + "”");
  await openPage(meta.id);
  if (state.open === meta) openSheet("page");
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
async function writeListenPage(a, data) {
  const out = document.implementation.createHTMLDocument("");
  const prefs = listenPrefs();
  const all = heardWords(a, data);
  const ci = chapterNow(a, placeNow(a));
  pageCh[a.id] = ci;
  const words = inChapter(a, all, ci);
  const chapters = !prefs.chapters ? [] : ci < 0 ? chaptersOf(a) : [chaptersOf(a)[ci]];
  const root = words.length ? L.transcriptBody(out, L.paragraphs(words, { chapters, pauses: prefs.pauses, ranges: (data && data.ranges) || [] })) : out.createElement("div");
  root.className = "co-body";
  const html = C.save.savedPageHtml(a, root, out);
  const text = C.save.plainText(root);
  a.bytes = (await C.store.writePage(a.id, html, a)) + C.store.bytesOf(text);
  if (all.length) a.minutes = Math.max(1, Math.round(durOf(a) / 60));
  await C.store.writeText(a.id, text);
  return html;
}

// ---- Playing ----

async function partsToPlay(a) {
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
  return i >= 0 ? ch[i].title || "Chapter " + (i + 1) : "";
}

async function listenPlay(a, at) {
  if (!a) return;
  if (aloudOn()) stopAloud();
  if (a.audio.overlay && a.audio.parts.some((p) => !p.stored)) { toast("This book's narration is packed in a way Waypage can't play yet."); return; }
  const t = Math.max(0, Math.min(at != null ? at : placeOf(a) >= durOf(a) - 2 ? 0 : placeOf(a), Math.max(0, durOf(a) - 1)));
  const { part, pos } = L.partAt(a.audio.parts, t);
  if (lis.key && lis.key !== a.id) saveListenPlace(true);
  Object.assign(lis, { key: a.id, state: "loading", part, t, said: -1 });
  a.readAt = Date.now();
  paintListen();
  try {
    await A.play({ parts: await partsToPlay(a), part, pos: pos * 1000, rate: speedOf(a), title: a.title, subtitle: chapterName(a, t) || a.byline || "", key: a.id });
  } catch (e) {
    lis.state = "stopped";
    paintListen();
    toast("Couldn't play it. If the file moved, add it again.");
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
  return { title: a.title, over: chapterName(a, lis.t) || "Audiobook", text, paused: lis.state === "paused" };
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
  if (audioWordless(open)) for (const id of ["readerMarks", "readerTranslate", "readerInk"]) $(id).hidden = true;
  const show = !!here;
  if (here && !here.audio.overlay && modeOf(here) === "transcript" && state.open === here && chapterNow(here, placeNow(here)) !== pageCh[here.id]) turnPage(here);
  $("readerChapters").hidden = !here || chaptersOf(playerBook()).length < 2;
  const box = $("listenPlayer");
  const was = box.hidden;
  box.hidden = !show;
  $("readerView").classList.toggle("listening", show);
  if (show) {
    const b = a && mine ? a : here;
    const t = a && mine ? lis.t : placeOf(b);
    const ch = chaptersOf(b), ci = L.chapterAt(ch, t);
    const from = ci >= 0 ? ch[ci].t : 0, to = ci >= 0 && ch[ci + 1] ? ch[ci + 1].t : durOf(b);
    $("listenChapName").textContent = ci >= 0 ? (ch[ci].title || "Chapter " + (ci + 1)) + (ch.length > 1 ? " · " + (ci + 1) + " of " + ch.length : "") : b.title;
    $("listenNote").textContent = lis.note || listenNoteFor(b);
    const f = to > from ? Math.min(1, Math.max(0, (t - from) / (to - from))) : 0;
    $("listenFill").style.transform = "scaleX(" + f + ")";
    $("listenKnob").style.insetInlineStart = f * 100 + "%";
    $("listenTrack").setAttribute("aria-valuenow", String(Math.round(f * 100)));
    $("listenAt").textContent = L.timeText(t - from);
    $("listenLeft").textContent = "−" + L.timeText(Math.max(0, to - t));
    $("listenSpeed").textContent = (Math.round(speedOf(b) * 100) / 100) + "×";
    const { back, on } = listenPrefs();
    $("listenBack").lastChild.textContent = String(back);
    $("listenBack").setAttribute("aria-label", "Back " + back + " seconds");
    $("listenOn").lastChild.textContent = String(on);
    $("listenOn").setAttribute("aria-label", "Forward " + on + " seconds");
    const playing = !!(a && mine && lis.state === "playing");
    $("listenPlay").classList.toggle("paused", !playing);
    $("listenPlay").setAttribute("aria-label", playing ? "Pause" : "Play");
    $("listenSleep").classList.toggle("on", !!lis.sleepAt);
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
    $("listenBarNote").textContent = [chapterName(a, lis.t), L.timeText(Math.max(0, durOf(a) - lis.t)) + " left"].filter(Boolean).join(" · ");
    $("listenBarPlay").classList.toggle("paused", lis.state !== "playing");
    $("listenBarPlay").setAttribute("aria-label", lis.state === "playing" ? "Pause" : "Play");
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
function listenNoteFor(a) {
  const m = modeOf(a);
  if (a.audio.overlay) return "Read along with the book's own narration";
  if (m === "listen") return "Tap ⋯ to read along";
  if (!A.canTranscribe) return "Read along needs the Android app";
  if (lis.job && lis.job.id === a.id) return "Writing the transcript…";
  const data = lis.dataFor === a.id ? lis.data : null;
  const upto = data && data.ranges && data.ranges.length ? writtenTo(data, lis.t) : 0;
  if (m === "book" && !bookOf(a)) return "The book isn't in your library";
  if (!readyPack()) return "Download a transcript model in Settings";
  return upto > lis.t + 5 ? "Written to " + L.timeText(upto) + (m === "book" ? ", matched to the book" : "") : lis.writing ? "Writing the transcript…" : "";
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
  $("listenChap").addEventListener("click", () => (chaptersOf(playerBook()).length > 1 ? toggleSheet("listenChapters") : toggleSheet("page")));
  $("readerChapters").addEventListener("click", () => toggleSheet("listenChapters"));
  $("listenBarPlay").addEventListener("click", listenToggle);
  $("listenBarBack").addEventListener("click", () => listenSkip(-listenPrefs().back));
  $("listenBarStop").addEventListener("click", listenStop);
  $("listenBarOpen").addEventListener("click", () => { const a = listenPage(); if (a) openPage(shownFor(a).id); });
  // Dragging along the track moves within the chapter.
  const track = $("listenTrack");
  const seekTo = (x) => {
    const a = playerBook();
    if (!a) return;
    const r = track.getBoundingClientRect();
    let f = Math.min(1, Math.max(0, (x - r.left) / r.width));
    if (getComputedStyle(track).direction === "rtl") f = 1 - f;
    const ch = chaptersOf(a), t = lis.key === a.id ? lis.t : placeOf(a), ci = L.chapterAt(ch, t);
    const from = ci >= 0 ? ch[ci].t : 0, to = ci >= 0 && ch[ci + 1] ? ch[ci + 1].t : durOf(a);
    const at = from + f * (to - from);
    if (lis.key === a.id) listenSeek(at); else listenPlay(a, at);
  };
  track.addEventListener("pointerdown", (e) => { track.setPointerCapture(e.pointerId); seekTo(e.clientX); });
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
  lis.said = -1;
  lis.sync = null; lis.syncFor = "";
  const a = audioFor(p);
  if (a) loadListenData(a).then(() => { if (state.open === p) { readAlong(true); paintListen(); } });
  paintListen();
}
function listenClosed() {
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
        toast("The audiobook doesn't seem to match this book's words. Check it's the same book and language.");
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
  if (t == null) { toast(modeOf(a) === "listen" ? "Pick a way to read along first, in ⋯." : "That part hasn't been heard yet. It plays from here once the transcript reaches it."); return true; }
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
  if (lis.writing || !A.canTranscribe) return;
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
      if (whole) toast("The transcript of “" + whole.title + "” is all written.");
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
  lis.job = { id: a.id, from, to };
  paintListen();
  try {
    const res = await A.transcribe({ uri: a.audio.overlay ? a.link : p.ref, from: Math.round(pos * 1000), to: Math.round((pos + (to - from)) * 1000), pack: pack.id, lang: (a.lang || "").split("-")[0] });
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
    lis.note = why === "battery" ? "Transcript waits: the battery is low" : why === "hot" ? "Transcript waits: the phone is hot" : why === "model" ? "Download a transcript model in Settings" : "";
    if (why !== "stopped" && why !== "model") aheadTimer = setTimeout(writeAhead, why === "busy" ? 5000 : 60000);
  } finally {
    lis.writing = false;
    lis.job = null;
    paintListen();
  }
}
// While charging, with nothing playing, the rest gets written.
addEventListener("online", () => setTimeout(writeAhead, 5000));
setTimeout(() => { if (A.canTranscribe) listenModels().then(() => writeAhead()); }, 15000);
setInterval(() => { if (A.canTranscribe && !lis.writing && lis.state !== "playing") listenModels().then(() => writeAhead()); }, 5 * 60 * 1000);

// Write the rest now: every part of the book not written yet, from the
// start, until it's all there (or Stop).
function writeRest(a, on) {
  lis.wholeFor = on ? a.id : "";
  if (on) { if (!readyPack()) { toast("Download a transcript model in Settings › Audiobooks first.", "Open", () => openSettings(false, "audiobooks")); lis.wholeFor = ""; return; } writeAhead(); }
  else if (lis.job && lis.job.id === a.id && lis.key !== a.id) C.platform.audio.stopTranscribing();
}
function writeRestButton(a, after) {
  const on = lis.wholeFor === a.id;
  return el("button", { class: "row", type: "button", onclick: () => { writeRest(a, !on); if (after) after(); } },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, on ? "Stop writing the rest" : "Write the rest now"),
      el("span", { class: "choice-note" }, on ? "Back to writing a little ahead of where you are" : "Every part not written yet, from the start, while the app is open")));
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
  const mode = modeOf(a);
  const close = () => closeSheet();
  const pick = (label, note, on, act, disabled) => el("button", { class: "row", type: "button", "aria-pressed": String(!!on), disabled: disabled ? "" : null, onclick: act },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label" + (on ? " accent" : "") }, label), note ? el("span", { class: "choice-note" }, note) : null),
    on ? el("span", { class: "row-value accent" }, "✓") : null);
  const canWords = A.canTranscribe;
  const head = el("h3", { class: "overline" }, "Read along with");
  if (!canWords) return [head, el("p", { class: "meta" }, "Reading along with a book or a transcript is in the Android app, which writes the transcript on the phone.")];
  const book = bookOf(a);
  const data = lis.dataFor === a.id ? lis.data : null;
  return [head, el("div", { class: "group" },
    pick("Find the book in Discover", "Searches Discover's book sites for “" + a.title + "”.", false, () => { closeSheet(true); openSheet("listenFind"); }),
    pick(book && mode === "book" ? "The book: " + book.title : "A book in your Library", "An EPUB or other book you already have.", mode === "book", () => { closeSheet(true); openSheet("listenBook"); }),
    pick("A transcript", "Written on this phone from the sound, a little ahead of where you are.", mode === "transcript", async () => {
      listenMode(a, "transcript");
      close();
      await writeListenPage(a, await loadListenData(a));
      if (state.open && state.open !== a) openPage(a.id);
      else if (state.open === a) show(a, await C.store.readPage(a.id));
      if (!readyPack()) toast("Download a transcript model in Settings › Audiobooks.", "Open", () => openSettings(false, "audiobooks"));
      writeAhead();
    }),
    pick("Just listen", "The chapters, and no words.", mode === "listen", async () => {
      listenMode(a, "listen");
      close();
      await writeListenPage(a, null);
      if (state.open !== a) openPage(a.id); else show(a, await C.store.readPage(a.id));
    }),
    data && data.pieces && data.pieces.length ? el("button", { class: "row", type: "button", onclick: async () => {
      if (!confirm("Write the transcript again from the start? Your fixes stay.")) return;
      await C.platform.audio.stopTranscribing();
      data.pieces = []; data.ranges = []; data.sync = null; data.syncKey = "";
      await C.store.writeListen(a.id, data);
      lis.sync = null;
      if (modeOf(a) === "transcript") { await writeListenPage(a, data); if (state.open === a) show(a, await C.store.readPage(a.id)); }
      close();
      writeAhead();
    } }, el("span", { class: "choice-text" }, el("span", { class: "choice-label accent" }, "Write the transcript again"),
      el("span", { class: "choice-note" }, "With the model picked in Settings › Audiobooks, from where you are."))) : null,
    mode !== "listen" ? writeRestButton(a, close) : null)];
}

function listenSleepSheet() {
  const a = playerBook();
  if (!a) return el("div");
  const ch = chaptersOf(a);
  const t = lis.key === a.id ? lis.t : placeOf(a);
  const sleeps = [["", "Off"], ["15", "15 min"], ["30", "30 min"], ["60", "1 hour"], ["chapter", "End of chapter"]];
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
      el("p", { class: "menu-title" }, "Sleep timer"),
      el("p", { class: "meta" }, lis.sleepAt ? "Stops in " + Math.max(1, Math.round((lis.sleepAt - Date.now()) / 60000)) + " min" : "Off")),
    el("div", { class: "listen-sleeps", role: "group", "aria-label": "Sleep timer" }, ...sleeps.map(([v, label]) =>
      el("button", { class: "chip" + ((v === "" && !lis.sleepAt) ? " on" : ""), type: "button", onclick: () => setSleep(v) }, label))));
}

// A chapter's transcript, in a few words: written, being written, or not.
function chapterState(a, data, i) {
  const ch = chaptersOf(a);
  const from = ch.length ? ch[i].t : 0, to = ch[i + 1] ? ch[i + 1].t : durOf(a);
  if (lis.job && lis.job.id === a.id && lis.job.from >= from - 0.5 && lis.job.from < to) return { now: true, text: "Writing now" };
  const f = L.covered(data && data.ranges, from, to);
  return f >= 0.98 ? { done: true, text: "Written" } : f > 0.01 ? { text: Math.floor(f * 100) + "% written" } : { text: "Not written yet" };
}
function transcriptLine(a, data) {
  const ch = chaptersOf(a);
  const n = ch.length > 1 ? ch.length : 1;
  let done = 0;
  for (let i = 0; i < n; i++) if (chapterState(a, data, i).done) done++;
  const f = Math.round(L.covered(data && data.ranges, 0, durOf(a)) * 100);
  return n > 1 ? "Transcript: " + done + " of " + n + " chapters written" : "Transcript: " + f + "% written";
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
    const b = el("button", { class: "row contents-row folder-row", type: "button", onclick: () => { closeSheet(); if (lis.key === a.id) listenSeek(c.t + 0.01); else listenPlay(a, c.t + 0.01); } },
      el("span", { class: "folder-n", "aria-hidden": "true" }, String(i + 1)),
      el("span", { class: "choice-text" },
        el("span", { class: "row-label", dir: "auto" }, c.title || "Chapter " + (i + 1)),
        el("span", { class: "choice-note", "data-ch": String(i) }, L.timeText(c.t) + " · " + L.lengthText(next - c.t))),
      wantsWords(a) && A.canTranscribe ? el("span", { class: "listen-ch-bar", "aria-hidden": "true" }, el("span", { class: "listen-ch-fill" })) : null);
    if (i === now) b.setAttribute("aria-current", "true");
    return el("li", null, b);
  });
  const nav = el("nav", { class: "contents", "aria-label": a.title },
    el("p", { class: "menu-title", dir: "auto" }, a.title),
    el("p", { class: "meta" }, ["Audiobook", L.lengthText(durOf(a)), ch.length + " chapters", a.audio.folder ? a.audio.parts.length + " files" : ""].filter(Boolean).join(" · ")),
    el("ol", { class: "group contents-list" }, ...rows));
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
        n.textContent = L.timeText(c.t) + " · " + L.lengthText(next - c.t) + " · " + st.text;
        n.classList.toggle("accent", !!st.now);
        // The transcript's progress, a bar along the bottom of the row.
        const bar = n.closest(".row").querySelector(".listen-ch-bar");
        if (bar) {
          bar.classList.toggle("now", !!st.now);
          bar.firstChild.style.transform = "scaleX(" + L.covered(data.ranges, c.t, next) + ")";
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
  if (!books.length) return el("div", { class: "page-controls" }, el("p", { class: "meta" }, "No books in your library yet. Find one in Discover."));
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, "Read along with"), el("p", { class: "meta" }, "A transcript is written a little ahead of you and matched to the book's words.")),
    el("div", { class: "group" }, ...books.map(({ p }) => el("button", { class: "row", type: "button", onclick: () => pairWith(a, p) },
      el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, p.title),
        el("span", { class: "choice-note", dir: "auto" }, [p.byline, p.file ? (p.file.ext || "").toUpperCase() : siteOf(p)].filter(Boolean).join(" · ")))))));
}
async function pairWith(a, book) {
  listenMode(a, "book", book);
  closeSheet(true);
  if (!readyPack()) toast("Download a transcript model in Settings › Audiobooks to match the book.", "Open", () => openSettings(false, "audiobooks"));
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
  const box = el("div", { class: "group listen-found" }, el("p", { class: "footnote" }, "Searching…"));
  const sites = C.discover.sources.filter((s) => s.books && s.search);
  if (!finding || finding.q !== q) {
    finding = { q, items: null, error: "" };
    const f = finding;
    if (!navigator.onLine) f.error = "You're offline. Search when you're back online.";
    else Promise.all(sites.map((s) => s.search(q).then((list) => list.map((x) => ({ ...x, from: s.label }))).catch(() => []))).then((lists) => {
      const by = L.norm((a.byline || "").split(/[ ,]/).pop() || "");
      f.items = lists.flat().sort((x, y) => (by && L.norm(y.by || "").includes(by) ? 1 : 0) - (by && L.norm(x.by || "").includes(by) ? 1 : 0)).slice(0, 30);
      if (state.sheet === "listenFind") $("readingBody").replaceChildren(listenFindSheet());
    });
  }
  const f = finding;
  if (f.error) fill(box, el("p", { class: "footnote" }, f.error));
  else if (f.items && !f.items.length) fill(box, el("p", { class: "footnote" }, "None of Discover's book sites (" + sites.map((s) => s.label).join(", ") + ") has “" + q + "”. Add the book as a file, then pick it under A book in your Library."));
  else if (f.items) fill(box, ...f.items.map((s) => el("button", { class: "row", type: "button", onclick: () => findPicked(a, s) },
    el("span", { class: "choice-text" }, el("span", { class: "choice-label", dir: "auto" }, s.title),
      el("span", { class: "choice-note", dir: "auto" }, [s.by, s.from].filter(Boolean).join(" · "))))));
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, "Find the book in Discover"),
      el("p", { class: "meta" }, "“" + q + "” on " + sites.map((s) => s.label).join(" and ") + ". Pick the same edition and translation the narrator reads, if you can.")),
    box);
}
async function findPicked(a, s) {
  closeSheet(true);
  const name = dzBookName(s);
  const have = state.pages.find((p) => p.file && p.file.name === name);
  if (have) { pairWith(a, have); return; }
  if (!s.epub) { toast("That one has no book file to download."); return; }
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
  toast("Reading along with “" + meta.title + "”. The transcript is written as you listen.");
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
  const input = el("input", { class: "tag-input", type: "text", value: f.heard, "aria-label": "Written as", autocomplete: "off", dir: "auto" });
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
    toast(f.n > 1 ? "Fixed " + f.n + " times, and from now on" : "Fixed, and from now on");
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  setTimeout(() => { if (input.isConnected) { input.focus(); input.select(); } }, 300);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" }, el("p", { class: "menu-title" }, "Fix this word"),
      el("p", { class: "meta" }, "Heard as “" + f.heard + "”" + (f.n > 1 ? ", " + f.n + " times in this book" : ""))),
    el("div", { class: "group" }, el("div", { class: "row" }, input)),
    el("p", { class: "footnote" }, "Every time it's heard, now and as the transcript goes on. It syncs with the audiobook."),
    el("div", { class: "export-actions" },
      el("button", { class: "btn-quiet", type: "button", onclick: () => closeSheet() }, "Cancel"),
      el("button", { class: "btn-primary", type: "button", onclick: save }, f.n > 1 ? "Fix all " + f.n : "Fix")));
}
// The selection bar's extra for a transcript: Fix.
function listenSelection(bar, picked) {
  let b = bar.querySelector(".sel-fix");
  if (!b) {
    b = el("button", { class: "sel-fix sel-icon", type: "button", "aria-label": "Fix", title: "Fix", onclick: () => { const s = C.reader.selectionText(); if (s) listenFix(s.text); } });
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"></path></svg>';
    bar.append(b);
  }
  const p = state.open;
  b.hidden = !(picked && isAudiobook(p) && modeOf(p) === "transcript" && picked.text.trim().split(/\s+/).length <= 6);
}

SHEETS.listenSleep = { button: "listenSleep", label: "Sleep timer", build: listenSleepSheet };
SHEETS.listenChapters = { button: "readerChapters", label: "Chapters", build: listenChaptersSheet };
SHEETS.listenBook = { button: "readerMore", label: "A book to read along with", build: listenBookSheet };
SHEETS.listenFind = { button: "readerMore", label: "Find the book in Discover", build: listenFindSheet };
SHEETS.listenFix = { label: "Fix a word", build: listenFixSheet };

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
  if (found && state.open === p) { paintListen(); toast("This book has its own narration. Press play to read along.", "Play", () => listenPlay(p)); }
}

// ---- The card and the library ----

// An audiobook's line on its card: what's left to hear.
// Finished is the sound's end, not the transcript's.
function listenLine(p) {
  const t = placeOf(p), d = durOf(p);
  if (d && t >= d - 5) return "Finished";
  const left = t > 30 && d ? L.lengthText(d - t) + " left" : L.lengthText(d);
  const how = modeOf(p) === "book" && bookOf(p) ? "Read along" : modeOf(p) === "transcript" ? "Transcript" : "";
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
function listeningGroup() {
  const prefs = listenPrefs();
  const secs = (list) => list.map((v) => ({ value: String(v), label: v + " seconds" }));
  return section("Listening", null, el("div", { class: "group" },
    pickRow({ label: "Back", options: secs([5, 10, 15, 30, 60]), get: () => String(listenPrefs().back), set: (v) => { setListenPref("back", Number(v)); paintListen(); } }),
    pickRow({ label: "Forward", options: secs([10, 15, 30, 45, 60]), get: () => String(listenPrefs().on), set: (v) => { setListenPref("on", Number(v)); paintListen(); } }),
    switchRow("Back a little after a pause", "3 seconds, or 10 after a long one, so you pick up the sentence", prefs.rewind, (on) => setListenPref("rewind", on)),
    switchRow("Keep the screen on", "While it plays, so you can read along", prefs.awake, (on) => { setListenPref("awake", on); speech.keepScreen(on && lis.state === "playing"); }),
    A.native ? switchRow("Allow mixing", "Music or a podcast in another app keeps playing under the book. Off: they pause while it plays", prefs.mix, (on) => setListenPref("mix", on)) : null,
    A.native ? switchRow("Small window outside the app", "Going home, the book stays in a window you can move, with back, play and forward", prefs.pip, (on) => setListenPref("pip", on)) : null));
}
function audiobookSections() {
  const adding = el("p", { class: "footnote" }, "Open an M4B or MP3 with Open a file" + (C.platform.files.canPickFolder ? ", or a folder of them with Open an audiobook folder" : "") + ". It's played from where it is, and shows under Files.");
  if (!A.canTranscribe) return [listeningGroup(), adding, el("p", { class: "footnote" }, "Reading along with a book or a transcript is in the Android app.")];
  const slot = el("div", { class: "kokoro-slot" }, el("p", { class: "footnote" }, "Looking…"));
  fillTranscripts(slot);
  return [listeningGroup(), slot, adding];
}
async function fillTranscripts(slot) {
  const s = await listenModels();
  if (!slot.isConnected && slot.dataset.drawn) return;
  slot.dataset.drawn = "1";
  if (!s || !s.supported) { slot.replaceChildren(el("p", { class: "footnote" }, "Transcripts need an Android phone with a 64-bit processor.")); return; }
  const busy = s.step === "downloading" || s.step === "checking" || s.step === "unpacking";
  const again = () => fillTranscripts(slot);
  const act = (fn) => async () => { try { await fn(); } catch (e) { toast((e && e.message) || "Couldn't do that. Try again."); } again(); };
  const using = readyPack();
  const rows = (s.packs || []).map((p) => {
    const mine = s.busy === p.id;
    const note = mine && s.step === "downloading" ? "Downloading · " + (s.total ? Math.min(99, Math.floor(s.done / s.total * 100)) : 0) + "%"
      : mine && busy ? "Unpacking…"
      : mine && s.step === "bad" ? "The download wasn't the right file. Try again."
      : mine && s.step === "failed" ? "Couldn't download. Try again on Wi-Fi."
      : p.note + " · " + formatSize(p.ready ? p.size : p.bytes);
    const control = mine && s.step === "downloading" ? el("button", { class: "btn-text", type: "button", onclick: act(() => A.cancel()) }, "Stop")
      : mine && busy ? null
      : p.ready ? el("button", { class: "row-x kokoro-delete", type: "button", "aria-label": "Delete " + p.title, title: "Delete", disabled: busy || s.working || null,
        onclick: () => { if (confirm("Delete " + p.title + "? It takes " + formatSize(p.size) + "; you can download it again.")) act(() => A.remove(p.id))(); } },
        el("span", { class: "visually-hidden" }, "Delete"), svgBin())
      : el("button", { class: "btn-text", type: "button", disabled: busy || null, onclick: act(() => A.download(p.id)) }, "Download");
    const radio = p.ready ? el("input", { type: "radio", name: "listen-pack", class: "listen-pack", checked: using && using.id === p.id, "aria-label": "Use " + p.title,
      onchange: () => { setListenPref("pack", p.id); toast(p.title + " writes from now on. Write the transcript again, in the audiobook's ⋯, to redo what's written."); } }) : null;
    return el("label", { class: "row kokoro-row" }, radio,
      el("span", { class: "choice-text" }, el("span", { class: "choice-label" }, p.title), el("span", { class: "choice-note" }, note)), control);
  });
  const prefs = listenPrefs();
  slot.replaceChildren(
    section("Transcripts", "Each one is a download, made on Wi-Fi. Fast writes well ahead and is easy on the battery. Better has punctuation and capitals and knows 25 European languages. Most languages is the slowest and needs a recent phone.", el("div", { class: "group" }, ...rows)),
    section("Make it better", null, el("div", { class: "group" },
      switchRow("Write ahead while charging", "The rest of the book gets written while the phone charges", prefs.charging, (on) => { setListenPref("charging", on); if (on) writeAhead(); }),
      switchRow("Paragraphs from pauses", "A long pause from the narrator starts a new paragraph", prefs.pauses, (on) => setListenPref("pauses", on)),
      switchRow("Chapters from the file", "The audiobook's own chapter names as headings", prefs.chapters, (on) => setListenPref("chapters", on)))),
    el("p", { class: "footnote" }, "Transcripts stay on this phone, written while you listen and never when the battery is low or the phone is hot. To fix a word heard wrong, select it in the transcript and tap the pen: it's fixed everywhere it's heard, and the fix syncs."));
  if (busy) setTimeout(() => { if (slot.isConnected) again(); }, 1000);
}
SECTIONS.audiobooks = { title: "Audiobooks", build: audiobookSections, value: () => (readyPack() || {}).title || "" };
