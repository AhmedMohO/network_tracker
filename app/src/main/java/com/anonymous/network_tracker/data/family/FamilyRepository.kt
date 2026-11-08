package com.anonymous.network_tracker.data.family

import android.content.Context
import android.os.Build
import com.anonymous.network_tracker.core.LiveProbe
import com.anonymous.network_tracker.data.api.SupabaseRpc
import com.anonymous.network_tracker.data.repository.AlertRules
import com.anonymous.network_tracker.data.repository.AppSettings
import com.anonymous.network_tracker.data.repository.ExpoStorageBridge
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.push.FamilyPushRegistration
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.text.DateFormat
import java.util.Date

class FamilyRepository private constructor(private val context: Context) {
    private val settings = SettingsRepository.getInstance(context)
    private val usage get() = UsageRepository.getInstance(context)
    private val mutex = Mutex()

    suspend fun becomeParent(label: String): AppSettings = withContext(Dispatchers.IO) { mutex.withLock {
        val current = settings.loadSettings()
        if (current.pairToken != null) {
            require(current.familyRole == "parent") { "Unpair before changing your family role." }
            return@withLock current
        }
        settings.update { it.copy(familyRole = "parent", pairToken = newFamilyId(), deviceId = newFamilyId(),
            deviceLabel = label.trim().ifBlank { Build.MODEL }) }
    } }

    suspend fun join(pair: Pairing): AppSettings = withContext(Dispatchers.IO) { mutex.withLock {
        val current = settings.loadSettings()
        require(current.pairToken == null || current.pairToken == pair.token) { "Unpair from your current family first." }
        if (current.pairToken == pair.token) return@withLock current
        settings.update { it.copy(familyRole = "child", pairToken = pair.token, deviceId = newFamilyId(),
            pairedLabel = pair.label, deviceLabel = it.deviceLabel ?: Build.MODEL) }
    } }

    suspend fun unpair() = withContext(Dispatchers.IO) { mutex.withLock {
        val current = settings.loadSettings()
        val token = current.pairToken ?: return@withLock
        if (current.familyRole == "child") {
            SupabaseRpc.familyRemoveDevice(token, requireNotNull(current.deviceId) { "Missing child device ID" })
        } else SupabaseRpc.familyForget(token)
        ExpoStorageBridge.removeItem(context, "family.cache.$token")
        settings.updateWithExtras { current, extra ->
            for (key in listOf("pushToken", "nativeFcmToken", "backfillDoneUntil", "familyUploadedDays", "pendingLimitRequest", "appliedGrantRequestAt",
                "syncErrorNotifiedAt", "childQuietNotifiedAt", "childRequestNotifiedAt", "familyNotificationKeys", "childLimits")) extra.put(key, JSONObject.NULL)
            current.copy(familyRole = null, pairToken = null, deviceId = null, deviceLabel = null,
                pairedLabel = null, lastSyncOkAt = null, lastSyncErrorAt = null)
        }
        runCatching { FamilyPushRegistration.disable(context) }
    } }

    suspend fun readCache(): List<FamilySnapshot> = withContext(Dispatchers.IO) {
        val token = settings.loadSettings().pairToken ?: return@withContext emptyList()
        readCacheFor(token)
    }

    private fun readCacheFor(token: String): List<FamilySnapshot> {
        val raw = ExpoStorageBridge.getItem(context, "family.cache.$token") ?: return emptyList()
        val parsed = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val rows = (0 until parsed.length()).mapNotNull { i -> runCatching { FamilySnapshot.fromCacheJson(parsed.getJSONObject(i)) }.getOrNull() }
        return mergeFamilyCache(rows, emptyList(), RangeUtils.historyCutoff())
    }

    private suspend fun refreshCache(token: String): List<FamilySnapshot> {
        val cached = readCacheFor(token)
        val since = ((cached.maxOfOrNull { it.updatedAt } ?: 0) - 1).coerceAtLeast(0)
        val fresh = SupabaseRpc.familyPull(token, since)
        val rows = (0 until fresh.length()).map { FamilySnapshot.fromWire(fresh.getJSONObject(it)) }
        val merged = mergeFamilyCache(cached, rows, RangeUtils.historyCutoff())
        ExpoStorageBridge.setItem(context, "family.cache.$token", JSONArray().apply { merged.forEach { put(it.toCacheJson()) } }.toString())
        return merged
    }

