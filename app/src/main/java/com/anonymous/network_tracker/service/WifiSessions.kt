package com.anonymous.network_tracker.service

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

object WifiSessions {

    private const val PREFS = "network-usage-wifi-sessions"
    private const val KEY_LOG = "transitions"
    private const val KEY_ENABLED = "watch-enabled"
    private const val KEY_SEEN = "last-seen"

    private const val RETENTION_MS = 120L * 24 * 60 * 60 * 1000
    private const val MAX_ENTRIES = 20_000
    private const val LIVENESS_GRACE_MS = 60L * 60 * 1000

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun readLog(context: Context): JSONArray =
        try {
            JSONArray(prefs(context).getString(KEY_LOG, "[]"))
        } catch (_: Exception) {
            JSONArray()
        }

    fun isEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
        WifiWatchService.sync(context)
    }

    @Synchronized
    fun markSeen(context: Context, at: Long = System.currentTimeMillis()) {
        val seen = lastSeen(context)
        val editor = prefs(context).edit()
        if (at < seen) {
            val log = readLog(context)
            // Wall-clock ranges now overlap; retain only history before the new observation.
            while (log.length() > 0 && log.getJSONObject(log.length() - 1).getLong("at") >= at) {
                log.remove(log.length() - 1)
            }
            log.put(JSONObject().put("at", at).put("ssid", JSONObject.NULL))
            editor.putString(KEY_LOG, trim(log, at).toString())
        } else if (seen > 0 && at - seen > LIVENESS_GRACE_MS) {
            val log = readLog(context)
            val last = log.optJSONObject(log.length() - 1)
            val gapStart = seen + LIVENESS_GRACE_MS
            if (last != null && !last.isNull("ssid") && gapStart > last.getLong("at")) {
                // Persist the old cutoff before a fresh heartbeat can extend it.
                log.put(JSONObject().put("at", gapStart).put("ssid", JSONObject.NULL))
                editor.putString(KEY_LOG, trim(log, at).toString())
            }
        }
        editor.putLong(KEY_SEEN, at).apply()
    }

    fun lastSeen(context: Context): Long =
        prefs(context).getLong(KEY_SEEN, 0L)

    @Synchronized
    fun record(context: Context, ssid: String?) {
        // Capture time under the same lock so queued callbacks cannot look like clock rollback.
        record(context, System.currentTimeMillis(), ssid)
    }

    @Synchronized
    fun record(context: Context, at: Long, ssid: String?) {
        markSeen(context, at)
        val log = readLog(context)
        val normalized = ssid?.takeIf { it.isNotBlank() }

        if (log.length() > 0) {
            val last = log.getJSONObject(log.length() - 1)
            val lastSsid = if (last.isNull("ssid")) null else last.getString("ssid").takeIf { it.isNotBlank() }
            val lastAt = last.getLong("at")
            if (lastSsid == normalized) return
            if (at < lastAt) return
            if (at == lastAt) log.remove(log.length() - 1)
        }

        val entry = JSONObject().apply {
            put("at", at)
            if (normalized != null) put("ssid", normalized) else put("ssid", JSONObject.NULL)
        }
        log.put(entry)

        val trimmed = trim(log, at)
        prefs(context).edit()
            .putString(KEY_LOG, trimmed.toString())
            .putLong(KEY_SEEN, at)
            .apply()
    }

    private fun trim(log: JSONArray, now: Long): JSONArray {
        val cutoff = now - RETENTION_MS
        var dropCount = 0
        while (dropCount < log.length() - 1 && log.getJSONObject(dropCount + 1).getLong("at") < cutoff) {
            dropCount++
        }
        val excess = (log.length() - dropCount) - MAX_ENTRIES
        if (excess > 0) dropCount += excess

        if (dropCount <= 0) return log

        val out = JSONArray()
        for (i in dropCount until log.length()) {
            out.put(log.get(i))
        }
        return out
    }

    data class Session(val ssid: String, val start: Long, val end: Long)

    @Synchronized
    fun sessions(context: Context, start: Long, end: Long, now: Long = System.currentTimeMillis()): List<Session> {
        val log = readLog(context)
        if (log.length() == 0) return emptyList()

        val list = ArrayList<Session>()
        val openEnd = openSessionEnd(context, now)

        for (i in 0 until log.length()) {
            val entry = log.getJSONObject(i)
            val sStart = entry.getLong("at")
            val ssid = if (entry.isNull("ssid")) null else entry.getString("ssid").takeIf { it.isNotBlank() }

            val sEnd = if (i + 1 < log.length()) {
                log.getJSONObject(i + 1).getLong("at")
            } else {
                openEnd
            }

            if (ssid != null && sEnd > start && sStart < end) {
                list.add(Session(ssid, sStart, sEnd))
            }
        }
        return list
    }

    private fun openSessionEnd(context: Context, now: Long): Long {
        val seen = lastSeen(context)
        return if (seen > 0 && now - seen > LIVENESS_GRACE_MS) seen + LIVENESS_GRACE_MS else now
    }

    fun knownNetworks(context: Context): List<String> {
        val log = readLog(context)
        val seen = LinkedHashSet<String>()
        for (i in log.length() - 1 downTo 0) {
            val obj = log.getJSONObject(i)
            if (!obj.isNull("ssid")) obj.getString("ssid").takeIf { it.isNotBlank() }?.let { seen.add(it) }
        }
        return seen.toList()
    }

    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_LOG).remove(KEY_SEEN).apply()
    }
}
