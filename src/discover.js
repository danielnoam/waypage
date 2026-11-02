// Waypage: Discover's sources. The hand-picked list (src/discover-list.js,
// bundled, refreshed from GitHub on the phone) and Royal Road's own lists
// and search, read on the device like any page (the web copy can't: Royal
// Road sends no CORS headers). Nothing here follows or saves anything:
// the shell hands a pick to Feeds, Newsletters or saving.
(function () {
  const C = window.Waypage;
  const LIST_KEY = "waypage.discover.list";
  const RR_KEY = "waypage.discover.rr";
  const RR = "https://www.royalroad.com";
  const RR_LISTS = [
    { key: "rising", label: "Rising stars", path: "/fictions/rising-stars" },
    { key: "best", label: "Best rated", path: "/fictions/best-rated" },
    { key: "trending", label: "Trending", path: "/fictions/trending" },
    { key: "weekly", label: "Popular this week", path: "/fictions/weekly-popular" },
  ];
  const FRESH = 60 * 60 * 1000;
  const MAX = 30;

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full */ } };

  // ---- The hand-picked list ----

  const KINDS = ["feed", "newsletter"];
  const httpUrl = (u) => { try { const x = new URL(String(u || "")); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
  // Only well-formed entries get through, whichever copy they came from.
  function clean(raw) {
    if (!raw || !Array.isArray(raw.entries)) return null;
    const topics = Array.isArray(raw.topics) ? raw.topics.filter((t) => typeof t === "string" && t).slice(0, 12) : [];
    const entries = raw.entries.filter((e) => e && KINDS.includes(e.kind) && typeof e.name === "string" && httpUrl(e.url))
      .map((e) => ({
        kind: e.kind, name: e.name.slice(0, 80), about: String(e.about || "").slice(0, 160), topic: String(e.topic || ""),
        url: httpUrl(e.url),
        feedUrl: typeof e.feed === "string" ? httpUrl(e.feed) : "", signup: httpUrl(e.signup),
      }));
    return entries.length ? { topics, entries } : null;
  }
  // The strict JSON between the markers of discover-list.js.
  function fromSource(text) {
    const m = /\/\/ LIST START\s*([\s\S]*?)\s*\/\/ LIST END/.exec(String(text || ""));
    if (!m) return null;
    try { return clean(JSON.parse(m[1])); } catch (e) { return null; }
  }
  // A copy read from GitHub (main, so the newest) wins over the bundled one.
  function list() {
    const got = read(LIST_KEY, null);
    return (got && clean(got.list)) || clean(C.discoverList) || { topics: [], entries: [] };
  }
  let refreshing = null;
  function refresh(repo) {
    if (!repo || refreshing) return refreshing || Promise.resolve(false);
    const got = read(LIST_KEY, null);
    if (got && Date.now() - got.at < FRESH * 12) return Promise.resolve(false);
    refreshing = C.platform.fetchText("https://raw.githubusercontent.com/" + repo + "/main/src/discover-list.js", { headers: { Accept: "text/plain" } })
      .then((res) => {
        const l = res.status === 200 ? fromSource(res.text) : null;
        if (!l) return false;
        keep(LIST_KEY, { at: Date.now(), list: l });
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
    return refreshing;
  }

  // ---- Royal Road ----

  const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
  const num = (s) => { const m = /([\d,]+)/.exec(s || ""); return m ? parseInt(m[1].replace(/,/g, ""), 10) : 0; };
  const FICTION = /^\/fiction\/(\d+)(?:\/[^/?#]*)?\/?$/;
  const storyId = (url) => { try { const u = new URL(url, RR); return /(^|\.)royalroadl?\.com$/i.test(u.hostname) ? (FICTION.exec(u.pathname) || [])[1] || "" : ""; } catch (e) { return ""; } };
  const isStory = (url) => !!storyId(url);

  // A list or search page as stories. Royal Road's markup isn't promised
  // to anyone, so each fact has a fallback and a story needs only its link
  // and title: the closest block holding one story's link is its row.
  function parseList(html, base) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const seen = new Map();
    for (const a of doc.querySelectorAll('a[href*="/fiction/"]')) {
      const href = a.getAttribute("href") || "";
      let path;
      try { path = new URL(href, base || RR).pathname; } catch (e) { continue; }
      const id = (FICTION.exec(path) || [])[1];
      if (!id) continue;
      const t = text(a);
      const s = seen.get(id) || { id, url: RR + "/fiction/" + id + (path.split("/")[3] ? "/" + path.split("/")[3] : ""), title: "", row: null };
      if (!s.title && t) s.title = t;
      if (!s.row) {
        let row = a.closest(".fiction-list-item");
        if (!row) {
          row = a.parentElement;
          while (row && row.parentElement && row.parentElement !== doc.body
            && new Set([...row.parentElement.querySelectorAll('a[href*="/fiction/"]')].map((x) => (FICTION.exec(x.getAttribute("href") || "") || [])[1]).filter(Boolean)).size === 1) row = row.parentElement;
        }
        s.row = row;
      }
      seen.set(id, s);
    }
    const out = [];
    for (const s of seen.values()) {
      if (!s.title) continue;
      const row = s.row;
      const img = row && row.querySelector('img[data-type="cover"], figure img, img');
      const cover = img ? httpUrl(new URL(img.getAttribute("data-src") || img.getAttribute("src") || "", RR).href) : "";
      const tags = row ? [...row.querySelectorAll("a.fiction-tag, .tags a, a[href*='tagsAdd=']")].map(text).filter(Boolean).slice(0, 4) : [];
      const all = text(row);
      const chapters = num((/([\d,]+)\s+Chapters?/i.exec(all) || [])[0]);
      const followers = num((/([\d,]+)\s+Followers?/i.exec(all) || [])[0]);
      const star = row && row.querySelector('[aria-label*="Rating"], .star[title], [title*="out of 5"]');
      const rating = star ? parseFloat((/(\d+(?:\.\d+)?)/.exec(star.getAttribute("aria-label") || star.getAttribute("title") || "") || [])[1]) || 0 : 0;
      const descNode = row && row.querySelector('[id^="description-"], .fiction-description, .description');
      out.push({ id: s.id, url: s.url, title: s.title.slice(0, 120), cover, tags, chapters, followers,
        rating: rating > 0 && rating <= 5 ? rating : 0, about: text(descNode).slice(0, 600) });
      if (out.length >= MAX) break;
    }
    return out;
  }

  // The last list read stays for offline, with when it was read.
  const rrCache = () => read(RR_KEY, {});
  function rrSaved(key) { return rrCache()[key] || null; }
  // Royal Road sits behind Cloudflare, which turns a plain request away
  // with a "Just a moment..." page (403) whatever it says it is. The
  // hidden browser (Android's PageRender) passes that check as a browser
  // would and waits for the real page; it's tried when the plain request
  // fails or comes back with no stories.
  const challenged = (res) => res.status === 403 || res.status === 503 || /<title>\s*Just a moment/i.test(res.text || "");
  async function rrStories(url) {
    let res = null, items = [];
    try {
      res = await C.platform.fetchText(url);
      if (res.status === 200 && !challenged(res)) items = parseList(res.text, res.url || url);
    } catch (e) { if (!C.platform.canRender) throw e; }
    if (!items.length && C.platform.canRender) {
      const drawn = await C.platform.render(url, {});
      if (drawn) { res = { status: 200, url: drawn.url, text: drawn.text }; items = parseList(drawn.text, drawn.url || url); }
    }
    if (items.length) return items;
    if (res && res.status !== 200) throw new Error("HTTP " + res.status);
    const title = res && /<title>([^<]{0,60})/i.exec(res.text || "");
    throw new Error("no stories (" + (res ? res.text.length : 0) + " characters" + (title ? ', titled "' + title[1].trim() + '"' : "") + ")");
  }

  async function rrRead(key, force) {
    const def = RR_LISTS.find((l) => l.key === key) || RR_LISTS[0];
    const had = rrSaved(def.key);
    if (!force && had && Date.now() - had.at < FRESH) return had;
    const got = { at: Date.now(), items: await rrStories(RR + def.path) };
    const all = rrCache();
    all[def.key] = got;
    keep(RR_KEY, all);
    return got;
  }
  async function rrSearch(words) {
    try { return await rrStories(RR + "/fictions/search?title=" + encodeURIComponent(String(words || "").trim())); }
    catch (e) { if (/^no stories/.test(e.message) && !/Just a moment/.test(e.message)) return []; throw e; }
  }

  C.discover = { list, refresh, fromSource, clean, isStory, storyId, parseList, rrLists: RR_LISTS, rrSaved, rrRead, rrSearch };
})();
