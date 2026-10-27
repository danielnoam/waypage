// Waypage's shell, part 5 of 7 (1.14.0): the Highlights place, the
// sidebar, big screens, keys, gestures and a feed's sheets. See app.js
// for how the parts share.
// ---- Every highlight in one place (1.8.0) ----
// A place beside Library and Feeds: each clip's highlights under its
// title, the clip highlighted in last first, with a search over the
// words, the notes and the titles, and chips by colour (1.42.0). A tap
// opens the clip at the highlight.
let marksQuery = "", marksColor = "";
let marksHead = null;
// Highlights come a screen's worth of clips at a time, the rest as the
// end nears (1.28.4): two thousand at once took the phone two seconds.
const MARKS_FIRST = 25, MARKS_MORE = 40;
let marksUpTo = MARKS_FIRST, marksList = "", marksSeen = null;
const marksMatch = (p, m, q) => (!marksColor || colorOf(m) === marksColor) && (!q || [m.text, m.note || "", p.title].some((t) => t.toLowerCase().includes(q)));
function marksShown() {
  const q = marksQuery.trim().toLowerCase();
  return state.pages.filter((p) => (p.marks || []).length)
    .map((p) => ({ p, last: Math.max(...p.marks.map((m) => m.at || 0)), list: p.marks.filter((m) => marksMatch(p, m, q)) }))
    .filter((c) => c.list.length)
    .sort((a, b) => b.last - a.last);
}
function goToMark(p, id) {
  if (state.open === p && !$("readerView").hidden) { C.reader.toMark(id); return; }
  markAfterOpen = id;
  openPage(p.id);
}
function renderHighlights() {
  const root = $("highlights");
  const total = state.pages.reduce((n, p) => n + (p.marks || []).length, 0);
  if (!marksHead) {
    const input = el("input", { type: "search", placeholder: "Search your highlights", "aria-label": "Search your highlights",
      autocomplete: "off", spellcheck: "false", enterkeyhint: "search", dir: "auto" });
    input.addEventListener("input", () => { marksQuery = input.value; renderHighlights(); });
    const box = el("div", { class: "search hl-search", role: "search" }, input);
    box.insertAdjacentHTML("afterbegin", '<svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"></circle><path d="M16 16l4.5 4.5"></path></svg>');
    marksHead = el("div", { class: "hl-head" }, box,
      el("div", { class: "hl-line" },
        el("p", { class: "meta hl-count", role: "status" }),
        el("button", { class: "btn-text hl-copy", type: "button", onclick: () => {
          const text = marksShown().map((c) => C.backup.marksMarkdown({ ...c.p, marks: c.list })).join("\n");
          copyText(text, "Highlights copied");
        } }, "Copy all")),
      el("div", { class: "hl-colors" }));
  }
  const everyMark = state.pages.flatMap((p) => p.marks || []);
  if (marksColor && !everyMark.some((m) => colorOf(m) === marksColor)) marksColor = "";
  const chips = colorChips(everyMark, marksColor, (c) => { marksColor = c; marksUpTo = MARKS_FIRST; renderHighlights(); });
  fill(marksHead.querySelector(".hl-colors"), chips);
  const clips = marksShown();
  const shown = clips.reduce((n, c) => n + c.list.length, 0);
  if (marksQuery !== marksList) { marksList = marksQuery; marksUpTo = MARKS_FIRST; }
  const more = clips.length > marksUpTo;
  marksHead.hidden = !total;
  marksHead.querySelector(".hl-count").textContent = marksQuery.trim() || marksColor
    ? (shown === 1 ? "1 highlight" : shown + " highlights") + " found"
    : (total === 1 ? "1 highlight" : total + " highlights") + " in " + (clips.length === 1 ? "1 clip" : clips.length + " clips");
  marksHead.querySelector(".hl-copy").hidden = !shown;
  const nodes = clips.slice(0, marksUpTo).map(({ p, list }) => el("section", { class: "hl-clip", "data-key": "hl:" + p.id },
    el("button", { class: "hl-title", type: "button", onclick: () => openPage(p.id) },
      el("span", { class: "hl-name", dir: "auto" }, p.title),
      el("span", { class: "meta" }, p.site || "")),
    el("ol", { class: "group marks-rows" }, ...list.map((m) => el("li", { class: "mark-item" },
      el("button", { class: "row mark-row", type: "button", "aria-label": m.text.slice(0, 120) + ", in " + p.title, onclick: () => goToMark(p, m.id) },
        el("span", { class: "mark-quote", "data-c": colorOf(m), dir: "auto" }, m.text),
        m.note ? el("span", { class: "mark-note", dir: "auto" }, m.note) : null))))));
  if (!total) {
    nodes.push(el("div", { class: "empty" },
      el("h2", { class: "empty-title" }, "No highlights yet"),
      el("p", { class: "empty-text" }, "Select words in a clip and tap Highlight. Every highlight in your library gathers here, with its note.")));
  } else if (!clips.length) nodes.push(el("p", { class: "empty-text hl-none" }, "No highlights match that."));
  if (more) nodes.push(el("div", { class: "lib-more", "aria-hidden": "true" }));
  // The search field stays put, so typing in it keeps its focus.
  if (marksHead.parentNode !== root) root.replaceChildren(marksHead, el("div", { class: "hl-list" }));
  fill(root.querySelector(".hl-list"), ...nodes);
  if (more) {
    if (!marksSeen) marksSeen = new IntersectionObserver((hits) => {
      if (!hits.some((h) => h.isIntersecting) || $("highlights").hidden) return;
      marksUpTo += MARKS_MORE;
      renderHighlights();
    }, { rootMargin: "1500px 0px" });
    marksSeen.disconnect();
    marksSeen.observe(nodes[nodes.length - 1]);
  }
}

