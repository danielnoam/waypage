// Waypage: Discover, a place to browse new things to follow (src/discover.js
// holds the sources). It adds nothing of its own: a site or a newsletter
// with a feed goes to the Add a feed sheet, a Royal Road story is saved as
// a collection (its chapter list, which then follows new chapters), and an
// email-only newsletter gets an address from Newsletters and its sign-up
// page. See app.js for the order these files load in.

// The chip picked: all, stories, sites, newsletters or a topic.
let dzPick = "all";
let dzList = load("waypage.discover.rrList", "rising");
// Royal Road as last read: { at, items } per list, or an error line.
const dz = { busy: false, error: "", found: null, searching: false };
// The phone reads Royal Road itself; the web copy can once its fetch
// proxy is set (canReadPages, the Worker's PR), and not before.
const dzCanRead = () => ("canReadPages" in C.platform ? C.platform.canReadPages : C.platform.canFetchPages);
const DZ_KINDS = [["all", "All"], ["stories", "Stories"], ["sites", "Sites"], ["newsletters", "Newsletters"]];
const dzHost = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };

// Followed already: a feed from the same site (its page or its feed).
function dzFollowing(e) {
  const hosts = [dzHost(e.url), dzHost(e.feedUrl)].filter(Boolean);
  return feeds.some((f) => hosts.includes(dzHost(f.link)) || hosts.includes(dzHost(f.url)));
}
// A story saved already: a collection read from its page.
function dzSavedStory(s) {
  return allFolders().some((n) => { const src = folderSource(folderPages(n)); return src && C.discover.storyId(src) === s.id; });
}

function renderDiscover() {
  const root = $("discover");
  const { topics, entries } = C.discover.list();
  const chipsAt = root.querySelector(".feed-chips");
  const scrollX = chipsAt ? chipsAt.scrollLeft : 0;
  const chip = (key, label) => el("button", { class: "chip" + (dzPick === key ? " on" : ""), type: "button", "aria-pressed": String(dzPick === key),
    "data-key": "chip:" + key, onclick: () => { dzPick = key; renderDiscover(); } }, el("span", { class: "chip-label" }, label));
  const nodes = [el("div", { class: "chips filters feed-chips", role: "group", "aria-label": "Show" },
    ...DZ_KINDS.map(([k, l]) => chip(k, l)), ...topics.map((t) => chip("#" + t, t)))];
  const topic = dzPick.startsWith("#") ? dzPick.slice(1) : null;
  const show = (k) => dzPick === "all" || dzPick === k || (topic && k !== "stories");
  if (show("stories") && (!topic || topic === "Fiction")) nodes.push(...dzStories());
  const pick = (kind) => entries.filter((e) => e.kind === kind && (!topic || e.topic === topic));
  if (show("sites") && pick("site").length) {
    nodes.push(sectionHead("Sites"), el("div", { class: "group feed-group" }, ...pick("site").map(dzRow)));
  }
  if (show("newsletters") && pick("newsletter").length) {
    nodes.push(sectionHead("Newsletters"), el("div", { class: "group feed-group" }, ...pick("newsletter").map(dzRow)));
  }
  nodes.push(el("p", { class: "footnote dz-foot" }, "Picked by hand. ",
    el("button", { class: "btn-text dz-suggest", type: "button", onclick: () => C.platform.openOutside("https://github.com/danielnoam/waypage/issues/new?title=" + encodeURIComponent("Discover: ")) }, "Suggest one on GitHub")));
  root.replaceChildren(...nodes);
  const chips = root.querySelector(".feed-chips");
  if (chips) chips.scrollLeft = scrollX;
}

function dzRow(e) {
  const on = dzFollowing(e);
  const add = () => dzAdd(e);
  const tag = e.kind === "newsletter" ? el("span", { class: "dz-tag" + (e.feed ? " feed" : "") }, e.feed ? "Feed" : "Email") : null;
  return el("div", { class: "post dz-row", "data-key": "dz:" + e.url },
    el("button", { class: "post-open", type: "button", "aria-label": e.name + (on ? ", following" : ""), onclick: on ? () => dzOpenFollowed(e) : add }),
    feedMark({ url: e.url, link: e.url, title: e.name }),
    el("span", { class: "post-body" },
      el("span", { class: "post-title", dir: "auto" }, e.name),
      e.about ? el("span", { class: "dz-about", dir: "auto" }, e.about) : null,
      el("span", { class: "post-meta" }, tag, dzHost(e.url))),
    on ? el("span", { class: "post-saved dz-on" }, dzIcon("check"), "Following")
      : el("button", { class: "post-act post-save", type: "button", "aria-label": (e.kind === "newsletter" && !e.feed ? "Sign up to " : "Follow ") + e.name, onclick: add }, dzIcon("plus")));
}

