package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.db.DailyUsageEntity
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.util.*
import org.junit.Assert.*
import org.junit.Test

class ArchiveUsageTest {
    private fun row(start: Long, end: Long, rx: Long, tx: Long, fg: Long? = null, bg: Long? = null) =
        DailyUsageEntity(start, 10, "WIFI", "Home", "Browser", "app.browser", rx, tx, fg, bg, end)

    @Test fun sourceHistoryExpiringCannotErasePreviouslyArchivedBytes() {
        assertFalse(snapshotRetainsUsage(listOf(row(0, 24, 100, 20)), emptyList()))
        assertFalse(snapshotRetainsUsage(listOf(row(0, 24, 100, 20)), listOf(row(0, 24, 50, 30))))
        assertTrue(snapshotRetainsUsage(listOf(row(0, 24, 100, 20)), listOf(row(0, 24, 110, 20))))
    }

    @Test fun noonToNoonUsesBothDaysAndOnlyTheirOverlappingPortions() {
        val rows = listOf(row(0, 24, 240, 24, 120, 144), row(24, 48, 480, 48, 240, 288))
        val result = archiveApps(rows, DateRange(12, 36)).single()
        assertEquals(360L, result.download)
        assertEquals(36L, result.upload)
        assertEquals(180L, result.foreground)
        assertEquals(216L, result.background)
        assertTrue(result.isEstimated)
    }

    @Test fun completeDaysKeepTheSavedBreakdownAndAreNotTimeEstimates() {
        val result = archiveApps(listOf(row(0, 24, 240, 24, 120, 144)), DateRange(0, 24)).single()
        assertEquals(120L, result.foreground)
        assertEquals(144L, result.background)
        assertFalse(result.isEstimated)
    }

    @Test fun oldRowsKeepTheirStateBreakdownUnknown() {
        val result = archiveApps(listOf(row(0, 24, 240, 24)), DateRange(0, 24)).single()
        assertNull(result.foreground)
        assertNull(result.background)
    }

    @Test fun complementaryPartialRangesConserveSingleBytes() {
        val rows = listOf(row(0, 24, 1, 1, 1, 1))
        val first = archiveApps(rows, DateRange(0, 12)).single()
        val second = archiveApps(rows, DateRange(12, 24)).single()
        assertEquals(1L, first.download + second.download)
        assertEquals(1L, first.upload + second.upload)
        assertEquals(first.total, first.foreground!! + first.background!!)
        assertEquals(second.total, second.foreground!! + second.background!!)
    }

    @Test fun stateRoundingAcrossPartialRangesConservesForegroundBytes() {
        val rows = listOf(row(0, 24, 1, 1, 2, 0))
        val first = archiveApps(rows, DateRange(0, 12)).single()
        val second = archiveApps(rows, DateRange(12, 24)).single()
        assertEquals(2L, first.foreground!! + second.foreground!!)
        assertEquals(0L, first.background!! + second.background!!)
    }

    @Test fun savedDayDurationHandlesTheTwentyFiveHourDay() {
        val result = archiveApps(listOf(row(0, 25, 250, 0)), DateRange(0, 5)).single()
        assertEquals(50L, result.download)
    }

    @Test fun rowsOutsideTheRequestedRangeAreExcluded() {
        assertTrue(archiveApps(listOf(row(0, 24, 240, 24)), DateRange(24, 48)).isEmpty())
    }

    @Test fun mergingAnUnknownBreakdownNeverInventsZeroOrPartialForeground() {
        val known = AppUsageItem(10, "Browser", "app.browser", 100, 20, 120, 50, 70)
        val old = AppUsageItem(10, "Browser", "app.browser", 30, 10, 40, isEstimated = true)
        val result = mergeUsage(listOf(known), listOf(old)).single()
        assertEquals(160L, result.total)
        assertNull(result.foreground)
        assertNull(result.background)
        assertTrue(result.isEstimated)
    }
}
