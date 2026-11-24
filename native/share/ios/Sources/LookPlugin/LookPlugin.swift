import Capacitor
import UIKit

// The theme's colour before the page has drawn, as Android's LookPlugin:
// the web view's own background is capacitor.config's (Paper), so a dark
// theme showed Paper from the launch screen until the page painted. The
// page hands its background here whenever the theme changes; the next
// start paints the web view with it before the page loads (plugins load
// before the web view's URL does).
//
//   set({ bg: "#0F1216", dark: true })
@objc(LookPlugin)
public class LookPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LookPlugin"
    public let jsName = "Look"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    private static let key = "waypage.look.bg"

    override public func load() {
        guard let hex = UserDefaults.standard.string(forKey: Self.key), let c = Self.colour(hex) else { return }
        DispatchQueue.main.async { self.apply(c) }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let hex = call.getString("bg"), let c = Self.colour(hex) else { call.reject("Not a colour"); return }
        UserDefaults.standard.set(hex, forKey: Self.key)
        DispatchQueue.main.async {
            self.apply(c)
            call.resolve()
        }
    }

    private func apply(_ c: UIColor) {
        bridge?.viewController?.view.backgroundColor = c
        guard let web = bridge?.webView else { return }
        web.isOpaque = false
        web.backgroundColor = c
        web.scrollView.backgroundColor = c
    }

    static func colour(_ hex: String) -> UIColor? {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6 || s.count == 8, let v = UInt64(s, radix: 16) else { return nil }
        let a = s.count == 8 ? CGFloat(v & 0xff) / 255 : 1
        let rgb = s.count == 8 ? v >> 8 : v
        return UIColor(red: CGFloat((rgb >> 16) & 0xff) / 255, green: CGFloat((rgb >> 8) & 0xff) / 255, blue: CGFloat(rgb & 0xff) / 255, alpha: a)
    }
}
