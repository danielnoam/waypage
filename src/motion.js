// Waypage: motion (DESIGN.md §4), through keel's engine
// (src/keel/motion.js, shared with LifeLog and new apps). Springs sampled
// into CSS linear(): on touch stiffness 400, damping 32 for screens,
// sheets and cards, 600 and 40 for small controls; on a desktop (1024 px
// and up, a mouse or trackpad) the same shapes critically damped, quicker
// and without overshoot. Nothing fades but dialogs (1.49.0): what comes
// grows out of what was tapped or in from an edge, and leaves the same
// way. Under prefers-reduced-motion every move becomes a 120 ms fade, and
// Animations off in Settings (1.12.0) stops them all. Nothing animates the
// text of a page being read, and nothing waits on an animation to accept
// input.
(function () {
  window.Waypage = window.Waypage || {};
  window.Waypage.motion = window.Keel.motion.create({
    touch: { sheet: [400, 32], control: [600, 40] },
    desktop: { sheet: [700, "critical"], control: [1000, "critical"] },
    desktopQuery: "(min-width: 1024px) and (pointer: fine)",
    reducedMs: 120,
    cssPrefix: "--spring",
  });
})();
