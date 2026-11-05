package com.anonymous.network_tracker.data.family

import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.model.WifiNetworkSlice
import com.anonymous.network_tracker.data.util.RangeUtils
import org.json.JSONArray
import org.json.JSONObject

data class FamilySnapshot(val deviceId: String, val deviceLabel: String, val kind: String, val day: Long, val payload: JSONObject, val updatedAt: Long) {
    fun toCacheJson(): JSONObject = JSONObject().put("deviceId", deviceId).put("deviceLabel", deviceLabel)
        .put("kind", kind).put("day", day).put("payload", payload).put("updatedAt", updatedAt)
    companion object {
        fun fromCacheJson(row: JSONObject) = FamilySnapshot(row.getString("deviceId"), row.optString("deviceLabel"),
            row.getString("kind"), row.optLong("day"), row.optJSONObject("payload") ?: JSONObject(), row.optLong("updatedAt"))
        fun fromWire(row: JSONObject) = FamilySnapshot(row.getString("device_id"), row.optString("device_label"),
            row.getString("kind"), row.optLong("day"), row.optJSONObject("payload") ?: JSONObject(), parseServerTimestamp(row.getString("updated_at")))
    }
}

fun mergeFamilyCache(existing: List<FamilySnapshot>, fresh: List<FamilySnapshot>, cutoff: Long): List<FamilySnapshot> {
    val rows = LinkedHashMap<Triple<String, String, Long>, FamilySnapshot>()
    for (row in existing + fresh) {
        if ((if (row.kind == "daily") row.day else row.updatedAt) < cutoff) continue
        val key = Triple(row.deviceId, row.kind, row.day)
        if (row.updatedAt >= (rows[key]?.updatedAt ?: Long.MIN_VALUE)) rows[key] = row
    }
    return rows.values.toList()
}

data class FamilyChild(val id: String, val label: String, val lastSeen: Long)
fun familyChildren(rows: List<FamilySnapshot>): List<FamilyChild> = rows.filter { it.kind != "grant" }
    .groupBy { it.deviceId }.map { (id, snapshots) ->
        val newest = snapshots.maxBy { it.updatedAt }
        FamilyChild(id, newest.deviceLabel.ifBlank { id }, newest.updatedAt)
    }.sortedByDescending { it.lastSeen }

fun familyPayload(all: List<AppUsageItem>, mobile: List<AppUsageItem>, wifi: List<AppUsageItem>, networks: List<WifiNetworkSlice>? = null): JSONObject {
    val result = JSONObject()
    for ((apps, listKey, tailKey) in listOf(Triple(all, "apps", "otherBytes"), Triple(mobile, "mobileApps", "mobileOtherBytes"), Triple(wifi, "wifiApps", "wifiOtherBytes"))) {
        val used = apps.filter { it.total > 0 }.sortedByDescending { it.total }
        result.put(listKey, JSONArray().apply {
            used.take(50).forEach { a -> put(JSONObject().put("uid", a.uid).put("name", a.name)
                .put("pkg", a.packageName ?: JSONObject.NULL).put("dl", a.download).put("ul", a.upload)) }
        })
        result.put(tailKey, used.drop(50).sumOf { it.total })
    }
    result.put("totals", JSONObject().put("mobile", mobile.sumOf { it.total }).put("wifi", wifi.sumOf { it.total }))
    networks?.let { list -> result.put("wifiNetworks", JSONArray().apply {
        list.filter { it.totals.total > 0 }.sortedByDescending { it.totals.total }.take(20).forEach {
            put(JSONObject().put("ssid", it.ssid ?: JSONObject.NULL).put("dl", it.totals.download).put("ul", it.totals.upload))
        }
    }) }
    return result
}

