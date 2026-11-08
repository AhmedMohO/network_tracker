package com.anonymous.network_tracker

import com.anonymous.network_tracker.core.wifiBucketShares
import com.anonymous.network_tracker.data.model.WifiUsageQuery
import com.anonymous.network_tracker.service.WifiSessions.Session
import org.junit.Assert.*
import org.junit.Test

class WifiUsageAllocationTest {
    @Test fun splittingSingleBytesDoesNotTurnRoundingIntoUnknownUsage() {
        val result = wifiBucketShares(0, 3, 1, 2,
            listOf(Session("Home", 0, 1), Session("Office", 1, 3)), WifiUsageQuery(0, 3))
        assertArrayEquals(longArrayOf(0, 0), result["Home"])
        assertArrayEquals(longArrayOf(1, 2), result["Office"])
        assertFalse(result.containsKey(null))
    }

    @Test fun largeCountersKeepEveryByte() {
        val result = wifiBucketShares(0, 2, 9_000_000_000_000_003L, 0,
            listOf(Session("Home", 0, 1), Session("Office", 1, 2)), WifiUsageQuery(0, 2))
        assertArrayEquals(longArrayOf(4_500_000_000_000_001L, 0), result["Home"])
        assertArrayEquals(longArrayOf(4_500_000_000_000_002L, 0), result["Office"])
    }

    @Test fun unobservedIntervalsStayUnknownAndKeepTheirFractionalBytes() {
        val result = wifiBucketShares(0, 4, 3, 5,
            listOf(Session("Home", 1, 3)), WifiUsageQuery(0, 4))
        assertArrayEquals(longArrayOf(2, 2), result["Home"])
        assertArrayEquals(longArrayOf(1, 3), result[null])
    }

    @Test fun partialRangesDoNotReceiveAnEntireHistoryBucket() {
        val sessions = listOf(Session("Home", 0, 4))
        val first = wifiBucketShares(0, 4, 3, 5, sessions, WifiUsageQuery(0, 2))
        val second = wifiBucketShares(0, 4, 3, 5, sessions, WifiUsageQuery(2, 4))
        assertArrayEquals(longArrayOf(1, 2), first["Home"])
        assertArrayEquals(longArrayOf(2, 3), second["Home"])
    }

    @Test fun repeatedVisitsToOneNetworkAreCombinedWithoutLosingBytes() {
        val result = wifiBucketShares(0, 3, 7, 4,
            listOf(Session("Home", 0, 1), Session("Office", 1, 2), Session("Home", 2, 3)), WifiUsageQuery(0, 3))
        assertArrayEquals(longArrayOf(5, 3), result["Home"])
        assertArrayEquals(longArrayOf(2, 1), result["Office"])
    }

    @Test fun historyOutsideTheQueryDoesNotCreateNetworkShares() {
        val result = wifiBucketShares(0, 4, 100, 20,
            listOf(Session("Home", 0, 2)), WifiUsageQuery(4, 6))
        assertTrue(result.isEmpty())
    }

    @Test fun noObservedNetworkPreservesTheWholeBucketAsUnknown() {
        val result = wifiBucketShares(0, 4, 100, 20, emptyList(), WifiUsageQuery(0, 4))
        assertEquals(setOf<String?>(null), result.keys)
        assertArrayEquals(longArrayOf(100, 20), result[null])
    }
}
