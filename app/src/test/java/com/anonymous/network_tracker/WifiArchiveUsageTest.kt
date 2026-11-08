package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.model.*
import com.anonymous.network_tracker.data.util.preserveWifiAttribution
import com.anonymous.network_tracker.data.util.archiveWifiSlices
import com.anonymous.network_tracker.data.util.DateRange
import com.anonymous.network_tracker.data.db.DailyUsageEntity
import org.junit.Assert.*
import org.junit.Test

class WifiArchiveUsageTest {
    private fun slice(ssid: String?, rx: Long, tx: Long = 0) = WifiNetworkSlice(ssid,
        listOf(AppUsageItem(10, "Browser", "app.browser", rx, tx, rx + tx, 0, rx + tx)), UsageTotals(rx, tx, rx + tx))

    @Test fun fullDayArchivedNetworkAttributionRemainsEstimated() {
        val rows = listOf(DailyUsageEntity(0, 10, "WIFI", "Home", "Browser", "app.browser", 100, 20, 40, 80, 24))
        val result = archiveWifiSlices(rows, DateRange(0, 24)).single()
        assertTrue(result.apps.single().isEstimated)
        assertEquals(120L, result.totals.total)
        assertEquals(40L, result.apps.single().foreground)
    }

    @Test fun repairingAnOldSnapshotKeepsItsSsidWhenTheSessionLogHasExpired() {
        val result = preserveWifiAttribution(listOf(slice(null, 100, 20)), listOf(slice("Home", 60, 10)))
        assertEquals(60L, result.single { it.ssid == "Home" }.totals.download)
        assertEquals(40L, result.single { it.ssid == null }.totals.download)
        assertEquals(20L, result.sumOf { it.totals.upload })
    }

    @Test fun currentSessionAttributionTakesPrecedenceOverAnOldSnapshot() {
        val fresh = listOf(slice("Cafe", 100, 20))
        val result = preserveWifiAttribution(fresh, listOf(slice("Home", 60, 10)))
        assertEquals(listOf("Cafe"), result.map { it.ssid })
        assertEquals(120L, result.single().totals.total)
    }
}
