package io.github.danielnoam.waypage.share;

import android.annotation.SuppressLint;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.JsonReader;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.StringReader;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONObject;

/**
 * Pages that build themselves with JavaScript (src/save.js):
 *
 *   render({ url, timeoutMs })   { html, url } once the page has drawn its text
 *   render({ url, timeoutMs, scroll: true })   the same once it has also been
 *     scrolled to the end and its pictures stopped filling in (1.17.0), for
 *     comics that swap their pictures in as you scroll
 *   render({ url, timeoutMs, waitFor: "css selector" })   the same, but the
 *     text only counts once something matches the selector, for a list a
 *     page fetches after it has drawn its synopsis (comix.to's chapters)
 *   render({ url, timeoutMs, scroll: true, expect: "sel", ready: "sel" })   scrolled
 *     until every element matching `expect` (a chapter's picture slots) has a
 *     match of `ready` (the slot filled in): the page is taken then, not when
 *     the page merely stops changing. Answers `expected` and `ready`, the
 *     counts at the end, so a chapter cut short by the timeout can be told.
 *   render({ url, timeoutMs, collect: "js" })   the page's own pages walked by
 *     Waypage's script (comix.to's chapter list, 20 at a time): it runs every
 *     400 ms and answers JSON { done, n }; when done, `collected` is what it
 *     left in window.__wpOut. The script is save.js's own, never page text.
 *
 * With `id`, `collect` also tells the app how it stands, as a "progress" event
 * { id, n, at, last, count, final, wait, refused } whenever it changes, for a
 * progress bar.
 *
 * With `maxMs`, the time runs from the last progress (more text, slots
 * filled, rows collected) rather than from the start, up to maxMs. With
 * `retryMs`, a page that still shows nothing it waits for that long after
 * loading is loaded again (three times at most, the wait doubling: 5, 10,
 * 20 s): comix.to's firewall turns a request away now and then
 * ("captcha_required"), clears itself with a check of its own, and answers
 * a request sent again a few seconds later.
 *
 * The page runs in its own WebView, out of sight behind the app's: no
 * Capacitor bridge, no JavaScript interfaces, no file access, http(s) only,
 * no images. Only the HTML it ends up with comes back, and save.js turns that
 * into the same script-free copy as any other page.
 */
@CapacitorPlugin(name = "PageRender")
public class PageRenderPlugin extends Plugin {

    // The walks in progress, by the id the app gave them, so Stop can take
    // what one has read so far.
    private final Map<String, Job> jobs = new HashMap<>();

    private static final long POLL_MS = 700;
    private static final int MIN_TEXT = 500;
    private static final String TEXT_LENGTH = "(document.body ? document.body.innerText.length : 0)";
    private static final String OUTER_HTML = "document.documentElement.outerHTML";
    // One screen further down; "1:" at the end, then how many pictures
    // have a real address rather than a stand-in.
    private static final String SCROLL_STEP = "(function(){var h=document.documentElement,b=document.body;"
        + "var end=Math.max(h.scrollHeight,b?b.scrollHeight:0)-2,at=window.scrollY+innerHeight>=end;"
        + "if(!at)window.scrollBy(0,innerHeight);var n=0,im=document.images;"
        + "for(var i=0;i<im.length;i++){var s=im[i].getAttribute('src')||'';"
        + "if(s&&!/^data:/.test(s)&&!/transparen|blank|spacer|placeholder|loading|lazy|1x1/i.test(s))n++;}"
        + "return (at?'1:':'0:')+n;})()";
    private static final long SCROLL_MS = 250;
    private static final long COLLECT_MS = 400;
    private static final int MAX_RELOADS = 3;
    // A tall window, so a long chapter is a few dozen steps, not hundreds.
    private static final int SCROLL_HEIGHT = 4000;

