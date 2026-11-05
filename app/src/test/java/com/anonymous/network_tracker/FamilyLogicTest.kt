package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.family.*
import org.junit.Assert.*
import org.junit.Test

class FamilyLogicTest {
    @Test fun pairingRejectsForeignLinksAndExtractsBearerToken() {
        val token = "0123456789abcdef0123456789abcdef"
        assertEquals(Pairing(token, "Mum & Dad"), parsePairLink("nettrack://pair?t=$token&label=Mum%20%26%20Dad"))
        assertNull(parsePairLink("https://pair?t=$token"))
        assertNull(parsePairLink("nettrack://pair?t=bad"))
        assertNull(parsePairLink("nettrack://other?t=$token"))
        assertEquals(32, newFamilyId().length)
    }

    @Test fun grantsApplyOnceAndOnlyClearTheirOwnPendingRequest() {
        assertEquals(GrantOutcome(true, true, 150, 10), applyGrant(50, 10, 10, null, 100))
        assertEquals(GrantOutcome(true, false, 150, 10), applyGrant(50, 10, 10, 10, 150))
        assertEquals(GrantOutcome(false, false, 150, 10), applyGrant(50, 10, 20, 10, 150))
        assertEquals(GrantOutcome(true, false, 100, 10), applyGrant(0, 10, 10, null, 100))
    }

    @Test fun serverTimestampHandlesPostgresMicrosecondsAndUtcOffset() {
        assertEquals(1787131212123L, parseServerTimestamp("2026-08-19T09:20:12.123456+00:00"))
        assertEquals(parseServerTimestamp("2026-08-19T09:20:12Z"), parseServerTimestamp("2026-08-19T11:20:12+02:00"))
    }
}
