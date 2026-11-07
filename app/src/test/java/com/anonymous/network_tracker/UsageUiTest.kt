package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.util.*
import org.junit.Assert.*
import org.junit.Test
import org.json.JSONObject

class UsageUiTest {
    @Test fun exportDistinguishesMissingStateHistoryAndIncludesTheEstimateFlag() {
        val apps = listOf(AppUsageItem(7, "Browser", null, 12, 3, 15, isEstimated = true))
        val app = JSONObject(UsageExport.toJson(apps, DateRange(0, 1000), "WIFI"))
            .getJSONArray("apps").getJSONObject(0)
        assertTrue(app.isNull("foreground"))
        assertTrue(app.isNull("background"))
        assertTrue(app.getBoolean("isEstimated"))
        assertTrue(UsageExport.toCsv(apps, DateRange(0, 1000), "WIFI").contains(",12,3,15,,,true"))
    }
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

    @Test fun cycleProjectionCalculatesRealisticPaceAndForecast() {
        // Fix reference cycle start: day 1
        val baseCycleStart = RangeUtils.cycleStart(1, 1772539200000L, 0)
        val now = baseCycleStart + 10L * RangeUtils.DAY_MS // exactly 10 days into cycle
        val cycleEnd = RangeUtils.nextCycleStart(1, now)
        val remainingDaysFraction = (cycleEnd - now).toDouble() / RangeUtils.DAY_MS

        val limit = 10_000_000_000L // 10 GB
        val used = 2_000_000_000L  // 2 GB used in 10 days -> 200 MB/day

        val projection = calculateCycleProjection(used, limit, 1, now)
        assertEquals(used, projection.usedBytes)
        assertEquals(limit, projection.limitBytes)
        assertEquals(200_000_000L, projection.dailyPaceBytes)
        val expectedRemaining = (200_000_000L * remainingDaysFraction).toLong()
        assertEquals(expectedRemaining, projection.projectedRemainingBytes)
        assertFalse(projection.willExceed)
        assertFalse(projection.isOverLimit)
        assertTrue(projection.bufferBytes > 0)
        assertEquals(limit - projection.projectedTotalBytes, projection.bufferBytes)
    }

    @Test fun cycleProjectionCircadianDampingPreventsEarlyBurstExplosion() {
        // 2 hours into a fresh cycle
        val baseCycleStart = RangeUtils.cycleStart(1, 1772539200000L, 0)
        val now = baseCycleStart + 2L * 3_600_000L // 2 hours into the cycle
        val limit = 10_000_000_000L // 10 GB limit
        val burstUsed = 100_000_000L // 100 MB burst in 2 hours

        val projection = calculateCycleProjection(burstUsed, limit, 1, now)
        // With circadian damping (effectiveElapsedDays = 1.0 day min):
        // dailyPaceBytes is capped at 100 MB / 1.0 = 100 MB/day (instead of naive 1.2 GB/day)
        assertEquals(burstUsed, projection.dailyPaceBytes)
        // Projected total will be around 3 GB, safely within 10 GB limit!
        assertFalse("Circadian damping should prevent false overage warning", projection.willExceed)
        assertTrue(projection.projectedTotalBytes < 4_000_000_000L)
    }

    @Test fun cycleProjectionDetectsOverageAndProvidesSafeAllowance() {
        // 15 days into cycle, user already burned 8 GB of 10 GB limit
        val baseCycleStart = RangeUtils.cycleStart(1, 1772539200000L, 0)
        val now = baseCycleStart + 15L * RangeUtils.DAY_MS
        val limit = 10_000_000_000L
        val used = 8_000_000_000L

        val projection = calculateCycleProjection(used, limit, 1, now)
        assertTrue("User will exceed at 8 GB in 15 days", projection.willExceed)
        assertFalse("User is not yet over the hard limit", projection.isOverLimit)
        assertTrue(projection.excessBytes > 0)
        assertTrue(projection.safeDailyAllowanceBytes > 0)
        // Safe pace must be lower than current burn rate
        assertTrue(projection.safeDailyAllowanceBytes < projection.dailyPaceBytes)
    }

    @Test fun cycleProjectionHandlesZeroUsageAndHardOverage() {
        val now = RangeUtils.midnight(1772539200000L) + 5L * RangeUtils.DAY_MS
        val limit = 10_000_000_000L

        // Zero usage
        val zeroProj = calculateCycleProjection(0L, limit, 1, now)
        assertEquals(0L, zeroProj.dailyPaceBytes)
        assertEquals(0L, zeroProj.projectedRemainingBytes)
        assertEquals(0L, zeroProj.projectedTotalBytes)
        assertFalse(zeroProj.willExceed)

        // Hard overage
        val overProj = calculateCycleProjection(12_000_000_000L, limit, 1, now)
        assertTrue(overProj.isOverLimit)
        assertTrue(overProj.willExceed)
        assertEquals(0L, overProj.remainingAllowanceBytes)
        assertEquals(0L, overProj.safeDailyAllowanceBytes)
        assertEquals(0L, overProj.bufferBytes)
    }

    @Test fun cycleProjectionScalesNearCycleEnd() {
        // 6 hours before next cycle start
        val cycleEnd = RangeUtils.nextCycleStart(1, 1772539200000L)
        val now = cycleEnd - 6L * 3_600_000L // 6 hours left
        val limit = 10_000_000_000L
        val used = 5_000_000_000L // 5 GB used so far

        val projection = calculateCycleProjection(used, limit, 1, now)
        assertEquals(1, projection.remainingDays)
        assertEquals(6, projection.remainingHours)
        // In 6 hours (0.25 day), remaining projection must be a fraction of daily pace
        val expected = (projection.dailyPaceBytes.toDouble() * (6.0 / 24.0)).toLong()
        assertEquals(expected.toDouble(), projection.projectedRemainingBytes.toDouble(), 1000.0)
    }

    @Test fun appPartitioningPreservesRemovedAppsAndTethering() {
        val normalApp = AppUsageItem(10050, "Browser", "com.browser", 100, 100, 200)
        val removedApps = AppUsageItem(-4, "Removed apps", null, 500, 500, 1000)
        val tethering = AppUsageItem(-5, "Tethering", null, 300, 300, 600)
        val systemApp = AppUsageItem(1000, "Android System", "android", 50, 50, 100)
        val root = AppUsageItem(0, "Root", null, 20, 20, 40)

        val all = listOf(normalApp, removedApps, tethering, systemApp, root)
        val (visible, hidden) = all.partition { it.uid >= 10000 || it.uid == -5 || it.uid == -4 }

        assertEquals(listOf(normalApp, removedApps, tethering), visible)
        assertEquals(listOf(systemApp, root), hidden)
    }

}
