package io.github.danielnoam.waypage.share;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.audiofx.LoudnessEnhancer;
import android.media.PlaybackParams;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;

/**
 * Plays an audiobook with the screen off (src/app-listen.js). A foreground
 * service of type mediaPlayback owns a MediaPlayer and the book's parts:
 * one file, a folder's files in order, or stretches of a file (an EPUB's
 * own sound, stored in its zip). Its notification is a media session with
 * back 15 s, play or pause, on 30 s, the sleep timer and stop, on the lock
 * screen and to earbuds and cars too.
 *
 * Unlike Narrate it takes the audio focus: a call or a navigation prompt
 * pauses the book, and it goes on after (a lost focus doesn't). Unplugging
 * the headphones pauses it.
 *
 * AudiobookPlugin hands it a Job and gets where it is back through the
 * Listener about twice a second while it plays; both run in the app's
 * process, so nothing is parcelled.
 */
public class AudiobookService extends Service {

    static final String PLAY = "play", PAUSE = "pause", RESUME = "resume", SEEK = "seek", SKIP = "skip", RATE = "rate", STOP = "stop", SLEEP = "sleep", SLEEP_MORE = "sleepmore", BACK = "back", ON = "on";
    private static final String CHANNEL = "waypage-listen";
    private static final int NOTE = 31;

    static final class Part {
        String uri;
        long offset = -1, length = -1;
    }

    static final class Job {
        Part[] parts;
        int part;
        long pos;
        float rate = 1f;
        String title = "", subtitle = "", key = "";
    }

    interface Listener {
        void onState(String key, int part, long pos, long dur, String state);
    }
    interface SleepListener {
        void onSleep(long at);
    }

    // Settings › Audiobooks: allow mixing (no audio focus, other apps play
    // on) and how far back and on skip, for the lock screen and the window too.
    static volatile boolean mix;
    static volatile long backMs = 15000, onMs = 30000;
    // Volume under Allow mixing: 0 to 2, 1 is the file as it is.
    static volatile float volume = 1f;