    suspend fun sync(now: Long = System.currentTimeMillis()) = withContext(Dispatchers.IO) { mutex.withLock {
        val current = settings.loadSettings()
        val token = current.pairToken ?: return@withLock
        try {
            try { FamilyPushRegistration.register(context) }
            catch (e: CancellationException) { throw e }
            catch (e: Exception) { android.util.Log.w("FamilyPush", "Push registration deferred", e) }
            when (current.familyRole) {
                "parent" -> refreshCache(token)
                "child" -> syncChild(current, token, now)
                else -> return@withLock
            }
            settings.update { it.copy(lastSyncOkAt = now, lastSyncErrorAt = null) }
        } catch (e: CancellationException) { throw e
        } catch (e: Exception) {
            settings.update { it.copy(lastSyncErrorAt = it.lastSyncErrorAt ?: now) }
            throw e
        }
    } }

    private suspend fun syncChild(current: AppSettings, token: String, now: Long) {
        if (!com.anonymous.network_tracker.core.UsageAccess.has(context)) {
            throw com.anonymous.network_tracker.core.UsageAccessDeniedException()
        }
        val id = current.deviceId ?: settings.update { it.copy(deviceId = newFamilyId()) }.deviceId!!
        val label = current.deviceLabel ?: Build.MODEL
        val today = DateRange(RangeUtils.midnight(now), now)
        val payload = loadPayload(today).put("at", now).put("coverage", JSONObject().put("start", today.start).put("end", today.end))
        val deviceContext = JSONObject()
            .put("foregroundPackage", runCatching { LiveProbe.foregroundPackage(context) }.getOrNull() ?: JSONObject.NULL)
            .put("batteryPercent", runCatching { LiveProbe.batteryPercent(context) }.getOrNull() ?: JSONObject.NULL)
            .put("connection", runCatching { LiveProbe.connection(context) }.getOrDefault("NONE"))
        payload.put("context", deviceContext)
        SupabaseRpc.familyPush(token, id, label, "recent", 0, payload)

        val pending = settings.readExtras().optJSONObject("pendingLimitRequest")
        if (pending != null) {
            val requestAt = pending.optLong("at")
            val response = SupabaseRpc.familyPull(token, (requestAt - 3_600_000).coerceAtLeast(0))
            val grant = (0 until response.length()).map { FamilySnapshot.fromWire(response.getJSONObject(it)) }
                .filter { it.kind == "grant" && it.deviceId == id }.maxByOrNull { it.updatedAt }
            settings.updateWithExtras { latest, extra ->
                val stillPending = extra.optJSONObject("pendingLimitRequest")?.optLong("at")
                if (grant != null && grant.payload.has("grantedBytes") && grant.payload.optLong("requestAt") == requestAt) {
                    val applied = if (extra.isNull("appliedGrantRequestAt")) null else extra.optLong("appliedGrantRequestAt")
                    val outcome = applyGrant(grant.payload.getLong("grantedBytes"), grant.payload.getLong("requestAt"), stillPending, applied, latest.mobileLimitBytes)
                    extra.put("appliedGrantRequestAt", outcome.appliedRequestAt)
                    if (outcome.clearPending) extra.put("pendingLimitRequest", JSONObject.NULL)
                    if (outcome.apply) latest.copy(mobileLimitBytes = outcome.newLimitBytes) else latest
                } else {
                    if (stillPending == requestAt && now - requestAt > 3 * 86_400_000L) extra.put("pendingLimitRequest", JSONObject.NULL)
                    latest
                }
            }
        }

        val oldestWanted = RangeUtils.midnight(now, -30)
        val saved = settings.readExtras().optJSONArray("familyUploadedDays") ?: JSONArray()
        val uploaded = (0 until saved.length()).map { saved.optLong(it) }
            .filter { it >= oldestWanted && it < RangeUtils.midnight(now) }.toMutableSet()
        for (day in familyDaysToUpload(now, uploaded)) {
            pushDay(token, id, label, day)
            uploaded.add(day)
            settings.patchExtras(JSONObject().put("familyUploadedDays", JSONArray(uploaded.sorted())))
        }
    }