function dzOpenFollowed(e) {
  const hosts = [dzHost(e.url), dzHost(e.feedUrl)];
  const f = feeds.find((x) => hosts.includes(dzHost(x.link)) || hosts.includes(dzHost(x.url)));
  if (f) goPlace(isMail(f) ? "newsletters" : "feeds", f.url);
}

function dzAdd(e) {
  if (e.kind === "newsletter" && !e.feed) { openMenu("signup", e); return; }
  openMenu("addFeed", { url: e.feedUrl || e.url });
}

const DZ_ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
};
function dzIcon(name, size) {
  const box = el("span", { class: "side-icon", "aria-hidden": "true" });
  const s = size || 18;
  box.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + DZ_ICONS[name] + "</svg>";
  return box;
}

// ---- Royal Road ----

function dzStories() {
  if (!dzCanRead()) {
    return dzPick === "stories" ? [sectionHead("Royal Road"), el("p", { class: "footnote" }, "Royal Road's lists show in Waypage on your phone. A story's link pasted below saves it here too.")] : [];
  }
  if (dz.found) {
    const f = dz.found;
    return [sectionHead("Royal Road · " + f.words, el("button", { class: "btn-text", type: "button", onclick: dzClearSearch }, "Clear")),
      f.items.length ? dzCovers(f.items) : el("p", { class: "footnote" }, f.error || "No stories with that in their title.")];
  }
  const def = C.discover.rrLists.find((l) => l.key === dzList) || C.discover.rrLists[0];
  const got = C.discover.rrSaved(def.key);
  const pickList = dropdown({ label: "Royal Road list", cls: "dz-list-pick", value: def.key,
    options: C.discover.rrLists.map((l) => ({ value: l.key, label: l.label })),
    onpick: (v) => { dzList = v; store("waypage.discover.rrList", v); dz.error = ""; renderDiscover(); dzReadRR(); } });
  const line = dz.busy ? "Reading Royal Road…" : dz.error ? dz.error
    : got ? "From royalroad.com, " + whenText(got.at) : navigator.onLine ? "" : "Royal Road's lists show when you're online.";
  return [sectionHead("Royal Road", pickList),
    got && got.items.length ? dzCovers(got.items) : null,
    line ? el("p", { class: "footnote dz-src" + (dz.error && !dz.busy ? " warn" : "") }, line) : null];
}

function dzCovers(items) {
  return el("div", { class: "dz-covers", role: "list" }, ...items.map((s) => {
    const saved = dzSavedStory(s);
    const art = el("span", { class: "dz-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, s.title));
    if (s.cover) {
      const img = el("img", { src: s.cover, alt: "", loading: "lazy", referrerpolicy: "no-referrer" });
      img.addEventListener("load", () => art.classList.add("has-img"));
      img.addEventListener("error", () => img.remove());
      art.prepend(img);
    }
    const meta = [s.tags[0], s.chapters ? s.chapters + " ch." : ""].filter(Boolean).join(" · ");
    return el("button", { class: "dz-book", type: "button", role: "listitem", "data-key": "rr:" + s.id,
      "aria-label": s.title + (saved ? ", in your library" : ""), onclick: () => openMenu("story", s) },
      el("span", { class: "dz-art" }, art, el("span", { class: "dz-mark" + (saved ? " on" : "") }, dzIcon(saved ? "check" : "plus", 16))),
      el("span", { class: "dz-bt", dir: "auto" }, s.title),
      meta ? el("span", { class: "dz-bm" }, meta) : null);
  }));
}

async function dzReadRR(force) {
  if (!dzCanRead() || dz.busy || dz.found) return;
  const def = C.discover.rrLists.find((l) => l.key === dzList) || C.discover.rrLists[0];
  const had = C.discover.rrSaved(def.key);
  if (!force && had && Date.now() - had.at < 36e5) return;
  if (!navigator.onLine) return;
  dz.busy = true;
  dz.error = "";
  if (state.place === "discover") renderDiscover();
  try { await C.discover.rrRead(def.key, force); }
  catch (e) { dz.error = had ? "Couldn't reach Royal Road. This is the list from " + whenText(had.at) + "." : "Couldn't read Royal Road's list just now. Pull down to try again."; }
  dz.busy = false;
  if (state.place === "discover") renderDiscover();
}

async function dzSearch(words) {
  if (!dzCanRead()) { toast("Searching Royal Road works in Waypage on your phone."); return; }
  if (!navigator.onLine) { toast("You're offline. Search when you're back online."); return; }
  if (dz.searching) return;
  dz.searching = true;
  dzPick = "stories";
  toast("Searching Royal Road…");
  try { dz.found = { words, items: await C.discover.rrSearch(words), error: "" }; }
  catch (e) { dz.found = { words, items: [], error: "Couldn't reach Royal Road. Try again in a while." }; }
  dz.searching = false;
  if (state.place === "discover") { renderDiscover(); scrollTo(0, 0); }
}
function dzClearSearch() { dz.found = null; renderDiscover(); }

// The bottom field: a link follows a site, or saves a Royal Road story;
// words search Royal Road.
function discoverField(typed) {
  const url = linkFrom(typed);
  if (url && C.discover.isStory(url)) { savePage(url); return; }
  if (url) { openMenu("addFeed", { url }); return; }
  if (typed.trim()) dzSearch(typed.trim());
}

// Opening the place: the list as it is, then Royal Road's (at most once
// an hour) and a newer hand-picked list from GitHub (twice a day), each
// drawn again when it comes.
function openDiscover() {
  renderDiscover();
  dzReadRR();
  const repo = C.platform.native && C.platform.build && C.platform.build.repo;
  if (repo && navigator.onLine) C.discover.refresh(repo).then((changed) => { if (changed && state.place === "discover") renderDiscover(); });
}

// ---- The sheets ----

function storySheet() {
  const s = state.menu.page;
  const saved = dzSavedStory(s);
  const cover = el("span", { class: "dz-cover dz-sheet-cover", "aria-hidden": "true" }, el("span", { class: "dz-cover-t", dir: "auto" }, s.title));
  if (s.cover) {
    const img = el("img", { src: s.cover, alt: "", referrerpolicy: "no-referrer" });
    img.addEventListener("load", () => cover.classList.add("has-img"));
    img.addEventListener("error", () => img.remove());
    cover.prepend(img);
  }
  const facts = [s.chapters ? s.chapters + (s.chapters === 1 ? " chapter" : " chapters") : "", s.followers ? s.followers.toLocaleString() + " following" : ""].filter(Boolean).join(" · ");
  const rated = [s.rating ? "★ " + s.rating.toFixed(1) : "", s.tags.join(", ")].filter(Boolean).join(" · ");
  const save = el("button", { class: "btn-primary", type: "button", onclick: async () => { await back(); savePage(s.url); } },
    saved ? "Save it again" : "Save as a collection");
  return el("div", { class: "page-controls dz-story" },
    el("div", { class: "dz-sheethead" }, cover,
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, s.title),
        el("p", { class: "meta" }, "Royal Road"),
        facts ? el("p", { class: "meta" }, facts) : null,
        rated ? el("p", { class: "meta" }, rated) : null)),
    s.about ? el("p", { class: "dz-blurb", dir: "auto" }, s.about) : null,
    saved ? el("p", { class: "footnote dz-ok" }, "It's in your library already.") : null,
    save,
    el("p", { class: "footnote" }, "Its chapter list opens to check, then every chapter saves for reading offline. New chapters join the collection when they're out."),
    el("button", { class: "btn-quiet", type: "button", onclick: () => C.platform.openOutside(s.url) }, dzIcon("out", 16), "Open on Royal Road"));
}