    static Job pending;
    static Listener listener;
    static SleepListener sleepListener;
    static long sleepAt;
    static AudiobookService running;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            report(false);
            if ("playing".equals(state)) main.postDelayed(this, 500);
        }
    };
    private final Runnable sleeper = () -> { setSleep(0); pause(); };
    private Job job;
    private MediaPlayer player;
    // Above 1: a limiter lifting the player's session by up to 6 dB (2x),
    // since MediaPlayer's own volume stops at 1.
    private LoudnessEnhancer louder;
    private ParcelFileDescriptor fd;
    private boolean prepared;
    private long startAt;
    private boolean playWhenReady;
    private String state = "stopped";
    private MediaSession session;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private boolean pausedForFocus;
    private boolean noisyOn;
    private final BroadcastReceiver noisy = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) { if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(i.getAction())) pause(); }
    };

    static void send(Context ctx, String action, Long value, Float rate) {
        Intent i = new Intent(ctx, AudiobookService.class).setAction(action);
        if (value != null) i.putExtra("value", value.longValue());
        if (rate != null) i.putExtra("rate", rate.floatValue());
        if (PLAY.equals(action) && Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
        else if (running != null || PLAY.equals(action)) ctx.startService(i);
    }

    static void seek(Context ctx, int part, long pos) {
        if (running == null) return;
        ctx.startService(new Intent(ctx, AudiobookService.class).setAction(SEEK).putExtra("part", part).putExtra("value", pos));
    }

    static void options(boolean mixing, long back, long on, float vol) {
        mix = mixing;
        if (back > 0) backMs = back;
        if (on > 0) onMs = on;
        volume = Math.max(0f, Math.min(2f, vol));
        AudiobookService s = running;
        if (s != null && mixing) s.main.post(s::dropFocus);
        if (s != null) s.main.post(s::applyVolume);
    }

    static String stateOf() { return running == null ? "stopped" : running.state; }
    static String keyOf() { return running == null || running.job == null ? "" : running.job.key; }
    static int partOf() { return running == null || running.job == null ? 0 : running.job.part; }
    static long posOf() { return running == null ? 0 : running.position(); }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onCreate() {
        super.onCreate();
        running = this;
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        session = new MediaSession(this, "Waypage audiobook");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onSkipToNext() { skip(onMs); }
            @Override public void onSkipToPrevious() { skip(-backMs); }
            @Override public void onFastForward() { skip(onMs); }
            @Override public void onRewind() { skip(-backMs); }
            @Override public void onSeekTo(long pos) { seekIn(job == null ? 0 : job.part, pos); }
            @Override public void onStop() { finish("stopped"); }
            @Override public void onCustomAction(String action, android.os.Bundle extras) { if (SLEEP_MORE.equals(action)) sleepMore(); }
        });
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) return START_NOT_STICKY;
        switch (action) {
            case PLAY:
                foreground();
                if (pending != null) { Job j = pending; pending = null; start(j); }
                else if (job == null) finish("stopped");
                break;
            case PAUSE: pause(); break;
            case RESUME: resume(); break;
            case BACK: skip(-backMs); break;
            case ON: skip(onMs); break;
            case SKIP: skip(intent.getLongExtra("value", 0)); break;
            case SEEK: seekIn(intent.getIntExtra("part", job == null ? 0 : job.part), intent.getLongExtra("value", 0)); break;
            case RATE: setRate(intent.getFloatExtra("rate", 1f)); break;
            case SLEEP: setSleep(intent.getLongExtra("value", 0)); report(true); break;
            case SLEEP_MORE: sleepMore(); break;
            case STOP: finish("stopped"); break;
            default: break;
        }
        return START_NOT_STICKY;
    }

    private void start(Job j) {
        job = j;
        job.part = Math.max(0, Math.min(job.part, job.parts.length - 1));
        playWhenReady = true;
        load(job.part, job.pos);
    }

    // A part made ready to play from `pos` (ms into it).
    private void load(int part, long pos) {
        release();
        prepared = false;
        // Below 0: that far before the part's end (skipping back past a part's start).
        startAt = pos;
        job.part = part;
        Part p = job.parts[part];
        player = new MediaPlayer();
        player.setAudioAttributes(attributes());
        player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
        player.setOnPreparedListener((mp) -> {
            if (mp != player) return;
            prepared = true;
            if (startAt < 0) startAt = Math.max(0, duration() + startAt);
            if (startAt > 0) mp.seekTo((int) Math.min(startAt, Integer.MAX_VALUE));
            applyRate();
            applyVolume();
            if (playWhenReady) go();
            else report(true);
        });
        player.setOnCompletionListener((mp) -> {
            if (mp != player) return;
            if (job.part + 1 < job.parts.length) { playWhenReady = true; load(job.part + 1, 0); }
            else { state = "ended"; report(true); finish("ended"); }
        });
        player.setOnErrorListener((mp, what, extra) -> {
            if (mp != player) return true;
            finish("error");
            return true;
        });
        try {
            Uri u = Uri.parse(p.uri);
            if (p.offset >= 0 && p.length > 0) {
                fd = getContentResolver().openFileDescriptor(u, "r");
                player.setDataSource(fd.getFileDescriptor(), p.offset, p.length);
            } else if ("file".equals(u.getScheme())) {
                player.setDataSource(u.getPath());
            } else {
                player.setDataSource(this, u);
            }
            state = "loading";
            report(true);
            player.prepareAsync();
        } catch (Exception e) {
            finish("error");
        }
    }

    private void go() {
        if (player == null || !prepared) { playWhenReady = true; return; }
        if (mix) dropFocus();
        else if (!takeFocus()) { state = "paused"; report(true); return; }
        try { player.start(); } catch (Exception e) { finish("error"); return; }
        state = "playing";
        noisyOn(true);
        main.removeCallbacks(tick);
        main.post(tick);
        report(true);
    }

    private void pause() {
        playWhenReady = false;
        if (player != null && prepared) { try { if (player.isPlaying()) player.pause(); } catch (Exception e) { /* gone */ } }
        if (job == null) return;
        state = "paused";
        main.removeCallbacks(tick);
        noisyOn(false);
        report(true);
    }

    private void resume() {
        if (job == null) return;
        pausedForFocus = false;
        playWhenReady = true;
        if (player == null) load(job.part, job.pos);
        else go();
    }

    private long position() {
        if (player == null || !prepared) return Math.max(0, startAt);
        try { return player.getCurrentPosition(); } catch (Exception e) { return startAt; }
    }

    private long duration() {
        if (player == null || !prepared) return 0;
        try { return Math.max(0, player.getDuration()); } catch (Exception e) { return 0; }
    }

    // Back or on by `by` ms, across parts.
    private void skip(long by) {
        if (job == null) return;
        long to = position() + by;
        int part = job.part;
        if (to < 0 && part > 0) { seekIn(part - 1, Math.min(-1, to)); return; }
        long dur = duration();
        if (dur > 0 && to >= dur && part + 1 < job.parts.length) { seekIn(part + 1, to - dur); return; }
        seekIn(part, Math.max(0, dur > 0 ? Math.min(to, dur - 500) : to));
    }

    // `pos` below 0 counts back from the part's end.
    private void seekIn(int part, long pos) {
        if (job == null) return;
        part = Math.max(0, Math.min(part, job.parts.length - 1));
        if (part != job.part || player == null) {
            playWhenReady = "playing".equals(state) || playWhenReady;
            load(part, pos);
            return;
        }
        if (!prepared) { startAt = pos; return; }
        if (pos < 0) pos = Math.max(0, duration() + pos);
        try { player.seekTo((int) Math.min(pos, Integer.MAX_VALUE)); } catch (Exception e) { /* stays */ }
        report(true);
    }

    private void setRate(float r) {
        if (job == null) return;
        job.rate = Math.max(0.5f, Math.min(3f, r));
        applyRate();
        report(true);
    }

    // Speed with the voice's pitch kept.
    private void applyRate() {
        if (player == null || !prepared || Build.VERSION.SDK_INT < 23) return;
        try {
            boolean was = player.isPlaying();
            PlaybackParams pp = player.getPlaybackParams();
            pp.setSpeed(job.rate);
            pp.setPitch(1f);
            player.setPlaybackParams(pp);
            // Setting the speed starts a paused player on some phones.
            if (!was && !"playing".equals(state)) player.pause();
        } catch (Exception e) { /* the phone's own speed */ }
    }

    private void applyVolume() {
        if (player == null) return;
        float v = volume;
        try { player.setVolume(Math.min(1f, v), Math.min(1f, v)); } catch (Exception e) { /* as it was */ }
        try {
            if (v <= 1f) { if (louder != null) louder.setEnabled(false); return; }
            if (louder == null) louder = new LoudnessEnhancer(player.getAudioSessionId());
            louder.setTargetGain(Math.round(2000 * (float) Math.log10(v)));
            louder.setEnabled(true);
        } catch (Exception e) { dropLouder(); }
    }

    private void dropLouder() {
        if (louder != null) { try { louder.release(); } catch (Exception e) { /* gone */ } louder = null; }
    }

    private void setSleep(long at) {
        main.removeCallbacks(sleeper);
        sleepAt = at > System.currentTimeMillis() ? at : 0;
        if (sleepAt > 0) main.postDelayed(sleeper, sleepAt - System.currentTimeMillis());
        if (sleepListener != null) sleepListener.onSleep(sleepAt);
    }

    private void sleepMore() {
        long now = System.currentTimeMillis();
        setSleep(Math.max(now, sleepAt) + 15 * 60000L);
        report(true);
    }

    private void finish(String how) {
        state = how;
        main.removeCallbacks(tick);
        main.removeCallbacks(sleeper);
        sleepAt = 0;
        if (job != null) job.pos = position();
        report(true);
        noisyOn(false);
        dropFocus();
        release();
        job = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
        else stopForeground(true);
        stopSelf();
    }

    private void release() {
        dropLouder();
        if (player != null) {
            try { player.reset(); } catch (Exception e) { /* gone */ }
            player.release();
            player = null;
        }
        prepared = false;
        if (fd != null) { try { fd.close(); } catch (Exception e) { /* gone */ } fd = null; }
    }

    private AudioAttributes attributes() {
        return new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
    }

    private void noisyOn(boolean on) {
        if (on == noisyOn) return;
        noisyOn = on;
        try {
            if (on) registerReceiver(noisy, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));
            else unregisterReceiver(noisy);
        } catch (Exception e) { /* not registered */ }
    }

    @SuppressWarnings("deprecation")
    private boolean takeFocus() {
        AudioManager.OnAudioFocusChangeListener l = (change) -> main.post(() -> {
            if (change == AudioManager.AUDIOFOCUS_LOSS) { pausedForFocus = false; pause(); }
            else if ((change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) && "playing".equals(state)) {
                pause();
                pausedForFocus = true;
            } else if (change == AudioManager.AUDIOFOCUS_GAIN && pausedForFocus) {
                pausedForFocus = false;
                resume();
            }
        });
        if (Build.VERSION.SDK_INT < 26) return audio.requestAudioFocus(l, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        if (focus == null) {
            // A spoken book pauses rather than ducks under a prompt.
            focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(attributes())
                .setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener(l)
                .build();
        }
        return audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void dropFocus() {
        if (Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
    }

    // Tells the app; `all` redraws the notification and the lock screen too.
    private void report(boolean all) {
        if (job == null) return;
        long pos = position(), dur = duration();
        job.pos = pos;
        if (listener != null) listener.onState(job.key, job.part, pos, dur, state);
        if (!all || "ended".equals(state) || "stopped".equals(state) || "error".equals(state)) return;
        boolean playing = "playing".equals(state);
        MediaMetadata.Builder meta = new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, job.title)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, job.title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, job.subtitle)
            .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, job.subtitle);
        if (dur > 0) meta.putLong(MediaMetadata.METADATA_KEY_DURATION, dur);
        if (job.parts.length > 1) {
            meta.putLong(MediaMetadata.METADATA_KEY_TRACK_NUMBER, job.part + 1);
            meta.putLong(MediaMetadata.METADATA_KEY_NUM_TRACKS, job.parts.length);
        }
        session.setMetadata(meta.build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_FAST_FORWARD
                | PlaybackState.ACTION_REWIND | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? job.rate : 0f)
            .addCustomAction(new PlaybackState.CustomAction.Builder(SLEEP_MORE, sleepLabel(), R.drawable.waypage_sleep).build())
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

    private String sleepLabel() {
        long left = sleepAt - System.currentTimeMillis();
        return left > 0 ? "+15 min (" + Math.max(1, Math.round(left / 60000.0)) + " left)" : "Sleep 15 min";
    }

    private PendingIntent action(String name, int code) {
        Intent i = new Intent(this, AudiobookService.class).setAction(name);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @SuppressWarnings("deprecation")
    private Notification notification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Audiobooks", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
            b = new Notification.Builder(this, CHANNEL);
        } else b = new Notification.Builder(this);
        boolean playing = "playing".equals(state) || "loading".equals(state);
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        return b.setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(job == null ? "Audiobook" : job.title)
            .setContentText(job == null ? "" : job.subtitle)
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .setDeleteIntent(action(STOP, 15))
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_rew, "Back " + backMs / 1000 + " seconds", action(BACK, 11)).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                playing ? "Pause" : "Play", action(playing ? PAUSE : RESUME, 12)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_ff, "Forward " + onMs / 1000 + " seconds", action(ON, 13)).build())
            .addAction(new Notification.Action.Builder(R.drawable.waypage_sleep, sleepLabel(), action(SLEEP_MORE, 16)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", action(STOP, 14)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2))
            .build();
    }

    @Override
    public void onDestroy() {
        main.removeCallbacks(tick);
        main.removeCallbacks(sleeper);
        noisyOn(false);
        release();
        if (session != null) session.release();
        dropFocus();
        if (running == this) running = null;
        super.onDestroy();
    }
}
