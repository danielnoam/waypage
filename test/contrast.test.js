// Every theme's text tokens meet WCAG AA (4.5:1) on its grounds:
// `node test/contrast.test.js`. DESIGN.md §1 is the rule this checks; the
// measuring is keel's (tools/keel-checks.js), the pairs are Waypage's.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { contrast } = require("../tools/keel-checks.js");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");
const NAMES = ["paper", "sepia", "night", "slate", "solarized", "contrast", "black", "dusk", "solarized-dark"];
const themes = contrast.themes(css, { themes: Object.fromEntries(NAMES.map((n) => [n, '[data-theme="' + n + '"]'])) });

const pairs = [];
for (const fg of ["ink", "muted", "accent", "ok", "warn"]) for (const bg of ["bg", "surface"]) pairs.push([fg, bg]);
// Read aloud lights the paragraph being read with --preview (0.27.0).
for (const fg of ["ink", "accent"]) pairs.push([fg, "preview"]);
// Highlights (1.7.0) sit on --mark, or on their colour (1.42.0).
for (const mark of ["mark", "mark-green", "mark-blue", "mark-pink", "mark-purple"]) for (const fg of ["ink", "accent"]) pairs.push([fg, mark]);
// The bars, the reader's top and bottom among them.
for (const fg of ["ink", "muted", "accent"]) pairs.push([fg, "bar"]);
pairs.push(["accent-ink", "accent"]);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}
test("all " + NAMES.length + " themes, " + pairs.length + " pairs each, meet 4.5:1", () => {
  const fails = contrast.check(themes, pairs);
  assert.deepStrictEqual(fails, [], fails.join("\n    "));
});
console.log("\n" + passed + " passed");
