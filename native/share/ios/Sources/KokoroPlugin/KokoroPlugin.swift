import Capacitor
import Foundation

// More speech engines, Settings › Reading › Narrate › More speech engines
// (Kokoro.swift): Kokoro packs and Piper voices. The same calls as
// Android's KokoroPlugin.java:
//
//   status()          { supported, engine, use, busy, step, done, total, packs: [...], piper: [...] }
//   download({ id })  starts one, a pack or a Piper voice
//   cancel()          stops the download
//   use({ id })       the Kokoro pack Narrate speaks with
//   remove({ id })    deletes a pack or voice
//
// `engine` is the app's own bundle id: Narrate's picks keep it as the
// engine for a language, as on Android, and SpeechPlugin reads with these
// voices when it's the one picked.
@objc(KokoroPlugin)
public class KokoroPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "KokoroPlugin"
    public let jsName = "Kokoro"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "download", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "use", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private static let work = DispatchQueue(label: "waypage.kokoro.unpack", qos: .utility)
    private static var unpacking = false
    private static var failed = ""
    private static var failedPack = ""

    static var engineName: String { Bundle.main.bundleIdentifier ?? "waypage" }

    override public func load() {
        if Kokoro.supported { KokoroDownloads.shared.reconnect() }
    }

    @objc func status(_ call: CAPPluginCall) {
        guard Kokoro.supported else {
            call.resolve(["supported": false, "engine": Self.engineName])
            return
        }
        DispatchQueue.main.async {
            var step = Kokoro.step
            let busy = Kokoro.downloading()
            if !Self.unpacking {
                if step == "downloaded" { self.unpackLater(); step = "checking" }
                else if step == "failed" {
                    Self.failed = "failed"
                    Self.failedPack = busy?.id ?? ""
                    Kokoro.cancel()
                } else if step.isEmpty { step = Self.failed; Self.failed = "" }
            }
            let packs = Kokoro.packs.map { p -> [String: Any] in
                let ready = Kokoro.ready(p)
                var langs: [String] = []
                for v in p.voices {
                    let l = Kokoro.split(Kokoro.languageOf(v)).0
                    if !langs.contains(l) { langs.append(l) }
                }
                return ["id": p.id, "title": p.title, "note": p.note, "bytes": p.bytes, "ready": ready,
                        "size": ready ? Kokoro.size(p) : 0, "voices": p.voices.count, "languages": langs]
            }
            let piper = Kokoro.piperVoices.map { p -> [String: Any] in
                let ready = Kokoro.ready(p)
                return ["id": p.id, "lang": p.lang, "speaker": p.speaker, "gender": p.gender, "voice": p.voice,
                        "bytes": p.bytes, "ready": ready, "size": ready ? Kokoro.size(p) : 0]
            }
            let shownBusy = busy?.id ?? (step == "failed" || step == "bad" ? Self.failedPack : "")
            call.resolve(["supported": true, "engine": Self.engineName, "use": Kokoro.inUse()?.id ?? "",
                          "busy": shownBusy, "step": step, "done": Kokoro.done, "total": Kokoro.total,
                          "packs": packs, "piper": piper])
        }
    }

    private func unpackLater() {
        Self.unpacking = true
        Self.failedPack = Kokoro.downloading()?.id ?? ""
        Kokoro.step = "checking"
        Self.work.async {
            var result = ""
            do {
                if try !Kokoro.unpack() { result = "bad" }
            } catch {
                result = "failed"
                Kokoro.cancel()
            }
            DispatchQueue.main.async {
                Self.failed = result
                Self.unpacking = false
                Kokoro.step = ""
            }
        }
    }

    private func packOf(_ call: CAPPluginCall) -> KokoroPack? {
        guard let p = Kokoro.pack(call.getString("id") ?? "") else {
            call.reject("No such voices.")
            return nil
        }
        return p
    }

    @objc func download(_ call: CAPPluginCall) {
        guard Kokoro.supported else { call.reject("This iPhone can't run Kokoro."); return }
        guard let p = packOf(call) else { return }
        DispatchQueue.main.async {
            if Self.unpacking { call.reject("Still unpacking the last one."); return }
            Self.failed = ""
            Kokoro.start(p)
            call.resolve()
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if Self.unpacking { call.reject("Still unpacking."); return }
            Kokoro.cancel()
            call.resolve()
        }
    }

    @objc func use(_ call: CAPPluginCall) {
        guard let p = packOf(call) else { return }
        if p.piper { call.reject("No such voices."); return }
        if !Kokoro.ready(p) { call.reject("Download it first."); return }
        Kokoro.use(p)
        call.resolve()
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let p = packOf(call) else { return }
        DispatchQueue.main.async {
            if Self.unpacking { call.reject("Still unpacking."); return }
            Kokoro.remove(p)
            call.resolve()
        }
    }
}
