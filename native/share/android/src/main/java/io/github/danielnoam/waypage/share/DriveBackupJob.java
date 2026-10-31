package io.github.danielnoam.waypage.share;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.tasks.Tasks;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Google Drive backups with the app closed (1.47.0), on Android.
 *
 * Each time the app goes to the background it hands over a plan
 * (DrivePlugin.background): what goes in (the ids, and the head files the
 * app writes itself: library.json, feeds.json, stats.json), where the
 * library is, the Waypage folder's id, how often, and when the last
 * backup was. This job wakes every few hours on Wi-Fi with the battery
 * not low, and when a backup is due packs the library (LibraryZip, as
 * Back up now does) and sends it as a resumable upload. Android gives a
 * job about ten minutes: one stopped part way keeps its zip and its
 * session, and the next run sends on from where Drive got to.
 *
 * It never runs while the app is open (DrivePlugin.backgroundHold): the
 * app does its own then. It needs no screen: when Google wants the
 * account picked again, it stops and says so for the app to show.
 *
 * What it did is in preferences (PREFS) for the app to take:
 * { at, size, error, tried }.
 */
public class DriveBackupJob extends JobService {

    static final String PREFS = "waypage-drive";
    static final String PLAN = "drive-plan.json";
    private static final int JOB = 2805;
    private static final int NOTE = 31;
    private static final String CHANNEL = "waypage-drive";
    private static final long DAY = 24 * 60 * 60 * 1000L;
    private static final long EVERY_MS = 6 * 60 * 60 * 1000L;
    private static final long FLEX_MS = 2 * 60 * 60 * 1000L;
    private static final long SESSION_MS = 6 * DAY;
    private static final int KEEP = 3;
    private static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private static final String API = "https://www.googleapis.com/drive/v3/files";
    private static final String UPLOAD = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,createdTime";

    private volatile boolean stopped;
    private volatile HttpURLConnection current;

