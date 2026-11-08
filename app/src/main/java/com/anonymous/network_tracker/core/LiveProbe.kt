package com.anonymous.network_tracker.core

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.TrafficStats
import android.os.BatteryManager
import android.os.PowerManager

object LiveProbe {
    private var foregroundState = ForegroundState()
    private var checkedAt = 0L

    fun counters(): Map<String, Long> = mapOf(
        "mobileRx" to TrafficStats.getMobileRxBytes(),
        "mobileTx" to TrafficStats.getMobileTxBytes(),
        "totalRx" to TrafficStats.getTotalRxBytes(),
        "totalTx" to TrafficStats.getTotalTxBytes()
    )

    @Synchronized
    fun foregroundPackage(context: Context): String? {
        val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager
            ?: return null
        val now = System.currentTimeMillis()
        if (checkedAt == 0L || now < checkedAt) {
            foregroundState = ForegroundState()
            checkedAt = now - 7 * 86_400_000L
        }
        val events = usm.queryEvents(checkedAt, now) ?: return null
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            foregroundState.event(event.eventType, event.packageName, event.className, event.timeStamp)
        }
        checkedAt = now
        if ((context.getSystemService(Context.POWER_SERVICE) as? PowerManager)?.isInteractive == false) {
            foregroundState.clear()
        }
        return foregroundState.packageName
    }

    fun batteryPercent(context: Context): Int? {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager ?: return null
        val level = bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        return if (level in 0..100) level else null
    }

    fun connection(context: Context): String {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return "NONE"
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return "NONE"
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "WIFI"
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "MOBILE"
            else -> "NONE"
        }
    }
}

