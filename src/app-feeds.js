// Waypage's shell: Feeds and Newsletters, the feeds followed, checked and
// saved from (split out of app-saving.js, 2026-11). See app.js for how
// the parts share.
// ---- Feeds (0.28.0) ----
// Following a site: its feed is read every few hours while the app is
// open and online, and its posts wait in one river, newest day first,
// until they're saved, or save themselves where the feed is set to. A
// post stays in the river (as Saved, once saved) until it's older than
// its feed's window. Feeds are kept in localStorage as [{ url, title,
// link, icon, mode: "show" | "save", images, folder, days, addedAt,
// checkedAt, error, items: [{ id, url, title, date, foundAt, tried }] }].
const FEEDS_KEY = "waypage.feeds";
const PLACE_KEY = "waypage.place";
const FEEDS_SEEN_KEY = "waypage.feedsSeen";
const FEEDS_ASKED_KEY = "waypage.feedsAsked";
const FEED_EVERY = 3 * 36e5;
const FEED_KEEP = 100;
const FEED_DAYS = [{ value: "3", label: t("3 days") }, { value: "7", label: t("A week") }, { value: "30", label: t("A month") }];
const FEED_ICONS = {
  library: ICONS.book,
  feeds: '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.5"/>',
  add: ICONS.add,
  out: ICONS.original,
};
const feedIcon = (name, size = 20) => {
  const s = el("span", { class: "side-icon", "aria-hidden": "true" });
  s.innerHTML = '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + FEED_ICONS[name] + "</svg>";
  return s;
};

let feeds = load(FEEDS_KEY, []);
if (!Array.isArray(feeds)) feeds = [];
// Newsletters (1.43.0) are Kill the Newsletter addresses: each one an
// email address and the Atom feed its emails arrive in, followed like
// any feed but shown in Newsletters, never in Feeds.
const KTN = "kill-the-newsletter.com";
const MAIL_FEED = /^https:\/\/kill-the-newsletter\.com\/feeds\/([a-z0-9]+)\.xml$/i;
const MAIL_DAYS = 30;
const isMail = (f) => MAIL_FEED.test((f && f.url) || "");
const mailBoxes = () => feeds.filter(isMail);
const siteFeeds = () => feeds.filter((f) => !isMail(f));
const mailAddress = (f) => (f.url.match(MAIL_FEED) || [])[1] + "@" + KTN;
// "Please confirm your subscription": a Confirm button, not a clip.
const CONFIRM = /\b(confirm|verify|activate|validate)|opt[- ]?in/i;
const isConfirm = (it) => CONFIRM.test((it && it.title) || "");
state.place = ["feeds", "newsletters", "highlights", "reading", "discover"].includes(load(PLACE_KEY, "library")) || (C.ext.place(load(PLACE_KEY, "library")) && C.ext.on(load(PLACE_KEY, "library"))) ? load(PLACE_KEY, "library") : "library";
// The feed picked in the river (its url), or null for all of them.
state.feed = null;
state.side = false;
let feedsChecking = false;

