package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.util.*
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject

class UsageUiTest {
    @Test fun jsonExportIsAParsableDocumentAndWhitespaceCannotHideFormulas() {
        val apps = listOf(AppUsageItem(7, "  =SUM(1,2)", "a.quoted", 12, 3, 15))
        val csv = UsageExport.toCsv(apps, DateRange(0, 1000), "WIFI")
        assertTrue(csv.contains("\"'  =SUM(1,2)\""))
        assertFalse(csv.contains("\\n"))
        val json = JSONObject(UsageExport.toJson(apps, DateRange(0, 1000), "WIFI"))
        assertEquals("WIFI", json.getString("network"))
        assertEquals("  =SUM(1,2)", json.getJSONArray("apps").getJSONObject(0).getString("name"))
        assertEquals(15L, json.getJSONArray("apps").getJSONObject(0).getLong("total"))
    }
    @Test fun customRangeRejectsReversedFutureAndOverlongWindows() {
        assertNotNull(customRangeProblem(20, 10, 30))
        assertNotNull(customRangeProblem(10, 40, 30))
        assertNotNull(customRangeProblem(0, 367L * RangeUtils.DAY_MS, 400L * RangeUtils.DAY_MS))
        assertNull(customRangeProblem(10, 20, 30))
    }

    @Test fun quotaPercentageDoesNotHideOverage() {
        assertEquals(150.0, quotaPercent(150, 100), 0.001)
    }

    @Test fun exportPreservesSelectionAndEscapesUntrustedNames() {
        val apps = listOf(AppUsageItem(1, "=SUM(1,2)\"\n", "test.app", 12, 3, 15, 4, 11))
        val range = DateRange(0, 1000)
        val csv = UsageExport.toCsv(apps, range, "WIFI")
        assertTrue(csv.contains("\"'=SUM(1,2)\"\"\n\""))
        assertTrue(csv.contains(",WIFI,1970-01-01T00:00:00Z,1970-01-01T00:00:01Z,12,3,15,4,11"))
        val json = UsageExport.toJson(apps, range, "WIFI")
        assertTrue(json.contains("\"network\":\"WIFI\""))
        assertTrue(json.contains("=SUM(1,2)\\\"\\n"))
    }
}