    private suspend fun pushDay(token: String, id: String, label: String, day: Long) {
        val payload = loadPayload(RangeUtils.calendarDayRange(day))
        if (payload.getJSONArray("apps").length() > 0) SupabaseRpc.familyPush(token, id, label, "daily", day, payload)
    }

    private suspend fun loadPayload(range: DateRange): JSONObject {
        val completeDay = range.end == RangeUtils.midnight(range.start, 1)
        val mobile = if (completeDay) usage.getDayUsage(range, "MOBILE") else usage.getUsage(range, "MOBILE")
        val wifi = if (completeDay) usage.getDayUsage(range, "WIFI") else usage.getUsage(range, "WIFI")
        val all = if (completeDay) usage.getDayUsage(range, "ALL") else usage.getUsage(range, "ALL")
        val networks = if (WifiSessions.isEnabled(context)) usage.getUsageByWifiNetwork(range) else null
        return familyPayload(all, mobile, wifi, networks)
    }

    suspend fun requestMore(bytes: Long, now: Long = System.currentTimeMillis()) = withContext(Dispatchers.IO) { mutex.withLock {
        require(bytes > 0) { "Enter an amount above zero." }
        val current = settings.loadSettings()
        require(current.familyRole == "child") { "Only a child device can request data." }
        val token = requireNotNull(current.pairToken)
        val id = requireNotNull(current.deviceId)
        val request = JSONObject().put("askedBytes", bytes).put("at", now)
        SupabaseRpc.familyPush(token, id, current.deviceLabel ?: Build.MODEL, "request", 0, request)
        settings.patchExtras(JSONObject().put("pendingLimitRequest", request))
    } }

    suspend fun cancelRequest(now: Long = System.currentTimeMillis()) = withContext(Dispatchers.IO) { mutex.withLock {
        val current = settings.loadSettings()
        val token = requireNotNull(current.pairToken)
        SupabaseRpc.familyPush(token, requireNotNull(current.deviceId), current.deviceLabel ?: Build.MODEL,
            "request", 0, JSONObject().put("askedBytes", 0).put("at", now))
        settings.patchExtras(JSONObject().put("pendingLimitRequest", JSONObject.NULL))
    } }

    suspend fun answer(child: FamilyChild, requestAt: Long, bytes: Long, now: Long = System.currentTimeMillis()) = withContext(Dispatchers.IO) { mutex.withLock {
        require(bytes >= 0 && requestAt > 0) { "Invalid data grant." }
        val current = settings.loadSettings()
        require(current.familyRole == "parent") { "Only a parent device can answer requests." }
        val token = requireNotNull(current.pairToken)
        SupabaseRpc.familyPush(token, child.id, child.label, "grant", 0,
            JSONObject().put("grantedBytes", bytes).put("at", now).put("requestAt", requestAt))
        refreshCache(token)
    } }

    fun setChildLimit(childId: String, bytes: Long?, warnPercent: Int) {
        require(bytes == null || bytes > 0) { "Enter an amount above zero." }
        settings.updateWithExtras { current, extra ->
            val limits = extra.optJSONObject("childLimits") ?: JSONObject()
            if (bytes == null) limits.remove(childId) else limits.put(childId,
                JSONObject().put("mobileLimitBytes", bytes).put("warnAtPercent", warnPercent.coerceIn(1, 100)))
            extra.put("childLimits", limits)
            current
        }
    }

