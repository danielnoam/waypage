// Waypage: pages as an EPUB 3 book (0.20.0), for e-readers and Send to
// Kindle. One XHTML chapter per page, rebuilt from the same allowlist the
// saved page came through, with its saved pictures and its licence line.
// Written from the EPUB 3.3 spec; the layout choices (mimetype first and
// stored, nav.xhtml beside toc.ncx for older readers, no WebP) follow what
// WebToEpub learned in practice. Packed by backup.js's
// zip writer.
(function () {
  const C = window.Waypage;
  const S = () => C.store;
  const XHTML = "http://www.w3.org/1999/xhtml";
  const XML_NS = "http://www.w3.org/XML/1998/namespace";
  const LOCAL = /^images\/[A-Za-z0-9._-]{1,80}$/;
  const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,/i;
  const utf8 = (s) => new TextEncoder().encode(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const BAD_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

  const KEEP = new Set(("p br hr h1 h2 h3 h4 h5 h6 a img figure figcaption ul ol li dl dt dd blockquote q cite pre code kbd samp var " +
    "em strong b i u s del ins sub sup small mark abbr span div section article header footer " +
    "table thead tbody tfoot tr td th caption").split(" "));
  const ATTRS = { a: ["href"], img: ["alt", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"],
    ol: ["start"], abbr: ["title"] };
  const NUMERIC = /^(width|height|colspan|rowspan|start)$/;
  const CLASSES = /^co-(head|meta|byline|body|licence|video|video-title|video-note|credit|comic)$/;

  const FORMATS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" };

  // E-readers and Kindle conversion handle JPEG, PNG and GIF; a WebP is
  // drawn onto a canvas and comes out as a JPEG.
  async function bookImage(bytes) {
    const type = C.backup.imageType(bytes);
    if (FORMATS[type]) return { bytes, type };
    if (type !== "image/webp") return null;
    try {
      const bmp = await createImageBitmap(new Blob([bytes], { type }));
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.85));
      return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), type: "image/jpeg" } : null;
    } catch (e) { return null; }
  }

  // The web copy keeps a page's pictures as links; it fetches them while
  // making the book, where the site allows.
  async function imageBytes(id, src) {
    if (LOCAL.test(src)) return S().readBytes(id, src);
    if (!C.platform.native && /^https:\/\//i.test(src)) {
      const res = await fetch(src, { credentials: "omit", referrerPolicy: "no-referrer" });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    }
    if (DATA_IMAGE.test(src)) return Uint8Array.from(atob(src.split(",")[1].replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    return null;
  }

  // One saved page as an XHTML chapter. `addImage(bytes, type)` stores a
  // picture in the book and returns its path from the chapter.
  async function chapter(p, n, addImage) {
    const src = new DOMParser().parseFromString(await S().readPage(p.id), "text/html");
    const lang = src.documentElement.getAttribute("lang") || p.lang || "";
    const dir = src.documentElement.getAttribute("dir") || p.dir || "";
    const doc = document.implementation.createDocument(XHTML, "html", null);
    const html = doc.documentElement;
    html.setAttributeNS("http://www.w3.org/2000/xmlns/", "xmlns:epub", "http://www.idpf.org/2007/ops");
    if (lang) { html.setAttribute("lang", lang); html.setAttributeNS(XML_NS, "xml:lang", lang); }
    if (dir === "rtl" || dir === "ltr") html.setAttribute("dir", dir);
    const make = (tag) => doc.createElementNS(XHTML, tag);
    const head = make("head");
    const charset = make("meta");
    charset.setAttribute("charset", "utf-8");
    const title = make("title");
    title.textContent = clean(p.title);
    const css = make("link");
    css.setAttribute("rel", "stylesheet");
    css.setAttribute("type", "text/css");
    css.setAttribute("href", "../style.css");
    head.append(charset, title, css);
    const body = make("body");
    html.append(head, body);

    const ids = new Set();
    const images = [];
    function walk(from, to) {
      for (const node of [...from.childNodes]) {
        if (node.nodeType === 3) { to.append(doc.createTextNode(clean(node.data))); continue; }
        if (node.nodeType !== 1) continue;
        const tag = node.localName;
        if (tag === "img") { const at = doc.createTextNode(""); to.append(at); images.push([node, at]); continue; }
        if (tag === "span" && node.classList.contains("co-play")) continue;
        if (!KEEP.has(tag)) { walk(node, to); continue; }
        const el = make(tag);
        for (const a of ["id", "lang", "dir"].concat(ATTRS[tag] || [])) {
          const v = node.getAttribute(a);
          if (v == null || a === "href" || (NUMERIC.test(a) && !/^\d+$/.test(v))) continue;
          if (a === "id") { if (/^[A-Za-z_][\w.-]*$/.test(v) && !ids.has(v)) { ids.add(v); el.setAttribute("id", v); } continue; }
          if (a === "lang") { el.setAttributeNS(XML_NS, "xml:lang", v); }
          el.setAttribute(a, clean(v));
        }
        const cls = [...node.classList].filter((c) => CLASSES.test(c));
        if (cls.length) el.setAttribute("class", cls.join(" "));
        if (tag === "a") {
          const h = node.getAttribute("href") || "";
          if (h.startsWith("#") || /^(https?|mailto):/i.test(h)) el.setAttribute("href", h);
        }
        if (cls.includes("co-video-note")) {
          el.textContent = "Video on " + (node.getAttribute("data-site") || "the web");
        } else walk(node, el);
        to.append(el);
      }
    }
    walk(src.body, body);

    // Pictures in order, each saved once; one that wasn't saved becomes its
    // description, if it has one.
    for (const [node, at] of images) {
      let pic = null;
      try {
        const bytes = await imageBytes(p.id, node.getAttribute("src") || "");
        pic = bytes && await bookImage(bytes);
      } catch (e) { pic = null; }
      const alt = clean(node.getAttribute("alt") || "");
      if (pic) {
        const img = make("img");
        img.setAttribute("src", addImage(pic.bytes, pic.type));
        img.setAttribute("alt", alt);
        at.replaceWith(img);
      } else at.replaceWith(doc.createTextNode(alt));
    }

    // In-page links that lead nowhere are a validation error.
    for (const a of body.getElementsByTagName("a")) {
      const h = a.getAttribute("href");
      if (h && h.startsWith("#") && !ids.has(decodeURIComponent(h.slice(1)))) a.removeAttribute("href");
    }

    // The contents: the page, then its sections and their subsections.
    const heads = [];
    let n2 = 0;
    for (const h of body.querySelectorAll("h2, h3")) {
      const text = h.textContent.replace(/\s+/g, " ").trim();
      if (!text || h.closest(".co-head")) continue;
      if (!h.getAttribute("id")) {
        let id;
        do id = "s" + (++n2); while (ids.has(id));
        ids.add(id);
        h.setAttribute("id", id);
      }
      heads.push({ level: h.localName === "h2" ? 2 : 3, text, id: h.getAttribute("id") });
    }

    const xhtml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' + new XMLSerializer().serializeToString(doc);
    if (new DOMParser().parseFromString(xhtml, "application/xhtml+xml").querySelector("parsererror")) throw new Error("chapter isn't well-formed");
    return { file: "text/" + n + ".xhtml", title: clean(p.title), heads, xhtml, lang, dir };
  }

  function clean(s) { return String(s || "").replace(BAD_CHARS, ""); }

  // [{ title, href, children }] from a chapter's headings: h3s under the h2
  // before them.
  function outline(ch) {
    const top = { title: ch.title, href: ch.file, children: [] };
    let last = null;
    for (const h of ch.heads) {
      const item = { title: h.text, href: ch.file + "#" + h.id, children: [] };
      if (h.level === 3 && last) last.children.push(item);
      else { top.children.push(item); last = item; }
    }
    return top;
  }

  function navXhtml(title, lang, items) {
    const list = (xs) => "<ol>" + xs.map((x) => '<li><a href="' + esc(x.href) + '">' + esc(x.title) + "</a>" +
      (x.children.length ? list(x.children) : "") + "</li>").join("") + "</ol>";
    return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"' +
      (lang ? ' lang="' + esc(lang) + '" xml:lang="' + esc(lang) + '"' : "") + ">\n" +
      "<head><meta charset=\"utf-8\"/><title>" + esc(title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n' +
      '<body><nav epub:type="toc" id="toc"><h1>Contents</h1>' + list(items) + "</nav></body>\n</html>\n";
  }

  function tocNcx(uid, title, items) {
    let order = 0;
    const points = (xs) => xs.map((x) => '<navPoint id="n' + (++order) + '" playOrder="' + order + '"><navLabel><text>' + esc(x.title) +
      '</text></navLabel><content src="' + esc(x.href) + '"/>' + points(x.children) + "</navPoint>").join("");
    const map = points(items);
    const depth = (xs) => xs.reduce((d, x) => Math.max(d, 1 + depth(x.children)), 0);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n' +
      '<head><meta name="dtb:uid" content="' + esc(uid) + '"/><meta name="dtb:depth" content="' + Math.max(1, depth(items)) + '"/>' +
      '<meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>\n' +
      "<docTitle><text>" + esc(title) + "</text></docTitle>\n<navMap>" + map + "</navMap>\n</ncx>\n";
  }

  const STYLE = [
    "body { margin: 0 5%; font-family: serif; line-height: 1.5; overflow-wrap: break-word; }",
    "h1, h2, h3, h4 { font-family: sans-serif; line-height: 1.25; page-break-after: avoid; }",
    "h1 { font-size: 1.6em; margin: 0.4em 0; }",
    "img { max-width: 100%; height: auto; }",
    "figure { margin: 1em 0; page-break-inside: avoid; }",
    "figcaption, .co-credit, .co-meta, .co-byline, .co-licence { font-family: sans-serif; font-size: 0.8em; color: #555; }",
    ".co-credit { display: block; }",
    ".co-video-title, .co-video-note { display: block; }",
    ".co-licence { margin: 2em 0 1em; padding-top: 0.5em; border-top: 1px solid #ccc; }",
    ".co-comic img { display: block; width: 100%; margin: 0; page-break-inside: avoid; }",
    "blockquote { margin: 1em 1.5em; }",
    "pre { white-space: pre-wrap; font-size: 0.85em; }",
    "table { border-collapse: collapse; margin: 1em 0; font-size: 0.9em; }",
    "td, th { border: 1px solid #ccc; padding: 0.2em 0.4em; vertical-align: top; }",
    "nav ol { list-style: none; padding-left: 1em; }",
    "body.cover { margin: 0; text-align: center; }",
    "body.cover img { max-height: 100%; }",
    "",
  ].join("\n");

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  // A cover for a book with no pictures: the title on the Paper theme's
  // colours, in the reading type, with the site under it. 1200 × 1800, the
  // shape e-reader shelves expect. null where there's no canvas.
  async function titleCard(title, site, rtl) {
    try {
      await Promise.all(['600 88px "Source Serif 4"', '500 40px "Instrument Sans"'].map((f) => document.fonts.load(f))).catch(() => {});
      const W = 1200, H = 1800, M = 120;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const g = canvas.getContext("2d");
      g.fillStyle = "#F7F4EE";
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#2F5D8A";
      g.fillRect(rtl ? W - M - 160 : M, 300, 160, 12);
      g.direction = rtl ? "rtl" : "ltr";
      g.textAlign = rtl ? "right" : "left";
      const x = rtl ? W - M : M;
      let size = 96, lines;
      do {
        size -= 8;
        g.font = '600 ' + size + 'px "Source Serif 4", Georgia, serif';
        lines = [];
        let line = "";
        for (const word of title.split(/\s+/)) {
          const next = line ? line + " " + word : word;
          if (line && g.measureText(next).width > W - 2 * M) { lines.push(line); line = word; } else line = next;
        }
        if (line) lines.push(line);
      } while (lines.length * size * 1.2 > 900 && size > 48);
      g.fillStyle = "#1C1B19";
      g.textBaseline = "top";
      lines.slice(0, 9).forEach((l, i) => g.fillText(l, x, 380 + i * size * 1.2));
      g.font = '500 40px "Instrument Sans", system-ui, sans-serif';
      g.fillStyle = "#5E5A53";
      g.fillText(site, x, H - M - 40);
      const blob = await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.9));
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    } catch (e) { return null; }
  }

  const slug = (t) => t.replace(/[\\/:*?"<>|#%\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "Book";

  // Pages (in reading order) as one book. `title` names it; one page's
  // book is named after the page. Resolves like backup.exportLibrary:
  // { uri, name } in the app, { blob, name } in a browser.
  async function exportBook(pages, title) {
    title = clean(title || pages[0].title);
    const native = C.platform.native;
    const name = slug(title) + ".epub";
    const images = [];
    const addImage = (bytes, type) => {
      const file = "images/" + (images.length + 1) + "." + FORMATS[type];
      images.push({ file, bytes, type });
      return "../" + file;
    };
    const chapters = [];
    for (const [i, p] of pages.entries()) chapters.push(await chapter(p, i + 1, addImage));
    const lang = chapters[0].lang || "en";
    const rtl = chapters[0].dir === "rtl";
    const uid = "urn:uuid:" + uuid();
    const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
    const first = pages[0];
    const creator = pages.length === 1 ? (first.byline || first.site || "") : (first.site || "");
    const wiki = pages.some((p) => p.licence === "wikipedia");
    const items = chapters.map(outline);

    // The cover: the first picture, or a title card. A book of several
    // pages also opens on it, as a page of its own before the first.
    let coverAt = images.length ? 0 : -1;
    if (coverAt < 0) {
      const card = await titleCard(title, first.site || "", rtl);
      if (card) { images.push({ file: "images/cover.jpg", bytes: card, type: "image/jpeg" }); coverAt = images.length - 1; }
    }
    const coverPage = pages.length > 1 && coverAt >= 0 ? '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n' +
      '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="' + esc(lang) + '" xml:lang="' + esc(lang) + '">\n' +
      "<head><meta charset=\"utf-8\"/><title>" + esc(title) + '</title><link rel="stylesheet" type="text/css" href="style.css"/></head>\n' +
      '<body class="cover"><section epub:type="cover"><img src="' + images[coverAt].file + '" alt="' + esc(title) + '"/></section></body>\n</html>\n' : null;

    const manifest = [
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
      '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
      '<item id="css" href="style.css" media-type="text/css"/>',
      coverPage ? '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>' : null,
      ...chapters.map((c, i) => '<item id="c' + (i + 1) + '" href="' + c.file + '" media-type="application/xhtml+xml"/>'),
      ...images.map((im, i) => '<item id="i' + (i + 1) + '" href="' + im.file + '" media-type="' + im.type + '"' +
        (i === coverAt ? ' properties="cover-image"' : "") + "/>"),
    ].filter(Boolean);
    const opf = '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="' + esc(lang) + '">\n' +
      '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n' +
      '<dc:identifier id="uid">' + esc(uid) + "</dc:identifier>\n" +
      "<dc:title>" + esc(title) + "</dc:title>\n" +
      "<dc:language>" + esc(lang) + "</dc:language>\n" +
      (creator ? "<dc:creator>" + esc(clean(creator)) + "</dc:creator>\n" : "") +
      pages.map((p) => "<dc:source>" + esc(p.url) + "</dc:source>\n").join("") +
      (wiki ? "<dc:rights>Text from Wikipedia, CC BY-SA 4.0, by Wikipedia contributors.</dc:rights>\n" : "") +
      "<dc:contributor>Waypage</dc:contributor>\n" +
      '<meta property="dcterms:modified">' + modified + "</meta>\n" +
      (coverAt >= 0 ? '<meta name="cover" content="i' + (coverAt + 1) + '"/>\n' : "") +
      "</metadata>\n<manifest>\n" + manifest.join("\n") + "\n</manifest>\n" +
      '<spine toc="ncx"' + (rtl ? ' page-progression-direction="rtl"' : "") + ">\n" +
      (coverPage ? '<itemref idref="cover"/>\n' : "") +
      chapters.map((c, i) => '<itemref idref="c' + (i + 1) + '"/>').join("\n") + "\n</spine>\n</package>\n";

    const file = native ? await S().cacheFile(name) : null;
    const parts = [];
    const zip = C.backup.zipWriter(native ? (b) => file.append(b) : (b) => { parts.push(b); });
    await zip.add("mimetype", utf8("application/epub+zip"));
    await zip.add("META-INF/container.xml", utf8('<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n' +
      '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>\n</container>\n'));
    await zip.add("OEBPS/content.opf", utf8(opf));
    await zip.add("OEBPS/nav.xhtml", utf8(navXhtml(title, lang, items)));
    await zip.add("OEBPS/toc.ncx", utf8(tocNcx(uid, title, items)));
    await zip.add("OEBPS/style.css", utf8(STYLE));
    if (coverPage) await zip.add("OEBPS/cover.xhtml", utf8(coverPage));
    for (const c of chapters) await zip.add("OEBPS/" + c.file, utf8(c.xhtml));
    for (const im of images) await zip.add("OEBPS/" + im.file, im.bytes);
    await zip.finish();
    return native ? { uri: await file.uri(), name } : { blob: new Blob(parts, { type: "application/epub+zip" }), name };
  }

  C.epub = { exportBook, STYLE };
})();
