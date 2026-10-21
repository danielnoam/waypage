package io.github.danielnoam.waypage.share;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Reading stats (1.39.0), see Widgets.statsRun. */
public class StatsRunWidget extends AppWidgetProvider {
    @Override
    public void onUpdate(Context ctx, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, Widgets.statsRun(ctx, m, id));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager m, int id, Bundle options) {
        m.updateAppWidget(id, Widgets.statsRun(ctx, m, id));
    }
}
