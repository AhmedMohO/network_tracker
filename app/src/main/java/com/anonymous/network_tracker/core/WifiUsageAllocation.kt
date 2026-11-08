package com.anonymous.network_tracker.core

import com.anonymous.network_tracker.data.model.WifiUsageQuery
import com.anonymous.network_tracker.service.WifiSessions

internal fun wifiBucketShares(
    start: Long,
    end: Long,
    rx: Long,
    tx: Long,
    sessions: List<WifiSessions.Session>,
    range: WifiUsageQuery
): Map<String?, LongArray> {
    val from = maxOf(start, range.start)
    val to = minOf(end, range.end)
    if (to <= from || end <= start) return emptyMap()
    val span = end - start
    val result = linkedMapOf<String?, LongArray>()
    fun add(ssid: String?, left: Long, right: Long) {
        if (right <= left) return
        val slot = result.getOrPut(ssid) { LongArray(2) }
        slot[0] += proportionalBytes(rx, left - start, right - start, span)
        slot[1] += proportionalBytes(tx, left - start, right - start, span)
    }
    var cursor = from
    for (session in sessions) {
        val left = maxOf(cursor, session.start)
        val right = minOf(to, session.end)
        if (right <= left) continue
        add(null, cursor, left)
        add(session.ssid, left, right)
        cursor = right
    }
    add(null, cursor, to)
    return result
}
