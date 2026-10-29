// Waypage: dictionaries on the device (1.45.0, from KOReader). StarDict
// files someone adds (.ifo, .idx, .dict or .dict.dz, and .syn, loose or
// in a .zip or .tar.gz), kept in this device's database and looked in
// with no connection: nothing is sent anywhere. Not synced or backed up;
// a dictionary is per device, like a font.
//
//   list()           [{ id, name, words, bytes }], straight from storage
//   any()            whether there's one to look in
//   add(files)       { name, words }; throws an Error saying what's wrong
//   remove(id)
//   lookup(text)     [{ dict, word, parts: [{ type, text }] }]
//   show(part)       a part as safe DOM: no attributes, links or pictures
//   forms(word)      the forms looked for (tests)
(function () {
  const LIST_KEY = "waypage.dicts";
  const DB = "waypage-dict", STORE = "files";
  const MAX_BYTES = 400 * 1024 * 1024;

  const readList = () => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || "[]"); } catch (e) { return []; } };
  const writeList = (l) => localStorage.setItem(LIST_KEY, JSON.stringify(l));
  const list = () => readList();
  const any = () => readList().length > 0;

  let dbOpen = null;
  function db() {
    if (!dbOpen) {
      dbOpen = new Promise((ok, no) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => ok(r.result);
        r.onerror = () => { dbOpen = null; no(r.error); };
      });
    }
    return dbOpen;
  }
  async function idb(mode, fn) {
    const d = await db();
    return new Promise((ok, no) => {
      const t = d.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => ok(r && r.result);
      t.onerror = t.onabort = () => no(t.error);
    });
  }

  // ---- Reading what was picked ----

  const gunzip = (blob) => new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).blob();
  const kindOf = (name) => {
    const n = name.toLowerCase();
    const m = /\.(ifo|idx|idx\.gz|dict|dict\.dz|syn|syn\.dz)$/.exec(n);
    return m ? m[1] : null;
  };

  // A tar's files, read as it streams out, each one a Blob: a big
  // dictionary is never one buffer in memory.
  async function untar(stream, want) {
    const out = [];
    const reader = stream.getReader();
    let buf = new Uint8Array(0), file = null;
    const take = (n) => { const h = buf.subarray(0, n); buf = buf.subarray(n); return h; };
    for (;;) {
      const { done, value } = await reader.read();
      if (value) { const b = new Uint8Array(buf.length + value.length); b.set(buf); b.set(value, buf.length); buf = b; }
      for (;;) {
        if (file) {
          const n = Math.min(file.left, buf.length);
          if (n) { if (file.keep) file.parts.push(take(n).slice()); else take(n); file.left -= n; }
          if (file.left) break;
          if (buf.length < file.pad) break;
          take(file.pad);
          if (file.keep) out.push({ name: file.name, blob: new Blob(file.parts) });
          file = null;
        }
        if (buf.length < 512) break;
        const h = take(512);
        if (h.every((x) => x === 0)) continue;
        const text = (a, b) => new TextDecoder().decode(h.subarray(a, b)).replace(/\0.*$/s, "");
        const size = parseInt(text(124, 136).trim() || "0", 8) || 0;
        const name = (text(345, 500) ? text(345, 500) + "/" : "") + text(0, 100);
        const type = String.fromCharCode(h[156] || 48);
        file = { name, left: size, pad: (512 - (size % 512)) % 512, keep: (type === "0" || type === "\0") && want(name), parts: [] };
      }
      if (done) break;
    }
    return out;
  }

  // Everything picked, as { name, blob }, out of any zip or tar.
  async function unpack(files) {
    const out = [];
    for (const f of files) {
      const n = String(f.name || "").toLowerCase();
      if (/\.zip$/.test(n)) {
        const B = window.Waypage.backup;
        let entries;
        try { entries = await B.zipEntries(f); } catch (e) { throw new Error("That zip couldn't be opened."); }
        for (const [name, e] of entries) if (kindOf(name)) out.push({ name, blob: new Blob([await B.zipRead(f, e)]) });
      } else if (/\.(tar\.gz|tgz)$/.test(n)) {
        out.push(...await untar(f.stream().pipeThrough(new DecompressionStream("gzip")), (x) => !!kindOf(x)));
      } else if (/\.tar$/.test(n)) {
        out.push(...await untar(f.stream(), (x) => !!kindOf(x)));
      } else if (/\.(tar\.bz2|tar\.xz|7z|rar)$/.test(n)) {
        throw new Error("Waypage can't open that kind of archive. Unpack it on a computer and pick its .ifo, .idx and .dict files.");
      } else if (kindOf(n)) out.push({ name: f.name, blob: f });
    }
    return out;
  }

  function parseIfo(text) {
    const lines = String(text).replace(/^﻿/, "").split(/\r?\n/);
    if (!/^StarDict's (dict|treedict) ifo file/.test(lines[0] || "")) return null;
    const o = {};
    for (const l of lines.slice(1)) { const i = l.indexOf("="); if (i > 0) o[l.slice(0, i).trim()] = l.slice(i + 1).trim(); }
    return o;
  }

  // A dictzip's table of chunks (dictzip's RA field in the gzip header):
  // any piece of the text is read by inflating only its chunks.
  async function dzTable(blob) {
    const h = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
    if (h[0] !== 0x1f || h[1] !== 0x8b || h[2] !== 8) return null;
    const flags = h[3];
    let p = 10;
    if (!(flags & 4)) return null;
    const v = new DataView(h.buffer);
    const xlen = v.getUint16(p, true);
    p += 2;
    const end = p + xlen;
    let table = null;
    for (let q = p; q + 4 <= end;) {
      const len = v.getUint16(q + 2, true);
      if (h[q] === 0x52 && h[q + 1] === 0x41) {
        const chlen = v.getUint16(q + 6, true), count = v.getUint16(q + 8, true);
        const sizes = [];
        for (let i = 0; i < count; i++) sizes.push(v.getUint16(q + 10 + 2 * i, true));
        table = { chlen, sizes };
      }
      q += 4 + len;
    }
    if (!table) return null;
    p = end;
    if (flags & 8) { while (h[p]) p++; p++; }
    if (flags & 16) { while (h[p]) p++; p++; }
    if (flags & 2) p += 2;
    let at = p;
    table.starts = table.sizes.map((s) => { const x = at; at += s; return x; });
    return table;
  }

  // Adds a dictionary from the files picked. The .idx and .syn are kept
  // unpacked; a .dict.dz without dictzip's table is unpacked too, since
  // it can only be read from its start.
  async function add(files) {
    const got = await unpack([...files]);
    const by = (k) => got.filter((x) => kindOf(x.name) === k);
    const ifos = by("ifo");
    if (!ifos.length) throw new Error("Pick the dictionary's .ifo file with its .idx and .dict, or a .zip of them.");
    if (ifos.length > 1) throw new Error("That's more than one dictionary. Add them one at a time.");
    const stem = ifos[0].name.replace(/\.ifo$/i, "").toLowerCase();
    const one = (...kinds) => {
      for (const k of kinds) {
        const all = by(k);
        const same = all.find((x) => x.name.toLowerCase().replace(/\.(idx|idx\.gz|dict|dict\.dz|syn|syn\.dz)$/, "") === stem);
        if (same || all.length === 1) return { kind: k, blob: (same || all[0]).blob };
      }
      return null;
    };
    const ifo = parseIfo(await ifos[0].blob.text());
    if (!ifo) throw new Error("That .ifo isn't a StarDict dictionary.");
    const idx = one("idx", "idx.gz"), dict = one("dict.dz", "dict"), syn = one("syn", "syn.dz");
    if (!idx || !dict) throw new Error("The " + (!idx ? ".idx" : ".dict") + " file is missing. Pick it with the .ifo.");
    if (got.reduce((s, x) => s + x.blob.size, 0) > MAX_BYTES) throw new Error("That dictionary is over 400 MB.");
    const idxBlob = idx.kind === "idx.gz" ? await gunzip(idx.blob) : idx.blob;
    const synBlob = syn ? (syn.kind === "syn.dz" ? await gunzip(syn.blob) : syn.blob) : null;
    let dictBlob = dict.blob, dz = false;
    if (dict.kind === "dict.dz") {
      if (await dzTable(dict.blob)) dz = true;
      else dictBlob = await gunzip(dict.blob);
    }
    // Read through once before it's kept, so a broken one is said now.
    const loaded = await build({ idx: idxBlob, dict: dictBlob, syn: synBlob, dz, ifo });
    if (!loaded.n) throw new Error("That dictionary has no words in it.");
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await idb("readwrite", (s) => {
      s.put(idxBlob, id + "/idx");
      s.put(dictBlob, id + "/dict");
      if (synBlob) s.put(synBlob, id + "/syn");
      s.put({ ifo, dz }, id + "/meta");
    });
    const name = ifo.bookname || ifos[0].name.replace(/\.ifo$/i, "");
    const entry = { id, name, words: loaded.n, bytes: idxBlob.size + dictBlob.size + (synBlob ? synBlob.size : 0) };
    writeList([...readList(), entry]);
    cache.set(id, Promise.resolve(loaded));
    return entry;
  }

  async function remove(id) {
    writeList(readList().filter((d) => d.id !== id));
    cache.delete(id);
    await idb("readwrite", (s) => { for (const k of ["idx", "dict", "syn", "meta"]) s.delete(id + "/" + k); });
  }

  // ---- Looking up ----

  // The index held as its bytes plus where each word starts: a million
  // words stay one buffer and a list of numbers, not a million strings.
  async function build({ idx, dict, syn, dz, ifo }) {
    const bytes = new Uint8Array(await idx.arrayBuffer());
    const wide = ifo.idxoffsetbits === "64";
    const step = wide ? 12 : 8;
    const starts = [];
    for (let p = 0; p < bytes.length;) {
      const z = bytes.indexOf(0, p);
      if (z < 0 || z + 1 + step > bytes.length) break;
      starts.push(p);
      p = z + 1 + step;
    }
    let synIdx = null;
    if (syn) {
      const sb = new Uint8Array(await syn.arrayBuffer());
      const ss = [];
      for (let p = 0; p < sb.length;) {
        const z = sb.indexOf(0, p);
        if (z < 0 || z + 5 > sb.length) break;
        ss.push(p);
        p = z + 5;
      }
      synIdx = { bytes: sb, starts: Uint32Array.from(ss) };
    }
    return { bytes, starts: Uint32Array.from(starts), n: starts.length, wide, dict, dz: dz ? await dzTable(dict) : null,
      types: ifo.sametypesequence || "", syn: synIdx, name: ifo.bookname || "" };
  }
  const cache = new Map();
  function loaded(d) {
    if (!cache.has(d.id)) {
      cache.set(d.id, (async () => {
        const [idx, dict, syn, meta] = await Promise.all(["idx", "dict", "syn", "meta"].map((k) => idb("readonly", (s) => s.get(d.id + "/" + k))));
        if (!idx || !dict || !meta) throw new Error("missing");
        return build({ idx, dict, syn, dz: meta.dz, ifo: meta.ifo });
      })().catch((e) => { cache.delete(d.id); throw e; }));
    }
    return cache.get(d.id);
  }

  // StarDict's own order: ASCII letters without case, then as bytes.
  const fold = (c) => (c >= 65 && c <= 90 ? c + 32 : c);
  function cmp(bytes, at, q) {
    for (let i = 0; ; i++) {
      const a = bytes[at + i], b = i < q.length ? q[i] : 0;
      if (a === 0 && b === 0) return 0;
      const fa = fold(a), fb = fold(b);
      if (fa !== fb) return fa - fb;
    }
  }
  // Every entry whose word is `word` without case, exact case first.
  function find(ix, word) {
    const q = new TextEncoder().encode(word);
    let lo = 0, hi = ix.starts.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(ix.bytes, ix.starts[mid], q) < 0) lo = mid + 1; else hi = mid; }
    const found = [];
    for (let i = lo; i < ix.starts.length && cmp(ix.bytes, ix.starts[i], q) === 0; i++) found.push(i);
    return found;
  }
  const wordOf = (ix, i) => {
    const s = ix.starts[i];
    return new TextDecoder().decode(ix.bytes.subarray(s, ix.bytes.indexOf(0, s)));
  };
  function entryOf(ix, i) {
    const z = ix.bytes.indexOf(0, ix.starts[i]) + 1;
    const v = new DataView(ix.bytes.buffer, ix.bytes.byteOffset);
    const off = ix.wide ? v.getUint32(z) * 2 ** 32 + v.getUint32(z + 4) : v.getUint32(z);
    return { word: wordOf(ix, i), off, size: v.getUint32(z + (ix.wide ? 8 : 4)) };
  }

  // A chunk of a dictzip inflated on its own: dictzip flushes fully
  // between chunks, so each starts afresh, but has no last block, which
  // the browser's inflater wants: an empty one is added.
  const LAST = new Uint8Array([1, 0, 0, 255, 255]);
  async function inflate(raw) {
    for (const tail of [LAST, null]) {
      try {
        const s = new Blob(tail ? [raw, tail] : [raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Uint8Array(await new Response(s).arrayBuffer());
      } catch (e) { /* the last chunk has its own end */ }
    }
    throw new Error("broken chunk");
  }
  async function readData(ix, off, size) {
    if (!ix.dz) return new Uint8Array(await ix.dict.slice(off, off + size).arrayBuffer());
    const { chlen, sizes, starts } = ix.dz;
    const first = Math.floor(off / chlen), last = Math.floor((off + size - 1) / chlen);
    if (last >= sizes.length) throw new Error("past the end");
    const parts = [];
    for (let k = first; k <= last; k++) parts.push(await inflate(new Uint8Array(await ix.dict.slice(starts[k], starts[k] + sizes[k]).arrayBuffer())));
    const all = new Uint8Array(parts.reduce((s, x) => s + x.length, 0));
    let at = 0;
    for (const x of parts) { all.set(x, at); at += x.length; }
    const from = off - first * chlen;
    return all.subarray(from, from + size);
  }
  // An entry's data as its parts: with sametypesequence each part's kind
  // is known and the last runs to the end; without it each part starts
  // with its kind. Lower-case kinds end at a zero byte, upper-case ones
  // start with their length.
  function partsOf(data, types) {
    const out = [], dec = new TextDecoder();
    let p = 0;
    const one = (t, last) => {
      if (t === t.toLowerCase()) {
        let z = last ? data.length : data.indexOf(0, p);
        if (z < 0) z = data.length;
        out.push({ type: t, text: dec.decode(data.subarray(p, z)) });
        p = z + 1;
      } else {
        const n = last ? data.length - p : new DataView(data.buffer, data.byteOffset + p).getUint32(0);
        if (!last) p += 4;
        out.push({ type: t, bytes: n });
        p += n;
      }
    };
    if (types) for (let i = 0; i < types.length && p < data.length; i++) one(types[i], i === types.length - 1);
    else while (p < data.length) { const t = String.fromCharCode(data[p++]); one(t, false); }
    return out.filter((x) => x.text != null && x.text.trim());
  }

  // The forms a selected word is looked for in: as picked, without case,
  // a few English endings, and Hebrew's one-letter prefixes (and, the,
  // in, to, from, that, as).
  function forms(word) {
    const w = String(word || "").normalize("NFC");
    const out = [w];
    const add = (x) => { if (x && x.length > 1 && !out.includes(x)) out.push(x); };
    const lo = w.toLocaleLowerCase();
    add(lo);
    if (/^[a-z'’-]+$/.test(lo)) {
      const s = lo.replace(/['’]s$/, "");
      add(s);
      const end = (re, to) => { if (re.test(s)) add(s.replace(re, to)); };
      end(/ies$/, "y"); end(/ied$/, "y"); end(/(ch|sh|x|ss|s|z|o)es$/, "$1"); end(/s$/, "");
      end(/([^aeiou])\1(ed|ing)$/, "$1"); end(/ed$/, "e"); end(/ed$/, ""); end(/ing$/, "e"); end(/ing$/, "");
      end(/ier$/, "y"); end(/iest$/, "y"); end(/er$/, ""); end(/est$/, ""); end(/ly$/, "");
    }
    if (/^[א-תװ-ײ"'׳״]+$/.test(w) && w.length > 2) {
      if ("והבלמשכ".includes(w[0])) add(w.slice(1));
      if (w.length > 3 && "וש".includes(w[0]) && "הבלמכ".includes(w[1])) add(w.slice(2));
    }
    return out;
  }

  async function lookup(text) {
    const word = String(text || "").replace(/\s+/g, " ").replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "").trim();
    if (!word || word.length > 64) return [];
    const out = [];
    for (const d of readList()) {
      let ix;
      try { ix = await loaded(d); } catch (e) { continue; }
      let hits = [];
      for (const f of forms(word)) {
        hits = find(ix, f);
        if (!hits.length && ix.syn) {
          const q = new TextEncoder().encode(f);
          const sy = ix.syn;
          let lo = 0, hi = sy.starts.length;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(sy.bytes, sy.starts[mid], q) < 0) lo = mid + 1; else hi = mid; }
          for (let i = lo; i < sy.starts.length && cmp(sy.bytes, sy.starts[i], q) === 0; i++) {
            const z = sy.bytes.indexOf(0, sy.starts[i]) + 1;
            const at = new DataView(sy.bytes.buffer, sy.bytes.byteOffset).getUint32(z);
            if (at < ix.n && !hits.includes(at)) hits.push(at);
          }
        }
        if (hits.length) break;
      }
      // The same word as typed first ("Polish" before "polish").
      hits.sort((a, b) => (wordOf(ix, b) === word) - (wordOf(ix, a) === word));
      for (const i of hits.slice(0, 4)) {
        const e = entryOf(ix, i);
        try {
          const parts = partsOf(await readData(ix, e.off, e.size), ix.types);
          if (parts.length) out.push({ dict: d.name, word: e.word, parts });
        } catch (err) { /* a broken entry is left out */ }
      }
    }
    return out;
  }

  // A part as DOM to show. The dictionary's own HTML (or Pango markup) is
  // parsed in an inert document and copied over as new, bare elements
  // from a short list; everything else becomes its text. No attribute
  // survives, so no link, picture, style or script does.
  const KEEP = new Set(["B", "STRONG", "I", "EM", "U", "SUP", "SUB", "BR", "P", "DIV", "LI", "UL", "OL", "DL", "DT", "DD", "BLOCKQUOTE", "SMALL", "BIG", "SPAN", "FONT", "K", "DTRN", "EX", "CO", "ABR", "C"]);
  const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "DL", "DT", "DD", "BLOCKQUOTE"]);
  const AS = { BIG: "strong", FONT: "span", K: "strong", DTRN: "span", EX: "em", CO: "span", ABR: "em", C: "span" };
  function show(part) {
    const box = document.createElement("div");
    box.className = "dict-part dict-" + part.type;
    const text = part.text;
    if (!/[hgx]/.test(part.type)) {
      text.split(/\r?\n/).forEach((line, i) => { if (i) box.append(document.createElement("br")); box.append(line); });
      return box;
    }
    // HTML keeps its own line breaks; Pango markup and XDXF break at \n.
    const src = part.type === "h" ? text : text.replace(/<\/?(def|blockquote)[^>]*>/gi, "\n").replace(/\r?\n/g, "<br>");
    const doc = new DOMParser().parseFromString("<body>" + src, "text/html");
    const copy = (from, to) => {
      for (const n of from.childNodes) {
        if (n.nodeType === 3) { to.append(n.data); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName.toUpperCase();
        if (/^(SCRIPT|STYLE|TEMPLATE|IFRAME|OBJECT|IMG|SVG|MATH|VIDEO|AUDIO)$/.test(tag)) continue;
        if (KEEP.has(tag)) {
          const e = document.createElement(AS[tag] || tag.toLowerCase());
          to.append(e);
          copy(n, e);
        } else {
          if (BLOCK.has(tag)) to.append(document.createElement("br"));
          copy(n, to);
        }
      }
    };
    copy(doc.body, box);
    return box;
  }

  window.Waypage = window.Waypage || {};
  window.Waypage.dict = { list, any, add, remove, lookup, show, forms, partsOf, parseIfo };
})();
