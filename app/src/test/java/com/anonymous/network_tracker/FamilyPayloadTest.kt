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

    @Test fun testDeviceContextAndTodayTotalsParsing() {
        val now = 1700000000000L
        val app = listOf(AppUsageItem(10, "YouTube", "com.google.android.youtube", 500, 100, 600))
        val payload = familyPayload(app, app, emptyList()).apply {
            put("at", now - 10 * 60_000L)
            put("coverage", JSONObject().put("start", now - 3600_000L).put("end", now))
            put("context", JSONObject().apply {
                put("foregroundPackage", "com.google.android.youtube")
                put("batteryPercent", 85)
                put("connection", "WIFI")
            })
        }
        val recent = FamilySnapshot("child1", "Kid Phone", "recent", 0, payload, now - 10 * 60_000L)
        val ctx = parseDeviceContext(recent, now)
        assertNotNull(ctx)
        assertEquals("com.google.android.youtube", ctx?.foregroundPackage)
        assertEquals("YouTube", ctx?.foregroundAppName)
        assertEquals(85, ctx?.batteryPercent)
        assertEquals("WIFI", ctx?.connection)
        assertFalse(ctx!!.isStale)

        val totals = parseTodayTotals(recent, now)
        assertNotNull(totals)
        assertEquals(600L, totals?.mobile)
        assertEquals(0L, totals?.wifi)
        assertEquals(600L, totals?.total)
        assertEquals(now - 3600_000L, totals?.coverageStart)
        assertEquals(now, totals?.coverageEnd)
    }

    @Test fun testChildRequestAndGrantDetection() {
        val reqPayload = JSONObject().put("askedBytes", 1024L * 1024L * 1024L).put("at", 5000L)
        val reqSnap = FamilySnapshot("c1", "Kid", "request", 0, reqPayload, 5000L)
        val pending = parseChildRequest(listOf(reqSnap))
        assertNotNull(pending)
        assertTrue(pending!!.isPending)
        assertEquals(1024L * 1024L * 1024L, pending.askedBytes)

        val grantPayload = JSONObject().put("grantedBytes", 1024L * 1024L * 1024L).put("requestAt", 5000L).put("at", 6000L)
        val grantSnap = FamilySnapshot("c1", "Kid", "grant", 0, grantPayload, 6000L)
        val answered = parseChildRequest(listOf(reqSnap, grantSnap))
        assertNotNull(answered)
        assertFalse(answered!!.isPending)
    }

    @Test fun testChildAppSeriesBuild() {
        val day1 = RangeUtils.midnight(1700000000000L)
        val day2 = RangeUtils.midnight(day1, 1)
        val app1 = listOf(AppUsageItem(42, "Signal", "org.thoughtcrime.securesms", 200, 100, 300))
        val snap1 = FamilySnapshot("c1", "Kid", "daily", day1, familyPayload(app1, app1, emptyList()), day1 + 1000)
        val app2 = listOf(AppUsageItem(42, "Signal", "org.thoughtcrime.securesms", 300, 200, 500))
        val snap2 = FamilySnapshot("c1", "Kid", "daily", day2, familyPayload(app2, app2, emptyList()), day2 + 1000)

        val appSeries = buildChildAppSeries(listOf(snap1, snap2), 42, day1, RangeUtils.midnight(day2, 1))
        assertEquals(42, appSeries.uid)
        assertEquals("Signal", appSeries.appName)
        assertEquals("org.thoughtcrime.securesms", appSeries.packageName)
        assertEquals(800L, appSeries.total)
        assertEquals(500L, appSeries.download)
        assertEquals(300L, appSeries.upload)
        assertEquals(2, appSeries.bins.size)
    }
}
