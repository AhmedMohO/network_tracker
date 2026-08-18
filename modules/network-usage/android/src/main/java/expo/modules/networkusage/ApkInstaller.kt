package expo.modules.networkusage

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import java.io.File

/**
 * Hands a downloaded APK to the system installer. The app never installs
 * anything itself — it asks Android to, and Android asks the user.
 */
object ApkInstaller {

    fun canInstall(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }

    /** Sends the user to the per-app "install unknown apps" toggle. */
    fun openPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    fun install(context: Context, fileUri: String) {
        // The installer cannot read a raw file:// path, so the file is handed
        // over through the FileProvider declared in this module's manifest.
        val file = File(Uri.parse(fileUri).path ?: fileUri)
        val contentUri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.apkprovider",
            file
        )
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(contentUri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }
}