// What's followed and how goes to sync (0.30.1); new posts don't.
const feedSig = () => JSON.stringify(feeds.map((f) => [f.url, f.title, f.mode, f.images, f.folder, f.days]));
let lastFeedSig = feedSig();
const saveFeeds = () => {
  store(FEEDS_KEY, feeds); watchFeeds(); updateWidgets();
  const sig = feedSig();
  if (sig !== lastFeedSig) { lastFeedSig = sig; syncSoon(); }
};
// Feeds as sync settled them: one followed elsewhere is checked here.
function syncedFeeds(list) {
  const had = new Map(feeds.map((f) => [f.url, f]));
  const fresh = [];
  const next = list.map((m) => {
    const f = had.get(m.url);
    if (!f) { const n = { ...m, folder: m.folder || "", link: m.link || null, icon: m.icon || null, checkedAt: 0, error: "", items: [] }; fresh.push(n); return n; }
    Object.assign(f, m);
    if (!m.folder) f.folder = "";
    return f;
  });
  const before = feedSig();
  feeds = next;
  if (feedSig() === before && !fresh.length) return;
  lastFeedSig = feedSig();
  if (state.feed && !feeds.some((f) => f.url === state.feed)) state.feed = null;
  store(FEEDS_KEY, feeds); watchFeeds(); updateWidgets();
  paintFeeds();
  if (fresh.length) setTimeout(() => checkFeeds(false), 0);
}
// Notifications (1.30.0), this phone's own: off, or new posts each on
// their own (title and summary, grouped by feed, with Save) or all in one,
// and feeds kept quiet.
const NOTES_KEY = "waypage.notes";
function notesPrefs() {
  const n = load(NOTES_KEY, {}) || {};
  return { on: n.on !== false, posts: n.posts === "together" ? "together" : "each", quiet: Array.isArray(n.quiet) ? n.quiet : [], chapters: n.chapters !== false };
}
function setNotes(change) {
  store(NOTES_KEY, { ...notesPrefs(), ...change });
  watchFeeds();
}
const feedQuiet = (f) => notesPrefs().quiet.includes(f.url);
function setFeedQuiet(f, quiet) {
  const q = notesPrefs().quiet.filter((u) => u !== f.url && feeds.some((x) => x.url === u));
  if (quiet) q.push(f.url);
  setNotes({ quiet: q });
}
// What the closed app's checks compare with: every post each feed has.
let watchTimer = null, askToNotify = false;
function watchFeeds() {
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    const list = feeds.map((f) => ({ url: f.url, title: f.title, known: [...new Set(f.items.flatMap((it) => [it.id, it.url]).filter(Boolean))] }));
    const stories = chapterWatchList();
    const n = notesPrefs();
    C.platform.feedChecks.watch(list, n.on && askToNotify && (list.length > 0 || stories.length > 0), { style: n.on ? n.posts : "off", quiet: n.quiet },
      stories, load(DATA_SAVE_KEY, "any") === "wifi");
    askToNotify = false;
  }, 1000);
}
const postAt = (it) => it.date || it.foundAt || 0;
const postKey = (it) => it.id || it.url;
const inWindow = (f, it) => postAt(it) >= Date.now() - (f.days || 7) * DAY;
const feedPosts = (f) => f.items.filter((it) => inWindow(f, it));
const savingUrl = (url) => state.saving.some((s) => !s.error && sameUrl(s.url, url));
const waitingIn = (f) => feedPosts(f).filter((it) => !savedAs(it.url)).length;
// New since Feeds was last looked at, for the sidebar's pill.
const freshPosts = () => {
  const seen = load(FEEDS_SEEN_KEY, 0);
  return siteFeeds().reduce((n, f) => n + feedPosts(f).filter((it) => it.foundAt > seen && !savedAs(it.url)).length, 0);
};

// The feed's site icon, or its first letter, like a card with no picture.
function feedMark(f, small) {
  const url = f.link || f.url;
  const box = siteMark({ site: C.feeds.siteOf(url) || f.title, icon: f.icon, url });
  box.className = "site-mark feed-mark" + (small ? " small" : "");
  return box;
}

// "About 2 posts a day · last one 2 h ago", from the posts' dates.
function rateLine(items, mail) {
  const ds = items.map((it) => it.date).filter(Boolean).sort((a, b) => b - a);
  if (!ds.length) return items.length ? (mail ? tn(items.length, "1 email", "{n} emails") : tn(items.length, "1 post", "{n} posts")) : mail ? t("No emails yet") : t("No posts yet");
  const last = whenText(ds[0]);
  if (ds.length < 2) return mail ? t("Last email {when}", { when: last }) : t("Last post {when}", { when: last });
  const perDay = (ds.length - 1) / Math.max((ds[0] - ds[ds.length - 1]) / DAY, 1 / 24);
  const perWeek = perDay * 7;
  const rate = mail
    ? (perDay >= 1.5 ? t("About {n} emails a day", { n: Math.round(perDay) })
      : perDay >= 0.75 ? t("About an email a day")
      : perWeek >= 1.5 ? t("About {n} emails a week", { n: Math.round(perWeek) })
      : perWeek >= 0.75 ? t("About an email a week") : t("An email now and then"))
    : (perDay >= 1.5 ? t("About {n} posts a day", { n: Math.round(perDay) })
      : perDay >= 0.75 ? t("About a post a day")
      : perWeek >= 1.5 ? t("About {n} posts a week", { n: Math.round(perWeek) })
      : perWeek >= 0.75 ? t("About a post a week") : t("A post now and then"));
  return rate + " · " + t("last one {when}", { when: last });
}

// A GitHub repo's releases (2026-11): what the add sheet says of them,
// and each release's row, "6 added · 3 changed · 3 fixed" in its own
// list and just "Release" among every feed's posts.
function releasesLine(items) {
  const last = Math.max(0, ...items.map((it) => it.date || 0));
  return last ? t("Releases on GitHub · last one {when}", { when: whenText(last) }) : t("Releases on GitHub · none yet");
}
function releaseMeta(it, short) {
  const n = it.notes || {};
  const parts = [n.added && t("{n} added", { n: n.added }), n.changed && t("{n} changed", { n: n.changed }), n.fixed && t("{n} fixed", { n: n.fixed }), n.removed && t("{n} removed", { n: n.removed })].filter(Boolean);
  return short || !parts.length ? t("Release") : parts.join(" · ");
}

