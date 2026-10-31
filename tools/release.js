// Makes a release commit's edits: `node tools/release.js 1.46.0`.
//
// A version lives in three places (CONTRIBUTING.md, "Versions and
// releases"): APP_VERSION in src/app.js, the ?v= on index.html's tags and
// CACHE in sw.js. This bumps all three and turns CHANGELOG.md's
// "## Unreleased" section into "## [1.46.0] - <today>". Nothing is
// committed: look at the diff, then commit and open the release PR. A
// merge with the new version publishes the APK and IPA (android.yml).
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function bump(version, { root = ROOT, date = new Date().toISOString().slice(0, 10) } = {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("version must be x.y.z, got " + version);
  const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
  const write = (f, s) => fs.writeFileSync(path.join(root, f), s);

  const app = read("src/app.js");
  const was = (app.match(/const APP_VERSION = "([^"]+)"/) || [])[1];
  if (!was) throw new Error("src/app.js has no APP_VERSION");
  if (!newer(version, was)) throw new Error(version + " isn't above " + was + " (the updater ignores lower numbers)");
  write("src/app.js", app.replace(/const APP_VERSION = "[^"]+"/, 'const APP_VERSION = "' + version + '"'));

  const index = read("index.html");
  const tags = (index.match(/\?v=[^"]+"/g) || []).length;
  if (!tags) throw new Error("index.html has no ?v= tags");
  write("index.html", index.replace(/\?v=[^"]+"/g, "?v=" + version + '"'));

  const sw = read("sw.js");
  const cache = sw.match(/const CACHE = "waypage-v(\d+)"/);
  if (!cache) throw new Error("sw.js has no CACHE");
  write("sw.js", sw.replace(cache[0], 'const CACHE = "waypage-v' + (Number(cache[1]) + 1) + '"'));

  const log = read("CHANGELOG.md");
  const heading = /^## Unreleased[^\n]*\n/m;
  if (!heading.test(log)) throw new Error("CHANGELOG.md has no '## Unreleased' section: nothing to release");
  const body = log.split(heading)[1].split(/^## /m)[0];
  if (!/^(###|-)/m.test(body)) throw new Error("CHANGELOG.md's Unreleased section is empty");
  write("CHANGELOG.md", log.replace(heading, "## [" + version + "] - " + date + "\n"));

  return { was, version, cache: "waypage-v" + (Number(cache[1]) + 1), tags };
}

const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

if (require.main === module) {
  const r = bump(process.argv[2] || "");
  console.log(r.was + " -> " + r.version + ": src/app.js, " + r.tags + " tags in index.html, sw.js " + r.cache + ", CHANGELOG.md dated. Now commit and open the release PR.");
}

module.exports = { bump, newer };
