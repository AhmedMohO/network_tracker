package com.anonymous.network_tracker.data.repository

import java.net.URLEncoder

object AlertRules {
    fun scopedKey(key: String, ssid: String?): String =
        if (ssid == null) key else "$key:ssid=${URLEncoder.encode(ssid, "UTF-8")}"
    fun limitKey(network: String, state: String, cycle: Long, limit: Long, warn: Int) =
        if (state == "over") "$network:over:$cycle:$limit" else "$network:warn:$cycle:$limit:$warn"
    fun liveKeys(keys: Set<String>, cycle: Long, today: String): Set<String> = keys.filter { key ->
        val parts = key.split(':')
        parts.size >= 3 && parts[0] in setOf("mobile", "wifi") &&
            parts[2] == if (parts[1] == "spike") today else cycle.toString()
    }.toSet()
    fun detectSpike(history: List<Long>, today: Long): Boolean {
        if (history.size < 5) return false
        val sorted = history.sorted()
        val mid = sorted.size / 2
        val median = if (sorted.size % 2 == 0) sorted[mid - 1] / 2.0 + sorted[mid] / 2.0 else sorted[mid].toDouble()
        return median > 0 && today / median >= 3
    }
    fun needsWatch(keepAlive: Boolean, wifi: Boolean): Boolean = keepAlive || wifi
    fun deliverOnce(keys: Set<String>, key: String, deliver: () -> Boolean, remember: (String) -> Unit): Boolean {
        if (key in keys) return false
        if (!deliver()) return false
        remember(key)
        return true
    }
}
