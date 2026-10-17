package io.github.danielnoam.waypage.share;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioTrack;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.Locale;

/**
 * Reads a page aloud with the screen off (0.27.0). A foreground service of
 * type mediaPlayback owns the TextToSpeech engine and the list of
 * paragraphs, so the reading goes on when the phone locks and the WebView
 * sleeps. Its notification, a media session, carries previous, play or
 * pause, next and stop, on the lock screen too.
 *
 * SpeechPlugin hands it a Job and gets each paragraph's start back through
 * the Listener; both run in the app's process, so nothing is parcelled.
 */
public class SpeechService extends Service {

    static final String PLAY = "play", PAUSE = "pause", RESUME = "resume", NEXT = "next", PREV = "prev", STOP = "stop", SEEK = "seek", RATE = "rate", SLEEP = "sleep";
    private static final String CHANNEL = "waypage-aloud";
    private static final int NOTE = 27;

    static class Job {
        String[] items;
        int start;
        String lang, voice, engine, title, subtitle, key, album;
        int[] blocks;
        int track, tracks;
        float rate = 1f;
    }

    interface Listener {
        void onProgress(String key, int index, String state);
    }

    static Job pending;
    // The clip to read when this one ends (1.23.0), queued by the app
    // while it's awake, so going on needs no WebView: put away, the app's
    // page can't draw the next clip to read it.
    static Job queued;
    static String queuedAfter;
    static Listener listener;
    static SpeechService running;

    private final Handler main = new Handler(Looper.getMainLooper());
    // The sleep timer (1.32.0): pauses where it got to, so it can go on.
    private final Runnable sleeper = this::pause;
    private TextToSpeech tts;
    private boolean ready;
    private String engine = "";
    private int ttsGen;
    private Job job;
    private int index;
    private int generation;
    private String state = "stopped";
    private MediaSession session;
    private PowerManager.WakeLock wake;
    private AudioManager audio;
    private AudioFocusRequest focus;
    // Paused by a call or another app's sound, to go on when it's over.
    private boolean pausedForFocus;

