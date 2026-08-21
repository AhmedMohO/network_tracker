package expo.modules.networkusage

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

/**
 * Keeps `WifiSessions` honest.
 *
 * The transition log is only as accurate as the process that writes it, and a
 * React Native process is killed the moment the user leaves the app. Polling
 * from the existing 15-minute background task would mis-attribute every switch
 * that happened between two wakeups — a whole evening on the wrong network if
 * the phone leaves the house right after a check-in. A foreground service is
 * what buys exact boundaries, and the persistent notification is the price
 * Android charges for it.
 *
 * `specialUse` rather than `dataSync`: Android 15 caps `dataSync` at six hours
 * a day, which for a service whose entire job is to never miss a transition is
 * the same as not running it. This app ships outside the Play Store (see
 * `REQUEST_INSTALL_PACKAGES` in the manifest), so the Play review that
 * `specialUse` would otherwise invite does not apply.
 *
 * It has a second job now: holding the app in Android's `active` App Standby
 * bucket so `SyncKeepAlive`'s alarm is not deferred. Either switch can start
 * it and it stops only when both are off — see `sync` below. The two jobs stay
 * strictly separate inside: the network callback that writes `WifiSessions` is
 * registered only when the Wi-Fi watch itself is on.
 */
class WifiWatchService : Service() {

    companion object {
        private const val CHANNEL_ID = "wifi-watch"
        private const val NOTIFICATION_ID = 4711
        private const val QUOTE = '"'

        /**
         * `theme.accent`, matching the `color` handed to the
         * `expo-notifications` plugin in app.json so this notification and the
         * app's alerts tint identically. Literal rather than a colour resource
         * for the same reason `smallIconRes` looks its drawable up by name:
         * the resource belongs to the app module, not this one.
         */
        private const val NOTIFICATION_TINT = 0xFF0284C7.toInt()

        fun start(context: Context) {
            val intent = Intent(context, WifiWatchService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WifiWatchService::class.java))
        }

        /**
         * Starts or stops the service to match the two switches that need it —
         * the Wi-Fi watch and `SyncKeepAlive` — rather than either one deciding
         * alone. Turning the Wi-Fi watch off while keep-alive is on must not
         * take the service (and with it the `active` standby bucket the alarm
         * depends on) away from the other feature, and vice versa. Every caller
         * that flips either flag calls this instead of `start`/`stop`.
         */
        fun sync(context: Context) {
            if (WifiSessions.isEnabled(context) || SyncKeepAlive.isEnabled(context)) {
                start(context)
            } else {
                stop(context)
            }
        }

