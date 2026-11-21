import CommonCrypto
import Foundation
@_implementationOnly import WaypageBZ2
#if canImport(SherpaOnnxC)
@_implementationOnly import SherpaOnnxC
#endif

// More speech engines on iOS, as Android's Kokoro.java: sherpa-onnx's
// Kokoro and Piper models, downloaded from Settings (KokoroPlugin) and
// spoken by Narrate (SpeechPlugin, through KokoroVoice). iOS lets no app
// add voices to the phone's own list, so only Narrate speaks them. The
// engine (tools/sherpa-ios.sh) is linked into the app; the models are the
// downloads, the same archives as Android's, each checked against its
// SHA-256 before it's unpacked. Nothing is sent anywhere.
final class KokoroPack {
    let id: String, title: String, note: String, file: String, sha256: String, lexicons: String
    let bytes: Int64
    let voices: [String]
    var lang = "", speaker = "", gender = ""

    init(_ id: String, _ title: String, _ note: String, _ file: String, _ sha256: String, _ bytes: Int64, _ lexicons: String, _ voices: [String]) {
        self.id = id; self.title = title; self.note = note; self.file = file; self.sha256 = sha256
        self.bytes = bytes; self.lexicons = lexicons; self.voices = voices
    }

    var multi: Bool { !lexicons.isEmpty }
    var piper: Bool { !lang.isEmpty }
    /// Its voice's name in Narrate: piper-m_thorsten.
    var voice: String { Kokoro.piperPrefix + gender + "_" + speaker }
}

enum Kokoro {
    static let base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/"
    static let prefix = "kokoro-"
    static let piperPrefix = "piper-"

    private static func piper(_ id: String, _ gender: String, _ sha256: String, _ bytes: Int64) -> KokoroPack {
        piper(id, String(id.split(separator: "-")[1]), gender, sha256, bytes)
    }

    // speaker: the name of the model's speaker 0, when its own name isn't one.
    private static func piper(_ id: String, _ who: String, _ gender: String, _ sha256: String, _ bytes: Int64) -> KokoroPack {
        let parts = id.split(separator: "-").map(String.init)
        let p = KokoroPack(id, who, "", "vits-piper-\(id).tar.bz2", sha256, bytes, "", [who])
        p.lang = parts[0].replacingOccurrences(of: "_", with: "-")
        p.speaker = who
        p.gender = gender
        return p
    }

    // Each model's speakers in order (speaker id = place in the list), as
    // in Kokoro.java.
    private static let v019 = [
        "af_kokoro", "af_bella", "af_nicole", "af_sarah", "af_sky", "am_adam", "am_michael",
        "bf_emma", "bf_isabella", "bm_george", "bm_lewis",
    ]
    private static let v10 = [
        "af_alloy", "af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_nova", "af_river", "af_sarah",
        "af_sky", "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_onyx", "am_puck", "am_santa",
        "bf_alice", "bf_emma", "bf_isabella", "bf_lily", "bm_daniel", "bm_fable", "bm_george", "bm_lewis", "ef_dora", "em_alex",
        "ff_siwis", "hf_alpha", "hf_beta", "hm_omega", "hm_psi", "if_sara", "im_nicola", "jf_alpha", "jf_gongitsune", "jf_nezumi",
        "jf_tebukuro", "jm_kumo", "pf_dora", "pm_alex", "pm_santa", "zf_xiaobei", "zf_xiaoni", "zf_xiaoxiao", "zf_xiaoyi", "zm_yunjian",
        "zm_yunxi", "zm_yunxia", "zm_yunyang",
    ]
    private static let v11: [String] = {
        let zf = [1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 21, 22, 23, 24, 26, 27, 28, 32, 36, 38, 39, 40, 42, 43, 44, 46, 47, 48, 49,
                  51, 59, 60, 67, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 83, 84, 85, 86, 87, 88, 90, 92, 93, 94, 99]
        let zm = [9, 10, 11, 12, 13, 14, 15, 16, 20, 25, 29, 30, 31, 33, 34, 35, 37, 41, 45, 50, 52, 53, 54, 55, 56, 57, 58, 61, 62,
                  63, 64, 65, 66, 68, 69, 80, 81, 82, 89, 91, 95, 96, 97, 98, 100]
        return ["af_maple", "af_sol", "bf_vale"] + zf.map { String(format: "zf_%03d", $0) } + zm.map { String(format: "zm_%03d", $0) }
    }()

