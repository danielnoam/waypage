// Recover Notes and Highlights (2026-11): finds the highlights and drawings
// an update left behind. Nothing here is ever deleted by Waypage; they stay
// stored but stop showing, because the place they were kept moved (1.7.1's
// highlight blocks, 1.56.0's ink.json, 1.58.0's drawings by block) or what
// they sit on is gone. `scan` reads, `fix` writes, and neither touches the
// page: Settings › Report a problem draws the list (app-settings.js).
//
//   io = { html(p), ink(p), note(p), hasBase(p), locateIn(html, marks),
//          printed(p), writeInk(p, data), writeNote(p, data), save() }
//
// A problem is { id, clip, title, kind, line, fix } with `fix` the button's
// label, or null when nothing here can be put back safely.
(() => {
  const C = window.Waypage;

  const strokesOf = (v) => (Array.isArray(v) ? v.length : 0);
  // Pages of ink.json that have strokes: { "3": 12 }.
  function inkPages(d) {
    const out = {};
    if (d && d.pages && typeof d.pages === "object") for (const [n, list] of Object.entries(d.pages)) if (strokesOf(list)) out[n] = list.length;
    return out;
  }
  const highest = (o) => Object.keys(o).reduce((a, n) => Math.max(a, Number(n) || 0), 0);
  const sheetCount = (d) => (d && Array.isArray(d.sheets) ? d.sheets.filter((s) => s && (s.bg === "paper" || (s.bg === "pdf" && s.n >= 1))).length : 0);
  const isPdfFile = (p) => !!(p.link && p.file && p.file.kind === "pdf" && !p.comic);
  const textMarks = (p) => (Array.isArray(p.marks) ? p.marks.filter((m) => m && typeof m.block === "number" && typeof m.text === "string") : []);
  const said = (t) => "“" + (t.length > 60 ? t.slice(0, 57) + "…" : t) + "”";

  async function scanOne(p, io) {
    const out = [];
    const add = (kind, key, line, fix, extra) => out.push({ id: p.id + ":" + kind + ":" + key, clip: p.id, title: p.title || "Untitled", kind, line, fix, ...extra });

    // A note: sheets and their pictures.
    if (p.note) {
      const ink = inkPages(await io.ink(p));
      const raw = await io.note(p);
      const top = highest(ink), have = sheetCount(raw);
      const kept = Math.max(1, have);
      if (top > kept) {
        add("ink-sheets-missing", "sheets", "Drawing on sheet " + top + ", but only " + (kept === 1 ? "1 sheet is" : kept + " sheets are") + " kept", "Add the sheets", { top });
      }
      if (raw && Array.isArray(raw.sheets) && raw.sheets.some((s) => s && s.bg === "pdf") && !(await io.hasBase(p))) {
        add("ink-base-missing", "base", "Its PDF is missing, so the sheets drawn on it can't open", "Use blank sheets");
      }
      return out;
    }
    if (p.preview) return out;

    const printed = io.printed(p);
    const marks = printed ? [] : textMarks(p);
    const strokeKeys = !printed && p.ink && typeof p.ink === "object" ? Object.keys(p.ink).filter((k) => strokesOf(p.ink[k])) : [];

    if (marks.length || strokeKeys.length) {
      let html = null;
      try { html = await io.html(p); } catch (e) { html = null; }
      if (html) {
        const res = io.locateIn(html, marks);
        const byId = new Map(res.marks.map((r) => [r.id, r]));
        for (const m of marks) {
          const r = byId.get(m.id);
          if (!r || r.state === "ok") continue;
          if (r.state === "moved") add("mark-moved", m.id, "Highlight " + said(m.text) + " moved in the text", "Put it back", { mark: m.id, at: r.at });
          else add("mark-lost", m.id, "Highlight " + said(m.text) + " isn't in this copy of the clip" + (m.note ? ", with its note" : ""), null, { mark: m.id });
        }
        const gone = strokeKeys.filter((k) => Number(k) > res.blocks);
        if (gone.length && res.blocks > 0) {
          add("ink-block-gone", "blocks", "Drawing on " + (gone.length === 1 ? "a place" : gone.length + " places") + " that is no longer in the clip", "Move to the end", { keys: gone, to: res.blocks });
        } else if (gone.length) {
          add("ink-block-gone", "blocks", "Drawing on a clip with no text left to hold it", null, { keys: gone });
        }
      }
    }

    if (isPdfFile(p)) {
      const ink = inkPages(await io.ink(p));
      const drawn = Array.isArray(p.drawn) ? p.drawn.filter((d) => Array.isArray(d) && d[0] >= 1) : [];
      if (p.view === "text" && (Object.keys(ink).length || drawn.length)) {
        add("ink-hidden-by-view", "view", "Drawn on, but shown as text, where drawings on the pages don't show", "Show as printed pages");
      }
      const want = Object.keys(ink).map(Number).sort((a, b) => a - b).map((n) => [n, ink[n]]);
      if (JSON.stringify(want) !== JSON.stringify(drawn.map((d) => [d[0], d[1]]).sort((a, b) => a[0] - b[0]))) {
        add("ink-drawn-stale", "drawn", "The list of drawn pages is out of date", "Rebuild the list", { want });
      }
    }
    return out;
  }

  // Every problem in the library, grouped by clip in library order.
  // `onProgress(done, total)` runs after each clip.
  async function scan(pages, io, onProgress) {
    const found = [];
    let done = 0;
    for (const p of pages) {
      try { found.push(...(await scanOne(p, io))); } catch (e) { console.error(e); }
      if (onProgress) onProgress(++done, pages.length);
    }
    return found;
  }

  // Puts one thing back. Resolves true when it did. A highlight's `at` is
  // set to now, or the copy on another device, older, wins when sync merges.
  async function fix(problem, pages, io) {
    const p = pages.find((x) => x.id === problem.clip);
    if (!p || !problem.fix) return false;
    switch (problem.kind) {
      case "mark-moved": {
        const m = (p.marks || []).find((x) => x.id === problem.mark);
        if (!m) return false;
        const a = problem.at;
        m.block = a.block; m.start = a.start; m.endBlock = a.endBlock; m.end = a.end;
        m.at = Date.now();
        break;
      }
      case "ink-block-gone": {
        const into = String(problem.to);
        const merged = Array.isArray(p.ink[into]) ? p.ink[into].slice() : [];
        for (const k of problem.keys) { merged.push(...p.ink[k]); delete p.ink[k]; }
        p.ink[into] = merged;
        p.inkAt = Date.now();
        break;
      }
      case "ink-hidden-by-view":
        delete p.view;
        break;
      case "ink-drawn-stale":
        if (problem.want.length) p.drawn = problem.want; else delete p.drawn;
        break;
      case "ink-sheets-missing": {
        const raw = await io.note(p);
        const sheets = raw && Array.isArray(raw.sheets) ? raw.sheets.filter((s) => s && (s.bg === "paper" || (s.bg === "pdf" && s.n >= 1))) : [];
        while (sheets.length < problem.top) sheets.push({ bg: "paper" });
        await io.writeNote(p, { v: 1, sheets });
        p.editedAt = Date.now();
        break;
      }
      case "ink-base-missing": {
        const raw = await io.note(p);
        const sheets = ((raw && raw.sheets) || []).map((s) => (s && s.bg === "pdf" ? { bg: "paper" } : s));
        await io.writeNote(p, { v: 1, sheets });
        p.editedAt = Date.now();
        break;
      }
      default:
        return false;
    }
    await io.save();
    return true;
  }

  // The words a problem is copied as, so a lost highlight's text and note
  // can be kept by hand.
  function copyText(problem, pages) {
    const p = pages.find((x) => x.id === problem.clip);
    const m = p && problem.mark ? (p.marks || []).find((x) => x.id === problem.mark) : null;
    return m ? m.text + (m.note ? "\n\n" + m.note : "") : problem.title + ": " + problem.line;
  }

  C.recover = { scan, fix, copyText, inkPages };
})();