// ---- Reading (1.39.0) ----
// The reading stats as a place: a week, month or year of time read and
// heard, a bar a day (a month in a year), the totals under them, days in
// a row, and the clips you spent most time on. Every device's counts
// added up (stats.js).
const SPAN_KEY = "waypage.readingSpan";
let readSpan = ["week", "month", "year"].includes(load(SPAN_KEY, "week")) ? load(SPAN_KEY, "week") : "week";
let readBack = 0; // how many weeks, months or years before this one
const dayAt = (k) => new Date(k + "T12:00:00");
const keyOf = (d) => C.stats.dayKey(d.getTime());
// The first day of the week where you are (Sunday in Israel, Monday in
// most of Europe), from the browser when it says.
function weekStart() {
  try {
    const l = new Intl.Locale(navigator.language);
    const w = l.getWeekInfo ? l.getWeekInfo() : l.weekInfo;
    if (w && w.firstDay) return w.firstDay % 7;
  } catch (e) { /* Monday */ }
  return 1;
}
function readRange(span = readSpan, back = readBack) {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  if (span === "week") {
    const a = new Date(now);
    a.setDate(a.getDate() - ((a.getDay() - weekStart() + 7) % 7) - 7 * back);
    const b = new Date(a);
    b.setDate(b.getDate() + 6);
    const opts = { day: "numeric", month: a.getMonth() === b.getMonth() ? "long" : "short" };
    if (b.getFullYear() !== now.getFullYear()) opts.year = "numeric";
    const f = new Intl.DateTimeFormat(undefined, opts);
    const title = f.formatRange ? f.formatRange(a, b) : f.format(a) + " – " + f.format(b);
    return { from: keyOf(a), to: keyOf(b), title, now: back === 0 ? "This week" : back === 1 ? "Last week" : null };
  }
  if (span === "month") {
    const a = new Date(now.getFullYear(), now.getMonth() - back, 1, 12);
    const b = new Date(a.getFullYear(), a.getMonth() + 1, 0, 12);
    return { from: keyOf(a), to: keyOf(b), title: a.toLocaleDateString(undefined, { month: "long", year: "numeric" }), now: back === 0 ? "This month" : null };
  }
  const y = now.getFullYear() - back;
  return { from: y + "-01-01", to: y + "-12-31", title: String(y), now: back === 0 ? "This year" : null };
}
// The bars: a day each, or in a year a month each.
function readBars(range) {
  const days = C.stats.days(range.from, range.to);
  const today = C.stats.dayKey(Date.now());
  if (readSpan !== "year") {
    return days.map((d, i) => {
      const t = dayAt(d.key);
      const label = readSpan === "week" ? t.toLocaleDateString(undefined, { weekday: "narrow" })
        : (i % 7 === 0 ? String(t.getDate()) : "");
      return { read: d.readMs, aloud: d.aloudMs, label, today: d.key === today, future: d.key > today,
        name: t.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) };
    });
  }
  const months = [];
  for (let m = 0; m < 12; m++) months.push({ read: 0, aloud: 0, label: new Date(2000, m, 1).toLocaleDateString(undefined, { month: "narrow" }),
    name: new Date(2000, m, 1).toLocaleDateString(undefined, { month: "long" }), today: false, future: false });
  const thisMonth = today.slice(0, 7);
  for (const d of days) { const m = Number(d.key.slice(5, 7)) - 1; months[m].read += d.readMs; months[m].aloud += d.aloudMs; }
  months.forEach((m, i) => { const k = range.from.slice(0, 4) + "-" + String(i + 1).padStart(2, "0"); m.today = k === thisMonth; m.future = k > thisMonth; });
  return months;
}
// A top worth drawing a line at: 15, 30 or 60 minutes, then whole hours.
function niceMax(ms) {
  const m = Math.max(1, ms / 60000);
  for (const s of [15, 30, 60, 90, 120]) if (m <= s) return s * 60000;
  return Math.ceil(m / 60) * 3600000;
}
function readChart(bars) {
  const top = niceMax(Math.max(...bars.map((b) => b.read + b.aloud)));
  const col = (b) => {
    const h = (v) => (v > 0 ? Math.max(2, (v / top) * 100) : 0);
    const c = el("div", { class: "rs-col" + (b.today ? " today" : "") + (b.future ? " future" : "") },
      el("div", { class: "rs-stack" },
        b.aloud ? el("span", { class: "rs-aloud", style: "height:" + h(b.aloud) + "%" }) : null,
        b.read ? el("span", { class: "rs-read", style: "height:" + h(b.read) + "%" }) : null,
        !b.read && !b.aloud && !b.future ? el("span", { class: "rs-none" }) : null),
      el("span", { class: "rs-day", "aria-hidden": "true" }, b.label));
    c.title = b.name + ": " + (b.read + b.aloud >= 60000 ? spanText(b.read + b.aloud) : "nothing");
    return c;
  };
  const said = bars.filter((b) => b.read + b.aloud >= 60000).map((b) => b.name + " " + spanText(b.read + b.aloud)).join(", ");
  return el("div", { class: "rs-chart rs-" + readSpan, role: "img", "aria-label": said ? "Time a " + (readSpan === "year" ? "month" : "day") + ": " + said : "No reading in this " + readSpan },
    el("span", { class: "rs-top meta" }, spanText(top)),
    el("div", { class: "rs-cols" }, ...bars.map(col)));
}
function readFigure(n, label) {
  return el("div", { class: "rs-fig" }, el("b", null, n.toLocaleString()), el("span", null, label));
}
function readStreak() {
  const s = C.stats.streak();
  const today = Date.now();
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const d = C.stats.day(C.stats.dayKey(today - i * 864e5));
    dots.push(el("i", { class: d.readMs + d.aloudMs >= C.stats.READ_DAY ? "on" : "" }));
  }
  const best = s.best > s.now && s.bestEnd
    ? "Longest: " + s.best + " days, in " + dayAt(s.bestEnd).toLocaleDateString(undefined, { month: "long" }) : s.now ? "Your longest yet" : "A minute a day keeps a run going";
  return el("div", { class: "rs-streak" },
    el("div", { class: "rs-dots", "aria-hidden": "true" }, ...dots),
    el("div", null,
      el("p", { class: "rs-streak-n" }, s.now === 1 ? "1 day in a row" : s.now ? s.now + " days in a row" : "No run of days yet"),
      el("p", { class: "meta" }, best)));
}
// What the Reading widgets show (1.39.0), worked out here for the day
// it's handed over; the widgets know to say nothing yet on a later day.
function statsWidget() {
  const S = C.stats;
  const week = readRange("week", 0);
  const days = S.days(week.from, week.to);
  const today = S.dayKey(Date.now());
  const t = S.day(today), run = S.streak();
  const ms = days.reduce((n, d) => n + d.readMs + d.aloudMs, 0);
  const finished = S.finishedIn(week.from, week.to);
  return {
    day: today, weekTo: week.to,
    week: spanText(ms),
    weekMeta: [run.now ? (run.now === 1 ? "1 day in a row" : run.now + " days in a row") : null, finished ? finished + " finished" : null].filter(Boolean).join(" · ") || week.title,
    bars: days.map((d) => ({ day: d.key, r: Math.round(d.readMs / 6000) / 10, a: Math.round(d.aloudMs / 6000) / 10,
      label: dayAt(d.key).toLocaleDateString(undefined, { weekday: "narrow" }) })),
    today: spanText(t.readMs + t.aloudMs),
    todayMeta: t.readMs + t.aloudMs < 60000 ? "Nothing yet today" : t.aloudMs >= 60000 ? spanText(t.readMs) + " reading, " + spanText(t.aloudMs) + " aloud" : t.words >= 50 ? "About " + (Math.round(t.words / 10) * 10).toLocaleString() + " words" : "Reading",
    readToday: t.readMs + t.aloudMs >= S.READ_DAY,
    run: run.now === 1 ? "1 day" : run.now + " days",
    runMeta: run.best > run.now ? "Longest " + run.best : run.now ? "Your longest yet" : "Read a minute today to start",
  };
}
function renderReading() {
  const root = $("reading");
  const range = readRange();
  const days = C.stats.days(range.from, range.to);
  const read = days.reduce((n, d) => n + d.readMs, 0), aloud = days.reduce((n, d) => n + d.aloudMs, 0);
  const since = C.stats.dayKey(C.stats.since());
  const older = range.from <= since;
  const step = (n) => () => { readBack = Math.max(0, readBack + n); renderReading(); };
  const seg = el("div", { class: "rs-seg", role: "tablist", "aria-label": "Show" }, ...["week", "month", "year"].map((s) => {
    const b = el("button", { class: "rs-tab", type: "button", role: "tab", "aria-selected": String(s === readSpan),
      onclick: () => { readSpan = s; readBack = 0; store(SPAN_KEY, s); renderReading(); } }, s[0].toUpperCase() + s.slice(1));
    return b;
  }));
  const back = el("button", { class: "icon-btn", type: "button", "aria-label": "Before", onclick: step(1) });
  back.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  back.disabled = older;
  const on = el("button", { class: "icon-btn", type: "button", "aria-label": "After", onclick: step(-1) });
  on.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  on.disabled = readBack === 0;
  const tops = C.stats.top(range.from, range.to, 12).map((t) => ({ ...t, p: state.pages.find((p) => p.id === t.id) }))
    .filter((t) => t.p && t.ms >= 60000).slice(0, 5);
  const opened = days.reduce((n, d) => n + d.opened, 0), saved = days.reduce((n, d) => n + d.saved, 0);
  const words = days.reduce((n, d) => n + d.words, 0);
  fill(root,
    seg,
    el("div", { class: "rs-range" }, back, el("p", { class: "rs-title", "aria-live": "polite" }, range.title), on),
    el("p", { class: "rs-total" }, read + aloud >= 60000 ? spanText(read + aloud) : "0 min"),
    el("p", { class: "meta rs-split" }, spanText(read) + " reading · " + spanText(aloud) + " narrated"),
    readChart(readBars(range)),
    el("div", { class: "rs-legend meta", "aria-hidden": "true" }, el("span", null, el("i", { class: "rs-key-read" }), "Reading"), el("span", null, el("i", { class: "rs-key-aloud" }), "Narrated")),
    older ? el("p", { class: "meta rs-since" }, "Counting since " + dayAt(since).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })) : null,
    el("div", { class: "rs-figs" },
      readFigure(Math.round(words / 100) * 100 || words, "words"),
      readFigure(C.stats.finishedIn(range.from, range.to), "clips finished"),
      readFigure(opened, "clips opened"),
      readFigure(saved, "clips saved")),
    readStreak(),
    tops.length ? el("h2", { class: "overline rs-over" }, "Most time " + (range.now ? range.now.toLowerCase() : "then")) : null,
    tops.length ? el("ul", { class: "rs-top-list" }, ...tops.map((t) => el("li", null,
      el("button", { class: "rs-clip", type: "button", onclick: () => openPage(t.p.id) },
        clipCover(t.p),
        el("span", { class: "rs-clip-text" },
          el("span", { class: "rs-clip-title", dir: "auto" }, t.p.title),
          el("span", { class: "meta" }, [t.p.link ? "Files" : t.p.site, (C.stats.clip(t.p.id) || {}).finished ? "finished" : null].filter(Boolean).join(" · "))),
        el("span", { class: "rs-clip-time" }, spanText(t.ms)))))) : null,
    el("p", { class: "footnote rs-note" }, (C.sync.on
      ? "Each of your devices counts its own, and GitHub sync adds them up. "
      : "Counted on this device; with GitHub sync on, your other devices' time adds in here. ")
      + "A clip's time counts while it's on screen, until a little after the words on screen should have taken you. "
      + (C.stats.paceKnown() ? "Your pace is about " + C.stats.pace() + " words a minute, from the last 30 days; clips' minutes go by it."
        : "Clips' minutes go by 230 words a minute until Waypage has seen enough of your reading to know your pace.")));
}