function signupSheet() {
  const e = state.menu.page;
  const boxes = mailBoxes();
  let picked = boxes[0] || null;
  const addr = el("p", { class: "dz-addr" });
  const chips = el("div", { class: "chips" });
  const go = el("button", { class: "btn-primary", type: "button" });
  const paint = () => {
    fill(chips, ...boxes.map((f) => el("button", { class: "chip" + (picked === f ? " on" : ""), type: "button", "aria-pressed": String(picked === f),
      onclick: () => { picked = f; paint(); } }, el("span", { class: "chip-label", dir: "auto" }, f.title))),
      el("button", { class: "chip" + (!picked ? " on" : ""), type: "button", "aria-pressed": String(!picked), onclick: () => { picked = null; paint(); } }, "New address"));
    addr.textContent = picked ? mailAddress(picked) : "A new address named " + e.name + ", made when you sign up.";
    go.textContent = picked ? "Copy address and sign up" : "Make it, copy it and sign up";
  };
  paint();
  go.addEventListener("click", async () => {
    let box = picked;
    await back();
    if (!box) {
      const before = new Set(mailBoxes());
      if (!(await makeMailBox(e.name))) return;
      box = mailBoxes().find((f) => !before.has(f));
      if (!box) return;
    }
    try { await navigator.clipboard.writeText(mailAddress(box)); } catch (err) { /* shown below */ }
    C.platform.openOutside(e.signup || e.url);
    toast("Address copied. Paste it on their sign-up page, then tap Confirm in Newsletters when their mail comes.");
  });
  return el("div", { class: "page-controls dz-signup" },
    el("div", { class: "dz-sheethead" }, feedMark({ url: e.url, link: e.url, title: e.name }),
      el("div", { class: "dz-sheet-text" },
        el("h2", { class: "menu-title dz-sheet-title", dir: "auto" }, e.name),
        el("p", { class: "meta" }, "Comes by email only"))),
    el("p", { class: "dz-blurb" }, "It goes to one of your Newsletters addresses. Sign up with the address on their page, then tap Confirm in Newsletters when their first mail comes."),
    chips, addr, go);
}

MENUS.story = { label: "Story", build: () => storySheet() };
MENUS.signup = { label: "Sign up", build: () => signupSheet() };
