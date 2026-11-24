package io.github.danielnoam.waypage.share;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.JsonReader;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.StringReader;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * A page drawn in a WebView no one sees, for FeedCheckJob (2026-11) when a
 * site turns a plain request away (Cloudflare's "Just a moment"): the same
 * kind of WebView as PageRenderPlugin's, with no window, no bridge, no file
 * access, http(s) only and no pictures. Called off the main thread; it
 * waits there until the page's HTML stops changing and isn't a challenge
 * any more, or the time runs out.
 */
final class HiddenPage {

    private static final long POLL_MS = 1000;
    private static final String HTML = "document.documentElement.outerHTML";

    private HiddenPage() {}

    static String html(Context ctx, String url, long timeoutMs) {
        if (Looper.myLooper() == Looper.getMainLooper()) return null;
        Handler main = new Handler(Looper.getMainLooper());
        CountDownLatch done = new CountDownLatch(1);
        String[] out = new String[1];
        WebView[] held = new WebView[1];
        main.post(() -> {
            try { held[0] = start(ctx, url, main, out, done); }
            catch (Exception e) { done.countDown(); }
        });
        try { done.await(timeoutMs, TimeUnit.MILLISECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        CountDownLatch gone = new CountDownLatch(1);
        main.post(() -> {
            main.removeCallbacksAndMessages(null);
            WebView web = held[0];
            if (web != null) { web.stopLoading(); web.destroy(); }
            gone.countDown();
        });
        try { gone.await(5, TimeUnit.SECONDS); } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        synchronized (out) { return out[0]; }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private static WebView start(Context ctx, String url, Handler main, String[] out, CountDownLatch done) {
        WebView web = new WebView(ctx);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setBlockNetworkImage(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        web.layout(0, 0, 1080, 1920);
        int[] last = { -1 };
        Runnable[] poll = new Runnable[1];
        poll[0] = () -> web.evaluateJavascript(HTML, (v) -> {
            String html = decode(v);
            int n = html == null ? 0 : html.length();
            if (html != null && !FeedCheckJob.challenged(html) && n > 0 && n == last[0]) {
                synchronized (out) { out[0] = html; }
                done.countDown();
                return;
            }
            last[0] = n;
            main.postDelayed(poll[0], POLL_MS);
        });
        web.setWebViewClient(new WebViewClient() {
            boolean polling;

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                String scheme = req.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme));
            }

            @Override
            public void onPageFinished(WebView view, String finished) {
                if (polling) return;
                polling = true;
                main.postDelayed(poll[0], POLL_MS);
            }
        });
        web.loadUrl(url);
        return web;
    }

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