fun payloadApps(payload: JSONObject, network: String): List<AppUsageItem> {
    val prefix = when (network) { "MOBILE" -> "mobile"; "WIFI" -> "wifi"; else -> "" }
    val split = prefix.isNotEmpty() && payload.optJSONArray("${prefix}Apps") != null
    val list = payload.optJSONArray(if (split) "${prefix}Apps" else "apps") ?: return emptyList()
    val tail = payload.optLong(if (split) "${prefix}OtherBytes" else "otherBytes").coerceAtLeast(0)
    val apps = (0 until list.length()).mapNotNull { i ->
        val row = list.optJSONObject(i) ?: return@mapNotNull null
        val dl = row.optLong("dl").coerceAtLeast(0)
        val ul = row.optLong("ul").coerceAtLeast(0)
        AppUsageItem(row.optInt("uid"), row.optString("name", "Unknown app"),
            if (row.isNull("pkg")) null else row.optString("pkg"), dl, ul, dl + ul)
    }.toMutableList()
    if (tail > 0) apps.add(AppUsageItem(-100, "Other apps", null, 0, 0, tail))
    val total = apps.sumOf { it.total }
    return apps.map { it.copy(percentage = if (total > 0) it.total * 100.0 / total else 0.0) }
}

data class FamilyDay(val day: Long, val total: Long, val download: Long, val upload: Long)
data class FamilyNetwork(val ssid: String?, val total: Long)
data class FamilySeries(val apps: List<AppUsageItem>, val bins: List<FamilyDay>, val total: Long,
    val mobile: Long?, val wifi: Long?, val missingDays: Int, val splitMissingDays: Int, val partialDay: Long?,
    val wifiNetworks: List<FamilyNetwork> = emptyList())

fun buildFamilySeries(rows: List<FamilySnapshot>, start: Long, end: Long, network: String = "ALL", now: Long = System.currentTimeMillis(), uid: Int? = null): FamilySeries {
    val first = RangeUtils.midnight(start)
    val last = if (end > start) RangeUtils.midnight(end - 1, 1) else first
    val days = rows.filter { it.kind == "daily" && it.day >= first && it.day < last }
        .groupBy { it.day }.mapValues { (_, list) -> list.maxBy { it.updatedAt } }.toMutableMap()
    var partial: Long? = null
    rows.filter { it.kind == "recent" }.maxByOrNull { it.updatedAt }?.let { recent ->
        val day = RangeUtils.midnight(recent.payload.optLong("at", recent.updatedAt))
        if (day >= first && day < last && day !in days) { days[day] = recent; partial = day }
    }
    var mobile = 0L; var wifi = 0L; var splitMissing = 0
    val wifiNetworks = LinkedHashMap<String?, Long>()
    val allApps = ArrayList<AppUsageItem>()
    val bins = days.toSortedMap().map { (day, row) ->
        val apps = payloadApps(row.payload, network).filter { uid == null || it.uid == uid }
        allApps.addAll(apps)
        val networks = row.payload.optJSONArray("wifiNetworks")
        if (networks != null) for (i in 0 until networks.length()) {
            val entry = networks.optJSONObject(i) ?: continue
            val ssid = if (entry.isNull("ssid")) null else entry.optString("ssid")
            wifiNetworks[ssid] = (wifiNetworks[ssid] ?: 0) + entry.optLong("dl") + entry.optLong("ul")
        }
        val totals = row.payload.optJSONObject("totals")
        if (totals != null && totals.has("mobile") && totals.has("wifi")) {
            mobile += totals.optLong("mobile"); wifi += totals.optLong("wifi")
        } else if (row.payload.has("mobileApps") && row.payload.has("wifiApps")) {
            mobile += payloadApps(row.payload, "MOBILE").sumOf { it.total }
            wifi += payloadApps(row.payload, "WIFI").sumOf { it.total }
        } else splitMissing++
        FamilyDay(day, apps.sumOf { it.total }, apps.sumOf { it.download }, apps.sumOf { it.upload })
    }
    val total = bins.sumOf { it.total }
    val apps = allApps.groupBy { it.uid }.map { (_, list) ->
        val sum = list.sumOf { it.total }
        list.first().copy(download = list.sumOf { it.download }, upload = list.sumOf { it.upload }, total = sum,
            percentage = if (total > 0) sum * 100.0 / total else 0.0)
    }.sortedByDescending { it.total }
    var day = first; var count = 0
    while (day < last) { count++; day = RangeUtils.midnight(day, 1) }
    val todayMissing = if (RangeUtils.midnight(now) in first until last && RangeUtils.midnight(now) !in days) 1 else 0
    return FamilySeries(apps, bins, total, mobile.takeIf { splitMissing < days.size }, wifi.takeIf { splitMissing < days.size },
        (count - days.size - todayMissing).coerceAtLeast(0), splitMissing, partial,
        wifiNetworks.map { FamilyNetwork(it.key, it.value) }.sortedByDescending { it.total })
}

