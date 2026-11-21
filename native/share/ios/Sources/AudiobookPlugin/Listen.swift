import AVFoundation
import Foundation
import UIKit
#if canImport(SherpaOnnxC)
@_implementationOnly import SherpaOnnxC
#endif

// Audiobook transcripts on the iPhone, as Android's Listen.java: sherpa-onnx's
// speech recognition (the same library as the Kokoro voices) run on the
// book's own sound a few minutes ahead of where it's playing. The models are
// downloads, the same archives at the same SHA-256 as Android's. A stretch
// of a part is decoded by AVFoundation straight to 16 kHz mono, cut into
// pieces of up to 20 s at their quietest moment between 8 and 20 s, and
// each piece is recognised on its own. Nothing is sent anywhere.
final class ListenPack {
    let id: String, title: String, note: String, kind: String, file: String, sha256: String
    let bytes: Int64
    let langs: [String]
    init(_ id: String, _ title: String, _ note: String, _ kind: String, _ file: String, _ sha256: String, _ bytes: Int64, _ langs: [String]) {
        self.id = id; self.title = title; self.note = note; self.kind = kind; self.file = file; self.sha256 = sha256
        self.bytes = bytes; self.langs = langs
    }
}

struct ListenPiece {
    var t0 = 0.0, t1 = 0.0, quiet = 0.0
    var text = ""
    var words: [String] = []
    var times: [Double] = []

    var json: [String: Any] {
        ["t0": t0, "t1": t1, "quiet": quiet, "text": text, "words": words, "times": times.map { ($0 * 100).rounded() / 100 }]
    }
}

enum Listen {
    static let base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
    static let rate = 16000

    private static let europe = ["en", "bg", "hr", "cs", "da", "nl", "et", "fi", "fr", "de", "el", "hu", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv", "ru", "uk"]
    static let packs: [ListenPack] = [
        ListenPack("fast", "Fast", "English · Moonshine · keeps well ahead, easy on the battery", "moonshine",
                   "sherpa-onnx-moonshine-tiny-en-int8.tar.bz2", "d5fe6ec4334fef36255b2a4010412cad4c007e33103fec62fb5d17cad88086f2", 107_600_538, ["en"]),
        ListenPack("better", "Better", "English and 24 European languages · Parakeet · punctuation and capitals", "nemo",
                   "sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8.tar.bz2", "1495e91b59d7fc53ddca91f3431758ec99f8fa253fdb0e1e851be0f72b14b0f9", 487_211_443, europe),
        ListenPack("most", "Most languages", "99 languages, Hebrew too · Whisper · slowest", "whisper",
                   "sherpa-onnx-whisper-small.tar.bz2", "486a46afbb7ba798507190ffe02fea2dd726049af212e774537efac6afb210a6", 639_387_718, ["*"]),
    ]

    static func pack(_ id: String) -> ListenPack? { packs.first { $0.id == id } }

    static var supported: Bool { Kokoro.supported }

    private static let packKey = "waypage.listen.pack"

    static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var r = base.appendingPathComponent("listen", isDirectory: true)
        if !FileManager.default.fileExists(atPath: r.path) {
            try? FileManager.default.createDirectory(at: r, withIntermediateDirectories: true)
            var v = URLResourceValues()
            v.isExcludedFromBackup = true
            try? r.setResourceValues(v)
        }
        return r
    }

    static func dir(_ p: ListenPack) -> URL { root.appendingPathComponent(p.id, isDirectory: true) }