    private static let multiLex = "lexicon-us-en.txt,lexicon-zh.txt"
    static let packs: [KokoroPack] = [
        KokoroPack("v019", "Kokoro 0.19", "English · 11 voices · fastest", "kokoro-int8-en-v0_19.tar.bz2",
                   "c9f0dd393615805b0bab050c340834d5e684e732aec91c0e860cd30e982c08bd", 103_248_205, "", v019),
        KokoroPack("v10", "Kokoro 1.0", "8 languages · 53 voices · the best voices, slowest", "kokoro-multi-lang-v1_0.tar.bz2",
                   "60703707bc05ccd48d60e1eb723f38b07d6e474795a0b6a588d7220400e0f7a4", 349_886_476, multiLex, v10),
        KokoroPack("v11", "Kokoro 1.1", "English and Chinese · 103 voices, 3 English", "kokoro-int8-multi-lang-v1_1.tar.bz2",
                   "259c9c8bc906d6078e4e0570421885dabb68b539c2f970fcbb890a58eeaf3e9c", 147_052_523, multiLex, v11),
    ]

    static let piperVoices: [KokoroPack] = [
        piper("cs_CZ-jirka-medium", "m", "321aafd83dd89b3d5b2c36c5898e0710d4f472f3c191cb7f73901a89b7f8539f", 67_212_775),
        piper("de_DE-thorsten-medium", "m", "50487d9c95fdf2191f31d2588569381063ba1591dcd4c7d4bdd30f12b2191714", 67_214_254),
        piper("el_GR-rapunzelina-low", "f", "bb868070a9ba0d7220b3d7c9291a998c2f60accdb73525bd63b8751b86dd4839", 67_105_521),
        piper("en_GB-cori-medium", "f", "49c9a5361bbdd95d7ca9687c4de11e5908481f65e7c7c368960df79949fdac2b", 67_257_412),
        piper("en_US-ljspeech-medium", "linda", "f", "3dfb4b759d8be032a4903a9538d128b0fda2a06ab1de6cbc2d93a97e2dd83dba", 67_169_893),
        piper("es_ES-davefx-medium", "m", "a3f6beb54a9cb893279f72978a22f807a4d9fc9c7848157b524d5cc7b7f58b22", 67_184_952),
        piper("fa_IR-amir-medium", "m", "46af65c1cdd86ec300db3998f2bf31a68d9e38da930c0655c1ff6f610e84f864", 67_180_373),
        piper("fr_FR-siwis-medium", "f", "375909aa30842b3a4efa10b1beb1d761af792960ae6873b4d53889f96c66195b", 67_207_459),
        piper("nl_NL-pim-medium", "m", "e78ed301bf6fc66561a04c110754cd6928d772630a3b80b09a83f89410130171", 67_240_538),
        piper("pl_PL-gosia-medium", "f", "75bd34dcbdc4dd98d763954756b4b34b4208100497c836381542e4d73dcefa9c", 67_211_182),
        piper("pt_BR-faber-medium", "m", "7add3f923ad6bc25ca8a192805fd1a64d1b3893e4611c4a9719545a825039a83", 67_183_065),
        piper("ru_RU-dmitri-medium", "m", "c86d0803737de13d441923ff3b3f309482fab8d7af3ec85949942809eb9a3660", 67_188_551),
        piper("sv_SE-nst-medium", "m", "5aed0f5ab75135fc3ba6a4f3567e171d72df753305b08a01ca42f79411587f67", 67_144_884),
        piper("tr_TR-fahrettin-medium", "m", "2ee3c18b5dc0a5faf913f995b027163befa6e7a6ad2f5c6b8a2e99fe1aad8b6d", 67_212_827),
        piper("uk_UA-ukrainian_tts-medium", "lada", "f", "92be6ff21ebb1cbcc0c71121a6437db8d060cee5785287aaa6a19a2548f59c03", 80_355_083),
    ]

