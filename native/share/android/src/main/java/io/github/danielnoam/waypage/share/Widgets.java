package io.github.danielnoam.waypage.share;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Iterator;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home screen widgets (0.29.0): Keep reading, Feeds, Favourites and one
 * collection. The app writes
 * what they show (WidgetsPlugin.update) and they only draw it; a tap opens
 * the app with an OPEN intent that names what to show, which the plugin
 * hands to the page.
 */
final class Widgets {

    static final String OPEN = "io.github.danielnoam.waypage.WIDGET";
    static final String PREFS = "waypage-widgets";
    private static final int[] POSTS = { R.id.w_post0, R.id.w_post1, R.id.w_post2 };
    private static final int[] TITLES = { R.id.w_post0_title, R.id.w_post1_title, R.id.w_post2_title };
    private static final int[] SITES = { R.id.w_post0_site, R.id.w_post1_site, R.id.w_post2_site };
    private static final int[] FAVS = { R.id.w_fav0, R.id.w_fav1, R.id.w_fav2, R.id.w_fav3 };
    private static final int[] FAV_TITLES = { R.id.w_fav0_title, R.id.w_fav1_title, R.id.w_fav2_title, R.id.w_fav3_title };
    private static final int[] FAV_METAS = { R.id.w_fav0_meta, R.id.w_fav1_meta, R.id.w_fav2_meta, R.id.w_fav3_meta };

    private Widgets() {}

    static JSONObject data(Context ctx) {
        try { return new JSONObject(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("data", "{}")); }
        catch (Exception e) { return new JSONObject(); }
    }

