package com.anonymous.network_tracker

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.database.sqlite.SQLiteDatabase
import android.graphics.Bitmap
import android.os.Build
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.lifecycle.Lifecycle
import androidx.room.withTransaction
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkManager
import com.anonymous.network_tracker.data.db.UsageDatabase
import com.anonymous.network_tracker.data.family.parseServerTimestamp
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.repository.ExpoStorageBridge
import com.anonymous.network_tracker.data.repository.SettingsRepository
import com.anonymous.network_tracker.data.repository.UsageRepository
import com.anonymous.network_tracker.data.util.RangeUtils
import com.anonymous.network_tracker.service.SyncKeepAlive
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.worker.UsageWork
import com.anonymous.network_tracker.ui.MainActivity
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class RepairDeviceTest {
    @get:Rule val compose = createEmptyComposeRule()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun shell(command: String) {
        instrumentation.uiAutomation.executeShellCommand(command).use { descriptor ->
            android.os.ParcelFileDescriptor.AutoCloseInputStream(descriptor).use { it.readBytes() }
        }
    }

    @Test fun legacyDataPermissionsNavigationAndBackgroundSurviveOnDevice() = runBlocking {
        check(context.packageName == "com.anonymous.network_tracker.validation20261105")
        assertEquals(1000L, parseServerTimestamp("1970-01-01T00:00:01Z"))
        val archive = File(context.filesDir, "SQLite/usage-archive.db")
        archive.parentFile!!.mkdirs()
        listOf(archive, File(archive.path + "-wal"), File(archive.path + "-shm")).forEach { it.delete() }
        val day = RangeUtils.midnight(System.currentTimeMillis(), -100)
        SQLiteDatabase.openOrCreateDatabase(archive, null).use { db ->
            db.execSQL("CREATE TABLE daily_usage(day_start INTEGER NOT NULL,uid INTEGER NOT NULL,network TEXT NOT NULL,app_name TEXT,package_name TEXT,download INTEGER NOT NULL,upload INTEGER NOT NULL,PRIMARY KEY(day_start,uid,network))")
            db.execSQL("CREATE INDEX idx_daily_day ON daily_usage(day_start)")
            db.execSQL("INSERT INTO daily_usage VALUES(?,10001,'MOBILE','Fixture','fixture.app',987654321,123)", arrayOf(day))
        }
        ExpoStorageBridge.setItem(context, "settings.v1", """{"cycleStartDay":15,"mobileLimitBytes":107374182400,"warnAtPercent":45,"futureMarker":7,"alertedKeys":["mobile:over:123:100"],"familyRole":null}""")
        ExpoStorageBridge.setItem(context, "language.v1", "en")
        context.getSharedPreferences("network-usage-keep-alive", 0).edit().putBoolean("enabled", false).commit()
        context.getSharedPreferences("notification-permission", 0).edit().putBoolean("asked", true).commit()
        val settings = SettingsRepository.getInstance(context)
        assertEquals(45, settings.loadSettings().mobileWarnAtPercent)
        settings.update { it.copy(showSystemApps = true) }
        assertEquals(7, settings.readExtras().getInt("futureMarker"))
        assertTrue(settings.loadSettings().alertedKeys.contains("mobile:over:123:100"))

        val db = UsageDatabase.getInstance(context)
        val dao = db.dailyUsageDao()
        assertEquals(987654321L, dao.getUsageAllNetworks(day, RangeUtils.midnight(day, 1)).single().download)
        try {
            db.withTransaction {
                dao.deleteDay(day)
                throw IllegalStateException("Simulated interruption")
            }
        } catch (_: IllegalStateException) { }
        assertEquals(987654321L, dao.getUsageAllNetworks(day, RangeUtils.midnight(day, 1)).single().download)
        assertEquals(123L, dao.getSeries(day, RangeUtils.midnight(day, 1), "MOBILE", 10001).single().upload)
        assertEquals(0, settings.readExtras().optInt("unrequestedDefault", 0))

        val usage = UsageRepository.getInstance(context)
        val manager = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            manager.createNotificationChannel(NotificationChannel(NetTrackApplication.CHANNEL_ALERTS, "Validation alerts", NotificationManager.IMPORTANCE_DEFAULT))
        }
        if (Build.VERSION.SDK_INT >= 33) {
            assertFalse(usage.sendNotification(90001, "Validation", "Blocked before permission"))
            instrumentation.uiAutomation.grantRuntimePermission(context.packageName, Manifest.permission.POST_NOTIFICATIONS)
        }
        assertTrue(usage.sendNotification(90001, "Validation", "Permission granted"))
        compose.waitUntil(5_000) { manager.activeNotifications.any { it.id == 90001 } }
        assertTrue(manager.activeNotifications.any { it.id == 90001 })
        manager.cancel(90001)

        shell("appops set ${context.packageName} GET_USAGE_STATS deny")
        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            compose.onNodeWithText("Grant").assertIsDisplayed().assertHasClickAction()
            scenario.moveToState(Lifecycle.State.CREATED)
            shell("appops set ${context.packageName} GET_USAGE_STATS allow")
            assertTrue("Usage Access must actually be granted by the test fixture", UsageAccess.has(context))
            scenario.moveToState(Lifecycle.State.RESUMED)
            compose.waitForIdle()
            scenario.onActivity { android.util.Log.i("RepairTest", "Resumed ${it.lifecycle.currentState}; Usage Access=${UsageAccess.has(it)}") }
            compose.onRoot().printToLog("RepairTest")
            compose.waitUntil(20_000) { compose.onAllNodesWithText("Usage Access Required").fetchSemanticsNodes().isEmpty() }
            compose.onNodeWithContentDescription("Refresh").performClick()
            compose.onNodeWithText("Settings").performClick()
            compose.onNodeWithText("Language").assertIsDisplayed()
            compose.onNodeWithText("Light").performClick()
            compose.onNodeWithText("العربية").performClick()
            compose.onNodeWithText("المظهر").assertIsDisplayed()
            screenshot("arabic-light.png")
            compose.onNodeWithText("English").performClick()
            compose.onNodeWithText("Dark").performClick()
            screenshot("english-dark.png")
            compose.onNodeWithText("Open Family").performScrollTo().performClick()
            compose.onNodeWithText("Parent Setup").assertIsDisplayed()
            scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
            compose.onNodeWithText("Language").performScrollTo().assertIsDisplayed()

            val at = System.currentTimeMillis()
            WifiSessions.record(context, at, "Validation network")
            WifiSessions.record(context, at + 1000, "Validation network")
            assertEquals(at + 1000, WifiSessions.lastSeen(context))
            SyncKeepAlive.setEnabled(context, true)
            WifiSessions.setEnabled(context, true)
            WifiSessions.setEnabled(context, false)
            compose.waitUntil(15_000) { manager.activeNotifications.any { it.id == 4711 } }
            assertTrue(SyncKeepAlive.isEnabled(context))
            SyncKeepAlive.setEnabled(context, false)
            compose.waitUntil(5_000) { manager.activeNotifications.none { it.id == 4711 } }
            SyncKeepAlive.setEnabled(context, true)
            UsageWork.schedule(context)
            UsageWork.schedule(context)
            assertEquals(1, WorkManager.getInstance(context).getWorkInfosForUniqueWork("usage-threshold-check-native").get(10, TimeUnit.SECONDS).count { !it.state.isFinished })
        }
        WorkManager.getInstance(context).cancelAllWork().result.get(10, TimeUnit.SECONDS)
        manager.cancelAll()
        assertEquals(987654321L, dao.getUsageAllNetworks(day, RangeUtils.midnight(day, 1)).single().download)
    }

    private fun screenshot(name: String) {
        compose.onRoot().captureToImage().asAndroidBitmap().let { image ->
            File(context.getExternalFilesDir(null), name).outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
}