async function checkNow(f) {
  if (!navigator.onLine) { toast("You're offline. Check again when you're back online."); return; }
  if (f) { feedsChecking = true; paintFeeds(); try { await checkFeed(f); } finally { feedsChecking = false; paintFeeds(); } }
  else await checkFeeds(true);
}

// A post: a tap opens it (the saved copy, or the original online); +
// saves it into its feed's collection.
function postRow(f, it, withFeed) {
  const saved = savedAs(it.url);
  const busy = !saved && savingUrl(it.url);
  const when = whenText(postAt(it));
  const key = f.url + " " + postKey(it);
  const open = () => (state.feedPick ? tapPost(key) : saved ? openPage(saved.id) : previewPost(f, it));
  const outside = el("button", { class: "post-act", type: "button", "aria-label": "Open " + it.title + " in the browser",
    onclick: () => C.platform.openOutside(it.url) }, feedIcon("out", 18));
  let right;
  if (saved) right = el("span", { class: "post-saved" }, "Saved");
  else {
    right = el("button", { class: "post-act post-save", type: "button", "aria-label": busy ? "Saving " + it.title : "Save " + it.title,
      onclick: () => saveFeedPosts([{ f, it }]) });
    if (busy) { right.disabled = true; right.append(el("span", { class: "spinner", "aria-hidden": "true" })); }
    else right.append(feedIcon("add", 18));
  }
  const isPicked = !!state.feedPick && state.feedPick.has(key);
  const openBtn = el("button", { class: "post-open", type: "button", "aria-label": (saved ? "Read " : "Open ") + it.title, onclick: open });
  if (state.feedPick) openBtn.setAttribute("aria-pressed", String(isPicked));
  return el("div", { class: "post" + (isPicked ? " picked" : ""), "data-key": "post:" + key, "data-post": key },
    openBtn, pickMark(),
    withFeed ? feedMark(f) : null,
    el("span", { class: "post-body" },
      withFeed ? el("span", { class: "post-feed", dir: "auto" }, f.title) : null,
      el("span", { class: "post-title", dir: "auto" }, it.title),
      el("span", { class: "post-meta" }, saved ? readingLine(saved) + " · " + when : when)),
    outside, right);
}

// ---- Picking several posts (1.20.0) ----
// Holding a post (1.22.0, was a Select button) turns taps into picks, using the library's bars: Open
// sends every picked post to the browser, Save saves them all. A history
// entry, so Back leaves it.

function feedPostsShown() {
  const picked = state.feed && feeds.find((f) => f.url === state.feed);
  return (picked ? [picked] : feeds).flatMap((f) => feedPosts(f).map((it) => ({ f, it, key: f.url + " " + postKey(it) })));
}
const pickedPosts = () => feedPostsShown().filter((x) => state.feedPick && state.feedPick.has(x.key));

function startFeedPick(fromHistory) {
  if (state.feedPick) return;
  state.feedPick = new Set();
  if (!fromHistory) history.pushState({ view: "feedPick" }, "");
  document.body.classList.add("selecting", "picking-posts");
  $("selectHead").hidden = false;
  $("selectBar").hidden = false;
  M.edgeIn($("selectHead"), "top");
  M.edgeIn($("selectBar"), "bottom");
  renderFeeds();
  paintPostPicks();
  $("selectCancel").focus({ preventScroll: true });
}

function endFeedPick() {
  if (!state.feedPick) return;
  state.feedPick = null;
  document.body.classList.remove("selecting", "picking-posts");
  for (const [id, edge] of [["selectHead", "top"], ["selectBar", "bottom"]]) M.edgeOut($(id), edge).then(() => { if (!state.select && !state.feedPick) $(id).hidden = true; });
  renderFeeds();
}

function tapPost(key) {
  state.feedPick.has(key) ? state.feedPick.delete(key) : state.feedPick.add(key);
  paintPostPicks();
}

function pickAllPosts() {
  const all = feedPostsShown();
  const every = all.length && all.every((x) => state.feedPick.has(x.key));
  for (const x of all) every ? state.feedPick.delete(x.key) : state.feedPick.add(x.key);
  paintPostPicks();
}

function paintPostPicks() {
  if (!state.feedPick) return;
  for (const row of $("feeds").querySelectorAll("[data-post]")) {
    const on = state.feedPick.has(row.dataset.post);
    row.classList.toggle("picked", on);
    row.querySelector(".post-open").setAttribute("aria-pressed", String(on));
  }
  const list = pickedPosts();
  const all = feedPostsShown();
  $("selectCount").textContent = list.length ? list.length + (list.length === 1 ? " post" : " posts") + " picked" : "Pick posts";
  $("selectAll").textContent = all.length && all.every((x) => state.feedPick.has(x.key)) ? "Pick none" : "Select all";
  $("selOpen").disabled = !list.length;
  $("selSave").disabled = !list.some((x) => !savedAs(x.it.url) && !savingUrl(x.it.url));
}

async function openPickedPosts() {
  const list = pickedPosts();
  if (!list.length) return;
  await back();
  // One after another, so the browser takes each as a tab of its own.
  list.forEach((x, i) => setTimeout(() => C.platform.openOutside(x.it.url), i * 400));
}

