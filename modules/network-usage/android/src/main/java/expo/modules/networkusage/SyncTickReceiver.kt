package expo.modules.networkusage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * One firing of `SyncKeepAlive`'s alarm.
 *
 * No `goAsync()`: the alarm is only ever armed while `SyncKeepAlive` is on,
 * and that keeps `WifiWatchService` running, so the process outlives this
 * callback regardless of what `onReceive` returns. `runBackgroundTasks` hands
 * the work to the headless JS task and returns immediately either way.
 */
class SyncTickReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != SyncKeepAlive.ACTION_TICK) return
        if (!SyncKeepAlive.isEnabled(context)) return
        // Re-armed before the work, not after: a throw inside the task must
        // cost this device one cycle, not every cycle from here on.
        SyncKeepAlive.schedule(context)
        SyncKeepAlive.runBackgroundTasks(context)
    }
}
