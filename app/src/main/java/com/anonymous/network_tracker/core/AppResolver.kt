package com.anonymous.network_tracker.core

import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import android.util.Base64
import java.io.ByteArrayOutputStream

private const val ICON_PX = 96

class AppResolver(private val context: Context) {

    private val pm: PackageManager = context.packageManager
    private val labelCache = HashMap<Int, String?>()
    private val iconCache = HashMap<String, String?>()
    private val packageCache = HashMap<Int, List<String>>()

    fun packages(uid: Int): List<String> = packageCache.getOrPut(uid) {
        if (uid < 0) emptyList()
        else pm.getPackagesForUid(uid)?.toList() ?: emptyList()
    }

    fun label(uid: Int): String? = labelCache.getOrPut(uid) {
        specialLabel(uid) ?: run {
            val pkg = packages(uid).firstOrNull() ?: return@run null
            try {
                pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString()
            } catch (_: PackageManager.NameNotFoundException) {
                null
            }
        }
    }

    fun iconDrawable(packageName: String): Drawable? {
        return try {
            pm.getApplicationIcon(packageName)
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }

    fun iconBase64(packageName: String): String? {
        if (iconCache.containsKey(packageName)) return iconCache[packageName]
        val icon = renderIcon(packageName)
        iconCache[packageName] = icon
        return icon
    }

    private fun renderIcon(packageName: String): String? {
        val drawable = iconDrawable(packageName) ?: return null
        val bitmap = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888)
        drawable.setBounds(0, 0, ICON_PX, ICON_PX)
        drawable.draw(Canvas(bitmap))
        return ByteArrayOutputStream().use { out ->
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
            Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        }
    }

    private fun specialLabel(uid: Int): String? = when (uid) {
        -1 -> "All traffic"
        -4 -> "Removed apps"
        -5 -> "Tethering"
        0 -> "Root"
        1000 -> "Android System"
        1001 -> "Telephony"
        else -> null
    }
}

