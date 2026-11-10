// Pen drawing on a PDF (1.56.0), the parts that need no browser:
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

// The outline's points, and how far from a line through `at` going `dir` they lie, within a stretch of it.
const pairs = (d) => { const n = nums(d), out = []; for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]); return out; };
function reach(d, at, dir, from, to) {
  let most = 0;
  for (const [x, y] of pairs(d)) {
    const along = (x - at[0]) * dir[0] + (y - at[1]) * dir[1];
    if (along < from || along > to) continue;
    most = Math.max(most, Math.abs((x - at[0]) * dir[1] - (y - at[1]) * dir[0]));
  }
  return most;
}
const straight = (at, dir, len, pr) => { const a = []; for (let i = 0; i <= 60; i++) a.push(at[0] + dir[0] * len * i / 60, at[1] + dir[1] * len * i / 60, pr); return a; };
const W = 0.004;

test("there are five sizes and four pen styles, each a closed outline", () => {
  assert.strictEqual(I.SIZES.pen.length, 5);
  assert.strictEqual(I.SIZES.highlighter.length, 5);
  assert.ok(I.SIZES.pen.every((v, i, a) => !i || v > a[i - 1]), "growing");
  assert.deepStrictEqual(I.STYLES, ["ball", "marker", "fountain", "brush"]);
  for (const y of I.STYLES) assert.ok(I.penPath(straight([0.2, 0.5], [1, 0], 0.5, 0.5), W, y).endsWith("z"), y);
});

test("a marker keeps one width, where a ballpoint and a brush follow the pressure", () => {
  const wide = (y, pr) => reach(I.penPath(straight([0.2, 0.5], [1, 0], 0.5, pr), W, y), [0.2, 0.5], [1, 0], 0.2, 0.3);
  assert.ok(Math.abs(wide("marker", 0.2) - wide("marker", 0.9)) < 1e-6, "marker");
  assert.ok(wide("ball", 0.9) > wide("ball", 0.2) * 1.5, "ballpoint");
  assert.ok(wide("brush", 0.9) > wide("brush", 0.2) * 3, "brush follows it more strongly than the ballpoint");
});

test("a fountain pen is thin along its nib and thick across it", () => {
  const nib = [Math.SQRT1_2, -Math.SQRT1_2], across = [Math.SQRT1_2, Math.SQRT1_2];
  const wide = (dir) => reach(I.penPath(straight([0.3, 0.5], dir, 0.4, 0.5), W, "fountain"), [0.3, 0.5], dir, 0.1, 0.3);
  assert.ok(wide(across) > wide(nib) * 2, "across " + wide(across) + " along " + wide(nib));
  // A ballpoint is the same either way.
  const ball = (dir) => reach(I.penPath(straight([0.3, 0.5], dir, 0.4, 0.5), W, "ball"), [0.3, 0.5], dir, 0.1, 0.3);
  assert.ok(Math.abs(ball(across) - ball(nib)) < W * 0.1);
});

test("a brush comes to a point at both ends", () => {
  const d = I.penPath(straight([0.1, 0.5], [1, 0], 0.8, 0.6), W, "brush");
  const mid = reach(d, [0.1, 0.5], [1, 0], 0.35, 0.45);
  assert.ok(reach(d, [0.1, 0.5], [1, 0], 0, 0.01) < mid * 0.35, "the start");
  assert.ok(reach(d, [0.1, 0.5], [1, 0], 0.79, 0.8) < mid * 0.35, "the end");
});

test("a stroke keeps its style, a stroke without one or with one we don't know is a ballpoint's", () => {
  const stroke = (y) => I.clean({ t: "p", c: "ink", w: 0.003, p: [0.1, 0.1, 0.5, 0.2, 0.1, 0.5], ...(y ? { y } : {}) });
  assert.strictEqual(stroke("fountain").y, "fountain");
  assert.strictEqual(stroke("brush").y, "brush");
  assert.strictEqual(stroke("laser").y, undefined);
  assert.strictEqual(stroke().y, undefined);
  assert.strictEqual(I.clean({ t: "h", c: "yellow", w: 0.02, y: "brush", p: [0.1, 0.1, 0.5, 0.2, 0.1, 0.5] }).y, undefined, "a highlighter has none");
});

