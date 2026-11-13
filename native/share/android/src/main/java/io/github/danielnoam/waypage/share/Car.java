package io.github.danielnoam.waypage.share;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaDescription;
import android.media.MediaMetadata;
import android.media.browse.MediaBrowser;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Bundle;
import android.util.LruCache;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Android Auto (2026-11). One media session for both players, so the car
 * sees one app whichever plays; what the car can start, written by the app
 * (CarPlugin) to car.json; and where a book or clip started from the car
 * got to, kept until the app reads it back (`places`).
 *
 * The car starts things with the app closed, so a book here carries its
 * parts as AudiobookPlugin gets them and a clip its paragraphs already cut
 * as Narrate cuts them (app-reader.js `pieces`).
 */
final class Car {
    private Car() {}

    interface Player {
        void play();
        void pause();
        void next();
        void prev();
        void forward();
        void rewind();
        void seekTo(long ms);
        void stop();
        void custom(String action);
        void toQueueItem(long id);
    }

    static final String ROOT = "root", RECENT = "recent", CONTINUE = "continue", BOOKS = "books", CLIPS = "clips";
    static final String BOOK = "b:", CLIP = "c:";
    // What both players add to their own: what the car may ask for.
    static final long ACTIONS = PlaybackState.ACTION_PLAY_FROM_MEDIA_ID | PlaybackState.ACTION_PLAY_FROM_SEARCH
        | PlaybackState.ACTION_PREPARE_FROM_MEDIA_ID | PlaybackState.ACTION_PREPARE_FROM_SEARCH;
    private static final String FILE = "car.json", PLACES = "waypage-car-places";

    static volatile Player player;
    private static MediaSession session;
    private static Context app;
    private static JSONObject catalog;
    private static final LruCache<String, Bitmap> art = new LruCache<String, Bitmap>(6 * 1024 * 1024) {
        @Override protected int sizeOf(String k, Bitmap b) { return b.getByteCount(); }
    };

