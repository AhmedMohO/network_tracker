package com.anonymous.network_tracker

import com.anonymous.network_tracker.core.ForegroundState
import org.junit.Assert.*
import org.junit.Test

class ForegroundStateTest {
    @Test fun longSessionPersistsUntilPauseOrScreenOff() {
        val state = ForegroundState()
        state.event(1, "browser", "Main", 100)
        assertEquals("browser", state.packageName)
        state.event(7, "other", null, 1_800_000)
        assertEquals("browser", state.packageName)
        state.event(2, "browser", "Main", 1_800_001)
        assertNull(state.packageName)
        state.event(1, "video", "Main", 1_800_002)
        state.event(16, null, null, 1_800_003)
        assertNull(state.packageName)
    }

    @Test fun unrelatedPausesDoNotClearTheCurrentActivity() {
        val state = ForegroundState()
        state.event(1, "browser", "Main", 100)
        state.event(1, "video", "Main", 101)
        state.event(2, "browser", "Main", 102)
        assertEquals("video", state.packageName)
        state.event(26, null, null, 103)
        assertNull(state.packageName)
    }
}