    static void send(Context ctx, String action, Integer value, Float rate) {
        Intent i = new Intent(ctx, SpeechService.class).setAction(action);
        if (value != null) i.putExtra("value", value.intValue());
        if (rate != null) i.putExtra("rate", rate.floatValue());
        if (PLAY.equals(action) && Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else if (running != null || PLAY.equals(action)) ctx.startService(i);
    }

    static String stateOf() { return running == null ? "stopped" : running.state; }
    static int indexOf() { return running == null ? -1 : running.index; }
    static String keyOf() { return running == null || running.job == null ? "" : running.job.key; }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        session = new MediaSession(this, "Waypage read aloud");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { step(1); }
            @Override public void onSkipToPrevious() { step(-1); }
            @Override public void onStop() { finish("stopped"); }
        });
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "waypage:aloud");
        wake.setReferenceCounted(false);
        makeTts(pending != null ? pending.engine : "");
    }

    // The speech engine picked in the app (1.33.0), or the phone's default
    // when none is; one that won't start falls back to the default.
    private void makeTts(String want) {
        final String e = want == null ? "" : want;
        if (tts != null && e.equals(engine)) return;
        if (tts != null) tts.shutdown();
        engine = e;
        ready = false;
        final int gen = ++ttsGen;
        TextToSpeech.OnInitListener done = (status) -> main.post(() -> {
            if (gen != ttsGen) return;
            if (status != TextToSpeech.SUCCESS) {
                if (!e.isEmpty()) { if (tts != null) tts.shutdown(); tts = null; makeTts(""); return; }
                tts = null;
                finish("error");
                return;
            }
            ready = true;
            tts.setAudioAttributes(attributes());
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) {}
                @Override public void onDone(String id) { main.post(() -> said(id)); }
                @Override public void onError(String id) { main.post(() -> said(id)); }
            });
            if (job != null && "playing".equals(state)) speakCurrent();
        });
        tts = e.isEmpty() ? new TextToSpeech(this, done) : new TextToSpeech(this, done, e);
    }

    private static AudioAttributes attributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (PLAY.equals(action)) {
            // Foreground first: Android stops a service that doesn't say so
            // within seconds of startForegroundService.
            job = pending;
            pending = null;
            if (job == null || job.items == null || job.items.length == 0) {
                foreground();
                finish("stopped");
                return START_NOT_STICKY;
            }
            index = Math.max(0, Math.min(job.start, job.items.length - 1));
            state = "playing";
            foreground();
            makeTts(job.engine);
            play();
        } else if (PAUSE.equals(action)) pause();
        else if (RESUME.equals(action)) resume();
        else if (NEXT.equals(action)) step(1);
        else if (PREV.equals(action)) step(-1);
        else if (SEEK.equals(action) && intent != null) move(intent.getIntExtra("value", index));
        else if (RATE.equals(action) && intent != null && job != null) {
            job.rate = intent.getFloatExtra("rate", job.rate);
            if ("playing".equals(state)) play();
        } else if (SLEEP.equals(action) && intent != null) {
            main.removeCallbacks(sleeper);
            int seconds = intent.getIntExtra("value", 0);
            if (seconds > 0) main.postDelayed(sleeper, seconds * 1000L);
        } else if (STOP.equals(action)) finish("stopped");
        return START_NOT_STICKY;
    }

    private void play() {
        state = "playing";
        if (!takeFocus()) {
            state = "paused";
            report();
            return;
        }
        wake.acquire(60 * 60 * 1000L);
        hushOn();
        speakCurrent();
    }

    private void speakCurrent() {
        if (!ready || job == null) return;
        generation++;
        applyVoice();
        tts.setSpeechRate(job.rate);
        String id = generation + ":" + index;
        String text = job.items[index];
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, id) != TextToSpeech.SUCCESS) {
            main.postDelayed(() -> said(id), 300);
        }
        // Some engines say nothing back for a piece they can't voice, which
        // left the reading stuck there: after well over its length, go on.
        long most = 8000 + (long) (text.length() * 160 / Math.max(0.5f, job.rate));
        main.postDelayed(() -> said(id), most);
        report();
    }

    private void applyVoice() {
        if (job.voice != null && !job.voice.isEmpty()) {
            try {
                for (Voice v : tts.getVoices()) {
                    if (v.getName().equals(job.voice)) {
                        tts.setVoice(v);
                        return;
                    }
                }
            } catch (Exception e) {
                // Falls back to the page's language.
            }
        }
        tts.setLanguage(job.lang != null && !job.lang.isEmpty() ? Locale.forLanguageTag(job.lang) : Locale.getDefault());
    }

    private void said(String id) {
        if (job == null || !id.equals(generation + ":" + index) || !"playing".equals(state)) return;
        if (index + 1 >= job.items.length) {
            Job next = queued;
            if (next != null && next.items != null && next.items.length > 0 && job.key != null && job.key.equals(queuedAfter)) {
                queued = null;
                queuedAfter = null;
                next.rate = job.rate;
                job = next;
                index = Math.max(0, Math.min(job.start, job.items.length - 1));
                speakCurrent();
                return;
            }
            finish("ended");
            return;
        }
        index++;
        speakCurrent();
    }

    private void pause() {
        if (!"playing".equals(state)) return;
        pausedForFocus = false;
        state = "paused";
        generation++;
        if (tts != null) tts.stop();
        if (wake.isHeld()) wake.release();
        hushOff();
        report();
    }

    private void resume() {
        if (job == null || "playing".equals(state)) return;
        play();
    }

    // Previous and next from anywhere (the notification, a car, earbuds,
    // the small window): a paragraph at a time, to its first piece, as the
    // app's own buttons go (1.26.0).
    private void step(int d) {
        if (job == null) return;
        if (job.blocks == null) { move(index + d); return; }
        int want = job.blocks[index] + d;
        for (int i = 0; i < job.blocks.length; i++) if (job.blocks[i] == want) { move(i); return; }
    }

    private void move(int to) {
        if (job == null) return;
        index = Math.max(0, Math.min(to, job.items.length - 1));
        if ("playing".equals(state)) speakCurrent();
        else report();
    }

    private void finish(String how) {
        main.removeCallbacks(sleeper);
        state = how;
        generation++;
        if (tts != null) tts.stop();
        if (wake != null && wake.isHeld()) wake.release();
        hushOff();
        dropFocus();
        report();
        job = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    // The voice plays in the speech engine's own app, so to Android this
    // app isn't the one playing, and a car's or earbuds' buttons went to
    // whatever played last. A silent sound of its own, looping while it
    // reads, makes it the one playing (1.26.0); it also keeps a Bluetooth
    // link awake between paragraphs, so their first words aren't cut.
    private AudioTrack hush;

    private void hushOn() {
        try {
            if (hush == null) {
                int rate = 8000;
                short[] zeros = new short[rate / 2];
                hush = new AudioTrack.Builder()
                    .setAudioAttributes(attributes())
                    .setAudioFormat(new AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .build())
                    .setBufferSizeInBytes(zeros.length * 2)
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .build();
                hush.write(zeros, 0, zeros.length);
                hush.setLoopPoints(0, zeros.length, -1);
            }
            if (hush.getPlayState() != AudioTrack.PLAYSTATE_PLAYING) hush.play();
        } catch (Exception e) {
            hushOff();
            if (hush != null) { hush.release(); hush = null; }
        }
    }

    private void hushOff() {
        try { if (hush != null && hush.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) hush.pause(); } catch (Exception e) { /* gone */ }
    }

    private boolean takeFocus() {
        if (Build.VERSION.SDK_INT < 26) return true;
        if (focus == null) {
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes())
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener((change) -> main.post(() -> {
                    if (change == AudioManager.AUDIOFOCUS_LOSS) pause();
                    else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT && "playing".equals(state)) {
                        pause();
                        pausedForFocus = true;
                    } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedForFocus) {
                        pausedForFocus = false;
                        resume();
                    }
                }))
                .build();
        }
        return audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    private void dropFocus() {
        if (Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
    }

    // Tells the app, and redraws the notification and the lock screen.
    private void report() {
        if (listener != null && job != null) listener.onProgress(job.key, index, state);
        if (job == null || "ended".equals(state) || "stopped".equals(state) || "error".equals(state)) return;
        boolean playing = "playing".equals(state);
        // What a car's screen or the earbuds' app shows (1.26.0): the clip,
        // its collection, and which one of the collection it is.
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, job.title)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, job.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, job.subtitle)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, job.subtitle);
        if (job.album != null && !job.album.isEmpty()) meta.putString(MediaMetadata.METADATA_KEY_ALBUM, job.album);
        if (job.track > 0) meta.putLong(MediaMetadata.METADATA_KEY_TRACK_NUMBER, job.track);
        if (job.tracks > 0) meta.putLong(MediaMetadata.METADATA_KEY_NUM_TRACKS, job.tracks);
        session.setMetadata(meta.build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, playing ? 1f : 0f)
            .build());
        session.setActive(true);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        nm.notify(NOTE, notification());
    }

    private void foreground() {
        Notification n = notification();
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(NOTE, n);
    }

    private PendingIntent action(String name, int code) {
        Intent i = new Intent(this, SpeechService.class).setAction(name);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @SuppressWarnings("deprecation")
    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Read aloud", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        boolean playing = "playing".equals(state);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        String title = job == null ? "Read aloud" : job.title;
        String text = job == null ? "" : job.subtitle;
        return b.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(text)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .setDeleteIntent(action(STOP, 5))
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous paragraph", action(PREV, 1)).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play", action(playing ? PAUSE : RESUME, 2)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next paragraph", action(NEXT, 3)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", action(STOP, 4)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2))
            .build();
    }

    @Override
    public void onDestroy() {
        if (tts != null) tts.shutdown();
        tts = null;
        if (session != null) session.release();
        if (hush != null) { hush.release(); hush = null; }
        if (wake != null && wake.isHeld()) wake.release();
        dropFocus();
        if (running == this) running = null;
        super.onDestroy();
    }
}
