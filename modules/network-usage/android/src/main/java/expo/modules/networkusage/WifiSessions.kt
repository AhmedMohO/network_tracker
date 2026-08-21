package expo.modules.networkusage

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * A log of when the connected Wi-Fi network last changed.
 *
 * Android exposes no per-SSID history to third-party apps: `NetworkStats.Bucket`
 * carries uid/tag/state/metered/roaming and nothing else, and Settings' own
 * "Wi-Fi data usage per network" screen reads it through the hidden
 * `NetworkTemplate.buildTemplateWifi(ssid)`. The only thing an app on the
 * public API can do is remember which network was connected when, then slice
 * the per-transport totals Android *does* report by those intervals. This
 * object is that memory, and `StatsReader.appUsageByWifiNetwork` is the slice.
 *
 * Entries are transitions, not sessions: `{at, ssid}` reads "from `at` onward
 * the connected network was `ssid`", and an empty `ssid` means "no Wi-Fi".
 * Deriving sessions by pairing consecutive entries — rather than storing
 * closed intervals — keeps every write a single append, so a process death
 * mid-write can cost one transition but never rewrite the log.
 */
object WifiSessions {

    private const val PREFS = "network-usage-wifi-sessions"
    private const val KEY_LOG = "transitions"
    private const val KEY_ENABLED = "watch-enabled"

    /** Comfortably past the archive's own 80-day cutoff (`archive/merge.ts`). */
    private const val RETENTION_MS = 120L * 24 * 60 * 60 * 1000

    /** A log this long is already ~2 transitions an hour for four months. */
    private const val MAX_ENTRIES = 20_000

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun readLog(context: Context): JSONArray =
        try {
            JSONArray(prefs(context).getString(KEY_LOG, "[]"))
        } catch (_: Exception) {
            // A corrupt log is not worth crashing the watch over; the next
            // transition starts a fresh one and the UI reports the gap as
            // unattributed rather than inventing a network for it.
            JSONArray()
        }

    /** True when the user has switched per-network tracking on. */
    fun isEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    /**
     * Appends a transition, unless it repeats the network already recorded —
     * `onCapabilitiesChanged` fires for signal-strength changes too, and a log
     * of those would be thousands of identical entries a day.
     *
     * `ssid` is null or blank for "not on Wi-Fi".
     */
    @Synchronized
    fun record(context: Context, ssid: String?, at: Long) {
        val next = ssid?.takeIf { it.isNotBlank() } ?: ""
        val log = readLog(context)

        if (log.length() > 0) {
            val last = log.optJSONObject(log.length() - 1)
            if (last != null && last.optString("ssid") == next) return
        } else if (next.isEmpty()) {
            // Nothing to close and nothing to open: an empty log that starts
            // with "no Wi-Fi" says exactly what an absent log already says.
            return
        }

        log.put(JSONObject().put("at", at).put("ssid", next))
        prefs(context).edit().putString(KEY_LOG, prune(log, at).toString()).apply()
    }

    /**
     * Drops transitions whose whole session is older than the retention
     * window. The newest dropped entry is kept when it is still the one that
     * covers the cutoff, so the surviving log never starts mid-session with no
     * idea which network that session belonged to.
     */
    private fun prune(log: JSONArray, now: Long): JSONArray {
        val cutoff = now - RETENTION_MS
        var firstKept = 0
        // The entry that covers `cutoff` is the last one starting at or before
        // it; everything strictly before that is fully expired.
        for (i in 0 until log.length()) {
            if ((log.optJSONObject(i)?.optLong("at") ?: 0L) <= cutoff) firstKept = i else break
        }
        if (log.length() - firstKept > MAX_ENTRIES) {
            firstKept = log.length() - MAX_ENTRIES
        }
        if (firstKept == 0) return log
        val out = JSONArray()
        for (i in firstKept until log.length()) out.put(log.opt(i))
        return out
    }

    /** One derived session. `ssid` is null for "no Wi-Fi / not observed". */
    data class Session(val start: Long, val end: Long, val ssid: String?)

    /**
     * The sessions overlapping `[start, end)`, clipped to it, in order.
     *
     * The span before the first transition is deliberately absent rather than
     * reported as a null-ssid session: "we were not watching" and "Wi-Fi was
     * off" are different facts, and the caller books unattributed bytes
     * against the difference between these sessions and the range as a whole.
     */
    fun sessions(context: Context, start: Long, end: Long, now: Long): List<Session> {
        val log = readLog(context)
        val out = ArrayList<Session>()
        for (i in 0 until log.length()) {
            val entry = log.optJSONObject(i) ?: continue
            val from = entry.optLong("at")
            // The last transition runs to the present, not to the range end:
            // a range asking about the future still only ever gets observed time.
            val to = log.optJSONObject(i + 1)?.optLong("at") ?: now
            val clippedStart = maxOf(from, start)
            val clippedEnd = minOf(to, end)
            if (clippedEnd <= clippedStart) continue
            out.add(
                Session(
                    clippedStart,
                    clippedEnd,
                    entry.optString("ssid").takeIf { it.isNotEmpty() }
                )
            )
        }
        return out
    }

    /** Every network name seen in the log, newest first. */
    fun knownNetworks(context: Context): List<String> {
        val log = readLog(context)
        val seen = LinkedHashSet<String>()
        for (i in log.length() - 1 downTo 0) {
            val ssid = log.optJSONObject(i)?.optString("ssid").orEmpty()
            if (ssid.isNotEmpty()) seen.add(ssid)
        }
        return seen.toList()
    }

    @Synchronized
    fun clear(context: Context) {
        prefs(context).edit().remove(KEY_LOG).apply()
    }
}
