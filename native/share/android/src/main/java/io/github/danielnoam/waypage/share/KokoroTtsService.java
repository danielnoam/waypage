package io.github.danielnoam.waypage.share;

import android.media.AudioFormat;
import android.speech.tts.SynthesisCallback;
import android.speech.tts.SynthesisRequest;
import android.speech.tts.TextToSpeech;
import android.speech.tts.TextToSpeechService;
import android.speech.tts.Voice;
import com.k2fsa.sherpa.onnx.OfflineTts;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;

/**
 * Waypage's own speech engine: the downloaded Kokoro voices (Kokoro.java)
 * as an Android text-to-speech engine, with the voices of the pack in use. Narrate's SpeechService picks it
 * like Google's; the phone's text-to-speech settings list it too, so
 * other apps can use it. Enabled only once the voices are downloaded.
 * Each sentence is spoken as soon as it's made, not after the whole
 * piece.
 */
public class KokoroTtsService extends TextToSpeechService {
    private volatile boolean stopped;
    private String[] lang = {"eng", "USA", ""};

    // Languages in the pack in use (Kokoro.inUse): English for 0.19,
    // eight for 1.0, English and Chinese for 1.1.
    private boolean has(String l) {
        Kokoro.Pack p = Kokoro.inUse(this);
        if (p == null || l == null) return false;
        for (String v : p.voices) if (Kokoro.matches(v, l)) return true;
        return false;
    }

    @Override
    protected int onIsLanguageAvailable(String l, String country, String variant) {
        if (!Kokoro.ready(this)) return TextToSpeech.LANG_MISSING_DATA;
        if (!has(l)) return TextToSpeech.LANG_NOT_SUPPORTED;
        return country == null || country.isEmpty() ? TextToSpeech.LANG_AVAILABLE : TextToSpeech.LANG_COUNTRY_AVAILABLE;
    }

    @Override
    protected String[] onGetLanguage() { return lang; }

    @Override
    protected int onLoadLanguage(String l, String country, String variant) {
        int r = onIsLanguageAvailable(l, country, variant);
        if (r >= TextToSpeech.LANG_AVAILABLE) lang = new String[] {l, country == null ? "" : country, ""};
        return r;
    }

    @Override
    protected void onStop() { stopped = true; }

    @Override
    public List<Voice> onGetVoices() {
        List<Voice> out = new ArrayList<>();
        Kokoro.Pack p = Kokoro.inUse(this);
        if (p == null) return out;
        for (String v : p.voices) {
            out.add(new Voice(Kokoro.PREFIX + v, Locale.forLanguageTag(Kokoro.languageOf(v)), Voice.QUALITY_VERY_HIGH, Voice.LATENCY_NORMAL, false, new HashSet<>()));
        }
        return out;
    }

    @Override
    public int onIsValidVoiceName(String name) {
        return Kokoro.sid(this, name) >= 0 ? TextToSpeech.SUCCESS : TextToSpeech.ERROR;
    }

    @Override
    public int onLoadVoice(String name) { return onIsValidVoiceName(name); }

    @Override
    public String onGetDefaultVoiceNameFor(String l, String country, String variant) {
        Kokoro.Pack p = Kokoro.inUse(this);
        if (p == null || !has(l)) return null;
        return Kokoro.PREFIX + p.voices[Kokoro.defaultSid(this, new Locale(l, country == null ? "" : country))];
    }

    @Override
    protected void onSynthesizeText(SynthesisRequest r, SynthesisCallback cb) {
        stopped = false;
        OfflineTts tts = Kokoro.get(this);
        CharSequence chars = r.getCharSequenceText();
        String text = chars != null ? chars.toString() : r.getText();
        if (tts == null || text == null) { cb.error(); return; }
        String language = r.getLanguage() == null ? "en" : r.getLanguage();
        String country = r.getCountry() == null ? "" : r.getCountry();
        int sid = Kokoro.sidFor(this, r.getVoiceName(), new Locale(language, country));
        float speed = Kokoro.speedOf(r.getSpeechRate());
        if (cb.start(tts.sampleRate(), AudioFormat.ENCODING_PCM_16BIT, 1) != TextToSpeech.SUCCESS) return;
        if (text.trim().isEmpty()) { cb.done(); return; }
        // Made ahead when Narrate asked for it (Kokoro.take), else now.
        Kokoro.Take t = Kokoro.take(this, text, sid, speed);
        Kokoro.dropBefore(t);
        final int max = Math.max(2, cb.getMaxBufferSize() & ~1);
        try {
            for (int i = 0; !stopped; ) {
                Object o = Kokoro.next(t, i);
                if (o == Kokoro.END) break;
                if (o == null) continue;
                byte[] pcm = (byte[]) o;
                for (int at = 0; at < pcm.length && !stopped; at += max) {
                    if (cb.audioAvailable(pcm, at, Math.min(max, pcm.length - at)) != TextToSpeech.SUCCESS) return;
                }
                i++;
            }
        } catch (InterruptedException e) {
            return;
        }
        if (stopped) return;
        if (t.failed && t.chunks.isEmpty()) cb.error();
        else cb.done();
    }
}
