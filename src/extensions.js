// Waypage: extensions (2026-11). Features that stay out of the way until
// someone turns them on, each with its own place in Settings › Extensions.
// An extension's code ships with the app, and is only loaded once it is on;
// what is downloaded for it (a language pack) is data, checked against a
// pinned SHA-256 before it is kept, never code that runs. See
// ARCHITECTURE.md's Trade-offs.
//
//   list()           the catalogue: [{ id, title, note, scripts, packs }]
//   on(id)           whether it is turned on (read from this device)
//   turnOn(id)       turns it on and loads its scripts; resolves when ready
//   turnOff(id)      turns it off; what it kept (decks) stays
//   load(id)         loads the scripts of one that is on, once; resolves when ready
//   changed(fn)      fn() is called whenever one is turned on or off
//
// Packs (data an extension downloads, such as Anki's languages):
//   packs(id)              [{ id, title, bytes, have }] for an extension
//   getPack(id, pack)      downloads, checks the SHA-256, installs; resolves when it is in
//   stopPack()             gives up the one running
//   dropPack(id, pack)     removes it from this device
//   packDict(id, pack)     the dictionary's id when it is here, else null
//   running()              { ext, pack, step, done, total } while one is being fetched
//   lastError()            { ext, pack, kind: "failed" | "bad" } from the last one that didn't land
//   progress(fn)           fn() as a pack moves on
(function () {
  const KEY = "waypage.extensions";

  // Each pack is { id, title, note, url, sha256, bytes }. The url is a file on
  // the repository's orphan `packs` branch at one commit, so it never changes
  // under the hash pinned here; a new version of a pack is a new commit and
  // a new pin (tools/packs/build-lang.js prints the hash and size).
  const PACKS = "https://raw.githubusercontent.com/danielnoam/waypage/";
  const CATALOGUE = [
    { id: "anki", title: "Anki", note: "Flashcards from the words you pick in a clip", scripts: ["src/fsrs.js", "src/anki.js", "src/app-anki.js"], packs: [
      { id: "de-en", title: "German → English", note: "Word meanings from Wiktionary", bytes: 4270563,
        sha256: "09f7325a69a742aec48e6cd360fa81222abf452201e451ae42fa9ba8482b1a6b",
        url: PACKS + "2b0eebb87575cddf948bac62051aa1b0fa9a0163/de-en.tar.gz" },
    ] },
  ];

  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } };
  const write = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* storage full or blocked: it stays as it was */ } };

  const list = () => CATALOGUE.map((x) => ({ ...x }));
  const find = (id) => CATALOGUE.find((x) => x.id === id) || null;
  const on = (id) => !!find(id) && !!(read()[id] || {}).on;

  const listeners = [];
  const changed = (fn) => { listeners.push(fn); };
  const tell = () => { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } };

  // The scripts are same-origin files from the app's own folder (the
  // service worker holds them for offline), added once each.
  const loading = new Map();
  function script(src) {
    if (!loading.has(src)) {
      loading.set(src, new Promise((ok, no) => {
        const s = document.createElement("script");
        const v = window.Waypage && window.Waypage.version;
        s.src = src + (v ? "?v=" + v : "");
        s.onload = () => ok();
        s.onerror = () => { loading.delete(src); s.remove(); no(new Error("Couldn't load " + src)); };
        document.head.append(s);
      }));
    }
    return loading.get(src);
  }
  async function load(id) {
    const x = find(id);
    if (!x || !on(id)) return false;
    for (const src of x.scripts) await script(src);
    return true;
  }

  async function turnOn(id) {
    const x = find(id);
    if (!x) throw new Error("There's no extension called " + id + ".");
    write({ ...read(), [id]: { ...(read()[id] || {}), on: true } });
    try { await load(id); } catch (e) {
      // Its code didn't come: it stays off rather than half on.
      write({ ...read(), [id]: { ...(read()[id] || {}), on: false } });
      throw e;
    }
    tell();
  }
  function turnOff(id) {
    if (!find(id)) return;
    write({ ...read(), [id]: { ...(read()[id] || {}), on: false } });
    tell();
  }

  // ---- Packs ----
  // A pack is a StarDict dictionary in one .tar.gz (tools/packs/build-lang.js),
  // handed to src/dict.js once it has been checked against the SHA-256 the
  // catalogue pins. Kept as an ordinary dictionary (Settings › Reading ›
  // Dictionaries lists it too); this only remembers which one is whose.
  let run = null, failed = null;
  const watchers = [];
  const move = () => { for (const fn of watchers) { try { fn(); } catch (e) { console.error(e); } } };
  const progress = (fn) => { watchers.push(fn); };
  const packOf = (id, pid) => { const x = find(id); return x && x.packs.find((p) => p.id === pid) || null; };
  const record = (id, pid) => ((read()[id] || {}).packs || {})[pid] || null;
  const packDict = (id, pid) => {
    const r = record(id, pid);
    return r && window.Waypage.dict && window.Waypage.dict.list().some((d) => d.id === r.dict) ? r.dict : null;
  };
  const packs = (id) => ((find(id) || {}).packs || []).map((p) => ({ id: p.id, title: p.title, note: p.note, bytes: p.bytes, have: !!packDict(id, p.id) }));
  const running = () => (run ? { ext: run.ext, pack: run.pack, step: run.step, done: run.done, total: run.total } : null);
  const lastError = () => failed;

  const sha256 = async (blob) => {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
  };
  // The app fetches natively (src/platform.js, no CORS); a browser reads the
  // stream itself, so the bar can move.
  async function fetchPack(p, r) {
    const P = window.Waypage.platform;
    if (P && P.native) {
      const res = await P.fetchBytes(p.url, p.id + ".tar.gz");
      if (res.status !== 200) throw new Error("status " + res.status);
      return res.blob;
    }
    r.ctl = new AbortController();
    const res = await fetch(p.url, { signal: r.ctl.signal, credentials: "omit" });
    if (!res.ok) throw new Error("status " + res.status);
    const parts = [];
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      r.done += value.length;
      move();
    }
    return new Blob(parts, { type: "application/gzip" });
  }

  async function getPack(id, pid) {
    const p = packOf(id, pid);
    if (!p) throw new Error("There's no such pack.");
    if (run) throw new Error("A download is already running.");
    const r = run = { ext: id, pack: pid, step: "downloading", done: 0, total: p.bytes, stopped: false, ctl: null };
    failed = null;
    move();
    try {
      let blob;
      try { blob = await fetchPack(p, r); } catch (e) { if (r.stopped) return; throw Object.assign(new Error("Couldn't download."), { kind: "failed" }); }
      if (r.stopped) return;
      r.step = "checking"; move();
      if (blob.size !== p.bytes || await sha256(blob) !== p.sha256) throw Object.assign(new Error("The download wasn't the right file."), { kind: "bad" });
      if (r.stopped) return;
      r.step = "unpacking"; move();
      let entry;
      try { entry = await window.Waypage.dict.add([new File([blob], p.id + ".tar.gz", { type: "application/gzip" })]); } catch (e) { throw Object.assign(new Error("The download wasn't the right file."), { kind: "bad" }); }
      const all = read();
      const mine = all[id] || {};
      write({ ...all, [id]: { ...mine, packs: { ...(mine.packs || {}), [pid]: { dict: entry.id, at: Date.now(), bytes: p.bytes } } } });
    } catch (e) {
      failed = { ext: id, pack: pid, kind: e.kind || "failed" };
      throw e;
    } finally {
      run = null;
      move();
    }
  }
  function stopPack() {
    if (!run) return;
    run.stopped = true;
    if (run.ctl) run.ctl.abort();
  }
  async function dropPack(id, pid) {
    const d = packDict(id, pid);
    if (d) await window.Waypage.dict.remove(d);
    const all = read(), mine = all[id] || {}, kept = { ...(mine.packs || {}) };
    delete kept[pid];
    write({ ...all, [id]: { ...mine, packs: kept } });
    move();
  }

  window.Waypage = window.Waypage || {};
  window.Waypage.ext = { list, on, turnOn, turnOff, load, changed, packs, getPack, stopPack, dropPack, packDict, running, lastError, progress,
    // The catalogue itself, not a copy (tests).
    get catalogue() { return CATALOGUE; } };
})();
