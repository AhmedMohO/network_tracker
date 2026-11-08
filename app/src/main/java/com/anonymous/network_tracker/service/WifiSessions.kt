package com.anonymous.network_tracker.service

import android.content.Context

object WifiSessions {
    private const val PREFS = "network-usage-wifi-sessions"
    private const val KEY_LOG = "transitions"
    private const val KEY_ENABLED = "watch-enabled"
    private const val KEY_SEEN = "last-seen"

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun history(context: Context): WifiSessionLog {
        val saved = prefs(context)
        return WifiSessionLog(saved.getString(KEY_LOG, "[]"), saved.getLong(KEY_SEEN, 0L))
    }

    private fun update(context: Context, action: (WifiSessionLog) -> Unit) {
        val saved = prefs(context)
        val before = saved.getString(KEY_LOG, "[]")
        val history = WifiSessionLog(before, saved.getLong(KEY_SEEN, 0L))
        action(history)
        val editor = saved.edit().putLong(KEY_SEEN, history.lastSeen)
        val after = history.transitions
        if (after != before) editor.putString(KEY_LOG, after)
        editor.apply()
    }

    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        synchronized(this) {
            prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
            if (!enabled) record(context, null)
        }
        WifiWatchService.sync(context)
    }

    @Synchronized
    fun observe(context: Context, ssid: String?) {
        if (isEnabled(context)) record(context, ssid)
    }

    @Synchronized
    fun interrupt(context: Context) = update(context) { it.interrupt(System.currentTimeMillis()) }

    @Synchronized
    fun markSeen(context: Context, at: Long = System.currentTimeMillis()) = update(context) { it.markSeen(at) }

    fun lastSeen(context: Context): Long = prefs(context).getLong(KEY_SEEN, 0L)

    @Synchronized
    fun record(context: Context, ssid: String?) = record(context, System.currentTimeMillis(), ssid)

    @Synchronized
    fun record(context: Context, at: Long, ssid: String?) = update(context) { it.record(at, ssid) }

    data class Session(val ssid: String, val start: Long, val end: Long)

    @Synchronized
    fun sessions(context: Context, start: Long, end: Long, now: Long = System.currentTimeMillis()): List<Session> =
        history(context).sessions(start, end, now)

    @Synchronized
    fun knownNetworks(context: Context): List<String> = history(context).knownNetworks()

    @Synchronized
    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_LOG).remove(KEY_SEEN).apply()
    }
}
