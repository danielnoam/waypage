package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.Window;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;

/**
 * A stylus's buttons and eraser end (1.57.0). A web page can't tell the
 * pen's side button from the pen touching: Chromium turns Android's
 * BUTTON_STYLUS_PRIMARY into the left mouse button. So, as a notes app
 * does, the touch and hover events are read here, before they reach the
 * page, and the page is told when the pen's state changes. Nothing is
 * consumed: the events go on to the WebView as they were.
 *
 *   watch({ on, raw })  look at the pen, or stop; raw also sends every event (Drawings' pen test)
 *   "pen"           { near, down, button, eraser, tool, buttons } when any of them changes
 *   "raw"           { k: "m", a, tools, b, p, c, n, src } for a MotionEvent (moves thinned out),
 *                   { k: "k", a, code, name } for a KeyEvent
 *
 * near: a stylus hovering or touching; down: touching; button: a stylus
 * button held; eraser: the eraser end, or a button held (the page erases
 * with it); tool: the MotionEvent tool type (2 stylus, 4 eraser); buttons:
 * the raw button state, for the readout in Drawings.
 */
@CapacitorPlugin(name = "Pen")
public class PenPlugin extends Plugin {
    private volatile boolean on;
    private volatile boolean raw;
    private boolean wrapped;
    private String rawKey = "";
    private long rawAt;
    private int rawSkipped;
    private boolean near, down, button, eraser;
    private int tool, buttons;

    @PluginMethod
    public void watch(PluginCall call) {
        on = call.getBoolean("on", false);
        raw = on && call.getBoolean("raw", false);
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
                if (on && args != null && args.length == 1 && args[0] instanceof MotionEvent) {
                    String name = m.getName();
                    if ("dispatchTouchEvent".equals(name) || "dispatchGenericMotionEvent".equals(name)) {
                        try { look((MotionEvent) args[0]); } catch (RuntimeException ignored) { /* the touch goes on */ }
                        if (raw) {
                            try { send((MotionEvent) args[0]); } catch (RuntimeException ignored) { /* as above */ }
                        }
                    }
                } else if (raw && args != null && args.length == 1 && args[0] instanceof KeyEvent && "dispatchKeyEvent".equals(m.getName())) {
                    try { send((KeyEvent) args[0]); } catch (RuntimeException ignored) { /* the key goes on */ }
                }
                try {
                    return m.invoke(inner, args);
                } catch (InvocationTargetException x) {
                    throw x.getCause();
                }
            }));
    }

    // The pen test's log (raw): each event as the phone made it. A run of
    // moves that change neither tool nor buttons is thinned to one in 50 ms.
    private void send(MotionEvent e) {
        StringBuilder tools = new StringBuilder();
        for (int i = 0; i < e.getPointerCount(); i++) {
            if (i > 0) tools.append(',');
            tools.append(e.getToolType(i));
        }
        String action = MotionEvent.actionToString(e.getActionMasked());
        int act = e.getActionMasked();
        boolean move = act == MotionEvent.ACTION_MOVE || act == MotionEvent.ACTION_HOVER_MOVE;
        String key = action + "|" + tools + "|" + e.getButtonState();
        long now = e.getEventTime();
        if (move && key.equals(rawKey) && now - rawAt < 50) { rawSkipped++; return; }
        rawKey = key;
        rawAt = now;
        JSObject o = new JSObject();
        o.put("k", "m");
        o.put("a", action);
        o.put("tools", tools.toString());
        o.put("b", e.getButtonState());
        o.put("p", e.getPressure());
        o.put("c", (e.getFlags() & 0x20) != 0);
        o.put("n", e.getPointerCount());
        o.put("src", e.getSource());
        o.put("skipped", rawSkipped);
        rawSkipped = 0;
        notifyListeners("raw", o);
    }

    private void send(KeyEvent e) {
        JSObject o = new JSObject();
        o.put("k", "k");
        o.put("a", e.getAction() == KeyEvent.ACTION_DOWN ? "down" : "up");
        o.put("code", e.getKeyCode());
        o.put("name", KeyEvent.keyCodeToString(e.getKeyCode()));
        notifyListeners("raw", o);
    }

    // The stylus in this event, if there is one, and what it's doing.
    private void look(MotionEvent e) {
        int at = -1;
        for (int i = 0; i < e.getPointerCount(); i++) {
            int t = e.getToolType(i);
            if (t == MotionEvent.TOOL_TYPE_STYLUS || t == MotionEvent.TOOL_TYPE_ERASER) { at = i; break; }
        }
        // A finger alone says nothing about the pen.
        if (at < 0) return;
        int action = e.getActionMasked();
        boolean gone = action == MotionEvent.ACTION_HOVER_EXIT || action == MotionEvent.ACTION_CANCEL;
        boolean touching = action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_MOVE || action == MotionEvent.ACTION_POINTER_DOWN;
        int t = e.getToolType(at);
        int b = gone ? 0 : e.getButtonState();
        boolean held = (b & (MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_STYLUS_SECONDARY | MotionEvent.BUTTON_SECONDARY)) != 0;
        boolean erase = !gone && (t == MotionEvent.TOOL_TYPE_ERASER || held);
        boolean n = !gone, d = touching && !gone;
        if (n == near && d == down && held == button && erase == eraser && t == tool && b == buttons) return;
        near = n; down = d; button = held; eraser = erase; tool = t; buttons = b;
        JSObject o = new JSObject();
        o.put("near", near);
        o.put("down", down);
        o.put("button", button);
        o.put("eraser", eraser);
        o.put("tool", tool);
        o.put("buttons", buttons);
        notifyListeners("pen", o);
    }

    @Override
    protected void handleOnDestroy() {
        on = false;
        raw = false;
    }
}
