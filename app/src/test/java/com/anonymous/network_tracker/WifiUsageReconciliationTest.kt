package com.anonymous.network_tracker

import com.anonymous.network_tracker.core.reconcileWifiBytes
import org.junit.Assert.*
import org.junit.Test

class WifiUsageReconciliationTest {
    private fun bytes(rx: Long, tx: Long) = longArrayOf(rx, tx, 0, 0)

    @Test fun foregroundSummaryIsSharedAcrossNetworksWithoutCallingAllBytesBackground() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(60, 20)),
            "Cafe" to hashMapOf(10 to bytes(40, 20))
        )
        reconcileWifiBytes(networks, mapOf(10 to longArrayOf(100, 40, 40, 10)))
        assertArrayEquals(longArrayOf(60, 20, 24, 5), networks["Home"]!![10])
        assertArrayEquals(longArrayOf(40, 20, 16, 5), networks["Cafe"]!![10])
    }

    @Test fun foregroundRoundingIsConservedEvenForTinyNetworkShares() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(1, 0)),
            "Cafe" to hashMapOf(10 to bytes(1, 0))
        )
        reconcileWifiBytes(networks, mapOf(10 to longArrayOf(3, 0, 2, 0)))
        assertEquals(2L, networks.values.sumOf { it[10]!![2] })
        assertTrue(networks.values.all { it[10]!![2] <= it[10]!![0] })
    }

    @Test fun missingPartialBucketsBecomeUnattributedForEachUidAndDirection() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(60, 20)),
            null to hashMapOf(10 to bytes(10, 5))
        )
        reconcileWifiBytes(networks, mapOf(10 to bytes(100, 40), 20 to bytes(7, 9)))
        assertArrayEquals(bytes(60, 20), networks["Home"]!![10])
        assertArrayEquals(bytes(40, 20), networks[null]!![10])
        assertArrayEquals(bytes(7, 9), networks[null]!![20])
    }

    @Test fun emptyDetailsStillPreserveTheWholeSummary() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>()
        reconcileWifiBytes(networks, mapOf(10 to bytes(100, 40)))
        assertArrayEquals(bytes(100, 40), networks[null]!![10])
    }

    @Test fun roundingLossBecomesUnattributed() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(1, 0)),
            "Cafe" to hashMapOf(10 to bytes(1, 0))
        )
        reconcileWifiBytes(networks, mapOf(10 to bytes(3, 0)))
        assertArrayEquals(bytes(1, 0), networks[null]!![10])
    }

    @Test fun detailsAboveSummaryAreCappedProportionallyPerDirection() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(60, 10)),
            "Cafe" to hashMapOf(10 to bytes(40, 10))
        )
        reconcileWifiBytes(networks, mapOf(10 to bytes(51, 40)))
        assertArrayEquals(bytes(30, 10), networks["Home"]!![10])
        assertArrayEquals(bytes(20, 10), networks["Cafe"]!![10])
        assertArrayEquals(bytes(1, 20), networks[null]!![10])
    }

    @Test fun exactTotalsDoNotIntroduceUnattributedUsage() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(100, 40))
        )
        reconcileWifiBytes(networks, mapOf(10 to bytes(100, 40)))
        assertEquals(setOf("Home"), networks.keys)
        assertArrayEquals(bytes(100, 40), networks["Home"]!![10])
    }

    @Test fun staleDetailUidsCannotInflateTheSummary() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(100, 40))
        )
        reconcileWifiBytes(networks, emptyMap())
        assertTrue(networks.isEmpty())
    }

    @Test fun scalingLargeCountersDoesNotOverflowOrLosePrecision() {
        val networks = linkedMapOf<String?, HashMap<Int, LongArray>>(
            "Home" to hashMapOf(10 to bytes(9_000_000_000_000_001, 0)),
            "Cafe" to hashMapOf(10 to bytes(9_000_000_000_000_001, 0))
        )
        reconcileWifiBytes(networks, mapOf(10 to bytes(9_000_000_000_000_003, 0)))
        assertEquals(4_500_000_000_000_001, networks["Home"]!![10]!![0])
        assertEquals(4_500_000_000_000_001, networks["Cafe"]!![10]!![0])
        assertEquals(1L, networks[null]!![10]!![0])
    }
}
