package expo.modules.networkusage

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Base64
import java.io.ByteArrayOutputStream

/** Launcher icons are rendered once at this edge, well above any list row. */
private const val ICON_PX = 96

class AppResolver(private val context: Context) {

    private val pm: PackageManager = context.packageManager
    private val labelCache = HashMap<Int, String?>()
    private val iconCache = HashMap<String, String?>()
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

    /**
     * The app's launcher icon as base64 PNG, or null when the package is gone.
     * Cached — including the misses — because the same rows are re-queried on
     * every range and filter change.
     */
    fun iconBase64(packageName: String): String? {
        if (iconCache.containsKey(packageName)) return iconCache[packageName]
        val icon = renderIcon(packageName)
        iconCache[packageName] = icon
        return icon
    }

    private fun renderIcon(packageName: String): String? {
        val drawable = try {
            pm.getApplicationIcon(packageName)
        } catch (e: PackageManager.NameNotFoundException) {
            return null
        }
        val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, ICON_PX, ICON_PX)
        drawable.draw(Canvas(bitmap))
        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
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