fun shouldNotifyRequest(askedBytes: Long, requestAt: Long, grantedRequestAt: Long?, notifiedAt: Long?): Boolean =
    askedBytes > 0 && requestAt > 0 && requestAt != grantedRequestAt && requestAt != notifiedAt

data class DeviceContextInfo(
    val foregroundPackage: String?,
    val foregroundAppName: String?,
    val batteryPercent: Int?,
    val connection: String?,
    val capturedAt: Long,
    val isStale: Boolean
)

fun parseDeviceContext(recent: FamilySnapshot?, now: Long = System.currentTimeMillis()): DeviceContextInfo? {
    if (recent == null || recent.kind != "recent") return null
    val context = recent.payload.optJSONObject("context") ?: return null
    val at = recent.payload.optLong("at", recent.updatedAt)
    val capturedAt = minOf(at, recent.updatedAt)
    val isStale = (now - capturedAt) > 45 * 60_000L
    val fgPkg = if (context.isNull("foregroundPackage")) null else context.optString("foregroundPackage").takeIf { it.isNotBlank() }
    val apps = payloadApps(recent.payload, "ALL")
    val fgName = fgPkg?.let { pkg -> apps.firstOrNull { it.packageName == pkg }?.name ?: pkg }
    val battery = if (context.isNull("batteryPercent")) null else context.optInt("batteryPercent").takeIf { it in 0..100 }
    val connection = if (context.isNull("connection")) null else context.optString("connection").takeIf { it.isNotBlank() }
    return DeviceContextInfo(fgPkg, fgName, battery, connection, capturedAt, isStale)
}

data class ChildRequestInfo(
    val askedBytes: Long,
    val requestAt: Long,
    val isPending: Boolean
)

fun parseChildRequest(snapshots: List<FamilySnapshot>): ChildRequestInfo? {
    val request = snapshots.filter { it.kind == "request" }.maxByOrNull { it.updatedAt } ?: return null
    val asked = request.payload.optLong("askedBytes", 0)
    val at = request.payload.optLong("at", 0)
    if (asked <= 0 || at <= 0) return null
    val grant = snapshots.filter { it.kind == "grant" }.maxByOrNull { it.updatedAt }
    val grantRequestAt = grant?.payload?.optLong("requestAt", -1) ?: -1
    val isPending = (grantRequestAt != at)
    return ChildRequestInfo(asked, at, isPending)
}

data class TodayTotalsInfo(
    val mobile: Long,
    val wifi: Long,
    val total: Long,
    val asOf: Long,
    val coverageStart: Long?,
    val coverageEnd: Long?,
    val isToday: Boolean
)

fun parseTodayTotals(recent: FamilySnapshot?, now: Long = System.currentTimeMillis()): TodayTotalsInfo? {
    if (recent == null || recent.kind != "recent") return null
    val at = recent.payload.optLong("at", recent.updatedAt)
    val dayStart = RangeUtils.midnight(now)
    val dayEnd = RangeUtils.midnight(now, 1)
    val isToday = at in dayStart until dayEnd
    val totals = recent.payload.optJSONObject("totals")
    val mobile = totals?.optLong("mobile") ?: payloadApps(recent.payload, "MOBILE").sumOf { it.total }
    val wifi = totals?.optLong("wifi") ?: payloadApps(recent.payload, "WIFI").sumOf { it.total }
    val coverage = recent.payload.optJSONObject("coverage")
    val covStart = if (coverage != null && !coverage.isNull("start")) coverage.optLong("start").takeIf { it > 0 } else null
    val covEnd = if (coverage != null && !coverage.isNull("end")) coverage.optLong("end").takeIf { it > 0 } else null
    return TodayTotalsInfo(mobile, wifi, mobile + wifi, at, covStart, covEnd, isToday)
}

data class ChildAppDay(val day: Long, val download: Long, val upload: Long, val total: Long)
data class ChildAppSeries(
    val uid: Int,
    val appName: String,
    val packageName: String?,
    val download: Long,
    val upload: Long,
    val total: Long,
    val bins: List<ChildAppDay>
)

