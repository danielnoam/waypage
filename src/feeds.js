// Waypage: following a site's feed (0.28.0). RSS 2.0, RSS 1.0, Atom and
// JSON Feed are read into one shape; a site's address is enough, since its
// feed is found from the page's <link rel="alternate"> or the usual paths.
//
// Like a saved page, a feed is only ever parsed (DOMParser's XML documents
// run nothing); its titles and summaries are kept as plain text.
(function () {
  const C = window.Waypage;
  const ACCEPT = "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8";
  const GUESSES = ["/feed", "/rss", "/feed.xml", "/rss.xml", "/atom.xml", "/index.xml", "/feed/", "/rss/"];
  const MAX_ITEMS = 50;

  class FeedError extends Error {}

  const http = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; } };
  const absolute = (href, base) => {
    const h = String(href || "").trim();
    if (!h) return null;
    try { return http(new URL(h, base).href); } catch (e) { return null; }
  };
  const clean = (s, max) => String(s || "").replace(/\s+/g, " ").trim().slice(0, max || 300);

  // HTML in a summary becomes its words; nothing of it is kept as markup.
  function words(html, max) {
    const s = String(html || "");
    if (!/[<&]/.test(s)) return clean(s, max);
    const doc = new DOMParser().parseFromString("<body>" + s, "text/html");
    return clean(doc.body.textContent, max);
  }
  function firstImage(html, base) {
    const s = String(html || "");
    if (!/<img/i.test(s)) return null;
    const img = new DOMParser().parseFromString("<body>" + s, "text/html").querySelector("img[src]");
    return img ? absolute(img.getAttribute("src"), base) : null;
  }
  const when = (s) => { const t = Date.parse(String(s || "").trim()); return isFinite(t) ? t : 0; };

  // Children by local name, so namespaced feeds (dc:, media:, content:)
  // read the same as plain ones.
  const kids = (el, name) => (el ? [...el.children].filter((c) => c.localName === name) : []);
  const kid = (el, name) => kids(el, name)[0] || null;
  const text = (el, name) => { const k = kid(el, name); return k ? k.textContent : ""; };

  function fromXml(xml, at) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.querySelector("parsererror")) return null;
    const root = doc.documentElement;
    if (root.localName === "feed") return atom(root, at);
    if (root.localName === "rss") return rss(kid(root, "channel"), kids(kid(root, "channel"), "item"), at);
    if (root.localName === "RDF") return rss(kid(root, "channel"), kids(root, "item"), at);
    return null;
  }

  function rss(channel, items, at) {
    if (!channel) return null;
    const link = absolute(text(channel, "link"), at) || at;
    const image = kid(channel, "image");
    return {
      title: clean(text(channel, "title"), 120) || siteOf(link),
      link,
      icon: image ? absolute(text(image, "url"), at) : null,
      items: items.slice(0, MAX_ITEMS).map((it) => {
        const url = absolute(text(it, "link"), link) || (kid(it, "guid") && kid(it, "guid").getAttribute("isPermaLink") !== "false" ? absolute(text(it, "guid"), link) : null);
        const body = text(it, "encoded") || text(it, "description");
        const media = kid(it, "thumbnail") || kids(it, "content").find((m) => /^image\//.test(m.getAttribute("type") || "") || m.getAttribute("medium") === "image")
          || kids(it, "enclosure").find((m) => /^image\//.test(m.getAttribute("type") || ""));
        return item({
          id: clean(text(it, "guid"), 500) || url,
          url, title: words(text(it, "title"), 300),
          date: when(text(it, "pubDate") || text(it, "date") || text(it, "updated")),
          summary: words(text(it, "description") || body, 240),
          image: (media && absolute(media.getAttribute("url"), link)) || firstImage(body, link),
        });
      }).filter(Boolean),
    };
  }

  function atom(root, at) {
    const alt = (el) => {
      const links = kids(el, "link");
      const l = links.find((x) => (x.getAttribute("rel") || "alternate") === "alternate" && !/xml|json/.test(x.getAttribute("type") || "")) || links.find((x) => !x.getAttribute("rel"));
      return l ? absolute(l.getAttribute("href"), at) : null;
    };
    const link = alt(root) || at;
    return {
      title: words(text(root, "title"), 120) || siteOf(link),
      link,
      icon: absolute(text(root, "icon") || text(root, "logo"), at),
      items: kids(root, "entry").slice(0, MAX_ITEMS).map((e) => {
        const body = text(e, "content") || text(e, "summary");
        const media = kid(e, "thumbnail") || (kid(e, "group") && kid(kid(e, "group"), "thumbnail"));
        const url = alt(e);
        // A newsletter's email (1.43.0) keeps its sender and its whole
        // HTML for the save; neither is stored with the post.
        return item({
          id: clean(text(e, "id"), 500) || url,
          url, title: words(text(e, "title"), 300),
          date: when(text(e, "published") || text(e, "updated")),
          summary: words(text(e, "summary") || body, 240),
          image: (media && absolute(media.getAttribute("url"), link)) || firstImage(body, link),
          from: clean(text(kid(e, "author"), "email"), 200),
          body,
        });
      }).filter(Boolean),
    };
  }

  function fromJson(raw, at) {
    let j;
    try { j = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!j || !/jsonfeed\.org\/version/.test(String(j.version || "")) || !Array.isArray(j.items)) return null;
    const link = absolute(j.home_page_url, at) || at;
    return {
      title: clean(j.title, 120) || siteOf(link),
      link,
      icon: absolute(j.icon || j.favicon, at),
      items: j.items.slice(0, MAX_ITEMS).map((it) => {
        const url = absolute(it.url || it.external_url, link);
        return item({
          id: clean(it.id, 500) || url,
          url, title: words(it.title, 300),
          date: when(it.date_published || it.date_modified),
          summary: words(it.summary || it.content_text || it.content_html, 240),
          image: absolute(it.image || it.banner_image, link) || firstImage(it.content_html, link),
        });
      }).filter(Boolean),
    };
  }

  // A post needs somewhere to go; one with no title takes its summary's
  // first words, as some feeds (short posts) have none.
  function item(it) {
    if (!it.url) return null;
    if (!it.title) it.title = clean(it.summary, 80) || siteOf(it.url);
    return it;
  }

  const siteOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } };

  // Reads `text` as a feed of any of the four kinds, or null.
  function parseFeed(body, at) {
    const s = typeof body === "string" ? body.replace(/^﻿/, "").trimStart() : body;
    if (typeof s !== "string" || s.startsWith("{")) return fromJson(s, at);
    if (!s.startsWith("<")) return null;
    if (/^<!doctype html|^<html/i.test(s)) return null;
    return fromXml(s, at);
  }

  // The feeds a page names, best first: RSS and Atom before JSON, the
  // page's own before comments feeds.
  function feedLinks(html, at) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const out = [];
    for (const l of doc.querySelectorAll('link[rel~="alternate"][href]')) {
      const type = (l.getAttribute("type") || "").toLowerCase();
      if (!/rss|atom|feed\+json/.test(type)) continue;
      const url = absolute(l.getAttribute("href"), at);
      if (url && !out.some((x) => x.url === url)) out.push({ url, type, title: clean(l.getAttribute("title"), 120) });
    }
    const rank = (x) => (/comment/i.test(x.title + x.url) ? 2 : 0) + (/json/.test(x.type) ? 1 : 0);
    return out.sort((a, b) => rank(a) - rank(b));
  }

  async function get(url) {
    let res;
    try {
      res = await C.platform.fetchText(url, { headers: { Accept: ACCEPT } });
    } catch (e) {
      throw new FeedError(C.platform.canReadPages
        ? t("Couldn't reach {site}. Check the address, or try again when you're online.", { site: siteOf(url) })
        : t("This browser can't reach {site}. Follow the feed in Waypage on your phone.", { site: siteOf(url) }));
    }
    if (res.status === 429) throw new FeedError(t("{site} asked to slow down. Try again later.", { site: siteOf(url) }));
    if (res.status >= 400) throw new FeedError(t("{site} answered with an error ({status}).", { site: siteOf(url), status: res.status }));
    return res;
  }

  // A site's address or a feed's: resolves to { url, feed } with the feed's
  // own address, or throws a FeedError that says what to try.
  async function findFeed(input) {
    const start = http(/^https?:\/\//i.test(input) ? input : "https://" + String(input || "").trim());
    if (!start) throw new FeedError(t("That doesn't look like an address. Paste the site's or its feed's."));
    const gh = githubRepo(start);
    if (gh && !/\.atom$/i.test(new URL(start).pathname)) return githubReleases(gh);
    // A site that turns the app's visit away (Cloudflare's browser check,
    // 403) often still serves its feed: the usual paths are tried anyway.
    let res;
    try { res = await get(start); } catch (e) { if (!/\((403|503)\)/.test(e.message)) throw e; res = { url: start, text: "", refused: e }; }
    const at = res.url || start;
    const direct = tidyReleases(at, parseFeed(res.text, at));
    if (direct) return { url: at, feed: direct };
    const tries = feedLinks(res.text, at).map((x) => x.url);
    for (const g of GUESSES) { const u = absolute(g, at); if (u && !tries.includes(u)) tries.push(u); }
    for (const u of tries.slice(0, 8)) {
      try {
        const r = await C.platform.fetchText(u, { headers: { Accept: ACCEPT } });
        if (r.status >= 400) continue;
        const feed = parseFeed(r.text, r.url || u);
        if (feed) return { url: r.url || u, feed };
      } catch (e) { /* the next one */ }
    }
    if (res.refused) throw res.refused;
    throw new FeedError(t("Couldn't find a feed on {x}. Paste the feed's own address if the site shows one.", { x: siteOf(at) }));
  }

  async function readFeed(url) {
    const res = await get(url);
    const feed = tidyReleases(res.url || url, parseFeed(res.text, res.url || url));
    if (!feed) throw new FeedError(t("{site}'s feed couldn't be read.", { site: siteOf(url) }));
    return feed;
  }

  // ---- GitHub (2026-11) ----
  // A repo's own page names no feed, but GitHub keeps one of its releases
  // (and of its tags). Any link into a repo follows its releases, or its
  // tags when it has never made a release; a commits feed is only followed
  // when its own address is pasted, since it's mostly noise.
  const NOT_OWNERS = /^(about|apps|collections|contact|customer-stories|enterprise|events|explore|features|login|marketplace|new|notifications|orgs|organizations|pricing|pulls|issues|search|security|settings|signup|site|sponsors|team|topics|trending|users)$/i;
  function githubRepo(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
    const [owner, repo] = u.pathname.split("/").filter(Boolean);
    if (!owner || !repo || NOT_OWNERS.test(owner) || !/^[\w.-]+$/.test(owner + repo)) return null;
    return { owner, repo: repo.replace(/\.git$/i, "") };
  }
  const releasesKind = (url) => {
    const gh = githubRepo(url);
    const m = gh && new URL(url).pathname.match(/^\/[^/]+\/[^/]+\/(releases|tags)\.atom$/i);
    return m ? { ...gh, kind: m[1].toLowerCase() } : null;
  };

  // "Release notes from waypage" becomes the repo's name, with its owner's
  // picture, and each release counts its Added, Changed and Fixed lines.
  function tidyReleases(url, feed) {
    const gh = releasesKind(url);
    if (!gh || !feed) return feed;
    feed.title = gh.repo;
    feed.icon = "https://github.com/" + gh.owner + ".png?size=64";
    feed.releases = true;
    for (const it of feed.items) {
      const n = noteCounts(it.body);
      if (n) it.notes = n;
      delete it.image;
    }
    return feed;
  }
  const NOTE_HEADS = ["added", "changed", "fixed", "removed"];
  function noteCounts(html) {
    if (!/<h[1-6]/i.test(String(html || ""))) return null;
    const doc = new DOMParser().parseFromString("<body>" + html, "text/html");
    const out = {};
    for (const h of doc.querySelectorAll("h1, h2, h3, h4, h5, h6")) {
      const k = h.textContent.trim().toLowerCase().replace(/[^a-z]/g, "");
      const list = h.nextElementSibling;
      if (NOTE_HEADS.includes(k) && list && /^(UL|OL)$/.test(list.tagName)) out[k] = (out[k] || 0) + list.querySelectorAll(":scope > li").length;
    }
    return Object.keys(out).length ? out : null;
  }

  async function githubReleases(gh) {
    const base = "https://github.com/" + gh.owner + "/" + gh.repo;
    let first = null;
    for (const kind of ["releases", "tags"]) {
      const url = base + "/" + kind + ".atom";
      const res = await get(url);
      const feed = tidyReleases(url, parseFeed(res.text, url));
      if (!feed) break;
      if (feed.items.length) return { url, feed };
      first = first || { url, feed };
    }
    if (first) return first;
    throw new FeedError(t("Couldn't read {repo}'s releases on GitHub.", { repo: gh.repo }));
  }

  C.feeds = { FeedError, parseFeed, feedLinks, findFeed, readFeed, siteOf, githubRepo, noteCounts };
})();