async function savePickedPosts() {
  const list = pickedPosts().filter((x) => !savedAs(x.it.url) && !savingUrl(x.it.url));
  if (!list.length) return;
  await back();
  saveFeedPosts(list);
  toast("Saving " + countLine(list.length));
}

// A post read in the app without saving it: the reader shows it, and
// its ⋯ offers Save and the browser.
let previewing = null;
async function previewPost(f, it) {
  if (!navigator.onLine) { toast("You're offline. Save posts while you're online to read them here."); return; }
  if (previewing) return;
  previewing = it.url;
  toast("Opening…");
  let got;
  try { got = await C.save.preview(it.url); }
  catch (e) {
    toast(e instanceof C.save.SaveError ? e.message : C.platform.canFetchPages
      ? "Couldn't open that post. Try the browser button." : "This browser can't reach that site. Try the browser button.");
    return;
  } finally { previewing = null; }
  got.meta.feed = f.url;
  got.meta.post = it.url;
  const swap = state.open && $("readerView").dataset.pane && !$("readerView").dataset.leaving;
  if (swap) { closeSheet(true); history.replaceState(readerState(got.meta), ""); }
  else history.pushState(readerState(got.meta), "");
  const shown = show(got.meta, got.html);
  pushScreen($("readerView"));
  await shown;
  $("readerFrame").focus();
}

function previewSheet(p) {
  const f = feeds.find((x) => x.url === p.feed);
  const saved = savedAs(p.post) || savedAs(p.url);
  return el("div", { class: "page-controls" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, p.title),
      el("p", { class: "meta" }, [p.site, clipMinutes(p) + " min", "Not saved"].join(" · "))),
    el("div", { class: "tile-row" },
      tileButton("add", saved ? "Saved" : "Save", saved ? () => {} : () => {
        if (f) saveFeedPosts([{ f, it: { url: p.post, date: Date.now() } }]);
        else savePage(p.url);
        history.back();
      }),
      tileButton("original", "Browser", () => C.platform.openOutside(p.url))));
}

// ---- The sidebar ----
// Library with its favourites and parts under it, then Feeds with its
// feeds, from the bar's menu button, over a dimmed screen in its own
// history entry. Feeds shows the three touched last (0.28.1); Library
// the favourite collections, then the favourite clips (1.14.0).
const SIDE_MAX = 3;
const FAV_MAX = 6;
function sideCover(name) {
  const list = folderPages(name);
  const src = coverUrl(list) || list.map(thumbUrl).find(Boolean);
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.append(src ? el("img", { src, alt: "", loading: "lazy" }) : collectionIcon(list, 16));
  return box;
}

const sideMark = (name) => {
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.append(svgIcon(name, 16));
  return box;
};
function clipCover(p) {
  const src = thumbUrl(p);
  if (!src) return sideMark("open");
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.append(el("img", { src, alt: "", loading: "lazy" }));
  return box;
}

const fileMark = () => {
  const box = el("span", { class: "side-cover", "aria-hidden": "true" });
  box.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';
  return box;
};

// Off the sidebar to the library: the sidebar put away, or with it
// pinned, whatever is open over the library.
const fromSide = () => (pinned.matches ? toLibrary() : back());

function openFromSide(name) {
  if (pinned.matches && state.folder === name) return Promise.resolve();
  return fromSide().then(() => {
    if (state.place !== "library") { state.place = "library"; store(PLACE_KEY, "library"); paintPlace(); }
    openFolder(name);
  });
}

function partFromSide(part) {
  return fromSide().then(() => {
    if (state.place !== "library") { state.place = "library"; store(PLACE_KEY, "library"); paintPlace(); }
    if (state.part !== part) openPart(part);
  });
}
function sideFavourites() {
  const folders = allFolders().filter(folderFav)
    .map((name) => ({ name, at: Math.max(...folderPages(name).map((x) => x.folderFavAt || 0)) }))
    .sort((a, b) => b.at - a.at).map((x) => ({ folder: x.name }));
  const clips = state.pages.filter((x) => x.fav).sort((a, b) => (b.favAt || 0) - (a.favAt || 0)).map((p) => ({ page: p }));
  return folders.concat(clips);
}

const withFeed = (node, f) => { node.dataset.feed = f.url; return node; };

function renderSide() {
  const item = (icon, label, on, extra, onclick, cls) => {
    const b = el("button", { class: "side-item" + (cls ? " " + cls : ""), type: "button", onclick }, icon,
      el("span", { class: "side-label", dir: "auto" }, label), extra || null);
    if (on) b.setAttribute("aria-current", "page");
    return b;
  };
  const count = (n, cls) => (n ? el("span", { class: cls || "side-n" }, String(n)) : null);
  const fresh = freshPosts();
  const inFeeds = state.place === "feeds";
  const inMarks = state.place === "highlights";
  const latest = (f) => Math.max(0, ...f.items.map(postAt));
  const big = wide.matches;
  const inLib = !inFeeds && !inMarks && state.place !== "reading";
  const inLibrary = inLib && !state.part && !state.folder && state.filter !== "favourites";
  const favs = sideFavourites();
  const hasFolders = allFolders().length > 0;
  fill($("sidebar"),
    el("div", { class: "side-head" },
      el("p", { class: "side-title" }, "Waypage"),
      big && inLib ? el("button", { class: "icon-btn side-search", type: "button", "aria-label": "Search", title: "Search (/)",
        onclick: () => (pinned.matches ? toLibrary() : back()).then(() => { if (state.place !== "library") goPlace("library"); openSearch(); }) }, sideSvg("search")) : null),
    // From inside Collections, Clips, a collection or the favourites
    // (1.20.0), Library steps all the way back to the library itself.
    item(feedIcon("library"), "Library", inLibrary, count(state.pages.length, "side-count"), () =>
      inLib && (state.part || state.folder || state.filter === "favourites")
        ? toLibrary().then(() => { if (state.filter === "favourites") setFilter("all"); return goPlace("library"); })
        : goPlace("library")),
    ...favs.slice(0, FAV_MAX).map((f) => f.folder
      ? item(sideCover(f.folder), f.folder, state.folder === f.folder, count(freshCount(f.folder)), () => openFromSide(f.folder), "side-sub")
      : item(clipCover(f.page), f.page.title, state.open === f.page, null, () => fromSide().then(() => openPage(f.page.id)), "side-sub")),
    favs.length > FAV_MAX ? item(sideMark("star"), "All favourites", inLib && !state.part && state.filter === "favourites", count(favs.length),
      () => goPlace("library").then(() => setFilter("favourites")), "side-sub") : null,
    // The library's parts (1.14.0), each opening alone.
    hasFolders ? item(sideMark("folder"), "Collections", inLib && state.part === "collections", null, () => partFromSide("collections"), "side-sub") : null,
    item(sideMark("open"), "Clips", inLib && state.part === "pages", null, () => partFromSide("pages"), "side-sub"),
    // Files of your own (0.31.0), their part of the library.
    state.pages.some((p) => p.link) ? item(fileMark(), "Files", inLib && state.part === "files", null, () => partFromSide("files"), "side-sub") : null,
    el("hr", { class: "side-line" }),
    item(feedIcon("feeds"), "Feeds", inFeeds && !state.feed, fresh ? el("span", { class: "side-pill" }, fresh + " new") : null,
      () => goPlace("feeds")),
    ...[...feeds].sort((a, b) => latest(b) - latest(a)).slice(0, SIDE_MAX).map((f) =>
      withFeed(item(feedMark(f, true), f.title, inFeeds && state.feed === f.url, null, () => goPlace("feeds", f.url), "side-sub"), f)),
    // Every highlight in the library (1.8.0), a place of its own.
    el("hr", { class: "side-line" }),
    item(sideSvg("marks"), "Highlights", inMarks, null, () => goPlace("highlights")),
    item(sideSvg("reading"), "Reading", state.place === "reading", null, () => goPlace("reading")),
    // On a big screen the sidebar carries the rest (1.5.0): Add a feed,
    // the tags, and Settings at its foot.
    ...(big ? sideMore() : []));
}

