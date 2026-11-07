package com.anonymous.network_tracker.data.repository

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.room.withTransaction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import com.anonymous.network_tracker.data.family.FamilyRepository
import com.anonymous.network_tracker.data.model.SeriesPoint
import com.anonymous.network_tracker.data.model.SeriesQuery
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import com.anonymous.network_tracker.ui.theme.Translations
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import com.anonymous.network_tracker.NetTrackApplication
import com.anonymous.network_tracker.R
import com.anonymous.network_tracker.core.StatsReader
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.db.DailyUsageEntity
import com.anonymous.network_tracker.data.db.ArchivedDayEntity
import com.anonymous.network_tracker.data.db.UsageDatabase
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.model.UsageQuery
import com.anonymous.network_tracker.data.model.UsageTotals
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.model.WifiUsageQuery
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.data.util.mergeUsage
import com.anonymous.network_tracker.data.util.archiveApps
import com.anonymous.network_tracker.data.util.archiveWifiSlices
import com.anonymous.network_tracker.data.util.preserveWifiAttribution
import com.anonymous.network_tracker.data.util.snapshotRetainsUsage
import com.anonymous.network_tracker.data.util.wifiLimitUsedBytes
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.WifiWatchService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class UsageRepository(private val context: Context) {

    private val db = UsageDatabase.getInstance(context)
    private val dao = db.dailyUsageDao()
    private val statsReader = StatsReader(context)
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
        val rows = dao.getRows(RangeUtils.midnight(start, -1), end)
            .filter { network == "ALL" || it.network == network }
        return archiveApps(rows, DateRange(start, end))
    }

    private suspend fun readArchiveByWifiNetwork(start: Long, end: Long): List<WifiNetworkSlice> {
        val rows = dao.getRows(RangeUtils.midnight(start, -1), end)
        return archiveWifiSlices(rows, DateRange(start, end))
    }

    suspend fun snapshotDay(dayStart: Long) = withContext(Dispatchers.IO) {
        if (!UsageAccess.has(context)) return@withContext
        val range = RangeUtils.calendarDayRange(dayStart)
        require(range.end <= System.currentTimeMillis()) { "Only completed days can be archived" }
        val perNetwork = WifiSessions.isEnabled(context)
        val previous = dao.getRows(range.start, range.end)

        val mobile = statsReader.appUsage(UsageQuery(range.start, range.end, "MOBILE"))
        val freshWifi = if (perNetwork) {
            statsReader.appUsageByWifiNetwork(WifiUsageQuery(range.start, range.end)).networks
        } else {
            val w = statsReader.appUsage(UsageQuery(range.start, range.end, "WIFI"))
            listOf(WifiNetworkSlice(ssid = null, apps = w.apps, totals = UsageTotals(0, 0, 0)))
        }
        val wifiSlices = preserveWifiAttribution(freshWifi, archiveWifiSlices(previous, range))

        val entities = ArrayList<DailyUsageEntity>()

        for (a in mobile.apps) {
            entities.add(
                DailyUsageEntity(
                    dayStart = range.start,
                    uid = a.uid,
                    network = "MOBILE",
                    ssid = "",
                    appName = a.name,
                    packageName = a.packageName,
                    download = a.download,
                    upload = a.upload,
                    foreground = a.foreground,
                    background = a.background,
                    dayEnd = range.end
                )
            )
        }

        for (slice in wifiSlices) {
            val ssidVal = slice.ssid ?: ""
            for (a in slice.apps) {
                entities.add(
                    DailyUsageEntity(
                        dayStart = range.start,
                        uid = a.uid,
                        network = "WIFI",
                        ssid = ssidVal,
                        appName = a.name,
                        packageName = a.packageName,
                        download = a.download,
                        upload = a.upload,
                        foreground = a.foreground,
                        background = a.background,
                        dayEnd = range.end
                    )
                )
            }
        }

        db.withTransaction {
            // Android may have pruned history sooner than our recovery window.
            if (!snapshotRetainsUsage(dao.getRows(range.start, range.end), entities)) return@withTransaction
            dao.deleteDay(range.start)
            dao.insertAll(entities)
            dao.markCompleted(ArchivedDayEntity(range.start, System.currentTimeMillis()))
        }
    }

    suspend fun pruneOldHistory(): Int = withContext(Dispatchers.IO) {
        val cutoff = RangeUtils.historyCutoff()
        db.withTransaction {
            val removed = dao.pruneOlderThan(cutoff)
            dao.pruneCompletedDays(cutoff)
            removed
        }
    }

    suspend fun getTotals(range: DateRange, network: String = "ALL"): UsageTotals {
        val apps = getUsage(range, network)
        val rx = apps.sumOf { it.download }
        val tx = apps.sumOf { it.upload }
        return UsageTotals(rx, tx, rx + tx)
    }

    suspend fun getLimitUsedBytes(range: DateRange, network: String, wifiSsid: String? = null): Long =
        if (network == "WIFI" && wifiSsid != null) wifiLimitUsedBytes(getUsageByWifiNetwork(range), wifiSsid)
        else getTotals(range, network).total

    suspend fun getDayUsage(range: DateRange, network: String): List<AppUsageItem> = withContext(Dispatchers.IO) {
        getUsage(range, network)
    }

    suspend fun getSeries(range: DateRange, network: String = "ALL", uid: Int? = null): List<SeriesPoint> = withContext(Dispatchers.IO) {
        require(range.start < range.end) { "Start must be before end" }
        val split = RangeUtils.splitRange(range)
        val archived = split.archived?.let { old ->
            dao.getRows(RangeUtils.midnight(old.start, -1), old.end)
                .filter { (network == "ALL" || it.network == network) && (uid == null || it.uid == uid) }
                .groupBy { it.dayStart }.mapNotNull { (day, rows) ->
                val from = maxOf(day, old.start)
                val to = minOf(rows.first().dayEnd ?: RangeUtils.midnight(day, 1), old.end)
                if (from >= to) return@mapNotNull null
                val apps = archiveApps(rows, DateRange(from, to))
                SeriesPoint(from, to, apps.sumOf { it.download }, apps.sumOf { it.upload }, apps.any { it.isEstimated })
            }.sortedBy { it.start }
        }.orEmpty()
        val live = split.live
        if (live == null || !UsageAccess.has(context)) return@withContext archived
        val span = live.end - live.start
        val ladder = when {
            span <= 2 * RangeUtils.DAY_MS -> 3_600_000L
            span <= 60 * RangeUtils.DAY_MS -> RangeUtils.DAY_MS
            else -> 7 * RangeUtils.DAY_MS
        }
        val bucket = maxOf(ladder, 7_200_000L, (span + 1998) / 1999)
        archived + statsReader.series(SeriesQuery(live.start, live.end, network, bucket, uid)).bins
    }

    suspend fun performBackgroundCheck() = withContext(Dispatchers.IO) {
        backgroundMutex.withLock {
            val now = System.currentTimeMillis()
            val family = FamilyRepository.getInstance(context)
            isolated("family sync") { family.sync(now) }
            for (network in listOf("MOBILE", "WIFI")) {
                isolated("$network alerts") { checkNetwork(network, now) }
            }
            isolated("archive") {
                if (UsageAccess.has(context)) {
                    val savedDays = dao.getCompletedDays(
                        RangeUtils.archiveCutoff(now), RangeUtils.midnight(now)
                    ).toSet()
                    for (day in archiveDaysToSnapshot(now, savedDays)) {
                        isolated("archive $day") { snapshotDay(day) }
                    }
                }
            }
            isolated("prune") { pruneOldHistory() }
            isolated("family alerts") { family.checkAlerts(now) }
        }
    }

    private suspend fun isolated(name: String, block: suspend () -> Unit) {
        try { block() }
        catch (e: CancellationException) { throw e }
        catch (e: Exception) { Log.w("UsageCheck", "$name failed", e) }
    }

    private fun dayKey(now: Long): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
    }.format(Date(RangeUtils.midnight(now)))

    private suspend fun checkNetwork(network: String, now: Long) {
        if (!UsageAccess.has(context)) return
        val settings = settingsRepo.loadSettings()
        val ssid = if (network == "WIFI") settings.wifiLimitSsid else null
        if (ssid != null && !WifiSessions.isEnabled(context)) return
        val cycle = RangeUtils.billingCycleRange(settings.cycleStartDay, now)
        val lower = network.lowercase(Locale.US)
        val today = dayKey(now)
        settingsRepo.update { it.copy(alertedKeys = AlertRules.liveKeys(it.alertedKeys, cycle.start, today)) }
        val limit = if(network == "MOBILE") settings.mobileLimitBytes else settings.wifiLimitBytes
        val warn = if(network == "MOBILE") settings.mobileWarnAtPercent else settings.wifiWarnAtPercent
        if (limit != null && limit > 0) {
            val used = getLimitUsedBytes(cycle, network, ssid)
            val percent = used.toDouble() / limit * 100
            val state = if (used >= limit) "over" else if(percent >= warn) "warn" else null
            if (state != null) {
                val key = AlertRules.scopedKey(AlertRules.limitKey(lower, state, cycle.start, limit, warn), ssid)
                alertOnce(key, if(network == "MOBILE") 1001 else 1002,
                    localized(if(state == "over") "%s data limit reached" else "%s data warning", ssid ?: localized(network)),
                    localized("You have used %s%% of your %s data limit.",percent.toInt(),formatBytes(limit)))
                return
            }
        }
        if (network == "WIFI" && (limit == null || limit <= 0)) return
        val spikeKey = AlertRules.scopedKey("$lower:spike:$today", ssid)
        if (settingsRepo.loadSettings().alertedKeys.contains(spikeKey)) return
        val todayTotal = getLimitUsedBytes(DateRange(RangeUtils.midnight(now), now), network, ssid)
        val history = (1..14).map { getLimitUsedBytes(RangeUtils.calendarDayRange(now,-it), network, ssid) }
        if (AlertRules.detectSpike(history,todayTotal)) {
            alertOnce(spikeKey, if(network == "MOBILE") 1003 else 1004,
                localized("Unusual %s data usage", ssid ?: localized(network)),
                localized("%s used today, at least 3 times your usual daily usage.",formatBytes(todayTotal)))
        }
    }

    private fun alertOnce(key: String, id: Int, title: String, body: String) {
        AlertRules.deliverOnce(settingsRepo.loadSettings().alertedKeys,key,
            { sendNotification(id,title,body) }, settingsRepo::markAlertKey)
    }

    fun sendNotification(id: Int, title: String, body: String): Boolean {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(NetTrackApplication.CHANNEL_ALERTS)?.importance == NotificationManager.IMPORTANCE_NONE) return false
        val openIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
            PendingIntent.getActivity(context,id,it,PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val notif = NotificationCompat.Builder(context,NetTrackApplication.CHANNEL_ALERTS)
            .setContentTitle(localized(title)).setContentText(localized(body)).setSmallIcon(R.drawable.notification_icon)
            .setAutoCancel(true).setPriority(NotificationCompat.PRIORITY_HIGH).setContentIntent(openIntent).build()
        return try { nm.notify(id,notif); true }
        catch (e: SecurityException) { false }
    }

    fun localized(text: String, vararg args: Any?): String = Translations.text(
        Translations.load(context), settingsRepo.loadSettings().language, text, *args
    )

    fun formatBytes(bytes: Long): String {
        if (bytes < 1024) return "$bytes B"
        val kb = bytes / 1024.0
        if (kb < 1024) return String.format("%.1f KB", kb)
        val mb = kb / 1024.0
        if (mb < 1024) return String.format("%.1f MB", mb)
        val gb = mb / 1024.0
        return String.format("%.2f GB", gb)
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
        private val backgroundMutex = Mutex()

        @Volatile
        private var INSTANCE: UsageRepository? = null

        fun getInstance(context: Context): UsageRepository {
            return INSTANCE ?: synchronized(this) {
                INSTANCE?.let { return@synchronized it }
                val instance = UsageRepository(context.applicationContext)
                INSTANCE = instance
                instance
            }
        }
    }
}
