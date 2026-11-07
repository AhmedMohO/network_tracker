package com.anonymous.network_tracker

import android.content.Context
import android.content.ContextWrapper
import android.content.SharedPreferences
import androidx.test.platform.app.InstrumentationRegistry
import com.anonymous.network_tracker.service.WifiSessions
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.UUID

class WifiSessionsTest {
    private lateinit var context: Context
    private lateinit var preferences: SharedPreferences

    @Before
    fun setUp() {
        val base = InstrumentationRegistry.getInstrumentation().targetContext
        preferences = base.getSharedPreferences("wifi-session-test-${UUID.randomUUID()}", Context.MODE_PRIVATE)
        context = object : ContextWrapper(base) {
            override fun getSharedPreferences(name: String, mode: Int): SharedPreferences = preferences
        }
    }

    @After
    fun tearDown() {
        preferences.edit().clear().commit()
    }

    @Test
    fun returningToSameNetworkPreservesTheUnobservedGap() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.record(context, 36_000_000L, "Home")

        assertEquals(
            listOf(
                WifiSessions.Session("Home", 3_600_000L, 7_200_000L),
                WifiSessions.Session("Home", 36_000_000L, 39_600_000L)
            ),
            WifiSessions.sessions(context, 0, 39_600_000L, 39_600_000L)
        )
    }

    @Test
    fun returningOnAnotherNetworkDoesNotExtendTheOldSession() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.record(context, 36_000_000L, "Cafe")

        assertEquals(
            listOf(
                WifiSessions.Session("Home", 3_600_000L, 7_200_000L),
                WifiSessions.Session("Cafe", 36_000_000L, 39_600_000L)
            ),
            WifiSessions.sessions(context, 0, 39_600_000L, 39_600_000L)
        )
    }

    @Test
    fun returningWithoutWifiDoesNotExtendTheOldSession() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.record(context, 36_000_000L, null)

        assertEquals(
            listOf(WifiSessions.Session("Home", 3_600_000L, 7_200_000L)),
            WifiSessions.sessions(context, 0, 39_600_000L, 39_600_000L)
        )
    }

    @Test
    fun heartbeatWithoutANetworkNameDoesNotReviveAnExpiredSession() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.markSeen(context, 36_000_000L)
        WifiSessions.markSeen(context, 39_600_000L)

        assertTrue(WifiSessions.sessions(context, 7_200_000L, 39_600_000L, 39_600_000L).isEmpty())
        assertEquals(39_600_000L, WifiSessions.lastSeen(context))
    }

    @Test
    fun healthyHeartbeatsKeepAContinuousSession() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.markSeen(context, 5_400_000L)
        WifiSessions.record(context, 7_200_000L, "Home")

        assertEquals(
            listOf(WifiSessions.Session("Home", 3_600_000L, 9_000_000L)),
            WifiSessions.sessions(context, 0, 9_000_000L, 9_000_000L)
        )
    }

    @Test
    fun normalNetworkChangesKeepTheirObservedBoundary() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.record(context, 5_400_000L, "Cafe")

        assertEquals(
            listOf(
                WifiSessions.Session("Home", 3_600_000L, 5_400_000L),
                WifiSessions.Session("Cafe", 5_400_000L, 7_200_000L)
            ),
            WifiSessions.sessions(context, 0, 7_200_000L, 7_200_000L)
        )
    }

    @Test fun clockRollbackAcceptsTheCurrentNetworkAndDropsAmbiguousFutureTransitions() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.record(context, 7_200_000L, "Cafe")
        WifiSessions.record(context, 5_400_000L, "Office")
        assertEquals(listOf(
            WifiSessions.Session("Home", 3_600_000L, 5_400_000L),
            WifiSessions.Session("Office", 5_400_000L, 6_000_000L)
        ), WifiSessions.sessions(context, 0, 6_000_000L, 6_000_000L))
    }

    @Test fun rollbackInsideAnUnchangedSessionDoesNotKeepItsOldFutureStart() {
        WifiSessions.record(context, 7_200_000L, "Home")
        WifiSessions.record(context, 3_600_000L, "Home")
        assertEquals(listOf(WifiSessions.Session("Home", 3_600_000L, 5_400_000L)),
            WifiSessions.sessions(context, 0, 5_400_000L, 5_400_000L))
    }

    @Test fun anUnreadableSsidClosesTheNamedSessionInsteadOfExtendingIt() {
        WifiSessions.record(context, 3_600_000L, "Home")
        WifiSessions.record(context, 5_400_000L, "Home")
        WifiSessions.record(context, 6_000_000L, null)
        WifiSessions.record(context, 6_600_000L, null)
        assertEquals(listOf(WifiSessions.Session("Home", 3_600_000L, 6_000_000L)),
            WifiSessions.sessions(context, 0, 7_200_000L, 7_200_000L))
    }
}
