package com.anonymous.network_tracker

import com.anonymous.network_tracker.core.VersionUtils
import org.junit.Assert.*
import org.junit.Test

class VersionUtilsTest {

    @Test
    fun testParseVersion() {
        assertEquals(listOf(1, 1, 8), VersionUtils.parse("1.1.8"))
        assertEquals(listOf(2, 0, 0), VersionUtils.parse("v2.0.0"))
        assertEquals(listOf(2, 0, 0), VersionUtils.parse("V2.0.0"))
        assertEquals(listOf(10, 2), VersionUtils.parse("10.2"))
        assertNull(VersionUtils.parse("beta-1.0"))
        assertNull(VersionUtils.parse("2.0.0-rc1"))
    }

    @Test
    fun testIsNewerVersion() {
        assertTrue(VersionUtils.isNewerVersion("v2.0.1", "2.0.0"))
        assertTrue(VersionUtils.isNewerVersion("2.1.0", "2.0.9"))
        assertTrue(VersionUtils.isNewerVersion("v2.0.0.1", "2.0.0"))
        assertTrue(VersionUtils.isNewerVersion("v3.0.0", "2.9.9"))

        assertFalse(VersionUtils.isNewerVersion("v2.0.0", "2.0.0"))
        assertFalse(VersionUtils.isNewerVersion("v1.9.9", "2.0.0"))
        assertFalse(VersionUtils.isNewerVersion("1.0.0", "2.0.0"))
        assertFalse(VersionUtils.isNewerVersion("invalid", "2.0.0"))
    }
}

