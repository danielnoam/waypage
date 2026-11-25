// Waypage: a list of servers an extension keeps (2026-11). Catalogs,
// WebDAV and Audiobookshelf each keep one: the servers on this device with
// their passwords or tokens, the ones removed (so sync doesn't bring them
// back), what sync sends (never a password or token) and how another
// device's list is taken in. One copy, so a guard written for one of them
// holds for all three.
//
//   const S = Waypage.servers({ key, clean, secrets })
//     key       where the list is kept; the removed ones go under key + ".gone"
//     clean     (server) => the record as it is stored
//     secrets   the fields that never leave this device: ["pass"]
//   S.all()                 the stored records, secrets and all
//   S.write(list)           stores them (no one is told)
//   S.add(s)                cleans, stamps and stores one; returns the record
//   S.change(id, fn)        replaces one with fn(record)
//   S.remove(id)            removes it and remembers when
//   S.shared()              { v: 1, list (no secrets), gone }, as sync sends it
//   S.mergeIn(doc)          another device's list taken in; true when it changed this one
//   S.changed(fn) / S.tell()   fn() whenever the list changes
//   Waypage.servers.same(a, b)   whether address b is the server at address a
(function () {
  const C = (window.Waypage = window.Waypage || {});
  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || "null"); return v == null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full: it stays as it was */ } };

  // A login goes only to the server it was given for: the same origin, or
  // the same host moved up to https, never down and never another host.
  const same = (a, b) => {
    try {
      const x = new URL(a), y = new URL(b);
      return x.origin === y.origin || (y.protocol === "https:" && x.hostname === y.hostname);
    } catch (e) { return false; }
  };

  function servers({ key, clean, secrets }) {
    const GONE = key + ".gone"; // { id: when it was removed }
    const all = () => { const v = read(key, []); return Array.isArray(v) ? v : []; };
    const gone = () => { const v = read(GONE, {}); return v && typeof v === "object" ? v : {}; };
    const write = (list) => put(key, list);
    const watchers = [];
    const changed = (fn) => { watchers.push(fn); };
    const tell = () => { for (const fn of watchers) { try { fn(); } catch (e) { console.error(e); } } };
    const none = Object.fromEntries(secrets.map((k) => [k, ""]));
    const kept = (s) => Object.fromEntries(secrets.map((k) => [k, s[k]]));

    function add(s) { const x = clean({ ...s, at: Date.now() }); write([...all(), x]); tell(); return x; }
    function change(id, fn) { write(all().map((x) => (x.id === id ? fn(x) : x))); tell(); }
    function remove(id) {
      write(all().filter((x) => x.id !== id));
      put(GONE, { ...gone(), [id]: Date.now() });
      tell();
    }
    const shared = () => ({ v: 1, list: all().map((s) => { const o = { ...s }; for (const k of secrets) delete o[k]; return o; }), gone: gone() });
    // The newer of each wins, and one removed anywhere goes. A password or
    // token here stays here, and only while the newer record is the same
    // user on the same server: a changed address never takes it along.
    function mergeIn(doc) {
      if (!doc || !Array.isArray(doc.list)) return false;
      const away = { ...gone() };
      for (const [id, at] of Object.entries(doc.gone || {})) if (typeof at === "number" && !(away[id] >= at)) away[id] = at;
      const mine = new Map(all().map((s) => [s.id, s]));
      for (const r of doc.list) {
        if (!r || !r.id || !/^https?:\/\//i.test(r.url || "")) continue;
        const at = Number(r.at) || 0, here = mine.get(r.id);
        if (!here) mine.set(r.id, clean({ ...r, ...none, at }));
        else if (at > (here.at || 0)) mine.set(r.id, clean({ ...r, ...(r.user === here.user && same(here.url, r.url) ? kept(here) : none), at }));
      }
      for (const [id, at] of Object.entries(away)) { const s = mine.get(id); if (s && (s.at || 0) <= at) mine.delete(id); }
      const before = JSON.stringify(all());
      const next = [...mine.values()];
      put(GONE, away);
      if (JSON.stringify(next) === before) return false;
      write(next);
      tell();
      return true;
    }
    return { all, write, add, change, remove, shared, mergeIn, changed, tell };
  }
  servers.same = same;
  C.servers = servers;
})();
