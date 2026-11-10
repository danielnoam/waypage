// Pen drawing on a PDF (1.57.0), the parts that need no browser:
// `node test/ink.test.js`. Drawing, erasing, undo and a copy of the PDF
// with the strokes are driven in a browser by test/ui.test.js.
const assert = require("assert");

global.window = { Waypage: { save: { newId: () => "id" + Math.random().toString(36).slice(2, 8) } } };
require("../src/ink.js");
const I = window.Waypage.ink;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}
const nums = (d) => (d.match(/-?\d*\.?\d+/g) || []).map(Number);

test("a pen stroke is a closed outline that stays round its points, wider where it is pressed harder", () => {
  const w = 0.004;
  const d = I.penPath([0.1, 0.5, 0.1, 0.3, 0.5, 0.1, 0.5, 0.5, 1, 0.7, 0.5, 1], w);
  assert.ok(d.startsWith("M") && d.endsWith("z"));
  const n = nums(d);
  const ys = n.filter((_, i) => i % 2 === 1), xs = n.filter((_, i) => i % 2 === 0);
  assert.ok(Math.min(...xs) < 0.1 && Math.max(...xs) > 0.7, "round the ends");
  // Thick end: about the radius of full pressure (1.45 x the even line's) either side.
  const half = (Math.max(...ys) - Math.min(...ys)) / 2;
  assert.ok(half > (w / 2) * 1.2 && half < (w / 2) * 1.6, "half width " + half);
});

test("one point is a dot, and no points are nothing", () => {
  const d = I.penPath([0.5, 0.5, 0.5], 0.004);
  assert.ok(/a0\.002 0\.002/.test(d) && d.endsWith("z"), d);
  assert.strictEqual(I.penPath([], 0.004), "");
  assert.strictEqual(I.linePath([]), "");
});

test("a highlighter stroke is a line through its points", () => {
  const d = I.linePath([0.1, 0.1, 0.5, 0.3, 0.1, 0.5, 0.6, 0.1, 0.5]);
  assert.ok(d.startsWith("M0.1 0.1") && d.endsWith("L0.6 0.1"), d);
});

test("a point is on a stroke when it's within the line's width and the slop of it", () => {
  const s = { t: "p", w: 0.004, p: [0.1, 0.1, 0.5, 0.3, 0.1, 0.5] };
  assert.strictEqual(I.hits(s, 0.2, 0.105, 0.012), true);
  assert.strictEqual(I.hits(s, 0.2, 0.15, 0.012), false);
  assert.strictEqual(I.hits(s, 0.05, 0.1, 0.012), false, "past the end");
  assert.strictEqual(I.hits({ t: "h", w: 0.022, p: [0.5, 0.5, 0.5] }, 0.51, 0.5, 0.012), true, "a dot");
});

test("a stroke read from a file keeps only what a stroke is", () => {
  const ok = I.clean({ id: "a", t: "p", c: "red", w: 0.003, p: [0.1, 0.2, 2, 0.3, 0.4, -1] });
  assert.deepStrictEqual(ok.p, [0.1, 0.2, 1, 0.3, 0.4, 0], "pressure kept between 0 and 1");
  assert.strictEqual(I.clean({ t: "p", c: "pink", w: 0.003, p: [0, 0, 1] }), null, "a pen has no pink");
  assert.strictEqual(I.clean({ t: "h", c: "pink", w: 0.02, p: [0, 0, 1] }).c, "pink");
  assert.strictEqual(I.clean({ t: "x", c: "ink", w: 0.003, p: [0, 0, 1] }), null);
  assert.strictEqual(I.clean({ t: "p", c: "ink", w: 5, p: [0, 0, 1] }), null, "a width bigger than a page");
  assert.strictEqual(I.clean({ t: "p", c: "ink", w: 0.003, p: [0, 0] }), null, "points come in threes");
  assert.strictEqual(I.clean({ t: "p", c: "ink", w: 0.003, p: [0, NaN, 1] }), null);
  assert.strictEqual(I.clean({ t: "p", c: "__proto__", w: 0.003, p: [0, 0, 1] }), null);
});

console.log("\n" + passed + " passed");
