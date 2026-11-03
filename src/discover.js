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
    { key: "active", label: "Ongoing", path: "/fictions/active-popular" },
    { key: "complete", label: "Complete", path: "/fictions/complete" },
    { key: "latest", label: "Latest updates", path: "/fictions/latest-updates" },
    { key: "new", label: "New releases", path: "/fictions/new" },
  ];
  // Browsing by genre goes through Royal Road's search (its tag and its
  // order), since the lists above take no genre.
  const RR_GENRES = [
    ["fantasy", "Fantasy"], ["sci_fi", "Sci-fi"], ["litrpg", "LitRPG"], ["progression", "Progression"],
    ["action", "Action"], ["adventure", "Adventure"], ["comedy", "Comedy"], ["drama", "Drama"],
    ["horror", "Horror"], ["mystery", "Mystery"], ["romance", "Romance"], ["psychological", "Psychological"],
    ["portal_fantasy", "Portal fantasy"], ["slice_of_life", "Slice of life"], ["post_apocalyptic", "Post-apocalyptic"],
  ].map(([key, label]) => ({ key, label }));
  const ORDER = { best: "rating", latest: "last_update", new: "release_date" };
  const FRESH = 60 * 60 * 1000;
  const MAX = 40;

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* full */ } };

  // ---- The hand-picked list ----

  const KINDS = ["feed", "newsletter", "serial"];
  const httpUrl = (u) => { try { const x = new URL(String(u || "")); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch (e) { return ""; } };
  // Only well-formed entries get through, whichever copy they came from.
  function clean(raw) {
    if (!raw || !Array.isArray(raw.entries)) return null;
    const entries = raw.entries.filter((e) => e && KINDS.includes(e.kind) && typeof e.name === "string" && httpUrl(e.url))
      .map((e) => ({
        kind: e.kind, name: e.name.slice(0, 80), about: String(e.about || "").slice(0, 160),
        url: httpUrl(e.url),
        feedUrl: typeof e.feed === "string" ? httpUrl(e.feed) : "", signup: httpUrl(e.signup),
      }));
    return entries.length ? { entries } : null;
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
    return (got && clean(got.list)) || clean(C.discoverList) || { entries: [] };
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
  // A story's id: Royal Road's number, or the site's key and its number
  // (FictionPress "fp123"), so a saved collection is known by its source.
  const IDS = [
    [/(^|\.)fictionpress\.com$/i, "fp", /^\/s\/(\d+)/],
    [/(^|\.)fanfiction\.net$/i, "ffn", /^\/s\/(\d+)/],
    [/(^|\.)(archiveofourown\.org|ao3\.org)$/i, "ao3", /^\/works\/(\d+)/],
    [/(^|\.)scribblehub\.com$/i, "sh", /^\/series\/(\d+)/],
    [/(^|\.)wattpad\.com$/i, "wp", /^\/story\/(\d+)/],
    [/(^|\.)tapas\.io$/i, "tp", /^\/series\/([^/?#]+)/],
  ];
  const storyId = (url) => {
    try {
      const u = new URL(url, RR);
      if (/(^|\.)royalroadl?\.com$/i.test(u.hostname)) return (FICTION.exec(u.pathname) || [])[1] || "";
      if (/(^|\.)webtoons\.com$/i.test(u.hostname)) { const n = u.searchParams.get("title_no"); return n ? "wt" + n : ""; }
      for (const [host, key, path] of IDS) if (host.test(u.hostname)) { const m = path.exec(u.pathname); return m ? key + m[1].toLowerCase() : ""; }
      return "";
    } catch (e) { return ""; }
  };
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
  // AO3 answers a visit it doesn't like with 418 "Request temporarily
  // denied"; the hidden browser is a browser to it too.
  const challenged = (res) => res.status === 403 || res.status === 418 || res.status === 503 || /<title>\s*(Just a moment|Request temporarily denied)/i.test(res.text || "");
  // A page of stories, read by `parse` (html, url) -> stories: the plain
  // fetch first, then the hidden browser when that was turned away, found
  // nothing, or the page builds itself.
  async function stories(url, parse) {
    let res = null, items = [];
    try {
      res = await C.platform.fetchText(url);
      if (res.status === 200 && !challenged(res)) items = parse(res.text, res.url || url);
    } catch (e) { if (!C.platform.canRender) throw e; }
    if (!items.length && C.platform.canRender) {
      const drawn = await C.platform.render(url, {});
      if (drawn) { res = { status: 200, url: drawn.url, text: drawn.text }; items = parse(drawn.text, drawn.url || url); }
    }
    if (items.length) return items;
    if (res && res.status !== 200) throw new Error("HTTP " + res.status);
    const title = res && /<title>([^<]{0,60})/i.exec(res.text || "");
    throw new Error("no stories (" + (res ? res.text.length : 0) + " characters" + (title ? ', titled "' + title[1].trim() + '"' : "") + ")");
  }
  const rrStories = (url) => stories(url, parseList);
  // A search with no results is an empty list, not an error.
  const found = (p) => p.catch((e) => { if (/^no stories/.test(e.message) && !/Just a moment|denied/.test(e.message)) return []; throw e; });

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
  const rrSearch = (words) => found(rrStories(RR + "/fictions/search?title=" + encodeURIComponent(String(words || "").trim())));

  // One page of a list (page 1, 2, ...), or of a genre in that list's
  // order. Royal Road gives about 20 a page.
  function rrBrowseUrl(key, genre, page) {
    const def = RR_LISTS.find((l) => l.key === key) || RR_LISTS[0];
    const u = genre
      ? new URL(RR + "/fictions/search?tagsAdd=" + encodeURIComponent(genre) + "&orderBy=" + (ORDER[def.key] || "popularity") + (def.key === "complete" ? "&status=COMPLETED" : ""))
      : new URL(RR + def.path);
    if (page > 1) u.searchParams.set("page", String(page));
    return u.href;
  }
  const rrBrowse = (key, genre, page) => rrStories(rrBrowseUrl(key, genre, page));

  // ---- FictionPress and FanFiction.net ----
  // One system: browsed by category or fandom (neither has a list across
  // them), in one of its sort orders; a page is 25 stories, each a
  // div.z-list with its meta line ("Rated: T - English - Fantasy -
  // Chapters: 12 - Words: ..."). Both sit behind Cloudflare.
  const FP = "https://www.fictionpress.com";
  const FFN = "https://www.fanfiction.net";
  const FP_SORTS = [
    { key: "4", label: "Most favourited" }, { key: "5", label: "Most followed" },
    { key: "1", label: "Updated" }, { key: "2", label: "New" }, { key: "3", label: "Most reviewed" },
  ];
  const FP_GENRES = ["Fantasy", "Sci-Fi", "Romance", "Adventure", "Horror", "Mystery", "Humor", "Drama", "Thriller", "Supernatural", "Young Adult", "General"]
    .map((g) => ({ key: g.replace(/ /g, "-"), label: g === "Sci-Fi" ? "Sci-fi" : g === "Young Adult" ? "Young adult" : g }));
  // FanFiction.net's biggest fandoms, as their pages' paths.
  const FFN_FANDOMS = [
    ["book/Harry-Potter", "Harry Potter"], ["anime/Naruto", "Naruto"], ["book/Percy-Jackson-and-the-Olympians", "Percy Jackson"],
    ["anime/Pokémon", "Pokémon"], ["anime/My-Hero-Academia-僕のヒーローアカデミア", "My Hero Academia"], ["tv/Supernatural", "Supernatural"],
    ["movie/Avengers", "Avengers"], ["book/Twilight", "Twilight"], ["book/Lord-of-the-Rings", "Lord of the Rings"],
    ["tv/Doctor-Who", "Doctor Who"], ["cartoon/Avatar-Last-Airbender", "Avatar: The Last Airbender"], ["game/Mass-Effect", "Mass Effect"],
  ].map(([key, label]) => ({ key, label }));
  function parseZList(html, base, origin, key, site) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const out = [];
    for (const row of doc.querySelectorAll(".z-list")) {
      const a = row.querySelector("a.stitle, a[href^='/s/']");
      const m = a && /^\/s\/(\d+)/.exec(new URL(a.getAttribute("href"), base || origin).pathname);
      if (!m) continue;
      const img = row.querySelector("img.cimage, img");
      const src = img && (img.getAttribute("data-original") || img.getAttribute("src") || "");
      const meta = text(row.querySelector(".z-padtop2, .xgray"));
      const parts = meta.split(/\s+-\s+/);
      const desc = row.querySelector(".z-indent");
      const about = desc ? text(desc).replace(meta, "").trim() : "";
      // FanFiction.net's line starts with the fandom when it lists several.
      const g = parts.findIndex((x) => /^[A-Z][\w-]*(\/[A-Z][\w-]*)*$/.test(x) && !/^(English|Rated|Complete)$/.test(x) && !/:/.test(x));
      out.push({
        id: key + m[1], url: origin + "/s/" + m[1] + "/1/", site, title: text(a).slice(0, 120),
        cover: src && !/\/static\//.test(src) ? httpUrl(new URL(src, origin).href) : "",
        tags: (g >= 0 ? parts[g].split("/") : []).slice(0, 3),
        chapters: num((/Chapters:\s*([\d,]+)/.exec(meta) || [])[1]), followers: num((/Follows:\s*([\d,]+)/.exec(meta) || [])[1]),
        rating: 0, about: about.slice(0, 600),
      });
      if (out.length >= MAX) break;
    }
    return out;
  }
  const parseFP = (html, base) => parseZList(html, base, FP, "fp", "FictionPress");
  const parseFFN = (html, base) => parseZList(html, base, FFN, "ffn", "FanFiction.net");
  const fpBrowseUrl = (sort, genre, page) => FP + "/fiction/" + (genre || "Fantasy") + "/?&srt=" + (sort || "4") + "&lan=1&r=10" + (page > 1 ? "&p=" + page : "");
  const ffnBrowseUrl = (sort, fandom, page) => FFN + "/" + (fandom || FFN_FANDOMS[0].key) + "/?&srt=" + (sort || "4") + "&lan=1&r=10" + (page > 1 ? "&p=" + page : "");
  const zSearch = (origin, parse) => (words) => found(stories(origin + "/search/?keywords=" + encodeURIComponent(String(words || "").trim()) + "&ready=1&type=story", parse));

  // ---- AO3 (Archive of Our Own) ----
  // Works as li.work.blurb rows: heading link, author, fandoms, summary and
  // a stats list (chapters "12/12" or "5/?", kudos). No covers. Browsed by
  // tag in a sort order, or across the archive; 20 a page.
  const AO3 = "https://archiveofourown.org";
  const AO3_SORTS = [
    { key: "kudos_count", label: "Most kudos" }, { key: "hits", label: "Most read" }, { key: "bookmarks_count", label: "Most bookmarked" },
    { key: "revised_at", label: "Updated" }, { key: "created_at", label: "New" },
  ];
  const AO3_TAGS = ["Original Work", "Fantasy", "Science Fiction", "Horror", "Romance", "Adventure", "Mystery", "Alternate Universe",
    "Harry Potter - J. K. Rowling", "Marvel Cinematic Universe", "Star Wars - All Media Types", "Sherlock (TV)"]
    .map((t) => ({ key: t, label: t.replace(/ - .*$/, "").replace(/ \(TV\)$/, "") }));
  function parseAO3(html, base) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const out = [];
    for (const row of doc.querySelectorAll("li.work.blurb, li.blurb.work, li[id^='work_']")) {
      const a = row.querySelector("h4.heading a[href^='/works/'], .heading a[href*='/works/']");
      const m = a && /\/works\/(\d+)/.exec(a.getAttribute("href") || "");
      if (!m || out.some((x) => x.id === "ao3" + m[1])) continue;
      const dd = (c) => text(row.querySelector("dd." + c));
      const fandom = text(row.querySelector(".fandoms a"));
      out.push({
        id: "ao3" + m[1], url: AO3 + "/works/" + m[1], site: "AO3", title: text(a).slice(0, 120), cover: "",
        tags: [fandom, ...[...row.querySelectorAll("li.freeforms a")].map(text)].filter(Boolean).slice(0, 3),
        chapters: num(dd("chapters").split("/")[0]), followers: 0, rating: 0,
        stat: dd("kudos") ? dd("kudos") + " kudos" : "", by: text(row.querySelector("a[rel='author']")),
        about: text(row.querySelector("blockquote.summary, .summary")).slice(0, 600),
      });
      if (out.length >= MAX) break;
    }
    return out;
  }
  const ao3BrowseUrl = (sort, tag, page) => {
    const u = new URL(tag ? AO3 + "/works" : AO3 + "/works/search");
    if (tag) u.searchParams.set("tag_id", tag);
    u.searchParams.set("work_search[sort_column]", sort || "kudos_count");
    u.searchParams.set("work_search[language_id]", "en");
    if (page > 1) u.searchParams.set("page", String(page));
    return u.href;
  };
  const ao3Search = (words) => {
    const u = new URL(AO3 + "/works/search");
    u.searchParams.set("work_search[query]", String(words || "").trim());
    u.searchParams.set("work_search[sort_column]", "kudos_count");
    return found(stories(u.href, parseAO3));
  };

  // ---- Any site: stories found by their links ----
  // For sites whose markup is a guess (Scribble Hub, behind Cloudflare,
  // never seen from here) or built by script (Tapas, Webtoon's search):
  // every link to a story (by `id`, which gives its id from the address)
  // with its closest block that holds a picture is one story; its title is
  // the block's title element, the link's words or the picture's alt.
  function parseCards(html, base, { id, key, site, url, title: titleSel, about: aboutSel, tags: tagSel, chapters: chSel }) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const seen = new Map();
    for (const a of doc.querySelectorAll("a[href], [data-href]")) {
      let u;
      try { u = new URL(a.getAttribute("href") || a.getAttribute("data-href"), base); } catch (e) { continue; }
      const n = id(u);
      if (!n) continue;
      const s = seen.get(n) || { id: key + n, url: url ? url(u, n) : u.href.split("#")[0], site, title: "", cover: "", tags: [], chapters: 0, followers: 0, rating: 0, about: "" };
      let box = a;
      while (box.parentElement && box.parentElement !== doc.body && !box.querySelector("img")
        && [...box.parentElement.querySelectorAll("a[href], [data-href]")].every((x) => { try { const v = id(new URL(x.getAttribute("href") || x.getAttribute("data-href"), base)); return !v || v === n; } catch (e) { return true; } })) box = box.parentElement;
      const img = box.querySelector("img");
      if (!s.cover && img) s.cover = httpUrl(new URL(img.getAttribute("data-src") || img.getAttribute("data-original") || img.getAttribute("src") || "", base).href) || "";
      if (!s.title) s.title = text(titleSel && box.querySelector(titleSel)) || (a.matches("a") && !a.querySelector("img") ? text(a) : "") || (img && (img.getAttribute("alt") || "").trim()) || "";
      if (!s.about && aboutSel) s.about = text(box.querySelector(aboutSel)).slice(0, 600);
      if (!s.tags.length && tagSel) s.tags = [...box.querySelectorAll(tagSel)].map(text).filter(Boolean).slice(0, 3);
      if (!s.chapters && chSel) s.chapters = num((/([\d,]+)\s*(chapters?|episodes?|ch\.)/i.exec(text(box)) || [])[1]);
      seen.set(n, s);
    }
    return [...seen.values()].filter((s) => s.title).map((s) => ({ ...s, title: s.title.slice(0, 120) })).slice(0, MAX);
  }

  // ---- Scribble Hub ----
  // Web novels, Royal Road's neighbour; behind Cloudflare, so its pages
  // come through the hidden browser. Rows are div.search_main_box (title,
  // cover, genres), read by their /series/123/ links whatever they're in.
  const SH = "https://www.scribblehub.com";
  const SH_LISTS = [
    { key: "rank", label: "Most popular", path: "/series-ranking/?sort=1&order=1" },
    { key: "latest", label: "Latest updates", path: "/latest-series/" },
  ];
  const SH_GENRES = ["fantasy", "action", "adventure", "romance", "comedy", "drama", "horror", "mystery", "sci-fi", "slice-of-life", "isekai", "psychological"]
    .map((g) => ({ key: g, label: g[0].toUpperCase() + g.slice(1).replace(/-/g, " ").replace("Sci fi", "Sci-fi") }));
  const SH_CARD = { key: "sh", site: "Scribble Hub", id: (u) => (/scribblehub\.com$/i.test(u.hostname) && (/^\/series\/(\d+)\/[^/]+\/?$/.exec(u.pathname) || [])[1]) || "",
    title: ".search_title a, .search_title", about: ".search_body .fdi, .search_body > div:not([class])", tags: ".search_genre a, a.fic_genre", chapters: true };
  const parseSH = (html, base) => parseCards(html, base || SH, SH_CARD);
  const shBrowseUrl = (key, genre, page) => {
    const def = SH_LISTS.find((l) => l.key === key) || SH_LISTS[0];
    const u = new URL(genre ? SH + "/genre/" + genre + "/" : SH + def.path);
    if (page > 1) u.searchParams.set("pg", String(page));
    return u.href;
  };
  const shSearch = (words) => found(stories(SH + "/?s=" + encodeURIComponent(String(words || "").trim()) + "&post_type=fictionposts", parseSH));

  // ---- Wattpad ----
  // Its own public API (the one its pages use) answers JSON: a list by
  // category, hot or new, and a search; 20 at a time.
  const WP = "https://www.wattpad.com";
  const WP_FIELDS = "stories(id,title,url,cover,description,user(name),numParts,readCount,voteCount,tags,completed)";
  const WP_LISTS = [{ key: "hot", label: "Hot" }, { key: "new", label: "New" }];
  const WP_CATEGORIES = [[3, "Fantasy"], [4, "Romance"], [5, "Science fiction"], [9, "Horror"], [8, "Mystery and thriller"], [11, "Adventure"],
    [14, "Action"], [12, "Paranormal"], [1, "Teen fiction"], [21, "General fiction"], [7, "Humour"], [6, "Fanfiction"]]
    .map(([key, label]) => ({ key: String(key), label }));
  const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "K" : String(n || 0));
  function parseWattpad(body) {
    let data;
    try { data = JSON.parse(String(body || "").trim()); } catch (e) {
      try { data = JSON.parse(new DOMParser().parseFromString(String(body || ""), "text/html").body.textContent); } catch (x) { return []; }
    }
    return ((data && data.stories) || []).filter((s) => s && s.id && s.title).slice(0, MAX).map((s) => ({
      id: "wp" + s.id, url: httpUrl(s.url) || WP + "/story/" + s.id, site: "Wattpad", title: String(s.title).slice(0, 120),
      cover: httpUrl(s.cover), tags: (s.tags || []).map((t) => String(t).replace(/^-+/, "")).filter(Boolean).slice(0, 3),
      chapters: s.numParts || 0, followers: 0, rating: 0, stat: s.readCount ? short(s.readCount) + " reads" : "",
      by: s.user && s.user.name ? s.user.name : "", about: String(s.description || "").slice(0, 600),
    }));
  }
  const wpBrowseUrl = (key, cat, page) => WP + "/api/v3/stories?filter=" + (key || "hot") + "&category=" + (cat || "3") + "&limit=20&offset=" + (Math.max(1, page || 1) - 1) * 20 + "&fields=" + encodeURIComponent(WP_FIELDS);
  const wpSearch = (words) => found(stories(WP + "/v4/search/stories?query=" + encodeURIComponent(String(words || "").trim()) + "&limit=20&fields=" + encodeURIComponent(WP_FIELDS), parseWattpad));

  // ---- WEBTOON ----
  // Comics. The phone gets m.webtoons.com, whose genre and ranking pages
  // list series as links with title_no; its search builds itself, so it
  // comes through the hidden browser. One page each, no more.
  const WT = "https://www.webtoons.com";
  const WT_LISTS = [{ key: "popular", label: "Popular" }, { key: "ranking", label: "Top ranked" }];
  const WT_GENRES = ["FANTASY", "ROMANCE", "ACTION", "DRAMA", "COMEDY", "THRILLER", "SUPERNATURAL", "SLICE_OF_LIFE", "SF", "MYSTERY", "HORROR", "SUPER_HERO", "HISTORICAL", "SPORTS"]
    .map((g) => ({ key: g, label: g === "SF" ? "Sci-fi" : g[0] + g.slice(1).toLowerCase().replace(/_/g, " ").replace("Super hero", "Superhero") }));
  const WT_CARD = { key: "wt", site: "WEBTOON", id: (u) => (/webtoons\.com$/i.test(u.hostname) && /\/list\/?$/.test(u.pathname) && u.searchParams.get("title_no")) || "",
    url: (u, n) => WT + u.pathname.replace(/^\/?/, "/") + "?title_no=" + n, title: ".info_text .title, strong.title, .subj", about: ".plot, .summary", tags: ".genre" };
  function parseWebtoon(html, base, genre) {
    const items = parseCards(html, base || WT, WT_CARD);
    if (!genre) return items;
    // Ranking lists every genre: keep the picked one, by its links' genre.
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const of = new Map([...doc.querySelectorAll("[data-title-no][data-genre-code]")].map((a) => [a.getAttribute("data-title-no"), a.getAttribute("data-genre-code")]));
    return of.size ? items.filter((s) => !of.has(s.id.slice(2)) || of.get(s.id.slice(2)) === genre) : items;
  }
  const wtBrowseUrl = (key, genre) => (key === "ranking" ? WT + "/en/ranking" : WT + "/en/genres/" + (genre || "FANTASY").toLowerCase());
  const wtSearch = (words) => found(stories(WT + "/en/search?keyword=" + encodeURIComponent(String(words || "").trim()), parseWebtoon));

  // ---- Tapas ----
  // Comics and novels. Its search page lists series (li[data-href]); its
  // browse pages build themselves, so they come through the hidden browser.
  const TAPAS = "https://tapas.io";
  const TAPAS_LISTS = [{ key: "COMICS", label: "Popular comics", path: "/comics?sortType=POPULAR" }, { key: "NOVELS", label: "Popular novels", path: "/novels?sortType=POPULAR" }];
  const TAPAS_CARD = { key: "tp", site: "Tapas", id: (u) => (/tapas\.io$/i.test(u.hostname) && (/^\/series\/([^/?#]+)\/?(info)?\/?$/.exec(u.pathname) || [])[1] || "").toLowerCase(),
    url: (u) => TAPAS + "/series/" + /^\/series\/([^/?#]+)/.exec(u.pathname)[1], title: ".title", tags: ".genre" };
  const parseTapas = (html, base) => parseCards(html, base || TAPAS, TAPAS_CARD);
  let tapasKind = "COMICS";
  const tapasSearch = (words) => found(stories(TAPAS + "/search?t=" + tapasKind + "&q=" + encodeURIComponent(String(words || "").trim()), parseTapas));

  // The first page of a source's first list, for All's Sites row, kept
  // like Royal Road's.
  const FIRST_KEY = "waypage.discover.first.";
  const firstSaved = (key) => read(FIRST_KEY + key, null);
  async function firstRead(key, force) {
    const had = firstSaved(key);
    if (!force && had && Date.now() - had.at < FRESH) return had;
    const src = SOURCES.find((x) => x.key === key);
    const got = { at: Date.now(), items: await src.browse(src.lists[0].key, src.anyGenre ? "" : src.genres[0].key, 1) };
    keep(FIRST_KEY + key, got);
    return got;
  }
  const fpSaved = () => firstSaved("fp");
  const fpRead = (force) => firstRead("fp", force);

  // A web serial's chapters, from its table of contents. WordPress serials
  // list each arc or volume in a list of its own, so the general contents
  // reader (one list, the best) got one arc. Here every link in the post's
  // body counts, in page order. A contents page built by script is read
  // again in the hidden browser.
  const NOT_CHAPTER = /\/(category|tag|author|feed|wp-content|wp-admin|wp-login|comments)\b|[?&](share|replytocom)=|\.(jpe?g|png|gif|webp|pdf)$/i;
  function serialLinks(html, at) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const box = doc.querySelector(".entry-content, .post-content, .page-content, article .content, article, main") || doc.body;
    const host = (u) => u.hostname.replace(/^www\./, "");
    const page = new URL(at);
    const seen = new Set(), links = [];
    if (box) for (const a of box.querySelectorAll("a[href]")) {
      if (!text(a)) continue;
      let u;
      try { u = new URL(a.getAttribute("href"), at); } catch (e) { continue; }
      u.hash = "";
      if (!/^https?:$/.test(u.protocol) || host(u) !== host(page) || u.pathname.replace(/\/$/, "") === page.pathname.replace(/\/$/, "") || u.pathname === "/" || NOT_CHAPTER.test(u.href)) continue;
      if (!seen.has(u.href)) { seen.add(u.href); links.push(u.href); }
    }
    const og = doc.querySelector('meta[property="og:site_name"]');
    return { title: (og && og.content.trim()) || text(doc.querySelector("title")).replace(/\s*[|–-].*$/, ""), links };
  }
  async function serialChapters(url) {
    let res = null;
    try { res = await C.platform.fetchText(url); } catch (e) { if (!C.platform.canRender) throw e; }
    let got = res && res.status === 200 && !challenged(res) ? serialLinks(res.text, res.url || url) : { title: "", links: [] };
    if (got.links.length < 5 && C.platform.canRender) {
      const drawn = await C.platform.render(url, {});
      if (drawn) { const again = serialLinks(drawn.text, drawn.url || url); if (again.links.length > got.links.length) got = again; }
    }
    if (!got.links.length && res && res.status !== 200) throw new Error("HTTP " + res.status);
    return got;
  }

  // The story sites Sites browses, each with its lists and genres (`once`:
  // one page, no more after it; no genres: no genre picker).
  const SOURCES = [
    { key: "rr", label: "Royal Road", lists: RR_LISTS, genres: RR_GENRES, anyGenre: true, browse: (k, g, p) => rrBrowse(k, g, p), search: (w) => rrSearch(w) },
    { key: "ao3", label: "AO3", lists: AO3_SORTS, genres: AO3_TAGS, anyGenre: true, genreLabel: "Tag",
      browse: (k, g, p) => stories(ao3BrowseUrl(k, g, p), parseAO3), search: ao3Search },
    { key: "ffn", label: "FanFiction.net", lists: FP_SORTS, genres: FFN_FANDOMS, anyGenre: false, genreLabel: "Fandom",
      browse: (k, g, p) => stories(ffnBrowseUrl(k, g, p), parseFFN), search: zSearch(FFN, parseFFN) },
    { key: "fp", label: "FictionPress", lists: FP_SORTS, genres: FP_GENRES, anyGenre: false,
      browse: (k, g, p) => stories(fpBrowseUrl(k, g, p), parseFP), search: zSearch(FP, parseFP) },
    { key: "sh", label: "Scribble Hub", lists: SH_LISTS, genres: SH_GENRES, anyGenre: true,
      browse: (k, g, p) => stories(shBrowseUrl(k, g, p), parseSH), search: shSearch },
    { key: "wp", label: "Wattpad", lists: WP_LISTS, genres: WP_CATEGORIES, anyGenre: false,
      browse: (k, g, p) => stories(wpBrowseUrl(k, g, p), parseWattpad), search: wpSearch },
    { key: "wt", label: "WEBTOON", comics: true, once: true, lists: WT_LISTS, genres: WT_GENRES, anyGenre: true,
      browse: (k, g, p) => (p > 1 ? Promise.resolve([]) : stories(wtBrowseUrl(k, g), (h, b) => parseWebtoon(h, b, g))), search: wtSearch },
    { key: "tp", label: "Tapas", comics: true, once: true, lists: TAPAS_LISTS, genres: [], anyGenre: true,
      browse: (k, g, p) => { tapasKind = k || "COMICS"; return p > 1 ? Promise.resolve([]) : stories(TAPAS + (TAPAS_LISTS.find((l) => l.key === k) || TAPAS_LISTS[0]).path, parseTapas); }, search: tapasSearch },
  ];

  C.discover = { list, refresh, fromSource, clean, isStory, storyId, parseList, rrLists: RR_LISTS, rrGenres: RR_GENRES, rrSaved, rrRead, rrSearch, rrBrowse, rrBrowseUrl, parseFP, parseFFN, parseAO3, parseSH, parseWattpad, parseWebtoon, parseTapas, fpBrowseUrl, ffnBrowseUrl, ao3BrowseUrl, wpBrowseUrl, firstSaved, firstRead, fpSaved, fpRead, serialLinks, serialChapters, sources: SOURCES };
})();
