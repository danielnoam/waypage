// The page's Content-Security-Policy (1.62.0), through keel's check
// (tools/keel-checks.js): `node test/csp.test.js`. The browser half is
// ui.test.js, which fails on anything the policy blocks.
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { csp } = require("../tools/keel-checks.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + e.message); }
}

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const policy = csp.policyOf(html) || "";
const directive = (name) => ((policy.split(";").map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name)) || []).slice(1);

// Three places the policy is looser than keel's check, on purpose:
// - The PDF sandbox (src/pdf.js) is a srcdoc frame, which takes this page's
// policy as well as its own: its one inline script is let in by its hash,
// and pdf.js comes into it as blob: URLs. Only that script's hash, so no
// other inline script runs. pdf.js itself runs only in there, under the
// sandbox's own policy too, so its eval check isn't this page's. (A frame
// from a file would have its own policy, but a sandboxed one isn't served
// by the service worker, so PDFs wouldn't open offline.)
// - style-src allows inline styles: a page being saved is parsed in this
//   document's policy, so every style="" in it would be a violation
//   logged (a MOBI book has thousands). Styles can't run code.
// - base-uri allows any web address: saving parses a page with a <base>
//   of its own address, so its relative links and pictures resolve. With
//   script-src 'self', a <base> can't bring in a script.
const BOOT = /const BOOT = String\.raw`([\s\S]*?)`;/.exec(fs.readFileSync(path.join(ROOT, "src/pdf.js"), "utf8").replace(/\r\n/g, "\n"))[1];
const BOOT_HASH = "'sha256-" + crypto.createHash("sha256").update(BOOT).digest("base64") + "'";
const SANDBOX_ONLY = new Set(["pdf.min.mjs", "pdf.worker.min.mjs"]);

const LOOSER = new Set(["script-src should be 'self' and nothing else", "the policy allows unsafe-inline or unsafe-eval", "base-uri should be 'self'"]);

test("the policy and the code under it pass keel's check, but for the three above", () => {
  const files = ["src", "src/vendor", "src/keel"].flatMap((d) => fs.readdirSync(path.join(ROOT, d))
    .filter((f) => /\.m?js$/.test(f) && !SANDBOX_ONLY.has(f)).map((f) => path.join(ROOT, d, f)));
  const problems = csp.check(html, files).filter((p) => !LOOSER.has(p));
  assert.deepStrictEqual(problems, []);
});

test("script-src is the app's files, blob: and the PDF sandbox's script by its hash", () => {
  assert.ok(!/\$\{/.test(BOOT), "the sandbox's script has to be fixed text for its hash");
  assert.deepStrictEqual(directive("script-src"), ["'self'", "blob:", BOOT_HASH], "src/pdf.js's BOOT changed: its hash is now " + BOOT_HASH);
});

test("the looser three are only as loose as said, and nothing loads a plugin or a form post", () => {
  assert.deepStrictEqual(directive("style-src"), ["'self'", "'unsafe-inline'"]);
  assert.deepStrictEqual(directive("base-uri"), ["'self'", "https:", "http:"]);
  assert.ok(!/unsafe-eval/.test(policy));
  assert.deepStrictEqual(directive("form-action"), ["'none'"]);
  assert.deepStrictEqual(directive("default-src"), ["'self'"]);
});

console.log(passed + " passed");
