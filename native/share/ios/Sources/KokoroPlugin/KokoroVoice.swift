import AVFoundation

// Narrate with a Kokoro or Piper voice (SpeechPlugin): each piece is made
// on its own thread, sentence by sentence, and played as it's made on an
// AVAudioEngine, up to about a minute ahead of what's heard, so it reads on
// between paragraphs with the screen locked (the "audio" background mode).
// The callbacks come on the main queue.
final class KokoroVoice {
    /// Piece `i` began playing.
    var onStart: ((Int) -> Void)?
    /// The last piece finished.
    var onEnd: (() -> Void)?

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var format: AVAudioFormat?
    private let maker = DispatchQueue(label: "waypage.kokoro.voice", qos: .userInitiated)
    // Each start bumps it; work and callbacks from an older one stop.
    private let cond = NSCondition()
    private var run = 0
    private var ahead = 0.0
    private static let aheadMax = 60.0

    // Quiet the model leaves around what it says, cut to what reads well,
    // as in Kokoro.java: a piece starts at once, a sentence keeps a short
    // pause, and a piece ends with one, since nothing adds its own here.
    private static let quiet: Float = 0.01
    private static let leadMs = 30, sentenceMs = 250, endMs = 250

    init() {
        engine.attach(player)
    }

    var playing: Bool { player.isPlaying }

    func start(items: [String], from: Int, pick: Kokoro.Pick, speed: Float, volume: Float) {
        let mine = stopMaking()
        player.stop()
        let lang = pick.pack.multi && pick.sid < pick.pack.voices.count ? Kokoro.espeakOf(pick.pack.voices[pick.sid]) : ""
        player.volume = max(0, min(1, volume))
        let speed = max(0.5, min(3, speed))
        maker.async { [weak self] in
            guard let self = self, let tts = KokoroEngine.get(pick.pack) else {
                DispatchQueue.main.async { self?.failed(mine) }
                return
            }
            DispatchQueue.main.sync { self.ready(tts.sampleRate) }
            for i in from..<items.count {
                guard self.current(mine) else { return }
                self.make(tts, items[i], index: i, last: i == items.count - 1, sid: pick.sid, speed: speed, lang: lang, run: mine)
            }
        }
    }

    func pause() { player.pause() }

    func resume() {
        if !engine.isRunning { try? engine.start() }
        player.play()
    }

    func stop() {
        stopMaking()
        player.stop()
        engine.stop()
    }

    @discardableResult
    private func stopMaking() -> Int {
        cond.lock()
        run += 1
        ahead = 0
        let r = run
        cond.broadcast()
        cond.unlock()
        return r
    }

    private func current(_ r: Int) -> Bool {
        cond.lock(); defer { cond.unlock() }
        return run == r
    }

    // The engine at the model's own sample rate, playing.
    private func ready(_ rate: Int) {
        if format?.sampleRate != Double(rate) {
            engine.stop()
            let f = AVAudioFormat(standardFormatWithSampleRate: Double(rate), channels: 1)
            engine.connect(player, to: engine.mainMixerNode, format: f)
            format = f
        }
        if !engine.isRunning { try? engine.start() }
        player.play()
    }

    private func failed(_ r: Int) {
        guard current(r) else { return }
        onEnd?()
    }

    private func make(_ tts: KokoroEngine, _ text: String, index: Int, last: Bool, sid: Int, speed: Float, lang: String, run r: Int) {
        let perMs = max(1, tts.sampleRate / 1000)
        var tail: [Float] = []
        var started = false
        var made = false
        if !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            tts.generate(text, sid: sid, speed: speed, lang: lang) { [weak self] s in
                guard let self = self, self.current(r) else { return false }
                var from = 0
                if !started {
                    from = max(0, (s.firstIndex { abs($0) >= Self.quiet } ?? s.count) - Self.leadMs * perMs)
                    if from >= s.count { return true }
                    started = true
                } else if !tail.isEmpty {
                    self.play(tail, index: index, end: false, run: r)
                }
                let end = (s.lastIndex { abs($0) >= Self.quiet }).map { $0 + 1 } ?? 0
                if end > from { self.play(Array(s[from..<end]), index: index, end: false, run: r); made = true }
                let keep = min(s.count - end, Self.sentenceMs * perMs)
                tail = keep > 0 ? Array(s[end..<(end + keep)]) : []
                return self.current(r)
            }
        }
        guard current(r) else { return }
        // Every piece ends with a buffer that says so, a short quiet when it
        // had nothing to say (or couldn't), so the next one's start is heard.
        let pause = made ? Array(tail.prefix(Self.endMs * perMs)) : []
        play(pause.isEmpty ? [Float](repeating: 0, count: Self.endMs * perMs) : pause, index: index, end: true, run: r, last: last)
    }

    private func play(_ samples: [Float], index: Int, end: Bool, run r: Int, last: Bool = false) {
        guard let f = format, !samples.isEmpty,
              let buf = AVAudioPCMBuffer(pcmFormat: f, frameCapacity: AVAudioFrameCount(samples.count)) else { return }
        buf.frameLength = AVAudioFrameCount(samples.count)
        samples.withUnsafeBufferPointer { buf.floatChannelData![0].update(from: $0.baseAddress!, count: samples.count) }
        let secs = Double(samples.count) / f.sampleRate
        cond.lock()
        while run == r && ahead > Self.aheadMax { cond.wait() }
        guard run == r else { cond.unlock(); return }
        ahead += secs
        cond.unlock()
        player.scheduleBuffer(buf, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            guard let self = self else { return }
            self.cond.lock()
            let still = self.run == r
            if still { self.ahead = max(0, self.ahead - secs); self.cond.broadcast() }
            self.cond.unlock()
            guard still, end else { return }
            DispatchQueue.main.async {
                guard self.current(r) else { return }
                if last { self.onEnd?() } else { self.onStart?(index + 1) }
            }
        }
    }
}
