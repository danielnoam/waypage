// Waypage's home screen widgets on iOS (1.6.0): Keep reading, Feeds,
// Favourites and (1.9.0) a highlight a day, Android's set (0.29.0, 0.29.2) drawn from the same data, which
// the app writes to the App Group (WidgetsPlugin, WPStore.widgets). A tap
// opens the app on what was tapped through a waypage-widget:// link, read
// by WidgetsPlugin. Later, as on Android: the reading widgets (this week,
// today, days in a row) and a collection widget, whose collection is picked
// with Edit Widget (an App Intent configuration, iOS 17).
import AppIntents
import SwiftUI
import WidgetKit

// ---- Looks: Paper's tokens, and Night's in dark mode (src/styles.css) ----
private func color(_ light: UInt32, _ dark: UInt32) -> Color {
    Color(UIColor { t in
        let v = t.userInterfaceStyle == .dark ? dark : light
        return UIColor(red: CGFloat((v >> 16) & 0xff) / 255, green: CGFloat((v >> 8) & 0xff) / 255, blue: CGFloat(v & 0xff) / 255, alpha: 1)
    })
}
private let bg = color(0xF7F4EE, 0x0F1216)
private let ink = color(0x1C1B19, 0xE6E2D9)
private let muted = color(0x5E5A53, 0x9AA1AB)
private let accent = color(0x2F5D8A, 0x8DB4E2)
private let line = color(0xE4DED3, 0x252B33)
// Read aloud's bars: the accent four parts to the line's six, as Android's.
private let aloudTint = color(0x9BAAB5, 0x4E6179)

private func link(_ s: String) -> URL { URL(string: s) ?? URL(string: "waypage-widget://library")! }
private func pageLink(_ id: String) -> URL {
    link("waypage-widget://page/" + (id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? id))
}
private func query(_ base: String, _ name: String, _ value: String) -> URL {
    var c = URLComponents(string: base)
    c?.queryItems = [URLQueryItem(name: name, value: value)]
    return c?.url ?? link(base)
}

private func str(_ o: [String: Any]?, _ k: String) -> String { (o?[k] as? String) ?? "" }

// ---- The timeline: the app reloads it whenever it writes ----
struct WPEntry: TimelineEntry {
    let date: Date
    let data: [String: Any]
    let waiting: Int
}

struct WPProvider: TimelineProvider {
    func placeholder(in context: Context) -> WPEntry { WPEntry(date: Date(), data: [:], waiting: 0) }
    func getSnapshot(in context: Context, completion: @escaping (WPEntry) -> Void) {
        completion(WPEntry(date: Date(), data: WPStore.widgets(), waiting: WPStore.waitingCount()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WPEntry>) -> Void) {
        let e = WPEntry(date: Date(), data: WPStore.widgets(), waiting: WPStore.waitingCount())
        completion(Timeline(entries: [e], policy: .never))
    }
}

private struct Head: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 12, weight: .semibold)).foregroundStyle(muted).lineLimit(1)
    }
}