fun buildChildAppSeries(snapshots: List<FamilySnapshot>, uid: Int, start: Long, end: Long): ChildAppSeries {
    var discoveredName = ""
    var discoveredPkg: String? = null
    for (row in snapshots) {
        if (row.kind != "daily" && row.kind != "recent") continue
        val apps = payloadApps(row.payload, "ALL")
        val match = apps.firstOrNull { it.uid == uid }
        if (match != null) {
            if (discoveredName.isBlank() && match.name.isNotBlank()) discoveredName = match.name
            if (discoveredPkg == null && match.packageName != null) discoveredPkg = match.packageName
            if (discoveredName.isNotBlank() && discoveredPkg != null) break
        }
    }
    val name = discoveredName.ifBlank { "App $uid" }
    val first = RangeUtils.midnight(start)
    val last = if (end > start) RangeUtils.midnight(end - 1, 1) else first
    val days = snapshots.filter { it.kind == "daily" && it.day >= first && it.day < last }
        .groupBy { it.day }.mapValues { (_, list) -> list.maxBy { it.updatedAt } }.toMutableMap()
    snapshots.filter { it.kind == "recent" }.maxByOrNull { it.updatedAt }?.let { recent ->
        val day = RangeUtils.midnight(recent.payload.optLong("at", recent.updatedAt))
        if (day >= first && day < last && day !in days) { days[day] = recent }
    }
    var totalDl = 0L
    var totalUl = 0L
    val bins = ArrayList<ChildAppDay>()
    for ((day, row) in days.toSortedMap()) {
        val apps = payloadApps(row.payload, "ALL")
        val match = apps.firstOrNull { it.uid == uid }
        if (match != null && match.total > 0) {
            totalDl += match.download
            totalUl += match.upload
            bins.add(ChildAppDay(day, match.download, match.upload, match.total))
        }
    }
    return ChildAppSeries(uid, name, discoveredPkg, totalDl, totalUl, totalDl + totalUl, bins)
}

data class ChildDeviceSummary(
    val deviceId: String,
    val label: String,
    val lastSeen: Long,
    val isStale: Boolean,
    val recentSnapshot: FamilySnapshot?,
    val contextInfo: DeviceContextInfo?,
    val todayTotals: TodayTotalsInfo?,
    val pendingRequest: ChildRequestInfo?,
    val cycleLimitBytes: Long?,
    val cycleWarnPercent: Int?,
    val cycleUsedBytes: Long?
)

fun summarizeChildDevice(
    deviceId: String,
    snapshots: List<FamilySnapshot>,
    cycleStartDay: Int,
    childLimitObj: JSONObject?,
    now: Long = System.currentTimeMillis()
): ChildDeviceSummary {
    val childRows = snapshots.filter { it.deviceId == deviceId }
    val newestRow = childRows.filter { it.kind != "grant" }.maxByOrNull { it.updatedAt }
    val lastSeen = newestRow?.updatedAt ?: 0L
    val label = newestRow?.deviceLabel?.ifBlank { deviceId } ?: deviceId
    val isStale = (now - lastSeen) > 3 * 3_600_000L
    val recent = childRows.filter { it.kind == "recent" }.maxByOrNull { it.updatedAt }
    val contextInfo = parseDeviceContext(recent, now)
    val todayTotals = parseTodayTotals(recent, now)
    val pendingRequest = parseChildRequest(childRows)
    val cycleLimitBytes = childLimitObj?.optLong("mobileLimitBytes")?.takeIf { it > 0 }
    val cycleWarnPercent = childLimitObj?.optInt("warnAtPercent", 80) ?: 80
    val cycleUsedBytes = if (cycleLimitBytes != null && cycleLimitBytes > 0) {
        val cycle = RangeUtils.billingCycleRange(cycleStartDay, now)
        buildFamilySeries(childRows, cycle.start, now, "ALL", now).total
    } else null
    return ChildDeviceSummary(deviceId, label, lastSeen, isStale, recent, contextInfo, todayTotals, pendingRequest, cycleLimitBytes, cycleWarnPercent, cycleUsedBytes)
}
