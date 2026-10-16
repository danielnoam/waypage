package io.github.danielnoam.waypage.share;

import android.app.Notification;
import android.service.notification.StatusBarNotification;
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
import android.content.pm.PackageManager;
import android.os.Build;
import android.text.Html;
import android.util.Xml;
import android.webkit.WebSettings;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

/**
 * Reads the followed feeds every few hours while the app is closed
 * (0.28.4), and says in a notification when they have new posts. Nothing
 * is saved here: the app reads the feeds itself when it's opened, as it
 * always has, and saves what it's set to save then.
 *
 * The app hands over feeds.json (FeedsPlugin.watch): each feed's address,
 * title and the posts it already has (ids and addresses). A post is new
 * when none of its ids is among them, nor among those told about already
 * (told.json), so a post is never announced twice. What's waiting is kept
 * in preferences for the app to take when it opens (FeedsPlugin.news).
 *
 * How it's said (1.30.0) is the app's Notifications setting, kept in
 * preferences as "notes": { style: "each" | "together" | "off", quiet:
 * [feed url] }. "each" posts every new post on its own, its title and the
 * start of its summary, grouped by feed, with Save; "together" is the one
 * notification there was before.
 */
public class FeedCheckJob extends JobService {

    static final String OPEN = "io.github.danielnoam.waypage.FEEDS";
    static final String PREFS = "waypage-feeds";
    static final String WATCH = "feeds.json";
    private static final String TOLD = "feeds-told.json";
    static final String FEED = "feed";
    static final String SAVE = "save";
    static final String NOTE_ID = "note";
    private static final String CHANNEL = "waypage-feeds";
    private static final String TAG = "waypage-feeds";
    private static final int JOB = 2804;
    private static final int NOTE = 29;
    private static final int MAX_EACH = 5;
    private static final int MAX_KEPT = 20;
    private static final int SUMMARY = 300;
    private static final long EVERY_MS = 3 * 60 * 60 * 1000L;
    private static final long FLEX_MS = 60 * 60 * 1000L;
    private static final int MAX_ITEMS = 50;
    private static final int MAX_TOLD = 300;
    private static final int MAX_BYTES = 4 * 1024 * 1024;
    private static final int TIMEOUT_MS = 20000;
    private static final String ACCEPT = "application/rss+xml, application/atom+xml, application/feed+json, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8";

    private volatile boolean stopped;