    private static func files(_ d: URL) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: d.path)) ?? []).sorted()
    }

    private static func tokens(_ d: URL) -> URL? {
        files(d).first { $0.hasSuffix("tokens.txt") }.map { d.appendingPathComponent($0) }
    }

    // The model file whose name has `part` in it (or starts with it), int8 first.
    private static func find(_ d: URL, _ part: String, exact: Bool = false) -> URL? {
        let all = files(d).filter { $0.hasSuffix(".onnx") && (exact ? $0.hasPrefix(part) : $0.contains(part)) }
        return (all.first { $0.contains("int8") } ?? all.first).map { d.appendingPathComponent($0) }
    }

    static func ready(_ p: ListenPack) -> Bool {
        let d = dir(p)
        return tokens(d) != nil && find(d, "encode") != nil
    }

    static func size(_ p: ListenPack) -> Int64 {
        files(dir(p)).reduce(Int64(0)) { n, f in
            n + Int64((try? dir(p).appendingPathComponent(f).resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0)
        }
    }

    // ---- The recogniser: loaded once and kept; a Whisper model is made
    // again for another language.

    private static let lock = NSLock()
    private static var rec: OpaquePointer?
    private static var loaded = "", loadedLang = ""
    private static let stopLock = NSLock()
    private static var _stop = false
    static var stop: Bool {
        get { stopLock.lock(); defer { stopLock.unlock() }; return _stop }
        set { stopLock.lock(); _stop = newValue; stopLock.unlock() }
    }

    static func load(_ p: ListenPack, lang: String) -> Bool {
        #if canImport(SherpaOnnxC)
        lock.lock(); defer { lock.unlock() }
        guard supported, ready(p) else { return false }
        let l = p.kind == "whisper" ? lang : ""
        if rec != nil && loaded == p.id && loadedLang == l { return true }
        releaseLocked()
        let d = dir(p)
        var held: [UnsafeMutablePointer<CChar>] = []
        func c(_ s: String) -> UnsafePointer<CChar> {
            let x = strdup(s)!
            held.append(x)
            return UnsafePointer(x)
        }
        defer { held.forEach { free($0) } }
        var cfg = SherpaOnnxOfflineRecognizerConfig()
        cfg.feat_config.sample_rate = Int32(rate)
        cfg.feat_config.feature_dim = 80
        cfg.decoding_method = c("greedy_search")
        cfg.model_config.tokens = c(tokens(d)!.path)
        cfg.model_config.num_threads = Int32(max(1, min(4, ProcessInfo.processInfo.activeProcessorCount / 2)))
        cfg.model_config.provider = c("cpu")
        switch p.kind {
        case "nemo":
            guard let e = find(d, "encoder"), let de = find(d, "decoder"), let j = find(d, "joiner") else { return false }
            cfg.model_config.transducer.encoder = c(e.path)
            cfg.model_config.transducer.decoder = c(de.path)
            cfg.model_config.transducer.joiner = c(j.path)
            cfg.model_config.model_type = c("nemo_transducer")
        case "moonshine":
            guard let pre = find(d, "preprocess", exact: true), let e = find(d, "encode", exact: true),
                  let u = find(d, "uncached_decode", exact: true), let ca = find(d, "cached_decode", exact: true) else { return false }
            cfg.model_config.moonshine.preprocessor = c(pre.path)
            cfg.model_config.moonshine.encoder = c(e.path)
            cfg.model_config.moonshine.uncached_decoder = c(u.path)
            cfg.model_config.moonshine.cached_decoder = c(ca.path)
        default:
            guard let e = find(d, "encoder"), let de = find(d, "decoder") else { return false }
            cfg.model_config.whisper.encoder = c(e.path)
            cfg.model_config.whisper.decoder = c(de.path)
            cfg.model_config.whisper.language = c(l)
            cfg.model_config.whisper.task = c("transcribe")
            cfg.model_config.whisper.tail_paddings = 1000
        }
        guard let r = SherpaOnnxCreateOfflineRecognizer(&cfg) else { return false }
        rec = r
        loaded = p.id
        loadedLang = l
        return true
        #else
        return false
        #endif
    }

    static func release() {
        lock.lock(); defer { lock.unlock() }
        releaseLocked()
    }

    private static func releaseLocked() {
        #if canImport(SherpaOnnxC)
        if let r = rec { SherpaOnnxDestroyOfflineRecognizer(r) }
        #endif
        rec = nil
        loaded = ""
        loadedLang = ""
    }

    // One window: its text, and its words with their times where the model
    // gives them (a token starting with ▁ or a space starts a word).
    private static func recognize(_ samples: [Float], into p: inout ListenPiece) {
        #if canImport(SherpaOnnxC)
        lock.lock(); defer { lock.unlock() }
        guard let r = rec, let s = SherpaOnnxCreateOfflineStream(r) else { return }
        defer { SherpaOnnxDestroyOfflineStream(s) }
        samples.withUnsafeBufferPointer { SherpaOnnxAcceptWaveformOffline(s, Int32(rate), $0.baseAddress, Int32(samples.count)) }
        SherpaOnnxDecodeOfflineStream(r, s)
        guard let res = SherpaOnnxGetOfflineStreamResult(s) else { return }
        defer { SherpaOnnxDestroyOfflineRecognizerResult(res) }
        let out = res.pointee
        p.text = (out.text.map { String(cString: $0) } ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let n = Int(out.count)
        guard n > 0, let arr = out.tokens_arr else { return }
        let tokens = (0..<n).map { arr[$0].map { String(cString: $0) } ?? "" }
        let timed = out.timestamps != nil
        var word: String?
        for (i, t) in tokens.enumerated() {
            let starts = t.hasPrefix("▁") || t.hasPrefix(" ") || word == nil
            let bare = t.replacingOccurrences(of: "▁", with: " ")
            if starts {
                if let w = word?.trimmingCharacters(in: .whitespaces), !w.isEmpty { p.words.append(w) }
                word = bare.trimmingCharacters(in: .whitespaces)
                if timed { p.times.append(p.t0 + Double(out.timestamps[i])) }
            } else {
                word = (word ?? "") + bare
            }
        }
        if let w = word?.trimmingCharacters(in: .whitespaces), !w.isEmpty { p.words.append(w) }
        if !timed || p.times.count != p.words.count { p.times = []; p.words = [] }
        #endif
    }

    // ---- When not to work: low and not charging, or hot.

    static func holdOff() -> String {
        let d = UIDevice.current
        DispatchQueue.main.sync { d.isBatteryMonitoringEnabled = true }
        if d.batteryState == .unplugged && d.batteryLevel >= 0 && d.batteryLevel < 0.2 { return "battery" }
        let t = ProcessInfo.processInfo.thermalState
        if t == .serious || t == .critical { return "hot" }
        return ""
    }

    static func charging() -> Bool {
        let d = UIDevice.current
        if !d.isBatteryMonitoringEnabled { return false }
        return d.batteryState == .charging || d.batteryState == .full
    }

    // ---- The sound: a stretch of a part as 16 kHz mono samples.

    /// Samples from `fromMs` to `toMs` (or the end); nil when the file can't be read.
    static func decode(_ url: URL, fromMs: Int64, toMs: Int64) -> [Float]? {
        let asset = AVURLAsset(url: url)
        guard let track = asset.tracks(withMediaType: .audio).first, let reader = try? AVAssetReader(asset: asset) else { return nil }
        let from = CMTime(value: fromMs, timescale: 1000)
        reader.timeRange = toMs > fromMs ? CMTimeRange(start: from, end: CMTime(value: toMs, timescale: 1000))
            : CMTimeRange(start: from, duration: .positiveInfinity)
        let out = AVAssetReaderTrackOutput(track: track, outputSettings: [
            AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: rate, AVNumberOfChannelsKey: 1,
            AVLinearPCMBitDepthKey: 32, AVLinearPCMIsFloatKey: true, AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsNonInterleaved: false,
        ])
        out.alwaysCopiesSampleData = false
        guard reader.canAdd(out) else { return nil }
        reader.add(out)
        guard reader.startReading() else { return nil }
        var all: [Float] = []
        all.reserveCapacity(max(0, Int(toMs - fromMs)) * rate / 1000)
        while let buf = out.copyNextSampleBuffer() {
            if stop { reader.cancelReading(); return nil }
            guard let block = CMSampleBufferGetDataBuffer(buf) else { continue }
            let len = CMBlockBufferGetDataLength(block)
            var chunk = [Float](repeating: 0, count: len / 4)
            chunk.withUnsafeMutableBytes { _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: len, destination: $0.baseAddress!) }
            all += chunk
        }
        return reader.status == .failed ? nil : all
    }

    // ---- Recognition: the stretch's pieces (times in seconds from the part's start).

    private static let win = 20 * rate, minWin = 8 * rate, frame = rate / 50

    static func recognize(_ all: [Float], fromSec: Double, each: (ListenPiece) -> Void) -> [ListenPiece] {
        var out: [ListenPiece] = []
        var at = 0
        var quietBefore = 0.0
        while at < all.count {
            if stop { break }
            var end = min(all.count, at + win)
            var quietAfter = 0.0
            if end < all.count {
                // The quietest 20 ms frame between 8 and 20 s in.
                var best = end
                var low = Double.greatestFiniteMagnitude
                var f = at + minWin
                while f + frame <= end {
                    var e = 0.0
                    for i in f..<(f + frame) { e += Double(all[i] * all[i]) }
                    if e < low { low = e; best = f + frame / 2 }
                    f += frame
                }
                end = best
                quietAfter = quietRun(all, end)
            }
            let window = Array(all[at..<end])
            var p = ListenPiece()
            p.t0 = fromSec + Double(at) / Double(rate)
            p.t1 = fromSec + Double(end) / Double(rate)
            p.quiet = quietBefore
            if loud(window) { recognize(window, into: &p) }
            if !p.text.isEmpty { out.append(p); each(p) }
            quietBefore = quietAfter
            at = end
        }
        return out
    }

    private static func rms(_ s: [Float], _ a: Int, _ b: Int) -> Double {
        var e = 0.0
        for i in a..<b { e += Double(s[i] * s[i]) }
        return (e / Double(max(1, b - a))).squareRoot()
    }

    // How long the near-silence around a point lasts, in seconds.
    private static func quietRun(_ all: [Float], _ mid: Int) -> Double {
        let floor = 0.004
        var a = mid, b = mid
        while a - frame > 0 && rms(all, a - frame, a) < floor { a -= frame }
        while b + frame < all.count && rms(all, b, b + frame) < floor { b += frame }
        return Double(b - a) / Double(rate)
    }

    private static func loud(_ s: [Float]) -> Bool { s.count > rate / 4 && rms(s, 0, s.count) > 0.003 }

    // ---- The downloads, as Kokoro's.

    private static let stepLock = NSLock()
    private static var _step = ""
    static var step: String {
        get { stepLock.lock(); defer { stepLock.unlock() }; return _step }
        set { stepLock.lock(); _step = newValue; stepLock.unlock() }
    }
    static var done: Int64 = 0
    static var total: Int64 = 0

    static var archive: URL { root.appendingPathComponent("download.tar.bz2") }

    static let downloads = PackDownloads("waypage.listen", archive: { Listen.archive }, busy: { Listen.downloading() != nil },
                                         step: { Listen.step = $0 }, progress: { Listen.done = $0; if $1 > 0 { Listen.total = $1 } })

    static func downloading() -> ListenPack? { pack(UserDefaults.standard.string(forKey: packKey) ?? "") }

    static func start(_ p: ListenPack) {
        cancel()
        UserDefaults.standard.set(p.id, forKey: packKey)
        step = "downloading"
        done = 0
        total = p.bytes
        downloads.start(URL(string: base + p.file)!)
    }

    static func cancel() {
        downloads.cancel()
        UserDefaults.standard.removeObject(forKey: packKey)
        try? FileManager.default.removeItem(at: archive)
        if step == "downloading" || step == "downloaded" || step == "failed" { step = "" }
    }

    /// Checks the archive and unpacks the model's own files. False when it isn't the one expected.
    static func unpack() throws -> Bool {
        guard let p = downloading() else { return false }
        step = "checking"
        guard try Kokoro.sha256(of: archive) == p.sha256 else {
            cancel()
            return false
        }
        step = "unpacking"
        let fm = FileManager.default
        let tmp = root.appendingPathComponent("part", isDirectory: true)
        try? fm.removeItem(at: tmp)
        try fm.createDirectory(at: tmp, withIntermediateDirectories: true)
        done = 0
        total = Int64((try? archive.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0)
        // Only the model's top folder: no test sounds; and a Whisper
        // archive's full-size models are left out for its int8 ones.
        try Kokoro.untarBz2(archive, into: tmp, keep: { name in
            !name.contains("/") && (name.hasSuffix(".onnx") || name.hasSuffix("tokens.txt"))
                && !(p.kind == "whisper" && name.hasSuffix(".onnx") && !name.contains("int8"))
        }) { done = $0 }
        let d = dir(p)
        if loaded == p.id { release() }
        try? fm.removeItem(at: d)
        try fm.moveItem(at: tmp, to: d)
        try? fm.removeItem(at: archive)
        UserDefaults.standard.removeObject(forKey: packKey)
        step = ""
        return true
    }

    static func remove(_ p: ListenPack) {
        if downloading()?.id == p.id { cancel() }
        if loaded == p.id { release() }
        try? FileManager.default.removeItem(at: dir(p))
    }
}
