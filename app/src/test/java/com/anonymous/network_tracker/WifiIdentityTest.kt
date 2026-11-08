package com.anonymous.network_tracker

import com.anonymous.network_tracker.service.connectedWifiSsid
import com.anonymous.network_tracker.service.normalizeWifiSsid
import org.junit.Assert.*
import org.junit.Test

class WifiIdentityTest {
    @Test fun disconnectedWifiNeverReusesACachedNetworkName() {
        assertNull(connectedWifiSsid(emptyList()) { error("Disconnected Wi-Fi must not read cached SSID") })
    }

    @Test fun theObservedNetworkTakesPrecedenceOverTheCachedName() {
        assertEquals("Office", connectedWifiSsid(listOf("Office")) { error("Cached name must not replace observed name") })
    }

    @Test fun olderAndroidCanResolveOneConnectedNetworkThroughWifiManager() {
        assertEquals("Home", connectedWifiSsid(listOf(null)) { "Home" })
    }

    @Test fun ambiguousConcurrentNetworksStayUnknown() {
        assertNull(connectedWifiSsid(listOf("Home", "Office")) { error("Ambiguous networks must not use cached SSID") })
        assertNull(connectedWifiSsid(listOf("Home", null)) { error("Partially redacted networks must stay unknown") })
    }

    @Test fun multipleConnectionsWithTheSameLogicalNameKeepTheirGroup() {
        assertEquals("Home", connectedWifiSsid(listOf("Home", "Home")) { error("No fallback needed") })
    }

    @Test fun onlyOneSurroundingPairOfQuotesIsRemovedFromTheSsid() {
        assertEquals("\"Cafe\"", normalizeWifiSsid("\"\"Cafe\"\""))
        assertEquals("Cafe", normalizeWifiSsid("\"Cafe\""))
        assertEquals("Cafe", normalizeWifiSsid("Cafe"))
        assertNull(normalizeWifiSsid("\"<unknown ssid>\""))
        assertNull(normalizeWifiSsid(null))
    }
}