function sideMore() {
  const tags = allTags().slice(0, 12);
  const leave = () => (state.side ? back() : Promise.resolve());
  return [
    el("button", { class: "side-link", type: "button", onclick: () => leave().then(() => openMenu("addFeed", { url: "" })) }, "Add a feed"),
    tags.length ? el("hr", { class: "side-line" }) : null,
    tags.length ? el("p", { class: "side-over" }, "Tags") : null,
    tags.length ? el("div", { class: "side-tags" }, ...tags.map((t) => {
      const on = state.place === "library" && state.filter === "#" + t;
      const b = el("button", { class: "chip side-tag" + (on ? " on" : ""), type: "button", "aria-pressed": String(on), dir: "auto",
        onclick: () => goPlace("library").then(() => setFilter(on ? "all" : "#" + t)) }, "#" + t);
      return b;
    })) : null,
    el("span", { class: "side-gap", "aria-hidden": "true" }),
    el("button", { class: "side-item side-settings", type: "button", onclick: () => leave().then(() => openSettings()) },
      sideSvg("settings"), el("span", { class: "side-label" }, "Settings")),
  ];
}

const SIDE_SVG = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  marks: ICONS.mark,
  reading: '<path d="M5 20V12M10 20V6M15 20v-9M20 20V9"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
function sideSvg(name) {
  const box = el("span", { class: "side-icon", "aria-hidden": "true" });
  box.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + SIDE_SVG[name] + "</svg>";
  return box;
}

function openSide() {
  if (state.side || pinned.matches) return;
  state.side = true;
  history.pushState({ view: "side" }, "");
  renderSide();
  const side = $("sidebar");
  $("sideBtn").setAttribute("aria-expanded", "true");
  side.style.pointerEvents = "";
  $("sideCatch").hidden = false;
  side.hidden = false;
  // The library drifts right a little under it, and stays there while
  // it's open (1.11.0).
  const lib = $("libraryView");
  M.dim($("sideCatch"), true);
  M.slideIn(side, M.reduced() ? null : lib).then(() => { if (state.side && !pinned.matches && !M.reduced()) lib.style.transform = M.sideDrift(side); });
  afterSettle(() => {
    if (!state.side) return;
    cover($("libraryView"), true);
    const at = side.querySelector("[aria-current]") || side.querySelector("button");
    if (at) at.focus({ preventScroll: true });
  });
}

function closeSide() {
  if (!state.side) return;
  state.side = false;
  sideByBack = false;
  const side = $("sidebar"), catcher = $("sideCatch");
  // The window grew wide enough to pin it while it was open: it stays.
  if (pinned.matches) {
    catcher.hidden = true;
    side.style.pointerEvents = "";
    cover($("libraryView"), false);
    $("libraryView").style.transform = "";
    return;
  }
  const had = side.contains(document.activeElement);
  $("sideBtn").setAttribute("aria-expanded", "false");
  side.style.pointerEvents = "none";
  const from = sideDragged;
  sideDragged = 0;
  const lib = $("libraryView");
  lib.style.transform = "";
  M.dim(catcher, false).then(() => { if (!state.side) catcher.hidden = true; });
  M.slideOut(side, from, M.reduced() ? null : lib).then(() => { if (!state.side) side.hidden = true; });
  afterSettle(() => {
    if (state.side) return;
    cover($("libraryView"), false);
    if (had) $("sideBtn").focus({ preventScroll: true });
  });
}

// ---- Big screens (1.5.0) ----
// From 700 px the save field sits in the bar at the top, and the
// library's name, size, Show and Order share a row under it. From 1024 px
// the sidebar is pinned beside everything but the reader and Settings.
const libHead = el("div", { class: "lib-head" });
function fitWidth() {
  const bar = $("topBar"), form = $("saveForm"), top = $("libraryView").querySelector(".top");
  if (wide.matches && form.parentElement !== bar) {
    bar.insertBefore(form, bar.querySelector(".top-actions"));
    top.prepend(libHead);
    libHead.append($("placeTitle"), $("libraryMeta"), $("libTools"));
  } else if (!wide.matches && form.parentElement === bar) {
    $("libraryView").querySelector(".save-bar").append(form);
    bar.insertBefore($("placeTitle"), bar.querySelector(".top-actions"));
    top.prepend($("libraryMeta"));
    $("searchNote").after($("libTools"));
    libHead.remove();
  }
  const side = $("sidebar");
  document.body.classList.toggle("pinned", pinned.matches);
  if (pinned.matches) {
    if (state.side) history.back();
    side.hidden = false;
    side.style.pointerEvents = "";
    renderSide();
  } else if (!state.side) side.hidden = true;
  else renderSide();
  if (state.open) fitRail();
  if (!$("aloudBar").hidden) placeAloudBar();
}

// ---- Keys (1.5.0) ----
// Escape steps back; in pages the arrows turn them. With a keyboard the
// rest of the app has letters too, listed behind "?". Keys pressed in
// the reader's page come here through reader.js.
const KEYS = [
  ["Anywhere", [["/", "Search the library"], [(/Mac/.test(navigator.platform) && navigator.maxTouchPoints < 2 ? "⌘" : "Ctrl") + " V", "Save a copied link"], ["G then L", "Go to the library"],
    ["G then F", "Go to Feeds"], ["G then H", "Go to Highlights"], ["G then R", "Go to Reading"], ["D", "Downloads"], [",", "Settings"], ["?", "These shortcuts"]]],
  ["In the library", [["↑ ↓", "Move between clips"], ["Enter", "Open"], ["X", "Pick, to act on several"], ["Shift-click", "Pick a run"],
    ["F", "Favourite"], ["E", "Export"], ["Del", "Delete"]]],
  ["Reading", [["Space  ← →", "Next or previous page"], ["J  K", "Next or previous section"], ["T", "Contents beside the text"],
    ["S", "Narrate"], ["A", "Reader settings"], ["H", "Highlights"], ["L", "Translate this clip"], ["/", "Find in this clip"], ["+  −", "Text size"], ["O", "Open the original"], ["Esc", "Back"]]],
];
function keysSheet() {
  return el("div", { class: "keys-sheet" },
    el("h2", { class: "menu-title" }, "Keyboard shortcuts"),
    el("div", { class: "keys-groups" }, ...KEYS.map(([title, rows]) => el("section", { class: "keys-group" },
      el("h3", { class: "overline" }, title),
      el("dl", { class: "keys-list" }, ...rows.flatMap(([k, what]) => [
        el("dt", null, ...k.split(/(\s+then\s+|\s{2}|\s(?=\S))/).filter((x) => x.trim()).map((x) => /then/.test(x) ? el("span", { class: "keys-then" }, " then ") : el("kbd", null, x.trim()))),
        el("dd", null, what)]))))));
}

