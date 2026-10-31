// Waypage: your own files (0.31.0, rebuilt in 0.32.0). An EPUB, a Kindle
// book or an FB2 (1.42.0), a Markdown or text file, an HTML page, a CBZ
// comic or a PDF opened from
// the phone becomes a clip: its words rebuilt through save.cleanSaved's
// allowlist (a file is as untrusted as a web page) and read in the same
// sandboxed reader.
//
// Two ways in (0.32.0). **A copy** is a clip like any other: its pictures
// are written beside it and the file itself isn't kept. **Reading from
// where it is** keeps no pictures either: each one is a slot (data-in,
// naming its place in the file) filled from the file when the clip is
// opened, so a 400 MB comic costs a thumbnail. That needs a lasting
// permission on the file (platform.files). Every kind is asked about
// (0.32.2): for a note or a page the words are kept either way, and the
// choice is where it lives, Clips or Files, and whether it syncs.
(function () {
  const C = window.Waypage;
  const S = () => C.store;
  const B = () => C.backup;

  const KINDS = { epub: "EPUB", mobi: "MOBI", azw3: "AZW3", fb2: "FB2", md: "Markdown", txt: "Text", html: "HTML", cbz: "Comic", pdf: "PDF", eml: "Email" };
  // Kinds whose pictures can be left in the file and read as they're needed.
  const LINKABLE = new Set(["epub", "cbz", "pdf"]);
  // Kinds that can be a clip reading from its file: all of them.
  const canLink = (kind) => !!KINDS[kind];
  const EXTS = { epub: "epub", mobi: "mobi", azw: "mobi", prc: "mobi", azw3: "azw3", fb2: "fb2", md: "md", markdown: "md", txt: "txt", text: "txt", html: "html", htm: "html", xhtml: "html", cbz: "cbz", eml: "eml" };
  const PICTURE = /\.(jpe?g|png|gif|webp)$/i;
  const MIME_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

  class FileError extends Error {}
  // What actually went wrong, after the plain words (1.1.1): "damaged"
  // alone didn't say whether the file or the phone's handing it over failed.
  const why = (e) => { const m = String((e && e.message) || "").trim(); return m ? " (" + m.slice(0, 80) + ")" : ""; };

  const extOf = (name) => ((String(name).match(/\.([a-z0-9]{1,8})$/i) || [])[1] || "").toLowerCase();
  const baseName = (name) => String(name).replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_]+/g, " ").trim() || "Untitled";
  const decode = (bytes) => new TextDecoder(bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8").decode(bytes);
  const naturally = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

  // A picture waits for the page behind a stand-in data: address that
  // cleanSaved lets through, and is written out once the page is clean,
  // so a book's pictures are never held as base64 text. `at` is where it
  // sits in the file, for a clip that reads from the file.
  function pictures() {
    const waiting = new Map();
    return {
      add(bytes, at) {
        const type = B().imageType(bytes);
        if (!MIME_EXT[type]) return null;
        const token = "data:" + type + ";base64," + btoa("waypage-" + waiting.size);
        waiting.set(token, { bytes, type, at });
        return token;
      },
      get: (token) => waiting.get(token),
    };
  }

  // What a file is, from its name and first bytes: one of KINDS, "backup"
  // (a Waypage backup zip), "pptx" (a PowerPoint deck, made into a PDF first, 1.47.0), "clip" (a clip sent as a file), "pdf", "zip"
  // (any other zip, or a broken one), or null.
  async function kindOf(file) {
    const head = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const ext = EXTS[extOf(file.name)] || extOf(file.name);
    if (head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46) return "pdf";
    if (String.fromCharCode(...head.subarray(60, 68)) === "BOOKMOBI") return ext === "azw3" ? "azw3" : "mobi";
    if (head[0] === 0x50 && head[1] === 0x4b) {
      let entries;
      try { entries = await B().zipEntries(file); } catch (e) { return "zip"; }
      if (entries.has("library.json")) return "backup";
      if (entries.has("META-INF/container.xml")) return "epub";
      if (entries.has("ppt/presentation.xml")) return "pptx";
      if ([...entries.keys()].some((n) => PICTURE.test(n))) return "cbz";
      if ([...entries.keys()].some((n) => /\.fb2$/i.test(n))) return "fb2";
      return "zip";
    }
    if (ext === "fb2" || /<FictionBook[\s>]/.test(latin1(head))) return "fb2";
    if (ext === "eml" || file.type === "message/rfc822" || (!ext && looksLikeMail(decode(head)))) return "eml";
    if (ext === "html" || /^\s*<(!doctype|html|head|body|meta)/i.test(decode(head))) {
      const text = await file.text();
      return /<meta\s+name="(waypage|carry-on)-page"/i.test(text) ? "clip" : "html";
    }
    if (ext === "md" || ext === "txt") return ext;
    if (/^text\//.test(file.type || "")) return "txt";
    return null;
  }

  // ---- EPUB ----

  const dirOf = (path) => path.replace(/[^/]*$/, "");
  function resolve(from, href) {
    const parts = (dirOf(from) + href.split("#")[0]).split("/");
    const out = [];
    for (const p of parts) {
      if (p === "..") out.pop();
      else if (p && p !== ".") out.push(p);
    }
    try { return decodeURIComponent(out.join("/")); } catch (e) { return out.join("/"); }
  }

  async function fromEpub(file, out) {
    const entries = await B().zipEntries(file);
    const read = async (path) => {
      const e = entries.get(path);
      if (!e) throw new FileError("This EPUB is missing a part (" + path + ").");
      return B().zipRead(file, e);
    };
    const xml = async (path) => new DOMParser().parseFromString(decode(await read(path)), "application/xml");
    const container = await xml("META-INF/container.xml");
    const rootfile = container.getElementsByTagName("rootfile")[0];
    const opfPath = rootfile && rootfile.getAttribute("full-path");
    if (!opfPath) throw new FileError("This EPUB has no table of its parts.");
    const opf = await xml(opfPath);
    const first = (tag) => { const n = opf.getElementsByTagNameNS("*", tag)[0]; return n ? n.textContent.replace(/\s+/g, " ").trim() : ""; };
    const manifest = new Map();
    for (const item of opf.getElementsByTagNameNS("*", "item")) {
      manifest.set(item.getAttribute("id"), { path: resolve(opfPath, item.getAttribute("href") || ""), type: item.getAttribute("media-type") || "", props: item.getAttribute("properties") || "" });
    }
    const spine = [...opf.getElementsByTagNameNS("*", "itemref")]
      .map((r) => manifest.get(r.getAttribute("idref")))
      .filter((it) => it && /html/.test(it.type) && entries.has(it.path));
    if (!spine.length) throw new FileError("This EPUB has no chapters Waypage can read.");
    const chapterOf = new Map(spine.map((it, i) => [it.path, i]));
    const pics = pictures();
    const picAt = new Map();
    const picture = async (path) => {
      if (!picAt.has(path)) {
        let token = null;
        try { if (entries.has(path)) token = pics.add(await read(path), path); } catch (e) { token = null; }
        picAt.set(path, token);
      }
      return picAt.get(path);
    };

    const book = out.createElement("div");
    for (const [i, it] of spine.entries()) {
      const text = decode(await read(it.path));
      let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
      // Named entities (&nbsp;) aren't XML: read it as HTML instead.
      if (doc.getElementsByTagName("parsererror").length || !doc.body) doc = new DOMParser().parseFromString(text, "text/html");
      const body = doc.body;
      if (!body) continue;
      // A cover page drawn as an SVG holding one picture.
      for (const svg of [...body.getElementsByTagNameNS("*", "svg")]) {
        const image = svg.getElementsByTagNameNS("*", "image")[0];
        const href = image && (image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
        if (!href) continue;
        const img = doc.createElementNS(body.namespaceURI || "http://www.w3.org/1999/xhtml", "img");
        img.setAttribute("src", href);
        img.setAttribute("alt", "");
        svg.replaceWith(img);
      }
      for (const img of [...body.getElementsByTagNameNS("*", "img")]) {
        const token = await picture(resolve(it.path, img.getAttribute("src") || ""));
        if (token) img.setAttribute("src", token);
        else img.remove();
      }
      // Ids are made the book's own, and a link to another chapter, or a
      // footnote in one, becomes a jump within the clip.
      const own = (id) => "c" + i + "-" + id;
      for (const n of [...body.querySelectorAll("[id]")]) n.setAttribute("id", own(n.getAttribute("id")));
      for (const a of [...body.getElementsByTagNameNS("*", "a")]) {
        const h = a.getAttribute("href") || "";
        if (/^(https?|mailto):/i.test(h)) continue;
        const [path, frag] = h.split("#");
        const to = path ? chapterOf.get(resolve(it.path, path)) : i;
        if (to == null) a.removeAttribute("href");
        else a.setAttribute("href", "#" + (frag ? "c" + to + "-" + frag : "c" + to));
      }
      const section = out.createElement("section");
      section.id = "c" + i;
      const { root, images } = C.save.cleanSaved(body, out);
      // cleanSaved hands data: pictures back instead of keeping them.
      for (const im of images) im.el.setAttribute("src", im.data);
      section.append(...root.childNodes);
      if (section.textContent.trim() || section.querySelector("img")) book.append(section);
    }
    const coverItem = [...manifest.values()].find((it) => /cover-image/.test(it.props))
      || manifest.get((opf.querySelector('meta[name="cover"]') || { getAttribute: () => null }).getAttribute("content"));
    const cover = coverItem && /^image\//.test(coverItem.type) ? await picture(coverItem.path) : null;
    const creators = [...opf.getElementsByTagNameNS("*", "creator")].map((n) => n.textContent.replace(/\s+/g, " ").trim()).filter(Boolean);
    const spineEl = opf.getElementsByTagNameNS("*", "spine")[0];
    markContents(book, await epubContents(opf, manifest, spineEl, xml, entries).catch(() => []), chapterOf);
    return {
      body: book, pics, cover, title: first("title"), byline: creators.join(", "), lang: first("language"),
      dir: spineEl && spineEl.getAttribute("page-progression-direction") === "rtl" ? "rtl" : "",
    };
  }

  // The book's own table of contents (1.27.2), as [{ title, path, frag,
  // depth }]: EPUB 3's nav document, else EPUB 2's NCX. Many books don't
  // mark chapter titles as headings, so this is what other readers list.
  async function epubContents(opf, manifest, spineEl, xml, entries) {
    const items = [...manifest.values()];
    const nav = items.find((it) => /(^|\s)nav(\s|$)/.test(it.props) && entries.has(it.path));
    const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    const out = [];
    if (nav) {
      const doc = await xml(nav.path);
      const navs = [...doc.getElementsByTagNameNS("*", "nav")];
      const toc = navs.find((n) => /(^|\s)toc(\s|$)/.test(n.getAttributeNS("http://www.idpf.org/2007/ops", "type") || n.getAttribute("epub:type") || "")) || navs[0];
      const walk = (ol, depth) => {
        for (const li of [...(ol ? ol.children : [])]) {
          if (li.localName !== "li") continue;
          const a = [...li.children].find((c) => c.localName === "a" || c.localName === "span");
          const href = a && a.getAttribute("href");
          if (href) out.push({ title: text(a), href: resolveHref(nav.path, href), depth });
          const sub = [...li.children].find((c) => c.localName === "ol");
          if (sub) walk(sub, depth + 1);
        }
      };
      if (toc) walk([...toc.children].find((c) => c.localName === "ol"), 1);
      if (out.length) return out;
    }
    const ncx = manifest.get(spineEl && spineEl.getAttribute("toc")) || items.find((it) => it.type === "application/x-dtbncx+xml");
    if (!ncx || !entries.has(ncx.path)) return out;
    const doc = await xml(ncx.path);
    const walk = (parent, depth) => {
      for (const np of [...parent.children]) {
        if (np.localName !== "navPoint") continue;
        const label = [...np.children].find((c) => c.localName === "navLabel");
        const content = [...np.children].find((c) => c.localName === "content");
        const href = content && content.getAttribute("src");
        if (href) out.push({ title: text(label), href: resolveHref(ncx.path, href), depth });
        walk(np, depth + 1);
      }
    };
    const map = doc.getElementsByTagNameNS("*", "navMap")[0];
    if (map) walk(map, 1);
    return out;
  }
  // Books whose file has no contents to give, so it isn't read for them again.
  const unmarkable = new Set();
  async function epubMarks(blob, entries, body) {
    const xml = async (path) => new DOMParser().parseFromString(decode(await B().zipRead(blob, entries.get(path))), "application/xml");
    const rootfile = (await xml("META-INF/container.xml")).getElementsByTagName("rootfile")[0];
    const opfPath = rootfile && rootfile.getAttribute("full-path");
    if (!opfPath || !entries.has(opfPath)) return;
    const opf = await xml(opfPath);
    const manifest = new Map();
    for (const item of opf.getElementsByTagNameNS("*", "item")) {
      manifest.set(item.getAttribute("id"), { path: resolve(opfPath, item.getAttribute("href") || ""), type: item.getAttribute("media-type") || "", props: item.getAttribute("properties") || "" });
    }
    const spine = [...opf.getElementsByTagNameNS("*", "itemref")].map((r) => manifest.get(r.getAttribute("idref")))
      .filter((it) => it && /html/.test(it.type) && entries.has(it.path));
    const chapterOf = new Map(spine.map((it, i) => [it.path, i]));
    markContents(body, await epubContents(opf, manifest, opf.getElementsByTagNameNS("*", "spine")[0], xml, entries), chapterOf);
  }
  const resolveHref = (from, href) => ({ path: resolve(from, href), frag: href.includes("#") ? href.slice(href.indexOf("#") + 1) : "" });

  // Marks where each entry starts with data-toc (its depth) and data-toc-t
  // (its title), which the reader lists instead of the headings. Entries
  // that land nowhere are left out; fewer than two leaves the headings.
  function markContents(book, entries, chapterOf) {
    const marks = [];
    for (const e of entries) {
      const i = chapterOf.get(e.href.path);
      if (i == null || !e.title) continue;
      let frag = e.href.frag;
      try { frag = decodeURIComponent(frag); } catch (err) { /* as it is */ }
      const id = frag ? "c" + i + "-" + frag : "c" + i;
      const at = book.querySelector('[id="' + id.replace(/["\\]/g, "\\$&") + '"]') || book.querySelector('[id="c' + i + '"]');
      if (!at || marks.some(([m]) => m === at)) continue;
      marks.push([at, e]);
    }
    if (marks.length < 2) return;
    for (const [at, e] of marks) {
      at.setAttribute("data-toc", String(Math.min(3, e.depth)));
      at.setAttribute("data-toc-t", e.title.slice(0, 200));
    }
  }

  // ---- MOBI, AZW and AZW3 (1.42.0) ----
  // Kindle books without DRM, read by foliate-js's mobi.js (src/vendor,
  // MIT): each part it rebuilds is taken like an EPUB chapter, its links
  // and contents pointed at the parts they land in. It only parses: what
  // it gives back goes through cleanSaved like any page. A book with DRM
  // can't be read and says so.
  let mobiLib = null;
  const loadMobi = () => mobiLib || (mobiLib = import(new URL("src/vendor/foliate-mobi.js", document.baseURI).href)
    .catch((e) => { mobiLib = null; throw e; }));
  async function mobiLocked(file) {
    const at = new DataView(await file.slice(78, 82).arrayBuffer()).getUint32(0);
    const rec = await file.slice(at, at + 14).arrayBuffer();
    return rec.byteLength === 14 && new DataView(rec).getUint16(12) !== 0;
  }
  async function fromMobi(file, out) {
    if (await mobiLocked(file)) throw new FileError("This book is locked to Kindle (DRM). Waypage opens Kindle books without DRM.");
    const { MOBI } = await loadMobi();
    const book = await new MOBI({ unzlib: async () => { throw new Error("fonts aren't kept"); } }).open(file);
    try {
      const pics = pictures();
      const picAt = new Map();
      // Its pictures come as blob: addresses of its own, read back as bytes.
      const picture = async (src) => {
        if (!/^blob:/.test(src)) return null;
        if (!picAt.has(src)) {
          let token = null;
          try { token = pics.add(new Uint8Array(await (await fetch(src)).arrayBuffer()), null); } catch (e) { token = null; }
          picAt.set(src, token);
        }
        return picAt.get(src);
      };
      const docs = new Map();
      for (const [i, part] of book.sections.entries()) {
        if (!part.load) continue;
        const text = await (await fetch(await part.load())).text();
        let doc = new DOMParser().parseFromString(text, "application/xhtml+xml");
        if (doc.getElementsByTagName("parsererror").length || !doc.body) doc = new DOMParser().parseFromString(text, "text/html");
        if (doc.body) docs.set(i, doc);
      }
      if (!docs.size) throw new FileError("This book has no text Waypage can read.");
      // Where a link or a contents entry lands: "c<part>-<id>", the id
      // made up when the place has none.
      let made = 0;
      const landing = async (href) => {
        let to = null;
        try { to = await book.resolveHref(href); } catch (e) { to = null; }
        if (!to || !docs.has(to.index)) return null;
        let at = null;
        try { at = to.anchor(docs.get(to.index)); } catch (e) { at = null; }
        if (!at || at === docs.get(to.index).body) return "c" + to.index;
        if (!at.getAttribute("id")) at.setAttribute("id", "wp" + made++);
        return "c" + to.index + "-" + at.getAttribute("id");
      };
      const inside = (h) => /^(filepos|kindle):/i.test(h);
      for (const doc of docs.values()) {
        for (const a of [...doc.body.getElementsByTagNameNS("*", "a")]) {
          const h = a.getAttribute("href") || "";
          if (!inside(h)) continue;
          const to = await landing(h);
          if (to) a.setAttribute("data-to", to); else a.removeAttribute("href");
        }
      }
      const toc = [];
      const walkToc = async (items, depth) => {
        for (const it of items || []) {
          const to = it.href ? await landing(it.href) : null;
          if (to && it.label) toc.push({ to, title: it.label.replace(/\s+/g, " ").trim(), depth });
          await walkToc(it.subitems, depth + 1);
        }
      };
      await walkToc(book.toc, 1);
      const body = out.createElement("div");
      for (const [i, doc] of docs) {
        const root = doc.body;
        for (const svg of [...root.getElementsByTagNameNS("*", "svg")]) {
          const image = svg.getElementsByTagNameNS("*", "image")[0];
          const href = image && (image.getAttribute("href") || image.getAttributeNS("http://www.w3.org/1999/xlink", "href"));
          if (!href) continue;
          const img = doc.createElementNS(root.namespaceURI || "http://www.w3.org/1999/xhtml", "img");
          img.setAttribute("src", href);
          img.setAttribute("alt", "");
          svg.replaceWith(img);
        }
        for (const img of [...root.getElementsByTagNameNS("*", "img")]) {
          const token = await picture(img.getAttribute("src") || "");
          if (token) img.setAttribute("src", token); else img.remove();
        }
        for (const n of [...root.querySelectorAll("[id]")]) n.setAttribute("id", "c" + i + "-" + n.getAttribute("id"));
        for (const a of [...root.getElementsByTagNameNS("*", "a")]) {
          if (a.hasAttribute("data-to")) { a.setAttribute("href", "#" + a.getAttribute("data-to")); a.removeAttribute("data-to"); }
          else if (!/^(https?|mailto):/i.test(a.getAttribute("href") || "")) a.removeAttribute("href");
        }
        const section = out.createElement("section");
        section.id = "c" + i;
        const { root: clean, images } = C.save.cleanSaved(root, out);
        for (const im of images) im.el.setAttribute("src", im.data);
        section.append(...clean.childNodes);
        if (section.textContent.trim() || section.querySelector("img")) body.append(section);
      }
      tocMarks(body, toc);
      let cover = null;
      try {
        const blob = await book.getCover();
        if (blob) cover = pics.add(new Uint8Array(await blob.arrayBuffer()), null);
      } catch (e) { cover = null; }
      const meta = book.metadata || {};
      const authors = [].concat(meta.author || []).map((a) => String(typeof a === "string" ? a : (a && a.name) || "").trim()).filter(Boolean);
      return { body, pics, cover, title: String(meta.title || "").trim(), byline: authors.join(", "),
        lang: String([].concat(meta.language || [])[0] || ""), dir: book.dir === "rtl" ? "rtl" : "" };
    } finally {
      try { book.destroy(); } catch (e) { /* gone */ }
    }
  }
  // The contents as data-toc marks, as markContents does for an EPUB.
  function tocMarks(body, toc) {
    const marks = [];
    for (const e of toc) {
      const at = body.querySelector('[id="' + e.to.replace(/["\\]/g, "\\$&") + '"]');
      if (!at || marks.some(([m]) => m === at)) continue;
      marks.push([at, e]);
    }
    if (marks.length < 2) return;
    for (const [at, e] of marks) {
      at.setAttribute("data-toc", String(Math.min(3, e.depth)));
      at.setAttribute("data-toc-t", e.title.slice(0, 200));
    }
  }

  // ---- FB2 (1.42.0) ----
  // FictionBook, the XML book many Russian and Eastern European libraries
  // give out, often zipped (.fb2.zip). Its tags become HTML's, its
  // pictures are its base64 <binary> parts, and its notes come last.
  async function fb2Bytes(file) {
    const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (head[0] !== 0x50 || head[1] !== 0x4b) return new Uint8Array(await file.arrayBuffer());
    const entries = await B().zipEntries(file);
    const name = [...entries.keys()].find((n) => /\.fb2$/i.test(n));
    if (!name) throw new FileError("There's no FB2 book in this zip.");
    return B().zipRead(file, entries.get(name));
  }
  // An XML file in the encoding its first line names (windows-1251 is common).
  function xmlText(bytes) {
    const enc = (latin1(bytes.subarray(0, 200)).match(/encoding=["']([\w.:-]+)["']/i) || [])[1];
    if (bytes[0] === 0xef || bytes[0] === 0xfe || bytes[0] === 0xff || !enc) return decode(bytes);
    try { return new TextDecoder(enc).decode(bytes); } catch (e) { return decode(bytes); }
  }
  const FB2_TAGS = { p: "p", emphasis: "em", strong: "strong", strikethrough: "del", sub: "sub", sup: "sup", code: "code",
    epigraph: "blockquote", cite: "blockquote", poem: "div", stanza: "p", "text-author": "p", subtitle: "h4",
    table: "table", tr: "tr", td: "td", th: "th" };
  function fromFb2(bytes, out) {
    const doc = new DOMParser().parseFromString(xmlText(bytes), "application/xml");
    const book = doc.documentElement;
    if (doc.getElementsByTagName("parsererror").length || !book || book.localName !== "FictionBook") throw new FileError("This FB2 book is damaged.");
    const kids = (n, name) => (n ? [...n.children].filter((c) => c.localName === name) : []);
    const one = (n, ...path) => path.reduce((at, name) => kids(at, name)[0], n);
    const words = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    const hrefOf = (n) => n.getAttributeNS("http://www.w3.org/1999/xlink", "href") || n.getAttribute("l:href") || n.getAttribute("href") || "";
    const pics = pictures();
    const bin = new Map();
    for (const b of kids(book, "binary")) {
      const id = b.getAttribute("id");
      if (!id || bin.has(id)) continue;
      let token = null;
      try { token = pics.add(Uint8Array.from(atob(b.textContent.replace(/\s+/g, "")), (c) => c.charCodeAt(0)), null); } catch (e) { token = null; }
      bin.set(id, token);
    }
    const picture = (n) => {
      const token = bin.get(hrefOf(n).replace(/^#/, ""));
      if (!token) return null;
      const img = out.createElement("img");
      img.setAttribute("src", token);
      img.setAttribute("alt", n.getAttribute("alt") || "");
      return img;
    };
    const toc = [];
    function walk(from, to, depth) {
      for (const n of [...from.childNodes]) {
        if (n.nodeType === 3) { to.append(out.createTextNode(n.data)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.localName;
        let el = null;
        if (tag === "section") {
          el = out.createElement("section");
          walk(n, el, depth + 1);
          const title = words(one(n, "title"));
          if (title && n.getAttribute("id") == null) el.setAttribute("id", "s" + toc.length);
          if (title) toc.push({ el, title, depth: depth + 1 });
        } else if (tag === "title") {
          el = out.createElement("h" + Math.min(6, Math.max(2, depth + 1)));
          kids(n, "p").forEach((p, i) => { if (i) el.append(out.createElement("br")); walk(p, el, depth); });
        } else if (tag === "image") {
          el = picture(n);
        } else if (tag === "empty-line") {
          el = out.createElement("br");
        } else if (tag === "v") {
          walk(n, to, depth);
          to.append(out.createElement("br"));
          continue;
        } else if (tag === "a") {
          el = out.createElement("a");
          const h = hrefOf(n);
          if (h.startsWith("#")) el.setAttribute("href", "#f-" + h.slice(1));
          else if (/^(https?|mailto):/i.test(h)) el.setAttribute("href", h);
          walk(n, el, depth);
        } else if (FB2_TAGS[tag]) {
          el = out.createElement(FB2_TAGS[tag]);
          if (tag === "text-author") { const em = out.createElement("em"); walk(n, em, depth); el.append(em); }
          else walk(n, el, depth);
          for (const a of ["colspan", "rowspan"]) if (n.getAttribute(a)) el.setAttribute(a, n.getAttribute(a));
        } else {
          walk(n, to, depth);
          continue;
        }
        if (!el) continue;
        if (n.getAttribute("id")) el.setAttribute("id", "f-" + n.getAttribute("id"));
        to.append(el);
      }
    }
    const body = out.createElement("div");
    const bodies = kids(book, "body");
    for (const [i, b] of bodies.entries()) {
      const part = out.createElement("section");
      if (i && b.getAttribute("name") === "notes" && !one(b, "title")) {
        const h = out.createElement("h2");
        h.textContent = "Notes";
        part.append(h);
      }
      walk(b, part, i ? 1 : 0);
      body.append(part);
    }
    if (toc.length >= 2) {
      for (const { el, title, depth } of toc) {
        el.setAttribute("data-toc", String(Math.min(3, Math.max(1, depth))));
        el.setAttribute("data-toc-t", title.slice(0, 200));
      }
    }
    const info = one(book, "description", "title-info");
    const authors = kids(info, "author").map((a) => ["first-name", "middle-name", "last-name"].map((k) => words(one(a, k))).filter(Boolean).join(" ") || words(one(a, "nickname"))).filter(Boolean);
    const coverImg = one(info, "coverpage", "image");
    const cover = coverImg ? bin.get(hrefOf(coverImg).replace(/^#/, "")) || null : null;
    return { body, pics, cover, title: words(one(info, "book-title")), byline: authors.join(", "), lang: words(one(info, "lang")) };
  }

  // ---- Markdown and text ----

  const escHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  // The Markdown most notes use: headings, paragraphs, lists, quotes,
  // code, rules, links, pictures by address, emphasis. Raw HTML in it is
  // shown as text.
  function inline(s) {
    const code = [];
    s = escHtml(s).replace(/`([^`]+)`/g, (m, c) => "\u0000" + (code.push("<code>" + c + "</code>") - 1) + "\u0000");
    s = s.replace(/!\[([^\]]*)\]\((\S+?)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, alt, src) => '<img alt="' + alt + '" src="' + src + '">')
      .replace(/\[([^\]]+)\]\((\S+?)(?:\s+&quot;[^)]*&quot;)?\)/g, (m, t, href) => '<a href="' + href + '">' + t + "</a>")
      .replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, '<a href="$1">$1</a>')
      .replace(/(\*\*|__)(?=\S)(.+?\S)\1/g, "<strong>$2</strong>")
      .replace(/(^|[^\w*])\*(?=\S)(.+?\S)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_(?=\S)(.+?\S)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~(?=\S)(.+?\S)~~/g, "<del>$1</del>");
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => code[i]);
  }

  function markdown(text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let para = [];
    const flush = () => { if (para.length) out.push("<p>" + inline(para.join(" ")) + "</p>"); para = []; };
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^\s*$/.test(line)) { flush(); continue; }
      if ((m = line.match(/^\s{0,3}(```|~~~)/))) {
        flush();
        const body = [];
        while (++i < lines.length && !lines[i].trim().startsWith(m[1])) body.push(lines[i]);
        out.push("<pre><code>" + escHtml(body.join("\n")) + "</code></pre>");
        continue;
      }
      if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/))) { flush(); out.push("<h" + m[1].length + ">" + inline(m[2]) + "</h" + m[1].length + ">"); continue; }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); out.push("<hr>"); continue; }
      if (/^\s{0,3}>/.test(line)) {
        flush();
        const quote = [];
        for (; i < lines.length && /^\s{0,3}>/.test(lines[i]); i++) quote.push(lines[i].replace(/^\s{0,3}>\s?/, ""));
        i--;
        out.push("<blockquote>" + markdown(quote.join("\n")) + "</blockquote>");
        continue;
      }
      if ((m = line.match(/^(\s*)([-*+]|\d{1,9}[.)])\s+/))) {
        flush();
        const ordered = /\d/.test(m[2]);
        const items = [];
        for (; i < lines.length; i++) {
          const l = lines[i];
          const im = l.match(/^\s*([-*+]|\d{1,9}[.)])\s+(.*)$/);
          if (im && /\d/.test(im[1]) === ordered) items.push(im[2]);
          else if (items.length && /^\s{2,}\S/.test(l)) items[items.length - 1] += " " + l.trim();
          else break;
        }
        i--;
        const start = ordered ? parseInt(m[2], 10) : 1;
        out.push((ordered ? (start !== 1 ? '<ol start="' + start + '">' : "<ol>") : "<ul>")
          + items.map((t) => "<li>" + inline(t.replace(/^\[[ xX]\]\s+/, "")) + "</li>").join("") + (ordered ? "</ol>" : "</ul>"));
        continue;
      }
      // A heading underlined with === or ---.
      if (para.length === 0 && i + 1 < lines.length && /^\s{0,3}(=+|-+)\s*$/.test(lines[i + 1])) {
        out.push(/=/.test(lines[i + 1]) ? "<h1>" + inline(line.trim()) + "</h1>" : "<h2>" + inline(line.trim()) + "</h2>");
        i++;
        continue;
      }
      para.push(line.trim());
    }
    flush();
    return out.join("\n");
  }

  // Plain text: blank lines part paragraphs. A paragraph whose lines were
  // broken to fit a width (a Project Gutenberg book) flows again; one of
  // short lines (a poem, an address) keeps its breaks.
  function plain(text) {
    return text.replace(/\r\n?/g, "\n").split(/\n\s*\n/).map((p) => p.replace(/^\n+|\s+$/g, "")).filter(Boolean).map((p) => {
      const lines = p.split("\n");
      const wrapped = lines.length > 1 && lines.slice(0, -1).every((l) => l.length >= 45 && l.length <= 100);
      return "<p>" + (wrapped ? escHtml(lines.map((l) => l.trim()).join(" ")) : lines.map((l) => escHtml(l)).join("<br>")) + "</p>";
    }).join("\n");
  }

  // ---- HTML ----

  // A web page saved to the phone: the article, as saving reads one, or
  // the whole body when there's no article to find. Pictures by address
  // stay as links; ones beside the file on the phone can't come along.
  function fromHtml(text, name) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    let body = doc.body;
    let title = (doc.querySelector("title") || {}).textContent || "";
    if (typeof window.Readability === "function") {
      try {
        const article = new window.Readability(doc.cloneNode(true), { charThreshold: 500, keepClasses: false }).parse();
        if (article && article.textContent && article.textContent.trim().length >= 500) {
          body = new DOMParser().parseFromString(article.content, "text/html").body;
          title = article.title || title;
        }
      } catch (e) { /* the whole body, then */ }
    }
    return { body, title: title.replace(/\s+/g, " ").trim() || baseName(name), lang: doc.documentElement.getAttribute("lang") || "" };
  }

  // ---- Email (1.10.0) ----
  // A saved message (.eml, as Apple Mail, Outlook or Gmail on a computer
  // download it): its HTML part, or its text, with the pictures it carries
  // inside (cid: addresses) kept like an EPUB's. Its subject is the title,
  // its sender the byline. The HTML goes through fromHtml and cleanSaved
  // like any page: mail is as untrusted as the web.

  const looksLikeMail = (s) => /^[A-Za-z-]+:[^\n]*\n/.test(s) && /^from:/im.test(s) && /^(subject|date|mime-version|message-id|received):/im.test(s);
  const latin1 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return s; };
  const binBytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
  function inCharset(bin, charset) {
    const bytes = binBytes(bin);
    try { return new TextDecoder((charset || "utf-8").trim(), { fatal: !charset }).decode(bytes); } catch (e) { /* below */ }
    try { return new TextDecoder("windows-1252").decode(bytes); } catch (e) { return bin; }
  }
  function unQuoted(s) {
    return s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
  }
  // A header's words: raw 8-bit as UTF-8 when it is, and =?charset?B|Q?…?= words.
  function headerWords(v) {
    return inCharset(v || "").replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (m, cs, enc, t) => {
      try {
        const bin = enc.toLowerCase() === "b" ? atob(t.replace(/[^A-Za-z0-9+/=]/g, "")) : unQuoted(t.replace(/_/g, " "));
        return inCharset(bin, cs.replace(/\*.*$/, ""));
      } catch (e) { return m; }
    }).replace(/\s+/g, " ").trim();
  }
  function mimePart(bin) {
    const cut = bin.search(/\r?\n\r?\n/);
    const head = (cut < 0 ? bin : bin.slice(0, cut)).replace(/\r?\n[ \t]+/g, " ");
    const body = cut < 0 ? "" : bin.slice(cut).replace(/^\r?\n\r?\n/, "");
    const headers = {};
    for (const line of head.split(/\r?\n/)) {
      const m = line.match(/^([^:\s]+):\s*(.*)$/);
      if (m && !(m[1].toLowerCase() in headers)) headers[m[1].toLowerCase()] = m[2];
    }
    return { headers, body };
  }
  function param(v, name) {
    const m = String(v || "").match(new RegExp(";\\s*" + name + "\\*?=\\s*(\"([^\"]*)\"|[^;\\s]*)", "i"));
    if (!m) return "";
    const got = m[2] != null ? m[2] : m[1];
    const ext = got.match(/^([^']*)'[^']*'(.*)$/);
    if (ext) { try { return decodeURIComponent(ext[2]); } catch (e) { return ext[2]; } }
    return got;
  }
  function partBytes(part) {
    const cte = (part.headers["content-transfer-encoding"] || "").trim().toLowerCase();
    if (cte === "base64") { try { return atob(part.body.replace(/[^A-Za-z0-9+/=]/g, "")); } catch (e) { return ""; } }
    if (cte === "quoted-printable") return unQuoted(part.body);
    return part.body;
  }
  function walkMail(part, got, depth) {
    if (depth > 12) return;
    const ct = part.headers["content-type"] || "text/plain";
    const type = ct.split(";")[0].trim().toLowerCase();
    const attached = /^\s*attachment/i.test(part.headers["content-disposition"] || "");
    if (type.startsWith("multipart/")) {
      const b = param(ct, "boundary");
      if (!b) return;
      const esc = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pieces = part.body.split(new RegExp("(?:^|\\r?\\n)--" + esc + "(?:--)?[ \\t]*(?=\\r?\\n|$)"));
      for (const piece of pieces.slice(1)) {
        if (!piece.trim()) continue;
        walkMail(mimePart(piece.replace(/^\r?\n/, "")), got, depth + 1);
      }
      return;
    }
    if (type === "message/rfc822") {
      const inner = mimePart(partBytes(part));
      walkMail(inner, got, depth + 1);
      return;
    }
    if (/^image\//.test(type)) {
      const id = (part.headers["content-id"] || "").replace(/^\s*<|>\s*$/g, "").trim();
      const where = (part.headers["content-location"] || "").trim();
      if (id || where) got.images.set(id || where, binBytes(partBytes(part)));
      return;
    }
    if (attached) return;
    if (type === "text/html" && got.html == null) got.html = inCharset(partBytes(part), param(ct, "charset"));
    else if (type === "text/plain" && got.text == null) got.text = inCharset(partBytes(part), param(ct, "charset"));
  }
  // A picture a few pixels across that the message doesn't carry is a
  // tracker (1.29.1): loaded from the sender's server, it tells them the
  // message was opened, when, and from where.
  const pixel = (img) => {
    const style = img.getAttribute("style") || "";
    const side = (a) => {
      const v = parseFloat(img.getAttribute(a) || (style.match(new RegExp("(?:^|;)\\s*" + a + "\\s*:\\s*([\\d.]+)px", "i")) || [])[1]);
      return isFinite(v) ? v : null;
    };
    const w = side("width"), h = side("height");
    return (w != null && w <= 3) || (h != null && h <= 3) || /display\s*:\s*none/i.test(style);
  };
  function fromEmail(bytes, name) {
    const top = mimePart(latin1(bytes));
    const got = { html: null, text: null, images: new Map() };
    walkMail(top, got, 0);
    const subject = headerWords(top.headers.subject);
    const from = headerWords(top.headers.from);
    const sender = (from.match(/^\s*"?([^"<]*?)"?\s*</) || [])[1] || from.replace(/[<>]/g, "");
    const when = Date.parse((top.headers.date || "").replace(/\s*\([^)]*\)\s*$/, ""));
    if (got.html == null && got.text == null) throw new FileError("There's nothing to read in this email.");
    const pics = pictures();
    const doc = new DOMParser().parseFromString(got.html != null ? got.html : plain(got.text), "text/html");
    for (const img of doc.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src");
      const key = /^cid:/i.test(src) ? decodeURIComponent(src.slice(4)) : src;
      const b = got.images.get(key);
      const token = b && b.length && pics.add(b);
      if (token) img.setAttribute("src", token);
      else if (/^cid:/i.test(src) || pixel(img)) img.remove();
    }
    const page = fromHtml("<!doctype html><title></title>" + doc.body.outerHTML, name);
    const meta = [sender, isFinite(when) ? new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : ""].filter(Boolean).join(", ");
    return { body: page.body, title: subject || page.title, byline: meta, lang: page.lang, pics };
  }

  // ---- CBZ ----

  async function fromCbz(file, out, name) {
    const entries = await B().zipEntries(file);
    const names = [...entries.keys()].filter((n) => PICTURE.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n)).sort(naturally);
    if (!names.length) throw new FileError("There are no pictures in this comic.");
    let title = "";
    const info = [...entries.keys()].find((n) => /(^|\/)ComicInfo\.xml$/i.test(n));
    if (info) {
      try {
        const x = new DOMParser().parseFromString(decode(await B().zipRead(file, entries.get(info))), "application/xml");
        const get = (t) => ((x.getElementsByTagName(t)[0] || {}).textContent || "").trim();
        title = get("Title") || [get("Series"), get("Number") && "#" + get("Number")].filter(Boolean).join(" ");
      } catch (e) { title = ""; }
    }
    const root = out.createElement("div");
    root.className = "co-body co-comic";
    const panels = names.map((n) => {
      const img = out.createElement("img");
      img.setAttribute("alt", "");
      root.append(img);
      return { img, at: n, read: () => B().zipRead(file, entries.get(n)) };
    });
    return { root, panels, title: title || baseName(name) };
  }

  // ---- PDF ----

  // A PDF through the sandbox (pdf.js in src/pdf.js): its words as
  // paragraphs, or its pages as pictures when it holds no words (a scan).
  async function fromPdf(file, out, onProgress, pics) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let got;
    try {
      got = await C.pdf.read(bytes, (done, total, stage) => onProgress && onProgress(done, total, stage === "pages" ? "pictures" : "words"),
        pics.link ? { sizes: true, maxDraw: 1, cover: true } : { cover: true });
    } catch (e) {
      throw new FileError(/password|encrypt/i.test(String(e.message)) ? "This PDF is locked with a password."
        : "Waypage couldn't read this PDF. It may be damaged." + why(e));
    }
    const root = out.createElement("div");
    root.className = "co-body";
    // Each page's first element, for the PDF's bookmarks (1.27.2).
    const at = new Map();
    if (got.images && got.sizes) {
      // A scan kept in its file: a slot the size of each page, drawn when
      // it's reached; only the first is drawn now, for the card.
      root.classList.add("co-comic");
      for (const [i, [w, h]] of got.sizes.entries()) {
        const img = out.createElement("img");
        img.setAttribute("alt", "");
        img.setAttribute("width", w);
        img.setAttribute("height", h);
        root.append(img);
        at.set(i + 1, img);
        if (i === 0 && got.images[0]) await pics.put(img, got.images[0], "image/jpeg", false, "page:1");
        else { img.setAttribute("data-in", "page:" + (i + 1)); pics.n++; }
      }
      if (!pics.n) throw new FileError("There's nothing to read in this PDF.");
    } else if (got.images) {
      root.classList.add("co-comic");
      for (const [i, b] of got.images.entries()) {
        const img = out.createElement("img");
        img.setAttribute("alt", "");
        root.append(img);
        at.set(i + 1, img);
        await pics.put(img, b, "image/jpeg", false, "page:" + (i + 1));
        if (onProgress) onProgress(i + 1, got.images.length, "pictures");
      }
      if (!pics.n) throw new FileError("There's nothing to read in this PDF.");
    } else {
      let page = 1;
      for (const b of got.blocks || []) {
        if (b.t === "page") { page = b.n; continue; }
        const el = out.createElement(b.t === "h" ? "h2" : "p");
        el.textContent = b.s;
        root.append(el);
        if (!at.has(page)) at.set(page, el);
      }
      if (!root.textContent.trim()) throw new FileError("There's nothing to read in this PDF.");
      // The first page as the card's picture (1.2.1).
      if (got.cover) await pics.cover(got.cover, "image/jpeg");
    }
    const marks = [];
    for (const o of got.outline || []) {
      let n = o.page;
      while (n > 1 && !at.has(n)) n--;
      const el = at.get(n);
      if (el && !marks.some(([m]) => m === el)) marks.push([el, o]);
    }
    if (marks.length > 1) {
      for (const [el, o] of marks) {
        el.setAttribute("data-toc", String(o.depth));
        el.setAttribute("data-toc-t", o.title);
        el.setAttribute("data-toc-p", String(o.page));
      }
    }
    return { root, title: got.title || baseName(file.name), byline: got.byline, scan: !!got.images };
  }

  // ---- Reading a clip that lives in its file ----

  // The clip's page, ready to read from the file it lives in. Throws
  // FileError when the file has moved or been deleted.
  // A PDF with words read from where it is opens as its printed pages
  // (1.1.3), drawn as they're reached like a scan's: its layout, figures
  // and code are the book. Its words stay in the clip for search, and
  // Show as text (`view: "text"`) sets them in Waypage's own type.
  // A book's or comic's pictures stay in their slots (1.29.0) and are
  // read from the file as the reader comes near them (fillNear), as a
  // PDF's pages are drawn: before, every picture was read and decoded
  // before the first page showed, and a 400 MB comic sat whole in memory.
  const printed = (meta) => !!(meta && meta.link && meta.file && meta.file.kind === "pdf" && !meta.comic && meta.view !== "text");
  async function openLinked(meta) {
    closeHeld();
    const html = await S().readPage(meta.id);
    const isPdf = meta.file.kind === "pdf";
    const slotted = /\sdata-in="/.test(html);
    // A book added before 1.27.2 gets its own contents from the file.
    const unmarked = meta.file.kind === "epub" && !/\sdata-toc="/.test(html) && !unmarkable.has(meta.id);
    if (!slotted && !printed(meta) && !unmarked) return html;
    let blob;
    try {
      blob = await C.platform.files.blob(meta.link, meta.file.size);
    } catch (e) {
      // Only for the contents: a file out of reach still opens.
      if (!slotted && !printed(meta)) return html;
      throw new FileError("Waypage can't find " + meta.file.name + " any more. It may have been moved or deleted.");
    }
    if (isPdf) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return fillPdf(doc, [...doc.querySelectorAll("img[data-in]")], blob, meta, printed(meta) ? doc.querySelector(".co-body") : null);
    }
    const entries = await B().zipEntries(blob).catch(() => null);
    if (!entries) {
      if (!slotted) return html;
      throw new FileError("Waypage can't read " + meta.file.name + " any more.");
    }
    if (slotted) held = { zip: { blob, entries }, urls: new Map(), busy: false, frame: null };
    if (!unmarked) return html;
    // The whole page is parsed only for that: it's a 3 MB book.
    const doc = new DOMParser().parseFromString(html, "text/html");
    const body = doc.querySelector(".co-body");
    if (body) await epubMarks(blob, entries, body).catch(() => {});
    if (!body || !body.querySelector("[data-toc]")) { unmarkable.add(meta.id); return html; }
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  // Fills the picture slots within a screen and a half of what the reader
  // shows from the book's or comic's file, nearest first, and lets go of
  // those more than six screens away (their slot comes back). A slot
  // whose picture the file hasn't is marked missing.
  async function fillNear(frame, onFirst) {
    const h = held;
    const win = frame && frame.contentWindow;
    if (!h || !h.zip || !win || !win.document) { if (onFirst) onFirst(); return; }
    h.frame = frame;
    if (h.busy) { if (onFirst) onFirst(); return; }
    h.busy = true;
    try {
      for (;;) {
        if (held !== h) return;
        const tall = win.innerHeight || 800;
        let next = null, best = Infinity;
        for (const img of win.document.querySelectorAll("img[data-in], img[data-at]")) {
          // Measuring a slot in a chapter the reader skips (reader.js,
          // chunkUp) lays that chapter out: the chapter's own box says
          // how far it is, and only one within reach is measured itself.
          const chunk = img.closest(".co-lazy");
          let r = (chunk || img).getBoundingClientRect();
          let away = r.bottom < 0 ? -r.bottom : r.top > tall ? r.top - tall : 0;
          if (chunk && away <= tall * 6) {
            r = img.getBoundingClientRect();
            away = r.bottom < 0 ? -r.bottom : r.top > tall ? r.top - tall : 0;
          }
          const at = img.getAttribute("data-at");
          if (at != null) {
            if (away > tall * 6) {
              const u = h.urls.get(at);
              if (u) { URL.revokeObjectURL(u); h.urls.delete(at); }
              img.removeAttribute("src");
              img.setAttribute("data-in", at);
              img.removeAttribute("data-at");
            }
          } else if (away <= tall * 1.5 && away < best) { next = img; best = away; }
        }
        if (!next) return;
        const at = next.getAttribute("data-in");
        const e = h.zip.entries.get(at);
        let url = null;
        try {
          if (e) {
            const bytes = await B().zipRead(h.zip.blob, e);
            url = URL.createObjectURL(new Blob([bytes], { type: B().imageType(bytes) || "image/jpeg" }));
          }
        } catch (err) { url = null; }
        if (held !== h) { if (url) URL.revokeObjectURL(url); return; }
        next.removeAttribute("data-in");
        if (!url) { next.className = "co-missing"; continue; }
        h.urls.set(at, url);
        next.setAttribute("data-at", at);
        next.setAttribute("src", url);
        if (onFirst) { onFirst(); onFirst = null; }
      }
    } finally { h.busy = false; if (onFirst) onFirst(); }
  }

  // A scan read from its PDF (1.1.0): the PDF is kept open and each page
  // drawn as the reader comes near it (drawNear), so a long one opens at
  // once. Until then a page is a blank of its own size, so the place you
  // were is where you left it. A PDF with words keeps those words in the
  // clip and has no slots.
  let held = null;
  const blank = (w, h) => "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"/>');
  async function fillPdf(doc, slots, blob, meta, into) {
    closeHeld();
    let pdf;
    try {
      pdf = await C.pdf.open(blob);
    } catch (e) {
      throw new FileError("Waypage can't read " + meta.file.name + " any more.");
    }
    const h = held = { pdf, urls: new Map(), busy: false, frame: null };
    // A PDF from before 1.2.1 has no card picture: its first page, once
    // the reader is up (1.2.4), so the open isn't held for it.
    if (!meta.thumb) {
      setTimeout(async () => {
        if (held !== h) return;
        try { meta.thumb = await thumbnail(meta.id, await pdf.draw(1, THUMB_WIDTH), "image/jpeg"); if (onCover) onCover(meta); } catch (e) { /* no cover */ }
      }, 1500);
    }
    // The first pages' sizes are known now; a page past them takes the
    // size of the last one known until its own arrives (pdf.onSizes), as
    // nearly every PDF's pages are one size.
    const sizeOf = (n) => pdf.sizes[n - 1] || pdf.sizes[pdf.sizes.length - 1] || null;
    if (into) {
      // The bookmarks go onto their printed pages.
      const marks = [...into.querySelectorAll("[data-toc][data-toc-p]")];
      into.classList.add("co-comic", "co-printed");
      slots = Array.from({ length: pdf.count || pdf.pages }, (_, i) => {
        const img = doc.createElement("img");
        img.setAttribute("alt", "Page " + (i + 1));
        img.setAttribute("data-in", "page:" + (i + 1));
        return img;
      });
      into.replaceChildren(...slots);
      for (const m of marks) {
        const slot = slots[Number(m.getAttribute("data-toc-p")) - 1];
        if (!slot || slot.hasAttribute("data-toc")) continue;
        slot.setAttribute("data-toc", m.getAttribute("data-toc"));
        slot.setAttribute("data-toc-t", m.getAttribute("data-toc-t"));
      }
    }
    for (const img of slots) {
      const n = Number(String(img.getAttribute("data-in")).replace(/^page:/, ""));
      const size = sizeOf(n);
      if (!size) { img.className = "co-missing"; continue; }
      const w = Number(img.getAttribute("width")) || size[0], hh = Number(img.getAttribute("height")) || size[1];
      img.setAttribute("width", w);
      img.setAttribute("height", hh);
      img.setAttribute("src", blank(w, hh));
      img.setAttribute("data-page", n);
      if (!pdf.sizes[n - 1]) img.setAttribute("data-guess", "");
      img.removeAttribute("data-in");
    }
    // A PDF added before 1.27.2 gets its bookmarks from the file (1.28.0).
    if (!doc.querySelector("[data-toc]") && !unmarkable.has(meta.id)) {
      const pages = into ? slots : [...doc.querySelectorAll(".co-body > img")];
      const marks = [];
      for (const o of await pdf.outline().catch(() => [])) {
        const at = pages[Math.min(o.page, pages.length) - 1];
        if (at && !marks.some(([m]) => m === at)) marks.push([at, o]);
      }
      if (marks.length > 1) {
        for (const [at, o] of marks) { at.setAttribute("data-toc", String(o.depth)); at.setAttribute("data-toc-t", o.title); }
      } else unmarkable.add(meta.id);
    }
    pdf.onSizes = () => { if (held === h && h.frame) fixSizes(h); };
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }
  // Slots that were given a guessed size take their page's real one.
  function fixSizes(h) {
    const win = h.frame && h.frame.contentWindow;
    if (!win || !win.document) return;
    for (const img of win.document.querySelectorAll("img[data-page][data-guess]")) {
      const n = Number(img.getAttribute("data-page"));
      const s = h.pdf.sizes[n - 1];
      if (!s) continue;
      img.removeAttribute("data-guess");
      if (Number(img.getAttribute("width")) === s[0] && Number(img.getAttribute("height")) === s[1]) continue;
      img.setAttribute("width", s[0]);
      img.setAttribute("height", s[1]);
      if (!h.urls.has(String(n))) img.setAttribute("src", blank(s[0], s[1]));
    }
  }
  // Told when a PDF opened without a card picture has one (app.js).
  let onCover = null;
  function closeHeld() {
    if (!held) return;
    if (held.pdf) held.pdf.close();
    for (const u of held.urls.values()) URL.revokeObjectURL(u.url || u);
    for (const u of (held.thumbs || new Map()).values()) u.then((x) => x && URL.revokeObjectURL(x));
    held = null;
  }
  // Draws the pages within a screen and a half of what the reader `frame`
  // shows, nearest first, and lets go of those more than six screens away.
  // A page is drawn at the width it is shown (a zoomed one wider, 1.2.2)
  // and drawn again when that changes by a quarter or more. `onFirst` is
  // told when the first page is on screen (1.29.0): opening waits for
  // that, not for the screen and a half.
  async function drawNear(frame, onFirst) {
    const h = held;
    if (h && h.zip) return fillNear(frame, onFirst);
    const win = frame && frame.contentWindow;
    if (!h || !win || !win.document) { if (onFirst) onFirst(); return; }
    h.frame = frame;
    if (h.busy) { if (onFirst) onFirst(); return; }
    h.busy = true;
    try {
      for (;;) {
        if (held !== h) return;
        const tall = win.innerHeight || 800;
        const dpr = win.devicePixelRatio || 1;
        const pages = [...win.document.querySelectorAll("img[data-page]")];
        let next = null, best = Infinity, width = 0;
        for (const img of pages) {
          const r = img.getBoundingClientRect();
          const away = r.bottom < 0 ? -r.bottom : r.top > tall ? r.top - tall : 0;
          const n = img.getAttribute("data-page");
          const want = Math.min(2400, Math.max(200, Math.round((r.width || win.innerWidth || 400) * dpr)));
          const has = h.urls.get(n);
          if (has && away > tall * 6) {
            URL.revokeObjectURL(has.url);
            h.urls.delete(n);
            img.setAttribute("src", blank(img.getAttribute("width"), img.getAttribute("height")));
          } else if ((!has || Math.abs(has.width - want) > want / 4) && away <= tall * 1.5 && away < best) { next = img; best = away; width = want; }
        }
        if (!next) return;
        const n = next.getAttribute("data-page");
        let bytes;
        try { bytes = await h.pdf.draw(Number(n), width); } catch (e) { return; }
        if (held !== h) return;
        const was = h.urls.get(n);
        if (was) URL.revokeObjectURL(was.url);
        const url = URL.createObjectURL(new Blob([bytes], { type: "image/jpeg" }));
        h.urls.set(n, { url, width });
        next.setAttribute("src", url);
        if (onFirst) { onFirst(); onFirst = null; }
      }
    } finally { h.busy = false; if (onFirst) onFirst(); }
  }

  // A page drawn small for the rail beside a PDF (1.5.1), kept while the
  // PDF is open. The pages being read are drawn first: a thumbnail waits
  // while drawNear is busy.
  function pageThumb(n, width) {
    const h = held;
    if (!h) return Promise.resolve(null);
    h.thumbs = h.thumbs || new Map();
    if (!h.thumbs.has(n)) {
      h.thumbs.set(n, (async () => {
        while (h.busy && held === h) await new Promise((r) => setTimeout(r, 120));
        if (held !== h) return null;
        try { return URL.createObjectURL(new Blob([await h.pdf.draw(n, width)], { type: "image/jpeg" })); } catch (e) { h.thumbs.delete(n); return null; }
      })());
    }
    return h.thumbs.get(n);
  }

  // ---- Bringing one in ----

  // Writes a page's pictures one at a time: into images/ in the app, into
  // the page as data: addresses in a browser. The first becomes the card's
  // picture unless it's told which is the cover.
  function picturesOut(id, link) {
    const res = { bytes: 0, thumb: null, n: 0, link: !!link };
    // A card picture that isn't in the clip (a PDF's first page, 1.2.1).
    res.cover = async (b, type) => { if (!res.thumb) res.thumb = await thumbnail(id, b, type); };
    // Writes one picture, or leaves a slot for it when the clip reads from
    // the file. The card's own picture is always written, so the library
    // needs nothing but itself.
    res.put = async (img, b, type, cover, at) => {
      const first = cover || !res.thumb;
      res.n++;
      if (link && at) {
        img.removeAttribute("src");
        img.setAttribute("data-in", at);
        // Its size from the file's header (1.29.0), so the slot takes the
        // picture's room before it's read, and a comic's pages don't all
        // sit at one spot waiting to be filled at once.
        const size = imageSize(b);
        if (size && !img.hasAttribute("width")) { img.setAttribute("width", size[0]); img.setAttribute("height", size[1]); }
        if (first) res.thumb = await thumbnail(id, b, type);
        return;
      }
      const rel = "images/" + (res.n - 1) + "." + MIME_EXT[type];
      if (C.platform.native) {
        await S().writeBytes(id, rel, b);
        img.setAttribute("src", rel);
      } else {
        img.setAttribute("src", "data:" + type + ";base64," + S().toBase64(b));
      }
      res.bytes += b.length;
      if (first) {
        res.thumb = rel;
        if (!C.platform.native) await S().writeThumb(id, img.getAttribute("src"));
      }
    };
    return res;
  }

  // A picture's width and height from its first bytes: PNG, GIF, and a
  // JPEG's frame header; null for WebP and anything else.
  function imageSize(b) {
    if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) return [(b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0];
    if (b[0] === 0x47 && b[1] === 0x49 && b.length > 10) return [b[6] | b[7] << 8, b[8] | b[9] << 8];
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length && b[i] === 0xff) {
        const m = b[i + 1];
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b[i + 7] << 8 | b[i + 8], b[i + 5] << 8 | b[i + 6]];
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
        i += 2 + (b[i + 2] << 8 | b[i + 3]);
      }
    }
    return null;
  }

  // The card's picture for a clip that keeps none: the first picture,
  // redrawn small so a comic page doesn't cost a megabyte.
  const THUMB_WIDTH = 480;
  async function thumbnail(id, bytes, type) {
    const rel = "images/cover." + MIME_EXT[type];
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type }));
      const w = Math.min(THUMB_WIDTH, bmp.width);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = Math.max(1, Math.round(bmp.height * w / bmp.width));
      canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close();
      if (!C.platform.native) {
        await S().writeThumb(id, canvas.toDataURL("image/jpeg", 0.8));
        return "images/cover.jpg";
      }
      const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.8));
      await S().writeBytes(id, "images/cover.jpg", new Uint8Array(await blob.arrayBuffer()));
      return "images/cover.jpg";
    } catch (e) {
      if (!C.platform.native) { await S().writeThumb(id, "data:" + type + ";base64," + S().toBase64(bytes)); return rel; }
      await S().writeBytes(id, rel, bytes);
      return rel;
    }
  }

  // The clip's body from the file: { root, title, byline, lang, dir },
  // its pictures handed to `pics` as they're found.
  async function content(file, kind, out, pics, onProgress) {
    if (kind === "cbz") {
      const got = await fromCbz(file, out, file.name);
      // Each page straight to its file, so a big comic never sits in memory.
      for (const [i, p] of got.panels.entries()) {
        let b = null;
        try { b = await p.read(); } catch (e) { b = null; }
        const type = b && B().imageType(b);
        if (MIME_EXT[type]) await pics.put(p.img, b, type, false, p.at);
        else p.img.remove();
        if (onProgress) onProgress(i + 1, got.panels.length, "pictures");
      }
      if (!pics.n) throw new FileError("There are no pictures in this comic Waypage can show.");
      return { root: got.root, title: got.title };
    }
    let got;
    if (kind === "pdf") return fromPdf(file, out, onProgress, pics);
    if (kind === "epub") got = await fromEpub(file, out);
    else if (kind === "mobi" || kind === "azw3") got = await fromMobi(file, out);
    else if (kind === "fb2") got = fromFb2(await fb2Bytes(file), out);
    else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = kind === "eml" ? "" : decode(bytes);
      if (kind === "eml") got = fromEmail(bytes, file.name);
      else if (kind === "html") got = fromHtml(text, file.name);
      else {
        const body = new DOMParser().parseFromString(kind === "md" ? markdown(text) : plain(text), "text/html").body;
        const h = kind === "md" && body.querySelector("h1");
        if (h && h === body.firstElementChild) h.remove();
        got = { body, title: h ? h.textContent.trim() : baseName(file.name) };
      }
    }
    const { root, images } = C.save.cleanSaved(got.body, out);
    if (!root.textContent.trim() && !root.querySelector("img")) throw new FileError("There's nothing to read in this file.");
    // The book's stand-ins are swapped for their bytes, and any real data:
    // picture (an HTML file can carry them) decoded.
    const list = [];
    for (const { el: img, data: src } of images) {
      const kept = got.pics && got.pics.get(src);
      if (kept) { list.push({ img, ...kept, cover: src === got.cover }); continue; }
      const b = Uint8Array.from(atob(src.split(",")[1].replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      const type = B().imageType(b);
      if (MIME_EXT[type]) list.push({ img, bytes: b, type });
      else img.remove();
    }
    // A cover the book never shows on a page still makes the card.
    const cover = got.cover && !list.some((x) => x.cover) && got.pics.get(got.cover);
    if (cover) list.unshift({ img: out.createElement("img"), ...cover, cover: true });
    for (const [i, x] of list.entries()) {
      await pics.put(x.img, x.bytes, x.type, x.cover, x.at);
      if (onProgress) onProgress(i + 1, list.length, "pictures");
    }
    return { root, title: got.title, byline: got.byline, lang: got.lang, dir: got.dir };
  }

  // Makes a clip of `file`, `kind` from kindOf. `link` is the lasting
  // permission on the file (platform.files) when the clip is to read from
  // it; its pictures then stay in the file. Resolves to the clip's index
  // entry, or { already } when `has(name, size)` says it's here.
  async function bring(file, kind, { has, onProgress, link = null, title = "" } = {}) {
    if (!KINDS[kind]) throw new FileError("Waypage can't open this kind of file.");
    if (has && has(file.name, file.size)) return { already: true };
    if (!file.size) throw new FileError("Waypage got nothing from " + file.name + ". If it's in a cloud folder, make it available offline and try again.");
    const id = C.save.newId();
    const out = document.implementation.createHTMLDocument("");
    const ext = kind === "epub" || kind === "cbz" || !EXTS[extOf(file.name)] ? kind : extOf(file.name);
    const pics = picturesOut(id, link && LINKABLE.has(kind));
    let got;
    try {
      got = await content(file, kind, out, pics, onProgress);
    } catch (e) {
      await S().removePage(id);
      if (!(e instanceof FileError)) console.error(e);
      throw e instanceof FileError ? e : new FileError("Waypage couldn't read this " + KINDS[kind] + " file. It may be damaged." + why(e));
    }
    const { root } = got;
    const words = root.textContent;
    const meta = {
      id, url: "", title: (title || got.title || baseName(file.name)).slice(0, 300), site: KINDS[kind], byline: (got.byline || "").slice(0, 200), licence: null,
      savedAt: Date.now(), minutes: kind === "cbz" ? Math.max(1, Math.round(pics.n / 10)) : C.save.readingMinutes(words),
      lang: (got.lang || "").slice(0, 20), dir: got.dir || C.save.textDir(out, words), mode: "full", next: "", prev: "", at: 0, finished: false,
      images: root.querySelectorAll("img").length, missing: 0, imageBytes: pics.bytes,
      file: { name: file.name.slice(0, 200), kind, ext, size: file.size },
    };
    if (kind === "cbz" || got.scan) meta.comic = true;
    // The lasting permission is this device's own: it never syncs, and
    // never goes in a backup another device might read.
    if (link) meta.link = link;
    if (pics.thumb) meta.thumb = pics.thumb;
    try {
      const html = C.save.savedPageHtml(meta, root, out);
      const text = C.save.plainText(root);
      meta.bytes = pics.bytes + await S().writePage(id, html, meta) + S().bytesOf(text);
      await S().writeText(id, text);
    } catch (e) {
      await S().removePage(id);
      throw new FileError("Couldn't keep this file on " + (C.platform.native ? "the phone" : "this browser") + ". Free some space and try again.");
    }
    return meta;
  }

  C.files = { KINDS, LINKABLE, canLink, kindOf, bring, openLinked, printed, drawNear, pageThumb, closeHeld, markdown, plain, FileError, set onCover(f) { onCover = f; } };
})();
