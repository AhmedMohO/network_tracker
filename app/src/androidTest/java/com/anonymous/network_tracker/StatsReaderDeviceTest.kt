package com.anonymous.network_tracker

import android.os.ParcelFileDescriptor
import androidx.test.platform.app.InstrumentationRegistry
import com.anonymous.network_tracker.core.StatsReader
import com.anonymous.network_tracker.core.UsageAccess
import com.anonymous.network_tracker.data.model.*
import com.anonymous.network_tracker.data.util.RangeUtils
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class StatsReaderDeviceTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val range = RangeUtils.calendarDayRange(System.currentTimeMillis(), -3)

    @Before fun allowValidationUsageAccess() {
        check(context.packageName.endsWith(".validation20261105"))
        instrumentation.uiAutomation.executeShellCommand("appops set ${context.packageName} GET_USAGE_STATS allow").use {
            ParcelFileDescriptor.AutoCloseInputStream(it).use { stream -> stream.readBytes() }
        }
        assertTrue(UsageAccess.has(context))
    }

    @Test fun actualWifiSlicesMatchSummaryBytesAndStateForEveryUid() {
        val reader = StatsReader(context)
        val expected = reader.appUsage(UsageQuery(range.start, range.end, "WIFI")).apps.filter { it.total > 0 }
            .associate { it.uid to listOf(it.download, it.upload, it.foreground, it.background) }
        val slices = reader.appUsageByWifiNetwork(WifiUsageQuery(range.start, range.end)).networks
        val actual = slices.flatMap { it.apps }.groupBy { it.uid }.mapValues { (_, apps) ->
            listOf(apps.sumOf { it.download }, apps.sumOf { it.upload },
                apps.sumOf { it.foreground!! }, apps.sumOf { it.background!! })
        }
        assertEquals(expected, actual)
    }

    @Test fun actualChartBinsPreserveSummaryTotalsAndStopAtTheRangeEnd() {
        val reader = StatsReader(context)
        val apps = reader.appUsage(UsageQuery(range.start, range.end, "WIFI")).apps
        val bins = reader.series(SeriesQuery(range.start, range.end, "WIFI", 6 * 3_600_000L)).bins
        assertEquals(apps.sumOf { it.download }, bins.sumOf { it.rxBytes })
        assertEquals(apps.sumOf { it.upload }, bins.sumOf { it.txBytes })
        assertEquals(range.start, bins.first().start)
        assertEquals(range.end, bins.last().end)
    }
}
