package com.anonymous.network_tracker.core

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.model.SeriesQuery
import com.anonymous.network_tracker.data.model.UsageQuery
import com.anonymous.network_tracker.data.model.UsageTotals
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.model.WifiUsageQuery
import com.anonymous.network_tracker.service.WifiSessions

class UsageAccessDeniedException(message: String = "Usage access permission is not granted") :
    SecurityException(message)

data class LiveUsageResult(
    val apps: List<AppUsageItem>,
    val coveredStart: Long,
    val coveredEnd: Long
)

data class WifiUsageResult(
    val networks: List<WifiNetworkSlice>,
    val coveredStart: Long,
    val coveredEnd: Long
)

data class SeriesBin(
    val start: Long,
    val end: Long,
    val rxBytes: Long,
    val txBytes: Long
)

data class SeriesResult(
    val bins: List<SeriesBin>,
    val coveredStart: Long,
    val coveredEnd: Long
)

class StatsReader(private val context: Context) {

    private val nsm =
        context.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager

    private fun networkTypes(network: String): IntArray = when (network) {
        "MOBILE" -> intArrayOf(ConnectivityManager.TYPE_MOBILE)
        "WIFI" -> intArrayOf(ConnectivityManager.TYPE_WIFI)
        else -> intArrayOf(ConnectivityManager.TYPE_MOBILE, ConnectivityManager.TYPE_WIFI)
    }

    @Suppress("DEPRECATION")
    private inline fun forEachBucket(
        networkType: Int,
        start: Long,
        end: Long,
        body: (NetworkStats.Bucket) -> Unit
    ) {
        try {
            nsm.querySummary(networkType, null, start, end).use { stats ->
                val bucket = NetworkStats.Bucket()
                while (stats.hasNextBucket()) {
                    stats.getNextBucket(bucket)
                    body(bucket)
                }
            }
        } catch (_: SecurityException) {
            throw UsageAccessDeniedException()
        }
    }

    fun appUsage(q: UsageQuery): LiveUsageResult {
        val totals = HashMap<Int, LongArray>()
        var coveredStart = Long.MAX_VALUE
        var coveredEnd = Long.MIN_VALUE

        for (type in networkTypes(q.network)) {
            forEachBucket(type, q.start, q.end) { b ->
                if (b.tag != NetworkStats.Bucket.TAG_NONE) return@forEachBucket

                val slot = totals.getOrPut(b.uid) { LongArray(4) }
                slot[0] += b.rxBytes
                slot[1] += b.txBytes
                if (b.state == NetworkStats.Bucket.STATE_FOREGROUND) {
                    slot[2] += b.rxBytes
                    slot[3] += b.txBytes
                }
                if (b.startTimeStamp < coveredStart) coveredStart = b.startTimeStamp
                if (b.endTimeStamp > coveredEnd) coveredEnd = b.endTimeStamp
            }
        }

        if (totals.isEmpty()) {
            coveredStart = q.start
            coveredEnd = q.end
        }

        val grandTotal = totals.values.sumOf { it[0] + it[1] }
        val resolver = AppResolver(context)

        val items = totals.map { (uid, v) ->
            val rx = v[0]
            val tx = v[1]
            val total = rx + tx
            val pkg = resolver.packages(uid).firstOrNull()
            val label = resolver.label(uid) ?: (pkg ?: "UID $uid")
            val pct = if (grandTotal > 0) (total.toDouble() / grandTotal.toDouble()) * 100.0 else 0.0

            AppUsageItem(
                uid = uid,
                name = label,
                packageName = pkg,
                download = rx,
                upload = tx,
                total = total,
                foreground = v[2] + v[3],
                background = (rx - v[2]) + (tx - v[3]),
                percentage = pct
            )
        }.sortedByDescending { it.total }

        return LiveUsageResult(items, coveredStart, coveredEnd)
    }

