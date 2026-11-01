// The native build's tools and the release bookkeeping: `node test/build.test.js`.
//
// No Android SDK or Mac here, but the ways a build quietly breaks can be
// checked without one: a bundle missing a file the page or its CSS loads,
// a versionCode that doesn't go up, and a version that disagrees with
// CHANGELOG.md or the ?v= on index.html's tags.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { build, assetList, referencedByIndex, appVersion } = require("../tools/build-www.js");
const { versionCode } = require("../tools/android-version.js");
const manifest = require("../tools/android-manifest.js");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { console.error("  FAIL - " + name); console.error("    " + e.message); process.exitCode = 1; }
}

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "waypage-www-")), "www");
build(out);

test("every file index.html loads is in the bundle", () => {
  for (const f of referencedByIndex()) assert.ok(fs.existsSync(path.join(out, f)), f + " missing");
});

test("every file a stylesheet in src/ loads is in sw.js's ASSETS", () => {
  const assets = assetList();
  for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((n) => n.endsWith(".css"))) {
    assert.ok(assets.includes("src/" + f), "src/" + f + " not in ASSETS");
    const css = fs.readFileSync(path.join(ROOT, "src", f), "utf8");
    for (const [, url] of css.matchAll(/url\("([^"]+)"\)/g)) {
      assert.ok(assets.includes("src/" + url), "src/" + url + " (from " + f + ") not in ASSETS");
    }
  }
});

test("every script in src/ is in sw.js's ASSETS", () => {
  const assets = assetList();
  for (const f of fs.readdirSync(path.join(ROOT, "src")).filter((n) => n.endsWith(".js"))) {
    assert.ok(assets.includes("src/" + f), "src/" + f + " not in ASSETS");
  }
});

test("the bundle carries app-build.json with the version", () => {
  const info = JSON.parse(fs.readFileSync(path.join(out, "app-build.json"), "utf8"));
  assert.strictEqual(info.version, appVersion());
});

test("the app's index.html is marked native and edge to edge", () => {
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.ok(/viewport-fit=cover/.test(html));
  assert.ok(/<html[^>]*class="native"/.test(html));
});

