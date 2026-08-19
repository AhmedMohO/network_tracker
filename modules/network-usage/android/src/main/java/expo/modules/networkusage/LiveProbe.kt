package expo.modules.networkusage

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.BatteryManager

object LiveProbe {

    /**
     * Device-wide cumulative counters since boot. These still work for the
     * device as a whole; the per-UID variants have returned UNSUPPORTED for
     * other apps' UIDs since Android 7, which is why there is no per-app
     * equivalent here.
     */
    fun counters(): Map<String, Any?> = mapOf(
        "mobileRx" to TrafficStats.getMobileRxBytes(),
        "mobileTx" to TrafficStats.getMobileTxBytes(),
        "totalRx" to TrafficStats.getTotalRxBytes(),
        "totalTx" to TrafficStats.getTotalTxBytes()
    )

    /**
     * The package in the foreground at the last MOVE_TO_FOREGROUND event inside
     * the lookback window, or null. `queryEvents` is used rather than
     * `queryUsageStats` because the latter's `lastTimeUsed` ordering is
     * unreliable across manufacturers.
     *
     * This reads the same PACKAGE_USAGE_STATS grant the rest of the module
     * needs, so it adds no new permission prompt.
     */
    fun foregroundPackage(context: Context, lookbackMs: Long = 60_000): String? {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val now = System.currentTimeMillis()
        val events = usm.queryEvents(now - lookbackMs, now)
        val event = UsageEvents.Event()
        var latest: String? = null
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            if (event.eventType == UsageEvents.Event.MOVE_TO_FOREGROUND) {
                latest = event.packageName
            }
        }
        return latest
    }

    /** Null rather than a guess when the device does not report a level. */
    fun batteryPercent(context: Context): Int? {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (level in 0..100) level else null
    }

    /** Transport only. Never the SSID, never the carrier — see Task 31 notes. */
    fun connection(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "NONE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
            else -> "NONE"
        }
    }
}
