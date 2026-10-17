// Waypage: reading another read-later app's export (1.9.0). Pocket (its
// CSV, and the older ril_export.html), Instapaper (CSV or HTML), Omnivore
// (a zip of metadata JSON) and Raindrop (CSV); any other CSV with a url
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
  function csvRows(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    const t = text.replace(/^﻿/, "");
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (quoted) {
        if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
        else field += c;
      } else if (c === '"' && field === "") quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
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
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : 0;
  }
  const splitTags = (v, by) => String(v || "").split(by).map((x) => x.trim()).filter(Boolean);

  function fromCsv(text) {
    const rows = csvRows(text);
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
    const tagsAt = col("tags", "labels");
    const statusAt = col("status");
    const folderAt = col("folder");
    const atAt = col("time_added", "timestamp", "created", "saved", "date");
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
      try { const v = JSON.parse(text); return tidy(fromOmnivore([Array.isArray(v) ? v : v.items || []])); } catch (e) { return null; }
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

  window.Waypage = window.Waypage || {};
  window.Waypage.imports = { read, parse, csvRows, opml, readOpml, writeOpml };
})();
