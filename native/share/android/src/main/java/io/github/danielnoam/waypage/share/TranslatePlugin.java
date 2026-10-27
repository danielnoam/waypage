package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.nl.languageid.LanguageIdentification;
import com.google.mlkit.nl.translate.TranslateLanguage;
import com.google.mlkit.nl.translate.TranslateRemoteModel;
import com.google.mlkit.nl.translate.Translation;
import com.google.mlkit.nl.translate.Translator;
import com.google.mlkit.nl.translate.TranslatorOptions;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;

/**
 * Translate on the selection bar (1.8.1): the words go to Google Translate
 * the way the phone's own text menu sends them, as a popup over Waypage.
 * A translate.google.com link opened the app with its box empty.
 *
 * A whole clip (1.42.0) is translated on the phone with ML Kit: the
 * language's model is downloaded once from Google, then the words never
 * leave the phone.
 *
 *   translate({ text })                  { done }: false when the app isn't there
 *   detect({ text })                     { lang }: "" when it can't tell
 *   ready({ from, to })                  { state }: available, downloadable or unavailable
 *   prepare({ from, to, wifi })          downloads the two models when missing
 *   clip({ from, to, texts })            { texts }: each one translated
 */
@CapacitorPlugin(name = "Translate")
public class TranslatePlugin extends Plugin {

    private static final String APP = "com.google.android.apps.translate";
    private Translator translator;
    private String pair = "";

    @PluginMethod
    public void translate(PluginCall call) {
        String text = call.getString("text", "");
        Activity a = getActivity();
        boolean done = false;
        if (a != null && !text.isEmpty()) {
            Intent popup = new Intent(Intent.ACTION_PROCESS_TEXT)
                .setType("text/plain")
                .setPackage(APP)
                .putExtra(Intent.EXTRA_PROCESS_TEXT, text)
                .putExtra(Intent.EXTRA_PROCESS_TEXT_READONLY, true);
            Intent share = new Intent(Intent.ACTION_SEND)
                .setType("text/plain")
                .setPackage(APP)
                .putExtra(Intent.EXTRA_TEXT, text);
            done = start(a, popup) || start(a, share);
        }
        JSObject out = new JSObject();
        out.put("done", done);
        call.resolve(out);
    }

    private static boolean start(Activity a, Intent i) {
        try {
            a.startActivity(i);
            return true;
        } catch (ActivityNotFoundException | SecurityException e) {
            return false;
        }
    }

    @PluginMethod
    public void detect(PluginCall call) {
        String text = call.getString("text", "");
        LanguageIdentification.getClient().identifyLanguage(text)
            .addOnSuccessListener((lang) -> {
                JSObject out = new JSObject();
                out.put("lang", "und".equals(lang) ? "" : lang);
                call.resolve(out);
            })
            .addOnFailureListener((e) -> call.reject("Couldn't tell the language", e));
    }

    @PluginMethod
    public void ready(PluginCall call) {
        String from = TranslateLanguage.fromLanguageTag(call.getString("from", ""));
        String to = TranslateLanguage.fromLanguageTag(call.getString("to", ""));
        if (from == null || to == null) {
            JSObject out = new JSObject();
            out.put("state", "unavailable");
            call.resolve(out);
            return;
        }
        RemoteModelManager.getInstance().getDownloadedModels(TranslateRemoteModel.class)
            .addOnSuccessListener((models) -> {
                boolean have = has(models, from) && has(models, to);
                JSObject out = new JSObject();
                out.put("state", have ? "available" : "downloadable");
                call.resolve(out);
            })
            .addOnFailureListener((e) -> call.reject("Couldn't look at the languages", e));
    }

    private static boolean has(Set<TranslateRemoteModel> models, String lang) {
        if (TranslateLanguage.ENGLISH.equals(lang)) return true;
        for (TranslateRemoteModel m : models) if (lang.equals(m.getLanguage())) return true;
        return false;
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        Translator t = translatorFor(call);
        if (t == null) return;
        DownloadConditions.Builder when = new DownloadConditions.Builder();
        if (call.getBoolean("wifi", false)) when.requireWifi();
        t.downloadModelIfNeeded(when.build())
            .addOnSuccessListener((v) -> call.resolve())
            .addOnFailureListener((e) -> call.reject("Couldn't download the language", e));
    }

    @PluginMethod
    public void clip(PluginCall call) {
        Translator t = translatorFor(call);
        if (t == null) return;
        JSONArray texts = call.getArray("texts");
        List<Task<String>> jobs = new ArrayList<>();
        for (int i = 0; texts != null && i < texts.length(); i++) jobs.add(t.translate(texts.optString(i, "")));
        Tasks.whenAllSuccess(jobs)
            .addOnSuccessListener((done) -> {
                JSArray list = new JSArray();
                for (Object s : done) list.put(String.valueOf(s));
                JSObject out = new JSObject();
                out.put("texts", list);
                call.resolve(out);
            })
            .addOnFailureListener((e) -> call.reject("Couldn't translate", e));
    }

    // One translator at a time, for the pair asked for last.
    private Translator translatorFor(PluginCall call) {
        String from = TranslateLanguage.fromLanguageTag(call.getString("from", ""));
        String to = TranslateLanguage.fromLanguageTag(call.getString("to", ""));
        if (from == null || to == null) {
            call.reject("This language can't be translated on the phone");
            return null;
        }
        String want = from + ">" + to;
        if (translator == null || !want.equals(pair)) {
            if (translator != null) translator.close();
            translator = Translation.getClient(new TranslatorOptions.Builder().setSourceLanguage(from).setTargetLanguage(to).build());
            pair = want;
        }
        return translator;
    }

    @Override
    protected void handleOnDestroy() {
        if (translator != null) translator.close();
        translator = null;
    }
}
