// ---- Android Auto (2026-11) ----
// The car lists Continue, Audiobooks and Up next, and starts them with the
// app closed, so the app hands the phone everything that takes: a book's
// parts, chapters and place, and a clip's text already cut into Narrate's
// pieces with its voice. Written when the app is put away and a little
// after it opens, only when something in it changed. Where a book or clip
// started from the car got to comes back here when the app opens.
// With App lock on, the car lists nothing.

const CAR = C.platform.car;
const CAR_BOOKS = 40, CAR_CLIPS = 10, CAR_TEXT = 300000;
let carSig = "", carWriting = false, carTimer = 0;
// A clip's pieces by id and save time, so the text is cut once.
const carText = new Map();

const carClipOk = (p) => p && !p.file && !p.link && !p.preview && !p.note && !p.finished && (p.at || 0) < 0.97;
const carBookOk = (a) => isAudiobook(a) && !(a.audio.overlay && a.audio.parts.some((x) => !x.stored));

function carBooks() {
  const at = (a) => (a.listen && a.listen.tAt) || a.readAt || a.savedAt || 0;
  return state.pages.filter(carBookOk).sort((x, y) => at(y) - at(x)).slice(0, CAR_BOOKS);
}
// Started ones first, the latest read first, then the newest saved.
function carClips() {
  return state.pages.filter(carClipOk)
    .sort((x, y) => (y.readAt || 0) - (x.readAt || 0) || (y.savedAt || 0) - (x.savedAt || 0))
    .slice(0, CAR_CLIPS);
}

function carChapters(a) {
  return chaptersOf(a).map((c, i) => {
    const { part, pos } = L.partAt(a.audio.parts, c.t || 0);
    return { title: c.title || "Chapter " + (i + 1), part, pos: Math.round(pos * 1000) };
  });
}

async function carBook(a) {
  const t = placeOf(a), dur = durOf(a);
  const { part, pos } = L.partAt(a.audio.parts, t >= dur - 2 ? 0 : t);
  return {
    id: a.id, title: a.title, by: a.byline || "", cover: thumbUrl(a) || "",
    parts: await partsToPlay(a), chapters: carChapters(a), part, pos: Math.round(pos * 1000),
    rate: speedOf(a), at: (a.listen && a.listen.tAt) || 0, done: dur ? Math.min(1, t / dur) : 0,
  };
}

async function carPieces(p) {
  const k = p.id + ":" + (p.editedAt || p.savedAt || 0);
  if (carText.has(k)) return carText.get(k);
  let html = null;
  try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
  const texts = html ? C.reader.readableIn(html, { footnotes: !!load(FOOTNOTES_KEY, false), edges: !!load(EDGES_KEY, false) }) : [];
  const got = texts.length ? pieces(texts.map((text, block) => ({ text, block }))) : null;
  const out = got && got.items.join("").length <= CAR_TEXT ? got : null;
  carText.set(k, out);
  return out;
}

// From about where the clip was left (the reading's share of the text),
// a piece early.
function carStart(items, at) {
  if (!(at > 0.01)) return 0;
  const all = items.reduce((s, x) => s + x.length, 0);
  let before = 0;
  for (let i = 0; i < items.length; i++) {
    if (before / all >= at) return Math.max(0, i - 1);
    before += items[i].length;
  }
  return 0;
}

async function carClip(p) {
  const got = await carPieces(p);
  if (!got) return null;
  const info = mediaInfo(p);
  return {
    id: p.id, title: p.title, by: info.subtitle || "", album: info.album || "", cover: thumbUrl(p) || "",
    items: got.items, blocks: got.map, start: carStart(got.items, p.at || 0),
    lang: p.lang || "", voice: voiceFor(p), engine: engineFor(p), rate: load(RATE_KEY, 1), mix: !!load(MIX_KEY, false), volume: aloudVolume(),
    at: p.readAt || 0, done: p.at || 0,
  };
}

async function carWrite() {
  if (!CAR.on || carWriting) return;
  carWriting = true;
  try {
    const locked = !!lockCfg();
    const books = locked ? [] : carBooks(), clips = locked ? [] : carClips();
    const sig = JSON.stringify([locked, load(GO_ON_KEY, false), load(RATE_KEY, 1), load(VOICE_KEY, {}), enginePicks(), load(MIX_KEY, false), aloudVolume(),
      books.map((a) => [a.id, a.title, placeOf(a), speedOf(a), a.thumb || ""]), clips.map((p) => [p.id, p.title, p.at || 0, p.editedAt || p.savedAt, p.thumb || ""])]);
    if (sig === carSig) return;
    const list = { locked, goOn: !!load(GO_ON_KEY, false), books: [], clips: [], continue: [] };
    for (const a of books) list.books.push(await carBook(a));
    for (const p of clips) { const c = await carClip(p); if (c) list.clips.push(c); }
    // The book and the clip last listened to or read, the latest first.
    const book = list.books[0], clip = list.clips.find((c) => c.id === aloud.key) || list.clips.find((c) => c.at > 0);
    const two = [book && { id: "b:" + book.id, at: book.at }, clip && { id: "c:" + clip.id, at: clip.id === aloud.key ? Date.now() : clip.at }].filter(Boolean);
    list.continue = two.sort((x, y) => y.at - x.at).map((x) => x.id);
    if (await CAR.list(list)) carSig = sig;
  } finally {
    carWriting = false;
  }
}
const carSoon = (ms = 4000) => { clearTimeout(carTimer); carTimer = setTimeout(() => carWrite().catch(() => {}), ms); };

// What the car played with the app closed.
async function carPlaces() {
  if (!CAR.on) return;
  const got = await CAR.places();
  let changed = false;
  for (const [id, w] of Object.entries(got || {})) {
    const p = state.pages.find((x) => x.id === id);
    if (!p || !w || !w.at) continue;
    if (w.kind === "book" && hasSound(p)) {
      if (w.at <= ((p.listen && p.listen.tAt) || 0) || lis.key === p.id) continue;
      const t = L.startOf(p.audio.parts, w.part || 0) + (w.pos || 0) / 1000;
      p.listen = { ...(p.listen || {}), t: Math.round(t * 10) / 10, tAt: w.at };
      if (w.done) p.finished = true;
      p.readAt = Math.max(p.readAt || 0, w.at);
      changed = true;
    } else if (w.kind === "clip") {
      if (w.at <= (p.placeAt || 0) || aloud.key === p.id) continue;
      if (w.done) { p.finished = true; p.at = 1; }
      else if ((w.of || 0) > (p.at || 0)) p.at = w.of;
      else continue;
      delete p.spot;
      delete p.spotWords;
      p.readAt = p.placeAt = w.at;
      p.readOn = deviceName();
      changed = true;
    }
  }
  if (!changed) return;
  await C.store.writeIndex(state.pages).catch(() => {});
  if (C.sync.on) syncSoon();
  if (typeof renderLibrary === "function") renderLibrary();
}

if (CAR.on) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) carWrite().catch(() => {});
    else carPlaces().then(() => carSoon(6000)).catch(() => {});
  });
  setTimeout(() => carPlaces().then(() => carSoon(0)).catch(() => {}), 5000);
}