    static void save(Context ctx, String json) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("data", json).apply();
        refresh(ctx);
    }

    static void refresh(Context ctx) {
        AppWidgetManager m = AppWidgetManager.getInstance(ctx);
        int[] reading = m.getAppWidgetIds(new ComponentName(ctx, ReadingWidget.class));
        for (int id : reading) m.updateAppWidget(id, reading(ctx, m, id));
        int[] feeds = m.getAppWidgetIds(new ComponentName(ctx, FeedsWidget.class));
        if (feeds.length > 0) m.updateAppWidget(feeds, feeds(ctx));
        int[] favs = m.getAppWidgetIds(new ComponentName(ctx, FavouritesWidget.class));
        if (favs.length > 0) m.updateAppWidget(favs, favourites(ctx));
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, CollectionWidget.class))) m.updateAppWidget(id, collection(ctx, id));
        int[] marks = m.getAppWidgetIds(new ComponentName(ctx, HighlightWidget.class));
        if (marks.length > 0) m.updateAppWidget(marks, highlight(ctx));
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, StatsWeekWidget.class))) m.updateAppWidget(id, statsWeek(ctx, m, id));
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, StatsTodayWidget.class))) m.updateAppWidget(id, statsToday(ctx, m, id));
        for (int id : m.getAppWidgetIds(new ComponentName(ctx, StatsRunWidget.class))) m.updateAppWidget(id, statsRun(ctx, m, id));
    }

    // `what` goes in the intent's address so each tap is its own
    // PendingIntent: waypage-widget://page/<id>, …/post?url=…, …/feeds.
    private static PendingIntent open(Context ctx, int code, Uri what) {
        Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        if (i == null) return null;
        i.setAction(OPEN);
        i.setData(what);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        return PendingIntent.getActivity(ctx, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // Keep reading shrinks to one row (0.29.1): Android 12 and later pick
    // the layout for the size themselves; before that, it is picked from
    // the size the widget was given, which is the height in portrait.
    static RemoteViews reading(Context ctx, AppWidgetManager m, int id) {
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> sizes = new HashMap<>();
            sizes.put(new SizeF(110f, 40f), reading(ctx, R.layout.waypage_widget_reading_small));
            sizes.put(new SizeF(110f, 100f), reading(ctx, R.layout.waypage_widget_reading));
            return new RemoteViews(sizes);
        }
        Bundle o = m.getAppWidgetOptions(id);
        int h = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return reading(ctx, h > 0 && h < 100 ? R.layout.waypage_widget_reading_small : R.layout.waypage_widget_reading);
    }

    private static RemoteViews reading(Context ctx, int layout) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        JSONObject r = data(ctx).optJSONObject("reading");
        if (r == null || r.optString("id", "").isEmpty()) {
            v.setTextViewText(R.id.w_title, "Nothing open yet");
            v.setTextViewText(R.id.w_meta, "Save a clip, and it waits here.");
            v.setViewVisibility(R.id.w_progress, View.GONE);
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, 10, Uri.parse("waypage-widget://library")));
            return v;
        }
        v.setTextViewText(R.id.w_title, r.optString("title", ""));
        v.setTextViewText(R.id.w_meta, r.optString("meta", ""));
        v.setViewVisibility(R.id.w_progress, View.VISIBLE);
        v.setProgressBar(R.id.w_progress, 1000, (int) Math.round(r.optDouble("at", 0) * 1000), false);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 11, Uri.parse("waypage-widget://page/" + Uri.encode(r.optString("id", "")))));
        return v;
    }

    static RemoteViews feeds(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.waypage_widget_feeds);
        JSONObject f = data(ctx).optJSONObject("feeds");
        JSONArray posts = f != null ? f.optJSONArray("posts") : null;
        int fresh = (f != null ? f.optInt("fresh", 0) : 0) + waiting(ctx);
        v.setTextViewText(R.id.w_fresh, fresh + " new");
        v.setViewVisibility(R.id.w_fresh, fresh > 0 ? View.VISIBLE : View.GONE);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 20, Uri.parse("waypage-widget://feeds")));
        int n = posts == null ? 0 : Math.min(posts.length(), POSTS.length);
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, f == null || !f.optBoolean("following", false) ? "Follow a site in Feeds, and its newest posts show here." : "No new posts.");
        for (int i = 0; i < POSTS.length; i++) {
            JSONObject p = i < n ? posts.optJSONObject(i) : null;
            if (p == null) { v.setViewVisibility(POSTS[i], View.GONE); continue; }
            v.setViewVisibility(POSTS[i], View.VISIBLE);
            v.setTextViewText(TITLES[i], p.optString("title", ""));
            v.setTextViewText(SITES[i], p.optString("site", ""));
            v.setOnClickPendingIntent(POSTS[i], open(ctx, 21 + i, Uri.parse("waypage-widget://post").buildUpon().appendQueryParameter("url", p.optString("url", "")).build()));
        }
        return v;
    }

    static RemoteViews favourites(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.waypage_widget_favourites);
        JSONArray list = data(ctx).optJSONArray("favourites");
        int n = list == null ? 0 : Math.min(list.length(), FAVS.length);
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 30, Uri.parse("waypage-widget://favourites")));
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, "Hold a clip in Waypage and tap Favourite, and it shows here.");
        for (int i = 0; i < FAVS.length; i++) {
            JSONObject p = i < n ? list.optJSONObject(i) : null;
            if (p == null) { v.setViewVisibility(FAVS[i], View.GONE); continue; }
            v.setViewVisibility(FAVS[i], View.VISIBLE);
            v.setTextViewText(FAV_TITLES[i], p.optString("title", ""));
            v.setTextViewText(FAV_METAS[i], p.optString("meta", ""));
            Uri what = p.optString("kind", "").equals("collection")
                ? collectionUri(p.optString("name", ""))
                : Uri.parse("waypage-widget://page/" + Uri.encode(p.optString("id", "")));
            v.setOnClickPendingIntent(FAVS[i], open(ctx, 31 + i, what));
        }
        return v;
    }

    // ---- A highlight a day (1.9.0) ----
    // The app hands over its highlights, latest first; the widget shows the
    // one for today's date, so it changes each day with the app closed (it
    // redraws every few hours). A tap opens the clip at the highlight.
    static RemoteViews highlight(Context ctx) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.waypage_widget_highlight);
        JSONArray list = data(ctx).optJSONArray("marks");
        int n = list == null ? 0 : list.length();
        if (n == 0) {
            v.setTextViewText(R.id.w_quote, "Select words in a clip and tap Highlight. One of your highlights shows here each day.");
            v.setViewVisibility(R.id.w_note, View.GONE);
            v.setViewVisibility(R.id.w_meta, View.GONE);
            v.setOnClickPendingIntent(R.id.w_root, open(ctx, 40, Uri.parse("waypage-widget://library")));
            return v;
        }
        long day = (System.currentTimeMillis() + java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis())) / 86400000L;
        JSONObject m = list.optJSONObject((int) (day % n));
        if (m == null) m = new JSONObject();
        v.setTextViewText(R.id.w_quote, "\u201C" + m.optString("text", "") + "\u201D");
        String note = m.optString("note", "");
        v.setViewVisibility(R.id.w_note, note.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.w_note, note);
        v.setViewVisibility(R.id.w_meta, View.VISIBLE);
        v.setTextViewText(R.id.w_meta, m.optString("title", ""));
        Uri what = Uri.parse("waypage-widget://mark/" + Uri.encode(m.optString("id", ""))).buildUpon()
            .appendQueryParameter("mark", m.optString("mark", "")).build();
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 41, what));
        return v;
    }

    // ---- One collection (0.35.0) ----
    // Each widget keeps the name of the collection picked for it
    // (CollectionPickActivity) under "collection.<id>"; the app hands over
    // every collection's next clips, and a rename in the app moves the name.

    private static Uri collectionUri(String name) {
        return Uri.parse("waypage-widget://collection").buildUpon().appendQueryParameter("name", name).build();
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static String picked(Context ctx, int id) {
        return prefs(ctx).getString("collection." + id, "");
    }

    static void pick(Context ctx, int id, String name) {
        prefs(ctx).edit().putString("collection." + id, name).apply();
        AppWidgetManager.getInstance(ctx).updateAppWidget(id, collection(ctx, id));
    }

    static void forget(Context ctx, int[] ids) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (int id : ids) e.remove("collection." + id);
        e.apply();
    }

    static void rename(Context ctx, String from, String to) {
        SharedPreferences.Editor e = prefs(ctx).edit();
        for (Map.Entry<String, ?> it : prefs(ctx).getAll().entrySet()) {
            if (it.getKey().startsWith("collection.") && from.equalsIgnoreCase(String.valueOf(it.getValue()))) e.putString(it.getKey(), to);
        }
        e.apply();
    }

    // The collections the app last handed over, by name.
    static JSONArray collections(Context ctx) {
        JSONArray all = data(ctx).optJSONArray("collections");
        return all != null ? all : new JSONArray();
    }

    private static JSONObject find(Context ctx, String name) {
        JSONArray all = collections(ctx);
        for (int i = 0; i < all.length(); i++) {
            JSONObject c = all.optJSONObject(i);
            if (c != null && name.equalsIgnoreCase(c.optString("name", ""))) return c;
        }
        return null;
    }

    static RemoteViews collection(Context ctx, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.waypage_widget_collection);
        String name = picked(ctx, id);
        JSONObject c = name.isEmpty() ? null : find(ctx, name);
        for (int row : FAVS) v.setViewVisibility(row, View.GONE);
        v.setViewVisibility(R.id.w_empty, View.VISIBLE);
        v.setViewVisibility(R.id.w_goRow, View.GONE);
        if (c == null) {
            v.setTextViewText(R.id.w_head, name.isEmpty() ? "Collection" : name);
            v.setTextViewText(R.id.w_empty, name.isEmpty() ? "Tap to pick a collection." : "This collection is gone. Tap to pick another.");
            Intent i = new Intent(ctx, CollectionPickActivity.class);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            i.setData(Uri.parse("waypage-widget://pick/" + id));
            v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(ctx, 1000 + id, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
            return v;
        }
        name = c.optString("name", name);
        v.setTextViewText(R.id.w_head, name + " · " + c.optString("meta", ""));
        v.setOnClickPendingIntent(R.id.w_root, open(ctx, 1000 + id, collectionUri(name)));
        // Start, Continue or Read again (1.2.1): the app names the button
        // and the clip it opens.
        String next = c.optString("next", "");
        String button = c.optString("button", "");
        if (!next.isEmpty() && !button.isEmpty()) {
            Uri page = Uri.parse("waypage-widget://page/" + Uri.encode(next));
            v.setViewVisibility(R.id.w_goRow, View.VISIBLE);
            v.setTextViewText(R.id.w_go, button);
            v.setOnClickPendingIntent(R.id.w_go, open(ctx, 200000 + id, page));
            // The same clip, read aloud from where it was left (1.25.0).
            v.setOnClickPendingIntent(R.id.w_aloud, open(ctx, 300000 + id, page.buildUpon().appendQueryParameter("aloud", "1").build()));
        }
        JSONArray clips = c.optJSONArray("clips");
        // Only the clip to read next, over the button (1.10.2).
        int n = clips == null ? 0 : Math.min(clips.length(), 1);
        v.setViewVisibility(R.id.w_empty, n == 0 ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_empty, "Nothing in it yet.");
        for (int i = 0; i < n; i++) {
            JSONObject p = clips.optJSONObject(i);
            if (p == null) continue;
            v.setViewVisibility(FAVS[i], View.VISIBLE);
            v.setTextViewText(FAV_TITLES[i], p.optString("title", ""));
            v.setTextViewText(FAV_METAS[i], p.optString("meta", ""));
            v.setOnClickPendingIntent(FAVS[i], open(ctx, 100000 + id * 4 + i, Uri.parse("waypage-widget://page/" + Uri.encode(p.optString("id", "")))));
        }
        return v;
    }

    // ---- Reading stats (1.39.0) ----
    // The app hands over this week's minutes a day and the lines to show,
    // for the day it wrote them; a widget drawn on a later day (the app
    // closed since) says nothing yet today, and past the week, nothing.

    private static String dayKey(long t) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t));
    }

    private static String yesterday() {
        Calendar c = Calendar.getInstance();
        c.add(Calendar.DAY_OF_YEAR, -1);
        return dayKey(c.getTimeInMillis());
    }

    private static PendingIntent toReading(Context ctx, int code) {
        return open(ctx, code, Uri.parse("waypage-widget://reading"));
    }

    static RemoteViews statsWeek(Context ctx, AppWidgetManager m, int id) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.waypage_widget_week);
        v.setOnClickPendingIntent(R.id.w_root, toReading(ctx, 50));
        JSONObject s = data(ctx).optJSONObject("stats");
        String today = dayKey(System.currentTimeMillis());
        JSONArray bars = s == null ? null : s.optJSONArray("bars");
        boolean fresh = s != null && today.compareTo(s.optString("weekTo", "")) <= 0;
        v.setTextViewText(R.id.w_title, fresh ? s.optString("week", "0 min") : "0 min");
        v.setTextViewText(R.id.w_meta, fresh ? s.optString("weekMeta", "") : "Open a clip, and your reading shows here.");
        Bundle o = m.getAppWidgetOptions(id);
        int wDp = o == null ? 0 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        float d = ctx.getResources().getDisplayMetrics().density;
        int w = Math.max(200, Math.min(1200, (int) ((wDp > 0 ? wDp - 32 : 220) * d)));
        int h = (int) (64 * d);
        v.setImageViewBitmap(R.id.w_bars, bars(ctx, fresh ? bars : null, w, h, d, today));
        return v;
    }

    // A bar a day, reading under read aloud, and the day's letter under it.
    private static Bitmap bars(Context ctx, JSONArray bars, int w, int h, float d, String today) {
        Bitmap b = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        int accent = ctx.getColor(R.color.waypage_w_accent), line = ctx.getColor(R.color.waypage_w_line);
        int muted = ctx.getColor(R.color.waypage_w_muted), ink = ctx.getColor(R.color.waypage_w_ink);
        int aloud = Color.rgb((Color.red(accent) * 4 + Color.red(line) * 6) / 10, (Color.green(accent) * 4 + Color.green(line) * 6) / 10, (Color.blue(accent) * 4 + Color.blue(line) * 6) / 10);
        Paint fill = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint text = new Paint(Paint.ANTI_ALIAS_FLAG);
        text.setTextSize(11 * d);
        text.setTextAlign(Paint.Align.CENTER);
        int n = bars == null || bars.length() == 0 ? 7 : bars.length();
        float labelH = 16 * d, gap = 6 * d, top = 2 * d;
        float bw = (w - gap * (n - 1)) / n, room = h - labelH - top;
        double max = 1;
        for (int i = 0; bars != null && i < bars.length(); i++) {
            JSONObject x = bars.optJSONObject(i);
            if (x != null) max = Math.max(max, x.optDouble("r", 0) + x.optDouble("a", 0));
        }
        float r = 3 * d;
        for (int i = 0; i < n; i++) {
            JSONObject x = bars == null ? null : bars.optJSONObject(i);
            float left = i * (bw + gap), base = top + room;
            double read = x == null ? 0 : x.optDouble("r", 0), heard = x == null ? 0 : x.optDouble("a", 0);
            float hr = read > 0 ? Math.max(2 * d, (float) (read / max * room)) : 0;
            float ha = heard > 0 ? Math.max(2 * d, (float) (heard / max * room)) : 0;
            if (hr + ha == 0) {
                fill.setColor(line);
                c.drawRoundRect(new RectF(left, base - 2 * d, left + bw, base), d, d, fill);
            }
            if (hr > 0) { fill.setColor(accent); c.drawRoundRect(new RectF(left, base - hr, left + bw, base), r, r, fill); }
            if (ha > 0) { fill.setColor(aloud); c.drawRoundRect(new RectF(left, base - hr - ha - (hr > 0 ? 2 * d : 0), left + bw, base - hr - (hr > 0 ? 2 * d : 0)), r, r, fill); }
            String label = x == null ? "" : x.optString("label", "");
            boolean now = x != null && today.equals(x.optString("day", ""));
            text.setColor(now ? ink : muted);
            text.setFakeBoldText(now);
            c.drawText(label, left + bw / 2, h - 3 * d, text);
        }
        return b;
    }

    private static RemoteViews figure(Context ctx, int code, String head, String title, String meta) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.waypage_widget_figure);
        v.setTextViewText(R.id.w_head, head);
        v.setTextViewText(R.id.w_title, title);
        v.setTextViewText(R.id.w_meta, meta);
        v.setOnClickPendingIntent(R.id.w_root, toReading(ctx, code));
        return v;
    }

    static RemoteViews statsToday(Context ctx, AppWidgetManager m, int id) {
        JSONObject s = data(ctx).optJSONObject("stats");
        boolean fresh = s != null && dayKey(System.currentTimeMillis()).equals(s.optString("day", ""));
        return figure(ctx, 51, "Today", fresh ? s.optString("today", "0 min") : "0 min", fresh ? s.optString("todayMeta", "") : "Nothing yet today");
    }

    static RemoteViews statsRun(Context ctx, AppWidgetManager m, int id) {
        JSONObject s = data(ctx).optJSONObject("stats");
        String day = s == null ? "" : s.optString("day", "");
        boolean today = dayKey(System.currentTimeMillis()).equals(day);
        // Written yesterday: the run still stands until today is over,
        // as long as yesterday was read.
        boolean fresh = s != null && (today || (yesterday().equals(day) && s.optBoolean("readToday", false)));
        return figure(ctx, 52, "In a row", fresh ? s.optString("run", "0 days") : "0 days", fresh ? s.optString("runMeta", "") : "Read a minute today to start");
    }

    // New posts the closed app's checks found (FeedCheckJob), not yet read.
    private static int waiting(Context ctx) {
        int n = 0;
        try {
            JSONObject w = new JSONObject(ctx.getSharedPreferences(FeedCheckJob.PREFS, Context.MODE_PRIVATE).getString("waiting", "{}"));
            for (Iterator<String> it = w.keys(); it.hasNext(); ) {
                JSONObject one = w.optJSONObject(it.next());
                if (one != null) n += one.optInt("count", 0);
            }
        } catch (Exception e) { /* none */ }
        return n;
    }
}