        /**
         * The connected network's name, or null when there is none — or when
         * the OS is withholding it. From Android 10 `WifiInfo.getSSID()` is
         * redacted to `UNKNOWN_SSID` unless the caller holds
         * `ACCESS_FINE_LOCATION` *and* location services are switched on, and
         * the redacted placeholder must read as "unknown", never as a network
         * literally named `<unknown ssid>`.
         */
        fun currentSsid(context: Context, caps: NetworkCapabilities? = null): String? {
            val info: WifiInfo? =
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && caps != null) {
                    caps.transportInfo as? WifiInfo
                } else {
                    @Suppress("DEPRECATION")
                    (context.applicationContext
                        .getSystemService(Context.WIFI_SERVICE) as? WifiManager)
                        ?.connectionInfo
                }
            val ssid = info?.ssid?.trim(QUOTE) ?: return null
            if (ssid.isEmpty() || ssid == WifiManager.UNKNOWN_SSID.trim(QUOTE)) return null
            return ssid
        }
    }

    private var callback: ConnectivityManager.NetworkCallback? = null

    private val connectivity: ConnectivityManager?
        get() = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundNotice()
        // Only when the user actually asked for per-network tracking. The
        // service now has a second reason to exist (`SyncKeepAlive` needs the
        // `active` standby bucket it buys), and a keep-alive user who never
        // opted into the location-gated Wi-Fi watch must not have a log of
        // which networks they joined written behind their back.
        if (WifiSessions.isEnabled(this)) register()
    }

    // START_STICKY so a low-memory kill is followed by a restart rather than a
    // silent hole in the log; onCreate re-registers and re-records on restart.
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        val watching = callback != null
        callback?.let { cb -> runCatching { connectivity?.unregisterNetworkCallback(cb) } }
        callback = null
        // Nothing to close when the watch was never running this time round —
        // a keep-alive-only service would otherwise append a spurious "no
        // Wi-Fi" transition to a log it never contributed to.
        if (!watching) {
            super.onDestroy()
            return
        }
        // Closes the open session explicitly. Without this the last network
        // recorded would appear to run until the log's next entry, which on a
        // device where the user turned the watch off could be days later.
        //
        // ponytail: covers a graceful stop only — a process killed outright
        // never runs this, and that session stays open until the next
        // transition. Upgrade path if it bites: a periodic liveness stamp that
        // the reader clamps open sessions to.
        WifiSessions.record(this, null, System.currentTimeMillis())
        super.onDestroy()
    }

    private fun register() {
        val cm = connectivity ?: return
        // Any Wi-Fi network, not just the default one: NetworkStatsManager
        // attributes bytes by transport, so Wi-Fi traffic counts as Wi-Fi even
        // while mobile happens to be the default route.
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .build()

        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                // Fires on every signal-strength change too; `record` collapses
                // the repeats rather than this callback trying to guess which
                // changes matter.
                WifiSessions.record(
                    this@WifiWatchService,
                    currentSsid(this@WifiWatchService, caps),
                    System.currentTimeMillis()
                )
            }

            override fun onLost(network: Network) {
                WifiSessions.record(this@WifiWatchService, null, System.currentTimeMillis())
            }
        }

        runCatching { cm.registerNetworkCallback(request, cb) }.onSuccess { callback = cb }
    }

    /**
     * The status-bar icon.
     *
     * Android draws a small icon from its **alpha channel only** — every
     * non-transparent pixel becomes solid white, tinted by `setColor`. That
     * rules out the launcher icon, which is a full-colour square and would
     * render as a white blob, and it is why this needs a dedicated monochrome
     * asset rather than the one the app already ships.
     *
     * `notification_icon` is generated at prebuild by the `expo-notifications`
     * config plugin from the `icon` in app.json, so it lives in the *app*
     * module's resources, not this module's — hence the lookup by name instead
     * of a compile-time `R.drawable` reference.
     *
     * The fallback is a platform sync glyph rather than the app icon: if the
     * generated resource is ever missing, a correct monochrome placeholder is
     * far better than the white square the launcher icon would produce. It was
     * `stat_sys_download` before, which is the system's *download animation* —
     * an animated arrow that made the app look like it was permanently
     * downloading something.
     */
    private fun smallIconRes(): Int {
        val generated = resources.getIdentifier("notification_icon", "drawable", packageName)
        return if (generated != 0) generated else android.R.drawable.stat_notify_sync
    }

    private fun startForegroundNotice() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // IMPORTANCE_LOW: no sound, no heads-up. The notification exists
            // because Android requires one, not because it has news.
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Background tracking",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { setShowBadge(false) }
            )
        }

        // The notification names whichever reason the service is actually
        // running for. A user who only switched on reliable sync should not
        // read "Tracking Wi-Fi networks" and conclude the app is doing
        // something they declined.
        val watching = WifiSessions.isEnabled(this)
        val title = if (watching) "Tracking Wi-Fi networks" else "Keeping usage up to date"
        val text = if (watching) {
            "Recording which network your data is used on."
        } else {
            "Checking your data usage in the background."
        }

        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(
                this,
                0,
                it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(smallIconRes())
            .setColor(NOTIFICATION_TINT)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open)
            .build()

        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            } else {
                0
            }
        )
    }
}
