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

console.log("  " + passed + " passed");