private struct Note: View {
    let text: String
    var body: some View {
        Text(text).font(.system(size: 13)).foregroundStyle(muted).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

private struct Row: View {
    let title: String
    let meta: String
    let url: URL
    var body: some View {
        Link(destination: url) {
            VStack(alignment: .leading, spacing: 1) {
                Text(title).font(.system(size: 14, weight: .semibold, design: .serif)).foregroundStyle(ink).lineLimit(1)
                if !meta.isEmpty { Text(meta).font(.system(size: 11)).foregroundStyle(muted).lineLimit(1) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

// ---- Keep reading ----
struct ReadingView: View {
    @Environment(\.widgetFamily) var family
    let entry: WPEntry
    var body: some View {
        let r = entry.data["reading"] as? [String: Any]
        let id = str(r, "id")
        let at = min(1, max(0, (r?["at"] as? NSNumber)?.doubleValue ?? 0))
        Group {
            if family == .accessoryRectangular {
                VStack(alignment: .leading, spacing: 2) {
                    Text(id.isEmpty ? "Nothing open yet" : str(r, "title")).font(.headline).lineLimit(2)
                    if !id.isEmpty { ProgressView(value: at) }
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Head(text: "Keep reading")
                    Text(id.isEmpty ? "Nothing open yet" : str(r, "title"))
                        .font(.system(size: 17, weight: .semibold, design: .serif)).foregroundStyle(ink)
                        .lineLimit(family == .systemSmall ? 3 : 2)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                    Text(id.isEmpty ? "Save a clip, and it waits here." : str(r, "meta")).font(.system(size: 12)).foregroundStyle(muted).lineLimit(1)
                    if !id.isEmpty {
                        ProgressView(value: at).tint(accent)
                    }
                }
            }
        }
        .widgetURL(id.isEmpty ? link("waypage-widget://library") : pageLink(id))
        .containerBackground(for: .widget) { bg }
    }
}

struct ReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageReading", provider: WPProvider()) { ReadingView(entry: $0) }
            .configurationDisplayName("Keep reading")
            .description("The clip you were reading, one tap from where you left it.")
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// ---- Feeds ----
struct FeedsView: View {
    @Environment(\.widgetFamily) var family
    let entry: WPEntry
    var body: some View {
        let f = entry.data["feeds"] as? [String: Any]
        let posts = (f?["posts"] as? [[String: Any]]) ?? []
        let fresh = ((f?["fresh"] as? NSNumber)?.intValue ?? 0) + entry.waiting
        let shown = Array(posts.prefix(family == .systemLarge ? 6 : 3))
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Head(text: "Feeds")
                Spacer()
                if fresh > 0 { Text("\(fresh) new").font(.system(size: 12, weight: .semibold)).foregroundStyle(accent) }
            }
            if shown.isEmpty {
                Note(text: (f?["following"] as? Bool) == true ? "No new posts." : "Follow a site in Feeds, and its newest posts show here.")
            } else {
                ForEach(0..<shown.count, id: \.self) { i in
                    Row(title: str(shown[i], "title"), meta: str(shown[i], "site"), url: query("waypage-widget://post", "url", str(shown[i], "url")))
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(link("waypage-widget://feeds"))
        .containerBackground(for: .widget) { bg }
    }
}

struct FeedsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageFeeds", provider: WPProvider()) { FeedsView(entry: $0) }
            .configurationDisplayName("Feeds")
            .description("The newest posts from the sites you follow.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// ---- Favourites ----
struct FavouritesView: View {
    let entry: WPEntry
    var body: some View {
        let list = Array(((entry.data["favourites"] as? [[String: Any]]) ?? []).prefix(4))
        VStack(alignment: .leading, spacing: 8) {
            Head(text: "Favourites")
            if list.isEmpty {
                Note(text: "Hold a clip in Waypage and tap Favourite, and it shows here.")
            } else {
                ForEach(0..<list.count, id: \.self) { i in
                    let p = list[i]
                    Row(title: str(p, "title"), meta: str(p, "meta"),
                        url: str(p, "kind") == "collection" ? query("waypage-widget://collection", "name", str(p, "name")) : pageLink(str(p, "id")))
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(link("waypage-widget://favourites"))
        .containerBackground(for: .widget) { bg }
    }
}

struct FavouritesWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageFavourites", provider: WPProvider()) { FavouritesView(entry: $0) }
            .configurationDisplayName("Favourites")
            .description("Your favourite collections and clips, one tap away.")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// ---- A highlight a day (1.9.0) ----
// The app's highlights, latest first; each day shows the one for its date,
// so the timeline holds a week of midnights and asks again after them.
struct MarkProvider: TimelineProvider {
    func placeholder(in context: Context) -> WPEntry { WPEntry(date: Date(), data: [:], waiting: 0) }
    func getSnapshot(in context: Context, completion: @escaping (WPEntry) -> Void) {
        completion(WPEntry(date: Date(), data: WPStore.widgets(), waiting: 0))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WPEntry>) -> Void) {
        let data = WPStore.widgets()
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        var entries = [WPEntry(date: Date(), data: data, waiting: 0)]
        for d in 1...7 {
            if let at = cal.date(byAdding: .day, value: d, to: today) { entries.append(WPEntry(date: at, data: data, waiting: 0)) }
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private func dayNumber(_ date: Date) -> Int {
    let local = date.timeIntervalSince1970 + Double(TimeZone.current.secondsFromGMT(for: date))
    return Int(floor(local / 86400))
}

struct HighlightView: View {
    @Environment(\.widgetFamily) var family
    let entry: WPEntry
    var body: some View {
        let list = (entry.data["marks"] as? [[String: Any]]) ?? []
        let m: [String: Any]? = list.isEmpty ? nil : list[((dayNumber(entry.date) % list.count) + list.count) % list.count]
        let note = str(m, "note")
        VStack(alignment: .leading, spacing: 6) {
            Head(text: "A highlight")
            if m == nil {
                Note(text: "Select words in a clip and tap Highlight. One of your highlights shows here each day.")
            } else {
                Text("\u{201C}" + str(m, "text") + "\u{201D}")
                    .font(.system(size: family == .systemSmall ? 14 : 15, design: .serif)).foregroundStyle(ink)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                if !note.isEmpty { Text(note).font(.system(size: 12).italic()).foregroundStyle(muted).lineLimit(2) }
                Text(str(m, "title")).font(.system(size: 12, weight: .semibold)).foregroundStyle(accent).lineLimit(1)
            }
        }
        .widgetURL(m == nil ? link("waypage-widget://library") : query("waypage-widget://mark/" + (str(m, "id").addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? ""), "mark", str(m, "mark")))
        .containerBackground(for: .widget) { bg }
    }
}

struct HighlightWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageHighlight", provider: MarkProvider()) { HighlightView(entry: $0) }
            .configurationDisplayName("A highlight")
            .description("One of your highlights, a different one each day.")
            .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// ---- Reading stats ----
// The app hands over this week's minutes a day and the lines to show, for
// the day it wrote them (statsWidget in src/app-places.js); drawn on a later
// day with the app closed since, they say nothing yet today. The timeline
// asks again at midnight.
private func dayKey(_ date: Date) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

struct DayProvider: TimelineProvider {
    func placeholder(in context: Context) -> WPEntry { WPEntry(date: Date(), data: [:], waiting: 0) }
    func getSnapshot(in context: Context, completion: @escaping (WPEntry) -> Void) {
        completion(WPEntry(date: Date(), data: WPStore.widgets(), waiting: 0))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WPEntry>) -> Void) {
        let data = WPStore.widgets()
        let cal = Calendar.current
        var entries = [WPEntry(date: Date(), data: data, waiting: 0)]
        if let midnight = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: Date())) {
            entries.append(WPEntry(date: midnight, data: data, waiting: 0))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

private func stats(_ entry: WPEntry) -> [String: Any]? { entry.data["stats"] as? [String: Any] }

private struct Figure: View {
    let head: String
    let title: String
    let meta: String
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Head(text: head)
            Text(title).font(.system(size: 26, weight: .semibold, design: .serif)).foregroundStyle(ink).lineLimit(1).minimumScaleFactor(0.6)
            Spacer(minLength: 0)
            Text(meta).font(.system(size: 12)).foregroundStyle(muted).lineLimit(3)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .widgetURL(link("waypage-widget://reading"))
        .containerBackground(for: .widget) { bg }
    }
}

struct WeekView: View {
    let entry: WPEntry
    var body: some View {
        let s = stats(entry)
        let today = dayKey(entry.date)
        let fresh = s != nil && today <= str(s, "weekTo")
        let bars = fresh ? ((s?["bars"] as? [[String: Any]]) ?? []) : []
        let num = { (o: [String: Any], k: String) in (o[k] as? NSNumber)?.doubleValue ?? 0 }
        let top = max(1, bars.map { num($0, "r") + num($0, "a") }.max() ?? 1)
        VStack(alignment: .leading, spacing: 4) {
            Head(text: "This week")
            Text(fresh ? str(s, "week") : "0 min").font(.system(size: 22, weight: .semibold, design: .serif)).foregroundStyle(ink).lineLimit(1)
            Text(fresh ? str(s, "weekMeta") : "Open a clip, and your reading shows here.").font(.system(size: 12)).foregroundStyle(muted).lineLimit(1)
            Spacer(minLength: 4)
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(0..<max(7, bars.count), id: \.self) { i in
                    let b: [String: Any] = i < bars.count ? bars[i] : [:]
                    let r = num(b, "r"), a = num(b, "a")
                    let now = str(b, "day") == today
                    VStack(spacing: 3) {
                        GeometryReader { g in
                            VStack(spacing: r > 0 && a > 0 ? 2 : 0) {
                                Spacer(minLength: 0)
                                if a > 0 { RoundedRectangle(cornerRadius: 3).fill(aloudTint).frame(height: max(2, g.size.height * a / top)) }
                                if r > 0 { RoundedRectangle(cornerRadius: 3).fill(accent).frame(height: max(2, g.size.height * r / top)) }
                                if r + a == 0 { RoundedRectangle(cornerRadius: 1).fill(line).frame(height: 2) }
                            }
                        }
                        Text(str(b, "label")).font(.system(size: 11, weight: now ? .bold : .regular)).foregroundStyle(now ? ink : muted)
                    }
                }
            }
            .frame(maxHeight: 64)
        }
        .widgetURL(link("waypage-widget://reading"))
        .containerBackground(for: .widget) { bg }
    }
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageWeek", provider: DayProvider()) { WeekView(entry: $0) }
            .configurationDisplayName("This week")
            .description("How long you read this week, a bar a day.")
            .supportedFamilies([.systemMedium])
    }
}

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageToday", provider: DayProvider()) { entry in
            let s = stats(entry)
            let fresh = s != nil && str(s, "day") == dayKey(entry.date)
            Figure(head: "Today", title: fresh ? str(s, "today") : "0 min", meta: fresh ? str(s, "todayMeta") : "Nothing yet today")
        }
        .configurationDisplayName("Today")
        .description("How long you've read today.")
        .supportedFamilies([.systemSmall])
    }
}

struct RunWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "WaypageRun", provider: DayProvider()) { entry in
            let s = stats(entry)
            let day = str(s, "day")
            let yesterday = Calendar.current.date(byAdding: .day, value: -1, to: entry.date).map(dayKey) ?? ""
            // Written yesterday, the run stands until today is over, as
            // long as yesterday was read.
            let fresh = s != nil && (day == dayKey(entry.date) || (day == yesterday && (s?["readToday"] as? Bool) == true))
            Figure(head: "In a row", title: fresh ? str(s, "run") : "0 days", meta: fresh ? str(s, "runMeta") : "Read a minute today to start")
        }
        .configurationDisplayName("Days in a row")
        .description("How many days in a row you've read.")
        .supportedFamilies([.systemSmall])
    }
}

// ---- A collection ----
// Picked with Edit Widget from the collections the app last wrote. The
// widget keeps the name it was given; a rename the app reports
// (WidgetsPlugin.renamed) is followed through renames.json.
struct CollectionEntity: AppEntity {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Collection"
    static var defaultQuery = CollectionQuery()
    var id: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(id)") }
}

private func collectionNames() -> [String] {
    ((WPStore.widgets()["collections"] as? [[String: Any]]) ?? []).compactMap { $0["name"] as? String }
}

struct CollectionQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CollectionEntity] { identifiers.map { CollectionEntity(id: $0) } }
    func suggestedEntities() async throws -> [CollectionEntity] { collectionNames().map { CollectionEntity(id: $0) } }
}

struct PickCollection: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Collection"
    static var description = IntentDescription("The collection this widget shows.")
    @Parameter(title: "Collection") var collection: CollectionEntity?
}

struct CollectionEntry: TimelineEntry {
    let date: Date
    let name: String
    let data: [String: Any]?
}

private func currentName(_ name: String) -> String {
    let renames = (WPStore.read("renames.json") as? [String: String]) ?? [:]
    var at = name
    var seen = Set<String>()
    while let to = renames[at], !seen.contains(to) { seen.insert(at); at = to }
    return at
}

struct CollectionProvider: AppIntentTimelineProvider {
    private func entry(_ config: PickCollection) -> CollectionEntry {
        let name = config.collection.map { currentName($0.id) } ?? ""
        let found = ((WPStore.widgets()["collections"] as? [[String: Any]]) ?? []).first { ($0["name"] as? String) == name }
        return CollectionEntry(date: Date(), name: name, data: found)
    }
    func placeholder(in context: Context) -> CollectionEntry { CollectionEntry(date: Date(), name: "", data: nil) }
    func snapshot(for configuration: PickCollection, in context: Context) async -> CollectionEntry { entry(configuration) }
    func timeline(for configuration: PickCollection, in context: Context) async -> Timeline<CollectionEntry> {
        Timeline(entries: [entry(configuration)], policy: .never)
    }
}

struct CollectionView: View {
    let entry: CollectionEntry
    var body: some View {
        let c = entry.data
        let clips = (c?["clips"] as? [[String: Any]]) ?? []
        let next = str(c, "next"), button = str(c, "button")
        let page = URL(string: pageLink(next).absoluteString + "?next=1") ?? link("waypage-widget://library")
        VStack(alignment: .leading, spacing: 8) {
            Head(text: c == nil ? (entry.name.isEmpty ? "Collection" : entry.name) : entry.name + " · " + str(c, "meta"))
            if c == nil {
                Note(text: entry.name.isEmpty ? "Hold the widget and tap Edit Widget to pick a collection." : "This collection is gone. Hold the widget and tap Edit Widget to pick another.")
            } else if let p = clips.first {
                Row(title: str(p, "title"), meta: str(p, "meta"), url: pageLink(str(p, "id")))
                Spacer(minLength: 0)
                if !next.isEmpty && !button.isEmpty {
                    HStack(spacing: 8) {
                        Link(destination: page) {
                            Text(button).font(.system(size: 13, weight: .semibold)).foregroundStyle(bg)
                                .padding(.horizontal, 14).padding(.vertical, 6).background(Capsule().fill(accent))
                        }
                        Link(destination: URL(string: page.absoluteString + "&aloud=1") ?? page) {
                            Image(systemName: "headphones").font(.system(size: 14, weight: .semibold)).foregroundStyle(accent)
                                .padding(6).accessibilityLabel("Narrate")
                        }
                    }
                }
            } else {
                Note(text: "Nothing in it yet.")
            }
        }
        .widgetURL(entry.name.isEmpty || c == nil ? link("waypage-widget://library") : query("waypage-widget://collection", "name", entry.name))
        .containerBackground(for: .widget) { bg }
    }
}

struct CollectionWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "WaypageCollection", intent: PickCollection.self, provider: CollectionProvider()) { CollectionView(entry: $0) }
            .configurationDisplayName("Collection")
            .description("A collection's next clip, to start, go on or listen.")
            .supportedFamilies([.systemSmall, .systemMedium])
    }
}

@main
struct WaypageWidgets: WidgetBundle {
    var body: some Widget {
        ReadingWidget()
        FeedsWidget()
        FavouritesWidget()
        HighlightWidget()
        WeekWidget()
        TodayWidget()
        RunWidget()
        CollectionWidget()
    }
}
