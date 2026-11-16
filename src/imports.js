// Waypage: reading another read-later app's export (1.9.0). Pocket (its
// CSV, and the older ril_export.html), Instapaper (CSV or HTML), Omnivore
// (a zip of metadata JSON), Raindrop (CSV) and Wallabag (its JSON or CSV,
// 1.45.0); any other CSV with a url
// column, and a browser's bookmarks file, as plain lists of links. Only
// the list is read here: app.js saves each link like a pasted one.
//
//   read(file)   null when it isn't an export, else
//                { source, items: [{ url, title, tags, read, at }] }
//   parse(name, text)   the same from text (tests)
(function () {
  const MAX_BYTES = 30 * 1024 * 1024;
  const isWeb = (u) => /^https?:\/\//i.test(String(u || "").trim());

  // RFC 4180-ish: quoted fields, doubled quotes, newlines inside quotes.
  function csvRows(text, sep = ",") {
    const rows = [];
    let row = [], field = "", quoted = false;
    const t = text.replace(/^﻿/, "");
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (quoted) {
        if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += c;
      } else if (c === '"' && field === "") quoted = true;
      else if (c === sep) { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && t[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.length > 1 || row[0] !== "") rows.push(row);
    return rows;
  }

  // A time as Pocket (seconds), Instapaper (seconds) or others (ISO) give it.
  function when(v) {
    const s = String(v || "").trim();
    if (/^\d{9,11}$/.test(s)) return Number(s) * 1000;
    if (/^\d{12,14}$/.test(s)) return Number(s);
    // Wallabag's CSV: 21/03/2024 10:15:00, day first.
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
    if (dmy) return new Date(+dmy[3], dmy[2] - 1, +dmy[1], +(dmy[4] || 0), +(dmy[5] || 0), +(dmy[6] || 0)).getTime();
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }
  const splitTags = (v, by) => String(v || "").split(by).map((x) => x.trim()).filter(Boolean);

  function fromCsv(text) {
    // Wallabag's CSV is split by semicolons.
    const first = text.slice(0, text.search(/\r?\n|$/));
    const rows = csvRows(text, /^\W*title\W*;/i.test(first) && /;\W*url\W*;/i.test(first) ? ";" : ",");
    if (rows.length < 2) return null;
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (...names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0);
    const url = col("url", "link", "href", "address");
    if (url == null) return null;
    const title = col("title", "name");
    const has = (n) => head.includes(n);
    let source = "a list";
    if (has("time_added") && has("status")) source = "Pocket";
    else if (has("selection") && has("folder")) source = "Instapaper";
    else if (has("excerpt") && has("cover")) source = "Raindrop";
    else if (has("mime type") && has("creation date")) source = "Wallabag";
    const tagsAt = col("tags", "labels");
    const statusAt = col("status");
    const folderAt = col("folder");
    const atAt = col("time_added", "timestamp", "created", "saved", "date", "creation date");
    const items = rows.slice(1).map((r) => {
      const folder = folderAt != null ? String(r[folderAt] || "").trim() : "";
      const tags = tagsAt == null ? [] : splitTags(r[tagsAt], source === "Pocket" ? /[|,]/ : /,/);
      // Instapaper's own folders, other than its three, become tags.
      if (source === "Instapaper" && folder && !/^(unread|archive|starred)$/i.test(folder)) tags.push(folder);
      return {
        url: String(r[url] || "").trim(),
        title: title != null ? String(r[title] || "").trim() : "",
        tags,
        read: (statusAt != null && /^archive/i.test(r[statusAt] || "")) || /^archive$/i.test(folder),
        at: atAt != null ? when(r[atAt]) : 0,
      };
    });
    return { source, items };
  }

  // Pocket's and Instapaper's HTML: a heading per list, then its links.
  // A browser's bookmarks file reads the same way, every link to read.
  function fromHtml(text) {
    if (typeof DOMParser === "undefined") return null;
    const doc = new DOMParser().parseFromString(text, "text/html");
    const title = (doc.title || "").trim();
    const source = /pocket/i.test(title) ? "Pocket" : /instapaper/i.test(title) ? "Instapaper" : /bookmark/i.test(title) || /NETSCAPE-Bookmark/i.test(text.slice(0, 300)) ? "bookmarks" : null;
    if (!source) return null;
    const items = [];
    let read = false;
    const walk = doc.body.querySelectorAll("h1, h2, h3, a[href]");
    for (const n of walk) {
      if (n.tagName !== "A") { read = /archive|read archive/i.test(n.textContent); continue; }
      items.push({
        url: n.getAttribute("href").trim(),
        title: n.textContent.trim(),
        tags: splitTags(n.getAttribute("tags"), /,/),
        read: source !== "bookmarks" && read,
        at: when(n.getAttribute("time_added") || n.getAttribute("add_date")),
      });
    }
    return { source, items };
  }

  // Omnivore's export: metadata_*.json files of [{ url, title, labels, state, savedAt }].
  function fromOmnivore(lists) {
    const items = [];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const x of list) {
        if (!x || !x.url) continue;
        items.push({
          url: String(x.url).trim(),
          title: String(x.title || "").trim(),
          tags: (x.labels || []).map((l) => (typeof l === "string" ? l : l && l.name)).filter(Boolean),
          read: /archived/i.test(x.state || "") || Number(x.readingProgress) >= 98,
          at: when(x.savedAt || x.createdAt),
        });
      }
    }
    return { source: "Omnivore", items };
  }

  // Wallabag's JSON export: [{ url, title, tags, is_archived, created_at }],
  // tags as words or { label }, archived as 1 or true.
  const isWallabag = (list) => Array.isArray(list) && list.some((x) => x && typeof x === "object" && "is_archived" in x);
  function fromWallabag(list) {
    const items = [];
    for (const x of list) {
      if (!x || !x.url) continue;
      items.push({
        url: String(x.url).trim(),
        title: String(x.title || "").trim(),
        tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => (typeof t === "string" ? t : t && (t.label || t.slug))).filter(Boolean),
        read: x.is_archived === true || Number(x.is_archived) === 1,
        at: when(x.created_at),
      });
    }
    return { source: "Wallabag", items };
  }

  // Duplicates and anything that isn't a web address go; oldest first, so
  // the newest lands at the top of the library.
  function tidy(found) {
    if (!found) return null;
    const seen = new Set();
    const items = found.items.filter((x) => {
      if (!isWeb(x.url)) return false;
      const k = x.url.replace(/#.*$/, "").replace(/\/$/, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => a.at - b.at);
    return items.length ? { source: found.source, items } : null;
  }

  function parse(name, text) {
    const n = String(name || "").toLowerCase();
    if (/\.csv$/.test(n)) return tidy(fromCsv(text));
    if (/\.html?$/.test(n)) return tidy(fromHtml(text));
    if (/\.json$/.test(n)) {
      let v;
      try { v = JSON.parse(text); } catch (e) { return null; }
      const list = Array.isArray(v) ? v : (v && v.items) || [];
      return tidy(isWallabag(list) ? fromWallabag(list) : fromOmnivore([list]));
    }
    return null;
  }

  async function read(file) {
    if (!file || file.size > MAX_BYTES) return null;
    const name = String(file.name || "").toLowerCase();
    if (/\.zip$/.test(name)) {
      const B = window.Waypage.backup;
      let entries;
      try { entries = await B.zipEntries(file); } catch (e) { return null; }
      const meta = [...entries].filter(([n]) => /(^|\/)metadata_[^/]*\.json$/i.test(n)).map(([, e]) => e);
      if (!meta.length) return null;
      const lists = [];
      for (const e of meta) {
        try { lists.push(JSON.parse(new TextDecoder().decode(await B.zipRead(file, e)))); } catch (x) { /* one bad file */ }
      }
      return tidy(fromOmnivore(lists));
    }
    if (!/\.(csv|html?|json)$/.test(name)) return null;
    let text;
    try { text = await file.text(); } catch (e) { return null; }
    return parse(name, text);
  }

  // Feeds as OPML (1.32.0), the file every RSS reader imports and
  // exports. Only parsed as XML, never shown; an outline inside another
  // takes that one's title as its collection.
  //   opml(text)   null when it isn't one, else [{ url, title, folder }]
  //   readOpml(file)   the same from a file
  //   writeOpml(feeds)   the text of one, from [{ url, title, link, folder }]
  function opml(text) {
    if (!/<opml[\s>]/i.test(String(text || "").slice(0, 4000))) return null;
    let doc;
    try { doc = new DOMParser().parseFromString(text, "application/xml"); } catch (e) { return null; }
    if (doc.getElementsByTagName("parsererror").length) return null;
    const out = [], seen = new Set();
    for (const o of doc.getElementsByTagName("outline")) {
      const url = String(o.getAttribute("xmlUrl") || "").trim();
      if (!isWeb(url) || seen.has(url)) continue;
      seen.add(url);
      const up = o.parentNode && o.parentNode.nodeName === "outline" ? o.parentNode : null;
      out.push({ url, title: String(o.getAttribute("title") || o.getAttribute("text") || "").trim(),
        folder: up ? String(up.getAttribute("title") || up.getAttribute("text") || "").trim() : "" });
    }
    return out;
  }
  async function readOpml(file) {
    if (!file || file.size > MAX_BYTES || !/\.(opml|xml)$/i.test(String(file.name || ""))) return null;
    try { return opml(await file.text()); } catch (e) { return null; }
  }
  const attr = (s) => String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function writeOpml(list) {
    const line = (f) => '    <outline type="rss" text="' + attr(f.title) + '" title="' + attr(f.title) + '" xmlUrl="' + attr(f.url) + '"'
      + (f.link ? ' htmlUrl="' + attr(f.link) + '"' : "") + "/>";
    return '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Waypage feeds</title></head>\n  <body>\n'
      + list.map(line).join("\n") + "\n  </body>\n</opml>\n";
  }

  // A Kindle's highlights (2026-11): its documents/My Clippings.txt, every
  // highlight, note and bookmark made on it, each ended by a line of ten
  // =. An entry is the book's line, "Title (Author)", then a line like
  // "- Your Highlight on page 12 | Location 180-182 | Added on Monday,
  // March 4, 2024 10:15:32 AM", a blank line and the words. The Kindle's
  // own language changes those words, so the parts are found by place: the
  // last is when, the one before it the location. Bookmarks have no words
  // and are left out; a note joins the highlight it was written on.
  //   kindle(text)   null when it isn't one, else
  //                  [{ title, author, marks: [{ text, note, loc, at }], loose }]
  //                  where loose counts notes with no highlight to join
  //   readKindle(file)   the same from a file
  //   kindleMatch(books, pages)   for each book, the page it is, or null
  const NOTE_WORD = /(^|[^\p{L}])(note|notiz|nota|заметка|メモ|笔记)([^\p{L}]|$)/iu;
  const BOOKMARK_WORD = /bookmark|lesezeichen|marcador|signet|segnalibro|bladwijzer|закладка|ブックマーク|书签/i;
  function kindleRange(s) {
    const m = /(\d+)(?:\s*[-–]\s*(\d+))?/.exec(s || "");
    if (!m) return null;
    const a = Number(m[1]);
    let b = m[2] ? Number(m[2]) : a;
    // An older Kindle shortens the end: 1234-36.
    if (b < a && m[2]) b = Number(m[1].slice(0, m[1].length - m[2].length) + m[2]);
    return [a, Math.max(a, b)];
  }
  function kindleWhen(s) {
    const t = String(s || "").replace(/^[^,]*,\s*/, "");
    const v = Date.parse(t);
    return Number.isFinite(v) ? v : 0;
  }
  function kindle(text) {
    const all = String(text || "").replace(/﻿/g, "").replace(/\r\n?/g, "\n");
    if (!/^={10}[ \t]*$/m.test(all)) return null;
    const books = new Map();
    for (const chunk of all.split(/^={10}[ \t]*$/m)) {
      const lines = chunk.replace(/^\s*\n/, "").split("\n");
      if (lines.length < 2 || !/^\s*-\s/.test(lines[1])) continue;
      const info = lines[1].replace(/^\s*-\s*/, "");
      if (BOOKMARK_WORD.test(info)) continue;
      const words = lines.slice(2).join(" ").replace(/\s+/g, " ").trim();
      // "<You have reached the clipping limit for this item>" in its place.
      if (!words || /^<[^<>]*>$/.test(words)) continue;
      const parts = info.split("|").map((x) => x.trim());
      const head = parts.length > 1 ? parts[0] : "";
      const loc = kindleRange(parts.length > 1 ? parts[parts.length - 2] : info) || [0, 0];
      const line = lines[0].trim();
      const by = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(line);
      const title = (by && by[1] ? by[1] : line).trim(), author = by && by[1] ? by[2].trim() : "";
      if (!title) continue;
      const key = title + "\n" + author;
      if (!books.has(key)) books.set(key, { title, author, marks: [], notes: [] });
      const b = books.get(key);
      const one = { loc: loc[0], end: loc[1], at: kindleWhen(parts[parts.length - 1]) };
      if (NOTE_WORD.test(head || info)) b.notes.push({ ...one, text: words });
      else b.marks.push({ ...one, text: words });
    }
    const out = [];
    for (const b of books.values()) {
      // Changing a highlight on the Kindle adds it again: the older one goes
      // when a later one holds its words at the same place.
      const marks = b.marks.filter((m, i) => !b.marks.some((x, j) => j !== i && x.text.includes(m.text)
        && (x.text.length > m.text.length || j > i) && x.loc <= m.end && m.loc <= x.end));
      let loose = 0;
      for (const n of b.notes) {
        const on = marks.filter((m) => n.loc >= m.loc && n.loc <= m.end).pop();
        if (on) on.note = on.note ? on.note + "\n\n" + n.text : n.text;
        else loose++;
      }
      marks.sort((x, y) => x.loc - y.loc || x.end - y.end);
      if (marks.length) out.push({ title: b.title, author: b.author, marks: marks.map(({ end, ...m }) => m), loose });
    }
    return out.length ? out : null;
  }
  async function readKindle(file) {
    if (!file || file.size > MAX_BYTES || !/\.txt$/i.test(String(file.name || ""))) return null;
    try { return kindle(await file.text()); } catch (e) { return null; }
  }
  // A title as compared: no accents, case, series or subtitle.
  const titleKey = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/:|\s[-–—]\s/)[0].replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  // pages: [{ id, title, name, file }], name the file's name; a file wins
  // over a web clip of the same title.
  function kindleMatch(books, pages) {
    const keyed = pages.map((p) => ({ p, k: titleKey(p.title), n: titleKey(String(p.name || "").replace(/\.[^.]+$/, "")) }));
    const find = (k, list) => list.find((x) => x.k === k || x.n === k)
      || (k.length >= 8 ? list.find((x) => (x.k.length >= 8 && (x.k.startsWith(k) || k.startsWith(x.k))) || (x.n.length >= 8 && (x.n.startsWith(k) || k.startsWith(x.n)))) : null);
    return books.map((b) => {
      const k = titleKey(b.title);
      if (!k) return null;
      const got = find(k, keyed.filter((x) => x.p.file)) || find(k, keyed.filter((x) => !x.p.file));
      return got ? got.p.id : null;
    });
  }

  window.Waypage = window.Waypage || {};
  window.Waypage.imports = { read, parse, csvRows, opml, readOpml, writeOpml, kindle, readKindle, kindleMatch };
})();
