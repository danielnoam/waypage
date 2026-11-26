import AVFoundation
import Capacitor
import CommonCrypto
import Foundation
import MediaPlayer
import UIKit

// Audiobooks (src/app-listen.js) on the iPhone, the same calls as Android's
// AudiobookPlugin.java: an AVPlayer that keeps playing with the screen off
// (the "audio" background mode) and answers the lock screen and earbuds,
// what a sound file says about itself, and transcripts made on the phone
// (Listen.swift).
//
//   play({ parts: [{ uri, offset, length }], part, pos, rate, title, subtitle, key, chapters, cover })
//   pause() resume() stop() seek({ part, pos }) skip({ by }) rate({ rate }) sleep({ at })
//   state()                      { key, part, pos, state, sleep }
//   options({ mix, back, on, volume })
//   pip()                        { supported: false }
//   probe({ uri, offset, length })  { duration (ms), title, artist, album, cover (base64) }
//   models() download({ id }) cancel() remove({ id })
//   transcribe({ uri, offset, length, from, to, pack, lang }) stopTranscribing()
//   voice({ items, blocks, lang, voice, engine, name })   { uri, dur, size, t0, t1 }
//                                and "voiced" events { n, of }; stopVoicing()
//
// A "state" event { key, part, pos, dur, state } about twice a second while
// it plays and as it changes, a "sleep" event { at }, and "piece" events
// while a transcript is written. A part that's a stretch of a bigger file
// (an EPUB's narration) is copied out to the cache first, as AVPlayer only
// plays whole files.
@objc(AudiobookPlugin)
public class AudiobookPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AudiobookPlugin"
    public let jsName = "Audiobook"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "options", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "probe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "models", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "transcribe", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopTranscribing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "voice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopVoicing", returnType: CAPPluginReturnPromise)
    ]

    private struct Part { let uri: String; let offset: Int64; let length: Int64 }
    private struct Chapter { let title: String; let part: Int; let pos: Int64 }

    // ---- The book playing (all on the main queue)

    private var parts: [Part] = []
    private var chapters: [Chapter] = []
    private var part = 0
    private var key = "", title = "", subtitle = "", cover = ""
    private var rate: Float = 1
    private var state = "stopped"
    private var startAt: Int64 = 0
    private var playWhenReady = false
    private var prepared = false
    private var loadRun = 0
    private var player: AVPlayer?
    private var statusWatch: NSKeyValueObservation?
    private var ends: [NSObjectProtocol] = []
    private var tick: Timer?
    private var art: (String, MPMediaItemArtwork)?

    private var mix = false
    private var backMs: Int64 = 15000, onMs: Int64 = 30000
    private var volume: Float = 1

    private var sleepAt: Int64 = 0
    private var sleeper: DispatchWorkItem?
    private var commandsSet = false

    override public func load() {
        if Listen.supported { Listen.downloads.reconnect() }
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(interrupted(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(routeChanged(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    }

    @objc func play(_ call: CAPPluginCall) {
        let list = (call.getArray("parts", JSObject.self) ?? []).compactMap { o -> Part? in
            guard let u = o["uri"] as? String, !u.isEmpty else { return nil }
            return Part(uri: u, offset: Self.int64(o["offset"]) ?? -1, length: Self.int64(o["length"]) ?? -1)
        }
        if list.isEmpty { call.reject("No sound to play."); return }
        let chs = (call.getArray("chapters", JSObject.self) ?? []).enumerated().map { i, o in
            Chapter(title: o["title"] as? String ?? "Chapter \(i + 1)", part: (o["part"] as? NSNumber)?.intValue ?? 0, pos: Self.int64(o["pos"]) ?? 0)
        }
        let at = call.getInt("part") ?? 0
        let pos = Self.int64(call.getValue("pos")) ?? 0
        let r = call.getFloat("rate") ?? 1
        let t = call.getString("title") ?? "", s = call.getString("subtitle") ?? ""
        let k = call.getString("key") ?? "", c = call.getString("cover") ?? ""
        DispatchQueue.main.async {
            self.parts = list
            self.chapters = chs
            self.key = k; self.title = t; self.subtitle = s; self.cover = c
            self.rate = max(0.5, min(3, r))
            self.setUpCommands()
            self.playWhenReady = true
            self.load(max(0, min(at, list.count - 1)), pos)
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) { DispatchQueue.main.async { self.pauseNow(); call.resolve() } }
    @objc func resume(_ call: CAPPluginCall) { DispatchQueue.main.async { self.resumeNow(); call.resolve() } }
    @objc func stop(_ call: CAPPluginCall) { DispatchQueue.main.async { if !self.parts.isEmpty { self.finish("stopped") }; call.resolve() } }

    @objc func seek(_ call: CAPPluginCall) {
        let p = call.getInt("part") ?? 0, pos = Self.int64(call.getValue("pos")) ?? 0
        DispatchQueue.main.async { self.seekIn(p, pos); call.resolve() }
    }

    @objc func skip(_ call: CAPPluginCall) {
        let by = Self.int64(call.getValue("by")) ?? 0
        DispatchQueue.main.async { self.skipBy(by); call.resolve() }
    }

    @objc func rate(_ call: CAPPluginCall) {
        let r = call.getFloat("rate") ?? 1
        DispatchQueue.main.async {
            self.rate = max(0.5, min(3, r))
            if self.state == "playing" { self.player?.rate = self.rate }
            self.report()
            call.resolve()
        }
    }

    @objc func options(_ call: CAPPluginCall) {
        let m = call.getBool("mix") ?? false
        let b = Self.int64(call.getValue("back")) ?? 0, o = Self.int64(call.getValue("on")) ?? 0
        let v = call.getFloat("volume") ?? 1
        DispatchQueue.main.async {
            let was = self.mix
            self.mix = m
            if b > 0 { self.backMs = b }
            if o > 0 { self.onMs = o }
            // AVPlayer goes no louder than the file itself.
            self.volume = max(0, min(1, v))
            self.player?.volume = self.volume
            let c = MPRemoteCommandCenter.shared()
            c.skipBackwardCommand.preferredIntervals = [NSNumber(value: Double(self.backMs) / 1000)]
            c.skipForwardCommand.preferredIntervals = [NSNumber(value: Double(self.onMs) / 1000)]
            if was != m && self.state == "playing" { self.session() }
            call.resolve()
        }
    }

    // No small window for audiobooks on the iPhone: picture in picture
    // there is for video.
    @objc func pip(_ call: CAPPluginCall) { call.resolve(["supported": false]) }

    @objc func sleep(_ call: CAPPluginCall) {
        let at = Self.int64(call.getValue("at")) ?? 0
        DispatchQueue.main.async { self.setSleep(at); call.resolve() }
    }

    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["key": self.parts.isEmpty ? "" : self.key, "part": self.part, "pos": self.position(),
                          "state": self.state, "sleep": self.sleepAt])
        }
    }

    // ---- Loading a part

    // A part made ready to play from `pos` ms into it (below 0: that far
    // before its end).
    private func load(_ at: Int, _ pos: Int64) {
        release()
        loadRun += 1
        let mine = loadRun
        part = at
        startAt = pos
        prepared = false
        state = "loading"
        report()
        let p = parts[at]
        Self.files.async {
            let url = Self.url(p)
            DispatchQueue.main.async {
                guard mine == self.loadRun else { return }
                guard let url = url else { self.finish("error"); return }
                self.open(url, run: mine)
            }
        }
    }

    private func open(_ url: URL, run mine: Int) {
        let item = AVPlayerItem(url: url)
        item.audioTimePitchAlgorithm = .spectral
        let pl = AVPlayer(playerItem: item)
        pl.automaticallyWaitsToMinimizeStalling = url.scheme == "http" || url.scheme == "https"
        pl.volume = volume
        player = pl
        statusWatch = item.observe(\.status, options: [.new]) { [weak self] it, _ in
            DispatchQueue.main.async {
                guard let self = self, mine == self.loadRun, !self.prepared else { return }
                if it.status == .failed { self.finish("error"); return }
                guard it.status == .readyToPlay else { return }
                self.prepared = true
                var to = self.startAt
                if to < 0 { to = max(0, self.duration() + to) }
                let go = { [weak self] in
                    guard let self = self, mine == self.loadRun else { return }
                    if self.playWhenReady { self.go() } else { self.state = "paused"; self.report() }
                }
                if to > 0 {
                    it.seek(to: CMTime(value: to, timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { _ in DispatchQueue.main.async(execute: go) }
                } else { go() }
            }
        }
        let nc = NotificationCenter.default
        ends = [
            nc.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main) { [weak self] _ in
                guard let self = self, mine == self.loadRun else { return }
                if self.part + 1 < self.parts.count { self.playWhenReady = true; self.load(self.part + 1, 0) }
                else { self.state = "ended"; self.finish("ended") }
            },
            nc.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: item, queue: .main) { [weak self] _ in
                guard let self = self, mine == self.loadRun else { return }
                self.finish("error")
            }
        ]
    }

    private func release() {
        statusWatch?.invalidate()
        statusWatch = nil
        for e in ends { NotificationCenter.default.removeObserver(e) }
        ends = []
        player?.pause()
        player?.replaceCurrentItem(with: nil)
        player = nil
        tick?.invalidate()
        tick = nil
    }

    // ---- Playing, pausing, moving

    private func go() {
        guard let pl = player, prepared else { playWhenReady = true; return }
        session()
        pl.playImmediately(atRate: rate)
        state = "playing"
        tick?.invalidate()
        tick = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.report() }
        report()
    }

    private func pauseNow() {
        playWhenReady = false
        player?.pause()
        guard !parts.isEmpty else { return }
        startAt = position()
        state = "paused"
        tick?.invalidate()
        tick = nil
        report()
    }

    private func resumeNow() {
        guard !parts.isEmpty else { return }
        playWhenReady = true
        if player == nil { load(part, startAt) } else { go() }
    }

    private func position() -> Int64 {
        guard let pl = player, prepared else { return max(0, startAt) }
        let t = pl.currentTime().seconds
        return t.isFinite ? Int64(t * 1000) : max(0, startAt)
    }

    private func duration() -> Int64 {
        guard let d = player?.currentItem?.duration.seconds, d.isFinite, d > 0 else { return 0 }
        return Int64(d * 1000)
    }

    // Back or on by `by` ms, across parts.
    private func skipBy(_ by: Int64) {
        guard !parts.isEmpty else { return }
        let to = position() + by
        if to < 0 && part > 0 { seekIn(part - 1, min(-1, to)); return }
        let dur = duration()
        if dur > 0 && to >= dur && part + 1 < parts.count { seekIn(part + 1, to - dur); return }
        seekIn(part, max(0, dur > 0 ? min(to, dur - 500) : to))
    }

    private func seekIn(_ to: Int, _ at: Int64) {
        guard !parts.isEmpty else { return }
        let p = max(0, min(to, parts.count - 1))
        var pos = at
        if p != part || player == nil {
            playWhenReady = state == "playing" || playWhenReady
            load(p, pos)
            return
        }
        if !prepared { startAt = pos; return }
        if pos < 0 { pos = max(0, duration() + pos) }
        let mine = loadRun
        player?.seek(to: CMTime(value: pos, timescale: 1000), toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
            DispatchQueue.main.async { if let self = self, mine == self.loadRun { self.report() } }
        }
        startAt = pos
        report()
    }

    private func finish(_ how: String) {
        startAt = position()
        state = how
        sleeper?.cancel()
        sleeper = nil
        let hadSleep = sleepAt > 0
        sleepAt = 0
        report()
        if hadSleep { notifyListeners("sleep", data: ["at": 0]) }
        loadRun += 1
        release()
        parts = []
        chapters = []
        playWhenReady = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        lockScreen(false)
    }

    private func session() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: mix ? [.mixWithOthers] : [])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    // A call or another app's sound stops it; it goes on after a call if
    // iOS says so.
    @objc private func interrupted(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        DispatchQueue.main.async {
            if type == .began {
                if self.state == "playing" { self.pauseNow(); self.playWhenReady = true }
            } else if self.playWhenReady, self.state == "paused",
                      let o = n.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt,
                      AVAudioSession.InterruptionOptions(rawValue: o).contains(.shouldResume) {
                self.resumeNow()
            } else { self.playWhenReady = false }
        }
    }

    // Earbuds out: paused, as the phone's own players do.
    @objc private func routeChanged(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
              AVAudioSession.RouteChangeReason(rawValue: raw) == .oldDeviceUnavailable else { return }
        DispatchQueue.main.async { if self.state == "playing" { self.pauseNow() } }
    }

    // ---- The sleep timer: `at` in ms since 1970, 0 for none.

    private func setSleep(_ at: Int64) {
        sleeper?.cancel()
        sleeper = nil
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        sleepAt = at > now ? at : 0
        if sleepAt > 0 {
            let w = DispatchWorkItem { [weak self] in
                guard let self = self else { return }
                self.setSleep(0)
                self.pauseNow()
            }
            sleeper = w
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(Int(sleepAt - now)), execute: w)
        }
        notifyListeners("sleep", data: ["at": sleepAt])
    }

    // ---- What the app and the lock screen are told

    private func report() {
        let pos = position(), dur = duration()
        notifyListeners("state", data: ["key": key, "part": part, "pos": pos, "dur": dur, "state": state])
        guard state == "playing" || state == "paused" || state == "loading" else { return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: chapterTitle() ?? subtitle,
            MPMediaItemPropertyAlbumTitle: subtitle,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: Double(pos) / 1000,
            MPMediaItemPropertyPlaybackDuration: Double(dur) / 1000,
            MPNowPlayingInfoPropertyPlaybackRate: state == "playing" ? Double(rate) : 0.0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: Double(rate)
        ]
        if let a = artwork() { info[MPMediaItemPropertyArtwork] = a }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // The chapter playing, as the app's player shows it under the title.
    private func chapterTitle() -> String? {
        let pos = position()
        var at: Chapter?
        for c in chapters {
            if c.part < part || (c.part == part && c.pos <= pos + 500) { at = c } else { break }
        }
        return at?.title
    }

    // The book's picture when it's one of the app's own files (only those:
    // nothing is fetched for the lock screen).
    private func artwork() -> MPMediaItemArtwork? {
        if let a = art, a.0 == cover { return a.1 }
        guard let r = cover.range(of: "/_capacitor_file_") else { return nil }
        var path = String(cover[r.upperBound...])
        if let q = path.firstIndex(where: { $0 == "?" || $0 == "#" }) { path = String(path[..<q]) }
        path = path.removingPercentEncoding ?? path
        let f = URL(fileURLWithPath: path).standardizedFileURL.resolvingSymlinksInPath()
        let home = URL(fileURLWithPath: NSHomeDirectory()).standardizedFileURL.resolvingSymlinksInPath().path + "/"
        guard f.path.hasPrefix(home), let img = UIImage(contentsOfFile: f.path) else { return nil }
        let a = MPMediaItemArtwork(boundsSize: img.size) { _ in img }
        art = (cover, a)
        return a
    }

    private var live: Bool { !parts.isEmpty }

    // The lock screen's buttons: back and on by the skip lengths, and a
    // bar to drag. Narrate (SpeechPlugin) shares the same buttons with its
    // next and previous, so each only answers while it's the one playing.
    private func setUpCommands() {
        lockScreen(true)
        guard !commandsSet else { return }
        commandsSet = true
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in
            guard let self = self, self.live else { return .noActionableNowPlayingItem }
            self.resumeNow(); return .success
        }
        c.pauseCommand.addTarget { [weak self] _ in
            guard let self = self, self.live else { return .noActionableNowPlayingItem }
            self.pauseNow(); return .success
        }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self, self.live else { return .noActionableNowPlayingItem }
            if self.state == "playing" { self.pauseNow() } else { self.resumeNow() }
            return .success
        }
        c.skipBackwardCommand.addTarget { [weak self] _ in
            guard let self = self, self.live else { return .noActionableNowPlayingItem }
            self.skipBy(-self.backMs); return .success
        }
        c.skipForwardCommand.addTarget { [weak self] _ in
            guard let self = self, self.live else { return .noActionableNowPlayingItem }
            self.skipBy(self.onMs); return .success
        }
        c.changePlaybackPositionCommand.addTarget { [weak self] e in
            guard let self = self, self.live, let e = e as? MPChangePlaybackPositionCommandEvent else { return .noActionableNowPlayingItem }
            self.seekIn(self.part, Int64(e.positionTime * 1000)); return .success
        }
        c.stopCommand.addTarget { [weak self] _ in
            guard let self = self, self.live else { return .noActionableNowPlayingItem }
            self.finish("stopped"); return .success
        }
        c.skipBackwardCommand.preferredIntervals = [NSNumber(value: Double(backMs) / 1000)]
        c.skipForwardCommand.preferredIntervals = [NSNumber(value: Double(onMs) / 1000)]
    }

    // While a book plays the lock screen shows back and on; after it,
    // Narrate's next and previous again.
    private func lockScreen(_ book: Bool) {
        let c = MPRemoteCommandCenter.shared()
        c.skipBackwardCommand.isEnabled = book
        c.skipForwardCommand.isEnabled = book
        c.changePlaybackPositionCommand.isEnabled = book
        c.nextTrackCommand.isEnabled = !book
        c.previousTrackCommand.isEnabled = !book
    }

    // ---- Files

    private static let files = DispatchQueue(label: "waypage.audiobook.files", qos: .userInitiated)

    private static func int64(_ v: Any?) -> Int64? {
        if let n = v as? NSNumber { return n.int64Value }
        if let s = v as? String { return Int64(s) }
        return nil
    }

    // The file a part names: a stretch of a bigger one is copied out first.
    private static func url(_ p: Part) -> URL? {
        guard let u = whole(p.uri) else { return nil }
        if p.offset < 0 || p.length <= 0 { return u }
        return stretch(u, key: p.uri, offset: p.offset, length: p.length)
    }

    private static func whole(_ uri: String) -> URL? {
        if uri.hasPrefix("http://") || uri.hasPrefix("https://") { return URL(string: uri) }
        if uri.hasPrefix("file://") { return URL(string: uri) }
        if uri.hasPrefix("bm:") { return FilesPlugin.resolve(uri) }
        if uri.hasPrefix("/") { return URL(fileURLWithPath: uri) }
        return nil
    }

    private static var stretches: URL {
        let d = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("audiobook-parts", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    // Kept for the next time (the parts before and after are often wanted
    // again); only the latest few stay.
    private static func stretch(_ src: URL, key: String, offset: Int64, length: Int64) -> URL? {
        guard src.isFileURL else { return nil }
        let name = hash("\(key)|\(offset)|\(length)")
        let fm = FileManager.default
        let d = stretches
        if let have = (try? fm.contentsOfDirectory(at: d, includingPropertiesForKeys: nil))?.first(where: { $0.deletingPathExtension().lastPathComponent == name }) {
            try? fm.setAttributes([.modificationDate: Date()], ofItemAtPath: have.path)
            return have
        }
        guard let h = try? FileHandle(forReadingFrom: src) else { return nil }
        defer { try? h.close() }
        do {
            try h.seek(toOffset: UInt64(offset))
            let tmp = d.appendingPathComponent(name + ".part")
            fm.createFile(atPath: tmp.path, contents: nil)
            guard let out = try? FileHandle(forWritingTo: tmp) else { return nil }
            var left = length
            var head = Data()
            while left > 0 {
                guard let chunk = try h.read(upToCount: Int(min(left, 1 << 20))), !chunk.isEmpty else { break }
                if head.isEmpty { head = chunk.prefix(16) }
                try out.write(contentsOf: chunk)
                left -= Int64(chunk.count)
            }
            try out.close()
            let dest = d.appendingPathComponent(name + "." + ext(head))
            try? fm.removeItem(at: dest)
            try fm.moveItem(at: tmp, to: dest)
            trim(d, keep: 4)
            return dest
        } catch {
            return nil
        }
    }

    // AVPlayer goes by a file's extension: the right one from its first bytes.
    private static func ext(_ h: Data) -> String {
        let b = [UInt8](h)
        func at(_ i: Int, _ s: String) -> Bool { b.count >= i + s.utf8.count && Array(b[i..<(i + s.utf8.count)]) == Array(s.utf8) }
        if at(4, "ftyp") { return "m4a" }
        if at(0, "fLaC") { return "flac" }
        if at(0, "RIFF") { return "wav" }
        if at(0, "caff") { return "caf" }
        return "mp3"
    }

    private static func trim(_ d: URL, keep: Int) {
        let fm = FileManager.default
        guard let all = try? fm.contentsOfDirectory(at: d, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let sorted = all.sorted {
            let a = (try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            let b = (try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return a > b
        }
        for f in sorted.dropFirst(keep) { try? fm.removeItem(at: f) }
    }

    private static func hash(_ s: String) -> String {
        var out = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        let d = Data(s.utf8)
        d.withUnsafeBytes { _ = CC_SHA256($0.baseAddress, CC_LONG(d.count), &out) }
        return out.prefix(12).map { String(format: "%02x", $0) }.joined()
    }

    // ---- What a sound file says about itself

    @objc func probe(_ call: CAPPluginCall) {
        guard let uri = call.getString("uri"), !uri.isEmpty else { call.reject("No file"); return }
        let p = Part(uri: uri, offset: Self.int64(call.getValue("offset")) ?? -1, length: Self.int64(call.getValue("length")) ?? -1)
        Self.files.async {
            guard let url = Self.url(p) else { call.reject("Waypage can't play this file."); return }
            let asset = AVURLAsset(url: url)
            Task {
                do {
                    let (dur, meta) = try await asset.load(.duration, .commonMetadata)
                    var o: [String: Any] = ["duration": dur.seconds.isFinite ? Int64(dur.seconds * 1000) : 0]
                    func put(_ k: String, _ id: AVMetadataIdentifier) async {
                        guard let item = AVMetadataItem.metadataItems(from: meta, filteredByIdentifier: id).first,
                              let v = try? await item.load(.stringValue) else { return }
                        let t = v.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !t.isEmpty { o[k] = t }
                    }
                    await put("title", .commonIdentifierTitle)
                    await put("album", .commonIdentifierAlbumName)
                    await put("artist", .commonIdentifierArtist)
                    if o["artist"] == nil { await put("artist", .commonIdentifierCreator) }
                    if let item = AVMetadataItem.metadataItems(from: meta, filteredByIdentifier: .commonIdentifierArtwork).first,
                       let data = try? await item.load(.dataValue), data.count < (4 << 20) {
                        o["cover"] = data.base64EncodedString()
                    }
                    if dur.seconds.isFinite && dur.seconds > 0 { call.resolve(o) } else { call.reject("Waypage can't play this file.") }
                } catch {
                    call.reject("Waypage can't play this file.")
                }
            }
        }
    }

    // ---- Transcripts

    private static var unpacking = false
    private static var failed = ""
    private static var failedPack = ""
    private static let worker = DispatchQueue(label: "waypage.listen", qos: .utility)
    private static let workLock = NSLock()
    private static var _working = false
    private static var working: Bool {
        get { workLock.lock(); defer { workLock.unlock() }; return _working }
        set { workLock.lock(); _working = newValue; workLock.unlock() }
    }

    @objc func models(_ call: CAPPluginCall) {
        guard Listen.supported else { call.resolve(["supported": false]); return }
        DispatchQueue.main.async {
            UIDevice.current.isBatteryMonitoringEnabled = true
            var step = Listen.step
            let busy = Listen.downloading()
            if !Self.unpacking {
                if step == "downloaded" { self.unpackLater(); step = "checking" }
                else if step == "failed" {
                    Self.failed = "failed"
                    Self.failedPack = busy?.id ?? ""
                    Listen.cancel()
                } else if step.isEmpty { step = Self.failed; Self.failed = "" }
            }
            let packs = Listen.packs.map { p -> [String: Any] in
                let ready = Listen.ready(p)
                return ["id": p.id, "title": p.title, "note": p.note, "bytes": p.bytes, "ready": ready,
                        "size": ready ? Listen.size(p) : 0, "langs": p.langs]
            }
            let shownBusy = busy?.id ?? (step == "failed" || step == "bad" ? Self.failedPack : "")
            call.resolve(["supported": true, "busy": shownBusy, "step": step, "done": Listen.done, "total": Listen.total,
                          "charging": Listen.charging(), "working": Self.working, "packs": packs])
        }
    }

    private func unpackLater() {
        Self.unpacking = true
        Self.failedPack = Listen.downloading()?.id ?? ""
        Listen.step = "checking"
        Self.worker.async {
            var result = ""
            do {
                if try !Listen.unpack() { result = "bad" }
            } catch {
                result = "failed"
                Listen.cancel()
            }
            DispatchQueue.main.async {
                Self.failed = result
                Self.unpacking = false
                Listen.step = ""
            }
        }
    }

    private func packOf(_ call: CAPPluginCall) -> ListenPack? {
        guard let p = Listen.pack(call.getString("id") ?? "") else {
            call.reject("No such model.")
            return nil
        }
        return p
    }

    @objc func download(_ call: CAPPluginCall) {
        guard Listen.supported else { call.reject("This iPhone can't make transcripts."); return }
        guard let p = packOf(call) else { return }
        DispatchQueue.main.async {
            if Self.unpacking { call.reject("Still unpacking the last one."); return }
            Self.failed = ""
            Listen.start(p)
            call.resolve()
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if Self.unpacking { call.reject("Still unpacking."); return }
            Listen.cancel()
            call.resolve()
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let p = packOf(call) else { return }
        DispatchQueue.main.async {
            if Self.unpacking { call.reject("Still unpacking."); return }
            if Self.working { call.reject("Still writing a transcript. Try again in a moment."); return }
            Listen.remove(p)
            call.resolve()
        }
    }

    @objc func transcribe(_ call: CAPPluginCall) {
        guard let p = Listen.pack(call.getString("pack") ?? ""), Listen.ready(p) else { call.reject("model"); return }
        let src = Part(uri: call.getString("uri") ?? "", offset: Self.int64(call.getValue("offset")) ?? -1, length: Self.int64(call.getValue("length")) ?? -1)
        let from = Self.int64(call.getValue("from")) ?? 0, to = Self.int64(call.getValue("to")) ?? 0
        let lang = call.getString("lang") ?? ""
        Self.workLock.lock()
        if Self._working { Self.workLock.unlock(); call.reject("busy"); return }
        Self._working = true
        Self.workLock.unlock()
        Listen.stop = false
        Self.worker.async {
            defer { Self.working = false }
            let why = Listen.holdOff()
            if !why.isEmpty { call.reject(why); return }
            guard Listen.load(p, lang: lang) else { call.reject("model"); return }
            guard let url = Self.url(src) else { call.reject("Waypage can't read this file's sound."); return }
            let all = Listen.decode(url, fromMs: from, toMs: to)
            if Listen.stop { call.reject("stopped"); return }
            guard let all = all else { call.reject("Waypage can't read this file's sound."); return }
            let pieces = Listen.recognize(all, fromSec: Double(from) / 1000) { x in
                self.notifyListeners("piece", data: ["piece": x.json, "from": from, "to": to])
            }
            if Listen.stop { call.reject("stopped"); return }
            call.resolve(["pieces": pieces.map { $0.json }])
        }
    }

    @objc func stopTranscribing(_ call: CAPPluginCall) {
        Listen.stop = true
        call.resolve()
    }

    // ---- The narration saved as sound (Voicing.swift)

    private static let voicer = DispatchQueue(label: "waypage.voicing", qos: .utility)
    private static let voiceLock = NSLock()
    private static var voicing = false

    @objc func voice(_ call: CAPPluginCall) {
        let items = (call.getArray("items") ?? []).map { ($0 as? String) ?? "" }
        if items.isEmpty { call.reject("silent"); return }
        let given = call.getArray("blocks") ?? []
        let blocks = items.indices.map { i in i < given.count ? ((given[i] as? NSNumber)?.intValue ?? i) : i }
        let lang = call.getString("lang") ?? "", voice = call.getString("voice") ?? "", engine = call.getString("engine") ?? ""
        let raw = call.getString("name") ?? "part"
        let name = String(raw.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || "._-".unicodeScalars.contains($0) ? Character($0) : "_" })
        Self.voiceLock.lock()
        if Self.voicing { Self.voiceLock.unlock(); call.reject("busy"); return }
        Self.voicing = true
        Self.voiceLock.unlock()
        Voicing.stop = false
        let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("voicebook", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let out = dir.appendingPathComponent(name + ".m4a")
        Self.voicer.async {
            defer { Self.voiceLock.lock(); Self.voicing = false; Self.voiceLock.unlock() }
            do {
                let o = try Voicing.render(items: items, blocks: blocks, lang: lang, voice: voice, engine: engine, to: out) { n, of in
                    self.notifyListeners("voiced", data: ["n": n, "of": of])
                }
                let size = (try? out.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                let r = { (x: Double) in (x * 100).rounded() / 100 }
                call.resolve(["uri": o.url.absoluteString, "dur": o.dur, "size": size, "t0": o.t0.map(r), "t1": o.t1.map(r)])
            } catch Voicing.Fail.stopped {
                call.reject("stopped")
            } catch Voicing.Fail.engine {
                call.reject("engine")
            } catch Voicing.Fail.silent {
                call.reject("silent")
            } catch {
                call.reject(Voicing.stop ? "stopped" : "Couldn't make the sound.")
            }
        }
    }

    @objc func stopVoicing(_ call: CAPPluginCall) {
        Voicing.stop = true
        call.resolve()
    }
}
