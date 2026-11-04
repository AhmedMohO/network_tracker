package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.data.util.PresetId
import com.anonymous.network_tracker.data.util.RangeUtils
import org.junit.Assert.*
import org.junit.Test
import java.util.Calendar

class RangeUtilsTest {

    @Test
    fun testMidnightCalculation() {
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.MARCH, 15, 14, 30, 45)
            set(Calendar.MILLISECOND, 500)
        }
        val ts = cal.timeInMillis

        val midnightTs = RangeUtils.midnight(ts)
        val resultCal = Calendar.getInstance().apply { timeInMillis = midnightTs }

        assertEquals(2026, resultCal.get(Calendar.YEAR))
        assertEquals(Calendar.MARCH, resultCal.get(Calendar.MONTH))
        assertEquals(15, resultCal.get(Calendar.DAY_OF_MONTH))
        assertEquals(0, resultCal.get(Calendar.HOUR_OF_DAY))
        assertEquals(0, resultCal.get(Calendar.MINUTE))
        assertEquals(0, resultCal.get(Calendar.SECOND))
        assertEquals(0, resultCal.get(Calendar.MILLISECOND))
    }

    @Test
    fun testMidnightDayOffset() {
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.MARCH, 15, 10, 0, 0)
        }
        val ts = cal.timeInMillis

        val yesterdayMidnight = RangeUtils.midnight(ts, -1)
        val yCal = Calendar.getInstance().apply { timeInMillis = yesterdayMidnight }
        assertEquals(14, yCal.get(Calendar.DAY_OF_MONTH))

        val tomorrowMidnight = RangeUtils.midnight(ts, 1)
        val tCal = Calendar.getInstance().apply { timeInMillis = tomorrowMidnight }
        assertEquals(16, tCal.get(Calendar.DAY_OF_MONTH))
    }

    @Test
    fun testBillingCycleRange() {
        // Assume now is March 15, 2026, cycle starts on day 1
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.MARCH, 15, 12, 0, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val now = cal.timeInMillis

        val currentCycle = RangeUtils.billingCycleRange(cycleStartDay = 1, now = now, offset = 0)
        val startCal = Calendar.getInstance().apply { timeInMillis = currentCycle.start }

        assertEquals(2026, startCal.get(Calendar.YEAR))
        assertEquals(Calendar.MARCH, startCal.get(Calendar.MONTH))
        assertEquals(1, startCal.get(Calendar.DAY_OF_MONTH))
        assertEquals(now, currentCycle.end)
        assertEquals(PresetId.THIS_CYCLE, currentCycle.preset)

        val previousCycle = RangeUtils.billingCycleRange(cycleStartDay = 1, now = now, offset = -1)
        val prevStartCal = Calendar.getInstance().apply { timeInMillis = previousCycle.start }
        val prevEndCal = Calendar.getInstance().apply { timeInMillis = previousCycle.end }

        assertEquals(Calendar.FEBRUARY, prevStartCal.get(Calendar.MONTH))
        assertEquals(1, prevStartCal.get(Calendar.DAY_OF_MONTH))
        assertEquals(Calendar.MARCH, prevEndCal.get(Calendar.MONTH))
        assertEquals(1, prevEndCal.get(Calendar.DAY_OF_MONTH))
    }

    @Test
    fun testSplitRange() {
        val cutoff = 100_000L

        // Fully archived
        val fullArchived = DateRange(10_000L, 50_000L)
        val split1 = RangeUtils.splitRange(fullArchived, cutoff)
        assertEquals(fullArchived, split1.archived)
        assertNull(split1.live)

        // Fully live
        val fullLive = DateRange(120_000L, 200_000L)
        val split2 = RangeUtils.splitRange(fullLive, cutoff)
        assertNull(split2.archived)
        assertEquals(fullLive, split2.live)

        // Straddling cutoff
        val straddling = DateRange(50_000L, 150_000L)
        val split3 = RangeUtils.splitRange(straddling, cutoff)
        assertNotNull(split3.archived)
        assertNotNull(split3.live)
        assertEquals(50_000L, split3.archived?.start)
        assertEquals(cutoff, split3.archived?.end)
        assertEquals(cutoff, split3.live?.start)
        assertEquals(150_000L, split3.live?.end)
    }

    @Test
    fun testArchiveCutoffIs80Days() {
        val now = 1_000_000_000_000L
        val cutoff = RangeUtils.archiveCutoff(now)
        val midnightNow = RangeUtils.midnight(now)
        val diffDays = (midnightNow - cutoff) / RangeUtils.DAY_MS
        assertEquals(80L, diffDays)
    }

    @Test
    fun testPreviousRangeForCycle() {
        // March 15, 2026, cycle day 1
        val cal = Calendar.getInstance().apply {
            set(2026, Calendar.MARCH, 15, 12, 0, 0)
        }
        val now = cal.timeInMillis
        val thisCycle = RangeUtils.billingCycleRange(cycleStartDay = 1, now = now, offset = 0)
        val prevRange = RangeUtils.previousRange(thisCycle, cycleStartDay = 1, now = now)

        val prevStartCal = Calendar.getInstance().apply { timeInMillis = prevRange.start }
        assertEquals(Calendar.FEBRUARY, prevStartCal.get(Calendar.MONTH))
        assertEquals(1, prevStartCal.get(Calendar.DAY_OF_MONTH))
    }
}