    suspend fun checkAlerts(now: Long) = withContext(Dispatchers.IO) {
        val current = settings.loadSettings()
        if (current.pairToken == null) return@withContext
        val extra = settings.readExtras()
        if (current.familyRole == "parent") {
            val rows = readCache()
            for (child in familyChildren(rows)) {
                val snapshots = rows.filter { it.deviceId == child.id }
                val latestGrant = snapshots.filter { it.kind == "grant" }.maxByOrNull { it.updatedAt }
                val request = snapshots.filter { it.kind == "request" }.maxByOrNull { it.updatedAt }?.payload
                val requestAt = request?.optLong("at") ?: 0
                val notifiedAt = extra.optJSONObject("childRequestNotifiedAt")?.optLong(child.id)
                if (shouldNotifyRequest(request?.optLong("askedBytes") ?: 0, requestAt, latestGrant?.payload?.optLong("requestAt"), notifiedAt)) {
                    if (notify("request:${child.id}", usage.localized("%s is asking for more data", child.label), usage.localized("Requested %s.", usage.formatBytes(request!!.getLong("askedBytes")))))
                        stampChild("childRequestNotifiedAt", child.id, requestAt)
                }
                if (child.lastSeen > 0 && now - child.lastSeen > 86_400_000L && extra.optJSONObject("childQuietNotifiedAt")?.optLong(child.id) != child.lastSeen) {
                    if (notify("quiet:${child.id}", usage.localized("%s has not checked in", child.label), usage.localized("Last update: %s.", DateFormat.getDateTimeInstance().format(Date(child.lastSeen)))))
                        stampChild("childQuietNotifiedAt", child.id, child.lastSeen)
                }
                if (now - child.lastSeen <= 3 * 3_600_000L) checkChildUsage(child, snapshots, current, extra, now)
            }
        }
        val error = current.lastSyncErrorAt
        if (error != null && now - error > 2 * 86_400_000L && extra.optLong("syncErrorNotifiedAt") != error) {
            if (notify("sync-broken", "Family sharing has stopped updating", "Open Family Sharing to retry and check the connection."))
                settings.patchExtras(JSONObject().put("syncErrorNotifiedAt", error))
        }
    }

    private suspend fun checkChildUsage(child: FamilyChild, snapshots: List<FamilySnapshot>, current: AppSettings, extra: JSONObject, now: Long) {
        val cycle = RangeUtils.billingCycleRange(current.cycleStartDay, now)
        val today = RangeUtils.midnight(now)
        fun once(key: String, title: String, body: String) {
            AlertRules.deliverOnce(settings.loadSettings().alertedKeys, key,
                { notify(key, title, body) }, settings::markAlertKey)
        }
        val limits = extra.optJSONObject("childLimits")?.optJSONObject(child.id)
        val limit = limits?.optLong("mobileLimitBytes") ?: 0
        if (limit > 0) {
            val used = buildFamilySeries(snapshots, cycle.start, now, "ALL", now).total
            val warn = limits!!.optInt("warnAtPercent", 80)
            val state = if (used >= limit) "over" else if (used * 100.0 / limit >= warn) "warn" else "ok"
            if (state != "ok") once(AlertRules.limitKey("mobile", state, cycle.start, limit, warn) + ":${child.id}", usage.localized(if (state == "over") "%s: data limit reached" else "%s: data warning", child.label),
                usage.localized("%s of %s combined mobile and Wi-Fi data. Last check-in: %s.", usage.formatBytes(used), usage.formatBytes(limit), DateFormat.getDateTimeInstance().format(Date(child.lastSeen))))
        }
        val todayTotal = buildFamilySeries(snapshots, today, now, "ALL", now).total
        val history = (1..14).map { i ->
            val day = RangeUtils.midnight(now, -i)
            buildFamilySeries(snapshots, day, RangeUtils.midnight(day, 1), "ALL", now).bins.firstOrNull()?.total
        }.filterNotNull()
        val spikeDay = java.time.Instant.ofEpochMilli(today).atOffset(java.time.ZoneOffset.UTC).toLocalDate()
        if (AlertRules.detectSpike(history, todayTotal)) once("mobile:spike:$spikeDay:${child.id}", usage.localized("%s: unusually high data use", child.label),
            usage.localized("%s reported today, more than three times the recent median.", usage.formatBytes(todayTotal)))
    }

    private fun notify(key: String, title: String, body: String): Boolean = usage.sendNotification(20_000 + (key.hashCode() and 0x3fffffff), title, body)
    private fun stampChild(key: String, child: String, at: Long) {
        settings.updateWithExtras { current, extra ->
            val map = extra.optJSONObject(key) ?: JSONObject()
            map.put(child, at); extra.put(key, map); current
        }
    }

    companion object {
        @Volatile private var instance: FamilyRepository? = null
        fun getInstance(context: Context): FamilyRepository = instance ?: synchronized(this) {
            instance ?: FamilyRepository(context.applicationContext).also { instance = it }
        }
    }
}
