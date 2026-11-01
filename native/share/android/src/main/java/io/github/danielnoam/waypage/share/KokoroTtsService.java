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
 * as an Android text-to-speech engine. Narrate's SpeechService picks it
 * like Google's; the phone's text-to-speech settings list it too, so
 * other apps can use it. Enabled only once the voices are downloaded.
 * Each sentence is spoken as soon as it's made, not after the whole
 * piece.
 */
public class KokoroTtsService extends TextToSpeechService {
    private volatile boolean stopped;
    private String[] lang = {"eng", "USA", ""};

    private static boolean english(String l) {
        return l != null && (l.equalsIgnoreCase("eng") || l.equalsIgnoreCase("en"));
    }

    @Override
    protected int onIsLanguageAvailable(String l, String country, String variant) {
        if (!english(l)) return TextToSpeech.LANG_NOT_SUPPORTED;
        if (!Kokoro.ready(this)) return TextToSpeech.LANG_MISSING_DATA;
        String c = country == null ? "" : country.toUpperCase(Locale.ROOT);
        return c.equals("USA") || c.equals("US") || c.equals("GBR") || c.equals("GB") ? TextToSpeech.LANG_COUNTRY_AVAILABLE : TextToSpeech.LANG_AVAILABLE;
    }

    @Override
    protected String[] onGetLanguage() { return lang; }

    @Override
    protected int onLoadLanguage(String l, String country, String variant) {
        int r = onIsLanguageAvailable(l, country, variant);
        if (r >= TextToSpeech.LANG_AVAILABLE) lang = new String[] {"eng", country == null ? "" : country, ""};
        return r;
    }

    @Override
    protected void onStop() { stopped = true; }

    @Override
    public List<Voice> onGetVoices() {
        List<Voice> out = new ArrayList<>();
        for (String[] v : Kokoro.VOICES) {
            out.add(new Voice(v[0], Locale.forLanguageTag(v[2]), Voice.QUALITY_VERY_HIGH, Voice.LATENCY_NORMAL, false, new HashSet<>()));
        }
        return out;
    }

    @Override
    public int onIsValidVoiceName(String name) {
        return Kokoro.voice(name) != null ? TextToSpeech.SUCCESS : TextToSpeech.ERROR;
    }

    @Override
    public int onLoadVoice(String name) { return onIsValidVoiceName(name); }

    @Override
    public String onGetDefaultVoiceNameFor(String l, String country, String variant) {
        if (!english(l)) return null;
        return Kokoro.voiceFor(new Locale("en", country == null ? "" : country))[0];
    }

    @Override
    protected void onSynthesizeText(SynthesisRequest r, SynthesisCallback cb) {
        stopped = false;
        OfflineTts tts = Kokoro.get(this);
        CharSequence chars = r.getCharSequenceText();
        String text = chars != null ? chars.toString() : r.getText();
        if (tts == null || text == null) { cb.error(); return; }
        String country = r.getCountry() == null ? "" : r.getCountry();
        int sid = Kokoro.sidFor(r.getVoiceName(), new Locale("en", country));
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
