import BackgroundTasks
import Capacitor
import UIKit
import UserNotifications
#if canImport(WidgetKit)
import WidgetKit
#endif

// Feeds checked with the app closed, on iOS (1.6.0): the same calls as
// Android's FeedsPlugin.java,
//
//   watch({ feeds: [{ url, title, known }], ask, notes })   the feeds to read
//                 and the posts the app has; none stops the checks. `ask` asks
//                 to notify; `notes` is how (1.30.0), as on Android.
//   news()        { feeds: [url], open, feed, save } once: the feeds with new
//                 posts since, whether a notification opened the app, the
//                 feed it was for and the post its Save asked for.
//   allowed()     { allowed }: whether the phone lets Waypage notify.
//   settings()    opens Waypage's notification settings.
//
// and an "open" event when a notification brings the running app back.
//
// Android runs a job every three hours; iOS runs a background refresh when
// it decides to, often hours late and less for an app that's rarely opened.
// The check itself is FeedCheck below, a port of FeedCheckJob.java: nothing
// is saved, it only notices new posts and says so.
//
// BGTaskScheduler wants its handler registered before the app finishes
// launching, earlier than any plugin loads, so tools/ios-project.js has the
// AppDelegate call FeedsPlugin.registerBackground().
@objc(FeedsPlugin)
public class FeedsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FeedsPlugin"
    public let jsName = "Feeds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "watch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "news", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "allowed", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "settings", returnType: CAPPluginReturnPromise)
    ]

    static let task = "io.github.danielnoam.waypage.feeds"
    static let openedNote = Notification.Name("WaypageFeedsOpened")

    override public func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(opened), name: FeedsPlugin.openedNote, object: nil)
    }

    @objc private func opened() {
        notifyListeners("open", data: [:], retainUntilConsumed: true)
    }

    @objc public static func registerBackground() {
        UNUserNotificationCenter.current().delegate = NoteTaps.shared
        let save = UNNotificationAction(identifier: FeedCheck.saveAction, title: "Save", options: [.foreground])
        UNUserNotificationCenter.current().setNotificationCategories([
            UNNotificationCategory(identifier: FeedCheck.postCategory, actions: [save], intentIdentifiers: [], options: [])
        ])
        BGTaskScheduler.shared.register(forTaskWithIdentifier: task, using: nil) { t in
            guard let refresh = t as? BGAppRefreshTask else { t.setTaskCompleted(success: false); return }
            FeedsPlugin.schedule(true)
            let check = FeedCheck()
            refresh.expirationHandler = { check.stop() }
            check.run { refresh.setTaskCompleted(success: true) }
        }
    }

    static func schedule(_ on: Bool) {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: task)
        guard on else { return }
        let r = BGAppRefreshTaskRequest(identifier: task)
        r.earliestBeginDate = Date(timeIntervalSinceNow: 3 * 60 * 60)
        try? BGTaskScheduler.shared.submit(r)
    }

    @objc func watch(_ call: CAPPluginCall) {
        let feeds = call.getArray("feeds") ?? []
        WPStore.write("feeds.json", feeds)
        if let notes = call.getObject("notes") { WPStore.write("feeds-notes.json", notes) }
        FeedsPlugin.schedule(!feeds.isEmpty)
        if call.getBool("ask") ?? false {
            UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
        }
        call.resolve()
    }

    @objc func news(_ call: CAPPluginCall) {
        let waiting = (WPStore.read("feeds-waiting.json") as? [String: Any]) ?? [:]
        FeedCheck.clear()
        let taps = NoteTaps.shared
        var out: [String: Any] = ["feeds": Array(waiting.keys), "open": taps.opened]
        if let f = taps.feed { out["feed"] = f }
        if let s = taps.save { out["save"] = s }
        taps.opened = false
        taps.feed = nil
        taps.save = nil
        call.resolve(out)
    }

    @objc func allowed(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { s in
            call.resolve(["allowed": s.authorizationStatus == .authorized || s.authorizationStatus == .provisional || s.authorizationStatus == .ephemeral])
        }
    }

    @objc func settings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            var link = UIApplication.openSettingsURLString
            if #available(iOS 16.0, *) { link = UIApplication.openNotificationSettingsURLString }
            guard let url = URL(string: link) else { call.reject("Couldn't open Settings"); return }
            UIApplication.shared.open(url)
            call.resolve()
        }
    }
}