    // The plan from the app, or none: no plan, no job.
    static void handOver(Context ctx, String plan) {
        File f = new File(ctx.getFilesDir(), PLAN);
        if (plan == null) {
            f.delete();
            schedule(ctx, false);
            return;
        }
        try (OutputStream o = new FileOutputStream(f)) {
            o.write(plan.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            return;
        }
        prefs(ctx).edit().putBoolean("hold", false).apply();
        schedule(ctx, true);
    }

    static void hold(Context ctx, boolean on) {
        prefs(ctx).edit().putBoolean("hold", on).apply();
    }

    static JSONObject state(Context ctx) {
        SharedPreferences p = prefs(ctx);
        JSONObject out = new JSONObject();
        try {
            out.put("at", p.getLong("at", 0));
            out.put("size", p.getLong("size", 0));
            out.put("tried", p.getLong("tried", 0));
            out.put("error", p.getString("error", ""));
            out.put("sending", p.getString("session", null) != null);
        } catch (Exception e) {
            // An empty answer: nothing happened.
        }
        return out;
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static void schedule(Context ctx, boolean on) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!on) {
            js.cancel(JOB);
            return;
        }
        if (js.getPendingJob(JOB) != null) return;
        JobInfo job = new JobInfo.Builder(JOB, new ComponentName(ctx, DriveBackupJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
            .setRequiresBatteryNotLow(true)
            .setPeriodic(EVERY_MS, FLEX_MS)
            .setPersisted(true)
            .build();
        try { js.schedule(job); } catch (Exception e) { /* refused: backups wait for the app */ }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        stopped = false;
        new Thread(() -> {
            try { run(); } catch (Exception e) { /* the next run tries again */ }
            note(null, -1);
            jobFinished(params, false);
        }, "waypage-drive").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        stopped = true;
        HttpURLConnection c = current;
        if (c != null) new Thread(c::disconnect).start();
        return true;
    }

    private void run() throws Exception {
        SharedPreferences p = prefs(this);
        if (p.getBoolean("hold", false)) return;
        File planFile = new File(getFilesDir(), PLAN);
        if (!planFile.exists()) return;
        JSONObject plan = new JSONObject(read(planFile));
        int every = plan.optInt("every", 7);
        String folder = plan.optString("folder", "");
        if (every <= 0 || folder.isEmpty()) return;
        long now = System.currentTimeMillis();
        long last = Math.max(plan.optLong("last", 0), p.getLong("at", 0));
        long tried = Math.max(plan.optLong("tried", 0), p.getLong("tried", 0));
        // A day's backup isn't held to the minute; six hours after a
        // failed try, as in the app.
        if (now - last < every * DAY - 2 * 60 * 60 * 1000L || now - tried < 6 * 60 * 60 * 1000L) return;

        String token;
        try {
            AuthorizationRequest req = AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(SCOPE))).build();
            AuthorizationResult r = Tasks.await(Identity.getAuthorizationClient(this).authorize(req), 60, TimeUnit.SECONDS);
            if (r.hasResolution() || r.getAccessToken() == null) {
                failed("Connect Google Drive again.");
                return;
            }
            token = r.getAccessToken();
        } catch (Exception e) {
            return;
        }

        String name = "waypage-backup-" + new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now)) + ".zip";
        String session = p.getString("session", null);
        File zip = new File(getCacheDir(), p.getString("zip", "drive-job.zip"));
        if (session == null || !zip.exists() || now - p.getLong("sessionAt", 0) > SESSION_MS) {
            zip = new File(getCacheDir(), "drive-job.zip");
            note("Packing the backup", 0);
            List<String> ids = new ArrayList<>();
            JSONArray list = plan.optJSONArray("ids");
            for (int i = 0; list != null && i < list.length(); i++) ids.add(list.getString(i));
            try {
                LibraryZip.pack(this, zip, ids, plan.optJSONArray("head"), plan.optString("dir", null), plan.has("tree") ? plan.getString("tree") : null,
                    () -> { if (stopped) throw new LibraryZip.Stopped(); }, null);
            } catch (LibraryZip.Stopped e) {
                zip.delete();
                return;
            } catch (Exception e) {
                zip.delete();
                failed("Couldn't make the backup. Free some space and try again.");
                return;
            }
            JSONObject meta = new JSONObject();
            meta.put("name", name);
            meta.put("parents", new JSONArray().put(folder));
            meta.put("mimeType", "application/zip");
            String device = plan.optString("device", "");
            meta.put("description", "Waypage backup" + (device.isEmpty() ? "" : " from " + device));
            JSONObject props = new JSONObject();
            props.put("waypage", "backup");
            props.put("device", device.length() > 40 ? device.substring(0, 40) : device);
            props.put("clips", String.valueOf(plan.optInt("clips", ids.size())));
            meta.put("appProperties", props);
            try {
                session = startSession(token, meta.toString(), zip.length());
            } catch (Failed f) {
                zip.delete();
                failed(f.code == 401 ? "Connect Google Drive again." : f.code == 404 ? "The Waypage folder isn't in Drive. Open Waypage and back up there." : "Google Drive said no (" + f.code + "). Try again later.");
                return;
            }
            p.edit().putString("session", session).putString("zip", zip.getName()).putLong("sessionAt", now).apply();
        }

        JSONObject made;
        try {
            made = send(session, zip);
        } catch (Failed f) {
            if (stopped) return;
            if (f.code == 404 || f.code == 410) clearSession(zip);
            failed(f.code == 401 ? "Connect Google Drive again." : "Google Drive said no (" + f.code + "). Try again later.");
            return;
        } catch (Exception e) {
            // Cut off, or Android's time for the job ran out: the next run
            // sends on from where Drive got to.
            return;
        }
        long size = made.has("size") ? Long.parseLong(made.optString("size", "0")) : zip.length();
        clearSession(zip);
        p.edit().putLong("at", System.currentTimeMillis()).putLong("size", size).remove("error").remove("tried").apply();
        try { prune(token, folder, every); } catch (Exception e) { /* the next backup prunes */ }
    }

    private void failed(String why) {
        prefs(this).edit().putString("error", why).putLong("tried", System.currentTimeMillis()).apply();
    }

    private void clearSession(File zip) {
        zip.delete();
        prefs(this).edit().remove("session").remove("zip").remove("sessionAt").apply();
    }

    private String startSession(String token, String meta, long total) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(UPLOAD).openConnection();
        try {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(30000);
            c.setReadTimeout(60000);
            c.setRequestProperty("Authorization", "Bearer " + token);
            c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            c.setRequestProperty("X-Upload-Content-Type", "application/zip");
            c.setRequestProperty("X-Upload-Content-Length", String.valueOf(total));
            byte[] body = meta.getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(body.length);
            try (OutputStream o = c.getOutputStream()) { o.write(body); }
            int code = c.getResponseCode();
            String session = c.getHeaderField("Location");
            if (code != 200 || session == null) throw new Failed(code);
            return session;
        } finally {
            c.disconnect();
        }
    }

    // From where Drive has it up to, as DrivePlugin.send.
    private JSONObject send(String session, File file) throws Exception {
        long total = file.length();
        long from = 0;
        HttpURLConnection ask = put(session);
        current = ask;
        ask.setRequestProperty("Content-Range", "bytes */" + total);
        ask.setFixedLengthStreamingMode(0);
        ask.getOutputStream().close();
        int code = ask.getResponseCode();
        if (code == 200 || code == 201) return new JSONObject(text(ask));
        if (code != 308) throw new Failed(code);
        String range = ask.getHeaderField("Range");
        if (range != null && range.matches("bytes=0-\\d+")) from = Long.parseLong(range.substring(8)) + 1;
        ask.disconnect();

        HttpURLConnection c = put(session);
        current = c;
        try {
            c.setRequestProperty("Content-Type", "application/zip");
            c.setRequestProperty("Content-Range", "bytes " + from + "-" + (total - 1) + "/" + total);
            c.setFixedLengthStreamingMode(total - from);
            try (InputStream in = new FileInputStream(file); OutputStream o = c.getOutputStream()) {
                long skip = from;
                while (skip > 0) {
                    long went = in.skip(skip);
                    if (went <= 0) throw new java.io.IOException("short file");
                    skip -= went;
                }
                byte[] buf = new byte[1 << 16];
                long done = from, told = from;
                int n;
                while ((n = in.read(buf)) > 0) {
                    if (stopped) throw new java.io.IOException("stopped");
                    o.write(buf, 0, n);
                    done += n;
                    if (done - told >= (4 << 20)) {
                        told = done;
                        note("Sending to Drive", (int) (done * 100 / Math.max(1, total)));
                    }
                }
            }
            code = c.getResponseCode();
            String said = text(c);
            if (code != 200 && code != 201) throw new Failed(code);
            return new JSONObject(said);
        } finally {
            current = null;
            c.disconnect();
        }
    }

    // The newest KEEP, and with backups more often than weekly one at
    // least a week older than those too, as drive.js's prune.
    private void prune(String token, String folder, int every) throws Exception {
        String q = "'" + folder.replace("\\", "\\\\").replace("'", "\\'") + "' in parents and trashed=false and appProperties has { key='waypage' and value='backup' }";
        HttpURLConnection c = (HttpURLConnection) new URL(API + "?q=" + URLEncoder.encode(q, "UTF-8")
            + "&orderBy=" + URLEncoder.encode("createdTime desc", "UTF-8") + "&fields=" + URLEncoder.encode("files(id,createdTime)", "UTF-8") + "&pageSize=50").openConnection();
        c.setRequestProperty("Authorization", "Bearer " + token);
        if (c.getResponseCode() != 200) return;
        JSONArray files = new JSONObject(text(c)).optJSONArray("files");
        c.disconnect();
        if (files == null || files.length() == 0) return;
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        long[] at = new long[files.length()];
        for (int i = 0; i < files.length(); i++) {
            try { at[i] = iso.parse(files.getJSONObject(i).optString("createdTime", "")).getTime(); } catch (Exception e) { at[i] = 0; }
        }
        Set<Integer> keep = new HashSet<>();
        for (int i = 0; i < Math.min(KEEP, files.length()); i++) keep.add(i);
        if (every < 7) {
            for (int i = 0; i < files.length(); i++) {
                if (!keep.contains(i) && at[i] > 0 && at[i] <= at[0] - 7 * DAY) { keep.add(i); break; }
            }
        }
        for (int i = 0; i < files.length(); i++) {
            if (keep.contains(i)) continue;
            HttpURLConnection d = (HttpURLConnection) new URL(API + "/" + files.getJSONObject(i).getString("id")).openConnection();
            d.setRequestMethod("DELETE");
            d.setRequestProperty("Authorization", "Bearer " + token);
            d.getResponseCode();
            d.disconnect();
        }
    }

    // A quiet notification while it works; `text` null takes it away.
    @SuppressWarnings("deprecation")
    private void note(String text, int pct) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (text == null) {
            nm.cancel(NOTE);
            return;
        }
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Google Drive backups", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        b.setSmallIcon(android.R.drawable.stat_sys_upload)
            .setContentTitle("Backing up to Google Drive")
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setProgress(100, Math.max(pct, 0), pct < 0);
        try { nm.notify(NOTE, b.build()); } catch (Exception e) { /* notifications off */ }
    }

    private static HttpURLConnection put(String session) throws java.io.IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(session).openConnection();
        c.setRequestMethod("PUT");
        c.setDoOutput(true);
        c.setConnectTimeout(30000);
        c.setReadTimeout(120000);
        return c;
    }

    private static String read(File f) throws java.io.IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            return b.toString("UTF-8");
        }
    }

    private static String text(HttpURLConnection c) {
        try (InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream()) {
            if (in == null) return "";
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0 && b.size() < 1 << 20) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    private static class Failed extends Exception {
        final int code;
        Failed(int code) {
            super("Drive said " + code);
            this.code = code;
        }
    }
}