    @Suppress("DEPRECATION")
    fun appUsageByWifiNetwork(q: WifiUsageQuery): WifiUsageResult {
        val now = System.currentTimeMillis()
        val sessions = WifiSessions.sessions(context, q.start, q.end, now)

        val byNetwork = LinkedHashMap<String?, HashMap<Int, LongArray>>()
        var coveredStart = Long.MAX_VALUE
        var coveredEnd = Long.MIN_VALUE

        fun add(ssid: String?, uid: Int, b: NetworkStats.Bucket, share: Double) {
            if (share <= 0.0) return
            val slot = byNetwork.getOrPut(ssid) { HashMap() }.getOrPut(uid) { LongArray(4) }
            val rx = (b.rxBytes * share).toLong()
            val tx = (b.txBytes * share).toLong()
            slot[0] += rx
            slot[1] += tx
            if (b.state == NetworkStats.Bucket.STATE_FOREGROUND) {
                slot[2] += rx
                slot[3] += tx
            }
        }

        val stats = try {
            nsm.queryDetails(ConnectivityManager.TYPE_WIFI, null, q.start, q.end)
        } catch (_: SecurityException) {
            throw UsageAccessDeniedException()
        }

        stats.use { s ->
            val b = NetworkStats.Bucket()
            while (s.hasNextBucket()) {
                s.getNextBucket(b)
                if (b.tag != NetworkStats.Bucket.TAG_NONE) continue

                if (b.startTimeStamp < coveredStart) coveredStart = b.startTimeStamp
                if (b.endTimeStamp > coveredEnd) coveredEnd = b.endTimeStamp

                val from = maxOf(b.startTimeStamp, q.start)
                val to = minOf(b.endTimeStamp, q.end)
                val span = to - from
                if (span <= 0) continue

                var assigned = 0L
                for (session in sessions) {
                    val overlap = minOf(to, session.end) - maxOf(from, session.start)
                    if (overlap <= 0) continue
                    add(session.ssid, b.uid, b, overlap.toDouble() / span)
                    assigned += overlap
                }
                if (assigned < span) {
                    add(null, b.uid, b, (span - assigned).toDouble() / span)
                }
            }
        }

        if (byNetwork.isEmpty()) {
            coveredStart = q.start
            coveredEnd = q.end
        }

        val resolver = AppResolver(context)
        val networks = byNetwork.entries.map { (ssid, apps) ->
            val networkRx = apps.values.sumOf { it[0] }
            val networkTx = apps.values.sumOf { it[1] }
            val networkTotal = networkRx + networkTx

            val appList = apps.map { (uid, v) ->
                val rx = v[0]
                val tx = v[1]
                val total = rx + tx
                val pkg = resolver.packages(uid).firstOrNull()
                val label = resolver.label(uid) ?: (pkg ?: "UID $uid")
                val pct = if (networkTotal > 0) (total.toDouble() / networkTotal.toDouble()) * 100.0 else 0.0

                AppUsageItem(
                    uid = uid,
                    name = label,
                    packageName = pkg,
                    download = rx,
                    upload = tx,
                    total = total,
                    foreground = v[2] + v[3],
                    background = (rx - v[2]) + (tx - v[3]),
                    percentage = pct
                )
            }.sortedByDescending { it.total }

            WifiNetworkSlice(
                ssid = ssid,
                apps = appList,
                totals = UsageTotals(download = networkRx, upload = networkTx, total = networkTotal)
            )
        }.sortedByDescending { it.totals.total }

        return WifiUsageResult(networks, coveredStart, coveredEnd)
    }

    @Suppress("DEPRECATION")
    fun series(q: SeriesQuery): SeriesResult {
        require(q.bucketMs > 0) { "bucketMs must be positive" }
        val binCountLong = (q.end - q.start) / q.bucketMs + 1
        require(binCountLong <= 2000) { "Requested range needs $binCountLong bins; widen bucketMs" }
        val binCount = binCountLong.toInt()

        val rx = LongArray(binCount)
        val tx = LongArray(binCount)
        var coveredStart = Long.MAX_VALUE
        var coveredEnd = Long.MIN_VALUE

        for (type in networkTypes(q.network)) {
            val stats = try {
                if (q.uid != null) {
                    nsm.queryDetailsForUid(type, null, q.start, q.end, q.uid)
                } else {
                    nsm.queryDetails(type, null, q.start, q.end)
                }
            } catch (_: SecurityException) {
                throw UsageAccessDeniedException()
            }

            stats.use { s ->
                val b = NetworkStats.Bucket()
                while (s.hasNextBucket()) {
                    s.getNextBucket(b)
                    if (b.tag != NetworkStats.Bucket.TAG_NONE) continue

                    val idx = Math.floorDiv(b.startTimeStamp - q.start, q.bucketMs).toInt()
                    if (idx in 0 until binCount) {
                        rx[idx] += b.rxBytes
                        tx[idx] += b.txBytes
                    }
                    if (b.startTimeStamp < coveredStart) coveredStart = b.startTimeStamp
                    if (b.endTimeStamp > coveredEnd) coveredEnd = b.endTimeStamp
                }
            }
        }

        if (coveredStart == Long.MAX_VALUE) {
            coveredStart = q.start
            coveredEnd = q.end
        }

        val bins = (0 until binCount).map { i ->
            SeriesBin(
                start = q.start + i * q.bucketMs,
                end = q.start + (i + 1) * q.bucketMs,
                rxBytes = rx[i],
                txBytes = tx[i]
            )
        }
        return SeriesResult(bins, coveredStart, coveredEnd)
    }
}

