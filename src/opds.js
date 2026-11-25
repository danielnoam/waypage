// Waypage: OPDS catalogs (the Catalogs extension, 2026-11). A catalog is a
// feed of books a library or book server shares: Calibre, Calibre-Web,
// COPS, Kavita, Komga, Gutenberg and many more. Waypage ships none; the
// person adds the ones they use. Sync carries the list (address, name,
// username) but never a password: a new device asks for it once (Daniel,
// 2026-11-16). Backups leave catalogs out.
//
// Both kinds are read: OPDS 1 (Atom XML) and OPDS 2 (JSON). A feed is
// folders to open (navigation), books to download (acquisition), or both.
//
//   list()                     the catalogs: [{ id, title, url, user, pass }]
//   add(cat) / update(cat) / remove(id)
//   parse(text, url)           -> { title, books, folders, next, search, searchDoc }
//   read(cat, url)             fetches and parses one feed (search template found)
//   find(cat, words)           the catalog's own search, as a feed
//   bytes(cat, url, name)      a book's file, with the catalog's login
//   changed(fn)                fn() when the list changes
//   shared() / mergeIn(doc)    the list as sync sends it (no passwords), and one taken in
(function () {
  const C = (window.Waypage = window.Waypage || {});
  const KEY = "waypage.catalogs";
  const ACQ = "http://opds-spec.org/acquisition";
  const IMG = "http://opds-spec.org/image";
  const THUMB = "http://opds-spec.org/image/thumbnail";
  const ACCEPT = "application/atom+xml;profile=opds-catalog, application/opds+json, application/atom+xml, application/json;q=0.9, */*;q=0.5";
  // The files the Library can bring in from a link, best first.
  const KINDS = [["epub", /epub/i], ["cbz", /cbz|comicbook\+zip|x-cbz/i], ["pdf", /pdf/i]];

  // The list itself is src/servers.js's, shared with WebDAV and Audiobookshelf.
  const clean = (c) => ({ id: c.id || "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: String(c.title || "").trim().slice(0, 80) || host(c.url),
    url: String(c.url || "").trim(), user: String(c.user || ""), pass: String(c.pass || ""), at: Number(c.at) || Date.now() });
  const S = C.servers({ key: KEY, clean, secrets: ["pass"] });
  const { add, remove, shared, mergeIn, changed } = S;
  const list = () => S.all().map((c) => ({ ...c }));
  const update = (c) => S.change(c.id, (x) => clean({ ...x, ...c, at: Date.now() }));

  function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return String(u || ""); } }
  const abs = (href, base) => { try { const u = new URL(href, base); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch (e) { return ""; } };
  const tidy = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const plain = (html) => tidy(new DOMParser().parseFromString("<body>" + String(html || ""), "text/html").body.textContent);
  const fileKind = (type, href) => { for (const [k, re] of KINDS) if (re.test(type || "") || new RegExp("\\." + k + "(\\?|$)", "i").test(href || "")) return k; return ""; };
  const best = (files) => KINDS.map(([k]) => files.find((f) => f.kind === k)).find(Boolean) || null;

  // ---- OPDS 1: Atom ----
  const kids = (node, name) => [...(node ? node.children : [])].filter((n) => n.localName === name);
  const kid = (node, name) => kids(node, name)[0] || null;
  const txt = (node, name) => tidy(kid(node, name) && kid(node, name).textContent);
  const links = (node) => kids(node, "link").map((l) => ({ rel: l.getAttribute("rel") || "", type: l.getAttribute("type") || "", href: l.getAttribute("href") || "", title: l.getAttribute("title") || "" }));

  function parseAtom(doc, base) {
    const feed = doc.documentElement;
    const out = { title: txt(feed, "title"), books: [], folders: [], next: "", search: "", searchDoc: "" };
    for (const l of links(feed)) {
      if (l.rel === "next" && !out.next) out.next = abs(l.href, base);
      if (l.rel === "search") {
        if (/opensearchdescription/i.test(l.type)) out.searchDoc = out.searchDoc || abs(l.href, base);
        else if (/\{searchTerms\}/.test(l.href)) out.search = out.search || new URL(l.href.replace(/\{searchTerms\}/g, "WAYPAGE_Q"), base).href.replace("WAYPAGE_Q", "{searchTerms}");
      }
    }
    for (const e of kids(feed, "entry")) {
      const ls = links(e);
      const title = txt(e, "title");
      if (!title) continue;
      const files = ls.filter((l) => l.rel.startsWith(ACQ) && l.href).map((l) => ({ kind: fileKind(l.type, l.href), url: abs(l.href, base) })).filter((f) => f.kind && f.url);
      const file = best(files);
      const nav = ls.find((l) => /atom\+xml|opds/i.test(l.type) && !l.rel.startsWith(ACQ) && !/image|alternate.*html|related/i.test(l.rel) && l.href)
        || ls.find((l) => (l.rel === "subsection" || l.rel === "") && l.href && !/image|html/i.test(l.type));
      const about = plain(txt(e, "summary") || (kid(e, "content") && kid(e, "content").textContent));
      if (file) {
        const img = ls.find((l) => l.rel === IMG) || ls.find((l) => l.rel === THUMB) || ls.find((l) => /image/.test(l.rel));
        const page = ls.find((l) => l.rel === "alternate" && /html/i.test(l.type));
        const id = txt(e, "id") || file.url;
        out.books.push({ id: "opds:" + id, title: title.slice(0, 160), by: kids(e, "author").map((a) => txt(a, "name")).filter(Boolean).slice(0, 2).join(", "),
          about: about.slice(0, 600), cover: img ? abs(img.href, base) : "", tags: kids(e, "category").map((c) => c.getAttribute("label") || c.getAttribute("term") || "").filter(Boolean).slice(0, 3),
          file: file.url, kind: file.kind, kinds: [...new Set(files.map((f) => f.kind))], url: page ? abs(page.href, base) : file.url });
      } else if (nav) {
        const url = abs(nav.href, base);
        if (url) out.folders.push({ title: title.slice(0, 160), url, about: about.slice(0, 200) });
      }
    }
    return out;
  }

  // ---- OPDS 2: JSON ----
  function parseJson(data, base) {
    const out = { title: tidy(data.metadata && data.metadata.title), books: [], folders: [], next: "", search: "", searchDoc: "" };
    const top = data.links || [];
    const rel = (l, r) => [].concat(l.rel || []).includes(r);
    const nx = top.find((l) => rel(l, "next"));
    if (nx) out.next = abs(nx.href, base);
    const s = top.find((l) => rel(l, "search"));
    if (s && s.href) {
      if (s.templated || /\{[?&]?query/.test(s.href)) out.search = abs(s.href.replace(/\{\?query[^}]*\}/, "?query={searchTerms}").replace(/\{query\}/, "{searchTerms}"), base).replace(/%7BsearchTerms%7D/g, "{searchTerms}");
      else if (/opensearch/i.test(s.type || "")) out.searchDoc = abs(s.href, base);
    }
    const nav = [...(data.navigation || []), ...(data.groups || []).flatMap((g) => g.navigation || [])];
    for (const n of nav) { const url = abs(n.href, base); if (url && n.title) out.folders.push({ title: tidy(n.title).slice(0, 160), url, about: "" }); }
    for (const g of data.groups || []) {
      const self = (g.links || []).find((l) => rel(l, "self"));
      if (g.publications && g.publications.length && self && g.metadata && g.metadata.title) out.folders.push({ title: tidy(g.metadata.title).slice(0, 160), url: abs(self.href, base), about: "" });
    }
    const pubs = [...(data.publications || []), ...(data.groups || []).filter((g) => !(g.links || []).some((l) => rel(l, "self"))).flatMap((g) => g.publications || [])];
    for (const p of pubs) {
      const m = p.metadata || {};
      const files = (p.links || []).filter((l) => [].concat(l.rel || []).some((r) => String(r).startsWith(ACQ))).map((l) => ({ kind: fileKind(l.type, l.href), url: abs(l.href, base) })).filter((f) => f.kind && f.url);
      const file = best(files);
      if (!file || !m.title) continue;
      const names = [].concat(m.author || []).map((a) => (typeof a === "string" ? a : a && a.name)).filter(Boolean);
      const img = (p.images || [])[0];
      const page = (p.links || []).find((l) => /html/i.test(l.type || "") && !String(l.rel || "").startsWith(ACQ));
      out.books.push({ id: "opds:" + (m.identifier || file.url), title: tidy(m.title).slice(0, 160), by: names.slice(0, 2).join(", "), about: plain(m.description).slice(0, 600),
        cover: img ? abs(img.href, base) : "", tags: [].concat(m.subject || []).map((x) => (typeof x === "string" ? x : x && x.name)).filter(Boolean).slice(0, 3),
        file: file.url, kind: file.kind, kinds: [...new Set(files.map((f) => f.kind))], url: page ? abs(page.href, base) : file.url });
    }
    return out;
  }

  class CatalogError extends Error {}
  function parse(text, url) {
    const body = String(text || "").replace(/^﻿/, "").trim();
    if (body[0] === "{") {
      let data;
      try { data = JSON.parse(body); } catch (e) { throw new CatalogError("not a catalog"); }
      return parseJson(data, url);
    }
    const doc = new DOMParser().parseFromString(body, "application/xml");
    if (doc.querySelector("parsererror") || !doc.documentElement || doc.documentElement.localName !== "feed") throw new CatalogError("not a catalog");
    return parseAtom(doc, url);
  }
  // An OpenSearch description's template for Atom results.
  function parseSearchDoc(text, url) {
    const doc = new DOMParser().parseFromString(String(text || ""), "application/xml");
    const urls = [...doc.getElementsByTagNameNS("*", "Url")];
    const u = urls.find((x) => /atom|opds/i.test(x.getAttribute("type") || "")) || urls[0];
    const tpl = u && u.getAttribute("template");
    if (!tpl) return "";
    return new URL(tpl.replace(/\{searchTerms\}/g, "WAYPAGE_Q").replace(/\{[^}]*\?\}/g, ""), url).href.replace("WAYPAGE_Q", "{searchTerms}");
  }

  // ---- Fetching ----
  // The phone fetches natively (no CORS). A browser goes through the fetch
  // proxy for an open catalog, and straight to one with a login or on the
  // home network: a password never goes through the proxy, and the proxy
  // can't reach a home server anyway. Straight means the server has to
  // allow the web copy (CORS), which few do.
  // The login goes only to the catalog's own server: a feed can link
  // folders, books and covers anywhere, and those never get it. The same
  // server moved up to https (a redirect) still does.
  const own = (cat, url) => C.servers.same(cat.url, url);
  const login = (cat, url) => (cat && cat.user && own(cat, url) ? { Authorization: "Basic " + btoa(unescape(encodeURIComponent(cat.user + ":" + cat.pass))) } : {});
  const home = (url) => { try { return /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1|[^.]+$|.*\.(local|lan|home|internal)$)/i.test(new URL(url).hostname); } catch (e) { return false; } };
  const straight = (cat, url) => !C.platform.native && (!!(cat && cat.user && own(cat, url)) || home(url));
  async function get(cat, url) {
    const headers = { Accept: ACCEPT, ...login(cat, url) };
    if (straight(cat, url)) {
      let res;
      try { res = await fetch(url, { headers, credentials: "omit" }); } catch (e) { throw new CatalogError("browser"); }
      return { status: res.status, url: res.url || url, text: await res.text() };
    }
    return C.platform.fetchText(url, { headers });
  }
  async function read(cat, url) {
    let res;
    try { res = await get(cat, url || cat.url); } catch (e) { throw e instanceof CatalogError ? e : new CatalogError("offline"); }
    if (res.status === 401 || res.status === 403) throw new CatalogError("login");
    if (res.status !== 200) throw new CatalogError("HTTP " + res.status);
    const got = parse(res.text, res.url || url || cat.url);
    if (!got.search && got.searchDoc) {
      try { const d = await get(cat, got.searchDoc); if (d.status === 200) got.search = parseSearchDoc(d.text, d.url || got.searchDoc); } catch (e) { /* no search, then */ }
    }
    return got;
  }
  const searchUrl = (tpl, words) => tpl.replace(/\{searchTerms\}/g, encodeURIComponent(String(words || "").trim()));
  async function bytes(cat, url, name) {
    if (straight(cat, url)) {
      let res;
      try { res = await fetch(url, { headers: login(cat, url), credentials: "omit" }); } catch (e) { throw new TypeError("Failed to fetch (browser)"); }
      return { status: res.status, url: res.url || url, type: res.headers.get("Content-Type") || "", blob: await res.blob() };
    }
    return C.platform.fetchBytes(url, name, login(cat, url));
  }

  C.opds = { list, add, update, remove, changed, shared, mergeIn, parse, parseSearchDoc, read, searchUrl, bytes, login, host, home, CatalogError };
})();
