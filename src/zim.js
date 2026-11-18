// Waypage: Kiwix packs (2026-11). A .zim file is a whole site kept as one
// file (Wikipedia, Wiktionary, Stack Exchange, Gutenberg...), read here in
// place: never copied, synced or backed up. Loaded only when a pack is
// opened or brought in (files.js), like the Anki extension's scripts.
//
// The format (openZIM): an 80-byte header, a list of MIME types, the
// entries' places sorted by path, a title index, and clusters of blobs,
// each cluster stored as it is, xz (older packs) or Zstandard (since
// 2021). Only what a page needs is read: an entry's place, its entry, its
// cluster. Compressed clusters are read whole and the last few kept.
//
//   open(blob)               -> pack, blob anything with slice() and size
//   pack.meta(name)          M/<name> as text ("Title", "Language", ...)
//   pack.icon()              the pack's 48 px picture, bytes or null
//   pack.main()              the main page's path
//   pack.get(path)           { path, title, mime, bytes } after redirects, or null
//   pack.search(words, n)    titles starting with the words: [{ path, title }]
//   pack.resolve(from, href) { path, hash } for a link inside the pack, or null
//   xz(bytes)                an xz stream unpacked (LZMA2 only, as packs use)
(function () {
  const C = (window.Waypage = window.Waypage || {});
  const MAGIC = 72173914;
  const NONE = 0xffffffff;
  const utf8 = new TextDecoder();
  const enc = new TextEncoder();
  // Links are made absolute against this origin, so the page cleaner keeps
  // them; the reader knows them as links inside the open pack.
  const ORIGIN = "https://pack.waypage.invalid/";

  class ZimError extends Error {}

  // ---- Reading the file ----
  // Small reads (pointers, entries) go through 64 KB blocks kept in
  // memory: a title search walks the same few blocks many times, and on
  // the phone every read crosses the bridge.
  const BLOCK = 1 << 16;
  function reader(blob) {
    const size = blob.size;
    const blocks = new Map();
    async function block(n) {
      let got = blocks.get(n);
      if (got) { blocks.delete(n); blocks.set(n, got); return got; }
      got = new Uint8Array(await blob.slice(n * BLOCK, Math.min(size, (n + 1) * BLOCK)).arrayBuffer());
      blocks.set(n, got);
      if (blocks.size > 96) blocks.delete(blocks.keys().next().value);
      return got;
    }
    async function bytes(at, len) {
      if (at < 0 || at + len > size) throw new ZimError("past the end");
      if (len > BLOCK) return new Uint8Array(await blob.slice(at, at + len).arrayBuffer());
      const first = Math.floor(at / BLOCK), last = Math.floor((at + len - 1) / BLOCK);
      if (first === last) { const b = await block(first); return b.subarray(at - first * BLOCK, at - first * BLOCK + len); }
      const out = new Uint8Array(len);
      for (let n = first, put = 0; n <= last; n++) {
        const b = await block(n);
        const from = n === first ? at - first * BLOCK : 0;
        const to = n === last ? at + len - last * BLOCK : b.length;
        out.set(b.subarray(from, to), put);
        put += to - from;
      }
      return out;
    }
    const view = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);
    const u32 = async (at) => view(await bytes(at, 4)).getUint32(0, true);
    const u64 = async (at) => { const v = view(await bytes(at, 8)); return v.getUint32(0, true) + v.getUint32(4, true) * 2 ** 32; };
    return { size, bytes, u32, u64, view };
  }

  // ---- The pack ----
  async function open(blob) {
    const r = reader(blob);
    if (r.size < 80) throw new ZimError("too small");
    const h = r.view(await r.bytes(0, 80));
    if (h.getUint32(0, true) !== MAGIC) throw new ZimError("not a ZIM file");
    const q = (at) => h.getUint32(at, true) + h.getUint32(at + 4, true) * 2 ** 32;
    const head = {
      major: h.getUint16(4, true), minor: h.getUint16(6, true),
      count: h.getUint32(24, true), clusters: h.getUint32(28, true),
      urlPtr: q(32), titlePtr: q(40), clusterPtr: q(48), mimeList: q(56),
      mainPage: h.getUint32(64, true), checksum: q(72),
    };
    // Since 6.1 everything a reader shows is in C, and there are no
    // namespaces in the links; before, articles were in A, pictures in I.
    const flat = head.major >= 6 && head.minor >= 1;
    const mimes = [];
    {
      const b = await r.bytes(head.mimeList, Math.min(4096, head.urlPtr - head.mimeList));
      for (let i = 0; i < b.length;) {
        const end = b.indexOf(0, i);
        if (end <= i) break;
        mimes.push(utf8.decode(b.subarray(i, end)));
        i = end + 1;
      }
    }

    // One entry: its namespace, path, title, and where its blob is (or the
    // entry it sends you to).
    const entries = new Map();
    async function entryAt(at) {
      let b = await r.bytes(at, Math.min(512, r.size - at));
      const v = r.view(b);
      const mime = v.getUint16(0, true);
      const redirect = mime === 0xffff;
      const ns = String.fromCharCode(b[3]);
      let s = redirect ? 12 : 16;
      let u = b.indexOf(0, s), tt = u >= 0 ? b.indexOf(0, u + 1) : -1;
      if (tt < 0) {
        b = await r.bytes(at, Math.min(1 << 16, r.size - at));
        u = b.indexOf(0, s); tt = b.indexOf(0, u + 1);
        if (u < 0 || tt < 0) throw new ZimError("bad entry");
      }
      const url = b.slice(s, u);
      const title = b.subarray(u + 1, tt);
      return {
        ns, url, path: ns + "/" + utf8.decode(url), mime: redirect || mime >= 0xfffd ? "" : mimes[mime] || "",
        redirect: redirect ? v.getUint32(8, true) : null,
        cluster: redirect ? 0 : v.getUint32(8, true), blob: redirect ? 0 : v.getUint32(12, true),
        // An empty title is the path's.
        titleBytes: title.length ? title.slice() : url,
        dead: mime === 0xfffd || mime === 0xfffe,
      };
    }
    async function entry(i) {
      if (i >= head.count) throw new ZimError("no entry " + i);
      let e = entries.get(i);
      if (!e) {
        e = await entryAt(await r.u64(head.urlPtr + 8 * i));
        e.index = i;
        if (entries.size > 2000) entries.clear();
        entries.set(i, e);
      }
      return e;
    }
    const titleOf = (e) => utf8.decode(e.titleBytes);

    // Byte order, as the pack sorts.
    function cmp(a, b) {
      const n = Math.min(a.length, b.length);
      for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
      return a.length - b.length;
    }
    const keyOf = (ns, bytes) => { const k = new Uint8Array(bytes.length + 1); k[0] = ns.charCodeAt(0); k.set(bytes, 1); return k; };

    // An entry by its path ("A/Foo", "C/Foo", "M/Title"): a binary search
    // of the list sorted by namespace and path.
    async function find(path) {
      const ns = path[0], key = keyOf(ns, enc.encode(path.slice(2)));
      let lo = 0, hi = head.count - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const e = await entry(mid);
        const c = cmp(keyOf(e.ns, e.url), key);
        if (!c) return e;
        if (c < 0) lo = mid + 1; else hi = mid - 1;
      }
      return null;
    }

    // ---- Clusters ----
    const unpacked = new Map();
    let zstd = null;
    const loadZstd = () => zstd || (zstd = import(new URL("src/vendor/fzstd.mjs", document.baseURI).href).catch((e) => { zstd = null; throw e; }));
    async function clusterPlace(n) {
      const at = await r.u64(head.clusterPtr + 8 * n);
      const end = n + 1 < head.clusters ? await r.u64(head.clusterPtr + 8 * (n + 1)) : head.checksum || r.size;
      return { at, end };
    }
    async function blobOf(n, i) {
      const { at, end } = await clusterPlace(n);
      const info = (await r.bytes(at, 1))[0];
      const kind = info & 15, wide = info & 16 ? 8 : 4;
      const off = (b, k) => { const v = r.view(b); return wide === 8 ? v.getUint32(k, true) + v.getUint32(k + 4, true) * 2 ** 32 : v.getUint32(k, true); };
      if (kind <= 1) {
        // Stored as it is: just the two offsets and the blob.
        const o = await r.bytes(at + 1 + i * wide, 2 * wide);
        const a = off(o, 0), b = off(o, wide);
        if (b < a) throw new ZimError("bad cluster");
        return (await r.bytes(at + 1 + a, b - a)).slice();
      }
      let data = unpacked.get(n);
      if (!data) {
        const packed = await r.bytes(at + 1, end - at - 1);
        if (kind === 5) data = (await loadZstd()).decompress(packed);
        else if (kind === 4) data = xz(packed);
        else throw new ZimError("this pack uses an old compression Waypage can't read");
        unpacked.set(n, data);
        if (unpacked.size > 6) unpacked.delete(unpacked.keys().next().value);
      }
      const a = off(data, i * wide), b = off(data, (i + 1) * wide);
      if (b < a || b > data.length) throw new ZimError("bad cluster");
      return data.slice(a, b);
    }

    async function follow(e) {
      for (let hops = 0; e && e.redirect != null && hops < 20; hops++) e = await entry(e.redirect);
      return e && e.redirect == null && !e.dead ? e : null;
    }
    async function get(path) {
      const e = await follow(await find(path));
      if (!e) return null;
      return { path: e.path, title: titleOf(e), mime: e.mime, bytes: await blobOf(e.cluster, e.blob) };
    }
    async function meta(name) {
      try { const got = await get("M/" + name); return got ? utf8.decode(got.bytes).trim() : ""; } catch (err) { return ""; }
    }
    async function icon() {
      for (const p of ["M/Illustration_48x48@1", "-/favicon", "I/favicon.png"]) {
        try { const got = await get(p); if (got && got.bytes.length) return got.bytes; } catch (err) { /* the next */ }
      }
      return null;
    }
    async function main() {
      let e = head.mainPage !== NONE ? await follow(await entry(head.mainPage)) : null;
      if (!e) e = await follow(await find("W/mainPage"));
      if (!e) {
        // No main page: the first article.
        const ns = flat ? "C" : "A";
        for (let i = 0; i < Math.min(head.count, 5000) && !e; i++) {
          const x = await entry(i);
          if (x.ns === ns && /html/.test(x.mime)) e = x;
        }
      }
      return e ? e.path : null;
    }

    // ---- Titles ----
    // The articles in title order: since 6.1 a listing of the front
    // articles only (no pictures, no redirects to them... as the pack's
    // maker chose); before, every entry sorted by namespace and title.
    let titles = null;
    async function titleList() {
      if (titles) return titles;
      const listing = flat ? await follow(await find("X/listing/titleOrdered/v1")) : null;
      if (listing) {
        const { at } = await clusterPlace(listing.cluster);
        const info = (await r.bytes(at, 1))[0];
        if ((info & 15) <= 1) {
          const wide = info & 16 ? 8 : 4;
          const o = r.view(await r.bytes(at + 1 + listing.blob * wide, 2 * wide));
          const a = o.getUint32(0, true), b = o.getUint32(wide, true);
          titles = { n: (b - a) / 4, at: async (k) => entry(await r.u32(at + 1 + a + 4 * k)), ns: null };
          return titles;
        }
        const bytes = await blobOf(listing.cluster, listing.blob);
        const v = r.view(bytes);
        titles = { n: bytes.length / 4, at: (k) => entry(v.getUint32(4 * k, true)), ns: null };
        return titles;
      }
      titles = { n: head.count, at: async (k) => entry(await r.u32(head.titlePtr + 4 * k)), ns: flat ? "C" : "A" };
      return titles;
    }
    // The first place in the list whose title is at or after `key`.
    async function lowerBound(list, key) {
      let lo = 0, hi = list.n;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const e = await list.at(mid);
        const k = list.ns ? keyOf(e.ns, e.titleBytes) : e.titleBytes;
        if (cmp(k, key) < 0) lo = mid + 1; else hi = mid;
      }
      return lo;
    }
    const starts = (b, p) => b.length >= p.length && p.every((x, i) => b[i] === x);
    async function search(words, most = 20) {
      const w = String(words || "").replace(/\s+/g, " ").trim();
      if (!w) return [];
      const list = await titleList();
      const cap = (s) => s.charAt(0).toLocaleUpperCase() + s.slice(1);
      const tries = [...new Set([w, cap(w), w.toLocaleLowerCase(), cap(w.toLocaleLowerCase()), w.split(" ").map(cap).join(" "), w.toLocaleUpperCase()])];
      const out = [], seen = new Set();
      for (const s of tries) {
        const p = enc.encode(s);
        const key = list.ns ? keyOf(list.ns, p) : p;
        for (let k = await lowerBound(list, key); k < list.n && out.length < most; k++) {
          const e = await list.at(k);
          if (list.ns ? e.ns !== list.ns : false) break;
          if (!starts(e.titleBytes, p)) break;
          const to = await follow(e);
          if (!to || !/html/.test(to.mime) || seen.has(to.path)) continue;
          seen.add(to.path);
          out.push({ path: to.path, title: titleOf(e) });
        }
        if (out.length >= most) break;
      }
      return out;
    }

    // A link in a page at `from`, as a path in the pack, and the part after #.
    function resolve(from, href) {
      if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(ORIGIN)) return null;
      let u;
      try { u = new URL(href, urlOf(from)); } catch (err) { return null; }
      if (u.origin + "/" !== ORIGIN) return null;
      return { path: pathOf(u.href), hash: u.hash.slice(1) };
    }

    return { head, flat, meta, icon, main, get, search, resolve, find: (p) => find(p).then(follow) };
  }

  // A path as an address under ORIGIN, and back.
  function urlOf(path) {
    return ORIGIN + String(path).split("/").map((s) => encodeURIComponent(s)).join("/");
  }
  function pathOf(href) {
    if (!String(href).startsWith(ORIGIN)) return null;
    const rest = String(href).slice(ORIGIN.length).split(/[?#]/)[0];
    try { return rest.split("/").map((s) => decodeURIComponent(s)).join("/"); } catch (e) { return rest; }
  }

  // ---- xz ----
  // An xz stream of LZMA2 blocks, the way libzim wrote clusters before
  // Zstandard. Checks aren't verified: the cluster's own offsets catch a
  // damaged one. After the LZMA SDK's public-domain LzmaSpec.
  function xz(src) {
    if (src.length < 12 || src[0] !== 0xfd || src[1] !== 0x37 || src[2] !== 0x7a || src[3] !== 0x58 || src[4] !== 0x5a || src[5] !== 0) throw new ZimError("not xz");
    const check = src[7] & 15;
    const checkSize = check === 0 ? 0 : check <= 3 ? 4 : check <= 6 ? 8 : check <= 9 ? 16 : check <= 12 ? 32 : 64;
    let pos = 12;
    const out = { buf: new Uint8Array(Math.max(1 << 16, src.length * 4)), n: 0 };
    const varint = () => { let v = 0, m = 1, b; do { b = src[pos++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
    while (pos < src.length) {
      if (src[pos] === 0) break; // the index: every block is read
      const start = pos, hsize = (src[pos] + 1) * 4;
      const flags = src[pos + 1];
      pos += 2;
      if (flags & 64) varint();
      if (flags & 128) varint();
      const filters = (flags & 3) + 1;
      let dict = 0;
      for (let f = 0; f < filters; f++) {
        const id = varint(), psize = varint();
        if (id !== 0x21) throw new ZimError("xz filter " + id);
        dict = src[pos];
        pos += psize;
      }
      pos = start + hsize;
      pos = lzma2(src, pos, out, dict);
      while (pos & 3) pos++;
      pos += checkSize;
    }
    return out.buf.subarray(0, out.n);
  }

  function lzma2(src, pos, out, dictByte) {
    const d = new Lzma(out);
    for (;;) {
      const c = src[pos++];
      if (c === 0) return pos;
      if (c === 1 || c === 2) {
        const size = ((src[pos] << 8) | src[pos + 1]) + 1;
        pos += 2;
        out.grow(size);
        out.buf.set(src.subarray(pos, pos + size), out.n);
        out.n += size;
        pos += size;
        continue;
      }
      if (c < 0x80) throw new ZimError("bad LZMA2 chunk");
      const unpacked = ((c & 31) << 16) + ((src[pos] << 8) | src[pos + 1]) + 1;
      const packed = ((src[pos + 2] << 8) | src[pos + 3]) + 1;
      pos += 4;
      const reset = (c >> 5) & 3;
      if (reset >= 2) d.props(src[pos++]);
      if (reset >= 1) d.reset();
      d.run(src, pos, unpacked);
      pos += packed;
    }
  }

  // An output that grows as it fills; it is the dictionary too.
  function grower(out) {
    out.grow = (more) => {
      if (out.n + more <= out.buf.length) return;
      let size = out.buf.length * 2;
      while (size < out.n + more) size *= 2;
      const b = new Uint8Array(size);
      b.set(out.buf.subarray(0, out.n));
      out.buf = b;
    };
  }

  const PROB = 1024;
  class Lzma {
    constructor(out) {
      grower(out);
      this.out = out;
      this.lc = 3; this.lp = 0; this.pb = 2;
    }
    props(b) {
      this.lc = b % 9; b = (b / 9) | 0;
      this.lp = b % 5; this.pb = (b / 5) | 0;
    }
    reset() {
      const p = (n) => new Uint16Array(n).fill(PROB);
      this.lit = p(0x300 << (this.lc + this.lp));
      this.isMatch = p(192); this.isRep = p(12); this.isRepG0 = p(12); this.isRepG1 = p(12); this.isRepG2 = p(12); this.isRep0Long = p(192);
      this.posSlot = p(256); this.posSpecial = p(115); this.align = p(16);
      this.len = this.lenCoder(); this.repLen = this.lenCoder();
      this.state = 0; this.reps = [0, 0, 0, 0];
    }
    lenCoder() {
      const p = (n) => new Uint16Array(n).fill(PROB);
      return { choice: p(2), low: p(128), mid: p(128), high: p(256) };
    }
    run(src, pos, size) {
      const out = this.out;
      out.grow(size);
      const buf = out.buf;
      let range = 0xffffffff, code = 0;
      for (let i = 1; i < 5; i++) code = ((code << 8) | src[pos + i]) >>> 0;
      pos += 5;
      const bit = (probs, i) => {
        const p = probs[i];
        const bound = (range >>> 11) * p;
        let b;
        if (code < bound) { range = bound; probs[i] = p + ((2048 - p) >>> 5); b = 0; }
        else { range -= bound; code -= bound; probs[i] = p - (p >>> 5); b = 1; }
        if (range < 0x1000000) { range = (range * 256) >>> 0; code = ((code * 256) + src[pos++]) >>> 0; }
        return b;
      };
      const direct = (n) => {
        let v = 0;
        while (n--) {
          range >>>= 1;
          let b = 0;
          if (code >= range) { code -= range; b = 1; }
          v = ((v << 1) | b) >>> 0;
          if (range < 0x1000000) { range = (range * 256) >>> 0; code = ((code * 256) + src[pos++]) >>> 0; }
        }
        return v;
      };
      const tree = (probs, bits, base = 0) => {
        let m = 1;
        for (let i = 0; i < bits; i++) m = (m << 1) | bit(probs, base + m);
        return m - (1 << bits);
      };
      const reverse = (probs, bits, base = 0) => {
        let m = 1, v = 0;
        for (let i = 0; i < bits; i++) { const b = bit(probs, base + m); m = (m << 1) | b; v |= b << i; }
        return v;
      };
      const length = (lc, posState) => {
        if (!bit(lc.choice, 0)) return tree(lc.low, 3, posState << 3);
        if (!bit(lc.choice, 1)) return 8 + tree(lc.mid, 3, posState << 3);
        return 16 + tree(lc.high, 8);
      };
      const pbMask = (1 << this.pb) - 1, lpMask = (1 << this.lp) - 1;
      const end = out.n + size;
      let n = out.n, state = this.state;
      const reps = this.reps;
      while (n < end) {
        const posState = n & pbMask;
        if (!bit(this.isMatch, (state << 4) + posState)) {
          const prev = n > 0 ? buf[n - 1] : 0;
          const base = 0x300 * (((n & lpMask) << this.lc) + (prev >> (8 - this.lc)));
          let sym = 1;
          if (state >= 7) {
            let match = buf[n - reps[0] - 1];
            do {
              const mb = (match >> 7) & 1;
              match <<= 1;
              const b = bit(this.lit, base + ((1 + mb) << 8) + sym);
              sym = (sym << 1) | b;
              if (mb !== b) break;
            } while (sym < 0x100);
          }
          while (sym < 0x100) sym = (sym << 1) | bit(this.lit, base + sym);
          buf[n++] = sym & 0xff;
          state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
          continue;
        }
        let len;
        if (bit(this.isRep, state)) {
          if (!bit(this.isRepG0, state)) {
            if (!bit(this.isRep0Long, (state << 4) + posState)) {
              state = state < 7 ? 9 : 11;
              buf[n] = buf[n - reps[0] - 1];
              n++;
              continue;
            }
          } else {
            let dist;
            if (!bit(this.isRepG1, state)) dist = reps[1];
            else if (!bit(this.isRepG2, state)) { dist = reps[2]; reps[2] = reps[1]; }
            else { dist = reps[3]; reps[3] = reps[2]; reps[2] = reps[1]; }
            reps[1] = reps[0];
            reps[0] = dist;
          }
          len = length(this.repLen, posState);
          state = state < 7 ? 8 : 11;
        } else {
          reps[3] = reps[2]; reps[2] = reps[1]; reps[1] = reps[0];
          len = length(this.len, posState);
          state = state < 7 ? 7 : 10;
          const slot = tree(this.posSlot, 6, Math.min(len, 3) << 6);
          let dist;
          if (slot < 4) dist = slot;
          else {
            const bits = (slot >>> 1) - 1;
            dist = ((2 | (slot & 1)) << bits) >>> 0;
            if (slot < 14) dist += reverse(this.posSpecial, bits, dist - slot);
            else dist += direct(bits - 4) * 16 + reverse(this.align, 4);
          }
          if (dist === 0xffffffff) break;
          reps[0] = dist;
        }
        len += 2;
        const from = n - reps[0] - 1;
        if (from < 0) throw new ZimError("bad LZMA distance");
        for (let i = 0; i < len && n < end; i++) { buf[n] = buf[from + i]; n++; }
      }
      out.n = n;
      this.state = state;
    }
  }

  C.zim = { open, xz, urlOf, pathOf, ORIGIN, ZimError };
})();
