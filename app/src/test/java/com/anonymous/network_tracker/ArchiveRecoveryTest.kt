package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.repository.archiveDaysToSnapshot
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId
import java.util.TimeZone

class ArchiveRecoveryTest {
    private val previousZone = TimeZone.getDefault()
    private val today = LocalDate.of(2026, 11, 7)
    private fun day(daysAgo: Long): Long = today.minusDays(daysAgo)
        .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    private fun now() = day(0) + 12 * 3_600_000L

    @Before fun setTimeZone() { TimeZone.setDefault(TimeZone.getTimeZone("UTC")) }
    @After fun restoreTimeZone() { TimeZone.setDefault(previousZone) }

    @Test fun aLongGapRecoversEveryAvailableCompletedDayOldestFirst() {
        val days = archiveDaysToSnapshot(now(), emptySet())
        assertEquals(80, days.size)
        assertEquals(day(80), days.first())
        assertEquals(day(1), days.last())
        assertEquals(80, days.toSet().size)
        assertTrue(days.contains(day(30)))
    }

    @Test fun aMissingOlderDayIsRecoveredEvenWithRecentSnapshotsPresent() {
        val saved = (1L..80L).map(::day).toSet() - day(30)
        assertEquals(listOf(day(80), day(30), day(1)), archiveDaysToSnapshot(now(), saved))
    }

    @Test fun savedDaysAreRefreshedBeforeTheyLeaveTheLiveWindow() {
        val saved = (1L..80L).map(::day).toSet()
        assertEquals(listOf(day(80), day(1)), archiveDaysToSnapshot(now(), saved))
    }

    @Test fun recoveryNeverRequestsTodayOrDaysOutsideLiveRetention() {
        val days = archiveDaysToSnapshot(now(), setOf(day(0), day(81)))
        assertFalse(days.contains(day(0)))
        assertFalse(days.contains(day(81)))
        assertTrue(days.all { it >= day(80) && it < day(0) })
    }

    @Test fun recoveryUsesCalendarDaysAcrossDaylightSavingChanges() {
        TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"))
        val days = archiveDaysToSnapshot(now(), emptySet())
        assertEquals(80, days.size)
        assertEquals(day(80), days.first())
        assertTrue(days.contains(day(6)))
        assertTrue(days.contains(day(5)))
        assertEquals(25 * 3_600_000L, day(5) - day(6))
    }
}