// Today, Yesterday, a weekday this week, then the date.
function dayName(t) {
  const start = new Date().setHours(0, 0, 0, 0);
  if (t >= start) return i18n.t("Today");
  if (t >= start - DAY) return i18n.t("Yesterday");
  const d = new Date(t);
  if (t >= start - 6 * DAY) return d.toLocaleDateString(i18n.lang, { weekday: "long" });
  return d.toLocaleDateString(i18n.lang, { day: "numeric", month: "long" });
}

// A feed's posts after a check: what it lists now, with when each was
// first seen kept, plus earlier posts it dropped while they're still
// inside the window.
function mergeFeed(f, got) {
  const now = Date.now();
  const had = new Map(f.items.map((it) => [postKey(it), it]));
  const items = got.items.map((it) => {
    const old = had.get(postKey(it));
    const out = { id: it.id, url: it.url, title: it.title, date: it.date, foundAt: old ? old.foundAt : now };
    if (old && old.tried) out.tried = true;
    // A newsletter's email (1.43.0): its sender, its confirm link, and
    // whether it was opened.
    if (it.from) out.from = it.from;
    if (it.act) out.act = it.act;
    if (it.notes) out.notes = it.notes;
    if (old && old.opened) out.opened = true;
    return out;
  });
  const now_ = new Set(items.map(postKey));
  for (const old of f.items) if (!now_.has(postKey(old)) && inWindow(f, old)) items.push(old);
  f.items = items.sort((a, b) => postAt(b) - postAt(a)).slice(0, FEED_KEEP);
  if (got.icon) f.icon = got.icon;
  if (got.link) f.link = got.link;
}

// Feeds from another reader's OPML (1.32.0): each one not followed yet
// is followed, its posts shown in Feeds rather than saved, into a
// collection named after its group there or itself.
function followFeeds(list) {
  let added = 0;
  for (const o of list) {
    if (feeds.some((h) => sameUrl(h.url, o.url))) continue;
    const title = cleanTag(o.title) || C.feeds.siteOf(o.url);
    feeds.push({ url: o.url, title, link: "", icon: "", mode: "show", images: feedImages(),
      folder: cleanTag(o.folder) || title, days: 7, addedAt: Date.now(), checkedAt: 0, error: "", items: [] });
    added++;
  }
  if (!added) { toast(list.length ? t("You follow all of those feeds already.") : t("No feeds in that file.")); return; }
  saveFeeds();
  paintFeeds();
  toast(tn(added, "Following 1 feed. Its posts are in Feeds.", "Following {n} feeds. Their posts are in Feeds."));
  setTimeout(() => checkFeeds(true), 0);
}

// Feeds from a backup: one not followed here is followed again, with its
// posts; one followed already keeps its settings here. Returns how
// many were added.
// Followed again now (1.46.0), so sync takes it over an older unfollow.
function restoreFeeds(list) {
  let added = 0;
  for (const f of list || []) {
    if (feeds.some((h) => sameUrl(h.url, f.url))) continue;
    feeds.push({ ...f, addedAt: Date.now() });
    added++;
  }
  if (added) {
    saveFeeds();
    paintFeeds();
    setTimeout(() => checkFeeds(), 0);
  }
  return added;
}

// Posts found with the app closed: those feeds are read again now, and
// the notification's tap opens Feeds.
async function takeFeedNews() {
  const news = await C.platform.feedChecks.news();
  // A collection's new chapters, found with the app closed: it opens, and
  // each such collection checks itself now.
  const story = news.story && allFolders().find((n) => sameTag(n, news.story));
  if (news.open && story) {
    await toLibrary();
    if (state.place !== "library") await goPlace("library");
    openFolder(story);
  } else if (news.open) {
    await toLibrary();
    const to = news.feed && feeds.some((f) => f.url === news.feed) ? news.feed : null;
    const place = to && isMail({ url: to }) ? "newsletters" : "feeds";
    if (state.place !== place || state.feed !== to) await goPlace(place, to);
  }
  // A post's Save, from its notification.
  if (news.save && /^https?:/.test(news.save)) {
    const f = feeds.find((x) => x.url === news.feed);
    const it = f && f.items.find((x) => sameUrl(x.url, news.save));
    if (f) saveFeedPosts([{ f, it: it || { url: news.save, foundAt: Date.now() } }]);
    else savePage(news.save);
  }
  let due = false;
  for (const url of news.feeds) {
    const f = feeds.find((x) => x.url === url);
    if (f) { f.checkedAt = 0; due = true; }
  }
  if (due) checkFeeds(false);
  const names = (news.stories || []).map((x) => allFolders().find((n) => sameTag(n, x))).filter(Boolean);
  if (names.length && navigator.onLine) (async () => { for (const name of names) await checkNew(name, true); })();
}

