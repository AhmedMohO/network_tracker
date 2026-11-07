package com.anonymous.network_tracker.core

// Counters use StatsReader's [rx, tx, foregroundRx, foregroundTx] layout.
internal fun reconcileWifiBytes(
    byNetwork: MutableMap<String?, HashMap<Int, LongArray>>,
    summary: Map<Int, LongArray>
) {
    for (apps in byNetwork.values) apps.keys.retainAll(summary.keys)
    for ((uid, expected) in summary) {
        val slots = byNetwork.values.mapNotNull { it[uid] }
        for (direction in 0..1) {
            val total = slots.sumOf { it[direction].toBigInteger() }
            val limit = expected[direction].toBigInteger()
            if (total > limit) {
                for (slot in slots) {
                    slot[direction] = (slot[direction].toBigInteger() * limit / total).toLong()
                    slot[direction + 2] = minOf(slot[direction + 2], slot[direction])
                }
            }
            val missing = expected[direction] - slots.sumOf { it[direction] }
            if (missing > 0) {
                // Summary includes partial buckets; their SSID cannot be recovered from details.
                val unknown = byNetwork.getOrPut(null) { HashMap() }.getOrPut(uid) { LongArray(4) }
                unknown[direction] += missing
            }
        }
        for (direction in 0..1) {
            var offset = 0L
            for (apps in byNetwork.values) {
                val slot = apps[uid] ?: continue
                val end = offset + slot[direction]
                // shortcut: SSID state shares are estimated from summary proportions; use state history if added.
                slot[direction + 2] = if (expected[direction] == 0L) 0L else proportionalBytes(
                    expected[direction + 2].coerceIn(0, expected[direction]), offset, end, expected[direction]
                )
                offset = end
            }
        }
    }
    for (apps in byNetwork.values) apps.entries.removeAll { it.value[0] == 0L && it.value[1] == 0L }
    byNetwork.entries.removeAll { it.value.isEmpty() }
}
