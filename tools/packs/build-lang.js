#!/usr/bin/env node
// Builds a language pack for the Anki extension (src/extensions.js): a
// StarDict dictionary, as one .tar.gz that src/dict.js reads, from the
// Wiktionary data kaikki.org publishes as JSON lines (Wiktextract).
//
//   node tools/packs/build-lang.js <kaikki.jsonl[.gz]> <out dir> [--id de-en] [--name "German → English"] [--from German]
//
// Each entry is plain text in a fixed layout, so Look up shows it as it is
// and Anki's Fill reads it back:
//
//   noun · das Haus · pl. Häuser
//   1. house
//   2. (figurative) home
//
// A word's inflected forms (Häuser, ging, gegangen) go in the pack's .syn,
// so a word picked as it stands in a sentence finds its headword. It prints
// the SHA-256 and size of the file to paste into the catalogue, since a
// pack's hash is checked before it is kept. The data is CC BY-SA 4.0
// (Wiktionary); the .ifo says so and Settings › About › Credits names it.
//
// Not part of the app: nothing here ships in the APK or the web copy.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const readline = require("readline");

const ARTICLES = { m: "der", f: "die", n: "das" };
const STRIP_ARTICLE = /^(?:der|die|das|des|dem|den|ein|eine|einen|einem|einer|eines)\s+/i;
// Tags worth keeping in front of a meaning; the rest (grammar, "strong") are noise there.
const KEEP_TAGS = new Set(["archaic", "colloquial", "dated", "derogatory", "dialectal", "figurative", "informal", "literary", "obsolete",
  "offensive", "rare", "regional", "slang", "technical", "vulgar", "Austria", "Switzerland", "Germany", "ironic", "jargon"]);
const SKIP_POS = new Set(["character", "symbol", "punct", "prefix", "suffix", "infix", "circumfix", "interfix", "affix"]);
const MAX_SENSES = 6, MAX_GLOSS = 140, MAX_TEXT = 1200;

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const isForm = (s) => (s.tags || []).some((t) => t === "form-of" || t === "alt-of" || t === "misspelling" || t === "alternative") || !!(s.form_of || s.alt_of);

// The first line: part of speech, the article and word for a noun with its
// plural, or what Wiktionary's own headword line says for the rest.
function header(e) {
  const word = e.word, exp = clean(((e.head_templates || [])[0] || {}).expansion);
  if (e.pos === "noun") {
    const g = new RegExp("^" + esc(word) + "\\s+(m|f|n)\\b").exec(exp);
    const plural = (e.forms || []).find((f) => (f.tags || []).includes("plural") && (f.tags || []).includes("nominative"));
    const pl = plural && clean(plural.form).replace(STRIP_ARTICLE, "");
    const bits = ["noun", g ? ARTICLES[g[1]] + " " + word : word];
    if (pl && pl !== "-" && !/\s/.test(pl)) bits.push("pl. " + pl);
    return bits.join(" · ");
  }
  const rest = exp.startsWith(word) ? exp.slice(word.length).trim().replace(/^\((.*)\)$/, "$1") : "";
  return e.pos + (rest ? " · " + rest : "");
}

function glosses(e) {
  const out = [];
  for (const s of e.senses || []) {
    if (isForm(s)) continue;
    const g = clean((s.glosses || []).slice(-1)[0]);
    if (!g) continue;
    const tags = (s.tags || []).filter((t) => KEEP_TAGS.has(t)).slice(0, 2);
    const line = (tags.length ? "(" + tags.join(", ") + ") " : "") + (g.length > MAX_GLOSS ? g.slice(0, MAX_GLOSS - 1) + "…" : g);
    if (!out.includes(line)) out.push(line);
    if (out.length >= MAX_SENSES) break;
  }
  return out;
}

// One entry's block of text, or null when it is only an inflected form,
// a spelling of another word, or has nothing to say.
function block(e) {
  if (!e.word || !e.pos || SKIP_POS.has(e.pos) || /\s{2,}/.test(e.word)) return null;
  const list = glosses(e);
  if (!list.length) return null;
  return header(e) + "\n" + (list.length === 1 ? list[0] : list.map((g, i) => i + 1 + ". " + g).join("\n"));
}

// The single words an entry's forms are looked up by: articles taken off
// ("des Hauses" gives "Hauses"), phrases and table junk left out.
function formsOf(e) {
  const out = new Set();
  for (const f of e.forms || []) {
    if ((f.tags || []).some((t) => t === "table-tags" || t === "inflection-template" || t === "class")) continue;
    let w = clean(f.form).replace(STRIP_ARTICLE, "");
    if (!w || w === "-" || w === e.word || /[\s,;/()]/.test(w) || w.length > 40) continue;
    out.add(w);
  }
  return out;
}

