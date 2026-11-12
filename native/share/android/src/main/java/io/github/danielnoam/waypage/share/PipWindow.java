package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.app.PendingIntent;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.content.Context;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

/**
 * The one small window outside the app, shared by Narrate (SpeechService)
 * and audiobooks (AudiobookService). The app only says whether each may
 * use it (its switch is on and something is open); going home opens it
 * only while one of the two services is playing right now, checked here
 * against the service itself, so a pause, a stop the page never heard
 * about (another app took the sound, the service was ended) or a page
 * that reloaded can't leave it armed.
 */
final class PipWindow {
    private static final Handler main = new Handler(Looper.getMainLooper());
    private static WeakReference<Activity> activity = new WeakReference<>(null);
    private static boolean narrate, audiobook;
    private static String told = "";

    private PipWindow() {}

    static void attach(Activity a) {
        if (a == null || a == activity.get()) return;
        activity = new WeakReference<>(a);
        told = "";
    }

    static void narrate(Activity a, boolean on) { attach(a); narrate = on; refresh(); }

    static void audiobook(Activity a, boolean on) { attach(a); audiobook = on; refresh(); }

    /** Told again on every play, pause or stop of either service. */
    static void refresh() {
        if (Build.VERSION.SDK_INT < 31) return;
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post(PipWindow::refresh); return; }
        Activity a = activity.get();
        if (a == null || a.isFinishing()) return;
        String book = AudiobookService.stateOf();
        String read = SpeechService.stateOf();
        boolean bookPlays = "playing".equals(book) || "loading".equals(book);
        boolean readPlays = "playing".equals(read);
        boolean auto = (audiobook && bookPlays) || (narrate && readPlays);
        // The buttons are the audiobook's while one is open, else Narrate's.
        boolean forBook = audiobook && !"stopped".equals(book) && !(narrate && readPlays && !bookPlays);
        boolean playing = forBook ? bookPlays : readPlays;
        String want = auto + ":" + forBook + ":" + playing;
        if (want.equals(told)) return;
        try {
            a.setPictureInPictureParams(new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9))
                .setActions(forBook ? bookActions(a, playing) : readActions(a, playing))
                .setAutoEnterEnabled(auto)
                .build());
            told = want;
        } catch (Exception e) { /* no window on this phone */ }
    }

    private static List<RemoteAction> readActions(Context ctx, boolean playing) {
        List<RemoteAction> l = new ArrayList<>();
        l.add(action(ctx, SpeechService.class, android.R.drawable.ic_media_previous, "Previous paragraph", SpeechService.PREV, 21));
        l.add(playing ? action(ctx, SpeechService.class, android.R.drawable.ic_media_pause, "Pause", SpeechService.PAUSE, 22)
            : action(ctx, SpeechService.class, android.R.drawable.ic_media_play, "Play", SpeechService.RESUME, 22));
        l.add(action(ctx, SpeechService.class, android.R.drawable.ic_media_next, "Next paragraph", SpeechService.NEXT, 23));
        return l;
    }

    private static List<RemoteAction> bookActions(Context ctx, boolean playing) {
        List<RemoteAction> l = new ArrayList<>();
        l.add(action(ctx, AudiobookService.class, android.R.drawable.ic_media_rew, "Back", AudiobookService.BACK, 31));
        l.add(playing ? action(ctx, AudiobookService.class, android.R.drawable.ic_media_pause, "Pause", AudiobookService.PAUSE, 32)
            : action(ctx, AudiobookService.class, android.R.drawable.ic_media_play, "Play", AudiobookService.RESUME, 32));
        l.add(action(ctx, AudiobookService.class, android.R.drawable.ic_media_ff, "Forward", AudiobookService.ON, 33));
        return l;
    }

    private static RemoteAction action(Context ctx, Class<?> service, int icon, String label, String act, int code) {
        PendingIntent pi = PendingIntent.getService(ctx, code, new Intent(ctx, service).setAction(act), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        return new RemoteAction(Icon.createWithResource(ctx, icon), label, label, pi);
    }
}
