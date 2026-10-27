import Capacitor
import UIKit
import UniformTypeIdentifiers

// Files of your own, read where they are, and a folder you pick (1.6.0): the
// same calls as Android's FilesPlugin.java, so src/platform.js, files.js and
// store.js don't know which phone they're on. iOS's way to a file the app may
// still read tomorrow is the document picker plus a bookmark of what it
// picked, kept as the `ref`:
//
//   bm:<bookmark, base64url>              a picked file or folder
//   bm:<folder's bookmark>/<path in it>   a file in a picked folder (folderScan)
//
// Reading a bookmarked item needs startAccessingSecurityScopedResource, which
// is held until release(), so the WebView can also load the file straight
// from disk: info() and serve() hand back its `path` for convertFileSrc.
//
//   pick({ mimes })              { uri, name, size, mime } or { }
//   pickFolder({})               { uri, name } or { }
//   info({ uri })                { ok, name, size, path }
//   read({ uri, offset, length })   { data } as base64
//   release({ uri })             stops reading it
//   serve({ tree })              { path } of the folder, readable from now on
//   folderWrite / folderRead / folderStat / folderList / folderDelete /
//   folderMoveIn / folderScan     as on Android
@objc(FilesPlugin)
public class FilesPlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "FilesPlugin"
    public let jsName = "Files"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "serve", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pick", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pickFolder", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "release", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderWrite", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderMoveIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderRead", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderStat", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderDelete", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "folderScan", returnType: CAPPluginReturnPromise)
    ]

    private var pending: CAPPluginCall?
    private var pickingFolder = false
    private let work = DispatchQueue(label: "waypage.files", qos: .userInitiated, attributes: .concurrent)

    // ---- Picking ----

    @objc func pick(_ call: CAPPluginCall) {
        let mimes = call.getArray("mimes", String.self) ?? []
        var types = mimes.compactMap { UTType(mimeType: $0) }
        for ext in ["epub", "mobi", "azw", "azw3", "prc", "fb2", "md", "markdown", "cbz", "pdf", "txt", "html"] {
            if let t = UTType(filenameExtension: ext), !types.contains(t) { types.append(t) }
        }
        present(call, UIDocumentPickerViewController(forOpeningContentTypes: types.isEmpty ? [.item] : types, asCopy: false), folder: false)
    }

    @objc func pickFolder(_ call: CAPPluginCall) {
        present(call, UIDocumentPickerViewController(forOpeningContentTypes: [.folder], asCopy: false), folder: true)
    }

    private func present(_ call: CAPPluginCall, _ picker: UIDocumentPickerViewController, folder: Bool) {
        DispatchQueue.main.async {
            self.pending?.resolve([:])
            self.pending = call
            self.pickingFolder = folder
            picker.delegate = self
            picker.allowsMultipleSelection = false
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let call = pending else { return }
        pending = nil
        guard let url = urls.first, let ref = FilesPlugin.bookmark(url) else {
            call.resolve([:])
            return
        }
        if pickingFolder {
            call.resolve(["uri": ref, "name": url.lastPathComponent])
            return
        }
        var out = FilesPlugin.describe(url)
        out["uri"] = ref
        if let t = UTType(filenameExtension: url.pathExtension), let m = t.preferredMIMEType { out["mime"] = m }
        call.resolve(out)
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pending?.resolve([:])
        pending = nil
    }

    // ---- Bookmarks ----

    // Roots resolved this run, with access started; held until released.
    private static var open: [String: URL] = [:]
    private static let lock = NSLock()

    static func bookmark(_ url: URL) -> String? {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard let data = try? url.bookmarkData(options: [], includingResourceValuesForKeys: nil, relativeTo: nil) else { return nil }
        let b64 = data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return "bm:" + b64
    }

    // "bm:<root>/<rel>" into the root's ref and the path inside it.
    private static func split(_ ref: String) -> (String, String) {
        guard ref.hasPrefix("bm:") else { return (ref, "") }
        let body = ref.dropFirst(3)
        guard let slash = body.firstIndex(of: "/") else { return (ref, "") }
        return ("bm:" + body[..<slash], String(body[body.index(after: slash)...]))
    }

    // The root a ref names, with access started. nil when it's gone.
    static func root(_ ref: String) -> URL? {
        lock.lock()
        defer { lock.unlock() }
        if let u = open[ref] { return u }
        var b64 = String(ref.dropFirst(3))
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        while b64.count % 4 != 0 { b64 += "=" }
        guard ref.hasPrefix("bm:"), let data = Data(base64Encoded: b64) else { return nil }
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { return nil }
        _ = url.startAccessingSecurityScopedResource()
        open[ref] = url
        return url
    }

    // The file or folder a ref names.
    static func resolve(_ ref: String) -> URL? {
        if ref.hasPrefix("file://") { return URL(string: ref) }
        let (top, rel) = split(ref)
        guard let base = root(top) else { return nil }
        return rel.isEmpty ? base : child(base, rel)
    }

    static func child(_ base: URL, _ rel: String) -> URL {
        let parts = rel.split(separator: "/").map { String($0).removingPercentEncoding ?? String($0) }
        return parts.reduce(base) { $0.appendingPathComponent($1) }
    }

    static func describe(_ url: URL) -> [String: Any] {
        let v = try? url.resourceValues(forKeys: [.fileSizeKey, .nameKey])
        return ["name": v?.name ?? url.lastPathComponent, "size": v?.fileSize ?? 0]
    }

    // A file in iCloud Drive may not be on the phone yet: a coordinated read
    // brings it down first.
    private static func coordinated(_ url: URL) -> URL {
        var out = url
        var err: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [.withoutChanges], error: &err) { out = $0 }
        return out
    }

    private func ref(_ call: CAPPluginCall, _ key: String = "uri") -> String? {
        guard let r = call.getString(key), !r.isEmpty else {
            call.reject(key == "tree" ? "No folder" : "No file")
            return nil
        }
        return r
    }

    // ---- One file ----

    @objc func info(_ call: CAPPluginCall) {
        guard let r = ref(call) else { return }
        work.async {
            guard let url = FilesPlugin.resolve(r) else {
                call.resolve(["ok": false, "name": "", "size": 0])
                return
            }
            let at = FilesPlugin.coordinated(url)
            var out = FilesPlugin.describe(at)
            out["ok"] = FileManager.default.isReadableFile(atPath: at.path)
            out["path"] = at.path
            call.resolve(out)
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let r = ref(call) else { return }
        let offset = UInt64(max(0, call.getDouble("offset") ?? 0))
        let length = call.getInt("length") ?? 0
        guard length > 0, length <= 8 << 20 else {
            call.reject("Ask for between 1 byte and 8 MB")
            return
        }
        work.async {
            guard let url = FilesPlugin.resolve(r), let h = try? FileHandle(forReadingFrom: url) else {
                call.reject("Couldn't read the file")
                return
            }
            defer { try? h.close() }
            do {
                try h.seek(toOffset: offset)
                let data = try h.read(upToCount: length) ?? Data()
                call.resolve(["data": data.base64EncodedString()])
            } catch {
                call.reject("Couldn't read the file")
            }
        }
    }

    @objc func release(_ call: CAPPluginCall) {
        guard let r = ref(call) else { return }
        let (top, rel) = FilesPlugin.split(r)
        if rel.isEmpty {
            FilesPlugin.lock.lock()
            if let u = FilesPlugin.open.removeValue(forKey: top) { u.stopAccessingSecurityScopedResource() }
            FilesPlugin.lock.unlock()
        }
        call.resolve()
    }

    // ---- A folder that's where the library lives (store.js) ----

    @objc func serve(_ call: CAPPluginCall) {
        guard let t = call.getString("tree"), !t.isEmpty else {
            call.resolve([:])
            return
        }
        guard let url = FilesPlugin.root(t) else {
            call.resolve([:])
            return
        }
        call.resolve(["path": url.path])
    }

    private func folder(_ call: CAPPluginCall) -> (URL, String)? {
        guard let t = ref(call, "tree") else { return nil }
        guard let path = call.getString("path") else {
            call.reject("No path")
            return nil
        }
        guard let base = FilesPlugin.root(t) else {
            call.reject("Can't reach the folder")
            return nil
        }
        return (base, path)
    }

    private func makeParent(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    }

    @objc func folderWrite(_ call: CAPPluginCall) {
        guard let f = folder(call) else { return }
        let (base, path) = f
        let text = call.getString("data") ?? ""
        let utf8 = call.getString("encoding") == "utf8"
        work.async {
            let url = FilesPlugin.child(base, path)
            guard let data = utf8 ? text.data(using: .utf8) : Data(base64Encoded: text, options: .ignoreUnknownCharacters) else {
                call.reject("Couldn't write " + path)
                return
            }
            do {
                try self.makeParent(url)
                try data.write(to: url, options: .atomic)
                call.resolve()
            } catch {
                call.reject("Couldn't write " + path)
            }
        }
    }

    @objc func folderMoveIn(_ call: CAPPluginCall) {
        guard let f = folder(call) else { return }
        let (base, path) = f
        guard let from = call.getString("from") else {
            call.reject("No file")
            return
        }
        let src = URL(string: from).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: from)
        work.async {
            let url = FilesPlugin.child(base, path)
            let fm = FileManager.default
            do {
                try self.makeParent(url)
                let size = (try? src.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if fm.fileExists(atPath: url.path) { try fm.removeItem(at: url) }
                // A move across volumes (a folder on a USB drive) is a copy.
                do { try fm.moveItem(at: src, to: url) } catch {
                    try fm.copyItem(at: src, to: url)
                    try? fm.removeItem(at: src)
                }
                call.resolve(["size": size])
            } catch {
                call.reject("Couldn't keep " + path)
            }
        }
    }

    @objc func folderRead(_ call: CAPPluginCall) {
        guard let f = folder(call) else { return }
        let (base, path) = f
        work.async {
            let url = FilesPlugin.coordinated(FilesPlugin.child(base, path))
            guard let data = try? Data(contentsOf: url) else {
                call.reject("Couldn't read " + path)
                return
            }
            call.resolve(["data": String(decoding: data, as: UTF8.self)])
        }
    }

    @objc func folderStat(_ call: CAPPluginCall) {
        guard let f = folder(call) else { return }
        let (base, path) = f
        let url = FilesPlugin.child(base, path)
        let exists = FileManager.default.fileExists(atPath: url.path)
        call.resolve(["exists": exists, "size": exists ? (FilesPlugin.describe(url)["size"] as? Int ?? 0) : 0])
    }

    @objc func folderList(_ call: CAPPluginCall) {
        guard let t = ref(call, "tree") else { return }
        guard let base = FilesPlugin.root(t) else {
            call.resolve(["files": []])
            return
        }
        let path = call.getString("path") ?? ""
        let dir = path.isEmpty ? base : FilesPlugin.child(base, path)
        let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey]
        let items = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: keys)) ?? []
        let files = items.map { u -> [String: Any] in
            let v = try? u.resourceValues(forKeys: Set(keys))
            return ["name": u.lastPathComponent, "type": v?.isDirectory == true ? "directory" : "file", "size": v?.fileSize ?? 0]
        }
        call.resolve(["files": files])
    }

    @objc func folderDelete(_ call: CAPPluginCall) {
        guard let f = folder(call) else { return }
        let (base, path) = f
        try? FileManager.default.removeItem(at: FilesPlugin.child(base, path))
        call.resolve()
    }

    // ---- A watched folder (app.js): read, never written ----

    // Hidden files and folders are left out, and it stops at 8 folders deep
    // and 5000 files, as on Android.
    @objc func folderScan(_ call: CAPPluginCall) {
        guard let t = ref(call, "tree") else { return }
        work.async {
            guard let base = FilesPlugin.root(t) else {
                call.resolve(["ok": false, "files": []])
                return
            }
            var ok = true
            var files: [[String: Any]] = []
            func walk(_ dir: URL, _ at: String, _ depth: Int) {
                let keys: [URLResourceKey] = [.isDirectoryKey, .fileSizeKey]
                guard let items = try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles]) else {
                    if depth == 0 { ok = false }
                    return
                }
                for u in items.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
                    if files.count >= 5000 { return }
                    let name = u.lastPathComponent
                    // An iCloud file not downloaded yet shows as ".name.icloud".
                    let path = at.isEmpty ? name : at + "/" + name
                    let v = try? u.resourceValues(forKeys: Set(keys))
                    if v?.isDirectory == true {
                        if depth < 8 { walk(u, path, depth + 1) }
                        continue
                    }
                    let enc = path.split(separator: "/").map { String($0).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? String($0) }.joined(separator: "/")
                    files.append(["uri": t + "/" + enc, "path": path, "name": name, "size": v?.fileSize ?? 0])
                }
            }
            walk(base, "", 0)
            call.resolve(["ok": ok, "files": files])
        }
    }
}
