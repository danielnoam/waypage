// Adds what Waypage needs to the generated iOS project, and stamps the
// version. From LifeLog's tools/ios-project.js, without its widgets and
// Face ID entries.
//
//   node tools/ios-project.js
//
// Info.plist gains ITSAppUsesNonExemptEncryption = false (the app uses only
// the system's HTTPS), which spares a question on every TestFlight upload,
// and the "audio" background mode, so Read aloud (0.27.0) goes on with the
// screen locked, and NSCameraUsageDescription for scanning sync's setup
// code (0.30.1): on iOS the scanner plugin opens the camera itself, and iOS
// closes an app that does that without saying why. UIFileSharingEnabled
// and LSSupportsOpeningDocumentsInPlace (0.33.0) show the app's Documents
// folder, where the library already is, in the Files app as "Waypage".
// The oldest iOS goes from the template's 15.0 to 15.5, in the project and
// the Podfile alike: Google's ML Kit, which the scanner is built on, needs
// 15.5, and pod install refuses a project asking for less than a pod.
// project.pbxproj gets MARKETING_VERSION = APP_VERSION and
// CURRENT_PROJECT_VERSION = the same number Android's versionCode is.
//
// 1.6.0 adds what iOS needed to catch up with Android:
// - CFBundleDocumentTypes, with UTImportedTypeDeclarations for the kinds
//   iOS doesn't know (Markdown, comic book zips; Kindle books and FB2 since
//   1.42.0), so a book, PDF or note opens in Waypage from Files, Mail or
//   another app ("Open in"); it
//   arrives as an open-URL event (ShareTargetPlugin).
// - CFBundleURLTypes for waypage:// (the share extension handing over a
//   link) and waypage-widget:// (a widget's tap).
// - The "fetch" background mode and BGTaskSchedulerPermittedIdentifiers, for
//   feeds checked with the app closed (FeedsPlugin), whose handler the
//   AppDelegate registers at launch, before any plugin has loaded.
// - ALTAppGroups, the App Group the extensions share with the app
//   (tools/ios-extensions.rb). AltStore and SideStore register it under a
//   name of their own and rewrite this list; WPGroup reads it.
//
// 1.14.0 adds the app icon's Quick Actions: UIApplicationShortcutItems
// (Continue reading, Search, Save the copied link), each a waypage-widget://
// address, and the SceneDelegate handing them to WidgetsPlugin.shortcut,
// at launch and with the app running.
//
// Idempotent, and fails loudly if what it edits isn't where it expects.
const fs = require("fs");
const path = require("path");
const { appVersion } = require("./build-www");
const { versionCode } = require("./android-version");

const GROUP = "group.io.github.danielnoam.waypage";
const FEEDS_TASK = "io.github.danielnoam.waypage.feeds";
const arr = (items) => "<array>\n" + items.map((i) => "\t\t" + i + "\n").join("") + "\t</array>";
const str = (v) => "<string>" + v + "</string>";
// [name, its type identifiers, rank]: Alternate leaves the phone's own
// default app for a kind alone (Books for EPUB, Files for PDF).
const DOCS = [
  ["Book", ["org.idpf.epub-container"], "Alternate"],
  ["PDF", ["com.adobe.pdf"], "Alternate"],
  ["Comic", ["io.github.danielnoam.waypage.cbz"], "Owner"],
  ["Kindle book", ["io.github.danielnoam.waypage.mobi"], "Alternate"],
  ["FB2 book", ["io.github.danielnoam.waypage.fb2"], "Owner"],
  ["Note", ["net.daringfireball.markdown", "public.plain-text", "public.html"], "Alternate"],
  ["Email", ["com.apple.mail.email"], "Alternate"],
];
const docType = ([name, types, rank]) => "<dict>\n"
  + "\t\t\t<key>CFBundleTypeName</key>\n\t\t\t" + str(name) + "\n"
  + "\t\t\t<key>CFBundleTypeRole</key>\n\t\t\t" + str("Viewer") + "\n"
  + "\t\t\t<key>LSHandlerRank</key>\n\t\t\t" + str(rank) + "\n"
  + "\t\t\t<key>LSItemContentTypes</key>\n\t\t\t<array>" + types.map(str).join("") + "</array>\n\t\t</dict>";
