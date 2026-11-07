// Runs in <head>, before the stylesheets apply, so the first frame is
// already in the saved theme. Before this the page painted in Paper until
// app.js ran at the end of <body>, then every colour eased across to the
// real theme. app.js's paintTheme() takes over from here and must resolve
// a choice the same way (resolveTheme, autoThemes).
(function () {
  const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
  const root = document.documentElement;
  let theme = read("waypage.theme");
  if (!theme || theme === "system") {
    const auto = read("waypage.themeAuto") || {};
    const dark = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
    theme = (dark ? auto.dark : auto.light) || (dark ? "night" : "paper");
  }
  if (typeof theme === "string") root.dataset.theme = theme;
  if (read("waypage.animations") === false) root.dataset.motion = "off";
  // Search shows once there are clips (renderLibrary); if there were last
  // time, it holds its place in the bar until the library is read.
  const starts = read("waypage.startTimes");
  if (Array.isArray(starts) && starts.length && starts[starts.length - 1].clips > 0) root.dataset.clips = "had";
})();
