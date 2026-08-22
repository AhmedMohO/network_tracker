package expo.modules.networkusage

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import expo.modules.interfaces.taskManager.TaskExecutionCallback
import expo.modules.interfaces.taskManager.TaskServiceProviderHelper

/**
 * Makes the 15-minute background check actually happen every 15 minutes.
 *
 * `expo-background-task` is WorkManager, and WorkManager's schedule is the App
 * Standby bucket, not the interval the caller asked for: a device that sits
 * idle drops to the `rare` bucket within days and the "15 minute" job runs
 * about once a day. That is why a paired child can push once at pairing and
 * then never again — the JS is fine, the job simply never runs.
 *
 * Two things fix that, and this object is both of them:
 *
 *  - `AlarmManager.setAndAllowWhileIdle`, which fires in Doze (unlike a
 *    `Handler`, whose `uptimeMillis` clock stops while the CPU is suspended,
 *    so a 15-minute `postDelayed` can land hours late on a sleeping phone).
 *  - The foreground service `WifiWatchService` already owns, which holds the
 *    app in the `active` standby bucket. Alarms are deferred by bucket too —
 *    up to two hours in `rare` — so the alarm alone is not enough, and the
 *    service that already exists for the Wi-Fi watch is the cheapest way to
 *    stay out of the deferred buckets.
 *
 * Battery-optimisation exemption (also here, since it is the same problem)
 * removes the Doze restrictions outright and is the single highest-value
 * thing the user can grant.
 */
object SyncKeepAlive {

    private const val PREFS = "network-usage-keep-alive"
    private const val KEY_ENABLED = "enabled"
    private const val TAG = "SyncKeepAlive"

    /** Must match the receiver's intent filter in this module's manifest. */
    const val ACTION_TICK = "expo.modules.networkusage.SYNC_TICK"

    /** Distinct from `WifiWatchService`'s notification id; no other alarm here. */
    private const val REQUEST_CODE = 4712

    /**
     * The same 15 minutes `registerBackgroundCheck` asks WorkManager for. Not
     * shorter: `setAndAllowWhileIdle` is rate-limited to roughly one firing
     * every nine minutes per app while the device is idle, so asking for less
     * buys nothing and only burns battery on a phone that is awake.
     */
    private const val INTERVAL_MS = 15L * 60 * 1000

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(context: Context): Boolean =
        prefs(context).getBoolean(KEY_ENABLED, false)

    /**
     * Writes the flag and nothing else. Arming the alarm is
     * `WifiWatchService.sync`'s job, because the alarm now serves two switches
     * — the Wi-Fi watch uses its firing as a proof of life (`WifiSessions.seen`)
     * — and switching this one off must not cancel the alarm out from under the
     * other. Every caller that flips either flag already calls `sync`.
     */
    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    private fun alarmManager(context: Context): AlarmManager? =
        context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager

    private fun tickIntent(context: Context): PendingIntent =
        PendingIntent.getBroadcast(
            context.applicationContext,
            REQUEST_CODE,
            Intent(context.applicationContext, SyncTickReceiver::class.java)
                .setAction(ACTION_TICK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

    /**
     * Arms the next tick. One-shot rather than `setRepeating`, because the
     * repeating variants are inexact by design since API 19 and are the first
     * thing Doze collapses; `SyncTickReceiver` re-arms after every firing.
     *
     * Inexact (`setAndAllowWhileIdle`, not `setExactAndAllowWhileIdle`) so
     * this needs no `SCHEDULE_EXACT_ALARM` permission — which Android 12+
     * makes the user grant by hand and Android 14 hides behind a Play policy.
     * A tick that lands a couple of minutes late is not worth that.
     */
    fun schedule(context: Context) {
        val am = alarmManager(context) ?: return
        val at = System.currentTimeMillis() + INTERVAL_MS
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, tickIntent(context))
            } else {
                am.set(AlarmManager.RTC_WAKEUP, at, tickIntent(context))
            }
        }.onFailure { Log.w(TAG, "Could not schedule sync tick: ${it.message}") }
    }

    fun cancel(context: Context) {
        runCatching { alarmManager(context)?.cancel(tickIntent(context)) }
    }

    /**
     * Runs whatever `expo-background-task` has registered — in this app that
     * is `USAGE_CHECK_TASK`, which is the alert check, the archive write, the
     * child's push and the parent's pull.
     *
     * Goes through the task consumer directly rather than through
     * `BackgroundTaskScheduler.runTasks`, which would also append another
     * WorkManager request on every firing; the WorkManager chain is left to
     * run on its own schedule as the fallback for when this alarm is not
     * armed. `TaskService.executeTask` starts the headless JS loader when no
     * JS context is alive, so this works with the app fully closed.
     *
     * `BackgroundTaskConsumer` is reached by name rather than by import
     * because expo modules are not Gradle projects in this build — they
     * resolve as Maven artifacts, so importing one would mean pinning
     * `host.exp.exponent:expo.modules.backgroundtask` to a version that has to
     * track package.json by hand. Reflection costs a few lines and cannot
     * break the build; a rename in a future SDK degrades to the warning below
     * and the WorkManager fallback, rather than to a red build.
     *
     * ponytail: the alternative is a `HeadlessJsTaskService` of our own plus a
     * second JS entry point — a great deal more code for the same effect.
     * Worth revisiting only if this warning ever starts appearing.
     */
    fun runBackgroundTasks(context: Context) {
        val app = context.applicationContext
        val service = TaskServiceProviderHelper.getTaskServiceImpl(app)
        if (service == null) {
            Log.w(TAG, "No task service; nothing to run")
            return
        }

        val consumerClass = try {
            Class.forName("expo.modules.backgroundtask.BackgroundTaskConsumer")
        } catch (e: ClassNotFoundException) {
            Log.w(TAG, "expo-background-task not on the classpath: ${e.message}")
            return
        }
        // Signature: `fun executeTask(callback: TaskExecutionCallback)`.
        val execute = try {
            consumerClass.getMethod("executeTask", TaskExecutionCallback::class.java)
        } catch (e: NoSuchMethodException) {
            Log.w(TAG, "BackgroundTaskConsumer.executeTask has changed: ${e.message}")
            return
        }

        val consumers = service.getTaskConsumers(app.packageName)
            .filter { consumerClass.isInstance(it) }
        if (consumers.isEmpty()) {
            Log.w(TAG, "No background-task consumers registered")
            return
        }
        // The callback is how the task reports finishing; nothing here needs
        // to know, so it is an empty one rather than a null the Java side
        // would have to null-check.
        val noop = TaskExecutionCallback { }
        consumers.forEach { consumer ->
            runCatching { execute.invoke(consumer, noop) }
                .onFailure { Log.w(TAG, "Task failed: ${it.message}") }
        }
    }

    /**
     * False when Android is free to defer this app's background work. Always
     * true below API 23, where Doze did not exist.
     */
    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return true
        return pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Asks for the exemption with the one-tap system dialog.
     *
     * `ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is restricted by Play
     * policy to apps whose core function genuinely breaks without it. This app
     * ships outside Play — the same reason `QUERY_ALL_PACKAGES` and
     * `REQUEST_INSTALL_PACKAGES` are in the manifest — and a usage tracker
     * that is not allowed to run is exactly the case the policy carves out.
     * Falls back to the general battery-optimisation list on ROMs that removed
     * the direct dialog.
     */
    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        val direct = Intent(
            Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
            Uri.parse("package:${context.packageName}")
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { context.startActivity(direct) }
            .recoverCatching { context.startActivity(fallback) }
            .onFailure { Log.w(TAG, "No battery-optimisation screen: ${it.message}") }
    }
}
