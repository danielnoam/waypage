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
// event { key, index, state }.
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
        CAPPluginMethod(name: "state", returnType: CAPPluginReturnPromise)
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
    private var commandsSet = false

    override public func load() {
        synth.delegate = self
    }

    @objc func voices(_ call: CAPPluginCall) {
        let list = AVSpeechSynthesisVoice.speechVoices().map { v -> [String: Any] in
            var quality = v.quality == .enhanced ? 400 : 300
            if #available(iOS 16.0, *), v.quality == .premium { quality = 500 }
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

    @objc func state(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(["key": self.key, "index": self.index, "state": self.state]) }
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
            self.report()
        }
    }

    public func speechSynthesizer(_ s: AVSpeechSynthesizer, didFinish u: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard let i = self.queued[ObjectIdentifier(u)] else { return }
            self.queued[ObjectIdentifier(u)] = nil
            if i == self.items.count - 1 { self.finish("ended") }
        }
    }
}