    static void schedule(Context ctx, boolean on) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        if (!on) {
            js.cancel(JOB);
            return;
        }
        if (js.getPendingJob(JOB) != null) return;
        JobInfo job = new JobInfo.Builder(JOB, new ComponentName(ctx, FeedCheckJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPeriodic(EVERY_MS, FLEX_MS)
            .setPersisted(true)
            .build();
        try { js.schedule(job); } catch (Exception e) { /* refused: checks wait for the app */ }
    }

    @Override
    public boolean onStartJob(JobParameters params) {
        stopped = false;
        new Thread(() -> {
            try { run(); } catch (Exception e) { /* the next run tries again */ }
            jobFinished(params, false);
        }, "waypage-feeds").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        stopped = true;
        return true;
    }

    private void run() throws Exception {
        JSONArray watch = readJson(new File(getFilesDir(), WATCH), new JSONArray());
        if (watch.length() == 0) return;
        File toldFile = new File(getFilesDir(), TOLD);
        JSONObject told = readJson(toldFile, new JSONObject());
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        JSONObject waiting = new JSONObject(prefs.getString("waiting", "{}"));
        JSONObject fresh = new JSONObject();
        boolean found = false;
        for (int i = 0; i < watch.length() && !stopped; i++) {
            JSONObject f = watch.optJSONObject(i);
            if (f == null) continue;
            String url = f.optString("url", "");
            if (!url.startsWith("http")) continue;
            List<Post> posts;
            try { posts = read(url); } catch (Exception e) { continue; }
            Set<String> known = new HashSet<>();
            JSONArray k = f.optJSONArray("known");
            if (k != null) for (int j = 0; j < k.length(); j++) known.add(k.optString(j));
            JSONArray t = told.optJSONArray(url);
            if (t != null) for (int j = 0; j < t.length(); j++) known.add(t.optString(j));
            List<String> keysNow = new ArrayList<>();
            JSONArray news = new JSONArray();
            for (Post post : posts) {
                boolean seen = false;
                for (String key : post.keys) if (known.contains(key)) { seen = true; break; }
                if (seen) continue;
                keysNow.addAll(post.keys);
                news.put(post.json());
            }
            if (news.length() == 0) continue;
            JSONArray now = new JSONArray();
            for (String key : keysNow) now.put(key);
            if (t != null) for (int j = 0; j < t.length() && now.length() < MAX_TOLD; j++) now.put(t.optString(j));
            told.put(url, now);
            JSONObject w = waiting.optJSONObject(url);
            if (w == null) w = new JSONObject().put("title", f.optString("title", "")).put("count", 0);
            w.put("count", w.optInt("count", 0) + news.length());
            JSONArray kept = new JSONArray();
            for (int j = 0; j < news.length() && kept.length() < MAX_KEPT; j++) kept.put(news.get(j));
            JSONArray had = w.optJSONArray("posts");
            if (had != null) for (int j = 0; j < had.length() && kept.length() < MAX_KEPT; j++) kept.put(had.get(j));
            w.put("posts", kept);
            waiting.put(url, w);
            fresh.put(url, news);
            found = true;
        }
        if (!found) return;
        writeJson(toldFile, told.toString());
        prefs.edit().putString("waiting", waiting.toString()).commit();
        notify(this, waiting, fresh);
        Widgets.refresh(this);
    }

    // ---- Reading a feed: each post as the set of ids it can go by, and
    // what the notification shows of it ----

    static final class Post {
        final Set<String> keys = new LinkedHashSet<>();
        String title = "", text = "", link = "";

        JSONObject json() throws Exception {
            return new JSONObject().put("title", title).put("text", text).put("link", link);
        }
    }

    private List<Post> read(String address) throws Exception {
        URL url = new URL(address);
        HttpURLConnection c = null;
        for (int hop = 0; hop < 5; hop++) {
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(TIMEOUT_MS);
            c.setReadTimeout(TIMEOUT_MS);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Accept", ACCEPT);
            c.setRequestProperty("User-Agent", userAgent(this));
            int code = c.getResponseCode();
            if (code < 300 || code >= 400) break;
            String to = c.getHeaderField("Location");
            c.disconnect();
            if (to == null) throw new Exception("redirect");
            url = new URL(url, to);
        }
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        byte[] body;
        try (InputStream in = c.getInputStream()) { body = readAll(in, MAX_BYTES); }
        finally { c.disconnect(); }
        int at = 0;
        while (at < body.length && (Character.isWhitespace(body[at]) || (body[at] & 0xff) >= 0xef)) at++;
        if (at < body.length && body[at] == '{') return fromJson(new String(body, StandardCharsets.UTF_8), url);
        return fromXml(body, url);
    }

    // As src/feeds.js: a summary is the description (RSS) or summary
    // (Atom), else the start of the full text, as plain words.
    private static List<Post> fromXml(byte[] body, URL base) throws Exception {
        XmlPullParser p = Xml.newPullParser();
        p.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false);
        p.setInput(new ByteArrayInputStream(body), null);
        List<Post> out = new ArrayList<>();
        Post post = null;
        String summary = "", full = "";
        int postDepth = -1;
        String field = null;
        StringBuilder text = new StringBuilder();
        for (int e = p.getEventType(); e != XmlPullParser.END_DOCUMENT && out.size() < MAX_ITEMS; e = p.next()) {
            if (e == XmlPullParser.START_TAG) {
                String name = local(p.getName());
                if (post == null && (name.equals("item") || name.equals("entry"))) {
                    post = new Post();
                    summary = full = "";
                    postDepth = p.getDepth();
                } else if (post != null && p.getDepth() == postDepth + 1) {
                    if (name.equals("link")) {
                        String href = p.getAttributeValue(null, "href");
                        String rel = p.getAttributeValue(null, "rel");
                        if (href != null && (rel == null || rel.equals("alternate"))) {
                            String a = absolute(href, base);
                            add(post.keys, a);
                            if (post.link.isEmpty() && a != null) post.link = a;
                        }
                    }
                    if (name.equals("guid") || name.equals("id") || name.equals("link") || name.equals("title")
                        || name.equals("description") || name.equals("summary") || name.equals("encoded") || name.equals("content")) {
                        field = name;
                        text.setLength(0);
                    }
                }
            } else if (e == XmlPullParser.TEXT || e == XmlPullParser.CDSECT) {
                if (field != null) text.append(p.getText());
            } else if (e == XmlPullParser.END_TAG) {
                if (post != null && field != null && p.getDepth() == postDepth + 1) {
                    String raw = text.toString();
                    String v = clean(raw);
                    if (field.equals("title")) { if (post.title.isEmpty()) post.title = plain(raw, 120); }
                    else if (field.equals("description") || field.equals("summary")) { if (summary.isEmpty()) summary = raw; }
                    else if (field.equals("encoded") || field.equals("content")) { if (full.isEmpty()) full = raw; }
                    else if (!v.isEmpty() && field.equals("link")) {
                        String a = absolute(v, base);
                        add(post.keys, a);
                        if (post.link.isEmpty() && a != null) post.link = a;
                    } else if (!v.isEmpty()) {
                        add(post.keys, v);
                        String a = absolute(v, base);
                        add(post.keys, a);
                        if (field.equals("guid") && post.link.isEmpty() && a != null) post.link = a;
                    }
                    field = null;
                } else if (post != null && p.getDepth() == postDepth) {
                    post.text = plain(summary.trim().isEmpty() ? full : summary, SUMMARY);
                    if (post.title.isEmpty()) post.title = plain(post.text, 80);
                    if (!post.keys.isEmpty()) out.add(post);
                    post = null;
                }
            }
        }
        return out;
    }

