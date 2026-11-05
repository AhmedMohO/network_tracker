package com.anonymous.network_tracker

import com.anonymous.network_tracker.data.util.parseLimitGb
import org.junit.Assert.*
import org.junit.Test

class SettingsValidationTest {
    @Test fun rejectsInvalidAndOverflowingLimitsWithoutRemovingExistingQuota() {
        listOf("", "0", "-1", "NaN", "Infinity", "1e99", "words").forEach { assertNull(it, parseLimitGb(it)) }
    }
    @Test fun acceptsArabicAndEnglishDecimalLimits() {
        assertEquals(2_684_354_560L, parseLimitGb("2.5"))
        assertEquals(2_684_354_560L, parseLimitGb("٢٫٥"))
        assertEquals(2_684_354_560L, parseLimitGb("2,5"))
    }
}
