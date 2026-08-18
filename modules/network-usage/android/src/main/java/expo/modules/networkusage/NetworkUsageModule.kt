package expo.modules.networkusage

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NoAppSettingsScreenException(pkg: String) :
    CodedException("No system settings screen is available for $pkg")

class NetworkUsageModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "React context is null" }

    // Held across calls so the icon and label caches survive a range change.
    private val resolver by lazy { AppResolver(context) }

    override fun definition() = ModuleDefinition {
        Name("NetworkUsage")

        Function("hasUsageAccess") { UsageAccess.has(context) }

        Function("openUsageAccessSettings") { UsageAccess.open(context) }

        Function("openAppDataUsageSettings") { pkg: String ->
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", pkg, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(intent)
            } catch (_: ActivityNotFoundException) {
                // Some builds ship without the app-details activity; that is a
                // message for the user, not a crash.
                throw NoAppSettingsScreenException(pkg)
            }
        }

        AsyncFunction("getAppUsage") { q: UsageQuery ->
            StatsReader(context).appUsage(q)
        }

        AsyncFunction("dumpBuckets") { q: UsageQuery ->
            StatsReader(context).dumpBuckets(q)
        }

        AsyncFunction("getAppIcon") { pkg: String -> resolver.iconBase64(pkg) }

        AsyncFunction("getSeries") { q: SeriesQuery -> StatsReader(context).series(q) }

        Function("getDeviceCounters") { LiveProbe.counters() }
    }
}
