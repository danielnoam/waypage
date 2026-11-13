package io.github.danielnoam.waypage.share;

import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.media.browse.MediaBrowser;
import android.os.Build;
import android.os.Bundle;
import android.os.Process;
import android.service.media.MediaBrowserService;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * What Android Auto opens (2026-11): Continue, Audiobooks and Up next to
 * pick from, and the one session both players share (Car). Only the car,
 * the Assistant, Bluetooth and the phone itself may look: the list holds
 * the titles of what you read.
 */
public class CarService extends MediaBrowserService {

    // Android Auto's content style keys (androidx.media's MediaConstants).
    static final String STYLE_SUPPORTED = "android.media.browse.CONTENT_STYLE_SUPPORTED";
    static final String STYLE_BROWSABLE = "android.media.browse.CONTENT_STYLE_BROWSABLE_HINT";
    static final String STYLE_PLAYABLE = "android.media.browse.CONTENT_STYLE_PLAYABLE_HINT";
    static final String COMPLETION = "android.media.extra.PLAYBACK_STATUS";
    static final String PERCENTAGE = "androidx.media.MediaItem.Extras.COMPLETION_PERCENTAGE";
    static final int STYLE_LIST = 1, STYLE_GRID = 2;

    private static final List<String> CARS = Arrays.asList(
        "com.google.android.projection.gearhead",
        "com.google.android.carassistant",
        "com.google.android.googlequicksearchbox",
        "com.google.android.autosimulator",
        "com.android.car.media",
        "com.android.bluetooth",
        "com.android.systemui");

    @Override
    public void onCreate() {
        super.onCreate();
        setSessionToken(Car.session(this).getSessionToken());
    }

    @Override
    public BrowserRoot onGetRoot(String client, int uid, Bundle hints) {
        if (!allowed(client, uid)) return null;
        // The phone's own media controls, after a restart: the one to go on with.
        if (hints != null && hints.getBoolean(BrowserRoot.EXTRA_RECENT)) {
            return Car.children(this, Car.RECENT).isEmpty() ? null : new BrowserRoot(Car.RECENT, null);
        }
        Bundle extras = new Bundle();
        extras.putBoolean(STYLE_SUPPORTED, true);
        extras.putInt(STYLE_BROWSABLE, STYLE_LIST);
        extras.putInt(STYLE_PLAYABLE, STYLE_LIST);
        return new BrowserRoot(Car.ROOT, extras);
    }

    // A known car or system app, checked by its uid, and either part of
    // the phone's system or installed from the Play Store.
    private boolean allowed(String client, int uid) {
        if (uid == Process.myUid() || uid == Process.SYSTEM_UID) return true;
        if (!CARS.contains(client)) return false;
        PackageManager pm = getPackageManager();
        String[] owns = pm.getPackagesForUid(uid);
        if (owns == null || !Arrays.asList(owns).contains(client)) return false;
        try {
            ApplicationInfo ai = pm.getApplicationInfo(client, 0);
            if ((ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0) return true;
            String from = Build.VERSION.SDK_INT >= 30 ? pm.getInstallSourceInfo(client).getInstallingPackageName() : installer(pm, client);
            return "com.android.vending".equals(from);
        } catch (Exception e) {
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static String installer(PackageManager pm, String pkg) { return pm.getInstallerPackageName(pkg); }

    @Override
    public void onLoadChildren(String parent, Result<List<MediaBrowser.MediaItem>> result) {
        result.sendResult(new ArrayList<>(Car.children(this, parent)));
    }
}
