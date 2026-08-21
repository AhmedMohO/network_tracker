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

        Function("getDeviceContext") {
            mapOf(
                "foregroundPackage" to LiveProbe.foregroundPackage(context),
                "batteryPercent" to LiveProbe.batteryPercent(context),
                "connection" to LiveProbe.connection(context)
            )
        }

        AsyncFunction("getWifiNetworkUsage") { q: WifiUsageQuery ->
            StatsReader(context).appUsageByWifiNetwork(q)
        }

        Function("isWifiWatchEnabled") { WifiSessions.isEnabled(context) }

        /**
         * Enabling is the user's decision, taken in Settings, so the permission
         * prompt happens on the JS side before this is called. Starting the
         * service without `ACCESS_FINE_LOCATION` is not an error worth throwing
         * over — the watch runs and records `null` for every network until the
         * grant arrives, which is exactly what it should do if the user later
         * revokes it.
         */
        Function("setWifiWatchEnabled") { enabled: Boolean ->
            WifiSessions.setEnabled(context, enabled)
            // `sync`, not `start`/`stop`: keep-alive may also need the service.
            WifiWatchService.sync(context)
        }

        Function("isSyncKeepAliveEnabled") { SyncKeepAlive.isEnabled(context) }

        /**
         * The reliable-sync switch. Arms (or cancels) the alarm that runs the
         * background check on time, and brings the foreground service up or
         * down with it — the alarm is deferred by App Standby without it.
         */
        Function("setSyncKeepAliveEnabled") { enabled: Boolean ->
            SyncKeepAlive.setEnabled(context, enabled)
            WifiWatchService.sync(context)
        }

        Function("isIgnoringBatteryOptimizations") {
            SyncKeepAlive.isIgnoringBatteryOptimizations(context)
        }

        Function("requestIgnoreBatteryOptimizations") {
            SyncKeepAlive.requestIgnoreBatteryOptimizations(context)
        }

        /** The names seen so far, newest first — for the settings screen. */
        Function("getKnownWifiNetworks") { WifiSessions.knownNetworks(context) }

        /** Forgets every recorded transition. The usage itself is untouched. */
        Function("clearWifiSessions") { WifiSessions.clear(context) }

        Function("canInstallPackages") { ApkInstaller.canInstall(context) }

        Function("openInstallPermissionSettings") {
            ApkInstaller.openPermissionSettings(context)
        }

        Function("installApk") { fileUri: String -> ApkInstaller.install(context, fileUri) }
    }
}