    @PluginMethod
    public void render(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Not a web address");
            return;
        }
        long timeout = Math.max(5000, Math.min(60000, call.getData().optLong("timeoutMs", 20000L)));
        long max = Math.max(timeout, Math.min(300000, call.getData().optLong("maxMs", timeout)));
        long retry = Math.max(0, call.getData().optLong("retryMs", 0L));
        boolean scroll = call.getBoolean("scroll", false);
        String waitFor = call.getString("waitFor");
        String expect = call.getString("expect");
        String ready = call.getString("ready");
        String collect = call.getString("collect");
        String id = call.getString("id");
        new Handler(Looper.getMainLooper()).post(() -> {
            Job job = new Job(call, url, timeout, max, retry, scroll, waitFor, expect, ready, collect, id);
            if (id != null && !id.isEmpty()) jobs.put(id, job);
            job.start();
        });
    }

    // render's `id` given back: the walk ends now with what it has read.
    @PluginMethod
    public void cancel(PluginCall call) {
        String id = call.getString("id");
        new Handler(Looper.getMainLooper()).post(() -> {
            Job job = id == null ? null : jobs.get(id);
            if (job != null) job.take();
            call.resolve();
        });
    }

    private class Job {
        final PluginCall call;
        final String url;
        final long timeout;
        final long max;
        final long retry;
        final boolean scroll;
        final String measure;
        // With `expect` and `ready`: counts "slots:filled" instead of the
        // picture count, and the page is taken when they match.
        final String slots;
        final String collect;
        final String id;
        String told = "";
        int expected = -1;
        int filled = -1;
        int rows = -1;
        final Handler main = new Handler(Looper.getMainLooper());
        WebView web;
        boolean done;
        boolean loaded;
        int lastLength = -1;
        int steady;
        int lastCount = -1;
        long started;
        long loadedAt;
        long deadline;
        int reloads;

        Job(PluginCall call, String url, long timeout, long max, long retry, boolean scroll, String waitFor, String expect, String ready, String collect, String id) {
            this.call = call;
            this.id = id;
            this.slots = scroll && expect != null && !expect.isEmpty() && ready != null && !ready.isEmpty()
                ? "(function(){var s=document.querySelectorAll(" + JSONObject.quote(expect) + "),got=0,first=null;"
                    + "for(var i=0;i<s.length;i++){if(s[i].querySelector(" + JSONObject.quote(ready) + "))got++;else if(!first)first=s[i];}"
                    + "var h=document.documentElement,b=document.body,now=Date.now(),"
                    + "end=Math.max(h.scrollHeight,b?b.scrollHeight:0)-2,at=window.scrollY+innerHeight>=end;"
                    // At the end, or already waiting on an empty slot: stay on
                    // it (3 s) so the page fills it; otherwise two screens down
                    // (one skips nothing more and takes half the time).
                    + "if(first&&(at||window.__wpOn)){if(window.__wpOn!==first){window.__wpOn=first;window.__wpAt=now;}"
                    + "first.scrollIntoView();if(now-window.__wpAt>3000)window.__wpOn=null;}"
                    + "else{window.__wpOn=null;if(!at)window.scrollBy(0,innerHeight*2);}"
                    + "return s.length+':'+got;})()"
                : null;
            this.collect = collect == null || collect.isEmpty() ? null : collect;
            // The page's text length; with a selector, 0 until it matches.
            this.measure = waitFor == null || waitFor.isEmpty() ? TEXT_LENGTH
                : "(document.querySelector(" + JSONObject.quote(waitFor) + ") ? " + TEXT_LENGTH + " : 0)";
            this.url = url;
            this.timeout = timeout;
            this.max = max;
            this.retry = retry;
            this.scroll = scroll;
        }

        @SuppressLint("SetJavaScriptEnabled")
        void start() {
            // With the activity gone (swiped away from the recents) the page
            // is laid out on its own, windowless, as HiddenPage does.
            ViewGroup root = getActivity() != null ? getActivity().findViewById(android.R.id.content) : null;
            web = new WebView(getContext());
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(false);
            s.setAllowContentAccess(false);
            s.setBlockNetworkImage(true);
            s.setMediaPlaybackRequiresUserGesture(true);
            s.setSupportMultipleWindows(false);
            s.setJavaScriptCanOpenWindowsAutomatically(false);
            web.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);
            web.setFocusable(false);
            // All but invisible, behind the app: at 0 it isn't drawn, and a
            // page that isn't drawn never fills in what scrolls into view.
            web.setAlpha(0.01f);
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                    String scheme = req.getUrl().getScheme();
                    return !("https".equals(scheme) || "http".equals(scheme));
                }

                @Override
                public void onPageFinished(WebView view, String finished) {
                    loadedAt = System.currentTimeMillis();
                    if (!loaded) {
                        loaded = true;
                        if (collect != null) main.postDelayed(Job.this::collectStep, POLL_MS);
                        else if (scroll) main.postDelayed(Job.this::step, POLL_MS);
                        else main.postDelayed(Job.this::poll, POLL_MS);
                    }
                }
            });
            // Behind the app's own WebView, so it never takes a touch.
            if (root != null) {
                root.addView(web, 0, new FrameLayout.LayoutParams(root.getWidth() > 0 ? root.getWidth() : 1080,
                    scroll ? SCROLL_HEIGHT : root.getHeight() > 0 ? root.getHeight() : 1920));
            } else {
                web.layout(0, 0, 1080, scroll ? SCROLL_HEIGHT : 1920);
            }
            started = loadedAt = System.currentTimeMillis();
            deadline = started + timeout;
            // The longest it may take, whatever progress it makes.
            main.postDelayed(this::take, max);
            web.loadUrl(url);
        }

        // Progress moves the deadline on (with maxMs), never past maxMs.
        void moved() {
            deadline = Math.min(started + max, System.currentTimeMillis() + timeout);
        }

        boolean late() {
            return System.currentTimeMillis() >= deadline;
        }

        // Nothing it waits for yet, retryMs after the page loaded: load it again.
        boolean reloadIfStuck() {
            if (retry <= 0 || reloads >= MAX_RELOADS || System.currentTimeMillis() - loadedAt < (retry << reloads)) return false;
            reloads++;
            loadedAt = System.currentTimeMillis();
            moved();
            web.reload();
            return true;
        }

        // Waits for the text to stop growing: most of these pages draw an
        // empty frame first, then fill it from a request of their own.
        void poll() {
            if (done) return;
            if (late()) { take(); return; }
            web.evaluateJavascript(measure, (v) -> {
                if (done) return;
                int n;
                try { n = Integer.parseInt(v.trim()); } catch (NumberFormatException e) { n = 0; }
                if (n > lastLength) moved();
                steady = n == lastLength ? steady + 1 : 0;
                lastLength = n;
                if (n >= MIN_TEXT && steady >= 2) take();
                else {
                    if (n == 0) reloadIfStuck();
                    main.postDelayed(this::poll, POLL_MS);
                }
            });
        }

        // Down a screen at a time; at the end, it waits for the pictures to
        // stop filling in (three steps the same), then takes the page.
        void step() {
            if (done) return;
            if (slots != null) { stepSlots(); return; }
            if (late()) { take(); return; }
            web.evaluateJavascript(SCROLL_STEP, (v) -> {
                if (done) return;
                String r = decode(v);
                boolean end = r != null && r.startsWith("1:");
                int n;
                try { n = Integer.parseInt(r == null ? "0" : r.substring(2)); } catch (Exception e) { n = 0; }
                steady = end && n == lastCount ? steady + 1 : 0;
                lastCount = n;
                if (steady >= 3) take();
                else main.postDelayed(this::step, SCROLL_MS);
            });
        }

        // A chapter's pictures arrive only for the slots the scroll has
        // reached, and the slots appear after the page's own request. A
        // scroll can jump past some of them, so at the end it goes back to
        // the first empty slot and waits on it. Nothing is taken while there
        // are no slots, or any is empty; two steps with every slot filled
        // and none more, then the page. The timeout takes whatever there is,
        // and says how many were missing.
        void stepSlots() {
            if (late()) { take(); return; }
            web.evaluateJavascript(slots, (v) -> {
                if (done) return;
                String r = decode(v);
                int total = 0, got = 0;
                try {
                    String[] p = r.split(":");
                    total = Integer.parseInt(p[0]);
                    got = Integer.parseInt(p[1]);
                } catch (Exception e) { /* no slots yet */ }
                if (got > filled || total > expected) moved();
                expected = total;
                steady = total > 0 && got >= total && got == filled ? steady + 1 : 0;
                filled = got;
                if (steady >= 2) take();
                else {
                    if (total == 0) reloadIfStuck();
                    main.postDelayed(this::stepSlots, SCROLL_MS);
                }
            });
        }

        // Waypage's own script walks the page (comix.to's chapter list) and
        // says when it is done; more rows move the deadline on.
        void collectStep() {
            if (done) return;
            if (late()) { take(); return; }
            web.evaluateJavascript(collect, (v) -> {
                if (done) return;
                boolean over = false;
                int n = 0;
                try {
                    String raw = decode(v);
                    JSONObject o = new JSONObject(raw);
                    over = o.optBoolean("done", false);
                    n = o.optInt("n", 0);
                    if (id != null && !raw.equals(told)) {
                        told = raw;
                        JSObject ev = new JSObject();
                        ev.put("id", id);
                        ev.put("n", n);
                        ev.put("at", o.optInt("at", 0));
                        ev.put("last", o.optInt("last", 0));
                        ev.put("count", o.optInt("count", 0));
                        ev.put("final", o.optBoolean("final", false));
                        ev.put("wait", o.optInt("wait", 0));
                        ev.put("refused", o.optBoolean("refused", false));
                        notifyListeners("progress", ev);
                    }
                } catch (Exception e) { /* not started yet */ }
                if (n > rows) moved();
                if (n == 0 && rows <= 0) reloadIfStuck();
                rows = Math.max(rows, n);
                if (over) take();
                else main.postDelayed(this::collectStep, COLLECT_MS);
            });
        }

        void take() {
            if (done) return;
            done = true;
            web.evaluateJavascript(OUTER_HTML, (v) -> {
                String html = decode(v);
                String at = web.getUrl();
                if (collect == null) { answer(html, at, null); return; }
                web.evaluateJavascript("window.__wpOut || ''", (c) -> answer(html, at, decode(c)));
            });
        }

        void answer(String html, String at, String collected) {
            finish();
            if (html == null || html.isEmpty()) {
                call.reject("The page didn't draw anything");
                return;
            }
            JSObject out = new JSObject();
            out.put("html", html);
            if (slots != null) { out.put("expected", Math.max(expected, 0)); out.put("ready", Math.max(filled, 0)); }
            if (collect != null) out.put("collected", collected == null ? "" : collected);
            out.put("url", at != null && Uri.parse(at).getScheme() != null ? at : url);
            call.resolve(out);
        }

        void finish() {
            if (id != null) jobs.remove(id);
            main.removeCallbacksAndMessages(null);
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.stopLoading();
            web.destroy();
        }
    }

    // evaluateJavascript hands back the value as JSON: a quoted string here.
    private static String decode(String json) {
        if (json == null || "null".equals(json)) return null;
        try (JsonReader r = new JsonReader(new StringReader(json))) {
            r.setLenient(true);
            return r.nextString();
        } catch (Exception e) {
            return null;
        }
    }
}
