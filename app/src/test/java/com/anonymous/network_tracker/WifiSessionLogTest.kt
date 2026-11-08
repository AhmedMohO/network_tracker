package com.anonymous.network_tracker

import com.anonymous.network_tracker.service.WifiSessionLog
import com.anonymous.network_tracker.service.WifiSessions
import org.junit.Assert.*
import org.junit.Test

class WifiSessionLogTest {
    private val history = WifiSessionLog("[]", 0)

    @Test fun restartingOnTheSameNetworkDoesNotFillTheUnobservedGap() {
        history.record(3_600_000L, "Home")
        history.markSeen(4_500_000L)
        history.interrupt(5_400_000L)
        history.record(5_400_000L, "Home")
        assertEquals(listOf(
            WifiSessions.Session("Home", 3_600_000L, 4_500_000L),
            WifiSessions.Session("Home", 5_400_000L, 6_000_000L)
        ), history.sessions(0, 6_000_000L, 6_000_000L))
    }

    @Test fun restartingAfterALongOutageClosesAtTheLastObservation() {
        history.record(3_600_000L, "Home")
        history.markSeen(4_500_000L)
        history.interrupt(36_000_000L)
        assertEquals(listOf(WifiSessions.Session("Home", 3_600_000L, 4_500_000L)),
            history.sessions(0, 39_600_000L, 39_600_000L))
        assertEquals(listOf("Home"), history.knownNetworks())
    }

    @Test fun restartAfterClockRollbackCanObserveTheCurrentNetwork() {
        history.record(3_600_000L, "Home")
        history.record(7_200_000L, "Cafe")
        history.interrupt(5_400_000L)
        history.record(5_400_000L, "Office")
        assertEquals(listOf(
            WifiSessions.Session("Home", 3_600_000L, 5_400_000L),
            WifiSessions.Session("Office", 5_400_000L, 6_000_000L)
        ), history.sessions(0, 6_000_000L, 6_000_000L))
    }

    @Test fun legacyTransitionsKeepTheirNamesAndSessionBoundaries() {
        val saved = WifiSessionLog("""[{"at":3600000,"ssid":"Home"},{"at":5400000,"ssid":null}]""", 5_400_000L)
        assertEquals(listOf(WifiSessions.Session("Home", 3_600_000L, 5_400_000L)),
            saved.sessions(0, 7_200_000L, 7_200_000L))
        assertEquals(listOf("Home"), saved.knownNetworks())
    }

    @Test
    fun returningToSameNetworkPreservesTheUnobservedGap() {
        history.record(3_600_000L, "Home")
        history.record(36_000_000L, "Home")

        assertEquals(
            listOf(
                WifiSessions.Session("Home", 3_600_000L, 7_200_000L),
                WifiSessions.Session("Home", 36_000_000L, 39_600_000L)
            ),
            history.sessions(0, 39_600_000L, 39_600_000L)
        )
    }

    @Test
    fun returningOnAnotherNetworkDoesNotExtendTheOldSession() {
        history.record(3_600_000L, "Home")
        history.record(36_000_000L, "Cafe")

        assertEquals(
            listOf(
                WifiSessions.Session("Home", 3_600_000L, 7_200_000L),
                WifiSessions.Session("Cafe", 36_000_000L, 39_600_000L)
            ),
            history.sessions(0, 39_600_000L, 39_600_000L)
        )
    }

    @Test
    fun returningWithoutWifiDoesNotExtendTheOldSession() {
        history.record(3_600_000L, "Home")
        history.record(36_000_000L, null)

        assertEquals(
            listOf(WifiSessions.Session("Home", 3_600_000L, 7_200_000L)),
            history.sessions(0, 39_600_000L, 39_600_000L)
        )
    }

    @Test
    fun heartbeatWithoutANetworkNameDoesNotReviveAnExpiredSession() {
        history.record(3_600_000L, "Home")
        history.markSeen(36_000_000L)
        history.markSeen(39_600_000L)

        assertTrue(history.sessions(7_200_000L, 39_600_000L, 39_600_000L).isEmpty())
        assertEquals(39_600_000L, history.lastSeen)
    }

    @Test
    fun healthyHeartbeatsKeepAContinuousSession() {
        history.record(3_600_000L, "Home")
        history.markSeen(5_400_000L)
        history.record(7_200_000L, "Home")

        assertEquals(
            listOf(WifiSessions.Session("Home", 3_600_000L, 9_000_000L)),
            history.sessions(0, 9_000_000L, 9_000_000L)
        )
    }

    @Test
    fun normalNetworkChangesKeepTheirObservedBoundary() {
        history.record(3_600_000L, "Home")
        history.record(5_400_000L, "Cafe")

        assertEquals(
            listOf(
                WifiSessions.Session("Home", 3_600_000L, 5_400_000L),
                WifiSessions.Session("Cafe", 5_400_000L, 7_200_000L)
            ),
            history.sessions(0, 7_200_000L, 7_200_000L)
        )
    }

    @Test fun clockRollbackAcceptsTheCurrentNetworkAndDropsAmbiguousFutureTransitions() {
        history.record(3_600_000L, "Home")
        history.record(7_200_000L, "Cafe")
        history.record(5_400_000L, "Office")
        assertEquals(listOf(
            WifiSessions.Session("Home", 3_600_000L, 5_400_000L),
            WifiSessions.Session("Office", 5_400_000L, 6_000_000L)
        ), history.sessions(0, 6_000_000L, 6_000_000L))
    }

    @Test fun rollbackInsideAnUnchangedSessionDoesNotKeepItsOldFutureStart() {
        history.record(7_200_000L, "Home")
        history.record(3_600_000L, "Home")
        assertEquals(listOf(WifiSessions.Session("Home", 3_600_000L, 5_400_000L)),
            history.sessions(0, 5_400_000L, 5_400_000L))
    }

    @Test fun anUnreadableSsidClosesTheNamedSessionInsteadOfExtendingIt() {
        history.record(3_600_000L, "Home")
        history.record(5_400_000L, "Home")
        history.record(6_000_000L, null)
        history.record(6_600_000L, null)
        assertEquals(listOf(WifiSessions.Session("Home", 3_600_000L, 6_000_000L)),
            history.sessions(0, 7_200_000L, 7_200_000L))
    }
}
