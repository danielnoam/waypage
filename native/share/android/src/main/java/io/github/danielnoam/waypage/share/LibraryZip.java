package io.github.danielnoam.waypage.share;

import android.content.ContentResolver;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The library as one zip (1.45.10), for FilesPlugin.pack and, since
 * 1.47.0, the Drive backup that runs with the app closed
 * (DriveBackupJob). Streamed file to zip: text is deflated; pictures,
 * books and the rest are stored as they are, which is what
 * backup.js's restoreLibrary reads fastest.
 *
 * `dir` is the library's file:// address (app storage, Documents), `tree`
 * a picked folder's tree. `head` is [{ name, text }] written first.
 */
final class LibraryZip {

    interface Gate { void check() throws Exception; }
    interface Progress { void at(int done, int total); }
    static final class Stopped extends Exception {}

    private LibraryZip() {}

    static void pack(Context ctx, File out, List<String> ids, JSONArray head, String dir, String tree, Gate gate, Progress progress) throws Exception {
        Packer src = tree != null ? new TreePacker(ctx, Uri.parse(tree)) : new DirPacker(new File(Uri.parse(dir).getPath()));
        try (ZipOutputStream zip = new ZipOutputStream(new java.io.BufferedOutputStream(new java.io.FileOutputStream(out), 1 << 16))) {
            if (head != null) {
                for (int i = 0; i < head.length(); i++) {
                    JSONObject h = head.getJSONObject(i);
                    byte[] b = h.getString("text").getBytes(StandardCharsets.UTF_8);
                    put(zip, h.getString("name"), () -> new java.io.ByteArrayInputStream(b), gate);
                }
            }
            long last = 0;
            for (int i = 0; i < ids.size(); i++) {
                String id = ids.get(i);
                if (id.matches("[A-Za-z0-9_-]{1,80}")) src.page(id, zip, gate);
                long now = System.currentTimeMillis();
                if (progress != null && (now - last > 120 || i == ids.size() - 1)) {
                    last = now;
                    progress.at(i + 1, ids.size());
                }
            }
        }
    }

    private interface Opener { InputStream open() throws java.io.IOException; }

    private interface Packer { void page(String id, ZipOutputStream zip, Gate gate) throws Exception; }

    private static boolean deflates(String path) {
        return path.matches("(?i).*\\.(html?|txt|json|xml|css|svg|md)$");
    }

    private static void put(ZipOutputStream zip, String path, Opener open, Gate gate) throws Exception {
        if (gate != null) gate.check();
        ZipEntry e = new ZipEntry(path);
        byte[] buf = new byte[1 << 16];
        int n;
        if (deflates(path)) {
            e.setMethod(ZipEntry.DEFLATED);
        } else {
            CRC32 crc = new CRC32();
            long len = 0;
            try (InputStream in = open.open()) {
                while ((n = in.read(buf)) > 0) { crc.update(buf, 0, n); len += n; }
            }
            e.setMethod(ZipEntry.STORED);
            e.setSize(len);
            e.setCompressedSize(len);
            e.setCrc(crc.getValue());
        }
        zip.putNextEntry(e);
        try (InputStream in = open.open()) {
            while ((n = in.read(buf)) > 0) zip.write(buf, 0, n);
        }
        zip.closeEntry();
    }

    private static final class DirPacker implements Packer {
        final File pages;
        DirPacker(File root) { pages = new File(root, "pages"); }
        public void page(String id, ZipOutputStream zip, Gate gate) throws Exception {
            walk(new File(pages, id), "pages/" + id + "/", zip, gate);
        }
        void walk(File dir, String at, ZipOutputStream zip, Gate gate) throws Exception {
            File[] files = dir.listFiles();
            if (files == null) return;
            for (File f : files) {
                if (f.isDirectory()) walk(f, at + f.getName() + "/", zip, gate);
                else if (f.isFile()) put(zip, at + f.getName(), () -> new FileInputStream(f), gate);
            }
        }
    }

    private static final class TreePacker implements Packer {
        final Context ctx;
        final Uri tree;
        final Map<String, Uri> pages = new HashMap<>();
        TreePacker(Context ctx, Uri tree) {
            this.ctx = ctx;
            this.tree = tree;
            Uri root = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree));
            Uri dir = null;
            for (String[] c : children(root)) {
                if ("pages".equals(c[1])) { dir = DocumentsContract.buildDocumentUriUsingTree(tree, c[0]); break; }
            }
            if (dir != null) for (String[] c : children(dir)) pages.put(c[1], DocumentsContract.buildDocumentUriUsingTree(tree, c[0]));
        }
        public void page(String id, ZipOutputStream zip, Gate gate) throws Exception {
            Uri dir = pages.get(id);
            if (dir != null) walk(dir, "pages/" + id + "/", zip, gate);
        }
        void walk(Uri dir, String at, ZipOutputStream zip, Gate gate) throws Exception {
            ContentResolver cr = ctx.getContentResolver();
            for (String[] c : children(dir)) {
                Uri doc = DocumentsContract.buildDocumentUriUsingTree(tree, c[0]);
                if (DocumentsContract.Document.MIME_TYPE_DIR.equals(c[2])) walk(doc, at + c[1] + "/", zip, gate);
                else put(zip, at + c[1], () -> {
                    InputStream in = cr.openInputStream(doc);
                    if (in == null) throw new java.io.FileNotFoundException(c[1]);
                    return in;
                }, gate);
            }
        }
        // { id, name, mime } of each thing in a folder.
        List<String[]> children(Uri dir) {
            List<String[]> out = new ArrayList<>();
            Uri list = DocumentsContract.buildChildDocumentsUriUsingTree(tree, DocumentsContract.getDocumentId(dir));
            try (Cursor c = ctx.getContentResolver().query(list, new String[] {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE }, null, null, null)) {
                while (c != null && c.moveToNext()) out.add(new String[] { c.getString(0), c.getString(1), c.getString(2) });
            } catch (Exception e) {
                // An empty or unreadable folder lists as nothing.
            }
            return out;
        }
    }
}