const typingIn = (t) => !!(t && t.closest && t.closest("input, textarea, select, [contenteditable]"));
// The card or collection with focus, in the list on screen.
const listNow = () => (state.folder ? $("folderBody") : state.place === "feeds" ? $("feeds") : state.place === "highlights" ? $("highlights") : state.place === "reading" ? $("reading") : $("library"));
const focusedNode = () => { const a = document.activeElement; return a && a.closest && listNow().contains(a) ? a.closest("[data-ids]") : null; };
const focusedPage = () => {
  const n = focusedNode();
  const ids = n ? n.dataset.ids.split(",") : [];
  return ids.length === 1 && !n.classList.contains("tile") ? state.pages.find((p) => p.id === ids[0]) || null : null;
};
function moveFocus(d) {
  const all = [...listNow().querySelectorAll(".card-open, .post-open")].filter((b) => b.offsetParent);
  if (!all.length) return false;
  const at = all.indexOf(document.activeElement);
  const to = all[at < 0 ? (d > 0 ? 0 : all.length - 1) : Math.max(0, Math.min(all.length - 1, at + d))];
  to.focus({ preventScroll: true });
  to.closest(".card, .tile, .post").scrollIntoView({ block: "nearest" });
  return true;
}
function jumpSection(d) {
  const list = C.reader.headings();
  if (!list.length) return;
  const now = C.reader.section();
  let at = -1;
  list.forEach((h, i) => { if (h.text === now) at = i; });
  C.reader.jumpTo(Math.max(0, Math.min(list.length - 1, at + d)));
}

let gAt = 0;
function onKeys(e) {
  if (e.defaultPrevented || e.isComposing) return;
  const k = e.key, inFrame = e.target && e.target.ownerDocument !== document;
  if (k === "Escape" && (state.sheet || state.image || state.menu || state.select || state.side)) { history.back(); return; }
  if (state.image && !e.altKey && !e.ctrlKey && !e.metaKey) {
    const act = { ArrowLeft: () => stepImage(-1), ArrowRight: () => stepImage(1), "+": () => zoomStep(1), "=": () => zoomStep(1), "-": () => zoomStep(-1) }[k];
    if (act) { e.preventDefault(); act(); }
    return;
  }
  if (state.open && !state.image && (e.ctrlKey || e.metaKey) && !e.altKey && k.toLowerCase() === "f") { e.preventDefault(); openFind(); return; }
  if (e.altKey || e.ctrlKey || e.metaKey || typingIn(e.target)) return;
  // In pages, the arrow keys turn them (inside the page, src/reader.js
  // does the same).
  if (state.open && !state.sheet && !state.image && C.reader.paged) {
    const rtl = state.open.dir === "rtl";
    const d = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, PageDown: 1, PageUp: -1 }[k];
    if (d) { e.preventDefault(); C.reader.turn(d); return; }
  }
  const go = (fn) => { e.preventDefault(); fn(); };
  if (k === "?") { go(() => { if (state.menu && state.menu.kind === "keys") history.back(); else if (!state.menu) openMenu("keys"); }); return; }
  if (state.menu || state.sheet || state.image || state.side || state.batch || state.downloads || state.syncPage || state.news) return;
  if (state.open) {
    const p = state.open;
    const size = (d) => setReading({ size: clamp(readingPrefs().size + d, SIZE_MIN, SIZE_MAX) });
    const acts = {
      Escape: () => $("readerBack").click(),
      j: () => jumpSection(1), k: () => jumpSection(-1),
      "/": () => openFind(),
      t: () => (pinned.matches ? setReading({ rail: !readingPrefs().rail }) : !$("readerContents").hidden && toggleSheet("contents")),
      s: () => !$("readerAloud").hidden && $("readerAloud").click(),
      a: () => toggleSheet("reading"),
      h: () => !$("readerMarks").hidden && $("readerMarks").click(),
      l: () => !$("readerTranslate").hidden && $("readerTranslate").click(),
      "+": () => size(1), "=": () => size(1), "-": () => size(-1), "−": () => size(-1),
      o: () => /^https?:/.test(p.url || "") && C.platform.openOutside(p.url),
      // In scroll, Space in the page scrolls it already.
      " ": () => (C.reader.paged ? C.reader.turn(e.shiftKey ? -1 : 1)
        : !inFrame && $("readerFrame").contentWindow.scrollBy({ top: (e.shiftKey ? -0.85 : 0.85) * $("readerFrame").clientHeight, behavior: M.reduced() ? "auto" : "smooth" })),
    };
    const act = acts[k.length === 1 ? k.toLowerCase() : k];
    if (act && !(k === " " && inFrame && !C.reader.paged)) go(act);
    return;
  }
  if (state.settings) {
    if (k === "Escape") go(() => history.go(state.section && wide.matches ? -2 : -1));
    return;
  }
  if (Date.now() - gAt < 1200) {
    gAt = 0;
    const to = { l: "library", f: "feeds", h: "highlights", r: "reading" }[k.toLowerCase()];
    if (to) go(() => goPlace(to));
    return;
  }
  const p = focusedPage(), node = focusedNode();
  const acts = {
    g: () => { gAt = Date.now(); },
    "/": () => (state.folder ? toLibrary() : Promise.resolve()).then(() => {
      if (state.place === "highlights") { $("highlights").querySelector(".hl-search input").focus(); return; }
      return (["feeds", "reading"].includes(state.place) ? goPlace("library") : Promise.resolve()).then(openSearch);
    }),
    d: () => openDownloads(),
    ",": () => openSettings(),
    Escape: () => history.state && history.state.view && history.back(),
    ArrowDown: () => moveFocus(1), ArrowUp: () => moveFocus(-1),
    x: () => node && (state.select ? tapPages(node.dataset.ids.split(",")) : startSelect(node.dataset.ids.split(","))),
    f: () => p && setFavourite([p], !p.fav),
    e: () => p && !p.link && openMenu("export", p),
    Delete: () => (state.select ? deletePicked() : p && deletePage(p, "keys")),
    Backspace: () => (state.select ? deletePicked() : p && deletePage(p, "keys")),
  };
  const act = acts[k.length === 1 ? k.toLowerCase() : k];
  if (act) go(act);
}

// Ctrl V (⌘ V) with no field to paste into saves the link, from 700 px.
document.addEventListener("paste", (e) => {
  if (!wide.matches || typingIn(e.target) || state.open || state.menu || state.settings || state.batch) return;
  const text = (e.clipboardData && e.clipboardData.getData("text")) || "";
  const links = linksFrom(text);
  if (!links.length) return;
  e.preventDefault();
  saveTyped(text);
});

