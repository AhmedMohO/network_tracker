package com.anonymous.network_tracker

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.anonymous.network_tracker.data.model.*
import com.anonymous.network_tracker.data.util.wifiLimitUsedBytes
import com.anonymous.network_tracker.ui.components.WifiLimitNetworkPicker
import com.anonymous.network_tracker.ui.theme.NetTrackTheme
import com.anonymous.network_tracker.ui.theme.tr
import com.anonymous.network_tracker.ui.screens.SettingsScreen
import com.anonymous.network_tracker.ui.screens.OverviewScreen
import com.anonymous.network_tracker.ui.UsageState
import com.anonymous.network_tracker.data.repository.SettingsRepository
import androidx.test.platform.app.InstrumentationRegistry
import android.os.ParcelFileDescriptor
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.Before
import java.io.File

class WifiLimitPickerTest {
    @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

    @Before fun keepTestActivityVisible() {
        compose.runOnUiThread { compose.activity.window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) }
    }

    private fun content(dark: Boolean = true, language: String = "en", fontScale: Float = 1f,
                        initial: String? = null, tracking: Boolean = true) {
        compose.setContent {
            val density = LocalDensity.current
            CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale)) {
                NetTrackTheme(darkTheme = dark, language = language) {
                    var ssid by remember { mutableStateOf(initial) }
                    val networks = listOf(
                        WifiNetworkSlice("Home", emptyList(), UsageTotals(100, 0, 100)),
                        WifiNetworkSlice("Work", emptyList(), UsageTotals(200, 0, 200)),
                        WifiNetworkSlice(null, emptyList(), UsageTotals(50, 0, 50))
                    )
                    val used = wifiLimitUsedBytes(networks, ssid)
                    Surface(Modifier.fillMaxSize()) {
                        Column {
                        Card(Modifier.fillMaxWidth().padding(16.dp)) {
                            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text(tr("Wi-Fi Data Limit"), style = MaterialTheme.typography.titleMedium)
                                WifiLimitNetworkPicker(ssid, listOf("Home", "Work"), tracking, onSelect = { ssid = it })
                                LinearProgressIndicator(progress = { used / 1000f }, modifier = Modifier.fillMaxWidth())
                                Text("$used / 1000")
                            }
                        }
                        }
                    }
                }
            }
        }
    }

    @Test fun selectionChangesOnlyTheCountedNetworkAndCanReturnToAllWifi() {
        content()
        compose.onNodeWithText("350 / 1000").assertIsDisplayed()
        compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
        screenshot("wifi-limit-dark-options.png")
        compose.onNodeWithText("Home").performClick()
        compose.onNodeWithText("100 / 1000").assertIsDisplayed()
        compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
        compose.onNodeWithText("Work").performClick()
        compose.onNodeWithText("200 / 1000").assertIsDisplayed()
        screenshot("wifi-limit-dark.png")
        compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
        compose.onNodeWithText("All Wi-Fi networks").performClick()
        compose.onNodeWithText("350 / 1000").assertIsDisplayed()
    }

    @Test fun savedUnseenNetworkRemainsSelectableAndDisabledTrackingIsExplained() {
        content(initial = "Previously saved network", tracking = false)
        compose.onNodeWithText("Previously saved network").assertIsDisplayed()
        compose.onNodeWithText("0 / 1000").assertIsDisplayed()
        compose.onNodeWithText("Enable Wi-Fi Network Attribution in Settings for network-specific usage.").assertIsDisplayed()
        compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
        compose.onAllNodesWithText("Previously saved network").assertCountEquals(2)
        compose.onNodeWithText("All Wi-Fi networks").performClick()
        compose.onNodeWithText("350 / 1000").assertIsDisplayed()
    }

    @Test fun arabicLightLayoutWorksWithLargerText() {
        content(dark = false, language = "ar", fontScale = 1.3f)
        compose.onNodeWithContentDescription("شبكة حد استخدام الواي فاي").performClick()
        compose.onNodeWithText("Home").performClick()
        compose.onNodeWithText("يُحتسب فقط الاستخدام المنسوب إلى هذه الشبكة.").assertIsDisplayed()
        compose.onNodeWithText("100 / 1000").assertIsDisplayed()
        screenshot("wifi-limit-arabic-light-large.png")
    }

    @Test fun settingsCancelPreservesTheScopeAndSavePersistsItIntoTheRealLimitBar() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val context = instrumentation.targetContext
        check(context.packageName.endsWith(".validation20261105"))
        val repository = SettingsRepository.getInstance(context)
        val original = repository.loadSettings()
        val prefs = context.getSharedPreferences("network-usage-wifi-sessions", 0)
        val oldLog = prefs.getString("transitions", null)
        val oldSeen = if (prefs.contains("last-seen")) prefs.getLong("last-seen", 0) else null
        val oldEnabled = if (prefs.contains("watch-enabled")) prefs.getBoolean("watch-enabled", false) else null
        val sharedLimit = 5 * 1_073_741_824L + 123_456_789L
        try {
            instrumentation.uiAutomation.executeShellCommand("appops set ${context.packageName} GET_USAGE_STATS allow").use {
                ParcelFileDescriptor.AutoCloseInputStream(it).use { stream -> stream.readBytes() }
            }
            repository.update { it.copy(wifiLimitBytes = sharedLimit, wifiWarnAtPercent = 80,
                wifiLimitSsid = null, language = "en") }
            val now = System.currentTimeMillis()
            prefs.edit().putString("transitions", """[{"at":${now - 2000},"ssid":"Home"},{"at":${now - 1000},"ssid":"Work"}]""")
                .putLong("last-seen", now).putBoolean("watch-enabled", false).commit()
            compose.setContent {
                NetTrackTheme(darkTheme = true) { SettingsScreen(onNavigateToFamily = {}, onNavigateToUpdate = {}) }
            }
            compose.onNodeWithText("Wi-Fi Limit").performScrollTo().performClick()
            compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
            compose.onNodeWithText("Home").performClick()
            compose.onNodeWithText("Cancel").performClick()
            assertEquals(null, repository.loadSettings().wifiLimitSsid)
            compose.onNodeWithText("Wi-Fi Limit").performScrollTo().performClick()
            compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
            compose.onNodeWithText("Home").performClick()
            compose.onNodeWithText("Save").performClick()
            assertEquals("Home", repository.loadSettings().wifiLimitSsid)
            assertEquals(sharedLimit, repository.loadSettings().wifiLimitBytes)
            compose.runOnUiThread {
                compose.activity.setContent {
                    NetTrackTheme(darkTheme = true) { OverviewScreen(onNavigateToAppDetail = {}, usageState = remember { UsageState(network = "WIFI") }) }
                }
            }
            compose.onNodeWithContentDescription("Wi-Fi limit network").performScrollTo().assertTextContains("Home")
            compose.waitUntil(20_000) { compose.onAllNodesWithText("Loading usage…").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithText("Usage unavailable").assertDoesNotExist()
            screenshot("wifi-limit-overview.png")
            compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
            compose.onNodeWithText("Work").performClick()
            assertEquals("Work", repository.loadSettings().wifiLimitSsid)
            compose.onNodeWithContentDescription("Wi-Fi limit network").performClick()
            compose.onNodeWithText("All Wi-Fi networks").performClick()
            assertEquals(null, repository.loadSettings().wifiLimitSsid)
            assertEquals(sharedLimit, repository.loadSettings().wifiLimitBytes)
        } finally {
            compose.activityRule.scenario.close()
            repository.update { original }
            prefs.edit().apply {
                if (oldLog == null) remove("transitions") else putString("transitions", oldLog)
                if (oldSeen == null) remove("last-seen") else putLong("last-seen", oldSeen)
                if (oldEnabled == null) remove("watch-enabled") else putBoolean("watch-enabled", oldEnabled)
            }.commit()
        }
    }

    private fun screenshot(name: String) {
        compose.waitForIdle()
        val bitmap = requireNotNull(InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot())
        File(compose.activity.getExternalFilesDir(null), name).outputStream().use {
            bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)
        }
    }
}
