package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.net.Uri;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * Google Drive backups (1.27.0), drive.file scope only: Waypage sees the
 * files it made and nothing else. Google matches the app by its package
 * name and signing key, so there is no client secret here.
 *
 *   authorize({ ask })   { token }; with ask false it never shows a screen
 *                        and rejects "consent" when one would be needed
 *   session({ uri, token, meta })  { session }: a resumable upload for the
 *                        backup file in the cache; meta is the Drive file's JSON
 *   send({ uri, session })   the file, from where Drive has it up to (1.27.1);
 *                        resolves to Drive's answer, { id, size, ... }
 *   download({ id, token })  a Drive file into the cache: { uri, size }
 *   cancel()             stops a send or download; it rejects "cancelled"
 *
 * Both transfers send "progress" { done, total } as they go.
 */
@CapacitorPlugin(name = "Drive")
public class DrivePlugin extends Plugin {

    private static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String FILES = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,createdTime,description";
    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall asking;
    private volatile HttpURLConnection current;
    private volatile boolean cancelled;

    @Override
    public void load() {
        consent = getActivity().registerForActivityResult(new ActivityResultContracts.StartIntentSenderForResult(), (result) -> {
            PluginCall call = asking;
            asking = null;
            if (call == null) return;
            if (result.getResultCode() != Activity.RESULT_OK) {
                call.reject("Not allowed", "declined");
                return;
            }
            try {
                AuthorizationResult r = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(result.getData());
                answer(call, r);
            } catch (Exception e) {
                call.reject(e.getMessage(), "failed");
            }
        });
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        boolean ask = call.getBoolean("ask", false);
        AuthorizationRequest req = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(SCOPE)))
            .build();
        Identity.getAuthorizationClient(getActivity()).authorize(req)
            .addOnSuccessListener((r) -> {
                if (!r.hasResolution()) {
                    answer(call, r);
                    return;
                }
                if (!ask || r.getPendingIntent() == null) {
                    call.reject("Needs the account picked", "consent");
                    return;
                }
                if (asking != null) asking.reject("Asked again", "failed");
                asking = call;
                consent.launch(new IntentSenderRequest.Builder(r.getPendingIntent().getIntentSender()).build());
            })
            .addOnFailureListener((e) -> call.reject(e.getMessage(), "failed"));
    }

    private void answer(PluginCall call, AuthorizationResult r) {
        if (r.getAccessToken() == null) {
            call.reject("No token", "failed");
            return;
        }
        JSObject out = new JSObject();
        out.put("token", r.getAccessToken());
        call.resolve(out);
    }

    // The upload's address at Drive, good for a week: the file is sent to
    // it, and after a pause or a dropped connection sent on from where
    // Drive says it got to.
    @PluginMethod
    public void session(PluginCall call) {
        String token = call.getString("token");
        String meta = call.getString("meta", "{}");
        String uri = call.getString("uri");
        if (uri == null || token == null) {
            call.reject("No file");
            return;
        }
        long total = new File(Uri.parse(uri).getPath()).length();
        new Thread(() -> {
            HttpURLConnection start = null;
            try {
                start = (HttpURLConnection) new URL(FILES).openConnection();
                start.setRequestMethod("POST");
                start.setDoOutput(true);
                start.setRequestProperty("Authorization", "Bearer " + token);
                start.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                start.setRequestProperty("X-Upload-Content-Type", "application/zip");
                start.setRequestProperty("X-Upload-Content-Length", String.valueOf(total));
                byte[] body = meta.getBytes(StandardCharsets.UTF_8);
                start.setFixedLengthStreamingMode(body.length);
                try (OutputStream o = start.getOutputStream()) { o.write(body); }
                int code = start.getResponseCode();
                String session = start.getHeaderField("Location");
                if (code != 200 || session == null) throw new Failed(code, text(start));
                JSObject out = new JSObject();
                out.put("session", session);
                call.resolve(out);
            } catch (Failed f) {
                call.reject(f.getMessage(), String.valueOf(f.code));
            } catch (Exception e) {
                call.reject(e.getMessage(), "network");
            } finally {
                if (start != null) start.disconnect();
            }
        }).start();
    }

    // Sends the file to a session from where Drive has it up to; resolves
    // to Drive's answer, { id, size, ... }. cancel() stops it ("cancelled").
    @PluginMethod
    public void send(PluginCall call) {
        String uri = call.getString("uri");
        String session = call.getString("session");
        if (uri == null || session == null || !session.startsWith("https://www.googleapis.com/")) {
            call.reject("No file");
            return;
        }
        File file = new File(Uri.parse(uri).getPath());
        cancelled = false;
        new Thread(() -> {
            try {
                long total = file.length();
                long from = 0;
                HttpURLConnection ask = open(session);
                ask.setRequestProperty("Content-Range", "bytes */" + total);
                ask.setFixedLengthStreamingMode(0);
                ask.getOutputStream().close();
                int code = ask.getResponseCode();
                if (code == 200 || code == 201) {
                    call.resolve(new JSObject(text(ask)));
                    return;
                }
                if (code != 308) throw new Failed(code, text(ask));
                String range = ask.getHeaderField("Range");
                if (range != null && range.matches("bytes=0-\\d+")) from = Long.parseLong(range.substring(8)) + 1;
                ask.disconnect();

                HttpURLConnection put = open(session);
                current = put;
                put.setRequestProperty("Content-Type", "application/zip");
                put.setRequestProperty("Content-Range", "bytes " + from + "-" + (total - 1) + "/" + total);
                put.setFixedLengthStreamingMode(total - from);
                try (InputStream in = new FileInputStream(file); OutputStream o = put.getOutputStream()) {
                    long skip = from;
                    while (skip > 0) {
                        long went = in.skip(skip);
                        if (went <= 0) throw new java.io.IOException("short file");
                        skip -= went;
                    }
                    copy(in, o, total, from);
                }
                code = put.getResponseCode();
                String said = text(put);
                if (code != 200 && code != 201) throw new Failed(code, said);
                call.resolve(new JSObject(said));
            } catch (Failed f) {
                call.reject(f.getMessage(), cancelled ? "cancelled" : String.valueOf(f.code));
            } catch (Exception e) {
                call.reject(e.getMessage(), cancelled ? "cancelled" : "network");
            } finally {
                HttpURLConnection c = current;
                current = null;
                if (c != null) c.disconnect();
            }
        }).start();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cancelled = true;
        HttpURLConnection c = current;
        if (c != null) new Thread(c::disconnect).start();
        call.resolve();
    }

    private static HttpURLConnection open(String session) throws java.io.IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(session).openConnection();
        c.setRequestMethod("PUT");
        c.setDoOutput(true);
        c.setConnectTimeout(30000);
        c.setReadTimeout(120000);
        return c;
    }

    @PluginMethod
    public void download(PluginCall call) {
        String id = call.getString("id");
        String token = call.getString("token");
        if (id == null || token == null || !id.matches("[A-Za-z0-9_-]{1,200}")) {
            call.reject("No file");
            return;
        }
        File out = new File(getContext().getCacheDir(), "drive-backup.zip");
        cancelled = false;
        new Thread(() -> {
            HttpURLConnection get = null;
            try {
                get = (HttpURLConnection) new URL("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media").openConnection();
                current = get;
                get.setRequestProperty("Authorization", "Bearer " + token);
                get.setConnectTimeout(30000);
                get.setReadTimeout(120000);
                int code = get.getResponseCode();
                if (code != 200) throw new Failed(code, text(get));
                long total = get.getContentLengthLong();
                try (InputStream in = get.getInputStream(); OutputStream o = new FileOutputStream(out)) {
                    copy(in, o, total, 0);
                }
                JSObject res = new JSObject();
                res.put("uri", Uri.fromFile(out).toString());
                res.put("size", out.length());
                call.resolve(res);
            } catch (Failed f) {
                call.reject(f.getMessage(), String.valueOf(f.code));
            } catch (Exception e) {
                out.delete();
                call.reject(e.getMessage(), cancelled ? "cancelled" : "network");
            } finally {
                current = null;
                if (get != null) get.disconnect();
            }
        }).start();
    }

    private void copy(InputStream in, OutputStream o, long total, long from) throws java.io.IOException {
        byte[] buf = new byte[1 << 16];
        long done = from, told = from;
        int n;
        while ((n = in.read(buf)) > 0) {
            o.write(buf, 0, n);
            done += n;
            if (done - told >= (1 << 20)) {
                told = done;
                JSObject p = new JSObject();
                p.put("done", done);
                p.put("total", total);
                notifyListeners("progress", p);
            }
        }
    }

    private static String text(HttpURLConnection c) {
        try (InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream()) {
            if (in == null) return "";
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && b.size() < 65536) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private static class Failed extends Exception {
        final int code;
        Failed(int code, String body) {
            super("Drive said " + code + (body == null || body.isEmpty() ? "" : ": " + body.substring(0, Math.min(300, body.length()))));
            this.code = code;
        }
    }
}