// A tap on the notification, which can come before any plugin has loaded.
final class NoteTaps: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NoteTaps()
    var opened = false
    var feed: String?
    var save: String?

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
        let note = response.notification
        if note.request.identifier.hasPrefix(FeedCheck.noteId) {
            opened = true
            feed = note.request.content.userInfo["feed"] as? String
            if response.actionIdentifier == FeedCheck.saveAction {
                save = note.request.content.userInfo["link"] as? String
                center.removeDeliveredNotifications(withIdentifiers: [note.request.identifier])
            }
            NotificationCenter.default.post(name: FeedsPlugin.openedNote, object: nil)
        }
        done()
    }

    // With the app open the posts are already in Feeds; no banner.
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([])
    }
}

final class FeedCheck {
    static let noteId = "waypage-feeds"
    static let postCategory = "waypage-post"
    static let saveAction = "save"
    private static let maxEach = 5
    private static let maxKept = 20
    private static let summary = 300
    private static let maxItems = 50
    private static let maxTold = 300
    private static let maxBytes = 4 * 1024 * 1024
    private static let accept = "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8"
    private static let agent = "Mozilla/5.0 (iPhone; CPU iPhone OS like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile Waypage (offline reader; https://github.com/danielnoam/waypage)"

    private var stopped = false
    private let session: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 20
        c.timeoutIntervalForResource = 40
        return URLSession(configuration: c)
    }()

    func stop() {
        stopped = true
        session.invalidateAndCancel()
    }

    func run(_ done: @escaping () -> Void) {
        DispatchQueue.global(qos: .utility).async {
            self.check()
            done()
        }
    }

    private func check() {
        let watch = (WPStore.read("feeds.json") as? [[String: Any]]) ?? []
        if watch.isEmpty { return }
        var told = (WPStore.read("feeds-told.json") as? [String: [String]]) ?? [:]
        var waiting = (WPStore.read("feeds-waiting.json") as? [String: [String: Any]]) ?? [:]
        var fresh: [String: [[String: String]]] = [:]
        var found = false
        for f in watch {
            if stopped { break }
            guard let address = f["url"] as? String, address.hasPrefix("http"), let url = URL(string: address) else { continue }
            guard let posts = read(url) else { continue }
            var known = Set((f["known"] as? [String]) ?? [])
            let t = told[address] ?? []
            known.formUnion(t)
            var keysNow: [String] = []
            var news: [[String: String]] = []
            for post in posts where !post.keys.contains(where: { known.contains($0) }) {
                keysNow += post.keys
                news.append(["title": post.title, "text": post.text, "link": post.link])
            }
            if news.isEmpty { continue }
            told[address] = Array((keysNow + t).prefix(FeedCheck.maxTold))
            var w = waiting[address] ?? ["title": f["title"] as? String ?? "", "count": 0]
            w["count"] = ((w["count"] as? NSNumber)?.intValue ?? 0) + news.count
            w["posts"] = Array((news + ((w["posts"] as? [[String: String]]) ?? [])).prefix(FeedCheck.maxKept))
            waiting[address] = w
            fresh[address] = news
            found = true
        }
        if !found { return }
        WPStore.write("feeds-told.json", told)
        WPStore.write("feeds-waiting.json", waiting)
        FeedCheck.notify(waiting, fresh)
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }

    // ---- Reading a feed: each post as the set of ids it can go by ----

    private func read(_ url: URL) -> [FeedPost]? {
        var req = URLRequest(url: url)
        req.setValue(FeedCheck.accept, forHTTPHeaderField: "Accept")
        req.setValue(FeedCheck.agent, forHTTPHeaderField: "User-Agent")
        let wait = DispatchSemaphore(value: 0)
        var body: Data?
        var final = url
        session.dataTask(with: req) { data, res, _ in
            if let h = res as? HTTPURLResponse, h.statusCode == 200, let d = data, d.count <= FeedCheck.maxBytes {
                body = d
                final = h.url ?? url
            }
            wait.signal()
        }.resume()
        wait.wait()
        guard let d = body else { return nil }
        let first = d.first { !($0 == 0x20 || $0 == 0x09 || $0 == 0x0a || $0 == 0x0d || $0 >= 0xef) }
        if first == UInt8(ascii: "{") { return FeedCheck.fromJson(d, final) }
        return PostsParser(base: final).parse(d)
    }

    private static func fromJson(_ d: Data, _ base: URL) -> [FeedPost] {
        guard let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let items = o["items"] as? [[String: Any]] else { return [] }
        var out: [FeedPost] = []
        for it in items.prefix(maxItems) {
            var post = FeedPost()
            if let id = it["id"] { add(&post.keys, clean("\(id)")) }
            let u = absolute(it["url"] as? String, base)
            add(&post.keys, u)
            add(&post.keys, absolute(it["external_url"] as? String, base))
            post.link = u ?? ""
            post.title = plain(it["title"] as? String, 120)
            let s = [it["summary"], it["content_text"], it["content_html"]].compactMap { $0 as? String }
                .first { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            post.text = plain(s, summary)
            if post.title.isEmpty { post.title = plain(post.text, 80) }
            if !post.keys.isEmpty { out.append(post) }
        }
        return out
    }

    // HTML as its words, cut at a word near `max`. Nothing of it is shown
    // as markup.
    static func plain(_ s: String?, _ max: Int) -> String {
        guard var v = s, !v.isEmpty else { return "" }
        if v.contains("<") {
            v = v.replacingOccurrences(of: "<(script|style)[^>]*>[\\s\\S]*?</\\1>", with: " ", options: [.regularExpression, .caseInsensitive])
            v = v.replacingOccurrences(of: "<[^>]*>", with: " ", options: .regularExpression)
        }
        if v.contains("&") { v = entities(v) }
        v = clean(v)
        if v.count <= max { return v }
        let head = String(v.prefix(max))
        if let cut = head.lastIndex(of: " "), head.distance(from: head.startIndex, to: cut) > max / 2 { return String(head[..<cut]) + "…" }
        return head + "…"
    }

    private static let named = ["amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "nbsp": " ", "hellip": "…",
                                "mdash": "—", "ndash": "–", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”"]

    private static func entities(_ s: String) -> String {
        guard let re = try? NSRegularExpression(pattern: "&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);") else { return s }
        var out = ""
        var last = s.startIndex
        for m in re.matches(in: s, range: NSRange(s.startIndex..., in: s)) {
            guard let r = Range(m.range, in: s), let n = Range(m.range(at: 1), in: s) else { continue }
            out += s[last..<r.lowerBound]
            let name = String(s[n])
            var rep: String? = named[name]
            if name.hasPrefix("#x"), let c = UInt32(name.dropFirst(2), radix: 16), let u = Unicode.Scalar(c) { rep = String(u) }
            else if name.hasPrefix("#"), let c = UInt32(name.dropFirst()), let u = Unicode.Scalar(c) { rep = String(u) }
            out += rep ?? String(s[r])
            last = r.upperBound
        }
        return out + s[last...]
    }

    // As src/feeds.js's clean(): spaces run together, ends trimmed.
    static func clean(_ s: String) -> String {
        let v = s.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        return v.count > 500 ? String(v.prefix(500)) : v
    }

    static func absolute(_ href: String?, _ base: URL) -> String? {
        guard let h = href?.trimmingCharacters(in: .whitespacesAndNewlines), !h.isEmpty,
              let u = URL(string: h, relativeTo: base)?.absoluteURL, u.scheme == "http" || u.scheme == "https" else { return nil }
        return u.absoluteString
    }

    static func add(_ post: inout [String], _ key: String?) {
        if let k = key, !k.isEmpty, !post.contains(k) { post.append(k) }
    }

    // ---- The notifications: the app's Notifications setting, as
    // FeedCheckJob.java's. `fresh` is what this run found, the only posts
    // sent on their own, so one swiped away doesn't come back. ----

    static func notify(_ waiting: [String: [String: Any]], _ fresh: [String: [[String: String]]]) {
        let cfg = (WPStore.read("feeds-notes.json") as? [String: Any]) ?? [:]
        let style = cfg["style"] as? String ?? "each"
        if style == "off" { return }
        let quiet = Set((cfg["quiet"] as? [String]) ?? [])
        if style == "together" { together(waiting.filter { !quiet.contains($0.key) }); return }
        let center = UNUserNotificationCenter.current()
        for (url, posts) in fresh where !quiet.contains(url) {
            let feed = waiting[url]?["title"] as? String ?? ""
            for post in posts.prefix(maxEach) {
                let c = UNMutableNotificationContent()
                c.title = (post["title"] ?? "").isEmpty ? "A new post" : post["title"]!
                if !feed.isEmpty { c.subtitle = feed }
                c.body = post["text"] ?? ""
                c.threadIdentifier = noteId + "." + url
                var info: [String: String] = ["feed": url]
                if let link = post["link"], !link.isEmpty {
                    info["link"] = link
                    c.categoryIdentifier = postCategory
                }
                c.userInfo = info
                let key = post["link"].flatMap { $0.isEmpty ? nil : $0 } ?? c.title
                center.add(UNNotificationRequest(identifier: noteId + ".post." + url + " " + key, content: c, trigger: nil))
            }
            if posts.count > maxEach {
                let c = UNMutableNotificationContent()
                c.title = feed.isEmpty ? "More new posts" : feed
                c.body = "\(posts.count - maxEach) more in Feeds."
                c.threadIdentifier = noteId + "." + url
                c.userInfo = ["feed": url]
                center.add(UNNotificationRequest(identifier: noteId + ".more." + url, content: c, trigger: nil))
            }
        }
    }

    // One for every feed: how many, and from where.
    private static func together(_ waiting: [String: [String: Any]]) {
        var total = 0
        var names: [String] = []
        var feeds: [String] = []
        for (url, w) in waiting {
            let c = (w["count"] as? NSNumber)?.intValue ?? 0
            if c <= 0 { continue }
            total += c
            feeds.append(url)
            if let t = w["title"] as? String, !t.isEmpty { names.append(t) }
        }
        if total == 0 { return }
        let content = UNMutableNotificationContent()
        content.title = (total == 1 ? "A new post" : "\(total) new posts") + (names.count == 1 ? " from " + names[0] : "")
        content.body = names.count == 1 ? (total == 1 ? "Tap to see it in Feeds." : "Tap to see them in Feeds.")
            : names.count == 2 ? "From \(names[0]) and \(names[1])."
            : names.count > 2 ? "From \(names[0]), \(names[1]) and \(names.count - 2) more." : "In your feeds."
        content.threadIdentifier = noteId
        if feeds.count == 1 { content.userInfo = ["feed": feeds[0]] }
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: noteId, content: content, trigger: nil))
    }

    static func clear() {
        WPStore.remove("feeds-waiting.json")
        let center = UNUserNotificationCenter.current()
        center.getDeliveredNotifications { list in
            let ours = list.map { $0.request.identifier }.filter { $0.hasPrefix(FeedCheck.noteId) }
            if !ours.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ours) }
        }
        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}

