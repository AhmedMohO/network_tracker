package expo.modules.networkusage

import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
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

    /**
     * The same per-app Wi-Fi totals `appUsage` returns, split by which network
     * the bytes were used on.
     *
     * Android will not answer this question directly — `NetworkStats.Bucket`
     * has no SSID and the per-network templates Settings uses are hidden — so
     * the split is reconstructed: `WifiSessions` remembers when the connected
     * network changed, and every bucket here is apportioned across the sessions
     * it overlaps in proportion to how much of the bucket each one covers.
     *
     * That proportion is the honest part and the approximate part at once.
     * System buckets are hours wide, so a network switched at 20:30 splits that
     * hour's bytes evenly between two networks rather than by what was actually
     * transferred on each side. Boundary error is bounded by one bucket per
     * switch and vanishes over a day; do not present these figures as exact to
     * the byte.
     *
     * `queryDetails` once for the whole range rather than `querySummary` once
     * per session: a month with a dozen switches a day is several hundred
     * sessions, and that many round trips through NetworkStatsManager is
     * seconds of blocked work for an answer one pass already contains.
     *
     * Wi-Fi only. Mobile has the same problem with no equivalent answer — the
     * per-SIM breakdown needs a `subscriberId` that has been carrier-privileged
     * since Android 10 — so mobile stays one bucket and callers keep using
     * `appUsage` for it.
     */
    @Suppress("DEPRECATION")
    fun appUsageByWifiNetwork(q: WifiUsageQuery): Map<String, Any?> {
        val now = System.currentTimeMillis()
        val sessions = WifiSessions.sessions(context, q.start, q.end, now)

        // ssid ("" = observed but not on Wi-Fi, null key = never observed)
        //   -> uid -> [rx, tx, rxForeground, txForeground]
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
        } catch (e: SecurityException) {
            throw UsageAccessDeniedException()
        }

        stats.use { s ->
            val b = NetworkStats.Bucket()
            while (s.hasNextBucket()) {
                s.getNextBucket(b)
                // Tagged rows are a subset of TAG_NONE rows — see `appUsage`.
                if (b.tag != NetworkStats.Bucket.TAG_NONE) continue

                if (b.startTimeStamp < coveredStart) coveredStart = b.startTimeStamp
                if (b.endTimeStamp > coveredEnd) coveredEnd = b.endTimeStamp

                // Clipped to the request: `queryDetails` rounds outward to
                // whole buckets, and apportioning the parts that fall outside
                // the range would credit a network for time nobody asked about.
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
                // Whatever the log has no opinion about — before tracking was
                // switched on, a gap where the watch was not running, or the
                // tail of a session nothing was left alive to close
                // (`WifiSessions.openSessionEnd`). It is reported as its own
                // unattributed bucket rather than being dropped, so the
                // per-network figures add up to the Wi-Fi total the rest of the
                // app shows — to within the truncation in `add`, which is under
                // a byte per bucket per session and invisible beside a
                // megabyte.
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
        val networks = byNetwork.entries
            .map { (ssid, apps) ->
                mapOf(
                    "ssid" to ssid,
                    "totalBytes" to apps.values.sumOf { it[0] + it[1] },
                    "apps" to apps.map { (uid, v) ->
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
                )
            }
            .sortedByDescending { it["totalBytes"] as Long }

        return mapOf(
            "networks" to networks,
            "coveredStart" to coveredStart,
            "coveredEnd" to coveredEnd
        )
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
                        "metered" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) b.metered else null,
                        "roaming" to b.roaming,
                        "defaultNetwork" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) b.defaultNetworkStatus else null,
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
