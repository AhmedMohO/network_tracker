package com.anonymous.network_tracker.core

internal class ForegroundState {
    private val resumed = linkedMapOf<Pair<String, String?>, Long>()
    val packageName: String? get() = resumed.maxByOrNull { it.value }?.key?.first

    fun event(type: Int, pkg: String?, activity: String?, at: Long) {
        when (type) {
            1 -> if (pkg != null) resumed[pkg to activity] = at // ACTIVITY_RESUMED / MOVE_TO_FOREGROUND
            2, 23 -> if (pkg != null) resumed.keys.removeAll { it.first == pkg && (activity == null || it.second == activity) }
            16, 26, 27 -> resumed.clear() // screen off, shutdown, startup
        }
    }

    fun clear() = resumed.clear()
}