// StarDict's order, which src/dict.js searches by: ASCII letters without
// case, then the bytes.
const fold = (c) => (c >= 65 && c <= 90 ? c + 32 : c);
function order(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  for (let i = 0; ; i++) {
    const p = i < x.length ? x[i] : 0, q = i < y.length ? y[i] : 0;
    if (p === 0 && q === 0) return Buffer.compare(x, y);
    if (fold(p) !== fold(q)) return fold(p) - fold(q);
  }
}

// Reads JSON lines into { words: Map(word -> [blocks]), forms: Map(form -> Set(headword)) }.
async function collect(lines, opts) {
  const words = new Map(), forms = new Map();
  let seen = 0;
  for await (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch (x) { continue; }
    if (opts.from && e.lang !== opts.from) continue;
    seen++;
    const b = block(e);
    if (!b) continue;
    if (!words.has(e.word)) words.set(e.word, []);
    const list = words.get(e.word);
    if (!list.includes(b)) list.push(b);
    for (const f of formsOf(e)) {
      if (!forms.has(f)) forms.set(f, new Set());
      forms.get(f).add(e.word);
    }
  }
  return { words, forms, seen };
}

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

// The four StarDict files, as { name: Buffer }.
function stardict({ words, forms }, opts) {
  const heads = [...words.keys()].sort(order);
  const index = new Map(heads.map((w, i) => [w, i]));
  const idx = [], dict = [];
  let at = 0;
  for (const w of heads) {
    const text = Buffer.from(words.get(w).join("\n\n").slice(0, MAX_TEXT), "utf8");
    idx.push(Buffer.from(w + "\0", "utf8"), u32(at), u32(text.length));
    dict.push(text);
    at += text.length;
  }
  // A form that is also a headword keeps its own entry (die Bank, not "bank of Bank").
  const syn = [];
  const keys = [...forms.keys()].filter((f) => !words.has(f)).sort(order);
  for (const f of keys) {
    const to = [...forms.get(f)].sort(order)[0];
    syn.push(Buffer.from(f + "\0", "utf8"), u32(index.get(to)));
  }
  const idxBuf = Buffer.concat(idx);
  const ifo = [
    "StarDict's dict ifo file", "version=3.0.0",
    "bookname=" + opts.name, "wordcount=" + heads.length, "synwordcount=" + keys.length, "idxfilesize=" + idxBuf.length,
    "sametypesequence=m", "author=Wiktionary contributors, extracted by Wiktextract (kaikki.org)",
    "description=" + opts.name + ", from Wiktionary (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/",
  ].join("\n") + "\n";
  return { [opts.id + ".ifo"]: Buffer.from(ifo), [opts.id + ".idx"]: idxBuf, [opts.id + ".dict"]: Buffer.concat(dict), [opts.id + ".syn"]: Buffer.concat(syn) };
}

// A minimal ustar archive, gzipped: the only kind of tar this needs.
function tarGz(files) {
  const parts = [];
  for (const [name, data] of Object.entries(files)) {
    const h = Buffer.alloc(512);
    h.write(name, 0, 100, "utf8");
    h.write("0000644\0", 100); h.write("0000000\0", 108); h.write("0000000\0", 116);
    h.write(data.length.toString(8).padStart(11, "0") + "\0", 124);
    h.write("00000000000\0", 136);
    h.write("        ", 148);
    h.write("0", 156);
    h.write("ustar\0" + "00", 257);
    let sum = 0;
    for (const b of h) sum += b;
    h.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
    parts.push(h, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 });
}

async function build(lines, opts) {
  const o = { id: "de-en", name: "German → English", from: "German", ...opts };
  const got = await collect(lines, o);
  const files = stardict(got, o);
  const out = tarGz(files);
  return { out, files, words: got.words.size, forms: got.forms.size, seen: got.seen,
    sha256: crypto.createHash("sha256").update(out).digest("hex"), bytes: out.length };
}

function linesOf(file) {
  const raw = fs.createReadStream(file);
  return readline.createInterface({ input: /\.gz$/.test(file) ? raw.pipe(zlib.createGunzip()) : raw, crlfDelay: Infinity });
}

if (require.main === module) {
  const args = process.argv.slice(2), opt = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) { if (args[i].startsWith("--")) opt[args[i].slice(2)] = args[++i]; else rest.push(args[i]); }
  if (rest.length < 2) { console.error("usage: node tools/packs/build-lang.js <kaikki.jsonl[.gz]> <out dir> [--id de-en] [--name \"German → English\"] [--from German]"); process.exit(1); }
  build(linesOf(rest[0]), opt).then((r) => {
    fs.mkdirSync(rest[1], { recursive: true });
    const id = opt.id || "de-en";
    fs.writeFileSync(path.join(rest[1], id + ".tar.gz"), r.out);
    console.log(`${r.words} words, ${r.forms} forms, from ${r.seen} entries`);
    console.log(`${path.join(rest[1], id + ".tar.gz")}\n  bytes:  ${r.bytes}\n  sha256: ${r.sha256}`);
  });
}

module.exports = { build, collect, stardict, tarGz, order, header, glosses, formsOf };
