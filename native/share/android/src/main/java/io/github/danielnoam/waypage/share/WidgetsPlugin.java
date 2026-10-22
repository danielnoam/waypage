package io.github.danielnoam.waypage.share;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Home screen widgets (src/app.js, 0.29.0), drawn by Widgets:
 *
 *   update({ reading: { id, title, meta, at } | null,
 *            feeds: { following, fresh, posts: [{ title, site, url }] } })
 *   renamed({ from, to })   a collection widget follows a renamed collection
 *   take()    { kind: "page" | "mark" | "post" | "feeds" | "library" | "favourites" | "collection" | "reading", id, mark, url, name, aloud } once,
 *             what a widget's tap asked to open, or {}; the app icon's
 *             shortcuts (1.14.0) add "reading", "search" and "paste"
 *   copied()  { text }, what's on the clipboard, for Save the copied link
 *
 * and an "open" event when a tap brings the running app back.
 */
@CapacitorPlugin(name = "Widgets")
public class WidgetsPlugin extends Plugin {

    private JSObject pending;

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
        if (intent == null || !Widgets.OPEN.equals(intent.getAction()) || intent.getData() == null) return false;
        Uri u = intent.getData();
        JSObject out = new JSObject();
        String kind = u.getHost() == null ? "" : u.getHost();
        out.put("kind", kind);
        if ((kind.equals("page") || kind.equals("mark")) && u.getLastPathSegment() != null) out.put("id", u.getLastPathSegment());
        if (kind.equals("mark")) out.put("mark", u.getQueryParameter("mark"));
        if (kind.equals("page") && "1".equals(u.getQueryParameter("aloud"))) out.put("aloud", true);
        if (kind.equals("page") && "1".equals(u.getQueryParameter("next"))) out.put("next", true);
        if (kind.equals("post")) out.put("url", u.getQueryParameter("url"));
        if (kind.equals("collection")) out.put("name", u.getQueryParameter("name"));
        pending = out;
        intent.setAction(Intent.ACTION_MAIN);
        intent.setData(null);
        return true;
    }

    @PluginMethod
    public void update(PluginCall call) {
        Widgets.save(getContext(), call.getData().toString());
        call.resolve();
    }

    @PluginMethod
    public void renamed(PluginCall call) {
        String from = call.getString("from", ""), to = call.getString("to", "");
        if (!from.isEmpty() && !to.isEmpty()) {
            Widgets.rename(getContext(), from, to);
            Widgets.refresh(getContext());
        }
        call.resolve();
    }

    // Android 10 and later hand the clipboard only to the app in front
    // with the focus; before that this is empty, and the page tries again.
    @PluginMethod
    public void copied(PluginCall call) {
        JSObject out = new JSObject();
        String text = "";
        try {
            ClipboardManager m = (ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE);
            ClipData c = m == null ? null : m.getPrimaryClip();
            if (c != null && c.getItemCount() > 0) {
                CharSequence t = c.getItemAt(0).coerceToText(getContext());
                if (t != null) text = t.toString();
            }
        } catch (Exception e) { /* none */ }
        out.put("text", text);
        call.resolve(out);
    }

    @PluginMethod
    public void take(PluginCall call) {
        JSObject out = pending != null ? pending : new JSObject();
        pending = null;
        call.resolve(out);
    }
}
