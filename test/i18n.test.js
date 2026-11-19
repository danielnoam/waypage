// Every word the app shows has its Hebrew in src/lang/he.js (keel's i18n
// check): none missing, none left over from text that's gone, and every
// {placeholder} and plural in the Hebrew matches the English.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { i18n } = require("../tools/keel-checks.js");

const root = path.join(__dirname, "..");
const files = ["index.html", ...fs.readdirSync(path.join(root, "src")).filter((f) => f.endsWith(".js")).map((f) => "src/" + f)]
  .map((f) => path.join(root, f));
const r = i18n.check(i18n.keys(files), i18n.table(path.join(root, "src/lang/he.js")));
assert.deepStrictEqual(r.missing, [], "Hebrew missing for: " + r.missing.join(" | "));
assert.deepStrictEqual(r.stale, [], "Hebrew for text that's gone: " + r.stale.join(" | "));
assert.deepStrictEqual(r.broken, [], "Hebrew that doesn't match its English: " + JSON.stringify(r.broken));
// Words written straight into index.html's markup need data-t on them or on
// a wrapper, or Hebrew shows them in English (the picking bar's Tags,
// Collection, Edit and Delete did).
const bare = [];
const html = fs.readFileSync(path.join(root, "index.html"), "utf8").replace(/<!doctype[^>]*>|<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->|<svg[\s\S]*?<\/svg>/gi, "");
const open = [], VOID = new Set(["img", "input", "br", "meta", "link", "hr", "source"]);
for (const m of html.matchAll(/<(\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?)>|([^<]+)/g)) {
  if (m[5] !== undefined) {
    if (/[A-Za-z]{2}/.test(m[5]) && !open.some((x) => /\sdata-t(?=[\s>=]|$)/.test(x.attrs) || x.name === "title")) bare.push(m[5].trim());
  } else if (m[1]) { while (open.length && open.pop().name !== m[2].toLowerCase()); }
  else if (!m[4] && !VOID.has(m[2].toLowerCase())) open.push({ name: m[2].toLowerCase(), attrs: m[3] });
}
assert.deepStrictEqual(bare, [], "Words in index.html without data-t: " + bare.join(" | "));
console.log("i18n: ok");