// An "## Unreleased" section may sit above it: work that landed on main
// and ships with the next release PR (tools/release.js).
test("CHANGELOG.md's newest numbered entry is APP_VERSION", () => {
  const log = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const m = log.match(/^## \[([^\]]+)\]/m);
  assert.ok(m, "no version heading");
  assert.strictEqual(m[1], appVersion());
  const heads = log.match(/^## .*$/gm);
  assert.ok(heads.length < 2 || !/^## Unreleased/.test(heads[1]), "Unreleased must be the first heading");
});

test("tools/release.js bumps the three places and dates the Unreleased entry", () => {
  const { bump } = require("../tools/release.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waypage-release-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "app.js"), 'const APP_VERSION = "1.2.3";\n');
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="src/app.js?v=1.2.3"></script>\n<link rel="stylesheet" href="src/styles.css?v=1.2.3">\n');
  fs.writeFileSync(path.join(dir, "sw.js"), 'const CACHE = "waypage-v7";\n');
  fs.writeFileSync(path.join(dir, "CHANGELOG.md"), "# Changelog\n\n## Unreleased\n\n### Added\n- A thing.\n\n## [1.2.3] - 2026-01-01\n\n### Fixed\n- Old.\n");
  assert.throws(() => bump("1.2.3", { root: dir }), /isn't above/);
  assert.throws(() => bump("1.3", { root: dir }), /x\.y\.z/);
  const r = bump("1.3.0", { root: dir, date: "2026-02-02" });
  assert.strictEqual(r.tags, 2);
  assert.ok(fs.readFileSync(path.join(dir, "src", "app.js"), "utf8").includes('APP_VERSION = "1.3.0"'));
  assert.ok(!fs.readFileSync(path.join(dir, "index.html"), "utf8").includes("1.2.3"));
  assert.ok(fs.readFileSync(path.join(dir, "sw.js"), "utf8").includes("waypage-v8"));
  const log = fs.readFileSync(path.join(dir, "CHANGELOG.md"), "utf8");
  assert.ok(log.startsWith("# Changelog\n\n## [1.3.0] - 2026-02-02\n\n### Added\n- A thing.\n"));
  assert.throws(() => bump("1.4.0", { root: dir }), /no '## Unreleased'/);
});

test("every ?v= in index.html is APP_VERSION", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const vs = [...html.matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  assert.ok(vs.length > 0);
  for (const v of vs) assert.strictEqual(v, appVersion());
});

test("versionCode goes up with every version", () => {
  assert.strictEqual(versionCode("0.1.0"), 1000);
  assert.ok(versionCode("0.2.0") > versionCode("0.1.9"));
  assert.ok(versionCode("1.0.0") > versionCode("0.999.999"));
  assert.throws(() => versionCode("0.1"));
});

test("the manifest gains the updater's permission and the share target, once", () => {
  const xml = '<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '    <application android:label="Waypage">\n' +
    '        <activity\n            android:name=".MainActivity"\n            android:launchMode="singleTask"\n            android:exported="true">\n' +
    '            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n            </intent-filter>\n' +
    '        </activity>\n    </application>\n</manifest>\n';
  const once = manifest.patch(xml);
  assert.ok(/<manifest[^>]*>\s*<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" \/>/.test(once));
  const activity = once.slice(once.indexOf("<activity"), once.indexOf("</activity>"));
  assert.ok(/android.intent.action.SEND"[\s\S]*android.intent.category.DEFAULT"[\s\S]*android:mimeType="text\/plain"/.test(activity));
  assert.ok(/android.intent.action.VIEW"[\s\S]*android:mimeType="application\/epub\+zip"[\s\S]*android:mimeType="application\/x-cbz"/.test(activity));
  assert.ok(activity.includes('<meta-data android:name="android.app.shortcuts" android:resource="@xml/waypage_shortcuts" />'));
  assert.strictEqual(manifest.patch(once), once);
  assert.throws(() => manifest.patch("<manifest><application></application></manifest>"));
});

test("the share target plugin is a local Capacitor plugin the app depends on", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.strictEqual(pkg.devDependencies["waypage-share"], "file:native/share");
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, "native", "share", "package.json"), "utf8"));
  assert.strictEqual(plugin.capacitor.android.src, "android");
  const java = fs.readFileSync(path.join(ROOT, "native", "share", "android", "src", "main", "java", "io", "github", "danielnoam", "waypage", "share", "ShareTargetPlugin.java"), "utf8");
  assert.ok(/@CapacitorPlugin\(name = "ShareTarget"\)/.test(java));
  const files = fs.readFileSync(path.join(ROOT, "native", "share", "android", "src", "main", "java", "io", "github", "danielnoam", "waypage", "share", "FilesPlugin.java"), "utf8");
  assert.ok(/@CapacitorPlugin\(name = "Files"\)/.test(files));
  // The lasting permission is the whole point of the system's picker.
  assert.ok(/takePersistableUriPermission/.test(files));
});

test("android.yml patches the manifest and the updater's plugin is installed", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  assert.ok(/npx cap add android\s+node tools\/android-manifest\.js/.test(yml));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.ok(pkg.devDependencies["@capawesome-team/capacitor-file-opener"]);
});

// Kokoro voices: sherpa-onnx's library is fetched at one pinned,
// checked version before Gradle runs, and the Java mirror of its JNI
// classes says the same version (the fields must match it).
test("the Kokoro engine library is pinned, checked and fetched before the build", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  const sh = fs.readFileSync(path.join(ROOT, "tools", "sherpa-lib.sh"), "utf8");
  const mirror = fs.readFileSync(path.join(ROOT, "native", "share", "android", "src", "main", "java", "com", "k2fsa", "sherpa", "onnx", "OfflineTts.java"), "utf8");
  const kokoro = fs.readFileSync(path.join(ROOT, "native", "share", "android", "src", "main", "java", "io", "github", "danielnoam", "waypage", "share", "Kokoro.java"), "utf8");
  assert.ok(/bash tools\/sherpa-lib\.sh\s+- run: npx cap sync android/.test(yml));
  const v = /^V=(\S+)$/m.exec(sh)[1];
  assert.ok(/^SHA=[0-9a-f]{64}$/m.test(sh));
  assert.ok(/sha256sum -c/.test(sh));
  assert.ok(mirror.includes("Tts.kt at v" + v + "."), "OfflineTts.java mirrors a different sherpa-onnx version");
  const packs = kokoro.match(/new Pack\([^;]*?\.tar\.bz2",\s*"([^"]*)"/g) || [];
  assert.ok(packs.length >= 3, "Kokoro's downloads");
  for (const p of packs) assert.ok(/\.tar\.bz2",\s*"[0-9a-f]{64}"$/.test(p), "every Kokoro download is pinned to a SHA-256: " + p.slice(0, 60));
  assert.ok(/MessageDigest\.getInstance\("SHA-256"\)/.test(kokoro));
  assert.ok(/getCanonicalPath\(\)\.startsWith\(rootPath\)/.test(kokoro), "unpacking must keep files inside the voices folder");
});

test("the updater downloads the asset the workflow publishes", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  const platform = fs.readFileSync(path.join(ROOT, "src", "platform.js"), "utf8");
  assert.ok(/gh release create "app-v\$V" Waypage\.apk/.test(yml));
  assert.ok(platform.includes('"/releases/download/" + tag + "/" + file'));
  assert.ok(platform.includes('file = "Waypage.apk", tag = "app-v" + version'));
});

// Test builds (1.48.0): a branch's APK goes on test-<branch>, a
// pre-release, so releases/latest never names it; the iOS workflow adds
// the IPA to the same one, and the cleanup workflow removes it.
test("a branch's build is published as a pre-release the updater never sees", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "android.yml"), "utf8");
  const ios = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ios.yml"), "utf8");
  const sh = fs.readFileSync(path.join(ROOT, "tools", "test-build.sh"), "utf8");
  const tidy = fs.readFileSync(path.join(ROOT, ".github", "workflows", "test-builds.yml"), "utf8");
  assert.ok(/branches: \["\*\*"\]/.test(yml) && /branches: \["\*\*"\]/.test(ios));
  assert.ok(/github\.ref != 'refs\/heads\/main'[\s\S]*test-build\.sh create Waypage\.apk/.test(yml));
  assert.ok(/github\.ref != 'refs\/heads\/main'[\s\S]*test-build\.sh attach Waypage\.ipa/.test(ios));
  assert.ok(sh.includes("--prerelease") && sh.includes('gh pr list --head "$BRANCH" --state open'));
  assert.ok(/^TAG="test-/m.test(sh) && tidy.includes('"test-$NAME"') && tidy.includes("--cleanup-tag"));
  const start = fs.readFileSync(path.join(ROOT, "src", "app-start.js"), "utf8");
  assert.ok(start.includes('/releases?per_page=') && start.includes('r.prerelease && /^(test|preview)-/.test(r.tag_name)'));
});

// The iOS project (1.6.0): what tools/ios-project.js and ios-extensions.rb
// edit, checked against the template Capacitor writes, and the names the
// extensions and the App Group go by kept in step across their files.
const iosProject = require("../tools/ios-project.js");

test("the AppDelegate registers the feed check at launch, once", () => {
  // Capacitor's own template, as `npx cap add ios` writes it.
  const tpl = path.join(ROOT, "node_modules", "@capacitor", "cli", "assets", "ios-pods-template.tar.gz");
  const src = require("child_process").execFileSync("tar", ["-xzOf", tpl, "App/App/AppDelegate.swift"], { encoding: "utf8" });
  const once = iosProject.patchAppDelegate(src);
  assert.ok(/import Capacitor\nimport WaypageShare/.test(once));
  assert.ok(/-> Bool \{\n        FeedsPlugin\.registerBackground\(\)\n/.test(once));
  assert.strictEqual(iosProject.patchAppDelegate(once), once);
  assert.throws(() => iosProject.patchAppDelegate("import UIKit\n"));
});

test("Info.plist gains the document types, link schemes and background check", () => {
  const xml = '<?xml version="1.0"?>\n<plist version="1.0">\n<dict>\n</dict>\n</plist>\n';
  const out = iosProject.patchPlist(xml);
  for (const k of ["CFBundleDocumentTypes", "UTImportedTypeDeclarations", "CFBundleURLTypes", "BGTaskSchedulerPermittedIdentifiers", "ALTAppGroups"]) {
    assert.ok(out.includes("<key>" + k + "</key>"), k);
  }
  assert.ok(out.includes("<string>waypage</string>") && out.includes("<string>waypage-widget</string>"));
  assert.ok(/<string>audio<\/string>\s*<string>fetch<\/string>/.test(out));
  assert.strictEqual(iosProject.patchPlist(out), out);
});

// The app icon's shortcuts (1.14.0): the same three on both phones, each
// a waypage-widget:// address the widget plugins already take.
test("the app icon's shortcuts are wired up on Android and iOS", () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const res = "native/share/android/src/main/res/";
  const xml = read(res + "xml/waypage_shortcuts.xml");
  const appId = JSON.parse(read("capacitor.config.json")).appId;
  const kinds = [...xml.matchAll(/android:data="waypage-widget:\/\/(\w+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(kinds, ["reading", "search", "paste"]);
  for (const m of xml.matchAll(/android:targetPackage="([^"]+)"/g)) assert.strictEqual(m[1], appId);
  for (const m of xml.matchAll(/android:targetClass="([^"]+)"/g)) assert.strictEqual(m[1], appId + ".MainActivity");
  for (const m of xml.matchAll(/@drawable\/(\w+)/g)) assert.ok(fs.existsSync(path.join(ROOT, res, "drawable", m[1] + ".xml")), m[1]);
  const strings = read(res + "values/waypage_shortcuts.xml");
  for (const m of xml.matchAll(/@string\/(\w+)/g)) assert.ok(strings.includes('name="' + m[1] + '"'), m[1]);
  assert.ok(xml.includes('android:action="' + "io.github.danielnoam.waypage.WIDGET" + '"'));
  assert.ok(read("native/share/android/src/main/java/io/github/danielnoam/waypage/share/Widgets.java").includes('OPEN = "io.github.danielnoam.waypage.WIDGET"'));
  const plist = iosProject.patchPlist('<?xml version="1.0"?>\n<plist version="1.0">\n<dict>\n</dict>\n</plist>\n');
  assert.deepStrictEqual([...plist.matchAll(/<string>waypage-widget:\/\/(\w+)<\/string>/g)].map((m) => m[1]), kinds);
  const tpl = path.join(ROOT, "node_modules", "@capacitor", "cli", "assets", "ios-pods-template.tar.gz");
  const src = require("child_process").execFileSync("tar", ["-xzOf", tpl, "App/App/SceneDelegate.swift"], { encoding: "utf8" });
  const once = iosProject.patchSceneDelegate(src);
  assert.ok(/import Capacitor\nimport WaypageShare/.test(once));
  assert.ok(/connectionOptions\)\n        WidgetsPlugin\.shortcut\(connectionOptions\.shortcutItem, launching: true\)\n/.test(once));
  assert.ok(/performActionFor shortcutItem[^\n]*\{\n        completionHandler\(WidgetsPlugin\.shortcut\(shortcutItem\)\)/.test(once));
  assert.strictEqual(iosProject.patchSceneDelegate(once), once);
  assert.ok(read("native/share/ios/Sources/WidgetsPlugin/WidgetsPlugin.swift").includes('CAPPluginMethod(name: "copied"'));
});

test("the feed check's task id, the App Group and the link schemes agree everywhere", () => {
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const feeds = read("native/share/ios/Sources/FeedsPlugin/FeedsPlugin.swift");
  assert.ok(feeds.includes('"io.github.danielnoam.waypage.feeds"'));
  assert.ok(read("tools/ios-project.js").includes('"io.github.danielnoam.waypage.feeds"'));
  const group = "group.io.github.danielnoam.waypage";
  assert.ok(read("native/share/ios/Shared/WaypageShared.swift").includes('"' + group + '"'));
  for (const f of ["App.entitlements", "Widgets/WaypageWidgets.entitlements", "ShareExtension/WaypageShare.entitlements", "Widgets/Info.plist", "ShareExtension/Info.plist"]) {
    assert.ok(read("native/share/ios/" + f).includes(group), f);
  }
  assert.ok(read("native/share/ios/Sources/WidgetsPlugin/WidgetsPlugin.swift").includes('"waypage-widget"'));
  assert.ok(read("native/share/ios/Sources/ShareTargetPlugin/ShareTargetPlugin.swift").includes('"waypage"'));
});

test("the workflow adds and signs the extensions ios-extensions.rb names", () => {
  const yml = fs.readFileSync(path.join(ROOT, ".github", "workflows", "ios.yml"), "utf8");
  const rb = fs.readFileSync(path.join(ROOT, "tools", "ios-extensions.rb"), "utf8");
  assert.ok(/node tools\/ios-project\.js[\s\S]*ruby tools\/ios-extensions\.rb[\s\S]*npx cap sync ios/.test(yml));
  for (const name of ["WaypageShareExtension", "WaypageWidgets"]) {
    assert.ok(rb.includes("name: '" + name + "'"), name);
    assert.ok(yml.includes("Payload/App.app/PlugIns/" + name + ".appex"), name);
  }
  assert.ok(fs.readFileSync(path.join(ROOT, "native", "share", "WaypageShare.podspec"), "utf8").includes("ios/Shared/**/*.swift"));
});

test("no class the share extension or widgets compile is taken for a plugin", () => {
  for (const f of ["native/share/ios/ShareExtension/ShareViewController.swift", "native/share/ios/Widgets/WaypageWidgets.swift", "native/share/ios/Shared/WaypageShared.swift"]) {
    assert.ok(!/@objc\(/.test(fs.readFileSync(path.join(ROOT, f), "utf8")), f);
  }
});

// The page's scripts share one global scope, so two files with the same
// top-level name means the later one silently replaces the earlier (1.49.0:
// the reader's switchRow took over Settings' and broke the Narrate section).
test("no two scripts index.html loads declare the same top-level name", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const seen = {};
  for (const [, f] of html.matchAll(/<script src="([^"?]+)/g)) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    const first = src.replace(/^(\s*(\/\/.*|\/\*[\s\S]*?\*\/))*\s*/, "");
    if (first.startsWith("(")) continue;
    for (const m of src.matchAll(/^(?:async\s+)?(?:function\*?\s+(\w+)|(?:const|let|class)\s+(\w+))/gm)) {
      const name = m[1] || m[2];
      assert.ok(!seen[name], name + " is declared in both " + seen[name] + " and " + f);
      seen[name] = f;
    }
  }
});

console.log("\n" + passed + " passed");
