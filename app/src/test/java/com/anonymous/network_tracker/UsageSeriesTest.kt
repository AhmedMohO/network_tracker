package com.anonymous.network_tracker

import com.anonymous.network_tracker.core.SeriesBin
import com.anonymous.network_tracker.core.summarySeries
import org.junit.Assert.*
import org.junit.Test

class UsageSeriesTest {
    @Test fun chartUsesEveryPartialBinAndDoesNotAddABinAfterTheEnd() {
        val observed = mutableListOf<Long>()
        val bins = summarySeries(100, 350, 100) { to ->
            observed += to
            when (to) {
                200L -> longArrayOf(10, 1)
                300L -> longArrayOf(40, 3)
                350L -> longArrayOf(45, 4)
                else -> error("Query outside range: $to")
            }
        }
        assertEquals(listOf(200L, 300L, 350L), observed)
        assertEquals(listOf(SeriesBin(100, 200, 10, 1), SeriesBin(200, 300, 30, 2), SeriesBin(300, 350, 5, 1)), bins)
        assertEquals(45L, bins.sumOf { it.rxBytes })
        assertEquals(4L, bins.sumOf { it.txBytes })
    }

    @Test fun exactMultipleStopsAtTheRequestedEnd() {
        assertEquals(listOf(SeriesBin(0, 100, 1, 0), SeriesBin(100, 200, 2, 0)),
            summarySeries(0, 200, 100) { if (it == 100L) longArrayOf(1, 0) else longArrayOf(3, 0) })
    }

    @Test fun aSourceRevisionCannotMakeChartBytesExceedTheLatestTotal() {
        val bins = summarySeries(0, 200, 100) { if (it == 100L) longArrayOf(10, 0) else longArrayOf(8, 0) }
        assertEquals(8L, bins.sumOf { it.rxBytes })
        assertTrue(bins.all { it.rxBytes >= 0 && it.isEstimated })
    }

    @Test fun invalidRangesAreRejectedBeforeQuerying() {
        for ((start, end, bucket) in listOf(Triple(1L, 1L, 1L), Triple(2L, 1L, 1L), Triple(0L, 1L, 0L), Triple(0L, 2001L, 1L))) {
            assertThrows(IllegalArgumentException::class.java) {
                summarySeries(start, end, bucket) { error("Must not query") }
            }
        }
    }
}
