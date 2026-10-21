// Reading stats (1.38.0): time spent reading, words read, time Read aloud
// played, and clips opened, finished and saved, by day and by clip. Kept
// on this device only and shown nowhere yet; they're collected now so
// there's a history to show when they are (Daniel, 21 Oct 2026).
//
// Reading counts while a clip is open on screen, up to two minutes after
// the last scroll, turn or tap, so a phone left open on the table doesn't
// read on. Words count as the furthest place in a clip moves on, from
// its length; a jump (Contents, a link inside the clip) moves the place
// without counting. Read aloud counts while it plays, screen on or off.
//
// window.Waypage.stats: opened(id, back), closed(), active(), position(id, f,
// words), finished(id), saved(), moved(from, to), aloud(playing, id),
// all(), flush().
(function () {
  "use strict";
  const KEY = "waypage.stats";
  const IDLE_MS = 2 * 60 * 1000;
  const TICK_MS = 15000;
  // More words than this in one move is a jump, not reading.
  const JUMP_WORDS = 1500;

  let data = null, dirty = false, saveTimer = null;
  function all() {
    if (data) return data;
    try { data = JSON.parse(localStorage.getItem(KEY)); } catch (e) { data = null; }
    if (!data || typeof data !== "object") data = { since: Date.now() };
    data.v = 1;
    data.days = data.days || {};
    data.clips = data.clips || {};
    return data;
  }
  const dayKey = (t) => {
    const d = new Date(t);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  };
  const day = (t) => { const d = all().days, k = dayKey(t || Date.now()); return d[k] || (d[k] = {}); };
  const clip = (id) => { const c = all().clips; return c[id] || (c[id] = {}); };
  const add = (o, k, n) => { o[k] = Math.round((o[k] || 0) + n); };

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!dirty || !data) return;
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* not kept */ }
  }
  function changed() {
    dirty = true;
    if (!saveTimer) saveTimer = setTimeout(flush, 30000);
  }

  // ---- Reading ----
  let open = null; // { id, at: counted up to, seen: last scroll, turn or tap, words, pos }
  function count() {
    if (!open) return;
    const now = Date.now();
    const till = Math.min(now, open.seen + IDLE_MS);
    if (!document.hidden && till > open.at) {
      const ms = till - open.at;
      add(day(open.at), "readMs", ms);
      add(clip(open.id), "readMs", ms);
      changed();
    }
    open.at = now;
  }
  // `back`: the same clip again after the app lock, not a new opening.
  function opened(id, back) {
    if (open && open.id === id) { active(); return; }
    closed();
    if (!id) return;
    const now = Date.now();
    open = { id, at: now, seen: now };
    if (back) return;
    add(day(), "opened", 1);
    const c = clip(id);
    add(c, "opened", 1);
    c.last = now;
    changed();
  }
  function closed() {
    if (!open) return;
    count();
    open = null;
    flush();
  }
  function active() {
    if (!open) return;
    count();
    open.seen = Date.now();
  }
  function position(id, f, words) {
    if (!id || !(f >= 0)) return;
    if (open && open.id === id) active();
    const c = clip(id);
    const far = c.far || 0;
    if (f <= far) return;
    c.far = Math.round(f * 1000) / 1000;
    const n = words > 0 ? (f - far) * words : 0;
    if (n > 0 && n <= JUMP_WORDS) { add(day(), "words", n); add(c, "words", n); }
    changed();
  }
  function finished(id) {
    const c = clip(id);
    if (c.finished) return;
    c.finished = Date.now();
    add(day(), "finished", 1);
    changed();
  }
  function saved() { add(day(), "saved", 1); changed(); }
  // A clip saved again in its old copy's place gets a new id: its
  // numbers go with it.
  function moved(from, to) {
    const c = all().clips;
    if (c[from]) {
      const t = c[to] || (c[to] = {});
      for (const [k, v] of Object.entries(c[from])) t[k] = typeof v === "number" && typeof t[k] === "number" && !/^(far|last|finished)$/.test(k) ? t[k] + v : v;
      delete c[from];
      changed();
    }
    if (open && open.id === from) open.id = to;
    if (playing && playing.id === from) playing.id = to;
  }

  // ---- Read aloud ----
  // Each paragraph read tells the app; time counts up to a few minutes
  // after the last one heard, so a pause that reaches the app late (the
  // phone asleep) doesn't count the night.
  const HEARD_MS = 3 * 60 * 1000;
  let playing = null; // { id, at: counted up to, heard }
  function aloudCount() {
    if (!playing) return;
    const now = Date.now();
    const till = Math.min(now, playing.heard + HEARD_MS);
    if (till > playing.at) { add(day(playing.at), "aloudMs", till - playing.at); add(clip(playing.id), "aloudMs", till - playing.at); changed(); }
    playing.at = now;
  }
  function aloud(on, id) {
    if (playing && (!on || playing.id !== id)) { aloudCount(); playing = null; }
    if (on && id && !playing) playing = { id, at: Date.now(), heard: Date.now() };
    else if (on && playing) { aloudCount(); playing.heard = Date.now(); }
  }

  setInterval(() => { count(); aloudCount(); }, TICK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { count(); aloudCount(); flush(); }
    else if (open) open.at = Date.now();
  });
  addEventListener("pagehide", () => { count(); aloudCount(); flush(); });

  window.Waypage.stats = { opened, closed, active, position, finished, saved, moved, aloud, all, flush };
})();
