// Waypage: a read-only reader for SQLite database files (2026-11), so the
// Anki extension can open a deck from Anki (.apkg: a zip with a SQLite
// collection in it) without shipping SQLite itself. Loaded with that
// extension, not at startup.
//
//   open(bytes)       a handle for a database held in a Uint8Array; throws an
//                     Error saying what is wrong when it isn't one it can read
//   db.tables()       the names of its tables
//   db.rows(name, fn) fn(rowid, values) for every row, in rowid order. A
//                     column declared INTEGER PRIMARY KEY is the rowid and
//                     is NULL in `values`, as SQLite stores it.
//
// It reads the file format's table b-trees (leaf and interior pages, the
// pages a long row overflows into) and nothing else: no indexes, no views,
// no SQL, UTF-8 text only, no encryption. Values come back as Number
// (integers past 2^53 lose their low bits), string, Uint8Array or null.
(function () {
  const MAGIC = "SQLite format 3\0";
  const dec = new TextDecoder();

  // A varint at bytes[p]: [value, length]. The ninth byte counts all 8 bits.
  function varint(b, p) {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const x = b[p + i];
      v = v * 128 + (x & 127);
      if (!(x & 128)) return [v, i + 1];
    }
    return [v * 256 + b[p + 8], 9];
  }

  // One record: its header says each column's type and size, then the bodies.
  function record(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const [hsize, hn] = varint(buf, 0);
    const types = [];
    for (let p = hn; p < hsize;) { const [t, k] = varint(buf, p); types.push(t); p += k; }
    const row = [];
    let q = hsize;
    for (const t of types) {
      if (t === 0) row.push(null);
      else if (t === 1) { row.push(dv.getInt8(q)); q += 1; }
      else if (t === 2) { row.push(dv.getInt16(q)); q += 2; }
      else if (t === 3) { row.push((dv.getInt8(q) * 65536) + dv.getUint16(q + 1)); q += 3; }
      else if (t === 4) { row.push(dv.getInt32(q)); q += 4; }
      else if (t === 5) { row.push(dv.getInt16(q) * 4294967296 + dv.getUint32(q + 2)); q += 6; }
      else if (t === 6) { row.push(Number(dv.getBigInt64(q))); q += 8; }
      else if (t === 7) { row.push(dv.getFloat64(q)); q += 8; }
      else if (t === 8) row.push(0);
      else if (t === 9) row.push(1);
      else if (t >= 12 && t % 2 === 0) { const n = (t - 12) / 2; row.push(buf.slice(q, q + n)); q += n; }
      else if (t >= 13) { const n = (t - 13) / 2; row.push(dec.decode(buf.subarray(q, q + n))); q += n; }
      else throw new Error("That database has a column type this can't read.");
    }
    return row;
  }

  function open(bytes) {
    if (!(bytes instanceof Uint8Array) || bytes.length < 100 || dec.decode(bytes.subarray(0, 16)) !== MAGIC) throw new Error("That isn't a SQLite database.");
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let size = dv.getUint16(16);
    if (size === 1) size = 65536;
    if (size < 512 || (size & (size - 1))) throw new Error("That database's pages are an odd size.");
    const usable = size - bytes[20];
    const enc = dv.getUint32(56);
    if (enc > 1) throw new Error("That database's text isn't UTF-8.");
    const pages = Math.floor(bytes.length / size);
    const at = (n) => { if (!(n >= 1 && n <= pages)) throw new Error("That database is cut short or damaged."); return (n - 1) * size; };

    // A cell's payload: what is on the page, then the pages it overflows into.
    function payload(p, total) {
      const max = usable - 35, min = Math.floor((usable - 12) * 32 / 255) - 23;
      if (total <= max) return bytes.subarray(p, p + total);
      let local = min + ((total - min) % (usable - 4));
      if (local > max) local = min;
      const out = new Uint8Array(total);
      out.set(bytes.subarray(p, p + local));
      let got = local, next = dv.getUint32(p + local);
      for (let hops = 0; next && got < total; hops++) {
        if (hops > pages) throw new Error("That database is damaged.");
        const base = at(next), n = Math.min(usable - 4, total - got);
        out.set(bytes.subarray(base + 4, base + 4 + n), got);
        got += n;
        next = dv.getUint32(base);
      }
      return out;
    }

    // A table's b-tree from its root page, rows in rowid order.
    function walk(root, fn) {
      let seen = 0;
      const visit = (pg, depth) => {
        if (depth > 32 || ++seen > pages * 2) throw new Error("That database is damaged.");
        const base = at(pg), h = pg === 1 ? base + 100 : base;
        const type = bytes[h], n = dv.getUint16(h + 3);
        if (type === 13) {
          for (let i = 0; i < n; i++) {
            let p = base + dv.getUint16(h + 8 + 2 * i);
            const [total, a] = varint(bytes, p); p += a;
            const [rowid, b] = varint(bytes, p); p += b;
            fn(rowid, record(payload(p, total)));
          }
        } else if (type === 5) {
          for (let i = 0; i < n; i++) visit(dv.getUint32(base + dv.getUint16(h + 12 + 2 * i)), depth + 1);
          visit(dv.getUint32(h + 8), depth + 1);
        } else throw new Error("That database has a page this can't read.");
      };
      visit(root, 0);
    }

    // sqlite_master lives at page 1: type, name, tbl_name, rootpage, sql.
    const master = new Map();
    walk(1, (id, v) => { if (v[0] === "table") master.set(v[1], v[3]); });

    return {
      tables: () => [...master.keys()],
      rows(name, fn) {
        if (!master.has(name)) throw new Error("That database has no " + name + " table.");
        walk(master.get(name), fn);
      },
    };
  }

  window.Waypage = window.Waypage || {};
  window.Waypage.sqlite = { open };
})();
