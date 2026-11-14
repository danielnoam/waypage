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
(function () {
  const KEY = "waypage.extensions";

  // Each pack is { id, title, url, sha256, bytes }, added with the
  // extension's data in the same change that builds it.
  const CATALOGUE = [
    { id: "anki", title: "Anki", note: "Flashcards from the words you pick in a clip", scripts: ["src/anki.js"], packs: [] },
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

  window.Waypage = window.Waypage || {};
  window.Waypage.ext = { list, on, turnOn, turnOff, load, changed };
})();
