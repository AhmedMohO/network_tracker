package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.model.*
import com.anonymous.network_tracker.data.util.wifiLimitUsedBytes
import org.junit.Assert.*
import org.junit.Test

class WifiLimitUsageTest {
    private fun slice(ssid: String?, bytes: Long) = WifiNetworkSlice(ssid, emptyList(), UsageTotals(bytes, 0, bytes))
    private val networks = listOf(slice("Home", 100), slice("Work", 200), slice(null, 50))

    @Test fun allWifiIncludesUnattributedUsage() {
        assertEquals(350L, wifiLimitUsedBytes(networks, null))
    }

    @Test fun aNamedNetworkCountsOnlyItsOwnUsage() {
        assertEquals(100L, wifiLimitUsedBytes(networks, "Home"))
        assertEquals(200L, wifiLimitUsedBytes(networks, "Work"))
    }

    @Test fun missingAndCaseDifferentNetworksDoNotUseTheGlobalTotal() {
        assertEquals(0L, wifiLimitUsedBytes(networks, "Cafe"))
        assertEquals(0L, wifiLimitUsedBytes(networks, "home"))
        assertEquals(0L, wifiLimitUsedBytes(emptyList(), "Home"))
    }
}
