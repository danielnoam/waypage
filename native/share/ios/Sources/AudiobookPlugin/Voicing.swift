import AVFoundation
import Foundation

// The narration saved as sound (Save the narration, app-listen.js) on the
// iPhone, as Android's Voicing.java: each piece spoken by Narrate's voice,
// Kokoro or Piper through KokoroEngine or one of the phone's own through
// AVSpeechSynthesizer's write, gathered as mono samples and encoded into
// one AAC .m4a, with where each piece starts and ends in it. Runs on the
// caller's thread, never the main one (the phone's voices answer there).
enum Voicing {
    enum Fail: Error { case engine, silent, stopped }

    struct Out {
        let url: URL
        let dur: Double
        let t0: [Double], t1: [Double]
    }

    private static let stopLock = NSLock()
    private static var _stop = false
    static var stop: Bool {
        get { stopLock.lock(); defer { stopLock.unlock() }; return _stop }
        set { stopLock.lock(); _stop = newValue; stopLock.unlock() }
    }

    private static let aacRates = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]
    private static let quiet: Float = 0.01

    // blocks[i]: the paragraph piece i is in, for a longer pause between
    // paragraphs than between sentences.
    static func render(items: [String], blocks: [Int], lang: String, voice: String, engine: String,
                       to out: URL, step: (Int, Int) -> Void) throws -> Out {
        let l = lang.isEmpty ? (Locale.preferredLanguages.first ?? "en") : lang
        let speak: (String) -> ([Float], Int)?
        if let pick = Kokoro.pick(voice: voice, lang: l, ours: engine == KokoroPlugin.engineName) {
            guard let tts = KokoroEngine.get(pick.pack) else { throw Fail.engine }
            let el = pick.pack.multi && pick.sid < pick.pack.voices.count ? Kokoro.espeakOf(pick.pack.voices[pick.sid]) : ""
            speak = { text in
                var all: [Float] = []
                tts.generate(text, sid: pick.sid, speed: 1, lang: el) { s in
                    if stop { return false }
                    all.append(contentsOf: s)
                    return true
                }
                return (all, tts.sampleRate)
            }
        } else {
            let phone = Phone(voice: voice, lang: l)
            speak = { phone.speak($0) }
        }

        try? FileManager.default.removeItem(at: out)
        var file: AVAudioFile?
        var format: AVAudioFormat?
        var rate = 0
        var samples = 0
        var t0 = [Double](repeating: 0, count: items.count), t1 = t0
        func write(_ s: [Float]) throws {
            guard let f = file, let fm = format else { return }
            var at = 0
            while at < s.count {
                let n = min(s.count - at, 1 << 15)
                guard let buf = AVAudioPCMBuffer(pcmFormat: fm, frameCapacity: AVAudioFrameCount(n)) else { throw Fail.engine }
                buf.frameLength = AVAudioFrameCount(n)
                s.withUnsafeBufferPointer { buf.floatChannelData![0].update(from: $0.baseAddress! + at, count: n) }
                try f.write(from: buf)
                at += n
            }
            samples += s.count
        }
        func silence(_ secs: Double) throws { try write([Float](repeating: 0, count: Int((secs * Double(rate)).rounded()))) }
        func now() -> Double { rate > 0 ? Double(samples) / Double(rate) : 0 }

        do {
            for i in items.indices {
                if stop { throw Fail.stopped }
                let text = items[i].trimmingCharacters(in: .whitespacesAndNewlines)
                var made: ([Float], Int)?
                if !text.isEmpty { made = speak(text) }
                if stop { throw Fail.stopped }
                var s: [Float] = [], r = 0
                if let m = made, m.1 > 0 { r = m.1; s = trim(m.0, rate: r) }
                if !s.isEmpty {
                    if file == nil {
                        rate = aacRates.contains(r) ? r : 24000
                        let fm = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: Double(rate), channels: 1, interleaved: false)!
                        format = fm
                        file = try AVAudioFile(forWriting: out, settings: [
                            AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: rate,
                            AVNumberOfChannelsKey: 1, AVEncoderBitRateKey: 48000,
                        ], commonFormat: .pcmFormatFloat32, interleaved: false)
                    }
                    let pcm = r == rate ? s : resample(s, from: r, to: rate)
                    if i > 0 { try silence(i < blocks.count && i - 1 < blocks.count && blocks[i] == blocks[i - 1] ? 0.12 : 0.45) }
                    t0[i] = now()
                    try write(pcm)
                    t1[i] = now()
                } else {
                    t0[i] = now()
                    t1[i] = now()
                }
                step(i + 1, items.count)
            }
            if file == nil { throw Fail.silent }
            try silence(0.6)
            let dur = now()
            file = nil
            return Out(url: out, dur: dur, t0: t0, t1: t1)
        } catch {
            file = nil
            try? FileManager.default.removeItem(at: out)
            throw error
        }
    }

    // The quiet a voice leaves around what it says, cut to 30 ms, so the
    // pauses between pieces are the ones set above.
    private static func trim(_ s: [Float], rate: Int) -> [Float] {
        guard let a = s.firstIndex(where: { abs($0) >= quiet }), let b = s.lastIndex(where: { abs($0) >= quiet }) else { return [] }
        let pad = rate * 30 / 1000
        return Array(s[max(0, a - pad)...min(s.count - 1, b + pad)])
    }

    private static func resample(_ s: [Float], from: Int, to: Int) -> [Float] {
        let n = Int(Int64(s.count) * Int64(to) / Int64(from))
        guard n > 0, !s.isEmpty else { return [] }
        return (0..<n).map { i in
            let x = Double(i) * Double(from) / Double(to)
            let a = min(Int(x), s.count - 1), b = min(s.count - 1, a + 1)
            let f = Float(x - Double(a))
            return s[a] * (1 - f) + s[b] * f
        }
    }

    // One of the phone's own voices, written to samples rather than heard.
    private final class Phone: NSObject, AVSpeechSynthesizerDelegate {
        private let synth = AVSpeechSynthesizer()
        private let voice: AVSpeechSynthesisVoice?
        private let lock = NSLock()
        private var got: [Float] = []
        private var rate = 0
        private var done: DispatchSemaphore?
        private var current: AVSpeechUtterance?

        init(voice: String, lang: String) {
            self.voice = (voice.isEmpty ? nil : AVSpeechSynthesisVoice(identifier: voice)) ?? AVSpeechSynthesisVoice(language: lang)
            super.init()
            synth.delegate = self
        }

        func speak(_ text: String) -> ([Float], Int)? {
            let u = AVSpeechUtterance(string: text)
            u.voice = voice
            u.rate = AVSpeechUtteranceDefaultSpeechRate
            let sem = DispatchSemaphore(value: 0)
            lock.lock(); got = []; rate = 0; done = sem; current = u; lock.unlock()
            synth.write(u) { [weak self] b in
                guard let self = self, let p = b as? AVAudioPCMBuffer else { return }
                self.lock.lock(); defer { self.lock.unlock() }
                guard self.current === u else { return }
                if p.frameLength == 0 { self.finish(u); return }
                self.rate = Int(p.format.sampleRate)
                self.got.append(contentsOf: Self.mono(p))
            }
            var waited = 0.0
            let most = 60 + Double(text.count) * 0.2
            while sem.wait(timeout: .now() + 0.5) == .timedOut {
                waited += 0.5
                if stop || waited > most { synth.stopSpeaking(at: .immediate); break }
            }
            lock.lock(); defer { lock.unlock() }
            done = nil
            current = nil
            return rate > 0 ? (got, rate) : nil
        }

        // Under the lock; only for the utterance being written.
        private func finish(_ u: AVSpeechUtterance) {
            guard current === u else { return }
            done?.signal()
            done = nil
        }

        func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
            // The last buffer can come just after: a moment's grace.
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.3) { [weak self] in
                guard let self = self else { return }
                self.lock.lock(); self.finish(u); self.lock.unlock()
            }
        }

        func speechSynthesizer(_ s: AVSpeechSynthesizer, didCancel u: AVSpeechUtterance) {
            lock.lock(); finish(u); lock.unlock()
        }

        private static func mono(_ p: AVAudioPCMBuffer) -> [Float] {
            let n = Int(p.frameLength), ch = Int(p.format.channelCount)
            guard n > 0, ch > 0 else { return [] }
            var out = [Float](repeating: 0, count: n)
            let inter = p.format.isInterleaved
            if let f = p.floatChannelData {
                for c in 0..<ch { for i in 0..<n { out[i] += inter ? f[0][i * ch + c] : f[c][i] } }
            } else if let s = p.int16ChannelData {
                for c in 0..<ch { for i in 0..<n { out[i] += Float(inter ? s[0][i * ch + c] : s[c][i]) / 32768 } }
            } else if let s = p.int32ChannelData {
                for c in 0..<ch { for i in 0..<n { out[i] += Float(inter ? s[0][i * ch + c] : s[c][i]) / 2_147_483_648 } }
            }
            if ch > 1 { for i in 0..<n { out[i] /= Float(ch) } }
            return out
        }
    }
}