// A link dropped anywhere on the library is saved (1.5.0); a list of
// them goes to Save with options.
function saveTyped(text) {
  if (state.place === "feeds") { openMenu("addFeed", { url: text.trim() }); return; }
  if (linksFrom(text).length > 1) { openBatch(text); return; }
  const url = linkFrom(text);
  if (!url) { toast("That doesn't look like a link. Paste the page's address."); return; }
  savePage(url);
}
{
  const zone = $("dropZone");
  // Files are opened by the window's own drop handler above; the zone
  // only says so. A file manager's drag also carries file:// links,
  // which aren't saved as pages.
  const filey = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  const linky = (e) => !!e.dataTransfer && !filey(e) && [...e.dataTransfer.types].some((t) => t === "text/uri-list" || t === "text/plain")
    && !state.open && !state.menu && !state.settings && !state.batch;
  const shown = (e) => filey(e) ? !state.menu : linky(e);
  let depth = 0;
  // The zone is there while something is held over the window and gone
  // when it leaves, with no motion: a mouse wants it at once (1.11.0).
  const hide = () => { depth = 0; zone.hidden = true; };
  document.addEventListener("dragenter", (e) => {
    if (!shown(e)) return;
    depth++;
    if (zone.hidden) {
      $("dropTitle").textContent = filey(e) ? "Drop to open" : state.place === "feeds" ? "Drop to follow" : "Drop to save";
      $("dropNote").textContent = filey(e) ? FILE_KINDS_LINE : state.place === "feeds" ? "Followed like an added feed" : "Saved for reading offline, like a pasted link";
      zone.hidden = false;
    }
  });
  document.addEventListener("dragover", (e) => { if (linky(e)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  document.addEventListener("dragleave", () => { if (--depth <= 0) hide(); });
  document.addEventListener("drop", (e) => {
    if (filey(e) && state.menu) { e.preventDefault(); e.stopPropagation(); hide(); return; }
    if (!linky(e)) { hide(); return; }
    e.preventDefault();
    hide();
    const text = e.dataTransfer.getData("text/uri-list").split(/\r?\n/).filter((l) => l && !l.startsWith("#")).join("\n") || e.dataTransfer.getData("text/plain");
    if (text) saveTyped(text);
  });
}

// ---- Gestures (0.28.2) ----

// Holding a feed (its chip, or its row in the sidebar), or right-clicking
// it, opens its settings. Holding a post starts picking posts with it
// picked, as holding a clip does in the library.
function holdFeeds(root) {
  let timer = null, start = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  const target = (e) => e.target.closest(".post-act") ? null : e.target.closest("[data-post], [data-feed]");
  const open = (node) => {
    if (node.dataset.post) {
      if (navigator.vibrate) navigator.vibrate(10);
      if (!state.feedPick) startFeedPick();
      tapPost(node.dataset.post);
      return;
    }
    const f = feeds.find((x) => x.url === node.dataset.feed);
    if (!f) return;
    if (navigator.vibrate) navigator.vibrate(10);
    (state.side ? back() : Promise.resolve()).then(() => openMenu("feed", f));
  };
  root.addEventListener("pointerdown", (e) => {
    fired = false;
    const node = e.button === 0 && target(e);
    if (!node) return;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => { timer = null; fired = true; open(node); }, 480);
  });
  root.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) cancel(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(t, cancel);
  root.addEventListener("click", (e) => { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  root.addEventListener("contextmenu", (e) => {
    const node = target(e);
    if (!node) return;
    e.preventDefault();
    cancel();
    if (!fired) { fired = true; open(node); }
  });
}

// Android's Back in Library or Feeds opens the sidebar (0.29.0), and Back
// again with it open that way puts the app away. Anywhere else Back
// steps back through history as before.
let sideByBack = false;
const backOpens = C.platform.onBack(({ canGoBack }) => {
  if (lockUp()) { lockBack(); return; }
  if (state.side && sideByBack) { C.platform.exitApp(); return; }
  if (canGoBack && history.state && history.state.view) { history.back(); return; }
  if (!state.side && !pinned.matches) { openSide(); sideByBack = true; return; }
  C.platform.exitApp();
});

// The sidebar follows a finger dragging it to the left (0.30.5): let go
// past a third of its width, or with a flick, and it closes from there;
// short of that it springs back. Its rows still scroll up and down.
let sideDragged = 0, sideDragEnd = 0;
function dragSide() {
  const side = $("sidebar"), catcher = $("sideCatch");
  let drag = null;
  const down = (e) => {
    if (!state.side || e.pointerType === "mouse" || !e.isPrimary) return;
    drag = { x: e.clientX, y: e.clientY, dx: 0, on: false, t: e.timeStamp, v: 0, w: side.offsetWidth };
  };
  const move = (e) => {
    if (!drag || !e.isPrimary) return;
    const dx = Math.min(0, e.clientX - drag.x), dy = e.clientY - drag.y;
    if (!drag.on) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(e.clientX - drag.x)) { drag = null; return; }
      if (dx > -10) return;
      drag.on = true;
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* gone */ }
    }
    const dt = Math.max(1, e.timeStamp - drag.t);
    drag.v = (dx - drag.dx) / dt;
    drag.t = e.timeStamp;
    drag.dx = dx;
    side.style.transform = "translateX(" + dx + "px)";
    catcher.style.opacity = String(Math.max(0, 1 + dx / drag.w));
    if (!M.reduced()) $("libraryView").style.transform = "translateX(" + Math.round(drag.w * 0.2 * (1 + dx / drag.w)) + "px)";
  };
  const up = () => {
    const d = drag;
    drag = null;
    if (!d || !d.on) return;
    sideDragEnd = performance.now();
    side.style.transform = "";
    const lib = $("libraryView");
    if (d.dx < -d.w / 3 || d.v < -0.5) { sideDragged = d.dx; history.back(); }
    else {
      M.dim(catcher, true);
      M.slideBack(side, d.dx, M.reduced() ? null : lib);
      if (!M.reduced()) lib.style.transform = M.sideDrift(side);
    }
  };
  for (const n of [side, catcher]) {
    n.addEventListener("pointerdown", down);
    n.addEventListener("pointermove", move);
    n.addEventListener("pointerup", up);
    n.addEventListener("pointercancel", up);
  }
  // A drag that ends on the catch isn't a tap on it.
  catcher.addEventListener("click", (e) => { if (performance.now() - sideDragEnd < 400) e.stopImmediatePropagation(); }, true);
}

// Where there's no Back to use (iOS, a browser), a swipe to the right
// from the left edge opens it. Rows that scroll sideways keep theirs.
const EDGE = 24;
function swipeToSide(root) {
  if (backOpens) return;
  let start = null;
  root.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 && t.clientX <= EDGE && !state.select && !state.menu && !state.side
      && !e.target.closest(".filters, .folder-strip, input, textarea, .drag-handle") ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = e.touches[0], dx = t.clientX - start.x, dy = Math.abs(t.clientY - start.y);
    if (dy > 24 || dx < -24) { start = null; return; }
    if (dx > 64 && dy < dx / 2) { start = null; openSide(); }
  }, { passive: true });
  root.addEventListener("touchend", () => { start = null; }, { passive: true });
}

// Pulling down from the top checks for what's new: in Feeds the feeds
// on show (all, or the picked one), in the library every collection
// that follows a series, for new chapters.
const PULL_AT = 64;
function pullToCheck(root) {
  const hint = $("pullHint");
  let start = null, pulled = 0;
  const set = (h, settle) => {
    hint.classList.toggle("settle", !!settle && !M.reduced());
    hint.style.height = h + "px";
    hint.classList.toggle("ready", h >= PULL_AT);
  };
  root.addEventListener("touchstart", (e) => {
    start = !feedsChecking && !dailyRunning && scrollY <= 0 && e.touches.length === 1 && !state.side && !state.menu
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    pulled = 0;
  }, { passive: true });
  root.addEventListener("touchmove", (e) => {
    if (!start) return;
    const t = e.touches[0], dy = t.clientY - start.y, dx = Math.abs(t.clientX - start.x);
    if (dy < 0 || (pulled === 0 && dx > dy)) { start = null; if (pulled) set(0, true); pulled = 0; return; }
    pulled = Math.min(PULL_AT * 1.4, dy * 0.5);
    hint.hidden = false;
    set(pulled);
  }, { passive: true });
  root.addEventListener("touchend", () => {
    if (!start) return;
    start = null;
    if (pulled < PULL_AT) { set(0, true); pulled = 0; return; }
    pulled = 0;
    set(48, true);
    hint.classList.add("busy");
    const picked = state.feed && feeds.find((f) => f.url === state.feed);
    const done = () => { hint.classList.remove("busy"); set(0, true); };
    // A pull also looks for a newer Waypage (0.34.0); the bar says so.
    const app = checkForNewerApp().catch(() => {});
    if (state.place === "feeds") { Promise.all([checkNow(picked || null), app]).finally(done); return; }
    // And in the library, in the watched folder (1.1.0).
    Promise.all([pullChapters(app), lookInFolder(false)]).finally(done);
  }, { passive: true });
}

