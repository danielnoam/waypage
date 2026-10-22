// Reading stats (1.38.0): time spent reading, words read, time Read aloud
// played, and clips opened, finished and saved, by day and by clip.
// Shown since 1.39.0 in the Reading place, at the end of each clip and in
// the Reading widgets.
//
// Each device counts its own and only ever writes its own (1.39.0):
// GitHub sync puts it in stats/<device>.json and brings the others' down,
// and a Drive backup carries this device's with the others it knows. The
// totals shown add them up, so two devices never merge into one file and
// nothing is counted twice.
//
// Reading counts while a clip is open on screen, up to a screen's reading
// time after the last scroll, turn or tap (1.41.0: half again the time
// the words on screen take at your pace, 20 s to 90 s; it was a flat two
// minutes), so a phone left open on the table doesn't read on. Words count as the furthest place in a clip moves on, from
// its length; a jump (Contents, a link inside the clip) moves the place
// without counting. Read aloud counts while it plays, screen on or off.
//
// window.Waypage.stats: opened(id, back), closed(), active(), position(id, f,
// words), finished(id), saved(), moved(from, to), aloud(playing, id),
// all(), flush(); device, mine(), take(device, data), backup(), restore(b);
// and the totals: day(key), days(from, to), clip(id), top(from, to, n),
// streak(), since(), dayKey(t), onChange(fn).
(function () {
  "use strict";
  const KEY = "waypage.stats";
  const DEVICE_KEY = "waypage.statsDevice";
  const OTHERS_KEY = "waypage.statsOthers"; // { device: data } from sync or a backup
  const IDLE_MIN = 20000, IDLE_MAX = 90000, IDLE_DEFAULT = 60000;
  const TICK_MS = 15000;
  // More words than this in one move is a jump, not reading.
  const JUMP_WORDS = 1500;

  let data = null, dirty = false, saveTimer = null, combined = null;
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
  // A day's time by clip (1.39.0), for the Reading place's "Most time".
  const dayClip = (t, id, ms) => { const d = day(t); const c = d.clips || (d.clips = {}); add(c, id, ms); };
  const heard = [];
  const tell = () => { combined = null; for (const fn of heard) { try { fn(); } catch (e) { /* its own */ } } };

  function flush() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!dirty || !data) return;
    dirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* not kept */ }
  }
  function changed() {
    dirty = true;
    combined = null;
    if (!saveTimer) saveTimer = setTimeout(flush, 30000);
  }

  // ---- Reading ----
  let open = null; // { id, at: counted up to, seen: last scroll, turn or tap, words, pos }
  function count() {
    if (!open) return;
    const now = Date.now();
    const till = Math.min(now, open.seen + (open.idle || IDLE_DEFAULT));
    if (!document.hidden && till > open.at) {
      const ms = till - open.at;
      add(day(open.at), "readMs", ms);
      add(clip(open.id), "readMs", ms);
      dayClip(open.at, open.id, ms);
      // Reading by eye, for your pace: not while it's read aloud.
      if (!playing) add(day(open.at), "paceMs", ms);
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
    if (n > 0 && n <= JUMP_WORDS) { add(day(), "words", n); add(c, "words", n); if (!playing) add(day(), "paceWords", n); }
    changed();
  }
  // The words one screen shows: how long it should take to read.
  function screen(words) {
    if (!open || !(words >= 0)) return 0;
    return (open.idle = Math.max(IDLE_MIN, Math.min(IDLE_MAX, Math.round(words / pace() * 60000 * 1.5))));
  }

  // Your reading pace (1.41.0), in words a minute: the words read by eye
  // over the last 30 days against the time they took, from every device.
  // Until there's enough to go by (2,000 words), the usual 230.
  const PACE = 230, PACE_DAYS = 30;
  let paceAt = 0, paceNow = PACE, paceKnownNow = false;
  function pace() {
    if (Date.now() - paceAt < 60000) return paceNow;
    paceAt = Date.now();
    const from = dayKey(Date.now() - PACE_DAYS * 864e5);
    let w = 0, ms = 0;
    // Straight from each device's days, not the whole sum: the library
    // asks for it as it draws.
    for (const dev of [mine(), ...Object.values(othersNow())]) {
      for (const [k, d] of Object.entries(dev.days || {})) if (k >= from) { w += d.paceWords || 0; ms += d.paceMs || 0; }
    }
    paceKnownNow = w >= 2000 && ms >= 300000;
    paceNow = paceKnownNow ? Math.max(80, Math.min(800, Math.round(w / (ms / 60000)))) : PACE;
    return paceNow;
  }
  const paceKnown = () => { pace(); return paceKnownNow; };
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
    if (!from || !to || from === to) return;
    // Other devices still count it under the old id: they follow this.
    const m = all().moved || (all().moved = {});
    m[from] = to;
    for (const d of Object.values(all().days)) if (d.clips && d.clips[from]) { add(d.clips, to, d.clips[from]); delete d.clips[from]; }
    changed();
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
    if (till > playing.at) {
      const ms = till - playing.at;
      add(day(playing.at), "aloudMs", ms);
      add(clip(playing.id), "aloudMs", ms);
      dayClip(playing.at, playing.id, ms);
      changed();
    }
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

  // ---- Other devices (1.39.0) ----
  function device() {
    let id = null;
    try { id = localStorage.getItem(DEVICE_KEY); } catch (e) { id = null; }
    if (!/^[a-z0-9]{12}$/.test(id || "")) {
      const b = crypto.getRandomValues(new Uint8Array(12));
      id = [...b].map((n) => "abcdefghijklmnopqrstuvwxyz0123456789"[n % 36]).join("");
      try { localStorage.setItem(DEVICE_KEY, id); } catch (e) { /* a new one next time */ }
    }
    return id;
  }
  let others = null;
  const othersNow = () => {
    if (others) return others;
    try { others = JSON.parse(localStorage.getItem(OTHERS_KEY)); } catch (e) { others = null; }
    if (!others || typeof others !== "object") others = {};
    return others;
  };
  const keepOthers = () => { try { localStorage.setItem(OTHERS_KEY, JSON.stringify(others)); } catch (e) { /* not kept */ } };

  // What another device wrote, down to numbers under the names this writes.
  const DAY = /^\d{4}-\d{2}-\d{2}$/, ID = /^[a-z0-9]{4,24}$/;
  const num = (v) => (typeof v === "number" && isFinite(v) && v >= 0 ? Math.round(v) : 0);
  function clean(raw) {
    const out = { v: 1, since: num(raw && raw.since) || Date.now(), days: {}, clips: {}, moved: {} };
    if (!raw || typeof raw !== "object") return out;
    for (const [k, d] of Object.entries(raw.days || {})) {
      if (!DAY.test(k) || !d || typeof d !== "object") continue;
      const o = {};
      for (const f of ["readMs", "words", "aloudMs", "opened", "finished", "saved", "paceWords", "paceMs"]) if (num(d[f])) o[f] = num(d[f]);
      if (d.clips && typeof d.clips === "object") {
        o.clips = {};
        for (const [id, ms] of Object.entries(d.clips)) if (ID.test(id) && num(ms)) o.clips[id] = num(ms);
      }
      out.days[k] = o;
    }
    for (const [id, c] of Object.entries(raw.clips || {})) {
      if (!ID.test(id) || !c || typeof c !== "object") continue;
      const o = {};
      for (const f of ["readMs", "words", "aloudMs", "opened", "last", "finished"]) if (num(c[f])) o[f] = num(c[f]);
      if (typeof c.far === "number" && c.far > 0) o.far = Math.min(1, c.far);
      out.clips[id] = o;
    }
    for (const [a, b] of Object.entries(raw.moved || {})) if (ID.test(a) && typeof b === "string" && ID.test(b)) out.moved[a] = b;
    return out;
  }
  const mine = () => { all(); return data; };
  // Another device's count, from sync or a backup; this device's own id
  // never comes in (a backup restored onto the phone that made it).
  function take(dev, raw) {
    if (!/^[a-z0-9]{12}$/.test(dev || "") || dev === device()) return;
    othersNow()[dev] = clean(raw);
    keepOthers();
    tell();
  }
  const backup = () => { flush(); return { format: 1, device: device(), data: mine(), others: othersNow() }; };
  function restore(b) {
    if (!b || typeof b !== "object") return;
    if (b.data) take(b.device, b.data);
    for (const [dev, d] of Object.entries(b.others || {})) if (!othersNow()[dev]) take(dev, d);
  }

  // ---- The totals: every device added up ----
  function sum() {
    if (combined) return combined;
    const all_ = [mine(), ...Object.values(othersNow())];
    const moves = {};
    for (const d of all_) Object.assign(moves, d.moved || {});
    const to = (id) => { for (let n = 0; moves[id] && n < 20; n++) id = moves[id]; return id; };
    const days = {}, clips = {};
    let since = Infinity;
    for (const d of all_) {
      if (d.since) since = Math.min(since, d.since);
      for (const [k, x] of Object.entries(d.days || {})) {
        const o = days[k] || (days[k] = { readMs: 0, words: 0, aloudMs: 0, opened: 0, finished: 0, saved: 0, paceWords: 0, paceMs: 0, clips: {} });
        for (const f of ["readMs", "words", "aloudMs", "opened", "finished", "saved", "paceWords", "paceMs"]) o[f] += x[f] || 0;
        for (const [id, ms] of Object.entries(x.clips || {})) { const t = to(id); o.clips[t] = (o.clips[t] || 0) + ms; }
      }
      for (const [id0, x] of Object.entries(d.clips || {})) {
        const id = to(id0);
        const o = clips[id] || (clips[id] = { readMs: 0, words: 0, aloudMs: 0, opened: 0, far: 0, last: 0, finished: 0 });
        for (const f of ["readMs", "words", "aloudMs", "opened"]) o[f] += x[f] || 0;
        o.far = Math.max(o.far, x.far || 0);
        o.last = Math.max(o.last, x.last || 0);
        if (x.finished && (!o.finished || x.finished < o.finished)) o.finished = x.finished;
      }
    }
    return (combined = { days, clips, since: since === Infinity ? Date.now() : since });
  }
  const EMPTY = { readMs: 0, words: 0, aloudMs: 0, opened: 0, finished: 0, saved: 0, clips: {} };
  // Counted up to the minute: what's on screen now is in it.
  let freshAt = 0;
  const fresh = () => {
    if (Date.now() - freshAt > 2000) { count(); aloudCount(); freshAt = Date.now(); }
    return sum();
  };
  const dayOf = (k) => fresh().days[k] || EMPTY;
  // Every day from one key to another, both in.
  function days(from, to) {
    const out = [];
    const d = new Date(from + "T12:00:00");
    for (let k = from, n = 0; k <= to && n < 400; n++) { out.push({ key: k, ...dayOf(k) }); d.setDate(d.getDate() + 1); k = dayKey(d); }
    return out;
  }
  // One clip's, straight from each device's numbers (1.39.0): a clip
  // opens without adding up the whole library.
  function clipOf(id) {
    if (combined) return combined.clips[id] || null;
    if (Date.now() - freshAt > 2000) { count(); aloudCount(); freshAt = Date.now(); }
    const all_ = [mine(), ...Object.values(othersNow())];
    const moves = {};
    for (const d of all_) Object.assign(moves, d.moved || {});
    const to = (x) => { for (let n = 0; moves[x] && n < 20; n++) x = moves[x]; return x; };
    const ids = [id, ...Object.keys(moves).filter((x) => x !== id && to(x) === id)];
    let o = null;
    for (const d of all_) for (const k of ids) {
      const x = d.clips && d.clips[k];
      if (!x) continue;
      o = o || { readMs: 0, words: 0, aloudMs: 0, opened: 0, far: 0, last: 0, finished: 0 };
      for (const f of ["readMs", "words", "aloudMs", "opened"]) o[f] += x[f] || 0;
      o.far = Math.max(o.far, x.far || 0);
      o.last = Math.max(o.last, x.last || 0);
      if (x.finished && (!o.finished || x.finished < o.finished)) o.finished = x.finished;
    }
    return o;
  }
  // Clips finished between two days, each once however many devices did.
  function finishedIn(from, to) {
    const a = new Date(from + "T00:00:00").getTime(), b = new Date(to + "T00:00:00").getTime() + 864e5;
    return Object.values(fresh().clips).filter((c) => c.finished >= a && c.finished < b).length;
  }
  function top(from, to, n) {
    const t = {};
    for (const d of days(from, to)) for (const [id, ms] of Object.entries(d.clips || {})) t[id] = (t[id] || 0) + ms;
    return Object.entries(t).sort((a, b) => b[1] - a[1]).slice(0, n || 5).map(([id, ms]) => ({ id, ms }));
  }
  // Days in a row with a minute or more read or heard, to today (or to
  // yesterday, before today's reading), and the longest.
  const READ_DAY = 60000;
  function streak() {
    const all_ = fresh().days;
    const on = (k) => { const d = all_[k]; return !!d && (d.readMs || 0) + (d.aloudMs || 0) >= READ_DAY; };
    const step = (k, n) => { const d = new Date(k + "T12:00:00"); d.setDate(d.getDate() + n); return dayKey(d); };
    let k = dayKey(Date.now());
    if (!on(k)) k = step(k, -1);
    let now = 0;
    while (on(k) && now < 4000) { now++; k = step(k, -1); }
    const keys = Object.keys(all_).filter(on).sort();
    let best = 0, run = 0, bestEnd = null, prev = null;
    for (const key of keys) {
      run = prev && step(prev, 1) === key ? run + 1 : 1;
      if (run > best) { best = run; bestEnd = key; }
      prev = key;
    }
    return { now, best, bestEnd };
  }
  const onChange = (fn) => heard.push(fn);

  window.Waypage.stats = { opened, closed, active, position, screen, pace, paceKnown, finished, saved, moved, aloud, all, flush,
    get device() { return device(); }, mine, take, backup, restore, clean,
    day: dayOf, days, clip: clipOf, top, finishedIn, streak, since: () => sum().since, dayKey, onChange, READ_DAY };
})();
