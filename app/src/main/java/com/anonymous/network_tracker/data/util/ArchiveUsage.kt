package com.anonymous.network_tracker.data.util

import com.anonymous.network_tracker.data.db.DailyUsageEntity
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.core.proportionalBytes
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.model.UsageTotals

internal fun snapshotRetainsUsage(previous: List<DailyUsageEntity>, fresh: List<DailyUsageEntity>): Boolean {
    return previous.groupBy { it.network }.all { (network, oldRows) ->
        val updated = fresh.filter { it.network == network }.groupBy { it.uid }
        val oldRemoved = oldRows.filter { it.uid == -4 }
        val removed = updated[-4].orEmpty()
        // Android reattributes uninstalled UIDs to UID_REMOVED; only that increase can cover lost UID bytes.
        val rxAvailable = removed.sumOf { it.download } - oldRemoved.sumOf { it.download }
        val txAvailable = removed.sumOf { it.upload } - oldRemoved.sumOf { it.upload }
        var rxMissing = 0L
        var txMissing = 0L
        for ((uid, rows) in oldRows.filter { it.uid != -4 }.groupBy { it.uid }) {
            rxMissing += (rows.sumOf { it.download } - updated[uid].orEmpty().sumOf { it.download }).coerceAtLeast(0)
            txMissing += (rows.sumOf { it.upload } - updated[uid].orEmpty().sumOf { it.upload }).coerceAtLeast(0)
        }
        rxAvailable >= rxMissing && txAvailable >= txMissing
    }
}

internal fun archiveWifiSlices(rows: List<DailyUsageEntity>, range: DateRange): List<WifiNetworkSlice> =
    rows.filter { it.network == "WIFI" }.groupBy { it.ssid.takeIf(String::isNotEmpty) }.map { (ssid, saved) ->
        val apps = archiveApps(saved, range).map { it.copy(isEstimated = true) }
        val rx = apps.sumOf { it.download }
        val tx = apps.sumOf { it.upload }
        WifiNetworkSlice(ssid, apps, UsageTotals(rx, tx, rx + tx))
    }.filter { it.apps.isNotEmpty() }.sortedByDescending { it.totals.total }

internal fun archiveApps(rows: List<DailyUsageEntity>, range: DateRange): List<AppUsageItem> = mergeUsage(
    rows.mapNotNull { row ->
        val dayEnd = row.dayEnd ?: RangeUtils.midnight(row.dayStart, 1)
        val from = maxOf(range.start, row.dayStart)
        val to = minOf(range.end, dayEnd)
        if (from >= to) return@mapNotNull null
        fun portion(bytes: Long) = proportionalBytes(bytes, from - row.dayStart, to - row.dayStart, dayEnd - row.dayStart)
        val rx = portion(row.download)
        val tx = portion(row.upload)
        val total = row.download + row.upload
        val before = proportionalBytes(row.download, 0, from - row.dayStart, dayEnd - row.dayStart) +
            proportionalBytes(row.upload, 0, from - row.dayStart, dayEnd - row.dayStart)
        val fg = row.foreground?.let {
            if (total == 0L) 0L else proportionalBytes(it.coerceIn(0, total), before, before + rx + tx, total)
        }
        // shortcut: partial archived days assume even traffic; store finer buckets to remove this estimate.
        AppUsageItem(row.uid, row.appName ?: row.packageName ?: "UID ${row.uid}", row.packageName,
            rx, tx, rx + tx, fg, if (fg != null && row.background != null) rx + tx - fg else null,
            isEstimated = from != row.dayStart || to != dayEnd)
    }
)

internal fun mergeUsage(a: List<AppUsageItem>, b: List<AppUsageItem> = emptyList()): List<AppUsageItem> {
    val merged = (a + b).groupBy { it.uid }.values.map { apps ->
        val rx = apps.sumOf { it.download }
        val tx = apps.sumOf { it.upload }
        apps.first().copy(download = rx, upload = tx, total = rx + tx,
            foreground = if (apps.all { it.foreground != null }) apps.sumOf { it.foreground!! } else null,
            background = if (apps.all { it.background != null }) apps.sumOf { it.background!! } else null,
            isEstimated = apps.any { it.isEstimated })
    }
    val total = merged.sumOf { it.total }
    return merged.map { it.copy(percentage = if (total > 0) it.total.toDouble() / total * 100 else 0.0) }
        .sortedByDescending { it.total }
}
