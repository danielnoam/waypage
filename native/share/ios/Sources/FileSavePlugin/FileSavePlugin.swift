import Capacitor
import UIKit

// An exported file saved where the person picks, in the Files app (src/app.js,
// 0.25.2). The same call as Android's FileSavePlugin.java:
// save({ uri, name, mime }) resolves to { saved }, false when put away.
// `uri` is a file the app already wrote to its cache.
//
// save({ uri, name, mime, keep: true, near }) (a deck turned into a PDF):
// the file is moved, not copied, so the picker hands back a place the app
// may keep reading, and it resolves { saved, uri } with uri a FilesPlugin
// bookmark ref. `near` is a ref whose folder the picker opens in.
@objc(FileSavePlugin)
public class FileSavePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "FileSavePlugin"
    public let jsName = "FileSave"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "save", returnType: CAPPluginReturnPromise)
    ]

    private var pending: CAPPluginCall?
    private var keep = false

    @objc func save(_ call: CAPPluginCall) {
        guard let raw = call.getString("uri") else {
            call.reject("No file to save")
            return
        }
        let url = URL(string: raw).flatMap { $0.isFileURL ? $0 : nil }
            ?? URL(fileURLWithPath: raw.replacingOccurrences(of: "file://", with: ""))
        let keep = call.getBool("keep") ?? false
        let near = call.getString("near") ?? ""
        DispatchQueue.main.async {
            self.pending?.resolve(["saved": false])
            self.pending = call
            self.keep = keep
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: !keep)
            if !near.isEmpty, let at = FilesPlugin.resolve(near) {
                var dir = at
                var isDir: ObjCBool = false
                if !(FileManager.default.fileExists(atPath: at.path, isDirectory: &isDir) && isDir.boolValue) { dir = at.deletingLastPathComponent() }
                picker.directoryURL = dir
            }
            picker.delegate = self
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        var out: [String: Any] = ["saved": true]
        if keep, let url = urls.first, let ref = FilesPlugin.bookmark(url) { out["uri"] = ref }
        pending?.resolve(out)
        pending = nil
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pending?.resolve(["saved": false])
        pending = nil
    }
}
