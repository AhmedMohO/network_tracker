package com.anonymous.network_tracker

import android.Manifest
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.wifi.WifiManager
import android.os.Build
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import com.anonymous.network_tracker.service.SyncKeepAlive
import com.anonymous.network_tracker.service.WifiSessions
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test

class WifiWatchDeviceTest {
    @Test fun theRealWifiCallbackRecordsTheConnectedNameAndStopsWhenDisabled() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        check(context.packageName.endsWith(".validation20261105"))
        for (permission in listOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION)) {
            instrumentation.uiAutomation.grantRuntimePermission(context.packageName, permission)
        }
        if (Build.VERSION.SDK_INT >= 29) {
            instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.POST_NOTIFICATIONS)
        }
        val cm = context.getSystemService(ConnectivityManager::class.java)
        @Suppress("DEPRECATION")
        val wifi = cm.allNetworks.mapNotNull(cm::getNetworkCapabilities).filter {
            it.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) &&
                !it.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                it.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        }
        assumeTrue("Needs one connected Wi-Fi network", wifi.size == 1)
        @Suppress("DEPRECATION")
        val expected = context.getSystemService(WifiManager::class.java).connectionInfo.ssid.removeSurrounding("\"")
        assumeTrue("Location must be enabled for a readable Wi-Fi name", expected.isNotBlank() && expected != "<unknown ssid>")

        SyncKeepAlive.setEnabled(context, false)
        WifiSessions.setEnabled(context, false)
        WifiSessions.clear(context)
        try {
            ActivityScenario.launch(ComponentActivity::class.java).use {
                WifiSessions.setEnabled(context, true)
                val deadline = SystemClock.elapsedRealtime() + 10_000
                while (expected !in WifiSessions.knownNetworks(context) && SystemClock.elapsedRealtime() < deadline) {
                    Thread.sleep(50)
                }
                assertTrue("The service callback must record the Wi-Fi name without dashboard polling",
                    expected in WifiSessions.knownNetworks(context))
                WifiSessions.setEnabled(context, false)
                val stoppedAt = System.currentTimeMillis()
                val sessions = WifiSessions.sessions(context, 0, stoppedAt + 60_000, stoppedAt + 60_000)
                assertTrue(sessions.isNotEmpty())
                assertTrue(sessions.all { session -> session.end <= stoppedAt })
            }
        } finally {
            WifiSessions.setEnabled(context, false)
            SyncKeepAlive.setEnabled(context, false)
        }
    }
}
