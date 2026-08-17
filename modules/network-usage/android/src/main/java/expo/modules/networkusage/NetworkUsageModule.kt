package expo.modules.networkusage

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NetworkUsageModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "React context is null" }

    override fun definition() = ModuleDefinition {
        Name("NetworkUsage")

        Function("hasUsageAccess") { UsageAccess.has(context) }

        Function("openUsageAccessSettings") { UsageAccess.open(context) }

        AsyncFunction("getAppUsage") { q: UsageQuery ->
            StatsReader(context).appUsage(q)
        }

        AsyncFunction("dumpBuckets") { q: UsageQuery ->
            StatsReader(context).dumpBuckets(q)
        }
    }
}