const imported = (id, desc, conforms, exts, mimes) => "<dict>\n"
  + "\t\t\t<key>UTTypeIdentifier</key>\n\t\t\t" + str(id) + "\n"
  + "\t\t\t<key>UTTypeDescription</key>\n\t\t\t" + str(desc) + "\n"
  + "\t\t\t<key>UTTypeConformsTo</key>\n\t\t\t<array>" + conforms.map(str).join("") + "</array>\n"
  + "\t\t\t<key>UTTypeTagSpecification</key>\n\t\t\t<dict><key>public.filename-extension</key><array>" + exts.map(str).join("")
  + "</array><key>public.mime-type</key><array>" + mimes.map(str).join("") + "</array></dict>\n\t\t</dict>";
const quick = ([kind, title, symbol]) => "<dict>\n"
  + "\t\t\t<key>UIApplicationShortcutItemType</key>\n\t\t\t" + str("waypage-widget://" + kind) + "\n"
  + "\t\t\t<key>UIApplicationShortcutItemTitle</key>\n\t\t\t" + str(title) + "\n"
  + "\t\t\t<key>UIApplicationShortcutItemIconSymbolName</key>\n\t\t\t" + str(symbol) + "\n\t\t</dict>";
const scheme = (name) => "<dict>\n\t\t\t<key>CFBundleURLName</key>\n\t\t\t" + str("io.github.danielnoam." + name)
  + "\n\t\t\t<key>CFBundleURLSchemes</key>\n\t\t\t<array>" + str(name) + "</array>\n\t\t</dict>";

const PLIST = [
  ["ITSAppUsesNonExemptEncryption", "<false/>"],
  ["UIBackgroundModes", arr([str("audio"), str("fetch")])],
  ["BGTaskSchedulerPermittedIdentifiers", arr([str(FEEDS_TASK)])],
  ["NSCameraUsageDescription", "<string>Waypage uses the camera to read the sync setup code from your other device.</string>"],
  ["UIFileSharingEnabled", "<true/>"],
  ["LSSupportsOpeningDocumentsInPlace", "<true/>"],
  ["CFBundleDocumentTypes", arr(DOCS.map(docType))],
  ["UTImportedTypeDeclarations", arr([
    imported("io.github.danielnoam.waypage.cbz", "Comic book", ["public.zip-archive", "public.data"], ["cbz"], ["application/vnd.comicbook+zip", "application/x-cbz"]),
    imported("net.daringfireball.markdown", "Markdown", ["public.plain-text"], ["md", "markdown"], ["text/markdown", "text/x-markdown"]),
    imported("io.github.danielnoam.waypage.mobi", "Kindle book", ["public.data"], ["mobi", "azw", "azw3", "prc"], ["application/x-mobipocket-ebook", "application/vnd.amazon.ebook"]),
    imported("io.github.danielnoam.waypage.fb2", "FB2 book", ["public.xml"], ["fb2"], ["application/x-fictionbook+xml"]),
  ])],
  ["CFBundleURLTypes", arr([scheme("waypage"), scheme("waypage-widget")])],
  ["ALTAppGroups", arr([str(GROUP)])],
  ["UIApplicationShortcutItems", arr([["reading", "Continue reading", "book"], ["search", "Search", "magnifyingglass"],
    ["paste", "Save the copied link", "doc.on.clipboard"]].map(quick))],
];
const MIN_IOS = "15.5";

function raiseMinIos(podfile) {
  if (!/platform :ios, '[\d.]+'/.test(podfile)) throw new Error("Podfile has no platform :ios line");
  return podfile.replace(/platform :ios, '[\d.]+'/, "platform :ios, '" + MIN_IOS + "'");
}

