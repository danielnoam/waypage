// Waypage: turning a link into a saved page (docs/PROPOSAL.md,
// "Architecture"). Fetch, pick the article (the Wikipedia adapter or
// Readability), clean it down to an allowlist, then download image previews
// and video thumbnails next to it.
//
// The fetched HTML is only ever parsed with DOMParser, whose documents run
// no scripts and load nothing; what comes out is rebuilt element by element
// from the allowlist, so nothing the page carried survives unless named here.
(function () {
  const C = window.Waypage;

  const PREVIEW_WIDTH = 480;
  // Full images no wider than this when they're made smaller (1.18.0):
  // more than a phone shows, so a comic's lettering stays sharp.
  const FULL_WIDTH = 1600;
  let compress = true;
  // Wikimedia serves (and caches) thumbnails at fixed steps; other widths
  // are generated on demand and rate-limited for tools.
  const WIKI_PREVIEW = 500;
  const WIKI_FULL = 1280;
  const WORDS_PER_MINUTE = 230;
  const MIN_TEXT = 250;

  const KEEP = new Set(("p br hr h2 h3 h4 h5 h6 a img figure figcaption ul ol li dl dt dd blockquote q cite pre code kbd samp var " +
    "em strong b i u s del ins sub sup small mark abbr time span div section article header footer " +
    "table thead tbody tfoot tr td th caption details summary").split(" "));
  const DROP = new Set(("script style noscript template iframe frame frameset object embed applet form input button select " +
    "textarea option label nav svg math canvas audio video picture source track map area link meta base head title dialog").split(" "));
  const ATTRS = { a: ["href"], img: ["alt", "width", "height"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan", "scope"], ol: ["start"], time: ["datetime"], abbr: ["title"] };
  const GLOBAL_ATTRS = ["id", "lang", "dir"];

  // ---- Pure helpers (test/save.test.js) ----

  function absolute(href, base) {
    try { return new URL(href, base).href; } catch (e) { return null; }
  }

  // { host, title } for a Wikipedia article link, mobile or desktop; null
  // for anything else, including special and talk pages.
  function wikipediaPage(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    const m = u.hostname.match(/^([a-z0-9-]+)\.(?:m\.)?wikipedia\.org$/i);
    if (!m || m[1] === "www") return null;
    let title = null;
    if (u.pathname.startsWith("/wiki/")) title = decodeURIComponent(u.pathname.slice(6));
    else if (u.pathname === "/w/index.php") title = u.searchParams.get("title");
    if (!title || /^(Special|Talk|User|Wikipedia|File|Help|Portal|Category|Template):/i.test(title)) return null;
    return { host: m[1].toLowerCase() + ".wikipedia.org", title: title.replace(/ /g, "_") };
  }

  // The same Wikimedia thumbnail at another width, never wider than the
  // file itself (a thumbnail can't upscale). Non-thumbnail URLs pass through.
  function wikimediaThumb(src, width, fileWidth) {
    const m = src.match(/^(.*\/thumb\/.+\/)(\d+)px-([^/]+)$/);
    if (!m) return src;
    const w = fileWidth ? Math.min(width, fileWidth) : width;
    if (fileWidth && w >= fileWidth && !/\.(svg|tiff?|pdf|webm|ogv)\./i.test(m[3])) {
      return m[1].replace("/thumb/", "/").replace(/\/$/, "");
    }
    return m[1] + w + "px-" + m[3];
  }

  // srcset candidates as [{ url, w }], widths from "480w" or density × base.
  function parseSrcset(srcset, base) {
    return String(srcset || "").split(/,\s+(?=\S)/).map((part) => {
      const [url, d] = part.trim().split(/\s+/);
      const n = parseFloat(d) || 1;
      const w = /w$/.test(d || "") ? n : n * PREVIEW_WIDTH;
      const abs = url && absolute(url, base);
      return abs ? { url: abs, w } : null;
    }).filter(Boolean);
  }

  // The candidate nearest at or above `target`, or the widest below it.
  function pickWidth(candidates, target) {
    if (!candidates.length) return null;
    const sorted = [...candidates].sort((a, b) => a.w - b.w);
    return (sorted.find((c) => c.w >= target) || sorted[sorted.length - 1]).url;
  }

  function youtubeId(src) {
    const m = String(src).match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : null;
  }
  function vimeoId(src) {
    const m = String(src).match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return m ? m[1] : null;
  }

  function extOf(url) {
    const m = String(url).split(/[?#]/)[0].match(/\.(jpe?g|png|gif|webp|avif|svg)$/i);
    return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
  }

  function isTrackingPixel(width, height, src) {
    const w = parseInt(width, 10), h = parseInt(height, 10);
    if ((w && w <= 2) || (h && h <= 2)) return true;
    return /[/.](pixel|beacon|tracking|analytics)[/.?]|facebook\.com\/tr\b|\/b\/ss\//i.test(String(src));
  }

  function readingMinutes(text) {
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
  }

  // Words a site uses on its links to the next and previous chapter or page.
  const NEXT_WORDS = /^(next|next (chapter|page|part|episode|post)|הבא|הפרק הבא|לפרק הבא|לעמוד הבא|siguiente|suivant|weiter|nächste|下一章|下一页|次へ|次の話)$/i;
  const PREV_WORDS = /^(prev|previous|previous (chapter|page|part|episode|post)|prev (chapter|page)|הקודם|הפרק הקודם|לפרק הקודם|לעמוד הקודם|anterior|précédent|zurück|vorherige|上一章|上一页|前へ|前の話)$/i;
  const bare = (text) => String(text || "").replace(/[›»→>‹«←<\s]+$/u, "").replace(/^[‹«←<›»→>\s]+/u, "").replace(/\s+/g, " ").trim();
  const isNextText = (text) => NEXT_WORDS.test(bare(text));
  const isPrevText = (text) => PREV_WORDS.test(bare(text));

  // The page's link to what comes next (rel="next", or a link worded like
  // "Next chapter"), or before it with `back`, on the same site and not
  // the page itself; "" if none. Read before Readability, which strips
  // navigation.
  function nextLink(doc, pageUrl, back) {
    let host;
    try { host = new URL(pageUrl).host; } catch (e) { return ""; }
    const ok = (href) => {
      const u = absolute(href, pageUrl);
      try {
        const x = new URL(u);
        return /^https?:$/.test(x.protocol) && x.host === host && u.split("#")[0] !== pageUrl.split("#")[0] ? u.split("#")[0] : "";
      } catch (e) { return ""; }
    };
    const rel = back ? 'link[rel~="prev"][href], a[rel~="prev"][href], link[rel~="previous"][href], a[rel~="previous"][href]' : 'link[rel~="next"][href], a[rel~="next"][href]';
    const is = back ? isPrevText : isNextText;
    for (const l of doc.querySelectorAll(rel)) {
      const u = ok(l.getAttribute("href"));
      if (u) return u;
    }
    for (const a of doc.querySelectorAll("a[href]")) {
      if (!is(a.textContent) && !is(a.getAttribute("aria-label")) && !is(a.getAttribute("title"))) continue;
      const u = ok(a.getAttribute("href"));
      if (u) return u;
    }
    return "";
  }

  // ---- Image chapters: comics and manga (0.22.0) ----

  // Pictures that are page furniture, not panels.
  const NOT_PANEL = /logo|avatar|icon|emoji|sprite|banner|badge|button|\bads?\b|advert|sponsor|thumb|gravatar|spinner|loading|placeholder/i;
  function isPanel(src, width, height, label) {
    if (!/^https?:/.test(src || "") || isTrackingPixel(width, height, src)) return false;
    const w = parseInt(width, 10), h = parseInt(height, 10);
    if ((w && w < 400) || (h && h < 200)) return false;
    return !NOT_PANEL.test(String(src).split("?")[0]) && !NOT_PANEL.test(label || "");
  }

  // The column of panels among pictures, each { src, path } with `path`
  // the keys of its nearest few ancestors, nearest first: the nearest
  // ancestor holding nearly as many as the fullest one (an ad beside the
  // column shouldn't pull the choice outwards), four at least and most of
  // all of them. Resolves to { key, srcs } in page order,
  // each picture once; null when the pictures aren't a column.
  function comicGroup(items) {
    const counts = new Map(), depth = new Map();
    for (const it of items) {
      it.path.forEach((k, d) => {
        counts.set(k, (counts.get(k) || 0) + 1);
        depth.set(k, Math.min(depth.has(k) ? depth.get(k) : d, d));
      });
    }
    const most = Math.max(0, ...counts.values());
    let key = null, best = 0;
    for (const [k, n] of counts) {
      if (n < most * 0.8) continue;
      if (key == null || depth.get(k) < depth.get(key) || (depth.get(k) === depth.get(key) && n > best)) { key = k; best = n; }
    }
    if (best < 4 || best < items.length * 0.6) return null;
    const seen = new Set();
    const srcs = items.filter((it) => it.path.includes(key)).map((it) => it.src).filter((u) => !seen.has(u) && seen.add(u));
    return srcs.length >= 4 ? { key, srcs } : null;
  }

  // A comic page's panels, in order: the column of large pictures when
  // there is one (so an ad beside it stays out), else every picture that
  // could be a panel; null when there are none. Run after
  // resolveLazyImages.
  function comicPanels(doc, base) {
    const ids = new Map();
    const keyOf = (n) => { if (!ids.has(n)) ids.set(n, ids.size); return ids.get(n); };
    const items = [];
    for (const img of doc.querySelectorAll("body img")) {
      const src = absolute(img.getAttribute("src") || "", base);
      if (!isPanel(src, img.getAttribute("width"), img.getAttribute("height"), (img.getAttribute("class") || "") + " " + (img.getAttribute("alt") || "") + " " + (img.id || ""))) continue;
      const path = [];
      for (let n = img.parentElement; n && n !== doc.body && path.length < 4; n = n.parentElement) path.push(keyOf(n));
      items.push({ src, path, img });
    }
    const group = comicGroup(items);
    if (group) return group.srcs;
    // No clear column: every picture that could be a panel, in page order.
    const srcs = [...new Set(items.map((i) => i.src))];
    return srcs.length ? srcs : null;
  }

  // ---- A contents page's chapters (0.21.0) ----

  // A chapter's number from its link text ("Chapter 12", "Ch. 3.5",
  // "פרק 4", "12. The Fall"), or from its address; null when it has none.
  // The word stands alone: "March 3", "Sep 12" and "step 4" aren't chapters,
  // nor are addresses like /2025/sep/03/ or /research-2024.
  const CHAPTER_WORD = /(?:^|[^\p{L}\p{N}])(?:chapter|chap\.?|ch\.?|part|episode|ep\.?|book|vol\.?|פרק|capítulo|chapitre|kapitel|глава)\s*(\d+(?:\.\d+)?)(?![\p{L}\p{N}])|第\s*(\d+)/iu;
  function chapterNumber(text, href) {
    const t = String(text || "").trim();
    const m = t.match(CHAPTER_WORD) || t.match(/^(\d+(?:\.\d+)?)(?:\s*[.:)\-–—]\s|$)/u) ||
      String(href || "").match(/(?:^|[/_\-.?=&])(?:chapter|chap|ch|episode|ep|part)[-_/]?(\d+(?:[.-]\d+)?)(?![a-z\d])/i);
    const n = m && (m[1] || m[2]);
    return n ? parseFloat(n.replace("-", ".")) : null;
  }

  // The chapter list among groups of links (each [{ url, text }], one group
  // a list, table or block): the group with the most numbered links, three
  // at least, in reading order (newest-first lists are turned around);
  // [] when no group looks like chapters.
  function pickChapters(groups) {
    let best = null, bestScore = 0;
    for (const g of groups) {
      const seen = new Set();
      const links = g.filter((l) => !seen.has(l.url) && seen.add(l.url));
      const nums = links.map((l) => chapterNumber(l.text, l.url));
      const score = nums.filter((n) => n != null).length;
      if (score >= 3 && score >= links.length / 2 && score > bestScore) { best = { links, nums }; bestScore = score; }
    }
    if (!best) return [];
    const known = best.nums.filter((n) => n != null);
    let down = 0, up = 0;
    for (let i = 1; i < known.length; i++) { if (known[i] < known[i - 1]) down++; else if (known[i] > known[i - 1]) up++; }
    return down > up ? [...best.links].reverse() : best.links;
  }

  // The links on a page grouped by the list, table or block they sit in:
  // same site only, not the page itself.
  function linkGroups(doc, pageUrl) {
    let host;
    try { host = new URL(pageUrl).host; } catch (e) { return []; }
    const groups = new Map();
    for (const a of doc.querySelectorAll("body a[href]")) {
      const text = a.textContent.replace(/\s+/g, " ").trim();
      if (!text) continue;
      const u = absolute(a.getAttribute("href"), pageUrl);
      let x;
      try { x = new URL(u); } catch (e) { continue; }
      const url = u.split("#")[0];
      if (!/^https?:$/.test(x.protocol) || x.host !== host || url === pageUrl.split("#")[0]) continue;
      const box = a.closest("ul, ol, table, dl, select") || (a.parentElement && a.parentElement.closest("div, section, nav, p")) || doc.body;
      if (!groups.has(box)) groups.set(box, []);
      groups.get(box).push({ url, text: text.slice(0, 200) });
    }
    return [...groups.values()];
  }

  // { title, links } for a page that is mostly a list of chapters (more
  // of its words are links than not, as WebToEpub's scanner counts it);
  // null for anything else.
  // The site's menus, header and footer don't count: a news story under a
  // big menu is still a story. Nor does a page whose own text is long.
  const CHROME = "nav, header, footer, aside, script, style, noscript, template, [role=navigation], [role=banner], [role=contentinfo], [role=complementary]";
  function contentsOf(doc, pageUrl, title) {
    if (!doc.body) return null;
    const links = pickChapters(linkGroups(doc, pageUrl));
    if (links.length < 5) return null;
    const body = doc.body.cloneNode(true);
    body.querySelectorAll(CHROME).forEach((n) => n.remove());
    const words = (n) => n.textContent.replace(/\s+/g, " ").trim().length;
    const all = words(body);
    const linked = [...body.querySelectorAll("a[href]")].reduce((n, a) => n + words(a), 0);
    return linked > all * 0.4 && all - linked < 3000 ? { title, links: links.map((l) => l.url) } : null;
  }

  // A contents page's chapter links, read from the page whatever it is
  // (Save several's Find chapters). { title, links }; links is [] when
  // nothing looks like chapters.
  async function findChapters(url) {
    const site = siteRule(url);
    const res = await get(site && site.fetch ? site.fetch(url) : url, site && site.headers);
    const at = res.url || url;
    const doc = parse(res.text, at);
    const cover = pageImage(doc, at);
    if (site) {
      const own = (site.contents && await site.contents(doc, at, res.text)) || null;
      const links = own ? own.links : site.list ? await site.list(doc, at, res.text) : [];
      if (links.length) return { title: (own && own.title) || readTitle(doc), links, cover };
    }
    return { title: readTitle(doc), links: pickChapters(linkGroups(doc, at)).map((l) => l.url), cover };
  }

  // The picture a page offers for sharing (og:image): on a story's page,
  // its cover. Null when it has none.
  function pageImage(doc, base) {
    const m = doc.querySelector('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"], meta[property="twitter:image"]');
    const url = m && absolute((m.getAttribute("content") || "").trim(), base);
    return url && /^https?:/.test(url) ? url : null;
  }

  // The site's icon: the largest one the page names up to 256 px (apple
  // touch icons are 180), else /favicon.ico.
  function siteIcon(doc, base) {
    const size = (l) => { const m = (l.getAttribute("sizes") || "").match(/(\d+)x\d+/); return m ? Number(m[1]) : /apple/i.test(l.getAttribute("rel")) ? 180 : 16; };
    const links = [...doc.querySelectorAll("link[rel][href]")].filter((l) => /(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/i.test(l.getAttribute("rel")) && size(l) <= 256);
    links.sort((a, b) => size(b) - size(a));
    const url = links.length ? absolute(links[0].getAttribute("href"), base) : null;
    if (url && /^https?:/.test(url)) return url;
    try { return new URL("/favicon.ico", base).href; } catch (e) { return null; }
  }

  function readTitle(doc) {
    const og = doc.querySelector('meta[property="og:title"]');
    const h1s = doc.querySelectorAll("h1");
    return ((og && og.content) || (h1s.length === 1 ? h1s[0].textContent : "") || (doc.querySelector("title") || {}).textContent || "").replace(/\s+/g, " ").trim();
  }

  // ---- Sites with rules of their own (0.25.0) ----
  // Serial-fiction sites whose pages the general reader gets wrong: the
  // chapter text sits beside menus and comments, the chapter list is split
  // over pages or built by script, or text is hidden by the site's own CSS.
  // Each rule may give:
  //   fetch(url): the address to fetch instead (AO3's adult click-through)
  //   contents(doc, url, html): { title, links } when the page is a list of chapters
  //   list(doc, url, html): the chapter list read from any of its pages (Find chapters)
  //   chapter(doc, url): { content, title, series, byline, next, prev } for a chapter
  // contents and list may be async and fetch more pages.

  // Elements a page's own <style> hides outright (outside @media), which a
  // DOMParser document doesn't apply. Royal Road hides lines saying the
  // text was stolen from it among the paragraphs this way.
  function removeHidden(doc) {
    for (const st of doc.querySelectorAll("style")) {
      const css = st.textContent.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
      for (const [, sel, body] of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
        if (!/display\s*:\s*none|visibility\s*:\s*hidden/i.test(body)) continue;
        for (const one of sel.split(",")) {
          const q = one.trim();
          if (!q || /^(html|body|\*)$/i.test(q)) continue;
          try { doc.querySelectorAll(q).forEach((n) => n.remove()); } catch (e) { /* not a selector the DOM knows */ }
        }
      }
    }
  }

  // A note from the author, kept and set apart: a quote under its label.
  function noteBlock(doc, label, from) {
    const q = doc.createElement("blockquote");
    const head = doc.createElement("p");
    const b = doc.createElement("strong");
    b.textContent = label;
    head.append(b);
    q.append(head, ...[...from.childNodes].map((n) => n.cloneNode(true)));
    return q;
  }

  const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");

  // The array a page's script assigns, e.g. `window.chapters = [...];`.
  function scriptJson(html, name) {
    const at = html.indexOf(name);
    if (at < 0) return null;
    const start = html.indexOf("[", at);
    if (start < 0) return null;
    try { return JSON.parse(balanced(html, start)); } catch (e) { return null; }
  }

  // The JSON array or object starting at `start`, up to its closing
  // bracket, or "" when it doesn't close.
  function balanced(html, start) {
    if (start < 0) return "";
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < html.length; i++) {
      const c = html[i];
      if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "[" || c === "{") depth++;
      else if ((c === "]" || c === "}") && --depth === 0) return html.slice(start, i + 1);
    }
    return "";
  }

  const uniqueLinks = (links) => { const seen = new Set(); return links.filter((u) => u && !seen.has(u) && seen.add(u)); };

  const SITES = [
    {
      name: "Royal Road",
      host: /(^|\.)royalroadl?\.com$/i,
      contents(doc, url, html) {
        if (!/^\/fiction\/\d+(\/[^/]+)?\/?$/.test(new URL(url).pathname)) return null;
        const list = scriptJson(html, "window.chapters");
        const fiction = new URL(url).pathname.replace(/\/+$/, "");
        let links = Array.isArray(list)
          ? list.filter((c) => c && (c.url || c.id)).map((c) => absolute(c.url || fiction + "/chapter/" + c.id + "/" + (c.slug || ""), url))
          : [...doc.querySelectorAll("table#chapters a[href*='/chapter/']")].map((a) => absolute(a.getAttribute("href"), url));
        links = uniqueLinks(links);
        const og = doc.querySelector('meta[property="og:title"]');
        return links.length ? { title: text(doc.querySelector(".fic-header h1")) || (og && og.content.trim()) || "", links } : null;
      },
      chapter(doc) {
        removeHidden(doc);
        const inner = doc.querySelector(".chapter-inner.chapter-content, .chapter-inner");
        if (!inner) return null;
        const content = doc.createElement("div");
        for (const n of doc.querySelectorAll(".author-note-portlet, .author-note-card, .chapter-inner")) {
          if (n.classList.contains("chapter-inner")) { if (!n.parentElement.closest(".chapter-inner")) content.append(n.cloneNode(true)); continue; }
          if (n.parentElement && n.parentElement.closest(".author-note-portlet, .author-note-card")) continue;
          content.append(noteBlock(doc, "Author's note", n.querySelector(".author-note") || n));
        }
        const head = doc.querySelector(".fic-header");
        const author = doc.querySelector('.fic-header a[href^="/profile/"]') || doc.querySelector('meta[property="books:author"]');
        return {
          content,
          title: text(head && head.querySelector("h1")),
          series: text(head && head.querySelector("h2")) || text(head && head.querySelector('a[href^="/fiction/"]:not([href*="/chapter/"])')),
          byline: author ? (author.content || text(author)).trim() : "",
        };
      },
    },
    {
      name: "Archive of Our Own",
      host: /(^|\.)(archiveofourown\.org|ao3\.org)$/i,
      // A work marked for adults stops at a click-through without this.
      fetch(url) {
        const u = new URL(url);
        if (/^\/works\/\d+/.test(u.pathname) && !u.searchParams.has("view_adult")) u.searchParams.set("view_adult", "true");
        return u.href;
      },
      // ...and the page is kept under its plain address, which is how
      // next links and the chapter list name it.
      clean(url) {
        const u = new URL(url);
        u.searchParams.delete("view_adult");
        return u.href;
      },
      async contents(doc, url) {
        if (!/^\/works\/\d+\/navigate\/?$/.test(new URL(url).pathname)) return null;
        const links = uniqueLinks([...doc.querySelectorAll("ol.chapter a[href], ol.index a[href]")].map((a) => absolute(a.getAttribute("href"), url)));
        return links.length ? { title: text(doc.querySelector("h2.heading a, h2.heading")), links } : null;
      },
      async list(doc, url) {
        const m = new URL(url).pathname.match(/^\/works\/(\d+)/);
        if (!m) return [];
        const res = await get(new URL("/works/" + m[1] + "/navigate", url).href);
        const nav = parse(res.text, res.url || url);
        return uniqueLinks([...nav.querySelectorAll("ol.chapter a[href], ol.index a[href]")].map((a) => absolute(a.getAttribute("href"), url)));
      },
      chapter(doc) {
        const box = doc.querySelector("#chapters");
        const body = box && (box.querySelector(".userstuff.module, [role='article'].userstuff") || box.querySelector(".userstuff"));
        if (!body) return null;
        const content = doc.createElement("div");
        const notes = (sel, label) => doc.querySelectorAll(sel).forEach((n) => { const u = n.querySelector(".userstuff"); if (u && text(u)) content.append(noteBlock(doc, label, u)); });
        notes("#workskin > .preface .notes:not(.end), #chapters .chapter > .preface .notes:not(.end)", "Notes");
        const copy = body.cloneNode(true);
        copy.querySelectorAll("h3.landmark").forEach((n) => n.remove());
        content.append(copy);
        notes("#chapters .chapter > .preface .end.notes, #work_endnotes", "End notes");
        const work = text(doc.querySelector("h2.title.heading, h2.heading"));
        const chap = text(doc.querySelector("#chapters h3.title"));
        return {
          content,
          title: chap ? chap.replace(/^Chapter\s+(\d+)\s*:\s*(.+)$/i, "Chapter $1: $2") : work,
          series: chap ? work : "",
          byline: [...doc.querySelectorAll("h3.byline a[rel='author']")].map(text).join(", "),
        };
      },
    },
    {
      name: "Scribble Hub",
      host: /(^|\.)scribblehub\.com$/i,
      // The series page lists chapters newest first, fifteen or so to a
      // page (?toc=2 and on), with the total beside them.
      async contents(doc, url) {
        if (!/^\/series\/\d+/.test(new URL(url).pathname)) return null;
        const total = parseInt(text(doc.querySelector("span.cnt_toc")), 10) || 0;
        const read = (d) => [...d.querySelectorAll("a.toc_a[href]")].map((a) => absolute(a.getAttribute("href"), url));
        let links = read(doc);
        const base = url.split(/[?#]/)[0];
        for (let page = 2; links.length < total && page <= 200; page++) {
          const res = await get(base + "?toc=" + page);
          const more = read(parse(res.text, res.url || base));
          if (!more.length) break;
          links = links.concat(more);
        }
        links = uniqueLinks(links).reverse();
        return links.length ? { title: text(doc.querySelector("div.fic_title")), links } : null;
      },
      chapter(doc) {
        const raw = doc.querySelector("#chp_raw");
        if (!raw) return null;
        const content = doc.createElement("div");
        const copy = raw.cloneNode(true);
        copy.querySelectorAll(".wi_authornotes, .wi_news").forEach((n) => {
          const body = n.querySelector(".wi_authornotes_body, .wi_news_body") || n;
          n.replaceWith(noteBlock(doc, n.classList.contains("wi_news") ? "News" : "Author's note", body));
        });
        copy.querySelectorAll(".sp-wrap").forEach((w) => {
          const d = doc.createElement("details"), sm = doc.createElement("summary");
          sm.textContent = text(w.querySelector(".sp-head")) || "Spoiler";
          d.append(sm, ...[...((w.querySelector(".sp-body") || w).childNodes)].map((n) => n.cloneNode(true)));
          w.replaceWith(d);
        });
        content.append(copy);
        return {
          content,
          title: text(doc.querySelector(".chapter-title")),
          series: text(doc.querySelector(".chp_byline a, .wi_fic_title, div.fic_title")),
          byline: text(doc.querySelector(".auth_name_fic")),
        };
      },
    },
    {
      name: "FanFiction.net",
      host: /(^|\.)(fanfiction\.net|fictionpress\.com)$/i,
      // Chapters are a <select>; its onchange builds each one's address.
      list(doc, url) {
        const sel = doc.querySelector("select#chap_select");
        if (!sel) return [];
        const parts = (sel.getAttribute("onchange") || "").split("'");
        const story = new URL(url).pathname.match(/^\/s\/(\d+)\/\d+\/?(.*)$/);
        return uniqueLinks([...sel.querySelectorAll("option")].map((o) => {
          const v = o.getAttribute("value");
          if (parts.length >= 4) return absolute(parts[1] + v + parts[3], url);
          return story ? absolute("/s/" + story[1] + "/" + v + "/" + story[2], url) : "";
        }));
      },
      chapter(doc, url) {
        const story = doc.querySelector("#storytext, .storytext");
        if (!story) return null;
        const content = doc.createElement("div");
        content.append(story.cloneNode(true));
        const top = doc.querySelector("#profile_top");
        const sel = doc.querySelector("select#chap_select");
        const picked = sel && (sel.querySelector("option[selected]") || sel.options[sel.selectedIndex]);
        const links = this.list(doc, url);
        const at = picked ? [...sel.querySelectorAll("option")].indexOf(picked) : -1;
        const series = text(top && top.querySelector("b"));
        return {
          content,
          title: picked ? text(picked).replace(/^(\d+)\.\s*/, "Chapter $1: ") : series,
          series: picked ? series : "",
          byline: text(top && top.querySelector("a[href^='/u/']")),
          next: at >= 0 ? links[at + 1] || "" : undefined,
          prev: at > 0 ? links[at - 1] : at === 0 ? "" : undefined,
        };
      },
    },
    {
      // WEBTOON (0.29.1): an episode is a column of panels (img._images,
      // their address in data-url); the series' list page shows ten
      // episodes a page, newest first.
      name: "WEBTOON",
      host: /(^|\.)webtoons\.com$/i,
      // The phone's own address and a phone's browser get the mobile
      // viewer (1.16.1), which names only its first few panels; the
      // desktop one, asked for as a desktop browser, names them all.
      fetch: (url) => url.replace(/^(https?:\/\/)m\.webtoons\.com\//i, "$1www.webtoons.com/"),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" },
      comic: (url) => /\/viewer\/?$/.test(new URL(url).pathname),
      async contents(doc, url) {
        const u = new URL(url);
        if (!/\/list\/?$/.test(u.pathname) || !u.searchParams.get("title_no")) return null;
        const links = await webtoonEpisodes(doc, u);
        // The series' name breaks over lines (<br>) in its heading.
        const h = doc.querySelector("h1.subj");
        if (h) h.querySelectorAll("br").forEach((b) => b.replaceWith(" "));
        return links.length ? { title: text(h) || text(doc.querySelector("title")), links } : null;
      },
      async list(doc, url) {
        const u = new URL(url);
        if (/\/list\/?$/.test(u.pathname)) return webtoonEpisodes(doc, u);
        const a = doc.querySelector("a.subj[href*='/list'], a[href*='/list?title_no=']");
        if (!a) return [];
        const at = new URL(absolute(a.getAttribute("href"), url));
        return webtoonEpisodes(parse((await get(at.href, this.headers)).text, at.href), at);
      },
      // Every panel (1.16.0): the phone's page (m.webtoons.com) gave only
      // the first few with their picture in src, the rest a stand-in. Each
      // picture in the viewer's list by whichever attribute carries its
      // address, or, when that finds fewer, every panel address in the
      // page's HTML (they end ?type=q70 or q90; covers and thumbnails
      // don't), in order.
      panels(doc, url, html) {
        const PANEL = /webtoon-phinf\.pstatic\.net\//;
        const imgs = [...doc.querySelectorAll("#_imageList img, .viewer_img img, img._images")];
        const fromDom = imgs.map((img) => [...img.attributes].map((a) => a.value.trim()).find((v) => PANEL.test(v) && LAZY_URL.test(v)))
          .filter(Boolean).map((v) => absolute(v, url));
        const fromHtml = (String(html || "").match(/https?:\/\/webtoon-phinf\.pstatic\.net\/[^\s"'<>\\]+?\?type=q\d+/g) || [])
          .map((v) => v.replace(/&amp;/g, "&"));
        const list = fromHtml.length > fromDom.length ? fromHtml : fromDom;
        return [...new Set(list)];
      },
      chapter(doc, url) {
        if (!this.comic(url)) return null;
        const series = doc.querySelector("a.subj[href*='/list']");
        const link = (sel) => { const a = doc.querySelector(sel); return a ? absolute(a.getAttribute("href"), url) : ""; };
        return {
          content: null,
          title: text(doc.querySelector("h1.subj_episode")) || (doc.querySelector("h1.subj_episode") || { title: "" }).title,
          series: series ? (series.getAttribute("title") || text(series)).trim() : "",
          byline: [...doc.querySelectorAll(".author_area .author_name")].map(text).filter(Boolean).join(", "),
          next: link("a._nextEpisode"),
          prev: link("a._prevEpisode"),
        };
      },
    },
    {
      // Tapas (0.29.1): a comic episode is a column of panels
      // (img.content__img, address in data-src); its page names the next
      // and previous episodes by id. Novels live at the same addresses,
      // so a page is a comic by what it says it is, not by its address.
      name: "Tapas",
      host: /(^|\.)tapas\.io$/i,
      comic: (url, html) => /^\/episode\/\d+/.test(new URL(url).pathname) && !!html
        && (/property="og:type" content="comicpanda:webcomic_episode"/.test(html) || (html.match(/class="content__img/g) || []).length >= 4),
      async contents(doc, url) {
        if (!/^\/series\/[^/]+(\/(info|episodes))?\/?$/.test(new URL(url).pathname)) return null;
        const links = await tapasEpisodes(doc, url);
        return links.length ? { title: tapasSeries(doc) || text(doc.querySelector("title")), links } : null;
      },
      async list(doc, url) {
        if (/^\/series\//.test(new URL(url).pathname)) return tapasEpisodes(doc, url);
        const a = doc.querySelector("a[href*='/series/'][href$='/info'], a[href*='/series/'][href$='/episodes']");
        if (!a) return [];
        const at = absolute(a.getAttribute("href"), url);
        return tapasEpisodes(parse((await get(at)).text, at), at);
      },
      chapter(doc, url) {
        const wrap = doc.querySelector(".js-episode-wrap[data-ep-id]");
        if (!wrap) return null;
        return {
          content: null,
          title: (wrap.getAttribute("data-ep-title") || text(doc.querySelector(".viewer__header .title"))).trim(),
          series: tapasSeries(doc),
          byline: [...new Set([...doc.querySelectorAll(".viewer-section--episode a.name")].map(text).filter(Boolean))].join(", "),
          next: tapasEpisode(wrap.getAttribute("data-next-id")),
          prev: tapasEpisode(wrap.getAttribute("data-prev-id")),
        };
      },
    },
    {
      name: "Wattpad",
      host: /(^|\.)wattpad\.com$/i,
      // A part's later pages (/page/2) are the same part.
      clean(url) {
        const u = new URL(url);
        u.pathname = u.pathname.replace(/\/page\/\d+\/?$/, "");
        return u.href;
      },
      // The whole part's text, every page of it, added to its page.
      async prepare(html) {
        const part = wattpadPart(html);
        const from = part && part.text_url && httpUrl(part.text_url.text);
        if (!from) return html;
        const pages = [];
        try {
          for (let n = 1; n <= Math.min(part.pages || 1, 60); n++) pages.push((await get(from + n)).text);
        } catch (e) {
          throw new SaveError("Wattpad didn't send the whole chapter. Try again in a minute.");
        }
        const box = '<div id="co-wattpad-text">' + pages.join("\n") + "</div>";
        return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, box + "</body>") : html + box;
      },
      // A story's page lists its parts only once drawn, so they're read
      // from its first part's page, which has them all.
      async contents(doc, url) {
        if (!/^\/story\/\d+/.test(new URL(url).pathname)) return null;
        const start = [...doc.querySelectorAll("a[href]")].map((a) => absolute(a.getAttribute("href"), url)).find((h) => /^https:\/\/(www\.)?wattpad\.com\/\d+(-[^/]*)?$/.test(h || ""));
        if (!start) return null;
        const part = wattpadPart((await get(start)).text);
        const links = wattpadLinks(part);
        return links.length ? { title: (part.group && part.group.title) || text(doc.querySelector("h1")), links } : null;
      },
      list(doc, url, html) {
        return wattpadLinks(wattpadPart(html || ""));
      },
      chapter(doc, url, html) {
        const part = wattpadPart(html || "");
        if (!part) return null;
        const content = doc.createElement("div");
        const box = doc.getElementById("co-wattpad-text");
        if (box) content.append(...[...box.childNodes].map((n) => n.cloneNode(true)));
        else if (part.storyText) content.innerHTML = parse("<body>" + part.storyText, url).body.textContent;
        const links = wattpadLinks(part);
        const at = links.indexOf(httpUrl(part.url));
        const group = part.group || {};
        return {
          content,
          title: String(part.title || "").trim(),
          series: String(group.title || "").trim(),
          byline: String((group.user && group.user.name) || "").trim(),
          next: httpUrl(part.nextPart && part.nextPart.url) || (at >= 0 ? links[at + 1] || "" : undefined),
          prev: at > 0 ? links[at - 1] : at === 0 ? "" : undefined,
        };
      },
    },
    {
      // A serial on Blogger posts each chapter in parts and tags the parts
      // with the chapter's label ("ch1", "ch2"). A label's page is saved
      // as one chapter, its posts in order, read from the blog's feed; the
      // labels in order are the contents. A single post saves on its own,
      // with Newer and Older Post as next and previous.
      name: "Blogger",
      host: /\.blogspot\.com$/i,
      fetch(url) {
        const u = new URL(url);
        const label = bloggerLabel(u);
        if (label != null) return u.origin + "/feeds/posts/default/-/" + encodeURIComponent(label) + "?alt=json&max-results=150";
        u.searchParams.delete("m");
        return u.href;
      },
      clean(url) {
        const u = new URL(url);
        const m = u.pathname.match(/^\/feeds\/posts\/default\/-\/([^/]+)/);
        if (m) return u.origin + "/search/label/" + m[1];
        u.searchParams.delete("m");
        u.searchParams.delete("max-results");
        return u.href;
      },
      // The blog's home page, or a page of its own titled as contents.
      async contents(doc, url) {
        const u = new URL(url);
        const home = u.pathname === "/" || u.pathname === "";
        if (!home && !(/^\/p\//.test(u.pathname) && /contents|chapters/i.test(text(doc.querySelector("title")) + " " + text(doc.querySelector(".post-title, h1, h3")))) ) return null;
        const got = await bloggerChapters(u.origin);
        return got.links.length >= 3 ? got : null;
      },
      async list(doc, url) {
        return (await bloggerChapters(new URL(url).origin)).links;
      },
      chapter(doc, url, raw) {
        const u = new URL(url);
        const label = bloggerLabel(u);
        if (label != null) return bloggerLabelChapter(doc, u, label, raw);
        const body = doc.querySelector(".post-body");
        if (!body) return null;
        const content = doc.createElement("div");
        content.append(body.cloneNode(true));
        const link = (sel) => { const a = doc.querySelector(sel); return a ? absolute(a.getAttribute("href"), url).replace(/[?&]m=1\b/, "") : ""; };
        const og = doc.querySelector('meta[property="og:site_name"]');
        return {
          content,
          siteName: u.hostname,
          title: text(doc.querySelector(".post-title")),
          series: (og && og.content.trim()) || text(doc.querySelector(".header h1, #header h1")),
          next: link("a.blog-pager-newer-link, #blog-pager-newer-link a"),
          prev: link("a.blog-pager-older-link, #blog-pager-older-link a"),
        };
      },
    },
  ];

  // Every episode on a WEBTOON series' list, oldest first: page after
  // page (&page=2…) until one adds nothing new.
  async function webtoonEpisodes(doc, u) {
    const read = (d) => [...d.querySelectorAll("li._episodeItem a[href], #_listUl a.detail_list_link[href]")].map((a) => absolute(a.getAttribute("href"), u.href));
    const all = new Set(read(doc));
    for (let page = 2; page <= 200; page++) {
      const at = new URL(u.href);
      at.searchParams.set("page", page);
      let more;
      try { more = read(parse((await get(at.href, siteRule(at.href) && siteRule(at.href).headers)).text, at.href)).filter((l) => !all.has(l)); } catch (e) { break; }
      if (!more.length) break;
      more.forEach((l) => all.add(l));
    }
    const no = (l) => Number(new URL(l).searchParams.get("episode_no")) || 0;
    return uniqueLinks([...all].filter(Boolean)).sort((a, b) => no(a) - no(b));
  }

  // ---- Wattpad (0.29.1) ----
  // A part's page carries its details in `window.prefetched` (the
  // story's parts, the next part, how many pages of text) but only the
  // first page of the text: the rest comes from the storytext address it
  // names, a page at a time.
  function wattpadPart(html) {
    const at = html.indexOf("window.prefetched");
    if (at < 0) return null;
    const start = html.indexOf("{", at);
    let all;
    try { all = JSON.parse(balanced(html, start)); } catch (e) { return null; }
    const key = all && Object.keys(all).find((k) => /^part\.\d+\.metadata$/.test(k));
    return key && all[key] && all[key].data ? all[key].data : null;
  }
  const wattpadLinks = (part) => uniqueLinks(((part && part.group && part.group.parts) || []).map((p) => httpUrl(p && p.url)));
  const httpUrl = (u) => { try { const x = new URL(String(u || "")); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };

  // ---- Tapas (0.29.1) ----
  // A series' page lists its first twenty episodes, oldest first; the
  // rest come from its episodes address a page at a time, as JSON with
  // the list's HTML in data.body. If that fails, the twenty are kept.
  // The page's own series (its tracking data names it), not one of the
  // series it recommends.
  const tapasSeriesId = (doc) => {
    const n = doc.querySelector("[data-tiara-page-meta-type='series_id'][data-tiara-page-meta-id]:not(.js-recommended-series)");
    return n ? n.getAttribute("data-tiara-page-meta-id") : "";
  };
  const tapasSeries = (doc) => {
    const id = tapasSeriesId(doc);
    const n = id && [...doc.querySelectorAll("[data-tiara-event-meta-series]:not(.js-recommended-series)")].find((e) =>
      e.getAttribute("data-tiara-event-meta-series-id") === id || (e.getAttribute("data-tiara-event-meta-type") === "series_id" && e.getAttribute("data-tiara-event-meta-id") === id));
    return n ? n.getAttribute("data-tiara-event-meta-series").trim() : "";
  };
  const tapasEpisode = (id) => (Number(id) > 0 ? "https://tapas.io/episode/" + Number(id) : "");
  async function tapasEpisodes(doc, url) {
    const read = (d, base) => [...d.querySelectorAll("a[href*='/episode/']")]
      .filter((a) => a.closest(".episode-list, .js-episode-list") || a.classList.contains("episode-item"))
      .map((a) => absolute(a.getAttribute("href"), base));
    const all = read(doc, url);
    const more = doc.querySelector(".js-episode-loading-indicator[data-has-next='true']");
    const id = tapasSeriesId(doc);
    if (more && /^\d+$/.test(id || "")) {
      const since = more.getAttribute("data-since") || "";
      for (let page = Number(more.getAttribute("data-page")) || 2; page <= 100; page++) {
        const at = "https://tapas.io/series/" + id + "/episodes?page=" + page + "&sort=OLDEST&init_load=0&since=" + encodeURIComponent(since) + "&max_limit=20";
        let data;
        try { data = JSON.parse((await get(at)).text).data; } catch (e) { break; }
        if (!data || typeof data.body !== "string") break;
        const got = read(parse("<body><ul class='episode-list'>" + data.body + "</ul>", at), at).filter((l) => !all.includes(l));
        all.push(...got);
        if (!got.length || !(data.pagination && data.pagination.has_next)) break;
      }
    }
    return uniqueLinks(all.filter(Boolean));
  }

  // "ch12" for /search/label/ch12; null for any other page.
  function bloggerLabel(u) {
    const m = u.pathname.match(/^\/search\/label\/([^/]+)\/?$/);
    return m ? decodeURIComponent(m[1]) : null;
  }
  const CHAPTER_LABEL = /^(?:ch|chap|chapter)[\s._-]*(\d+)$/i;
  const labelNumber = (t) => { const m = String(t || "").match(CHAPTER_LABEL); return m ? Number(m[1]) : null; };
  const labelUrl = (origin, t) => origin + "/search/label/" + encodeURIComponent(t);

  async function bloggerChapters(origin) {
    const res = await get(origin + "/feeds/posts/summary?alt=json&max-results=0");
    let feed;
    try { feed = JSON.parse(res.text).feed; } catch (e) { return { title: "", links: [] }; }
    const labels = (feed.category || []).map((c) => c.term).filter((t) => labelNumber(t) != null);
    labels.sort((a, b) => labelNumber(a) - labelNumber(b));
    return { title: (feed.title && feed.title.$t) || "", links: labels.map((t) => labelUrl(origin, t)) };
  }

  // A serial that posts by length rather than by chapter (The Zombie
  // Knight Saga) starts each chapter partway through a post: a heading
  // ("Chapter Two: …") over a short line linking to the chapter's label
  // ("Click to display entire chapter at once"). A label's posts then
  // carry the end of the chapter before and the start of the next one.
  // Both are cut at those headings, and the links to labels go.
  function trimToChapter(doc, content, label) {
    const same = (t) => (labelNumber(t) != null ? labelNumber(t) === labelNumber(label) : t.toLowerCase() === label.toLowerCase());
    const marks = [];
    for (const a of content.querySelectorAll("a[href*='/search/label/']")) {
      const line = a.parentElement;
      if (!line || line === content || text(line).length > 120 || marks.some((m) => m.line === line)) continue;
      let t;
      try { t = bloggerLabel(new URL(a.getAttribute("href"), "https://blogger.invalid")); } catch (e) { t = null; }
      if (t == null) continue;
      let head = line.previousSibling;
      while (head && (head.nodeName === "BR" || (head.nodeType === 3 && !head.textContent.trim()))) head = head.previousSibling;
      head = head && head.nodeType === 1 && /^(chapter|ch\.?)\s/i.test(text(head)) && text(head).length < 200 ? head : null;
      marks.push({ line, head, own: same(t) });
    }
    if (!marks.length) return;
    const cut = (from, to) => {
      const r = doc.createRange();
      if (from) r.setStartBefore(from); else r.setStart(content, 0);
      if (to) r.setEndBefore(to); else r.setEnd(content, content.childNodes.length);
      r.deleteContents();
    };
    const own = marks.findIndex((m) => m.own);
    if (own >= 0) cut(null, marks[own].head || marks[own].line);
    const next = marks.find((m, i) => i > own && !m.own);
    if (next) cut(next.head || next.line, null);
    for (const m of marks) if (content.contains(m.line)) m.line.remove();
    // What the cuts leave at either end: breaks, rules and empty wrappers.
    const bare = (n) => n && (n.nodeName === "BR" || n.nodeName === "HR" || (n.nodeType === 3 && !n.textContent.trim())
      || (n.nodeType === 1 && !text(n) && !n.querySelector("img, video, iframe, picture")));
    for (const edge of ["firstChild", "lastChild"]) {
      for (let box = content; box && box.nodeType === 1;) {
        while (bare(box[edge])) box[edge].remove();
        box = box[edge];
      }
    }
  }

  // One chapter from its label's feed: the posts oldest first, a rule
  // between them; next and previous are the neighbouring labels when the
  // blog has them.
  function bloggerLabelChapter(doc, u, label, raw) {
    let feed;
    try { feed = JSON.parse(raw).feed; } catch (e) { return null; }
    const posts = (feed.entry || []).filter((e) => e.content && e.content.$t)
      .sort((a, b) => String(a.published && a.published.$t).localeCompare(String(b.published && b.published.$t)));
    if (!posts.length) return null;
    const content = doc.createElement("div");
    posts.forEach((e, i) => {
      if (i) content.append(doc.createElement("hr"));
      const part = doc.createElement("div");
      part.innerHTML = e.content.$t;
      content.append(part);
    });
    trimToChapter(doc, content, label);
    const n = labelNumber(label);
    const terms = (feed.category || []).map((c) => c.term);
    const near = (d) => { const t = n == null ? null : terms.find((x) => labelNumber(x) === n + d); return t ? labelUrl(u.origin, t) : ""; };
    const author = posts[0].author && posts[0].author[0] && posts[0].author[0].name;
    return {
      content,
      siteName: u.hostname,
      title: n == null ? label : "Chapter " + n,
      series: (feed.title && feed.title.$t) || "",
      byline: (author && author.$t && !/^unknown$/i.test(author.$t)) ? author.$t : "",
      next: near(1),
      prev: near(-1),
    };
  }

  function siteRule(url) {
    let host;
    try { host = new URL(url).hostname; } catch (e) { return null; }
    return SITES.find((s) => s.host.test(host)) || null;
  }

  function siteName(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }

  // ---- Fetching ----

  // `again`: worth one more try at once (1.10.1). A first save often
  // failed where Retry then worked: the connection still waking as the app
  // comes up from a share, or a page's first drawing timing out while the
  // drawing WebView starts.
  // `gone`: the page is missing or refuses (404, 410, 403), where the
  // Wayback Machine's copy may still be had (1.15.0).
  class SaveError extends Error {
    constructor(message, again, gone) { super(message); this.again = !!again; this.gone = !!gone; }
  }

  // Thrown for a contents page instead of saving it: `contents` holds its
  // title and chapter links, for Save several.
  class ContentsPage extends SaveError {
    constructor(contents) {
      super("This is a list of chapters, not a chapter.");
      this.contents = contents;
    }
  }

  async function get(url, headers) {
    let res;
    try {
      res = await C.platform.fetchText(url, { headers });
    } catch (e) {
      if (/time(d)?\s?out/i.test((e && e.message) || "")) throw new SaveError("The site didn't answer. Try again, or later on a better connection.", true);
      throw new SaveError(C.platform.canFetchPages
        ? "Couldn't reach this page. Check the link, or try again when you're online."
        : "This browser can't reach that site directly. Save it in Waypage on your phone, then bring it here with a backup.", C.platform.canFetchPages);
    }
    if (res.status === 429) throw new SaveError("The site asked to slow down. Try again in a few minutes.");
    if (res.status === 404 || res.status === 410) throw new SaveError("That page doesn't exist any more. Check the link.", false, true);
    if (res.status >= 400) throw new SaveError("The site answered with an error (" + res.status + "). Try again later.", res.status >= 500 || res.status === 403, res.status === 403);
    return res;
  }

  // Hebrew and Arabic pages usually say so on <html> or <body>, or by their
  // language; when they don't (ynet's article markup), the letters decide.
  // The saved page keeps it, or the reader lays it out left to right.
  const RTL_LANGS = /^(he|iw|yi|ar|fa|ur|ps|sd|ckb|dv)\b/i;
  function textDir(doc, text) {
    const root = doc.documentElement;
    const d = (root.getAttribute("dir") || (doc.body && doc.body.getAttribute("dir")) || "").toLowerCase();
    if (d === "rtl") return "rtl";
    if (RTL_LANGS.test(root.getAttribute("lang") || "")) return "rtl";
    const sample = String(text != null ? text : (doc.body && doc.body.textContent) || "").slice(0, 4000);
    const rtl = (sample.match(/[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g) || []).length;
    const ltr = (sample.match(/[A-Za-z\u00C0-\u024F\u0400-\u04FF]/g) || []).length;
    return rtl > ltr ? "rtl" : "";
  }

  function parse(html, base) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const b = doc.createElement("base");
    b.href = base;
    doc.head.prepend(b);
    return doc;
  }

  async function fromWikipedia(page) {
    const api = "https://" + page.host + "/api/rest_v1/page/html/" + encodeURIComponent(page.title) + "?redirect=true";
    const res = await get(api, { Accept: "text/html; charset=utf-8", "Api-User-Agent": "Waypage (https://github.com/danielnoam/waypage)" });
    const url = "https://" + page.host + "/wiki/" + encodeURIComponent(page.title).replace(/%2F/g, "/");
    const doc = parse(res.text, url);
    doc.querySelectorAll(".navbox, .vertical-navbox, .sistersitebox, .metadata, .ambox, .noprint, .mw-empty-elt, [role=navigation], .portalbox, .side-box, .hatnote")
      .forEach((n) => n.remove());
    doc.querySelectorAll("img").forEach((img) => {
      const src = absolute(img.getAttribute("src") || "", "https://" + page.host + "/");
      if (!src) return;
      const fw = parseInt(img.getAttribute("data-file-width"), 10) || 0;
      img.setAttribute("src", src);
      img.removeAttribute("srcset");
      if (/upload\.wikimedia\.org\/.*\/thumb\//.test(src)) {
        img.setAttribute("data-co-preview", wikimediaThumb(src, WIKI_PREVIEW, fw));
        img.setAttribute("data-co-full", wikimediaThumb(src, WIKI_FULL, fw));
      }
    });
    await credits(doc, page.host);
    doc.querySelectorAll("video").forEach((v) => {
      const file = v.getAttribute("resource");
      if (file) v.setAttribute("data-co-link", absolute(file, url) || "");
      v.setAttribute("data-co-site", "Wikipedia");
    });
    const title = (doc.querySelector("head > title") || {}).textContent || page.title.replace(/_/g, " ");
    return {
      url, title: title.trim(), site: "Wikipedia", byline: "",
      body: doc.body, base: url,
      licence: "wikipedia", dir: textDir(doc),
    };
  }

  // Each image's author and licence from the file's page ("Jane Doe,
  // CC BY-SA 4.0"), as data-co-credit; rebuild() puts it under the image.
  // Icons and flags are left out, and so is everything if the API fails.
  async function credits(doc, host) {
    const files = new Map();
    for (const img of doc.querySelectorAll("img[resource]")) {
      if ((parseInt(img.getAttribute("width"), 10) || 0) < 100) continue;
      let name;
      try { name = decodeURIComponent(img.getAttribute("resource").replace(/^.*?\/(?=[^/]+:)/, "")).replace(/_/g, " "); } catch (e) { continue; }
      if (!files.has(name)) files.set(name, []);
      files.get(name).push(img);
    }
    const names = [...files.keys()];
    for (let i = 0; i < names.length; i += 50) {
      const titles = names.slice(i, i + 50);
      let data;
      try {
        const res = await get("https://" + host + "/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=extmetadata" +
          "&iiextmetadatafilter=Artist%7CLicenseShortName&origin=*&titles=" + encodeURIComponent(titles.join("|")),
        { "Api-User-Agent": "Waypage (https://github.com/danielnoam/waypage)" });
        data = JSON.parse(res.text).query;
      } catch (e) { return; }
      const renamed = new Map(((data && data.normalized) || []).map((n) => [n.to, n.from]));
      for (const pg of (data && data.pages) || []) {
        const meta = pg.imageinfo && pg.imageinfo[0] && pg.imageinfo[0].extmetadata;
        const imgs = files.get(pg.title) || files.get(renamed.get(pg.title));
        if (!meta || !imgs) continue;
        const credit = creditLine(meta.Artist && meta.Artist.value, meta.LicenseShortName && meta.LicenseShortName.value);
        if (credit) imgs.forEach((img) => img.setAttribute("data-co-credit", credit));
      }
    }
  }

  // "Jane Doe, CC BY-SA 4.0" from Commons' Artist (HTML) and licence.
  function creditLine(artistHtml, licence) {
    const text = (h) => new DOMParser().parseFromString(String(h || ""), "text/html").body.textContent.replace(/\s+/g, " ").trim();
    let artist = text(artistHtml);
    if (artist.length > 80) artist = artist.slice(0, 79).trimEnd() + "…";
    return [artist, text(licence)].filter(Boolean).join(", ");
  }

  const CHECK_TITLE = /^(just a moment|attention required|access denied|are you a robot)/i;

  // Reads the article out of a page's HTML, or with `comic` its pictures.
  // null when there isn't enough text (or no pictures), or the page is a
  // browser check, so the caller can try drawing it.
  function readArticle(html, finalUrl, comic, site, asPage) {
    const doc = parse(html, finalUrl);
    const docTitle = (doc.querySelector("title") || {}).textContent || "";
    if (CHECK_TITLE.test(docTitle.trim())) return { check: true };
    const og = doc.querySelector('meta[property="og:title"]');
    const h1s = doc.querySelectorAll("h1");
    const headline = (og && og.content) || (h1s.length === 1 ? h1s[0].textContent : "");
    // A comic chapter's page often lists every chapter in a menu, so it is
    // never taken for a contents page.
    // A site that says which of its pages are comics (WEBTOON) still names
    // the episode, the series and the next one.
    const own = site && site.chapter && (!comic || site.comic) ? site.chapter(doc, finalUrl, html) : null;
    const contents = !comic && !asPage && !own && !site && contentsOf(doc, finalUrl, (headline || docTitle).replace(/\s+/g, " ").trim());
    if (contents) return { contents };
    let next = nextLink(doc, finalUrl);
    let prev = nextLink(doc, finalUrl, true);
    resolveLazyImages(doc, finalUrl);
    if (!comic && own && own.content && own.content.textContent.trim().length >= MIN_TEXT / 5) {
      if (own.next !== undefined) next = own.next;
      if (own.prev !== undefined) prev = own.prev;
      const t = own.content.textContent;
      const article = { content: own.content.innerHTML, title: own.title, byline: own.byline, siteName: own.siteName || site.name, textContent: t, lang: "", dir: "" };
      return { doc, docTitle, headline: own.title || headline, next, prev, article, series: own.series || "" };
    }
    if (comic) {
      let panels = comicPanels(doc, finalUrl);
      const listed = site && site.panels ? site.panels(doc, finalUrl, html) : null;
      if (listed && listed.length > (panels ? panels.length : 0)) panels = listed;
      if (own && own.next !== undefined) next = own.next;
      if (own && own.prev !== undefined) prev = own.prev;
      return panels ? { doc, docTitle, headline: (own && own.title) || headline, next, prev, panels, series: (own && own.series) || "", byline: (own && own.byline) || "", blanks: standIns(doc) } : null;
    }
    if (typeof window.Readability !== "function") throw new SaveError("The reader part of the app didn't load. Restart Waypage.");
    const article = new window.Readability(doc, { charThreshold: 500, keepClasses: false }).parse();
    if (!article || (article.textContent || "").trim().length < MIN_TEXT) return null;
    if (own && own.next !== undefined) next = own.next;
    if (own && own.prev !== undefined) prev = own.prev;
    return { doc, docTitle, headline: (own && own.title) || headline, next, prev, article, series: (own && own.series) || "" };
  }

  // A page cut short for subscribers or signed-in readers (1.7.0). Waypage
  // fetches with no one signed in, so a paywalled article comes as its
  // first paragraphs. Told by the site saying the article isn't free
  // (schema.org's isAccessibleForFree, set for search engines, or a
  // content tier of locked or metered) with the text short, or by short
  // text that ends asking you to subscribe or sign in.
  const LOCKED = /"isAccessibleForFree"\s*:\s*"?false"?|<meta[^>]+content_tier[^>]+content=["']?(?:locked|metered)/i;
  const ASKS = /\b(subscribe|subscription|subscribers?|sign in|log in|create (?:a )?(?:free )?account|become a member|members?[- ]only|to keep reading|to continue reading|unlock this)\b/i;
  function cutShort(html, text) {
    const t = (text || "").replace(/\s+/g, " ").trim();
    if (LOCKED.test(html || "") && t.length < 5000) return true;
    return t.length < 2500 && ASKS.test(t.slice(-300));
  }

  // `given` (1.34.0) is a page a computer's browser already has open,
  // { url, html }, sent by the Send to Waypage bookmark: read as it is,
  // with nothing fetched, and saved as that one page.
  async function fromAnyPage(url, onDrawing, comic, asPage, given) {
    const site = siteRule(url);
    if (given) asPage = true;
    const res = given ? { status: 200, url: given.url, text: given.html }
      : await get(site && site.fetch ? site.fetch(url) : url, site && site.headers);
    let finalUrl = res.url || url;
    if (site && site.clean) finalUrl = site.clean(finalUrl);
    if (isArchive(finalUrl)) res.text = unWayback(res.text);
    // Some sites keep comics and novels at the same addresses (Tapas).
    if (!comic && site && site.comic && site.comic(finalUrl, res.text)) comic = true;
    if (site && site.prepare && !comic) {
      try { res.text = await site.prepare(res.text, finalUrl); } catch (e) { if (!given) throw e; }
    }
    if (site && site.contents && !comic && !asPage) {
      const own = await site.contents(parse(res.text, finalUrl), finalUrl, res.text);
      if (own && own.links.length) throw new ContentsPage(own);
    }
    let got = readArticle(res.text, finalUrl, comic, site, asPage);
    let html = res.text;
    // Pages that build themselves with scripts, or wait behind a browser
    // check, get drawn in a hidden WebView on Android and read again. The
    // saved copy is the same script-free HTML as any other page's.
    if ((!got || got.check) && C.platform.canRender) {
      if (onDrawing) onDrawing();
      const drawn = await C.platform.render(finalUrl, { scroll: comic });
      if (drawn) {
        finalUrl = drawn.url;
        html = drawn.text;
        got = readArticle(drawn.text, finalUrl, comic, siteRule(finalUrl), asPage);
      }
    } else if (comic && got && got.panels && got.blanks >= 2 && C.platform.canRender) {
      // A comic whose pictures fill in as it scrolls (1.17.0): drawn in the
      // hidden browser and scrolled to the end, then read again, kept if
      // that found more of them.
      if (onDrawing) onDrawing();
      const drawn = await C.platform.render(finalUrl, { scroll: true });
      const again = drawn && readArticle(drawn.text, drawn.url, comic, siteRule(drawn.url), asPage);
      if (again && again.panels && again.panels.length > got.panels.length) {
        finalUrl = drawn.url;
        html = drawn.text;
        got = again;
      }
    }
    if (got && got.check) throw new SaveError("The site asked for a browser check, so Waypage can't save it yet.", true);
    if (got && got.contents) throw new ContentsPage(got.contents);
    if (!got && comic) throw new SaveError("Waypage couldn't find the pictures on this page.");
    if (!got) {
      throw new SaveError(C.platform.canRender
        ? "Waypage couldn't find the article on this page, even after letting it draw itself."
        : "This page builds itself with JavaScript, which Waypage can't save yet.", C.platform.canRender);
    }
    if (got.panels) {
      const { doc, docTitle, headline, next, prev, panels, series, byline } = got;
      const body = doc.implementation.createHTMLDocument("").body;
      for (const src of panels) {
        const img = body.ownerDocument.createElement("img");
        img.setAttribute("src", src);
        img.setAttribute("alt", "");
        body.append(img);
      }
      return {
        url: finalUrl, comic: true, series: series || "",
        title: (headline.trim() || docTitle || siteName(finalUrl)).trim().replace(/\s+/g, " "),
        site: site && site.comic ? site.name : siteName(finalUrl), byline: byline || "", body, base: finalUrl, licence: null,
        lang: (doc.documentElement.getAttribute("lang") || "").trim(), dir: "", next, prev, icon: siteIcon(doc, finalUrl),
      };
    }
    const { doc, docTitle, headline, next, prev, article, series } = got;
    const body = new DOMParser().parseFromString(article.content, "text/html").body;
    return {
      url: finalUrl, series: series || "",
      title: (headline.trim() || article.title || docTitle || siteName(finalUrl)).trim().replace(/\s+/g, " "),
      site: (article.siteName || siteName(finalUrl)).trim(),
      byline: (article.byline || "").trim(),
      body, base: finalUrl, licence: null,
      lang: (doc.documentElement.getAttribute("lang") || article.lang || "").trim(),
      dir: article.dir === "rtl" || textDir(doc, article.textContent) === "rtl" ? "rtl" : "",
      next, prev, icon: siteIcon(doc, finalUrl), cut: cutShort(html, article.textContent),
    };
  }

  // ---- The Wayback Machine (1.15.0) ----

  // The Internet Archive's newest good copy of a page: { url, at } with
  // `at` its time (ms), or null when it has none.
  async function findArchived(url) {
    let res;
    try { res = await C.platform.fetchText("https://archive.org/wayback/available?url=" + encodeURIComponent(url)); }
    catch (e) { throw new SaveError("Couldn't reach the Internet Archive. Try again when you're online.", true); }
    if (res.status >= 400) throw new SaveError("The Internet Archive didn't answer. Try again later.", true);
    let snap = null;
    try { snap = JSON.parse(res.text).archived_snapshots.closest; } catch (e) { snap = null; }
    if (!snap || !snap.available || String(snap.status) !== "200" || !/^\d{14}$/.test(snap.timestamp || "")) return null;
    const t = snap.timestamp;
    const at = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10), +t.slice(10, 12), +t.slice(12, 14));
    return { url: "https://web.archive.org/web/" + t + "/" + url, at };
  }
  const isArchive = (url) => /^https?:\/\/web\.archive\.org\/web\//.test(url);
  // The bar the Wayback Machine puts on every page it serves.
  const unWayback = (html) => html.replace(/<!--\s*BEGIN WAYBACK TOOLBAR INSERT\s*-->[\s\S]*?<!--\s*END WAYBACK TOOLBAR INSERT\s*-->/i, "");

  // Lazy loaders keep the real image in data-src, data-srcset or a
  // <picture>'s <source>, with a placeholder in src. Done before Readability,
  // which drops images it thinks are empty.
  // Pictures still showing a stand-in once every known lazy loader is
  // undone (1.17.0): their address is only in the page's scripts, which
  // swap it in as the reader scrolls.
  const STAND_IN = /^data:|^$|transparen|blank|spacer|placeholder|loading|lazy|1x1/i;
  const standIns = (doc) => [...doc.querySelectorAll("body img")].filter((img) => STAND_IN.test(img.getAttribute("src") || "") && !img.getAttribute("srcset")).length;
  const LAZY_URL = /^(https?:)?\/\/[^\s"'<>]+\.(jpe?g|png|gif|webp|avif)(\?[^\s"'<>]*)?$/i;
  function resolveLazyImages(doc, base) {
    doc.querySelectorAll("picture").forEach((pic) => {
      const img = pic.querySelector("img");
      if (!img) return;
      const sets = [...pic.querySelectorAll("source[srcset], source[data-srcset]")]
        .filter((s) => !/avif|jxl/.test(s.getAttribute("type") || ""))
        .map((s) => s.getAttribute("srcset") || s.getAttribute("data-srcset"));
      if (sets.length && !img.getAttribute("srcset")) img.setAttribute("srcset", sets[0]);
    });
    doc.querySelectorAll("img").forEach((img) => {
      for (const a of ["data-src", "data-lazy-src", "data-original", "data-url", "data-hi-res-src"]) {
        const v = img.getAttribute(a);
        if (v && !/^data:/.test(v)) { img.setAttribute("src", v); break; }
      }
      // A loader whose attribute isn't one of those (1.16.0): any data-*
      // holding a picture's address, while src is a blank stand-in.
      if (/^data:|^$|transparen|blank|spacer|placeholder|lazy|loading|1x1/i.test(img.getAttribute("src") || "")) {
        const other = [...img.attributes].find((a) => /^data-/.test(a.name) && LAZY_URL.test(a.value.trim()));
        if (other) img.setAttribute("src", other.value.trim());
      }
      const lazySet = img.getAttribute("data-srcset") || img.getAttribute("data-lazy-srcset");
      if (lazySet) img.setAttribute("srcset", lazySet);
      const src = img.getAttribute("src") || "";
      if ((!src || /^data:/.test(src)) && img.getAttribute("srcset")) {
        const pick = pickWidth(parseSrcset(img.getAttribute("srcset"), base), PREVIEW_WIDTH);
        if (pick) img.setAttribute("src", pick);
      }
    });
  }

  // ---- Rebuilding ----

  // Rebuilds `body` into `out` (a fresh document) from the allowlist.
  // Returns the images and videos found, for saveImages().
  function rebuild(body, base, pageUrl, out) {
    const media = [];
    const pageNoHash = pageUrl.split("#")[0];

    function videoCard(link, thumb, title, site) {
      const fig = out.createElement("figure");
      fig.className = "co-video";
      const a = out.createElement("a");
      a.href = link;
      if (thumb) {
        const img = out.createElement("img");
        img.alt = "";
        media.push({ el: img, preview: thumb, full: null, video: true });
        a.append(img);
      }
      const play = out.createElement("span");
      play.className = "co-play";
      play.setAttribute("aria-hidden", "true");
      a.append(play);
      const cap = out.createElement("figcaption");
      const t = out.createElement("span");
      t.className = "co-video-title";
      t.textContent = (title || "Video") + " · " + site;
      const note = out.createElement("span");
      note.className = "co-video-note";
      note.setAttribute("data-site", site);
      note.textContent = "Plays when you're back online";
      cap.append(t, note);
      fig.append(a, cap);
      return fig;
    }

    function video(node) {
      const tag = node.localName;
      const fig = node.closest("figure");
      const caption = fig && fig.querySelector("figcaption");
      const named = node.getAttribute("title") || node.getAttribute("aria-label") || (caption && caption.textContent.trim());
      const src = absolute(node.getAttribute("src") || node.getAttribute("data-src") || "", base) || "";
      if (tag === "iframe") {
        const yt = youtubeId(src);
        if (yt) return videoCard("https://www.youtube.com/watch?v=" + yt, "https://i.ytimg.com/vi/" + yt + "/hqdefault.jpg", named, "YouTube");
        const vm = vimeoId(src);
        if (vm) return videoCard("https://vimeo.com/" + vm, null, named, "Vimeo");
        return null;
      }
      if (tag === "video") {
        const source = node.querySelector("source[src]");
        const link = node.getAttribute("data-co-link") || src || (source && absolute(source.getAttribute("src"), base)) || pageUrl;
        const poster = absolute(node.getAttribute("poster") || "", base);
        return videoCard(link, poster && /^https?:/.test(poster) ? poster : null, named, node.getAttribute("data-co-site") || siteName(link));
      }
      return null;
    }

    function image(node) {
      const src = absolute(node.getAttribute("src") || "", base);
      if (!src || !/^https?:/.test(src)) return null;
      if (isTrackingPixel(node.getAttribute("width"), node.getAttribute("height"), src)) return null;
      const set = parseSrcset(node.getAttribute("srcset"), base);
      const preview = node.getAttribute("data-co-preview") || pickWidth(set, PREVIEW_WIDTH) || src;
      const full = node.getAttribute("data-co-full") || pickWidth(set, 1600) || src;
      const img = out.createElement("img");
      for (const a of ATTRS.img) {
        const v = node.getAttribute(a);
        if (v != null && (a === "alt" || /^\d+$/.test(v))) img.setAttribute(a, v);
      }
      const credit = node.getAttribute("data-co-credit");
      if (credit) img.setAttribute("data-credit", credit);
      media.push({ el: img, preview, full });
      return img;
    }

    function walk(from, to) {
      for (const node of [...from.childNodes]) {
        if (node.nodeType === 3) { to.append(out.createTextNode(node.data)); continue; }
        if (node.nodeType !== 1) continue;
        let tag = node.localName;
        if (tag === "iframe" || tag === "video") { const card = video(node); if (card) to.append(card); continue; }
        if (tag === "img") { const img = image(node); if (img) to.append(img); continue; }
        if (tag === "picture") { const img = node.querySelector("img"); if (img) { const i = image(img); if (i) to.append(i); } continue; }
        if (DROP.has(tag)) continue;
        if (/display:\s*none|visibility:\s*hidden/i.test(node.getAttribute("style") || "") || node.hasAttribute("hidden")) continue;
        if (tag === "h1") tag = "h2";
        if (!KEEP.has(tag)) { walk(node, to); continue; }
        const el = out.createElement(tag);
        for (const a of GLOBAL_ATTRS.concat(ATTRS[tag] || [])) {
          const v = node.getAttribute(a);
          if (v == null || a === "href") continue;
          el.setAttribute(a, v);
        }
        if (tag === "a") {
          const raw = node.getAttribute("href") || "";
          const abs = raw.startsWith("#") ? null : absolute(raw, base);
          if (raw.startsWith("#")) el.setAttribute("href", raw);
          else if (abs && abs.split("#")[0] === pageNoHash && abs.includes("#")) el.setAttribute("href", "#" + abs.split("#")[1]);
          else if (abs && /^(https?|mailto):/.test(abs)) el.setAttribute("href", abs);
        }
        walk(node, el);
        // A figure around an embed: the video card is the figure, and its
        // caption already became the card's title.
        const card = tag === "figure" && el.querySelector(".co-video");
        to.append(card || el);
      }
    }

    const root = out.createElement("div");
    root.className = "co-body";
    walk(body, root);
    // A credit goes under the image's caption; one outside a figure stays
    // on the image, for the image viewer.
    root.querySelectorAll("figure:not(.co-video) img[data-credit]").forEach((img) => {
      const fig = img.closest("figure");
      if (fig.querySelector(".co-credit")) { img.removeAttribute("data-credit"); return; }
      let cap = fig.querySelector("figcaption");
      if (!cap) { cap = out.createElement("figcaption"); fig.append(cap); }
      const line = out.createElement("small");
      line.className = "co-credit";
      line.textContent = img.getAttribute("data-credit");
      cap.append(line);
      img.removeAttribute("data-credit");
    });
    // Wrappers left empty once their media or chrome is gone.
    root.querySelectorAll("p, div, span:not(.co-play), section, figure, li").forEach((n) => {
      if (!n.textContent.trim() && !n.querySelector("img, figure, br, hr, table")) n.remove();
    });
    return { root, media };
  }

  // A saved page coming back in (an exported file, 0.18.0): the article
  // part of its body, rebuilt from the same allowlist plus the few classes
  // and attributes Waypage itself writes. Images keep only a data: picture
  // or an https link; anything else a hand-edited file carries is dropped.
  // Resolves to { root, images } with the data: pictures to write out.
  const CO_CLASS = /^co-(body|comic|video|play|video-title|video-note|credit|missing)$/;
  const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
  function cleanSaved(body, out) {
    const images = [];
    const https = (v) => (/^https:\/\//i.test(v || "") ? v : null);
    function walk(from, to) {
      for (const node of [...from.childNodes]) {
        if (node.nodeType === 3) { to.append(out.createTextNode(node.data)); continue; }
        if (node.nodeType !== 1) continue;
        let tag = node.localName;
        if (DROP.has(tag)) continue;
        if (tag === "h1") tag = "h2";
        if (!KEEP.has(tag)) { walk(node, to); continue; }
        const el = out.createElement(tag);
        for (const a of GLOBAL_ATTRS.concat(ATTRS[tag] || [])) {
          const v = node.getAttribute(a);
          if (v != null && a !== "href") el.setAttribute(a, v);
        }
        const cls = (node.getAttribute("class") || "").split(/\s+/).filter((c) => CO_CLASS.test(c));
        if (cls.length) el.className = cls.join(" ");
        if (tag === "a") {
          const h = node.getAttribute("href") || "";
          if (h.startsWith("#") || /^(https?|mailto):/i.test(h)) el.setAttribute("href", h);
        }
        // A book's own contents (files.js, 1.27.2).
        if (/^[1-3]$/.test(node.getAttribute("data-toc") || "")) {
          el.setAttribute("data-toc", node.getAttribute("data-toc"));
          el.setAttribute("data-toc-t", (node.getAttribute("data-toc-t") || "").slice(0, 200));
        }
        if (tag === "span" && node.hasAttribute("data-site")) el.setAttribute("data-site", node.getAttribute("data-site"));
        if (tag === "span" && cls.includes("co-play")) el.setAttribute("aria-hidden", "true");
        if (tag === "img") {
          const src = node.getAttribute("src") || "";
          for (const a of ["data-full", "data-preview", "data-thumb"]) if (https(node.getAttribute(a))) el.setAttribute(a, node.getAttribute(a));
          if (node.hasAttribute("data-credit")) el.setAttribute("data-credit", node.getAttribute("data-credit"));
          if (DATA_IMAGE.test(src)) images.push({ el, data: src });
          else if (https(src)) el.setAttribute("src", src);
          else if (!el.hasAttribute("data-full") && !el.hasAttribute("data-thumb")) continue;
          else el.className = "co-missing";
        }
        walk(node, el);
        to.append(el);
      }
    }
    body.querySelectorAll(".co-head, .co-licence, .co-next").forEach((n) => n.remove());
    const root = out.createElement("div");
    root.className = "co-body";
    walk(body.querySelector(".co-body") || body, root);
    return { root, images };
  }

  // ---- Media ----

  // Downloads one image into the page's directory; a preview much wider
  // than the screen needs is redrawn smaller (store.shrink). Resolves to
  // { rel, bytes } of the file kept.
  // A full image is made smaller too (1.18.0), unless that's turned off.
  async function keep(id, rel, url, mode, page) {
    const size = await C.store.download(id, rel, url, page);
    if (mode !== "full") return C.store.shrink(id, rel, size, PREVIEW_WIDTH);
    return compress ? C.store.squeeze(id, rel, size, FULL_WIDTH) : { rel, bytes: size };
  }

  // The site's icon beside the page, for a card with no picture of its
  // own; its link when it can't be kept (or in a browser).
  async function keepIcon(id, url, page) {
    if (!url) return { icon: null, bytes: 0 };
    if (!C.platform.native) return { icon: url, bytes: 0 };
    try {
      const m = url.split(/[?#]/)[0].match(/\.(png|ico|svg|jpe?g|gif|webp)$/i);
      const rel = "icon." + (m ? m[1].toLowerCase().replace("jpeg", "jpg") : "png");
      return { icon: rel, bytes: await C.store.download(id, rel, url, page) };
    } catch (e) { return { icon: url, bytes: 0 }; }
  }

  // A collection's cover, kept small beside the pages in _covers/; its
  // link in a browser or when it can't be fetched. Resolves to what
  // goes on the collection's entries: a file name there, or the link.
  async function keepCover(url, page) {
    if (!C.platform.native) return url;
    try {
      const rel = "c" + newId() + "." + extOf(url);
      const size = await C.store.download("_covers", rel, url, page);
      return (await C.store.shrink("_covers", rel, size, PREVIEW_WIDTH)).rel;
    } catch (e) { return url; }
  }

  // Downloads previews (or full images, or nothing, per the image setting)
  // into images/ beside page.html. A failed one keeps its link and is
  // counted as missing; the reader shows a placeholder for it offline.
  async function saveImages(id, media, mode, onProgress, page) {
    let done = 0, missing = 0, bytes = 0, thumb = null;
    const total = media.length;
    const queue = media.map((m, i) => ({ ...m, i }));
    const native = C.platform.native;

    async function one(m) {
      const url = mode === "full" && m.full ? m.full : m.preview;
      const fallback = m.full || url;
      if (!m.video) m.el.setAttribute("data-full", fallback);
      // A video's picture keeps its address too, so another device (sync)
      // can fetch it again (0.30.0).
      else m.el.setAttribute("data-thumb", url);
      if (!native) { m.el.setAttribute("src", url); return; }
      if (mode === "links") { m.el.setAttribute("data-full", fallback); m.el.className = "co-missing"; return; }
      const rel = "images/" + m.i + "." + extOf(url);
      try {
        const got = await keep(id, rel, url, mode, page);
        bytes += got.bytes;
        m.el.setAttribute("src", got.rel);
        if (!thumb && !m.video) thumb = got.rel;
      } catch (e) {
        missing++;
        m.el.setAttribute("data-full", fallback);
        m.el.setAttribute("data-preview", url);
        m.el.className = "co-missing";
      }
    }

    async function worker() {
      while (queue.length) {
        await one(queue.shift());
        done++;
        if (onProgress) onProgress(done, total);
      }
    }
    await Promise.all([1, 2, 3, 4].map(worker));
    if (!native) thumb = (media.find((m) => !m.video) || {}).preview || null;
    return { bytes, missing, thumb, total };
  }

  // ---- The page file ----

  function formatDate(ts) {
    return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function savedPageHtml(meta, root, out) {
    const head = out.createElement("header");
    head.className = "co-head";
    const line = out.createElement("p");
    line.className = "co-meta";
    line.textContent = [meta.site, (meta.file ? "added " : "saved ") + formatDate(meta.savedAt)].join(" · ");
    const h1 = out.createElement("h1");
    h1.textContent = meta.title;
    head.append(line, h1);
    if (meta.byline) {
      const by = out.createElement("p");
      by.className = "co-byline";
      by.textContent = meta.byline;
      head.append(by);
    }
    const foot = out.createElement("footer");
    foot.className = "co-licence";
    // A file of your own (0.31.0) has no address to go back to.
    if (meta.file) foot.append("Opened from " + meta.file.name + " on " + formatDate(meta.savedAt) + ".");
    const link = out.createElement("a");
    link.href = meta.url;
    link.textContent = "Read the original";
    if (!meta.file) foot.append(meta.licence === "wikipedia"
      ? "Text from Wikipedia, CC BY-SA 4.0, by Wikipedia contributors. "
      : meta.archived ? "Saved from the Internet Archive's copy of " + meta.site + " from " + formatDate(meta.archived) + ". "
        : "Saved from " + meta.site + " on " + formatDate(meta.savedAt) + ". ", link);
    const doc = out.implementation.createHTMLDocument(meta.title);
    if (meta.lang) doc.documentElement.lang = meta.lang;
    if (meta.dir) doc.documentElement.dir = meta.dir;
    doc.body.append(head, root);
    // Where a paywalled article stops, so the end of the teaser doesn't
    // read as the end of the story (1.7.0).
    if (meta.cut) {
      const cut = out.createElement("aside");
      cut.className = "co-cut";
      const more = out.createElement("a");
      more.href = meta.url;
      more.textContent = "Read the rest on " + meta.site;
      cut.append("This may be only the start. The site keeps the rest for subscribers or signed-in readers, and Waypage saves pages signed out. ", more);
      doc.body.append(cut);
    }
    doc.body.append(foot);
    return "<!doctype html>\n" + doc.documentElement.outerHTML;
  }

  // A page's words with a line break after each block, for search: the
  // article only, without the header and licence lines savedPageHtml adds.
  const BLOCKS = "p, li, h1, h2, h3, h4, h5, h6, figcaption, blockquote, pre, td, th, dt, dd, div, section, article";
  function plainText(root) {
    const copy = root.cloneNode(true);
    copy.querySelectorAll(".co-head, .co-licence, .co-next, .co-credit, script, style").forEach((n) => n.remove());
    copy.querySelectorAll(BLOCKS).forEach((n) => n.append("\n"));
    return copy.textContent.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  }

  // Edit clips (1.22.0): each match of `re` (global) in the clip's text
  // becomes rep(match), "" removing it, even across bold or links inside
  // one paragraph. The app's own lines (header, licence, next) stay as
  // they are, and a paragraph left with nothing in it goes. Resolves to
  // the number changed; `samples` collects a few, before and after.
  const LEAVES = "p, li, h1, h2, h3, h4, h5, h6, figcaption, blockquote, pre, td, th, dt, dd, caption, summary";
  const OURS = ".co-head, .co-licence, .co-next, .co-credit, script, style";
  function replaceText(body, re, rep, samples) {
    const doc = body.ownerDocument;
    const units = new Map();
    const walk = doc.createTreeWalker(body, 4);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.data || n.parentElement.closest(OURS)) continue;
      const key = n.parentElement.closest(LEAVES) || n;
      if (!units.has(key)) units.set(key, []);
      units.get(key).push(n);
    }
    let count = 0;
    for (const [key, nodes] of units) {
      const lens = nodes.map((n) => n.data.length);
      const starts = [];
      lens.reduce((at, len, i) => { starts[i] = at; return at + len; }, 0);
      const text = nodes.map((n) => n.data).join("");
      re.lastIndex = 0;
      const found = [...text.matchAll(re)].filter((m) => m[0]);
      if (!found.length) continue;
      const spot = (pos, end) => {
        const i = nodes.findIndex((n, k) => (end ? pos > starts[k] && pos <= starts[k] + lens[k] : pos >= starts[k] && pos < starts[k] + lens[k]));
        return [nodes[i], pos - starts[i]];
      };
      for (const m of found.reverse()) {
        const put = rep(m);
        if (samples && samples.length < 5) {
          const from = Math.max(0, m.index - 40), to = Math.min(text.length, m.index + m[0].length + 40);
          samples.push({ before: (from ? "…" : "") + text.slice(from, m.index), found: m[0], put, after: text.slice(m.index + m[0].length, to) + (to < text.length ? "…" : "") });
        }
        const r = doc.createRange();
        r.setStart(...spot(m.index, false));
        r.setEnd(...spot(m.index + m[0].length, true));
        r.deleteContents();
        if (put) r.insertNode(doc.createTextNode(put));
        count++;
      }
      if (key.nodeType === 1 && key !== body && !key.textContent.trim() && !key.querySelector("img, picture, video, iframe, svg, math, table")) key.remove();
    }
    return count;
  }

  // ---- Saving ----

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // Saves `url`; onProgress({ stage, done, total }) reports drawing a
  // script-built page, then images as they land. Resolves to the page's meta, which the library index lists.
  // `kind` "comic" saves the page's pictures as an image chapter instead
  // of reading an article out of it; it is chosen, never guessed.
  // `archived` ({ url, at }, from findArchived): the page is read from
  // the Wayback Machine's copy, and keeps its own address.
  async function save(url, { mode = "previews", kind = "article", asPage = false, onProgress, id: keepId, archived, given } = {}) {
    // A site's comic pages are saved as comics, with their full pictures,
    // whatever was picked.
    const rule = siteRule(url);
    if (kind !== "comic" && rule && rule.comic && rule.comic(url)) { kind = "comic"; mode = "full"; }
    const wiki = kind !== "comic" && !archived && wikipediaPage(url);
    if (onProgress) onProgress({ stage: "text" });
    const got = wiki ? await fromWikipedia(wiki) : await fromAnyPage(archived ? archived.url : url, () => onProgress && onProgress({ stage: "drawing" }), kind === "comic", asPage, archived ? null : given);
    if (archived) {
      if (!got.site || got.site === "web.archive.org") got.site = siteName(url);
      got.url = url;
      got.next = got.prev = "";
    }
    if (got.comic && kind !== "comic") mode = "full";
    const out = document.implementation.createHTMLDocument("");
    const { root, media } = rebuild(got.body, got.base, got.url, out);
    if (got.comic) root.classList.add("co-comic");
    else if (!root.textContent.trim()) throw new SaveError("Nothing readable was found on this page.");
    // The page's own headline, when the article kept it, would sit under the
    // one savedPageHtml writes.
    const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
    const first = root.querySelector("h2, h3");
    if (first && norm(first.textContent) === norm(got.title) && norm(root.textContent).startsWith(norm(first.textContent))) first.remove();

    const id = keepId || newId();
    const meta = {
      id, url: got.url, title: got.title, site: got.site, byline: got.byline,
      licence: got.licence, savedAt: Date.now(), minutes: readingMinutes(root.textContent),
      lang: wiki ? wiki.host.split(".")[0] : got.lang || "", dir: got.dir || "", mode: C.platform.native ? mode : "links",
      next: got.next || "", prev: got.prev || "",
    };
    if (got.series) meta.series = got.series;
    if (got.cut) meta.cut = true;
    if (archived) meta.archived = archived.at;
    if (got.comic) Object.assign(meta, { comic: true, minutes: Math.max(1, Math.round(media.length / 10)) });
    if (onProgress) onProgress({ stage: "images", done: 0, total: media.length });
    const res = await saveImages(id, media, mode, (done, total) => onProgress && onProgress({ stage: "images", done, total }), got.url);
    // imageBytes (0.27.11) splits a page's size into its pictures and the rest.
    Object.assign(meta, { images: res.total, missing: res.missing, thumb: res.thumb, imageBytes: res.bytes });
    if (mode === "full" && compress) meta.squeezed = 1;
    const icon = await keepIcon(id, got.icon || new URL("/favicon.ico", got.url).href, got.url);
    if (icon.icon) meta.icon = icon.icon;
    const html = savedPageHtml(meta, root, out);
    try {
      meta.bytes = res.bytes + icon.bytes + await C.store.writePage(id, html, meta);
      const text = plainText(root);
      await C.store.writeText(id, text);
      meta.bytes += C.store.bytesOf(text);
    } catch (e) {
      await C.store.removePage(id);
      throw new SaveError("Couldn't write the clip to the phone. Free some space and try again.");
    }
    return meta;
  }

  // Tries the previews that didn't download when the page was saved again,
  // into the same page directory. Pages saved before 0.6.0 didn't keep the preview's
  // address, so those use the full image's (a Wikimedia one is narrowed to
  // the preview width). Resolves to { got, missing, bytes, thumb }.
  async function retryMissing(meta, onProgress) {
    const html = await C.store.readPage(meta.id);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = [...doc.querySelectorAll("img.co-missing")];
    let got = 0, bytes = 0, done = 0, thumb = meta.thumb || null;
    const stamp = Date.now().toString(36);
    for (const [i, img] of imgs.entries()) {
      const full = img.getAttribute("data-full") || "";
      let url = img.getAttribute("data-preview") || full || img.getAttribute("data-thumb") || "";
      if (!img.hasAttribute("data-preview") && /upload\.wikimedia\.org\/.*\/thumb\//.test(full)) url = wikimediaThumb(full, WIKI_PREVIEW, 0);
      if (!/^https?:/.test(url)) continue;
      const rel = "images/r" + stamp + "-" + i + "." + extOf(url);
      try {
        const kept = await keep(meta.id, rel, url, meta.mode, meta.url);
        bytes += kept.bytes;
        img.setAttribute("src", kept.rel);
        img.removeAttribute("class");
        img.removeAttribute("data-preview");
        if (!thumb && !img.closest(".co-video")) thumb = kept.rel;
        got++;
      } catch (e) { /* still missing */ }
      if (onProgress) onProgress(++done, imgs.length);
    }
    const missing = doc.querySelectorAll("img.co-missing").length;
    if (got) {
      const out = { ...meta, missing, thumb };
      await C.store.writePage(meta.id, "<!doctype html>\n" + doc.documentElement.outerHTML, out);
    }
    return { got, missing, bytes, thumb };
  }

  // Swaps every image on a saved page for its full-size one ("Save full
  // images" in ⋯), deleting the preview each replaces. One that can't be
  // fetched keeps its preview. Resolves to { got, failed, bytes } where
  // bytes is the change in the page's size.
  async function saveFullImages(meta, onProgress) {
    const html = await C.store.readPage(meta.id);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = [...doc.querySelectorAll("img[data-full]")].filter((img) => !img.closest(".co-video") && /^https?:/.test(img.getAttribute("data-full")));
    let got = 0, failed = 0, bytes = 0, done = 0;
    const stamp = Date.now().toString(36);
    for (const [i, img] of imgs.entries()) {
      const url = img.getAttribute("data-full");
      const rel = "images/f" + stamp + "-" + i + "." + extOf(url);
      try {
        const kept = await keep(meta.id, rel, url, "full", meta.url);
        bytes += kept.bytes;
        // The library card keeps its small preview.
        const old = img.getAttribute("src") || "";
        if (/^images\//.test(old) && old !== meta.thumb) bytes -= await C.store.removeFile(meta.id, old);
        img.setAttribute("src", kept.rel);
        img.removeAttribute("class");
        img.removeAttribute("data-preview");
        got++;
      } catch (e) { failed++; }
      if (onProgress) onProgress(++done, imgs.length);
    }
    const out = { ...meta, mode: "full", missing: doc.querySelectorAll("img.co-missing").length, ...(compress ? { squeezed: 1 } : {}) };
    await C.store.writePage(meta.id, "<!doctype html>\n" + doc.documentElement.outerHTML, out);
    return { got, failed, bytes, missing: out.missing };
  }

  // A saved clip's full pictures made smaller where they're kept (1.18.0),
  // for Storage's Make pictures smaller. Resolves to { bytes } with
  // bytes the change in the clip's size (zero or less).
  async function compressPictures(meta, onProgress) {
    const html = await C.store.readPage(meta.id);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const imgs = [...doc.querySelectorAll("img[src^='images/']")];
    let bytes = 0, changed = false;
    for (const [i, img] of imgs.entries()) {
      const src = img.getAttribute("src");
      const was = await C.store.sizeOf(meta.id, src);
      // The card's picture is its own file; it stays as it is. One made
      // smaller already (its name ends "s.") isn't drawn again, which
      // would only blur it.
      if (src !== meta.thumb && !/s\.(webp|jpg|png)$/.test(src) && was > 60 * 1024) {
        const got = await C.store.squeeze(meta.id, src, was, FULL_WIDTH);
        if (got.rel !== src) { img.setAttribute("src", got.rel); bytes += got.bytes - was; changed = true; }
      }
      if (onProgress) onProgress(i + 1, imgs.length);
    }
    if (changed) await C.store.writePage(meta.id, "<!doctype html>\n" + doc.documentElement.outerHTML, meta);
    return { bytes };
  }

  // A saved page's pictures kept another way (0.30.2): as previews, full
  // size or links. Full fetches every full image; previews shrink the
  // full ones already here and fetch any that aren't; links deletes the
  // files (the library card keeps its picture). Resolves to { mode,
  // missing, bytes, failed } with bytes the change in the page's size.
  async function setPictures(meta, mode, onProgress) {
    let failed = 0, bytes = 0;
    if (mode === "full") {
      ({ failed, bytes } = await saveFullImages(meta, onProgress));
    } else {
      const html = await C.store.readPage(meta.id);
      const doc = new DOMParser().parseFromString(html, "text/html");
      const imgs = [...doc.querySelectorAll("img")];
      for (const [i, img] of imgs.entries()) {
        const src = img.getAttribute("src") || "";
        if (!/^images\//.test(src)) continue;
        if (mode === "links") {
          if (!/^https?:/.test(img.getAttribute("data-full") || img.getAttribute("data-thumb") || "")) continue;
          if (src !== meta.thumb) bytes -= await C.store.removeFile(meta.id, src);
          img.removeAttribute("src");
          img.className = "co-missing";
        } else {
          const was = await C.store.sizeOf(meta.id, src);
          const got = await C.store.shrink(meta.id, src, Infinity, PREVIEW_WIDTH);
          if (got.rel !== src) { img.setAttribute("src", got.rel); bytes += got.bytes - was; }
        }
        if (onProgress) onProgress(i + 1, imgs.length);
      }
      const missing = mode === "links" ? 0 : doc.querySelectorAll("img.co-missing").length;
      await C.store.writePage(meta.id, "<!doctype html>\n" + doc.documentElement.outerHTML, { ...meta, mode, missing });
      // Pictures that were links come down as previews.
      if (mode === "previews" && missing) {
        const res = await retryMissing({ ...meta, mode, missing }, onProgress);
        failed = res.missing;
        bytes += res.bytes;
      }
    }
    const doc = new DOMParser().parseFromString(await C.store.readPage(meta.id), "text/html");
    const first = doc.querySelector("img[src^='images/']");
    const thumb = meta.thumb && (await C.store.sizeOf(meta.id, meta.thumb)) ? meta.thumb : first ? first.getAttribute("src") : null;
    return { mode, missing: mode === "links" ? 0 : doc.querySelectorAll("img.co-missing").length, bytes, failed, thumb };
  }

  // A page's next (or with `back`, previous) link, read from the original:
  // for pages saved before 0.10.0, which kept no next link, or 0.20.0,
  // which kept no previous one. "" when it has none.
  async function findNext(url, back) {
    const site = siteRule(url);
    const res = await get(site && site.fetch ? site.fetch(url) : url, site && site.headers);
    const at = res.url || url;
    const doc = parse(res.text, at);
    const own = site && site.chapter ? site.chapter(doc, at, res.text) : null;
    const pick = own && (back ? own.prev : own.next);
    return pick !== undefined && pick !== null ? pick : nextLink(doc, at, back);
  }

  // The original page's HTML as the site serves it, as a file to hand
  // over when a site saves badly ("Send page source" in ⋯).
  async function pageSource(url) {
    const site = siteRule(url);
    const res = await get(site && site.fetch ? site.fetch(url) : url, site && site.headers);
    const name = (siteName(res.url || url) + new URL(res.url || url).pathname).replace(/[^a-z0-9.]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) + ".source.html";
    return { name, html: "<!-- " + (res.url || url).replace(/--/g, "%2D%2D") + " -->\n" + res.text };
  }

  // A post read without saving it (0.28.1): the same reading copy, with
  // its pictures left as links and nothing written to the phone.
  async function preview(url) {
    const wiki = wikipediaPage(url);
    const got = wiki ? await fromWikipedia(wiki) : await fromAnyPage(url, () => {}, false, false);
    const out = document.implementation.createHTMLDocument("");
    const { root, media } = rebuild(got.body, got.base, got.url, out);
    if (!root.textContent.trim()) throw new SaveError("Nothing readable was found on this page.");
    const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
    const first = root.querySelector("h2, h3");
    if (first && norm(first.textContent) === norm(got.title) && norm(root.textContent).startsWith(norm(first.textContent))) first.remove();
    const meta = {
      id: "preview:" + newId(), preview: true, url: got.url, title: got.title, site: got.site, byline: got.byline,
      licence: got.licence, minutes: readingMinutes(root.textContent),
      lang: wiki ? wiki.host.split(".")[0] : got.lang || "", dir: got.dir || "", mode: "links", next: "", prev: "",
    };
    await saveImages(meta.id, media, "links", null, got.url);
    return { meta, html: savedPageHtml(meta, root, out) };
  }

  C.save = {
    get compress() { return compress; }, set compress(v) { compress = v !== false; }, compressPictures,
    pageSource, preview,
    save, findArchived, unWayback, formatDate, SaveError, ContentsPage, cutShort, findChapters, pageImage, siteIcon, keepCover, siteRule, removeHidden, scriptJson, chapterNumber, pickChapters, comicGroup, isPanel, retryMissing, saveFullImages, setPictures, findNext, creditLine, cleanSaved, savedPageHtml, newId, textDir, isNextText, isPrevText, plainText, replaceText,
    wikipediaPage, wikimediaThumb, parseSrcset, pickWidth, youtubeId, vimeoId, extOf, isTrackingPixel, readingMinutes, siteName,
  };
})();
