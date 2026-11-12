// Waypage: audiobooks (2026-11). What a sound file says about itself (its
// chapters, names and cover, read from the file), a transcript built from
// what the phone heard, read-along timings matched to any book's text,
// and an EPUB's own narration (Media Overlays). No playing here: that's
// app-listen.js, with the phone's player (AudiobookPlugin) or a browser's
// <audio>.
//
// Times are seconds into the whole book, across its files ("parts").
// A sync is where each timed word sits in the reader's blocks (the same
// blocks Narrate reads, reader.readable with footnotes and headers in):
// { t, b, o, l } as parallel arrays, in reading order.
(function () {
  const C = window.Waypage;

  const EXTS = { mp3: "mp3", m4a: "m4a", m4b: "m4b", aac: "aac", ogg: "ogg", oga: "ogg", opus: "opus", flac: "flac", wav: "wav" };
  const MIMES = { mp3: "audio/mpeg", m4a: "audio/mp4", m4b: "audio/mp4", aac: "audio/aac", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", wav: "audio/wav" };
  const extOf = (name) => ((String(name).match(/\.([a-z0-9]{1,8})$/i) || [])[1] || "").toLowerCase();
  const isAudioName = (name) => !!EXTS[extOf(name)];
  const str = (b, a, z) => String.fromCharCode(...b.subarray(a, z));
  const bytes = async (blob, a, z) => new Uint8Array(await blob.slice(a, z).arrayBuffer());
  const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

  // What kind of sound a file is, from its first bytes and name: one of
  // EXTS' values, or null.
  function sniff(head, name) {
    const ext = EXTS[extOf(name)] || "";
    if (!head || head.length < 12) return ext || null;
    if (str(head, 0, 3) === "ID3") return "mp3";
    if (str(head, 4, 8) === "ftyp") {
      const brand = str(head, 8, 12);
      if (/^(M4B|M4A|M4P|mp4|iso|dash|3gp)/i.test(brand)) return brand === "M4B " || ext === "m4b" ? "m4b" : "m4a";
      return null;
    }
    if (str(head, 0, 4) === "OggS") return ext === "opus" ? "opus" : "ogg";
    if (str(head, 0, 4) === "fLaC") return "flac";
    if (str(head, 0, 4) === "RIFF" && str(head, 8, 12) === "WAVE") return "wav";
    if (head[0] === 0xff && (head[1] & 0xf6) === 0xf0) return "aac";
    if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return "mp3";
    return ext === "mp3" || ext === "aac" ? ext : null;
  }

  // ---- What the file says: chapters, names, cover ----

  // MP4 (M4B, M4A): Nero's chpl list, else a QuickTime chapter track (a
  // text track another track names in tref/chap), read box by box so a
  // 2 GB book costs a few small reads.
  const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "edts", "dinf"]);
  async function boxes(blob, from, to) {
    const out = [];
    let at = from;
    while (at + 8 <= to && out.length < 4000) {
      const h = await bytes(blob, at, Math.min(to, at + 16));
      if (h.length < 8) break;
      const v = new DataView(h.buffer);
      let size = v.getUint32(0), head = 8;
      const type = str(h, 4, 8);
      if (size === 1 && h.length >= 16) { size = v.getUint32(8) * 4294967296 + v.getUint32(12); head = 16; }
      else if (size === 0) size = to - at;
      if (size < head || at + size > to + 8) break;
      out.push({ type, start: at, body: at + head, end: Math.min(to, at + size) });
      at += size;
    }
    return out;
  }
  const child = (list, type) => list.find((b) => b.type === type) || null;
  async function kids(blob, box) { return box ? boxes(blob, box.body, box.end) : []; }
  async function boxBytes(blob, box, max = 4 << 20) { return box && box.end - box.body <= max ? bytes(blob, box.body, box.end) : null; }

  async function mp4Chapters(blob) {
    const top = await boxes(blob, 0, blob.size);
    const moov = child(top, "moov");
    if (!moov) return [];
    const inMoov = await kids(blob, moov);
    // Nero chapters: version, flags, [4 bytes in version 1], a count,
    // then each start in 100 ns and its name.
    const udta = child(inMoov, "udta");
    const chpl = udta && child(await kids(blob, udta), "chpl");
    const c = await boxBytes(blob, chpl);
    if (c && c.length > 5) {
      const v = new DataView(c.buffer);
      let p = c[0] ? 8 : 4;
      const n = c[p++];
      const out = [];
      for (let i = 0; i < n && p + 9 <= c.length; i++) {
        const start = v.getUint32(p) * 4294967296 + v.getUint32(p + 4);
        const len = c[p + 8];
        out.push({ t: start / 1e7, title: new TextDecoder().decode(c.subarray(p + 9, p + 9 + len)).trim() });
        p += 9 + len;
      }
      if (out.length) return out;
    }
    // QuickTime chapters: the text track named by another track's tref/chap.
    const traks = inMoov.filter((b) => b.type === "trak");
    const info = [];
    let chapId = 0;
    for (const t of traks) {
      const inT = await kids(blob, t);
      const tk = await boxBytes(blob, child(inT, "tkhd"), 256);
      const id = tk ? new DataView(tk.buffer).getUint32(tk[0] ? 20 : 12) : 0;
      const tref = child(inT, "tref");
      if (tref) {
        const chap = child(await kids(blob, tref), "chap");
        const cb = await boxBytes(blob, chap, 256);
        if (cb && cb.length >= 4) chapId = new DataView(cb.buffer).getUint32(0);
      }
      info.push({ id, inT });
    }
    const ct = chapId && info.find((x) => x.id === chapId);
    if (!ct) return [];
    const mdia = child(ct.inT, "mdia");
    const inMdia = await kids(blob, mdia);
    const mdhd = await boxBytes(blob, child(inMdia, "mdhd"), 256);
    if (!mdhd) return [];
    const scale = new DataView(mdhd.buffer).getUint32(mdhd[0] ? 20 : 12) || 1;
    const minf = child(inMdia, "minf");
    const stbl = minf && child(await kids(blob, minf), "stbl");
    const inS = await kids(blob, stbl);
    const read = async (type) => boxBytes(blob, child(inS, type), 1 << 20);
    const stts = await read("stts"), stsz = await read("stsz"), stsc = await read("stsc");
    const co = (await read("stco")) || (await read("co64"));
    const wide = !child(inS, "stco");
    if (!stts || !stsz || !stsc || !co) return [];
    const u32 = (b, p) => new DataView(b.buffer).getUint32(p);
    // Each sample's start time.
    const times = [];
    let tick = 0;
    for (let i = 0, n = u32(stts, 4); i < n && 8 + i * 8 + 8 <= stts.length; i++) {
      const count = u32(stts, 8 + i * 8), delta = u32(stts, 12 + i * 8);
      for (let k = 0; k < count && times.length < 5000; k++) { times.push(tick / scale); tick += delta; }
    }
    const fixed = u32(stsz, 4), count = u32(stsz, 8);
    const sizes = [];
    for (let i = 0; i < Math.min(count, 5000); i++) sizes.push(fixed || u32(stsz, 12 + i * 4));
    const chunks = [];
    for (let i = 0, n = u32(co, 4); i < n; i++) chunks.push(wide ? u32(co, 8 + i * 8) * 4294967296 + u32(co, 12 + i * 8) : u32(co, 8 + i * 4));
    const runs = [];
    for (let i = 0, n = u32(stsc, 4); i < n; i++) runs.push({ first: u32(stsc, 8 + i * 12), per: u32(stsc, 12 + i * 12) });
    const offsets = [];
    for (let c = 0, s = 0; c < chunks.length && s < sizes.length; c++) {
      let per = 1;
      for (const r of runs) if (r.first <= c + 1) per = r.per;
      let at = chunks[c];
      for (let k = 0; k < per && s < sizes.length; k++, s++) { offsets.push(at); at += sizes[s]; }
    }
    const out = [];
    for (let i = 0; i < offsets.length && i < times.length; i += 8) {
      const got = await Promise.all(offsets.slice(i, i + 8).map((o, k) => bytes(blob, o, o + Math.min(sizes[i + k], 1024))));
      got.forEach((b, k) => {
        if (b.length < 2) return;
        const len = (b[0] << 8) | b[1];
        const raw = b.subarray(2, 2 + len);
        const text = raw[0] === 0xfe && raw[1] === 0xff ? new TextDecoder("utf-16be").decode(raw.subarray(2)) : new TextDecoder().decode(raw);
        out.push({ t: times[i + k], title: text.trim() });
      });
    }
    return out;
  }

  // MP3: the ID3v2 tag at the front: its names, its cover (APIC) and its
  // chapters (CHAP, with a TIT2 inside each).
  const syncsafe = (b, p) => (b[p] << 21) | (b[p + 1] << 14) | (b[p + 2] << 7) | b[p + 3];
  function id3Text(b) {
    if (!b || !b.length) return "";
    const enc = b[0], raw = b.subarray(1);
    const dec = enc === 1 ? (raw[0] === 0xfe ? "utf-16be" : "utf-16le") : enc === 2 ? "utf-16be" : enc === 3 ? "utf-8" : "latin1";
    const body = enc === 1 && ((raw[0] === 0xff && raw[1] === 0xfe) || (raw[0] === 0xfe && raw[1] === 0xff)) ? raw.subarray(2) : raw;
    return new TextDecoder(dec).decode(body).replace(/\u0000[\s\S]*$/, "").trim();
  }
  function id3Frames(tag, ver, from, to) {
    const out = [];
    let p = from;
    const idLen = ver === 2 ? 3 : 4, headLen = ver === 2 ? 6 : 10;
    while (p + headLen <= to) {
      const id = str(tag, p, p + idLen);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
      const size = ver === 2 ? (tag[p + 3] << 16) | (tag[p + 4] << 8) | tag[p + 5]
        : ver === 4 ? syncsafe(tag, p + 4) : new DataView(tag.buffer, tag.byteOffset).getUint32(p + 4);
      if (size <= 0 || p + headLen + size > to) break;
      out.push({ id, body: tag.subarray(p + headLen, p + headLen + size) });
      p += headLen + size;
    }
    return out;
  }
  async function id3(blob) {
    const h = await bytes(blob, 0, 10);
    if (h.length < 10 || str(h, 0, 3) !== "ID3") return null;
    const ver = h[3], size = syncsafe(h, 6);
    const tag = await bytes(blob, 10, 10 + Math.min(size, 16 << 20));
    let from = 0;
    if (h[5] & 0x40 && ver >= 3) from = ver === 4 ? syncsafe(tag, 0) : new DataView(tag.buffer).getUint32(0) + 4;
    const frames = id3Frames(tag, ver, from, tag.length);
    const text = (ids) => { const f = frames.find((x) => ids.includes(x.id)); return f ? id3Text(f.body) : ""; };
    const out = { title: text(["TALB", "TAL"]) || text(["TIT2", "TT2"]), artist: text(["TPE1", "TP1", "TPE2", "TP2"]), chapters: [], cover: null };
    for (const f of frames) {
      if (f.id === "CHAP" && ver >= 3) {
        const b = f.body;
        let z = b.indexOf(0);
        if (z < 0 || z + 17 > b.length) continue;
        const v = new DataView(b.buffer, b.byteOffset);
        const start = v.getUint32(z + 1);
        const sub = id3Frames(b, ver, z + 17, b.length);
        const tit = sub.find((x) => x.id === "TIT2");
        out.chapters.push({ t: start / 1000, title: tit ? id3Text(tit.body) : "" });
      } else if ((f.id === "APIC" || f.id === "PIC") && !out.cover) {
        const b = f.body, enc = b[0];
        let p = 1;
        if (f.id === "PIC") p = 4;
        else { while (p < b.length && b[p]) p++; p++; }
        p++;
        if (enc === 1 || enc === 2) { while (p + 1 < b.length && (b[p] || b[p + 1])) p += 2; p += 2; }
        else { while (p < b.length && b[p]) p++; p++; }
        if (p < b.length) out.cover = b.slice(p);
      }
    }
    out.chapters.sort((a, b) => a.t - b.t);
    return out;
  }

  // What a sound file says about itself: { title, artist, chapters, cover }.
  async function tags(blob, kind) {
    try {
      if (kind === "mp3") return (await id3(blob)) || { chapters: [] };
      if (kind === "m4a" || kind === "m4b") return { chapters: await mp4Chapters(blob) };
    } catch (e) { /* nothing more to say */ }
    return { chapters: [] };
  }

  // A folder's files in their reading order: by name, the way a person
  // numbers them ("Part 2" before "Part 10").
  const inOrder = (files) => files.filter((f) => isAudioName(f.name)).sort((a, b) => naturally(a.path || a.name, b.path || b.name));
  const baseName = (name) => String(name).replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_]+/g, " ").trim();

  // Where a book time is: { part, pos } with pos in seconds into it.
  function partAt(parts, t) {
    let at = 0;
    for (let i = 0; i < parts.length; i++) {
      const d = parts[i].dur || 0;
      if (t < at + d || i === parts.length - 1) return { part: i, pos: Math.max(0, t - at) };
      at += d;
    }
    return { part: 0, pos: 0 };
  }
  const startOf = (parts, i) => parts.slice(0, i).reduce((s, p) => s + (p.dur || 0), 0);
  // A stretch of one file, heard: its times moved on to the book's clock.
  const onBookClock = (pieces, start) => pieces.map((x) => ({ ...x, t0: x.t0 + start, t1: x.t1 + start, ...(x.times ? { times: x.times.map((t) => t + start) } : {}) }));
  // Transcripts written before onBookClock (12 Nov 2026) left a later
  // file's word times on that file's own clock, under chapter 1's.
  const mendTimes = (pieces, parts) => pieces.map((x) => {
    if (!x.times || !x.times.length || x.times[0] >= x.t0 - 1) return x;
    const start = startOf(parts, partAt(parts, x.t0).part);
    return start > 0 ? { ...x, times: x.times.map((t) => t + start) } : x;
  });
  // How much of from..to the written ranges cover, 0 to 1.
  function covered(ranges, from, to) {
    if (!(to > from)) return 0;
    let n = 0;
    for (const [a, b] of ranges || []) n += Math.max(0, Math.min(b, to) - Math.max(a, from));
    return Math.min(1, n / (to - from));
  }
  const chapterAt = (chapters, t) => { let i = -1; for (let k = 0; k < chapters.length; k++) if (chapters[k].t <= t + 0.25) i = k; return i; };

  // ---- Transcripts ----

  // Each heard word with its time. A piece whose words came without
  // times spreads them over the piece by their length.
  function timedWords(pieces) {
    const out = [];
    for (const p of pieces || []) {
      const words = p.words && p.words.length ? p.words : String(p.text || "").split(/\s+/).filter(Boolean);
      const times = p.times && p.times.length === words.length ? p.times : null;
      const chars = words.reduce((s, w) => s + w.length + 1, 0) || 1;
      let c = 0;
      words.forEach((w, i) => {
        out.push({ w, t: times ? times[i] : p.t0 + (p.t1 - p.t0) * (c / chars), q: i === 0 ? p.quiet || 0 : 0 });
        c += w.length + 1;
      });
    }
    return out;
  }

  // Your fixes (a word heard wrong, written right), on every piece of
  // the transcript, now and later. Whole words, any case; the punctuation
  // around what was heard stays.
  const norm = (w) => String(w).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  function applyFixes(words, fixes) {
    let out = words;
    for (const f of fixes || []) {
      const from = String(f.from || "").split(/\s+/).map(norm).filter(Boolean);
      const to = String(f.to || "").split(/\s+/).filter(Boolean);
      if (!from.length || !to.length) continue;
      const next = [];
      for (let i = 0; i < out.length;) {
        let hit = true;
        for (let k = 0; k < from.length; k++) if (!out[i + k] || norm(out[i + k].w) !== from[k]) { hit = false; break; }
        if (!hit) { next.push(out[i]); i++; continue; }
        const first = out[i], last = out[i + from.length - 1];
        const lead = (first.w.match(/^[^\p{L}\p{N}]*/u) || [""])[0], tail = (last.w.match(/[^\p{L}\p{N}]*$/u) || [""])[0];
        const span = Math.max(0, last.t - first.t);
        to.forEach((w, k) => next.push({ w: (k === 0 ? lead : "") + w + (k === to.length - 1 ? tail : ""), t: first.t + span * (k / to.length), q: k === 0 ? first.q : 0 }));
        i += from.length;
      }
      out = next;
    }
    return out;
  }
  // How many times a phrase was heard, for "Fix all 6".
  function countHeard(words, phrase) {
    const from = String(phrase).split(/\s+/).map(norm).filter(Boolean);
    if (!from.length) return 0;
    let n = 0;
    for (let i = 0; i + from.length <= words.length; i++) {
      let hit = true;
      for (let k = 0; k < from.length; k++) if (norm(words[i + k].w) !== from[k]) { hit = false; break; }
      if (hit) n++;
    }
    return n;
  }

  // The transcript as headings and paragraphs: a chapter's name where it
  // starts, and with `pauses` a new paragraph where the narrator paused
  // long enough; otherwise every hundred words or so, at a full stop.
  // `ranges` are the stretches written, [from, to] in seconds: a gap
  // between them is a line, as the words there aren't written yet.
  const PAUSE = 0.9;
  function paragraphs(words, { chapters = [], pauses = true, ranges = [] } = {}) {
    const out = [];
    let para = null, ch = 0;
    const end = (w) => /[.!?…]["'”’)]*$/.test(w);
    const gapAt = (a, b) => ranges.length > 1 && ranges.some((r, i) => i > 0 && r[0] > a && r[0] <= b + 0.01 && ranges[i - 1][1] < r[0] - 1);
    let last = -1;
    for (const x of words) {
      // A chapter starting here already parts it from what came before.
      if (last >= 0 && gapAt(last, x.t) && !(ch < chapters.length && chapters[ch].t <= x.t + 0.3)) { out.push({ gap: true }); para = null; }
      while (ch < chapters.length && chapters[ch].t <= x.t + 0.3) {
        if (chapters[ch].title && (ch === chapters.length - 1 || chapters[ch + 1].t > x.t + 0.3)) out.push({ head: chapters[ch].title, t: chapters[ch].t });
        para = null;
        ch++;
      }
      const n = para ? para.words.length : 0;
      const prev = para && para.words[n - 1];
      if (para && ((pauses && x.q >= PAUSE && n >= 12) || (n >= (pauses ? 220 : 110) && prev && end(prev.w)))) para = null;
      if (!para) { para = { words: [] }; out.push(para); }
      para.words.push(x);
      last = x.t;
    }
    return out;
  }

  // The transcript as a clip's body (a div.co-body made in `out`).
  function transcriptBody(out, parts, { empty = "" } = {}) {
    const root = out.createElement("div");
    root.className = "co-body";
    let section = null;
    for (const p of parts) {
      if (p.head) {
        section = out.createElement("section");
        const h = out.createElement("h2");
        h.textContent = p.head;
        section.append(h);
        root.append(section);
      } else if (p.gap) (section || root).append(out.createElement("hr"));
      else {
        const para = out.createElement("p");
        para.textContent = p.words.map((w) => w.w).join(" ");
        (section || root).append(para);
      }
    }
    if (!root.textContent.trim() && empty) {
      const p = out.createElement("p");
      p.textContent = empty;
      root.append(p);
    }
    return root;
  }

  // ---- Read-along timings: heard words onto a book's words ----

  // The book's words as blocks give them: normalised, with the block and
  // where in its text each one is.
  function bookWords(texts) {
    const w = [], b = [], o = [], l = [];
    texts.forEach((text, i) => {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text))) {
        const n = norm(m[0]);
        if (!n) continue;
        w.push(n); b.push(i); o.push(m.index); l.push(m[0].length);
      }
    });
    return { w, b, o, l };
  }

  // Each book word's time, or NaN where the narration doesn't say it
  // (a book's front matter, a footnote, an edition's extra page). Three
  // words heard in a row are found in the book close to where the last
  // ones were, or anywhere when that run is the only one like it (the
  // narrator skipped ahead); runs found in order are anchors, and the
  // words between two anchors share the time between them when the two
  // stretches are about as long.
  const WINDOW = 800;
  function align(heard, book) {
    const aw = [], at = [];
    for (const x of heard) { const n = norm(x.w); if (n) { aw.push(n); at.push(x.t); } }
    const bw = book.w;
    const times = new Float64Array(bw.length).fill(NaN);
    if (aw.length < 3 || bw.length < 3) return times;
    const grams = new Map();
    for (let k = 0; k + 2 < bw.length; k++) {
      const key = bw[k] + " " + bw[k + 1] + " " + bw[k + 2];
      const list = grams.get(key);
      if (!list) grams.set(key, [k]);
      else if (list.length < 64) list.push(k);
    }
    const anchors = [];
    let lastI = -1, lastK = -1, since = 0;
    for (let i = 0; i + 2 < aw.length; i++) {
      const list = grams.get(aw[i] + " " + aw[i + 1] + " " + aw[i + 2]);
      since++;
      if (!list) continue;
      const expect = lastK < 0 ? 0 : lastK + (i - lastI);
      let pick = -1;
      for (const k of list) {
        if (k <= lastK) continue;
        if (lastK >= 0 ? k - expect <= WINDOW && expect - k <= WINDOW / 4 : true) { pick = k; break; }
      }
      // Lost: a run found once in the whole book, and the next run right
      // after it, is where the narration is now.
      if (pick < 0 && (lastK < 0 || since > 60)) {
        const cand = list.length === 1 ? list[0] : -1;
        const next = i + 3 < aw.length && grams.get(aw[i + 1] + " " + aw[i + 2] + " " + aw[i + 3]);
        if (cand >= 0 && next && next.includes(cand + 1)) pick = cand;
      }
      if (pick < 0) continue;
      for (let d = 0; d < 3; d++) if (!anchors.length || anchors[anchors.length - 1][1] < pick + d) anchors.push([i + d, pick + d]);
      lastI = i + 2; lastK = pick + 2; since = 0;
      i += 2;
    }
    // Each run goes on, both ways, while the words agree one for one: the
    // last few words heard, and the first, are in no run of three.
    const runs = [];
    for (let a = 0; a < anchors.length; a++) {
      const prev = runs[runs.length - 1], nx = anchors[a + 1];
      let [i, k] = anchors[a];
      const back = [];
      while (i > 0 && k > 0 && aw[i - 1] === bw[k - 1] && (!prev || (i - 1 > prev[0] && k - 1 > prev[1]))) { i--; k--; back.unshift([i, k]); }
      runs.push(...back, anchors[a]);
      [i, k] = anchors[a];
      while (i + 1 < aw.length && k + 1 < bw.length && aw[i + 1] === bw[k + 1] && (!nx || (i + 1 < nx[0] && k + 1 < nx[1]))) { i++; k++; runs.push([i, k]); }
    }
    anchors.length = 0;
    anchors.push(...runs);
    for (let a = 0; a < anchors.length; a++) {
      const [i, k] = anchors[a];
      times[k] = at[i];
      const nx = anchors[a + 1];
      if (!nx) break;
      const di = nx[0] - i, dk = nx[1] - k;
      if (dk <= 1) continue;
      if (dk <= di * 2 + 6 && di <= dk * 2 + 6) {
        for (let s = 1; s < dk; s++) times[k + s] = at[i] + (at[nx[0]] - at[i]) * (s / dk);
      }
    }
    // Never back in time as the book goes on.
    let max = -Infinity;
    for (let k = 0; k < times.length; k++) {
      if (Number.isNaN(times[k])) continue;
      if (times[k] < max) times[k] = NaN; else max = times[k];
    }
    return times;
  }

  // The timed words as a sync, rounded to a hundredth of a second.
  function syncOf(book, times) {
    const s = { t: [], b: [], o: [], l: [] };
    for (let k = 0; k < times.length; k++) {
      if (Number.isNaN(times[k])) continue;
      s.t.push(Math.round(times[k] * 100) / 100); s.b.push(book.b[k]); s.o.push(book.o[k]); s.l.push(book.l[k]);
    }
    return s;
  }
  // How much of the heard words found their place: 0 to 1.
  const matched = (heard, sync) => (heard.length ? Math.min(1, sync.t.length / heard.length) : 0);

  // The word being said at `t`: its index in the sync, or -1 before the
  // first. A word whose time was long ago (the narration has gone past
  // anything in the book) is -1 too.
  function wordAt(sync, t) {
    const ts = sync && sync.t;
    if (!ts || !ts.length || t < ts[0] - 0.05) return -1;
    let lo = 0, hi = ts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ts[mid] <= t + 0.05) lo = mid; else hi = mid - 1; }
    const next = ts[lo + 1];
    if (next == null ? t - ts[lo] > 8 : next - ts[lo] > 30 && t - ts[lo] > 8) return -1;
    return lo;
  }
  // Where a place in the book is heard: the first timed word at or after
  // block `b`, offset `o`. null when nothing after it is timed.
  function timeAt(sync, b, o) {
    if (!sync || !sync.t.length) return null;
    let lo = 0, hi = sync.t.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sync.b[mid] < b || (sync.b[mid] === b && sync.o[mid] + sync.l[mid] <= o)) lo = mid + 1; else hi = mid;
    }
    return lo < sync.t.length ? sync.t[lo] : null;
  }

  // ---- An EPUB's own narration (EPUB 3 Media Overlays) ----

  // A SMIL clock value in seconds: "0:01:02.5", "1:02", "62.5s", "500ms", "1.5min", "2h".
  function clock(v) {
    v = String(v || "").trim().replace(/^npt=/, "");
    let m;
    if ((m = v.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/))) return +m[1] * 3600 + +m[2] * 60 + +m[3];
    if ((m = v.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/))) return +m[1] * 60 + +m[2];
    if ((m = v.match(/^(\d+(?:\.\d+)?)(h|min|s|ms)?$/))) return +m[1] * ({ h: 3600, min: 60, s: 1, ms: 0.001 }[m[2] || "s"]);
    return NaN;
  }

  const resolve = (base, href) => {
    const out = base.split("/").slice(0, -1);
    for (const part of String(href).split("#")[0].split("/")) {
      if (part === "..") out.pop();
      else if (part && part !== ".") out.push(part);
    }
    try { return decodeURIComponent(out.join("/")); } catch (e) { return out.join("/"); }
  };

  // The book's narration, from its zip `file`: { parts: [{ path, entry,
  // dur }], pars: [{ id, part, t0, t1 }] } where id is the reader's own
  // ("c3-p12", files.js) and t0, t1 are seconds into the part; null when
  // it has none. The chapters' numbers match files.js's fromEpub.
  async function overlays(file) {
    const B = C.backup;
    const entries = await B.zipEntries(file);
    const dec = (b) => new TextDecoder().decode(b);
    const xml = async (path) => new DOMParser().parseFromString(dec(await B.zipRead(file, entries.get(path))), "application/xml");
    if (!entries.has("META-INF/container.xml")) return null;
    const rootfile = (await xml("META-INF/container.xml")).getElementsByTagName("rootfile")[0];
    const opfPath = rootfile && rootfile.getAttribute("full-path");
    if (!opfPath || !entries.has(opfPath)) return null;
    const opf = await xml(opfPath);
    const manifest = new Map();
    for (const item of opf.getElementsByTagNameNS("*", "item")) {
      manifest.set(item.getAttribute("id"), { path: resolve(opfPath, item.getAttribute("href") || ""), type: item.getAttribute("media-type") || "", overlay: item.getAttribute("media-overlay") || "" });
    }
    const spine = [...opf.getElementsByTagNameNS("*", "itemref")].map((r) => manifest.get(r.getAttribute("idref")))
      .filter((it) => it && /html/.test(it.type) && entries.has(it.path));
    const parts = [], partOf = new Map(), pars = [];
    for (const [i, it] of spine.entries()) {
      const smil = it.overlay && manifest.get(it.overlay);
      if (!smil || !entries.has(smil.path)) continue;
      const doc = await xml(smil.path);
      for (const par of doc.getElementsByTagNameNS("*", "par")) {
        const text = par.getElementsByTagNameNS("*", "text")[0], audio = par.getElementsByTagNameNS("*", "audio")[0];
        if (!text || !audio) continue;
        const src = text.getAttribute("src") || "", frag = src.split("#")[1];
        if (!frag || resolve(smil.path, src) !== it.path) continue;
        const path = resolve(smil.path, audio.getAttribute("src") || "");
        const entry = entries.get(path);
        if (!entry) continue;
        if (!partOf.has(path)) { partOf.set(path, parts.length); parts.push({ path, entry, dur: 0, name: path.split("/").pop() }); }
        const t0 = clock(audio.getAttribute("clipBegin") || audio.getAttribute("clipbegin") || "0");
        const t1 = clock(audio.getAttribute("clipEnd") || audio.getAttribute("clipend") || "");
        if (!Number.isFinite(t0)) continue;
        const part = partOf.get(path);
        pars.push({ id: "c" + i + "-" + frag, part, t0, t1: Number.isFinite(t1) ? t1 : t0 });
        parts[part].dur = Math.max(parts[part].dur, Number.isFinite(t1) ? t1 : t0);
      }
    }
    if (!pars.length) return null;
    // Where each sound file's bytes start in the EPUB, to be played from
    // there: only a file stored as it is (the usual for MP3 and M4A).
    for (const p of parts) {
      const h = await (async () => new Uint8Array(await file.slice(p.entry.offset, p.entry.offset + 30).arrayBuffer()))();
      const v = new DataView(h.buffer);
      p.offset = p.entry.offset + 30 + v.getUint16(26, true) + v.getUint16(28, true);
      p.length = p.entry.size;
      p.stored = p.entry.method === 0;
      delete p.entry;
    }
    return { parts, pars };
  }

  // A sync from an EPUB's narration and the reader's blocks:
  // `spotOf(id)` says where an element is ({ b, o, l }) or null.
  function overlaySync(pars, parts, spotOf) {
    const starts = parts.map((_, i) => startOf(parts, i));
    const s = { t: [], b: [], o: [], l: [] };
    for (const p of pars) {
      const at = spotOf(p.id);
      if (!at) continue;
      const t = Math.round((starts[p.part] + p.t0) * 100) / 100;
      if (s.t.length && t < s.t[s.t.length - 1]) continue;
      s.t.push(t); s.b.push(at.b); s.o.push(at.o); s.l.push(at.l);
    }
    return s;
  }

  const timeText = (s) => {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  };
  const lengthText = (s) => {
    const m = Math.max(1, Math.round(s / 60));
    return m >= 60 ? Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " min" : "") : m + " min";
  };

  C.listen = { EXTS, MIMES, extOf, isAudioName, sniff, tags, id3, mp4Chapters, inOrder, baseName, partAt, startOf, onBookClock, mendTimes, covered, chapterAt,
    timedWords, applyFixes, countHeard, norm, paragraphs, transcriptBody, bookWords, align, syncOf, matched, wordAt, timeAt,
    clock, overlays, overlaySync, timeText, lengthText };
})();
