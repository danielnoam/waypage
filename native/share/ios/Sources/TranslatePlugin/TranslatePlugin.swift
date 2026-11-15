import Capacitor
import NaturalLanguage
import SwiftUI
import UIKit
#if canImport(Translation)
import Translation
#endif

// A whole clip translated on the phone with Apple's Translation framework
// (iOS 18): the same calls as Android's TranslatePlugin.java, where ML Kit
// does it. The language is downloaded once, through iOS's own sheet, then
// the words never leave the phone.
//
//   supported()                 { ok }: iOS 18 or later (iOS only)
//   translate({ text })         { done: false }: no translate app to hand
//                               words to, so the app opens the web instead
//   detect({ text })            { lang }: "" when it can't tell
//   ready({ from, to })         { state }: available, downloadable or unavailable
//   prepare({ from, to })       asks iOS to download the pair when missing
//   clip({ from, to, texts })   { texts }: each one translated
//
// A TranslationSession only comes from SwiftUI's translationTask, so a
// one-point SwiftUI view sits behind the app's WebView, and each job is run
// in its task, one at a time.
@objc(TranslatePlugin)
public class TranslatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TranslatePlugin"
    public let jsName = "Translate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "supported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "translate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "detect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ready", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clip", returnType: CAPPluginReturnPromise)
    ]

    private var runner: AnyObject?

    @objc func supported(_ call: CAPPluginCall) {
        #if canImport(Translation)
        if #available(iOS 18.0, *) { call.resolve(["ok": true]); return }
        #endif
        call.resolve(["ok": false])
    }

    @objc func translate(_ call: CAPPluginCall) {
        call.resolve(["done": false])
    }

    @objc func detect(_ call: CAPPluginCall) {
        let text = String((call.getString("text") ?? "").prefix(2000))
        let r = NLLanguageRecognizer()
        r.processString(text)
        guard let best = r.languageHypotheses(withMaximum: 1).first, best.value > 0.5, best.key != .undetermined else {
            call.resolve(["lang": ""])
            return
        }
        call.resolve(["lang": best.key.rawValue])
    }

    @objc func ready(_ call: CAPPluginCall) {
        #if canImport(Translation)
        if #available(iOS 18.0, *) {
            let from = Locale.Language(identifier: call.getString("from") ?? "")
            let to = Locale.Language(identifier: call.getString("to") ?? "")
            Task {
                let s = await LanguageAvailability().status(from: from, to: to)
                call.resolve(["state": s == .installed ? "available" : s == .supported ? "downloadable" : "unavailable"])
            }
            return
        }
        #endif
        call.resolve(["state": "unavailable"])
    }

    @objc func prepare(_ call: CAPPluginCall) {
        #if canImport(Translation)
        if #available(iOS 18.0, *) {
            run(call) { session in
                do {
                    try await session.prepareTranslation()
                    call.resolve()
                } catch {
                    call.reject("Couldn't get the language: " + error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.reject("Needs iOS 18")
    }

    @objc func clip(_ call: CAPPluginCall) {
        #if canImport(Translation)
        if #available(iOS 18.0, *) {
            let texts = call.getArray("texts", String.self) ?? []
            if texts.isEmpty { call.resolve(["texts": []]); return }
            run(call) { session in
                do {
                    let asks = texts.enumerated().map { TranslationSession.Request(sourceText: $0.element, clientIdentifier: String($0.offset)) }
                    var out = texts
                    for r in try await session.translations(from: asks) {
                        if let id = r.clientIdentifier, let i = Int(id), i < out.count { out[i] = r.targetText }
                    }
                    call.resolve(["texts": out])
                } catch {
                    call.reject("Couldn't translate: " + error.localizedDescription)
                }
            }
            return
        }
        #endif
        call.reject("Needs iOS 18")
    }

    #if canImport(Translation)
    @available(iOS 18.0, *)
    private func run(_ call: CAPPluginCall, _ job: @escaping (TranslationSession) async -> Void) {
        let from = call.getString("from") ?? ""
        let to = call.getString("to") ?? ""
        DispatchQueue.main.async {
            let r: TranslateRunner
            if let had = self.runner as? TranslateRunner { r = had } else {
                guard let vc = self.bridge?.viewController else {
                    call.reject("No window")
                    return
                }
                r = TranslateRunner(in: vc)
                self.runner = r
            }
            r.add(from: from, to: to, job: job)
        }
    }
    #endif
}

#if canImport(Translation)
@available(iOS 18.0, *)
final class TranslateBox: ObservableObject {
    @Published var config: TranslationSession.Configuration?
    var job: ((TranslationSession) async -> Void)?
}

@available(iOS 18.0, *)
struct TranslateHost: View {
    @ObservedObject var box: TranslateBox
    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .translationTask(box.config) { session in
                guard let job = box.job else { return }
                box.job = nil
                await job(session)
                await MainActor.run { TranslateRunner.done(box) }
            }
    }
}

@available(iOS 18.0, *)
final class TranslateRunner {
    private struct Job {
        let from: String
        let to: String
        let work: (TranslationSession) async -> Void
    }

    private static var all: [ObjectIdentifier: TranslateRunner] = [:]
    private let box = TranslateBox()
    private var waiting: [Job] = []
    private var busy = false

    init(in vc: UIViewController) {
        let host = UIHostingController(rootView: TranslateHost(box: box))
        host.view.frame = CGRect(x: 0, y: 0, width: 1, height: 1)
        host.view.backgroundColor = .clear
        host.view.isUserInteractionEnabled = false
        host.view.accessibilityElementsHidden = true
        vc.addChild(host)
        vc.view.insertSubview(host.view, at: 0)
        host.didMove(toParent: vc)
        TranslateRunner.all[ObjectIdentifier(box)] = self
    }

    static func done(_ box: TranslateBox) {
        guard let r = all[ObjectIdentifier(box)] else { return }
        r.busy = false
        r.next()
    }

    func add(from: String, to: String, job: @escaping (TranslationSession) async -> Void) {
        waiting.append(Job(from: from, to: to, work: job))
        next()
    }

    private func next() {
        guard !busy, !waiting.isEmpty else { return }
        busy = true
        let j = waiting.removeFirst()
        box.job = j.work
        let source = Locale.Language(identifier: j.from)
        let target = Locale.Language(identifier: j.to)
        if var c = box.config, c.source == source, c.target == target {
            c.invalidate()
            box.config = c
        } else {
            box.config = TranslationSession.Configuration(source: source, target: target)
        }
    }
}
#endif