    private static List<Post> fromJson(String body, URL base) throws Exception {
        JSONArray items = new JSONObject(body).optJSONArray("items");
        List<Post> out = new ArrayList<>();
        if (items == null) return out;
        for (int i = 0; i < items.length() && out.size() < MAX_ITEMS; i++) {
            JSONObject it = items.optJSONObject(i);
            if (it == null) continue;
            Post post = new Post();
            if (it.has("id")) add(post.keys, clean(String.valueOf(it.opt("id"))));
            String u = absolute(it.optString("url", ""), base);
            add(post.keys, u);
            add(post.keys, absolute(it.optString("external_url", ""), base));
            post.link = u != null ? u : "";
            post.title = plain(it.optString("title", ""), 120);
            String s = it.optString("summary", "");
            if (s.trim().isEmpty()) s = it.optString("content_text", "");
            if (s.trim().isEmpty()) s = it.optString("content_html", "");
            post.text = plain(s, SUMMARY);
            if (post.title.isEmpty()) post.title = plain(post.text, 80);
            if (!post.keys.isEmpty()) out.add(post);
        }
        return out;
    }

    // HTML as its words, cut at a word near `max`. Nothing of it is shown
    // as markup.
    private static String plain(String s, int max) {
        if (s == null) return "";
        String v = s.indexOf('<') >= 0 || s.indexOf('&') >= 0 ? Html.fromHtml(s, Html.FROM_HTML_MODE_COMPACT).toString() : s;
        v = v.replace('\uFFFC', ' ').replaceAll("\\s+", " ").trim();
        if (v.length() <= max) return v;
        int cut = v.lastIndexOf(' ', max);
        return (cut > max / 2 ? v.substring(0, cut) : v.substring(0, max)) + "…";
    }

    private static String local(String name) {
        int i = name.indexOf(':');
        return i < 0 ? name : name.substring(i + 1);
    }

    // As src/feeds.js's clean(): spaces run together, ends trimmed.
    private static String clean(String s) {
        String v = s.replaceAll("\\s+", " ").trim();
        return v.length() > 500 ? v.substring(0, 500) : v;
    }

