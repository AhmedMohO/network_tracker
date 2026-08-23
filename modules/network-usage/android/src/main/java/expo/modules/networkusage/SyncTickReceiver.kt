package expo.modules.networkusage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * One firing of the alarm, which two switches now share.
 *
 * Keep-alive wants the background task run. The Wi-Fi watch wants the network
 * it is on written down, and the *fact that this fired* with it — an alarm that
 * still fires is the only Doze-proof evidence the app has not been
 * force-stopped, and a `WifiSessions` log with nothing left watching it credits
 * the last network recorded with every byte since. So the tick is armed for
 * either switch and each half is guarded by its own.
 *
 * The watch half writes the network rather than only the timestamp because
 * this alarm is the one recorder that does not depend on the foreground
 * service still being alive — see `WifiWatchService.sample`.
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
        if (watching) WifiWatchService.sample(context)
        if (syncing) SyncKeepAlive.runBackgroundTasks(context)
    }
}
