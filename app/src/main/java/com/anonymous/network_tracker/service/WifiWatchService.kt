package com.anonymous.network_tracker.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.Uri
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.core.location.LocationManagerCompat
import androidx.annotation.RequiresApi

class WifiWatchService : Service() {

    companion object {
        const val CHANNEL_ID = "wifi-watch"
        private const val NOTIFICATION_ID = 4711
        private const val TAG = "WifiWatch"
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

        fun sync(context: Context) {
            if (WifiSessions.isEnabled(context) || SyncKeepAlive.isEnabled(context)) {
                SyncKeepAlive.arm(context)
                runCatching { start(context) }.onFailure { Log.w(TAG, "Watch start deferred: ${it.message}") }
            } else {
                stop(context)
                SyncKeepAlive.cancel(context)
            }
        }

        private fun isWifi(caps: NetworkCapabilities): Boolean =
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                !caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)

        private fun connectedName(context: Context, networks: Collection<NetworkCapabilities>): String? = try {
            val names = networks.map { caps ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    normalizeWifiSsid((caps.transportInfo as? WifiInfo)?.ssid)
                } else null
            }
            connectedWifiSsid(names) {
                @Suppress("DEPRECATION")
                val info = (context.applicationContext
                    .getSystemService(Context.WIFI_SERVICE) as? WifiManager)?.connectionInfo
                normalizeWifiSsid(info?.ssid)
            }
        } catch (_: SecurityException) {
            null
        }

        fun currentSsid(context: Context): String? = try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            val networks = cm?.allNetworks.orEmpty().mapNotNull { cm?.getNetworkCapabilities(it) }.filter(::isWifi)
            connectedName(context, networks)
        } catch (_: SecurityException) {
            null
        }

        fun sample(context: Context) {
            synchronized(WifiSessions) {
                if (!WifiSessions.isEnabled(context)) return
                WifiSessions.observe(context, currentSsid(context))
            }
        }

        fun problem(context: Context): String? {
            if (ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_FINE_LOCATION
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return "permission"
            }

            val lm = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            if (lm == null || !LocationManagerCompat.isLocationEnabled(lm)) return "locationOff"

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
                ContextCompat.checkSelfPermission(
                    context,
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return "background"
            }

            return null
        }

        private fun launch(context: Context, intent: Intent) {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }

        fun openFix(context: Context) {
            if (problem(context) == "locationOff") {
                runCatching { launch(context, Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
                    .onFailure { Log.w(TAG, "No location settings screen: ${it.message}") }
                return
            }

            val pkg = context.packageName
            val locationPage = Intent("android.intent.action.MANAGE_APP_PERMISSION")
                .putExtra("android.intent.extra.PACKAGE_NAME", pkg)
                .putExtra(
                    "android.intent.extra.PERMISSION_GROUP_NAME",
                    Manifest.permission_group.LOCATION
                )
            val permissionList = Intent("android.intent.action.MANAGE_APP_PERMISSIONS")
                .putExtra("android.intent.extra.PACKAGE_NAME", pkg)
            val appInfo = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                .setData(Uri.fromParts("package", pkg, null))

            runCatching { launch(context, locationPage) }
                .recoverCatching { launch(context, permissionList) }
                .recoverCatching { launch(context, appInfo) }
                .onFailure { Log.w(TAG, "No settings screen: ${it.message}") }
        }
    }

    private var callback: ConnectivityManager.NetworkCallback? = null

    private val connectivity: ConnectivityManager?
        get() = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startForegroundNotice()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!WifiSessions.isEnabled(this) && !SyncKeepAlive.isEnabled(this)) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        if (WifiSessions.isEnabled(this)) register() else unregister()
        startForegroundNotice()
        SyncKeepAlive.arm(this)
        return START_STICKY
    }

    override fun onDestroy() {
        unregister()
        super.onDestroy()
    }

    @Synchronized
    private fun unregister() {
        val cb = callback
        callback = null
        WifiSessions.record(this, null)
        if (cb != null) runCatching { connectivity?.unregisterNetworkCallback(cb) }
    }

    @Synchronized
    private fun register() {
        if (callback != null) return
        val cm = connectivity ?: return
        val request = NetworkRequest.Builder()
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        val cb = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            WifiCallback(ConnectivityManager.NetworkCallback.FLAG_INCLUDE_LOCATION_INFO)
        } else {
            WifiCallback()
        }
        callback = cb
        runCatching { cm.registerNetworkCallback(request, cb) }.onFailure {
            callback = null
            WifiSessions.observe(this, null)
            Log.w(TAG, "Wi-Fi observation unavailable", it)
        }
    }

    private inner class WifiCallback : ConnectivityManager.NetworkCallback {
        constructor() : super()
        @RequiresApi(Build.VERSION_CODES.S)
        constructor(flags: Int) : super(flags)

        private val networks = LinkedHashMap<Network, NetworkCapabilities>()

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            synchronized(this@WifiWatchService) {
                if (callback !== this) return
                if (isWifi(caps)) networks[network] = caps else networks.remove(network)
                publish()
            }
        }

        override fun onLost(network: Network) {
            synchronized(this@WifiWatchService) {
                if (callback !== this || networks.remove(network) == null) return
                publish()
            }
        }

        private fun publish() = synchronized(WifiSessions) {
            WifiSessions.observe(this@WifiWatchService, connectedName(this@WifiWatchService, networks.values))
        }
    }

    private fun smallIconRes(): Int {
        val res = resources.getIdentifier("notification_icon", "drawable", packageName)
        return if (res != 0) res else android.R.drawable.stat_notify_sync
    }

    private fun startForegroundNotice() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Background tracking",
                    NotificationManager.IMPORTANCE_LOW
                ).apply { setShowBadge(false) }
            )
        }

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
            .setOnlyAlertOnce(true)
            .setSilent(true)
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