    private static String absolute(String href, URL base) {
        if (href == null || href.trim().isEmpty()) return null;
        try {
            URL u = new URL(base, href.trim());
            String p = u.getProtocol();
            return p.equals("http") || p.equals("https") ? u.toString() : null;
        } catch (Exception e) { return null; }
    }

    private static void add(Set<String> post, String key) {
        if (key != null && !key.isEmpty()) post.add(key);
    }

    // ---- The notifications ----

    static JSONObject notes(Context ctx) {
        try { return new JSONObject(ctx.getSharedPreferences(PREFS, MODE_PRIVATE).getString("notes", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    // `fresh`: what this run found, by feed. Only those are posted on their
    // own, so a post swiped away doesn't come back with the next one.
    static void notify(Context ctx, JSONObject waiting, JSONObject fresh) {
        if (Build.VERSION.SDK_INT >= 33 && ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
        JSONObject cfg = notes(ctx);
        String style = cfg.optString("style", "each");
        if (style.equals("off")) return;
        Set<String> quiet = new HashSet<>();
        JSONArray q = cfg.optJSONArray("quiet");
        if (q != null) for (int i = 0; i < q.length(); i++) quiet.add(q.optString(i));
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null)
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "New posts", NotificationManager.IMPORTANCE_DEFAULT));
        if (style.equals("together")) together(ctx, nm, waiting, quiet);
        else each(ctx, nm, waiting, fresh, quiet);
    }

    private static Notification.Builder builder(Context ctx) {
        return Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(ctx, CHANNEL) : new Notification.Builder(ctx);
    }

    // A tap opens Feeds at `feed`; with `save`, that post is saved too.
    private static PendingIntent open(Context ctx, int code, String feed, String save, int note) {
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (open == null) return null;
        open.setAction(OPEN);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        if (feed != null) open.putExtra(FEED, feed);
        if (save != null) open.putExtra(SAVE, save).putExtra(NOTE_ID, note);
        return PendingIntent.getActivity(ctx, code, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void each(Context ctx, NotificationManager nm, JSONObject waiting, JSONObject fresh, Set<String> quiet) {
        for (Iterator<String> it = fresh.keys(); it.hasNext(); ) {
            String url = it.next();
            JSONObject w = waiting.optJSONObject(url);
            JSONArray posts = fresh.optJSONArray(url);
            if (w == null || posts == null || quiet.contains(url)) continue;
            String feed = w.optString("title", "");
            int sumId = ("sum " + url).hashCode();
            for (int i = 0; i < posts.length() && i < MAX_EACH; i++) {
                JSONObject post = posts.optJSONObject(i);
                if (post == null) continue;
                String link = post.optString("link", "");
                String title = post.optString("title", "");
                String text = post.optString("text", "");
                int id = (url + " " + (link.isEmpty() ? title : link)).hashCode();
                if (id == sumId || id == NOTE) id++;
                Notification.Builder b = builder(ctx).setSmallIcon(R.drawable.waypage_feed)
                    .setContentTitle(title.isEmpty() ? "A new post" : title)
                    .setContentText(text)
                    .setStyle(new Notification.BigTextStyle().bigText(text))
                    .setGroup(url)
                    .setAutoCancel(true)
                    .setOnlyAlertOnce(true);
                if (!feed.isEmpty()) b.setSubText(feed);
                PendingIntent tap = open(ctx, id, url, null, 0);
                if (tap != null) b.setContentIntent(tap);
                if (!link.isEmpty()) {
                    PendingIntent save = open(ctx, id ^ 0x5a5a5a5a, url, link, id);
                    if (save != null) b.addAction(new Notification.Action.Builder(null, "Save", save).build());
                }
                nm.notify(TAG, id, b.build());
            }
            // The feed's group: Android shows it when the posts are bundled,
            // and says how many more there are than were posted.
            int count = w.optInt("count", 0);
            JSONArray kept = w.optJSONArray("posts");
            Notification.InboxStyle box = new Notification.InboxStyle();
            for (int i = 0; kept != null && i < kept.length() && i < 5; i++) {
                JSONObject post = kept.optJSONObject(i);
                if (post != null) box.addLine(post.optString("title", ""));
            }
            int shown = Math.min(posts.length(), MAX_EACH);
            if (posts.length() > shown) box.setSummaryText((posts.length() - shown) + " more in Feeds");
            String line = count == 1 ? "A new post" : count + " new posts";
            Notification.Builder sum = builder(ctx).setSmallIcon(R.drawable.waypage_feed)
                .setContentTitle(feed.isEmpty() ? line : feed)
                .setContentText(line)
                .setStyle(box)
                .setGroup(url)
                .setGroupSummary(true)
                .setNumber(count)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true);
            if (!feed.isEmpty()) sum.setSubText(feed);
            PendingIntent tap = open(ctx, sumId, url, null, 0);
            if (tap != null) sum.setContentIntent(tap);
            nm.notify(TAG, sumId, sum.build());
        }
    }

    // One for every feed: how many, and from where.
    private static void together(Context ctx, NotificationManager nm, JSONObject waiting, Set<String> quiet) {
        int total = 0;
        List<String> names = new ArrayList<>();
        String only = null;
        for (Iterator<String> it = waiting.keys(); it.hasNext(); ) {
            String url = it.next();
            JSONObject w = waiting.optJSONObject(url);
            if (w == null || w.optInt("count", 0) <= 0 || quiet.contains(url)) continue;
            total += w.optInt("count", 0);
            only = only == null ? url : "";
            String t = w.optString("title", "");
            if (!t.isEmpty()) names.add(t);
        }
        if (total == 0) return;
        String title = (total == 1 ? "A new post" : total + " new posts") + (names.size() == 1 ? " from " + names.get(0) : "");
        String text = names.size() == 1 ? (total == 1 ? "Tap to see it in Feeds." : "Tap to see them in Feeds.")
            : names.size() == 2 ? "From " + names.get(0) + " and " + names.get(1) + "."
            : names.size() > 2 ? "From " + names.get(0) + ", " + names.get(1) + " and " + (names.size() - 2) + " more." : "In your feeds.";
        Notification.Builder b = builder(ctx);
        PendingIntent tap = open(ctx, 3, only != null && !only.isEmpty() ? only : null, null, 0);
        if (tap != null) b.setContentIntent(tap);
        nm.notify(NOTE, b.setSmallIcon(R.drawable.waypage_feed)
            .setContentTitle(title)
            .setContentText(text)
            .setNumber(total)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build());
    }

    static void clear(Context ctx) {
        ctx.getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove("waiting").commit();
        Widgets.refresh(ctx);
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        nm.cancel(NOTE);
        try {
            for (StatusBarNotification n : nm.getActiveNotifications()) if (TAG.equals(n.getTag())) nm.cancel(TAG, n.getId());
        } catch (Exception e) { /* nothing showing */ }
    }

    // ---- Files ----

    private static String agent;

    // The WebView's own string with the app named, as src/platform.js sends.
    private static String userAgent(Context ctx) {
        if (agent == null) {
            String base = "";
            try { base = WebSettings.getDefaultUserAgent(ctx) + " "; } catch (Exception e) { /* no WebView */ }
            agent = base + "Waypage (offline reader; https://github.com/danielnoam/waypage)";
        }
        return agent;
    }

    private static byte[] readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        for (int n; (n = in.read(buf)) > 0; ) {
            out.write(buf, 0, n);
            if (out.size() > max) throw new Exception("too big");
        }
        return out.toByteArray();
    }

    @SuppressWarnings("unchecked")
    static <T> T readJson(File f, T fallback) {
        if (!f.exists()) return fallback;
        try (FileInputStream in = new FileInputStream(f)) {
            String s = new String(readAll(in, MAX_BYTES), StandardCharsets.UTF_8);
            return (T) (fallback instanceof JSONArray ? new JSONArray(s) : new JSONObject(s));
        } catch (Exception e) { return fallback; }
    }

    static void writeJson(File f, String s) throws Exception {
        File tmp = new File(f.getPath() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(s.getBytes(StandardCharsets.UTF_8)); }
        if (!tmp.renameTo(f)) throw new Exception("rename");
    }
}
