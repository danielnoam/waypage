// Waypage: motion (DESIGN.md §4, reworked in 1.11.0). Springs, sampled
// into CSS linear() curves since there's no animation library. On touch:
// stiffness 400, damping 32 for screens, sheets and cards; 600 and 40 for
// small controls. On a desktop (1024 px and up, a mouse or trackpad) the
// same shapes run critically damped, quicker and without overshoot.
// Nothing fades but dialogs (1.49.0): what comes grows out of what was
// tapped or in from an edge, and leaves the same way. Under prefers-reduced-motion every one
// becomes a 120 ms fade. Nothing animates the text of a page being read,
// and nothing waits on an animation to accept input.
(function () {
  // A spring from rest at 0 to 1, sampled every frame into linear().
  function sample(k, c) {
    let x = 0, v = 0, t = 0;
    const pts = [0];
    while (t < 2) {
      for (let i = 0; i < 4; i++) { const a = -k * (x - 1) - c * v; v += a / 240; x += v / 240; }
      t += 1 / 60;
      pts.push(+x.toFixed(4));
      if (Math.abs(1 - x) < 0.002 && Math.abs(v) < 0.02) break;
    }
    pts[pts.length - 1] = 1;
    return { ms: Math.round(t * 1000), curve: "linear(" + pts.join(", ") + ")", pts };
  }
  // The same spring stopped at 1, for what slides in from an edge or
  // sits against one (1.45.4): its small overshoot carried a screen, bar
  // or sheet a few pixels past where it rests, and what was behind
  // flickered through the gap at the edge.
  function edge(s) {
    const pts = s.pts.map((x) => Math.min(1, x));
    return { ms: s.ms, curve: "linear(" + pts.join(", ") + ")", pts };
  }
  const springs = (sheet, control) => ({ sheet, control, sheetEdge: edge(sheet), controlEdge: edge(control) });
  const TOUCH = springs(sample(400, 32), sample(600, 40));
  const DESK = springs(sample(700, 2 * Math.sqrt(700)), sample(1000, 2 * Math.sqrt(1000)));
  // Older WebViews without linear(): the nearest cubic-bezier, no overshoot.
  const FALLBACK = "cubic-bezier(0.2, 0.9, 0.3, 1)";
  const hasLinear = !!(window.CSS && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 1)"));
  const hasClip = !!(window.CSS && CSS.supports && CSS.supports("clip-path", "inset(1px round 2px)"));
  const mq = (q) => (window.matchMedia ? matchMedia(q) : { matches: false, addEventListener() {} });
  const reducedQ = mq("(prefers-reduced-motion: reduce)");
  const deskQ = mq("(min-width: 1024px) and (pointer: fine)");
  // Animations can be turned off in Settings (1.12.0): then nothing moves
  // at all, not even the reduced-motion fades.
  const still = () => document.documentElement.dataset.motion === "off";
  const reduced = () => !!reducedQ.matches || still();
  function setStill(on) {
    if (on) document.documentElement.dataset.motion = "off";
    else delete document.documentElement.dataset.motion;
  }
  const desk = () => !!deskQ.matches;

  function timing(kind) {
    if (reduced()) return { duration: 120, easing: "linear" };
    const s = (desk() ? DESK : TOUCH)[kind] || (desk() ? DESK : TOUCH).sheet;
    return { duration: s.ms, easing: hasLinear ? s.curve : FALLBACK };
  }

  // How many animations are running, so work that can wait (a library
  // redraw as a page lands) waits for them (1.2.0).
  let moving = 0;
  const busy = () => moving > 0;
  // frames move on the spring; under reduced motion only a 120 ms fade
  // runs, in when `show` is true, out when false, none when null.
  function run(els, kind, show, end) {
    const list = els.filter((x) => x && x[0] && x[0].animate);
    if (!list.length || still()) { if (end) end(); return Promise.resolve(); }
    const done = [];
    if (reduced()) {
      if (show != null) done.push(list[0][0].animate([{ opacity: show ? 0 : 1 }, { opacity: show ? 1 : 0 }], { duration: 120, easing: "linear", fill: "both" }));
    } else list.forEach(([el, frames]) => done.push(el.animate(frames, { ...timing(kind), fill: "both" })));
    moving++;
    return Promise.all(done.map((a) => a.finished)).then(() => { if (end) end(); done.forEach((a) => a.cancel()); }, () => {}).finally(() => { moving--; });
  }
  const one = (el, frames, kind, show) => run([[el, frames]], kind, show);
  const back = (f) => f.slice().reverse();
  const box = (el) => el.getBoundingClientRect();

  // A screen pushed over another (Settings, Downloads, a feed post): in
  // from the right edge. On touch the screen under it drifts a quarter
  // to the left, as on iOS; on a desktop it stays put.
  const DRIFT = "translateX(-25%)";
  function push(el, under) {
    const f = [{ transform: "translateX(100%)" }, { transform: "none" }];
    return run([[el, f], !desk() && under && [under, [{ transform: "none" }, { transform: DRIFT }]]], "sheetEdge", true);
  }
  function pop(el, under, from = 0) {
    const f = [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(100%)" }];
    return run([[el, f], !desk() && under && [under, [{ transform: DRIFT }, { transform: "none" }]]], "sheetEdge", false);
  }

  // Opening a clip or collection: the screen settles in from slightly
  // small, centred on the card that was tapped, as it fades up; Back runs
  // it the other way over the library. The card itself never stretches
  // into the page: a cover and an article share nothing to morph between,
  // so any morph (1.11.x, and a card-copy blend tried for 1.12.1) showed a
  // stretched card or two screens at once halfway through. Only transform
  // and opacity move, at no more than full size, so the GPU does it all.
  const growing = new WeakMap();
  const SETTLE = 0.92;
  function grows(el, r, rad, open, panel, end) {
    if (!r || !r.width) return (open ? push(el) : pop(el)).then(() => { if (end) end(); });
    if (reduced()) return run([[el, []]], "sheet", open, end);
    const was = growing.get(el);
    if (was) was.anims.forEach((a) => a.cancel());
    const T = box(el);
    const k = 1 - SETTLE;
    const dx = (r.left + r.width / 2 - (T.left + T.width / 2)) * k, dy = (r.top + r.height / 2 - (T.top + T.height / 2)) * k;
    const small = "translate(" + dx + "px, " + dy + "px) scale(" + SETTLE + ")";
    const t = { ...timing("sheet"), fill: "both" };
    const blend = { duration: t.duration * (open ? 0.3 : 0.45), easing: "ease-out", fill: "both" };
    el.classList.add("zooming");
    const anims = [
      el.animate(open ? [{ transform: small }, { transform: "none" }] : [{ transform: "none" }, { transform: small }], open ? t : { ...t, duration: blend.duration }),
      el.animate(open ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], blend),
    ];
    const me = { anims };
    growing.set(el, me);
    moving++;
    return Promise.all(anims.map((a) => a.finished)).then(() => {
      if (end) end();
      anims.forEach((a) => a.cancel());
      el.classList.remove("zooming");
    }, () => {}).finally(() => { moving--; if (growing.get(el) === me) growing.delete(el); });
  }
  const grow = (el, r, rad = 16, panel) => grows(el, r, rad, true, panel);
  const shrink = (el, r, rad = 16, panel, end) => grows(el, r, rad, false, panel, end);

  // A sheet from the bottom edge (the reader's Aa, the phone's menus);
  // closing goes on from where a drag left it.
  function rise(el) {
    return one(el, [{ transform: "translateY(100%)" }, { transform: "none" }], "sheetEdge", true);
  }
  function sink(el, from = 0) {
    return one(el, [{ transform: "translateY(" + from + "px)" }, { transform: "translateY(100%)" }], "sheet", false);
  }
  function settle(el, from) {
    return one(el, [{ transform: "translateY(" + from + "px)" }, { transform: "none" }], "controlEdge", null);
  }
  // The dimming behind a sheet, the sidebar or a dialog: it darkens with
  // the thing it's under, on the same spring, from where a drag left it.
  function dim(el, show, from) {
    if (!el) return Promise.resolve();
    const left = el.style.opacity;
    el.style.opacity = "";
    const a = from != null ? from : left !== "" ? parseFloat(left) : show ? 0 : 1;
    return one(el, [{ opacity: a }, { opacity: show ? 1 : 0 }], "sheet", show);
  }

  // The sidebar, from the left edge (0.28.0); closing goes on from where
  // a drag left it (0.30.5), and a short drag springs back. On touch the
  // library under it drifts right a little (1.11.0).
  // `under` is one element or several (the library's parts, 1.45.5: a
  // transform on the whole library let the phone drop its sticky bottom
  // bar while the sidebar was open).
  const sideDrift = (side) => "translateX(" + Math.round(side.offsetWidth * 0.2) + "px)";
  const unders = (under, frames) => (!under ? [] : Array.isArray(under) ? under : [under]).map((u) => [u, frames]);
  function slideIn(el, under) {
    return run([[el, [{ transform: "translateX(-100%)" }, { transform: "none" }]], ...unders(under, [{ transform: "none" }, { transform: sideDrift(el) }])], "sheetEdge", true);
  }
  function slideOut(el, from = 0, under) {
    const k = el.offsetWidth ? 1 + from / el.offsetWidth : 1;
    return run([[el, [{ transform: "translateX(" + from + "px)" }, { transform: "translateX(-100%)" }]],
      ...unders(under, [{ transform: "translateX(" + Math.round(el.offsetWidth * 0.2 * k) + "px)" }, { transform: "none" }])], from ? "controlEdge" : "sheetEdge", false);
  }
  function slideBack(el, from, under) {
    const k = el.offsetWidth ? 1 + from / el.offsetWidth : 1;
    return run([[el, [{ transform: "translateX(" + from + "px)" }, { transform: "none" }]],
      ...unders(under, [{ transform: "translateX(" + Math.round(el.offsetWidth * 0.2 * k) + "px)" }, { transform: sideDrift(el) }])], "controlEdge", null);
  }

  // A menu or popover grows out of the button that opened it, from that
  // button's corner, and shrinks back into it (1.11.0). `popGeom` is the
  // menu's shape at the button; `popAt(g, k)` is k of the way to full.
  function popGeom(el, anchor) {
    const P = box(el), B = anchor;
    if (!B || !B.width || !P.width || !hasClip) return null;
    const w = Math.min(B.width, P.width), h = Math.min(B.height, P.height);
    const left = Math.max(0, Math.min(P.width - w, B.left - P.left));
    const below = B.top < P.top + P.height / 2;
    const top = below ? 0 : P.height - h;
    const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    return { top, right: P.width - left - w, bottom: P.height - top - h, left, round: Math.min(r, h / 2), r, dy: below ? B.top - P.top : B.bottom - P.bottom };
  }
  function popAt(g, k) {
    const at = (v) => (v * (1 - k)).toFixed(2) + "px";
    return { clipPath: "inset(" + [g.top, g.right, g.bottom, g.left].map(at).join(" ") + " round " + (g.round + (g.r - g.round) * k).toFixed(2) + "px)",
      transform: k >= 1 ? "none" : "translateY(" + at(g.dy) + ")" };
  }
  function popFrames(el, anchor) {
    const g = popGeom(el, anchor);
    if (!g) return [{ transform: "scale(0.6)", transformOrigin: "50% 0" }, { transform: "none", transformOrigin: "50% 0" }];
    return [popAt(g, 0), popAt(g, 1)];
  }
  // A window, dialog or panel opened from a button (1.49.0): it fades in
  // as it settles from 96%, leaning toward its button, and fades out the
  // same way, a little quicker. The one place motion fades on purpose
  // (Daniel's pick): popFrom's clip read as a cut-out wiping open, and a
  // zoom from the button itself, whole, was better but still too much
  // for something that just opens.
  function fadeFrames(el, B) {
    const P = box(el);
    const ox = B && B.width && P.width ? Math.max(0, Math.min(P.width, B.left + B.width / 2 - P.left)) + "px" : "50%";
    const oy = B && B.width && P.width ? Math.max(0, Math.min(P.height, B.top + B.height / 2 - P.top)) + "px" : "50%";
    const origin = ox + " " + oy;
    return [{ transform: "scale(0.96)", transformOrigin: origin, opacity: 0 }, { opacity: 1, offset: 0.45 }, { transform: "none", transformOrigin: origin, opacity: 1 }];
  }
  const dialogIn = (el, anchor) => one(el, fadeFrames(el, anchor), "control", true);
  const dialogOut = (el, anchor) => {
    const f = fadeFrames(el, anchor);
    return one(el, [f[2], { opacity: 0, offset: 0.7 }, { ...f[0], transform: "scale(0.98)", opacity: 0 }], "control", false);
  };
  const popFrom = (el, anchor) => one(el, popFrames(el, anchor), "control", true);
  const popInto = (el, anchor) => one(el, back(popFrames(el, anchor)), "control", false);
  // A drop-down menu leaves by only the last stretch of its arrival,
  // run backwards, and is gone before it reaches the button (1.48.3).
  function popOut(el, anchor) {
    const g = popGeom(el, anchor);
    const frames = g ? [{ ...popAt(g, 1), opacity: 1 }, { ...popAt(g, 0.75), opacity: 0 }]
      : [{ transform: "none", transformOrigin: "50% 0", opacity: 1 }, { transform: "scale(0.9)", transformOrigin: "50% 0", opacity: 0 }];
    return one(el, frames, "control", false);
  }

  // Bars and toasts come in past the screen's edge they sit nearest and
  // leave the same way.
  function past(el, edge) {
    const r = box(el);
    if (edge === "top") return "translateY(" + -Math.ceil(r.bottom + 8) + "px)";
    if (edge === "left") return "translateX(" + -Math.ceil(r.right + 8) + "px)";
    if (edge === "right") return "translateX(" + Math.ceil(innerWidth - r.left + 8) + "px)";
    return "translateY(" + Math.ceil(innerHeight - r.top + 8) + "px)";
  }
  const edgeIn = (el, side = "bottom") => one(el, [{ transform: past(el, side) }, { transform: "none" }], "sheetEdge", true);
  const edgeOut = (el, side = "bottom") => one(el, [{ transform: "none" }, { transform: past(el, side) }], "sheet", false);

  // The read-aloud card and the reader's player are one thing (1.26.1).
  // From 1.26.2 only the card's `part` (its play button) is showing at
  // first, sitting exactly on the player's play button at `r`; the card
  // then opens out around it as it travels, clipped, so nothing pops in.
  // Going back runs it the other way and lands on the player's button.
  function morph(el, r, into, part) {
    if (!r || !r.width) return into ? edgeOut(el, "bottom") : edgeIn(el, "bottom");
    const a = box(el), p = part ? box(part) : a;
    const s = r.width / p.width;
    const dx = r.left + r.width / 2 - (p.left + p.width / 2), dy = r.top + r.height / 2 - (p.top + p.height / 2);
    const t = p.top - a.top, l = p.left - a.left, b = a.bottom - p.bottom, w = a.right - p.right;
    const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const origin = l + p.width / 2 + "px " + (t + p.height / 2) + "px";
    // The open end reaches past the card, so its shadow isn't cut off.
    const f = [
      { transform: "translate(" + dx + "px, " + dy + "px) scale(" + s + ")", transformOrigin: origin, clipPath: "inset(" + t + "px " + w + "px " + b + "px " + l + "px round " + p.height / 2 + "px)" },
      { transform: "none", transformOrigin: origin, clipPath: "inset(-40px round " + (rad + 40) + "px)" },
    ];
    return one(el, into ? back(f) : f, "sheet", !into);
  }

  // Something new in a list grows from nothing where it lands; something
  // removed shrinks to nothing (1.11.0). Its neighbours slide (flip).
  const appear = (el) => one(el, [{ transform: "scale(0)" }, { transform: "none" }], "sheet", true);
  const vanish = (el) => one(el, [{ transform: "none" }, { transform: "scale(0)" }], "control", false);

  // Where things are now, then each one that moved slides from there to
  // where it is after a change: the library's sections as Collections or
  // Clips opens on its own, cards making room or closing a gap.
  function measure(els) {
    const m = new Map();
    for (const el of els) { const r = box(el); if (r.width || r.height) m.set(el, r); }
    return m;
  }
  function flip(before, enter) {
    const runs = [];
    for (const [el, r] of before) {
      if (!el.isConnected) continue;
      const a = box(el), dx = r.left - a.left, dy = r.top - a.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      if ((a.bottom < 0 && r.bottom < 0) || (a.top > innerHeight && r.top > innerHeight)) continue;
      runs.push([el, [{ transform: "translate(" + dx + "px, " + dy + "px)" }, { transform: "none" }]]);
    }
    for (const [el, frames] of enter || []) runs.push([el, frames]);
    return run(runs, "sheet", null);
  }
  // What leaves in a flip: a copy of it, fixed where it was, goes past
  // the top or bottom edge (or the left one) and is removed.
  function ghostOut(el, r, edge, layer) {
    const g = el.cloneNode(true);
    g.removeAttribute("id");
    g.setAttribute("aria-hidden", "true");
    g.inert = true;
    Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", margin: "0", pointerEvents: "none", zIndex: "1", boxSizing: "border-box" });
    (layer || document.body).appendChild(g);
    const to = edge === "top" ? "translateY(" + -Math.ceil(r.bottom + 8) + "px)" : edge === "left" ? "translateX(" + -Math.ceil(r.right + 8) + "px)" : "translateY(" + Math.ceil(innerHeight - r.top + 8) + "px)";
    return one(g, [{ transform: "none" }, { transform: to }], "sheet", false).finally(() => g.remove());
  }
  function fromPast(r, edge) {
    if (edge === "top") return "translateY(" + -Math.ceil(r.bottom + 8) + "px)";
    if (edge === "left") return "translateX(" + -Math.ceil(r.right + 8) + "px)";
    return "translateY(" + Math.ceil(innerHeight - r.top + 8) + "px)";
  }

  // The reader going on to the next page of a collection (0.30.3): in
  // Pages it turns sideways (1.11.0), the page read leaving past the left
  // edge and the next coming in from the right; scrolling, it goes on
  // down (1.11.1), the next coming up from the bottom. Going back (dir
  // -1, 1.23.1) runs the other way: the page before comes in from the
  // left, or down from the top.
  const along = (side, d) => (side ? "translateX(" : "translateY(") + d + "%)";
  function pageOut(el, side = true, dir = 1) {
    return one(el, [{ transform: "none" }, { transform: along(side, -100 * dir) }], "control", false)
      .then(() => { el.style.visibility = "hidden"; });
  }
  function pageIn(el, side = true, dir = 1) {
    el.style.visibility = "";
    return one(el, [{ transform: along(side, 100 * dir) }, { transform: "none" }], "sheetEdge", true);
  }

  // The spring as CSS custom properties, for transitions styles.css owns
  // (button presses, the progress bar, switches); they follow the tier.
  function paintVars() {
    const set = desk() ? DESK : TOUCH, root = document.documentElement.style;
    root.setProperty("--spring-sheet", hasLinear ? set.sheet.curve : FALLBACK);
    root.setProperty("--spring-sheet-ms", set.sheet.ms + "ms");
    root.setProperty("--spring-control", hasLinear ? set.control.curve : FALLBACK);
    root.setProperty("--spring-control-ms", set.control.ms + "ms");
    root.setProperty("--spring-control-edge", hasLinear ? set.controlEdge.curve : FALLBACK);
  }
  paintVars();
  deskQ.addEventListener("change", paintVars);

  window.Waypage = window.Waypage || {};
  window.Waypage.motion = {
    busy, timing, reduced, still, setStill, desk, push, pop, grow, shrink, rise, sink, settle, dim, slideIn, slideOut, slideBack,
    popFrom, popInto, popOut, dialogIn, dialogOut, edgeIn, edgeOut, morph, appear, vanish, measure, flip, ghostOut, fromPast, pageOut, pageIn, sideDrift,
  };
})();
