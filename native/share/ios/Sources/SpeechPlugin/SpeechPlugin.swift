import AVFoundation
import Capacitor
import MediaPlayer
import UIKit

// Read aloud (src/aloud.js, 0.27.0) with the phone's own voices, offline, and
// on with the screen locked: the app has the "audio" background mode
// (tools/ios-project.js) and the lock screen's controls drive it. The same
// calls as Android's SpeechPlugin.java: voices(), play({ items, start, lang,
// voice, rate, title, subtitle, key }), pause(), resume(), stop(),
// seek({ index }), skip({ by }), rate({ rate }), state(), and a "progress"
// event { key, index, state }. And, as on Android:
// keepScreen({ on }), sleep({ seconds }) with a "sleep" event { at },
// queue({ after, items, start, lang, voice, title, subtitle, key }) for the
// clip to go on to while the app is put away, and personalVoice() (iOS 17),
// which asks once to use the voice the person made in Settings and
// resolves { state }: "authorized", "denied", "unsupported" or "unknown".
//
// What's left of the page is queued in the synthesizer at once, so it reads
// on between paragraphs while the app is suspended.
@objc(SpeechPlugin)
public class SpeechPlugin: CAPPlugin, CAPBridgedPlugin, AVSpeechSynthesizerDelegate {
    public let identifier = "SpeechPlugin"
    public let jsName = "Speech"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "voices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seek", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "rate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "volume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepScreen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "sleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "personalVoice", returnType: CAPPluginReturnPromise)
    ]

    private let synth = AVSpeechSynthesizer()
    private var items: [String] = []
    private var queued: [ObjectIdentifier: Int] = [:]
    // Every utterance of this reading stays alive, so a late callback for a
    // stopped one can't match a new one at the same address.
    private var held: [AVSpeechUtterance] = []
    private var index = -1
    private var state = "stopped"
    private var key = ""
    private var lang = ""
    private var voice = ""
    private var rate: Float = 1
    private var title = ""
    private var subtitle = ""
    // Allow mixing (1.42.0): other apps' sound goes on under the voice.
    // iOS shows no lock-screen controls for a mixing app.
    private var mix = false
    // Volume under Allow mixing. An utterance's volume stops at 1, so iOS
    // can turn the voice down but not above normal.
    private var volume: Float = 1
    private var commandsSet = false
    // The sleep timer, in ms since 1970 as the app keeps it; 0 is off. Also
    // checked as each paragraph starts, since a timer can run late while
    // the phone is locked.
    private var sleepAt: Double = 0
    private var sleeper: DispatchWorkItem?
    // The clip to go on to when the one with key `nextAfter` ends.
    private var next: [String: Any]?
    private var nextAfter = ""

    override public func load() {
        synth.delegate = self
    }

    @objc func voices(_ call: CAPPluginCall) {
        let list = AVSpeechSynthesisVoice.speechVoices().map { v -> [String: Any] in
            var quality = v.quality == .enhanced ? 400 : 300
            if #available(iOS 16.0, *), v.quality == .premium { quality = 500 }
            if #available(iOS 17.0, *), v.voiceTraits.contains(.isPersonalVoice) { quality = 600 }
            let gender = v.gender == .female ? "female" : v.gender == .male ? "male" : ""
            return ["id": v.identifier, "name": v.name, "lang": v.language, "online": false, "quality": quality, "gender": gender]
        }
        call.resolve(["voices": list])
    }

    @objc func play(_ call: CAPPluginCall) {
        let list = (call.getArray("items") ?? []).compactMap { $0 as? String }
        guard !list.isEmpty else {
            call.reject("Nothing to read")
            return
        }
        DispatchQueue.main.async {
            self.items = list
            self.key = call.getString("key") ?? ""
            self.lang = call.getString("lang") ?? ""
            self.voice = call.getString("voice") ?? ""
            self.rate = Float(call.getDouble("rate") ?? 1)
            self.title = call.getString("title") ?? "Narrate"
            self.mix = call.getBool("mix") ?? false
            self.volume = Float(call.getDouble("volume") ?? 1)
            self.subtitle = call.getString("subtitle") ?? ""
            self.index = max(0, min(call.getInt("start") ?? 0, list.count - 1))
            self.setUpCommands()
            self.startSession()
            self.queue(from: self.index)
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.pauseNow(); call.resolve() }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.resumeNow(); call.resolve() }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.finish("stopped"); call.resolve() }
    }

    @objc func seek(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.move(to: call.getInt("index") ?? 0); call.resolve() }
    }

    @objc func skip(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.move(to: self.index + (call.getInt("by") ?? 1)); call.resolve() }
    }

    @objc func rate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.rate = Float(call.getDouble("rate") ?? 1)
            if self.state == "playing" { self.queue(from: self.index) }
            call.resolve()
        }
    }

    @objc func volume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.volume = Float(call.getDouble("volume") ?? 1)
            if self.state == "playing" { self.queue(from: self.index) }
            call.resolve()
        }
    }

    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["key": self.key, "index": self.index, "state": self.state]) }
    }

    @objc func keepScreen(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
            call.resolve()
        }
    }

    @objc func sleep(_ call: CAPPluginCall) {
        let seconds = max(0, call.getInt("seconds") ?? 0)
        DispatchQueue.main.async {
            self.setSleep(seconds > 0 ? Date().timeIntervalSince1970 * 1000 + Double(seconds) * 1000 : 0)
            call.resolve()
        }
    }

    @objc func queue(_ call: CAPPluginCall) {
        let list = (call.getArray("items") ?? []).compactMap { $0 as? String }
        var job: [String: Any]?
        if !list.isEmpty {
            job = ["items": list, "start": call.getInt("start") ?? 0, "lang": call.getString("lang") ?? "",
                   "voice": call.getString("voice") ?? "", "title": call.getString("title") ?? "Narrate",
                   "subtitle": call.getString("subtitle") ?? "", "key": call.getString("key") ?? ""]
        }
        let after = call.getString("after") ?? ""
        DispatchQueue.main.async {
            self.next = job
            self.nextAfter = job == nil ? "" : after
            call.resolve()
        }
    }

    @objc func personalVoice(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.resolve(["state": "unsupported"])
            return
        }
        AVSpeechSynthesizer.requestPersonalVoiceAuthorization { status in
            let state: String
            switch status {
            case .authorized: state = "authorized"
            case .denied: state = "denied"
            case .unsupported: state = "unsupported"
            default: state = "unknown"
            }
            call.resolve(["state": state])
        }
    }

    private func setSleep(_ at: Double) {
        sleeper?.cancel()
        sleeper = nil
        sleepAt = at
        if at > 0 {
            let work = DispatchWorkItem { [weak self] in self?.sleepNow() }
            sleeper = work
            DispatchQueue.main.asyncAfter(deadline: .now() + max(0, (at - Date().timeIntervalSince1970 * 1000) / 1000), execute: work)
        }
        notifyListeners("sleep", data: ["at": at])
    }

    private func sleepNow() {
        setSleep(0)
        pauseNow()
    }

    private func sleepDue() -> Bool {
        sleepAt > 0 && Date().timeIntervalSince1970 * 1000 >= sleepAt
    }

    // The queued clip, read on from where the app said, at this speed and
    // volume.
    private func goOn() -> Bool {
        guard let job = next, nextAfter == key, let list = job["items"] as? [String], !list.isEmpty else { return false }
        next = nil
        nextAfter = ""
        items = list
        key = job["key"] as? String ?? ""
        lang = job["lang"] as? String ?? ""
        voice = job["voice"] as? String ?? ""
        title = job["title"] as? String ?? "Narrate"
        subtitle = job["subtitle"] as? String ?? ""
        held = []
        queue(from: max(0, min(job["start"] as? Int ?? 0, list.count - 1)))
        return true
    }

    private func utterance(_ text: String) -> AVSpeechUtterance {
        let u = AVSpeechUtterance(string: text)
        if !voice.isEmpty, let v = AVSpeechSynthesisVoice(identifier: voice) {
            u.voice = v
        } else if !lang.isEmpty {
            u.voice = AVSpeechSynthesisVoice(language: lang)
        }
        // 1 is the app's normal speed, iOS's default rate.
        u.rate = min(AVSpeechUtteranceMaximumSpeechRate,
                     max(AVSpeechUtteranceMinimumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * rate))
        u.volume = max(0, min(1, volume))
        return u
    }

    // Everything from `from` to the end, in the synthesizer's own queue.
    private func queue(from: Int) {
        queued = [:]
        if synth.isSpeaking || synth.isPaused { synth.stopSpeaking(at: .immediate) }
        index = from
        state = "playing"
        for i in from..<items.count {
            let u = utterance(items[i])
            queued[ObjectIdentifier(u)] = i
            held.append(u)
            synth.speak(u)
        }
        report()
    }

    private func pauseNow() {
        guard state == "playing" else { return }
        synth.pauseSpeaking(at: .word)
        state = "paused"
        report()
    }

    private func resumeNow() {
        guard state == "paused", !items.isEmpty else { return }
        startSession()
        if synth.isPaused { synth.continueSpeaking(); state = "playing"; report() }
        else { queue(from: index) }
    }

    private func move(to: Int) {
        guard !items.isEmpty else { return }
        let i = max(0, min(to, items.count - 1))
        if state == "playing" { queue(from: i) }
        else {
            queued = [:]
            if synth.isSpeaking || synth.isPaused { synth.stopSpeaking(at: .immediate) }
            index = i
            report()
        }
    }

    private func finish(_ how: String) {
        if sleepAt != 0 { setSleep(0) }
        queued = [:]
        if synth.isSpeaking || synth.isPaused { synth.stopSpeaking(at: .immediate) }
        state = how
        report()
        items = []
        held = []
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
    }

    private func startSession() {
        // Plays with the silent switch on and the screen locked, as spoken audio.
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: mix ? [.mixWithOthers] : [])
        try? AVAudioSession.sharedInstance().setActive(true)
    }

    private func report() {
        notifyListeners("progress", data: ["key": key, "index": index, "state": state])
        guard state == "playing" || state == "paused" else { return }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = [
            MPMediaItemPropertyTitle: title,
            MPMediaItemPropertyArtist: subtitle,
            MPNowPlayingInfoPropertyPlaybackRate: state == "playing" ? 1.0 : 0.0
        ]
    }

    private func setUpCommands() {
        guard !commandsSet else { return }
        commandsSet = true
        let c = MPRemoteCommandCenter.shared()
        c.playCommand.addTarget { [weak self] _ in self?.resumeNow(); return .success }
        c.pauseCommand.addTarget { [weak self] _ in self?.pauseNow(); return .success }
        c.togglePlayPauseCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            if self.state == "playing" { self.pauseNow() } else { self.resumeNow() }
            return .success
        }
        c.nextTrackCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.move(to: self.index + 1)
            return .success
        }
        c.previousTrackCommand.addTarget { [weak self] _ in
            guard let self = self else { return .commandFailed }
            self.move(to: self.index - 1)
            return .success
        }
        c.stopCommand.addTarget { [weak self] _ in self?.finish("stopped"); return .success }
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didStart u: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let i = self.queued[ObjectIdentifier(u)] else { return }
            self.index = i
            if self.sleepDue() { self.sleepNow(); return }
            self.report()
        }
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let i = self.queued[ObjectIdentifier(u)] else { return }
            self.queued[ObjectIdentifier(u)] = nil
            if i == self.items.count - 1, !self.goOn() { self.finish("ended") }
        }
    }
}
