package expo.modules.networkusage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Restores the background work the user switched on, after a reboot.
 *
 * Without this the transition log would stop at the last shutdown and stay
 * stopped until the app was next opened by hand — and a phone that reboots
 * overnight would attribute the whole next morning to whichever network it
 * happened to be on when it went down.
 *
 * A reboot also clears every `AlarmManager` alarm, so `SyncKeepAlive` has to
 * be re-armed here too or reliable sync would quietly end at the first
 * restart — which, on a phone that reboots weekly, is most of them.
 */
class WifiWatchBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return

        if (WifiSessions.isEnabled(context)) {
            // The boot itself is a gap in observation, so close the session the
            // device died holding before the service opens a new one.
            WifiSessions.record(context, null, System.currentTimeMillis())
        }
        // Re-arms the alarm a reboot cleared, as well as starting the service.
        // No-ops when neither switch is on, so an unenrolled device does
        // nothing at boot but read two booleans.
        runCatching { WifiWatchService.sync(context) }
    }
}
