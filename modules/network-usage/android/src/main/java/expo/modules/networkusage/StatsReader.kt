package expo.modules.networkusage

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import expo.modules.kotlin.exception.CodedException

class UsageAccessDeniedException :
    CodedException("Usage access permission is not granted")

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
            // subscriberId is null: unavailable to non-carrier apps on API 29+.
            nsm.querySummary(networkType, null, start, end).use { stats ->
                val bucket = NetworkStats.Bucket()
                while (stats.hasNextBucket()) {
                    stats.getNextBucket(bucket)
                    body(bucket)
                }
            }
        } catch (e: SecurityException) {
            throw UsageAccessDeniedException()
        }
    }

    fun appUsage(q: UsageQuery): List<Map<String, Any?>> {
        // uid -> [rx, tx, rxForeground, txForeground]
        val totals = HashMap<Int, LongArray>()
        var coveredStart = Long.MAX_VALUE
        var coveredEnd = Long.MIN_VALUE

        for (type in networkTypes(q.network)) {
            forEachBucket(type, q.start, q.end) { b ->
                // Tagged rows are a subset of TAG_NONE rows — counting both double-counts.
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

        val resolver = AppResolver(context)
        return totals.map { (uid, v) ->
            mapOf(
                "uid" to uid,
                "packages" to resolver.packages(uid),
                "label" to resolver.label(uid),
                "rxBytes" to v[0],
                "txBytes" to v[1],
                "rxForegroundBytes" to v[2],
                "txForegroundBytes" to v[3],
                "coveredStart" to coveredStart,
                "coveredEnd" to coveredEnd
            )
        }
    }

    @Suppress("DEPRECATION")
    fun series(q: SeriesQuery): Map<String, Any?> {
        require(q.bucketMs > 0) { "bucketMs must be positive" }
        val binCountLong = (q.end - q.start) / q.bucketMs + 1
        if (binCountLong > 2000) {
            throw CodedException("Requested range needs $binCountLong bins; widen bucketMs")
        }
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
            } catch (e: SecurityException) {
                throw UsageAccessDeniedException()
            }

            stats.use { s ->
                val b = NetworkStats.Bucket()
                while (s.hasNextBucket()) {
                    s.getNextBucket(b)
                    if (b.tag != NetworkStats.Bucket.TAG_NONE) continue

                    // A bucket is assigned whole to the bin containing its start.
                    // System buckets are hours wide, so this is an attribution
                    // choice, not a measurement — the UI must show coveredStart/End.
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
            mapOf(
                "start" to q.start + i * q.bucketMs,
                "end" to q.start + (i + 1) * q.bucketMs,
                "rxBytes" to rx[i],
                "txBytes" to tx[i]
            )
        }
        return mapOf(
            "bins" to bins,
            "coveredStart" to coveredStart,
            "coveredEnd" to coveredEnd
        )
    }

    /** Diagnostics only: raw rows with no filtering or summing. */
    fun dumpBuckets(q: UsageQuery): List<Map<String, Any?>> {
        val out = ArrayList<Map<String, Any?>>()
        for (type in networkTypes(q.network)) {
            forEachBucket(type, q.start, q.end) { b ->
                out.add(
                    mapOf(
                        "networkType" to type,
                        "uid" to b.uid,
                        "tag" to b.tag,
                        "state" to b.state,
                        "metered" to b.metered,
                        "roaming" to b.roaming,
                        "defaultNetwork" to b.defaultNetwork,
                        "startTime" to b.startTimeStamp,
                        "endTime" to b.endTimeStamp,
                        "rxBytes" to b.rxBytes,
                        "txBytes" to b.txBytes
                    )
                )
            }
        }
        return out
    }
}