    static func pack(_ id: String) -> KokoroPack? {
        packs.first { $0.id == id } ?? piperVoices.first { $0.id == id }
    }

    static var supported: Bool {
        #if canImport(SherpaOnnxC)
        return true
        #else
        return false
        #endif
    }

    private static let defaults = UserDefaults.standard
    private static let useKey = "waypage.kokoro.use"
    private static let packKey = "waypage.kokoro.pack"

    // Application Support, left out of iCloud backups: they're downloads
    // that can be fetched again, and Kokoro 1.0 alone is 350 MB.
    static var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var r = base.appendingPathComponent("kokoro", isDirectory: true)
        if !FileManager.default.fileExists(atPath: r.path) {
            try? FileManager.default.createDirectory(at: r, withIntermediateDirectories: true)
            var v = URLResourceValues()
            v.isExcludedFromBackup = true
            try? r.setResourceValues(v)
        }
        return r
    }

    static func dir(_ p: KokoroPack) -> URL { root.appendingPathComponent(p.id, isDirectory: true) }

    private static func exists(_ u: URL) -> Bool { FileManager.default.fileExists(atPath: u.path) }

    static func model(in d: URL) -> URL? {
        let all = ((try? FileManager.default.contentsOfDirectory(at: d, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "onnx" }.sorted { $0.lastPathComponent < $1.lastPathComponent }
        return all.first { $0.lastPathComponent.contains("int8") } ?? all.first
    }

    static func ready(_ p: KokoroPack) -> Bool {
        let d = dir(p)
        return (p.piper || exists(d.appendingPathComponent("voices.bin"))) && exists(d.appendingPathComponent("tokens.txt")) && model(in: d) != nil
    }

    /// The pack Narrate speaks with: the one picked, if it's on the phone.
    static func inUse() -> KokoroPack? {
        if let p = pack(defaults.string(forKey: useKey) ?? ""), !p.piper, ready(p) { return p }
        return packs.first { ready($0) }
    }

    static func piperReady() -> [KokoroPack] { piperVoices.filter { ready($0) } }

    static func use(_ p: KokoroPack) {
        defaults.set(p.id, forKey: useKey)
        KokoroEngine.release()
    }

    static func size(_ p: KokoroPack) -> Int64 {
        guard let e = FileManager.default.enumerator(at: dir(p), includingPropertiesForKeys: [.fileSizeKey]) else { return 0 }
        var n: Int64 = 0
        for case let u as URL in e { n += Int64((try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        return n
    }

    // ---- Voices: kokoro-<id> (kokoro-af_heart) and piper-<f|m>_<speaker>.

    static func languageOf(_ id: String) -> String {
        switch id.first {
        case "a": return "en-US"
        case "b": return "en-GB"
        case "e": return "es-ES"
        case "f": return "fr-FR"
        case "h": return "hi-IN"
        case "i": return "it-IT"
        case "j": return "ja-JP"
        case "p": return "pt-BR"
        default: return "zh-CN"
        }
    }

    // espeak-ng's voice for the words the lexicons don't cover. English and
    // Chinese go through the lexicons ("").
    static func espeakOf(_ id: String) -> String {
        switch id.first {
        case "e": return "es"
        case "f": return "fr-fr"
        case "h": return "hi"
        case "i": return "it"
        case "j": return "ja"
        case "p": return "pt-br"
        default: return ""
        }
    }

    /// "en-US" -> ("en", "US"); "iw" is Hebrew's old code.
    static func split(_ tag: String) -> (String, String) {
        let parts = tag.replacingOccurrences(of: "_", with: "-").split(separator: "-").map(String.init)
        var l = (parts.first ?? "").lowercased()
        if l == "iw" { l = "he" }
        if l == "cmn" || l == "zho" { l = "zh" }
        return (l, parts.count > 1 ? parts[1].uppercased() : "")
    }

    static func matches(_ voiceId: String, _ lang: String) -> Bool { split(languageOf(voiceId)).0 == split(lang).0 }

    static func sid(_ name: String) -> Int {
        guard let p = inUse(), name.hasPrefix(prefix) else { return -1 }
        return p.voices.firstIndex(of: String(name.dropFirst(prefix.count))) ?? -1
    }

    /// A language's own voice when none is picked: the best of the pack in that language.
    static func defaultSid(_ lang: String) -> Int {
        guard let p = inUse() else { return 0 }
        let (l, country) = split(lang)
        let gb = country == "GB" || country == "GBR"
        for want in [gb ? "bf_emma" : "af_heart", gb ? "bf_vale" : "af_bella", gb ? "bf_emma" : "af_maple"] {
            if let i = p.voices.firstIndex(of: want), matches(want, l) { return i }
        }
        if let i = p.voices.firstIndex(where: { matches($0, l) && (!gb || $0.first == "b") }) { return i }
        return p.voices.firstIndex { matches($0, l) } ?? 0
    }

    static func kokoroHas(_ lang: String) -> Bool { inUse()?.voices.contains { matches($0, lang) } ?? false }

    static func piperMatches(_ p: KokoroPack, _ lang: String) -> Bool { split(p.lang).0 == split(lang).0 }

    static func piperVoice(_ name: String) -> KokoroPack? {
        guard name.hasPrefix(piperPrefix) else { return nil }
        return piperVoices.first { $0.voice == name && ready($0) }
    }

    static func piperFor(_ lang: String) -> KokoroPack? {
        let (_, country) = split(lang)
        let mine = piperReady().filter { piperMatches($0, lang) }
        return mine.first { split($0.lang).1 == country } ?? mine.first
    }

    static func has(_ lang: String) -> Bool { kokoroHas(lang) || piperReady().contains { piperMatches($0, lang) } }

    struct Pick: Equatable {
        let pack: KokoroPack
        let sid: Int
        static func == (a: Pick, b: Pick) -> Bool { a.pack === b.pack && a.sid == b.sid }
    }

    /// What speaks a reading: the voice asked for by name, else, when
    /// Waypage's engine was picked for the language, its voice for it.
    /// Nil when the phone's own voices read.
    static func pick(voice: String, lang: String, ours: Bool) -> Pick? {
        guard supported else { return nil }
        if let p = piperVoice(voice) { return Pick(pack: p, sid: 0) }
        let k = inUse()
        let s = sid(voice)
        if let k = k, s >= 0 { return Pick(pack: k, sid: s) }
        guard ours, voice.isEmpty || voice.hasPrefix(prefix) || voice.hasPrefix(piperPrefix) else { return nil }
        if let k = k, kokoroHas(lang) { return Pick(pack: k, sid: defaultSid(lang)) }
        if let p = piperFor(lang) { return Pick(pack: p, sid: 0) }
        return nil
    }

    /// Narrate's list: the pack in use's voices and every Piper voice here.
    static func voiceList() -> [[String: Any]] {
        guard supported else { return [] }
        var out: [[String: Any]] = []
        if let p = inUse() {
            for v in p.voices {
                out.append(["id": prefix + v, "name": prefix + v, "lang": languageOf(v), "online": false, "quality": 500,
                            "gender": v.dropFirst().first == "m" ? "male" : "female"])
            }
        }
        for p in piperReady() {
            out.append(["id": p.voice, "name": p.voice, "lang": p.lang, "online": false, "quality": 400,
                        "gender": p.gender == "m" ? "male" : "female"])
        }
        return out
    }

    // ---- Downloads: a background URLSession, so one goes on while the
    // app is put away; then it's checked and unpacked on the next ask.

    // Set from the download's and the unpacking's threads, read on main.
    private static let stepLock = NSLock()
    private static var _step = ""
    static var step: String {
        get { stepLock.lock(); defer { stepLock.unlock() }; return _step }
        set { stepLock.lock(); _step = newValue; stepLock.unlock() }
    }
    static var done: Int64 = 0
    static var total: Int64 = 0

    static var archive: URL { root.appendingPathComponent("download.tar.bz2") }

    /// The pack being downloaded or unpacked, or nil.
    static func downloading() -> KokoroPack? { pack(defaults.string(forKey: packKey) ?? "") }

    static func start(_ p: KokoroPack) {
        cancel()
        defaults.set(p.id, forKey: packKey)
        step = "downloading"
        done = 0
        total = p.bytes
        PackDownloads.shared.start(URL(string: base + p.file)!)
    }

    static func cancel() {
        PackDownloads.shared.cancel()
        defaults.removeObject(forKey: packKey)
        try? FileManager.default.removeItem(at: archive)
        if step == "downloading" || step == "downloaded" || step == "failed" { step = "" }
    }

    static func remove(_ p: KokoroPack) {
        if downloading()?.id == p.id { cancel() }
        KokoroEngine.release()
        try? FileManager.default.removeItem(at: dir(p))
    }

    /// Checks the archive and unpacks it. False when it isn't the one expected.
    static func unpack() throws -> Bool {
        guard let p = downloading() else { return false }
        step = "checking"
        guard try sha256(of: archive) == p.sha256 else {
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
        try untarBz2(archive, into: tmp) { done = $0 }
        let d = dir(p)
        KokoroEngine.release()
        try? fm.removeItem(at: d)
        try fm.moveItem(at: tmp, to: d)
        try? fm.removeItem(at: archive)
        defaults.removeObject(forKey: packKey)
        if !p.piper { defaults.set(p.id, forKey: useKey) }
        step = ""
        return true
    }

    static func sha256(of url: URL) throws -> String {
        let h = try FileHandle(forReadingFrom: url)
        defer { try? h.close() }
        var ctx = CC_SHA256_CTX()
        CC_SHA256_Init(&ctx)
        while true {
            let data = h.readData(ofLength: 1 << 20)
            if data.isEmpty { break }
            data.withUnsafeBytes { _ = CC_SHA256_Update(&ctx, $0.baseAddress, CC_LONG(data.count)) }
        }
        var out = [UInt8](repeating: 0, count: Int(CC_SHA256_DIGEST_LENGTH))
        CC_SHA256_Final(&out, &ctx)
        return out.map { String(format: "%02x", $0) }.joined()
    }

    // A .tar.bz2, read as it's decompressed: the archive's own top folder
    // (kokoro-int8-en-v0_19/) is dropped, links are skipped, and nothing
    // may land outside `dest`. `read` hears how far into the archive it is.
    static func untarBz2(_ src: URL, into dest: URL, keep: (String) -> Bool = { _ in true }, read: (Int64) -> Void) throws {
        enum Bad: Error { case bz2, tar }
        let input = try FileHandle(forReadingFrom: src)
        defer { try? input.close() }
        var strm = bz_stream()
        guard BZ2_bzDecompressInit(&strm, 0, 0) == BZ_OK else { throw Bad.bz2 }
        defer { BZ2_bzDecompressEnd(&strm) }
        let destPath = dest.standardizedFileURL.path + "/"
        var consumed: Int64 = 0
        var ended = false
        let inCap = 1 << 18, outCap = 1 << 18
        let inBuf = UnsafeMutablePointer<CChar>.allocate(capacity: inCap)
        let outBuf = UnsafeMutablePointer<CChar>.allocate(capacity: outCap)
        defer { inBuf.deallocate(); outBuf.deallocate() }
        // Decompressed and not yet taken: pending[pos...].
        var pending = Data()
        var pos = 0

        func refill() -> Bool {
            let d = input.readData(ofLength: inCap)
            if d.isEmpty { return false }
            d.copyBytes(to: UnsafeMutableRawPointer(inBuf).assumingMemoryBound(to: UInt8.self), count: d.count)
            strm.next_in = inBuf
            strm.avail_in = UInt32(d.count)
            consumed += Int64(d.count)
            read(consumed)
            return true
        }
        // At least `n` bytes ready unless the archive ends first.
        func fill(_ n: Int) throws {
            if pos > 0 && pos >= pending.count / 2 {
                pending = pending.subdata(in: pos..<pending.count)
                pos = 0
            }
            while pending.count - pos < n && !ended {
                if strm.avail_in == 0 && !refill() { ended = true; break }
                strm.next_out = outBuf
                strm.avail_out = UInt32(outCap)
                let r = BZ2_bzDecompress(&strm)
                outBuf.withMemoryRebound(to: UInt8.self, capacity: outCap) { pending.append($0, count: outCap - Int(strm.avail_out)) }
                if r == BZ_STREAM_END {
                    // bzip2 streams one after another make one file.
                    let at = strm.next_in, left = strm.avail_in
                    BZ2_bzDecompressEnd(&strm)
                    strm = bz_stream()
                    guard BZ2_bzDecompressInit(&strm, 0, 0) == BZ_OK else { throw Bad.bz2 }
                    strm.next_in = at
                    strm.avail_in = left
                } else if r != BZ_OK {
                    throw Bad.bz2
                }
            }
        }
        func take(_ n: Int) throws -> Data {
            try fill(n)
            guard pending.count - pos >= n else { throw Bad.tar }
            let d = pending.subdata(in: pos..<(pos + n))
            pos += n
            return d
        }
        func text(_ d: Data, _ at: Int, _ len: Int) -> String {
            let s = d.subdata(in: at..<(at + len))
            return String(decoding: s.prefix { $0 != 0 }, as: UTF8.self)
        }
        func octal(_ d: Data, _ at: Int, _ len: Int) -> Int {
            Int(text(d, at, len).trimmingCharacters(in: CharacterSet(charactersIn: " \0")), radix: 8) ?? 0
        }

        var longName: String?
        let fm = FileManager.default
        while true {
            let h = try take(512)
            if h.allSatisfy({ $0 == 0 }) { break }
            let size = octal(h, 124, 12)
            let type = h[h.startIndex + 156]
            let padded = (size + 511) / 512 * 512
            var name = longName ?? {
                let prefix = text(h, 345, 155)
                let n = text(h, 0, 100)
                return prefix.isEmpty ? n : prefix + "/" + n
            }()
            longName = nil
            switch type {
            case UInt8(ascii: "L"):
                longName = String(decoding: try take(padded).prefix(size).prefix { $0 != 0 }, as: UTF8.self)
                continue
            case UInt8(ascii: "x"):
                let pax = String(decoding: try take(padded).prefix(size), as: UTF8.self)
                for line in pax.split(separator: "\n") where line.contains(" path=") {
                    if let r = line.range(of: " path=") { longName = String(line[r.upperBound...]) }
                }
                continue
            case UInt8(ascii: "g"):
                _ = try take(padded)
                continue
            default: break
            }
            if let slash = name.firstIndex(of: "/") { name = String(name[name.index(after: slash)...]) } else if type == UInt8(ascii: "5") { name = "" }
            let isDir = type == UInt8(ascii: "5")
            let isFile = type == 0 || type == UInt8(ascii: "0")
            let out = dest.appendingPathComponent(name).standardizedFileURL
            let inside = (out.path + (isDir ? "/" : "")).hasPrefix(destPath) && !name.isEmpty
            if isDir {
                if inside { try fm.createDirectory(at: out, withIntermediateDirectories: true) }
                _ = try take(padded)
                continue
            }
            guard isFile, inside, keep(name) else {
                var left = padded
                while left > 0 { let n = min(left, 1 << 20); _ = try take(n); left -= n }
                continue
            }
            try fm.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
            fm.createFile(atPath: out.path, contents: nil)
            let o = try FileHandle(forWritingTo: out)
            var left = size
            while left > 0 {
                let n = min(left, 1 << 20)
                o.write(try take(n))
                left -= n
            }
            try o.close()
            if padded > size { _ = try take(padded - size) }
        }
    }
}

// One download at a time per kind (Kokoro's voices, Listen's models), on a
// background session: it goes on with the app put away, and iOS wakes the
// app to hand it over.
final class PackDownloads: NSObject, URLSessionDownloadDelegate {
    static let shared = PackDownloads("waypage.kokoro", archive: { Kokoro.archive }, busy: { Kokoro.downloading() != nil },
                                      step: { Kokoro.step = $0 }, progress: { Kokoro.done = $0; if $1 > 0 { Kokoro.total = $1 } })

    private let id: String
    private let archive: () -> URL
    private let busy: () -> Bool
    private let step: (String) -> Void
    private let progress: (Int64, Int64) -> Void

    init(_ id: String, archive: @escaping () -> URL, busy: @escaping () -> Bool, step: @escaping (String) -> Void,
         progress: @escaping (Int64, Int64) -> Void) {
        self.id = id; self.archive = archive; self.busy = busy; self.step = step; self.progress = progress
    }

    private lazy var session: URLSession = {
        let c = URLSessionConfiguration.background(withIdentifier: id)
        c.isDiscretionary = false
        c.sessionSendsLaunchEvents = true
        return URLSession(configuration: c, delegate: self, delegateQueue: nil)
    }()
    private var task: URLSessionDownloadTask?

    /// Picks up a download left running by an earlier launch.
    func reconnect() {
        session.getAllTasks { tasks in
            self.task = tasks.compactMap { $0 as? URLSessionDownloadTask }.first { $0.state == .running }
            if self.task != nil, self.busy() { self.step("downloading") }
        }
    }

    func start(_ url: URL) {
        let t = session.downloadTask(with: url)
        task = t
        t.resume()
    }

    func cancel() {
        task?.cancel()
        task = nil
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard downloadTask == task || task == nil else { return }
        progress(totalBytesWritten, totalBytesExpectedToWrite)
    }

    func urlSession(_ s: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        // The file is gone once this returns: moved now.
        let ok = (downloadTask.response as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
        guard ok, busy() else { step("failed"); return }
        try? FileManager.default.removeItem(at: archive())
        do {
            try FileManager.default.moveItem(at: location, to: archive())
            step("downloaded")
        } catch {
            step("failed")
        }
    }

    func urlSession(_ s: URLSession, task t: URLSessionTask, didCompleteWithError error: Error?) {
        if t == task { task = nil }
        guard let e = error as NSError? else { return }
        if e.code == NSURLErrorCancelled { return }
        if busy() { step("failed") }
    }
}

// The model in memory: one at a time, as Kokoro 1.0 alone takes ~330 MB.
// Loading one takes a few seconds, so it's kept until another is wanted.
final class KokoroEngine {
    private static let lock = NSLock()
    private static var current: KokoroEngine?

    let pack: KokoroPack
    let sampleRate: Int
    #if canImport(SherpaOnnxC)
    private let tts: OpaquePointer
    #else
    private init() { pack = Kokoro.packs[0]; sampleRate = 0 }
    #endif

    #if canImport(SherpaOnnxC)
    private init?(_ p: KokoroPack) {
        let d = Kokoro.dir(p)
        guard let model = Kokoro.model(in: d) else { return nil }
        var held: [UnsafeMutablePointer<CChar>] = []
        func c(_ s: String) -> UnsafePointer<CChar> {
            let p = strdup(s)!
            held.append(p)
            return UnsafePointer(p)
        }
        defer { held.forEach { free($0) } }
        var cfg = SherpaOnnxOfflineTtsConfig()
        let threads = Int32(max(1, min(4, ProcessInfo.processInfo.activeProcessorCount / 2)))
        cfg.model.num_threads = threads
        cfg.model.provider = c("cpu")
        cfg.max_num_sentences = 1
        cfg.silence_scale = 0.2
        let tokens = d.appendingPathComponent("tokens.txt").path
        let data = d.appendingPathComponent("espeak-ng-data").path
        if p.piper {
            cfg.model.vits.model = c(model.path)
            cfg.model.vits.tokens = c(tokens)
            cfg.model.vits.data_dir = c(data)
            cfg.model.vits.noise_scale = 0.667
            cfg.model.vits.noise_scale_w = 0.8
            cfg.model.vits.length_scale = 1
        } else {
            let lex = p.lexicons.split(separator: ",").map { d.appendingPathComponent(String($0)).path }
                .filter { FileManager.default.fileExists(atPath: $0) }.joined(separator: ",")
            cfg.model.kokoro.model = c(model.path)
            cfg.model.kokoro.voices = c(d.appendingPathComponent("voices.bin").path)
            cfg.model.kokoro.tokens = c(tokens)
            cfg.model.kokoro.data_dir = c(data)
            cfg.model.kokoro.lexicon = c(lex)
            cfg.model.kokoro.length_scale = 1
        }
        guard let t = SherpaOnnxCreateOfflineTts(&cfg) else { return nil }
        tts = t
        pack = p
        sampleRate = Int(SherpaOnnxOfflineTtsSampleRate(t))
    }

    deinit { SherpaOnnxDestroyOfflineTts(tts) }
    #endif

    /// The pack's model, loaded once and kept.
    static func get(_ p: KokoroPack) -> KokoroEngine? {
        lock.lock(); defer { lock.unlock() }
        if let e = current, e.pack === p { return e }
        current = nil
        guard Kokoro.ready(p) else { return nil }
        #if canImport(SherpaOnnxC)
        current = KokoroEngine(p)
        return current
        #else
        return nil
        #endif
    }

    // Freed once nothing speaks with it: a reading holds its own reference.
    static func release() {
        lock.lock(); defer { lock.unlock() }
        current = nil
    }

    private final class Box {
        let chunk: ([Float]) -> Bool
        init(_ chunk: @escaping ([Float]) -> Bool) { self.chunk = chunk }
    }

    /// Speaks `text` sentence by sentence into `chunk` (false stops it).
    /// `lang`: espeak-ng's voice for a multi-language model's words.
    @discardableResult
    func generate(_ text: String, sid: Int, speed: Float, lang: String, chunk: @escaping ([Float]) -> Bool) -> Bool {
        #if canImport(SherpaOnnxC)
        let box = Unmanaged.passRetained(Box(chunk))
        defer { box.release() }
        var g = SherpaOnnxGenerationConfig()
        g.sid = Int32(sid)
        g.speed = speed
        g.silence_scale = 0.2
        g.num_steps = 5
        let extra = lang.isEmpty ? nil : strdup("{\"lang\": \"\(lang)\"}")
        defer { if let e = extra { free(e) } }
        g.extra = extra.map { UnsafePointer($0) }
        let audio = text.withCString { t in
            SherpaOnnxOfflineTtsGenerateWithConfig(tts, t, &g, { samples, n, _, arg in
                guard let samples = samples, let arg = arg else { return 1 }
                let b = Unmanaged<Box>.fromOpaque(arg).takeUnretainedValue()
                return b.chunk(Array(UnsafeBufferPointer(start: samples, count: Int(n)))) ? 1 : 0
            }, box.toOpaque())
        }
        guard let a = audio else { return false }
        SherpaOnnxDestroyOfflineTtsGeneratedAudio(a)
        return true
        #else
        return false
        #endif
    }
}