test("a loop takes what's inside it: strokes with half their points in it, pictures by their middle", () => {
  const square = [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.6]];
  assert.strictEqual(I.inside(square, 0.4, 0.4), true);
  assert.strictEqual(I.inside(square, 0.7, 0.4), false);
  // A concave loop (a C shape) leaves its hollow out.
  const c = [[0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 0.7], [1, 0.7], [1, 1], [0, 1]];
  assert.strictEqual(I.inside(c, 0.1, 0.5), true);
  assert.strictEqual(I.inside(c, 0.7, 0.5), false);
  const stroke = (xs) => ({ t: "p", w: 0.004, p: xs.flatMap((x) => [x, 0.4, 0.5]) });
  assert.strictEqual(I.within(square, stroke([0.3, 0.4, 0.5])), true);
  assert.strictEqual(I.within(square, stroke([0.3, 0.7, 0.8, 0.9])), false);
  assert.strictEqual(I.within(square, { t: "i", f: "a", x: 0.3, y: 0.3, w: 0.2, h: 0.2 }), true);
  assert.strictEqual(I.within(square, { t: "i", f: "a", x: 0.55, y: 0.3, w: 0.4, h: 0.2 }), false, "middle outside");
});

test("the box round items takes in their width and a picture's corners", () => {
  const b = I.boxOf([{ t: "p", w: 0.01, p: [0.2, 0.2, 0.5, 0.4, 0.3, 0.5] }, { t: "i", f: "a", x: 0.5, y: 0.5, w: 0.2, h: 0.1 }]);
  assert.ok(b[0] < 0.2 && b[1] < 0.2 && b[0] + b[2] > 0.7 && b[1] + b[3] > 0.6);
  assert.strictEqual(I.boxOf([]), null);
});

test("a colour of your own is #rrggbb: read back from a file, anything else is dropped", () => {
  assert.strictEqual(I.clean({ t: "p", c: "#44cbff", w: 0.003, p: [0, 0, 1] }).c, "#44cbff");
  assert.strictEqual(I.clean({ t: "h", c: "#ff00aa", w: 0.02, p: [0, 0, 1] }).c, "#ff00aa");
  for (const bad of ["#44CBFF", "#44cbf", "#44cbffaa", "red;x", "url(#a)"]) assert.strictEqual(I.clean({ t: "p", c: bad, w: 0.003, p: [0, 0, 1] }), null, bad);
});

