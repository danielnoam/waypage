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
 *
 * The page runs in its own WebView, out of sight behind the app's: no
 * Capacitor bridge, no JavaScript interfaces, no file access, http(s) only,
 * no images. Only the HTML it ends up with comes back, and save.js turns that
 * into the same script-free copy as any other page.
 */
@CapacitorPlugin(name = "PageRender")
public class PageRenderPlugin extends Plugin {

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
        boolean scroll = call.getBoolean("scroll", false);
        String waitFor = call.getString("waitFor");
        new Handler(Looper.getMainLooper()).post(() -> new Job(call, url, timeout, scroll, waitFor).start());
    }

    private class Job {
        final PluginCall call;
        final String url;
        final long timeout;
        final boolean scroll;
        final String measure;
        final Handler main = new Handler(Looper.getMainLooper());
        WebView web;
        boolean done;
        boolean loaded;
        int lastLength = -1;
        int steady;
        int lastCount = -1;

        Job(PluginCall call, String url, long timeout, boolean scroll, String waitFor) {
            this.call = call;
            // The page's text length; with a selector, 0 until it matches.
            this.measure = waitFor == null || waitFor.isEmpty() ? TEXT_LENGTH
                : "(document.querySelector(" + JSONObject.quote(waitFor) + ") ? " + TEXT_LENGTH + " : 0)";
            this.url = url;
            this.timeout = timeout;
            this.scroll = scroll;
        }

        @SuppressLint("SetJavaScriptEnabled")
        void start() {
            ViewGroup root = getActivity().findViewById(android.R.id.content);
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
                    if (!loaded) {
                        loaded = true;
                        if (scroll) main.postDelayed(Job.this::step, POLL_MS);
                        else main.postDelayed(Job.this::poll, POLL_MS);
                    }
                }
            });
            // Behind the app's own WebView, so it never takes a touch.
            root.addView(web, 0, new FrameLayout.LayoutParams(root.getWidth() > 0 ? root.getWidth() : 1080,
                scroll ? SCROLL_HEIGHT : root.getHeight() > 0 ? root.getHeight() : 1920));
            main.postDelayed(this::take, timeout);
            web.loadUrl(url);
        }

        // Waits for the text to stop growing: most of these pages draw an
        // empty frame first, then fill it from a request of their own.
        void poll() {
            if (done) return;
            web.evaluateJavascript(measure, (v) -> {
                if (done) return;
                int n;
                try { n = Integer.parseInt(v.trim()); } catch (NumberFormatException e) { n = 0; }
                steady = n == lastLength ? steady + 1 : 0;
                lastLength = n;
                if (n >= MIN_TEXT && steady >= 2) take();
                else main.postDelayed(this::poll, POLL_MS);
            });
        }

        // Down a screen at a time; at the end, it waits for the pictures to
        // stop filling in (three steps the same), then takes the page.
        void step() {
            if (done) return;
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

        void take() {
            if (done) return;
            done = true;
            web.evaluateJavascript(OUTER_HTML, (v) -> {
                String html = decode(v);
                String at = web.getUrl();
                finish();
                if (html == null || html.isEmpty()) {
                    call.reject("The page didn't draw anything");
                    return;
                }
                JSObject out = new JSObject();
                out.put("html", html);
                out.put("url", at != null && Uri.parse(at).getScheme() != null ? at : url);
                call.resolve(out);
            });
        }

        void finish() {
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
