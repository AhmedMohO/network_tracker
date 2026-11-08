package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.family.*
import com.anonymous.network_tracker.data.model.AppUsageItem
import com.anonymous.network_tracker.data.util.RangeUtils
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class FamilyPayloadTest {
    @Test fun unpairTombstoneRemovesOnlyItsOwnDeviceAndSurvivesDeltaMerge() {
        val a = FamilySnapshot("a", "A", "daily", 1, JSONObject(), 100)
        val b = a.copy(deviceId = "b")
        val gone = a.copy(kind = "recent", day = 0, payload = JSONObject().put("unpaired", true), updatedAt = 200)
        val merged = mergeFamilyCache(listOf(a, b), listOf(gone), 0)
        assertEquals(listOf("b"), familyChildren(merged).map { it.id })
        assertFalse(merged.any { it.deviceId == "a" && it.kind == "daily" })
        assertEquals(merged, mergeFamilyCache(merged, listOf(a), 0))
    }
    @Test fun compressedTailPreservesTotalAndNetworkSplit() {
        val apps = (1..60).map { AppUsageItem(it, "App$it", "pkg$it", it.toLong(), 2L * it, 3L * it) }
        val payload = familyPayload(apps, apps, emptyList())
        assertEquals(50, payload.getJSONArray("apps").length())
        assertEquals(165L, payload.getLong("otherBytes"))
        assertEquals(5490L, payloadApps(payload, "ALL").sumOf { it.total })
        assertEquals(1830L, payloadApps(payload, "ALL").sumOf { it.download })
        assertEquals(3660L, payloadApps(payload, "ALL").sumOf { it.upload })
        assertEquals(0L, payloadApps(payload, "WIFI").sumOf { it.total })
    }

    @Test fun legacyTodayTotalsKeepCombinedUsageWithoutInventingNetworkSplits() {
        val now = 1700000000000L
        val app = listOf(AppUsageItem(1, "App", "pkg", 100, 20, 120))
        val legacy = familyPayload(app, app, emptyList()).apply {
            remove("totals"); remove("mobileApps"); remove("wifiApps")
            put("at", now)
        }
        val totals = parseTodayTotals(FamilySnapshot("a", "Kid", "recent", 0, legacy, now), now)!!
        assertEquals(120L, totals.total)
        assertNull(totals.mobile)
        assertNull(totals.wifi)
    }

    @Test fun oldCompressedTailKeepsItsTotalButDirectionsAreUnknown() {
        val day = RangeUtils.midnight(1700000000000L)
        val payload = JSONObject("""{"apps":[{"uid":1,"dl":10,"ul":5}],"otherBytes":20}""")
        val row = FamilySnapshot("a", "Kid", "daily", day, payload, day)
        val series = buildFamilySeries(listOf(row), day, RangeUtils.midnight(day, 1))
        assertEquals(35L, series.total)
        assertFalse(series.directionsKnown)
        assertEquals(20L, buildChildAppSeries(listOf(row), -100, day, RangeUtils.midnight(day, 1)).total)
    }

    @Test fun noonToNoonFamilyRangeClipsBothDailyAndRecentCoverage() {
        val day = RangeUtils.midnight(1700000000000L)
        val next = RangeUtils.midnight(day, 1)
        val noon = day + (next - day) / 2
        val now = next + (RangeUtils.midnight(next, 1) - next) / 2
        fun payload(bytes: Long) = listOf(AppUsageItem(1, "App", "pkg", bytes, 0, bytes)).let { familyPayload(it, it, emptyList()) }
        val daily = FamilySnapshot("a", "Kid", "daily", day, payload(240), next)
        val recent = FamilySnapshot("a", "Kid", "recent", 0, payload(120).put("at", now), now)
        val series = buildFamilySeries(listOf(daily, recent), noon, now, now = now)
        assertEquals(240L, series.total)
        assertEquals(240L, series.mobile)
        assertTrue(series.apps.any { it.isEstimated })
        assertEquals(240L, buildChildAppSeries(listOf(daily, recent), 1, noon, now).total)
        assertEquals(120L, buildFamilySeries(listOf(daily, recent), day, noon).total)
        assertEquals(0L, buildFamilySeries(listOf(daily, recent), now, now + 1000).total)
    }

    @Test fun midnightHeartbeatHasNoDurationAndCannotCrashAWeeklyReport() {
        val midnight = RangeUtils.midnight(1700000000000L)
        val recent = FamilySnapshot("a", "Kid", "recent", 0,
            JSONObject("""{"apps":[{"uid":1,"dl":100,"ul":0}]}""").put("at", midnight), midnight)
        val series = buildFamilySeries(listOf(recent), RangeUtils.midnight(midnight, -6), midnight + 1000)
        assertEquals(0L, series.total)
        assertTrue(series.bins.isEmpty())
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
