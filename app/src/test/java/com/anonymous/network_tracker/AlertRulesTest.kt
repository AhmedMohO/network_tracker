package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.repository.AlertRules
import org.junit.Assert.*
import org.junit.Test

class AlertRulesTest {
    @Test fun thresholdIdentitySurvivesUpgradeAndRearmsChangedQuota() {
        assertEquals("mobile:over:123:100", AlertRules.limitKey("mobile", "over", 123, 100, 80))
        assertEquals("wifi:warn:123:100:70", AlertRules.limitKey("wifi", "warn", 123, 100, 70))
        assertNotEquals(AlertRules.limitKey("mobile", "over", 123, 100, 80),
            AlertRules.limitKey("mobile", "over", 123, 200, 80))
    }
    @Test fun keysAreBoundedToCurrentCycleAndDay() {
        val keys = setOf("mobile:warn:123:100:80", "wifi:over:1:100", "mobile:spike:2026-11-05", "mobile:spike:2026-11-04", "legacy")
        assertEquals(setOf("mobile:warn:123:100:80", "mobile:spike:2026-11-05"), AlertRules.liveKeys(keys, 123, "2026-11-05"))
    }
    @Test fun spikeUsesMedianAndNeedsFiveNonzeroBaselineDays() {
        assertTrue(AlertRules.detectSpike(listOf(100L,100,100,100,10000), 300))
        assertFalse(AlertRules.detectSpike(listOf(100L,100,100,100), 300))
        assertFalse(AlertRules.detectSpike(List(14) { 0L }, 100000))
        assertFalse(AlertRules.detectSpike(List(14) { 100L }, 299))
    }
    @Test fun watchRequiresLivenessEvenWhenKeepAliveIsOff() {
        assertTrue(AlertRules.needsWatch(false, true))
        assertTrue(AlertRules.needsWatch(true, false))
        assertFalse(AlertRules.needsWatch(false, false))
    }
    @Test fun blockedDeliveryIsRetriedAndSuccessfulDeliveryRememberedOnce() {
        val keys = mutableSetOf<String>()
        var delivered = 0
        assertFalse(AlertRules.deliverOnce(keys,"threshold", { false }, { keys.add(it) }))
        assertTrue(keys.isEmpty())
        assertTrue(AlertRules.deliverOnce(keys,"threshold", { delivered++; true }, { keys.add(it) }))
        assertFalse(AlertRules.deliverOnce(keys,"threshold", { delivered++; true }, { keys.add(it) }))
        assertEquals(1,delivered)
        assertEquals(setOf("threshold"),keys)
    }
}