struct FeedPost {
    var keys: [String] = []
    var title = ""
    var text = ""
    var link = ""
}

// RSS's <item> and Atom's <entry>: their guid, id and links, and what a
// notification shows: the title and the description or summary (else the
// start of the full text), as src/feeds.js reads them.
private final class PostsParser: NSObject, XMLParserDelegate {
    let base: URL
    var out: [FeedPost] = []
    var post: FeedPost?
    var summary = ""
    var full = ""
    var depth = 0
    var postDepth = -1
    var field: String?
    var text = ""
    private static let fields: Set<String> = ["guid", "id", "link", "title", "description", "summary", "encoded", "content"]

    init(base: URL) { self.base = base }

    func parse(_ d: Data) -> [FeedPost] {
        let p = XMLParser(data: d)
        p.delegate = self
        p.shouldProcessNamespaces = false
        p.parse()
        return out
    }

    private func local(_ name: String) -> String {
        guard let i = name.firstIndex(of: ":") else { return name }
        return String(name[name.index(after: i)...])
    }

    private func addLink(_ a: String?) {
        FeedCheck.add(&post!.keys, a)
        if post!.link.isEmpty, let a = a { post!.link = a }
    }

    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String] = [:]) {
        depth += 1
        let n = local(name)
        if post == nil, n == "item" || n == "entry" {
            post = FeedPost()
            summary = ""
            full = ""
            postDepth = depth
        } else if post != nil, depth == postDepth + 1 {
            if n == "link", let href = attributes["href"], attributes["rel"] == nil || attributes["rel"] == "alternate" {
                addLink(FeedCheck.absolute(href, base))
            }
            if PostsParser.fields.contains(n) {
                field = n
                text = ""
            }
        }
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        if field != nil { text += string }
    }

    func parser(_ parser: XMLParser, foundCDATA block: Data) {
        if field != nil { text += String(decoding: block, as: UTF8.self) }
    }

    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        if post != nil, let f = field, depth == postDepth + 1 {
            let v = FeedCheck.clean(text)
            switch f {
            case "title": if post!.title.isEmpty { post!.title = FeedCheck.plain(text, 120) }
            case "description", "summary": if summary.isEmpty { summary = text }
            case "encoded", "content": if full.isEmpty { full = text }
            case "link": if !v.isEmpty { addLink(FeedCheck.absolute(v, base)) }
            default:
                if !v.isEmpty {
                    FeedCheck.add(&post!.keys, v)
                    let a = FeedCheck.absolute(v, base)
                    FeedCheck.add(&post!.keys, a)
                    if f == "guid", post!.link.isEmpty, let a = a { post!.link = a }
                }
            }
            field = nil
        } else if var p = post, depth == postDepth {
            p.text = FeedCheck.plain(summary.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? full : summary, 300)
            if p.title.isEmpty { p.title = FeedCheck.plain(p.text, 80) }
            if !p.keys.isEmpty { out.append(p) }
            post = nil
            if out.count >= 50 { parser.abortParsing() }
        }
        depth -= 1
    }
}
