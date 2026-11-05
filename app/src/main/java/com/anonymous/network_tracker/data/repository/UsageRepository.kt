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

        db.withTransaction {
            dao.deleteDay(dayStart)
            dao.insertAll(entities)
        }
    }

    suspend fun pruneOldHistory(): Int = withContext(Dispatchers.IO) {
        val cutoff = RangeUtils.historyCutoff()
        dao.pruneOlderThan(cutoff)
    }

    suspend fun getTotals(range: DateRange, network: String = "ALL"): UsageTotals {
        val apps = getUsage(range, network)
        val rx = apps.sumOf { it.download }
        val tx = apps.sumOf { it.upload }
        return UsageTotals(rx, tx, rx + tx)
    }

    suspend fun getDayUsage(range: DateRange, network: String): List<AppUsageItem> = withContext(Dispatchers.IO) {
        val saved = readArchive(range.start, range.end, network)
        if (saved.isNotEmpty()) saved else getUsage(range, network)
    }

    suspend fun getSeries(range: DateRange, network: String = "ALL", uid: Int? = null): List<SeriesPoint> = withContext(Dispatchers.IO) {
        require(range.start < range.end) { "Start must be before end" }
        val split = RangeUtils.splitRange(range)
        val archived = split.archived?.let { old ->
            dao.getSeries(old.start, old.end, network, uid).map {
                SeriesPoint(it.day_start, RangeUtils.midnight(it.day_start, 1), it.download, it.upload)
            }
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
                for (i in 1..7) {
                    val day = RangeUtils.midnight(now, -i)
                    if (i == 1 || dao.getUsageAllNetworks(day, RangeUtils.midnight(day, 1)).isEmpty()) {
                        snapshotDay(day)
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
        val cycle = RangeUtils.billingCycleRange(settings.cycleStartDay, now)
        val lower = network.lowercase(Locale.US)
        val today = dayKey(now)
        settingsRepo.update { it.copy(alertedKeys = AlertRules.liveKeys(it.alertedKeys, cycle.start, today)) }
        val limit = if(network == "MOBILE") settings.mobileLimitBytes else settings.wifiLimitBytes
        val warn = if(network == "MOBILE") settings.mobileWarnAtPercent else settings.wifiWarnAtPercent
        if (limit != null && limit > 0) {
            val used = getTotals(cycle, network).total
            val percent = used.toDouble() / limit * 100
            val state = if (used >= limit) "over" else if(percent >= warn) "warn" else null
            if (state != null) {
                val key = AlertRules.limitKey(lower, state, cycle.start, limit, warn)
                alertOnce(key, if(network == "MOBILE") 1001 else 1002,
                    localized(if(state == "over") "%s data limit reached" else "%s data warning", localized(network)),
                    localized("You have used %s%% of your %s data limit.",percent.toInt(),formatBytes(limit)))
                return
            }
        }
        if (network == "WIFI" && (limit == null || limit <= 0)) return
        val spikeKey = "$lower:spike:$today"
        if (settingsRepo.loadSettings().alertedKeys.contains(spikeKey)) return
        val todayTotal = getTotals(DateRange(RangeUtils.midnight(now), now), network).total
        val history = (1..14).map { getTotals(RangeUtils.calendarDayRange(now,-it),network).total }
        if (AlertRules.detectSpike(history,todayTotal)) {
            alertOnce(spikeKey, if(network == "MOBILE") 1003 else 1004,
                localized("Unusual %s data usage", localized(network)),
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
