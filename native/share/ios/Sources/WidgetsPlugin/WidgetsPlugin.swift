import Capacitor
import UIKit
#if canImport(WidgetKit)
import WidgetKit
#endif

// Home screen widgets on iOS (1.6.0): the same calls as Android's
// WidgetsPlugin.java, so src/app.js's updateWidgets and takeWidget don't
// know which phone they're on.
//
//   update({ reading, feeds, favourites, collections })   what they draw,
//             written to the App Group for the widget extension (WPStore)
//   renamed({ from, to })   a collection widget follows its collection's
//             new name: kept in the App Group's renames.json
//   take()    { kind, id, url, name } once, what a widget's tap asked to open
//
//   copied()  { text }, what's on the clipboard, for Save the copied link
//
// and an "open" event when a tap brings the running app back. A tap opens
// waypage-widget://page/<id>, …/post?url=…, …/feeds, …/library or
// …/favourites, which arrives as an open-URL event. The app icon's Quick
// Actions (1.14.0) are …/reading, …/search and …/paste, which the
// SceneDelegate hands to `shortcut` (tools/ios-project.js).
@objc(WidgetsPlugin)
public class WidgetsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetsPlugin"
    public let jsName = "Widgets"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "renamed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "copied", returnType: CAPPluginReturnPromise)
    ]

    // A Quick Action, posted as the open-URL event a widget's tap is. At
    // launch the plugins aren't loaded yet, so it waits for the first
    // view, as Capacitor's SceneDelegateProxy does with a launch URL.
    @discardableResult
    public static func shortcut(_ item: UIApplicationShortcutItem?, launching: Bool = false) -> Bool {
        guard let item = item, let url = URL(string: item.type), url.scheme == "waypage-widget" else { return false }
        let post = { NotificationCenter.default.post(name: .capacitorOpenURL, object: ["url": url, "options": [UIApplication.OpenURLOptionsKey: Any]()] as [String: Any]) }
        if !launching { post(); return true }
        var token: NSObjectProtocol?
        token = NotificationCenter.default.addObserver(forName: .capacitorViewDidAppear, object: nil, queue: .main) { _ in
            if let token { NotificationCenter.default.removeObserver(token) }
            post()
        }
        return true
    }

    private var pending: [String: Any]?
    private var lastHandled: URL?

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(opened(_:)), name: Notification.Name.capacitorOpenURL, object: nil)
        if let url = ApplicationDelegateProxy.shared.lastURL { _ = read(url) }
    }

    @objc private func opened(_ note: Notification) {
        guard let o = note.object as? [String: Any], let url = o["url"] as? URL else { return }
        if read(url) { notifyListeners("open", data: [:], retainUntilConsumed: true) }
    }

    private func read(_ url: URL) -> Bool {
        guard url.scheme == "waypage-widget", url != lastHandled, let kind = url.host, !kind.isEmpty else { return false }
        lastHandled = url
        let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var out: [String: Any] = ["kind": kind]
        if kind == "page" || kind == "mark", let id = url.pathComponents.last, id != "/" { out["id"] = id }
        if kind == "page", q.first(where: { $0.name == "next" })?.value == "1" { out["next"] = true }
        if kind == "page", q.first(where: { $0.name == "aloud" })?.value == "1" { out["aloud"] = true }
        if kind == "mark" { out["mark"] = q.first { $0.name == "mark" }?.value ?? "" }
        if kind == "post" { out["url"] = q.first { $0.name == "url" }?.value ?? "" }
        if kind == "collection" { out["name"] = q.first { $0.name == "name" }?.value ?? "" }
        pending = out
        return true
    }

    @objc func update(_ call: CAPPluginCall) {
        var data: [String: Any] = [:]
        for (k, v) in call.options ?? [:] { if let key = k as? String { data[key] = v } }
        WPStore.write("widgets.json", data)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        call.resolve()
    }

    @objc func renamed(_ call: CAPPluginCall) {
        guard let from = call.getString("from"), let to = call.getString("to"), from != to else {
            call.resolve()
            return
        }
        var renames = (WPStore.read("renames.json") as? [String: String]) ?? [:]
        renames.removeValue(forKey: to)
        for (k, v) in renames where v == from { renames[k] = to }
        renames[from] = to
        WPStore.write("renames.json", renames)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
        call.resolve()
    }

    // Reading it asks "Allow Paste?" unless the user said always; what
    // isn't text or a link is skipped without asking.
    @objc func copied(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let board = UIPasteboard.general
            var text = ""
            if board.hasURLs, let url = board.url { text = url.absoluteString }
            else if board.hasStrings { text = board.string ?? "" }
            call.resolve(["text": text])
        }
    }

    @objc func take(_ call: CAPPluginCall) {
        let out = pending ?? [:]
        pending = nil
        call.resolve(out)
    }
}
