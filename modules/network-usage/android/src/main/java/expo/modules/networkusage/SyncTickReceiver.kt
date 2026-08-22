package expo.modules.networkusage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * One firing of the alarm, which two switches now share.
 *
 * Keep-alive wants the background task run. The Wi-Fi watch wants nothing run
 * at all — it wants the *fact that this fired* written down, because an alarm
 * that still fires is the only Doze-proof evidence the app has not been
 * force-stopped, and a `WifiSessions` log with nothing left watching it credits
 * the last network recorded with every byte since. So the tick is armed for
 * either switch and each half is guarded by its own.
 *
 * No `goAsync()`: the alarm is only ever armed while `WifiWatchService` is
 * running, so the process outlives this callback regardless of what
 * `onReceive` returns. `runBackgroundTasks` hands the work to the headless JS
 * task and returns immediately either way.
 */
class SyncTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != SyncKeepAlive.ACTION_TICK) return
        val watching = WifiSessions.isEnabled(context)
        val syncing = SyncKeepAlive.isEnabled(context)
        if (!watching && !syncing) return

        // Re-armed before the work, not after: a throw inside the task must
        // cost this device one cycle, not every cycle from here on.
        SyncKeepAlive.schedule(context)
        if (watching) WifiSessions.seen(context, System.currentTimeMillis())
        if (syncing) SyncKeepAlive.runBackgroundTasks(context)
    }
}
