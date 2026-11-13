package io.github.danielnoam.waypage.share;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Android Auto (2026-11): the app hands over what the car can start
 * (`list`, a JSON string) and reads back where things started from the
 * car got to (`places`).
 */
@CapacitorPlugin(name = "Car")
public class CarPlugin extends Plugin {

    @PluginMethod
    public void list(PluginCall call) {
        String json = call.getString("json", "");
        if (json == null || json.isEmpty()) { call.reject("Nothing to keep"); return; }
        try {
            Car.write(getContext(), json);
            call.resolve();
        } catch (Exception e) {
            call.reject("Couldn't keep the car's list", e);
        }
    }

    @PluginMethod
    public void places(PluginCall call) {
        JSObject o = new JSObject();
        o.put("json", Car.takePlaces(getContext()));
        call.resolve(o);
    }
}