test("a picture on a page is kept with its file and box, and refused when it makes no sense", () => {
  const ok = I.clean({ id: "p1", t: "i", f: "img_1", x: 0.1, y: 0.2, w: 0.4, h: 0.3, extra: 1 });
  assert.deepStrictEqual(ok, { id: "p1", t: "i", f: "img_1", x: 0.1, y: 0.2, w: 0.4, h: 0.3 });
  for (const bad of [{ f: "../x" }, { f: "" }, { w: 0 }, { w: 9 }, { h: -1 }, { x: NaN }, { y: 99 }]) assert.strictEqual(I.clean({ t: "i", f: "a", x: 0, y: 0, w: 0.2, h: 0.2, ...bad }), null, JSON.stringify(bad));
  assert.strictEqual(I.hits({ t: "i", x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, 0.3, 0.3, 0), true);
  assert.strictEqual(I.hits({ t: "i", x: 0.2, y: 0.2, w: 0.2, h: 0.2 }, 0.6, 0.3, 0.01), false);
});

test("colours go between hex, rgb and hue, saturation, value without drifting", () => {
  assert.strictEqual(I.rgbHex(68, 203, 255), "#44cbff");
  assert.deepStrictEqual(I.hexRgb("#44cbff"), [68, 203, 255]);
  assert.strictEqual(I.rgbHex(300, -4, 12.4), "#ff000c", "kept inside 0-255");
  for (const rgb of [[68, 203, 255], [208, 49, 45], [28, 27, 25], [255, 255, 255], [0, 0, 0], [91, 214, 107]]) {
    const back = I.hsvRgb(...I.rgbHsv(...rgb));
    assert.ok(back.every((v, i) => Math.abs(v - rgb[i]) <= 1), rgb + " came back " + back);
  }
  assert.deepStrictEqual(I.hsvRgb(0, 1, 1), [255, 0, 0]);
  assert.deepStrictEqual(I.hsvRgb(120, 0, 1), [255, 255, 255], "pale is white");
});

// Two pages 400 px wide, 560 px tall, 20 px apart, one over the other.
const R1 = { left: 0, top: 0, width: 400, height: 560 }, R2 = { left: 0, top: 580, width: 400, height: 560 };
const PAGES = [{ n: 1, rect: R1, h: 1.4 }, { n: 2, rect: R2, h: 1.4 }];
const stroke = (pts, id = "s") => ({ id, t: "p", c: "ink", w: 0.004, p: pts.flatMap(([x, y]) => [x, y, 0.5]) });

test("an item moves between two pages' widths and keeps its size on screen", () => {
  const wide = { left: 0, top: 580, width: 800, height: 1120 };
  const c = I.convertItem(stroke([[0.5, 1.5]]), R1, wide);
  assert.ok(Math.abs(c.p[0] - 0.25) < 1e-3, "x " + c.p[0]);
  assert.ok(Math.abs(c.p[1] - ((1.5 * 400 - 580) / 800)) < 1e-3, "y " + c.p[1]);
  assert.ok(Math.abs(c.w - 0.002) < 1e-6, "half the page widths");
  const img = I.convertItem({ t: "i", f: "a", x: 0.1, y: 1.5, w: 0.4, h: 0.2 }, R1, R2);
  assert.ok(Math.abs(img.y - ((1.5 * 400 - 580) / 400)) < 1e-3 && img.w === 0.4);
});

test("a box off a page is shifted back inside it, together; one bigger than the page keeps its corner", () => {
  const a = stroke([[1.2, 0.5], [1.4, 0.6]]), b = stroke([[1.3, 1.5]]);
  const [dx, dy] = I.clampInto([a, b], 1.4);
  assert.ok(dx < 0 && dy < 0, dx + " " + dy);
  for (const s of [a, b]) for (let i = 0; i < s.p.length; i += 3) assert.ok(s.p[i] <= 1.001 && s.p[i + 1] <= 1.401);
  assert.ok(Math.abs((a.p[0] - 1.2) - (b.p[0] - 1.3)) < 1e-9, "shifted as one");
  const inside = stroke([[0.3, 0.3], [0.5, 0.5]]);
  assert.deepStrictEqual(I.clampInto([inside], 1.4), [0, 0]);
  const big = { t: "i", f: "a", x: -0.3, y: -0.2, w: 1.6, h: 0.5 };
  I.clampInto([big], 1.4);
  assert.ok(Math.abs(big.x) < 0.01, "left edge on the page: " + big.x);
});

test("a stroke over two pages is kept on both, each in its own widths", () => {
  // From low on page 1 down to page 2: 1.3 to 1.6 widths down from page 1's top.
  const s = stroke([[0.3, 1.3], [0.3, 1.5], [0.3, 1.7]]);
  const out = I.placeOn(s, 1, PAGES);
  assert.deepStrictEqual(out.map((g) => g.n), [1, 2]);
  assert.strictEqual(out[0].s, s, "the origin's is the stroke itself");
  assert.strictEqual(out[1].s.id, s.id, "one id, so they are one thing");
  assert.ok(Math.abs(out[1].s.p[1] - ((1.3 * 400 - 580) / 400)) < 1e-3, "page 2's copy starts at " + out[1].s.p[1]);
});

test("a stroke on one page stays as it is; one off every page ends up inside the nearest", () => {
  const s = stroke([[0.2, 0.2], [0.4, 0.3]]);
  const one = I.placeOn(s, 1, PAGES);
  assert.strictEqual(one.length, 1);
  assert.strictEqual(one[0].s, s);
  const lost = stroke([[0.3, 5.2], [0.4, 5.3]]);
  const out = I.placeOn(lost, 1, PAGES);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].n, 2, "the nearest page");
  assert.ok(out[0].s.p.every((v, i) => i % 3 === 2 || (v >= -0.01 && v <= 1.41)), JSON.stringify(out[0].s.p));
  // Only a sliver of it on a page: brought in.
  const sliver = { id: "p", t: "i", f: "a", x: 0.2, y: 1.39, w: 0.4, h: 0.4 };
  const moved = I.placeOn(sliver, 1, [{ n: 1, rect: R1, h: 1.4 }]);
  assert.ok(moved[0].s.y + moved[0].s.h <= 1.401, "pulled up: " + moved[0].s.y);
});

console.log("\n" + passed + " passed");
