package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Files of your own, read where they are (src/files.js, 0.32.0). Android's
 * own picker is the only way to a file the app may still read tomorrow:
 * what the WebView's <input type="file"> hands over is readable once.
 *
 *   pick({ mimes })         the picker; { uri, name, size, mime } or { }
 *   pickFolder({ initial })  the folder picker, opening at `initial` under
 *                           the phone's storage when given ("Documents/Waypage");
 *                           { uri, name } or { }
 *   info({ uri })           { ok, name, size }; ok false once it's gone
 *   read({ uri, offset, length })   { data } as base64, for that stretch
 *   release({ uri })        gives the lasting permission back
 *
 * The permission is taken as persistable, so it survives a restart. Android
 * keeps about 128 of them per app, so a file Waypage forgets is released.
 *
 * A picked folder can also be where the library lives (0.33.0, store.js).
 * Paths are relative to the folder, "/"-separated; folders on the way are
 * made as needed:
 *
 *   where()                         { sdk }
 *   serve({ tree })                 the WebView reads the folder at
 *                                   /_waypage_folder_/<path>; tree null stops
 *   folderWrite({ tree, path, data, encoding })   utf8, or base64 bytes
 *   folderRead({ tree, path })      { data } as utf8
 *   folderStat({ tree, path })      { exists, size }
 *   folderList({ tree, path })      { files: [{ name, type, size }] }
 *   folderDelete({ tree, path })    a file, or a folder and all in it
 *   folderMoveIn({ tree, path, from })  a file:// in the app moved in
 *   copyFiles({ from, to, paths })  copies each path from one library to
 *                                   another off the WebView's thread (1.19.0);
 *                                   from and to are { tree } or { dir }, an
 *                                   absolute path; "copied" { done, total }
 *                                   as it goes; resolves { done }
 *
 * A watched folder (1.1.0, app.js) is read, never written:
 *
 *   folderScan({ tree })    { ok, files: [{ uri, path, name, size }] }, every
 *                           file in it and its folders; ok false when the
 *                           folder itself can't be read (gone, or the
 *                           permission was taken back)
 *
 *   reveal({ uri, tree })   opens the folder a file sits in, in the phone's
 *                           Files app (1.27.2); tree is its watched folder.
 *                           { opened, where }, where the folder's path
 */
@CapacitorPlugin(name = "Files")
public class FilesPlugin extends Plugin {

    static final String ROUTE = "/_waypage_folder_/";
    private static volatile Uri served;
    // Paths already found, so a page with fifty pictures doesn't walk the
    // folder fifty times. Cleared for whatever is deleted.
    private static final Map<String, Uri> found = new ConcurrentHashMap<>();

