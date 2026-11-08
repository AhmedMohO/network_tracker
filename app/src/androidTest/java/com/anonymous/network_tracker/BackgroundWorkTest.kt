package com.anonymous.network_tracker

import androidx.test.platform.app.InstrumentationRegistry
import androidx.work.WorkManager
import com.anonymous.network_tracker.service.SyncKeepAlive
import com.anonymous.network_tracker.service.WifiSessions
import com.anonymous.network_tracker.service.worker.UsageWork
import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.TimeUnit

class BackgroundWorkTest {
    @Test fun disabledSyncCancelsPeriodicWorkAndRejectsNewRequests() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val manager = WorkManager.getInstance(context)
        manager.cancelAllWork().result.get(10, TimeUnit.SECONDS)
        context.getSharedPreferences("network-usage-keep-alive", 0).edit().putBoolean("enabled", false).commit()
        WifiSessions.setEnabled(context, false)
        try {
            SyncKeepAlive.setEnabled(context, true)
            UsageWork.schedule(context)
            fun active(name: String) = manager.getWorkInfosForUniqueWork(name).get(10, TimeUnit.SECONDS).filter { !it.state.isFinished }
            assertEquals(1, active("usage-threshold-check-native").size)
            SyncKeepAlive.setEnabled(context, false)
            val deadline = System.currentTimeMillis() + 10_000
            while ((active("usage-check-now").isNotEmpty() || active("usage-threshold-check-native").isNotEmpty()) && System.currentTimeMillis() < deadline) {
                Thread.sleep(50)
            }
            val before = manager.getWorkInfosForUniqueWork("usage-check-now").get(10, TimeUnit.SECONDS).map { it.id }
            UsageWork.schedule(context)
            UsageWork.enqueue(context)
            assertTrue(active("usage-threshold-check-native").isEmpty())
            assertTrue(active("usage-check-now").isEmpty())
            assertEquals(before, manager.getWorkInfosForUniqueWork("usage-check-now").get(10, TimeUnit.SECONDS).map { it.id })
            SyncKeepAlive.setEnabled(context, true)
            assertEquals(1, active("usage-threshold-check-native").size)
        } finally {
            SyncKeepAlive.setEnabled(context, false)
            manager.cancelAllWork().result.get(10, TimeUnit.SECONDS)
        }
    }
}
