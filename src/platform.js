// Waypage: where this copy of the app is running, a browser or the
// Android/iOS app built from these same files, and the few things that
// differ between them. Adapted from LifeLog's src/platform.js (0.227.0).
//
// The one that matters most: in the app, page fetches go through
// CapacitorHttp, which is native networking and not subject to CORS, so any
// page can be read without a server. In a browser they fall back to fetch,
// which CORS blocks for most sites. See docs/PROPOSAL.md.
//
// `build` is app-build.json, written into the bundle by tools/build-www.js.
// It only exists inside the app; in a browser it is null.
(function () {
  const cap = window.Capacitor;
  const native = !!(cap && typeof cap.isNativePlatform === "function" && cap.isNativePlatform());
  const os = native ? String((cap.getPlatform && cap.getPlatform()) || "android") : "web";
  const plugin = (name) => (native && cap.Plugins && cap.Plugins[name]) || null;

  if (native) document.documentElement.classList.add("native");
  // App lock (1.38.0): hidden from the first paint, before the library
  // draws, when a passcode is set (app-lock.js shows the keypad).
  try { if (localStorage.getItem("waypage.lock")) document.documentElement.classList.add("locked"); } catch (e) { /* no storage */ }

  // Carry-on became Waypage (1.0.0). The web copy at /waypage/ shares its
  // origin, and so its storage, with the old /carry-on/: its settings are
  // copied to their new names once, before anything reads them. The app is
  // a new install and has nothing to copy.
  try {
    if (!native && localStorage.getItem("waypage.renamed") === null) {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("carryon.") && localStorage.getItem("waypage." + k.slice(8)) === null) localStorage.setItem("waypage." + k.slice(8), localStorage.getItem(k));
      }
      localStorage.setItem("waypage.renamed", "1");
    }
  } catch (e) { /* storage blocked: nothing to copy */ }

  // What went wrong lately (1.9.0), for Report a problem: errors nothing
  // caught, console errors, and saves that failed, the last LOG_KEEP of
  // them in localStorage. Addresses keep their page but lose their query,
  // where sign-in tokens and tracking live, and anything that looks like a
  // GitHub or Google token is cut (1.29.1). Nothing leaves the phone
  // unless the person sends a report.
  const LOG_KEY = "waypage.log";
  const LOG_KEEP = 60;
  const cleanText = (t) => String(t == null ? "" : t)
    .replace(/(https?:\/\/[^\s?#"'<>)]+)[?#][^\s"'<>)]*/g, "$1")
    .replace(/(token|key|password|secret)=[^\s&]+/gi, "$1=…")
    .replace(/\b(github_pat_|gh[pousr]_|ya29\.)[\w.-]+/g, "$1…")
    .replace(/(Bearer\s+)\S+/gi, "$1…")
    .slice(0, 600);
  function logList() {
    try { const v = JSON.parse(localStorage.getItem(LOG_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  let logging = false;
  function note(kind, text) {
    if (logging) return;
    logging = true;
    try {
      const list = logList();
      const msg = cleanText(text);
      const last = list[list.length - 1];
      // The same error over and over is one line with a count.
      if (last && last.kind === kind && last.msg === msg) { last.n = (last.n || 1) + 1; last.at = Date.now(); }
      else list.push({ at: Date.now(), kind, msg });
      localStorage.setItem(LOG_KEY, JSON.stringify(list.slice(-LOG_KEEP)));
    } catch (e) { /* storage full or blocked: not kept */ }
    logging = false;
  }
  const errorText = (e) => (e && (e.stack || e.message)) ? String(e.stack || e.message).split("\n").slice(0, 4).join(" | ") : String(e);
  addEventListener("error", (e) => {
    if (e.error || e.message) note("error", (e.message || errorText(e.error)) + (e.filename ? " @ " + e.filename.split("/").pop() + ":" + e.lineno : ""));
  });
  addEventListener("unhandledrejection", (e) => note("error", errorText(e.reason)));
  const consoleError = console.error.bind(console);
  console.error = (...args) => { note("console", args.map((a) => (a instanceof Error ? errorText(a) : typeof a === "string" ? a : (() => { try { return JSON.stringify(a); } catch (x) { return String(a); } })())).join(" ")); consoleError(...args); };
  const log = {
    note,
    list: logList,
    clear() { try { localStorage.removeItem(LOG_KEY); } catch (e) { /* none */ } },
  };

  let build = null;
  const ready = native
    ? fetch("app-build.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => { build = b; return b; })
        .catch(() => null)
    : Promise.resolve(null);

  // Links that leave the app (the original page, a store link) open in the
  // phone's own browser, not inside the app's WebView, which has no address
  // bar and where back would put the whole app away.
  const isOutside = (url) => {
    try {
      const u = new URL(String(url), location.href);
      return /^https?:$/.test(u.protocol) && u.origin !== location.origin;
    } catch (e) { return false; }
  };
  const nativeOpen = window.open.bind(window);
  // Only web and mail addresses leave the app (1.29.1): a clip's address
  // can come from a backup or a synced library, and a javascript: one
  // opened here would run with the app's plugins.
  function openOutside(url) {
    if (!/^(https?|mailto):/i.test(String(url || "").trim())) return false;
    const L = plugin("AppLauncher");
    if (L) {
      Promise.resolve(L.openUrl({ url: String(url) }))
        .then((r) => { if (r && r.completed === false) nativeOpen(url, "_blank"); })
        .catch(() => nativeOpen(url, "_blank"));
      return true;
    }
    nativeOpen(url, "_blank");
    return true;
  }
  if (native) {
    window.open = (url, target, features) => (isOutside(url) ? (openOutside(url), null) : nativeOpen(url, target, features));
    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest && e.target.closest("a[href]");
      if (!a || a.hasAttribute("download") || !isOutside(a.href)) return;
      e.preventDefault();
      openOutside(a.href);
    }, true);
  }

  // The WebView's own browser string with the app named after it: some news
  // sites (ynet among them) never answer a request that doesn't look like a
  // browser, and Wikipedia's rule is only that the app is named.
  const USER_AGENT = (navigator.userAgent ? navigator.userAgent + " " : "") +
    "Waypage (offline reader; https://github.com/danielnoam/waypage)";

  // Native requests have no deadline of their own, so a site that holds the
  // connection open would leave "Saving" up for good.
  const PAGE_TIMEOUT = 30000;
  const FILE_TIMEOUT = 20000;
  function deadline(promise, ms) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new TypeError("Timed out")), ms); }),
    ]).finally(() => clearTimeout(timer));
  }

  // A page's HTML as text, plus the final URL after redirects. Throws a
  // TypeError on a network failure, like fetch does, so callers handle both
  // homes the same way.
  async function fetchText(url, opts = {}) {
    const http = plugin("CapacitorHttp");
    const headers = { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", ...(opts.headers || {}) };
    if (http) {
      const cookie = await signedCookie(url);
      if (cookie) headers.Cookie = cookie;
      let res;
      try {
        res = await deadline(http.request({ url, method: "GET", headers, responseType: "text",
          connectTimeout: PAGE_TIMEOUT / 2, readTimeout: PAGE_TIMEOUT }), PAGE_TIMEOUT + 5000);
      } catch (e) {
        throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")");
      }
      const body = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      return { status: res.status, url: res.url || url, text: body };
    }
    delete headers["User-Agent"];
    const res = await deadline(fetch(url, { headers }), PAGE_TIMEOUT);
    return { status: res.status, url: res.url || url, text: await res.text() };
  }

  // A form sent to a site (1.43.0, making or deleting a newsletter
  // address), as { status, text }. The app only: a browser's CORS keeps
  // it from reading the answer.
  async function postForm(url, fields, opts = {}) {
    const http = plugin("CapacitorHttp");
    if (!http) throw new TypeError("Failed to fetch (no native http)");
    const data = new URLSearchParams(fields).toString();
    let res;
    try {
      res = await deadline(http.request({ url, method: opts.method || "POST", data, responseType: "text",
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", ...(opts.headers || {}) },
        connectTimeout: PAGE_TIMEOUT / 2, readTimeout: PAGE_TIMEOUT }), PAGE_TIMEOUT + 5000);
    } catch (e) {
      throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")");
    }
    return { status: res.status, text: typeof res.data === "string" ? res.data : JSON.stringify(res.data) };
  }

  // Saving signed in (1.8.0): native/share's SignIn plugin opens a site in a
  // browser inside the app, and its cookies go with Waypage's own requests
  // to that site afterwards, so a subscriber's article saves whole. Only
  // the sites signed in to here, kept on this device and never synced, get
  // them. The plugin:
  //   open({ url })          resolves once the browser is closed
  //   cookies({ url })       { cookie }: the Cookie header for that address
  //   signOut({ host })      forgets the site's cookies and storage
  const SIGNED_KEY = "waypage.signedIn";
  const bareHost = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch (e) { return ""; } };
  function signedSites() {
    try { const v = JSON.parse(localStorage.getItem(SIGNED_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  const keepSigned = (list) => { try { localStorage.setItem(SIGNED_KEY, JSON.stringify(list)); } catch (e) { /* full */ } };
  function signedFor(url) {
    const h = bareHost(url);
    return (h && signedSites().find((s) => h === s.host || h.endsWith("." + s.host))) || null;
  }
  async function signedCookie(url) {
    const S = plugin("SignIn");
    if (!S || !signedFor(url)) return "";
    try { const r = await deadline(S.cookies({ url }), 5000); return (r && r.cookie) || ""; } catch (e) { return ""; }
  }
  const signIn = {
    get available() { return !!plugin("SignIn"); },
    sites: signedSites,
    for: signedFor,
    host: bareHost,
    async open(url) {
      const S = plugin("SignIn");
      const host = bareHost(url);
      if (!S || !host) return false;
      await S.open({ url });
      keepSigned([{ host, at: Date.now() }, ...signedSites().filter((s) => s.host !== host)]);
      return true;
    },
    async signOut(host) {
      const S = plugin("SignIn");
      if (S) await S.signOut({ host }).catch(() => {});
      keepSigned(signedSites().filter((s) => s.host !== host));
    },
  };

  // Words to the phone's translate app (1.8.1), through native/share's
  // Translate plugin on Android: true when an app took them, false where
  // there's none (iOS, a browser), and the caller opens the web instead.
  async function translateText(text) {
    const T = plugin("Translate");
    if (!T) return false;
    try { const r = await T.translate({ text: String(text).slice(0, 5000) }); return !!(r && r.done); } catch (e) { return false; }
  }

  // A whole clip translated on this device (1.42.0): ML Kit through the
  // Translate plugin on Android, the browser's own Translator elsewhere
  // (Chrome on a computer). Neither sends the words anywhere; each
  // downloads a language once. Not on iOS yet, or in other browsers.
  const held = { translator: null, pair: "" };
  const translator = {
    get available() {
      if (os === "android") return !!plugin("Translate");
      return !native && typeof self.Translator === "function";
    },
    get onPhone() { return os === "android"; },
    // The language of a clip whose page didn't say: "" when it can't tell.
    async detect(text) {
      const T = plugin("Translate");
      try {
        if (os === "android" && T) return (await T.detect({ text: text.slice(0, 2000) })).lang || "";
        if (typeof self.LanguageDetector !== "function") return "";
        const d = await self.LanguageDetector.create();
        const [best] = await d.detect(text.slice(0, 2000));
        return best && best.confidence > 0.5 && best.detectedLanguage !== "und" ? best.detectedLanguage : "";
      } catch (e) { return ""; }
    },
    // "available", "downloadable" or "unavailable".
    async ready(from, to) {
      const T = plugin("Translate");
      try {
        if (os === "android" && T) return (await T.ready({ from, to })).state;
        const s = await self.Translator.availability({ sourceLanguage: from, targetLanguage: to });
        return s === "unavailable" ? "unavailable" : s === "available" ? "available" : "downloadable";
      } catch (e) { return "unavailable"; }
    },
    // Gets the pair ready, downloading what's missing. In a browser it has
    // to start from a tap, so it is the first thing a tap on Translate does.
    async prepare(from, to, onProgress) {
      const T = plugin("Translate");
      if (os === "android" && T) { await T.prepare({ from, to }); return; }
      held.translator = null;
      held.translator = await self.Translator.create({ sourceLanguage: from, targetLanguage: to,
        monitor: (m) => m.addEventListener("downloadprogress", (e) => { if (onProgress) onProgress(e.loaded); }) });
      held.pair = from + ">" + to;
    },
    async translate(texts, from, to) {
      const T = plugin("Translate");
      if (os === "android" && T) return (await T.clip({ from, to, texts })).texts || [];
      if (!held.translator || held.pair !== from + ">" + to) throw new Error("Not ready to translate");
      const out = [];
      for (const t of texts) out.push(await held.translator.translate(t));
      return out;
    },
  };

  // A page that builds itself with JavaScript, drawn in a hidden WebView by
  // native/share's PageRender plugin: { text, url } of the HTML it ended up
  // with. null where there's no such plugin (iOS for now, a browser) or the
  // page never drew.
  // `scroll` (1.17.0): scrolled to the end first, for pictures that fill
  // in as they come into view; a long chapter takes longer.
  async function render(url, { scroll = false } = {}) {
    const R = plugin("PageRender");
    if (!R) return null;
    try {
      const wait = scroll ? 50000 : 20000;
      const res = await deadline(R.render({ url, timeoutMs: wait, scroll }), wait + 10000);
      return res && res.html ? { text: res.html, url: res.url || url } : null;
    } catch (e) {
      return null;
    }
  }

  // A page (one self-contained HTML file) to the print screen, where Save as
  // PDF is one of the printers: native/share's Print plugin in the app,
  // whose WebView ignores window.print(). In a browser, a hidden frame
  // that runs no scripts prints it.
  // Read aloud (0.27.0). In the app, native/share's Speech plugin reads a
  // list of paragraphs with the phone's voices and goes on with the screen
  // off; in a browser, speechSynthesis reads them one at a time while the
  // page is open. Either way `onProgress` hears { key, index, state } as
  // each paragraph starts and when it pauses, ends or stops.
  const synth = window.speechSynthesis || null;
  const heard = new Set();
  const tell = (p) => { for (const f of heard) f(p); };
  let hooked = false;
  const web = { items: [], i: -1, state: "stopped", key: "", opts: {}, utter: null };
  function webSpeak() {
    const text = web.items[web.i];
    const u = new SpeechSynthesisUtterance(text);
    const o = web.opts;
    if (o.lang) u.lang = o.lang;
    const v = o.voice && synth.getVoices().find((x) => x.voiceURI === o.voice);
    if (v) u.voice = v;
    u.rate = o.rate || 1;
    web.utter = u;
    u.onend = () => {
      if (web.utter !== u || web.state !== "playing") return;
      if (web.i + 1 >= web.items.length) { webEnd("ended"); return; }
      web.i++;
      webSpeak();
    };
    // A piece the voice can't say is skipped, not the end of the reading.
    u.onerror = (e) => {
      if (web.utter !== u || e.error === "interrupted" || e.error === "canceled") return;
      if (e.error === "not-allowed") webEnd("error");
      else u.onend();
    };
    synth.cancel();
    synth.speak(u);
    tell({ key: web.key, index: web.i, state: "playing" });
  }
  function webEnd(how) {
    web.utter = null;
    web.state = how;
    synth.cancel();
    tell({ key: web.key, index: web.i, state: how });
    web.items = [];
  }
  const awake = { want: false, lock: null, native: null, noNative: false, pip: "", noPip: false };
  document.addEventListener("visibilitychange", () => { if (!document.hidden && awake.want && !awake.lock) speech.keepScreen(true); });
  const speech = {
    get available() { return !!plugin("Speech") || !!(synth && window.SpeechSynthesisUtterance); },
    // Whether it goes on with the screen off and the app put away.
    get background() { return !!plugin("Speech"); },
    onProgress(f) {
      heard.add(f);
      const S = plugin("Speech");
      if (S && !hooked) { hooked = true; S.addListener("progress", tell); }
      return () => heard.delete(f);
    },
    // `engine` (1.33.0, Android): another installed speech engine's voices.
    async voices(engine) {
      const S = plugin("Speech");
      if (S) { try { return (await S.voices(os === "android" && engine ? { engine } : {})).voices || []; } catch (e) { return []; } }
      if (!synth) return [];
      let list = synth.getVoices();
      if (!list.length) {
        await new Promise((ok) => { synth.addEventListener("voiceschanged", ok, { once: true }); setTimeout(ok, 1500); });
        list = synth.getVoices();
      }
      return list.map((v) => ({ id: v.voiceURI, name: v.name, lang: v.lang, online: !v.localService }));
    },
    // The phone's speech engines (1.33.0, Android): { engines: [{ name,
    // label }], default }; none elsewhere.
    async engines() {
      const S = plugin("Speech");
      if (!S || os !== "android") return { engines: [], default: "" };
      try { const r = await S.engines(); return { engines: r.engines || [], default: r.default || "" }; } catch (e) { return { engines: [], default: "" }; }
    },
    // The engine's own page for adding voices.
    async moreVoices(engine) {
      const S = plugin("Speech");
      if (!S || os !== "android") return false;
      try { await S.moreVoices(engine ? { engine } : {}); return true; } catch (e) { return false; }
    },
    // { items, start, lang, voice, engine, rate, title, subtitle, key }
    async play(o) {
      const S = plugin("Speech");
      if (S) return S.play(o);
      Object.assign(web, { items: o.items.slice(), i: Math.max(0, Math.min(o.start || 0, o.items.length - 1)), key: o.key || "", opts: o, state: "playing" });
      webSpeak();
    },
    async pause() {
      const S = plugin("Speech");
      if (S) return S.pause();
      if (web.state !== "playing") return;
      web.state = "paused";
      web.utter = null;
      synth.cancel();
      tell({ key: web.key, index: web.i, state: "paused" });
    },
    async resume() {
      const S = plugin("Speech");
      if (S) return S.resume();
      if (web.state !== "paused" || !web.items.length) return;
      web.state = "playing";
      webSpeak();
    },
    async seek(index) {
      const S = plugin("Speech");
      if (S) return S.seek({ index });
      if (!web.items.length) return;
      web.i = Math.max(0, Math.min(index, web.items.length - 1));
      if (web.state === "playing") webSpeak();
      else tell({ key: web.key, index: web.i, state: web.state });
    },
    async rate(rate) {
      const S = plugin("Speech");
      if (S) return S.rate({ rate });
      web.opts = { ...web.opts, rate };
      if (web.state === "playing") webSpeak();
    },
    // The sleep timer (1.32.0): pause after `seconds`, 0 to cancel. The
    // Android service keeps the time itself, put away; elsewhere the page
    // does. Resolves whether the phone took it.
    async sleep(seconds) {
      const S = plugin("Speech");
      if (!S || os !== "android") return false;
      try { await S.sleep({ seconds: Math.max(0, Math.round(seconds)) }); return true; } catch (e) { return false; }
    },
    // Told { at } when Android's lock-screen Sleep 15 min sets the timer
    // or it runs out (1.36.0).
    onSleep(fn) {
      const S = plugin("Speech");
      if (S && os === "android" && S.addListener) S.addListener("sleep", (e) => fn(Number((e && e.at) || 0)));
    },
    async stop() {
      const S = plugin("Speech");
      if (S) { try { await S.stop(); } catch (e) { /* nothing was reading */ } return; }
      if (web.items.length) webEnd("stopped");
    },
    // The screen kept on while reading aloud (1.24.0): the window flag on
    // Android, else the browser's wake lock, taken again on coming back
    // since the browser lets it go when the page is hidden.
    async keepScreen(on) {
      awake.want = on;
      const S = plugin("Speech");
      if (S && !awake.noNative) {
        if (awake.native === on) return;
        try { await S.keepScreen({ on }); awake.native = on; return; } catch (e) { awake.noNative = true; /* iOS or an older app: the wake lock */ }
      }
      if (!on) { if (awake.lock) { awake.lock.release().catch(() => {}); awake.lock = null; } return; }
      if (awake.lock || !navigator.wakeLock || document.hidden) return;
      try {
        awake.lock = await navigator.wakeLock.request("screen");
        awake.lock.addEventListener("release", () => { awake.lock = null; });
        if (!awake.want) speech.keepScreen(false);
      } catch (e) { /* not allowed here */ }
    },
    // Picture in picture outside the app while reading aloud (1.25.0),
    // Android 12 and later. Told again only when it changes.
    async pip(on, playing) {
      const S = plugin("Speech");
      if (!S || awake.noPip) return false;
      const want = on + ":" + playing;
      if (awake.pip === want) return true;
      try { const r = await S.pip({ on, playing }); awake.pip = want; if (!r.supported) awake.noPip = true; return !!r.supported; }
      catch (e) { awake.noPip = true; return false; }
    },
    async inPip() {
      const S = plugin("Speech");
      if (!S || awake.noPip) return false;
      try { return !!(await S.pipState()).on; } catch (e) { return false; }
    },
    async state() {
      const S = plugin("Speech");
      if (S) { try { return await S.state(); } catch (e) { return { key: "", index: -1, state: "stopped" }; } }
      return { key: web.key, index: web.i, state: web.items.length ? web.state : "stopped" };
    },
    // The clip to go on to when the clip `after` ends (1.23.0), read by
    // the phone with no help from the page, which can't draw it while the
    // app is put away. { after, items, start, lang, voice, title, subtitle, key };
    // no items clears it. Resolves false where the phone can't (iOS for
    // now, a browser): the app goes on itself at the end, as before.
    async queue(o) {
      const S = plugin("Speech");
      if (!S || os !== "android") return false;
      try { await S.queue(o); return true; } catch (e) { return false; }
    },
  };

  // Downloads (0.27.9). While anything is being saved the app asks to be
  // kept running: on Android a foreground service with a progress
  // notification and a wake lock, so saving goes on with the app put away
  // or the phone locked; on iOS a background task, which buys the page in
  // progress the half minute or so iOS allows. A browser has neither.
  const downloads = {
    // { title, text, done, total }; total 0 for a bar that sweeps.
    update(o) {
      const D = plugin("Downloads");
      if (D) D.update(o).catch(() => {});
    },
    stop() {
      const D = plugin("Downloads");
      if (D) D.stop().catch(() => {});
    },
    // The notification's Stop.
    onStop(f) {
      const D = plugin("Downloads");
      if (D) D.addListener("stop", f);
    },
  };

  // Feeds read with the app closed (0.28.4, Android): a job every few
  // hours that notifies about new posts; the app still does the reading
  // and saving itself once it's opened.
  const feedChecks = {
    // [{ url, title, known }]: the feeds and the post ids they have.
    // notes (1.30.0): { style: "each" | "together" | "off", quiet: [url] }.
    watch(feeds, ask, notes) {
      const F = plugin("Feeds");
      if (F) F.watch({ feeds, ask: !!ask, notes }).catch(() => {});
    },
    // { feeds: [url], open, feed, save }: feeds with new posts since,
    // whether a notification opened the app, the feed it was for and the
    // post its Save asked for.
    async news() {
      const F = plugin("Feeds");
      if (F) { try { return await F.news(); } catch (e) { /* none */ } }
      return { feeds: [], open: false };
    },
    // Whether the phone lets Waypage notify; null where it can't tell.
    async allowed() {
      const F = plugin("Feeds");
      if (F && F.allowed) { try { return !!(await F.allowed()).allowed; } catch (e) { /* older app */ } }
      return null;
    },
    settings() {
      const F = plugin("Feeds");
      if (F && F.settings) F.settings().catch(() => {});
    },
    onOpen(f) {
      const F = plugin("Feeds");
      if (F) F.addListener("open", f);
    },
  };

  // Home screen widgets (0.29.0, Android): the app hands over what they
  // show, and a widget's tap comes back as what to open.
  const widgets = {
    update(data) {
      const W = plugin("Widgets");
      if (W) W.update(data).catch(() => {});
    },
    // A collection widget follows its collection's new name (0.35.0).
    renamed(from, to) {
      const W = plugin("Widgets");
      if (W) W.renamed({ from, to }).catch(() => {});
    },
    // { kind: "page" | "mark" | "post" | "feeds" | "library" | "favourites" | "collection"
    //   | "reading" | "search" | "paste", id, url, name }, or {}.
    async take() {
      const W = plugin("Widgets");
      if (W) { try { return await W.take(); } catch (e) { /* none */ } }
      return {};
    },
    onOpen(f) {
      const W = plugin("Widgets");
      if (W) W.addListener("open", f);
    },
    // The copied text, for the app icon's Save the copied link (1.14.0).
    async copied() {
      const W = plugin("Widgets");
      if (W) { try { return (await W.copied()).text || ""; } catch (e) { /* none */ } }
      try { return await navigator.clipboard.readText(); } catch (e) { return ""; }
    },
  };

  // Android's Back (0.29.0): with a listener the app decides what it does,
  // `canGoBack` saying whether the WebView has history to step back to.
  function onBack(f) {
    const A = plugin("App");
    if (A && os === "android") { A.addListener("backButton", f); return true; }
    return false;
  }
  function exitApp() {
    const A = plugin("App");
    if (A) A.exitApp();
  }

  async function printHtml(name, html) {
    const P = plugin("Print");
    if (P) { await P.print({ html, name }); return; }
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-same-origin allow-modals");
    f.setAttribute("aria-hidden", "true");
    f.tabIndex = -1;
    f.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0";
    await new Promise((done) => { f.onload = done; f.srcdoc = html; document.body.append(f); });
    f.contentWindow.print();
    setTimeout(() => f.remove(), 60000);
  }

  // Downloads a file (an image preview, a video thumbnail) straight to disk
  // in the app's data folder, natively: no CORS, and the bytes never cross
  // the JavaScript bridge as base64. Resolves to a URL the WebView can load.
  // null in a browser, which has no folder to write to.
  // Android's downloadFile ignores `recursive` (Filesystem 8): into a
  // folder that isn't there yet, every download failed, so a new page's
  // pictures all ended up missing (0.30.2). The folder is made first.
  // `directory` is the library's (store.js, 0.33.0), or CACHE on the way
  // into a picked folder.
  async function folderFor(FS, path, directory) {
    const dir = path.split("/").slice(0, -1).join("/");
    if (!dir) return;
    try { await FS.mkdir({ path: dir, directory, recursive: true }); }
    catch (e) { /* there already */ }
  }
  async function downloadTo(url, path, page, directory = "DATA") {
    const FS = plugin("Filesystem");
    if (!FS) return null;
    // The page's own site as Referer, as a browser sends it (its origin,
    // not the whole address).
    const headers = { "User-Agent": USER_AGENT };
    try { if (page) headers.Referer = new URL(page).origin + "/"; } catch (e) { /* no referer */ }
    await folderFor(FS, path, directory);
    await deadline(FS.downloadFile({ url, path, directory, recursive: true, headers,
      connectTimeout: FILE_TIMEOUT / 2, readTimeout: FILE_TIMEOUT }), FILE_TIMEOUT + 5000);
    const { uri } = await FS.getUri({ path, directory });
    return cap.convertFileSrc ? cap.convertFileSrc(uri) : uri;
  }

  // A file out of the app (an exported page): written to the cache and
  // handed to the share sheet. false when the plugins aren't there, so the
  // caller falls back to a download link.
  async function saveAndShare(filename, text) {
    const FS = plugin("Filesystem");
    if (!FS || !plugin("Share")) return false;
    const { uri } = await FS.writeFile({ path: filename, data: text, directory: "CACHE", encoding: "utf8" });
    return shareFile(uri, filename);
  }

  // A file the app wrote (writeCache, or an exported book) saved where the
  // person picks: Android's "save to" screen, iOS's Files. Resolves to
  // whether it was saved; null where there's no such plugin, so the caller
  // offers the share sheet or a download instead.
  async function saveFile(uri, name, mime) {
    const F = plugin("FileSave");
    if (!F) return null;
    const res = await F.save({ uri, name, mime });
    return !!(res && res.saved);
  }

  // Text written to the app's cache as a file; resolves to its uri, or
  // null in a browser.
  async function writeCache(filename, text) {
    const FS = plugin("Filesystem");
    if (!FS) return null;
    return (await FS.writeFile({ path: filename, data: text, directory: "CACHE", encoding: "utf8" })).uri;
  }

  // The share sheet, with a file already on disk or with a link. Putting
  // the sheet away isn't an error. false where there's no share sheet.
  async function share(what) {
    const SH = plugin("Share");
    try {
      if (SH) await SH.share(what);
      else if (navigator.share) await navigator.share({ title: what.title, url: what.url });
      else return false;
    } catch (e) {
      if (!/cancel|abort/i.test(String(e && (e.name + " " + e.message) || e))) throw e;
    }
    return true;
  }
  const shareFile = (uri, name) => share({ title: name, files: [uri], dialogTitle: "Save or send " + name });
  const shareLink = (title, url) => share({ title, url, dialogTitle: "Share " + title });
  // Plain text to the share sheet (1.9.0), for Report a problem.
  async function shareText(title, text) {
    const SH = plugin("Share");
    try {
      if (SH) await SH.share({ title, text, dialogTitle: title });
      else if (navigator.share) await navigator.share({ title, text });
      else return false;
    } catch (e) {
      if (!/cancel|abort/i.test(String(e && (e.name + " " + e.message) || e))) throw e;
    }
    return true;
  }
  // The phone, for a report: its model and system, where the app can tell.
  async function deviceLine() {
    const D = native ? plugin("Device") : null;
    if (D) { try { const i = await D.getInfo(); return [i.manufacturer, i.model, i.operatingSystem, i.osVersion].filter(Boolean).join(" "); } catch (e) { /* below */ } }
    return navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 160);
  }

  // A file handed to a browser's downloads (the web copy has no share sheet
  // for files).
  function download(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  // ---- updating the app in place (0.2.0, from LifeLog's 0.179.0) ----
  // Downloads the release's APK into the app's cache, reporting progress, and
  // hands it to Android's installer: no browser tab, no Downloads folder.
  // Android asks once whether Waypage may install apps, then to install.
  // Signed with the same key (alias waypage), it installs over the top and
  // keeps every saved page. The download names the tag, not `latest`, so a
  // release published mid-download can't swap the file. Resolves to the
  // file's uri so a dismissed installer can be reopened without downloading
  // again; null where there's no in-app installer (iOS, a browser).
  const APK_MIME = "application/vnd.android.package-archive";
  const repo = () => (build && build.repo) || null;
  // `file` is the release's APK: Waypage.apk once Waypage is Waypage (0.36.0).
  // Since 1.23.0 it comes through Downloads' own fetch, which goes on
  // with the app put away and can pause and pick up where it stopped: a
  // pause rejects with code "PAUSED". Older builds use Filesystem.
  async function downloadUpdate(version, onProgress, file = "Waypage.apk") {
    const FS = plugin("Filesystem");
    if (os !== "android" || !FS || !plugin("FileOpener") || !repo()) return null;
    const url = "https://github.com/" + repo() + "/releases/download/app-v" + version + "/" + file;
    const path = file.replace(/\.apk$/, "") + "-" + version + ".apk";
    const D = plugin("Downloads");
    if (D && typeof D.fetch === "function") {
      const heard = await D.addListener("fetched", (p) => {
        if (onProgress && p && p.path === path) onProgress(p.total > 0 ? Math.min(1, p.bytes / p.total) : 0, p.bytes, p.total);
      });
      try {
        return (await D.fetch({ url, path })).uri;
      } catch (e) {
        if (!(e && e.code === "UNIMPLEMENTED") && !/not implemented/i.test(String((e && e.message) || e))) throw e;
      } finally {
        if (heard && heard.remove) heard.remove();
      }
    }
    const listener = await FS.addListener("progress", (p) => {
      if (onProgress && p && p.contentLength > 0) onProgress(Math.min(1, p.bytes / p.contentLength));
    });
    try {
      await FS.downloadFile({ url, path, directory: "CACHE", progress: true });
    } finally {
      if (listener && listener.remove) listener.remove();
    }
    return (await FS.getUri({ path, directory: "CACHE" })).uri;
  }
  function pauseUpdate() {
    const D = plugin("Downloads");
    return D && typeof D.pauseFetch === "function" ? D.pauseFetch().then(() => true, () => false) : Promise.resolve(false);
  }
  function openInstaller(uri) {
    return plugin("FileOpener").openFile({ path: uri, mimeType: APK_MIME });
  }
  // APKs for versions already installed have done their job.
  async function clearOldUpdates(currentVersion, isNewer) {
    const FS = plugin("Filesystem");
    if (!FS) return;
    try {
      const { files } = await FS.readdir({ path: "", directory: "CACHE" });
      for (const f of files || []) {
        const name = typeof f === "string" ? f : f.name;
        const m = /^Waypage-(\d+\.\d+\.\d+)\.apk(\.part)?$/.exec(name || "");
        if (m && !isNewer(m[1], currentVersion)) await FS.deleteFile({ path: name, directory: "CACHE" });
      }
    } catch (e) { /* nothing to tidy */ }
  }

  // Reading a QR code (0.30.1, sync's setup code), with
  // @capacitor-mlkit/barcode-scanning as LifeLog does. On Android that's
  // Google's scanner, run by Play services, so Waypage asks for no camera
  // permission; it's fetched at install (tools/android-manifest.js) and
  // fetched here if it isn't there yet. On iOS the plugin opens the camera
  // itself. Resolves to the text read, or null when backed out of.
  const scanner = () => plugin("BarcodeScanner");
  async function scanQr(onWait) {
    const S = scanner();
    if (os === "android") {
      const { available } = await S.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        if (onWait) onWait();
        await new Promise((resolve, reject) => {
          let handle = null;
          const done = (fn, arg) => { if (handle) handle.remove(); fn(arg); };
          Promise.resolve(S.addListener("googleBarcodeScannerModuleInstallProgress", (ev) => {
            if (ev.state === 4) done(resolve);
            else if (ev.state === 3 || ev.state === 5) done(reject, new Error("The scanner couldn't be installed."));
          })).then((h) => { handle = h; return S.installGoogleBarcodeScannerModule(); }).catch(reject);
        });
      }
    }
    try {
      const { barcodes } = await S.scan({ formats: ["QR_CODE"] });
      const b = barcodes && barcodes[0];
      return String((b && (b.rawValue || b.displayValue)) || "") || null;
    } catch (e) {
      if (/cancel/i.test(String((e && e.message) || e))) return null;
      throw e;
    }
  }

  // ---- Files of your own, kept where they are (0.32.0) ----
  // A file the WebView's own picker hands over is readable once; a file
  // Waypage can still open next week needs the system's picker, which
  // grants a lasting permission. `ref` is what that permission is held by:
  // a content:// address in the app, a stored handle in a browser (Chrome
  // and Edge on a computer; Firefox and Safari have no such picker).
  const FILE_MIMES = ["application/epub+zip", "text/markdown", "text/x-markdown", "text/plain", "text/html", "message/rfc822",
    "application/pdf", "application/vnd.comicbook+zip", "application/x-cbz", "application/zip",
    // Another app's export to import (1.9.0).
    "text/csv", "text/comma-separated-values", "application/json",
    // Kindle books and FB2 (1.42.0). Many phones call an AZW3 just data.
    "application/x-mobipocket-ebook", "application/vnd.amazon.ebook", "application/x-mobi8-ebook", "application/x-fictionbook+xml",
    "application/x-fictionbook", "text/xml", "application/xml", "application/octet-stream"];
  const FILE_EXTS = [".epub", ".mobi", ".azw", ".azw3", ".prc", ".fb2", ".md", ".markdown", ".txt", ".html", ".htm", ".eml", ".pdf", ".cbz", ".csv", ".json", ".zip"];
  const PIECE = 4 << 20;
  const KEEP = 64 << 20;

  // A browser's handles live in IndexedDB; the entry keeps the key.
  function handles() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("carryon-files", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function handleDo(mode, fn) {
    const db = await handles();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("handles", mode);
      const req = fn(tx.objectStore("handles"));
      tx.oncomplete = () => { db.close(); resolve(req && req.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  const webPicker = () => !native && typeof window.showOpenFilePicker === "function";

  // The file behind a handle, asking for permission again if the browser
  // dropped it. null when it's gone or permission was refused.
  async function handleFile(ref) {
    try {
      const h = await handleDo("readonly", (s) => s.get(ref));
      if (!h) return null;
      if (h.queryPermission) {
        let state = await h.queryPermission({ mode: "read" });
        if (state === "prompt") state = await h.requestPermission({ mode: "read" });
        if (state !== "granted") return null;
      }
      return await h.getFile();
    } catch (e) { return null; }
  }

  const files = {
    // Whether this device can keep reading a file after the app closes.
    get canLink() { return !!plugin("Files") || webPicker(); },
    get canPickFolder() { return !!plugin("Files"); },
    // Whether a folder can be watched for files (1.1.0): the app, on
    // Android and since 1.6.0 on iOS.
    get canWatch() { return !!plugin("Files"); },
    async pick() {
      const F = plugin("Files");
      if (F) {
        const got = await F.pick({ mimes: FILE_MIMES });
        return got && got.uri ? { ref: got.uri, name: got.name || "file", size: got.size || 0, mime: got.mime || "" } : null;
      }
      if (!webPicker()) return null;
      let handle;
      try {
        [handle] = await window.showOpenFilePicker({ multiple: false,
          types: [{ description: "Books, notes and comics", accept: { "*/*": FILE_EXTS } }] });
      } catch (e) { return null; }
      return handle ? files.adopt(handle) : null;
    },
    // A handle got some other way (a file dropped on the window) kept like
    // a picked one. null when it isn't a file.
    async adopt(handle) {
      if (!handle || handle.kind !== "file") return null;
      const file = await handle.getFile();
      const ref = "h" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await handleDo("readwrite", (s) => s.put(handle, ref));
      return { ref, name: file.name, size: file.size, mime: file.type || "" };
    },
    // `initial` is where the picker opens, under the phone's storage
    // (Android 8 and later): "Documents/Waypage".
    async pickFolder(initial) {
      const F = plugin("Files");
      if (!F) return null;
      const got = await F.pickFolder(initial ? { initial } : {});
      return got && got.uri ? { ref: got.uri, name: got.name || "Folder" } : null;
    },
    // Every file in a picked folder and its folders: { ok, files: [{ ref,
    // path, name, size }] }, ok false when the folder can't be read.
    async scan(tree) {
      const F = plugin("Files");
      if (!F || !F.folderScan) return { ok: false, files: [] };
      try {
        const got = await F.folderScan({ tree });
        return { ok: !!got.ok, name: got.name || "", files: (got.files || []).map((f) => ({ ref: f.uri, path: f.path || f.name, name: f.name, size: f.size || 0 })) };
      } catch (e) { return { ok: false, files: [] }; }
    },
    // The folder a file sits in, opened in the phone's Files app (1.27.2,
    // Android). { opened, where }, where its path ("Download/Books").
    get canReveal() { return os === "android" && !!plugin("Files"); },
    async reveal(ref, tree) {
      const F = plugin("Files");
      if (!F || os !== "android") return { opened: false, where: "" };
      try {
        const got = await F.reveal(tree ? { uri: ref, tree } : { uri: ref });
        return { opened: !!got.opened, where: got.where || "" };
      } catch (e) { return { opened: false, where: "" }; }
    },
    // Whether the file is still where it was, and how big it is now.
    async info(ref) {
      const F = plugin("Files");
      if (F) {
        try { const got = await F.info({ uri: ref }); return { ok: !!got.ok, name: got.name || "", size: got.size || 0 }; }
        catch (e) { return { ok: false, name: "", size: 0 }; }
      }
      const file = await handleFile(ref);
      return file ? { ok: true, name: file.name, size: file.size } : { ok: false, name: "", size: 0 };
    },
    // The file as something the zip reader can slice: a real Blob in a
    // browser, and in the app a stand-in that reads each stretch over the
    // bridge. Throws when the file has moved or been deleted.
    async blob(ref, size) {
      const F = plugin("Files");
      if (!F) {
        const file = await handleFile(ref);
        if (!file) throw new Error("gone");
        return file;
      }
      const info = await F.info({ uri: ref });
      if (!info || !info.ok) throw new Error("gone");
      const whole = info.size || size || 0;
      const piece = async (from, to) => {
        const out = new Uint8Array(Math.max(0, Math.min(to, whole) - from));
        let at = 0;
        while (at < out.length) {
          const want = Math.min(PIECE, out.length - at);
          const { data } = await F.read({ uri: ref, offset: from + at, length: want });
          const bin = atob(data || "");
          for (let i = 0; i < bin.length; i++) out[at + i] = bin.charCodeAt(i);
          if (!bin.length) break;
          at += bin.length;
        }
        return at === out.length ? out : out.slice(0, at);
      };
      // A book is read in many small stretches (each chapter and picture,
      // two each), and each one over the bridge opens the file again: an
      // EPUB with a few hundred pictures took many seconds (1.1.3). A file
      // up to KEEP is read whole the first time, four pieces at once, and
      // every stretch after that comes from memory.
      // Fetched whole from the app's own file server when it can be (1.2.4):
      // no base64, and no walk to each piece's start, which for a file
      // read by content address meant reading the file again per piece.
      let all = null;
      // On iOS (1.6.0) the ref is a bookmark, and info() says where the
      // file is now that it may be read.
      const fetchWhole = async () => {
        const cap = window.Capacitor;
        const src = info.path ? "file://" + encodeURI(info.path) : /^(content|file):/.test(ref) ? ref : null;
        if (!cap || !cap.convertFileSrc || !src) return null;
        const r = await fetch(cap.convertFileSrc(src), { cache: "no-store" });
        if (!r.ok) return null;
        const out = new Uint8Array(await r.arrayBuffer());
        return out.length === whole || !whole ? out : null;
      };
      const fill = () => all || (all = (async () => {
        const got = await fetchWhole().catch(() => null);
        if (got) return got;
        const out = new Uint8Array(whole);
        const starts = [];
        for (let s = 0; s < whole; s += PIECE) starts.push(s);
        for (let i = 0; i < starts.length; i += 4) {
          await Promise.all(starts.slice(i, i + 4).map(async (s) => out.set(await piece(s, s + PIECE), s)));
        }
        return out;
      })().catch((e) => { all = null; throw e; }));
      const read = async (from, to) => (whole <= KEEP ? (await fill()).slice(from, Math.min(to, whole)) : piece(from, to));
      // Enough of a File for the zip reader and files.js to work with.
      const part = (from, to) => ({
        name: info.name || "file",
        type: "",
        get size() { return Math.max(0, Math.min(to, whole) - from); },
        slice: (a = 0, b) => part(from + a, b == null ? to : from + b),
        arrayBuffer: async () => (await read(from, to)).buffer,
        text: async () => new TextDecoder().decode(await read(from, to)),
      });
      return part(0, whole);
    },
    release(ref) {
      const F = plugin("Files");
      if (F) return F.release({ uri: ref }).catch(() => {});
      return handleDo("readwrite", (s) => s.delete(ref)).catch(() => {});
    },
  };

  // The name the phone goes by (1.4.2): on Android the one in Settings,
  // About phone, else its model ("Pixel 8"). iOS gives every app just
  // "iPhone" since iOS 16, so there it stays null.
  let deviceName = null;
  const named = (async () => {
    const D = os === "android" ? plugin("Device") : null;
    if (!D) return null;
    try { const i = await D.getInfo(); deviceName = String(i.name || i.model || "").trim().slice(0, 40) || null; } catch (e) { /* unnamed */ }
    return deviceName;
  })();

  // iOS's answer, kept here so `metered` can stay a plain getter.
  let iosMetered = false;
  const connectionHeard = new Set();
  (() => {
    const N = os === "ios" ? plugin("Connection") : null;
    if (!N) return;
    const set = (m) => { const was = iosMetered; iosMetered = !!m; if (was !== iosMetered) for (const f of connectionHeard) f(); };
    N.state().then((r) => set(r && r.metered)).catch(() => {});
    N.addListener("change", (r) => set(r && r.metered));
  })();

  window.Waypage = window.Waypage || {};
  window.Waypage.platform = {
    native,
    os,
    ios: os === "ios",
    android: os === "android",
    ready,
    named,
    get deviceName() { return deviceName; },
    get build() { return build; },
    plugin,
    // Whether this copy can fetch any page itself (the app) or is limited by
    // CORS (a browser).
    get canFetchPages() { return !!plugin("CapacitorHttp"); },
    // Whether the connection is a metered one, mobile data (1.4.1): the
    // WebView says on Android, native/share's Connection plugin on iOS
    // (1.6.0); a browser says nothing, so nothing waits there.
    get metered() {
      if (os === "ios") return iosMetered;
      const c = navigator.connection;
      return !!c && /^(cellular|wimax|bluetooth)$/.test(c.type || "");
    },
    // The reader's brightness (1.10.0), native/share's Brightness plugin.
    brightness: {
      get available() { return !!plugin("Brightness"); },
      get: () => plugin("Brightness").get(),
      set: (level) => plugin("Brightness").set(level == null ? {} : { level }),
    },
    // App lock (1.38.0): the phone's fingerprint or face, native/share's
    // AppLock plugin on Android (iOS on TODO.md's iOS list); the passcode
    // itself is checked in app-lock.js.
    lock: {
      async biometric() {
        const L = os === "android" && plugin("AppLock");
        if (!L) return false;
        try { return !!(await L.available()).ok; } catch (e) { return false; }
      },
      async verify(title) {
        const L = os === "android" && plugin("AppLock");
        if (!L) return false;
        try { return !!(await L.verify({ title })).ok; } catch (e) { return false; }
      },
      hideRecents(on) { const L = os === "android" && plugin("AppLock"); if (L) L.hideRecents({ on: !!on }).catch(() => {}); },
    },
    // Volume buttons turn pages (1.32.0), native/share's VolumeKeys
    // plugin on Android; `f` hears "up" or "down".
    volumeKeys: {
      get available() { return os === "android" && !!plugin("VolumeKeys"); },
      watch(on) { const V = plugin("VolumeKeys"); if (V) V.watch({ on: !!on }).catch(() => {}); },
      onKey(f) { const V = plugin("VolumeKeys"); if (V) V.addListener("key", (e) => f(e.key)); },
    },
    get knowsConnection() { return os === "ios" ? !!plugin("Connection") : os === "android" && !!navigator.connection; },
    onConnection(f) {
      if (os === "ios") { connectionHeard.add(f); return; }
      const c = navigator.connection;
      if (c && c.addEventListener) c.addEventListener("change", f);
    },
    fetchText,
    postForm,
    signIn,
    translateText,
    translator,
    render,
    get canRender() { return !!plugin("PageRender"); },
    downloadTo,
    openOutside,
    saveAndShare,
    saveFile,
    writeCache,
    get canSaveFiles() { return !!plugin("FileSave"); },
    shareFile,
    shareLink,
    shareText,
    deviceLine,
    log,
    printHtml,
    speech,
    downloads,
    feedChecks,
    widgets,
    onBack,
    exitApp,
    download,
    downloadUpdate,
    pauseUpdate,
    openInstaller,
    clearOldUpdates,
    releasesUrl() { return repo() ? "https://github.com/" + repo() + "/releases/latest" : null; },
    apkUrl(file = "Waypage.apk") { return repo() ? "https://github.com/" + repo() + "/releases/latest/download/" + file : null; },
    // The web copy the app was built from: inside the app this page is at
    // https://localhost, which another device can't open.
    webUrl() { return (build && build.webUrl) || null; },
    files,
    get canScan() { return !!scanner(); },
    scanQr,
  };
})();
