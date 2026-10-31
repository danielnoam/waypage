// Waypage: the library kept in step between devices through a private
// GitHub repo (0.30.0), the way LifeLog syncs (its src/storage.js).
//
// The repo holds library.json, every page's index entry with tags,
// collections, favourites and where the reader is, and pages/<id>.html,
// each page's text. Pictures never go: a page's HTML goes up with its
// pictures marked missing, and the other device downloads its own from
// the original links, as Links, Previews or Full images like the page
// was saved (Daniel, 5 Oct 2026).
//
// Two devices changing the library at once are merged against the last
// library both saw (the base), field by field, so neither writes over the
// other; a stale write (409) is merged again and retried, never forced.
(function () {
  const C = window.Waypage;
  const API = "https://api.github.com";
  const CFG_KEY = "waypage.sync";        // { owner, repo, branch, token, sha, at, links, paused }
  const BASE_KEY = "waypage.syncBase";   // the library.json last written or read
  const WAIT_KEY = "waypage.syncWaiting"; // ids whose text hasn't come down yet
  const SENT_KEY = "waypage.syncSent";   // pages sent before library.json was (1.13.0)
  const REPO = "waypage-data";
  const OLD_REPO = "carryon-data"; // Carry-on's name for it, before 1.0.0
  const STATS_KEY = "waypage.syncStats"; // { device: sha of its stats file as last read, _sent: what this device last wrote }
  const DAY = 24 * 3600 * 1000;
  const LOCAL = /^images\//;
  const KEEP_DELETED = 90 * 24 * 3600 * 1000;

  // Fields that are this device's own: its pictures, their sizes, and a
  // collection's cover (each device finds its own).
  const DEVICE = ["thumb", "bytes", "imageBytes", "missing", "cover", "coverFrom"];
  // Fields that come with the page's text, so the copy saved last wins
  // them all together.
  const CONTENT = ["url", "title", "site", "byline", "licence", "savedAt", "minutes", "lang", "dir", "mode", "images",
    "comic", "next", "prev", "requested", "series", "source", "file", "cut", "archived", "editedAt"];
  // Every field an index entry can carry through a backup or sync
  // (backup.cleanMeta); anything else on a page stays on its device.
  const SYNCED = new Set(["id", "url", "title", "site", "byline", "licence", "savedAt", "minutes", "lang", "dir", "mode", "images",
    "at", "finished", "readAt", "readOn", "placeAt", "spot", "comic", "next", "prev", "requested", "tags", "folder", "folderAt", "source", "series", "fav", "favAt", "folderFav", "folderFavAt", "file", "marks", "cut", "archived", "editedAt"]);
  // Where the reader is, which goes with whichever device moved it last:
  // placeAt (1.30.2), or readAt on entries from before it. Opening a clip
  // stamps readAt alone, so a device that opened one at an older place
  // no longer sends that place everywhere.
  const PLACE = ["at", "finished", "placeAt", "spot"];
  const placeTime = (p) => p.placeAt || p.readAt || 0;
  // Which copy of a page's text this is: when it was saved, or edited
  // since in Edit clips (1.22.0), so an edit goes up like a save again.
  const ver = (p) => Math.max(p.savedAt || 0, p.editedAt || 0);
  // Where you got to in a clip, from the library entry another device
  // wrote, onto this device's own copy of a different version (1.39.1).
  // The spot names a paragraph of the other version's text, so a place
  // that came over goes by its fraction.
  const READING = ["at", "finished", "readAt", "readOn", "placeAt"];
  function placeOnly(have, m, sameText) {
    const next = { ...have };
    for (const k of READING) { if (m[k] === undefined) delete next[k]; else next[k] = m[k]; }
    if (sameText) { if (m.spot === undefined) delete next.spot; else next.spot = m.spot; }
    else if (placeTime(m) !== placeTime(have)) delete next.spot;
    return READING.some((k) => next[k] !== have[k]) || next.spot !== have.spot ? next : null;
  }

  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const keep = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  let cfg = load(CFG_KEY, null);

  // ---- Merging (pure, tested in test/sync.test.js) ----

  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  // A sync of a big library is a few long steps (a copy of every page,
  // the merge, the comparison); a tap between them is answered (1.2.0).
  const breathe = () => new Promise((go) => setTimeout(go, 0));
  const share = (p) => { const o = { ...p }; for (const k of DEVICE) delete o[k]; return o; };
  // A clip's address without its fragment or trailing slash: how two
  // copies of a page are told to be the same page.
  const urlKey = (u) => (u ? u.split("#")[0].replace(/\/$/, "") : "");
  const sameUrl = (a, b) => !!(a && b && urlKey(a) === urlKey(b));

  // ---- The merge on a worker (1.2.1) ----
  // A big library's merge (every page cleaned as GitHub holds it, the
  // three-way merge, the comparison) ran on the main thread, between
  // yields. On a worker it never holds a tap; where there is no worker
  // (a test, an old browser) it runs here as before.
  const SELF = typeof document !== "undefined" && document.currentScript ? document.currentScript.src : "";
  let worker = null, seq = 0;
  const jobs = new Map();
  function helper() {
    if (worker || worker === false) return worker;
    try {
      if (typeof Worker === "undefined" || !SELF) { worker = false; return worker; }
      worker = new Worker(SELF.replace(/sync\.js(\?[^#]*)?$/, "sync-worker.js$1"));
      worker.onmessage = (e) => {
        const got = e.data || {};
        const job = jobs.get(got.id);
        if (!job) return;
        jobs.delete(got.id);
        if (got.error) job.reject(new Error(got.error)); else job.resolve(got);
      };
      worker.onerror = () => {
        for (const job of jobs.values()) job.reject(new Error("worker"));
        jobs.clear();
        try { worker.terminate(); } catch (e) { /* gone */ }
        worker = false;
      };
    } catch (e) { worker = false; }
    return worker;
  }
  function ask(msg) {
    const w = helper();
    if (!w) return null;
    return new Promise((resolve, reject) => {
      const id = ++seq;
      jobs.set(id, { resolve, reject });
      try { w.postMessage({ ...msg, id }); } catch (e) { jobs.delete(id); worker.onerror(); reject(e); }
    });
  }
  // The merge, on the worker when there is one.
  async function mergeOff(before, base, remote, waiting, feeds, feedsSeen, now, sameUrlFn, urlKeyFn) {
    const here = () => {
      const view = before.map((p) => share(C.backup.cleanMeta(p, p.id) || p));
      const remoteDoc = remote ? clean(remote) : null;
      return { merged: merge(base, { pages: view, waiting, feeds, feedsSeen }, remoteDoc, now, sameUrlFn, urlKeyFn), remoteDoc };
    };
    // The worker merges with sync's own address rule; any other stays here.
    if (sameUrlFn !== sameUrl || urlKeyFn !== urlKey) return here();
    const off = ask({ op: "merge", before, base, remote, waiting, feeds, feedsSeen, now });
    if (!off) return here();
    try { return await off; } catch (e) { return here(); }
  }
  async function sameOff(a, b) {
    const off = ask({ op: "same", a, b });
    if (!off) return same(a, b);
    try { return (await off).same; } catch (e) { return same(a, b); }
  }

  // Tags: what both have, and what either added; a tag either removed goes.
  function mergeTags(b, l, r) {
    const key = (t) => String(t).toLowerCase();
    const B = new Set((b || []).map(key)), L = new Map((l || []).map((t) => [key(t), t])), R = new Map((r || []).map((t) => [key(t), t]));
    const out = [];
    for (const [k, t] of L) if (R.has(k) || !B.has(k)) out.push(t);
    for (const [k, t] of R) if (!L.has(k) && !B.has(k)) out.push(t);
    return out;
  }

  // Highlights (1.7.0), by id like tags: what either added stays, what
  // either removed goes, and one changed on both keeps the later change.
  function mergeMarks(b, l, r) {
    const B = new Set((b || []).map((m) => m.id)), L = new Map((l || []).map((m) => [m.id, m])), R = new Map((r || []).map((m) => [m.id, m]));
    const out = [];
    for (const [id, m] of L) {
      if (R.has(id)) out.push((R.get(id).at || 0) > (m.at || 0) ? R.get(id) : m);
      else if (!B.has(id)) out.push(m);
    }
    for (const [id, m] of R) if (!L.has(id) && !B.has(id)) out.push(m);
    return out.sort((x, y) => x.block - y.block || x.start - y.start);
  }

  // One page changed on both sides since the base.
  function mergeEntry(b, l, r) {
    b = b || {};
    const out = {};
    const keys = new Set([...Object.keys(l), ...Object.keys(r)]);
    const pick = (k) => (same(l[k], r[k]) || !same(l[k], b[k]) ? l[k] : r[k]);
    const contentFrom = ver(r) > ver(l) ? r : l;
    const readFrom = (r.readAt || 0) > (l.readAt || 0) ? r : l;
    const placeFrom = placeTime(r) > placeTime(l) ? r : l;
    for (const k of keys) {
      if (CONTENT.includes(k)) out[k] = ver(l) !== ver(r) ? contentFrom[k] : pick(k);
      else if (k === "readOn" || k === "readAt") out[k] = readFrom[k];
      // Where you are goes with the side read last (1.21.0). Three ways
      // only when both were read at the same time: a library that went
      // back (an older copy on disk) read as a change made here, and sent
      // the old place everywhere.
      else if (PLACE.includes(k)) out[k] = placeTime(l) !== placeTime(r) ? placeFrom[k]
        : same(l[k], r[k]) ? l[k] : same(l[k], b[k]) ? r[k] : same(r[k], b[k]) ? l[k] : placeFrom[k];
      else if (k === "tags") out[k] = mergeTags(b.tags, l.tags, r.tags);
      else if (k === "marks") out[k] = mergeMarks(b.marks, l.marks, r.marks);
      else out[k] = pick(k);
    }
    for (const k of Object.keys(out)) if (out[k] === undefined || ((k === "tags" || k === "marks") && !out[k].length)) delete out[k];
    // A favourite's time goes with the mark.
    if (!out.fav) delete out.favAt;
    if (!out.folderFav) delete out.folderFavAt;
    return out;
  }

  // Two copies of one address, saved separately on two devices: the one
  // saved last stays, with the other's tags, favourite and reading.
  // `key(url)` names the address a page is known by, so a library of
  // hundreds is one pass (1.2.0); without one each page is compared with
  // every other through `same`.
  function oneCopyEach(pages, deleted, now, same, key) {
    const kept = [];
    const at = key ? new Map() : null;
    for (const p of pages) {
      let i;
      if (at) { const k = key(p.url); i = at.has(k) ? at.get(k) : -1; if (i < 0) at.set(k, kept.length); }
      else i = kept.findIndex((x) => same(x.url, p.url));
      if (i < 0) { kept.push(p); continue; }
      const [win, lose] = ver(p) > ver(kept[i]) ? [{ ...p }, kept[i]] : [{ ...kept[i] }, p];
      const tags = mergeTags([], win.tags, lose.tags);
      if (tags.length) win.tags = tags;
      const marks = mergeMarks([], win.marks, lose.marks);
      if (marks.length) win.marks = marks;
      if (lose.fav && !win.fav) { win.fav = true; win.favAt = lose.favAt; }
      const moveOver = (ks) => { for (const k of ks) { if (lose[k] === undefined) delete win[k]; else win[k] = lose[k]; } };
      if (placeTime(lose) > placeTime(win)) moveOver(PLACE);
      if ((lose.readAt || 0) > (win.readAt || 0)) moveOver(["readAt", "readOn"]);
      if (!win.folder && lose.folder) {
        win.folder = lose.folder; win.folderAt = lose.folderAt;
        if (lose.folderFav) { win.folderFav = true; win.folderFavAt = lose.folderFavAt; }
      }
      kept[i] = win;
      deleted[lose.id] = now;
    }
    return kept;
  }

  // Followed feeds (0.30.1): what's followed and how, never the posts,
  // which each device checks for itself. Keyed by the feed's address.
  const FEED = ["url", "title", "link", "icon", "mode", "images", "folder", "days", "addedAt"];
  const feedShare = (f) => { const o = {}; for (const k of FEED) if (f[k] != null && f[k] !== "") o[k] = f[k]; return o; };
  // An unfollow is kept like a deleted page; following the same address
  // again later (a newer addedAt) brings it back.
  function mergeFeeds(base, local, remote, gone, now) {
    const B = new Map((base || []).map((f) => [f.url, f]));
    const L = new Map((local || []).map((f) => [f.url, feedShare(f)]));
    const R = new Map((remote || []).map((f) => [f.url, f]));
    for (const u of B.keys()) if (!L.has(u)) gone[u] = gone[u] || now;
    if (remote) for (const u of B.keys()) if (!R.has(u) && !gone[u]) gone[u] = now;
    const out = [];
    for (const u of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(u), r = R.get(u);
      const newest = Math.max((l && l.addedAt) || 0, (r && r.addedAt) || 0);
      if (gone[u] && newest > gone[u] && !B.has(u)) delete gone[u];
      if (gone[u]) continue;
      if (l && r) {
        const b = B.get(u) || {}, f = {};
        for (const k of FEED) { const v = same(l[k], r[k]) || !same(l[k], b[k]) ? l[k] : r[k]; if (v !== undefined) f[k] = v; }
        out.push(f);
      } else out.push(l || r);
    }
    for (const [u, at] of Object.entries(gone)) if (now - at > KEEP_DELETED) delete gone[u];
    return out.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0) || (a.url < b.url ? -1 : 1));
  }

  // base, local and remote are library files ({ pages, deleted, files });
  // base and remote may be null (never synced, nothing on GitHub yet).
  // Resolves to the merged file. `same(a, b)` says two addresses are one
  // page.
  function merge(base, local, remote, now = Date.now(), sameUrl = (a, b) => a === b, urlKey) {
    const B = new Map(((base && base.pages) || []).map((p) => [p.id, p]));
    const L = new Map(local.pages.map((p) => [p.id, share(p)]));
    const R = new Map(((remote && remote.pages) || []).map((p) => [p.id, p]));
    const deleted = { ...((remote && remote.deleted) || {}) };
    for (const [id, at] of Object.entries((base && base.deleted) || {})) if (!deleted[id]) deleted[id] = at;
    // Gone from here since the base: deleted on this device.
    for (const id of B.keys()) if (!L.has(id) && !(local.waiting || []).includes(id)) deleted[id] = deleted[id] || now;
    // Gone from GitHub since the base, without a tombstone: deleted there.
    if (remote) for (const id of B.keys()) if (!R.has(id) && !deleted[id]) deleted[id] = now;
    // Restored from a backup after it was deleted (1.46.0): the restore
    // is the newer choice, here and on every other device.
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      const back = Math.max((L.get(id) || {}).back || 0, (R.get(id) || {}).back || 0);
      if (deleted[id] && back > deleted[id]) delete deleted[id];
    }
    const pages = [];
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      if (deleted[id]) continue;
      const l = L.get(id), r = R.get(id);
      if (l && r) pages.push(same(l, r) ? l : mergeEntry(B.get(id), l, r));
      else if (l) pages.push(l);
      else pages.push(r);
    }
    for (const [id, at] of Object.entries(deleted)) if (now - at > KEEP_DELETED) delete deleted[id];
    const out = oneCopyEach(pages, deleted, now, sameUrl, urlKey).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0) || (a.id < b.id ? -1 : 1));
    const files = {};
    const fromRemote = (remote && remote.files) || {};
    for (const p of out) if (fromRemote[p.id]) files[p.id] = fromRemote[p.id];
    const doc = { format: 1, pages: out, deleted, files };
    // A device from before 0.30.1 sends no feeds: they stay as they were.
    if (local.feeds) {
      const gone = { ...((remote && remote.feedsGone) || {}) };
      for (const [u, at] of Object.entries((base && base.feedsGone) || {})) if (!gone[u]) gone[u] = at;
      doc.feeds = mergeFeeds(base && base.feeds, local.feeds, remote && remote.feeds, gone, now);
      doc.feedsGone = gone;
    } else if (remote && remote.feeds) { doc.feeds = remote.feeds; doc.feedsGone = remote.feedsGone || {}; }
    // When Feeds was last looked at on any device (0.30.10), so a post seen
    // on one isn't counted new on another. The latest wins.
    const seen = Math.max(local.feedsSeen || 0, (remote && remote.feedsSeen) || 0);
    if (seen) doc.feedsSeen = seen;
    return doc;
  }

  // ---- GitHub ----

  const b64encode = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64decode = (s) => decodeURIComponent(escape(atob(s.replace(/\s/g, ""))));
  const headers = (extra) => Object.assign({ Authorization: "Bearer " + cfg.token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, extra || {});
  const contents = (path) => API + "/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;

  class SyncError extends Error {}
  // Paused part way (0.30.4): what was done so far stays, the rest waits.
  class Paused extends Error {}
  const halt = () => { if (cfg && cfg.paused) throw new Paused(); };
  async function fail(r) {
    let msg = "";
    try { msg = (await r.json()).message || ""; } catch (e) { /* none */ }
    const e = new SyncError(r.status === 401 ? "GitHub didn't accept the token. Make a new one and connect again."
      : (r.status === 403 || r.status === 429) && /rate limit/i.test(msg) ? "GitHub asked Waypage to slow down. Sync tries again in a few minutes."
      : r.status === 403 || r.status === 404 ? "The token can't reach the " + REPO + " repo. Give it Contents: Read and write on that repo."
      : r.status >= 500 ? "GitHub isn't answering right now. Sync tries again later."
      : "GitHub said: " + (msg || r.status));
    e.status = r.status;
    return e;
  }
  async function call(url, opts) {
    let r;
    try { r = await fetch(url, Object.assign({ cache: "no-store" }, opts)); }
    catch (e) { throw new SyncError("You're offline. Sync tries again when you're back online."); }
    return r;
  }

  // A look at the library on GitHub without a sync (1.3.0): for the
  // furthest-read check when a clip opens, and for the poll while the app
  // is in front. Asked with the ETag of the last answer, so an unchanged
  // library is a 304 that GitHub doesn't count against the rate limit.
  // Resolves to { pages, text, changed } or null when there is none.
  let peeked = null;
  async function peek() {
    if (!cfg || cfg.paused) return null;
    const h = headers({ Accept: "application/vnd.github.object+json" });
    if (peeked && peeked.etag) h["If-None-Match"] = peeked.etag;
    const r = await call(contents("library.json") + "?ref=" + encodeURIComponent(cfg.branch), { headers: h });
    if (r.status === 304 && peeked) return { ...peeked, changed: false };
    if (r.status === 404) { peeked = null; return null; }
    if (!r.ok) throw await fail(r);
    const j = await r.json();
    let b64 = j.content;
    if (!b64 && j.size) {
      const br = await call(API + "/repos/" + cfg.owner + "/" + cfg.repo + "/git/blobs/" + j.sha, { headers: headers() });
      if (!br.ok) throw await fail(br);
      b64 = (await br.json()).content;
    }
    if (!b64) return null;
    const text = b64decode(b64);
    let data;
    try { data = JSON.parse(text); } catch (e) { return null; }
    const pages = data && Array.isArray(data.pages) ? data.pages : [];
    const changed = !peeked || peeked.sha !== j.sha;
    peeked = { etag: r.headers.get("ETag") || "", sha: j.sha, pages, text };
    return { ...peeked, changed };
  }
  // Whether the library on GitHub differs from what this device last
  // synced; cheap when nothing moved.
  async function poll() {
    const got = await peek();
    if (!got) return false;
    let baseText = null;
    try { baseText = localStorage.getItem(BASE_KEY); } catch (e) { baseText = null; }
    return got.text !== baseText;
  }

  // { data, sha } or null. Files past 1 MB come as a blob, as in LifeLog.
  async function readJson(path) {
    const r = await call(contents(path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers({ Accept: "application/vnd.github.object+json" }) });
    if (r.status === 404) return null;
    if (!r.ok) throw await fail(r);
    const j = await r.json();
    let b64 = j.content;
    if (!b64 && j.size) {
      const br = await call(API + "/repos/" + cfg.owner + "/" + cfg.repo + "/git/blobs/" + j.sha, { headers: headers() });
      if (!br.ok) throw await fail(br);
      b64 = (await br.json()).content;
    }
    if (!b64) return null;
    return { data: JSON.parse(b64decode(b64)), sha: j.sha };
  }
  async function readBytes(path) {
    const r = await call(contents(path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers({ Accept: "application/vnd.github.raw" }) });
    if (!r.ok) throw await fail(r);
    return new Uint8Array(await r.arrayBuffer());
  }
  async function readText(path) {
    const r = await call(contents(path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers({ Accept: "application/vnd.github.raw" }) });
    if (r.status === 404) return null;
    if (!r.ok) throw await fail(r);
    return r.text();
  }
  async function write(path, text, sha, message, bytes) {
    const body = { message, content: bytes ? C.store.toBase64(bytes) : b64encode(text), branch: cfg.branch };
    if (sha) body.sha = sha;
    const r = await call(contents(path), { method: "PUT", headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    if (!r.ok) throw await fail(r);
    return (await r.json()).content.sha;
  }
  // Writes a file whether or not this device knew its sha: one already
  // there under another is asked for and written again.
  async function put(path, text, sha, message, bytes) {
    try { return await write(path, text, sha, message, bytes); }
    catch (e) {
      if (e.status !== 409 && e.status !== 422) throw e;
      const now = await call(contents(path) + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers({ Accept: "application/vnd.github.object+json" }) });
      if (!now.ok) throw await fail(now);
      return write(path, text, (await now.json()).sha, message, bytes);
    }
  }
  async function remove(path, sha) {
    const r = await call(contents(path), { method: "DELETE", headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: "Remove " + path, sha, branch: cfg.branch }) });
    if (!r.ok && r.status !== 404 && r.status !== 409 && r.status !== 422) throw await fail(r);
  }

  // ---- Sending in batches (1.15.0) ----
  // A first sync sent each clip with its own Contents PUT, each its own
  // commit, one after another. Now up to BATCH clips' text goes inline in
  // one tree, then one commit and one move of the branch. A branch that
  // moved meanwhile (another device synced) gets the tree and commit made
  // again on its new head; pictures already sent as blobs stay sent.
  const BATCH = 50;
  const BATCH_BYTES = 8 * 1024 * 1024;
  const utf8 = (t) => new TextEncoder().encode(t);
  // The sha GitHub gives a file's contents, worked out here, since a tree
  // made with inline text doesn't say it for files in a folder.
  async function blobSha(bytes) {
    const head = utf8("blob " + bytes.length + "\0");
    const all = new Uint8Array(head.length + bytes.length);
    all.set(head);
    all.set(bytes, head.length);
    const h = new Uint8Array(await crypto.subtle.digest("SHA-1", all));
    return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function git(path, opts) {
    const r = await call(API + "/repos/" + cfg.owner + "/" + cfg.repo + "/git/" + path,
      Object.assign({ headers: headers({ "Content-Type": "application/json" }) }, opts));
    if (!r.ok) throw await fail(r);
    return r.json();
  }
  // files: [{ path, text } | { path, sha }], sha null removing it.
  async function commitFiles(files, message) {
    const tree = files.map((f) => (f.text != null ? { path: f.path, mode: "100644", type: "blob", content: f.text }
      : { path: f.path, mode: "100644", type: "blob", sha: f.sha }));
    for (let tries = 0; ; tries++) {
      halt();
      const head = (await git("ref/heads/" + encodeURIComponent(cfg.branch))).object.sha;
      const base = (await git("commits/" + head)).tree.sha;
      const made = await git("trees", { method: "POST", body: JSON.stringify({ base_tree: base, tree }) });
      const commit = await git("commits", { method: "POST", body: JSON.stringify({ message, tree: made.sha, parents: [head] }) });
      try {
        await git("refs/heads/" + encodeURIComponent(cfg.branch), { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
        return;
      } catch (e) {
        if (e.status !== 422 || tries >= 3) throw e;
      }
    }
  }
  // Sends `list` ([{ p, html, packs, was }]) a batch at a time; `sent(p,
  // file)` is told of each page once its batch is on GitHub.
  async function sendBatches(list, sent, onProgress, total, from) {
    let i = 0;
    while (i < list.length) {
      const batch = [];
      let bytes = 0;
      while (i < list.length && batch.length < BATCH && (!batch.length || bytes + list[i].text.length < BATCH_BYTES)) {
        batch.push(list[i]);
        bytes += list[i].text.length;
        i++;
      }
      const files = [];
      for (const b of batch) {
        b.packShas = [];
        for (const [k, bytes] of b.packs.entries()) {
          halt();
          const blob = await git("blobs", { method: "POST", body: JSON.stringify({ content: C.store.toBase64(bytes), encoding: "base64" }) });
          b.packShas.push(blob.sha);
          files.push({ path: "pages/" + b.p.id + "/pack-" + k, sha: blob.sha });
        }
        for (const [k] of ((b.was && b.was.packs) || []).entries()) if (k >= b.packs.length) files.push({ path: "pages/" + b.p.id + "/pack-" + k, sha: null });
        // Where the WebView has no SHA-1 of its own, the text goes as a blob
        // too, which says its sha.
        if (globalThis.crypto && crypto.subtle) {
          b.sha = await blobSha(utf8(b.text));
          files.push({ path: "pages/" + b.p.id + ".html", text: b.text });
        } else {
          halt();
          b.sha = (await git("blobs", { method: "POST", body: JSON.stringify({ content: b.text, encoding: "utf-8" }) })).sha;
          files.push({ path: "pages/" + b.p.id + ".html", sha: b.sha });
        }
      }
      await commitFiles(files, batch.length === 1 ? "Page: " + batch[0].p.title.slice(0, 60) : "Pages: " + batch.length + " clips");
      for (const b of batch) sent(b);
      if (onProgress) onProgress({ stage: "up", done: from + i, total });
    }
  }

  // Connecting: whose token it is, and the repo, made private if missing.
  // ---- Setting up (0.30.1) ----

  // The repo is made first, private (1.29.1), so the token can be for it
  // alone: a token for All repositories that could also make and rename
  // repos reached everything on the account, this app's own code too.
  // GitHub's page for a new key, filled in: a fine-grained token that never
  // expires (sync shouldn't stop in a month) that writes the repo
  // (Contents). Which repo it reaches can't be filled in, so the steps say
  // to pick it.
  const NEW_REPO_URL = "https://github.com/new?name=" + REPO + "&visibility=private&description=Waypage%27s+library";
  const KEY_URL = "https://github.com/settings/personal-access-tokens/new?name=Waypage+sync" +
    "&description=Keeps+Waypage%27s+library+in+step+through+a+private+repo+called+" + REPO +
    "&expires_in=none&contents=write";
  const PUBLIC_REPO = "Your " + REPO + " repo is public, so anyone could read your library. Sync is stopped until you make it private on GitHub, in the repo's Settings.";
  // Another device joins from a link to the web copy with the token after
  // the # (which a browser never sends to the server), as LifeLog's setup
  // link does; the app takes the same link from a QR code or pasted.
  const tokenIn = (text) => {
    const m = /[#&]t=([^&\s]+)/.exec(String(text || ""));
    try { return m ? decodeURIComponent(m[1]) : null; } catch (e) { return null; }
  };
  const setupLink = (base) => (cfg ? base + "#t=" + encodeURIComponent(cfg.token) : null);

  async function connect(token) {
    const was = cfg;
    cfg = { token: String(tokenIn(token) || token || "").trim(), repo: REPO, branch: "main" };
    try {
      if (!cfg.token) throw new SyncError("Paste the token first.");
      const me = await call(API + "/user", { headers: headers() });
      if (!me.ok) throw await fail(me);
      cfg.owner = (await me.json()).login;
      let repo = await call(API + "/repos/" + cfg.owner + "/" + REPO, { headers: headers() });
      if (repo.status === 404) repo = await adoptOld();
      if (repo.ok) {
        const j = await repo.json();
        if (j.private === false) throw new SyncError(PUBLIC_REPO);
        cfg.branch = j.default_branch || "main";
        cfg.repo = j.name || cfg.repo;
      }
      else if (repo.status === 404) {
        const made = await call(API + "/user/repos", { method: "POST", headers: headers({ "Content-Type": "application/json" }),
          body: JSON.stringify({ name: REPO, private: true, auto_init: true, description: "Waypage's library" }) });
        if (!made.ok) throw new SyncError("Waypage can't find your " + REPO + " repo. Make it in step 2, then make the token with only that repo picked.");
        cfg.branch = (await made.json()).default_branch || "main";
      } else throw await fail(repo);
      if (was && was.links) cfg.links = true;
      cfg.scoped = true;
      keep(CFG_KEY, cfg);
      keep(BASE_KEY, null);
      keep(WAIT_KEY, null);
      keep(SENT_KEY, null);
      return cfg.owner + "/" + cfg.repo;
    } catch (e) {
      cfg = was;
      throw e;
    }
  }
  function disconnect() {
    cfg = null;
    keep(CFG_KEY, null);
    keep(BASE_KEY, null);
    keep(WAIT_KEY, null);
    keep(SENT_KEY, null);
    keep(STATS_KEY, null);
  }

  // ---- A page's text going up and coming down ----

  // A clip made from a file of your own has no links to fetch its
  // pictures from again, so they go up with it, as long as they come to
  // less than this (0.32.0; 20 MB until 1.1.0). Since 1.1.0 they go in
  // packs beside the page (pages/<id>/pack-N), each under PACK, the page
  // naming each picture's pack, place and length: one write per pack, not
  // per picture (GitHub limits how many writes a minute), and nothing near
  // its 100 MB a file. Pages from before carry them inside as data:.
  const FILE_PICTURES = 100 * 1024 * 1024;
  const PACK = 16 * 1024 * 1024;
  const PACKED = /^sync:(\d+):(\d+):(\d+):([a-z]+\/[a-z+.-]+)$/;

  // The page's HTML with its pictures marked missing: the other device
  // gets them from the site itself. A file's clip takes its pictures with
  // it instead, when they're small enough.
  // The page as it goes up, and the packs of a file's clip's pictures:
  // { html, packs: [Uint8Array] }.
  async function outgoing(html, entry) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const carry = !!(entry && entry.file) && (entry.imageBytes || 0) <= FILE_PICTURES;
    const packs = [];
    let pack = [], size = 0;
    const close = () => { if (!pack.length) return; const all = new Uint8Array(size); let at = 0; for (const b of pack) { all.set(b, at); at += b.length; } packs.push(all); pack = []; size = 0; };
    for (const img of doc.querySelectorAll("img[src]")) {
      // A local picture, or one a browser keeps inside the page.
      const src = img.getAttribute("src");
      const inside = /^data:image\//.test(src);
      if (!LOCAL.test(src) && !(inside && (carry || img.hasAttribute("data-full") || img.hasAttribute("data-thumb")))) continue;
      if (carry && (LOCAL.test(src) || inside)) {
        try {
          const bytes = inside ? Uint8Array.from(atob(src.split(",")[1].replace(/\s+/g, "")), (c) => c.charCodeAt(0)) : await C.store.readBytes(entry.id, src);
          if (size && size + bytes.length > PACK) close();
          img.setAttribute("src", "sync:" + packs.length + ":" + size + ":" + bytes.length + ":" + (C.backup.imageType(bytes) || "image/jpeg"));
          pack.push(bytes);
          size += bytes.length;
          continue;
        } catch (e) { /* gone: missing, like any other */ }
      }
      img.removeAttribute("src");
      img.className = "co-missing";
    }
    close();
    for (const v of doc.querySelectorAll("video[poster]")) if (LOCAL.test(v.getAttribute("poster"))) v.removeAttribute("poster");
    return { html: "<!doctype html>\n" + doc.documentElement.outerHTML, packs };
  }

  // A page from GitHub, ready to keep: pictures as links where this device
  // keeps none (a browser, or a page saved as Links), else left missing for
  // the downloads after. Resolves to { html, missing }.
  async function incoming(html, entry) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const asLinks = !C.platform.native || entry.mode === "links";
    let missing = 0;
    // Packed pictures (1.1.0) come down a pack at a time: into files
    // beside the page on a phone, into the page itself in a browser.
    const packed = [...doc.querySelectorAll('img[src^="sync:"]')];
    if (packed.length) {
      const got = new Map();
      let n = 0, bytes = 0;
      for (const img of packed) {
        const m = img.getAttribute("src").match(PACKED);
        let b = null;
        if (m) {
          const k = Number(m[1]);
          if (!got.has(k)) got.set(k, await readBytes("pages/" + entry.id + "/pack-" + k).catch(() => null));
          const all = got.get(k);
          if (all && Number(m[2]) + Number(m[3]) <= all.length) b = all.subarray(Number(m[2]), Number(m[2]) + Number(m[3]));
        }
        if (!b) { img.removeAttribute("src"); img.className = "co-missing"; continue; }
        if (C.platform.native) {
          const rel = "images/" + n++ + "." + (m[4].split("/")[1] || "jpg").replace("jpeg", "jpg").replace(/\+.*/, "");
          await C.store.writeBytes(entry.id, rel, b);
          img.setAttribute("src", rel);
        } else img.setAttribute("src", "data:" + m[4] + ";base64," + C.store.toBase64(b));
        bytes += b.length;
      }
      entry.imageBytes = bytes;
    }
    // A file's clip from before 1.1.0 brought its pictures inside the
    // page; on a phone they go back into files beside it, so the page
    // itself stays small.
    if (entry.file && C.platform.native) {
      let n = 0, bytes = 0;
      for (const img of doc.querySelectorAll('img[src^="data:image/"]')) {
        const src = img.getAttribute("src");
        const [head, b64] = src.split(",");
        const ext = (head.match(/image\/(\w+)/) || [])[1].replace("jpeg", "jpg");
        try {
          const bin = Uint8Array.from(atob(b64.replace(/\s+/g, "")), (c) => c.charCodeAt(0));
          const rel = "images/" + n++ + "." + ext;
          await C.store.writeBytes(entry.id, rel, bin);
          img.setAttribute("src", rel);
          bytes += bin.length;
        } catch (e) { img.removeAttribute("src"); img.className = "co-missing"; }
      }
      if (n) entry.imageBytes = bytes;
    }
    for (const img of doc.querySelectorAll("img.co-missing")) {
      const url = img.getAttribute("data-preview") || img.getAttribute("data-full") || img.getAttribute("data-thumb") || "";
      if (asLinks && /^https?:/.test(url)) { img.setAttribute("src", url); img.removeAttribute("class"); }
      else missing++;
    }
    return { html: "<!doctype html>\n" + doc.documentElement.outerHTML, missing };
  }

  // ---- A sync ----

  let running = null;
  let last = { at: (cfg && cfg.at) || 0, error: "" };
  // Where a sync is: { stage: "check" | "up" | "down", done, total }.
  let progress = null;

  // Brings this device and GitHub level. `getPages()` is the library now;
  // `setPages(list)` takes the result; `sameUrl(a, b)` says two addresses
  // are one page. onProgress({ stage, done, total }). Resolves to
  // { up, down, removed, downloads, fromLinks } with `downloads` the pages
  // whose pictures this device fetches next and `fromLinks` the pages it
  // saves itself from their links; throws SyncError.
  // Carry-on's carryon-data becomes waypage-data (1.0.0): renamed when the
  // token may (one made before 1.29.1 has Administration: write),
  // used as it is when not. Resolves to the repo's response, or the 404.
  async function adoptOld() {
    const old = await call(API + "/repos/" + cfg.owner + "/" + OLD_REPO, { headers: headers() });
    if (!old.ok) return old;
    const moved = await call(API + "/repos/" + cfg.owner + "/" + OLD_REPO, { method: "PATCH",
      headers: headers({ "Content-Type": "application/json" }), body: JSON.stringify({ name: REPO, description: "Waypage's library" }) });
    if (moved.ok) cfg.repo = REPO;
    else cfg.repo = OLD_REPO;
    return moved.ok ? moved : old;
  }
  // A copy set up under Carry-on still names carryon-data: once a phone has
  // renamed it, GitHub answers the old name with the new one. Once a day
  // it also checks the repo is still private (1.29.1): true when it isn't,
  // and nothing goes up.
  async function settle() {
    if (!cfg || (cfg.repo === REPO && cfg.looked > Date.now() - DAY)) return false;
    const r = await call(API + "/repos/" + cfg.owner + "/" + cfg.repo, { headers: headers() });
    if (!r.ok) return false;
    const j = await r.json();
    if (j.name && j.name !== cfg.repo) cfg.repo = j.name;
    if (j.private === false) return true;
    cfg.looked = Date.now();
    keep(CFG_KEY, cfg);
    return false;
  }

  function run({ getPages, setPages, getFeeds, setFeeds, getSeen, setSeen, sameUrl, urlKey, onProgress, light }) {
    if (!cfg || cfg.paused) return Promise.resolve(null);
    if (running) return running;
    const told = (p) => { progress = p; if (onProgress) onProgress(p); };
    running = (async () => {
      try {
        if (await settle().catch(() => false)) throw new SyncError(PUBLIC_REPO);
        const res = await once(getPages, setPages, sameUrl || ((a, b) => a === b), told, getFeeds, setFeeds, getSeen, setSeen, urlKey, !!light);
        last = { at: Date.now(), error: "" };
        if (light) last.light = true;
        cfg.at = last.at;
        keep(CFG_KEY, cfg);
        return res;
      } catch (e) {
        if (e instanceof Paused) return null;
        last = { at: last.at, error: e instanceof SyncError ? e.message : "Sync stopped: " + (e && e.message ? e.message : e) };
        throw e;
      } finally { running = null; progress = null; }
    })();
    // Told once `running` is set, so what it draws says Syncing.
    if (!progress) told({ stage: "check", done: 0, total: 0 });
    return running;
  }

  async function once(getPages, setPages, sameUrl, onProgress, getFeeds, setFeeds, getSeen, setSeen, urlKey, light) {
    // A library Waypage can't reach reads as empty; sent as it is, that
    // would look like every clip deleted (0.33.0).
    if (C.store.problem) throw new Error(C.store.problem);
    const before = getPages().map((p) => ({ ...p }));
    const feedsBefore = getFeeds ? getFeeds().map(feedShare) : null;
    const snapshot = new Map(before.map((p) => [p.id, JSON.stringify(p)]));
    await breathe();
    // Pages a run sent before it was cut off (the app closed or updated)
    // count as sent: library.json goes up only once they all have, so
    // without this every one went again from the first (1.13.0).
    const uploaded = load(SENT_KEY, {});
    const waiting = load(WAIT_KEY, []);
    // Links only (0.30.3): this device sends no text and takes none; pages
    // new to it are saved again from their links, here.
    const links = !!cfg.links;
    const byId = new Map(before.map((p) => [p.id, p]));
    // What came down so far goes into the library every few pages, so a
    // run cut off part way keeps them (1.13.0).
    const settleSome = async (some, final) => {
      const live = getPages();
      const out = [], took = new Set();
      for (const p of live) {
        const d = some.get(p.id);
        if (!snapshot.has(p.id) || !some.has(p.id)) out.push(p);
        else if (snapshot.get(p.id) !== JSON.stringify(p)) {
          if (d && ver(d) !== ver(p)) { const both = { ...p }; for (const k of CONTENT.concat(DEVICE)) { if (d[k] === undefined) delete both[k]; else both[k] = d[k]; } out.push(both); }
          else out.push(p);
        } else if (d) { out.push(d); took.add(p.id); }
      }
      for (const [id, d] of some) if (d && !live.some((p) => p.id === id)) { out.push(d); took.add(id); }
      out.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      if (!final) { await setPages(out); return took; }
      const kept = new Set(out.map((p) => p.id));
      const gone = [...some].filter(([id, d]) => d === null && !kept.has(id)).map(([id]) => id);
      return { out, gone };
    };
    // Where you got to comes first (1.24.1): the clips this device already
    // has take the other devices' places, Continue reading and the rest
    // as soon as library.json is read, before any text goes up or comes
    // down. Marked as seen, so the settles after don't take them for
    // changes made here meanwhile.
    const placesFirst = async (merged) => {
      const early = new Map();
      for (const m of merged.pages) {
        const have = byId.get(m.id);
        if (!have || !(ver(have) === ver(m) || links)) continue;
        const next = { ...m };
        for (const k of Object.keys(have)) if (DEVICE.includes(k) || !SYNCED.has(k)) next[k] = have[k];
        if (JSON.stringify(next) !== JSON.stringify(have)) early.set(m.id, next);
      }
      if (!early.size) return;
      // Only the clips that took the early place count as seen: one read
      // on meanwhile keeps its change, which the last settle would
      // otherwise have put back to where this sync started (1.36.1).
      const took = await settleSome(early, false);
      for (const p of getPages()) if (took.has(p.id)) snapshot.set(p.id, JSON.stringify(p));
    };
    let up = 0;
    let merged, remote;
    for (let tries = 0; ; tries++) {
      remote = await readJson("library.json");
      if (remote && (!remote.data || !Array.isArray(remote.data.pages))) throw new SyncError("The library.json on GitHub isn't Waypage's. Move it away and sync again.");
      await breathe();
      // What GitHub would hold of each page, so the two compare like for
      // like; then the merge, off the main thread where it can be.
      const got = await mergeOff(before, load(BASE_KEY, null), remote ? remote.data : null, waiting, feedsBefore, getSeen ? getSeen() : 0, Date.now(), sameUrl, urlKey);
      merged = got.merged;
      const remoteDoc = got.remoteDoc;
      if (tries === 0 && remote && !light) await placesFirst(merged);
      // Places and stats only (1.40.0), on mobile data: where you got to
      // comes over onto every clip here and goes up onto every clip GitHub
      // has, and nothing else moves. New clips, their text, deletions,
      // tags and collections wait for the full sync on Wi-Fi, so the base
      // and the waiting lists stay as they were.
      if (light) {
        if (tries === 0) {
          const early = new Map();
          for (const m of merged.pages) {
            const have = byId.get(m.id);
            const next = have && placeOnly(have, m, ver(have) === ver(m));
            if (next) early.set(m.id, next);
          }
          if (early.size) await settleSome(early, false);
        }
        if (!remote) break;
        const doc = placesOnto(remoteDoc, merged);
        if (await sameOff(doc, remoteDoc)) break;
        halt();
        try { await write("library.json", JSON.stringify(doc), remote.sha, "Places: " + merged.pages.length + " pages"); break; } catch (e) {
          if ((e.status !== 409 && e.status !== 422) || tries >= 3) throw e;
        }
        continue;
      }
      for (const [id, f] of Object.entries(uploaded)) if (merged.pages.some((p) => p.id === id && ver(p) === f.at)) merged.files[id] = f;
      // Text this device has and GitHub doesn't: every page saved here, or
      // saved again since.
      const mine = new Map(before.map((p) => [p.id, p]));
      const todo = links ? [] : merged.pages.filter((p) => mine.has(p.id) && ver(mine.get(p.id)) === ver(p) && (!merged.files[p.id] || merged.files[p.id].at !== ver(p)));
      const sentOne = (p, sha, packShas) => {
        merged.files[p.id] = uploaded[p.id] = { at: ver(p), sha };
        if (packShas.length) merged.files[p.id].packs = packShas;
        keep(SENT_KEY, uploaded);
        up++;
      };
      // A few at a time through the Git Data API (1.15.0) when there are
      // more than a couple; read ahead a batch at a time, so a library of
      // thousands isn't all in memory at once.
      let i = 0;
      if (todo.length > 2) {
        try {
          while (i < todo.length) {
            const ready = [];
            for (let n = 0; i < todo.length && n < BATCH; i++, n++) {
              halt();
              const p = todo[i];
              let html;
              try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
              if (!html) continue;
              const was = merged.files[p.id] || (remoteDoc && remoteDoc.files && remoteDoc.files[p.id]);
              const { html: text, packs } = await outgoing(html, mine.get(p.id));
              ready.push({ p, text, packs, was });
            }
            await sendBatches(ready, (b) => sentOne(b.p, b.sha, b.packShas), onProgress, todo.length, i - ready.length);
          }
        } catch (e) {
          // An empty repo has no branch to commit on: one by one, below.
          if (e.status !== 409) throw e;
          i = todo.findIndex((p) => !uploaded[p.id] || uploaded[p.id].at !== ver(p));
          if (i < 0) i = todo.length;
        }
      }
      for (const [k, p] of todo.slice(i).entries()) {
        halt();
        if (onProgress) onProgress({ stage: "up", done: i + k, total: todo.length });
        let html;
        try { html = await C.store.readPage(p.id); } catch (e) { html = null; }
        if (!html) continue;
        const was = merged.files[p.id] || (remoteDoc && remoteDoc.files && remoteDoc.files[p.id]);
        const { html: body, packs } = await outgoing(html, mine.get(p.id));
        // The packs first, so a page never names one that isn't there.
        const packShas = [];
        for (const [k, b] of packs.entries()) {
          halt();
          packShas.push(await put("pages/" + p.id + "/pack-" + k, null, was && was.packs && was.packs[k], "Pictures: " + p.title.slice(0, 50), b));
        }
        const sha = await put("pages/" + p.id + ".html", body, was && was.sha, "Page: " + p.title.slice(0, 60));
        for (const [k, s] of ((was && was.packs) || []).entries()) if (k >= packs.length) await remove("pages/" + p.id + "/pack-" + k, s).catch(() => {});
        sentOne(p, sha, packShas);
      }
      // Text of deleted pages goes too.
      const gone = Object.entries((remoteDoc && remoteDoc.files) || {}).filter(([id]) => merged.deleted[id]);
      for (const [id, f] of gone) {
        await remove("pages/" + id + ".html", f.sha).catch(() => {});
        for (const [k, s] of (f.packs || []).entries()) await remove("pages/" + id + "/pack-" + k, s).catch(() => {});
      }
      await breathe();
      if (remote && await sameOff(merged, remoteDoc)) { keep(SENT_KEY, null); break; }
      halt();
      try {
        await write("library.json", JSON.stringify(merged), remote && remote.sha, "Library: " + merged.pages.length + " pages");
        keep(SENT_KEY, null);
        break;
      } catch (e) {
        // Another device wrote first: merge with what it wrote, and again.
        if ((e.status !== 409 && e.status !== 422) || tries >= 3) throw e;
      }
    }
    if (light) {
      try { await syncStats(); } catch (e) { if (e instanceof Paused) throw e; }
      return { up: 0, down: 0, removed: 0, downloads: [], fromLinks: [], light: true };
    }
    // This device catches up: new pages' text comes down; deleted ones go.
    // `decided` is what each page becomes (null: removed).
    const decided = new Map();
    const want = [];
    const stillWaiting = [];
    const fromLinks = [];
    const at = new Map(before.map((p) => [p.id, p]));
    for (const m of merged.pages) {
      const have = at.get(m.id);
      // Saved again elsewhere, with links only: the copy here stays.
      if (have && (ver(have) === ver(m) || links)) {
        const next = { ...m };
        for (const k of Object.keys(have)) if (DEVICE.includes(k) || !SYNCED.has(k)) next[k] = have[k];
        decided.set(m.id, next);
      } else if (!links && merged.files[m.id] && merged.files[m.id].at === ver(m)) want.push({ m, have });
      else if (have) {
        // Saved again or edited elsewhere, its text not on GitHub (that
        // device syncs links only, or hasn't sent it yet): the copy here
        // stays, but where you got to still comes over (1.39.1). Until
        // then a chapter finished on the phone stayed unread here.
        const next = placeOnly(have, m);
        if (next) decided.set(m.id, next);
      } else {
        stillWaiting.push(m.id);
        // No text on GitHub (its device syncs links only) or not wanted.
        if (links || !merged.files[m.id]) fromLinks.push(m);
      }
    }
    for (const id of Object.keys(merged.deleted)) if (at.has(id)) decided.set(id, null);
    // Every page still to come down is waiting before the base says it is
    // in the library: a run cut off between the two took them for pages
    // deleted here, and the next deleted them everywhere (1.13.0).
    const coming = () => stillWaiting.concat(want.filter((w) => !w.have && !decided.has(w.m.id)).map((w) => w.m.id));
    keep(WAIT_KEY, coming());
    // Written only when it changed (1.2.0): a library of hundreds is a
    // few hundred kilobytes, and localStorage writes on the main thread.
    await breathe();
    const mergedText = JSON.stringify(merged);
    let baseText = null;
    try { baseText = localStorage.getItem(BASE_KEY); } catch (e) { baseText = null; }
    if (mergedText !== baseText) { try { localStorage.setItem(BASE_KEY, mergedText); } catch (e) { /* not kept */ } }

    let down = 0;
    const downloads = [];
    // Texts are asked for a few at a time (1.13.0); each one is still
    // written and put in its place one after another.
    const AHEAD = 4;
    const asked = new Map();
    const textOf = (i) => {
      if (i >= want.length) return null;
      if (!asked.has(i)) asked.set(i, readText("pages/" + want[i].m.id + ".html").catch(() => null));
      return asked.get(i);
    };
    let fresh = new Map(), lastSettle = Date.now();
    for (const [i, { m, have }] of want.entries()) {
      // Paused while bringing pages in: the ones in are kept, the rest
      // come next time (they're still new to this device then).
      if (cfg && cfg.paused) { for (const r of want.slice(i)) if (!r.have) stillWaiting.push(r.m.id); break; }
      if (onProgress) onProgress({ stage: "down", done: i, total: want.length });
      for (let k = i; k < i + AHEAD; k++) textOf(k);
      const html = await textOf(i);
      asked.delete(i);
      if (!html) {
        if (!have) stillWaiting.push(m.id);
        else { const next = placeOnly(have, m); if (next) decided.set(m.id, next); }
        continue;
      }
      if (have) await C.store.removePage(m.id);
      const got = await incoming(html, m);
      const meta = { ...m, missing: got.missing };
      if (m.file && m.imageBytes != null) meta.imageBytes = m.imageBytes;
      meta.bytes = await C.store.writePage(m.id, got.html, meta);
      decided.set(m.id, meta);
      fresh.set(m.id, meta);
      if (got.missing) downloads.push(meta);
      down++;
      if (fresh.size >= 10 || (fresh.size && Date.now() - lastSettle > 4000)) {
        await settleSome(fresh, false);
        keep(WAIT_KEY, coming());
        fresh = new Map();
        lastSettle = Date.now();
      }
    }
    await breathe();
    // Settled at once, with nothing awaited, so a change made while this
    // sync ran is kept (and sent next time) rather than written over.
    const { out, gone } = await settleSome(decided, true);
    keep(WAIT_KEY, stillWaiting.length ? stillWaiting : null);
    // Feeds the same way: one changed here while this ran keeps this
    // device's version, which goes up next time.
    if (setFeeds && merged.feeds) {
      const was = new Map(feedsBefore.map((f) => [f.url, JSON.stringify(f)]));
      const live = new Map(getFeeds().map((f) => [f.url, feedShare(f)]));
      const changed = (u) => was.has(u) && live.has(u) && was.get(u) !== JSON.stringify(live.get(u));
      const list = [];
      for (const m of merged.feeds) {
        if (changed(m.url)) list.push(live.get(m.url));
        else if (live.has(m.url) || !was.has(m.url)) list.push(m);
      }
      for (const [u, f] of live) if (!was.has(u) && !list.some((m) => m.url === u)) list.push(f);
      setFeeds(list);
    }
    if (setSeen && merged.feedsSeen && merged.feedsSeen > (getSeen() || 0)) setSeen(merged.feedsSeen);
    await setPages(out);
    for (const id of gone) await C.store.removePage(id);
    // Reading stats last (1.39.0), and never the reason a sync failed.
    try { await syncStats(); } catch (e) { if (e instanceof Paused) throw e; }
    return { up, down, removed: gone.length, downloads, fromLinks };
  }

  // GitHub's library with this sync's places on the clips it has.
  function placesOnto(doc, merged) {
    const by = new Map(merged.pages.map((p) => [p.id, p]));
    return { ...doc, pages: doc.pages.map((r) => { const m = by.get(r.id); return (m && placeOnly(r, m, ver(r) === ver(m))) || r; }) };
  }

  // Reading stats (1.39.0): stats/<device>.json, one file a device, each
  // written only by the device it's named for, so there is nothing to
  // merge; the others' come down when GitHub says they changed.
  const hashOf = (t) => { let h = 2166136261; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619); return t.length + ":" + (h >>> 0).toString(36); };
  async function syncStats() {
    if (!C.stats) return;
    const dev = C.stats.device;
    const r = await call(contents("stats") + "?ref=" + encodeURIComponent(cfg.branch), { headers: headers() });
    if (!r.ok && r.status !== 404) throw await fail(r);
    const list = r.ok ? await r.json() : [];
    const known = load(STATS_KEY, {}) || {};
    let mineSha = null;
    for (const f of Array.isArray(list) ? list : []) {
      const m = /^([a-z0-9]{12})\.json$/.exec(f && f.name || "");
      if (!m) continue;
      if (m[1] === dev) { mineSha = f.sha; continue; }
      if (known[m[1]] === f.sha) continue;
      halt();
      const got = await readJson("stats/" + f.name);
      if (got) { C.stats.take(m[1], got.data); known[m[1]] = f.sha; }
    }
    C.stats.flush();
    const text = JSON.stringify(C.stats.mine());
    const sent = hashOf(text);
    if (!mineSha || known._sent !== sent) {
      halt();
      await put("stats/" + dev + ".json", text, mineSha, "Reading stats");
      known._sent = sent;
    }
    keep(STATS_KEY, known);
  }

  // A library file from GitHub, down to what Waypage writes.
  function clean(doc) {
    const pages = [];
    for (const raw of doc.pages) {
      const id = raw && typeof raw.id === "string" && /^[a-z0-9]{4,24}$/.test(raw.id) ? raw.id : null;
      const m = id && C.backup.cleanMeta(raw, id);
      if (!m) continue;
      for (const k of DEVICE) delete m[k];
      pages.push(m);
    }
    const deleted = {}, files = {};
    for (const [id, at] of Object.entries(doc.deleted || {})) if (typeof at === "number") deleted[id] = at;
    for (const [id, f] of Object.entries(doc.files || {})) {
      if (!f || typeof f.at !== "number" || typeof f.sha !== "string") continue;
      files[id] = { at: f.at, sha: f.sha };
      if (Array.isArray(f.packs) && f.packs.every((s) => typeof s === "string")) files[id].packs = f.packs.slice(0, 64);
    }
    const out = { format: 1, pages, deleted, files };
    if (Array.isArray(doc.feeds)) {
      out.feeds = doc.feeds.map((f) => C.backup.cleanFeed(f)).filter(Boolean).map(feedShare);
      out.feedsGone = {};
      for (const [u, at] of Object.entries(doc.feedsGone || {})) if (typeof at === "number") out.feedsGone[u] = at;
    }
    if (typeof doc.feedsSeen === "number" && doc.feedsSeen > 0) out.feedsSeen = doc.feedsSeen;
    return out;
  }

  C.sync = {
    merge, mergeTags, mergeMarks, mergeFeeds, oneCopyEach, outgoing, incoming, sendBatches, blobSha, connect, disconnect, run, SyncError, KEY_URL, NEW_REPO_URL, tokenIn, setupLink,
    share, clean, same, urlKey, sameUrl, peek, poll,
    get on() { return !!cfg; },
    // Connected before 1.29.1's steps, so with a token for All
    // repositories (1.30.1). Gone once a new token is connected.
    get oldToken() { return !!cfg && !cfg.scoped; },
    get account() { return cfg ? cfg.owner + "/" + cfg.repo : ""; },
    get running() { return !!running; },
    get last() { return last; },
    get progress() { return progress; },
    get links() { return !!(cfg && cfg.links); },
    get paused() { return !!(cfg && cfg.paused); },
    set paused(v) { if (!cfg) return; if (v) cfg.paused = true; else delete cfg.paused; keep(CFG_KEY, cfg); },
    set links(v) { if (!cfg) return; if (v) cfg.links = true; else delete cfg.links; keep(CFG_KEY, cfg); },
  };
})();