// One feed read again; a feed set to save its posts saves the new ones.
async function checkFeed(f) {
  let got = null, error = "";
  try { got = await C.feeds.readFeed(f.url); }
  catch (e) { error = e instanceof C.feeds.FeedError ? e.message : t("Couldn't check this feed. Try again later."); }
  if (!feeds.includes(f)) return;
  if (got && isMail(f)) keepMails(got);
  if (got) mergeFeed(f, got);
  f.error = error;
  f.checkedAt = Date.now();
  saveFeeds();
  paintFeeds();
  if (got && f.mode === "save") autoSave(f);
}

// Every feed not checked in the last few hours, one at a time, quietly.
async function checkFeeds(force) {
  if (feedsChecking || !navigator.onLine || !feeds.length) return;
  if (waitsForWifi(DATA_SAVE_KEY)) { if (force) toast(t("Feeds check when you're on Wi-Fi.")); return; }
  feedsChecking = true;
  paintFeeds();
  try {
    for (const f of [...feeds]) {
      if (!force && f.checkedAt && Date.now() - f.checkedAt < FEED_EVERY) continue;
      // A browser can't read a newsletter address; the phone does.
      if (isMail(f) && !C.platform.canFetchPages) continue;
      await checkFeed(f);
    }
  } finally {
    feedsChecking = false;
    paintFeeds();
  }
}

// Saves run one feed after another, so two feeds saving at once don't
// interleave their runs.
let feedSaves = Promise.resolve();
function autoSave(f) {
  // A newsletter's confirm email waits for its Confirm, never saved.
  const todo = feedPosts(f).filter((it) => !it.tried && !savedAs(it.url) && !savingUrl(it.url) && !(isMail(f) && isConfirm(it)));
  if (!todo.length) return;
  todo.forEach((it) => { it.tried = true; });
  saveFeeds();
  saveFeedPosts(todo.map((it) => ({ f, it })));
}

// Into each post's feed's collection, oldest first so the collection
// reads in order, with the feed's pictures setting.
function saveFeedPosts(list) {
  if (!navigator.onLine) { toast(t("You're offline. Save these when you're back online.")); return feedSaves; }
  const by = new Map();
  for (const x of [...list].sort((a, b) => postAt(a.it) - postAt(b.it))) {
    if (savedAs(x.it.url) || savingUrl(x.it.url)) continue;
    if (isMail(x.f)) { feedSaves = feedSaves.then(() => saveMail(x.f, x.it)).then(paintFeeds, paintFeeds); continue; }
    if (!by.has(x.f)) by.set(x.f, []);
    by.get(x.f).push(x.it.url);
  }
  for (const [f, urls] of by) {
    const folder = f.folder ? folderName(f.folder) : null;
    const how = { mode: C.platform.native ? f.images || feedImages() : undefined };
    feedSaves = feedSaves.then(() => urls.length === 1 ? savePage(urls[0], folder || undefined, how)
      : saveAll(urls, folder, [], how.mode, true)).then(paintFeeds, paintFeeds);
  }
  paintFeeds();
  return feedSaves;
}

function paintFeeds() {
  if (state.place === "feeds") renderFeeds();
  if (state.place === "newsletters") renderNewsletters();
  if (state.place === "discover") renderDiscover();
  if (sideShown()) renderSide();
  if (state.menu && state.menu.kind === "feed") redrawMenu();
}

function pickFeed(url) {
  state.feed = url;
  renderFeeds();
}

