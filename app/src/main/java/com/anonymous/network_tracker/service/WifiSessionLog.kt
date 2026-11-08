package com.anonymous.network_tracker.service

import org.json.JSONArray
import org.json.JSONObject

internal class WifiSessionLog(raw: String?, seen: Long) {
    private var log = try { JSONArray(raw ?: "[]") } catch (_: Exception) { JSONArray() }
    var lastSeen: Long = seen
        private set
    val transitions: String get() = log.toString()

    fun interrupt(at: Long) {
        val last = log.optJSONObject(log.length() - 1)
        if (last != null && !last.isNull("ssid")) {
            // A restarted observer cannot prove which network was used after its last heartbeat.
            record(minOf(at, maxOf(last.getLong("at"), lastSeen)), null)
        }
        record(at, null)
    }

    fun markSeen(at: Long) {
        if (at < lastSeen) {
            // Wall-clock ranges now overlap; retain only history before the new observation.
            while (log.length() > 0 && log.getJSONObject(log.length() - 1).getLong("at") >= at) {
                log.remove(log.length() - 1)
            }
            log.put(JSONObject().put("at", at).put("ssid", JSONObject.NULL))
            trim(at)
        } else if (lastSeen > 0 && at - lastSeen > LIVENESS_GRACE_MS) {
            val last = log.optJSONObject(log.length() - 1)
            val gapStart = lastSeen + LIVENESS_GRACE_MS
            if (last != null && !last.isNull("ssid") && gapStart > last.getLong("at")) {
                log.put(JSONObject().put("at", gapStart).put("ssid", JSONObject.NULL))
                trim(at)
            }
        }
        lastSeen = at
    }

    fun record(at: Long, ssid: String?) {
        markSeen(at)
        val normalized = ssid?.takeIf { it.isNotBlank() }
        if (log.length() > 0) {
            val last = log.getJSONObject(log.length() - 1)
            val lastSsid = if (last.isNull("ssid")) null else last.getString("ssid").takeIf { it.isNotBlank() }
            val lastAt = last.getLong("at")
            if (lastSsid == normalized) return
            if (at < lastAt) return
            if (at == lastAt) log.remove(log.length() - 1)
        }
        log.put(JSONObject().put("at", at).put("ssid", normalized ?: JSONObject.NULL))
        trim(at)
    }

    private fun trim(now: Long) {
        val cutoff = now - RETENTION_MS
        var dropCount = 0
        while (dropCount < log.length() - 1 && log.getJSONObject(dropCount + 1).getLong("at") < cutoff) {
            dropCount++
        }
        val excess = (log.length() - dropCount) - MAX_ENTRIES
        if (excess > 0) dropCount += excess
        if (dropCount <= 0) return
        val kept = JSONArray()
        for (i in dropCount until log.length()) kept.put(log.get(i))
        log = kept
    }

    fun sessions(start: Long, end: Long, now: Long): List<WifiSessions.Session> {
        val openEnd = if (lastSeen > 0 && now - lastSeen > LIVENESS_GRACE_MS) lastSeen + LIVENESS_GRACE_MS else now
        val result = ArrayList<WifiSessions.Session>()
        for (i in 0 until log.length()) {
            val entry = log.getJSONObject(i)
            val from = entry.getLong("at")
            val ssid = if (entry.isNull("ssid")) null else entry.getString("ssid").takeIf { it.isNotBlank() }
            val to = if (i + 1 < log.length()) log.getJSONObject(i + 1).getLong("at") else openEnd
            if (ssid != null && to > start && from < end) result.add(WifiSessions.Session(ssid, from, to))
        }
        return result
    }

    fun knownNetworks(): List<String> {
        val result = LinkedHashSet<String>()
        for (i in log.length() - 1 downTo 0) {
            val entry = log.getJSONObject(i)
            if (!entry.isNull("ssid")) entry.getString("ssid").takeIf { it.isNotBlank() }?.let { result.add(it) }
        }
        return result.toList()
    }

    private companion object {
        const val RETENTION_MS = 120L * 24 * 60 * 60 * 1000
        const val MAX_ENTRIES = 20_000
        const val LIVENESS_GRACE_MS = 60L * 60 * 1000
    }
}
