package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.family.*
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.util.RangeUtils
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class FamilyPayloadTest {
    @Test fun compressedTailPreservesTotalAndNetworkSplit() {
        val apps = (1..60).map { AppUsageItem(it, "App$it", "pkg$it", it.toLong(), 0, it.toLong()) }
        val payload = familyPayload(apps, apps, emptyList())
        assertEquals(50, payload.getJSONArray("apps").length())
        assertEquals(55L, payload.getLong("otherBytes"))
        assertEquals(1830L, payloadApps(payload, "ALL").sumOf { it.total })
        assertEquals(0L, payloadApps(payload, "WIFI").sumOf { it.total })
    }

    @Test fun deltaMergeUsesNewestVersionAndRetainsSevenMonths() {
        val old = FamilySnapshot("a", "Kid", "recent", 0, JSONObject(), 100)
        val fresh = old.copy(updatedAt = 200)
        assertEquals(200L, mergeFamilyCache(listOf(fresh), listOf(old), 0).single().updatedAt)
        assertTrue(mergeFamilyCache(listOf(old), emptyList(), 101).isEmpty())
        assertEquals(fresh, FamilySnapshot.fromCacheJson(fresh.toCacheJson()))
    }

    @Test fun dailyRowsOverrideHeartbeatAndMissingDaysStayVisible() {
        val day = RangeUtils.midnight(1787131212123)
        val app = listOf(AppUsageItem(1, "Browser", "browser", 100, 0, 100))
        val daily = FamilySnapshot("a", "Kid", "daily", day, familyPayload(app, app, emptyList()), day + 1000)
        val recent = daily.copy(kind = "recent", day = 0,
            payload = familyPayload(app, app, emptyList()).put("at", day + 2000))
        val series = buildFamilySeries(listOf(daily, recent), day, RangeUtils.midnight(day, 2), "ALL", day + 3000)
        assertEquals(100L, series.total)
        assertEquals(1, series.bins.size)
        assertEquals(1, series.missingDays)
        assertNull(series.partialDay)
    }

    @Test fun parentGrantIsNotAChildCheckInAndAnsweredRequestIsQuiet() {
        val recent = FamilySnapshot("a", "Kid", "recent", 0, JSONObject(), 100)
        val grant = recent.copy(kind = "grant", updatedAt = 200)
        assertEquals(100L, familyChildren(listOf(recent, grant)).single().lastSeen)
        assertFalse(shouldNotifyRequest(25, 10, 10, null))
        assertFalse(shouldNotifyRequest(0, 10, null, null))
        assertTrue(shouldNotifyRequest(25, 10, null, null))
        assertFalse(shouldNotifyRequest(25, 10, null, 10))
    }
}