async function pullChapters(app) {
  if (navigator.onLine && !allFolders().some((n) => isSeries(folderPages(n)))) {
    await app;
    toast(updateOut() ? "Waypage " + upd.latest + " is out." : "Nothing new.");
    return;
  }
  await Promise.all([checkChapters(), app]);
}

async function checkChapters() {
  if (!navigator.onLine) { toast("You're offline. Check again when you're back online."); return; }
  if (!allFolders().some((n) => isSeries(folderPages(n)))) { toast("No collections follow a series yet."); return; }
  const found = await dailyCheck(true);
  renderLibrary();
  toast(found ? "New chapters in " + found + (found === 1 ? " collection" : " collections") + "." : "No new chapters.");
}

// ---- Add a feed, and a feed's settings ----

const picturesLine = (mode) => !C.platform.native ? ""
  : mode === "full" ? ", with full pictures" : mode === "links" ? ", with pictures as links" : ", with pictures as previews";

function addFeedSheet() {
  let found = null, mode = "show";
  const input = el("input", { class: "feed-input", type: "url", inputmode: "url", placeholder: "A site or its feed", "aria-label": "A site or its feed",
    autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "go" });
  const help = el("p", { class: "footnote" }, "A site's address is enough: Waypage finds its feed.");
  const card = el("div", { class: "found-feed" });
  const note = el("p", { class: "footnote" });
  const modeBox = el("div", { class: "feed-mode" },
    el("h2", { class: "overline" }, "New posts"),
    seg("add-feed-mode", "New posts", [{ value: "show", label: "Show them" }, { value: "save", label: "Save them" }], mode,
      (v) => { mode = v; paintNote(); }),
    note);
  const go = el("button", { class: "btn-primary", type: "button" }, "Find its feed");
  const paintNote = () => {
    if (!found) return;
    note.textContent = (mode === "save" ? "New posts save themselves while you're online. " : "New posts wait in Feeds for you to save. ")
      + "Saved posts go into a collection called " + cleanTag(found.feed.title) + picturesLine(load(IMAGES_KEY, "previews")) + ".";
  };
  const reset = () => {
    found = null;
    card.hidden = true;
    modeBox.hidden = true;
    go.textContent = "Find its feed";
    help.className = "footnote";
    help.textContent = "A site's address is enough: Waypage finds its feed.";
  };
  reset();
  const find = async () => {
    const typed = input.value.trim();
    if (!typed) { input.focus(); return; }
    go.disabled = true;
    go.textContent = "Looking for its feed…";
    try {
      const got = await C.feeds.findFeed(linkFrom(typed) || typed);
      const had = feeds.find((f) => sameUrl(f.url, got.url));
      if (had) throw new C.feeds.FeedError("You already follow " + had.title + ".");
      if (input.value.trim() !== typed) return;
      found = got;
      fill(card, feedMark({ url: got.url, link: got.feed.link, icon: got.feed.icon, title: got.feed.title }),
        el("span", { class: "found-text" },
          el("span", { class: "found-name", dir: "auto" }, got.feed.title),
          el("span", { class: "meta" }, rateLine(got.feed.items))));
      card.hidden = false;
      modeBox.hidden = false;
      help.className = "footnote";
      help.textContent = C.feeds.siteOf(got.url) + " · " + (got.feed.items.length === 1 ? "1 post" : got.feed.items.length + " posts") + " in its feed";
      go.textContent = "Follow";
      paintNote();
    } catch (e) {
      reset();
      help.className = "footnote warn";
      help.textContent = e instanceof C.feeds.FeedError ? e.message : "Couldn't read that. Check the address and try again.";
    } finally {
      go.disabled = false;
    }
  };
  const follow = async () => {
    const got = found;
    const f = { url: got.url, title: cleanTag(got.feed.title) || C.feeds.siteOf(got.url), link: got.feed.link, icon: got.feed.icon,
      mode, images: load(IMAGES_KEY, "previews"), folder: cleanTag(got.feed.title) || C.feeds.siteOf(got.url), days: 7,
      addedAt: Date.now(), checkedAt: Date.now(), error: "", items: [] };
    mergeFeed(f, got.feed);
    feeds.push(f);
    askToNotify = true;
    saveFeeds();
    await back();
    await goPlace("feeds", f.url);
    toast("Following " + f.title);
    if (mode === "save") autoSave(f);
  };
  go.addEventListener("click", () => (found ? follow() : find()));
  input.addEventListener("input", () => { if (found) reset(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go.click(); } });
  const preset = state.menu && state.menu.page && state.menu.page.url;
  if (preset) { input.value = preset; setTimeout(find, 0); }
  else setTimeout(() => input.focus({ preventScroll: true }), 50);
  return el("div", { class: "page-controls add-feed" },
    el("h2", { class: "menu-title" }, "Add a feed"),
    el("div", { class: "feed-field" }, input, help),
    card, modeBox, go);
}

function feedSheet() {
  const f = state.menu.page;
  const set = (change) => { Object.assign(f, change); saveFeeds(); if (state.place === "feeds") renderFeeds(); };
  const row = (label, control) => el("div", { class: "rc-row stack" }, el("span", { class: "rc-label" }, label), control);
  const into = el("input", { class: "tag-input", type: "text", value: f.folder || "", placeholder: "No collection", "aria-label": "Save into",
    maxlength: "32", enterkeyhint: "done", autocapitalize: "sentences" });
  into.addEventListener("change", () => set({ folder: cleanTag(into.value) }));
  into.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); into.blur(); } });
  const shortUrl = f.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return el("div", { class: "page-controls feed-sheet" },
    el("div", { class: "menu-head" },
      el("p", { class: "menu-title", dir: "auto" }, f.title),
      el("p", { class: "meta" }, shortUrl)),
    el("div", { class: "rc-list" },
      row("New posts", seg("feed-mode", "New posts", [{ value: "show", label: "Show them" }, { value: "save", label: "Save them" }], f.mode,
        (v) => { set({ mode: v }); if (v === "save") autoSave(f); })),
      C.platform.native ? row("Pictures", seg("feed-images", "Pictures", [
        { value: "previews", label: "Previews" }, { value: "full", label: "Full" }, { value: "links", label: "Links" },
      ], f.images || load(IMAGES_KEY, "previews"), (v) => set({ images: v }))) : null,
      row("Save into", into),
      row("Skip posts older than", seg("feed-days", "Skip posts older than", FEED_DAYS, String(f.days || 7), (v) => set({ days: Number(v) }))),
      C.platform.native && notesPrefs().on ? row("Notifications", seg("feed-notes", "Notifications", [{ value: "on", label: "On" }, { value: "off", label: "Off" }],
        feedQuiet(f) ? "off" : "on", (v) => setFeedQuiet(f, v === "off"))) : null),
    el("p", { class: "footnote" + (f.error ? " warn" : "") }, f.error || (f.checkedAt ? "Checked " + whenText(f.checkedAt) + ". " : "") + rateLine(f.items) + "."),
    el("button", { class: "sheet-row", type: "button", onclick: (e) => {
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = "Checking…";
      checkNow(f).then(redrawMenu);
    } }, "Check now"),
    el("button", { class: "sheet-row danger", type: "button", onclick: () => unfollow(f) }, "Unfollow"),
    el("p", { class: "footnote" }, "Unfollowing keeps the posts you saved."));
}

async function unfollow(f) {
  feeds = feeds.filter((x) => x !== f);
  saveFeeds();
  if (state.feed === f.url) state.feed = null;
  await back();
  paintFeeds();
  toast("Unfollowed " + f.title + ". The posts you saved stay.");
}
