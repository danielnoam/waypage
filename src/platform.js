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
  // Where it runs, app-build.json, links out to the phone's browser and
  // deadline() are keel's (src/keel/platform.js).
  const K = window.Keel.platform;
  const { cap, native, os, plugin, ready, openOutside, deadline } = K;
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
  // caught, console errors, and saves that failed. keel's errlog.js keeps
  // them (index.html sets it up), with addresses cut to their pages and
  // tokens cut. Nothing leaves the phone unless the person sends a report.
  const log = window.Keel.errlog;

  // The WebView's own browser string with the app named after it: some news
  // sites (ynet among them) never answer a request that doesn't look like a
  // browser, and Wikipedia's rule is only that the app is named.
  const USER_AGENT = (navigator.userAgent ? navigator.userAgent + " " : "") +
    "Waypage (offline reader; https://github.com/danielnoam/waypage)";

  // Native requests have no deadline of their own, so a site that holds the
  // connection open would leave "Saving" up for good (keel's deadline()).
  const PAGE_TIMEOUT = 30000;
  const FILE_TIMEOUT = 20000;

  // The web copy's fetch proxy (worker/, a Cloudflare Worker): a browser
  // can't read most sites itself (CORS), so its page fetches go through it.
  // It stores nothing and answers only this site's origin. Empty until it's
  // deployed, and never used by the app. Sites that allow any origin (the
  // GitHub API the updater and Test builds read) are fetched directly.
  const PROXY_URL = "https://waypage-fetch.danielnoam1999.workers.dev/";
  const PROXY = native ? "" : PROXY_URL;
  const DIRECT = /^(api\.github\.com|raw\.githubusercontent\.com)$/i;
  // This site itself and the computer it runs on (the dev server, the
  // tests) are fetched directly too; the proxy refuses local addresses.
  function direct(url) {
    try {
      const u = new URL(url, location.href);
      return u.origin === location.origin || DIRECT.test(u.hostname) || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname);
    } catch (e) { return true; }
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
    if (!PROXY || direct(url)) {
      const res = await deadline(fetch(url, { headers }), PAGE_TIMEOUT);
      return { status: res.status, url: res.url || url, text: await res.text() };
    }
    const q = new URLSearchParams({ url, accept: headers.Accept });
    if (opts.headers && opts.headers["User-Agent"]) q.set("ua", opts.headers["User-Agent"]);
    const res = await deadline(fetch(PROXY + "?" + q, { credentials: "omit" }), PAGE_TIMEOUT);
    const refused = res.headers.get("X-Proxy-Error");
    if (refused && res.status !== 429) throw new TypeError("Failed to fetch (" + refused + ")");
    return { status: res.status, url: res.headers.get("X-Final-Url") || url, text: await res.text() };
  }

  // A file's bytes as a Blob (a book's EPUB from Discover or a pasted
  // link), with its final address and type. The app downloads it into the
  // cache and reads it back from there; a browser fetches it, through the
  // proxy unless the site allows any origin.
  // `headers` (a catalog's login) go only to the site itself, never through
  // the proxy.
  async function fetchBytes(url, name, headers) {
    if (plugin("Filesystem") && plugin("CapacitorHttp")) {
      const path = "fetched/" + String(name || "file").replace(/[^\w.-]+/g, "_").slice(0, 80);
      const src = await downloadTo(url, path, null, "CACHE", headers);
      if (!src) throw new TypeError("Failed to fetch (no file)");
      const blob = await (await fetch(src)).blob();
      plugin("Filesystem").deleteFile({ path, directory: "CACHE" }).catch(() => {});
      return { status: 200, url, type: blob.type, blob };
    }
    const res = !PROXY || direct(url) || (headers && Object.keys(headers).length)
      ? await deadline(fetch(url, { headers: headers || {}, credentials: "omit" }), PAGE_TIMEOUT * 2)
      : await deadline(fetch(PROXY + "?" + new URLSearchParams({ url, accept: "*/*" }), { credentials: "omit" }), PAGE_TIMEOUT * 2);
    const refused = res.headers.get("X-Proxy-Error");
    if (refused && res.status !== 429) throw new TypeError("Failed to fetch (" + refused + ")");
    return { status: res.status, url: res.headers.get("X-Final-Url") || res.url || url, type: res.headers.get("Content-Type") || "", blob: await res.blob() };
  }

  // A WebDAV folder's listing (the WebDAV extension, 2026-11) as
  // { status, url, text }: a PROPFIND, which Android's own http refuses, so
  // there it goes through the Files plugin's davList (Dav.java); iOS's
  // CapacitorHttp sends any method; a browser asks the server straight, so
  // the server has to allow the web copy. Never through the fetch proxy:
  // it carries a login. `auth` is the Authorization header, or "".
  async function dav(url, auth, depth = "1") {
    const F = plugin("Files");
    if (os === "android" && F) {
      let r;
      try { r = await deadline(F.davList({ url, auth: auth || "", depth }), PAGE_TIMEOUT + 15000); }
      catch (e) { throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")"); }
      return { status: r.status, url: r.url || url, text: r.text || "" };
    }
    const headers = { Depth: depth, ...(auth ? { Authorization: auth } : {}) };
    const http = plugin("CapacitorHttp");
    if (http) {
      let res;
      try {
        res = await deadline(http.request({ url, method: "PROPFIND", headers: { ...headers, "User-Agent": USER_AGENT }, responseType: "text",
          connectTimeout: PAGE_TIMEOUT / 2, readTimeout: PAGE_TIMEOUT }), PAGE_TIMEOUT + 5000);
      } catch (e) { throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")"); }
      return { status: res.status, url: res.url || url, text: typeof res.data === "string" ? res.data : "" };
    }
    const res = await deadline(fetch(url, { method: "PROPFIND", headers: { ...headers, "Content-Type": "application/xml; charset=utf-8" }, credentials: "omit",
      body: '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>' }), PAGE_TIMEOUT);
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

  // A call to a server's own API (Audiobookshelf), as { status, text }.
  // The app asks natively; a browser asks the server straight, never
  // through the proxy, since `headers` carry a login.
  async function request(url, { method = "GET", headers = {}, body } = {}) {
    const http = plugin("CapacitorHttp");
    if (http) {
      let res;
      try {
        res = await deadline(http.request({ url, method, headers: { "User-Agent": USER_AGENT, ...headers }, ...(body != null ? { data: body } : {}), responseType: "text",
          connectTimeout: PAGE_TIMEOUT / 2, readTimeout: PAGE_TIMEOUT }), PAGE_TIMEOUT + 5000);
      } catch (e) {
        throw new TypeError("Failed to fetch (" + ((e && e.message) || e) + ")");
      }
      return { status: res.status, text: typeof res.data === "string" ? res.data : res.data == null ? "" : JSON.stringify(res.data) };
    }
    const res = await deadline(fetch(url, { method, headers, body: body == null ? undefined : body, credentials: "omit" }), PAGE_TIMEOUT);
    return { status: res.status, text: await res.text() };
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
  // Translate plugin on Android, Apple's Translation on iOS 18 and later,
  // the browser's own Translator elsewhere (Chrome on a computer). None
  // sends the words anywhere; each downloads a language once. Not in
  // other browsers.
  const held = { translator: null, pair: "", ios: false };
  if (os === "ios" && plugin("Translate")) plugin("Translate").supported().then((r) => { held.ios = !!(r && r.ok); }).catch(() => {});
  const phoneTranslates = () => (os === "android" && !!plugin("Translate")) || (os === "ios" && held.ios);
  const translator = {
    get available() {
      if (native) return phoneTranslates();
      return typeof self.Translator === "function";
    },
    get onPhone() { return native; },
    get byApple() { return os === "ios"; },
    // The language of a clip whose page didn't say: "" when it can't tell.
    async detect(text) {
      const T = plugin("Translate");
      try {
        if (T && phoneTranslates()) return (await T.detect({ text: text.slice(0, 2000) })).lang || "";
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
        if (T && phoneTranslates()) return (await T.ready({ from, to })).state;
        const s = await self.Translator.availability({ sourceLanguage: from, targetLanguage: to });
        return s === "unavailable" ? "unavailable" : s === "available" ? "available" : "downloadable";
      } catch (e) { return "unavailable"; }
    },
    // Gets the pair ready, downloading what's missing. In a browser it has
    // to start from a tap, so it is the first thing a tap on Translate does.
    async prepare(from, to, onProgress) {
      const T = plugin("Translate");
      if (T && phoneTranslates()) { await T.prepare({ from, to }); return; }
      held.translator = null;
      held.translator = await self.Translator.create({ sourceLanguage: from, targetLanguage: to,
        monitor: (m) => m.addEventListener("downloadprogress", (e) => { if (onProgress) onProgress(e.loaded); }) });
      held.pair = from + ">" + to;
    },
    async translate(texts, from, to) {
      const T = plugin("Translate");
      if (T && phoneTranslates()) return (await T.clip({ from, to, texts })).texts || [];
      if (!held.translator || held.pair !== from + ">" + to) throw new Error(t("Not ready to translate"));
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
  // `waitFor`: a CSS selector the page must show before it counts as drawn,
  // for a list it fetches after its first screen (comix.to's chapters).
  async function render(url, { scroll = false, waitFor = "" } = {}) {
    const R = plugin("PageRender");
    if (!R) return null;
    try {
      const wait = scroll ? 50000 : 20000;
      const res = await deadline(R.render({ url, timeoutMs: wait, scroll, waitFor }), wait + 10000);
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
    // Kokoro and Piper voices (Android, arm64; iOS): Waypage's own speech
    // engine, from a download in Settings. null where there's no such
    // plugin or phone. action: download / use / remove (with the pack's
    // id), or cancel.
    async kokoro(action, id) {
      const K = plugin("Kokoro");
      if (!K) return null;
      if (action) { await K[action](id ? { id } : {}); return null; }
      try { const s = await K.status(); return s && s.supported ? s : null; } catch (e) { return null; }
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
    // Volume under Allow mixing, 0 to 2 (the app only; iOS stops at 1).
    async volume(volume) {
      const S = plugin("Speech");
      if (S) return S.volume({ volume }).catch(() => {});
    },
    // The sleep timer (1.32.0): pause after `seconds`, 0 to cancel. The
    // phone keeps the time itself, put away; in a browser the page does.
    // Resolves whether the phone took it.
    async sleep(seconds) {
      const S = plugin("Speech");
      if (!S) return false;
      try { await S.sleep({ seconds: Math.max(0, Math.round(seconds)) }); return true; } catch (e) { return false; }
    },
    // Told { at } when the lock screen's Sleep 15 min (Android) sets the
    // timer or it runs out (1.36.0).
    onSleep(fn) {
      const S = plugin("Speech");
      if (S && S.addListener) S.addListener("sleep", (e) => fn(Number((e && e.at) || 0)));
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
    // The Personal Voice the person made in iOS's Settings (iOS 17): asks
    // once, then it is among the voices. "authorized", "denied",
    // "unsupported", or null where there's no such thing.
    async personalVoice() {
      const S = plugin("Speech");
      if (!S || os !== "ios") return null;
      try { return (await S.personalVoice()).state || null; } catch (e) { return null; }
    },
    get hasPersonalVoice() { return os === "ios" && !!plugin("Speech"); },
    async state() {
      const S = plugin("Speech");
      if (S) { try { return await S.state(); } catch (e) { return { key: "", index: -1, state: "stopped" }; } }
      return { key: web.key, index: web.i, state: web.items.length ? web.state : "stopped" };
    },
    // The clip to go on to when the clip `after` ends (1.23.0), read by
    // the phone with no help from the page, which can't draw it while the
    // app is put away. { after, items, start, lang, voice, title, subtitle, key };
    // no items clears it. Resolves false where the phone can't (a
    // browser): the app goes on itself at the end, as before.
    async queue(o) {
      const S = plugin("Speech");
      if (!S) return false;
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
    // stories (2026-11): linked collections to look at for new chapters,
    // [{ name, url, host, prefix, depths, known }]; `wifi` keeps those
    // checks off mobile data.
    watch(feeds, ask, notes, stories, wifi) {
      const F = plugin("Feeds");
      if (F) F.watch({ feeds, ask: !!ask, notes, stories: stories || [], wifi: !!wifi }).catch(() => {});
    },
    // { feeds: [url], open, feed, save, stories: [name], story }: feeds
    // with new posts since, whether a notification opened the app, the
    // feed it was for and the post its Save asked for; collections with
    // new chapters since, and the one a notification opened.
    async news() {
      const F = plugin("Feeds");
      if (F) { try { return await F.news(); } catch (e) { /* none */ } }
      return { feeds: [], open: false, stories: [] };
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
  // `wait`: how long the whole download may take (an audiobook's part is
  // tens of megabytes), FILE_TIMEOUT's few seconds otherwise.
  async function downloadTo(url, path, page, directory = "DATA", extra, wait) {
    const FS = plugin("Filesystem");
    if (!FS) return null;
    // The page's own site as Referer, as a browser sends it (its origin,
    // not the whole address).
    const headers = { "User-Agent": USER_AGENT, ...(extra || {}) };
    try { if (page) headers.Referer = new URL(page).origin + "/"; } catch (e) { /* no referer */ }
    await folderFor(FS, path, directory);
    await deadline(FS.downloadFile({ url, path, directory, recursive: true, headers,
      connectTimeout: FILE_TIMEOUT / 2, readTimeout: FILE_TIMEOUT }), wait || FILE_TIMEOUT + 5000);
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

  // A file the app made (a deck turned into a PDF, 1.49.0) saved where
  // the person picks, with a lasting permission so a clip can read from
  // it. `near` is a file whose folder the picker opens in. Resolves to
  // { saved, ref }: ref is null when the place can't be held on to (no
  // such picker), and saved false when it was put away.
  async function saveLinked(blob, name, mime, near) {
    const F = plugin("FileSave");
    if (F) {
      const cache = await window.Waypage.store.cacheFile(name);
      for (let i = 0; i < blob.size; i += 1 << 20) await cache.append(new Uint8Array(await blob.slice(i, i + (1 << 20)).arrayBuffer()));
      const res = await F.save({ uri: await cache.uri(), name, mime, keep: true, near: near || "" });
      return { saved: !!(res && res.saved), ref: (res && res.saved && res.uri) || null };
    }
    if (!native && typeof window.showSaveFilePicker === "function") {
      let handle;
      try { handle = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: (name.split(".").pop() || "PDF").toUpperCase(), accept: { [mime]: ["." + (name.split(".").pop() || "pdf").toLowerCase()] } }] }); } catch (e) { return { saved: false, ref: null }; }
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      const got = await files.adopt(handle);
      return { saved: true, ref: got ? got.ref : null };
    }
    return { saved: null, ref: null };
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
  const shareFile = (uri, name) => share({ title: name, files: [uri], dialogTitle: t("Save or send {name}", { name }) });
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
  // keel's update.js (0.15.0) downloads the release's APK into the app's
  // cache, reporting progress, and hands it to Android's installer: no
  // browser tab, no Downloads folder. Android asks once whether Waypage may
  // install apps, then to install. Signed with the same key (alias
  // waypage), it installs over the top and keeps every saved page. The
  // download names the tag, not `latest`, so a release published
  // mid-download can't swap the file. Resolves to the file's uri so a
  // dismissed installer can be reopened without downloading again; null
  // where there's no in-app installer (iOS, a browser).
  const repo = () => (K.build && K.build.repo) || null;
  // Since 1.23.0 it comes through Downloads' own fetch, which goes on
  // with the app put away and can pause and pick up where it stopped: a
  // pause rejects with code "PAUSED". Older builds use Filesystem.
  // A test build (1.48.0) comes from the pre-release `tag` instead,
  // and `version` is then its file's name part (test-<branch>-<sha>).
  // An unreleased build (2026-11-18) passes its own `url` (the site's
  // unreleased/Waypage.apk), and `version` is unreleased-<sha>.
  async function viaDownloads(url, path, onProgress) {
    const D = plugin("Downloads");
    if (!D || typeof D.fetch !== "function") return null;
    const heard = await D.addListener("fetched", (p) => {
      if (onProgress && p && p.path === path) onProgress(p.total > 0 ? Math.min(1, p.bytes / p.total) : 0, p.bytes, p.total);
    });
    try {
      return (await D.fetch({ url, path })).uri;
    } catch (e) {
      if (!(e && e.code === "UNIMPLEMENTED") && !/not implemented/i.test(String((e && e.message) || e))) throw e;
      return null;
    } finally {
      if (heard && heard.remove) heard.remove();
    }
  }
  // A preview's APK stays until this is that preview: a paused download
  // of another one picks up where it stopped.
  let updater = null;
  const U = () => updater || (updater = window.Keel.update.create({ name: "Waypage", platform: K, fetch: viaDownloads, keepBuilds: true }));
  function downloadUpdate(version, onProgress, file = "Waypage.apk", tag, url = null) {
    return U().download({ version, key: version, tag: tag || undefined, url: url || undefined }, onProgress);
  }
  // A file kept where the person picked (2026-11: a Kiwix pack, a book
  // kept as a file): downloaded into the cache natively, resumable (the
  // part already there is kept if it stops), then moved to "app" (the
  // app's own files), "documents" (Documents/Waypage), "downloads" (the
  // phone's Download folder) or "folder" (`tree`, a folder picked with
  // files.pickFolder); a `name` of "Folder/file" puts it in that folder.
  // Resolves to the file's lasting ref for files.blob
  // and files.info; null in a browser, which can't keep one.
  let keeping = Promise.resolve();
  function keepFile(url, name, where, onProgress, tree) {
    const run = keeping.then(() => keepOne(url, name, where, onProgress, tree));
    keeping = run.catch(() => {});
    return run;
  }
  // "Folder/file.mp3" keeps a file in a folder of its own (an audiobook's parts).
  const keepName = (name) => {
    const clean = (x) => String(x || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
    return String(name || "file").split("/").map(clean).filter(Boolean).slice(-2).join("/") || "file";
  };
  async function keepOne(url, name, where, onProgress, tree) {
    const FS = plugin("Filesystem");
    if (!FS || !native) return null;
    const safe = keepName(name);
    const temp = "keep-" + safe.replace(/[^\w.-]+/g, "_");
    const D = plugin("Downloads");
    let from = null;
    if (D && typeof D.fetch === "function") {
      const heard = await D.addListener("fetched", (p) => { if (onProgress && p && p.path === temp) onProgress(p.bytes, p.total); });
      try { from = (await D.fetch({ url, path: temp })).uri; }
      catch (e) { if (!(e && e.code === "UNIMPLEMENTED") && !/not implemented/i.test(String((e && e.message) || e))) throw e; }
      finally { if (heard && heard.remove) heard.remove(); }
    }
    if (!from) {
      const listener = await FS.addListener("progress", (p) => { if (onProgress && p) onProgress(p.bytes, p.contentLength); });
      try { await FS.downloadFile({ url, path: temp, directory: "CACHE", progress: true, headers: { "User-Agent": USER_AGENT } }); }
      finally { if (listener && listener.remove) listener.remove(); }
      from = (await FS.getUri({ path: temp, directory: "CACHE" })).uri;
    }
    return placeKept(FS, from, temp, safe, where, tree);
  }
  // A file the app made in its cache (a story made into a book) kept the
  // same way, moved out of the cache.
  async function keepMade(from, name, where, tree) {
    const FS = plugin("Filesystem");
    if (!FS || !native) return null;
    const run = keeping.then(() => placeKept(FS, from, null, keepName(name), where, tree));
    keeping = run.catch(() => {});
    return run;
  }
  async function placeKept(FS, from, temp, safe, where, tree) {
    if (where === "folder" && tree) {
      const F = plugin("Files");
      await F.folderMoveIn({ tree, path: safe, from });
      const got = await F.folderStat({ tree, path: safe });
      if (!got || !got.uri) throw new Error("not in the folder");
      return got.uri;
    }
    const to = where === "documents" ? { directory: "DOCUMENTS", dir: "Waypage/" }
      : where === "downloads" ? (os === "android" ? { directory: "EXTERNAL_STORAGE", dir: "Download/" } : { directory: "DOCUMENTS", dir: "Downloads/" })
        : { directory: "DATA", dir: "Files/" };
    // A file of that name already there is kept: this one gets a number.
    let path = to.dir + safe;
    for (let n = 2; n < 50; n++) {
      try { await FS.stat({ path, directory: to.directory }); } catch (e) { break; }
      path = to.dir + safe.replace(/(\.[a-z0-9]+)?$/i, (ext) => " (" + n + ")" + ext);
    }
    await folderFor(FS, path, to.directory);
    if (!temp) {
      await FS.copy({ from, to: path, toDirectory: to.directory });
      await FS.deleteFile({ path: from }).catch(() => {});
    } else try { await FS.rename({ from: temp, directory: "CACHE", to: path, toDirectory: to.directory }); }
    catch (e) {
      await FS.copy({ from: temp, directory: "CACHE", to: path, toDirectory: to.directory });
      await FS.deleteFile({ path: temp, directory: "CACHE" }).catch(() => {});
    }
    return (await FS.getUri({ path, directory: to.directory })).uri;
  }
  // A file keepFile kept in one of the app's places, deleted (a pack
  // removed from the library). A picked folder's file is left alone.
  async function dropKept(ref) {
    const FS = plugin("Filesystem");
    if (!FS || !/^file:/.test(String(ref || ""))) return false;
    try { await FS.deleteFile({ path: ref }); return true; } catch (e) { return false; }
  }
  function pauseUpdate() {
    const D = plugin("Downloads");
    return D && typeof D.pauseFetch === "function" ? D.pauseFetch().then(() => true, () => false) : Promise.resolve(false);
  }
  const openInstaller = (uri) => U().install(uri);
  // APKs for versions already installed have done their job, and so has
  // a preview's once this is that preview.
  const clearOldUpdates = (currentVersion) => U().clearOld({ version: currentVersion, sha: K.build && K.build.sha });

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
            else if (ev.state === 3 || ev.state === 5) done(reject, new Error(t("The scanner couldn't be installed.")));
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
    "application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/vnd.comicbook+zip", "application/x-cbz", "application/zip",
    // Another app's export to import (1.9.0).
    "text/csv", "text/comma-separated-values", "application/json",
    // Kindle books and FB2 (1.42.0). Many phones call an AZW3 just data.
    "application/x-mobipocket-ebook", "application/vnd.amazon.ebook", "application/x-mobi8-ebook", "application/x-fictionbook+xml",
    "application/x-fictionbook", "text/xml", "application/xml", "application/octet-stream",
    // Audiobooks (2026-11).
    "audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/x-m4b", "audio/m4b", "audio/aac", "audio/ogg", "audio/opus", "audio/flac", "audio/x-flac", "audio/wav", "audio/x-wav", "audio/x-m4p", "audio/vnd.audible.aax", "audio/audible",
    // Kiwix packs (2026-11).
    "application/x-zim"];
  const FILE_EXTS = [".zim", ".epub", ".mobi", ".azw", ".azw3", ".prc", ".fb2", ".md", ".markdown", ".txt", ".html", ".htm", ".eml", ".pdf", ".pptx", ".cbz", ".csv", ".json", ".zip",
    ".mp3", ".m4a", ".m4b", ".aac", ".ogg", ".oga", ".opus", ".flac", ".wav", ".aa", ".aax", ".aaxc", ".m4p"];
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
          types: [{ description: t("Books, notes and comics"), accept: { "*/*": FILE_EXTS } }] });
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
      return got && got.uri ? { ref: got.uri, name: got.name || t("Folder") } : null;
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
    // A file at `path` in a picked folder, as a ref for info, blob and
    // linking (the Calibre extension); null when it isn't there. iOS's refs
    // are the folder's plus the path, as scan makes them.
    async child(tree, path) {
      const F = plugin("Files");
      if (!F) return null;
      if (os === "ios") return tree + "/" + String(path).split("/").map(encodeURIComponent).join("/");
      try {
        const got = await F.folderStat({ tree, path });
        return got && got.exists && got.uri ? got.uri : null;
      } catch (e) { return null; }
    },
    // The folder a file sits in, opened in the phone's Files app (1.27.2,
    // Android; iOS too). { opened, where }, where its path ("Download/Books").
    get canReveal() { return (os === "android" || os === "ios") && !!plugin("Files"); },
    async reveal(ref, tree) {
      const F = plugin("Files");
      if (!F || !(os === "android" || os === "ios")) return { opened: false, where: "" };
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

  // ---- Android Auto (2026-11) ----
  // What the car lists and can start with the app closed (CarPlugin keeps
  // it as car.json), and where what it started got to: { id: { kind,
  // part, pos | index, of, done, at } }, taken once.
  const car = {
    get on() { return !!plugin("Car"); },
    async list(o) { const P = plugin("Car"); if (!P) return false; try { await P.list({ json: JSON.stringify(o) }); return true; } catch (e) { return false; } },
    async places() { const P = plugin("Car"); if (!P) return {}; try { const r = await P.places(); return JSON.parse((r && r.json) || "{}"); } catch (e) { return {}; } },
  };

  window.Waypage = window.Waypage || {};
  // ---- Audiobooks (2026-11) ----
  // The phone's own player in the app (AudiobookPlugin: it keeps playing
  // with the screen off and answers the lock screen and earbuds); a
  // browser's <audio> elsewhere, which stops when the page is put away on
  // iOS. Times are milliseconds into a part (one sound file, or one
  // stretch of an EPUB). `on(fn)` hears { key, part, pos, dur, state }.
  const audio = (() => {
    const A = () => plugin("Audiobook");
    const heard = new Set(), sleepHeard = new Set();
    const tell = (s) => { for (const f of heard) f(s); };
    let el = null, job = null, sleepAt = 0, sleepTimer = 0, tick = 0;
    if (A()) {
      A().addListener("state", tell);
      A().addListener("sleep", (s) => { for (const f of sleepHeard) f(s.at || 0); });
    }
    const webState = (state) => job && tell({ key: job.key, part: job.part, pos: Math.round(((el && el.currentTime) || 0) * 1000), dur: Math.round(((el && el.duration) || 0) * 1000) || 0, state });
    async function webLoad(part, pos, play) {
      const p = job.parts[part];
      if (!p) return;
      job.part = part;
      if (!el) {
        el = new Audio();
        el.preload = "auto";
        el.addEventListener("ended", () => { if (job && job.part + 1 < job.parts.length) webLoad(job.part + 1, 0, true); else webState("ended"); });
        el.addEventListener("pause", () => { if (job && !el.ended) webState("paused"); });
        el.addEventListener("playing", () => webState("playing"));
        el.addEventListener("error", () => webState("error"));
      }
      if (el.dataset.url) URL.revokeObjectURL(el.dataset.url);
      const src = await p.src();
      el.dataset.url = src.startsWith("blob:") ? src : "";
      el.src = src;
      el.playbackRate = job.rate || 1;
      await new Promise((done) => { el.addEventListener("loadedmetadata", done, { once: true }); el.addEventListener("error", done, { once: true }); });
      el.currentTime = pos < 0 ? Math.max(0, (el.duration || 0) + pos / 1000) : pos / 1000;
      if (play) { try { await el.play(); } catch (e) { webState("paused"); } }
      clearInterval(tick);
      tick = setInterval(() => { if (el && !el.paused) webState("playing"); }, 500);
    }
    function webSleep(at) {
      clearTimeout(sleepTimer);
      sleepAt = at || 0;
      if (sleepAt) sleepTimer = setTimeout(() => { if (el) el.pause(); sleepAt = 0; for (const f of sleepHeard) f(0); }, Math.max(0, sleepAt - Date.now()));
    }
    return {
      get native() { return !!A(); },
      on(fn) { heard.add(fn); return () => heard.delete(fn); },
      onSleep(fn) { sleepHeard.add(fn); },
      // parts: [{ uri, offset, length }] in the app; [{ src: async () => url }] elsewhere.
      // chapters: [{ title, part, pos }] for a car's queue; cover: the book's picture.
      async play({ parts, part = 0, pos = 0, rate = 1, title = "", subtitle = "", key = "", chapters = [], cover = "" }) {
        if (A()) return A().play({ parts: parts.map((p) => ({ uri: p.uri, offset: p.offset == null ? -1 : p.offset, length: p.length == null ? -1 : p.length })), part, pos: Math.round(pos), rate, title, subtitle, key, chapters, cover });
        job = { parts, part, rate, key };
        tell({ key, part, pos, dur: 0, state: "loading" });
        await webLoad(part, pos, true);
      },
      pause() { if (A()) return A().pause(); if (el) el.pause(); },
      async resume() { if (A()) return A().resume(); if (el) { try { await el.play(); } catch (e) { /* not now */ } } },
      stop() {
        if (A()) return A().stop();
        if (el) { el.pause(); el.removeAttribute("src"); el.load(); }
        clearInterval(tick);
        const k = job && job.key;
        webSleep(0);
        if (job) tell({ key: k, part: job.part, pos: 0, dur: 0, state: "stopped" });
        job = null;
      },
      async seek(part, pos) {
        if (A()) return A().seek({ part, pos: Math.round(pos) });
        if (!job) return;
        if (part !== job.part) await webLoad(part, pos, el && !el.paused);
        else if (el) el.currentTime = pos < 0 ? Math.max(0, el.duration + pos / 1000) : pos / 1000;
        webState(el && !el.paused ? "playing" : "paused");
      },
      rate(r) { if (A()) return A().rate({ rate: r }); if (job) job.rate = r; if (el) el.playbackRate = r; },
      sleep(at) { if (A()) return A().sleep({ at: at || 0 }); webSleep(at); },
      // Allow mixing, its volume (0 to 2), and skip lengths in seconds (the app only).
      options({ mix = false, volume = 1, back = 15, on = 30 } = {}) { if (A()) return A().options({ mix, volume, back: back * 1000, on: on * 1000 }).catch(() => {}); },
      // The small window outside the app; false where there is none.
      async pip(on, playing) {
        if (!A()) return false;
        try { return !!(await A().pip({ on, playing })).supported; } catch (e) { return false; }
      },
      async state() {
        if (A()) { try { return await A().state(); } catch (e) { return null; } }
        return job ? { key: job.key, part: job.part, pos: Math.round(((el && el.currentTime) || 0) * 1000), state: el && !el.paused ? "playing" : "paused", sleep: sleepAt } : null;
      },
      // { duration (ms), title, artist, album, cover (base64) } or null.
      async probe(uri, offset, length) {
        if (!A()) return null;
        try { return await A().probe({ uri, offset: offset == null ? -1 : offset, length: length == null ? -1 : length }); } catch (e) { return null; }
      },
      // A sound's length in a browser, in seconds: 0 when it can't tell.
      length(url) {
        return new Promise((done) => {
          const a = new Audio();
          a.preload = "metadata";
          const end = (v) => { a.removeAttribute("src"); done(v); };
          a.addEventListener("loadedmetadata", () => end(Number.isFinite(a.duration) ? a.duration : 0), { once: true });
          a.addEventListener("error", () => end(0), { once: true });
          setTimeout(() => end(0), 15000);
          a.src = url;
        });
      },
      // Transcripts, made on the phone (Android).
      get canTranscribe() { return !!A(); },
      async models() { if (!A()) return { supported: false }; try { return await A().models(); } catch (e) { return { supported: false }; } },
      download: (id) => A().download({ id }),
      cancel: () => A().cancel(),
      remove: (id) => A().remove({ id }),
      transcribe: (o) => A().transcribe(o),
      stopTranscribing: () => (A() ? A().stopTranscribing().catch(() => {}) : null),
      // Each piece of a transcript as it's written: fn({ piece, from, to }).
      onPiece(fn) { if (A()) A().addListener("piece", fn); },
      // Stop pressed on the "Writing the transcript" notification.
      onWritingStopped(fn) { if (A()) A().addListener("writingStopped", fn); },
      // The narration saved as sound: one sound file per call,
      // { uri, dur, size, t0, t1 }, with fn({ n, of }) heard after each piece.
      get canVoice() { return !!A(); },
      voice: (o) => A().voice(o),
      stopVoicing: () => (A() ? A().stopVoicing().catch(() => {}) : null),
      onVoiced(fn) { if (A()) A().addListener("voiced", fn); },
    };
  })();

  window.Waypage.platform = {
    native,
    os,
    ios: os === "ios",
    android: os === "android",
    ready,
    named,
    get deviceName() { return deviceName; },
    get build() { return K.build; },
    plugin,
    // Whether this copy can fetch any page itself (the app) or is limited by
    // CORS (a browser).
    get canFetchPages() { return !!plugin("CapacitorHttp"); },
    // Whether this copy can read a page at all: the app itself, or a
    // browser through the fetch proxy. Neither can post forms there.
    get canReadPages() { return !!plugin("CapacitorHttp") || !!PROXY; },
    // Whether the connection is a metered one, mobile data (1.4.1): the
    // WebView says on Android, native/share's Connection plugin on iOS
    // (1.6.0); a browser says nothing, so nothing waits there.
    get metered() {
      if (os === "ios") return iosMetered;
      const c = navigator.connection;
      return !!c && /^(cellular|wimax|bluetooth)$/.test(c.type || "");
    },
    // The theme's background and whether it's dark, for the phone's bars
    // and, through native/share's Look plugin, for the window
    // and WebView at the next start, before the page paints. SystemBars
    // first: it also repaints the window, which Look then puts right.
    // keep is false for a reader's own theme: the next start opens on the library.
    look(bg, dark, keep) {
      const bars = plugin("SystemBars"), look = keep ? plugin("Look") : null;
      const style = bars && bars.setStyle ? bars.setStyle({ style: dark ? "DARK" : "LIGHT" }).catch(() => {}) : Promise.resolve();
      if (look) style.then(() => look.set({ bg, dark })).catch(() => {});
    },
    // The reader's brightness (1.10.0), native/share's Brightness plugin.
    brightness: {
      get available() { return !!plugin("Brightness"); },
      get: () => plugin("Brightness").get(),
      set: (level) => plugin("Brightness").set(level == null ? {} : { level }),
    },
    // App lock (1.38.0): the phone's fingerprint or face, native/share's
    // AppLock plugin (Face ID or Touch ID on iOS); the passcode
    // itself is checked in app-lock.js.
    lock: {
      async biometric() {
        const L = plugin("AppLock");
        if (!L) return false;
        try { return !!(await L.available()).ok; } catch (e) { return false; }
      },
      async verify(title) {
        const L = plugin("AppLock");
        if (!L) return false;
        try { return !!(await L.verify({ title })).ok; } catch (e) { return false; }
      },
      hideRecents(on) { const L = plugin("AppLock"); if (L) L.hideRecents({ on: !!on }).catch(() => {}); },
    },
    // Volume buttons turn pages (1.32.0), native/share's VolumeKeys
    // plugin on Android; `f` hears "up" or "down".
    volumeKeys: {
      get available() { return os === "android" && !!plugin("VolumeKeys"); },
      watch(on) { const V = plugin("VolumeKeys"); if (V) V.watch({ on: !!on }).catch(() => {}); },
      onKey(f) { const V = plugin("VolumeKeys"); if (V) V.addListener("key", (e) => f(e.key)); },
    },
    // The pen's buttons and eraser end (1.56.0), native/share's Pen plugin
    // on Android: a web page can't tell a stylus's side button from the pen
    // touching, so the touch is read before it reaches the page. `f` hears
    // { near, down, button, eraser, tool, buttons } when any changes.
    pen: {
      get available() { return os === "android" && !!plugin("Pen"); },
      // raw: every touch, hover and key too, for the pen test's log. grab:
      // One UI's side button and drag (not sent to a page at all) comes
      // as "erase" events, { a: "down" | "move" | "up", x, y } from the web view's corner.
      watch(on, raw, grab) { const P = plugin("Pen"); if (P) P.watch({ on: !!on, raw: !!raw, grab: !!grab }).catch(() => {}); },
      onState(f) { const P = plugin("Pen"); if (P) P.addListener("pen", f); },
      onErase(f) { const P = plugin("Pen"); if (P) P.addListener("erase", f); },
      onRaw(f) { const P = plugin("Pen"); if (P) P.addListener("raw", f); },
    },
    get knowsConnection() { return os === "ios" ? !!plugin("Connection") : os === "android" && !!navigator.connection; },
    onConnection(f) {
      if (os === "ios") { connectionHeard.add(f); return; }
      const c = navigator.connection;
      if (c && c.addEventListener) c.addEventListener("change", f);
    },
    fetchText,
    fetchBytes,
    dav,
    postForm,
    request,
    signIn,
    translateText,
    translator,
    render,
    get canRender() { return !!plugin("PageRender"); },
    downloadTo,
    openOutside,
    saveAndShare,
    saveFile, saveLinked,
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
    downloadUpdate, keepFile, keepMade, dropKept, pauseKeep: () => pauseUpdate(),
    pauseUpdate,
    openInstaller,
    clearOldUpdates,
    releasesUrl() { return repo() ? "https://github.com/" + repo() + "/releases/latest" : null; },
    releaseUrl(tag) { return repo() ? "https://github.com/" + repo() + "/releases/tag/" + tag : null; },
    // The branch this build came from, when it isn't a release (1.48.0).
    get previewBranch() { return K.build && K.build.branch && K.build.branch !== "main" ? K.build.branch : null; },
    apkUrl(file = "Waypage.apk") { return repo() ? "https://github.com/" + repo() + "/releases/latest/download/" + file : null; },
    // The web copy the app was built from: inside the app this page is at
    // https://localhost, which another device can't open.
    webUrl() { return (K.build && K.build.webUrl) || null; },
    files,
    audio,
    car,
    get canScan() { return !!scanner(); },
    scanQr,
  };
})();
