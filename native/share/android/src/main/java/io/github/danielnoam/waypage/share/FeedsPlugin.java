package io.github.danielnoam.waypage.share;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Feeds checked with the app closed (src/app.js, 0.28.4), through
 * FeedCheckJob:
 *
 *   watch({ feeds: [{ url, title, known }], ask, notes })
 *                 the feeds to read and the posts the app has; none stops
 *                 the checks. `ask` asks to notify (Android 13), once a run.
 *                 `notes` is how to notify, see FeedCheckJob (1.30.0).
 *   news()        { feeds: [url], open, feed, save } once: the feeds with
 *                 new posts since, whether a notification opened the app,
 *                 the feed it was for and the post its Save asked for.
 *                 Takes the notifications away.
 *   allowed()     { allowed }: whether the phone lets Waypage notify.
 *   settings()    opens the phone's notification settings for Waypage.
 *
 * and an "open" event when a notification brings the running app back.
 */
@CapacitorPlugin(name = "Feeds")
public class FeedsPlugin extends Plugin {

    private boolean asked, opened;
    private String feed, save;

    @Override
    public void load() {
        read(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (read(intent)) notifyListeners("open", new JSObject());
    }

    private boolean read(Intent intent) {
        if (intent == null || !FeedCheckJob.OPEN.equals(intent.getAction())) return false;
        intent.setAction(Intent.ACTION_MAIN);
        opened = true;
        feed = intent.getStringExtra(FeedCheckJob.FEED);
        save = intent.getStringExtra(FeedCheckJob.SAVE);
        // A Save button doesn't take its notification away by itself.
        int note = intent.getIntExtra(FeedCheckJob.NOTE_ID, 0);
        if (save != null && note != 0) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            nm.cancel("waypage-feeds", note);
        }
        intent.removeExtra(FeedCheckJob.FEED);
        intent.removeExtra(FeedCheckJob.SAVE);
        intent.removeExtra(FeedCheckJob.NOTE_ID);
        return true;
    }

    @PluginMethod
    public void watch(PluginCall call) {
        JSArray feeds = call.getArray("feeds", new JSArray());
        try {
            FeedCheckJob.writeJson(new File(getContext().getFilesDir(), FeedCheckJob.WATCH), feeds.toString());
        } catch (Exception e) {
            call.reject("Couldn't keep the feeds");
            return;
        }
        JSObject notes = call.getObject("notes");
        if (notes != null) getContext().getSharedPreferences(FeedCheckJob.PREFS, Context.MODE_PRIVATE).edit().putString("notes", notes.toString()).apply();
        FeedCheckJob.schedule(getContext(), feeds.length() > 0);
        if (call.getBoolean("ask", false)) askToNotify();
        call.resolve();
    }

    @PluginMethod
    public void news(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(FeedCheckJob.PREFS, android.content.Context.MODE_PRIVATE);
        JSArray urls = new JSArray();
        try {
            JSONObject waiting = new JSONObject(prefs.getString("waiting", "{}"));
            for (Iterator<String> it = waiting.keys(); it.hasNext(); ) urls.put(it.next());
        } catch (Exception e) { /* nothing waiting */ }
        FeedCheckJob.clear(getContext());
        JSObject out = new JSObject();
        out.put("feeds", urls);
        out.put("open", opened);
        if (feed != null) out.put("feed", feed);
        if (save != null) out.put("save", save);
        opened = false;
        feed = save = null;
        call.resolve(out);
    }

    @PluginMethod
    public void allowed(PluginCall call) {
        NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        JSObject out = new JSObject();
        out.put("allowed", nm.areNotificationsEnabled());
        call.resolve(out);
    }

    @PluginMethod
    public void settings(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent i = Build.VERSION.SDK_INT >= 26
            ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + pkg));
        try {
            getContext().startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't open the phone's settings");
        }
    }

    private void askToNotify() {
        if (asked || Build.VERSION.SDK_INT < 33 || getActivity() == null) return;
        asked = true;
        String p = "android.permission.POST_NOTIFICATIONS";
        if (getContext().checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) getActivity().requestPermissions(new String[] { p }, 2710);
    }
}
