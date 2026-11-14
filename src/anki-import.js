// Waypage: reading a deck from Anki (.apkg) for the Anki extension (2026-11).
// An .apkg is a zip with an Anki collection in it: a SQLite database
// (src/sqlite.js reads it) of notes, cards and the review log. Loaded with
// that extension, not at startup.
//
//   readApkg(file)   parsed, from a picked .apkg; throws an Error saying what's wrong
//   fromDb(db)       parsed, from an open collection (src/sqlite.js)
//   clean(html)      a field's HTML as plain text, with line breaks
//   cloze(text, n)   { front, back } of the n-th blank of a cloze note
//
// parsed = { cards: [{ key, deck, front, back, suspended, made }],
//            log: [{ card, at, grade, ms, was }], skipped }
// Each Anki card becomes one card, keyed "anki<its id>", so the same deck
// read twice, or on two devices, is the same cards. A reversed card asks
// for the back; a cloze card hides its blank. Pictures and sounds aren't
// brought in, so a card with nothing to read on its front is skipped.
// The collection must be in the older layout (Anki's "Support older Anki
// versions" export option); a newer one is zstd-compressed.
(function () {
  const C = window.Waypage;
  const MAX_BYTES = 200 * 1024 * 1024;
  const SEP = "\x1f";

  const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", "#39": "'", "#x27": "'" };
  const decode = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (ENTITIES[k] != null) return ENTITIES[k];
    const n = k[0] === "#" ? (k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10)) : NaN;
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
  });
  // A field's HTML as text: <br> is a line break, a block (div, p, li...) starts
  // and ends a line however many sit together, and the rest of the tags are dropped.
  function clean(html) {
    const text = decode(String(html || "")
      .replace(/\[sound:[^\]]*\]/g, "")
      .replace(/<\s*\/?\s*(?:div|p|li|tr|h[1-6])\b[^>]*>/gi, "\u0001")
      .replace(/<\s*(?:br|hr)\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, "")).replace(/\u0001+/g, "\n");
    return text.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // The n-th blank of {{c1::answer::hint}}s: hidden on the front (the hint
  // shows in its place), every answer on the back.
  function cloze(text, n) {
    const re = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
    return {
      front: String(text).replace(re, (m, k, answer, hint) => (+k === n ? (hint ? "[" + hint + "]" : "[…]") : answer)),
      back: String(text).replace(re, (m, k, answer) => answer),
    };
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const uses = (qfmt, name) => new RegExp("\\{\\{(?:[^}:]+:)*" + esc(name) + "\\}\\}").test(qfmt || "");

  function fromDb(db) {
    let col = null;
    db.rows("col", (id, v) => { if (!col) col = v; });
    let models, decks;
    try { models = JSON.parse(col[9]); decks = JSON.parse(col[10]); } catch (e) { models = null; }
    if (!models || !Object.keys(models).length) throw new Error("This deck is from a newer Anki. In Anki, export it again with “Support older Anki versions” ticked.");

    const notes = new Map();
    db.rows("notes", (id, v) => notes.set(id, { mid: String(v[2]), fields: String(v[6]).split(SEP) }));
    const history = new Map();
    db.rows("revlog", (id, v) => {
      const cid = v[1], ease = v[3], type = v[8];
      // A manual reschedule (ease 0, or type 4) isn't a review.
      if (!(ease >= 1 && ease <= 4) || type === 4) return;
      if (!history.has(cid)) history.set(cid, []);
      history.get(cid).push({ at: id, grade: ease, ms: Math.max(0, v[7] || 0), type });
    });

    const out = { cards: [], log: [], skipped: 0 };
    db.rows("cards", (id, v) => {
      const note = notes.get(v[1]), model = note && models[note.mid];
      if (!model) { out.skipped++; return; }
      const did = String(v[15] || v[2]); // the original deck (odid) when the card is in a filtered one
      const ord = v[3] || 0;
      let front, back;
      if (model.type === 1) {
        const c = cloze(note.fields[0] || "", ord + 1);
        front = clean(c.front);
        back = [clean(c.back), clean(note.fields[1] || "")].filter(Boolean).join("\n");
      } else {
        const names = (model.flds || []).map((f) => f.name);
        const q = ((model.tmpls || [])[ord] || {}).qfmt || "";
        let a = names.findIndex((n) => uses(q, n));
        if (a < 0) a = 0;
        front = clean(note.fields[a] || "");
        back = note.fields.filter((f, i) => i !== a).map(clean).filter(Boolean).join("\n");
      }
      if (!front) { out.skipped++; return; }
      const key = "anki" + id;
      out.cards.push({ key, deck: ((decks[did] || decks[String(v[2])] || {}).name) || "Imported", front, back, suspended: v[7] === -1, made: id });
      const h = history.get(id) || [];
      h.forEach((r, i) => out.log.push({ card: key, at: r.at, grade: r.grade, ms: r.ms, was: i === 0 ? "new" : r.type === 1 ? "review" : r.type === 2 ? "relearn" : "learn" }));
    });
    out.cards.sort((x, y) => x.made - y.made);
    return out;
  }

  async function readApkg(file) {
    const B = C.backup;
    let entries;
    try { entries = await B.zipEntries(file); } catch (e) { throw new Error("That isn't an Anki deck file (.apkg)."); }
    // With "Support older Anki versions" Anki writes the real collection as
    // collection.anki21, beside a stand-in collection.anki2 asking to update.
    const name = entries.has("collection.anki21") ? "collection.anki21" : entries.has("collection.anki21b") ? null : entries.has("collection.anki2") ? "collection.anki2" : undefined;
    if (name === null) throw new Error("This deck is from a newer Anki. In Anki, export it again with “Support older Anki versions” ticked.");
    if (!name) throw new Error("There's no Anki collection in that file.");
    const e = entries.get(name);
    if (e.size > MAX_BYTES) throw new Error("That deck is over 200 MB.");
    return fromDb(C.sqlite.open(await B.zipRead(file, e)));
  }

  C.ankiImport = { readApkg, fromDb, clean, cloze };
})();
