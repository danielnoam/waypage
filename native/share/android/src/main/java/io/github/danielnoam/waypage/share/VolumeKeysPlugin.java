package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.view.KeyEvent;
import android.view.Window;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;

/**
 * Volume buttons turn pages (1.32.0). While the reader shows Pages and
 * the switch is on, the window's own key handling is wrapped so the two
 * volume buttons reach the page instead of the volume; off, they're the
 * volume again.
 *
 *   watch({ on })   take the volume buttons, or give them back
 *   "key"           { key: "up" | "down" } on each press
 */
@CapacitorPlugin(name = "VolumeKeys")
public class VolumeKeysPlugin extends Plugin {
    private volatile boolean on;
    private boolean wrapped;

    @PluginMethod
    public void watch(PluginCall call) {
        on = call.getBoolean("on", false);
        Activity a = getActivity();
        if (a == null || !on || wrapped) { call.resolve(); return; }
        a.runOnUiThread(() -> {
            if (!wrapped) wrap(a.getWindow());
            call.resolve();
        });
    }

    private void wrap(Window w) {
        final Window.Callback inner = w.getCallback();
        if (inner == null) return;
        wrapped = true;
        w.setCallback((Window.Callback) Proxy.newProxyInstance(Window.Callback.class.getClassLoader(),
            new Class<?>[] { Window.Callback.class }, (proxy, m, args) -> {
                if (on && "dispatchKeyEvent".equals(m.getName()) && args != null && args[0] instanceof KeyEvent) {
                    KeyEvent e = (KeyEvent) args[0];
                    int code = e.getKeyCode();
                    if (code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN) {
                        if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                            JSObject o = new JSObject();
                            o.put("key", code == KeyEvent.KEYCODE_VOLUME_UP ? "up" : "down");
                            notifyListeners("key", o);
                        }
                        return true;
                    }
                }
                try {
                    return m.invoke(inner, args);
                } catch (InvocationTargetException x) {
                    throw x.getCause();
                }
            }));
    }

    @Override
    protected void handleOnDestroy() {
        on = false;
    }
}