    @Override
    public void load() {
        bridge.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                Uri tree = served;
                if (tree != null && path != null && path.startsWith(ROUTE)) return fromFolder(tree, path.substring(ROUTE.length()));
                return super.shouldInterceptRequest(view, request);
            }
        });
    }

    private WebResourceResponse fromFolder(Uri tree, String rel) {
        Map<String, String> headers = new HashMap<>();
        headers.put("Cache-Control", "no-cache");
        try {
            Uri doc = find(tree, rel, false);
            if (doc == null) throw new java.io.FileNotFoundException(rel);
            InputStream in = getContext().getContentResolver().openInputStream(doc);
            String ext = MimeTypeMap.getFileExtensionFromUrl(rel.replace(" ", "_")).toLowerCase();
            String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
            if ("html".equals(ext)) mime = "text/html";
            if ("json".equals(ext)) mime = "application/json";
            return new WebResourceResponse(mime == null ? "application/octet-stream" : mime, null, 200, "OK", headers, in);
        } catch (Exception e) {
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", headers,
                new java.io.ByteArrayInputStream(new byte[0]));
        }
    }

    @PluginMethod
    public void where(PluginCall call) {
        JSObject out = new JSObject();
        out.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(out);
    }

    @PluginMethod
    public void serve(PluginCall call) {
        String t = call.getString("tree");
        served = t == null || t.isEmpty() ? null : Uri.parse(t);
        found.clear();
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void folderWrite(PluginCall call) {
        Uri tree = treeOf(call);
        String path = call.getString("path");
        String data = call.getString("data", "");
        boolean utf8 = "utf8".equals(call.getString("encoding"));
        if (tree == null || path == null) return;
        try {
            byte[] bytes = utf8 ? data.getBytes(StandardCharsets.UTF_8) : Base64.decode(data, Base64.DEFAULT);
            Uri doc = find(tree, path, true);
            try (OutputStream out = getContext().getContentResolver().openOutputStream(doc, "wt")) {
                if (out == null) throw new java.io.IOException("can't write");
                out.write(bytes);
            }
            call.resolve(new JSObject());
        } catch (Exception e) {
            call.reject("Couldn't write " + path, e);
        }
    }

    @PluginMethod
    public void folderMoveIn(PluginCall call) {
        Uri tree = treeOf(call);
        String path = call.getString("path");
        String from = call.getString("from");
        if (tree == null || path == null || from == null) return;
        File src = new File(Uri.parse(from).getPath() == null ? from : Uri.parse(from).getPath());
        try {
            Uri doc = find(tree, path, true);
            try (InputStream in = new FileInputStream(src);
                 OutputStream out = getContext().getContentResolver().openOutputStream(doc, "wt")) {
                if (out == null) throw new java.io.IOException("can't write");
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            JSObject res = new JSObject();
            res.put("size", src.length());
            src.delete();
            call.resolve(res);
        } catch (Exception e) {
            call.reject("Couldn't keep " + path, e);
        }
    }

    @PluginMethod
    public void copyFiles(PluginCall call) {
        JSObject from = call.getObject("from");
        JSObject to = call.getObject("to");
        JSArray paths = call.getArray("paths");
        if (from == null || to == null || paths == null) { call.reject("Nothing to copy"); return; }
        new Thread(() -> {
            int total = paths.length();
            int done = 0;
            String path = "";
            byte[] buf = new byte[1 << 16];
            try {
                for (int i = 0; i < total; i++) {
                    path = paths.getString(i);
                    try (InputStream in = openIn(from, path); OutputStream out = openOut(to, path)) {
                        int n;
                        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    }
                    done++;
                    if (done % 20 == 0 || done == total) {
                        JSObject ev = new JSObject();
                        ev.put("done", done);
                        ev.put("total", total);
                        notifyListeners("copied", ev);
                    }
                }
                JSObject res = new JSObject();
                res.put("done", done);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("Couldn't copy " + path + (e.getMessage() == null ? "" : ": " + e.getMessage()), e);
            }
        }).start();
    }

    private InputStream openIn(JSObject end, String path) throws java.io.IOException {
        String tree = end.getString("tree");
        if (tree == null) return new FileInputStream(new File(end.getString("dir"), path));
        Uri doc = find(Uri.parse(tree), path, false);
        InputStream in = doc == null ? null : getContext().getContentResolver().openInputStream(doc);
        if (in == null) throw new java.io.FileNotFoundException(path);
        return in;
    }

    private OutputStream openOut(JSObject end, String path) throws java.io.IOException {
        String tree = end.getString("tree");
        if (tree == null) {
            File f = new File(end.getString("dir"), path);
            File dir = f.getParentFile();
            if (dir != null && !dir.isDirectory() && !dir.mkdirs()) throw new java.io.IOException("can't make " + dir);
            return new java.io.FileOutputStream(f);
        }
        Uri doc = find(Uri.parse(tree), path, true);
        OutputStream out = doc == null ? null : getContext().getContentResolver().openOutputStream(doc, "wt");
        if (out == null) throw new java.io.IOException("can't write " + path);
        return out;
    }

    @PluginMethod
    public void folderRead(PluginCall call) {
        Uri tree = treeOf(call);
        String path = call.getString("path");
        if (tree == null || path == null) return;
        try {
            Uri doc = find(tree, path, false);
            if (doc == null) throw new java.io.FileNotFoundException(path);
            try (InputStream in = getContext().getContentResolver().openInputStream(doc)) {
                if (in == null) throw new java.io.IOException("can't read");
                java.io.ByteArrayOutputStream all = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[1 << 16];
                int n;
                while ((n = in.read(buf)) > 0) all.write(buf, 0, n);
                JSObject out = new JSObject();
                out.put("data", new String(all.toByteArray(), StandardCharsets.UTF_8));
                call.resolve(out);
            }
        } catch (Exception e) {
            call.reject("Couldn't read " + path, e);
        }
    }

    @PluginMethod
    public void folderStat(PluginCall call) {
        Uri tree = treeOf(call);
        String path = call.getString("path");
        if (tree == null || path == null) return;
        JSObject out = new JSObject();
        Uri doc = find(tree, path, false);
        out.put("exists", doc != null);
        out.put("size", doc == null ? 0 : sizeOf(doc));
        call.resolve(out);
    }

    @PluginMethod
    public void folderList(PluginCall call) {
        Uri tree = treeOf(call);
        String path = call.getString("path", "");
        if (tree == null) return;
        Uri dir = path.isEmpty() ? root(tree) : find(tree, path, false);
        JSArray files = new JSArray();
        if (dir != null) {
            for (String[] c : children(tree, dir)) {
                JSObject f = new JSObject();
                f.put("name", c[1]);
                f.put("type", DocumentsContract.Document.MIME_TYPE_DIR.equals(c[2]) ? "directory" : "file");
                f.put("size", c[3] == null ? 0 : Long.parseLong(c[3]));
                files.put(f);
            }
        }
        JSObject out = new JSObject();
        out.put("files", files);
        call.resolve(out);
    }

    @PluginMethod
    public void folderDelete(PluginCall call) {
        Uri tree = treeOf(call);
        String path = call.getString("path");
        if (tree == null || path == null) return;
        Uri doc = find(tree, path, false);
        try {
            if (doc != null) DocumentsContract.deleteDocument(getContext().getContentResolver(), doc);
        } catch (Exception e) {
            // Gone already, or the provider won't; either way it's not there for us.
        }
        String key = tree + "|" + path;
        for (String k : found.keySet()) if (k.equals(key) || k.startsWith(key + "/")) found.remove(k);
        call.resolve(new JSObject());
    }

    @PluginMethod
    public void folderScan(PluginCall call) {
        Uri tree = treeOf(call);
        if (tree == null) return;
        new Thread(() -> {
            JSObject out = new JSObject();
            JSArray files = new JSArray();
            boolean ok;
            try {
                Uri top = root(tree);
                ok = readable(tree, top);
                if (ok) walk(tree, top, "", files, 0);
            } catch (Exception e) {
                ok = false;
            }
            out.put("ok", ok);
            out.put("files", files);
            if (ok) out.put("name", folderName(tree));
            call.resolve(out);
        }).start();
    }

    // Whether a folder answers at all: an empty one does, a gone one doesn't.
    private boolean readable(Uri tree, Uri dir) {
        Uri list = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(dir));
        try (Cursor c = getContext().getContentResolver().query(list, new String[] { DocumentsContract.Document.COLUMN_DOCUMENT_ID }, null, null, null)) {
            return c != null;
        } catch (Exception e) {
            return false;
        }
    }

    // Hidden files and folders are left out, and it stops at 8 folders deep
    // and 5000 files, so a folder picked by mistake (the whole phone) ends.
    private void walk(Uri tree, Uri dir, String at, JSArray out, int depth) {
        for (String[] c : children(tree, dir)) {
            if (out.length() >= 5000) return;
            if (c[1] == null || c[1].startsWith(".")) continue;
            String path = at.isEmpty() ? c[1] : at + "/" + c[1];
            Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, c[0]);
            if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c[2])) {
                if (depth < 8) walk(tree, doc, path, out, depth + 1);
                continue;
            }
            JSObject f = new JSObject();
            f.put("uri", doc.toString());
            f.put("path", path);
            f.put("name", c[1]);
            f.put("size", c[3] == null ? 0 : Long.parseLong(c[3]));
            out.put(f);
        }
    }

    private Uri treeOf(PluginCall call) {
        String t = call.getString("tree");
        if (t == null) { call.reject("No folder"); return null; }
        return Uri.parse(t);
    }

    private Uri root(Uri tree) {
        return DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
    }

    // { id, name, mime, size } of each thing in a folder.
    private List<String[]> children(Uri tree, Uri dir) {
        List<String[]> out = new ArrayList<>();
        Uri list = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(dir));
        try (Cursor c = getContext().getContentResolver().query(list, new String[] {
            DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
            DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE }, null, null, null)) {
            while (c != null && c.moveToNext()) out.add(new String[] { c.getString(0), c.getString(1), c.getString(2), c.isNull(3) ? null : c.getString(3) });
        } catch (Exception e) {
            // An empty or unreadable folder lists as nothing.
        }
        return out;
    }

    private long sizeOf(Uri doc) {
        try (Cursor c = getContext().getContentResolver().query(doc, new String[] { DocumentsContract.Document.COLUMN_SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception e) {
            return 0;
        }
        return 0;
    }

    // The document at `rel` in the folder, step by step from the top; with
    // `make`, the folders on the way and the file itself are made. null when
    // it isn't there.
    private Uri find(Uri tree, String rel, boolean make) {
        String clean = rel.replaceAll("^/+|/+$", "");
        String key = tree + "|" + clean;
        Uri known = found.get(key);
        if (known != null) return known;
        ContentResolver cr = getContext().getContentResolver();
        String[] parts = clean.split("/");
        Uri at = root(tree);
        String walked = "";
        for (int i = 0; i < parts.length; i++) {
            String name = Uri.decode(parts[i]);
            walked = walked.isEmpty() ? parts[i] : walked + "/" + parts[i];
            Uri next = found.get(tree + "|" + walked);
            if (next == null) {
                for (String[] c : children(tree, at)) {
                    if (name.equals(c[1])) { next = DocumentsContract.buildDocumentUriUsingTree(tree, c[0]); break; }
                }
            }
            if (next == null) {
                if (!make) return null;
                boolean last = i == parts.length - 1;
                try {
                    next = DocumentsContract.createDocument(cr, at, last ? "application/octet-stream" : DocumentsContract.Document.MIME_TYPE_DIR, name);
                } catch (Exception e) {
                    next = null;
                }
                if (next == null) return null;
            }
            found.put(tree + "|" + walked, next);
            at = next;
        }
        return at;
    }

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        JSArray mimes = call.getArray("mimes");
        List<String> list = new ArrayList<>();
        if (mimes != null) {
            try { for (Object m : mimes.toList()) if (m != null) list.add(String.valueOf(m)); } catch (Exception e) { /* all of them */ }
        }
        intent.setType(list.size() == 1 ? list.get(0) : "*/*");
        if (list.size() > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, list.toArray(new String[0]));
        startActivityForResult(call, intent, "picked");
    }

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        String initial = call.getString("initial");
        if (initial != null && !initial.isEmpty() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.putExtra(DocumentsContract.EXTRA_INITIAL_URI,
                DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:" + initial));
        }
        startActivityForResult(call, intent, "pickedFolder");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        Uri uri = taken(result, false);
        if (call == null) return;
        if (uri == null) { call.resolve(new JSObject()); return; }
        JSObject out = describe(uri);
        out.put("uri", uri.toString());
        String mime = getContext().getContentResolver().getType(uri);
        if (mime != null) out.put("mime", mime);
        call.resolve(out);
    }

    @ActivityCallback
    private void pickedFolder(PluginCall call, ActivityResult result) {
        Uri uri = taken(result, true);
        if (call == null) return;
        if (uri == null) { call.resolve(new JSObject()); return; }
        new Thread(() -> {
            JSObject out = new JSObject();
            out.put("uri", uri.toString());
            out.put("name", folderName(uri));
            call.resolve(out);
        }).start();
    }

    // The folder's own name from its provider (1.27.1). The address's last
    // part is a path on the phone, but an id for a Google Drive folder.
    private String folderName(Uri tree) {
        try (Cursor c = getContext().getContentResolver().query(root(tree),
            new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0) && !c.getString(0).trim().isEmpty()) return c.getString(0).trim();
        } catch (Exception e) {
            // Falls back to the address below.
        }
        String last = tree.getLastPathSegment();
        return last == null ? "Folder" : last.replaceFirst("^.*:", "");
    }

    @PluginMethod
    public void reveal(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        String treeText = call.getString("tree");
        new Thread(() -> {
            JSObject out = new JSObject();
            try {
                Uri tree = treeText == null ? null : Uri.parse(treeText);
                String authority = uri.getAuthority();
                String docId = DocumentsContract.getDocumentId(uri);
                List<String> ids = pathTo(tree, uri, docId);
                String parent = ids.size() > 1 ? ids.get(ids.size() - 2) : null;
                if (parent == null && docId.contains("/")) parent = docId.substring(0, docId.lastIndexOf('/'));
                if (parent == null && tree != null) parent = DocumentsContract.getTreeDocumentId(tree);
                List<String> names = new ArrayList<>();
                if (ids.size() > 1) {
                    for (String id : ids.subList(0, ids.size() - 1)) names.add(nameOf(tree, id));
                } else if (parent != null) {
                    names.add(parent.replaceFirst("^[^:]*:", ""));
                }
                out.put("where", android.text.TextUtils.join("/", names).replaceAll("^/+|/+$", ""));
                if (parent == null) {
                    out.put("opened", false);
                    call.resolve(out);
                    return;
                }
                Uri folder = DocumentsContract.buildDocumentUri(authority, parent);
                out.put("opened", show(folder));
            } catch (Exception e) {
                out.put("opened", false);
            }
            call.resolve(out);
        }).start();
    }

    // The ids from the watched folder (or the provider's top) down to the
    // file, when the provider can say; just the file's own otherwise.
    private List<String> pathTo(Uri tree, Uri uri, String docId) {
        List<String> ids = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Uri from = tree != null ? DocumentsContract.buildDocumentUriUsingTree(tree, docId) : uri;
                DocumentsContract.Path path = DocumentsContract.findDocumentPath(getContext().getContentResolver(), from);
                if (path != null && path.getPath() != null) ids.addAll(path.getPath());
            } catch (Exception e) {
                // Not every provider answers.
            }
        }
        if (ids.isEmpty()) ids.add(docId);
        return ids;
    }

    private String nameOf(Uri tree, String id) {
        if (tree == null) return id.replaceFirst("^[^:]*:", "");
        try (Cursor c = getContext().getContentResolver().query(DocumentsContract.buildDocumentUriUsingTree(tree, id),
            new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception e) {
            // The id stands in.
        }
        return id.replaceFirst("^[^:]*:", "");
    }

    // The Files app at a folder. It browses a folder it's handed on most
    // phones; where it won't, its picker opened there shows the same.
    private boolean show(Uri folder) {
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(folder, DocumentsContract.Document.MIME_TYPE_DIR);
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        for (String pkg : new String[] { null, "com.google.android.documentsui", "com.android.documentsui" }) {
            try {
                if (pkg != null) view.setPackage(pkg);
                getActivity().startActivity(view);
                return true;
            } catch (Exception e) {
                // The next one.
            }
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false;
        try {
            Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            pick.putExtra(DocumentsContract.EXTRA_INITIAL_URI, folder);
            getActivity().startActivity(pick);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    // The picked address, with its lasting permission taken. null when the
    // picker was put away, or the permission wasn't granted.
    private Uri taken(ActivityResult result, boolean write) {
        Intent data = result == null ? null : result.getData();
        if (result == null || result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) return null;
        Uri uri = data.getData();
        int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION | (write ? Intent.FLAG_GRANT_WRITE_URI_PERMISSION : 0);
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, flags);
        } catch (Exception e) {
            // Some providers don't offer one; the address still works until
            // the app stops, which is enough to copy the file in.
        }
        return uri;
    }

    @PluginMethod
    public void info(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        new Thread(() -> {
            JSObject out = describe(uri);
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                out.put("ok", in != null);
                // Some providers (cloud drives, some file managers) don't
                // say how big a file is; without it every read came back
                // empty and the file read as damaged (1.1.1). Counted here.
                if (in != null && out.optLong("size", 0) <= 0) {
                    long n = 0;
                    byte[] buf = new byte[1 << 16];
                    for (;;) {
                        long went = in.skip(1L << 30);
                        if (went > 0) { n += went; continue; }
                        int got = in.read(buf);
                        if (got < 0) break;
                        n += got;
                    }
                    out.put("size", n);
                }
            } catch (Exception e) {
                out.put("ok", false);
            }
            call.resolve(out);
        }).start();
    }

    @PluginMethod
    public void read(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        // Not call.getLong: Capacitor hands a long only when the number was
        // stored as one, and any offset under 2 GB arrives as an Integer, so
        // every read started at 0 and books read as damaged (1.1.2).
        long offset = call.getData().optLong("offset", 0L);
        int length = call.getInt("length", 0);
        if (length <= 0 || length > (8 << 20)) {
            call.reject("Ask for between 1 byte and 8 MB");
            return;
        }
        new Thread(() -> {
            try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
                if (in == null) throw new java.io.IOException("not there");
                long left = offset;
                while (left > 0) {
                    long went = in.skip(left);
                    if (went <= 0) { if (in.read() < 0) break; went = 1; }
                    left -= went;
                }
                byte[] buf = new byte[length];
                int got = 0;
                while (got < length) {
                    int n = in.read(buf, got, length - got);
                    if (n < 0) break;
                    got += n;
                }
                JSObject out = new JSObject();
                out.put("data", Base64.encodeToString(buf, 0, got, Base64.NO_WRAP));
                call.resolve(out);
            } catch (Exception e) {
                call.reject("Couldn't read the file", e);
            }
        }).start();
    }

    @PluginMethod
    public void release(PluginCall call) {
        Uri uri = address(call);
        if (uri == null) return;
        try {
            getContext().getContentResolver().releasePersistableUriPermission(uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Exception e) {
            // Already gone.
        }
        call.resolve(new JSObject());
    }

    private Uri address(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("No file"); return null; }
        try {
            return Uri.parse(uri);
        } catch (Exception e) {
            call.reject("Not a file address");
            return null;
        }
    }

    private JSObject describe(Uri uri) {
        JSObject out = new JSObject();
        String name = null;
        long size = 0;
        try (Cursor c = getContext().getContentResolver().query(uri,
            new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                name = c.getString(0);
                if (!c.isNull(1)) size = c.getLong(1);
            }
        } catch (Exception e) {
            name = null;
        }
        if (name == null || name.trim().isEmpty()) name = uri.getLastPathSegment();
        out.put("name", name == null ? "file" : name);
        out.put("size", size);
        return out;
    }
}
