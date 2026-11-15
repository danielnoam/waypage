import Capacitor
import LocalAuthentication
import UIKit

// App lock on iOS: the same calls as Android's AppLockPlugin.java. The
// passcode is the app's own (src/app-lock.js); this is Face ID or Touch ID
// on top of it, and the app's picture kept out of the app switcher.
//
//   available()           { ok }: Face ID or Touch ID is set up
//   verify({ title })     { ok }: the phone's own prompt; false when
//                         cancelled, "Use passcode" pressed or locked out
//   hideRecents({ on })   a plain cover over the app while it isn't the
//                         one in front, so the app switcher shows that
//
// Face ID needs NSFaceIDUsageDescription in Info.plist (tools/ios-project.js).
@objc(AppLockPlugin)
public class AppLockPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppLockPlugin"
    public let jsName = "AppLock"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "available", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verify", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideRecents", returnType: CAPPluginReturnPromise)
    ]

    private var hiding = false
    private var cover: UIView?

    override public func load() {
        let c = NotificationCenter.default
        c.addObserver(self, selector: #selector(away), name: UIApplication.willResignActiveNotification, object: nil)
        c.addObserver(self, selector: #selector(back), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    @objc func available(_ call: CAPPluginCall) {
        var err: NSError?
        call.resolve(["ok": LAContext().canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)])
    }

    @objc func verify(_ call: CAPPluginCall) {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Use passcode"
        ctx.localizedCancelTitle = "Cancel"
        let reason = call.getString("title") ?? "Unlock Waypage"
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: reason) { ok, _ in
            call.resolve(["ok": ok])
        }
    }

    @objc func hideRecents(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        DispatchQueue.main.async {
            self.hiding = on
            if !on { self.uncover() }
            call.resolve()
        }
    }

    @objc private func away() {
        guard hiding, cover == nil, let view = bridge?.viewController?.view else { return }
        let c = UIView(frame: view.bounds)
        c.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        c.backgroundColor = UIColor { $0.userInterfaceStyle == .dark
            ? UIColor(red: 0x0F / 255, green: 0x12 / 255, blue: 0x16 / 255, alpha: 1)
            : UIColor(red: 0xF7 / 255, green: 0xF4 / 255, blue: 0xEE / 255, alpha: 1) }
        view.addSubview(c)
        cover = c
    }

    @objc private func back() {
        uncover()
    }

    private func uncover() {
        cover?.removeFromSuperview()
        cover = nil
    }
}
