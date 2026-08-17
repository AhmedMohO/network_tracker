package expo.modules.networkusage

import android.content.Context
import android.content.pm.PackageManager

class AppResolver(private val context: Context) {

    private val pm: PackageManager = context.packageManager
    private val labelCache = HashMap<Int, String?>()
    private val packageCache = HashMap<Int, List<String>>()

    fun packages(uid: Int): List<String> = packageCache.getOrPut(uid) {
        // Negative UIDs are Android's synthetic buckets, not real apps.
        if (uid < 0) emptyList()
        else pm.getPackagesForUid(uid)?.toList() ?: emptyList()
    }

    fun label(uid: Int): String? = labelCache.getOrPut(uid) {
        specialLabel(uid) ?: run {
            val pkg = packages(uid).firstOrNull() ?: return@run null
            try {
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (e: PackageManager.NameNotFoundException) {
                null
            }
        }
    }

    private fun specialLabel(uid: Int): String? = when (uid) {
        -1 -> "All traffic"          // NetworkStats.Bucket.UID_ALL
        -4 -> "Removed apps"         // NetworkStats.Bucket.UID_REMOVED
        -5 -> "Tethering"            // NetworkStats.Bucket.UID_TETHERING
        0 -> "Root"
        1000 -> "Android System"
        1001 -> "Telephony"
        else -> null
    }
}