function renderFeeds() {
  // Newsletters (1.43.0) are feeds underneath, with a place of their own.
  const feeds = siteFeeds();
  const root = $("feeds");
  const picked = state.feed && feeds.find((f) => f.url === state.feed);
  if (state.feed && !picked) state.feed = null;
  // Looking at Feeds clears what's new; only a change goes to sync, so
  // an open river doesn't write to GitHub every few minutes.
  if (document.visibilityState !== "hidden" && freshPosts()) { store(FEEDS_SEEN_KEY, Date.now()); syncSoon(); }
  const active = document.activeElement && root.contains(document.activeElement)
    ? [document.activeElement.closest("[data-key]"), document.activeElement.className] : null;
  const chipsAt = root.querySelector(".feed-chips");
  const scrollX = chipsAt ? chipsAt.scrollLeft : 0;
  const nodes = [];
  if (!feeds.length) {
    leavePostSearch();
    nodes.push(el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, t("Follow the sites you read")),
      el("p", { class: "empty-text" }, C.platform.native
        ? t("Add a site and its new posts wait here for you to save, or save themselves.")
        : t("Add a site and its new posts wait here. Most sites only let Waypage on your phone read their feed.")),
      el("button", { class: "btn-primary", type: "button", onclick: () => openMenu("addFeed") }, t("Add a feed"))));
    root.replaceChildren(...nodes);
    return;
  }
  const chip = (label, n, on, onclick, key) => {
    const b = el("button", { class: "chip" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), "data-key": key, onclick },
      el("span", { class: "chip-label", dir: "auto" }, label), n ? " · " + n : null);
    return b;
  };
  const all = feeds.reduce((n, f) => n + waitingIn(f), 0);
  nodes.push(el("div", { class: "chips filters feed-chips", role: "group", "aria-label": t("Feeds") },
    chip(t("All"), all, !picked, () => pickFeed(null), "chip:all"),
    ...feeds.map((f) => {
      const c = chip(f.title, waitingIn(f), picked === f, () => pickFeed(f.url), "chip:" + f.url);
      c.dataset.feed = f.url;
      return c;
    })));
  const checked = Math.max(0, ...(picked ? [picked] : feeds).map((f) => f.checkedAt || 0));
  const box = postSearchBox(), ts = postTerms();
  const list = (picked ? [picked] : feeds).flatMap((f) => feedPosts(f).map((it) => ({ f, it })))
    .filter((x) => !ts.length || postMatch(x.f, x.it, ts))
    .sort((a, b) => postAt(b.it) - postAt(a.it));
  const line = ts.length ? tn(list.length, "1 post found", "{n} posts found")
    : feedsChecking ? t("Checking…") : picked && picked.error ? picked.error
    : checked ? t("Checked {when}", { when: whenText(checked) }) : t("Not checked yet");
  nodes.push(el("div", { class: "feed-head" },
    el("p", { class: "meta" + (picked && picked.error && !feedsChecking && !ts.length ? " warn" : ""), role: ts.length ? "status" : null }, line),
    // Phones pull down to check; a pointer gets the button.
    el("span", { class: "feed-head-acts" },
      el("button", { class: "btn-text feed-check", type: "button", "data-key": "check", onclick: () => checkNow(picked) }, t("Check now")))));
  let day = null, group = null;
  for (const x of list) {
    const d = dayName(postAt(x.it));
    if (d !== day) {
      day = d;
      const open = list.filter((y) => dayName(postAt(y.it)) === d && !savedAs(y.it.url) && !savingUrl(y.it.url));
      nodes.push(sectionHead(d, open.length > 1
        ? el("button", { class: "btn-text", type: "button", "data-key": "all:" + d, onclick: () => saveFeedPosts(open) }, t("Save all {n}", { n: open.length })) : null));
      group = el("div", { class: "group feed-group" });
      nodes.push(group);
    }
    group.append(postRow(x.f, x.it, !picked));
  }
  if (!list.length && ts.length) nodes.push(el("p", { class: "empty-text hl-none" }, t("No posts match that.")));
  else if (!list.length) {
    const days = (picked || feeds[0]).days || 7;
    nodes.push(el("div", { class: "empty" },
      el("p", { class: "empty-text" }, (picked && picked.error) || (!checked ? t("Its posts show up after the first check.")
        : ({ "3": t("Nothing posted in the last 3 days."), "30": t("Nothing posted in the last month.") }[String(days)] || t("Nothing posted in the last week."))))));
  }
  fillPosts(root, box, nodes);
  if (state.feedPick) paintPostPicks();
  const chips = root.querySelector(".feed-chips");
  if (chips) chips.scrollLeft = scrollX;
  if (active && active[0]) {
    const again = root.querySelector('[data-key="' + CSS.escape(active[0].dataset.key) + '"]');
    const cls = String(active[1]).split(" ")[0];
    const target = again && cls && (again.classList.contains(cls) ? again : again.querySelector("." + cls));
    if (target) target.focus({ preventScroll: true });
  }
}
