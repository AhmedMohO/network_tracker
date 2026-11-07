package com.anonymous.network_tracker.data.util

import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.model.UsageTotals
import com.anonymous.network_tracker.core.reconcileWifiBytes

internal fun preserveWifiAttribution(fresh: List<WifiNetworkSlice>, previous: List<WifiNetworkSlice>): List<WifiNetworkSlice> {
    val totals = mergeUsage(fresh.flatMap { it.apps }).associateBy { it.uid }
    val observed = fresh.filter { it.ssid != null }.flatMap { it.apps }.filter { it.total > 0 }.map { it.uid }.toSet()
    if (previous.none { slice -> slice.ssid != null && slice.apps.any { it.uid in totals && it.uid !in observed } }) return fresh
    val byNetwork = linkedMapOf<String?, HashMap<Int, LongArray>>()
    for ((slices, restoring) in listOf(fresh to false, previous to true)) {
        for (slice in slices) {
            if (restoring && slice.ssid == null) continue
            for (app in slice.apps) {
                if (app.uid !in totals) continue
                if (restoring && app.uid in observed) continue
                if (!restoring && app.uid !in observed) continue
                val slot = byNetwork.getOrPut(slice.ssid) { HashMap() }.getOrPut(app.uid) { LongArray(4) }
                slot[0] += app.download
                slot[1] += app.upload
            }
        }
    }
    val summary = totals.mapValues { (_, app) ->
        val fg = (app.foreground ?: 0).coerceIn(0, app.total)
        val fgRx = minOf(fg, app.download)
        longArrayOf(app.download, app.upload, fgRx, fg - fgRx)
    }
    reconcileWifiBytes(byNetwork, summary)
    return byNetwork.map { (ssid, apps) ->
        val merged = apps.map { (uid, v) ->
            val app = totals.getValue(uid)
            val total = v[0] + v[1]
            val fg = if (app.foreground == null) null else v[2] + v[3]
            app.copy(download = v[0], upload = v[1], total = total, foreground = fg,
                background = fg?.let { total - it }, isEstimated = true)
        }
        val rx = merged.sumOf { it.download }
        val tx = merged.sumOf { it.upload }
        WifiNetworkSlice(ssid, mergeUsage(merged), UsageTotals(rx, tx, rx + tx))
    }.sortedByDescending { it.totals.total }
}
