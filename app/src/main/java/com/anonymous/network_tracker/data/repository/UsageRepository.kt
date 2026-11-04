package com.anonymous.network_tracker.data.repository

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.anonymous.network_tracker.NetTrackApplication
import com.anonymous.network_tracker.R
import com.anonymous.network_tracker.core.AppResolver
import com.anonymous.network_tracker.core.LiveUsageResult
import com.anonymous.network_tracker.core.StatsReader
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.db.DailyUsageDao
import com.anonymous.network_tracker.data.db.DailyUsageEntity
import com.anonymous.network_tracker.data.db.UsageDatabase
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.model.UsageQuery
import com.anonymous.network_tracker.data.model.UsageTotals
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.model.WifiUsageQuery
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.WifiWatchService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class UsageRepository(private val context: Context) {

    private val db = UsageDatabase.getInstance(context)
    private val dao = db.dailyUsageDao()
    private val statsReader = StatsReader(context)
    private val resolver = AppResolver(context)
    private val settingsRepo = SettingsRepository.getInstance(context)

    suspend fun getUsage(range: DateRange, network: String = "ALL"): List<AppUsageItem> = withContext(Dispatchers.IO) {
        val split = RangeUtils.splitRange(range)

        val archivedRows = if (split.archived != null) {
            readArchive(split.archived.start, split.archived.end, network)
        } else {
            emptyList()
        }

        val liveRows = if (split.live != null && UsageAccess.has(context)) {
            statsReader.appUsage(UsageQuery(split.live.start, split.live.end, network)).apps
        } else {
            emptyList()
        }

        mergeUsage(archivedRows, liveRows)
    }

    suspend fun getUsageByWifiNetwork(range: DateRange): List<WifiNetworkSlice> = withContext(Dispatchers.IO) {
        val split = RangeUtils.splitRange(range)

        val archivedSlices = if (split.archived != null) {
            readArchiveByWifiNetwork(split.archived.start, split.archived.end)
        } else {
            emptyList()
        }

        val liveSlices = if (split.live != null && UsageAccess.has(context)) {
            WifiWatchService.sample(context)
            statsReader.appUsageByWifiNetwork(WifiUsageQuery(split.live.start, split.live.end)).networks
        } else {
            emptyList()
        }

        mergeWifiSlices(archivedSlices, liveSlices)
    }

    private suspend fun readArchive(start: Long, end: Long, network: String): List<AppUsageItem> {
        val rows = if (network == "ALL") {
            dao.getUsageAllNetworks(start, end)
        } else {
            dao.getUsageByNetwork(start, end, network)
        }

        val grandTotal = rows.sumOf { it.download + it.upload }
        return rows.map { r ->
            val total = r.download + r.upload
            val pct = if (grandTotal > 0) (total.toDouble() / grandTotal.toDouble()) * 100.0 else 0.0
            AppUsageItem(
                uid = r.uid,
                name = r.app_name ?: (r.package_name ?: "UID ${r.uid}"),
                packageName = r.package_name,
                download = r.download,
                upload = r.upload,
                total = total,
                foreground = 0,
                background = 0,
                percentage = pct
            )
        }
    }

    private suspend fun readArchiveByWifiNetwork(start: Long, end: Long): List<WifiNetworkSlice> {
        val rows = dao.getUsageByWifiNetwork(start, end)
        val bySsid = LinkedHashMap<String?, MutableList<AppUsageItem>>()

        for (r in rows) {
            val ssid = r.ssid.takeIf { it.isNotEmpty() }
            val total = r.download + r.upload
            val item = AppUsageItem(
                uid = r.uid,
                name = r.app_name ?: (r.package_name ?: "UID ${r.uid}"),
                packageName = r.package_name,
                download = r.download,
                upload = r.upload,
                total = total,
                foreground = 0,
                background = 0,
                percentage = 0.0
            )
            bySsid.getOrPut(ssid) { ArrayList() }.add(item)
        }

        return bySsid.map { (ssid, apps) ->
            val rx = apps.sumOf { it.download }
            val tx = apps.sumOf { it.upload }
            val tot = rx + tx
            apps.sortByDescending { it.total }
            WifiNetworkSlice(
                ssid = ssid,
                apps = apps,
                totals = UsageTotals(download = rx, upload = tx, total = tot)
            )
        }.sortedByDescending { it.totals.total }
    }

    suspend fun snapshotDay(dayStart: Long) = withContext(Dispatchers.IO) {
        if (!UsageAccess.has(context)) return@withContext
        val range = RangeUtils.calendarDayRange(dayStart)
        val perNetwork = WifiSessions.isEnabled(context)

        val mobile = statsReader.appUsage(UsageQuery(range.start, range.end, "MOBILE"))
        val wifiSlices = if (perNetwork) {
            statsReader.appUsageByWifiNetwork(WifiUsageQuery(range.start, range.end)).networks
        } else {
            val w = statsReader.appUsage(UsageQuery(range.start, range.end, "WIFI"))
            listOf(WifiNetworkSlice(ssid = null, apps = w.apps, totals = UsageTotals(0, 0, 0)))
        }

        val entities = ArrayList<DailyUsageEntity>()

        for (a in mobile.apps) {
            entities.add(
                DailyUsageEntity(
                    dayStart = dayStart,
                    uid = a.uid,
                    network = "MOBILE",
                    ssid = "",
                    appName = a.name,
                    packageName = a.packageName,
                    download = a.download,
                    upload = a.upload
                )
            )
        }

        for (slice in wifiSlices) {
            val ssidVal = slice.ssid ?: ""
            for (a in slice.apps) {
                entities.add(
                    DailyUsageEntity(
                        dayStart = dayStart,
                        uid = a.uid,
                        network = "WIFI",
                        ssid = ssidVal,
                        appName = a.name,
                        packageName = a.packageName,
                        download = a.download,
                        upload = a.upload
                    )
                )
            }
        }

        dao.deleteDay(dayStart)
        dao.insertAll(entities)
    }

    suspend fun pruneOldHistory(): Int = withContext(Dispatchers.IO) {
        val cutoff = RangeUtils.historyCutoff()
        dao.pruneOlderThan(cutoff)
    }

    suspend fun performBackgroundCheck() = withContext(Dispatchers.IO) {
        val now = System.currentTimeMillis()

        // 1. Snapshot yesterday if not already snapshotted
        val yesterdayMidnight = RangeUtils.midnight(now, -1)
        snapshotDay(yesterdayMidnight)

        // 2. Prune old history (> 7 months)
        pruneOldHistory()

        // 3. Evaluate limits and alert if needed
        checkLimitsAndNotify(now)
    }

    private suspend fun checkLimitsAndNotify(now: Long) {
        val settings = settingsRepo.loadSettings()
        if (settings.mobileLimitBytes == null && settings.wifiLimitBytes == null) return

        val cycleRange = RangeUtils.billingCycleRange(settings.cycleStartDay, now)

        if (settings.mobileLimitBytes != null) {
            val usage = getUsage(cycleRange, "MOBILE")
            val totalMobile = usage.sumOf { it.total }
            evaluateThreshold(
                network = "mobile",
                usedBytes = totalMobile,
                limitBytes = settings.mobileLimitBytes,
                warnPercent = settings.mobileWarnAtPercent,
                cycleStart = cycleRange.start,
                settings = settings
            )
        }

        if (settings.wifiLimitBytes != null) {
            val usage = getUsage(cycleRange, "WIFI")
            val totalWifi = usage.sumOf { it.total }
            evaluateThreshold(
                network = "wifi",
                usedBytes = totalWifi,
                limitBytes = settings.wifiLimitBytes,
                warnPercent = settings.wifiWarnAtPercent,
                cycleStart = cycleRange.start,
                settings = settings
            )
        }
    }

    private fun evaluateThreshold(
        network: String,
        usedBytes: Long,
        limitBytes: Long,
        warnPercent: Int,
        cycleStart: Long,
        settings: AppSettings
    ) {
        if (limitBytes <= 0) return
        val percent = (usedBytes.toDouble() / limitBytes.toDouble()) * 100.0

        val warnKey = "limit-$network-$cycleStart-warn"
        val reachedKey = "limit-$network-$cycleStart-reached"

        if (percent >= 100.0 && !settings.alertedKeys.contains(reachedKey)) {
            settingsRepo.markAlertKey(reachedKey)
            sendNotification(
                id = if (network == "mobile") 1001 else 1002,
                title = if (network == "mobile") "Mobile Data Limit Reached" else "Wi-Fi Data Limit Reached",
                body = "You have used 100% of your ${formatBytes(limitBytes)} $network data limit."
            )
        } else if (percent >= warnPercent && !settings.alertedKeys.contains(warnKey)) {
            settingsRepo.markAlertKey(warnKey)
            sendNotification(
                id = if (network == "mobile") 1003 else 1004,
                title = if (network == "mobile") "Mobile Data Warning" else "Wi-Fi Data Warning",
                body = "You have used ${percent.toInt()}% of your ${formatBytes(limitBytes)} $network data limit."
            )
        }
    }

    private fun sendNotification(id: Int, title: String, body: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
        val openIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(
                context,
                id,
                it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        val notif = NotificationCompat.Builder(context, NetTrackApplication.CHANNEL_ALERTS)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(R.drawable.notification_icon)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(openIntent)
            .build()

        nm.notify(id, notif)
    }

    fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024) return String.format("%.1f KB", kb)
        val mb = kb / 1024.0
        if (mb < 1024) return String.format("%.1f MB", mb)
        val gb = mb / 1024.0
        return String.format("%.2f GB", gb)
    }

    private fun mergeUsage(a: List<AppUsageItem>, b: List<AppUsageItem>): List<AppUsageItem> {
        val byUid = LinkedHashMap<Int, AppUsageItem>()
        for (item in (a + b)) {
            val existing = byUid[item.uid]
            if (existing == null) {
                byUid[item.uid] = item.copy()
            } else {
                val rx = existing.download + item.download
                val tx = existing.upload + item.upload
                byUid[item.uid] = existing.copy(
                    download = rx,
                    upload = tx,
                    total = rx + tx,
                    foreground = existing.foreground + item.foreground,
                    background = existing.background + item.background
                )
            }
        }
        val merged = byUid.values.toList()
        val grandTotal = merged.sumOf { it.total }
        return merged.map {
            val pct = if (grandTotal > 0) (it.total.toDouble() / grandTotal.toDouble()) * 100.0 else 0.0
            it.copy(percentage = pct)
        }.sortedByDescending { it.total }
    }

    private fun mergeWifiSlices(a: List<WifiNetworkSlice>, b: List<WifiNetworkSlice>): List<WifiNetworkSlice> {
        val bySsid = LinkedHashMap<String?, MutableList<AppUsageItem>>()
        for (slice in (a + b)) {
            val list = bySsid.getOrPut(slice.ssid) { ArrayList() }
            list.addAll(slice.apps)
        }

        return bySsid.map { (ssid, rawApps) ->
            val mergedApps = mergeUsage(rawApps, emptyList())
            val rx = mergedApps.sumOf { it.download }
            val tx = mergedApps.sumOf { it.upload }
            WifiNetworkSlice(
                ssid = ssid,
                apps = mergedApps,
                totals = UsageTotals(download = rx, upload = tx, total = rx + tx)
            )
        }.sortedByDescending { it.totals.total }
    }

    companion object {
        @Volatile
        private var INSTANCE: UsageRepository? = null

        fun getInstance(context: Context): UsageRepository {
            return INSTANCE ?: synchronized(this) {
                val instance = UsageRepository(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }
    }
}
