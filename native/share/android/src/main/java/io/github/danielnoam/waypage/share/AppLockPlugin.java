package io.github.danielnoam.waypage.share;

import android.app.Activity;
import android.os.Build;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * App lock (1.38.0): the passcode is the app's own, kept and checked in
 * JavaScript; this is the fingerprint or face on top of it, and keeping
 * the app's picture out of the recent apps while a lock is on.
 *
 *   available()            { ok }: a fingerprint or face is set up on the phone
 *   verify({ title })      { ok }: the phone's own prompt; false when
 *                          cancelled, "Use passcode" pressed or locked out
 *   hideRecents({ on })    Android 13+ shows a blank card in the recent
 *                          apps instead of the screen; screenshots still work
 */
@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {

    private static final int KINDS = BiometricManager.Authenticators.BIOMETRIC_WEAK;

    @PluginMethod
    public void available(PluginCall call) {
        int r = BiometricManager.from(getContext()).canAuthenticate(KINDS);
        JSObject out = new JSObject();
        out.put("ok", r == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(out);
    }

    @PluginMethod
    public void verify(PluginCall call) {
        Activity a = getActivity();
        if (!(a instanceof FragmentActivity)) { call.reject("No window"); return; }
        FragmentActivity f = (FragmentActivity) a;
        String title = call.getString("title", "Unlock Waypage");
        f.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setNegativeButtonText("Use passcode")
                .setAllowedAuthenticators(KINDS)
                .build();
            BiometricPrompt prompt = new BiometricPrompt(f, ContextCompat.getMainExecutor(f), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    JSObject out = new JSObject();
                    out.put("ok", true);
                    call.resolve(out);
                }

                @Override
                public void onAuthenticationError(int code, CharSequence message) {
                    JSObject out = new JSObject();
                    out.put("ok", false);
                    out.put("code", code);
                    call.resolve(out);
                }
            });
            prompt.authenticate(info);
        });
    }

    @PluginMethod
    public void hideRecents(PluginCall call) {
        Activity a = getActivity();
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (a == null || Build.VERSION.SDK_INT < 33) { call.resolve(); return; }
        a.runOnUiThread(() -> {
            a.setRecentsScreenshotEnabled(!on);
            call.resolve();
        });
    }
}
