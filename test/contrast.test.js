// Every theme's text tokens meet WCAG AA (4.5:1) on its grounds:
// `node test/contrast.test.js`. DESIGN.md §1 is the rule this checks.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const css = fs.readFileSync(path.join(__dirname, "..", "src", "styles.css"), "utf8");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

function theme(name) {
  const m = css.match(new RegExp('\\[data-theme="' + name + '"\\] \\{([^}]*)\\}'));
  assert.ok(m, "no " + name + " theme block");
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2]]));
}

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

for (const name of ["paper", "sepia", "night", "slate", "solarized", "contrast", "black", "dusk", "solarized-dark"]) {
  const t = theme(name);
  for (const fg of ["ink", "muted", "accent", "ok", "warn"]) {
    for (const bg of ["bg", "surface"]) {
      test(name + ": --" + fg + " on --" + bg, () => {
        const r = ratio(t[fg], t[bg]);
        assert.ok(r >= 4.5, r.toFixed(2) + ":1");
      });
    }
  }
  // Read aloud lights the paragraph being read with --preview (0.27.0).
  for (const fg of ["ink", "accent"]) {
    test(name + ": --" + fg + " on --preview", () => {
      const r = ratio(t[fg], t.preview);
      assert.ok(r >= 4.5, r.toFixed(2) + ":1");
    });
  }
  // Highlights (1.7.0) sit on --mark, or on their colour (1.42.0).
  for (const mark of ["mark", "mark-green", "mark-blue", "mark-pink", "mark-purple"]) {
    for (const fg of ["ink", "accent"]) {
      test(name + ": --" + fg + " on --" + mark, () => {
        const r = ratio(t[fg], t[mark]);
        assert.ok(r >= 4.5, r.toFixed(2) + ":1");
      });
    }
  }
  // The bars, the reader's top and bottom among them.
  for (const fg of ["ink", "muted", "accent"]) {
    test(name + ": --" + fg + " on --bar", () => {
      const r = ratio(t[fg], t.bar);
      assert.ok(r >= 4.5, r.toFixed(2) + ":1");
    });
  }
  test(name + ": --accent-ink on --accent", () => {
    const r = ratio(t["accent-ink"], t.accent);
    assert.ok(r >= 4.5, r.toFixed(2) + ":1");
  });
}

console.log("\n" + passed + " passed");
