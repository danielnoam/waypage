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
 *   upload({ uri, token, meta })   the backup file in the cache, as one
 *                        resumable upload; meta is the Drive file's JSON.
 *                        Resolves to Drive's answer, { id, size, ... }
 *   download({ id, token, name })  a Drive file into the cache: { uri, size }
 *
 * Both transfers send "progress" { done, total } as they go.
 */
@CapacitorPlugin(name = "Drive")
public class DrivePlugin extends Plugin {

    private static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String FILES = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,createdTime,description";
    private ActivityResultLauncher<IntentSenderRequest> consent;
    private PluginCall asking;

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

    @PluginMethod
    public void upload(PluginCall call) {
        String uri = call.getString("uri");
        String token = call.getString("token");
        String meta = call.getString("meta", "{}");
        if (uri == null || token == null) {
            call.reject("No file");
            return;
        }
        File file = new File(Uri.parse(uri).getPath());
        new Thread(() -> {
            HttpURLConnection start = null, put = null;
            try {
                long total = file.length();
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

                put = (HttpURLConnection) new URL(session).openConnection();
                put.setRequestMethod("PUT");
                put.setDoOutput(true);
                put.setRequestProperty("Content-Type", "application/zip");
                put.setFixedLengthStreamingMode(total);
                put.setConnectTimeout(30000);
                put.setReadTimeout(120000);
                try (InputStream in = new FileInputStream(file); OutputStream o = put.getOutputStream()) {
                    copy(in, o, total);
                }
                code = put.getResponseCode();
                String said = text(put);
                if (code != 200 && code != 201) throw new Failed(code, said);
                call.resolve(new JSObject(said));
            } catch (Failed f) {
                call.reject(f.getMessage(), String.valueOf(f.code));
            } catch (Exception e) {
                call.reject(e.getMessage(), "network");
            } finally {
                if (start != null) start.disconnect();
                if (put != null) put.disconnect();
            }
        }).start();
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
        new Thread(() -> {
            HttpURLConnection get = null;
            try {
                get = (HttpURLConnection) new URL("https://www.googleapis.com/drive/v3/files/" + id + "?alt=media").openConnection();
                get.setRequestProperty("Authorization", "Bearer " + token);
                get.setConnectTimeout(30000);
                get.setReadTimeout(120000);
                int code = get.getResponseCode();
                if (code != 200) throw new Failed(code, text(get));
                long total = get.getContentLengthLong();
                try (InputStream in = get.getInputStream(); OutputStream o = new FileOutputStream(out)) {
                    copy(in, o, total);
                }
                JSObject res = new JSObject();
                res.put("uri", Uri.fromFile(out).toString());
                res.put("size", out.length());
                call.resolve(res);
            } catch (Failed f) {
                call.reject(f.getMessage(), String.valueOf(f.code));
            } catch (Exception e) {
                out.delete();
                call.reject(e.getMessage(), "network");
            } finally {
                if (get != null) get.disconnect();
            }
        }).start();
    }

    private void copy(InputStream in, OutputStream o, long total) throws java.io.IOException {
        byte[] buf = new byte[1 << 16];
        long done = 0, told = 0;
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
