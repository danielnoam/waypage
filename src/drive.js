// Waypage: backups in Google Drive (1.27.0), beside GitHub sync rather
// than instead of it. A backup is backup.exportLibrary's zip, put in a
// "Waypage" folder in the person's Drive; the last KEEP are kept.
//
// The scope is drive.file: Waypage sees only the files it made, so Google
// needs no review. In the app, native/share's Drive plugin gets the token
// from Play Services (matched by package name and signing key, no
// secret) and moves the file; in a browser, Google's sign-in page opens
// in a small window and hands a token back through the address, good for
// an hour.
(function () {
  const C = window.Waypage;
  // From the Google Cloud project's Web client. Not a secret.
  const WEB_CLIENT = "713128219626-k0dbj8fk364sprduqon2o97a0bum8rst.apps.googleusercontent.com";
  const SCOPE = "https://www.googleapis.com/auth/drive.file";
  const API = "https://www.googleapis.com/drive/v3";
  const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,createdTime,description";
  const FIELDS = "id,name,size,createdTime,description,appProperties";
  const CFG_KEY = "waypage.drive";      // { email, folder, auto, what, last }
  const TOKEN_KEY = "waypage.driveToken"; // a browser's token: { token, exp }
  const HAND_KEY = "waypage.driveHand";   // the sign-in window's answer
  const ASK_KEY = "waypage.driveAsk";     // what that answer must carry
  const FOLDER = "Waypage";
  const KEEP = 3;
  const WEEK = 7 * 24 * 3600 * 1000;

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  const P = () => C.platform.plugin("Drive");
  let cfg = load(CFG_KEY, null);
  let token = null; // { token, exp }
  const save = () => keep(CFG_KEY, cfg);

  class DriveError extends Error {
    constructor(message, code) { super(message); this.code = code || ""; }
  }

  // ---- Coming back from Google's sign-in page (a browser) ----
  // The address carries #state=wpdrive.<p|r>.<nonce>&access_token=…: p when
  // it opened in its own window, which closes again; r when the browser
  // blocked that window and this tab went to Google itself.
  const back = (() => {
    if (!/[#&]state=wpdrive\./.test(location.hash)) return null;
    const q = new URLSearchParams(location.hash.slice(1));
    history.replaceState(history.state, "", location.pathname + location.search);
    const [, how, nonce, then] = (q.get("state") || "").split(".");
    const got = { nonce, then: then || "", error: q.get("error") || (q.get("access_token") ? "" : "none"),
      token: q.get("access_token") || "", exp: Date.now() + ((Number(q.get("expires_in")) || 3600) - 120) * 1000 };
    keep(HAND_KEY, got);
    try { const ch = new BroadcastChannel("waypage.drive"); ch.postMessage(got); ch.close(); } catch (e) { /* the storage event says it too */ }
    if (how === "p") setTimeout(() => window.close(), 60);
    return { popup: how === "p", got };
  })();

  // ---- Tokens ----

  const live = (t) => !!(t && t.token && t.exp > Date.now());
  if (!C.platform.native) { const t = load(TOKEN_KEY, null); if (live(t)) token = t; }
  const setToken = (t) => { token = t; if (!C.platform.native) keep(TOKEN_KEY, t); };

  function redirect() { return location.origin + location.pathname.replace(/[^/]*$/, ""); }

  // Google's page in a small window; the page it comes back to (this app,
  // at its own address) leaves the token in HAND_KEY and closes. Without a
  // window (blocked), this tab goes there and comes back with `then` to
  // carry on with.
  let waiting = null;
  function signIn(then) {
    if (!WEB_CLIENT) return Promise.reject(new DriveError("Google Drive isn't set up in this copy.", "setup"));
    const nonce = Math.random().toString(36).slice(2, 12);
    keep(ASK_KEY, nonce);
    keep(HAND_KEY, null);
    const url = (how) => "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
      client_id: WEB_CLIENT, redirect_uri: redirect(), response_type: "token", scope: SCOPE, include_granted_scopes: "true",
      state: "wpdrive." + how + "." + nonce + (how === "r" && then ? "." + then : ""), ...(cfg && cfg.email ? { login_hint: cfg.email } : {}),
    });
    const w = window.open(url("p"), "waypage-drive", "popup,width=480,height=640");
    if (!w) { location.assign(url("r")); return new Promise(() => {}); }
    if (waiting) waiting.no(new DriveError("Asked again.", "again"));
    return new Promise((ok, no) => {
      waiting = { ok, no };
      // Not w.closed: Google's page cuts the window off from this one, so
      // it reads closed while it's still open. Given up after five minutes.
      waiting.timer = setTimeout(() => { if (waiting) { waiting = null; no(new DriveError("Google didn't answer.", "timeout")); } }, 5 * 6e4);
    });
  }
  function handed(got) {
    if (!got || got.nonce !== load(ASK_KEY, null)) return;
    keep(ASK_KEY, null);
    keep(HAND_KEY, null);
    const w = waiting;
    waiting = null;
    if (w) clearTimeout(w.timer);
    if (got.error) { if (w) w.no(new DriveError(got.error === "access_denied" ? "Not allowed." : "Google said no (" + got.error + ").", "declined")); return; }
    setToken({ token: got.token, exp: got.exp });
    if (w) w.ok(got.token);
  }
  if (!C.platform.native) {
    addEventListener("storage", (e) => { if (e.key === HAND_KEY && e.newValue) handed(load(HAND_KEY, null)); });
    try { new BroadcastChannel("waypage.drive").onmessage = (e) => handed(e.data); } catch (e) { /* storage event instead */ }
    if (back && !back.popup) handed(back.got);
  }

  // A token, asking the person only when `ask` (a tap; a browser can open
  // its sign-in window only then). Throws DriveError "signin" otherwise.
  async function getToken(ask, then) {
    if (live(token)) return token.token;
    const D = P();
    if (D) {
      try {
        const r = await D.authorize({ ask: !!ask });
        setToken({ token: r.token, exp: Date.now() + 50 * 6e4 });
        return r.token;
      } catch (e) {
        if (e && e.code === "consent") throw new DriveError("Connect Google Drive again.", "signin");
        if (e && e.code === "declined") throw new DriveError("Not allowed.", "declined");
        throw new DriveError("Couldn't reach Google. Check the connection and try again.", "network");
      }
    }
    if (!ask) throw new DriveError("Sign in to Google again.", "signin");
    return signIn(then);
  }

  async function api(path, opts = {}, ask) {
    for (let tries = 0; ; tries++) {
      const t = await getToken(ask);
      let res;
      try {
        res = await fetch(path.startsWith("https:") ? path : API + path, { ...opts, headers: { Authorization: "Bearer " + t, ...(opts.headers || {}) } });
      } catch (e) {
        throw new DriveError("Couldn't reach Google Drive. Check the connection and try again.", "network");
      }
      if (res.status === 401 && !tries) { setToken(null); continue; }
      if (res.status === 204) return null;
      const body = await res.json().catch(() => null);
      if (!res.ok) throw failure(res.status, body);
      return body;
    }
  }
  function failure(status, body) {
    const why = body && body.error && (body.error.errors || [])[0];
    const reason = (why && why.reason) || "";
    if (status === 401) return new DriveError("Connect Google Drive again.", "signin");
    if (/storageQuotaExceeded|quotaExceeded/.test(reason)) return new DriveError("Your Google Drive is full.", "full");
    if (status === 404) return new DriveError("That backup isn't in Drive any more.", "gone");
    return new DriveError("Google Drive said no (" + status + "). Try again later.", String(status));
  }

  // ---- Drive ----

  const quote = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'") + "'";

  // The Waypage folder, made the first time. Found again by name when its
  // id is lost (another device made it; drive.file sees it once this app
  // made it, from any device signed in to the same Google Cloud project).
  async function folder() {
    if (cfg.folder) {
      const f = await api("/files/" + cfg.folder + "?fields=id,trashed").catch((e) => { if (e.code === "gone") return null; throw e; });
      if (f && !f.trashed) return cfg.folder;
    }
    const q = "name=" + quote(FOLDER) + " and mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents";
    const found = await api("/files?" + new URLSearchParams({ q, fields: "files(id)", pageSize: "1" }));
    let id = found && found.files && found.files[0] && found.files[0].id;
    if (!id) {
      const made = await api("/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }) });
      id = made.id;
    }
    cfg.folder = id;
    save();
    return id;
  }

  // The backups there, newest first: [{ id, name, size, at, from, clips }].
  async function list() {
    const dir = await folder();
    const q = quote(dir) + " in parents and trashed=false and appProperties has { key='waypage' and value='backup' }";
    const got = await api("/files?" + new URLSearchParams({ q, orderBy: "createdTime desc", fields: "files(" + FIELDS + ")", pageSize: "50" }));
    return ((got && got.files) || []).map((f) => ({ id: f.id, name: f.name, size: Number(f.size) || 0, at: Date.parse(f.createdTime) || 0,
      from: (f.appProperties && f.appProperties.device) || "", clips: Number(f.appProperties && f.appProperties.clips) || 0 }));
  }

  // Sends `out` (exportLibrary's { uri } in the app, { blob } in a
  // browser) and keeps the newest KEEP. Resolves to the new file.
  async function upload(out, info, onProgress) {
    const dir = await folder();
    const meta = { name: out.name, parents: [dir], mimeType: "application/zip",
      description: "Waypage backup" + (info.device ? " from " + info.device : ""),
      appProperties: { waypage: "backup", device: String(info.device || "").slice(0, 40), clips: String(info.clips || 0) } };
    let made;
    const D = P();
    if (D && out.uri) {
      const heard = onProgress ? await D.addListener("progress", (p) => onProgress(p.done, p.total)) : null;
      try {
        made = await D.upload({ uri: out.uri, token: await getToken(false), meta: JSON.stringify(meta) });
      } catch (e) {
        if (e && e.code === "401") setToken(null);
        throw e && /^\d+$/.test(e.code || "") ? failure(Number(e.code), parseBody(e.message)) : new DriveError("The backup didn't finish sending. Try again on a steadier connection.", "network");
      } finally {
        if (heard) heard.remove();
      }
    } else {
      made = await send(out.blob, meta, await getToken(false), onProgress);
    }
    await prune(dir).catch(() => {});
    return { id: made.id, size: Number(made.size) || 0 };
  }
  const parseBody = (msg) => { try { return JSON.parse(String(msg).replace(/^[^{]*/, "")); } catch (e) { return null; } };

  // One multipart request, with XMLHttpRequest for its upload progress.
  function send(blob, meta, t, onProgress) {
    const cut = "waypage" + Math.random().toString(36).slice(2);
    const body = new Blob(["--" + cut + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) +
      "\r\n--" + cut + "\r\nContent-Type: application/zip\r\n\r\n", blob, "\r\n--" + cut + "--\r\n"]);
    return new Promise((ok, no) => {
      const x = new XMLHttpRequest();
      x.open("POST", UPLOAD);
      x.setRequestHeader("Authorization", "Bearer " + t);
      x.setRequestHeader("Content-Type", "multipart/related; boundary=" + cut);
      if (onProgress) x.upload.onprogress = (e) => onProgress(e.loaded, e.total);
      x.onload = () => {
        let got = null;
        try { got = JSON.parse(x.responseText); } catch (e) { got = null; }
        if (x.status >= 200 && x.status < 300 && got && got.id) ok(got);
        else { if (x.status === 401) setToken(null); no(failure(x.status, got)); }
      };
      x.onerror = () => no(new DriveError("The backup didn't finish sending. Try again on a steadier connection.", "network"));
      x.send(body);
    });
  }

  async function prune(dir) {
    const all = await list();
    for (const f of all.slice(KEEP)) await api("/files/" + f.id, { method: "DELETE" }).catch(() => {});
  }

  // A backup as something restoreLibrary reads: a Blob in a browser, the
  // app's stand-in for a file in its cache in the app.
  async function download(id, onProgress) {
    const D = P();
    if (D) {
      const heard = onProgress ? await D.addListener("progress", (p) => onProgress(p.done, p.total)) : null;
      try {
        const got = await D.download({ id, token: await getToken(false) });
        return await C.platform.files.blob(got.uri, got.size);
      } catch (e) {
        if (e && e.code === "401") setToken(null);
        throw e instanceof DriveError ? e : e && /^\d+$/.test(e.code || "") ? failure(Number(e.code), parseBody(e.message))
          : new DriveError("Couldn't bring the backup down. Try again.", "network");
      } finally {
        if (heard) heard.remove();
      }
    }
    const t = await getToken(false);
    let res;
    try { res = await fetch(API + "/files/" + encodeURIComponent(id) + "?alt=media", { headers: { Authorization: "Bearer " + t } }); }
    catch (e) { throw new DriveError("Couldn't bring the backup down. Try again.", "network"); }
    if (!res.ok) throw failure(res.status, await res.json().catch(() => null));
    return await res.blob();
  }

  // ---- Connecting ----

  async function connect() {
    await getToken(true, "connect");
    const about = await api("/about?fields=user(emailAddress)");
    cfg = { email: (about && about.user && about.user.emailAddress) || "", auto: true, what: { clips: true, files: true, feeds: true }, last: {} };
    save();
    await folder();
    return cfg.email;
  }
  // Waypage's access is taken back from Google too, so the account's
  // "Third-party connections" page doesn't keep listing it.
  async function disconnect() {
    const t = token && token.token;
    cfg = null;
    keep(CFG_KEY, null);
    setToken(null);
    if (t) fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "token=" + encodeURIComponent(t) }).catch(() => {});
  }

  C.drive = {
    DriveError, KEEP, WEEK, connect, disconnect, list, upload, download, getToken,
    // There's a way in: the plugin in the app, a client ID in a browser.
    get available() { return C.platform.native ? !!P() : !!WEB_CLIENT && (location.protocol === "https:" || location.hostname === "localhost"); },
    get on() { return !!cfg; },
    get email() { return cfg ? cfg.email : ""; },
    get auto() { return !!(cfg && cfg.auto); },
    set auto(v) { if (cfg) { cfg.auto = !!v; save(); } },
    // What goes in a backup: clips, files (books, PDFs, comics), feeds.
    get what() { return cfg ? { clips: true, files: true, feeds: true, ...(cfg.what || {}) } : null; },
    setWhat(k, v) { if (!cfg) return; cfg.what = { ...this.what, [k]: !!v }; save(); },
    get last() { return (cfg && cfg.last) || {}; },
    set last(v) { if (cfg) { cfg.last = v || {}; save(); } },
    // Whether a token is at hand without asking (always in the app).
    get signedIn() { return C.platform.native ? !!P() : live(token); },
    // The sign-in window's own copy: it only hands the token over.
    get closing() { return !!(back && back.popup); },
    // What a tab sent to Google itself was doing ("connect", "backup").
    get resume() { return back && !back.popup && !back.got.error ? back.got.then : ""; },
  };
})();
