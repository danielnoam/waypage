// Code nothing calls and styles nothing wears are read, kept up and
// translated for no one: `node test/unused.test.js` fails when a function,
// a top-level name or a CSS class in src/ is declared and never used.
// Remove it, or use it; a class the code builds from pieces ("c-" + color)
// goes in BUILT below with the line that builds it.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("ok   " + name); }
  catch (e) { process.exitCode = 1; console.log("FAIL " + name + "\n     " + e.message); }
}

const walk = (dir) => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(dir + "/" + e.name) : [dir + "/" + e.name]));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
// Ours to keep tidy: not vendored code, not keel's (checked in keel).
const ours = walk("src").filter((f) => f.endsWith(".js") && !/^src\/(vendor|keel|lang)\//.test(f));
const page = ["index.html", "sw.js", ...walk("src").filter((f) => /\.m?js$/.test(f) && !f.startsWith("src/vendor/"))];
// A name in a comment isn't a use of it.
const code = page.map((f) => read(f).replace(/^\s*\/\/.*$/gm, "")).join("\n");
const uses = (name) => (code.match(new RegExp("(?<![\\w$])" + name.replace(/\$/g, "\\$") + "(?![\\w$])", "g")) || []).length;

test("every function and top-level name in src/ is used somewhere", () => {
  const unused = [];
  for (const f of ours) {
    const src = read(f);
    const names = [
      ...[...src.matchAll(/^[ \t]*(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]),
      ...[...src.matchAll(/^(?: {2})?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
    ];
    for (const n of new Set(names)) if (uses(n) < 2) unused.push(f + ": " + n);
  }
  assert.deepStrictEqual(unused, []);
});

// Classes the code puts together, so their whole name is written nowhere.
const BUILT = [
  /^n\d$/,                   // app-library.js: the mosaic's "n" + count
  /^dict-/,                  // dict.js: "dict-" + part.type
  /^rs-(week|month|year|all)$/, // app-places.js: the reading chart's "rs-" + readSpan
  /^c-/,                     // ink.js: a stroke's "c-" + color
  /^co-c-/,                  // reader.js: a highlight's "co-c-" + color
];
test("every class in the stylesheets is one the code or index.html uses", () => {
  const words = new Set(page.map(read).join("\n").match(/[A-Za-z_][\w-]*/g));
  const unused = [];
  for (const f of ["src/styles.css", "src/reader.css"]) {
    const css = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    const seen = new Set();
    for (const sel of css.split("{").map((s) => s.split("}").pop())) {
      for (const m of sel.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) seen.add(m[1]);
    }
    for (const c of seen) if (!words.has(c) && !BUILT.some((re) => re.test(c))) unused.push(f + ": ." + c);
  }
  assert.deepStrictEqual(unused, []);
});

console.log("\n" + passed + " passed");
