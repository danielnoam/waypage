package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.view.Window;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The theme's colours before the page has drawn. The WebView's own
 * background is Capacitor's backgroundColor (Paper), so a dark theme
 * showed Paper from the splash until the page painted, and the bars'
 * icons followed the phone's dark mode rather than the theme. The page
 * hands its background here whenever the theme changes; the next start
 * paints the window and the WebView in it, and sets the bars' icons,
 * before the page loads (plugins load before the WebView's URL does).
 *
 *   set({ bg: "#0F1216", dark: true })
 */
@CapacitorPlugin(name = "Look")
public class LookPlugin extends Plugin {
    private static final String PREFS = "waypage.look";

    @Override
    public void load() {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, 0);
        if (!p.contains("bg")) return;
        apply(p.getInt("bg", Color.WHITE), p.getBoolean("dark", false));
    }

    @PluginMethod
    public void set(PluginCall call) {
        int bg;
        try {
            bg = Color.parseColor(call.getString("bg", ""));
        } catch (RuntimeException e) {
            call.reject("Not a colour");
            return;
        }
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getContext().getSharedPreferences(PREFS, 0).edit().putInt("bg", bg).putBoolean("dark", dark).apply();
        apply(bg, dark);
        call.resolve();
    }

    private void apply(int bg, boolean dark) {
        // Queued behind Capacitor's SystemBars, which sets the bars to the
        // phone's mode and the window to the app theme's colour as it loads.
        getBridge().executeOnMainThread(() -> {
            Activity a = getActivity();
            if (a == null) return;
            Window w = a.getWindow();
            w.setBackgroundDrawable(new ColorDrawable(bg));
            if (bridge != null && bridge.getWebView() != null) bridge.getWebView().setBackgroundColor(bg);
            WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(w, w.getDecorView());
            bars.setAppearanceLightStatusBars(!dark);
            bars.setAppearanceLightNavigationBars(!dark);
        });
    }
}