function patchPlist(xml) {
  let out = xml;
  for (const [key, value] of PLIST) {
    if (out.includes("<key>" + key + "</key>")) continue;
    const end = out.lastIndexOf("</dict>");
    if (end < 0 || !/<plist\b/.test(out)) throw new Error("Info.plist has no top-level <dict>");
    out = out.slice(0, end) + "\t<key>" + key + "</key>\n\t" + value + "\n" + out.slice(end);
  }
  return out;
}

// The feed check's background task has to be registered before the app
// finishes launching (FeedsPlugin.registerBackground).
function patchAppDelegate(src) {
  if (src.includes("FeedsPlugin.registerBackground()")) return src;
  const launch = /(func application\(_ application: UIApplication, didFinishLaunchingWithOptions[^{]*\{\n)/;
  if (!launch.test(src) || !/^import Capacitor$/m.test(src)) throw new Error("AppDelegate.swift has no didFinishLaunchingWithOptions to add to");
  return src
    .replace(/^import Capacitor$/m, "import Capacitor\nimport WaypageShare")
    .replace(launch, "$1        FeedsPlugin.registerBackground()\n");
}

// The Quick Actions (1.14.0): one that launched the app comes with the
// scene's connection, one with the app running through the scene.
function patchSceneDelegate(src) {
  if (src.includes("WidgetsPlugin.shortcut(")) return src;
  const connect = /^([ \t]*)SceneDelegateProxy\.shared\.scene\(scene, willConnectTo: session, options: connectionOptions\)\n/m;
  const end = /\n\}\s*$/;
  if (!connect.test(src) || !end.test(src) || !/^import Capacitor$/m.test(src)) throw new Error("SceneDelegate.swift isn't the template tools/ios-project.js expects");
  return src
    .replace(/^import Capacitor$/m, "import Capacitor\nimport WaypageShare")
    .replace(connect, (m, sp) => m + sp + "WidgetsPlugin.shortcut(connectionOptions.shortcutItem, launching: true)\n")
    .replace(end, "\n\n    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem, completionHandler: @escaping (Bool) -> Void) {\n"
      + "        completionHandler(WidgetsPlugin.shortcut(shortcutItem))\n    }\n}\n");
}

function stampPbxproj(src, v) {
  const build = versionCode(v);
  if (!/MARKETING_VERSION = [^;]+;/.test(src) || !/CURRENT_PROJECT_VERSION = [^;]+;/.test(src)) {
    throw new Error("project.pbxproj has no MARKETING_VERSION / CURRENT_PROJECT_VERSION to stamp");
  }
  return src
    .replace(/MARKETING_VERSION = [^;]+;/g, "MARKETING_VERSION = " + v + ";")
    .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, "CURRENT_PROJECT_VERSION = " + build + ";")
    .replace(/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/g, "IPHONEOS_DEPLOYMENT_TARGET = " + MIN_IOS + ";");
}

if (require.main === module) {
  const app = path.resolve(__dirname, "..", "ios", "App");
  const plist = path.join(app, "App", "Info.plist");
  const pbx = path.join(app, "App.xcodeproj", "project.pbxproj");
  const v = appVersion();
  fs.writeFileSync(plist, patchPlist(fs.readFileSync(plist, "utf8")));
  fs.writeFileSync(pbx, stampPbxproj(fs.readFileSync(pbx, "utf8"), v));
  const delegate = path.join(app, "App", "AppDelegate.swift");
  fs.writeFileSync(delegate, patchAppDelegate(fs.readFileSync(delegate, "utf8")));
  const scene = path.join(app, "App", "SceneDelegate.swift");
  fs.writeFileSync(scene, patchSceneDelegate(fs.readFileSync(scene, "utf8")));
  const podfile = path.join(app, "Podfile");
  fs.writeFileSync(podfile, raiseMinIos(fs.readFileSync(podfile, "utf8")));
  console.log("ios: Info.plist has " + PLIST.length + " Waypage key(s); version " + v + " (" + versionCode(v) + "); iOS " + MIN_IOS + " and later");
}
module.exports = { patchPlist, stampPbxproj, raiseMinIos, patchAppDelegate, patchSceneDelegate, PLIST, MIN_IOS };
