// ARCHITECTURE.md is the map of the code, and a map with a file missing
// sends people the wrong way: `node test/docs.test.js` fails when a
// source file, a tool or a workflow isn't named there.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const doc = fs.readFileSync(path.join(ROOT, "ARCHITECTURE.md"), "utf8");
const list = (dir, keep) => fs.readdirSync(path.join(ROOT, dir)).filter(keep).map((f) => dir + "/" + f);

test("ARCHITECTURE.md names every file in src/", () => {
  const missing = list("src", (f) => /\.(js|css)$/.test(f)).filter((f) => !doc.includes(f));
  assert.deepStrictEqual(missing, []);
});

test("ARCHITECTURE.md names every tool, workflow and root script", () => {
  const files = [
    ...list("tools", (f) => /\.(js|sh|rb)$/.test(f)),
    ...list(".github/workflows", (f) => f.endsWith(".yml")),
    "index.html", "server.js", "sw.js", "manifest.json",
  ];
  const missing = files.filter((f) => !doc.includes(f) && !doc.includes(path.basename(f)));
  assert.deepStrictEqual(missing, []);
});

test("ARCHITECTURE.md names every test file", () => {
  const missing = list("test", (f) => f.endsWith(".test.js")).filter((f) => !doc.includes(path.basename(f)));
  assert.deepStrictEqual(missing, []);
});

// Two rules from CONTRIBUTING.md › Rules from bugs that shipped, cheap to
// read straight from the source.
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("moves follow DESIGN.md's Which move table: no popInto, appear/vanish only for list rows and the picture viewer", () => {
  const allowed = { popInto: [], appear: ["src/app-downloads.js", "src/app-draw.js", "src/app-reader.js"], vanish: ["src/app-draw.js", "src/app-reader.js"] };
  const wrong = [];
  for (const f of list("src", (f) => /^app.*\.js$/.test(f))) {
    read(f).split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/\bM\.(popInto|appear|vanish)\(/g)) {
        if (!allowed[m[1]].includes(f) || (f === "src/app-reader.js" && !/viewer/.test(line))) wrong.push(`${f}:${i + 1} M.${m[1]}`);
      }
    });
  }
  assert.deepStrictEqual(wrong, [], "use the move DESIGN.md §4 gives for that kind of thing");
});

test("every looping animation has its own reduced-motion answer", () => {
  // The blanket reduced-motion rule sets every animation to 1 ms
  // !important, so a loop it doesn't give a duration (or stop) flickers.
  const css = read("src/styles.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [], open = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") { open.push(css.slice(start, i).trim()); start = i + 1; }
    else if (css[i] === "}") {
      const head = open.pop();
      if (head && !head.startsWith("@") && !/[{}]/.test(css.slice(start, i))) {
        rules.push({ sel: head, body: css.slice(start, i), reduced: open.some((h) => /prefers-reduced-motion:\s*reduce/.test(h)) });
      }
      start = i + 1;
    }
  }
  const sels = (keep) => rules.filter((r) => r.reduced && keep.test(r.body)).map((r) => r.sel).join(" ");
  const blanket = sels(/animation-duration:[^;]*!important/);
  const stopped = sels(/animation:\s*none/);
  const missing = [];
  for (const r of rules.filter((r) => /animation:[^;]*\binfinite\b/.test(r.body))) {
    for (const sel of r.sel.split(",")) {
      const k = (sel.replace(/::?[a-z-]+(\([^)]*\))?/g, "").match(/\.[\w-]+/g) || []).pop();
      if (!k) continue;
      const has = (txt) => new RegExp(k.replace(/[.-]/g, "\\$&") + "(?![\\w-])").test(txt);
      if (!has(blanket) && (r.reduced || !has(stopped))) missing.push(sel.trim());
    }
  }
  assert.deepStrictEqual(missing, [], "give each a duration in the blanket reduced-motion block in src/styles.css, or animation: none under reduced motion");
});

console.log("  " + passed + " passed");