    static synchronized MediaSession session(Context ctx) {
        if (session != null) return session;
        app = ctx.getApplicationContext();
        session = new MediaSession(app, "Waypage");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { Player p = player; if (p != null) p.play(); else playFirst(); }
            @Override public void onPause() { Player p = player; if (p != null) p.pause(); }
            @Override public void onSkipToNext() { Player p = player; if (p != null) p.next(); }
            @Override public void onSkipToPrevious() { Player p = player; if (p != null) p.prev(); }
            @Override public void onFastForward() { Player p = player; if (p != null) p.forward(); }
            @Override public void onRewind() { Player p = player; if (p != null) p.rewind(); }
            @Override public void onSeekTo(long pos) { Player p = player; if (p != null) p.seekTo(pos); }
            @Override public void onStop() { Player p = player; if (p != null) p.stop(); }
            @Override public void onSkipToQueueItem(long id) { Player p = player; if (p != null) p.toQueueItem(id); }
            @Override public void onCustomAction(String action, Bundle extras) { Player p = player; if (p != null) p.custom(action); }
            @Override public void onPlayFromMediaId(String id, Bundle extras) { playId(id); }
            @Override public void onPrepareFromMediaId(String id, Bundle extras) { playId(id); }
            @Override public void onPlayFromSearch(String query, Bundle extras) { playSearch(query); }
            @Override public void onPrepareFromSearch(String query, Bundle extras) { playSearch(query); }
        });
        idleState();
        return session;
    }

    // Nothing playing: the car's Play starts the first thing under Continue.
    private static void idleState() {
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | ACTIONS)
            .setState(PlaybackState.STATE_STOPPED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0f)
            .build());
    }

    static void playing(Player p) { player = p; }

    // A player stopped. The session stays for the car to start the next.
    static synchronized void idle(Player p) {
        if (player != p) return;
        player = null;
        if (session == null) return;
        session.setQueue(null);
        idleState();
        session.setActive(false);
    }

    // ---- What the car can start (car.json)

    static synchronized void write(Context ctx, String json) throws Exception {
        File f = new File(ctx.getFilesDir(), FILE), tmp = new File(ctx.getFilesDir(), FILE + ".tmp");
        Files.write(tmp.toPath(), json.getBytes(StandardCharsets.UTF_8));
        if (!tmp.renameTo(f)) throw new Exception("Couldn't keep the car's list");
        catalog = new JSONObject(json);
    }

    private static synchronized JSONObject catalog(Context ctx) {
        if (catalog != null) return catalog;
        try {
            File f = new File(ctx.getFilesDir(), FILE);
            catalog = f.exists() ? new JSONObject(new String(Files.readAllBytes(f.toPath()), StandardCharsets.UTF_8)) : new JSONObject();
        } catch (Exception e) {
            catalog = new JSONObject();
        }
        return catalog;
    }

    private static JSONArray list(Context ctx, String name) {
        JSONArray a = catalog(ctx).optJSONArray(name);
        return a == null ? new JSONArray() : a;
    }

    private static JSONObject find(Context ctx, String mediaId) {
        boolean book = mediaId.startsWith(BOOK);
        if (!book && !mediaId.startsWith(CLIP)) return null;
        String id = mediaId.substring(2);
        JSONArray a = list(ctx, book ? BOOKS : CLIPS);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && id.equals(o.optString("id"))) return o;
        }
        return null;
    }

    static List<MediaBrowser.MediaItem> children(Context ctx, String parent) {
        List<MediaBrowser.MediaItem> out = new ArrayList<>();
        if (ROOT.equals(parent)) {
            if (catalog(ctx).optBoolean("locked")) return out;
            if (list(ctx, CONTINUE).length() > 0) out.add(folder(CONTINUE, "Continue"));
            if (list(ctx, BOOKS).length() > 0) out.add(folder(BOOKS, "Audiobooks"));
            if (list(ctx, CLIPS).length() > 0) out.add(folder(CLIPS, "Up next"));
            return out;
        }
        if (CONTINUE.equals(parent) || RECENT.equals(parent)) {
            if (catalog(ctx).optBoolean("locked")) return out;
            JSONArray ids = list(ctx, CONTINUE);
            for (int i = 0; i < ids.length() && (out.isEmpty() || !RECENT.equals(parent)); i++) {
                String id = ids.optString(i);
                JSONObject o = find(ctx, id);
                if (o != null) out.add(item(ctx, id, o));
            }
            return out;
        }
        boolean book = BOOKS.equals(parent);
        if ((!book && !CLIPS.equals(parent)) || catalog(ctx).optBoolean("locked")) return out;
        JSONArray a = list(ctx, parent);
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null) out.add(item(ctx, (book ? BOOK : CLIP) + o.optString("id"), o));
        }
        return out;
    }

    // Voice search ("play … on Waypage"): every word of the ask in the
    // title or byline, audiobooks first.
    static List<MediaBrowser.MediaItem> search(Context ctx, String query) {
        List<MediaBrowser.MediaItem> out = new ArrayList<>();
        if (catalog(ctx).optBoolean("locked")) return out;
        String[] words = fold(query).split("\\s+");
        for (String kind : new String[] { BOOKS, CLIPS }) {
            JSONArray a = list(ctx, kind);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                String hay = fold(o.optString("title") + " " + o.optString("by"));
                boolean all = true;
                for (String w : words) if (!w.isEmpty() && !hay.contains(w)) { all = false; break; }
                if (all) out.add(item(ctx, (BOOKS.equals(kind) ? BOOK : CLIP) + o.optString("id"), o));
            }
        }
        return out;
    }

    private static String fold(String s) {
        String n = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}+", "");
        return n.toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}\\s]+", " ").trim();
    }

    private static MediaBrowser.MediaItem folder(String id, String title) {
        Bundle extras = new Bundle();
        extras.putInt(CarService.STYLE_PLAYABLE, CarService.STYLE_LIST);
        return new MediaBrowser.MediaItem(new MediaDescription.Builder().setMediaId(id).setTitle(title).setExtras(extras).build(),
            MediaBrowser.MediaItem.FLAG_BROWSABLE);
    }

    private static MediaBrowser.MediaItem item(Context ctx, String mediaId, JSONObject o) {
        MediaDescription.Builder d = new MediaDescription.Builder()
            .setMediaId(mediaId)
            .setTitle(o.optString("title"))
            .setSubtitle(o.optString("by"));
        Bitmap b = art(ctx, o.optString("cover"), 160);
        if (b != null) d.setIconBitmap(b);
        double done = o.optDouble("done", 0);
        if (done > 0) {
            Bundle extras = new Bundle();
            extras.putInt(CarService.COMPLETION, done >= 0.99 ? 2 : 1);
            if (done < 0.99) extras.putDouble(CarService.PERCENTAGE, done);
            d.setExtras(extras);
        }
        return new MediaBrowser.MediaItem(d.build(), MediaBrowser.MediaItem.FLAG_PLAYABLE);
    }

    // ---- Starting from the car

    private static void playFirst() {
        Context ctx = app;
        if (ctx == null) return;
        JSONArray ids = list(ctx, CONTINUE);
        if (ids.length() > 0) playId(ids.optString(0));
    }

    private static void playSearch(String query) {
        Context ctx = app;
        if (ctx == null) return;
        if (query == null || query.trim().isEmpty()) { playFirst(); return; }
        List<MediaBrowser.MediaItem> got = search(ctx, query);
        if (!got.isEmpty()) playId(got.get(0).getMediaId());
    }

    static void playId(String mediaId) {
        Context ctx = app;
        if (ctx == null || mediaId == null) return;
        JSONObject o = find(ctx, mediaId);
        if (o == null) return;
        if (mediaId.startsWith(BOOK)) playBook(ctx, o);
        else playClip(ctx, o, true);
    }

    private static void playBook(Context ctx, JSONObject o) {
        if (SpeechService.running != null) SpeechService.send(ctx, SpeechService.STOP, null, null);
        AudiobookService.Job j = new AudiobookService.Job();
        JSONArray parts = o.optJSONArray("parts");
        if (parts == null || parts.length() == 0) return;
        j.parts = new AudiobookService.Part[parts.length()];
        for (int i = 0; i < parts.length(); i++) {
            JSONObject p = parts.optJSONObject(i);
            AudiobookService.Part part = new AudiobookService.Part();
            part.uri = p == null ? "" : p.optString("uri");
            part.offset = p == null ? -1 : p.optLong("offset", -1);
            part.length = p == null ? -1 : p.optLong("length", -1);
            j.parts[i] = part;
        }
        j.key = o.optString("id");
        j.title = o.optString("title");
        j.subtitle = o.optString("by");
        j.cover = o.optString("cover");
        j.chapters = AudiobookService.chaptersFrom(o.optJSONArray("chapters"));
        j.rate = (float) o.optDouble("rate", 1);
        j.part = o.optInt("part", 0);
        j.pos = o.optLong("pos", 0);
        j.car = true;
        // Gone on since the app wrote the list: from there.
        JSONObject was = place(ctx, j.key);
        if (was != null && was.optLong("at") > o.optLong("at")) {
            j.part = was.optInt("part", j.part);
            j.pos = was.optLong("pos", j.pos);
        }
        // Back a little, to hear where it was.
        j.pos = Math.max(0, j.pos - 3000);
        AudiobookService.pending = j;
        AudiobookService.send(ctx, AudiobookService.PLAY, null, null);
    }

    private static void playClip(Context ctx, JSONObject o, boolean now) {
        SpeechService.Job j = clipJob(ctx, o);
        if (j == null) return;
        if (!now) {
            SpeechService.queued = j;
            return;
        }
        if (AudiobookService.running != null) AudiobookService.send(ctx, AudiobookService.STOP, null, null);
        SpeechService.pending = j;
        SpeechService.send(ctx, SpeechService.PLAY, null, null);
    }

    // The clip `step` from `key` under Up next; on from a clip that isn't
    // there (started in the app), the first of them.
    static SpeechService.Job neighbour(Context ctx, String key, int step) {
        JSONArray a = list(ctx, CLIPS);
        int at = -1;
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && key != null && key.equals(o.optString("id"))) { at = i; break; }
        }
        int to = at < 0 ? (step > 0 ? 0 : -1) : at + step;
        JSONObject o = to >= 0 && to < a.length() ? a.optJSONObject(to) : null;
        return o == null ? null : clipJob(ctx, o);
    }

    private static SpeechService.Job clipJob(Context ctx, JSONObject o) {
        JSONArray items = o.optJSONArray("items");
        if (items == null || items.length() == 0) return null;
        SpeechService.Job j = new SpeechService.Job();
        j.items = new String[items.length()];
        for (int i = 0; i < items.length(); i++) j.items[i] = items.optString(i, "");
        JSONArray blocks = o.optJSONArray("blocks");
        if (blocks != null && blocks.length() == items.length()) {
            j.blocks = new int[blocks.length()];
            for (int i = 0; i < blocks.length(); i++) j.blocks[i] = blocks.optInt(i, i);
        }
        j.key = o.optString("id");
        j.title = o.optString("title");
        j.subtitle = o.optString("by");
        j.album = o.optString("album");
        j.cover = o.optString("cover");
        j.lang = o.optString("lang");
        j.voice = o.optString("voice");
        j.engine = o.optString("engine");
        j.rate = (float) o.optDouble("rate", 1);
        j.mix = o.optBoolean("mix");
        j.volume = (float) o.optDouble("volume", 1);
        j.start = o.optInt("start", 0);
        j.car = true;
        JSONObject was = place(ctx, j.key);
        if (was != null && was.optLong("at") > o.optLong("at") && !was.optBoolean("done")) j.start = was.optInt("index", j.start);
        j.start = Math.max(0, Math.min(j.start, j.items.length - 1));
        return j;
    }

    // ---- Where things started from the car got to

    private static SharedPreferences places(Context ctx) {
        return ctx.getSharedPreferences(PLACES, Context.MODE_PRIVATE);
    }

    private static JSONObject place(Context ctx, String key) {
        try {
            String s = places(ctx).getString(key, null);
            return s == null ? null : new JSONObject(s);
        } catch (Exception e) {
            return null;
        }
    }

    static void heardBook(Context ctx, String key, int part, long pos, boolean done) {
        try {
            places(ctx).edit().putString(key, new JSONObject().put("kind", "book").put("part", part).put("pos", pos)
                .put("done", done).put("at", System.currentTimeMillis()).toString()).apply();
        } catch (Exception e) { /* not kept */ }
    }

    // `of` is how far through the clip's text, 0 to 1.
    static void heardClip(Context ctx, String key, int index, double of, boolean done) {
        try {
            places(ctx).edit().putString(key, new JSONObject().put("kind", "clip").put("index", index).put("of", of)
                .put("done", done).put("at", System.currentTimeMillis()).toString()).apply();
        } catch (Exception e) { /* not kept */ }
    }

    // A clip from the car started: the next under Up next waits behind
    // it, as Go on to the next clip does in the app.
    static void queueAfter(Context ctx, String key) {
        if (!catalog(ctx).optBoolean("goOn")) return;
        JSONArray a = list(ctx, CLIPS);
        for (int i = 0; i + 1 < a.length(); i++) {
            JSONObject o = a.optJSONObject(i);
            if (o != null && key.equals(o.optString("id"))) {
                JSONObject next = a.optJSONObject(i + 1);
                if (next != null) { SpeechService.queuedAfter = key; playClip(ctx, next, false); }
                return;
            }
        }
    }

    static String takePlaces(Context ctx) {
        SharedPreferences sp = places(ctx);
        JSONObject out = new JSONObject();
        for (java.util.Map.Entry<String, ?> e : sp.getAll().entrySet()) {
            try { out.put(e.getKey(), new JSONObject(String.valueOf(e.getValue()))); } catch (Exception x) { /* skipped */ }
        }
        sp.edit().clear().apply();
        return out.toString();
    }

    // ---- Covers

    // A cover the app drew, as the WebView's address of a file in the
    // app's own storage; nothing outside it is read.
    static Bitmap art(Context ctx, String url, int size) {
        if (url == null || url.isEmpty()) return null;
        String k = size + "|" + url;
        Bitmap hit = art.get(k);
        if (hit != null) return hit;
        try {
            int at = url.indexOf("/_capacitor_file_");
            if (at < 0) return null;
            String path = Uri.decode(url.substring(at + "/_capacitor_file_".length()).replaceAll("[?#].*$", ""));
            File f = new File(path).getCanonicalFile();
            String mine = ctx.getFilesDir().getParentFile().getCanonicalPath() + File.separator;
            File ext = ctx.getExternalFilesDir(null);
            String theirs = ext == null ? null : ext.getParentFile().getCanonicalPath() + File.separator;
            String p = f.getPath();
            if (!p.startsWith(mine) && (theirs == null || !p.startsWith(theirs))) return null;
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(p, o);
            int s = 1;
            while (o.outWidth / (s * 2) >= size && o.outHeight / (s * 2) >= size) s *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = s;
            Bitmap b = BitmapFactory.decodeFile(p, o);
            if (b == null) return null;
            float scale = Math.min(1f, (float) size / Math.max(b.getWidth(), b.getHeight()));
            if (scale < 1f) b = Bitmap.createScaledBitmap(b, Math.round(b.getWidth() * scale), Math.round(b.getHeight() * scale), true);
            art.put(k, b);
            return b;
        } catch (Exception e) {
            return null;
        }
    }

    static void putArt(Context ctx, MediaMetadata.Builder meta, String cover) {
        Bitmap b = art(ctx, cover, 480);
        if (b == null) return;
        meta.putBitmap(MediaMetadata.METADATA_KEY_ART, b);
        meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, b);
        meta.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, b);
    }
}
